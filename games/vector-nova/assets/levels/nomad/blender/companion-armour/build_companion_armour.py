"""Original port-flank service armor cassettes for one Nomad companion.

Run Blender --background --factory-startup --threads 6 --python <this file>.
These optional visual plates never modify the retained base carrier or physics.
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
OUT = GAME / 'public/assets/levels/nomad/companion-armour.glb'
BLEND = HERE / 'companion-armour.blend'
HULL = SOURCE / 'carrier-collision.json'
NAME = 'nomad_companion_armour'

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
collection = bpy.data.collections.new('Editable fitted service armor / Hero Companion Port Flank')
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


def surface_box(name, centre, normal, width, height, depth, mat, edge=.15):
    n = Vector(normal).normalized()
    across = Vector((0, 0, 1))
    up = n.cross(across).normalized()
    points = [Vector(centre) + across * (u * width / 2) + up * (v * height / 2) + n * (d * depth / 2)
        for d in [-1, 1] for v in [-1, 1] for u in [-1, 1]]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1),
        (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return mesh(name, points, faces, mat, edge)


def socket(name, y, z, target):
    point, normal, triangle, distance = tree.ray_cast(Vector((-140, y, z)), Vector((1, 0, 0)), 70)
    assert point is not None and -95 < point.x < -72, (y, z, point)
    SEATS.append({'name': name, 'position': list(point), 'normal': list(normal), 'sourceTriangle': triangle})
    surface_box(name + ' / fitted hull sole', point + normal * .35, normal, 9, 6, 1.5, 'alloy', .2)
    girder(name + ' / deep connected mounting bracket', point + normal * 1.1,
        target, 4.5, 5.5, 'navy', .3)
    # A real formed clamp mates the pale shell to the structural bracket.
    surface_box(name + ' / seated plate clamp', Vector(target), normal, 7, 3.5, 1.8, 'alloy', .25)


def clipped(z0, z1, y0, y1, chamfer):
    return [(z0 + chamfer, y0), (z1 - chamfer, y0), (z1, y0 + chamfer),
        (z1, y1 - chamfer), (z1 - chamfer, y1), (z0 + chamfer, y1),
        (z0, y1 - chamfer), (z0, y0 + chamfer)]


def aperture(name, outside, inside, front, back, mat, edge):
    # Four closed loops give this service opening true thickness and return
    # walls. There is no backing ivory face across its dark inner cavity.
    n = len(outside)
    points = [(x, y, z) for x in [front, back] for loop in [outside, inside] for z, y in loop]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces += [(i, j, n + j, n + i),
            (2 * n + i, 3 * n + i, 3 * n + j, 2 * n + j),
            (i, 2 * n + i, 2 * n + j, j),
            (n + i, n + j, 3 * n + j, 3 * n + i)]
    return mesh(name, points, faces, mat, edge)


PACKETS = [(-150, -36, 'forward heat-exchanger cassette'),
           (-31, 63, 'central armored service hatch'),
           (68, 151, 'aft pressure-cooling cassette')]
for index, (start, end, name) in enumerate(PACKETS):
    # Broad folded plates wrap over the real convex shoulder; return flanges
    # and spaced navy carriers reveal actual thickness, rather than painted lines.
    upper = [(-104.5, 105), (-101.5, 114), (-84, 130), (-77, 129),
        (-79.8, 124.9), (-96.2, 109.4), (-98, 105)]
    lower = [(-94, 74.5), (-101, 79), (-104, 85), (-99, 88),
        (-96.5, 83), (-89.5, 78.5)]
    prism(name + ' / formed upper shoulder plate', upper, start, end, 'ivory', .65)
    prism(name + ' / formed lower return plate', lower, start + 1, end - 1, 'ivory', .55)
    # A warm machined lip is exposed beneath the coating edge as real geometry.
    upper_lip = [(-104.9, 104.7), (-104.8, 107.3), (-102.6, 112.7),
        (-101.7, 112.1), (-103.4, 106.7), (-103.4, 104.7)]
    prism(name + ' / upper alloy coating transition', upper_lip, start + 3, end - 3, 'alloy', .18)
    prism(name + ' / lower alloy seated return',
        [(-104.1, 82.6), (-104.5, 84.6), (-102.7, 86.6), (-101.8, 85.5), (-102.7, 83.2)],
        start + 3, end - 3, 'alloy', .15)
    # Actual deep cross-section rails carry the whole service cassette.
    for y in [84, 108]:
        box(name + ' / recessed longitudinal structural bearer',
            (-94.2, y, (start + end) / 2), (5, 4.5, end - start - 5), 'navy', .35)
    for z in [start + 13, end - 15]:
        socket(name + ' / lower shoulder socket', 86, z, (-98, 86, z))
        socket(name + ' / upper shoulder socket', 117, z, (-91, 117, z))
    outer = clipped(start + 4, end - 4, 80.5, 111, 3)
    opening = clipped(start + 11, end - 11, 85.2, 106.2, 1.8)
    aperture(name + ' / formed armor opening surround', outer, opening, -104, -95, 'ivory', .45)
    # Nested, separately seated metal reveal steps back 8.5m to a navy well.
    reveal_outer = clipped(start + 10.5, end - 10.5, 84.8, 106.6, 2)
    reveal_inner = clipped(start + 13, end - 13, 87.3, 104.1, 1.4)
    aperture(name + ' / machined recessed reveal', reveal_outer, reveal_inner, -104.25, -102, 'alloy', .15)
    box(name + ' / deep service well backing', (-94.8, 95.7, (start + end) / 2),
        (1.2, 22.5, end - start - 18), 'navy', .35)
    if index != 1:
        # Large cooling blades have real 6m recession and fitted end headers.
        z0, z1 = start + 16, end - 16
        count = 12 if index == 0 else 8
        for rib in range(count):
            z = z0 + (z1 - z0) * (rib + .5) / count
            blade = [(-101.5, 87.7), (-100.8, 87.7), (-95.2, 102.6),
                     (-95.2, 104), (-96.1, 104), (-101.5, 89)]
            prism(name + ' / folded cooling blade %02d' % rib, blade, z - .7, z + .7, 'navy', .12)
            # Sparse alloy blade ends define the depth against the dark cavity.
            girder(name + ' / cooling blade exposed retaining edge %02d' % rib,
                (-101.4, 88.6, z), (-96, 103.7, z), .45, .65, 'alloy', .1)
        for y in [87, 104.6]:
            box(name + ' / cooling-bank seated end header',
                (-100, y, (start + end) / 2), (3.5, 1.5, end - start - 26), 'navy', .2)
    else:
        # One unequal oxide service hatch distinguishes this plate from the
        # adjacent cooling packets; its frame and hinge recesses are physical.
        centre = start + (end - start) * .59
        box(name + ' / service hatch dark inset', (-101.1, 95.8, centre),
            (2, 18.5, 48), 'navy', .35)
        box(name + ' / inset oxide service cover', (-102.1, 95.8, centre),
            (1.4, 15.5, 43), 'oxide', .4)
        for z in [centre - 18, centre + 18]:
            box(name + ' / recessed hatch seating strap', (-103.15, 95.8, z),
                (.8, 16.5, 2.2), 'alloy', .18)
        for y in [91, 100.5]:
            cylinder(name + ' / seated hatch hinge barrel',
                (-103.2, y, centre - 20.5), (-103.2, y, centre - 15), .8, 'alloy', 12)
        # Broad exposed line couplings occupy the narrow remaining service bay.
        for z in [-13, -4]:
            cylinder(name + ' / service pressure coupling',
                (-99.8, 89, z), (-99.8, 102.5, z), 1.7, 'navy', 14)
            for y in [90, 101.5]:
                cylinder(name + ' / machined pressure collar',
                    (-99.8, y - .6, z), (-99.8, y + .6, z), 2.1, 'alloy', 14)
    # The ends are visibly fitted into folded returns rather than thin overlay sheets.
    for z in [start + 1.5, end - 1.5]:
        box(name + ' / terminal seated navy gasket', (-97.3, 96, z),
            (5.5, 34, 1.8), 'navy', .25)

bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.context.view_layer.update()
graph = bpy.context.evaluated_depsgraph_get()
export = bpy.data.objects.new(NAME, None)
bpy.context.scene.collection.objects.link(export)
batches, source_positions, component_bounds = {}, [], []
for obj in root.children_recursive:
    if obj.type != 'MESH':
        continue
    data = bpy.data.meshes.new_from_object(obj.evaluated_get(graph), preserve_all_data_layers=True, depsgraph=graph)
    data.transform(obj.matrix_world)
    points = [game(vertex.co) for vertex in data.vertices]
    source_positions.extend(points)
    component_bounds.append({'name': obj.name,
        'min': [min(point[axis] for point in points) for axis in range(3)],
        'max': [max(point[axis] for point in points) for axis in range(3)]})
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
triangles = sum(gltf['accessors'][p['indices']]['count'] // 3 for m in gltf['meshes'] for p in m['primitives'])
low = [min(point[axis] for point in source_positions) for axis in range(3)]
high = [max(point[axis] for point in source_positions) for axis in range(3)]
assert triangles <= 15000, triangles
assert low[1] > 70 and -159 < low[2] < high[2] < 159, (low, high)
record = {
    'title': 'Nomad Procession / Hero companion port-flank formed service armor cassettes',
    'generator': 'Original fitted Blender component assembly; broad returned armor plates, deep cooling wells, machined coating transitions and one inset service hatch.',
    'source': Path(__file__).name, 'blend': BLEND.name,
    'runtimeAsset': str(OUT.relative_to(GAME)),
    'coordinates': '+Y up, +Z bow, metres; attach unchanged to one visual companion root. Port flank (-X) only; no race or collision surfaces.',
    'rights': 'Project-authored geometry and exact existing Nomad material aliases; no external models, textures or baked lighting.',
    'reference': '../../reference/nomad-procession-original.png',
    'sourceHull': '../carrier-collision.json',
    'prototypes': [{'name': NAME, 'triangles': triangles, 'materialBatches': len(batches),
        'bounds': {'min': low, 'max': high}, 'actualHullSeats': SEATS}],
    'clearance': {'sidePortalReservedZ': [[-281, -159], [159, 281]],
        'wheelAndGuardMaxY': 52, 'craneReservedZ': [[-304, -274], [263, 293]],
        'result': 'Every evaluated attachment vertex is above Y70 and strictly inside Z(-159,159); convex hull bounds therefore separate the entire kit from all tire/guard, lateral portal and crane station envelopes.'},
    'materials': [item.name for item in M.values()],
    'components': component_bounds,
    'hashes': {str(path.relative_to(HERE)) if path.is_relative_to(HERE) else path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in [Path(__file__), BLEND, OUT, HULL]},
}
(HERE / 'companion-armour-provenance.json').write_text(json.dumps(record, indent=2) + '\n')
print('NOMAD_COMPANION_ARMOUR ' + json.dumps(record['prototypes']))

if '--render' in sys.argv:
    collection.hide_render = True
    bpy.ops.object.camera_add(location=xyz((-270, 175, -310)))
    camera = bpy.context.object
    camera.rotation_euler = (xyz((-91, 102, 0)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.lens = 43
    bpy.context.scene.camera = camera
    bpy.ops.object.light_add(type='AREA', location=xyz((-260, 350, -300)))
    bpy.context.object.data.energy = 1800000
    bpy.context.object.data.shape = 'DISK'
    bpy.context.object.data.size = 200
    bpy.context.scene.world.color = (.22, .26, .3)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'AgX'
    target = GAME / '.experiments/nomad-companion-armour'
    target.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(target / 'companion-armour-preview.png')
    bpy.ops.render.render(write_still=True)
