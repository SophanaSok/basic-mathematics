/* The placement check's seeding (src/ui/diagnostic.ts): a section of a beside Part is never
   seeded, even when it has a SKILLS record. */
import { afterEach, describe, expect, it } from "vitest";
import { seed, seedRefs } from "./diagnostic.ts";
import { seedPatch } from "../learn/diag-seed.ts";
import { FORMS } from "../learn/diagnostic.ts";
import { BLUEPRINT } from "../learn/constants.ts";
import { SKILLS } from "../data/skills.ts";
import type { DiagTake } from "../types/state.ts";
import { course, courseWithPacks } from "../world/course.test-helper.ts";

describe("seedRefs", () => {
  const skills: Record<string, unknown> = { ...SKILLS, "pk-percent#of-a-number": { course: "pre-algebra" }, "pk-ratio#simplify": { course: "pre-algebra" } };

  it("drops the refs of a beside Part's chapters, by the curriculum", () => {
    const refs = seedRefs(courseWithPacks(), skills);
    expect(refs).not.toContain("pk-percent#of-a-number");
    expect(refs).not.toContain("pk-ratio#simplify");
    expect(refs.length).toBe(Object.keys(SKILLS).filter((r) => !r.startsWith("pk-")).length);
  });

  it("seeds none of pack A's sections on the real curriculum", () => {
    const refs = seedRefs(course(), SKILLS);
    expect(Object.keys(SKILLS)).toContain("pk-percent#ratios");
    expect(refs.some((r) => r.startsWith("pk-"))).toBe(false);
  });

  it("keeps a pk- name that is in no beside Part", () => {
    const C = courseWithPacks();
    expect(seedRefs({ parts: C.parts.filter((p: any) => !p.beside) }, skills)).toContain("pk-percent#of-a-number");
  });

  it("seeds nothing when the curriculum cannot be read, since it cannot say which sections are packs", () => {
    expect(seedRefs(null, skills)).toEqual([]);
    expect(seedRefs({}, skills)).toEqual([]);
    expect(seedRefs({ parts: "x" }, skills)).toEqual([]);
  });

  it("skips a null Part or chapter instead of throwing", () => {
    expect(seedRefs({ parts: [null, { beside: true, chapters: [null, { id: "pk-percent" }] }] }, skills)).not.toContain("pk-percent#of-a-number");
  });

  it("seeds nothing for a pack section", () => {
    const take: any = { blocks: [] };
    const patch = seedPatch(take, seedRefs(courseWithPacks(), skills), undefined, () => false, () => ({ course: "pre-algebra" }) as never);
    expect(Object.keys(patch).some((r) => r.startsWith("pk-"))).toBe(false);
  });
});

/* seed() itself, so the page's wiring is held and not only seedRefs: a pre-algebra take with
   every item right seeds ch01#rationals; moved into a beside Part, ch01 is never seeded */
describe("seed", () => {
  afterEach(() => { delete (globalThis as any).window; });
  const take: DiagTake = {
    v: 1, day: "2026-10-06", from: "unsure", start: "pre-algebra", band: "algebra-2", blueprint: BLUEPRINT, grader: 1,
    seed: 7, seeded: true,
    blocks: [{ course: "pre-algebra", pass: true, items: FORMS["pre-algebra"].map((f, i) => ({ g: f.g, s: i + 1, sec: f.sec, k: "right" })) }]
  } as DiagTake;
  function run(cur: unknown): Record<string, unknown> {
    let patch: Record<string, unknown> = {};
    (globalThis as any).window = {
      BM_CURRICULUM: cur,
      BMGame: { seedRecall: (p: Record<string, unknown>) => { patch = p; }, game: () => ({ sec: {} }) },
      BMInsights: { sections: () => [] }
    };
    seed(take);
    return patch;
  }

  it("seeds a course section", () => {
    expect(Object.keys(run(courseWithPacks()))).toContain("ch01#rationals");
  });

  it("never seeds a section of a beside Part", () => {
    const C: any = courseWithPacks();
    const ch01 = C.parts[0].chapters.filter((ch: any) => ch.id === "ch01");
    C.parts[0].chapters = C.parts[0].chapters.filter((ch: any) => ch.id !== "ch01");
    C.parts.push({ id: "moved", num: "", name: "Moved", dir: "x", beside: true, chapters: ch01 });
    const keys = Object.keys(run(C));
    expect(keys.some((r) => r.startsWith("ch01#"))).toBe(false);
    expect(keys.length).toBeGreaterThan(0);
  });

  it("seeds nothing with no curriculum", () => {
    expect(run(undefined)).toEqual({});
  });
});
