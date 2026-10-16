"""An occupied pressure-exchange hall keyed into the Canal's existing cut bank.

Production Y-up metres. This replaces the central repeated gallery panels;
roof, machinery, access floors and rock-keyed corbels are actual geometry.
The caller supplies the common deterministic builder and owns export/lifetime.
"""
import math


def build_canal_exchange(c):
    V, up = c['Vector'], c['UP']
    along = V((1, 0, .315)).normalized()
    out = V((-along.z, 0, along.x))
    axes = (along, up, out)
    origin = V((-478, 0, 3355))
    box, mesh, cylinder = c['box'], c['mesh'], c['cylinder']
    concrete, aggregate, brick, plaster, iron, steel, enamel, zinc, glass, dim, warm, fixture = (
        c[k] for k in ('concrete', 'aggregate', 'brick', 'plaster', 'iron', 'steel',
                      'enamel', 'zinc', 'glass', 'dim', 'warm', 'fixture'))
    first_object, first_solid = len(c['objects']), len(c['solids'])

    def p(x, y, z):
        return origin + along * x + up * y + out * z

    def part(name, x, y, z, dims, material, solid=False, bevel=0):
        return box('Canal exchange / ' + name, p(x, y, z), dims, material, axes, solid, bevel)

    def beam(name, a, b, width, depth, material=steel, solid=False):
        a, b = p(*a), p(*b)
        direction = (b - a).normalized()
        cross = direction.cross(out)
        if cross.length < .01:
            cross = along.copy()
        cross.normalize()
        return box('Canal exchange / ' + name, (a + b) / 2,
                   (width, (b - a).length, depth), material,
                   (cross, direction, cross.cross(direction).normalized()), solid, .08)

    def glazing(name, x, y, z, width, height, columns, rows, seed=0):
        part(name + ' deep reveal', x, y, z, (width + .9, height + .9, .7), iron)
        pitch_x, pitch_y = width / columns, height / rows
        for row in range(rows):
            for col in range(columns):
                xx, yy = x + (col - (columns - 1) / 2) * pitch_x, y + (row - (rows - 1) / 2) * pitch_y
                material = warm if (col + row + seed) % 5 == 0 else dim if (col + seed) % 3 else glass
                part(name + ' control station occupied window', xx, yy, z - .39,
                     (pitch_x - .18, pitch_y - .22, .055), material)
        for col in range(1, columns):
            part(name + ' iron mullion', x - width / 2 + col * pitch_x, y, z - .48,
                 (.13, height, .16), iron)
        for row in range(1, rows):
            part(name + ' iron transom', x, y - height / 2 + row * pitch_y, z - .48,
                 (width, .16, .16), iron)

    # Leave the outer two old gallery bays as a connected public approach.
    # Their continuation makes the larger machinery building part of a district.
    for bay in [0, 3]:
        q = origin + along * (bay * 71 + 35.5)
        for level, y in enumerate([1255, 1290, 1325]):
            if bay == 3 and level == 2:
                continue
            c['recessed_civil_gallery']('Canal far-bank approach galleries', V((q.x, y, q.z)), 72, axes, bay + level)
        x = bay * 71
        vs = [tuple(p(x + dx, y, z)) for dx in [-5.5, 5.5]
              for y, z in [(1208, -4), (1350, -17), (1350, 36), (1208, 36)]]
        mesh('Canal approach rock-keyed buttress', vs,
             [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
              (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], concrete, True)

    # Broad corbels connect the forward building floor to rock behind it.
    # They stop inside the cliff instead of standing on 600 m display stilts.
    for x, width in [(79, 14), (116, 12), (153, 14), (183, 10), (207, 10)]:
        vs = [tuple(p(x + dx, y, z)) for dx in [-width / 2, width / 2]
              for y, z in [(1246, -47), (1246, 47), (1148, 47), (1208, -8)]]
        mesh('Canal exchange / rock-keyed raking bearing', vs,
             [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
              (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], aggregate, True, .22)
    part('continuous structural transfer floor', 143, 1247, -3, (144, 4, 91), concrete, True, .18)
    # Tall main chamber: a real clear opening, with three-dimensional reveals,
    # structural crown and a roof above the visible machinery.
    part('machine hall rear masonry', 116, 1293, 7, (88, 88, 40), brick, True, .18)
    for x in [75.5, 156.5]:
        part('machine hall loadbearing cheek', x, 1293, -28, (7, 88, 32), concrete, True, .2)
    part('machine hall upper lintel', 116, 1333, -28, (88, 8, 36), concrete, True, .2)
    part('machine hall dark rear recess', 116, 1289, -13.3, (73, 77, .4), iron)
    # Occupied intermediate galleries show the scale of the pressure equipment.
    for level, y in enumerate([1251, 1280, 1317]):
        part('rear machinery access floor', 116, y, -18, (73, .8, 10), concrete, True)
        part('rear gallery handrail', 116, y + 1.1, -23.1, (72, .10, .14), iron)
        for x in [83, 94, 105, 116, 127, 138, 149]:
            part('gallery railing upright', x, y + .6, -23.1, (.12, 1.2, .12), iron)
        for x in [86, 146]:
            glazing('recessed service cabin', x, y + 4.0, -13.7, 12, 5.4, 4, 2, level)
        for x in [81, 151]:
            part('side access gallery', x, y, -32, (3.2, .8, 27), iron, True)
    # The two pressure trunks end inside equipment in the open hall rather than
    # running past it as isolated poles. Saddles lock both trunks to the bank.
    for index, x in enumerate([98, 135]):
        top = 1413 if index == 0 else 1387
        bottom = 1276
        cylinder('Canal exchange / descending pressure trunk', p(x, (top + bottom) / 2, -24),
                 5.6, top - bottom, steel, up, 28, True)
        for y in range(1296, top, 24):
            cylinder('Canal exchange / bolted pressure coupling', p(x, y, -24), 6.15, 1.3, iron, up, 28)
            part('pressure trunk rock saddle', x, y, 10, (13, 3.0, 69), concrete, True)
        # Cast elbow chamber and transverse rotor casing retain broad surfaces
        # around a smaller shaft and real bolted front cover.
        cylinder('Canal exchange / pressure collector casing', p(x, 1275, -24), 10.5, 21, enamel, out, 40, True)
        cylinder('Canal exchange / collector flange', p(x, 1275, -35.2), 11.3, 1.6, iron, out, 40)
        cylinder('Canal exchange / shaft cover', p(x, 1275, -36.5), 7.9, 1.1, steel, out, 40)
        for k in range(12):
            angle = k * math.tau / 12
            cylinder('Canal exchange / collector cover fastener', p(x + math.cos(angle) * 9.6, 1275 + math.sin(angle) * 9.6, -36.4), .28, .6, c['wear'], out, 8)
        part('collector bearing bed', x, 1260, -23, (23, 8, 26), concrete, True)
    # An overhead traveling crane spans the open machine bay. Its bearing
    # rails, bridge and suspended block make the tall cavity a working volume.
    for x in [82, 150]:
        part('overhead crane bearing rail', x, 1315, -28, (2.2, 2.5, 29), iron, True)
        for z in [-39, -18]:
            beam('crane rail masonry knee', (x, 1308, z), (x, 1314, z - 3), 1.2, 1.8, concrete)
    part('traveling crane box girder', 116, 1318, -39, (70, 4.5, 5), steel, True, .12)
    part('traveling crane bottom flange', 116, 1315.7, -39, (71, .65, 6.5), iron)
    part('overhead hoist trolley', 119, 1321.3, -39, (8, 2.3, 6.8), enamel)
    for x in [117.6, 120.4]:
        cylinder('Canal exchange / hoist cable', p(x, 1304, -39), .10, 24, iron, up, 8)
    part('suspended service lifting block', 119, 1291.2, -39, (4.3, 2.4, 3.2), steel)
    glazing('upper operating gallery', 116, 1306, -13.8, 57, 6, 18, 2, 4)
    # Low downstream wing and a deep glazed connecting gallery establish the
    # unequal silhouette; the entire frontage is no longer a repeated rack.
    part('downstream brick service range', 193, 1266, -12, (40, 34, 49), brick, True, .16)
    part('downstream service cornice', 193, 1283.7, -12, (43, 1.5, 52), concrete, True, .12)
    for y in [1254, 1260, 1266, 1272, 1278]:
        glazing('downstream working rooms', 193, y, -36.9, 34, 3.8, 10, 1, round(y))
    part('recessed connecting gallery floor', 166.5, 1280, -17, (13, 1, 27), concrete, True)
    part('connecting gallery rear wall', 166.5, 1285, -5, (13, 9, 3), brick, True)
    glazing('deep connecting gallery', 166.5, 1285, -6.8, 11.2, 6.2, 4, 2)
    part('connecting gallery roof', 166.5, 1290, -17, (13, 1, 28), zinc, True)
    # Thin roof shells, standing seams and a raised occupied monitor belong to
    # the same structure; no giant detached cap or default flat-colored slab.
    for label, x, width, z, depth, eave, rise in [
        ('main hall zinc roof', 116, 91, -12, 69, 1338, 9),
        ('service wing zinc roof', 193, 44, -12, 54, 1285, 5),
    ]:
        vertices = [tuple(p(x + xx, eave + yy, z + zz)) for xx in [-width / 2, width / 2]
                    for zz, yy in [(-depth / 2, 0), (0, rise), (depth / 2, 0)]]
        mesh('Canal exchange / ' + label, vertices,
             [(0, 1, 4, 3), (1, 2, 5, 4), (0, 3, 5, 2), (0, 2, 1), (3, 4, 5)], zinc, True)
        for xx in range(-int(width / 2) + 2, int(width / 2), 4):
            for side in [-1, 1]:
                beam(label + ' seam', (x + xx, eave + .15, z + side * depth / 2),
                     (x + xx, eave + rise + .15, z), .10, .13, zinc)
    part('main occupied roof monitor', 126, 1348.5, -17, (42, 6, 16), plaster, True, .12)
    glazing('raised roof control room', 126, 1348.5, -25.15, 37, 4.4, 12, 1)
    part('monitor roof cap', 126, 1352, -17, (45, .8, 18), zinc, True, .08)
    part('front maintenance balcony', 143, 1250, -46, (145, 1, 7), concrete, True, .1)
    part('front balcony continuous handrail', 143, 1251.6, -49.2, (144, .14, .16), iron)
    for x in range(72, 215, 7):
        part('front balcony rail post', x, 1251, -49.2, (.14, 1.5, .14), iron)
    for x, y, z, power, radius in [(117, 1324, -32, 2100, 70), (192, 1281, -42, 750, 40)]:
        ceiling = 1329 if power == 2100 else 1283.7
        part('worklight ceiling hanger', x, (ceiling + y) / 2, z, (.22, ceiling - y, .22), iron)
        part('shielded interior worklight', x, y, z, (3.0, .8, 1.8), iron)
        part('recessed worklight lens', x, y - .45, z, (2.5, .1, 1.2), fixture)
        c['lights'].append({'p': list(p(x, y - 1.2, z)), 'power': power,
                            'color': '#e6cda5', 'radius': radius, 'pocket': True,
                            **({'focusRange': [9200, 10180]} if power == 2100 else {})})
    return {'newObjects': len(c['objects']) - first_object,
            'newSolids': len(c['solids']) - first_solid,
            'frontage': [71, 215], 'mainHallRoof': 1347,
            'serviceWingRoof': 1290, 'clearMainBayWidth': 74,
            'clearMainBayDepth': 29, 'pressureTrunks': 2}
