"""Renders of a form, made after the export: a turntable, a contact sheet and a thumbnail.

The form pipeline (tools/art/forms/) is judged by eye, so this draws the live scene the
builder made (the same materials the GLB carries, not a re-import). It runs after
`export.export_glb`, so none of the changes made here (world, lights, camera, render
settings, the red accent tint) reach the GLB. Framing is the viewer's: FOV 30 degrees,
the camera 0.3 rad above level, far enough that `height * 1.3` fits vertically and the
figure's width fits horizontally, measured from the evaluated parts (a staff above the
head counts). Angle 0 is the front, which is -Y in Blender.

Engines: `auto` tries Eevee and falls back to Cycles when Eevee cannot start headless;
`eevee`, `cycles` and `workbench` (a one-second silhouette pass) force one. Cycles uses
the GPU unless `cpu` is set; it only sets this process's own render settings and never
changes GPU state beyond that. The turntable's eight stills are 360x450 into
`.cache/forms/turntable/form-<n>-<i>.png`, tiled 4x2 into `form-<n>.png` beside them. The
thumbnail is 512x640 RGBA at the rest pose, written to `<raw_dir>/form-<n>.png`.
"""
import math
import os
import time

import bpy
import numpy as np
from mathutils import Vector

TILE = (360, 450)
THUMB = (512, 640)
PITCH = 0.3
FOV = 30.0
BACKDROP = (0.32, 0.33, 0.35, 1.0)
KINDS = ("turntable", "thumb", "emotes", "poses")
POSE_TILE = (256, 320)
POSE_MAX_BYTES = 120000
POSE_MARGIN = 1.06
# pose: (name, clip frame (clip, frame) or hand-keyed bones, glow factor); the order is the
# site's POSES in src/learn/mood.ts. Hand-keyed: {bone: (x, y, z)} degrees in the bone's own
# axes (see emotes.py), applied over a reset rig; a bone a stage lacks is skipped, and
# `pip` replaces the dict for a stage with no limbs (Pip works through hips, chest, head).
POSES = (
    ("rest", ("idle", 0), 1.0),
    ("curious", ("bow", 34), 1.0),
    ("delighted", ("wave", 30), 1.3),
    ("steady", {
        "thigh.L": (0, 0, -7), "thigh.R": (0, 0, 7),
        "upper_arm.L": (0, 0, -14), "upper_arm.R": (0, 0, 14),
        "forearm.L": (12, 0, 0), "forearm.R": (12, 0, 0),
        "chest": (-4, 0, 0), "head": (-3, 0, 0),
        "pip": {"chest": (-6, 0, 0), "head": (-5, 0, 0)},
    }, 0.5),
    ("sleepy", {
        "spine": (8, 0, 0), "chest": (14, 0, 0), "neck": (10, 0, 0), "head": (32, 0, 0),
        "upper_arm.L": (6, 0, 0), "upper_arm.R": (6, 0, 0),
        "pip": {"hips": (22, 0, 0), "chest": (15, 0, 0), "head": (25, 0, 0)},
    }, 0.35),
    ("waiting", {
        "upper_arm.R": (0, 0, 24), "forearm.R": (-30, 0, 0), "head": (-10, 15, 0),
        "pip": {"hips": (-8, 0, 0), "head": (-15, 0, 0)},
    }, 1.6),
)


THUMB_MAX_BYTES = 160000


def _bounds(objects):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objects:
        e = o.evaluated_get(dg)
        pts += [e.matrix_world @ Vector(c) for c in e.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    height = hi.z - lo.z
    width = max(hi.x - lo.x, hi.y - lo.y)
    return Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z + height / 2)), height, width


def _eevee_name():
    items = bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys()
    for n in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        if n in items:
            return n
    return None


def _set_engine(scene, engine, cpu):
    if engine == "workbench":
        scene.render.engine = "BLENDER_WORKBENCH"
        scene.display.shading.light = "STUDIO"
        scene.display.shading.color_type = "MATERIAL"
    elif engine == "cycles":
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 24 if cpu else 48
        scene.cycles.use_denoising = True
        scene.cycles.device = "CPU"
        if not cpu:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            for kind in ("OPTIX", "CUDA"):
                try:
                    prefs.compute_device_type = kind
                    prefs.get_devices()
                    gpus = [d for d in prefs.devices if d.type != "CPU"]
                    if not gpus:
                        continue
                    for d in prefs.devices:
                        d.use = d.type != "CPU"
                    scene.cycles.device = "GPU"
                    break
                except Exception:  # noqa: BLE001  try the next device kind
                    continue
    else:
        name = _eevee_name()
        if name is None:
            raise RuntimeError("this Blender has no Eevee engine")
        scene.render.engine = name
        try:
            scene.eevee.taa_render_samples = 32
        except AttributeError:
            pass


def _render_still(scene, path, engine, cpu):
    """Render to `path`; with `auto`, Eevee first and Cycles when Eevee cannot start."""
    scene.render.filepath = path
    if engine == "auto":
        try:
            _set_engine(scene, "eevee", cpu)
            bpy.ops.render.render(write_still=True)
            return "eevee"
        except Exception as e:  # noqa: BLE001
            print(f"render: Eevee could not start headless ({e}); using Cycles")
            _set_engine(scene, "cycles", cpu)
            bpy.ops.render.render(write_still=True)
            return "cycles"
    _set_engine(scene, engine, cpu)
    bpy.ops.render.render(write_still=True)
    return engine


def _setup(scene, w, h, transparent):
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    scene.render.image_settings.compression = 90 if transparent else 15
    scene.render.image_settings.color_depth = "8"
    scene.render.dither_intensity = 0.0   # dither noise is what makes a PNG large

    world = bpy.data.worlds.new("render-world")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes["Background"]
    bg.inputs["Strength"].default_value = 1.0
    exr = os.path.join(bpy.utils.system_resource("DATAFILES"), "studiolights", "world", "forest.exr")
    if os.path.exists(exr):
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(exr)
        light = env.outputs["Color"]
    else:
        light = None
        bg.inputs["Color"].default_value = (0.8, 0.8, 0.8, 1.0)
    if light is not None:
        if transparent:
            nt.links.new(light, bg.inputs["Color"])
        else:
            # the camera sees a flat gray; everything else sees the forest for light
            lp = nt.nodes.new("ShaderNodeLightPath")
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.inputs[7].default_value = BACKDROP
            nt.links.new(light, mix.inputs[6])
            nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs[0])
            nt.links.new(mix.outputs[2], bg.inputs["Color"])

    sun = bpy.data.lights.new("render-key", "SUN")
    sun.energy = 3.0
    so = bpy.data.objects.new("render-key", sun)
    scene.collection.objects.link(so)
    so.rotation_euler = (math.radians(50), 0, math.radians(-30))

    cd = bpy.data.cameras.new("render-cam")
    cd.lens_unit = "FOV"
    cd.angle = math.radians(FOV)
    cam = bpy.data.objects.new("render-cam", cd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def _aim(cam, centre, height, width, w, h, degrees):
    half = math.radians(FOV / 2)
    dist = max(height * 1.3 / 2 / math.tan(half), width * 1.3 / 2 / (math.tan(half) * w / h))
    a = math.radians(degrees)
    pos = centre + Vector((math.sin(a) * math.cos(PITCH) * dist, -math.cos(a) * math.cos(PITCH) * dist,
                           math.sin(PITCH) * dist))
    cam.location = pos
    cam.rotation_euler = (centre - pos).to_track_quat("-Z", "Y").to_euler()


def _tint_accent():
    """Red accent, for the eye only: the export is done, so the GLB never sees it."""
    acc = bpy.data.materials.get("accent")
    if acc and acc.use_nodes:
        n = acc.node_tree.nodes.get("Principled BSDF")
        if n and n.inputs["Base Color"].is_linked:
            # baked: multiply the colour texture by the red on its way in, once (the
            # turntable and the emotes sheet both ask; a second multiply would square it)
            nt = acc.node_tree
            link = n.inputs["Base Color"].links[0]
            if link.from_node.name == "accent_tint":
                return
            mix = nt.nodes.new("ShaderNodeMix")
            mix.name = "accent_tint"
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 1.0
            a = [s for s in mix.inputs if s.name == "A" and s.type == "RGBA"][0]
            b = [s for s in mix.inputs if s.name == "B" and s.type == "RGBA"][0]
            nt.links.new(link.from_socket, a)
            b.default_value = (0.62, 0.06, 0.05, 1.0)
            nt.links.new(mix.outputs["Result"], n.inputs["Base Color"])
        elif n:
            n.inputs["Base Color"].default_value = (0.62, 0.06, 0.05, 1.0)


def _pixels(path, w, h):
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = "Non-Color"   # copy the stored values through untouched
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[::-1]


def turntable(objects, height, out_dir, stage, engine, cpu=False):
    scene = bpy.context.scene
    os.makedirs(out_dir, exist_ok=True)
    w, h = TILE
    centre, hgt, width = _bounds(objects)
    cam = _setup(scene, w, h, False)
    _tint_accent()
    scene.frame_set(0)
    tiles, used = [], engine
    for i in range(8):
        _aim(cam, centre, hgt, width, w, h, 45 * i)
        tile = os.path.join(out_dir, f"form-{stage}-{i}.png")
        used = _render_still(scene, tile, engine if engine != "auto" or i == 0 else used, cpu)
        tiles.append(_pixels(tile, w, h))
    sheet = np.concatenate([np.concatenate(tiles[:4], axis=1), np.concatenate(tiles[4:], axis=1)], axis=0)
    path = os.path.join(out_dir, f"form-{stage}.png")
    img = bpy.data.images.new("sheet", sheet.shape[1], sheet.shape[0], alpha=True)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(np.ascontiguousarray(sheet[::-1]).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    return path, used


def thumbnail(objects, height, path, engine, cpu=False):
    scene = bpy.context.scene
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    w, h = THUMB
    centre, hgt, width = _bounds(objects)
    cam = _setup(scene, w, h, True)
    # no judging tint here: the site tints the accent itself, and the strip shows this file
    scene.frame_set(0)   # the rest pose; frame 0 of idle once clips exist
    _aim(cam, centre, hgt, width, w, h, 30)
    used = _render_still(scene, path, engine, cpu)
    size = os.path.getsize(path)
    if size > THUMB_MAX_BYTES:
        raise RuntimeError(f"{path} is {size} bytes, over the {THUMB_MAX_BYTES} the strip allows")
    return path, used


def emotes_sheet(objects, height, out_dir, stage, engine, cpu=False):
    """one still per clip at its middle frame (and two more of the idle, at a third and
    two thirds), from the front-left, tiled into one sheet for judging the poses"""
    scene = bpy.context.scene
    os.makedirs(out_dir, exist_ok=True)
    arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    acts = list(bpy.data.actions)
    if arm is None or not acts or arm.animation_data is None:
        raise RuntimeError("no clips to render: build without --no-clips")
    w, h = TILE
    centre, hgt, width = _bounds(objects)
    cam = _setup(scene, w, h, False)
    _tint_accent()
    shots = []
    for act in acts:
        n = int(act.frame_end)
        frames = (n // 3, (2 * n) // 3) if act.name == "idle" else (n // 2,)
        for fr in frames:
            shots.append((act, fr))
    tiles, used = [], engine
    ad = arm.animation_data
    for i, (act, fr) in enumerate(shots):
        for pb in arm.pose.bones:   # a bone the clip does not key keeps the last pose otherwise
            pb.rotation_euler = (0.0, 0.0, 0.0)
            pb.location = (0.0, 0.0, 0.0)
            pb.scale = (1.0, 1.0, 1.0)
        ad.action = act
        if hasattr(act, "slots") and len(act.slots):
            ad.action_slot = act.slots[0]
        scene.frame_set(fr)
        _aim(cam, centre, hgt * 1.15, width * 1.4, w, h, 30)
        tile = os.path.join(out_dir, f"form-{stage}-{act.name}-{fr}.png")
        used = _render_still(scene, tile, engine if engine != "auto" or i == 0 else used, cpu)
        tiles.append(_pixels(tile, w, h))
    ad.action = None
    scene.frame_set(0)
    while len(tiles) % 3:
        tiles.append(np.zeros_like(tiles[0]))
    rows = [np.concatenate(tiles[r:r + 3], axis=1) for r in range(0, len(tiles), 3)]
    sheet = np.concatenate(rows, axis=0)
    path = os.path.join(out_dir, f"form-{stage}-emotes.png")
    img = bpy.data.images.new("emotes", sheet.shape[1], sheet.shape[0], alpha=True)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(np.ascontiguousarray(sheet[::-1]).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    return path, used


def _glow_input():
    """the Emission Strength socket of the `glow` material, or None"""
    m = bpy.data.materials.get("glow")
    n = m.node_tree.nodes.get("Principled BSDF") if m and m.use_nodes else None
    return n.inputs["Emission Strength"] if n else None


def _extent(objects):
    """(low, high) corners of the evaluated parts' bounding boxes"""
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objects:
        e = o.evaluated_get(dg)
        pts += [e.matrix_world @ Vector(c) for c in e.bound_box]
    return (Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))),
            Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))))


def _strike(arm, scene, pose):
    """put the rig in one pose: every bone reset, then a clip frame or the keyed bones"""
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0.0, 0.0, 0.0)
        pb.location = (0.0, 0.0, 0.0)
        pb.scale = (1.0, 1.0, 1.0)
    ad = arm.animation_data
    if isinstance(pose, tuple):
        clip, fr = pose
        act = bpy.data.actions.get(clip)
        if act is None:
            raise RuntimeError(f"no clip {clip!r}")
        ad.action = act
        if hasattr(act, "slots") and len(act.slots):
            ad.action_slot = act.slots[0]
        scene.frame_set(fr)
        return
    ad.action = None
    scene.frame_set(0)
    bones = pose["pip"] if "upper_arm.L" not in arm.pose.bones and "pip" in pose else pose
    for name, rot in bones.items():
        pb = arm.pose.bones.get(name)
        if pb is not None and name != "pip":
            x, y, z = rot
            pb.rotation_euler = (math.radians(x), math.radians(y), math.radians(z))
    bpy.context.view_layer.update()


def poses_sheet(objects, height, path, stage, engine, cpu=False, quality=85):
    """six transparent stills, one per pose (a clip frame or hand-keyed bones, and a glow
    strength), from one camera that fits the union of the six poses with a 6% margin, tiled
    left to right into one WebP sheet; the glow is put back afterwards"""
    scene = bpy.context.scene
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if arm is None or arm.animation_data is None:
        raise RuntimeError("no clips to render: build without --no-clips")
    w, h = POSE_TILE
    cam = _setup(scene, w, h, True)   # no judging tint: the site tints the accent itself
    glow = _glow_input()
    base = glow.default_value if glow is not None else None
    yaw = math.radians(30)
    lo = hi = None
    for _name, pose, _factor in POSES:
        _strike(arm, scene, pose)
        a, b = _extent(objects)
        lo = a if lo is None else Vector((min(lo.x, a.x), min(lo.y, a.y), min(lo.z, a.z)))
        hi = b if hi is None else Vector((max(hi.x, b.x), max(hi.y, b.y), max(hi.z, b.z)))
    centre = (lo + hi) / 2
    hgt = hi.z - lo.z
    width = (hi.x - lo.x) * math.cos(yaw) + (hi.y - lo.y) * math.sin(yaw)
    k = POSE_MARGIN / 1.3   # _aim's own 1.3 is the viewer's margin
    tmp = os.path.join(os.path.dirname(os.path.abspath(path)), f"form-{stage}-pose.png")
    tiles, used = [], engine
    try:
        for i, (_name, pose, factor) in enumerate(POSES):
            _strike(arm, scene, pose)
            if glow is not None:
                glow.default_value = base * factor
            _aim(cam, centre, hgt * k, width * k, w, h, 30)
            used = _render_still(scene, tmp, engine if engine != "auto" or i == 0 else used, cpu)
            tiles.append(_pixels(tmp, w, h))
    finally:
        if glow is not None:
            glow.default_value = base
        arm.animation_data.action = None
        scene.frame_set(0)
        if os.path.exists(tmp):
            os.remove(tmp)
    sheet = np.concatenate(tiles, axis=1)
    img = bpy.data.images.new("poses", sheet.shape[1], sheet.shape[0], alpha=True)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(np.ascontiguousarray(sheet[::-1]).ravel())
    img.filepath_raw = path
    img.file_format = "WEBP"
    img.save(quality=quality)
    size = os.path.getsize(path)
    while size > POSE_MAX_BYTES and quality > 40:
        quality -= 10
        img.save(quality=quality)
        size = os.path.getsize(path)
    if size > POSE_MAX_BYTES:
        raise RuntimeError(f"{path} is {size} bytes, over the {POSE_MAX_BYTES} allowed")
    return path, used


def renders(kinds, objects, height, stage, raw_dir, engine="auto", cpu=False):
    for kind in kinds:
        if kind not in KINDS:
            raise ValueError(f"unknown render {kind!r}; expected one of {', '.join(KINDS)}")
    # a fresh scene per kind would be tidier, but the scene is thrown away with the process
    for kind in kinds:
        t0 = time.time()
        if kind == "turntable":
            out = os.path.join(os.path.dirname(os.path.abspath(raw_dir)), "turntable")
            path, used = turntable(objects, height, out, stage, engine, cpu)
        elif kind == "thumb":
            path, used = thumbnail(objects, height, os.path.join(raw_dir, f"form-{stage}.png"), engine, cpu)
        elif kind == "poses":
            path, used = poses_sheet(objects, height, os.path.join(raw_dir, f"form-{stage}-poses.webp"), stage, engine, cpu)
        else:
            out = os.path.join(os.path.dirname(os.path.abspath(raw_dir)), "turntable")
            path, used = emotes_sheet(objects, height, out, stage, engine, cpu)
        print(f"render {kind}: {path} ({used}, {time.time() - t0:.1f} s, {os.path.getsize(path):,} bytes)")
