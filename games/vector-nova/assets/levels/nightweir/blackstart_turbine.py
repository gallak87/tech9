"""Rock-seated turbine frames and inhabited maintenance works.

The exposed rotor is runtime geometry. These static shoulders carry its volute
back into the upper bank rather than placing it on a sheer rectangular podium.
"""
import math


def build_turbine_powerhouse(c, center, along, out, radius, station):
    V, up = c['Vector'], c['UP']
    box, mesh = c['box'], c['mesh']
    axes = (along, up, out)
    prefix = 'Turbine powerhouse %d / ' % round(station)
    first_object, first_solid = len(c['objects']), len(c['solids'])
    foundations, targets, checks = [], [], []
    from mathutils.bvhtree import BVHTree
    if '_turbine_ground_tree' not in c:
        vs, fs = [], []
        for obj in c['solids']:
            if obj['material'] != c['bedrock']:
                continue
            offset = len(vs)
            vs.extend((p[0], p[2], -p[1]) for p in obj['vertices'])
            for face in obj['faces']:
                fs.extend((offset+face[0], offset+face[i], offset+face[i+1]) for i in range(1,len(face)-1))
        c['_turbine_ground_tree'] = BVHTree.FromPolygons(vs,fs,all_triangles=True)
    terrain = c['_turbine_ground_tree']
    def point(x,y,z):
        return center+along*x+up*y+out*z
    def ground(x,z):
        p=point(x,0,z)
        hit,_,_,_=terrain.ray_cast(V((p.x,5000,p.z)),V((0,-1,0)),9000)
        return hit.y if hit is not None else c['land_height'](p.x,p.z)
    def part(name,x,y,z,dims,material,solid=False):
        return box(prefix+name,point(x,y,z),dims,c[material],axes,solid)
    def target(name,x,y,z):
        targets.append({'name':name,'p':list(point(x,y,z))})
    def foot(name,x,z,y):
        p=point(x,0,z);foundations.append({'name':name,'p':[p.x,y,p.z],'terrain':ground(x,z)})
    def seated_volume(name,x0,x1,z0,z1,top,material='brick'):
        corners=[(x0,z0),(x1,z0),(x1,z1),(x0,z1)]
        lows=[ground(x,z)-20 for x,z in corners]
        if max(lows)>center.y+top-1:
            raise ValueError(prefix+name+' buried roof')
        vs=[tuple(point(x,y-center.y,z)) for (x,z),y in zip(corners,lows)]
        vs.extend(tuple(point(x,top,z)) for x,z in corners)
        mesh(prefix+name,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],c[material],True)
        for (x,z),y in zip(corners,lows):foot(name,x,z,y)
        return min(lows)

    # Two broad inclined compression cheeks project from the surveyed rock.
    # Each has a real sloping underside; the space beneath the rotor stays open.
    deck_y=-radius*1.85
    for side in [-1,1]:
        x=side*radius*.88;half=7.0 if radius>38 else 6.2
        rear=61 if side<0 else 68
        rear_top=max(ground(x-half,rear),ground(x+half,rear))-center.y+8
        top=max(rear_top,deck_y+21)
        profiles=[]
        for xx in [x-half,x+half]:
            front_ground=ground(xx,14)-center.y-20
            rear_ground=ground(xx,rear)-center.y-20
            profiles.append([(xx,deck_y-1,-27),(xx,front_ground,14),(xx,rear_ground,rear),(xx,top,rear),(xx,-radius*.95,-27)])
            foot('inclined rock bearing',xx,14,front_ground+center.y)
            foot('inclined rock bearing',xx,rear,rear_ground+center.y)
        vs=[tuple(point(*q)) for profile in profiles for q in profile]
        mesh(prefix+'inclined concrete rock bearing',vs,[(0,4,3,2,1),(5,6,7,8,9)]+[(i,(i+1)%5,(i+1)%5+5,i+5) for i in range(5)],c['concrete'],True)
        target('inclined bearing face',x-half-.03,deck_y-30,14)

    # An octagonal outside and genuinely circular throat replace the old box.
    # Large unequal shoulders and a deep recessed rim remain legible in flight.
    count=48;vs=[]
    for z in [-25,25]:
        for k in range(count):
            angle=k*math.tau/count
            octagon=1/max(abs(math.cos(angle)),abs(math.sin(angle)),(abs(math.cos(angle))+abs(math.sin(angle)))/math.sqrt(2))
            inner=radius*1.105;outer=radius*(1.41+.055*math.sin(angle))*octagon
            outer=max(outer,inner+8)
            for r in [inner,outer]:vs.append(tuple(point(math.cos(angle)*r,math.sin(angle)*r,z)))
    stride=count*2;fs=[]
    for k in range(count):
        i=k*2;j=((k+1)%count)*2
        fs.extend([(i,j,j+1,i+1),(stride+i+1,stride+j+1,stride+j,stride+i),(i,stride+i,stride+j,j),(i+1,j+1,stride+j+1,stride+i+1)])
    mesh(prefix+'deep octagonal bearing throat',vs,fs,c['concrete'],True)
    target('outer bearing throat',-radius*1.36,0,-25.03)
    if radius==42:
        # Retain the tuned landmark lamp exactly, but reconnect its existing
        # forward bracket to the new bearing frame after removing the box.
        part('landmark bracket structural return',radius*.42,radius+7,-29.5,(1.0,1.0,11.0),'iron')
    # The lower maintenance level is open in front, with recessed inhabited
    # rooms behind four wide structural bays, not a window grid on the frame.
    span=radius*2.6;front=-50;back=-29
    part('maintenance level bearing floor',0,deck_y, (front+back)/2,(span,2.1,back-front),'concrete',True)
    part('maintenance rear bearing header',0,deck_y+11.6,back+2,(span,1.7,3.0),'concrete',True)
    # An open maintenance terrace exposes its rooms to the high flight camera.
    # The volute is carried above it by the separate concrete bearing frame.
    part('recessed maintenance room body',0,deck_y+5.6,back+3,(span-5,10,6),'brick',True)
    bay=span/4
    for i in range(5):
        x=-span/2+i*bay
        part('maintenance arcade structural pier',x,deck_y+5.8,front+2,(1.8,11.6,4.5),'concrete',True)
    for i in range(4):
        x=-span/2+(i+.5)*bay
        part('recessed occupied gallery window',x,deck_y+5.9,back-.1,(bay-5,3.7,.06),'warm' if i in [0,2] else 'dim')
        part('maintenance room opening header',x,deck_y+8.0,back-.35,(bay-3,.6,1.2),'limestone')
        part('human maintenance door',x-5,deck_y+2.1,back-.35,(2.2,3.0,.15),'iron')
        target('recessed occupied maintenance bay',x,deck_y+5.9,back-.15)
    for i in range(17):
        x=-span/2+i*span/16
        part('maintenance edge baluster',x,deck_y+2.2,front-.2,(.13,2.2,.13),'iron')
    part('maintenance edge handrail',0,deck_y+3.25,front-.2,(span,.14,.14),'wear')
    # Visible transverse floor girders tie the inclined cheeks and the deep
    # upper frame together. Their lower open bay exposes the rooted rock.
    for z in [-45,-23]:
        part('transverse load transfer girder',0,deck_y-4.1,z,(span+6,6.0,3.5),'iron',True)

    for sign in [-1,1]:
        x=sign*radius*.88
        a=point(x,deck_y-25,-3);b=point(x,deck_y-1,-48)
        direction=(b-a).normalized();normal=direction.cross(along).normalized()
        box(prefix+'maintenance cantilever diagonal',(a+b)/2,(3.8,3.0,(b-a).length),c['iron'],(along,normal,direction),True)
    # Two unequal service ranges sit on the upper bank. Contour steps keep the
    # lower occupied walls short, while the taller end gives a distinct skyline.
    ranges=[('uphill control house',-radius-48,-radius-12,29,47,21.6),
            ('descending service range',radius+15,radius+40,30,48,13.2)]
    for index,(label,x0,x1,z0,z1,height) in enumerate(ranges):
        corners=[ground(x,z) for x in [x0,x1] for z in [z0,z1]]
        floor=max(corners)+1.0-center.y;roof=floor+height
        seated_volume(label+' founded occupied body',x0,x1,z0+4.5,z1,roof)
        width=x1-x0;middle=(x0+x1)/2
        # Lower walls on the slope are occupied and divided by structural bays.
        low=math.floor((min(corners)-center.y-floor)/4.2)*4.2+floor
        for level in range(math.ceil((roof-low)/4.2)):
            y=low+level*4.2+2.3
            for col in range(4):
                x=x0+(col+.5)*width/4
                if center.y+y<ground(x,z0)+1.5 or y+1.4>roof-.6:continue
                part(label+' occupied window',x,y,z0+4.35,(width/4-2.2,2.7,.06),'dim' if level%3 else 'warm')
                target(label+' occupied front window',x,y,z0+4.30)
        for i in range(5):
            x=x0+i*width/4;foot_y=ground(x,z0)-center.y-5
            part(label+' founded street pier',x,(foot_y+roof)/2,z0+.8,(1.5,roof-foot_y,2.4),'concrete',True)
            foot(label+' street pier',x,z0,foot_y+center.y)
        part(label+' deep access gallery',middle,floor+.2,z0+2.5,(width,.7,5.7),'concrete',True)
        part(label+' access gallery canopy',middle,floor+5.7,z0+2.4,(width,1.1,5.8),'concrete',True)
        part(label+' bearing cornice',middle,roof+.25,(z0+z1)/2,(width+1,.5,z1-z0+1),'limestone',True)
        # Low pitched roof, no rooftop prop array.
        ridge=roof+3.2
        vs=[tuple(point(x,y,z)) for x in [x0-.3,x1+.3] for z,y in [(z0-.3,roof+.5),((z0+z1)/2,ridge),(z1+.3,roof+.5)]]
        mesh(prefix+label+' pitched zinc roof',vs,[(0,1,4,3),(1,2,5,4),(0,2,1),(3,4,5)],c['zinc'])
        target(label+' gallery',(x0+x1)/2,floor+3,z0+4.2)
        target(label+' skyline',(x0+x1)/2,ridge,(z0+z1)/2)
        # A bank-seated broad service stair joins the front maintenance level.
        # The concrete stair spine is stepped, rather than a tall ramp wall.
        start_x=x1-2 if index==0 else x0+2
        start_z=z0+2;end_z=-29
        start_y=floor+.65;end_y=deck_y+1.1;steps=max(12,math.ceil(abs(start_y-end_y)/.21))
        for i in range(steps):
            t=(i+.5)/steps;z=start_z+(end_z-start_z)*t;y=start_y+(end_y-start_y)*t
            part(label+' service stair tread',start_x,y,z,(3.8,.35,abs(start_z-end_z)/steps+.1),'iron')
        a=point(start_x,start_y,start_z);b=point(start_x,end_y,end_z);direction=(b-a).normalized();across=along
        normal=direction.cross(across).normalized()
        box(prefix+label+' connected stair stringer',(a+b)/2,(3.8,1.2,(b-a).length),c['iron'],(across,normal,direction),True)
        # A short transverse landing ends on the maintenance deck, which is
        # narrower than the two bank-side service volumes.
        near_x=max(-span/2+1.5,min(span/2-1.5,start_x))
        part(label+' maintenance stair receiving landing',(start_x+near_x)/2,end_y,-29,(abs(start_x-near_x)+4,1.0,5),'iron',True)

    hydraulic = build_turbine_water(c, center, along, out, radius, station, terrain)
    targets.extend(hydraulic['sightTargets'])

    # This is one bounded authored assembly; physical pieces retain only the
    # primary load-bearing forms and rooms, never the glazing or rail detail.
    new_solids=c['solids'][first_solid:]
    for obj in new_solids:
        world=[V((p[0],p[2],-p[1])) for p in obj['vertices']]
        local=[V(((p-center).dot(along),(p-center).dot(up),(p-center).dot(out))) for p in world]
        lo=V(tuple(min(p[i] for p in local) for i in range(3)));hi=V(tuple(max(p[i] for p in local) for i in range(3)))
        if not c['clear'](point(*((lo+hi)/2)),tuple(hi-lo),axes):checks.append(obj['name'])
    if checks:raise ValueError(prefix+' road/flight clearance: '+str(checks))
    summary={'station':station,'rotorCenter':list(center-out*31),'foundationSamples':foundations,'sightTargets':targets,
             'visualTriangles':sum(sum(len(f)-2 for f in o['faces']) for o in c['objects'][first_object:]),
             'physicalTriangles':sum(sum(len(f)-2 for f in o['faces']) for o in new_solids),'clearanceFailures':checks}
    c.setdefault('turbine_powerhouse_summaries',[]).append(summary)
    return summary


def build_turbine_water(c, center, along, out, radius, station, terrain):
    """A connected penstock, draft tube and supported open tailrace bench.

    Water is runtime geometry. All flow records use world coordinates and meet
    physical mouths, pool floors and the existing lower impoundment exactly.
    """
    V, up = c['Vector'], c['UP']
    box, mesh, cylinder = c['box'], c['mesh'], c['cylinder']
    axes=(along,up,out);prefix='Turbine hydraulics %d / '%round(station)
    first_object,first_solid=len(c['objects']),len(c['solids'])
    foundations,anchors,targets=[],[],[]
    def point(x,y,z):return center+along*x+up*y+out*z
    def ground(x,z):
        p=point(x,0,z);hit=terrain.ray_cast(V((p.x,5000,p.z)),V((0,-1,0)),10000)[0]
        return hit.y if hit is not None else c['land_height'](p.x,p.z)
    def part(label,p,dims,mat,solid=False,frame=axes):
        return box(prefix+label,p,dims,c[mat],frame,solid)
    def beam(label,a,b,width,depth,mat='iron',solid=True):
        direction=(b-a).normalized();x=direction.cross(up)
        if x.length<.01:x=along.copy()
        x.normalize();y=direction.cross(x).normalized()
        return part(label,(a+b)/2,(width,depth,(b-a).length),mat,solid,(x,y,direction))
    def annular_band(label,origin,axis,inner,outer,length,material='iron'):
        horizontal=axis.cross(up).normalized();vertical=horizontal.cross(axis).normalized()
        count=32;vs=[]
        for z,r in [(-length/2,inner),(-length/2,outer),(length/2,outer),(length/2,inner)]:
            for j in range(count):
                angle=j*math.tau/count
                vs.append(tuple(origin+axis*z+(horizontal*math.cos(angle)+vertical*math.sin(angle))*r))
        fs=[]
        for ring in range(4):
            other=(ring+1)%4
            for j in range(count):
                n=(j+1)%count;fs.append((ring*count+j,ring*count+n,other*count+n,other*count+j))
        return mesh(prefix+label,vs,fs,c[material])
    def tube(label,controls,r,open_end=False):
        # A rounded cubic centerline joins every segment, including its elbow.
        pts=[]
        for i in range(len(controls)-1):
            p0=controls[max(0,i-1)];p1=controls[i];p2=controls[i+1];p3=controls[min(len(controls)-1,i+2)]
            count=max(3,math.ceil((p2-p1).length/5))
            for j in range(count):
                t=j/count;t2=t*t;t3=t2*t
                pts.append((p1*2+(p2-p0)*t+(p0*2-p1*5+p2*4-p3)*t2+(-p0+p1*3-p2*3+p3)*t3)*.5)
        pts.append(controls[-1]);segments=32;vertices=[];normals=[]
        for i,p in enumerate(pts):
            tangent=(pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)]).normalized()
            horizontal=tangent.cross(up).normalized();vertical=horizontal.cross(tangent).normalized()
            for j in range(segments):
                normal=horizontal*math.cos(j*math.tau/segments)+vertical*math.sin(j*math.tau/segments)
                vertices.append(tuple(p+normal*r));normals.append(c['xyz'](normal))
        faces=[]
        for i in range(len(pts)-1):
            for j in range(segments):
                n=(j+1)%segments;faces.append((i*segments+j,i*segments+n,(i+1)*segments+n,(i+1)*segments+j))
        faces.append(tuple(reversed(range(segments))))
        if not open_end:faces.append(tuple((len(pts)-1)*segments+j for j in range(segments)))
        obj=mesh(prefix+label,vertices,faces,c['steel'],True);obj['normals']=normals
        if open_end:
            # A deep forged flange surrounds the real open throat. A recessed
            # sleeve and two heavy cast bands carry the mouth's wall thickness.
            axis=(pts[-1]-pts[-2]).normalized()
            annular_band(label+' deep outlet flange',pts[-1]-axis*2.4,axis,r-1.1,r+3.2,5.2)
            annular_band(label+' rubbed outlet edge',pts[-1]+axis*.3,axis,r-1.1,r+.8,.9,'wear')
            annular_band(label+' recessed open barrel',pts[-1]-axis*8,axis,r-1.1,r,15.0,'iron')
            annular_band(label+' rear reinforcing collar',pts[-1]-axis*13,axis,r,r+1.65,3.2)
            horizontal=axis.cross(up).normalized();vertical=horizontal.cross(axis).normalized()
            for j in range(10):
                angle=j*math.tau/10;radial=horizontal*math.cos(angle)+vertical*math.sin(angle)
                tangential=axis.cross(radial).normalized()
                part(label+' forged flange lug',pts[-1]-axis*2.5+radial*(r+2.8),(2.5,3.0,7.4),'iron',False,(tangential,radial,axis))
        # Broad expansion collars explain construction without noisy fittings.
        for fraction in [.18,.45,.72]:
            i=min(len(pts)-2,int((len(pts)-1)*fraction));axis=(pts[i+1]-pts[max(0,i-1)]).normalized()
            cylinder(prefix+label+' expansion collar',pts[i],r+.55,1.15,c['iron'],axis,32)
        return pts

    scale=radius/42;pool_y=-radius*3.0;pool_z=-59;pool_w=110*scale;pool_l=34
    water_y=center.y+pool_y;bed_y=water_y-.8
    # The existing inclined cheeks supply the concrete-to-rock foundation.
    # Two deep open triangles carry the bench; its underside stays visibly open.
    cheeks=[o for o in c['solids'] if o['name'].startswith('Turbine powerhouse %d / inclined concrete rock bearing'%round(station))]
    from mathutils.bvhtree import BVHTree
    cheek_trees=[]
    for obj in cheeks:
        vv=[(p[0],p[2],-p[1])for p in obj['vertices']];ff=[]
        for f in obj['faces']:ff.extend((f[0],f[i],f[i+1])for i in range(1,len(f)-1))
        cheek_trees.append(BVHTree.FromPolygons(vv,ff,all_triangles=True))
    deck_y=-radius*1.85
    for sign in [-1,1]:
        x=sign*radius*.88;upper=point(x,deck_y-3,6);lower=point(x,deck_y-48,6)
        # The smaller machine's downstream cheek meets a higher rock shelf.
        # Seat its lower tie within the existing actual concrete section.
        for lift in range(44):
            candidate=lower+up*lift
            if any((lambda hit,n:hit is not None and (candidate-hit).dot(n)<-.2)(*tree.find_nearest(candidate)[:2]) for tree in cheek_trees):
                lower=candidate;break
        nose=point(x,pool_y-5,pool_z-pool_l/2+1)
        rear=point(x,pool_y-5,pool_z+pool_l/2-1)
        for label,p in [('upper',upper),('lower',lower)]:
            inside=False
            for tree in cheek_trees:
                hit,n,_,d=tree.find_nearest(p)
                if hit is not None and (p-hit).dot(n)<-.15:inside=True
            if not inside:raise ValueError(prefix+'tailrace '+label+' anchor is outside existing concrete')
            anchors.append({'name':label+' tailrace anchor','p':list(p),'insideExistingConcrete':inside})
            part('tailrace embedded bearing plate',p,(9,8,3),'wear',True)
        beam('tailrace upper diagonal girder',upper,nose,4.8,6.0)
        beam('tailrace lower compression girder',lower,nose,5.4,6.2)
        beam('tailrace rear transverse support',lower,rear,4.6,5.0)
        beam('tailrace open triangulation',(upper+nose)*.5,(lower+nose)*.5,2.0,2.4)
    for z in [pool_z-pool_l/2+1,pool_z+pool_l/2-1]:
        part('tailrace spanning floor girder',point(0,pool_y-4,z),(pool_w+5,5.0,3.5),'iron',True)
    part('plunge pool thick concrete floor',point(0,pool_y-1.8,pool_z),(pool_w,2.0,pool_l),'concrete',True)
    # Copings retain the water. One purposeful overflow slot is left in front.
    coping_y=pool_y+1.25;wall_h=4.1
    for sign in [-1,1]:
        part('plunge pool heavy end wall',point(sign*(pool_w/2-1),coping_y,pool_z),(2.0,wall_h,pool_l),'concrete',True)
    part('plunge pool rear coping',point(0,coping_y,pool_z+pool_l/2-1),(pool_w,wall_h,2),'concrete',True)
    runoff_x=-20*scale;opening=26*scale
    edges=[(-pool_w/2,runoff_x-opening/2),(runoff_x+opening/2,pool_w/2)]
    for a,b in edges:
        part('plunge pool split overflow coping',point((a+b)/2,coping_y,pool_z-pool_l/2+1),(b-a,wall_h,2),'concrete',True)
    for x in [-pool_w/2+5,pool_w/2-5]:
        part('pool maintenance walkway',point(x,pool_y+2.3,pool_z),(3.2,.45,pool_l-2),'iron')
        for z in [pool_z-12,pool_z,pool_z+12]:part('pool walkway baluster',point(x,pool_y+3.35,z),(.12,1.8,.12),'iron')
        part('pool walkway handrail',point(x,pool_y+4.2,pool_z),(.13,.13,pool_l-2),'wear')

    # The former isolated copper tail is replaced by a connected gravity-fed
    # penstock with a real rock intake and a tangential volute connection.
    end_y=radius*1.10;intake_x=-260
    for candidate in [-260,-380,-520,-680]:
        intake_x=candidate
        if ground(candidate,180)>center.y+end_y+25:break
    intake_ground=ground(intake_x,180);start_y=max(intake_ground+9-center.y,end_y+28)
    feed_controls=[point(intake_x,start_y,180),point(intake_x*.65,start_y-12,150),point(-95,max(end_y+20,start_y-45),85),point(-radius*.62,end_y+8,25),point(-radius*.62,end_y,-25)]
    feed_path=tube('connected descending feed penstock',feed_controls,7.6*scale)
    intake=feed_controls[0];foot_bottom=min(ground(intake_x+dx,180+dz)for dx in [-13.5,0,13.5]for dz in [-12.5,0,12.5])-8
    part('penstock rock intake headwall',V((intake.x,(foot_bottom+intake.y+12)/2,intake.z)),(27,intake.y+12-foot_bottom,25),'aggregate',True)
    foundations.append({'name':'penstock intake','p':[intake.x,foot_bottom,intake.z],'terrain':intake_ground})
    # A broad founded saddle carries the high reach before the inlet elbow.
    saddle=feed_controls[1];g=ground(intake_x*.65,150);base=V((saddle.x,g-6,saddle.z));top=saddle-up*(7.6*scale)
    beam('penstock rooted saddle pier',base,top,7.5,9.0,'concrete')
    part('penstock saddle crosshead',top-up*1.0,(22,3.0,10),'concrete',True)
    foundations.append({'name':'penstock saddle','p':list(base),'terrain':g})

    # Repeated clamps transfer each long pipe span into the nearest surveyed
    # rock or existing heavy concrete. Open paired braces avoid new podiums.
    civil_trees=[]
    for obj in c['solids']:
        if not obj['name'].startswith('Turbine powerhouse %d / '%round(station)):continue
        if not any(k in obj['name']for k in ['inclined concrete rock bearing','deep octagonal bearing throat']):continue
        vv=[(p[0],p[2],-p[1])for p in obj['vertices']];ff=[]
        for f in obj['faces']:ff.extend((f[0],f[i],f[i+1])for i in range(1,len(f)-1))
        civil_trees.append((obj['name'],BVHTree.FromPolygons(vv,ff,all_triangles=True)))
    lengths=[0]
    for a,b in zip(feed_path,feed_path[1:]):lengths.append(lengths[-1]+(b-a).length)
    support_count=max(4,math.ceil(lengths[-1]/68))
    for index in range(1,support_count):
        distance=lengths[-1]*index/support_count
        i=min(range(1,len(lengths)),key=lambda j:abs(lengths[j]-distance))
        saddle=feed_path[i];axis=(feed_path[min(i+1,len(feed_path)-1)]-feed_path[i-1]).normalized()
        side=axis.cross(up).normalized();radius_pipe=7.6*scale
        annular_band('penstock load-bearing clamp',saddle,axis,radius_pipe-.12,radius_pipe+1.25,4.2)
        top=saddle-up*(radius_pipe+1.4)
        part('penstock transverse saddle beam',top,(radius_pipe*2+7,3.2,5.0),'iron',True,(side,up,axis))
        for sign in [-1,1]:
            connection=top+side*(sign*(radius_pipe+1.2))
            options=[]
            for label,tree in [('gorge rock',terrain)]+civil_trees:
                hit,normal,_,distance=tree.find_nearest(connection)
                if hit is not None:options.append((distance,label,tree,hit,normal))
            chosen=None
            for _,label,tree,hit,normal in sorted(options,key=lambda q:q[0]):
                for depth in [3.0,1.5,5.0]:
                    candidate=hit-normal*depth
                    nearest,n,_,_=tree.find_nearest(candidate)
                    if nearest is None or (candidate-nearest).length<.6:continue
                    if label=='gorge rock':inside=(candidate-nearest).dot(n)<-.5
                    else:
                        # Ring face winding is not uniformly outward. An odd
                        # closed-volume crossing count tests the real solid.
                        direction=V((.417,.731,.540)).normalized();origin=candidate.copy();crossings=0
                        for _ in range(32):
                            crossing=tree.ray_cast(origin,direction,5000)[0]
                            if crossing is None:break
                            crossings+=1;origin=crossing+direction*.01
                        inside=crossings%2==1
                    if inside:chosen=(label,tree,hit,normal,candidate);break
                if chosen:break
            if chosen is None:raise ValueError(prefix+'penstock clamp has no grounded anchor')
            label,tree,hit,normal,anchor=chosen
            socket_side=normal.cross(up)
            if socket_side.length<.1:socket_side=along.copy()
            socket_side.normalize();socket_up=normal.cross(socket_side).normalized()
            part('penstock embedded bearing socket',hit-normal*1.5,(9.0,10.0,7.0),'concrete',True,(socket_side,socket_up,normal))
            beam('penstock paired anchored strut',anchor,connection,3.4,4.2,'iron')
            anchors.append({'name':'penstock clamp %d %d'%(index,sign),'p':list(anchor),'target':label,'insideExistingSupport':True,'span':(connection-anchor).length})
        targets.append({'name':'anchored feed saddle','p':list(top)})

    # A large draft tube bypasses the end of the accepted maintenance gallery.
    # Its open mouth faces diagonally along the pool, with no capped cylinder.
    impact=point(10*scale,pool_y,pool_z)
    mouth=point(58*scale,pool_y+40,pool_z-5)
    jet_axis=impact-mouth;jet_axis.y=0;jet_axis.normalize()
    draft_controls=[point(radius*1.17,-radius*.50,-26),point(radius*1.60,-radius*.70,-38),point(radius*1.65,pool_y+48,pool_z-8),mouth-jet_axis*15,mouth]
    tube('attached open draft tube',draft_controls,11.8*scale,True)
    # Both tube saddles bear on the same new primary pool girders, with a deep
    # return to the existing powerhouse cheek; no unfounded pipe ornament.
    support=point(radius*.88,deck_y-3,6)
    beam('draft tube diagonal bearing',support,draft_controls[2]-up*11.8*scale,5.0,5.4,'concrete')
    duration=math.sqrt(2*(mouth.y-impact.y)/9.81);velocity=(impact-mouth)/duration;velocity.y=0
    jet=[list(mouth+velocity*(duration*i/16)-up*(.5*9.81*(duration*i/16)**2))for i in range(17)]
    jet[-1]=list(impact)

    # A shallow overflow channel leads to the real lower impoundment. The final
    # arc retains outward velocity, so its ribbon never degenerates vertically.
    lip=point(runoff_x,pool_y-.35,pool_z-pool_l/2-7)
    start=point(runoff_x,pool_y-.08,pool_z-pool_l/2+5)
    part('overflow channel floor',(start+lip)/2-up*1.15,(opening,1.0,(lip-start).length+2),'concrete',True)
    for sign in [-1,1]:
        part('overflow channel cheek',(start+lip)/2+along*(sign*(opening/2+.65))+up*.8,(1.3,2.8,(lip-start).length+2),'concrete',True)
    # Select an actual exposed part of the lower basin; the gorge shelf at
    # the smaller rotor is uneven and a fixed X/Z endpoint can end inside rock.
    candidates=[]
    for xx in [runoff_x,runoff_x-60,runoff_x+60,runoff_x-120,runoff_x+120,runoff_x-200,runoff_x+200]:
        for zz in [pool_z-pool_l/2-62,-145,-165,-180,-210,-240,-280,-320]:
            q=point(xx,0,zz);yy=c['bed'](q.z)+4
            if ground(xx,zz)<yy-.2:
                candidates.append(((xx-runoff_x)**2+(zz-(pool_z-pool_l/2+7))**2,xx,zz,yy))
    if not candidates:raise ValueError(prefix+'no exposed receiving impoundment for overflow')
    _,end_x,end_z,basin_y=min(candidates)
    bottom=point(end_x,basin_y-center.y,end_z)
    fall_time=math.sqrt(2*(lip.y-bottom.y)/9.81);fall_velocity=(bottom-lip)/fall_time;fall_velocity.y=0
    runoff=[list(start),list(lip)]+[list(lip+fall_velocity*(fall_time*i/20)-up*(.5*9.81*(fall_time*i/20)**2))for i in range(1,21)]
    runoff[-1]=list(bottom)
    # The channel has a broad physical spill lip. Below it the falling sheet
    # spreads; per-point widths let the runtime taper/break its outer fringes.
    runoff_widths=[opening-1.4,opening-1.4]
    for i in range(1,21):
        t=i/20
        runoff_widths.append((opening-1.4)+(70*scale-(opening-1.4))*math.sqrt(t))
    # One physical hood lights the actual impact. It uses the existing pool of
    # runtime lights; the record supplies no new Three.js light allocation.
    lamp=point(18*scale,pool_y+14,pool_z+pool_l/2-2)
    part('tailrace shielded impact lamp standard',lamp-up*6,(.7,13,.7),'iron',True)
    part('tailrace shielded impact lamp hood',lamp,(3.8,.8,2.7),'iron')
    part('tailrace impact lamp lens',lamp-up*.45,(3.1,.08,2.0),'fixture')
    light={'p':list(lamp-up*1.4-out*1.5),'power':2200,'color':'#ffe1b7','radius':90,'pocket':True,'hydraulic':True,'focusRange':[station-650,station+200]}
    record={'id':'turbine-water-%d'%round(station),'distance':station,'rotor':{'p':list(center-out*31),'axis':list(-out),'radius':radius},
            'feed':{'points':[list(p)for p in feed_controls],'radius':7.6*scale},
            'discharge':{'mouth':list(mouth),'axis':list(jet_axis),'width':16*scale,'height':12*scale,'jet':jet,'impact':list(impact)},
            'basin':{'center':list(point(0,pool_y,pool_z)),'along':list(along),'out':list(-out),'width':pool_w-4,'length':pool_l-4,'bedY':bed_y,'waterY':water_y},
            'runoff':{'points':runoff,'width':opening-1.4,'widths':runoff_widths,'depth':.6},'lights':[light]}
    c.setdefault('turbineWater',[]).append(record)
    c['lights'].append(light)
    for label,p in [('feed volute connection',feed_controls[-1]),('draft mouth',mouth),('pool impact',impact),('pool center',point(0,pool_y,pool_z)),('overflow lip',lip)]:targets.append({'name':label,'p':list(p)})
    for x in [-pool_w/2+2,pool_w/2-2]:
        for z in [pool_z-pool_l/2+2,pool_z+pool_l/2-2]:targets.append({'name':'pool water corner','p':list(point(x,pool_y,z))})
    result={'record':record,'foundationSamples':foundations,'anchorSamples':anchors,'sightTargets':targets,
            'outflowGround':ground(end_x,end_z),'outflowWaterY':basin_y,
            'visualTriangles':sum(sum(len(f)-2 for f in o['faces'])for o in c['objects'][first_object:]),
            'physicalTriangles':sum(sum(len(f)-2 for f in o['faces'])for o in c['solids'][first_solid:])}
    c.setdefault('turbine_water_summaries',[]).append(result)
    return result
