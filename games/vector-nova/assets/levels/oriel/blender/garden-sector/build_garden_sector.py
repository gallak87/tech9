"""Author one Oriel contour-garden landform on the frozen production shell.

Run from games/vector-nova:
blender --background --factory-startup --python assets/levels/oriel/blender/garden-sector/build_garden_sector.py
The editable carrier is closed and follows the exact legacy height field. Its
shallow contour lift fades into the soil; no new terrain field or grid is used
by runtime. All paths, trees and the surviving civic node seat on actual faces.
"""
import bpy
import hashlib
import json
import math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import numpy as np

HERE = Path(__file__).resolve().parent
APP = HERE.parents[4]
GROUND = HERE.parent / 'ground/height-field.json'
GUIDES = HERE / 'route-guides.json'
EXPORT = APP / 'public/assets/levels/oriel/oriel-garden-sector.glb'
field = json.loads(GROUND.read_text())
guides = json.loads(GUIDES.read_text())
route = np.array([g['position'] for g in guides['points']])
scene = bpy.context.scene
scene.name = 'Oriel / connected contour garden and crescent grove'
scene.unit_settings.system = 'METRIC'
for obj in list(scene.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
collection = bpy.data.collections.new('Editable connected hillside cultivation')
scene.collection.children.link(collection)


def material(name, color, roughness):
    m = bpy.data.materials.new('Oriel garden sector / ' + name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    return m


crop = material('sage cultivated garden', (.23, .34, .14), .96)
orchard = material('deep orchard soil', (.16, .26, .095), .98)
stone = material('warm retaining limestone', (.64, .57, .43), .86)
paving = material('pale honed garden path', (.79, .74, .58), .81)
materials = [crop, orchard, stone, paving]
parts, seating, all_world = [], [], []
minimum_plan_area = math.inf


def smoothstep(a, b, x):
    t = max(0, min(1, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def terrain_height(u, z):
    a = (u / 1000 % math.tau) / math.tau * field['thetaSegments']
    b = max(0, min(field['zSegments'], (z - field['zMin']) /
                         (field['zMax'] - field['zMin']) * field['zSegments']))
    i, j = min(field['thetaSegments'] - 1, int(a)), min(field['zSegments'] - 1, int(b))
    x, y = a - i, b - j
    A, B = field['heights'][j][i:i + 2]
    C, D = field['heights'][j + 1][i:i + 2]
    return A + (B - A) * x + (C - A) * y if x + y <= 1 else D + (C - D) * (1 - x) + (B - D) * (1 - y)


def point(u, z, h):
    a, r = u / 1000, 1000 - h
    return (math.sin(a) * r, 1000 - math.cos(a) * r, z)


def basis(u, yaw=0):
    a = u / 1000
    right, up, tangent = Vector((math.cos(a), math.sin(a), 0)), Vector((-math.sin(a), math.cos(a), 0)), Vector((0, 0, 1))
    return {'basisRight': list(right * math.cos(yaw) - tangent * math.sin(yaw)),
            'basisUp': list(up),
            'basisTangent': list(right * math.sin(yaw) + tangent * math.cos(yaw))}


def mesh(name, coords, faces, face_materials, soil_normals=None):
    world = [point(*p) for p in coords]
    all_world.extend(world)
    data = bpy.data.meshes.new(name)
    data.from_pydata([(p[0], -p[2], p[1]) for p in world], [], faces)
    data.update()
    for m in materials:
        data.materials.append(m)
    for p, mi in zip(data.polygons, face_materials):
        p.material_index = mi
        p.use_smooth = mi in (0, 1)
    if soil_normals is not None:
        loop_normals = []
        for poly in data.polygons:
            for li in poly.loop_indices:
                if poly.material_index in (0, 1):
                    n = soil_normals[data.loops[li].vertex_index]
                    loop_normals.append((n[0], -n[2], n[1]))
                else:
                    loop_normals.append(tuple(poly.normal))
        data.normals_split_custom_set(loop_normals)
    uv = data.uv_layers.new(name='Legacy shell coordinates')
    for poly in data.polygons:
        for li in poly.loop_indices:
            u, z, _ = coords[data.loops[li].vertex_index]
            uv.data[li].uv = (u / 1000 / math.tau, 1 - (z + 2400) / 4800)
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    parts.append(obj)
    return obj


CONTOUR = [(-450, 1980), (150, 1980), (200, 2000), (250, 2050),
           (300, 2120), (350, 2180), (400, 2210), (450, 2210),
           (500, 2200), (550, 2200), (600, 2270), (650, 2370), (700, 2470)]


def edges(z):
    lo = float(np.interp(z, [v[0] for v in CONTOUR], [v[1] for v in CONTOUR]))
    shoulder = 10 * math.sin((z + 450) / 1100 * math.pi)
    return lo + shoulder, 2610 - 14 * math.sin((z + 450) / 900 * math.pi) + shoulder


def carrier_height(u, z, boundary_distance=None):
    base = terrain_height(u, z)
    lo, hi = edges(z)
    fade = smoothstep(0, 75, u - lo) * smoothstep(0, 75, hi - u)
    fade *= smoothstep(-450, -350, z) * (1 - smoothstep(590, 700, z))
    if boundary_distance is not None:
        fade = min(fade, smoothstep(0, 60, boundary_distance))
    # A continuous 8m contour profile has broad benches and short smooth risers.
    # The maximum added soil is9.7m; end/side shoulders melt into existing land.
    q, f = math.floor(base / 8), (base % 8) / 8
    stepped = q * 8 + 9.5 + 8 * smoothstep(.58, 1, f)
    return base + .18 + fade * (stepped - base - .18)


# The carrier is a2x subdivision of the EXACT legacy a,c,b / b,c,d
# triangles. A positive lift therefore stays above the same supporting plane;
# it never bridges an unrelated grid's concave terrain crease.
DU = math.tau * 1000 / field['thetaSegments']
DZ = (field['zMax'] - field['zMin']) / field['zSegments']
plan, top_faces, lookup = [], [], {}


def inside(p):
    u, z = p
    lo, hi = edges(z)
    return -450 <= z <= 700 and lo <= u <= hi


def index(p):
    key = tuple(round(v, 8) for v in p)
    if key not in lookup:
        lookup[key] = len(plan)
        plan.append(p)
    return lookup[key]


def child_triangle(A, B, C):
    AB = tuple((a + b) / 2 for a, b in zip(A, B))
    BC = tuple((a + b) / 2 for a, b in zip(B, C))
    CA = tuple((a + b) / 2 for a, b in zip(C, A))
    for tri in [(A, AB, CA), (AB, B, BC), (CA, BC, C), (AB, BC, CA)]:
        if all(inside(p) for p in tri):
            top_faces.append(tuple(index(p) for p in tri))


for j in range(78, 124):
    z0 = field['zMin'] + j * DZ
    for i in range(89, 122):
        u0 = i * DU
        a, b, c, d = (u0, z0), (u0 + DU, z0), (u0, z0 + DZ), (u0 + DU, z0 + DZ)
        child_triangle(a, c, b)
        child_triangle(b, c, d)
edge_counts, directed = {}, {}
for tri in top_faces:
    for a, b in zip(tri, tri[1:] + tri[:1]):
        key = tuple(sorted((a, b)))
        edge_counts[key] = edge_counts.get(key, 0) + 1
        directed[key] = (a, b)
boundary_edges = [directed[key] for key, count in edge_counts.items() if count == 1]
boundary_indices = sorted(set(v for edge in boundary_edges for v in edge))
plan_array = np.array(plan)
boundary_plan = plan_array[boundary_indices]
boundary_distances = []
for p in plan_array:
    boundary_distances.append(float(np.sqrt(((boundary_plan - p) ** 2).sum(axis=1)).min()))
def legacy_plan_position(u, z):
    # Exact 3D barycentric position on the original supporting face. Polar
    # height interpolation is close but not identical at a strong crease.
    a, b = u / DU, (z - field['zMin']) / DZ
    i, j = int(a), int(b)
    x, y = a - i, b - j
    A = Vector(point(i * DU, field['zMin'] + j * DZ, field['heights'][j][i]))
    B = Vector(point((i + 1) * DU, field['zMin'] + j * DZ, field['heights'][j][i + 1]))
    C = Vector(point(i * DU, field['zMin'] + (j + 1) * DZ, field['heights'][j + 1][i]))
    D = Vector(point((i + 1) * DU, field['zMin'] + (j + 1) * DZ, field['heights'][j + 1][i + 1]))
    return A + (B - A) * x + (C - A) * y if x + y <= 1 else D + (C - D) * (1 - x) + (B - D) * (1 - y)


coords = []
for (u, z), distance in zip(plan, boundary_distances):
    original = legacy_plan_position(u, z)
    actual_u = math.atan2(original.x, 1000 - original.y) * 1000
    h = 1000 - math.hypot(original.x, original.y - 1000)
    lift = carrier_height(actual_u, z, distance) - terrain_height(actual_u, z)
    top = h + lift
    coords.append((actual_u, z, top))
    seating.append({'u': actual_u, 'z': z, 'ground': h,
                    'groundCPU': terrain_height(actual_u, z),
                    'top': top, 'bottom': h - 1.25})
count = len(coords)
coords += [(p['u'], p['z'], p['bottom']) for p in seating]
faces, ids = [], []
for tri in top_faces:
    A, B, C = [coords[i] for i in tri]
    area = abs(((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])) / 2)
    minimum_plan_area = min(minimum_plan_area, area)
    uc, zc = sum(v[0] for v in (A, B, C)) / 3, sum(v[1] for v in (A, B, C)) / 3
    grove_u = float(np.interp(zc, [-350, -150, 50, 240, 410, 500], [2110, 2250, 2380, 2460, 2430, 2370]))
    mi = 1 if -350 < zc < 510 and abs(uc - grove_u) < 46 else 0
    faces += [tri, tuple(v + count for v in reversed(tri))]
    ids += [mi, 2]
for a, b in boundary_edges:
    faces.append((b, a, a + count, b + count))
    ids.append(2)

# Smooth the top only, then blend the boundary normals to the same periodic
# legacy gradients. Hard path/foundation normals stay independent.
land_world = [Vector(point(*p)) for p in coords[:count]]
carrier_normals = np.zeros((count, 3))
for tri in top_faces:
    A, B, C = [land_world[i] for i in tri]
    n = np.array((B - A).cross(C - A))
    for v in tri:
        carrier_normals[v] += n
carrier_normals /= np.linalg.norm(carrier_normals, axis=1, keepdims=True)
legacy_heights = np.array(field['heights'])
theta, axial = np.meshgrid(np.array(field['thetaCoordinates']), np.array(field['zCoordinates']))
radii = 1000 - legacy_heights
legacy_world = np.stack((np.sin(theta) * radii, 1000 - np.cos(theta) * radii, axial), axis=-1)
tt, tz = np.empty_like(legacy_world), np.empty_like(legacy_world)
tt[:, 1:-1] = legacy_world[:, 2:] - legacy_world[:, :-2]
tt[:, 0] = legacy_world[:, 1] - legacy_world[:, -2]
tt[:, -1] = tt[:, 0]
tz[1:-1] = legacy_world[2:] - legacy_world[:-2]
tz[0] = legacy_world[1] - legacy_world[0]
tz[-1] = legacy_world[-1] - legacy_world[-2]
legacy_normals = np.cross(tz, tt)
legacy_normals /= np.linalg.norm(legacy_normals, axis=-1, keepdims=True)
soil_normals = []
for (u, z), distance, normal in zip(plan, boundary_distances, carrier_normals):
    a, b = u / DU, (z - field['zMin']) / DZ
    i, j = int(a), int(b)
    x, y = a - i, b - j
    A, B, C, D = legacy_normals[j, i], legacy_normals[j, i + 1], legacy_normals[j + 1, i], legacy_normals[j + 1, i + 1]
    old = A + (B - A) * x + (C - A) * y if x + y <= 1 else D + (C - D) * (1 - x) + (B - D) * (1 - y)
    t = smoothstep(0, 50, distance)
    n = old * (1 - t) + normal * t
    soil_normals.append(n / np.linalg.norm(n))
mesh('One connected contour hillside / exact legacy triangles', coords, faces, ids, soil_normals)

# Actual supporting-face separation is measured inside every child triangle,
# not inferred only from vertex height. This also guards the shallow shoulders.
legacy_vertices = [Vector(p) for p in legacy_world.reshape((-1, 3))]
legacy_faces = []
stride = field['thetaSegments'] + 1
for j in range(field['zSegments']):
    for i in range(field['thetaSegments']):
        a = j * stride + i
        legacy_faces += [(a, a + stride, a + 1), (a + 1, a + stride, a + stride + 1)]
legacy_bvh = BVHTree.FromPolygons(legacy_vertices, legacy_faces, all_triangles=True)
minimum_face_support = math.inf
for tri in top_faces:
    vertices = [land_world[i] for i in tri]
    for weights in [(1/3, 1/3, 1/3), (.5, .5, 0), (0, .5, .5), (.5, 0, .5)]:
        p = sum((v * w for v, w in zip(vertices, weights)), Vector())
        a = math.atan2(p.x, 1000 - p.y)
        inward = Vector((-math.sin(a), math.cos(a), 0))
        origin = p + inward * 250
        hit, normal, face, distance = legacy_bvh.ray_cast(origin, -inward, 500)
        if hit is None:
            raise ValueError(('No legacy support', p))
        minimum_face_support = min(minimum_face_support, (p - hit).dot(inward))
if minimum_face_support < .08:
    raise ValueError(('Carrier intersects exact legacy face', minimum_face_support))
# Every consumer seats on the actual triangulated carrier, including its
# interpolated risers; function-height approximation would float some roots.
land_world = [Vector(point(*p)) for p in coords[:count]]
land_bvh = BVHTree.FromPolygons(land_world, top_faces, all_triangles=True)


def surface_point(u, z, lift=0):
    origin = Vector(point(u, z, 250))
    outward = Vector((math.sin(u / 1000), -math.cos(u / 1000), 0))
    hit, normal, index, distance = land_bvh.ray_cast(origin, outward, 400)
    if hit is None:
        raise ValueError(('Consumer outside actual carrier', u, z))
    up = -outward
    return hit + up * lift


def surface_coord(u, z, lift=0):
    p = surface_point(u, z, lift)
    return (u, z, 1000 - math.hypot(p.x, p.y - 1000))


def path(name, polyline, width=5.5):
    samples = []
    for A, B in zip(polyline, polyline[1:]):
        n = math.ceil(math.dist(A, B) / 7)
        for i in range(n):
            samples.append((A[0] + (B[0] - A[0]) * i / n, A[1] + (B[1] - A[1]) * i / n))
    samples.append(polyline[-1])
    verts, fs = [], []
    for i, (u, z) in enumerate(samples):
        a, b = samples[max(0, i - 1)], samples[min(len(samples) - 1, i + 1)]
        du, dz = b[0] - a[0], b[1] - a[1]
        length = math.hypot(du, dz)
        ox, oz = -dz / length * width / 2, du / length * width / 2
        verts += [surface_coord(u + ox, z + oz, .24), surface_coord(u - ox, z - oz, .24)]
        if i:
            a = (i - 1) * 2
            fs += [(a, a + 2, a + 1), (a + 1, a + 2, a + 3)]
    for i, f in enumerate(fs):
        A, B, C = [Vector(point(*verts[v])) for v in f]
        if (B - A).cross(C - A).dot(Vector((-A.x, 1000 - A.y, 0))) < 0:
            fs[i] = tuple(reversed(f))
    return mesh(name, verts, fs, [3] * len(fs))


# The long walk crossed carrier creases between seated edge vertices and is
# omitted as one whole connection. The retained arrival occupies a flat face.
arrival = path('Hilltop pavilion arrival / actual face verified',
               [(2510, 260), (2470, 260), (2415, 260)], 7)
path_clearances = []
for poly in arrival.data.polygons:
    vs = []
    for i in poly.vertices:
        p = arrival.data.vertices[i].co
        vs.append(Vector((p.x, p.z, -p.y)))
    for weights in [(1/3, 1/3, 1/3), (.5, .5, 0), (0, .5, .5), (.5, 0, .5)]:
        p = sum((v * w for v, w in zip(vs, weights)), Vector())
        a = math.atan2(p.x, 1000 - p.y)
        inward = Vector((-math.sin(a), math.cos(a), 0))
        hit, n, face, d = land_bvh.ray_cast(p + inward * 20, -inward, 100)
        if hit is None:
            raise ValueError(('Pavilion arrival has no carrier face', p))
        path_clearances.append((p - hit).dot(inward))
if min(path_clearances) < .20 or max(path_clearances) > .30:
    raise ValueError(('Pavilion arrival interior fails seating', min(path_clearances), max(path_clearances)))

# One modest existing pavilion occupies the actual flat hilltop. Four actual
# footprint-corner samples ensure its tangent base is embedded, never floating.
u, z, scale = 2415, 260, 1.0
p = surface_point(u, z)
up = Vector(basis(u)['basisUp'])
right = Vector(basis(u)['basisRight'])
foot = []
for x in (-22.5, 0, 22.5):
    for axial in (-12.5, 0, 12.5):
        tangential = p + right * x + Vector((0, 0, axial))
        a = math.atan2(tangential.x, 1000 - tangential.y) * 1000
        soil = surface_point(a, tangential.z)
        foot.append((soil - p).dot(up))
p += up * (min(foot) - .25)
civic = [{'category': 'pavilion', 'position': list(p), 'scale': [scale] * 3, **basis(u)}]

# A single intersecting crescent forest follows the hillside. Mature trees form
# an overlapping upper canopy; low Worldkit plants form the continuous grove.
anchors = []
grove_line = [(2110, -340), (2200, -210), (2310, -80), (2410, 80),
              (2460, 245), (2425, 405), (2350, 490)]
centres = []
for A, B in zip(grove_line, grove_line[1:]):
    n = math.ceil(math.dist(A, B) / 20)
    for i in range(n):
        centres.append((A[0] + (B[0] - A[0]) * i / n, A[1] + (B[1] - A[1]) * i / n))
for i, (u, z) in enumerate(centres):
    for side in (-1, 1):
        uu = u + side * (11 + 3 * math.sin(i * 1.9))
        zz = z + side * 5 + math.sin(i * 2.1) * 3
        p = surface_point(uu, zz, -.12)
        s = 1.8 + .2 * math.sin(i * 1.7 + side)
        anchors.append({'kind': 'shrub', 'position': list(p), 'scale': [s, s * 1.05, s], **basis(uu, i * .83)})
    if i % 2 == 0:
        uu, zz = u + 8 * math.sin(i * 1.3), z + 6
        p = surface_point(uu, zz, -.16)
        s = .36 + .04 * math.sin(i * 1.5)
        anchors.append({'kind': 'tree', 'position': list(p), 'scale': [s, s * 1.08, s], **basis(uu, i * .73)})

world = np.array(all_world)
min_route = math.inf
for start in range(0, len(world), 256):
    p = world[start:start + 256]
    min_route = min(min_route, float(np.sqrt(((p[:, None, :] - route[None, :, :]) ** 2).sum(axis=2)).min()))
if min_route < 104 or minimum_plan_area <= 0:
    raise ValueError(('Clearance or folded-cell guard', min_route, minimum_plan_area))
scene.world = bpy.data.worlds.new('Oriel garden authoring sky')
scene.world.color = (.3, .35, .35)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / 'garden-sector.blend'))
export_collection = bpy.data.collections.new('Runtime / visible carrier and pavilion arrival')
scene.collection.children.link(export_collection)
merged = []
for mi, mat in enumerate(materials):
    if mi == 2:
        # Buried foundation/perimeter remains in the editable closed body.
        # Its0.18m rim produced dotted shadow/face aliases at grazing angles;
        # runtime needs only the exact supported soil surface above legacy land.
        continue
    vertices, fs, uvs, exported_normals = [], [], [], []
    for obj in parts:
        for poly in obj.data.polygons:
            if poly.material_index != mi:
                continue
            start = len(vertices)
            for li in poly.loop_indices:
                vertices.append(tuple(obj.data.vertices[obj.data.loops[li].vertex_index].co))
                uvs.append(tuple(obj.data.uv_layers.active.data[li].uv))
                exported_normals.append(tuple(obj.data.corner_normals[li].vector))
            fs.append(tuple(range(start, len(vertices))))
    data = bpy.data.meshes.new('Garden sector runtime / ' + mat.name)
    data.from_pydata(vertices, [], fs)
    data.materials.append(mat)
    for poly in data.polygons:
        poly.use_smooth = True
    data.normals_split_custom_set(exported_normals)
    uv = data.uv_layers.new(name='Legacy shell coordinates')
    for li in range(len(uv.data)):
        uv.data[li].uv = uvs[li]
    data.update()
    obj = bpy.data.objects.new('gardenSector__' + mat.name.split(' / ')[-1].replace(' ', '_'), data)
    export_collection.objects.link(obj)
    merged.append(obj)
bpy.ops.object.select_all(action='DESELECT')
for obj in merged:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(EXPORT), export_format='GLB', use_selection=True,
    export_yup=True, export_animations=False, export_cameras=False, export_lights=False)
triangles = sum(len(p.vertices) - 2 for obj in merged for p in obj.data.polygons)
manifest = {
    'authoring': 'Original Blender-authored connected Oriel contour garden',
    'builder': 'build_garden_sector.py', 'coordinates': 'Baked production world coordinates, glTF Y-up',
    'geometryVersion': guides['geometryVersion'],
    'routeGuidesSHA256': hashlib.sha256(GUIDES.read_bytes()).hexdigest(),
    'terrainSHA256': hashlib.sha256(GROUND.read_bytes()).hexdigest(),
    'reservation': {'angleMin': 1.955, 'angleMax': 2.645, 'zMin': -470, 'zMax': 720, 'heightMin': -30, 'heightMax': 160},
    'bounds': {'min': world.min(axis=0).tolist(), 'max': world.max(axis=0).tolist()},
    'triangles': triangles, 'materialBatches': len(merged), 'editableComponents': len(parts),
    'foundation': {'sampler': 'Exact legacy height-field diagonal a,c,b / b,c,d',
        'samples': len(seating), 'minimumBurialMetres': 1.25,
        'minimumTopClearanceMetres': min(p['top'] - p['ground'] for p in seating),
        'maximumTopClearanceMetres': max(p['top'] - p['ground'] for p in seating),
        'minimumSignedPlanArea': minimum_plan_area,
        'minimumActualLegacyFaceSeparationMetres': minimum_face_support,
        'legacyFaceSupportSamples': len(top_faces) * 4,
        'tessellation': 'Two subdivisions per exact legacy a,c,b / b,c,d face; shared smooth/custom soil normals preserved in runtime merge',
        'minimumSampledRouteClearanceMetres': min_route,
        'routeSampleSpacingMetres': 6, 'conservativeContinuousRouteClearanceMetres': min_route - 3.1,
        'consumerSeating': 'Actual carrier-face radial BVH raycasts for every path edge, root and pavilion foot probe',
        'pavilionFootMinimumBurialMetres': .25,
        'pavilionFootMaximumBurialMetres': max(foot) - min(foot) + .25,
        'pavilionArrivalFaceSamples': len(path_clearances),
        'pavilionArrivalMinimumSeparationMetres': min(path_clearances),
        'pavilionArrivalMaximumSeparationMetres': max(path_clearances),
        'runtimeTopology': 'Only supported soil top and verified pavilion arrival; closed buried foundation remains editable but is omitted from runtime'},
    'plantingAnchors': anchors, 'civicPlacements': civic,
    'export': {'path': str(EXPORT.relative_to(APP)), 'bytes': EXPORT.stat().st_size, 'sha256': hashlib.sha256(EXPORT.read_bytes()).hexdigest()}}
(HERE / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({k: manifest[k] for k in ['bounds','triangles','materialBatches','foundation','export']}))
