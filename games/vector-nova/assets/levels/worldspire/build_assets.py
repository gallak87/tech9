"""Editable Worldspire monolith and interior kit.
Run Blender with --background --factory-startup --python this_file -- <app-root>.
The route-source.json is exported from the current CPU route, not hand-drawn.
"""
import bpy, bmesh, math, json, sys, random, hashlib
from collections import defaultdict
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
fresh=mat('Worldspire / fresh vitreous fracture',(.22,.17,.22),.32,.14)
rind=mat('Worldspire / weathered mineral rind',(.24,.21,.22),.82,.04)
glow=mat('Worldspire / mineral light inclusions',(.12,.42,.34),.4,.18,.65)
warm_glow=mat('Worldspire / amber core inclusions',(.65,.22,.055),.5,.12,.7)
gate_glow=mat('Worldspire / root mineral inclusions',(.18,.42,.35),.5,.28,.25)
def mesh(name,vs,faces,material):
 data=bpy.data.meshes.new(name);data.from_pydata([xyz(v) for v in vs],[],faces);data.update()
 o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.data.materials.append(material)
 bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
 return o
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

# Keep the editable authored macro pieces in the .blend; render chunks are
# independent broad spatial groups so the whole 7.5 km spire is never one bound.
sys.path.insert(0,str(SRC))
from cloudfall_geometry import build_cloudfall
scene=build_cloudfall(dict(globals()))
static=scene['macro']+scene['fittings']
for obj in static+[valve]:
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
 obj.data.validate(verbose=False,clean_customdata=False);obj.data.update()
 for layer in list(obj.data.uv_layers):obj.data.uv_layers.remove(layer)
 uv=obj.data.uv_layers.new(name='Mineral metres')
 for poly in obj.data.polygons:
  axis=max(range(3),key=lambda i:abs(poly.normal[i]))
  for li in poly.loop_indices:
   v=obj.data.vertices[obj.data.loops[li].vertex_index].co
   uv.data[li].uv=((v.y if axis==0 else v.x)/6,(v.y/6 if axis==2 else v.z/6))
valve.data.calc_loop_triangles();vp=[];vu=[]
for tri in valve.data.loop_triangles:
 for li in tri.loops:
  v=valve.data.vertices[valve.data.loops[li].vertex_index].co
  vp.extend([v.x,v.z,-v.y]);vu.extend(valve.data.uv_layers.active.data[li].uv)
resonance={'positions':vp,'uv':vu,'anchors':scene['anchors'],'fixtures':scene['fixtures'],'geometryVersion':route['geometryVersion']}
# Export collision by semantic authored piece; presentation-only light planes do
# not add physical layers. All coordinates/ranges have measured world bounds.
positions=[];indices=[];ranges=[]
for obj in static:
 if obj.get('collision',True) is False:continue
 obj.data.calc_loop_triangles();base=len(positions);first=len(indices)//3
 pp=[[v.co.x,v.co.z,-v.co.y] for v in obj.data.vertices]
 positions.extend(pp);indices.extend(base+k for tri in obj.data.loop_triangles for k in tri.vertices)
 ranges.append({'name':obj.name,'first':first,'count':len(indices)//3-first,'min':[min(p[a] for p in pp) for a in range(3)],'max':[max(p[a] for p in pp) for a in range(3)]})
bounds={'min':[min(p[a] for p in positions) for a in range(3)],'max':[max(p[a] for p in positions) for a in range(3)]}
geometry_digest=hashlib.sha256(json.dumps([positions,indices],separators=(',',':')).encode()).hexdigest()[:16]
collision={'geometryDigest':geometry_digest,'positions':positions,'indices':indices,'ranges':ranges,'bounds':bounds,'id':'worldspire-monolith-and-heart','geometryVersion':route['geometryVersion'],'routeSha256':hashlib.sha256((SRC/'route-source.json').read_bytes()).hexdigest()}
# Physical audit uses the same triangulated solids that will ship. These broad
# samples supplement the game's exact swept hull regression, which runs after export.
physical=BVHTree.FromPolygons([Vector(p) for p in positions],[indices[i:i+3] for i in range(0,len(indices),3)],all_triangles=True)
def hit_identity(hit):
 return {'object':next(r['name'] for r in ranges if r['first']<=hit[2]<r['first']+r['count']),'triangle':hit[2],'closest':list(hit[0])}
audit={'roadSamples':0,'flightSamples':0,'roadMin':1e9,'flightMin':1e9,'failures':[]}
for s in route['samples']:
 if s['gap']:continue
 for lane in [-32,0,32]:
  p=Vector(s['p'])+Vector(s['right'])*lane+Vector(s['up'])*3
  hit=physical.find_nearest(p);audit['roadSamples']+=1
  if hit:
   audit['roadMin']=min(audit['roadMin'],hit[3])
   if hit[3]<6:audit['failures'].append({'kind':'road','s':s['s'],'lane':lane,'distance':hit[3],**hit_identity(hit)})
for cor in route['flightCorridors']:
 right=Vector((0,1,0)).cross(Vector(cor['forward'])).normalized()
 for col in cor['columns']:
  for x in [-cor['lateralHalfWidth'],0,cor['lateralHalfWidth']]:
   for y in [col['minY'],col['p'][1],col['maxY']]:
    p=Vector((col['p'][0],y,col['p'][2]))+right*x
    hit=physical.find_nearest(p);audit['flightSamples']+=1
    if hit:
     audit['flightMin']=min(audit['flightMin'],hit[3])
     if hit[3]<5:audit['failures'].append({'kind':'flight','id':cor['id'],'point':list(p),'distance':hit[3],**hit_identity(hit)})
print('CLEARANCE',json.dumps(audit),flush=True)
assert not audit['failures'],'Authored scenery fails the broad driving/flight clearance audit'
# Vertex occlusion is physical contact, not painted directional lighting. The
# same global BVH sees ridge/cavity contact across spatial render chunk boundaries.
allv=[];allf=[]
for obj in static:
 base=len(allv);allv.extend([v.co.copy() for v in obj.data.vertices]);allf.extend([tuple(base+k for k in tri.vertices) for tri in obj.data.loop_triangles])
contact=BVHTree.FromPolygons(allv,allf,all_triangles=True)
materials=[]
for obj in static:
 for material in obj.data.materials:
  if material not in materials:materials.append(material)
groups=defaultdict(list);shadecache={}
for obj in static:
 for poly in obj.data.polygons:
  cy=poly.center.z;cx=poly.center.x;cz=-poly.center.y
  # Height slices plus four angular sectors retain moderately large draw batches.
  sector=int((math.atan2(cz,cx)+math.pi)/(math.pi/2))%4
  groups[(int((cy+600)//800),sector)].append((obj,poly))
chunks=[]
for key,polys in groups.items():
 vv=[];ff=[];uvs=[];colors=[];mids=[]
 for obj,poly in polys:
  f=[];normal=poly.normal.normalized()
  tangent=normal.cross(Vector((0,0,1)))
  if tangent.length<.01:tangent=normal.cross(Vector((0,1,0)))
  tangent.normalize();bitangent=normal.cross(tangent)
  directions=[normal,(normal+tangent*.85).normalized(),(normal-tangent*.85).normalized(),(normal+bitangent*.85).normalized(),(normal-bitangent*.85).normalized()]
  for li in poly.loop_indices:
   vi=obj.data.loops[li].vertex_index;p=obj.data.vertices[vi].co
   ck=(obj.name,vi,round(normal.x,2),round(normal.y,2),round(normal.z,2))
   if ck not in shadecache:
    occlusion=0
    for direction in directions:
     hit=contact.ray_cast(p+normal*.65,direction,180)
     if hit[0] is not None:occlusion+=(1-hit[3]/180)/5
    shadecache[ck]=1-.55*occlusion
   value=shadecache[ck];f.append(len(vv));vv.append(tuple(p));uvs.append(tuple(obj.data.uv_layers.active.data[li].uv));colors.append((value,value,value,1))
  ff.append(tuple(f));mids.append(materials.index(obj.data.materials[poly.material_index]))
 data=bpy.data.meshes.new('Cloudfall chunk %s'%str(key));data.from_pydata(vv,[],ff);data.update()
 obj=bpy.data.objects.new('Worldspire / mineral sector %02d %d'%key,data);bpy.context.collection.objects.link(obj)
 for material in materials:data.materials.append(material)
 uv=data.uv_layers.new(name='Mineral metres');shade=data.color_attributes.new(name='Contact occlusion',type='BYTE_COLOR',domain='CORNER')
 for i,poly in enumerate(data.polygons):
  poly.material_index=mids[i]
  for li in poly.loop_indices:
   vi=data.loops[li].vertex_index;uv.data[li].uv=uvs[vi];shade.data[li].color=colors[vi]
 chunks.append(obj)
for obj in static:
 obj.name='SOURCE / '+obj.name;obj.hide_render=True;obj.hide_set(True)
valve.hide_set(True)
bpy.ops.object.select_all(action='DESELECT')
for obj in chunks:obj.select_set(True)
bpy.context.view_layer.objects.active=chunks[0]
visual_triangles=sum(len(o.data.polygons) for o in chunks)
provenance={**(json.loads((SRC/'model-provenance.json').read_text()) if (SRC/'model-provenance.json').exists() else {}),'generator':'Blender 5.1.1 / project-authored deterministic script','source':'worldspire-environment.blend','runtime':'worldspire-environment.glb','geometryVersion':route['geometryVersion'],'routeSha256':collision['routeSha256'],'triangles':visual_triangles,'collisionTriangles':len(indices)//3,'chunks':len(chunks),'geometryDigest':geometry_digest,'geometry':'Connected crystalline primary/satellite slabs with staggered sectional breaks, thick interlocking exterior shoulders with uneven split-column crowns and deep clefts, selectively consolidated interior planes, retained broken fracture lips and through-going unequal faults shared by the core and its inclined return, plus three broad oblique mineral ranges and unequal through-going clefts shared continuously by the lower root bed and its receiving shoulders; open ordinary sky-clefts, a stepped daylight Heart chamber and tall offset Echo vault whose unequal leaning mineral folds continue across core walls, crown haunches and buttresses, cut from actual all-hull ballistic columns, and an incoming-facing split Root crown grown continuously from two unequal folded mineral roots with grounded feet and open off-center clefts.','materials':'Metric mineral UVs, shared physical substrate and global contact occlusion; directional light remains entirely runtime.','seed':401,'anchors':len(resonance['anchors']),'fixtures':len(resonance['fixtures']),'chamberVolumes':scene.get('chambers',[]),'clearance':audit}
print('WORLDPIRE READY',json.dumps({k:v for k,v in provenance.items() if k not in ['clearance']}),flush=True)
assert visual_triangles<300000,'Unexpected macro triangle growth'
if '--dry' not in sys.argv:
 bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'worldspire-environment.blend'))
 bpy.ops.export_scene.gltf(filepath=str(OUT/'worldspire-environment.glb'),export_format='GLB',use_selection=True,export_yup=True,export_materials='EXPORT',export_vertex_color='NAME',export_vertex_color_name='Contact occlusion',export_all_vertex_colors=False,export_cameras=False,export_lights=False,export_animations=False)
 (SRC/'resonance-kit.json').write_text(json.dumps(resonance,separators=(',',':')))
 (SRC/'collision-kit.json').write_text(json.dumps(collision,separators=(',',':')))
 (SRC/'model-provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
 print('WORLDspire exported',visual_triangles,'visual /',len(indices)//3,'physical triangles',flush=True)
