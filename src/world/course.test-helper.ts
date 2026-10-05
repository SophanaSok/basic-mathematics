/* For the world's unit tests: the course and the quest as the pages have them, read
   from data/curriculum.js and data/quest.js (scripts that set window.BM_CURRICULUM and
   window.BM_QUEST) in a vm of their own. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import type { CourseShape } from "./layout.ts";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

function run(file: string): Record<string, unknown> {
  const window: Record<string, unknown> = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), "utf8"), { window }, { filename: file });
  return window;
}

export function course(): CourseShape & { parts: { id: string; chapters: { id: string; sections: { id: string }[] }[] }[] } {
  return run("data/curriculum.js").BM_CURRICULUM as never;
}

export function motifs(c: CourseShape): (string | undefined)[] {
  const Q = run("data/quest.js").BM_QUEST as { regions: Record<string, { motif?: string }> };
  return c.parts.map((p) => Q.regions[p.id] && Q.regions[p.id].motif);
}
