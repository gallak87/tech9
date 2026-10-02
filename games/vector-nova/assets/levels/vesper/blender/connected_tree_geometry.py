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


def broadleaf_surface(base, direction, length, width, shade, rows=5):
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
        t=i/(rows-1);profile=math.sin(math.pi*t)**.72;ring=[]
        for w in ([0] if i in [0,rows-1] else [-1,0,1]):
            asym=1+.10*phase*w*math.sin(math.pi*t)
            curl=(.26+.12*math.sin(t*math.pi*2+phase))*abs(w)*width*profile
            ridge=length*(.22*math.sin(math.pi*t)-(.24+.025*phase)*t**3)
            twist=phase*w*width*profile*(t-.35)*.35
            p=base+forward*(length*t)+side*(width*profile*w*asym)
            p+=up*(ridge+curl+twist)
            ring.append(len(data['v']));data['v'].append(p)
            data['uv'].append((t,(w+1)*.5))
            value=shade*(.89+.11*math.sin(math.pi*t))*(1-.07*abs(w))
            data['c'].append((value,value*(.93+.06*t),value*.88,1))
        rings.append(ring)
    data['f'].extend([(rings[0][0],rings[1][j],rings[1][j+1]) for j in range(2)])
    for i in range(1,rows-2):
        for j in range(2):data['f'].append((rings[i][j],rings[i+1][j],rings[i+1][j+1],rings[i][j+1]))
    data['f'].extend([(rings[-2][j],rings[-1][0],rings[-2][j+1]) for j in range(2)])
    return data


def make_connected_tree(seed=290930, forest_budget=False, layout=None, foliage_scale=1.0):
    rng=random.Random(seed)
    B=lambda p:(p[0],-p[2],p[1])
    parts={'wood':{'v':[],'f':[],'uv':[],'c':[]},'leaves':{'v':[],'f':[],'uv':[],'c':[]}}
    structure=[]
    paths={}
    profiles={}

    def add_vertex(part,p,uv=(0,0),color=(1,1,1,1)):
        d=parts[part];d['v'].append(B(p));d['uv'].append(uv);d['c'].append(color);return len(d['v'])-1

    def tube(name,points,radii,sides,parent=None,anchor=None):
        if name.startswith('limb-'):
            radii=[r*BRANCH_RADIUS_SCALE for r in radii]
        if forest_budget and "-petiole-" in name: sides=3
        points=[Vector(p) for p in points];rings=[];length=0
        for i,p in enumerate(points):
            tangent=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
            axis=tangent.cross(Vector((0,1,0)))
            if axis.length<.01:axis=tangent.cross(Vector((0,0,1)))
            axis.normalize();other=tangent.cross(axis).normalized()
            if i:length+=(p-points[i-1]).length
            ring=[]
            for j in range(sides+1):
                a=j/sides*math.tau
                r=radii[i]*(1+.10*math.sin(a*7+i*.09)+.04*math.sin(a*13-i*.13))
                ring.append(add_vertex('wood',p+(axis*math.cos(a)+other*math.sin(a))*r,(j/sides*max(1,radii[0]*math.tau/16),length/16)))
            rings.append(ring)
        for i in range(len(rings)-1):
            for j in range(sides):parts['wood']['f'].append((rings[i][j],rings[i][j+1],rings[i+1][j+1],rings[i+1][j]))
        # Tiny petiole end caps are hidden inside their parent and leaf base.
        if not (forest_budget and '-petiole-' in name):
            parts['wood']['f'].append(tuple(reversed(rings[0][:-1])));parts['wood']['f'].append(tuple(rings[-1][:-1]))
        structure.append({'id':name,'parent':parent,'anchor':list(anchor) if anchor is not None else None,'base':list(points[0]),'tip':list(points[-1]),'radii':[radii[0],radii[-1]]})
        paths[name]=points
        profiles[name]=list(radii)
        return points

    def along(points,f):
        u=max(0,min(1,f))*(len(points)-1);i=min(len(points)-2,int(u));return points[i].lerp(points[i+1],u-i)

    def leaf(base,direction,length,width,shade):
        data=broadleaf_surface(base,direction,length*LEAF_LENGTH_SCALE,width*LEAF_WIDTH_SCALE,shade)
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

    def trunk_center(t):return Vector((-23*t**1.4+5*math.sin(t*math.tau)*t,205*t,12*math.sin(t*2.8)*t))
    trunk_points=[trunk_center(i/64) for i in range(65)]
    trunk_radii=[14.5*(1-i/64)**.85+1.0+9*math.exp(-i/64*18) for i in range(65)]
    tube('trunk',trunk_points,trunk_radii,24)
    for k in range(9):
        a=k*math.tau/9+.14*math.sin(k);out=Vector((math.cos(a),0,math.sin(a)))
        base=along(trunk_points,.045)
        tube('buttress-'+str(k),[base,base*.0+out*18+Vector((0,3.4,0)),out*(28+(k%3)*3)+Vector((0,-2.0,0))],[7,5,1.0],9,'trunk',base)

    # Broad asymmetric mature crown; every fork starts inside its parent centreline.
    for k in range(14):
        t=.43+k*.037+rng.uniform(-.008,.008);base=along(trunk_points,t)
        a=k*2.399+.3*math.sin(k);direction=Vector((math.cos(a),0,math.sin(a)));side=Vector((-math.sin(a),0,math.cos(a)))
        length=(38+17*math.sin((t-.40)/.58*math.pi))*rng.uniform(.88,1.08)*BRANCH_REACH_SCALE
        rise=14+rng.random()*17;sway=rng.uniform(-8,8)
        pts=[base+direction*(length*f)+side*(math.sin(f*2.2)*sway)+Vector((0,rise*f+7*math.sin(f*math.pi),0)) for f in [j/9 for j in range(10)]]
        r=(6.5*(1-t)+3.5);radii=[r*(1-j/9)**1.05+.32 for j in range(10)]
        name='limb-'+str(k);tube(name,pts,radii,10,'trunk',base)
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
