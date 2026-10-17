"""Bake Vesper's reusable bark relief and broadleaf PBR maps in Blender.

Original generated bark, broadleaf, litter and petal albedos remain unchanged.
Companion normal and roughness maps use reproducible Blender node materials,
rather than expensive per-fragment noise stacks. Run with Blender --background.
"""
import bpy
from pathlib import Path
ROOT=Path(__file__).resolve().parent
OUT=ROOT.parent/'textures'
OUT.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=8
scene.cycles.use_denoising=False
scene.render.bake.margin=8
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='Standard'
bpy.ops.mesh.primitive_plane_add(size=1)
plane=bpy.context.object

def material(name):
    m=bpy.data.materials.new(name);m.use_nodes=True
    plane.data.materials.clear();plane.data.materials.append(m)
    nodes=m.node_tree.nodes;nodes.clear()
    return m,nodes,m.node_tree.links

def node(nodes,kind,**values):
    n=nodes.new(kind)
    for k,v in values.items():setattr(n,k,v)
    return n

def mathn(nodes,links,op,a,b=0):
    n=node(nodes,'ShaderNodeMath',operation=op)
    for i,v in enumerate([a,b]):
        if isinstance(v,(int,float)):n.inputs[i].default_value=v
        else:links.new(v,n.inputs[i])
    return n.outputs[0]

def ramp(nodes,links,value,stops):
    n=node(nodes,'ShaderNodeValToRGB');r=n.color_ramp
    while len(r.elements)>2:r.elements.remove(r.elements[-1])
    for i,(p,c) in enumerate(stops):
        e=r.elements[i] if i<2 else r.elements.new(p)
        e.position=p;e.color=(*c,1)
    links.new(value,n.inputs[0]);return n.outputs[0]

def scaled(nodes,links,uv,scale):
    n=node(nodes,'ShaderNodeVectorMath',operation='MULTIPLY');links.new(uv,n.inputs[0]);n.inputs[1].default_value=scale;return n.outputs[0]

def noise(nodes,links,vector,scale,detail=3):
    n=node(nodes,'ShaderNodeTexNoise');links.new(vector,n.inputs['Vector']);n.inputs['Scale'].default_value=scale;n.inputs['Detail'].default_value=detail;n.inputs['Roughness'].default_value=.68;return n.outputs['Fac']

def bake(m,nodes,links,name,color,height,rough,size):
    output=node(nodes,'ShaderNodeOutputMaterial')
    emit=node(nodes,'ShaderNodeEmission')
    bs=node(nodes,'ShaderNodeBsdfPrincipled')
    bump=node(nodes,'ShaderNodeBump');bump.inputs['Strength'].default_value=.7;bump.inputs['Distance'].default_value=.035
    links.new(height,bump.inputs['Height']);links.new(bump.outputs['Normal'],bs.inputs['Normal'])
    for suffix,socket,kind in [('color',color,'EMIT'),('roughness',rough,'EMIT'),('normal',None,'NORMAL')]:
        if socket is None and kind=='EMIT':continue
        map_size=min(size,1024) if suffix=='roughness' else size
        image=bpy.data.images.new('Vesper '+name+' '+suffix,width=map_size,height=map_size,alpha=False)
        image.colorspace_settings.name='sRGB' if suffix=='color' else 'Non-Color'
        target=node(nodes,'ShaderNodeTexImage');target.image=image;nodes.active=target
        for n in nodes:n.select=n==target
        if kind=='EMIT':
            links.new(socket,emit.inputs['Color']);links.new(emit.outputs[0],output.inputs['Surface'])
        else:links.new(bs.outputs[0],output.inputs['Surface'])
        bpy.ops.object.bake(type=kind)
        image.filepath_raw=str(OUT/(name+'-'+suffix+'-v1.png'));image.file_format='PNG';image.save();image.pack()
        print('VESPER_BAKE',image.filepath_raw,flush=True)
    links.new(bs.outputs[0],output.inputs['Surface'])
    if color:links.new(color,bs.inputs['Base Color'])
    links.new(rough,bs.inputs['Roughness'])

m,n,l=material('Vesper HD | ridged bark relief source')
uv=node(n,'ShaderNodeTexCoord').outputs['UV']
image=node(n,'ShaderNodeTexImage');image.image=bpy.data.images.load(str(OUT/'ancient-bark-color.png'));image.image.pack();image.extension='REPEAT';l.new(uv,image.inputs['Vector'])
bw=node(n,'ShaderNodeRGBToBW');l.new(image.outputs['Color'],bw.inputs[0])
long=noise(n,l,scaled(n,l,uv,(4,0.65,1)),6,3)
fine=noise(n,l,uv,160,2)
height=mathn(n,l,'ADD',mathn(n,l,'MULTIPLY',bw.outputs[0],.30),mathn(n,l,'ADD',mathn(n,l,'MULTIPLY',long,.5),mathn(n,l,'MULTIPLY',fine,.004)))
rough=ramp(n,l,bw.outputs[0],[(.05,(.97,)*3),(.55,(.77,)*3),(.9,(.7,)*3)])
bake(m,n,l,'ancient-bark',None,height,rough,2048)

m,n,l=material('Vesper HD | waxed broadleaf source')
uv=node(n,'ShaderNodeTexCoord').outputs['UV']
image=node(n,'ShaderNodeTexImage');image.image=bpy.data.images.load(str(OUT/'broadleaf-color-v1.png'));image.image.pack();l.new(uv,image.inputs['Vector'])
bw=node(n,'ShaderNodeRGBToBW');l.new(image.outputs['Color'],bw.inputs[0])
pores=noise(n,l,uv,170,2)
height=mathn(n,l,'ADD',mathn(n,l,'MULTIPLY',bw.outputs[0],.22),mathn(n,l,'MULTIPLY',pores,.004))
rough=ramp(n,l,bw.outputs[0],[(.02,(.66,)*3),(.28,(.48,)*3),(.7,(.58,)*3)])
# The generated cross-polarized color source is retained verbatim.
bake(m,n,l,'broadleaf',None,height,rough,1024)
m,n,l=material('Vesper HD | damp forest-floor source')
uv=node(n,'ShaderNodeTexCoord').outputs['UV']
image=node(n,'ShaderNodeTexImage');image.image=bpy.data.images.load(str(OUT/'forest-floor-color-v1.png'));image.image.pack();image.extension='REPEAT';l.new(uv,image.inputs['Vector'])
bw=node(n,'ShaderNodeRGBToBW');l.new(image.outputs['Color'],bw.inputs[0])
broad=noise(n,l,uv,5,3);fine=noise(n,l,uv,100,2)
height=mathn(n,l,'ADD',mathn(n,l,'MULTIPLY',bw.outputs[0],.2),mathn(n,l,'ADD',mathn(n,l,'MULTIPLY',broad,.12),mathn(n,l,'MULTIPLY',fine,.006)))
rough=ramp(n,l,bw.outputs[0],[(.03,(.76,)*3),(.5,(.96,)*3)])
# Preserve the original generated albedo; bake only companion surface maps.
bake(m,n,l,'forest-floor',None,height,rough,1024)

m,n,l=material('Vesper HD | living petal tissue source')
uv=node(n,'ShaderNodeTexCoord').outputs['UV']
image=node(n,'ShaderNodeTexImage');image.image=bpy.data.images.load(str(OUT/'petal-tissue-color-v1.png'));image.image.pack();l.new(uv,image.inputs['Vector'])
bw=node(n,'ShaderNodeRGBToBW');l.new(image.outputs['Color'],bw.inputs[0])
fibres=noise(n,l,scaled(n,l,uv,(1,8,1)),24,2)
height=mathn(n,l,'ADD',mathn(n,l,'MULTIPLY',bw.outputs[0],.18),mathn(n,l,'MULTIPLY',fibres,.006))
rough=ramp(n,l,bw.outputs[0],[(.25,(.76,)*3),(.85,(.53,)*3)])
bake(m,n,l,'petal-tissue',None,height,rough,1024)

bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'vesper-forest-materials.blend'),compress=True)
