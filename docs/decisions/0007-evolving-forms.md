# 0007: Evolving forms

## Decision

Decided by the owner on 2026-10-12.

**A learner avatar called a form.** Five stages: Pip, Sprig, Wayfinder, Surveyor and Luminary (the owner may rename them). They unlock by the existing XP level, at levels 1, 3, 6, 10 and 15 (`src/data/forms.ts`), each an existing rank boundary.
- No new progression system, no currency, no shop.
- The stage is derived from the level and recorded in `bm.game.v1.form.got` (stage to first-reached time). It merges as a union keeping the earliest time, so a reached stage is never lost, even if the thresholds change.
- The learner may wear any reached stage (`form.wear = { n, at }`, merged as the later choice). It syncs, so the form follows the account.
- The device-local `bm.run.v1.seen.form` makes the unlock announced once.

**Where it shows.**
- The form stands on the current island of the course world in place of the marker octahedron: baked, two draw calls, scaled 0.75, its cloak in the Part's hue.
- The progress page shows it live in "Your form", with the path of five, Equip and a larger view.
- The unlock plays a short skippable evolution on the progress page (card F-6, in progress: anticipation, a white-out, the reveal, a caption; a cut under reduced motion or Study mode) and toasts once elsewhere.
- Without WebGL a card with the stage number stands in.

**Procedural only.** No model files. `buildForm` in `src/world/forms.ts` is the one seam a model could replace later.

## Why

The owner asked for the excitement of a creature evolving without a competing progression. Levels exist, pay XP once per exercise and merge by max per day, so they are duplicate-safe. The master plan's R3 `marker` cosmetic slot is taken by the form, so later cosmetics dress it rather than replace it.

Threat model, stated plainly:
- Only the owner's own `user_state` row holds `form`, and only that owner reads it.
- A forged record buys the forger their own final avatar and nothing else.
- The merge never throws on damaged input.
- There is no SQL change and no server flag.

## What this changes

- Cards F-1 to F-7: the five forms as data and the pure stage logic (`src/data/forms.ts`, `src/core/forms.ts`), the merge rule (`mergeForm` in `src/sync/merge.ts`), the builder and the island figure (`src/world/forms.ts`, `src/world/form-scene.ts`), the progress page and the unlock (`src/ui/forms.ts`, `src/ui/form-view.ts`), and these words.
- A `form` record in `bm.game.v1`, a `seen.form` flag in `bm.run.v1`, and a "Your form" section on the progress page.

## What it requires that did not exist before

- The form record and its merge rule.
- The forms builder, and the low tier's triangle cap raised from 9000 to 9500 (`src/world/tiers.ts`) for the last form on a finished course.
- The world chunk loaded on the progress page too (the second importer in `tools/check-dist.js`).
- The `form` bus event.

## Status

Decided by the owner, 2026-10-12. Cards F-1 to F-5 built; F-6 in progress.
