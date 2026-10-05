"""Saffron Leviathan authored asset kit. Run Blender --background --threads 4 --python this_file.
Game axes: +Y up, +Z forward, including the living grazer. Approved dune-grazer concept v1 guides its anatomy.
CPU modeling/export only; no renders. All visible forms are actual geometry.
"""
import bpy, math, random, json, hashlib
from mathutils import noise
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
bone=mat('Saffron_pale_fossil',(.62,.49,.30)); chalk=mat('Saffron_chalk_edges',(.83,.73,.52)); seam=mat('Saffron_marrow_ochre',(.25,.14,.062)); sand=mat('Saffron_dune_saffron',(.62,.30,.075)); crust=mat('Saffron_mineral_bands',(.80,.49,.17)); shell=mat('Saffron_burrower_armor',(.25,.16,.088),.96); flank=mat('Saffron_burrower_flanks',(.31,.165,.048),.97); cavity=mat('Saffron_burrower_overlap',(.045,.024,.012),1); worn=mat('Saffron_burrower_worn_edges',(.63,.54,.39),.98)
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
sk=root('skull'); N=112; R=80; v=[]; f=[]
def cranial_point(t,a,layer):
 rx=82+25*math.sin(math.pi*t)**.6;ry=75+10*math.sin(math.pi*t)
 erosion=1+.010*math.sin(a*5+t*13)+.007*math.cos(a*9-t*21)
 # Continuous outer cortical anatomy, independent of the road-clear inner vault.
 rostrum=42*math.exp(-((t-.12)/.23)**2)
 temporal=15*math.exp(-((t-.69)/.18)**2)
 brow=27*math.exp(-((t-.22)/.25)**2)
 occiput=13*math.exp(-((t-.86)/.14)**2)
 side=abs(math.cos(a))**3
 roof=max(0,math.sin(a))**2
 # Nasal relief and orbital buttresses grow within the same closed cortex.
 nasal=14*math.exp(-((a-math.pi/2)/.28)**2)*math.exp(-((t-.18)/.25)**2)
 orbital=0
 for tt,aa in [(.30,.31),(.30,2.83),(.66,.29),(.66,2.83)]:
  radius=math.sqrt(((t-tt)/.18)**2+((a-aa)/.40)**2)
  orbital+=9*math.exp(-((radius-1)/.30)**2)
 channels=0
 for aa,tt,length,depth in [(.93,.55,.25,3.6),(2.12,.74,.19,2.8),(1.27,.30,.17,2.0)]:
  channels+=depth*math.exp(-((a-aa-.055*math.sin(t*8))/.043)**2)*math.exp(-((t-tt)/length)**4)
 x=(rx+layer*(9+(rostrum+temporal)*side+orbital-channels))*math.cos(a)*erosion
 y=24+(ry+layer*(9+(brow+occiput)*roof+nasal+orbital*.6-channels))*math.sin(a)*erosion
 mouth=(8*math.sin(a*3+.4)+4.5*math.sin(a*7+1.2))*math.exp(-(t/.09)**2)
 occipital_break=(6*math.sin(a*4+.8)+3*math.cos(a*9))*math.exp(-((1-t)/.08)**2)
 z=t*300-layer*16*math.exp(-(t/.15)**2)*roof+mouth+occipital_break
 return (x,y,z)
for layer in range(2):
 for j in range(R+1):
  z=j*300/R; t=j/R
  rx=82+25*math.sin(math.pi*t)**.6; ry=75+10*math.sin(math.pi*t)
  for i in range(N):
   a=i*2*math.pi/N;v.append(cranial_point(t,a,layer))
# Irregular elliptical orbital holes and smaller real through-pores have thick
# mineral rims. These replace the original rectangular cutouts.
pore_rng=random.Random(711)
apertures=[(.30,.31,.145,.30),(.66,.29,.095,.28),(.30,2.83,.145,.30),(.66,2.83,.095,.28),(.44,1.57,.075,.65),(.87,1.57,.045,.53)]
pores=[(pore_rng.uniform(.68,.95),pore_rng.uniform(.55,2.6),pore_rng.uniform(.016,.032),pore_rng.uniform(.035,.075)) for _ in range(8)]
pores += [(.49,1.02,.12,.045),(.79,2.32,.085,.055)]
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
  tt=max(0,min(1,tt))
  for layer in range(2):
   v[layer*(R+1)*N+j*N+i]=cranial_point(tt,aa,layer)
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
for side in [-1,1]:
 tube('Recessed_cranial_internal_buttress',[(side*62,-21,148),(side*67,8,148),(side*66,35,148),(side*61,62,148)],[8,10,9,3],bone,sk,12)
# Jaw arches, flared cheek horns, nasal bridge, and perimeter teeth.
for side in [-1,1]:
 for ridge in range(1):
  pts=[]
  for j in range(22):
   t=j/21;pts.append((side*(76+28*math.sin(math.pi*t)+ridge*3),-28+ridge*7+7*math.sin(t*5),-8+t*318))
  tube('Long_mandible_lamina',pts,[6+2*math.sin(j/21*math.pi) for j in range(22)],chalk if ridge==2 else bone,sk,10)
 # Thick broken temporal blade, integrated into the occipital buttress.
 outline=[(96,35,188),(119,42,205),(133,68,232),(129,81,258),(113,87,269),(99,62,235)]
 vv=[(side*(x+layer*5),y,z) for layer in range(2) for x,y,z in outline]
 ff=[tuple(range(5,-1,-1)),tuple(range(6,12))]+[(i,(i+1)%6,(i+1)%6+6,i+6) for i in range(6)]
 mesh('Broken_temporal_cortical_blade',vv,ff,bone,sk)
 for j in range(6):
  z=2+j*11; x=side*(67+7*math.sin(j*.4)); y=25+38*math.sin(j*.13)
  tube('Mouth_tooth',[(x,y,z),(x*.95,y-12,z+3),(x*.88,y-25,z+7)],[5.4,4.0,2.2],bone,sk,9)
# Mineral-filled small fissures vary with position and don't form tunnel strobe ribs.
for k in range(4):
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
outline=[(-23,68,-8),(-22,80,-3),(-12,97,2),(-5,111,10),(1,109,14),(7,98,17),(18,83,18),(23,72,10)]
vv=[(x,y,z+layer*(4+8*max(0,(100-y)/32))) for layer in range(2) for x,y,z in outline]
ff=[tuple(range(7,-1,-1)),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
mesh('Spinous_process_broken_neural_lamina',vv,ff,bone,ve)
tube('Neural_bridge',[(-54,65,0),(-29,76,4),(0,78,9),(30,74,5),(54,65,0)],[8,8,10,8,8],bone,ve,12)
for side in [-1,1]:
 ellipsoid('Prezygapophyseal_articular_facet',(side*43,7,-19),(12,7,15),bone,ve,16,10)
 for k in range(4):
  z=-19+k*11
  tube('Vertebral_cortical_flange',[(side*41,-8,z),(side*52,7,z+3),(side*49,26,z+9)],[5,7,1.2],bone,ve,12)
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
def rib_blade(parent,variant,start,end):
 verts=[];faces=[];segments=16;rows=max(8,math.ceil((end-start)*48))
 for j in range(rows+1):
  t=start+(end-start)*j/rows;a=t*math.pi
  center=Vector((-86*math.cos(a)+18*math.sin(a)**2,-21+131*math.sin(a)**.86+22*math.sin(a)*math.cos(a),36*math.sin(a*1.3+variant*.35)+12*t*t))
  outward=Vector((-math.cos(a),math.sin(a),0));depth=Vector((0,0,1))
  twist=.60*math.sin(a*1.3+variant*.8);normal=outward*math.cos(twist)+depth*math.sin(twist)
  foreaft=depth*math.cos(twist)-outward*math.sin(twist)
  # Flattened cortical blade, asymmetric broad root and narrow opposing end.
  width=3.3+3.0*math.sin(a)+12.0*math.exp(-(t/.20)**2)
  breadth=6+15*math.exp(-(t/.20)**2)+7*math.sin(a)**2
  for i in range(segments):
   theta=2*math.pi*i/segments
   radial=math.cos(theta);edge=math.sin(theta)
   channel=2.1*math.exp(-((theta-(1.40+.15*math.sin(a*2)))/.15)**2)*math.sin(a)**4
   q=center+normal*(width*radial)+foreaft*((breadth-channel)*math.copysign(abs(edge)**.65,edge))
   # Only fracture ends have uneven torn cortical sections; the shaft is calm.
   if (j==0 and start>0) or (j==rows and end<1):
    q+=Vector((0,2.1*math.sin(theta*3+variant),2.8*math.cos(theta*5+variant)))
   verts.append(tuple(q))
 for j in range(rows):
  for i in range(segments):faces.append((j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i))
 faces += [tuple(range(segments-1,-1,-1)),tuple(rows*segments+i for i in range(segments))]
 ob=mesh('Twisted_cortical_rib_blade',verts,faces,bone,parent)
 # Closed, recessed mineral fracture sections, not open clipping-plane holes.
 for j,fractured in [(0,start>0),(rows,end<1)]:
  if not fractured:continue
  center=Vector((0,0,0))
  for i in range(segments):center+=Vector(verts[j*segments+i])/segments
  vv=[tuple(center+(Vector(verts[j*segments+i])-center)*.72) for i in range(segments)]
  mesh('Recessed_cancellous_fracture',vv,[tuple(range(segments))],seam,parent)
def rib_root(parent,variant):
 ellipsoid('Enlarged_costal_articular_head',(-87,-22,5),(17,15,23),bone,parent,20,12)
 tube('Costal_neck_and_tubercle',[(-91,-24,8),(-95,-11,12),(-83,9,16)],[12,13,6],bone,parent,14)
 tube('Tapered_distal_costal_root',[(86,-20,-8),(91,-31,0),(99,-37,15)],[6,9,3],bone,parent,12)
rib_blade(ri,0,0,1);rib_root(ri,0)
variants=[]
for variant,ranges in enumerate([[(0,.61),(.90,1)],[(0,.28),(.41,1)]]):
 rr=root('rib_'+str(variant+1));variants.append(rr)
 for start,end in ranges:rib_blade(rr,variant+1,start,end)
 rib_root(rr,variant+1)
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
# Approved dune grazer v1: +Z shovel leads a continuous, low -Z body.
# Longitudinal rings provide a single shoulder/tail volume; no rounded beads.
bu=root('burrower')
bu['reference']='dune-grazer-approved-concept-v1.png'
bu['forward']='+Z; shovel tip +100m, tail -480m'
bu['anatomy']='broad cranial shield, recessed mineral filter, nine integrated overlapping chitin shields'
def body_section(z):
 t=max(0,min(1,-z/480))
 width=(62+5*math.sin(t*math.pi*1.7))*(1-t)**.65+3
 height=27*(1-t)**.8+2
 center=10*(1-t)-4*t
 return width,height,center
v=[];f=[];N=32;R=80
for j in range(R+1):
 z=20-j*500/R;w,h,c=body_section(z)
 for i in range(N):
  a=i*2*math.pi/N
  # Shallow longitudinal muscle grain is continuous through all shields.
  ripple=1+.014*math.sin(a*7+z*.024)+.008*math.cos(a*13-z*.019)
  v.append((w*math.cos(a)*ripple,c+h*math.sin(a)*ripple,z))
for j in range(R):
 for i in range(N):
  a=j*N+i;f.append((a,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
f.extend([tuple(range(N-1,-1,-1)),tuple(R*N+i for i in range(N))])
mesh('Continuous_muscular_shoulder_and_taper',v,[tuple(reversed(face)) for face in f],flank,bu)

# Broad swept plates: planar crowns, asymmetric carinae and thick undercuts.
# The discontinuous wear is exposed material at chips, not painted racing trim.
shield_fronts=[17,-45,-108,-168,-235,-294,-356,-414,-456]
shield_lengths=[91,87,89,86,80,78,66,59,47]
def armor_point(k,u,a,layer=0):
 z=shield_fronts[k]-shield_lengths[k]*u
 w,h,c=body_section(z)
 sweep=(31+12*math.sin(k*1.7))*abs(math.cos(a))**1.3+7*math.cos(a)*math.sin(k*2.1)
 zz=z-sweep+2.1*math.sin(a*9+k*2.3)*u**5
 # Low broad faces grow into unequal diagonal reinforcing ridges.
 carina=3.0*max(0,1-abs(a-(1.05+.13*math.sin(k)))/.34)*math.sin(u*math.pi)
 carina+=1.8*max(0,1-abs(a-2.15)/.39)*math.sin(u*math.pi+.2)
 # The last third bends upward as a rigid swept rim; broad faces stay planar.
 rim=max(0,(u-.60)/.40)
 relief=(1.3+10.4*rim**1.35)*(1-k*.037)+carina-layer*(7.2-1.4*math.sin(a))
 erosion=.7*math.sin(a*13+k)*rim**3
 x=(w+2+relief*.32)*math.cos(a)*(1+.028*math.sin(k*1.9+a*2))
 y=c+h*min(1,math.sin(a)*2.1)+relief*math.sin(a)**.50+erosion
 return (x,y,zz)
for k in range(9):
 verts=[];faces=[];across=24;rows=6
 for layer in range(2):
  for j in range(rows+1):
   for i in range(across+1):
    a=.035+(math.pi-.07)*i/across
    verts.append(armor_point(k,j/rows,a,layer))
 stride=(rows+1)*(across+1)
 for j in range(rows):
  for i in range(across):
   a=j*(across+1)+i;q=(a,a+across+1,a+across+2,a+1)
   faces.extend([q,tuple(x+stride for x in reversed(q))])
 for j in range(rows):
  for i in [0,across]:
   a=j*(across+1)+i;b=a+across+1;faces.append((a,b,b+stride,a+stride))
 for j in [0,rows]:
  for i in range(across):
   a=j*(across+1)+i;faces.append((a,a+1,a+1+stride,a+stride))
 ob=mesh('Swept_integrated_chitin_shield_%02d'%k,verts,faces,shell,bu)
 for poly in ob.data.polygons:
  # Keep rigid face-to-rim breaks, with smoothing only along the tucked sides.
  poly.use_smooth=abs(poly.center.x)>body_section(shield_fronts[k])[0]*.8
 # A few actual chipped cortical facets, concentrated at exposed corners.
 vv=[];ff=[]
 for i in range(across):
  if not (i<5 or i>across-6 or (i+k*3)%13==2):continue
  if (i*17+k*11)%5==0:continue
  base=len(vv);a0=.035+(math.pi-.07)*(i+.10)/across;a1=.035+(math.pi-.07)*(i+.78)/across
  depth=.012+.040*((i*7+k*3)%7)/6
  for u,a in [(1-depth,a0),(1-depth*.5,a1),(.999,a1),(.999,a0)]:
   x,y,z=armor_point(k,u,a);vv.append((x,y+.12,z))
  ff.append(tuple(base+j for j in range(4)))
 mesh('Corner_exposed_chitin_%02d'%k,vv,ff,worn,bu)
 # Recessed warm undercut follows the trailing edge and stays subordinate.
 pts=[armor_point(k,.98,.05+(math.pi-.10)*i/24,1) for i in range(25)]
 tube('Warm_shield_undercut_%02d'%k,pts,[1.0*(1-k*.035)]*25,cavity,bu,6)

# Organic cranial plan: unequal broad lobes, cambered shovel lip and a thick
# swept shoulder overlap. It has neither the old hood grooves nor trim rails.
head_sections=[(-66,52,32),(-39,63,38),(-13,69,41),(17,76,38),(48,77,32),(74,73,28),(95,66,24),(111,57,22)]
N=32;verts=[];faces=[]
def head_point(j,x,layer=0):
 z,w,h=head_sections[j];u=j/(len(head_sections)-1)
 camber=6.8*abs(x)**1.5
 lobe=(3.0*math.exp(-((x-.40)/.22)**2)+4.1*math.exp(-((x+.43)/.28)**2))*math.sin(u*math.pi)
 y=h-camber+lobe+.5*math.sin(x*11+u*9)*math.sin(u*math.pi)
 zz=z-(8+28*u**3)*abs(x)**1.55-16*(1-u)**3*(1-abs(x))
 thickness=5.2+4.0*abs(x)**1.4+2.0*(1-u)
 return (x*w*(1+.025*math.sin(u*4+x)),y-layer*thickness,zz)
for layer in range(2):
 for j in range(len(head_sections)):
  for i in range(N+1):verts.append(head_point(j,i/N*2-1,layer))
stride=len(head_sections)*(N+1)
for j in range(len(head_sections)-1):
 for i in range(N):
  a=j*(N+1)+i;q=(a,a+N+1,a+N+2,a+1);faces.extend([q,tuple(x+stride for x in reversed(q))])
for j in range(len(head_sections)-1):
 for i in [0,N]:
  a=j*(N+1)+i;faces.append((a,a+N+1,a+N+1+stride,a+stride))
for j in [0,len(head_sections)-1]:
 for i in range(N):
  a=j*(N+1)+i;faces.append((a,a+1,a+1+stride,a+stride))
mesh('Lobed_cambered_shovel_and_shoulder',verts,faces,shell,bu)
# Sparse small exposed corners, physically inset into a thick cut lip.
vv=[];ff=[]
for side in [-1,1]:
 for j in [3,6]:
  base=len(vv)
  for t,x in [(.24,side*.965),(.12,side),(.63,side),(.53,side*.98)]:
   p=Vector(head_point(j,x)).lerp(Vector(head_point(j+1,x)),t)
   vv.append((p.x,p.y+.12,p.z))
  ff.append(tuple(base+i for i in range(4)))
mesh('Sparse_shovel_corner_abrasion',vv,ff,worn,bu)
def head_underside(x,z):
 # Interpolate the authored cap so every filter root remains sheltered.
 for j in range(len(head_sections)-1):
  w0=head_sections[j][1];w1=head_sections[j+1][1]
  p0=head_point(j,max(-1,min(1,x/w0)),1);p1=head_point(j+1,max(-1,min(1,x/w1)),1)
  if z<=p1[2]:
   t=max(0,min(1,(z-p0[2])/(p1[2]-p0[2])))
   return p0[1]*(1-t)+p1[1]*t
 return head_point(len(head_sections)-1,max(-1,min(1,x/57)),1)[1]
def filter_point(x,y,z):
 # Root and lamella tips follow the curved lip, including its lateral sweep.
 nose=head_point(len(head_sections)-1,max(-1,min(1,x/57)),1)[2]-6
 z=min(z,nose)
 return (x,min(y,head_underside(x,z)-2),z)
# Broad, deep mouth cavity under the overhang; long curving filtering ribs
# fork at their sheltered roots instead of forming a straight tooth comb.
ellipsoid('Deep_recessed_filter_chamber',(0,-3,51),(57,7,47),cavity,bu,32,12)
ellipsoid('Ochre_subcranial_muscle',(0,-5,11),(61,15,52),flank,bu,28,10)
for side in [-1,1]:
 tube('Integrated_ventral_jaw',[(side*49,-4,78),(side*63,-7,64),(side*66,-10,36),(side*58,-8,1),(side*52,0,-25)],[3,4,5,7,10],flank,bu,10)
 for k in range(14):
  z=8+k*4.5;w=55+9*math.sin(k/13*math.pi)
  upper=head_underside(side*(w-11),z-7)-2
  points=[(side*(w-11),upper,z-7),(side*(w-4),upper-6,z-1),(side*(w+1),-1,z+5),(side*(w-3),-9,z+11)]
  points=[filter_point(*p) for p in points]
  tube('Curved_recessed_mineral_filter',points,[1.4,1.9,2.1,1.0],flank,bu,8)
  if k%3==1:
   points=[(side*(w-4),upper-6,z-1),(side*(w-9),upper-3,z+3),(side*(w-13),upper,z+6)]
   tube('Filter_root_bifurcation',[filter_point(*p) for p in points],[1.5,1.2,.8],flank,bu,7)
 # Diagonal basket across the rostral underside is visible in the forward breach.
 for k in range(7):
  x=side*(4+k*6.3);upper=head_underside(x,88)-3
  points=[(x,upper,88),(x+side*6,upper-7,80),(x+side*10,-6,67)]
  tube('Rostral_filter_basket',[filter_point(*p) for p in points],[.95,1.3,.8],flank,bu,7)
 # Protected, non-facial sensory aperture under the rear cranial cheek.
 ellipsoid('Protected_sensory_slit',(side*69,23,2),(1.8,1.0,4.0),cavity,bu,12,6)
 tube('Integrated_sensory_buttress',[(side*65,29,-14),(side*69,27,1),(side*71,23,17)],[4.8,3.9,2.8],shell,bu,9)
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
     # Broad concave centrum endplates with a thick retained cortical rim.
     cup=(q.x/40)**2+((q.y+23)/19)**2
     if cup<1 and abs(q.z)>16 and q.y<0:
      q.z-=math.copysign(8*(1-cup)**2*min(1,(abs(q.z)-16)/10),q.z)
     for x,y,z,r in cups:
      delta=q-Vector((x,y,z));distance=delta.length
      if distance<r*1.65 and distance>1e-6:
       q-=delta.normalized()*3.0*max(0,1-distance/(r*1.65))**2
     v.co=C(q)
   for poly in ob.data.polygons:poly.use_smooth=True
for rt in [sk,ve,*vertebra_variants]:
 verts=[];faces=[]
 if rt==sk:
  centers=[(side,z,0) for side in [-1,1] for z in [94,201,258]]
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
     p=Vector(cranial_point(t,a,1));p+=Vector((side*(layer*2.3+max(0,u)*1.8),0,0))
    else:
     y=d+u*length;t=max(0,min(1,(y+14)/82));x=side*(53+7*math.sin(t*math.pi))*(1-t*.17);z=-5+10*math.sin(t*2)
     radius=10-3*t+1.6*math.sin(t*18*.7)+layer*1.9+max(0,u)*1.4
     a=-math.pi/3+w*.43+math.sin(k*2.1+variant)*.13
     p=(x+side*radius*math.cos(a),y,z+radius*math.sin(a))
    verts.append(p)
  faces.extend([tuple(base+i for i in face) for face in [(0,5,4,3,2,1),(6,7,8,9,10,11),(0,1,7,6),(1,2,8,7),(2,3,9,8),(3,4,10,9),(4,5,11,10),(5,0,6,11)]])
 mesh(rt.name+'_Curved_chipped_cortical_layers',verts,faces,bone,rt)
# Existing remesh fracture variants occasionally retain degenerate polygons.
for rt in modules:
 for ob in rt.children:
  if ob.type=='MESH':ob.data.validate(clean_customdata=False)
# Broad sheltered mineral coloration is exported with the physical cortex.
# This shares the existing vertex-color path and adds no texture or draw pass.
for rt in [sk,ve,*vertebra_variants,ri,*variants]:
 for ob in rt.children:
  if ob.type!='MESH':continue
  colors=ob.data.color_attributes.get('Cortical_shelter') or ob.data.color_attributes.new(name='Cortical_shelter',type='FLOAT_COLOR',domain='CORNER')
  for poly in ob.data.polygons:
   for loop in poly.loop_indices:
    q=ob.data.vertices[ob.data.loops[loop].vertex_index].co;z=-q.y;y=q.z
    mineral=noise.noise(Vector((q.x*.044,z*.030,y*.075)),noise_basis='PERLIN_ORIGINAL')
    shade=.91+.22*mineral+.025*math.sin(y*.20+mineral*4)
    if rt==sk:
     t=max(0,min(1,z/300));rx=82+25*math.sin(math.pi*t)**.6;ry=75+10*math.sin(math.pi*t)
     if math.sqrt((q.x/rx)**2+((y-24)/ry)**2)<1.04:shade*=.72
    colors.data[loop].color=(shade,shade*(.96-.04*mineral),shade*(.90-.09*mineral),1)
# Baked matte plate wear and overlap occlusion, no new runtime texture family.
for ob in bu.children:
 if ob.type!='MESH':continue
 colors=ob.data.color_attributes.new(name='Grazer_mineral_wear',type='FLOAT_COLOR',domain='CORNER')
 for poly in ob.data.polygons:
  for loop in poly.loop_indices:
   q=ob.data.vertices[ob.data.loops[loop].vertex_index].co;z=-q.y
   broad=noise.noise(Vector((q.x*.036,z*.027,q.z*.055)),noise_basis='PERLIN_ORIGINAL')
   fine=noise.noise(Vector((q.x*.15,z*.11,q.z*.21)),noise_basis='PERLIN_ORIGINAL')
   mineral=max(0,min(1,(broad-.06)*3.2))
   shade=min(1,max(.22,.54+broad*.50+fine*.16))
   colors.data[loop].color=(shade*(1+.36*mineral),shade*(.92+.38*mineral),shade*(.79+.26*mineral),1)
scene=bpy.context.scene
scene['reference']='Fossils: scene-reference.png (2026-09-29). Living dune grazer: dune-grazer-approved-concept-v1.png, approved 2026-10-03 in chat 01a0fbba-9c8b-77f2-87e5-a9f79c300da0'
reference=bpy.data.images.load(str(SRC/'dune-grazer-approved-concept-v1.png'));reference.pack()
scene['grazer_motion']='Low +Z forward breach along a fixed Vista transect; delayed body emergence/dive, tail buried; once-per-lap runtime timestamp'
scene['authoring']='CPU modeled actual apertures, varied anatomical components, dune displacement, armor modules; animation is deterministic level-owned transform/deformation'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'leviathan-kit.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'leviathan-kit.glb'),export_format='GLB',use_selection=False,export_yup=True,export_apply=True,export_vertex_color='ACTIVE')
counts={rt.name:sum(len(o.data.polygons) for o in rt.children if o.type=='MESH') for rt in modules}
bounds={}
for rt in modules:
 points=[(v.co.x,v.co.z,-v.co.y) for ob in rt.children if ob.type=='MESH' for v in ob.data.vertices]
 bounds[rt.name]={'origin':'module authoring origin','boundsGame':{'min':[min(p[a] for p in points) for a in range(3)],'max':[max(p[a] for p in points) for a in range(3)]}}
bounds['skull'].update({'origin':'mouth floor center','clearHalfWidth':50,'overheadMinimum':70})
bounds['sandfall']['origin']='top fossil shelf'
bounds['burrower'].update({'origin':'shoulder root; head leads +Z, tail follows -Z','forward':'+Z','shieldCount':9,'reference':'assets/levels/saffron/dune-grazer-approved-concept-v1.png'})
files=[SRC/'dune-grazer-approved-concept-v1.png',SRC/'build_saffron.py',SRC/'leviathan-kit.blend',SRC/'scene-reference.png',SRC/'saffron-sky-v2.png',SRC/'sky-prompt-v2.txt',OUT/'leviathan-kit.glb',OUT/'saffron-sky-v2.png']
# Retain all provenance and future baker metadata when regenerating the kit.
manifest_path=SRC/'asset-manifest.json'
manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
files+= [ROOT/p for p in manifest.get('sha256',{})]
hashes=dict(manifest.get('sha256',{}))
hashes.update({str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.exists()})
manifest.update({'format':2,'gameAxes':'+X lateral, +Y up, +Z forward','modules':bounds,'polygonCounts':counts,'runtime':'/assets/levels/saffron/leviathan-kit.glb','sha256':hashes})
manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
print('SAFFRON ASSET COMPLETE',counts)
