"""Two connected hillside frontages with occupied, contour-seated lower floors.

Public stairs follow surveyed ground. Only short open structural spans bridge
local clefts; their underside is never filled into a high retaining ramp.
"""
import math


def build_quarter_street(c, quarter):
    V, up = c['Vector'], c['UP']
    along, out = V((1, 0, 0)), V((0, 0, 1))
    axes = (along, up, out)
    box, mesh, arch = c['box'], c['mesh'], c['arch']
    # Follow the actual exported bank triangles, not only the analytic
    # terrain field: the broad terrain grid interpolates across steep steps.
    from mathutils.bvhtree import BVHTree
    terrain_vertices,terrain_faces=[],[]
    for obj in c['solids']:
        if not obj['name'].startswith('continuous inhabited gorge landform'):
            continue
        offset=len(terrain_vertices)
        terrain_vertices.extend((p[0],p[2],-p[1]) for p in obj['vertices'])
        for face in obj['faces']:
            terrain_faces.extend((offset+face[0],offset+face[i],offset+face[i+1]) for i in range(1,len(face)-1))
    terrain=BVHTree.FromPolygons(terrain_vertices,terrain_faces,all_triangles=True)
    ground_cache={}
    def ground(x,z):
        key=(round(x,3),round(z,3))
        if key not in ground_cache:
            hit,_,_,_=terrain.ray_cast(V((x,5000,z)),V((0,-1,0)),9000)
            ground_cache[key]=hit.y if hit is not None else c['land_height'](x,z)
        return ground_cache[key]
    materials = {k:c[k] for k in ['brick','plaster','limestone','concrete','iron','zinc','warm','dim','glass','fixture']}
    first_object, first_solid = len(c['objects']), len(c['solids'])
    foundations, ranges, streets, sight_targets = [], [], [], []
    prefix = 'Terrace service street / '

    def part(label, p, dims, material, solid=False, frame=axes):
        return box(prefix+label, p, dims, materials[material], frame, solid)

    def volume(label, corners, heights, material='brick', solid=True):
        tops = [heights]*4 if isinstance(heights,(float,int)) else heights
        bottoms=[min(ground(p.x,p.z)-4,tops[i]-1) for i,p in enumerate(corners)]
        low=[V((p.x,y,p.z)) for p,y in zip(corners,bottoms)]
        high=[V((p.x,y,p.z)) for p,y in zip(corners,tops)]
        mesh(prefix+label,[tuple(p) for p in low+high],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],materials[material],solid)
        for p,y in zip(corners,bottoms):
            foundations.append({'name':label,'p':[p.x,y,p.z],'terrain':ground(p.x,p.z)})
        return min(bottoms)

    def room(label, x, y, z, width, public=False, quiet=False):
        if quiet:
            part(label+' quiet masonry bay',V((x,y,z)),(width,2.8,.9),'plaster')
            return
        part(label+' recessed room back',V((x,y,z+4.0)),(width,2.9,.6),'brick')
        for sign in [-1,1]:
            part(label+(' court lower gallery occupied room' if public else ' grouped upper occupied room'),
                 V((x+sign*width*.235,y,z+3.65)),(width*.42,2.35,.05),
                 'warm' if public and sign<0 else 'dim' if public else 'glass')
        part(label+' deep stone sill',V((x,y-1.35,z+1.9)),(width+.3,.28,4.7),'limestone')
        sight_targets.append({'name':label,'p':[x-width*.235,y,z+3.60]})

    def range_build(label, x0,x1,z0,z1,upper_floors,skin,seed,lit=False):
        width,depth=x1-x0,z1-z0
        front_heights=[ground(x0+width*i/8,z0) for i in range(9)]
        # Each frontage follows one actual contour. Its occupied body handles
        # the small remaining slope; a maximum across the deep site would
        # recreate the tall public podium that used to hide these windows.
        floor=max(front_heights)+.8
        roof=floor+5.5+upper_floors*3.65
        corners=[V((x,0,z)) for x,z in [(x0,z0+4.8),(x1,z0+4.8),(x1,z1),(x0,z1)]]
        maximum=max(ground(q.x,q.z) for q in corners)
        if maximum>roof-2:
            raise ValueError(prefix+label+' roof buried in the hillside')
        bottom=volume(label+' founded occupied rear body',corners,roof,skin)
        center=V(((x0+x1)/2,(bottom+roof)/2,(z0+z1)/2))
        if not c['clear'](center,(width+2,roof-bottom+3,depth+3),axes):
            raise ValueError(prefix+label+' crosses driving clearance')
        bays=max(3,round(width/8.3));pitch=width/bays
        for j in range(bays+1):
            x=x0+j*pitch;foot=ground(x,z0)-4
            part(label+' seated arcade masonry pier',V((x,(foot+roof)/2,z0+.5)),(1.15,roof-foot,1.7),'limestone',True)
            foundations.append({'name':label+' street pier','p':[x,foot,z0+.5],'terrain':ground(x,z0+.5)})
        # The lower face consists of actual openings, piers and floor bands.
        # It has no solid front wall with windows pasted over it.
        lower=floor-math.ceil((floor-min(front_heights)+4)/3.65)*3.65
        count=math.ceil((floor-lower)/3.65)
        for level in range(count):
            y=lower+level*3.65
            part(label+' lower occupied floor',V(((x0+x1)/2,y+.4,z0+2.5)),(width,.8,5.0),'brick')
            for j in range(bays):
                x=x0+(j+.5)*pitch
                if y+3.1<ground(x,z0)-.5:continue
                room(label+' lower street rooms',x,y+2.05,z0+.2,pitch-2.2,True)
        part(label+' arcade walking floor',V(((x0+x1)/2,floor+.18,z0+2.6)),(width,.36,5.4),'limestone',True)
        for j in range(bays):
            x=x0+(j+.5)*pitch
            arch(prefix+label+' deep public arcade arch',V((x,floor+3.7,z0+.5)),pitch,1.45,.65,1.7,materials['limestone'],axes)
            room(label+' court entry rooms',x,floor+2.1,z0+.2,pitch-2.4,lit or j%3==0)
            # Small door stairs join the contour street at the actual ground
            # level of each bay, never at one remote highest corner.
            a=V((x,ground(x,z0-2.0)+.5,z0-2.0));b=V((x,floor+.38,z0+1.5))
            stair('individual shop entrance',a,b,2.4)
        part(label+' arcade bearing storey',V(((x0+x1)/2,floor+5.35,z0+2.5)),(width,.65,5.2),'concrete',True)
        for level in range(upper_floors):
            y=floor+5.5+level*3.65
            part(label+' upper floor masonry band',V(((x0+x1)/2,y+.4,z0+2.6)),(width,.8,5.3),skin)
            for j in range(bays):
                x=x0+(j+.5)*pitch
                room(label+' upper rooms',x,y+2.05,z0+.2,pitch-2.4,False,(j+level+seed)%5==2)
        # A quiet, thick roof line meets a different-height connected wing.
        part(label+' bearing roof cornice',V(((x0+x1)/2,roof+.25,(z0+z1)/2)),(width+.6,.5,depth+.6),'limestone',True)
        if upper_floors>=4:
            verts=[V((x,y,z)) for x in [x0-.3,x1+.3] for z,y in [(z0-.3,roof+.55),((z0+z1)/2,roof+2.65),(z1+.3,roof+.55)]]
            mesh(prefix+label+' low folded zinc roof',[tuple(p) for p in verts],[(0,1,4,3),(1,2,5,4),(0,2,1),(3,4,5)],materials['zinc'])
        else:
            part(label+' shallow zinc roof',V(((x0+x1)/2,roof+.55,(z0+z1)/2)),(width-.6,.1,depth-.6),'zinc')
            part(label+' occupied roof terrace parapet',V(((x0+x1)/2,roof+1.0,z1)),(width,.95,.5),skin)
        # The exposed end has grouped rooms too, at plausible floor scale.
        end=x0-.06
        for row in range(max(2,upper_floors)):
            yy=floor+3.3+row*3.65
            for zz in [z0+7.8,z1-3.0]:
                part(label+' end stone opening',V((end,yy,zz)),(.32,2.8,3.8),'limestone')
                part(label+' end occupied room',V((end-.18,yy,zz)),(.05,2.3,3.2),'dim' if (row+seed)%3==0 else 'glass')
        if lit:
            lamp=V((x0+width*.62,floor+4.6,z0+2.1))
            part(label+' shielded gallery lamp',lamp,(1.8,.5,1.0),'iron')
            part(label+' gallery recessed lens',lamp-up*.28,(1.4,.06,.6),'fixture')
            c['lights'].append({'p':list(lamp-up*.8),'power':180,'radius':24,'color':'#d8b990','pocket':True})
        ranges.append({'name':label,'center':[(x0+x1)/2,floor,(z0+z1)/2],'width':width,'depth':depth,'floor':floor,'roof':roof,'bottom':bottom})

    def stair(label,a,b,width):
        """One continuous stair slab; individual treads are decorative."""
        run=V((b.x-a.x,0,b.z-a.z));length=run.length
        if length<.15:return
        run.normalize();cross=up.cross(run);rise=b.y-a.y
        pts=[q+cross*x+up*y for q in [a,b] for y in [-.55,0] for x in [-width/2,width/2]]
        mesh(prefix+label+' continuous stair slab',[tuple(q) for q in pts],[(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3),(0,1,3,2),(4,6,7,5)],materials['concrete'],True)
        steps=max(1,math.ceil(abs(rise)/.19))
        for step in range(steps):
            q=a.lerp(b,(step+.5)/steps)+up*.08
            part(label+' stone tread',q,(width,.18,length/steps+.03),'limestone',False,(cross,up,run))

    def street(label,points,width=3.2,end_y=None):
        nodes=[V((x,ground(x,z)+.65,z)) for x,z in points]
        if end_y is not None:nodes[-1].y=end_y
        samples=[]
        for a,b in zip(nodes,nodes[1:]):
            length=V((b.x-a.x,0,b.z-a.z)).length;count=max(1,math.ceil(length/3))
            run=V((b.x-a.x,0,b.z-a.z)).normalized();cross=up.cross(run)
            for i in range(count):
                q=a.lerp(b,i/count)
                q.y=max(q.y,max(ground((q+cross*sign*width/2).x,(q+cross*sign*width/2).z) for sign in [-1,0,1])+.4)
                samples.append(q)
        samples.append(nodes[-1])
        # Raise only neighbouring landings when a steep local ridge requires
        # it. This keeps stair gradients reasonable without a filled ramp.
        for iteration in range(3):
            for order in [range(1,len(samples)),range(len(samples)-2,-1,-1)]:
                for i in order:
                    j=i-1 if order.step>0 else i+1
                    length=math.hypot(samples[i].x-samples[j].x,samples[i].z-samples[j].z)
                    samples[i].y=max(samples[i].y,samples[j].y-length*.72)
        max_gap=0
        for i,(a,b) in enumerate(zip(samples,samples[1:])):
            run=V((b.x-a.x,0,b.z-a.z)).normalized();cross=up.cross(run);mid=(a+b)/2
            gap=mid.y-ground(mid.x,mid.z);max_gap=max(max_gap,gap)
            stair(label,a,b,width)
            corners=[a-cross*width/2,b-cross*width/2,b+cross*width/2,a+cross*width/2]
            if gap<3.0:
                volume(label+' low ground-seated stair footing',corners,[p.y-.55 for p in corners],'brick')
            else:
                # An open steel stringer preserves the real void underneath.
                # No tall solid wedge is allowed in front of the neighbourhood.
                direction=(b-a).normalized();normal=cross.cross(direction).normalized()
                for sign in [-1,1]:
                    aa=a+cross*(sign*(width/2-.1))-up*.65;bb=b+cross*(sign*(width/2-.1))-up*.65
                    part(label+' open-span bearing stringer',(aa+bb)/2,(.22,1.2,(bb-aa).length+.12),'iron',True,(cross,normal,direction))
            if gap>=3 and i%4==0:
                foot=ground(a.x,a.z)-4
                part(label+' founded open-stair masonry pier',V((a.x,(foot+a.y-.55)/2,a.z)),(1.8,a.y-.55-foot,2.8),'limestone',True,(cross,up,run))
                foundations.append({'name':label+' open stair pier','p':[a.x,foot,a.z],'terrain':ground(a.x,a.z)})
            for sign in [-1,1]:
                aa=a+cross*(sign*width/2)+up*1.0;bb=b+cross*(sign*width/2)+up*1.0
                direction=(bb-aa).normalized();normal=cross.cross(direction).normalized()
                part(label+' continuous pedestrian handrail',(aa+bb)/2,(.12,.12,(bb-aa).length+.06),'iron',False,(cross,normal,direction))
                if i%2==0:part(label+' handrail upright',aa-up*.5,(.10,1.0,.10),'iron')
        streets.append({'name':label,'samples':[list(q) for q in samples],'maximumUndersideGap':max_gap})

    # Two unequal connected families bend around the real contour, instead
    # of sharing one level slab across the steep diagonal bank.
    range_build('west upper corner',-488,-458,1453,1475,3,'brick',0)
    range_build('west setback hall',-458,-424,1471,1492,4,'plaster',2,True)
    range_build('west low gallery wing',-424,-392,1486,1504,2,'brick',1)
    range_build('east occupied service hall',-339,-296,1535,1553,3,'brick',3,True)
    range_build('east descending end',-296,-261,1560,1578,2,'plaster',1)
    # A low occupied crossover joins the two east ranges. Its five-metre
    # portico stays open for the pedestrian stair beneath, with four founded
    # piers rather than another solid street wall.
    link_floor=max(ground(x,z) for x in [-302,-290] for z in [1552,1561])+5.4
    part('east inhabited crossover',V((-296,link_floor+2.1,1556.5)),(14,4.2,21),'brick',True)
    for x in [-302,-290]:
        for z in [1552,1561]:
            foot=ground(x,z)-4
            part('east crossover portico pier',V((x,(foot+link_floor)/2,z)),(1.1,link_floor-foot,1.5),'limestone',True)
            foundations.append({'name':'east crossover portico pier','p':[x,foot,z],'terrain':ground(x,z)})
    for x in [-300,-296,-292]:
        part('east crossover occupied room',V((x,link_floor+2.1,1545.9)),(2.5,2.4,.05),'dim')
    street('western contour shop street',[(-489,1450),(-459,1450),(-460,1468),(-425,1468),(-426,1483),(-392,1483)])
    street('eastern contour shop street',[(-340,1532),(-297,1532),(-298,1557),(-261,1557)])
    street('western descending stair street',[(-392,1483),(-392,1480),(-416,1456),(-420,1452),(-420,1448),(-420,1424),(-408,1424),(-384,1424),(-396,1352),(-396,1331),(-390,1331)],end_y=quarter['gallery'][1]+.6)
    street('eastern descending stair street',[(-340,1532),(-340,1528),(-346,1520),(-346,1496),(-346,1480),(-340,1360),(-340,1331),(-346,1331)],end_y=quarter['gallery'][1]+.6)
    return {'ranges':ranges,'foundationSamples':foundations,'streets':streets,'sightTargets':sight_targets,
            'newObjects':len(c['objects'])-first_object,'newSolids':len(c['solids'])-first_solid}
