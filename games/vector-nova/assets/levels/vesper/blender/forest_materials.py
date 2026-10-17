"""Shared export materials for Vesper's HD forest; one embedded PBR library."""
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parent

def apply_forest_materials(embed=True):
    for suffix,kind in [('ridged indigo bark','bark'),('shadowed cambium','bark'),('waxed blue teal leaves','leaf'),('exposed ivory sapwood','bark')]:
        m=bpy.data.materials.get('Vesper | '+suffix)
        if not m:continue
        n=m.node_tree.nodes;l=m.node_tree.links;bs=n.get('Principled BSDF')
        if not embed:
            # Runtime borrows matching materials from the primary library. The
            # secondary forest carries no duplicated texture payload or upload.
            for socket in ['Base Color','Normal','Roughness']:
                for link in list(bs.inputs[socket].links):l.remove(link)
            continue
        def texture(name,noncolor=False):
            image=bpy.data.images.load(str(ROOT.parent/'textures'/name),check_existing=True)
            if noncolor:image.colorspace_settings.name='Non-Color'
            image.pack()
            t=n.new('ShaderNodeTexImage');t.image=image;t.extension='REPEAT'
            return t
        prefix='ancient-bark' if kind=='bark' else 'broadleaf'
        if kind=='leaf':
            t=texture('broadleaf-color-v1.png')
            l.new(t.outputs['Color'],bs.inputs['Base Color'])
        if suffix=='exposed ivory sapwood':
            l.new(texture('ancient-bark-color.png').outputs['Color'],bs.inputs['Base Color'])
        normal=texture(prefix+'-normal-v1.png',True)
        nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.28 if kind=='bark' else .35
        l.new(normal.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs['Normal'],bs.inputs['Normal'])
        rough=texture(prefix+'-roughness-v1.png',True)
        l.new(rough.outputs['Color'],bs.inputs['Roughness'])

    if embed:
        for suffix,tint in [('flower milky inner tissue',(1.,.9,.76,1)),('flower plum backs',(.27,.09,.15,1)),('fungal moon tissue',(.22,.36,.29,1)),('fungal pore tissue',(.48,.61,.52,1))]:
            m=bpy.data.materials.get('Vesper | '+suffix)
            if not m:continue
            n=m.node_tree.nodes;l=m.node_tree.links;bs=n.get('Principled BSDF')
            for channel,socket in [('color','Base Color'),('roughness','Roughness'),('normal','Normal')]:
                image=bpy.data.images.load(str(ROOT.parent/'textures'/('petal-tissue-'+channel+'-v1.png')),check_existing=True)
                if channel!='color':image.colorspace_settings.name='Non-Color'
                image.pack();tex=n.new('ShaderNodeTexImage');tex.image=image
                if channel=='normal':
                    nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.32;l.new(tex.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs['Normal'],bs.inputs[socket])
                elif channel=='color':
                    mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=tint
                    l.new(tex.outputs['Color'],mix.inputs[1]);l.new(mix.outputs[0],bs.inputs[socket])
                else:l.new(tex.outputs['Color'],bs.inputs[socket])

    if embed:
        m=bpy.data.materials.new('Vesper | damp moss and leaf litter');m.use_nodes=True
        n=m.node_tree.nodes;l=m.node_tree.links;bs=n.get('Principled BSDF')
        for suffix,socket in [('color','Base Color'),('roughness','Roughness'),('normal','Normal')]:
            image=bpy.data.images.load(str(ROOT.parent/'textures'/('forest-floor-'+suffix+'-v1.png')),check_existing=True)
            if suffix!='color':image.colorspace_settings.name='Non-Color'
            image.pack();tex=n.new('ShaderNodeTexImage');tex.image=image
            if suffix=='normal':
                nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.45
                l.new(tex.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs['Normal'],bs.inputs[socket])
            else:l.new(tex.outputs['Color'],bs.inputs[socket])
        bpy.ops.mesh.primitive_plane_add(size=1)
        obj=bpy.context.object;obj.name='forest_floor_surface';obj.data.materials.append(m)
