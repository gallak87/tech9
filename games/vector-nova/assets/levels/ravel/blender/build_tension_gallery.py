"""Editable original Ravel tension-gallery kit.
Blender --background --factory-startup --python build_tension_gallery.py [-- --render]
Metres; game X right, Y up, Z forward. Gallery segment runs along +X.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import bpy
import bmesh
from mathutils import Vector

ASSET = Path(__file__).resolve().parent
GAME = ASSET.parents[3]
OUT = GAME / 'public/assets/levels/ravel/tension-gallery.glb'
BLEND = ASSET / 'ravel-tension-gallery.blend'
TEMP = GAME / '.experiments/ravel-tension-gallery'
parser = argparse.ArgumentParser()
parser.add_argument('--render', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for material in list(bpy.data.materials):
    bpy.data.materials.remove(material)


def xyz(p):
    return Vector((p[0], -p[2], p[1]))


def material(name, color, metal, roughness, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = roughness
    if name.startswith('Ceramic'):
        p.inputs['Coat Weight'].default_value = .3
        p.inputs['Coat Roughness'].default_value = .23
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    return m


M = {
    'ivory': material('Ceramic / warm ivory', (.67, .63, .51), .12, .29),
    'graphite': material('Graphite / structural carbon', (.022, .035, .042), .5, .38),
    'titanium': material('Titanium / formed fittings', (.38, .44, .45), .82, .26),
    'copper': material('Copper / tension fittings', (.44, .205, .09), .78, .32),
    'void': material('Interior / deep graphite', (.007, .012, .017), .12, .68),
    'amber': material('Power / seated service lights', (1, .43, .12), .15, .28, 1.6),
}
SOURCES = {}
ANCHORS = {}


def root(name):
    collection = bpy.data.collections.new('Source / ' + name)
    bpy.context.scene.collection.children.link(collection)
    r = bpy.data.objects.new('SOURCE__' + name, None)
    collection.objects.link(r)
    r['prototype'] = name
    SOURCES[name] = r
    ANCHORS[name] = []
    return r


def own(o, name, key, parent):
    o.name = parent['prototype'] + ' / ' + name
    if key is not None:
        o.data.materials.append(M[key])
    o.parent = parent
    collection = parent.users_collection[0]
    for old in list(o.users_collection):
        old.objects.unlink(o)
    collection.objects.link(o)
    return o


def bevel(o, amount):
    if amount <= 0:
        return o
    m = o.modifiers.new('Formed edge radius', 'BEVEL')
    m.width = amount
    m.segments = 1
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(27)
    n = o.modifiers.new('Weighted manufactured normals', 'WEIGHTED_NORMAL')
    n.keep_sharp = True
    return o


def box(name, center, size, key, parent, edge=.15):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(center))
    o = bpy.context.object
    o.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    own(o, name, key, parent)
    return bevel(o, min(edge, min(size) * .2))


def mesh(name, positions, faces, key, parent, edge=0):
    g = bpy.data.meshes.new(name)
    g.from_pydata([xyz(p) for p in positions], [], faces)
    g.update()
    bm = bmesh.new()
    bm.from_mesh(g)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(g)
    bm.free()
    o = bpy.data.objects.new(name, g)
    bpy.context.collection.objects.link(o)
    own(o, name, key, parent)
    return bevel(o, edge)


def beam(name, a, b, width, depth, key, parent, edge=0):
    start, end = xyz(a), xyz(b)
    delta = end - start
    bpy.ops.mesh.primitive_cube_add(size=1, location=(start + end) / 2)
    o = bpy.context.object
    o.dimensions = (width, depth, delta.length)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = delta.to_track_quat('Z', 'Y')
    own(o, name, key, parent)
    return bevel(o, edge)


def cylinder(name, center, radius, length, key, parent, segments=24, axis='z'):
    a, b = list(center), list(center)
    i = {'x': 0, 'y': 1, 'z': 2}[axis]
    a[i] -= length / 2
    b[i] += length / 2
    start, end = xyz(a), xyz(b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=radius, depth=length, end_fill_type='NGON', location=(start + end) / 2)
    o = bpy.context.object
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = (end - start).to_track_quat('Z', 'Y')
    own(o, name, key, parent)
    for p in o.data.polygons:
        p.use_smooth = len(p.vertices) == 4
    return o


def ring(name, center, outer, inner, thickness, key, parent, segments=32):
    x, y, z = center
    p = []
    for dz, r in [(-thickness / 2, outer), (thickness / 2, outer), (thickness / 2, inner), (-thickness / 2, inner)]:
        for j in range(segments):
            a = j * math.tau / segments
            p.append((x + r * math.cos(a), y + r * math.sin(a), z + dz))
    faces = []
    for row in range(4):
        for j in range(segments):
            faces.append((row * segments + j, row * segments + (j + 1) % segments, ((row + 1) % 4) * segments + (j + 1) % segments, ((row + 1) % 4) * segments + j))
    return mesh(name, p, faces, key, parent)


def lathe(name, center, profile, key, parent, segments=32):
    x, y, z = center
    p = []
    for axial, radius in profile:
        for j in range(segments):
            a = j * math.tau / segments
            p.append((x + radius * math.cos(a), y + radius * math.sin(a), z + axial))
    faces = []
    for row in range(len(profile) - 1):
        for j in range(segments):
            faces.append((row * segments + j, row * segments + (j + 1) % segments, (row + 1) * segments + (j + 1) % segments, (row + 1) * segments + j))
    o = mesh(name, p, faces, key, parent)
    for face in o.data.polygons:
        face.use_smooth = True
    return o


def plate_profile(name, polygon, z0, z1, key, parent, edge=.3):
    vertices = [(x, y, z) for z in [z0, z1] for x, y in polygon]
    n = len(polygon)
    faces = [tuple(range(n - 1, -1, -1)), tuple(n + i for i in range(n))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return mesh(name, vertices, faces, key, parent, edge)


def anchor(parent, name, point, kind):
    ANCHORS[parent['prototype']].append({'name': name, 'position': list(point), 'kind': kind})


def gallery():
    r = root('tension_gallery_segment')
    # A deep open Warren truss carries a recessed service deck. Formed collars
    # cover the joints, while open web panels remain visible from racing below.
    for z in [-6.8, 6.8]:
        box('lower flanged load chord', (0, -5.2, z), (36, 2.4, 2.6), 'graphite', r, .22)
        box('upper load chord', (0, 4.6, z), (36, 2, 2.2), 'graphite', r, .16)
        for i in range(3):
            x0 = -17 + i * 11.33
            x1 = x0 + 11.33
            beam('open diagonal load web', (x0, -4.2 if i % 2 == 0 else 3.8, z), (x1, 3.8 if i % 2 == 0 else -4.2, z), 1.05, 1.2, 'titanium', r)
    for x in [-17, -5.7, 5.7, 17]:
        box('transverse bed web', (x, -4.7, 0), (1.5, 2.2, 13.6), 'graphite', r, .1)
    box('recessed service walking deck', (0, 2.6, 0), (35.2, .9, 12.3), 'titanium', r, .12)
    for x in [-16.4, 16.4]:
        for z in [-7.5, 7.5]:
            box('joint gasket', (x, -.5, z), (2.8, 12.8, 2.2), 'graphite', r, .2)
            box('formed ivory joint cheek', (x, -.5, z * 1.045), (2.35, 12, 2.1), 'ivory', r, .3)
        box('joint crown cap', (x, 5.95, 0), (2.4, 1.4, 15.9), 'ivory', r, .2)
    for z in [-7.25, 7.25]:
        box('copper hand rail', (0, 8, z), (35.4, .36, .36), 'copper', r, .06)
        for x in [-17, -5.7, 5.7, 17]:
            box('seated rail stanchion', (x, 5.8, z), (.4, 4.5, .45), 'copper', r, .06)
    for x in [-10.6, 10.6]:
        box('service canopy gasket', (x, 8.2, 3.75), (9.2, 1.3, 5.7), 'graphite', r, .16)
        box('formed service canopy', (x, 9, 3.75), (8.8, 1.15, 5.4), 'ivory', r, .24)
    for x in [-11.4, 0, 11.4]:
        box('light seated graphite bezel', (x, 3.4, -8.16), (2.5, 1.45, .7), 'graphite', r, .12)
        box('warm service light', (x, 3.4, -8.56), (1.65, .35, .12), 'amber', r, .02)
    anchor(r, 'joint_port', (-18, -.5, 0), 'gallery')
    anchor(r, 'joint_starboard', (18, -.5, 0), 'gallery')
    anchor(r, 'service_deck', (0, 3.1, 0), 'service')
    return r


def load_crown():
    r = root('sail_load_crown')
    box('graphite load bed', (0, -22.5, 0), (52, 6, 34), 'graphite', r, .8)
    for x in [-21, 21]:
        poly = [(x - 5, -19), (x + 5, -19), (x + 7, -9), (x + 4.5, 34), (x - 4.5, 34), (x - 7, -9)]
        plate_profile('tapered cast load shoulder', poly, -10, 10, 'graphite', r, .5)
        box('ivory shoulder cover', (x, 13, -11.2), (7.8, 31, 2.1), 'ivory', r, .65)
        box('load shoe', (x, -20, 0), (14, 3, 41), 'titanium', r, .3)
    box('header deep load beam', (0, 34, 0), (52, 8, 21), 'graphite', r, .65)
    box('formed ivory header cap', (0, 39, 0), (54, 3, 22), 'ivory', r, .65)
    for x in [-12, 12]:
        # Two working reels with wound cores, open spoked flanges, machined
        # shafts and separate bearing cradles; no solid disc hides the winding.
        y = 9
        profile = [(-8, 7.9)]
        for j in range(10):
            axial = -7.6 + j * 1.6
            profile.extend([(axial, 8.35), (axial + .65, 8.35), (axial + 1.15, 7.9)])
        lathe('actual cable winding core', (x, y, 0), profile, 'copper', r, 32)
        cylinder('through reel shaft', (x, y, 0), 2.5, 37, 'titanium', r, 24)
        for z in [-9.2, 9.2]:
            ring('machined open reel rim', (x, y, z), 11.4, 9.8, 1.6, 'titanium', r, 32)
            cylinder('reel hub', (x, y, z), 3.35, 3.4, 'graphite', r, 24)
            for j in range(6):
                angle = j * math.tau / 6
                a = (x + math.cos(angle) * 3, y + math.sin(angle) * 3, z)
                b = (x + math.cos(angle) * 10.2, y + math.sin(angle) * 10.2, z)
                beam('open flange spoke', a, b, 1.15, 1.5, 'titanium', r)
        for z in [-16, 16]:
            box('seated bearing bridge', (x, y - 5.8, z), (11, 4.2, 7.2), 'graphite', r, .35)
            lathe('bearing shell', (x, y, z), [(-2.8, 2.7), (-2.8, 5.4), (2.8, 5.4), (2.8, 2.7), (-2.8, 2.7)], 'graphite', r, 24)
            ring('bronze bearing seat', (x, y, z - 3.1), 4.5, 2.7, .8, 'copper', r, 24)
        # Deep formed motor cassettes below the reels retain a dark intake throat.
        box('motor deep housing', (x, -10, 1.8), (16.7, 13, 25), 'graphite', r, 1)
        box('motor ivory removable hood', (x, -4, 3), (16.9, 2.4, 23), 'ivory', r, .6)
        box('motor recessed open inlet', (x, -10, -11.2), (12, 8, .6), 'void', r, .05)
        for j in [-2, -1, 0, 1, 2]:
            box('motor inlet formed louver', (x, -10 + j * 1.3, -12), (11.6, .45, 1.2), 'titanium', r, .08)
        box('motor warm status bezel', (x, -14.5, -12), (4, .9, .6), 'graphite', r, .1)
        box('motor seated status light', (x, -14.5, -12.4), (2.4, .3, .12), 'amber', r, .02)
    # An open service bridge gives the mechanics a human-scale layer without
    # filling the large machine apertures with decorative boxes.
    box('service bridge floor', (0, -1.8, -18.8), (49, 1.2, 5.2), 'titanium', r, .15)
    for y in [.5, 2]:
        box('service bridge copper rail', (0, y, -21.4), (49, .35, .35), 'copper', r, .05)
    for x in [-24, -12, 0, 12, 24]:
        box('service bridge rail post', (x, .1, -21.4), (.35, 4.1, .35), 'copper', r, .05)
    ring('header tension eye', (0, 43, 0), 4.4, 2.7, 4, 'copper', r, 24)
    for x in [-20, 20]:
        box('header status bezel', (x, 34.3, -11.2), (6, 2.7, .8), 'graphite', r, .2)
        box('header seated service light', (x, 34.3, -11.7), (3.8, .7, .12), 'amber', r, .05)
    anchor(r, 'gallery_port', (-26, -13, 0), 'gallery')
    anchor(r, 'gallery_starboard', (26, -13, 0), 'gallery')
    anchor(r, 'cable_eye', (0, 43, 0), 'cable')
    anchor(r, 'reel_port', (-12, 9, -11), 'cable')
    anchor(r, 'reel_starboard', (12, 9, -11), 'cable')
    return r


gallery()
load_crown()
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
scene.world.color = (.12, .14, .17)
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))

export_roots = []
stats = []
for prototype, source in SOURCES.items():
    r = bpy.data.objects.new(prototype, None)
    bpy.context.collection.objects.link(r)
    r['assetKind'] = 'ravel-tension-gallery'
    export_roots.append(r)
    dg = bpy.context.evaluated_depsgraph_get()
    batches = {}
    for obj in list(source.children_recursive):
        if obj.type != 'MESH':
            continue
        g = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        copy = bpy.data.objects.new('EXPORT__' + obj.name, g)
        bpy.context.collection.objects.link(copy)
        copy.matrix_world = obj.matrix_world.copy()
        copy.parent = r
        batches.setdefault(obj.data.materials[0].name, []).append(copy)
    triangles = 0
    for key, objects in batches.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        batch = bpy.context.object
        batch.name = prototype + '__' + key.split('/')[0].strip().lower() + '_' + key.split('/')[-1].strip().replace(' ', '_')
        batch.data.calc_loop_triangles()
        triangles += len(batch.data.loop_triangles)
    for item in ANCHORS[prototype]:
        node = bpy.data.objects.new(prototype + '__' + item['name'], None)
        bpy.context.collection.objects.link(node)
        node.parent = r
        node.location = xyz(item['position'])
        node['anchorKind'] = item['kind']
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ vertex.co for obj in r.children_recursive if obj.type == 'MESH' for vertex in obj.data.vertices]
    game_points = [(p.x, p.z, -p.y) for p in points]
    low = [min(p[k] for p in game_points) for k in range(3)]
    high = [max(p[k] for p in game_points) for k in range(3)]
    stats.append({'name': prototype, 'triangles': triangles, 'materialBatches': len(batches), 'bounds': {'min': low, 'max': high}, 'dimensions': [high[k] - low[k] for k in range(3)], 'anchors': ANCHORS[prototype]})

bpy.ops.object.select_all(action='DESELECT')
for r in export_roots:
    r.select_set(True)
    for child in r.children_recursive:
        child.select_set(True)
OUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUT), export_format='GLB', use_selection=True, export_apply=True, export_extras=True, export_cameras=False, export_lights=False, export_animations=False, export_materials='EXPORT', export_yup=True)

if args.render:
    for source in SOURCES.values():
        for child in source.children_recursive:
            child.hide_render = True
    export_roots[1].location = xyz((60, 0, 0))
    world = scene.world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.1, .12, .15, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .55
    def area(name, point, power, size, color):
        d = bpy.data.lights.new(name, 'AREA')
        d.energy = power
        d.shape = 'DISK'
        d.size = size
        d.color = color
        o = bpy.data.objects.new(name, d)
        scene.collection.objects.link(o)
        o.location = xyz(point)
        o.rotation_euler = (xyz((25, 7, 0)) - o.location).to_track_quat('-Z', 'Y').to_euler()
    area('warm key', (0, 80, -55), 850000, 100, (1, .8, .58))
    area('cool fill', (70, 45, 50), 650000, 85, (.58, .74, 1))
    cam_data = bpy.data.cameras.new('Kit review camera')
    cam = bpy.data.objects.new('Kit review camera', cam_data)
    scene.collection.objects.link(cam)
    cam.location = xyz((107, 63, -119))
    cam.rotation_euler = (xyz((26, 6, 0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 140
    scene.camera = cam
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 2
    scene.cycles.samples = 16
    scene.render.resolution_x = 1500
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    TEMP.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(TEMP / 'gallery-crown-review.png')
    bpy.ops.render.render(write_still=True)

refs = ['sail-basin-selected-crop.png', 'ravel-anchor-narrows-concept.png', 'ravel-crown-fold-concept.png']
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
provenance = {
    'generator': 'Original procedural Blender geometry authored for VECTOR//NOVA',
    'coordinates': 'Metres, +Y up, +Z forward; gallery segment longitudinal axis +X',
    'rights': 'Project-authored editable Blender meshes and scalar PBR materials; project-owned generated concepts used only as references. No external assets or textures.',
    'source': 'build_tension_gallery.py', 'blend': BLEND.name,
    'runtimeAsset': 'public/assets/levels/ravel/tension-gallery.glb',
    'referenceImages': [{'file': 'assets/levels/ravel/reference/' + name, 'sha256': sha(ASSET.parent / 'reference' / name)} for name in refs],
    'prototypes': stats,
    'totalTriangles': sum(s['triangles'] for s in stats),
    'materials': [m.name for m in M.values()],
    'hashes': {'build_tension_gallery.py': sha(Path(__file__)), BLEND.name: sha(BLEND), OUT.name: sha(OUT)},
}
(ASSET / 'tension-gallery-provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
print('RAVEL_TENSION_GALLERY ' + json.dumps(stats))
