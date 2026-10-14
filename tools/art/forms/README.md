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
materials, clips, the Blender version) into `--out`. The other arguments: `--renders
turntable,thumb,emotes` draws a contact sheet of eight views, the strip's thumbnail and
one still per clip (render.py; the sheets go under `.cache/forms/turntable/`, the
thumbnail beside the GLB); `--engine auto|eevee|cycles|workbench` (auto is Eevee here,
Cycles on the GPU or CPU otherwise); `--cpu` keeps Cycles off the GPU (gen-forms passes
it when `llm-switch status` shows a claimant up); `--no-clips` builds a bare rest-pose
model. `npm run gen:forms` (tools/gen-forms.js) runs every stage with `--renders thumb`,
packs the GLBs and writes the manifest the site reads; `.cache/` is scratch and gitignored.

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
- `bake.py`: the texture bake (see "The bake").
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

- The caps live in `src/data/form-limits.ts` (1.5 MB a model, 30,000 triangles, 160 KB a
  thumbnail, 400 KB a texture, 1.5 MB a stage with its textures). The other constants (the idle at 3 s, the thumbnail at 512x640 RGBA, the
  allowed extensions, at most four textures, each a WebP file square at 1024 or 2048) live in
  `tools/lib/form-models.js`.
- The rule runs in `check:static` as `form-models`:
  `node tools/check-static.js --only=form-models`.
- After any edit under `tools/art/forms/`, run `npm run gen:forms` and commit its
  outputs. The manifest holds a hash of the scripts, and the check fails until it matches.
  A full run rewrites every GLB, PNG and the manifest, and Blender's export and Eevee's
  render differ by a few bytes between runs, so restore the stages whose art did not
  change from main before committing (`git checkout main -- public/models/forms/form-N.glb
  public/models/forms/form-N.png public/models/forms/form-N-color.webp
  public/models/forms/form-N-surface.webp`; the manifest's numbers for them are unchanged, so the
  check still passes) and commit only the stages that changed plus the manifest. A
  `--stage N` run keeps the manifest's old hash, so the check stays red until every stage
  is rebuilt; an edit to a shared file (kit, rig, materials, emotes, export) changes every
  stage and wants a full run.
- Comments and docstrings follow the site's US English lock (armor, gray, color, center,
  meters); the `us-english` check scans prose, not these files, so hold to it by hand.
- A new extension or texture format means editing `EXTENSIONS_OK` and the image checks in
  `tools/lib/form-models.js`, and the CSP question that comes with it (see the decision).
  Textures are files precisely so that the CSP stays as it is.

## The bake

`bake.py` gives each stage two 1024-square textures, so the white lacquer shows chipped
edges and grime instead of flat factors. It runs inside `build.py`, after the parts are
built and before the clips.

- It applies every modifier but the Armature, Smart-UV-projects all parts and packs them
  into one atlas per stage, then bakes in Cycles (the GPU, or the CPU with `--cpu`).
- Two atlases come out. `form-<n>-color.webp` is the sRGB base color: chips from a Bevel
  node's edge mask broken up by noise, grime in the crevices from ambient occlusion, and a
  slow brightness mottle. The `accent` region is baked at its neutral gray, so the site's
  multiply tint still gives the learner's hue. `form-<n>-surface.webp` holds occlusion in
  R, roughness in G and metallic in B. The chips are scaled by each part's `wear` object
  property: `kit.ring`, `kit.bolt` and a thin `kit.cyl` set it to `WEAR_THIN` (0.15), since
  a part that is all edge would otherwise read as dashes (the halo rings did); every other
  part counts as 1.
- Both passes are EMIT passes. A diffuse color pass is black on a metallic surface, so the
  color chain and then the packed channels each go through an Emission shader and bake as
  emission.
- It then rebuilds the five materials in the shape the glTF exporter reads: the color
  texture into Base Color, the surface texture through a Separate Color node into
  Roughness and Metallic, and its R into a "glTF Material Output" group's Occlusion.
- The knobs sit at the top of `bake.py`: `ATLAS` (the size), `COLOR_QUALITY` and
  `SURFACE_QUALITY` (WebP quality, 85), `WEAR` (per slot: the edge color, the roughness
  change at the chips, the grime and the mottle), `EDGE_RADIUS`, `EDGE_GAIN`,
  `AO_DISTANCE` and `TONE`. A texture over 400 KB fails the rule, so lower the quality
  before the size.
- A bake takes about two to three minutes a stage, so a full `npm run gen:forms` takes
  about 15 minutes. `build.py --no-bake` skips it for a quick flat build with no images.
- The export is a separate glTF with the WebP files beside it (never embedded).
  `tools/gen-forms.js` packs it and assembles the GLB with `writeGlb` (`tools/lib/glb.js`),
  because gltfpack would embed the images. The uris stay relative, and the manifest lists
  them in `images`.

## The emotes

`emotes.py` keys five clips on every stage: `idle` (3 s, looping), `wave`, `bow`, `flex`
and `spin`. Every clip starts and ends on the rest pose, every bone is keyed at rest on
frame 0 (so the idle's frame 0 is the pose the viewer shows under reduced motion), and
the idle loops. The clips drive `root` (the spin's turn, the flex's hop), `hips`,
`spine`, `chest`, `head`, the limbs, the `orbit` pivot and `halo` by name; bones a stage
lacks are skipped (Pip has `root, hips, chest, head` and does body motions). Pose-bone
rotations are Euler XYZ in the bone's own axes; the header of `emotes.py` says which
axis does what. To look at them: `--renders emotes` draws a contact sheet,
`form-<n>-emotes.png`, under `.cache/forms/turntable/`.

## The design

An original samurai-mecha, not a likeness of any franchise, carrying a beacon staff
rather than a blade (children use the site). White lacquer plates over a dark frame,
gold edges, the learner's hue on a sash, a glow for what shines. The stages are one
figure growing: a floating core (Pip), a slim runner frame (Sprig), light armor and the
staff (Wayfinder), heavy armor with sode and orbit drones (Surveyor), the full commander
with crest, halo frame and a long beacon (Luminary). The plan and the decision record
(`docs/decisions/0008-form-models.md`) say why.
