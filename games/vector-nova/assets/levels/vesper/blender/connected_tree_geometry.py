"""Connected broadleaf geometry in game-space metres; no Blender scene side effects.

Construction method follows the human-approved Vesper starting-view pilot.
Every limb is sampled from its actual parent centreline; foliage has petioles.
"""
import math
import random
from mathutils import Vector


# Human art steer: regain oversized broad leaves and substantial boughs.
LEAF_LENGTH_SCALE = 1.85
LEAF_WIDTH_SCALE = 2.0
BRANCH_REACH_SCALE = 1.10
BRANCH_RADIUS_SCALE = 1.22


def broadleaf_surface(base, direction, length, width, shade, rows=7, columns=5):
    """A cupped lamina with a curved midrib and rolled, asymmetric margins.

    Single vertices close the base/tip; collapsed endpoint quads formerly spent
    triangles on zero-area faces and produced coarse, sheet-like shading.
    UV.x follows the midrib and UV.y runs across it for procedural veins.
    """
    base=Vector(base);forward=direction.normalized()
    side=forward.cross(Vector((0,1,0)))
    if side.length<.05:side=forward.cross(Vector((1,0,0)))
    side.normalize();up=side.cross(forward).normalized()
    phase=math.sin(base.dot(Vector((.73,.41,.29)))+shade*8)
    roll=phase*.30
    side,up=side*math.cos(roll)+up*math.sin(roll),up*math.cos(roll)-side*math.sin(roll)
    data={'v':[],'f':[],'uv':[],'c':[]};rings=[]
    for i in range(rows):
        t=(1-math.cos(math.pi*i/(rows-1)))*.5;profile=math.sin(math.pi*t)**.68;ring=[]
        for w in ([0] if i in [0,rows-1] else [2*j/(columns-1)-1 for j in range(columns)]):
            asym=1+.10*phase*w*math.sin(math.pi*t)
            curl=(.085+.055*math.sin(t*math.pi*2+phase))*w*w*width*profile
            ridge=length*(.115*math.sin(math.pi*t)-(.13+.025*phase)*t**3)
            twist=phase*w*width*profile*(t-.35)*.16
            p=base+forward*(length*t)+side*(width*profile*w*asym)
            p+=up*(ridge+curl+twist)
            ring.append(len(data['v']));data['v'].append(p)
            data['uv'].append((t,(w+1)*.5))
            value=shade*(.89+.11*math.sin(math.pi*t))*(1-.07*abs(w))
            data['c'].append((value,value*(.93+.06*t),value*.88,1))
        rings.append(ring)
    data['f'].extend([(rings[0][0],rings[1][j],rings[1][j+1]) for j in range(columns-1)])
    for i in range(1,rows-2):
        for j in range(columns-1):data['f'].append((rings[i][j],rings[i+1][j],rings[i+1][j+1],rings[i][j+1]))
    data['f'].extend([(rings[-2][j],rings[-1][0],rings[-2][j+1]) for j in range(columns-1)])
    return data


def make_connected_tree(seed=290930, forest_budget=False, layout=None, foliage_scale=1.0, leaf_detail=(7,5)):
    rng=random.Random(seed)
    B=lambda p:(p[0],-p[2],p[1])
    parts={'wood':{'v':[],'f':[],'uv':[],'c':[]},'leaves':{'v':[],'f':[],'uv':[],'c':[]}}
    structure=[]
    paths={}
    profiles={}

    def add_vertex(part,p,uv=(0,0),color=(1,1,1,1)):
        d=parts[part];d['v'].append(B(p));d['uv'].append(uv);d['c'].append(color);return len(d['v'])-1

    def tube(name,points,radii,sides,parent=None,anchor=None,root_surface=None):
        if name.startswith('limb-'):
            radii=[r*BRANCH_RADIUS_SCALE for r in radii]
        if forest_budget and "-petiole-" in name: sides=3
        points=[Vector(p) for p in points];rings=[];length=0;root_uvs=[];previous_ring=[];surface_lengths=[0]*(sides+1)
        for i,p in enumerate(points):
            tangent=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
            axis=tangent.cross(Vector((0,1,0)))
            if axis.length<.01:axis=tangent.cross(Vector((0,0,1)))
            axis.normalize();other=tangent.cross(axis).normalized()
            if i:length+=(p-points[i-1]).length
            ring=[];surface_ring=[];arc=0
            for j in range(sides+1):
                a=j/sides*math.tau
                r=radii[i]*(1+.16*math.sin(a*5+i*.06)+.055*math.sin(a*9-i*.13))
                if parent and i < 3: r *= 1 + .32 * (1-i/3)**2
                if root_surface and i < 4: r *= 1 + .08 * (1-i/4)**2
                point=p+(axis*math.cos(a)+other*math.sin(a))*r
                uv=(j/sides*max(1,radii[0]*math.tau/16),length/16)
                if root_surface:
                    surface, attachment_uv=root_surface(point)
                    if i < 4:
                        # A short eased socket leaves the bough free to taper;
                        # pulling half its length onto the bole creates broad fins.
                        blend=(.5+.5*math.cos(math.pi*i/4))**2
                        inward=Vector((surface.x,0,surface.z)).normalized()*4.5
                        point=point.lerp(surface-inward,blend)
                    if i == 0: root_uvs.append(attachment_uv)
                    if j:arc+=(point-surface_ring[-1]).length
                    if i:surface_lengths[j]+=(point-previous_ring[j]).length
                    uv=(root_uvs[0][0]+arc/56,root_uvs[0][1]+surface_lengths[j]/72)
                    surface_ring.append(point)
                ring.append(add_vertex('wood',point,uv))
            rings.append(ring)
            if root_surface:previous_ring=surface_ring
        for i in range(len(rings)-1):
            for j in range(sides):parts['wood']['f'].append((rings[i][j],rings[i][j+1],rings[i+1][j+1],rings[i+1][j]))
        # Tiny petiole end caps are hidden inside their parent and leaf base.
        if not (forest_budget and '-petiole-' in name):
            if not name.startswith('limb-hollow-'): parts['wood']['f'].append(tuple(reversed(rings[0][:-1])))
            parts['wood']['f'].append(tuple(rings[-1][:-1]))
        structure.append({'id':name,'parent':parent,'anchor':list(anchor) if anchor is not None else None,'base':list(points[0]),'tip':list(points[-1]),'radii':[radii[0],radii[-1]]})
        paths[name]=points
        profiles[name]=list(radii)
        return points

    def along(points,f):
        u=max(0,min(1,f))*(len(points)-1);i=min(len(points)-2,int(u));return points[i].lerp(points[i+1],u-i)

    def leaf(base,direction,length,width,shade):
        data=broadleaf_surface(base,direction,length*LEAF_LENGTH_SCALE,width*LEAF_WIDTH_SCALE,shade,rows=leaf_detail[0],columns=leaf_detail[1])
        indices=[add_vertex('leaves',p,uv,color) for p,uv,color in zip(data['v'],data['uv'],data['c'])]
        parts['leaves']['f'].extend(tuple(indices[i] for i in face) for face in data['f'])

    leaf_count=0
    def leafy_shoot(name,base,direction,length,parent):
        nonlocal leaf_count
        forward=direction.normalized();side=forward.cross(Vector((0,1,0))).normalized()
        pts=[base+forward*(length*f)+Vector((0,math.sin(f*math.pi)*length*.17,0)) for f in [0,.25,.5,.75,1]]
        tube(name,pts,[r*foliage_scale for r in [.48,.35,.25,.13,.035]],5,parent,base)
        for k in range(6):
            f=.14+k*.145;socket=along(pts,f)
            for sign in [-1,1]:
                out=(forward*.42+side*sign*.85+Vector((0,rng.uniform(-.16,.60),0))).normalized()
                petiole=socket+out*rng.uniform(.7,1.1)*foliage_scale
                tube(name+'-petiole-'+str(k)+'-'+str(sign),[socket,petiole],[.095*foliage_scale,.045*foliage_scale],4,name,socket)
                leaf(petiole,out,rng.uniform(5.5,8.0)*(1-.27*f)*foliage_scale,rng.uniform(1.8,2.9)*foliage_scale,rng.uniform(.70,1.32));leaf_count+=1
        leaf(pts[-1],forward+Vector((0,.2,0)),6*foliage_scale,2.4*foliage_scale,1.03);leaf_count+=1

    # A hollow landmark supplies shell-anchored limbs instead of a solid trunk.
    if layout is not None:
        layout(tube, along, leafy_shoot)
        return {'parts':parts,'paths':paths,'profiles':profiles,'structure':structure,'leafCount':leaf_count}

    family={290927:0,290930:1,290934:2}.get(seed,1)
    height=[196,205,172][family]
    lean=[-35,-23,28][family]
    def trunk_center(t):
        return Vector((lean*t**1.4+[14,5,19][family]*math.sin(t*math.tau)*t,height*t,[19,12,-16][family]*math.sin(t*2.8)*t))
    trunk_points=[trunk_center(i/64) for i in range(65)]
    trunk_radii=[14.5*(1-i/64)**.85+1.0+9*math.exp(-i/64*18) for i in range(65)]
    tube('trunk',trunk_points,trunk_radii,24)
    for k in range(9):
        a=k*math.tau/9+.24*math.sin(k*1.7+family);out=Vector((math.cos(a),0,math.sin(a)))
        anchor=.045 if not forest_budget else .075+.055*(.5+.5*math.sin(k*2.3))
        base=along(trunk_points,anchor)
        reach=28+(k%3)*3 if not forest_budget else 34+24*(.5+.5*math.sin(k*1.8+family))
        bend=Vector((-out.z,0,out.x))*math.sin(k+family)*8
        points=[base, out*reach*.32+bend*.3+Vector((0,base.y*.55,0)),out*reach*.7+bend+Vector((0,3,0)),out*reach+Vector((0,-3,0))]
        tube('buttress-'+str(k),points,[9 if forest_budget else 7,7 if forest_budget else 5,3.5,.5],10,'trunk',base)

    # Three unequal leaders divide the crown into connected, leaning masses.
    # The approved standalone pilot keeps its original main-trunk construction.
    supports=[('trunk',trunk_points)]
    if forest_budget:
        for j in range(3):
            anchor=[.28,.43,.56][j];base=along(trunk_points,anchor)
            angle=j*2.399+family*1.4;direction=Vector((math.cos(angle),0,math.sin(angle)))
            reach=[33,27,19][j];rise=height*[.57,.47,.32][j]
            pts=[base+direction*(reach*t**.72)+Vector((math.sin(t*3)*7,rise*t,math.cos(angle+t)*7*t)) for t in [i/10 for i in range(11)]]
            name='crown-stem-'+str(j)
            radius=trunk_radii[int(anchor*64)]*.77
            tube(name,pts,[radius*(1-i/10)**.8+.6 for i in range(11)],12,'trunk',base)
            supports.append((name,pts))

    # Broad asymmetric mature crown; every fork starts inside its parent centreline.
    for k in range(14):
        t=.43+k*.037+rng.uniform(-.008,.008)
        parent,parent_path=supports[(k+family)%len(supports)]
        if forest_budget: t=.32+(k//len(supports))*.17+rng.uniform(-.035,.035)
        base=along(parent_path,t)
        a=k*2.399+.3*math.sin(k);direction=Vector((math.cos(a),0,math.sin(a)));side=Vector((-math.sin(a),0,math.cos(a)))
        length=(38+17*math.sin((t-.40)/.58*math.pi))*rng.uniform(.78,1.16)*BRANCH_REACH_SCALE
        if forest_budget: length*=.83 if parent!='trunk' else 1.05
        rise=14+rng.random()*17;sway=rng.uniform(-8,8)
        pts=[base+direction*(length*f)+side*(math.sin(f*2.2)*sway)+Vector((0,rise*f+7*math.sin(f*math.pi),0)) for f in [j/9 for j in range(10)]]
        r=(6.5*(1-t)+3.5);radii=[r*(1-j/9)**1.05+.32 for j in range(10)]
        name='limb-'+str(k);tube(name,pts,radii,10,parent,base)
        for n,f in enumerate([.54,.84]):
            socket=along(pts,f)
            for sign in [-1,1]:
                out=(direction*.5+side*sign*.80+Vector((0,.40+rng.random()*.35,0))).normalized();reach=(14+rng.random()*9)*BRANCH_REACH_SCALE
                forks=[socket+out*(reach*q)+Vector((0,2.7*math.sin(q*math.pi),0)) for q in [0,.25,.5,.75,1]]
                twig=name+'-fork-'+str(n)+'-'+str(sign);tube(twig,forks,[2.0,1.5,1.05,.62,.17],7,name,socket)
                for m,q in enumerate([.55,1]):
                    start=along(forks,q)
                    heading=(out+side*((m-1)*.58)+Vector((0,.16,0))).normalized()
                    leafy_shoot(twig+'-shoot-'+str(m),start,heading,11+rng.random()*6,twig)
        leafy_shoot(name+'-leader',pts[-1],direction+Vector((0,.6,0)),17,name)
    for k in range(5):
        base=along(trunk_points,.94+k*.012);a=k*2.4
        leafy_shoot('apical-shoot-'+str(k),base,Vector((math.cos(a)*.65,.75,math.sin(a)*.65)),14,'trunk')

    return {'parts':parts,'paths':paths,'profiles':profiles,'structure':structure,'leafCount':leaf_count}
