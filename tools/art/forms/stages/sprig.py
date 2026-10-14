"""Stage 2, the Sprig: the core up on a slim runner frame.

Pip's core becomes a chest unit (its eye now the chest light, its band the sash) on a
dark endoskeleton of thin limbs with bare joints: flat shin and forearm plates, boots,
a small head with a visor slit and a two-fin crest stub, no skirt (0.8 tall). The
stance is wide and the frame shows: this is the figure before its armour. Every part
follows one bone of the shared rig (rig.py), so the emotes move it.
"""
from mathutils import Vector

import kit
from stages.common import Fig


def build(armature, props, mats):
    f = Fig(armature, props, mats)
    p = props
    h = p.height

    # ---- torso: the core as a chest unit on a thin frame ----------------------------
    c, L, rot, head, tail = f.along("chest")
    cr = L * 0.5
    f.add(kit.sphere("core", r=cr, at=c + Vector((0, -cr * 0.1, 0)), segments=14, rings=9, scale=(1.15, 0.95, 1.1)), "chest", "armor", bevel=0)
    f.add(kit.cyl("band", r=cr * 1.16, length=cr * 0.24, segments=14, at=c + Vector((0, -cr * 0.1, -cr * 0.15)), rot=None), "chest", "accent", bevel=0.003)
    f.add(kit.cyl("chest_light_bezel", r=cr * 0.3, length=cr * 0.3, segments=14, at=c + Vector((0, -cr * 0.95, cr * 0.2)), rot=f.euler(90, 0, 0)),
          "chest", "metal", bevel=0.003)
    f.add(kit.sphere("chest_light", r=cr * 0.2, at=c + Vector((0, -cr * 1.02, cr * 0.2)), segments=12, rings=6), "chest", "glow", bevel=0)
    f.add(kit.plate("backpack", size=(cr * 1.3, cr * 0.5, L * 0.8), at=c + Vector((0, cr * 0.95, 0)), rot=rot, inset=0.006, depth=0.003, panel=(0, 1, 0)),
          "chest", "metal", bevel=0.004)
    f.add(kit.cyl("collar", r=p.neck * 2.0, length=0.014, segments=12, at=tail + Vector((0, 0, 0.004))), "chest", "trim", bevel=0.002)

    c, L, rot, head, tail = f.along("spine")
    f.add(kit.cyl("spine", r=p.hip_w * 0.45, length=L * 1.1, segments=10, at=c, rot=rot), "spine", "metal", bevel=0)
    c, L, rot, head, tail = f.along("hips")
    f.add(kit.plate("pelvis", size=(p.hip_w * 2.3, p.hip_w * 1.3, L * 0.9), at=c, rot=rot, inset=0.006, depth=0.003, panel=(0, -1, 0)), "hips", "metal", bevel=0.004)
    f.add(kit.plate("pelvis_plate", size=(p.hip_w * 1.2, 0.012, L * 0.7), at=c + Vector((0, -p.hip_w * 0.66, -L * 0.1)), rot=rot, inset=0.005, depth=0.002, panel=(0, -1, 0)),
          "hips", "armor", bevel=0.003)

    # ---- head: small, with a visor and a crest stub ----------------------------------
    c, L, rot, head, tail = f.along("head")
    hr = p.head * 0.4
    f.add(kit.cyl("neck", r=p.neck * 1.4, length=p.neck * 1.8, segments=10, at=head - Vector((0, 0, p.neck * 0.5))), "neck", "metal", bevel=0)
    f.add(kit.plate("head", size=(hr * 1.6, hr * 1.5, L * 0.7), at=c, inset=0.006, depth=0.003, panel=(0, 0, 1)), "head", "armor", bevel=0.005)
    f.add(kit.plate("jaw", size=(hr * 1.3, hr * 1.2, L * 0.3), at=c - Vector((0, 0, L * 0.42)), inset=0), "head", "metal", bevel=0.004)
    f.add(kit.plate("visor_slit", size=(hr * 1.25, 0.01, 0.016), at=c + Vector((0, -hr * 0.77, L * 0.05)), inset=0), "head", "glow", bevel=0)
    for s, sx in f.sides():
        fin = kit.wedge(f"crest.{s}", size=(0.01, 0.035, hr * 0.8), at=c + Vector((sx * 0.01, -hr * 0.3, L * 0.5)), rot=f.euler(-25, sx * 20, 0), front=0.3)
        f.add(fin, "head", "trim", bevel=0.002)

    # ---- limbs: thin frame, bare joints, a plate on each lower limb -----------------
    for s, sx in f.sides():
        c, L, rot, head, tail = f.along(f"shoulder.{s}")
        f.add(kit.cyl(f"shoulder.{s}", r=p.upper_arm * 0.16, length=L * 0.9, segments=8, at=c, rot=rot), f"shoulder.{s}", "metal", bevel=0)
        f.add(kit.sphere(f"shoulder_ball.{s}", r=p.upper_arm * 0.24, at=tail, segments=12, rings=6), f"upper_arm.{s}", "metal", bevel=0)
        c, L, rot, head, tail = f.along(f"upper_arm.{s}")
        f.add(kit.cyl(f"upper_arm.{s}", r=p.upper_arm * 0.14, length=L * 0.9, segments=8, at=c, rot=rot), f"upper_arm.{s}", "metal", bevel=0)
        f.add(kit.sphere(f"elbow.{s}", r=p.upper_arm * 0.2, at=tail, segments=12, rings=6), f"forearm.{s}", "metal", bevel=0)
        c, L, rot, head, tail = f.along(f"forearm.{s}")
        f.add(kit.cyl(f"forearm.{s}", r=p.forearm * 0.14, length=L * 0.9, segments=8, at=c, rot=rot), f"forearm.{s}", "metal", bevel=0)
        f.add(kit.plate(f"forearm_plate.{s}", size=(p.forearm * 0.38, p.forearm * 0.32, L * 0.6), at=c + rot @ Vector((sx * 0.01, -0.006, 0)), rot=rot,
                        inset=0.005, depth=0.002, panel=(sx, -0.5, 0), taper=0.85), f"forearm.{s}", "armor", bevel=0.003)
        c, L, rot, head, tail = f.along(f"hand.{s}")
        f.add(kit.plate(f"hand.{s}", size=(p.hand * 0.8, p.hand * 1.0, L * 1.1), at=c, rot=rot, inset=0.003, depth=0.002, panel=(sx, 0, 0)),
              f"hand.{s}", "metal", bevel=0.003)

        c, L, rot, head, tail = f.along(f"thigh.{s}")
        f.add(kit.sphere(f"hip_ball.{s}", r=p.thigh * 0.22, at=head, segments=12, rings=6), f"thigh.{s}", "metal", bevel=0)
        f.add(kit.cyl(f"thigh.{s}", r=p.thigh * 0.17, length=L * 0.9, segments=8, at=c, rot=rot), f"thigh.{s}", "metal", bevel=0)
        f.add(kit.cyl_joint(f"knee.{s}", r=p.thigh * 0.22, length=p.thigh * 0.4, segments=10, at=tail, rot=f.euler(0, 90, 0)), f"shin.{s}", "metal", bevel=0)
        c, L, rot, head, tail = f.along(f"shin.{s}")
        f.add(kit.cyl(f"shin.{s}", r=p.shin * 0.16, length=L * 0.9, segments=8, at=c, rot=rot), f"shin.{s}", "metal", bevel=0)
        f.add(kit.plate(f"shin_plate.{s}", size=(p.shin * 0.42, p.shin * 0.3, L * 0.72), at=c + Vector((0, -p.shin * 0.1, 0)), rot=rot,
                        inset=0.006, depth=0.003, panel=(0, -1, 0), taper=1.2), f"shin.{s}", "armor", bevel=0.003)
        c, L, rot, head, tail = f.along(f"foot.{s}")
        fl = p.foot * 1.5
        f.add(kit.plate(f"boot.{s}", size=(p.foot * 0.8, fl, p.foot * 0.55), at=Vector((head.x, head.y - fl * 0.3, p.foot * 0.275)), inset=0.005, depth=0.002,
                        panel=(0, 0, 1)), f"foot.{s}", "armor", bevel=0.004)
        f.add(kit.wedge(f"toe.{s}", size=(p.foot * 0.75, p.foot * 0.5, p.foot * 0.4), at=Vector((head.x, head.y - fl * 0.72, p.foot * 0.2)), rot=f.euler(90, 0, 0), front=0.5),
              f"foot.{s}", "metal", bevel=0.003)

    return f.parts
