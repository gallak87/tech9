"""Buttressed inspection galleries along Nightweir's great spillway basin.

Invoked by the deterministic city builder, with its authored materials and
clearance functions. Road and flight geometry remain the source of truth.
"""
from mathutils import Vector


def build_spillway(c):
    route, near, land_height = c['route'], c['near'], c['land_height']
    box, mesh, clear = c['box'], c['mesh'], c['clear']
    concrete, aggregate = c['concrete'], c['aggregate']
    iron, glass, dim = c['iron'], c['glass'], c['dim']
    limestone, fixture = c['limestone'], c['fixture']
    up = Vector((0, 1, 0))
    jump = next(j for j in route['jumps'] if j['id'] == 'spillway-leap')
    origin = Vector(near(jump['landingStart'])['p'])
    forward = Vector(near(jump['takeoff'])['t']); forward.y = 0; forward.normalize()
    right = up.cross(forward).normalized()
    count = 0
    for side in [-1, 1]:
        out = right * side
        axes = (forward, up, out)
        for bay in range(6):
            station = jump['landingStart'] + 45 + bay * 142
            road = Vector(near(station)['p'])
            center = origin + forward * (45 + bay * 140) + out * (275 if side < 0 else 305)
            center.y = road.y + (5 if side < 0 else 23)
            floor = max(c['bed'](center.z) + 8, land_height(center.x, center.z) - 12)
            bottom = min(center.y - 35, floor)
            height = center.y - bottom
            envelope = center - up * (height / 2 - 12)
            if not clear(envelope, (148, height + 35, 95), axes):
                continue
            count += 1
            # A deep continuous gallery ties tapered piers into the rock bank.
            # Open bay fronts expose their depth; there is no kilometre-high
            # blank rectangular pedestal beneath a detached building.
            box('spillway gallery continuous service slab', center - up * 1.5,
                (145, 3, 31), concrete, axes, True, .25)
            box('spillway gallery back retaining beam', center + out * 11 - up * 12,
                (145, 24, 8), aggregate, axes, True, .3)
            for x in [-59, -20, 20, 59]:
                p = center + forward * x
                top_front = p - out * 15 - up * 3
                top_back = p + out * 13 - up * 3
                foot_front = Vector((p.x, bottom, p.z)) - out * 48
                foot_back = Vector((p.x, bottom, p.z)) + out * 13
                verts = [tuple(q + forward * dx) for dx in [-4.5, 4.5]
                         for q in [top_front, top_back, foot_back, foot_front]]
                mesh('spillway tapered load-bearing buttress', verts,
                     [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                      (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], concrete, True, .25)
            # Two occupied service levels, thin coping and real shadowed bays
            # supply human scale along the larger civil-engineering profile.
            back = center + out * 7 + up * 7
            box('spillway inspection gallery rear', back, (141, 14, 10), aggregate, axes, True, .15)
            for level in [0, 1]:
                y = 3.6 + level * 4.2
                for i in range(17):
                    q = center + forward * ((i - 8) * 8) - out * 1.4 + up * y
                    box('spillway inspection window reveal', q, (3.0, 2.8, .35), iron, axes)
                    box('spillway inspection occupied window', q - out * .2,
                        (2.55, 2.4, .05), dim if (i + bay + side) % 4 == 0 else glass, axes)
            for x in range(-68, 69, 17):
                box('spillway service gallery front column', center + forward * x - out * 13 + up * 5.5,
                    (1.1, 11, 1.1), limestone, axes, True, .08)
            box('spillway gallery sheltered flat roof', center + up * 12,
                (145, 1.2, 33), concrete, axes, True, .15)
            box('spillway gallery thin coping', center + up * 12.8 - out * 16,
                (145, .4, .8), limestone, axes)
            box('spillway gallery projecting service walkway', center - out * 18 + up * .3,
                (145, .55, 5), iron, axes, True)
            for x in range(-70, 71, 7):
                box('spillway gallery walkway railing', center + forward * x - out * 20.2 + up * 1.3,
                    (.09, 1.7, .09), iron, axes)
            box('spillway gallery continuous handrail', center - out * 20.2 + up * 2.15,
                (145, .1, .1), iron, axes)
            for x in [-48, 0, 48]:
                q = center + forward * x - out * 12 + up * 10.7
                box('spillway gallery recessed work light', q, (1.4, .14, .45), fixture, axes)
                c['lights'].append({'p': list(q - up * 1.3), 'power': 400, 'color': '#c6d5d5', 'pocket': True})
            # Intermittent narrow outlets identify the working dam without
            # laying another translucent sheet over the racing line.
            if bay in [1, 4] and height > 65:
                lip = center - out * 16 - up * 17
                box('spillway active outlet throat', lip, (10, 5, .5), iron, axes)
                c['falls'].append({'top': list(lip - out), 'right': list(forward),
                                  'width': 8, 'height': height - 18,
                                  'seed': 51 + bay + side * .5, 'kind': 'terrace'})
    print('SPILLWAY CONNECTED GALLERY BAYS', count, flush=True)

    # A distinct occupied control house anchors the receiver bend. Its heavy
    # lower machinery hall, narrow vertical stair tower and roof ventilators
    # break the otherwise uninterrupted inspection-gallery profile.
    along = forward
    out = -right
    axes = (along, up, out)
    center = origin + forward * 540 + out * 350
    road = Vector(near(jump['landingStart'] + 540)['p'])
    center.y = max(land_height(center.x, center.z), road.y - 18)
    brick = c.get('brick', c['sandstone'])
    if clear(center + up * 47, (222, 100, 92), axes):
        box('spillway control station founded machinery base', center + up * 8,
            (212, 16, 82), aggregate, axes, True, .3)
        box('spillway control station occupied operating hall', center + up * 26,
            (202, 22, 72), brick, axes, True, .2)
        face = center - out * 36.1
        for bay in range(18):
            q = face + along * ((bay - 8.5) * 10.8)
            box('spillway control hall structural stone pier', q + up * 25,
                (1.8, 25, 2.2), limestone, axes, True, .12)
            box('spillway control hall deep window reveal', q + along * 5.4 + up * 25,
                (8.1, 15.2, .3), iron, axes)
            for col in [-1, 0, 1]:
                for row in [-1, 0, 1]:
                    pane = q + along * (5.4 + col * 2.5) + up * (25 + row * 4.7) - out * .21
                    box('spillway control hall occupied window', pane,
                        (2.25, 4.35, .055), c['warm'] if (bay + row) % 4 else glass, axes)
            if bay % 3 == 0:
                box('spillway control hall horizontal floor band', q + along * 10.8 + up * 17.4 - out * 1,
                    (32.2, .65, 1.4), limestone, axes)
        box('spillway control hall heavy roof cornice', center + up * 38,
            (207, 2.1, 76), limestone, axes, True, .12)
        for x in [-72, -22, 32, 77]:
            box('spillway control hall raised roof ventilator', center + along * x + up * 41,
                (21, 5, 38), c['enamel'], axes, True, .1)
            for z in [-1, 1]:
                box('spillway control roof occupied clerestory', center + along * x + up * 41 + out * (z * 19.1),
                    (19, 3.4, .07), dim, axes)
        tower = center + along * 80 + out * 11
        box('spillway tall control stair masonry', tower + up * 47,
            (28, 78, 30), brick, axes, True, .18)
        for side in [-1, 1]:
            box('spillway stair tower stone corner', tower + along * (side * 13.7) + up * 47 - out * 15,
                (2.3, 78, 2.3), limestone, axes, True)
        for floor in range(12):
            for col in [-1, 0, 1]:
                box('spillway control tower room window', tower + up * (14 + floor * 5.8) + along * (col * 6.1) - out * 15.15,
                    (3.4, 4.25, .08), c['warm'] if (floor + col) % 4 else glass, axes)
        box('spillway control tower projecting watch room', tower + up * 87,
            (34, 9, 36), limestone, axes, True, .18)
        for col in range(-3, 4):
            box('spillway control watch room glazing', tower + up * 87 + along * (col * 4.1) - out * 18.15,
                (3.6, 5.5, .07), c['warm'], axes)
        box('spillway watch room roof cap', tower + up * 92,
            (36, 1.4, 38), c['enamel'], axes, True)
        # Broad light receivers are part of the occupied facade, while the
        # nearest fixed runtime light slots provide local reflected spill.
        # One upper architectural wash is retained during the long flight.
        beacon = tower + up * 81 - out * 23
        box('spillway watch room shielded floodlight', beacon, (3.4, .45, 1.2), fixture, axes)
        c['lights'].append({'p': list(beacon - up * 1.8), 'power': 26000,
                            'color': '#ffe3b9', 'radius': 175, 'landmark': 'spillway-leap'})
        for x in [-72, 72]:
            q = face + along * x + up * 16 - out * 5
            box('spillway control station sheltered apron lamp', q,
                (4, .2, 1.1), fixture, axes)
            c['lights'].append({'p': list(q - up * 1.5), 'power': 2400,
                                'color': '#ffe0ae', 'radius': 150, 'pocket': True})
