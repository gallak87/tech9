"""Original seated ventral service insert for Ravel's retained loom carrier.
Blender --background --factory-startup --python build_ventral_service_insert.py [-- --render]
The addon uses the carrier's exact metre coordinates, +Y up and +Z bow.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import bpy
import bmesh
from mathutils import Vector

HERE = Path(__file__).resolve().parent
GAME = HERE.parents[3]
OUT = GAME / 'public/assets/levels/ravel/ventral-service-insert.glb'
BLEND = HERE / 'ravel-ventral-service-insert.blend'
TEMP = GAME / '.experiments/ravel-ventral-service-insert'
NAME = 'loom_carrier_ventral_service_insert'
parser = argparse.ArgumentParser()
parser.add_argument('--render', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for m in list(bpy.data.materials):
    bpy.data.materials.remove(m)


def xyz(p):
    return Vector((p[0], -p[2], p[1]))


def material(name, color, metal, rough):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if name.startswith('Ceramic'):
        p.inputs['Coat Weight'].default_value = .32
        p.inputs['Coat Roughness'].default_value = .23
    return m


# Exact retained anchor-fleet scalar recipes allow runtime material aliasing.
M = {
    'ivory': material('Ceramic / warm ivory', (.67, .63, .51), .12, .29),
    'graphite': material('Graphite / structural carbon', (.022, .035, .042), .5, .38),
    'titanium': material('Titanium / formed fittings', (.38, .44, .45), .82, .26),
    'copper': material('Copper / heat and tension hardware', (.44, .205, .09), .78, .32),
    'void': material('Interior / deep graphite', (.007, .012, .017), .12, .68),
}
collection = bpy.data.collections.new('Source / ' + NAME)
bpy.context.scene.collection.children.link(collection)
source = bpy.data.objects.new('SOURCE__' + NAME, None)
collection.objects.link(source)
source['prototype'] = NAME
source['attachment'] = 'Identity relative to loom_carrier; native game metres.'
anchors = []


def own(o, name, key):
    o.name = NAME + ' / ' + name
    o.parent = source
    o.data.materials.append(M[key])
    for old in list(o.users_collection):
        old.objects.unlink(o)
    collection.objects.link(o)
    return o


def bevel(o, amount):
    if amount:
        modifier = o.modifiers.new('Formed edge radius', 'BEVEL')
        modifier.width = amount
        modifier.segments = 1
        modifier.limit_method = 'ANGLE'
        modifier.angle_limit = math.radians(30)
        normal = o.modifiers.new('Weighted manufactured normals', 'WEIGHTED_NORMAL')
        normal.keep_sharp = True
    return o


def mesh(name, positions, faces, key, edge=0):
    g = bpy.data.meshes.new(name)
    g.from_pydata([xyz(p) for p in positions], [], faces)
    g.update()
    bm = bmesh.new()
    bm.from_mesh(g)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(g)
    bm.free()
    o = bpy.data.objects.new(name, g)
    collection.objects.link(o)
    own(o, name, key)
    return bevel(o, edge)


def box(name, center, size, key, edge=.15):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(center))
    o = bpy.context.object
    o.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    own(o, name, key)
    return bevel(o, min(edge, min(size) * .2))


def beam(name, a, b, width, depth, key, edge=0):
    start, end = xyz(a), xyz(b)
    delta = end - start
    bpy.ops.mesh.primitive_cube_add(size=1, location=(start + end) / 2)
    o = bpy.context.object
    o.dimensions = (width, depth, delta.length)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = delta.to_track_quat('Z', 'Y')
    own(o, name, key)
    return bevel(o, edge)


def cylinder(name, a, b, radius, key, segments=16):
    start, end = xyz(a), xyz(b)
    delta = end - start
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=radius, depth=delta.length, location=(start + end) / 2)
    o = bpy.context.object
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = delta.to_track_quat('Z', 'Y')
    own(o, name, key)
    for face in o.data.polygons:
        face.use_smooth = len(face.vertices) == 4
    return o


def octagon(x, z, w, length, corner):
    return [(x-w+corner,z-length),(x+w-corner,z-length),
            (x+w,z-length+corner),(x+w,z+length-corner),
            (x+w-corner,z+length),(x-w+corner,z+length),
            (x-w,z+length-corner),(x-w,z-length+corner)]


def chamber_ring(name, x, z, width, length, back, front, inner_width, inner_length, key, edge=.2):
    # Four non-coplanar contours give a formed surround with a genuine hole.
    profiles = [
        (back,width/2-.7,length/2-1.1),
        (front,width/2,length/2),
        (front,inner_width/2,inner_length/2),
        (back,inner_width/2+.6,inner_length/2+.8),
    ]
    points = []
    for y,w,l in profiles:
        corner = min(3.6, w*.24, l*.2)
        points += [(px,y,pz) for px,pz in octagon(x,z,w,l,corner)]
    faces = []
    for row in range(4):
        for j in range(8):
            faces.append((row*8+j,row*8+(j+1)%8,((row+1)%4)*8+(j+1)%8,((row+1)%4)*8+j))
    return mesh(name, points, faces, key, edge)


def service_bay(x, z, length, back, front, ribs):
    chamber_ring('formed open ventral bay surround', x,z,34,length,back,front,23,length-14,'ivory',.35)
    chamber_ring('machined inset retaining lip', x,z,25.4,length-11.6,front+.6,front-.45,22.2,length-15.4,'titanium',0)
    # This back plate seats below the old hull skin and is recessed from the lip.
    box('deep service bay back', (x,back-.5,z), (22,.8,length-15.6), 'void', .12)
    for i in range(ribs):
        rz = z + (i-(ribs-1)/2)*(length-22)/max(1,ribs)
        beam('open arched bay rib port', (x-11.4,front+.6,rz), (x-3.2,back-1.4,rz),1.45,2.4,'titanium',.16)
        beam('open arched bay rib starboard', (x+11.4,front+.6,rz), (x+3.2,back-1.4,rz),1.45,2.4,'titanium',.16)
        box('seated copper rib saddle',(x,back-2,rz),(7,2.6,3.5),'copper',.3)
    for sx in [-4,4]:
        cylinder('long seated pressure bus',(x+sx,back-2.3,z-length/2+11),(x+sx,back-2.3,z+length/2-11),.78,'copper',12)


for side in [-1,1]:
    x=side*42
    # Unequal service cassettes replace the long, unarticulated beige surface.
    service_bay(x,-84,56,-29.5,-39.5,2)
    service_bay(x,24,144,-29.5,-40.5,4)
    # Existing graphite pads become recessed load-shoe housings, not flat patches.
    for z in [-190,-130,110,175]:
        chamber_ring('formed keel shoe housing',x,z,35,42,-31.2,-40,20.5,25.5,'graphite',.35)
        chamber_ring('ivory skid shoe shoulder',x,z,36.5,43.5,-32.1,-38.4,28.2,35.2,'ivory',.22)
        beam('open shoe retaining bridge',(x-11,-36,z),(x+11,-36,z),2.1,3,'titanium',.18)
        for dx in [-12.2,12.2]:
            box('copper load shoe seated cleat',(x+dx,-37.2,z),(2.8,4.2,7),'copper',.3)

# Three stepped vaults divide the old uninterrupted central keel face.
for z,length,ribs in [(-121,106,2),(-10,100,2),(95,100,2)]:
    chamber_ring('stepped central keel vault',0,z,33,length,-34.5,-45.1,16.8,length-16,'graphite',.35)
    chamber_ring('formed central vault retaining face',0,z,35,length+1.4,-36.8,-44.5,26,length-6.8,'titanium',.2)
    for i in range(ribs):
        rz=z+(i-.5)*length*.44
        beam('open central keel diagonal port',(-8,-43.6,rz-5),(0,-38,rz+3),1.4,2.1,'titanium',.12)
        beam('open central keel diagonal starboard',(8,-43.6,rz-5),(0,-38,rz+3),1.4,2.1,'titanium',.12)
        box('central seated copper drive shoe',(0,-38.6,rz+3),(5.5,2.2,6),'copper',.22)

# A real deep web below each retained crosshead ties both sponsons to the keel.
for z in [-168,136]:
    beam('crosshead lower load chord',(-62,-24.8,z),(62,-24.8,z),3.2,5,'titanium',.25)
    for side in [-1,1]:
        for x in [16,42,60]:
            beam('open crosshead diagonal web',(side*x,-17,z-7),(side*(x-11),-24.8,z),2.1,3.1,'graphite',.18)
        box('crosshead cast copper seat',(side*42,-20.7,z),(10,9.5,10),'copper',.6)

# Broad stepped cuffs remain open around all four retained propulsion throats.
for x in [-42,42]:
    for y in [-11,11]:
        points=[]
        profile=[(-224,12.2),(-222,13.3),(-216,12.4),(-215,10.7),(-221,10.4),(-224,11)]
        for axial,radius in profile:
            for j in range(32):
                a=j*math.tau/32
                points.append((x+radius*math.cos(a),y+radius*math.sin(a),axial))
        faces=[]
        for row in range(len(profile)):
            for j in range(32):
                faces.append((row*32+j,row*32+(j+1)%32,((row+1)%len(profile))*32+(j+1)%32,((row+1)%len(profile))*32+j))
        o=mesh('formed open nozzle mounting cuff',points,faces,'titanium')
        for face in o.data.polygons:
            face.use_smooth=True

for name,position in [
    ('aft_crosshead',(0,-17,-168)),('forward_crosshead',(0,-17,136)),
    ('central_keel_seat',(0,-37,-15)),('port_hull_seat',(-42,-28,0)),('starboard_hull_seat',(42,-28,0)),
]:
    anchors.append({'name':name,'position':position,'kind':'attachment'})
    o=bpy.data.objects.new('SOURCE__'+name,None)
    collection.objects.link(o)
    o.parent=source
    o.location=xyz(position)

scene=bpy.context.scene
scene.unit_settings.system='METRIC'
scene.unit_settings.scale_length=1
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))

# Export copies are consolidated by scalar material, leaving source modifiers intact.
root=bpy.data.objects.new(NAME,None)
scene.collection.objects.link(root)
root['assetKind']='ravel-seated-ventral-service-insert'
root['attachmentPrototype']='loom_carrier'
root['attachmentMatrix']='identity'
dg=bpy.context.evaluated_depsgraph_get()
batches={}
for obj in list(source.children_recursive):
    if obj.type!='MESH':
        continue
    g=bpy.data.meshes.new_from_object(obj.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg)
    copy=bpy.data.objects.new('EXPORT__'+obj.name,g)
    scene.collection.objects.link(copy)
    copy.matrix_world=obj.matrix_world.copy()
    copy.parent=root
    batches.setdefault(obj.data.materials[0].name,[]).append(copy)
triangles=0
batch_stats=[]
for name,objects in batches.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1:
        bpy.ops.object.join()
    o=bpy.context.object
    o.name=NAME+'__'+name.split('/')[0].strip().lower()+'_'+name.split('/')[-1].strip().replace(' ','_')
    o.data.calc_loop_triangles()
    count=len(o.data.loop_triangles)
    triangles+=count
    batch_stats.append({'material':name,'triangles':count})
for item in anchors:
    o=bpy.data.objects.new(NAME+'__'+item['name'],None)
    scene.collection.objects.link(o)
    o.parent=root
    o.location=xyz(item['position'])
    o['anchorKind']=item['kind']
bpy.context.view_layer.update()
points=[obj.matrix_world@v.co for obj in root.children_recursive if obj.type=='MESH' for v in obj.data.vertices]
points=[(p.x,p.z,-p.y) for p in points]
low=[min(p[k] for p in points) for k in range(3)]
high=[max(p[k] for p in points) for k in range(3)]
assert triangles<=15000,(triangles,'triangle budget')
assert low[1]>=-47,(low,'maximum10m drop below retained central keel')
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for obj in root.children_recursive:
    obj.select_set(True)
OUT.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False,export_animations=False,export_materials='EXPORT',export_yup=True)

if args.render:
    for obj in source.children_recursive:
        obj.hide_render=True
    bpy.ops.import_scene.gltf(filepath=str(GAME/'public/assets/levels/ravel/anchor-fleet.glb'))
    # Keep only the original carrier as a seating reference in this review.
    for name in ['anchor_cutter','tension_spindle']:
        other=bpy.data.objects.get(name)
        if other:
            other.hide_render=True
            for obj in other.children_recursive:
                obj.hide_render=True
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.035,.045,.065,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
    def area(name,position,power,size,color):
        d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
        o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=xyz(position)
        o.rotation_euler=(xyz((0,-25,-5))-o.location).to_track_quat('-Z','Y').to_euler()
    area('warm underside key',(30,-170,-170),2200000,180,(1,.78,.55))
    area('cool structural fill',(-180,-100,70),1800000,150,(.55,.73,1))
    area('bow rim',(150,80,130),1400000,130,(1,.85,.65))
    d=bpy.data.cameras.new('Ventral assembly review')
    cam=bpy.data.objects.new('Ventral assembly review',d);scene.collection.objects.link(cam)
    cam.location=xyz((175,-310,-345));cam.rotation_euler=(xyz((0,-20,-10))-cam.location).to_track_quat('-Z','Y').to_euler()
    d.type='ORTHO';d.ortho_scale=490;scene.camera=cam
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16
    scene.render.threads_mode='FIXED';scene.render.threads=2
    scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
    TEMP.mkdir(parents=True,exist_ok=True)
    scene.render.filepath=str(TEMP/'ventral-service-review.png')
    bpy.ops.render.render(write_still=True)

sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
provenance={
    'generator':'Original project-authored editable Blender geometry; no external models/textures',
    'coordinates':'Metres,+Yup,+Zbow; identity relative to retained loom_carrier',
    'source':Path(__file__).name,'blend':BLEND.name,'runtimeAsset':'public/assets/levels/ravel/'+OUT.name,
    'attachmentPrototype':'loom_carrier','attachmentMatrix':[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
    'design':'Unequal recessed ventral service bays, open load ribs, formed skid shoes, stepped central keel vaults and open nozzle mounting cuffs, seated over original undersides.',
    'originalAsset':{'file':'public/assets/levels/ravel/anchor-fleet.glb','sha256':sha(GAME/'public/assets/levels/ravel/anchor-fleet.glb')},
    'originalBuilder':{'file':'assets/levels/ravel/blender/build_anchor_fleet.py','sha256':sha(HERE/'build_anchor_fleet.py')},
    'racingReferences':[
        {'view':'Sundiver approach','description':'Production chase camera during the grounded approach; the launch carrier ventral sponsons and keel occupy the left middle distance.'},
        {'view':'Sundiver lip','description':'Production chase camera immediately before launch; the carrier underside fills the left foreground and exposes the broad keel pads.'},
        {'view':'Sundiver takeoff','description':'Carried production flight camera just after actual ballistic release; the close ventral bays, central keel and receiving installation remain visible.'},
    ],
    'referenceImages':[
        {'file':'assets/levels/ravel/reference/'+name,'sha256':sha(HERE.parent/'reference'/name)}
        for name in ['sail-basin-selected-crop.png','ravel-anchor-narrows-concept.png']
    ],
    'prototype':NAME,'triangles':triangles,'materialBatches':len(batches),'batches':batch_stats,
    'bounds':{'min':low,'max':high},'dimensions':[high[k]-low[k] for k in range(3)],
    'maxDropBelowOriginalKeel':-37-low[1],'anchors':anchors,
    'materials':[m.name for m in M.values()],
    'hashes':{Path(__file__).name:sha(Path(__file__)),BLEND.name:sha(BLEND),OUT.name:sha(OUT)},
}
(HERE/'ventral-service-insert-provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
print('RAVEL_VENTRAL_SERVICE_INSERT '+json.dumps({'triangles':triangles,'bounds':provenance['bounds'],'materialBatches':len(batches),'batches':batch_stats}))
