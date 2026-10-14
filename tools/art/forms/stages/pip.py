"""Stage 1, Pip: a floating core unit, the start of the figure.

No limbs (0.6 tall): a faceted egg of white lacquer with one band in the learner's hue,
a single glow eye in a dark bezel, two gold vanes swept back from the shoulders, three
fins hanging under it, a stub antenna with a glow bead, hovering over a soft glow disc
on the ground. It stands on the reduced rig (rig.py): the core on `hips`, the vanes and
antenna on `chest`, the eye on `head`, the disc on `root`; the emotes bob, tilt and turn
those. Pip's eye, band and vanes are what the later stages grow from: the Sprig carries
this core as its chest.
"""
import math

from mathutils import Vector

import kit
from stages.common import Fig


def build(armature, props, mats):
    f = Fig(armature, props, mats)
    h = props.height

    c, L, rot, head, tail = f.along("hips")
    cr = h * 0.2
    core_c = Vector((0, 0, (head.z + tail.z) / 2))
    # the core: a faceted egg, taller than wide, with a low-poly look (few segments)
    f.add(kit.sphere("core", r=cr, at=core_c, segments=14, rings=9, scale=(1.0, 0.92, 1.3)), "hips", "armor", bevel=0)
    # the band of the learner's hue around its waist
    f.add(kit.cyl("band", r=cr * 1.015, length=cr * 0.26, segments=14, at=core_c - Vector((0, 0, cr * 0.1))), "hips", "accent", bevel=0.003)
    # the dark under-shell, where the fins hang from
    f.add(kit.sphere("under_shell", r=cr * 0.98, at=core_c - Vector((0, 0, cr * 0.02)), segments=14, rings=9, scale=(1.0, 0.92, 1.3)),
          "hips", "metal", bevel=0)
    for i in range(3):
        a = math.radians(90 + 120 * i)
        at = core_c + Vector((cr * 0.62 * math.sin(a), -cr * 0.58 * math.cos(a), -cr * 1.25))
        fin = kit.wedge(f"fin_{i}", size=(cr * 0.22, cr * 0.4, cr * 0.55), at=at, rot=f.euler(180 + 14, 0, math.degrees(a)), front=0.3)
        f.add(fin, "hips", "metal", bevel=0.002)
    # three bolts around the band's seam
    for i in range(3):
        a = math.radians(60 + 120 * i)
        at = core_c + Vector((cr * 1.0 * math.sin(a), -cr * 0.93 * math.cos(a), cr * 0.28))
        f.add(kit.bolt(f"bolt_{i}", r=cr * 0.06, at=at, rot=f.euler(-90, 0, math.degrees(a))), "hips", "trim", bevel=0)

    # the eye: a dark bezel sunk into the front, a glow lens inside it
    c, L, rot, head, tail = f.along("head")
    eye_c = Vector((0, -cr * 0.8, head.z))
    f.add(kit.cyl("eye_bezel", r=cr * 0.34, length=cr * 0.3, segments=16, at=eye_c, rot=f.euler(90, 0, 0)), "head", "metal", bevel=0.003)
    f.add(kit.sphere("eye", r=cr * 0.24, at=eye_c - Vector((0, cr * 0.1, 0)), segments=16, rings=8), "head", "glow", bevel=0)
    f.add(kit.cyl("eye_ring", r=cr * 0.36, length=cr * 0.06, segments=16, at=eye_c - Vector((0, cr * 0.14, 0)), rot=f.euler(90, 0, 0)),
          "head", "trim", bevel=0.002)

    # the vanes: two gold fins swept back from the shoulders, and the antenna
    c, L, rot, head, tail = f.along("chest")
    for s, sx in f.sides():
        at = core_c + Vector((sx * cr * 0.95, cr * 0.2, cr * 0.55))
        vane = kit.wedge(f"vane.{s}", size=(cr * 0.12, cr * 0.5, cr * 0.9), at=at, rot=f.euler(-35, sx * 38, sx * 10), front=0.2)
        f.add(vane, "chest", "trim", bevel=0.002)
    top = Vector((0, 0, core_c.z + cr * 1.3))
    f.add(kit.cyl("antenna", r=cr * 0.05, length=cr * 0.5, segments=6, at=top + Vector((0, 0, cr * 0.2))), "chest", "metal", bevel=0)
    f.add(kit.sphere("antenna_bead", r=cr * 0.11, at=top + Vector((0, 0, cr * 0.5)), segments=10, rings=6), "chest", "glow", bevel=0)
    f.add(kit.cyl("antenna_base", r=cr * 0.14, length=cr * 0.08, segments=8, at=top), "chest", "trim", bevel=0.002)

    # the hover disc on the ground
    f.add(kit.cyl("hover_disc", r=cr * 1.05, length=0.006, segments=24, at=Vector((0, 0, 0.004))), "root", "glow", bevel=0)
    f.add(kit.cyl("hover_ring", r=cr * 1.15, length=0.01, segments=24, at=Vector((0, 0, 0.006))), "root", "metal", bevel=0.002)

    return f.parts
