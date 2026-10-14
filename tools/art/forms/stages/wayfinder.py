"""Stage 3, the Wayfinder: light armor and the beacon staff.

The first stage that reads as a samurai silhouette (1.1 tall): torso plates with panel
lines over a dark frame, a sash of the learner's hue across the chest, four kusazuri
skirt plates, round shoulder caps, a kabuto bowl with a low crest and a visor with a
glow slit, shin and forearm guards, and the beacon staff in the right hand: a hex shaft,
a gold collar and a caged lantern that glows. Every part follows one bone of the shared
rig (rig.py), so the emotes (emotes.py) move it; the staff follows `hand.R`.
"""
import math

from mathutils import Vector

import kit
from stages.common import Fig


def build(armature, props, mats):
    f = Fig(armature, props, mats)
    p = props
    h = p.height

    # ---- torso: a dark frame with armor plates over it -------------------------
    c, L, rot, head, tail = f.along("chest")
    cw, cd = p.shoulder_w * 0.78, h * 0.13
    f.add(kit.cyl("chest_frame", r=cw * 0.3, length=L * 1.05, segments=12, at=c, rot=rot), "chest", "metal", bevel=0)
    # the breastplate: a tapered plate, wider at the shoulders, panel line facing front
    f.add(f.plate("breastplate", size=(cw * 0.92, cd * 0.7, L * 0.95), at=c + Vector((0, -cd * 0.28, 0)), rot=rot,
                    inset=0.012, depth=0.004, panel=(0, -1, 0), taper=1.18), "chest", "armor", bevel=0.006)
    f.add(f.plate("breastplate_edge", size=(cw * 0.9, cd * 0.72, 0.014), at=c + Vector((0, -cd * 0.28, -L * 0.48)), rot=rot, inset=0),
          "chest", "trim", bevel=0.003)
    for sx in (1.0, -1.0):
        f.add(kit.bolt(f"chest_bolt_{'L' if sx > 0 else 'R'}", r=0.007, at=c + Vector((sx * cw * 0.36, -cd * 0.63, L * 0.3)), rot=f.euler(-90, 0, 0)),
              "chest", "trim", bevel=0)
    # the back plate, plain
    f.add(f.plate("backplate", size=(cw * 0.84, cd * 0.5, L * 0.88), at=c + Vector((0, cd * 0.3, 0)), rot=rot,
                    inset=0.01, depth=0.003, panel=(0, 1, 0), taper=1.1), "chest", "armor", bevel=0.005)
    # the sash: a band of the learner's hue across the chest, shoulder.L to hip.R
    sash = f.plate("sash", size=(cw * 0.2, 0.012, L * 1.2), at=c + Vector((0, -cd * 0.66, 0)), rot=rot, inset=0)
    sash.rotation_mode = "QUATERNION"
    sash.rotation_quaternion = f.around(rot, "Y", -28)
    f.add(sash, "chest", "accent", bevel=0.003)
    # the collar ring
    f.add(kit.cyl("collar", r=p.neck * 2.2, length=0.02, segments=16, at=tail + Vector((0, 0, 0.004))), "chest", "trim", bevel=0.003)

    c, L, rot, head, tail = f.along("spine")
    f.add(kit.cyl("waist_frame", r=p.hip_w * 0.8, length=L * 1.1, segments=12, at=c, rot=rot), "spine", "metal", bevel=0)
    f.add(f.plate("abdomen", size=(p.hip_w * 2.0, cd * 0.5, L * 0.9), at=c + Vector((0, -cd * 0.3, 0)), rot=rot,
                    inset=0.008, depth=0.003, panel=(0, -1, 0)), "spine", "armor", bevel=0.004)

    c, L, rot, head, tail = f.along("hips")
    f.add(f.plate("belt", size=(p.hip_w * 2.4, cd * 0.9, L * 0.55), at=c, rot=rot, inset=0.008, depth=0.003, panel=(0, -1, 0)),
          "hips", "metal", bevel=0.004)
    f.add(f.plate("belt_buckle", size=(0.03, 0.012, 0.03), at=c + Vector((0, -cd * 0.47, 0)), rot=rot, inset=0.005, depth=0.002, panel=(0, -1, 0)),
          "hips", "trim", bevel=0.002)
    # kusazuri: four skirt plates hung from the belt, tilted outward
    kl, kw = L * 1.6, p.hip_w * 1.5
    for i, deg in enumerate((-50, 50, -130, 130)):
        a = math.radians(deg)
        r = p.hip_w * 1.45
        at = Vector((r * math.sin(a), -r * math.cos(a), head.z - kl * 0.38))
        plate = f.plate(f"kusazuri_{i}", size=(kw, 0.012, kl), at=at, rot=f.euler(-14, 0, deg), inset=0.008, depth=0.003,
                          panel=(0, -1, 0), taper=0.78)
        f.add(plate, "hips", "armor", bevel=0.004)
        edge = f.plate(f"kusazuri_edge_{i}", size=(kw * 0.95, 0.014, 0.016), at=at + f.euler(-14, 0, deg).to_quaternion() @ Vector((0, 0, -kl * 0.5)),
                         rot=f.euler(-14, 0, deg), inset=0)
        f.add(edge, "hips", "trim", bevel=0.002)

    # ---- head: kabuto bowl, face block, visor, crest ------------------------------
    c, L, rot, head, tail = f.along("head")
    hr = p.head * 0.42
    f.add(kit.cyl("neck", r=p.neck * 1.6, length=p.neck * 1.6, segments=12, at=head - Vector((0, 0, p.neck * 0.5))), "neck", "metal", bevel=0)
    f.add(kit.plate("face", size=(hr * 1.7, hr * 1.5, L * 0.62), at=c - Vector((0, 0, L * 0.12)), inset=0), "head", "metal", bevel=0.006)
    f.add(kit.sphere("kabuto", r=hr, at=c + Vector((0, 0.01, L * 0.22)), segments=24, rings=12, scale=(1.25, 1.2, 0.85), dome=True),
          "head", "armor", bevel=0)
    f.add(kit.plate("kabuto_rim", size=(hr * 2.5, hr * 2.4, 0.018), at=c + Vector((0, 0.01, L * 0.2)), inset=0), "head", "trim", bevel=0.003)
    f.add(kit.plate("visor", size=(hr * 1.75, 0.014, L * 0.26), at=c + Vector((0, -hr * 0.78, L * 0.02)), inset=0.005, depth=0.002, panel=(0, -1, 0)),
          "head", "armor", bevel=0.003)
    f.add(kit.plate("visor_slit", size=(hr * 1.45, 0.01, 0.022), at=c + Vector((0, -hr * 0.87, L * 0.04)), inset=0), "head", "glow", bevel=0)
    # the crest: a low V of two gold fins on the brow
    for sx in (1.0, -1.0):
        fin = kit.wedge(f"crest_{'L' if sx > 0 else 'R'}", size=(0.012, 0.05, hr * 1.1), at=c + Vector((sx * 0.012, -hr * 0.55, L * 0.5)),
                        rot=f.euler(-20, sx * 22, 0), front=0.25)
        f.add(fin, "head", "trim", bevel=0.002)

    # ---- arms: caps, frames, guards, hands -----------------------------------------
    for s, sx in f.sides():
        c, L, rot, head, tail = f.along(f"shoulder.{s}")
        cr = p.upper_arm * 0.5
        f.add(kit.sphere(f"cap.{s}", r=cr, at=tail + Vector((sx * 0.012, 0, 0.012)), segments=20, rings=10, scale=(1.0, 1.0, 0.85), dome=True),
              f"shoulder.{s}", "armor", bevel=0)
        f.add(kit.cyl(f"cap_ring.{s}", r=cr * 1.02, length=0.014, segments=20, at=tail + Vector((sx * 0.012, 0, 0.005))),
              f"shoulder.{s}", "trim", bevel=0.002)
        f.add(kit.cyl(f"shoulder_joint.{s}", r=p.upper_arm * 0.22, length=L * 0.9, segments=10, at=c, rot=rot), f"shoulder.{s}", "metal", bevel=0)
        c, L, rot, head, tail = f.along(f"upper_arm.{s}")
        f.add(kit.cyl(f"upper_arm.{s}", r=p.upper_arm * 0.2, length=L * 0.95, segments=12, at=c, rot=rot), f"upper_arm.{s}", "metal", bevel=0)
        f.add(f.plate(f"upper_arm_plate.{s}", size=(p.upper_arm * 0.5, p.upper_arm * 0.48, L * 0.6), at=c + rot @ Vector((0, 0, 0.03)) + Vector((sx * 0.01, 0, 0)),
                      rot=rot, inset=0.006, depth=0.003, panel=(sx, 0, 0), taper=0.85), f"upper_arm.{s}", "armor", bevel=0.004)
        f.add(kit.cyl_joint(f"elbow.{s}", r=p.upper_arm * 0.24, length=p.upper_arm * 0.5, segments=12, at=tail, rot=f.euler(0, 90, 0)),
              f"forearm.{s}", "metal", bevel=0)
        c, L, rot, head, tail = f.along(f"forearm.{s}")
        f.add(kit.cyl(f"forearm.{s}", r=p.forearm * 0.19, length=L * 0.9, segments=12, at=c, rot=rot), f"forearm.{s}", "metal", bevel=0)
        f.add(f.plate(f"forearm_guard.{s}", size=(p.forearm * 0.5, p.forearm * 0.46, L * 0.72), at=c + Vector((sx * 0.006, -0.006, 0.0)), rot=rot,
                      inset=0.006, depth=0.003, panel=(sx, -0.4, 0), taper=0.8), f"forearm.{s}", "armor", bevel=0.004)
        c, L, rot, head, tail = f.along(f"hand.{s}")
        f.add(f.plate(f"hand.{s}", size=(p.hand * 0.9, p.hand * 1.1, L * 1.15), at=c, rot=rot, inset=0.004, depth=0.002, panel=(sx, 0, 0)),
              f"hand.{s}", "metal", bevel=0.003)

    # ---- legs: thigh and shin frames, shin guards, boots ----------------------------
    for s, sx in f.sides():
        c, L, rot, head, tail = f.along(f"thigh.{s}")
        f.add(kit.cyl(f"thigh.{s}", r=p.thigh * 0.24, length=L * 0.95, segments=12, at=c, rot=rot), f"thigh.{s}", "metal", bevel=0)
        f.add(f.plate(f"thigh_guard.{s}", size=(p.thigh * 0.56, p.thigh * 0.4, L * 0.66), at=c + Vector((sx * 0.012, -p.thigh * 0.12, 0.02)), rot=rot,
                        inset=0.008, depth=0.003, panel=(0, -1, 0), taper=0.92), f"thigh.{s}", "armor", bevel=0.004)
        f.add(kit.cyl_joint(f"knee.{s}", r=p.thigh * 0.26, length=p.thigh * 0.5, segments=12, at=tail, rot=f.euler(0, 90, 0)),
              f"shin.{s}", "metal", bevel=0)
        c, L, rot, head, tail = f.along(f"shin.{s}")
        f.add(kit.cyl(f"shin.{s}", r=p.shin * 0.21, length=L * 0.95, segments=12, at=c, rot=rot), f"shin.{s}", "metal", bevel=0)
        f.add(f.plate(f"shin_guard.{s}", size=(p.shin * 0.52, p.shin * 0.36, L * 0.78), at=c + Vector((0, -p.shin * 0.12, 0)), rot=rot,
                        inset=0.008, depth=0.003, panel=(0, -1, 0), taper=0.84), f"shin.{s}", "armor", bevel=0.004)
        c, L, rot, head, tail = f.along(f"foot.{s}")
        fl = p.foot * 1.6
        f.add(kit.plate(f"boot.{s}", size=(p.foot * 0.95, fl, p.foot * 0.62), at=Vector((head.x, head.y - fl * 0.3, p.foot * 0.31)), inset=0.006, depth=0.003,
                        panel=(0, 0, 1)), f"foot.{s}", "armor", bevel=0.005)
        f.add(kit.wedge(f"toe.{s}", size=(p.foot * 0.9, p.foot * 0.55, p.foot * 0.45), at=Vector((head.x, head.y - fl * 0.74, p.foot * 0.285)), rot=f.euler(90, 0, 0), front=0.5),
              f"foot.{s}", "metal", bevel=0.003)

    # ---- the beacon staff, in the right hand ------------------------------------------
    c, L, rot, head, tail = f.along("hand.R")
    sl = h * 0.98
    sx0 = c.x - 0.015
    f.add(kit.cyl("staff", r=0.011, length=sl, segments=6, at=Vector((sx0, c.y, sl * 0.5 + 0.01))), "hand.R", "metal", bevel=0)
    f.add(kit.cyl("staff_grip", r=0.015, length=p.hand * 1.3, segments=8, at=Vector((sx0, c.y, c.z))), "hand.R", "accent", bevel=0.002)
    f.add(kit.cyl("staff_collar", r=0.022, length=0.028, segments=8, at=Vector((sx0, c.y, sl + 0.01))), "hand.R", "trim", bevel=0.003)
    f.add(kit.cyl("staff_ferrule", r=0.016, length=0.02, segments=6, at=Vector((sx0, c.y, 0.02))), "hand.R", "trim", bevel=0.002)
    lz = sl + 0.075
    f.add(kit.plate("lantern", size=(0.05, 0.05, 0.08), at=Vector((sx0, c.y, lz)), rot=f.euler(0, 0, 45), inset=0), "hand.R", "glow", bevel=0.006, segments=3)
    for i in range(4):
        a = math.radians(45 + 90 * i)
        bar = kit.cyl(f"lantern_bar_{i}", r=0.004, length=0.1, segments=6, at=Vector((sx0 + 0.04 * math.sin(a), c.y - 0.04 * math.cos(a), lz)))
        f.add(bar, "hand.R", "trim", bevel=0)
    f.add(kit.cyl("lantern_cap", r=0.045, length=0.012, segments=8, at=Vector((sx0, c.y, lz + 0.056)), rot=f.euler(0, 0, 22.5)), "hand.R", "trim", bevel=0.003)
    f.add(kit.cyl("lantern_base", r=0.045, length=0.012, segments=8, at=Vector((sx0, c.y, lz - 0.056)), rot=f.euler(0, 0, 22.5)), "hand.R", "trim", bevel=0.003)
    f.add(kit.cyl("lantern_spire", r=0.006, length=0.05, segments=6, r2=0.0, at=Vector((sx0, c.y, lz + 0.085))), "hand.R", "trim", bevel=0)

    return f.parts
