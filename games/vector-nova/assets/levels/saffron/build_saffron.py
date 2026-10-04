"""Saffron Leviathan authored asset kit. Run Blender --background --threads 4 --python this_file.
Game axes: +Y up, +Z forward. Scene-reference.png selected via built-in imagegen.
CPU modeling/export only; no renders. All visible forms are actual geometry.
"""
import bpy, math, random, json, hashlib
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
bone=mat('Saffron_pale_fossil',(.62,.49,.30)); chalk=mat('Saffron_chalk_edges',(.83,.73,.52)); seam=mat('Saffron_marrow_ochre',(.25,.14,.062)); sand=mat('Saffron_dune_saffron',(.62,.30,.075)); crust=mat('Saffron_mineral_bands',(.80,.49,.17)); shell=mat('Saffron_burrower_armor',(.23,.12,.052),.48,.08); flank=mat('Saffron_burrower_flanks',(.47,.28,.087),.6); eye=mat('Saffron_burrower_eye',(.16,.066,.019),.16)
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
 if len(points)<=12:
  original=points;rr=radii;points=[];radii=[]
  for j in range(len(original)-1):
   p0=Vector(original[max(0,j-1)]);p1=Vector(original[j]);p2=Vector(original[j+1]);p3=Vector(original[min(j+2,len(original)-1)])
   for k in range(4):
    t=k/4;q=.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)
    points.append(tuple(q));radii.append(rr[j]*(1-t)+rr[j+1]*t)
  points.append(original[-1]);radii.append(rr[-1])
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
sk=root('skull'); N=128; R=96; v=[]; f=[]
for layer in range(2):
 for j in range(R+1):
  z=j*300/R; t=j/R
  rx=82+25*math.sin(math.pi*t)**.6; ry=75+10*math.sin(math.pi*t)
  for i in range(N):
   a=i*2*math.pi/N; erosion=1+.025*math.sin(a*11+t*31)+.018*math.cos(a*23-t*47)
   thick=0 if layer==0 else 9
   x=(rx+thick)*math.cos(a)*erosion; y=24+(ry+thick)*math.sin(a)*erosion
   v.append((x,y,z+2*math.sin(a*7)*math.sin(math.pi*t)))
# Irregular elliptical orbital holes and smaller real through-pores have thick
# mineral rims. These replace the original rectangular cutouts.
pore_rng=random.Random(711)
apertures=[(.30,.31,.145,.30),(.66,.29,.095,.28),(.30,2.83,.145,.30),(.66,2.83,.095,.28),(.44,1.57,.075,.65),(.87,1.57,.045,.53)]
pores=[(pore_rng.uniform(.04,.97),pore_rng.uniform(0,2*math.pi),pore_rng.uniform(.012,.026),pore_rng.uniform(.035,.075)) for _ in range(92)]
def hole(j,i):
 t=(j+.5)/R; a=(i+.5)*2*math.pi/N
 for center,angle,dt,da in apertures+pores:
  delta=min(abs(a-angle),2*math.pi-abs(a-angle))
  rim=1+.14*math.sin(t*91+a*17)+.07*math.cos(a*33-t*63)
  if ((t-center)/dt)**2+(delta/da)**2<rim: return True
 return False
# Relax each through-aperture boundary onto its continuous ellipse before bevel.
# This retains the useful survey mesh but removes staircase-shaped cortical lips.
for j in range(1,R):
 for i in range(N):
  cells=[hole(j-1,(i-1)%N),hole(j-1,i),hole(j,(i-1)%N),hole(j,i)]
  if not any(cells) or all(cells):continue
  t=j/R;a=i*2*math.pi/N
  best=None
  for center,angle,dt,da in apertures+pores:
   delta=(a-angle+math.pi)%(2*math.pi)-math.pi
   r=((t-center)/dt)**2+(delta/da)**2
   if best is None or abs(r-1)<best[0]:best=(abs(r-1),center,angle,dt,da,delta,r)
  _,center,angle,dt,da,delta,r=best
  if r<.08 or abs(r-1)>1.5:continue
  tt=center+(t-center)/(r**.5);aa=angle+delta/(r**.5)
  tt=max(0,min(1,tt));rx=82+25*math.sin(math.pi*tt)**.6;ry=75+10*math.sin(math.pi*tt)
  erosion=1+.025*math.sin(aa*11+tt*31)+.018*math.cos(aa*23-tt*47)
  for layer in range(2):
   thick=0 if layer==0 else 9
   v[layer*(R+1)*N+j*N+i]=((rx+thick)*math.cos(aa)*erosion,24+(ry+thick)*math.sin(aa)*erosion,tt*300+2*math.sin(aa*7)*math.sin(math.pi*tt))
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
cranial=mesh('Cranial_shell_with_orbits',v,f,bone,sk)
# Thick rounded cortical lips; the silhouette and holes are geometry, not paint.
bevel=cranial.modifiers.new('Eroded rounded orbital and pore rims','BEVEL'); bevel.width=1.35; bevel.segments=3; bevel.limit_method='ANGLE'; bevel.angle_limit=.48
bpy.context.view_layer.objects.active=cranial; cranial.select_set(True); bpy.ops.object.modifier_apply(modifier=bevel.name); cranial.select_set(False)
# Baked shelter occlusion retains readable warm mineral surfaces in low quality.
colors=cranial.data.color_attributes.new(name='Cortical_shelter',type='FLOAT_COLOR',domain='CORNER')
for poly in cranial.data.polygons:
 for loop in poly.loop_indices:
  q=cranial.data.vertices[cranial.data.loops[loop].vertex_index].co
  z=-q.y; yy=q.z-24; t=max(0,min(1,z/300)); rx=82+25*math.sin(math.pi*t)**.6; ry=75+10*math.sin(math.pi*t)
  radial=((q.x/rx)**2+(yy/ry)**2)**.5
  shelter=.56 if radial<1.045 else .96
  shelter*=.93+.07*math.sin(z*.037+q.x*.019)
  colors.data[loop].color=(shelter,shelter*.98,shelter*.91,1)

# Raised orbital buttresses and thin broad cheek laminae define specific anatomy.
for center,angle,dt,da in apertures[:4]:
 pts=[]
 for k in range(49):
  phase=2*math.pi*k/48;t=center+dt*1.03*math.cos(phase);a=angle+da*1.08*math.sin(phase)
  rx=82+25*math.sin(math.pi*t)**.6+10;ry=75+10*math.sin(math.pi*t)+10
  pts.append((rx*math.cos(a),24+ry*math.sin(a),t*300))
 tube('Raised_orbital_cortical_lip',pts,[3.8+1.2*math.sin(k*.4)**2 for k in range(49)],bone,sk,12)
for side in [-1,1]:
 for k in range(3):
  tube('Cranial_internal_buttress',[(side*(67+k*3),-21,75+k*66),(side*(76+k*5),8,75+k*66),(side*(76+k*4),35,75+k*66),(side*(68+k*2),62,75+k*66)],[8,10,9,3],seam if k==1 else bone,sk,12)
# Jaw arches, flared cheek horns, nasal bridge, and perimeter teeth.
for side in [-1,1]:
 for ridge in range(3):
  pts=[]
  for j in range(22):
   t=j/21;pts.append((side*(76+28*math.sin(math.pi*t)+ridge*3),-28+ridge*7+7*math.sin(t*5),-8+t*318))
  tube('Long_mandible_lamina',pts,[6+2*math.sin(j/21*math.pi) for j in range(22)],chalk if ridge==2 else bone,sk,10)
 tube('Zygomatic_buttress',[(side*83,-25,20),(side*110,12,53),(side*115,50,83),(side*90,83,110)],[13,15,12,6],bone,sk,16)
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
 pts=[(side*(53+7*math.sin(t*math.pi))*(1-t*.17), -14+82*t, -5+10*math.sin(t*2)) for t in [i/18 for i in range(19)]]
 tube('Neural_arch',pts,[11-3*i/18+1.6*math.sin(i*.7) for i in range(19)],bone,ve,12)
tube('Spinous_process',[(0,73,9),(0,83,9),(0,99,14),(0,116,19)],[17,12,7,.6],bone,ve,14)
tube('Neural_bridge',[(-54,65,0),(-29,76,4),(0,78,9),(30,74,5),(54,65,0)],[8,8,10,8,8],bone,ve,12)
for side in [-1,1]:
 for k in range(4):
  z=-19+k*11
  tube('Vertebral_cortical_flange',[(side*41,-8,z),(side*52,7,z+3),(side*49,26,z+9)],[5,7,1.2],bone,ve,12)
for k in range(12):
 a=k*2*math.pi/12;ellipsoid('Centrum_articular_lamina',(43*math.cos(a),-24+16*math.sin(a),-27),(5,3,8),chalk,ve,10,6)
vertebra_variants=[]
for variant in range(2):
 vv=root('vertebra_'+str(variant+1));vertebra_variants.append(vv)
 for ob in list(ve.children):
  if ob.name.startswith('Spinous_process'):continue
  cp=ob.copy();cp.data=ob.data.copy();bpy.context.collection.objects.link(cp);cp.parent=vv
  for vert in cp.data.vertices:
   x,y,z=vert.co;vert.co.x=x*(1+.08*math.sin(z*.029+variant));vert.co.y=y+7*math.sin(x*.023+variant);vert.co.z=z*(.87+variant*.18)
  if variant==0 and ('Neural_arch' in ob.name or 'Neural_bridge' in ob.name):
   verts=[tuple(q.co) for q in cp.data.vertices];faces=[tuple(poly.vertices) for poly in cp.data.polygons if not all(cp.data.vertices[i].co.x>20 and cp.data.vertices[i].co.z>53 for i in poly.vertices)]
   me=bpy.data.meshes.new(cp.name+'_fracture');me.from_pydata(verts,[],faces);me.materials.append(cp.data.materials[0]);cp.data=me
  for poly in cp.data.polygons:poly.use_smooth=True
ri=root('rib')
pts=[]
for j in range(33):
 a=math.pi*j/32;pts.append((-86*math.cos(a),-21+131*math.sin(a)**.86,12*math.sin(a*1.5)))
tube('Rib_eroded_bow',pts,[5.3+5.5*math.sin(math.pi*j/32)**2+1.6*math.sin(j*.61) for j in range(33)],bone,ri,18)
for side in [-1,1]:
 tube('Rib_articular_head',[(side*83,-19,0),(side*91,-10,2),(side*84,2,4)],[9,13,5],bone,ri,14)
for k in range(12):
 a=.17+k*.23;p=(-86*math.cos(a),-21+131*math.sin(a)**.86,12*math.sin(a*1.5))
 ellipsoid('Rib_exposed_cancellous_lamina',p,(3.8,2.1,9),seam if k%4==0 else chalk,ri,12,7)
# Anatomical variants retain different broken sections, twist and cortical scale.
variants=[]
for variant in range(2):
 rr=root('rib_'+str(variant+1)); variants.append(rr)
 for ob in list(ri.children):
  cp=ob.copy();cp.data=ob.data.copy();bpy.context.collection.objects.link(cp);cp.parent=rr
  for vert in cp.data.vertices:
   x,y,z=vert.co; vert.co.x=x*(1+.10*math.sin(z*.039+variant));vert.co.y=y+7*math.sin(x*.018+variant);vert.co.z=z*(.90+variant*.12)+4*math.cos(x*.023)
  if 'Rib_eroded_bow' in ob.name:
   verts=[tuple(q.co) for q in cp.data.vertices]
   faces=[tuple(poly.vertices) for poly in cp.data.polygons if not all((cp.data.vertices[i].co.x>28 and cp.data.vertices[i].co.z>75) if variant==0 else (cp.data.vertices[i].co.x<-12 and 78<cp.data.vertices[i].co.z<96) for i in poly.vertices)]
   me=bpy.data.meshes.new(cp.name+'_fracture');me.from_pydata(verts,[],faces);me.materials.append(cp.data.materials[0]);cp.data=me
   for poly in cp.data.polygons:poly.use_smooth=True

for k in range(7):
 a=.20+k*.39
 p=(-86*math.cos(a),-21+131*math.sin(a)**.86,12*math.sin(a*1.5))
 tube('Rib_cortical_lamina',[(p[0]-3,p[1]+1,p[2]-5),(p[0]+2,p[1]+4,p[2]+3),(p[0]+6,p[1]+1,p[2]+11)],[1.6,2.4,.3],chalk,ri,8)
for side in [-1,1]:tube('Rib_foot' ,[(side*86,-21,0),(side*96,-31,5),(side*106,-36,17)],[7,10,2],chalk,ri)
# Dune patch mesh with broad leeward face and physical ripples.
du=root('dune');v=[];f=[];NX=48;NZ=36
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
# Sandfall assembly: broken fossil shelf, eroded buttresses and a flowing volume.
sf=root('sandfall')
for side in [-1,1]:
 tube('Sandfall_cortical_shelf',[(side*27,2,8),(side*16,5,3),(side*8,2,0)],[8,10,3],bone,sf,16)
 tube('Sandfall_eroded_buttress',[(side*23,1,12),(side*25,-30,19),(side*34,-76,20)],[11,12,17],bone,sf,16)
 ellipsoid('Sandfall_broken_lip',(side*9,0,0),(6,3.5,5),chalk,sf,18,10)
tube('Sandfall_shared_eroded_shelf',[(-25,2,11),(-8,7,8),(8,5,8),(25,2,11)],[9,10,8,9],bone,sf,16)
for layer in range(6):
 v=[];f=[];NX=12;NY=32
 for j in range(NY+1):
  t=j/NY
  for i in range(NX+1):
   u=i/NX-.5; width=(10+17*t)*(1+.14*math.sin(t*19+layer));angle=layer*math.pi/3
   v.append((u*width+math.sin(angle)*4*t+math.sin(t*8+layer)*1.3,-80*t,math.cos(angle)*(2+8*t)+4*math.sin(t*math.pi)+2*math.sin(u*19+t*13+layer)))
 for j in range(NY):
  for i in range(NX):
   if j>5 and abs(i-(NX-1)/2)>3.3+1.6*math.sin(j*.53+layer):continue
   if j>9 and (i*17+j*7+layer*31)%29==0:continue
   a=j*(NX+1)+i;f.append((a,a+1,a+NX+2,a+NX+1))
 mesh('Flowing_sand_volume_'+str(layer),v,f,crust,sf)
# Stratified sandstone shelves give the ordinary connectors a composed middle layer.
out=root('outcrop');v=[];f=[];N=24;R=17
for j in range(R+1):
 t=j/R;radius=(1-t)**.28*(36+6*math.sin(t*27))+3
 for i in range(N):
  a=2*math.pi*i/N; erosion=1+.14*math.sin(a*3+t*4)+.08*math.sin(a*7-t*18)
  v.append((radius*math.cos(a)*erosion,90*t, radius*.63*math.sin(a)*erosion))
for j in range(R):
 for i in range(N):a=j*N+i;f.append((a,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
f.extend([tuple(range(N-1,-1,-1)),tuple(R*N+i for i in range(N))])
mesh('Stratified_eroded_shelf',v,f,sand,out)
for j in range(6):
 y=4+j*14;rr=37*(1-y/95)**.28
 pts=[(rr*math.cos(a),y+1.8*math.sin(a*4),rr*.63*math.sin(a)) for a in [i*2*math.pi/24 for i in range(25)]]
 tube('Cemented_sediment_lamina',pts,[.7+.3*math.sin(i*.3)**2 for i in range(25)],crust,out,5)
out_shelf=root('outcrop_1')
for ob in list(out.children):
 cp=ob.copy();cp.data=ob.data.copy();bpy.context.collection.objects.link(cp);cp.parent=out_shelf
 for vert in cp.data.vertices:
  x,y,z=vert.co;vert.co.x=x*2.05;vert.co.y=y*1.3;vert.co.z=z*.40+5*math.sin(x*.035)
dune_low=root('dune_1')
for ob in list(du.children):
 cp=ob.copy();cp.data=ob.data.copy();bpy.context.collection.objects.link(cp);cp.parent=dune_low
 for vert in cp.data.vertices:
  x,y,z=vert.co;vert.co.x=x*1.22;vert.co.y=y*1.25;vert.co.z=z*.57
# Plated living animal: upward curved segmented body and distinct chisel head.
bu=root('burrower')
centers=[]
for j in range(19):
 t=j/18;centers.append((8*math.sin(t*4),56*math.sin(math.pi*t)-140*t*t,190*t))
for j,p in enumerate(centers):
 t=j/18;r=27*(1-.70*t)+3
 ellipsoid('Living_segment_%02d'%j,p,(r,r*.76,9.6),flank,bu,18,10)
 for k in range(5):
  a=.18+(math.pi-.36)*k/4; x=p[0]+r*math.cos(a); y=p[1]+r*.72*math.sin(a)
  w=r*.32;z=p[2]-2
  tangent=Vector((-math.sin(a),.72*math.cos(a),0)).normalized();normal=Vector((math.cos(a),math.sin(a)/.72,0)).normalized()
  local=[(-w,-1,-14),(w,-1,-14),(w*1.1,-1,7),(w*.6,-1,14),(-w*.6,-1,14),(-w*1.1,-1,7),(0,4,-7),(0,5,4)]
  vv=[tuple(Vector((x,y,z))+tangent*u+normal*h+Vector((0,0,d))) for u,h,d in local]
  ff=[(0,1,6),(1,2,7,6),(2,3,7),(3,4,7),(4,5,6,7),(5,0,6),(0,5,4,3,2,1)]
  mesh('Overlapping_sculpted_armor_%02d_%d'%(j,k),vv,ff,shell,bu)
  if k in [0,4]:tube('Lateral_hook',[(x,y,p[2]),(x*1.16,y-3,p[2]+8),(x*1.22,y-5,p[2]+17)],[3,2,.1],shell,bu,7)
v=[];f=[];N=16
for z,w,h in [(-58,10,5),(-43,19,13),(-23,31,20),(-2,28,20),(12,24,15)]:
 for i in range(N):
  a=i*2*math.pi/N;v.append((w*math.cos(a),3+h*math.sin(a),z))
for j in range(4):
 for i in range(N):a=j*N+i;f.append((a,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
f.extend([tuple(range(N-1,-1,-1)),tuple(4*N+i for i in range(N))])
head=mesh('Burrower_sharp_chisel_head',v,f,shell,bu)
for poly in head.data.polygons:poly.use_smooth=False
bevel=head.modifiers.new('Defined cranial armor edges','BEVEL');bevel.width=1.2;bevel.segments=2
bpy.context.view_layer.objects.active=head;head.select_set(True);bpy.ops.object.modifier_apply(modifier=bevel.name);head.select_set(False)
for side in [-1,1]:
 tube('Jaw_cortical_keel',[(side*12,4,-57),(side*21,14,-43),(side*30,20,-23),(side*23,19,-3)],[1.5,3.2,4,1.5],shell,bu,10)
 tube('Jaw_recessed_suture',[(side*11,2,-53),(side*24,5,-37),(side*30,5,-19)],[.8,1.4,.7],seam,bu,8)
for side in [-1,1]:
 tube('Sensory_mandible',[(side*18,-7,-27),(side*33,-14,-45),(side*23,-21,-58)],[8,5,.2],flank,bu,10)
 ellipsoid('Protected_eye_socket',(side*28,9,-27),(3.9,4.0,5.0),shell,bu,16,10)
 ellipsoid('Recessed_amber_eye',(side*30,9,-29),(1.65,1.7,2.7),eye,bu,16,10)
 tube('Protective_brow',[(side*26,15,-34),(side*30,15,-27),(side*29,13,-20)],[2,2.6,1],shell,bu,12)
tube('Median_rostrum',[(0,17,-20),(0,14,-49),(0,2,-61)],[11,7,.2],shell,bu,12)
# Merge meshes per material under each module to bound draw calls without flattening anatomy.
modules=[sk,ve,*vertebra_variants,ri,*variants,du,dune_low,sf,out,out_shelf,bu]
for rt in modules:
 by={}
 for ob in list(rt.children):
  if ob.type=='MESH':by.setdefault(ob.data.materials[0].name,[]).append(ob)
 for material,objects in by.items():
  bpy.ops.object.select_all(action='DESELECT')
  for ob in objects:ob.select_set(True)
  bpy.context.view_layer.objects.active=objects[0]
  bpy.ops.object.join(); objects[0].name=rt.name+'_'+material
  if rt.name.startswith('vertebra') and 'marrow' not in material:
   # Union overlapping anatomical processes into one rounded cortical body.
   ob=objects[0];remesh=ob.modifiers.new('Organic cortical union','REMESH');remesh.mode='VOXEL';remesh.voxel_size=2.4;remesh.adaptivity=.35;remesh.use_smooth_shade=True
   bpy.ops.object.modifier_apply(modifier=remesh.name)
   decimate=ob.modifiers.new('Bounded cortical mesh','DECIMATE');decimate.ratio=.70;bpy.ops.object.modifier_apply(modifier=decimate.name)
   smooth=ob.modifiers.new('Weathered cortical smoothing','SMOOTH');smooth.factor=.5;smooth.iterations=2;bpy.ops.object.modifier_apply(modifier=smooth.name)
   if material==bone.name:
    # Shallow cortical cups deform the closed surface without Boolean holes
    # through these fractured, remeshed arches. Route clearance stays intact.
    cups=[(side*(54-2*k),38+k*7,-6+2*math.sin(k*2),4.5+1.2*math.sin(k)**2) for side in [-1,1] for k in range(5)]
    for v in ob.data.vertices:
     q=Vector((v.co.x,v.co.z,-v.co.y))
     for x,y,z,r in cups:
      delta=q-Vector((x,y,z));distance=delta.length
      if distance<r*1.65 and distance>1e-6:
       q-=delta.normalized()*3.0*max(0,1-distance/(r*1.65))**2
     v.co=C(q)
   for poly in ob.data.polygons:poly.use_smooth=True
for rt in [sk,ve,*vertebra_variants]:
 verts=[];faces=[]
 if rt==sk:
  centers=[(side,30+k*25,0) for side in [-1,1] for k in range(9)]
 else:
  variant=[ve,*vertebra_variants].index(rt)
  centers=[(side,24+k*8+math.sin(k+variant)*2,variant) for side in [-1,1] for k in range(4)]
 for k,(side,d,variant) in enumerate(centers):
  base=len(verts);length=7+3*math.sin(k*1.71+variant)**2
  outline=[(-1,-.45),(-.65,-1),(.30,-.82),(1,-.1),(.45,.82),(-.5,.6)]
  for layer in range(2):
   for u,w in outline:
    if rt==sk:
     z=d+u*length*1.9;t=max(0,min(1,z/300));a=(.18 if side>0 else math.pi-.18)+w*.11
     rx=82+25*math.sin(math.pi*t)**.6;ry=75+10*math.sin(math.pi*t)
     erosion=1+.025*math.sin(a*11+t*31)+.018*math.cos(a*23-t*47)
     lift=8.2+layer*2.3+max(0,u)*1.8
     p=((rx+lift)*math.cos(a)*erosion,24+(ry+lift)*math.sin(a)*erosion,z)
    else:
     y=d+u*length;t=max(0,min(1,(y+14)/82));x=side*(53+7*math.sin(t*math.pi))*(1-t*.17);z=-5+10*math.sin(t*2)
     radius=10-3*t+1.6*math.sin(t*18*.7)+layer*1.9+max(0,u)*1.4
     a=-math.pi/3+w*.43+math.sin(k*2.1+variant)*.13
     p=(x+side*radius*math.cos(a),y,z+radius*math.sin(a))
    verts.append(p)
  faces.extend([tuple(base+i for i in face) for face in [(0,5,4,3,2,1),(6,7,8,9,10,11),(0,1,7,6),(1,2,8,7),(2,3,9,8),(3,4,10,9),(4,5,11,10),(5,0,6,11)]])
 mesh(rt.name+'_Curved_chipped_cortical_layers',verts,faces,bone,rt)
# Authored color variation follows plate overlap and exposed cranial edges.
for ob in bu.children:
 if ob.type!='MESH' or ob.data.materials[0]!=shell:continue
 colors=ob.data.color_attributes.new(name='Armor_overlap_depth',type='FLOAT_COLOR',domain='CORNER')
 for poly in ob.data.polygons:
  for loop in poly.loop_indices:
   q=ob.data.vertices[ob.data.loops[loop].vertex_index].co;z=-q.y
   overlap=abs(math.sin((z+2)*math.pi/(190/18)))
   shade=.65+.27*overlap+.07*math.sin(q.x*.28+z*.11)
   colors.data[loop].color=(shade,shade*.94,shade*.85,1)
scene=bpy.context.scene
scene['reference']='scene-reference.png; built-in imagegen selected 2026-09-29'
scene['authoring']='CPU modeled actual apertures, varied anatomical components, dune displacement, armor modules; animation is deterministic level-owned transform/deformation'
bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'leviathan-kit.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'leviathan-kit.glb'),export_format='GLB',use_selection=False,export_yup=True,export_apply=True)
counts={rt.name:sum(len(o.data.polygons) for o in rt.children if o.type=='MESH') for rt in modules}
bounds={}
for rt in modules:
 points=[(v.co.x,v.co.z,-v.co.y) for ob in rt.children if ob.type=='MESH' for v in ob.data.vertices]
 bounds[rt.name]={'origin':'module authoring origin','boundsGame':{'min':[min(p[a] for p in points) for a in range(3)],'max':[max(p[a] for p in points) for a in range(3)]}}
bounds['skull'].update({'origin':'mouth floor center','clearHalfWidth':50,'overheadMinimum':70})
bounds['sandfall']['origin']='top fossil shelf'
bounds['burrower']['origin']='head root'
files=[SRC/'build_saffron.py',SRC/'leviathan-kit.blend',SRC/'scene-reference.png',SRC/'saffron-sky-v2.png',SRC/'sky-prompt-v2.txt',OUT/'leviathan-kit.glb',OUT/'saffron-sky-v2.png']
hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.exists()}
(SRC/'asset-manifest.json').write_text(json.dumps({'format':2,'gameAxes':'+X lateral, +Y up, +Z forward','modules':bounds,'polygonCounts':counts,'runtime':'/assets/levels/saffron/leviathan-kit.glb','sha256':hashes},indent=2)+'\n')
print('SAFFRON ASSET COMPLETE',counts)
