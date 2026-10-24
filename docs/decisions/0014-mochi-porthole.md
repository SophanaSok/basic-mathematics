# 0014: Mochi's porthole

## Decision

Decided by the owner on 2026-10-20.

**Mochi swims in Galápagos water, seen through a round brass porthole.** The companion's box on chapter pages and the Arena is a window: a pixel-art underwater backdrop behind, the smooth 3D figure (or its 2D still) in front, a tinted glass over both, and a brass rim around them, in the manner of Dave the Diver (3D characters over hand-drawn pixel backdrops).
- The backdrop is generator-owned: `tools/gen-water.js` writes `public/models/mochi/water.png`, eight 64x64 frames side by side (512x64, an indexed PNG under `MOCHI_WATER_BYTES_MAX` 16,000 bytes; about 1 KB), through a dependency-free encoder, `tools/lib/png.js`. The `mochi-water` static rule holds the committed file to the generator's bytes. Change the palette or the sprites in the generator and re-run `npm run gen:water`.
- The layers, inside `.companion-pic` (8rem in the sidebar, 4rem docked and in the Arena; its box, label and role are unchanged): `.companion-window` fills the box with the water (`overflow: hidden`, `image-rendering: pixelated`, so the 64 px frames draw at exactly 2x and 1x), in it `.companion-still` (the pose-sheet still) and the canvas, both drawn smooth again, the window's `::after` glass (glare, vignette, a cyan tint over Mochi) and the brass rim as the pic's `::after`, a ring of inset shadows over the window's edge (`--porthole-w`, 8 px in the sidebar and 6 px docked), so the water keeps whole pixels under it. The porthole tokens are paper tokens in `src/styles/tokens.css` (`--porthole-*`, `--water-*`), deeper under the dark panel, restated for print as the `contrast` rule asks.
- Motion: the site bars infinite CSS animations (the `animations` rule), so the water steps from the stage's own frame loop: `MochiStageOptions.tick(t)` runs after each drawn frame while motion is allowed and the companion sets the window's frame to `floor(t / 300) mod 8`. Mochi bobs 0.045 units (raised from 0.025 at the owner's eye test) and rolls 0.02 rad on slow sines (`sway(t)` in `src/mochi/stage.ts`, about 2 px at the sidebar size).
- Reduce motion (the switch or the device): no bob, no tick, the water holds its frame; a stop between throttled frames draws the rest pose first, so no held frame sits mid-bob. In 2D mode (no WebGL, `?3d=off`, the list tier) the water is a still on its first frame, and a dropped stage (a colour change, a failure, context loss) puts it back there. Study mode, print and forced colours hide the figure as before.

## Why

The owner wants Mochi to feel alive in a place, not pasted on the paper. A window with water behind it does that at no cost to the renderer: three CSS layers around the canvas that already exists, one small image, no new chunk, no lights, no post-processing. Pixel art for the backdrop keeps the file tiny and lets the generator own it.

## What this changes

- W-1 `tools/gen-water.js`, `tools/lib/png.js`, `public/models/mochi/water.png`, `MOCHI_WATER_BYTES_MAX`, the `mochi-water` rule, `gen:water`; the `mochi-model` stray-file rule lets `water.png` through (and `decor.png` too, since 0015/X-4).
- W-2 `src/mochi/stage.ts` (`sway`, the rest-pose stop, `tick`), `src/mochi/index.ts`, `src/mochi/stage.test.ts`.
- W-3 `src/ui/companion.ts` (the window and still spans, the water URL and frame), `assets/game.css`, `src/styles/tokens.css`, `tools/game/mochi.test.js` (case 12: the water steps in 3D and holds under reduced motion), `tools/game/companion.test.js`.
- W-4 this record; 0013's stage line points here.

## Threat model, stated plainly

- A static same-origin image, fetched only where the companion mounts (the `pages` suite's Mochi rule already covers `/models/mochi/`); the CSP is unchanged.
- No store, no network beyond the file, nothing from untrusted input.

## Deferred

- Pixelating Mochi to the backdrop's grid (a `RenderPixelatedPass`, which needs a composer and vendor exports).
- Caustic light over Mochi; rivets on the rim.
- A pose sheet rendered with the water tint baked in, so the 2D still and the 3D figure match under the glass.
- Carried minors from the reviews: the turtle snaps a pixel at frames 4 and 0 (a ping-pong drift); a tamper case for a stale or oversize strip; the strip's freshness check is byte-level (a zlib change needs `npm run gen:water`).

## Status

Decided 2026-10-20. W-1 and W-2 shipped in #261, W-3 in #262; W-4 is this record.
