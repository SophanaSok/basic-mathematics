"""Headless entry: build one form stage in Blender and export it.

Run as `blender -b --factory-startup --python tools/art/forms/build.py -- --stage 3
--out .cache/forms/raw`. It clears the scene, makes the five materials and the shared
armature for the stage, then builds the stage through a builder registered in
STAGE_BUILDERS (a later `stages/` package fills it) or, with none, the grey mannequin,
and exports `form-<n>.glb` plus its sidecar JSON. Any failure prints a message and exits
non-zero so a script or CI step can tell.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import export  # noqa: E402
import kit  # noqa: E402
import materials  # noqa: E402
import rig  # noqa: E402

# stage number -> builder(armature, props, mats) -> list of objects. Filled by stages/.
STAGE_BUILDERS = {}

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", type=int, required=True, choices=sorted(rig.STAGE_HEIGHTS))
    ap.add_argument("--out", default=os.path.join(ROOT, ".cache", "forms", "raw"))
    a = ap.parse_args(argv)

    kit.clear_scene()
    bpy.context.scene.render.fps = 30
    mats = materials.make_materials()
    props = rig.proportions_for(a.stage)
    arm = rig.build_armature(props)
    builder = STAGE_BUILDERS.get(a.stage, rig.mannequin)
    objs = builder(arm, props, mats)
    path = os.path.join(a.out, f"form-{a.stage}.glb")
    side = export.export_glb(path, arm, objs, a.stage, props.height)
    print(f"form-{a.stage}: {side['triangles']} triangles, {len(side['bones'])} bones, "
          f"{len(side['materials'])} materials, {len(side['clips'])} clips -> {path}")


try:
    main()
except SystemExit:
    raise
except BaseException as e:  # noqa: BLE001
    import traceback
    traceback.print_exc()
    print(f"form build failed: {e}")
    sys.exit(1)
