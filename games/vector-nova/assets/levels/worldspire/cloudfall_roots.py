"""Continuous grounded mineral roots beneath the authored finish crown.

Join each existing founded Root footing directly into its accepted split crown.
The upper outline and pale inner reveal stay at the accepted coordinates.
"""
from mathutils import Vector
UP=Vector((0,1,0))

def build_continuous_roots(c,surface,longitudinal):
 route=c['route'];height=c['HEIGHT'];objects=[];foundations=[]
 gate=min(route['samples'],key=lambda s:abs(s['s']-(route['finish']-50)))
 incoming=next(h for h in route['landmarks'] if h['id']=='root-gate')['landingStart']
 t=Vector(incoming['t']);t.y=0;t.normalize();r=UP.cross(t).normalized()
 p=Vector(gate['p'])+t*140
 old_outline=[(-.70,-1),(.55,-1),(1,-.55),(1,.60),(.50,1),(-.60,1),(-1,.55),(-1,-.50)]
 # Three unequal return planes open one front cleft through the whole root.
 # Intermediate points recess the accepted outline instead of adding fins.
 foot=[(-.70,-1),(-.05,-1),(.12,-.76),(.31,-.67),(.40,-1),(.55,-1),
       (1,-.55),(1,.60),(.50,1),(-.60,1),(-1,.55),(-1,-.50)]
 crown=[(-1,-1),(.18,-1),(.28,-.70),(.46,-.79),(.60,-1),(1,-1),
        (1,0),(1,1),(0,1),(-1,1),(-1,0),(-1,-.65)]
 paths=[ [(-123,-30),(-146,150),(-108,278),(-53,345)],
         [(123,-30),(130,142),(84,225),(23,268)] ]
 for branch,points in enumerate(paths):
  side=-1 if branch==0 else 1;thickness=38 if branch==0 else 31
  centre=p+r*(side*123)
  probes=old_outline+[((a[0]+b[0])/2,(a[1]+b[1])/2) for a,b in zip(old_outline,old_outline[1:]+old_outline[:1])]+[(0,0)]
  ground=[]
  for x,z in probes:
   q=centre+r*(x*95)+t*(z*105)
   hit=surface.ray_cast(Vector((q.x,height+1500,q.z)),-UP,height+2500)
   assert hit[0] is not None,'Continuous root has no connected mineral footing'
   ground.append(hit[0].y)
  bottom=min(min(ground)-35,p.y+32-110);neck=p.y-30
  rows=[]
  # Unequal tapered sections remove the separate broad upper pedestal cap.
  # Lower widths remain inside the former footing envelope. Production road
  # and flight clearance checks still apply to the complete exported geometry.
  levels=(
   [(0,95,105,0,0,0),(.32,77,86,.14,0,-2),(.40,60,68,.38,-3,-9),
    (.64,60,66,.56,-5,-8),(.73,43,48,.76,-2,-3),(.87,44,49,.88,2,0)]
   if branch==0 else
   [(0,95,105,0,0,0),(.23,75,87,.16,0,2),(.34,60,70,.38,2,9),
    (.62,58,67,.57,-3,7),(.74,41,49,.78,-2,4),(.87,39,43,.90,1,0)])
  for fraction,w,depth,mix,drift,lean in levels:
   y=bottom+(neck-bottom)*fraction
   origin=Vector((centre.x,y,centre.z))+t*drift+r*lean
   outline=[(a*(1-mix)+u*mix,b*(1-mix)+v*mix) for (a,b),(u,v) in zip(foot,crown)]
   rows.append([origin+r*(x*w)+t*(z*depth)+UP*(13*x*mix) for x,z in outline])
  reveal=[]
  for xx,yy in points:
   rows.append([p+r*(xx+x*thickness)+UP*(yy+13*x)+t*(z*38) for x,z in crown])
   reveal.append([p+r*(xx+dx)+UP*(yy+dy)+t*z for dx,dy,z in [(-4,-8,-39),(4,8,-39),(4,8,-43),(-4,-8,-43)]])
  body=longitudinal('Root / continuous unequal mineral root '+str(branch),rows,c['calm'])
  for material in [c['fracture'],c['cavity'],c['rind'],c['fresh']]:body.data.materials.append(material)
  for face in body.data.polygons:
   edge=(face.index-2)%len(crown)
   face.material_index=2 if edge in (1,2,3) else 4 if edge in (4,6,10) else 3
  objects.append(body)
  objects.append(longitudinal('Root / fitted pale fracture reveal '+str(branch),reveal,c['ivory']))
  foundations.append({'branch':branch,'bottom':bottom,'neck':neck,'minBurial':min(ground)-bottom,'probes':len(probes)})
 return objects,foundations
