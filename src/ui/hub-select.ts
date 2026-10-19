/* The contents page's one selected chapter, shared by the List and the Map.

     - It lives in location.hash ("#ch03", "#ch03.one-unknown": hubHash / parseHubHash in
       src/core/hub.ts) so a reload and a chapter page's "All chapters" link keep it. Writing
       it uses history.replaceState, never pushState: choosing a chapter adds no history entry.
     - set() marks li.stop[data-selected] on that chapter (one at a time) and dispatches a
       bm:hub-select CustomEvent on [data-course-index] with {chapter, section, how}; the map
       (assets/map3d.js) listens, and passes how "map" for its own choices so it is not told
       about them again.
     - apply(how) reads the hash and marks the card. In List view, on "load" or "return", it
       focuses the card's link without scrolling and then scrolls the card to the middle
       (smooth only when BMFx.still() is false). It never scrolls in Map view: the map frames
       the island instead. No li.stop has an id equal to a chapter id, or the browser would
       scroll to it natively.
     - The mark is drawn again on the "home" bus event (buildHome rewrites the list) and the
       hash is read again on hashchange (a learner editing the URL).

   Mounted once the page's scripts have run (as hub-mode.ts is). window.BMHubSelect is also
   what map3d.js reads. current() needs only the curriculum, not the mount. */

import { hubHash, parseHubHash, type HubSelection } from "../core/hub.ts";

let listening = false;
let memory: HubSelection | null = null;

function w(): any { return window as any; }

function host(): HTMLElement | null { return document.querySelector<HTMLElement>("[data-course-index]"); }

function read(): HubSelection | null {
  try { return parseHubHash(location.hash, w().BM_CURRICULUM); } catch { return null; }
}

/** the parsed selection (from the hash), or null */
export function current(): HubSelection | null {
  memory = read();
  return memory;
}

function mark(sel: HubSelection | null): HTMLElement | null {
  const h = host();
  if (!h) return null;
  let found: HTMLElement | null = null;
  h.querySelectorAll<HTMLElement>("li.stop").forEach((li) => {
    if (sel && li.getAttribute("data-chapter") === sel.chapter) { li.setAttribute("data-selected", ""); found = li; }
    else li.removeAttribute("data-selected");
  });
  return found;
}

function listView(): boolean {
  try { const m = w().BMMap3D; return !m.on() && !!m.why(); } catch { return true; }
}

function still(): boolean {
  try { return !!w().BMFx.still(); } catch { return false; }
}

/** read the hash again and mark the card; in List view, on a load or a return, bring it into view */
export function apply(how?: string): void {
  const sel = current();
  const li = mark(sel);
  if (!li || (how !== "load" && how !== "return") || !listView()) return;
  const a = li.querySelector<HTMLElement>(".stop-link");
  if (!a) return;
  try { a.focus({ preventScroll: true }); } catch { a.focus(); }
  try { li.scrollIntoView({ block: "center", behavior: still() ? "auto" : "smooth" }); } catch { /* the page stays where it is */ }
}

function tell(sel: HubSelection, how: string): void {
  const h = host();
  if (h) h.dispatchEvent(new CustomEvent("bm:hub-select", { detail: { chapter: sel.chapter, section: sel.section, how } }));
}

/** choose a chapter (and optionally a section of it): hash, mark and event */
export function set(chapterId: string, section?: string | null, how?: string): void {
  const sel = parseHubHash("#" + chapterId + (section ? "." + section : ""), w().BM_CURRICULUM);
  if (!sel) return;
  memory = sel;
  const next = hubHash(sel);
  if (location.hash !== next) {
    try { history.replaceState(history.state, "", location.pathname + location.search + next); } catch { /* the mark still moves */ }
  }
  mark(sel);
  tell(sel, how || "set");
}

function mount(): void {
  if (!host() || !w().BMStore || listening) return;
  listening = true;
  w().BMStore.on((c: { type?: string }) => { if (c && c.type === "home") mark(read()); });
  window.addEventListener("hashchange", () => {
    apply("hash");
    const sel = read();
    if (sel) tell(sel, "hash");
  });
  apply("load");
}

export const api = { current, set, apply };

if (typeof window !== "undefined" && typeof document !== "undefined") {
  (window as any).BMHubSelect = api;
  let done = false;
  const go = () => { if (!done) { done = true; try { mount(); } catch { /* the page does without */ } } };
  if (document.readyState === "complete") setTimeout(go, 0);
  else {
    document.addEventListener("DOMContentLoaded", go);
    window.addEventListener("load", go);
  }
}
