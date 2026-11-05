"""Author Oriel's connected inner-shell garden terraces in Blender.

The retained height field is the sole surface source for both the exported GLB
and CPU scenery seating. Run from the game directory:
  blender --background --factory-startup --python assets/levels/oriel/blender/ground/build_ground.py
"""

import bpy
import hashlib
import json
import math
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
APP = HERE.parents[4]
EXPORT = APP / "public/assets/levels/oriel/oriel-ground.glb"
GUIDES = HERE / "route-guides.json"
VERSION = "oriel-terraced-inner-shell-v1"
TAU = math.tau
RADIUS = 1000.0
CENTER_Y = 1000.0
THETA_SEGMENTS = 288
Z_SEGMENTS = 192
SECTORS = 12
Z_MIN, Z_MAX = -2400.0, 2400.0

guides = json.loads(GUIDES.read_text())
guide_hash = hashlib.sha256(GUIDES.read_bytes()).hexdigest()
theta_values = np.linspace(0.0, TAU, THETA_SEGMENTS + 1)
z_values = np.linspace(Z_MIN, Z_MAX, Z_SEGMENTS + 1)
ANGLE, AXIAL = np.meshgrid(theta_values, z_values)
U = ANGLE * RADIUS


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def wrapped_radians(angle):
    return np.arctan2(np.sin(angle), np.cos(angle))


LAKES = [[0.03, -650, 0.34, 1080], [math.pi - 0.16, 500, 0.29, 900],
         [-1.6, 1330, 0.24, 650], [1.8, -1600, 0.21, 540]]


def lake_at(angle, z):
    value = np.full(np.broadcast_shapes(np.shape(angle), np.shape(z)), 10.0)
    for a, axial, width, length in LAKES:
        da = wrapped_radians(angle - a) / width
        dz = (z - axial) / length
        shore = 1 + 0.055 * np.sin(dz * 15 + da * 6) + 0.04 * np.sin(dz * 27 - da * 9)
        value = np.minimum(value, np.hypot(da, dz) / shore)
    return value


# The original small relief remains between large authored park districts.
base = 2 + 7 * (0.5 + 0.5 * np.sin(ANGLE * 7 + AXIAL * 0.0013))
base += 5 * (0.5 + 0.5 * np.sin(ANGLE * 13 - AXIAL * 0.0021))
terraces = np.full_like(base, 2.0)

# Metres on the unwrapped shell. Each district has unequal attached shoulders,
# broad flat garden shelves, and connected recessed transitions. These authored
# masses are intentionally not concentric rings or a procedural noise field.
# (u, z, width, depth, rotation, top height above the original 2m minimum)
PLATEAUS = [
    (980, -1470, 640, 500, -0.26, 54),
    (1270, -1160, 430, 390, 0.18, 39),
    (1640, 660, 680, 470, 0.62, 57),
    (1480, 940, 440, 420, 0.24, 43),
    (2350, 300, 750, 550, 0.42, 63),
    (2550, -40, 480, 490, -0.18, 46),
    (3150, -740, 820, 620, -0.48, 60),
    (3590, -1070, 520, 460, 0.16, 46),
    (3670, 1450, 620, 590, 0.20, 54),
    (4290, -830, 750, 530, 0.66, 61),
    (4560, -190, 550, 650, 0.24, 51),
    (4950, -1380, 690, 610, -0.42, 63),
    (5870, -2020, 610, 510, 0.20, 58),
    (5110, 1330, 720, 670, -0.61, 56),
    (5660, 510, 620, 510, 0.47, 47),
    (150, 1910, 670, 620, -0.34, 57),
    (-100, 1630, 430, 420, 0.17, 40),
]


def rounded_rectangle_distance(center_u, center_z, width, depth, rotation):
    du = wrapped_radians(ANGLE - center_u / RADIUS) * RADIUS
    dz = AXIAL - center_z
    cs, sn = math.cos(rotation), math.sin(rotation)
    x, y = du * cs + dz * sn, -du * sn + dz * cs
    rounding = min(width, depth) * 0.13
    qx = np.abs(x) - (width / 2 - rounding)
    qy = np.abs(y) - (depth / 2 - rounding)
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - rounding


for cu, cz, width, depth, rotation, high in PLATEAUS:
    d = rounded_rectangle_distance(cu, cz, width, depth, rotation)
    terrace = 2 + high * 0.24 * (1 - smoothstep(-5, 40, d))
    terrace += high * 0.34 * (1 - smoothstep(-65, -35, d))
    terrace += high * 0.42 * (1 - smoothstep(-120, -90, d))
    terraces = np.maximum(terraces, terrace)

lake = lake_at(ANGLE, AXIAL)
original_shore = 1 + (base - 1) * smoothstep(0.97, 1.12, lake)
heights = np.maximum(base, terraces)
# Preserve the original reservoir and quay profile completely through mask1.12.
heights = original_shore + (heights - base) * smoothstep(1.12, 1.35, lake)

# All779 authored route frames protect a broad road/camera corridor. The most
# outward road shoulder and 8m camera-height samples determine a conservative
# radial ceiling. A95m core covers the road width, camera setback, guide spacing
# and the grid diagonal; an outer230m shoulder makes the carved banks coherent.
clearance_ceiling = np.full_like(heights, 1000.0)
route_records = []
for guide in guides["points"]:
    p, right, up = guide["position"], guide["right"], guide["up"]
    maximum_radius = 0.0
    for side in (-30.0, 0.0, 30.0):
        for lift in (0.0, 8.0):
            px = p[0] + right[0] * side + up[0] * lift
            py = p[1] + right[1] * side + up[1] * lift
            maximum_radius = max(maximum_radius, math.hypot(px, py - CENTER_Y))
    angle = math.atan2(p[0], CENTER_Y - p[1])
    distance = np.hypot(wrapped_radians(ANGLE - angle) * RADIUS, AXIAL - p[2])
    allowed = RADIUS - maximum_radius - 35.3
    ceiling = allowed + 100 * smoothstep(95, 230, distance)
    clearance_ceiling = np.minimum(clearance_ceiling, ceiling)
    route_records.append((guide, allowed))
heights = np.minimum(heights, clearance_ceiling)
heights = np.round(heights, 4)
heights[:, -1] = heights[:, 0]

# The exact same quantized height samples feed retained CPU data and Blender.
radius = RADIUS - heights
world = np.stack((np.sin(ANGLE) * radius, CENTER_Y - np.cos(ANGLE) * radius, AXIAL), axis=-1)

# Compute normals on the complete periodic surface before splitting sectors so
# both sides of every sector seam retain identical smooth illumination.
tangent_theta = np.empty_like(world)
tangent_theta[:, 1:-1] = world[:, 2:] - world[:, :-2]
tangent_theta[:, 0] = world[:, 1] - world[:, -2]
tangent_theta[:, -1] = tangent_theta[:, 0]
tangent_z = np.empty_like(world)
tangent_z[1:-1] = world[2:] - world[:-2]
tangent_z[0] = world[1] - world[0]
tangent_z[-1] = world[-1] - world[-2]
normals = np.cross(tangent_z, tangent_theta)
normals /= np.linalg.norm(normals, axis=-1, keepdims=True)


def sample_height(angle, axial):
    """Triangle-linear validation sampler; exported coordinates are documented."""
    u = (angle % TAU) / TAU * THETA_SEGMENTS
    v = max(0.0, min(float(Z_SEGMENTS) - 1e-8, (axial - Z_MIN) / (Z_MAX - Z_MIN) * Z_SEGMENTS))
    ix, iz = int(u), int(v)
    fx, fz = u - ix, v - iz
    a, b = heights[iz, ix], heights[iz, ix + 1]
    c, d = heights[iz + 1, ix], heights[iz + 1, ix + 1]
    if fx + fz <= 1:
        return float(a + fx * (b - a) + fz * (c - a))
    return float(d + (1 - fx) * (c - d) + (1 - fz) * (b - d))


minimum_clearance = 1000.0
for guide, _ in route_records:
    p, right, up = guide["position"], guide["right"], guide["up"]
    for side in (-30.0, 0.0, 30.0):
        for lift in (0.0, 8.0):
            q = [p[i] + right[i] * side + up[i] * lift for i in range(3)]
            angle = math.atan2(q[0], CENTER_Y - q[1])
            road_radius = math.hypot(q[0], q[1] - CENTER_Y)
            # Maximum chord error is below0.06m at this angular resolution.
            clearance = RADIUS - sample_height(angle, q[2]) - road_radius - 0.07
            minimum_clearance = min(minimum_clearance, clearance)
assert minimum_clearance >= 35.0, minimum_clearance
assert np.all(heights[lake <= 0.97] == 1.0)
assert float(np.max(heights)) <= 65.0

height_data = {
    "version": VERSION,
    "guideVersion": guides["geometryVersion"],
    "guideSHA256": guide_hash,
    "radius": RADIUS,
    "center": [0, CENTER_Y, 0],
    "thetaSegments": THETA_SEGMENTS,
    "thetaColumns": THETA_SEGMENTS + 1,
    "zSegments": Z_SEGMENTS,
    "zRows": Z_SEGMENTS + 1,
    "zMin": Z_MIN,
    "zMax": Z_MAX,
    "thetaCoordinates": theta_values.tolist(),
    "zCoordinates": z_values.tolist(),
    "heightMeaning": "inward radial metres: [sin(theta)*(radius-h), centerY-cos(theta)*(radius-h), z]",
    "triangleLayout": "row-major a=zRow*thetaColumns+thetaColumn; [a,a+thetaColumns,a+1], [a+1,a+thetaColumns,a+thetaColumns+1]",
    "heights": heights.tolist(),
}
(HERE / "height-field.json").write_text(json.dumps(height_data, separators=(",", ":")) + "\n")

scene = bpy.data.scenes.new("Oriel / connected terraced inner shell")
bpy.context.window.scene = scene
scene.unit_settings.system = "METRIC"
scene["groundVersion"] = VERSION
scene["routeGuideVersion"] = guides["geometryVersion"]
scene["routeGuideSHA256"] = guide_hash
collection = bpy.data.collections.new("Oriel / garden terrace sectors")
scene.collection.children.link(collection)
surface = bpy.data.materials.new("Oriel / ground carrier (consumer replaces finish)")
surface.diffuse_color = (0.65, 0.70, 0.55, 1)

columns_per_sector = THETA_SEGMENTS // SECTORS
for sector in range(SECTORS):
    lo = sector * columns_per_sector
    hi = lo + columns_per_sector + 1
    source = world[:, lo:hi].reshape((-1, 3))
    vertices = [(float(x), float(-z), float(y)) for x, y, z in source]
    faces = []
    stride = columns_per_sector + 1
    for iz in range(Z_SEGMENTS):
        for ix in range(columns_per_sector):
            a = iz * stride + ix
            faces += [(a, a + stride, a + 1), (a + 1, a + stride, a + stride + 1)]
    mesh = bpy.data.meshes.new(f"Oriel ground sector{sector:02d}")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for poly in mesh.polygons:
        poly.use_smooth = True
    normal_source = normals[:, lo:hi].reshape((-1, 3))
    mesh.normals_split_custom_set_from_vertices([(float(x), float(-z), float(y)) for x, y, z in normal_source])
    uv = mesh.uv_layers.new(name="Oriel shell coordinates")
    for poly in mesh.polygons:
        for loop_index in poly.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            iz, ix = divmod(vertex_index, stride)
            # Blender's glTF exporter reversesV into the glTF texture convention.
            uv.data[loop_index].uv = ((lo + ix) / THETA_SEGMENTS, 1 - iz / Z_SEGMENTS)
    obj = bpy.data.objects.new(f"Oriel_ground_sector_{sector:02d}", mesh)
    collection.objects.link(obj)
    mesh.materials.append(surface)

EXPORT.parent.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "oriel-ground.blend"), compress=True)
bpy.ops.object.select_all(action="DESELECT")
for obj in collection.all_objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(EXPORT), export_format="GLB", use_selection=True, use_active_scene=True,
                          export_yup=True, export_animations=False,
                          export_cameras=False, export_lights=False, export_extras=True)
provenance = {
    "version": VERSION,
    "authoring": "Original Blender inner-shell landscape authored by build_ground.py; no external textures or scanned assets",
    "guideVersion": guides["geometryVersion"],
    "guideSHA256": guide_hash,
    "grid": [THETA_SEGMENTS, Z_SEGMENTS],
    "sectors": SECTORS,
    "triangles": THETA_SEGMENTS * Z_SEGMENTS * 2,
    "heightRange": [float(np.min(heights)), float(np.max(heights))],
    "minimumConservativeRouteClearance": round(minimum_clearance, 4),
    "routeEnvelope": {"guideCount": len(guides["points"]), "halfWidth": 30, "cameraLift": 8, "coreRadius": 95, "bankFadeRadius": 230},
    "plateauRecipes": PLATEAUS,
    "hashes": {},
}
for path in [Path(__file__), HERE / "height-field.json", HERE / "oriel-ground.blend", EXPORT]:
    provenance["hashes"][path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
(HERE / "ground-provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
print(json.dumps({"triangles": provenance["triangles"], "heightRange": provenance["heightRange"],
                  "minimumClearance": minimum_clearance, "glbBytes": EXPORT.stat().st_size,
                  "guideSHA256": guide_hash}))
