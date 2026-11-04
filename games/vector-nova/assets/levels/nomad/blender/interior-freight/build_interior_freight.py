"""Original suspended freight installation for Nomad's Freight Cathedral.

Run Blender --background --factory-startup --threads 6 --python <this file>.
The exact evaluated editable members also define the native structural collider.
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
OUT = GAME / 'public/assets/levels/nomad/interior-freight.glb'
BLEND = HERE / 'interior-freight.blend'
CONTACTS = HERE / 'interior-freight-collision.json'
HULL = SOURCE / 'carrier-collision.json'
NAME = 'nomad_interior_freight'

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
collection = bpy.data.collections.new('Editable suspended overhead freight / Freight Cathedral')
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

# Continuous paired I-section ceiling runways. Real roof clips bridge into the
# existing formed soffit, not into an invented bounding plane or open skylight.
for side in [-1, 1]:
    x = side * 40
    profile = [(x - 3.6, 118.3), (x + 3.6, 118.3),
        (x + 3.6, 119.2), (x + .85, 119.2), (x + .85, 122.3),
        (x + 3.6, 122.3), (x + 3.6, 123.2), (x - 3.6, 123.2),
        (x - 3.6, 122.3), (x - .85, 122.3), (x - .85, 119.2), (x - 3.6, 119.2)]
    prism('continuous overhead freight runway %s' % side, profile, 72, 259, 'navy', .18)
    box('runway machined lower wheel path %s' % side,
        (x, 118.2, 165.5), (6.4, .55, 184), 'alloy', .12)
    for index, z in enumerate([78, 106, 137, 169, 201, 231, 247]):
        point, normal, triangle, distance = tree.ray_cast(Vector((x, 114, z)), Vector((0, 1, 0)), 20)
        assert point is not None and 123 < point.y < 128, (x, z, point)
        SEATS.append({'name': 'ceiling runway seat %s %s' % (side, index),
            'position': list(point), 'normal': list(normal), 'sourceTriangle': triangle})
        # Plate top embeds only .25m into the actual exported ceiling skin.
        box('fitted ceiling runway seat %s %s' % (side, index),
            (x, point.y - .35, z), (9.5, 1.2, 8), 'alloy', .2)
        box('ceiling seat downward hanger %s %s' % (side, index),
            (x, (point.y + 122.7) / 2, z), (3, point.y - 122.7, 5), 'navy', .18)
        for dx in [-3.2, 3.2]:
            box('ceiling seat fitted keeper %s %s' % (side, index),
                (x + dx, 123.2, z), (1, 1.5, 5), 'alloy', .15)
    for z in [73, 258]:
        box('runway connected end stop %s %s' % (side, z),
            (x, 120.7, z), (8.2, 5.5, 3), 'ivory', .45)

LOADS = [
    {'name': 'port offset transformer freight', 'x': -18, 'z': 110, 'width': 44, 'depth': 40, 'bottom': 97.8, 'height': 12.4},
    {'name': 'starboard suspended heavy freight', 'x': 18, 'z': 172, 'width': 46, 'depth': 42, 'bottom': 97.0, 'height': 13.4},
    {'name': 'central broad process freight', 'x': -2, 'z': 234, 'width': 52, 'depth': 32, 'bottom': 98.4, 'height': 12.0},
]
for index, load in enumerate(LOADS):
    name, x, z = load['name'], load['x'], load['z']
    width, depth, bottom, height = load['width'], load['depth'], load['bottom'], load['height']
    top, left, right = bottom + height, x - width / 2, x + width / 2
    # Actual formed container wall profile: clipped reinforced corners, broad
    # oxide fields, a deep navy underframe and individually seated door panels.
    profile = [(left + 2, bottom), (right - 2, bottom), (right, bottom + 2),
        (right, top - 2), (right - 2, top), (left + 2, top),
        (left, top - 2), (left, bottom + 2)]
    prism(name + ' / continuous formed freight shell', profile,
        z - depth / 2, z + depth / 2, 'oxide', .45)
    box(name + ' / deep underframe', (x, bottom + .25, z),
        (width - 3.5, 1.4, depth - 2), 'navy', .4)
    # Lower skids remain above the declared Y96 shipping envelope.
    for across in [-.28, .28]:
        box(name + ' / seated lifting skid', (x + across * width, bottom - .35, z),
            (3.2, 1.2, depth + .5), 'alloy', .25)
    # Two broad front doors with real recess and formed retaining perimeter.
    face = z - depth / 2 - .2
    box(name + ' / recessed front door shadow', (x, bottom + height / 2, face),
        (width - 3.2, height - 2.0, .8), 'navy', .25)
    for side in [-1, 1]:
        centre = x + side * width * .235
        box(name + ' / formed oxide door field', (centre, bottom + height / 2, face - .48),
            (width * .43, height - 3.0, .65), 'oxide', .3)
        cylinder(name + ' / seated front locking shaft',
            (centre, bottom + 2.1, face - 1), (centre, top - 2.1, face - 1), .32, 'alloy', 10)
        for y in [bottom + 2.1, top - 2.1]:
            box(name + ' / locking shaft bearing', (centre, y, face - .9),
                (1.8, 1.2, 1), 'alloy', .16)
    # Substantial ribs and corner castings belong to this specific freight shell.
    for side in [-1, 1]:
        for row in [-.28, 0, .28]:
            box(name + ' / folded side corrugation',
                (x + side * (width / 2 + .1), bottom + height / 2, z + row * depth),
                (.8, height - 3, 1.8), 'oxide', .18)
        for end in [-1, 1]:
            for y in [bottom + .9, top - .9]:
                box(name + ' / cast freight corner',
                    (x + side * (width / 2 - 1), y, z + end * (depth / 2 - 1)),
                    (2.5, 2.4, 2.5), 'alloy', .25)
        for y in [bottom + .5, top - .5]:
            box(name + ' / long recessed edge bearer',
                (x + side * (width / 2 - .6), y, z), (1.6, 1.3, depth - 3), 'navy', .18)
    # A formed, connected transverse bridge rides the pair of roof runways.
    profile = [(-44, 120.1), (-36, 120.1), (-31, 117.4), (31, 117.4),
        (36, 120.1), (44, 120.1), (44, 123.3), (33, 123.3),
        (29, 121.2), (-29, 121.2), (-33, 123.3), (-44, 123.3)]
    prism(name + ' / formed overhead crane crosshead', profile, z - 4, z + 4, 'navy', .35)
    for side in [-1, 1]:
        box(name + ' / runway bogie load saddle', (side * 40, 120.6, z), (9.2, 4.4, 11), 'ivory', .45)
        for dz in [-4, 4]:
            cylinder(name + ' / runway bogie axle',
                (side * 40 - 4, 119.6, z + dz), (side * 40 + 4, 119.6, z + dz), 1.6, 'alloy', 14)
    # The hoist has a proper dark throat, broad alloy winch and paired cheeks.
    # It is seated on the bridge; taut slings then reach actual freight corners.
    box(name + ' / hoist housing seated base', (x, 119.8, z), (16, 2.5, 12), 'navy', .4)
    for dz in [-5.2, 5.2]:
        profile = [(x - 8.2, 117.5), (x - 6.5, 115.2), (x + 6.5, 115.2),
            (x + 8.2, 117.5), (x + 7.2, 121.3), (x - 7.2, 121.3)]
        prism(name + ' / formed hoist cheek', profile, z + dz - .8, z + dz + .8, 'ivory', .3)
    cylinder(name + ' / bronze hoist winch drum',
        (x, 117.4, z - 5), (x, 117.4, z + 5), 2.5, 'alloy', 20)
    for side in [-1, 1]:
        for end in [-1, 1]:
            a = (x + side * 4.5, 116.8, z + end * 4.5)
            b = (x + side * (width / 2 - 1), top + .7, z + end * (depth / 2 - 1))
            cylinder(name + ' / taut diagonal lifting stay', a, b, .42, 'alloy', 10)
            # Compact visible lift sockets transfer the stay into the real shell.
            box(name + ' / cast upper lifting socket', b, (2.8, 1.6, 2.8), 'navy', .25)
    # This rectangular spreader sits on the four reinforced upper corners.
    for side in [-1, 1]:
        girder(name + ' / longitudinal lifting spreader rail',
            (x + side * (width / 2 - 1), top + .6, z - depth / 2 + 1),
            (x + side * (width / 2 - 1), top + .6, z + depth / 2 - 1), 1.6, 1.6, 'navy', .18)
    for end in [-1, 1]:
        girder(name + ' / transverse lifting spreader head',
            (left + 1, top + .6, z + end * (depth / 2 - 1)),
            (right - 1, top + .6, z + end * (depth / 2 - 1)), 1.6, 1.6, 'navy', .18)

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
    'coordinates': '+Y up, +Z bow; metres in nomad-freight-cathedral carrier local frame',
    'source': 'Exact evaluated exported freight/crane triangles, including actual roof seats, formed loads, taut stays and hoist cavities; no collision boxes.',
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
raw = OUT.read_bytes()
json_length = struct.unpack_from('<I', raw, 12)[0]
gltf = json.loads(raw[20:20 + json_length])
triangles = sum(gltf['accessors'][p['indices']]['count'] // 3 for m in gltf['meshes'] for p in m['primitives'])
record = {
    'title': 'Nomad Procession / Freight Cathedral suspended heavy-freight crane installation',
    'generator': 'Original connected Blender component assembly; paired roof runways, formed crane bridges, bronze hoists, taut lifting stays and three reinforced oxide freight shells.',
    'source': Path(__file__).name, 'blend': BLEND.name,
    'runtimeAsset': str(OUT.relative_to(GAME)), 'collision': CONTACTS.name,
    'coordinates': '+Y up, +Z bow, metres; attach root unchanged to nomad-freight-cathedral with its existing scale, static pitch and translation.',
    'rights': 'Project-authored geometry and exact existing Nomad material aliases; no external models, textures or baked lighting.',
    'reference': '../../reference/nomad-procession-original.png',
    'sourceHull': '../carrier-collision.json',
    'prototypes': [{'name': NAME, 'triangles': triangles, 'collisionTriangles': len(indices) // 3,
        'materialBatches': len(batches),
        'bounds': {'min': [min(positions[axis::3]) for axis in range(3)],
                   'max': [max(positions[axis::3]) for axis in range(3)]},
        'actualHullSeats': SEATS}],
    'freight': LOADS,
    'clearance': 'The complete installation stays at or above Y96 in its original carrier local frame; actual road/camera and native-flight validation is performed against the exported triangles.',
    'materials': [item.name for item in M.values()],
    'hashes': {str(path.relative_to(HERE)) if path.is_relative_to(HERE) else path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in [Path(__file__), BLEND, OUT, CONTACTS, HULL]},
}
assert triangles <= 12000, triangles
assert record['prototypes'][0]['bounds']['min'][1] >= 96
(HERE / 'interior-freight-provenance.json').write_text(json.dumps(record, indent=2) + '\n')
print('NOMAD_INTERIOR_FREIGHT ' + json.dumps(record['prototypes']))

if '--render' in sys.argv:
    collection.hide_render = True
    bpy.ops.object.camera_add(location=xyz((95, 74, -50)))
    camera = bpy.context.object
    camera.rotation_euler = (xyz((0, 110, 170)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.lens = 43
    bpy.context.scene.camera = camera
    bpy.ops.object.light_add(type='AREA', location=xyz((60, 190, -100)))
    bpy.context.object.data.energy = 650000
    bpy.context.object.data.shape = 'DISK'
    bpy.context.object.data.size = 130
    bpy.context.scene.world.color = (.22, .26, .3)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'AgX'
    target = GAME / '.experiments/nomad-interior-freight'
    target.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(target / 'interior-freight-preview.png')
    bpy.ops.render.render(write_still=True)
