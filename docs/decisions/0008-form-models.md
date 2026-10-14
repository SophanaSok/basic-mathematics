# 0008: Form models

## Decision

Decided by the owner on 2026-10-14. It supersedes in part 0007, which said "Procedural only. No model files."

**The five forms become 3D models.** Pip, Sprig, Wayfinder, Surveyor and Luminary are PBR samurai-mecha figures, exported as GLB files and authored in Blender by script (`tools/art/forms/`: headless, reproducible; the Blender MCP add-on is optional, never required).
- Original design, no franchise likeness, and a beacon staff rather than a blade (children use the site).
- Full PBR in the viewer: a room environment through PMREM, one key light casting a soft shadow onto a shadow-catching ground, ACES tone mapping, sRGB output.
- The emotes are keyframed in Blender: idle, wave, bow, flex, spin.
- They show only on the progress page's viewer and dialog. The course map keeps the procedural toon marker (`src/world/forms.ts`), which is also the fallback when a model fails to load.
- The stage logic, the sync and the merge are as 0007 left them; nothing about unlocking changes.

**The contract** (the same for every stage):
- Five material slots, by name: `armor`, `accent`, `trim`, `metal`, `glow`. The site tints `accent` to the learner's Part hue.
- Five clips: `idle`, `wave`, `bow`, `flex`, `spin`. The idle is 3.0 s and its frame 0 is the rest pose (the viewer shows it under reduced motion).
- Feet at y = 0, facing +z, in meters, Y up.
- A shared skeleton; a stage lacking a bone has that bone's motion skipped.

## Why

The owner asked for the forms to be far higher fidelity, like a hard-surface mecha model on Sketchfab (white lacquer plates, red and gold accents, PBR), and for the learner to turn the figure and play emotes the way a game lets you. A scripted pipeline keeps that within the repo's rules: the models are generator output (change the Python, re-run, commit the outputs; no hand-edited binaries), CI holds them to a manifest and caps without Blender, and the procedural figure stays as the map's marker and the viewer's fallback.

## What this costs (accepted by the owner)

- `bundle/three.js` grew from 551,790 to about 600,600 bytes raw: Three's core cannot be split between chunks, so the loader and the PBR path come with it.
- `bundle/world.js` grew from 30,346 to about 31,100 bytes (`src/world/form-scene.ts` now holds either figure).
- Committed binaries: five GLBs (73 KB to 486 KB) and five PNG thumbnails in `public/models/forms/`.
- Quantized plain GLBs, so no CSP change. Meshopt compression would need `'wasm-unsafe-eval'` and embedded textures would need `blob:`; neither is allowed. `--meshopt` exists in `tools/gen-forms.js` for a stage that cannot meet its size otherwise, and using it is a separate decision.
- The `/models/*` revalidate header rule (`tools/lib/headers.js`), as for pages: names carry no hash.
- The `form-models` static rule (`tools/lib/form-models.js`) and the caps in `src/data/form-limits.ts`: 1.5 MB a model, 30,000 triangles, 120 KB a thumbnail.
- The generator hash in the manifest (`src/data/form-models.ts`): the sha256 of the `.py` files under `tools/art/forms/`, so an edit to the scripts without a re-run fails the check.
- The outputs are reproducible in substance, not in bytes: Blender's export and Eevee's render differ by a few bytes between runs. So `--check` holds numbers (bytes, triangles, slots, clips, the hash), not file hashes, and a regeneration is committed when the art changed, not after every run.

## Threat model, stated plainly

- The models are static public files the site serves to everyone. No account, sync or money path reads them, and no flag gates them.
- A model file is data the loader parses (Three's GLTFLoader), from the site's own origin only (`connect-src` is unchanged).
- Nothing new is written anywhere: no storage key, no `user_state` field, no SQL.
- CI never runs Blender; it holds the committed outputs to the manifest and the caps.

## What it requires that did not exist before

- `tools/art/forms/` (the Blender scripts), `tools/gen-forms.js` (`npm run gen:forms`) and `tools/lib/glb.js` (a GLB reader the checks use).
- `public/models/forms/` and the manifest `src/data/form-models.ts`.
- `src/model/` (the loader and the clips' player), `src/ui/form-view.ts` using it, and `src/world/form-scene.ts`.
- The `form-models` static rule and `src/data/form-limits.ts`.

## What still waits

- Phase 2: baked textures (A-11).
- The PNG strip and the dialog zoom (V-9).
- The browser cases (V-10).
- The README and `OPERATIONS.md` notes (V-11).

## Status

Decided by the owner, 2026-10-14. Built: the pipeline and all five stages (A-1 to A-5), the clips (A-8), the rule (A-7) and the viewer (V-1 to V-7; V-8, the model on the progress page, was in review when this was written).
