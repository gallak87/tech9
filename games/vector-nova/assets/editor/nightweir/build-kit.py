"""Export complete portable Nightweir assemblies from the canonical builders.

Blender --background --factory-startup --python this_file -- <game-root>
The campaign authoring script is never run or modified. Only its named geometry
and material definitions are evaluated; route/terrain/export statements remain
outside this deliberately small extraction boundary.
"""
import ast
import hashlib
import json
import math
import random
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
SOURCE = ROOT / 'assets/levels/nightweir/build_assets.py'
OUTPUT = ROOT / 'public/assets/editor/nightweir'
EDITABLE = ROOT / 'assets/editor/nightweir'
OUTPUT.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

tree = ast.parse(SOURCE.read_text())
definitions = {node.name: node for node in tree.body if isinstance(node, ast.FunctionDef)}
needed = ['xyz', 'material', 'mesh', 'box', 'cylinder', 'arch', 'frontage',
          'urban_wing', 'inhabited_bays', 'generating_hall', 'entry_fixture',
          'occupied_gallery', 'pressure_gallery']
missing = set(needed) - definitions.keys()
if missing:
    raise RuntimeError('Canonical Nightweir builder API changed: ' + str(missing))
environment = {
    'bpy': bpy, 'bmesh': bmesh, 'math': math, 'random': random, 'Vector': Vector,
    'objects': [], 'solids': [], 'lights': [], 'rng': random.Random(773),
    'UP': Vector((0, 1, 0)),
    'faces': [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4),
              (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)],
    'clear': lambda *args: True,
    # Preserve all authored solid parts and access openings. The editor bakes
    # exact indexed faces instead of campaign off-road envelope proxies.
    'representative_collision': lambda *args: None,
}
for name in needed:
    exec(compile(ast.Module(body=[definitions[name]], type_ignores=[]), str(SOURCE), 'exec'), environment)
for node in tree.body:
    if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name) and node.value.func.id == 'material':
        exec(compile(ast.Module(body=[node], type_ignores=[]), str(SOURCE), 'exec'), environment)

axes = (Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
base = Vector((0, 0, 0))
recipes = [
    ('residential-court', 'inhabited_bays', ('Occupied courtyard', base, 65, 36.5, 32, axes, 'terraces', 701)),
    ('brick-pressureworks', 'pressure_gallery', ('Brick pressure exchange', base, 66, 34, axes, 18)),
    ('generating-house', 'generating_hall', ('Generating house', base, 108, 64, axes, 4)),
    ('municipal-wing', 'urban_wing', ('Municipal wing', base, 38, 54.75, 32, axes, 'municipal', 8)),
    ('public-gallery', 'occupied_gallery', ('Public waterside gallery', base, 72, 42, axes, 39)),
]
prototypes = {}
for name, function, arguments in recipes:
    environment['objects'].clear()
    environment['solids'].clear()
    environment[function](*arguments)
    pieces = environment['objects']
    vertices, faces, slots, materials, overrides, levels = [], [], [], [], [], []
    for piece in pieces:
        offset = len(vertices)
        vertices.extend(piece['vertices'])
        overrides.extend(piece.get('uvs', [None] * len(piece['vertices'])))
        levels.extend([piece.get('emission_level', 1)] * len(piece['vertices']))
        material = piece['material']
        if material not in materials:
            materials.append(material)
        for face in piece['faces']:
            faces.append(tuple(offset + index for index in face))
            slots.append(materials.index(material))
    mesh = bpy.data.meshes.new(name + ' / canonical Nightweir geometry')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for material in materials:
        mesh.materials.append(material)
    uv = mesh.uv_layers.new(name='Metres')
    colors = mesh.color_attributes.new(name='Sheltered faces', type='BYTE_COLOR', domain='CORNER')
    for polygon, slot in zip(mesh.polygons, slots):
        polygon.material_index = slot
        axis = max(range(3), key=lambda i: abs(polygon.normal[i]))
        for index in polygon.loop_indices:
            vertex_index = mesh.loops[index].vertex_index
            point = mesh.vertices[vertex_index].co
            uv.data[index].uv = overrides[vertex_index] or (point.y if axis == 0 else point.x, point.y if axis == 2 else point.z)
            light = levels[vertex_index]
            colors.data[index].color = (light, light, light, 1)
    mesh.calc_loop_triangles()
    prototypes[name] = {'triangles': len(mesh.loop_triangles), 'builder': function}
    print(name, prototypes[name], flush=True)

blend = EDITABLE / 'nightweir-editor-kit.blend'
runtime = OUTPUT / 'nightweir-editor-kit.glb'
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = next(iter(bpy.context.selected_objects))
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.export_scene.gltf(filepath=str(runtime), export_format='GLB', use_selection=True,
                          export_yup=True, export_materials='EXPORT', export_cameras=False,
                          export_lights=False, export_vertex_color='NAME',
                          export_vertex_color_name='Sheltered faces')
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
record = {
    'creator': 'VECTOR//NOVA original canonical Nightweir builders, exported in Blender',
    'source': 'assets/levels/nightweir/build_assets.py', 'sourceHash': digest(SOURCE),
    'exporter': 'assets/editor/nightweir/build-kit.py', 'exporterHash': digest(Path(__file__)),
    'editable': 'assets/editor/nightweir/nightweir-editor-kit.blend', 'editableHash': digest(blend),
    'runtime': 'assets/editor/nightweir/nightweir-editor-kit.glb', 'runtimeHash': digest(runtime),
    'rights': 'Project-owned geometry; registered Nightweir finish images retain their original provenance.',
    'prototypes': prototypes,
}
(EDITABLE / 'provenance.json').write_text(json.dumps(record, indent=2) + '\n')
print('EDITOR_EXPORT_COMPLETE', json.dumps(prototypes), flush=True)
