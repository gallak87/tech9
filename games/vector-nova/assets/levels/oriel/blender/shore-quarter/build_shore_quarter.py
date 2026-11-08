"""Author Oriel's one-off shoreline market and public garden in Blender.

Run export_shore_guides.mjs first, then Blender --background --factory-startup
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
EXPORT = APP / "public/assets/levels/oriel/oriel-shore-quarter.glb"
GUIDES = HERE / "road-guides.json"
GROUND = HERE.parent / "ground/height-field.json"
guides = json.loads(GUIDES.read_text())
field = json.loads(GROUND.read_text())
frames = guides["points"]
scene = bpy.context.scene
scene.name = "Oriel / authored shoreline market quarter"
scene.unit_settings.system = "METRIC"
for obj in list(scene.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
collection = bpy.data.collections.new("Editable shore market construction")
scene.collection.children.link(collection)


def material(name, color, roughness, metal=0):
    mat = bpy.data.materials.new("Oriel shore / " + name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metal
    return mat


stone = material("warm limestone", (0.76, 0.68, 0.53), 0.79)
trim = material("pale honed coping", (0.95, 0.87, 0.71), 0.65)
roof = material("muted formed metal roofs", (0.16, 0.22, 0.20), 0.86, 0.12)
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
    t = max(0, min(1, (x - 75) / 75))
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


def arcade_face(name, x, s, base, span, horizontal, levels=1, pitch=16, storey=11, glazed=True):
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
            if glazed:
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


def market_canopy(s0, s1):
    # A thick, shallow pitched roof with actual eave returns. Broad roof planes
    # and fitted fascia distinguish shelter from the reflective basin below.
    profile = [(81,3.6), (104,5.5), (127,3.6),
               (127,3.05), (104,4.95), (81,3.05)]
    vertices, faces = [], []
    count = math.ceil((s1-s0)/12)
    for i in range(count+1):
        s=s0+(s1-s0)*i/count
        vertices.extend((x,s,h) for x,h in profile)
    for i in range(count):
        for j in range(len(profile)):
            a=i*len(profile)+j
            b=i*len(profile)+(j+1)%len(profile)
            faces.append((a,b,b+len(profile),a+len(profile)))
    faces += [tuple(reversed(range(len(profile)))),
              tuple(count*len(profile)+j for j in range(len(profile)))]
    mesh("fitted shallow pitched market canopy",vertices,faces,roof)
    for x in (81.5,126.5):
        box("market deep formed eave fascia",x,(s0+s1)/2,2.35,
            1.2,s1-s0+1.4,1.3,roof)
        box("market pale fitted drip edge",x,(s0+s1)/2,3.55,
            1.8,s1-s0+2,.3,trim)
    count=max(1,round((s1-s0-2)/17))
    for i in range(0,count+1,2):
        s=s0+1+(s1-s0-2)*i/count
        box("broad transverse sheltered market beam",104,s,1.9,
            43,2.2,1.0,bronze)
        for x in (83,125):
            box("attached market beam capital",x,s,1.35,3.2,3.1,1.5,trim)
    box("fitted market ridge cap",104,(s0+s1)/2,5.35,1.7,s1-s0+.7,.4,bronze)


def market_colonnade(s0,s1):
    # A seated post-and-beam public portico. Complete capitals meet the actual
    # canopy beams; no disconnected arch ornaments span between distant posts.
    count=max(1,round((s1-s0)/17))
    for i in range(count+1):
        s=s0+(s1-s0)*i/count
        for x in (83,125):
            box("market colonnade founded pier foot",x,s,-6.8,3.1,3.1,.65,trim)
            box("market colonnade complete seated pier",x,s,-6.3,2.1,2.1,8.7,stone)
            box("market colonnade formed pier capital",x,s,2.1,3.3,3.4,1.05,trim)
    for x in (83,125):
        box("continuous sheltered market bearer",x,(s0+s1)/2,2.5,
            2.2,s1-s0+1.5,.7,bronze)


def coping_strip(name,x,s0,s1,width,height,level,mat=trim):
    vertices,faces=[],[]
    count=math.ceil((s1-s0)/8)
    for i in range(count+1):
        s=s0+(s1-s0)*i/count
        top=level(x,s)
        vertices.extend([(x-width/2,s,top), (x+width/2,s,top),
                         (x+width/2,s,top-height), (x-width/2,s,top-height)])
    for i in range(count):
        for j in range(4):
            a=i*4+j;b=i*4+(j+1)%4
            faces.append((a,b,b+4,a+4))
    faces += [(3,2,1,0),tuple(count*4+j for j in range(4))]
    mesh(name,vertices,faces,mat)


def stair_cheek(name,xlow,xhigh,s,width,low,high):
    for side in (-1,1):
        y=s+side*(width/2+1)
        vertices=[]
        for yy in (y-.8,y+.8):
            vertices.extend([(xlow,yy,low-.3),(xhigh,yy,low-.3),
                             (xhigh,yy,high+1),(xlow,yy,low+1)])
        faces=[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]
        mesh(name,vertices,faces,stone)
        # Thick sloping coping is a real fitted extrusion over the cheek.
        verts=[]
        for yy in (y-1,y+1):
            verts.extend([(xlow,yy,low+.9),(xhigh,yy,high+.9),
                          (xhigh,yy,high+1.35),(xlow,yy,low+1.35)])
        mesh(name+" / fitted raked coping",verts,faces,trim)


# One low market edge with an expansive descending public court. This is not
# the rising three-wing water-garden district on the other side of the lake.
def smooth01(value):
    value = max(0, min(1, value))
    return value * value * (3 - 2 * value)


def court_level(x, s):
    descent = smooth01((s - 8950) / 50) * smooth01((9310 - s) / 50)
    return -7.85 - 9.95 * descent


def rear_level(x, s):
    return max(court_level(x, s) - 8, ground_level(x, s) + 1.8)


shelf("founded public promenade edge", 32, 80, 8950, 9310, -7.85)
shelf("continuous market porch foundation", 80, 128, 8950, 9310, -7.85)
shelf("descending public garden court land", 128, 215, 8950, 9310, court_level)
shelf("low terrain-linked cultivated shore bench", 215, 235, 8950, 9310, rear_level)

# Low roof and genuine open-sided portico keep the lake and opposite town in
# view. Two broad public entries divide one connected market frontage.
for s0, s1 in [(8980, 9082), (9114, 9275)]:
    s, length, floor = (s0 + s1) / 2, s1 - s0, -7.5
    box("long low market public floor", 104, s, floor, 43, length, .7, trim)
    market_colonnade(s0,s1)
    market_canopy(s0-1,s1+1)
    for ss in range(s0+17, s1-8, 34):
        box("deep occupied market shop return", 104, ss, -6.7, 17, 20, 8.6)
        box("recessed occupied glazing", 95.35, ss, -6.1, .3, 16, 6.5, glass)
        box("fitted market bronze counter", 93.7, ss, -4.0, 1.4, 14, .65, bronze)
        box("occupied stall shadow lintel",95.1,ss,.5,1.3,19,.8,bronze)
        for side in (-1,1):
            box("fitted stall door jamb",95.0,ss+side*8.2,-6.4,1.1,.9,7.6,trim)
        box("attached market glazing mullion",95.0,ss,-6.1,.35,.35,6.6,bronze)
    for ss in (s0+26,s1-26):
        box("fitted sheltered stall shade cassette",91.8,ss,.45,7.5,17,.6,roof)
        for side in (-1,1):
            box("attached broad shade bracket",91.8,ss+side*7.7,-.55,6.8,.55,1.25,bronze)

# Two unequal pavilion masses occupy the ends, leaving a long planted civic
# square/basin open between them. Neither is a scaled copy of a civic parcel.
gallery_block("broad south market pavilion", 169, 9027, -17.1, 76, 55, 2)
shelf("founded north pavilion stepped podium", 130, 225, 9214, 9268, -16.7)
gallery_block("lower north garden pavilion", 177, 9240, -16.7, 91, 50, 1)
gallery_block("north pavilion raised terrace room", 195, 9243, -4.3, 43, 31, 1)
box("north pavilion attached public terrace", 146, 9272, -8, 46, 28, .8, trim)
shelf("founded far belvedere public landing", 138, 163, 9269, 9294, -7.1)
gallery_block("modest far-curve belvedere", 150, 9281, -7.1, 22, 21, 2)
for x in (143, 157):
    for s in (9274, 9288):
        box("belvedere open lantern seated post", x, s, 16.7, 1.35, 1.35, 7.6)
box("belvedere thin bronze crown", 150, 9281, 24.3, 24, 24, .9, bronze)

# Broad garden beds, water court and shade gardens create purposeful land use
# at racing size. There is no repeated narrow canal along this public edge.
for s, length in [(9016, 49), (9160, 75), (9261, 34)]:
    planter("public market shade garden", 52, s, -7.55, 24, length)
    for ss in (s-length*.28, s+length*.28):
        planter("market front rooted canopy", 67, ss, -7.5, 12, 12, True, .19)
box("public court reflecting basin stone seat", 172, 9149, -17.45, 44, 107, .8, trim)
box("public court broad quiet basin water", 172, 9149, -16.6, 39, 101, .18, glass)
for s in (9078, 9220):
    planter("public court cultivated island", 175, s, -17.45, 49, 28)
    for x in (158, 191):
        planter("large court shade tree socket", x, s, -17.35, 11, 11, True, .22)
for s in (9065, 9160, 9245):
    h = rear_level(225, s)
    planter("shore bench cultivated garden", 225, s, h+.2, 12, 56)

# Wide public stairs join the promenade's two open entries to the lower court;
# a second stair lands on the terrain-facing shore walk.
for s in (9098, 9192):
    stairs_across("market entry descending public stair", 160, 125, s, 24,
                  -17.5, -7.1, 24)
    stair_cheek("complete market court stair cheek",160,125,s,24,-17.5,-7.1)
    box("upper market stair public landing",122,s,-7.4,8,29,.65,trim)
    box("lower court stair public landing",165,s,-17.5,12,29,.65,trim)
stairs_across("court to terrain shore stair", 235, 205, 9173, 28,
              rear_level(235,9173)+.1, -17.1, 21)
stair_cheek("complete shore stair retaining cheek",235,205,9173,28,
            rear_level(235,9173)+.1,-17.1)
box("shore stair upper garden landing",202,9173,-17.5,9,33,.65,trim)
box("shore stair lower public landing",230,9173,rear_level(230,9173)+.1,12,33,.65,trim)

# Coping follows the modeled civic level and returns into complete corner
# landings. These are quiet broad construction transitions, not seam decoration.
coping_strip("continuous upper court retaining coping",128,9003,9257,2.5,1.0,
             lambda x,s:-7.2)
coping_strip("lower court garden edge coping",214,9003,9257,2.0,.9,
             lambda x,s:court_level(x,s)+.45)
for s in (8951,9309):
    box("full width promenade joined end coping",123.5,s,-7.5,183,2.2,.6,trim)
for s in (9004,9256):
    box("court retaining corner return and landing",174,s,-17.4,85,5,.7,trim)
for s in (9215,9267):
    box("north pavilion podium corner return",178,s,-16.45,96,3,.8,trim)
coping_strip("north pavilion podium complete rear edge",225,9215,9267,2.0,1.2,
             lambda x,s:-15.65)

# At the end seams the full old promenade width is retained. These founded
# sloping public ramps connect to the lower court without pinching the edge.
for s0, s1 in [(8950, 9000), (9260, 9310)]:
    verts, faces = [], []
    for i in range(11):
        s = s0 + (s1-s0)*i/10
        for x in (129,144):
            verts.append((x,s,court_level(x,s)+.2))
    for i in range(10):
        a=i*2
        faces.append((a,a+1,a+3,a+2))
    mesh("full-width joined public end ramp", verts, faces, trim)

# Physical narrow paths link the end ramps, market court, basin and shore.
for x in (143,207):
    box("linked garden public path", x, 9155, -17.6, 8, 205, .4, trim)
for s in (9098,9192):
    box("cross-court basin public path", 178, s, -17.6, 70, 8, .4, trim)
for s in range(9020,9280,26):
    h=rear_level(232,s)+.6
    box("founded shore walk bronze rail foot",232,s,h, .6,.6,2.0,bronze)

# Fit every editable component to the production curve. Blender Z-up storage
# converts to identical Three.js Y-up coordinates through the glTF exporter.
minimum_advance = (1e9, None)
minimum_area = (1e9, None)
for s in range(8950, 9311, 4):
    for x in range(32, 236, 8):
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
editable_path = HERE / "shore-quarter.blend"
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
    result.name = "shoreQuarter__" + mat.name.split(" / ")[-1].replace(" ", "_")
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
    "authoring": "Original Blender-authored Oriel shoreline market and public garden",
    "source": "build_shore_quarter.py",
    "geometryVersion": guides["geometryVersion"],
    "roadGuidesSHA256": hashlib.sha256(GUIDES.read_bytes()).hexdigest(),
    "terrainSHA256": hashlib.sha256(GROUND.read_bytes()).hexdigest(),
    "coordinates": "Baked production world coordinates, glTF Y-up",
    "reservation": {"start": 8950, "end": 9310, "side": 1, "minOffset": 32, "maxOffset": 260, "replacePromenade": True},
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
        "middlePavingUp": -17.8,
        "rearPavingUp": -25.8,
        "minimumForwardAdvance": minimum_advance,
        "minimumSignedPlanArea": minimum_area,
    },
    "export": {"path": str(EXPORT.relative_to(APP)), "bytes": EXPORT.stat().st_size,
               "sha256": hashlib.sha256(EXPORT.read_bytes()).hexdigest()},
}
(HERE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps({k: manifest[k] for k in ("triangles", "materialBatches", "editableComponents", "foundation", "export")}))
