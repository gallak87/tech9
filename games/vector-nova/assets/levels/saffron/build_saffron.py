"""Saffron Leviathan authored asset kit. Run Blender --background --threads 4 --python this_file.
Game axes: +Y up, +Z forward. Scene-reference.png selected via built-in imagegen.
CPU modeling/export only; no renders. All visible forms are actual geometry.
"""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'public/assets/levels/saffron'
SRC=ROOT/'assets/levels/saffron'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
random.seed(709)
def C(p): return (p[0],-p[2],p[1])
def mat(n,c,r=.8,metal=0):
 m=bpy.data.materials.new(n); m.diffuse_color=(*c,1); m.use_nodes=True
 b=m.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value=(*c,1); b.inputs['Roughness'].default_value=r; b.inputs['Metallic'].default_value=metal
 return m
bone=mat('Saffron_pale_fossil',(.62,.49,.30)); chalk=mat('Saffron_chalk_edges',(.83,.73,.52)); seam=mat('Saffron_marrow_ochre',(.25,.14,.062)); sand=mat('Saffron_dune_saffron',(.62,.30,.075)); crust=mat('Saffron_mineral_bands',(.80,.49,.17)); shell=mat('Saffron_burrower_armor',(.23,.12,.052),.48,.08); flank=mat('Saffron_burrower_flanks',(.47,.28,.087),.6); eye=mat('Saffron_burrower_eye',(.53,.10,.018),.25)
def mesh(name,verts,faces,material,parent):
 me=bpy.data.meshes.new(name); me.from_pydata([C(v) for v in verts],[],faces); me.update(); o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o); o.data.materials.append(material); o.parent=parent
 for p in me.polygons:p.use_smooth=True
 return o
def root(name):
 o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o); return o
def ellipsoid(name,center,scale,material,parent,seg=16,rings=10):
 v=[]; f=[]
 for j in range(rings+1):
  ph=math.pi*j/rings
  for i in range(seg):
   th=2*math.pi*i/seg
   noise=1+.035*math.sin(th*5+ph*7)
   v.append((center[0]+scale[0]*math.sin(ph)*math.cos(th)*noise,center[1]+scale[1]*math.cos(ph)*noise,center[2]+scale[2]*math.sin(ph)*math.sin(th)*noise))
 for j in range(rings):
  for i in range(seg):f.append((j*seg+i,j*seg+(i+1)%seg,(j+1)*seg+(i+1)%seg,(j+1)*seg+i))
 return mesh(name,v,f,material,parent)
def tube(name,points,radii,material,parent,segments=10):
 v=[];f=[]
 for j,p in enumerate(points):
  direction=Vector(points[min(j+1,len(points)-1)])-Vector(points[max(j-1,0)])
  direction.normalize(); side=direction.cross(Vector((0,0,1)))
  if side.length<.1:side=direction.cross(Vector((0,1,0)))
  side.normalize(); up=direction.cross(side).normalized()
  for i in range(segments):
   a=i*2*math.pi/segments; e=1+.10*math.sin(i*3+j*1.13)
   q=Vector(p)+(side*math.cos(a)+up*math.sin(a))*radii[j]*e; v.append(tuple(q))
 for j in range(len(points)-1):
  for i in range(segments): f.append((j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i))
 f.extend([tuple(range(segments-1,-1,-1)),tuple((len(points)-1)*segments+i for i in range(segments))]);return mesh(name,v,f,material,parent)
# Skull shell: open mouth, occipital exit and true orbital/skylight apertures.
sk=root('skull'); N=64; R=44; v=[]; f=[]
for layer in range(2):
 for j in range(R+1):
  z=j*300/R; t=j/R
  rx=82+25*math.sin(math.pi*t)**.6; ry=75+10*math.sin(math.pi*t)
  for i in range(N):
   a=i*2*math.pi/N; erosion=1+.025*math.sin(a*11+t*31)+.018*math.cos(a*23-t*47)
   thick=0 if layer==0 else 9
   x=(rx+thick)*math.cos(a)*erosion; y=24+(ry+thick)*math.sin(a)*erosion
   v.append((x,y,z+2*math.sin(a*7)*math.sin(math.pi*t)))
def hole(j,i):
 t=(j+.5)/R; a=(i+.5)*2*math.pi/N
 return ((.17<t<.43 or .57<t<.77) and ((.10<a<.61) or (2.54<a<3.03))) or (.39<t<.49 and .93<a<2.20) or (.83<t<.91 and 1.0<a<2.1)
off=(R+1)*N
for j in range(R):
 for i in range(N):
  if hole(j,i):continue
  a=j*N+i;b=j*N+(i+1)%N;c=(j+1)*N+(i+1)%N;d=(j+1)*N+i
  f.append((a,b,c,d));f.append((a+off,d+off,c+off,b+off))
  if j==0 or hole(j-1,i):f.append((a,a+off,b+off,b))
  if j==R-1 or hole(j+1,i):f.append((d,c,c+off,d+off))
  if hole(j,(i-1)%N):f.append((a,d,d+off,a+off))
  if hole(j,(i+1)%N):f.append((b,b+off,c+off,c))
mesh('Cranial_shell_with_orbits',v,f,bone,sk)
# Jaw arches, flared cheek horns, nasal bridge, and perimeter teeth.
for side in [-1,1]:
 for ridge in range(3):
  pts=[]
  for j in range(22):
   t=j/21;pts.append((side*(76+28*math.sin(math.pi*t)+ridge*3),-28+ridge*7+7*math.sin(t*5),-8+t*318))
  tube('Long_mandible_lamina',pts,[6+2*math.sin(j/21*math.pi) for j in range(22)],chalk if ridge==2 else bone,sk,10)
 tube('Zygomatic_buttress',[(side*83,-25,20),(side*110,12,53),(side*115,50,83),(side*90,83,110)],[13,15,12,6],bone,sk,12)
 tube('Temporal_horn',[(side*100,35,195),(side*132,69,219),(side*142,94,266)],[14,11,1],chalk,sk)
 for j in range(9):
  z=2+j*8; x=side*(67+7*math.sin(j*.4)); y=25+38*math.sin(j*.13)
  tube('Mouth_tooth',[(x,y,z),(x*.95,y-12,z+3),(x*.88,y-25,z+7)],[4.8,3.5,.25],chalk,sk,9)
for side in [-1,1]:
 tube('Nasal_keel',[(side*8,107,-4),(side*17,111,35),(side*12,107,76)],[9,12,4],chalk,sk,12)
# Mineral-filled small fissures vary with position and don't form tunnel strobe ribs.
for k in range(50):
 z=12+random.random()*276;a=random.uniform(0,math.pi); rx=84+25*math.sin(math.pi*z/300)**.6
 if 1<a<2: continue
 p=(rx*math.cos(a),25+87*math.sin(a),z)
 ellipsoid('Mineralized_bone_nodule',p,(random.uniform(1,4),random.uniform(1,3),random.uniform(4,12)),seam if k%3==0 else chalk,sk,8,5)
# Separate vertebra module, road-clear at y=0.
ve=root('vertebra')
ellipsoid('Centrum', (0,-23,0),(49,22,32),bone,ve,28,14)
for side in [-1,1]:
 tube('Transverse_process',[(side*28,-22,0),(side*58,-16,2),(side*86,-6,7),(side*100,-9,11)],[17,14,8,1.4],chalk,ve,12)
 pts=[(side*(53+7*math.sin(t*math.pi)), -14+82*t, -5+10*math.sin(t*2)) for t in [i/14 for i in range(15)]]
 tube('Neural_arch',pts,[9-2*i/14 for i in range(15)],bone,ve,12)
tube('Spinous_process',[(0,62,0),(0,88,8),(0,116,19)],[12,8,.6],chalk,ve,12)
tube('Neural_bridge',[(-54,65,0),(-29,76,4),(0,78,9),(30,74,5),(54,65,0)],[8,8,10,8,8],bone,ve,12)
for k in range(12):
 a=k*2*math.pi/12;ellipsoid('Centrum_articular_lamina',(43*math.cos(a),-24+16*math.sin(a),-27),(5,3,8),chalk,ve,10,6)
ri=root('rib')
pts=[]
for j in range(33):
 a=math.pi*j/32;pts.append((-86*math.cos(a),-21+131*math.sin(a)**.86,12*math.sin(a*1.5)))
tube('Rib_eroded_bow',pts,[5.3+5.5*math.sin(math.pi*j/32)**2 for j in range(33)],bone,ri,12)
for side in [-1,1]:tube('Rib_foot',[(side*86,-21,0),(side*96,-31,5),(side*106,-36,17)],[7,10,2],chalk,ri)
# Dune patch mesh with broad leeward face and physical ripples.
du=root('dune');v=[];f=[];NX=54;NZ=38
for j in range(NZ+1):
 z=(j/NZ-.5)*220
 for i in range(NX+1):
  x=(i/NX-.5)*300; xx=x/150;zz=z/110
  envelope=max(0,1-xx*xx)*max(0,1-zz*zz)
  crest=math.exp(-((xx+.23+.16*math.sin(zz*3))*3)**2)
  y=envelope*(13+48*crest)+envelope*.8*math.sin(x*.48+z*.06)
  v.append((x,y,z))
for j in range(NZ):
 for i in range(NX):
  a=j*(NX+1)+i;f.append((a,a+1,a+NX+2,a+NX+1))
mesh('Displaced_dune_with_wind_ripples',v,f,sand,du)
# Broad modeled sandfall ribbon, not particle-only; local top at y=0.
sf=root('sandfall');v=[];f=[]
for j in range(33):
 t=j/32
 for i in range(13):
  u=i/12-.5;v.append((u*(18+14*t),-80*t,4*math.sin(t*math.pi)+1.6*math.sin(u*39+t*13)))
for j in range(32):
 for i in range(12):a=j*13+i;f.append((a,a+1,a+14,a+13))
mesh('Flowing_sand_ribbon',v,f,crust,sf)
# Plated living animal: upward curved segmented body and distinct chisel head.
bu=root('burrower')
centers=[]
for j in range(19):
 t=j/18;centers.append((8*math.sin(t*4),-100*t*t,210*t))
for j,p in enumerate(centers):
 t=j/18;r=27*(1-.70*t)+3
 ellipsoid('Living_segment_%02d'%j,p,(r,r*.76,9.6),flank,bu,18,10)
 for k in range(5):
  a=.18+(math.pi-.36)*k/4; x=p[0]+r*math.cos(a); y=p[1]+r*.72*math.sin(a)
  ellipsoid('Overlapping_armor_%02d_%d'%(j,k),(x,y,p[2]-2),(r*.32,4.5,13),shell,bu,12,6)
  if k in [0,4]:tube('Lateral_hook',[(x,y,p[2]),(x*1.16,y-3,p[2]+8),(x*1.22,y-5,p[2]+17)],[3,2,.1],shell,bu,7)
ellipsoid('Burrower_chisel_head',(0,3,-16),(32,25,25),shell,bu,24,14)
for side in [-1,1]:
 tube('Sensory_mandible',[(side*18,-7,-27),(side*33,-14,-45),(side*23,-21,-58)],[8,5,.2],flank,bu,10)
 ellipsoid('Protected_eye',(side*28,9,-28),(3.8,3.4,4.5),eye,bu,12,8)
tube('Median_rostrum',[(0,17,-20),(0,14,-49),(0,2,-61)],[11,7,.2],shell,bu,12)
# Merge meshes per material under each module to bound draw calls without flattening anatomy.
for rt in [sk,ve,ri,du,sf,bu]:
 by={}
 for ob in list(rt.children):
  if ob.type=='MESH':by.setdefault(ob.data.materials[0].name,[]).append(ob)
 for material,objects in by.items():
  bpy.ops.object.select_all(action='DESELECT')
  for ob in objects:ob.select_set(True)
  bpy.context.view_layer.objects.active=objects[0]
  bpy.ops.object.join(); objects[0].name=rt.name+'_'+material
scene=bpy.context.scene
scene['reference']='scene-reference.png; built-in imagegen selected 2026-09-29'
scene['authoring']='CPU modeled actual apertures, varied anatomical components, dune displacement, armor modules; animation is deterministic level-owned transform/deformation'
bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'leviathan-kit.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'leviathan-kit.glb'),export_format='GLB',use_selection=False,export_yup=True,export_apply=True)
counts={rt.name:sum(len(o.data.polygons) for o in rt.children if o.type=='MESH') for rt in [sk,ve,ri,du,sf,bu]}
(SRC/'asset-manifest.json').write_text(json.dumps({'format':1,'gameAxes':'+X lateral, +Y up, +Z forward','modules':{'skull':{'origin':'mouth floor center','length':300,'clearHalfWidth':50,'overheadMinimum':70},'vertebra':{'origin':'road platform center','width':205,'height':155},'rib':{'origin':'road at center','width':215,'height':147},'dune':{'origin':'base center','width':300,'depth':220,'height':65},'sandfall':{'origin':'top','height':80,'width':32},'burrower':{'origin':'head root','length':275,'width':85}},'polygonCounts':counts,'runtime':'/assets/levels/saffron/leviathan-kit.glb'},indent=2)+'\n')
print('SAFFRON ASSET COMPLETE',counts)
