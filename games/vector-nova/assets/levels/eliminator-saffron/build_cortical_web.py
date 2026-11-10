"""One original fused far-mouth cortical web for Saffron Ossuary.

Run Blender --background --factory-startup --python this_file.py.
The identity runtime root uses the canonical skull's native metre coordinates:
+X lateral, +Y up, +Z forward. Fit at fraction .245, scale1.2 through the
existing passage fitter; never move or modify the original fossil kit.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import re
import struct

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
GAME = HERE.parents[2]
OUT = GAME / 'public/assets/levels/eliminator-saffron/cortical-web.glb'
BLEND = HERE / 'cortical-web.blend'
MANIFEST = HERE / 'cortical-web-manifest.json'
CANONICAL = GAME / 'public/assets/levels/saffron/leviathan-kit.glb'
ROLE_NAMES = ['Saffron_pale_fossil', 'Saffron_chalk_edges', 'Saffron_marrow_ochre']
SOCKETS = {
    'A': {'position': [-73.2514, 63.4056, 289.2002], 'normal': [-.7000, .6383, .3202], 'triangle': 21916},
    'B': {'position': [69.1002, 69.1479, 294.5232], 'normal': [.6777, .6418, .3591], 'triangle': 21775},
    'C': {'position': [-5.9299, 114.3416, 304.5434], 'normal': [.0967, .0685, -.9929], 'triangle': 34005},
}
HUB = [-10, 58, 292]


def C(point):
    return Vector((point[0], -point[2], point[1]))


def G(point):
    return [point.x, point.z, -point.y]


def select(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def glb(path):
    data = path.read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + size]), memoryview(data)[28 + size:]


document, binary = glb(CANONICAL)


def accessor(index):
    item = document['accessors'][index]
    view = document['bufferViews'][item['bufferView']]
    scalar = {5121: 'B', 5123: 'H', 5125: 'I', 5126: 'f'}[item['componentType']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[item['type']]
    fmt = '<' + scalar * width
    step = view.get('byteStride', struct.calcsize(fmt))
    start = view.get('byteOffset', 0) + item.get('byteOffset', 0)
    return [struct.unpack_from(fmt, binary, start + i * step) for i in range(item['count'])]


def skull_triangles():
    root = next(i for i, node in enumerate(document['nodes']) if node.get('name') == 'skull')
    vertices, faces = [], []
    pending = [root]
    while pending:
        node = document['nodes'][pending.pop()]
        if node.get('matrix') or any(key in node for key in ['rotation', 'translation', 'scale']):
            # Canonical current source is common-coordinate identity. Do not
            # silently bake a future, incompatible source transform.
            assert node.get('translation', [0, 0, 0]) == [0, 0, 0]
            assert node.get('scale', [1, 1, 1]) == [1, 1, 1]
            assert node.get('rotation', [0, 0, 0, 1]) == [0, 0, 0, 1]
            assert not node.get('matrix')
        pending.extend(node.get('children', []))
        if 'mesh' not in node:
            continue
        for primitive in document['meshes'][node['mesh']]['primitives']:
            offset = len(vertices)
            positions = accessor(primitive['attributes']['POSITION'])
            indices = [value[0] for value in accessor(primitive['indices'])] if 'indices' in primitive else list(range(len(positions)))
            vertices.extend(C(point) for point in positions)
            faces.extend(tuple(offset + i for i in indices[j:j + 3]) for j in range(0, len(indices), 3))
    return vertices, faces


bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for material in list(bpy.data.materials):
    bpy.data.materials.remove(material)
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1
editable = bpy.data.collections.new('Editable source / three unequal tapering cortical plates')
bpy.context.scene.collection.children.link(editable)
runtime = bpy.data.collections.new('Runtime / one closed fused far-mouth web')
bpy.context.scene.collection.children.link(runtime)
materials = []
for name in ROLE_NAMES:
    recipe = next(material for material in document['materials'] if material['name'] == name)
    pbr = recipe.get('pbrMetallicRoughness', {})
    material = bpy.data.materials.new(name)
    material.diffuse_color = pbr.get('baseColorFactor', [.7, .6, .4, 1])
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = material.diffuse_color
    shader.inputs['Roughness'].default_value = max(.8, pbr.get('roughnessFactor', .8))
    shader.inputs['Metallic'].default_value = 0
    materials.append(material)


def catmull(points, count=8):
    output = []
    for j in range(len(points) - 1):
        p0, p1 = points[max(0, j - 1)], points[j]
        p2, p3 = points[j + 1], points[min(j + 2, len(points) - 1)]
        for k in range(count):
            t = k / count
            output.append(.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return output + [points[-1]]


def sample(values, t):
    station = t * (len(values) - 1)
    index = min(len(values) - 2, int(station))
    u = station - index
    u = u * u * (3 - 2 * u)
    return values[index] * (1 - u) + values[index + 1] * u


def blade(name, coordinates, widths, depths, phase):
    points = catmull([Vector(point) for point in coordinates])
    positions, faces, sides = [], [], 16
    for j, centre in enumerate(points):
        t = j / (len(points) - 1)
        tangent = points[min(j + 1, len(points) - 1)] - points[max(0, j - 1)]
        tangent.z = 0
        tangent.normalize()
        across = Vector((-tangent.y, tangent.x, 0))
        width = sample(widths, t) * (1 + .035 * math.sin(phase + t * 4.6))
        depth = sample(depths, t) * (1 + .045 * math.sin(phase * .7 + t * 3.4))
        for i in range(sides):
            a = i * math.tau / sides
            u = math.copysign(abs(math.cos(a)) ** .76, math.cos(a))
            v = math.copysign(abs(math.sin(a)) ** .85, math.sin(a))
            positions.append(C(centre + across * (u * width) + Vector((0, 0, v * depth))))
    for j in range(len(points) - 1):
        for i in range(sides):
            faces.append((j * sides + i, j * sides + (i + 1) % sides, (j + 1) * sides + (i + 1) % sides, (j + 1) * sides + i))
    faces += [tuple(range(sides - 1, -1, -1)), tuple((len(points) - 1) * sides + i for i in range(sides))]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(positions, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    editable.objects.link(obj)
    mesh.materials.append(materials[0])
    bm = bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh); bm.free()
    obj['controlPointsGame'] = json.dumps(coordinates)
    obj['halfWidthsMetres'] = widths
    obj['halfDepthsMetres'] = depths
    obj['construction'] = 'Original broad flattened tapered cortex; closed ends and actual depth, not round rods'
    return obj


def embedded(socket):
    item = SOCKETS[socket]
    return list(Vector(item['position']) - Vector(item['normal']) * 3)


sources = [
    blade('SOURCE / broad left cortical fan and sweeping lower fork',
          [embedded('A'), [-49, 65, 290], [-26, 60, 289], HUB],
          [12.5, 7.8, 6.8, 10.5], [7.2, 6.3, 4.9, 7.5], .2),
    blade('SOURCE / unequal right cortical bridge with tapered shoulder',
          [HUB, [10, 61, 296], [42, 72, 299], embedded('B')],
          [10.5, 6.8, 7.5, 13], [7.5, 4.8, 5.7, 7.3], 1.4),
    blade('SOURCE / off-centre rising neural lamina and cranial root',
          [HUB, [-19, 76, 296], [-12, 96, 299], embedded('C')],
          [9.5, 6.4, 7.2, 14], [6.5, 4.6, 5.2, 7.5], 2.7),
]

# Editable source parts remain. One evaluated duplicate carries the connected
# volume modifiers; no tool, canonical mesh or disconnected fragment exports.
copies = []
for obj in sources:
    copy = obj.copy(); copy.data = obj.data.copy()
    runtime.objects.link(copy); copies.append(copy)
bpy.ops.object.select_all(action='DESELECT')
for obj in copies:
    obj.select_set(True)
bpy.context.view_layer.objects.active = copies[0]
bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
body.name = 'SOURCE / fused three-way cortical web with real unequal negative spaces'
remesh = body.modifiers.new('Continuous fused broad cortical roots', 'REMESH')
remesh.mode = 'VOXEL'; remesh.voxel_size = .80; remesh.adaptivity = .16; remesh.use_smooth_shade = True
smooth = body.modifiers.new('Continuous eroded cortical junctions', 'SMOOTH')
smooth.factor = .27; smooth.iterations = 2
decimate = body.modifiers.new('Bounded clean cortical export', 'DECIMATE')
decimate.ratio = .78
for obj in sources:
    obj.hide_render = True
    obj.hide_set(True)
bpy.context.view_layer.update()
deps = bpy.context.evaluated_depsgraph_get()
evaluated = bpy.data.meshes.new_from_object(body.evaluated_get(deps), preserve_all_data_layers=True, depsgraph=deps)
evaluated.name = 'Closed fused cortical Y / actual cavity-colour export'
for material in materials:
    if material.name not in [item.name for item in evaluated.materials]: evaluated.materials.append(material)
for polygon in evaluated.polygons:
    polygon.use_smooth = True
evaluated.update()
evaluated.calc_loop_triangles()
triangles = len(evaluated.loop_triangles)
if triangles > 10000:
    raise RuntimeError(f'One cortical web exceeds10000tri budget: {triangles}')
points = [G(vertex.co) for vertex in evaluated.vertices]
if min(point[1] for point in points) < 45:
    raise RuntimeError('Cortical web violates nativeY45 clearance; fix authoring instead of clipping geometry')
topology = bmesh.new(); topology.from_mesh(evaluated)
boundary = sum(edge.is_boundary for edge in topology.edges)
nonmanifold = sum(not edge.is_manifold for edge in topology.edges)
volume = topology.calc_volume(signed=True)
unseen = set(topology.verts); components = 0
while unseen:
    components += 1; pending = [unseen.pop()]
    while pending:
        vertex = pending.pop()
        for edge in vertex.link_edges:
            other = edge.other_vert(vertex)
            if other in unseen: unseen.remove(other); pending.append(other)
topology.free()
if boundary or nonmanifold or components != 1 or volume <= 0:
    raise RuntimeError(f'Web must be one closed outward volume: {boundary}/{nonmanifold}/{components}/{volume}')

# One cheap geometry-derived broad cavity bake. The canonical skull is a
# read-only occluder, so attachment shelter is real rather than painted rings.
skull_positions, skull_faces = skull_triangles()
ao_vertices = [vertex.co.copy() for vertex in evaluated.vertices]
ao_faces = [tuple(polygon.vertices) for polygon in evaluated.polygons]
offset = len(ao_vertices)
ao_vertices.extend(skull_positions)
ao_faces.extend(tuple(offset + i for i in face) for face in skull_faces)
tree = BVHTree.FromPolygons(ao_vertices, ao_faces, all_triangles=False)
ao = []
hemisphere = []
for i in range(12):
    radius = math.sqrt((i + .5) / 12)
    angle = i * math.pi * (3 - math.sqrt(5))
    hemisphere.append((radius * math.cos(angle), radius * math.sin(angle), math.sqrt(1 - radius * radius)))
for vertex in evaluated.vertices:
    normal = vertex.normal.normalized()
    tangent = normal.cross(Vector((0, 0, 1)))
    if tangent.length_squared < .01: tangent = normal.cross(Vector((0, 1, 0)))
    tangent.normalize(); across = normal.cross(tangent).normalized()
    obscured = 0
    for x, y, z in hemisphere:
        _, _, _, distance = tree.ray_cast(vertex.co + normal * .22, tangent * x + across * y + normal * z, 36)
        if distance is not None: obscured += max(0, 1 - (distance / 36) ** 2)
    ao.append(max(.48, 1 - .60 * obscured / 12))
neighbors = [set() for _ in evaluated.vertices]
for edge in evaluated.edges:
    a, b = edge.vertices; neighbors[a].add(b); neighbors[b].add(a)
for _ in range(2):
    ao = [.65 * value + .35 * sum(ao[j] for j in neighbors[i]) / len(neighbors[i]) if neighbors[i] else value for i, value in enumerate(ao)]
colours = evaluated.color_attributes.new(name='Cortical_shelter', type='FLOAT_COLOR', domain='CORNER')
for polygon in evaluated.polygons:
    value = sum(ao[index] for index in polygon.vertices) / len(polygon.vertices)
    normal = Vector(G(polygon.normal))
    # Broad anatomical roles, never a per-triangle height checkerboard.
    polygon.material_index = 2 if normal.z > .36 else 1 if normal.y > .70 and value > .87 else 0
    for loop_index in polygon.loop_indices:
        index = evaluated.loops[loop_index].vertex_index
        point = points[index]
        mineral = .025 * math.sin(point[0] * .11 + point[2] * .07) + .018 * math.sin(point[1] * .16 - point[2] * .05)
        shade = max(.40, min(1, (.94 + mineral) * ao[index]))
        colours.data[loop_index].color = (shade, shade * .975, shade * .93, 1)
evaluated.color_attributes.active_color = colours
evaluated.calc_loop_triangles()
finite = all(math.isfinite(value) for vertex in evaluated.vertices for value in (*vertex.co, *vertex.normal))
creased_polygons = set()
for triangle in evaluated.loop_triangles:
    a, b, c = [evaluated.vertices[index].co for index in triangle.vertices]
    normal = sum((evaluated.corner_normals[index].vector for index in triangle.loops), Vector((0, 0, 0)))
    if (b - a).cross(c - a).dot(normal) < -.00001:
        creased_polygons.add(triangle.polygon_index)
# Submetre concave junction facets may have an averaged shading normal on the
# wrong side of their real face. Give those few facets their proper geometric
# normal; never change winding, silhouette or hide the failed triangles.
for index in creased_polygons:
    evaluated.polygons[index].use_smooth = False
evaluated.update()
evaluated.calc_loop_triangles()
opposed = 0
for triangle in evaluated.loop_triangles:
    a, b, c = [evaluated.vertices[index].co for index in triangle.vertices]
    normal = sum((evaluated.corner_normals[index].vector for index in triangle.loops), Vector((0, 0, 0)))
    if (b - a).cross(c - a).dot(normal) < -.00001: opposed += 1
if not finite or opposed: raise RuntimeError(f'Invalid cortical export normals: finite={finite}, opposed={opposed}')

root = bpy.data.objects.new('cortical_web', None)
runtime.objects.link(root)
root['coordinates'] = 'Identity root, canonical skull-native metres, +X lateral/+Y up/+Z forward'
root['fit'] = 'Existing passage fitter at track fraction0.245, uniform scale1.2; canonical geometry unmodified'
root['construction'] = 'One fused tapered Y of thick fanned cortical plates; two unequal upper cells and broad open roadway below'
mesh = bpy.data.objects.new('cortical_web__fused_unequal_cortical_plates', evaluated)
runtime.objects.link(mesh); mesh.parent = root
for name, socket in SOCKETS.items():
    empty = bpy.data.objects.new('cortical_socket_' + name, None)
    runtime.objects.link(empty); empty.parent = root; empty.location = C(socket['position'])
    empty['canonicalSurfaceNormalGame'] = socket['normal']
    empty['canonicalPaleCortexTriangle'] = socket['triangle']
    empty['contact'] = 'Actual canonical skull surface; fan extends3metres inward along its measured normal'
body.hide_render = True; body.hide_set(True)
reference = bpy.data.images.load(str(GAME / 'assets/levels/saffron/scene-reference.png'))
reference.pack()
bpy.context.scene['reference'] = 'Original project-owned Saffron fossil concept and cranial_webs.py source language; canonical kit remains read-only'
bpy.context.scene['cavityBake'] = '12 deterministic cosine-weighted hemisphere rays/vertex,36m radius,0.22m offset,2 connected smoothing passes; actual new web+canonical skull occluders'
HERE.mkdir(parents=True, exist_ok=True); OUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True); mesh.select_set(True)
for child in root.children: child.select_set(True)
bpy.context.view_layer.objects.active = mesh
bpy.ops.export_scene.gltf(filepath=str(OUT), export_format='GLB', use_selection=True,
    export_apply=True, export_extras=True, export_yup=True, export_vertex_color='ACTIVE',
    export_animations=False, export_cameras=False, export_lights=False, export_materials='EXPORT')

sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
provenance = GAME / 'assets/levels/saffron/PROVENANCE.md'
prompt = re.search(r'Exact original fossil-scene generation prompt: “(.*?)”', provenance.read_text(), re.S).group(1)
manifest = {
    'id': 'eliminator-saffron-cortical-web-v1',
    'root': 'cortical_web',
    'rights': 'Original project-authored editable Blender geometry and project-owned canonical scalar material recipes. No third-party mesh, image or texture inputs.',
    'coordinates': 'metres;+X lateral,+Y up,+Z forward;identity root in canonical skull-native common coordinates',
    'fit': {'fraction': .245, 'scale': 1.2, 'fitter': 'createOssuaryPassageGeometry', 'minimumNativeY': 45},
    'source': {'file': str(Path(__file__).relative_to(GAME)), 'sha256': sha(Path(__file__))},
    'blend': {'file': str(BLEND.relative_to(GAME)), 'sha256': sha(BLEND)},
    'runtimeAsset': {'file': str(OUT.relative_to(GAME)), 'sha256': sha(OUT), 'bytes': OUT.stat().st_size},
    'reference': {'file': 'assets/levels/saffron/scene-reference.png', 'sha256': sha(GAME / 'assets/levels/saffron/scene-reference.png'),
        'provenance': str(provenance.relative_to(GAME)), 'provenanceSha256': sha(provenance),
        'exactOriginalPrompt': prompt, 'promptSha256': hashlib.sha256(prompt.encode()).hexdigest()},
    'techniqueReference': {'file': 'assets/levels/saffron/cranial_webs.py', 'sha256': sha(GAME / 'assets/levels/saffron/cranial_webs.py'),
        'use': 'Read-only project-owned modeling language; new independently authored higher branching web, no canonical edits'},
    'canonicalMaterialSource': {'file': str(CANONICAL.relative_to(GAME)), 'sha256': sha(CANONICAL)},
    'geometry': {'triangles': triangles, 'vertices': len(evaluated.vertices),
        'bounds': {'min': [min(point[k] for point in points) for k in range(3)], 'max': [max(point[k] for point in points) for k in range(3)]},
        'materialRoles': ROLE_NAMES, 'textures': [], 'components': components, 'closedManifold': True,
        'boundaryEdges': boundary, 'nonmanifoldEdges': nonmanifold, 'signedVolumeCubicMetres': volume,
        'finitePositionsNormals': finite, 'opposedTriangleNormals': opposed,
        'junctionGeometricNormalPolygons': len(creased_polygons),
        'minimumNativeY': min(point[1] for point in points),
        'cavityBake': {'samplesPerVertex': 12, 'rays': len(evaluated.vertices) * 12, 'radiusMetres': 36,
            'selfOffsetMetres': .22, 'connectedSmoothingPasses': 2, 'occluders': 'actual new closed web plus read-only canonical skull',
            'minimumVisibility': min(ao), 'meanVisibility': sum(ao) / len(ao)},
        'features': {'hubGame': HUB, 'primaryPlates': 3, 'openings': 'Two unequal upper cells jointly enclosed by original skull; broad road/sky opening below',
            'plateFullWidthMetres': [13, 28], 'plateFullDepthMetres': [9, 16], 'rootEmbeddingMetres': 3}},
    'sockets': SOCKETS,
}
MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'asset': str(OUT), 'triangles': triangles, 'bounds': manifest['geometry']['bounds'], 'bytes': OUT.stat().st_size, 'sha256': sha(OUT), 'components': components, 'boundaryEdges': boundary}))
