import { describe, expect, it } from "vitest";
import { NEXT_MAX_ITEMS } from "./constants.ts";
import { addDays } from "./recall.ts";
import { hiddenOn, nextSteps, type ChapterRef, type DeckRow, type NextInput, type SectionRef } from "./next.ts";

const D = "2026-10-05";

/* a small course: two chapters, the Arena able to ask about three sections */
const chapters: ChapterRef[] = [
  { id: "ch01", name: "Chapter 1", title: "Numbers", path: "parts/1/01.html", sections: [{ id: "integers", title: "The integers" }, { id: "addition", title: "Addition" }] },
  { id: "ch02", name: "Chapter 2", title: "Equations", path: "parts/1/02.html", sections: [{ id: "one", title: "One unknown" }, { id: "two", title: "Two unknowns" }] }
];
const sections: Record<string, SectionRef> = {};
let n = 0;
chapters.forEach((ch, c) => ch.sections.forEach((s, i) => {
  sections[ch.id + "#" + s.id] = { id: ch.id + "#" + s.id, label: "§" + (c + 1) + "." + (i + 1), title: s.title, path: ch.path + "#" + s.id, chapter: ch.id, index: n++ };
}));
const arena = ["ch01#addition", "ch02#one", "ch02#two"];

function state(deck: DeckRow[], extra?: Partial<NextInput>): NextInput {
  return Object.assign({ day: D, deck, arena, sections, chapters, last: null, here: null }, extra || {});
}
const placed = (id: string, box: number, ago: number, more?: Partial<DeckRow>): DeckRow =>
  Object.assign({ id, status: "solid", due: ago >= [1, 3, 7, 14, 30][box], box, last: addDays(D, -ago) }, more || {});

describe("the next best step", () => {
  it("puts due reviews first, linked to the Arena's due review, saying why", () => {
    const items = nextSteps(state([placed("ch01#addition", 0, 3), placed("ch02#one", 1, 9), placed("ch02#two", 2, 1)], { last: { id: "ch02", section: "one" } }));
    expect(items.map((i) => i.kind)).toEqual(["due", "continue"]);
    expect(items[0]).toMatchObject({ text: "2 sections due for a check", href: "arena.html?mode=review" });
    expect(items[0].why.length).toBeGreaterThan(10);
  });

  it("says one section plainly, and why the due review is short", () => {
    const one = nextSteps(state([placed("ch02#one", 1, 3)]));
    expect(one[0]).toMatchObject({ kind: "due", text: "1 section due for a check", href: "arena.html?mode=review" });
    expect(one[0].why).toBe("A short check after a gap helps a section stick. The due review asks at most two questions on it, with no hearts.");
    expect(nextSteps(state([placed("ch02#one", 1, 3), placed("ch02#two", 0, 1)]))[0].why).toMatch(/two questions on each,/);
  });

  it("leaves out due sections the Arena cannot ask about: nothing on their page can mark them checked", () => {
    const noGen = { id: "ch01#integers", status: "solid", due: true, box: 0, last: null, seen: addDays(D, -3) };
    expect(nextSteps(state([noGen]))).toEqual([]);
    /* beside one the Arena can ask about, only that one is counted */
    expect(nextSteps(state([noGen, placed("ch02#one", 0, 2)]))[0]).toMatchObject({ kind: "due", text: "1 section due for a check", href: "arena.html?mode=review" });
    /* and with a place to continue, the card offers only what can be done */
    const items = nextSteps(state([noGen, { id: "ch99#gone", status: "solid", due: true }], { last: { id: "ch01", section: "addition" } }));
    expect(items.map((i) => i.kind)).toEqual(["continue"]);
  });

  it("does not call a section just learned due: its first check waits a day after its last page solve", () => {
    const solvedToday = { id: "ch01#addition", status: "solid", due: true, box: 0, last: null, seen: D };
    const items = nextSteps(state([solvedToday], { last: { id: "ch01", section: "addition" } }));
    expect(items.map((i) => i.kind)).toEqual(["continue"]);
    /* the next day it is, and the reason (a gap) is true */
    const tomorrow = nextSteps(state([solvedToday], { day: addDays(D, 1)!, last: { id: "ch01", section: "addition" } }));
    expect(tomorrow[0]).toMatchObject({ kind: "due", text: "1 section due for a check" });
    /* with no page solve to go by, as the schedule has always had it: at once */
    expect(nextSteps(state([{ ...solvedToday, seen: null }]))[0].kind).toBe("due");
  });

  it("then the weakest section, to a Repair run, or to its page without a generator", () => {
    const deck = [placed("ch01#addition", 1, 0, { status: "shaky", score: 0.4 }), placed("ch02#one", 1, 0, { status: "shaky", score: 0.6 })];
    const items = nextSteps(state(deck));
    expect(items[0]).toMatchObject({ kind: "weak", text: "Repair §2.1 One unknown", href: "arena.html?repair=ch02%23one" });
    const page = nextSteps(state([placed("ch01#integers", 1, 0, { status: "shaky", score: 0.5 })]));
    expect(page[0]).toMatchObject({ kind: "weak", text: "Reread §1.1 The integers", href: "parts/1/01.html#integers" });
    /* a tie goes to the section met first in the course; a row with no score counts as 0 */
    const tie = nextSteps(state([placed("ch02#two", 1, 0, { status: "shaky", score: 0.5 }), placed("ch02#one", 1, 0, { status: "shaky", score: 0.5 }), placed("ch01#addition", 1, 0, { status: "shaky" })]));
    expect(tie[0].text).toBe("Repair §2.1 One unknown");
  });

  it("then where the reader left off, as the Continue button has it", () => {
    expect(nextSteps(state([], { last: { id: "ch02", section: "two" } }))).toEqual([
      { kind: "continue", text: "Continue: Chapter 2 · Two unknowns", why: "This is where you left off.", href: "parts/1/02.html#two" }
    ]);
    expect(nextSteps(state([], { last: { id: "ch02", section: null } }))[0].href).toBe("parts/1/02.html");
    expect(nextSteps(state([], { last: { id: "ch01", section: "practice" } }))[0]).toMatchObject({ text: "Continue: Chapter 1 · Practice", href: "parts/1/01.html#practice" });
    /* a reader who has not started yet: nothing to continue, so no card at all */
    expect(nextSteps(state([]))).toEqual([]);
  });

  it("on a chapter page offers a place only in that chapter", () => {
    expect(nextSteps(state([], { here: "ch02", last: { id: "ch02", section: "two" } }))).toEqual([
      { kind: "continue", text: "Back to Two unknowns", why: "This is where you were reading in this chapter.", href: "parts/1/02.html#two" }
    ]);
    expect(nextSteps(state([], { here: "ch02", last: { id: "ch02", section: null } }))).toEqual([]);
    expect(nextSteps(state([], { here: "ch01", last: { id: "ch02", section: "two" } }))).toEqual([]);
    expect(nextSteps(state([], { here: "ch01" }))).toEqual([]);
    /* the practice set has an anchor but no section title */
    expect(nextSteps(state([], { here: "ch01", last: { id: "ch01", section: "practice" } }))).toEqual([
      { kind: "continue", text: "Back to Practice", why: "This is where you were reading in this chapter.", href: "parts/1/01.html#practice" }
    ]);
    expect(nextSteps(state([], { here: "ch01", last: { id: "ch01", section: "warmup" } }))[0]).toMatchObject({ text: "Back to where you were", href: "parts/1/01.html#warmup" });
  });

  it("shows at most three, one of each kind, in that order", () => {
    const deck = [placed("ch01#addition", 0, 2), placed("ch02#one", 1, 0, { status: "shaky", score: 0.9 }), placed("ch02#two", 0, 4, { status: "shaky", score: 0.5 })];
    const items = nextSteps(state(deck, { last: { id: "ch01", section: "addition" } }));
    expect(items.map((i) => i.kind)).toEqual(["due", "weak", "continue"]);
    expect(items.length).toBeLessThanOrEqual(NEXT_MAX_ITEMS);
    expect(items[1].text).toBe("Repair §2.1 One unknown");
  });

  it("ignores sections it does not know and records it cannot read", () => {
    expect(nextSteps(state([{ id: "ch99#x", status: "shaky", due: true, score: 1 }], { last: "garbage" }))).toEqual([]);
    expect(nextSteps(state([], { last: { id: "ch99", section: "x" } }))).toEqual([]);
  });

  it("is hidden for the rest of the day it was put away, and back the next", () => {
    expect([hiddenOn(D, D), hiddenOn("2026-10-04", D), hiddenOn(undefined, D), hiddenOn(1, D)]).toEqual([true, false, false, false]);
  });
});
