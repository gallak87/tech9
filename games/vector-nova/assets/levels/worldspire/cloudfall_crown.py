"""A rooted Crown fracture assembled from intersecting three-dimensional solids.

Faces come from unequal cutting planes, not a repeated two-dimensional profile.
The main generator still applies every driving/passage/flight safety subtraction.
"""
import itertools, math
from mathutils import Vector, Matrix
UP=Vector((0,1,0))

def build_crown_shoulder(c):
 mesh=c['mesh'];objects=[]
 radial=Vector((450,0,-843)).normalized();side=UP.cross(radial).normalized()
 # Every normal/distance below is in a normalised local volume. Inclined end,
 # crown and cheek planes retain their real depth after metric scaling.
 def solid(name,along,lateral,y,extent,lean,variant):
  planes=[
   ((1,.10,-.11),1),((-1,-.13,.08),1),
   ((.08,.10,1),1),((-.12,-.06,-1),1),
   ((.26,1,.12),1),((-.08,-1,.09),1),
   ((1,.10,.76),1.40),((1,.04,-.92),1.42),
   ((-1,.02,.82),1.38),((-1,-.08,-.73),1.43),
   ((.18,1,.86),1.28),((-.14,1,-.80),1.22),
   ((.80,1,-.09),1.30),((-.82,1,.10),1.34),
   ((.25,-1,.82),1.48),((-.20,-1,-.87),1.44),
  ]
  # The far shoulder has a visibly oblique broken crown, not the same prism
  # rotated or scaled. The lower body and ledges have their own fracture angles.
  if variant==1:planes[4]=((-.31,1,.23),.93);planes[10]=((.06,1,.72),1.13)
  if variant==2:planes[4]=((.33,1,-.25),.97);planes[11]=((-.18,1,-.94),1.12)
  if variant>=3:planes[4]=((-.15,1,.24),.88);planes[5]=((.18,-1,-.06),.92)
  planes=[(Vector(n),d) for n,d in planes]
  vertices=[]
  for chosen in itertools.combinations(planes,3):
   m=Matrix([n for n,d in chosen])
   if abs(m.determinant())<1e-7:continue
   p=m.inverted()@Vector([d for n,d in chosen])
   if any(n.dot(p)>d+1e-5 for n,d in planes):continue
   if not any((p-v).length<1e-5 for v in vertices):vertices.append(p)
  faces=[];plane_ids=[]
  for pi,(normal,d) in enumerate(planes):
   ids=[i for i,p in enumerate(vertices) if abs(normal.dot(p)-d)<1e-4]
   if len(ids)<3:continue
   centre=sum((vertices[i] for i in ids),Vector())/len(ids)
   n=normal.normalized();u=n.cross(Vector((0,1,0)))
   if u.length<.01:u=n.cross(Vector((1,0,0)))
   u.normalize();v=n.cross(u)
   ids.sort(key=lambda i:math.atan2((vertices[i]-centre).dot(v),(vertices[i]-centre).dot(u)))
   faces.append(tuple(ids));plane_ids.append(pi)
  assert len(vertices)>12 and len(faces)>8,'Crown fracture lost three-dimensional thickness'
  centre=radial*along+side*lateral+UP*y
  points=[centre+radial*(p.x*extent[0]+p.y*extent[1]*lean[0])+UP*(p.y*extent[1])+side*(p.z*extent[2]+p.y*extent[1]*lean[1]) for p in vertices]
  obj=mesh('Crown / '+name,points,faces,c['obsidian'])
  for material in [c['fracture'],c['cavity'],c['rind'],c['fresh']]:obj.data.materials.append(material)
  for face,pi in zip(obj.data.polygons,plane_ids):
   face.material_index=4 if pi in [0,7,10,12] else 1 if pi==4 and variant in [1,3] else 3 if pi in [2,3,5,9,14,15] else 0
  objects.append(obj)
  return obj
 # The base penetrates the connected main spine. Upper shoulders sit deeply
 # into it, with unequal depth, lean and crown height; their staggered cheeks
 # leave a real recessed cleft rather than a black line painted on one face.
 solid('deep rooted crystalline bearing',440,0,5770,(430,500,250),(.09,-.05),0)
 solid('near leaning fracture shoulder',710,50,6380,(245,245,160),(.15,.05),1)
 solid('receding high fracture shoulder',870,150,6240,(255,240,155),(-.12,.10),2)
 # Both ledges remain on the same inside flank, seated into the lower body.
 solid('lower broken load-bearing ledge',640,40,6170,(260,70,200),(.10,-.05),3)
 solid('far stepped fracture ledge',850,90,6020,(220,90,170),(-.08,.08),4)
 # The ordinary chase sees the near shoulder's cut-plane return, rather
 # than its high crest. These unequal recessed fractures address that actual
 # face. They retain 100+ m of back mass and leave broad attached step/lip faces.
 target=next(o for o in objects if o.name.endswith('near leaning fracture shoulder'))
 normal=Vector((-.55,-.16,.82)).normalized();up=(UP-normal*UP.dot(normal)).normalized();across=up.cross(normal).normalized()
 for index,(point,width,high,depth) in enumerate([
   ((197,6570,-628),45,170,62),((258,6534,-598),75,145,95),((324,6518,-557),42,100,58),
 ]):
  centre=Vector(point);outline=[(-.60,-.42),(.05,-.60),(.49,-.30),(.58,.20),(.12,.55),(-.43,.36)]
  rows=[]
  for offset,scale,shift in [(45,1.05,0),(-depth,.72,14)]:
   rows.append([centre+across*(x*width+shift)+up*(y*high)+normal*offset for x,y in outline])
  cut=c['longitudinal']('CUT / Crown visible recessed fracture '+str(index),rows,c['obsidian'])
  for material in [c['fracture'],c['cavity'],c['rind'],c['fresh']]:cut.data.materials.append(material)
  for f in cut.data.polygons:f.material_index=4 if f.index in [1,3,5] else 2
  c['apply_cut'](target,cut,'True Crown visible fracture '+str(index))
  c['bpy'].data.objects.remove(cut,do_unlink=True)
 return objects
