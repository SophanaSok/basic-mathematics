"""Small bmesh and modifier helpers for building form parts.

The form pipeline (tools/art/forms/) builds each avatar stage from boxes, cylinders and
bolts. This is the kit those builders share: panelled plates, grooved joints, bolts,
and the bevel, mirror, boolean and array modifiers that give hard-surface parts their
edges. Every helper returns a mesh object already linked to the `forms` collection.
Nothing here is applied by hand: the glTF exporter applies the modifier stack.
"""
import math

import bmesh
import bpy


def new_collection(name, exclude=False):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    if exclude:
        lc = bpy.context.view_layer.layer_collection.children.get(name)
        if lc:
            lc.exclude = True
    return col


def _finish(name, bm, at, collection="forms"):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, me)
    obj.location = at
    new_collection(collection).objects.link(obj)
    return obj


def _mark_sharp(bm, degrees=30.0):
    lim = math.radians(degrees)
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > lim:
            e.smooth = False
        elif len(e.link_faces) < 2:
            e.smooth = False


def plate(name, size=(0.1, 0.1, 0.1), at=(0, 0, 0), inset=0.01, depth=0.004):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
    bm.faces.ensure_lookup_table()
    top = max(bm.faces, key=lambda f: f.calc_center_median().z)
    inset = min(inset, min(size) * 0.3)
    r = bmesh.ops.inset_region(bm, faces=[top], thickness=inset, depth=-depth)
    del r
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _mark_sharp(bm)
    return _finish(name, bm, at)


def cyl_joint(name, r, length, segments=24, at=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r, radius2=r, depth=length)
    bm.faces.ensure_lookup_table()
    mid = [f for f in bm.faces if len(f.verts) == 4]
    # Groove: inset the side faces, push them in, inset again and push back out a little.
    bmesh.ops.inset_region(bm, faces=mid, thickness=length * 0.15, depth=-r * 0.08, use_even_offset=True)
    bmesh.ops.inset_region(bm, faces=mid, thickness=length * 0.05, depth=-r * 0.05, use_even_offset=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _mark_sharp(bm)
    return _finish(name, bm, at)


def bolt(name, r=0.008, at=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=r, radius2=r, depth=r)
    dome = bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=3, radius=r * 0.9)
    bmesh.ops.translate(bm, verts=dome["verts"], vec=(0, 0, r * 0.5))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _finish(name, bm, at)


def add_bevel(obj, width=0.006, segments=2):
    b = obj.modifiers.new("Bevel", "BEVEL")
    b.width = width
    b.segments = segments
    b.limit_method = "ANGLE"
    b.angle_limit = math.radians(30)
    b.harden_normals = True
    b.miter_outer = "MITER_ARC"
    w = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
    w.keep_sharp = True
    if hasattr(obj.data, "use_auto_smooth"):
        obj.data.use_auto_smooth = True
    return obj


def add_mirror(obj):
    m = obj.modifiers.new("Mirror", "MIRROR")
    m.use_axis = (True, False, False)
    return obj


def add_boolean(obj, cutter):
    cutters = new_collection("cutters", exclude=False)
    for c in list(cutter.users_collection):
        c.objects.unlink(cutter)
    cutters.objects.link(cutter)
    cutter.hide_render = True
    cutter.hide_viewport = True
    m = obj.modifiers.new("Boolean", "BOOLEAN")
    m.operation = "DIFFERENCE"
    m.solver = "EXACT"
    m.object = cutter
    return obj


def add_array(obj, count, offset):
    a = obj.modifiers.new("Array", "ARRAY")
    a.count = count
    a.use_relative_offset = False
    a.use_constant_offset = True
    a.constant_offset_displace = offset
    return obj


def triangles_of(obj, depsgraph):
    ev = obj.evaluated_get(depsgraph)
    me = ev.data
    me.calc_loop_triangles()
    return len(me.loop_triangles)


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.actions):
        for d in list(coll):
            coll.remove(d)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
