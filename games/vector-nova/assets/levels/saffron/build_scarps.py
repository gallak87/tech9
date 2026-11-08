"""Blender-authored fractured Saffron sediment scarps.

Run: blender --background --threads 4 --python assets/levels/saffron/build_scarps.py
JSON is the synchronous runtime geometry; BLEND and GLB retain editable/review sources.
Game axes: +Y up; normalized family envelopes fit X +/-1.4, Z +/-1.2, Y -.2..1.
"""
import bpy, bmesh, math, json, hashlib
from pathlib import Path
from mathutils import Vector

HERE = Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene['purpose'] = 'Fractured connected sediment scarps for Saffron racing middle distance'
scene['runtime_export'] = 'scarps-meshes.json'

material = bpy.data.materials.new('Saffron sediment / exposed bedding and recessed faults')
material.use_nodes = True
material.diffuse_color = (.51, .37, .245, 1)
bsdf = material.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = .95
color_node = material.node_tree.nodes.new('ShaderNodeVertexColor')
color_node.layer_name = 'Sediment'
material.node_tree.links.new(color_node.outputs['Color'], bsdf.inputs['Base Color'])

# A folded wall cross section, not a radial extrusion. Long shear faces connect
# capped ledges, an uneven ridge, eroded slopes and a deep buried toe.
PROFILE = [
 (-1.12, -.20), (-1.16, .025), (-1.04, .13), (-.90, .24),
 (-.78, .32), (-.75, .49), (-.78, .52), (-.70, .55),
 (-.67, .76), (-.70, .80), (-.59, .84), (-.49, .96),
 (-.15, 1.0), (.24, .95), (.47, .82), (.49, .66),
 (.62, .62), (.70, .34), (.91, .14), (1.06, -.02), (1.10, -.20),
]
STATIONS = [-1.18,-1.09,-.88,-.77,-.67,-.56,-.48,-.415,-.365,-.32,-.24,-.12,0,.12,.235,.29,.335,.38,.45,.56,.70,.98,1.1,1.18]

def interp(keys, z):
 for i in range(len(keys)-1):
  a, va = keys[i]; b, vb = keys[i+1]
  if z <= b:
   return va + (vb-va)*max(0,min(1,(z-a)/(b-a)))
 return keys[-1][1]

def game_to_blender(p): return (p[0], -p[2], p[1])
def blender_to_game(p): return (p.x, p.z, -p.y)

objects = []
for family in range(3):
 verts = []; faces = []
 heights = [
  [(-1.18,.44),(-.90,.74),(-.55,.89),(-.23,.83),(.12,1),(.43,.92),(.75,.72),(1.18,.48)],
  [(-1.18,.39),(-.86,.55),(-.62,.79),(-.20,.87),(.18,.83),(.52,1),(.85,.76),(1.18,.52)],
  [(-1.18,.60),(-.86,.82),(-.48,1),(-.12,.91),(.22,.72),(.55,.81),(.85,.68),(1.18,.38)],
 ][family]
 for j, z in enumerate(STATIONS):
  h = interp(heights,z)
  width = .81 + .19*math.sin((z+1.18)/2.36*math.pi)
  # Unequal, oblique cliff buttresses break the plan silhouette. These are
  # large structural planes with a shared foot, rather than separate boulders.
  bow = .07*math.sin(z*3.5+family*1.4) + .07*math.sin(z*7.1-family)
  fault_a = max(0,1-abs(z-(-.365+.025*family))/.075)
  fault_b = max(0,1-abs(z-(.335-.015*family))/.065)
  notch = max(fault_a,fault_b)
  for i,(x,y) in enumerate(PROFILE):
   level=max(0,y)
   face=1 if x<0 else -1
   # Deep diagonal faults travel through the real rock volume. A sheltered
   # narrow notch meets broad uninterrupted fracture faces on either side.
   recess = notch*(.18+.16*level)*face
   buttress=.10*math.sin(z*7.2+family*.9)*math.sin(level*math.pi*.9)
   xx=x*width + bow*level + recess + (buttress if x<0 else -buttress*.7)
   # Fold a few bedding planes without making sinusoidal stacked rings.
   bedding = .017*math.sin(z*2.2+family) * (1 if i in (5,6,7,8,9,10,15,16) else .4)
   yy = y if y<0 else y*h + bedding - notch*.23*level
   zz = z*.89 + (.09 if family!=1 else -.11)*level + .04*math.sin(i*.8+family)*level
   verts.append(game_to_blender((xx,yy,zz)))
 n=len(PROFILE)
 for j in range(len(STATIONS)-1):
  for i in range(n):
   faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
 faces.append(tuple(range(n-1,-1,-1)))
 faces.append(tuple((len(STATIONS)-1)*n+i for i in range(n)))
 mesh = bpy.data.meshes.new(f'Sediment scarp {family} editable folded wall')
 mesh.from_pydata(verts,[],faces); mesh.update()
 obj=bpy.data.objects.new(f'scarp_{family}',mesh); scene.collection.objects.link(obj)
 obj.data.materials.append(material)
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
 # A restrained real bevel catches the pale sun while retaining the cliff's
 # primary flat fracture planes; no displacement texture supplies silhouette.
 bpy.context.view_layer.objects.active=obj;obj.select_set(True)
 bevel=obj.modifiers.new('Small eroded mineral arrises','BEVEL');bevel.width=.007;bevel.segments=1;bevel.limit_method='ANGLE';bevel.angle_limit=1.15
 bevel.affect='EDGES'
 bpy.ops.object.modifier_apply(modifier=bevel.name)
 obj.select_set(False)
 # Normalize final height envelope, keeping the buried toe exactly -.2.
 top=max(v.co.z for v in obj.data.vertices)
 for v in obj.data.vertices:
  if v.co.z>0: v.co.z/=top
 obj.data.update()
 attr=obj.data.color_attributes.new(name='Sediment',type='FLOAT_COLOR',domain='CORNER')
 for polygon in obj.data.polygons:
  p=polygon.center; normal=polygon.normal
  gx,gy,gz=blender_to_game(p)
  # Broad lithology and genuine surface orientation establish material
  # transitions; retain fine terrain weathering for runtime, not baked noise.
  bands=.5+.5*math.sin(gy*25+gz*1.8+family*.7)
  upward=max(0,normal.z)
  shade=.78+.22*upward
  recess=max(max(0,1-abs(gz+.35)/.115),max(0,1-abs(gz-.34)/.095))
  deep=recess*.12*(1-upward)
  t=max(0,min(1,.40+gy*.25+bands*.11+upward*.16-deep))
  dark=(.255,.172,.113);light=(.62,.47,.31)
  col=tuple((dark[k]*(1-t)+light[k]*t)*shade for k in range(3))
  for loop in polygon.loop_indices:attr.data[loop].color=(*col,1)
  polygon.use_smooth=False
 obj['family']=family
 obj['construction']='Single closed folded sediment wall; connected buttresses, oblique faults, capped ledges and buried erosional feet'
 objects.append(obj)

# Export per-corner normals/colors so hard fracture faces survive Three.js;
# each family shares one runtime material and one buffer. A triangle list is
# intentional: preserving distinct face normals costs fewer than 6000 triangles.
export={'format':1,'gameAxes':'+X lateral, +Y up, +Z along shelf','families':[]}
for obj in objects:
 mesh=obj.data;mesh.calc_loop_triangles();col=mesh.color_attributes['Sediment'];positions=[];normals=[];colors=[];indices=[];shared={}
 for tri in mesh.loop_triangles:
  for loop_index in tri.loops:
   loop=mesh.loops[loop_index];v=mesh.vertices[loop.vertex_index]
   position=tuple(round(x,5) for x in blender_to_game(v.co))
   normal=tuple(round(x,5) for x in blender_to_game(tri.normal))
   color=tuple(round(x,5) for x in col.data[loop_index].color[:3])
   key=(*position,*normal,*color)
   if key not in shared:
    shared[key]=len(positions)//3
    positions.extend(position);normals.extend(normal);colors.extend(color)
   indices.append(shared[key])
 export['families'].append({'name':obj.name,'positions':positions,'normals':normals,'colors':colors,'indices':indices})

json_path=HERE/'scarps-meshes.json'
json_path.write_text(json.dumps(export,separators=(',',':'))+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'scarps.blend'))
bpy.ops.export_scene.gltf(filepath=str(HERE/'scarps.glb'),export_format='GLB',export_apply=True,export_yup=True,export_normals=True,export_vertex_color='ACTIVE',export_cameras=False,export_lights=False)
manifest={'format':1,'source':'assets/levels/saffron/build_scarps.py','editable':'assets/levels/saffron/scarps.blend','reviewExport':'assets/levels/saffron/scarps.glb','runtime':'assets/levels/saffron/scarps-meshes.json','gameAxes':export['gameAxes'],'families':[],'sha256':{}}
for family in export['families']:
 p=family['positions'];manifest['families'].append({'name':family['name'],'triangles':len(family['indices'])//3,'bounds':{'min':[min(p[i::3]) for i in range(3)],'max':[max(p[i::3]) for i in range(3)]}})
for filename in ['build_scarps.py','scarps.blend','scarps.glb','scarps-meshes.json']:
 manifest['sha256']['assets/levels/saffron/'+filename]=hashlib.sha256((HERE/filename).read_bytes()).hexdigest()
(HERE/'scarps-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'families':manifest['families'],'runtimeBytes':json_path.stat().st_size}))
