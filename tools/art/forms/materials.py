"""The five PBR materials every form is painted with.

The form pipeline (tools/art/forms/) builds each avatar stage in Blender and exports
it as a glTF. This file makes the materials those exports carry, and only those five,
so the site can swap them by name: `armor` (the white shell), `accent` (a neutral gray
the site tints to the learner's colour), `trim` (gold edging), `metal` (dark joints and
limbs) and `glow` (the emissive core). Strength above 1 on `glow` exports as
KHR_materials_emissive_strength.
"""
import bpy

# name: (base colour, metallic, roughness, emission colour or None, emission strength)
SPECS = {
    "armor": ((0.92, 0.92, 0.90), 0.0, 0.35, None, 0.0),
    "accent": ((0.82, 0.82, 0.82), 0.0, 0.45, None, 0.0),
    "trim": ((1.0, 0.78, 0.34), 1.0, 0.30, None, 0.0),
    "metal": ((0.36, 0.37, 0.40), 1.0, 0.50, None, 0.0),
    "glow": ((0.02, 0.02, 0.02), 0.0, 0.60, (0.55, 0.95, 1.0), 3.0),
}


def make_materials():
    out = {}
    for name, (base, metallic, rough, emit, strength) in SPECS.items():
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (*base, 1.0)
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = rough
        if emit:
            bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
            bsdf.inputs["Emission Strength"].default_value = strength
        out[name] = m
    return out
