import { describe, expect, it } from "vitest";
import { isBeside } from "./curriculum.ts";
import { course, courseWithPacks } from "../world/course.test-helper.ts";

describe("a Part beside the course", () => {
  it("is told by isBeside", () => {
    expect(isBeside({ beside: true })).toBe(true);
    expect(isBeside({})).toBe(false);
    expect(isBeside(null)).toBe(false);
  });

  it("keeps its chapters out of courseChapters but in chapters", () => {
    const C = courseWithPacks();
    expect(C.chapters.length).toBe(19);
    expect(C.courseChapters.length).toBe(17);
    expect(C.courseChapters.map((c) => c.id)).not.toContain("pk-percent");
    expect(C.chapters.slice(-2).map((c) => c.id)).toEqual(["pk-percent", "pk-ratio"]);
    expect((C as any).chapterById("pk-ratio").path).toBe("parts/5-packs/pk-ratio.html");
  });

  it("holds the real Part V, pack A, out of courseChapters", () => {
    const C = course() as any;
    expect(C.chapters.length).toBe(22);
    expect(C.courseChapters.length).toBe(17);
    expect(C.courseChapters.map((c: any) => c.id)).not.toContain("pk-percent");
    expect(C.chapterById("pk-percent").part.beside).toBe(true);
  });
});
