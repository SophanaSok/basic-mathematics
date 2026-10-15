/* The list in exercise-keys.ts against the chapter pages: it must be exactly what
   tools/gen-exercise-keys.js writes, and shaped as the server-side statistics will assume. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { EXERCISE_KEYS } from "./exercise-keys.ts";

const gen = createRequire(import.meta.url)("../../tools/gen-exercise-keys.js");

describe("the exercise keys", () => {
  it("are what the generator writes (run npm run gen:exercise-keys)", () => {
    expect(gen.render(gen.pageKeys()), "src/data/exercise-keys.ts is stale: run npm run gen:exercise-keys").toBe(readFileSync(gen.FILE, "utf8"));
  });
  it("are well formed and not repeated", () => {
    expect(EXERCISE_KEYS.filter((k) => !/^[a-z0-9-]{1,40}\/[a-z0-9-]{1,40}$/.test(k))).toEqual([]);
    expect(EXERCISE_KEYS.length).toBe(new Set(EXERCISE_KEYS).size);
  });
});
