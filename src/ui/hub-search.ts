/* The contents page's search: one field in the head, shared by the List and the Map. It filters
   the course list under the map (the Map's islands read the same list, so a hidden card changes
   nothing there: assets/map3d.js currentId and linkFor query li.stop in the DOM, hidden or not).

   Two halves in one file. The pure half (targets, match) has no window or document: targets
   turns the curriculum into one Target per chapter and per section, match ranks a query over
   them with src/ui/palette.ts rank and says which cards and rows stay. The DOM half fills
   [data-hub-search] (index.html):

     - typing (80 ms debounce) hides the cards and rows that do not match, and a Part with no
       card left; a card whose rows are filtered has its Sections opened, and the open state it
       had is put back when the query clears (hub-list.ts remembers its own across redraws);
     - [data-hub-count] says "4 chapters, 7 sections match", "No match", or nothing;
     - Escape clears the field; Enter goes to the top hit: BMHubSelect.set(chapter, section,
       "search") when a sibling card has put that up, else focus on the hit's link.
     - the list is drawn again by site.js and hub-list.ts: the query is applied again after.

   window.BMHubSearch is a test handle. */

import type { Curriculum, Chapter } from "../core/curriculum.ts";
import type { ChapterId, SectionRef } from "../types/state.ts";
import { rank, type Target } from "./palette.ts";

export interface HubTarget extends Target {
  chapter: ChapterId;
  section?: SectionRef;
}

export interface Matched {
  chapters: Set<ChapterId>;
  sections: Set<SectionRef>;
}

/** how the cards name a chapter: "Chapter 3", "Pack A", "Interlude" */
function nameOf(ch: Chapter): string {
  if (ch.label === "Interlude") return "Interlude";
  return (ch.part && ch.part.beside ? "Pack " : "Chapter ") + ch.label;
}

/** every chapter, then each of its sections, in reading order */
export function targets(c: Curriculum | null | undefined): HubTarget[] {
  const out: HubTarget[] = [];
  const parts = c && Array.isArray(c.parts) ? c.parts : [];
  for (const part of parts) {
    for (const raw of part.chapters || []) {
      const ch: Chapter = raw.part ? raw : { ...raw, part };
      const path = ch.path || "";
      out.push({ kind: "chapter", label: nameOf(ch) + " " + ch.title, hint: part.name, href: path, chapter: ch.id });
      (ch.sections || []).forEach((sec, i) => {
        const num = ch.label === "Interlude" ? "" : (part.beside ? "Pack " : "§") + ch.label + "." + (i + 1) + " · ";
        out.push({
          kind: "section", label: sec.title, hint: num + nameOf(ch),
          href: path + "#" + sec.id, chapter: ch.id, section: (ch.id + "#" + sec.id) as SectionRef
        });
      });
    }
  }
  return out;
}

/* rank also offers letters-in-order matches ("linear" inside a long title), which is a fine
   order for a palette and noise for a filter: a hit stays only when the words are in its label or
   hint, or when the query is the number of a chapter ("3", "ch3", "chapter 3") */
function plain(t: HubTarget, q: string): boolean {
  if (t.label.toLowerCase().includes(q) || (t.hint || "").toLowerCase().includes(q)) return true;
  return t.kind === "chapter" && /^(ch(apter)? ?)?\d+$/.test(q);
}

/** which cards and rows a query keeps; a chapter hit keeps its card and all its rows, a section
    hit its card and that row, an empty query everything */
export function match(query: string, all: HubTarget[]): Matched {
  const res: Matched = { chapters: new Set(), sections: new Set() };
  if (!(query || "").trim()) {
    for (const t of all) {
      res.chapters.add(t.chapter);
      if (t.section) res.sections.add(t.section);
    }
    return res;
  }
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  for (const h of rank(query, all, all.length + 1) as HubTarget[]) {
    if (!plain(h, q)) continue;
    res.chapters.add(h.chapter);
    if (h.section) res.sections.add(h.section);
    else for (const t of all) if (t.section && t.chapter === h.chapter) res.sections.add(t.section);
  }
  return res;
}

/** "4 chapters, 7 sections match", "No match", or "" for an empty query */
export function countText(query: string, m: Matched): string {
  if (!(query || "").trim()) return "";
  if (!m.chapters.size) return "No match";
  const n = m.chapters.size, s = m.sections.size;
  return n + (n === 1 ? " chapter, " : " chapters, ") + s + (s === 1 ? " section" : " sections") + " match";
}

/* ------------------------------------------------------------------ the DOM half ---- */

let form: HTMLFormElement | null = null;
let input: HTMLInputElement | null = null;
let status: HTMLElement | null = null;
let all: HubTarget[] = [];
let timer = 0;
let redrawTimer = 0;
/* the open state a card's Sections had before a query opened it */
const saved = new Map<string, boolean>();

function w(): any { return window as any; }

function apply(): void {
  if (!input) return;
  const host = document.querySelector("[data-course-index]");
  if (!host) return;
  if (!all.length) all = targets(w().BM_CURRICULUM);
  const q = input.value;
  const m = match(q, all);
  const filtering = !!q.trim();
  host.querySelectorAll<HTMLElement>("li.stop").forEach((li) => {
    const id = li.getAttribute("data-chapter") || "";
    const keep = m.chapters.has(id);
    li.hidden = !keep;
    const details = li.querySelector<HTMLDetailsElement>("details.stop-sections");
    let partial = false;
    li.querySelectorAll<HTMLElement>("li.stop-row").forEach((row) => {
      const ref = (id + "#" + sectionId(row)) as SectionRef;
      const rowKeep = m.sections.has(ref);
      row.hidden = !rowKeep;
      if (!rowKeep) partial = true;
    });
    if (!details) return;
    if (filtering && keep && partial) {
      if (!saved.has(id)) saved.set(id, details.open);
      details.open = true;
    } else if (saved.has(id)) {
      details.open = !!saved.get(id);
      saved.delete(id);
    }
  });
  host.querySelectorAll<HTMLElement>("section.part").forEach((p) => {
    p.hidden = !Array.from(p.querySelectorAll("li.stop")).some((li) => !(li as HTMLElement).hidden);
  });
  if (status) status.textContent = countText(q, m);
}

/** the section id a row stands for: the fragment of its title link */
function sectionId(row: Element): string {
  const a = row.querySelector("a.stop-title");
  const href = (a && a.getAttribute("href")) || "";
  const cut = href.indexOf("#");
  return cut > -1 ? href.slice(cut + 1) : "";
}

function later(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(apply, 80);
}

function set(q: string): void {
  if (!input) return;
  window.clearTimeout(timer);
  input.value = q;
  apply();
}

function go(): void {
  if (!input || !input.value.trim()) return;
  window.clearTimeout(timer);
  apply();
  if (!all.length) all = targets(w().BM_CURRICULUM);
  const hit = rank(input.value, all, 1)[0] as HubTarget | undefined;
  if (!hit) return;
  const sel = w().BMHubSelect;
  if (sel && typeof sel.set === "function") {
    const sid = hit.section ? hit.section.slice(hit.section.indexOf("#") + 1) : undefined;
    sel.set(hit.chapter, sid, "search");
    return;
  }
  const li = document.querySelector('li.stop[data-chapter="' + hit.chapter + '"]');
  let a: HTMLElement | null = null;
  if (hit.section) {
    const sid = hit.section.slice(hit.section.indexOf("#") + 1);
    a = li && Array.from(li.querySelectorAll<HTMLElement>("li.stop-row a.stop-title"))
      .find((x) => (x.getAttribute("href") || "").endsWith("#" + sid)) || null;
  }
  a = a || (li && li.querySelector<HTMLElement>("a.stop-link"));
  if (!a) return;
  try { a.focus({ preventScroll: true }); } catch { a.focus(); }
  a.scrollIntoView({ block: "center" });
}

function mount(): void {
  form = document.querySelector<HTMLFormElement>("[data-hub-search]");
  if (!form || input) return;
  input = form.querySelector("input");
  status = form.querySelector("[data-hub-count]");
  if (!input) return;
  input.addEventListener("input", later);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && input!.value) { e.preventDefault(); e.stopPropagation(); set(""); }
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); go(); });
  const host = document.querySelector("[data-course-index]");
  /* site.js and hub-list.ts draw the list again; the query is put back over the new one */
  if (host && typeof MutationObserver !== "undefined") {
    new MutationObserver(() => {
      window.clearTimeout(redrawTimer);
      redrawTimer = window.setTimeout(() => { if (input && input.value.trim()) apply(); }, 60);
    }).observe(host, { childList: true, subtree: true });
  }
  if (input.value.trim()) apply();
}

export const api = {
  query: (): string => (input ? input.value : ""),
  set,
  results: () => {
    const m = match(input ? input.value : "", all.length ? all : (all = targets(w().BM_CURRICULUM)));
    return { chapters: Array.from(m.chapters), sections: Array.from(m.sections), text: status ? status.textContent : "" };
  }
};

if (typeof window !== "undefined" && typeof document !== "undefined") {
  (window as any).BMHubSearch = api;
  let done = false;
  const start = () => { if (!done) { done = true; try { mount(); } catch { /* the page does without */ } } };
  if (document.readyState === "complete") setTimeout(start, 0);
  else {
    document.addEventListener("DOMContentLoaded", start);
    window.addEventListener("load", start);
  }
}
