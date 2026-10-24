import { describe, expect, it } from "vitest";
import { MOCHI_ACTS, MOCHI_CLIPS, MOCHI_MOODS } from "../../data/mochi-model.ts";
import { ACT_CLIP } from "./actions.ts";

describe("ACT_CLIP", () => {
  it("names only clips in the file", () => {
    Object.values(ACT_CLIP).forEach((c) => expect((MOCHI_CLIPS as readonly string[]).includes(c), c).toBe(true));
  });
  it("names only care acts or moods", () => {
    const ok: readonly string[] = [...MOCHI_ACTS, ...MOCHI_MOODS];
    Object.values(ACT_CLIP).forEach((c) => expect(ok.includes(c), c).toBe(true));
  });
});
