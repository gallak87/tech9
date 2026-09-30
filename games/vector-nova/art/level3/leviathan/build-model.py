import bpy, math, json, os, random
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
ART = ROOT + '/art/level3/leviathan'
OUT = ROOT + '/public/assets/level3/leviathan'
CAP = ROOT + '/.experiments/gate4-1/leviathan'
for path in [ART, OUT, CAP]: os.makedirs(path, exist_ok=True)
# This script is run with --factory-startup in a new background Blender process.
for obj in list(bpy.data.objects): bpy.data.objects.remove(obj, do_unlink=True)
scene = bpy.context.scene
bpy.context.preferences.filepaths.save_version = 0
scene.unit_settings.system = 'METRIC'
asset = bpy.data.collections.new('Nacre Leviathan / editable source')
scene.collection.children.link(asset)
stage = bpy.data.collections.new('Nacre Leviathan / still review only')
scene.collection.children.link(stage)
LENGTH = 180.0

def material(name, color, roughness, metallic=0, emission=None):
    m = bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=roughness
    p.inputs['Metallic'].default_value=metallic
    if emission:
        p.inputs['Emission Color'].default_value=(*emission,1)
        p.inputs['Emission Strength'].default_value=1.15
    return m

skin=material('Living deep teal / wet hide',(0.016,0.073,0.086),.30,.20)
pearl=material('Nacre / overlapping dorsal shields',(.30,.42,.45),.32,.36)
fin=material('Translucent-looking teal / solid fin membranes',(.025,.135,.16),.43,.16)
glow=material('Cyan living photophores',(.045,.65,.73),.3,.12,(.06,.68,.77))
groove=material('Deep inset / mouth and gills',(.007,.026,.035),.42,.05)
parts={m.name:[] for m in [skin,pearl,fin,glow,groove]}

def mesh(name, verts, faces, mat, collection=asset):
    data=bpy.data.meshes.new(name); data.from_pydata(verts,[],faces); data.update()
    o=bpy.data.objects.new(name,data); collection.objects.link(o)
    data.materials.append(mat)
    for poly in data.polygons: poly.use_smooth=True
    if collection==asset: parts[mat.name].append(o)
    return o

profile=[(0,2.0,1.0),(2,3.9,2.0),(7,6.8,3.8),(14,7.6,4.5),(22,6.7,5.7),(35,6.4,6.6),(52,6.0,6.2),(78,5.3,5.5),(106,4.3,4.6),(135,3.1,3.4),(159,1.8,2.0),(175,.62,.77),(180,.06,.1)]
def radii(x):
    for i in range(len(profile)-1):
        a,b=profile[i],profile[i+1]
        if x<=b[0]:
            t=max(0,min(1,(x-a[0])/(b[0]-a[0]))); t=t*t*(3-2*t)
            return a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t
    return .06,.1
def surface(x, angle, lift=0):
    ry,rz=radii(x)
    return (x,math.sin(angle)*(ry+lift),math.cos(angle)*(rz+lift))

# Dense, even longitudinal rings permit continuous runtime spline deformation.
verts=[]; faces=[]; n=181; radial=32
for i in range(n):
    x=i*LENGTH/(n-1); ry,rz=radii(x)
    for j in range(radial):
        a=2*math.pi*j/radial
        groove_scale=1+(.009*math.cos(x*2.5))*(1 if x>18 else .15)
        verts.append((x,math.sin(a)*ry*groove_scale,math.cos(a)*rz*groove_scale))
for i in range(n-1):
    for j in range(radial):
        a=i*radial+j; b=i*radial+(j+1)%radial
        faces.append((a,a+radial,b+radial,b))
faces += [tuple(range(radial)),tuple((n-1)*radial+j for j in reversed(range(radial)))]
mesh('Continuous ring-topology body',verts,faces,skin)

def ribbon(name, points, width, mat, radial=5):
    verts=[]; faces=[]
    for i,p in enumerate(points):
        p=Vector(p); prev=Vector(points[max(0,i-1)]); nex=Vector(points[min(len(points)-1,i+1)])
        tangent=(nex-prev).normalized(); ref=Vector((0,0,1))
        if abs(tangent.dot(ref))>.94: ref=Vector((0,1,0))
        r=tangent.cross(ref).normalized(); u=tangent.cross(r).normalized()
        for j in range(radial):
            a=j*math.tau/radial; verts.append(p+width*(r*math.cos(a)+u*math.sin(a)))
    for i in range(len(points)-1):
        for j in range(radial):
            a=i*radial+j; b=i*radial+(j+1)%radial
            faces.append((a,b,b+radial,a+radial))
    return mesh(name,verts,faces,mat)

# Sculpted brow shields: a streamlined head, clearly distinct from the body.
for side in [-1,1]:
    v=[(1.2,side*2.6,1.0),(6,side*5.9,3.0),(15,side*6.9,3.8),(22,side*4.8,4.6),(15,side*2.7,5.25),(6,side*1.35,3.3),(11,side*4.0,5.6)]
    f=[(i,(i+1)%6,6) for i in range(6)]
    mesh('Tapered cephalic shield',v,f,pearl)
    pts=[surface(x,side*(1.74+.035*x),.09) for x in [0,2,4,6,8,10,12,14,16,18]]
    ribbon('Long inset mouth seam',pts,.16,groove)
    for x in [20,24,28,32]:
        pts=[surface(x+.6*math.cos(a),side*a,.09) for a in [1.0,1.25,1.5,1.75,2.0,2.2]]
        ribbon('Recessed breathing gill',pts,.13,groove)
        ribbon('Gill rim light',[(p[0]-.32,p[1]*1.005,p[2]) for p in pts],.055,glow,4)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1, location=(8.4,side*6.65,1.35))
    eye=bpy.context.object; eye.name='Small living cyan eye'; eye.scale=(.92,.27,.58)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    for c in list(eye.users_collection): c.objects.unlink(eye)
    asset.objects.link(eye); eye.data.materials.append(glow); parts[glow.name].append(eye)
    for poly in eye.data.polygons: poly.use_smooth=True

# Overlapping plated shields in three offset dorsal rows; scalloped tail points.
for row,a in enumerate([-.73,0,.73]):
    for k in range(20):
        x=25+k*6.7+(3.2 if row!=1 else 0)
        if x>163: continue
        length=8.7 if x<125 else 7.2
        aw=.36 if row else .37
        outline=[(x-length*.46,a-aw*.76),(x-length*.16,a-aw),(x+length*.34,a-aw*.63),(x+length*.61,a),(x+length*.34,a+aw*.63),(x-length*.16,a+aw),(x-length*.46,a+aw*.76)]
        v=[surface(s,t,.21) for s,t in outline]+[surface(x-.5,a,.72)]
        f=[(i,(i+1)%7,7) for i in range(7)]
        mesh('Overlapping dorsal nacre plate',v,f,pearl)

# Flowing low fins, attached continuously rather than free appendages.
for side in [-1,1]:
    v=[]; f=[]; samples=93
    for i in range(samples):
        x=31+i*1.46; t=i/(samples-1); ry,rz=radii(x)
        reach=(2.2+3.8*math.sin(math.pi*t)**.7)*(1-.4*t)
        for j in range(3):
            q=j/2
            v.append((x+q*2.4,side*(ry*.75+reach*q),-rz*.51-q*(1.7+.45*math.sin(x*.55))))
    for i in range(samples-1):
        for j in range(2):
            a=i*3+j; f.append((a,a+1,a+4,a+3))
    mesh('Continuous lateral swimming fringe',v,f,fin)
    for i in range(0,samples,3):
        ribbon('Fine membrane rib',[v[i*3],v[i*3+1],v[i*3+2]],.055,pearl,4)
    ribbon('Cyan low fin margin',[v[i*3+2] for i in range(samples)],.10,glow,5)

# A narrow upright tail blade, broad enough to read at track scale.
v=[]; f=[]
for i in range(31):
    x=142+i*1.24; t=i/30; ry,rz=radii(min(x,180)); h=math.sin(math.pi*t)**1.2*6.5
    v.extend([(x,0,rz*.7),(x+2,0,rz+h)])
for i in range(30): f.append((i*2,i*2+1,i*2+3,i*2+2))
mesh('Low swept dorsal tail blade',v,f,fin)
ribbon('Tail fin luminous edge',[v[i*2+1] for i in range(31)],.095,glow)

for side in [-1,1]:
    for line in [1.25,1.96,2.36]:
        points=[surface(x,side*(line+.075*math.sin(x*.12)),.065) for x in range(13,174)]
        ribbon('Unbroken lateral bioluminescent line',points,.075 if line!=1.96 else .14,glow,4)
rng=random.Random(12943)
for i in range(180):
    x=rng.uniform(23,162); a=rng.choice([-1,1])*rng.uniform(.8,2.4)
    p=Vector(surface(x,a,.095)); r=.07+rng.random()*.08
    v=[p+Vector((r,0,0)),p+Vector((-r,0,0)),p+Vector((0,r*.2,r)),p+Vector((0,-r*.2,-r))]
    mesh('Living photophore',v,[(0,2,1),(0,1,3)],glow)

# Join by material: five meshes / five production draw calls, no image maps.
objects=[]
for name,items in parts.items():
    if not items: continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in items: o.select_set(True)
    bpy.context.view_layer.objects.active=items[0]; bpy.ops.object.join()
    o=bpy.context.object; o.name=name; objects.append(o)
    for v in o.data.vertices:
        v.co.y*=1.13; v.co.z*=1.15
    o.data.update()
    o['rest_axis']='X: head 0 m to tail 180 m; Blender +Z dorsal, +Y port'
    o['runtime_deformation']='Continuous arc-length path with transported normal frame'

# Editable armature is retained in the .blend for artist poses; runtime GLB is
# exported in its neutral rest pose and bent using the same dense source rings.
armdata=bpy.data.armatures.new('Leviathan / 31-station editing rig')
rig=bpy.data.objects.new('Leviathan / editing rig',armdata); asset.objects.link(rig)
bpy.context.view_layer.objects.active=rig; rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for i in range(31):
    b=armdata.edit_bones.new('Spine.%02d'%i); b.head=(i*6,0,0); b.tail=(i*6+6,0,0)
    if i: b.parent=armdata.edit_bones['Spine.%02d'%(i-1)]; b.use_connect=True
bpy.ops.object.mode_set(mode='OBJECT')
rig.show_in_front=True
for o in objects:
    groups=[o.vertex_groups.new(name='Spine.%02d'%i) for i in range(31)]
    for v in o.data.vertices:
        s=max(0,min(29.999,v.co.x/6)); k=int(s); t=s-k
        groups[k].add([v.index],1-t,'REPLACE'); groups[k+1].add([v.index],t,'REPLACE')
    o.parent=rig
    mod=o.modifiers.new('Editable continuous spine','ARMATURE'); mod.object=rig

bpy.ops.object.select_all(action='DESELECT')
for o in objects: o.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
export_path=OUT+'/nacre-leviathan-v1.glb'
bpy.ops.export_scene.gltf(filepath=export_path,export_format='GLB',use_selection=True,export_skins=False,export_animations=False,export_apply=True,export_yup=True)
triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)
report={'lengthMetres':180,'materials':len(objects),'triangles':triangles,'textureCount':0,'vertexCount':sum(len(o.data.vertices) for o in objects),'blenderVersion':bpy.app.version_string,'runtimeAxis':'GLTF +X head-to-tail, +Y dorsal, +Z starboard','glbBytes':os.path.getsize(export_path)}
with open(ART+'/model-manifest.json','w') as f: json.dump(report,f,indent=2)

# Review pose: sculptural full-body side view in a restrained ocean stage.
def point(s):
    x=92-s*.94
    z=-21+107*math.exp(-.5*(x/63)**2)
    y=2*math.sin(s*.027)
    return Vector((x,y,z))
for o in objects:
    o.hide_render=True
    copy=o.copy(); copy.data=o.data.copy(); copy.modifiers.clear(); stage.objects.link(copy); copy.name='REVIEW / '+o.name
    copy.hide_render=False
    for v in copy.data.vertices:
        s=v.co.x; c=point(s); t=(point(s+.05)-point(s-.05)).normalized()
        side=Vector((0,1,0)); up=t.cross(side).normalized()
        if up.z<0: up=-up
        v.co=c+side*v.co.y+up*v.co.z
    copy.data.update()
rig.hide_render=True
sea=material('Review ocean',(.018,.068,.087),.25,.36)
mesh('Review sea plane',[(-1500,-1500,0),(1500,-1500,0),(1500,1500,0),(-1500,1500,0)],[(0,1,2,3)],sea,stage)
world=bpy.data.worlds.new('Overcast review studio') if not scene.world else scene.world
scene.world=world; world.use_nodes=True; world.node_tree.nodes['Background'].inputs[0].default_value=(.21,.30,.37,1); world.node_tree.nodes['Background'].inputs[1].default_value=.7
def area(name,position,energy,size,color):
    data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.shape='DISK'; data.size=size; data.color=color
    o=bpy.data.objects.new(name,data); stage.objects.link(o); o.location=position; o.rotation_euler=(Vector((0,0,40))-o.location).to_track_quat('-Z','Y').to_euler()
area('Large soft key',(-30,-95,150),380000,105,(.67,.83,1))
area('Warm storm break',(80,65,115),480000,90,(1,.86,.67))
area('Cool broad fill',(-120,15,70),160000,85,(.28,.77,1))
camdata=bpy.data.cameras.new('Review camera'); cam=bpy.data.objects.new('Review camera',camdata); stage.objects.link(cam)
cam.location=(148,-255,110); target=Vector((4,0,46)); cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler(); camdata.type='ORTHO'; camdata.ortho_scale=215; scene.camera=cam
scene.render.engine='CYCLES'; scene.cycles.samples=32; scene.cycles.use_denoising=True
scene.render.resolution_x=1400; scene.render.resolution_y=900; scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG'; scene.render.filepath=CAP+'/model-review-v3.png'
scene['design']='One enormous non-hostile aquatic worm. Editable rig + continuous deformation topology. No external maps.'
bpy.ops.wm.save_as_mainfile(filepath=ART+'/nacre-leviathan-v1.blend')
bpy.ops.render.render(write_still=True)
print(json.dumps(report))
