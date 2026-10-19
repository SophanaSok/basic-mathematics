import { describe, expect, it } from "vitest";
import { chapterRequires, hubHash, parseHubHash, returnHash } from "./hub.ts";
import type { Curriculum } from "./curriculum.ts";
import { course } from "../world/course.test-helper.ts";

const sec = (id: string, requires: string[] = []) => ({ id, title: id, requires });
const ch = (id: string, sections: any[]) => ({ id, label: id, title: id, file: id + ".html", sections });

const FIX = {
  title: "t",
  parts: [
    { id: "one", num: "I", name: "One", dir: "1", chapters: [
      ch("ch01", [sec("integers"), sec("addition", ["ch01#integers"])]),
      ch("ch02", [sec("one-unknown", ["ch01#integers", "ch01#addition"]), sec("two", ["ch03#x"])]),
      ch("ch03", [sec("x", ["ch01#addition"])]),
      ch("interlude", [sec("pause")])
    ] },
    { id: "packs", num: "V", name: "Packs", dir: "5", beside: true, chapters: [
      ch("pk-percent", [sec("rates", ["ch02#two", "ch01#integers", "ch02#one-unknown"]), sec("review", ["pk-percent#rates"])])
    ] }
  ]
} as unknown as Curriculum;

describe("parseHubHash", () => {
  it("accepts the chapter forms", () => {
    expect(parseHubHash("#ch03", FIX)).toEqual({ chapter: "ch03", section: null });
    expect(parseHubHash("ch03", FIX)).toEqual({ chapter: "ch03", section: null });
    expect(parseHubHash("#interlude", FIX)).toEqual({ chapter: "interlude", section: null });
  });
  it("accepts a section after a dot", () => {
    expect(parseHubHash("#ch02.one-unknown", FIX)).toEqual({ chapter: "ch02", section: "one-unknown" });
    expect(parseHubHash("#pk-percent.rates", FIX)).toEqual({ chapter: "pk-percent", section: "rates" });
  });
  it("rejects everything else", () => {
    for (const h of ["", "#", ".", "#.", "#ch03.", "#.x", "#part-one", "#main", "#nope", "#ch02.nope",
      "#ch03.one-unknown", "#ch02.one-unknown.x", "#ch02#one-unknown", "#hud-sheet"]) {
      expect(parseHubHash(h, FIX), h).toBeNull();
    }
    expect(parseHubHash("#ch01", null)).toBeNull();
  });
  it("reads the real course", () => {
    const C = course() as any;
    expect(parseHubHash("#ch01", C)).toEqual({ chapter: "ch01", section: null });
    expect(parseHubHash("#ch01.integers", C)).toEqual({ chapter: "ch01", section: "integers" });
    expect(parseHubHash("#interlude", C)).not.toBeNull();
    expect(parseHubHash("#pk-percent", C)).not.toBeNull();
  });
});

describe("hubHash and returnHash", () => {
  it("writes and round-trips", () => {
    expect(hubHash(null)).toBe("");
    expect(hubHash({ chapter: "ch03" as any, section: null })).toBe("#ch03");
    expect(hubHash({ chapter: "ch02" as any, section: "one-unknown" as any })).toBe("#ch02.one-unknown");
    for (const sel of [{ chapter: "ch03", section: null }, { chapter: "ch02", section: "two" }, { chapter: "pk-percent", section: "review" }] as any[]) {
      expect(parseHubHash(hubHash(sel), FIX)).toEqual(sel);
    }
    expect(parseHubHash(hubHash(null), FIX)).toBeNull();
  });
  it("returnHash matches hubHash", () => {
    expect(returnHash("ch03" as any)).toBe("#ch03");
    expect(returnHash("ch02" as any, "two" as any)).toBe("#ch02.two");
    expect(returnHash("ch02" as any, null)).toBe("#ch02");
  });
});

describe("chapterRequires", () => {
  it("excludes the chapter itself and dedupes", () => {
    expect(chapterRequires(FIX, "ch01" as any)).toEqual([]);
    expect(chapterRequires(FIX, "ch02" as any)).toEqual(["ch01", "ch03"]);
    expect(chapterRequires(FIX, "ch03" as any)).toEqual(["ch01"]);
  });
  it("orders by curriculum, across a beside Part", () => {
    expect(chapterRequires(FIX, "pk-percent" as any)).toEqual(["ch01", "ch02"]);
  });
  it("answers [] for unknown ids and missing curricula", () => {
    expect(chapterRequires(FIX, "nope" as any)).toEqual([]);
    expect(chapterRequires(null, "ch01" as any)).toEqual([]);
    expect(chapterRequires(FIX, "interlude" as any)).toEqual([]);
  });
});
