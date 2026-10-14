"""What every stage builder writes with: a figure under construction.

`Fig` wraps the armature, its proportions and the materials, and keeps the list of
parts a builder makes. Each `add` paints a part, bevels it (unless told not to) and
skins it rigidly to one bone, so a builder reads as a list of parts: which shape,
how big, where, on which bone, in which material. Positions are in the armature's
rest pose (metres, Z up, the figure facing -Y, feet at z = 0); `along` gives a bone's
frame so a limb part lies on it. Mirrored limbs are built twice, once per side, with
`sides()`: a part follows one bone, so the Mirror modifier is for centreline parts only.
"""
import math

from mathutils import Euler, Quaternion, Vector

import kit
import rig


class Fig:
    def __init__(self, armature, props, mats):
        self.arm = armature
        self.p = props
        self.mats = mats
        self.parts = []

    def add(self, obj, bone, mat, bevel=0.004, segments=2):
        obj.data.materials.append(self.mats[mat])
        if bevel:
            kit.add_bevel(obj, width=bevel, segments=segments)
        rig.skin_rigid(obj, self.arm, bone)
        self.parts.append(obj)
        return obj

    def along(self, bone):
        """(centre, length, rotation, head, tail) of a bone, local Z along it."""
        return kit.bone_frame(self.arm, bone)

    @staticmethod
    def sides():
        """("L", +1) and ("R", -1): the side's bone suffix and the sign of its x."""
        return (("L", 1.0), ("R", -1.0))

    @staticmethod
    def euler(x=0.0, y=0.0, z=0.0):
        """an XYZ Euler from degrees"""
        return Euler((math.radians(x), math.radians(y), math.radians(z)), "XYZ")

    @staticmethod
    def around(rot, axis, degrees):
        """`rot` followed by a turn about a world axis ("X", "Y" or "Z")"""
        q = Quaternion(Vector({"X": (1, 0, 0), "Y": (0, 1, 0), "Z": (0, 0, 1)}[axis]), math.radians(degrees))
        return q @ (rot if isinstance(rot, Quaternion) else rot.to_quaternion())
