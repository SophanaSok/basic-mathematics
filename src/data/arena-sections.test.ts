/* The list in arena-sections.ts against the generators themselves: data/gen/*.js run in a
   vm, as the Arena page runs them, and every section a generator names collected in the
   curriculum's reading order. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { ARENA_SECTIONS } from "./arena-sections.ts";

const ROOT = join(import.meta.dirname, "..", "..");

function load(files: string[]): Record<string, any> {
  const win: Record<string, any> = {};
  win.window = win;
  createContext(win);
  files.forEach((f) => runInContext(readFileSync(join(ROOT, f), "utf8"), win, { filename: f }));
  return win;
}

describe("the sections the Arena can ask about", () => {
  it("are exactly the generators' sections, in reading order", () => {
    const gen = load(["core", "part1", "part2", "part3", "part4"].map((p) => "data/gen/" + p + ".js")).BMGen;
    const C = load(["data/curriculum.js"]).BM_CURRICULUM;
    const order: string[] = [];
    C.chapters.forEach((ch: any) => ch.sections.forEach((s: any) => order.push(ch.id + "#" + s.id)));
    const named = new Set<string>(gen.list().map((g: any) => g.section));
    expect([...named].filter((id) => !order.includes(id))).toEqual([]);
    expect(ARENA_SECTIONS).toEqual(order.filter((id) => named.has(id)));
  });
});
