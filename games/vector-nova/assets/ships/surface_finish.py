"""Shared original fleet finishes and portable glTF baking.

Geometry carries construction. These maps add quiet paint/metal response and
short-range cavity occlusion, never large painted-in shadows or random damage.
The editable procedural graphs are saved before export-only consolidation.
"""
import bpy
import math


def surface_finish(mat, kind, heat_start=2.4, heat_end=3.25):
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    base = tuple(bsdf.inputs['Base Color'].default_value)
    rough = bsdf.inputs['Roughness'].default_value
    coords = nodes.new('ShaderNodeNewGeometry')
    coords.label = 'Real metre-scale finish'
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 3.2
    noise.inputs['Detail'].default_value = 2
    links.new(coords.outputs['Position'], noise.inputs['Vector'])
    variation = nodes.new('ShaderNodeValToRGB')
    variation.color_ramp.elements[0].color = (.955, .962, .970, 1)
    variation.color_ramp.elements[1].color = (1, 1, 1, 1)
    links.new(noise.outputs['Fac'], variation.inputs[0])
    color = nodes.new('ShaderNodeMixRGB')
    color.blend_type = 'MULTIPLY'
    color.inputs[0].default_value = 1
    color.inputs[1].default_value = base
    links.new(variation.outputs['Color'], color.inputs[2])
    color_socket = color.outputs[0]
    if kind == 'metal':
        # Restrained oxidation belongs only to the hot end of the real petals.
        separate = nodes.new('ShaderNodeSeparateXYZ')
        links.new(coords.outputs['Position'], separate.inputs[0])
        heat = nodes.new('ShaderNodeMapRange')
        heat.inputs['From Min'].default_value = heat_start
        heat.inputs['From Max'].default_value = heat_end
        links.new(separate.outputs['Y'], heat.inputs['Value'])
        tint = nodes.new('ShaderNodeValToRGB')
        tint.label = 'Titanium heat treatment: straw / violet / blue-grey'
        ramp = tint.color_ramp
        ramp.elements.remove(ramp.elements[1])
        for index, (position, rgb) in enumerate([
            (0, base[:3]), (.34, (.42, .28, .10)),
            (.64, (.17, .11, .18)), (1, (.045, .125, .195)),
        ]):
            elem = ramp.elements[0] if index == 0 else ramp.elements.new(position)
            elem.position = position
            elem.color = (*rgb, 1)
        links.new(heat.outputs[0], tint.inputs[0])
        heat_color = nodes.new('ShaderNodeMixRGB')
        heat_color.blend_type = 'MIX'
        heat_color.inputs[0].default_value = .75
        links.new(color_socket, heat_color.inputs[1])
        links.new(tint.outputs[0], heat_color.inputs[2])
        color_socket = heat_color.outputs[0]
    links.new(color_socket, bsdf.inputs['Base Color'])
    scale = nodes.new('ShaderNodeVectorMath')
    scale.operation = 'MULTIPLY'
    scale.inputs[1].default_value = (1, 1, 34) if kind in ('metal', 'darkmetal') else (1, 1, 1)
    links.new(coords.outputs['Position'], scale.inputs[0])
    grain = nodes.new('ShaderNodeTexNoise')
    grain.inputs['Scale'].default_value = 92 if kind == 'pearl' else 140
    grain.inputs['Detail'].default_value = 2
    links.new(scale.outputs['Vector'], grain.inputs['Vector'])
    roughness = nodes.new('ShaderNodeMapRange')
    roughness.inputs['To Min'].default_value = max(.12, rough - .055)
    roughness.inputs['To Max'].default_value = min(.7, rough + .085)
    links.new(grain.outputs['Fac'], roughness.inputs['Value'])
    links.new(roughness.outputs[0], bsdf.inputs['Roughness'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .065
    bump.inputs['Distance'].default_value = .003 if kind == 'pearl' else .0015
    links.new(grain.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    ao = nodes.new('ShaderNodeAmbientOcclusion')
    ao.label = 'Only close joints: 18 cm radius'
    ao.inputs['Distance'].default_value = .18
    ao.samples = 8
    cavity = nodes.new('ShaderNodeMapRange')
    cavity.inputs['To Min'].default_value = .66
    cavity.inputs['To Max'].default_value = 1
    links.new(ao.outputs['AO'], cavity.inputs['Value'])
    roughness_socket = roughness.outputs[0]
    if kind == 'pearl':
        # Slightly drier ceramic at sheltered panel/vent interfaces. This uses
        # the actual nearby geometry, without painting dirt onto broad armor.
        sheltered = nodes.new('ShaderNodeMath')
        sheltered.operation = 'SUBTRACT'
        sheltered.inputs[0].default_value = 1
        links.new(ao.outputs['AO'], sheltered.inputs[1])
        amount = nodes.new('ShaderNodeMath')
        amount.operation = 'MULTIPLY'
        amount.inputs[1].default_value = .075
        links.new(sheltered.outputs[0], amount.inputs[0])
        response = nodes.new('ShaderNodeMath')
        response.operation = 'ADD'
        links.new(roughness_socket, response.inputs[0])
        links.new(amount.outputs[0], response.inputs[1])
        roughness_socket = response.outputs[0]
        links.new(roughness_socket, bsdf.inputs['Roughness'])
    return {'color': color_socket, 'roughness': roughness_socket, 'occlusion': cavity.outputs[0]}


def bake_finish(obj, material, channels, directory, size=1024):
    """Four original maps, including glTF occlusion, packed in the GLB."""
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(65), island_margin=.012)
    bpy.ops.object.mode_set(mode='OBJECT')
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    output = nodes.get('Material Output')
    emission = nodes.new('ShaderNodeEmission')
    baked = {}
    bpy.context.scene.cycles.samples = 8
    bpy.context.scene.render.bake.margin = 8
    for channel in ('color', 'roughness', 'normal', 'occlusion'):
        image = bpy.data.images.new(material.name + '_' + channel, width=size, height=size, alpha=False)
        image.colorspace_settings.name = 'sRGB' if channel == 'color' else 'Non-Color'
        target = nodes.new('ShaderNodeTexImage')
        target.image = image
        nodes.active = target
        if channel == 'normal':
            links.new(bsdf.outputs[0], output.inputs['Surface'])
            bpy.ops.object.bake(type='NORMAL')
        else:
            links.new(channels[channel], emission.inputs['Color'])
            links.new(emission.outputs[0], output.inputs['Surface'])
            bpy.ops.object.bake(type='EMIT')
        image.filepath_raw = str(directory / (material.name + '_' + channel + '.png'))
        image.file_format = 'PNG'
        image.save()
        baked[channel] = image
    for node in list(nodes):
        if node not in (bsdf, output):
            nodes.remove(node)
    links.new(bsdf.outputs[0], output.inputs['Surface'])
    for channel, image in baked.items():
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = image
        if channel == 'normal':
            normal = nodes.new('ShaderNodeNormalMap')
            links.new(texture.outputs['Color'], normal.inputs['Color'])
            links.new(normal.outputs[0], bsdf.inputs['Normal'])
        elif channel == 'occlusion':
            group = bpy.data.node_groups.get('glTF Material Output')
            if group is None:
                group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
                group.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
                group.nodes.new('NodeGroupInput')
                group.nodes.new('NodeGroupOutput')
            settings = nodes.new('ShaderNodeGroup')
            settings.node_tree = group
            links.new(texture.outputs['Color'], settings.inputs['Occlusion'])
        else:
            links.new(texture.outputs['Color'], bsdf.inputs['Base Color' if channel == 'color' else 'Roughness'])
