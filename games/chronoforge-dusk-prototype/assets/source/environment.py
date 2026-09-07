"""Original sculpted environment kit for Chronoforge Dusk.
Run: blender -b --python assets/source/environment.py
Retains editable .blend and exports browser-ready GLB files, no runtime dependencies.
"""
import bpy, math, random, os
from mathutils import Vector, noise
random.seed(87)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
OUT=os.path.join(ROOT,'public/models')
os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

def material(name,color,metal=0,rough=.8):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 return m
stone=material('Warm weathered limestone',(.40,.35,.31),0,.9)
edge=material('Worn cut faces',(.57,.51,.43),0,.85)
dark=material('Ancient basalt seams',(.16,.20,.24),.15,.78)
metal=material('Patinated bronze',(.32,.23,.12),.72,.4)
gold=material('Incised brass',(.62,.42,.18),.6,.45)
wood=material('Weathered bark',(.19,.12,.105),0,.98)
foliage=[material('Sage leaf '+str(i),c,0,.92) for i,c in enumerate([(.16,.31,.25),(.22,.40,.32),(.28,.43,.34),(.37,.45,.29),(.39,.39,.23)])]
rockmat=material('Striated riverstone',(.36,.35,.37),0,.93)
# Vertex color preserves mottling in glTF without a costly texture lookup.
for m in [stone,edge,wood,rockmat]:
 nt=m.node_tree;p=nt.nodes.get('Principled BSDF');a=nt.nodes.new('ShaderNodeVertexColor');a.layer_name='Surface';nt.links.new(a.outputs['Color'],p.inputs['Base Color'])

def parent(o,root):o.parent=root;return o

def smooth(o):
 if o.type=='MESH':
  for p in o.data.polygons:p.use_smooth=True
 return o

def colorize(o,base,variation=.1):
 if o.type!='MESH':return
 layer=o.data.color_attributes.new(name='Surface',type='BYTE_COLOR',domain='CORNER')
 for poly in o.data.polygons:
  for li in poly.loop_indices:
   p=o.data.vertices[o.data.loops[li].vertex_index].co+o.location
   n=noise.noise_vector(p*2.1)[0]*.6+noise.noise_vector(p*19)[0]*.3+random.uniform(-.08,.08)
   layer.data[li].color=tuple(max(.015,min(.95,v+n*variation)) for v in base)+(1,)

def apply(o,mod):
 bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)

def cube(name,loc,scale,mat,root,bevel=.04):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat);parent(o,root)
 if bevel:
  mod=o.modifiers.new('Worn softened edges','BEVEL');mod.width=bevel;mod.segments=3;apply(o,mod)
 smooth(o)
 if mat in [stone,edge,wood,rockmat]:colorize(o,mat.diffuse_color[:3],.13)
 return o

def cyl(name,loc,radius,depth,mat,root,vertices=40,radius2=None):
 bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=radius,radius2=radius2 if radius2 is not None else radius,depth=depth,location=loc);o=bpy.context.object;o.name=name;o.data.materials.append(mat);parent(o,root)
 mod=o.modifiers.new('Soft cast bevel','BEVEL');mod.width=min(.025,radius*.12);mod.segments=3;apply(o,mod);smooth(o)
 if mat in [stone,edge,wood,rockmat]:colorize(o,mat.diffuse_color[:3],.1)
 return o

def uv(name,loc,scale,mat,root,segments=16,rings=10):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(mat);smooth(o);parent(o,root);return o

def tube(name,points,radius,mat,root,res=4):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=4;c.bevel_depth=radius;c.bevel_resolution=res
 sp=c.splines.new('BEZIER');sp.bezier_points.add(len(points)-1)
 for p,co in zip(sp.bezier_points,points):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.data.materials.append(mat);parent(o,root);return o

def root(name):o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);return o

def export(r,filename):
 # Convert curved bark/vines to colored editable meshes before glTF export.
 for obj in list(r.children_recursive):
  if obj.type=='CURVE':
   bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH');smooth(obj)
   if obj.data.materials and obj.data.materials[0] in [stone,edge,wood,rockmat]:colorize(obj,obj.data.materials[0].diffuse_color[:3],.10)
 bpy.ops.object.select_all(action='DESELECT');r.select_set(True)
 for o in r.children_recursive:o.select_set(True)
 bpy.context.view_layer.objects.active=r
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,filename),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_materials='EXPORT')

column=root('RuinColumn')
# Continuous, fluted shaft: real rounded flutes and local erosion.
verts=[];faces=[];rings=22;sides=96
for j in range(rings):
 z=.42+j*2.94/(rings-1)
 for i in range(sides):
  a=i*math.tau/sides;r=.38-.035*j/rings+.021*math.cos(a*12)
  er=noise.noise_vector(Vector((math.cos(a)*2,math.sin(a)*2,z*3)))[0]*.009
  verts.append(((r+er)*math.cos(a),(r+er)*math.sin(a),z))
for j in range(rings-1):
 for i in range(sides):a=j*sides+i;b=j*sides+(i+1)%sides;faces.append((a,b,b+sides,a+sides))
mesh=bpy.data.meshes.new('Hand cut fluted shaft');mesh.from_pydata(verts,[],faces);o=bpy.data.objects.new('Eroded fluted limestone shaft',mesh);bpy.context.collection.objects.link(o);o.data.materials.append(stone);parent(o,column);smooth(o);colorize(o,stone.diffuse_color[:3],.12)
cube('Layered foundation',(0,0,.095),(1.23,1.23,.19),dark,column,.065)
cube('Worn plinth',(0,0,.23),(1.08,1.08,.18),edge,column,.045)
cyl('Torus base course',(0,0,.37),.5,.18,edge,column)
for z in [.52,1.5,2.52,3.22]:cyl('Narrow brass binding',(0,0,z),.404,.055,metal,column)
cyl('Capital neck',(0,0,3.35),.47,.15,edge,column)
cube('Capital lower',(0,0,3.51),(.98,.98,.21),stone,column,.06)
cube('Capital overhang',(0,0,3.69),(1.24,1.24,.18),edge,column,.07)
for j in range(4):
 a=j*math.pi/2
 # Fine embedded channels, tiny bolts and sculpted lower relief.
 o=cube('Inset conductive panel',(math.cos(a)*.4,math.sin(a)*.4,1.05),(.095,.065,.55),dark,column,.014);o.rotation_euler[2]=a
 for z in [.81,1.28]:uv('Ancient rivet',(math.cos(a)*.44,math.sin(a)*.44,z),(.035,.035,.035),gold,column,12,8)
# Hairline cracks follow the cylindrical surface, not broad painted lines.
for j in range(5):
 a=random.random()*math.tau;z=random.uniform(.7,2.5)
 pts=[]
 for k in range(5):
  aa=a+random.uniform(-.09,.09);zz=z+k*.1;pts.append((math.cos(aa)*.404,math.sin(aa)*.404,zz))
 tube('Subtle age fissure',pts,.004,dark,column,1)
# A few vines, tiny leaves climbed toward the old light.
pts=[(.45,.13,.18),(.42,.2,.55),(.3,.3,.91),(.23,.37,1.25),(.0,.41,1.65)]
tube('Ivy on stone',pts,.011,foliage[0],column,2)
for j in range(13):
 z=.25+j*.10;a=.2+z*.7;uv('Small ivy leaf',(math.cos(a)*.445,math.sin(a)*.445,z),(.075,.026,.043),foliage[j%3],column,10,6)
export(column,'ruin-column.glb')

arch=root('RuinArch')
# Two sturdy low pillars and a genuine stone voussoir arch.
for s in [-1,1]:
 x=s*2.17
 cube('Arch footing',(x,0,.12),(1.15,1.2,.24),dark,arch,.06)
 for k in range(7):
  o=cube('Masonry block',(x,0,.43+k*.37),(.78+random.uniform(-.025,.025),.88,.345),stone if k%2 else edge,arch,.035)
 cube('Springer',(x,0,2.93),(1.0,1.03,.20),edge,arch,.04)
 for k in range(3):cube('Inset arch support',(x,-.459,1.05+k*.4),(.12,.028,.23),metal,arch,.008)
for i in range(17):
 a=i*math.pi/16;r=2.17
 x=math.cos(a)*r;z=2.92+math.sin(a)*r
 o=cube('Rounded arch voussoir',(x,0,z),(.38,.89,.64),edge if i%4==0 else stone,arch,.045);o.rotation_euler[1]=a-math.pi/2
 # An inner raised brass fillet.
 if i not in [2,3]:
  q=cube('Ancient solar inlay',(math.cos(a)*(r-.31),-.452,2.92+math.sin(a)*(r-.31)),(.21,.035,.10),gold,arch,.015);q.rotation_euler[1]=a-math.pi/2
for s in [-1,1]:
 tube('Arch trailing ivy',[(s*2.3,-.5,2.5),(s*2.6,-.55,2),(s*2.2,-.51,1.5),(s*2.4,-.48,.4)],.018,foliage[0],arch,2)
 for j in range(14):uv('Vine leaf',(s*(2.3+math.sin(j)*.13),-.53,.4+j*.15),(.08,.022,.13),foliage[j%3],arch,12,8)
export(arch,'ruin-arch.glb')

boulder=root('Boulder')
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4,radius=.5,location=(0,0,.40));o=bpy.context.object;o.name='Sculpted layered stone';o.scale=(1.18,.94,.9);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
for v in o.data.vertices:
 co=v.co;no=noise.fractal(co*4.3,1.2,2,3);v.co*=1+no*.19;v.co.z+=math.sin(v.co.x*7+v.co.y*3)*.028
 if v.co.z<-.30:v.co.z=-.31+(v.co.z+.3)*.14
o.data.materials.append(rockmat);parent(o,boulder);smooth(o);colorize(o,(.36,.34,.33),.20)
# Pale sediment inclusions, tiny crystals and ground moss.
for j in range(9):
 x=random.uniform(-.32,.32);y=random.uniform(-.30,.3)
 uv('Mineral inclusion',(x,y,.68+random.uniform(-.025,.035)),(.025,.018,.009),edge,boulder,10,6)
export(boulder,'boulder.glb')

tree=root('CanopyTree')
# Curved organic branches, individual leaf fans instead of polygonal canopies.
tube('Bent bark trunk',[(0,0,0),(-.09,.04,.8),(.10,0,1.65),(.12,.04,2.5),(.32,0,3.2)],.15,wood,tree,5)
for j in range(6):
 a=j*math.tau/6+.3
 tube('Root flare',[(0,0,.33),(math.cos(a)*.27,math.sin(a)*.27,.08),(math.cos(a)*.58,math.sin(a)*.58,.015)],.065,wood,tree,3)
for j in range(9):
 a=j*2.39;z=1.45+(j%4)*.38;radius=1.00+(j%3)*.15
 end=(math.cos(a)*radius,math.sin(a)*radius,z+.80)
 tube('Tapering limb',[(0,0,z),(math.cos(a)*.47,math.sin(a)*.47,z+.38),end],.048 if j>4 else .065,wood,tree,3)
 for k in range(3):
  aa=a+(k-1)*.50;center=Vector((end[0]+math.cos(aa)*.17,end[1]+math.sin(aa)*.17,end[2]+.08+k*.10))
  tube('Fine twig',[end,tuple(center),tuple(center+Vector((.07,.03,.2)))],.015,wood,tree,2)
  # Each small leaf is a thin curved mesh with a central ridge and smooth pointed contour.
  for n in range(30):
   t=n*2.4+random.random();rr=math.sqrt(random.random())*.56
   pos=center+Vector((math.cos(t)*rr,math.sin(t)*rr,random.uniform(-.08,.28)))
   length=random.uniform(.14,.26);width=length*.34
   vertices=[(0,-length/2,0),(-width,0,.028),(0,length/2,0),(width,0,.028),(0,0,.060)]
   faces=[(0,1,4),(1,2,4),(2,3,4),(3,0,4)]
   me=bpy.data.meshes.new('Curved leaf blade');me.from_pydata(vertices,[],faces);leaf=bpy.data.objects.new('Individual sage leaf',me);bpy.context.collection.objects.link(leaf);leaf.location=pos;leaf.rotation_euler=(random.uniform(-.5,.5),random.uniform(-.5,.5),random.random()*math.tau);leaf.data.materials.append(foliage[(j+k+n)%len(foliage)]);parent(leaf,tree);smooth(leaf)
   mod=leaf.modifiers.new('Leaf soft shape','SUBSURF');mod.levels=1;apply(leaf,mod)
export(tree,'canopy-tree.glb')

# Keep all source assets editable, laid out for easy inspection in Blender.
for r,x in [(column,-5),(arch,0),(boulder,5),(tree,8)]:r.location.x=x
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'assets/source/environment.blend'))
# Small authoring preview is a QA artifact, never used to impersonate in-game rendering.
bpy.ops.object.light_add(type='AREA',location=(0,-7,10));light=bpy.context.object;light.data.energy=1800;light.data.shape='DISK';light.data.size=10
bpy.ops.object.camera_add(location=(13,-21,12));cam=bpy.context.object;direction=Vector((1,0,2))-cam.location;cam.rotation_euler=direction.to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=19;bpy.context.scene.camera=cam
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.render.resolution_x=1400;scene.render.resolution_y=720;scene.render.resolution_percentage=100;scene.world.color=(.15,.15,.15);scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.join(ROOT,'tests/artifacts/environment-kit.png');scene.view_settings.view_transform='AgX'
bpy.ops.render.render(write_still=True)
print('ENVIRONMENT KIT EXPORTED',OUT)
