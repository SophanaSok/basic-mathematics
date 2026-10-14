"""The texture bake: edge wear, grime and surface variation into two atlases per stage.

Phase 1 painted each form with five flat PBR materials. This step gives every stage two
1024-square textures the site reads as glTF maps, both baked in Cycles from procedural
shaders, so nothing is painted by hand and a rebuild reproduces them:

- `form-<n>-color.webp` (sRGB): the base colour with chipped edges (a Bevel-node edge
  mask broken up by noise) and grime in the crevices (ambient occlusion times noise).
  The `accent` region is baked at its neutral gray, so the site's multiply tint still
  gives the learner's hue.
- `form-<n>-surface.webp` (non-colour): occlusion in R, roughness in G and metallic in
  B, the packing glTF's occlusion and metallic-roughness textures share.

The bake happens after the parts are built and before the clips: every modifier but
the Armature is applied (the exporter has nothing left to apply, and the UVs match
what ships), all parts are Smart-UV-projected and packed together into one atlas per
stage, the five materials get their wear shaders, the two passes bake (both as EMIT
passes, the colour chain and then the packed surface channels through an Emission
shader: a diffuse colour pass is black on a metallic surface), and the materials are rebuilt
in the shape the glTF exporter reads: the colour texture into Base Color, the surface
texture through a Separate Color node into Roughness and Metallic, and its R channel
into a "glTF Material Output" group's Occlusion input. Renders after this show the
baked look, so the thumbnails match the viewer.

Cycles runs on the GPU unless `cpu` is set (render.py picks the device the same way).
"""
import math
import os

import bpy

import materials
import render

ATLAS = 1024
COLOR_QUALITY = 85
SURFACE_QUALITY = 85

# per slot: the colour the chipped edges show, how much the chips change roughness,
# the grime strength in the crevices, the mottle of roughness across the surface
WEAR = {
    "armor": {"edge": (0.62, 0.58, 0.54), "edge_rough": 0.30, "grime": 0.55, "mottle": 0.10},
    "accent": {"edge": (0.55, 0.55, 0.55), "edge_rough": 0.25, "grime": 0.22, "mottle": 0.10},
    "trim": {"edge": (1.0, 0.86, 0.50), "edge_rough": -0.18, "grime": 0.6, "mottle": 0.08},   # thin rings are all edge: keep their chips close to the gold
    "metal": {"edge": (0.70, 0.71, 0.74), "edge_rough": -0.20, "grime": 0.5, "mottle": 0.12},
    "glow": {"edge": (0.02, 0.02, 0.02), "edge_rough": 0.0, "grime": 0.0, "mottle": 0.0},
}
EDGE_RADIUS = 0.009
EDGE_GAIN = 7.0
AO_DISTANCE = 0.09
TONE = 0.05   # a slow mottle of the base colour's brightness, so the white never reads flat
GLTF_GROUP = "glTF Material Output"


def _select(objs, active=None):
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def apply_modifiers(objs):
    """Apply every modifier but the Armature, so the UVs and the bake see what ships.
    Boolean cutters are hidden in the viewport; they are shown for the apply."""
    cutters = [m.object for o in objs for m in o.modifiers if m.type == "BOOLEAN" and m.object]
    for c in cutters:
        c.hide_viewport = False
    bpy.context.view_layer.update()
    for o in objs:
        for m in list(o.modifiers):
            if m.type == "ARMATURE":
                continue
            with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
                bpy.ops.object.modifier_apply(modifier=m.name)
    for c in cutters:
        c.hide_viewport = True


def unwrap(objs):
    """One atlas for the stage: Smart UV Project every part, then pack all islands together."""
    _select(objs)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")


def _clear_tree(m):
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return nt, bsdf, out


def _color_sockets(mix):
    """the colour A and B inputs of a Mix node (its float and vector pairs share the names)"""
    a = [s for s in mix.inputs if s.name == "A" and s.type == "RGBA"][0]
    b = [s for s in mix.inputs if s.name == "B" and s.type == "RGBA"][0]
    return a, b


def _wear_nodes(nt, slot):
    """the edge-wear and grime factors for a slot: (wear socket, grime socket, ao socket)"""
    nodes, links = nt.nodes, nt.links
    bev = nodes.new("ShaderNodeBevel")
    bev.inputs["Radius"].default_value = EDGE_RADIUS
    bev.samples = 3
    geo = nodes.new("ShaderNodeNewGeometry")
    dot = nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    links.new(bev.outputs["Normal"], dot.inputs[0])
    links.new(geo.outputs["Normal"], dot.inputs[1])
    edge = nodes.new("ShaderNodeMath")
    edge.operation = "SUBTRACT"
    edge.inputs[0].default_value = 1.0
    links.new(dot.outputs["Value"], edge.inputs[1])
    gain = nodes.new("ShaderNodeMath")
    gain.operation = "MULTIPLY"
    gain.inputs[1].default_value = EDGE_GAIN
    gain.use_clamp = True
    links.new(edge.outputs[0], gain.inputs[0])
    # chips: the edge mask broken by a fine noise, so the wear comes in patches
    chip_noise = nodes.new("ShaderNodeTexNoise")
    chip_noise.inputs["Scale"].default_value = 70.0
    chip_noise.inputs["Detail"].default_value = 3.0
    chips = nodes.new("ShaderNodeMapRange")
    chips.interpolation_type = "SMOOTHSTEP"
    chips.inputs["From Min"].default_value = 0.32
    chips.inputs["From Max"].default_value = 0.62
    links.new(chip_noise.outputs["Fac"], chips.inputs["Value"])
    wear = nodes.new("ShaderNodeMath")
    wear.operation = "MULTIPLY"
    wear.use_clamp = True
    links.new(gain.outputs[0], wear.inputs[0])
    links.new(chips.outputs["Result"], wear.inputs[1])
    # grime: where occlusion is high, modulated by a coarser noise
    ao = nodes.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = AO_DISTANCE
    ao.samples = 8
    inv = nodes.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    links.new(ao.outputs["AO"], inv.inputs[1])
    grime_noise = nodes.new("ShaderNodeTexNoise")
    grime_noise.inputs["Scale"].default_value = 18.0
    grime_noise.inputs["Detail"].default_value = 2.0
    soft = nodes.new("ShaderNodeMapRange")
    soft.inputs["From Min"].default_value = 0.3
    soft.inputs["From Max"].default_value = 0.8
    links.new(grime_noise.outputs["Fac"], soft.inputs["Value"])
    grime = nodes.new("ShaderNodeMath")
    grime.operation = "MULTIPLY"
    grime.use_clamp = True
    links.new(inv.outputs[0], grime.inputs[0])
    links.new(soft.outputs["Result"], grime.inputs[1])
    strength = nodes.new("ShaderNodeMath")
    strength.operation = "MULTIPLY"
    strength.inputs[1].default_value = WEAR[slot]["grime"]
    strength.use_clamp = True
    links.new(grime.outputs[0], strength.inputs[0])
    return wear.outputs[0], strength.outputs[0], ao.outputs["AO"]


def wear_trees(mats):
    """Rebuild each material as its procedural wear shader for the colour bake, and
    remember the surface channels (occlusion, roughness, metallic) for the second pass."""
    channels = {}
    for slot, m in mats.items():
        base, metallic, rough, emit, strength = materials.SPECS[slot]
        w = WEAR[slot]
        nt, bsdf, out = _clear_tree(m)
        nodes, links = nt.nodes, nt.links
        wear, grime, ao = _wear_nodes(nt, slot)
        # colour: base chipped to the edge colour, then darkened by the grime
        chip = nodes.new("ShaderNodeMix")
        chip.data_type = "RGBA"
        chip.blend_type = "MIX"
        a, b = _color_sockets(chip)
        a.default_value = (*base, 1.0)
        b.default_value = (*w["edge"], 1.0)
        links.new(wear, chip.inputs["Factor"])
        dark = nodes.new("ShaderNodeMix")
        dark.data_type = "RGBA"
        dark.blend_type = "MULTIPLY"
        a2, b2 = _color_sockets(dark)
        links.new(chip.outputs["Result"], a2)
        b2.default_value = (0.42, 0.40, 0.37, 1.0)
        links.new(grime, dark.inputs["Factor"])
        # a slow mottle of brightness over the whole surface
        tone_noise = nodes.new("ShaderNodeTexNoise")
        tone_noise.inputs["Scale"].default_value = 6.0
        tone_noise.inputs["Detail"].default_value = 1.0
        tone = nodes.new("ShaderNodeMapRange")
        tone.inputs["To Min"].default_value = 1.0 - TONE
        tone.inputs["To Max"].default_value = 1.0
        links.new(tone_noise.outputs["Fac"], tone.inputs["Value"])
        toned = nodes.new("ShaderNodeMix")
        toned.data_type = "RGBA"
        toned.blend_type = "MULTIPLY"
        toned.inputs["Factor"].default_value = 1.0
        a3, b3 = _color_sockets(toned)
        links.new(dark.outputs["Result"], a3)
        tone_rgb = nodes.new("ShaderNodeCombineColor")
        for i in range(3):
            links.new(tone.outputs["Result"], tone_rgb.inputs[i])
        links.new(tone_rgb.outputs[0], b3)
        # the colour chain goes out through an Emission shader: an EMIT bake reads it
        # exactly, where a diffuse colour pass is black wherever the material is metallic
        em = nodes.new("ShaderNodeEmission")
        links.new(toned.outputs["Result"], em.inputs["Color"])
        links.new(em.outputs[0], out.inputs["Surface"])
        # roughness: the base, mottled by noise, changed on the chips and under grime
        mottle = nodes.new("ShaderNodeTexNoise")
        mottle.inputs["Scale"].default_value = 30.0
        centred = nodes.new("ShaderNodeMapRange")
        centred.inputs["From Min"].default_value = 0.0
        centred.inputs["From Max"].default_value = 1.0
        centred.inputs["To Min"].default_value = rough - w["mottle"]
        centred.inputs["To Max"].default_value = rough + w["mottle"]
        links.new(mottle.outputs["Fac"], centred.inputs["Value"])
        chip_r = nodes.new("ShaderNodeMath")
        chip_r.operation = "MULTIPLY_ADD"
        links.new(wear, chip_r.inputs[0])
        chip_r.inputs[1].default_value = w["edge_rough"]
        links.new(centred.outputs["Result"], chip_r.inputs[2])
        grime_r = nodes.new("ShaderNodeMath")
        grime_r.operation = "MULTIPLY_ADD"
        grime_r.use_clamp = True
        links.new(grime, grime_r.inputs[0])
        grime_r.inputs[1].default_value = 0.25
        links.new(chip_r.outputs[0], grime_r.inputs[2])
        channels[slot] = (ao, grime_r.outputs[0], metallic, nt, out)
    return channels


def _bake_target(mats, image):
    for m in mats.values():
        tex = m.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = image
        m.node_tree.nodes.active = tex


def _save(image, path, quality):
    image.filepath_raw = path
    image.file_format = "WEBP"
    image.save(quality=quality)


def _bake_setup(scene, cpu, samples):
    render._set_engine(scene, "cycles", cpu)
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 4
    scene.render.bake.use_clear = True
    scene.render.bake.use_selected_to_active = False


def bake(objs, mats, stage, out_dir, cpu=False):
    """Apply, unwrap, bake both atlases, save them as WebP beside the export and rebuild
    the materials around them. Returns {"color": path, "surface": path}."""
    os.makedirs(out_dir, exist_ok=True)
    apply_modifiers(objs)
    unwrap(objs)
    scene = bpy.context.scene
    color = bpy.data.images.new(f"form-{stage}-color", ATLAS, ATLAS)
    color.colorspace_settings.name = "sRGB"
    surface = bpy.data.images.new(f"form-{stage}-surface", ATLAS, ATLAS, is_data=True)

    channels = wear_trees(mats)
    _bake_target(mats, color)
    _select(objs)
    _bake_setup(scene, cpu, 6 if cpu else 12)
    bpy.ops.object.bake(type="EMIT")
    color_path = os.path.join(out_dir, f"form-{stage}-color.webp")
    _save(color, color_path, COLOR_QUALITY)

    # the surface pass: an emission of (occlusion, roughness, metallic) baked as-is
    for slot, (ao, rough, metallic, nt, out) in channels.items():
        comb = nt.nodes.new("ShaderNodeCombineColor")
        nt.links.new(ao, comb.inputs[0])
        nt.links.new(rough, comb.inputs[1])
        comb.inputs[2].default_value = metallic
        em = nt.nodes.new("ShaderNodeEmission")
        nt.links.new(comb.outputs[0], em.inputs["Color"])
        nt.links.new(em.outputs[0], out.inputs["Surface"])
    _bake_target(mats, surface)
    _select(objs)
    scene.cycles.samples = 4 if cpu else 8
    bpy.ops.object.bake(type="EMIT")
    surface_path = os.path.join(out_dir, f"form-{stage}-surface.webp")
    _save(surface, surface_path, SURFACE_QUALITY)

    baked_materials(mats, color, surface)
    return {"color": color_path, "surface": surface_path}


def _gltf_group():
    ng = bpy.data.node_groups.get(GLTF_GROUP)
    if ng is None:
        ng = bpy.data.node_groups.new(GLTF_GROUP, "ShaderNodeTree")
        ng.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
        ng.nodes.new("NodeGroupInput")
    return ng


def baked_materials(mats, color, surface):
    """The five materials in the shape the glTF exporter reads: the colour texture into
    Base Color, the surface texture into Roughness (G), Metallic (B) and the glTF
    group's Occlusion (R); `glow` keeps its emission as factors."""
    group = _gltf_group()
    for slot, m in mats.items():
        base, metallic, rough, emit, strength = materials.SPECS[slot]
        nt, bsdf, out = _clear_tree(m)
        nodes, links = nt.nodes, nt.links
        ctex = nodes.new("ShaderNodeTexImage")
        ctex.image = color
        links.new(ctex.outputs["Color"], bsdf.inputs["Base Color"])
        stex = nodes.new("ShaderNodeTexImage")
        stex.image = surface
        sep = nodes.new("ShaderNodeSeparateColor")
        links.new(stex.outputs["Color"], sep.inputs["Color"])
        links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
        g = nodes.new("ShaderNodeGroup")
        g.node_tree = group
        links.new(sep.outputs["Red"], g.inputs["Occlusion"])
        if emit:
            bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
            bsdf.inputs["Emission Strength"].default_value = strength
        nodes.active = ctex
