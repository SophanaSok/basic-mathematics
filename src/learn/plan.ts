/* The study plan: what to do next, from the latest placement take and what the learner has
   done since. Design: ~/.claude/plans/diagnostic-design.md section 8; decision 0003.

   Pure and rebuilt on every view: nothing is stored. Everything the page knows (section
   statuses, attempt rows, the outline, the packs) arrives as input, so this module reads no
   global. It returns data (refs, titles, tags), never HTML.

   Choices section 8 leaves open, taken in the simplest reading:
   - A section with a skill record in `byCourse` terms counts; containers (no record) never appear.
   - With no take there is no plan (null).
   - "Review first" leaves out sections already listed in "Start here".
   - "Coming up" drops sections that are done for the plan.
   - Once the last placeable course (Algebra 2) is done the start course stays there and
     `finished` is true; "beyond" is never a placement.
   - Already in hand lists every course below the current start course; one the learner moved
     past by working through it is treated like a cleared course.
   - Under the Geometry hold the reading sections come before the picked ones.
   - The tag "not-asked" ("not asked in the check") is new wording, not in section 8; the owner
     reviews it with D-10's and D-12's wording.
   - A "Read" section is listed when it is before the last section picked for "Start here"
     (or when fewer than PLAN_START_ITEMS sections are left). */

import type { DiagTake, Placeable, SectionRef } from "../types/state.ts";
import { ARENA_SECTIONS } from "../data/arena-sections.ts";
import { SECTION_WORK } from "../data/section-work.ts";
import { COURSE_LABELS, CONTAINERS, skillOf as realSkillOf, type Course } from "../data/skills.ts";
import { PLAN_REVIEW_ITEMS, PLAN_START_ITEMS, DIAG_HOLD_FROM } from "./constants.ts";
import { L, PRE, isPlaceable } from "./diagnostic.ts";
import { perOf } from "./diag-seed.ts";

/** A section's mark in the plan. */
export type PlanTag = "missed" | "skim-shown" | "not-asked-skim" | "not-asked-work" | "not-asked";

/** The words for each tag, for the page that draws the plan. */
export const TAG_TEXT: Readonly<Record<PlanTag, string>> = {
  "missed": "missed in the check",
  "skim-shown": "you showed this already: skim it",
  "not-asked-skim": "not asked: skim if it looks new",
  "not-asked-work": "not asked: worth working through",
  "not-asked": "not asked in the check"
};

export interface PlanPack { id: string; course: Course; title: string; href: string }
export interface PlanRow { solved: number }

export interface PlanInput {
  /** the latest readable take (latestTake), or null */
  take: DiagTake | null;
  /** the local day, echoed in the result */
  today: string;
  /** every section ref of the outline, in reading order (containers may be among them) */
  refs: readonly SectionRef[];
  /** a section's title, where the outline has one */
  titleOf?: (ref: SectionRef) => string | undefined;
  /** the section's record (src/data/skills.ts skillOf); null for a container */
  skillOf?: (ref: SectionRef) => { course: Course } | null;
  /** whether the Arena has a generator for the section (default: ARENA_SECTIONS) */
  hasGenerator?: (ref: SectionRef) => boolean;
  /** BMGame.sectionStatus: "new", "shaky" or "solid" */
  status: (ref: SectionRef) => string;
  /** the section's BMInsights.sections() row, or null/undefined when never attempted */
  row: (ref: SectionRef) => PlanRow | null | undefined;
  /** exercises per section (default SECTION_WORK); absent means 0 */
  work?: Readonly<Partial<Record<SectionRef, number>>>;
  packs: readonly PlanPack[];
}

export interface PlanItem {
  ref: SectionRef;
  title?: string;
  tag: PlanTag | null;
  /** a reading section: shown as "Read: title", not one of the places */
  read?: true;
  /** the first section under Start here: the one the page links */
  highlight?: true;
}
export interface PlanGroup {
  course: Course;
  label: string;
  /** a section count: the items listed */
  count: number;
  items: PlanItem[];
}
export interface PlanHand extends PlanGroup {
  /** "clear" was asked and cleared, "implied" was not asked, "done" the learner worked through it */
  kind: "clear" | "implied" | "done";
  /** the heading: "You can skim these." or, for an implied course, "Not asked: skim" */
  heading: string;
}

export interface Plan {
  day: string;
  /** the stored band, which never changes */
  band: Placeable;
  /** the course the plan starts in now */
  start: Placeable;
  /** whether start has moved up from the band */
  moved: boolean;
  /** "Your plan now starts in {course}" when moved, else null */
  movedNote: string | null;
  /** every section of the last placeable course is done */
  finished: boolean;
  startHere: PlanItem[];
  reviewFirst: PlanItem[];
  packs: PlanPack[];
  comingUp: PlanGroup[];
  inHand: PlanHand[];
  goingFurther: PlanItem[];
}

const GEO_UNASKED: ReadonlySet<string> = new Set([
  "interlude#logic", "interlude#quantifiers", "ch06#isometries", "ch06#symmetry"
]);

const label = (c: Course): string => COURSE_LABELS[c];

export function planOf(input: PlanInput): Plan | null {
  const take = input.take;
  if (!take) return null;
  const skillOf = input.skillOf ?? realSkillOf;
  const work = input.work ?? SECTION_WORK;
  const gen = input.hasGenerator ?? ((r: SectionRef) => ARENA_SECTIONS.includes(r));
  const per = perOf(take);
  const ws = (r: SectionRef) => (Object.hasOwn(work, r) ? work[r] ?? 0 : 0);
  const asked = (r: SectionRef) => Object.hasOwn(per, r) && per[r].n > 0;
  const missed = (r: SectionRef) => Object.hasOwn(per, r) && per[r].n > per[r].o;

  /* what the take says of each course, from the stored pass flags (never re-scored) */
  const stat: Partial<Record<Placeable, "clear" | "not-yet" | "implied">> = {};
  take.blocks.forEach((b) => { stat[b.course] = b.pass ? "clear" : "not-yet"; });
  L.forEach((c) => {
    if (stat[c] !== "clear") return;
    for (let p = PRE[c]; p; p = PRE[p]) if (stat[p] === undefined) stat[p] = "implied";
  });
  const held = stat.geometry === "clear" && DIAG_HOLD_FROM.includes(take.from);

  /* the sections that count, with their course; containers never */
  const inCourse = new Map<Course, SectionRef[]>();
  const courseOf = new Map<SectionRef, Course>();
  input.refs.forEach((r) => {
    const s = skillOf(r);
    if (!s || CONTAINERS.includes(r)) return;
    const c = s.course;
    courseOf.set(r, c);
    if (!inCourse.has(c)) inCourse.set(c, []);
    inCourse.get(c)!.push(r);
  });
  const secs = (c: Course): SectionRef[] => inCourse.get(c) ?? [];

  /* the last index in reading order with an attempt row, for the reading sections */
  const rows = new Map<SectionRef, PlanRow | null | undefined>();
  const rowOf = (r: SectionRef) => {
    if (!rows.has(r)) rows.set(r, input.row(r));
    return rows.get(r);
  };
  let lastRow = -1;
  input.refs.forEach((r, i) => { if (rowOf(r)) lastRow = i; });
  const idx = new Map<SectionRef, number>();
  input.refs.forEach((r, i) => idx.set(r, i));
  const isRead = (r: SectionRef) => !gen(r) && ws(r) === 0;
  /* memoized: BMGame.sectionStatus rebuilds every section row per call */
  const doneMemo = new Map<SectionRef, boolean>();
  const done = (r: SectionRef): boolean => {
    const known = doneMemo.get(r);
    if (known !== undefined) return known;
    let d: boolean;
    if (isRead(r)) d = lastRow > idx.get(r)!;
    else if (input.status(r) === "solid") d = true;
    else { const w = ws(r), row = rowOf(r); d = w > 0 && !!row && row.solved >= w; }
    doneMemo.set(r, d);
    return d;
  };

  const item = (r: SectionRef, tag: PlanTag | null = null): PlanItem => {
    const title = input.titleOf?.(r);
    return { ref: r, ...(title !== undefined ? { title } : {}), tag, ...(isRead(r) ? { read: true as const } : {}) };
  };
  const group = (c: Course, items: PlanItem[]): PlanGroup => ({ course: c, label: label(c), count: items.length, items });

  /* the start course: the band, moved up one while every section of it is done */
  let start: Placeable = take.band;
  let finished = false;
  for (;;) {
    /* a course with no section in the outline is not done: the walk stops there */
    if (!secs(start).length || !secs(start).every(done)) break;
    const next = L[L.indexOf(start) + 1];
    if (!next) { finished = true; break; }
    start = next;
  }

  /* Start here */
  let order = secs(start).filter((r) => !done(r));
  if (held && start === "geometry") order = [...order.filter((r) => !asked(r)), ...order.filter(asked)];
  const picked = order.filter((r) => !isRead(r)).slice(0, PLAN_START_ITEMS);
  const reading = order.filter(isRead);
  const lastPicked = picked.length >= PLAN_START_ITEMS ? Math.max(...picked.map((r) => idx.get(r)!)) : Infinity;
  const shown = new Set<SectionRef>([...picked, ...reading.filter((r) => idx.get(r)! < lastPicked)]);
  const holdOrder = held && start === "geometry";
  const startHere = (holdOrder
    ? [...reading.filter((r) => shown.has(r)), ...picked] /* unasked Geometry first, then the reading sections' own place is moot */
    : [...shown].sort((a, b) => idx.get(a)! - idx.get(b)!))
    .map((r) => item(r, isRead(r) ? null : holdOrder && !asked(r) ? "not-asked" : missed(r) ? "missed" : null));
  const first = startHere.find((i) => !i.read);
  if (first) first.highlight = true;

  /* Review first: not-right items in cleared courses, until done */
  const clearedCourse = (c: Course) => isPlaceable(c) && stat[c] === "clear";
  const inStart = new Set(startHere.map((i) => i.ref));
  const reviewFirst = input.refs
    .filter((r) => courseOf.has(r) && clearedCourse(courseOf.get(r)!) && missed(r) && !done(r) && !inStart.has(r))
    .slice(0, PLAN_REVIEW_ITEMS)
    .map((r) => item(r, "missed"));

  /* Skill packs: Pre-algebra band, or pre-algebra sections in Review first; at or below start */
  const preReview = reviewFirst.some((i) => courseOf.get(i.ref) === "pre-algebra");
  const packs = input.packs.length && (take.band === "pre-algebra" || preReview)
    ? input.packs
      .map((p) => ({ p, at: isPlaceable(p.course) ? L.indexOf(p.course) : -1 }))
      .filter((x) => x.at >= 0 && x.at <= L.indexOf(start))
      .sort((a, b) => a.at - b.at)
      .map((x) => x.p)
    : [];

  /* Coming up: courses above start, with the shown-already mark where the check cleared them */
  const comingUp = L.slice(L.indexOf(start) + 1).map((c) => group(c, secs(c).filter((r) => !done(r)).map((r) =>
    item(r, stat[c] === "clear" && asked(r) ? "skim-shown" : null))));

  /* Already in hand: every course below start */
  const inHand: PlanHand[] = L.slice(0, L.indexOf(start)).map((c) => {
    const s = stat[c];
    const kind = s === "clear" ? "clear" : s === "implied" ? "implied" : "done";
    const tagOf = (r: SectionRef): PlanTag | null => {
      if (kind === "implied") return "not-asked-skim";
      if (c === "geometry" && kind === "clear" && GEO_UNASKED.has(r)) return "not-asked-work";
      return !gen(r) ? "not-asked-skim" : null;
    };
    const g = group(c, secs(c).map((r) => item(r, tagOf(r))));
    return { ...g, kind, heading: kind === "implied" ? "Not asked: skim" : "You can skim these." };
  });

  const goingFurther = secs("beyond").map((r) => item(r));

  return {
    day: input.today, band: take.band, start, moved: start !== take.band,
    movedNote: start !== take.band ? `Your plan now starts in ${label(start)}` : null,
    finished, startHere, reviewFirst, packs: [...packs], comingUp, inHand, goingFurther
  };
}
