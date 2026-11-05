"""Editable original Nomad Procession land-carrier kit.

Run: blender --background --factory-startup --threads 6 --python <this file>.
Game coordinates are metres: +Y up, +Z bow, +X wheel axle.
The running road is level-owned and is deliberately absent from this kit.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
GAME = HERE.parents[3]
OUTPUT = GAME / 'public/assets/levels/nomad/carrier-kit.glb'
BLEND = HERE / 'nomad-carrier-kit.blend'
parser = argparse.ArgumentParser()
parser.add_argument('--render', action='store_true')
parser.add_argument('--candidate-dir', help='Write an isolated kit below the ignored .experiments directory.')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
RECORD_DIR = Path(args.candidate_dir).resolve() if args.candidate_dir else HERE
if args.candidate_dir:
    assert RECORD_DIR.is_relative_to(GAME / '.experiments')
    RECORD_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT = RECORD_DIR / 'carrier-kit.glb'
    BLEND = RECORD_DIR / 'nomad-carrier-kit.blend'
COLLISION = RECORD_DIR / 'carrier-collision.json'
WHEEL_RADIUS = 30
WHEEL_RADIAL_SCALE = WHEEL_RADIUS / 24
WHEEL_AXLE_Y = WHEEL_RADIUS
WHEEL_STATIONS = [-312, -234, -156, -78, 0, 78, 156, 234, 312]

bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for material in list(bpy.data.materials):
    bpy.data.materials.remove(material)


def xyz(point):
    x, y, z = point
    return Vector((x, -z, y))


def material(name, colour, metal, rough, emission=0):
    mat = bpy.data.materials.new('Nomad / ' + name)
    mat.diffuse_color = (*colour, 1)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*colour, 1)
    node.inputs['Metallic'].default_value = metal
    node.inputs['Roughness'].default_value = rough
    if name == 'warm ivory armour':
        node.inputs['Coat Weight'].default_value = .12
        node.inputs['Coat Roughness'].default_value = .45
    if emission:
        node.inputs['Emission Color'].default_value = (*colour, 1)
        node.inputs['Emission Strength'].default_value = emission
    return mat


MATERIALS = {
    'ivory': material('warm ivory armour', (.58, .535, .44), .16, .54),
    'navy': material('navy structural steel', (.026, .043, .058), .62, .49),
    'oxide': material('oxide freight enamel', (.58, .17, .043), .14, .47),
    'alloy': material('rubbed warm alloy', (.37, .325, .245), .83, .37),
    'rubber': material('graphite rubber', (.012, .016, .019), .02, .86),
    'amber': material('warm safety amber', (1, .64, .25), .06, .34, 3),
    'glass': material('recessed blue glazing', (.028, .075, .095), .36, .18),
    'void': material('deep machinery', (.009, .014, .02), .2, .71),
}
ROOTS = {}
LODS = {}
ANCHORS = {}
WHEELWELL_CUTTER = None


def root(name, lod=False):
    collection = bpy.data.collections.new('Editable / ' + name)
    bpy.context.scene.collection.children.link(collection)
    obj = bpy.data.objects.new('SOURCE__' + name, None)
    collection.objects.link(obj)
    (LODS if lod else ROOTS)[name] = obj
    ANCHORS[name] = []
    return obj


def attach(obj, name, mat, parent):
    obj.name = parent.name + ' / ' + name
    obj.parent = parent
    if mat:
        obj.data.materials.append(MATERIALS[mat])
    target = parent.users_collection[0]
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    target.objects.link(obj)
    # Original substantial manufacturing members retain their real polygon
    # profiles for the CPU contact extraction; tiny finish fittings are omitted.
    obj['nomadCollision'] = any(label in name for label in [
        'continuous formed load keel', 'folded lower armour chine',
        'cargo-side service sill', 'upper service gallery',
        'deep transverse chassis bearer', 'formed shoulder armour',
        'open side-portal jamb', 'deep inner bulkhead rib',
        'formed roof cassette', 'formed portal cheek', 'deep inner carrier',
        'formed crosshead', 'formed inner shoulder liner',
        'formed recessed soffit channel', 'continuous load tyre', 'cast hub barrel',
        'shadow body', 'formed wheel guard',
    ])
    return obj


def bevel(obj, radius=.45, segments=2):
    if radius <= 0:
        return obj
    mod = obj.modifiers.new('Formed manufacturing radius', 'BEVEL')
    mod.width = radius
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(25)
    normal = obj.modifiers.new('Weighted broad-face normals', 'WEIGHTED_NORMAL')
    normal.keep_sharp = True
    return obj


def box(name, centre, size, mat, parent, edge=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(centre))
    obj = bpy.context.object
    obj.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    attach(obj, name, mat, parent)
    # Sub-metre fittings are read as manufactured blocks at racing distance;
    # bevel tessellation is reserved for the large formed shoulders and masses.
    return bevel(obj, min(edge, min(size) * .22), 1) if edge > .3 else obj


def mesh(name, vertices, faces, mat, parent, edge=0):
    data = bpy.data.meshes.new(name)
    data.from_pydata([xyz(point) for point in vertices], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    attach(obj, name, mat, parent)
    return bevel(obj, edge)


def prism(name, profile, start, end, mat, parent, edge=0):
    vertices = [(x, y, z) for z in [start, end] for x, y in profile]
    n = len(profile)
    faces = [tuple(range(n - 1, -1, -1)), tuple(n + i for i in range(n))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return mesh(name, vertices, faces, mat, parent, edge)


def beam(name, a, b, radius, mat, parent, vertices=12):
    start, end = xyz(a), xyz(b)
    delta = end - start
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=delta.length, end_fill_type='NGON', location=(start + end) / 2)
    obj = bpy.context.object
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = delta.to_track_quat('Z', 'Y')
    attach(obj, name, mat, parent)
    for polygon in obj.data.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return obj


def girder(name, a, b, width, height, mat, parent, edge=.3):
    start, end = xyz(a), xyz(b)
    delta = end - start
    bpy.ops.mesh.primitive_cube_add(size=1, location=(start + end) / 2)
    obj = bpy.context.object
    obj.dimensions = (width, height, delta.length)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = delta.to_track_quat('Z', 'Y')
    attach(obj, name, mat, parent)
    return bevel(obj, edge, 1)


def anchor(parent, name, point, kind, **fields):
    ANCHORS[parent.name.removeprefix('SOURCE__')].append({'name': name, 'position': list(point), 'kind': kind, **fields})


def ring_x(name, radial_profile, mat, parent, segments=48):
    # Profile coordinates are axle X and radius in the wheel's Y/Z plane.
    vertices = []
    for x, radius in radial_profile:
        for i in range(segments):
            angle = i * 2 * math.pi / segments
            vertices.append((x, radius * math.cos(angle), radius * math.sin(angle)))
    rows = len(radial_profile)
    faces = []
    for row in range(rows):
        for i in range(segments):
            faces.append((row * segments + i, row * segments + (i + 1) % segments, ((row + 1) % rows) * segments + (i + 1) % segments, ((row + 1) % rows) * segments + i))
    obj = mesh(name, vertices, faces, mat, parent)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def build_wheel():
    parent = root('nomad_wheel')
    # Convex load-bearing shoulder, seated lips and deep dished hubs are modeled.
    ring_x('continuous load tyre', [(-9, 13.5), (-10, 19), (-8.8, 22.4), (-6.7, 23.4), (6.7, 23.4), (8.8, 22.4), (10, 19), (9, 13.5)], 'rubber', parent, 48)
    ring_x('cast hub barrel', [(-9.3, 6.6), (-9.3, 13.6), (-7.2, 15.4), (7.2, 15.4), (9.3, 13.6), (9.3, 6.6)], 'navy', parent, 48)
    for side in [-1, 1]:
        ring_x('seated alloy bead', [(side * 9.2, 13.4), (side * 10, 14.0), (side * 10.2, 15), (side * 9.4, 15.6)], 'alloy', parent, 48)
        ring_x('inset dished rim', [(side * 8.5, 5.8), (side * 10.6, 8.5), (side * 10.4, 11.7), (side * 9.2, 13.4)], 'ivory', parent, 48)
        beam('central axle cap', (side * 7.8, 0, 0), (side * 11.4, 0, 0), 5.2, 'navy', parent, 32)
        beam('retaining alloy boss', (side * 11.4, 0, 0), (side * 11.9, 0, 0), 2.9, 'alloy', parent, 20)
        for i in range(10):
            angle = i * 2 * math.pi / 10
            y, z = 9.2 * math.cos(angle), 9.2 * math.sin(angle)
            beam('hub seated stud', (side * 10.2, y, z), (side * 10.9, y, z), .62, 'alloy', parent, 8)
    # Unequal paired chevrons leave real broad grooves, rather than a flat ring.
    for i in range(44):
        angle = i * 2 * math.pi / 44
        for side in [-1, 1]:
            centre = (side * 4.1, 23.65 * math.cos(angle), 23.65 * math.sin(angle))
            obj = box('open-groove chevron tread', centre, (7.6, 1.0, 1.8), 'rubber', parent, .12)
            obj.rotation_euler = (angle, 0, side * .25)
    # Preserve the accepted axial width and bake the enlarged circle into every
    # real component, including bevels. Decorative tread is bounded by the true
    # rolling circle rather than protruding below the declared ground contact.
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    for obj in list(parent.children_recursive):
        if obj.type != 'MESH':
            continue
        data = bpy.data.meshes.new_from_object(obj.evaluated_get(graph), preserve_all_data_layers=True, depsgraph=graph)
        data.transform(obj.matrix_world)
        data.transform(Matrix.Diagonal((1, WHEEL_RADIAL_SCALE, WHEEL_RADIAL_SCALE, 1)))
        for vertex in data.vertices:
            radius = math.hypot(vertex.co.y, vertex.co.z)
            if radius > WHEEL_RADIUS:
                vertex.co.y *= WHEEL_RADIUS / radius
                vertex.co.z *= WHEEL_RADIUS / radius
        obj.modifiers.clear()
        obj.data = data
        obj.matrix_basis = Matrix.Identity(4)
    anchor(parent, 'axle_origin', (0, 0, 0), 'axis', axis=[1, 0, 0], rollingRadius=WHEEL_RADIUS)
    return parent


def cargo(parent, name, centre, length=36, width=17, height=18):
    x, y, z = centre
    box(name + ' / shadow body', centre, (width, height, length), 'navy', parent, .7)
    box(name + ' / recessed painted field', (x, y, z - length / 2 - .12), (width - 2.4, height - 2.4, .65), 'oxide', parent, .25)
    for side in [-1, 1]:
        box(name + ' / long folded edge', (x + side * width / 2, y, z), (.9, height, length), 'oxide', parent, .25)
        for up in [-1, 1]:
            box(name + ' / seated perimeter rail', (x + side * (width / 2 - .6), y + up * (height / 2 - .6), z), (1.3, 1.3, length + .5), 'alloy', parent, .15)
    for k in range(7):
        at = z - length * .42 + k * length * .14
        for side in [-1, 1]:
            box(name + ' / formed corrugation', (x + side * (width / 2 + .3), y, at), (.75, height - 2, 1.4), 'oxide', parent, .16)
    for side in [-1, 1]:
        beam(name + ' / front locking bar', (x + side * width * .24, y - height * .4, z - length / 2 - .55), (x + side * width * .24, y + height * .4, z - length / 2 - .55), .33, 'alloy', parent, 10)
    for side in [-1, 1]:
        for up in [-1, 1]:
            for end in [-1, 1]:
                box(name + ' / corner casting', (x + side * (width / 2 - .4), y + up * (height / 2 - .4), z + end * (length / 2 - .4)), (2.1, 2.1, 2.1), 'alloy', parent, .25)


def port_frame(parent, station, name, depth=18):
    for side in [-1, 1]:
        # The aperture is rectangular inside and faceted outside. Nothing enters
        # x±56/y54..124: this is a genuinely empty drive-through cargo volume.
        profile = [(side * 56.8, 53), (side * 69, 53), (side * 88, 76), (side * 88, 105), (side * 74, 128), (side * 57.2, 130), (side * 56.8, 123)]
        prism(name + ' / formed portal cheek', profile, station - depth / 2, station + depth / 2, 'ivory', parent, 1.25)
        inner = [(side * 60, 56), (side * 66, 56), (side * 81, 78), (side * 81, 103), (side * 69, 123), (side * 60, 124)]
        prism(name + ' / deep inner carrier', inner, station - depth * .7, station + depth * .7, 'navy', parent, .6)
        for y in [63, 87, 110]:
            box(name + ' / pocketed portal service pad', (side * 64, y, station - depth * .71), (7, 8, 1.9), 'alloy', parent, .4)
            for dx in [-2, 2]:
                beam(name + ' / recessed fastener', (side * 64 + dx, y - 2.3, station - depth * .78), (side * 64 + dx, y - 2.3, station - depth * .73), .42, 'navy', parent, 8)
    # Top is held below the roof running-skin envelope beginning at Y132.
    prism(name + ' / formed crosshead', [(-57.2, 124.3), (57.2, 124.3), (61, 127), (57, 130), (-57, 130), (-61, 127)], station - depth * .54, station + depth * .54, 'navy', parent, .5)
    for x in [-39, -13, 13, 39]:
        box(name + ' / warm soffit fixture', (x, 123.9, station), (13, .55, 2.2), 'amber', parent, .12)


def wheel_guard_spec(station):
    # Open the guard ends toward the two real side-portal road corridors.
    # The large tyre stays round; its guards have purposeful loading-bay cuts.
    if abs(station) == 234:
        return (31, 32, 22, 70) if station > 0 else (31, 32, 110, 158)
    if abs(station) == 156:
        return (32.5, 35, 65, 158) if station > 0 else (32.5, 35, 22, 115)
    return 32.5, 35, 22, 158


def cut_actual_wheelwells(parent):
    # The inboard X44..83 load keel stays continuous. Cut real openings only
    # into its outside wing, lower chine and sill, not into cargo or upperbody.
    global WHEELWELL_CUTTER
    collection = bpy.data.collections.new('Editable / real enlarged wheelwell cutters')
    bpy.context.scene.collection.children.link(collection)
    helper = bpy.data.objects.new('HELPER__enlarged wheelwell cutters', None)
    collection.objects.link(helper)
    cutters = []
    for side in [-1, 1]:
        for station in WHEEL_STATIONS:
            cutters.append(beam('editable wheelwell opening', (side * 83, WHEEL_AXLE_Y, station),
                                (side * 130, WHEEL_AXLE_Y, station), 32.5,
                                'navy', helper, 48))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in cutters:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = cutters[0]
    bpy.ops.object.join()
    cutter = bpy.context.object
    cutter.name = 'HELPER__actual outer wheelwell openings'
    cutter.display_type = 'WIRE'
    cutter.hide_render = True
    cutter.hide_set(True)
    WHEELWELL_CUTTER = cutter
    for obj in parent.children_recursive:
        if obj.type != 'MESH' or not any(name in obj.name for name in [
            'continuous formed load keel', 'folded lower armour chine', 'cargo-side service sill',
        ]):
            continue
        modifier = obj.modifiers.new('Actual open enlarged tyre wells', 'BOOLEAN')
        modifier.operation = 'DIFFERENCE'
        modifier.solver = 'EXACT'
        modifier.object = cutter


def build_carrier():
    parent = root('nomad_carrier')
    # Unequal continuous structural sponsons make a connected mass at road level.
    for side in [-1, 1]:
        keel = [(side * 44, 34), (side * 68, 27), (side * 88, 34), (side * 86, 49), (side * 50, 50)]
        prism('continuous formed load keel', keel, -365, 359, 'navy', parent, 1.1)
        chine = [(side * 61, 43), (side * 87, 40), (side * 91, 51), (side * 76, 61), (side * 62, 57)]
        for start, end in [(-350, -281), (-159, 159), (281, 344)]:
            prism('folded lower armour chine', chine, start, end, 'ivory', parent, .75)
        # The sidewalks and galleries belong to the hull, leaving the race bed open.
        box('cargo-side service sill', (side * 69.5, 52.3, 0), (26, 2, 704), 'alloy', parent, .35)
        for start, end in [(-337, -281), (-159, 159), (281, 337)]:
            box('upper service gallery', (side * 64, 87.5, (start + end) / 2), (11, 2, end - start), 'navy', parent, .25)
        for station in range(-315, 330, 27):
            if 159 < abs(station) < 281:
                continue
            box('seated inner gallery baluster', (side * 58.5, 90, station), (.8, 4.5, .8), 'alloy', parent, .08)
        for start, end in [(-333, -281), (-159, 159), (281, 333)]:
            beam('continuous gallery handrail', (side * 58.5, 92.2, start), (side * 58.5, 92.2, end), .33, 'alloy', parent)
            beam('gallery lower guard', (side * 58.5, 89.7, start), (side * 58.5, 89.7, end), .23, 'alloy', parent)

    # Only below-deck crossheads span the empty central road volume.
    for station in [-330, -250, -170, -90, -10, 70, 150, 230, 310]:
        box('deep transverse chassis bearer', (0, 38, station), (148, 16, 12), 'navy', parent, .7)
        for side in [-1, 1]:
            girder('chassis load diagonal', (side * 20, 28, station - 22), (side * 70, 48, station + 22), 4, 4, 'alloy', parent)

    # Large formed side skins have actual omitted bays around the side climbs.
    packets = [(-346, -301), (-299, -281), (-159, -104), (-102, -24), (-22, 58), (60, 138), (140, 159), (281, 305), (307, 349)]
    for side in [-1, 1]:
        for i, (start, end) in enumerate(packets):
            profile = [(side * 71, 68), (side * 82, 66), (side * 90, 79), (side * 90, 104), (side * 76, 126), (side * 71, 126)]
            prism('formed shoulder armour %02d' % i, profile, start, end, 'ivory', parent, .95)
            box('recessed shoulder gasket', (side * 89.1, 88, (start + end) / 2), (.9, 17, end - start - 10), 'navy', parent, .25)
            # The armoured outside and load-bearing inside are different skins.
            # A recessed navy liner gives the cargo hall actual manufactured
            # depth instead of presenting the back of a blank ivory slab.
            inner_profile = [
                (side * 71.2, 73), (side * 69.3, 77),
                (side * 69.3, 114), (side * 70.1, 119),
                (side * 72.5, 122), (side * 72.5, 73),
            ]
            prism('formed inner shoulder liner %02d' % i, inner_profile,
                  start + 4, end - 4, 'navy', parent, .4)
            for station in [start + 7, end - 7]:
                box('inner liner seated retaining strap', (side * 68.9, 96, station),
                    (.9, 39, 2.0), 'alloy', parent, .18)
            for station in [start + 8, end - 8]:
                box('shoulder inset service latch', (side * 89.4, 91, station), (.65, 7, 3.5), 'alloy', parent, .15)
            # Upper plate offsets reveal a dark manufactured overlap at the crown.
            box('shoulder crown lap', (side * 73, 126.4, (start + end) / 2), (10, 2.3, end - start - 5), 'alloy', parent, .3)
        for station in [-284, -156, 156, 284]:
            girder('open side-portal jamb', (side * 73, 54, station), (side * 73, 122, station), 6, 8, 'navy', parent, .5)
            box('side-portal jamb facing', (side * 70.2, 87, station), (1.2, 54, 5), 'alloy', parent, .25)
        for station in [-303, -145, 22, 145, 302]:
            box('deep inner bulkhead rib', (side * 67, 89, station), (4.5, 68, 8), 'navy', parent, .45)
            for y in [61, 117]:
                box('rib seated foot', (side * 67, y, station), (10, 4, 13), 'alloy', parent, .35)
            girder('diagonal cargo brace', (side * 67, 59, station - 23), (side * 67, 117, station + 23), 2.3, 2.3, 'alloy', parent, .2)

    # The outboard climbs cross roof height outside X±90. They need open side
    # portals, not full-width skylights. Continuous fitted roof packets restore
    # a deep enclosed cargo hall while the racing skin remains above Y132.
    for start, end in [(-351, -254), (-252, -155), (-153, -54), (-52, 49), (51, 151), (153, 252), (254, 347)]:
        box('formed roof cassette', (0, 128.4, (start + end) / 2), (142, 3.2, end - start), 'ivory', parent, .55)
        box('roof cassette recessed carrier', (0, 127.2, (start + end) / 2), (132, 1.4, end - start - 4), 'navy', parent, .3)
        for x in [-43, -2, 39]:
            # The underside has real channels: deep central recesses between
            # folded lower lips catch warm fixture light and cool reflected sky.
            profile = [(x - 11, 128), (x - 11, 124.5), (x - 9, 124.15),
                       (x - 7, 125.7), (x + 7, 125.7), (x + 9, 124.15),
                       (x + 11, 124.5), (x + 11, 128)]
            prism('formed recessed soffit channel', profile, start + 5, end - 5,
                  'navy', parent, .16)
            for edge in [-1, 1]:
                box('soffit channel seated alloy lip', (x + edge * 9.4, 124.45, (start + end) / 2),
                    (.75, .5, end - start - 13), 'alloy', parent, .1)
        for x in [-48, -24, 0, 24, 48]:
            box('roof seam load flange', (x, 130.3, (start + end) / 2), (.9, .6, end - start - 2), 'alloy', parent, .1)

    port_frame(parent, -358, 'stern receiving portal', 24)
    port_frame(parent, 354, 'bow departure portal', 20)
    for station in [-295, -146, -72, 64, 146, 295]:
        # Intermediate, lighter ribs preserve daylight through unequal roof cuts.
        port_frame(parent, station, 'interior crosshead %d' % station, 5)

    # Freight is restrained within the side galleries, not scattered into the lane.
    for side in [-1, 1]:
        for i, station in enumerate([-308, -134, -14, 110, 303]):
            cargo(parent, 'seated side freight %d' % i, (side * 77, 67, station), 34 if i % 2 else 42, 17, 18)
            if i in [0, 2, 4]:
                cargo(parent, 'upper restrained freight %d' % i, (side * 77, 102, station + 7), 28, 16, 17)
                for end in [-1, 1]:
                    beam('upper freight seated tie', (side * 77 - 6, 92.2, station + 7 + end * 12), (side * 77 + 6, 113, station + 7 + end * 12), .4, 'alloy', parent)

    # Real suspension, kingpins, connected axle cases and open tyre fairings.
    for side in [-1, 1]:
        for i, station in enumerate(WHEEL_STATIONS):
            anchor(parent, 'wheel_%s_%02d' % ('port' if side < 0 else 'starboard', i), (side * 96, WHEEL_AXLE_Y, station), 'wheel', axis=[1, 0, 0], rollingRadius=WHEEL_RADIUS)
            beam('connected axle casing / inboard rise', (side * 65, 25, station), (side * 84, WHEEL_AXLE_Y, station), 6.8, 'navy', parent, 20)
            beam('connected axle casing / coaxial outer stub', (side * 84, WHEEL_AXLE_Y, station), (side * 95, WHEEL_AXLE_Y, station), 6.8, 'navy', parent, 20)
            beam('seated axle collar', (side * 84, WHEEL_AXLE_Y, station), (side * 88, WHEEL_AXLE_Y, station), 8.8, 'alloy', parent, 24)
            for delta in [-13, 13]:
                girder('bogie wishbone', (side * 68, 45, station + delta), (side * 88, WHEEL_AXLE_Y + 3, station + delta * .3), 4.2, 5.2, 'navy', parent, .4)
                beam('inclined suspension ram', (side * 73, 48, station + delta), (side * 91, WHEEL_AXLE_Y + 7, station + delta * .2), 2.2, 'alloy', parent, 16)
            # A segmented top guard arches around the actual wheel envelope.
            inner, outer, first, last = wheel_guard_spec(station)
            vertices, faces = [], []
            for j in range(17):
                angle = math.radians(first + (last - first) * j / 16)
                for x, radius in [(side * 83, inner), (side * 109, inner), (side * 109, outer), (side * 83, outer)]:
                    vertices.append((x, WHEEL_AXLE_Y + radius * math.sin(angle), station + radius * math.cos(angle)))
            for j in range(16):
                for k in range(4):
                    faces.append((j * 4 + k, j * 4 + (k + 1) % 4, (j + 1) * 4 + (k + 1) % 4, (j + 1) * 4 + k))
            faces += [(3, 2, 1, 0), tuple(64 + k for k in range(4))]
            mesh('formed wheel guard', vertices, faces, 'ivory', parent, .35)
            for end in [first, last]:
                angle = math.radians(end)
                radius = (inner + outer) / 2
                y = WHEEL_AXLE_Y + radius * math.sin(angle)
                z = station + radius * math.cos(angle)
                girder('formed wheel guard seated end bracket',
                       (side * 79, 38 if y < 48 else 46, z), (side * 83, y, z),
                       1.6, 1.8, 'navy', parent, .2)
            angle = math.radians((first + last) / 2)
            radius = (inner + outer) / 2
            lamp = box('bogie safety marker', (side * 109.15,
                WHEEL_AXLE_Y + radius * math.sin(angle), station + radius * math.cos(angle)),
                (.6, min(2, (outer - inner) * .65), 8), 'amber', parent, .1)
            lamp.rotation_euler.x = math.pi / 2 - angle

    # Two asymmetric outboard cargo cranes: the load path remains legible.
    for side, station in [(-1, -289), (1, 278)]:
        box('crane seated pedestal', (side * 84, 133, station), (11, 20, 18), 'navy', parent, .7)
        box('crane foot formed collar', (side * 84, 125, station), (10.8, 5, 24), 'alloy', parent, .55)
        for dz in [-5, 5]:
            girder('crane rising main spar', (side * 84, 143, station + dz), (side * 108, 177, station + dz), 4.8, 5.2, 'ivory', parent, .6)
            girder('crane outboard upper spar', (side * 108, 177, station + dz), (side * 154, 165, station + dz), 4.8, 4.8, 'ivory', parent, .5)
            girder('crane open lower chord', (side * 88, 144, station + dz), (side * 154, 160, station + dz), 3, 3, 'navy', parent, .35)
        for fraction in [.25, .5, .75]:
            x = side * (108 + 46 * fraction)
            box('crane seated crosshead', (x, 177 - 12 * fraction, station), (4, 4, 14), 'alloy', parent, .3)
        beam('crane sheave axle', (side * 154, 163, station - 8), (side * 154, 163, station + 8), 3.9, 'navy', parent, 24)
        anchor(parent, 'freight_hook_%s' % ('port' if side < 0 else 'starboard'), (side * 154, 158, station), 'freight-hook', safeLoadCentre=[side * 154, 118, station])
        anchor(parent, 'crane_lamp_%s' % ('port' if side < 0 else 'starboard'), (side * 103, 170, station), 'lamp')

    # Purposeful bridge glazing, caged cable trunks and mounted fixtures.
    for side in [-1, 1]:
        for station in [-328, 323]:
            box('recessed bridge glazing', (side * 77, 118, station), (1.0, 8, 32), 'glass', parent, .55)
            for dz in [-12, -4, 4, 12]:
                box('bridge window mullion', (side * 77.7, 118, station + dz), (.8, 9, .7), 'alloy', parent, .1)
        for station in [-304, -144, 20, 145, 304]:
            box('seated service lamp housing', (side * 62, 103, station), (2.8, 5, 9), 'navy', parent, .35)
            box('service lamp face', (side * 60.5, 103, station), (.35, 2.6, 6), 'amber', parent, .12)
            anchor(parent, 'interior_lamp_%s_%s' % (side, station), (side * 60, 103, station), 'lamp')
        for y in [70, 75]:
            for start, end in [(-333, -281), (-159, 159), (281, 333)]:
                beam('side-gallery service bus', (side * 62, y, start), (side * 62, y, end), .6, 'alloy', parent, 12)
        for station in [-338, -95, 88, 337]:
            anchor(parent, 'outer_wall_mount_%s_%s' % (side, station), (side * 90, 95, station), 'wall')
    anchor(parent, 'stern_deck', (0, 54, -380), 'road')
    anchor(parent, 'bow_deck', (0, 54, 380), 'road')
    anchor(parent, 'roof_centre', (0, 132, 0), 'road')
    cut_actual_wheelwells(parent)
    return parent


def build_freight():
    parent = root('nomad_freight')
    cargo(parent, 'suspended freight', (0, 0, 0), 40, 27, 20)
    for x in [-10, 10]:
        for z in [-15, 15]:
            anchor(parent, 'lift_%s_%s' % (x, z), (x, 10.5, z), 'lift')
    return parent


build_carrier()
build_wheel()
build_freight()


def build_lod(source_name, name, ratio, omit_fine=False):
    """Retain editable collapse modifiers on original evaluated material meshes.

    No proxy boxes or billboard replacements are introduced. Each real material
    group is simplified independently, retaining cargo apertures and tyre mass.
    These sources are excluded from the physical contact extraction below.
    """
    source = ROOTS[source_name]
    parent = root(name, lod=True)
    parent['lodOf'] = source_name
    parent['collapseRatio'] = ratio
    parent['omittedFineParts'] = 'open-groove chevron tread|hub seated stud' if omit_fine else ''
    batches = {}
    graph = bpy.context.evaluated_depsgraph_get()
    for obj in source.children_recursive:
        if obj.type != 'MESH':
            continue
        if omit_fine and any(part in obj.name for part in ['open-groove chevron tread', 'hub seated stud']):
            continue
        category = 'collapse'
        if source_name == 'nomad_wheel' and 'continuous load tyre' in obj.name:
            category = 'rolling silhouette'
        elif source_name == 'nomad_carrier' and 'formed wheel guard' in obj.name:
            category = 'seated guards'
        elif source_name == 'nomad_carrier' and any(label in obj.name for label in [
            'continuous formed load keel', 'folded lower armour chine', 'cargo-side service sill',
        ]):
            category = 'open lower wells'
        data = obj.data.copy() if category == 'seated guards' else bpy.data.meshes.new_from_object(obj.evaluated_get(graph), preserve_all_data_layers=True, depsgraph=graph)
        if category == 'rolling silhouette':
            radius = max(math.hypot(vertex.co.y, vertex.co.z) for vertex in data.vertices)
            data.transform(Matrix.Diagonal((1, WHEEL_RADIUS / radius, WHEEL_RADIUS / radius, 1)))
        copy = bpy.data.objects.new('LOD_INPUT__' + obj.name, data)
        parent.users_collection[0].objects.link(copy)
        copy.parent = parent
        copy.matrix_world = obj.matrix_world.copy()
        batches.setdefault((obj.data.materials[0].name, category), []).append(copy)
    for key, objects in batches.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        batch = bpy.context.object
        batch.name = name + ' / editable ' + key[0].split(' / ')[-1] + ' / ' + key[1]
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        if key[1] in ['rolling silhouette', 'seated guards']:
            continue
        modifier = batch.modifiers.new('Distance-only silhouette-preserving collapse', 'DECIMATE')
        modifier.decimate_type = 'COLLAPSE'
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        if key[1] == 'open lower wells':
            modifier = batch.modifiers.new('Retain actual open tyre wells after collapse', 'BOOLEAN')
            modifier.operation = 'DIFFERENCE'
            modifier.solver = 'EXACT'
            modifier.object = WHEELWELL_CUTTER
    return parent


build_lod('nomad_carrier', 'nomad_carrier_mid', .26)
build_lod('nomad_carrier', 'nomad_carrier_far', .075)
build_lod('nomad_wheel', 'nomad_wheel_mid', .20)
build_lod('nomad_wheel', 'nomad_wheel_far', .075, omit_fine=True)
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1
bpy.context.scene.world.color = (.3, .34, .4)
for source in LODS.values():
    source.users_collection[0].hide_render = True
    source.users_collection[0].hide_viewport = True
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
for source in LODS.values():
    source.users_collection[0].hide_render = False
    source.users_collection[0].hide_viewport = False
bpy.context.view_layer.update()

# Evaluate each real component exactly once. Boolean wheelwell n-gons can
# choose different diagonals after material joining; retain explicit triangles
# in one pool for both physical extraction and the final rendered batches.
evaluated_meshes = {}
evaluation_graph = bpy.context.evaluated_depsgraph_get()
for source in {**ROOTS, **LODS}.values():
    for obj in source.children_recursive:
        if obj.type != 'MESH':
            continue
        data = bpy.data.meshes.new_from_object(obj.evaluated_get(evaluation_graph),
            preserve_all_data_layers=True, depsgraph=evaluation_graph)
        bm = bmesh.new()
        bm.from_mesh(data)
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        degenerate = [face for face in bm.faces if face.calc_area() < 1e-12]
        if degenerate:
            bmesh.ops.delete(bm, geom=degenerate, context='FACES_ONLY')
        unused = [vertex for vertex in bm.verts if not vertex.link_faces]
        if unused:
            bmesh.ops.delete(bm, geom=unused, context='VERTS')
        bm.to_mesh(data)
        bm.free()
        data.calc_loop_triangles()
        evaluated_meshes[obj] = data

# CPU contacts are extracted from the same evaluated substantial members that
# are consolidated into the GLB. Their real profiles, bevels and open portals
# survive; small railings, lamps and cosmetic fittings do not become blockers.
collision_prototypes = []
collision_graph = bpy.context.evaluated_depsgraph_get()
for prototype, source in ROOTS.items():
    positions, indices, parts = [], [], []
    for obj in source.children_recursive:
        if obj.type != 'MESH' or not obj.get('nomadCollision'):
            continue
        data = evaluated_meshes[obj]
        offset, first = len(positions) // 3, len(indices)
        for vertex in data.vertices:
            point = obj.matrix_world @ vertex.co
            positions.extend([round(point.x, 5), round(point.z, 5), round(-point.y, 5)])
        for triangle in data.loop_triangles:
            indices.extend([offset + vertex for vertex in triangle.vertices])
        parts.append({'name': obj.name.split(' / ', 1)[-1], 'indexStart': first, 'indexCount': len(indices) - first})
    collision_prototypes.append({'name': prototype, 'positions': positions, 'indices': indices, 'parts': parts, 'triangles': len(indices) // 3})
COLLISION.write_text(json.dumps({'version': 1, 'coordinates': '+Y up, +Z bow, metres, same local frames as carrier-kit.glb', 'source': 'Evaluated real substantial Blender members, identical to the corresponding GLB source geometry; small cosmetic fittings excluded.', 'prototypes': collision_prototypes}, separators=(',', ':')) + '\n')

# The .blend retains all manufacturing components and modifiers. Only the GLB
# consolidation is joined, so Three can instance each material group efficiently.
exports, records = [], []
graph = bpy.context.evaluated_depsgraph_get()
for prototype, source in {**ROOTS, **LODS}.items():
    export = bpy.data.objects.new(prototype, None)
    bpy.context.scene.collection.objects.link(export)
    exports.append(export)
    batches = {}
    precise_points = []
    for obj in list(source.children_recursive):
        if obj.type != 'MESH':
            continue
        data = evaluated_meshes[obj].copy()
        copy = bpy.data.objects.new('EXPORT__' + obj.name, data)
        bpy.context.scene.collection.objects.link(copy)
        copy.matrix_world = obj.matrix_world.copy()
        copy.parent = export
        precise_points += [(obj.matrix_world @ vertex.co) for vertex in data.vertices]
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
        batch.name = prototype + '__' + key.split(' / ')[-1].replace(' ', '_')
        # Identity batches avoid an angled active source object's very loose
        # transformed AABB, while preserving the exact same root-space shape.
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        batch.data.calc_loop_triangles()
        triangles += len(batch.data.loop_triangles)
    for spec in ANCHORS[prototype]:
        node = bpy.data.objects.new(prototype + '__' + spec['name'], None)
        bpy.context.scene.collection.objects.link(node)
        node.parent = export
        node.location = xyz(spec['position'])
        for key, value in spec.items():
            if key not in ['name', 'position']:
                node[key] = value
    game_points = [(point.x, point.z, -point.y) for point in precise_points]
    low = [min(point[axis] for point in game_points) for axis in range(3)]
    high = [max(point[axis] for point in game_points) for axis in range(3)]
    records.append({'name': prototype, 'triangles': triangles, 'materialBatches': len(batches), 'bounds': {'min': low, 'max': high}, 'dimensions': [high[axis] - low[axis] for axis in range(3)], 'anchors': ANCHORS[prototype]})

bpy.ops.object.select_all(action='DESELECT')
for obj in exports:
    obj.select_set(True)
    for child in obj.children_recursive:
        child.select_set(True)
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format='GLB', use_selection=True, export_apply=True, export_extras=True, export_cameras=False, export_lights=False, export_animations=False, export_yup=True)

# glTF discards degenerate faces left by aggressive distance-only collapse.
# Record the actual runtime index counts, retaining evaluated source counts
# separately only when they differ.
glb = OUTPUT.read_bytes()
json_length = struct.unpack_from('<I', glb, 12)[0]
gltf = json.loads(glb[20:20 + json_length])
def runtime_triangles(node_index):
    node = gltf['nodes'][node_index]
    count = 0
    if 'mesh' in node:
        for primitive in gltf['meshes'][node['mesh']]['primitives']:
            if primitive.get('mode', 4) == 4:
                accessor = primitive.get('indices', primitive['attributes']['POSITION'])
                count += gltf['accessors'][accessor]['count'] // 3
    return count + sum(runtime_triangles(child) for child in node.get('children', []))
for record in records:
    node_index = next(index for index, node in enumerate(gltf['nodes']) if node.get('name') == record['name'])
    count = runtime_triangles(node_index)
    if count != record['triangles']:
        record['evaluatedSourceTriangles'] = record['triangles']
    record['triangles'] = count

if args.render:
    for source in {**ROOTS, **LODS}.values():
        for child in source.children_recursive:
            child.hide_render = True
    for obj in exports:
        for child in obj.children_recursive:
            child.hide_render = obj.name != 'nomad_carrier'
    carrier_export = next(obj for obj in exports if obj.name == 'nomad_carrier')
    wheel_export = next(obj for obj in exports if obj.name == 'nomad_wheel')
    for spec in ANCHORS['nomad_carrier']:
        if spec['kind'] != 'wheel':
            continue
        root_copy = bpy.data.objects.new('Review wheel', None)
        bpy.context.scene.collection.objects.link(root_copy)
        root_copy.location = xyz(spec['position'])
        for obj in wheel_export.children:
            if obj.type != 'MESH':
                continue
            copy = obj.copy()
            copy.data = obj.data
            bpy.context.scene.collection.objects.link(copy)
            copy.parent = root_copy
            copy.hide_render = False
    ground = box('review salt ground', (0, -.5, 0), (2200, 1, 2400), 'ivory', carrier_export)
    sun_data = bpy.data.lights.new('Review warm sunlight', 'SUN')
    sun_data.energy = 3.1
    sun_data.angle = .12
    sun = bpy.data.objects.new('Review warm sunlight', sun_data)
    bpy.context.scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(22), math.radians(-34), math.radians(-24))
    camera_data = bpy.data.cameras.new('Review camera')
    camera = bpy.data.objects.new('Review camera', camera_data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location = xyz((295, 155, -540))
    target = xyz((0, 75, -145))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.lens = 34
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'AgX'
    temporary = RECORD_DIR if args.candidate_dir else GAME / '.experiments/nomad-carrier'
    temporary.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(temporary / 'representative.png')
    bpy.ops.render.render(write_still=True)

provenance = {
    'title': 'Nomad Procession original wheeled land-carrier kit',
    'generator': 'Original Blender mesh authoring, with editable component source retained before runtime consolidation.',
    'source': os.path.relpath(Path(__file__), RECORD_DIR),
    'blend': BLEND.name,
    'runtimeAsset': str(OUTPUT.relative_to(GAME)),
    'coordinates': 'Metres; glTF +Y up, +Z bow, wheel axle +X; carrier root at nominal ground centre.',
    'rights': 'Project-authored original meshes and scalar PBR materials. No third-party models, maps or baked lighting.',
    'reference': 'Original Nomad Procession generated scene supplied in the task; source reference and exact prompt registered separately by the level owner.',
    'reservedEnvelopes': {'cargoHall': {'min': [-56, 54, -380], 'max': [56, 124, 380]}, 'roofRoad': {'min': [-75, 132, -380], 'max': [75, 155, 380]}, 'outerWallRide': {'absoluteX': [90, 125], 'y': [80, 145]}},
    'prototypes': records,
    'materials': [mat.name for mat in MATERIALS.values()],
    'wheelGeometry': {'rollingRadius': WHEEL_RADIUS, 'axleHeight': WHEEL_AXLE_Y,
        'axialScale': 1, 'radialScale': WHEEL_RADIAL_SCALE, 'wheelwellRadius': 32.5,
        'construction': 'True circle baked into near geometry; all distance tiers retain that rolling radius. Continuous inboard load keels with real outside wheelwell cuts, raised suspension, and bracket-seated partial portal fenders. All upperbody, cargo and crane coordinates remain fixed.',
        'guards': [{'station': station, 'innerRadius': wheel_guard_spec(station)[0],
                    'outerRadius': wheel_guard_spec(station)[1],
                    'anglesDegrees': list(wheel_guard_spec(station)[2:])} for station in WHEEL_STATIONS]},
    'totalTriangles': sum(record['triangles'] for record in records),
    'collision': {'file': COLLISION.name, 'prototypes': [{'name': entry['name'], 'triangles': entry['triangles']} for entry in collision_prototypes]},
    'visualLOD': {'policy': 'Only the three near prototypes define physical contacts. Mid/far are real material-group meshes collapsed in Blender; apertures and wheel silhouettes remain geometry.',
                  'suggestedDistancesMetres': {'mid': 1800, 'far': 4500},
                  'sources': [{'name': name, 'source': source['lodOf'], 'collapseRatio': source['collapseRatio'],
                               'omittedFineParts': source['omittedFineParts'].split('|') if source['omittedFineParts'] else []} for name, source in LODS.items()]},
    'hashes': {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in [Path(__file__), BLEND, OUTPUT, COLLISION]},
}
(RECORD_DIR / 'carrier-kit-provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
print('NOMAD_CARRIER_KIT ' + json.dumps({'output': str(OUTPUT), 'prototypes': [{key: value for key, value in record.items() if key != 'anchors'} for record in records], 'triangles': provenance['totalTriangles'], 'collision': provenance['collision']}))
