import { describe, expect, it } from "vitest";
import type { Chapter, Curriculum, Part } from "../core/curriculum.ts";
import { labelOfExercise, rank, targetsOf, type Target } from "./palette.ts";

const ch = (id: string, label: string, title: string, path?: string): Chapter =>
  ({ id, label, title, file: id + ".html", sections: [], path }) as Chapter;
const part = (id: string, name: string, chapters: Chapter[], beside?: true): Part => {
  const p = { id, num: id, name, dir: id, chapters, ...(beside ? { beside } : {}) } as Part;
  for (const c of chapters) c.part = p;
  return p;
};
const fake = (): Curriculum => {
  const a = part("p1", "Part One", [ch("ch1", "Chapter 1", "Numbers", "parts/p1/ch1.html"), ch("ch2", "Chapter 2", "Fractions", "parts/p1/ch2.html")]);
  const b = part("p2", "Part Two", [ch("ch7", "Chapter 7", "Angles", "parts/p2/ch7.html"), ch("chx", "Chapter 8", "Nowhere")]);
  const k = part("k", "Skill pack", [ch("k1", "Pack 1", "Warm-ups", "parts/k/k1.html")], true);
  const c = [...a.chapters, ...b.chapters, ...k.chapters];
  return { title: "T", parts: [a, b, k], chapters: c };
};
const T = (label: string, extra: Partial<Target> = {}): Target => ({ kind: "page", label, ...extra });

describe("targetsOf", () => {
  it("lists a chapter page's sections, exercises, chapters then pages", () => {
    const t = targetsOf({
      kind: "chapter",
      curriculum: fake(),
      sections: [{ id: "s1", title: "Adding" }],
      exercises: [{ id: "ex-e1", label: "Exercise 1" }],
      root: "/",
    });
    expect(t.map((x) => x.kind)).toEqual(["section", "exercise", "chapter", "chapter", "chapter", "chapter", ...Array(6).fill("page")]);
    expect(t[0]).toEqual({ kind: "section", label: "Adding", hint: "Section", id: "s1" });
    expect(t[1]).toEqual({ kind: "exercise", label: "Exercise 1", hint: "Exercise", id: "ex-e1" });
    expect(t[2].label).toBe("Chapter 1 Numbers");
    expect(t[2].hint).toBe("Part One");
  });
  it("starts with the chapters on the home page and ends with the pages", () => {
    const t = targetsOf({ kind: "home", curriculum: fake(), sections: [{ id: "s", title: "S" }], exercises: [{ id: "e", label: "E" }], root: "/" });
    expect(t[0].kind).toBe("chapter");
    expect(t.some((x) => x.kind === "section" || x.kind === "exercise")).toBe(false);
    expect(t.slice(-6).map((x) => x.label)).toEqual(["Home", "Arena", "Your progress", "How to use this", "Your account", "Placement check"]);
    expect(t.slice(-6).every((x) => x.hint === "Page")).toBe(true);
  });
  it("skips chapters with no path and puts a beside Part last", () => {
    const t = targetsOf({ kind: "home", curriculum: fake(), root: "/" }).filter((x) => x.kind === "chapter");
    expect(t.map((x) => x.label)).toEqual(["Chapter 1 Numbers", "Chapter 2 Fractions", "Chapter 7 Angles", "Pack 1 Warm-ups"]);
    expect(t[3].hint).toBe("Skill pack");
  });
  it("carries the root on every href", () => {
    const t = targetsOf({ kind: "home", curriculum: fake(), root: "../" });
    expect(t.every((x) => x.href!.startsWith("../"))).toBe(true);
    expect(t.find((x) => x.label === "Chapter 7 Angles")!.href).toBe("../parts/p2/ch7.html");
    expect(t.find((x) => x.label === "Arena")!.href).toBe("../arena.html");
  });
  it("still gives the pages for a null or malformed curriculum", () => {
    expect(targetsOf({ kind: "home", curriculum: null, root: "/" })).toHaveLength(6);
    const bad = { title: "x", parts: 3 } as unknown as Curriculum;
    expect(targetsOf({ kind: "home", curriculum: bad, root: "/" })).toHaveLength(6);
    const worse = { title: "x", parts: [null] } as unknown as Curriculum;
    expect(targetsOf({ kind: "home", curriculum: worse, root: "/" })).toHaveLength(6);
  });
});

describe("rank", () => {
  it("returns the first limit targets in order for an empty query", () => {
    const ts = [T("a"), T("b"), T("c")];
    expect(rank("", ts, 2).map((x) => x.label)).toEqual(["a", "b"]);
    expect(rank("   ", ts).map((x) => x.label)).toEqual(["a", "b", "c"]);
  });
  it("ranks a prefix over a word start over a substring over a subsequence", () => {
    const ts = [T("xxfracxx"), T("fr a c"), T("the fraction"), T("fraction"), T("xfxrxa")];
    expect(rank("frac", ts).map((x) => x.label)).toEqual(["fraction", "the fraction", "xxfracxx", "fr a c"]);
    expect(rank("fra", [T("x f r a"), T("xxfrax"), T("a fra"), T("fra")]).map((x) => x.label)).toEqual(["fra", "a fra", "xxfrax", "x f r a"]);
  });
  it("keeps the input order for ties", () => {
    const ts = [T("beta"), T("bravo"), T("bold")];
    expect(rank("b", ts).map((x) => x.label)).toEqual(["beta", "bravo", "bold"]);
  });
  it("drops targets that match nothing", () => {
    expect(rank("zzz", [T("alpha"), T("beta")])).toEqual([]);
  });
  it("returns at most the limit", () => {
    const ts = Array.from({ length: 30 }, (_, i) => T("item " + i));
    expect(rank("item", ts)).toHaveLength(12);
    expect(rank("item", ts, 5)).toHaveLength(5);
  });
  it("finds Exercise 3 first for e3", () => {
    const ts = targetsOf({
      kind: "chapter",
      curriculum: fake(),
      sections: [{ id: "s", title: "Extra three" }],
      exercises: [1, 2, 3, 4].map((n) => ({ id: "ex-e" + n, label: "Exercise " + n })),
      root: "/",
    });
    expect(rank("e3", ts)[0].label).toBe("Exercise 3");
  });
  it("finds chapter 7 first for 7 and ch7", () => {
    const ts = targetsOf({ kind: "chapter", curriculum: fake(), exercises: [{ id: "ex-e7", label: "Exercise 7" }], root: "/" });
    expect(rank("7", ts)[0].label).toBe("Chapter 7 Angles");
    expect(rank("ch7", ts)[0].label).toBe("Chapter 7 Angles");
    expect(rank("chapter 7", ts)[0].label).toBe("Chapter 7 Angles");
  });
  it("ignores case", () => {
    expect(rank("ARENA", [T("Home"), T("Arena")])[0].label).toBe("Arena");
    expect(rank("home", [T("HOME")])).toHaveLength(1);
  });
  it("matches the hint too", () => {
    expect(rank("skill", [T("Pack 1", { hint: "Skill pack" }), T("Home")]).map((x) => x.label)).toEqual(["Pack 1"]);
  });
});

describe("labelOfExercise", () => {
  it("uses the card's text, a custom label, or the key", () => {
    expect(labelOfExercise("Exercise 3", "e3")).toBe("Exercise 3");
    expect(labelOfExercise(" Your turn 2 ", "t2")).toBe("Your turn 2");
    expect(labelOfExercise("", "e3")).toBe("e3");
  });
  it("adds the key when the label has no number, so Your turn cards can be told apart", () => {
    expect(labelOfExercise("Your turn", "t3")).toBe("Your turn (t3)");
    expect(labelOfExercise("Section check", "k1")).toBe("Section check (k1)");
  });
});

describe("rank: the e-alias", () => {
  it("e3 names Exercise 3, not a warm-up ending in 3", () => {
    const targets: Target[] = [
      { kind: "exercise", label: "Warm-up 3", hint: "Exercise", id: "w3" },
      { kind: "exercise", label: "Exercise 3", hint: "Exercise", id: "e3" },
    ];
    expect(rank("e3", targets)[0].id).toBe("e3");
  });
});
