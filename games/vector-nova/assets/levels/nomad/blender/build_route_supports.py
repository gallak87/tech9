"""Original connected load frames for the actual Nomad running skins.

Run Blender --background --factory-startup --threads 6 --python <this file>.
Road guides are exported by the level owner; this builder never changes them.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
GAME = HERE.parents[3]
GUIDES = HERE / 'route-support-guides.json'
HULL = HERE / 'carrier-collision.json'
OUT = GAME / 'public/assets/levels/nomad/route-supports.glb'
BLEND = HERE / 'route-supports.blend'
CONTACTS = HERE / 'route-supports-collision.json'

bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for material in list(bpy.data.materials):
    bpy.data.materials.remove(material)


def xyz(point):
    return Vector((point[0], -point[2], point[1]))


def game(point):
    return Vector((point.x, point.z, -point.y))


def material(name, colour, metal, rough):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*colour, 1)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*colour, 1)
    node.inputs['Metallic'].default_value = metal
    node.inputs['Roughness'].default_value = rough
    return mat


M = {
    'navy': material('Nomad / navy structural steel', (.026, .043, .058), .62, .49),
    'alloy': material('Nomad / rubbed warm alloy', (.37, .325, .245), .83, .37),
}
guide_data = json.loads(GUIDES.read_text())
hull_data = json.loads(HULL.read_text())
hull = next(entry for entry in hull_data['prototypes'] if entry['name'] == 'nomad_carrier')
hull_points = [Vector(hull['positions'][i:i + 3]) for i in range(0, len(hull['positions']), 3)]
hull_faces = [hull['indices'][i:i + 3] for i in range(0, len(hull['indices']), 3)]
hull_tree = BVHTree.FromPolygons(hull_points, hull_faces, all_triangles=True)
ROOTS, ANCHORS = {}, {}


def root(name):
    collection = bpy.data.collections.new('Editable load path / ' + name)
    bpy.context.scene.collection.children.link(collection)
    obj = bpy.data.objects.new('SOURCE__' + name, None)
    collection.objects.link(obj)
    ROOTS[name] = obj
    ANCHORS[name] = []
    return obj


def mesh(name, vertices, faces, mat, parent, contact=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata([xyz(point) for point in vertices], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(parent.name + ' / ' + name, data)
    parent.users_collection[0].objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(M[mat])
    obj['supportContact'] = contact
    return obj


def frame_box(name, centre, right, up, tangent, width, height, depth, mat, parent, contact=False):
    points = []
    for z in [-1, 1]:
        for y in [-1, 1]:
            for x in [-1, 1]:
                points.append(centre + right * (x * width / 2) + up * (y * height / 2) + tangent * (z * depth / 2))
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return mesh(name, points, faces, mat, parent, contact)


def girder(name, start, end, width, depth, mat, parent, contact=False):
    direction = (end - start).normalized()
    reference = Vector((0, 1, 0)) if abs(direction.y) < .94 else Vector((0, 0, 1))
    right = direction.cross(reference).normalized()
    up = right.cross(direction).normalized()
    return frame_box(name, (start + end) / 2, right, up, direction, width, depth,
                     (end - start).length, mat, parent, contact)


def make_frames(samples, authored_scale=None):
    # An inverse carrier transform does not preserve orthogonality. New stretched
    # receivers retain their exact scale. Legacy guides recover the common scale
    # from the exact two-metre normal offset and their known 1.4 axial stretch.
    if authored_scale is None:
        raw = (Vector(samples[0]['center']) - Vector(samples[0]['under'])) / 2
        uniform = 1 / Vector((raw.x, raw.y, raw.z * 1.4)).length
        scale = Vector((uniform, uniform, uniform * 1.4))
    else:
        scale = Vector(authored_scale)
    def world(vector):
        return Vector((vector.x * scale.x, vector.y * scale.y, vector.z * scale.z))
    def local(vector):
        return Vector((vector.x / scale.x, vector.y / scale.y, vector.z / scale.z))
    frames = []
    for sample in samples:
        centre = Vector(sample['center'])
        up = (centre - Vector(sample['under'])) / 2
        up_world = world(up).normalized()
        raw_right = Vector(sample['right']) - Vector(sample['left'])
        right_world = world(raw_right).normalized()
        # Small floating-point error in the guide is discarded, not authored
        # road shape: the deck's transformed basis is orthonormal in the world.
        right_world = (right_world - up_world * right_world.dot(up_world)).normalized()
        tangent_world = right_world.cross(up_world).normalized()
        frames.append({
            'c': centre, 'u': local(up_world), 'r': local(right_world),
            't': local(tangent_world), 'half': world(raw_right).length / 2,
            'distance': sample['distance'], 'scale': scale,
        })
    return frames, world


I_SECTION = [(-3, -3.5), (3, -3.5), (3, -2.8), (.7, -2.8),
             (.7, 2.8), (3, 2.8), (3, 3.5), (-3, 3.5),
             (-3, 2.8), (-.7, 2.8), (-.7, -2.8), (-3, -2.8)]


def sweep_spine(parent, frames, side):
    vertices, faces = [], []
    count = len(I_SECTION)
    for frame in frames:
        centre = frame['c'] + frame['r'] * (side * frame['half'] * .58) - frame['u'] * 14
        for x, y in I_SECTION:
            vertices.append(centre + frame['r'] * x + frame['u'] * y)
    for row in range(len(frames) - 1):
        for i in range(count):
            faces.append((row * count + i, row * count + (i + 1) % count,
                          (row + 1) * count + (i + 1) % count, (row + 1) * count + i))
    faces += [tuple(range(count - 1, -1, -1)), tuple((len(frames) - 1) * count + i for i in range(count))]
    return mesh('continuous deep I-keel %s' % side, vertices, faces, 'navy', parent)


def source_anchor(frame, side, longitudinal=0):
    centre = frame['c']
    station = max(-338, min(338, centre.z + longitudinal))
    # Elevated central roads sit on the actual closed roof. Side climbs stay
    # connected to the deep load keel; no anchor is invented in an open portal.
    if centre.y > 132 and abs(centre.x) < 66:
        x = max(-58, min(58, centre.x + side * 22))
        origin, direction = Vector((x, 210, station)), Vector((0, -1, 0))
        kind = 'actual roof cassette'
    elif abs(centre.x) < 48 and centre.y < 82:
        station = min([-330, -250, -170, -90, -10, 70, 150, 230, 310], key=lambda z: abs(z - station))
        x = max(-36, min(36, centre.x + side * 18))
        origin, direction = Vector((x, 53, station)), Vector((0, -1, 0))
        kind = 'actual transverse chassis bearer'
    else:
        exterior = 1 if centre.x >= 0 else -1
        origin, direction = Vector((exterior * 160, 36, station)), Vector((-exterior, 0, 0))
        kind = 'actual formed lower load keel'
    # The retained roof packets have real two-metre joints. A load shoe must
    # seat on a packet, never on an invented face across that open seam.
    offsets = [0, -4, 4] if kind == 'actual roof cassette' else [0]
    contact = None
    for offset in offsets:
        candidate = origin + Vector((0, 0, offset))
        result = hull_tree.ray_cast(candidate, direction, 250)
        if result[0] is not None and (kind != 'actual roof cassette' or result[0].y >= 129):
            contact = result
            break
    if contact is None:
        raise RuntimeError('No real hull contact for %s at %s' % (kind, list(origin)))
    position, normal, face, distance = contact
    if normal.dot(direction) > 0:
        normal = -normal
    return {'point': position, 'normal': normal.normalized(), 'kind': kind, 'sourceTriangle': face}


def anchor_shoe(parent, spec, name):
    point, normal = spec['point'], spec['normal']
    tangent = Vector((0, 0, 1))
    right = normal.cross(tangent).normalized()
    if right.length < .1:
        tangent = Vector((0, 1, 0))
        right = normal.cross(tangent).normalized()
    tangent = right.cross(normal).normalized()
    frame_box(name + ' / seated hull shoe', point - normal * .35, right, normal,
              tangent, 9, 1.5, 11, 'alloy', parent, True)
    ANCHORS[parent.name.removeprefix('SOURCE__')].append({
        'name': name, 'position': [round(value, 5) for value in point],
        'normal': [round(value, 6) for value in normal],
        'kind': spec['kind'], 'sourceTriangle': spec['sourceTriangle'],
    })
    return point - normal * 2.5


def saddle(parent, frame, side, index):
    r, u, t = frame['r'], frame['u'], frame['t']
    centre = frame['c'] + r * (side * frame['half'] * .58)
    # The upper plate's front face meets the existing 1.4m road slab underside.
    frame_box('fitted deck saddle %s %s' % (index, side), centre - u * 2.2,
              r, u, t, 8.5, 1.6, 8, 'alloy', parent, True)
    frame_box('saddle short formed stool %s %s' % (index, side), centre - u * 6.95,
              r, u, t, 3.8, 8.2, 5, 'navy', parent, True)
    return centre - u * 14


for guide in guide_data['carriers']:
    parent = root(guide['id'])
    frames, to_world = make_frames(guide['samples'], guide.get('scale'))
    for side in [-1, 1]:
        sweep_spine(parent, frames, side)
    frame_indices = sorted(set([0, len(frames) - 1] + list(range(3, len(frames) - 2, 4))))
    for index in frame_indices:
        frame = frames[index]
        supports = [saddle(parent, frame, side, index) for side in [-1, 1]]
        girder('heavy transverse load head %02d' % index, supports[0], supports[1],
               5.5, 6, 'navy', parent)
        for side, support in zip([-1, 1], supports):
            spec = source_anchor(frame, side)
            anchor_point = anchor_shoe(parent, spec, 'hull seat %02d %s' % (index, side))
            # Short spacers already embedded in roof mass do not need a false
            # extra leg. Taller gaps receive a full box-section diagonal.
            if (support - anchor_point).length > 5:
                girder('primary boxed load leg %02d %s' % (index, side), support,
                       anchor_point, 5.5, 6.5, 'navy', parent)
            back = source_anchor(frame, side, -48 if index % 2 else 48)
            back_point = anchor_shoe(parent, back, 'diagonal seat %02d %s' % (index, side))
            girder('longitudinal triangular load brace %02d %s' % (index, side),
                   support, back_point, 4.5, 5.2, 'navy', parent)
    extended = frames[-1]['c'].z > 380 + 1e-6
    if guide['mode'] == 'overtake' or extended:
        # The terminal interception ramp is a supported outrigged loading arm,
        # with separated longitudinal load roots, not a hovering road strip.
        last = frames[-1]
        end_points = [last['c'] + last['r'] * (side * last['half'] * .58) - last['u'] * 14 for side in [-1, 1]]
        roots = []
        roots_at = [(-1, -108), (1, 72)] if not extended else [
            (-1, 248 - last['c'].z), (1, 330 - last['c'].z),
        ]
        for side, longitudinal in roots_at:
            spec = source_anchor(last, side, longitudinal)
            point = anchor_shoe(parent, spec, 'terminal outrigger root %s' % side)
            roots.append(point)
        girder('terminal lower longitudinal load keel', roots[0], roots[1], 8, 8,
               'navy', parent)
        for i, endpoint in enumerate(end_points):
            girder('terminal full-depth diagonal %s' % i, roots[i], endpoint, 8, 9,
                   'navy', parent)
        girder('terminal opposed stabilising diagonal', roots[0], end_points[1],
               5.5, 6.5, 'navy', parent)

bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1
for name, obj in ROOTS.items():
    obj.users_collection[0].hide_viewport = name != 'nomad-overtaking-wall'
    obj.users_collection[0].hide_render = name != 'nomad-overtaking-wall'
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
for obj in ROOTS.values():
    obj.users_collection[0].hide_viewport = False
    obj.users_collection[0].hide_render = False
bpy.context.view_layer.update()

exports, stats, contacts = [], [], []
for name, source in ROOTS.items():
    export = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(export)
    exports.append(export)
    batches = {}
    positions, indices, parts = [], [], []
    for obj in source.children_recursive:
        if obj.type != 'MESH':
            continue
        data = obj.data.copy()
        data.calc_loop_triangles()
        first, offset = len(indices), len(positions) // 3
        for vertex in data.vertices:
            point = game(obj.matrix_world @ vertex.co)
            positions.extend([round(value, 5) for value in point])
        for triangle in data.loop_triangles:
            indices.extend([offset + value for value in triangle.vertices])
        parts.append({'name': obj.name.split(' / ', 1)[-1], 'indexStart': first,
                      'indexCount': len(indices) - first,
                      'contactFoot': bool(obj.get('supportContact'))})
        copy = bpy.data.objects.new('EXPORT__' + obj.name, data)
        bpy.context.scene.collection.objects.link(copy)
        copy.parent = export
        copy.matrix_world = obj.matrix_world.copy()
        batches.setdefault(obj.data.materials[0].name, []).append(copy)
    contacts.append({'name': name, 'positions': positions, 'indices': indices,
                     'parts': parts, 'triangles': len(indices) // 3})
    triangles = 0
    for key, objects in batches.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        batch = bpy.context.object
        batch.name = name + '__' + key.split(' / ')[-1].replace(' ', '_')
        batch.data.calc_loop_triangles()
        triangles += len(batch.data.loop_triangles)
    source_points = [game(obj.matrix_world @ Vector(corner)) for obj in source.children_recursive if obj.type == 'MESH' for corner in obj.bound_box]
    low = [min(point[axis] for point in source_points) for axis in range(3)]
    high = [max(point[axis] for point in source_points) for axis in range(3)]
    stats.append({'name': name, 'triangles': triangles, 'materialBatches': len(batches),
                  'bounds': {'min': low, 'max': high}, 'actualHullSeats': ANCHORS[name]})

CONTACTS.write_text(json.dumps({'version': 1, 'geometryVersion': guide_data['geometryVersion'],
                               'coordinates': '+Y up, +Z bow, metres; own carrier local frames',
                               'source': 'Exact original rendered load members; contactFoot identifies fitted seats and stools behind the running skin.',
                               'prototypes': contacts}, separators=(',', ':')) + '\n')
bpy.ops.object.select_all(action='DESELECT')
for obj in exports:
    obj.select_set(True)
    for child in obj.children_recursive:
        child.select_set(True)
OUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUT), export_format='GLB', use_selection=True,
                          export_apply=True, export_extras=True, export_cameras=False,
                          export_lights=False, export_animations=False, export_yup=True)
record = {
    'title': 'Nomad Procession route-seated carrier load frames',
    'generator': 'Original Blender source geometry authored from exact route samples and raycast onto retained actual hull triangles.',
    'source': Path(__file__).name, 'blend': BLEND.name,
    'runtimeAsset': str(OUT.relative_to(GAME)), 'collision': CONTACTS.name,
    'roadGuides': GUIDES.name, 'sourceHull': HULL.name,
    'coordinates': '+Y up, +Z bow; metres in each matching carrier local frame; root names equal carrier IDs.',
    'rights': 'Project-authored geometry and existing project-owned scalar PBR material aliases; no external models or images.',
    'clearance': 'Main I-section fronts are 10.5 world metres behind the sampled skin before between-sample curvature; fitted upper saddle plates meet its 1.4 metre slab underside. Exact raycast hull seats are retained per prototype. The outboard Saltwind launch extension retains a full-depth tied load arm with separated actual keel roots.',
    'prototypes': stats,
    'totalTriangles': sum(entry['triangles'] for entry in stats),
    'materials': [material.name for material in M.values()],
    'hashes': {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in [Path(__file__), BLEND, OUT, CONTACTS, GUIDES, HULL]},
}
(HERE / 'route-supports-provenance.json').write_text(json.dumps(record, indent=2) + '\n')
print('NOMAD_ROUTE_SUPPORTS ' + json.dumps({'output': str(OUT), 'totalTriangles': record['totalTriangles'], 'prototypes': [{key: value for key, value in entry.items() if key != 'actualHullSeats'} for entry in stats]}))
