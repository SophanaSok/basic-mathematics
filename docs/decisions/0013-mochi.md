# 0013: Mochi, the companion

## Decision

Decided by the owner on 2026-10-19.

**Mochi is the learner's companion.** Mochi is an original axolotl mood avatar the owner built in Blender (outside this repo). It replaces the learner's form in the companion slot on chapter pages and the Arena. The form keeps the progress page, the unlock toast and the level popover.
- The model is repacked for the site's Content Security Policy rather than the policy changed: no `'wasm-unsafe-eval'`, no `blob:`, so decision 0008's stance holds. The repack is gltf-transform quantize (16-bit positions), sparse morph accessors and WebP textures kept external, with no meshopt; the `mochi-model` rule fails a meshopt file.
- Mochi replaces the form in the companion slot. The voice stays never-punitive.
- Moods: nine looping ones (idle, happy, excited, sad, angry, surprised, thinking, sleepy, sleeping) and three idle one-shots (idle_look, idle_stretch, idle_wiggle).
- A miss is thinking. A second miss on the same exercise is sad for 2 s, then thinking with "Let's look again." Angry only faces the boss (its first appearance in a set, a heart lost), never the learner.
- Idle after 8 s at a field reads thinking, 60 s sleepy, 120 s sleeping; input wakes Mochi with surprised. A first-try correct answer under 5 s from the field's focus is surprised, then happy; three correct in a row is excited; the count is never voiced (R3 owns the streak).
- The intro line: "This is Mochi, your companion. It keeps you company while you work."
- The stage is 3D over the 2D still, with a 0.4 s fade. Failure, context loss, `?3d=off`, Save-Data, no WebGL 2, the list tier, Study mode and forced colors keep the still. There is no retry on that page after a failure.
- Off and hidden rules carry over from 0012: the Companion switch, the `companion: "off"` kill switch, Study mode, print, the settings sheet, a narrow screen's focused field. The captions, the throttle and the never-punitive rules of 0012 still hold.
- Accessibility: the canvas is `aria-hidden`; the still is a `role=img` labelled "Mochi, your companion, <mood>". Reduced motion (the Reduce motion switch or the device) gives no idle variations and 0.9 s fades instead of 0.35 s, and frames stop once a fade ends.

## Why

A character with a face reads as company; the form, a figure without one, does not. The owner built Mochi and wanted it at the learner's side while they work.

## What this changes

- M-1 `tools/gen-mochi.js`, `tools/lib/mochi-model.js`, `src/data/mochi-limits.ts`, `src/data/mochi-model.ts`, the `mochi-model` rule in `tools/check-static.js`, `npm run gen:mochi` (source `BM_MOCHI_SRC`, default the Blender project's `site/`). Outputs in `public/models/mochi/`: `mochi-<pink|lilac>.glb` (about 1.01 MB, 18,762 triangles, 12 clips, 33 morph targets), five WebP textures a variant and `mochi-<v>-poses.webp` (nine 320 px stills, 2880x320, about 70 KB).
- M-2 `src/learn/mood.ts` (nine moods, stepped reactions) and the 2D sheet in `src/ui/companion.ts`.
- M-3a `src/mochi/` (avatar, stage, index: the renderer, the fixed camera, DPR through the tier budget, pause off-screen and when hidden, 10 s load timeout). M-3b the entries and guards: the Arena entry imports `assets/three-loader.js`; the `pages` suite allows Mochi's files where `[data-companion]` is.
- M-4 the 3D stage over the still, and a dev-only QA panel (`?mochi=qa`, under `import.meta.env.DEV`). M-4b, the sidebar pinned under the contents, is in flight.
- M-5 the pref `mochi` (`"lilac"`; unset is pink) and the sheet's "Companion color" choice.
- M-6 `tools/game/mochi.test.js` in `test:browser:3d`, in flight. M-7 is this record and the wording.
- Caps: `MOCHI_BYTES_MAX` 1,450,000, `MOCHI_TRIANGLES_MAX` 20,000, `MOCHI_IMAGE_BYTES_MAX` 400,000, `MOCHI_WHOLE_BYTES_MAX` 1,600,000, `MOCHI_POSES_BYTES_MAX` 160,000.
- A chapter page for a WebGL learner fetches about 1.2 MB of model and textures plus the Three.js core, revalidated after the first load. Each avatar holds about 8.6 MB of GPU morph textures, so the companion never keeps two alive; a color change disposes the old stage first.
- 0012 is superseded in part: "the form is the companion" goes to Mochi; the rest stands.

## Threat model, stated plainly

- Static same-origin files; the CSP is unchanged.
- The pref is device-local. The QA panel exists only in DEV builds.
- No new store, and no network beyond the model files.
- Nothing the companion says comes from untrusted input.

## Deferred

- A pose sheet rendered from the GLB in headless Chromium, so the still and the 3D look match exactly.
- Part hues.
- Immutable model URLs.
- Disabling the color choice while the companion is off.
- Keeping 3D off on the docked phone layout, if the owner prefers.

## Status

Decided 2026-10-19. M-1 to M-5 shipped 2026-10-19; M-4b, M-6 and this record follow.
