"""Editable interior S-fold for the retained Ascent collector.
Blender --background --factory-startup --python build_collector_fold.py [-- --render]
Exports only a31x31 native(right/up/forward) displacement cage. Perimeter is fixed.
Requires Node22 on PATH and the game's installed npm dependencies for canonical data formatting.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import subprocess
import bpy
from mathutils import Vector

HERE=Path(__file__).resolve().parent
GAME=HERE.parents[3]
BLEND=HERE/'ravel-ascent-collector-fold.blend'
OUT=GAME/'src/levels/ravel/collector-fold-data.js'
SIZE=31
PARAMETERS={'s':3430,'length':450,'width':600,'side':250,'lift':350,'sag':60,'yaw':-.15,'lean':250}
parser=argparse.ArgumentParser();parser.add_argument('--render',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)


def xyz(p): return Vector((p[0],-p[2],p[1]))
def native(p): return (p.x,p.z,-p.y)
def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)))
    return t*t*(3-2*t)


def base(u,v):
    p=PARAMETERS
    return Vector((p['side']+(u-.5)*p['width']*(.64+.36*math.sin(math.pi*v)),
        p['lift']-p['sag']*math.sin(math.pi*u)*math.sin(math.pi*v)+p['lean']*(u-.5)+120*(v-.5)+38*math.sin(v*math.tau)*math.sin(u*math.pi),
        (v-.5)*p['length']))


# A single broad turned lip. The cross-profile actually reverses horizontally
# above the lower plane, then unfurls over an unequal second plane; it is not
# scalar height noise. The open20m+ vertical overlap remains non-intersecting.
PROFILE=[(-220,0,0),(-130,0,-3),(-70,0,4),(-30,6,24),(0,8,65),
         (45,-70,95),(80,-70,85),(135,-15,32),(220,0,0)]
profile_points=[Vector((q+dx,dy)) for q,dx,dy in PROFILE]
tangents=[]
for i in range(len(PROFILE)):
    if i in [0,len(PROFILE)-1]: tangents.append(Vector((1,0)))
    else: tangents.append((profile_points[i+1]-profile_points[i-1])/(PROFILE[i+1][0]-PROFILE[i-1][0]))


def cross_profile(q):
    if q<=PROFILE[0][0] or q>=PROFILE[-1][0]: return (0,0)
    for i in range(len(PROFILE)-1):
        qa,qb=PROFILE[i][0],PROFILE[i+1][0]
        if qa<=q<=qb:
            t=(q-qa)/(qb-qa);h=qb-qa
            a,b=profile_points[i],profile_points[i+1]
            c=a+tangents[i]*h/3;d=b-tangents[i+1]*h/3
            p=a*(1-t)**3+c*(3*(1-t)**2*t)+d*(3*(1-t)*t*t)+b*t**3
            return p.x-q,p.y
    return (0,0)


def ridge(v):
    return .49+.20*(v-.5)+.10*math.sin(math.tau*(v-.22))


def displacement(u,v):
    if u==0 or u==1 or v==0 or v==1: return Vector((0,0,0))
    eu=smooth(0,.13,u)*smooth(0,.13,1-u)
    ev=smooth(.06,.25,v)*smooth(.06,.22,1-v)
    envelope=eu*ev
    width=600*(.64+.36*math.sin(math.pi*v))
    derivative=.20+.10*math.tau*math.cos(math.tau*(v-.22))
    width_derivative=600*.36*math.pi*math.cos(math.pi*v)
    slope=(derivative*width+(ridge(v)-.5)*width_derivative)/450
    across=Vector((1,0,-slope)).normalized()
    q=(u-ridge(v))*width/math.sqrt(1+slope*slope)
    dx,dy=cross_profile(-q)
    dx=-dx
    return (across*(dx*.95)+Vector((0,dy*-.75,0)))*envelope


points=[];offsets=[];faces=[]
for r in range(SIZE):
    v=r/(SIZE-1)
    for c in range(SIZE):
        u=c/(SIZE-1);p=base(u,v);d=displacement(u,v)
        points.append(xyz(p));offsets.append(d)
for r in range(SIZE-1):
    for c in range(SIZE-1):
        n=r*SIZE+c
        faces.append((n,n+SIZE,n+SIZE+1,n+1))
mesh=bpy.data.meshes.new('Ascent collector31x31 control cage')
mesh.from_pydata(points,[],faces);mesh.update()
obj=bpy.data.objects.new('Ascent collector / fixed perimeter and turned interior',mesh)
bpy.context.collection.objects.link(obj)
obj['parameters']=json.dumps(PARAMETERS)
obj['coordinates']='Nativegame right/up/forward; runtime applies existing yaw and track frame.'
obj['layout']='31x31,row-v/column-u; all boundary displacements exactly zero.'
obj.shape_key_add(name='Basis / exact accepted collector')
fold=obj.shape_key_add(name='Authored diagonal S-fold and turned lip')
for i,d in enumerate(offsets): fold.data[i].co=points[i]+xyz(d)
fold.value=1
for face in mesh.polygons: face.use_smooth=True
for name,color,metal,rough in [('Foil / retained aluminized cloth',(.68,.72,.71),.88,.38)]:
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    p.inputs['Coat Weight'].default_value=.15;p.inputs['Coat Roughness'].default_value=.3
    mesh.materials.append(m)

# Retain both authored Bezier guides for subsequent meaningful form edits.
curve=bpy.data.curves.new('Turned lip editable cross-profile','CURVE');curve.dimensions='3D'
sp=curve.splines.new('BEZIER');sp.bezier_points.add(len(PROFILE)-1)
for i,(q,dx,dy) in enumerate(PROFILE):
    p=sp.bezier_points[i];p.co=xyz((q+dx,dy,0));p.handle_left_type=p.handle_right_type='FREE'
    left=(PROFILE[i][0]-PROFILE[i-1][0])/3 if i else 30
    right=(PROFILE[i+1][0]-PROFILE[i][0])/3 if i<len(PROFILE)-1 else 30
    p.handle_left=p.co-xyz((tangents[i].x*left,tangents[i].y*left,0))
    p.handle_right=p.co+xyz((tangents[i].x*right,tangents[i].y*right,0))
guide=bpy.data.objects.new('Guide / one broad rolled S-fold section',curve);bpy.context.collection.objects.link(guide)
guide.hide_render=True;guide.hide_viewport=True
guide['originalParameterQ']=[p[0] for p in PROFILE]
path=bpy.data.curves.new('Diagonal S-fold crest path','CURVE');path.dimensions='3D'
sp=path.splines.new('POLY');sp.points.add(SIZE-1)
for r,p in enumerate(sp.points):
    v=r/(SIZE-1);position=base(ridge(v),v)+displacement(ridge(v),v)
    p.co=(*xyz(position),1)
guide=bpy.data.objects.new('Guide / asymmetric diagonal crest',path);bpy.context.collection.objects.link(guide)
guide.hide_render=True;guide.hide_viewport=True
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
bpy.context.view_layer.objects.active=obj;obj.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))

# Data are extracted from the authored Blender shape key, not separately
# resynthesized by runtime. Quantization is1mm; exact zero perimeter is asserted.
values=[]
for r in range(SIZE):
    for c in range(SIZE):
        i=r*SIZE+c;d=fold.data[i].co-obj.data.shape_keys.key_blocks[0].data[i].co
        triple=[round(n,3) for n in native(d)]
        if r in [0,SIZE-1] or c in [0,SIZE-1]:
            assert all(abs(x)<1e-6 for x in triple),('nonzero perimeter',r,c,triple)
            triple=[0,0,0]
        values.extend(triple)
lines=[]
for r in range(SIZE):
    row=values[r*SIZE*3:(r+1)*SIZE*3]
    lines.append('  '+','.join(str(x) if x else '0' for x in row)+',')
OUT.write_text('// Blender-authored Ascent3430 collector interior. Native right/up/forward metres.\n// Row-major v/column-u; every perimeter displacement is exactly zero.\nexport const COLLECTOR_FOLD_SIZE = '+str(SIZE)+';\nexport const COLLECTOR_FOLD_OFFSETS = new Float32Array([\n'+'\n'.join(lines)+'\n]);\n')
# Match the repository pre-commit representation before recording file hashes.
subprocess.run(['node',str(GAME/'node_modules/prettier/bin/prettier.cjs'),'--write',str(OUT)],cwd=GAME,check=True)

if args.render:
    scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.055,.07,.1,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.4
    def area(name,position,power,size,color):
        d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
        o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=xyz(position)
        o.rotation_euler=(xyz((250,350,0))-o.location).to_track_quat('-Z','Y').to_euler()
    area('warm stellar side',(550,80,-250),7000000,300,(1,.73,.48))
    area('cool reflected space',(-130,130,150),5500000,260,(.48,.68,1))
    d=bpy.data.cameras.new('Underside collector form review');cam=bpy.data.objects.new('Underside collector form review',d);scene.collection.objects.link(cam)
    cam.location=xyz((500,-250,-700));cam.rotation_euler=(xyz((250,350,0))-cam.location).to_track_quat('-Z','Y').to_euler()
    d.type='ORTHO';d.ortho_scale=780;scene.camera=cam
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16
    scene.render.threads_mode='FIXED';scene.render.threads=2
    scene.render.resolution_x=1500;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    temp=GAME/'.experiments/ravel-collector-fold';temp.mkdir(parents=True,exist_ok=True)
    scene.render.filepath=str(temp/'fold-review.png');bpy.ops.render.render(write_still=True)

sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
triples=[values[i:i+3] for i in range(0,len(values),3)]
provenance={
    'source':Path(__file__).name,'blend':BLEND.name,'runtimeData':'src/levels/ravel/collector-fold-data.js',
    'rights':'Original project-authored Blender control mesh and editable shape key/Bezier profiles; no external assets.',
    'parameters':PARAMETERS,'size':SIZE,'layout':'Row-v/column-u,flatXYZ,native right/up/forward metres before existing yaw/frame transform.',
    'perimeter':'All XYZ offsets exactly0; existing accepted hem and stay anchors retained.',
    'processing':'Quantize cage offsets to1mm, emit Float32 module, then canonicalize with project-local Prettier under Node22 before provenance hashing; no geometry change.',
    'design':'One broad asymmetric diagonal S-fold, opposite-handed horizontally reversing lip and unequal overlapping planes; camera-facing downward displacement.',
    'deformation':{'profileTransverseSign':-1,'horizontalCurl':.95,'verticalDisplacement':-.75},
    'bounds':{'min':[min(v[k] for v in triples) for k in range(3)],'max':[max(v[k] for v in triples) for k in range(3)]},
    'racingReferences':[
        'Production Ascent approach below the transverse gallery with collector visible beyond the cutter.',
        'Production Ascent mid-climb with collector underside and retained road opening.',
        'Production Ascent climb/exit beneath collector edge, retaining its accepted fixed perimeter.',
    ],
    'referenceImages':[{'file':'assets/levels/ravel/reference/'+name,'sha256':sha(HERE.parent/'reference'/name)} for name in ['sail-basin-selected-crop.png','ravel-crown-fold-concept.png']],
    'hashes':{Path(__file__).name:sha(Path(__file__)),BLEND.name:sha(BLEND),OUT.name:sha(OUT)},
}
(HERE/'collector-fold-provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
print('RAVEL_COLLECTOR_FOLD '+json.dumps({'size':SIZE,'bounds':provenance['bounds'],'bytes':OUT.stat().st_size}))
