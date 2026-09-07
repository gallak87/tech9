"""Original Dusk coastal kit, metres/Z-up. Run with pinned Blender 5.1.1.
No downloaded geometry or textures. Deterministic baked surface maps and editable
bevelled meshes; each part goes through the existing static_blend recipe.
"""
import bpy, math, random, json, hashlib, sys
import numpy as np
from pathlib import Path
from mathutils import Vector
PREP=Path(__file__).resolve().parents[2]
REV=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'r1'
NAMES=sys.argv[sys.argv.index('--')+2:] if '--' in sys.argv else []
random.seed(606)
bpy.ops.wm.read_factory_settings(use_empty=True)

def texmat(name,base,metal=0,wood=False):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Metallic'].default_value=metal
    p.inputs['Roughness'].default_value=.82 if not metal else .65
    n=512; rng=np.random.default_rng(sum(map(ord,name)))
    yy,xx=np.mgrid[:n,:n]/n
    noise=np.zeros((n,n))
    for freq,amp in [(3,.10),(9,.055),(31,.035),(117,.022)]:
        for _ in range(5):
            angle=rng.uniform(0,math.tau)
            noise+=amp/5*np.sin(math.tau*freq*(xx*math.cos(angle)+yy*math.sin(angle))+rng.uniform(0,6.28))
    noise+=rng.normal(0,.014,(n,n))
    if wood: noise+=.04*np.sin(xx*380+np.sin(yy*15)*2)+.025*np.sin(xx*940+np.sin(yy*32))
    # Fine fissures, weathering pits, and soft salt blooms, baked to portable maps.
    for _ in range(14):
        cx,cy=rng.random(2); dist=(xx-cx)**2+(yy-cy)**2
        noise+=rng.uniform(-.16,.12)*np.exp(-dist/rng.uniform(.00008,.002))
    for _ in range(5):
        x0,y0=rng.random(2); dx,dy=rng.uniform(-.28,.28,2)
        t=np.clip(((xx-x0)*dx+(yy-y0)*dy)/(dx*dx+dy*dy),0,1)
        distance=((xx-x0-t*dx)**2+(yy-y0-t*dy)**2)**.5
        noise-=.1*np.exp(-(distance/.0015)**2)
    rgba=np.ones((n,n,4),np.float32)
    rgba[:,:,:3]=np.clip(np.array(base)[None,None,:]+noise[:,:,None],.01,.95)
    img=bpy.data.images.new(name+' baked salt and grain',width=n,height=n)
    img.pixels.foreach_set(rgba.ravel()); img.pack()
    node=m.node_tree.nodes.new('ShaderNodeTexImage'); node.image=img
    m.node_tree.links.new(node.outputs['Color'],p.inputs['Base Color'])
    rough=np.ones((n,n,4),np.float32); rough[:,:,1]=np.clip(.78+noise*.8,.35,.99); rough[:,:,2]=metal
    ri=bpy.data.images.new(name+' packed ORM',width=n,height=n); ri.colorspace_settings.name='Non-Color'
    ri.pixels.foreach_set(rough.ravel()); ri.pack()
    rn=m.node_tree.nodes.new('ShaderNodeTexImage'); rn.image=ri
    split=m.node_tree.nodes.new('ShaderNodeSeparateColor')
    m.node_tree.links.new(rn.outputs['Color'],split.inputs['Color'])
    m.node_tree.links.new(split.outputs['Green'],p.inputs['Roughness'])
    m.node_tree.links.new(split.outputs['Blue'],p.inputs['Metallic'])
    return m
stone=texmat('Salt limestone',(.43,.46,.42))
darkstone=texmat('Wet basalt',(.18,.25,.25))
concrete=texmat('Pitted concrete',(.49,.49,.41))
rust=texmat('Oxidised iron',(.25,.16,.095),.55)
teal=texmat('Worn teal enamel',(.09,.28,.27),.45)
wood=texmat('Silvered driftwood',(.37,.32,.24),wood=True)

def plain(name,color,emission=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=.9
    if emission: p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=emission
    return m
rope=plain('Flax rope',(.40,.34,.20)); light=plain('Reclaimed cyan power',(.12,.7,.65),1.5)
leaves=[plain('Coastal blade %d'%i,c) for i,c in enumerate([(.19,.27,.12),(.29,.35,.16),(.38,.40,.22),(.23,.32,.19)])]

def finish(obj,mat,bevel=0):
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod=obj.modifiers.new('Worn edges','BEVEL'); mod.width=bevel; mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    # World-scale box projection. The source keeps explicit editable UVs.
    uv=obj.data.uv_layers.new(name='Metre grain') if not obj.data.uv_layers else obj.data.uv_layers[0]
    for poly in obj.data.polygons:
        normal=poly.normal; axis=max(range(3),key=lambda i:abs(normal[i])); axes=[i for i in range(3) if i!=axis]
        for loop in poly.loop_indices:
            v=obj.data.vertices[obj.data.loops[loop].vertex_index].co
            uv.data[loop].uv=(v[axes[0]]*.7,v[axes[1]]*.7)
    obj.select_set(False); return obj

def box(name,at,size,mat,bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=at); o=bpy.context.object; o.name=name; o.scale=size
    return finish(o,mat,bevel)
def cyl(name,at,radius,depth,mat,vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=at)
    o=bpy.context.object; o.name=name; return finish(o,mat,.015)
def beam(name,a,b,r,mat):
    o=cyl(name,(Vector(a)+Vector(b))*.5,r,(Vector(b)-Vector(a)).length,mat,10)
    o.rotation_mode='QUATERNION'; o.rotation_quaternion=(Vector(b)-Vector(a)).to_track_quat('Z','Y'); return o
def torus(name,at,major,minor,mat):
    bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=8,location=at,major_radius=major,minor_radius=minor)
    o=bpy.context.object; o.name=name; return finish(o,mat)
def mesh(name,verts,faces,mat):
    data=bpy.data.meshes.new(name); data.from_pydata(verts,[],faces); data.update()
    o=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active=o; o.select_set(True); return finish(o,mat,.015)

def seawall():
    for row in range(3):
        for col in range(3):
            x=-1.5+(col+.5)*1.0
            o=box('Individual salt-worn ashlar',(x,0,row*.84+.42),(.975,1.05,.815),darkstone if row==0 else stone,.045)
            o.rotation_euler.z=random.uniform(-.01,.01)
    box('Overhanging concrete coping',(0,0,2.63),(3.15,1.2,.22),concrete,.055)
    for x in [-1.15,1.15]:
        box('Seawall buttress',(x,-.36,1.15),(.38,1.1,2.3),stone,.04)
        box('Iron repair strap',(x,-.938,1.12),(.12,.035,1.8),rust,.006)
        for z in [.4,1,1.8]:
            bolt=cyl('Fastener',(x,-.97,z),.038,.045,rust,6); bolt.rotation_euler.x=math.pi/2

def arch():
    for x in [-2.53,2.53]:
        box('Broad foundation shoe',(x,0,.18),(1.18,1.55,.36),concrete,.06)
        for z in range(3): box('Masonry pier',(x,0,.37+(z+.5)*.63),(.78,1.0,.60),stone,.045)
        box('Springing capital',(x,0,2.36),(1.02,1.22,.22),concrete,.035)
    for i in range(13):
        a=i*math.pi/13+.007; b=(i+1)*math.pi/13-.007
        verts=[(r*math.cos(t),y,2.45+r*math.sin(t)) for y in [-.52,.52] for r,t in [(2.12,a),(2.85,a),(2.85,b),(2.12,b)]]
        mesh('Radial arch voussoir',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],stone if i%3 else concrete)
    # Repaired utility pipe follows one side, readable without fantasy ornament.
    beam('Copper utility riser',(2.94,-.58,.25),(2.94,-.58,3.25),.055,rust)
    box('Fused junction box',(2.97,-.60,1.25),(.36,.2,.48),teal)
    box('Power indicator',(2.97,-.711,1.32),(.20,.015,.05),light,.004)

def bollard():
    cyl('Bolt plate',(0,0,.055),.32,.11,rust)
    cyl('Flared foot',(0,0,.15),.22,.21,teal)
    cyl('Cast mooring post',(0,0,.39),.14,.5,teal)
    cyl('Mushroom top',(0,0,.66),.25,.12,rust)
    for a in range(4):
        x,y=.245*math.cos(a*math.pi/2),.245*math.sin(a*math.pi/2)
        cyl('Hex bolt',(x,y,.12),.036,.035,rust,6)
    for z in [.23,.27,.31]: torus('Rope winding',(0,0,z),.155,.024,rope)

def supplies():
    for x,y,z,s in [(-.42,0,.48,.9),(.5,.08,.37,.68),(-.36,0,1.2,.65)]:
        box('Crate dark gaps',(x,y,z),(s*.98,s*.96,s*.95),darkstone)
        for i in range(5):
            for side in [-1,1]:
                box('Silvered slat',(x,y+side*s*.51,z-s*.5+(i+.5)*s/5),(s,s*.055,s/5-.018),wood,.009)
                box('Side slat',(x+side*s*.51,y,z-s*.5+(i+.5)*s/5),(s*.055,s,s/5-.018),wood,.009)
            box('Lid board',(x-s*.5+(i+.5)*s/5,y,z+s*.51),(s/5-.014,s,.06),wood,.01)
        for side in [-1,1]:
            box('Iron binding',(x+side*s*.33,y,z+s*.55),(.05,s+.06,.02),rust,.004)
    cyl('Sealed utility canister',(.60,-.52,.39),.20,.78,teal)
    torus('Canister seal',(.60,-.52,.72),.205,.02,rust)

def rocks():
    for at,scale in [((-.65,0,.50),(1.3,.95,.85)),((.7,.25,.33),(.85,.75,.59)),((0,-.68,.18),(.62,.6,.3))]:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=at)
        o=bpy.context.object; o.name='Stratified shoreline rock'
        for v in o.data.vertices:
            v.co*=random.uniform(.86,1.13)
            v.co.z=max(v.co.z,-.56)
        o.scale=scale; finish(o,darkstone,.025)
    # Ground precisely without flattening the visible crowns.
    low=min((o.matrix_world@v.co).z for o in bpy.context.scene.objects for v in o.data.vertices)
    for o in bpy.context.scene.objects: o.location.z-=low

def grass():
    for i in range(64):
        a=random.random()*math.tau; r=random.random()**.5*.65
        x,y=math.cos(a)*r,math.sin(a)*r
        h=random.uniform(.35,.94); bend=random.uniform(.12,.33); w=random.uniform(.017,.045)
        right=Vector((math.cos(a),math.sin(a),0)); origin=Vector((x,y,0))
        verts=[]
        for j in range(4):
            t=j/3; center=origin+Vector((bend*t*t, .08*math.sin(a)*t*t,h*t))
            verts.extend([tuple(center+right*w*(1-t*.85)),tuple(center-right*w*(1-t*.85))])
        faces=[(j*2,j*2+1,j*2+3,j*2+2) for j in range(3)]
        o=mesh('Wind bent marram',verts,faces,leaves[i%4])
        # Keep two-sided blades as explicit faces; no transparency sorting.
        mod=o.modifiers.new('Blade thickness','SOLIDIFY'); mod.thickness=.001
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)

def bridge():
    for x in [-1.7,1.7]: box('Salvaged steel stringer',(x,0,.09),(.19,3,.18),rust)
    for i in range(12):
        box('Weathered deck plank',(0,-1.5+(i+.5)*.25,.245+random.uniform(-.006,.006)),(4,.232,.13),wood,.018)
        for x in [-1.7,1.7]: cyl('Recessed deck bolt',(x,-1.5+(i+.5)*.25,.318),.024,.018,rust,6)

def tower():
    cyl('Rock anchored base',(0,0,.45),2.3,.9,darkstone,8)
    bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=1.7,radius2=.93,depth=11.5,location=(0,0,6.4))
    finish(bpy.context.object,concrete,.065)
    for a in range(8):
        angle=a*math.tau/8
        beam('Exposed load rib',(1.67*math.cos(angle),1.67*math.sin(angle),1),(.95*math.cos(angle),.95*math.sin(angle),12),.095,rust)
    for z in [3.2,7.1,11.3]: torus('Old service ring',(0,0,z),1.4 if z<8 else 1.15,.14,teal)
    cyl('Service gallery',(0,0,12.15),2.0,.28,rust,24)
    for a in range(16):
        angle=a*math.tau/16; x,y=1.85*math.cos(angle),1.85*math.sin(angle)
        beam('Gallery rail post',(x,y,12.25),(x,y,13.1),.035,rust)
    torus('Gallery guardrail',(0,0,13.1),1.85,.04,rust)
    cyl('Recovered optic',(0,0,13.25),.72,1.6,light,16)
    for a in range(6):
        angle=a*math.tau/6
        beam('Lantern cage',(.89*math.cos(angle),.89*math.sin(angle),12.3),(.89*math.cos(angle),.89*math.sin(angle),14.35),.065,teal)
    cyl('Lantern cap',(0,0,14.4),1.16,.22,teal)
    beam('Signal mast',(0,0,14.5),(0,0,17),.075,rust)
    beam('Broken receiver arm',(-2.8,0,15.1),(2.4,0,15.1),.07,rust)
    for z in np.arange(2,11,.32): beam('Ladder rung',(-.24,-1.75,z),(.24,-1.75,z),.025,rust)

def publish(name,fn):
    for o in list(bpy.context.scene.objects): bpy.data.objects.remove(o,do_unlink=True)
    random.seed(606+sum(map(ord,name))); fn(); bpy.context.view_layer.update()
    # Join per asset; glTF keeps material surfaces, reducing instance node overhead.
    bpy.ops.object.select_all(action='SELECT'); bpy.context.view_layer.objects.active=bpy.context.selected_objects[0]
    bpy.ops.object.join(); obj=bpy.context.object; obj.name='Coast_'+name.replace('-','_')
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    low=min(v.co.z for v in obj.data.vertices)
    for v in obj.data.vertices: v.co.z-=low
    height=max(v.co.z for v in obj.data.vertices)
    bpy.context.scene.unit_settings.scale_length=1
    folder=PREP/'assets'/('coast.'+name)/'sources'/REV
    assert not folder.exists(), 'Choose a fresh immutable revision: '+str(folder)
    folder.mkdir(parents=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(folder/'master.blend'))
    source=[{'path':str((folder/'master.blend').relative_to(PREP)),'role':'editable_master','sha256':hashlib.sha256((folder/'master.blend').read_bytes()).hexdigest()},
            {'path':str(Path(__file__).relative_to(PREP)),'role':'authoring_script','sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}]
    meta={'production_format':1,'asset_id':'coast.'+name,'revision':REV,'label':'Coastal '+name+' / '+REV,'kind':'prop','animation_mode':'none','placeholder':False,'recipe':'static_blend','source_files':source,'required_outputs':['runtime/model.glb','runtime/descriptor.json','working/export.blend','inspection.json','reimport.json'],'dimensions':{'height_m':height,'radius_m':min(5,max(abs(v.co.x) for v in obj.data.vertices)),'forward':'-Z','up':'+Y','origin':'ground'},'dependencies':[],'attachments':[],'provenance':{'origin':'Original Blender mesh and deterministic baked maps authored for Dusk plan 06.','attribution':'Dusk original; no third-party code, models, textures, or service acquisition.','visual_reference':'Original Chronoforge Haventide imagery viewed for coastal material and color identity only.'}}
    (folder.parents[1]/'asset.json').write_text(json.dumps(meta,indent=2)+'\n')

for name,fn in [('seawall',seawall),('arch',arch),('bollard',bollard),('supplies',supplies),('rocks',rocks),('grass',grass),('bridge',bridge),('tower',tower)]:
    if not NAMES or name in NAMES: publish(name,fn)
