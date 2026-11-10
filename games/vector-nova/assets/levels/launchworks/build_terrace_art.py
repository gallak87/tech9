"""Original fitted garden promenade for one canonical Zephyr grand island.

Blender --background --python assets/levels/launchworks/build_terrace_art.py -- <app root>
Game-local metres: X/Z match island-grand; Y=0 is its cultivated mineral top.
The canonical GLB is imported read-only to measure the actual mineral surface.
Only original four-role promenade meshes are exported; no canonical mesh changes.
"""

import bpy
import bmesh
import hashlib
import json
import math
import sys
from collections import defaultdict
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
SOURCE = ROOT / "assets/levels/launchworks"
PUBLIC = ROOT / "public/assets/levels/launchworks"
NAME = "garden-terrace-grand"
RX, RZ = 143., 120.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.name != "Collection":
        bpy.data.collections.remove(collection)

# The reference is the actual exported mineral surface, including its erosion
# and bevels. Retain it in the editable blend but never export it in this kit.
bpy.ops.import_scene.gltf(filepath=str(PUBLIC.parent / "zephyr/island-grand.glb"))
reference = bpy.data.collections.new("REFERENCE / canonical island-grand (unmodified)")
bpy.context.scene.collection.children.link(reference)
reference_objects = list(bpy.context.selected_objects)
rock_objects = []
for obj in reference_objects:
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    reference.objects.link(obj)
    if obj.type == "MESH" and "__rock" in obj.name:
        rock_objects.append(obj)
if not rock_objects:
    raise RuntimeError("Expected canonical island-grand mineral meshes")
points, faces = [], []
for obj in rock_objects:
    offset = len(points)
    for vertex in obj.data.vertices:
        p = obj.matrix_world @ vertex.co
        points.append((p.x, p.z, -p.y))
    faces.extend(tuple(offset + n for n in poly.vertices) for poly in obj.data.polygons)
rock = BVHTree.FromPolygons(points, faces, all_triangles=False)


def top_at(theta, radius):
    x, z = math.cos(theta) * RX * radius, math.sin(theta) * RZ * radius
    hit, normal, _, _ = rock.ray_cast(Vector((x, 25, z)), Vector((0, -1, 0)), 35)
    return hit is not None and abs(hit.y) < .8 and normal.y > .8


def boundary(theta):
    low, high = .4, 1.05
    for _ in range(17):
        radius = (low + high) / 2
        if top_at(theta, radius):
            low = radius
        else:
            high = radius
    return low


def rim_radius(theta):
    # A quiet built edge responds to real erosion but never reaches the ragged
    # top boundary. Broad gentle offsets avoid tracing individual rock chips.
    design = .625 + .009 * math.sin(theta * 2 + .4) + .004 * math.sin(theta * 5)
    return min(design, boundary(theta) - .020)


def at(theta, radius, y):
    return Vector((math.cos(theta) * RX * radius, y, math.sin(theta) * RZ * radius))


def material(name, color, roughness=.78, metallic=0):
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    value.diffuse_color = (*color, 1)
    node = value.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (*color, 1)
    node.inputs["Metallic"].default_value = metallic
    node.inputs["Roughness"].default_value = roughness
    return value


MATERIALS = {
    "limestone": material("Skywell / cultivated promenade limestone", (.48, .445, .37)),
    "pale-coping": material("Skywell / carved pale coping stone", (.65, .6, .49), .74),
    "bronze": material("Skywell / formed bronze mineral anchorage", (.30, .19, .085), .48, .72),
    "recess": material("Skywell / sheltered dark stone insets", (.12, .135, .13), .91),
}


class Assembly:
    def __init__(self):
        self.parts = defaultdict(lambda: [[], []])
        self.collection = bpy.data.collections.new(NAME)
        bpy.context.scene.collection.children.link(self.collection)
        self.objects = []

    def mesh(self, points, faces, role):
        vertices, indices = self.parts[role]
        offset = len(vertices)
        vertices.extend(tuple(point) for point in points)
        indices.extend(tuple(offset + n for n in face) for face in faces)

    def prism(self, profile, depth, role, origin=None, tangent=None, radial=None):
        origin = Vector((0, 0, 0)) if origin is None else Vector(origin)
        tangent = Vector((1, 0, 0)) if tangent is None else Vector(tangent)
        radial = Vector((0, 0, 1)) if radial is None else Vector(radial)
        n = len(profile)
        points = [origin + tangent*x + Vector((0, y, 0)) + radial*z
                  for z in [-depth/2, depth/2] for x, y in profile]
        faces = [tuple(reversed(range(n))), tuple(range(n, 2*n))]
        faces.extend((i, (i+1) % n, (i+1) % n+n, i+n) for i in range(n))
        self.mesh(points, faces, role)

    def box(self, center, size, role, tangent=None, radial=None, chamfer=.12):
        x, y, z = size
        c = min(chamfer, x/5, y/5)
        self.prism([(-x/2+c, -y/2), (x/2-c, -y/2), (x/2, -y/2+c),
                    (x/2, y/2-c), (x/2-c, y/2), (-x/2+c, y/2),
                    (-x/2, y/2-c), (-x/2, -y/2+c)], z, role, center, tangent, radial)

    def band(self, angles, inner, outer, low, high, role):
        rings = []
        for theta in angles:
            r = rim_radius(theta)
            rings.append([at(theta, r+dr, y) for dr, y in
                          [(inner, low), (outer, low), (outer, high), (inner, high)]])
        points = [p for ring in rings for p in ring]
        faces = [(3, 2, 1, 0), tuple(range((len(rings)-1)*4, len(rings)*4))]
        for i in range(len(rings)-1):
            for j in range(4):
                faces.append((i*4+j, i*4+(j+1) % 4, (i+1)*4+(j+1) % 4, (i+1)*4+j))
        self.mesh(points, faces, role)

    def strap(self, points, theta, width=3.2, thickness=.65):
        tangent = Vector((-math.sin(theta), 0, math.cos(theta)))
        radial = Vector((math.cos(theta), 0, math.sin(theta)))
        vertices = []
        for point in points:
            vertices.extend(point + tangent*w + radial*d for w, d in
                            [(-width/2, -thickness/2), (width/2, -thickness/2),
                             (width/2, thickness/2), (-width/2, thickness/2)])
        faces = [(3, 2, 1, 0), tuple(range((len(points)-1)*4, len(points)*4))]
        for i in range(len(points)-1):
            for j in range(4):
                faces.append((i*4+j, i*4+(j+1) % 4, (i+1)*4+(j+1) % 4, (i+1)*4+j))
        self.mesh(vertices, faces, "bronze")

    def finish(self):
        for role, (points, faces) in self.parts.items():
            mesh = bpy.data.meshes.new(f"{NAME} / {role}")
            mesh.from_pydata([(x, -z, y) for x, y, z in points], [], faces)
            mesh.materials.append(MATERIALS[role])
            mesh.update()
            obj = bpy.data.objects.new(mesh.name, mesh)
            self.collection.objects.link(obj)
            bm = bmesh.new()
            bm.from_mesh(mesh)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            bmesh.ops.triangulate(bm, faces=list(bm.faces))
            bm.to_mesh(mesh)
            bm.free()
            colors = mesh.color_attributes.new(name="SkywellFinish", type="BYTE_COLOR", domain="CORNER")
            for poly in mesh.polygons:
                for loop in poly.loop_indices:
                    p = mesh.vertices[mesh.loops[loop].vertex_index].co
                    grain = .94 + .04 * math.sin(p.x*.19+p.y*.31+p.z*.6)
                    if role == "limestone":
                        grain *= .96 + .035 * math.sin(math.atan2(-p.y, p.x)*23)
                    colors.data[loop].color = (grain, grain, grain, 1)
            obj["skywellRole"] = role
            obj["source"] = "Original connected garden promenade; canonical island reference unmodified"
            self.objects.append(obj)
        return self

    def export(self):
        bpy.ops.object.select_all(action="DESELECT")
        for obj in self.objects:
            obj.select_set(True)
        path = PUBLIC / f"{NAME}.glb"
        bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                                  export_yup=True, export_materials="EXPORT", export_cameras=False,
                                  export_lights=False, export_animations=False, export_vertex_color="ACTIVE")
        points = [(v.co.x, v.co.z, -v.co.y) for obj in self.objects for v in obj.data.vertices]
        return {"file": path.name, "boundsMetres": {
            "min": [min(p[i] for p in points) for i in range(3)],
            "max": [max(p[i] for p in points) for i in range(3)]},
            "triangles": sum(len(obj.data.polygons) for obj in self.objects),
            "materialDraws": len(self.objects), "bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


kit = Assembly()
# The wide southwest mouth clears Counterbank's existing canal at X+38/Z-105.
# The other three breaks are real promenade entrances, never closed hoops.
arcs = [(-164., -94.), (-54., -25.), (0., 115.), (140., 173.)]
bay_count = 0
for low, high in arcs:
    start, end = math.radians(low), math.radians(high)
    count = max(3, round((end-start)*90/14))
    angles = [start+(end-start)*i/(count*3) for i in range(count*3+1)]
    # A deep connected plinth sits in the mineral bed, with a stepped outward
    # fascia and a quiet interior walking ribbon. No isolated rim-pad boxes.
    kit.band(angles, -.086, -.004, -.65, .65, "limestone")
    kit.band(angles, -.009, .002, -.15, 1.15, "pale-coping")
    kit.band(angles, -.084, -.070, .65, .87, "pale-coping")
    kit.band(angles, -.020, .001, 6.15, 6.60, "pale-coping")
    kit.band(angles, -.023, .003, 6.59, 6.91, "pale-coping")
    kit.band(angles, -.010, -.004, 1.10, 1.45, "recess")
    for i in range(count):
        a, b = start+(end-start)*i/count, start+(end-start)*(i+1)/count
        theta = (a+b)/2
        left, right = at(a, rim_radius(a)-.011, 0), at(b, rim_radius(b)-.011, 0)
        center = (left+right)/2
        tangent = (right-left).normalized()
        radial = Vector((tangent.z, 0, -tangent.x))
        if radial.dot(center) < 0:
            radial = -radial
        width = (right-left).length
        half = width/2-.9
        spring, rise = 2.65, 2.90
        inner = []
        outer = []
        # Two circular Gothic halves have a true pointed apex and an open
        # aperture. The carved voussoirs own depth on both sides of the wall.
        for j in range(9):
            x = -half+2*half*j/8
            y = spring+rise*math.sqrt(max(0, 1-((abs(x)+half)/(2*half))**2))/(math.sqrt(3)/2)
            inner.append((x, y))
            outer.append((x*1.08, y+.55))
        for j in range(8):
            kit.prism([inner[j], inner[j+1], outer[j+1], outer[j]], 1.8,
                      "pale-coping", center, tangent, radial)
            # Quiet carved spandrel above each opening, with actual cut-through.
            kit.prism([outer[j], outer[j+1], (outer[j+1][0], 6.18), (outer[j][0], 6.18)],
                      1.4, "limestone", center, tangent, radial)
        for x in [-width/2+.45, width/2-.45]:
            kit.box(center+tangent*x+Vector((0, 3.63, 0)), (.9, 5.2, 1.9),
                    "limestone", tangent, radial, .13)
            kit.box(center+tangent*x+Vector((0, 1.55, 0)), (1.5, .62, 2.3),
                    "pale-coping", tangent, radial, .10)
        # One transverse paving joint per bay and two broad fitted inset courts.
        inner_mid = at(theta, rim_radius(theta)-.047, .67)
        kit.box(inner_mid, (.12, .06, 8.3), "recess", tangent, radial, .01)
        bay_count += 1
    for theta in [start, end]:
        point = at(theta, rim_radius(theta)-.011, 0)
        tangent = Vector((-math.sin(theta), 0, math.cos(theta)))
        radial = Vector((math.cos(theta), 0, math.sin(theta)))
        # Gate cheeks terminate a real connected wall; open entries remain wide.
        kit.box(point+Vector((0, 3.9, 0)), (2.1, 6.8, 2.5), "limestone", tangent, radial)
        kit.box(point+Vector((0, 7.1, 0)), (2.8, .65, 3.1), "pale-coping", tangent, radial)
        kit.prism([(-1.15, 7.4), (1.15, 7.4), (.55, 9.6), (0, 10.6), (-.55, 9.6)],
                  1.8, "pale-coping", point, tangent, radial)

# Fitted straps follow the measured mineral profile in depth. Top collars sit
# on the promenade; lower shoes stop on rock instead of dangling giant cubes.
anchors = [-143, -105, -40, 24, 80, 151]
for degrees in anchors:
    theta = math.radians(degrees)
    radial = Vector((math.cos(theta), 0, math.sin(theta)))
    tangent = Vector((-math.sin(theta), 0, math.cos(theta)))
    top = at(theta, rim_radius(theta)-.032, 1.1)
    path = [top]
    for y in [-1., -5., -10., -19., -29., -42.]:
        origin = at(theta, 1.45, y)
        hit, _, _, _ = rock.ray_cast(origin, -radial, 240)
        if hit is None:
            raise RuntimeError(f"No canonical rock for formed strap {degrees}/{y}")
        path.append(hit+radial*.45)
    kit.strap(path, theta)
    kit.box(top+Vector((0, .28, 0)), (5.4, .75, 4.6), "bronze", tangent, radial, .24)
    kit.box(top+Vector((0, .70, 0)), (3.5, .13, 2.9), "recess", tangent, radial, .15)
    shoe = path[-1]+radial*.24
    kit.box(shoe, (5., 3.8, 1.2), "bronze", tangent, radial, .3)
    for x in [-1.65, 1.65]:
        kit.box(shoe+tangent*x+radial*.7, (.45, .5, .22), "recess", tangent, radial, .09)

kit.finish()
asset = kit.export()
boundary_samples = [boundary(math.tau*i/128) for i in range(128)]
manifest = {
    "version": 1,
    "source": "build_terrace_art.py; skywell-garden-terrace.blend",
    "coordinateConvention": "Metres; canonical island-grand local X/Z, Y0 cultivated top; identity glTF node transforms",
    "reference": {"file": "../zephyr/zephyr-scene-reference.png", "promptSource": "../zephyr/asset-manifest.json#concept",
                  "measuredCanonicalSource": "public/assets/levels/zephyr/island-grand.glb"},
    "provenance": "Original Blender geometry/materials/vertex finish. Canonical island imported read-only as dimensional reference; no canonical geometry is exported. No downloaded media, textures, lights or driving surfaces.",
    "construction": {"rx": RX, "rz": RZ, "bayCount": bay_count,
                     "arcDegrees": arcs, "formedRockAnchorsDegrees": anchors,
                     "topBoundaryRadiusRange": [min(boundary_samples), max(boundary_samples)],
                     "outerPromenadeRule": "Gentle .625radius with broad .009/.004 offsets, limited by actual upward y0 top boundary-.020; inward walking ribbon .086radius wide",
                     "seating": "Promenade foundation y-.65..+.65; four-role assembly copies actual selected island matrix"},
    "assets": [asset],
}
(SOURCE / "terrace-art-manifest.json").write_text(json.dumps(manifest, indent=2)+"\n")

# The editable reference is display-only, with canonical decorations hidden.
for obj in reference_objects:
    obj.hide_render = obj.type == "MESH" and "__rock" not in obj.name
world = bpy.context.scene.world or bpy.data.worlds.new("Skywell preview sky")
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (.43, .49, .56, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = .55
for name, location, energy, size in [("Preview key", (120, -170, 280), 2300, 150),
                                     ("Preview fill", (-180, 70, 130), 1700, 180)]:
    light = bpy.data.lights.new(name, "AREA")
    light.energy, light.shape, light.size = energy, "DISK", size
    obj = bpy.data.objects.new(name, light)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector((0, 0, -10))-obj.location).to_track_quat("-Z", "Y").to_euler()
sun = bpy.data.lights.new("Preview sun", "SUN")
sun.energy, sun.angle = 2.2, .16
sun_object = bpy.data.objects.new("Preview sun", sun)
bpy.context.scene.collection.objects.link(sun_object)
sun_object.rotation_euler = (math.radians(30), math.radians(-25), math.radians(-35))
camera = bpy.data.cameras.new("Promenade preview")
camera_object = bpy.data.objects.new("Promenade preview", camera)
bpy.context.scene.collection.objects.link(camera_object)
camera_object.location = (195, -245, 185)
camera_object.rotation_euler = (Vector((0, 0, -35))-camera_object.location).to_track_quat("-Z", "Y").to_euler()
camera.type, camera.ortho_scale = "ORTHO", 355
scene = bpy.context.scene
scene.camera = camera_object
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 12
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 960, 800, 100
scene.render.image_settings.file_format = "PNG"
preview = ROOT / ".experiments/skywell-garden-terrace-preview.png"
preview.parent.mkdir(parents=True, exist_ok=True)
scene.render.filepath = str(preview)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "skywell-garden-terrace.blend"))
bpy.ops.render.render(write_still=True)
print(json.dumps(manifest, indent=2))
