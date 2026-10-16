/* What the hub shows of each chapter, on the contents page's list: the sections due for a
   check and a mastery line, under each chapter card (a sibling after the card's link). The list is the map's
   mirror and works with no WebGL, so this file never loads the 3D world; it reads
   src/world/state.ts, the one pure function the map reads too.

     - "Due for a check: " and the due sections as links (the Arena's first), then one
       "Review in the Arena" link when the Arena can ask about any of them. A section only its
       page can check is listed too, linked to that section.
     - "Mastery: 2 strong · 1 building · 1 weak" (a zero part is left out), or "Mastery: not
       enough answers yet" when no section has a band.

   hubInput() builds the HubInput from the live stores (the map builds the same one); decorate
   draws it and is safe to call again (it replaces its paragraph, never adds a second).
   Nothing here writes anything. window.BMHubList is a console and test handle. */

import { hubState, type Band, type HubInput, type IsleState, type Solid } from "../world/state.ts";
import { dueSplit } from "../learn/review.ts";
import { ARENA_SECTIONS } from "../data/arena-sections.ts";

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

/** The hub's input from the live stores; null when the game layer or the event log is not
    on the page yet (the list then waits for the next change). */
export function hubInput(): HubInput | null {
  const w = window as any, C = w.BM_CURRICULUM, Game = w.BMGame, Ev = w.BMEvents, P = w.BMProgress, Site = w.BMSite;
  if (!C || !Game || typeof Game.deck !== "function" || !Ev || !P || !Site) return null;
  const list = chapters(C);
  const counts: Record<string, { solved: number; total: number }> = {};
  const medals: Record<string, number> = {};
  const solids: Record<string, Solid> = {};
  const order: Record<string, number> = {};
  let i = 0;
  list.forEach(({ ch, part }) => {
    const c = P.count(ch.id) || {};
    counts[ch.id] = { solved: c.solved || 0, total: c.total || 0 };
    try { medals[ch.id] = Game.medal(ch.id, "practice") || 0; } catch { medals[ch.id] = 0; }
    const s = w.BM_QUEST?.regions?.[part.id]?.solid;
    if (s) solids[part.id] = s;
    ch.sections.forEach((sec: any) => { order[ch.id + "#" + sec.id] = i++; });
  });
  const arena = new Set<string>(ARENA_SECTIONS);
  const rows = (Game.deck({}) || [])
    .filter((r: any) => r.id in order)
    .map((r: any) => ({ id: r.id, due: !!r.due, box: r.box, last: r.last, seen: r.seen, arena: arena.has(r.id), index: order[r.id] }));
  return {
    isles: list.map(({ ch, part }) => ({ id: ch.id, part: part.id, sections: ch.sections.map((s: any) => ch.id + "#" + s.id) })),
    counts, medals,
    due: dueSplit(rows, Site.dayKey()),
    bands: Ev.bands() as Record<string, Band>,
    solids,
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

/** the mastery words: "2 strong · 1 building · 1 weak", or the not-yet line */
export function masteryLine(m: IsleState["mastery"]): string {
  const parts: string[] = [];
  if (m.strong) parts.push(m.strong + " strong");
  if (m.building) parts.push(m.building + " building");
  if (m.weak) parts.push(m.weak + " weak");
  return parts.length ? parts.join(" · ") : "not enough answers yet";
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
    const mastery = doc.createElement("span");
    mastery.className = "stop-mastery";
    mastery.textContent = "Mastery: " + masteryLine(st.mastery);
    p.appendChild(mastery);
    li.insertBefore(p, link.nextSibling);
  });
}

/** Read the stores and draw; false when they are not all there yet. */
export function redraw(root: ParentNode = document): boolean {
  const inp = hubInput();
  if (!inp) return false;
  decorate(root, hubState(inp), inp.isles.map((s) => s.id));
  return true;
}

export const api = { decorate, hubInput, hubIds, redraw, masteryLine };

if (typeof window !== "undefined") (window as any).BMHubList = api;
