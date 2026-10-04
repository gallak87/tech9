"""Original Cindercoil hero kit, reproducible Blender 4+ CPU geometry/export.
Reference: reference/cindercoil-scene-v1.png. No external mesh/texture inputs.
Run Blender --background --python assets/levels/cindercoil/build_cindercoil.py.
All authored dimensions are metres in the game's Y-up coordinates.
"""
import bpy, math, random, json, pathlib
from mathutils import Vector
R = random.Random(61129)
ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT.parents[2] / '.experiments/cindercoil-authoring'
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
 'basalt':material('Basalt / cold cut planes',(.039,.048,.061)),
 'ash':material('Ash / silver cooling strata',(.115,.132,.149)),
 'dark':material('Blackglass / folded crust',(.021,.029,.038),.54),
 'warm':material('Scoria / oxidized interior',(.088,.041,.027)),
 'lava':material('Lava / golden interior',(.26,.060,.012),.7,(1,.21,.020),.68),
 'core':material('Lava / pale narrow hot cores',(.7,.23,.04),.6,(1,.43,.08),.95),
 'edge':material('Lava / cooling red margins',(.07,.009,.003),.9,(.45,.026,.001),.28),
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
    wobble=[R.uniform(.75,1.23) for _ in range(sides)]
    leanX=R.uniform(-.12,.12)*rx;leanZ=R.uniform(-.15,.15)*rz
    for j in range(rings):
        v=j/(rings-1); scale=(1.04 if j==0 else .81 if j==rings-1 else R.uniform(.89,1.10))
        shiftX=math.sin(j*1.9)*rx*.075+v*leanX;shiftZ=math.cos(j*2.2)*rz*.07+v*leanZ
        for k in range(sides):
            a=phase+k*math.tau/sides; n=wobble[k]*(1+R.uniform(-.10,.10))
            verts.append((x+math.cos(a)*rx*n*scale+shiftX,y+v*ry+R.uniform(-.045,.045)*ry,z+math.sin(a)*rz*n*scale+shiftZ))
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

# Broad fault planes retain natural broken profiles and unequal, recessed strata.
wall=group('rupture_wall')
for i in range(43):
    x=(i-21)*10.6; height=225+39*math.sin(i*.27)+R.uniform(-21,31)
    rock(wall,'fractured_caldera_column',x,-23,-20+R.uniform(-20,8),R.uniform(10,16),height,R.uniform(27,43),'basalt',7,10)
    for k in range(2):
        rock(wall,'unequal_cooling_ledge',x,-18+height*(.18+k*.39)+R.uniform(-15,15),R.uniform(5,19),R.uniform(12,22),R.uniform(5,12),R.uniform(19,33),'ash' if i%6==0 else 'dark',7,3)
for sign in (-1,1):
    g=group('rupture_left' if sign<0 else 'rupture_right')
    for i in range(12):
        y=12+i*22;x=sign*(25+math.sin(i*.7)*9)
        rock(g,'displaced_fault_face',x,y,28,29,29,23,'basalt',7,5)
        rock(g,'oxidized_fault_interior',x-sign*18,y+2,39,9,23,9,'warm',6,4)
# Full cross-section cascades have irregular shoulders, bulging rope flow,
# narrow hotter seams and fractured surface crust; none are planar ribbons.
for n,(x,h) in enumerate([(-105,250),(0,270),(103,229)]):
    g=group('cascade_'+str(n)); points=[];radii=[]
    for j in range(45):
        t=j/44;points.append((x+math.sin(t*10+n)*8+math.sin(t*25)*2,h*(1-t)+3,29+57*t*t+7*math.sin(t*7+n)))
        bulge=math.sin(t*18+n)**2
        radii.append((10+8*bulge+3*math.sin(t*41)**2,9+6*bulge+4*t))
    tube(g,'bulging_molten_channel',points,radii,'lava',16)
    source=[(x-8,h+12,-34),(x-4,h+10,-7),(x,h+5,19),points[0]]
    tube(g,'source_channel',source,[(16,8),(17,10),(13,12),radii[0]],'lava',14)
    for k in range(9):
        offsets=(k-4)*3.4
        ps=[(p[0]+offsets+2*math.sin(j*.37+k),p[1],p[2]+radii[j][1]*.84+math.sin(j*.8+k)) for j,p in enumerate(points)]
        tube(g,'ropy_flow_ridge',ps,[(.65+.6*math.sin(j*.43+k)**2,1.1) for j in range(45)],'core' if k in (2,6) else 'edge' if k%2 else 'dark',7)
    for sign in (-1,1):
        ps=[(p[0]+sign*(radii[j][0]+1),p[1],p[2]+2) for j,p in enumerate(points)]
        tube(g,'cooled_channel_shoulder',ps,[(4.5+1.1*math.sin(j),4) for j in range(45)],'dark',8)
    for i in range(27):
        j=R.randrange(2,42);p=points[j]
        rock(g,'floating_flow_crust',p[0]+R.uniform(-10,10),p[1],p[2]+radii[j][1]*.91,R.uniform(1.2,3.4),R.uniform(4,10),1.6,'dark',6,3)
    rock(g,'molten_plunge_fan',x,-4,90,39,9,34,'lava',15,4)
    for i in range(10):
        rock(g,'splintered_plunge_crust',x+R.uniform(-34,34),2,88+R.uniform(-20,28),R.uniform(3,9),4,R.uniform(3,9),'dark',7,3)
# Asymmetric fractured crust with offset slabs and broken folded ropes.
# No complete circles or concentric rings; every plate has a sheared edge.
g=group('crust_raft')
rock(g,'raft_molten_undercut',-1,-2,1,26,3.5,19,'edge',11,2)
for i,(x,z,rx,rz) in enumerate([(-8,-3,18,14),(11,5,15,12),(4,-12,11,10)]):
    rock(g,'sheared_cooled_plate',x,0.2+i*.4,z,rx,3.2,rz,'dark',9,3)
for i in range(5):
    ps=[]
    for j in range(13):
        t=j/12;ps.append((-18+t*33+math.sin(t*5+i)*2,4+math.sin(t*7+i)*.35,-11+i*4+math.sin(t*5+i)*2.5))
    tube(g,'broken_pahoehoe_fold',ps,[(.32+.16*math.sin(j)**2,.34) for j in range(13)],'basalt',5)
# The coil anchor is a hollow volcanic chimney, keeping its centre genuinely open.
g=group('hollow_tower')
for i in range(22):
    a=i*math.tau/22; r=49+R.uniform(-5,5);h=205+R.uniform(-10,32)
    rock(g,'chimney_column',math.cos(a)*r,-20,math.sin(a)*r,11,h,11,'basalt',6,5)
    rock(g,'chimney_outer_shelf',math.cos(a)*r,50,math.sin(a)*r,15,8,15,'ash',6,2)
    if i%2==0:rock(g,'chimney_red_seam',math.cos(a)*(r-8),15,math.sin(a)*(r-8),3,h*.56,3,'warm',6,2)
# Chunky column groups include battered shoulders, low talus and tilted
# fractures. Runtime preserves these proportions instead of stretching needles.
g=group('basalt_cluster')
for i in range(13):
    a=i*2.4;r=math.sqrt(i)*4.3;h=R.uniform(12,39)
    x=math.cos(a)*r;z=math.sin(a)*r
    rock(g,'irregular_hexagonal_face',x,-3,z,R.uniform(4.5,7),h,R.uniform(4.5,7),'basalt' if i%5 else 'dark',7,7)
    if i%2==0:
        rock(g,'fracture_shelf',x+3,h*.44,z+2,8,5,7,'ash' if i%6==0 else 'basalt',7,3)
for i in range(11):
    a=i*2.399;r=16+R.random()*6
    rock(g,'foot_scree',math.cos(a)*r,-5,math.sin(a)*r,R.uniform(3,6),R.uniform(5,11),R.uniform(3,6),'dark' if i%3 else 'warm',7,3)
# Low cooling aprons and talus give connectors a second scale of authored rock.
g=group('talus_apron')
for i in range(29):
    a=i*2.399;r=math.sqrt(i)*4.2
    rock(g,'slumped_lava_slab',math.cos(a)*r,-5+R.uniform(-1,1),math.sin(a)*r,R.uniform(4,10),R.uniform(3,10),R.uniform(5,12),'basalt' if i%4 else 'ash',8,4)
for i in range(9):
    ps=[]
    for j in range(18):
        t=j/17;ps.append((-24+t*48+math.sin(t*5+i),3+math.sin(t*6+i)*.6,-18+i*4+math.sin(t*4+i)*2.5))
    tube(g,'cooling_rope_flow',ps,[(.8,.7) for _ in ps],'dark',7)
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
# Broken rock edges catch diffuse ash light without rounding the macro silhouette.
for ob in list(bpy.data.objects):
    if ob.type=='MESH' and not any(k in ob.name for k in ('basalt_cluster','crust_raft','talus_apron')) and any(k in ob.name for k in ('Basalt','Ash','Blackglass','Scoria')):
        bpy.context.view_layer.objects.active=ob
        modifier=ob.modifiers.new('Small fractured edge bevel','BEVEL')
        modifier.width=.32;modifier.segments=1;modifier.limit_method='ANGLE';modifier.angle_limit=.65
        bpy.ops.object.modifier_apply(modifier=modifier.name)
triangles=0
for ob in bpy.data.objects:
    if ob.type=='MESH':
        ob.data.calc_loop_triangles();triangles+=len(ob.data.loop_triangles)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'cindercoil-hero-kit-v2.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'cindercoil-hero-kit-v2.glb'),export_format='GLB',export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False)
manifest={'generator':'build_cindercoil_v2.py','seed':61129,'modules':list(modules),'triangles':triangles,'meshCount':sum(ob.type=='MESH' for ob in bpy.data.objects),'authoringExport':'.experiments/cindercoil-authoring/cindercoil-hero-kit-v2.glb','runtimeBytes':(OUT/'cindercoil-hero-kit-v2.glb').stat().st_size,'textures':0,'sourceReference':'reference/cindercoil-scene-v1.png'}
(ROOT/'asset-manifest-v2.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('CINDERCOIL_MANIFEST '+json.dumps(manifest))
