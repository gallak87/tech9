"""Original editable heavy receiver service bay for Ravel Sailbreak.

Blender --background --factory-startup --python build_receiver_bay.py.
Metres: +Y up, +Z toward the mating back plane; the open front faces -Z.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

ASSET = Path(__file__).resolve().parent
GAME = ASSET.parents[2]
OUT = GAME / 'public/assets/levels/freestyle-ravel/receiver-bay.glb'
BLEND = ASSET / 'receiver-bay.blend'
MANIFEST = ASSET / 'receiver-bay-manifest.json'


def xyz(point):
    return Vector((point[0], -point[2], point[1]))


def game(point):
    return [point.x, point.z, -point.y]


bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for item in list(bpy.data.materials):
    bpy.data.materials.remove(item)
collection = bpy.data.collections.new('Editable source / heavy receiver working bay')
tooling = bpy.data.collections.new('Editable Boolean tools / not exported')
bpy.context.scene.collection.children.link(collection)
bpy.context.scene.collection.children.link(tooling)
source = bpy.data.objects.new('SOURCE__receiver_service_bay', None)
collection.objects.link(source)
source['prototype'] = 'receiver_service_bay'
source['matingPlane'] = '+Z back plane at Z=0; root=(0,0,0)'


def material(name, color, metal, roughness):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.diffuse_color = (*color, 1)
    shader = result.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Roughness'].default_value = roughness
    return result


MATERIALS = {
    'graphite': material('Graphite / service bay load chassis', (.028, .044, .051), .53, .38),
    'titanium': material('Titanium / formed service bay shell', (.42, .49, .51), .83, .29),
    'copper': material('Copper / seated winding roller', (.46, .235, .10), .8, .32),
}


def own(obj, name, role):
    obj.name = 'Receiver working bay / ' + name
    obj.parent = source
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    collection.objects.link(obj)
    obj.data.materials.append(MATERIALS[role])
    return obj


def finish(obj, radius=.6):
    if radius:
        bevel = obj.modifiers.new('Continuous formed edge radius', 'BEVEL')
        bevel.width = radius
        bevel.segments = 2
        bevel.limit_method = 'ANGLE'
        bevel.angle_limit = .4
        bevel.harden_normals = True
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    normals = obj.modifiers.new('Weighted broad-face finish', 'WEIGHTED_NORMAL')
    normals.keep_sharp = True
    normals.weight = 40
    return obj


def box(name, centre, dimensions, role, radius=.6):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(centre))
    obj = own(bpy.context.object, name, role)
    obj.scale = (dimensions[0], dimensions[2], dimensions[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, radius)


def prism(name, polygon, axis, low, high, role, radius=.6):
    # Polygon is defined in the other two game axes, then extruded as a closed
    # structural solid; real negative spaces are cut with live Boolean tools.
    def point(a, b, distance):
        if axis == 'x':
            return (distance, a, b)
        return (a, distance, b)
    vertices = [xyz(point(a, b, distance)) for distance in [low, high] for a, b in polygon]
    count = len(polygon)
    faces = [tuple(reversed(range(count))), tuple(range(count, 2 * count))]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    mesh = bpy.data.meshes.new('Editable closed formed profile')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    own(obj, name, role)
    # Correct arbitrary authoring-plane winding before bores and bevels.
    import bmesh
    edit = bmesh.new()
    edit.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(edit, faces=edit.faces)
    edit.to_mesh(mesh)
    edit.free()
    return finish(obj, radius)


def open_window(obj, side):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz((side * 43.5, 15.5, -34)))
    tool = bpy.context.object
    tool.name = 'TOOL / genuine service-side aperture'
    tool.scale = (18, 34, 13)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for old in list(tool.users_collection):
        old.objects.unlink(tool)
    tooling.objects.link(tool)
    tool.hide_render = True
    tool.hide_set(True)
    modifier = obj.modifiers.new('Actual open side working bay', 'BOOLEAN')
    modifier.operation = 'DIFFERENCE'
    modifier.solver = 'EXACT'
    modifier.object = tool
    # The cutter precedes the formed edge treatment.
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_move_up(modifier=modifier.name)
    bpy.ops.object.modifier_move_up(modifier=modifier.name)


def annulus(name, centre, profile, role, segments=28):
    vertices, faces = [], []
    for ring in range(segments):
        angle = 2 * math.pi * ring / segments
        for axial, radius in profile:
            vertices.append(xyz((centre[0] + axial, centre[1] + math.cos(angle) * radius,
                                 centre[2] + math.sin(angle) * radius)))
    width = len(profile)
    for ring in range(segments):
        for p in range(width):
            faces.append((ring * width + p, ((ring + 1) % segments) * width + p,
                          ((ring + 1) % segments) * width + (p + 1) % width,
                          ring * width + (p + 1) % width))
    mesh = bpy.data.meshes.new('Editable axial formed winding profile')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    own(obj, name, role)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


floor_plan = [(-42, -70), (42, -70), (46, -66), (46, -8), (38, 0), (-38, 0), (-46, -8), (-46, -66)]
roof_plan = [(-44, -72), (44, -72), (48, -66), (48, -8), (40, 0), (-40, 0), (-48, -8), (-48, -66)]
prism('continuous three-metre working floor', floor_plan, 'y', -3, 0, 'graphite', .4)
prism('deep closed roof load carrier', roof_plan, 'y', 26.3, 30.3, 'graphite', .8)
prism('formed overhanging titanium canopy', roof_plan, 'y', 30.1, 32, 'titanium', .6)
box('flush front floor threshold', (0, -.6, -67), (84, 1.2, 5), 'titanium', .3)

# Sloped-front shoulders have large actual windows, leaving complete piers at
# the two ends, a continuous sill and a continuous roof-support lintel.
cheek_profile = [(0, -68), (13, -68), (27.2, -58), (27.2, -3), (0, -3)]
for side in [-1, 1]:
    obj = prism('formed load cheek with open working aperture', cheek_profile, 'x',
                side * 43 - 4, side * 43 + 4, 'graphite', .9)
    open_window(obj, side)
    box('continuous titanium side sill', (side * 43, 2.0, -34), (7.8, 3.5, 60), 'titanium', .5)

box('closed rear shear bulkhead', (0, 13.2, -2), (82, 26.4, 4), 'graphite', .6)
box('central full-depth mating load collar', (0, -.3, -2.5), (40, 21.4, 5), 'graphite', 1)
box('inside rear header seat', (0, 24.1, -5), (78, 3.6, 4), 'titanium', .5)

# Deep triangular returns are continuous closed solids, rooted at the mating
# plane. They carry the broad floor back into the C-keel rather than float it.
return_profile = [(-3, -66), (-3, 0), (-11.5, 0)]
for x in [-28, 28]:
    prism('triangular underfloor load return', return_profile, 'x', x - 4, x + 4, 'graphite', .55)
prism('central rooted lower keel', [(-3, -54), (-3, 0), (-11.5, 0)], 'x', -4, 4, 'titanium', .5)

# One large working roller occupies the back half. Its shaft and annular
# bearings visibly seat into raised load beds connected to the real floor.
roller_profile = [(-22, 3.9), (-22, 8.0), (-20.5, 8.8), (-18.5, 8.8),
                  (-17.8, 8.1), (-11, 8.1), (-10.3, 8.7), (-8.5, 8.7),
                  (-7.8, 8.1), (7.8, 8.1), (8.5, 8.7), (10.3, 8.7),
                  (11, 8.1), (17.8, 8.1), (18.5, 8.8), (20.5, 8.8),
                  (22, 8.0), (22, 3.9)]
annulus('broad seated copper winding drum', (0, 12, -27), roller_profile, 'copper', 28)
annulus('continuous open machined drum shaft', (0, 12, -27),
        [(-33, 1.4), (-33, 3.6), (33, 3.6), (33, 1.4)], 'titanium', 24)
for x in [-27, 27]:
    box('roller full-footprint floor saddle', (x, .8, -27), (16, 1.6, 32), 'titanium', .45)
    box('deep seated bearing load pedestal', (x, 4.2, -27), (12, 8.4, 23), 'graphite', .7)
    annulus('formed annular bearing and open service throat', (x, 12, -27),
            [(-3.8, 4.05), (-3.8, 9.4), (-2.7, 10.6), (2.7, 10.6),
             (3.8, 9.4), (3.8, 4.05)], 'titanium', 28)

bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1
bpy.context.view_layer.update()
ASSET.mkdir(parents=True, exist_ok=True)
OUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))

export = bpy.data.objects.new('receiver_service_bay', None)
bpy.context.scene.collection.objects.link(export)
export['assetKind'] = 'freestyle-ravel-heavy-working-bay'
export['matingPlane'] = source['matingPlane']
export['construction'] = 'Deep open front; genuine side apertures; seated drum; continuous floor, roof and rooted underfloor returns'
dependencies = bpy.context.evaluated_depsgraph_get()
batches = {}
for obj in source.children_recursive:
    if obj.type != 'MESH':
        continue
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(dependencies), preserve_all_data_layers=True, depsgraph=dependencies)
    clone = bpy.data.objects.new('EXPORT__' + obj.name, mesh)
    bpy.context.scene.collection.objects.link(clone)
    clone.matrix_world = obj.matrix_world.copy()
    clone.parent = export
    batches.setdefault(obj.data.materials[0].name, []).append(clone)
triangles = 0
for role, objects in batches.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    batch = bpy.context.object
    batch.name = 'receiver_service_bay__' + role.split('/')[0].strip().lower()
    batch.data.calc_loop_triangles()
    triangles += len(batch.data.loop_triangles)
anchors = {'mating_root': [0, 0, 0], 'front_floor': [0, 0, -70]}
for name, point in anchors.items():
    node = bpy.data.objects.new('receiver_service_bay__' + name, None)
    bpy.context.scene.collection.objects.link(node)
    node.parent = export
    node.location = xyz(point)
    node['anchorKind'] = 'service-bay-root' if name == 'mating_root' else 'service-floor'
bpy.context.view_layer.update()
points = [game(obj.matrix_world @ vertex.co) for obj in export.children_recursive if obj.type == 'MESH' for vertex in obj.data.vertices]
bpy.ops.object.select_all(action='DESELECT')
export.select_set(True)
for obj in export.children_recursive:
    obj.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=str(OUT), export_format='GLB', use_selection=True,
    export_apply=True, export_extras=True, export_yup=True,
    export_animations=False, export_cameras=False, export_lights=False,
    export_materials='EXPORT',
)

sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
manifest = {
    'id': 'freestyle-ravel-receiver-service-bay-v1',
    'generator': 'Original project-authored background Blender geometry',
    'rights': 'Original editable project geometry and scalar PBR materials. Existing project-owned Ravel concepts are reference-only. No third-party assets or textures.',
    'coordinates': 'metres; +Y up; +Z mating/back at0; open front faces-Z; identity root',
    'root': 'receiver_service_bay',
    'source': {'file': str(Path(__file__).relative_to(GAME)), 'sha256': sha(Path(__file__))},
    'blend': {'file': str(BLEND.relative_to(GAME)), 'sha256': sha(BLEND)},
    'runtimeAsset': {'file': str(OUT.relative_to(GAME)), 'sha256': sha(OUT), 'bytes': OUT.stat().st_size},
    'referenceImages': [
        {'file': 'assets/levels/ravel/reference/' + name, 'sha256': sha(GAME / 'assets/levels/ravel/reference' / name)}
        for name in ['ravel-anchor-narrows-concept.png', 'ravel-crown-fold-concept.png']
    ],
    'geometry': {
        'triangles': triangles, 'materialRoles': list(batches), 'textures': [],
        'bounds': {'min': [min(point[k] for point in points) for k in range(3)],
                   'max': [max(point[k] for point in points) for k in range(3)]},
        'workingFloorY': 0, 'floorThickness': 3, 'roofCarrierThickness': 4,
        'construction': 'One coherent heavy working bay, with genuine side apertures, a large roller seated into the floor, closed load cheeks and roof, and triangular underfloor returns to the mating plane. No cables, floating props, textures or painted recesses.',
    },
    'anchors': anchors,
}
MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'asset': str(OUT), 'triangles': triangles, 'bounds': manifest['geometry']['bounds'], 'sha256': sha(OUT)}))
