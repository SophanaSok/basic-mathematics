/* The caps the Mochi models are held to: the plan's numbers, in one place.
   Pure data, written by hand: tools/lib/mochi-model.js (the `mochi-model` rule) requires
   it, so nothing retypes them. */

export const MOCHI_BYTES_MAX = 1450000;          // one variant's GLB
export const MOCHI_TRIANGLES_MAX = 20000;
export const MOCHI_IMAGE_BYTES_MAX = 400000;     // one texture
export const MOCHI_WHOLE_BYTES_MAX = 1600000;    // one variant's whole download: the GLB plus its five textures
export const MOCHI_POSES_BYTES_MAX = 160000;     // one sheet of nine stills, WebP
export const MOCHI_WATER_BYTES_MAX = 16000;      // the water backdrop strip, 8 frames of 64x64
