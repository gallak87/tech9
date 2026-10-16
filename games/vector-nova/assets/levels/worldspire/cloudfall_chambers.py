"""Two substantial chamber crowns, fitted above the real ballistic envelope.

These masses are constructed after open exterior clefts. Their driving and full
flight safety cuts are still mandatory; oversized artistic voids are not applied
a second time because that would erase the intentional roof.
"""
import math
from mathutils import Vector
UP=Vector((0,1,0))
def chamber_wall_relief(hero,along,relative_y,side):
 """Large continuous folds shared by the core, roof haunches and buttresses.

 Positive displacement opens the cavity into its backing. Broad unequal
 mineral ribs remain between these returns; this field adds no loose fins.
 """
 def linear(x,keys):
  if x<=keys[0][0]:return keys[0][1]
  for (a,va),(b,vb) in zip(keys,keys[1:]):
   if x<=b:return va+(vb-va)*(x-a)/(b-a)
  return keys[-1][1]
 if hero=='heart-chasm':
  keys=([(-160,0),(-60,20),(90,90),(180,135),(255,58),(365,22),
         (445,112),(565,70),(690,15),(810,0)] if side<0 else
        [(-160,0),(-20,15),(150,60),(275,115),(365,85),(485,20),
         (575,95),(690,45),(810,0)])
  lean=.16 if side<0 else -.11
 else:
  keys=([(-160,0),(-35,35),(95,120),(205,82),(280,18),(400,115),
         (510,72),(620,12),(750,0)] if side<0 else
        [(-160,0),(-15,15),(150,92),(250,125),(345,25),(470,72),
         (565,125),(675,48),(750,0)])
  lean=-.12 if side<0 else .18
 # Each joint drifts coherently through hundreds of metres of vertical grain.
 station=along-lean*(relative_y+150)
 relief=linear(station,keys)
 height=linear(relative_y,[(-1000,0),(-720,.28),(-460,.72),(-240,1),
                          (-60,1),(150,.84),(300,.40),(470,0)])
 return relief*height

def build_chamber_crowns(c):
 route=c['route'];longitudinal=c['longitudinal'];apply_cut=c['apply_cut'];bpy=c['bpy'];new=[];records=[]
 for hero,label,end,depth in [('heart-chasm','Heart',900,360),('echo-chasm','Echo',750,460)]:
  corridor=next(v for v in route['flightCorridors'] if v['id']==hero)
  fw=Vector(corridor['forward']).normalized();right=UP.cross(fw).normalized()
  origin=Vector(corridor['columns'][0]['p']);origin.y=0
  columns=[((Vector(v['p'])-origin).dot(fw),v['maxY']) for v in corridor['columns']]
  def ceiling(along):
   active=[y for d,y in columns if abs(d-along)<=65]
   if active:return max(active)+65
   if along<columns[0][0]:return columns[0][1]+65+(columns[0][0]-along)*.29
   return columns[-1][1]+65
  # Each row is a thick asymmetric inverted-U mineral section. Large inclined
  # side haunches penetrate the old walls; the center is a broad solid crown.
  # Four main fracture planes and two 50–90 m bevel bands define its thickness.
  if hero=='heart-chasm':
   # Unequal stepped inner faces lead toward one oblique daylight fracture.
   # The central underside is no longer three parallel excavated slots.
   inner=[(-.95,-260),(-.63,-210),(-.44,-90),(-.32,28),(-.22,50),
          (-.19,135),(-.07,172),(.03,118),(.16,95),(.22,22),
          (.36,-40),(.48,-130),(.70,-245),(1,-300)]
  else:
   # The taller vault is deliberately off-centre. Its inner crown descends
   # toward the receiving mouth, retaining enclosure in the real flight view.
   inner=[(-.95,-340),(-.65,-245),(-.45,-50),(-.37,120),(-.27,210),
          (-.12,290),(.04,240),(.18,145),(.31,60),(.45,-110),(.72,-315),(1,-350)]
  outline=inner+[(1.09,60),(.95,depth*.70),(.66,depth),(.27,depth*1.12),
      (-.11,depth*1.22),(-.47,depth*1.03),(-.86,depth*.85),(-1.08,150)]
  old_alongs=[-180,-70,100,300,500,end-140,end-60,end]
  alongs=sorted(set(old_alongs+[float(v) for v in range(-100,end-60,55)]))
  def row_value(along,values):
   for j,(a,b) in enumerate(zip(old_alongs,old_alongs[1:])):
    if along<=b:return values[j]+(values[j+1]-values[j])*(along-a)/(b-a)
   return values[-1]
  rows=[];rowmeta=[]
  for j,along in enumerate(alongs):
   q=(along+180)/(end+180)
   # A wide rooted entrance narrows toward a staggered broken daylight mouth.
   width=(610 if hero=='heart-chasm' else 675)*(1-.28*q)
   shift=35*math.sin(q*2.3)+(18 if hero=='echo-chasm' else -12)
   base=ceiling(along)
   crown_relief=row_value(along,[0,38,5,65,-20,25,-30,-60])
   row=[]
   for k,(xx,yy) in enumerate(outline):
    # Only the exposed outer mouth is skewed. End planes are inclined and
    # stepped through the preceding two sections, never a thin facade panel.
    skew=(45*xx+18*math.sin(k*.9))*(q*q)
    point=origin+fw*(along+skew)+right*(xx*width+shift)
    if k<len(inner):
     if hero=='echo-chasm' and yy>0:yy*=1-.72*q
     elif hero=='heart-chasm' and 3<=k<=10:
      yy+=row_value(along,[0,18,-22,46,-12,10,-18,-32])*(.6+.4*math.sin(k*.7))
    point.y=base+yy+(crown_relief if k>=len(inner) else 0)
    if k<len(inner):
     side=-1 if xx<0 else 1
     # Preserve the central roof and the outer skirt where it buries into the
     # original core. The broad visible haunches receive the same leaning fold.
     blend=max(0,min(1,(abs(xx)-.28)/.25))*max(0,min(1,(.96-abs(xx))/.20))
     relief=chamber_wall_relief(hero,along+skew,point.y-base,side)
     point+=right*(side*min(110,relief)*blend)
    row.append(point)
   rows.append(row);rowmeta.append({'along':along,'ceiling':base,'halfWidth':width})
  ob=longitudinal(label+' chamber / interlocking descending mineral crown',rows,c['obsidian'])
  for material in [c['fracture'],c['cavity'],c['rind'],c['fresh']]:ob.data.materials.append(material)
  for face in ob.data.polygons:
   if face.index<2:face.material_index=4
   else:
    side=(face.index-2)%len(outline)
    face.material_index=4 if side in (3,5,8,len(inner)+2,len(inner)+5) else 2 if side<len(inner)-1 else 3
  channels=[]
  if hero=='echo-chasm':
   # Two blind vertical excavations flank the offset vault. Their unequal
   # heights/stations leave substantial connected ribs instead of ceiling rails.
   for index,(along,lateral,span,rise) in enumerate([(255,-330,95,305),(560,345,75,250)]):
    side=1 if lateral>0 else -1;cuts=[]
    for j,(lift,scale,drift) in enumerate([(-230,.45,-25),(-65,1,0),(125,.87,24),(rise,.48,50)]):
     centre=origin+fw*(along+drift)+right*lateral+UP*(ceiling(along)+lift)
     shape=[(-span*scale,-135),(span*scale,-135),(span*.74*scale,180),(0,225),(-span*.65*scale,170)]
     cuts.append([centre+fw*x+right*(side*z) for x,z in shape])
    cutter=longitudinal('CUT / Echo tall blind side recess '+str(index),cuts,c['obsidian'])
    for material in [c['fracture'],c['cavity'],c['rind'],c['fresh']]:cutter.data.materials.append(material)
    for face in cutter.data.polygons:face.material_index=2 if face.index%5 in (2,3) else 4
    apply_cut(ob,cutter,'True Echo tall blind side recess '+str(index))
    bpy.data.objects.remove(cutter,do_unlink=True)
    channels.append(('vertical',along,lateral,span,rise))
  if hero=='heart-chasm':
   # A single oblique side slit admits real sky. Its finite ends retain the
   # continuous crown and its width stays small relative to the whole chamber.
   cuts=[]
   for along,lateral,w in [(85,-215,72),(260,-175,105),(490,-205,95),(735,-125,58)]:
    centre=origin+fw*along+right*lateral;yy=ceiling(along)
    cuts.append([centre+right*x+UP*(yy+y) for x,y in [(-w*.55,-90),(w*.55,-90),(w*.45-65,depth*1.6+260),(-w*.65-65,depth*1.6+260)]])
   cutter=longitudinal('CUT / Heart narrow oblique daylight fracture',cuts,c['obsidian'])
   for material in [c['fracture'],c['cavity'],c['rind'],c['fresh']]:cutter.data.materials.append(material)
   for f in cutter.data.polygons:f.material_index=4
   apply_cut(ob,cutter,'True Heart finite daylight fracture')
   bpy.data.objects.remove(cutter,do_unlink=True)
  new.append(ob)
  ribs=[]
  def bearing(name,along,lateral,span,width,below,above,lean):
   rows=[];yy=ceiling(along);side=1 if lateral>0 else -1
   outline=[(-.70,-1),(.55,-1),(1,-.50),(1,.60),(.50,1),(-.65,1),(-1,.55),(-1,-.55)]
   for lift,a,b,shift in [(-below,span*.88,width,side*45),(-below*.55,span*.68,width*.80,side*12),(-below*.18,span*.60,width*.62,-side*20),(above*.35,span*.75,width*.90,side*5),(above,span,width*1.15,side*70)]:
    centre=origin+fw*(along+lean*lift)+right*(lateral+shift)+UP*(yy+lift)
    row=[]
    for x,z in outline:
     point=centre+fw*(x*a)+right*(z*b)+UP*(x*18+z*12)
     station=(point-origin).dot(fw)
     relief=chamber_wall_relief(hero,station,point.y-ceiling(station),side)
     inward=max(0,min(1,(1-side*z)*.5))
     point+=right*(side*min(relief,b*.65)*inward)
     row.append(point)
    rows.append(row)
   rib=longitudinal(label+' chamber / '+name,rows,c['obsidian'])
   for material in [c['fracture'],c['cavity'],c['rind'],c['fresh']]:rib.data.materials.append(material)
   for f in rib.data.polygons:f.material_index=4 if f.index%8 in [2,5] else 3 if f.index%8 in [1,6] else 0
   new.append(rib);ribs.append(rib.name)
  if hero=='echo-chasm':
   bearing('rooted offset west buttress',140,-285,105,125,390,355,.13)
   bearing('rooted offset east buttress',480,290,135,105,320,315,-.17)
   # Shorter vertical companion columns merge into those haunches, rather
   # than repeating the former long horizontal ceiling flutes.
   for index,(along,lateral,span,width) in enumerate([(40,-370,50,48),(340,-345,45,40),(365,365,58,48),(650,325,42,45)]):
    bearing('seated vertical split column '+str(index),along,lateral,span,width,180+index*15,270-index*15,.06 if index%2 else -.08)
  else:
   bearing('broken daylight shoulder',365,-300,150,105,280,165,.15)
   bearing('receding eastern fracture shoulder',710,320,105,95,215,150,-.18)
  records.append({'hero':hero,'object':ob.name,'origin':list(origin),'forward':list(fw),'right':list(right),'sections':rowmeta,'depth':depth,'recesses':len(channels),'ribs':ribs,'daylightCleft':hero=='heart-chasm'})
 return new,records
