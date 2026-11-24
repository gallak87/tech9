"""Model and export the editor's closed Glasswake cliff modules in Blender.

Run Blender with --background --factory-startup --python followed by this file.
Coordinates in the Blender scene correspond to the metre-scale glTF model:
-X faces the route, Z follows the cliff line and the base sits at Y=0.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import struct

import bmesh
import bpy

SOURCE = Path(__file__).resolve().parent
GAME = SOURCE.parents[2]
BLEND = SOURCE / 'glacier-kit.blend'
OUTPUT = GAME / 'public/assets/editor/glasswake/glacier-kit.glb'
CANONICAL = GAME / 'public/assets/levels/glasswake/glasswake-environment-v5.glb'

PALE, BLUE, DEEP, FROST, FRESH = (
    'Pale fractured wind-polished ice',
    'Blue compact ice planes',
    'Cobalt buried blue-black core',
    'Opaque frost crust',
    'Fresh fracture blue edges',
)
ROLES = (PALE, BLUE, DEEP, FROST, FRESH)

# Each profile gives the ice height across its front. The cross sections below
# give each wall its own silhouette, including unequal slopes and setbacks.
PROFILES = {
    'escarpment': (
        (206, 565, 560),
        [.42, .70, .79, .91, .87, 1, .90, .93, .72, .78, .64, .47],
        [0, .05, .07, .12, .08, .13, .18, .26],
    ),
    'terrace': (
        (257, 406, 600),
        [.55, .59, .63, .61, .77, .80, .78, 1, .96, .91, .97, .64],
        [0, .01, .05, .23, .22, .42, .40, .57],
    ),
    'seracs': (
        (191, 650, 495),
        [.38, .65, .56, .85, .69, 1, .55, .77, .91, .60, .79, .43],
        [0, .04, .11, .05, .14, .09, .30, .39],
    ),
    'buttress': (
        (252, 525, 470),
        [.38, .54, .77, .87, 1, .95, .91, .68, .55, .58, .44, .29],
        [0, .12, .11, .28, .24, .38, .30, .49],
    ),
    'talus': (
        (154, 100, 325),
        [.20, .35, .76, .68, .52, .90, .69, 1, .61, .71, .35, .17],
        [0, .04, .14, .32, .36, .47, .51, .55],
    ),
}
N, D, LEVELS = 24, 6, 9


def mix(a, b, fraction):
    return a + (b - a) * fraction


def profile(values, position):
    index = min(len(values) - 2, int(position * (len(values) - 1)))
    return mix(values[index], values[index + 1], position * (len(values) - 1) - index)


def jagged(wave):
    return 2 * abs(wave - math.floor(wave + .5))


def crown_height(name, crest, u, v, phase):
    broad = profile(crest, (v + 1) / 2)
    scarps = jagged(v * 6.3 + u * .63 + phase)
    runnel = jagged(v * 12.1 - u * 2.35 - phase)
    y = broad + (.035 if name == 'terrace' else .057) * scarps + .034 * runnel
    if name == 'seracs':
        y -= .21 * scarps ** 3 * (1 - .37 * u)
    if name == 'buttress':
        y -= u * (.14 + .10 * math.sin(2 * v + phase))
    elif name == 'talus':
        y *= .62 + .37 * math.sin(math.pi * u) + .13 * u
    else:
        y += .09 * u + math.sin(4 * v + phase) * u * .045
    return y


def point(name, crest, steps, u, v, t, phase):
    z = v + (1 - v * v) * (.035 * math.sin(u * 4 + t * 2 + phase)
                           + .013 * math.sin(v * 14 + u * 8 + phase))
    # Breaks in the upper ice run vertically and change shape along the wall.
    # The front's upper bands can undercut or project above the earlier step.
    furrow = jagged(v * 4.1 + t * .46 + phase)
    finer = jagged(v * 13.6 - t * .44 - phase)
    front = profile(steps, t)
    front += (.17 if name == 'seracs' else .11) * furrow ** 2
    front += .048 * finer - .06 * math.sin(v * 7 + t * 2.6 + phase)
    front += .105 * abs(v) ** 7
    back = 1 - .07 * abs(v) ** 5 - t * .05 + .026 * math.sin(v * 12 + phase)
    x = mix(front, back, u)
    y = t * crown_height(name, crest, u, v, phase)
    y += t * (1 - t) * .038 * math.sin(v * 18 + u * 7 + phase)
    return (x, y, z)


def color_face(u, v, t, salt):
    # Patches follow the folded ice surface. Longitudinal offsets avoid a
    # band cutting across every neighbouring cliff at the same elevation.
    bed = t + .095 * math.sin(v * 8 + salt) + .039 * math.sin(v * 17 - salt)
    ice_pocket = math.sin(v * 16.8 + t * 4 + salt) + .53 * math.cos(v * 27 - salt)
    if bed < .18 and ice_pocket > -.48:
        return DEEP
    if bed > .84:
        return FROST if ice_pocket < -.2 else PALE
    if ice_pocket > .88 and .26 < bed < .81:
        return FRESH
    if math.sin(v * 7 + salt) + math.cos(t * 11 + v * 4) * .78 > .17:
        return BLUE
    return PALE if u < .7 or bed > .5 else BLUE


def add_cliff(name, values, phase, collection, materials):
    size, crest, steps = values
    # Four ordered sides of a crown grid. Share this boundary with the wall
    # and the matching underside so all exported modules remain watertight.
    edge = (
        [(0, k) for k in range(N)]
        + [(k, N) for k in range(D)]
        + [(D, k) for k in range(N, 0, -1)]
        + [(k, 0) for k in range(D, 0, -1)]
    )
    vertices, faces, roles = [], [], []

    def vertex(d, n, t):
        existing = len(vertices)
        vertices.append(point(name, crest, steps, d / D, 2 * n / N - 1, t, phase))
        return existing

    def face(indices, role):
        faces.append(indices)
        roles.append(role)

    def quad(a, b, c, d, role, reverse):
        if reverse:
            face((a, b, d), role)
            face((b, c, d), role)
        else:
            face((a, b, c), role)
            face((a, c, d), role)

    rings = []
    for level in range(LEVELS):
        t = level / (LEVELS - 1)
        rings.append([vertex(d, n, t) for d, n in edge])
    for row, low in enumerate(rings[:-1]):
        high = rings[row + 1]
        for index, (d, n) in enumerate(edge):
            other = (index + 1) % len(edge)
            end_d, end_n = edge[other]
            role = color_face(
                (d + end_d) / (2 * D), (n + end_n) / N - 1,
                (row + .5) / (LEVELS - 1), phase,
            )
            quad(low[index], low[other], high[other], high[index], role,
                 (index + row) % 2 == 0)

    for top in (False, True):
        ring = rings[-1 if top else 0]
        grid = dict(zip(edge, ring))
        for d in range(1, D):
            for n in range(1, N):
                grid[d, n] = vertex(d, n, int(top))
        for d in range(D):
            for n in range(N):
                v = (n + .5) * 2 / N - 1
                patch = math.sin(v * 13 + d * .64 + phase) + .52 * math.sin(v * 23 - d * .8)
                role = (FROST if patch > -.42 else PALE) if top else DEEP
                quad(grid[d, n], grid[d + 1, n], grid[d + 1, n + 1],
                     grid[d, n + 1], role, (d + n) % 2 == 0)

    bounds = [(min(p[axis] for p in vertices), max(p[axis] for p in vertices))
              for axis in range(3)]
    metric = [tuple((p[axis] - left) * size[axis] / (right - left)
                    - (0 if axis == 1 else size[axis] / 2)
                    for axis, (left, right) in enumerate(bounds))
              for p in vertices]
    xyz = [(x, -z, y) for x, y, z in metric]
    mesh = bpy.data.meshes.new('Glacial ' + name)
    mesh.from_pydata(xyz, [], faces)
    for role in ROLES:
        mesh.materials.append(materials[role])
    for polygon, role in zip(mesh.polygons, roles):
        polygon.material_index = ROLES.index(role)
    edit = bmesh.new()
    edit.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(edit, faces=list(edit.faces))
    if not all(edge.is_manifold for edge in edit.edges):
        raise RuntimeError(f'{name} has open faces')
    if any(f.calc_area() < 1e-6 for f in edit.faces):
        raise RuntimeError(f'{name} has a degenerate triangle')
    edit.to_mesh(mesh)
    edit.free()
    mesh.update()
    model = bpy.data.objects.new(name, mesh)
    collection.objects.link(model)
    model['roadsideFace'] = '-X'
    model['metreDimensions'] = size
    model['triangleCount'] = len(faces)
    return {'name': name, 'sizeMetres': size, 'triangles': len(faces), 'closed': True}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    collection = bpy.data.collections.new('Glasswake editor / cliff modules')
    bpy.context.scene.collection.children.link(collection)

    canonical = CANONICAL.read_bytes()
    length = struct.unpack_from('<I', canonical, 12)[0]
    recipes = {material['name']: material.get('pbrMetallicRoughness', {})
               for material in json.loads(canonical[20:20 + length])['materials']}
    materials = {}
    for role in ROLES:
        recipe = recipes[role]
        material = materials[role] = bpy.data.materials.new(role)
        material.use_nodes = True
        shader = material.node_tree.nodes.get('Principled BSDF')
        color = tuple(recipe.get('baseColorFactor', [1, 1, 1, 1]))
        material.diffuse_color = color
        shader.inputs['Base Color'].default_value = color
        shader.inputs['Metallic'].default_value = recipe.get('metallicFactor', 0)
        shader.inputs['Roughness'].default_value = recipe.get('roughnessFactor', .5)

    models = [add_cliff(name, values, .35 + i * .274, collection, materials)
              for i, (name, values) in enumerate(PROFILES.items())]
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT),
        export_format='GLB',
        export_yup=True,
        export_texcoords=False,
    )
    paths = [Path(__file__).resolve(), BLEND, OUTPUT, CANONICAL]
    manifest = {
        'version': 1,
        'blender': bpy.app.version_string,
        'concept': 'assets/levels/glasswake/scene-reference.png',
        'materialSource': str(CANONICAL.relative_to(GAME)),
        'assets': models,
        'sha256': {str(path.relative_to(GAME)): sha(path) for path in paths},
    }
    (SOURCE / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
