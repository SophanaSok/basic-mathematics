/* The progress overview get_progress hands back (decision 0016, threat model T11): the rows the
   database function mcp_context sends, folded into a band, an evidence count, a box and a due
   flag per section. Every string in the result is a curriculum title or id, or authored
   text of continueTarget; nothing of the learner's own data is copied through, only numbers
   derived from it.

   A row is [id, t, d, src, sec, ref, k, ok, n, r, f, x?] (format 1). A row src/sync/events.ts
   isValid does not accept, hash included, is dropped silently.

   Only a section the curriculum has and the Arena schedules (ARENA_SECTIONS, which the
   mastery and schedule folds key on) appears. `due` follows the Arena's own deck
   (assets/game.js statusOf and deck): a section is "new", and never due, until it is met well
   enough to go under the clock: its band is weak, or it has a first-try right Arena answer
   (an "a" entry with ok = 1), or two exercises solved on its page (distinct refs with a right
   check), or a scored exercise right first time (a "c" entry, src "ex", ok = 1, try 1), or a
   checkpoint (which exists only after many Arena days). Otherwise `due` is checkDue on
   { box, last, seen } as the deck builds it; `seen` is the day of the section's latest right
   page answer, the attempt log's `solved` day. One Your-turn check alone is not enough, as on
   the site.

   `today` is a "YYYY-MM-DD" day key, the learner's local day as the page's dayKey gives it;
   a worker that cannot know the learner's zone passes the UTC day, which can shift due-ness
   by a day at the edges. `truncated` is the worker's word that it stopped before the start of
   the log (CN-3's paging), so the bands and due flags are then lower bounds.

   Total: never throws. Pure: no window, no DOM, no storage (tools/check-static.js pure-core). */

import { ARENA_SECTIONS } from "../data/arena-sections.ts";
import { chapterById, type Curriculum } from "../core/curriculum.ts";
import { bandFor } from "../learn/bands.ts";
import { masteryOf } from "../learn/mastery.ts";
import { checkDue } from "../learn/recall.ts";
import { dayKeyOf, preOf, scheduleOf } from "../learn/schedule.ts";
import { continueTarget, type ContinueChapter } from "../learn/status.ts";
import { classOf, isValid, type EventSet } from "../sync/events.ts";
import type { Overview, OverviewChapter, OverviewInput } from "./types.ts";

/** rows read at most; the database sends 6,000 */
export const ROWS_MAX = 20_000;

const ARENA = new Set<string>(ARENA_SECTIONS);

function eventSetOf(events: unknown): { V: EventSet; n: number } {
  const V: EventSet = {};
  let n = 0;
  if (!Array.isArray(events)) return { V, n };
  const rows = events.length > ROWS_MAX ? events.slice(events.length - ROWS_MAX) : events;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 11 || row.length > 12) continue;
    const id = row[0], P = row.slice(1);
    if (typeof id === "string" && isValid(id, P) && !(id in V)) { V[id] = P; n++; }
  }
  return { V, n };
}

/** "Chapter 3", "Pack A", "Interlude", as the site names a chapter (assets/site.js chapterName) */
function nameOf(label: string, beside: boolean): string {
  if (label === "Interlude") return "Interlude";
  return (beside ? "Pack " : "Chapter ") + label;
}

export function overview(input: OverviewInput, curriculum: Curriculum, today: string): Overview {
  const out: Overview = {
    chapters: [], due: 0, continue: null,
    totals: { sections: 0, strong: 0, building: 0, weak: 0, none: 0, events: 0, truncated: false }
  };
  try {
    const inp = input && typeof input === "object" ? input : ({} as OverviewInput);
    const { V, n } = eventSetOf(inp.events);
    out.totals.events = n;
    out.totals.truncated = inp.truncated === true;
    const pre = preOf(V);
    /* per section, from one pass: the latest right page day, the refs solved on the page, and
       whether an Arena first-try right or a scored first-try right exists (the deck's rule) */
    const seenDay = new Map<string, number>(), solved = new Map<string, Set<string>>();
    const arenaRight = new Set<string>(), scoredFirst = new Set<string>();
    Object.keys(V).forEach((id) => {
      const P = V[id], sec = P[3];
      if (sec === "" || P[6] !== 1) return;
      const cls = classOf(P);
      if (cls === "s") { arenaRight.add(sec); return; }
      if (cls === "p" && P[5] === "c") {
        seenDay.set(sec, Math.max(seenDay.get(sec) ?? -Infinity, P[1]));
        if (!solved.has(sec)) solved.set(sec, new Set());
        solved.get(sec)!.add(P[4]);
        if (P[2] === "ex" && P[7] === 1) scoredFirst.add(sec);
      }
    });
    const parts = curriculum && Array.isArray(curriculum.parts) ? curriculum.parts : [];
    const cont: ContinueChapter[] = [];
    for (const part of parts) {
      for (const ch of part.chapters || []) {
        const name = nameOf(String(ch.label), !!part.beside);
        cont.push({ id: ch.id, name, path: "", sections: (ch.sections || []).map((s) => ({ id: s.id, title: s.title })) });
        const secs: OverviewChapter["sections"] = [];
        for (const s of ch.sections || []) {
          const ref = ch.id + "#" + s.id;
          if (!ARENA.has(ref)) continue;
          const m = masteryOf(V, ref, pre), band = bandFor(m), sch = scheduleOf(V, ref, today, pre);
          const sd = seenDay.get(ref);
          const inDeck = band === "weak" || arenaRight.has(ref) || (solved.get(ref)?.size ?? 0) >= 2 || scoredFirst.has(ref) || !!pre.W[ref];
          const due = inDeck && checkDue({ box: sch.box, last: sch.last, seen: sd === undefined ? undefined : dayKeyOf(sd) }, today);
          secs.push({ id: s.id, title: s.title, band, evidence: m.c, box: sch.box, due });
          out.totals.sections++;
          out.totals[band]++;
          if (due) out.due++;
        }
        if (secs.length) out.chapters.push({ id: ch.id, name, sections: secs });
      }
    }
    const t = continueTarget(inp.last, cont);
    const tch = t ? chapterById(curriculum, t.chapterId) : null;
    if (t && tch) {
      // only a curriculum id leaves here, and only when the stored place equals one exactly
      const stored = inp.last && typeof inp.last === "object" ? (inp.last as { section?: unknown }).section : undefined;
      const sec = typeof stored === "string" ? (tch.sections || []).find((s) => s.id === stored) : undefined;
      out.continue = { chapterId: t.chapterId, sectionId: sec ? tch.id + "#" + sec.id : null, text: t.text, why: t.why };
    }
  } catch (e) {
    return { chapters: [], due: 0, continue: null, totals: { sections: 0, strong: 0, building: 0, weak: 0, none: 0, events: 0, truncated: false } };
  }
  return out;
}
