/* Where each section stands, for the Plain and Explore navigation: the one "done" rule the
   plan uses, a four-word state for every section, the labels that name a section to a reader,
   and the one place that resolves "continue".

   Pure: everything the page knows arrives as input. The words are advisory, never a lock:
   "Builds on ..." says what comes before, and the reader may go anywhere. */

import { ARENA_SECTIONS } from "../data/arena-sections.ts";
import { SECTION_WORK } from "../data/section-work.ts";
import { chapterById, type Curriculum } from "../core/curriculum.ts";
import type { ChapterId, SectionRef } from "../types/state.ts";

export interface PlanRow { solved: number; tries?: number }

/** What the done rule reads, built from the plan's input fields. */
export interface DoneContext {
  /** every section ref of the outline, in reading order */
  refs: readonly SectionRef[];
  /** BMGame.sectionStatus: "new", "shaky" or "solid" */
  status: (ref: SectionRef) => string;
  /** the section's attempt row, or null/undefined when never attempted */
  row: (ref: SectionRef) => PlanRow | null | undefined;
  /** exercises per section (default SECTION_WORK); absent means 0 */
  work?: Readonly<Partial<Record<SectionRef, number>>>;
  /** whether the Arena has a generator for the section (default: ARENA_SECTIONS) */
  hasGenerator?: (ref: SectionRef) => boolean;
}

interface Resolved {
  done: (ref: SectionRef) => boolean;
  isRead: (ref: SectionRef) => boolean;
}

function resolve(ctx: DoneContext): Resolved {
  const work = ctx.work ?? SECTION_WORK;
  const gen = ctx.hasGenerator ?? ((r: SectionRef) => ARENA_SECTIONS.includes(r));
  const ws = (r: SectionRef) => (Object.hasOwn(work, r) ? work[r] ?? 0 : 0);
  const rows = new Map<SectionRef, PlanRow | null | undefined>();
  const rowOf = (r: SectionRef) => {
    if (!rows.has(r)) rows.set(r, ctx.row(r));
    return rows.get(r);
  };
  /* the last index in reading order with an attempt row, for the reading sections */
  let lastRow = -1;
  const idx = new Map<SectionRef, number>();
  ctx.refs.forEach((r, i) => { idx.set(r, i); if (rowOf(r)) lastRow = i; });
  const isRead = (r: SectionRef) => !gen(r) && ws(r) === 0;
  /* memoized: BMGame.sectionStatus rebuilds every section row per call */
  const memo = new Map<SectionRef, boolean>();
  const done = (r: SectionRef): boolean => {
    const known = memo.get(r);
    if (known !== undefined) return known;
    let d: boolean;
    if (isRead(r)) d = lastRow > (idx.get(r) ?? Infinity);
    else if (ctx.status(r) === "solid") d = true;
    else { const w = ws(r), row = rowOf(r); d = w > 0 && !!row && row.solved >= w; }
    memo.set(r, d);
    return d;
  };
  return { done, isRead };
}

const resolved = new WeakMap<DoneContext, Resolved>();
function of(ctx: DoneContext): Resolved {
  let r = resolved.get(ctx);
  if (!r) { r = resolve(ctx); resolved.set(ctx, r); }
  return r;
}

/** Whether a section is done for the plan: a reading-only section (no Arena generator and no
    exercises) once a later section in reading order has an attempt row; any other when it is
    solid or every exercise is solved. Memoized per context object. */
export function doneForPlan(ctx: DoneContext, ref: SectionRef): boolean {
  return of(ctx).done(ref);
}

/** Whether a section is reading only (no Arena generator, no exercises). */
export function isReadOnly(ctx: DoneContext, ref: SectionRef): boolean {
  return of(ctx).isRead(ref);
}

export type SectionState = "done" | "started" | "ready" | "ahead";

export interface SectionStatus {
  ref: SectionRef;
  state: SectionState;
  /** the learner-facing word */
  text: string;
  /** the sections this one builds on */
  buildsOn: SectionRef[];
  /** those not done yet */
  unmet: SectionRef[];
}

export interface StatesInput extends DoneContext {
  /** the sections a section builds on (data/curriculum.js `requires`) */
  requires: (ref: SectionRef) => readonly SectionRef[];
  /** a section's label, for "Builds on ..."; default: the ref itself */
  labelOf?: (ref: SectionRef) => string;
  titleOf?: (ref: SectionRef) => string | undefined;
}

/** The state of every section in `refs`. */
export function sectionStates(input: StatesInput): Record<SectionRef, SectionStatus> {
  const out = {} as Record<SectionRef, SectionStatus>;
  const lab = input.labelOf ?? ((r: SectionRef) => {
    const t = input.titleOf?.(r);
    return t ? t : r;
  });
  input.refs.forEach((ref) => {
    const buildsOn = [...input.requires(ref)];
    const unmet = buildsOn.filter((r) => !doneForPlan(input, r));
    const row = input.row(ref);
    let state: SectionState;
    let text: string;
    if (doneForPlan(input, ref)) { state = "done"; text = "Done"; }
    else if (row && (row.solved > 0 || (row.tries ?? 0) > 0)) { state = "started"; text = "In progress"; }
    else if (!unmet.length) { state = "ready"; text = "Ready"; }
    else {
      state = "ahead";
      text = "Builds on " + lab(unmet[0]) + (unmet.length > 1 ? " and " + (unmet.length - 1) + " more" : "");
    }
    out[ref] = { ref, state, text, buildsOn, unmet };
  });
  return out;
}

/** A section named for a reader: "§2.3 One unknown", "Pack A.1 Ratios and rates", the
    Interlude's sections by title alone; "" when unknown. */
export function labelOf(ref: SectionRef, curriculum: Curriculum | null | undefined): string {
  const at = ref.indexOf("#");
  if (at < 0) return "";
  const ch = chapterById(curriculum, ref.slice(0, at));
  if (!ch) return "";
  const i = ch.sections.findIndex((s) => s.id === ref.slice(at + 1));
  if (i < 0) return "";
  const title = ch.sections[i].title;
  const part = (curriculum?.parts ?? []).find((p) => p.chapters.includes(ch));
  if (part?.beside) return "Pack " + ch.label + "." + (i + 1) + " " + title;
  if (!/^\d+$/.test(ch.label)) return title;
  return "§" + ch.label + "." + (i + 1) + " " + title;
}

/** The other chapters this chapter's sections build on, in curriculum order, once each. */
export function chapterRequires(curriculum: Curriculum, chapterId: ChapterId): ChapterId[] {
  const ch = chapterById(curriculum, chapterId);
  if (!ch) return [];
  const named = new Set<string>();
  ch.sections.forEach((s) => (s.requires ?? []).forEach((r) => {
    const id = r.split("#")[0];
    if (id !== chapterId) named.add(id);
  }));
  const out: ChapterId[] = [];
  curriculum.parts.forEach((p) => p.chapters.forEach((c) => { if (named.has(c.id)) out.push(c.id); }));
  return out;
}

/** The chapter shape continueTarget reads (next.ts ChapterRef fits it). */
export interface ContinueChapter {
  id: string;
  /** "Chapter 3", "Interlude" */
  name: string;
  path: string;
  sections: ReadonlyArray<{ id: string; title: string }>;
}

export interface ContinueTarget {
  chapterId: string;
  href: string;
  text: string;
  why: string;
}

/** Where the reader left off (bm.last as stored): the chapter and place, or null with
    nowhere to continue from. On a chapter page (`here`), only a place further in that chapter. */
export function continueTarget(
  last: unknown,
  chapters: readonly ContinueChapter[],
  packs?: readonly ContinueChapter[],
  here?: string | null
): ContinueTarget | null {
  const l = last && typeof last === "object" ? (last as { id?: unknown; section?: unknown }) : null;
  const ch = l ? chapters.find((c) => c.id === l.id) ?? (packs || []).find((c) => c.id === l.id) : undefined;
  /* nowhere to continue from yet: a reader who has not started has the contents page's own
     "Start with Chapter 1" button, and the card does not repeat it */
  if (!ch) return null;
  const sid = typeof l!.section === "string" ? l!.section : "";
  const sec = ch.sections.find((s) => s.id === sid);
  const anchor = sec ? "#" + sec.id : sid === "practice" || sid === "warmup" ? "#" + sid : "";
  const place = sec ? sec.title : sid === "practice" ? "Practice" : "";
  if (here) {
    if (ch.id !== here || !anchor) return null;
    return { chapterId: ch.id, text: "Back to " + (place || "where you were"), why: "This is where you were reading in this chapter.", href: ch.path + anchor };
  }
  return { chapterId: ch.id, text: "Continue: " + ch.name + (place ? " · " + place : ""), why: "This is where you left off.", href: ch.path + anchor };
}
