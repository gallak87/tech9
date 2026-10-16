"""Connected, unequal rock masses authored into the production terrain.

Each hero basin has its own large-scale section: Harbor's low fractured beds,
Spillway's broad layered escarpment, and Turbine's two unequal shoulder ridges.
Civil benches stay intact. These fields lower the constrained terrain rather
than attaching repeated rock blocks, so visible and physical shapes agree.
"""
import math
from mathutils import Vector
from mathutils.geometry import tessellate_polygon


def _linear(points, value):
    if value <= points[0][0]:
        return points[0][1]
    for (a, x), (b, y) in zip(points, points[1:]):
        if value <= b:
            return x + (y - x) * (value - a) / (b - a)
    return points[-1][1]


def _smooth(value):
    t = max(0, min(1, value))
    return t * t * (3 - 2 * t)


def _window(value, start, end, feather):
    return _smooth(min((value - start) / feather, (end - value) / feather))


class BasinFrame:
    def __init__(self, origin, forward, right, floor):
        self.origin = Vector(origin)
        self.forward, self.right = Vector(forward), Vector(right)
        self.floor = floor

    def coordinates(self, x, z):
        delta = Vector((x, 0, z)) - self.origin
        return delta.dot(self.forward), delta.dot(self.right)


class HarborGeology(BasinFrame):
    def __init__(self, origin, forward, right, floor):
        super().__init__(origin, forward, right, floor)
        self.toes = {
            -1: [(-650, 680), (-350, 570), (-60, 620), (180, 550),
                 (430, 705), (740, 570), (970, 630), (1210, 555), (1800, 740)],
            1: [(-650, 720), (-240, 605), (80, 550), (390, 615),
                (650, 735), (960, 560), (1280, 650), (1530, 575), (1800, 730)],
        }
        self.beds = {
            -1: [(-60, -5), (-8, -5), (23, 48), (77, 56),
                 (112, 143), (177, 150), (216, 238), (300, 248), (490, 310)],
            1: [(-65, -5), (-5, -5), (34, 64), (105, 70),
                (133, 159), (182, 165), (226, 260), (335, 270), (500, 330)],
        }
        self.cuts = {
            -1: [(430, 145, 160, .36), (1060, 82, 115, -.22)],
            1: [(-70, 105, 110, .2), (680, 175, 190, -.31)],
        }
        # An independent offset end closure replaces the kilometre-wide flat
        # rear wall. Its toe advances and recedes by hundreds of metres; the
        # ledges are not copies of either side bank's bed widths or heights.
        self.rear_toe = [(-1350, 1510), (-960, 1360), (-660, 1550),
                         (-340, 1260), (-70, 1460), (210, 1230),
                         (480, 1490), (820, 1320), (1200, 1570)]

    def side_influence(self, along, lateral):
        if abs(lateral) <= 520:
            return 0
        return _window(along, -650, 1900, 220) * max(0, 1 - _linear([(1040, 0), (1320, 1)], abs(lateral)))

    def rear_influence(self, along, lateral):
        # The occupied finish bench is west of the basin, before this cut.
        return _smooth((along - 1220) / 110) * _smooth((2450 - along) / 250) * _smooth((1300 - abs(lateral)) / 220)

    def influence(self, x, z):
        along, lateral = self.coordinates(x, z)
        return max(self.side_influence(along, lateral), self.rear_influence(along, lateral))

    def height(self, x, z, previous):
        along, lateral = self.coordinates(x, z)
        weight = self.side_influence(along, lateral)
        side = -1 if lateral < 0 else 1
        if weight:
            across = abs(lateral) - _linear(self.toes[side], along)
            dip = .021 * (along - 500) + (8 if side > 0 else 0)
            height = self.floor + max(-5, _linear(self.beds[side], across) + dip)
            for center, half_width, depth, drift in self.cuts[side]:
                center += drift * (abs(lateral) - 650)
                incision = max(0, 1 - abs(along - center) / half_width)
                height -= depth * incision * min(1, max(0, (across + 30) / 100))
            previous += (min(previous, max(self.floor - 5, height)) - previous) * weight
        weight = self.rear_influence(along, lateral)
        if weight:
            across = along - _linear(self.rear_toe, lateral)
            dip = .047 * lateral
            target = self.floor + _linear([(-220, -5), (-25, -5), (23, 54),
                       (125, 63), (162, 173), (238, 181), (325, 288), (580, 320)], across) + dip
            # One broad diagonal break divides the rear mass, not a repeated
            # crenellation or a thin vertical crack stamped onto each bed.
            cleft = max(0, 1 - abs(lateral - (70 + .65 * (along - 1450))) / 185)
            target -= 175 * cleft * _smooth((across + 100) / 180)
            previous += (min(previous, max(self.floor - 5, target)) - previous) * weight
        return previous


class HeroEscarpment(BasinFrame):
    def __init__(self, origin, forward, right, floor, kind, context, jump):
        super().__init__(origin, forward, right, floor)
        self.kind = kind
        # Other occupied districts wind below and behind the hero basins.
        # Preserve their continuous civil bench, not isolated little patches
        # beneath individual columns. Samples belong to the authored route.
        self.neighbor_bins = {}
        for sample in context['samples']:
            if jump['takeoff'] - 160 <= sample['s'] <= jump['landingEnd'] + 120:
                continue
            p = sample['p']; key = (math.floor(p[0] / 240), math.floor(p[2] / 240))
            self.neighbor_bins.setdefault(key, []).append((p[0], p[2]))
        if kind == 'spillway':
            self.toes = {
                -1: [(-450, 590), (-100, 510), (250, 640), (610, 480), (980, 650), (1550, 570)],
                1: [(-450, 650), (100, 465), (510, 590), (900, 485), (1450, 700)],
            }
            self.beds = {
                -1: [(-180, 460), (-30, 480), (25, 575), (160, 590), (215, 730), (460, 780)],
                1: [(-170, 430), (-45, 450), (35, 560), (225, 575), (285, 735), (520, 810)],
            }
            self.rear_toe = [(-1450, 1250), (-950, 1120), (-610, 1450),
                             (-200, 1030), (150, 1210), (500, 990), (1000, 1300), (1500, 1100)]
        else:
            # The west shoulder is tall and compact. The lower east bank
            # opens toward the descending inhabited city, rather than making
            # a symmetrical gorge around the receiver.
            self.toes = {
                -1: [(-450, 530), (-80, 440), (300, 610), (720, 475), (1100, 690), (1550, 540)],
                1: [(-450, 620), (100, 470), (490, 670), (850, 470), (1550, 740)],
            }
            self.beds = {
                -1: [(-190, 960), (-55, 980), (30, 1115), (200, 1130), (255, 1290), (520, 1335)],
                1: [(-190, 470), (-50, 490), (35, 640), (245, 665), (310, 870), (550, 940)],
            }
            self.rear_toe = [(-1400, 1190), (-900, 1360), (-550, 1070),
                             (-120, 1260), (260, 970), (700, 1240), (1400, 1060)]

    def civil_clearance(self, x, z):
        bx, bz = math.floor(x / 240), math.floor(z / 240)
        distance = 570 ** 2
        for ix in range(bx - 3, bx + 4):
            for iz in range(bz - 3, bz + 4):
                for px, pz in self.neighbor_bins.get((ix, iz), []):
                    distance = min(distance, (px - x) ** 2 + (pz - z) ** 2)
        return _smooth((math.sqrt(distance) - 425) / 145)

    def side_influence(self, along, lateral):
        # These continuous broad civil benches retain every gallery foot,
        # control house and generating-hall platform. Exposed natural rock
        # begins beyond the civil works instead of growing through them.
        inner = 405 if self.kind == 'spillway' else 420
        return _window(along, -450, 1770, 220) * _smooth((abs(lateral) - inner) / 155) * _smooth((1550 - abs(lateral)) / 300)

    def rear_influence(self, along, lateral):
        return _smooth((along - 900) / 180) * _smooth((2100 - along) / 320) * _smooth((1550 - abs(lateral)) / 300)

    def influence(self, x, z):
        along, lateral = self.coordinates(x, z)
        raw = max(self.side_influence(along, lateral), self.rear_influence(along, lateral))
        return raw * self.civil_clearance(x, z) if raw else 0

    def height(self, x, z, previous):
        along, lateral = self.coordinates(x, z)
        side = -1 if lateral < 0 else 1
        civil = self.civil_clearance(x, z)
        weight = self.side_influence(along, lateral) * civil
        if weight:
            across = abs(lateral) - _linear(self.toes[side], along)
            target = self.floor + _linear(self.beds[side], across)
            target += (.035 if self.kind == 'spillway' else -.042) * (along - 500)
            # A single large oblique ravine crosses each massive shoulder;
            # different widths/depths avoid four copies of the same notch.
            center = (300 if side < 0 else 690) + (.55 if side < 0 else -.38) * (abs(lateral) - 600)
            width = 220 if self.kind == 'spillway' else 310
            depth = (215 if side < 0 else 145) if self.kind == 'spillway' else (290 if side < 0 else 190)
            target -= depth * max(0, 1 - abs(along - center) / width)
            previous += (min(previous, target) - previous) * weight
        weight = self.rear_influence(along, lateral) * civil
        if weight:
            across = along - _linear(self.rear_toe, lateral)
            if self.kind == 'spillway':
                target = self.floor + _linear([(-250, 410), (-80, 430), (-20, 590),
                         (100, 605), (175, 745), (440, 810)], across) + .035 * lateral
                notch = max(0, 1 - abs(lateral - (80 - .55 * (along - 1200))) / 240)
                target -= 180 * notch
            else:
                # A long low saddle separates the two shoulder masses. Its
                # tilted section differs from Spillway's two broad ledges.
                shoulder = _linear([(-1400, 1090), (-570, 1060), (-80, 790),
                                   (370, 570), (1100, 660), (1500, 790)], lateral)
                target = self.floor + shoulder + _linear([(-300, -130), (-50, -95),
                         (50, 80), (240, 105), (420, 255)], across)
                notch = max(0, 1 - abs(lateral + 100 - .6 * (along - 1100)) / 320)
                target -= 260 * notch
            previous += (min(previous, max(self.floor + 180, target)) - previous) * weight
        return previous


class HarborRearLandform:
    """Low offset escarpments around a continuous branching drainage system.

    This is the high-quay skyline prototype. Broad depositional benches are
    interrupted by two exposed scarps; the channels descend and merge into
    one widening harbor outlet. No radial hill functions or attached blocks.
    """
    def __init__(self):
        self.front_plan = [(-1700, 6720), (-1120, 6710), (-720, 6560),
                           (-380, 6680), (-120, 6820), (240, 6490),
                           (550, 6650), (1020, 6850), (1600, 6900)]
        self.front_top = [(-1700, 65), (-1120, 175), (-720, 270),
                          (-380, 245), (-120, 125), (240, 235),
                          (550, 265), (1020, 180), (1600, 70)]
        self.back_plan = [(-1700, 7650), (-900, 7420), (-360, 7310),
                          (120, 7500), (680, 7270), (1280, 7540), (1800, 7680)]
        self.back_top = [(-1700, 80), (-900, 265), (-360, 355),
                         (120, 305), (680, 330), (1280, 165), (1800, 70)]
        # World X/Z, thalweg elevation, half width. Each tributary terminates
        # exactly at a trunk station, so there are no hanging stamped clefts.
        self.channels = [
            [(150, 7480, 245, 75), (0, 7110, 130, 100),
             (-150, 6760, 85, 135), (-80, 6470, 27, 175), (100, 6210, -24, 235)],
            [(-810, 7100, 235, 65), (-640, 6900, 185, 90),
             (-390, 6800, 135, 100), (-150, 6760, 85, 135)],
            [(730, 6960, 200, 65), (610, 6800, 155, 95),
             (260, 6600, 75, 120), (-80, 6470, 27, 175)],
        ]

    def section(self, x, z, plan, top, rear=False):
        across = _linear(plan, x) - z
        peak = _linear(top, x)
        if rear:
            # A broader tilted back range supplies depth behind the broken
            # foreground shoulders, with a different section and bed heights.
            profile = _linear([(-1450, 0), (-700, .14), (-360, .46),
                       (-100, .89), (0, 1), (80, .94), (170, .72),
                       (340, .64), (430, .31), (680, .08), (870, 0)], across)
        else:
            talus = _linear([(-1250, 0), (-620, .15), (-280, .60),
                     (-80, .91), (0, 1), (130, .80), (310, .48),
                     (570, .12), (800, 0)], across)
            beds = _linear([(-1250, 0), (-620, .15), (-280, .60),
                    (-80, .91), (0, 1), (90, .92), (155, .62),
                    (290, .55), (350, .28), (570, .08), (800, 0)], across)
            # Exposed rock is localized to the two larger shoulder noses.
            # Quiet talus between them keeps the whole bank from becoming
            # one repeated staircase around the harbor.
            exposure = max(_window(x, -1140, -350, 130), _window(x, 130, 800, 110))
            profile = talus + (beds - talus) * exposure
        return -35 + (peak + 35) * profile

    def height(self, x, z):
        height = max(self.section(x, z, self.front_plan, self.front_top),
                     self.section(x, z, self.back_plan, self.back_top, True))
        for channel in self.channels:
            for a, b in zip(channel, channel[1:]):
                dx, dz = b[0] - a[0], b[1] - a[1]
                t = max(0, min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)))
                px, pz = a[0] + dx * t, a[1] + dz * t
                distance = math.hypot(x - px, z - pz)
                width = a[3] + (b[3] - a[3]) * t
                if distance >= width:
                    continue
                floor = a[2] + (b[2] - a[2]) * t
                # Narrow rock beds pass into a wider concave rubble channel.
                # Its floor gradient and increasing downstream width make a
                # continuous erosion system instead of decorative rock cuts.
                cross = _linear([(0, 0), (.12, .03), (.34, .45),
                                 (.68, .78), (1, 1)], distance / width)
                height = min(height, floor + max(0, height - floor) * cross)
        return height


class DistantRidges:
    """Continuous unequal crowns beyond the occupied engineering benches.

    The ridge plans are long connected lines, with broad saddles and sloping
    feet. They replace the road-derived flat crown rather than stamping little
    outcrops on it. The same field continues through the coarse outer apron.
    """
    def __init__(self, context, harbor):
        self.harbor = harbor
        self.harbor_rear = HarborRearLandform()
        self.impoundments = [b['end'] for b in context['basins'][:-1]]
        self.dam_left, self.dam_right = context['world_left'], context['world_right']
        self.neighbor_bins = {}
        for sample in context['samples']:
            p = sample['p']; key = (math.floor(p[0] / 320), math.floor(p[2] / 320))
            self.neighbor_bins.setdefault(key, []).append((p[0], p[2]))
        self.west_crest = [(-1800, 4170), (-550, 4440), (350, 3860),
                           (1250, 3710), (1880, 3030), (2650, 2580),
                           (3410, 1830), (4250, 1530), (5200, 620),
                           (6100, 380), (7600, -90)]
        self.west_plan = [(-1800, -1850), (-550, -1750), (700, -1940),
                          (1600, -1570), (2800, -2020), (4200, -1630),
                          (5900, -1800), (7600, -1650)]
        self.east_crest = [(-1800, 4030), (-450, 4290), (550, 3710),
                           (1250, 2990), (2150, 2800), (2860, 2130),
                           (3680, 1810), (4500, 1060), (5500, 560),
                           (6500, 230), (7900, -90)]
        self.east_plan = [(-1800, 2390), (-200, 2220), (900, 2430),
                          (1850, 2270), (2900, 2530), (4200, 2210),
                          (5700, 2370), (7900, 2120)]

    def civil_clearance(self, x, z):
        bx, bz = math.floor(x / 320), math.floor(z / 320)
        distance = 800 ** 2
        for ix in range(bx - 3, bx + 4):
            for iz in range(bz - 3, bz + 4):
                for px, pz in self.neighbor_bins.get((ix, iz), []):
                    distance = min(distance, (px - x) ** 2 + (pz - z) ** 2)
        civil = _smooth((math.sqrt(distance) - 425) / 375)
        # Full-width reservoir crests are occupied civil works too. Keep a
        # continuous abutment bench at their line, then join the natural ridge
        # beyond it; new high ground must not swallow the crest/outlet ends.
        outside = max(0, self.dam_left - x, x - self.dam_right)
        for dam_z in self.impoundments:
            clearance = math.hypot(max(0, abs(z - dam_z) - 65), outside)
            civil *= _smooth(clearance / 200)
        return civil

    def weights(self, x, z):
        along, lateral = self.harbor.coordinates(x, z)
        port = _smooth((along - 1220) / 390) * _smooth((1900 - abs(lateral)) / 500)
        west = _smooth((-900 - x) / 750)
        east = _smooth((x - 1320) / 700)
        # The rear Harbor ridge owns the low southern skyline; longitudinal
        # outer-bank ridges taper into it rather than crossing as two ranges.
        sides = 1 - _smooth((z - 5800) / 900)
        civil = self.civil_clearance(x, z)
        return west * sides * civil, east * sides * civil, port * civil

    def influence(self, x, z):
        return max(self.weights(x, z))

    def height(self, x, z, previous):
        west, east, port = self.weights(x, z)
        for side, weight, plan, crest in [(-1, west, self.west_plan, self.west_crest),
                                          (1, east, self.east_plan, self.east_crest)]:
            if not weight:
                continue
            across = (x - _linear(plan, z)) * side
            width = 1350 if across < 0 else 1900
            relief = 720 if side < 0 else 660
            # A steep inner shoulder opens onto a long, lower outer talus.
            # Unequal crest elevations/plan bends create the macro silhouette.
            target = _linear(crest, z) - relief * (abs(across) / width) ** 1.25
            previous += (target - previous) * weight
        if port:
            target = self.harbor_rear.height(x, z)
            previous += (target - previous) * port
        return previous


def _bank_hash(a, b, seed):
    n=(int(a)*374761393+int(b)*668265263+seed*1442695041)&0xffffffff
    n=((n^(n>>13))*1274126177)&0xffffffff
    return ((n^(n>>16))&0xffffff)/16777215


def _bank_curve(points, value):
    if value<=points[0][0]:return points[0][1]
    for (a,x),(b,y) in zip(points,points[1:]):
        if value<=b:return x+(y-x)*_smooth((value-a)/(b-a))
    return points[-1][1]


class FracturedBankSector:
    """Dense fractured skin enclosing one thick, rooted geological volume.

    Macro buttresses, medium joint cells and shallow weathered bed breaks are
    separate scales. The surface is continuous through those cuts; it is not
    assembled from plates or detached rock blocks. Talus and buried joins are
    smooth and share the same closed physical volume.
    """
    def __init__(self, name, axis, controls, seed, columns, wall_rows, talus_rows,
                 toe_depth, back_depth, scars, join_parent=False):
        self.name,self.axis,self.controls,self.seed=name,axis,controls,seed
        self.columns,self.wall_rows,self.talus_rows=columns,wall_rows,talus_rows
        self.toe_depth,self.back_depth,self.scars=toe_depth,back_depth,scars
        self.back_rows=8
        self.join_parent=join_parent
        self.context=None
        self.facing=1
        self.medium_joint=(22,17,5.2);self.small_joint=(9.5,8,1.25);self.bed_scale=17.5
        self.u0,self.u1=controls[0][0],controls[-1][0]
        self.curves=[[(p[0],p[k])for p in controls]for k in range(1,5)]

    def uv(self,x,z):return (x,z)if self.axis=='x'else(z,x*self.facing)
    def point(self,u,y,v):return (u,y,v)if self.axis=='x'else(v*self.facing,y,u)
    def parameters(self,u):return [_bank_curve(curve,u)for curve in self.curves]

    def parent_sample_region(self,u,v):
        return self.u0-300<u<self.u1+300 and 1250<v<2350

    def extra_stations(self):
        return ([self.u0-240+8*i for i in range(30)],
                [self.u1+8*i for i in range(1,31)])

    def joined_frame(self,u):
        front,crown,height,lean=self.parameters(u)
        land=self.context['land_height']
        crown=min(crown,max(land(self.point(u,0,front+d)[0],self.point(u,0,front+d)[2]) for d in [100,180,260,300]))
        crown-=1.8+max(0,self.joint_relief(u,crown,27,20,self.seed+61,4.8))
        wave=19*math.sin((u-self.u0)*.010)+9*math.sin((u-self.u0)*.023+.6)
        # Unequal connected debris aprons extend well beyond the excavation.
        apron=330+44*math.exp(-((u-1570)/110)**2)+28*math.exp(-((u-1920)/150)**2)
        return front,crown,height,lean,front-apron+wave,front+self.back_depth

    def joined_weight(self,u,v,front):
        # The end of the rock face bends obliquely into a broad shoulder. A
        # single vertical station can no longer expose a rectangular cut wall.
        start=self.u0-170+.24*(v-front)
        end=self.u1+155-.13*(v-front)
        return _window(u,start,end,225)

    def talus_height(self,u,v,t,base,foot_y):
        chute_center=self.scars[-1][0] if self.scars else (self.u0+self.u1)/2
        chute=max(0,1-abs(u-chute_center)/65)**2
        return (foot_y+(base-foot_y)*t**1.16-chute*9*math.sin(math.pi*t)
                +1.8*math.sin(u*.047+v*.023)*math.sin(math.pi*t)**2)

    def joined_cut(self,u,v,previous):
        if not self.u0-250<u<self.u1+250:return previous
        front,crown,height,lean,foot,back=self.joined_frame(u)
        if not foot<v<back:return previous
        side=self.joined_weight(u,v,front)
        if not side:return previous
        base=crown-height;wall=front-lean+self.relief(u,base,0)
        if v<wall:
            t=max(0,min(1,(v-foot)/(wall-foot)))
            point=self.point(u,0,foot);foot_y=self.context['land_height'](point[0],point[2])
            shape=self.talus_height(u,v,t,base,foot_y)
            target=previous+(shape-previous)*_smooth(t/.55)
            cross=_smooth(t/.22)
        elif v<front+36:
            target=base-10;cross=1
        else:
            t=max(0,min(1,(v-front-36)/(back-front-36)))
            target=crown+(previous-crown)*_smooth(t)
            cross=1-_smooth((t-.62)/.38)
        # Excavate only below the same shoulder/talus profile that covers it.
        # The old flat base-minus-175 cut left a visible moat and straight ends.
        return min(previous,previous+(target-previous)*side-48*side*cross)

    def cut_ground(self,x,z,previous):
        u,v=self.uv(x,z)
        if self.join_parent:return self.joined_cut(u,v,previous)
        if not self.u0<u<self.u1:return previous
        front,crown,height,lean=self.parameters(u)
        across=v-front
        start,end=-self.toe_depth+38,self.back_depth-38
        if not start<across<end:return previous
        weight=_window(u,self.u0,self.u1,65)*_window(across,start,end,45)
        target=crown-height-175
        return previous+(min(previous,target)-previous)*weight

    def joint_relief(self,u,y,scale_u,scale_y,seed,depth):
        # Unequal cellular joints in two oblique coordinate families. The
        # nearest-cell planes form small solid facets; cell boundaries recess
        # into the rock. They are real geometry at 8–25 m, not shader grain.
        a=u/scale_u+y*.0071;b=y/scale_y-u*.0037
        ia,ib=math.floor(a),math.floor(b);nearest=[]
        for i in range(ia-1,ia+2):
            for j in range(ib-1,ib+2):
                du=a-(i+.15+.7*_bank_hash(i,j,seed))
                dv=b-(j+.15+.7*_bank_hash(i,j,seed+1))
                nearest.append((du*du+dv*dv,i,j,du,dv))
        nearest.sort(key=lambda p:p[0]);first,second=nearest[:2]
        _,i,j,du,dv=first
        fracture=max(0,1-(math.sqrt(second[0])-math.sqrt(first[0]))/.24)
        tilt=(du*(_bank_hash(i,j,seed+2)-.5)+dv*(_bank_hash(i,j,seed+3)-.5))*2.1
        return depth*(fracture*fracture*.85+tilt*.25+(_bank_hash(i,j,seed+4)-.5)*.22)

    def relief(self,u,y,t):
        middle=self.joint_relief(u,y,*self.medium_joint[:2],self.seed,self.medium_joint[2])
        small=self.joint_relief(u,y,*self.small_joint[:2],self.seed+19,self.small_joint[2])
        # Short weathered beds share a geological dip but end at joint zones.
        bed=(y+.052*u)/self.bed_scale;phase=bed-math.floor(bed)
        bed_cut=max(0,1-abs(phase-.18)/.16)
        locality=.25+.75*_bank_hash(math.floor(u/47),math.floor(bed),self.seed+41)
        value=middle+small+bed_cut*locality*2.3
        for center,width,drift,depth,low,high in self.scars:
            line=center+drift*(t-.5)
            across=abs(u-line)/width
            if across<1:
                value+=depth*(1-across)**1.4*_window(t,low,high,.18)
        # Relief fades before the buried side ends, not before every facet.
        return value*_window(u,self.u0,self.u1,45)

    def build(self,context):
        mesh,land=context['mesh'],context['land_height']
        ground_vertices,ground_faces=[],[]
        for record in context['solids']:
            if not any(key in record['name']for key in ['gorge landform','outer gorge slope']):continue
            start=len(ground_vertices)
            ground_vertices.extend(Vector((p[0],p[2],-p[1]))for p in record['vertices'])
            for f in record['faces']:
                ground_faces.extend((start+f[0],start+f[j],start+f[j+1])for j in range(1,len(f)-1))
        tree=context['BVHTree'].FromPolygons(ground_vertices,ground_faces,all_triangles=True)
        old_tree=None
        if self.join_parent:
            # Reconstruct the actual parent triangles before this bounded cut.
            # Sampling this mesh rather than an unrelated analytic datum keeps
            # the transition seated even across the outer apron triangulation.
            old_vertices=[]
            for p in ground_vertices:
                u,v=self.uv(p.x,p.z)
                old_vertices.append(Vector((p.x,land(p.x,p.z),p.z))
                    if self.parent_sample_region(u,v) else p)
            old_tree=context['BVHTree'].FromPolygons(old_vertices,ground_faces,all_triangles=True)
        def ground(u,v):
            x,_,z=self.point(u,0,v)
            hit=tree.ray_cast(Vector((x,10000,z)),Vector((0,-1,0)),20000)[0]
            return hit.y if hit is not None else land(x,z)
        def old_land(u,v):
            x,_,z=self.point(u,0,v);return land(x,z)
        def parent_ground(u,v):
            if old_tree is None:return ground(u,v)
            x,_,z=self.point(u,0,v)
            hit=old_tree.ray_cast(Vector((x,10000,z)),Vector((0,-1,0)),20000)[0]
            return hit.y if hit is not None else land(x,z)
        vertices,faces=[],[];face_zones=[];max_crown=-1e9
        stations=[self.u0+(self.u1-self.u0)*i/self.columns for i in range(self.columns+1)]
        if self.join_parent:
            before,after=self.extra_stations();stations=before+stations+after

        for u in stations:
            front,crown,height,lean=self.parameters(u)
            if self.axis=='z':
                # This higher sector replaces an existing eastern ridge. Its
                # back-slope datum bounds the crown so no taller skyline is added.
                crown=min(crown,max(old_land(u,front+d)for d in [100,180,260,300]))
            # Erosion cuts down from the retained crown. It cannot create a
            # new taller skyline; weathering has broad and small components.
            crown-=1.8+max(0,self.joint_relief(u,crown,27,20,self.seed+61,4.8))
            max_crown=max(max_crown,crown)
            base=crown-height
            toe_wave=13*math.sin((u-self.u0)*.014)+6*math.sin((u-self.u0)*.031+.6)
            foot_v=front-self.toe_depth+toe_wave;back_v=front+self.back_depth
            if self.join_parent:
                front,crown,height,lean,foot_v,back_v=self.joined_frame(u)
                base=crown-height
                foot_y,back_y=parent_ground(u,foot_v),parent_ground(u,back_v)
            else:foot_y,back_y=ground(u,foot_v)-24,ground(u,back_v)-24
            row=[]
            wall_front=front-lean+self.relief(u,base,0)
            # A curved continuous depositional bank replaces triangular fans.
            # One broad channel carries the main ravine into the joined foot.
            chute_center=self.scars[-1][0] if self.scars else (self.u0+self.u1)/2
            chute=max(0,1-abs(u-chute_center)/65)**2
            for j in range(self.talus_rows):
                t=j/(self.talus_rows-1)
                v=foot_v+(wall_front-foot_v)*t
                y=foot_y+(base-foot_y)*(t**1.16)
                y-=chute*9*math.sin(math.pi*t)
                y+=1.8*math.sin(u*.047+v*.023)*math.sin(math.pi*t)**2
                if self.join_parent:
                    parent=parent_ground(u,v)
                    y=parent+(y-parent)*_smooth(t/.55)
                    side=self.joined_weight(u,v,front);cross=_smooth(t/.22)
                    y=parent+(y-parent)*side-16*(1-side*cross)
                    if j==0:y=ground(u,v)-getattr(self,'seam_burial',24)
                row.append(self.point(u,y,v))
            for j in range(1,self.wall_rows+1):
                t=j/self.wall_rows;y=base+height*t
                v=front-lean*(1-t)+self.relief(u,y,t)
                if self.join_parent:
                    parent=parent_ground(u,v);side=self.joined_weight(u,v,front)
                    y=parent+(y-parent)*side-16*(1-side)
                row.append(self.point(u,y,v))
            crest_v=self.uv(row[-1][0],row[-1][2])[1]
            for j in range(1,self.back_rows+1):
                t=j/self.back_rows;v=crest_v+(back_v-crest_v)*t
                # Thick back-slope settles into the pre-existing bank. It is
                # not a thin upper cap or an independently floating plate.
                target=min(crown-5,old_land(u,v)-8)
                y=(crown*(1-_smooth(t))+target*_smooth(t))
                if j==self.back_rows:y=back_y
                if self.join_parent:
                    parent=parent_ground(u,v)
                    y=crown+(parent-crown)*_smooth(t)
                    side=self.joined_weight(u,v,front);cross=1-_smooth((t-.62)/.38)
                    y=parent+(y-parent)*side-16*(1-side*cross)
                    if j==self.back_rows:y=ground(u,v)-getattr(self,'seam_burial',24)
                row.append(self.point(u,y,v))
            side=0 if self.join_parent else 1-_window(u,self.u0,self.u1,60)
            burial=max(0,max(p[1]-ground(*self.uv(p[0],p[2]))+20 for p in row))*side
            if getattr(self,'settle_side_caps',False):
                end=1-_window(u,stations[0],stations[-1],32)
                if end:
                    probes=[]
                    for a,b in zip(row,row[1:]):
                        count=max(1,math.ceil(math.hypot(b[0]-a[0],b[2]-a[2])/5))
                        probes.extend(tuple(a[k]+(b[k]-a[k])*j/count for k in range(3))for j in range(count+1))
                    # Coarse parent faces can dip between cap vertices. Seat
                    # the whole hidden end ring below those sampled faces.
                    burial+=max(0,max(p[1]-ground(*self.uv(p[0],p[2]))+24 for p in probes))*end
            row=[(p[0],p[1]-burial,p[2])for p in row]
            bottom=min(row[0][1],row[-1][1],base-160)-80
            row.extend([self.point(u,bottom,back_v),self.point(u,bottom,foot_v)])
            vertices.extend(row)
        stride=self.talus_rows+self.wall_rows+self.back_rows+2
        for i in range(len(stations)-1):
            for j in range(stride):
                a=i*stride+j;b=i*stride+(j+1)%stride
                c=(i+1)*stride+(j+1)%stride;d=(i+1)*stride+j
                fs=[(a,b,c),(a,c,d)]if(i+j)%2 else[(a,b,d),(b,c,d)]
                faces.extend(fs)
                zone='wall'if self.talus_rows-1<=j<self.talus_rows+self.wall_rows-1 else'talus'
                face_zones.extend([zone,zone])
        for side,start in[(-1,0),(1,(len(stations)-1)*stride)]:
            points=[Vector(p)for p in vertices[start:start+stride]];lookup={tuple(p):start+j for j,p in enumerate(points)}
            for triangle in tessellate_polygon([points]):
                f=tuple(start+p if isinstance(p,int)else lookup[tuple(p)]for p in triangle)
                faces.append(f if side>0 else tuple(reversed(f)));face_zones.append('talus')
        record=mesh(self.name,vertices,faces,context['bedrock'],True)
        # Dense talus is smoothly shaded. The fractured wall preserves real
        # large normal changes without revealing every tessellation diagonal.
        verts=[Vector(p)for p in record['vertices']];fn=[];adj=[[]for p in verts]
        for index,f in enumerate(record['faces']):
            normal=(verts[f[1]]-verts[f[0]]).cross(verts[f[2]]-verts[f[0]])
            fn.append(normal.normalized())
            for k in f:adj[k].append(index)
        nv,nn,nf,lookup=[],[],[],{}
        for index,f in enumerate(record['faces']):
            mapped=[];threshold=math.cos(math.radians(42 if face_zones[index]=='wall' else 78))
            for k in f:
                n=sum((fn[o]for o in adj[k]if fn[index].dot(fn[o])>=threshold),Vector()).normalized()
                key=(k,*(round(v,5)for v in n))
                if key not in lookup:lookup[key]=len(nv);nv.append(tuple(verts[k]));nn.append(tuple(n))
                mapped.append(lookup[key])
            nf.append(tuple(mapped))
        record['vertices'],record['normals'],record['faces']=nv,nn,nf
        result={'name':self.name,'axis':self.axis,'stride':stride,'sections':len(stations),
                'triangles':len(faces),'maximumCrown':round(max_crown,2),
                'mediumFractureScale':[8,25],'closedVolume':True}
        print('DENSE FRACTURED BANK',result,flush=True)
        return result


class JoinedHeroBank(FracturedBankSector):
    """A bounded camera-authored bank seated in the existing basin surface.

    Each receiving bank has its own orientation, cross section, debris apron
    and joint scale. The successful Spillway and Quay sectors retain their
    original parameters and construction; these are separate local volumes.
    """
    def __init__(self,name,axis,controls,seed,columns,wall_rows,talus_rows,
                 apron,back,scars,facing=1,large=False):
        super().__init__(name,axis,controls,seed,columns,wall_rows,talus_rows,
                         apron,back,scars,join_parent=True)
        self.facing=facing;self.apron=apron;self.large=large;self.settle_side_caps=True
        if large:
            self.medium_joint=(34,26,7.4);self.small_joint=(13,11,1.7);self.bed_scale=27
        else:
            self.medium_joint=(18,14,4.3);self.small_joint=(8,6,1.0);self.bed_scale=15

    def parent_sample_region(self,u,v):
        return (self.u0-200<u<self.u1+200
                and min(p[1]for p in self.controls)-self.apron-90<v
                    <max(p[1]for p in self.controls)+self.back_depth+90)

    def extra_stations(self):
        return ([self.u0-120+8*i for i in range(15)],
                [self.u1+8*i for i in range(1,16)])

    def joined_frame(self,u):
        front,crown,height,lean=self.parameters(u);land=self.context['land_height']
        # Preserve the existing ridge elevation and the civil bench behind it.
        crown=min(crown,max(land(self.point(u,0,front+d)[0],self.point(u,0,front+d)[2])
                            for d in [20,50,80,self.back_depth]))
        crown-=1.8+max(0,self.joint_relief(u,crown,27,20,self.seed+61,4.8))
        q=(u-self.u0)/(self.u1-self.u0)
        apron=self.apron+20*math.exp(-((q-.32)/.15)**2)+12*math.exp(-((q-.76)/.18)**2)
        wave=8*math.sin(q*8.4)+4*math.sin(q*18.7+.6)
        return front,crown,height,lean,front-apron+wave,front+self.back_depth

    def joined_weight(self,u,v,front):
        weight=_window(u,self.u0-85+.12*(v-front),self.u1+85-.09*(v-front),105)
        if self.large:
            # The lower ward's occupied frontage follows this diagonal civil
            # bench below the returning road. Keep its existing founded piers
            # and ground, then join the natural wall behind the frontage.
            frontage=_smooth((u+220)/60)
            rear_of_bench=3568+.4*(u+120)
            weight*=1-frontage*(1-_smooth((v-rear_of_bench)/40))
        return weight


class TurbineWesternSpur(JoinedHeroBank):
    """One broken longitudinal spur replacing the two distant cone crowns.

    The plan bends away from the inhabited receiver, crosses a low saddle,
    then turns into the descending gorge. Unequal shoulder lengths and a
    continuous talus apron give the fractured skin substantial geological
    mass; this is not a row of independent peaks behind the city.
    """
    def __init__(self):
        super().__init__(
            'authored connected turbine western broken ridge','z',[
                (3100,900,1660,70,20),(3200,850,1720,110,45),
                (3350,855,1730,130,35),(3460,885,1715,135,30),
                (3560,940,1675,115,35),(3670,1000,1590,80,45),
                (3790,1025,1640,170,40),(3910,1100,1670,200,35),
                (4020,1150,1695,230,40),(4110,1170,1680,240,55),
                (4200,1240,1590,270,45),(4310,1320,1480,300,55),
                (4450,1370,1330,300,50),(4550,1420,1200,220,55)],
            1423,136,28,14,245,190,
            [(3250,35,67,19,.10,.97),(3390,27,-55,16,.22,.88),
             (3510,42,78,23,.14,.95),(3830,39,-82,22,.18,.91),
             (3960,30,65,19,.26,.99),(4090,47,-73,25,.12,.94),
             (4240,36,89,20,.22,.84),(4410,35,-61,18,.13,.92),
             (3720,85,95,36,-.12,1.15)],facing=-1)
        self.medium_joint=(41,31,9.2)
        self.small_joint=(15,11,2.2)
        self.bed_scale=26
        self.back_rows=16
        self.seam_burial=48

    def relief(self,u,y,t):
        value=super().relief(u,y,t)
        if t<=0 or t>=.24:return value
        front,crown,height,lean,foot,back=self.joined_frame(u)
        base_relief=super().relief(u,crown-height,0)
        # Fractures grow into the face above its toe. Recesses cannot swing
        # the lowest wall cells back through the adjoining depositional mesh.
        return base_relief+(value-base_relief)*_smooth(t/.24)

    def joined_weight(self,u,v,front):
        # Both turbine halls and their new rock-anchored cheeks occupy the
        # eastern civil bench. Keep that entire bench, including its ground,
        # before joining the distant natural spur farther west.
        return super().joined_weight(u,v,front)*_smooth((v-760)/85)

    def joined_frame(self,u):
        front,crown,height,lean,foot,back=super().joined_frame(u)
        # Deposits broaden through the large saddle and narrow beneath the
        # compact upper shoulder; neither apron follows a radial cone.
        foot-=42*math.exp(-((u-3730)/180)**2)
        return front,crown,height,lean,foot,back


class QuayAuthoredScarp:
    """Entry point for independently authored, bounded geological sectors."""
    def __init__(self,context):
        self.sectors=[FracturedBankSector(
            'authored connected quay fractured scarp','x',[
                (150,6370,148,100,14),(185,6373,191,112,17),
                (225,6369,218,123,15),(268,6391,208,112,20),
                (310,6423,217,81,13),(352,6425,229,76,17),
                (395,6442,211,72,12),(438,6467,232,94,17),
                (482,6479,246,112,18),(526,6515,232,92,14),
                (568,6535,244,105,16),(612,6563,229,104,18),
                (653,6584,226,100,14),(690,6600,215,98,12)],
            137,90,26,10,215,205,
            [(228,17,31,9,.15,.96),(286,14,-28,10,.32,.97),
             (346,23,36,8,.12,.78),(397,18,-25,9,.25,.97),
             (490,21,27,10,.18,.93),(560,16,-33,8,.30,.98),
             (431,30,-35,16,-.12,1.15)]),
            FracturedBankSector(
                'authored connected spillway eastern fractured bank','z',[
                    (1320,1740,2670,210,35),(1410,1786,2750,260,38),
                    (1515,1848,2775,282,33),(1615,1887,2728,245,28),
                    (1730,1873,2790,290,36),(1828,1906,2720,255,32),
                    (1925,1885,2667,225,25),(2020,1842,2592,182,27),
                    (2090,1806,2510,123,18),(2160,1772,2448,85,14)],
                619,120,34,16,180,360,
                [(1425,23,-53,13,.08,.92),(1545,19,47,11,.22,.98),
                 (1640,28,-62,16,.10,.80),(1758,24,51,12,.28,.98),
                 (1870,22,-39,11,.15,.93),(2020,20,43,10,.18,.96),
                 (1793,43,57,23,-.13,1.15)],join_parent=True)]
        self.sectors.extend([
            JoinedHeroBank(
                'authored connected turbine receiving fractured bank','x',[
                    (-440,3415,1580,925,40),(-365,3440,1565,920,42),
                    (-300,3455,1545,900,38),(-255,3500,1535,530,30),
                    (-200,3600,1545,300,25),(-140,3652,1545,320,24),
                    (-80,3655,1540,300,25),(-20,3690,1190,60,8)],
                881,72,52,14,230,120,
                [(-405,18,34,14,.12,.94),(-350,22,-39,16,.18,.98),
                 (-283,23,44,13,.24,.86),(-218,19,-29,10,.15,.96),
                 (-123,18,23,8,.25,.92),(-322,35,-41,22,-.12,1.15)],large=True),
            JoinedHeroBank(
                'authored connected harbor western fractured shore','z',[
                    (5000,650,170,150,25),(5100,700,165,145,22),
                    (5200,750,150,130,20),(5330,820,140,145,18),
                    (5420,740,145,125,22),(5530,620,140,120,20),
                    (5620,590,130,110,17),(5700,600,110,90,14)],
                1139,100,24,12,135,150,
                [(5070,19,24,8,.15,.97),(5165,22,-31,9,.25,.95),
                 (5280,25,29,10,.15,.82),(5400,18,-23,8,.12,.95),
                 (5530,23,33,10,.27,.94),(5350,41,-38,15,-.12,1.15)],facing=-1),
        ])
        self.sectors.append(TurbineWesternSpur())
        for sector in self.sectors:sector.context=context

    def cut_ground(self,x,z,previous):
        for sector in self.sectors:previous=sector.cut_ground(x,z,previous)
        return previous

    def build(self,context):
        summaries=[sector.build(context)for sector in self.sectors]
        return{**summaries[0],'sectors':summaries,'totalTriangles':sum(s['triangles']for s in summaries)}


class ConnectedGeology:
    def __init__(self, context):
        self.harbor = HarborGeology(context['harbor_origin'], context['harbor_forward'],
                                    context['harbor_right'], context['basins'][-1]['y'])
        self.fields = [self.harbor]
        self.backdrop = DistantRidges(context, self.harbor)
        self.quay_scarp = QuayAuthoredScarp(context)
        up = Vector((0, 1, 0))
        for kind in ['spillway', 'turbine']:
            jump = next(j for j in context['route']['jumps'] if j['id'] == kind + '-leap')
            origin = Vector(context['near'](jump['landingStart'])['p'])
            forward = Vector(context['near'](jump['takeoff'])['t']); forward.y = 0; forward.normalize()
            self.fields.append(HeroEscarpment(origin, forward, up.cross(forward), context['bed'](origin.z), kind, context, jump))

    def coordinates(self, x, z):
        return self.harbor.coordinates(x, z)

    def legacy_influence(self, x, z):
        # Keep the original base-land datum outside the round-six harbor
        # banks. New fields only excavate it; they cannot lift old foundations.
        along, lateral = self.harbor.coordinates(x, z)
        if abs(lateral) <= 520:
            return 0
        return _window(along, -650, 1800, 220) * max(0, 1 - _linear([(1040, 0), (1320, 1)], abs(lateral)))

    def influence(self, x, z):
        return max(self.backdrop.influence(x, z), *(field.influence(x, z) for field in self.fields))

    def height(self, x, z, previous):
        for field in self.fields:
            previous = field.height(x, z, previous)
        return self.backdrop.height(x, z, previous)

    def shade_terrain(self, record):
        # Preserve smooth remote ground, but split normals where the connected
        # authored banks actually change plane. No new physical triangles are
        # introduced, and neighboring nearly coplanar faces remain coherent.
        verts = [Vector(v) for v in record['vertices']]
        faces = record['faces']
        normals = record['normals']
        face_normals, edited = [], []
        adjacent = [[] for _ in verts]
        for index, face in enumerate(faces):
            normal = (verts[face[1]] - verts[face[0]]).cross(verts[face[2]] - verts[face[0]])
            if normal.length_squared:
                normal.normalize()
            face_normals.append(normal)
            center = sum((verts[i] for i in face), Vector()) / len(face)
            edited.append(self.influence(center.x, -center.y) > .55)
            for vertex in face:
                adjacent[vertex].append(index)
        new_vertices, new_normals, new_faces, lookup = [], [], [], {}
        threshold = math.cos(math.radians(32))
        for index, face in enumerate(faces):
            mapped = []
            for vertex in face:
                normal = Vector(normals[vertex])
                if edited[index]:
                    normal = sum((face_normals[other] for other in adjacent[vertex]
                                  if face_normals[index].dot(face_normals[other]) >= threshold), Vector())
                    normal.normalize()
                key = (vertex, *(round(v, 5) for v in normal))
                if key not in lookup:
                    lookup[key] = len(new_vertices)
                    new_vertices.append(tuple(verts[vertex]))
                    new_normals.append(tuple(normal))
                mapped.append(lookup[key])
            new_faces.append(tuple(mapped))
        record['vertices'], record['faces'], record['normals'] = new_vertices, new_faces, new_normals


def create_harbor_geology(context):
    # Keep the builder entry point stable while extending the connected-field
    # implementation to all three hero basins.
    return ConnectedGeology(context)


def build_cliffs(context):
    bedrock = context['bedrock']
    bedrock.diffuse_color = (.32, .34, .33, 1)
    bedrock.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (.32, .34, .33, 1)
    result = {'outcrops': 0, 'connectedHeroBasins': 3, 'unequalSideBanks': 6,
              'offsetRearClosures': 3, 'connectedDistantRidges': 3, 'harborDrainageBranches': 3, 'harborExposedScarps': 2, 'authoredQuayScarp': 1}
    print('CONNECTED HERO GEOLOGY', result, flush=True)
    return result
