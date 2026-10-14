"""Stage 5, the Luminary: the commander, crowned and haloed, carrying the beacon.

The tallest figure (1.75): a two-tier chest over the frame, sode of five lamellar bands
with gold edges, an eight-plate kusazuri, a full kabuto with a swept V crest carrying
five glow beads and wide fukigaeshi, a halo frame of two crossed gold rings turning on
the `halo` bone behind the shoulders, a rigid back-cape plate in the learner's hue, and
a long beacon staff with a large lantern. Three drones orbit it as the Surveyor's do.
Every part follows one bone of the shared rig (rig.py adds `halo` and the drones for
this stage).
"""
import math

from mathutils import Vector

import kit
from stages.common import Fig


def build(armature, props, mats):
    f = Fig(armature, props, mats)
    p = props
    h = p.height

    # ---- torso: two tiers of plate over the frame ----------------------------------
    c, L, rot, head, tail = f.along("chest")
    cw, cd = p.shoulder_w * 0.86, h * 0.14
    f.add(kit.cyl("chest_frame", r=cw * 0.3, length=L * 1.05, segments=12, at=c, rot=rot), "chest", "metal", bevel=0)
    f.add(f.plate("breastplate", size=(cw * 0.96, cd * 0.72, L * 0.98), at=c + Vector((0, -cd * 0.28, 0)), rot=rot,
                  inset=0.016, depth=0.005, panel=(0, -1, 0), taper=1.2), "chest", "armor", bevel=0.008)
    f.add(f.plate("breast_tier", size=(cw * 0.76, cd * 0.32, L * 0.46), at=c + Vector((0, -cd * 0.64, L * 0.2)), rot=rot,
                  inset=0.012, depth=0.004, panel=(0, -1, 0), taper=1.14), "chest", "armor", bevel=0.006)
    f.add(f.plate("breast_tier_edge", size=(cw * 0.74, cd * 0.34, 0.016), at=c + Vector((0, -cd * 0.64, -L * 0.03)), rot=rot, inset=0),
          "chest", "trim", bevel=0.003)
    f.add(f.plate("breastplate_edge", size=(cw * 0.94, cd * 0.74, 0.018), at=c + Vector((0, -cd * 0.28, -L * 0.5)), rot=rot, inset=0),
          "chest", "trim", bevel=0.003)
    f.add(kit.sphere("chest_gem", r=0.022, at=c + Vector((0, -cd * 0.82, L * 0.2)), segments=12, rings=6), "chest", "glow", bevel=0)
    f.add(kit.ring("chest_gem_ring", r=0.03, thickness=0.008, depth=0.01, segments=16, at=c + Vector((0, -cd * 0.8, L * 0.2)), rot=f.euler(90, 0, 0)),
          "chest", "trim", bevel=0.002)
    for sx in (1.0, -1.0):
        f.add(kit.bolt(f"chest_bolt_{'L' if sx > 0 else 'R'}", r=0.009, at=c + Vector((sx * cw * 0.4, -cd * 0.66, L * 0.42)), rot=f.euler(-90, 0, 0)),
              "chest", "trim", bevel=0)
    f.add(f.plate("backplate", size=(cw * 0.9, cd * 0.5, L * 0.92), at=c + Vector((0, cd * 0.3, 0)), rot=rot,
                  inset=0.014, depth=0.004, panel=(0, 1, 0), taper=1.1), "chest", "armor", bevel=0.006)
    # the back-cape: a rigid plate of the learner's hue hanging from the shoulders, its
    # hem swung a little backward so it clears the kusazuri and the legs at rest
    cape_rot = f.euler(8, 0, 0)
    cape_c = c + Vector((0, cd * 0.66, -L * 0.85))
    f.add(f.plate("cape", size=(cw * 0.78, 0.016, L * 2.6), at=cape_c, rot=cape_rot,
                  inset=0.012, depth=0.003, panel=(0, 1, 0), taper=1.25), "chest", "accent", bevel=0.004)
    hem = cape_c + cape_rot.to_quaternion() @ Vector((0, 0, -L * 1.3))
    f.add(f.plate("cape_edge", size=(cw * 0.8, 0.02, 0.02), at=hem, rot=cape_rot, inset=0), "chest", "trim", bevel=0.003)
    f.add(kit.cyl("collar", r=p.neck * 2.4, length=0.024, segments=16, at=tail + Vector((0, 0, 0.004))), "chest", "trim", bevel=0.003)

    c, L, rot, head, tail = f.along("spine")
    f.add(kit.cyl("waist_frame", r=p.hip_w * 0.82, length=L * 1.1, segments=12, at=c, rot=rot), "spine", "metal", bevel=0)
    f.add(f.plate("abdomen", size=(p.hip_w * 2.1, cd * 0.52, L * 0.9), at=c + Vector((0, -cd * 0.3, 0)), rot=rot,
                  inset=0.012, depth=0.004, panel=(0, -1, 0)), "spine", "armor", bevel=0.005)

    c, L, rot, head, tail = f.along("hips")
    f.add(f.plate("belt", size=(p.hip_w * 2.5, cd * 0.95, L * 0.6), at=c, rot=rot, inset=0.012, depth=0.003, panel=(0, -1, 0)), "hips", "metal", bevel=0.005)
    f.add(f.plate("belt_buckle", size=(0.046, 0.016, 0.04), at=c + Vector((0, -cd * 0.49, 0)), rot=rot, inset=0.007, depth=0.002, panel=(0, -1, 0)),
          "hips", "trim", bevel=0.002)
    kl, kw = L * 1.9, p.hip_w * 0.95
    for i in range(8):
        deg = -157.5 + 45 * i
        a = math.radians(deg)
        r = p.hip_w * 1.55
        at = Vector((r * math.sin(a), -r * math.cos(a), head.z - kl * 0.38))
        rr = f.euler(-14, 0, deg)
        f.add(f.plate(f"kusazuri_{i}", size=(kw, 0.016, kl), at=at, rot=rr, inset=0.012, depth=0.003, panel=(math.sin(a), -math.cos(a), 0), taper=0.8),
              "hips", "armor", bevel=0.005)
        f.add(f.plate(f"kusazuri_edge_{i}", size=(kw * 0.95, 0.018, 0.02), at=at + rr.to_quaternion() @ Vector((0, 0, -kl * 0.5)), rot=rr, inset=0),
              "hips", "trim", bevel=0.002)

    # ---- head: the full kabuto, a swept crest with five beads, fukigaeshi ----------
    c, L, rot, head, tail = f.along("head")
    hr = p.head * 0.42
    f.add(kit.cyl("neck", r=p.neck * 1.8, length=p.neck * 1.6, segments=12, at=head - Vector((0, 0, p.neck * 0.5))), "neck", "metal", bevel=0)
    f.add(kit.plate("face", size=(hr * 1.7, hr * 1.5, L * 0.62), at=c - Vector((0, 0, L * 0.12)), inset=0), "head", "metal", bevel=0.006)
    f.add(kit.sphere("kabuto", r=hr, at=c + Vector((0, 0.01, L * 0.22)), segments=24, rings=12, scale=(1.32, 1.28, 0.95), dome=True), "head", "armor", bevel=0)
    f.add(kit.plate("kabuto_rim", size=(hr * 2.7, hr * 2.6, 0.022), at=c + Vector((0, 0.01, L * 0.2)), inset=0), "head", "trim", bevel=0.003)
    f.add(kit.plate("kabuto_ridge", size=(0.016, hr * 2.2, 0.03), at=c + Vector((0, 0.0, L * 0.64)), inset=0), "head", "trim", bevel=0.003)
    for sx in (1.0, -1.0):
        f.add(f.plate(f"fukigaeshi_{'L' if sx > 0 else 'R'}", size=(0.016, hr * 1.3, L * 0.5), at=c + Vector((sx * hr * 1.38, -hr * 0.25, L * 0.2)),
                      rot=f.euler(0, sx * -22, 0), inset=0.008, depth=0.003, panel=(sx, 0, 0)), "head", "armor", bevel=0.003)
        f.add(f.plate(f"fukigaeshi_edge_{'L' if sx > 0 else 'R'}", size=(0.018, hr * 1.3, 0.016), at=c + Vector((sx * hr * 1.46, -hr * 0.25, L * 0.45)),
                      rot=f.euler(0, sx * -22, 0), inset=0), "head", "trim", bevel=0.002)
    f.add(f.plate("visor", size=(hr * 1.85, 0.018, L * 0.3), at=c + Vector((0, -hr * 0.78, L * 0.02)), inset=0.007, depth=0.002, panel=(0, -1, 0)),
          "head", "armor", bevel=0.003)
    f.add(kit.plate("visor_slit", size=(hr * 1.55, 0.012, 0.026), at=c + Vector((0, -hr * 0.88, L * 0.04)), inset=0), "head", "glow", bevel=0)
    # the crest: a swept V of two tall gold fins, five glow beads along their tips
    for sx in (1.0, -1.0):
        fin = kit.wedge(f"crest_{'L' if sx > 0 else 'R'}", size=(0.016, 0.07, hr * 2.4), at=c + Vector((sx * 0.045, -hr * 0.45, L * 0.7)),
                        rot=f.euler(-26, sx * 14, 0), front=0.2)
        f.add(fin, "head", "trim", bevel=0.002)
    f.add(kit.cyl("crest_base", r=0.022, length=0.024, segments=8, at=c + Vector((0, -hr * 0.52, L * 0.42))), "head", "trim", bevel=0.002)
    # five glow beads riding the fins: one on the base, two up each fin to its tip
    fin_len = hr * 2.4
    f.add(kit.sphere("crest_bead_0", r=0.015, at=c + Vector((0, -hr * 0.52, L * 0.42 + 0.02)), segments=10, rings=6), "head", "glow", bevel=0)
    for sx in (1.0, -1.0):
        base = c + Vector((sx * 0.045, -hr * 0.45, L * 0.7))
        tip_dir = f.euler(-26, sx * 14, 0).to_quaternion() @ Vector((0, 0, 1))
        for k, t in enumerate((0.22, 0.5)):
            at = base + tip_dir * (fin_len * t)
            f.add(kit.sphere(f"crest_bead_{'L' if sx > 0 else 'R'}{k}", r=0.013, at=at, segments=10, rings=6), "head", "glow", bevel=0)

    # ---- arms: sode of five bands, guards with bolt rings -------------------------------
    for s, sx in f.sides():
        c, L, rot, head, tail = f.along(f"shoulder.{s}")
        f.add(kit.cyl(f"shoulder_joint.{s}", r=p.upper_arm * 0.24, length=L * 0.9, segments=10, at=c, rot=rot), f"shoulder.{s}", "metal", bevel=0)
        sw = p.upper_arm * 1.0
        for i in range(5):
            band = kit.plate(f"sode_{i}.{s}", size=(sw * (0.78 + 0.07 * i), sw * 0.78, 0.03), at=tail + Vector((sx * 0.024, 0, 0.04 - i * 0.042)),
                             rot=f.euler(0, sx * 24, 0), inset=0.01, depth=0.003, panel=(0, 0, 1))
            f.add(band, f"shoulder.{s}", "armor", bevel=0.005)
            f.add(kit.plate(f"sode_edge_{i}.{s}", size=(sw * (0.78 + 0.07 * i), sw * 0.8, 0.012), at=tail + Vector((sx * 0.024, 0, 0.022 - i * 0.042)),
                            rot=f.euler(0, sx * 24, 0), inset=0), f"shoulder.{s}", "trim", bevel=0.002)
        f.add(kit.sphere(f"cap.{s}", r=p.upper_arm * 0.44, at=tail + Vector((sx * 0.012, 0, 0.06)), segments=16, rings=8, scale=(1, 1, 0.8), dome=True),
              f"shoulder.{s}", "armor", bevel=0)
        f.add(kit.sphere(f"cap_gem.{s}", r=0.016, at=tail + Vector((sx * 0.012, 0, 0.06 + p.upper_arm * 0.35)), segments=10, rings=6), f"shoulder.{s}", "glow", bevel=0)
        c, L, rot, head, tail = f.along(f"upper_arm.{s}")
        f.add(kit.cyl(f"upper_arm.{s}", r=p.upper_arm * 0.21, length=L * 0.95, segments=12, at=c, rot=rot), f"upper_arm.{s}", "metal", bevel=0)
        f.add(f.plate(f"upper_arm_plate.{s}", size=(p.upper_arm * 0.52, p.upper_arm * 0.5, L * 0.55), at=c + rot @ Vector((0, 0, 0.04)) + Vector((sx * 0.012, 0, 0)),
                      rot=rot, inset=0.007, depth=0.003, panel=(sx, 0, 0), taper=0.85), f"upper_arm.{s}", "armor", bevel=0.004)
        f.add(kit.cyl_joint(f"elbow.{s}", r=p.upper_arm * 0.26, length=p.upper_arm * 0.55, segments=12, at=tail, rot=f.euler(0, 90, 0)),
              f"forearm.{s}", "metal", bevel=0)
        for i in range(4):
            a = math.radians(45 + 90 * i)
            f.add(kit.bolt(f"elbow_bolt_{i}.{s}", r=0.0065, at=tail + Vector((sx * p.upper_arm * 0.29, p.upper_arm * 0.18 * math.sin(a), p.upper_arm * 0.18 * math.cos(a))),
                           rot=f.euler(0, sx * 90, 0)), f"forearm.{s}", "trim", bevel=0)
        c, L, rot, head, tail = f.along(f"forearm.{s}")
        f.add(kit.cyl(f"forearm.{s}", r=p.forearm * 0.2, length=L * 0.9, segments=12, at=c, rot=rot), f"forearm.{s}", "metal", bevel=0)
        f.add(f.plate(f"forearm_guard.{s}", size=(p.forearm * 0.56, p.forearm * 0.5, L * 0.74), at=c + Vector((sx * 0.008, -0.006, 0.0)), rot=rot,
                      inset=0.008, depth=0.003, panel=(sx, -0.4, 0), taper=0.78), f"forearm.{s}", "armor", bevel=0.004)
        f.add(f.plate(f"forearm_edge.{s}", size=(p.forearm * 0.56, p.forearm * 0.5, 0.014), at=c + rot @ Vector((0, 0, L * 0.38)) + Vector((sx * 0.008, -0.006, 0)),
                      rot=rot, inset=0, taper=0.78), f"forearm.{s}", "trim", bevel=0.002)
        c, L, rot, head, tail = f.along(f"hand.{s}")
        f.add(f.plate(f"hand.{s}", size=(p.hand * 0.95, p.hand * 1.15, L * 1.15), at=c, rot=rot, inset=0.005, depth=0.002, panel=(sx, 0, 0)),
              f"hand.{s}", "metal", bevel=0.003)

    # ---- legs -------------------------------------------------------------------------------
    for s, sx in f.sides():
        c, L, rot, head, tail = f.along(f"thigh.{s}")
        f.add(kit.cyl(f"thigh.{s}", r=p.thigh * 0.25, length=L * 0.95, segments=12, at=c, rot=rot), f"thigh.{s}", "metal", bevel=0)
        f.add(f.plate(f"thigh_guard.{s}", size=(p.thigh * 0.6, p.thigh * 0.44, L * 0.66), at=c + Vector((sx * 0.014, -p.thigh * 0.12, 0.02)), rot=rot,
                      inset=0.012, depth=0.003, panel=(0, -1, 0), taper=0.9), f"thigh.{s}", "armor", bevel=0.005)
        f.add(f.plate(f"thigh_edge.{s}", size=(p.thigh * 0.6, p.thigh * 0.44, 0.016), at=c + rot @ Vector((0, 0, L * 0.34)) + Vector((sx * 0.014, -p.thigh * 0.12, 0)),
                      rot=rot, inset=0, taper=0.9), f"thigh.{s}", "trim", bevel=0.002)
        f.add(kit.cyl_joint(f"knee.{s}", r=p.thigh * 0.27, length=p.thigh * 0.52, segments=12, at=tail, rot=f.euler(0, 90, 0)), f"shin.{s}", "metal", bevel=0)
        f.add(f.plate(f"knee_guard.{s}", size=(p.thigh * 0.5, p.thigh * 0.2, p.thigh * 0.42), at=tail + Vector((0, -p.thigh * 0.3, 0)), inset=0.01, depth=0.003,
                      panel=(0, -1, 0)), f"shin.{s}", "armor", bevel=0.005)
        for i in range(4):
            a = math.radians(45 + 90 * i)
            f.add(kit.bolt(f"knee_bolt_{i}.{s}", r=0.0065, at=tail + Vector((sx * p.thigh * 0.3, p.thigh * 0.18 * math.sin(a), p.thigh * 0.18 * math.cos(a))),
                           rot=f.euler(0, sx * 90, 0)), f"shin.{s}", "trim", bevel=0)
        c, L, rot, head, tail = f.along(f"shin.{s}")
        f.add(kit.cyl(f"shin.{s}", r=p.shin * 0.22, length=L * 0.95, segments=12, at=c, rot=rot), f"shin.{s}", "metal", bevel=0)
        f.add(f.plate(f"shin_guard.{s}", size=(p.shin * 0.56, p.shin * 0.4, L * 0.78), at=c + Vector((0, -p.shin * 0.12, 0)), rot=rot,
                      inset=0.012, depth=0.003, panel=(0, -1, 0), taper=0.82), f"shin.{s}", "armor", bevel=0.005)
        c, L, rot, head, tail = f.along(f"foot.{s}")
        fl = p.foot * 1.65
        f.add(kit.plate(f"boot.{s}", size=(p.foot * 1.0, fl, p.foot * 0.66), at=Vector((head.x, head.y - fl * 0.3, p.foot * 0.33)), inset=0.008, depth=0.003,
                        panel=(0, 0, 1)), f"foot.{s}", "armor", bevel=0.005)
        f.add(kit.wedge(f"toe.{s}", size=(p.foot * 0.95, p.foot * 0.55, p.foot * 0.48), at=Vector((head.x, head.y - fl * 0.74, p.foot * 0.29)), rot=f.euler(90, 0, 0), front=0.5),
              f"foot.{s}", "metal", bevel=0.003)
        f.add(kit.plate(f"boot_edge.{s}", size=(p.foot * 1.0, fl * 0.3, 0.016), at=Vector((head.x, head.y + fl * 0.02, p.foot * 0.66))), f"foot.{s}", "trim", bevel=0.002)

    # ---- the long beacon staff with a large lantern ----------------------------------------
    c, L, rot, head, tail = f.along("hand.R")
    sl = h * 1.02
    sx0 = c.x - 0.02
    f.add(kit.cyl("staff", r=0.013, length=sl, segments=6, at=Vector((sx0, c.y, sl * 0.5 + 0.01))), "hand.R", "metal", bevel=0)
    f.add(kit.cyl("staff_grip", r=0.019, length=p.hand * 1.3, segments=8, at=Vector((sx0, c.y, c.z))), "hand.R", "accent", bevel=0.002)
    f.add(kit.cyl("staff_collar", r=0.027, length=0.034, segments=8, at=Vector((sx0, c.y, sl + 0.01))), "hand.R", "trim", bevel=0.003)
    f.add(kit.cyl("staff_ferrule", r=0.019, length=0.024, segments=6, at=Vector((sx0, c.y, 0.024))), "hand.R", "trim", bevel=0.002)
    for i, z in enumerate((sl * 0.58, sl * 0.68, sl * 0.78)):
        f.add(kit.ring(f"staff_ring_{i}", r=0.05, thickness=0.01, depth=0.01, segments=16, at=Vector((sx0, c.y, z))), "hand.R", "trim", bevel=0.002)
    lz = sl + 0.1
    f.add(kit.plate("lantern", size=(0.07, 0.07, 0.11), at=Vector((sx0, c.y, lz)), rot=f.euler(0, 0, 45), inset=0), "hand.R", "glow", bevel=0.008, segments=3)
    for i in range(4):
        a = math.radians(45 + 90 * i)
        f.add(kit.cyl(f"lantern_bar_{i}", r=0.005, length=0.135, segments=6, at=Vector((sx0 + 0.055 * math.sin(a), c.y - 0.055 * math.cos(a), lz))),
              "hand.R", "trim", bevel=0)
    f.add(kit.cyl("lantern_cap", r=0.062, length=0.016, segments=8, at=Vector((sx0, c.y, lz + 0.075)), rot=f.euler(0, 0, 22.5)), "hand.R", "trim", bevel=0.003)
    f.add(kit.cyl("lantern_base", r=0.062, length=0.016, segments=8, at=Vector((sx0, c.y, lz - 0.075)), rot=f.euler(0, 0, 22.5)), "hand.R", "trim", bevel=0.003)
    f.add(kit.cyl("lantern_spire", r=0.008, length=0.08, segments=6, r2=0.0, at=Vector((sx0, c.y, lz + 0.12))), "hand.R", "trim", bevel=0)

    # ---- the halo frame: two crossed gold rings behind the shoulders ----------------------
    c, L, rot, head, tail = f.along("halo")
    hc = Vector((0, head.y, head.z))
    hr2 = h * 0.2
    # the great ring stands behind the back in the figure's plane; the small ring crosses it
    # at a slant and stays behind the head; an emote may bob or spin the halo about its
    # front-to-back axis, never about the vertical one, which would sweep the rings
    # through the body
    f.add(kit.ring("halo_a", r=hr2, thickness=0.022, depth=0.018, segments=32, at=hc, rot=f.euler(90, 0, 0)), "halo", "trim", bevel=0.003)
    f.add(kit.ring("halo_b", r=hr2 * 0.45, thickness=0.016, depth=0.014, segments=24, at=hc, rot=f.euler(90, 0, 90)), "halo", "trim", bevel=0.002)
    f.add(kit.sphere("halo_core", r=0.036, at=hc, segments=14, rings=8), "halo", "glow", bevel=0)
    f.add(kit.cyl("halo_mount", r=0.014, length=h * 0.1, segments=8, at=Vector((0, head.y - h * 0.05, head.z)), rot=f.euler(90, 0, 0)), "chest", "metal", bevel=0)

    # ---- the orbit drones -------------------------------------------------------------------
    for i in range(1, 4):
        c, L, rot, head, tail = f.along(f"drone.{i}")
        dr = h * 0.03
        f.add(kit.sphere(f"drone_core_{i}", r=dr * 0.6, at=c, segments=10, rings=6), f"drone.{i}", "glow", bevel=0)
        f.add(kit.ring(f"drone_ring_{i}", r=dr, thickness=dr * 0.25, depth=dr * 0.3, segments=12, at=c, rot=f.euler(90, 0, 0)), f"drone.{i}", "metal", bevel=0.002)
        f.add(kit.ring(f"drone_ring2_{i}", r=dr * 0.95, thickness=dr * 0.25, depth=dr * 0.3, segments=12, at=c, rot=f.euler(0, 90, 0)), f"drone.{i}", "trim", bevel=0.002)

    return f.parts
