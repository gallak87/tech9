"""Connected Cloudfall mineral mass, authored against the production route.

World coordinates are Y up. This helper only constructs editable Blender geometry;
all rendering, light pooling and Awakening behavior belong to the level runtime.
"""
import math, bmesh, time
from mathutils import Vector
from mathutils.bvhtree import BVHTree

TAU=math.tau
UP=Vector((0,1,0))
def clamp(x,a=0,b=1):return max(a,min(b,x))
def angle_delta(a,b):return (a-b+math.pi)%TAU-math.pi
def smooth(x):x=clamp(x);return x*x*(3-2*x)

def build_cloudfall(c):
 bpy=c['bpy'];mesh=c['mesh'];route=c['route'];height=c['HEIGHT'];xyz=c['xyz']
 obsidian=c['obsidian'];fracture=c['fracture'];cavity=c['cavity'];structural=c['structural'];calm=c['calm'];bronze=c['bronze'];ivory=c['ivory'];glow=c['glow'];warm=c['warm_glow']
 rng=c['rng'];fresh=c['fresh'];rind=c['rind']; macro=[]; fittings=[]; fixtures=[]; anchors=[]
 samples=route['samples']; interiors=route['interiors']
 near=lambda distance:min(samples,key=lambda s:abs(s['s']-distance))
 def frame(s):
  p=Vector(s['p']);t=Vector(s['t']).normalized();r=UP.cross(t).normalized();u=t.cross(r).normalized()
  return p,t,r,u
 def apply_cut(target,cutter,label):
  # Disjoint volumes cannot intersect. Keep every relevant safety subtraction,
  # but do not run an Exact Boolean against a distant flight chamber.
  av=[v.co for v in target.data.vertices];bv=[v.co for v in cutter.data.vertices]
  if not av or not bv:return
  if any(max(v[a] for v in av)+.1<min(v[a] for v in bv) or max(v[a] for v in bv)+.1<min(v[a] for v in av) for a in range(3)):return
  bpy.context.view_layer.objects.active=target
  for o in [target,cutter]:
   bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
  started=time.monotonic()
  print('CUT START',target.name,label,flush=True)
  mod=target.modifiers.new(label,'BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT'
  # Road/through-passage sweeps can overlap themselves. Flight cutters use a
  # monotonic longitudinal coordinate and are closed non-self-intersecting
  # volumes; self patch reconstruction on their already cut host creates a
  # pathological coplanar expansion. The Exact difference remains unchanged.
  mod.use_self=not (label.startswith('True ') or label.startswith('Full reserved '));mod.object=cutter
  if hasattr(mod,'material_mode'):mod.material_mode='INDEX'
  bpy.ops.object.modifier_apply(modifier=mod.name)
  target.data.validate(verbose=False,clean_customdata=False)
  print('CUT RESULT',target.name,label,len(target.data.polygons),'seconds',round(time.monotonic()-started,2),flush=True)
 def cutter_mesh(name,vs,faces):
  o=mesh(name,vs,faces,obsidian)
  o.data.materials.append(fracture);o.data.materials.append(cavity)
  for f in o.data.polygons:f.material_index=2
  return o
 def longitudinal(name,rows,material):
  n=len(rows[0]);vs=[tuple(p) for row in rows for p in row]
  fs=[tuple(reversed(range(n))),tuple((len(rows)-1)*n+k for k in range(n))]
  for j in range(len(rows)-1):
   for k in range(n):fs.append((j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k))
  return mesh(name,vs,fs,material)
 # Seven connected primary slabs carry the vertical mineral grain. Each has
 # unequal inclined shoulders and longitudinal satellite ridges. Sectional
 # offsets persist for hundreds of metres, then break across a short bevel;
 # this is actual depth, not a high-frequency noisy displacement blanket.
 ridge_angles=[-.25,.62,1.43,2.23,3.13,4.12,5.22]
 ridge_widths=[.29,.38,.26,.41,.31,.35,.27]
 ridge_strength=[.64,.91,.77,.52,.86,.69,.95]
 def lerp_keys(x,keys):
  if x<=keys[0][0]:return keys[0][1]
  for (a,va),(b,vb) in zip(keys,keys[1:]):
   if x<=b:return va+(vb-va)*(x-a)/(b-a)
  return keys[-1][1]
 def faceted_peak(x,left=1,right=1):
  # Asymmetry gives a broad sloping face and a narrower freshly broken edge.
  q=abs(x)/(left if x<0 else right)
  return lerp_keys(q,[(0,1),(.23,.93),(.41,.73),(.82,.21),(1.12,0)])
 N=192;H=150;vs=[];core_mats=[]
 for j in range(H+1):
  u=j/H;y=-430+(height+430)*u
  for k in range(N):
   a=k*TAU/N;base=108+1030*max(0,1-u)**1.12
   fields=[];side_tags=[]
   for ri,(ra,rw,rs) in enumerate(zip(ridge_angles,ridge_widths,ridge_strength)):
    twist=.055*u+.035*math.sin(u*4.6+ri*.71)
    delta=angle_delta(a,ra+twist);x=delta/rw
    ridge=faceted_peak(x,.78+.05*(ri%3),1.08-.07*(ri%2))
    # Three long fracture breaks per primary slab, staggered around the spine.
    phase=(ri*.073)% .22
    step=lerp_keys(u,[(0,.22),(.14+phase,.48),(.16+phase,-.30),
        (.41+phase,.15),(.43+phase,-.57),(.66+phase,.24),
        (.685+phase,-.35),(1,0)])
    amplitude=base*.89*rs+(80+105*(1-u))*step
    satellites=0
    for si,offset in enumerate([-.72,-.39,.43,.73]):
     # Satellite widths resolve to roughly 30–70 m on the substantial middle
     # and lower faces; their shallow roots remain part of this same solid.
     width=max(.025,min(.074,38/max(160,base)))
     line=faceted_peak((delta-rw*offset-.018*math.sin(u*7+si+ri))/width,.9,1.1)
     satellite_height=(37+17*((ri+si)%3))*(.45+.55*max(0,1-u))
     band=lerp_keys(u,[(0,.75),(.24+si*.06,1),(.265+si*.06,.48),(.65,1),(1,.2)])
     satellites+=line*satellite_height*band
    fields.append(ridge*amplitude+satellites)
    side_tags.append(x)
   dominant=max(range(7),key=lambda i:fields[i]);ridge=max(fields)
   radius=base*.54+ridge
   # The connected substrate itself leans between major sections instead of
   # keeping a perfect cone behind the attached forward shoulders.
   radius+=20*math.sin(y*.00125+a*2)+12*math.sin(y*.0031-a*3)
   peak=faceted_peak(side_tags[dominant],.9,1.05)
   yy=y+u**7*(-590+1030*peak+90*math.sin(a*11))
   vs.append((max(40,radius)*math.cos(a),yy,max(40,radius)*math.sin(a)))
   face=side_tags[dominant]
   core_mats.append(4 if -.49<face<-.28 else 1 if .36<face<.55 else 3 if abs(face)<.21 else 0)
 fs=[tuple(reversed(range(N))),tuple(H*N+k for k in range(N))]
 for j in range(H):
  for k in range(N):fs.append((j*N+k,j*N+(k+1)%N,(j+1)*N+(k+1)%N,(j+1)*N+k))
 body=mesh('Cloudfall / seven connected crystalline slabs',vs,fs,obsidian)
 for material in [fracture,cavity,rind,fresh]:body.data.materials.append(material)
 for f in body.data.polygons:
  if f.index>=2:f.material_index=core_mats[(f.index-2)//N*N+(f.index-2)%N]
 macro.append(body)
 # A closed supporting apron carries the three unequal inclined root ranges.
 # Its visible landing-side edge has deep connected clefts and staggered break
 # faces; the finish is not perched on a smooth circular dome.
 RN=144;RH=48;rv=[]
 def root_extent(a):return 1170+1250*math.exp(-.5*(angle_delta(a,1.44)/.62)**2)+340*math.exp(-.5*(angle_delta(a,3.1)/.38)**2)
 for j in range(RH+1):
  q=.018+.982*j/RH
  for k in range(RN):
   a=k*TAU/RN;r=root_extent(a)*q
   ridge=.5+.5*math.cos(a*3-.42)
   quiet=1400*(1-q)**.72-240+190*math.sin(q*math.pi)*ridge
   quiet+=45*math.sin(a*7+q*5)*math.sin(q*math.pi)**2
   # The shelf breaks incline differently on each side; no horizontal table
   # top or radial triangle fan is added after the common clearance cuts.
   offset=.035*math.sin(a*3.2)+.018*math.sin(a*7.3)
   section=lerp_keys(clamp(q+offset),[(0,1180),(.26,875),(.42,695),
      (.62,365),(.78,155),(1,-320)])
   # The exposed root bed inclines continuously rather than becoming a set of
   # concentric table tops. Unequal oblique faults connect it to the vertical
   # grain, with broad, thick shoulders between the recessed clefts.
   section+=115*faceted_peak(angle_delta(a,1.29+.12*q)/.19,.8,1.2)*math.sin(q*math.pi)
   section-=95*faceted_peak(angle_delta(a,1.61-.10*q)/.105,1.15,.75)*smooth((q-.23)/.22)
   blend=math.exp(-.5*(angle_delta(a,1.40)/.58)**6)*smooth(q/.26)
   top=quiet*(1-blend)+section*blend
   for ac,width,depth in [(1.03,.072,200),(1.73,.09,265)]:
    cleft=faceted_peak(angle_delta(a,ac+.055*q)/width,.75,1.2)
    top-=depth*cleft*smooth((q-.30)/.19)*(1-.32*q)
   rv.append((r*math.cos(a),top,r*math.sin(a)))
 rf=[]
 for j in range(RH):
  for k in range(RN):rf.append((j*RN+k,j*RN+(k+1)%RN,(j+1)*RN+(k+1)%RN,(j+1)*RN+k))
 rv.extend([(root_extent(k*TAU/RN)*math.cos(k*TAU/RN),-610,root_extent(k*TAU/RN)*math.sin(k*TAU/RN)) for k in range(RN)])
 bottom=(RH+1)*RN
 for k in range(RN):rf.append((RH*RN+k,RH*RN+(k+1)%RN,bottom+(k+1)%RN,bottom+k))
 rf.extend([tuple(reversed([bottom+k for k in range(RN)])),tuple(reversed(range(RN)))])
 roots=mesh('Cloudfall / three interlocking fractured roots',rv,rf,structural)
 for material in [fracture,cavity,rind,fresh]:roots.data.materials.append(material)
 for f in roots.data.polygons:
  if f.normal.z>.55:f.material_index=3
  elif f.normal.z>.10:f.material_index=4
 macro.append(roots)
 # Forward shoulders are tapered 3D sections, not two parallel caps extruded
 # across a polygon. Multiple substantial bevels expose real side-plane colour.
 def fracture_plate(name,seat,radial,tangent,length,offset,thickness,height_scale,variant=0,finish=False):
  if finish:
   # Long rooted low shoulder, then unequal inclined splinters around it. The
   # descending tip and narrow final section cannot form a flat tower roof.
   fractions=[-.14,0,.19,.38,.55,.69,.80,.93,1.04,1.12]
   tops=[-170,-100,50,130,185,370,260,90,-125,-440]
   bottoms=[-1020,-1020,-1000,-940,-900,-830,-790,-730,-665,-605]
   width_scales=[1.25,1.22,1.16,1.05,.94,.88,.77,.60,.34,.055]
  else:
   fractions=[-.22,0,.20,.37,.52,.66,.79,.91,1.02,1.11]
   tops=[240,370,455,300,370,145,230,120,-50,-220]
   bottoms=[-940,-940,-890,-800,-715,-650,-580,-490,-390,-310]
   width_scales=[1.28,1.2,1.14,.93,1.04,.79,.91,.72,.40,.065]
  rows=[]
  for j,(fraction,top,bottom,width_scale) in enumerate(zip(fractions,tops,bottoms,width_scales)):
   x=fraction*length
   # Each section leans and changes width. Long facets remain deliberate and
   # quiet, with 35–90 m bevel bands instead of razor-sharp rectangular corners.
   center=seat+radial*x+tangent*(offset+thickness*.18*math.sin(j*.62+variant*.83))
   top=(top+35*math.sin(j*.73+variant))*height_scale
   bottom=bottom*height_scale
   mid=bottom+(top-bottom)*.5
   w=thickness*width_scale
   outline=[(-.60,bottom+.08*(top-bottom)),(-.35,bottom),(.31,bottom+.04*(top-bottom)),
      (.56,bottom+.26*(top-bottom)),(.48,mid+.23*(top-bottom)),(.25,top-.10*(top-bottom)),
      (.015,top),(-.19,top-.085*(top-bottom)),(-.43,mid+.27*(top-bottom)),(-.61,mid-.12*(top-bottom))]
   rows.append([center+tangent*(xx*w)+UP*yy for xx,yy in outline])
  ob=longitudinal(name,rows,structural if finish else obsidian)
  for material in [fracture,cavity,rind,fresh]:ob.data.materials.append(material)
  for face in ob.data.polygons:
   if face.index<2:face.material_index=4
   else:
    side=(face.index-2)%10
    face.material_index=4 if side in (4,6,8) else 1 if side==5 else 3 if side in (2,3,7) else 0
  macro.append(ob)
  return ob
 rib_specs=[
  ('Crown / sunward fractured shoulder',(450,6387,-843),255,1.0,360),
  ('Buttress / outer folded bearing',(278,5149,553),245,.86,330),
  ('Mantle / split projecting wing',(1333,3668,302),430,1.0,440),
  ('Copper / three exposed mineral plates',(510,3253,686),310,.82,340),
  ('Breakout / low source-attached root',(1273,1743,-513),540,.75,390),
  ('Finish / raised connected destination',(137,523,2223),850,1.0,490),
 ]
 from cloudfall_crown import build_crown_shoulder
 macro.extend(build_crown_shoulder({**c,'apply_cut':apply_cut,'longitudinal':longitudinal}))
 for index,(name,point,root_radius,hscale,width) in enumerate(rib_specs):
  if index in (0,2,3,4,5):continue  # Dedicated connected volumes replace these generic shoulder families.
  target=Vector(point);radial=Vector((target.x,0,target.z)).normalized();tangent=UP.cross(radial).normalized()
  length=math.hypot(target.x,target.z)-root_radius;seat=radial*root_radius+UP*target.y
  finish=index==5
  fracture_plate(name+' / bevelled principal slab',seat,radial,tangent,length,0,width*.62,hscale*(.70 if finish else 1),index,finish)
  fracture_plate(name+' / inclined inner splinter',seat-UP*(70 if not finish else 110),radial,tangent,length*.79,-width*.38,width*.43,hscale*(1.08 if finish else .83),index+1,finish)
  fracture_plate(name+' / broken outer splinter',seat-UP*(170 if not finish else 35),radial,tangent,length*.94,width*.35,width*.40,hscale*(.89 if finish else .72),index+2,finish)
 from cloudfall_exteriors import build_exterior_shoulders, cut_exterior_reveals, refine_split_columns, continue_core_cleavage, cut_continuous_core_faults
 macro.extend(build_exterior_shoulders(c))
 from cloudfall_lower_roots import fold_lower_root_bodies
 fold_lower_root_bodies(c,macro)
 def passage_cutter(passage):
  vault=passage['id']=='vault';ps=[s for s in samples if passage['start']-330<=s['s']<=passage['end']+220][::3]
  rows=[];rx=195 if vault else 174;ry=360 if vault else 255;lift=120 if vault else 85
  for i,s in enumerate(ps):
   p,t,r,u=frame(s);center=p+UP*lift
   profile=[(-.78,-.9),(-1.08,-.55),(-.94,-.05),(-1.15,.25),
            (-.88,.55),(-.44,.99),(.02,1.11),(.48,.83),(.82,.61),
            (1.04,.14),(.96,-.35),(.70,-.88),(.08,-1.0)]
   rows.append([center+r*(rx*x*(1+.045*math.sin(i*.18+k*.71)))+UP*(ry*y) for k,(x,y) in enumerate(profile)])
  cut=longitudinal('CUT / '+passage['id']+' deep through-spire passage',rows,obsidian)
  cut.data.materials.append(fracture);cut.data.materials.append(cavity)
  for f in cut.data.polygons:f.material_index=2
  return cut
 # Carve the unchanged Vault in the initial core before the through-going
 # faults. Applying this self-overlapping sweep after their long coplanar
 # boundaries triggers pathological Exact self-intersection reconstruction.
 # These are the same subtractive volumes; all road/flight guards still follow.
 vault_cut=passage_cutter(next(p for p in interiors if p['id']=='vault'))
 apply_cut(body,vault_cut,'Open vault chamber')
 bpy.data.objects.remove(vault_cut,do_unlink=True)
 bm=bmesh.new();bm.from_mesh(body.data)
 print('CORE VAULT TOPOLOGY','boundary',sum(e.is_boundary for e in bm.edges),'nonManifold',sum(not e.is_manifold for e in bm.edges),flush=True)
 bm.free()
 cut_continuous_core_faults({**c,'longitudinal':longitudinal,'apply_cut':apply_cut},macro)
 # A continuous generous road tube is a safety carve only. The exterior body is
 # already set back; inside the two passages the authored chambers below dominate.
 rows=[]
 road_samples=samples[::2]
 if road_samples[-1]!=samples[-1]:road_samples.append(samples[-1])
  # The cutter cap must lie beyond the full supported braking runout.
 first=dict(road_samples[0]);last=dict(road_samples[-1])
 first['p']=list(Vector(first['p'])-Vector(first['t'])*220)
 last['p']=list(Vector(last['p'])+Vector(last['t'])*220)
 road_samples=[first]+road_samples+[last]
 for s in road_samples:
  p,t,r,u=frame(s);center=p+UP*30
  rows.append([center+r*(92*math.cos(k*TAU/12))+UP*(124*math.sin(k*TAU/12)) for k in range(12)])
 driving_rows=rows
 roadcut=longitudinal('CUT / all driving and camera volume',rows,obsidian)
 roadcut.data.materials.append(fracture);roadcut.data.materials.append(cavity)
 for f in roadcut.data.polygons:f.material_index=2
 for target in macro:apply_cut(target,roadcut,'Production driving clearance')
 bpy.data.objects.remove(roadcut,do_unlink=True)
 # Ordinary bends stay open to the sky. The broad attached ribs frame fractured
 # cuts beside the course; only the two core crossings are sustained tunnels.
 # Crown is a one-sided exterior shoulder; its dedicated cut never roofs the road.
 open_cuts=[
  ('Crown /',0,1150,True),('Buttress /',2240,interiors[0]['start']-180,False),
  ('Mantle /',interiors[0]['end']+180,7070,False),('Copper /',6720,interiors[1]['start']-180,False),
  ('Breakout /',interiors[1]['end']+180,12020,False),('Finish /',12670,route['length']+1,False),
 ]
 for prefix,start,end,crown in open_cuts:
  ps=[s for s in samples if start<=s['s']<=end][::2]
  if len(ps)<2:continue
  rows=[]
  for j,s in enumerate(ps):
   p,t,r,u=frame(s)
   if crown:
    # Keep mineral only on the inside flank above road height. The old closed
    # profile shaved thicker shoulders into a new arch spanning the bend.
    # This sky cut is restricted to Crown pieces, never the main core/chambers.
    profile=[(-720,-100),(-720,1600),(110,1600),(105,80),(135,-100)]
   else:
    # Unequal sloping fractures have real stepped depth; a tall open cut
    # removes the repeated circular ceiling without reducing the anchored base.
    profile=[(-180,-430),(-135,-110),(-125,100),(-205,205),
             (-180,325),(-275,465),(-235,700),(-315,980),(-300,1600),
             (325,1600),(300,940),(245,650),(285,420),(190,280),
             (170,120),(160,-150),(65,-300),(-35,-470)]
   # Authored fracture setbacks persist for 90–240 m and then change plane.
   # They break the visible clearance wall/floor itself; a smooth full-height
   # sweep otherwise flattens even carefully constructed solid shoulders.
   phase=(s['s']-start)/210
   broad=lerp_keys(phase%5,[(0,0),(.65,.05),(1.0,.18),(1.8,.12),
       (2.2,-.06),(3.0,-.02),(3.35,.14),(4.3,.04),(5,0)])
   spread=1+broad if not crown else 1+.08*math.sin(j*.19)
   rows.append([p+r*(x*spread)+UP*(height+1800-p.y if y==1600 else
       (y*.30 if prefix=='Finish /' and y<0 else y)-(45+35*math.sin(s['s']*.007))*(.35 if prefix=='Finish /' else 1 if y<0 and not crown else 0)) for x,y in profile])
  cut=longitudinal('CUT / '+prefix+' open fracture',rows,obsidian)
  for material in [fracture,cavity,rind,fresh]:cut.data.materials.append(material)
  for face in cut.data.polygons:
   side=(face.index-2)%len(profile)
   # Setbacks expose fresh inclined cleavage; deeply recessed vertical planes
   # stay quiet and the open floor/undersides retain weathered mineral.
   face.material_index=(4 if side in (2,4,6,10,12,14) else
       3 if side in (0,15,16,17) else 2) if not crown and face.index>=2 else 2
  for target in macro:
   if crown and not target.name.startswith(prefix):continue
   # A lower turn's sky opening must not slice through an unrelated higher
   # shoulder at the same X/Z. The main spine remains carved continuously;
   # attached bodies receive only their own/adjacent artistic cleft. Every
   # production driving and reserved flight cutter still applies globally.
   families={'Buttress /':('Buttress /',),'Mantle /':('Mantle /','Daybreak /'),
       'Copper /':('Copper /','Mantle /'),'Breakout /':('Breakout /',),'Finish /':('Finish /',)}
   if not crown and not target.name.startswith(('Cloudfall /',*families[prefix])):continue
   apply_cut(target,cut,'Open-sky ordinary fracture')
  bpy.data.objects.remove(cut,do_unlink=True)
 # Actual passages have much deeper ceilings than the minimum drive carve, with
 # unequal wall sections. Full-flight columns cut the true ballistic height next.
 for passage in interiors:
  cut=passage_cutter(passage)
  for target in macro:
   if target is body and passage['id']=='vault':continue
   apply_cut(target,cut,'Open '+passage['id']+' chamber')
  bpy.data.objects.remove(cut,do_unlink=True)
  print('CHAMBER',passage['id'],flush=True)
 from cloudfall_chambers import chamber_wall_relief
 reserved_rows={}
 for corridor in route['flightCorridors']:
  hero=corridor['id'] in ('heart-chasm','echo-chasm','root-gate')
  heart=corridor['id']=='heart-chasm';echo=corridor['id']=='echo-chasm'
  fw=Vector(corridor['forward']);right=UP.cross(fw).normalized()
  width=255 if echo else 225 if heart else corridor['lateralHalfWidth']+32
  below=350 if echo else 260 if heart else 32
  above=660 if echo else 330 if heart else 45
  cols=corridor['columns'];rows=[]
  for i,col in enumerate(cols):
   p=Vector(col['p']);along=(-corridor['longitudinalClearance']-30 if i==0 else corridor['longitudinalClearance']+30 if i==len(cols)-1 else 0)
   p+=fw*along
   lower=col['minY']-below;upper=col['maxY']+above
   w=width*(1+.07*math.sin(i*.16)+.035*math.sin(i*.49))
   h=upper-lower
   if heart or echo:
    # Three large receding reveals on each wall create 60–180 m fracture
    # faces and undercuts. The narrowest face stays far outside the full
    # flight/camera column, including the fast-hull upper trajectory.
    profile=[(-.66,0),(-1.00,.08),(-1.13,.24),(-.83,.42),(-1.08,.60),
             (-.88,.78),(-.63,.94),(-.15,1.0),(.49,.97),(.94,.83),
             (1.17,.64),(.94,.48),(1.11,.30),(.98,.10),(.71,0)]
    fold_row=[]
    start=Vector(cols[0]['p']);station=(p-start).dot(fw)
    nearby=[v['maxY'] for v in cols if abs((Vector(v['p'])-start).dot(fw)-station)<=65]
    reference=max(nearby)+65 if nearby else cols[0]['maxY']+65 if station<0 else cols[-1]['maxY']+65
    for x,y in profile:
     point=Vector((p.x,lower+h*y,p.z))+right*(w*x)
     side=-1 if x<0 else 1
     side_blend=max(0,min(1,(abs(x)-.52)/.25))
     point+=right*(side*chamber_wall_relief(corridor['id'],station,point.y-reference,side)*side_blend)
     fold_row.append(point)
    rows.append(fold_row)
   else:
    rows.append([Vector((p.x,y,p.z))+right*x for x,y in [(-w,lower+45),(-w*.73,lower),(w*.73,lower),(w,lower+45),(w,upper-65),(w*.7,upper),(-w*.7,upper),(-w,upper-65)]])
  cut=longitudinal('CUT / actual '+corridor['id']+' ballistic chamber',rows,obsidian);cut.data.materials.append(fracture);cut.data.materials.append(cavity)
  for f in cut.data.polygons:f.material_index=2
  for target in macro:apply_cut(target,cut,'True '+corridor['id']+' flight void')
  bpy.data.objects.remove(cut,do_unlink=True)
  # Independent rectangular safety loft contains the UNION of the reserved
  # column boxes. A sloping loft through only each column's own min/max can
  # pinch a neighboring box's longitudinal corners even when every grid probe
  # and actual flight is clear. Include every box active across each whole
  # 20 m loft interval, then add a real margin on all four section faces.
  origin=Vector((cols[0]['p'][0],0,cols[0]['p'][2]))
  projected=[]
  for col in cols:
   delta=Vector((col['p'][0],0,col['p'][2]))-origin
   projected.append((delta.dot(fw),delta.dot(right),col['minY'],col['maxY']))
  reach=corridor['longitudinalClearance'];half=corridor['lateralHalfWidth']
  begin=min(v[0] for v in projected)-reach-22
  end=max(v[0] for v in projected)+reach+22
  steps=math.ceil((end-begin)/20);sections=[];safety_rows=[]
  for j in range(steps+1):
   distance=begin+(end-begin)*j/steps
   active=[v for v in projected if abs(v[0]-distance)<=reach+22.01]
   assert active,'Safety loft lost the end of a reserved flight column'
   left=min(v[1]-half for v in active)-16;right_edge=max(v[1]+half for v in active)+16
   low=min(v[2] for v in active)-22;high=max(v[3] for v in active)+22
   sections.append((distance,left,right_edge,low,high))
   center=origin+fw*distance
   safety_rows.append([center+right*x+UP*y for x,y in [(left,low),(right_edge,low),(right_edge,high),(left,high)]])
  # Piecewise linear bounds make corners + all interior section boundaries an
  # exact containment proof for each complete rectangular reserved volume.
  for along,lateral,min_y,max_y in projected:
   probes=[along-reach,along+reach]+[v[0] for v in sections if along-reach<v[0]<along+reach]
   for distance in probes:
    jf=min(steps-1,max(0,int((distance-begin)/(end-begin)*steps)))
    a,b=sections[jf],sections[jf+1];q=(distance-a[0])/(b[0]-a[0])
    bounds=[a[k]*(1-q)+b[k]*q for k in range(1,5)]
    assert bounds[0]<lateral-half-10 and bounds[1]>lateral+half+10 and bounds[2]<min_y-15 and bounds[3]>max_y+15, 'Flight safety loft does not contain a complete reserved column'
  reserved_rows[corridor['id']]=safety_rows
  safety=longitudinal('CUT / guaranteed '+corridor['id']+' reserved volume',safety_rows,obsidian)
  safety.data.materials.append(fracture);safety.data.materials.append(cavity)
  for face in safety.data.polygons:face.material_index=2
  for target in macro:apply_cut(target,safety,'Full reserved '+corridor['id']+' volume')
  bpy.data.objects.remove(safety,do_unlink=True)
  print('FLIGHT VOID',corridor['id'],'reserved boxes',len(projected),'exact containment PASS',flush=True)
 # Recess the exposed faces after the broad artistic cuts, so their actual
 # 3D depth survives those cuts. These are differences only; safety is retained.
 cut_exterior_reveals({**c,'apply_cut':apply_cut,'longitudinal':longitudinal},macro)
 # Unequal connected columns retain their broken crowns and major joints;
 # bounded planar consolidation quiets only small interior facets. Reapply
 # complete safety cuts after all surface movement. The adjoining core
 # cleavage remains a difference-only continuation of the same grain.
 refine_context={**c,'apply_cut':apply_cut,'longitudinal':longitudinal}
 refined=refine_split_columns(refine_context,macro)
 continue_core_cleavage(refine_context,macro)
 recut=longitudinal('CUT / refined shoulder driving clearance',driving_rows,obsidian)
 recut.data.materials.append(fracture);recut.data.materials.append(cavity)
 for face in recut.data.polygons:face.material_index=2
 for target in refined:apply_cut(target,recut,'Production refined shoulder driving clearance')
 bpy.data.objects.remove(recut,do_unlink=True)
 for corridor in route['flightCorridors']:
  recut=longitudinal('CUT / refined '+corridor['id']+' reserved volume',reserved_rows[corridor['id']],obsidian)
  recut.data.materials.append(fracture);recut.data.materials.append(cavity)
  for face in recut.data.polygons:face.material_index=2
  for target in refined:apply_cut(target,recut,'Full reserved '+corridor['id']+' refined shoulder volume')
  bpy.data.objects.remove(recut,do_unlink=True)

 from cloudfall_lower_roots import finish_lower_root_junction
 finish_lower_root_junction({**c,'apply_cut':apply_cut},macro)

 # Every authored macro piece begins as one rooted volume. Full safety and
 # sky cuts can sever outer remnants; those are not floating art features.
 # The post-carve graph audit verified each secondary component below has no
 # true triangle intersection/solid containment connection to another rooted
 # piece. Keep the primary volume and remove these cut-off remnants before
 # surface-fitting lights or Awakening anchors.
 for ob in macro:
  bm=bmesh.new();bm.from_mesh(ob.data);bm.verts.ensure_lookup_table()
  unseen=set(bm.verts);components=[]
  while unseen:
   first=unseen.pop();group={first};pending=[first]
   while pending:
    for edge in pending.pop().link_edges:
     for vertex in edge.verts:
      if vertex in unseen:unseen.remove(vertex);group.add(vertex);pending.append(vertex)
   components.append(group)
  if len(components)>1:
   keep=max(components,key=lambda group:sum(len(v.link_faces) for v in group))
   removed=[v for group in components if group is not keep for v in group]
   count=len({f for v in removed for f in v.link_faces})
   bmesh.ops.delete(bm,geom=removed,context='VERTS')
   bm.to_mesh(ob.data);ob.data.update()
   print('REMOVED UNROOTED COMPONENTS',ob.name,len(components)-1,'faces',count,flush=True)
  bm.free()
 # Restore only the two intended through-spire moments. These substantial
 # connected crowns are added after the open exterior/oversized beauty cuts;
 # the same production driving and all reserved flight volumes still cut them.
 from cloudfall_chambers import build_chamber_crowns
 chamber_caps,chamber_records=build_chamber_crowns({**c,'longitudinal':longitudinal,'apply_cut':apply_cut})
 roadcut=longitudinal('CUT / chamber production driving clearance',driving_rows,obsidian)
 roadcut.data.materials.append(fracture);roadcut.data.materials.append(cavity)
 for face in roadcut.data.polygons:face.material_index=2
 for target in chamber_caps:apply_cut(target,roadcut,'Production chamber driving clearance')
 bpy.data.objects.remove(roadcut,do_unlink=True)
 for corridor in route['flightCorridors']:
  cut=longitudinal('CUT / chamber '+corridor['id']+' reserved volume',reserved_rows[corridor['id']],obsidian)
  cut.data.materials.append(fracture);cut.data.materials.append(cavity)
  for face in cut.data.polygons:face.material_index=2
  for target in chamber_caps:apply_cut(target,cut,'Full reserved '+corridor['id']+' chamber volume')
  bpy.data.objects.remove(cut,do_unlink=True)
 # The Heart crown crosses the earlier Buttress exterior at a higher
 # elevation. Open that local crossing as a finite cleft, not a second circular
 # driving-tube tunnel. Its lower edge follows only this earlier road; the real
 # Heart airborne ceiling below and farther south remains untouched.
 buttress_rows=[]
 for sample in [s for s in samples if 2360<=s['s']<=3220][::2]:
  p,t,r,u=frame(sample)
  buttress_rows.append([p+r*x+UP*y for x,y in [(-110,45),(-160,200),
       (-180,600),(200,600),(180,220),(125,45)]])
 opening=longitudinal('CUT / earlier Buttress open crossing',buttress_rows,obsidian)
 for material in [fracture,cavity,rind,fresh]:opening.data.materials.append(material)
 for face in opening.data.polygons:face.material_index=4 if face.index%4==0 else 2
 for target in chamber_caps:
  if target.name.startswith('Heart chamber /'):apply_cut(target,opening,'True earlier Buttress exterior opening')
 bpy.data.objects.remove(opening,do_unlink=True)
 macro.extend(chamber_caps)
 # Broad source-attached crystalline seams line actual cavity walls. Each panel is
 # mounted using a ray hit, not an analytic radius that would float after carving.
 bpy.context.view_layer.update()
 def world_bvh(objects):
  verts=[];faces=[]
  for o in objects:
   o.data.calc_loop_triangles();base=len(verts)
   verts.extend([Vector((v.co.x,v.co.z,-v.co.y)) for v in o.data.vertices])
   faces.extend([tuple(base+k for k in t.vertices) for t in o.data.loop_triangles])
  return BVHTree.FromPolygons(verts,faces,all_triangles=True)
 surface=world_bvh(macro)
 def slab(name,center,right,up,normal,width,high,depth,material):
  center=Vector(center);r=Vector(right);u=Vector(up);n=Vector(normal)
  vs=[tuple(center+r*x+u*y+n*z) for z in [-depth/2,depth/2] for x,y in [(-width/2,-high/2),(width/2,-high/2),(width/2,high/2),(-width/2,high/2)]]
  return mesh(name,vs,[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],material)
 # Restraint matters: these are seven heavy bearings and recessed mineral seams,
 # not a repeated line of freestanding hoops occupying the whole tunnel.
 seam_sources=[]
 # Three cool Heart sources and five amber Echo sources keep the authored
 # fixture budget fixed. Heart's first pair is fitted at actual airborne
 # heights ahead of takeoff, never to the deeply dropped gap-guide road.
 seam_plan=[('heart',[(3950,-1,190),(4160,1,400),(4640,-1,None)]),
            ('vault',[(8660,-1,None),(8660,1,None),(9050,1,None),(10020,-1,None),(10020,1,None)])]
 for pid,entries in seam_plan:
  for index,(distance,side,flight_along) in enumerate(entries):
   s=near(distance);p,t,r,u=frame(s)
   if flight_along is None:
    origin=p+UP*(95 if pid=='heart' else 160);direction=r*side
   else:
    cor=next(v for v in route['flightCorridors'] if v['id']=='heart-chasm')
    fw=Vector(cor['forward']).normalized();r=UP.cross(fw).normalized()
    start=Vector(cor['columns'][0]['p'])
    col=min(cor['columns'],key=lambda v:abs((Vector(v['p'])-start).dot(fw)-flight_along))
    origin=Vector(col['p']);origin.y=col['maxY']+35
    direction=(r*side+UP*.40).normalized()
   # A revised chamber may retire the old exact side plane. Search only a
   # bounded fan from guaranteed corridor air, and accept an outward host face.
   # This preserves a real attached source instead of emitting from old space.
   air=origin.copy() if flight_along is not None else p+UP*40
   if flight_along is not None:air.y=col['maxY']-10
   forward=Vector(cor['forward']).normalized() if flight_along is not None else Vector((t.x,0,t.z)).normalized()
   candidates=[(origin,direction)]+[(air,(r*side+UP*lift+forward*skew).normalized())
      for lift in [0,.35,-.30,.70] for skew in [0,.30,-.30]]
   hit=None
   for cast_origin,cast_direction in candidates:
    candidate=surface.ray_cast(cast_origin,cast_direction,850)
    if candidate[0] is not None and candidate[1].dot(-cast_direction)>.08 and abs(candidate[1].dot(UP))<.985:
     hit=candidate;direction=cast_direction;break
   if hit is None:
    bpy.ops.wm.save_as_mainfile(filepath=str(c['ROOT']/'.experiments/worldspire-cloudfall/failed-static-fixture.blend'))
    raise AssertionError('Authored mineral seam has no actual host: '+str((pid,distance,side)))
   point,normal=hit[:2]
   # Recessed backing bears into the host mineral, while the light itself is a
   # shallow exposed plane with a thick dark reveal.
   up=(UP-normal*UP.dot(normal)).normalized();rr=up.cross(normal).normalized()
   w=14 if pid=='heart' else 21;h=145 if pid=='heart' else 245
   outline=[(-.62,-.50),(.15,-.47),(.34,-.28),(.13,-.10),(.48,.10),
            (.25,.40),(-.07,.52),(-.38,.27),(-.21,.03),(-.51,-.20)]
   def seam_piece(label,ww,hh,offset,depth,material):
    vv=[]
    for z in [-depth/2,depth/2]:
     for x,y in outline:
      q=point+rr*(x*ww)+up*(y*hh)
      contact=surface.ray_cast(q+normal*120,-normal,300)
      if contact[0] is not None:q=contact[0]
      vv.append(tuple(q+normal*(offset+z)))
    count=len(outline);ff=[tuple(reversed(range(count))),tuple(range(count,2*count))]
    ff.extend([(k,(k+1)%count,(k+1)%count+count,k+count) for k in range(count)])
    return mesh(label,vv,ff,material)
   backing=seam_piece(pid+' / deep fractured mineral seat %d %d'%(index,side),w+38,h+65,-8,35,fracture);fittings.append(backing)
   panel=seam_piece(pid+' / exposed luminous vein %d %d'%(index,side),w,h,9,4,glow if pid=='heart' else warm);panel['collision']=False;fittings.append(panel)
   fixture={'position':list(point+normal*72+up*12),'normal':list(normal),'up':list(up),'color':0x82ded0 if pid=='heart' else 0xffaf67,'intensity':12000 if pid=='heart' else 20000,'radius':500 if pid=='heart' else 550,'distance':s['s'],'kind':pid+'-recess'}
   fixtures.append(fixture);seam_sources.append((backing,panel,fixture))
 # Per-vertex surface fitting can bridge a concave safety boundary when a
 # large seam spans several host faces. Cut the actual fitted seats and visible
 # veins against the same full envelopes, rather than trusting the anchor ray.
 seam_cut=longitudinal('CUT / fitted seams driving clearance',driving_rows,obsidian)
 seam_cut.data.materials.append(fracture);seam_cut.data.materials.append(cavity)
 for face in seam_cut.data.polygons:face.material_index=2
 for target in fittings:apply_cut(target,seam_cut,'Fitted seams production driving clearance')
 bpy.data.objects.remove(seam_cut,do_unlink=True)
 for corridor in route['flightCorridors']:
  seam_cut=longitudinal('CUT / fitted seams '+corridor['id']+' reserved volume',reserved_rows[corridor['id']],obsidian)
  seam_cut.data.materials.append(fracture);seam_cut.data.materials.append(cavity)
  for face in seam_cut.data.polygons:face.material_index=2
  for target in fittings:apply_cut(target,seam_cut,'Full reserved '+corridor['id']+' fitted seam volume')
  bpy.data.objects.remove(seam_cut,do_unlink=True)
 for backing,panel,fixture in seam_sources:
  if not backing.data.polygons or not panel.data.polygons:
   fixtures.remove(fixture)
   for target in [backing,panel]:
    fittings.remove(target);bpy.data.objects.remove(target,do_unlink=True)
 if len(fixtures)!=8:
  bpy.ops.wm.save_as_mainfile(filepath=str(c['ROOT']/'.experiments/worldspire-cloudfall/failed-static-fixture.blend'))
  raise AssertionError('The authored 3 Heart / 5 Echo fixture budget changed after safety cuts: '+str([(v['kind'],v['distance']) for v in fixtures]))
 # Each founded Root mineral body flows continuously into the accepted
 # unequal split crown. There is no separate flat-capped pedestal collar.
 from cloudfall_roots import build_continuous_roots
 root_fittings,root_foundations=build_continuous_roots(c,surface,longitudinal)
 fittings.extend(root_fittings)
 for foundation in root_foundations:
  print('ROOT FOUNDATION',foundation,flush=True)
 # Awake valves are authored on actual exposed ridge faces, clear of the road.
 # Surface fitting keeps each physical mineral fin attached across future rebuilds.
 for section in route['sections']:
  if section['id'] in ['heart','vault','echo','gate']:continue
  distance=section['showcase'];s=near(distance);p,t,r,u=frame(s)
  for side in [-1,1]:
   origin=p+UP*160;direction=(Vector((-p.x,0,-p.z)).normalized()+r*side*.33).normalized()
   hit=surface.ray_cast(origin,direction,1400)
   if hit[0] is None or hit[3]<125:continue
   point,normal=hit[:2]
   if normal.dot(-direction)<0:normal=-normal
   scale=.65 if point.y>5000 else .85
   center=point+normal*(15*scale)
   anchors.append({'point':list(point),'normal':list(normal),'center':list(center),'scale':scale,'y':point.y,'distance':distance,'hero':False,'name':section['id']+' ridge '+str(side)})
 # Hero wall seats use the same real surface; their emission sits above the
 # receiver horizon, never over the readable flight/landing corridor.
 from cloudfall_anchors import fit_hero_anchors
 hero_anchors=fit_hero_anchors(route,surface)
 assert all(any(a['name'].startswith(lm['id']) for a in hero_anchors) for lm in route['landmarks']), 'A hero lost all safe surface-fitted Awakening seats'
 anchors.extend(hero_anchors)
 # Runtime anchors remain visual only. The fitted static pieces join the final
 # collision export and broad audit; the game's exact swept hull/camera and full
 # reserved-volume verifier checks them after export. The seam seats are cut
 # above; the founded Root fittings are audited without a Boolean subtraction.
 for o in [body,roots]:
  assert len(o.data.polygons)>1000,'A boolean lost the connected mineral body'
 return {'macro':macro,'fittings':fittings,'anchors':anchors,'fixtures':fixtures,'surface':surface,'root_extent':root_extent,'chambers':chamber_records}
