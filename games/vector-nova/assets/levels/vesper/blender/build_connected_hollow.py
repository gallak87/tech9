"""Replace only the giant hollow's exterior boughs/crown in the original library.

Reuses the exact route-cut shell, interior, roots and materials from build_vesper;
all other original objects are loaded unchanged from vesper-assets.blend. The
connected-tree builder supplies parent-sampled forks, shoots and petiolate leaves.
Run after build_vesper.py; the separate connected-forest asset is never rewritten.
"""
import bpy
import bmesh
import hashlib
import json
import math
import random
import sys
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT))
from connected_tree_geometry import make_connected_tree

DEST = ROOT.parents[3] / 'public/assets/levels/vesper'
EVIDENCE = ROOT.parents[3] / '.experiments/expansion/vesper/connected-hollow'
EVIDENCE.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'vesper-assets.blend'))
old = bpy.data.objects['hero_hollow']
for obj in list(old.children_recursive) + [old]:
    bpy.data.objects.remove(obj, do_unlink=True)

# Share the baseline shell code instead of maintaining a subtly different copy.
# These bounded sections contain helpers and the shell/interior/root construction;
# the old disconnected crown and unrelated asset generators are excluded.
source = (ROOT / 'build_vesper.py').read_text()
namespace = dict(globals())
namespace['B'] = lambda p: (p[0], -p[2], p[1])
for key, label in {
    'bark': 'ridged indigo bark', 'inner': 'shadowed cambium',
    'sapwood': 'exposed ivory sapwood', 'leafmat': 'waxed blue teal leaves',
    'vein': 'cool leaf veins', 'creatureshell': 'walker layered carapace',
    'creatureunder': 'walker ivory joints', 'creatureridge': 'walker weathered plate margins',
}.items():
    namespace[key] = bpy.data.materials['Vesper | ' + label]
exec(compile(source[source.index('def empty('):source.index('# Organic hollow wall')], 'baseline-helpers', 'exec'), namespace)
exec(compile(source[source.index('# Organic hollow wall'):source.index('for i in range(9):')], 'preserved-hollow-shell', 'exec'), namespace)
hero = namespace['hero']
ring, upper_ring, kdt = (namespace[key] for key in ['ring', 'upper_ring', 'kdt'])
H = namespace['H']

def mesh_signature(obj):
    payload = ([list(v.co) for v in obj.data.vertices], [list(p.vertices) for p in obj.data.polygons])
    return hashlib.sha256(json.dumps(payload).encode()).hexdigest()

preserved = {obj.name: mesh_signature(obj) for obj in hero.children}
anchors = []
rejected = []

def layout(tube, along, leafy_shoot):
    rng = random.Random(300930)
    for k in range(26):
        a = k * 2.399 + .22
        lower = k < 12
        t = .70 + (k % 4) * .085 if lower else .16 + ((k - 12) % 7) * .086
        surface = ring(t, a) if lower else upper_ring(t, a)
        radial = Vector((math.cos(a), 0, math.sin(a)))
        side = Vector((-math.sin(a), 0, math.cos(a)))
        # Embed the branch root into the actual bark, not an assumed cylinder.
        base = surface - radial * 3
        length = (104 + 24 * math.sin(k * 1.7)) if lower else (145 + 23 * math.sin(k * 1.3))
        rise = (62 + 15 * (k % 3)) if lower else (88 + 12 * (k % 3))
        radius = (13 if lower else 15) * (1 - .30 * t)
        points = [base + radial * (length * f) + side * (math.sin(f * 2.0) * 13 * math.sin(k)) + Vector((0, rise * f + 13 * math.sin(f * math.pi), 0)) for f in [j / 18 for j in range(19)]]
        radii = [radius * (1 - j / 18) ** 1.1 + .9 for j in range(19)]
        # Omit a whole bough where it would obstruct an entrance or crown exit.
        # No vertex clipping: every accepted limb retains a complete silhouette.
        if any(kdt.find(p)[2] < 48 + r * 1.4 for p, r in zip(points, radii)):
            rejected.append(k)
            continue
        name = 'limb-hollow-' + str(k)
        tube(name, points, radii, 12)
        anchors.append({'id': name, 'surface': list(surface), 'base': list(base), 'shell': 'lower' if lower else 'upper', 't': t, 'angle': a, 'embeddedMetres': 3})
        for n, f in enumerate([.49, .81]):
            socket = along(points, f)
            for sign in [-1, 1]:
                direction = (radial * .52 + side * sign * .82 + Vector((0, .40, 0))).normalized()
                reach = 39 + rng.random() * 17
                forks = [socket + direction * (reach * q) + Vector((0, 5 * math.sin(q * math.pi), 0)) for q in [j / 8 for j in range(9)]]
                twig = name + '-fork-' + str(n) + '-' + str(sign)
                tube(twig, forks, [4.8 * (1 - j / 8) ** 1.1 + .28 for j in range(9)], 8, name, socket)
                for m, q in enumerate([.55, 1]):
                    start = along(forks, q)
                    heading = (direction + side * ((m - 1) * .38) + Vector((0, .12, 0))).normalized()
                    leafy_shoot(twig + '-shoot-' + str(m), start, heading, 26 + rng.random() * 10, twig)
        leafy_shoot(name + '-leader', points[-1], radial + Vector((0, .55, 0)), 38, name)
    # The last shoots grow from the real narrowing top, completing the apex.
    for k in range(7):
        a = k * 2.399
        surface = upper_ring(.94 + (k % 3) * .018, a)
        radial = Vector((math.cos(a), 0, math.sin(a)))
        base = surface - radial * 1.5
        name = 'apical-hollow-' + str(k)
        leafy_shoot(name, base, radial * .75 + Vector((0, .65, 0)), 35, None)
        anchors.append({'id': name, 'surface': list(surface), 'base': list(base), 'shell': 'upper', 't': .94 + (k % 3) * .018, 'angle': a, 'embeddedMetres': 1.5})

full = make_connected_tree(300930, forest_budget=False, layout=layout, foliage_scale=3.0)
for kind, data in full['parts'].items():
    mesh = bpy.data.meshes.new('Connected hollow ' + kind)
    mesh.from_pydata(data['v'], [], data['f'])
    mesh.update()
    uv = mesh.uv_layers.new(name='Living bark metres' if kind == 'wood' else 'Broad leaf UV')
    colors = mesh.color_attributes.new(name='COLOR_0', type='FLOAT_COLOR', domain='CORNER') if kind == 'leaves' else None
    for poly in mesh.polygons:
        poly.use_smooth = True
        for loop in poly.loop_indices:
            vi = mesh.loops[loop].vertex_index
            uv.data[loop].uv = data['uv'][vi]
            if colors: colors.data[loop].color = data['c'][vi]
    mesh.validate(clean_customdata=False)
    obj = bpy.data.objects.new('Connected hollow ' + kind, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = hero
    obj.data.materials.append(namespace['bark' if kind == 'wood' else 'leafmat'])

# Validate attachments against the actual parent polyline, not just stored sockets.
def distance_to_path(p, path):
    return min((p - (a + (b-a) * max(0, min(1, (p-a).dot(b-a)/(b-a).length_squared)))).length for a,b in zip(path, path[1:]))
gaps = [distance_to_path(Vector(part['base']), full['paths'][part['parent']]) for part in full['structure'] if part['parent']]
assert max(gaps) < .0001
assert preserved == {obj.name: mesh_signature(obj) for obj in hero.children if not obj.name.startswith('Connected hollow')}
hero['connectedCrown'] = True
hero['preservedShell'] = True
# Merge only the preserved surfaces for the original bounded draw count. New
# crown stays separately named so geometry/clearance inspection can target it.
new_objects = [obj for obj in hero.children if obj.name.startswith('Connected hollow')]
for obj in new_objects: obj.parent = None
namespace['merge_materials'](hero)
for obj in new_objects: obj.parent = hero
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'vesper-connected-hollow.blend'), compress=True)
bpy.ops.export_scene.gltf(filepath=str(DEST / 'vesper-canopy.glb'), export_format='GLB', export_yup=True, export_apply=True, export_animations=False, export_extras=True)
report = {'asset': 'vesper-canopy.glb', 'checkpoint': '927bfc63', 'preservedShellInteriorAndRoots': preserved, 'rootAnchors': anchors, 'omittedBoughsForClearance': rejected, 'leafCount': full['leafCount'], 'attachments': len(gaps), 'maxParentGapMetres': max(gaps), 'crownTriangles': sum(len(f)-2 for data in full['parts'].values() for f in data['f']), 'exportBytes': (DEST / 'vesper-canopy.glb').stat().st_size}
(EVIDENCE / 'generator-report.json').write_text(json.dumps(report, indent=2) + '\n')
print('CONNECTED_HOLLOW_REPORT', json.dumps({k:v for k,v in report.items() if k not in ['preservedShellInteriorAndRoots', 'rootAnchors']}))
