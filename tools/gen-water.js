#!/usr/bin/env node
/* The water backdrop behind Mochi's porthole: public/models/mochi/water.png, a pixel-art
   Galapagos underwater scene (turquoise shallows, light rays, a green sea turtle, volcanic
   rock, algae, kelp, a Sally Lightfoot crab, rising bubbles) in the Dave the Diver manner:
   a smooth 3D character in front of pixel art. The strip is 8 frames of 64x64 side by side
   (512x64, frame f at x = 64*f); frame 7 leads back to frame 0, so it loops. Plain arithmetic,
   no randomness: the same bytes every run. Generators own their output: change this file
   (the palette below is the place to tune colours) and re-run, never edit the PNG.
   check-static `mochi-water` fails when the file's pixels or palette differ from render()'s (decoded,
   so a zlib change in Node is no false alarm), when it is not 512x64, or when it is over
   MOCHI_WATER_BYTES_MAX (src/data/mochi-limits.ts).
   Usage: node tools/gen-water.js [--check] */
"use strict";
const fs = require("fs");
const path = require("path");
const site = require("./lib/site");
const png = require("./lib/png");
const limits = require("../src/data/mochi-limits.ts");

const FILE = path.join(site.ROOT, "public/models/mochi/water.png");
const STALE = "public/models/mochi/water.png is stale: run node tools/gen-water.js";
const FRAMES = 8, SIZE = 64, WIDTH = FRAMES * SIZE, HEIGHT = SIZE;

/* the palette, index = position; every entry opaque */
const PALETTE = [
  [64, 224, 208, 255],  //  0 sun turquoise, the brightest water
  [44, 196, 196, 255],  //  1 turquoise, the second shade of the sunlit band
  [104, 236, 222, 255], //  2 light ray in the sunlit band, a touch lighter than the water
  [30, 150, 172, 255],  //  3 clear teal-blue
  [18, 100, 128, 255],  //  4 deeper blue-green
  [10, 22, 26, 255],    //  5 black-charcoal rock, dark
  [44, 44, 52, 255],    //  6 charcoal rock, light
  [104, 116, 44, 255],  //  7 olive algae and kelp
  [112, 204, 64, 255],  //  8 bright green algae and leaves
  [44, 86, 58, 255],    //  9 turtle, muted dark green
  [96, 146, 88, 255],   // 10 turtle shell highlight
  [232, 72, 40, 255],   // 11 Sally Lightfoot red-orange
  [4, 4, 6, 255],       // 12 black, the crab's eye
  [214, 242, 248, 255], // 13 bubble, pale
  [255, 255, 255, 255], // 14 bubble, light top-left pixel
  [52, 172, 190, 255]   // 15 light ray where it reaches the teal band
];
const [SUN, SUN2, RAY, TEAL, DEEP, ROCK, ROCK2, OLIVE, GREEN, TURTLE, SHELL, CRAB, BLACK, BUB, BUB2, RAY2] = PALETTE.map((_, i) => i);

/* a green sea turtle side on, swimming left: a domed shell with a lighter ridge, the head at the
   left, the flippers below (two poses, swapped every two frames) */
const TURTLE_SPRITE = ["....HHHHH..", "...SHHHHHHS", ".SSSSSSSSSS", "...........", "..........."];
const TURTLE_KEY = { S: TURTLE, H: SHELL };
const TURTLE_FLIPPERS = [[[3, 3], [8, 3]], [[4, 3], [4, 4], [9, 3]]];

/* the strip as data: what render() encodes */
function scene() {
  const px = new Uint8Array(WIDTH * HEIGHT);
  for (let f = 0; f < FRAMES; f++) frame(px, f);
  return { width: WIDTH, height: HEIGHT, palette: PALETTE, pixels: px };
}

function render() {
  return png.encode(scene());
}

function frame(px, f) {
  const ox = f * SIZE;
  const pixel = (x, y, c) => { if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) px[y * WIDTH + ox + x] = c; };
  const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) pixel(x + i, y + j, c); };
  const blit = (sprite, key, x, y) => sprite.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (key[row[i]] !== undefined) pixel(x + i, y + j, key[row[i]]); });
  const wave = (a) => Math.round(Math.sin(a * 2 * Math.PI));

  /* water: three bands, the sunlit one dithered across rows 15-17 */
  rect(0, 0, SIZE, 15, SUN);
  for (let y = 15; y < 18; y++) for (let x = 0; x < SIZE; x++) pixel(x, y, (x + y) % 2 ? SUN : SUN2);
  rect(0, 18, SIZE, 3, SUN2);
  rect(0, 21, SIZE, 24, TEAL);
  rect(0, 45, SIZE, 19, DEEP);

  /* three soft light rays from the surface, down and to the right, each shimmering by a pixel:
     3 px wide at the top, 2 px from row 10, dithered out between rows 20 and 32, and a
     quieter shade once they cross into the teal band */
  [[8, 0], [28, 1 / 3], [46, 2 / 3]].forEach(([x0, phase]) => {
    const shift = wave(f / FRAMES + phase);
    for (let y = 0; y <= 32; y++) {
      const x = x0 + shift + (y >> 1), w = y < 10 ? 3 : 2;
      if (y > 20 && (x + y + (y > 26 ? 1 : 0)) % 2) continue;
      for (let i = 0; i < w; i++) pixel(x + i, y, y < 21 ? RAY : RAY2);
    }
  });

  /* the turtle drifts up to two pixels left and back (0,0,1,1,2,1,1,0), so frame 7 leads into frame 0
     without a snap; its flippers swap every two frames */
  const tx = 40 - (f <= 4 ? f >> 1 : (8 - f) >> 1), ty = 24;
  blit(TURTLE_SPRITE, TURTLE_KEY, tx, ty);
  TURTLE_FLIPPERS[(f >> 1) & 1].forEach(([x, y]) => pixel(tx + x, ty + y, TURTLE));

  /* kelp, behind the rock: base at row 56, tip at row 36, swaying; leaves every 4 rows */
  for (let h = 0; h <= 20; h++) {
    const x = 12 + Math.round(Math.sin((f / FRAMES) * 2 * Math.PI + h / 12) * Math.min(1, h / 8));
    pixel(x, 56 - h, OLIVE);
    if (h % 4 === 2) { const s = (h >> 2) % 2 ? -1 : 1; pixel(x + s, 56 - h, GREEN); pixel(x + 2 * s, 56 - h, GREEN); }
  }

  /* volcanic rock: a jagged floor with a boulder at the left and one right of centre */
  const top = (x) => {
    let t = 55 + ((x * 5 + (x >> 2)) % 3 === 0 ? -1 : 0);
    [[10, 9, 51], [44, 10, 50]].forEach(([cx, w, peak]) => {
      const d = (x - cx) / w;
      if (Math.abs(d) <= 1) t = Math.min(t, peak + Math.floor(d * d * 6));
    });
    return t;
  };
  for (let x = 0; x < SIZE; x++) {
    for (let y = top(x); y < SIZE; y++) pixel(x, y, y === top(x) || (x * 3 + y * 7) % 11 === 0 ? ROCK2 : ROCK);
  }

  /* algae tufts on the rock: olive with bright green tips */
  [3, 24, 29, 52].forEach((x) => {
    const t = top(x);
    pixel(x, t - 1, OLIVE); pixel(x + 1, t - 1, GREEN); pixel(x + 1, t - 2, GREEN);
    if (x % 2) pixel(x - 1, t - 1, OLIVE);
  });

  /* the crab on the right boulder: 3x2 body, one black eye */
  rect(43, 48, 3, 2, CRAB);
  pixel(45, 48, BLACK);

  /* four bubbles; 6 rows a frame over a 48-row run so the cycle closes */
  [22, 34, 50, 58].forEach((x, i) => {
    const y = (((52 - 10 * i - 6 * f) % 48) + 48) % 48 + 8;
    if (i < 2) pixel(x, y, BUB);
    else { rect(x, y, 2, 2, BUB); pixel(x, y, BUB2); }
  });
}

/* what is wrong with the committed file, as messages (none when its pixels are current and it is within the cap) */
function problems(file = FILE) {
  if (!fs.existsSync(file)) return [STALE];
  const have = fs.readFileSync(file), out = [];
  let got;
  try { got = png.decode(have); } catch (e) { return ["public/models/mochi/water.png is not a PNG this generator wrote: " + e.message]; }
  const want = scene();
  const same = got.width === want.width && got.height === want.height && got.colorType === 3
    && JSON.stringify(got.palette) === JSON.stringify(want.palette.map(c => c.slice()))
    && Buffer.compare(Buffer.from(got.pixels), Buffer.from(want.pixels)) === 0;
  if (!same) out.push(STALE);
  if (have.length > limits.MOCHI_WATER_BYTES_MAX) out.push("public/models/mochi/water.png is " + have.length + " bytes, over " + limits.MOCHI_WATER_BYTES_MAX);
  return out;
}

function main() {
  if (process.argv.includes("--check")) {
    const p = problems();
    if (p.length) { p.forEach(m => console.error(m)); process.exit(1); }
    console.log("public/models/mochi/water.png is current");
    return;
  }
  fs.writeFileSync(FILE, render());
  console.log("wrote public/models/mochi/water.png");
}

if (require.main === module) main();
module.exports = { render, scene, problems, FILE, WIDTH, HEIGHT, FRAMES };
