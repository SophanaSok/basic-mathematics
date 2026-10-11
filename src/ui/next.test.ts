import { afterEach, describe, expect, it } from "vitest";
import { input } from "./next.ts";
import { courseWithPacks } from "../world/course.test-helper.ts";

/* input() reads the live stores off window; a stub window with the curriculum is enough */
function withWindow(C: unknown) {
  (globalThis as any).window = {
    BMGame: { deck: () => [] },
    BMSite: { chapterName: (ch: any) => "Chapter " + ch.label, dayKey: () => "2026-10-11", chapterOf: () => null },
    BMStore: { read: (_k: string, f: unknown) => f, keys: { last: "bm.last" } },
    BM_CURRICULUM: C
  };
}
afterEach(() => { delete (globalThis as any).window; });

describe("the next-step card's input", () => {
  it("walks the course's chapters, not a beside Part's", () => {
    const C = courseWithPacks();
    withWindow(C);
    const inp = input()!;
    expect(inp.chapters.length).toBe(17);
    expect(inp.chapters.map((c) => c.id)).not.toContain("pk-percent");
    expect(Object.keys(inp.sections).some((id) => id.startsWith("pk-"))).toBe(false);
  });

  it("falls back to every chapter when courseChapters is absent", () => {
    const C: any = courseWithPacks();
    delete C.courseChapters;
    withWindow(C);
    expect(input()!.chapters.length).toBe(19);
  });
});
