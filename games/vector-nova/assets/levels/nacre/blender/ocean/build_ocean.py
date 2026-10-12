"""Editable Blender wave study; the game consumes this same JSON profile on GPU.

Run from anywhere with Blender --background --factory-startup --python this_file.
Append -- --save-only to refresh the editable source without rendering evidence.
No baked simulation or runtime mesh sequence is required.
"""
from pathlib import Path
import bpy
import json
import math
import sys
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[5]
PROFILE=json.loads((ROOT/'src/levels/nacre/environment/ocean-profile.json').read_text())
OUT=ROOT/'assets/levels/nacre/blender/ocean'
EVIDENCE=ROOT/'.experiments/gate4-1/ocean-swells'
SAVE_ONLY='--save-only' in sys.argv
OUT.mkdir(parents=True,exist_ok=True)
if not SAVE_ONLY:
    EVIDENCE.mkdir(parents=True,exist_ok=True)

# This script is intended for a fresh isolated background process only.
if bpy.data.filepath:
    raise RuntimeError('Use --factory-startup; do not replace an existing scene')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def sample(x,y,time=5.5):
    displacement=Vector((0,0,0))
    horizontal_x=Vector((0,0))
    horizontal_y=Vector((0,0))
    crest=0
    amplitude_sum=sum(wave['amplitude'] for wave in PROFILE['waves'])
    for wave in PROFILE['waves']:
        dx,dy=wave['direction']
        length=math.hypot(dx,dy)
        dx,dy=dx/length,dy/length
        k=math.tau/wave['wavelength']
        phase=k*(dx*x+dy*y-wave['speed']*time)+wave['phase']
        group=wave['group']
        gx,gy=group['direction']
        length=math.hypot(gx,gy)
        gx,gy=gx/length,gy/length
        group_k=math.tau/group['wavelength']
        group_phase=group_k*(gx*x+gy*y-group['speed']*time)+group['phase']
        half_depth=group['depth']*.5
        envelope=1-half_depth+half_depth*math.sin(group_phase)
        envelope_slope=half_depth*group_k*math.cos(group_phase)
        ex,ey=envelope_slope*gx,envelope_slope*gy
        s,c=math.sin(phase),math.cos(phase)
        height=wave['amplitude']*(s-wave['sharpness']*math.cos(2*phase))
        horizontal=wave['amplitude']*wave['steepness']
        displacement+=Vector((envelope*horizontal*c*dx,envelope*horizontal*c*dy,envelope*height))
        hx=horizontal*(ex*c-envelope*k*s*dx)
        hy=horizontal*(ey*c-envelope*k*s*dy)
        horizontal_x+=Vector((hx*dx,hx*dy))
        horizontal_y+=Vector((hy*dx,hy*dy))
        crest+=envelope*max(0,s)**5*wave['amplitude']/amplitude_sum
    jacobian=(1+horizontal_x.x)*(1+horizontal_y.y)-horizontal_x.y*horizontal_y.x
    compression=max(0,min(1,1-jacobian))
    return displacement,crest,compression

count=221
extent=1100
verts=[]
foam=[]
faces=[]
for row in range(count):
    for col in range(count):
        x=-extent/2+col*extent/(count-1)
        y=-extent/2+row*extent/(count-1)
        displacement,crest,compression=sample(x,y)
        verts.append((x+displacement.x,y+displacement.y,displacement.z))
        foam.append(max(0,min(1,(crest-.35)/.20))*max(0,min(1,(compression-.12)/.08)))
for row in range(count-1):
    for col in range(count-1):
        a=row*count+col
        faces.append((a,a+1,a+count+1,a+count))
mesh=bpy.data.meshes.new('Storm ocean / editable profile surface')
mesh.from_pydata(verts,[],faces)
mesh.update()
obj=bpy.data.objects.new('Storm ocean / metre-scale swell study',mesh)
bpy.context.collection.objects.link(obj)
for p in mesh.polygons:
    p.use_smooth=True
attr=mesh.attributes.new('crest_foam','FLOAT','POINT')
for i,f in enumerate(foam):
    attr.data[i].value=f
obj['profile_source']='src/levels/nacre/environment/ocean-profile.json'
obj['profile_json']=json.dumps(PROFILE)
obj['sample_time_seconds']=5.5
obj['runtime']='Live grouped Gerstner displacement and selective crest foam; this is the editable shape study, not a fluid simulation bake.'

mat=bpy.data.materials.new('Deep storm teal / pearl foam')
mat.use_nodes=True
nodes=mat.node_tree.nodes
links=mat.node_tree.links
bsdf=nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value=.23
bsdf.inputs['Metallic'].default_value=.18
bsdf.inputs['IOR'].default_value=1.333
attribute=nodes.new('ShaderNodeAttribute')
attribute.attribute_name='crest_foam'
noise=nodes.new('ShaderNodeTexNoise')
noise.inputs['Scale'].default_value=.17
noise.inputs['Detail'].default_value=3
geometry=nodes.new('ShaderNodeNewGeometry')
links.new(geometry.outputs['Position'],noise.inputs['Vector'])
multiply=nodes.new('ShaderNodeMath')
multiply.operation='MULTIPLY'
links.new(attribute.outputs['Fac'],multiply.inputs[0])
links.new(noise.outputs['Fac'],multiply.inputs[1])
mix=nodes.new('ShaderNodeMixRGB')
mix.blend_type='MIX'
mix.inputs[1].default_value=(.018,.075,.085,1)
mix.inputs[2].default_value=(.62,.78,.76,1)
links.new(multiply.outputs[0],mix.inputs[0])
links.new(mix.outputs[0],bsdf.inputs['Base Color'])
mesh.materials.append(mat)

# One seven-metre scale marker shows the large swells; it is study-only.
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-30,55))
marker=bpy.context.object
marker.name='Study only / seven-metre hovercraft scale marker'
marker.scale=(2.25,3.5,.8)
scale_mat=bpy.data.materials.new('Scale marker pearl')
scale_mat.diffuse_color=(.7,.8,.82,1)
marker.data.materials.append(scale_mat)

world=bpy.data.worlds.new('Overcast storm fill')
world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.27,.38,.43,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
bpy.context.scene.world=world
bpy.ops.object.light_add(type='AREA',location=(-200,-40,260))
light=bpy.context.object
light.name='Broad opening in storm clouds'
light.data.energy=1900000
light.data.shape='DISK'
light.data.size=340
light.rotation_euler=(Vector((0,0,0))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.light_add(type='SUN',location=(0,0,300))
sun=bpy.context.object
sun.data.energy=2.3
sun.data.angle=.3
sun.rotation_euler=(.4,-.45,-.6)
bpy.ops.object.camera_add(location=(70,-330,105))
camera=bpy.context.object
camera.name='Ocean study / low elevated racing view'
camera.rotation_euler=(Vector((20,80,0))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.lens=34
camera.data.clip_end=3000
scene=bpy.context.scene
scene.camera=camera
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.cycles.use_denoising=True
scene.render.resolution_x=1440
scene.render.resolution_y=900
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.unit_settings.system='METRIC'
scene.view_settings.view_transform='AgX'
scene.render.filepath=str(EVIDENCE/'blender-wave-study.png')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'storm-swells-v1.blend'))
if not SAVE_ONLY:
    bpy.ops.render.render(write_still=True)
    (EVIDENCE/'blender-study.json').write_text(json.dumps({'profile':PROFILE,'vertices':len(verts),'quads':len(faces),'editable_source':str(OUT/'storm-swells-v1.blend'),'render':scene.render.filepath,'runtime_mesh_export':False},indent=2)+'\n')
