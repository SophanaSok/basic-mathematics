/* The study plan page's gathering (src/ui/plan.ts): a beside Part's sections stay out of the
   outline, and its chapters become packs with links. */
import { afterEach, describe, expect, it } from "vitest";
import { outline, packList } from "./plan.ts";
import { courseWithPacks } from "../world/course.test-helper.ts";

function withWindow(C: unknown, root = "") {
  (globalThis as any).window = { BM_CURRICULUM: C, BMSite: { rootPrefix: () => root } };
}
afterEach(() => { delete (globalThis as any).window; });

describe("the plan's outline and packs", () => {
  it("leaves a beside Part's sections out of the outline", () => {
    withWindow(courseWithPacks());
    const keys = [...outline()!.keys()];
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.some((k) => k.startsWith("pk-"))).toBe(false);
  });

  it("builds a pack per chapter with a course, linked relative to the page", () => {
    const C: any = courseWithPacks();
    const ch = C.parts.find((p: any) => p.beside).chapters;
    ch[0].course = "pre-algebra";
    ch[1].course = "not-a-course";
    withWindow(C, "../../");
    expect(packList()).toEqual([{
      id: "pk-percent", course: "pre-algebra", title: "Percent", href: "../../" + ch[0].path,
      refs: ["pk-percent#of-a-number", "pk-percent#review"]
    }]);
  });

  it("has no packs without a beside Part", () => {
    withWindow({ chapters: [] });
    expect(packList()).toEqual([]);
  });
});
