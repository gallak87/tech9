"""Original Cindercoil hero kit, reproducible Blender 4+ CPU geometry/export.
Reference: reference/cindercoil-scene-v1.png. No external mesh/texture inputs.
Run Blender --background --python assets/levels/cindercoil/build_cindercoil.py.
All authored dimensions are metres in the game's Y-up coordinates.
"""
import bpy, math, random, json, pathlib
from mathutils import Vector
R = random.Random(61129)
ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT.parents[2] / 'public/assets/levels/cindercoil'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, roughness=.85, emission=None, strength=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=roughness
    if emission:
        p.inputs['Emission Color'].default_value=(*emission,1); p.inputs['Emission Strength'].default_value=strength
    return m
M={
 'basalt':material('Basalt / cold cut planes',(.10,.125,.16)),
 'ash':material('Ash / silver cooling strata',(.29,.32,.36)),
 'dark':material('Blackglass / folded crust',(.033,.043,.06),.54),
 'warm':material('Scoria / oxidized interior',(.22,.105,.07)),
 'lava':material('Lava / golden interior',(.7,.12,.013),.45,(1,.22,.02),1.8),
 'core':material('Lava / pale narrow hot cores',(1,.4,.035),.5,(1,.35,.018),2.1),
 'edge':material('Lava / cooling red margins',(.29,.032,.012),.8,(.55,.05,.004),.6),
 'ivory':material('Ceramic / warm ivory',(.72,.70,.61),.69),
 'charcoal':material('Ceramic / charcoal heat shields',(.095,.105,.12),.68),
 'oxide':material('Ceramic / oxide-red cassettes',(.32,.084,.054),.8),
}
modules={}

def group(name):
    g=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(g); modules[name]=g; return g

def mesh(name, verts, faces, mat, parent, smooth=False):
    me=bpy.data.meshes.new(name); me.from_pydata([(x,-z,y) for x,y,z in verts],[],faces); me.update()
    ob=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(ob); ob.data.materials.append(M[mat]); ob.parent=parent
    if smooth:
        for p in me.polygons:p.use_smooth=True
    return ob

def rock(parent,name,x,y,z,rx,ry,rz,mat='basalt',sides=7,rings=4):
    phase=R.random()*6.28; verts=[]
    wobble=[R.uniform(.82,1.18) for _ in range(sides)]
    for j in range(rings):
        v=j/(rings-1); scale=1 if j not in (0,rings-1) else .77
        for k in range(sides):
            a=phase+k*math.tau/sides; n=wobble[k]*(1+R.uniform(-.055,.055))
            verts.append((x+math.cos(a)*rx*n*scale,y+v*ry+R.uniform(-.045,.045)*ry,z+math.sin(a)*rz*n*scale))
    faces=[tuple(range(sides-1,-1,-1))]
    for j in range(rings-1):
        for k in range(sides):
            a=j*sides+k;b=j*sides+(k+1)%sides;faces.append((a,b,b+sides,a+sides))
    faces.append(tuple((rings-1)*sides+k for k in range(sides)))
    return mesh(name,verts,[tuple(reversed(face)) for face in faces],mat,parent)

def box(parent,name,p,size,mat,tilt=0):
    x,y,z=p;sx,sy,sz=[q/2 for q in size];verts=[]
    for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
        yy=b*sy;zz=c*sz;verts.append((x+a*sx,y+math.cos(tilt)*yy-math.sin(tilt)*zz,z+math.sin(tilt)*yy+math.cos(tilt)*zz))
    return mesh(name,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],mat,parent)

def tube(parent,name,points,radii,mat,sides=9):
    verts=[]
    for j,p in enumerate(points):
        tangent=Vector(points[min(len(points)-1,j+1)])-Vector(points[max(0,j-1)]);tangent.normalize()
        ref=Vector((1,0,0)); side=ref-tangent*ref.dot(tangent);side.normalize();up=tangent.cross(side).normalized()
        rx,rz=radii[j]
        for k in range(sides):
            a=k*math.tau/sides;d=side*math.cos(a)*rx+up*math.sin(a)*rz;verts.append(tuple(Vector(p)+d))
    faces=[]
    for j in range(len(points)-1):
        for k in range(sides):
            a=j*sides+k;b=j*sides+(k+1)%sides;faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(range(sides-1,-1,-1)),tuple((len(points)-1)*sides+k for k in range(sides))])
    return mesh(name,verts,faces,mat,parent,True)

# Broad basalt buttresses have actual stepped depth, cold shadow faces and offset strata.
wall=group('rupture_wall')
for i in range(30):
    x=(i-14.5)*15; height=235+34*math.sin(i*.37)+R.uniform(-18,25)
    rock(wall,'layered_caldera_column',x,-18,-17+R.uniform(-14,5),14,height,31,'basalt',6,5)
    for k in range(3):
        rock(wall,'cooling_ledge',x,-18+height*(.24+k*.25),10,16,5,25,'ash' if k==2 else 'dark',6,2)
for sign in (-1,1):
    g=group('rupture_left' if sign<0 else 'rupture_right')
    for i in range(9):
        y=24+i*27;x=sign*(28+math.sin(i*.7)*8)
        rock(g,'detached_fault_face',x,y,28,30,35,21,'basalt',6,3)
        rock(g,'warm_fault_interior',x-sign*20,y+2,35,9,28,10,'warm',6,2)
# Three closed-volume falls; the lateral streams originate in upper shelves and end in plunge lobes.
for n,(x,h) in enumerate([(-105,250),(0,270),(103,229)]):
    g=group('cascade_'+str(n)); points=[];radii=[]
    for j in range(31):
        t=j/30;points.append((x+math.sin(t*9+n)*5,h*(1-t)+3,28+55*t*t+6*math.sin(t*5)))
        radii.append((15+5*math.sin(t*13+n)**2,7+4*t))
    tube(g,'thick_molten_channel',points,radii,'lava',12)
    for k in range(5):
        offsets=(k-2)*5.5
        ps=[(p[0]+offsets+1.4*math.sin(j*.53+k),p[1],p[2]+7+math.sin(j*.46+k)) for j,p in enumerate(points)]
        tube(g,'ropy_hot_strand',ps,[(1.4+1.2*math.sin(j*.34+k)**2,1.2) for j in range(31)],'core' if k%2 else 'edge',7)
    for sign in (-1,1):
        ps=[(p[0]+sign*(15+3*math.sin(j*.4)),p[1],p[2]+1) for j,p in enumerate(points)]
        tube(g,'cooled_channel_lip',ps,[(3.8,3) for _ in ps],'dark',7)
    rock(g,'plunge_lobe',x,-3,87,31,9,27,'lava',16,3)
    for i in range(7):
        rock(g,'splash_crust',x+R.uniform(-26,26),3,80+R.uniform(-13,23),R.uniform(3,8),4,R.uniform(3,8),'dark',6,2)
# A thick reusable layered crust plate with coiled ropes and hot edge shelf.
g=group('crust_raft')
rock(g,'raft_molten_undercut',0,-3,0,25,5,20,'edge',15,2)
rock(g,'raft_cooled_slab',0,0,0,24,4,19,'dark',15,3)
for i in range(7):
    radius=3+i*2.9;ps=[]
    for j in range(37):
        a=j*math.tau/36;ps.append((math.cos(a)*radius,4+math.sin(a*3+i)*.4,math.sin(a)*radius*.73))
    tube(g,'roped_pahoehoe',ps,[(.8,.65) for _ in ps],'basalt',5)
# The coil anchor is a hollow volcanic chimney, keeping its centre genuinely open.
g=group('hollow_tower')
for i in range(22):
    a=i*math.tau/22; r=49+R.uniform(-5,5);h=205+R.uniform(-10,32)
    rock(g,'chimney_column',math.cos(a)*r,-20,math.sin(a)*r,11,h,11,'basalt',6,5)
    rock(g,'chimney_outer_shelf',math.cos(a)*r,50,math.sin(a)*r,15,8,15,'ash',6,2)
    if i%2==0:rock(g,'chimney_red_seam',math.cos(a)*(r-8),15,math.sin(a)*(r-8),3,h*.56,3,'warm',6,2)
# Repeat family for ordinary connectors: combined angular pillars with ash plates.
g=group('basalt_cluster')
for i in range(10):
    a=i*2.4;r=math.sqrt(i)*6;h=R.uniform(17,42)
    rock(g,'hexagonal_teeth',math.cos(a)*r,0,math.sin(a)*r,5.5,h,5.5,'basalt' if i%3 else 'ash',6,3)
# Broken ceramic buttress does not include a driving surface; the route owns the real launch.
g=group('broken_launch_pylon')
for sign in (-1,1):
    box(g,'deep_heat_shield_leg',(sign*11,-35,0),(9,70,17),'charcoal',sign*.09)
    box(g,'ivory_outer_face',(sign*15,-33,0),(3,67,19),'ivory',sign*.09)
    box(g,'splayed_foundation',(sign*15,-70,0),(28,8,34),'basalt')
    for j in range(5):box(g,'cooling_slot',(sign*16,-58+j*12,9.6),(2.5,3,2),'oxide' if j==4 else 'dark')
box(g,'broken_top_crosshead',(0,0,0),(44,9,23),'ivory',.035)
for i in range(9):
    box(g,'torn_ceramic_tooth',(-19+i*4.5,4+R.uniform(0,5),R.uniform(-8,8)),(3.6,R.uniform(3,9),R.uniform(6,12)),'ivory' if i%3 else 'oxide',R.uniform(-.18,.18))
# Material batching within modules keeps the in-game draw count bounded.
for g in modules.values():
    for mat in M.values():
        objects=[ob for ob in list(g.children) if ob.type=='MESH' and ob.data.materials[0]==mat]
        if not objects:continue
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objects:ob.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].name=g.name+'__'+mat.name.split(' /')[0]
triangles=0
for ob in bpy.data.objects:
    if ob.type=='MESH':
        ob.data.calc_loop_triangles();triangles+=len(ob.data.loop_triangles)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'cindercoil-hero-kit.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'cindercoil-hero-kit.glb'),export_format='GLB',export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False)
manifest={'generator':'build_cindercoil.py','seed':61129,'modules':list(modules),'triangles':triangles,'meshCount':sum(ob.type=='MESH' for ob in bpy.data.objects),'runtimeAsset':'/assets/levels/cindercoil/cindercoil-hero-kit.glb','runtimeBytes':(OUT/'cindercoil-hero-kit.glb').stat().st_size,'textures':0,'sourceReference':'reference/cindercoil-scene-v1.png'}
(ROOT/'asset-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('CINDERCOIL_MANIFEST '+json.dumps(manifest))
