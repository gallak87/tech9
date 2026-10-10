"""Metre-scale, geometry-aware fleet finish; original authored masks, no photos.

Broad panels stay quiet. Abrasion follows real edges, dirt follows close joints,
and machining runs along the craft axis. Editable graphs survive in the blend.
"""
import bpy
import math
from mathutils import Vector


def surface_finish(mat, kind, heat_start=2.4, heat_end=3.25, scuffs=(), scuff_scale=1):
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf=nodes.get('Principled BSDF')
    base=tuple(bsdf.inputs['Base Color'].default_value)
    metal=kind in ('metal','darkmetal')
    ceramic=kind=='pearl'
    rough=.33 if ceramic else .46 if kind=='carbon' else .29 if kind=='metal' else .35
    if ceramic:
        bsdf.inputs['Coat Weight'].default_value=.12
        bsdf.inputs['Coat Roughness'].default_value=.27
    def node(t,label=''):
        n=nodes.new(t);n.label=label;return n
    def mathnode(op,a,b):
        n=node('ShaderNodeMath');n.operation=op
        for i,v in enumerate((a,b)):
            if isinstance(v,(int,float)):n.inputs[i].default_value=v
            else:links.new(v,n.inputs[i])
        return n.outputs[0]
    def ramp(socket,lo,hi,clo,chi):
        n=node('ShaderNodeValToRGB')
        n.color_ramp.elements[0].position=lo;n.color_ramp.elements[0].color=(*clo,1)
        n.color_ramp.elements[1].position=hi;n.color_ramp.elements[1].color=(*chi,1)
        links.new(socket,n.inputs[0]);return n.outputs[0]
    def noise(scale,detail=2):
        n=node('ShaderNodeTexNoise');n.inputs['Scale'].default_value=1;n.inputs['Detail'].default_value=detail
        v=node('ShaderNodeVectorMath');v.operation='MULTIPLY';v.inputs[1].default_value=scale
        links.new(coords.outputs['Position'],v.inputs[0]);links.new(v.outputs[0],n.inputs['Vector'])
        return n.outputs['Fac']
    def mix(a,b,f):
        n=node('ShaderNodeMixRGB');n.blend_type='MIX'
        for i,v in ((0,f),(1,a),(2,b)):
            if isinstance(v,(int,float)):n.inputs[i].default_value=v
            elif isinstance(v,tuple):n.inputs[i].default_value=v
            else:links.new(v,n.inputs[i])
        return n.outputs[0]
    coords=node('ShaderNodeNewGeometry','Actual component geometry in metres')
    ao=node('ShaderNodeAmbientOcclusion','Dry dirt only in close service joints')
    ao.inputs['Distance'].default_value=.065;ao.samples=12
    dirt=mathnode('MULTIPLY',mathnode('SUBTRACT',1,ao.outputs['AO']),.38)
    # A bevel-normal difference locates actual exposed edges, not UV borders.
    bevel=node('ShaderNodeBevel','Submillimetre finish radius / physical edge mask')
    bevel.inputs['Radius'].default_value=.007 if ceramic else .003;bevel.samples=4
    dot=node('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT'
    links.new(coords.outputs['Normal'],dot.inputs[0]);links.new(bevel.outputs['Normal'],dot.inputs[1])
    edge=mathnode('MINIMUM',mathnode('MULTIPLY',mathnode('SUBTRACT',1,dot.outputs['Value']),28),1)
    curvature=ramp(coords.outputs['Pointiness'],.52,.62,(0,0,0),(1,1,1))
    # Curvature is deliberately not used as an all-over damage mask.
    flecks=ramp(noise((76,76,76)),.48,.69,(0,0,0),(1,1,1))
    wear=mathnode('MULTIPLY',edge,flecks)
    # Sparse axial tool marks are elongated in Blender Y (= game -Z).
    scratches=ramp(noise((55,2.5,85)),.64,.74,(0,0,0),(1,1,1))
    scratches=mathnode('MULTIPLY',scratches,.55 if metal else .6)
    # Keep scratches concentrated around exposed returns and access joints.
    access=mathnode('MINIMUM',mathnode('ADD',mathnode('MULTIPLY',edge,2),mathnode('MULTIPLY',dirt,3)),1)
    scratches=mathnode('MULTIPLY',scratches,mathnode('ADD',.12 if metal else 0,mathnode('MULTIPLY',access,.88 if metal else 1)))
    grain=noise((130,8,170) if metal else (170,170,170),1)
    broad=noise((2.8,1.1,3.8),1)
    tint=ramp(broad,0,1,tuple(c*.965 for c in base[:3]),tuple(c*1.025 for c in base[:3]))
    color=mix(tint,(base[0]*.52,base[1]*.49,base[2]*.45,1),dirt)
    color=mix(color,(.30,.32,.33,1) if ceramic else (.16,.18,.19,1),mathnode('MULTIPLY',wear,.6 if ceramic else .32))
    color=mix(color,(base[0]*.40,base[1]*.42,base[2]*.44,1),scratches)
    if kind=='metal':
        separate=node('ShaderNodeSeparateXYZ');links.new(coords.outputs['Position'],separate.inputs[0])
        heat=node('ShaderNodeMapRange','Oxidation only on the hot aft petals')
        heat.inputs['From Min'].default_value=heat_start+(heat_end-heat_start)*.34
        heat.inputs['From Max'].default_value=heat_end
        links.new(separate.outputs['Y'],heat.inputs['Value'])
        tint=node('ShaderNodeValToRGB');r=tint.color_ramp
        r.elements.remove(r.elements[1])
        for i,(position,rgb) in enumerate([(0,base[:3]),(.33,(.31,.235,.13)),(.7,(.155,.125,.18)),(1,(.07,.13,.18))]):
            e=r.elements[0] if i==0 else r.elements.new(position);e.position=position;e.color=(*rgb,1)
        links.new(heat.outputs[0],tint.inputs[0]);color=mix(color,tint.outputs[0],.65)
    # A few authored maintenance scuffs, measured in metres. These capsules
    # are not a random all-over damage texture and do not cross UV seams.
    authored=0
    if ceramic and scuffs:
        planar=node('ShaderNodeVectorMath');planar.operation='MULTIPLY';planar.inputs[1].default_value=(1,1,0)
        links.new(coords.outputs['Position'],planar.inputs[0])
        for x,z,dx,dz in scuffs:
            a=Vector((x,-z,0));axis=Vector((dx,-dz,0));length=axis.length;axis.normalize()
            delta=node('ShaderNodeVectorMath');delta.operation='SUBTRACT';links.new(planar.outputs[0],delta.inputs[0]);delta.inputs[1].default_value=a
            along=node('ShaderNodeVectorMath');along.operation='DOT_PRODUCT';links.new(delta.outputs[0],along.inputs[0]);along.inputs[1].default_value=axis
            t=mathnode('MAXIMUM',0,mathnode('MINIMUM',length,along.outputs['Value']))
            nearest=node('ShaderNodeVectorMath');nearest.operation='SCALE';nearest.inputs[0].default_value=axis;links.new(t,nearest.inputs['Scale'])
            residual=node('ShaderNodeVectorMath');residual.operation='SUBTRACT';links.new(delta.outputs[0],residual.inputs[0]);links.new(nearest.outputs[0],residual.inputs[1])
            distance=node('ShaderNodeVectorMath');distance.operation='LENGTH';links.new(residual.outputs[0],distance.inputs[0])
            mask=ramp(distance.outputs['Value'],.002*scuff_scale,.009*scuff_scale,(1,1,1),(0,0,0))
            authored=mathnode('MAXIMUM',authored,mask)
        up=node('ShaderNodeSeparateXYZ');links.new(coords.outputs['Normal'],up.inputs[0])
        authored=mathnode('MULTIPLY',authored,mathnode('MAXIMUM',0,up.outputs['Z']))
        authored=mathnode('MULTIPLY',authored,ramp(noise((75,75,75)),.2,.8,(.25,.25,.25),(1,1,1)))
        color=mix(color,(base[0]*.28,base[1]*.30,base[2]*.32,1),mathnode('MULTIPLY',authored,.7))
    links.new(color,bsdf.inputs['Base Color'])
    response=mathnode('ADD',rough,mathnode('MULTIPLY',mathnode('SUBTRACT',grain,.5),.045 if ceramic else .12))
    response=mathnode('ADD',response,mathnode('MULTIPLY',dirt,.24))
    response=mathnode('ADD',response,mathnode('MULTIPLY',scratches,.22))
    response=mathnode('SUBTRACT',response,mathnode('MULTIPLY',wear,.045))
    response=mathnode('ADD',response,mathnode('MULTIPLY',authored,.12))
    links.new(response,bsdf.inputs['Roughness'])
    bump=node('ShaderNodeBump','Fine directional tooling; never pebble paint')
    bump.inputs['Strength'].default_value=.22 if metal else .10
    bump.inputs['Distance'].default_value=.0012 if metal else .00065
    links.new(mathnode('ADD',mathnode('MULTIPLY',grain,.18),scratches),bump.inputs['Height'])
    links.new(bevel.outputs['Normal'],bump.inputs['Normal']);links.new(bump.outputs[0],bsdf.inputs['Normal'])
    cavity=mathnode('ADD',.55,mathnode('MULTIPLY',ao.outputs['AO'],.45))
    return {'color':color,'roughness':response,'occlusion':cavity}


def bake_finish(obj, material, channels, directory, size=1024):
    """Four original maps, including glTF occlusion, packed in the GLB."""
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(65), island_margin=.018 if size <= 512 else .012, area_weight=.5, correct_aspect=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    output = nodes.get('Material Output')
    emission = nodes.new('ShaderNodeEmission')
    baked = {}
    bpy.context.scene.cycles.samples = 16
    bpy.context.scene.render.bake.margin = 16 if size >= 2048 else 8
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
