"""Author Oriel's one-off lakeside water-garden quarter in Blender.

Run export_garden_guides.mjs first, then Blender --background --factory-startup
--python this_file.py. Every modeled component is retained in the editable blend;
the runtime export is merged into six material batches. The quarter is authored
in road coordinates and then fitted to the actual production curve. It is not a
new instance family: unequal wings, courts, stairs and foundation are composed as
one continuous public district.
"""

import bpy
import bmesh
import hashlib
import json
import math
from pathlib import Path
from mathutils import Vector

HERE = Path(__file__).resolve().parent
APP = HERE.parents[4]
EXPORT = APP / "public/assets/levels/oriel/oriel-garden-quarter.glb"
GUIDES = HERE / "road-guides.json"
GROUND = HERE.parent / "ground/height-field.json"
guides = json.loads(GUIDES.read_text())
field = json.loads(GROUND.read_text())
frames = guides["points"]
scene = bpy.context.scene
scene.name = "Oriel / authored lakeside water-garden quarter"
scene.unit_settings.system = "METRIC"
for obj in list(scene.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
collection = bpy.data.collections.new("Editable water-garden construction")
scene.collection.children.link(collection)


def material(name, color, roughness, metal=0):
    mat = bpy.data.materials.new("Oriel quarter / " + name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metal
    return mat


stone = material("warm limestone", (0.76, 0.68, 0.53), 0.79)
trim = material("pale honed coping", (0.95, 0.87, 0.71), 0.65)
roof = material("teal patinated roofs", (0.105, 0.25, 0.245), 0.57, 0.35)
glass = material("blue-green glazing and channel", (0.035, 0.22, 0.225), 0.3, 0.2)
bronze = material("bronze public fittings", (0.43, 0.29, 0.14), 0.48, 0.62)
soil = material("deep planted garden soil", (0.14, 0.22, 0.085), 0.97)
parts = []
anchors = []
foundation_samples = []


def road_frame(s):
    value = max(0, min(len(frames) - 1.000001, (s - frames[0]["s"]) / 5))
    i, t = int(value), value % 1
    result = {}
    for key in ("position", "up", "right", "tangent"):
        result[key] = Vector(frames[i][key]).lerp(Vector(frames[i + 1][key]), t)
        if key != "position":
            result[key].normalize()
    return result


smooth_frames = {}


def district_frame(s):
    # A city district follows broad land contours, not every racing chicane.
    # Gaussian-filter the design centreline before offsetting its rear shelves;
    # direct offsets at 250m would fold around the tight promenade S bend.
    key = round(s, 4)
    if key not in smooth_frames:
        weights = [(offset, math.exp(-0.5 * (offset / 135) ** 2))
                   for offset in range(-360, 361, 15)]
        total = sum(weight for _, weight in weights)
        result = {k: Vector((0, 0, 0)) for k in ("position", "up", "tangent")}
        for offset, weight in weights:
            f = road_frame(s + offset)
            for k in result:
                result[k] += f[k] * (weight / total)
        result["tangent"].normalize()
        result["right"] = result["up"].cross(result["tangent"]).normalized()
        result["up"] = result["tangent"].cross(result["right"]).normalized()
        smooth_frames[key] = result
    return smooth_frames[key]


def blended_frame(x, s):
    front, rear = road_frame(s), district_frame(s)
    t = max(0, min(1, (-x - 100) / 105))
    t = t * t * (3 - 2 * t)
    frame = {k: front[k].lerp(rear[k], t) for k in front}
    frame["tangent"].normalize()
    frame["right"] = frame["up"].cross(frame["tangent"]).normalized()
    frame["up"] = frame["tangent"].cross(frame["right"]).normalized()
    return frame


def world_point(x, s, h):
    f = blended_frame(x, s)
    return f["position"] + f["right"] * x + f["up"] * h


def terrain_height(a, z):
    u = (a % math.tau) / math.tau * field["thetaSegments"]
    v = max(0, min(field["zSegments"], (z - field["zMin"]) /
                   (field["zMax"] - field["zMin"]) * field["zSegments"]))
    i, j = min(field["thetaSegments"] - 1, int(u)), min(field["zSegments"] - 1, int(v))
    x, y = u - i, v - j
    a, b = field["heights"][j][i:i + 2]
    c, d = field["heights"][j + 1][i:i + 2]
    return a + (b - a) * x + (c - a) * y if x + y <= 1 else d + (c - d) * (1 - x) + (b - d) * (1 - y)


def ground_level(x, s):
    lo, hi = -220, 80
    for _ in range(35):
        mid = (lo + hi) / 2
        p = world_point(x, s, mid)
        delta = 1000 - math.hypot(p.x, p.y - 1000) - terrain_height(math.atan2(p.x, 1000 - p.y), p.z)
        if delta > 0:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


def mesh(name, vertices, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    data.materials.append(mat)
    if mat == glass:
        # One glass material also serves turquoise public water. Deep gallery
        # panes receive their own exported surface tint, so dark rooms do not
        # turn the channel black or introduce a seventh runtime draw batch.
        colors = data.color_attributes.new(name="OrielSurfaceColor", type="FLOAT_COLOR", domain="CORNER")
        tint = (0.095, 0.15, 0.15, 1) if "recessed occupied glazing" in name else (1, 1, 1, 1)
        for color in colors.data:
            color.color = tint
        data.color_attributes.active_color = colors
    parts.append(obj)
    return obj


def box(name, x, s, h, width, length, height, mat=stone, step=30):
    bounds = [(x - width / 2, x + width / 2),
              (s - length / 2, s + length / 2), (h, h + height)]
    verts, faces = [], []
    for fixed in range(3):
        axes = [a for a in range(3) if a != fixed]
        a, b = axes
        na = max(1, math.ceil((bounds[a][1] - bounds[a][0]) / step))
        nb = max(1, math.ceil((bounds[b][1] - bounds[b][0]) / step))
        for end in (0, 1):
            start = len(verts)
            for j in range(nb + 1):
                for i in range(na + 1):
                    point = [0, 0, 0]
                    point[fixed] = bounds[fixed][end]
                    point[a] = bounds[a][0] + (bounds[a][1] - bounds[a][0]) * i / na
                    point[b] = bounds[b][0] + (bounds[b][1] - bounds[b][0]) * j / nb
                    verts.append(point)
            for j in range(nb):
                for i in range(na):
                    q = start + j * (na + 1) + i
                    faces.append((q, q + 1, q + na + 2, q + na + 1))
    return mesh(name, verts, faces, mat)


def arch(name, x, s, spring, horizontal, inner, outer, depth=1.7, segments=6):
    # horizontal is one of the local road-plane axes; the other is arch depth.
    u, v = Vector(horizontal), Vector((-horizontal[1], horizontal[0], 0))
    center = Vector((x, s, spring))
    vertices = []
    for d in (-depth / 2, depth / 2):
        for radius in (inner, outer):
            for i in range(segments + 1):
                angle = math.pi * i / segments
                p = center + u * (math.cos(angle) * radius) + v * d + Vector((0, 0, math.sin(angle) * radius))
                vertices.append(tuple(p))
    stride = segments + 1
    faces = []
    for i in range(segments):
        a, b, c, d = i, stride + i, 2 * stride + i, 3 * stride + i
        faces += [(a, a + 1, b + 1, b), (c, d, d + 1, c + 1),
                  (a, c, c + 1, a + 1), (b, b + 1, d + 1, d)]
    faces += [(0, stride, 3 * stride, 2 * stride),
              (segments, 2 * stride - 1, 4 * stride - 1, 3 * stride - 1)]
    return mesh(name, vertices, faces, trim)


def arcade_face(name, x, s, base, span, horizontal, levels=1, pitch=16, storey=11):
    count = max(1, round(span / pitch))
    pitch = span / count
    radius = min(pitch * 0.37, storey * 0.37)
    hx, hs = horizontal[:2]
    for level in range(levels):
        floor = base + level * storey
        for i in range(count):
            offset = (i - (count - 1) / 2) * pitch
            xx, ss = x + hx * offset, s + hs * offset
            arch(name + " / through arch", xx, ss, floor + 6.2,
                 horizontal, radius, radius + 0.65)
            # Glass sits 3m behind the real deep gallery opening.
            vx, vs = -hs, hx
            box(name + " / recessed occupied glazing", xx + vx * 3.3, ss + vs * 3.3,
                floor + 0.9, (pitch - 1.0) if hx else 0.22,
                0.22 if hx else (pitch - 1.0), 8.3, glass)
            if (i + level) % 3 == 0:
                box(name + " / fitted deep window sill", xx + vx * 2.8, ss + vs * 2.8,
                    floor + 0.65, (pitch - 2.6) if hx else 1.2,
                    1.2 if hx else (pitch - 2.6), 0.65, trim)
                for side in (-1, 1):
                    box(name + " / attached bronze window mullion",
                        xx + vx * 3.1 + hx * side * radius * 0.4,
                        ss + vs * 3.1 + hs * side * radius * 0.4,
                        floor + 1.2, 0.25 if hx else 0.3,
                        0.3 if hx else 0.25, 7.7, bronze)
        for i in range(count + 1):
            offset = (i - count / 2) * pitch
            xx, ss = x + hx * offset, s + hs * offset
            box(name + " / seated arcade pier", xx, ss, floor,
                2.2 if hx else 1.8, 1.8 if hx else 2.2, 6.3)
            box(name + " / pier capital", xx, ss, floor + 5.85,
                2.7 if hx else 2.2, 2.2 if hx else 2.7, 0.65, trim)
        box(name + " / continuous entablature", x, s, floor + storey - 0.9,
            span + 1 if hx else 2.6, 2.6 if hx else span + 1, 0.9, trim)


def gallery_block(name, x, s, base, width, length, levels, storey=11):
    height = levels * storey
    box(name + " / fitted inner house", x, s, base + 0.3,
        width - 8, length - 8, height - 1.0)
    for level in range(levels + 1):
        z = base + level * storey
        box(name + " / complete floor and corner course", x, s, z,
            width + 0.8, length + 0.8, 0.75, trim)
    # All four returns have genuine openings and shaded gallery depth.
    arcade_face(name + " / road gallery", x + width / 2, s, base,
                length, (0, 1, 0), levels, storey=storey)
    arcade_face(name + " / garden gallery", x - width / 2, s, base,
                length, (0, -1, 0), levels, storey=storey)
    arcade_face(name + " / entry return", x, s - length / 2, base,
                width, (1, 0, 0), levels, storey=storey)
    arcade_face(name + " / far return", x, s + length / 2, base,
                width, (-1, 0, 0), levels, storey=storey)
    box(name + " / deep teal inset roof", x, s, base + height + 0.75,
        width - 2, length - 2, 0.8, roof)
    # A raised lip gives the roof a physical edge rather than a flat color cap.
    for side in (-1, 1):
        box(name + " / raised roof edge", x + side * (width / 2 - 0.6), s,
            base + height + 1.3, 1.1, length, 0.85, trim)


def shelf(name, x0, x1, s0, s1, top):
    # Continuous independently sampled retaining slab, with every lower edge
    # buried 2m into the exact CPU terrain. No suspended rectangular block.
    vertices, faces = [], []
    nx, ns = max(1, math.ceil(abs(x1 - x0) / 20)), max(1, math.ceil((s1 - s0) / 10))
    for layer in range(2):
        for j in range(ns + 1):
            s = s0 + (s1 - s0) * j / ns
            for i in range(nx + 1):
                x = x0 + (x1 - x0) * i / nx
                ground = ground_level(x, s)
                bottom = ground - 2
                level = top(x, s) if callable(top) else top
                if layer == 0:
                    foundation_samples.append({"distance": s, "lateral": x,
                                               "terrainUp": ground, "bottomUp": bottom, "topUp": level})
                vertices.append((x, s, bottom if layer == 0 else level))
    stride = (nx + 1) * (ns + 1)
    for j in range(ns):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces += [(a, a + 1, a + nx + 2, a + nx + 1),
                      (a + stride, a + nx + 1 + stride, a + nx + 2 + stride, a + 1 + stride)]
    for i in range(nx):
        a, b = i, ns * (nx + 1) + i
        faces += [(a, a + stride, a + stride + 1, a + 1),
                  (b, b + 1, b + 1 + stride, b + stride)]
    for j in range(ns):
        a, b = j * (nx + 1), j * (nx + 1) + nx
        faces += [(a, a + nx + 1, a + nx + 1 + stride, a + stride),
                  (b, b + stride, b + nx + 1 + stride, b + nx + 1)]
    return mesh(name, vertices, faces, stone)


def planter(name, x, s, top, width, length, tree=False, scale=0.2):
    box(name + " / soil", x, s, top, width, length, 0.8, soil)
    for side in (-1, 1):
        box(name + " / long seated coping", x + side * (width / 2 + 0.45), s,
            top - 0.25, 0.9, length + 1.8, 1.2, trim)
        box(name + " / return coping", x, s + side * (length / 2 + 0.45),
            top - 0.25, width, 0.9, 1.2, trim)
    if tree:
        anchors.append({"distance": s, "lateral": x, "height": top + 0.8,
                        "scale": scale, "kind": "tree"})
    else:
        count = max(1, round(length / 13))
        for i in range(count):
            anchors.append({"distance": s + (i - (count - 1) / 2) * length / count,
                            "lateral": x, "height": top + 0.7,
                            "scale": 0.65 if width < 10 else 0.95, "kind": "shrub"})


def stairs_across(name, x0, x1, s, width, low, high, steps):
    step = (x1 - x0) / steps
    for i in range(steps):
        h = low + (high - low) * (i + 1) / steps
        box(name, x0 + step * (i + 0.5), s, low,
            abs(step) + 0.08, width, h - low + 0.12, trim)


def outward_terrace_level(nominal):
    return lambda x, s: max(nominal, ground_level(x, s) + 1.8)


def cultivated_retaining_bench(name, x, s0, s1, nominal):
    level = outward_terrace_level(nominal)
    vertices, faces = [], []
    count = math.ceil((s1 - s0) / 10)
    for i in range(count + 1):
        s = s0 + (s1 - s0) * i / count
        for xx in (x - 4, x + 4):
            vertices.append((xx, s, level(xx, s) + 0.13))
    for i in range(count):
        a = i * 2
        faces.append((a, a + 1, a + 3, a + 2))
    mesh(name + " / soil on founded bench", vertices, faces, soil)
    for s in range(s0 + 8, s1 - 5, 30):
        anchors.append({"distance": s, "lateral": x, "height": level(x, s) + 0.25,
                        "scale": 0.82, "kind": "shrub"})


# Three connected unequal land shelves, tied to the actual curved promenade.
shelf("front founded quay terrace", -32, -112, 330, 790, -7.85)
shelf("middle public water-garden terrace", -112, -208, 345, 780, -1.0)
shelf("rear cultivated retaining terrace", -208, -276, 365, 755, 14.0)
# Broad descending land benches replace the exposed tall outer plinth. Their
# lower edge seats into the rolling shell, with real planted shelves and one
# connected public descent instead of applied seams on a blank vertical wall.
for x0, x1, nominal in [(-276, -296, 4), (-296, -316, -7), (-316, -337, -18)]:
    shelf("descending founded garden retaining bench", x0, x1, 365, 755,
          outward_terrace_level(nominal))
    for s0, s1 in [(382, 566), (618, 742)]:
        cultivated_retaining_bench("cultivated outer garden step", (x0 + x1) / 2,
                                   s0, s1, nominal)
outer_stair_floor = outward_terrace_level(-18)(-337, 592)
stairs_across("connected descent through retaining gardens", -337, -274, 592, 32,
              outer_stair_floor + 0.15, 14.4, 54)

# The public edge is deliberately close enough to read at speed: green beds,
# water and pale coping precede the architecture, rather than a bare podium.
for s0, s1 in [(350, 430), (456, 626), (654, 772)]:
    center_s, length = (s0 + s1) / 2, s1 - s0
    box("shallow blue-green civic water channel", -45, center_s, -7.58,
        6, length, 0.25, glass, step=12)
    for x in (-49, -41):
        box("continuous pale channel coping", x, center_s, -7.7,
            1.5, length + 1.2, 0.8, trim)
    for end in (s0, s1):
        box("channel end dam and footbridge threshold", -45, end, -7.7,
            9.5, 1.8, 0.85, trim)
for s, length in [(390, 52), (535, 95), (712, 70)]:
    planter("front garden verge", -61, s, -7.68, 14, length)
    for tree_s in (s - length * 0.29, s + length * 0.29):
        planter("rooted front shade garden", -70, tree_s, -7.6, 12, 12, True, 0.2)

# An open, low quay arcade follows the S bend. Interruptions form two public
# entries into the real courts, rather than an endless replicated street wall.
for s, length in [(389, 82), (555, 124), (737, 82)]:
    gallery_block("connected low quay loggia", -93, s, -7.1, 27, length, 1)
    planter("loggia planted roof ribbon", -96, s, 5.6, 10, length - 10)

# Unequal attached housing wings frame a 150m long open court. Their returns,
# stepped roofs and the rear gallery remain articulated from ceiling views.
gallery_block("south stepped residential wing", -151, 390, -0.3, 89, 68, 2)
gallery_block("south upper belvedere house", -169, 392, 22.5, 50, 45, 1)
gallery_block("north taller civic wing", -164, 713, -0.3, 111, 52, 3)
gallery_block("rear garden gallery", -253, 553, 14.7, 39, 176, 2)
gallery_block("attached civic lantern base", -230, 686, 14.7, 49, 42, 3)
gallery_block("inhabited raised lantern", -236, 690, 48.8, 28, 27, 2)
box("lantern bronze shadow crown", -236, 690, 72.8, 34, 33, 1.2, bronze)

# Physical level changes create an inhabited water garden, with an open view
# through the middle to the rear arcade and its planted roof.
stairs_across("broad lower garden stair", -107, -137, 467, 62, -7.7, -0.7, 15)
stairs_across("broad upper garden stair", -193, -226, 536, 54, -0.8, 14.7, 24)
stairs_across("north public terrace stair", -185, -227, 646, 36, -0.8, 14.7, 24)
for s in (495, 606):
    planter("middle court planted island", -159, s, -0.7, 37, 61)
    for x in (-146, -172):
        planter("court shade tree socket", x, s, -0.6, 10, 10, True, 0.23)
for s in (466, 616):
    planter("upper cultivated garden", -218, s, 14.2, 15, 74)
for x, s, h, w, length in [(-155, 390, 34.6, 17, 25),
                           (-167, 715, 34.1, 45, 15),
                           (-252, 535, 38.7, 17, 105),
                           (-231, 687, 49.3, 12, 13)]:
    planter("occupied roof garden", x, s, h, w, length)

# Water descends in large connected basins beside the lower stair. These are
# modeled terraces and broad dark water surfaces, not particles or fountains.
for i in range(4):
    x = -117 - i * 17
    h = -6.4 + i * 1.8
    box("stepped water-garden basin", x, 583, h - 1.1, 15, 23, 1.3, trim)
    box("quiet reflective basin surface", x, 583, h + 0.15, 12, 20, 0.15, glass)
    box("bronze irrigation spill lip", x + 7.2, 583, h + 0.15, 0.6, 8, 0.45, bronze)

# Sturdy public terrace balustrades, with attachment feet and quiet broad rails.
for s0, s1 in [(350, 427), (495, 627), (697, 777)]:
    box("loggia front continuous bronze handrail", -78, (s0 + s1) / 2,
        -3.7, 0.55, s1 - s0, 0.7, bronze)
    for s in range(s0 + 4, s1, 12):
        box("rooted public rail post", -78, s, -6.9, 0.65, 0.65, 3.4, bronze)

# Fit every editable component to the production curve. Blender Z-up storage
# converts to identical Three.js Y-up coordinates through the glTF exporter.
minimum_advance = (1e9, None)
minimum_area = (1e9, None)
for s in range(330, 791, 4):
    for x in range(-337, -31, 8):
        ds = (world_point(x, s + 0.5, -1) - world_point(x, s - 0.5, -1))
        dx = (world_point(x + 0.5, s, -1) - world_point(x - 0.5, s, -1))
        frame = blended_frame(x, s)
        advance = ds.dot(frame["tangent"])
        area = ds.cross(dx).dot(frame["up"])
        if advance < minimum_advance[0]:
            minimum_advance = (advance, {"distance": s, "lateral": x})
        if area < minimum_area[0]:
            minimum_area = (area, {"distance": s, "lateral": x})
assert minimum_advance[0] > 0.05 and minimum_area[0] > 0.05, (minimum_advance, minimum_area)

for obj in parts:
    for vertex in obj.data.vertices:
        x, s, h = vertex.co
        p = world_point(x, s, h)
        vertex.co = (p.x, -p.z, p.y)
    obj.data.update()

for anchor in anchors:
    p = world_point(anchor["lateral"], anchor["distance"], anchor["height"])
    f = blended_frame(anchor["lateral"], anchor["distance"])
    anchor["position"] = list(p)
    anchor["basisRight"] = list(f["right"])
    anchor["basisUp"] = list(f["up"])
    anchor["basisTangent"] = list(f["tangent"])

scene.world = bpy.data.worlds.new("Oriel quarter authoring sky")
scene.world.color = (0.3, 0.35, 0.35)
scene.render.engine = "CYCLES"
scene.cycles.samples = 16
bpy.context.preferences.filepaths.save_version = 0
editable_path = HERE / "garden-quarter.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(editable_path))

# Export copies are consolidated without sacrificing the component source scene.
export_collection = bpy.data.collections.new("Runtime / six merged materials")
scene.collection.children.link(export_collection)
merged = []
for mat in (stone, trim, roof, glass, bronze, soil):
    copies = []
    for obj in parts:
        if obj.data.materials[0] != mat:
            continue
        copy = obj.copy()
        copy.data = obj.data.copy()
        export_collection.objects.link(copy)
        copies.append(copy)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in copies:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.join()
    result = bpy.context.object
    result.name = "gardenQuarter__" + mat.name.split(" / ")[-1].replace(" ", "_")
    merged.append(result)

triangles = sum(len(poly.vertices) - 2 for obj in merged for poly in obj.data.polygons)
EXPORT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="DESELECT")
for obj in merged:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(EXPORT), export_format="GLB", use_selection=True,
                          export_yup=True, export_animations=False, export_cameras=False,
                          export_lights=False, export_extras=True,
                          export_vertex_color="ACTIVE")

manifest = {
    "authoring": "Original Blender-authored Oriel lakeside water-garden quarter",
    "source": "build_garden_quarter.py",
    "geometryVersion": guides["geometryVersion"],
    "roadGuidesSHA256": hashlib.sha256(GUIDES.read_bytes()).hexdigest(),
    "terrainSHA256": hashlib.sha256(GROUND.read_bytes()).hexdigest(),
    "coordinates": "Baked production world coordinates, glTF Y-up",
    "reservation": {"start": 330, "end": 790, "side": -1, "minOffset": 32, "maxOffset": 340},
    "triangles": triangles,
    "materialBatches": len(merged),
    "editableComponents": len(parts),
    "plantingAnchors": anchors,
    "foundation": {
        "sampling": "Every 10m along course and <=20m across each shelf; exact CPU triangle height field",
        "samples": len(foundation_samples),
        "minimumBurialMetres": min(p["terrainUp"] - p["bottomUp"] for p in foundation_samples),
        "minimumTopClearanceMetres": min(p["topUp"] - p["terrainUp"] for p in foundation_samples),
        "minimumRoadEdgeClearanceMetres": 12,
        "frontPavingUp": -7.85,
        "middlePavingUp": -1,
        "rearPavingUp": 14,
        "minimumForwardAdvance": minimum_advance,
        "minimumSignedPlanArea": minimum_area,
    },
    "export": {"path": str(EXPORT.relative_to(APP)), "bytes": EXPORT.stat().st_size,
               "sha256": hashlib.sha256(EXPORT.read_bytes()).hexdigest()},
}
(HERE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps({k: manifest[k] for k in ("triangles", "materialBatches", "editableComponents", "foundation", "export")}))
