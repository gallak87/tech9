"""Extract compound contact geometry from unchanged editable Blender sources.

Run from the app root with:
  blender --background --python tools/extract-ship-collision-assemblies.py
Then run node tools/generate-ship-collision-hulls.mjs.

Structural seeds are authored assemblies, not material groups. Small fittings
join the nearest structural surface; they never become individual colliders.
The checked-in intermediate lets CPU verification run without Blender.
"""
import hashlib
import json
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[1]


def copies(name, count):
    return [name] + [f'{name}.{index:03d}' for index in range(1, count)]


SEEDS = {
    'kestrel': [
        'Graphite central torsion spine', 'Canopy structural seat',
        'Ceramic swept monocoque L', 'Ceramic swept monocoque R',
        'Integrated graphite power housing L', 'Integrated graphite power housing R',
        'Swept canted fin L', 'Swept canted fin R',
    ],
    'shrike': [
        'Compact graphite monocoque', 'Low smoked flight canopy',
        'Crescent ceramic wing skin-1', 'Crescent ceramic wing skin1',
        'Graphite power housing L', 'Graphite power housing R',
        *copies('Canted stabiliser', 2),
    ],
    'bastion': [
        'Recessed central cockpit bridge', 'Low smoked flight canopy',
        *copies('Long narrow sponson skeleton', 2),
        'Graphite power housing L', 'Graphite power housing R',
        *copies('Open channel cross bridge', 4), *copies('Open channel diagonal', 4),
    ],
    'needle': [
        'Full spear monocoque', 'Low smoked flight canopy', 'Graphite power housing C',
        'Swept tail wing-1', 'Swept tail wing1', *copies('Canted stabiliser', 2),
    ],
    'rook': [
        'Low clipped delta chassis', 'Angular cockpit gasket',
        'Cast nozzle housing L', 'Cast nozzle housing R',
    ],
    'latch': [
        'Narrow central chassis', 'Angular cockpit gasket',
        *copies('Exposed cylindrical engine core', 2),
        'Straight forward stabiliser-1', 'Straight forward stabiliser1',
        *copies('Straight nacelle cross spar', 4),
    ],
    'mule': [
        'Rounded continuous lower tub', 'Angular cockpit gasket',
        'Raised aft service spine', 'Cast nozzle housing C',
        *copies('Rear transom corner bumper', 2),
    ],
    'pike': [
        'Long spearhead graphite keel', 'Angular cockpit gasket',
        'Engine structural pressure sleeve C',
        'Swept aft stabiliser port', 'Swept aft stabiliser starboard',
        *copies('Shoulder inlet surround', 2),
    ],
    'tern': [
        'Suspended cockpit capsule graphite keel', 'Angular cockpit gasket',
        *copies('Separated longitudinal boom skeleton', 2),
        'Cast nozzle housing L', 'Cast nozzle housing R',
        *copies('Exposed wing-box cross member', 4),
        'Cranked transom aerofoil port', 'Cranked transom aerofoil starboard',
    ],
    'manta': [
        'Low wide wing centre graphite keel', 'Angular cockpit gasket',
        'Broad continuous swept wing port', 'Broad continuous swept wing starboard',
        'Cast nozzle housing L', 'Cast nozzle housing R',
    ],
    'vise': [
        'Hammerhead centre tub graphite keel', 'Angular cockpit gasket',
        'Broad hammerhead forward canard port', 'Broad hammerhead forward canard starboard',
        'Engine structural pressure sleeve L', 'Engine structural pressure sleeve R',
        *copies('Triangulated aft engine carrier', 2),
    ],
    'kite': [
        'Compact diamond monocoque graphite keel', 'Angular cockpit gasket',
        *copies('Canted aft control vane', 2), 'Cast nozzle housing C',
    ],
    'gannet': [
        'Raised gull fuselage graphite keel', 'Angular cockpit gasket',
        'Descending gull wing structure port', 'Descending gull wing structure starboard',
        *copies('Low swept engine outrigger', 2),
        'Cast nozzle housing L', 'Cast nozzle housing R',
    ],
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def hull_vertices(points):
    mesh = bmesh.new()
    try:
        for point in sorted(set(tuple(point) for point in points)):
            mesh.verts.new(point)
        result = bmesh.ops.convex_hull(mesh, input=list(mesh.verts), use_existing_faces=False)
        faces = [face for face in result['geom'] if isinstance(face, bmesh.types.BMFace)]
        mesh.normal_update()
        exterior = {tuple(vertex.co) for face in faces for vertex in face.verts}
        # BMesh QuickHull coalesces nearly coplanar points more aggressively
        # than the runtime hull builder. Retain any omitted point outside a
        # returned face so the final JavaScript hull encloses the source skin.
        planes = [(face.normal.copy(), face.normal.dot(face.verts[0].co)) for face in faces]
        exterior.update(tuple(point) for point in points
                        if any(normal.dot(point) - offset > 0.000001 for normal, offset in planes))
        assert len(exterior) >= 4, 'Structural assembly must have volume'
        return [round(value, 7) or 0 for point in sorted(exterior) for value in point]
    finally:
        mesh.free()


catalogue = {}
for identity, names in SEEDS.items():
    relative = Path('assets/ships') / ('' if identity in list(SEEDS)[:4] else 'rivals') / identity
    blend = ROOT / relative / f'{identity}.blend'
    glb = ROOT / 'public' / relative / f'{identity}.glb'
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    collection = next(collection for collection in bpy.data.collections
                      if collection.name.startswith(identity.upper() + ' |'))
    depsgraph = bpy.context.evaluated_depsgraph_get()
    components = {}
    for obj in sorted(collection.objects, key=lambda obj: obj.name):
        if obj.type not in {'MESH', 'CURVE', 'FONT'}:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            points = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
            # Blender (X forward-plane Y, vertical Z) -> glTF +Z forward/+Y up.
            points = [Vector((point.x, point.z, -point.y)) for point in points]
            if points:
                components[obj.name] = {
                    'points': points,
                    'polygons': [list(face.vertices) for face in mesh.polygons],
                }
        finally:
            evaluated.to_mesh_clear()
    assert all(name in components for name in names), (identity, set(names) - components.keys())
    surfaces = {name: BVHTree.FromPolygons(components[name]['points'], components[name]['polygons'])
                for name in names}
    assemblies = {name: {'points': [], 'components': []} for name in names}
    for name, component in components.items():
        if name in assemblies:
            owner = name
        else:
            points = component['points']
            # Sample the complete component, not its origin or centroid. This
            # keeps long panel skins with their matching wing/body/engine.
            samples = points[::max(1, len(points) // 24)]
            owner = min(names, key=lambda seed: sum(
                surfaces[seed].find_nearest(point)[3] ** 2 for point in samples) / len(samples))
        assemblies[owner]['points'].extend(component['points'])
        assemblies[owner]['components'].append(name)
    parts = [{
        'id': f'assembly-{index + 1:02d}', 'name': name,
        'components': data['components'], 'vertices': hull_vertices(data['points']),
    } for index, (name, data) in enumerate(assemblies.items())]
    catalogue[identity] = {
        'source': str(blend.relative_to(ROOT)), 'sourceSha256': digest(blend),
        'assetSha256': digest(glb), 'parts': parts,
    }
    print(f'{identity}: {len(parts)} assemblies, {sum(len(part["vertices"]) // 3 for part in parts)} vertices', flush=True)

output = ROOT / 'assets/ships/collision-assemblies.json'
output.write_text(json.dumps({'version': 1, 'ships': catalogue}, separators=(',', ':')) + '\n')
print(f'Wrote {output}', flush=True)
