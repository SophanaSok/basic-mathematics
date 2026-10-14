"""The glTF export and the sidecar JSON.

The form pipeline (tools/art/forms/) ends here: this file counts triangles over the
evaluated scene (and stops if a stage is over the cap), exports the selected armature
and its meshes as a GLB that the site's loader reads, and writes `form-<n>.json` beside
it with the numbers the later optimize and manifest steps check. The exporter applies
the modifier stacks itself, so nothing is applied by hand.
"""
import json
import os

import bpy

import kit

TRIANGLE_CAP = 30000


def _bone_order(armature):
    out = []

    def walk(b):
        out.append(b.name)
        for c in b.children:
            walk(c)

    for b in armature.data.bones:
        if b.parent is None:
            walk(b)
    return out


def export_glb(path, armature, objects, stage, height):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    dg = bpy.context.evaluated_depsgraph_get()
    counts = sorted(((kit.triangles_of(o, dg), o.name) for o in objects), reverse=True)
    total = sum(c for c, _ in counts)
    if total > TRIANGLE_CAP:
        lines = "\n".join(f"  {n}: {c}" for c, n in counts[:10])
        raise RuntimeError(f"{total} triangles exceeds the cap of {TRIANGLE_CAP}. Largest objects:\n{lines}")

    armature["height"] = height
    armature["stage"] = stage
    for o in bpy.data.objects:
        o.select_set(False)
    armature.select_set(True)
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = armature

    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", check_existing=False, use_selection=True,
        export_apply=True, export_yup=True, export_normals=True, export_tangents=False,
        export_materials="EXPORT", export_image_format="NONE", export_cameras=False,
        export_lights=False, export_extras=True, export_skins=True, export_def_bones=True,
        export_rest_position_armature=True, export_animations=True,
        export_animation_mode="ACTIONS", export_nla_strips=True, export_force_sampling=True,
        export_reset_pose_bones=True, export_optimize_animation_size=True,
        export_morph=False, export_draco_mesh_compression_enable=False,
        export_copyright="groundupmath.org",
    )
    mats = sorted({s.material.name for o in objects for s in o.material_slots if s.material})
    side = {
        "stage": stage, "height": height, "triangles": total,
        "bones": _bone_order(armature), "materials": mats,
        "clips": [a.name for a in bpy.data.actions], "blender": bpy.app.version_string,
    }
    with open(os.path.splitext(path)[0] + ".json", "w") as f:
        json.dump(side, f, indent=2)
    return side
