/* What the hub shows of each chapter, on the contents page's list: the sections due for a
   check and a mastery line, under each chapter card (a sibling after the card's link). The list is the map's
   mirror and works with no WebGL, so this file never loads the 3D world; it reads
   src/world/state.ts, the one pure function the map reads too.

     - "Due for a check: " and the due sections as links (the Arena's first), then one
       "Review in the Arena" link when the Arena can ask about any of them. A section only its
       page can check is listed too, linked to that section.
     - "Mastery: 2 strong · 1 building · 1 weak" (a zero part is left out); no line at all when
       no section of the chapter has a band.

   hubInput() builds the HubInput from the live stores (the map builds the same one); decorate
   draws it and is safe to call again (it replaces its paragraph, never adds a second).
   Nothing here writes anything. window.BMHubList is a console and test handle. */

import { hubState, type Band, type HubInput, type IsleState, type Solid } from "../world/state.ts";
import { dueSplit } from "../learn/review.ts";
import { ARENA_SECTIONS } from "../data/arena-sections.ts";
import { CHAPTER_META } from "../data/chapter-meta.ts";
import type { SectionRef } from "../types/state.ts";
import { continueTarget, labelOf, sectionStates, type SectionStatus, type StatesInput } from "../learn/status.ts";

const REVIEW_HREF = "arena.html?mode=review";

/** the chapters in reading order, as the map lays them out */
function chapters(C: any): any[] {
  const out: any[] = [];
  (C?.parts || []).forEach((p: any) => (p.chapters || []).forEach((ch: any) => out.push({ ch, part: p })));
  return out;
}

/** The ids of the chapters hubInput() lists, in order; empty when the curriculum is not there. */
export function hubIds(): string[] {
  return chapters(typeof window === "undefined" ? null : window.BM_CURRICULUM).map((x) => x.ch.id);
}

/** The hub's input from the live stores, for the list (every chapter, the packs too) or, with
    `beside: false`, for the map (only the Parts that are not beside the course: its islands).
    It never returns null: a store that is not on the page yet reads as no data (no beacons, no
    mastery, nothing solved), and the next change draws again. */
export function hubInput(opts: { beside?: boolean } = {}): HubInput {
  const w = window as any, C = w.BM_CURRICULUM, Game = w.BMGame, Ev = w.BMEvents, P = w.BMProgress, Site = w.BMSite;
  const withBeside = opts.beside !== false;
  const list = chapters(C).filter(({ part }) => withBeside || !part.beside);
  const counts: Record<string, { solved: number; total: number }> = {};
  const medals: Record<string, number> = {};
  const solids: Record<string, Solid> = {};
  const order: Record<string, number> = {};
  let i = 0;
  list.forEach(({ ch, part }) => {
    let c: any = null;
    try { c = P && typeof P.count === "function" ? P.count(ch.id) : null; } catch { c = null; }
    counts[ch.id] = { solved: (c && c.solved) || 0, total: (c && c.total) || 0 };
    try { medals[ch.id] = (Game && Game.medal(ch.id, "practice")) || 0; } catch { medals[ch.id] = 0; }
    const s = w.BM_QUEST?.regions?.[part.id]?.solid;
    if (s) solids[part.id] = s;
    (ch.sections || []).forEach((sec: any) => { order[ch.id + "#" + sec.id] = i++; });
  });
  let due: HubInput["due"] = { arena: [], page: [] };
  let bands: Record<string, Band> = {};
  try {
    const arena = new Set<string>(ARENA_SECTIONS);
    const rows = ((Game && typeof Game.deck === "function" && Game.deck({})) || [])
      .map((r: any) => ({ id: r.id, due: !!r.due, box: r.box, last: r.last, seen: r.seen, arena: arena.has(r.id), index: order[r.id] || 0 }));
    due = dueSplit(rows, Site && typeof Site.dayKey === "function" ? Site.dayKey() : undefined);
    if (Ev && typeof Ev.bands === "function") bands = Ev.bands() || {};
  } catch { /* no review data: no beacons, no mastery */ }
  return {
    isles: list.map(({ ch, part }) => ({ id: ch.id, part: part.id, sections: (ch.sections || []).map((s: any) => ch.id + "#" + s.id) })),
    counts, medals, due, bands, solids,
    calm: document.documentElement.hasAttribute("data-calm")
  };
}

/** a full section ref as the words and link a card names it by, or null (the rules of sectionNames in assets/site.js) */
function sectionName(ref: string): { text: string; href: string } | null {
  const w = window as any, C = w.BM_CURRICULUM;
  const cut = ref.indexOf("#");
  const owner = cut > -1 && C?.chapterById ? C.chapterById(ref.slice(0, cut)) : null;
  if (!owner) return null;
  const sid = ref.slice(cut + 1);
  const idx = owner.sections.findIndex((s: any) => s.id === sid);
  if (idx < 0) return null;
  const num = (owner.part?.beside ? "Pack " : "§") + owner.label + "." + (idx + 1);
  const title = owner.sections[idx].title;
  const root = w.BMSite?.rootPrefix ? w.BMSite.rootPrefix() : "";
  return { text: (owner.label === "Interlude" ? "" : num + " ") + title, href: root + owner.path + "#" + sid };
}

/** the mastery words: "2 strong · 1 building · 1 weak", or "" when no section has a band */
export function masteryLine(m: IsleState["mastery"]): string {
  const parts: string[] = [];
  if (m.strong) parts.push(m.strong + " strong");
  if (m.building) parts.push(m.building + " building");
  if (m.weak) parts.push(m.weak + " weak");
  return parts.join(" · ");
}

/** Draw states (one per chapter, in `ids` order, hubIds() by default) into the list under `root`. */
export function decorate(root: ParentNode, states: readonly IsleState[], ids: readonly string[] = hubIds()): void {
  const doc = (root as any).ownerDocument || (root as any);
  ids.forEach((id, i) => {
    const st = states[i];
    /* a sibling of the card's link, never inside it: a link in a link is not valid and not usable */
    const link = st && root.querySelector('li.stop[data-chapter="' + id + '"] .stop-link');
    const li = link && link.parentNode;
    if (!link || !li) return;
    li.querySelectorAll(".stop-hub").forEach((old: Element) => old.remove());
    const p = doc.createElement("p");
    p.className = "stop-hub";
    const due = st.due.arena.concat(st.due.page);
    if (due.length) {
      const line = doc.createElement("span");
      line.className = "stop-due";
      line.appendChild(doc.createTextNode("Due for a check: "));
      let first = true;
      due.forEach((ref) => {
        const n = sectionName(ref);
        if (!n) return;
        if (!first) line.appendChild(doc.createTextNode(", "));
        first = false;
        const a = doc.createElement("a");
        a.setAttribute("href", n.href);
        a.textContent = n.text;
        line.appendChild(a);
      });
      if (st.due.arena.length) {
        line.appendChild(doc.createTextNode(" · "));
        const r = doc.createElement("a");
        r.setAttribute("href", REVIEW_HREF);
        r.textContent = "Review in the Arena";
        line.appendChild(r);
      }
      p.appendChild(line);
    }
    /* a chapter with no evidence has no mastery line: twenty identical "not yet" lines say nothing */
    const words = masteryLine(st.mastery);
    if (words) {
      const mastery = doc.createElement("span");
      mastery.className = "stop-mastery";
      mastery.textContent = "Mastery: " + words;
      p.appendChild(mastery);
    }
    /* nothing due and no evidence: no paragraph at all */
    if (!due.length && !words) return;
    li.insertBefore(p, link.nextSibling);
  });
}

/** The input sectionStates reads, from the live stores: every section ref in reading order (the
    course, then the packs), the game layer's status, the attempt rows (BMInsights.sections(): `n`
    is the attempt count, mapped to `tries`) and the curriculum's `requires`. A store that is not on
    the page reads as no data: every section is then "Ready" or "Builds on" from the curriculum alone. */
export function sectionInput(): StatesInput {
  const w = window as any, C = w.BM_CURRICULUM, Game = w.BMGame, Ins = w.BMInsights;
  const refs: SectionRef[] = [];
  const reqs: Record<string, SectionRef[]> = {};
  chapters(C).forEach(({ ch }) => (ch.sections || []).forEach((s: any) => {
    const ref = (ch.id + "#" + s.id) as SectionRef;
    refs.push(ref);
    reqs[ref] = Array.isArray(s.requires) ? s.requires.slice() : [];
  }));
  const rows: Record<string, { solved: number; tries: number }> = {};
  try {
    ((Ins && typeof Ins.sections === "function" && Ins.sections()) || []).forEach((r: any) => {
      if (r && typeof r.id === "string") rows[r.id] = { solved: r.solved || 0, tries: r.n || 0 };
    });
  } catch { /* no attempt rows */ }
  return {
    refs,
    status: (ref) => { try { return (Game && typeof Game.sectionStatus === "function" && Game.sectionStatus(ref)) || "new"; } catch { return "new"; } },
    row: (ref) => (Object.hasOwn(rows, ref) ? rows[ref] : null),
    requires: (ref) => reqs[ref] || [],
    labelOf: (ref) => labelOf(ref, C)
  };
}

/** whether each chapter's Sections list was open at the last draw, so a redraw keeps it so */
const openState = new Map<string, boolean>();
/** hosts already listening for a Sections list opening or closing */
const watched = new WeakSet<object>();

/** Record each Sections list's open state as it changes (toggle does not bubble: capture), so a
    rebuild that destroyed the details before decorateSections could read it still restores it. */
export function watchOpen(host: any): void {
  if (!host || typeof host.addEventListener !== "function" || watched.has(host)) return;
  watched.add(host);
  host.addEventListener("toggle", (e: any) => {
    const d = e && e.target;
    if (!d || d.className !== "stop-sections") return;
    const li = d.parentNode;
    const id = li && (typeof li.getAttribute === "function" ? li.getAttribute("data-chapter") : null);
    if (id) openState.set(id, !!d.open);
  }, true);
}

const GLYPH: Record<string, [string, string]> = {
  done: ["tick", "\u2713"], started: ["reset", "\u21BB"], ready: ["next", "\u2192"], ahead: ["", "\u00B7"]
};

/** Draw the Sections list under each chapter card (after its hub line): a sibling of the card's
    link, never inside it. The words are advisory: every link works. Safe to call again. */
export function decorateSections(root: ParentNode, statuses: Record<string, SectionStatus>, ids: readonly string[] = hubIds()): void {
  const w = window as any, C = w.BM_CURRICULUM;
  const doc = (root as any).ownerDocument || (root as any);
  const prefix = w.BMSite?.rootPrefix ? w.BMSite.rootPrefix() : "";
  ids.forEach((id) => {
    const link = root.querySelector('li.stop[data-chapter="' + id + '"] .stop-link');
    const li = link && link.parentNode;
    const ch = C?.chapterById ? C.chapterById(id) : null;
    if (!link || !li) return;
    li.querySelectorAll(".stop-sections").forEach((old: any) => {
      openState.set(id, !!old.open);
      old.remove();
    });
    if (!ch || !(ch.sections || []).length) return;
    const details = doc.createElement("details");
    details.className = "stop-sections";
    if (openState.get(id)) details.open = true;
    const secs: any[] = ch.sections;
    const done = secs.filter((s) => statuses[id + "#" + s.id]?.state === "done").length;
    const summary = doc.createElement("summary");
    summary.className = "muted";
    summary.textContent = secs.length + (secs.length === 1 ? " section" : " sections") + " \u00B7 " + done + " done";
    details.appendChild(summary);
    const ol = doc.createElement("ol");
    ol.className = "stop-rows";
    secs.forEach((s) => {
      const ref = id + "#" + s.id;
      const st = statuses[ref];
      const row = doc.createElement("li");
      row.className = "stop-row";
      row.setAttribute("data-state", st ? st.state : "ready");
      const g = GLYPH[st ? st.state : "ready"];
      const glyph = doc.createElement("span");
      glyph.className = "stop-glyph";
      glyph.setAttribute("aria-hidden", "true");
      const svg = g[0] && w.BMIcon && w.BMIcon.svg ? w.BMIcon.svg(g[0]) : "";
      if (svg) glyph.innerHTML = svg; else glyph.textContent = g[1];
      row.appendChild(glyph);
      const a = doc.createElement("a");
      a.className = "stop-title";
      a.setAttribute("href", prefix + ch.path + "#" + s.id);
      a.textContent = s.title;
      row.appendChild(a);
      const state = doc.createElement("span");
      state.className = "stop-state";
      if (st && st.state === "ahead" && st.unmet.length) {
        state.appendChild(doc.createTextNode("Builds on "));
        st.unmet.forEach((r, i) => {
          if (i) state.appendChild(doc.createTextNode(", "));
          const n = sectionName(r);
          const words = labelOf(r, C) || (n ? n.text : r);
          /* a ref that names no section is plain text, never a link to nowhere */
          if (!n) { state.appendChild(doc.createTextNode(words)); return; }
          const b = doc.createElement("a");
          b.setAttribute("href", n.href);
          b.textContent = words;
          state.appendChild(b);
        });
      } else {
        state.textContent = st ? st.text : "Ready";
      }
      row.appendChild(state);
      ol.appendChild(row);
    });
    details.appendChild(ol);
    /* after the hub line when there is one, else straight after the card's link */
    const hub = li.querySelector(".stop-hub");
    li.insertBefore(details, (hub || link).nextSibling);
  });
}

/** Read the stores and draw; false when the game layer or the event log is not all there yet (a chapter
    with no evidence has no line, so drawing before they load would only draw the due part). The
    Sections lists draw regardless: with no game layer they read "Ready" or "Builds on". */
let warned = false;
export function redraw(root: ParentNode = document): boolean {
  const w = window as any;
  watchOpen(root);
  const ready = !!(w.BMGame && w.BMEvents && w.BMProgress && w.BMSite);
  const inp = hubInput();
  const ids = inp.isles.map((s) => s.id);
  if (ready) decorate(root, hubState(inp), ids);
  try { decorateSections(root, sectionStates(sectionInput()), ids); } catch (e) {
    /* the list stays as it was, but a bad curriculum entry is not silent (once per page) */
    if (!warned) { warned = true; console.warn("[BM] sections list", e); }
  }
  return ready;
}

/** per-chapter facts for the legacy scripts (assets/site.js reads this for the chapter cards) */
export const meta = CHAPTER_META;

export const api = { decorate, decorateSections, watchOpen, sectionInput, continueTarget, hubInput, hubIds, redraw, masteryLine, hubState, meta };

if (typeof window !== "undefined") (window as any).BMHubList = api;
