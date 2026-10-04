"""Umbra Fold: deterministic scene-reference-to-Blender architecture.
Run: Blender --background --python build_umbra_assets.py
CPU modeling/export only. World coordinates are Y-up at export.
"""
import bpy, math, random
from pathlib import Path
from mathutils import Vector
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
stone=mat('Fractured warm ivory',(.54,.57,.61),.08,.86)
stone2=mat('Fresh pale fractures',(.78,.79,.76),.06,.9)
graphite=mat('Layered graphite',(.095,.12,.155),.46,.62)
metal=mat('Cold titanium repair',(.23,.32,.40),.75,.31)
dark=mat('Recessed instrument',(.025,.048,.075),.7,.43)
amber=mat('Amber service glass',(.95,.32,.055),.1,.3,3.0)
cyan=mat('Cold instrument glass',(.13,.62,.88),.1,.3,2.4)
MATS=[stone,stone2,graphite,metal,dark,amber,cyan]

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
    for i in range(segments+1):
        a=start+(end-start)*i/segments
        for zz in [-depth/2,depth/2]:
            for rr in [r-width/2,r+width/2]:vs.append((cx+math.cos(a)*rr,cy+math.sin(a)*rr,cz+zz))
    for i in range(segments):
        a=i*4;b=a+4
        fs.extend([(a,b,b+1,a+1),(a+2,a+3,b+3,b+2),(a,a+2,b+2,b),(a+1,b+1,b+3,a+3)])
    fs.extend([(0,1,3,2),(segments*4,segments*4+2,segments*4+3,segments*4+1)])
    return mesh(name,vs,fs,material,parent)

def wedge(name,x,y,z,w,h,d,material,parent):
    # A broken stone face uses real uneven masonry facets, not a flat trapezoid
    # covered with noise. The perimeter remains attached to its volume.
    verts=[(x-w/2,y,z-d/2),(x+w/2,y,z-d/2),(x+w/2,y,z+d/2),(x-w/2,y,z+d/2),(x-w*.27,y+h,z-d*.32),(x+w*.35,y+h*.83,z-d*.32),(x+w*.21,y+h*.92,z+d*.34),(x-w*.36,y+h*1.03,z+d*.35)]
    faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(3,0,4,7)]
    grid=[]
    for row in range(5):
        v=row/4
        left=Vector(verts[3]).lerp(Vector(verts[7]),v)
        right=Vector(verts[2]).lerp(Vector(verts[6]),v)
        for col in range(7):
            u=col/6;ptt=left.lerp(right,u)
            if row not in [0,4] and col not in [0,6]:
                ptt.z+=random.uniform(-.055,.04)*min(w,h)
            grid.append(len(verts));verts.append(tuple(ptt))
    for row in range(4):
        for col in range(6):
            a=grid[row*7+col];b=grid[row*7+col+1];c=grid[(row+1)*7+col];e=grid[(row+1)*7+col+1]
            faces.extend([(a,b,c),(c,b,e)])
    return mesh(name,verts,faces,material,parent)

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
        arc('damaged-lens-ring',r,w,8+j*2,.16,4.95-j*.13,stone2,p,center=(0,0,z),segments=48)
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
        arc('ribbed-vault',82,9,7,.12,2.9,stone,p,center=(0,0,z),segments=22)
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
    # Two interrupted observatory galleries, real openings and offset load paths.
    for y,w,d in [(-44,168,104),(-9,144,92),(27,118,74)]:
        box('pale-gallery-slab',(0,y,0),(w,5,d),stone,p,2)
        for x in [-w*.4,w*.4]:
            wedge('attached-broad-pier',x,y-35,-26,14,33,20,stone,p)
            beam('gallery-tension-spine',(x,y-32,-26),(x*.65,y-1,29),2.8,metal,p)
        for j in range(5):
            x=-w*.4+j*w*.2
            if j==3 and y>0:continue
            arc('open-arch-portal',13,3,7,.08,3.05,stone2,p,center=(x,y+12,-d*.43),segments=14)
            for side in [-1,1]:
                box('portal-pier',(x+side*13,y+5,-d*.43),(4,13,7),stone,p)
                box('portal-service-light',(x+side*10.7,y+9,-d*.39),(.5,8,.5),amber,p)
        for x in [-w*.45,w*.45]:
            box('gallery-side-keel',(x,y+8,0),(3,3,d*.8),graphite,p)
            for z in [-d*.3,0,d*.3]:
                beam('handrail-post',(x,y+2,z),(x,y+10,z),.7,metal,p)
    # A ruptured instrument canopy leans over the terraces, with separated ends.
    for z in [-21,7,28]:
        arc('damaged-roof-ring',39,5,7,.18,2.42,stone,p,center=(0,37,z),segments=22)
        arc('roof-repair-rib',33,1.2,4,.25,2.65,metal,p,center=(0,37,z),segments=22)
    # Unequal solid wall bays and broken upper edges vary the arched silhouette.
    for x,y,z,h in [(-58,-7,24,25),(36,-42,40,32),(-35,27,27,20)]:
        wedge('broken-gallery-wall-bay',x,y,z,28,h,8,stone,p)
        box('wall-mortar-joint',(x,y+h*.4,z+4.4),(27,.8,1),graphite,p)
        beam('attached-wall-repair',(x-12,y+3,z+5),(x+9,y+h-3,z+5),1.4,metal,p)
    for x in [-40,39]:
        beam('roof-foot-brace',(x,27,-28),(x*.73,61,-28),3,graphite,p)
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

terrace();gallery();pier();lens();vault();instrument();instrument('event_stretched',2.65);instrument('event_fragmented',2.1,True);rib()
for ob in bpy.data.objects:
    if ob.type=='MESH':
        # Applied single-segment bevels catch grazing light on real stone and
        # repair edges. Retain broad facets and the fractured silhouette.
        bpy.context.view_layer.objects.active=ob
        mod=ob.modifiers.new('Stone and metal edge wear','BEVEL');mod.width=.24;mod.segments=1
        mod.limit_method='ANGLE';mod.angle_limit=.55
        bpy.ops.object.modifier_apply(modifier=mod.name)
        for poly in ob.data.polygons:poly.use_smooth=False
bpy.context.scene['provenance']='Authored from selected built-in imagegen scene umbra-scene-reference.png. Generator seed 1029. No third-party assets.'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
OUT.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',export_yup=True,export_apply=True,export_animations=False)
print('UMBRA_EXPORT',OUT,OUT.stat().st_size)
