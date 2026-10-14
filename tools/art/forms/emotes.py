"""The five clips every form carries: idle, wave, bow, flex, spin.

Keyed in Python on the shared rig (rig.py) by bone name, at 30 frames a second, one
Blender action each, pushed to its own NLA track so the exporter (export.py) writes one
glTF animation per action under the action's name. A bone a stage lacks (the drones,
the halo, Pip's limbs) is skipped, so the same script serves every stage; Pip, with no
limbs, does the emotes as body motions on `hips`, `chest` and `head`.

Every value is keyed on every frame it moves (no reliance on Blender's interpolation,
which the exporter samples anyway). The idle is a loop: every value is a sine of the
frame, so frame 90 equals frame 0 and the velocity is continuous; the orbit pivot and the halo go
through exactly one turn or one bob per loop. Every other clip starts and ends on the
rest pose, which is idle frame 0, so the viewer cross-fades back to the idle without a
pop, and the rest pose is what the viewer shows under reduced motion.

Pose-bone rotations are Euler XYZ in the bone's own axes: Y runs along the bone, so
for an upright bone (hips, spine, chest, neck, head, orbit, halo) +X pitches the top
forward, Y twists, and Z leans it sideways; for the arms, which hang at a slant, Z
swings the limb out from the body and X swings it forward and back. The exporter
samples every frame to quaternions, so an Euler key never takes the long way round as
long as no step between keys exceeds 180 degrees (the spin keys every quarter turn).
"""
import math

import bpy
from mathutils import Euler

FPS = 30
CLIPS = {"idle": 90, "wave": 60, "bow": 75, "flex": 60, "spin": 45}

TAU = math.pi * 2


def _reset(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0.0, 0.0, 0.0)
        pb.location = (0.0, 0.0, 0.0)
        pb.scale = (1.0, 1.0, 1.0)


class Keys:
    """keyframes on one armature: rot in degrees, loc in meters, in the bone's own axes;
    a bone the armature lacks is ignored"""

    def __init__(self, arm):
        self.arm = arm
        self.touched = set()

    def has(self, bone):
        return bone in self.arm.pose.bones

    def rot(self, bone, frame, x=0.0, y=0.0, z=0.0):
        pb = self.arm.pose.bones.get(bone)
        if pb is None:
            return
        pb.rotation_euler = Euler((math.radians(x), math.radians(y), math.radians(z)), "XYZ")
        pb.keyframe_insert("rotation_euler", frame=frame)
        self.touched.add(bone)

    def loc(self, bone, frame, x=0.0, y=0.0, z=0.0):
        pb = self.arm.pose.bones.get(bone)
        if pb is None:
            return
        pb.location = (x, y, z)
        pb.keyframe_insert("location", frame=frame)
        self.touched.add(bone)

    def scale(self, bone, frame, s=1.0):
        pb = self.arm.pose.bones.get(bone)
        if pb is None:
            return
        pb.scale = (s, s, s)
        pb.keyframe_insert("scale", frame=frame)
        self.touched.add(bone)

    def rest(self, frame, bones=None):
        """every touched bone (or the given ones) back at rest on this frame"""
        for b in sorted(bones or self.touched):
            pb = self.arm.pose.bones.get(b)
            if pb is None:
                continue
            pb.rotation_euler = (0.0, 0.0, 0.0)
            pb.location = (0.0, 0.0, 0.0)
            pb.scale = (1.0, 1.0, 1.0)
            pb.keyframe_insert("rotation_euler", frame=frame)
            pb.keyframe_insert("location", frame=frame)
            pb.keyframe_insert("scale", frame=frame)


def _ease(t):
    """smoothstep: 0 at 0, 1 at 1, flat at both ends"""
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def _ramp(k, bone, frames, a, b, rot=None, loc=None):
    """a value eased from a to b over the frame list, keyed each frame, for one bone:
    rot is the axis index for a rotation in degrees, loc for a location in meters"""
    n = len(frames) - 1
    for i, f in enumerate(frames):
        v = a + (b - a) * _ease(i / n if n else 1.0)
        if rot is not None:
            args = [0.0, 0.0, 0.0]
            args[rot] = v
            k.rot(bone, f, *args)
        else:
            args = [0.0, 0.0, 0.0]
            args[loc] = v
            k.loc(bone, f, *args)


# ------------------------------------------------------------------ the clips ----

def idle(k, h, pip):
    n = CLIPS["idle"]
    for f in range(n + 1):
        ph = TAU * f / n
        s1, s2 = math.sin(ph), math.sin(2 * ph)
        if pip:
            k.loc("hips", f, y=h * 0.03 * s1)            # hover bob (local Y is up)
            k.rot("hips", f, y=6 * math.sin(ph + 0.4), x=1.5 * s2)
            k.rot("chest", f, z=3 * s2)                   # the vanes flutter
            k.rot("head", f, z=2 * s1)                    # the eye drifts
        else:
            k.rot("chest", f, x=1.5 * s1)                 # breath
            k.loc("hips", f, y=-0.004 * (1 - math.cos(ph)) / 2, x=0.0)
            k.rot("hips", f, z=1.0 * s1)                  # weight shift
            k.rot("head", f, y=3 * math.sin(ph + 1.0), x=1.0 * s2)
            k.rot("upper_arm.R", f, z=-1.5 * s1)          # the staff sways
            k.rot("upper_arm.L", f, z=1.5 * math.sin(ph + 0.5))
        k.rot("orbit", f, y=360.0 * f / n)                # the drones go round once
        k.loc("halo", f, y=h * 0.012 * s1)                # the halo bobs
        k.rot("halo", f, y=10 * s1)


def wave(k, h, pip):
    n = CLIPS["wave"]
    if pip:
        _ramp(k, "hips", range(0, 13), 0, 15, rot=2)
        for f in range(12, 49):
            k.rot("hips", f, z=15)
            k.rot("chest", f, z=18 * math.sin(TAU * (f - 12) / 12))   # the vanes flick thrice
        _ramp(k, "hips", range(48, n + 1), 15, 0, rot=2)
        _ramp(k, "chest", range(48, n + 1), 0, 0, rot=2)
        return
    _ramp(k, "upper_arm.L", range(0, 13), 0, -125, rot=2)
    _ramp(k, "head", range(0, 13), 0, -8, rot=2)
    for f in range(12, 49):
        k.rot("upper_arm.L", f, z=-125)
        k.rot("forearm.L", f, z=-25 * math.sin(TAU * (f - 12) / 12))   # three wags
        k.rot("head", f, z=-8)
    _ramp(k, "upper_arm.L", range(48, n + 1), -125, 0, rot=2)
    _ramp(k, "forearm.L", range(48, n + 1), 0, 0, rot=2)
    _ramp(k, "head", range(48, n + 1), -8, 0, rot=2)


def bow(k, h, pip):
    n = CLIPS["bow"]
    if pip:
        _ramp(k, "hips", range(0, 19), 0, 30, rot=0)
        for f in range(18, 39):
            k.rot("hips", f, x=30)
        _ramp(k, "hips", range(38, n + 1), 30, 0, rot=0)
        return
    _ramp(k, "spine", range(0, 19), 0, 14, rot=0)
    _ramp(k, "chest", range(0, 19), 0, 20, rot=0)
    for f in range(18, 39):
        k.rot("spine", f, x=14)
        k.rot("chest", f, x=20)
    _ramp(k, "head", range(22, 31), 0, 10, rot=0)
    for f in range(30, 39):
        k.rot("head", f, x=10)
    _ramp(k, "spine", range(38, 64), 14, 0, rot=0)
    _ramp(k, "chest", range(38, 64), 20, 0, rot=0)
    _ramp(k, "head", range(38, 64), 10, 0, rot=0)
    k.rest(n)


def flex(k, h, pip):
    n = CLIPS["flex"]
    if pip:
        _ramp(k, "hips", range(0, 13), 0, 0, rot=0)
        for f in range(0, n + 1):
            k.scale("hips", f, 1 + 0.08 * math.sin(math.pi * min(1.0, f / 40)) if f <= 40 else 1.0)
            k.loc("chest", f, y=h * 0.04 * math.sin(math.pi * min(1.0, f / 40)) if f <= 40 else 0.0)   # the bead rises
        return
    # the free arm flexes hard; the staff arm lifts the beacon high instead of curling
    # it behind the head
    arms = (("L", 1, -95, -110), ("R", -1, -60, -35))
    for side, sx, up, curl in arms:
        _ramp(k, f"upper_arm.{side}", range(0, 15), 0, sx * up, rot=2)
        _ramp(k, f"forearm.{side}", range(0, 15), 0, sx * curl, rot=2)
    _ramp(k, "chest", range(0, 15), 0, -6, rot=0)
    for f in range(14, 45):
        for side, sx, up, curl in arms:
            k.rot(f"upper_arm.{side}", f, z=sx * up, x=-20)
            k.rot(f"forearm.{side}", f, z=sx * curl)
        k.rot("chest", f, x=-6)
        k.scale("chest", f, 1.04)
    # a small hop as the pose lands
    for f in range(14, 27):
        k.loc("root", f, z=0.03 * math.sin(math.pi * (f - 14) / 12))
    for side, sx, up, curl in arms:
        _ramp(k, f"upper_arm.{side}", range(44, n + 1), sx * up, 0, rot=2)
        _ramp(k, f"forearm.{side}", range(44, n + 1), sx * curl, 0, rot=2)
    _ramp(k, "chest", range(44, n + 1), -6, 0, rot=0)
    k.rest(n)


def spin(k, h, pip):
    n = CLIPS["spin"]
    # a full turn about the vertical, keyed every quarter so the sampler never shortcuts
    for q, f in enumerate((0, 11, 22, 34, 45)):
        k.rot("root" if not pip else "hips", f, y=90.0 * q)
    if pip:
        for f in range(0, n + 1):
            k.rot("chest", f, z=8 * math.sin(TAU * f / n))
        return
    for side, sx in (("L", 1), ("R", -1)):
        _ramp(k, f"upper_arm.{side}", range(0, 9), 0, sx * -30, rot=2)
        for f in range(8, 37):
            k.rot(f"upper_arm.{side}", f, z=sx * -30)
        _ramp(k, f"upper_arm.{side}", range(36, n + 1), sx * -30, 0, rot=2)


BUILDERS = {"idle": idle, "wave": wave, "bow": bow, "flex": flex, "spin": spin}


def make_clips(arm, stage, props):
    """one action per clip on the armature, each on its own (muted) NLA track; returns
    the clip names in order"""
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.render.fps_base = 1.0
    pip = stage == 1
    ad = arm.animation_data or arm.animation_data_create()
    bpy.context.view_layer.objects.active = arm
    names = []
    for name, n in CLIPS.items():
        _reset(arm)
        act = bpy.data.actions.new(name)
        act.use_frame_range = True
        act.frame_start = 0
        act.frame_end = n
        ad.action = act
        slot = None
        if hasattr(act, "slots"):                    # slotted actions (Blender 4.4 on)
            slot = act.slots.new(id_type="OBJECT", name=arm.name)
            ad.action_slot = slot
        k = Keys(arm)
        k.rest(0)                                    # every clip leaves from the rest pose
        BUILDERS[name](k, props.height, pip)
        if name != "idle":
            k.rest(n)                                # and comes back to it
        ad.action = None
        track = ad.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 0, act)
        if slot is not None and hasattr(strip, "action_slot"):
            strip.action_slot = slot
        track.mute = True                            # the exporter bakes each action alone
        names.append(name)
    _reset(arm)
    scene.frame_set(0)
    return names
