"""Connected Nomad salt terraces and separately moving eroded riser brows.

First freeze the physical profile and run tools/export-nomad-ground-guides.mjs.
Then run Blender --background --factory-startup --threads 4 --python <this file>.
The two exported roots already use final rest-world coordinates and attach at
identity. Only nomad_salt_scarp_details moves with the convoy ground group.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import struct

import bpy
import bmesh
from mathutils import Vector

HERE = Path(__file__).resolve().parent
GAME = HERE.parents[4]
GUIDES = HERE / 'salt-ground-guides.json'
BLEND = HERE / 'salt-escarpments.blend'
OUT = GAME / 'public/assets/levels/nomad/salt-escarpments.glb'
CONTACTS = HERE / 'salt-escarpments-collision.json'

bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for item in list(bpy.data.materials):
    bpy.data.materials.remove(item)


def xyz(point):
    return Vector((point[0], -point[2], point[1]))


def game(point):
    return Vector((point.x, point.z, -point.y))


def smooth(a, b, value):
    t = max(0, min(1, (value - a) / (b - a)))
    return t * t * (3 - 2 * t)


def profile(knots, value):
    if value <= knots[0][0]:
        return knots[0][1]
    for (x0, y0), (x1, y1) in zip(knots, knots[1:]):
        if value <= x1:
            return y0 + (y1 - y0) * (value - x0) / (x1 - x0)
    return knots[-1][1]


def material(name, color, roughness):
    item = bpy.data.materials.new('Nomad terrain / ' + name)
    item.diffuse_color = (*color, 1)
    item.use_nodes = True
    node = item.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Metallic'].default_value = 0
    node.inputs['Roughness'].default_value = roughness
    return item


MATERIALS = [
    # Root replaces only this alias with saltMaterial(clock). The sculpted
    # moving brows retain scalar finish and never scroll that salt a second time.
    material('salt profile floor', (.64, .665, .635), .95),
    material('white salt crust', (.64, .665, .635), .95),
    material('fresh carbonate cut', (.74, .73, .665), .90),
    material('pale mineral interbed', (.40, .425, .39), .97),
]
G = json.loads(GUIDES.read_text())
KNOTS = [(row['x'], row['heightOffset']) for row in G['groundProfileKnots']]
HEIGHT, GRADE = G['saltPlane']['height'], G['saltPlane']['grade']
DOMAIN = G['staticDomain']


def ground(x, z):
    return HEIGHT - GRADE * z + profile(KNOTS, x)


SOURCE_ROOTS, SOURCE_INFO = [], []


def root(name, role, motion):
    collection = bpy.data.collections.new('Editable salt basin / ' + role)
    bpy.context.scene.collection.children.link(collection)
    parent = bpy.data.objects.new('SOURCE__' + name, None)
    collection.objects.link(parent)
    SOURCE_ROOTS.append(parent)
    SOURCE_INFO.append({'name': name, 'role': role, 'motion': motion})
    return parent


def mesh(parent, name, points, faces, materials):
    # Reused contact vertices close the ends of the relief without coincident
    # opposite faces. Discard unused and degenerate source vertices before the
    # one evaluated render/native triangulation.
    clean, clean_materials, seen = [], [], set()
    for face, index in zip(faces, materials):
        face = tuple(dict.fromkeys(face))
        if len(face) < 3:
            continue
        key = tuple(sorted(face))
        if key in seen:
            continue
        a, b, c = [Vector(points[i]) for i in face[:3]]
        if (b - a).cross(c - a).length_squared < 1e-12:
            continue
        seen.add(key)
        clean.append(face)
        clean_materials.append(index)
    used = sorted({index for face in clean for index in face})
    remap = {old: new for new, old in enumerate(used)}
    data = bpy.data.meshes.new(name)
    data.from_pydata([xyz(points[index]) for index in used], [],
                     [tuple(remap[index] for index in face) for face in clean])
    data.update()
    for item in MATERIALS:
        data.materials.append(item)
    for polygon, index in zip(data.polygons, clean_materials):
        polygon.material_index = index
        polygon.use_smooth = False
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bm.verts.index_update()
    by_vertices = {}
    for face in bm.faces:
        key = tuple(sorted(vertex.index for vertex in face.verts))
        by_vertices.setdefault(key, []).append(face)
    # At an apron corner, three base vertices and one raised vertex can make
    # opposite top/bottom triangles over the same zero-volume patch. Remove
    # both from the editable source before render/native extraction.
    duplicates = [face for faces in by_vertices.values() if len(faces) > 1 for face in faces]
    if duplicates:
        bmesh.ops.delete(bm, geom=duplicates, context='FACES_ONLY')
    unused = [vertex for vertex in bm.verts if not vertex.link_faces]
    if unused:
        bmesh.ops.delete(bm, geom=unused, context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    parent.users_collection[0].objects.link(obj)
    obj.parent = parent
    return obj


floor = root('nomad_salt_terraces', 'continuous profile floor and connected risers', 'static')
# Subdivide only for contact precision and real narrow geological interbeds;
# every added point remains on the exact immutable piecewise-planar profile.
columns = set(x for x, _ in KNOTS)
for (x0, y0), (x1, y1) in zip(KNOTS, KNOTS[1:]):
    if abs(y1 - y0) > 1e-7:
        for fraction in [.24, .252, .64, .652]:
            columns.add(x0 + (x1 - x0) * fraction)
columns = sorted(columns)
near = G['detailedFloorDomain']
rows = [DOMAIN['minZ'], near['minZ']]
z = near['minZ'] + 1000
while z < near['maxZ']:
    rows.append(z)
    z += 1000
rows += [near['maxZ'], DOMAIN['maxZ']]
rows = sorted(set(rows))
nx, nz = len(columns), len(rows)
points = [(x, ground(x, z), z) for z in rows for x in columns]
bottom_y = min(point[1] for point in points) - 250
points += [(x, bottom_y, z) for z in rows for x in columns]
offset = nx * nz
faces, materials = [], []
for iz in range(nz - 1):
    for ix in range(nx - 1):
        a, b, c, d = iz * nx + ix, iz * nx + ix + 1, (iz + 1) * nx + ix + 1, (iz + 1) * nx + ix
        x = (columns[ix] + columns[ix + 1]) / 2
        material_index = 0
        for (x0, h0), (x1, h1) in zip(KNOTS, KNOTS[1:]):
            if x0 <= x <= x1 and abs(h1 - h0) > 1e-7:
                u = (x - x0) / (x1 - x0)
                material_index = 3 if .24 < u < .252 or .64 < u < .652 else 2
                break
        faces.extend([(a, d, c, b), (offset + a, offset + b, offset + c, offset + d)])
        materials.extend([material_index, 0])
for iz in range(nz - 1):
    for ix in [0, nx - 1]:
        a, b = iz * nx + ix, (iz + 1) * nx + ix
        faces.append((a, b, offset + b, offset + a))
        materials.append(0)
for ix in range(nx - 1):
    for iz in [0, nz - 1]:
        a, b = iz * nx + ix, iz * nx + ix + 1
        faces.append((a, b, offset + b, offset + a))
        materials.append(0)
mesh(floor, 'exact salt shelf skin, connected risers and closed basin body', points, faces, materials)

scarps = root('nomad_salt_scarp_details', 'sculpted connected salt brows and eroded interbeds', 'nomad-ground')
US = [0, .01, .025, .04, .055, .075, .10, .13, .16, .20, .26,
      .35, .45, .535, .55, .61, .70, .76, .775, .86, .94, 1]
# The substantial crest lives above the upper profile edge. A broad low swell
# farther down a steep riser remains hidden behind its mathematically straight
# brow and cannot establish geological form from the racing camera.
RELIEF = [(0, 0), (.01, .85), (.025, 1), (.075, .98), (.13, .90),
          (.17, .50), (.25, .24), (.40, .15), (.70, .04), (1, 0)]
for band in G['detailBands']:
    shape = G['detailShape']
    nx = len(US)
    # A speed-driven domain extension adds rows at the same world-space step;
    # it never stretches existing gullies or resamples the authored cross-cut.
    step = shape['maxLongitudinalStep']
    rows = [band['minZ'] + iz * step for iz in range(math.ceil(band['length'] / step))]
    rows.append(band['maxZ'])
    nz = len(rows)
    points, top, bottom = [], [], []
    for iz, z in enumerate(rows):
        end = smooth(band['minZ'], band['minZ'] + shape['fadeLength'], z)
        end *= 1 - smooth(band['maxZ'] - shape['fadeLength'], band['maxZ'], z)
        # Unequal broad drainage openings and slow fractured shoulders make a
        # formed geological brow, not a repeated decorative wave or narrow rail.
        phase = band['phase']
        crest = .68 + .20 * math.sin(z * math.tau / shape['crestLength'] + phase)
        crest += .12 * math.sin(z * math.tau / shape['shoulderLength'] - phase)
        cell = (z + phase * 850 + shape['gullyPeriod'] / 2) % shape['gullyPeriod'] - shape['gullyPeriod'] / 2
        drainage = sum(depth * math.exp(-((cell - center) / width) ** 2)
            for center, width, depth in [(-2200, 520, .98), (-100, 850, .95), (2200, 430, .995)])
        for u in US:
            retreat = .018 * math.sin(z * math.tau / 3700 + phase) * math.sin(math.pi * u)
            x = band['minX'] + (u + retreat) * (band['maxX'] - band['minX'])
            base = ground(x, z)
            lift = band['relief'] * profile(RELIEF, u) * end * crest
            lift *= 1 - drainage * (.95 + .05 * math.sin(math.pi * u))
            if iz in [0, nz - 1] or u in [0, 1]:
                lift = 0
            bottom.append(len(points))
            points.append((x, base, z))
            if lift <= 1e-8:
                top.append(bottom[-1])
            else:
                top.append(len(points))
                points.append((x, base + lift, z))
    faces, materials = [], []
    for iz in range(nz - 1):
        for ix in range(nx - 1):
            a, b, c, d = iz * nx + ix, iz * nx + ix + 1, (iz + 1) * nx + ix + 1, (iz + 1) * nx + ix
            u = (US[ix] + US[ix + 1]) / 2
            mat = 3 if .535 < u < .55 or .76 < u < .775 else (2 if u > .18 else 1)
            faces.extend([(top[a], top[d], top[c], top[b]), (bottom[a], bottom[b], bottom[c], bottom[d])])
            materials.extend([mat, 2])
    for iz in range(nz - 1):
        for ix in [0, nx - 1]:
            a, b = iz * nx + ix, (iz + 1) * nx + ix
            faces.append((top[a], top[b], bottom[b], bottom[a]))
            materials.append(2)
    for ix in range(nx - 1):
        for iz in [0, nz - 1]:
            a, b = iz * nx + ix, iz * nx + ix + 1
            faces.append((top[a], top[b], bottom[b], bottom[a]))
            materials.append(2)
    mesh(scarps, band['id'] + ' / grounded asymmetric eroded carbonate brow', points, faces, materials)

bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.context.view_layer.update()
graph = bpy.context.evaluated_depsgraph_get()
records, colliders, export_roots = [], [], []
for parent, info in zip(SOURCE_ROOTS, SOURCE_INFO):
    name = info['name']
    export = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(export)
    export_roots.append(export)
    positions, indices, parts, batches, contacts = [], [], [], {}, []
    for obj in parent.children_recursive:
        if obj.type != 'MESH':
            continue
        data = bpy.data.meshes.new_from_object(obj.evaluated_get(graph), preserve_all_data_layers=True, depsgraph=graph)
        data.transform(obj.matrix_world)
        data.calc_loop_triangles()
        begin, offset = len(indices), len(positions) // 3
        for vertex in data.vertices:
            point = game(vertex.co)
            if abs(point.y - ground(point.x, point.z)) < .001:
                contacts.append(len(positions) // 3)
            positions.extend([round(value, 6) for value in point])
        for tri in data.loop_triangles:
            indices.extend([offset + value for value in tri.vertices])
        parts.append({'name': obj.name, 'indexStart': begin, 'indexCount': len(indices) - begin})
        for material_index, mat in enumerate(MATERIALS):
            selected = [tri for tri in data.loop_triangles if tri.material_index == material_index]
            if not selected:
                continue
            batch_data = bpy.data.meshes.new(name + ' / ' + mat.name)
            batch_data.from_pydata([tuple(vertex.co) for vertex in data.vertices], [], [tuple(tri.vertices) for tri in selected])
            batch_data.update()
            batch_data.materials.append(mat)
            for polygon in batch_data.polygons:
                polygon.use_smooth = False
            copy = bpy.data.objects.new('EXPORT__' + obj.name, batch_data)
            bpy.context.scene.collection.objects.link(copy)
            copy.parent = export
            batches.setdefault(mat.name, []).append(copy)
    for mat, objects in batches.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        bpy.context.object.name = name + '__' + mat.split(' / ')[-1].replace(' ', '_')
    low = [min(positions[axis::3]) for axis in range(3)]
    high = [max(positions[axis::3]) for axis in range(3)]
    colliders.append({**info, 'positions': positions, 'indices': indices,
        'parts': parts, 'groundContactVertices': contacts, 'triangles': len(indices) // 3})
    records.append({**info, 'triangles': len(indices) // 3, 'materialBatches': len(batches),
        'bounds': {'min': low, 'max': high}, 'groundContactVertices': len(contacts)})
CONTACTS.write_text(json.dumps({'version': 2, 'geometryVersion': G['geometryVersion'],
    'coordinates': '+Y up, +Z course; final rest-world metres. Identity root transforms.',
    'source': 'Every evaluated visible structural triangle, shared by render and native collision. The exact profile root is static; only sculpted details move with nomad-ground.',
    'prototypes': colliders}, separators=(',', ':')) + '\n')
bpy.ops.object.select_all(action='DESELECT')
for parent in export_roots:
    parent.select_set(True)
    for obj in parent.children_recursive:
        obj.select_set(True)
OUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUT), export_format='GLB', use_selection=True,
    export_apply=True, export_extras=True, export_yup=True, export_cameras=False,
    export_lights=False, export_animations=False)
raw = OUT.read_bytes()
gltf = json.loads(raw[20:20 + struct.unpack_from('<I', raw, 12)[0]])
actual_triangles = sum(gltf['accessors'][part['indices']]['count'] // 3 for item in gltf['meshes'] for part in item['primitives'])
assert actual_triangles == sum(item['triangles'] for item in records)
record = {'title': 'Nomad Procession / connected salt terraces and eroded riser brows',
    'generator': 'Original editable Blender profile extrusion with actual connected shelf risers, narrow geological interbeds and separately ground-seated sculpted brows with unequal drainage openings.',
    'source': Path(__file__).name, 'blend': BLEND.name,
    'runtimeAsset': str(OUT.relative_to(GAME)), 'collision': CONTACTS.name,
    'groundGuides': GUIDES.name, 'geometryVersion': G['geometryVersion'],
    'coordinates': '+Y up, +Z course; final rest-world metres, identity roots. nomad_salt_terraces stays static. nomad_salt_scarp_details translates only with nomad-ground and retains unanimated scalar materials.',
    'rights': 'Project-authored geometry and scalar carbonate finishes. No external models, imagery, scans or baked lighting.',
    'materials': [item.name for item in MATERIALS], 'prototypes': records,
    'staticDomain': DOMAIN, 'saltBenches': G['saltBenches'],
    'detailBands': G['detailBands'], 'detailCoverage': G['detailCoverage'],
    'detailMotion': G['detailMotion'], 'detailShape': G['detailShape'],
    'totalTriangles': actual_triangles,
    'hashes': {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in [Path(__file__), BLEND, OUT, CONTACTS, GUIDES]}}
(HERE / 'salt-escarpments-provenance.json').write_text(json.dumps(record, indent=2) + '\n')
print('NOMAD_SALT_TERRACES ' + json.dumps({'triangles': actual_triangles, 'prototypes': records}))
