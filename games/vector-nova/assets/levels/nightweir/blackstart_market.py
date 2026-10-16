"""Occupied market service floors beneath two existing hillside street blocks.

The uphill masonry retains the slope. Its downhill twelve metres are actual
rooms, galleries and a freight intake, rather than a filled civil pedestal.
"""
import math


def build_market_base(c, base, width, depth, axes, index):
    V, up = c['Vector'], c['UP']
    along, _, out = axes
    box, mesh, ground = c['box'], c['mesh'], c['land_height']
    first_object, first_solid = len(c['objects']), len(c['solids'])
    prefix = 'Market occupied lower street %d / ' % index
    upper_base, upper_width = base.copy(), width
    if index == 10:
        # The older plots overlap at this bend. Their upper street remains a
        # shared deck, but the lower occupied ranges meet at a party wall.
        base = base + along*12
        width -= 24
    foundations = []
    front = -depth / 2
    recess = 12.5
    floor_h = 3.65

    def at(x, y, z):
        return base + along*x + up*y + out*z

    def part(name, p, size, material, solid=False, own_axes=axes):
        return box(prefix+name, p, size, c[material], own_axes, solid)

    def rooted(name, x0, x1, z0, z1, top, material='brick'):
        corners = [at(x, 0, z) for x, z in [(x0,z0),(x1,z0),(x1,z1),(x0,z1)]]
        bottoms = [min(ground(p.x,p.z)-4,base.y+top-.5) for p in corners]
        mesh(prefix+name, [(p.x,y,p.z) for p,y in zip(corners,bottoms)] +
             [(p.x,base.y+top,p.z) for p in corners],
             [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], c[material], True)
        for p,y in zip(corners,bottoms):
            foundations.append({'name':name,'p':[p.x,y,p.z],'terrain':ground(p.x,p.z)})

    # This is the real retaining core, behind the occupied galleries. No
    # hidden full-width front wall remains behind shallow decorative glazing.
    rooted('uphill retained masonry core', -width/2, width/2, front+recess, depth/2, 0, 'aggregate')
    for side in [-1,1]:
        x = side*(width/2-.8)
        rooted('full-depth grounded end return', x-.8,x+.8,front,front+recess,0)
    part('upper connected street bearing deck', upper_base+up*.4, (upper_width+1,.8,depth+1), 'concrete', True)

    # The freight room is a genuinely open two/three-storey bay. Its floor
    # is a raised dispatch level, supported above the lower occupied galleries
    # and kept clear of actual terrain. Founded cheeks enclose its depth.
    freight = None
    if index == 10:
        freight_x, freight_w = 2.0, 30.0
        samples = [at(freight_x+x,0,front+z) for x in [-freight_w/2,0,freight_w/2] for z in [0,recess/2,recess]]
        floor = max(-25.55, math.ceil((max(ground(p.x,p.z) for p in samples)+.8-base.y)/floor_h)*floor_h)
        roof = min(0,floor+10.95)
        if roof-floor < 7.0:
            raise ValueError(prefix+'insufficient clear height for the freight intake')
        freight = {'x':freight_x,'width':freight_w,'floor':floor,'roof':roof}

    def spans(y):
        if freight and freight['floor']+.1 < y < freight['roof']-.1:
            a,b = freight['x']-freight['width']/2,freight['x']+freight['width']/2
            return [(-width/2,a),(b,width/2)]
        return [(-width/2,width/2)]

    ground_front = [ground(at(x,0,front).x,at(x,0,front).z) for x in [-width/2,0,width/2]]
    rows = math.ceil((base.y-min(ground_front)+4)/floor_h)
    bays = max(5,round(width/10))
    pitch = width/bays
    # Four or five occupied storeys sit between each open public gallery.
    # The three unequal facade depths form substantial masonry ranges. Floor
    # slabs inside the rooms do not become exposed horizontal lattice outside.
    for row in range(-rows,0):
        y = row*floor_h
        gallery = (row + index) % 6 == 0
        for left,right in spans(y+.3):
            part('inhabited lower gallery floor',at((left+right)/2,y+.18,front+recess/2),
                 (right-left,.36,recess), 'concrete',True)
            if gallery:
                part('deep public gallery bearing ledge',at((left+right)/2,y+.42,front+.6),
                     (right-left,.55,2.2),'limestone')
                part('recessed public gallery handrail',at((left+right)/2,y+1.28,front+.25),
                     (right-left,.12,.16),'iron')
        for bay in range(bays+1):
            x = (bay-bays/2)*pitch
            if freight and abs(x-freight['x']) < freight['width']/2-.5 and freight['floor'] <= y < freight['roof']:
                continue
            p=at(x,y+floor_h/2,front+1.6)
            if p.y+floor_h/2 < ground(p.x,p.z)-1:
                continue
            part('continuous structural masonry pier',p,(2.1,floor_h,4.2),'brick',True)
            if gallery:
                part('public rail upright',at(x,y+.88,front+.25),(.16,1.3,.16),'iron')
        for bay in range(bays):
            x=(bay+.5-bays/2)*pitch
            if freight and abs(x-freight['x']) < freight['width']/2+pitch/2 and freight['floor'] <= y < freight['roof']:
                continue
            q=at(x,y+1.95,front+9.0)
            if q.y+1.5 < ground(q.x,q.z)-.5:
                continue
            # Inhabited fronts advance in three broad stepped ranges. Their
            # lower service rooms are sheltered behind real 2.4 m thick walls.
            mass = min(2,int(bay*3/bays))
            face_z = front + [1.0,3.6,1.8][mass]
            quiet = (bay+index)%5 in [0,1]
            skin = 'brick' if mass != 1 else 'aggregate'
            if gallery:
                part('occupied gallery room rear wall',q+out*.5,(pitch-2.1,3.1,1),'brick')
                part('recessed gallery room opening',q-out*.12,(pitch-3.4,2.4,.3),'iron')
                part('deep gallery occupied window',q-out*.32,(pitch-4.0,2.0,.05),
                     'dim' if (bay+row+index)%3 else 'warm')
                part('gallery room entrance door',q+along*(pitch*.32)-out*.2,(1.2,2.5,.12),'iron')
            elif quiet:
                part('substantial masonry storage range',at(x,y+floor_h/2,face_z+1.2),
                     (pitch-1.7,floor_h,2.4),skin,True)
                # Narrow clerestories distinguish storage from occupied shops.
                if (row+index)%3==0:
                    part('storage room clerestory reveal',at(x,y+2.7,face_z-.18),(pitch*.48,.85,.4),'iron')
                    part('storage room clerestory glass',at(x,y+2.7,face_z-.39),(pitch*.44,.62,.05),'glass')
            else:
                opening = min(4.2,pitch-4.0)
                pier = (pitch-1.7-opening)/2
                part('occupied masonry spandrel',at(x,y+.5,face_z+1.2),(pitch-1.7,1.0,2.4),skin,True)
                part('occupied masonry lintel',at(x,y+3.4,face_z+1.2),(pitch-1.7,.5,2.4),skin,True)
                for sign in [-1,1]:
                    part('occupied masonry window cheek',at(x+sign*(opening/2+pier/2),y+2.075,face_z+1.2),
                         (pier,2.15,2.4),skin,True)
                part('deep inhabited window inner frame',at(x,y+2.08,face_z+1.5),(opening,2.15,.3),'iron')
                part('stepped market occupied room glass',at(x,y+2.08,face_z+1.31),(opening-.45,1.8,.05),
                     'warm' if (bay+index+row//3)%7==0 else 'dim' if (bay+row//3)%3==0 else 'glass')
                part('recessed stone window sill',at(x,y+1.05,face_z+1.1),(opening+.3,.22,2.3),'limestone')

    # A twelve-metre stair bay links each occupied gallery. Paired flights and
    # intermediate landings stay inside the actual opening, not on a slab
    # filled from the hillside to the highest corner of the whole block.
    stair_x=-width*.35
    for row in range(-rows,0):
        y=row*floor_h
        for flight in [0,1]:
            sign=1 if flight==0 else -1
            z=front+3+flight*4.6
            count=11
            for step in range(count):
                xx=stair_x+sign*(-4+(step+.5)*8/count)
                yy=y+flight*floor_h/2+(step+.5)*floor_h/(2*count)
                p=at(xx,yy,z)
                if p.y < ground(p.x,p.z)-1:
                    continue
                part('public stair tread',p,(8/count+.06,.22,3.7),'limestone')
            part('stair half landing',at(stair_x+sign*4,y+(flight+1)*floor_h/2,z),
                 (2.4,.3,4.4),'concrete',True)

    # Corbels carry the existing ten-metre upper public-street projection
    # back into the masonry bay structure beneath the retained roofline.
    for j in range(max(3,round(width/24))):
        x=(j-(max(3,round(width/24))-1)/2)*(width/max(3,round(width/24)))
        a=at(x,-.75,front-9);b=at(x,-.75,front+3);d=at(x,-6,front+3)
        verts=[tuple(p+along*dx)for dx in [-.7,.7]for p in [a,b,d]]
        mesh(prefix+'founded upper street corbel',verts,[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],c['concrete'],True)

    # Each short ground street has its own level. The next level is reached
    # by an explicit stair, instead of one sixty-metre retaining ramp.
    street_points=[]
    for bay in range(bays):
        x=(bay+.5-bays/2)*pitch
        corners=[at(x+xx,0,front-zz) for xx in [-pitch/2,pitch/2] for zz in [1,5]]
        level=max(ground(p.x,p.z) for p in corners)+.45
        y=level-base.y
        rooted('short grounded shop entrance street',x-pitch/2,x+pitch/2,front-5,front-1,y,'brick')
        part('worn entrance paving',at(x,y+.12,front-3),(pitch,.24,4),'limestone',True)
        street_points.append({'x':x,'y':y})
    for a,b in zip(street_points,street_points[1:]):
        count=max(1,math.ceil(abs(b['y']-a['y'])/.18))
        run=min(pitch*.8,max(1,count*.28));mid=(a['x']+b['x'])/2
        for step in range(count):
            p=at(mid-run/2+(step+.5)*run/count,a['y']+(step+.5)*(b['y']-a['y'])/count+.14,front-3)
            part('stepped shop street connection',p,(run/count+.04,.28,4.1),'concrete')

    if freight:
        x,w,y,roof=freight['x'],freight['width'],freight['floor'],freight['roof']
        for side in [-1,1]:
            rooted('freight intake bearing cheek',x+side*w/2-1.1,x+side*w/2+1.1,front,front+recess,roof)
        part('freight intake bearing lintel',at(x,roof-.45,front+recess/2),(w+2.2,.9,recess),'concrete',True)
        part('freight court floor',at(x,y+.2,front+recess/2),(w,.4,recess),'concrete',True)
        part('freight chamber rear closure',at(x,(y+roof)/2,front+recess-.3),(w,roof-y,.6),'brick',True)
        part('freight chamber loading door',at(x+7,y+3.8,front+recess-.65),(8,7.2,.25),'iron')
        for xx in [-9,-4]:
            part('stacked freight container',at(x+xx,y+1.45,front+8),(3.6,2.5,3.6),'enamel')
        part('freight gantry bridge',at(x,roof-1.8,front+4),(w-2,1.1,1.5),'steel')
        for side in [-1,1]:part('freight gantry rail',at(x+side*(w/2-2),roof-1.2,front+7),(1.1,.7,10),'iron')
        part('freight gantry trolley',at(x-3,roof-2.5,front+4),(3.2,1,2.7),'iron')
        part('freight hoist line',at(x-3,roof-3.7,front+4),(.1,2,.1),'iron')
        lamp=at(x+5,roof-1.2,front+8)
        part('shielded intake practical',lamp,(2.3,.5,1.4),'iron')
        part('intake practical lens',lamp-up*.28,(1.8,.06,.8),'fixture')
        c['lights'].append({'p':list(lamp-up*.8),'power':700,'radius':40,'color':'#e4c49e','pocket':True,'focusRange':[6400,6880]})

    return {'index':index,'base':list(base),'width':width,'depth':depth,'galleryDepth':recess,
            'rows':rows,'freight':freight,'streetLevels':street_points,'foundationSamples':foundations,
            'newObjects':len(c['objects'])-first_object,'newSolids':len(c['solids'])-first_solid}
