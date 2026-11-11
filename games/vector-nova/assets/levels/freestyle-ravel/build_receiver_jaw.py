"""Original editable formed clevis and service saddles for Ravel receivers.

Run Blender --background --factory-startup --python build_receiver_jaw.py.
Metres, game +Y up. Retained source pins run along X at Y=0,Z=+/-16,
X=-17..17,radius5. This asset supplies the seated housing, never extra pins.
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
OUT = GAME / 'public/assets/levels/freestyle-ravel/receiver-jaw.glb'
BLEND = ASSET / 'receiver-jaw.blend'
MANIFEST = ASSET / 'receiver-jaw-manifest.json'


def xyz(point):
    return Vector((point[0], -point[2], point[1]))


def game(point):
    return [point.x, point.z, -point.y]


bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for item in list(bpy.data.materials):
    bpy.data.materials.remove(item)

collection = bpy.data.collections.new('Editable source / fitted receiver clevis')
tooling = bpy.data.collections.new('Editable Boolean tooling / do not export')
bpy.context.scene.collection.children.link(collection)
bpy.context.scene.collection.children.link(tooling)
source = bpy.data.objects.new('SOURCE__receiver_jaw', None)
collection.objects.link(source)
source['prototype'] = 'receiver_jaw'
source['sourcePins'] = 'retained canonical X-axis pins: X=-17..17,Y=0,Z=+/-16,radius5'


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
    'graphite': material('Graphite / receiver load chassis', (.025, .039, .045), .55, .36),
    'titanium': material('Titanium / formed jaw fittings', (.39, .46, .48), .83, .28),
    'copper': material('Copper / recessed pin bearings', (.46, .245, .105), .8, .32),
}


def own(obj, name, role):
    obj.name = 'Receiver jaw / ' + name
    obj.parent = source
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    collection.objects.link(obj)
    obj.data.materials.append(MATERIALS[role])
    return obj


def finish(obj, amount=.5, segments=1):
    if amount:
        bevel = obj.modifiers.new('Formed continuous edge radius', 'BEVEL')
        bevel.width = amount
        bevel.segments = segments
        bevel.limit_method = 'ANGLE'
        bevel.angle_limit = .4
        bevel.harden_normals = True
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    normals = obj.modifiers.new('Weighted broad-face finish', 'WEIGHTED_NORMAL')
    normals.keep_sharp = True
    normals.weight = 40
    return obj


def box(name, point, dimensions, role, radius=.5):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(point))
    obj = own(bpy.context.object, name, role)
    obj.scale = (dimensions[0], dimensions[2], dimensions[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, radius)


def bore(obj, z, radius):
    # Live, editable tooling sits outside the exported prototype hierarchy.
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=radius, depth=60, location=xyz((0, 0, z)))
    tool = bpy.context.object
    tool.name = f'TOOL / through X bore Z{z:+g} radius{radius:g}'
    tool.rotation_euler = (0, math.pi / 2, 0)
    for old in list(tool.users_collection):
        old.objects.unlink(tool)
    tooling.objects.link(tool)
    tool.hide_render = True
    tool.hide_set(True)
    modifier = obj.modifiers.new(f'True through-bearing bore Z{z:+g}', 'BOOLEAN')
    modifier.operation = 'DIFFERENCE'
    modifier.solver = 'EXACT'
    modifier.object = tool


def cheek(name, x, thickness, height, length, role, hole):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz((x, 0, 0)))
    obj = own(bpy.context.object, name, role)
    obj.scale = (thickness, length, height)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for z in [-16, 16]:
        bore(obj, z, hole)
    return finish(obj, .65)


def bearing(side, z):
    # A real annular bearing sleeve with a bevelled open throat; its 5.25m
    # internal radius accepts the existing 5m pin without replacing it.
    profile = [(-3.9, 5.25), (-3.9, 6.6), (-3.2, 7.05), (3.2, 7.05),
               (3.9, 6.6), (3.9, 5.25)]
    vertices, faces = [], []
    count = 20
    for ring in range(count):
        angle = 2 * math.pi * ring / count
        for axial, radius in profile:
            vertices.append(xyz((side * 17 + axial, math.cos(angle) * radius, z + math.sin(angle) * radius)))
    width = len(profile)
    for ring in range(count):
        for p in range(width):
            faces.append((ring * width + p, ((ring + 1) % count) * width + p,
                          ((ring + 1) % count) * width + (p + 1) % width,
                          ring * width + (p + 1) % width))
    mesh = bpy.data.meshes.new('Editable open annular bearing sleeve')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('Open copper bearing throat', mesh)
    collection.objects.link(obj)
    own(obj, f'{"port" if side < 0 else "starboard"} recessed bearing Z{z:+g}', 'copper')
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


for side in [-1, 1]:
    cheek(f'{"port" if side < 0 else "starboard"} continuous clevis load cheek', side * 17, 8, 31, 51, 'graphite', 7.25)
    cheek(f'{"port" if side < 0 else "starboard"} formed outer cover', side * 21.2, 1.6, 27, 48, 'titanium', 7.5)
    for z in [-16, 16]:
        bearing(side, z)

# Upper/lower closed load bridges and continuous floor stringers connect the
# cheeks and both balconies. Large front/back apertures stay genuinely open.
box('upper deep load bridge', (0, 13.4, 0), (40.5, 4.2, 21), 'graphite', .7)
box('upper formed titanium cap', (0, 16.0, 0), (42, 1.4, 22), 'titanium', .35)
box('lower deep saddle bridge', (0, -14.3, 0), (41, 3.6, 21), 'graphite', .7)
for side in [-1, 1]:
    box('continuous balcony floor carrier', (side * 11.5, -12.2, 0), (5, 3.2, 53), 'graphite', .45)
for side in [-1, 1]:
    box('front/back integral service shelf', (0, -11.8, side * 24), (31.5, 2, 7), 'titanium', .35)
    # The rail is beyond Z=21, outside the retained pin's complete envelope.
    for x in [-13.5, 13.5]:
        box('seated balcony rail post', (x, -7.5, side * 26.6), (1.2, 7, 1.2), 'titanium', .18)
    box('continuous balcony edge rail', (0, -4, side * 26.6), (28.2, 1.2, 1.2), 'titanium', .18)

bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1
bpy.context.view_layer.update()
ASSET.mkdir(parents=True, exist_ok=True)
OUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))

# Export evaluated copies, grouped by the three material roles. Editable live
# bores and bevels remain in the .blend rather than becoming runtime modifiers.
export = bpy.data.objects.new('receiver_jaw', None)
bpy.context.scene.collection.objects.link(export)
export['assetKind'] = 'freestyle-ravel-fitted-receiver-jaw'
export['sourcePins'] = source['sourcePins']
export['construction'] = 'Real open bearing bores; front/back recessed service bays and integrated shelves'
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
    batch.name = 'receiver_jaw__' + role.split('/')[0].strip().lower()
    batch.data.calc_loop_triangles()
    triangles += len(batch.data.loop_triangles)
anchors = {'jawfront': [0, 0, 26], 'back': [0, 0, -26], 'root': [0, 0, 0]}
for name, point in anchors.items():
    node = bpy.data.objects.new('receiver_jaw__' + name, None)
    bpy.context.scene.collection.objects.link(node)
    node.parent = export
    node.location = xyz(point)
    node['anchorKind'] = 'jaw-service' if name != 'root' else 'jaw-root'
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
    'id': 'freestyle-ravel-receiver-jaw-v1',
    'generator': 'Original project-authored background Blender geometry',
    'rights': 'Original editable project geometry and scalar PBR materials. Existing project-owned Ravel concepts are reference-only. No third-party assets or textures.',
    'coordinates': 'metres; +Y up; +X retained pin axis; +Z front; identity root',
    'root': 'receiver_jaw',
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
        'throughBearingBoreRadius': 5.25,
        'retainedPinRadius': 5, 'retainedPinXSpan': [-17, 17], 'retainedPinYZ': [[0, -16], [0, 16]],
        'construction': 'Two continuous bored load cheeks, formed outer covers, four open annular copper bearings, closed upper/lower bridges, continuous shelf carriers, two integrated service balconies. No opaque front/back panels or painted holes.',
    },
    'anchors': anchors,
}
MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'asset': str(OUT), 'triangles': triangles, 'bounds': manifest['geometry']['bounds'], 'sha256': sha(OUT)}))
