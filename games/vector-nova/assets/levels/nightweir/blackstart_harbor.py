"""The Harbor Leap's connected freight terminal, in production Y-up metres.

Call ``build_harbor(context)`` after the road supports and before export. The
builder supplies route, basins, near, clear, box, mesh, cylinder, arch, Vector,
UP, objects, lights and its existing material names. This helper owns no Blender scene,
files, textures or export. The adjoining landform should meet the terminal's
outer retaining edges, not rise through its yards.
"""
import math


def build_harbor(context):
    route = context['route']
    Vector, up = context['Vector'], context['UP']
    box, mesh, cylinder, arch = (context[key] for key in ('box', 'mesh', 'cylinder', 'arch'))
    near, clear = context['near'], context['clear']
    materials = {key: context[key] for key in (
        'concrete', 'aggregate', 'steel', 'enamel', 'iron', 'glass', 'warm',
        'dim', 'fixture', 'limestone', 'sandstone', 'wear')}
    concrete, aggregate, steel, enamel, iron, glass, warm, dim, fixture, limestone, sandstone, wear = materials.values()
    brick = context.get('brick', sandstone)
    jump = next(jump for jump in route['jumps'] if jump['id'] == 'harbor-leap')
    frame = near(jump['landingStart'])
    forward = Vector((frame['t'][0], 0, frame['t'][2])).normalized()
    right = up.cross(forward)
    origin = Vector(frame['p'])
    water_y = context['basins'][-1]['y']
    origin.y = water_y
    axes = (right, up, forward)
    summary = {'quays': 0, 'freightHalls': 0, 'cranes': 0, 'ships': 0,
               'containers': 0, 'bulkSilos': 0, 'controlBlocks': 0,
               'receivingCourts': 0, 'conveyorLinks': 0, 'skipped': [],
               'origin': list(origin), 'forward': list(forward),
               'footprint': {'along': [-260, 1220], 'lateral': [-510, 510],
                             'quayTop': water_y + 12}}

    def p(lateral, height, along):
        return origin + right * lateral + up * height + forward * along

    def available(name, center, dimensions, orientation=axes):
        result = clear(center, dimensions, orientation)
        if not result:
            summary['skipped'].append(name)
        return result

    def block(name, center, dimensions, material, orientation=axes, solid=False, bevel=0):
        return box('Blackstart harbor / ' + name, center, dimensions, material,
                   orientation, solid, bevel)

    def rod(name, start, end, width, depth, material=iron, solid=False):
        direction = (end - start).normalized()
        cross = direction.cross(up)
        if cross.length < .01:
            cross = right.copy()
        cross.normalize()
        normal = cross.cross(direction).normalized()
        block(name, (start + end) / 2, (width, (end - start).length, depth),
              material, (cross, direction, normal), solid)

    def container(center, color, ribs=False):
        # ISO 40-foot dimensions provide a familiar scale reference. Neither
        # these nor the crane cabins are inflated to fill the monumental basin.
        block('40 foot cargo container', center, (2.44, 2.59, 12.19), color)
        block('container paired end doors', center - forward * 6.12,
              (2.32, 2.46, .09), color)
        for side in [-1, 1]:
            block('container door latch', center - forward * 6.18 + right * (side * .56),
                  (.055, 2.2, .055), wear)
        if ribs:
            for i in range(7):
                block('container side pressed rib', center + right * 1.25 + forward * (-5.2 + i * 1.72),
                      (.06, 2.35, .07), color)
        summary['containers'] += 1

    def crane(side, station, index):
        center = p(side * (quay_edge(side, station) + 45), 12, station)
        outward, inward = right * side, right * -side
        # Test the whole installation, including the far boom and all cables,
        # against every exported flight speed, not only the nominal road path.
        envelope = center + inward * 18 + up * 58
        if not available('ship-to-shore crane ' + str(index), envelope, (204, 120, 66)):
            return
        local = lambda x, y, z: center + outward * x + up * y + forward * z
        for x in [-14, 14]:
            for z in [-23, 23]:
                a, b = local(x, 3, z), local(x * .64, 60, z * .75)
                block('gantry rail bogie', a - up * 2, (8, 2, 10), iron, solid=True)
                rod('gantry raking portal leg', a, b, 3.4, 4.2, steel, True)
                for dz in [-3, 3]:
                    cylinder('Blackstart harbor / gantry wheel', a + forward * dz - up * 1.6,
                             1.2, 1.4, wear, outward, 12)
        for z in [-17.2, 17.2]:
            rod('gantry transverse head beam', local(-19, 60, z), local(19, 60, z), 3.2, 4, steel, True)
        for x in [-9, 9]:
            rod('gantry longitudinal head beam', local(x, 60, -23), local(x, 60, 23), 3.4, 4.5, steel, True)
            rod('gantry side portal brace', local(x * 1.5, 10, -23), local(x, 57, 17), 1.6, 1.8, iron)
        # Open truss boom, asymmetrical backreach and elevated suspension tower.
        for z in [-4.5, 4.5]:
            for y in [77, 85]:
                rod('gantry boom chord', local(-111, y, z), local(54, y, z), 1.25, 1.5, steel, True)
            for step in range(16):
                x = -111 + step * 10.3
                rod('gantry boom lattice web', local(x, 77 if step % 2 == 0 else 85, z),
                    local(x + 10.3, 85 if step % 2 == 0 else 77, z), .65, .75, iron)
        for z in [-5, 5]:
            rod('gantry suspension mast', local(4, 60, z), local(10, 112, z), 2.3, 2.5, steel, True)
            rod('gantry forward stay cable', local(10, 111, z), local(-98, 85, z), .34, .34, wear)
            rod('gantry counterweight stay cable', local(10, 111, z), local(50, 85, z), .34, .34, wear)
        block('gantry rear machinery house', local(30, 81, 0), (24, 12, 15), enamel, solid=True, bevel=.18)
        block('gantry motor-house roof', local(30, 87.4, 0), (25, .8, 16), iron, solid=True)
        block('gantry suspended driver cabin', local(-47, 73, 0), (5.2, 3.4, 4.4), limestone, solid=True)
        block('gantry cabin glazing', local(-49.7, 73.3, 0), (.06, 2.1, 3.7), glass)
        for z in [-3.2, 3.2]:
            rod('gantry hoist cable', local(-83, 77, z), local(-83, 24, z), .10, .10, iron)
        block('gantry cargo spreader', local(-83, 23.7, 0), (3.1, 1.1, 12.9), steel, solid=True)
        block('gantry trolley maintenance light', local(-43, 70.8, 0), (2.1, .25, 2.3), fixture)
        summary['cranes'] += 1


    def solid_proxy(name, center, dimensions, orientation=axes):
        # One authored collision envelope per cargo stack. Fine container ribs
        # and individual doors remain visual rather than thousands of bodies.
        record = block(name + ' collision envelope', center, dimensions,
                       concrete, orientation, solid=True)
        assert context['objects'][-1] is record
        context['objects'].pop()

    def quay_edge(side, station):
        if side < 0 and 80 < station < 360:
            return 205
        if side > 0 and 500 < station < 950:
            return 235
        return 115

    # Recessed berths replace an unbroken rectangular display pad. Each quay
    # remains a continuous strip of working land with an actual water-facing
    # bulkhead, differentiated paved courts and rail connections.
    for side in [-1, 1]:
        intervals = [(-260, 80, 115), (80, 360, 205), (360, 1220, 115)] if side < 0 else [(-260, 500, 115), (500, 950, 235), (950, 1220, 115)]
        for start, end, edge in intervals:
            length, station = end - start, (start + end) / 2
            width = 510 - edge
            center = p(side * (edge + width / 2), -5, station)
            if not available('stepped terminal quay', center, (width, 34, length)):
                continue
            block('continuous founded terminal quay', center, (width, 34, length), concrete, solid=True)
            block('quay water retaining face', p(side * edge, -1, station),
                  (3, 26, length), aggregate, solid=True)
            block('quay coping course', p(side * edge, 11.5, station),
                  (5, 1.4, length), limestone)
            block('working waterside apron', p(side * (edge + 48), 12.15, station),
                  (90, .2, length - 4), aggregate)
            for offset in [31, 59]:
                block('quayside crane rail', p(side * (edge + offset), 12.4, station),
                      (.55, .5, length - 12), wear)
            for along in range(int(start) + 18, int(end) - 8, 44):
                block('quay rubber fender', p(side * edge, 3, along), (3, 14, 3), iron)
                cylinder('Blackstart harbor / mooring bollard', p(side * (edge + 6), 13, along),
                         .65, 2.2, steel, up, 12)
        # The berth returns have real retaining walls rather than floating
        # trim where the water cuts into the terminal.
        for station, depth in ([(80, 90), (360, 90)] if side < 0 else [(500, 120), (950, 120)]):
            block('berth return retaining wall', p(side * (115 + depth / 2), -1, station),
                  (depth, 26, 3), aggregate, solid=True)
        block('port perimeter service street', p(side * 507, 12.3, 480),
              (6, .25, 1460), aggregate)
        summary['quays'] += 1
        for station in [0, 480, 960]:
            lateral = max(quay_edge(side, station) + 95, 255)
            # Flood masts belong to the apron rather than a building interior.
            if side < 0 and station == 0:
                lateral = 185
            foot = p(side * lateral, 12, station)
            block('yard floodlight grounded mast', foot + up * 17,
                  (1.1, 34, 1.1), iron)
            block('yard floodlight maintenance head', foot + up * 34,
                  (7.5, 1.3, 3.4), iron)
            for offset in [-2.5, 0, 2.5]:
                block('yard floodlight shielded lamp', foot + up * 33.25 + right * offset,
                      (2.1, .2, 2.6), fixture)
            context['lights'].append({'p': list(foot + up * 32.5), 'power': 18000,
                                      'color': '#ffdab0', 'radius': 240, 'yard': True, 'pocket': True})

    def profile_roof(name, base, profile, length, material, thickness=1.4):
        # Closed thin shell: the roof shape itself provides the collision
        # surface and structural silhouette, without a box filling its void.
        vertices = [tuple(base + right * x + up * (y + inset) + forward * z)
                    for z in [-length / 2, length / 2]
                    for inset in [0, -thickness] for x, y in profile]
        count = len(profile)
        faces = []
        for i in range(count - 1):
            faces.extend([(i, i + 1, 2 * count + i + 1, 2 * count + i),
                          (count + i, 3 * count + i, 3 * count + i + 1, count + i + 1),
                          (i, count + i, count + i + 1, i + 1),
                          (2 * count + i, 2 * count + i + 1, 3 * count + i + 1, 3 * count + i)])
        for i in [0, count - 1]:
            faces.append((i, 2 * count + i, 3 * count + i, count + i))
        mesh('Blackstart harbor / ' + name, vertices, faces, material, True)

    zinc = context.get('zinc', enamel)
    oxidized_roof = context['material']('weathered zinc roofing oxide', (.48, .30, .20), .74, .25)

    def cargo_shed(side, station, width, length, eave, roof_type, name):
        lateral = 510 - width / 2 - 8
        base = p(side * lateral, 14, station)
        ridge = {'bulk': 92, 'sawtooth': 59, 'repair': 88}[roof_type]
        if not available(name, base + up * (ridge / 2), (width + 22, ridge + 12, length + 12)):
            return
        inward = right * -side
        face = base + inward * (width / 2)
        rear = base - inward * (width / 2 - 5)
        block(name + ' loading foundation', base - up * 1,
              (width + 4, 5, length + 4), aggregate, solid=True)
        block(name + ' rear industrial wall', rear + up * (eave / 2),
              (10, eave, length), brick if roof_type != 'repair' else concrete, solid=True)
        for end in [-1, 1]:
            block(name + ' end structural wall', base + forward * (end * (length / 2 - 3)) + up * (eave / 2),
                  (width - 10, eave, 6), brick if roof_type == 'bulk' else concrete, solid=True)
        bay_width = 58 if roof_type == 'repair' else 44
        bay_count = max(3, int(length / bay_width))
        pitch = length / bay_count
        for index in range(bay_count):
            z = -length / 2 + (index + .5) * pitch
            q = face + forward * z
            block(name + ' open portal pier', q + forward * (-pitch / 2 + 2) + up * (eave / 2),
                  (7, eave, 4), concrete if roof_type == 'repair' else brick, solid=True)
            block(name + ' portal lintel', q + up * (eave - 3),
                  (9, 6, pitch), concrete, solid=True)
            # Deep interior loading wall, illuminated at operational scale.
            block(name + ' recessed loading interior', q - inward * 15 + up * (eave * .38),
                  (.15, eave * .74, pitch - 8), iron)
            block(name + ' large work aperture', q - inward * 14.8 + up * (eave * .39),
                  (.08, eave * .62, pitch - 11), fixture if index % 3 == 1 else enamel)
            for vertical in [.28, .55]:
                block(name + ' work door structural rail', q - inward * 14.6 + up * (eave * vertical),
                      (.2, .8, pitch - 10), steel)
            rod(name + ' exposed roof tie', q - inward * 1 + up * (eave - 2),
                rear + forward * z + up * (eave - 2), 1.2, 2, steel)
            block(name + ' dock shelter lamp', q + inward * 6 + up * 7.5,
                  (.5, .4, 4), fixture)
        block(name + ' continuous receiving dock', face + inward * 5 + up * .8,
              (12, 2.2, length), concrete, solid=True)
        if roof_type == 'bulk':
            profile = [(-width / 2 - 2, eave), (-width * .18, ridge), (width / 2 + 2, eave)]
            profile_roof(name + ' unequal long-span pitched roof', base, profile, length + 4, oxidized_roof)
            # Transverse metal ribs reveal the clear span and shallow roof bays.
            for z in range(-int(length / 2) + 10, int(length / 2), 24):
                for (xa, ya), (xb, yb) in zip(profile, profile[1:]):
                    rod(name + ' roof structural rib', base + right * xa + up * (ya + .4) + forward * z,
                        base + right * xb + up * (yb + .4) + forward * z, .7, .8, wear)
            block(name + ' ridge ventilator', base - right * (width * .18) + up * (ridge + 1.5),
                  (8, 3, length - 16), iron)
        elif roof_type == 'sawtooth':
            # Northlight teeth run across the hall, visibly different from the
            # long asymmetric shed opposite. Warm glazing is a broad plane,
            # not thin runway stripes laid on a flat roof.
            teeth = 6
            tooth = length / teeth
            for index in range(teeth):
                z0 = -length / 2 + index * tooth
                vertices = [tuple(base + right * x + forward * z + up * y)
                            for x in [-width / 2 - 1, width / 2 + 1]
                            for z, y in [(z0, eave), (z0 + tooth - 7, ridge), (z0 + tooth, eave)]]
                mesh('Blackstart harbor / rail store folded northlight roof', vertices,
                     [(0, 1, 4, 3), (0, 2, 1), (3, 4, 5)], zinc, True)
                glass_z = z0 + tooth - 6.8
                panes = [tuple(base + right * x + forward * z + up * y)
                         for x in [-width / 2 + 4, width / 2 - 4]
                         for z, y in [(z0 + tooth - 6.9, ridge - .25), (z0 + tooth - .1, eave + .5)]]
                mesh('Blackstart harbor / rail store broad northlight glazing', panes,
                     [(0, 1, 3, 2)], fixture if index in [1, 4] else glass)
                for x in range(-int(width / 2) + 7, int(width / 2), 12):
                    rod('rail northlight structural mullion', base + right * x + forward * glass_z + up * (eave + 1),
                        base + right * x + forward * (glass_z - 6.8) + up * (ridge - .4), .7, .8, steel)
        else:
            profile = [(width * (i / 12 - .5), eave + (ridge - eave) * math.sin(math.pi * i / 12)) for i in range(13)]
            profile_roof(name + ' vaulted assembly roof', base, profile, length + 3, zinc)
            for z in range(-int(length / 2) + 10, int(length / 2), 23):
                for (xa, ya), (xb, yb) in zip(profile, profile[1:]):
                    rod(name + ' curved roof rib', base + right * xa + up * (ya + .5) + forward * z,
                        base + right * xb + up * (yb + .5) + forward * z, .7, .8, wear)
            for z in [-length * .3, 0, length * .3]:
                block(name + ' ridge rooflight housing', base + forward * z + up * (ridge + .7),
                      (24, 2, 19), iron)
                block(name + ' broad rooflight glazing', base + forward * z + up * (ridge + 1.8),
                      (21, .1, 16), fixture)
        summary['freightHalls'] += 1

    cargo_shed(-1, 670, 210, 580, 40, 'bulk', 'long-span breakbulk store')
    cargo_shed(1, 120, 240, 600, 31, 'sawtooth', 'bonded rail receiving store')
    cargo_shed(1, 1060, 210, 280, 55, 'repair', 'high-bay repair and assembly hall')

    # Receiving courts have clear working lanes, rail loading, and selected
    # cargo stacks. The office-lot grid is replaced by three distinct land uses.
    def receiving_court(side, lateral, station, width, length, rail=False):
        base = p(side * lateral, 12.35, station)
        if not available('receiving court', base + up * 5, (width, 14, length)):
            return
        block('receiving court dark wearing course', base, (width, .3, length), aggregate)
        for edge in [-1, 1]:
            block('court truck lane edge', base + right * (edge * (width / 2 - 3)) + up * .17,
                  (.24, .035, length - 8), limestone)
        if rail:
            for lane in [-10, 10]:
                for rail_offset in [-.75, .75]:
                    block('receiving court embedded rail', base + right * (lane + rail_offset) + up * .2,
                          (.18, .16, length - 10), wear)
                for z in range(-int(length / 2) + 24, int(length / 2) - 14, 24):
                    q = base + right * lane + forward * z
                    block('covered freight rail wagon', q + up * 3.5, (3.1, 5.6, 18), enamel)
                    block('freight rail wagon chassis', q + up * .8, (3.4, 1.5, 19), iron)
            for lane in [-10, 10]:
                solid_proxy('rail wagon train envelope', base + right * lane + up * 3.5, (3.6, 7, length - 28))
        else:
            for z in range(-int(length / 2) + 16, int(length / 2) - 16, 34):
                block('receiving court transverse loading line', base + forward * z + up * .18,
                      (width - 12, .035, .22), limestone)
        summary['receivingCourts'] += 1

    receiving_court(-1, 234, 675, 74, 575)
    receiving_court(1, 215, 125, 72, 590, True)
    receiving_court(1, 268, 1060, 43, 276)
    for side, station in [(-1, 1010), (1, 815)]:
        center = p(side * 395, 12, station)
        if not available('bonded container stack', center + up * 6, (34, 14, 64)):
            continue
        for row in range(4):
            for col in range(7):
                layers = 2 + (row + col) % 3
                for layer in range(layers):
                    container(center + right * ((col - 3) * 2.72) + forward * ((row - 1.5) * 13.6) + up * (1.295 + layer * 2.64),
                              [steel, enamel, sandstone][(row + col) % 3], col == 6)
        solid_proxy('bonded cargo stack', center + up * 5.5, (20, 11, 54))

    # Six full-height grain/cement silos and their transfer system form the
    # harbor's destination landmark. Equipment visibly connects storage to a
    # sheltered receiving yard and onward to the bulk ship at the berth.
    bulk = p(-420, 12, -75)
    if available('bulk silo terminal', bulk + up * 72, (160, 152, 230)):
        context['lights'].append({'p': list(bulk + up * 115 - forward * 95 + right * 95), 'power': 65000, 'color': '#dce5d3', 'radius': 290, 'landmark': 'harbor-leap'})
        block('bulk terminal common foundation', bulk + up * 3, (160, 6, 230), concrete, solid=True)
        for index, (x, z, height) in enumerate([(-40, -78, 114), (40, -78, 132), (-40, 0, 104), (40, 0, 122), (-40, 78, 96), (40, 78, 112)]):
            q = bulk + right * x + forward * z
            cylinder('Blackstart harbor / bulk freight storage silo', q + up * (height / 2 + 6),
                     28, height, concrete if index % 3 else limestone, up, 32, True)
            for y in [12, height * .5, height - 4]:
                cylinder('Blackstart harbor / silo strengthening band', q + up * (y + 6),
                         28.35, 1.3, steel, up, 32)
            # Conical caps keep the cylindrical masses from becoming another
            # field of flat rooftops in the actual airborne camera.
            ring = [tuple(q + right * (28 * math.cos(i * math.tau / 32)) + forward * (28 * math.sin(i * math.tau / 32)) + up * (height + 6)) for i in range(32)]
            ring.append(tuple(q + up * (height + 14)))
            mesh('Blackstart harbor / silo conical crown', ring, [(i, (i + 1) % 32, 32) for i in range(32)], steel, True)
            cylinder('Blackstart harbor / silo crown maintenance lantern', q + up * (height + 14.6),
                     3.2, 1.2, fixture, up, 16)
            summary['bulkSilos'] += 1
        tower = p(-286, 12, 205)
        if available('bulk ship loader tower', tower + up * 55, (40, 120, 50)):
            block('bulk loading tower founded foot', tower + up * 3, (38, 6, 48), concrete, solid=True)
            block('bulk loading tower paired working cores', tower + up * 51, (26, 102, 30), concrete, solid=True)
            block('bulk loader operating headhouse', tower + up * 105, (38, 16, 42), brick, solid=True)
            for z in [-12, -4, 4, 12]:
                block('bulk loader illuminated control glazing', tower + right * 19.2 + forward * z + up * 106,
                      (.1, 7, 5.8), fixture if z == 4 else glass)
            a = bulk + right * 52 + forward * 82 + up * 109
            b = tower + up * 100
            if available('bulk enclosed main conveyor', (a + b) / 2,
                         (abs((b - a).dot(right)) + 14, abs(b.y - a.y) + 14, abs((b - a).dot(forward)) + 14)):
                rod('bulk enclosed conveyor structural bed', a, b, 11, 7, steel, True)
                rod('bulk enclosed conveyor working enclosure', a + up * 5, b + up * 5, 9, 5, enamel)
                for fraction in [.32, .68]:
                    q = a.lerp(b, fraction)
                    foot = Vector(q); foot.y = water_y + 12
                    rod('bulk conveyor founded trestle', foot, q - up * 4, 6, 7, concrete, True)
                summary['conveyorLinks'] += 1
            a = tower + right * 16 + up * 92
            b = p(-165, 43, 220)
            if available('bulk ship-loading boom', (a + b) / 2,
                         (abs((b - a).dot(right)) + 12, abs(b.y - a.y) + 12, abs((b - a).dot(forward)) + 12)):
                rod('bulk ship-loading enclosed boom', a, b, 9, 8, enamel, True)
                rod('bulk ship-loading discharge spout', b, b - up * 24, 4, 4, iron)
                summary['conveyorLinks'] += 1

    # Inhabited control is concentrated at two access junctions. These modest
    # occupied blocks support the freight functions instead of governing the
    # whole basin as sixteen detached office slabs.
    for side, station, lateral, length in [(-1, 1120, 395, 130), (1, 650, 405, 140)]:
        base = p(side * lateral, 14, station)
        width, height = 102, 25
        if not available('terminal occupied control house', base + up * 15, (width + 16, 44, length + 10)):
            continue
        inward = right * -side
        block('terminal occupied control house', base + up * (height / 2), (width, height, length), brick, solid=True)
        face = base + inward * (width / 2)
        block('terminal control sheltered portico', face + inward * 6 + up * 6,
              (14, 1.6, length), concrete, solid=True)
        for floor in range(4):
            for column in range(int(length / 7)):
                z = -length / 2 + 5 + column * 7
                q = face + up * (8 + floor * 4.1) + forward * z
                block('terminal control deep window reveal', q + inward * .2,
                      (.4, 2.9, 4.7), iron)
                block('terminal occupied control window', q + inward * .43,
                      (.05, 2.4, 4.1), warm if (column + floor) % 3 == 0 else glass)
        profile_roof('terminal control broad pitched roof', base,
                     [(-width / 2 - 1, height), (0, height + 11), (width / 2 + 1, height)], length + 2, iron)
        summary['controlBlocks'] += 1
    def ship(side, station, length, width, index, bulk_cargo=False):
        center = p(side * (quay_edge(side, station) - 40), 0, station)
        if not available('moored cargo ship ' + str(index), center + up * 23, (width + 5, 60, length + 8)):
            return
        vertices = []
        outline = [(-.47, -.5), (.47, -.5), (.5, .23), (.32, .43), (0, .5), (-.32, .43), (-.5, .23)]
        for y, scale in [(-5, .78), (7, 1)]:
            for x, z in outline:
                vertices.append(tuple(center + right * (x * width * scale) + forward * (z * length * scale) + up * y))
        n = len(outline)
        faces = [tuple(reversed(range(n))), tuple(range(n, n * 2))]
        faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
        mesh('Blackstart harbor / moored seagoing freight hull', vertices, faces, iron, True)
        block('cargo vessel working deck', center + up * 7.3 - forward * (length * .05),
              (width - 3, .7, length * .79), steel, solid=True)
        for z in [-.43, .31]:
            for x in [-.35, .35]:
                cylinder('Blackstart harbor / ship mooring bitt', center + right * (x * width) + forward * (z * length) + up * 8.3,
                         .4, 1.5, wear, up, 12, True)
        if bulk_cargo:
            for z in [-.22, -.03, .16, .32]:
                block('bulk carrier broad hatch coaming', center + forward * (length * z) + up * 8.1,
                      (width - 6, 1.6, length * .15), limestone, solid=True)
                block('bulk carrier ribbed hatch cover', center + forward * (length * z) + up * 9,
                      (width - 7, .4, length * .145), steel)
        else:
            for row in range(int(length * .60 / 13.4)):
                for column in range(int((width - 6) / 2.7)):
                    for layer in range(3 + (row + column) % 2):
                        q = center + forward * (-length * .31 + row * 13.4) + right * ((column - (int((width - 6) / 2.7) - 1) / 2) * 2.7) + up * (8.95 + layer * 2.64)
                        container(q, [enamel, steel, sandstone][(row + column + index) % 3], ribs=False)
            solid_proxy('moored vessel continuous cargo stack', center + forward * (length * .005) + up * 13.5,
                        (width - 5, 11, length * .65))
        house = center - forward * (length * .40) + up * 8
        block('ship accommodation superstructure', house + up * 10,
              (width - 7, 20, 21), concrete, solid=True, bevel=.15)
        block('ship bridge overhanging control deck', house + up * 21.4,
              (width + 1, 4.5, 16), limestone, solid=True, bevel=.1)
        for row in range(4):
            for col in range(-3, 4):
                block('ship accommodation room window', house + right * (col * 3.2) + up * (3.4 + row * 4.5) + forward * 10.6,
                      (1.4, 1.5, .07), warm if (row + col) % 5 == 0 else glass)
        for col in range(-4, 5):
            block('ship bridge panoramic glazing', house + right * (col * 3.3) + up * 21.7 + forward * 8.1,
                  (2.8, 2.5, .06), glass)
        cylinder('Blackstart harbor / ship exhaust funnel', house - forward * 5 + up * 26,
                 2.5, 14, enamel, up, 16, True)
        rod('ship navigation mast', house + up * 25, house + up * 37, .45, .45, wear)
        for z in [-.45, .34]:
            a = center + right * (side * width * .46) + forward * (z * length) + up * 8
            b = p(side * (quay_edge(side, station) + 6), 13, station + z * length + 8)
            rod('taut mooring line', a, b, .13, .13, iron)
        summary['ships'] += 1

    crane(-1, 650, 0)
    crane(1, 180, 1)
    crane(1, 700, 2)
    ship(-1, 220, 244, 39, 0, bulk_cargo=True)
    ship(1, 750, 234, 33, 1)
    return summary
