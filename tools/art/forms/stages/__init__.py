"""The five stage builders, by stage number.

A builder is `build(armature, props, mats) -> list of objects`, the parts of one stage
skinned to the shared armature (rig.py) and painted with the five materials
(materials.py). build.py looks a stage up here; a stage without a builder yet gets the
grey mannequin. The `Fig` helper in common.py is what the builders write with.
"""
from . import wayfinder

STAGES = {
    3: wayfinder.build,
}
