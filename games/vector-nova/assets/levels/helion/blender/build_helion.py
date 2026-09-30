"""Original Helion assets modeled from retained generated scene. CPU CLI only.
Run: Blender --background --python assets/levels/helion/blender/build_helion.py
No render/bake is performed. Exports named asset roots at origin; saves an exploded editable scene.
"""
import bpy, math, os
from mathutils import Vector
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

def tapered(name,a,b,width0,width1,thickness,material):
    a,b=Vector(a),Vector(b); up=(b-a).normalized(); side=Vector((up.z,0,-up.x)).normalized(); depth=Vector((0,thickness/2,0))
    v=[tuple(p+s*side*w/2+d*depth) for p,w in [(a,width0),(b,width1)] for d in [-1,1] for s in [-1,1]]
    return mesh(name,v,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],material)

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
    beam('Copper load spine',(x,y+4,-9),(x,y+4,125),1.9,'copper')
    box('Thermal blanket at root',(x,y,0),(17,13,18),'tile',1.0)
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
        tapered('Overlapping tapered feather',a,b,12,4,1.3,'copper')
        beam('Feather cooling tube',a,b,.58,'carbon')
        for t in [.34,.64,.85]:
            x=a[0]+(b[0]-a[0])*t; z=a[2]+(b[2]-a[2])*t
            box('Feather expansion clip',(x,-i*.8-1.2,z),(7,.8,.8),'edge')
for side in [-1,1]:
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
for y in [-26,0,26]:
    box('Roof underside girder',(0,y,-.5),(53,2.6,2.4),'edge',.2)
    for side in [-1,1]:box('Shelter service light',(side*17,y,-1.9),(8,1,.4),'service')
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
    solid=o.modifiers.new('Plasma sheet depth','SOLIDIFY');solid.thickness=width*.075;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=solid.name)
    for poly in o.data.polygons:poly.use_smooth=True

asset('ProminenceCrown')
for branch in range(6):
    pts=[]
    for i in range(70):
        t=i/69; angle=t*3.5-.8
        x=math.sin(angle)*(190+branch*13)+t*110
        z=math.sin(t*math.pi*.86)*(580-branch*26)
        pts.append((x,branch*10+math.sin(t*11+branch)*12,z))
    ribbon('Hooked rising tongue',pts,20+branch*2,'plasma',branch)
    if branch%2==0:ribbon('Crown glowing core',pts,5.7,'core',branch+.4)
merge_asset(root)
asset('ProminenceRibbon')
for branch in range(5):
    pts=[]
    for i in range(90):
        t=i/89; x=-440+t*880; z=(math.sin(t*math.pi)**.7)*(170+100*math.sin(t*math.pi*3)**2)+branch*13
        pts.append((x,branch*11+28*math.sin(t*math.pi*2+branch*.4),z))
    ribbon('Broad double crest',pts,17+branch*2.8,'plasma',branch)
    if branch%2==0:ribbon('Ribbon luminous core',pts,5,'core',branch+.7)
merge_asset(root)

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
