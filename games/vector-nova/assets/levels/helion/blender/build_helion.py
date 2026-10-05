"""Original Helion assets modeled from retained generated scene. CPU CLI only.
Run: Blender --background --python assets/levels/helion/blender/build_helion.py
No render/bake is performed. Exports named asset roots at origin; saves an exploded editable scene.
"""
import bpy, bmesh, math, os, json
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from collections import defaultdict
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..'))
EXPORT = os.path.join(ROOT, 'public/assets/levels/helion/thermal-observatory.glb')
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for block in bpy.data.materials: bpy.data.materials.remove(block)

def mat(name, color, metal=0, rough=.55, emission=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    if emission: p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=emission
    return m
M={
 'tile':mat('Ceramic / thick chalk thermal mantle',(.78,.76,.65),.12,.64),
 'carbon':mat('Graphite / curved shield cassette',(.047,.057,.066),.38,.53),
 'copper':mat('Copper / feather laminations',(.56,.23,.075),.72,.38),
 'edge':mat('Titanium / cool expansion joints',(.29,.34,.36),.65,.43),
 'glass':mat('Smoked instrument glass',(.035,.095,.10),.72,.23),
 'service':mat('Amber / inhabited service light',(.7,.26,.055),.05,.45,1.5),
 'plasma':mat('Plasma / modeled coral filament',(.86,.11,.012),.0,.8,2.2),
 'billow':mat('Plasma / red turbulent billow',(.7,.025,.003),0,.8,1.7),
 'core':mat('Plasma / luminous core ribbons',(1,.37,.055),0,.8,3),
}
assets=[]; root=None

def asset(name):
    global root
    root=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(root); assets.append(root); return root

def mesh(name, verts, faces, material):
    d=bpy.data.meshes.new(name); d.from_pydata(verts,[],faces); d.materials.append(M[material]); d.update()
    o=bpy.data.objects.new(name,d); bpy.context.collection.objects.link(o); o.parent=root; return o

def box(name,loc,scale,material,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.name=name; o.dimensions=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(M[material]); o.parent=root
    if bevel:
        mod=o.modifiers.new('Manufactured edge thickness','BEVEL'); mod.width=bevel; mod.segments=1
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def beam(name,a,b,radius,material,vertices=8):
    a,b=Vector(a),Vector(b); d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=d.length,location=(a+b)/2)
    o=bpy.context.object; o.name=name; o.rotation_euler=d.to_track_quat('Z','Y').to_euler(); o.data.materials.append(M[material]); o.parent=root; return o

def ring(name,z,radius,thick,material):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius,minor_radius=thick,major_segments=32,minor_segments=6,location=(0,0,z)); o=bpy.context.object; o.name=name; o.data.materials.append(M[material]); o.parent=root

def tapered(name,a,b,width0,width1,thickness,material,bevel=0):
    a,b=Vector(a),Vector(b);axis=(b-a).normalized();side=Vector((axis.z,0,-axis.x)).normalized()
    if bevel:
        bevel=abs(bevel);v=[]
        # A seated face chamfer needs only three rings, rather than all cube
        # corners. Two-sided cassettes retain their actual thickness.
        for depth,inset in [(-thickness/2,0),(thickness/2-bevel,0),(thickness/2,bevel)]:
            for p,w in [(a+axis*inset,width0-inset*2),(b-axis*inset,width1-inset*2)]:
                for sign in [-1,1]:v.append(tuple(p+side*(sign*w/2)+Vector((0,depth,0))))
        faces=[(0,1,3,2),(8,9,11,10)]
        order=[0,1,3,2]
        for ring in [0,4]:
            for j in range(4):
                x=order[j]+ring;y=order[(j+1)%4]+ring
                faces.append((x,y,y+4,x+4))
    else:
        depth=Vector((0,thickness/2,0))
        v=[tuple(p+s*side*w/2+d*depth) for p,w in [(a,width0),(b,width1)] for d in [-1,1] for s in [-1,1]]
        faces=[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)]
    o=mesh(name,v,faces,material)
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
    return o

def merge_asset(target):
    groups=defaultdict(list)
    for o in list(target.children):
        if o.type=='MESH': groups[o.data.materials[0].name].append(o)
    for key,objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]; bpy.ops.object.join(); bpy.context.object.name=target.name+' / '+key

asset('Sunshield')
# Thick stepped curved surface, with macro seams and individually beveled cassettes.
for ix in range(9):
    x=(ix-4)*18
    y=11*(x/80)**2
    for iz in range(5):
        z=iz*23+12
        o=box('Curved shield cassette',(x,y,z),(17.3,5.6,22.1),'carbon',.65); o.rotation_euler[2]=-.23*x/80
        # Recessed thermal cassettes, corner lugs, axial service channel.
        for dx in [-6.8,6.8]:
            for dz in [-8.6,8.6]:
                box('Recessed cassette lug',(x+dx,y-3.1,z+dz),(1.7,.55,2.5),'edge',.12)
                beam('Cassette socket',(x+dx,y-3.5,z+dz),(x+dx,y-3.9,z+dz),.34,'carbon',8)
        box('Cassette lower reveal',(x,y-3.04,z-8.1),(10.8,.2,1.1),'edge',.08)
        box('Recessed replacement mantle',(x,y-3.13,z+1.0),(12.4,.15,12.6),'carbon',.2)
        for groove in [-4,0,4]:
            box('Shield thermal channel',(x+groove,y-3.32,z+1),(0.25,.25,10.8),'edge',.06)
    beam('Copper load spine',(x,y+4,-9),(x,y+4,125),1.9,'copper')
    box('Thermal blanket at root',(x,y,0),(17,13,18),'tile',1.0)
    for dx in [-6,6]:
        beam('Root flexible heat coupling',(x+dx,y-7,-7),(x+dx,y-8,10),.5,'copper')
    for zclip in [8,44,80,115]:
        box('Spine expansion clamp',(x,y-4.1,zclip),(5.6,2.5,4),'edge',.25)
        box('Spine copper inspection face',(x,y-5.5,zclip),(3.8,.35,2.6),'copper',.15)
    beam('Shield outrigger',(x,y+5,90),(x,y+43,-23),2.7,'carbon')
    beam('Lower anchor tie',(x,y+3,3),(x,y+43,-23),1.8,'edge')
    box('Shield pier foot',(x,y+43,-24),(16,18,7),'tile',1)
    if ix%2==0:box('Warm service aperture',(x,y-3,9),(9,.7,1.5),'service',.1)
for z in [24,70,116]:box('Shield cross spine',(0,15,z),(163,3,2),'copper')
merge_asset(root)

asset('RadiatorFan')
beam('Fan root stalk',(0,0,-38),(0,0,10),5,'carbon',12)
for z in [-32,-8,10]: ring('Stalk coupling',z,5.1,1.1,'edge')
beam('Hinge axle',(-10,0,8),(10,0,8),5,'edge',12)
for side in [-1,1]:
    for i in range(7):
        angle=side*(.22+i*.13); length=88-i*3
        a=(side*2,-i*.8,10+i*1.0); b=(math.sin(angle)*length, -i*.8,10+math.cos(angle)*length)
        direction=Vector(b)-Vector(a); sidevec=Vector((direction.z,0,-direction.x)).normalized()
        # Replace the broad paddle with individually seated heat cassettes.
        for panel in range(8):
            t0=panel/8+.005;t1=(panel+1)/8-.005
            pa=Vector(a)+direction*t0;pb=Vector(a)+direction*t1
            tapered('Radiator recessed graphite gasket',pa,pb,18-11*t0,18-11*t1,1.3,'carbon')
            for face in [-1,1]:
                front=Vector((0,face*.88,0));along=direction.normalized()
                tapered('Stepped bevelled copper cassette',pa+along*.6+front,pb-along*.6+front,16.5-11*t0,16.5-11*t1,.62,'copper',.25)
                beam('Cassette recessed flow channel',pa+along*1.8+front*1.36,pb-along*1.8+front*1.36,.24,'carbon',4)
                for end in [pa+along*.9]:
                    beam('Cassette attached channel shoe',end+front*1.4-sidevec*1.1,end+front*1.4+sidevec*1.1,.28,'edge',4)
            half=(18-11*t0)*.5
            beam('Cassette transverse expansion seam',pa-sidevec*half+Vector((0,-.9,0)),pa+sidevec*half+Vector((0,-.9,0)),.33,'carbon',6)
        for edge in [-1,1]:
            ea=Vector(a)+sidevec*edge*9+Vector((0,-.85,0));eb=Vector(b)+sidevec*edge*3.5+Vector((0,-.85,0))
            beam('Radiator titanium perimeter frame',ea,eb,.42,'edge',8)
        beam('Blade hydraulic pivot',Vector(a)+Vector((0,-2,-4)),Vector(a)+direction*.18+Vector((0,-2,0)),1.05,'carbon',10)
        beam('Blade polished actuator piston',Vector(a)+direction*.13+Vector((0,-2,0)),Vector(a)+direction*.35+Vector((0,-2,0)),.62,'edge',10)
        for rib in range(1,9):
            t=rib/10; x=a[0]+(b[0]-a[0])*t; z=a[2]+(b[2]-a[2])*t
            sidevec=Vector((b[2]-a[2],0,-(b[0]-a[0]))).normalized()
            half=(18*(1-t)+7*t)*.44
            beam('Blade lamination fold',(x-sidevec.x*half,-i*.8-.85,z-sidevec.z*half),(x+sidevec.x*half,-i*.8-.85,z+sidevec.z*half),.16,'edge',6)
        beam('Feather inset heat vein',(a[0],-i*.8-1.0,a[2]),(b[0],-i*.8-1.0,b[2]),.3,'edge',8)
        beam('Feather cooling tube',a,b,.58,'carbon')
        for t in [.34,.64,.85]:
            x=a[0]+(b[0]-a[0])*t; z=a[2]+(b[2]-a[2])*t
            box('Feather expansion clip',(x,-i*.8-1.2,z),(7,.8,.8),'edge')
box('Radiator hinge insulated manifold',(0,0,-22),(19,13,13),'tile',.8)
for y in [-6.6,6.6]:
    box('Recessed hinge service panel',(0,y,-22),(12,.45,8),'carbon',.3)
    for x in [-5,5]:box('Manifold access latch',(x,y*1.04,-22),(.8,.65,3),'edge',.1)
for side in [-1,1]:
    beam('Outer hinge bearing',(side*9,0,8),(side*13,0,8),6.1,'carbon',16)
    beam('Bearing polished end plate',(side*13,0,8),(side*13.8,0,8),5.8,'edge',16)
    for bolt in range(8):
        theta=bolt*math.tau/8
        beam('Hinge retained fastener',(side*13.8,math.cos(theta)*4.5,8+math.sin(theta)*4.5),(side*14.25,math.cos(theta)*4.5,8+math.sin(theta)*4.5),.38,'copper',8)
    beam('Articulated fan lift sleeve',(side*9,-4,-20),(side*18,-4,5),2.0,'carbon',10)
    beam('Fan exposed lift piston',(side*16,-4,0),(side*29,-4,35),1.0,'edge',10)
    beam('Fan insulated transfer main',(side*6,4,-25),(side*24,4,28),1.15,'tile',10)
    for z in [-10,2,14]:
        x=side*(6+(z+25)*18/53)
        beam('Fan copper flexible coupling',(x,3.8,z-1),(x,3.8,z+1),1.4,'copper',10)
    beam('Jointed load arm',(0,0,-10),(side*34,0,43),1.7,'carbon')
    beam('Branch hinge',(side*20,-3,28),(side*20,3,28),3.1,'edge')
merge_asset(root)

asset('JumpCanopy')
# Open-front overlapping cantilever slabs: the gameplay aperture is genuinely empty.
for side in [-1,1]:
    for i in range(6):
        x=side*(3.9+i*3.9)
        o=box('Split thermal roof slab',(x,0,2+abs(x)*.12),(4.8,76-abs(x)*.55,3.2),'carbon',.55);o.rotation_euler[1]=side*-.115
        beam('Roof copper conduit',(x,-35,4+abs(x)*.12),(x,35,4+abs(x)*.12),.55,'copper')
for y in [-30,30]:
    box('Roof underside girder',(0,y,-.5),(53,1.4,1.25),'edge',.2)
    for side in [-1,1]:
        box('Shelter service light',(side*17,y,-1.4),(5,.65,.3),'service')
        beam('Open shelter diagonal',(side*26,y,-1),(side*13,y+12,-2.3),.52,'carbon')
for side in [-1,1]:
    beam('Canopy continuous service spine',(side*25,-36,-1.5),(side*25,36,-1.5),1.1,'copper')
    for y in [-22,-8,8,22]:
        box('Canopy service access hatch',(side*12,y,-2),(8,9,.28),'carbon',.22)
        for dx in [-3.4,3.4]:box('Hatch hinge',(side*12+dx,y,-2.25),(.5,5,.35),'edge',.1)
merge_asset(root)

asset('InstrumentTower')
beam('Central ceramic mast',(0,0,-42),(0,0,138),9,'tile',16)
for z in [-36,-6,23,52,85,112]:
    ring('Stacked structural collar',z,10.4,1.7,'carbon')
    ring('Copper annular exchanger',z+3,12,1.3,'copper')
# Larger inhabited control gallery, visible segmented glazing and sun visor.
for i in range(16):
    a=i*math.tau/16; x,y=math.cos(a)*17,math.sin(a)*17
    o=box('Gallery glazing',(x,y,63),(6.0,1.1,12),'glass');o.rotation_euler[2]=a+math.pi/2
    beam('Gallery mullion',(x,y,56),(x,y,70),.55,'tile')
for z in [55,72]:ring('Gallery layered visor',z,17.5,2.5,'tile')
for i in range(4):
    a=i*math.pi/2+.3; x,y=math.cos(a)*27,math.sin(a)*27
    beam('Sensor articulated arm',(0,0,99),(x,y,109),2,'carbon')
    beam('Sensor elevation joint',(x,y,105),(x,y,119),2.2,'copper')
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=6,location=(x,y,121));o=bpy.context.object;o.scale=(1,1,.45);o.data.materials.append(M['edge']);o.parent=root
for i in range(4):
    a=i*math.pi/2+.7; x,y=math.cos(a)*20,math.sin(a)*20
    beam('Tower primary truss',(x,y,-44),(x,y,51),2.1,'carbon')
    for z in [-36,-8,20]:beam('Tower diagonal',(x,y,z),(math.cos(a+math.pi/2)*20,math.sin(a+math.pi/2)*20,z+25),1.0,'edge')
ring('Access deck',-5,23,2,'tile');ring('Inhabited service light',56,17.4,.5,'service')
beam('Needle antenna',(0,0,138),(0,0,174),.7,'edge');merge_asset(root)

asset('ServiceGantry')
# Source-linked working service bay: layered deck, insulated manifolds, real
# exchanger fins, recessed control gallery and stair access to the lower keel.
box('Service terrace structural raft',(0,0,-2),(32,23,3),'carbon',.5)
box('Pale stepped access ledge',(0,-1,.1),(29,21,1.4),'tile',.32)
for x in [-13,13]:
    beam('Service bundled longitudinal keel',(x,-12,-7),(x,12,-7),1.25,'carbon')
    for y in [-9,0,9]:
        beam('Service angular deck shoe',(x,y,-7),(x,y,-1),.65,'edge')
for y in [-9,9]:
    beam('Service open lower diagonal',(-13,y,-7),(13,y,-2),.75,'copper')
    beam('Service lower cross beam',(-14,y,-7),(14,y,-7),.75,'carbon')
for x in [-11.5,-8.5]:
    beam('Insulated pale transfer main',(x,-10,2),(x,10,2),.95,'tile',10)
    for y in [-8,-2,4,9]:
        beam('Copper transfer expansion collar',(x,y-.35,2),(x,y+.35,2),1.15,'copper',10)
for x in [-4,3]:
    box('Graphite heat exchanger housing',(x,4,3.8),(5.8,8,6.8),'carbon',.35)
    for blade in range(7):
        box('Formed copper exchanger fin',(x-2.55+blade*.85,4,4.1),(.32,7.6,5.7),'copper',.09)
    box('Exchanger insulated cap',(x,4,7.5),(6.6,9,.7),'tile',.2)
box('Control gallery recessed shell',(8,1,5.1),(9.5,13,8.4),'carbon',.5)
box('Control bay broad sun visor',(8,1,9.9),(11.8,15.3,1.2),'tile',.35)
for y in [-4.6,-.5,3.6]:
    box('Recessed blue control glazing',(12.85,y,6.1),(.35,3.2,4.8),'glass',.12)
    box('Gallery mullion',(13.15,y-1.75,6.2),(.6,.35,5.8),'edge',.08)
    box('Control warm interior aperture',(13.17,y,4),(.3,2.1,.5),'service',.06)
for y in [-3,3]:
    box('Service panel recessed cabinet',(-3.8,y,2),(4.2,2.6,2.6),'edge',.15)
    box('Cabinet dark inset',(-3.8,y-1.36,2),(3.4,.18,1.9),'carbon',.08)
    for x in [-5,-2.6]:box('Cabinet service latch',(x,y-1.5,2),(.22,.3,.7),'copper',.05)
for x in [-14,14]:
    beam('Maintenance balustrade',(x,-10,3),(x,10,3),.18,'edge',6)
    for y in [-10,-3,4,10]:beam('Maintenance guard stanchion',(x,y,.8),(x,y,3),.2,'copper',6)
for step in range(10):
    box('Lower service stair tread',(-6,-10-step*.65,-.4-step*.7),(4.2,.8,.24),'tile',.08)
for x in [-8.3,-3.7]:
    beam('Stair folded support',(x,-10,-1),(x,-16,-8.2),.3,'carbon',6)
    beam('Stair handrail',(x,-10,2),(x,-16,-4.8),.16,'edge',6)
merge_asset(root)

# Genuine broad, twisting plasma sheets. The two path families have different silhouettes.
def ribbon(name, points, width, material, seed=0):
    verts=[]
    for i,p in enumerate(points):
        p=Vector(p); prev=Vector(points[max(0,i-1)]); nex=Vector(points[min(len(points)-1,i+1)])
        d=(nex-prev).normalized(); side=Vector((d.z,.12*math.sin(i*.51+seed),-d.x)).normalized()
        taper=math.sin(math.pi*(.05+.9*i/(len(points)-1)))**.7
        for j in range(5):
            k=(j/4-.5)*2
            wiggle=1+.17*math.sin(i*.7+j*2+seed)+.09*math.sin(i*1.83+j)
            v=p+side*(k*width*taper*wiggle);v.y+=math.sin(i*.41+seed+j*.8)*width*.31
            verts.append(tuple(v))
    faces=[]
    for i in range(len(points)-1):
        for j in range(4):a=i*5+j;faces.append((a,a+1,a+6,a+5))
    o=mesh(name,verts,faces,material)
    colors=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER');o.data.color_attributes.active_color=colors
    for li,loop in enumerate(o.data.loops):
        i,j=divmod(loop.vertex_index,5)
        edge=math.sin(math.pi*j/4)**.65*math.sin(math.pi*(.015+.97*i/(len(points)-1)))**.55
        colors.data[li].color=(edge,edge,edge,1)
    solid=o.modifiers.new('Plasma sheet depth','SOLIDIFY');solid.thickness=width*.075;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=solid.name)
    for poly in o.data.polygons:poly.use_smooth=True

def filament(name, points, radius, material, phase):
    verts=[]; faces=[]; sides=7
    for i,p in enumerate(points):
        p=Vector(p); d=(Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])).normalized()
        u=d.cross(Vector((0,1,0))).normalized(); v=d.cross(u).normalized()
        r=radius*(.55+.45*math.sin(math.pi*i/(len(points)-1)))*(.85+.15*math.sin(i*.7+phase))
        for j in range(sides):
            a=j*math.tau/sides
            verts.append(tuple(p+u*(r*math.cos(a))+v*(r*math.sin(a))))
        if i:
            for j in range(sides):
                a=(i-1)*sides+j; b=(i-1)*sides+(j+1)%sides
                faces.append((a,b,b+sides,a+sides))
    o=mesh(name,verts,faces,material)
    for poly in o.data.polygons:poly.use_smooth=True

def plasma_pocket(name,p,d,radius,phase):
    direction=Vector(d).normalized();point=Vector(p)
    pockets=json.loads(root.get('helionDensityPockets','[]'))
    pockets.append({'p':[point.x,point.z,-point.y],'d':[direction.x,direction.z,-direction.y],'r':radius,'phase':phase})
    root['helionDensityPockets']=json.dumps(pockets,separators=(',',':'))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=radius,location=p)
    o=bpy.context.object;o.name=name;o.parent=root;o.data.materials.append(M['billow'])
    o.rotation_euler=Vector(d).to_track_quat('Z','Y').to_euler()
    o.scale=(.75+.25*math.sin(phase),.7,1.65+.35*math.cos(phase))
    for v in o.data.vertices:
        v.co*=1+.14*math.sin(v.co.x*.21+phase)*math.sin(v.co.z*.16-phase)
    for poly in o.data.polygons:poly.use_smooth=True

asset('ProminenceCrown')
for branch in range(6):
    pts=[]
    for i in range(70):
        t=i/69; angle=t*3.5-.8
        x=math.sin(angle+math.sin(t*8+branch*.8)*.09)*(190+branch*23)+t*(80+branch*26)
        z=math.sin(t*math.pi*.86)*(580-branch*58)+math.sin(t*13+branch)*20*math.sin(t*math.pi)
        pts.append((x,branch*10+math.sin(t*11+branch)*12,z))
    ribbon('Irregular diffuse rising veil',pts,34+branch*5.1,'plasma',branch)
    for strand in range(1):
        curled=[(x+math.sin(i*.19+strand)*13,y+math.cos(i*.23+strand)*9,z+math.sin(i*.21+strand)*12) for i,(x,y,z) in enumerate(pts)]
        filament('Crown threaded magnetic rope',curled,1.15,'core',branch+strand)
    for j in [12,18,24,30,36,42,48,54,60]:
        plasma_pocket('Crown turbulent red pocket',pts[j],Vector(pts[j+1])-Vector(pts[j-1]),38+15*math.sin(j+branch),branch+j)
    for wisp in range(3):
        start=10+(branch*7+wisp*11)%27
        fragment=[(x+math.sin(i*.37+wisp)*26,y+22*math.cos(i*.4+branch),z+18*math.sin(i*.3+branch)) for i,(x,y,z) in enumerate(pts[start:start+24])]
        filament('Crown broken fine wisp',fragment,.55+wisp*.2,'core',wisp+branch)
    if branch in [0,3]:filament('Crown sparse hot filament',pts,.8,'core',branch+.4)
merge_asset(root)
asset('ProminenceRibbon')
for branch in range(5):
    pts=[]
    for i in range(90):
        t=i/89; x=-440+t*880; z=(math.sin(t*math.pi)**(.6+branch*.09))*(155+branch*14+(85-branch*8)*math.sin(t*math.pi*(2.6+branch*.16)+branch*.22)**2)+math.sin(t*17+branch)*18*math.sin(t*math.pi)
        pts.append((x,branch*11+28*math.sin(t*math.pi*2+branch*.4),z))
    ribbon('Diffuse torn double crest',pts,36+branch*5,'plasma',branch)
    for strand in range(1):
        curled=[(x+math.sin(i*.21+strand)*12,y+math.cos(i*.2+strand)*10,z+math.sin(i*.15+strand)*15) for i,(x,y,z) in enumerate(pts)]
        filament('Ribbon twisted returning strand',curled,1.1,'core',branch+strand)
    for j in [12,20,28,36,44,52,60,68,76]:
        plasma_pocket('Ribbon irregular dense pocket',pts[j],Vector(pts[j+1])-Vector(pts[j-1]),35+14*math.sin(j+branch),branch+j)
    for wisp in range(3):
        start=10+(branch*9+wisp*13)%38
        fragment=[(x+math.sin(i*.29+wisp)*21,y+25*math.cos(i*.31+branch),z+23*math.sin(i*.34+branch)) for i,(x,y,z) in enumerate(pts[start:start+26])]
        filament('Ribbon dissolving fine wisp',fragment,.5+wisp*.17,'core',wisp+branch)
    if branch in [0,3]:filament('Ribbon sparse hot filament',pts,.75,'core',branch+.7)
merge_asset(root)

# Project-authored CPU contact shade, based on the same local BVH approach used
# by the project's observatory kit. Bake each metal assembly independently;
# plasma remains translucent authored radiance rather than shaded architecture.
for assembly in assets:
    if assembly.name.startswith('Prominence'):continue
    objects=[o for o in assembly.children_recursive if o.type=='MESH']
    vertices=[];faces=[]
    for o in objects:
        offset=len(vertices);vertices.extend(o.matrix_world@v.co for v in o.data.vertices)
        faces.extend(tuple(offset+i for i in poly.vertices) for poly in o.data.polygons)
    tree=BVHTree.FromPolygons(vertices,faces,all_triangles=False)
    for o in objects:
        colors=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
        o.data.color_attributes.active_color=colors;cache={}
        for poly in o.data.polygons:
            n=(o.matrix_world.to_3x3()@poly.normal).normalized()
            tangent=n.cross(Vector((0,0,1)) if abs(n.z)<.9 else Vector((0,1,0))).normalized();bitangent=n.cross(tangent)
            for li in poly.loop_indices:
                v=o.matrix_world@o.data.vertices[o.data.loops[li].vertex_index].co
                key=tuple(round(c,3) for c in (*v,*n))
                if key not in cache:
                    origin=v+n*.09;occlusion=0
                    for ray in range(6):
                        theta=(ray+.5)*math.tau/6
                        direction=(n*.64+tangent*math.cos(theta)*.77+bitangent*math.sin(theta)*.77).normalized()
                        hit=tree.ray_cast(origin,direction,5.5)
                        if hit[0] is not None:occlusion+=1-hit[3]/7.5
                    cache[key]=max(.43,1-occlusion/6*.7)
                shade=cache[key];colors.data[li].color=(shade,shade,shade,1)
    print('HELION_CPU_CONTACT_SHADE',assembly.name,len(vertices))

# All plasma meshes expose the same boundary attribute to the local shader.
for assembly in assets:
    if not assembly.name.startswith('Prominence'):continue
    for o in assembly.children_recursive:
        if o.type!='MESH' or o.data.color_attributes:continue
        colors=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER');o.data.color_attributes.active_color=colors
        for color in colors.data:color.color=(1,1,1,1)

# Blender file retains the selected scene as a modeling reference image empty.
os.makedirs(os.path.dirname(EXPORT),exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=EXPORT,export_format='GLB',export_yup=True,export_apply=True,export_animations=False,export_extras=True)
for i,o in enumerate(assets):o.location.x=(i%3)*430;o.location.y=(i//3)*900
refpath=os.path.join(ROOT,'assets/levels/helion/reference/thermal-observatory-scene.png')
if os.path.exists(refpath):
    ref=bpy.data.objects.new('Selected scene reference — generated image',None);bpy.context.collection.objects.link(ref);ref.empty_display_type='IMAGE';ref.data=bpy.data.images.load(refpath);ref.data.filepath='//../reference/thermal-observatory-scene.png';ref.empty_display_size=950;ref.location=(-400,600,300);ref.rotation_euler=(math.pi/2,0,0)
bpy.context.scene.render.engine='CYCLES';bpy.context.scene.cycles.device='CPU'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'assets/levels/helion/blender/thermal-observatory.blend'))
print('HELION_EXPORT',EXPORT)
print('HELION_MESHES',sum(o.type=='MESH' for o in bpy.data.objects))
print('HELION_TRIANGLES',sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=='MESH'))
