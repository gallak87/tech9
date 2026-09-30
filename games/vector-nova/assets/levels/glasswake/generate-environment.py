"""Glasswake Comet authored scene family. Run in Blender 4+ background CPU mode.
Coordinate inputs use game X/Y/Z; conversion below preserves metre scale in glTF.
Selected scene-reference.png is the visual source; no raster pixels ship at runtime.
"""
import bpy, math, random, json, os
from mathutils import Vector
ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(ROOT, '../../../public/assets/levels/glasswake'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
random.seed(91052)

def mat(name, color, rough=.65, metal=.04, emission=None):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metal
    if emission:
        p.inputs['Emission Color'].default_value=(*emission,1)
        p.inputs['Emission Strength'].default_value=.75
    return m
M={
 'core': mat('Cobalt buried blue-black core',(.035,.075,.145),.87),
 'blue': mat('Blue compact ice planes',(.085,.235,.39),.52,.12),
 'ice': mat('Pale fractured wind-polished ice',(.39,.65,.76),.44,.06),
 'frost':mat('Opaque frost crust',(.69,.83,.86),.83),
 'dark':mat('Trapped meteoric inclusion',(.026,.034,.055),.4,.42),
 'glow':mat('Deep cavity fracture light',(.10,.44,.66),.38,.04,(.09,.57,.8)),
 'edge':mat('Fresh fracture blue edges',(.19,.5,.69),.39,.14),
 'metal':mat('Titanium collars',(.11,.20,.26),.28,.7),
 'warm':mat('Warm navigation ceramic',(.9,.72,.42),.45,.1,(1,.62,.21)),
}
def b(v): return (v[0],-v[2],v[1])
def mesh(name, verts, faces, mats, mids=None):
    d=bpy.data.meshes.new(name); d.from_pydata([b(v) for v in verts],[],faces); d.update()
    o=bpy.data.objects.new(name,d); bpy.context.collection.objects.link(o)
    for m in mats: d.materials.append(M[m])
    if mids:
        for p,i in zip(d.polygons,mids): p.material_index=i
    return o

def slab(name,w,d,h,seed=1,center=(0,0,0),levels=5):
    """Fracture massif: stratified convex footprint, no spikes or sphere silhouettes."""
    r=random.Random(seed); n=12
    # Chamfered rectangle with asymmetric broken corners.
    ring=[(-.8,-1),(-.1,-1),( .66,-1),(1,-.73),(1,-.1),(1,.67),(.72,1),(.05,1),(-.7,1),(-1,.73),(-1,.1),(-1,-.68)]
    verts=[]
    bands=[]
    for j in range(levels):
        v=j/(levels-1); scale=1.0+r.uniform(-.085,.06)
        bands.append(v)
        for i,(x,z) in enumerate(ring):
            y=(-.5+v)*h + r.uniform(-.065,.065)*h
            verts.append((center[0]+x*w*.5*scale+r.uniform(-.025,.025)*w,center[1]+y,center[2]+z*d*.5*scale+r.uniform(-.025,.025)*d))
    faces=[]; mids=[]
    faces.append(tuple(reversed(range(n)))); mids.append(0)
    for j in range(levels-1):
        for i in range(n):
            a=j*n+i; bb=j*n+(i+1)%n; c=(j+1)*n+(i+1)%n; e=(j+1)*n+i
            if (i+j)%3==0:
                faces.extend([(a,bb,e),(bb,c,e)]); mids.extend([min(2,j//2),min(2,j//2)])
            else: faces.append((a,bb,c,e)); mids.append(min(2,j//2))
    faces.append(tuple((levels-1)*n+i for i in range(n))); mids.append(3)
    return mesh(name,verts,faces,['core','blue','ice','frost'],mids)

def box(name,center,scale,material):
    x,y,z=center; a,c,d=[v*.5 for v in scale]
    verts=[(x+sx*a,y+sy*c,z+sz*d) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    return mesh(name,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(2,3,7,6),(1,2,6,5),(0,4,7,3)],[material])

def beam(name,p,q,radius,material,sides=6):
    axis=Vector(q)-Vector(p); axis.normalize(); other=axis.cross(Vector((0,1,0)))
    if other.length<.01: other=axis.cross(Vector((1,0,0)))
    other.normalize(); up=axis.cross(other).normalized(); verts=[]
    for pos in [Vector(p),Vector(q)]:
        for i in range(sides):
            a=i*math.tau/sides; verts.append(tuple(pos+radius*(math.cos(a)*other+math.sin(a)*up)))
    faces=[tuple(reversed(range(sides))),tuple(sides+i for i in range(sides))]
    faces += [(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
    return mesh(name,verts,faces,[material])

def join(prefix,name):
    obs=[o for o in bpy.context.scene.objects if o.name.startswith(prefix)]
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:o.select_set(True)
    bpy.context.view_layer.objects.active=obs[0]; bpy.ops.object.join(); obs[0].name=name
    return obs[0]

# Three stratified forms and one thin shelf define reusable geology rather than a shard forest.
for i,(w,d,h) in enumerate([(90,94,168),(120,80,128),(86,124,194)]):
    slab('cliff_'+str(i),w,d,h,17+i,center=(0,-h*.5,0),levels=7)
slab('rubble_shelf',64,82,38,37,center=(0,-19,0),levels=5)
slab('far_fragment',320,250,215,66,levels=7)
# Cavern roof transverse plates, piers and cut-back curtains are separate for real apertures.
slab('cave_roof',150,132,30,91,center=(0,63,0),levels=4)
slab('cave_pier',54,90,112,92,center=(0,6,0),levels=6)
# Layered hanging ice curtain: broad flutes attached to a broken slab.
slab('curtain_base',66,18,58,95,center=(0,18,0),levels=5)
for i in range(9):
    x=-29+i*7.2; h=36+(i*13%29)
    slab('curtain_flute_'+str(i),6.2,9,h,101+i,center=(x,5-h*.25,1+math.sin(i)*3),levels=4)
join('curtain_','ice_curtain')
# Bell vault is a hollow flared 3D ceiling; open lower rim prevents a solid blob over the road.
verts=[]; faces=[]; mids=[]; n=20
for j,(rad,y) in enumerate([(66,0),(59,16),(45,42),(25,57),(13,63)]):
    for i in range(n):
        a=i*math.tau/n; rr=rad*(1+.035*math.sin(i*2.3+j)); verts.append((math.cos(a)*rr,y,math.sin(a)*rr*.85))
for j in range(4):
    for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i));mids.append(1 if (i+j)%4 else 0)
mesh('bell_vault',verts,faces,['blue','ice'],mids)
# Meteor inclusion, multi-part with long readable diagonal facets.
slab('inclusion_body',63,106,100,201,center=(0,25,0),levels=6)
o=bpy.data.objects['inclusion_body'];o.data.materials.clear();o.data.materials.append(M['dark'])
for p in o.data.polygons:p.material_index=0
for i in range(4):
    slab('inclusion_ice_'+str(i),16,100,16,207+i,center=(-30+i*20,11+i*10,0),levels=3)
join('inclusion_','dark_inclusion')
# Engineered bridge arch below the supported portions of Fracture Reach.
for side in [-1,1]:
    for bundle in [-1,0,1]:
        prev=None
        for i in range(13):
            z=-32+i*64/12; yy=-7-38*(1-(z/32)**2)
            p=(side*(12+bundle*.8),yy,z)
            if prev:beam('bridge_member_%d_%d_%d'%(side,bundle,i),prev,p,.55,'ice')
            prev=p
    for z in [-28,-14,0,14,28]:
        y=-7-38*(1-(z/32)**2)
        beam('bridge_rise_%d_%d'%(side,z),(side*12,y,z),(side*12,-3,z),.48,'metal')
for z in [-28,0,28]:beam('bridge_cross_'+str(z),(-13,-6,z),(13,-6,z),.7,'blue')
join('bridge_','bridge_arch')
# Thick separate fracture-landing bedrock with no counterfeit deck over a flight gap.
slab('landing_shelf',56,72,48,401,center=(0,-37,0),levels=5)
# Dock mast: three swept crystalline blades, collars, warm beacon fins.
for i in range(3):
    a=i*math.tau/3;x=math.cos(a)*7;z=math.sin(a)*7
    beam('dock_leg_'+str(i),(x,-18,z),(x*.28,67,z*.28),2.2,'ice',5)
for y in [4,25,48]:
    for i in range(3):
        a=i*math.tau/3;aa=(i+1)*math.tau/3
        beam('dock_ring_%d_%d'%(y,i),(math.cos(a)*7,y,math.sin(a)*7),(math.cos(aa)*7,y,math.sin(aa)*7),.8,'metal')
beam('dock_beacon',(0,63,0),(0,72,0),2.0,'warm',8)
join('dock_','dock_mast')
# Fixed luminous cavern behind the calving face: back wall + floor, ledges and roof.
slab('calving_back',54,432,228,601,center=(91,58,0),levels=7)
slab('calving_roof',140,444,36,602,center=(37,177,0),levels=4)
slab('calving_floor',148,451,45,603,center=(34,-67,0),levels=4)
for j in range(4):
    slab('calving_ledge_'+str(j),55,352-j*29,14,611+j,center=(69,-30+j*43,0),levels=3)
# Back wall fissures and floor veins: real bright facets recessed behind the moving skin.
for j in range(9):
    z=-180+j*45
    beam('cavity_vein_'+str(j),(57,-38,z),(62,142,z+22),1.0,'glow')
for j in range(3):beam('cavity_rib_'+str(j),(43,-30+j*49,-180),(43,-30+j*49,180),1.5,'glow')
# A nine-part front wall, each meshed separately with a broken edge. Runtime poses these only.
for j in range(9):
    z=-188+j*47
    slab('calving_chunk_%02d'%j,48,51,186+(j%3)*11,701+j,center=(-13,55,z),levels=7)
# Fragments separate from the main body, authored fracture family.
for j in range(6):
    slab('calving_chip_%02d'%j,13+j%3*4,18+j*2,24+j%2*13,800+j,center=(-33,30+j*15,-143+j*51),levels=4)
# Helpful .blend inspection scene: organized outliner; runtime instantiation uses named prototypes.
for o in bpy.context.scene.objects:
    if o.type=='MESH':
        # Explicit flat fractured planes avoid unstable smoothed triangle highlights.
        for p in o.data.polygons:p.use_smooth=False
        o['unit']='metres';o['source']='Glasswake selected scene-reference.png'
scene=bpy.context.scene;scene.render.engine='BLENDER_WORKBENCH'
scene.world.color=(.015,.025,.055)
scene['asset_notes']='Named reusable prototypes overlap at origin by design; runtime aligns to route frames.'
scene['reference']='scene-reference.png'
os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'glasswake-environment.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'glasswake-environment.glb'),export_format='GLB',export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False)
manifest={'generator':'generate-environment.py','reference':'scene-reference.png','runtime':'/assets/levels/glasswake/glasswake-environment.glb','units':'metres','meshes':[]}
for o in bpy.context.scene.objects:
    if o.type=='MESH':
        o.data.calc_loop_triangles()
        manifest['meshes'].append({'name':o.name,'vertices':len(o.data.vertices),'triangles':len(o.data.loop_triangles)})
manifest['triangles']=sum(m['triangles'] for m in manifest['meshes'])
manifest['bytes']=os.path.getsize(os.path.join(OUT,'glasswake-environment.glb'))
with open(os.path.join(ROOT,'asset-manifest.json'),'w') as f:json.dump(manifest,f,indent=2)
print('GLASSWAKE_ASSET',json.dumps({'meshes':len(manifest['meshes']),'triangles':manifest['triangles'],'bytes':manifest['bytes']}))
