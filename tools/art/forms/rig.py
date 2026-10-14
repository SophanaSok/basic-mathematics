"""The shared skeleton, its proportions and the gray mannequin.

The form pipeline (tools/art/forms/) gives all five avatar stages one skeleton so one
set of emotes plays on every stage. This file holds the `Proportions` a stage is built
to (a samurai-mecha build: legs near half the height, wide shoulders), the armature with
its fixed bone names and parenting (an upright A-stance at rest), rigid skinning, and
the mannequin: one bevelled box per bone, which stands in for a stage until its own
builder exists and proves the pipeline end to end.
"""
from dataclasses import dataclass

import bpy
from mathutils import Vector

import kit

STAGE_HEIGHTS = {1: 0.6, 2: 0.8, 3: 1.1, 4: 1.35, 5: 1.75}


@dataclass
class Proportions:
    height: float
    leg: float
    shin: float
    thigh: float
    torso: float
    chest: float
    neck: float
    head: float
    shoulder_w: float
    upper_arm: float
    forearm: float
    hand: float
    hip_w: float
    foot: float


def proportions_for(stage):
    """A mecha build: legs just under half the height, shoulders a third of it, a head
    that still reads at the viewer's size (the figure is about 300 px tall there)."""
    h = STAGE_HEIGHTS[stage]
    leg = 0.47 * h
    return Proportions(
        height=h, leg=leg, shin=leg * 0.5, thigh=leg * 0.5,
        torso=0.14 * h, chest=0.19 * h, neck=0.03 * h, head=0.17 * h,
        shoulder_w=0.32 * h, upper_arm=0.16 * h, forearm=0.15 * h, hand=0.06 * h,
        hip_w=0.11 * h, foot=0.09 * h,
    )


def build_armature(props, name="form"):
    arm = bpy.data.armatures.new(name)
    obj = bpy.data.objects.new(name, arm)
    kit.new_collection("forms").objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones

    def bone(n, head, tail, parent=None):
        b = eb.new(n)
        b.head, b.tail = Vector(head), Vector(tail)
        b.use_deform = True
        if parent:
            b.parent = eb[parent]
        return b

    p = props
    hip_z = p.leg
    bone("root", (0, 0, 0), (0, 0, 0.1))
    bone("hips", (0, 0, hip_z), (0, 0, hip_z + p.torso * 0.5), "root")
    bone("spine", (0, 0, hip_z + p.torso * 0.5), (0, 0, hip_z + p.torso), "hips")
    chest_top = hip_z + p.torso + p.chest
    bone("chest", (0, 0, hip_z + p.torso), (0, 0, chest_top), "spine")
    bone("neck", (0, 0, chest_top), (0, 0, chest_top + p.neck), "chest")
    bone("head", (0, 0, chest_top + p.neck), (0, 0, chest_top + p.neck + p.head), "neck")
    for side, sx in (("L", 1.0), ("R", -1.0)):
        sz = chest_top - 0.02
        sx0 = sx * 0.03
        sx1 = sx * p.shoulder_w * 0.5
        bone(f"shoulder.{side}", (sx0, 0, sz), (sx1, 0, sz), "chest")
        # A-stance: the arm hangs down, angled outward about 15 degrees.
        d = Vector((sx * 0.26, 0, -0.966))
        e = Vector((sx1, 0, sz))
        e2 = e + d * p.upper_arm
        e3 = e2 + d * p.forearm
        e4 = e3 + d * p.hand
        bone(f"upper_arm.{side}", e, e2, f"shoulder.{side}")
        bone(f"forearm.{side}", e2, e3, f"upper_arm.{side}")
        bone(f"hand.{side}", e3, e4, f"forearm.{side}")
        hx = sx * p.hip_w
        knee_z = hip_z - p.thigh
        ankle_z = p.foot * 0.3
        bone(f"thigh.{side}", (hx, 0, hip_z), (hx, 0, knee_z), "hips")
        bone(f"shin.{side}", (hx, 0, knee_z), (hx, 0, ankle_z), f"thigh.{side}")
        bone(f"foot.{side}", (hx, 0, ankle_z), (hx, -p.foot, 0.0), f"shin.{side}")
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def reduced_armature(props, name="form"):
    """Stage 1 skeleton (root, hips, chest, head). A stub until stage 1 has a builder."""
    raise NotImplementedError("stage 1 reduced armature arrives with its stage card")


def skin_rigid(obj, armature, bone):
    vg = obj.vertex_groups.new(name=bone)
    vg.add([v.index for v in obj.data.vertices], 1.0, "REPLACE")
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = armature
    obj.parent = armature
    return obj


def _thickness(bone, p):
    n = bone.split(".")[0]
    return {
        "hips": p.hip_w * 2.2, "spine": p.hip_w * 2.0, "chest": p.shoulder_w * 1.1,
        "neck": p.head * 0.35, "head": p.head * 0.9,
        "shoulder": p.upper_arm * 0.3, "upper_arm": p.upper_arm * 0.28,
        "forearm": p.forearm * 0.28, "hand": p.hand * 0.6,
        "thigh": p.thigh * 0.28, "shin": p.shin * 0.24, "foot": p.foot * 0.5,
    }[n]


def mannequin(armature, props, materials):
    out = []
    mat_for = {"chest": "armor", "hips": "accent", "head": "trim"}
    for b in armature.data.bones:
        if b.name == "root":
            continue
        head, tail = Vector(b.head_local), Vector(b.tail_local)
        d = tail - head
        length = max(d.length, 0.02)
        t = _thickness(b.name, props)
        base = b.name.split(".")[0]
        # Box local Z runs along the bone; rotate Z to the bone direction.
        if base == "foot":
            # level on the floor, from the ankle forward to the toe
            obj = kit.plate(f"m_{b.name}", size=(t, length, t * 0.6), at=Vector((head.x, (head.y + tail.y) / 2, t * 0.3 + 0.001)),
                            inset=t * 0.15, depth=0.004)
        else:
            obj = kit.plate(f"m_{b.name}", size=(t, t * 0.8, length * 0.92), at=(head + tail) / 2,
                            inset=t * 0.15, depth=0.004, rot=kit.frame_along(d))
        obj.data.materials.append(materials[mat_for.get(base, "metal")])
        kit.add_bevel(obj, width=min(0.004, t * 0.1))
        skin_rigid(obj, armature, b.name)
        out.append(obj)
    chest = armature.data.bones["chest"]
    c = (Vector(chest.head_local) + Vector(chest.tail_local)) / 2
    core = kit.plate("m_core", size=(0.05, 0.02, 0.05), at=(c.x, c.y - props.shoulder_w * 0.45, c.z),
                     inset=0.008, depth=0.003)
    core.data.materials.append(materials["glow"])
    skin_rigid(core, armature, "chest")
    out.append(core)
    return out
