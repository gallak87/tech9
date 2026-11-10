"""Original editable receiver-side tensioned foil for Ravel Sailbreak.

Run Blender --background --factory-startup --python build_receiver_wing.py.
Authored metres: +Y up, +X outboard, +Z along the receiver. The complete
inner hem is the fixed X=0,Y=0 attachment line, not a floating flat poster.
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
OUT = GAME / 'public/assets/levels/freestyle-ravel/receiver-wing.glb'
BLEND = ASSET / 'receiver-wing.blend'
MANIFEST = ASSET / 'receiver-wing-manifest.json'
NX, NZ = 48, 64
WIDTH, LENGTH = 820.0, 1400.0


def xyz(point):
    """Game coordinates to Blender Z-up; glTF export reverses this mapping."""
    return Vector((point[0], -point[2], point[1]))


def wing(u, v):
    a, b = math.sin(math.pi * u), math.sin(math.pi * v)
    # One broad load-bearing curl. The boundaries remain exact while unequal
    # interior creases interrupt the mechanically perfect sinusoidal surface.
    x = WIDTH * u + 53 * a * b * math.sin(2.4 * math.pi * v + 0.7 * u)
    z = LENGTH * (v - 0.5) + 68 * a * b * math.sin(1.7 * math.pi * u + v)
    y = 700 * u + 650 * a * b - 140 * a * (1 - b)
    y += 100 * math.sin((v - 0.5) * math.pi) * u
    y += 96 * a * b * (0.6 * math.sin(2.3 * math.pi * v + 1.8 * u)
                       + 0.3 * math.sin(4.7 * math.pi * u - 1.1 * v))
    # Sparse, unequal strain folds converge toward the inner attachment rail;
    # their maximum depth is small beside the thousand-metre primary curl.
    y += a ** 1.25 * b * (25 * math.sin(7 * math.pi * u + 5 * v)
                          + 12 * math.sin(15 * math.pi * u - 3 * v))
    return Vector((x, y, z))


def uv(point):
    return ((point.z + LENGTH / 2) / 24, point.x / 16)


bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for datablock in list(bpy.data.materials):
    bpy.data.materials.remove(datablock)

collection = bpy.data.collections.new('Editable source / receiver folded foil')
bpy.context.scene.collection.children.link(collection)
root = bpy.data.objects.new('receiver_foil_wing', None)
collection.objects.link(root)
root['assetKind'] = 'freestyle-ravel-receiver-foil-wing'
root['coordinateSystem'] = 'metres; +Y up; +X outboard; +Z along receiver'
root['attachment'] = 'entire inner hem X=0,Y=0; midpoint root=(0,0,0)'
root['materialRole'] = 'canonical Ravel Physical foil applied by course owner'

material = bpy.data.materials.new('Foil / receiver collector membrane')
material.use_nodes = True
material.diffuse_color = (0.70, 0.75, 0.77, 1)
principled = material.node_tree.nodes.get('Principled BSDF')
principled.inputs['Base Color'].default_value = (0.70, 0.75, 0.77, 1)
principled.inputs['Metallic'].default_value = 0.88
principled.inputs['Roughness'].default_value = 0.38
principled.inputs['Coat Weight'].default_value = 0.15
principled.inputs['Coat Roughness'].default_value = 0.3
material.use_backface_culling = False

points, faces = [], []
for row in range(NZ + 1):
    for column in range(NX + 1):
        points.append(wing(column / NX, row / NZ))
for row in range(NZ):
    for column in range(NX):
        a = row * (NX + 1) + column
        b = a + NX + 1
        faces.append((a, b, b + 1, a + 1))
surface_faces = len(faces)

# Continuous six-sided rolled reinforcement follows the actual 3D perimeter.
# It is closed and hollow-looking at racing scale; the membrane stays a thin
# double-sided sheet rather than a thick solid block or opaque backing wall.
perimeter = ([wing(i / NX, 0) for i in range(NX)]
             + [wing(1, j / NZ) for j in range(NZ)]
             + [wing(1 - i / NX, 1) for i in range(NX)]
             + [wing(0, 1 - j / NZ) for j in range(NZ)])
hem_start = len(points)
HEM_SIDES, HEM_RADIUS = 6, 2.5
for index, point in enumerate(perimeter):
    tangent = (perimeter[(index + 1) % len(perimeter)] - perimeter[index - 1]).normalized()
    guide = Vector((0, 1, 0)) if abs(tangent.y) < 0.9 else Vector((0, 0, 1))
    radial = tangent.cross(guide).normalized()
    normal = tangent.cross(radial).normalized()
    for side in range(HEM_SIDES):
        angle = 2 * math.pi * side / HEM_SIDES
        points.append(point + HEM_RADIUS * (radial * math.cos(angle) + normal * math.sin(angle)))
for index in range(len(perimeter)):
    for side in range(HEM_SIDES):
        a = hem_start + index * HEM_SIDES + side
        b = hem_start + ((index + 1) % len(perimeter)) * HEM_SIDES + side
        c = hem_start + ((index + 1) % len(perimeter)) * HEM_SIDES + (side + 1) % HEM_SIDES
        d = hem_start + index * HEM_SIDES + (side + 1) % HEM_SIDES
        faces.append((a, b, c, d))

mesh = bpy.data.meshes.new('Receiver wing / editable tension grid and closed rolled hem')
mesh.from_pydata([xyz(point) for point in points], [], faces)
mesh.update()
mesh.materials.append(material)
layer = mesh.uv_layers.new(name='Metre foil coordinates')
for polygon in mesh.polygons:
    polygon.use_smooth = True
    for loop_index in polygon.loop_indices:
        u, v = uv(points[mesh.loops[loop_index].vertex_index])
        # Blender's exporter flips V for glTF. Compensate here so the runtime
        # TEXCOORD_0 retains the documented exact metre convention.
        layer.data[loop_index].uv = (u, 1 - v)
body = bpy.data.objects.new('receiver_foil_wing__foil', mesh)
collection.objects.link(body)
body.parent = root
body['topology'] = 'editable 48 x 64 quad membrane plus continuous six-sided reinforced rolled hem'
body['uvMetres'] = 'uv.x=(local Z+700)/24; uv.y=local X/16'
body['runtimeRoadCoord'] = 'roadCoord=(uv.x*24, uv.y*16); unmarked canonical foil material center=null'

anchors = {
    'root': [0, 0, 0],
    'inner_a': [0, 0, -700],
    'inner_b': [0, 0, 700],
    'outer_a': [820, 600, -700],
    'outer_b': [820, 800, 700],
}
for name, point in anchors.items():
    empty = bpy.data.objects.new('wing_' + name, None)
    collection.objects.link(empty)
    empty.parent = root
    empty.location = xyz(point)
    empty['anchorKind'] = 'foil-hem' if name != 'root' else 'foil-root'

bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1
bpy.context.view_layer.update()
ASSET.mkdir(parents=True, exist_ok=True)
OUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for child in root.children_recursive:
    child.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.export_scene.gltf(
    filepath=str(OUT), export_format='GLB', use_selection=True,
    export_apply=True, export_extras=True, export_yup=True,
    export_animations=False, export_cameras=False, export_lights=False,
    export_materials='EXPORT',
)

mesh.calc_loop_triangles()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
references = ['ravel-anchor-narrows-concept.png', 'ravel-crown-fold-concept.png', 'sail-basin-selected-crop.png']
manifest = {
    'id': 'freestyle-ravel-receiver-wing-v1',
    'generator': 'Original project-authored background Blender geometry',
    'rights': 'Original editable project geometry and scalar PBR material. Existing project-owned generated Ravel concepts are reference-only. No third-party assets or textures.',
    'coordinates': 'metres; +Y up; +X outboard; +Z along receiver; identity root',
    'root': root.name,
    'shape': 'Broad tensioned curling wall/canopy with asymmetric interior strain folds, exact fixed inner hem and continuous reinforced rolled border',
    'source': {'file': str(Path(__file__).relative_to(GAME)), 'sha256': sha(Path(__file__))},
    'blend': {'file': str(BLEND.relative_to(GAME)), 'sha256': sha(BLEND)},
    'runtimeAsset': {'file': str(OUT.relative_to(GAME)), 'sha256': sha(OUT), 'bytes': OUT.stat().st_size},
    'referenceImages': [
        {'file': 'assets/levels/ravel/reference/' + name, 'sha256': sha(GAME / 'assets/levels/ravel/reference' / name)}
        for name in references
    ],
    'geometry': {
        'grid': [NX, NZ], 'vertices': len(points), 'triangles': len(mesh.loop_triangles),
        'surfaceTriangles': surface_faces * 2,
        'hemTriangles': (len(faces) - surface_faces) * 2,
        'bounds': {'min': [min(point[k] for point in points) for k in range(3)],
                   'max': [max(point[k] for point in points) for k in range(3)]},
        'materialRoles': [material.name], 'textures': [],
        'uv': 'uv.x=(local Z+700)/24; uv.y=local X/16',
        'runtimeRoadCoord': '(uv.x*24,uv.y*16)',
        'doubleSided': True, 'rolledHemRadius': HEM_RADIUS,
    },
    'anchors': anchors,
}
MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'asset': str(OUT), 'triangles': len(mesh.loop_triangles), 'bounds': manifest['geometry']['bounds'], 'sha256': sha(OUT)}))
