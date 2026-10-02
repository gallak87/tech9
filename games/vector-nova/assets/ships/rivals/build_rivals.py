"""Three original production-class rivals. Asset-only; no gameplay registration.

Run: blender --background --threads 6 --python assets/ships/rivals/build_rivals.py
Optional arguments after --: --ship rook|latch|mule|all --render
Editable sources stay beside this script; GLBs are copied to public for inspection.
"""
import argparse
import json
import math
import shutil
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent))
sys.dont_write_bytecode = True
import build_fleet as F

PALETTES = {
    'rook': ((.185, .205, .16), (.54, .51, .40)),
    'latch': ((.135, .205, .25), (.49, .54, .53)),
    'mule': ((.27, .235, .185), (.43, .31, .13)),
}


def anchor(label, x, y, z, aperture):
    obj = bpy.data.objects.new('Exhaust_' + label, None)
    F.ship.objects.link(obj)
    obj.location = F.C((x, y, z))
    obj.empty_display_type = 'ARROWS'
    obj.empty_display_size = .18
    obj['game_position'] = [x, y, z]
    obj['aperture_metres'] = aperture
    F.anchors[obj.name] = [x, y, z]


def slot_engine(label, x, y, z, width, height):
    """Simple serviceable letterbox nozzle, with a recessed luminous throat."""
    F.duct('Cast nozzle housing ' + label, x, y,
           [(z + .64, width * 1.06, height * 1.18),
            (z + .12, width * 1.04, height * 1.06)], 'carbon', True)
    F.oct_annulus('Brushed nozzle lip ' + label, x, y, z,
                  (width, height), (width * .86, height * .74), 'metal', .006, .12)
    F.duct('Deep exhaust throat ' + label, x, y,
           [(z + .04, width * .855, height * .735),
            (z + .43, width * .76, height * .52)], 'vent', False, True, .004)
    F.oct_annulus('Recessed ion collar ' + label, x, y, z + .045,
                  (width * .79, height * .58), (width * .75, height * .40), 'cyan', .002)
    F.beam('Ion discharge slot ' + label,
           (x - width * .65, y, z + .07), (x + width * .65, y, z + .07),
           height * .18, .018, 'cyan', .002)
    anchor(label, x, y, z - .015, [width * 2, height * 2])


def round_duct(name, cx, cy, stations, mat, caps=False):
    count = 24
    vertices = []
    for z, radius in stations:
        vertices.extend((cx + math.cos(j * 2 * math.pi / count) * radius,
                         cy + math.sin(j * 2 * math.pi / count) * radius, z)
                        for j in range(count))
    faces = []
    for k in range(len(stations) - 1):
        for j in range(count):
            n = (j + 1) % count
            faces.append((k * count + j, k * count + n,
                          (k + 1) * count + n, (k + 1) * count + j))
    if caps:
        faces.extend([tuple(range(count - 1, -1, -1)),
                      tuple(range((len(stations) - 1) * count, len(stations) * count))])
    return F.mesh(name, vertices, faces, mat, 0, True)


def round_ring(name, cx, cy, z, outer, inner, mat, depth=.06):
    return round_duct(name, cx, cy,
                      [(z + depth, outer), (z, outer), (z, inner), (z + depth, inner)], mat)


def canopy(length, width, z, base, rise):
    """Low angular glasshouse; broad flat windscreen and visible service frame."""
    profile = [(z + length / 2, width * .75, base + .018, base + .028, base),
               (z + length * .10, width, base + rise * .53, base + rise, base),
               (z - length * .32, width * .85, base + rise * .57, base + rise * .92, base),
               (z - length / 2, width * .72, base + .10, base + .18, base)]
    F.loft('Angular cockpit gasket', profile, 'carbon', bevel=.022)
    glass = [(zz, w * .925, shoulder + .016, top + .016, bottom + .025)
             for zz, w, shoulder, top, bottom in profile]
    F.loft('Faceted smoked cockpit', glass, 'glass', bevel=.006)
    for sign in (-1, 1):
        F.line('Cockpit sill', [(sign * w, shoulder, zz) for zz, w, shoulder, top, bottom in profile], .018, 'edge')
        F.line('Cockpit roof frame', [(sign * w * .6, top + .026, zz) for zz, w, shoulder, top, bottom in profile], .015, 'metal')
    for i in (0, 1, 2, 3):
        zz, w, shoulder, top, bottom = profile[i]
        F.line('Cockpit transverse frame', [(-w, shoulder, zz), (-w * .6, top + .027, zz),
                                            (w * .6, top + .027, zz), (w, shoulder, zz)], .016, 'edge')


def top_height(objects, x, z):
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    hits = [BVHTree.FromObject(obj, deps).ray_cast(Vector(F.C((x, 3, z))), Vector((0, 0, -1)), 4)[0]
            for obj in objects]
    hits = [p.z for p in hits if p is not None]
    return max(hits) if hits else None


def cut_vent(shell, x, z, width, length):
    height = top_height([shell], x, z - length / 2)
    if height is None:
        raise ValueError('Cooling vent does not lie on its shell')
    bpy.ops.mesh.primitive_cube_add(size=1, location=F.C((x, height, z - length / 2)))
    cutter = bpy.context.object
    cutter.dimensions = (width, length, 1.6)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    cut = shell.modifiers.new('Open cooling pocket', 'BOOLEAN')
    cut.operation = 'DIFFERENCE'
    cut.object = cutter
    bpy.context.view_layer.objects.active = shell
    bpy.ops.object.modifier_apply(modifier=cut.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    F.vent('Inset radiator cassette', x, height - .048, z - .02, width - .035, length - .04)


def service_panel(shell, name, outline, material='edge', lift=.02):
    """Form a raised, closed panel over the actual curved armour surface."""
    count = 6
    vertices = []
    for layer in (0, 1):
        for row in range(count):
            for col in range(count):
                u, v = col / (count - 1), row / (count - 1)
                x, z = [outline[0][k]*(1-u)*(1-v) + outline[1][k]*u*(1-v)
                        + outline[2][k]*u*v + outline[3][k]*(1-u)*v for k in (0, 1)]
                height = top_height([shell], x, z)
                if height is None:
                    raise ValueError(f'Panel {name} outside shell at {x}, {z}')
                vertices.append((x, height + lift - layer*.015, z))
    faces = []
    for layer in (0, 1):
        for row in range(count - 1):
            for col in range(count - 1):
                i = layer*count*count + row*count + col
                faces.append((i, i+1, i+count+1, i+count))
    boundary = list(range(count)) + [r*count+count-1 for r in range(1,count)]
    boundary += list(range(count*count-2,count*(count-1)-1,-1))
    boundary += [r*count for r in range(count-2,0,-1)]
    for i, a in enumerate(boundary):
        b = boundary[(i+1) % len(boundary)]
        faces.append((a, b, b+count*count, a+count*count))
    F.mesh(name, vertices, faces, material)


def rook():
    stations = [(3.12, .57, .29, .34, .14), (2.60, 1.0, .38, .47, .10),
                (1.42, 1.53, .43, .59, .09), (.02, 1.93, .48, .68, .09),
                (-1.51, 1.82, .50, .72, .12), (-2.97, 1.53, .45, .61, .17)]
    F.loft('Low clipped delta chassis', stations, 'carbon', bevel=.025)
    shell = F.loft('Continuous olive wedge armour',
                   [(z, w * .995, y + .10, t + .10, y + .028) for z, w, y, t, b in stations],
                   'pearl', bevel=.025)
    canopy(2.38, .52, -.15, .79, .47)
    service_panel(shell, 'Central forward inspection cover',
                  [(-.27, 2.83), (.27, 2.83), (.43, 1.16), (-.43, 1.16)], 'carbon')
    service_panel(shell, 'Aft power distribution cover',
                  [(-.44, -1.52), (.44, -1.52), (.40, -2.76), (-.40, -2.76)], 'carbon')
    F.vent('Power distribution heat sink', 0, .85, -1.70, .56, .71)
    for sign in (-1, 1):
        service_panel(shell, 'Shoulder access plate',
                      [(sign*.79, .44), (sign*1.10, .32), (sign*1.23, -.65), (sign*.83, -.62)])
        F.beam('Transom service spar', (sign*.40, .83, -2.67),
               (sign*1.48, .65, -2.67), .09, .07, 'metal', .009)
        cut_vent(shell, sign * 1.17, -1.35, .41, .91)
        F.beam('Exposed rear protective rail', (sign * 1.52, .40, -1.62),
               (sign * 1.51, .38, -2.92), .10, .14, 'metal', .018)
        F.oct_annulus('Forward grille surround', sign * .37, .30, 3.142,
                      (.18, .10), (.148, .069), 'metal', .004, -.03)
        F.duct('Forward grille recess', sign * .37, .30,
               [(3.135, .148, .069), (3.11, .148, .069)], 'vent', True, True, .001)
        for j in (-1, 0, 1):
            F.beam('Front grille blade', (sign * .37 - .135, .30 + j * .035, 3.152),
                   (sign * .37 + .135, .30 + j * .035, 3.152), .008, .01, 'darkmetal', .001)
        slot_engine('L' if sign < 0 else 'R', sign * .63, .43, -3.12, .48, .235)
        F.line('Recessed induction side light', [(sign * 1.69, .16, .02),
                                                (sign * 1.61, .16, -.96)], .012, 'dimcyan')
    return shell


def latch():
    stations = [(3.22, .32, .28, .35, .13), (2.58, .40, .37, .48, .08),
                (1.30, .46, .46, .56, .08), (-.52, .45, .48, .59, .09),
                (-2.86, .27, .34, .44, .15)]
    F.loft('Narrow central chassis', stations, 'carbon', bevel=.025)
    shell = F.loft('Central blue service tub',
                   [(z, w, y + .10, t + .10, y + .025) for z, w, y, t, b in stations], 'pearl', bevel=.022)
    canopy(1.63, .32, 1.07, .66, .34)
    cut_vent(shell, 0, -1.22, .28, .74)
    F.mirrored_panel('Straight forward stabiliser', [(.37, .31, 1.97), (2.0, .27, 1.65),
                                                  (2.0, .27, 1.23), (.37, .31, 1.45)], .095, 'pearl', .018)
    for sign in (-1, 1):
        x, y = sign * 1.30, .61
        for z in (.36, -1.89):
            F.beam('Straight nacelle cross spar', (sign * .34, .32, z), (x, .35, z), .20, .17, 'metal', .018)
            F.line('Exposed cross spar conduit', [(sign * .37, .20, z), (x, .23, z)], .025, 'carbon')
        round_duct('Exposed cylindrical engine core', x, y,
                    [(1.0, .28), (.48, .42), (-2.70, .43), (-2.88, .39)], 'carbon', True)
        round_duct('Forward replaceable blue cowling', x, y,
                    [(1.0, .31), (.63, .43), (.08, .515), (-.18, .525)], 'pearl')
        round_duct('Aft replaceable blue cowling', x, y,
                    [(-.86, .53), (-2.32, .53), (-2.62, .47)], 'pearl')
        for z, r in ((.07, .526), (-1.97, .54)):
            round_duct('Faded service band', x, y, [(z, r), (z - .16, r)], 'accent')
        for a in (1, 5, 9, 13, 17, 21):
            angle = a * math.tau / 24
            dx, dy = math.cos(angle)*.535, math.sin(angle)*.535
            F.line('Cowling service seam', [(x+dx, y+dy, -.89), (x+dx, y+dy, -1.96)], .005, 'edge')
        F.beam('Turbine dorsal service cover', (x, 1.152, -1.01),
               (x, 1.152, -1.70), .21, .024, 'edge', .006)
        for a in range(10):
            angle = a * math.tau / 10
            dx, dy = math.cos(angle) * .446, math.sin(angle) * .446
            F.beam('Exposed longitudinal engine rib', (x + dx, y + dy, -.21),
                   (x + dx, y + dy, -.82), .025, .028, 'metal', .004)
        for z, outer, inner in [(1.015, .313, .25), (-2.75, .47, .42), (-3.21, .425, .345)]:
            round_ring('Machined engine retention ring', x, y, z, outer, inner, 'metal')
        round_duct('Rear exhaust cavity', x, y, [(-3.20, .343), (-2.94, .28)], 'vent')
        round_ring('Recessed rear ion annulus', x, y, -3.09, .315, .283, 'cyan', .025)
        round_duct('Inner ion chamber', x, y, [(-2.99, .18), (-2.96, .18)], 'cyan', True)
        round_duct('Dark inner engine wall', x, y, [(-2.91, .281), (-2.88, .281)], 'vent', True)
        round_ring('Front intake status ring', x, y, 1.012, .244, .23, 'dimcyan', .015)
        for blade in range(8):
            angle = blade*math.tau/8
            F.beam('Intake radial vane', (x+math.cos(angle)*.07, y+math.sin(angle)*.07, 1.021),
                   (x+math.cos(angle+.15)*.22, y+math.sin(angle+.15)*.22, 1.021), .025, .025, 'metal', .002)
        anchor('L' if sign < 0 else 'R', x, y, -3.225, [.85, .85])
    return shell


def capsule(name, stations, mat):
    count = 20
    vertices = []
    for z, width, bottom, top in stations:
        for j in range(count):
            angle = j * math.tau / count
            x = width * math.cos(angle)
            height = bottom + (top - bottom) * ((math.sin(angle) + 1) / 2) ** .67
            vertices.append((x, height, z))
    faces = [tuple(range(count - 1, -1, -1)), tuple(range((len(stations)-1)*count, len(stations)*count))]
    for i in range(len(stations) - 1):
        for j in range(count):
            n = (j + 1) % count
            faces.append((i*count+j, i*count+n, (i+1)*count+n, (i+1)*count+j))
    return F.mesh(name, vertices, faces, mat, .012, True)


def mule():
    profile = [(2.90, .73), (2.73, 1.08), (2.40, 1.44), (1.70, 1.73),
               (.62, 1.84), (-.78, 1.83), (-1.77, 1.69), (-2.46, 1.48), (-2.85, 1.25)]
    capsule('Rounded continuous lower tub', [(z*.985, w*.98, .10, .52) for z, w in profile], 'carbon')
    shell = capsule('Wraparound warm ceramic shell',
                    [(z, w * .993, .38, .69 if z > 2.5 else .86 if z > -2 else .79) for z, w in profile], 'pearl')
    canopy(2.02, .63, .94, .84, .40)
    spine = F.loft('Raised aft service spine', [(-.18, .55, .81, .98, .73),
                    (-1.27, .53, .85, .99, .72), (-2.59, .40, .77, .85, .65)], 'pearl', bevel=.027)
    cut_vent(spine, 0, -1.65, .56, .64)
    service_panel(shell, 'Forward maintenance hatch',
                  [(-.35, 2.57), (.35, 2.57), (.42, 2.15), (-.42, 2.15)])
    service_panel(spine, 'Raised battery cover',
                  [(-.36, -.32), (.36, -.32), (.35, -1.13), (-.35, -1.13)], 'edge')
    for sign in (-1, 1):
        service_panel(shell, 'Side crash structure access panel',
                      [(sign*.96, 1.74), (sign*1.35, 1.48), (sign*1.48, .64), (sign*1.12, .68)])
        cut_vent(shell, sign * 1.25, -.13, .34, .63)
        cut_vent(shell, sign * 1.11, -1.23, .33, .54)
        F.loft('Rear transom corner bumper', [(-2.03, .11, .49, .78, .23),
                 (-2.77, .14, .48, .82, .21), (-2.94, .10, .40, .63, .24)], 'carbon', sign * 1.22, .04)
        F.beam('Forward service light bezel', (sign * .78 - .20, .39, 2.80),
               (sign * .78 + .20, .39, 2.80), .055, .06, 'metal', .007)
        F.beam('Forward running light', (sign * .78 - .16, .40, 2.817),
               (sign * .78 + .16, .40, 2.817), .018, .026, 'dimcyan', .003)
        F.line('Induction skirt light', [(sign * 1.68, .21, .65), (sign * 1.67, .21, -.65)], .012, 'dimcyan')
    slot_engine('C', 0, .43, -3.01, 1.10, .24)
    return shell


def details(id):
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    trees = [BVHTree.FromObject(o, deps) for o in F.ship.objects
             if o.type == 'MESH' and o.data.materials[0] == F.M['pearl']]

    def height(x, z):
        hits = [tree.ray_cast(Vector(F.C((x, 3, z))), Vector((0, 0, -1)), 4)[0] for tree in trees]
        hits = [p.z for p in hits if p is not None]
        return max(hits) if hits else None

    def seam(coords):
        points = []
        for a, b in zip(coords, coords[1:]):
            for j in range(10):
                t = j / 9
                x, z = a[0]*(1-t)+b[0]*t, a[1]*(1-t)+b[1]*t
                h = height(x, z)
                if h is not None:
                    points.append((x, h + .003, z))
        if len(points) > 1:
            F.line('Recessed service panel seam', points, .0035, 'edge')

    def paint(coords):
        bm = bmesh.new()
        points = []
        for x, z in coords:
            h = height(x, z)
            if h is None:
                raise ValueError(f'Livery outside hull: {id} at {x}, {z}')
            points.append(bm.verts.new(F.C((x, h + .005, z))))
        bm.faces.new(points)
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=5, use_grid_fill=True)
        for v in bm.verts:
            h = height(v.co.x, -v.co.y)
            if h is not None:
                v.co.z = h + .005
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        mesh = bpy.data.meshes.new('Faded maintenance marking')
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(mesh.name, mesh)
        F.ship.objects.link(obj)
        mesh.materials.append(F.M['accent'])

    for sign in (-1, 1):
        if id == 'rook':
            for z in (2.01, .54, -.58, -1.69):
                seam([(sign*.64, z), (sign*1.02, z-.06), (sign*1.51, z-.23)])
            seam([(sign*.63, 2.23), (sign*.91, .79), (sign*1.10, -.41)])
            for a, b in ((1.90, .71), (-.64, -1.13)):
                paint([(sign*.99, a), (sign*1.15, a-.04), (sign*1.52, b), (sign*1.34, b+.02)])
            rivets = [(sign*.74, 1.79), (sign*1.67, -.35), (sign*1.58, -1.74)]
        elif id == 'latch':
            for z in (2.59, 2.22, -.70, -2.27):
                seam([(sign*.06, z), (sign*.31, z-.03), (sign*.39, z-.10)])
            paint([(sign*1.69, 1.69), (sign*1.84, 1.66), (sign*1.84, 1.28), (sign*1.69, 1.30)])
            rivets = [(sign*.31, 2.39), (sign*.29, -.52), (sign*1.77, 1.46)]
        else:
            for z in (1.86, -.62, -2.04):
                seam([(sign*.69, z), (sign*1.15, z-.05), (sign*1.65, z-.28)])
            seam([(sign*1.05, 1.93), (sign*1.41, 1.11), (sign*1.49, .34)])
            for z in (1.45, -1.02):
                paint([(sign*1.43, z), (sign*1.72, z-.02), (sign*1.72, z-.18), (sign*1.43, z-.15)])
            rivets = [(sign*.77, 1.94), (sign*1.57, .04), (sign*1.30, -2.00)]
        for x, z in rivets:
            h = height(x, z)
            if h is None:
                continue
            bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=.016, depth=.006,
                                                location=F.C((x, h + .007, z)))
            obj = bpy.context.object
            for col in list(obj.users_collection):
                col.objects.unlink(obj)
            F.ship.objects.link(obj)
            obj.name = 'Flush panel fastener'
            obj.data.materials.append(F.M['metal'])
        x = sign * (.36 if id == 'latch' else .86)
        F.solid('Replaceable induction shoe', [(x-.09, .083, 1.50), (x+.09, .083, 1.50),
                                             (x+.09, .083, -1.84), (x-.09, .083, -1.84)], .055, 'darkmetal', .006)


def studio(scene):
    collection = bpy.data.collections.new('STUDIO | excluded from GLB')
    scene.collection.children.link(collection)
    world = bpy.data.worlds.new('Neutral industrial studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.30, .34, .38, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .3
    scene.world = world

    def aim(obj, target=(0, .5, 0)):
        obj.rotation_euler = (Vector(F.C(target)) - obj.location).to_track_quat('-Z', 'Y').to_euler()

    for name, pos, power, size, color in [
        ('Key', (-4, 7, 5), 1600, 6, (1, .93, .83)),
        ('Fill', (5, 5, 0), 1000, 5, (.74, .86, 1)),
        ('Rim', (-2, 4, -6), 1450, 4, (.88, .93, 1)),
    ]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.size, data.color = power, size, color
        obj = bpy.data.objects.new(name, data)
        collection.objects.link(obj)
        obj.location = F.C(pos)
        aim(obj)
    camera = bpy.data.objects.new('Studio camera', bpy.data.cameras.new('Studio camera'))
    collection.objects.link(camera)
    camera.location = F.C((8.3, 6.8, 10.6))
    camera.data.lens = 58
    aim(camera)
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1200, 900
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'AgX'
    scene.render.image_settings.file_format = 'PNG'
    return camera, aim


def build(id, render=False):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    F.ship = bpy.data.collections.new(id.upper() + ' | editable rival components')
    scene.collection.children.link(F.ship)
    F.anchors = {}
    paint, accent = PALETTES[id]
    palette = {'pearl': (paint, .20, .46), 'carbon': ((.031, .039, .041), .35, .46),
               'metal': ((.25, .27, .26), .85, .34), 'edge': ((.075, .088, .088), .66, .36),
               'vent': ((.008, .012, .014), .18, .49), 'glass': ((.011, .020, .024), .55, .17),
               'accent': (accent, .18, .49)}
    F.M = {name: F.material(id + '_' + ('Ceramic' if name == 'pearl' else name), *values)
           for name, values in palette.items()}
    F.M['darkmetal'] = F.M['edge']
    F.M['cyan'] = F.material(id + '_Ion', (.014, .09, .11), .25, .30, ((.10, .55, .72), 2.0))
    F.M['dimcyan'] = F.material(id + '_Induction', (.01, .04, .05), .25, .34, ((.035, .27, .37), .7))
    globals()[id]()
    details(id)
    directory = HERE / id
    directory.mkdir(parents=True, exist_ok=True)
    textures = directory / 'textures'
    textures.mkdir(exist_ok=True)
    finishes = {F.M[kind].name: F.surface_finish(F.M[kind], kind) for kind in ('pearl', 'carbon', 'metal')}
    camera, aim = studio(scene)
    scene.unit_settings.system = 'METRIC'
    scene['asset'] = id
    scene['design_reference'] = 'concept-01.png'
    scene['coordinate_contract'] = 'metres; exported +Z forward, +Y up; exhaust aft -Z'
    scene['integration'] = 'Asset-only rival draft; not registered in gameplay or the player fleet'
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(directory / (id + '.blend')))
    components = list(F.ship.objects)
    copies = []
    for obj in components:
        dup = obj.copy()
        if obj.data:
            dup.data = obj.data.copy()
        scene.collection.objects.link(dup)
        copies.append(dup)
        if obj.type == 'EMPTY':
            obj.name = 'SOURCE_' + obj.name
            dup.name = obj.name.replace('SOURCE_', '')
        obj.hide_render = True
    bpy.ops.object.select_all(action='DESELECT')
    for obj in copies:
        if obj.type in ('MESH', 'CURVE'):
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.convert(target='MESH')
            obj.select_set(False)
    groups = {}
    empties = [obj for obj in copies if obj.type == 'EMPTY']
    for obj in copies:
        if obj.type == 'MESH':
            groups.setdefault(obj.data.materials[0].name, []).append(obj)
    joined = []
    for name, objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        obj = bpy.context.object
        obj.name = name + '_Geometry'
        material = obj.data.materials[0]
        obj.data.materials.clear()
        obj.data.materials.append(material)
        for polygon in obj.data.polygons:
            polygon.material_index = 0
        tri = obj.modifiers.new('Export triangles', 'TRIANGULATE')
        bpy.ops.object.modifier_apply(modifier=tri.name)
        joined.append(obj)
        if name in finishes:
            F.bake_finish(obj, obj.data.materials[0], finishes[name], textures,
                          1024 if 'Ceramic' in name else 512)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in joined + empties:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = joined[0]
    output = directory / (id + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=True, export_extras=True,
                              export_cameras=False, export_lights=False, export_animations=False)
    runtime_output = ROOT / 'public/assets/ships/rivals' / id / (id + '.glb')
    runtime_output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(output, runtime_output)
    vertices = [obj.matrix_world @ vertex.co for obj in joined for vertex in obj.data.vertices]
    points = [(v.x, v.z, -v.y) for v in vertices]
    bounds = {'min': [min(p[k] for p in points) for k in range(3)],
              'max': [max(p[k] for p in points) for k in range(3)]}
    report = {'asset': id, 'status': 'asset-only draft', 'blender': bpy.app.version_string,
              'axes': '+Z forward / +Y up / metres', 'bounds': bounds,
              'dimensions': [bounds['max'][k] - bounds['min'][k] for k in range(3)],
              'triangles': sum(len(obj.data.polygons) for obj in joined),
              'meshes': len(joined), 'materials': len(joined), 'sourceComponents': len(components),
              'anchors': F.anchors, 'glbBytes': output.stat().st_size, 'textureCount': len(finishes) * 3,
              'textures': 'Embedded original baked base-color, roughness and tangent normals'}
    (directory / 'asset-manifest.json').write_text(json.dumps(report, indent=2) + '\n')
    print('RIVAL_ASSET ' + json.dumps(report), flush=True)
    if render:
        output = ROOT / '.experiments/rival-blender' / id
        output.mkdir(parents=True, exist_ok=True)
        for name, position in [('front', (8.3, 6.8, 10.6)), ('rear', (7, 5, -10))]:
            camera.location = F.C(position)
            aim(camera)
            scene.render.filepath = str(output / (name + '.png'))
            bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--ship', choices=['rook', 'latch', 'mule', 'all'], default='all')
    parser.add_argument('--render', action='store_true')
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    for ship_id in (['rook', 'latch', 'mule'] if options.ship == 'all' else [options.ship]):
        build(ship_id, options.render)
