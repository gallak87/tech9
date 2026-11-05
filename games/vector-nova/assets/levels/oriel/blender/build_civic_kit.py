"""Author Oriel's original civic architecture kit in Blender.

Run: blender --background --python assets/levels/oriel/blender/build_civic_kit.py
The scene is retained in civic-kit.blend. glTF coordinates are Y-up, with every
prototype centered horizontally and its floor at Y=0. Full and distant tiers
share a silhouette, and each prototype is consolidated by material for instancing.
"""

import bpy
import bmesh
import hashlib
import json
import math
from pathlib import Path
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
APP = HERE.parents[3]
EXPORT = APP / "public/assets/levels/oriel/oriel-civic-kit.glb"
scene = bpy.data.scenes.new("Oriel civic architecture / editable sources")
bpy.context.window.scene = scene
scene.unit_settings.system = "METRIC"
collection = bpy.data.collections.new("Oriel civic kit")
scene.collection.children.link(collection)


def material(name, color, roughness=0.7, metal=0):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metal
    return result


stone = material("Oriel / warm cut limestone", (0.73, 0.65, 0.50), 0.76)
trim = material("Oriel / pale honed cornice", (0.92, 0.84, 0.67), 0.58)
roof = material("Oriel / patinated titanium roof", (0.12, 0.25, 0.25), 0.53, 0.38)
glass = material("Oriel / deep blue-green glazing", (0.035, 0.12, 0.13), 0.29, 0.23)
bronze = material("Oriel / warm brass fittings", (0.43, 0.28, 0.12), 0.39, 0.66)

roots = {}
parts = {}
planting_anchors = {}


def begin(name):
    root = bpy.data.objects.new(name, None)
    collection.objects.link(root)
    root["prototype"] = name
    roots[name] = root
    parts[name] = []
    planting_anchors[name] = []
    return name


def register(category, obj, mat):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    collection.objects.link(obj)
    obj.parent = roots[category]
    obj.data.materials.append(mat)
    parts[category].append(obj)
    return obj


def box(category, name, x, y, z, width, depth, height, mat=stone, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + height / 2))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (width, depth, height)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    interior_fitting = "inhabited bay" in name or "promenade room" in name
    if not interior_fitting and not category.endswith("Far") and mat in (stone, trim) and min(width, depth, height) > 0.4:
        bevel = bevel or min(0.12, min(width, depth, height) * 0.08)
    if bevel:
        modifier = obj.modifiers.new("formed edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return register(category, obj, mat)


def arch(category, name, x, y, spring, inner, outer, depth, mat=trim, segments=8):
    verts = []
    for zz in (-depth / 2, depth / 2):
        for radius in (inner, outer):
            for i in range(segments + 1):
                angle = math.pi * i / segments
                verts.append((x + math.cos(angle) * radius, y + zz,
                              spring + math.sin(angle) * radius))
    stride = segments + 1
    faces = []
    for i in range(segments):
        a = i
        b = stride + i
        c = 2 * stride + i
        d = 3 * stride + i
        faces += [(a, a + 1, b + 1, b), (c, d, d + 1, c + 1),
                  (a, c, c + 1, a + 1), (b, b + 1, d + 1, d)]
    faces += [(0, stride, 3 * stride, 2 * stride),
              (segments, 2 * stride - 1, 4 * stride - 1, 3 * stride - 1)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = roots[category]
    mesh.materials.append(mat)
    parts[category].append(obj)
    return obj


def balcony(category, x, y, z, width, depth, full=True):
    box(category, "cantilevered limestone balcony", x, y, z,
        width, depth, 0.5, trim)
    box(category, "balcony bottom rail", x, y - depth / 2 + 0.2, z + 0.5,
        width, 0.4, 0.32, stone)
    box(category, "balcony seated coping", x, y - depth / 2 + 0.2, z + 1.6,
        width, 0.5, 0.35, trim)
    if full:
        for t in (-0.42, -0.14, 0.14, 0.42):
            box(category, "open gallery parapet pier", x + width * t,
                y - depth / 2 + 0.2, z + 0.5, 0.45, 0.45, 1.1, stone)


def row_of_arches(category, count, pitch, y, spring, inner, thickness, depth,
                  full=True):
    for i in range(count):
        x = (i - (count - 1) / 2) * pitch
        arch(category, "open civic arcade voussoir", x, y, spring, inner,
             inner + thickness, depth, trim if full else stone, 8 if full else 4)
    for i in range(count + 1):
        x = (i - count / 2) * pitch
        box(category, "load-bearing arcade pier", x, y, 0,
            pitch - inner * 2, depth, spring, stone)
        if full:
            box(category, "seated pier capital", x, y, spring - 0.4,
                pitch - inner * 2 + 0.5, depth + 0.5, 0.55, trim)


def pavilion():
    cat = begin("pavilion")
    box(cat, "civic stair lower", 0, 0, 0, 45, 25, 0.65, stone)
    box(cat, "civic stair upper", 0, 0, 0.65, 43, 23, 0.65, trim)
    row_of_arches(cat, 5, 8.0, -9.5, 7.0, 3.1, 0.65, 2.4, True)
    row_of_arches(cat, 5, 8.0, 9.5, 7.0, 3.1, 0.65, 2.4, True)
    box(cat, "deep hall enclosure", 0, 3.5, 1.3, 39, 8.5, 10.4, glass)
    box(cat, "broad roof entablature", 0, 0, 11.5, 43.5, 23.3, 1.4, trim)
    box(cat, "pavilion roof shallow step", -5, 1.5, 12.9, 28, 18, 1.0, roof)
    box(cat, "offset lantern base", 11.5, 0, 12.9, 11, 11, 1.0, stone)
    for x in (7.5, 15.5):
        for y in (-4, 4):
            box(cat, "open lantern post", x, y, 13.9, 1, 1, 5.0, stone)
    box(cat, "lantern roof", 11.5, 0, 18.9, 11.6, 11.6, 1.1, roof)
    for x in (-20.5, 20.5):
        box(cat, "pavilion foundation return", x, 0, 1.3, 1.5, 22, 10.2, stone)
    box(cat, "seated lantern bronze cap", 11.5, 0, 20.0, 12.0, 12.0, 0.15, bronze)
    box(cat, "pavilion recessed fascia", 0, -11.75, 11.6, 39, 0.18, 0.55, bronze)


def tower(full=True):
    cat = begin("tower" if full else "towerFar")
    box(cat, "tower rooted base", 0, 0, 0, 18, 18, 2.0, stone)
    box(cat, "tower lower plinth", 0, 0, 2, 15.5, 15.5, 6.0, trim if full else stone)
    box(cat, "slender tower core", 0, 0, 8, 10.5, 10.5, 48.5, stone)
    box(cat, "seated open lantern balcony", 0, 0, 56.5,
        17.5, 17.5, 1.5, trim if full else stone)
    for x in (-6.6, 6.6):
        for y in (-6.6, 6.6):
            box(cat, "open civic lantern pier", x, y, 58,
                1.7, 1.7, 12.0, stone)
    box(cat, "lantern crown course", 0, 0, 69.5, 17, 17, 1.5, trim if full else stone)
    box(cat, "patinated lantern crown", 0, 0, 71, 13.5, 13.5, 2.4, roof)
    box(cat, "upper crown lantern", 0, 0, 73.4, 7.5, 7.5, 1.6, roof)
    if full:
        for y in (-5.4, 5.4):
            for x in (-3.4, 3.4):
                box(cat, "recessed continuous stair glazing", x, y, 14,
                    1.3, 0.45, 37, glass)
        for x in (-5.45, 5.45):
            box(cat, "tower vertical engaged rib", x, 0, 8,
                0.7, 11.7, 48.5, trim)
        for y in (-6.6, 6.6):
            arch(cat, "lantern open arch", 0, y, 64.0,
                 5.65, 6.3, 1.3, trim, 8)
        for z in (20, 37, 53):
            box(cat, "tower horizontal reveal", 0, 0, z,
                11.6, 11.6, 0.45, bronze)


def sun_bracket():
    cat = begin("sunBracket")
    box(cat, "sunline bracket foundation", 0, 0, 0, 42, 14, 4, roof)
    for x in (-18.5, 18.5):
        box(cat, "sunline paired structural cheek", x, 0, 4,
            5.0, 10, 51, stone)
        box(cat, "seated cheek rib", x, -5.3, 5, 3, 1.3, 47, bronze)
    arch(cat, "sunline clear fork crown", 0, 0, 54.5,
         16.0, 21.0, 10, trim, 12)
    for x in (-20, 20):
        box(cat, "sunline receiver housing", x, 0, 51.5,
            8, 13, 5.0, roof)


def move_new_parts(category, start, x, y, z=0, rotation=0):
    transform = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rotation, 4, "Z")
    for obj in parts[category][start:]:
        obj.matrix_world = transform @ obj.matrix_world


def inhabited_room_backing(category, name, x, y, base, width, height, style=0):
    """A fitted room facade sits behind the open arcade, leaving a real gallery.

    Pale wall returns, a recessed side door and a broad divided window replace
    an unbroken dark strip. No emissive dots or extra material draw are needed.
    """
    w = width - 0.6
    for side in (-1, 1):
        box(category, name + " pale room return", x + side * (w / 2 - 0.65),
            y, base + 0.6, 1.3, 0.75, height - 1.3, trim)
    box(category, name + " seated room header", x, y, base + height - 1.45,
        w, 0.75, 0.8, trim)
    split = x - w * 0.12
    box(category, name + " formed room divider", split, y,
        base + 0.6, 0.7, 0.75, height - 1.3, trim)
    door_x = x - w * 0.3
    door_width = max(1.6, w * 0.24)
    box(category, name + " recessed side door", door_x, y + 0.5,
        base + 0.7, door_width, 0.2, min(4.6, height - 2.0), roof)
    for side in (-1, 1):
        box(category, name + " door jamb", door_x + side * (door_width / 2 + 0.1),
            y + 0.19, base + 0.65, 0.22, 0.35, min(4.8, height - 1.8), bronze)
    window_x = x + w * 0.22
    window_width = w * 0.44
    window_height = height * 0.5
    box(category, name + " window apron", window_x, y,
        base + 0.6, window_width + 0.35, 0.75, 1.3, stone)
    box(category, name + " recessed divided room window", window_x, y + 0.5,
        base + 1.9, window_width, 0.18, window_height, glass)
    for dx in (-window_width / 2, 0, window_width / 2):
        box(category, name + " window vertical fitting", window_x + dx,
            y + 0.2, base + 1.8, 0.2, 0.35, window_height + 0.2, bronze)
    for z in (base + 1.8, base + 1.9 + window_height):
        box(category, name + " broad room window sill", window_x, y + 0.12,
            z, window_width + 0.45, 0.9, 0.22, trim)
    if style == 1:
        box(category, name + " partially lowered room shade", window_x,
            y + 0.28, base + 1.9 + window_height * 0.58,
            window_width - 0.25, 0.24, window_height * 0.42, roof)
    elif style == 2:
        box(category, name + " recessed bronze transom", window_x,
            y + 0.26, base + 2.0 + window_height * 0.48,
            window_width, 0.3, 0.28, bronze)


def attached_pergola(category, name, x, y, base, width, depth, height=3.6):
    """A broad planted-roof shade structure with seated feet and open louvers."""
    for sx in (-1, 1):
        for sy in (-1, 1):
            px, py = x + sx * (width / 2 - 0.45), y + sy * (depth / 2 - 0.45)
            box(category, name + " seated pergola foot", px, py, base,
                0.95, 0.95, 0.35, trim)
            box(category, name + " bronze pergola upright", px, py, base + 0.35,
                0.45, 0.45, height - 0.35, bronze)
    for sy in (-1, 1):
        box(category, name + " formed pergola head beam", x,
            y + sy * (depth / 2 - 0.4), base + height,
            width, 0.65, 0.42, bronze)
    for row in range(4):
        yy = y - depth / 2 + (row + 0.5) * depth / 4
        box(category, name + " open pergola shade louver", x, yy,
            base + height + 0.42, width - 0.4, depth / 7.0, 0.18, roof)


def carve_civic_return(obj, center, dimensions):
    """A real broad return recess in the authored solid, not a facade decal."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    cutter = bpy.context.object
    cutter.name = "temporary civic return volume"
    cutter.scale = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new("deep civic gallery return", "BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = "EXACT"
    modifier.object = cutter
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def return_glazing(category, name, vertices, material):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], [(0, 1, 2, 3)])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = roots[category]
    mesh.materials.append(material)
    parts[category].append(obj)


def garden_return_mass(category, name, width, depth, height):
    body = box(category, name + " connected rear mass", 0, 3, 0,
               width, depth - 6, height, stone)
    count = 2 if width < 75 else 3
    bay = min(25.0, (width - 9 - (count - 1) * 5) / count)
    pitch = bay + 5
    backing = roof if category.endswith("Far") else glass
    rear = depth / 2
    floor = height * 0.5
    for i in range(count):
        x = (i - (count - 1) / 2) * pitch
        carve_civic_return(body, (x, rear - 3.05, height / 2),
                           (bay, 6.9, height - 6))
        top = height - (5.8 if x > width * 0.18 else 3.0)
        window_y = rear - 6.45
        half = (bay - 0.8) / 2
        return_glazing(category, name + " rear inhabited gallery glazing",
                       [(x-half,window_y,3.8),(x-half,window_y,top-.6),
                        (x+half,window_y,top-.6),(x+half,window_y,3.8)], backing)
        box(category, name + " inhabited bay rear gallery floor", x, rear - 3.1,
            floor - 0.35, bay + 0.4, 6.8, 0.7, trim if not category.endswith("Far") else stone)
        box(category, name + " inhabited bay rear structural pier", x, rear - 3.1,
            3.0, 1.4, 6.4, top - 3.0, stone)
    for side in (-1, 1):
        carve_civic_return(body, (side * (width / 2 - 2.6), 1.75, height / 2),
                           (6.0, 11.5, height - 8))
        top = height - (5.8 if side > 0 else 4.0)
        pane_x = side * (width / 2 - 5.55)
        vertices = [(pane_x,-3.5,4.7),(pane_x,7.0,4.7),
                    (pane_x,7.0,top-.6),(pane_x,-3.5,top-.6)]
        if side < 0:
            vertices.reverse()
        return_glazing(category, name + " end inhabited gallery glazing", vertices, backing)
        box(category, name + " inhabited bay end gallery floor",
            side * (width / 2 - 2.7), 1.75, floor - 0.35,
            6.0, 12.0, 0.7, trim if not category.endswith("Far") else stone)
        box(category, name + " inhabited bay seated rear corner pier",
            side * (width / 2 - 1.5), rear - 1.5,
            3.0, 3.0, 3.0, top - 3.0, stone)
    # An unequal low rear shoulder breaks the box silhouette while the complete
    # original front colonnade and its thin roof canopy remain at the old height.
    lo = width * 0.18
    hi = width / 2 + 0.3
    carve_civic_return(body, ((lo + hi) / 2, (depth / 2 + 0.3) / 2,
                             height - 2.3),
                       (hi - lo, depth / 2 + 0.3, 5.4))


def garden_return_roof(category, name, width, depth, height, full):
    coping = trim if full else stone
    front = -depth / 2
    box(category, name + " continuous front canopy return", 0, front + 3.2,
        height - 0.8, width + 1, 6.9, 0.8, coping)
    box(category, name + " upper seated roof return", -width * 0.145, 2.9,
        height - 0.8, width * 0.68 + 1, depth - 5, 0.8, coping)
    box(category, name + " lower rear shoulder coping", width * 0.34, 4.2,
        height - 5.8, width * 0.32 + 1, depth - 9, 0.8, coping)
    box(category, name + " upper roof terrace", -width * 0.145, 3,
        height, width * 0.68 - 2.5, depth - 7, 0.25, roof)
    box(category, name + " lower roof terrace", width * 0.34, 4.2,
        height - 5, width * 0.32 - 1.5, depth - 11, 0.25, roof)


def waterfront_return_mass(category, name, width, depth, height,
                           center_y=0, base=0):
    """Quay galleries use continuous unequal floor bands and broad masonry
    divisions, distinct from the court's centered deep piers and single floor.
    The complete original roof-bearing top3m and its attached soil roofs remain.
    """
    body = box(category, name, 0, center_y, base, width, depth, height, stone)
    rear = center_y + depth / 2
    backing = roof if category.endswith("Far") else glass
    count = max(1, round((width - 12) / 25))
    gap = 6.0
    bay = min(25.0, (width - 12 - gap * (count - 1)) / count)
    pitch = bay + gap
    for i in range(count):
        x = (i - (count - 1) / 2) * pitch
        carve_civic_return(body, (x, rear - 3.05, base + height / 2),
                           (bay, 6.9, height - 6))
        half = (bay - 0.7) / 2
        pane_y = rear - 6.45
        return_glazing(category, name + " rear quay gallery glazing",
                       [(x-half,pane_y,base+3.6),(x-half,pane_y,base+height-3.6),
                        (x+half,pane_y,base+height-3.6),(x+half,pane_y,base+3.6)], backing)
    side_count = 2 if depth >= 30 else 1
    side_bay = min(22.0, (depth - 8 - 5 * (side_count - 1)) / side_count)
    for side in (-1, 1):
        for i in range(side_count):
            axial = center_y + (i - (side_count - 1) / 2) * (side_bay + 5)
            carve_civic_return(body, (side * (width / 2 - 2.6), axial,
                                      base + height / 2),
                               (6.0, side_bay, height - 6))
            pane_x = side * (width / 2 - 5.55)
            half = (side_bay - 0.7) / 2
            vertices = [(pane_x,axial-half,base+3.6),
                        (pane_x,axial+half,base+3.6),
                        (pane_x,axial+half,base+height-3.6),
                        (pane_x,axial-half,base+height-3.6)]
            if side < 0:
                vertices.reverse()
            return_glazing(category, name + " end quay gallery glazing", vertices, backing)
        box(category, name + " inhabited bay seated quay corner",
            side * (width / 2 - 1.5), rear - 1.5, base + 3,
            3, 3, height - 6, stone)
    for level in (0.36, 0.69):
        floor = base + height * level - 0.35
        box(category, name + " inhabited bay continuous rear quay floor",
            0, rear - 3.1, floor, width - 6, 6.8, 0.7,
            stone if category.endswith("Far") else trim)
        for side in (-1, 1):
            box(category, name + " inhabited bay continuous end quay floor",
                side * (width / 2 - 2.7), center_y, floor,
                6, depth - 7.3, 0.7, stone if category.endswith("Far") else trim)


def gallery_house(category, name, x, y, z, width, depth, height,
                  full=True, floors=2, rotation=0):
    """A deep inhabited wing behind a genuinely open covered front gallery."""
    start = len(parts[category])
    front = -depth / 2
    returns = category in ("gardenCourt", "gardenCourtFar") and height >= 20
    quay_returns = category in ("waterfront", "waterfrontFar") and height >= 16
    if returns:
        garden_return_mass(category, name, width, depth, height)
    elif quay_returns:
        waterfront_return_mass(category, name + " connected rear mass",
                               width, depth - 6, height, 3)
    else:
        box(category, name + " connected rear mass", 0, 3, 0,
            width, depth - 6, height, stone)
    box(category, name + " seated foundation", 0, 0, 0,
        width + 0.4, depth + 0.4, 0.8, stone)
    if returns:
        garden_return_roof(category, name, width, depth, height, full)
    else:
        box(category, name + " projecting roof course", 0, 0, height - 0.8,
            width + 1, depth + 1, 0.8, trim if full else stone)
        box(category, name + " quiet rooftop", 0, 2, height,
            width - 3.5, depth - 4.5, 0.25, roof)
    bays = max(2, round(width / (10.5 if full else 16)))
    if category == "gardenCourtFar":
        bays = max(1, round(width / 32))
    pitch = (width - 2) / bays
    opening = min(pitch * 0.37, 4.3)
    if not full:
        # Only two broad openings survive in the distant tier; the deep U and
        # stepped silhouette remain the same as the full neighborhood.
        for i in range(bays + 1):
            bx = (i - bays / 2) * pitch
            pier_width = min(2.0, pitch - opening * 2) if i in (0, bays) else pitch - opening * 2
            box(category, name + " distant open pier", bx, front + 1,
                0, pier_width, 2.0, height - 0.8, stone)
        box(category, name + " distant shaded gallery", 0, front + 5,
            1.0, width - 3, 0.4, height - 3, roof)
    else:
        for i in range(bays + 1):
            bx = (i - bays / 2) * pitch
            box(category, name + " continuous gallery pier", bx, front + 1,
                0.8, pitch - opening * 2, 1.8, height - 1.6, stone)
        storey = height / floors
        for floor in range(floors):
            base = floor * storey
            spring = base + storey - opening - 0.85
            box(category, name + " recessed inhabited glazing", 0, front + 5,
                base + 1.3, width - 3.5, 0.3, storey - 2.4, glass)
            for i in range(bays):
                bx = (i - (bays - 1) / 2) * pitch
                arch(category, name + " deep gallery arch", bx, front + 1,
                     spring, opening, opening + 0.62, 1.8, trim, 8)
                inhabited_floor = floors // 2 if floors > 2 else 0
                if category in ("waterfront", "gardenCourt") and floor == inhabited_floor and (i + floor) % 3 == 0:
                    inhabited_room_backing(category, name + " inhabited bay",
                                           bx, front + 4.3, base,
                                           pitch - 0.8, storey, (i + floor) % 3)
            if floor:
                balcony(category, 0, front + 1.7, base - 0.45,
                        width + 0.2, 6.2, True)
        box(category, name + " cornice shadow reveal", 0, front - 0.17,
            height - 1.4, width - 1.5, 0.22, 0.5, bronze)
    move_new_parts(category, start, x, y, z, rotation)


def planter(category, x, y, z, width, depth, full=True):
    box(category, "seated neighborhood planter", x, y, z,
        width, depth, 1.25, trim if full else stone)
    box(category, "recessed planted soil bed", x, y, z + 1.26,
        width - 1.5, depth - 1.5, 0.12, roof)
    if full:
        box(category, "formed planter load-spreading foot", x, y, z,
            width + 0.65, depth + 0.65, 0.28, trim, 0.14)
        for side in (-1, 1):
            box(category, "formed planter seated rim", x,
                y + side * (depth / 2 - 0.2), z + 1.08,
                width + 0.3, 0.65, 0.32, trim)
        planting_anchors[category].append([x, z + 1.38, -y])


def neighborhood_lantern(category, x, y, base, height, full=True):
    width = 14
    body_height = height - 13
    box(category, "attached neighborhood lantern stair core", x, y, base,
        width - 3, width - 3, body_height, stone)
    box(category, "attached lantern gallery foundation", x, y, base + body_height,
        width + 2, width + 2, 1.2, trim if full else stone)
    for sx in (-5.5, 5.5):
        for sy in (-5.5, 5.5):
            box(category, "attached open lantern pier", x + sx, y + sy,
                base + body_height + 1.2, 1.6, 1.6, 8.8, stone)
    box(category, "attached lantern roof", x, y, base + height - 3,
        width + 2.8, width + 2.8, 1.0, trim if full else stone)
    box(category, "attached lantern patinated crown", x, y, base + height - 2,
        width - 0.5, width - 0.5, 2.0, roof)
    if full:
        for sy in (-5.5, 5.5):
            arch(category, "attached lantern arch", x, y + sy,
                 base + height - 7.1, 4.7, 5.3, 1.4, trim, 8)
        for sx in (-3.3, 3.3):
            box(category, "attached stairwell glazing", x + sx, y - 5.65,
                base + 3, 1.1, 0.35, body_height - 5, glass)


def waterfront(full=True):
    cat = begin("waterfront" if full else "waterfrontFar")
    # A single connected neighborhood is seated on a real waterfront podium;
    # lower arcades are open to a deep shaded promenade, not painted windows.
    box(cat, "continuous waterfront foundation", 0, 0, 0, 150, 70, 1.0, stone)
    # The raised quay top now seats the existing17.8m wing foundations exactly.
    waterfront_return_mass(cat, "connected waterfront inhabited podium",
                           146, 48, 16.8, 9, 1.0)
    for i in range(6 if full else 2):
        count = 6 if full else 2
        step = (i + 1) * 2.4 / count
        box(cat, "broad waterfront promenade stair", 0,
            -34.5 + (i + 1) * 1.5 * 6 / count, 0, 148, 3.0 * 6 / count,
            step, trim if full else stone)
    box(cat, "covered waterfront promenade floor", 0, -22, 2.4,
        148, 21, 0.65, trim if full else stone)
    count = 11 if full else 9
    pitch = 142 / count
    inner = pitch * 0.39
    for i in range(count):
        bx = (i - (count - 1) / 2) * pitch
        arch(cat, "waterfront open promenade arch", bx, -26.5,
             10.7, inner, inner + 0.95, 3.2,
             trim if full else stone, 8 if full else 4)
    for i in range(count + 1):
        bx = (i - count / 2) * pitch
        box(cat, "waterfront rooted arcade pier", bx, -26.5, 3.05,
            pitch - inner * 2, 3.2, 7.65, stone)
        if full:
            box(cat, "waterfront seated pier capital", bx, -26.5, 10.2,
                pitch - inner * 2 + 0.5, 3.7, 0.55, trim)
    box(cat, "continuous waterfront terrace roof", 0, -20.7, 16.7,
        148, 23.7, 1.1, trim if full else stone)
    if full:
        box(cat, "deep waterfront storefront glazing", 0, -15.3, 4.1,
            138, 0.4, 10.5, glass)
        balcony(cat, 0, -25.3, 17.8, 146, 5.0, True)
        for i in (0, 2, 3, 6, 8, 10):
            bx = (i - 5) * pitch
            inhabited_room_backing(cat, "waterfront promenade room", bx, -20.3,
                                   3.05, pitch - 1.1, 11.5, i % 3)
            if i in (2, 8):
                awning = box(cat, "attached promenade awning", bx, -21.7, 11.4,
                             pitch - 2, 4.5, 0.22, trim)
                awning.rotation_euler.x = math.radians(7)
                for side in (-1, 1):
                    box(cat, "seated bronze awning bracket", bx + side * (pitch / 2 - 1.7),
                        -20.0, 10.5, 0.35, 1.7, 0.8, bronze)
    gallery_house(cat, "west waterfront wing", -48, 4, 17.8,
                  45, 42, 20, full, 2)
    gallery_house(cat, "west roof belvedere", -57, 12, 38.05,
                  27, 24, 12, full, 1)
    gallery_house(cat, "central waterfront wing", 5, 13, 17.8,
                  56, 26, 16, full, 2)
    gallery_house(cat, "receding civic upper house", 16, 20, 34.05,
                  29, 15, 11, full, 1)
    gallery_house(cat, "east waterfront wing", 54, 13, 17.8,
                  36, 28, 25, full, 3)
    box(cat, "west wing seated connector gallery", -24, 2.5, 25.5,
        10, 16, 2.0, trim if full else stone)
    box(cat, "east wing seated connector gallery", 34, 13.5, 29.7,
        10, 10, 1.4, trim if full else stone)
    neighborhood_lantern(cat, 59, 13, 43.05, 31.95, full)
    for x, y, z, width, depth in [(-19,-18,17.8,13,5), (23,-19,17.8,15,5),
                                 (-45,-9,38.05,11,5), (5,5,34.05,12,5),
                                 (53,6,43.05,11,5)]:
        planter(cat, x, y, z, width, depth, full)
    if full:
        attached_pergola(cat, "waterfront shared terrace", 2, -18.8, 17.8,
                         14, 7, 3.6)
        attached_pergola(cat, "west belvedere roof garden", -57, 10, 50.3,
                         17, 10, 3.6)


def garden_court(full=True):
    cat = begin("gardenCourt" if full else "gardenCourtFar")
    box(cat, "continuous garden court foundation", 0, 0, 0,
        100, 80, 0.45, stone)
    box(cat, "lower open courtyard terrace", 0, 1, 0,
        51, 46, 1.8, trim if full else stone)
    box(cat, "raised rear garden terrace", 0, 23, 0,
        51, 10, 4.2, trim if full else stone)
    for i in range(9 if full else 3):
        count = 9 if full else 3
        box(cat, "broad entrance stair into garden", 0,
            -39.25 + 1.25 * 9 / count + i * 2 * 9 / count, 0, 34, 2.5 * 9 / count,
            (i + 1) * 1.8 / count, trim if full else stone)
    for i in range(8 if full else 2):
        count = 8 if full else 2
        box(cat, "court stair to upper garden terrace", 0,
            8 + i * 1.3 * 8 / count, 1.8, 30, 1.8 * 8 / count,
            (i + 1) * 2.4 / count, trim if full else stone)
    # Side galleries face inward to a genuine 50m courtyard, with connected
    # rear corners and unequal roofs rather than separately scattered houses.
    gallery_house(cat, "west garden gallery", -38, -4, 0,
                  64, 24, 28, full, 3, math.pi / 2)
    gallery_house(cat, "east garden gallery", 38, -4, 0,
                  64, 24, 22, full, 2, -math.pi / 2)
    gallery_house(cat, "rear civic garden hall", 0, 28, 0,
                  100, 24, 32, full, 3)
    gallery_house(cat, "rear unequal belvedere", -24, 29, 32.25,
                  34, 18, 7.5, full, 1)
    box(cat, "seated rear garden roof crown", 27, 29, 27.25,
        25, 17, 2.3, roof)
    if full:
        for side in (-1, 1):
            balcony(cat, side * 20, 18.5, 4.2, 9, 4.5, True)
    court_soil = [(-18,-11,1.8,6,13), (18,-11,1.8,6,13),
                  (-18,21,4.2,7,6), (18,21,4.2,7,6),
                  (-38,0,28.25,7,12), (38,7,22.25,7,10)]
    for x, y, z, width, depth in court_soil if full else court_soil[:2]:
        planter(cat, x, y, z, width, depth, full)
    if full:
        attached_pergola(cat, "west garden roof terrace", -38, -18, 28.25,
                         11, 13, 3.7)
        attached_pergola(cat, "east garden roof terrace", 38, -7, 22.25,
                         11, 13, 3.7)


pavilion()
tower(True)
tower(False)
sun_bracket()
waterfront(True)
waterfront(False)
garden_court(True)
garden_court(False)

# Join per category and material, preserving instancing-friendly identities.
prototype_manifest = []
for category, objects in parts.items():
    by_material = {}
    for obj in objects:
        by_material.setdefault(obj.data.materials[0].name, []).append(obj)
    for material_name, group in by_material.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in group:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        bpy.ops.object.join()
        merged = bpy.context.object
        merged.name = category + "__" + material_name.split(" / ")[-1].replace(" ", "_")
        # Store all parts in category-local coordinates, not first box origin.
        bpy.context.scene.cursor.location = (0, 0, 0)
        bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    tris = sum(len(poly.vertices) - 2 for obj in roots[category].children
               for poly in obj.data.polygons)
    bpy.context.view_layer.update()
    corners = [obj.matrix_world @ Vector(corner)
               for obj in roots[category].children for corner in obj.bound_box]
    gltf_corners = [(v.x, v.z, -v.y) for v in corners]
    minimum = [min(v[i] for v in gltf_corners) for i in range(3)]
    maximum = [max(v[i] for v in gltf_corners) for i in range(3)]
    prototype_manifest.append({"name": category, "triangles": tris,
                               "materials": len(by_material),
                               "bounds": {"min": minimum, "max": maximum},
                               "plantingAnchors": planting_anchors[category]})

scene.world = bpy.data.worlds.new("Oriel authoring studio")
scene.world.color = (0.3, 0.3, 0.3)
scene.render.engine = "CYCLES"
scene.cycles.samples = 16
scene.render.resolution_x = 1600
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
EXPORT.parent.mkdir(parents=True, exist_ok=True)
# Background authoring owns this canonical file; do not accumulate .blend1
# backups. This preference is scoped to this Blender process and is not saved.
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "civic-kit.blend"))
bpy.ops.object.select_all(action="DESELECT")
for obj in collection.all_objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(EXPORT), export_format="GLB",
                          use_selection=True, export_yup=True,
                          export_animations=False, export_cameras=False,
                          export_lights=False, export_extras=True)
(HERE / "civic-kit-manifest.json").write_text(json.dumps({
    "authoring": "Original Blender-authored Oriel civic kit, generated by build_civic_kit.py",
    "builder": "build_civic_kit.py",
    "export": {"file": "oriel-civic-kit.glb", "bytes": EXPORT.stat().st_size,
               "sha256": hashlib.sha256(EXPORT.read_bytes()).hexdigest()},
    "coordinates": "glTF Y-up, floor Y=0; prototypes centered X/Z",
    "prototypes": prototype_manifest,
}, indent=2) + "\n")
print(json.dumps(prototype_manifest))
