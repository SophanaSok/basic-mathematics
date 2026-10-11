/* The placement check's seeding (src/ui/diagnostic.ts): a section of a beside Part is never
   seeded, even when it has a SKILLS record. */
import { describe, expect, it } from "vitest";
import { seedRefs } from "./diagnostic.ts";
import { seedPatch } from "../learn/diag-seed.ts";
import { SKILLS } from "../data/skills.ts";
import { courseWithPacks } from "../world/course.test-helper.ts";

describe("seedRefs", () => {
  const skills: Record<string, unknown> = { ...SKILLS, "pk-percent#of-a-number": { course: "pre-algebra" }, "pk-ratio#simplify": { course: "pre-algebra" } };

  it("drops the refs of a beside Part's chapters, by the curriculum", () => {
    const refs = seedRefs(courseWithPacks(), skills);
    expect(refs).not.toContain("pk-percent#of-a-number");
    expect(refs).not.toContain("pk-ratio#simplify");
    expect(refs.length).toBe(Object.keys(SKILLS).length);
  });

  it("keeps a pk- name that is in no beside Part, and every ref when the curriculum is unreadable", () => {
    const C = courseWithPacks();
    expect(seedRefs({ parts: C.parts.filter((p: any) => !p.beside) }, skills)).toContain("pk-percent#of-a-number");
    expect(seedRefs(null, skills).length).toBe(Object.keys(skills).length);
  });

  it("seeds nothing for a pack section", () => {
    const take: any = { blocks: [] };
    const patch = seedPatch(take, seedRefs(courseWithPacks(), skills), undefined, () => false, () => ({ course: "pre-algebra" }) as never);
    expect(Object.keys(patch).some((r) => r.startsWith("pk-"))).toBe(false);
  });
});
