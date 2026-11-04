"""Original eroded salt-rim forms for Nomad's open downhill basin.

Run Blender --background --factory-startup --threads 4 --python <this file>.
Sources use metres, +Y up and a real flat Y=0 base. The level owns placement
and applies its current salt-plane pitch; these meshes contain no road or truck.
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

HERE = Path(__file__).resolve().parent
GAME = HERE.parents[4]
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
    for index in range(len(knots) - 1):
        x0, y0 = knots[index]
        x1, y1 = knots[index + 1]
        if value <= x1:
            return y0 + (y1 - y0) * max(0, min(1, (value - x0) / (x1 - x0)))
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
    material('white salt crust', (.64, .665, .635), .95),
    material('fresh carbonate cut', (.74, .73, .665), .90),
    material('pale mineral interbed', (.40, .425, .39), .97),
]

# Unequal transverse samples concentrate geometry at the actual cliff breaks
# and narrow mineral interbeds, rather than painting thick bands over smooth
# mounds. Longitudinal channels cut broad, deliberately different drainage bays.
US = [-1, -.94, -.86, -.72, -.56, -.34, -.10, .12, .27, .36,
      .405, .43, .445, .455, .48, .52, .57, .625, .65, .67,
      .70, .75, .84, .94, 1]
PROFILES = {
    'rim': [(-1, 0), (-.86, .03), (-.56, .65), (-.10, .99), (.27, .96),
            (.405, .82), (.445, .72), (.455, .705), (.48, .50),
            (.57, .46), (.625, .40), (.65, .20), (.67, .185),
            (.70, .10), (.84, .025), (1, 0)],
    'fan': [(-1, 0), (-.86, .05), (-.56, .83), (-.10, .94), (.12, .90),
            (.36, .68), (.445, .64), (.455, .625), (.48, .45),
            (.57, .43), (.625, .32), (.65, .21), (.67, .195),
            (.75, .11), (.94, .015), (1, 0)],
    'broken': [(-1, 0), (-.86, .035), (-.56, .80), (-.10, .98), (.27, .88),
               (.405, .77), (.445, .68), (.455, .665), (.48, .46),
               (.57, .42), (.625, .35), (.65, .17), (.67, .155),
               (.75, .055), (.94, .01), (1, 0)],
}
SPECS = [
    ('nomad_salt_rim', 'rim', (600, 250, 1400), .0),
    ('nomad_salt_fan', 'fan', (900, 120, 1100), 1.7),
    ('nomad_salt_broken_shelf', 'broken', (700, 180, 1300), 3.1),
]
SOURCE_ROOTS, source_info = [], []
for name, kind, size, phase in SPECS:
    collection = bpy.data.collections.new('Editable salt basin / ' + kind)
    bpy.context.scene.collection.children.link(collection)
    root = bpy.data.objects.new('SOURCE__' + name, None)
    collection.objects.link(root)
    SOURCE_ROOTS.append(root)
    points, top, faces, face_material = [], [], [], []
    nx, nz = len(US), 49
    for iz in range(nz):
        t = -1 + 2 * iz / (nz - 1)
        # The forward termination is steeper and shorter than the trailing fan.
        end = smooth(-1, -.70, t) * (1 - smooth(.83, 1, t))
        crest = .90 + .065 * math.sin(t * 4.7 + phase) + .035 * math.sin(t * 11.3 - phase)
        if kind == 'broken':
            crest *= .78 + .20 * math.sin(t * 3.7 + .45) ** 2
        for ix, u in enumerate(US):
            # Real broad recesses break the inner cliff into unequal shoulders.
            drainage = sum(depth * math.exp(-((t - center) / width) ** 2)
                for center, width, depth in [(-.48, .095, .16), (.035, .14, .24), (.49, .075, .13)])
            retreat = (.055 * math.sin(t * 8.2 + phase) + .025 * math.sin(t * 18.1))
            shifted = max(-1, min(1, u + retreat * smooth(-.45, .55, u)))
            h = profile(PROFILES[kind], shifted)
            h *= 1 - drainage * smooth(-.25, .65, u)
            # Long shallow drainage corrugations connect the fresh wall to its
            # salt apron. They are geometry, with no noisy displacement texture.
            apron = max(0, 1 - abs(u - .76) / .27)
            h *= 1 - apron * .18 * (math.sin(t * 16.4 + u * 5.5 + phase) * .5 + .5)
            y = max(0, h * crest * end * size[1])
            if ix in [0, nx - 1] or iz in [0, nz - 1]:
                y = 0
            top.append(len(points))
            points.append((u * size[0] / 2, y, t * size[2] / 2))
    bottom = []
    for index, point in enumerate(points[:]):
        if point[1] == 0:
            bottom.append(index)
        else:
            bottom.append(len(points))
            points.append((point[0], 0, point[2]))
    for iz in range(nz - 1):
        for ix in range(nx - 1):
            a, b = iz * nx + ix, iz * nx + ix + 1
            c, d = (iz + 1) * nx + ix + 1, (iz + 1) * nx + ix
            u = (US[ix] + US[ix + 1]) / 2
            # Two narrow, subordinate geological bands follow actual breaks.
            layer = 2 if (.445 < u < .456 or .65 < u < .671) and .10 < abs((iz / (nz - 1)) - .5) < .39 else (1 if u > .30 else 0)
            faces.extend([(a, d, c), (a, c, b)])
            face_material.extend([layer, layer])
            faces.extend([(bottom[a], bottom[b], bottom[c]), (bottom[a], bottom[c], bottom[d])])
            face_material.extend([0, 0])
    data = bpy.data.meshes.new(name + ' / eroded closed carbonate bed')
    data.from_pydata([xyz(point) for point in points], [], faces)
    data.update()
    for item in MATERIALS:
        data.materials.append(item)
    for polygon, index in zip(data.polygons, face_material):
        polygon.material_index = index
        polygon.use_smooth = index != 2
    # A completely flat corner can give the top and bottom the same triangle.
    # Remove that duplicate in the retained source, before deriving either export.
    data.validate(verbose=True)
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(kind + ' / connected eroded salt strata', data)
    collection.objects.link(obj)
    obj.parent = root
    source_info.append({'name': name, 'role': kind,
        'dimensions': list(size), 'base': 'All perimeter and underside vertices are on source Y=0.',
        'profile': PROFILES[kind], 'drainage': 'Three unequal broad gullies, asymmetric end aprons and actual narrow interbed faces.'})

bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.context.view_layer.update()
graph = bpy.context.evaluated_depsgraph_get()
records, colliders, export_roots = [], [], []
for root, info in zip(SOURCE_ROOTS, source_info):
    name = info['name']
    export = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(export)
    export_roots.append(export)
    positions, indices, batches = [], [], {}
    for obj in root.children_recursive:
        if obj.type != 'MESH':
            continue
        data = bpy.data.meshes.new_from_object(obj.evaluated_get(graph), preserve_all_data_layers=True, depsgraph=graph)
        data.transform(obj.matrix_world)
        data.calc_loop_triangles()
        offset = len(positions) // 3
        for vertex in data.vertices:
            positions.extend([round(value, 6) for value in game(vertex.co)])
        for tri in data.loop_triangles:
            indices.extend([offset + value for value in tri.vertices])
        # Retain each material as one native draw without keeping the source
        # mesh and its three materials duplicated in the runtime scene.
        for material_index, material in enumerate(MATERIALS):
            selected = [tri for tri in data.loop_triangles if tri.material_index == material_index]
            mesh = bpy.data.meshes.new(name + ' / ' + material.name)
            mesh.from_pydata([tuple(vertex.co) for vertex in data.vertices], [], [tuple(tri.vertices) for tri in selected])
            mesh.update()
            mesh.materials.append(material)
            for polygon in mesh.polygons:
                polygon.use_smooth = material_index != 2
            copy = bpy.data.objects.new(name + '__' + str(material_index), mesh)
            bpy.context.scene.collection.objects.link(copy)
            copy.parent = export
            batches[material.name] = copy
    low = [min(positions[axis::3]) for axis in range(3)]
    high = [max(positions[axis::3]) for axis in range(3)]
    collider = {'name': name, 'positions': positions, 'indices': indices, 'triangles': len(indices) // 3}
    colliders.append(collider)
    records.append({**info, 'triangles': len(indices) // 3, 'materialBatches': len(batches),
        'bounds': {'min': low, 'max': high}, 'basePlane': {'normal': [0, 1, 0], 'constant': 0}})
CONTACTS.write_text(json.dumps({'version': 1, 'coordinates': '+Y up, +Z forward; metres, source base Y=0.',
    'source': 'Every evaluated exported triangle, including the closed flat underside; no simplified collision volumes.',
    'prototypes': colliders}, separators=(',', ':')) + '\n')
bpy.ops.object.select_all(action='DESELECT')
for root in export_roots:
    root.select_set(True)
    for obj in root.children_recursive:
        obj.select_set(True)
OUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUT), export_format='GLB', use_selection=True,
    export_apply=True, export_extras=True, export_yup=True, export_cameras=False,
    export_lights=False, export_animations=False)
raw = OUT.read_bytes()
gltf = json.loads(raw[20:20 + struct.unpack_from('<I', raw, 12)[0]])
actual_triangles = sum(gltf['accessors'][part['indices']]['count'] // 3 for mesh in gltf['meshes'] for part in mesh['primitives'])
assert actual_triangles == sum(item['triangles'] for item in records)
record = {'title': 'Nomad Procession / eroded white salt-basin escarpments',
    'generator': 'Original editable Blender carbonate landforms with three distinct cross-sections, broad carved gullies, stepped aprons and closed planar bases.',
    'source': Path(__file__).name, 'blend': BLEND.name,
    'runtimeAsset': str(OUT.relative_to(GAME)), 'collision': CONTACTS.name,
    'coordinates': '+Y up, +Z forward; metres. Source Y=0 is the complete flat contact plane. Runtime owns current salt-grade pitch, unequal placements and full convoy/flight exclusion.',
    'rights': 'Project-authored geometry and scalar rough carbonate materials. No models, imagery, scans or baked lighting from external sources.',
    'materials': [item.name for item in MATERIALS], 'prototypes': records,
    'totalTriangles': actual_triangles,
    'hashes': {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in [Path(__file__), BLEND, OUT, CONTACTS]}}
(HERE / 'salt-escarpments-provenance.json').write_text(json.dumps(record, indent=2) + '\n')
print('NOMAD_SALT_ESCARPMENTS ' + json.dumps({'triangles': actual_triangles, 'prototypes': records}))
