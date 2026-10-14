"""Headless entry: build one form stage in Blender and export it.

Run as `blender -b --factory-startup --python tools/art/forms/build.py -- --stage 3
--out .cache/forms/raw`. It clears the scene, makes the five materials and the shared
armature for the stage, then builds the stage through its builder in `stages/` (the gray mannequin for a
stage without one yet),
and exports `form-<n>.glb` plus its sidecar JSON. `--renders turntable,thumb` then draws
the live scene (render.py); `--engine` and `--cpu` pick how. Any failure prints a message and exits
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
import render  # noqa: E402
import rig  # noqa: E402
from stages import STAGES as STAGE_BUILDERS  # noqa: E402  stage number -> builder(armature, props, mats)

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", type=int, required=True, choices=sorted(rig.STAGE_HEIGHTS))
    ap.add_argument("--out", default=os.path.join(ROOT, ".cache", "forms", "raw"))
    ap.add_argument("--renders", default="", help="comma list: turntable, thumb, emotes")
    ap.add_argument("--engine", default="auto", choices=["auto", "eevee", "cycles", "workbench"])
    ap.add_argument("--cpu", action="store_true", help="Cycles on the CPU, fewer samples")
    a = ap.parse_args(argv)

    kit.clear_scene()
    bpy.context.scene.render.fps = 30
    mats = materials.make_materials()
    props = rig.proportions_for(a.stage)
    arm = rig.armature_for(a.stage, props)
    builder = STAGE_BUILDERS.get(a.stage, rig.mannequin)
    objs = builder(arm, props, mats)
    path = os.path.join(a.out, f"form-{a.stage}.glb")
    side = export.export_glb(path, arm, objs, a.stage, props.height)
    print(f"form-{a.stage}: {side['triangles']} triangles, {len(side['bones'])} bones, "
          f"{len(side['materials'])} materials, {len(side['clips'])} clips -> {path}")
    kinds = [k for k in a.renders.split(",") if k]
    if kinds:
        render.renders(kinds, objs, props.height, a.stage, a.out, a.engine, a.cpu)


try:
    main()
except SystemExit:
    raise
except BaseException as e:  # noqa: BLE001
    import traceback
    traceback.print_exc()
    print(f"form build failed: {e}")
    sys.exit(1)
