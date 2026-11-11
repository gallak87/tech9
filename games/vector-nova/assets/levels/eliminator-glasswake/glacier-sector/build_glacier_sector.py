"""Original crown-only layered glacier, authored in native host metres.

Generate the editor guide with export-sector-guides.mjs, then run background
Blender with --python this_file.py -- --guide /tmp/glasswake-guide.json.
No canonical model, gameplay geometry or other massif site is modified.
"""
from pathlib import Path
import argparse, hashlib, json, math, struct, sys
import bpy, bmesh
from mathutils import Vector, Matrix, Quaternion
from mathutils.geometry import tessellate_polygon
from mathutils.bvhtree import BVHTree

HERE=Path(__file__).resolve().parent
GAME=HERE.parents[3]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--guide',type=Path,required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
GUIDE=args.guide.expanduser().resolve();G=json.loads(GUIDE.read_text())
OUT=GAME/'public/assets/levels/eliminator-glasswake/glacier-sector.glb'
BLEND=HERE/'glacier-sector.blend'
CANONICAL=GAME/'public/assets/levels/glasswake/glasswake-environment-v5.glb'
ROLES=['Pale fractured wind-polished ice','Blue compact ice planes','Cobalt buried blue-black core','Opaque frost crust','Fresh fracture blue edges']
def C(p):return Vector((p[0],-p[2],p[1]))
def W(p):return [p.x,p.z,-p.y]
CONVERT=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
H=Matrix([G['geometry']['host']['matrix'][i::4]for i in range(4)])
EDITOR_MATRIX=CONVERT@H@CONVERT.inverted()
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()

bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for m in list(bpy.data.materials):bpy.data.materials.remove(m)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
editcol=bpy.data.collections.new('EDIT / unequal closed geological shear masses');scene.collection.children.link(editcol)
guidecol=bpy.data.collections.new('GUIDE / exact world road geology cameras');scene.collection.children.link(guidecol)
runtimecol=bpy.data.collections.new('RUNTIME / native identity prototype only');scene.collection.children.link(runtimecol)
editor=bpy.data.objects.new('EDITOR / retained production crown parent',None);editcol.objects.link(editor);editor.matrix_world=EDITOR_MATRIX
editor['coordinateContract']='Source children are native host coordinates; editor parent is exact retained production matrix'
raw=CANONICAL.read_bytes();jl=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+jl]);binary=memoryview(raw)[20+jl+8:]
recipes={m['name']:m.get('pbrMetallicRoughness',{})for m in doc['materials']}
materials=[]
for name in ROLES:
 recipe=recipes[name];m=bpy.data.materials.new(name);m.diffuse_color=tuple(recipe.get('baseColorFactor',[1,1,1,1]));m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=m.diffuse_color;n.inputs['Roughness'].default_value=recipe.get('roughnessFactor',.6);n.inputs['Metallic'].default_value=recipe.get('metallicFactor',0);materials.append(m)

def fault_profile(z,keys):
 for (a,va),(b,vb)in zip(keys,keys[1:]):
  if z<=b:return va+(vb-va)*max(0,min(1,(z-a)/(b-a)))
 return keys[-1][1]

def fracture_form(point):
 # Three broad shear directions and broken/tapered ends, not fine noise.
 # A continuous positive deformation preserves the founded foot and the
 # connected spatial layout while removing the manufactured slab outline.
 x,y,z=point;w=max(0,min(1,(y-240)/80));w=w*w*(3-2*w)
 dx=fault_profile(z,[(-180,24),(-130,-9),(-90,28),(-50,5),(-10,-16),(30,20),(80,-8),(130,18),(180,24)])
 dy=fault_profile(z,[(-180,-22),(-140,-4),(-80,12),(-20,-14),(40,10),(90,-4),(140,8),(180,-18)])
 taper=.20*w*max(0,min(1,(abs(z)-110)/70))
 return (95+(x-95)*(1-taper)+w*dx,y+w*dy,z)

def mesh(name,points,faces,roles=None,collection=editcol,reference=False):
 data=bpy.data.meshes.new(name);data.from_pydata([C(p)for p in points],[],faces);data.update();bm=bmesh.new();bm.from_mesh(data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(data);bm.free()
 for m in materials:data.materials.append(m)
 if roles:
  for p,r in zip(data.polygons,roles):p.material_index=r
 for p in data.polygons:p.use_smooth=not reference
 if hasattr(data,'set_sharp_from_angle'):data.set_sharp_from_angle(angle=.43)
 obj=bpy.data.objects.new(name,data);collection.objects.link(obj)
 if collection==editcol:obj.parent=editor
 if reference:obj.hide_render=True;obj.display_type='WIRE'
 return obj

for label,parts in [('host',G['geometry']['host']['worldParts']),('context',G['geometry']['context']),('running',G['geometry']['drivingMeshes'])]:
 for i,p in enumerate(parts):
  pp=p['positions'];ii=p.get('indices')or list(range(len(pp)//3));obj=mesh('GUIDE_'+label+'_'+str(i),[pp[k:k+3]for k in range(0,len(pp),3)],[ii[k:k+3]for k in range(0,len(ii),3)],collection=guidecol,reference=True);obj['originalName']=p['name']
for name,view in G['cameras'].items():
 v=view['camera'];data=bpy.data.cameras.new('GUIDE_CAMERA_'+name);obj=bpy.data.objects.new(data.name,data);guidecol.objects.link(obj);q=Quaternion((v['quaternion'][3],*v['quaternion'][:3]));obj.matrix_world=(CONVERT.to_3x3()@q.to_matrix()).to_4x4();obj.location=C(v['position']);data.type='PERSP';data.sensor_fit='VERTICAL';data.sensor_height=24;data.lens=12/math.tan(math.radians(v['fov'])/2);data.clip_start=.2;data.clip_end=20000;obj.hide_render=True
 if name=='course-3':scene.camera=obj

# Broad polygonal footprints and explicit inclined caps establish large forms.
# There is no radial/superellipse loft, spherical lens or repeating roof strip.
def densify(poly,spacing=13):
 out=[]
 for a,b in zip(poly,poly[1:]+poly[:1]):
  count=max(1,math.ceil(math.dist(a,b)/spacing))
  out.extend(((a[0]+(b[0]-a[0])*i/count),(a[1]+(b[1]-a[1])*i/count))for i in range(count))
 return out

def area(a,b,c):return(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])

def solid(name,outline,bottom,top,side_role=0,bottom_role=2,top_role=3,top_shift=(0,0)):
 poly=densify(outline);points=[];faces=[];roles=[];n=len(poly);centre=(sum(x for x,z in poly)/n,sum(z for x,z in poly)/n)
 # Five closed side courses produce a real heavy shear section, not a card.
 for layer in range(6):
  t=layer/5
  for x,z in poly:
   xx=x+top_shift[0]*t;zz=z+top_shift[1]*t;points.append((xx,bottom(x,z)*(1-t)+top(xx,zz)*t,zz))
 for row in range(5):
  for i in range(n):
   j=(i+1)%n;faces.append((row*n+i,row*n+j,(row+1)*n+j,(row+1)*n+i));roles.append(side_role if row!=4 else 0)
 def cap(start,fn,role,reverse):
  boundary=[(points[start+i][0],points[start+i][2])for i in range(n)];lookup={(round(x,6),round(z,6)):start+i for i,(x,z)in enumerate(boundary)};ts=[]
  # Every outline is convex; a constrained centre fan retains EVERY dense
  # boundary edge. Generic polygon tessellation can omit collinear boundary
  # vertices and leave side/cap T junctions after constructive unions.
  cx=sum(x for x,z in boundary)/n;cz=sum(z for x,z in boundary)/n;mid=len(points);points.append((cx,fn(cx,cz),cz))
  for i in range(n):
   ids=(start+i,start+(i+1)%n,mid)
   if area(*[(points[k][0],points[k][2])for k in ids])<=0:raise RuntimeError('Non-convex cap footprint: '+name)
   ts.append(ids)
  for x in range(math.ceil(min(x for x,z in boundary)/13)*13,math.floor(max(x for x,z in boundary)/13)*13+1,13):
   for z in range(math.ceil(min(z for x,z in boundary)/13)*13,math.floor(max(z for x,z in boundary)/13)*13+1,13):
    p=(x,z)
    for k,(a,b,c)in enumerate(ts):
     q=lambda j:(points[j][0],points[j][2])
     if min(area(q(a),q(b),p),area(q(b),q(c),p),area(q(c),q(a),p))<=.00001:continue
     index=len(points);points.append((x,fn(x,z),z));ts[k]=(a,b,index);ts.extend([(b,c,index),(c,a,index)]);break
  for t in ts:faces.append(tuple(reversed(t))if reverse else t);roles.append(role)
 cap(0,bottom,bottom_role,True)
 cap(5*n,top,top_role,False)
 return mesh(name,points,faces,roles)

foot=[(-20,-180),(110,-180),(172,-166),(210,-125),(210,128),(174,180),(35,180),(-20,140)]
base=solid('Original / closed founded glacial foreland',foot,lambda x,z:0,lambda x,z:265+.13*(x+20)+.035*z,1,2,1)
rear=solid('Original / deep cobalt rear compression mass',[(117,-162),(190,-172),(210,-130),(210,135),(174,180),(125,152)],lambda x,z:220,lambda x,z:437-.045*z,2,2,3,(-3,-2))
cap_a=solid('Original / high unequal pale overburden',[(-8,-174),(137,-172),(190,-132),(198,-35),(124,35),(30,18),(-8,-34)],lambda x,z:379-.055*z+.035*x,lambda x,z:min(450,442+.045*z+.035*x),0,2,3,(7,-5))
cap_b=solid('Original / lower offset broken shoulder',[(26,-28),(146,-48),(205,0),(204,145),(165,180),(65,164),(28,95)],lambda x,z:334+.08*z+.045*x,lambda x,z:410+.065*z+.045*x,0,2,3,(9,-4))
ledge=solid('Original / heavy diagonal lower gallery return',[(-18,-154),(90,-171),(172,-128),(178,62),(105,121),(20,91),(-14,25)],lambda x,z:235+.025*z,lambda x,z:302+.06*z+.03*x,1,2,0,(4,-3))
# An unequal thick folded return carries the offset upper masses into the
# lower gallery. It forms a real lateral chamber wall, not a detached fan.
return_mass=solid('Original / founded folded curtain and broken side return',[(57,122),(135,96),(190,126),(177,175),(112,170),(76,152)],lambda x,z:250,lambda x,z:398+.09*z-.04*x,0,2,0,(7,-9))
components=[base,rear,cap_a,cap_b,ledge,return_mass]
for obj in components[1:]:
 modifier=base.modifiers.new('Closed geological union / '+obj.name,'BOOLEAN');modifier.operation='UNION';modifier.solver='EXACT';modifier.object=obj
 if hasattr(modifier,'material_mode'):modifier.material_mode='INDEX'
 obj.hide_render=True;obj.hide_set(True)
# Retain the independently editable coarse bodies and live constructive joins.
# A very modest melt lip rounds true edges without smoothing the fault mass.
bevel=base.modifiers.new('Restrained metre-scale rounded melt lips','BEVEL');bevel.width=.8;bevel.segments=2;bevel.limit_method='ANGLE';bevel.angle_limit=.48

# Registered project-owned derivation of the actual mineral material primitive.
# The ornamental pale torus primitives are intentionally not selected.
def accessor(index):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];fmt={5126:'f',5125:'I',5123:'H',5121:'B'}[a['componentType']];size=struct.calcsize(fmt)*count;offset=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size)
 return[struct.unpack_from('<'+fmt*count,binary,offset+i*stride)for i in range(a['count'])]
node=next(n for n in doc['nodes']if n.get('name')=='dark_inclusion');core_primitives=[(i,p)for i,p in enumerate(doc['meshes'][node['mesh']]['primitives'])if doc['materials'][p['material']]['name']=='Trapped meteoric inclusion']
def mineral_point(x,y,z):
 px,py,pz=132+x*1.3,328+y*.95,-65+z*1.05
 # Two genuine broad cleavage facets cut the exposed front of the retained
 # project-owned core; no decorative torus or added mineral object.
 px=max(px,111+.18*(py-354)+.10*(pz+65),112-.13*(py-354)-.12*(pz+65))
 return (px,py,pz)
core_points=[];core_faces=[]
for i,p in core_primitives:
 vv=accessor(p['attributes']['POSITION']);ii=[x[0]for x in accessor(p['indices'])]if'indices'in p else list(range(len(vv)));off=len(core_points);core_points.extend(mineral_point(x,y,z)for x,y,z in vv);core_faces.extend(tuple(off+q for q in ii[k:k+3])for k in range(0,len(ii),3))
core=mesh('Original assembly / deeply buried canonical meteoric core',core_points,core_faces,[2]*len(core_faces));core.data.materials.clear()
recipe=recipes['Trapped meteoric inclusion'];material=bpy.data.materials.new('Trapped meteoric inclusion');material.use_nodes=True;material.diffuse_color=tuple(recipe.get('baseColorFactor',[.08,.08,.08,1]));material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=material.diffuse_color;material.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.83;core.data.materials.append(material)

bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();evaluated=bpy.data.meshes.new_from_object(base.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps);# Apply the continuous broad fault to the completed closed union, avoiding
# independent nonlinear operand tessellations creating Boolean ambiguity.
for data in [evaluated,core.data]:
 for vertex in data.vertices:vertex.co=C(fracture_form(W(vertex.co)))
 data.update();bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(data);bm.free()
 if hasattr(data,'set_sharp_from_angle'):data.set_sharp_from_angle(angle=.43)
 data.calc_loop_triangles()
final_editor=bpy.data.objects.new('EDIT / final broad-fault source surface',evaluated.copy());editcol.objects.link(final_editor);final_editor.parent=editor
base.hide_render=True;base.hide_set(True)

# Validate the retained closed geological body and embedded mineral.
def closed_info(data):
 bm=bmesh.new();bm.from_mesh(data);result={'boundaryEdges':sum(e.is_boundary for e in bm.edges),'nonmanifoldEdges':sum(not e.is_manifold for e in bm.edges),'signedVolume':bm.calc_volume(signed=True)};bm.free();return result
closed={'body':closed_info(evaluated),'mineral':closed_info(core.data)}
if any(v['boundaryEdges']or v['nonmanifoldEdges']for v in closed.values()):raise RuntimeError('Open geological source: '+json.dumps(closed))
body_vertices=[v.co.copy()for v in evaluated.vertices];body_faces=[tuple(t.vertices)for t in evaluated.loop_triangles];body_tree=BVHTree.FromPolygons(body_vertices,body_faces,all_triangles=True)
def inside(tree,p):
 direction=Vector((.137,.883,.449)).normalized();origin=p.copy();crossings=0
 for _ in range(256):
  hit,_,_,_=tree.ray_cast(origin,direction,20000)
  if hit is None:return crossings%2==1
  crossings+=1;origin=hit+direction*.001
 raise RuntimeError('Unexpected excessive geological parity crossings')
contained=sum(inside(body_tree,v.co)for v in core.data.vertices)
if contained<len(core.data.vertices)*.45:raise RuntimeError('Mineral is insufficiently encased: '+str(contained))
foot_points=[W(v.co)for v in evaluated.vertices if abs(v.co.z)<.0001]
if len(foot_points)<8:raise RuntimeError('Missing closed founded Y0 foot')

# Actual production parent and every banked road/camera frame; broad guard is
# X±42,Y−12..90,Z±16, never relaxed to fit the asset.
world_vertices=[EDITOR_MATRIX@v for v in body_vertices];world_faces=list(body_faces);off=len(world_vertices);world_vertices.extend(EDITOR_MATRIX@v.co for v in core.data.vertices);world_faces.extend(tuple(off+i for i in t.vertices)for t in core.data.loop_triangles);tree=BVHTree.FromPolygons(world_vertices,world_faces,all_triangles=True)
centre=Vector((0,39,0));half=Vector((42,51,16))
def box_triangle(a,b,c):
 p=[a-centre,b-centre,c-centre];edges=[p[1]-p[0],p[2]-p[1],p[0]-p[2]];axes=[Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)),edges[0].cross(edges[1])];axes.extend(e.cross(axis)for e in edges for axis in[Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1))])
 for axis in axes:
  if axis.length_squared<1e-15:continue
  q=[v.dot(axis)for v in p];radius=sum(abs(axis[k])*half[k]for k in range(3))
  if min(q)>radius or max(q)<-radius:return False
 return True
checks=0;blockers=[]
for f in G['geometry']['frames']:
 origin=Vector(f['position']);right,up,tangent=Vector(f['right']),Vector(f['up']),Vector(f['tangent']);seen=set()
 for _,_,index,_ in tree.find_nearest_range(C(origin+up*39),69):
  if index in seen:continue
  seen.add(index);points=[]
  for j in world_faces[index]:
   d=Vector(W(world_vertices[j]))-origin;points.append(Vector((d.dot(right),d.dot(up),d.dot(tangent))))
  checks+=1
  if box_triangle(*points):blockers.append({'distance':f['distance'],'triangle':index})
 if len(blockers)>8:break
if blockers:raise RuntimeError('Protected production corridor blocked: '+json.dumps(blockers))

root=bpy.data.objects.new('fracture_glacier_sector',None);runtimecol.objects.link(root);root['coordinates']='Identity native host metres; +Y up; +X outboard; +Z along shore';root['assetKind']='Original crown-only connected layered glacier sector'
body=bpy.data.objects.new('fracture_glacier_sector__closed_angular_geology',evaluated);runtimecol.objects.link(body);body.parent=root
mineral=bpy.data.objects.new('fracture_glacier_sector__buried_mineral',core.data.copy());runtimecol.objects.link(mineral);mineral.parent=root
for obj in[body,mineral]:
 for p in obj.data.polygons:p.use_smooth=True
 if hasattr(obj.data,'set_sharp_from_angle'):obj.data.set_sharp_from_angle(angle=.43)
triangles=len(evaluated.loop_triangles)+len(core.data.loop_triangles)
if triangles>50000:raise RuntimeError('Substantive sector budget exceeded: '+str(triangles))
# A guide helper is a rebuild input only. Nothing under GUIDE is exported.
OUT.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
for obj in[root,body,mineral]:obj.select_set(True)
bpy.context.view_layer.objects.active=body
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
# Keep the native export in a hidden editor collection; world-positioned live
# source and reference cameras remain the useful initial .blend view.
runtimecol.hide_viewport=True;runtimecol.hide_render=True
guidecol.hide_render=True
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
export_bytes=OUT.read_bytes();export_json_length=struct.unpack_from('<I',export_bytes,12)[0];export_document=json.loads(export_bytes[20:20+export_json_length])
points=[W(v.co)for data in[evaluated,core.data]for v in data.vertices]
manifest={'id':'glasswake-glacier-sector-v1','root':'fracture_glacier_sector','stage':'Retained crown-only layered glacier sector with broad fault planes and an embedded cleaved mineral','source':{'file':str(Path(__file__).relative_to(GAME)),'sha256':sha(Path(__file__))},'blend':{'file':str(BLEND.relative_to(GAME)),'sha256':sha(BLEND)},'runtimeAsset':{'file':str(OUT.relative_to(GAME)),'sha256':sha(OUT),'bytes':OUT.stat().st_size},'guide':{'rebuildHelper':G['rebuildHelper'],'semanticGeometrySha256':G['semanticGeometrySha256'],'semanticViewsSha256':G['semanticViewsSha256'],'inputHashSnapshot':G['inputs'],'runtimeDependency':False},'geometry':{'triangles':triangles,'bodyTriangles':len(evaluated.loop_triangles),'mineralTriangles':len(core.data.loop_triangles),'bounds':{'min':[min(p[k]for p in points)for k in range(3)],'max':[max(p[k]for p in points)for k in range(3)]},'closedVolumes':closed,'foundedY0Vertices':len(foot_points),'nativeFootY':0,'formedFaults':'Broad asymmetric piecewise shear facets and tapered ends above nativeY240; exact founded foot unchanged','productionFootY':-145,'basalFloorY':-130,'footBurialMetres':15,'allRouteFrames':len(G['geometry']['frames']),'protectedVolume':G['protectedVolume'],'actualTriangleSATChecks':checks,'blockers':0,'mineralContainedVertices':contained,'mineralVertices':len(core.data.vertices),'mineralContainedFraction':contained/len(core.data.vertices),'materialRoles':[m['name']for m in export_document['materials']],'editorMeshesExported':0},'derivation':{'canonicalAsset':str(CANONICAL.relative_to(GAME)),'canonicalAssetSha256':sha(CANONICAL),'root':'dark_inclusion','selectedMaterial':'Trapped meteoric inclusion','selectedPrimitiveIndices':[i for i,p in core_primitives],'privateCleavage':'Two broad exposed front facets, followed by the same coherent geological shear as the containing body','ornamentalPaleToriSelected':False,'purpose':'Project-owned broad mineral core deeply encased in original new geological body'},'reference':{'file':'assets/levels/glasswake/scene-reference.png','sha256':sha(GAME/'assets/levels/glasswake/scene-reference.png'),'prompt':'assets/levels/glasswake/scene-prompt.txt','promptSha256':sha(GAME/'assets/levels/glasswake/scene-prompt.txt')},'rights':'Original project-authored editable shear masses and galleries; intentional registered derivation of the project-owned canonical mineral core. No third-party art, textures, light or motion assets.'}
(HERE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'asset':str(OUT),'triangles':triangles,'closed':closed,'bounds':manifest['geometry']['bounds'],'mineralContained':manifest['geometry']['mineralContainedFraction'],'SATChecks':checks,'sha256':sha(OUT)}))
