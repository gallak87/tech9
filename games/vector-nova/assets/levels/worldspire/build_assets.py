"""Editable Worldspire monolith and interior kit.
Run Blender with --background --factory-startup --python this_file -- <app-root>.
The route-source.json is exported from the current CPU route, not hand-drawn.
"""
import bpy, bmesh, math, json, sys, random
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(sys.argv[sys.argv.index('--')+1]).resolve()
SRC=ROOT/'assets/levels/worldspire'; OUT=ROOT/'public/assets/levels/worldspire'
OUT.mkdir(parents=True,exist_ok=True)
route=json.loads((SRC/'route-source.json').read_text())
HEIGHT=route['spireHeight']
def spire_radius(y):return 90+1000*max(0,1-(y+300)/(HEIGHT+300))**1.25
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
rng=random.Random(401)
def xyz(p): return (p[0],-p[2],p[1])
def mat(name,color,rough=.5,metal=0,emit=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
 p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emit
 return m
obsidian=mat('Worldspire / fluted obsidian',(.3,.13,.19),.42,.28)
fracture=mat('Worldspire / copper mineral fracture',(.33,.19,.16),.62,.24)
bronze=mat('Worldspire / interior bronze ribs',(.35,.21,.10),.36,.73)
ivory=mat('Worldspire / pale portal stone',(.32,.35,.33),.59,.08)
calm=mat('Worldspire / calm exposed mineral',(.27,.25,.25),.62,.14)
cavity=mat('Worldspire / calm cavity mineral',(.29,.22,.23),.69,.10)
structural=mat('Worldspire / rough root mineral',(.105,.075,.085),.83,.035)
glow=mat('Worldspire / mineral light inclusions',(.12,.42,.34),.4,.18,.65)
warm_glow=mat('Worldspire / amber core inclusions',(.65,.22,.055),.5,.12,.7)
gate_glow=mat('Worldspire / root mineral inclusions',(.18,.42,.35),.5,.28,.25)
def mesh(name,vs,faces,material):
 data=bpy.data.meshes.new(name);data.from_pydata([xyz(v) for v in vs],[],faces);data.update()
 o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.data.materials.append(material)
 bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
 return o
# Large flutes are real continuous mineral structure, with unequal summit fins.
N=112; H=96; verts=[]
for row in range(H+1):
 y=-300+row*(HEIGHT+300)/H
 base=spire_radius(y)
 for col in range(N):
  a=col*math.tau/N
  flute=1+.065*math.cos(a*13+.00007*y)+.035*math.cos(a*29-.00011*y)
  shoulder=12*math.sin(y*.003+a*5)+7*math.sin(y*.009+a*9)
  r=base*flute+shoulder
  verts.append((r*math.cos(a),y,r*math.sin(a)))
faces=[]
for row in range(H):
 for c in range(N):
  k=row*N+c;j=row*N+(c+1)%N
  faces.append((k,j,j+N,k+N))
faces += [tuple(reversed(range(N))),tuple(H*N+c for c in range(N))]
spire=mesh('Worldspire / colossal mineral monolith',verts,faces,obsidian)
spire.data.materials.append(fracture);spire.data.materials.append(cavity)
for poly in spire.data.polygons:
 if poly.index%N in [2,8,19,31,49,61,76,95]:poly.material_index=1
# Separate, genuinely open bores preserve the contrast between the upper heart
# and the much taller lower vault. Neither portal is painted onto a solid wall.
passage_samples=[]
for passage in route['interiors']:
 samples=[s for s in route['samples'] if passage['start']-570<=s['s']<=passage['end']+700]
 vault=passage['id']=='vault'; passage_samples.append((passage,samples))
 cv=[];cs=32;rx=120 if vault else 116;ry=248 if vault else 150;lift=100 if vault else 64
 for i,sample in enumerate(samples):
  p=Vector(sample['p']);t=Vector(sample['t']);right=Vector((0,1,0)).cross(t).normalized();up=t.cross(right).normalized();center=p+up*lift
  for k in range(cs):
   a=k*math.tau/cs;radius=1+.04*math.sin(i*.17+k*1.7)
   q=center+right*(rx*math.cos(a)*radius)+up*(ry*math.sin(a)*radius)
   cv.append(tuple(q))
 cf=[]
 for i in range(len(samples)-1):
  for k in range(cs):cf.append((i*cs+k,i*cs+(k+1)%cs,(i+1)*cs+(k+1)%cs,(i+1)*cs+k))
 cf += [tuple(reversed(range(cs))),tuple((len(samples)-1)*cs+k for k in range(cs))]
 cutter=mesh(passage['id']+' / authored cavity cutter',cv,cf,obsidian)
 cutter.data.materials.append(fracture);cutter.data.materials.append(cavity)
 for face in cutter.data.polygons:face.material_index=2
 bpy.context.view_layer.objects.active=spire
 cut=spire.modifiers.new(passage['id']+' / open mineral passage','BOOLEAN');cut.operation='DIFFERENCE';cut.solver='EXACT';cut.use_self=vault;cut.object=cutter
 if hasattr(cut,'material_mode'):cut.material_mode='INDEX'
 bpy.ops.object.modifier_apply(modifier=cut.name);bpy.data.objects.remove(cutter,do_unlink=True)
 spire.data.validate(verbose=False,clean_customdata=False)
 print('PASSAGE',passage['id'],'polygons',len(spire.data.polygons))
 assert len(spire.data.polygons)>10000, 'Passage boolean lost the monolith exterior'
# The lower crossing opens into a huge vertical chamber at its actual flight.
echo=next(j for j in route['jumps'] if j['id']=='echo-chasm')
shaft_sample=min(route['samples'],key=lambda s:abs(s['s']-(echo['takeoff']+270)))
shaft_center=Vector(shaft_sample['p']);shaft_center.y+=120
bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=245,depth=1100,location=xyz(shaft_center))
shaft=bpy.context.object;shaft.name='Echo / vertical chamber cutter'
for m in [obsidian,fracture,cavity]:shaft.data.materials.append(m)
for face in shaft.data.polygons:face.material_index=2
bpy.context.view_layer.objects.active=spire
cut=spire.modifiers.new('Echo / deep resonant chamber','BOOLEAN');cut.operation='DIFFERENCE';cut.solver='EXACT';cut.use_self=True;cut.object=shaft
if hasattr(cut,'material_mode'):cut.material_mode='INDEX'
bpy.ops.object.modifier_apply(modifier=cut.name);bpy.data.objects.remove(shaft,do_unlink=True)
spire.data.validate(verbose=False,clean_customdata=False)
print('SHAFT polygons',len(spire.data.polygons))
for face in spire.data.polygons:
 if face.material_index==2:face.use_smooth=True
# Mineral crystal fins at the summit; their narrow profiles break the cone.
def blade(name,center,rad,height,material):
 x,y,z=center;vs=[]
 for yy,rr in [(0,rad),(.82*height,rad*.42),(height,rad*.08)]:
  for k in range(5):
   a=k*math.tau/5;vs.append((x+rr*math.cos(a),y+yy,z+rr*math.sin(a)))
 fs=[tuple(reversed(range(5))),tuple(range(10,15))]
 for row in range(2):
  for k in range(5):fs.append((row*5+k,row*5+(k+1)%5,(row+1)*5+(k+1)%5,(row+1)*5+k))
 o=mesh(name,vs,fs,material)
 if material in [glow,warm_glow,gate_glow]:
  o.data.materials.append(fracture)
  for poly in o.data.polygons:
   if poly.index%5 in [1,2]:poly.material_index=1
 return o
for i in range(16):
 a=i*math.tau/16;r=190+rng.random()*70
 blade('Crown / grown mineral blade %02d'%i,(r*math.cos(a),HEIGHT-1120+rng.random()*400,r*math.sin(a)),48+rng.random()*45,450+rng.random()*700,obsidian if i%3 else fracture)
# Asymmetric buttresses are built around the revised slalom. Their roots grow
# from the monolith well below the road; narrow crowns frame, never fill, a turn.
for index,station in enumerate([route['length']*f for f in [.012,.036,.08,.174,.209,.248,.365,.407,.506,.546,.578,.621,.786,.855,.888,.942]]):
 s=min(route['samples'],key=lambda v:abs(v['s']-station))
 p=Vector(s['p']);t=Vector(s['t']);right=Vector((0,1,0)).cross(t).normalized()
 side=-1 if index%2==0 else 1
 crown=p+right*(side*(118+index%3*13))
 root=Vector((crown.x*.58,max(-270,p.y-1550),crown.z*.58))
 vs=[];count=7
 layers=[(root,185),(crown+Vector((0,-220,0)),54),
         (crown+Vector((0,150+index%3*70,0)),39),
         (crown+Vector((side*17,510+index%4*75,-side*21)),5)]
 for center,radius in layers:
  for k in range(count):
   a=math.tau*k/count+index*.41
   vs.append(tuple(center+Vector((math.cos(a)*radius,0,math.sin(a)*radius))))
 fs=[tuple(reversed(range(count))),tuple(range((len(layers)-1)*count,len(layers)*count))]
 for layer in range(len(layers)-1):
  for k in range(count):fs.append((layer*count+k,layer*count+(k+1)%count,(layer+1)*count+(k+1)%count,(layer+1)*count+k))
 buttress=mesh('Slalom / rooted mineral buttress %02d'%index,vs,fs,obsidian)
 buttress.data.materials.append(fracture)
 for poly in buttress.data.polygons:
  if poly.index%7==index%7:poly.material_index=1
# Full-width architectural ribs remain outside a 115 m clear passage.
def arc_rib(s,index,rx,ry,thick,material,lift=64):
 p=Vector(s['p']);t=Vector(s['t']);r=Vector((0,1,0)).cross(t).normalized();u=t.cross(r).normalized();center=p+u*lift
 vs=[];steps=28
 for k in range(steps+1):
  a=-.12+3.38*k/steps
  for radial,z in [(0,-thick),(5,-thick),(0,thick),(5,thick)]:
   q=center+r*((rx+radial)*math.cos(a))+u*((ry+radial)*math.sin(a))+t*z;vs.append(tuple(q))
 fs=[]
 for k in range(steps):
  n=k*4;fs.extend([(n,n+4,n+5,n+1),(n+2,n+3,n+7,n+6),(n,n+2,n+6,n+4),(n+1,n+5,n+7,n+3)])
 fs.extend([(0,1,3,2),(steps*4,steps*4+2,steps*4+3,steps*4+1)])
 return mesh('Heart / rib %02d'%index,vs,fs,material)
for passage,samples in passage_samples:
 vault=passage['id']=='vault'
 for i,sample in enumerate(samples[::22]):
  p0=sample['p'];radial=math.hypot(p0[0],p0[2]);radius_at_passage=spire_radius(p0[1])
  if radial>radius_at_passage-75:continue
  arc_rib(sample,(100 if vault else 0)+i,110 if vault else 107,235 if vault else 140,3.3 if vault else 2.2,bronze,100 if vault else 64)
  for side in [-1,1]:
   p=Vector(sample['p']);t=Vector(sample['t']);r=Vector((0,1,0)).cross(t).normalized()
   p+=r*(side*99);p.y+=60 if vault else 35
   blade(passage['id']+' / seated mineral light %d %d'%(i,side),tuple(p-Vector((0,7,0))),9 if vault else 6,41 if vault else 25,obsidian)
   blade(passage['id']+' / light crystal %d %d'%(i,side),tuple(p),5 if vault else 3.5,36 if vault else 19,warm_glow if vault else glow)
# Tall mineral teeth reveal the depth of the Echo chamber without crossing the
# jump corridor. Roots and crowns stay against its far walls.
for i in range(12):
 a=i*math.tau/12
 center=shaft_center+Vector((210*math.cos(a),-330,210*math.sin(a)))
 # Keep the entire crystal outside the sampled flight/road envelope.
 if min(math.hypot(center.x-s['p'][0],center.z-s['p'][2]) for s in route['samples'] if abs(s['s']-echo['takeoff'])<800)<75:continue
 height=610+rng.random()*150
 blade('Echo / chamber mineral organ %02d'%i,tuple(center),12,height,fracture)
 if i%3==0:
  inset=center-Vector((math.cos(a),0,math.sin(a)))*11+Vector((0,18,0))
  blade('Echo / recessed amber organ vein %02d'%i,tuple(inset),2.6,height*.91,warm_glow)
# The final destination is a constructed gate on the exposed roots. These
# arches and the broad under-deck terrace follow the real sloping road frames.
for i,offset in enumerate([-100,0,110]):
 sample=min(route['samples'],key=lambda s:abs(s['s']-(route['finish']+offset)))
 arc_rib(sample,200+i,73+i*4,120-i*12,5,bronze,38)
 arc_rib(sample,220+i,80+i*4,127-i*12,7,obsidian,38)
 # Segmented pale voussoirs seat the fine bronze inner reveal.
 gp=Vector(sample['p']);gt=Vector(sample['t']);gr=Vector((0,1,0)).cross(gt).normalized();gu=gt.cross(gr).normalized();gc=gp+gu*38
 for k in range(6):
  a0=.035+k*3.07/6;a1=a0+3.07/6-.013;vs=[];steps=6
  for j in range(steps+1):
   a=a0+(a1-a0)*j/steps
   for rx,ry,z in [(79+i*4,126-i*12,-8),(90+i*4,138-i*12,-8),(90+i*4,138-i*12,8),(79+i*4,126-i*12,8)]:
    vs.append(tuple(gc+gr*(rx*math.cos(a))+gu*(ry*math.sin(a))+gt*z))
  fs=[(3,2,1,0),tuple(steps*4+j for j in range(4))]
  for j in range(steps):
   for v in range(4):fs.append((j*4+v,j*4+(v+1)%4,(j+1)*4+(v+1)%4,(j+1)*4+v))
  mesh('Root Gate / fitted curved mineral crown %d %d'%(i,k),vs,fs,ivory)
 for side in [-1,1]:
  p=Vector(sample['p'])+Vector(sample['right'])*(side*83)
  blade('Root Gate / mineral crown %d %d'%(i,side),tuple(p),7,150-i*15,gate_glow if i==1 else fracture)
  t=Vector(sample['t']);r=Vector((0,1,0)).cross(t).normalized();u=t.cross(r).normalized();center=Vector(sample['p'])+r*(side*(73+i*4)*.993)
  vs=[];rings=[(-42,29,23),(-17,26,20),(0,20,15),(29,13,11),(44,13,11)]
  for y,w,d in rings:
   for k in range(8):
    a=k*math.tau/8+math.pi/8;vs.append(tuple(center+r*(math.cos(a)*w)+u*y+t*(math.sin(a)*d)))
  fs=[tuple(reversed(range(8))),tuple(range(32,40))]
  for h in range(4):
   for k in range(8):fs.append((h*8+k,h*8+(k+1)%8,(h+1)*8+(k+1)%8,(h+1)*8+k))
  mesh('Root Gate / flared rooted mineral pier %d %d'%(i,side),vs,fs,obsidian)
  # Bronze collar is built into the pier, below the narrow arch foot.
  for k in range(8):
   a=k*math.tau/8+math.pi/8
   q=center+r*(math.cos(a)*14)+u*24+t*(math.sin(a)*12)
   blade('Root Gate / inset bronze pier key %d %d %d'%(i,side,k),tuple(q),1.2,12,bronze)
terrace=[s for s in route['samples'] if s['s']>=route['finish']-250]
vs=[]
for sample in terrace:
 p=Vector(sample['p']);r=Vector(sample['right']);u=Vector(sample['up'])
 for x,y in [(-100,-17),(100,-17),(100,-88),(-100,-88)]:vs.append(tuple(p+r*x+u*y))
fs=[]
for i in range(len(terrace)-1):
 for k in range(4):fs.append((i*4+k,i*4+(k+1)%4,(i+1)*4+(k+1)%4,(i+1)*4+k))
fs.extend([(3,2,1,0),tuple((len(terrace)-1)*4+k for k in range(4))])
mesh('Root Gate / mineral landing terrace',vs,fs,fracture)
# Layered retaining lips run below the driving plane and join the piers.
for side in [-1,1]:
 for band,(x,y,w,h) in enumerate([(96,-12,11,7),(108,-34,14,8),(99,-70,10,9)]):
  vv=[]
  for sample in terrace:
   p=Vector(sample['p']);r=Vector(sample['right']);u=Vector(sample['up'])
   for xx,yy in [(-w,-h),(w,-h),(w,h),(-w,h)]:vv.append(tuple(p+r*(side*x+xx)+u*(y+yy)))
  ff=[]
  for k in range(len(terrace)-1):
   for v in range(4):ff.append((k*4+v,k*4+(v+1)%4,(k+1)*4+(v+1)%4,(k+1)*4+v))
  ff.extend([(3,2,1,0),tuple((len(terrace)-1)*4+k for k in range(4))])
  mesh('Root Gate / layered terrace retaining lip %d %d'%(side,band),vv,ff,bronze if band==1 else obsidian)

# Editable grown mineral valve used by the level's instanced resonance wake.
# Kept as a hidden source object; the static environment/collision exclude it.
vs=[]
for y,w,depth in [(-150,4,7),(-90,16,13),(20,20,20),(105,12,11),(150,3,5)]:
 for x,z in [(-w,-8),(w,-8),(w*.85,depth),(-w*.75,depth*.8)]:vs.append((x,y,z))
fs=[(3,2,1,0),tuple(range(16,20))]
for i in range(4):
 for k in range(4):fs.append((i*4+k,i*4+(k+1)%4,(i+1)*4+(k+1)%4,(i+1)*4+k))
valve=mesh('SOURCE / grown resonance valve',vs,fs,fracture)
valve.hide_render=True
# Broad root buttresses continue the monolith into the finish terrace. Their
# tapered outer tips stay outside the full driving and camera envelope.
for index,offset in enumerate([-220,40,280]):
 f=min(route['samples'],key=lambda s:abs(s['s']-(route['finish']+offset)))
 p=Vector(f['p']);r=Vector(f['right']);t=Vector(f['t']);u=Vector(f['up'])
 for side in [-1,1]:
  tip=p+r*(side*(136+index*18))-u*50
  root=Vector((tip.x*.65,p.y-190,tip.z*.65));vs=[]
  for center,w,h in [(root,95,170),(root.lerp(tip,.55),56,95),(tip,18,28)]:
   for lateral,vertical in [(-w,0),(w,0),(w*.55,h),(-w*.55,h)]:vs.append(tuple(center+t*lateral+u*vertical))
  fs=[(3,2,1,0),(8,9,10,11)]
  for row in range(2):
   for k in range(4):fs.append((row*4+k,row*4+(k+1)%4,(row+1)*4+(k+1)%4,(row+1)*4+k))
  vs=[(x,y-80,z) for x,y,z in vs]
  check=BVHTree.FromPolygons([Vector(v) for v in vs],fs,all_triangles=False)
  if any((hit:=check.find_nearest(Vector(f['p']))) and hit[3]<50 for f in route['samples'] if not f['gap']):continue
  root_mesh=mesh('Root Gate / grown terrace buttress %d %d'%(index,side),vs,fs,structural)
  root_mesh.data.materials.append(calm)
  for face in root_mesh.data.polygons:
   if face.index in [4,8]:face.material_index=1
# The deliberately constructed portal/gate transitions have real shallow arrises.
for o in list(bpy.context.scene.objects):
 if o.type=='MESH' and ('Root Gate / flared' in o.name or 'fitted curved' in o.name or 'Heart / rib' in o.name):
  bpy.context.view_layer.objects.active=o
  bevel=o.modifiers.new('Fitted mineral arris','BEVEL');bevel.width=.7;bevel.segments=2;bevel.limit_method='ANGLE';bevel.angle_limit=.45
  bpy.ops.object.modifier_apply(modifier=bevel.name)
for o in list(bpy.context.scene.objects):
 if o.type=='MESH' and 'Root Gate / flared' in o.name:
  o.data.materials.clear();o.data.materials.append(calm);o.data.materials.append(structural)
  for face in o.data.polygons:
   if face.normal.z<-.2:face.material_index=1
# UVs use real metre scale, shared by texture/bump in Three.js.
for o in list(bpy.context.scene.objects):
 if o.type!='MESH':continue
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
 o.data.validate(verbose=False,clean_customdata=False)
 # Boolean cutters can contribute an empty UVMap; export only the authored metre UVs.
 for layer in list(o.data.uv_layers):o.data.uv_layers.remove(layer)
 uv=o.data.uv_layers.new(name='Mineral metres')
 for poly in o.data.polygons:
  axis=max(range(3),key=lambda i:abs(poly.normal[i]))
  for li in poly.loop_indices:
   v=o.data.vertices[o.data.loops[li].vertex_index].co
   uv.data[li].uv=((v.y if axis==0 else v.x)/65,(v.y/65 if axis==2 else v.z/65))
# Retain the Blender-authored valve mesh as a small instancing source.
valve.data.calc_loop_triangles()
valve_positions=[];valve_uv=[]
for tri in valve.data.loop_triangles:
 for li in tri.loops:
  co=valve.data.vertices[valve.data.loops[li].vertex_index].co
  valve_positions.extend([co.x,co.z,-co.y]);valve_uv.extend(valve.data.uv_layers.active.data[li].uv)
(SRC/'resonance-kit.json').write_text(json.dumps({'positions':valve_positions,'uv':valve_uv},separators=(',',':')))
# Combine static meshes by material to keep large-distance draw counts small.
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
 if obj.type=='MESH' and obj!=valve:obj.select_set(True)
bpy.context.view_layer.objects.active=spire;bpy.ops.object.join()
valve.hide_set(True)
world=bpy.context.object;world.name='Worldspire / editable monolith and heart'
world.data.validate(verbose=False,clean_customdata=False);world.data.update()
# Bake contact occlusion, not lighting: retain a clean mineral finish while
# cavities, clasp seats and sheltered fracture faces have believable depth.
bpy.context.view_layer.update()
bvh=BVHTree.FromObject(world,bpy.context.evaluated_depsgraph_get())
shade=world.data.color_attributes.new(name='Contact occlusion',type='BYTE_COLOR',domain='CORNER')
cache={}
for poly in world.data.polygons:
 for li in poly.loop_indices:
  vi=world.data.loops[li].vertex_index
  normal=(world.data.vertices[vi].normal if poly.use_smooth else poly.normal).normalized();tangent=normal.cross(Vector((0,0,1)))
  if tangent.length<.01:tangent=normal.cross(Vector((0,1,0)))
  tangent.normalize();bitangent=normal.cross(tangent)
  rays=[normal,(normal+tangent*.9).normalized(),(normal-tangent*.9).normalized(),(normal+bitangent*.9).normalized(),(normal-bitangent*.9).normalized()]
  key=(vi,round(normal.x,2),round(normal.y,2),round(normal.z,2))
  if key not in cache:
   origin=world.data.vertices[vi].co+normal*.45;occlusion=0
   for ray in rays:
    hit=bvh.ray_cast(origin,ray,120)
    if hit[0] is not None:occlusion+=.2*(1-hit[3]/120)
   cache[key]=1-.52*occlusion
  value=cache[key];shade.data[li].color=(value,value,value,1)
print('CONTACT SHADE',len(cache),'samples')
bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'worldspire-environment.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'worldspire-environment.glb'),export_format='GLB',use_selection=True,export_yup=True,export_materials='EXPORT',export_vertex_color='NAME',export_vertex_color_name='Contact occlusion',export_all_vertex_colors=False,export_cameras=False,export_lights=False,export_animations=False)
# Export the actual triangulated solids with GLTF's Y-up coordinate convention.
world.data.calc_loop_triangles()
v=[world.matrix_world@p.co for p in world.data.vertices]
positions=[[p.x,p.z,-p.y] for p in v]
indices=[i for t in world.data.loop_triangles for i in t.vertices]
collision={'positions':positions,'indices':indices,'id':'worldspire-monolith-and-heart'}
(SRC/'collision-kit.json').write_text(json.dumps(collision,separators=(',',':')))
(SRC/'model-provenance.json').write_text(json.dumps({'generator':'Blender 5.1.1 / project-authored deterministic script','source':'worldspire-environment.blend','runtime':'worldspire-environment.glb','triangles':len(indices)//3,'geometry':'Full monolith with two open twisting passages, a vertical Echo chamber, rooted slalom buttresses and Root Gate terrace; matching exported collision triangles','materials':'Original geometry/materials, contact-occlusion vertex colors, fitted Root Gate masonry and hidden editable resonance valve source; generated mineral-v2 texture recorded separately','seed':401},indent=2)+'\n')
print('WORLDspire exported',len(indices)//3,'triangles')
