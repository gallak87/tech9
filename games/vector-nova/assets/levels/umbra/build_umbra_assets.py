"""Umbra Fold: deterministic scene-reference-to-Blender architecture.
Run: Blender --background --python build_umbra_assets.py
CPU modeling/export only. World coordinates are Y-up at export.
"""
import bpy, math, random
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
random.seed(1029)
ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/assets/levels/umbra/umbra-observatory.glb'
SOURCE = Path(__file__).with_name('umbra-observatory.blend')
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

def mat(name, color, metal=0, rough=.7, emission=None):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    if emission:
        p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=emission
    return m
stone=mat('Fractured warm ivory',(.47,.455,.405),.015,.89)
stone2=mat('Fresh pale fractures',(.69,.665,.59),.01,.94)
graphite=mat('Layered graphite',(.095,.12,.155),.46,.62)
metal=mat('Cold titanium repair',(.24,.285,.315),.82,.41)
dark=mat('Recessed instrument',(.025,.048,.075),.7,.56)
amber=mat('Amber service glass',(.95,.32,.055),.1,.3,3.0)
cyan=mat('Cold instrument glass',(.13,.62,.88),.1,.3,2.4)
aged=mat('Aged slate ivory',(.255,.265,.25),.015,.96)
MATS=[stone,stone2,graphite,metal,dark,amber,cyan,aged]

def pt(v):return (v[0],-v[2],v[1])
def group(name):
    o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o); return o

def mesh(name,verts,faces,material,parent):
    me=bpy.data.meshes.new(name); me.from_pydata([pt(v) for v in verts],[],faces);me.materials.append(material)
    o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.parent=parent;return o

def box(name,center,size,material,parent,skew=0):
    x,y,z=center;w,h,d=[v/2 for v in size]
    v=[(x+sx*w+(sy+1)*skew/2,y+sy*h,z+sz*d) for sy in [-1,1] for sz in [-1,1] for sx in [-1,1]]
    return mesh(name,v,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],material,parent)

def beam(name,a,b,width,material,parent):
    av=Vector(pt(a));bv=Vector(pt(b));mid=(av+bv)/2
    bpy.ops.mesh.primitive_cube_add(size=1,location=mid);o=bpy.context.object;o.name=name;o.dimensions=(width,width,(bv-av).length)
    o.rotation_euler=(bv-av).to_track_quat('Z','Y').to_euler();bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(material);o.parent=parent;return o

def arc(name,r,width,depth,start,end,material,parent,center=(0,0,0),segments=32):
    vs=[];fs=[];cx,cy,cz=center
    stony=material in [stone,stone2,aged]
    # Uneven radial bands and shallow chipped face relief make actual rough
    # masonry under grazing light, while manufactured ribs stay machined.
    radial=4 if stony else 1
    for i in range(segments+1):
        a=start+(end-start)*i/segments
        for front in [False,True]:
            for j in range(radial+1):
                rr=r-width/2+width*j/radial
                zz=cz+(-depth/2 if not front else depth/2)
                if stony:
                    if j in [0,radial] and i%3==0:rr+=(.22 if j==0 else -.48)
                    if front and j not in [0,radial]:zz+=random.uniform(-.35,.22)
                    if front and i in [0,segments]:zz-=.38 if j%2 else .15
                vs.append((cx+math.cos(a)*rr,cy+math.sin(a)*rr,zz))
    row=2*(radial+1)
    for i in range(segments):
        a=i*row;b=a+row
        for j in range(radial):
            fs.append((a+j,b+j,b+j+1,a+j+1))
            f=a+radial+1+j;g=b+radial+1+j
            fs.extend([(f,f+1,g),(f+1,g+1,g)])
        fs.extend([(a,a+radial+1,b+radial+1,b),(a+radial,b+radial,b+row-1,a+row-1)])
    for endrow in [0,segments*row]:
        for j in range(radial):fs.append((endrow+j,endrow+j+1,endrow+radial+2+j,endrow+radial+1+j))
    return mesh(name,vs,fs,material,parent)

def wedge(name,x,y,z,w,h,d,material,parent):
    # Irregular sealed ashlar with chipped edges, deep fractures and quiet faces.
    # Its fresh break is a separate material, not painted crackle on a trapezoid.
    cols=7;rows=5;verts=[];faces=[]
    top=[random.uniform(.78,1.02) for _ in range(cols)]
    cleft=random.choice([1,2,4,5]); damaged=random.random()<.37
    for back in [False,True]:
        for row in range(rows):
            v=row/(rows-1)
            for col in range(cols):
                u=col/(cols-1)
                xx=x+(u-.5)*w*(1-v*.13)
                yy=y+v*h*top[col]
                edge=abs(u-.5)*2
                chips=(.10 if (col+row)%4==0 else .035)*d
                zz=z+(-1 if back else 1)*(d/2-chips*edge)
                if not back and row not in [0,rows-1]:
                    # A few broad clefts and a chipped course end cast real shadows.
                    zz-=d*(.09 if damaged and col in [cleft,cleft+1] and row in [2,3] else 0)
                    zz+=random.uniform(-.012,.014)*min(w,h)
                verts.append((xx,yy,zz))
    n=rows*cols
    for back in [0,1]:
        for row in range(rows-1):
            for col in range(cols-1):
                a=back*n+row*cols+col;b=a+1;c=a+cols;e=c+1
                faces.extend([(a,b,c),(c,b,e)] if back==0 else [(a,c,b),(c,e,b)])
    for row in range(rows-1):
        a=row*cols;b=a+cols
        faces.extend([(a,b,b+n,a+n),(a+cols-1,a+cols-1+n,b+cols-1+n,b+cols-1)])
    for col in range(cols-1):
        faces.append((col,col+n,col+1+n,col+1))
        a=(rows-1)*cols+col
        faces.append((a,a+1,a+1+n,a+n))
    o=mesh(name,verts,faces,material,parent)
    o.data.materials.append(stone2 if material in [stone,aged] else material)
    for poly in list(o.data.polygons)[-cols+1:]:poly.material_index=1
    return o

def broken_arc(name,r,width,depth,start,end,parent,center=(0,0,0),segments=16):
    # Thick individual voussoirs, missing ends and exposed inner service ribs.
    step=(end-start)/segments
    for i in range(segments):
        if i in [segments-2] and segments>12:continue
        a=start+i*step+.002;b=start+(i+1)*step-.002
        rr=r+(.7 if i%7==0 else -.3 if i%11==0 else 0)
        arc(name,rr,width*(.82 if i%5==0 else 1),depth,a,b,aged if i%5==0 else stone,parent,center,2)
        if i%3==0:
            mid=(a+b)/2;cx,cy,cz=center
            x=cx+math.cos(mid)*r;y=cy+math.sin(mid)*r
            beam('bonded-arch-cleat',(x*.965,y*.965,cz+depth/2+.6),(x*1.035,y*1.035,cz+depth/2+.6),.65,metal,parent)

def consolidate(parent):
    # One mesh per material and retained piece parent gives compact runtime draw count.
    for m in MATS:
        children=[o for o in list(parent.children) if o.type=='MESH' and o.data.materials and o.data.materials[0]==m]
        if not children:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in children:o.select_set(True)
        bpy.context.view_layer.objects.active=children[0]
        if len(children)>1:bpy.ops.object.join()
        children[0].name=parent.name+'_'+m.name

def terrace():
    p=group('terrace')
    for i in range(4):
        box('stepped-deck',(-i*7,-i*8,0),(142-i*13,6,86-i*8),stone if i%2==0 else graphite,p,3)
    for x in [-52,-26,26,52]:
        wedge('fractured-buttress',x,-68,10,18,68,48,stone,p)
        beam('repair-diagonal',(x-6,-60,28),(x+13,-2,-30),3,metal,p)
        box('cold-service-strip',(x,3,27),(14,.5,1.3),cyan,p)
    for i in range(5):
        x=-60+i*26;h=28+random.random()*42
        wedge('broken-terrace-wall',x,4,-38,18,h,11,stone2,p)
        box('wall-recess',(x,h*.36,-31.8),(9,13,1.2),dark,p)
        box('recess-lamp',(x,h*.36+5,-31),(8,.7,.3),amber,p)
    for x in [-66,66]:
        box('suspended-gallery',(x,13,2),(7,4,70),metal,p)
        for z in [-28,0,28]:beam('gallery-stanchion',(x,14,z),(x,36,z),1.2,metal,p)
    for x in [-53,-27,25,51]:
        for y in [-44,-22,0]:
            box('buttress-masonry-joint',(x,y,28),(19,1.1,1.1),graphite,p)
            box('joint-service-anchor',(x+7,y+3,28.7),(2,4,.8),metal,p)
    for i in range(16):
        x=-68+i*8.5
        wedge('broken-edge-stone',x,5,-39,8,5+(i%4)*3,12,stone,p)
    consolidate(p)

def lens():
    p=group('lens')
    for j,(r,w,z) in enumerate([(78,9,0),(61,7,6),(44,5,12)]):
        broken_arc('damaged-lens-ring',r,w,10+j*2,.16,4.95-j*.13,p,(0,0,z),40)
        arc('cold-support-ring',r+7,2.2,3,-.2,5.6,metal,p,center=(0,0,z-6),segments=48)
        arc('luminous-optic-rim',r-5,.55,.6,.12,5.02,cyan,p,center=(0,0,z+6),segments=48)
        for i in range(12):
            a=i*math.tau/12
            if a>5:continue
            x,y=math.cos(a)*r,math.sin(a)*r
            box('lens-segment-clamp',(x,y,z+7),(5,7,10),graphite,p)
            for delta in [-.034,.034]:
                xx,yy=math.cos(a+delta)*r,math.sin(a+delta)*r
                beam('radial-stone-joint',(xx*.94,yy*.94,z+5),(xx*1.06,yy*1.06,z+5),.45,graphite,p)
            wedge('chipped-ring-face',x,y,z+5,4.5,3.5,3,stone,p)
    for a in [.3,1.7,3.1,4.5]:
        beam('radial-repair',(math.cos(a)*36,math.sin(a)*36,12),(math.cos(a)*89,math.sin(a)*89,-8),3.2,metal,p)
    wedge('lens-foot',0,-118,-8,92,43,40,stone,p)
    beam('lens-tripod',(-42,-113,-8),(-59,-40,-4),7,graphite,p)
    beam('lens-tripod',(38,-113,-8),(59,-40,-4),7,graphite,p)
    consolidate(p)

def vault():
    p=group('vault')
    for z in [-42,-14,14,42]:
        broken_arc('ribbed-vault',82,9,10,.12,2.9,p,(0,0,z),23)
        arc('inner-repair-spine',70,2.3,6,.15,2.97,metal,p,center=(0,0,z),segments=22)
        for x in [-79,79]:
            wedge('vault-pylon',x,-24,z,18,34,18,stone2,p)
            box('vault-waylight',(x*.91,7,z),(1,8,1),amber,p)
    for a in [.35,1.2,2.5]:
        x,y=math.cos(a)*83,math.sin(a)*83
        beam('longitudinal-rib',(x,y,-52),(x,y,52),4,metal,p)
    consolidate(p)

def instrument(name='instrument',stretch=1,fragments=False):
    p=group(name)
    for i in range(8):
        a=i*math.tau/8;r=24 if i%2==0 else 31
        q=group('piece_%02d'%i);q.parent=p
        dx=(i%3-1)*8 if fragments else 0;dz=(i%2-.5)*15 if fragments else 0
        x,z=math.cos(a)*r+dx,math.sin(a)*r+dz
        height=(160-(i%3)*17)*stretch
        box('instrument-fluted-pier',(x,height/2,z),(8,height,8),stone,q,2)
        box('pier-repair',(x+2,82*stretch,z+3),(2,148*stretch,2),metal,q)
        box('pier-lit-flute',(x-4.2,88*stretch,z),(1,125*stretch,1),amber,q)
        wedge('broken-crown',x,height-3*stretch,z,11,(14+(i%4)*5)*stretch,11,stone2,q)
        # Thick layered wall cassettes and exposed joints distinguish a ruined
        # instrument cathedral from an empty cage. Gaps reveal inner services.
        for j,level in enumerate([20,48,77,108,136]):
            if level*stretch > height-10*stretch:continue
            box('pier-masonry-cassette',(x,level*stretch,z),(12,18*stretch,12),stone2 if (i+j)%3==0 else stone,q,1.3)
            box('recessed-joint',(x,level*stretch-10*stretch,z),(13,1.3*stretch,13),graphite,q)
            for side in [-1,1]:
                box('cold-repair-cleat',(x+side*6.5,level*stretch,z),(1.4,5*stretch,5),metal,q)
        wedge('broad-fractured-buttress',x*1.18,0,z*1.18,20,58*stretch,20,stone,q)
        bx,bz=math.cos(a+.31)*r,math.sin(a+.31)*r
        beam('internal-cross-brace',(x,24*stretch,z),(bx,117*stretch,bz),2.6,metal,q)
        consolidate(q)
    for i,y in enumerate([12,47,105,151]):
        q=group('piece_%02d'%(i+8));q.parent=p
        # horizontal polygon rings are built with beam segments and genuine empty centers.
        for j in range(8):
            if i==1 and j in [1,2]:continue
            if i==3 and j in [5]:continue
            a=j*math.tau/8;b=(j+1)*math.tau/8;r=41-i*2
            aa=(math.cos(a)*r,y*stretch,math.sin(a)*r);bb=(math.cos(b)*r,y*stretch,math.sin(b)*r)
            beam('tier-ring',aa,bb,7 if i%2 else 10,graphite if i%2 else stone,q)
            beam('tier-service',(aa[0],aa[1]+4,aa[2]),(bb[0],bb[1]+4,bb[2]),1,cyan,q)
        consolidate(q)
    return p

def rib():
    p=group('rib')
    arc('broken-instrument-rib',45,6,9,.0,2.55,stone,p,segments=18)
    arc('exposed-instrument-conduit',37,1.8,3,-.12,2.74,metal,p,segments=18)
    wedge('fractured-anchor',41,-18,0,18,24,22,graphite,p)
    for a in [.3,1.0,1.7,2.4]:
        beam('rib-brace',(math.cos(a)*34,math.sin(a)*34,0),(math.cos(a)*49,math.sin(a)*49,0),2,metal,p)
    consolidate(p)

def gallery():
    p=group('gallery')
    for y,w,d,offset in [(-44,164,100,0),(-9,130,86,-12),(27,96,64,18)]:
        box('broken-cantilever-shelf',(offset,y,0),(w,5,d),stone,p,1)
        box('recessed-keel',(offset,y-3,0),(w-8,3,d-10),graphite,p)
        for x in [offset-w*.38,offset+w*.38]:
            wedge('battered-gallery-pier',x,y-34,-21,18,35,23,stone,p)
            beam('repaired-load-path',(x,y-28,-20),(offset,y-1,24),2.5,metal,p)
        bays=[(-46,18),(1,23),(45,14)] if y<0 else [(-15,18),(26,14)]
        for k,(xx,r) in enumerate(bays):
            x=offset+xx*(w/164)
            if y==27 and k==1:
                wedge('collapsed-loggia-end',x,y+2,-d*.37,27,23,16,aged,p)
                beam('exposed-collapse-tendon',(x-11,y+4,-d*.25),(x+7,y+40,-d*.25),1.7,metal,p)
            else:
                broken_arc('jointed-deep-portal',r,5,14,.12,3.00,p,(x,y+12,-d*.37),14)
                for side in [-1,1]:
                    wedge('portal-mass',x+side*r,y+2,-d*.37,8,14,16,stone,p)
                    box('inset-amber-service',(x+side*(r-3),y+9,-d*.29),(.5,9,.5),amber,p)
        for x in [offset-w*.45,offset+w*.45]:
            beam('gallery-handrail',(x,y+9,-d*.38),(x,y+9,d*.38),.7,metal,p)
            for z in [-d*.38,0,d*.38]:beam('rail-post',(x,y+2,z),(x,y+9,z),.8,metal,p)
        box('layered-deck-rim',(offset,y+2.8,d*.43),(w*.78,.7,2),graphite,p)
        box('instrument-waylight',(offset,y+3.2,d*.43),(w*.56,.4,.4),cyan,p)
    wedge('large-broken-facade',-42,-8,24,40,67,14,stone,p)
    for y in [5,24,42]:
        box('deep-fracture-course',(-42,y,31),(39,1.2,2),graphite,p)
        beam('facade-repair-strap',(-59,y-7,33),(-28,y+11,33),1.3,metal,p)
    for z in [-18,19]:
        broken_arc('ruptured-instrument-canopy',36,6,8,.22,2.51,p,(15,37,z),17)
        arc('exposed-canopy-rib',29,1.7,4,.16,2.72,metal,p,(15,37,z),24)
    consolidate(p)

def pier():
    p=group('pier')
    # Narrow attached load node: two damaged masonry piers around a true open
    # service bay, with supporting terraces, dark recesses and repair tendons.
    for x,h in [(-13,74),(13,62)]:
        wedge('damaged-pier-mass',x,-42,0,16,h,26,stone,p)
        for y in [-30,-12,6,24]:
            if y > h-46:continue
            box('pier-bond-course',(x,y,13.8),(17,1.2,1.6),graphite,p)
            box('pier-recess',(x,y+5,13.3),(8,8,1.6),dark,p)
            box('recess-service',(x-3,y+5,14.4),(.65,6,.65),amber,p)
            beam('diagonal-stone-repair',(x-7,y-5,15),(x+6,y+10,15),1.6,metal,p)
    arc('broken-service-arch',22,4.5,8,.16,2.55,stone2,p,center=(0,13,-4),segments=22)
    for y,w,z in [(-39,58,0),(-9,48,-7),(25,38,-5)]:
        box('stepped-service-deck',(0,y,z),(w,4,36),graphite,p)
        for x in [-w*.43,w*.43]:
            beam('service-bracket',(x,-41,0),(x*.65,y-2,z+12),2.2,metal,p)
            beam('gallery-rail',(x,y+5,z-14),(x,y+5,z+14),.65,metal,p)
            for zz in [-14,0,14]:beam('rail-support',(x,y+2,z+zz),(x,y+5,z+zz),.65,metal,p)
        box('keel-waylight',(0,y+2.4,z+16),(w*.65,.5,.8),cyan,p)
    for x in [-7,8]:
        beam('vertical-service-tendon',(x,-42,-10),(x,29,-10),1.8,metal,p)
    consolidate(p)

def wall():
    p=group('wall')
    # Thick irregular ashlar, open service portals and interrupted upper walls.
    # Individual courses and their recessed bonds retain real depth in shadow.
    for k,x in enumerate([-60,-20,20,60]):
        count=[7,6,8,5][k]
        for j in range(count):
            y=-66+j*15
            wedge('irregular-ashlar-pier',x+random.uniform(-1,1),y,0,20+random.uniform(-2,2),14.5,25,aged if (j+k)%3==0 else stone,p)
            if j%2==0:
                box('masonry-repair-anchor',(x+8,y+7,13.7),(2.5,5,2),metal,p)
                box('recessed-vertical-lamp',(x-6,y+7,14.1),(.7,7,.8),amber,p)
        wedge('separated-upper-mass',x,-66+count*15,0,21,12+random.random()*12,26,stone2,p)
    for x in [-40,0,40]:
        broken_arc('deep-service-portal',20,7,22,.06,3.08,p,(x,-10,0),18)
        for dx in [-18,18]:
            box('arch-foot',(x+dx,-27,0),(8,33,24),aged,p)
        box('solid-spandrel',(x,16,0),(40,9,22),stone,p,1)
        box('spandrel-instrument-recess',(x,16,12),(23,4,1),dark,p)
        for dx in [-10,0,10]:box('inset-service-grille',(x+dx,16,12.8),(1.3,3,.7),metal,p)
    for y,w in [(-57,148),(-21,140),(22,127)]:
        box('thick-observatory-shelf',(0,y,2),(w,5,46),stone if y!=22 else aged,p,2)
        for x in [-w*.46,w*.46]:
            beam('gallery-tension-repair',(x,-62,0),(x*.77,y-3,20),3.2,metal,p)
            beam('manufactured-gallery-rail',(x,y+7,-18),(x,y+7,22),.8,metal,p)
        box('recessed-cool-service',(0,y+3,24),(w*.72,.6,.8),cyan,p)
    for x in [-56,16,51]:
        beam('bonded-front-repair',(x,-52,15),(x+12,29,15),2.5,metal,p)
    consolidate(p)

def wall_variant(name,breached=False):
    p=group(name)
    # Same conservative clearance envelope as the original wall; different
    # structural histories and large mass distribution, not random debris.
    if breached:
        for x,y,w,h in [(-58,-65,33,106),(47,-65,46,126),(-12,-65,27,44)]:
            wedge('surviving-breached-mass',x,y,0,w,h,24,stone,p)
        broken_arc('remaining-deep-loggia',31,8,22,.15,2.34,p,(-15,-13,0),17)
        for y,w,x in [(-58,147,0),(-17,138,1),(24,75,30)]:
            box('interrupted-breached-shelf',(x,y,0),(w,6,43),aged,p,1)
            box('shelf-repair-lip',(x,y+3.2,22),(w*.86,.8,1.5),metal,p)
        for x in [-50,-35,34,58]:
            beam('exposed-breach-strap',(x,-56,15),(x+8,35,15),1.8,metal,p)
            for y in [-32,-3,25]:box('bolted-strap-cleat',(x+3,y,16),(5,2,1),graphite,p)
        beam('diagonal-breach-repair',(-44,-12,16),(33,43,16),2.8,metal,p)
        for x in [-7,7]:beam('breach-inner-tendon',(x,-50,-8),(x,49,-8),1.8,metal,p)
    else:
        for x,y,w,h in [(-46,-65,56,125),(27,-65,51,130),(65,-65,19,99)]:
            wedge('battered-solid-buttress',x,y,0,w,h,24,aged if x>50 else stone,p)
        # True narrow service slit between the broad masses.
        for x in [-16,0]:
            box('deep-slit-jamb',(x,-7,11),(3,112,5),graphite,p)
            box('slit-amber-service',(x,-4,14),(.6,83,.6),amber,p)
        for x in [-48,29]:
            for y in [-43,-14,17,44]:
                box('deep-bond-course',(x,y,12.5),(44,1.2,2),graphite,p)
                box('bond-end-anchor',(x+18,y+3,14),(4,5,1.5),metal,p)
                box('recessed-instrument-panel',(x,y+10,13),(18,9,1.3),dark,p)
                for dx in [-6,0,6]:box('service-panel-grille',(x+dx,y+10,14),(1,7,.8),metal,p)
        broken_arc('single-low-service-portal',19,6,20,.12,2.99,p,(48,-38,0),15)
        for y,w in [(-59,148),(-22,140),(18,119)]:
            box('buttress-service-balcony',(0,y,0),(w,5,45),stone,p,1)
            box('service-balcony-keel',(0,y-3,0),(w-5,2,43),graphite,p)
    for y in [-55,-18,23]:
        box('inset-cold-instrument-strip',(12,y+4,24),(81,.4,.7),cyan,p)
    consolidate(p)


terrace();gallery();pier();wall();wall_variant("wall_solid");wall_variant("wall_breach",True);lens();vault();instrument();instrument('event_stretched',2.65);instrument('event_fragmented',2.1,True);rib()
for ob in bpy.data.objects:
    if ob.type=='MESH':
        # Applied single-segment bevels catch grazing light on real stone and
        # repair edges. Retain broad facets and the fractured silhouette.
        bpy.context.view_layer.objects.active=ob
        mod=ob.modifiers.new('Stone and metal edge wear','BEVEL');mod.width=.24;mod.segments=1
        mod.limit_method='ANGLE';mod.angle_limit=.55
        bpy.ops.object.modifier_apply(modifier=mod.name)
        for poly in ob.data.polygons:poly.use_smooth=False
# Bake local contact occlusion into retained vertex color, on CPU. This travels
# with each actual member in the giant event and works identically in low/high.
for root in [o for o in bpy.data.objects if o.type=='EMPTY' and o.parent is None]:
    obs=[o for o in root.children_recursive if o.type=='MESH']
    vs=[];fs=[]
    for o in obs:
        offset=len(vs);vs.extend([o.matrix_world@v.co for v in o.data.vertices])
        fs.extend([tuple(offset+i for i in poly.vertices) for poly in o.data.polygons])
    tree=BVHTree.FromPolygons(vs,fs,all_triangles=False)
    for o in obs:
        colors=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
        o.data.color_attributes.active_color=colors
        cache={}
        for poly in o.data.polygons:
            n=(o.matrix_world.to_3x3()@poly.normal).normalized()
            tangent=n.cross(Vector((0,0,1)) if abs(n.z)<.9 else Vector((0,1,0))).normalized()
            bitangent=n.cross(tangent)
            for li in poly.loop_indices:
                loop=o.data.loops[li];v=o.matrix_world@o.data.vertices[loop.vertex_index].co
                key=tuple(round(c,3) for c in (*v,*n))
                if key not in cache:
                    occ=0
                    origin=v+n*.14
                    for j in range(8):
                        theta=(j+.5)*math.tau/8
                        direction=(n*.63+tangent*math.cos(theta)*.78+bitangent*math.sin(theta)*.78).normalized()
                        hit=tree.ray_cast(origin,direction,14)
                        if hit[0] is not None:occ+=1-hit[3]/20
                    cache[key]=max(.31,1-occ/8*.81)
                ao=cache[key]
                # Restrained broad tint belongs to the weathered member, not noise
                # painted equally across every exterior and fresh fractured face.
                tint=.96+.04*math.sin(v.x*.097+v.z*.081)
                colors.data[li].color=(ao*tint,ao*tint,ao*tint,1)
    print('UMBRA_CPU_CAVITIES',root.name,len(vs))
bpy.context.scene['provenance']='Authored from selected built-in imagegen scene umbra-scene-reference.png. Generator seed 1029. No third-party assets.'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
OUT.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',export_yup=True,export_apply=True,export_animations=False,export_vertex_color='ACTIVE')
print('UMBRA_EXPORT',OUT,OUT.stat().st_size)
