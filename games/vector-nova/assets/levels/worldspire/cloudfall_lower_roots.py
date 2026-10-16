"""Large continuous inclined mineral ranges across Worldspire's lower roots.

One shared section deforms the connected bed and the three receiving shoulders.
The clefts change their complete crown and side profiles rather than attaching
extra fins to a primitive base. All production safety cuts follow this step.
"""
import math
import bmesh
from mathutils import Vector

TARGETS=(
 'Cloudfall / three interlocking fractured roots',
 'Finish / broad near rooted buttress',
 'Finish / unequal middle root shoulder',
 'Finish / low receiving mineral return',
)

def _linear(value,keys):
 if value<=keys[0][0]:return keys[0][1]
 for (a,x),(b,y) in zip(keys,keys[1:]):
  if value<=b:return x+(y-x)*(value-a)/(b-a)
 return keys[-1][1]

def _smooth(value):
 q=max(0,min(1,value));return q*q*(3-2*q)

def lower_root_drop(x,z):
 # The three unequal ranges run down from the spine into the receiver. Their
 # long joint lines lean, change direction once, and fade below the landmark's
 # separate grounded feet. Wide quiet planes retain the scale of the spire.
 bend=_linear(z,[(600,-50),(850,0),(1080,50),(1210,5),(1510,-75),(1750,-100),(1900,-100)])
 along=x+.24*(z-1100)+bend
 depth=_linear(along,[(-720,0),(-440,18),(-275,145),(-145,158),
      (-60,40),(85,0),(170,65),(255,220),(345,184),(420,62),
      (535,18),(620,110),(755,205),(880,48),(1050,0),(1210,0)])
 # At the forward edge the different ridges descend into the receiving body;
 # the fade ends before the two accepted split-crown foundation footprints.
 reach=_smooth((z-620)/230)*(1-_smooth((z-1640)/230))
 outer=_smooth((x+800)/170)*(1-_smooth((x-1010)/250))
 return depth*reach*outer

def fold_lower_root_bodies(c,objects):
 selected=[o for o in objects if o.name in TARGETS]
 assert len(selected)==len(TARGETS),'The lower-root section lost an authored body'
 summary=[]
 for ob in selected:
  bm=bmesh.new();bm.from_mesh(ob.data)
  if ob.name.startswith('Finish /'):
   # These source faces are hundreds of metres across. A shared watertight
   # subdivision samples the broad profile; no random small-scale displacement
   # or extra fragment geometry is introduced.
   bmesh.ops.triangulate(bm,faces=list(bm.faces))
   longest=max(e.calc_length() for e in bm.edges)
   cuts=max(1,min(12,math.ceil(longest/58)-1))
   bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=cuts,use_grid_fill=True)
  moved=0;maximum=0
  for vertex in bm.verts:
   world=Vector((vertex.co.x,vertex.co.z,-vertex.co.y))
   amount=lower_root_drop(world.x,world.z)
   # The closed mineral bottom remains fixed. This map has positive vertical
   # derivative everywhere: max depth220 / transition700 *1.5 < 0.48.
   # Thus the continuous volume never folds back through itself.
   amount*=_smooth((world.y+580)/700)
   if amount>1e-5:
    moved+=1;maximum=max(maximum,amount);vertex.co.z-=amount
  bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
  boundary=sum(e.is_boundary for e in bm.edges)
  nonmanifold=sum(not e.is_manifold for e in bm.edges)
  assert boundary==0 and nonmanifold==0,'Lower-root source must remain closed: '+ob.name
  bm.to_mesh(ob.data);bm.free();ob.data.update()
  # Semantic finishes follow real exposed geological planes. Their pigments
  # remain spatially continuous in the runtime material.
  for face in ob.data.polygons:
   if face.normal.z>.66:face.material_index=3
   elif face.normal.z>.12:face.material_index=4
  summary.append({'name':ob.name,'vertices':len(ob.data.vertices),'moved':moved,'maxDrop':maximum,'boundary':boundary,'nonManifold':nonmanifold})
 print('LOWER ROOT CONTINUOUS FOLDS',summary,flush=True)
 return selected


def finish_lower_root_junction(c,objects):
 """Remove a small self-touching basal tip left by the complete safety CSG.

 The near return has a folded lower corner where intersecting cut surfaces can
 leave four faces sharing an edge. A bounded subtractive basal fracture clips
 that junction, well below the road, without changing the load-bearing body.
 """
 target=next(o for o in objects if o.name=='Finish / broad near rooted buttress')
 lo=Vector((405.19284,160.90703,986.98358));hi=Vector((427.28641,186.80415,1009.62152))
 vertices=[(lo.x,lo.y,lo.z),(hi.x,lo.y,lo.z),(hi.x,hi.y,lo.z),(lo.x,hi.y,lo.z),
           (lo.x,lo.y,hi.z),(hi.x,lo.y,hi.z),(hi.x,hi.y,hi.z),(lo.x,hi.y,hi.z)]
 faces=[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
 cutter=c['mesh']('CUT / lower return basal fracture',vertices,faces,c['obsidian'])
 for material in [c['fracture'],c['cavity'],c['rind'],c['fresh']]:cutter.data.materials.append(material)
 for face in cutter.data.polygons:face.material_index=4
 c['apply_cut'](target,cutter,'Lower return basal fracture')
 c['bpy'].data.objects.remove(cutter,do_unlink=True)
 bm=bmesh.new();bm.from_mesh(target.data)
 assert all(e.is_manifold for e in bm.edges),'Lower return cut junction must be manifold'
 bm.free()
