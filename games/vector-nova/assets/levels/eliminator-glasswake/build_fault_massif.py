"""Original thick fault massif for one Glasswake Fracture art prototype.

Blender --background --factory-startup --python build_fault_massif.py.
Metres: +Y up, +X outboard, +Z along shore. Foot is closed at exactly Y=0.
Canonical Glasswake geometry is read-only; only its five scalar material roles
and project-owned scene concept guide this independent editable source.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import struct

import bmesh
import bpy
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

ASSET = Path(__file__).resolve().parent
GAME = ASSET.parents[2]
OUT = GAME / 'public/assets/levels/eliminator-glasswake/fault-massif.glb'
BLEND = ASSET / 'fault-massif.blend'
MANIFEST = ASSET / 'fault-massif-manifest.json'
CANONICAL = GAME / 'public/assets/levels/glasswake/glasswake-environment-v5.glb'
ROLE_NAMES = [
    'Pale fractured wind-polished ice',
    'Blue compact ice planes',
    'Cobalt buried blue-black core',
    'Opaque frost crust',
    'Fresh fracture blue edges',
]
N, LEVELS = 96, 32


def xyz(point):
    return Vector((point[0], -point[2], point[1]))


def game(point):
    return [point.x, point.z, -point.y]


def smooth(value):
    t = max(0, min(1, value))
    return t * t * (3 - 2 * t)


def top_height(x, z):
    # Unequal descending plateau shoulders, not a level rounded block or a
    # centred mountain cone. Long linear slopes retain broad planar normals.
    steps = [(-180, 190), (-145, 225), (-120, 220), (-92, 290),
             (-70, 300), (-42, 395), (-8, 410), (26, 445),
             (72, 450), (106, 425), (132, 370), (180, 350)]
    y = steps[-1][1]
    for (a, low), (b, high) in zip(steps, steps[1:]):
        if z <= b:
            y = low + (high - low) * max(0, min(1, (z - a) / (b - a)))
            break
    y += 12 * math.tanh((x - 85) / 45) - 11 * smooth((x - 170) / 40)
    return max(175, min(450, y))


def perimeter(angle, t):
    c, s = math.cos(angle), math.sin(angle)
    cx = math.copysign(abs(c) ** .48, c)
    sz = math.copysign(abs(s) ** .50, s)
    shoulder = smooth((t - .81) / .19)
    z = 180 * sz * (1 - .14 * shoulder)
    nominal_y = top_height(95, z) * t
    front = -12 + 18 * smooth((nominal_y - 60) / 65)
    front += 20 * smooth((nominal_y - 180) / 70)
    front += 22 * smooth((nominal_y - 310) / 80)
    front += 12 * math.tanh((z + 74) / 24) - 7 * math.tanh((z - 85) / 18)
    # The same diagonal shear continues beyond the undercut into the outer
    # face, creating a load-bearing fault plane rather than a socket surround.
    front += 10 * math.tanh((nominal_y - .6 * z - 285) / 18)
    front += 10 * shoulder
    back = 202 + 7 * math.sin(z * .013 + .5) - 35 * smooth((t - .35) / .65)
    x = front + (back - front) * (cx + 1) / 2
    # A continuous broad footing blends to the upper geological section.
    foot_x = 95 + 115 * cx
    x = foot_x + (x - foot_x) * smooth(t / .14)
    x = max(-20, min(210, x))
    y = t * top_height(x, z)
    return (x, y, z)


bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for item in list(bpy.data.materials):
    bpy.data.materials.remove(item)
collection = bpy.data.collections.new('Editable source / connected glacial fault massif')
tooling = bpy.data.collections.new('Editable melt-hollow cutters / not exported')
bpy.context.scene.collection.children.link(collection)
bpy.context.scene.collection.children.link(tooling)
source = bpy.data.objects.new('SOURCE__fracture_massif', None)
collection.objects.link(source)
source['prototype'] = 'fracture_massif'

# Reuse exact owned canonical scalar colours/material names without importing
# or mutating any closed source mesh, material object, texture or runtime.
raw = CANONICAL.read_bytes()
length = struct.unpack_from('<I', raw, 12)[0]
canonical = json.loads(raw[20:20 + length])
recipes = {item['name']: item.get('pbrMetallicRoughness', {}) for item in canonical['materials']}
materials = []
for name in ROLE_NAMES:
    recipe = recipes[name]
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    color = tuple(recipe.get('baseColorFactor', [1, 1, 1, 1]))
    material.diffuse_color = color
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = color
    shader.inputs['Metallic'].default_value = recipe.get('metallicFactor', 0)
    shader.inputs['Roughness'].default_value = recipe.get('roughnessFactor', .5)
    materials.append(material)

vertices, faces, roles = [], [], []
for row in range(LEVELS):
    for column in range(N):
        vertices.append(perimeter(column * math.tau / N, row / (LEVELS - 1)))
for row in range(LEVELS - 1):
    for column in range(N):
        a = row * N + column
        b = row * N + (column + 1) % N
        faces.append((a, b, b + N, a + N))
        x, y, z = vertices[a]
        if row < 3:
            role = 2
        elif row > LEVELS - 5:
            role = 3
        elif x > 125:
            role = 1 if y > 120 else 2
        elif abs(y - .6 * z - 285) < 22:
            role = 4
        elif row < 16:
            role = 1
        else:
            role = 0
        roles.append(role)
foot = len(vertices)
vertices.append((95, 0, 0))
for column in range(N):
    faces.append((foot, (column + 1) % N, column))
    roles.append(2)
# Keep the accepted outer crown exactly. This concave boundary has no common
# radial visibility kernel: pulling concentric rings toward a centre folded the
# old cap. Constrained polygon triangulation and interior point insertion make
# the crown a single-valued XZ height surface without changing its silhouette.
boundary_start = (LEVELS - 1) * N
boundary = [(vertices[boundary_start + i][0], vertices[boundary_start + i][2]) for i in range(N)]
boundary_vectors = [Vector((x, z, 0)) for x, z in boundary]
lookup = {(round(point.x, 6), round(point.y, 6)): boundary_start + i for i, point in enumerate(boundary_vectors)}


def projected_area(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def xz(index):
    return (vertices[index][0], vertices[index][2])


cap_triangles = []
for triangle in tessellate_polygon([boundary_vectors]):
    indices = tuple(boundary_start + point if isinstance(point, int)
                    else lookup[(round(point.x, 6), round(point.y, 6))] for point in triangle)
    if projected_area(*(xz(index) for index in indices)) < 0:
        indices = (indices[0], indices[2], indices[1])
    cap_triangles.append(indices)
for x in range(math.ceil(min(point[0] for point in boundary) / 14) * 14,
               math.floor(max(point[0] for point in boundary) / 14) * 14 + 1, 14):
    for z in range(math.ceil(min(point[1] for point in boundary) / 14) * 14,
                   math.floor(max(point[1] for point in boundary) / 14) * 14 + 1, 14):
        point = (x, z)
        for index, (a, b, c) in enumerate(cap_triangles):
            # Skip points on existing edges instead of introducing T junctions.
            if min(projected_area(xz(a), xz(b), point),
                   projected_area(xz(b), xz(c), point),
                   projected_area(xz(c), xz(a), point)) <= .00001:
                continue
            vertex = len(vertices)
            vertices.append((x, top_height(x, z), z))
            cap_triangles[index] = (a, b, vertex)
            cap_triangles.extend([(b, c, vertex), (c, a, vertex)])
            break
cap_fold_count = sum(projected_area(*(xz(index) for index in triangle)) <= .000001 for triangle in cap_triangles)
if cap_fold_count:
    raise RuntimeError(f'Fault crown has {cap_fold_count} reversed or degenerate XZ triangles')
faces.extend(cap_triangles)
roles.extend([3] * len(cap_triangles))

mesh = bpy.data.meshes.new('Editable closed fault strata with a continuous thick crown')
mesh.from_pydata([xyz(point) for point in vertices], [], faces)
mesh.update()
for material in materials:
    mesh.materials.append(material)
for polygon, role in zip(mesh.polygons, roles):
    polygon.material_index = role
    polygon.use_smooth = role != 4
edit = bmesh.new()
edit.from_mesh(mesh)
bmesh.ops.recalc_face_normals(edit, faces=edit.faces)
edit.to_mesh(mesh)
edit.free()
if hasattr(mesh, 'set_sharp_from_angle'):
    mesh.set_sharp_from_angle(angle=.38)
sharp = mesh.attributes.get('sharp_edge') or mesh.attributes.new('sharp_edge', 'BOOLEAN', 'EDGE')
for edge in mesh.edges:
    a, b = edge.vertices
    # Only three major authored stratum setbacks are creased; fine texture is
    # left to the runtime tile, without little sculpted ridges or surface noise.
    if a < N * LEVELS and b < N * LEVELS and a // N == b // N and a // N in [8, 16, 24]:
        sharp.data[edge.index].value = True
body = bpy.data.objects.new('Fracture massif / closed thick geological body', mesh)
collection.objects.link(body)
body.parent = source


def fracture_undercut():
    # One off-centre oblique lens with unequal stepped lips. Several deep
    # polygonal returns lead to a closed rear face; no ellipsoid/spherical tool.
    lip = [(-120, 170), (-92, 202), (-52, 213), (-21, 244),
           (15, 256), (58, 288), (92, 305), (126, 335), (145, 347),
           (140, 384), (113, 382), (86, 365), (52, 370),
           (20, 336), (-12, 329), (-43, 294), (-71, 284),
           (-97, 244), (-120, 222)]
    points, polygons = [], []
    layers = [(-80, 1.12, 0, 0), (32, 1, 0, 0), (103, .72, 7, -4), (118, .25, 16, -9)]
    for x, scale, shift_z, shift_y in layers:
        for z, y in lip:
            points.append(xyz((x, 280 + (y - 280) * scale + shift_y,
                               15 + (z - 15) * scale + shift_z)))
    count = len(lip)
    polygons.append(tuple(reversed(range(count))))
    for row in range(len(layers) - 1):
        for column in range(count):
            a, b = row * count + column, row * count + (column + 1) % count
            polygons.append((a, b, b + count, a + count))
    polygons.append(tuple((len(layers) - 1) * count + i for i in range(count)))
    data = bpy.data.meshes.new('Editable wide oblique fracture lens with closed deep returns')
    data.from_pydata(points, [], polygons)
    data.update()
    tool = bpy.data.objects.new('TOOL / long irregular oblique undercut', data)
    tooling.objects.link(tool)
    for material in materials:
        tool.data.materials.append(material)
    for polygon in tool.data.polygons:
        polygon.material_index = 2
        polygon.use_smooth = False
    tool.data.update()
    edit = bmesh.new()
    edit.from_mesh(tool.data)
    bmesh.ops.recalc_face_normals(edit, faces=edit.faces)
    edit.to_mesh(tool.data)
    edit.free()
    tool.hide_render = True
    tool.hide_set(True)
    modifier = body.modifiers.new('Oblique undercut / deep planar fault returns', 'BOOLEAN')
    modifier.operation = 'DIFFERENCE'
    modifier.solver = 'EXACT'
    modifier.object = tool
    if hasattr(modifier, 'material_mode'):
        modifier.material_mode = 'INDEX'
    return tool


fracture_undercut()
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1
bpy.context.view_layer.update()
ASSET.mkdir(parents=True, exist_ok=True)
OUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))

dependencies = bpy.context.evaluated_depsgraph_get()
evaluated = bpy.data.meshes.new_from_object(body.evaluated_get(dependencies), preserve_all_data_layers=True, depsgraph=dependencies)
evaluated.calc_loop_triangles()
triangles = len(evaluated.loop_triangles)
normal_disagreements = 0
minimum_normal_alignment = 1
for triangle in evaluated.loop_triangles:
    a, b, c = [evaluated.vertices[index].co for index in triangle.vertices]
    geometric = (b - a).cross(c - a)
    if geometric.length_squared < .0000000001:
        continue
    normal = sum((evaluated.corner_normals[index].vector for index in triangle.loops), Vector((0, 0, 0)))
    if not all(math.isfinite(value) for value in (*a, *b, *c, *normal)):
        raise RuntimeError('Fault massif contains non-finite source positions/normals')
    alignment = geometric.normalized().dot(normal.normalized())
    minimum_normal_alignment = min(minimum_normal_alignment, alignment)
    normal_disagreements += alignment < -.1
if normal_disagreements:
    raise RuntimeError(f'Fault massif has {normal_disagreements} opposed geometric/split normals')
closed = bmesh.new()
closed.from_mesh(evaluated)
manifold = all(edge.is_manifold for edge in closed.edges)
boundary_edges = sum(edge.is_boundary for edge in closed.edges)
volume = closed.calc_volume(signed=True)
closed.free()
if not manifold or boundary_edges:
    raise RuntimeError(f'Fault massif must be a founded closed volume, boundary edges={boundary_edges}')
if triangles > 12000:
    raise RuntimeError(f'Fault massif geometry budget exceeded: {triangles} triangles')
export = bpy.data.objects.new('fracture_massif', None)
bpy.context.scene.collection.objects.link(export)
export['assetKind'] = 'eliminator-glasswake-original-fault-massif'
export['coordinates'] = 'metres; +Y up; +X outboard; +Z along shore; closed footing Y=0'
export['construction'] = 'Thick founded ice plateau, unequal descending fault shoulders, creased strata and one long oblique undercut'
copy = bpy.data.objects.new('fracture_massif__closed_fault_ice', evaluated)
bpy.context.scene.collection.objects.link(copy)
copy.parent = export
points = [game(vertex.co) for vertex in evaluated.vertices]
bpy.ops.object.select_all(action='DESELECT')
export.select_set(True)
copy.select_set(True)
bpy.context.view_layer.objects.active = copy
bpy.ops.export_scene.gltf(
    filepath=str(OUT), export_format='GLB', use_selection=True,
    export_apply=True, export_extras=True, export_yup=True,
    export_animations=False, export_cameras=False, export_lights=False,
    export_materials='EXPORT',
)


def exported_opening_reference(path):
    """Measure the actual new cobalt/exterior rim after glTF material splits."""
    data = path.read_bytes()
    length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + length])
    binary = memoryview(data)[20 + length + 8:]
    core, exterior = [], []
    for item in document['meshes']:
        for primitive in item['primitives']:
            accessor = document['accessors'][primitive['attributes']['POSITION']]
            view = document['bufferViews'][accessor['bufferView']]
            offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
            target = core if document['materials'][primitive['material']]['name'] == ROLE_NAMES[2] else exterior
            for i in range(accessor['count']):
                target.append(struct.unpack_from('<fff', binary, offset + i * view.get('byteStride', 12)))
    key = lambda point: tuple(round(value * 1000) for value in point)
    exterior_keys = {key(point) for point in exterior}
    rim = [point for point in core if 135 < point[1] < 410 and -150 < point[2] < 175
           and point[0] < 115 and key(point) in exterior_keys]
    if not rim:
        raise RuntimeError('Fault undercut has no measured cobalt/exterior opening rim')
    return {'mouthReference': [sum(point[k] for point in rim) / len(rim) for k in range(3)],
            'mouthReferenceMethod': 'Mean shared cobalt/exterior rim vertices in the exported GLB',
            'sharedRimVertices': len(rim)}


opening_reference = exported_opening_reference(OUT)
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
manifest = {
    'id': 'eliminator-glasswake-fault-massif-v2',
    'generator': 'Original project-authored background Blender geometry',
    'rights': 'Original editable project geometry and canonical project-owned scalar ice recipes. Project-owned generated scene reference guides form only. No third-party assets or embedded textures.',
    'coordinates': 'metres; +Y up; +X outboard; +Z along shore; identity root; founded closed foot Y=0',
    'root': 'fracture_massif',
    'source': {'file': str(Path(__file__).relative_to(GAME)), 'sha256': sha(Path(__file__))},
    'blend': {'file': str(BLEND.relative_to(GAME)), 'sha256': sha(BLEND)},
    'runtimeAsset': {'file': str(OUT.relative_to(GAME)), 'sha256': sha(OUT), 'bytes': OUT.stat().st_size},
    'reference': {
        'file': 'assets/levels/glasswake/scene-reference.png',
        'sha256': sha(GAME / 'assets/levels/glasswake/scene-reference.png'),
        'prompt': 'assets/levels/glasswake/scene-prompt.txt',
        'promptSha256': sha(GAME / 'assets/levels/glasswake/scene-prompt.txt'),
    },
    'canonicalMaterialSource': {'file': str(CANONICAL.relative_to(GAME)), 'sha256': sha(CANONICAL)},
    'geometry': {
        'triangles': triangles, 'vertices': len(evaluated.vertices),
        'bounds': {'min': [min(point[k] for point in points) for k in range(3)],
                   'max': [max(point[k] for point in points) for k in range(3)]},
        'materialRoles': ROLE_NAMES, 'textures': [], 'closedManifold': manifold,
        'boundaryEdges': boundary_edges, 'signedVolumeCubicMetres': volume,
        'capVerification': {'method': 'Constrained boundary tessellation with interior height samples; no radial rings',
                            'triangles': len(cap_triangles), 'reversedOrDegenerateXZTriangles': cap_fold_count,
                            'outerBoundaryPreserved': True},
        'normalVerification': {'opposedTriangles': normal_disagreements, 'minimumGeometricSplitAlignment': minimum_normal_alignment},
        'features': {
            'obliqueUndercut': {'openingFaces': '-X', 'lipZSpan': [-120, 145], 'lipYSpan': [170, 384], 'closedRearX': 118, 'type': 'Irregular long stepped planar lens; no ellipsoid tool', **opening_reference},
            'plateau': {'highShoulderZ': [26, 106], 'lowerConnectingShoulderZ': [-180, -70], 'majorCreasedStrata': [8, 16, 24]},
            'compactIceStratum': {'sourceRows': [3, 15], 'upperBoundary': 'Complete formed/creased ring 16, not per-corner world-height thresholds'},
        },
    },
}
MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'asset': str(OUT), 'triangles': triangles, 'bounds': manifest['geometry']['bounds'], 'manifold': manifold, 'sha256': sha(OUT)}))
