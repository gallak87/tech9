"""Build the editable, collision-envelope-preserving Saffron vane assembly.

Run: blender --background --threads 4 --python assets/levels/saffron/build_baffles.py
The exported JSON uses game coordinates: +X lateral, +Y up, long +Z.
No runtime GLB or image texture is required. All components are closed solids.
"""

from pathlib import Path
import hashlib
import json
import subprocess

import bpy
from mathutils import Vector


SOURCE = Path(__file__).resolve().parent
SCRIPT = Path(__file__).resolve()
OUTPUT = SOURCE / "baffles-meshes.json"
BLEND = SOURCE / "baffles.blend"
MANIFEST = SOURCE / "baffles-manifest.json"
ENVELOPE = {"min": [-0.45, -0.26, -6.38], "max": [0.45, 0.91, 6.38]}
APP = SOURCE.parents[2]


def original_solid_planes():
    """Read the exact existing Three.js convex vane, including its bevels."""
    program = """
      import * as T from 'three';
      import { createBaffleGeometry } from './src/levels/saffron/track/solids.js';
      const geometry = createBaffleGeometry();
      geometry.computeBoundingBox();
      const center = geometry.boundingBox.getCenter(new T.Vector3());
      const positions = geometry.attributes.position;
      const planes = new Map();
      for (let i = 0; i < positions.count; i += 3) {
        const triangle = [0,1,2].map(n => new T.Vector3().fromBufferAttribute(positions, i+n));
        const plane = new T.Plane().setFromCoplanarPoints(...triangle);
        if (plane.distanceToPoint(center) > 0) plane.negate();
        const value = [...plane.normal.toArray(), plane.constant];
        planes.set(value.map(v => v.toFixed(6)).join(','), value);
      }
      console.log(JSON.stringify([...planes.values()]));
    """
    return json.loads(subprocess.check_output(
        ["node", "--input-type=module", "-e", program], cwd=APP, text=True))


SOLID_PLANES = original_solid_planes()
SOLID_MARGIN = 0.0005


def clamp_to_original_solid(point):
    """Project only the tiny tip/pin excess inward; retain the authored form."""
    result = Vector(point)
    for unused in range(32):
        corrected = False
        for x, y, z, constant in SOLID_PLANES:
            normal = Vector((x, y, z))
            excess = normal.dot(result) + constant + SOLID_MARGIN
            if excess > 0:
                result -= normal * excess
                corrected = True
        if not corrected:
            break
    assert max(Vector(plane[:3]).dot(result) + plane[3] for plane in SOLID_PLANES) <= 0.000002
    return result


def game_to_blender(p):
    return (p[0], -p[2], p[1])


def blender_to_game(p):
    return (p[0], p[2], -p[1])


scene = bpy.context.scene
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene.unit_settings.system = "METRIC"
scene.unit_settings.length_unit = "METERS"
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"


def material(name, color, roughness, metallic):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return result


materials = {
    "ceramic": material("Saffron fired ceramic hood", (0.72, 0.65, 0.48), 0.32, 0.08),
    "graphite": material("Saffron graphite folded carrier", (0.036, 0.031, 0.025), 0.42, 0.58),
    "bronze": material("Saffron machined bronze fittings", (0.34, 0.19, 0.065), 0.28, 0.82),
}
objects = {key: [] for key in materials}


def mesh(name, points, faces, family):
    data = bpy.data.meshes.new(name)
    data.from_pydata([game_to_blender(p) for p in points], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.data.materials.append(materials[family])
    objects[family].append(obj)
    # Preserve crisp planes and bevels; no averaged normals across corners.
    for poly in data.polygons:
        poly.use_smooth = False
    return obj


def loft(name, stations, family):
    """Closed aligned rings; ring order is clockwise in local X/Y."""
    size = len(stations[0][1])
    points = [(x, y, z) for z, ring in stations for x, y in ring]
    faces = [tuple(range(size - 1, -1, -1))]
    for j in range(len(stations) - 1):
        for i in range(size):
            faces.append((j * size + i, j * size + (i + 1) % size,
                          (j + 1) * size + (i + 1) % size, (j + 1) * size + i))
    faces.append(tuple((len(stations) - 1) * size + i for i in range(size)))
    obj = mesh(name, points, faces, family)
    # Orient all components consistently from real closed surfaces.
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return obj


def top(z):
    if z < -4.9:
        return 0.12 + (z + 6.3) / 1.4 * 0.53
    if z > 4.6:
        return 0.85 - (z - 4.6) / 1.7 * 0.85
    return 0.65 + (z + 4.9) / 9.5 * 0.20


def bottom(z):
    if z < -4.7:
        return 0.12 + (z + 6.3) / 1.6 * -0.27
    if z > 4.8:
        return -0.2 + (z - 4.8) / 1.5 * 0.20
    return -0.15 - (z + 4.7) / 9.5 * 0.05


# A shallow arched fired hood, with a heavy rolled lip and an inset seating face.
# The asymmetric rake follows the original aero-vane profile exactly.
hood_stations = []
for z, width in [(-6.20, 0.12), (-4.88, 0.418), (4.58, 0.418), (6.18, 0.11)]:
    crown = top(z) - 0.025
    depth = min(0.29, (top(z) - bottom(z)) * 0.62)
    ring = [(-width * 0.77, crown - 0.022),
            (width * 0.77, crown - 0.022),
            (width, crown - 0.075),
            (width, crown - depth + 0.035),
            (width * 0.86, crown - depth),
            (-width * 0.86, crown - depth),
            (-width, crown - depth + 0.035),
            (-width, crown - 0.075)]
    hood_stations.append((z, ring))
loft("01 ceramic formed aero hood", hood_stations, "ceramic")

# Recessed, box-folded carbon/graphite carrier: broad shadow line beneath the
# ceramic, a lower closed keel and real end returns instead of a flat wafer.
carrier_stations = []
for z, width in [(-6.10, 0.07), (-4.67, 0.338), (4.75, 0.338), (6.08, 0.065)]:
    upper = top(z) - min(0.21, (top(z) - bottom(z)) * 0.46)
    lower = bottom(z) + 0.018
    mid = (upper + lower) / 2
    # The former upper bevel lay wholly inside the closed ceramic hood.
    # Its lower seating roof stays hidden while the visible side and keel
    # vertices retain their original coordinates and manufactured silhouette.
    shoulder = upper - min(0.045, (upper - lower) * 0.25)
    ring = [(-width, shoulder), (width, shoulder),
            (width, mid - 0.025), (width * 0.68, lower),
            (-width * 0.68, lower), (-width, mid - 0.025)]
    carrier_stations.append((z, ring))
loft("02 recessed graphite folded carrier", carrier_stations, "graphite")


# Two collars bind the cap to the carrier. Their bridge passes just below the
# cap while side ears remain inside the old extrusion's width. The large
# planes and seating hierarchy read in the normal racing camera.
for index, z in enumerate((-3.65, 3.65)):
    high = top(z) - 0.055
    low = bottom(z) + 0.045
    # A single formed U-shaped metal part joins both side ears and the bottom
    # bridge. Real folded transitions avoid floating straps or wasted overlaps.
    ring = [(-0.437, high), (-0.382, high),
            (-0.382, low + 0.09), (0.382, low + 0.09),
            (0.382, high), (0.437, high),
            (0.437, low + 0.022), (0.415, low),
            (-0.415, low), (-0.437, low + 0.022)]
    loft(f"03 bronze formed seating collar {index + 1}",
         [(z - 0.125, ring), (z + 0.125, ring)], "bronze")

    # Tiny flush pins are omitted: the physical-solid clamp seated them almost
    # coplanar with these collar faces, below useful racing-view screen size.


# Export one compact triangle mesh per material, using split loop normals to
# retain all intentional face/bevel boundaries when instanced by Three.js.
groups = {}
for family, family_objects in objects.items():
    positions, normals, indices = [], [], []
    bounds_min = [float("inf")] * 3
    bounds_max = [float("-inf")] * 3
    for obj in family_objects:
        data = obj.data
        for vertex in data.vertices:
            vertex.co = game_to_blender(clamp_to_original_solid(blender_to_game(vertex.co)))
        data.update()
        data.calc_loop_triangles()
        for tri in data.loop_triangles:
            normal = blender_to_game(tri.normal)
            for vertex_index in tri.vertices:
                vertex = blender_to_game(data.vertices[vertex_index].co)
                for axis, value in enumerate(vertex):
                    bounds_min[axis] = min(bounds_min[axis], value)
                    bounds_max[axis] = max(bounds_max[axis], value)
                    assert ENVELOPE["min"][axis] - 1e-6 <= value <= ENVELOPE["max"][axis] + 1e-6, (obj.name, vertex)
                indices.append(len(indices))
                positions.extend(round(v, 6) for v in vertex)
                normals.extend(round(v, 6) for v in normal)
    groups[family] = {"positions": positions, "normals": normals, "indices": indices}

triangle_count = sum(len(group["indices"]) // 3 for group in groups.values())
assert triangle_count < 800, triangle_count
OUTPUT.write_text(json.dumps({"format": 1, "gameAxes": "+X lateral, +Y up, long +Z", "groups": groups}, separators=(",", ":")) + "\n")

# Editable source retains separate fitted components, named material families,
# a simple studio world and a camera; no baked preview image is exported.
scene.world = scene.world or bpy.data.worlds.new("Baffle neutral studio")
scene.world.color = (0.2, 0.2, 0.2)
bpy.ops.object.camera_add(location=(8.0, 10.0, 5.5))
camera = bpy.context.object
camera.name = "Baffle assembly inspection camera"
camera.rotation_euler = (Vector((0, 0, 0.3)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 15
scene.camera = camera
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


manifest = {
    "format": 1,
    "asset": "Saffron formed ceramic baffle vane",
    "creator": "VECTOR//NOVA project contributors",
    "rights": "Original project-authored geometry and materials; no external images or meshes",
    "generator": "assets/levels/saffron/build_baffles.py",
    "source": "assets/levels/saffron/baffles.blend",
    "runtimeGeometry": "assets/levels/saffron/baffles-meshes.json",
    "gameAxes": "+X lateral, +Y up, long +Z",
    "collisionEnvelope": ENVELOPE,
    "physicalSolidSource": "src/levels/saffron/track/solids.js",
    "physicalSolidMarginMetres": SOLID_MARGIN,
    "placement": "Replaces each existing SAFFRON_SOLIDS.vane visual at the original bafflePlacements transforms; physical solids and clamps are unchanged",
    "construction": "Closed beveled ceramic hood over a recessed graphite folded carrier with two machined bronze seating collars. Hidden carrier bevels and subpixel flush pins are omitted; all visible cap, carrier-side, keel and seat silhouettes remain. All geometry stays inside the existing physical vane solid.",
    "triangleCount": triangle_count,
    "materialTriangles": {key: len(group["indices"]) // 3 for key, group in groups.items()},
    "blenderVersion": bpy.app.version_string,
    "sha256": {SCRIPT.name: sha(SCRIPT), BLEND.name: sha(BLEND), OUTPUT.name: sha(OUTPUT)},
}
MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps({"triangles": triangle_count, "groups": manifest["materialTriangles"], "output": str(OUTPUT)}))
