"""Original fitted upper cargo receiver for Nomad's Passing Deck.

Run Blender --background --factory-startup --threads 6 --python <this file>.
Retains individual formed components and bevels; exports one four-material root.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import struct
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent
GAME = HERE.parents[4]
OUT = GAME / 'public/assets/levels/nomad/receiver-crown.glb'
BLEND = HERE / 'receiver-crown.blend'
CONTACTS = HERE / 'receiver-crown-collision.json'
HULL = SOURCE / 'carrier-collision.json'
GUIDES = SOURCE / 'route-support-guides.json'
NAME = 'nomad_receiver_crown'

bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for item in list(bpy.data.materials):
    bpy.data.materials.remove(item)


def xyz(point):
    return Vector((point[0], -point[2], point[1]))


def game(point):
    return Vector((point.x, point.z, -point.y))


def material(name, colour, metal, rough):
    mat = bpy.data.materials.new('Nomad / ' + name)
    mat.diffuse_color = (*colour, 1)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*colour, 1)
    node.inputs['Metallic'].default_value = metal
    node.inputs['Roughness'].default_value = rough
    if name == 'warm ivory armour':
        node.inputs['Coat Weight'].default_value = .12
        node.inputs['Coat Roughness'].default_value = .45
    return mat


M = {
    'ivory': material('warm ivory armour', (.58, .535, .44), .16, .54),
    'navy': material('navy structural steel', (.026, .043, .058), .62, .49),
    'alloy': material('rubbed warm alloy', (.37, .325, .245), .83, .37),
    'oxide': material('oxide freight enamel', (.58, .17, .043), .14, .47),
}
collection = bpy.data.collections.new('Editable formed cargo receiver / Passing Deck')
bpy.context.scene.collection.children.link(collection)
root = bpy.data.objects.new('SOURCE__' + NAME, None)
collection.objects.link(root)
SEATS = []


def attach(obj, name, mat, edge=0):
    obj.name = name
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)
    obj.parent = root
    obj.data.materials.append(M[mat])
    if edge:
        mod = obj.modifiers.new('Formed edge radius', 'BEVEL')
        mod.width = edge
        mod.segments = 2 if edge >= .55 else 1
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(24)
        normal = obj.modifiers.new('Weighted manufactured face normals', 'WEIGHTED_NORMAL')
        normal.keep_sharp = True
    return obj


def mesh(name, points, faces, mat, edge=0):
    data = bpy.data.meshes.new(name)
    data.from_pydata([xyz(point) for point in points], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    return attach(obj, name, mat, edge)


def prism(name, profile, start, end, mat, edge=0):
    points = [(x, y, z) for z in [start, end] for x, y in profile]
    n = len(profile)
    faces = [tuple(range(n - 1, -1, -1)), tuple(n + i for i in range(n))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return mesh(name, points, faces, mat, edge)


def box(name, centre, size, mat, edge=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(centre))
    obj = bpy.context.object
    obj.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return attach(obj, name, mat, edge)


def girder(name, start, end, width, depth, mat, edge=.3):
    a, b = xyz(start), xyz(end)
    delta = b - a
    bpy.ops.mesh.primitive_cube_add(size=1, location=(a + b) / 2)
    obj = bpy.context.object
    obj.dimensions = (width, depth, delta.length)
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = delta.to_track_quat('Z', 'Y')
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return attach(obj, name, mat, edge)


def cylinder(name, start, end, radius, mat, segments=16):
    a, b = xyz(start), xyz(end)
    delta = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=radius,
        depth=delta.length, end_fill_type='NGON', location=(a + b) / 2)
    obj = bpy.context.object
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = delta.to_track_quat('Z', 'Y')
    attach(obj, name, mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return obj


hull_data = json.loads(HULL.read_text())
hull = next(item for item in hull_data['prototypes'] if item['name'] == 'nomad_carrier')
hull_points = [Vector(hull['positions'][i:i + 3]) for i in range(0, len(hull['positions']), 3)]
hull_faces = [hull['indices'][i:i + 3] for i in range(0, len(hull['indices']), 3)]
tree = BVHTree.FromPolygons(hull_points, hull_faces, all_triangles=True)

# Four heavy paired load stations seat on the original closed roof packets.
# The shoes are outside full receiving width plus the camera margin; no false
# supports terminate in air or run across the racing surface.
for side in [-1, 1]:
    for index, z in enumerate([-337, -285, -229, -177]):
        point, normal, triangle, distance = tree.ray_cast(Vector((side * 67.5, 220, z)), Vector((0, -1, 0)), 110)
        assert point is not None and 129 < point.y < 132
        SEATS.append({'name': 'roof seat %s %s' % (side, index),
            'position': list(point), 'normal': list(normal), 'sourceTriangle': triangle})
        box('fitted roof sole %s %s' % (side, index),
            (point.x, point.y + .55, point.z), (7, 1.8, 17), 'alloy', .28)
        top = (side * 106, 155, z)
        girder('splayed cargo shoulder load leg %s %s' % (side, index), point + Vector((0, 1, 0)), top, 7, 10, 'navy', .5)
        girder('longitudinal shoulder triangulation %s %s' % (side, index),
            point + Vector((0, 1, 0)), (side * 106, 155, z + (21 if index < 3 else -21)), 4.5, 6, 'alloy', .35)
        box('seated upper shoulder load head %s %s' % (side, index), top, (19, 7, 16), 'navy', .6)

# Continuous navy longitudinal cores hold the gallery floors and formed armor.
# The entrance flares toward the arrival; unequal panel packets reveal real laps.
for side in [-1, 1]:
    core = [(side * 86, 155), (side * 108, 155), (side * 115, 166),
            (side * 114, 191), (side * 103, 215), (side * 91, 210),
            (side * 91, 180), (side * 86, 177)]
    prism('deep continuous gallery shoulder %s' % side, core, -367, -166, 'navy', .7)
    packets = [(-369, -331), (-328, -276), (-273, -218), (-215, -165)]
    profile = [(side * 98, 158), (side * 110, 159), (side * 118, 173),
               (side * 116, 195), (side * 107, 212), (side * 100, 215),
               (side * 98, 206), (side * 106, 190), (side * 107, 175), (side * 98, 166)]
    for index, (start, end) in enumerate(packets):
        prism('formed outer shoulder armor %s %s' % (side, index), profile, start, end, 'ivory', .7)
        # A formed carrier rim, an actual recessed field and its fitted alloy lip.
        box('outer shoulder recessed lap %s %s' % (side, index),
            (side * 115.4, 184, (start + end) / 2), (.6, 13, end - start - 10), 'navy', .15)
        box('outer lap retaining rail %s %s' % (side, index),
            (side * 116, 191, (start + end) / 2), (.8, .8, end - start - 10), 'alloy', .18)
    # The inside is an inhabited freight-gallery recess, not the back of ivory.
    prism('formed inside gallery shelf %s' % side,
        [(side * 83, 158), (side * 98, 158), (side * 101, 162),
         (side * 100, 165), (side * 83, 165)], -360, -169, 'alloy', .3)
    box('deep gallery upper machine recess %s' % side, (side * 98, 188, -265), (5, 38, 183), 'navy', .5)
    for index, z in enumerate([-344, -291, -236, -183]):
        # Tall fixed ribs tie gallery floor into the upper roof arch seat.
        girder('gallery connected portal post %s %s' % (side, index),
            (side * 90, 164, z), (side * 97, 214, z), 5, 6.5, 'navy', .4)
        for y in [166, 211]:
            box('post formed load collar %s %s %s' % (side, index, y),
                (side * (90.3 if y == 166 else 96.7), y, z), (10, 3, 9), 'alloy', .3)
    for index, (z, length, y) in enumerate([(-320, 25, 179), (-263, 32, 179), (-207, 25, 179)]):
        box('recessed restrained freight body %s %s' % (side, index),
            (side * 94, y, z), (9, 24, length), 'navy', .6)
        box('inset oxide freight face %s %s' % (side, index),
            (side * 89.1, y, z), (.8, 19, length - 4), 'oxide', .25)
        for dz in [-length / 2 + 3, length / 2 - 3]:
            box('freight seated locking bar %s %s' % (side, index),
                (side * 88.5, y, z + dz), (.8, 21, 1.1), 'alloy', .16)
        for dy in [-6, 0, 6]:
            box('formed freight door flute %s %s %s' % (side, index, dy),
                (side * 88.8, y + dy, z), (.8, .7, length - 9), 'oxide', .15)
    # An exposed drive/pulley cassette and attached pressure feeds distinguish
    # this loading crown from another generic roof arch.
    for z in [-349, -185]:
        cylinder('gallery winch drum %s %s' % (side, z),
            (side * 92, 200, z - 7), (side * 92, 200, z + 7), 5.2, 'alloy', 20)
        for dz in [-8, 8]:
            cylinder('winch seated end cheek %s %s %s' % (side, z, dz),
                (side * 92, 200, z + dz - .6), (side * 92, 200, z + dz + .6), 6.1, 'navy', 20)
    for y in [204, 208]:
        cylinder('continuous upper pressure feed %s %s' % (side, y),
            (side * 87, y, -347), (side * 87, y, -182), .8, 'alloy', 12)

# The main opening is a thick formed cargo aperture with deep reveals, not a
# flat goalpost. All central overhead members remain above Y214. The shoulders
# continue into a real enclosed canopy with individually seated roof packets.
outer = [(-108, 157), (-108, 193), (-103, 211), (-84, 223), (-54, 226),
         (54, 226), (84, 223), (103, 211), (108, 193), (108, 157)]
inner = [(84, 157), (84, 199), (80, 216), (54, 218), (-54, 218),
         (-80, 216), (-84, 199), (-84, 157)]
arch_profile = outer + inner
prism('primary formed armored cargo aperture', arch_profile, -370, -347, 'ivory', .8)
# A second dark ring creates a deep stepped portal throat behind the main lip.
navy_outer = [(-102, 162), (-102, 194), (-98, 209), (-80, 220), (-54, 223),
              (54, 223), (80, 220), (98, 209), (102, 194), (102, 162)]
navy_inner = [(85, 162), (85, 199), (81, 217), (54, 219), (-54, 219),
              (-81, 217), (-85, 199), (-85, 162)]
prism('deep recessed cargo throat ring', navy_outer + navy_inner, -347.5, -333, 'navy', .45)
roof_profile = [(-103, 215), (-82, 223), (-54, 226), (54, 226), (82, 223),
                (103, 215), (85, 216.5), (61, 218.6), (-61, 218.6), (-85, 216.5)]
for index, (start, end) in enumerate([(-344, -290), (-287, -230), (-227, -170)]):
    prism('fitted curved upper roof armor %s' % index, roof_profile, start, end, 'ivory', .55)
    # Lower navy cassette sits distinctly below the ivory skin, without
    # coplanar undersides; channels retain substantial physical roof thickness.
    box('recessed roof soffit cassette %s' % index,
        (0, 218.1, (start + end) / 2), (118, 1.8, end - start - 5), 'navy', .35)
    for x in [-43, 0, 43]:
        profile = [(x - 8, 218.8), (x - 8, 216.3), (x - 6, 215.8),
                   (x - 4.5, 217), (x + 4.5, 217), (x + 6, 215.8),
                   (x + 8, 216.3), (x + 8, 218.8)]
        prism('formed navy soffit channel %s %s' % (index, x), profile, start + 3, end - 3, 'navy', .16)
        for edge in [-1, 1]:
            box('soffit channel fitted retaining lip %s %s %s' % (index, x, edge),
                (x + edge * 6.1, 216.2, (start + end) / 2), (.5, .6, end - start - 9), 'alloy', .1)
# Three full structural roof ribs remain connected to side posts and shoulder.
for z in [-344, -289, -231, -174]:
    prism('connected interior curved roof load rib %s' % z, navy_outer + navy_inner,
          z - 2.5, z + 2.5, 'navy', .25)
# Genuine separate maintenance panels on the visible leading arch: sparse,
# substantial fields follow the formed shape instead of a uniform surface grid.
for side in [-1, 1]:
    profile = [(side * 88, 178), (side * 103, 178), (side * 103, 195),
               (side * 99, 207), (side * 88, 202)]
    prism('recessed front formed armor access field %s' % side, profile, -370.8, -370.1, 'navy', .25)
    for z in [-371.4]:
        girder('front access field machined retaining lip %s' % side,
            (side * 88, 178, z), (side * 88, 201, z), 1, 1, 'alloy', .15)
    box('front service oxide identifier plate %s' % side,
        (side * 96, 168, -370.7), (13, 3, 1.2), 'oxide', .2)
# Tapered gallery tails turn back into hull structure; avoid a severed barn end.
for side in [-1, 1]:
    point, normal, triangle, distance = tree.ray_cast(Vector((side * 73, 210, -148)), Vector((0, -1, 0)), 100)
    assert point is not None and 124 < point.y < 134
    SEATS.append({'name': 'aft shoulder tail seat %s' % side,
        'position': list(point), 'normal': list(normal), 'sourceTriangle': triangle})
    # The descending tail enters the real shoulder mass below roof height;
    # its inner corner clears the later banked racing/camera envelope.
    girder('aft gallery descending connected tail %s' % side,
        (side * 99, 179, -170), point - Vector((0, 4, 0)), 8, 12, 'navy', .45)
    girder('aft tail seated ivory shoulder facing %s' % side,
        (side * 104, 179, -170), point + Vector((side * 5, -2, 0)), 4, 11, 'ivory', .35)

# The real interception reaches the receiving carrier diagonally from port.
# Rake the port mouth aft while retaining the starboard arrival shoulder. The
# asymmetric opening is actual formed geometry, not a collision exception. The
# deformation fades completely at Z=-160, preserving the aft hull attachments.
def rake(point):
    amount = max(0, -point.z - 160) * .65
    port = max(0, min(1, (118 - point.x) / 236))
    return Vector((point.x, point.y, point.z + amount * port))


for obj in root.children_recursive:
    if obj.type != 'MESH':
        continue
    obj.data.transform(obj.matrix_world)
    obj.matrix_basis = Matrix.Identity(4)
    for vertex in obj.data.vertices:
        vertex.co = xyz(rake(game(vertex.co)))
    obj.data.update()
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
for seat in SEATS:
    point = rake(Vector(seat['position']))
    actual, normal, triangle, distance = tree.ray_cast(Vector((point.x, 220, point.z)), Vector((0, -1, 0)), 110)
    assert actual is not None and abs(actual.y - point.y) < .02, (seat['name'], list(point), actual)
    seat.update({'position': list(actual), 'normal': list(normal), 'sourceTriangle': triangle})

# Save the editable component assembly before consolidation.
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.context.view_layer.update()
graph = bpy.context.evaluated_depsgraph_get()
export = bpy.data.objects.new(NAME, None)
bpy.context.scene.collection.objects.link(export)
batches, positions, indices, parts = {}, [], [], []
for obj in root.children_recursive:
    if obj.type != 'MESH':
        continue
    data = bpy.data.meshes.new_from_object(obj.evaluated_get(graph), preserve_all_data_layers=True, depsgraph=graph)
    data.transform(obj.matrix_world)
    data.calc_loop_triangles()
    begin, offset = len(indices), len(positions) // 3
    for vertex in data.vertices:
        positions.extend([round(value, 6) for value in game(vertex.co)])
    for tri in data.loop_triangles:
        indices.extend([offset + value for value in tri.vertices])
    parts.append({'name': obj.name, 'indexStart': begin, 'indexCount': len(indices) - begin})
    copy = bpy.data.objects.new('EXPORT__' + obj.name, data)
    bpy.context.scene.collection.objects.link(copy)
    copy.parent = export
    batches.setdefault(obj.data.materials[0].name, []).append(copy)
for mat, objects in batches.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = NAME + '__' + mat.split(' / ')[-1].replace(' ', '_')
    obj.data.transform(obj.matrix_basis)
    obj.matrix_basis = Matrix.Identity(4)
CONTACTS.write_text(json.dumps({'version': 1,
    'coordinates': '+Y up, +Z bow; metres in nomad-passing-deck carrier local frame',
    'source': 'Exact evaluated exported structural triangles, including real formed lips, cavities and roof seats; no collision boxes.',
    'prototypes': [{'name': NAME, 'positions': positions, 'indices': indices,
                    'parts': parts, 'triangles': len(indices) // 3}]}, separators=(',', ':')) + '\n')
bpy.ops.object.select_all(action='DESELECT')
export.select_set(True)
for obj in export.children_recursive:
    obj.select_set(True)
OUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUT), export_format='GLB', use_selection=True,
    export_apply=True, export_extras=True, export_yup=True, export_cameras=False,
    export_lights=False, export_animations=False)
# Read actual glTF counts rather than Blender tessellation estimates.
raw = OUT.read_bytes()
json_length = struct.unpack_from('<I', raw, 12)[0]
gltf = json.loads(raw[20:20 + json_length])
triangles = sum(gltf['accessors'][p['indices']]['count'] // 3 for m in gltf['meshes'] for p in m['primitives'])
low = [min(positions[axis::3]) for axis in range(3)]
high = [max(positions[axis::3]) for axis in range(3)]
record = {
    'title': 'Nomad Procession / Passing Deck formed receiving cargo crown',
    'generator': 'Original connected Blender assembly, retained as editable formed components and evaluated once for both GLB and native collision.',
    'source': Path(__file__).name, 'blend': BLEND.name,
    'runtimeAsset': str(OUT.relative_to(GAME)), 'collision': CONTACTS.name,
    'coordinates': '+Y up, +Z bow, metres; attach root unchanged to nomad-passing-deck with its existing scale, static pitch and translation.',
    'rights': 'Project-authored geometry and exact existing Nomad material aliases; no external models, textures or baked lighting.',
    'reference': '../../reference/nomad-procession-original.png',
    'sourceHull': '../carrier-collision.json', 'roadGuides': '../route-support-guides.json',
    'prototypes': [{'name': NAME, 'triangles': triangles, 'collisionTriangles': len(indices) // 3,
                    'materialBatches': len(batches), 'bounds': {'min': low, 'max': high},
                    'actualHullSeats': SEATS}],
    'reservedOpening': {'min': [-78, 142, -380], 'max': [78, 214, -160]},
    'entryRake': 'Port shoulder mouth is raked aft up to 136.5m; displacement fades to zero at Z=-160. Actual native diagonal flight and 25m camera envelopes drive this construction.',
    'materials': [item.name for item in M.values()],
    'hashes': {str(path.relative_to(HERE)) if path.is_relative_to(HERE) else path.name: hashlib.sha256(path.read_bytes()).hexdigest()
               for path in [Path(__file__), BLEND, OUT, CONTACTS, HULL, GUIDES]},
}
(HERE / 'receiver-crown-provenance.json').write_text(json.dumps(record, indent=2) + '\n')
print('NOMAD_RECEIVER_CROWN ' + json.dumps(record['prototypes']))

if '--render' in sys.argv:
    collection.hide_render = True
    # Preview composition only; the game owner supplies final matched engine views.
    bpy.ops.object.camera_add(location=xyz((220, 200, -650)))
    camera = bpy.context.object
    camera.rotation_euler = (xyz((0, 174, -255)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.lens = 43
    bpy.context.scene.camera = camera
    bpy.ops.object.light_add(type='AREA', location=xyz((-100, 450, -600)))
    bpy.context.object.data.energy = 3500000
    bpy.context.object.data.shape = 'DISK'
    bpy.context.object.data.size = 280
    bpy.context.scene.world.color = (.22, .26, .3)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'AgX'
    target = GAME / '.experiments/nomad-crown'
    target.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(target / 'receiver-crown-preview.png')
    bpy.ops.render.render(write_still=True)
