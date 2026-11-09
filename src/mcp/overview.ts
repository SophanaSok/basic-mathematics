/* The progress overview get_progress hands back (decision 0016, threat model T11): the rows the
   database function mcp_context sends, folded into a band, an evidence count, a box and a due
   flag per section. Every string in the result is a curriculum title or id, or authored
   text of continueTarget; nothing of the learner's own data is copied through, only numbers
   derived from it.

   A row is [id, t, d, src, sec, ref, k, ok, n, r, f, x?] (format 1). A row src/sync/events.ts
   isValid does not accept, hash included, is dropped silently.

   Only a section the curriculum has and the Arena schedules (ARENA_SECTIONS, which the
   mastery and schedule folds key on) appears. `due` is checkDue on { box, last, seen }, as the
   site's due review builds it, for a section with a place in the schedule or a page solve
   (a section never touched is not due); `seen` is the day of the section's latest right
   answer on its page (a class "p" entry with ok = 1), the attempt log's `solved` day.

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
    const seenDay = new Map<string, number>();
    Object.keys(V).forEach((id) => {
      const P = V[id];
      if (classOf(P) === "p" && P[6] === 1 && P[3] !== "") seenDay.set(P[3], Math.max(seenDay.get(P[3]) ?? -Infinity, P[1]));
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
          const touched = sch.last !== undefined || sd !== undefined;
          const due = touched && checkDue({ box: sch.box, last: sch.last, seen: sd === undefined ? undefined : dayKeyOf(sd) }, today);
          secs.push({ id: s.id, title: s.title, band, evidence: m.c, box: sch.box, due });
          out.totals.sections++;
          out.totals[band]++;
          if (due) out.due++;
        }
        if (secs.length) out.chapters.push({ id: ch.id, name, sections: secs });
      }
    }
    const t = continueTarget(inp.last, cont);
    if (t && chapterById(curriculum, t.chapterId)) out.continue = { chapterId: t.chapterId, text: t.text, why: t.why };
  } catch (e) {
    return { chapters: [], due: 0, continue: null, totals: { sections: 0, strong: 0, building: 0, weak: 0, none: 0, events: 0, truncated: false } };
  }
  return out;
}
