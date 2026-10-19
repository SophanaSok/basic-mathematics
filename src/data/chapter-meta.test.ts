/* chapter-meta.ts against the pages: it must be exactly what tools/gen-chapter-meta.js writes,
   and every course chapter needs a usable entry. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { CHAPTER_META } from "./chapter-meta.ts";

const req = createRequire(import.meta.url);
const gen = req("../../tools/gen-chapter-meta.js");
const site = req("../../tools/lib/site.js");

describe("the chapter meta", () => {
  it("is what the generator writes (run npm run gen:chapter-meta)", () => {
    expect(gen.render(gen.build()), "src/data/chapter-meta.ts is stale: run npm run gen:chapter-meta").toBe(readFileSync(gen.FILE, "utf8"));
  });
  it("has an entry for every chapter in the curriculum", () => {
    const ids = site.curriculum(site.ROOT).chapters.map((c: { id: string }) => c.id);
    expect(ids.filter((id: string) => !CHAPTER_META[id])).toEqual([]);
  });
  it("has a reading time of at least 10 minutes and a goal that is not the lead-in", () => {
    for (const [id, m] of Object.entries(CHAPTER_META)) {
      expect(m.minutes, id).toBeGreaterThanOrEqual(10);
      expect(m.goal.length, id).toBeGreaterThan(0);
      expect(m.goal.startsWith("By the end"), id).toBe(false);
    }
  });
});
