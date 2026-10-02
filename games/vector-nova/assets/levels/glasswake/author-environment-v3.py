"""Glasswake playtest revision. Opens retained v2, writes a separate editable v3.
Original concept, initial generator/scene, v2, and selected sky stay unchanged.
Blender background CPU geometry/export only; no bake or GPU render.
"""
import bpy, math, os, json
from mathutils import Vector
ROOT=os.path.dirname(os.path.abspath(__file__))
OUT=os.path.abspath(os.path.join(ROOT,'../../../.experiments/glasswake-authoring'))
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'glasswake-environment-v2.blend'))
M={k:bpy.data.materials[v] for k,v in {'blue':'Blue compact ice planes','ice':'Pale fractured wind-polished ice','frost':'Opaque frost crust','core':'Cobalt buried blue-black core','edge':'Fresh fracture blue edges','dark':'Trapped meteoric inclusion','glow':'Deep cavity fracture light'}.items()}
for k,col,rough in [('blue',(.23,.44,.57),.33),('ice',(.52,.73,.8),.39),('frost',(.76,.86,.9),.82),('core',(.075,.14,.22),.76),('edge',(.35,.62,.73),.29),('dark',(.047,.059,.078),.62)]:
 p=M[k].node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=.025

def mesh(name,verts,faces,keys,indices):
 d=bpy.data.meshes.new(name);d.from_pydata([(x,-z,y) for x,y,z in verts],[],faces);d.update()
 o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o)
 for k in keys:d.materials.append(M[k])
 for p,i in zip(d.polygons,indices):p.material_index=i
 return o
# Complete, thick broken vault with a true overhead aperture and eroded ends.
bpy.data.objects.remove(bpy.data.objects['cave_roof'],do_unlink=True)
cols=36;rows=16;verts=[];faces=[];mids=[]
def cell(i,j):
 if not (0<=i<cols and 0<=j<rows):return False
 return ((i-17)/5.2)**2+((j-8)/3.2)**2>1
for layer in range(2):
 for j in range(rows+1):
  z=(j/rows-.5)*154
  for i in range(cols+1):
   a=i/cols*math.pi;x=math.cos(a)*(88+layer*12)
   y=48+math.sin(a)*(38+layer*13)
   fault=5*math.tanh((x+z*.58-6)/8)+3*math.tanh((x-z*.4+22)/6)
   y+=fault+3*math.sin(z*.052+x*.025)+2*math.cos(x*.071-z*.021)
   zz=z*(.91+.08*math.sin(x*.067))
   verts.append((x,y,zz))
size=(rows+1)*(cols+1)
for j in range(rows):
 for i in range(cols):
  if not cell(i,j):continue
  a=j*(cols+1)+i;b=a+1;c=a+cols+2;d=a+cols+1
  faces.extend([(a,b,c,d),(d+size,c+size,b+size,a+size)]);mids.extend([0 if (i+j*2)%11>2 else 1,1])
  for edge,neighbor in [((a,b),(i,j-1)),((b,c),(i+1,j)),((c,d),(i,j+1)),((d,a),(i-1,j))]:
   if not cell(*neighbor):u,v=edge;faces.append((v,u,u+size,v+size));mids.append(2)
mesh('cave_roof',verts,faces,['blue','ice','frost'],mids)
# A tall, coherent fault wall for the plunge: narrow near edge, deep mass behind.
cols=26;rows=32;verts=[];faces=[];mids=[]
for side in range(2):
 for j in range(rows+1):
  t=j/rows;y=-100+t*355
  for i in range(cols+1):
   z=(i/cols-.5)*184
   recess=9*math.exp(-((z+8)/38)**2-((y-115)/85)**2)
   fault=5*math.tanh((z-y*.29+27)/7)+4*math.tanh((z+y*.19-15)/6)
   x=(-24+recess+fault+3*math.sin(z*.063+y*.031)) if side==0 else 42+5*math.sin(z*.036)
   y1=y+(7*math.sin(z*.033)+4*math.cos(z*.091))*t**2
   verts.append((x,y1,z*(.88+.10*math.sin(t*math.pi))))
size=(rows+1)*(cols+1)
for side in range(2):
 for j in range(rows):
  for i in range(cols):
   a=side*size+j*(cols+1)+i;b=a+1;c=a+cols+2;d=a+cols+1
   faces.append((d,c,b,a) if side==0 else (a,b,c,d));mids.append(0 if j<5 else 1 if j<25 else 2)
for j in [0,rows]:
 for i in range(cols):a=j*(cols+1)+i;faces.append((a,a+1,a+size+1,a+size));mids.append(2)
for i in [0,cols]:
 for j in range(rows):a=j*(cols+1)+i;faces.append((a,a+cols+1,a+size+cols+1,a+size));mids.append(1)
mesh('crevice_wall',verts,faces,['core','blue','frost'],mids)
# Meteor becomes an irregular embedded stone, encased by curved fractured ice.
bpy.data.objects.remove(bpy.data.objects['dark_inclusion'],do_unlink=True)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3,radius=1)
o=bpy.context.object;o.name='dark_inclusion';o.data.materials.append(M['dark'])
for v in o.data.vertices:
 x,y,z=v.co;gain=1+.065*math.sin(x*14+y*7)+.035*math.cos(z*21-y*11)
 # Blender +Z is game up, -Y is game forward.
 v.co=(x*26*gain,y*41*gain,z*47*gain+28)
parts=[o]
for k in range(3):
 bpy.ops.mesh.primitive_torus_add(major_segments=48,minor_segments=8,major_radius=32+k*2,minor_radius=2.3+k*.6,location=(0,0,27+k*6),rotation=(.65+k*.33,.2+k*.16,k*.72))
 ice=bpy.context.object;ice.scale=(1,1.13,1.35);ice.data.materials.append(M['ice']);parts.append(ice)
 for v in ice.data.vertices:v.co*=1+.065*math.sin(v.co.x*.31+v.co.y*.23)
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();parts[0].name='dark_inclusion'
# Calving rear wall: large recessed erosion pockets, broken secondary depth.
for name in ['calving_back']+[f'calving_ledge_{i}' for i in range(4)]:
 o=bpy.data.objects[name]
 for v in o.data.vertices:
  x,z,y=v.co.x,-v.co.y,v.co.z
  if name=='calving_back':
   near=max(0,min(1,(120-x)/58))
   pocket=23*math.exp(-((z+68)/86)**2-((y-72)/65)**2)+16*math.exp(-((z-100)/58)**2-((y-20)/53)**2)
   x+=near*pocket;y+=near*5*math.sin(z*.032+y*.047)
  else:
   y+=7*math.sin(z*.018+int(name[-1])*1.3)
   x+=9*math.sin(z*.021+int(name[-1]))
  v.co=(x,-z,y)
 o.data.update()
# Vertex-rich surfaces carry broad curvature; fine detail is runtime triplanar.
for o in bpy.context.scene.objects:
 if o.type=='MESH':o['source']='scene-reference.png; author-environment-v3.py over retained v2'
bpy.context.scene['asset_notes']='Playtest revision: broken aperture vault, tall crevice faults, encased irregular inclusion and recessed calving pockets.'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'glasswake-environment-v3.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'glasswake-environment-v3.glb'),export_format='GLB',export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False)
manifest={'generator':'author-environment-v3.py','base':'glasswake-environment-v2.blend','reference':'scene-reference.png','authoringExport':'.experiments/glasswake-authoring/glasswake-environment-v3.glb','meshes':[]}
for o in bpy.context.scene.objects:
 if o.type=='MESH':
  o.data.calc_loop_triangles();manifest['meshes'].append({'name':o.name,'vertices':len(o.data.vertices),'triangles':len(o.data.loop_triangles)})
manifest['triangles']=sum(m['triangles'] for m in manifest['meshes']);manifest['bytes']=os.path.getsize(os.path.join(OUT,'glasswake-environment-v3.glb'))
with open(os.path.join(ROOT,'asset-manifest-v3.json'),'w') as f:json.dump(manifest,f,indent=2)
print('GLASSWAKE_V3',manifest['triangles'],manifest['bytes'])
