import { describe, expect, it } from "vitest";
import type { Chapter, Curriculum, Part } from "../core/curriculum.ts";
import { countText, match, targets } from "./hub-search.ts";

const sec = (id: string, title: string) => ({ id, title });
const part = (id: string, name: string, chapters: Chapter[], beside = false): Part =>
  ({ id, num: "I", name, dir: id, chapters, ...(beside ? { beside: true as const } : {}) });

const curriculum: Curriculum = {
  title: "T",
  parts: [
    part("p1", "Algebra", [
      { id: "ch01", label: "1", title: "Numbers", file: "01.html", path: "parts/p1/01.html", sections: [sec("integers", "Integers"), sec("fractions", "Fractions")] },
      { id: "ch02", label: "2", title: "Linear equations", file: "02.html", path: "parts/p1/02.html", sections: [sec("one-unknown", "One unknown"), sec("two-unknowns", "Two unknowns")] },
      { id: "ch03", label: "3", title: "Quadratics", file: "03.html", path: "parts/p1/03.html", sections: [sec("factoring", "Factoring")] },
      { id: "ch04", label: "Interlude", title: "A pause", file: "04.html", path: "parts/p1/04.html", sections: [sec("rest", "Rest")] }
    ]),
    part("packs", "Skill packs", [
      { id: "pkA", label: "A", title: "Decimals", file: "a.html", path: "parts/packs/a.html", sections: [sec("place-value", "Place value")] }
    ], true)
  ]
};

const all = targets(curriculum);

describe("hub-search targets", () => {
  it("lists every chapter and every section, in reading order", () => {
    expect(all.filter((t) => t.kind === "chapter")).toHaveLength(5);
    expect(all.filter((t) => t.kind === "section")).toHaveLength(7);
    expect(all[0].chapter).toBe("ch01");
    expect(all[1].section).toBe("ch01#integers");
  });
  it("names a chapter, a section, a pack and the Interlude", () => {
    const ch2 = all.find((t) => t.kind === "chapter" && t.chapter === "ch02")!;
    expect(ch2).toMatchObject({ label: "Chapter 2 Linear equations", hint: "Algebra", href: "parts/p1/02.html" });
    const s = all.find((t) => t.section === "ch02#two-unknowns")!;
    expect(s).toMatchObject({ label: "Two unknowns", hint: "§2.2 · Chapter 2", href: "parts/p1/02.html#two-unknowns", chapter: "ch02" });
    expect(all.find((t) => t.chapter === "pkA")).toMatchObject({ label: "Pack A Decimals", hint: "Skill packs" });
    expect(all.find((t) => t.section === "pkA#place-value")!.hint).toBe("Pack A.1 · Pack A");
    expect(all.find((t) => t.chapter === "ch04")!.label).toBe("Interlude A pause");
    expect(all.find((t) => t.section === "ch04#rest")!.hint).toBe("Interlude");
  });
  it("is empty for no curriculum", () => {
    expect(targets(null)).toEqual([]);
  });
});

describe("hub-search match", () => {
  it("keeps everything for an empty query", () => {
    const m = match("  ", all);
    expect(m.chapters.size).toBe(5);
    expect(m.sections.size).toBe(7);
  });
  it("keeps a chapter's card and all its rows for a title hit", () => {
    const m = match("linear", all);
    expect([...m.chapters]).toEqual(["ch02"]);
    expect([...m.sections].sort()).toEqual(["ch02#one-unknown", "ch02#two-unknowns"]);
  });
  it("keeps one row and its card for a section hit", () => {
    const m = match("factoring", all);
    expect([...m.chapters]).toEqual(["ch03"]);
    expect([...m.sections]).toEqual(["ch03#factoring"]);
    const one = match("one unknown", all);
    expect([...one.chapters]).toEqual(["ch02"]);
    expect([...one.sections]).toEqual(["ch02#one-unknown"]);
  });
  it("keeps nothing when nothing matches", () => {
    const m = match("zzzzqq", all);
    expect(m.chapters.size).toBe(0);
    expect(m.sections.size).toBe(0);
    expect(countText("zzzzqq", m)).toBe("No match");
  });
  it("leaves out letters-in-order matches that are not in the words", () => {
    expect(match("fns", all).chapters.size).toBe(0);
  });
  it("ignores case", () => {
    expect([...match("LINEAR", all).chapters]).toEqual(["ch02"]);
  });
  it("takes the chapter aliases", () => {
    const m = match("ch3", all);
    expect(m.chapters.has("ch03")).toBe(true);
    expect(m.sections.has("ch03#factoring")).toBe(true);
    expect(m.chapters.has("ch01")).toBe(false);
  });
  it("counts in words", () => {
    expect(countText("", match("", all))).toBe("");
    expect(countText("linear", match("linear", all))).toBe("1 chapter, 2 sections match");
    expect(countText("factoring", match("factoring", all))).toBe("1 chapter, 1 section match");
  });
});
