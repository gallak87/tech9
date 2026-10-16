"""Editable occupied stormwater city, authored against the production route.
Blender --background --factory-startup --python this_file -- <app-root>
"""
import bpy,bmesh,math,json,sys,random,gzip,shutil,hashlib,runpy
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(sys.argv[sys.argv.index('--')+1]).resolve();SRC=ROOT/'assets/levels/nightweir';OUT=ROOT/'public/assets/levels/nightweir';OUT.mkdir(parents=True,exist_ok=True)
route=json.loads((SRC/'route-source.json').read_text());samples=route['samples'];rng=random.Random(773)
bpy.context.preferences.filepaths.save_version=0;bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def xyz(p):return (p[0],-p[2],p[1])
def material(name,color,rough=.65,metal=0,emit=0):
 m=bpy.data.materials.new('Nightweir / '+name);m.use_nodes=True;m.diffuse_color=(*color,1);p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emit;return m
concrete=material('weathered precast',(.32,.38,.39),.85)
aggregate=material('damp retaining stone',(.15,.20,.22),.9)
bedrock=material('wet gorge bedrock',(.17,.20,.19),.96)
steel=material('oxide machinery',(.28,.11,.055),.48,.63)
enamel=material('sluice enamel',(.055,.13,.15),.48,.45)
wear=material('rubbed steel contacts',(.34,.36,.34),.4,.62)
iron=material('blackened ironwork',(.035,.065,.078),.36,.75)
glass=material('recessed blue glass',(.028,.073,.087),.2,.45)
warm=material('occupied amber rooms',(.85,.46,.16),.4,.1,.55)
limestone=material('weathered limestone trim',(.39,.34,.27),.79)
dim=material('occupied pale rooms',(.35,.46,.43),.5,.1,.24)
fixture=material('shielded warm fixtures',(.85,.46,.16),.4,.1,.55)
sandstone=material('weathered service stone',(.30,.25,.19),.86)
brick=material('weathered fired brick',(.85,.72,.59),.88)
plaster=material('warm ivory limestone plaster',(.69,.65,.52),.9)
zinc=material('weathered zinc roofing',(.55,.59,.60),.64,.35)
deposits=material('return contact deposits',(.035,.05,.045),1)
leaf=material('terrace planting',(.03,.085,.056),.95)
objects=[];solids=[];falls=[];lights=[];turbines=[];gates=[]
def mesh(name,vs,fs,m,solid=False,bevel=0):
 # Keep build pieces as plain arrays. Creating thousands of Blender datablocks
 # needlessly reevaluates the scene; the final authored city remains editable.
 bm=bmesh.new();verts=[bm.verts.new(xyz(v)) for v in vs]
 for f in fs:bm.faces.new([verts[i] for i in f])
 if not name.startswith('continuous inhabited gorge landform'):bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 def record():
  bm.verts.ensure_lookup_table();bm.verts.index_update()
  return {'name':name,'vertices':[tuple(v.co) for v in bm.verts],'faces':[tuple(v.index for v in f.verts) for f in bm.faces],'material':m}
 if solid:solids.append(record())
 if bevel:bmesh.ops.bevel(bm,geom=list(bm.edges),offset=bevel,segments=2,affect='EDGES',clamp_overlap=True);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 o=record();objects.append(o);bm.free();return o
faces=[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]
UP=Vector((0,1,0))
def box(name,c,dims,m,axes=None,solid=False,bevel=0):
 c=Vector(c);ax,ay,az=axes or (Vector((1,0,0)),UP,Vector((0,0,1)));w,h,d=dims
 pane=m in [glass,warm,dim] and any(key in name for key in ['window','glazing','room light','occupied light','door light','wheelhouse glass','stairwell','clerestory'])
 pane_axes=(ax,ay);pane_dims=(w,h)
 if pane and not solid and not bevel:
  # Glazing sits inside a real reveal. Its hidden thin box sides add no useful
  # silhouette; two facing panes preserve either elevation at one third the
  # triangles and retain correctly oriented normals for reflected interiors.
  directions=(ax,ay,az);thin=min(range(3),key=lambda i:dims[i]);horizontal,vertical={0:(2,1),1:(0,2),2:(0,1)}[thin]
  pane_axes=(directions[horizontal],directions[vertical]);pane_dims=(dims[horizontal],dims[vertical]);normal=directions[thin]
  vs=[tuple(c+pane_axes[0]*x+pane_axes[1]*y+normal*z) for z in [-dims[thin]/2,dims[thin]/2] for y in [-pane_dims[1]/2,pane_dims[1]/2] for x in [-pane_dims[0]/2,pane_dims[0]/2]]
  o=mesh(name,vs,[(0,2,3,1),(4,5,7,6)],m)
 else:
  vs=[tuple(c+ax*x+ay*y+az*z) for y in [-h/2,h/2] for z in [-d/2,d/2] for x in [-w/2,w/2]]
  o=mesh(name,vs,faces,m,solid,bevel)
 if pane and m in [warm,dim]:
  # Neighboring rooms share a restrained illumination band. Public galleries
  # and working entrances remain the brighter inhabited anchors; upper rooms
  # no longer form a uniformly luminous checkerboard across every elevation.
  cluster=math.sin(round(c.x/9)*13.71+math.floor(c.y/7.3)*73.13+round(c.z/9)*31.17)*43758.5453
  variation=cluster-math.floor(cluster)
  public=any(key in name.lower() for key in ['shopfront','court lower gallery','court entry rooms','service cabin','control station','gallery occupied window'])
  o['emission_level']=(.70+.30*variation) if public else (.26+.60*variation)
 if pane:o['uvs']=[(((Vector((v[0],v[2],-v[1]))-c).dot(pane_axes[0])/pane_dims[0]+.5),((Vector((v[0],v[2],-v[1]))-c).dot(pane_axes[1])/pane_dims[1]+.5)) for v in o['vertices']]
 return o
def near(s):return min(samples,key=lambda f:abs(f['s']-s))
# Four unequal impoundments descend with the production route. Their levels
# come from the lowest nearby road/receiver, not an unrelated global slope.
route_min_z=min(f['p'][2] for f in samples);route_max_z=max(f['p'][2] for f in samples)
world_start=math.floor((route_min_z-650)/100)*100;world_end=math.ceil((route_max_z+650)/100)*100
hero_cuts=sorted(near(j['takeoff'])['p'][2]+20 for j in route['jumps'] if j['hero'])
cuts=[world_start]+hero_cuts+[world_end]
world_left=math.floor((min(f['p'][0] for f in samples)-330)/100)*100
world_right=math.ceil((max(f['p'][0] for f in samples)+330)/100)*100
basins=[];last_y=1e8
for start,end in zip(cuts,cuts[1:]):
 local=[f['p'][1] for f in samples if start-120<=f['p'][2]<=end+120]
 level=min(last_y,min(local or [90])-110);level=math.floor(level/10)*10
 basins.append({'start':start,'end':end,'y':level,'left':world_left,'right':world_right});last_y=level

def bed(z):return next((b['y'] for b in basins if z<b['end']),basins[-1]['y'])
def bank(z,side):
 local=[f['p'][0] for f in samples if abs(f['p'][2]-z)<480]
 edge=(min(local)-310 if side<0 else max(local)+310) if local else (world_left if side<0 else world_right)
 # Keep reservoirs rectangular below, but vary the occupied inner gorge ledge.
 return max(world_left+75,edge) if side<0 else min(world_right-75,edge)
def harbor_widen(z):return 350*min(1,max(0,(z-route_max_z+900)/900))
# Placement uses the route exporter’s real flight envelope, including the
# entire space between slow and boosted arcs. A guide curve through an absent
# road is not a safe proxy for airborne craft or the trailing chase camera.
clearance_volumes=[]
for f in samples:
 forward=Vector((f['t'][0],0,f['t'][2])).normalized();right=UP.cross(forward)
 clearance_volumes.append((Vector(f['p']),right,forward,38,18,f['p'][1]-16,f['p'][1]+16))
if not route.get('flightCorridors') or not route.get('flights'):
 raise ValueError('Export the current production flightCorridors before building Nightweir')
for corridor in route['flightCorridors']:
 forward=Vector(corridor['forward']).normalized();right=UP.cross(forward)
 for column in corridor['columns']:
  clearance_volumes.append((Vector(column['p']),right,forward,corridor['lateralHalfWidth'],corridor['longitudinalClearance']+10,column['minY'],column['maxY']))

def axes_at(f,side=1):
 t=Vector(f['t']);t.y=0;t.normalize();out=UP.cross(t)*side;return(t,UP,out)
def clear(c,dims,axes):
 # Separating axes keep narrow structures out of the conservative swept
 # volumes without discarding the surrounding district as one giant AABB.
 c=Vector(c);a,b,d=axes;w,h,depth=dims
 for p,right,forward,half_width,half_length,min_y,max_y in clearance_volumes:
  if c.y+h/2<min_y or c.y-h/2>max_y:continue
  delta=p-c
  if any(abs(delta.dot(axis))>abs(a.dot(axis))*w/2+abs(d.dot(axis))*depth/2+abs(right.dot(axis))*half_width+abs(forward.dot(axis))*half_length for axis in (a,d,right,forward)):continue
  return False
 return True
def cylinder(name,c,r,depth,m,axis=Vector((0,1,0)),n=24,solid=False):
 c=Vector(c);u=axis.cross(UP)
 if u.length<.01:u=Vector((1,0,0))
 u.normalize();v=axis.cross(u).normalized();vs=[]
 for end in [-depth/2,depth/2]:
  for i in range(n):vs.append(tuple(c+axis*end+u*(r*math.cos(i*math.tau/n))+v*(r*math.sin(i*math.tau/n))))
 fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 o=mesh(name,vs,fs,m,solid)
 # Preserve the simple physical hull, but split the visual caps from the side
 # rings. Analytic radial normals make even distant 16-sided pressure mains
 # round while the two end caps retain their correct flat shading.
 o['vertices']=[xyz(v) for v in vs+vs]
 o['faces']=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]+[tuple(reversed(range(2*n,3*n))),tuple(range(3*n,4*n))]
 o['normals']=[xyz(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n)) for end in range(2) for i in range(n)]+[xyz(-axis)]*n+[xyz(axis)]*n
 o['smooth']=True
 return o
def arch(name,c,width,height,thickness,depth,m,axes,solid=False):
 along,up,out=axes;c=Vector(c);vs=[];fs=[];n=16
 # A real elliptical voussoir ring, with an open centre and solid side reveals.
 for z in [-depth/2,depth/2]:
  for i in range(n+1):
   a=math.pi*i/n
   for inset in [0,thickness]:vs.append(tuple(c+along*((width/2-inset)*math.cos(a))+up*((height-inset)*math.sin(a))+out*z))
 stride=(n+1)*2
 for i in range(n):
  k=i*2
  fs.extend([(k,k+2,k+3,k+1),(stride+k+1,stride+k+3,stride+k+2,stride+k),(k,stride+k,stride+k+2,k+2),(k+1,k+3,stride+k+3,stride+k+1)])
 fs.extend([(0,1,stride+1,stride),(2*n,stride+2*n,stride+2*n+1,2*n+1)])
 return mesh(name,vs,fs,m,solid)

# A continuous landform, not isolated basin-height display pedestals. Elevation
# follows nearby streets; short civil terraces sit on the sloping bedrock. Real
# road and ballistic corridors are carved out, so lower returning roads retain
# their airspace instead of disappearing inside a maximum-height terrain shell.
terrain_bins={}
for i,f in enumerate(samples):terrain_bins.setdefault((math.floor(f['p'][0]/180),math.floor(f['p'][2]/180)),[]).append(i)
hero_voids=[]
for jump in route['jumps']:
 if not jump['hero']:continue
 corridor=next(c for c in route['flightCorridors'] if c['id']==jump['id']);origin=Vector(corridor['columns'][0]['p']);forward=Vector(corridor['forward']);right=UP.cross(forward)
 extent=max((Vector(c['p'])-origin).dot(forward) for c in corridor['columns'])
 half_width={'spillway-leap':205,'turbine-leap':125,'harbor-leap':310}[jump['id']]
 hero_voids.append({'id':jump['id'],'origin':origin,'forward':forward,'right':right,'end':extent,'halfWidth':half_width,'startS':jump['takeoff'],'endS':jump['landingEnd']})
harbor_jump=next(j for j in route['jumps'] if j['id']=='harbor-leap')
harbor_frame=near(harbor_jump['landingStart']);harbor_origin=Vector(harbor_frame['p']);harbor_forward=Vector((harbor_frame['t'][0],0,harbor_frame['t'][2])).normalized();harbor_right=UP.cross(harbor_forward)
ward_regions=[
 {'name':'Reservoir Ward','start':80,'end':1400,'step':110,'offsets':[100,204],'depths':[44,48],'style':'lock','heights':[32.85,47.45,40.15,58.4]},
 {'name':'Crescent Ward','start':1860,'end':2800,'step':70,'offsets':[108,244],'depths':[62,76],'style':'crescent','heights':[65.7,87.6,58.4,76.65,94.9,69.35]},
 {'name':'Terrace Ward','start':2820,'end':3980,'step':90,'offsets':[103,211],'depths':[45,53],'style':'terraces','heights':[29.2,43.8,54.75,36.5,65.7]},
 {'name':'Market Ward','start':5700,'end':7330,'step':105,'offsets':[108],'depths':[62],'style':'market','heights':[21.9,40.15,29.2,51.1]},
 {'name':'Canal Works','start':8690,'end':9710,'step':125,'offsets':[112,235],'depths':[68,64],'style':'canal','heights':[21.9,29.2,36.5,25.55]},
 {'name':'Lower Ward','start':9750,'end':11450,'step':95,'offsets':[103,215],'depths':[45,60],'style':'lower','heights':[32.85,54.75,40.15,25.55,65.7]},
]
def occupied_ward_station(station):return any(w['start']-40<station<w['end']+40 for w in ward_regions)
lower_works_builder=runpy.run_path(str(SRC/'blackstart_lower_works.py'))
lower_works_excavation=lower_works_builder['LowerWorksExcavation'](globals())
harbor_geology=runpy.run_path(str(SRC/'blackstart_cliffs.py'))['create_harbor_geology'](globals())
land_cache={}
def land_height(x,z,excavate=True):
 key=(round(x,2),round(z,2),excavate)
 if key in land_cache:return land_cache[key]
 bx,bz=math.floor(x/180),math.floor(z/180);candidates=[]
 for radius in [1,3,6]:
  candidates=[i for ix in range(bx-radius,bx+radius+1) for iz in range(bz-radius,bz+radius+1) for i in terrain_bins.get((ix,iz),[])]
  if candidates:break
 if not candidates:candidates=list(range(len(samples)))
 index=min(candidates,key=lambda i:(samples[i]['p'][0]-x)**2+(samples[i]['p'][2]-z)**2)
 closest=samples[index]['p'];distance=math.hypot(closest[0]-x,closest[2]-z)
 local=samples[max(0,index-6):min(len(samples),index+7)]
 weighted=[(f['p'][1],1/(300+(f['p'][0]-x)**2+(f['p'][2]-z)**2)) for f in local]
 height=sum(y*w for y,w in weighted)/sum(w for y,w in weighted)-38+min(85,max(0,distance-80)*.16)
 if 1850<samples[index]['s']<2870 and distance>100:height+=min(60,(distance-100)*.45)
 # The outer bank has a real irregular ridgeline instead of ending as a thin
 # rectangular sheet against the environment horizon.
 if distance>340:
  ridge=min(1,(distance-340)/220);height+=ridge*(95+65*math.sin(z*.0024+x*.0008)+28*math.sin(z*.006-x*.0015))
 # Canal and lower-town access streets occupy excavated rock benches at the
 # race datum. Former terrain-top lots vanished on the rim of a 200 m cut;
 # three continuous civil benches now bring the inhabited edge into view.
 # Only lower terrain: the later road/flight limits remain authoritative.
 for candidate in candidates:
  f=samples[candidate]
  if not 9020<f['s']<11520:continue
  cut_distance=math.hypot(f['p'][0]-x,f['p'][2]-z)
  if cut_distance>=230:continue
  road_y=f['p'][1]
  if cut_distance<125:cut=road_y-29
  elif cut_distance<165:cut=road_y+7+(cut_distance-125)*.16
  elif cut_distance<200:cut=road_y+43+(cut_distance-165)*.22
  else:cut=road_y+85+(cut_distance-200)*.8
  height=min(height,cut)
 # Coherent tilted strata break exposed banks into broad benches. They follow
 # a single geological datum instead of adding a noisy cloth of tiny peaks.
 # Keep the inner road bank smooth; farther cut rock steps in 28 m beds.
 if distance>145 and harbor_geology.legacy_influence(x,z)<.01:
  strata=28;datum=.055*x+.032*z;relative=height-datum
  layer=math.floor(relative/strata);phase=relative-layer*strata
  stepped=datum+layer*strata+(max(0,phase-21)/7)*strata
  blend=min(.82,max(0,(distance-145)/100))
  height=height*(1-blend)+stepped*blend
 # Keep ground below both sides of steep/banked roads, including grid-cell
 # interpolation. Neighborhood slopes and retaining terraces remain outside.
 nearby=[f['p'][1]-46 for i in candidates if math.hypot(samples[i]['p'][0]-x,samples[i]['p'][2]-z)<95 for f in [samples[i]]]
 if nearby:height=min(height,min(nearby))
 point=Vector((x,0,z))
 for c,right,forward,hw,hl,y0,y1 in clearance_volumes[len(samples):]:
  delta=point-c
  if abs(delta.dot(right))<hw+44 and abs(delta.dot(forward))<hl+30:height=min(height,y0-46)
 for void in hero_voids:
  delta=point-void['origin'];along=delta.dot(void['forward']);lateral=abs(delta.dot(void['right']))
  if -20<along<void['end']+80:
   edge=void['halfWidth'];blend=max(0,min(1,(edge+100-lateral)/100))
   if blend>0:
    floor=bed(z)-6;height=height*(1-blend)+min(height,floor)*blend
 # Preserve the port's flat working floor. The connected geology helper
 # then shapes unequal side banks and rear closures in all three hero basins.
 delta=point-harbor_origin;port_along=delta.dot(harbor_forward);port_lateral=abs(delta.dot(harbor_right))
 if -420<port_along<1400 and port_lateral<=520:
  longitudinal=min(1,max(0,(port_along+420)/100),max(0,(1400-port_along)/100))
  height=height*(1-longitudinal)+min(height,basins[-1]['y']-5)*longitudinal
 height=harbor_geology.height(x,z,height)
 # Undulation remains on remote ground; authored cliff planes stay connected
 # and angular rather than receiving high-frequency displacement noise.
 detail=1-harbor_geology.influence(x,z)
 height+=detail*2.6*math.sin(x*.029+z*.011)*math.sin(z*.037)
 if excavate:height=lower_works_excavation.lower(x,z,height)
 land_cache[key]=height;return height
terrain_step=30;x0=world_left-300;x1=world_right+300;z0=world_start;z1=world_end
nx=math.ceil((x1-x0)/terrain_step);nz=math.ceil((z1-z0)/terrain_step);vertices=[]
for iz in range(nz+1):
 z=z0+(z1-z0)*iz/nz
 for ix in range(nx+1):
  x=x0+(x1-x0)*ix/nx;vertices.append((x,harbor_geology.quay_scarp.cut_ground(x,z,land_height(x,z,False)),z))
# Terrain is smooth shaded and split into the same longitudinal culling
# districts as the city. Analytic vertex normals preserve smooth seam lighting.
terrain_normals=[]
for iz in range(nz+1):
 for ix in range(nx+1):
  left=Vector(vertices[iz*(nx+1)+max(0,ix-1)]);right=Vector(vertices[iz*(nx+1)+min(nx,ix+1)])
  back=Vector(vertices[max(0,iz-1)*(nx+1)+ix]);front=Vector(vertices[min(nz,iz+1)*(nx+1)+ix])
  normal=(front-back).cross(right-left).normalized();terrain_normals.append(xyz(normal))
terrain_districts={}
for iz in range(nz):
 for ix in range(nx):
  a=iz*(nx+1)+ix;b=a+1;c=a+nx+2;d=a+nx+1
  district=math.floor(vertices[a][2]/600)
  terrain_districts.setdefault(district,[]).extend([(a,c,b),(a,d,c)] if (ix+iz)%2 else [(a,d,b),(b,d,c)])
for district,fs in terrain_districts.items():
 used=sorted(set(i for face in fs for i in face));remap={old:new for new,old in enumerate(used)}
 # Only the small Lower Works excavation needs finer cells. Untouched outer
 # edges retain the coarse mesh heights, so the local cut creates no seams.
 patch_vs,patch_fs,patch_normals=lower_works_excavation.refine([vertices[i] for i in used],[tuple(remap[i] for i in face) for face in fs],[terrain_normals[i] for i in used])
 o=mesh('continuous inhabited gorge landform %d'%district,patch_vs,patch_fs,bedrock,True)
 o['normals']=patch_normals
 harbor_geology.shade_terrain(o)
# A coarse connected outer landmass carries the distant ridge crowns into long
# talus slopes. The old 140 m apron exposed a straight cut immediately behind
# the high-quay and Spillway views. Five wider rings keep the distant silhouette
# coherent without extending the fine driving mesh across kilometres of land.
outer_rings=[0,220,520,1000,1600,2300]
for edge_index,edge in enumerate([[iz*(nx+1) for iz in range(nz+1)],[iz*(nx+1)+nx for iz in range(nz+1)],[ix for ix in range(nx+1)],[nz*(nx+1)+ix for ix in range(nx+1)]]):
 # Only the high-quay rear sector needs finer samples for its drainage and
 # exposed scarps. The other distant banks retain the previous geometry.
 rings=outer_rings if edge_index!=3 else sorted(set(outer_rings+[distance for left,right in zip(outer_rings,outer_rings[1:]) for distance in [left+(right-left)*j/math.ceil((right-left)/(70 if left<1000 else 190)) for j in range(1,math.ceil((right-left)/(70 if left<1000 else 190)))]]))
 for segment in range(0,len(edge)-1,20):
  strip=edge[segment:min(len(edge),segment+21)];vs=[]
  for sample_index,i in enumerate(strip,segment):
   x,y,z=vertices[i];out=Vector((x-(x0+x1)/2,0,z-(z0+z1)/2)).normalized()
   def outer_point(distance):
    xx=x+out.x*distance;zz=z+out.z*distance;yy=harbor_geology.quay_scarp.cut_ground(xx,zz,land_height(xx,zz)) if distance else y
    fade=max(0,min(1,(distance-700)/1600));fade=fade*fade*(3-2*fade)
    return xx,yy*(1-fade)+min(bed(zz)-90,yy-260)*fade,zz
   for distance in rings:
    xx,yy,zz=outer_point(distance)
    if edge_index==3 and distance not in outer_rings:
     # At the two perimeter corners retain the original straight edge, so
     # refinement meets the adjacent coarse bank without a crack/T-junction.
     left=max(d for d in outer_rings if d<distance);right=min(d for d in outer_rings if d>distance)
     linear=outer_point(left)[1]+(outer_point(right)[1]-outer_point(left)[1])*(distance-left)/(right-left)
     blend=min(1,sample_index/3,(len(edge)-1-sample_index)/3)
     yy=linear+(yy-linear)*blend
    vs.append((xx,yy,zz))
  count=len(rings)
  o=mesh('rooted irregular outer gorge slope',vs,[(i*count+j,i*count+j+1,(i+1)*count+j+1,(i+1)*count+j) for i in range(len(strip)-1) for j in range(count-1)],bedrock,True)
  if edge_index==3:
   normals=[Vector() for v in o['vertices']]
   for face in o['faces']:
    normal=(Vector(o['vertices'][face[1]])-Vector(o['vertices'][face[0]])).cross(Vector(o['vertices'][face[2]])-Vector(o['vertices'][face[0]]))
    for v in face:normals[v]+=normal
   o['normals']=[tuple(v.normalized()) for v in normals]
   harbor_geology.shade_terrain(o)
quay_scarp_summary=harbor_geology.quay_scarp.build(globals())
print('CONTINUOUS TERRAIN',sum(len(fs) for fs in terrain_districts.values()),'triangles',flush=True)


def founded_platform(name,c,w,d,axes):
 along,up,out=axes;corners=[Vector(c)+along*x+out*z for x,z in [(-w/2,-d/2),(w/2,-d/2),(w/2,d/2),(-w/2,d/2)]]
 floors=[land_height(q.x,q.z)-5 for q in corners]
 interior=[Vector(c),(corners[0]+corners[1])/2,(corners[1]+corners[2])/2,(corners[2]+corners[3])/2,(corners[3]+corners[0])/2]
 level=max(max(floors)+8,max(land_height(q.x,q.z) for q in interior)+3)
 if level-min(floors)>115:return None
 envelope=Vector((c.x,(level+128+min(floors))/2,c.z))
 if not clear(envelope,(w+8,level+128-min(floors),d+8),axes):return None
 vs=[(q.x,floor,q.z) for q,floor in zip(corners,floors)]+[(q.x,level,q.z) for q in corners]
 mesh(name+' short founded retaining terraces',vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],aggregate,True)
 base=Vector((c.x,level,c.z));box(name+' public paved terrace',base+up*.4,(w+1,.8,d+1),concrete,axes,True,.08)
 return base

# Human-scale windows stay subordinate to clear building masses. Whole wings
# change height and footprint; repeated floor-stack silhouettes are avoided.
def frontage(name,c,w,h,d,axes,kind,seed):
 along,up,out=axes;fr=random.Random(seed);floor_h=3.65 if kind=='residential' else 4.2
 floor_count=max(2,int((h-5)/floor_h));base=-h/2+4.2
 elevations=[(-out,along,w,d/2),(along,out,d,w/2),(-along,-out,d,w/2)]
 if 'attached street block' in name and 'setback' not in name:
  # The side walls are shared with the adjoining lot. Spend geometry on the
  # two occupied street elevations, not thousands of buried window boxes.
  elevations=[(-out,along,w,d/2),(out,-along,w,d/2)]
 for face_i,(normal,tangent,span,offset) in enumerate(elevations):
  fa=(tangent,up,-normal);pitch=4.1 if kind=='residential' else 5.1;cols=max(2,int((span-4)/pitch));pitch=(span-4)/cols
  face=c+normal*(offset+.13)
  for floor_i in range(floor_count):
   y=base+floor_i*floor_h
   # Paired service floors and subtle changes in bay rhythm break identical grids.
   for col in range(cols):
    if kind=='municipal' and floor_i<2 and col%3==1:continue
    x=(col-(cols-1)/2)*pitch;q=face+tangent*x+up*y
    opening_w=1.7 if kind=='residential' else 2.35;opening_h=2.15 if kind=='residential' else 2.55
    box(name+' window reveal',q,(opening_w+.38,opening_h+.38,.32),iron,fa)
    lit=fr.random()>(.48 if kind=='residential' else .70)
    color=warm if lit and fr.random()>.19 else dim if lit else glass
    box(name+' occupied window',q+normal*.19,(opening_w,opening_h,.045),color,fa)
    if (col+floor_i)%4==0:box(name+' window central mullion',q+normal*.23,(.07,opening_h,.08),iron,fa)
   if floor_i in [0,5,11,17]:
    box(name+' projecting string course',face+up*(y-1.6)+normal*.25,(span+.5,.28,.7),limestone,fa)
  # Tall shallow piers organize groups of small rooms, rather than each floor
  # getting the giant protruding slab which made the old town look miniature.
  for col in range(0,cols+1,3):
   x=-span/2+2+col*pitch
   box(name+' grouped facade pier',face+tangent*x+up*.8,(.46,h-2,.5),limestone,fa)
  if face_i==0 and kind=='residential':
   for col in [1,max(2,cols-2)]:
    x=(col-(cols-1)/2)*pitch
    for floor_i in range(2,floor_count,3):
     q=face+tangent*x+up*(base+floor_i*floor_h-1.35)+normal*1.0
     box(name+' private balcony floor',q,(3.1,.22,2.2),concrete,fa)
     box(name+' private balcony parapet',q+up*.6+normal*1.0,(3.1,1.0,.13),iron,fa)
 # Recessed commercial/service bases are real shadow pockets below the small
 # window grid. Door openings use normal human dimensions.
 front=c-out*(d/2+.3)+up*(-h/2+1.9)
 for j in range(max(2,int(w/8))):
  q=front+along*((j-(max(2,int(w/8))-1)/2)*7.5)
  box(name+' shopfront reveal',q,(4.6,3.4,.4),iron,axes)
  box(name+' shopfront glazing',q-out*.25,(4.1,2.8,.05),glass if j%3 else dim,axes)
  box(name+' entrance canopy',q+up*2.1-out*1.2,(5.4,.24,2.5),iron,axes)
 roof=c+up*(h/2)
 for side in [-1,1]:
  box(name+' parapet end',roof+along*(side*w/2)+up*.55,(.32,1.1,d),aggregate,axes)
  box(name+' parapet front and back',roof+out*(side*d/2)+up*.55,(w,1.1,.32),aggregate,axes)
 box(name+' stair enclosure',roof+along*(w*.21)+out*(d*.12)+up*1.8,(7,3.6,8),concrete,axes,True,.12)
 for j in range(2):box(name+' roof plant',roof+along*(-w*.22)+out*(-d*.2+j*5)+up*.7,(3.1,1.4,3.1),iron,axes)

def urban_wing(name,base,w,h,d,axes,kind,seed):
 c=base+UP*(h/2);box(name+' primary masonry',c,(w,h,d),concrete if seed%3 else sandstone,axes,True,.17)
 frontage(name,c,w,h,d,axes,kind,seed)
 if seed%3==1:
  # The upper wing steps back and off centre, changing the skyline in bulk.
  top=base+UP*h+axes[0]*(w*.17)+axes[2]*(d*.12);th=10.95
  box(name+' setback upper wing',top+UP*(th/2),(w*.62,th,d*.65),concrete,axes,True,.12)
  frontage(name+' setback',top+UP*(th/2),w*.62,th,d*.65,axes,kind,seed+91)

def representative_collision(name,c,dims,axes,first_solid):
 # These off-road architectural assemblies are screened against the complete
 # flight/road envelope before construction. A single conservative envelope
 # represents their mass; small gallery slabs/columns are visual detail.
 if not clear(c,dims,axes):return
 del solids[first_solid:]
 box(name+' representative collision',c,dims,concrete,axes,True)
 objects.pop()

def inhabited_bays(name,base,w,h,d,axes,family,seed):
 # A load-bearing rear range, real piers and occupied projecting room bays.
 # Open galleries have five metres of visible depth, not lines painted onto
 # a solid front wall. Reservoir brick works and ivory terrace housing share
 # human floor sizes but have deliberately different mass/roof rhythms.
 first_solid=len(solids)
 along,up,out=axes;industrial=family=='lock';floor_h=4.2 if industrial else 3.65
 floors=max(4,int(h/floor_h));h=floors*floor_h;bay_count=max(3,int(w/(15 if industrial else 13)));pitch=w/bay_count
 skin=brick if industrial else plaster;rear_depth=max(12,d-11)
 box(name+' inhabited rear loadbearing range',base+out*5.5+up*h/2,(w,h,rear_depth),skin,axes,True,.13)
 front=base-out*(d/2);recess=front+out*6.0
 for bay in range(bay_count):
  x=-w/2+(bay+.5)*pitch;bc=base+along*x
  # Higher end pavilions and offset mid-bays give the complete assembly a
  # stepped silhouette; individual floors never become giant floating slabs.
  extra=2 if (bay+seed)%5==0 else 0
  if extra:
   top=base+along*x+out*(d*.12)+up*(h+extra*floor_h/2)
   box(name+' raised inhabited end pavilion',top,(pitch-.5,extra*floor_h,d*.7),skin,axes,True,.12)
   for floor_i in range(extra):
    for column in [-1,1]:
     q=top+along*(column*pitch*.20)-out*(d*.35+.12)+up*((floor_i-(extra-1)/2)*floor_h)
     box(name+' pavilion window reveal',q,(2.4,2.8,.3),iron,axes)
     box(name+' pavilion occupied window',q-out*.17,(2.0,2.4,.05),dim if (bay+column)%3 else warm,axes)
  enclosed=(bay+seed)%3!=1
  if enclosed:
   # These room volumes stand proud of the gallery line by 3–6 m. Their
   # side reveals remain visible as the player passes the front elevation.
   projection=3.2 if industrial else (5.2 if bay%2 else 2.4)
   front_depth=9+projection;front_base=front+out*(front_depth/2-2.8)
   cap_h=h-(floor_h*2 if bay%3==0 else 0)
   box(name+' projecting occupied room volume',front_base+along*x+up*(cap_h/2),(pitch-3.8,cap_h,front_depth),plaster if industrial and bay%4==0 else skin,axes,True,.12)
   face=front_base+along*x-out*(front_depth/2+.13)
   for floor_i in range(int(cap_h/floor_h)):
    for column in [-1,1]:
     q=face+along*(column*(pitch-3.8)*.24)+up*(2.0+floor_i*floor_h)
     ww=2.8 if industrial else 2.0
     box(name+' room window deep reveal',q,(ww+.42,2.8,.4),iron,axes)
     box(name+' occupied room window',q-out*.22,(ww,2.35,.05),warm if (bay+floor_i+column+seed)%4==0 else dim if floor_i%3==1 else glass,axes)
   box(name+' room volume parapet',face+up*(cap_h+.55)+out*.3,(pitch-3.5,1.1,.65),limestone,axes)
  else:
   # A full-height occupied access recess, with actual decks, railings and
   # framed rooms behind it. The void is deep enough to read at race speed.
   box(name+' gallery rear loadbearing wall',front+along*x+out*8.4+up*h/2,(pitch-2.4,h,4.8),skin,axes,True)
   for floor_i in range(floors):
    y=floor_i*floor_h
    box(name+' recessed access gallery deck',front+along*x+out*2.8+up*(y+.12),(pitch-2.5,.32,7.4),concrete,axes,True)
    box(name+' access gallery balustrade',front+along*x-out*.65+up*(y+1.0),(pitch-2.7,.7,.15),iron,axes)
    for column in [-1,1]:
     q=recess+along*(x+column*pitch*.22)+up*(y+2.0)
     box(name+' gallery rear room reveal',q,(2.3,2.8,.3),iron,axes)
     box(name+' gallery rear occupied window',q-out*.18,(1.9,2.35,.05),warm if (bay+floor_i+seed)%3==0 else glass,axes)
    for post in [-.44,.44]:box(name+' gallery railing upright',front+along*(x+pitch*post)-out*.65+up*(y+.8),(.12,1.4,.18),iron,axes)
  pier=front+along*(-w/2+bay*pitch)+out*1.4+up*h/2
  box(name+' structural brick pier' if industrial else name+' limestone gallery pier',pier,(2.4 if industrial else 1.5,h+1,8.4),brick if industrial else limestone,axes,True,.12)
 # A continuous open ground-level route ties the irregular bays together.
 box(name+' continuous sheltered access street',front-out*4+up*1.25,(w+1,.5,6.5),limestone,axes,True)
 for j in range(0,bay_count,3):
  q=front+along*(-w/2+(j+.5)*pitch)-out*3
  box(name+' entrance weather hood',q+up*4.1,(pitch*.58,.3,4.5),iron,axes)
 # Broad roof separation is a construction cue, not another grid ornament.
 box(name+' setback roof service spine',base+out*(d*.26)+up*(h+1.6),(w*.72,3.2,d*.24),iron if industrial else plaster,axes,True,.12)
 representative_collision(name,base+up*((h+11)/2), (w+3,h+12,d+17),axes,first_solid)

def generating_hall(name,base,w,d,axes,seed):
 along,up,out=axes;h=24;c=base+up*h/2
 box(name+' heavy base',base+up*2,(w,4,d),aggregate,axes,True,.45)
 box(name+' brick generator volume',c,(w,h,d),brick,axes,True,.3)
 # Unequal high bay massing, with a clerestory and real external buttresses.
 roof=base+up*h
 box(name+' raised crane bay',roof+up*5+out*d*.16,(w*.8,10,d*.55),concrete,axes,True,.2)
 for side in [-1,1]:
  for k in range(max(4,int(w/12))):
   x=(k-(max(4,int(w/12))-1)/2)*11.8;q=c+along*x+out*(side*d/2)
   box(name+' hall structural buttress',q,(1.8,h+3,2.5),aggregate,axes,True,.2)
   for column in [-1,0,1]:
    for row in [-1,1]:
     pane=q+up*(5+row*2.15)+along*(column*2.45)+out*(side*1.32)
     box(name+' industrial clerestory glazing',pane,(2.23,4.05,.05),dim if (k+seed+column)%4==0 else glass,axes)
   for mullion in [-3.65,-1.22,1.22,3.65]:box(name+' hall glazing mullion',q+up*5+along*mullion+out*(side*1.4),(.15,9,.18),iron,axes)
   box(name+' hall glazing transom',q+up*5+out*(side*1.4),(7.5,.18,.18),iron,axes)
 for k in range(4):
  z=-d/2+k*d/4
  vs=[tuple(roof+along*x+out*zz+up*y) for x in [-w/2,w/2] for zz,y in [(z,1),(z+d/4,6),(z+d/4,1)]]
  mesh(name+' repeated northlight roof',vs,[(0,1,4,3),(1,2,5,4),(0,3,5,2),(0,2,1),(3,4,5)],zinc,True)
  panes=max(2,int((w-3)/3.2));pitch=(w-3)/panes
  for pane in range(panes):
   q=roof+out*(z+d/4+.06)+up*3.4+along*((pane-(panes-1)/2)*pitch)
   box(name+' northlight clerestory',q,(pitch-.16,4,.05),glass,axes)
 for k in [-.25,.25]:
  q=base+along*(w*k)-out*(d/2+.3)+up*5
  box(name+' service roll door',q,(8,10,.4),enamel,axes)
  box(name+' door steel lintel',q+up*5.3,(9,.7,1.2),iron,axes)

accepted=0
for index,station in enumerate(range(80,int(route['finish'])-180,180)):
 if index%15==0:print('INHABITED TERRACE',index,flush=True)
 if occupied_ward_station(station) or station>11470:continue
 f=near(station);p=Vector(f['p']);progress=station/route['finish']
 district='reservoir' if progress<.26 else 'municipal' if progress<.49 else 'turbine' if progress<.76 else 'harbor'
 active_void=next((v for v in hero_voids if v['startS']-80<station<v['endS']+80),None)
 if active_void and active_void['id']=='spillway-leap':continue
 # The long flights open over water. Their receiving districts stand on the
 # far occupied banks instead of reproducing the same narrow pillar canyon.
 for side in [-1,1]:
  axes=axes_at(f,side);along,up,out=axes
  offset=(active_void['halfWidth']+170 if active_void else 122+(index%3)*15)
  c=p+out*offset;w=142+(index%3)*12;d=82
  if land_height(c.x,c.z)<p.y-145:continue
  base=founded_platform('inhabited '+district+' block',c,w,d,axes)
  if base is None:continue
  accepted+=1
  # The lower public street occupies the retaining edge; larger blocks step
  # back onto connected ground behind it. Unequal rooflines define districts.
  street=base-out*(d*.34)
  box('public side street',street+up*.2,(w-5,.4,16),iron,axes)
  for x in [-w*.42,w*.42]:
   q=street+along*x+up*1.8
   box('street service doorway',q,(1.4,2.8,.22),enamel,axes)
  if district in ['reservoir','municipal']:
   height=58.4+(index%5)*10.95;kind='residential' if district=='reservoir' else 'municipal'
   urban_wing('inhabited '+district+' corner',base-along*(w*.31)+out*5,35,height,39,axes,kind,index*11+side+900)
   urban_wing('inhabited '+district+' court return',base+along*(w*.25)+out*10,43,40.15+(index%4)*10.95,45,axes,kind,index*13+side+500)
   urban_wing('continuous lower shop street',base+along*3-out*21,42,14.6+(index%2)*7.3,21,axes,'municipal',index*19+side+300)
   # An occupied rear stair street ties the block into the next uphill bench.
   rear=base+out*31
   box('public rear lane',rear+up*.2,(w-5,.4,12),limestone,axes)
   if index%3==1:
    q=base+along*(w*.05)+out*16
    box('neighborhood stair tower',q+up*18,(9,36,12),aggregate,axes,True,.12)
    for floor_i in range(8):box('stairwell window',q-out*6.1+up*(3+floor_i*4),(3,2.5,.05),dim,axes)
  else:
   generating_hall('long turbine generating house' if district=='turbine' else 'harbor transit warehouse',base-along*15+out*6,w*.72,58,axes,index)
   if district=='turbine':
    towerbase=base+along*(w*.38)+out*15
    urban_wing('generator control tower',towerbase,23,54+(index%3)*11,26,axes,'municipal',index+200)
    for k in [-1,1]:
     q=base+along*(k*28)-out*(d/2+4)
     cylinder('wall-backed hydroelectric penstock',q+up*18,4.5,36,steel,solid=True)
     for yy in [5,17,29]:cylinder('penstock expansion ring',q+up*yy,5.1,.8,iron,solid=True)
   elif index%3==0:
    urban_wing('dock administration',base+along*(w*.37)+out*11,24,29.2,30,axes,'municipal',index+200)
  if index%6==2:
   lip=base-along*(w*.34)-out*(d/2+.6)+up*1.8
   box('retaining drain dark mouth',lip,(2.8,2.2,.3),iron,axes)
   floor=land_height(lip.x-out.x*6,lip.z-out.z*6)
   if lip.y-floor>8:falls.append({'top':list(lip-out*.6),'right':list(along),'width':2.3,'height':lip.y-floor,'seed':index+side*.3,'kind':'terrace'})

# A second, continuous occupied street is grounded farther up each bank. Its
# intersections and roofline rhythm differ from the race-side neighborhood.
for index,station in enumerate(range(120,int(route['finish'])-280,290)):
 if occupied_ward_station(station) or station>11470 or any(v['id']=='spillway-leap' and v['startS']-80<station<v['endS']+80 for v in hero_voids):continue
 f=near(station);p=Vector(f['p']);progress=station/route['finish']
 for side in [-1,1]:
  axes=axes_at(f,side);along,up,out=axes;c=p+out*(295+(index%3)*29)+along*35
  if land_height(c.x,c.z)<p.y-130:continue
  base=founded_platform('connected upper street',c,170,91,axes)
  if base is None:continue
  if .5<progress<.76:generating_hall('upper switchyard hall',base,142,70,axes,index)
  elif progress>.80:generating_hall('upper harbor freight shed',base,125,62,axes,index)
  else:
   urban_wing('upper neighborhood long frontage',base-along*42,43,43.8+(index%4)*14.6,44,axes,'residential',index+side+3000)
   urban_wing('upper neighborhood narrow return',base+along*43-out*5,31,32.85+(index%5)*10.95,38,axes,'residential',index+side+3100)
   urban_wing('upper neighborhood rear workshop',base+out*30,74,14.6,21,axes,'municipal',index+side+3200)

# Connected wards use different silhouettes, depth and public spaces. Shared
# walls and occupied recesses carry urban density; isolated tower pairs do not.
def entry_fixture(name,base,along,out,power=900):
 q=base+UP*8-out*2
 box(name+' shielded entry bracket',q+out*.8,(.25,.3,2.1),iron,(along,UP,out))
 box(name+' shielded entry hood',q,(1.8,.45,1.2),iron,(along,UP,out))
 box(name+' shielded entry lens',q-UP*.24,(1.3,.08,.7),fixture,(along,UP,out))
 lights.append({'p':list(q-UP*1.0-out*.4),'power':power,'color':'#ffd1a0','pocket':True})

def occupied_gallery(name,base,width,depth,axes,seed):
 along,up,out=axes
 box(name+' occupied gallery rear',base+out*(depth*.33)+up*5.5,(width,11,depth*.34),aggregate,axes,True,.16)
 for j in range(max(3,int(width/7))):
  pitch=width/max(3,int(width/7));x=(j-(max(3,int(width/7))-1)/2)*pitch
  q=base+along*x+up*4-out*.2
  box(name+' gallery recessed window frame',q,(3.6,4.8,.4),iron,axes)
  box(name+' gallery occupied window',q-out*.23,(2.8,3.4,.06),warm if (j+seed)%3==0 else glass,axes)
  box(name+' gallery column',base+along*(x-pitch/2)-out*(depth*.42)+up*5.4,(.7,10.8,.7),limestone,axes,True,.06)
 box(name+' sheltered gallery roof',base+up*11.2,(width+1,1.1,depth),concrete,axes,True,.12)
 box(name+' gallery roof parapet',base+up*12-out*(depth*.48),(width,.6,.5),aggregate,axes)
 box(name+' gallery public walkway',base-out*(depth*.35)+up*.3,(width,.6,depth*.7),limestone,axes,True)
 entry_fixture(name,base-out*(depth*.3),along,out,1000)

def public_stairs(name,start,end,width=6):
 if end.y<start.y:start,end=end,start
 delta=end-start;run=Vector((delta.x,0,delta.z));length=run.length
 if length<3:return
 run.normalize();cross=UP.cross(run)
 if not clear((start+end)/2+UP*2,(width+1,abs(delta.y)+6,length+4),(cross,UP,run)):return
 steps=max(2,math.ceil(abs(delta.y)/.32));tread=length/steps;rise=delta.y/steps
 for k in range(steps):
  q=start+run*((k+.5)*tread)+UP*((k+.5)*rise)
  box(name+' public stair tread',q,(width,.32,tread+.04),concrete,(cross,UP,run),True)
 for rail_side in [-1,1]:
  a=start+cross*(rail_side*(width/2-.2))+UP*1.15;b=end+cross*(rail_side*(width/2-.2))+UP*1.15
  direction=(b-a).normalized();across=direction.cross(cross).normalized()
  box(name+' stair handrail',(a+b)/2,(.12,.12,(b-a).length),iron,(cross,across,direction))
  for k in range(0,steps,8):
   q=start+run*(k*tread)+UP*(k*rise)+cross*(rail_side*(width/2-.2))+UP*.65
   box(name+' handrail upright',q,(.12,1.3,.12),iron)

crescent_court_summary={}
def crescent_municipal_court(name,base,width,depth,axes,seed):
 # One authored replacement for the broad 77 m slab in the upper-city chase.
 # A low approaching wing lets the driver see into a true open court; the
 # taller wing and slender rear pavilion frame it without sealing the view.
 along,up,out=axes;court_width=23;near_width=(width-court_width)*.45;far_width=(width-court_width)*.55
 if not clear(base+up*43,(width+4,90,depth+6),axes):return False
 front=base-out*(depth/2);arcade_h=8.2
 def room_face(label,face,span,height,tangent,normal,seed_offset):
  # Paired human-size rooms sit inside grouped masonry bays. Quiet stone
  # reveals and real hoods replace the former all-over black sticker grid.
  fa=(tangent,up,-normal);bays=max(2,int(span/8.3));pitch=span/bays;floors=max(2,int(height/3.65))
  for bay in range(bays):
   x=(bay-(bays-1)/2)*pitch
   for floor in range(floors):
    q=face+tangent*x+up*(2.1+floor*3.65)
    box(label+' grouped stone opening',q,(4.5,2.65,.38),limestone,fa)
    for pane in [-1,1]:
     box(label+' recessed occupied window',q+tangent*(pane*1.03)+normal*.21,(1.75,2.15,.055),warm if (bay+floor+seed_offset)%5==0 else dim if (bay+2*floor)%4==0 else glass,fa)
    box(label+' stone window hood',q+up*1.42+normal*.25,(4.9,.22,.9),limestone,fa)
   if bay<bays-1:
    q=face+tangent*(x+pitch/2)+up*(height/2)
    box(label+' full height masonry bay',q,(.65,height,.65),plaster,fa)
 def arcade_wing(label,xcenter,wing_width,wing_depth,upper_height,inner_sign):
  wing=front+along*xcenter;inner=along*inner_sign
  # The core leaves an L-shaped public arcade open on street and court sides.
  core=wing-inner*3+out*(7+(wing_depth-7)/2)
  box(label+' loadbearing arcade core',core+up*3.7,(wing_width-6,7.4,wing_depth-7),brick,axes,True,.12)
  columns=max(3,round(wing_width/6.5));pitch=wing_width/columns
  for j in range(columns+1):
   q=wing+along*(-wing_width/2+j*pitch)+out*.8
   box(label+' street arcade masonry pier',q+up*2.3,(1.2,4.6,2.2),limestone,axes,True,.08)
   if j<columns:
    arch(label+' deep street arcade arch',q+along*pitch/2+up*4.6,pitch,2.5,.62,2.2,limestone,axes)
    room=wing+along*(-wing_width/2+(j+.5)*pitch)+out*6.76+up*2.4
    box(label+' arcade shop stone surround',room,(3.7,3.9,.28),limestone,axes)
    box(label+' arcade occupied shop window',room-out*.17,(3.05,3.3,.055),dim if (j+seed)%3 else warm,axes)
  side_span=wing_depth-7;side_columns=max(3,round(side_span/6.8));side_pitch=side_span/side_columns
  for j in range(side_columns+1):
   q=wing+inner*(wing_width/2-.6)+out*(6.5+j*side_pitch)
   side_axes=(out,up,-inner)
   box(label+' court arcade masonry pier',q+up*2.3,(1.2,4.6,2.2),limestone,side_axes,True,.08)
   if j<side_columns:arch(label+' deep court arcade arch',q+out*side_pitch/2+up*4.6,side_pitch,2.5,.62,2.2,limestone,side_axes)
  deck=wing+out*(wing_depth/2)+up*7.8
  box(label+' bearing arcade terrace slab',deck,(wing_width+1,.8,wing_depth+1),concrete,axes,True,.12)
  box(label+' public terrace front parapet',wing+out*.4+up*8.9,(wing_width,1.4,.55),limestone,axes)
  box(label+' court terrace parapet',wing+inner*(wing_width/2-.2)+out*(wing_depth/2)+up*8.9,(.55,1.4,wing_depth),limestone,axes)
  upper_width=wing_width-6;upper_depth=wing_depth-9
  upper_base=wing-inner*3+out*(8+upper_depth/2)+up*arcade_h
  box(label+' setback occupied masonry wing',upper_base+up*upper_height/2,(upper_width,upper_height,upper_depth),plaster,axes,True,.12)
  room_face(label+' upper street rooms',upper_base-out*(upper_depth/2+.13),upper_width,upper_height,along,-out,seed)
  room_face(label+' upper court rooms',upper_base+inner*(upper_width/2+.13),upper_depth,upper_height,out,inner,seed+11)
  room_face(label+' approach end rooms',upper_base-along*(upper_width/2+.13),upper_depth,upper_height,out,-along,seed+7)
  roof=upper_base+up*upper_height
  box(label+' heavy roof cornice',roof+up*.3,(upper_width+1.3,.6,upper_depth+1.3),limestone,axes)
  box(label+' recessed zinc roof',roof+up*.62,(upper_width-.7,.12,upper_depth-.7),zinc,axes)
  for side in [-1,1]:box(label+' masonry roof parapet',roof+out*(side*upper_depth/2)+up*1.0,(upper_width+.8,1.4,.45),limestone,axes)
  return upper_base
 near_x=-width/2+near_width/2;far_x=width/2-far_width/2
 arcade_wing(name+' low approaching wing',near_x,near_width,35,10.95,1)
 arcade_wing(name+' taller court return',far_x,far_width,47,32.85,-1)
 # The court stays open all the way from the race-facing side street to the
 # occupied rear gallery. Its raised back street is reached by real stairs.
 box(name+' open public court paving',base-out*6+up*.18,(court_width,.36,depth-12),limestone,axes)
 rear=base+out*(depth/2-11)+up*6
 box(name+' founded rear gallery step',rear-up*3,(court_width+7,6,20),aggregate,axes,True,.12)
 box(name+' recessed rear gallery occupied range',rear+out*4+up*6.3,(court_width+7,12.6,10),brick,axes,True,.12)
 for floor in range(3):
  y=.5+floor*4.2
  box(name+' rear public gallery deck',rear-out*3.5+up*y,(court_width+7,.35,7),concrete,axes)
  box(name+' rear gallery iron balustrade',rear-out*6.8+up*(y+1.0),(court_width+7,.7,.14),iron,axes)
  for j in range(4):
   q=rear+along*((j-1.5)*6.7)-out*1.16+up*(y+2.0)
   box(name+' rear gallery stone opening',q,(4.5,2.8,.3),limestone,axes)
   for pane in [-1,1]:box(name+' rear gallery occupied window',q+along*(pane*1.05)-out*.18,(1.8,2.3,.055),warm if j%2==0 else dim,axes)
 for j in range(5):box(name+' rear gallery column',rear+along*((j-2)*6.7)-out*6+up*6.7,(.85,13.4,.85),limestone,axes)
 box(name+' rear gallery public roof',rear+up*13.4,(court_width+8,1,20),concrete,axes,True,.1)
 public_stairs(name+' inhabited courtyard stair',base+out*1+up*.5,rear-out*8+up*.5,6.4)
 entry_fixture(name+' court gallery entrance',rear-out*5,along,out,1100)
 # A slender stair/administration pavilion replaces the former full-width
 # skyline wall. Its glazed vertical recess explains the actual floor scale.
 pavilion=base+along*(width/2-10)+out*(depth/2-12);pavilion_h=76.6
 box(name+' narrow rear civic pavilion',pavilion+up*pavilion_h/2,(18,pavilion_h,23),brick,axes,True,.14)
 for normal,tangent,offset in [(-out,along,11.65),(-along,out,9.15)]:
  fa=(tangent,up,-normal);face=pavilion+normal*offset
  box(name+' pavilion recessed stair bay',face+up*40,(6.8,65,.35),aggregate,fa)
  for floor in range(14):
   q=face+up*(10+floor*4.2)+normal*.22
   for pane in [-1,1]:box(name+' pavilion stair landing window',q+tangent*(pane*1.35),(2.1,2.8,.055),dim if floor%4 else warm,fa)
   box(name+' pavilion stair landing lintel',q-up*1.7+normal*.1,(7,.32,.75),limestone,fa)
 box(name+' pavilion bearing cornice',pavilion+up*(pavilion_h+.5),(20,1,25),limestone,axes,True,.12)
 roof=pavilion+up*(pavilion_h+1)
 roof_vertices=[tuple(roof+along*x+out*z) for x,z in [(-10,-12.5),(10,-12.5),(10,12.5),(-10,12.5)]]+[tuple(roof+along*x+up*5.5) for x in [-3.5,3.5]]
 mesh(name+' civic pavilion hipped zinc crown',roof_vertices,[(0,1,5,4),(1,2,5),(2,3,4,5),(3,0,4),(0,3,2,1)],zinc)
 crescent_court_summary.update({'base':list(base),'width':width,'depth':depth,'openCourtWidth':court_width,'nearWingHeight':19.15,'farWingHeight':41.05,'pavilionHeight':83.1})
 return True

terrace_court_summary={}
def terrace_residential_court(name,base,width,depth,axes,seed):
 # One camera-tested hillside court. Its mouth is offset downhill: a centered
 # courtyard would disappear beyond the banked chase camera's right edge.
 along,up,out=axes;name+=' / ';first_object=len(objects);first_solid=len(solids)
 def at(x,y,z):return base+along*x+up*y+out*z
 def part(label,x,y,z,dims,mat,solid=False,bevel=0):return box(name+label,at(x,y,z),dims,mat,axes,solid,bevel)
 envelope=at(0,-24,16)
 if not clear(envelope,(width+4,190,92),axes):return False
 foundations=[]
 def inhabited_wall(label,face,tangent,normal,span,height,mat,floors=None,gallery_floors=(),seed_offset=0):
  # Masonry piers and spandrels surround actual recessed openings. The glass
  # sits 1.4–4.2 m behind the facade; there are no black sticker surrounds.
  wall_axes=(tangent,up,-normal);floor_h=3.65;floors=floors or max(1,round(height/floor_h));height=floors*floor_h
  bays=max(2,round(span/7.3));pitch=span/bays;opening=min(4.7,pitch-1.6);pier=pitch-opening
  for j in range(bays+1):
   q=face+tangent*(-span/2+j*pitch)+up*height/2
   box(label+' bearing masonry pier',q,(pier,height,1.15),mat,wall_axes)
  for row in range(floors):
   y=row*floor_h;gallery=row in gallery_floors
   if gallery:
    box(label+' deep access gallery floor',face-normal*2.1+up*(y+.16),(span,.32,5.8),concrete,wall_axes)
    box(label+' recessed gallery handrail',face+normal*.6+up*(y+1.12),(span,.12,.14),iron,wall_axes)
    for j in range(bays+1):box(label+' gallery railing post',face+tangent*(-span/2+j*pitch)+normal*.6+up*(y+.64),(.12,1.25,.16),iron,wall_axes)
   else:
    box(label+' broad quiet spandrel',face+up*(y+.48),(span,.96,1.1),mat,wall_axes)
    box(label+' upper stone lintel',face+up*(y+3.47),(span,.36,1.1),mat,wall_axes)
   for bay in range(bays):
    x=-span/2+(bay+.5)*pitch
    # Quiet wall bays group the rooms and break the old uniform window grid.
    quiet=(bay+seed_offset)%5==3 and not gallery
    if quiet:
     box(label+' quiet masonry wall bay',face+tangent*x+up*(y+2.15),(opening,2.4,1.1),mat,wall_axes)
     continue
    recess=4.2 if gallery else 1.45
    q=face+tangent*x-normal*recess+up*(y+2.05)
    box(label+' room rear wall',q-normal*.38,(opening,2.75,.65),brick if gallery else mat,wall_axes)
    warm_room=gallery and (bay+row)%3!=2
    occupied=warm if warm_room else dim if (bay*3+row+seed_offset)%9==0 else glass
    for pane in [-1,1]:
     box(label+(' court lower gallery occupied window' if gallery else ' upper residential rooms occupied window'),q+tangent*(pane*.93)+normal*.38,(1.55,2.25,.055),occupied,wall_axes)
    box(label+' stone room sill',face+tangent*x-normal*(recess*.5)+up*(y+.87),(opening,.23,recess+.9),limestone,wall_axes)
 def civil_base(label,x,z,w,d,floor):
  # A rooted rear retaining range and separated forward buttresses expose
  # infrastructure voids. Occupied lower galleries replace the old flat
  # black pedestal wherever the terrain actually leaves a visible face.
  front=z-d/2;rear_center=z+5.5;rear_depth=d-11
  corners=[at(x+dx,0,rear_center+dz) for dx,dz in [(-w/2,-rear_depth/2),(w/2,-rear_depth/2),(w/2,rear_depth/2),(-w/2,rear_depth/2)]]
  bottoms=[min(land_height(q.x,q.z)-3,base.y+floor-2) for q in corners]
  vs=[(q.x,y,q.z) for q,y in zip(corners,bottoms)]+[(q.x,base.y+floor,q.z) for q in corners]
  mesh(label+' rooted rear retaining range',vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],aggregate,True)
  pier_count=max(3,math.ceil(w/22));pitch=(w-6)/(pier_count-1)
  for j in range(pier_count):
   xx=x-w/2+3+j*pitch;q=at(xx,0,front+2.6);bottom=min(land_height(q.x,q.z)-4,base.y+floor-2);height=base.y+floor-bottom
   box(label+' rooted civil buttress',Vector((q.x,bottom+height/2,q.z)),(5.5,height,6),concrete,axes,True,.12)
   foundations.append({'name':label,'p':[q.x,bottom,q.z],'top':base.y+floor,'terrain':land_height(q.x,q.z)})
  part(label+' continuous bearing beam',x,floor-1,front+3,(w+1,2.0,7),concrete,True,.12)
  for level in [floor-25.55,floor-7.3]:
   q=at(x,level,front+4)
   if land_height(q.x,q.z)>q.y-3:continue
   part(label+' lower occupied gallery core',x,level+3.65,front+12.3,(w-6,7.3,5),brick)
   inhabited_wall(label+' court lower gallery',at(x,level,front+4.8),along,-out,w-7,7.3,brick,2,(0,1),seed+3)
  part(label+' founded residential bearing deck',x,floor+.1,z,(w+.6,.6,d+.6),concrete,True,.1)
 def housing_range(label,x,z,w,d,floor,height,inner_side,seed_offset):
  civil_base(label,x,z,w,d,floor)
  # L-shaped depth is left open on the street and court elevations. Upper
  # rooms stand behind real five-metre galleries, with individual room bays.
  part(label+' loadbearing occupied core',x-inner_side*2.5,floor+height/2,z+2.5,(w-5,height,d-5),plaster,True,.14)
  front=at(x,floor,z-d/2)
  inhabited_wall(label+' street elevation',front,along,-out,w,height,plaster,seed_offset=seed_offset)
  inner_normal=along*inner_side;court_face=at(x+inner_side*w/2,floor,z)
  gallery_rows=(4,5,6) if height<40 else (6,7,8)
  inhabited_wall(label+' inhabited court elevation',court_face,out,inner_normal,d,height,plaster,gallery_floors=gallery_rows,seed_offset=seed_offset+2)
  # The exposed outer end is a quiet wall with a single grouped stair recess.
  outer_x=x-inner_side*w/2
  part(label+' quiet outer end wall',outer_x,floor+height/2,z,(1,height,d),plaster)
  part(label+' roof bearing cornice',x,floor+height+.25,z,(w+1.2,.5,d+1.2),limestone)
  part(label+' recessed weathered zinc roof',x,floor+height+.55,z,(w-.8,.14,d-.8),zinc)
  for zz in [-d/2,d/2]:part(label+' masonry roof parapet',x,floor+height+1.0,z+zz,(w+.8,1.2,.5),limestone)
  # A narrow setback stair landing is residential, not a separate tower cap.
  stair=at(outer_x+inner_side*.7,floor+height/2,z+6);fa=(out,up,along*inner_side)
  for row in range(1,round(height/3.65),3):
   q=at(outer_x-inner_side*.56,floor+row*3.65+1.8,z+6)
   box(label+' upper residential rooms stair window',q,(2.2,2.4,.055),glass,fa)
 housing_range(name+'low approach range',-43,2,70,40,-12,36.5,1,seed)
 housing_range(name+'setback downhill return',61,23,34,30,-18,25.55,-1,seed+11)
 housing_range(name+'rear residential corner',65,44,26,26,-12,58.4,-1,seed+23)
 # The rear range is lower and warm, closing a genuine 52 m-wide court rather
 # than another street wall. The near/far wings frame it from the saved view.
 civil_base(name+'recessed rear gallery',19,28,50,16,-5)
 part('court lower gallery rear living range',19,9.6,30.5,(50,29.2,11),brick,True,.12)
 inhabited_wall(name+'court lower gallery rear homes',at(19,-5,20),along,-out,50,29.2,brick,8,(0,1,2,3,4,5),seed+19)
 part('rear gallery roof cornice',19,24.5,28,(51,.6,17),limestone)
 part('rear gallery weathered zinc roof',19,24.9,28,(50,.14,16),zinc)
 # Two broad court levels descend into the inhabited recess. Their civil
 # structure remains visible from below, with service rooms under the street.
 civil_base(name+'court entry rooms upper undercroft',18,-13,52,18,-1.6)
 civil_base(name+'court lower gallery undercroft',18,11,52,18,-5.6)
 part('open upper court paving',18,-1.0,-13,(52,.6,18),limestone,True,.06)
 part('open lower court paving',18,-5.0,11,(52,.6,18),limestone,True,.06)
 # A human-scale stair, 0.18 m rise and 0.27 m tread, connects the court levels.
 for i in range(22):
  y=-1.0-(i+.5)*4/22;z=-4+(i+.5)*6/22
  part('court descending stair tread',18,y,z,(8,.18,6/22+.03),concrete)
 for side in [-1,1]:
  a=at(18+side*3.8,.12,-4);b=at(18+side*3.8,-3.88,2);direction=(b-a).normalized();across=along.cross(direction).normalized()
  box(name+'court stair handrail',(a+b)/2,(.12,.12,(b-a).length),iron,(along,across,direction))
 # One continuous side street drops with the neighborhood, and meets the
 # court entry; its lower galleries are occupied rather than blank supports.
 for x,y,w in [(-61,0,36),(-25,-1,36),(11,-1,36),(47,-8,36),(73,-15,16)]:
  part('descending residential access terrace',x,y-.4,-25.5,(w,.8,7),concrete,True,.08)
  part('street terrace outer parapet',x,y+.7,-29,(w,1.3,.4),limestone)
 for x0,y0,x1,y1 in [(29,-1,43,-8),(65,-8,79,-15)]:
  # Short stair flights follow the descending side street at human tread size.
  steps=39
  for i in range(steps):part('side street descending stair',x0+(i+.5)*(x1-x0)/steps,y0+(i+.5)*(y1-y0)/steps,-25.5,((x1-x0)/steps+.02,.18,4),concrete)
 # A single shielded architectural wash lights the occupied recess and stone
 # returns. It feeds an existing pooled slot rather than adding runtime lights.
 # A courtyard flood standard sits between the enclosing walls. Its throw
 # reaches the rear rooms from 30 m away instead of bleaching nearby masonry.
 q=at(18,17.1,-10)
 part('court wash founded standard',18,8.1,-10,(.42,17.8,.42),iron,True,.04)
 part('court wash standard foot',18,-.65,-10,(1.5,.3,1.5),iron)
 part('court wash substantial shield',18,17.4,-10,(3.8,.8,1.8),iron)
 part('court wash recessed lens',18,16.95,-9.7,(3.1,.12,1.0),fixture)
 lights.append({'p':list(q+out*.7-up*.7),'power':1000,'color':'#efd1a6','radius':70,'pocket':True})
 terrace_court_summary.update({'lot':['Terrace Ward',-1,0,9],'base':list(base),'footprintLocal':{'x':[-79,79],'out':[-29.2,57.6]},'courtMouth':[-8,44],'courtDepth':42,'roofDatums':[24.5,7.55,46.4],'foundationSamples':foundations,'objects':len(objects)-first_object,'solidPieces':len(solids)-first_solid})
 return True

terrace_slope_summary=[]
def terrace_occupied_slope(name,base,width,depth,axes,lot_index,neighbor=False):
 # Replace the entire raised plot with a piece of the inhabited slope. Small
 # structural ranges follow their own ground datums, while real stairs and
 # occupied lower streets join them. No full-width, level civil podium remains.
 along,up,out=axes;name+=' / ';first_object=len(objects);first_solid=len(solids);foundations=[];ranges=[]
 def at(x,y,z):return base+along*x+up*y+out*z
 def part(label,c,dims,mat,solid=False):return box(name+label,c,dims,mat,axes,solid,.08 if solid else 0)
 def elevation(label,origin,w,h,skin,seed,lower=False):
  count=max(2,round(w/10.5));pitch=w/count;opening=5.1;floors=round(h/3.65)
  for j in range(count+1):
   q=origin+along*(-w/2+j*pitch)+up*h/2
   part(label+' structural bay pier',q,(pitch-opening,h,1.05),skin)
  for row in range(floors):
   y=row*3.65;gallery=(lower and seed%8==0) or (not lower and row in (3,4) and seed%3==1)
   if gallery:
    part(label+' occupied gallery deck',origin+out*2.1+up*(y+.16),(w,.32,5.6),concrete)
    part(label+' iron gallery handrail',origin-out*.55+up*(y+1.1),(w,.12,.14),iron)
    for j in range(count+1):part(label+' gallery rail upright',origin+along*(-w/2+j*pitch)-out*.55+up*(y+.64),(.12,1.3,.15),iron)
   else:
    part(label+' quiet masonry spandrel',origin+up*(y+.6),(w,1.2,1.1),skin)
    part(label+' bearing window lintel',origin+up*(y+3.4),(w,.5,1.1),skin)
   for j in range(count):
    center=origin+along*(-w/2+(j+.5)*pitch)+up*(y+2.15)
    if (j+seed)%4==2 and row>2 and not gallery:
     part(label+' quiet wall bay',center,(opening,2.1,1.05),skin)
     continue
    recess=3.9 if gallery else 1.35
    part(label+' recessed room wall',center+out*(recess+.32),(opening,2.7,.62),brick if gallery else skin)
    for pane in [-1,1]:
     material=warm if (gallery or lower) and (j+row+seed)%4==0 else dim if (j+row*3+seed)%10==0 else glass
     part(label+(' court lower gallery occupied window' if gallery or lower else ' upper residential rooms occupied window'),center+along*(pane*1.06)+out*(recess-.02),(1.72,2.15,.055),material)
    part(label+' deep stone sill',center-up*1.13+out*(recess*.5),(opening,.24,recess+1.0),limestone)
 def block(label,x,z,w,d,h,skin,seed):
  center=at(x,0,z);corners=[center+along*xx+out*zz for xx,zz in [(-w/2,-d/2),(w/2,-d/2),(w/2,d/2),(-w/2,d/2)]]
  ground=[land_height(p.x,p.z) for p in corners];floor=max(ground)+2.5
  if max(ground)-min(ground)>55:raise ValueError(name+' slope range crosses an unsupported terrain step '+label)
  low=min(ground)-4;envelope=Vector((center.x,(low+floor+h+4)/2,center.z))
  if not clear(envelope,(w+3,floor+h+4-low,d+6),axes):raise ValueError(name+' slope range intersects race envelope '+label)
  c=Vector((center.x,floor,center.z));front=c-out*d/2
  # The rear range retains the hillside; substantial occupied brick floors
  # close the downhill face all the way into the slope. Sparse recessed
  # access levels interrupt this masonry body without turning it into stilts.
  rear_center=center+out*4;rear_d=d-8
  rear_corners=[rear_center+along*xx+out*zz for xx,zz in [(-w/2,-rear_d/2),(w/2,-rear_d/2),(w/2,rear_d/2),(-w/2,rear_d/2)]]
  bottoms=[min(land_height(p.x,p.z)-4,floor-2) for p in rear_corners]
  vs=[(p.x,y,p.z) for p,y in zip(rear_corners,bottoms)]+[(p.x,floor,p.z) for p in rear_corners]
  mesh(name+label+' slope-rooted retaining range',vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],aggregate,True)
  for xx in [-w/2+1.8,0,w/2-1.8]:
   p=center+along*xx-out*(d/2-2);bottom=min(land_height(p.x,p.z)-4,floor-2)
   part(label+' founded civil cheek',Vector((p.x,(bottom+floor)/2,p.z)),(3.6,floor-bottom,4.8),concrete,True);objects.pop()
   foundations.append({'name':label,'p':[p.x,bottom,p.z],'terrain':land_height(p.x,p.z),'top':floor})
  part(label+' bearing ground deck',c+up*.2,(w+1,.8,d+1),concrete,True)
  front_ground=[land_height((front+along*xx).x,(front+along*xx).z) for xx in [-w/2,0,w/2]]
  lower_floors=max(2,math.ceil((floor-min(front_ground)+4)/3.65));lowest=floor-lower_floors*3.65
  for row in range(-lower_floors,0):
   y=floor+row*3.65;point=front.copy();point.y=y
   part(label+' continuous occupied brick lower body',point+out*6.4+up*1.8,(w,3.65,3.1),brick)
   elevation(name+label+' rooted lower homes',point,w,3.65,brick,seed+row,True)
  # Deep brick side returns close the full section, with their bottom edge
  # cut to and embedded in actual ground rather than hanging from a deck.
  for sign in [-1,1]:
   xx=sign*(w/2-.65);end_corners=[center+along*(xx+dx)+out*zz for dx,zz in [(-.65,-d/2),(.65,-d/2),(.65,d/2),(-.65,d/2)]]
   bottoms=[min(land_height(q.x,q.z)-4,floor-1) for q in end_corners]
   vs=[(q.x,y,q.z) for q,y in zip(end_corners,bottoms)]+[(q.x,floor,q.z) for q in end_corners]
   mesh(name+label+' full-depth grounded brick return',vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],brick,True)
   for q,y in zip(end_corners,bottoms):foundations.append({'name':label+' brick return','p':[q.x,y,q.z],'terrain':land_height(q.x,q.z),'top':floor})
  part(label+' lower body buried brick toe',Vector((front.x,lowest-.4,front.z))+out*3.5,(w,1,7),brick)
  # Broad physical envelopes remain cheap; facade piers, gallery rails and
  # room depth are presentation detail outside the driving corridor.
  part(label+' occupied rear core',c+out*2.5+up*h/2,(w,h,d-5),skin,True)
  elevation(name+label+' street homes',front,w,h,skin,seed)
  for sign in [-1,1]:
   end=c+along*(sign*(w/2-.5))+out*2.5
   part(label+' solid masonry end',end+up*h/2,(1,h,d-5),skin)
   side_axes=(out,up,-along*sign)
   for floor_i in range(1,round(h/3.65),3):
    p=end+along*(sign*.52)+out*(d*.14)+up*(floor_i*3.65+1.8)
    box(name+label+' recessed residential stair window',p,(2.1,2.3,.055),dim if floor_i%4==1 else glass,side_axes)
  roof=c+up*h
  part(label+' substantial masonry cornice',roof+up*.3,(w+1.2,.6,d+1.2),limestone)
  if seed%2:
   vertices=[tuple(roof+along*xx+out*zz+up*.6) for xx,zz in [(-w/2-1,-d/2-1),(w/2+1,-d/2-1),(w/2+1,d/2+1),(-w/2-1,d/2+1)]]+[tuple(roof+along*xx+up*3.5) for xx in [-w/2-1,w/2+1]]
   mesh(name+label+' pitched zinc street roof',vertices,[(0,1,5,4),(3,4,5,2),(0,4,3),(1,2,5)],zinc)
  else:
   part(label+' sheltered zinc terrace roof',roof+up*.62,(w-.8,.12,d-.8),zinc)
   for zz in [-d/2,d/2]:part(label+' stone roof edge',roof+out*zz+up*.95,(w+.6,1.2,.45),limestone)
  street=c-out*(d/2+3.8)
  part(label+' connected lower street',street+up*.18,(w+1,.55,7.4),limestone,True)
  # Retaining cheeks continue below the side street; the promenade is not a
  # floating slab. These shallow brackets are decorative, with a broad deck.
  for xx in [-w/2+3,0,w/2-3]:part(label+' access terrace bearing bracket',street+along*xx+out*2.1-up*1.4,(1.1,3.1,5.2),concrete)
  part(label+' street outer handrail',street-out*3.3+up*1.1,(w,.12,.15),iron)
  for xx in [-w/2+1,0,w/2-1]:part(label+' street railing upright',street+along*xx-out*3.3+up*.65,(.12,1.3,.15),iron)
  ranges.append({'label':label,'base':c,'width':w,'depth':d,'height':h,'street':street,'x':x,'z':z})
  return ranges[-1]
 if neighbor:
  # The formerly dominant 65 m corner is a low inhabited street return. Its
  # rear stair house frames the court without closing its downhill prospect.
  a=block('low downhill court neighbor',0,9,min(64,width-18),23,18.25,brick,2)
  block('recessed neighbor stair house',width*.25,20,18,17,32.85,plaster,5)
 else:
  count=2 if lot_index==10 else 3;usable=width-22;gap=8;span=(usable-gap*(count-1))/count
  for i in range(count):
   x=-usable/2+span/2+i*(span+gap);h=([47.45,36.5] if lot_index==10 else [43.8,32.85,40.15])[i]
   block('descending occupied range '+str(i+1),x,-5+(i%2)*3,span,25,h,brick if i==0 and lot_index==10 else plaster,lot_index+i)
  # Short upper ranges attach behind the street front, leaving one deep
  # cross-street rather than a parallel unbroken wall along the whole lot.
  if lot_index==10:block('uphill brick stair return',-usable*.24,18,usable*.46,19,29.2,brick,23)
  else:
   block('setback upper residential return',-usable*.27,15.5,usable*.40,12,32.85,plaster,32)
   block('lower workshop return',usable*.30,15,usable*.34,12,21.9,brick,35)
 # Descending intermediate streets connect adjoining masses. Human-sized
 # dogleg stair flights fit the 8 m slots; no giant ramp or blank filled base.
 fronts=[r for r in ranges if r['label'].startswith('descending')]
 for a,b in zip(fronts,fronts[1:]):
  x=(a['x']+a['width']/2+b['x']-b['width']/2)/2;z=-22
  top=max(a['base'].y,b['base'].y);bottom=min(a['base'].y,b['base'].y);rise=top-bottom;flights=max(2,math.ceil(rise/3.65));flight_rise=rise/flights
  for k in range(flights):
   steps=math.ceil(flight_rise/.18);run=steps*.27;direction=1 if k%2==0 else -1;startz=z if direction==1 else z+run;starty=top-k*flight_rise
   for j in range(steps):
    p=at(x+(-1.7 if direction==1 else 1.7),0,startz+direction*(j+.5)*.27);p.y=starty-(j+.5)*flight_rise/steps
    part('public cross-street stair tread',p,(3,.18,.29),concrete)
   landing=at(x,0,z+run if direction==1 else z);landing.y=starty-flight_rise
   part('public dogleg stair landing',landing,(7.4,.5,2.4),concrete)
  # The rear masonry stair spine visibly roots the public circulation, with
  # broad physical representation rather than a collider per small tread.
  p=at(x,0,z+4);bottom_ground=land_height(p.x,p.z)-4
  part('grounded public stair spine',Vector((p.x,(bottom_ground+top)/2,p.z)),(1.2,top-bottom_ground,9),brick,True)
  foundations.append({'name':'stair spine','p':[p.x,bottom_ground,p.z],'terrain':land_height(p.x,p.z),'top':top})
 for r in ranges:
  # A low under-gallery glow replaces the camera-facing cream promenade spot.
  if r['label'] not in ['uphill brick stair return','lower workshop return']:continue
  q=r['base']-out*(r['depth']/2-.3)+up*3.0
  part('recessed lower entrance hood',q,(1.8,.4,1.1),iron)
  part('recessed lower entrance lens',q-up*.22,(1.2,.06,.6),fixture)
  lights.append({'p':list(q-up*.7+out*.5),'power':380,'color':'#d7b58d','radius':18,'pocket':True})
 terrace_slope_summary.append({'lot':['Terrace Ward',-1 if neighbor else 1,0,lot_index],'ranges':[{'name':r['label'],'base':list(r['base']),'width':r['width'],'depth':r['depth'],'height':r['height']} for r in ranges],'foundations':foundations,'objects':len(objects)-first_object,'solidPieces':len(solids)-first_solid})
 return True

reservoir_quarter_summary={}
def reservoir_worker_quarter(name,base,width,depth,axes):
 # Two former repeated lots become one descending workers' lane. Its diagonal
 # follows the production chase sightline through the first gate; the market
 # arcade sits on the lower street datum rather than the old high rear plinth.
 along,up,out=axes;name+=' / ';first_object=len(objects);first_solid=len(solids);foundations=[];ranges=[]
 lane_forward=(along*.584+out*.812).normalized();lane_cross=up.cross(lane_forward).normalized()
 def at(x,y,z):return Vector((base.x,0,base.z))+along*x+out*z+up*y
 def world_mesh(label,vertices,faces,mat,solid=False):return mesh(name+label,[tuple(p) for p in vertices],faces,mat,solid)
 def room_wall(label,face,tangent,normal,span,height,skin,seed,public=False):
  fa=(tangent,up,-normal);floor_h=3.65;floors=max(1,round(height/floor_h));height=floors*floor_h;bays=max(2,round(span/9.6));pitch=span/bays;opening=min(4.9,pitch-1.8)
  for j in range(bays+1):box(name+label+' thick structural pier',face+tangent*(-span/2+j*pitch)+up*height/2,(pitch-opening,height,1.05),skin,fa)
  for row in range(floors):
   y=row*floor_h
   box(name+label+' solid masonry spandrel',face+up*(y+.57),(span,1.14,1.1),skin,fa)
   box(name+label+' bearing stone lintel',face+up*(y+3.47),(span,.36,1.1),skin,fa)
   for bay in range(bays):
    q=face+tangent*(-span/2+(bay+.5)*pitch)+up*(y+2.1)
    if (bay+seed)%5==3 and row>1 and not public:
     box(name+label+' quiet masonry wall bay',q,(opening,2.25,1.1),skin,fa);continue
    box(name+label+' deep room rear masonry',q-normal*1.7,(opening,2.7,.8),skin,fa)
    occupied=warm if (public and (bay+row)%3!=2) or (not public and (bay+row*2+seed)%9==0) else dim if (bay+row+seed)%7==0 else glass
    for pane in [-1,1]:box(name+label+(' court entry rooms occupied window' if public else ' upper residential rooms occupied window'),q+tangent*(pane*1.05)-normal*1.25,(1.7,2.2,.055),occupied,fa)
    box(name+label+' deep masonry sill',q-normal*.7-up*1.15,(opening,.24,2.2),limestone,fa)
 def founded_range(label,center,w,d,desired_floor,height,building_axes,skin,seed):
  a,u,o=building_axes;corners=[center+a*x+o*z for x,z in [(-w/2,-d/2),(w/2,-d/2),(w/2,d/2),(-w/2,d/2)]];ground=[land_height(q.x,q.z) for q in corners]
  floor=max(desired_floor,max(ground)+.8)
  if floor-desired_floor>6:raise ValueError(name+label+' crosses a high terrain datum')
  bottom=min(ground)-4;envelope=Vector((center.x,(bottom+floor+height+4)/2,center.z))
  if not clear(envelope,(w+4,floor+height+4-bottom,d+5),building_axes):raise ValueError(name+label+' intersects race envelope')
  origin=Vector((center.x,floor,center.z));front=origin-o*d/2
  # Sloped foundations and occupied lower floors share one loadbearing body.
  # Its front/approach facades reach below the lowest visible ground contact.
  core_corners=[center+a*x+o*z for x,z in [(-w/2+2,-d/2+2),(w/2-2,-d/2+2),(w/2-2,d/2-2),(-w/2+2,d/2-2)]]
  bottoms=[min(land_height(q.x,q.z)-4,floor-2) for q in core_corners]
  world_mesh(label+' slope-seated brick foundation',[Vector((q.x,y,q.z)) for q,y in zip(core_corners,bottoms)]+[Vector((q.x,floor,q.z)) for q in core_corners],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],brick,True)
  for q,y in zip(core_corners,bottoms):foundations.append({'name':label,'p':[q.x,y,q.z],'terrain':land_height(q.x,q.z),'top':floor})
  lower_floors=max(1,math.ceil((floor-min(ground)+4)/3.65));low=floor-lower_floors*3.65
  for normal,tangent,span,offset in [(-o,a,w,d/2),(-a,o,d,w/2)]:
   face=origin+normal*offset
   room_wall(label+' grounded lower workers homes',face-up*(floor-low),tangent,normal,span,floor-low,brick,seed+3,False)
   room_wall(label+' upper street homes',face,tangent,normal,span,height,skin,seed)
  box(name+label+' occupied central masonry',origin+up*height/2,(w-4,height,d-4),skin,building_axes,True,.13)
  # The other two elevations are genuine quiet masonry backs. Their sloped
  # lower returns close the section into the hill instead of exposing stilts.
  for normal,tangent,span,offset,back_depth in [(o,a,w,d/2,d), (a,o,d,w/2,w)]:
   face=origin+normal*(offset-.5);box(name+label+' quiet rear wall',face+up*height/2,(span,height,1),skin,(tangent,up,-normal))
   points=[center+normal*(offset+z)+tangent*x for x,z in [(-span/2,-1),(span/2,-1),(span/2,0),(-span/2,0)]];ys=[min(land_height(q.x,q.z)-4,floor-2) for q in points]
   world_mesh(label+' grounded full-depth rear return',[Vector((q.x,y,q.z)) for q,y in zip(points,ys)]+[Vector((q.x,floor,q.z)) for q in points],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],brick,True)
   for q,y in zip(points,ys):foundations.append({'name':label+' rear return','p':[q.x,y,q.z],'terrain':land_height(q.x,q.z),'top':floor})
  roof=origin+up*height;box(name+label+' quiet masonry cornice',roof+up*.3,(w+1.2,.6,d+1.2),limestone,building_axes)
  vs=[roof+a*x+o*z+up*.6 for x,z in [(-w/2-1,-d/2-1),(w/2+1,-d/2-1),(w/2+1,d/2+1),(-w/2-1,d/2+1)]]+[roof+a*x+up*3.2 for x in [-w/2-1,w/2+1]]
  world_mesh(label+' pitched weathered zinc roof',vs,[(0,1,5,4),(3,4,5,2),(0,4,3),(1,2,5)],zinc)
  box(name+label+' thin folded ridge',roof+up*3.25,(w+2,.22,.5),zinc,building_axes)
  ranges.append({'name':label,'base':list(origin),'dimensions':[w,height,d],'groundRange':[min(ground),max(ground)]})
  return origin
 lane_origin=at(-35,base.y,-25)
 # Unequal street wings leave a wide visual opening while the actual service
 # carriageway is only 9.5 m wide. This is a place inside the city, not another
 # full-width racing road or a cloned square courtyard.
 low_center=lane_origin+lane_forward*46+lane_cross*32
 low=founded_range('low approaching workers wing',low_center,54,21,base.y-1.8,21.9,(lane_forward,up,lane_cross),brick,21)
 right_center=lane_origin+lane_forward*76-lane_cross*34
 right=founded_range('stepped downstream residential wing',right_center,70,23,base.y-4.2,32.85,(lane_forward,up,-lane_cross),plaster,28)
 rear=founded_range('offset rear workers return',at(-26,base.y,105),56,21,base.y+1.4,36.5,axes,brick,34)
 # The lane passes through the removed frontage to a lower, warmly inhabited
 # arcade. Its floor is pinned to the sampled street/ground datum (~3955 m).
 arcade_center=at(45,base.y-2.8,100);arcade_axes=(lane_cross,up,lane_forward);arcade_w=40;arcade_d=22
 arcade_corners=[arcade_center+lane_cross*x+lane_forward*z for x,z in [(-arcade_w/2,-11),(arcade_w/2,-11),(arcade_w/2,11),(-arcade_w/2,11)]];arcade_ground=[land_height(q.x,q.z) for q in arcade_corners]
 arcade_floor=max(base.y-2.8,max(arcade_ground)+.8)
 if arcade_floor>base.y+2:raise ValueError(name+' arcade would rise above the visible lower street')
 arcade_center.y=arcade_floor;arcade_front=arcade_center-lane_forward*11
 if not clear(arcade_center+up*7,(arcade_w+4,21,27),arcade_axes):raise ValueError(name+' market arcade intersects race envelope')
 bottoms=[min(land_height(q.x,q.z)-4,arcade_floor-2) for q in arcade_corners]
 world_mesh('market arcade rooted foundation',[Vector((q.x,y,q.z)) for q,y in zip(arcade_corners,bottoms)]+[Vector((q.x,arcade_floor,q.z)) for q in arcade_corners],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],brick,True)
 for q,y in zip(arcade_corners,bottoms):foundations.append({'name':'market arcade','p':[q.x,y,q.z],'terrain':land_height(q.x,q.z),'top':arcade_floor})
 box(name+' market arcade deep occupied rear',arcade_center+lane_forward*4+up*7.3,(arcade_w,14.6,14),brick,arcade_axes,True,.12)
 for bay in range(6):
  x=-arcade_w/2+bay*arcade_w/5;q=arcade_front+lane_cross*x
  box(name+' market arcade stone pier',q+up*2.5,(1.4,5,2.2),limestone,arcade_axes,True,.06)
  if bay<5:
   arch(name+' open market stone arch',q+lane_cross*(arcade_w/10)+up*5,arcade_w/5,2.0,.68,2.2,limestone,arcade_axes)
   door=q+lane_cross*(arcade_w/10)+lane_forward*6.9+up*2.5
   box(name+' market court entry rooms shop glazing',door,(5.7,4.2,.055),warm if bay%3!=1 else dim,arcade_axes)
   for mullion in [-1,1]:box(name+' market shop glazing mullion',door+lane_cross*(mullion*1.9)-lane_forward*.06,(.12,4.2,.16),iron,arcade_axes)
 box(name+' market gallery bearing floor',arcade_front+lane_forward*3.5+up*7.6,(arcade_w+1,.6,8),concrete,arcade_axes,True,.1)
 room_wall('market court entry rooms upper gallery',arcade_front+lane_forward*1.2+up*7.9,lane_cross,-lane_forward,arcade_w,7.3,plaster,42,True)
 box(name+' market gallery roof cornice',arcade_center+up*15.5,(arcade_w+2,.6,24),limestone,arcade_axes)
 box(name+' market sheltered zinc roof',arcade_center+up*15.9,(arcade_w,.18,22),zinc,arcade_axes)
 for bay in [1,3]:
  q=arcade_front+lane_cross*(-arcade_w/2+(bay+.5)*arcade_w/5)+lane_forward*4.2+up*5.5
  box(name+' arcade shielded interior hood',q,(1.8,.45,1.2),iron,arcade_axes)
  box(name+' arcade sheltered lamp lens',q-up*.24,(1.2,.06,.6),fixture,arcade_axes)
  lights.append({'p':list(q-up*.8),'power':520,'color':'#e1bd92','radius':23,'pocket':True})
 # A sloping public lane with real edge walls links the original near street
 # to the lower arcade. Its narrow retaining section sits inside occupied
 # ranges; it never recreates a 160 m-wide raised civil block.
 lane_start=lane_origin;lane_end=arcade_front-lane_forward*7;lane_end.y=arcade_floor-.35;length=(Vector((lane_end.x,0,lane_end.z))-Vector((lane_start.x,0,lane_start.z))).length
 for i in range(12):
  t0=i/12;t1=(i+1)/12;a=lane_start.lerp(lane_end,t0);b=lane_start.lerp(lane_end,t1)
  verts=[a+lane_cross*x for x in [-4.75,4.75]]+[b+lane_cross*x for x in [-4.75,4.75]]
  lower=[Vector((p.x,min(land_height(p.x,p.z)-3,p.y-1),p.z)) for p in verts]
  world_mesh('continuous descending workers lane',lower+verts,[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],aggregate,True)
  world_mesh('workers lane worn paving',verts,[(0,1,3,2)],limestone)
  for sign in [-1,1]:
   aa=a+lane_cross*(sign*4.75)+up*.2;bb=b+lane_cross*(sign*4.75)+up*.2;direction=(bb-aa).normalized();normal=lane_cross.cross(direction).normalized()
   box(name+' descending street stone curb',(aa+bb)/2,(.4,.4,(bb-aa).length+.03),limestone,(lane_cross,normal,direction))
  for p in lower:foundations.append({'name':'workers lane','p':list(p),'terrain':land_height(p.x,p.z),'top':max(a.y,b.y)})
 plaza=arcade_front-lane_forward*6;plaza.y=arcade_floor-.35
 plaza_corners=[plaza+lane_cross*x+lane_forward*z for x,z in [(-18.5,-6),(18.5,-6),(18.5,6),(-18.5,6)]]
 plaza_bottoms=[min(land_height(q.x,q.z)-3,plaza.y-1) for q in plaza_corners]
 world_mesh('market forecourt short rooted base',[Vector((q.x,y,q.z)) for q,y in zip(plaza_corners,plaza_bottoms)]+[Vector((q.x,plaza.y,q.z)) for q in plaza_corners],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],brick,True)
 for q,y in zip(plaza_corners,plaza_bottoms):foundations.append({'name':'market forecourt','p':[q.x,y,q.z],'terrain':land_height(q.x,q.z),'top':plaza.y})
 box(name+' market street small public forecourt',plaza,(37,.7,12),limestone,arcade_axes,True,.08)
 for wing,normal in [(low,-lane_cross),(right,lane_cross)]:
  front=wing+normal*11.5;direction=lane_origin+lane_forward*((front-lane_origin).dot(lane_forward));direction.y=base.y+(lane_end.y-base.y)*max(0,min(1,(front-lane_origin).dot(lane_forward)/length))
  public_stairs(name+' inhabited side street access',front+up*.5,direction+up*.5,4.5)
 reservoir_quarter_summary.update({'removedLots':[['Reservoir Ward',1,0,3],['Reservoir Ward',1,1,3]],'laneStart':list(lane_start),'laneEnd':list(lane_end),'arcadeCenter':list(arcade_center),'arcadeOccupiedBand':[arcade_floor+2,arcade_floor+14.6],'ranges':ranges,'foundationSamples':foundations,'objects':len(objects)-first_object,'solidPieces':len(solids)-first_solid})
 return True

contour_quarter_summary={}
def contour_worker_quarter():
 # This is the distant right-hand district in the upper-city driving camera.
 # Eight parallel slabs become two bent, unequal wings separated by a broad
 # transverse stair court. Their lower homes enter the slope, without raised
 # civil tables; the rear gallery sits well below the two roof silhouettes.
 name='Terrace contour workers quarter / ';first_object=len(objects);first_solid=len(solids);foundations=[];ranges=[]
 def world_mesh(label,vs,fs,mat,solid=False):return mesh(name+label,[tuple(p) for p in vs],fs,mat,solid)
 def wall(label,face,tangent,normal,span,low,high,skin,seed,public=False,gallery=False):
  axes=(tangent,UP,-normal);pitch=9.2;bays=max(2,round(span/pitch));pitch=span/bays;opening=min(4.7,pitch-2.4);floor_h=3.65;floors=round((high-low)/floor_h)
  for j in range(bays+1):
   box(name+label+' structural masonry bay',face+tangent*(-span/2+j*pitch)+UP*((low+high)/2),(pitch-opening,high-low,1.35),skin,axes)
  for row in range(floors):
   y=low+row*floor_h;open_gallery=gallery and row==1
   box(name+label+' bearing floor edge',face+UP*(y+.32),(span,.64,1.4),skin,axes)
   box(name+label+' quiet stone lintel',face+UP*(y+3.47),(span,.36,1.6),limestone,axes)
   for j in range(bays):
    x=-span/2+(j+.5)*pitch;q=face+tangent*x+UP*(y+2.08)
    if not public and not open_gallery and ((j+seed)%5==2 or ((j+seed)%5==4 and row>2)):
     box(name+label+' quiet solid wall section',q,(opening,2.35,1.35),skin,axes);continue
    recess=4.8 if open_gallery else 1.65
    box(name+label+' recessed room back',q-normal*(recess+.4),(opening,2.8,.8),skin,axes)
    lit=warm if public and (j+row)%3!=1 else dim if (j+row*3+seed)%11==0 else glass
    for k in [-1,1]:
     box(name+label+(' court lower gallery occupied window' if public else ' grouped residential occupied window'),q+tangent*(k*1.06)-normal*recess,(1.75,2.22,.05),lit,axes)
    box(name+label+' deep sill and reveal floor',q-normal*(recess/2)-UP*1.2,(opening,.24,recess+1.6),limestone,axes)
    if open_gallery:
     box(name+label+' open gallery parapet',q-normal*.4-UP*.65,(opening,.75,.18),iron,axes)
     box(name+label+' gallery roof soffit',q-normal*2.1+UP*1.2,(opening,.3,5.5),concrete,axes)
 def wing_part(label,x,z,along,w,d,height,skin,seed,court_side=1):
  along=Vector(along).normalized();out=Vector((-along.z,0,along.x));axes=(along,UP,out);center=Vector((x,0,z));corner=[center+along*xx+out*zz for xx,zz in [(-w/2,-d/2),(w/2,-d/2),(w/2,d/2),(-w/2,d/2)]];terrain=[land_height(q.x,q.z) for q in corner]
  floor=land_height(x,z)+1.2;height=round(height/3.65)*3.65;top=floor+height;bottom=min(terrain)-4
  if max(terrain)>top-8:raise ValueError(name+label+' roof buried in uphill bank')
  envelope=Vector((x,(bottom+top+4)/2,z))
  if not clear(envelope,(w+5,top+4-bottom,d+7),axes):raise ValueError(name+label+' overlaps road/flight clearance')
  center.y=floor;lower_floors=max(1,math.ceil((floor-min(terrain)+4)/3.65));low=-lower_floors*3.65
  # One broad enclosed solid represents each real building. Decorative wall
  # reveals and galleries do not produce thousands of redundant colliders.
  box(name+label+' occupied structural envelope',envelope,(w+1,top+4-bottom,d+1),aggregate,axes,True)
  objects.pop()
  core=[center+along*xx+out*zz for xx,zz in [(-w/2+2,-d/2+3),(w/2-2,-d/2+3),(w/2-2,d/2-2),(-w/2+2,d/2-2)]]
  bottoms=[min(land_height(q.x,q.z)-4,floor-4) for q in core]
  world_mesh(label+' seated masonry body',[Vector((q.x,y,q.z)) for q,y in zip(core,bottoms)]+[Vector((q.x,top,q.z)) for q in core],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],brick)
  for q,y in zip(core,bottoms):foundations.append({'name':label,'p':[q.x,y,q.z],'terrain':land_height(q.x,q.z),'top':top})
  # Main street and court returns have thick openings and real indoor depth.
  # Rear elevations are quieter, with a few occupied bays rather than copied
  # window carpets on every hidden side.
  for normal,tangent,span,offset,face_seed in [(-out,along,w,d/2,0),(along*court_side,out* (-court_side),d,w/2,3)]:
   face=center+normal*offset
   wall(label+' slope-seated lower homes',face,tangent,normal,span,low,0,brick,seed+face_seed,False)
   wall(label+' street rooms',face,tangent,normal,span,0,height,skin,seed+face_seed,False,face_seed==3)
  for normal,tangent,span,offset in [(out,-along,w,d/2),(-along*court_side,out*court_side,d,w/2)]:
   face=center+normal*(offset-.6);a=face-tangent*span/2;b=face+tangent*span/2;lo_a=min(land_height(a.x,a.z)-4,floor-4);lo_b=min(land_height(b.x,b.z)-4,floor-4)
   world_mesh(label+' ground-cut quiet rear wall',[Vector((a.x,lo_a,a.z)),Vector((b.x,lo_b,b.z)),a+UP*height,b+UP*height],[(0,1,3,2)],skin)
   for q,y in [(a,lo_a),(b,lo_b)]:foundations.append({'name':label+' rear wall','p':[q.x,y,q.z],'terrain':land_height(q.x,q.z),'top':top})
  roof=center+UP*height
  box(name+label+' stone roof cornice',roof+UP*.3,(w+1.5,.6,d+1.5),limestone,axes)
  vs=[roof+along*xx+out*zz+UP*.65 for xx,zz in [(-w/2-.8,-d/2-.8),(w/2+.8,-d/2-.8),(w/2+.8,d/2+.8),(-w/2-.8,d/2+.8)]]+[roof+along*xx+UP*3.8 for xx in [-w/2-.8,w/2+.8]]
  world_mesh(label+' folded weathered zinc roof',vs,[(0,1,5,4),(3,4,5,2),(0,4,3),(1,2,5)],zinc)
  box(name+label+' zinc ridge',roof+UP*3.85,(w+1.6,.18,.55),zinc,axes)
  # Long eaves and a few chimney stacks provide construction scale without
  # crowding the roof with unrelated tiny props.
  for xx in [-w*.30,w*.27]:box(name+label+' shared chimney stack',roof+along*xx+out*(d*.15)+UP*2.7,(1.6,5.4,2.6),brick,axes)
  ranges.append({'name':label,'base':list(center),'dimensions':[w,height,d],'along':list(along),'out':list(out),'groundRange':[min(terrain),max(terrain)]})
  return center,along,out
 west,wa,wo=wing_part('uphill west residential wing',-483,1192,(.8398,0,.5429),158,29,40.15,plaster,31)
 west_return,wra,wro=wing_part('west wing recessed court return',-430,1274,(0,0,1),102,28,25.55,brick,36,-1)
 east,ea,eo=wing_part('downhill east upper wing',-300,1240,(.9734,0,.2289),66,29,36.5,plaster,43,-1)
 east_low,ela,elo=wing_part('east wing stepped lower homes',-239,1254,(.9734,0,.2289),64,29,21.9,brick,45,-1)
 east_return,era,ero=wing_part('east wing low rear return',-211,1300,(0,0,1),100,28,32.85,plaster,49,-1)
 # A 28 m public stair is the skyline opening, oriented across the former
 # parallel rows. The walking flights are 4.8 m wide, with public landings
 # and a continuous adjoining service ramp. Both sit in low rooted masonry.
 court_axis=Vector((-.10,0,.995)).normalized();court_cross=UP.cross(court_axis);start=Vector((-350,0,1173));length=150;court_width=32;stations=[]
 for i in range(12):
  q=start+court_axis*(length*i/11);across=[q+court_cross*v for v in [-court_width/2,0,court_width/2]];datum=max(land_height(p.x,p.z) for p in across)+.8;q.y=datum;stations.append(q)
 for i,(a,b) in enumerate(zip(stations,stations[1:])):
  corners=[a+court_cross*x for x in [-court_width/2,court_width/2]]+[b+court_cross*x for x in [-court_width/2,court_width/2]];bottoms=[min(land_height(p.x,p.z)-3,p.y-1) for p in corners]
  world_mesh('transverse court grounded stair body',[Vector((p.x,y,p.z)) for p,y in zip(corners,bottoms)]+corners,faces,brick,True)
  world_mesh('transverse public service ramp',[corners[j] for j in [0,1,3,2]],[(0,1,2,3)],limestone)
  for p,y in zip(corners,bottoms):foundations.append({'name':'court stair base','p':[p.x,y,p.z],'terrain':land_height(p.x,p.z),'top':p.y})
  rise=b.y-a.y;horizontal=Vector((b.x-a.x,0,b.z-a.z));run=horizontal.length;steps=max(1,math.ceil(abs(rise)/.18));step=run/steps
  for j in range(steps):
   q=a+court_axis*((j+.5)*step)+UP*((j+.5)*rise/steps+.15)
   box(name+' broad public stair tread',q-court_cross*3.2,(18,.24,step+.05),concrete,(court_cross,UP,court_axis))
  landing=b+UP*.18
  box(name+' transverse public landing',landing-court_cross*3.2,(18,.36,2.4),limestone,(court_cross,UP,court_axis))
  for sign in [-1,1]:
   pa=a+court_cross*(sign*court_width/2)+UP*.55;pb=b+court_cross*(sign*court_width/2)+UP*.55;delta=(pb-pa).normalized();normal=court_cross.cross(delta).normalized()
   box(name+' stair court continuous stone edge',(pa+pb)/2,(.65,.8,(pb-pa).length+.05),limestone,(court_cross,normal,delta))
 # Short inhabited side streets connect the two wings to the court itself.
 # Each landing terminates at a real masonry floor; their stepped undersides
 # enter the bank instead of hanging over another set of tall civil legs.
 for label,origin,normal,offset,target_i in [('west',west_return,-wro,14,7),('east',east,-ea,33,3)]:
  door=origin+normal*(offset+.7);door.y=origin.y+math.ceil((land_height(door.x,door.z)-origin.y+2)/3.65)*3.65
  target=stations[target_i]+court_cross*(-14 if label=='west' else 14);target.y+=.4
  run=Vector((target.x-door.x,0,target.z-door.z));length=run.length;run.normalize();cross=UP.cross(run);half=3.6
  # The walk may be cut by high ground between its two doors. A modest raised
  # landing is an integral floor level, not a hidden wedge floating above it.
  needed=max(land_height((door.lerp(target,t)+cross*x).x,(door.lerp(target,t)+cross*x).z)+.6-door.lerp(target,t).y for t in [0,.25,.5,.75,1] for x in [-half,half])
  if needed>0:
   lift=math.ceil(needed/3.65)*3.65;door.y+=lift;target.y+=lift
  corners=[door+cross*x for x in [-half,half]]+[target+cross*x for x in [-half,half]];bottoms=[min(land_height(q.x,q.z)-3,q.y-.5) for q in corners]
  world_mesh(label+' court access rooted stair body',[Vector((q.x,y,q.z)) for q,y in zip(corners,bottoms)]+corners,faces,brick,True)
  for q,y in zip(corners,bottoms):foundations.append({'name':label+' court access','p':[q.x,y,q.z],'terrain':land_height(q.x,q.z),'top':q.y})
  rise=target.y-door.y;steps=max(1,math.ceil(abs(rise)/.18))
  for j in range(steps):
   q=door+run*((j+.5)*length/steps)+UP*((j+.5)*rise/steps+.12)
   box(name+label+' occupied cross-street tread',q,(half*2,.24,length/steps+.04),concrete,(cross,UP,run))
  if target.y>stations[target_i].y+.5:public_stairs(name+label+' court landing connection',target,stations[target_i]+UP*.4,5)
 # The rear workplace is a low occupied gallery, not a third slab closing the
 # skyline. Its six-metre recess faces the stair, with a single warm practical.
 gallery=Vector((-368,0,1340));gallery.y=land_height(gallery.x,gallery.z)+1.2;ga=(Vector((1,0,0)),UP,Vector((0,0,1)));w=52;d=19;h=10.95;floor=gallery.y
 gcorner=[gallery+ga[0]*x+ga[2]*z for x,z in [(-w/2,-d/2),(w/2,-d/2),(w/2,d/2),(-w/2,d/2)]];ground=[land_height(q.x,q.z) for q in gcorner];bottom=min(ground)-4
 if not clear(Vector((gallery.x,(bottom+floor+h)/2,gallery.z)),(w+4,floor+h-bottom+3,d+5),ga):raise ValueError(name+' rear gallery overlaps driving envelope')
 lower=max(1,math.ceil((floor-min(ground)+4)/3.65))*3.65
 box(name+' low gallery occupied rear',gallery+ga[2]*3+UP*(h/2),(w,h,13),brick,ga,True)
 world_mesh('rear gallery founded masonry',[Vector((q.x,min(land_height(q.x,q.z)-4,floor-2),q.z)) for q in gcorner]+gcorner,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],brick,True)
 for q in gcorner:foundations.append({'name':'rear gallery','p':[q.x,min(land_height(q.x,q.z)-4,floor-2),q.z],'terrain':land_height(q.x,q.z),'top':floor})
 front=gallery-ga[2]*d/2
 wall('court lower gallery',front,ga[0],-ga[2],w,-lower,0,brick,54,False)
 wall('court lower gallery',front+ga[2]*5,ga[0],-ga[2],w,0,h,brick,56,True)
 for x in [-26,-13,0,13,26]:box(name+' rear gallery deep stone pier',front+ga[0]*x+UP*5.5,(1.4,11,2.0),limestone,ga,True)
 for y in [.35,4.0,7.65,11.3]:box(name+' rear gallery walkable access floor',front+ga[2]*2.2+UP*y,(w+2,.5,7),concrete,ga,True)
 box(name+' rear gallery quiet zinc roof',gallery+UP*11.65,(w+1,.16,d+1),zinc,ga)
 q=front+ga[2]*2+UP*7.0
 box(name+' rear gallery shielded practical hood',q,(2.4,.6,1.2),iron,ga)
 box(name+' rear gallery recessed lamp lens',q-UP*.32,(1.8,.08,.7),fixture,ga)
 lights.append({'p':list(q-UP*.9),'power':720,'color':'#d5b997','radius':45,'pocket':True,'focusRange':[2000,2850]})
 # A short stair links the public upper landing to the actual gallery floor.
 public_stairs(name+' gallery entrance stair',stations[-1]+UP*.4,front-ga[2]*2+UP*.4,8)
 contour_quarter_summary.update({'removedLots':[['Terrace Ward',-1,row,i] for row in [0,1] for i in range(5,9)],'ranges':ranges,'courtStart':list(stations[0]),'courtEnd':list(stations[-1]),'gallery':list(gallery),'foundationSamples':foundations,'objects':len(objects)-first_object,'solidPieces':len(solids)-first_solid})
 street_summary=runpy.run_path(str(SRC/'blackstart_quarter_street.py'))['build_quarter_street'](globals(),contour_quarter_summary)
 contour_quarter_summary['serviceStreet']=street_summary

ward_lots={};ward_counts={}
for ward_index,ward in enumerate(ward_regions):
 name=ward['name'];style=ward['style'];stations=list(range(ward['start'],ward['end']+1,ward['step']));count=0
 if style in ['canal','lower']:continue
 for side in [-1,1]:
  for row,offset in enumerate(ward['offsets']):
   for index,(start,end) in enumerate(zip(stations,stations[1:])):
    # The far side of selected lock/industrial reaches remains an open water
    # prospect. The opposite side carries the continuous inhabited frontage.
    if row==1 and style in ['lock','canal','lower'] and (index+side)%3==0:continue
    f0=near(start);f1=near(end);out0=axes_at(f0,side)[2];out1=axes_at(f1,side)[2]
    a=Vector(f0['p'])+out0*offset;b=Vector(f1['p'])+out1*offset
    along=b-a;along.y=0;span=along.length
    if span<16:continue
    along.normalize();course=Vector(near((start+end)/2)['t']);course.y=0;course.normalize()
    if along.dot(course)<.25:continue
    out=UP.cross(along)*side;axes=(along,UP,out);c=(a+b)/2;width=span+24;depth=ward['depths'][row]
    if style=='lock' and side==1 and row==1 and index==3:
     # Authored together with the lower lot: no old rear slab or high plinth.
     count+=1
     continue
    if style=='terraces' and side==-1 and index in range(5,9):
     # Replaced together as one two-wing quarter with a real transverse court.
     count+=1
     continue
    foundation_start=(len(objects),len(solids))
    base=founded_platform(name+' shared block',c,width,depth,axes)
    if base is None:continue
    if style=='market' and side==1 and row==0 and index in [9,10]:
     # Replace the visible civil pedestal itself with occupied service floors.
     # Upper housing/market roofs and neighboring streets keep their datums.
     del objects[foundation_start[0]:];del solids[foundation_start[1]:]
     market_base=runpy.run_path(str(SRC/'blackstart_market.py'))['build_market_base'](globals(),base,width,depth,axes,index)
     print('MARKET OCCUPIED BASE',json.dumps({k:v for k,v in market_base.items() if k!='foundationSamples'}),flush=True)
    if style=='lock' and side==1 and row==0 and index==3:
     del objects[foundation_start[0]:];del solids[foundation_start[1]:]
     reservoir_worker_quarter(name+' diagonal workers quarter',base,width,depth,axes)
     count+=1;ward_lots[(name,side,row,index)]=(base,along,out,width,depth)
     continue
    if style=='terraces' and side==-1 and row==0 and index==9:
     # Replace this entire lot, including its old deep filled pedestal.
     del objects[foundation_start[0]:];del solids[foundation_start[1]:]
     if terrace_residential_court(name+' authored diagonal residential court',base-out*7,width,depth,axes,10009):
      count+=1;ward_lots[(name,side,row,index)]=(base,along,out,width,depth)
      continue
     base=founded_platform(name+' shared block',c,width,depth,axes)
    if style=='terraces' and row==0 and ((side==1 and index in [10,11]) or (side==-1 and index==10)):
     # Remove both the old slab housing and its highest-corner civil pedestal.
     del objects[foundation_start[0]:];del solids[foundation_start[1]:]
     terrace_occupied_slope(name+' occupied slope section',base,width,depth,axes,index,side==-1)
     count+=1;ward_lots[(name,side,row,index)]=(base,along,out,width,depth)
     continue
    count+=1;ward_lots[(name,side,row,index)]=(base,along,out,width,depth)
    street=base-out*(depth/2+5)
    box(name+' connected pedestrian street',street+UP*.6,(width+2,1.2,10),limestone,axes,True,.06)
    for edge in [-1,1]:box(name+' street curb',street+out*(edge*4.8)+UP*1.35,(width,.3,.4),aggregate,axes)
    heights=ward['heights'];h=heights[(index+row*2+side)%len(heights)]-(7.3 if row else 0)
    seed=8000+ward_index*1000+index+row*31+side
    visible_court=style=='crescent' and side==1 and index==6
    stair_lane=index in [4,9] and style in ['crescent','terraces','lower']
    if style=='crescent' and side==1 and row==0 and index==5:
     # A single slender corner landmark frames the visible courtyard. Most of
     # this frontage is much lower, so the opening survives the driving view.
     tower=min(34,width*.38)
     urban_wing(name+' tall courtyard corner',base-along*((width-tower)/2),tower,109.5,depth,axes,'municipal',seed)
     urban_wing(name+' lowered corner return',base+along*tower/2+out*12,width-tower,32.85,depth*.6,axes,'residential',seed+91)
    elif visible_court and row==0:
     # Open directly toward the camera: no full-width streetfront wall hiding
     # the court. The recess continues to the occupied gallery and uphill lane.
     urban_wing(name+' low court side wing',base+along*(width*.39)+out*15,width*.21,29.2,depth*1.35,axes,'residential',seed)
     box(name+' open court paving',base-along*(width*.1)+UP*.14,(width*.69,.28,depth),limestone,axes)
     court=founded_platform(name+' deep court gallery terrace',base+out*(depth*.9),width*.78,26,axes)
     if court is not None:
      occupied_gallery(name+' recessed inhabited court',court,width*.77,22,axes,seed)
      public_stairs(name+' descending court street',base-out*(depth/2)+UP*1.1,court-out*10+UP*.7,8)
     entry_fixture(name+' court mouth',base-along*(width*.34)-out*(depth*.42),along,out,1100)
    elif visible_court:
     occupied_gallery(name+' upper court arcade',base-out*(depth*.25),width,depth*.45,axes,seed)
     urban_wing(name+' upper court stepped rear',base+out*(depth*.30),width*.8,32.85,depth*.36,axes,'municipal',seed+83)
    elif style=='crescent' and side==1 and index==7:
     urban_wing(name+' substantially lowered courtyard wing',base+out*5,width,25.55 if row==0 else 43.8,depth*.72,axes,'residential',seed)
    elif style=='crescent' and side==1 and row==0 and index==8:
     if not crescent_municipal_court(name+' authored municipal courtyard',base,width,depth,axes,seed):
      urban_wing(name+' attached street block',base,width,h,depth,axes,'residential',seed)
    elif style in ['lock','terraces']:
     # Replace flat slab fronts with different inhabited structural families.
     # A lower frontage exposes the rear uphill street and corner pavilions.
     family_h=min(h,42) if style=='lock' else h
     inhabited_bays(name+' brick lock works' if style=='lock' else name+' ivory gallery housing',base,width,family_h,depth,axes,style,seed)
     if row==0:entry_fixture(name+' deep gallery entry',base-out*(depth/2+2),along,out,320 if style=='terraces' else 1000)
    elif style=='lock' and side==-1 and index%3==1:
     occupied_gallery(name+' waterside inspection arcade',base,width,depth*.65,axes,seed)
     if row:urban_wing(name+' lock service upper block',base+out*(depth*.3),width*.6,29.2,depth*.35,axes,'municipal',seed)
    elif style in ['market','canal'] and (index+row)%3!=1:
     # Market sheds and canal factories have a much lower, long roof mass than
     # housing. Northlights, shop arcades and pressure pipes identify use.
     generating_hall(name+' connected market hall' if style=='market' else name+' attached workshop range',base,width,depth,axes,seed)
     if style=='market':
      for j in range(max(3,int(width/11))):
       pitch=width/max(3,int(width/11));q=base+along*((j-(max(3,int(width/11))-1)/2)*pitch)-out*(depth/2+4)
       box(name+' market arcade pier',q+UP*4,(.6,8,.6),limestone,axes,True)
       if j<max(3,int(width/11))-1:arch(name+' market open arch',q+along*pitch/2+UP*5.8,pitch,2.3,.45,1.0,limestone,axes,True)
      box(name+' market arcade canopy',base-out*(depth/2+4)+UP*8.5,(width,1.0,10),iron,axes,True,.08)
      entry_fixture(name+' market entry',base-out*(depth/2+5),along,out,850)
     else:
      cylinder(name+' wall-backed pressure main',base+out*(depth/2-2)+UP*27,1.6,width+5,steel,along,16)
      for j in [-.32,.32]:cylinder(name+' pressure main collar',base+along*(width*j)+out*(depth/2-2)+UP*27,1.9,.7,iron,along,16)
    elif stair_lane:
     wing=(width-12)/2
     urban_wing(name+' stair-lane west',base-along*(wing/2+6),wing,h,depth,axes,'residential',seed)
     urban_wing(name+' stair-lane east',base+along*(wing/2+6),wing,max(18.25,h-14.6),depth,axes,'municipal',seed+100)
    elif index%5==2 or (style=='lower' and index%4==0):
     # These courts stay open at their street mouth; unequal returning wings
     # expose depth instead of presenting another uninterrupted window wall.
     wing=max(16,width*.24)
     urban_wing(name+' court west return',base-along*((width-wing)/2)+out*3,wing,h,depth*.9,axes,'residential',seed)
     urban_wing(name+' court east stepped return',base+along*((width-wing)/2)+out*3,wing,max(18.25,h*.60),depth*.9,axes,'residential',seed+100)
     rear=base+out*(depth*.38)
     urban_wing(name+' inhabited court rear',rear,width*.53,18.25 if style!='crescent' else 32.85,depth*.24,axes,'municipal',seed+200)
     box(name+' street court paving',base+UP*.15,(width*.49,.3,depth*.6),limestone,axes)
     if row==0:entry_fixture(name+' occupied recess',base+out*(depth*.12),along,out,1000)
    else:
     kind='municipal' if style in ['market','canal'] or (index+row)%3==0 else 'residential'
     urban_wing(name+' attached street block',base,width,h,depth,axes,kind,seed)
    # Short occupied undercrofts tie stepped street datums together. Avoid
    # placing window decorations below the actual terrain line.
    for j in range(max(2,int(width/10))):
     x=(j-(max(2,int(width/10))-1)/2)*9.6;q=base+along*x-out*(depth/2+.15)-UP*3.2
     if land_height(q.x,q.z)>q.y-2.5:continue
     box(name+' undercroft room reveal',q,(4.2,4.7,.2),iron,axes)
     box(name+' undercroft occupied window',q-out*.14,(2.4,2.7,.05),warm if j%3==0 else glass,axes)
     box(name+' masonry service lintel',q+UP*2.6-out*.3,(5.2,.35,1),limestone,axes)
    box(name+' shared rear lane',base+out*(depth/2+1)+UP*.5,(width+2,1,5),concrete,axes,True)
    if row==0 and index%5==0:entry_fixture(name+' residential entry',base-along*(width*.28)-out*(depth/2+1),along,out,800)
 ward_counts[name]=count
 # Street connections remain genuine stairs between the two occupied levels.
 if len(ward['offsets'])>1:
  for side in [-1,1]:
   for index in [4,9]:
    low=ward_lots.get((name,side,0,index));high=ward_lots.get((name,side,1,index))
    if not low or not high:continue
    a,along,out,w,d=low;b,_,_,_,bd=high
    public_stairs(name+' connected cross-street',a-out*(d/2+6)+UP*1.25,b-out*(bd/2+6)+UP*1.25)
contour_worker_quarter()
# The descending canal and the last roll need inhabited faces at the actual
# driving height. They are deliberately built into narrow civil benches rather
# than placed on the highest corner of a large terrain-top platform.
def road_datum_foundation(name,base,width,depth,axes,top):
 along,up,out=axes
 probes=[base+along*x+out*z for x in [-width/2,0,width/2] for z in [-depth/2,depth/2]]
 floors=[land_height(q.x,q.z)-3 for q in probes]
 # Open water remains open; don't recreate a 700 m display pedestal beside it.
 if min(floors)<base.y-135 or max(floors)>base.y+5:return False
 envelope=Vector((base.x,(min(floors)+base.y+top)/2,base.z))
 if not clear(envelope,(width+8,base.y+top-min(floors)+4,depth+18),axes):return False
 box(name+' continuous access deck',base+up*.5,(width+3,1,depth+10),limestone,axes,True,.08)
 # Individual tapered rock-founded piers expose real maintenance voids below
 # the street. A massive filled retaining plinth would hide the lower city.
 for j in range(max(3,math.ceil(width/16))):
  x=(j-(max(3,math.ceil(width/16))-1)/2)*(width/max(3,math.ceil(width/16)))
  for z in [-depth*.32,depth*.32]:
   q=base+along*x+out*z;floor=land_height(q.x,q.z)-3;height=max(1,base.y-floor)
   c=q-up*height/2
   if clear(c,(3.4,height,4.5),axes):box(name+' founded civil pier',c,(3.4,height,4.5),aggregate,axes,True,.16)
 box(name+' rock-backed retaining toe',base+out*(depth*.44)-up*5,(width,10,3),brick,axes,True,.1)
 return True

def pressure_gallery(name,base,width,depth,axes,seed):
 first_solid=len(solids)
 along,up,out=axes;front=base-out*(depth/2);bay_count=max(3,int(width/15));pitch=width/bay_count
 box(name+' brick pressure-control rear range',base+out*5+up*7.4,(width,14.8,depth-10),brick,axes,True,.12)
 # Six metres between exposed structure and occupied control rooms makes the
 # working edge legible from above, below and through the banked roll.
 for bay in range(bay_count+1):
  q=front+along*(-width/2+bay*pitch)+out*1.3
  box(name+' loadbearing gallery pier',q+up*9.8,(1.8,19.6,8.6),concrete,axes,True,.12)
 for floor_i in range(3):
  y=1.2+floor_i*4.2
  box(name+' continuous maintenance gallery',front+out*2.3+up*y,(width,.35,7.2),concrete,axes,True)
  box(name+' thin steel gallery rail',front-out*1.1+up*(y+.85),(width,.7,.16),iron,axes)
  for bay in range(bay_count):
   x=-width/2+(bay+.5)*pitch
   for column in [-1,1]:
    q=front+along*(x+column*pitch*.20)+out*5.05+up*(y+1.9)
    box(name+' control room window reveal',q,(2.7,2.8,.35),iron,axes)
    box(name+' control room occupied window',q-out*.2,(2.25,2.4,.05),warm if (bay+floor_i+seed)%3==0 else glass,axes)
   q=front+along*x-out*1.1+up*(y+.9)
   box(name+' gallery rail post',q,(.12,1.5,.18),iron,axes)
 # Twin pressure mains terminate at visible valve chambers, with saddles on
 # the gallery roof rather than unsupported pipes hovering beside the road.
 roof=base+up*15.1
 box(name+' heavy pressureworks roof deck',roof,(width+1,1.0,depth+2),concrete,axes,True,.1)
 for dz in [-3.5,4.0]:
  q=roof+out*dz+up*3.0
  cylinder(name+' supported transfer pressure main',q,2.25,width,steel,along,16,True)
  for x in [-width*.36,0,width*.36]:
   box(name+' pipe saddle',roof+out*dz+along*x+up*.8,(1.3,2.6,5.2),aggregate,axes,True)
   cylinder(name+' expansion collar',q+along*x,2.55,.65,iron,along,16)
 if seed%3==0:
  q=base+along*(width*.27)+out*2
  box(name+' ivory valve control room',q+up*24,(12,10,13),plaster,axes,True,.12)
  for j in [-1,1]:
   window=q+along*(j*3)-out*6.7+up*24
   box(name+' valve house window reveal',window,(3.5,2.8,.3),iron,axes)
   box(name+' valve house occupied window',window-out*.2,(3,2.3,.05),dim,axes)
 entry_fixture(name+' inhabited service entrance',front-out*1,along,out,1100)
 representative_collision(name,base+up*15,(width+3,31,depth+14),axes,first_solid)

lower_edge_lots={}
for district,start,end in [('Canal Works',9040,9840),('Lower Ward',9840,11520)]:
 count=0;step=48 if district=='Canal Works' else 76;stations=list(range(start,end+1,step))
 for side in [-1,1]:
  for row,offset in [(0,99),(1,151)]:
   for index,(s0,s1) in enumerate(zip(stations,stations[1:])):
    # Keep the upper edge intermittent: pressure courts and sightlines are
    # framed by unequal occupied ranges, not another two-wall window canyon.
    if row and (index+side)%3==0:continue
    f0=near(s0);f1=near(s1);a=Vector(f0['p'])+axes_at(f0,side)[2]*offset;b=Vector(f1['p'])+axes_at(f1,side)[2]*offset
    along=b-a;along.y=0;width=along.length+10
    if width<25 and district!='Canal Works':continue
    width=min(width,120)
    if along.length<.01:continue
    along.normalize();mid=near((s0+s1)/2);course=Vector(mid['t']);course.y=0;course.normalize()
    if along.dot(course)<.4 and district!='Canal Works':continue
    out=UP.cross(along)*side;axes=(along,UP,out);base=(a+b)/2
    if district=='Canal Works':
     axes=axes_at(mid,side);along,_,out=axes;base=Vector(mid['p'])+out*offset;width=52
    base.y=mid['p'][1]+(-5 if not row else 22)
    depth=25 if not row else 29;top=36 if district=='Canal Works' else 45
    if not road_datum_foundation(district+' driver-height edge',base,width,depth,axes,top):continue
    count+=1;lower_edge_lots[(district,side,row,index)]=(base,along,out,width,depth)
    if district=='Canal Works' or (index+side)%4==0:
     pressure_gallery(district+' occupied pressureworks',base,width,depth,axes,index+side)
    else:
     h=[21.9,29.2,25.55,36.5][(index+row+side)%4]
     inhabited_bays(district+' stepped inhabited service housing',base,width,h,depth,axes,'terraces',index+700)
     entry_fixture(district+' gallery doorway',base-out*(depth/2+1),along,out,1000)
    # Real outer-edge parapets stay low enough to preserve the inhabited recess.
    box(district+' public street parapet',base-out*(depth/2+4.5)+UP*1.6,(width,1.2,.45),aggregate,axes)
 for side in [-1,1]:
  for index in range(1,len(stations)-1,4):
   low=lower_edge_lots.get((district,side,0,index));high=lower_edge_lots.get((district,side,1,index))
   if low and high:
    a,along,out,w,d=low;b,_,_,_,bd=high
    public_stairs(district+' descending public service street',a+out*(d/2+2)+UP*.9,b-out*(bd/2+4)+UP*.9,5.4)
 ward_counts[district]=count
# These three assemblies are positioned from actual banked-chase raycasts.
# A roadside coordinate alone is insufficient: the canal sees the far wall of
# the turbine excavation, while the two rolls expose the ground below them.
def recessed_civil_gallery(name,base,width,axes,seed):
 along,up,out=axes;first_solid=len(solids);depth=19;height=13.2
 if not clear(base+up*7,(width+4,17,depth+10),axes):return False
 box(name+' brick occupied rear range',base+out*4+up*6.5,(width,13,11),brick,axes)
 box(name+' dark gallery interior',base+out*.15+up*6.5,(width-2,12.5,.3),iron,axes)
 columns=max(4,round(width/9));pitch=width/columns
 for floor in range(3):
  y=.5+floor*4.2
  box(name+' accessible gallery floor',base-out*3.8+up*y,(width,.36,8),concrete,axes)
  box(name+' gallery iron rail',base-out*7.5+up*(y+1.0),(width,.8,.15),iron,axes)
  for j in range(columns):
   x=-width/2+(j+.5)*pitch
   for pane in [-1,1]:
    q=base+along*(x+pane*pitch*.20)-out*.09+up*(y+2.05)
    box(name+' recessed office window frame',q,(2.4,2.7,.35),limestone,axes)
    box(name+' occupied office window',q-out*.2,(1.95,2.25,.05),warm if (j+floor+seed)%3==0 else dim,axes)
   box(name+' rail upright',base+along*x-out*7.5+up*(y+.85),(.13,1.4,.18),iron,axes)
 for j in range(columns+1):
  q=base+along*(-width/2+j*pitch)-out*6.5
  box(name+' structural gallery pier',q+up*7,(1.4,14,2.3),concrete,axes)
 box(name+' gallery continuous roof',base-out*.7+up*13.8,(width+2,1,21),concrete,axes)
 box(name+' roof public parapet',base-out*10.8+up*15,(width+2,1.4,.4),limestone,axes)
 entry_fixture(name+' occupied bay entry',base-out*7,along,out,1150)
 representative_collision(name,base+up*7.4,(width+3,16,depth+8),axes,first_solid)
 return True

# One asymmetric embedded pressure-exchange building replaces the central
# repeated panels; the outer approach galleries remain connected.
canal_exchange=runpy.run_path(str(SRC/'blackstart_canal.py'))['build_canal_exchange'](globals())
ward_counts['Canal far-bank pressure exchange']=1
print('CANAL PRESSURE EXCHANGE',json.dumps(canal_exchange),flush=True)

# A small lower market street and a pressure service court occupy the ground
# directly exposed by the two full rolls. Their roofscape, inhabited fronts
# and open yards read from above, rather than disappearing on the upper rim.
def roll_works_building(name,station,side,seed,market=False):
 f=near(station);along,up,out=axes_at(f,side);axes=(along,up,out);c=Vector(f['p'])+out*(43 if market else 47);width=52;depth=28 if market else 31
 corners=[c+along*x+out*z for x,z in [(-width/2,-depth/2),(width/2,-depth/2),(width/2,depth/2),(-width/2,depth/2)]]
 ground=[land_height(q.x,q.z)-2 for q in corners];base=Vector((c.x,max(ground)+2,c.z));height=13.2
 envelope=base+up*11
 if max(ground)-min(ground)>45 or not clear(envelope,(width+5,26,depth+13),axes):return False
 first_solid=len(solids)
 vs=[(q.x,y,q.z) for q,y in zip(corners,ground)]+[(q.x,base.y,q.z) for q in corners]
 mesh(name+' short stepped street foundation',vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],aggregate,True)
 box(name+' occupied lower street range',base+up*height/2,(width,height,depth),brick if market else plaster,axes)
 front=base-out*(depth/2+.16)
 for bay in range(6):
  x=(bay-2.5)*8.2
  box(name+' structural bay pier',front+along*x+up*6.8,(.8,13.6,1.0),limestone if market else concrete,axes)
  for level in range(3):
   for pane in [-1,1]:
    q=front+along*(x+pane*2.25)+up*(2.1+level*4.1)
    box(name+' deep street window reveal',q,(2.3,2.8,.35),iron,axes)
    box(name+' occupied lower street window',q-out*.2,(1.85,2.35,.05),warm if (bay+level+seed)%3==0 else dim,axes)
 # Three parallel northlights and their clerestories remain readable from the
 # banked overhead camera. The roof pitch establishes a real workshop scale.
 roof=base+up*height
 for band in range(3):
  z=-depth/2+band*depth/3;rise=3.5
  roofvs=[tuple(roof+along*x+out*zz+up*y) for x in [-width/2,width/2] for zz,y in [(z,.2),(z+depth/3,rise),(z+depth/3,.2)]]
  mesh(name+' pitched northlight roof',roofvs,[(0,1,4,3),(1,2,5,4),(0,3,5,2),(0,2,1),(3,4,5)],zinc)
  # Real raised seams follow the roof fall, while the cap and gutter profiles
  # catch light at a readable construction scale in the banked chase view.
  seam_start=roof+out*z+up*.31;seam_end=roof+out*(z+depth/3)+up*(rise+.11)
  direction=(seam_end-seam_start).normalized();roof_normal=direction.cross(along).normalized()
  if roof_normal.y<0:roof_normal=-roof_normal
  for seam in range(19):
   x=(seam-9)*2.8
   box(name+' standing roof seam',(seam_start+seam_end)/2+along*x,(.13,.18,(seam_end-seam_start).length),wear,(along,roof_normal,direction))
  box(name+' heavy folded ridge cap',roof+out*(z+depth/3)+up*(rise+.17),(width+1.2,.34,.65),zinc,axes)
  box(name+' supported valley gutter',roof+out*z+up*.08,(width+1.2,.45,.75),iron,axes)
  for edge in [-1,1]:
   q=roof+out*(z+depth/3*.66)+along*(edge*(width/2+.12))+up*1.15
   box(name+' approach gable clerestory frame',q,(2.9,1.4,.3),limestone,(out,up,along))
   box(name+' approach gable occupied window',q+along*(edge*.18),(2.45,1.05,.055),dim if (band+seed)%2 else warm,(out,up,along))
   pipe=roof+along*(edge*(width/2+.5))+out*z-up*5.4
   cylinder(name+' connected gutter downpipe',pipe,.24,11.4,iron,up,12)
  # Roof-to-wall construction has depth: the concrete edge remains separate
  # from the zinc so the broad roof is not a single unbroken coloured slab.
  for edge in [-1,1]:
   box(name+' structural northlight edge beam',(seam_start+seam_end)/2+along*(edge*(width/2+.2))-roof_normal*.2,(.8,.65,(seam_end-seam_start).length+.5),concrete,(along,roof_normal,direction))
  for pane in range(8):
   q=roof+along*((pane-3.5)*6.3)+out*(z+depth/3+.08)+up*1.9
   box(name+' roof clerestory window',q,(5.9,2.8,.06),glass if pane%3 else dim,axes)
 # Raised occupied monitors face the arriving driver along the street axis.
 # Ordinary roof glazing faced sideways and vanished in the rolled camera;
 # these visible room volumes give the overhead elevation a usable hierarchy.
 for monitor_index,(offset,length) in enumerate([(-9,17),(14,9)] if seed%2 else [(-4,27)]):
  q=roof+along*offset+up*5.25
  box(name+' raised clerestory monitor curb',q-up*1.9,(length+1.4,.7,10.8),concrete,axes)
  box(name+' raised occupied roof monitor',q,(length,3.5,9.6),plaster,axes)
  box(name+' folded monitor roof cap',q+up*2.0,(length+1.8,.6,11.4),zinc,axes)
  approach=q-along*(length/2+.18)
  for pane in [-1,0,1]:
   face=approach+out*(pane*2.85)
   box(name+' monitor approach window deep reveal',face,(2.55,2.8,.35),iron,(out,up,along))
   box(name+' monitor approach occupied window',face-along*.2,(2.1,2.35,.055),warm if (pane+seed)%3==0 else dim,(out,up,along))
  for side in [-1,1]:
   for pane in range(max(2,int(length/4))):
    count=max(2,int(length/4));x=(pane-(count-1)/2)*(length/count)
    face=q+along*x+out*(side*4.95)
    box(name+' monitor side clerestory reveal',face,(length/count-.4,2.8,.3),iron,axes)
    box(name+' monitor side occupied window',face+out*(side*.18),(length/count-.8,2.3,.055),dim if (pane+side+seed)%3 else glass,axes)
 # The service pavement follows the stepped building datum; an open arcade
 # faces the roll, with substantial depth behind its columns.
 box(name+' lower access street deck',base-out*(depth/2+4)+up*.3,(width+2,.6,8),limestone,axes)
 for bay in range(7):
  q=base+along*((bay-3)*8.3)-out*(depth/2+6)
  box(name+' arcade pier',q+up*2.9,(.7,5.8,.7),limestone,axes)
  if market and bay<6:arch(name+' occupied market arcade',q+along*4.15+up*4.1,8.3,1.9,.45,.8,limestone,axes)
 box(name+' broad street canopy',base-out*(depth/2+3)+up*6.2,(width+1,.5,7),enamel if market else concrete,axes)
 if not market:
  # Visible supported pressure lines occupy the open side of the service
  # court; the large mechanical forms survive the driving camera distance.
  for z in [-depth*.25,depth*.25]:
   q=roof+out*z+up*5.7
   cylinder(name+' working roof pressure main',q,2.0,width-5,steel,along,20)
   for x in [-18,0,18]:
    cylinder(name+' pipe union collar',q+along*x,2.3,.65,iron,along,20)
    box(name+' structural pressure saddle',roof+out*z+along*x+up*2.8,(1.2,5.7,4.6),aggregate,axes)
 entry_fixture(name+' inhabited arcade entry',front-out*3,along,out,1100)
 # One hull for the remote building; the founded terrace is retained as its
 # sloped support. Roof panes, arcades and access details add no collision mesh.
 foundation=solids[first_solid:];del solids[first_solid:]
 for record in foundation:solids.append(record)
 box(name+' broad physical envelope',base+up*11,(width+3,24,depth+12),concrete,axes,True);objects.pop()
 return True

for name,stations,side,market in [('Lower Market service street',[6740,6810,6880,6950],1,True)]:
 count=0
 for seed,station in enumerate(stations):
  if roll_works_building(name,station,side,seed,market):count+=1
 ward_counts[name]=count
lower_works=lower_works_builder['build_lower_works'](globals())
ward_counts['Lower pressure works']=1
print('LOWER PRESSURE WORKS',json.dumps({k:v for k,v in lower_works.items() if k!='foundationSamples'}),flush=True)
print('CONNECTED WARD LOTS',json.dumps(ward_counts),flush=True)

# Exposed hydraulic runners live inside thick stationary volutes. Runtime owns
# the moving impeller and shaft boss; no duplicated static blades or hub are
# baked into this asset. Human-size maintenance doors explain their huge scale.
def turbine_station(station,side,radius,seed):
 f=near(station);p=Vector(f['p']);along,up,out=axes_at(f,side);axes=(along,up,out)
 center=p+out*(190+radius*.25)+up*34;center.y=max(center.y,bed(center.z)+radius+24)
 floor=land_height(center.x,center.z)-8;center.y=max(center.y,floor+radius+12);top=center.y+radius+15;depth=80;width=radius*2.8
 envelope=Vector((center.x,(floor+top)/2,center.z))
 if not clear(envelope,(width,top-floor,depth+30),axes):return
 # The inhabited, stepped frame roots into the actual rendered rock bank.
 runpy.run_path(str(SRC/'blackstart_turbine.py'))['build_turbine_powerhouse'](globals(),center,along,out,radius,station)
 rotor=center-out*31;axis=-out
 # A deep circular mouth shades the rotor. The widening spiral casing and
 # pressure tail make this a hydraulic volute rather than a decorative fan.
 cylinder('turbine recessed mouth shadow',rotor-axis*17,radius*1.04,2,iron,axis,48,False)
 vertices=[];count=64
 for depth_offset in [-11,3]:
  for k in range(count+1):
   angle=k*math.tau/count;radial=along*math.cos(angle)+up*math.sin(angle)
   for outer in [False,True]:
    r=radius*1.035 if not outer else radius*(1.23+.12*k/count)
    vertices.append(tuple(rotor+axis*depth_offset+radial*r))
 stride=(count+1)*2;fs=[]
 for k in range(count):
  i=k*2;fs.extend([(i,i+2,i+3,i+1),(stride+i+1,stride+i+3,stride+i+2,stride+i),(i,stride+i,stride+i+2,i+2),(i+1,i+3,stride+i+3,stride+i+1)])
 fs.extend([(0,1,stride+1,stride),(count*2,stride+count*2,stride+count*2+1,count*2+1)])
 mesh('turbine spiral steel volute',vertices,fs,enamel,True)
 for angle in [k*math.tau/16 for k in range(16)]:
  q=rotor+axis*3.6+(along*math.cos(angle)+up*math.sin(angle))*radius*1.16
  cylinder('volute segmented casing fastener',q,.55,1.3,wear,axis,10)
 if radius==42:
  # A shielded work light on the upper maintenance bracket picks out one
  # machined rim. Runtime assigns an existing landmark pool slot to it.
  q=rotor+along*(radius*.42)+up*(radius*.78)+axis*24
  mount=rotor+along*(radius*.42)+up*(radius+7)+axis*3
  box('turbine landmark light crown bracket',mount+axis*10.5,(.8,.8,22.8),iron,(along,up,axis))
  box('turbine landmark light vertical standard',(mount+axis*21+q)/2,(.8,mount.y-q.y+.8,.8),iron,(along,up,axis))
  box('turbine landmark shielded worklight hood',q,(4,.8,2.5),iron,(along,up,axis))
  box('turbine landmark worklight lens',q-up*.44,(3.3,.08,1.9),fixture,(along,up,axis))
  lights.append({'p':list(q-up*1.3+axis*.4),'power':4000,'color':'#e2ddd0','radius':115,'pocket':True,'landmark':'turbine-leap'})
 turbines.append({'p':list(rotor),'axis':list(axis),'radius':radius,'distance':station})

turbine_jump=next(j for j in route['jumps'] if j['id']=='turbine-leap')
for offset,side,radius in [(120,-1,42),(420,1,38),(610,-1,34)]:
 turbine_station(turbine_jump['landingStart']+offset,side,radius,30+offset)

# Each major cascade joins two derived reservoir elevations. These four
# unequal basins give the descent distinct large-scale scenes.
for i,(upper,lower) in enumerate(zip(basins,basins[1:])):
 z=upper['end'];top=upper['y']+4;bottom=lower['y']+4;width=world_right-world_left;mid=(world_left+world_right)/2
 if top-bottom<5:continue
 box('major impoundment founded dam',Vector((mid,(top+bottom)/2,z)),(width,top-bottom,26),aggregate,solid=True,bevel=.8)
 box('major impoundment spill lip',Vector((mid,top-2,z+8)),(width-8,7,18),concrete,solid=True,bevel=.5)
 # An interrupted crest makes several connected spill bays, not a single
 # repeating planar white wall at the rear of every scene.
 bay_count=5;bay_width=(width-70)/bay_count
 for bay in range(bay_count):
  x=world_left+35+(bay+.5)*bay_width
  box('dam crest dividing pier',Vector((x-bay_width/2,top+4,z+3)),(10,16,33),concrete,solid=True,bevel=.3)
  falls.append({'top':[x,top,z+18],'right':[1,0,0],'width':bay_width-12,'height':top-bottom,'seed':i*2.1+bay*.3,'kind':'dam'})
runpy.run_path(str(SRC/'blackstart_spillway.py'))['build_spillway'](globals())

# Retained gate portals become pressure-control landmarks. Their six former
# on-road curtains are retired; narrow outboard outlets discharge to the basin.
for i,curtain in enumerate(route['curtains']):
 if any(j['hero'] and j['takeoff']-80<curtain['s']<j['landingEnd']+180 for j in route['jumps']):continue
 gates.append({'sourceIndex':i,'distance':curtain['s']})
 f=near(curtain['s']);p=Vector(f['p']);along,up,right=axes_at(f);axes=(right,up,along);top=p+up*66
 box('pressure-control portal header %d'%i,top,(84,13,15),concrete,axes,True,1)
 # The hoist stems terminate in a connected upper machine frame.
 for side in [-1,1]:
  box('hoist upper channel',p+right*(side*30)+up*91-along*10,(3.6,46,6),iron,axes,True,.3)
  box('hoist bearing block',p+right*(side*30)+up*113-along*12,(7,7,8),steel,axes,True,.5)
 box('hoist upper crosshead',p+up*115-along*10,(68,4,8),iron,axes,True,.4)

 box('pressure-control portal sill %d'%i,top-up*7,(56,3,11),iron,axes,True,.4)
 q=p+up*68-along*23
 box('gate central worklight bracket',q+along*7,(3,3,15),iron,axes)
 box('gate central worklight hood',q,(13,4,6),iron,axes)
 box('gate central downlight',q-up*2.1,(11,.3,4.5),fixture,axes)
 for side in [-1,1]:
  c=p+right*(side*43)+up*25
  box('sluice gate tower %d %d'%(i,side),c,(13,105,19),steel,axes,True,.7)
  for y in [3,29,55]:
   box('gate tower brace',p+right*(side*43)+up*y,(17,2,23),iron,axes)
   box('brace rubbed bearing face',p+right*(side*43)+up*(y+1.1)-along*10,(15,.45,2),wear,axes)
  for y in [-12,16,42,68]:
   box('sluice replaceable enamel plate',p+right*(side*43)+up*y-along*9.8,(10.6,20,.65),enamel,axes)
   for dx in [-4.4,4.4]:
    for dy in [-8,8]:cylinder('sluice plate fastener',p+right*(side*43+dx)+up*(y+dy)-along*10.4,.32,.8,wear,along,8)

  wheel=p+right*(side*43)+up*49-along*12
  # Open spoke wheels, rather than flat black discs.
  arch('gate wheel upper rim',wheel,14,7,1.2,2,limestone,axes)
  arch('gate wheel lower rim',wheel,14,7,1.2,2,limestone,(right,-up,along))
  cylinder('gate wheel hub',wheel,2,3,iron,along,20)
  for k in range(6):
   a=k*math.tau/6;r=right*math.cos(a)+up*math.sin(a);t=along.cross(r)
   box('gate wheel spoke',wheel+r*3.5,(.7,6,1.2),iron,(t,r,along))
  q=p+right*(side*34)+up*59-along*15
  box('gate worklight housing',q,(6,3,4),iron,axes)
  box('gate worklight lens',q-up*1.6,(4.8,.25,2.7),fixture,axes)
  lights.append({'p':list(q-up*2-along*2),'power':3800,'color':'#ffcb91'})

 # Water leaves narrow pressure outlets beyond both racing shoulders. The
 # industrial portal remains legible without translucent sheets on the road.
 for side in [-1,1]:
  lip=p+right*(side*76)+up*18-along*9
  feed=p+right*(side*59.5)+up*18-along*9
  cylinder('portal connected transverse feeder',feed,5.5,33,steel,right,24,True)
  box('portal pressure elbow casing',lip-along*6,(11,11,11),enamel,axes,True,.7)
  # Open annular pipe: its recessed throat replaces the floating capped discs.
  vertices=[];count=32
  for end in [-5.5,7]:
   for radius in [4.65,5.5]:
    for k in range(count):
     angle=k*math.tau/count;vertices.append(tuple(lip+along*end+(right*math.cos(angle)+up*math.sin(angle))*radius))
  fs=[]
  for k in range(count):
   n=(k+1)%count
   fs.extend([(k,n,n+64,k+64),(k+32,k+96,n+96,n+32),(k,k+32,n+32,n),(k+64,n+64,n+96,k+96)])
  mesh('portal open pressure outlet shell',vertices,fs,steel,True)
  cylinder('portal deep outlet throat',lip+along*.15,4.62,.2,iron,along,32)
  receiving_ground=land_height(lip.x+along.x*9,lip.z+along.z*9)
  height=max(8,lip.y-max(bed(lip.z)+4,receiving_ground))
  falls.append({'top':list(lip+along*7.1),'right':list(right),'width':8,'height':height,'seed':i*.53+side*.2,'kind':'penstock','distance':curtain['s']})
# Narrow bridge bents meet the sloping bed; rolls keep their open silhouette.
for station in range(30,int(route['length']),160):
 f=near(station)
 if f['gap'] or any(r['start']-100<station<r['end']+100 for r in route['inversions']):continue
 p=Vector(f['p']);road_up=Vector(f['up']);road_tangent=Vector(f['t']);road_right=Vector(f['right'])
 # Caps must follow pitch AND banking. A horizontal 42 m longitudinal slab
 # could pierce the downhill deck even with its center ten metres below it.
 # Upright bents stop at the cap underside; steep roll neighborhoods stay open.
 if road_up.y<.6:continue
 cap=p-road_up*12;bottom=land_height(cap.x,cap.z);top=cap.y-3.4;height=top-bottom
 if height<20:continue
 axes=axes_at(f);center=Vector((cap.x,bottom+height/2,cap.z))
 if not clear(center,(10,max(1,height-24),12),axes):continue
 box('founded bridge bent',center,(8,height,10),concrete,axes,True,.5)
 box('road-aligned bridge capital',cap,(18,7,42),aggregate,(road_tangent,road_up,road_right),True,.4)
# The port is a connected authored district, replacing isolated quay props.
harbor_summary=runpy.run_path(str(SRC/'blackstart_harbor.py'))['build_harbor'](globals())
print('BLACKSTART HARBOR',json.dumps(harbor_summary),flush=True)

# The finish belongs to a working freight interchange. A single quay-founded
# hoist core replaces the two old halls on 235 m columns. Its open shaft,
# intermediate service floors and upper station explain the height change.
def build_receiving_terminal():
 f=near(route['finish']);origin=Vector(f['p']);along,up,out=axes_at(f);axes=(along,up,out)
 name='Receiving terminal / ';quay_y=basins[-1]['y']+12;floor_y=origin.y+4
 first_object=len(objects);first_solid=len(solids);bearings=[];foundation_records=[]
 def point(x,y,z):return origin+along*x+up*(y-origin.y)+out*z
 def part(label,x,y,z,dims,mat,solid=False,bevel=0):return box(name+label,point(x,y,z),dims,mat,axes,solid,bevel)
 def beam(label,a,b,width,depth,mat=steel,solid=False):
  a=point(*a);b=point(*b);vertical=(b-a).normalized();side=vertical.cross(out)
  if side.length<.01:side=along.copy()
  side.normalize();normal=side.cross(vertical).normalized()
  return box(name+label,(a+b)/2,(width,(b-a).length,depth),mat,(side,vertical,normal),solid,.12)
 def foundation(label,x,z,w,d):
  corners=[point(x+dx,0,z+dz) for dx in [-w/2,w/2] for dz in [-d/2,d/2]]
  bottom=min(land_height(q.x,q.z) for q in corners)-8;top=quay_y+2
  part(label,x,(bottom+top)/2,z,(w,top-bottom,d),aggregate,True,.35)
  foundation_records.append({'name':label,'bottom':bottom,'top':top,'corners':[list(q) for q in corners]})
  return top
 def windows(label,x,y,z,count,pitch=3.6,height=2.9):
  for i in range(count):
   xx=x+(i-(count-1)/2)*pitch
   part(label+' deep stone reveal',xx,y,z,(2.85,height+.55,.65),limestone)
   part(label+' recessed occupied window',xx,y,z-.36,(2.3,height,.055),warm if i%4==1 else dim if i%3==0 else glass)
   part(label+' mullion',xx,y,z-.41,(.09,height,.09),iron)
 def rail(label,x,y,z,w,depth):
  for xx in [-w/2,w/2]:part(label+' side handrail',x+xx,y+1.1,z,(.12,.12,depth),iron)
  for zz in [-depth/2,depth/2]:part(label+' end handrail',x,y+1.1,z+zz,(w,.12,.12),iron)
  for xx in [-w/2,w/2]:
   for zz in [-depth/2,depth/2]:part(label+' post',x+xx,y+.55,z+zz,(.12,1.1,.12),iron)
 base=foundation('main core spread footing',0,90,58,70)
 # Unequal loadbearing cheeks leave a real 18 m opening and 48 m of depth;
 # only the rear spine is closed. The loading shaft is not a painted recess.
 for label,x,w in [('west occupied structural cheek',-15,16),('east machinery structural cheek',17,12)]:
  part(label,x,(base+floor_y)/2,90,(w,floor_y-base,58),concrete,True,.3)
 part('deep rear masonry spine',2,(base+floor_y)/2,114,(18,floor_y-base,10),aggregate,True,.25)
 part('quay loading apron',2,quay_y+.6,46,(46,1.2,32),concrete,True,.1)
 part('loading threshold',2,base+.3,65,(18,.6,14),wear)
 # Four irregularly spaced working levels give the vertical structure scale.
 service_levels=[base+42,base+97,base+154,origin.y-20]
 for level_index,y in enumerate(service_levels):
  part('rear working gallery',2,y,102,(20,1.2,14),concrete,True,.1)
  for side,x in [(-1,-6),(1,10)]:
   part('shaft side catwalk',x,y,82,(2,1.0,28),iron)
   rail('shaft gallery rail',x,y+.55,82,1.7,27)
  part('exposed transverse lifting girder',2,y-1.7,103,(20,2.2,2.2),steel)
  part('rear occupied service cabin',2,y+3.5,110,(16,5.8,7),brick)
  windows('service cabin',2,y+3.5,106.15,4,3.45,2.6)
  # Small occupied rooms and deep lintels interrupt the main cheek at actual
  # maintenance landings, without wrapping the tower in a uniform window grid.
  part('west service room brick infill',-15,y+3.8,60.7,(13,8.2,.55),brick)
  windows('west landing rooms',-15,y+4.2,60.18,3,3.45,2.75)
  part('west landing weather hood',-15,y+8.0,59.5,(15,.65,3.5),concrete)
  part('east maintenance opening',17,y+2.4,60.62,(5,4.7,.35),iron)
  part('east maintenance door',17,y+1.9,60.38,(1.65,3.1,.12),enamel)
 # Paired guides, a counterweight and a suspended freight cradle make the
 # huge void a legible cargo lift. All rails terminate in founded structure.
 for x in [-5.2,9.2]:
  part('cargo guide rail',x,(base+floor_y)/2,76,(.65,floor_y-base-3,.85),wear)
  part('cargo guide backing',x,(base+floor_y)/2,76.8,(1.6,floor_y-base-3,.65),iron)
  for y in service_levels:part('guide rail wall bracket',x,y+1.5,83,(.75,.9,13),steel)
 cage_y=base+76
 part('freight cradle lower frame',2,cage_y,83,(16,1.4,20),steel)
 part('freight cradle upper frame',2,cage_y+9.4,83,(16,1.1,20),steel)
 for xx in [-5.2,9.2]:
  for zz in [74,92]:part('freight cradle corner post',xx,cage_y+4.7,zz,(.8,9.4,.8),steel)
 for xx in [-4.8,8.8]:
  a=point(xx,cage_y+9.8,82);b=point(xx,floor_y-1,82)
  cylinder(name+'suspension cable',(a+b)/2,.14,(b-a).length,iron,up,8)
 part('loaded cradle container',2,cage_y+2.1,83,(12.2,2.6,2.44),enamel)
 for xx in range(-4,9,2):part('container corrugation',xx,cage_y+2.1,81.73,(.13,2.4,.12),wear)
 part('counterweight inside rear guide',8,floor_y-42,106,(2.3,23,3.6),iron)
 part('upper hoist crosshead',2,floor_y-3.5,83,(20,4,21),steel,True,.2)
 # A compact occupied transfer station, with one taller rear wing and a
 # visible setback. Its grouped openings belong to rooms of human dimensions.
 part('transfer station floor',1,floor_y,89,(70,2.4,56),concrete,True,.25)
 part('lower station brick hall',0,floor_y+9,78,(68,15.6,26),brick,True,.25)
 part('station rear stepped wing',25,floor_y+14,107,(24,25.6,23),plaster,True,.2)
 for group,x in enumerate([-23,0,23]):
  part('grouped control room stone surround',x,floor_y+9.3,64.5,(17.6,10.3,1.5),limestone)
  part('grouped control room shadow recess',x,floor_y+9.3,63.66,(15.5,8.7,.25),iron)
  for row in range(2):
   for col in range(4):
    xx=x+(col-1.5)*3.7;yy=floor_y+7.0+row*4.4
    part('control station occupied window',xx,yy,63.49,(3.35,3.8,.06),warm if (col+group)%4==1 else dim if group==1 else glass)
  part('control room deep weather hood',x,floor_y+15,63,(18.4,.7,3.7),concrete)
 for y in [floor_y+6,floor_y+11,floor_y+16,floor_y+21]:windows('rear wing rooms',25,y,95.1,4,4.5,2.9)
 part('front sheltered station gallery',0,floor_y+1.6,61.4,(67,1.0,7),concrete,True,.15)
 rail('upper station gallery',0,floor_y+2.1,61,65,5.8)
 for x in [-31,31]:
  part('upper station recessed doorway',x,floor_y+3.8,64.48,(2.0,3.6,.12),enamel)
  beam('station cantilever knee',(x/abs(x)*18,floor_y-20,75),(x,floor_y-1.6,75),2.2,3.1,concrete)
 def pitched_roof(label,x,z,w,d,eave,rise):
  vs=[tuple(point(x+xx,yy,z+zz)) for xx in [-w/2,w/2] for zz,yy in [(-d/2,eave),(0,eave+rise),(d/2,eave)]]
  mesh(name+label,vs,[(0,1,4,3),(1,2,5,4),(0,3,5,2),(0,2,1),(3,4,5)],zinc)
  part(label+' ridge',x,eave+rise+.12,z,(w+.4,.22,.3),zinc)
  for xx in range(-int(w/2)+2,int(w/2),3):
   for side in [-1,1]:beam(label+' standing seam',(x+xx,eave+.1,z+side*d/2),(x+xx,eave+rise+.1,z),.10,.13,zinc)
  for side in [-1,1]:part(label+' eaves gutter',x,eave-.2,z+side*(d/2+.3),(w+.6,.65,.7),iron)
 part('main station roof cornice',0,floor_y+16.6,78,(70,.8,28),concrete)
 part('rear wing roof cornice',25,floor_y+26.6,107,(25,.8,24.5),concrete)
 pitched_roof('main zinc roof',0,78,71,29,floor_y+17.0,5.2)
 pitched_roof('rear wing zinc roof',25,107,26,26,floor_y+27.0,3.8)
 # The finish truss is borne by the main core and one genuinely founded
 # maintenance pylon, replacing the unsupported old gate columns.
 truss_low=origin.y+36;truss_high=truss_low+10
 for x in [-19,19]:part('main truss bearing pier',x,(floor_y+truss_low)/2,98,(7,truss_low-floor_y,10),concrete,True,.18)
 part('main core transverse bearing cap',0,truss_low-1.6,98,(47,3.5,11),concrete,True,.2)
 opposite_base=foundation('opposite maintenance pylon footing',0,-58,40,42)
 for x in [-9,9]:part('opposite pylon structural cheek',x,(opposite_base+truss_high)/2,-58,(8,truss_high-opposite_base,28),concrete,True,.2)
 part('opposite pylon deep rear web',0,(opposite_base+truss_high)/2,-46,(10,truss_high-opposite_base,4),aggregate,True,.2)
 for y in [base+28,base+78,base+132,base+189,truss_low-10]:
  part('pylon maintenance landing',0,y,-59,(18,1.3,24),concrete,True,.15)
  part('pylon occupied stair landing',0,y+3.5,-45.5,(9,5.8,2),brick)
  windows('pylon stair landing',0,y+3.5,-47,2,3.7,2.6)
  beam('pylon open elevation brace',(-12,y+1,-72),(12,min(y+39,truss_low-3),-72),1.2,1.2,steel)
 part('opposite pylon bearing cap',0,truss_low-1.6,-58,(30,3.5,33),concrete,True,.2)
 span_start=-58;span_end=98;span=span_end-span_start
 for x in [-4.5,4.5]:
  for y in [truss_low,truss_high]:part('finish truss chord',x,y,(span_start+span_end)/2,(1.4,1.6,span+3),steel,True,.15)
  for k in range(10):
   z=span_start+k*span/10;next_z=z+span/10
   beam('finish triangulated web',(x,truss_low,z),(x,truss_high,next_z),1.1,1.1,steel,True)
   part('finish web vertical',x,(truss_low+truss_high)/2,z,(.85,truss_high-truss_low,.85),steel)
 for z in [-58,-26,6,38,70,98]:
  part('finish cross tie',0,truss_high,z,(10.5,1.1,1.5),steel)
  beam('finish top wind brace',(-4.5,truss_high,z),(4.5,truss_high,min(z+30,98)),.7,.8,iron)
 for z in [-22,-11,0,11,22]:
  part('finish inset signal hood',-5.5,truss_low+.6,z,(2.1,2.1,8),iron)
  part('finish inset warm signal',-6.6,truss_low+.6,z,(.15,1.35,6.8),fixture)
 # Service access hangs below the racing deck and leads into the lift core.
 # Its bearing seats contact the existing deck underframe; they stay below
 # the actual banked driving surface and are audited with the real hull.
 bridge_y=origin.y-20
 part('under-deck access bridge',0,bridge_y,58,(10,1.5,89),concrete,True,.15)
 rail('under-deck service access',0,bridge_y+.75,60,8.8,85)
 part('service bridge transverse bearing',2,bridge_y-1.8,64,(34,2.3,4),steel,True,.15)
 for x in [-4,4]:
  beam('under-deck bridge knee',(-15 if x<0 else 17,bridge_y-26,63),(x,bridge_y-1,25),1.2,1.8,steel)
  q=part('road underframe bearing seat',x,origin.y-11.5,20,(2,16,3),iron,True,.08)
  bearings.append(q['name'])
 for x,y,z,power in [(-23,floor_y+15,61,1100),(24,floor_y+22,94,900),(2,service_levels[2]+6,103,750)]:
  part('shielded gallery light hood',x,y,z,(1.5,.55,1.3),iron)
  part('gallery light lens',x,y-.3,z,(1.1,.08,.8),fixture)
  lights.append({'p':list(point(x,y-.9,z-.4)),'power':power,'color':'#ffd09c','radius':27,'pocket':True})
 return {'coreCenter':list(point(0,100,90)),'coreFootprint':[46,58],'shaftClearWidth':18,'shaftClearDepth':48,'upperStationFloor':floor_y,'quayY':quay_y,'foundationRecords':foundation_records,'underframeAttachments':bearings,'newObjects':len(objects)-first_object,'newSolidPieces':len(solids)-first_solid}
terminal_summary=build_receiving_terminal()
print('RECEIVING TERMINAL',json.dumps(terminal_summary),flush=True)
# Fractured natural banks are authored after the works so occupied buildings
# and civil infrastructure can exclude geological outcrops.
cliff_summary=runpy.run_path(str(SRC/'blackstart_cliffs.py'))['build_cliffs'](globals())
# Record physical solids before combining presentation meshes.
positions=[];indices=[];solid_ranges=[]
for o in solids:
 first_triangle=len(indices)//3
 offset=len(positions)
 for x,y,z in o['vertices']:positions.append([x,z,-y])
 for face in o['faces']:
  for i in range(1,len(face)-1):indices.extend(offset+j for j in [face[0],face[i],face[i+1]])
 solid_ranges.append({'name':o['name'],'firstTriangle':first_triangle,'triangleCount':len(indices)//3-first_triangle})
(SRC/'collision-kit.json').write_text(json.dumps({'id':'nightweir-city-solids','positions':positions,'indices':indices,'ranges':solid_ranges},separators=(',',':')))
(SRC/'water-kit.json').write_text(json.dumps({'falls':falls,'lights':lights,'basins':basins,'turbines':turbines,'turbineWater':globals().get('turbineWater',[]),'gates':gates},separators=(',',':')))
# Bake only short-range geometric contact, not sun direction or scene lighting.
# These colors preserve joints and sheltered construction under moving lights.
# The low-poly physical solids make an efficient occluder tree, while glass and
# self-lit fixtures remain unattenuated. Runtime still owns all actual lighting.
contact_vertices=[];contact_faces=[]
for o in solids:
 offset=len(contact_vertices);contact_vertices.extend(o['vertices'])
 contact_faces.extend(tuple(offset+i for i in face) for face in o['faces'])
contact_tree=BVHTree.FromPolygons(contact_vertices,contact_faces,all_triangles=False)
contact_cache={};contact_materials={concrete,aggregate,limestone,sandstone,brick,plaster,steel,enamel,iron,wear,bedrock}
contact_azimuths=[k*math.tau/5 for k in range(5)]
# Broad sky visibility is separate from local contact and is stored in alpha.
# Runtime applies it only to indirect light; direct sun and working lamps stay
# live. This supplies distant sheltered depth outside the following shadow map.
sky_directions=[]
for k in range(12):
 z=(k+.5)/12;phi=k*math.pi*(3-math.sqrt(5));r=math.sqrt(1-z*z)
 sky_directions.append(Vector((r*math.cos(phi),r*math.sin(phi),z)))
sky_cache={}
def sky_visibility(position,normal):
 key=tuple(round(v,2) for v in (*position,*normal))
 if key in sky_cache:return sky_cache[key]
 origin=position+normal*.22;covered=0;weight=0
 for direction in sky_directions:
  facing=max(0,normal.dot(direction))
  if facing<.025:continue
  weight+=facing
  hit,hit_normal,index,distance=contact_tree.ray_cast(origin,direction,420)
  if hit is not None:covered+=facing*(1-distance/420)
 value=max(.40,1-.75*covered/max(weight,.001));sky_cache[key]=value
 return value
def contact_shade(position,normal):
 key=tuple(round(v,3) for v in (*position,*normal))
 if key in contact_cache:return contact_cache[key]
 tangent=normal.cross(Vector((0,0,1)))
 if tangent.length<.1:tangent=normal.cross(Vector((0,1,0)))
 tangent.normalize();bitangent=normal.cross(tangent);origin=position+normal*.065
 occlusion=0
 for angle in contact_azimuths:
  direction=(normal*.64+(tangent*math.cos(angle)+bitangent*math.sin(angle))*.77).normalized()
  hit,hit_normal,index,distance=contact_tree.ray_cast(origin,direction,9)
  if hit is not None:occlusion+=math.exp(-distance/3.5)
 shade=max(.56,1-.52*occlusion/len(contact_azimuths));contact_cache[key]=shade
 return shade

# Keep districts independently culled at runtime; material assets remain shared.
buckets={}
for o in objects:
 z=-sum(v[1] for v in o['vertices'])/len(o['vertices'])
 buckets.setdefault(math.floor(z/600),[]).append(o)
worlds=[];triangle_count=0
for district,pieces in sorted(buckets.items()):
 all_vertices=[];all_faces=[];all_slots=[];all_materials=[];uv_overrides=[];normal_overrides=[];smooth_faces=[];emission_levels=[]
 for o in pieces:
  offset=len(all_vertices);all_vertices.extend(o['vertices']);emission_levels.extend([o.get('emission_level',1)]*len(o['vertices']));uv_overrides.extend(o.get('uvs',[None]*len(o['vertices'])));normal_overrides.extend(o.get('normals',[None]*len(o['vertices'])));material=o['material']
  if material not in all_materials:all_materials.append(material)
  slot=all_materials.index(material)
  for face in o['faces']:all_faces.append(tuple(offset+j for j in face));all_slots.append(slot);smooth_faces.append(o.get('smooth',False))
 data=bpy.data.meshes.new('Nightweir district %d'%district);data.from_pydata(all_vertices,[],all_faces);data.update()
 world=bpy.data.objects.new('Nightweir / editable district %d'%district,data);bpy.context.collection.objects.link(world);worlds.append(world)
 for material in all_materials:data.materials.append(material)
 for poly,slot,smooth in zip(data.polygons,all_slots,smooth_faces):
  poly.material_index=slot;poly.use_smooth=smooth or all_materials[slot]==bedrock
 if any(normal_overrides):
  loop_normals=[normal_overrides[loop.vertex_index] or tuple(data.vertices[loop.vertex_index].normal if all_materials[poly.material_index]==bedrock else poly.normal) for poly in data.polygons for loop in [data.loops[li] for li in poly.loop_indices]]
  data.normals_split_custom_set(loop_normals)
 uv=data.uv_layers.new(name='Metres');col=data.color_attributes.new(name='Sheltered faces',type='BYTE_COLOR',domain='CORNER')
 for poly in data.polygons:
  axis=max(range(3),key=lambda i:abs(poly.normal[i]));contact=all_materials[poly.material_index] in contact_materials
  for li in poly.loop_indices:
   v=data.vertices[data.loops[li].vertex_index].co
   uv.data[li].uv=uv_overrides[data.loops[li].vertex_index] or (v.y if axis==0 else v.x,v.y if axis==2 else v.z)
   shade=contact_shade(v,poly.normal) if contact else emission_levels[data.loops[li].vertex_index]
   col.data[li].color=(shade,shade,shade,sky_visibility(v,poly.normal) if contact else 1)
 data.calc_loop_triangles();triangle_count+=len(data.loop_triangles)
 print('DISTRICT',district,len(data.loop_triangles),'triangles',flush=True)
 contact_cache.clear();sky_cache.clear()
objects.clear();bpy.ops.object.select_all(action='DESELECT')
for world in worlds:world.select_set(True)
bpy.context.view_layer.objects.active=worlds[0]
bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'nightweir-city.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'nightweir-city.glb'),export_format='GLB',use_selection=True,export_yup=True,export_materials='EXPORT',export_vertex_color='NAME',export_vertex_color_name='Sheltered faces',export_cameras=False,export_lights=False)
# Lossless runtime packaging: native streaming decompression preserves every
# authored vertex and material while avoiding a >100MiB repository asset.
with (OUT/'nightweir-city.glb').open('rb') as source:unpacked_hash=hashlib.file_digest(source,'sha256').hexdigest()
with (OUT/'nightweir-city.glb').open('rb') as source,(OUT/'nightweir-city.glb.gz').open('wb') as packed:
 with gzip.GzipFile(filename='',mode='wb',fileobj=packed,compresslevel=9,mtime=0) as target:shutil.copyfileobj(source,target)
(OUT/'nightweir-city.glb').unlink()
info={'generator':'Blender 5.1.1 project-authored deterministic build','seed':773,'source':'nightweir-city.blend','runtime':'nightweir-city.glb.gz','encoding':{'compression':'gzip','decompressedSha256':unpacked_hash},'triangles':triangle_count,'districts':len(worlds),'solidTriangles':len(indices)//3,'inhabitedTerraces':accepted+sum(ward_counts.values()),'connectedWards':ward_counts,'waterfalls':len(falls),'activeTurbines':len(turbines),'hydraulicCircuits':len(globals().get('turbineWater',[])),'flightCorridors':len(route['flightCorridors']),'geometry':'Blackstart hydroelectric gorge: unequal human-scale occupied courts, municipal frontage, high-bay generating halls, pressure penstocks, route-derived impoundments, rooted upper city and working harbor'};(SRC/'model-provenance.json').write_text(json.dumps(info,indent=2)+'\n');print(json.dumps(info))
