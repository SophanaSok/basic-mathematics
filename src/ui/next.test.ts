import { afterEach, describe, expect, it } from "vitest";
import { input } from "./next.ts";
import { nextSteps } from "../learn/next.ts";
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
  });

  it("hands the packs over separately, their sections after the course's", () => {
    withWindow(courseWithPacks());
    const inp = input()!;
    expect(inp.packs!.map((c) => c.id)).toEqual(["pk-percent", "pk-ratio"]);
    const courseMax = Math.max(...Object.values(inp.sections).filter((s) => !s.chapter.startsWith("pk-")).map((s) => s.index));
    expect(inp.sections["pk-percent#of-a-number"].index).toBeGreaterThan(courseMax);
  });

  it("continues to a pack the reader last visited, and offers a weak pack section", () => {
    const C: any = courseWithPacks();
    withWindow(C);
    const base = input()!;
    const last = { id: "pk-percent", section: "review" };
    const items = nextSteps({ ...base, last, deck: [{ id: "pk-percent#of-a-number", status: "shaky", due: false }] });
    expect(items.map((i) => i.kind)).toEqual(["weak", "continue"]);
    expect(items[1].href).toBe("parts/5-packs/pk-percent.html#review");
    /* the course's chapters never include a pack, so ch16 does not walk into one */
    expect(base.chapters[base.chapters.length - 1].id).not.toMatch(/^pk-/);
  });

  it("labels a pack's sections \"Pack A.1\", and a course chapter's \"§2.1\"", () => {
    withWindow(courseWithPacks());
    const inp = input()!;
    expect(inp.sections["pk-percent#of-a-number"].label).toBe("Pack A.1");
    expect(inp.sections["ch02#one-unknown"].label).toBe("§2.1");
  });

  it("falls back to every chapter when courseChapters is absent", () => {
    const C: any = courseWithPacks();
    delete C.courseChapters;
    withWindow(C);
    expect(input()!.chapters.length).toBe(19);
  });
});
