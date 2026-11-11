"""Original Sunvault civic load-bearing kit. Blender background authoring.

Run from the game root:
  blender --background --python assets/levels/freestyle-oriel/build_civic_works.py

Authoring uses Blender Z-up; the exported prototypes use glTF +Y up, +X lateral,
+Z forward. All export roots remain identity transforms. Editable source pieces
are retained in the blend alongside the consolidated runtime material batches.
"""
import bpy
import bmesh
import hashlib
import json
import math
from pathlib import Path
from mathutils import Vector

HERE = Path(__file__).resolve().parent
APP = HERE.parents[2]
EXPORT = APP / 'public/assets/levels/freestyle-oriel/sunvault-civic-works.glb'
BLEND = HERE / 'sunvault-civic-works.blend'
HERE.mkdir(parents=True, exist_ok=True)
EXPORT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for data in list(bpy.data.collections):
    if data.name != 'Collection':
        bpy.data.collections.remove(data)
scene = bpy.context.scene
scene.name = 'Sunvault / original civic load paths'
scene.unit_settings.system = 'METRIC'
source_collection = bpy.data.collections.new('EDITABLE / source architectural components')
runtime_collection = bpy.data.collections.new('RUNTIME / material-consolidated prototypes')
scene.collection.children.link(source_collection)
scene.collection.children.link(runtime_collection)


def material(name, color, roughness, metalness=0):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    shader = result.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metalness
    return result


STONE = material('WarmLimestone', (.74, .66, .51), .76)
RECESS = material('coolrecess', (.115, .19, .19), .83)
BRONZE = material('agedbronze', (.39, .25, .115), .47, .65)
MATERIALS = [STONE, RECESS, BRONZE]
roots, pieces = {}, {}


def begin(name):
    root = bpy.data.objects.new('SOURCE / ' + name, None)
    source_collection.objects.link(root)
    root['prototype'] = name
    roots[name], pieces[name] = root, []
    return name


def own(category, obj, mat=STONE):
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    source_collection.objects.link(obj)
    obj.parent = roots[category]
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    pieces[category].append(obj)
    return obj


def apply_bevel(obj, width=.35):
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new('modest formed stone arris', 'BEVEL')
    modifier.width = width
    modifier.segments = 1
    modifier.affect = 'EDGES'
    modifier.limit_method = 'ANGLE'
    modifier.angle_limit = .3
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def box(category, name, center, size, mat=STONE, bevel=.35):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    own(category, obj, mat)
    if bevel:
        apply_bevel(obj, min(bevel, min(size) * .16))
    return obj


def mesh(category, name, verts, faces, mat=STONE):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    source_collection.objects.link(obj)
    return own(category, obj, mat)


def profile(width, depth, groove=0):
    x, y, c = width / 2, depth / 2, min(4, width * .055)
    if not groove:
        return [(-x+c,-y),(x-c,-y),(x,-y+c),(x,y-c),
                (x-c,y),(-x+c,y),(-x,y-c),(-x,-y+c)]
    s = min(width, depth) * .13
    return [(-x+c,-y),(-s,-y),(-s,-y+groove),(s,-y+groove),(s,-y),(x-c,-y),
            (x,-y+c),(x,-s),(x-groove,-s),(x-groove,s),(x,s),(x,y-c),
            (x-c,y),(s,y),(s,y-groove),(-s,y-groove),(-s,y),(-x+c,y),
            (-x,y-c),(-x,s),(-x+groove,s),(-x+groove,-s),(-x,-s),(-x,-y+c)]


def loft(category, name, levels, mat=STONE, groove=0, bevel=.35):
    vertices = [(x, y, z) for z, width, depth in levels for x, y in profile(width, depth, groove)]
    count = len(profile(levels[0][1], levels[0][2], groove))
    faces = [tuple(reversed(range(count)))]
    for layer in range(len(levels)-1):
        for i in range(count):
            j = (i+1) % count
            faces.append((layer*count+i,layer*count+j,(layer+1)*count+j,(layer+1)*count+i))
    faces.append(tuple((len(levels)-1)*count+i for i in range(count)))
    obj = mesh(category, name, vertices, faces, mat)
    if groove:
        obj.data.materials.append(RECESS)
        for layer in range(len(levels)-1):
            for edge in (2, 8, 14, 20):
                obj.data.polygons[1 + layer*count + edge].material_index = 1
    if bevel:
        apply_bevel(obj, bevel)
    return obj


def collar(category, name, width, depth, base, height, thickness=1.35, groove=0):
    outer = profile(width, depth, groove)
    inner = profile(width-thickness*2, depth-thickness*2, max(0,groove-thickness*.25))
    n = len(outer)
    verts = [(x,y,z) for z in (base,base+height) for loop in (outer,inner) for x,y in loop]
    faces = []
    for i in range(n):
        j=(i+1)%n
        faces += [(i,j,2*n+j,2*n+i),(n+i,3*n+i,3*n+j,n+j),
                  (i,n+i,n+j,j),(2*n+i,2*n+j,3*n+j,3*n+i)]
    return mesh(category,name,verts,faces,BRONZE)


def empty(root, name, location):
    obj=bpy.data.objects.new(name,None)
    runtime_collection.objects.link(obj)
    obj.parent=root
    obj.location=location
    obj.empty_display_size=8
    return obj


def anchor_pier():
    cat=begin('anchor_pier')
    loft(cat,'broad closed founded mineral foot',[(0,110,130),(12,110,130),(16,104,124)])
    loft(cat,'second stepped load course',[(16,104,124),(33,104,124),(37,96,112)])
    loft(cat,'deep plinth shoulder',[(37,96,112),(65,96,108)])
    levels=[(65,96,108),(110,90,102),(310,78,90),(620,65,77),(925,55,64),(946,55,64)]
    loft(cat,'continuous tapered buttress with four deep vertical service channels',levels,groove=6.5,bevel=.6)
    for sx in (-1,1):
        for sy in (-1,1):
            buttress=loft(cat,'corner load buttress to engaged shaft',[(50,18,22),(90,18,22),(235,11,15),(310,7,11)],bevel=.5)
            buttress.location=(sx*37,sy*43,0)
    for height,width,depth in [(108,93,105),(308,81,93),(618,68,80),(923,58,67)]:
        collar(cat,'formed bronze compression collar',width,depth,height,3.2,1.2,6.5)
    loft(cat,'head load spreader',[(946,55,64),(959,62,65),(979,62,65)])
    loft(cat,'closed top bearing cap',[(979,65,65),(998,65,65),(1000,63,63)],bevel=.45)
    # The metal is a real sleeve: its outer faces must stand proud of the65m
    # cap, not compete with exactly coplanar limestone faces in the depth test.
    collar(cat,'upper head bearing bronze return',67,67,979.8,2.2,1.2)


def arch_cutter(category, center_x, face_y, spring, radius, depth):
    # A true through opening: rectilinear springing with a12-segment stone arch.
    outline=[(center_x-radius,11),(center_x+radius,11),(center_x+radius,spring)]
    outline += [(center_x+math.cos(i*math.pi/12)*radius,spring+math.sin(i*math.pi/12)*radius) for i in range(1,13)]
    n=len(outline)
    verts=[(x,face_y+offset,z) for offset in (-depth/2,depth/2) for x,z in outline]
    faces=[tuple(reversed(range(n))),tuple(n+i for i in range(n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(category,'TEMP / real arcade cutting volume',verts,faces)


def arcade_wall(category,name,width,count):
    wall=box(category,name,(0,0,28),(width,12,32),bevel=0)
    pitch=29
    for i in range(count):
        cutter=arch_cutter(category,(i-(count-1)/2)*pitch,0,25,10.5,18)
        bpy.context.view_layer.objects.active=wall
        modifier=wall.modifiers.new('true full-depth arch opening','BOOLEAN')
        modifier.operation='DIFFERENCE'
        modifier.solver='EXACT'
        modifier.object=cutter
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        pieces[category].remove(cutter)
        bpy.data.objects.remove(cutter,do_unlink=True)
    apply_bevel(wall,.28)
    return wall


def arrival_terrace():
    cat=begin('arrival_terrace')
    loft(cat,'closed founded terrace footing',[(0,200,180),(6,200,180),(9,194,174)],bevel=.45)
    loft(cat,'recessed base string course',[(9,194,174),(12,190,170)],bevel=.3)
    box(cat,'continuous recessed mineral gallery core',(0,0,28),(157,137,32),RECESS,.6)
    for side in (-1,1):
        front=arcade_wall(cat,'open long-face civic arcade',188,6)
        front.location.y=side*78
        end=arcade_wall(cat,'open return-face civic arcade',168,5)
        end.rotation_euler.z=math.pi/2
        end.location.x=side*88
    # The feet and vaults connect to a continuous gallery floor and closed
    # cornice. The back wall sits ten+ metres behind the outer arcade face.
    loft(cat,'continuous closed gallery roof and substantial cornice',[(43.5,190,170),(47,194,174),(48,190,170)],bevel=.35)
    collar(cat,'formed aged-bronze coping return',194,174,46.1,1.1,1.15)
    loft(cat,'upper civic court foundation',[(48,170,150),(53.5,170,150),(54,169,149)],bevel=.28)
    # Unequal shallow engaged returns read as architecture in close arrival
    # views, without adding a row of unconnected decoration boxes.
    for x in (-86,86):
        for y in (-76,76):
            box(cat,'closed corner pier and vault return',(x,y,28),(16,16,32),STONE,.38)


def arch_ring(category,name,x,y,spring,inner,outer,depth):
    count=16
    verts=[]
    for offset in (-depth/2,depth/2):
        for radius in (inner,outer):
            for i in range(count+1):
                angle=i*math.pi/count
                verts.append((x+math.cos(angle)*radius,y+offset,spring+math.sin(angle)*radius))
    stride=count+1
    faces=[]
    for i in range(count):
        a=i;b=stride+i;c=2*stride+i;d=3*stride+i
        faces += [(a,a+1,b+1,b),(c,d,d+1,c+1),(a,c,c+1,a+1),(b,b+1,d+1,d)]
    faces += [(0,stride,3*stride,2*stride),(count,2*stride-1,4*stride-1,3*stride-1)]
    obj=mesh(category,name,verts,faces,STONE)
    apply_bevel(obj,.18)
    return obj


def load_cradle():
    cat=begin('load_cradle')
    loft(cat,'closed road-keel bearing cap',[(-9.5,64,36),(-4.2,64,36),(-3.5,62.6,34.6)],bevel=.24)
    for axial in (-12,12):
        arch_ring(cat,'transverse stone compression arch with real negative space',0,axial,-42,25.5,32.5,7)
    for side in (-1,1):
        foot=loft(cat,'closed outboard strut-bearing buttress',[(-56,8,36),(-52,8,36),(-40,7,34)],bevel=.2)
        foot.location.x=side*33
        box(cat,'outboard bronze strut socket',(side*36.2,0,-48),(1.6,19,10),BRONZE,.15)
        box(cat,'deep keel-to-arch corner load return',(side*27.4,0,-20),(5.2,36,26),STONE,.2)
    box(cat,'recessed connected axial bearing spine',(0,0,-10.7),(12,28,3.2),RECESS,.18)


anchor_pier()
arrival_terrace()
load_cradle()


def unwrap(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.1519,island_margin=.012)
    bpy.ops.object.mode_set(mode='OBJECT')


runtime_roots=[]
for category,objects in pieces.items():
    root=bpy.data.objects.new(category,None)
    runtime_collection.objects.link(root)
    runtime_roots.append(root)
    # Keep editable components intact, merging only new evaluated copies.
    by_role={material.name:[] for material in MATERIALS}
    for original in objects:
        depsgraph=bpy.context.evaluated_depsgraph_get()
        data=bpy.data.meshes.new_from_object(original.evaluated_get(depsgraph))
        bm=bmesh.new();bm.from_mesh(data)
        bmesh.ops.transform(bm,matrix=original.matrix_world,verts=list(bm.verts))
        # One output batch per material role, including the actual recessed
        # channel faces assigned on the stone core.
        for index,mat in enumerate(data.materials):
            role=bm.copy()
            remove=[face for face in role.faces if face.material_index!=index]
            bmesh.ops.delete(role,geom=remove,context='FACES')
            if role.faces:
                bmesh.ops.recalc_face_normals(role,faces=list(role.faces))
                out=bpy.data.meshes.new(category+' / '+mat.name)
                role.to_mesh(out)
                out.materials.append(mat)
                for polygon in out.polygons: polygon.material_index=0
                obj=bpy.data.objects.new(category+' / '+mat.name,out)
                runtime_collection.objects.link(obj)
                by_role[mat.name].append(obj)
            role.free()
        bm.free();bpy.data.meshes.remove(data)
    for name,batch in by_role.items():
        if not batch: continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in batch: obj.select_set(True)
        bpy.context.view_layer.objects.active=batch[0]
        bpy.ops.object.join()
        obj=bpy.context.object
        obj.name=category+'__'+name
        obj.parent=root
        unwrap(obj)
        # Architectural faces remain flat; bevel facets carry controlled edge
        # highlights. No auto-smooth modifier or baked normal dependency.
        for polygon in obj.data.polygons: polygon.use_smooth=False
    if category=='anchor_pier': empty(root,'pier_head',(0,0,1000))
    if category=='arrival_terrace': empty(root,'terrace_top',(0,0,54))
    if category=='load_cradle':
        empty(root,'cradle_end_port',(-37,0,-48))
        empty(root,'cradle_end_starboard',(37,0,-48))

source_collection.hide_render=True
source_collection.hide_viewport=True
bpy.ops.object.select_all(action='DESELECT')
for root in runtime_roots:
    root.select_set(True)
    for child in root.children_recursive: child.select_set(True)
bpy.context.view_layer.objects.active=runtime_roots[0]
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,
                          export_yup=True,export_apply=True,export_materials='EXPORT',
                          export_normals=True,export_texcoords=True,export_cameras=False,
                          export_lights=False,export_animations=False)


def glb_manifest(path):
    data=path.read_bytes()
    document=json.loads(data[20:20+int.from_bytes(data[12:16],'little')])
    nodes=document.get('nodes',[])
    meshes=document.get('meshes',[])
    accessors=document.get('accessors',[])
    prototypes=[]
    for name in ('anchor_pier','arrival_terrace','load_cradle'):
        root=next(node for node in nodes if node.get('name')==name)
        stack=list(root.get('children',[]))
        minimum=[math.inf]*3;maximum=[-math.inf]*3;triangles=0;batches=0;sockets=[]
        while stack:
            node=nodes[stack.pop()]
            stack.extend(node.get('children',[]))
            if 'mesh' not in node:
                sockets.append({'name':node.get('name'),'position':node.get('translation',[0,0,0])})
                continue
            for primitive in meshes[node['mesh']]['primitives']:
                accessor=accessors[primitive['attributes']['POSITION']]
                for i in range(3):
                    minimum[i]=min(minimum[i],accessor['min'][i])
                    maximum[i]=max(maximum[i],accessor['max'][i])
                triangles+=accessors[primitive['indices']]['count']//3 if 'indices' in primitive else accessor['count']//3
                batches+=1
        prototypes.append({'name':name,'bounds':{'min':minimum,'max':maximum},'triangles':triangles,'materialBatches':batches,'sockets':sockets})
    return prototypes


prototypes=glb_manifest(EXPORT)
budgets={'anchor_pier':6000,'arrival_terrace':14000,'load_cradle':4000}
for item in prototypes:
    assert item['triangles']<=budgets[item['name']],item
    assert item['materialBatches']<=3,item
cradle=next(item for item in prototypes if item['name']=='load_cradle')
assert cradle['bounds']['max'][1]<=-3.4,cradle
manifest={
    'title':'Sunvault / original founded civic construction kit',
    'coordinates':'glTF metres; +Y up, +X lateral, +Z forward; identity prototype roots',
    'source':'build_civic_works.py','blend':BLEND.name,
    'runtimeAsset':'public/assets/levels/freestyle-oriel/sunvault-civic-works.glb',
    'rights':'Original project-authored Blender geometry and scalar PBR materials; no third-party assets or baked lighting.',
    'reference':'../oriel/reference/oriel-original.png',
    'referencePrompt':'../oriel/reference/original-prompt.txt',
    'direction':'Sunvault course-local load paths and deep civic arcades; original Oriel reference style, approved driving/jump geometry unchanged.',
    'materials':[mat.name for mat in MATERIALS],
    'prototypes':prototypes,
    'hashes':{path.name:hashlib.sha256(path.read_bytes()).hexdigest() for path in (Path(__file__),BLEND,EXPORT)},
}
(HERE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('SUNVAULT_EXPORT '+json.dumps(prototypes))
