/* The caps the form models are held to: the plan's numbers, in one place.
   Pure data, written by hand: src/data/form-models.test.ts imports it and
   tools/lib/form-models.js (the `form-models` rule) requires it, so neither retypes them. */

export const MODEL_BYTES_MAX = 1500000;
export const MODEL_TRIANGLES_MAX = 30000;
export const THUMB_BYTES_MAX = 160000;   // the baked look compresses worse than flat colour
export const IMAGE_BYTES_MAX = 400000;
