/* What a finished placement check writes into the Arena's review boxes, and what it gives
   item 15 as a prior. Decision 0003; the design is ~/.claude/plans/diagnostic-design.md, §6.

   A take is the evidence: the courses it asked, which it cleared, and each question's kind.
   A section of a cleared course is seeded into box 1 when the check asked it and every answer
   was right, or when the check did not ask it (nothing was invented about it, so it is only a
   scheduling hint); a section it asked and missed, a section of Geometry the check did not ask,
   and a section of a course cleared without being asked (implied) are seeded into box 0. A
   course not cleared or not reached seeds nothing. `last` is the day before the take, never the
   day itself: mergeGame keeps the later `last` and, on a tie, the higher box, so a seed dated
   the take's day would erase a real miss from that day. Box 1 is the most a seed gives, since
   spacing is earned in the Arena, and `n`, `ok` and `fix` are never written.

   A section the learner already has a place for (recall.ts isPlaced), or has worked on its page
   (an attempt row), is never seeded: a seed there would move its due date and the XP of its
   first Arena answer. A rushed take seeds nothing.

   `priorOf` is the same decision made without that history, so it gives the same answer before
   and after the seed has been applied. Pure: no `window`, no DOM, no storage, no clock; the day
   is the take's own and every other input is an argument. */

import type { DiagItem, DiagStore, DiagTake, Placeable, SectionRef } from "../types/state.ts";
import { DIAG_MAX_BOX } from "./constants.ts";
import { PRE, isPlaceable } from "./diagnostic.ts";
import { addDays, dayNumber, isPlaced } from "./recall.ts";

/** What a section's course is, by SKILLS: null for a container or an unknown ref. */
export type SkillOf = (ref: SectionRef) => { course: string } | null;

/** A section's seed: the box and the day it was last placed. */
export interface Seed { box: 0 | 1; last: string }

/** What the check counted on one section: every recorded answer, and the right ones. */
export interface Per { n: number; o: number }

/** What item 15 starts a section from: the seed (`b`, `l`) and the evidence (`n`, `o`). */
export interface Prior { b: 0 | 1; l: string; n: number; o: number }

const plain = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const own = (o: Record<string, unknown>, k: string): unknown => Object.hasOwn(o, k) ? o[k] : undefined;

/* ------------------------------------------------------------------- takes -- */

/** The ids of the takes in a store: each value a plain object, so a take of a later shape
    still counts. A damaged entry (null, a number, a list) and a damaged store count for
    nothing. In the order the store holds them. */
export function takesOf(diag: unknown): string[] {
  const takes = plain(diag) ? own(diag, "takes") : undefined;
  if (!plain(takes)) return [];
  return Object.keys(takes).filter((id) => plain(own(takes, id)));
}

/** Whether no take has been finished: the check has not been taken here (or by this
    account). Starting or abandoning a run is not a take. */
export function isFirst(diag: unknown): boolean {
  return takesOf(diag).length === 0;
}

/** The takes that can be read as a result, newest first: a day key that is a day, a band the
    check can place (never "beyond") and blocks that are a list. Same day, the greater id
    first, so the order is the same on every device. */
function readable(diag: unknown): DiagTake[] {
  const takes = (diag as DiagStore | undefined)?.takes as Record<string, unknown> | undefined;
  return takesOf(diag)
    .filter((id) => {
      const t = own(takes!, id) as Record<string, unknown>;
      return dayNumber(t.day) !== null && isPlaceable(t.band) && Array.isArray(t.blocks);
    })
    .sort((a, b) => {
      const da = (own(takes!, a) as DiagTake).day, db = (own(takes!, b) as DiagTake).day;
      return da < db ? 1 : da > db ? -1 : a < b ? 1 : a > b ? -1 : 0;
    })
    .map((id) => own(takes!, id) as DiagTake);
}

/** The take the result and the plan read: the latest finished one that can be read as a
    result, or null. A take of a later shape or with a "beyond" band is skipped here but
    still counted by takesOf. */
export function latestTake(diag: unknown): DiagTake | null {
  return readable(diag)[0] ?? null;
}

/* -------------------------------------------------------------------- seeds -- */

const itemsOf = (take: DiagTake): DiagItem[] =>
  (take.blocks ?? []).flatMap((b) => plain(b) && Array.isArray(b.items) ? b.items.filter(plain) as unknown as DiagItem[] : []);

/** What each asked section counted: `n` every recorded answer, `o` the right ones. A section
    asked twice (Geometry's `point-sum`) adds both. This is item 15's checkpoint input. */
export function perOf(take: DiagTake): Record<SectionRef, Per> {
  const out: Record<string, Per> = {};
  itemsOf(take).forEach((i) => {
    if (typeof i.sec !== "string") return;
    const p = Object.hasOwn(out, i.sec) ? out[i.sec] : (out[i.sec] = { n: 0, o: 0 });
    p.n++;
    if (i.k === "right") p.o++;
  });
  return out;
}

/** The courses a take cleared: those it asked and passed, and every prerequisite of a passed
    one that it did not ask (implied, never a sibling). A course it asked and did not pass is
    not cleared whatever is above it. */
function clearedOf(take: DiagTake): { asked: Set<string>; clear: Set<string>; implied: Set<string> } {
  const asked = new Set<string>(), clear = new Set<string>(), implied = new Set<string>();
  (take.blocks ?? []).forEach((b) => {
    if (!plain(b) || !isPlaceable(b.course)) return;
    asked.add(b.course);
    if (b.pass === true) clear.add(b.course);
  });
  [...clear].forEach((c) => {
    for (let p = PRE[c as Placeable]; p; p = PRE[p]) if (!asked.has(p)) implied.add(p);
  });
  return { asked, clear, implied };
}

/** The seed a take gives one section, or null: the take was rushed, the section has a place
    already (`current`) or has been worked on its page (`worked`), is a container, is not in a
    course the check placed, or is in a course not cleared. Pure: `current` is the section's
    record as it stands, `skillOf` the curriculum's (src/data/skills.ts). */
export function seedOf(
  take: DiagTake, ref: SectionRef, current: unknown, worked: boolean, skillOf: SkillOf
): Seed | null {
  if (!plain(take) || take.rushed === true || take.seeded === false) return null;
  if (worked || isPlaced(current)) return null;
  const last = addDays(take.day, -1);
  const skill = skillOf(ref);
  if (last === null || !skill || !isPlaceable(skill.course)) return null;
  const { asked, clear, implied } = clearedOf(take);
  const course = skill.course;
  if (implied.has(course)) return { box: 0, last };
  if (!clear.has(course)) return null;
  const per = perOf(take);
  if (Object.hasOwn(per, ref)) return { box: per[ref].o === per[ref].n ? (Math.min(1, DIAG_MAX_BOX) as 0 | 1) : 0, last };
  return { box: course === "geometry" ? 0 : (Math.min(1, DIAG_MAX_BOX) as 0 | 1), last };
}

/** The records to lay over `sec` for `refs`, from a take: each seeded section's existing
    record (unknown fields, `n`, `ok`, `fix` as they are) with `box` and `last` set. A section
    not seeded is absent, so applying the patch and asking again gives an empty patch.
    `worked` says whether a section has an attempt row on its page. */
export function seedPatch(
  take: DiagTake, refs: readonly SectionRef[], sec: Record<string, unknown> | undefined,
  worked: (ref: SectionRef) => boolean, skillOf: SkillOf
): Record<SectionRef, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  refs.forEach((ref) => {
    const cur = sec && Object.hasOwn(sec, ref) ? sec[ref] : undefined;
    const s = seedOf(take, ref, cur, worked(ref), skillOf);
    if (s) out[ref] = { ...(plain(cur) ? cur : {}), box: s.box, last: s.last };
  });
  return out;
}

/** Item 15's prior for a section: the seed of the newest readable take that gives one, with
    what the check counted (0 and 0 for a section it did not ask). It asks seedOf with no
    record and no work, so a seed already applied, or page work since, does not change the
    answer; whether the section's history overrides the prior is item 15's own question. */
export function priorOf(diag: unknown, ref: SectionRef, skillOf: SkillOf): Prior | null {
  for (const take of readable(diag)) {
    const s = seedOf(take, ref, undefined, false, skillOf);
    if (!s) continue;
    const per = perOf(take);
    const p = Object.hasOwn(per, ref) ? per[ref] : { n: 0, o: 0 };
    return { b: s.box, l: s.last, n: p.n, o: p.o };
  }
  return null;
}
