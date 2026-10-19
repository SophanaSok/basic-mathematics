/* The form models' manifest: five stages in order, the clips and slots the viewer binds
   to, the caps of form-limits.ts, and modelFor answering only for a real stage. The files
   themselves are held by tools/check-static.js (`form-models`). */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIPS, EMOTES, FORM_MODELS, SLOTS, modelFor } from "./form-models";
import { MODEL_BYTES_MAX, MODEL_TRIANGLES_MAX } from "./form-limits";

const sorted = (a: readonly string[]) => [...a].sort();

describe("FORM_MODELS", () => {
  it("holds stages 1 to 5 in order", () => {
    expect(FORM_MODELS.map(m => m.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it("gives each model every clip and every slot, in any order", () => {
    for (const m of FORM_MODELS) {
      expect(sorted(m.clips)).toEqual(sorted(CLIPS));
      expect(sorted(m.slots)).toEqual(sorted(SLOTS));
    }
  });

  it("keeps each model within the caps", () => {
    for (const m of FORM_MODELS) {
      expect(m.bytes).toBeGreaterThan(0);
      expect(m.bytes).toBeLessThanOrEqual(MODEL_BYTES_MAX);
      expect(m.triangles).toBeGreaterThan(0);
      expect(m.triangles).toBeLessThanOrEqual(MODEL_TRIANGLES_MAX);
    }
  });

  it("names relative, distinct files", () => {
    const paths = FORM_MODELS.flatMap(m => [m.file, m.thumb]);
    for (const p of paths) expect(p.startsWith("/") || /^[a-z]+:/.test(p)).toBe(false);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("names a pose sheet for its own stage", () => {
    for (const m of FORM_MODELS) {
      expect(m.poses.startsWith("models/forms/")).toBe(true);
      expect(m.poses.endsWith("-poses.webp")).toBe(true);
      expect(m.poses).toContain("form-" + m.n + "-");
    }
  });

  it("lists at most four textures, each named for its own stage", () => {
    for (const m of FORM_MODELS) {
      expect(m.images.length).toBeLessThanOrEqual(4);
      for (const p of m.images) expect(p).toMatch(new RegExp("^models/forms/form-" + m.n + "-[a-z]+\\.webp$"));
    }
  });

  it("lists exactly the colour and surface textures of its stage", () => {
    for (const m of FORM_MODELS) {
      expect(sorted(m.images)).toEqual(["models/forms/form-" + m.n + "-color.webp", "models/forms/form-" + m.n + "-surface.webp"]);
    }
  });

  it("has the files for the textures it lists", () => {
    for (const m of FORM_MODELS) for (const p of m.images) expect(existsSync(resolve(__dirname, "../../public", p))).toBe(true);
  });

  it("offers only emotes that are clips", () => {
    for (const e of EMOTES) expect(CLIPS as readonly string[]).toContain(e);
  });
});

describe("modelFor", () => {
  it("finds a real stage", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(modelFor(n)?.n).toBe(n);
  });

  it("answers null for a stage that is not one", () => {
    for (const n of [0, 6, NaN, -1, 2.5]) expect(modelFor(n)).toBeNull();
  });
});
