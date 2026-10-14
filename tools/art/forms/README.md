# The form models: a scripted Blender pipeline

The five stages of the learner's avatar (`src/data/forms.ts`) are built here as 3D
models: original samurai-mecha figures in PBR, with a shared skeleton and emotes, exported
as GLB files for the progress page's viewer. Everything is a script, so the models are
generated output: change the Python here and re-run; never hand-edit a GLB.

## Run

```
~/.local/bin/blender -b --factory-startup --python tools/art/forms/build.py -- --stage 3 --out .cache/forms/raw
```

One Blender process per stage (Blender 5.2 LTS; `--factory-startup` keeps add-ons out).
It writes `form-<n>.glb` and a sidecar `form-<n>.json` (stage, height, triangles, bones,
materials, clips, the Blender version) into `--out`. `npm run gen:forms` (tools/gen-forms.js)
runs every stage, packs the GLBs and writes the manifest the site reads; `.cache/` is
scratch and gitignored.

## The files

- `build.py`: the entry. Clears the scene, makes the materials and the armature, builds
  the stage through its builder in `stages/` (the gray mannequin for a stage without
  one yet), exports.
- `kit.py`: the parts kit. Plates with inset panel lines, cylinders, grooved joints,
  bolts, domes, wedges; the Bevel (hardened normals) and Weighted Normal, Mirror, Boolean
  and Array modifiers; `bone_frame` for laying a part along a bone. Every helper takes
  `at` and `rot` and links the part to the `forms` collection.
- `materials.py`: the five materials the site swaps by name: `armor` (white lacquer),
  `accent` (a neutral gray the site tints to the learner's Part hue), `trim` (gold),
  `metal` (gunmetal joints and frame) and `glow` (emissive, the lantern and the visor).
- `rig.py`: `Proportions` and `proportions_for(stage)` (a mecha build scaled to the
  stage's height: 0.6, 0.8, 1.1, 1.35, 1.75), the armature with its fixed bone names
  (`root, hips, spine, chest, neck, head`, `shoulder/upper_arm/forearm/hand .L/.R`,
  `thigh/shin/foot .L/.R`), rigid skinning (one vertex group at 1.0 per part), the mannequin.
- `export.py`: the triangle cap (30,000 per stage), the glTF export (modifiers applied by
  the exporter, Y up, actions as named clips) and the sidecar.
- `stages/`: one builder per stage, written with `Fig` from `stages/common.py`: a list of
  parts, each a shape of a size at a place on a bone in a material. The figure is
  modeled Z up, facing -Y, feet at z = 0, in meters; the export turns that into Three's
  Y up facing +Z.

## Building a stage

Build one side of a limb at a time (`Fig.sides()`), since a part follows exactly one
bone; the Mirror modifier is for centerline parts. Keep the five material names; the
site does not know any other. Keep the figure's rest pose presentable: idle frame 0 is
what the viewer shows under reduced motion. Look at the result before committing it:
render a turntable (a contact sheet of eight views at the viewer's framing) and judge the
silhouette first, the detail second. Richness comes from bevels, panel insets, trim
edges and bolts, not from polygon count: the Wayfinder is under 9,000 triangles.

## The checks

- The caps live in `src/data/form-limits.ts` (1.5 MB a model, 30,000 triangles, 120 KB a
  thumbnail). The other constants (the idle at 3 s, the thumbnail at 512x640 RGBA, the
  allowed extensions, at most four textures, each square at 1024 or 2048) live in
  `tools/lib/form-models.js`.
- The rule runs in `check:static` as `form-models`:
  `node tools/check-static.js --only=form-models`.
- After any edit under `tools/art/forms/`, run `npm run gen:forms` and commit its
  outputs. The manifest holds a hash of the scripts, and the check fails until it matches.
- A new extension or texture format means editing `EXTENSIONS_OK` and the image checks in
  `tools/lib/form-models.js`, and the CSP question that comes with it (see the decision).

## The emotes

`emotes.py` keys five clips on every stage: `idle` (3 s, looping), `wave`, `bow`, `flex`
and `spin`. Every clip starts and ends on the rest pose, every bone is keyed at rest on
frame 0 (so the idle's frame 0 is the pose the viewer shows under reduced motion), and
the idle loops. The clips drive `hips`, `chest`, `head` and the limbs by name; bones a
stage lacks are skipped. To look at them: `--renders emotes` draws a contact sheet,
`form-<n>-emotes.png`, beside the raw output.

## The design

An original samurai-mecha, not a likeness of any franchise, carrying a beacon staff
rather than a blade (children use the site). White lacquer plates over a dark frame,
gold edges, the learner's hue on a sash, a glow for what shines. The stages are one
figure growing: a floating core (Pip), a slim runner frame (Sprig), light armor and the
staff (Wayfinder), heavy armor with sode and orbit drones (Surveyor), the full commander
with crest, halo frame and a long beacon (Luminary). The plan and the decision record
(`docs/decisions/0008-form-models.md`) say why.
