"""Small bmesh and modifier helpers for building form parts.

The form pipeline (tools/art/forms/) builds each avatar stage from boxes, cylinders,
spheres and bolts. This is the kit those builders share: panelled plates, grooved
joints, bolts, domes, and the bevel, mirror, boolean and array modifiers that give
hard-surface parts their edges. Every helper returns a mesh object already linked to
the `forms` collection, placed at `at` and turned by `rot` (a quaternion, or an XYZ
Euler as three radians). `bone_frame` gives a bone's centre, length and the rotation
that lays a part's local Z along it, with local -Y facing the figure's front (-Y).
Nothing here is applied by hand: the glTF exporter applies the modifier stack, and the
`add_*` helpers keep an Armature modifier last in it, so a part may be skinned before
or after it is shaped.
"""
import math

import bmesh
import bpy
from mathutils import Quaternion, Vector


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


def _finish(name, bm, at, rot=None, collection="forms"):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, me)
    obj.location = at
    if isinstance(rot, Quaternion):
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = rot
    elif rot is not None:
        obj.rotation_euler = rot
    new_collection(collection).objects.link(obj)
    return obj


def bone_frame(armature, name):
    """(centre, length, rotation, head, tail) of a bone in the armature's rest pose: the
    rotation lays local Z along the bone, local -Y toward the front."""
    b = armature.data.bones[name]
    head, tail = Vector(b.head_local), Vector(b.tail_local)
    d = tail - head
    return (head + tail) / 2, max(d.length, 1e-4), d.to_track_quat("Z", "Y"), head, tail


def _armature_last(obj):
    mods = obj.modifiers
    for i, m in enumerate(mods):
        if m.type == "ARMATURE" and i != len(mods) - 1:
            mods.move(i, len(mods) - 1)
            break


def _mark_sharp(bm, degrees=30.0):
    lim = math.radians(degrees)
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > lim:
            e.smooth = False
        elif len(e.link_faces) < 2:
            e.smooth = False


def plate(name, size=(0.1, 0.1, 0.1), at=(0, 0, 0), rot=None, inset=0.01, depth=0.004, panel=(0, 0, 1), taper=1.0):
    """A box of `size` with a panel line inset into the face whose normal is nearest
    `panel` (none with inset 0); `taper` scales the top (+Z) end's x and y, for
    trapezoid plates."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        k = taper if v.co.z > 0 else 1.0
        v.co.x *= size[0] * k
        v.co.y *= size[1] * k
        v.co.z *= size[2]
    bm.faces.ensure_lookup_table()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if inset > 0:
        n = Vector(panel).normalized()
        face = max(bm.faces, key=lambda f: f.normal.dot(n))
        inset = min(inset, min(size) * 0.3)
        bmesh.ops.inset_region(bm, faces=[face], thickness=inset, depth=-depth)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _mark_sharp(bm)
    return _finish(name, bm, at, rot)


def cyl(name, r, length, segments=24, at=(0, 0, 0), rot=None, r2=None):
    """A plain capped cylinder (or a cone with `r2` at the +Z end) along local Z."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r, radius2=r if r2 is None else r2, depth=length)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _mark_sharp(bm)
    return _finish(name, bm, at, rot)


def cyl_joint(name, r, length, segments=24, at=(0, 0, 0), rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r, radius2=r, depth=length)
    bm.faces.ensure_lookup_table()
    mid = [f for f in bm.faces if len(f.verts) == 4]
    # Groove: inset the side faces, push them in, inset again and push back out a little.
    bmesh.ops.inset_region(bm, faces=mid, thickness=length * 0.15, depth=-r * 0.08, use_even_offset=True)
    bmesh.ops.inset_region(bm, faces=mid, thickness=length * 0.05, depth=-r * 0.05, use_even_offset=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _mark_sharp(bm)
    return _finish(name, bm, at, rot)


def bolt(name, r=0.008, at=(0, 0, 0), rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=r, radius2=r, depth=r)
    dome = bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=3, radius=r * 0.9)
    bmesh.ops.translate(bm, verts=dome["verts"], vec=(0, 0, r * 0.5))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _finish(name, bm, at, rot)


def sphere(name, r, at=(0, 0, 0), rot=None, segments=16, rings=8, scale=(1, 1, 1), dome=False):
    """A UV sphere, scaled per axis; `dome` keeps the upper half only (open underneath)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=r)
    if dome:
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-5], context="VERTS")
    for v in bm.verts:
        v.co.x *= scale[0]
        v.co.y *= scale[1]
        v.co.z *= scale[2]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _finish(name, bm, at, rot)


def wedge(name, size=(0.1, 0.1, 0.1), at=(0, 0, 0), rot=None, front=0.3):
    """A box whose +Z end narrows in y to `front` of its depth: a fin, a toe, a crest."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1] * (front if v.co.z > 0 else 1.0)
        v.co.z *= size[2]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _mark_sharp(bm)
    return _finish(name, bm, at, rot)


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
    _armature_last(obj)
    return obj


def add_mirror(obj):
    m = obj.modifiers.new("Mirror", "MIRROR")
    m.use_axis = (True, False, False)
    m.use_clip = True
    _armature_last(obj)
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
    _armature_last(obj)
    return obj


def add_array(obj, count, offset):
    a = obj.modifiers.new("Array", "ARRAY")
    a.count = count
    a.use_relative_offset = False
    a.use_constant_offset = True
    a.constant_offset_displace = offset
    _armature_last(obj)
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
