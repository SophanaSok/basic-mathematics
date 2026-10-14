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
- A shared skeleton (`root, hips, spine, chest, neck, head`, the limbs `.L`/`.R`, and per stage the `orbit` pivot with its drones and `halo`); a stage lacking a bone has that bone's motion skipped. Pip's rig is `root, hips, chest, head`.
- The manifest (`src/data/form-models.ts`, generated) carries per stage `n`, `file`, `thumb`, `bytes`, `triangles`, `height`, `clips`, `slots` and `compression` ("none" today), plus the generator hash. Phase 1 shipped no texture: the materials were factors. Phase 2 (below) adds two baked textures a stage and an `images` list to each entry.

## Why

The owner asked for the forms to be far higher fidelity, like a hard-surface mecha model on Sketchfab (white lacquer plates, red and gold accents, PBR), and for the learner to turn the figure and play emotes the way a game lets you. A scripted pipeline keeps that within the repo's rules: the models are generator output (change the Python, re-run, commit the outputs; no hand-edited binaries), CI holds them to a manifest and caps without Blender, and the procedural figure stays as the map's marker and the viewer's fallback.

## What this costs (accepted by the owner)

- `bundle/three.js` grew from 551,790 to about 600,700 bytes raw: Three's core cannot be split between chunks, so the animation, skinning and PBR code the viewer needs sits in the chunk the map pages load too. The viewer's own code is two chunks fetched only on the progress page: `bundle/three-model.js` (the GLTF loader and the room environment, about 49 KB) and `bundle/form-model.js` (the kit, about 5 KB).
- `bundle/world.js` grew from 30,346 to about 31,100 bytes (`src/world/form-scene.ts` now holds either figure).
- Committed binaries (phase 1): five GLBs (73 KB to 486 KB) and five PNG thumbnails in `public/models/forms/`.
- Quantized plain GLBs, so no CSP change. Meshopt compression would need `'wasm-unsafe-eval'` and embedded textures would need `blob:`; neither is allowed. `--meshopt` exists in `tools/gen-forms.js` for a stage that cannot meet its size otherwise, and using it is a separate decision.
- The `/models/*` revalidate header rule (`tools/lib/headers.js`), as for pages: names carry no hash.
- The `form-models` static rule (`tools/lib/form-models.js`) and the caps in `src/data/form-limits.ts`: 1.5 MB a model, 30,000 triangles, 160 KB a thumbnail (it was 120 KB before the bake, see phase 2), 400 KB a texture, 1.5 MB a stage with its textures.
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

- The PNG strip and the dialog zoom (V-9).
- The browser cases (V-10).
- The README and `OPERATIONS.md` notes (V-11).

## Status

Decided by the owner, 2026-10-14. Built the same day: the pipeline and all five stages (A-1 to A-5), the generator (A-6), the rule (A-7), the clips (A-8), the renders (A-9) and the viewer through the model on the progress page (V-1 to V-8). The list above says what waits. Phase 2 (the texture bake, A-11) is recorded below.

## Phase 2: the texture bake (2026-10-14)

**Decision (the owner, 2026-10-14: "external webp files").** Each stage ships two baked textures as plain files beside its GLB, not embedded in it.

- Why external: an embedded image reaches the loader as a `blob:` URL, which would have needed `blob:` in the CSP `img-src` and `connect-src`. A file is a same-origin fetch under the `/models/*` revalidate header rule, so the CSP does not change. Three's GLTFLoader reads `EXT_texture_webp` natively and resolves the uris against the GLB's own path.
- The textures, both 1024x1024 lossy WebP at quality 85:
  - `public/models/forms/form-<n>-color.webp` is the sRGB base color: chipped edges from a Bevel-node edge mask broken up by noise, grime in the crevices from ambient occlusion, and a slow brightness mottle. The `accent` region is baked at its neutral gray, so the site's multiply tint still gives the learner's hue.
  - `public/models/forms/form-<n>-surface.webp` packs occlusion in R, roughness in G and metallic in B, the packing glTF's occlusion and metallic-roughness textures share.
- The bake (`tools/art/forms/bake.py`) runs in Cycles on the GPU (`--cpu` for the CPU) as two EMIT passes, because a diffuse color pass is black on metallic surfaces. It applies every modifier but the Armature, Smart-UV-projects all parts into one atlas per stage, bakes, and rebuilds the five materials in the shape the glTF exporter reads. `build.py --no-bake` skips it for a quick flat build, with no images.
- The export is a separate glTF (`form-<n>.gltf`, a `.bin` and the WebP files, `export_keep_originals`), never embedded, with `EXT_texture_webp`. gltfpack embeds images when it writes a `.glb`, so `tools/gen-forms.js` packs to `.cache/forms/pack/form-<n>.gltf` and assembles the GLB itself with `writeGlb` in `tools/lib/glb.js`, copying the images beside it.
- The manifest entry gains `images`: the paths under `models/forms/`, in the GLB's order, and `[]` for a stage without textures. `bytes` is the GLB alone.
- The `form-models` rule: `EXTENSIONS_OK` gains `EXT_texture_webp`. Each texture must be a file (an embedded one is a problem), WebP by its magic bytes, square at 1024 or 2048, and at most `IMAGE_BYTES_MAX` (400,000 bytes, new in `src/data/form-limits.ts`). A stage has at most four, the GLB and its textures together stay under `STAGE_BYTES_MAX` (1,500,000 bytes), and the GLB's uris must equal the manifest's `images`. `THUMB_BYTES_MAX` rose from 120,000 to 160,000 bytes, because the baked look compresses worse. `tools/fixtures/forms/baked/` holds a textured sample (a cube) for the reader tests.
- Costs, approximate (the final numbers land in the manifest):
  - A full `npm run gen:forms` takes about 15 minutes on this machine, roughly two to three minutes of bake a stage.
  - A stage's download grows by about 70 to 180 KB for the color texture and 130 to 240 KB for the surface texture.
  - The GLBs grow with their UVs (stage 4 went from 351 KB to about 505 KB).
- Unchanged: no CSP change, no new storage key, no account or sync path, and the threat model above.
