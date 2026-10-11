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

/** A Part marked beside, with two fixture chapters: what the skill packs will be. */
export const FIXTURE_PACKS = {
  id: "packs", num: "V", name: "Skill packs", dir: "5-packs", beside: true,
  blurb: "Short packs of practice that sit beside the course.",
  chapters: [
    { id: "pk-percent", label: "A", title: "Percent", file: "pk-percent.html", status: "full", blurb: "Percent.",
      sections: [{ id: "of-a-number", title: "A percent of a number" }, { id: "review", title: "Review" }] },
    { id: "pk-ratio", label: "B", title: "Ratio", file: "pk-ratio.html", status: "full", blurb: "Ratio.",
      sections: [{ id: "simplify", title: "Simplify a ratio" }] }
  ]
};

/** The real curriculum's four Parts plus the fixture Part, flattened by data/curriculum.js's own code
    (the Part goes in between the literal and the flattening IIFE). */
export function courseWithPacks(): ReturnType<typeof course> & { chapters: { id: string }[]; courseChapters: { id: string }[] } {
  const src = fs.readFileSync(path.join(ROOT, "data/curriculum.js"), "utf8");
  const cut = src.indexOf("/* Flat chapter list");
  const window: Record<string, unknown> = {};
  const ctx = vm.createContext({ window });
  vm.runInContext(src.slice(0, cut), ctx, { filename: "data/curriculum.js" });
  /* the real Part V (pack A) goes first, so the fixture's two packs are the only packs */
  const C = window.BM_CURRICULUM as { parts: { beside?: boolean }[] };
  C.parts = C.parts.filter((p) => !p.beside);
  C.parts.push(JSON.parse(JSON.stringify(FIXTURE_PACKS)));
  vm.runInContext(src.slice(cut), ctx, { filename: "data/curriculum.js" });
  return window.BM_CURRICULUM as never;
}

export function motifs(c: CourseShape): (string | undefined)[] {
  const Q = run("data/quest.js").BM_QUEST as { regions: Record<string, { motif?: string }> };
  return c.parts.filter((p) => !p.beside).map((p) => Q.regions[p.id] && Q.regions[p.id].motif);
}
