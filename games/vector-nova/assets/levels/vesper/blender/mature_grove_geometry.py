"""Asymmetric mature grove forms, with volumetric crowns and welded branch crotches.

Coordinates follow the existing connected-tree builder. Both quality meshes keep
identical leaf placements; only lamina tessellation and wood density change.
"""
import math
import random
import bpy
from mathutils import Vector
from connected_tree_geometry import make_connected_tree, broadleaf_surface


def make_mature_grove(seed=781, low=False, quality=None):
    rng=random.Random(seed)
    family={290927:0,290930:1,290934:2}.get(seed,-1)
    height=[205,235,155,190][family]
    lean=[-46,26,55,32][family]
    spread=[1.1,.82,1.28,1][family]
    quality=quality or ('mid' if low else 'hero')
    rows,columns={'hero':(9,5),'high':(7,5),'mid':(5,3),'low':(3,3)}[quality]
    clusters=[]
    def layout(tube, along, _shoot):
        trunk=[Vector((lean*t**1.5+6*math.sin(t*4+family)*t,height*t,15*math.sin(t*3.5)*t)) for t in [i/30 for i in range(31)]]
        tube('trunk',trunk,[18*(1-i/30)**.9+2+7*math.exp(-i/30*16) for i in range(31)],20)
        for i in range(8):
            angle=i*2.399+.2*rng.random();direction=Vector((math.cos(angle),0,math.sin(angle)))
            base=along(trunk,.07+.045*rng.random());reach=47+17*rng.random()
            points=[base,base*.35+direction*reach*.35+Vector((0,5,0)),direction*reach*.8+Vector((0,2,0)),direction*reach+Vector((0,-4,0))]
            tube('buttress-'+str(i),points,[11,8,4,.6],12,'trunk',base)
        supports=[('trunk',trunk)]
        leaders=[(.30,105,78),(.48,92,-68),(.61,74,57)]
        if family==0:leaders=[(.29,105,86),(.52,80,-65)]
        if family==1:leaders=[(.36,120,48),(.43,110,-43),(.65,64,35)]
        if family==2:leaders=[(.25,65,104),(.44,62,-89)]
        for i,(anchor,rise,reach) in enumerate(leaders):
            base=along(trunk,anchor);angle=.65+i*2.1+family*.63
            direction=Vector((math.cos(angle),0,math.sin(angle)))
            points=[base+direction*(abs(reach)*spread*t**.8)+Vector((7*math.sin(t*3)*t,rise*(height/190)*t,6*math.sin(t*2)*t)) for t in [j/14 for j in range(15)]]
            name='leader-'+str(i);tube(name,points,[11.5*(1-j/14)**1.15+.45 for j in range(15)],14,'trunk',base)
            supports.append((name,points))
        for i in range(12):
            parent,path=supports[i%len(supports)]
            anchor=(.70+.23*rng.random()) if parent=='trunk' else .63+.31*rng.random()
            base=along(path,anchor);angle=i*2.399+rng.uniform(-.4,.4)+family*.83
            out=Vector((math.cos(angle),0,math.sin(angle)))
            reach=(27+18*rng.random())*spread;rise=rng.uniform(-3,20)
            points=[base+out*(reach*t)+Vector((math.sin(t*3)*5,rise*t+math.sin(t*math.pi)*9,math.cos(t*2)*4*t)) for t in [j/10 for j in range(11)]]
            name='limb-grove-'+str(i);tube(name,points,[5.5*(1-j/10)**1.25+.35 for j in range(11)],12,parent,base)
            for j in range(3):
                socket=along(points,.42+j*.24)
                forkdir=(out+Vector((-out.z,0,out.x))*(-.75 if j%2 else .65)).normalized()
                length=15+rng.random()*12;lift=rng.uniform(2,15)
                fork=[socket+forkdir*(length*t)+Vector((0,lift*t,0)) for t in [k/5 for k in range(6)]]
                fname=name+'-fork-'+str(j);tube(fname,fork,[2.2*(1-k/5)**1.2+.2 for k in range(6)],8,name,socket)
                # Leaves grow along a three-dimensional twig spray: different
                # heights, rolls and inclinations, without a flat radial fan.
                for k in range(18):
                    p=along(fork,.18+.8*rng.random())
                    a=angle+k*2.399+rng.uniform(-.5,.5)
                    direction=Vector((math.cos(a),rng.uniform(-.48,1.0),math.sin(a))).normalized()
                    petiole=p+direction*rng.uniform(1.8,4)
                    tube(fname+'-petiole-'+str(k),[p,petiole],[.55,.28],4,fname,p)
                    clusters.append((petiole,direction,rng.uniform(18,28),rng.uniform(5.1,8.0),rng.uniform(.78,1.3)))
    data=make_connected_tree(seed,layout=layout)
    d=data['parts']['leaves']
    for base,direction,length,width,shade in clusters:
        leaf=broadleaf_surface(base,direction,length,width,shade,rows=rows,columns=columns)
        start=len(d['v']);d['v'].extend((p.x,-p.z,p.y) for p in leaf['v']);d['uv'].extend(leaf['uv']);d['c'].extend(leaf['c'])
        d['f'].extend(tuple(start+i for i in face) for face in leaf['f'])
    data['leafCount']=len(clusters)
    return data


def weld_grove_wood(root,low=False,quality=None,triangle_budget=None):
    """Voxel union gives branches continuous crotches, then bounded reduction."""
    quality=quality or ('mid' if low else 'high')
    wood=next(o for o in root.children if o.name.endswith('_wood'))
    bpy.context.view_layer.objects.active=wood
    modifier=wood.modifiers.new('Continuous living branch unions','REMESH')
    modifier.mode='VOXEL';modifier.voxel_size={'high':1.5,'mid':2.0,'low':3.5}[quality];modifier.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    smooth=wood.modifiers.new('Grown branch transitions','SMOOTH');smooth.factor=1.1;smooth.iterations=3
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    budget=triangle_budget or {'high':24000,'mid':7000,'low':1300}[quality]
    decimate=wood.modifiers.new('Grove wood render density','DECIMATE');decimate.ratio=min(1,budget/max(1,sum(len(p.vertices)-2 for p in wood.data.polygons)))
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    mesh=wood.data;uv=mesh.uv_layers.new(name='Metric bark projection') if not mesh.uv_layers else mesh.uv_layers.active
    for p in mesh.polygons:
        p.use_smooth=True
        axis=max(range(3),key=lambda i:abs(p.normal[i]))
        for li in p.loop_indices:
            v=mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv=(v.y/16,v.z/16) if axis==0 else (v.x/16,v.z/16) if axis==1 else (v.x/16,v.y/16)
    mesh.update()
