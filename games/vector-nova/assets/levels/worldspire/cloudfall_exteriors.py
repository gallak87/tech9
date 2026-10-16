"""Substantial exterior mineral bodies and the recessed faces visible in chase.

These replace repeated thin lofts. Independent driving/ballistic cuts remain in
cloudfall_geometry; all pieces start deeply connected to the main mineral mass.
"""
import itertools, math, json, bmesh, bisect, numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
UP=Vector((0,1,0))


def cut_continuous_core_faults(c,objects):
 """Open, unequal faults across the existing Copper core/return junction.

 Author these before road/sky/flight CSG; the unchanged Vault is carved first
 on the core to keep Exact self-intersection reconstruction bounded.
 They open completely outboard and run beyond the local upper contour. The
 lower ends sit below the visible return, so no rectangular lintel, jamb and
 shelf frame is introduced in the driving view. Existing shoulder meshes are
 untouched; the complete clearance and attachment checks still follow.
 """
 names=['Cloudfall / seven connected crystalline slabs','Mantle / inclined lower return']
 targets=[next(o for o in objects if o.name==name) for name in names]
 normal=Vector((.556,0,.831)).normalized();across=UP.cross(normal).normalized()
 origin=Vector((450,3445,330))
 heights=[1850,2400,2860,3150,3330,3445,3535,3750,4200,c['HEIGHT']+900]
 widths=[1.10,.98,.90,1.05,.85,1.10,.94,.83,.78,.75]
 depths=[.80,.95,1,1.04,1.08,1.12,1.14,1.18,1.22,1.30]
 # Large joint offsets occur at unequal levels. Only one side carries the
 # pronounced broken return; the other remains a long inclined mineral plane.
 broken_side=[0,8,-5,18,-10,23,7,-14,-8,0]
 specs=[(-101,46,88,-72,-30),(19,74,138,0,22),(141,57,112,95,45)]
 for ordinal,(lateral,width,depth,vertical,lean) in enumerate(specs):
  rows=[]
  for j,y in enumerate(heights):
   height=(y-1850)/max(1,heights[-1]-1850)
   p=origin+across*(lateral+lean*(height-.25));p.y=y+vertical
   w=width*widths[j];d=depth*depths[j]
   side=broken_side[(j+ordinal)%len(broken_side)]*.65
   # The opening reaches well outside every host surface. There is no outer
   # face enclosing the cleft and no narrowing top cap within visible mass.
   outline=[(-.57*w,2200),(.54*w+side,2200),(.46*w+side,-d*.22),
            (.16*w+side*.45,-d),(-.24*w,-d*.86),(-.55*w,-d*.13)]
   rows.append([p+across*x+normal*deep+UP*(x*(.30 if ordinal!=1 else -.26)) for x,deep in outline])
  cutter=c['longitudinal']('CUT / open continuous core fault '+str(ordinal),rows,c['obsidian'])
  for material in [c['fracture'],c['cavity'],c['rind'],c['fresh']]:cutter.data.materials.append(material)
  for face in cutter.data.polygons:
   side=(face.index-2)%6
   face.material_index=4 if side in (1,4) else 3 if side in (0,5) else 2
  for target in targets:c['apply_cut'](target,cutter,'Continuous open core/return fault '+str(ordinal))
  c['bpy'].data.objects.remove(cutter,do_unlink=True)
  print('CONTINUOUS CORE FAULT',ordinal,'width',width,'depth',depth,'heightRange',[heights[0]+vertical,heights[-1]+vertical],'targets',names,flush=True)
 return targets

def build_exterior_shoulders(c):
 objects=[]
 def crystal(name,point,axis,extent,lean,variant=0):
  radial=Vector(axis).normalized();side=UP.cross(radial).normalized()
  planes=[((1,.12,-.12),1),((-1,-.16,.10),1),
   ((.10,.12,1),1),((-.14,-.08,-1),1),
   ((.27,1,.16),1),((-.10,-1,.12),1),
   ((1,.12,.76),1.38),((1,.06,-.92),1.40),
   ((-1,.04,.82),1.36),((-1,-.10,-.73),1.42),
   ((.20,1,.86),1.25),((-.16,1,-.80),1.19),
   ((.80,1,-.12),1.27),((-.82,1,.13),1.32),
   ((.28,-1,.82),1.45),((-.22,-1,-.87),1.41)]
  if variant%3==1:planes[4]=((-.35,1,.24),.91);planes[10]=((.08,1,.70),1.11)
  if variant%3==2:planes[4]=((.36,1,-.27),.96);planes[11]=((-.20,1,-.96),1.10)
  if variant>=3:planes[5]=((.24,-1,-.11),.94)
  planes=[(Vector(n),d) for n,d in planes];vertices=[]
  for picked in itertools.combinations(planes,3):
   m=Matrix([n for n,d in picked])
   if abs(m.determinant())<1e-7:continue
   p=m.inverted()@Vector([d for n,d in picked])
   if any(n.dot(p)>d+1e-5 for n,d in planes):continue
   if not any((p-v).length<1e-5 for v in vertices):vertices.append(p)
  faces=[];ids=[]
  for pi,(normal,d) in enumerate(planes):
   vs=[i for i,p in enumerate(vertices) if abs(normal.dot(p)-d)<1e-4]
   if len(vs)<3:continue
   centre=sum((vertices[i] for i in vs),Vector())/len(vs)
   n=normal.normalized();u=n.cross(UP)
   if u.length<.01:u=n.cross(Vector((1,0,0)))
   u.normalize();v=n.cross(u)
   vs.sort(key=lambda i:math.atan2((vertices[i]-centre).dot(v),(vertices[i]-centre).dot(u)))
   faces.append(tuple(vs));ids.append(pi)
  centre=Vector(point)
  points=[centre+radial*(p.x*extent[0]+p.y*extent[1]*lean[0])+UP*p.y*extent[1]+side*(p.z*extent[2]+p.y*extent[1]*lean[1]) for p in vertices]
  o=c['mesh'](name,points,faces,c['obsidian'])
  for material in [c['fracture'],c['cavity'],c['rind'],c['fresh']]:o.data.materials.append(material)
  for face,pi in zip(o.data.polygons,ids):
   face.material_index=4 if pi in (0,7,10,12) else 1 if pi==4 and variant%2 else 3 if pi in (2,3,5,9,14,15) else 0
  objects.append(o)
  return o
 # One continuous Mantle bearing reaches the core; unequal shoulders expose
 # inclined end faces, a deep saddle and a lower broken ledge at the roll.
 crystal('Mantle / deep continuous bearing',(680,3200,100),(1,0,.15),(470,460,290),(.12,-.06),0)
 crystal('Mantle / forward stepped shoulder',(790,3600,-5),(1,0,.15),(275,255,180),(.17,.08),1)
 crystal('Mantle / high receding shoulder',(720,3750,200),(1,0,.15),(255,215,220),(-.16,.10),2)
 crystal('Mantle / inclined lower return',(545,3350,300),(1,0,.15),(280,145,195),(.10,-.08),3)
 # The Daybreak camera faces away from the core. This lower connecting body
 # carries an offset distal shoulder visible above the next banked bend.
 crystal('Daybreak / buried outward mineral root',(1110,2910,140),(1,0,.18),(700,665,350),(.08,-.05),2)
 crystal('Daybreak / distant source-attached shoulder',(1580,3720,100),(1,0,.18),(260,235,190),(-.18,.12),1)
 crystal('Daybreak / recessed connecting saddle',(1330,3500,240),(1,0,.18),(290,230,220),(.12,-.05),3)
 # Copper is a lower transverse cleavage, not a scaled copy of Mantle. Its
 # thick offset faces leave unequal open clefts instead of three thin needles.
 crystal('Copper / rooted transverse bearing',(340,2920,580),(.42,0,.91),(400,360,270),(.08,-.04),1)
 crystal('Copper / leaning inner facet',(265,3210,490),(.42,0,.91),(235,230,190),(-.19,.08),2)
 crystal('Copper / broad outer broken shoulder',(485,3150,750),(.42,0,.91),(240,260,180),(.16,-.12),0)
 # The Breakout mass is lower and farther ahead than the immediate side face.
 # Both returns reach a shared root; the far crest remains offset from the road.
 crystal('Breakout / continuous lower bearing',(1030,1290,-230),(1,0,-.22),(560,360,340),(.08,.06),0)
 crystal('Breakout / close inner return',(925,1630,-370),(1,0,-.22),(370,305,200),(-.13,.08),2)
 crystal('Breakout / offset forward shoulder',(1325,1590,-15),(1,0,-.22),(265,295,185),(.16,-.08),1)
 # Two substantial interlocking root buttresses replace the repeated sawtooth
 # trio. Their broad oblique crowns have 150–300 m real depth, not razor tips.
 crystal('Finish / broad near rooted buttress',(160,415,1180),(0,0,1),(290,235,235),(.12,-.09),1)
 crystal('Finish / unequal middle root shoulder',(140,540,1460),(0,0,1),(310,260,185),(-.15,.11),2)
 crystal('Finish / low receiving mineral return',(50,360,1750),(0,0,1),(260,185,250),(.08,-.10),3)
 return objects

def cut_exterior_reveals(c,objects):
 # The four driving-view shoulders share the mineral's longitudinal grain,
 # but have individually authored open joints and unequal broken crowns.
 # These differences replace the previous closed polygonal recesses; no mass
 # is added and the original deep bearing/footprint remains unchanged.
 def tree(ob):
  ob.data.calc_loop_triangles()
  vs=[Vector((v.co.x,v.co.z,-v.co.y)) for v in ob.data.vertices]
  return BVHTree.FromPolygons(vs,[tuple(t.vertices) for t in ob.data.loop_triangles],all_triangles=True),vs
 def subtract(target,name,rows,kind):
  cutter=c['longitudinal']('CUT / '+name,rows,c['obsidian'])
  for material in [c['fracture'],c['cavity'],c['rind'],c['fresh']]:cutter.data.materials.append(material)
  n=len(rows[0])
  for face in cutter.data.polygons:
   side=(face.index-2)%n
   # The ledge is weathered; protected joint backs stay quiet. Fresh material
   # is assigned to coherent cleavage returns, never random triangles.
   face.material_index=3 if face.index==0 or kind=='crown' else 2 if side in (2,3) else 4
  c['apply_cut'](target,cutter,'True '+name)
  c['bpy'].data.objects.remove(cutter,do_unlink=True)
 recipes=[
  # Name, actual chase origin/ray, lower tip offset, upper cleft widths,
  # longitudinal lean, branch direction/level and lower-crown side/drop.
  ('Copper / broad outer broken shoulder',(692.7394,3581.4483,354.8354),(470,3357,614),
   190,(7,26,53,76),(-28,-12,18,52),-1,-32,-1,112),
  ('Mantle / forward stepped shoulder',(1261.6665,4095.353,-242.108),(898,3650,-84),
   215,(9,35,47,66),(24,4,-27,-45),1,-65,1,155),
  ('Daybreak / distant source-attached shoulder',(1215.4221,4203.2522,-365.0578),(1483,3920,80),
   245,(6,22,39,62),(-38,-17,14,39),-1,-98,1,90),
  ('Breakout / offset forward shoulder',(721.933,1951.3704,-225.3617),(1350,1740,-30),
   180,(8,30,61,82),(30,12,-20,-48),1,-23,-1,132),
 ]
 for name,origin,probe,tip,widths,leans,branch_side,branch_level,crown_side,crown_drop in recipes:
  target=next(o for o in objects if o.name==name and len(o.data.vertices))
  bvh,vertices=tree(target);origin=Vector(origin)
  direction=(Vector(probe)-origin).normalized();hit=bvh.ray_cast(origin,direction,5000)
  assert hit[0] is not None,'Authored fracture ray missed '+name
  point=hit[0];normal=Vector((origin.x-point.x,0,origin.z-point.z)).normalized()
  across=UP.cross(normal).normalized()
  local=[Vector(((v-point).dot(across),v.y-point.y,(v-point).dot(normal))) for v in vertices]
  xmin,xmax=min(v.x for v in local),max(v.x for v in local)
  ymin,ymax=min(v.y for v in local),max(v.y for v in local)
  nmin,nmax=min(v.z for v in local),max(v.z for v in local)
  front=nmax+90
  def xyz(x,y,n):return point+across*x+UP*y+normal*n
  def face_at(x,y,fallback=0):
   cast=bvh.ray_cast(xyz(x,y,front),-normal,front-nmin+100)
   return (cast[0]-point).dot(normal) if cast[0] is not None else fallback
  # The lower end is a narrow blind joint. Its upper portion breaches the
  # entire crown, dividing it into unequal thick branches joined below.
  lower=max(ymin+100,-tip)
  levels=[lower,lower+(ymax-lower)*.32,min(lower+(ymax-lower)*.62,ymax-crown_drop*.9-15),ymax-crown_drop*.72,ymax+85]
  widths=(*widths,widths[-1]+9);leans=(*leans,leans[-1]+7)
  rows=[];last_face=0
  for i,(y,width,x) in enumerate(zip(levels,widths,leans)):
   surf=face_at(x,min(y,ymax-25),last_face);last_face=surf
   back=surf-[12,105,155,155][i] if i<3 else nmin-70
   rows.append([xyz(x+xx*width,y,nn) for xx,nn in [(-1,front),(1,front),(.72,back),(0,back-22),(-.84,back)]])
  subtract(target,name+' open longitudinal joint',rows,'cleft')
  # A different oblique cross-break opens out of that joint to a side edge.
  # This is a real deep ledge under a thick return, not an isolated inset.
  side_end=xmax+80 if branch_side>0 else xmin-80
  start_x=leans[1];branch_y=max(lower+65,min(ymax-85,branch_level))
  xs=[start_x,start_x+(side_end-start_x)*.44,side_end]
  ys=[branch_y,branch_y+(-36 if branch_side>0 else 25),branch_y+(-77 if branch_side>0 else 58)]
  rows=[]
  for i,(x,y) in enumerate(zip(xs,ys)):
   half=[29,38,48][i];surf=face_at(x,y,0);back=surf-[125,115,65][i]
   rows.append([xyz(x,y+yy*half,nn) for yy,nn in [(-1,front),(1,front),(.66,back),(-.35,back-19),(-.9,back)]])
  subtract(target,name+' branching open ledge',rows,'ledge')
  # Remove one upper corner through its full depth. An inclined termination
  # lowers one branch, avoiding the same continuous bevelled cap in each view.
  side_end=xmax+90 if crown_side>0 else xmin-90
  start_x=leans[2]+crown_side*widths[2]*.35
  rows=[]
  for x,floor in [(start_x,ymax+30),(start_x+(side_end-start_x)*.48,ymax-crown_drop*.68),(side_end,ymax-crown_drop)]:
   rows.append([xyz(x,floor,nmin-90),xyz(x,floor,front),xyz(x,ymax+180,front),xyz(x,ymax+180,nmin-90)])
  subtract(target,name+' unequal crown termination',rows,'crown')
  print('OPEN FRACTURE SECTION',name,'point',list(point),'tipY',point.y+lower,'topY',point.y+ymax,
    'crownDrop',crown_drop,'retained lower bearing',lower-ymin,flush=True)
 # Small receiving-face recesses sit within the continuous lower root ranges;
 # their open reveals remain separate from the large exterior joint sections.
 groups=[
  ('Finish',Vector((870.669,1230.13,861.598)),[
   ((184,565,1514),115,210,90),((160,470,1210),100,165,75)]),
 ]
 for label,origin,probes in groups:
  selected=[o for o in objects if o.name.startswith((label+' /','Mantle /' if label=='Copper' else label+' /')) and len(o.data.vertices)]
  for ordinal,(point,width,high,depth) in enumerate(probes):
   direction=(Vector(point)-origin).normalized();best=None
   for ob in selected:
    ob.data.calc_loop_triangles()
    vs=[Vector((v.co.x,v.co.z,-v.co.y)) for v in ob.data.vertices]
    bvh=BVHTree.FromPolygons(vs,[tuple(t.vertices) for t in ob.data.loop_triangles],all_triangles=True)
    hit=bvh.ray_cast(origin,direction,4500)
    if hit[0] is not None and (best is None or hit[3]<best[1][3]):best=(ob,hit)
   if best is None:continue
   target,hit=best;point,normal=hit[:2]
   if normal.dot(-direction)<0:normal=-normal
   up=UP-normal*UP.dot(normal)
   if up.length<.25:up=Vector((.3,0,1))-normal*normal.dot(Vector((.3,0,1)))
   up.normalize();across=up.cross(normal).normalized()
   outline=[(-.62,-.43),(-.08,-.59),(.50,-.29),(.60,.20),(.12,.56),(-.43,.39)]
   rows=[[point+across*(x*width+shift)+up*(y*high)+normal*z for x,y in outline] for z,scale,shift in [(50,1,0),(-depth,.72,18)]]
   # Back outline narrows into the body, leaving real inclined reveal planes.
   rows[1]=[point+across*(x*width*.72+18)+up*(y*high*.82)+normal*(-depth) for x,y in outline]
   cutter=c['longitudinal']('CUT / '+label+' exposed fracture '+str(ordinal),rows,c['obsidian'])
   for material in [c['fracture'],c['cavity'],c['rind'],c['fresh']]:cutter.data.materials.append(material)
   for f in cutter.data.polygons:f.material_index=4 if f.index in (1,3,5) else 2
   c['apply_cut'](target,cutter,'True '+label+' exposed fracture '+str(ordinal))
   c['bpy'].data.objects.remove(cutter,do_unlink=True)
   print('EXTERIOR RECESS',label,ordinal,target.name,list(point),flush=True)


def refine_split_columns(c,objects):
 """Continuous medium-scale fracture morphology on the existing closed solids.

 A persistent unequal column partition and staggered cross-joints displace the
 actual surface inward. The deep lower bearing is unchanged. This is neither
 added shell geometry nor per-triangle noise; shared vertices stay shared.
 Mandatory route/ballistic cuts are reapplied by the caller after refinement.
 """
 targets={
  'Copper / broad outer broken shoulder':(21,1),
  'Copper / leaning inner facet':(29,.72),
  'Mantle / forward stepped shoulder':(22,1),
  'Mantle / high receding shoulder':(29,.80),
  'Mantle / deep continuous bearing':(46,.65),
  'Daybreak / distant source-attached shoulder':(21,1),
  'Daybreak / recessed connecting saddle':(29,.72),
  'Breakout / offset forward shoulder':(21,1),
  'Breakout / close inner return':(29,.78),
 }
 def smooth(q):q=max(0,min(1,q));return q*q*(3-2*q)
 def linear(q,keys):
  if q<=keys[0][0]:return keys[0][1]
  for (a,x),(b,y) in zip(keys,keys[1:]):
   if q<=b:return x+(y-x)*(q-a)/(b-a)
  return keys[-1][1]
 changed=[]
 for ordinal,(name,(spacing,strength)) in enumerate(targets.items()):
  ob=next(o for o in objects if o.name==name)
  points=[Vector((v.co.x,v.co.z,-v.co.y)) for v in ob.data.vertices]
  low=Vector(tuple(min(p[a] for p in points) for a in range(3)))
  high=Vector(tuple(max(p[a] for p in points) for a in range(3)))
  centre=(low+high)*.5;span=high.y-low.y
  radius=((high.x-low.x)+(high.z-low.z))*.25
  count=max(12,round(math.tau*radius/64))
  weights=[.76+.46*((i*7+ordinal*3)%11)/10 for i in range(count)]
  edges=[0]
  for weight in weights:edges.append(edges[-1]+weight)
  edges=[value/edges[-1]*math.tau for value in edges]
  def field(p):
   u=(p.y-low.y)/max(1,span)
   # A slight common lean changes at two actual fracture joints. Adjacent
   # columns share the same transform, keeping the solid connected.
   angle=(math.atan2(p.z-centre.z,p.x-centre.x)+.055*u+.025*linear(u,[(0,0),(.38,1),(.44,-.25),(.76,.55),(1,0)])+ordinal*.19)%math.tau
   i=min(count-1,bisect.bisect_right(edges,angle)-1)
   q=(angle-edges[i])/(edges[i+1]-edges[i])
   seam=linear(q,[(0,1),(.14,.82),(.29,.11),(.61,0),(.80,.17),(1,1)])
   depth=(26+17*((i*3+ordinal)%7)/6)*seam
   # Long columns break at unequal heights. The rapid, oblique outward
   # return above each recessed joint leaves an attached overlapping lip.
   for j,base in enumerate([.31,.55,.79]):
    at=base+(((i*5+j*3+ordinal)%9)-4)*.013
    wave=linear(u,[(at-.14,0),(at-.035,1),(at,1),(at+.045,0)])
    depth+=(13+11*((i+j*2)%5)/4)*wave*(.70+.30*(1-seam))
   blend=smooth((u-.16)/.19)
   inset=depth*strength*blend
   crown=(12+48*seam+12*((i+ordinal)%5)/4)*strength*smooth((u-.72)/.28)
   return inset,crown,seam,u
  bm=bmesh.new();bm.from_mesh(ob.data)
  bmesh.ops.dissolve_limit(bm,angle_limit=.0001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})
  bmesh.ops.triangulate(bm,faces=list(bm.faces))
  bmesh.ops.beautify_fill(bm,faces=list(bm.faces),edges=list(bm.edges))
  for iteration in range(9):
   edges_to_split=[e for e in bm.edges if e.calc_length()>spacing and max(v.co.z for v in e.verts)>low.y+span*.14]
   if not edges_to_split:break
   bmesh.ops.subdivide_edges(bm,edges=edges_to_split,cuts=1,use_grid_fill=True)
   bmesh.ops.triangulate(bm,faces=[f for f in bm.faces if len(f.verts)>3])
   bmesh.ops.beautify_fill(bm,faces=list(bm.faces),edges=list(bm.edges))
  assert len(bm.faces)<45000,'Fracture refinement exceeded bounded budget: '+name
  for v in bm.verts:
   p=Vector((v.co.x,v.co.z,-v.co.y));inset,crown,_,_=field(p)
   radial=Vector((p.x-centre.x,0,p.z-centre.z));r=radial.length
   if r>1:p-=radial/r*min(inset,r*.20)
   p.y-=crown;v.co=(p.x,-p.z,p.y)
  bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free();ob.data.update()
  for face in ob.data.polygons:
   p=Vector((face.center.x,face.center.z,-face.center.y));inset,_,seam,u=field(p)
   if u<.18:continue
   # Semantic regions follow the actual ledge/reveal geometry. The runtime
   # shared mineral substrate blends across these coherent construction zones.
   face.material_index=3 if face.normal.z>.40 else 2 if seam>.88 else 4 if .30<seam<.78 else 0
  consolidate_column_faces(ob)
  changed.append(ob)
  print('SPLIT COLUMN MORPHOLOGY',name,'columns',count,'surfaceFaces',len(ob.data.polygons),'spacing',spacing,flush=True)
 return changed


def consolidate_column_faces(ob):
 """Flatten connected interior patches while preserving silhouette and joint lips.

 No vertices are added and the existing closed body remains connected. Major
 folds, bearing vertices and the representative chase silhouette stay fixed.
 The mandatory road and filled-flight cuts follow this bounded refinement.
 """
 bm=bmesh.new();bm.from_mesh(ob.data);bm.verts.ensure_lookup_table();bm.faces.ensure_lookup_table();bm.edges.ensure_lookup_table()
 original=[v.co.copy() for v in bm.verts]
 camera_positions={'Copper': [692.7397049816875, 3581.4485542695284, 354.8352205507594], 'Mantle': [1261.6665085460882, 4095.352963145435, -242.10807860991153], 'Daybreak': [1208.3944622732106, 4207.407493348954, -369.0088748879388], 'Breakout': [721.9331284088718, 1951.3704145914235, -225.36170445944833]}
 # These authored normal-chase sightlines lock the major visible contours.
 p=camera_positions[ob.name.split(" / ")[0]];camera=Vector((p[0],-p[2],p[1]))
 normals=[f.normal.copy() for f in bm.faces];centers=[f.calc_center_median() for f in bm.faces];areas=[f.calc_area() for f in bm.faces]
 locked=set();silhouette=set();protected_edges=set()
 for e in bm.edges:
  fs=list(e.link_faces)
  edge_lock=len(fs)!=2
  if len(fs)==2:
   a,b=fs;na,nb=normals[a.index],normals[b.index]
   fronta=na.dot(camera-centers[a.index]);frontb=nb.dot(camera-centers[b.index])
   # Lock the actual broken silhouette and the sharp lips at major fractures.
   if fronta*frontb<=0:
    edge_lock=True;silhouette.update(v.index for v in e.verts)
   if na.dot(nb)<math.cos(math.radians(58)):edge_lock=True
  if edge_lock:
   locked.update(v.index for v in e.verts);protected_edges.add(e.index)
 low=min(v.co.z for v in bm.verts);high=max(v.co.z for v in bm.verts)
 locked.update(v.index for v in bm.verts if v.co.z<low+(high-low)*.18)
 neighbors=[set() for f in bm.faces]
 for e in bm.edges:
  fs=list(e.link_faces)
  if len(fs)==2 and e.index not in protected_edges:
   a,b=fs;neighbors[a.index].add(b.index);neighbors[b.index].add(a.index)
 assigned=[-1]*len(bm.faces);groups=[]
 # Connected proxies consolidate only the small interior facets, never the
 # silhouette or a major fold. Tall slender domains preserve vertical grain.
 for seed in sorted(range(len(bm.faces)),key=lambda i:areas[i],reverse=True):
  if assigned[seed]>=0:continue
  gid=len(groups);assigned[seed]=gid;group=[seed];pending=list(neighbors[seed]);origin=centers[seed];normal=normals[seed]
  normal_sum=normal*areas[seed];center_sum=origin*areas[seed];weight=areas[seed]
  while pending:
   i=pending.pop()
   if assigned[i]>=0:continue
   p=centers[i];offset=p-origin;n=normal_sum.normalized();point=center_sum/max(1e-9,weight)
   if abs(offset.x)>85 or abs(offset.y)>85 or abs(offset.z)>155:continue
   if normals[i].dot(normal)<.78 or normals[i].dot(n)<.85:continue
   if abs((p-point).dot(n))>7.5:continue
   # A ledge stays a ledge; its cap is not averaged into the vertical face.
   if (normals[i].z>.48)!=(normal.z>.48):continue
   assigned[i]=gid;group.append(i);normal_sum+=normals[i]*areas[i];center_sum+=p*areas[i];weight+=areas[i];pending.extend(neighbors[i])
  groups.append(group)
 planes=[]
 for g in groups:
  weight=sum(areas[i] for i in g);n=sum((normals[i]*areas[i] for i in g),Vector()).normalized();p=sum((centers[i]*areas[i] for i in g),Vector())/max(1e-9,weight)
  planes.append((n,p,len(g)>=6))
 moved=[]
 for v in bm.verts:
  if v.index in locked:continue
  ids=set(assigned[f.index] for f in v.link_faces)
  if not ids or len(ids)>3 or any(not planes[i][2] for i in ids):continue
  aa=np.array([tuple(planes[i][0]) for i in ids]);bb=np.array([(planes[i][1]-v.co).dot(planes[i][0]) for i in ids])
  delta=np.linalg.lstsq(aa,bb,rcond=.06)[0];length=float(np.linalg.norm(delta))
  if length>7.5:delta*=7.5/length
  v.co+=Vector(delta);moved.append(v.index)
 # Reject any local orientation inversion instead of changing the contour.
 for iteration in range(3):
  bm.normal_update();bad=[f for f in bm.faces if f.normal.dot(normals[f.index])<.2 or f.calc_area()<1e-5]
  if not bad:break
  for f in bad:
   for v in f.verts:v.co=original[v.index]
 bm.normal_update()
 silhouette_delta=max((bm.verts[i].co-original[i]).length for i in silhouette)
 maxmove=max((v.co-original[v.index]).length for v in bm.verts)
 # Near-coplanar interior edges dissolve only after geometric flattening;
 # hard folds / contour vertices remain exactly at their authored coordinates.
 before=len(bm.faces)
 eligible=[e for e in bm.edges if len(e.link_faces)==2 and all(v.index not in locked for v in e.verts) and assigned[e.link_faces[0].index]==assigned[e.link_faces[1].index]]
 bmesh.ops.dissolve_limit(bm,angle_limit=.0005,verts=[],edges=eligible,use_dissolve_boundaries=False)
 bmesh.ops.triangulate(bm,faces=list(bm.faces))
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free();ob.data.update()
 report={'source':'Connected split-column morphology','objects':[ob.name],'originalFaces':before,'finalFaces':len(ob.data.polygons),'regions':len(groups),'largeRegions':sum(len(g)>=6 for g in groups),'movedVertices':len(moved),'lockedVertices':len(locked),'silhouetteVertices':len(silhouette),'silhouetteMaxDelta':silhouette_delta,'maxVertexDelta':maxmove}
 print('COLUMN FACE CONSOLIDATION',json.dumps(report),flush=True)
 return report


def continue_core_cleavage(c,objects):
 """Carry the same quiet, long joints into the adjoining Copper core return.

 Only a bounded visible patch is cut. Main-body silhouette, chamber crowns and
 the already carved driving/flight voids are preserved; no shell is added.
 """
 ob=next(o for o in objects if o.name=='Cloudfall / seven connected crystalline slabs')
 ob.data.calc_loop_triangles();vs=[Vector((v.co.x,v.co.z,-v.co.y)) for v in ob.data.vertices]
 surface=BVHTree.FromPolygons(vs,[tuple(t.vertices) for t in ob.data.loop_triangles],all_triangles=True)
 point=Vector((443.9119,3444.0674,338.3542));normal=Vector((.556,0,.831)).normalized();across=UP.cross(normal).normalized()
 def xyz(x,y,z):return point+across*(x+.075*y)+UP*y+normal*z
 for index,(x,lower,upper,width,depth) in enumerate([(-67,-205,165,11,31),(45,-280,95,16,43),(151,-155,210,9,27)]):
  rows=[]
  for j,(y,scale) in enumerate([(lower,.12),(lower+65,1),(upper-60,.85),(upper,.15)]):
   hit=surface.ray_cast(xyz(x,y,450),-normal,900)
   if hit[0] is None:break
   z=(hit[0]-point).dot(normal)
   # Ignore a narrow fin with no deep backing. The cleavage belongs to the
   # connected core wall, not a newly severed fragment at the corridor edge.
   inner=surface.ray_cast(hit[0]-normal*.2,-normal,depth+32)
   if inner[0] is not None:break
   w=width*scale;back=z-depth*scale
   rows.append([xyz(x+xx*w,y,zz) for xx,zz in [(-1,450),(1,450),(.35,back),(-.6,back+7)]])
  if len(rows)!=4:continue
  cutter=c['longitudinal']('CUT / core continuation '+str(index),rows,c['obsidian'])
  for material in [c['fracture'],c['cavity'],c['rind'],c['fresh']]:cutter.data.materials.append(material)
  for f in cutter.data.polygons:f.material_index=2 if (f.index-2)%4==2 else 4
  c['apply_cut'](ob,cutter,'True adjoining core longitudinal cleavage '+str(index));c['bpy'].data.objects.remove(cutter,do_unlink=True)
  print('CORE GRAIN CONTINUATION',index,'boundsY',point.y+lower,point.y+upper,flush=True)
 return [ob]
