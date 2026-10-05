/* The "next best step": up to three things worth doing next, each with the reason it is
   there, from what the site already records. Shown on the contents page and at the top of
   each chapter (src/ui/next.ts draws it); it pays no XP of its own.

   In this order, each at most once:
     1  due reviews     the sections due for a check today (recall.ts), linked to the
                        Arena's due review when it can ask about any of them, otherwise
                        to the most overdue one's page
     2  a weak section  the one the struggle score marks weakest (game.js deck(): status
                        "shaky"), linked to a Repair run, or to its page where the Arena has
                        no problems for it
     3  continue        where the reader left off (bm.last), as the contents page's
                        Continue button has it; on a chapter page, only a place in that chapter

   Pure: everything comes in as plain data, so the tests can hand it any state. */

import { NEXT_MAX_ITEMS } from "./constants.ts";
import { dueSplit } from "./review.ts";

/** One row of BMGame.deck(): a section the reader has met well enough for the Arena. */
export interface DeckRow {
  id: string;
  status: string;
  due: boolean;
  box?: unknown;
  last?: unknown;
  /** the struggle score (BMInsights), higher is weaker */
  score?: number;
}

export interface SectionRef {
  id: string;
  /** "§3.2", or "Interlude" */
  label: string;
  title: string;
  /** from the site root: parts/…/x.html#id */
  path: string;
  chapter: string;
  /** reading order in the course */
  index: number;
}

export interface ChapterRef {
  id: string;
  /** "Chapter 3", "Interlude" */
  name: string;
  title: string;
  path: string;
  sections: ReadonlyArray<{ id: string; title: string }>;
}

export interface NextInput {
  /** today, YYYY-MM-DD */
  day: string;
  deck: readonly DeckRow[];
  /** the sections the Arena has generators for */
  arena: readonly string[];
  sections: Readonly<Record<string, SectionRef>>;
  /** in reading order */
  chapters: readonly ChapterRef[];
  /** bm.last as stored */
  last: unknown;
  /** the chapter this page is, or null off a chapter page */
  here?: string | null;
}

export type NextKind = "due" | "weak" | "continue";

export interface NextItem {
  kind: NextKind;
  /** what to do, as plain text */
  text: string;
  /** why it is offered, as plain text */
  why: string;
  /** from the site root */
  href: string;
}

const REVIEW_HREF = "arena.html?mode=review";

function name(s: SectionRef): string {
  return s.label + " " + s.title;
}

function dueItem(input: NextInput): NextItem | null {
  const arena = new Set(input.arena);
  const rows = input.deck
    .filter((r) => !!input.sections[r.id])
    .map((r) => ({ id: r.id, due: !!r.due, box: r.box, last: r.last, arena: arena.has(r.id), index: input.sections[r.id].index }));
  const split = dueSplit(rows, input.day);
  const total = split.arena.length + split.page.length;
  if (!total) return null;
  const why = "A short check after a gap helps a section stick.";
  if (split.arena.length) {
    return {
      kind: "due",
      text: total === 1 ? "1 section due for a check" : total + " sections due for a check",
      why: why + (split.page.length
        ? " The due review asks about " + (split.arena.length === 1 ? "one" : split.arena.length) + " in the Arena, with no hearts, and links to the " +
          (split.page.length === 1 ? "one" : split.page.length) + " the Arena cannot ask about."
        : " The due review asks at most two questions on each, with no hearts."),
      href: REVIEW_HREF
    };
  }
  const first = input.sections[split.page[0].id];
  return {
    kind: "due",
    text: total === 1 ? name(first) + " is due for a check" : total + " sections due for a check, starting with " + name(first),
    why: why + " The Arena has no problems for " + (total === 1 ? "this one" : "these") + " yet, so the check is on the page: its examples and exercises.",
    href: first.path
  };
}

function weakItem(input: NextInput): NextItem | null {
  const weak = input.deck
    .filter((r) => r.status === "shaky" && !!input.sections[r.id])
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || input.sections[a.id].index - input.sections[b.id].index);
  if (!weak.length) return null;
  const s = input.sections[weak[0].id];
  if (input.arena.indexOf(s.id) > -1) {
    return {
      kind: "weak", text: "Repair " + name(s),
      why: "Your answers there needed the most help of any section. Five untimed questions, with no hearts, repair it.",
      href: "arena.html?repair=" + encodeURIComponent(s.id)
    };
  }
  return {
    kind: "weak", text: "Reread " + name(s),
    why: "Your answers there needed the most help of any section, and the Arena has no problems for it yet.",
    href: s.path
  };
}

function continueItem(input: NextInput): NextItem | null {
  const last = input.last && typeof input.last === "object" ? (input.last as { id?: unknown; section?: unknown }) : null;
  const ch = last ? input.chapters.find((c) => c.id === last.id) : undefined;
  const here = input.here || null;
  /* nowhere to continue from yet: a reader who has not started has the contents page's own
     "Start with Chapter 1" button, and the card does not repeat it */
  if (!ch) return null;
  const sid = typeof last!.section === "string" ? last!.section : "";
  const sec = ch.sections.find((s) => s.id === sid);
  const anchor = sec ? "#" + sec.id : sid === "practice" || sid === "warmup" ? "#" + sid : "";
  const place = sec ? sec.title : sid === "practice" ? "Practice" : "";
  if (here) {
    /* on a chapter page the reader is already in a chapter: only a place further in this one */
    if (ch.id !== here || !anchor) return null;
    return { kind: "continue", text: "Back to " + (place || "where you were"), why: "This is where you were reading in this chapter.", href: ch.path + anchor };
  }
  return { kind: "continue", text: "Continue: " + ch.name + (place ? " · " + place : ""), why: "This is where you left off.", href: ch.path + anchor };
}

/** The card's items, in order, at most NEXT_MAX_ITEMS. */
export function nextSteps(input: NextInput): NextItem[] {
  return [dueItem(input), weakItem(input), continueItem(input)]
    .filter((x): x is NextItem => x !== null)
    .slice(0, NEXT_MAX_ITEMS);
}

/** Whether the card was put away for `day` (bm.run.v1.nextHide holds the day it was). */
export function hiddenOn(stored: unknown, day: string): boolean {
  return typeof stored === "string" && stored === day;
}
