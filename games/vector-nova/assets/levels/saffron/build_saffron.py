"""Saffron Leviathan authored asset kit. Run Blender --background --threads 4 --python this_file.
Game axes: +Y up, +Z forward, including the living grazer. Approved dune-grazer concept v1 guides its anatomy.
CPU modeling/export only; no renders. All visible forms are actual geometry.
"""
import bpy, math, random, json, hashlib
from mathutils import noise
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
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
 # The interior survey envelope stays fixed. Large, unequal outer anatomical
 # saddles replace the balloon-like continuous exterior without narrowing it.
 rostrum=48*math.exp(-((t-.13)/.21)**2)
 temporal=31*math.exp(-((t-.73)/.17)**2)
 brow=35*math.exp(-((t-.19)/.19)**2)
 occiput=28*math.exp(-((t-.88)/.13)**2)
 side=abs(math.cos(a))**3
 roof=max(0,math.sin(a))**2
 # Nasal relief and orbital buttresses grow within the same closed cortex.
 nasal=27*math.exp(-((a-math.pi/2-.08*math.sin(t*7))/.23)**2)*math.exp(-((t-.22)/.22)**2)
 sagittal=19*math.exp(-((a-math.pi/2)/.39)**2)*math.exp(-((t-.76)/.23)**2)
 asymmetry=1+.15*math.cos(a)*math.sin(t*7+.4)
 orbital=0
 for tt,aa in [(.30,.31),(.30,2.83),(.66,.29),(.66,2.83)]:
  radius=math.sqrt(((t-tt)/.18)**2+((a-aa)/.40)**2)
  orbital+=16*math.exp(-((radius-1)/.31)**2)
 channels=0
 for aa,tt,length,depth in [(.93,.55,.29,7.5),(2.12,.74,.23,6.5),(1.27,.30,.23,5.5)]:
  channels+=depth*math.exp(-((a-aa-.075*math.sin(t*8))/.075)**2)*math.exp(-((t-tt)/length)**4)
 x=(rx+layer*(14+(rostrum+temporal)*side*asymmetry+orbital-channels))*math.cos(a)*erosion
 y=24+(ry+layer*(13+(brow+occiput)*roof+nasal+sagittal+orbital*.6-channels))*math.sin(a)*erosion
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
# Large orbital, temporal and nasal fenestrae are unequal real openings through
# a deep cortex. A few secondary openings support the broad anatomy instead of
# sprinkling microscopic pores over an otherwise uninterrupted shell.
apertures=[(.29,.37,.175,.47),(.71,.31,.135,.42),(.34,2.77,.15,.52),(.73,2.85,.12,.45),(.51,1.57,.14,.53),(.88,1.61,.065,.55)]
pores=[(.14,.98,.042,.16),(.18,2.10,.037,.13),(.76,.99,.042,.15),(.80,2.13,.035,.17),(.94,.55,.026,.13)]
pores += [(.49,1.02,.095,.055),(.80,2.32,.066,.075)]
def aperture_radius(theta,seed):
 return 1+.10*math.sin(theta*3+seed*.8)+.055*math.cos(theta*5-seed*.37)
def hole(j,i):
 t=(j+.5)/R; a=(i+.5)*2*math.pi/N
 for seed,(center,angle,dt,da) in enumerate(apertures+pores):
  delta=(a-angle+math.pi)%(2*math.pi)-math.pi
  u=(t-center)/dt;w=delta/da
  if math.hypot(u,w)<aperture_radius(math.atan2(w,u),seed): return True
 return False
# Relax each through-aperture boundary onto its continuous ellipse before bevel.
# This retains the useful survey mesh but removes staircase-shaped cortical lips.
for j in range(1,R):
 for i in range(N):
  cells=[hole(j-1,(i-1)%N),hole(j-1,i),hole(j,(i-1)%N),hole(j,i)]
  if not any(cells) or all(cells):continue
  t=j/R;a=i*2*math.pi/N
  best=None
  for seed,(center,angle,dt,da) in enumerate(apertures+pores):
   delta=(a-angle+math.pi)%(2*math.pi)-math.pi
   r=math.hypot((t-center)/dt,delta/da)
   boundary=aperture_radius(math.atan2(delta/da,(t-center)/dt),seed)
   if best is None or abs(r-boundary)<best[0]:best=(abs(r-boundary),center,angle,dt,da,delta,r,boundary)
  _,center,angle,dt,da,delta,r,boundary=best
  if r<.08 or abs(r-boundary)>1.1:continue
  tt=center+(t-center)*boundary/r;aa=angle+delta*boundary/r
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
bevel=cranial.modifiers.new('Eroded rounded orbital and pore rims','BEVEL'); bevel.width=1.8; bevel.segments=3; bevel.limit_method='ANGLE'; bevel.angle_limit=.48
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
 # A broad, torn cheek process grows out of the temporal saddle. The unequal
 # posterior edge reads at racing distance while its root remains outboard.
 outline=[(104,28,171),(132,33,187),(158,59,211),(166,76,236),(151,80,248),(160,98,261),(139,105,280),(119,84,277),(110,58,232)]
 count=len(outline)
 vv=[(side*(x+layer*(8+3*math.sin(z*.033))),y+(side-1)*2,z+side*3*math.sin(y*.025)) for layer in range(2) for x,y,z in outline]
 ff=[tuple(range(count-1,-1,-1)),tuple(range(count,count*2))]+[(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
 mesh('Broken_temporal_cortical_blade',vv,ff,bone,sk)
 # Fewer, flattened hooked dental blades replace the identical cylindrical
 # pegs. Broad seated roots taper into unequal retained/broken enamel ends.
 for j in range(4):
  z=4+j*20+(5 if side<0 else 0);x=side*(78+5*math.sin(j*.9));y=39+7*math.sin(j*.7)
  length=[39,29,45,21][j if side>0 else 3-j]
  vertices=[];faces=[];rings=7;segments=12
  for k in range(rings):
   t=k/(rings-1);width=(10.8*(1-t)**.64+.5)*(1+.10*math.sin(j*2+k))
   for i in range(segments):
    a=i*2*math.pi/segments
    vertices.append((x-side*(6*t+4*t*t)+side*width*math.cos(a),y-length*t+width*.40*math.sin(a),z+12*t*t+width*.58*math.sin(a)))
  for k in range(rings-1):
   for i in range(segments):faces.append((k*segments+i,k*segments+(i+1)%segments,(k+1)*segments+(i+1)%segments,(k+1)*segments+i))
  faces.extend([tuple(range(segments-1,-1,-1)),tuple((rings-1)*segments+i for i in range(segments))])
  mesh('Hooked_dental_cortical_blade',vertices,faces,chalk,sk)
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
outline=[(-28,68,-8),(-31,91,-3),(-21,118,2),(-16,143,10),(-5,135,14),(0,148,18),(9,129,20),(23,109,19),(31,79,10)]
vv=[(x,y,z+layer*(4+8*max(0,(100-y)/32))) for layer in range(2) for x,y,z in outline]
count=len(outline);ff=[tuple(range(count-1,-1,-1)),tuple(range(count,count*2))]+[(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
mesh('Spinous_process_broken_neural_lamina',vv,ff,bone,ve)
tube('Neural_bridge',[(-54,65,0),(-29,76,4),(0,78,9),(30,74,5),(54,65,0)],[8,8,10,8,8],bone,ve,12)
for side in [-1,1]:
 ellipsoid('Prezygapophyseal_articular_facet',(side*43,7,-19),(12,7,15),bone,ve,16,10)
 # One heavy, forked articular lamina per side replaces a comb of small tubes.
 outline=[(43,-11,-25),(67,-1,-27),(83,17,-18),(78,33,-12),(65,29,-6),(68,45,3),(56,48,13),(47,30,21),(43,8,13)]
 count=len(outline)
 vv=[(side*x,y,z+layer*10) for layer in range(2) for x,y,z in outline]
 ff=[tuple(range(count-1,-1,-1)),tuple(range(count,count*2))]+[(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
 mesh('Forked_vertebral_articular_lamina',vv,ff,bone,ve)
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
 verts=[];faces=[];segments=20;rows=max(10,math.ceil((end-start)*58))
 def centerline(t):
  a=t*math.pi
  return Vector((-86*math.cos(a)+18*math.sin(a)**2,-21+131*math.sin(a)**.86+22*math.sin(a)*math.cos(a),36*math.sin(a*1.3+variant*.35)+12*t*t))
 for j in range(rows+1):
  t=start+(end-start)*j/rows;a=t*math.pi
  center=centerline(t)
  outward=Vector((-math.cos(a),math.sin(a),0));depth=Vector((0,0,1))
  twist=.50*math.sin(a*1.3+variant*.8);normal=outward*math.cos(twist)+depth*math.sin(twist)
  foreaft=depth*math.cos(twist)-outward*math.sin(twist)
  # Monumental costal blades have an expanded proximal body, a pinched neck,
  # a broad swept midshaft and a thinner distal return. The two axial grooves
  # cut actual broad faces rather than laying another tube over the surface.
  proximal=math.exp(-(t/.18)**2)
  midshaft=math.sin(a)**1.7
  fracture_flare=1
  if start>0:fracture_flare+=.30*math.exp(-((t-start)/.038)**2)
  if end<1:fracture_flare+=.38*math.exp(-((t-end)/.045)**2)
  width=(4.6+6.5*midshaft+16*proximal)*fracture_flare
  breadth=(8+20*proximal+16*midshaft)*(1+.12*math.sin(a*2+variant))*fracture_flare
  for i in range(segments):
   theta=2*math.pi*i/segments
   radial=math.cos(theta);edge=math.sin(theta)
   groove=(4.5+2*math.sin(a))*math.exp(-(radial/.26)**2)*midshaft
   shoulder=1+.15*math.cos(theta*3+variant*.3)*midshaft
   q=center+normal*(width*radial*shoulder)+foreaft*((breadth-groove)*math.copysign(abs(edge)**.72,edge))
   # Large torn cortical tabs are restricted to broken ends. The continuous
   # shaft keeps calm, broad anatomical surfaces and a readable silhouette.
   if (j==0 and start>0) or (j==rows and end<1):
    tangent=(centerline(min(1,t+.002))-centerline(max(0,t-.002))).normalized()
    q+=tangent*(3.3*math.sin(theta*3+variant)+1.8*math.cos(theta*5-variant))
   verts.append(tuple(q))
 for j in range(rows):
  for i in range(segments):faces.append((j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i))
 # A broken rib has a real thick annulus around a recessed cancellous floor.
 # Floor pockets and a few broad trabecular bridges are one closed surface,
 # with material changes on its actual faces, never an overlaid marrow decal.
 marrow_faces=[]
 def cancellous_surface(x,y):
  radius=math.hypot(x,y);edge=max(0,min(1,(1-radius)*5))
  pores=0
  for cx,cy,size,depth in [(-.34,.24,.29,3.3),(.31,.34,.24,2.7),(.20,-.38,.27,3.0)]:
   d=((x-cx)/size)**2+((y-cy)/size)**2
   if d<1:pores+=depth*(1-d)**2
  bridge=1.6*math.exp(-((x+.04-.16*y)/.12)**2)*(1-max(0,(abs(y)-.58)/.42))
  bridge+=1.2*math.exp(-((y+.05+.50*x)/.11)**2)*(1-max(0,(abs(x)-.55)/.45))
  return 4.8+edge*(pores-bridge),bridge*edge
 for j,fractured in [(0,start>0),(rows,end<1)]:
  if not fractured:
   faces.append(tuple(j*segments+i for i in (range(segments-1,-1,-1) if j==0 else range(segments))))
   continue
  center=Vector((0,0,0))
  for i in range(segments):center+=Vector(verts[j*segments+i])/segments
  t=start if j==0 else end
  tangent=(centerline(min(1,t+.002))-centerline(max(0,t-.002))).normalized()*(1 if j==0 else -1)
  base=len(verts);floor_coordinates={};floor_radii=[1,.78,.52,.25]
  for rho in floor_radii:
   for i in range(segments):
    theta=2*math.pi*i/segments;x=rho*math.cos(theta);y=rho*math.sin(theta)
    depth,_=cancellous_surface(x,y)
    radial=Vector(verts[j*segments+i])-center
    radial-=tangent*radial.dot(tangent)
    p=center+radial*(.68*rho)+tangent*depth
    floor_coordinates[len(verts)]=(x,y);verts.append(tuple(p))
  for i in range(segments):
   next_i=(i+1)%segments
   face=(j*segments+i,j*segments+next_i,base+next_i,base+i)
   faces.append(tuple(reversed(face)) if j==0 else face)
  def floor_face(face):
   x=sum(floor_coordinates[i][0] for i in face)/len(face)
   y=sum(floor_coordinates[i][1] for i in face)/len(face)
   if cancellous_surface(x,y)[1]<.65:marrow_faces.append(len(faces))
   faces.append(tuple(reversed(face)) if j==0 else face)
  for row in range(len(floor_radii)-1):
   for i in range(segments):
    a=base+row*segments+i;b=base+row*segments+(i+1)%segments
    floor_face((a,b,b+segments,a+segments))
  middle=len(verts);depth,_=cancellous_surface(0,0)
  verts.append(tuple(center+tangent*depth));floor_coordinates[middle]=(0,0)
  last=base+(len(floor_radii)-1)*segments
  for i in range(segments):floor_face((last+i,last+(i+1)%segments,middle))
 ob=mesh('Swept_costal_blade_with_deep_closed_fractures',verts,faces,bone,parent)
 if marrow_faces:
  ob.data.materials.append(seam)
  for index in marrow_faces:ob.data.polygons[index].material_index=1
def rib_root(parent,variant):
 ellipsoid('Enlarged_costal_articular_head',(-91,-24,6),(24,20,31),bone,parent,24,14)
 tube('Costal_neck_and_tubercle',[(-96,-28,8),(-101,-10,14),(-88,14,21)],[16,17,8],bone,parent,16)
 tube('Tapered_distal_costal_root',[(86,-20,-8),(91,-31,0),(99,-37,15)],[6,9,3],bone,parent,12)
rib_blade(ri,0,0,1);rib_root(ri,0)
variants=[]
for variant,ranges in enumerate([[(0,.61),(.90,1)],[(0,.28),(.41,1)]]):
 rr=root('rib_'+str(variant+1));variants.append(rr)
 for start,end in ranges:rib_blade(rr,variant+1,start,end)
 rib_root(rr,variant+1)
# Colossal shoulder/iliac plate for the ordinary excavation districts. A heavy
# socket grows into an unequal, folded cortical fan with actual fenestrae. Its
# broad planes and torn perimeter provide a different silhouette from arches.
scapula=root('scapula');SC_N=48;SC_R=48
scapula_fenestrae=[(-.43,.56,.20,.19),(.42,.69,.25,.135),(.04,.88,.15,.073)]
def scapula_point(u,t,layer):
 span=21+77*math.sin(t*math.pi*.65)**1.18
 center=-5+17*math.sin(t*2.4)-12*t*t
 x=center+span*u
 broken=(7*math.sin(u*6+.5)+4*math.sin(u*12-1))*t**7
 y=7+145*t-15*t**4*u+broken
 # A raised central spine forks into two broad saddles; deep lateral flutes
 # are sculpted into the cortex, not laid over it as decorative cylinders.
 ridge=16*math.exp(-((u-.12*math.sin(t*4))/.22)**2)*math.sin(t*math.pi*.87)
 flutes=7*math.exp(-((u+.43-.10*t)/.13)**2)+5*math.exp(-((u-.45+.08*t)/.16)**2)
 bowl=-11+24*u*u+7*math.sin(t*3.1)+ridge-flutes*math.sin(t*math.pi)
 thickness=9+11*(1-t)**3+4*math.exp(-(u/.28)**2)*(1-t)
 return (x,y,bowl+(layer-.5)*thickness)
def scapula_hole(j,i):
 u=(i+.5)*2/SC_N-1;t=(j+.5)/SC_R
 for seed,(cx,cy,rx,ry) in enumerate(scapula_fenestrae):
  x=(u-cx)/rx;y=(t-cy)/ry
  if math.hypot(x,y)<aperture_radius(math.atan2(y,x),seed+13):return True
 return False
v=[];f=[]
for layer in range(2):
 for j in range(SC_R+1):
  for i in range(SC_N+1):v.append(scapula_point(i*2/SC_N-1,j/SC_R,layer))
sc_stride=SC_N+1;sc_offset=(SC_R+1)*sc_stride
# Project aperture-edge vertices onto the same continuous irregular boundary
# used by the cell mask, avoiding stepped window edges in the large silhouette.
for j in range(1,SC_R):
 for i in range(1,SC_N):
  cells=[scapula_hole(j-1,i-1),scapula_hole(j-1,i),scapula_hole(j,i-1),scapula_hole(j,i)]
  if not any(cells) or all(cells):continue
  u=i*2/SC_N-1;t=j/SC_R;best=None
  for seed,(cx,cy,rx,ry) in enumerate(scapula_fenestrae):
   x=(u-cx)/rx;y=(t-cy)/ry;r=math.hypot(x,y)
   boundary=aperture_radius(math.atan2(y,x),seed+13)
   if best is None or abs(r-boundary)<best[0]:best=(abs(r-boundary),cx,cy,r,boundary)
  _,cx,cy,r,boundary=best
  if r<.08:continue
  uu=cx+(u-cx)*boundary/r;tt=cy+(t-cy)*boundary/r
  for layer in range(2):v[layer*sc_offset+j*sc_stride+i]=scapula_point(uu,tt,layer)
for j in range(SC_R):
 for i in range(SC_N):
  if scapula_hole(j,i):continue
  a=j*sc_stride+i;b=a+1;d=a+sc_stride;c=d+1
  f.extend([(a,d,c,b),(a+sc_offset,b+sc_offset,c+sc_offset,d+sc_offset)])
  if j==0 or scapula_hole(j-1,i):f.append((a,b,b+sc_offset,a+sc_offset))
  if j==SC_R-1 or scapula_hole(j+1,i):f.append((d,d+sc_offset,c+sc_offset,c))
  if i==0 or scapula_hole(j,i-1):f.append((a,a+sc_offset,d+sc_offset,d))
  if i==SC_N-1 or scapula_hole(j,i+1):f.append((b,c,c+sc_offset,b+sc_offset))
mesh('Folded_scapular_cortex_with_three_true_fenestrae',v,f,bone,scapula)
socket=ellipsoid('Heavy_scapular_articular_knuckle',(-5,7,0),(27,25,23),bone,scapula,28,18)
for vertex in socket.data.vertices:
 q=Vector((vertex.co.x,vertex.co.z,-vertex.co.y))
 disc=((q.x+5)/19)**2+((q.y-7)/18)**2
 if disc<1 and q.z<-8:q.z+=11*(1-disc)**2
 vertex.co=C(q)
ellipsoid('Scapular_worn_articular_facet',(-20,8,6),(11,13,15),chalk,scapula,18,12)
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
# Sandfall source: unequal broken costal blades carry a genuine eroded lip.
# These broad curved cortices replace the former freestanding pipe pillars.
sf=root('sandfall')
for variant,start,end,offset in [(3,0,.47,(-4,-77,12)),(4,.57,1,(3,-74,18))]:
 before=set(sf.children)
 rib_blade(sf,variant,start,end)
 for ob in set(sf.children)-before:
  for vertex in ob.data.vertices:
   q=(vertex.co.x,vertex.co.z,-vertex.co.y)
   vertex.co=C((q[0]*.52+offset[0],q[1]*.72+offset[1],q[2]*.54+offset[2]))
for side in [-1,1]:
 tube('Sandfall_broken_source_lamina',[(side*24,-3,16),(side*15,5,10),(side*7,1,1)],[8,9,3],bone,sf,16)
 # Wide uneven chipped corners seat the granular discharge in a bone channel.
 outline=[(side*3,2,-4),(side*12,5,-1),(side*19,4,8),(side*15,-1,14),(side*6,-3,8)]
 vv=[(x,y-layer*5,z) for layer in range(2) for x,y,z in outline]
 ff=[tuple(range(4,-1,-1)),tuple(range(5,10))]+[(i,(i+1)%5,(i+1)%5+5,i+5) for i in range(5)]
 mesh('Sandfall_chipped_discharge_lip',vv,ff,chalk,sf)
tube('Sandfall_continuous_cortical_saddle',[(-24,-4,18),(-12,3,14),(5,6,14),(23,1,20)],[7,10,8,6],bone,sf,16)
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
# The front shoulder proof established the seated construction. Apply it to all
# nine approved shields, preserving their analytic outer envelope and sweep.
GRAZER_SEATED_SHIELDS=set(range(9))
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
 seated=k in GRAZER_SEATED_SHIELDS
 verts=[];faces=[];across=24;rows=10 if seated else 6;corner_faces=[]
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
   a=j*(across+1)+i;b=a+across+1;face=(a,b,b+stride,a+stride)
   faces.append(tuple(reversed(face)) if seated and i==0 else face)
 for j in [0,rows]:
  for i in range(across):
   a=j*(across+1)+i;face=(a,a+1,a+1+stride,a+stride)
   if seated and j==rows and i in [0,across-1]:corner_faces.append(len(faces))
   faces.append(tuple(reversed(face)) if seated and j==rows else face)
 ob=mesh('Swept_integrated_chitin_shield_%02d'%k,verts,faces,shell,bu)
 for poly in ob.data.polygons:
  # Calm formed crown normals replace the folded broad polygons on the proof
  # assembly; the actual thick edge faces keep their sharp construction break.
  poly.use_smooth=poly.index<rows*across*2 if seated else abs(poly.center.x)>body_section(shield_fronts[k])[0]*.8
 if seated:
  # Wear belongs to the actual small cut corner faces, not bright offset quads
  # crossing the middle of an overlap. The flag survives material batching.
  wear=ob.data.attributes.new(name='Grazer_seated_corner',type='FLOAT',domain='CORNER')
  for index in corner_faces:
   for loop in ob.data.polygons[index].loop_indices:wear.data[loop].value=1
  # The old plate widths were evaluated before their longitudinal sweep, so a
  # uniform inset could float above the narrower body at the actual swept z.
  # This closed, dark flexible seating joins the inner plate perimeter to that
  # true body section, remaining inside the existing outer silhouette.
  perimeter=[(0,i) for i in range(across+1)]
  perimeter += [(j,across) for j in range(1,rows+1)]
  perimeter += [(rows,i) for i in range(across-1,-1,-1)]
  perimeter += [(j,0) for j in range(rows-1,0,-1)]
  band=[];count=len(perimeter)
  for layer in range(4):
   for j,i in perimeter:
    angle=.035+(math.pi-.07)*i/across
    outside=Vector(armor_point(k,j/rows,angle))
    inside=Vector(armor_point(k,j/rows,angle,1))
    w,h,c=body_section(inside.z)
    if layer==0:p=inside+(outside-inside)*.08
    elif layer==1:p=Vector((w*math.cos(angle)*.98,c+h*math.sin(angle)*.98,inside.z))
    elif layer==2:p=inside+(outside-inside)*.02
    else:p=Vector((w*math.cos(angle)*.95,c+h*math.sin(angle)*.95,inside.z))
    band.append(tuple(p))
  band_faces=[]
  for i in range(count):
   n=(i+1)%count
   band_faces.extend([(i,n,count+n,count+i),(count*2+i,count*3+i,count*3+n,count*2+n),
    (i,count*2+i,count*2+n,n),(count+i,count+n,count*3+n,count*3+i)])
  mesh('Seated_flexible_shoulder_overlap_%02d'%k,band,band_faces,cavity,bu)
 # A few actual chipped cortical facets, concentrated at exposed corners.
 vv=[];ff=[]
 for i in range(across):
  if seated:continue
  if not (i<5 or i>across-6 or (i+k*3)%13==2):continue
  if (i*17+k*11)%5==0:continue
  base=len(vv);a0=.035+(math.pi-.07)*(i+.10)/across;a1=.035+(math.pi-.07)*(i+.78)/across
  depth=.012+.040*((i*7+k*3)%7)/6
  for u,a in [(1-depth,a0),(1-depth*.5,a1),(.999,a1),(.999,a0)]:
   x,y,z=armor_point(k,u,a);vv.append((x,y+.12,z))
  ff.append(tuple(base+j for j in range(4)))
 if ff:mesh('Corner_exposed_chitin_%02d'%k,vv,ff,worn,bu)
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
modules=[sk,ve,*vertebra_variants,ri,*variants,scapula,du,dune_low,sf,out,out_shelf,bu]
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
# Geometry-derived cortical cavity light: the full anatomical module casts into
# a bounded cosine-weighted hemisphere around each actual mesh vertex. Keeping
# all material parts in one BVH includes the deep orbit walls, joint saddles and
# recessed fracture cups, without darkening exposed ivory with painted noise.
CORTICAL_AO_SAMPLES=16
CORTICAL_AO_RADIUS=36.0
CORTICAL_AO_OFFSET=.22
def cortical_cavity_visibility(rt):
 cortical_materials={bone.name,chalk.name,seam.name}
 objects=[ob for ob in rt.children if ob.type=='MESH' and any(material.name in cortical_materials for material in ob.data.materials)]
 inverse_root=rt.matrix_world.inverted()
 vertices=[];polygons=[];transforms={}
 for ob in objects:
  transform=inverse_root@ob.matrix_world;transforms[ob.name]=transform
  base=len(vertices)
  vertices.extend(transform@v.co for v in ob.data.vertices)
  polygons.extend(tuple(base+i for i in poly.vertices) for poly in ob.data.polygons)
 tree=BVHTree.FromPolygons(vertices,polygons,all_triangles=False,epsilon=.001)
 hemisphere=[]
 for i in range(CORTICAL_AO_SAMPLES):
  u=(i+.5)/CORTICAL_AO_SAMPLES;angle=i*2.399963229728653
  hemisphere.append((math.sqrt(u)*math.cos(angle),math.sqrt(u)*math.sin(angle),math.sqrt(1-u)))
 results={};rays=0;minimum=1;total=0;count=0
 for ob in objects:
  transform=transforms[ob.name];normal_transform=transform.to_3x3().inverted().transposed()
  values=[]
  for vertex in ob.data.vertices:
   position=transform@vertex.co;normal=normal_transform@vertex.normal
   if normal.length_squared<1e-12:
    values.append(1.0);continue
   normal.normalize()
   tangent=normal.cross(Vector((0,0,1)))
   if tangent.length_squared<.01:tangent=normal.cross(Vector((0,1,0)))
   tangent.normalize();bitangent=normal.cross(tangent).normalized()
   origin=position+normal*CORTICAL_AO_OFFSET;occluded=0
   for x,y,z in hemisphere:
    direction=tangent*x+bitangent*y+normal*z
    hit,_,_,distance=tree.ray_cast(origin,direction,CORTICAL_AO_RADIUS)
    if hit is not None:
     occluded+=max(0,1-(distance/CORTICAL_AO_RADIUS)**2)
    rays+=1
   values.append(max(.5,1-.60*occluded/CORTICAL_AO_SAMPLES))
  # Calm finite-ray transitions over connected cortex, retaining real holes
  # and material boundaries. This adds no smoothing across empty space.
  neighbors=[set() for _ in ob.data.vertices]
  for edge in ob.data.edges:
   a,b=edge.vertices;neighbors[a].add(b);neighbors[b].add(a)
  for _ in range(2):
   values=[value*.6+.4*sum(values[j] for j in neighbors[i])/len(neighbors[i]) if neighbors[i] else value for i,value in enumerate(values)]
  results[ob.name]=values
  if values:minimum=min(minimum,min(values));total+=sum(values);count+=len(values)
 print('SAFFRON CORTICAL CAVITY',rt.name,'vertices',count,'rays',rays,'visibility',round(minimum,3),round(total/max(1,count),3))
 return results

# Broad sheltered mineral coloration and physical cavity visibility share the
# existing vertex-color path, with no runtime texture, light or draw pass.
bpy.context.view_layer.update()
for rt in [sk,ve,*vertebra_variants,ri,*variants,scapula,sf]:
 cavity_visibility=cortical_cavity_visibility(rt)
 for ob in rt.children:
  if ob.type!='MESH' or ob.name not in cavity_visibility:continue
  colors=ob.data.color_attributes.get('Cortical_shelter') or ob.data.color_attributes.new(name='Cortical_shelter',type='FLOAT_COLOR',domain='CORNER')
  for poly in ob.data.polygons:
   for loop in poly.loop_indices:
    vertex_index=ob.data.loops[loop].vertex_index
    q=ob.data.vertices[vertex_index].co;z=-q.y;y=q.z
    mineral=noise.noise(Vector((q.x*.044,z*.030,y*.075)),noise_basis='PERLIN_ORIGINAL')
    shade=.91+.22*mineral+.025*math.sin(y*.20+mineral*4)
    if rt==sk:
     t=max(0,min(1,z/300));rx=82+25*math.sin(math.pi*t)**.6;ry=75+10*math.sin(math.pi*t)
     if math.sqrt((q.x/rx)**2+((y-24)/ry)**2)<1.04:shade*=.72
    shade*=cavity_visibility[ob.name][vertex_index]
    colors.data[loop].color=(shade,shade*(.96-.04*mineral),shade*(.90-.09*mineral),1)
# Baked matte plate wear and overlap occlusion, no new runtime texture family.
for ob in bu.children:
 if ob.type!='MESH':continue
 colors=ob.data.color_attributes.new(name='Grazer_mineral_wear',type='FLOAT_COLOR',domain='CORNER')
 seated_corner=ob.data.attributes.get('Grazer_seated_corner')
 for poly in ob.data.polygons:
  for loop in poly.loop_indices:
   q=ob.data.vertices[ob.data.loops[loop].vertex_index].co;z=-q.y
   broad=noise.noise(Vector((q.x*.036,z*.027,q.z*.055)),noise_basis='PERLIN_ORIGINAL')
   fine=noise.noise(Vector((q.x*.15,z*.11,q.z*.21)),noise_basis='PERLIN_ORIGINAL')
   mineral=max(0,min(1,(broad-.06)*3.2))
   shade=min(1,max(.22,.54+broad*.50+fine*.16))
   if seated_corner:shade*=1+.45*seated_corner.data[loop].value
   colors.data[loop].color=(shade*(1+.36*mineral),shade*(.92+.38*mineral),shade*(.79+.26*mineral),1)
scene=bpy.context.scene
scene['reference']='Fossils: scene-reference.png (2026-09-29). Living dune grazer: dune-grazer-approved-concept-v1.png, approved 2026-10-03 in chat 01a0fbba-9c8b-77f2-87e5-a9f79c300da0'
reference=bpy.data.images.load(str(SRC/'dune-grazer-approved-concept-v1.png'));reference.pack()
scene['grazer_motion']='Low +Z forward breach along a fixed Vista transect; delayed body emergence/dive, tail buried; once-per-lap runtime timestamp'
scene['authoring']='CPU modeled actual apertures, varied anatomical components, dune displacement, armor modules; animation is deterministic level-owned transform/deformation'
scene['cortical_cavity_bake']='Per-module geometry BVH; 16 cosine-weighted hemisphere rays per vertex, 36 m radius, 0.22 m normal offset, two connected-vertex smoothing passes; cavity visibility multiplied into cortical vertex colors, including scapula and sandfall bone. Grazer and sandfall flow sheets excluded.'
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
