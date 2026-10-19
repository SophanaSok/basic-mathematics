import { describe, expect, it } from "vitest";
import type { Curriculum } from "../core/curriculum.ts";
import type { SectionRef } from "../types/state.ts";
import {
  chapterRequires, continueTarget, doneForPlan, labelOf, sectionStates,
  type ContinueChapter, type DoneContext, type PlanRow
} from "./status.ts";

const R = (s: string) => s as SectionRef;
const refs = ["a#one", "a#two", "a#three", "b#x"].map(R);

function ctx(x: { solid?: string[]; rows?: Record<string, PlanRow>; work?: Record<string, number>; gen?: string[] } = {}): DoneContext {
  return {
    refs,
    status: (r) => (x.solid?.includes(r) ? "solid" : "new"),
    row: (r) => x.rows?.[r],
    work: x.work as DoneContext["work"] ?? {},
    hasGenerator: (r) => !!x.gen?.includes(r)
  };
}

describe("doneForPlan", () => {
  it("a reading-only section is done once a later section has a row", () => {
    const c = ctx({ rows: { "a#three": { solved: 0 } } });
    expect(doneForPlan(c, R("a#one"))).toBe(true);
    expect(doneForPlan(c, R("a#three"))).toBe(false);
    expect(doneForPlan(ctx(), R("a#one"))).toBe(false);
  });
  it("a worked section is done when solid or all exercises solved", () => {
    expect(doneForPlan(ctx({ work: { "a#one": 3 }, solid: ["a#one"] }), R("a#one"))).toBe(true);
    expect(doneForPlan(ctx({ work: { "a#one": 3 }, rows: { "a#one": { solved: 3 } } }), R("a#one"))).toBe(true);
    expect(doneForPlan(ctx({ work: { "a#one": 3 }, rows: { "a#one": { solved: 2 } } }), R("a#one"))).toBe(false);
  });
  it("a generator-only section needs solid", () => {
    expect(doneForPlan(ctx({ gen: ["a#one"], rows: { "a#one": { solved: 9 } } }), R("a#one"))).toBe(false);
    expect(doneForPlan(ctx({ gen: ["a#one"], solid: ["a#one"] }), R("a#one"))).toBe(true);
  });
});

describe("sectionStates", () => {
  const req: Record<string, string[]> = { "a#two": ["a#one"], "a#three": ["a#one", "a#two", "b#x"], "b#x": ["a#two"] };
  const run = (c: DoneContext) => sectionStates({
    ...c, requires: (r) => (req[r] ?? []).map(R), labelOf: (r) => "L:" + r
  });
  const worked = { "a#one": 2, "a#two": 2, "a#three": 2, "b#x": 2 };
  it("done, started, ready, ahead", () => {
    const s = run(ctx({ work: worked, solid: ["a#one"], rows: { "a#two": { solved: 1 } } }));
    expect(s[R("a#one")]).toMatchObject({ state: "done", text: "Done" });
    expect(s[R("a#two")]).toMatchObject({ state: "started", text: "In progress" });
    expect(s[R("b#x")]).toMatchObject({ state: "ahead", text: "Builds on L:a#two", unmet: ["a#two"] });
  });
  it("tries alone start a section; no requires is ready", () => {
    const s = run(ctx({ work: worked, rows: { "a#one": { solved: 0, tries: 2 } } }));
    expect(s[R("a#one")].state).toBe("started");
    const t = run(ctx({ work: worked }));
    expect(t[R("a#one")]).toMatchObject({ state: "ready", text: "Ready", unmet: [] });
  });
  it("several unmet names the first and counts the rest", () => {
    const s = run(ctx({ work: worked }));
    expect(s[R("a#three")]).toMatchObject({ state: "ahead", text: "Builds on L:a#one and 2 more", buildsOn: ["a#one", "a#two", "b#x"] });
  });
  it("ready once every requirement is done", () => {
    const s = run(ctx({ work: worked, solid: ["a#one"] }));
    expect(s[R("a#two")].state).toBe("ready");
  });
});

const cur: Curriculum = {
  title: "T",
  parts: [
    { id: "p1", num: "I", name: "One", dir: "1", chapters: [
      { id: "ch01", label: "1", title: "Numbers", file: "01.html", sections: [{ id: "int", title: "Integers" }] },
      { id: "ch02", label: "2", title: "Eq", file: "02.html", sections: [
        { id: "one", title: "One unknown", requires: ["ch01#int", "ch02#zero", "interlude#logic", "ch01#int"] },
        { id: "zero", title: "Zero" }
      ] },
      { id: "interlude", label: "Interlude", title: "Logic", file: "i.html", sections: [{ id: "logic", title: "Implication" }] }
    ] },
    { id: "packs", num: "V", name: "Packs", dir: "5", beside: true, chapters: [
      { id: "pk-a", label: "A", title: "Ratios", file: "a.html", sections: [{ id: "ratios", title: "Ratios and rates", requires: ["ch02#one"] }] }
    ] }
  ]
};

describe("labelOf", () => {
  it("forms", () => {
    expect(labelOf(R("ch02#one"), cur)).toBe("§2.1 One unknown");
    expect(labelOf(R("ch02#zero"), cur)).toBe("§2.2 Zero");
    expect(labelOf(R("pk-a#ratios"), cur)).toBe("Pack A.1 Ratios and rates");
    expect(labelOf(R("interlude#logic"), cur)).toBe("Implication");
  });
  it("empty when unknown", () => {
    expect(labelOf(R("ch09#x"), cur)).toBe("");
    expect(labelOf(R("ch02#nope"), cur)).toBe("");
    expect(labelOf(R("ch02"), cur)).toBe("");
    expect(labelOf(R("ch02#one"), null)).toBe("");
  });
});

describe("chapterRequires", () => {
  it("other chapters, curriculum order, no duplicates, not itself", () => {
    expect(chapterRequires(cur, "ch02")).toEqual(["ch01", "interlude"]);
    expect(chapterRequires(cur, "pk-a")).toEqual(["ch02"]);
    expect(chapterRequires(cur, "ch01")).toEqual([]);
    expect(chapterRequires(cur, "nope")).toEqual([]);
  });
});

describe("continueTarget", () => {
  const ch: ContinueChapter[] = [
    { id: "ch01", name: "Chapter 1", path: "parts/1/01.html", sections: [{ id: "a", title: "Add" }] },
    { id: "ch02", name: "Chapter 2", path: "parts/1/02.html", sections: [{ id: "two", title: "Two unknowns" }] }
  ];
  const pk: ContinueChapter[] = [{ id: "pk-a", name: "Pack A", path: "parts/5/a.html", sections: [] }];
  it("continue from the contents page", () => {
    expect(continueTarget({ id: "ch02", section: "two" }, ch)).toEqual({
      chapterId: "ch02", text: "Continue: Chapter 2 · Two unknowns", why: "This is where you left off.", href: "parts/1/02.html#two"
    });
    expect(continueTarget({ id: "ch01", section: "practice" }, ch)?.text).toBe("Continue: Chapter 1 · Practice");
    expect(continueTarget({ id: "ch01" }, ch)?.href).toBe("parts/1/01.html");
  });
  it("finds a pack; nothing for a stranger or no last", () => {
    expect(continueTarget({ id: "pk-a" }, ch, pk)?.chapterId).toBe("pk-a");
    expect(continueTarget({ id: "zz" }, ch, pk)).toBeNull();
    expect(continueTarget(null, ch)).toBeNull();
    expect(continueTarget("x", ch)).toBeNull();
  });
  it("on a chapter page only a place further in that chapter", () => {
    expect(continueTarget({ id: "ch02", section: "two" }, ch, [], "ch02")?.text).toBe("Back to Two unknowns");
    expect(continueTarget({ id: "ch01", section: "practice" }, ch, [], "ch01")?.text).toBe("Back to Practice");
    expect(continueTarget({ id: "ch02", section: "two" }, ch, [], "ch01")).toBeNull();
    expect(continueTarget({ id: "ch02" }, ch, [], "ch02")).toBeNull();
  });
});
