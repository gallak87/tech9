"""Editable occupied stormwater city, authored against the production route.
Blender --background --factory-startup --python this_file -- <app-root>
"""
import bpy,bmesh,math,json,sys,random,gzip,shutil,hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(sys.argv[sys.argv.index('--')+1]).resolve();SRC=ROOT/'assets/levels/nightweir';OUT=ROOT/'public/assets/levels/nightweir';OUT.mkdir(parents=True,exist_ok=True)
route=json.loads((SRC/'route-source.json').read_text());samples=route['samples'];rng=random.Random(773)
bpy.context.preferences.filepaths.save_version=0;bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def xyz(p):return (p[0],-p[2],p[1])
def material(name,color,rough=.65,metal=0,emit=0):
 m=bpy.data.materials.new('Nightweir / '+name);m.use_nodes=True;m.diffuse_color=(*color,1);p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emit;return m
concrete=material('weathered precast',(.32,.38,.39),.85)
aggregate=material('damp retaining stone',(.15,.20,.22),.9)
steel=material('oxide machinery',(.28,.11,.055),.48,.63)
enamel=material('sluice enamel',(.055,.13,.15),.48,.45)
wear=material('rubbed steel contacts',(.34,.36,.34),.4,.62)
iron=material('blackened ironwork',(.035,.065,.078),.36,.75)
glass=material('recessed blue glass',(.028,.073,.087),.2,.45)
warm=material('occupied amber rooms',(.85,.46,.16),.4,.1,.55)
limestone=material('weathered limestone trim',(.39,.34,.27),.79)
dim=material('occupied pale rooms',(.35,.46,.43),.5,.1,.24)
sandstone=material('weathered service stone',(.30,.25,.19),.86)
deposits=material('return contact deposits',(.035,.05,.045),1)
leaf=material('terrace planting',(.03,.085,.056),.95)
objects=[];solids=[];falls=[];lights=[]
def mesh(name,vs,fs,m,solid=False,bevel=0):
 # Keep build pieces as plain arrays. Creating thousands of Blender datablocks
 # needlessly reevaluates the scene; the final authored city remains editable.
 bm=bmesh.new();verts=[bm.verts.new(xyz(v)) for v in vs]
 for f in fs:bm.faces.new([verts[i] for i in f])
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
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
 vs=[tuple(c+ax*x+ay*y+az*z) for y in [-h/2,h/2] for z in [-d/2,d/2] for x in [-w/2,w/2]]
 return mesh(name,vs,faces,m,solid,bevel)
def harbor_widen(z):return 350*min(1,max(0,(z-4100)/900))
def bed(z):return max(-45,math.floor((2750-.55*(z+350))/360)*360)
def near(s):return min(samples,key=lambda f:abs(f['s']-s))
def axes_at(f,side=1):
 t=Vector(f['t']);t.y=0;t.normalize();out=UP.cross(t)*side;return(t,UP,out)
def clear(c,dims,axes):
 # Keep every static assembly beyond a conservative swept road/camera corridor.
 c=Vector(c);a,b,d=axes;w,h,depth=dims
 return not any(abs((Vector(f['p'])-c).dot(a))<w/2+38 and abs((Vector(f['p'])-c).dot(b))<h/2+16 and abs((Vector(f['p'])-c).dot(d))<depth/2+38 for f in samples)
def cylinder(name,c,r,depth,m,axis=Vector((0,1,0)),n=24,solid=False):
 c=Vector(c);u=axis.cross(UP)
 if u.length<.01:u=Vector((1,0,0))
 u.normalize();v=axis.cross(u).normalized();vs=[]
 for end in [-depth/2,depth/2]:
  for i in range(n):vs.append(tuple(c+axis*end+u*(r*math.cos(i*math.tau/n))+v*(r*math.sin(i*math.tau/n))))
 fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)];return mesh(name,vs,fs,m,solid)
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

# Two continuous, stepped gorge walls hold the terraces and frame the harbor.
for side in [-1,1]:
 vs=[];count=70
 for i in range(count+1):
  z=-1000+i*105;floor=bed(z);x=side*(930+harbor_widen(z)+65*math.sin(z*.003)+25*math.sin(z*.011));top=floor+420+40*math.sin(z*.002+side)
  for xx,y in [(x,floor-100),(x,top),(x+side*380,top+80),(x+side*650,floor-100)]:vs.append((xx,y,z))
 fs=[]
 for i in range(count):
  for k in range(3):fs.append((i*4+k,(i+1)*4+k,(i+1)*4+k+1,i*4+k+1))
 mesh('continuous gorge retaining escarpment '+str(side),vs,fs,aggregate,True)
# Stepped structural ribs and occupied upper galleries connect the gorge into
# a continuous city rather than leaving an unarticulated horizon-height wall.
for side in [-1,1]:
 for i,z in enumerate(range(-750,6050,240)):
  floor=bed(z);x=side*(850+harbor_widen(z)+65*math.sin(z*.003)+25*math.sin(z*.011));height=490+(i%4)*42
  c=Vector((x,floor+height/2,z));axes=(Vector((0,0,1)),UP,Vector((side,0,0)))
  box('gorge stepped masonry buttress',c,(67,height,155),aggregate,axes,True,1.6)
  for tier in [130,280,height-10]:
   box('gorge occupied gallery floor',Vector((x-side*55,floor+tier,z)),(205,9,64),concrete,axes,True,1)
   box('gorge gallery enclosed room',Vector((x-side*40,floor+tier+19,z)),(205,32,38),concrete,axes,True,.8)
   box('gorge gallery roof cornice',Vector((x-side*55,floor+tier+37,z)),(213,5,68),limestone,axes,True,.6)
   box('gorge gallery parapet',Vector((x-side*87,floor+tier+7,z)),(204,9,3),iron,axes)
   for col in range(12):
    q=Vector((x-side*59,floor+tier+18,z-94+col*17))
    box('gorge recessed gallery bay',q,(12,15,2),iron,axes)
    if rng.random()>.3:box('gorge occupied light',q+Vector((-side*1.2,0,0)),(9,10,.3),warm if rng.random()>.25 else dim,axes)
    box('gorge gallery mullion',q+Vector((-side*1.4,0,0)),(.6,11,.6),iron,axes)
   for col in range(8):
    q=Vector((x-side*82,floor+tier+13,z-99+col*28))
    box('arcade gallery pier',q,(3,30,5),limestone,axes,True,.35)
    if col<7:arch('gorge gallery open arcade',q+Vector((0,10,14)),28,9,2,5,limestone,axes,True)
   box('gallery shadowed inner soffit',Vector((x-side*73,floor+tier+32,z)),(205,2,36),iron,axes)
  # Each supporting tower has a framed, inset service shaft rather than a blank slab.
  for dz in [-23,23]:box('gorge tower quoin',c+Vector((-side*80,0,dz)),(6,height-12,8),limestone,axes,True,.4)
  box('gorge tower recessed service shaft',c+Vector((-side*79,0,0)),(33,height-30,2),iron,axes)
  for yy in range(25,int(height)-25,24):box('gorge tower horizontal ventilator',Vector((x-side*81,floor+yy,z)),(32,3,5),aggregate,axes)

# Occupied terraces: massing is placed as a complete assembly and rejected if
# any neighboring road comes through its conservative envelope.
accepted=0
for index,station in enumerate(range(100,int(route['finish'])-200,245)):
 if index%10==0:print('TERRACE DISTRICT',index,flush=True)
 f=near(station);p=Vector(f['p'])
 for side in [-1,1]:
  axes=axes_at(f,side);along,up,out=axes;offset=155+(index%3)*20;c=p+out*offset;c.y=p.y+26;w=94+index%3*17;d=70;height=82+index%4*16
  floor=bed(c.z);base_y=min(p.y-30,floor);wallheight=p.y-26-base_y
  assembly=c.copy();assembly.y=(base_y+c.y+height/2)/2;extent=(w+70,c.y+height/2-base_y,d+80)
  if not clear(assembly,extent,axes):continue
  accepted+=1
  wall=c.copy();wall.y=base_y+wallheight/2
  for tier,(a,b,extra) in enumerate([(0,.4,56),(.4,.75,38),(.75,1,24)]):
   tc=wall.copy();tc.y=base_y+wallheight*(a+b)/2
   box('setback retaining tier %d %d %d'%(index,side,tier),tc,(w+extra,wallheight*(b-a),d+extra),concrete,axes,True,1.2)
   gallery=tc+up*(wallheight*(b-a)/2-6)-out*((d+extra)/2+3)
   box('intermediate retaining gallery',gallery,(w+extra+4,5,17),aggregate,axes)
   face=tc-out*((d+extra)/2+3);tierheight=wallheight*(b-a)
   bays=max(3,int((w+extra)/27));pitch=(w+extra)/bays
   for col in range(bays+1):
    q=face+along*(-(w+extra)/2+col*pitch)
    box('retaining engaged buttress',q,(3.5,max(2,tierheight-6),8),limestone,axes,True,.4)
    if col<bays and tierheight>30:
     arch('retaining blind arcade',q+along*pitch/2+up*(tierheight/2-22),pitch,14,2.5,8,limestone,axes,True)
   for yy in range(12,int(tierheight)-23,24):
    box('retaining recessed service belt',face+up*(yy-tierheight/2),(w+extra-8,6,.6),iron,axes)

   # Returning elevations need the same structural depth as the street front.
   # These piers remain inside the original conservative assembly envelope.
   for end in [-1,1]:
    endface=tc+along*(end*((w+extra)/2+1))
    endaxes=(out,up,along*end)
    span=d+extra
    facecenter=endface+along*(end*1.2)
    panel=mesh('return contact deposits',[tuple(facecenter+out*x+up*y) for x,y in [(-span/2,-tierheight/2),(span/2,-tierheight/2),(span/2,tierheight/2),(-span/2,tierheight/2)]],[(0,1,2,3)],deposits)
    # Local coordinates bind stains to the actual piers and 44m bearing courses.
    panel['uvs']=[(-4/(span-8)*3,0),(3+4/(span-8)*3,0),(3+4/(span-8)*3,tierheight),(-4/(span-8)*3,tierheight)]
    for col in range(4):
     q=endface+out*((col-1.5)*(span-8)/3)
     box('retaining return pier',q,(4.5,max(2,tierheight-5),5),limestone,endaxes,True,.4)
     if col<3 and tierheight>30:
      arch('retaining return blind arch',q+out*(span-8)/6+up*(tierheight/2-24),(span-8)/3,15,2.8,5,limestone,endaxes,True)
    for yy in range(28,int(tierheight)-18,44):
     q=endface+up*(yy-tierheight/2)
     box('return recessed service band',q,(span-6,5,.8),iron,endaxes)
     box('return projecting drip course',q+up*4,(span+3,2.5,6),aggregate,endaxes,True,.3)

   for col in range(9):
    q=gallery+along*((col-4)*(w+extra-12)/9)-out*3-up*10
    box('retaining gallery room recess',q,(7,11,2),iron,axes)
    if rng.random()>.4:box('retaining gallery inhabited room',q-out*1.1,(5,8,.25),warm if rng.random()>.3 else dim,axes)
  
  box('terrace stone footing %d %d'%(index,side),wall-up*(wallheight/2-8),(w+40,16,d+50),aggregate,axes,True,1)
  box('inhabited terrace block %d %d'%(index,side),c,(w,height,d),concrete,axes,True,.8)
  # The street-facing elevation has recessed glazing, floor slabs and deep balconies.
  floors=int(height/9.5)
  for floor_i in range(floors):
   yy=-height/2+6+floor_i*9.5
   box('inhabited balcony slab',c+up*(yy-4)+out*(-d/2-4),(w+4,1.7,11),aggregate,axes)
   for col in range(10):
    xx=(col-4.5)*(w-8)/10;front=c+along*xx+up*yy-out*(d/2+.45)
    box('window reveal',front,(6.3,6,1.3),iron,axes)
    lit=rng.random()>.3
    box('occupied window',front-out*.75,(4.8,4.7,.22),warm if lit and rng.random()>.2 else dim if lit else glass,axes)
    box('window mullion',front-out*.96,(.22,5.3,.18),iron,axes)
    if lit and floor_i%3==0 and col in [1,4]:lights.append({'p':list(front-out*2),'power':1400,'color':'#ffc18a'})
   for col in range(7):box('balcony baluster',c+along*((col-3)*(w-4)/6)+up*(yy-1.8)-out*(d/2+8),( .5,3.2,.5),iron,axes)
   box('balcony handrail',c+up*(yy-.2)-out*(d/2+8),(w, .45,.55),iron,axes)
  for end in [-1,1]:
   endface=c+along*(end*(w/2+.6));endaxes=(out,up,along*end)
   for col in [-1,0,1]:
    q=endface+out*(col*21)
    box('terrace return recessed shaft',q,(14,height-10,1.5),iron,endaxes)
    for floor_i in range(floors):
     yy=-height/2+6+floor_i*9.5
     box('return stairwell glass',q+up*yy+along*(end*1.1),(10,6,.35),dim if (floor_i+col+index)%4==0 else glass,endaxes)
     box('return stairwell sill',q+up*(yy-3.5)+along*(end*1.6),(16,1.5,4),limestone,endaxes,True,.2)
   for col in [-1.5,-.5,.5,1.5]:
    box('terrace return engaged pier',endface+out*(col*21),(3,height+3,5),limestone,endaxes,True,.3)
  roof=c+up*(height/2+2)
  box('roof parapet front',roof-out*(d/2),(w+3,4,2.2),aggregate,axes)
  for side_end in [-1,1]:
   box('terrace vertical corner pier',c+along*(side_end*w/2)-out*(d/2+2),(3.5,height+5,4),limestone,axes,True,.3)
   box('roof side parapet',roof+along*(side_end*w/2),(2.5,4,d),aggregate,axes)
  box('roof cap cornice',roof+up*2-out*2,(w+7,2,d+6),limestone,axes,True,.4)

  box('roof service penthouse',roof+up*6+along*(w*.16),(w*.35,10,d*.38),iron,axes)
  for k in range(3):cylinder('roof vent',roof+along*(-w*.32+k*8)+out*10+up*5,2.1,10,steel)
  # A small number of inhabited service entries form coherent, lit street pockets.
  if index%3==1:
   entry=c-out*(d/2+2)+up*(-height/2+9)
   box('service arcade dark inner room',entry,(30,18,2),iron,axes)
   for dx in [-18,18]:box('service entry stone jamb',entry+along*dx,(5,25,8),sandstone,axes,True,.5)
   arch('service room arched lintel',entry+up*9,36,9,3,8,sandstone,axes,True)
   box('service entry half glazed door',entry+along*6-out*1.3,(8,14,.5),warm,axes)
   for dx in [2,6,10]:box('service entry door mullion',entry+along*dx-out*1.7,(.4,15,.4),iron,axes)
   box('service entry landing',entry-up*10-out*4,(43,3,15),sandstone,axes,True,.4)
   awning=entry+up*21-out*6
   box('service entry standing seam canopy',awning,(47,2,17),iron,axes,True,.3)
   for dx in [-20,20]:box('canopy front support',entry+along*dx-out*12+up*4,(1.4,30,1.4),steel,axes,True,.2)
   light=awning-up*3-out*2
   box('service entry lantern hood',light,(7,3,4),iron,axes)
   box('service entry lantern lens',light-up*1.6,(5.8,.25,3),warm,axes)
   lights.append({'p':list(light-up*2),'power':2400,'color':'#ffcd98','pocket':True})
  # Selected end walls expose a continuous hydraulic stack, visibly seated
  # on their retaining tiers instead of repeating another apartment facade.
  if index%3==1:
   top_y=c.y+height/2+9;bottom_y=base_y+14
   stack=c+along*(w/2+34)+out*16;stack.y=(top_y+bottom_y)/2
   cylinder('return hydraulic downpipe',stack,4.8,top_y-bottom_y,steel,solid=True)
   for yy in range(int(bottom_y+12),int(top_y-8),48):
    q=stack.copy();q.y=yy
    cylinder('downpipe flange',q,6,2.5,iron,solid=True)
    box('downpipe masonry saddle',q-along*8,(18,4,13),aggregate,axes,True,.3)
   q=stack.copy();q.y=bottom_y+5
   cylinder('return outfall nozzle',q+along*9,6.5,20,steel,along,solid=True)
   cylinder('outfall dark mouth',q+along*19.1,5.1,.5,iron,along)
  # Exposed vertical storm pipes end in a built spillway mouth.
  for end in [-1,1]:
   pipe=c+along*(end*(w/2-5))-out*(d/2+2);pipe.y=p.y+15
   cylinder('rainwater riser',pipe,1.7,height+75,steel)
  if index%3==0:
   lip=c-out*(d/2+20);lip.y=p.y-28
   box('spillway lip',lip,(32,5,20),iron,axes,True,.6)
   bottom=bed(lip.z)+7
   falls.append({'top':list(lip+up*2-out*10),'right':list(along),'width':28,'height':max(80,lip.y-bottom),'seed':index+side*.3,'kind':'terrace'})
  # Original circular turbine assemblies distinguish three industrial districts.
  if index%9==3:
   machine=c-out*(d/2+9);machine.y=p.y+height*.15
   axis=-out
   cylinder('turbine volute',machine,29,18,steel,axis,32,True)
   cylinder('turbine recessed mouth',machine+axis*10,23,2,iron,axis,32)
   cylinder('turbine hub',machine+axis*12,7,7,steel,axis,24)
   for k in range(9):
    a=k*math.tau/9;r=along*math.cos(a)+up*math.sin(a);t=axis.cross(r)
    box('turbine radial impeller',machine+axis*12+r*16,(3,16,2),steel,(t,r,axis))
# Horizontal impoundments have solid stepped dams and broad connecting falls.
previous=bed(-1300)
for z in range(-1295,6501,5):
 current=bed(z)
 if current<previous:
  top=previous+4;bottom=current+4
  box('impoundment dam body',Vector((0,(top+bottom)/2,z)),(1840,top-bottom,20),aggregate,solid=True,bevel=.8)
  box('impoundment spill lip',Vector((0,top-2,z+6)),(1836,7,15),concrete,solid=True,bevel=.6)
  falls.append({'top':[0,top,z+14],'right':[1,0,0],'width':1800,'height':top-bottom,'seed':z*.013,'kind':'dam'})
 previous=current
# Large curtained water crossings have a credible feeder bridge and gate towers.
for i,curtain in enumerate(route['curtains']):
 f=near(curtain['s']);p=Vector(f['p']);along,up,right=axes_at(f);axes=(right,up,along);top=p+up*66
 box('water curtain header %d'%i,top,(84,13,15),concrete,axes,True,1)
 # The hoist stems terminate in a connected upper machine frame.
 for side in [-1,1]:
  box('hoist upper channel',p+right*(side*30)+up*91-along*10,(3.6,46,6),iron,axes,True,.3)
  box('hoist bearing block',p+right*(side*30)+up*113-along*12,(7,7,8),steel,axes,True,.5)
 box('hoist upper crosshead',p+up*115-along*10,(68,4,8),iron,axes,True,.4)

 box('water curtain iron outlet %d'%i,top-up*7,(56,3,11),iron,axes,True,.4)
 q=p+up*68-along*23
 box('gate central worklight bracket',q+along*7,(3,3,15),iron,axes)
 box('gate central worklight hood',q,(13,4,6),iron,axes)
 box('gate central downlight',q-up*2.1,(11,.3,4.5),warm,axes)
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
  box('gate worklight lens',q-up*1.6,(4.8,.25,2.7),warm,axes)
  lights.append({'p':list(q-up*2-along*2),'power':3800,'color':'#ffcb91'})

 falls.append({'top':list(top-up*8),'right':list(right),'width':52,'height':top.y-8-bed(top.z)-4,'seed':i*.53,'kind':'crossing','distance':curtain['s']})
# Narrow bridge bents meet the sloping bed; rolls keep their open silhouette.
for station in range(30,int(route['length']),160):
 f=near(station)
 if f['gap'] or any(r['start']-100<station<r['end']+100 for r in route['inversions']):continue
 p=Vector(f['p']);bottom=bed(p.z);height=p.y-bottom-12
 if height<20:continue
 axes=axes_at(f);center=p-UP*(height/2+10)
 if not clear(center,(14,height-28,17),axes):continue
 box('founded bridge bent',center,(12,height,15),concrete,axes,True,.7)
 box('bridge capital',p-UP*10,(42,7,19),aggregate,axes,True,.6)
# Quay markers and working harbor cranes, deliberately outside the runoff.
for i in range(7):
 z=4400+i*170;x=(-1 if i%2 else 1)*(580+i%3*100);y=bed(z)+15
 box('harbor quay',Vector((x,y-15,z)),(145,45,120),concrete,solid=True,bevel=1)
 box('crane portal',Vector((x,y+49,z)),(7,100,7),steel,solid=True)
 box('crane boom',Vector((x+45,y+98,z)),(120,5,5),steel,solid=True)
 box('crane counterweight',Vector((x-30,y+91,z)),(17,14,15),iron)
 for k in range(3):box('quay warehouse',Vector((x-38+k*36,y+12,z+33)),(30,24,38),concrete,solid=True,bevel=.6)
# A receiving-quay customs hall, lamps and a broad mechanical finish gantry.
f=near(route['finish']);p=Vector(f['p']);along,up,right=axes_at(f);axes=(right,up,along)
for side in [-1,1]:
 box('harbor finish pier',p+right*(side*44)+up*17,(13,48,18),concrete,axes,True,.9)
 box('harbor finish lantern',p+right*(side*44)+up*43,(9,5,9),warm,axes)
 hall=p+right*(side*135)+up*12
 box('harbor receiving hall lower masonry',hall-up*10,(100,18,155),aggregate,axes,True,.8)
 box('harbor receiving hall inner volume',hall+right*side*13+up*6,(74,25,155),concrete,axes,True,.8)
 facade=hall-right*(side*50)
 front_axes=(along,up,right*side)
 for k in range(7):
  q=facade+along*(-73+k*24)
  box('customs arcade pier',q,(4,36,7),limestone,front_axes,True,.4)
  if k<6:
   arch('customs open arcade vault',q+along*12+up*9,24,10,2.2,8,limestone,front_axes,True)
   box('customs shaded recessed glazing',q+along*12+right*(side*12)+up*4,(19,23,1),glass,front_axes)
   box('customs occupied door light',q+along*9+right*(side*11.4)+up*4,(4.5,13,.3),warm,front_axes)
   box('customs room sill',q+along*12-up*7,(23,2,10),limestone,front_axes)
 for k in range(3):
  z=-76+k*51
  vs=[tuple(hall+right*x+along*zz+up*y) for x in [-53,53] for zz,y in [(z,19),(z+48,32),(z+48,19)]]
  mesh('harbor sawtooth roof',vs,[(0,1,4,3),(1,2,5,4),(0,3,5,2),(0,2,1),(3,4,5)],iron,True)
  box('harbor roof clerestory',hall+along*(z+48.2)+up*25,(98,9,.5),dim,axes)
  for x in range(-48,49,12):box('clerestory vertical mullion',hall+right*x+along*(z+48.7)+up*25,(.8,11,1),iron,axes)
 for dx in [-43,43]:
  for dz in [-64,64]:
   q=hall+right*dx+along*dz;bottom=bed(q.z);height=q.y-bottom-12
   box('receiving hall founded pier',Vector((q.x,bottom+height/2,q.z)),(10,height,12),aggregate,axes,True,.6)
 for k in [-48,0,48]:
  q=facade+along*k+up*16-right*side*6
  box('customs arcade lantern hood',q,(3,2.5,3),iron,axes)
  box('customs arcade lantern lens',q-up*1.4,(2,.3,2),warm,axes)
  lights.append({'p':list(q-up*2),'power':1600,'color':'#ffc18a'})

for y in [41,50]:box('harbor finish truss chord',p+up*y,(103,2.5,7),steel,axes,True,.4)
for k in range(10):
 x=-48+k*10.5;a=p+right*x+up*42;b=p+right*(x+10.5)+up*49
 d=(b-a).normalized();u=along.cross(d).normalized()
 box('harbor finish open truss web',(a+b)/2,(1.7,(b-a).length,2.8),steel,(u,d,along),True,.2)

for x in [-30,-15,0,15,30]:box('harbor finish inset lights',p+right*x+up*43-along*5.1,(8,2,.3),warm,axes)
# Moored working barges provide a human-scale destination in the open basin.
for side in [-1,1]:
 for k in range(2):
  c=Vector((side*(480+k*290),bed(4950+k*390)+7,4950+k*390));w=72;length=220
  vs=[]
  for y,scale in [(-10,.78),(11,1.)]:
   for x,z in [(-w/2,-length/2),(w/2,-length/2),(w/2,length*.34),(0,length/2),(-w/2,length*.34)]:vs.append(tuple(c+Vector((x*scale,y,z*scale))))
  mesh('moored harbor cargo hull',vs,[tuple(reversed(range(5))),tuple(range(5,10))]+[(i,(i+1)%5,(i+1)%5+5,i+5) for i in range(5)],iron,True)
  box('barge raised deck',c+up*12,(65,3,174),aggregate,solid=True,bevel=.6)
  for row in range(4):
   for col in [-1,1]:
    q=c+Vector((col*17,23,-65+row*33))
    box('cargo stack',q,(29,19,30),steel if (row+k)%2 else concrete,solid=True,bevel=.4)
    for x in [-11,-5,1,7,13]:box('container corrugation',q+Vector((x,0,-15.3)),(.6,18,.5),iron)
  cabin=c+Vector((0,25,-92));box('barge wheelhouse',cabin,(44,25,26),limestone,solid=True,bevel=.6)
  for x in [-15,-5,5,15]:box('wheelhouse glass',cabin+Vector((x,5,13.2)),(8,8,.5),dim)
  box('wheelhouse roof',cabin+up*14,(50,3,31),iron)
  cylinder('barge foredeck bollard',c+Vector((0,19,78)),2,10,steel)

# Record physical solids before combining presentation meshes.
positions=[];indices=[]
for o in solids:
 offset=len(positions)
 for x,y,z in o['vertices']:positions.append([x,z,-y])
 for face in o['faces']:
  for i in range(1,len(face)-1):indices.extend(offset+j for j in [face[0],face[i],face[i+1]])
(SRC/'collision-kit.json').write_text(json.dumps({'id':'nightweir-city-solids','positions':positions,'indices':indices},separators=(',',':')))
(SRC/'water-kit.json').write_text(json.dumps({'falls':falls,'lights':lights},separators=(',',':')))
# Keep districts independently culled at runtime; material assets remain shared.
buckets={}
for o in objects:
 z=-sum(v[1] for v in o['vertices'])/len(o['vertices'])
 buckets.setdefault(math.floor(z/600),[]).append(o)
worlds=[];triangle_count=0
for district,pieces in sorted(buckets.items()):
 all_vertices=[];all_faces=[];all_slots=[];all_materials=[];uv_overrides=[]
 for o in pieces:
  offset=len(all_vertices);all_vertices.extend(o['vertices']);uv_overrides.extend(o.get('uvs',[None]*len(o['vertices'])));material=o['material']
  if material not in all_materials:all_materials.append(material)
  slot=all_materials.index(material)
  for face in o['faces']:all_faces.append(tuple(offset+j for j in face));all_slots.append(slot)
 data=bpy.data.meshes.new('Nightweir district %d'%district);data.from_pydata(all_vertices,[],all_faces);data.update()
 world=bpy.data.objects.new('Nightweir / editable district %d'%district,data);bpy.context.collection.objects.link(world);worlds.append(world)
 for material in all_materials:data.materials.append(material)
 for poly,slot in zip(data.polygons,all_slots):poly.material_index=slot
 uv=data.uv_layers.new(name='Metres');col=data.color_attributes.new(name='Sheltered faces',type='BYTE_COLOR',domain='CORNER')
 for poly in data.polygons:
  axis=max(range(3),key=lambda i:abs(poly.normal[i]));shade=.70 if poly.normal.z<-.3 else .90 if axis!=2 else 1
  for li in poly.loop_indices:
   v=data.vertices[data.loops[li].vertex_index].co;uv.data[li].uv=uv_overrides[data.loops[li].vertex_index] or (v.y if axis==0 else v.x,v.y if axis==2 else v.z);col.data[li].color=(shade,shade,shade,1)
 data.calc_loop_triangles();triangle_count+=len(data.loop_triangles)
 print('DISTRICT',district,len(data.loop_triangles),'triangles',flush=True)
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
info={'generator':'Blender 5.1.1 project-authored deterministic build','seed':773,'source':'nightweir-city.blend','runtime':'nightweir-city.glb.gz','encoding':{'compression':'gzip','decompressedSha256':unpacked_hash},'triangles':triangle_count,'districts':len(worlds),'solidTriangles':len(indices)//3,'inhabitedTerraces':accepted,'waterfalls':len(falls),'geometry':'Occupied terraces with deep returning facades, open gallery arches, service entries, hydraulic gate frames, bridge foundations, sawtooth receiving halls and a working barge harbor'};(SRC/'model-provenance.json').write_text(json.dumps(info,indent=2)+'\n');print(json.dumps(info))
