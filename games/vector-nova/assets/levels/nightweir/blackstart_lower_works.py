"""A connected lower pressure works seen from the production banked chase.

The small excavation only lowers its bounded footprint. Nearby coarse terrain
triangles receive local refinement so the open trench is a real empty volume.
All coordinates use the production Y-up metre convention.
"""
import math


class LowerWorksExcavation:
    def __init__(self, c):
        self.V = c['Vector']
        frame = c['near'](11020)
        self.along, self.up, self.out = c['axes_at'](frame, -1)
        self.origin = self.V(frame['p']); self.origin.y = 0
        corners = [self.point(x, 0, z) for x in [5, 54] for z in [50, 85]]
        self.bounds = [min(p.x for p in corners), max(p.x for p in corners),
                       min(p.z for p in corners), max(p.z for p in corners)]

    def point(self, x, y, z):
        return self.origin + self.along * x + self.up * y + self.out * z

    def local(self, x, z):
        q = self.V((x, 0, z)) - self.origin
        return q.dot(self.along), q.dot(self.out)

    def weight(self, x, z):
        x, z = self.local(x, z)
        t = max(0, min(1, (x - 5) / 5, (54 - x) / 5,
                       (z - 50) / 5, (85 - z) / 5))
        return t * t * (3 - 2 * t)

    def lower(self, x, z, height):
        weight = self.weight(x, z)
        if not weight:
            return height
        distance, _ = self.local(x, z)
        bed = 856 - (distance - 10) * .35
        return height + (min(height, bed) - height) * weight

    def refine(self, vertices, faces, normals):
        """Retain outer grid edges; resolve only triangles crossing the cut."""
        vs, ns, fs = list(vertices), list(normals), []
        V = self.V
        for face in faces:
            a, b, d = [V(vertices[i]) for i in face]
            if (max(a.x, b.x, d.x) < self.bounds[0] or min(a.x, b.x, d.x) > self.bounds[1]
                    or max(a.z, b.z, d.z) < self.bounds[2] or min(a.z, b.z, d.z) > self.bounds[3]):
                fs.append(face); continue
            normal = (b-a).cross(d-a).normalized()
            gx, gz = -normal.x / normal.y, -normal.z / normal.y
            n = 16; grid = {}
            for i in range(n+1):
                for j in range(n+1-i):
                    u, v = i/n, j/n
                    point = a*(1-u-v) + b*u + d*v
                    point.y = self.lower(point.x, point.z, point.y)
                    base_normal = (V(normals[face[0]])*(1-u-v) + V(normals[face[1]])*u + V(normals[face[2]])*v).normalized()
                    if self.weight(point.x, point.z):
                        def h(dx, dz):
                            px, pz = point.x+dx, point.z+dz
                            raw = a.y + gx*(px-a.x) + gz*(pz-a.z)
                            return self.lower(px, pz, raw)
                        dx, dz = (h(.25,0)-h(-.25,0))/.5, (h(0,.25)-h(0,-.25))/.5
                        world_normal = V((-dx, 1, -dz)).normalized()
                        base_normal = V((world_normal.x, -world_normal.z, world_normal.y))
                    grid[i,j] = len(vs); vs.append(tuple(point)); ns.append(tuple(base_normal))
            for i in range(n):
                for j in range(n-i):
                    fs.append((grid[i,j], grid[i+1,j], grid[i,j+1]))
                    if j < n-i-1:
                        fs.append((grid[i+1,j], grid[i+1,j+1], grid[i,j+1]))
        return vs, fs, ns


def build_lower_works(c):
    V, up = c['Vector'], c['UP']
    excavation = c['lower_works_excavation']
    along, out = excavation.along, excavation.out
    axes = (along, up, out)
    p = excavation.point
    box, mesh, cylinder = c['box'], c['mesh'], c['cylinder']
    concrete, aggregate, brick, iron, steel, zinc, glass, dim, warm, limestone, fixture, wear = (
        c[k] for k in ('concrete','aggregate','brick','iron','steel','zinc','glass','dim','warm','limestone','fixture','wear'))
    first_object, first_solid = len(c['objects']), len(c['solids'])
    foundations, blocks, pipe_ends = [], [], []
    name = 'Lower pressure works / '
    ground = c['land_height']

    def part(label, x, y, z, dims, mat, solid=False, bevel=0, frame=axes):
        return box(name+label, p(x,y,z), dims, mat, frame, solid, bevel)

    def world_mesh(label, points, faces, mat, solid=False):
        return mesh(name+label, [tuple(q) for q in points], faces, mat, solid)

    def beam(label, a, b, width, depth, mat=iron, solid=False):
        a,b = p(*a),p(*b); direction=(b-a).normalized(); cross=direction.cross(out)
        if cross.length < .01: cross=along.copy()
        cross.normalize()
        return box(name+label,(a+b)/2,(width,(b-a).length,depth),mat,(cross,direction,cross.cross(direction).normalized()),solid)

    def ground_record(label, point, bottom, top):
        foundations.append({'name':label,'p':[point.x,bottom,point.z],
                            'terrain':ground(point.x,point.z),'top':top})

    def rooted_volume(label, x,z,w,d,top,mat=brick,solid=True):
        corners=[p(x+xx,0,z+zz) for xx,zz in [(-w/2,-d/2),(w/2,-d/2),(w/2,d/2),(-w/2,d/2)]]
        bottoms=[min(ground(q.x,q.z)-4,top-2) for q in corners]
        world_mesh(label,[V((q.x,y,q.z)) for q,y in zip(corners,bottoms)] + [V((q.x,top,q.z)) for q in corners],
                   [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,solid)
        for q,y in zip(corners,bottoms): ground_record(label,q,y,top)
        return min(bottoms)

    def window_band(label, center, tangent, normal, width, height, count, rows=1, lit=False):
        frame=(tangent,up,-normal); pitch=width/count; cell=height/rows
        # The entire opening is recessed, with broad quiet masonry reveals.
        box(name+label+' deep masonry opening',center-normal*.45,(width+.8,height+.8,1.1),limestone,frame)
        box(name+label+' shaded window recess',center+normal*.13,(width,height,.22),iron,frame)
        for row in range(rows):
            for col in range(count):
                q=center+tangent*((col-(count-1)/2)*pitch)+up*((row-(rows-1)/2)*cell)+normal*.27
                mat=warm if lit and (col+row)%5 in [1,2] else dim if (col+row)%4==0 else glass
                box(name+label+(' court lower gallery occupied window' if lit else ' industrial occupied window'),q,(pitch-.16,cell-.18,.05),mat,frame)

    def occupied_wall(label, x,z,width,low,high,normal,tangent,public=False):
        center=p(x,0,z); frame=(tangent,up,-normal); bays=max(2,round(width/9.5));pitch=width/bays;floors=max(1,math.ceil((high-low)/4.2));floor=(high-low)/floors;opening=min(5.6,pitch-2.4)
        for j in range(bays+1):
            box(name+label+' bearing brick pier',center+tangent*(-width/2+j*pitch)+up*((low+high)/2),(pitch-opening,high-low,1.4),brick,frame)
        for level in range(floors):
            y=low+level*floor
            box(name+label+' brick floor spandrel',center+up*(y+.55),(width,1.1,1.45),brick,frame)
            box(name+label+' masonry lintel',center+up*(y+floor-.28),(width,.56,1.45),brick,frame)
            for j in range(bays):
                q=center+tangent*(-width/2+(j+.5)*pitch)+up*(y+floor/2+.2)
                box(name+label+' recessed working room',q-normal*1.55,(opening,floor-1.25,.65),brick,frame)
                window_band(label+' working rooms',q-normal*1.15,tangent,normal,opening-.7,floor-1.65,2,1,public and level<2)
                box(name+label+' deep sill',q-normal*.7-up*(floor/2-.65),(opening,.25,2.6),limestone,frame)

    def roof(label, center, ridge, cross, width,depth,eave,rise):
        center=V((center.x,eave,center.z));frame=(ridge,up,cross)
        verts=[center+ridge*x+cross*z+up*y for x in [-width/2,width/2] for z,y in [(-depth/2,0),(0,rise),(depth/2,0)]]
        world_mesh(label+' broad zinc gable',verts,[(0,1,4,3),(1,2,5,4),(0,3,5,2),(0,2,1),(3,4,5)],zinc,True)
        box(name+label+' deep bearing cornice',center-up*.5,(width+.8,1.0,depth+.8),concrete,frame)
        box(name+label+' ridge cap',center+up*(rise+.1),(width+1,.24,.55),zinc,frame)
        for side in [-1,1]:
            box(name+label+' heavy eaves gutter',center+cross*(side*(depth/2+.2))-up*.25,(width+1,.55,.8),iron,frame)
        for i in range(max(2,round(width/4))):
            xx=-width/2+(i+.5)*width/max(2,round(width/4))
            for side in [-1,1]:
                a=center+ridge*xx+cross*(side*depth/2)+up*.12;b=center+ridge*xx+up*(rise+.12);direction=(b-a).normalized();normal=direction.cross(ridge).normalized()
                box(name+label+' standing zinc seam',(a+b)/2,(.09,.13,(b-a).length),zinc,(ridge,normal,direction))

    def machine_block(label,x,z,w,d,height,transfer=False,floor_y=None):
        corners=[p(x+xx,0,z+zz) for xx,zz in [(-w/2,-d/2),(w/2,-d/2),(w/2,d/2),(-w/2,d/2)]];levels=[ground(q.x,q.z) for q in corners]
        floor=max(levels[:2])+1 if floor_y is None else floor_y;top=max(floor+height,max(levels)+8);bottom=min(levels)-4
        if not c['clear'](p(x,(bottom+top+1)/2,z),(w+6,top+1-bottom,d+6),axes):
            raise ValueError(name+label+' obstructs the driving envelope')
        # A broad physical body is sufficient; deep visual bays don't carry
        # separate collision surfaces or unnecessary detail colliders.
        part(label+' physical building body',x,(bottom+top+.8)/2,z,(w+1,top+.8-bottom,d+1),aggregate,True);c['objects'].pop()
        rooted_volume(label+' grounded occupied lower body',x,z,w-3.2,d-4,top,brick,False)
        lower=floor-math.ceil((floor-min(levels)+4)/4.2)*4.2
        occupied_wall(label+' roadward lower workshops',x,z-d/2,w,lower,floor,-out,along,True)
        occupied_wall(label+' approaching lower workshops',x-w/2,z,d,lower,floor,-along,-out,False)
        # Human-scale masonry floors continue through exposed hillside faces.
        # The main machine room has fewer, much taller bays than the housing.
        bays=max(2,round(w/13));pitch=w/bays;opening=pitch-2.8
        for j in range(bays+1):part(label+' structural upper bay',x-w/2+j*pitch,(floor+top)/2,z-d/2,(2.8,top-floor,2.0),brick)
        part(label+' upper bearing lintel',x,top-1.0,z-d/2,(w,2,2.3),brick)
        part(label+' main access floor',x,floor+.45,z-d/2+1.4,(w,.9,5),concrete)
        for j in range(bays):
            q=p(x-w/2+(j+.5)*pitch,(floor+top)/2,z-d/2+2)
            window_band(label+' tall machine-room bay',q,along,-out,opening-1.2,min(10,top-floor-4),3,3,False)
            part(label+' machine bay deep sill',x-w/2+(j+.5)*pitch,floor+3,z-d/2+1,(opening,.65,4),concrete)
        # Approach end face: a real inset, horizontally grouped working gallery.
        front=p(x-w/2-.18,floor+(top-floor)*.67,z)
        window_band(label+' approach operating gallery',front,-out,-along,d-7,min(6.6,top-floor-5),max(3,int(d/4)),2,True)
        if transfer:
            # A strong transverse upper operating floor faces the approaching
            # roll, separate from the two inlet collars on the lower wall.
            for y in [floor+4.2,floor+12.6,floor+21.0]:
                part(label+' structural transfer course',x,y,z,(w+.5,.55,d+.5),concrete)
            roof(label,p(x,0,z),out,-along,d+2,w+2,top+.7,6.2)
        else:
            roof(label,p(x,0,z),along,out,w+2,d+2,top+.7,4.6 if label.startswith('upper') else 5.6)
        for xx in [-w/2+3,w/2-3]:
            q=p(x+xx,(floor+top)/2,z+d/2+.3)
            cylinder(name+label+' attached rainwater downpipe',q,.22,top-floor,iron,up,10)
        blocks.append({'name':label,'local':[x,z],'base':list(p(x,floor,z)),'floor':floor,'roof':top,'dimensions':[w,top-floor,d],'groundRange':[min(levels),max(levels)]})
        return floor,top

    # The approach looks down onto this roof. Its centre is a real open
    # assembly court: there is no hidden full-height box below the opening.
    # Unequal roofed ends retain the coherent machine-block silhouette.
    court_x0,court_x1,court_z0,court_z1=-81,-49,26,62
    court_ground=[ground(q.x,q.z) for x in range(court_x0,court_x1+1,2)
                  for z in range(court_z0,court_z1+1,2) for q in [p(x,0,z)]]
    court_floor=max(court_ground)+1.25
    upper_floor,upper_roof=machine_block('upper approach machine wing',-94,44,26,36,12.6,floor_y=court_floor)
    _,far_roof=machine_block('upper descending machine wing',-41,44,16,36,18.9,floor_y=court_floor)
    # The inhabited lower body remains founded in the slope; it stops at the
    # working floor rather than silently filling the court up to the roof.
    rooted_volume('open assembly court occupied lower body',-65,44,32,36,court_floor-.3,brick)
    lower=math.floor((min(court_ground)-4-court_floor)/4.2)*4.2+court_floor
    occupied_wall('assembly court lower workshops',-65,26,32,lower,court_floor,-out,along,True)
    part('open assembly court working floor',-65,court_floor,44,(32,.6,36),concrete,True)
    for x in [-79,-51]:
        part('court floor recessed drainage channel',x,court_floor+.31,43,(.4,.04,31),iron)
    part('court roadward low parapet',-65,court_floor+.85,26.4,(32,1.1,.8),brick,True)
    part('court roadward stone coping',-65,court_floor+1.45,26.4,(32,.18,1.0),limestone)
    # A five-metre-deep occupied working gallery closes the rear, leaving
    # the court itself open to the sky. Its centre is the pressure service bay.
    rooted_volume('court rear pressure-gallery wall',-65,61.5,32,1.6,court_floor+10.1,brick)
    for x in [-80,-70,-60,-50]:
        part('court gallery loadbearing pier',x,court_floor+4.7,55.5,(1.0,9.4,1.25),limestone,True)
    for y in [court_floor+.55,court_floor+4.75]:
        part('court gallery deep access floor',-65,y,58.5,(32,.55,6.5),concrete,True)
    # The banked chase sees this upper gallery from above. An open loggia
    # preserves its occupied back wall instead of covering it with a canopy.
    part('court gallery rear masonry cornice',-65,court_floor+9.7,61.5,(32,.55,1.6),limestone,True)
    part('court open loggia bearing lintel',-65,court_floor+9.45,55.5,(32,.55,1.25),limestone,True)
    for x in [-75,-55]:
        for y in [court_floor+2.65,court_floor+6.95]:
            window_band('court lower gallery occupied control rooms',p(x,y,60.55),along,-out,7.2,2.5,3,1,True)
    part('court central recessed pressure service mouth',-65,court_floor+4.2,60.55,(7.8,7.6,.25),iron)
    for x in [-69.4,-60.6]:
        part('court service mouth substantial jamb',x,court_floor+4.3,60.0,(.8,8.3,1.4),concrete)
    # A bridge crane spans the opening, with runways on four loadbearing
    # columns and genuine foundations shared by the lower occupied body.
    crane_y=court_floor+14.2
    for x in [-80,-50]:
        for z in [29,59]:
            rooted_volume('assembly crane founded bearing',x,z,2.2,2.8,court_floor+.8,concrete)
            part('assembly crane rolled upright',x,(court_floor+crane_y)/2,z,(.85,crane_y-court_floor,.85),iron,True)
            beam('assembly crane corner knee',(x,court_floor+10.5,z),(x,crane_y,z+(3 if z<40 else -3)),.6,.6)
        part('assembly crane continuous runway',x,crane_y,44,(1.15,.85,33),iron,True)
        part('assembly crane bright running rail',x,crane_y+.5,44,(.24,.19,33),steel)
    for z in [40.7,43.3]:
        part('assembly crane travelling plate girder',-65,crane_y+.8,z,(31,1.7,.8),steel,True)
        part('assembly crane girder top flange',-65,crane_y+1.7,z,(31,.16,1.25),steel)
        for x in [-77,-71,-65,-59,-53]:
            part('assembly crane seated web stiffener',x,crane_y+.8,z,(.2,1.6,1.0),iron)
    part('assembly crane maintenance trolley',-68,crane_y+2.0,42,(5.0,.8,5.2),iron)
    cylinder(name+' assembly crane hoist drum',p(-68,crane_y+2.7,42),.8,2.8,steel,along,20)
    for x in [-68.8,-67.2]:
        cylinder(name+' assembly crane suspended hoist cable',p(x,court_floor+12.3,42),.045,9.2,iron,up,8)
    part('assembly crane suspended hook block',-68,court_floor+7.1,42,(2.1,1.15,1.4),steel)
    middle_floor,middle_roof=machine_block('attached descending machine hall',-20,60,56,32,18.9)
    transfer_floor,transfer_roof=machine_block('transverse transfer house',65,72,28,40,33.6,True)

    # The actual excavated maintenance void is 39 x 25 m. The walls follow
    # the descending bed and are founded in its ground, not a raised podium.
    trench_start,trench_end=10,49
    trench_floor=lambda x:856-(x-10)*.35
    for i in range(8):
        x0=trench_start+(trench_end-trench_start)*i/8;x1=trench_start+(trench_end-trench_start)*(i+1)/8
        y0,y1=trench_floor(x0)+.35,trench_floor(x1)+.35
        corners=[p(x,y,z) for x,y in [(x0,y0),(x1,y1)] for z in [55.3,79.7]]
        world_mesh('sloping maintenance trench floor',corners,[(0,2,3,1)],concrete)
        for q in corners:ground_record('maintenance trench floor',q,q.y-1.0,q.y)
        for z in [54.7,80.3]:
            top0=max(y0+4.5,ground(p(x0,0,z).x,p(x0,0,z).z)+.8);top1=max(y1+4.5,ground(p(x1,0,z).x,p(x1,0,z).z)+.8)
            vs=[p(x,y,zz) for x,bottom,top in [(x0,y0-4,top0),(x1,y1-4,top1)] for zz in [z-.65,z+.65] for y in [bottom,top]]
            world_mesh('grounded trench retaining cheek',vs,[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)],brick,True)
            for x,y in [(x0,y0-4),(x1,y1-4)]:ground_record('trench retaining cheek',p(x,0,z),y,max(top0,top1))
            a,b=p(x0,top0+.15,z),p(x1,top1+.15,z);direction=(b-a).normalized();normal=out.cross(direction).normalized()
            box(name+' continuous trench coping',(a+b)/2,(.4,.75,(b-a).length+.2),limestone,(out,normal,direction))
    # Two service galleries and a stair make the cavity useful at human scale.
    for z in [57.5,77.5]:
        for i in range(4):
            x=15+i*9.8;y=trench_floor(x)+3.3
            part('trench inspection gallery floor',x,y,z,(10.1,.45,3.8),iron,True)
            part('trench handrail',x,y+1.0,z+(-1.8 if z<65 else 1.8),(10.0,.12,.12),iron)
            for xx in [-4.5,4.5]:part('trench gallery guard upright',x+xx,y+.6,z+(-1.8 if z<65 else 1.8),(.12,1.2,.12),iron)
            part('gallery masonry bearing bracket',x,y-1.5,z+(-1 if z<65 else 1),(1.0,3.0,2.5),concrete)
    def service_stair(label,a,b,width):
        first=len(c['solids']);before=len(c['objects'])
        c['public_stairs'](name+label,a,b,width)
        if len(c['objects'])==before:return
        del c['solids'][first:]
        run=V((b.x-a.x,0,b.z-a.z)).normalized();cross=up.cross(run)
        points=[q+cross*x+up*y for q in [a,b] for y in [-1.0,-.15] for x in [-width/2,width/2]]
        world_mesh(label+' continuous structural stair slab',points,
                   [(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3),(0,1,3,2),(4,6,7,5)],concrete,True)
    service_stair('open assembly court gallery stair',p(-52,court_floor+.35,44),p(-52,court_floor+5.03,55.3),3.2)
    service_stair('descending trench service stair',p(7,middle_floor+.4,50),p(45,trench_floor(45)+3.5,57.5),4.5)
    service_stair('transfer house service entrance',p(45,trench_floor(45)+3.5,77.5),p(52,transfer_floor+.4,77.5),4.5)

    def pressure_path(label,local_points,radius):
        points=[p(*q) for q in local_points];path=[points[0]]
        # Rounded elbows share one continuous skinned pipe; tangent changes
        # are cast bends, not intersecting capped cylinders.
        for i in range(1,len(points)-1):
            before,corner,after=points[i-1:i+2];cut=min(4.5,(corner-before).length*.28,(after-corner).length*.28)
            a=corner+(before-corner).normalized()*cut;b=corner+(after-corner).normalized()*cut
            path.append(a)
            for step in range(1,7):
                t=step/6;path.append(a*((1-t)**2)+corner*(2*(1-t)*t)+b*(t*t))
        path.append(points[-1]);vertices=[];normals=[];sides=24
        for i,q in enumerate(path):
            tangent=((path[min(i+1,len(path)-1)]-path[max(i-1,0)])).normalized();u=tangent.cross(up)
            if u.length<.001:u=out.copy()
            u.normalize();v=tangent.cross(u).normalized()
            for side in range(sides):
                angle=side*math.tau/sides;n=u*math.cos(angle)+v*math.sin(angle);vertices.append(q+n*radius);normals.append((n.x,-n.z,n.y))
        faces=[]
        for i in range(len(path)-1):
            faces.extend((i*sides+k,i*sides+(k+1)%sides,(i+1)*sides+(k+1)%sides,(i+1)*sides+k) for k in range(sides))
        obj=world_mesh(label+' continuous cast pressure main',vertices,faces,steel,True);obj['normals']=normals;obj['smooth']=True
        for i in [0,7,len(path)-2]:
            direction=(path[min(i+1,len(path)-1)]-path[max(i-1,0)]).normalized()
            cylinder(name+label+' machined union collar',path[i],radius+.28,.7,iron,direction,24)
        pipe_ends.append({'name':label,'start':list(points[0]),'end':list(points[-1])})

    # The visible court contains one large header connected through both
    # roofed wings and into the recessed pressure bay, not capped loose props.
    header_y=court_floor+4.15
    pressure_path('assembly court main header',[(-85,header_y,39.5),(-65,header_y,39.5),(-45,header_y,39.5)],2.3)
    pressure_path('assembly court pressure service branch',[(-65,header_y,39.5),(-65,header_y,50),(-65,header_y,62.5)],1.65)
    for x in [-77,-55]:
        part('assembly header seated concrete saddle',x,court_floor+1.25,39.5,(3.1,2.5,5.6),concrete,True)
        cylinder(name+' assembly header restrained bearing hoop',p(x,header_y,39.5),2.57,.65,iron,along,28)
    cylinder(name+' assembly header cast valve body',p(-65,header_y,39.5),2.85,3.0,steel,along,28)
    cylinder(name+' assembly header service spindle',p(-65,header_y+3.5,39.5),.32,2.6,steel,up,12)
    cylinder(name+' assembly header broad valve wheel',p(-65,header_y+4.85,39.5),1.6,.2,iron,up,24)
    for x in [-80.5,-49.5]:
        cylinder(name+' assembly hall masonry entry flange',p(x,header_y,39.5),2.8,.8,iron,along,28)
    cylinder(name+' assembly service bay inlet flange',p(-65,header_y,60.4),2.1,.8,iron,out,24)

    for index,z in enumerate([63,72]):
        entry_y=transfer_floor+9+index*8.4
        # The upstream pipe starts inside the connected machine block. Its
        # visible run emerges through a collar and drops into the open trench.
        pressure_path('pressure line '+str(index+1),[(-28,middle_floor+8+index*4.2,z),(12,middle_floor+8+index*4.2,z),(24,trench_floor(24)+13+index*8.4,z),(39,entry_y,z),(54,entry_y,z)],2.1)
        cylinder(name+' machine-hall outlet union',p(8,middle_floor+8+index*4.2,z),2.7,1.3,iron,along,28)
        cylinder(name+' transferhouse wall inlet collar',p(50.7,entry_y,z),3.05,1.3,iron,along,28)
        cylinder(name+' transferhouse recessed socket',p(51.6,entry_y,z),2.6,2.6,steel,along,28)
        for x in [28,37]:
            t=(x-24)/15;y=(trench_floor(24)+13+index*8.4)*(1-t)+entry_y*t;floor=trench_floor(x)
            part('trench pressure pipe loadbearing saddle',x,(floor-2+y-2.0)/2,z,(3.2,y-2.0-floor+2,5.2),concrete,True)
            ground_record('pressure pipe saddle',p(x,0,z),floor-2,y-2.0)
            cylinder(name+' saddle restrained pipe hoop',p(x,y,z),2.4,.55,iron,along,24)
        # A seated valve gives the pipe's termination a functional destination.
        cylinder(name+' transfer inlet shutoff spindle',p(48.3,entry_y+2.6,z),.32,2.7,wear,up,12)
        cylinder(name+' inlet valve wheel',p(48.3,entry_y+4.0,z),1.1,.18,iron,up,16)
    # Reuse the one existing focused practical in the visible court. Its
    # shield and source sit together below the runway, away from the walls.
    lamp_x,lamp_z,lamp_y=-51.5,48,crane_y-.65
    part('court worklight bearing bracket',lamp_x,lamp_y+.35,lamp_z,(3.5,.3,.5),iron)
    part('shielded assembly court worklight',lamp_x-1.2,lamp_y,lamp_z,(2.8,.65,1.7),iron)
    part('court worklight recessed lens',lamp_x-1.2,lamp_y-.36,lamp_z,(2.25,.07,1.1),fixture)
    c['lights'].append({'p':list(p(lamp_x-1.2,lamp_y-1.05,lamp_z)),
                        'power':900,'color':'#dcc5a3','radius':48,'pocket':True,
                        'focusRange':[10780,11200]})
    return {'newObjects':len(c['objects'])-first_object,'newSolids':len(c['solids'])-first_solid,
            'blocks':blocks,'foundationSamples':foundations,'pressureTerminations':pipe_ends,
            'assemblyCourt':{'along':[-80,-50],'out':[27,61],'floor':court_floor,'craneRail':crane_y},
            'trench':{'along':[10,49],'out':[55,80],'startFloor':856,'endFloor':842.35},
            'excavationBounds':excavation.bounds}
