"""Stage 4, the Surveyor: heavy armor, sode and the orbit drones.

The Wayfinder grown broad (1.35 tall): a wide vented chest with a layered breastplate,
full sode pauldrons of three lamellar bands over the shoulders, a six-plate kusazuri
with gold edges, knee and elbow guards with bolt rings, a taller crest with side
fukigaeshi on the kabuto, two gold rings on the staff, and three drones that orbit the
figure at hip height on the `drone.1..3` bones (rig.py adds them for this stage; the
idle emote turns them). Every part follows one bone of the shared rig.
"""
import math

from mathutils import Vector

import kit
from stages.common import Fig


def build(armature, props, mats):
    f = Fig(armature, props, mats)
    p = props
    h = p.height

    # ---- torso ---------------------------------------------------------------------
    c, L, rot, head, tail = f.along("chest")
    cw, cd = p.shoulder_w * 0.84, h * 0.14
    f.add(kit.cyl("chest_frame", r=cw * 0.3, length=L * 1.05, segments=12, at=c, rot=rot), "chest", "metal", bevel=0)
    f.add(f.plate("breastplate", size=(cw * 0.95, cd * 0.72, L * 0.98), at=c + Vector((0, -cd * 0.28, 0)), rot=rot,
                  inset=0.014, depth=0.004, panel=(0, -1, 0), taper=1.2), "chest", "armor", bevel=0.007)
    # the upper tier: a second plate over the breast, the sash under it
    f.add(f.plate("breast_tier", size=(cw * 0.7, cd * 0.3, L * 0.42), at=c + Vector((0, -cd * 0.62, L * 0.22)), rot=rot,
                  inset=0.01, depth=0.004, panel=(0, -1, 0), taper=1.12), "chest", "armor", bevel=0.006)
    f.add(f.plate("breastplate_edge", size=(cw * 0.93, cd * 0.74, 0.016), at=c + Vector((0, -cd * 0.28, -L * 0.5)), rot=rot, inset=0),
          "chest", "trim", bevel=0.003)
    # vents: three slots cut into the lower breastplate on each side
    for sx in (1.0, -1.0):
        for i in range(3):
            f.add(f.plate(f"vent_{'L' if sx > 0 else 'R'}_{i}", size=(cw * 0.16, 0.012, 0.008), at=c + Vector((sx * cw * 0.3, -cd * 0.66, -L * 0.12 - i * 0.026)),
                          rot=rot, inset=0), "chest", "metal", bevel=0)
        f.add(kit.bolt(f"chest_bolt_{'L' if sx > 0 else 'R'}", r=0.008, at=c + Vector((sx * cw * 0.4, -cd * 0.66, L * 0.42)), rot=f.euler(-90, 0, 0)),
              "chest", "trim", bevel=0)
    f.add(f.plate("backplate", size=(cw * 0.88, cd * 0.5, L * 0.9), at=c + Vector((0, cd * 0.3, 0)), rot=rot,
                  inset=0.012, depth=0.004, panel=(0, 1, 0), taper=1.1), "chest", "armor", bevel=0.006)
    f.add(f.plate("backpack", size=(cw * 0.5, cd * 0.3, L * 0.6), at=c + Vector((0, cd * 0.68, -L * 0.05)), rot=rot,
                  inset=0.008, depth=0.003, panel=(0, 1, 0)), "chest", "metal", bevel=0.005)
    sash = f.plate("sash", size=(cw * 0.2, 0.014, L * 1.2), at=c + Vector((0, -cd * 0.7, -L * 0.05)), rot=f.around(rot, "Y", -26), inset=0)
    f.add(sash, "chest", "accent", bevel=0.003)
    f.add(kit.cyl("collar", r=p.neck * 2.3, length=0.022, segments=16, at=tail + Vector((0, 0, 0.004))), "chest", "trim", bevel=0.003)

    c, L, rot, head, tail = f.along("spine")
    f.add(kit.cyl("waist_frame", r=p.hip_w * 0.82, length=L * 1.1, segments=12, at=c, rot=rot), "spine", "metal", bevel=0)
    f.add(f.plate("abdomen", size=(p.hip_w * 2.1, cd * 0.52, L * 0.9), at=c + Vector((0, -cd * 0.3, 0)), rot=rot,
                  inset=0.01, depth=0.003, panel=(0, -1, 0)), "spine", "armor", bevel=0.005)

    c, L, rot, head, tail = f.along("hips")
    f.add(f.plate("belt", size=(p.hip_w * 2.5, cd * 0.95, L * 0.6), at=c, rot=rot, inset=0.01, depth=0.003, panel=(0, -1, 0)), "hips", "metal", bevel=0.005)
    f.add(f.plate("belt_buckle", size=(0.04, 0.014, 0.036), at=c + Vector((0, -cd * 0.49, 0)), rot=rot, inset=0.006, depth=0.002, panel=(0, -1, 0)),
          "hips", "trim", bevel=0.002)
    kl, kw = L * 1.8, p.hip_w * 1.15
    for i, deg in enumerate((-30, 30, -90, 90, -150, 150)):
        a = math.radians(deg)
        r = p.hip_w * 1.5
        at = Vector((r * math.sin(a), -r * math.cos(a), head.z - kl * 0.38))
        rr = f.euler(-14, 0, deg)
        f.add(f.plate(f"kusazuri_{i}", size=(kw, 0.014, kl), at=at, rot=rr, inset=0.01, depth=0.003, panel=(math.sin(a), -math.cos(a), 0), taper=0.8),
              "hips", "armor", bevel=0.005)
        f.add(f.plate(f"kusazuri_edge_{i}", size=(kw * 0.95, 0.016, 0.018), at=at + rr.to_quaternion() @ Vector((0, 0, -kl * 0.5)), rot=rr, inset=0),
              "hips", "trim", bevel=0.002)

    # ---- head: kabuto with a taller crest and fukigaeshi ------------------------------
    c, L, rot, head, tail = f.along("head")
    hr = p.head * 0.42
    f.add(kit.cyl("neck", r=p.neck * 1.7, length=p.neck * 1.6, segments=12, at=head - Vector((0, 0, p.neck * 0.5))), "neck", "metal", bevel=0)
    f.add(kit.plate("face", size=(hr * 1.7, hr * 1.5, L * 0.62), at=c - Vector((0, 0, L * 0.12)), inset=0), "head", "metal", bevel=0.006)
    f.add(kit.sphere("kabuto", r=hr, at=c + Vector((0, 0.01, L * 0.22)), segments=24, rings=12, scale=(1.3, 1.25, 0.9), dome=True), "head", "armor", bevel=0)
    f.add(kit.plate("kabuto_rim", size=(hr * 2.6, hr * 2.5, 0.02), at=c + Vector((0, 0.01, L * 0.2)), inset=0), "head", "trim", bevel=0.003)
    for sx in (1.0, -1.0):
        # fukigaeshi: the turned-back side flaps of the helmet
        f.add(f.plate(f"fukigaeshi_{'L' if sx > 0 else 'R'}", size=(0.014, hr * 1.1, L * 0.42), at=c + Vector((sx * hr * 1.32, -hr * 0.2, L * 0.22)),
                      rot=f.euler(0, sx * -18, 0), inset=0.006, depth=0.002, panel=(sx, 0, 0)), "head", "armor", bevel=0.003)
    f.add(f.plate("visor", size=(hr * 1.8, 0.016, L * 0.28), at=c + Vector((0, -hr * 0.78, L * 0.02)), inset=0.006, depth=0.002, panel=(0, -1, 0)),
          "head", "armor", bevel=0.003)
    f.add(kit.plate("visor_slit", size=(hr * 1.5, 0.01, 0.024), at=c + Vector((0, -hr * 0.88, L * 0.04)), inset=0), "head", "glow", bevel=0)
    for sx in (1.0, -1.0):
        fin = kit.wedge(f"crest_{'L' if sx > 0 else 'R'}", size=(0.014, 0.06, hr * 1.7), at=c + Vector((sx * 0.014, -hr * 0.5, L * 0.6)),
                        rot=f.euler(-22, sx * 24, 0), front=0.2)
        f.add(fin, "head", "trim", bevel=0.002)
    f.add(kit.cyl("crest_base", r=0.018, length=0.02, segments=8, at=c + Vector((0, -hr * 0.55, L * 0.42))), "head", "trim", bevel=0.002)

    # ---- arms: sode of three bands, guards with bolt rings ------------------------------
    for s, sx in f.sides():
        c, L, rot, head, tail = f.along(f"shoulder.{s}")
        f.add(kit.cyl(f"shoulder_joint.{s}", r=p.upper_arm * 0.24, length=L * 0.9, segments=10, at=c, rot=rot), f"shoulder.{s}", "metal", bevel=0)
        sw = p.upper_arm * 1.05
        for i in range(3):
            # a sode band: a curved plate (bent box) hanging lower and wider each step
            band = kit.plate(f"sode_{i}.{s}", size=(sw * (0.82 + 0.09 * i), sw * 0.78, 0.03), at=tail + Vector((sx * 0.02, 0, 0.03 - i * 0.045)),
                             rot=f.euler(0, sx * 22, 0), inset=0.008, depth=0.003, panel=(0, 0, 1))
            f.add(band, f"shoulder.{s}", "armor", bevel=0.005)
            f.add(kit.plate(f"sode_edge_{i}.{s}", size=(sw * (0.82 + 0.09 * i), sw * 0.8, 0.01), at=tail + Vector((sx * 0.02, 0, 0.013 - i * 0.045)),
                            rot=f.euler(0, sx * 22, 0), inset=0), f"shoulder.{s}", "trim", bevel=0.002)
        f.add(kit.sphere(f"cap.{s}", r=p.upper_arm * 0.42, at=tail + Vector((sx * 0.01, 0, 0.05)), segments=16, rings=8, scale=(1, 1, 0.8), dome=True),
              f"shoulder.{s}", "armor", bevel=0)
        c, L, rot, head, tail = f.along(f"upper_arm.{s}")
        f.add(kit.cyl(f"upper_arm.{s}", r=p.upper_arm * 0.21, length=L * 0.95, segments=12, at=c, rot=rot), f"upper_arm.{s}", "metal", bevel=0)
        f.add(f.plate(f"upper_arm_plate.{s}", size=(p.upper_arm * 0.52, p.upper_arm * 0.5, L * 0.55), at=c + rot @ Vector((0, 0, 0.04)) + Vector((sx * 0.012, 0, 0)),
                      rot=rot, inset=0.006, depth=0.003, panel=(sx, 0, 0), taper=0.85), f"upper_arm.{s}", "armor", bevel=0.004)
        f.add(kit.cyl_joint(f"elbow.{s}", r=p.upper_arm * 0.26, length=p.upper_arm * 0.55, segments=12, at=tail, rot=f.euler(0, 90, 0)),
              f"forearm.{s}", "metal", bevel=0)
        for i in range(4):
            a = math.radians(45 + 90 * i)
            f.add(kit.bolt(f"elbow_bolt_{i}.{s}", r=0.006, at=tail + Vector((sx * p.upper_arm * 0.29, p.upper_arm * 0.18 * math.sin(a), p.upper_arm * 0.18 * math.cos(a))),
                           rot=f.euler(0, sx * 90, 0)), f"forearm.{s}", "trim", bevel=0)
        c, L, rot, head, tail = f.along(f"forearm.{s}")
        f.add(kit.cyl(f"forearm.{s}", r=p.forearm * 0.2, length=L * 0.9, segments=12, at=c, rot=rot), f"forearm.{s}", "metal", bevel=0)
        f.add(f.plate(f"forearm_guard.{s}", size=(p.forearm * 0.56, p.forearm * 0.5, L * 0.74), at=c + Vector((sx * 0.008, -0.006, 0.0)), rot=rot,
                      inset=0.007, depth=0.003, panel=(sx, -0.4, 0), taper=0.78), f"forearm.{s}", "armor", bevel=0.004)
        f.add(f.plate(f"forearm_edge.{s}", size=(p.forearm * 0.56, p.forearm * 0.5, 0.012), at=c + rot @ Vector((0, 0, L * 0.38)) + Vector((sx * 0.008, -0.006, 0)),
                      rot=rot, inset=0, taper=0.78), f"forearm.{s}", "trim", bevel=0.002)
        c, L, rot, head, tail = f.along(f"hand.{s}")
        f.add(f.plate(f"hand.{s}", size=(p.hand * 0.95, p.hand * 1.15, L * 1.15), at=c, rot=rot, inset=0.004, depth=0.002, panel=(sx, 0, 0)),
              f"hand.{s}", "metal", bevel=0.003)

    # ---- legs: thigh and shin guards, knee guards with bolt rings, heavier boots -------
    for s, sx in f.sides():
        c, L, rot, head, tail = f.along(f"thigh.{s}")
        f.add(kit.cyl(f"thigh.{s}", r=p.thigh * 0.25, length=L * 0.95, segments=12, at=c, rot=rot), f"thigh.{s}", "metal", bevel=0)
        f.add(f.plate(f"thigh_guard.{s}", size=(p.thigh * 0.6, p.thigh * 0.44, L * 0.66), at=c + Vector((sx * 0.014, -p.thigh * 0.12, 0.02)), rot=rot,
                      inset=0.01, depth=0.003, panel=(0, -1, 0), taper=0.9), f"thigh.{s}", "armor", bevel=0.005)
        f.add(kit.cyl_joint(f"knee.{s}", r=p.thigh * 0.27, length=p.thigh * 0.52, segments=12, at=tail, rot=f.euler(0, 90, 0)), f"shin.{s}", "metal", bevel=0)
        f.add(f.plate(f"knee_guard.{s}", size=(p.thigh * 0.5, p.thigh * 0.2, p.thigh * 0.4), at=tail + Vector((0, -p.thigh * 0.3, 0)), inset=0.008, depth=0.003,
                      panel=(0, -1, 0)), f"shin.{s}", "armor", bevel=0.005)
        for i in range(4):
            a = math.radians(45 + 90 * i)
            f.add(kit.bolt(f"knee_bolt_{i}.{s}", r=0.006, at=tail + Vector((sx * p.thigh * 0.3, p.thigh * 0.18 * math.sin(a), p.thigh * 0.18 * math.cos(a))),
                           rot=f.euler(0, sx * 90, 0)), f"shin.{s}", "trim", bevel=0)
        c, L, rot, head, tail = f.along(f"shin.{s}")
        f.add(kit.cyl(f"shin.{s}", r=p.shin * 0.22, length=L * 0.95, segments=12, at=c, rot=rot), f"shin.{s}", "metal", bevel=0)
        f.add(f.plate(f"shin_guard.{s}", size=(p.shin * 0.56, p.shin * 0.4, L * 0.78), at=c + Vector((0, -p.shin * 0.12, 0)), rot=rot,
                      inset=0.01, depth=0.003, panel=(0, -1, 0), taper=0.82), f"shin.{s}", "armor", bevel=0.005)
        c, L, rot, head, tail = f.along(f"foot.{s}")
        fl = p.foot * 1.65
        f.add(kit.plate(f"boot.{s}", size=(p.foot * 1.0, fl, p.foot * 0.66), at=Vector((head.x, head.y - fl * 0.3, p.foot * 0.33)), inset=0.007, depth=0.003,
                        panel=(0, 0, 1)), f"foot.{s}", "armor", bevel=0.005)
        f.add(kit.wedge(f"toe.{s}", size=(p.foot * 0.95, p.foot * 0.55, p.foot * 0.48), at=Vector((head.x, head.y - fl * 0.74, p.foot * 0.29)), rot=f.euler(90, 0, 0), front=0.5),
              f"foot.{s}", "metal", bevel=0.003)
        f.add(kit.plate(f"boot_edge.{s}", size=(p.foot * 1.0, fl * 0.3, 0.014), at=Vector((head.x, head.y + fl * 0.02, p.foot * 0.66))), f"foot.{s}", "trim", bevel=0.002)

    # ---- the beacon staff with two rings ------------------------------------------------
    c, L, rot, head, tail = f.along("hand.R")
    sl = h * 0.98
    sx0 = c.x - 0.018
    f.add(kit.cyl("staff", r=0.012, length=sl, segments=6, at=Vector((sx0, c.y, sl * 0.5 + 0.01))), "hand.R", "metal", bevel=0)
    f.add(kit.cyl("staff_grip", r=0.017, length=p.hand * 1.3, segments=8, at=Vector((sx0, c.y, c.z))), "hand.R", "accent", bevel=0.002)
    f.add(kit.cyl("staff_collar", r=0.024, length=0.03, segments=8, at=Vector((sx0, c.y, sl + 0.01))), "hand.R", "trim", bevel=0.003)
    f.add(kit.cyl("staff_ferrule", r=0.017, length=0.022, segments=6, at=Vector((sx0, c.y, 0.022))), "hand.R", "trim", bevel=0.002)
    for i, z in enumerate((sl * 0.62, sl * 0.74)):
        f.add(kit.cyl(f"staff_ring_{i}", r=0.034, length=0.012, segments=12, at=Vector((sx0, c.y, z))), "hand.R", "trim", bevel=0.002)
    lz = sl + 0.085
    f.add(kit.plate("lantern", size=(0.058, 0.058, 0.092), at=Vector((sx0, c.y, lz)), rot=f.euler(0, 0, 45), inset=0), "hand.R", "glow", bevel=0.007, segments=3)
    for i in range(4):
        a = math.radians(45 + 90 * i)
        f.add(kit.cyl(f"lantern_bar_{i}", r=0.0045, length=0.115, segments=6, at=Vector((sx0 + 0.046 * math.sin(a), c.y - 0.046 * math.cos(a), lz))),
              "hand.R", "trim", bevel=0)
    f.add(kit.cyl("lantern_cap", r=0.052, length=0.014, segments=8, at=Vector((sx0, c.y, lz + 0.064)), rot=f.euler(0, 0, 22.5)), "hand.R", "trim", bevel=0.003)
    f.add(kit.cyl("lantern_base", r=0.052, length=0.014, segments=8, at=Vector((sx0, c.y, lz - 0.064)), rot=f.euler(0, 0, 22.5)), "hand.R", "trim", bevel=0.003)
    f.add(kit.cyl("lantern_spire", r=0.007, length=0.06, segments=6, r2=0.0, at=Vector((sx0, c.y, lz + 0.1))), "hand.R", "trim", bevel=0)

    # ---- the orbit drones ---------------------------------------------------------------
    for i in range(1, 4):
        c, L, rot, head, tail = f.along(f"drone.{i}")
        dr = h * 0.03
        f.add(kit.sphere(f"drone_core_{i}", r=dr * 0.6, at=c, segments=10, rings=6), f"drone.{i}", "glow", bevel=0)
        f.add(kit.cyl(f"drone_ring_{i}", r=dr, length=dr * 0.3, segments=12, at=c, rot=f.euler(90, 0, 0)), f"drone.{i}", "metal", bevel=0.002)
        f.add(kit.cyl(f"drone_ring2_{i}", r=dr * 0.95, length=dr * 0.3, segments=12, at=c, rot=f.euler(0, 90, 0)), f"drone.{i}", "trim", bevel=0.002)

    return f.parts
