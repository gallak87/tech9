"""Original formed port-flank service belt for Portside Dive (carrier index 3).

Run: blender --background --factory-startup --threads 6 --python <this file>.
Editable component source is retained before exact evaluated export/contact bake.
The base carrier is read only. Source coordinates: metres, +Y up, +Z bow.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import struct

import bpy
import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
GAME = HERE.parents[4]
HULL = HERE.parent / 'carrier-collision.json'
BLEND = HERE / 'wallride-service.blend'
OUT = GAME / 'public/assets/levels/nomad/wallride-service.glb'
CONTACTS = HERE / 'wallride-service-collision.json'
NAME = 'nomad_wallride_service'

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
collection = bpy.data.collections.new('Editable / fitted Portside Dive service belt')
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
    obj['nomadCollision'] = True
    if edge:
        mod = obj.modifiers.new('Formed manufacturing radius', 'BEVEL')
        mod.width = edge
        mod.segments = 2 if edge >= .3 else 1
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(24)
        normal = obj.modifiers.new('Weighted broad-face normals', 'WEIGHTED_NORMAL')
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


def beam(name, start, end, radius, mat, segments=12):
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


def hull_x(y):
    # Exact broad planes of the retained shoulder before its 0.95m edge radius.
    if y < 79:
        return -(82 + (y - 66) * 8 / 13)
    if y <= 104:
        return -90
    return -(90 - (y - 104) * 14 / 22)


def clipped(z0, z1, y0, y1, chamfer):
    return [(z0 + chamfer, y0), (z1 - chamfer, y0), (z1, y0 + chamfer),
        (z1, y1 - chamfer), (z1 - chamfer, y1), (z0 + chamfer, y1),
        (z0, y1 - chamfer), (z0, y0 + chamfer)]


def formed_ring(name, outside, inside, front, back, mat, edge=.15):
    # The broad upper armor and lower return are one closed formed member.
    # Each ring follows the real convex hull; its opening has actual sidewalls.
    # The backing sits on the original armor, without altering that source.
    n = len(outside)
    points = [(hull_x(y) - offset, y, z)
        for offset in [front, back] for loop in [outside, inside] for z, y in loop]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces += [(i, j, n + j, n + i),
            (2 * n + i, 3 * n + i, 3 * n + j, 2 * n + j),
            (i, 2 * n + i, 2 * n + j, j),
            (n + i, n + j, 3 * n + j, 3 * n + i)]
    return mesh(name, points, faces, mat, edge)


hull = next(item for item in json.loads(HULL.read_text())['prototypes']
    if item['name'] == 'nomad_carrier')
hull_points = [Vector(hull['positions'][i:i + 3])
    for i in range(0, len(hull['positions']), 3)]
hull_faces = [hull['indices'][i:i + 3] for i in range(0, len(hull['indices']), 3)]
tree = BVHTree.FromPolygons(hull_points, hull_faces, all_triangles=True)


def socket(name, y, z):
    point, normal, triangle, _ = tree.ray_cast(Vector((-120, y, z)), Vector((1, 0, 0)), 50)
    assert point is not None and -91 < point.x < -77, (name, point)
    SEATS.append({'name': name, 'position': list(point), 'normal': list(normal),
        'sourceTriangle': triangle})
    # Shoes intentionally overlap their measured source surface; the short
    # bracket is entirely captured between that shoe and the returned armor.
    box(name + ' / seated hull sole', (point.x - .35, y, z),
        (1.05, 4, 5), 'alloy', .14)
    box(name + ' / captured structural spacer', (point.x - 1.4, y, z),
        (2.1, 2.6, 3.7), 'navy', .14)


# One connected service backbone spans the existing unequal plate fields.
# It stops before both real lateral portals and never cuts through the road.
prism('continuous fitted service backing',
    [(hull_x(y) - d, y) for y, d in [(78, .12), (104, .12), (121, .12),
        (121, -.16), (104, -.16), (78, -.16)]], -154, 154, 'navy')
for y in [88.4, 104.3]:
    box('continuous enclosed service bearer', (hull_x(y) - .8, y, 0),
        (1.4, 1.8, 307), 'navy', .12)

PACKETS = [
    {'name': 'stern pressure bank', 'z0': -153, 'z1': -53, 'iy0': 90, 'iy1': 102,
        'depth': 3.45},
    {'name': 'offset transmission access', 'z0': -50, 'z1': 43, 'iy0': 85.5, 'iy1': 108.5,
        'depth': 3.05},
    {'name': 'bow heat exchanger', 'z0': 46, 'z1': 153, 'iy0': 104.5, 'iy1': 118.4,
        'depth': 3.65},
]
for index, item in enumerate(PACKETS):
    name, start, end = item['name'], item['z0'], item['z1']
    y0, y1, depth = item['iy0'], item['iy1'], item['depth']
    outer = clipped(start, end, 77.8, 121, 2.2)
    opening = clipped(start + 8, end - 9, y0, y1, 1.1)
    formed_ring(name + ' / deep returned ivory armor', outer, opening,
        depth, .55, 'ivory', .28)
    # A separately formed inner flange makes the coating-to-metal transition
    # physical. Its ends and sloping upper edge step back into the navy recess.
    flange_outer = clipped(start + 7.5, end - 8.5, y0 - .5, y1 + .5, 1.2)
    flange_inner = clipped(start + 9.3, end - 10.3, y0 + 1.1, y1 - 1.1, .8)
    formed_ring(name + ' / seated machined service reveal', flange_outer,
        flange_inner, depth + .12, depth - .55, 'alloy', .12)
    # The well has 2–3m real recession, not a dark rectangle on the front face.
    if index == 2:
        # The banked production camera sees the upper slope, not the low
        # vertical shoulder. This raised opening exposes a floor outside the
        # unchanged opaque hull, with 2.8m of genuine stepped reveal depth.
        well = [(hull_x(y) - d, y) for y, d in [(y0 - .6, .8),
            (y1 + .6, .8), (y1 + .6, .42), (y0 - .6, .42)]]
        prism(name + ' / fitted sloping navy well floor', well,
            start + 7.3, end - 8.3, 'navy', .08)
    else:
        box(name + ' / navy well back', (-90.37, (y0 + min(y1, 104)) / 2,
            (start + end) / 2), (.5, min(y1, 104) - y0 + 1, end - start - 16),
            'navy', .12)
    for z in [start + 17, end - 19]:
        socket(name + ' / lower measured socket', 83, z)
        socket(name + ' / upper measured socket', 116, z)
    # A visibly folded crown return remains continuous across each broad field.
    lip = [(hull_x(y) - d, y) for y, d in [(119.8, depth + .06),
        (121.1, depth + .06), (121.3, depth - .6), (120, depth - .6)]]
    prism(name + ' / exposed upper alloy return', lip, start + 2.8, end - 2.8,
        'alloy', .10)
    if index in [0, 2]:
        # Few large angled cooling shutters, each an actual folded section.
        # Unequal spacing keeps a working bank distinct from a tiled surface.
        count = 6 if index == 0 else 7
        for rib in range(count):
            z = start + 15 + (end - start - 31) * rib / (count - 1)
            profile = ([(hull_x(y) - d, y) for y, d in [
                (y0 + 1.5, 2.2), (y0 + 1.5, 1.5),
                (y1 - 1.6, .9), (y1 - 1.6, 1.6)]] if index == 2 else
                [(-90.7, y0 + 1.5), (-91.5, y0 + 1.5),
                 (-92.35, y1 - 1.6), (-91.65, y1 - 1.6)])
            prism(name + ' / broad folded cooling shutter %02d' % rib,
                profile, z - .9, z + .9, 'navy', .12)
            box(name + ' / shutter seated cap %02d' % rib,
                ((hull_x(y1 - 1.7) - 1.6) if index == 2 else -92.0,
                 y1 - 1.7, z), (1, .65, 2.3), 'alloy', .10)
        for y in [y0 + 1.5, y1 - 1.4]:
            x = hull_x(y) - 1.3 if index == 2 else -91.25
            beam(name + ' / connected pressure header', (x, y, start + 12),
                (x, y, end - 13), .5, 'alloy')
    else:
        # One offset service door and adjacent paired feed manifold establish
        # purpose and asymmetry without adding a grid of small hatches.
        box(name + ' / inset access door shadow', (-90.95, 96, -14),
            (1.1, 20, 47), 'navy', .24)
        box(name + ' / inset oxide access door', (-91.78, 96, -14),
            (1.0, 17.3, 42), 'oxide', .24)
        for z in [-31, 3]:
            box(name + ' / captured broad locking strap', (-92.42, 96, z),
                (.65, 18.2, 1.65), 'alloy', .14)
        for y in [91, 101]:
            beam(name + ' / recessed hinge', (-92.45, y, -33.5),
                (-92.45, y, -27.5), .58, 'alloy')
        for z in [18, 27]:
            beam(name + ' / service manifold', (-91.3, 88, z),
                (-91.3, 104.5, z), .85, 'navy', 14)
            for y in [89, 102]:
                beam(name + ' / formed coupling collar', (-91.3, y - .55, z),
                    (-91.3, y + .55, z), 1.2, 'alloy', 14)

# The two armor breaks are true stepped seams with visible captured steel,
# not repeated decorative battens over every underlying source plate boundary.
for z, depth in [(-51.5, 3.1), (44.5, 3.35)]:
    profile = [(hull_x(y) - d, y) for y, d in [(79, .45), (104, .45),
        (120.5, .45), (120.5, depth - .7), (104, depth - .7), (79, depth - .7)]]
    prism('captured deep seam carrier', profile, z - .8, z + .8, 'navy', .10)

bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.context.view_layer.update()
graph = bpy.context.evaluated_depsgraph_get()
export = bpy.data.objects.new(NAME, None)
bpy.context.scene.collection.objects.link(export)
batches, points_all, bounds, collision_positions, collision_indices = {}, [], [], [], []
for obj in root.children_recursive:
    if obj.type != 'MESH':
        continue
    data = bpy.data.meshes.new_from_object(obj.evaluated_get(graph),
        preserve_all_data_layers=True, depsgraph=graph)
    data.transform(obj.matrix_world)
    points = [game(vertex.co) for vertex in data.vertices]
    points_all.extend(points)
    bounds.append({'name': obj.name, 'min': [min(p[a] for p in points) for a in range(3)],
        'max': [max(p[a] for p in points) for a in range(3)]})
    data.calc_loop_triangles()
    offset = len(collision_positions) // 3
    collision_positions.extend(round(value, 6) for p in points for value in p)
    collision_indices.extend(offset + i for tri in data.loop_triangles for i in tri.vertices)
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
triangles = sum(gltf['accessors'][p['indices']]['count'] // 3
    for m in gltf['meshes'] for p in m['primitives'])


def exported_accessor(index):
    accessor = gltf['accessors'][index]
    view = gltf['bufferViews'][accessor['bufferView']]
    code, size = {5126: ('f', 4), 5125: ('I', 4), 5123: ('H', 2),
        5121: ('B', 1)}[accessor['componentType']]
    width = {'SCALAR': 1, 'VEC3': 3}[accessor['type']]
    start = 28 + json_length + view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    stride = view.get('byteStride', width * size)
    return [struct.unpack_from('<' + code * width, raw, start + i * stride)
        for i in range(accessor['count'])]


# Read the final glTF buffers so floating-point baking and n-gon triangulation
# are identical in visual and contact assets, down to each exported vertex.
assert all(not any(key in node for key in ['matrix', 'translation', 'rotation', 'scale'])
    for node in gltf['nodes'])
collision_positions, collision_indices = [], []
for item in gltf['meshes']:
    for primitive in item['primitives']:
        offset = len(collision_positions) // 3
        collision_positions.extend(value
            for point in exported_accessor(primitive['attributes']['POSITION']) for value in point)
        collision_indices.extend(offset + item[0]
            for item in exported_accessor(primitive['indices']))
low = [min(p[a] for p in points_all) for a in range(3)]
high = [max(p[a] for p in points_all) for a in range(3)]
assert triangles == len(collision_indices) // 3 and triangles <= 12000, triangles
assert len(batches) == 4
assert low[0] > -94 and low[1] > 77 and high[1] < 122
assert low[2] >= -154 and high[2] <= 154
CONTACTS.write_text(json.dumps({'version': 1,
    'coordinates': '+Y up, +Z bow, metres; unchanged identity child of carrier3',
    'prototypes': [{'name': NAME, 'positions': collision_positions,
        'indices': collision_indices}]}, separators=(',', ':')) + '\n')
record = {
    'title': 'Nomad Procession / Portside Dive formed service belt',
    'generator': 'Original fitted Blender assembly with three unequal returned armor fields, true shallow service wells, cooling shutters and one recessed transmission-access door.',
    'source': Path(__file__).name, 'blend': BLEND.name,
    'runtimeAsset': str(OUT.relative_to(GAME)),
    'coordinates': 'Metres; +Y up, +Z bow. Attach nomad_wallride_service unchanged as an identity child of carrier index 3, nomad-portside-dive.',
    'rights': 'Project-authored geometry and exact existing Nomad scalar PBR aliases; no external models, images or baked lighting.',
    'reference': '../../reference/nomad-procession-original.png',
    'sourceHull': '../carrier-collision.json',
    'prototypes': [{'name': NAME, 'triangles': triangles, 'materialBatches': len(batches),
        'bounds': {'min': low, 'max': high}, 'actualHullSeats': SEATS}],
    'collision': {'file': CONTACTS.name, 'policy': 'Every evaluated component triangle is retained, matching the runtime GLB without simplified blocking volumes.',
        'triangles': len(collision_indices) // 3},
    'clearance': {'sourcePortalReservedZ': [[-281, -159], [159, 281]],
        'newGeometryZ': [low[2], high[2]], 'maximumOutwardOffsetMetres': 3.77,
        'policy': 'Shallow hull-conforming assembly preserves real side portals, roof and cargo roads. Full-width running skin, actual chassis and chase camera are checked separately against evaluated triangles before integration.'},
    'materials': [item.name for item in M.values()],
    'components': bounds,
    'hashes': {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in [Path(__file__), BLEND, OUT, CONTACTS, HULL]},
}
(HERE / 'wallride-service-provenance.json').write_text(json.dumps(record, indent=2) + '\n')
print('NOMAD_WALLRIDE_SERVICE ' + json.dumps(record['prototypes']))
