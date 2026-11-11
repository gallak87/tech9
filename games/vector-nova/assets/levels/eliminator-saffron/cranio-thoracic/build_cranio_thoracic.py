"""Course-private retained world-frame cranio-thoracic fossil.
Run background Blender with --python this_file.py -- --guide /tmp/guide.json.
Regenerate the ignored exact guide with the sibling export-authoring-guides.mjs.
No canonical geometry is edited or exported by this original asset builder.
"""
from pathlib import Path
import argparse, bisect, hashlib, json, math, struct, sys
import bpy, bmesh
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

HERE=Path(__file__).resolve().parent
GAME=HERE.parents[3]
parser=argparse.ArgumentParser(description='Rebuild the original retained world-frame Ossuary anatomy from an explicit temporary guide.')
parser.add_argument('--guide',type=Path,required=True,help='Absolute or relative path produced by export-authoring-guides.mjs; never shipped.')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--'in sys.argv else [])
GUIDE=args.guide.expanduser().resolve()
OUT=GAME/'public/assets/levels/eliminator-saffron/cranio-thoracic.glb'
BLEND=HERE/'cranio-thoracic.blend'
G=json.loads(GUIDE.read_text())
F=G['track']['frames']; DIST=[f['s']for f in F]
ROLES=['Saffron_pale_fossil','Saffron_chalk_edges','Saffron_marrow_ochre']
def C(p):return Vector((p[0],-p[2],p[1]))
def W(p):return [p.x,p.z,-p.y]
def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
def frame(s):
 i=max(0,min(len(F)-2,bisect.bisect_right(DIST,s)-1));u=(s-DIST[i])/(DIST[i+1]-DIST[i])
 p=Vector(F[i]['position']).lerp(Vector(F[i+1]['position']),u)
 r=Vector(F[i]['right']).lerp(Vector(F[i+1]['right']),u).normalized()
 up=Vector(F[i]['up']).lerp(Vector(F[i+1]['up']),u).normalized()
 return p,r,up
P=G['terrain']['positions'];N=int(round(math.sqrt(len(P)//3)))-1
X0,Z0=P[0],P[2];X1=P[N*3];Z1=P[N*(N+1)*3+2]
def ground(x,z):
 gx=max(0,min(N-.000001,(x-X0)/(X1-X0)*N));gz=max(0,min(N-.000001,(z-Z0)/(Z1-Z0)*N));ix,iz=int(gx),int(gz);u,v=gx-ix,gz-iz
 def y(dx,dz):return P[((iz+dz)*(N+1)+ix+dx)*3+1]
 a,b,c,d=y(0,0),y(1,0),y(0,1),y(1,1)
 return a+(b-a)*u+(c-a)*v if u+v<=1 else d+(c-d)*(1-u)+(b-d)*(1-v)
def at(s,x,y):
 p,r,u=frame(s);return p+r*x+u*y

bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for m in list(bpy.data.materials):bpy.data.materials.remove(m)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
refcol=bpy.data.collections.new('GUIDE / exact editor-only source road skull dunes cameras');scene.collection.children.link(refcol)
sourcecol=bpy.data.collections.new('EDIT / original thick cranio-thoracic construction');scene.collection.children.link(sourcecol)
exportcol=bpy.data.collections.new('RUNTIME / original new anatomy only');scene.collection.children.link(exportcol)
materials=[]
for name,color in zip(ROLES,[(.68,.61,.46,1),(.84,.80,.66,1),(.24,.13,.055,1)]):
 m=bpy.data.materials.new(name);m.diffuse_color=color;m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=color;n.inputs['Roughness'].default_value=.84;materials.append(m)
soil=bpy.data.materials.new('Ossuary sediment / runtime borrowed bedrock');soil.diffuse_color=(.47,.29,.11,1);soil.use_nodes=True;soil.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=soil.diffuse_color;soil.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.95

TOE_POINTS={}
def raw(name,points,faces,roles=None,collection=sourcecol):
 data=bpy.data.meshes.new(name);data.from_pydata([C(p)for p in points],[],faces);data.update();bm=bmesh.new();bm.from_mesh(data)
 if collection==sourcecol:bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
 bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(data);bm.free()
 o=bpy.data.objects.new(name,data);collection.objects.link(o)
 for m in materials:data.materials.append(m)
 if roles:
  for p,i in zip(data.polygons,roles):p.material_index=i
 for p in data.polygons:p.use_smooth=True
 return o

# The exact guides are visible/editable only; selection export excludes them.
for kind,parts in [('road',G['road']),('fossil',G['fossils']),('context',G['context']),('terrain',[G['terrain']])]:
 for j,part in enumerate(parts):
  pp=part['positions'];ii=part.get('indices')or list(range(len(pp)//3));o=raw('GUIDE_'+kind+'_'+str(j),[pp[i:i+3]for i in range(0,len(pp),3)],[ii[i:i+3]for i in range(0,len(ii),3)],collection=refcol);o.hide_render=True;o.display_type='SOLID';o['source']=part['name']
R=Matrix(((1,0,0),(0,0,-1),(0,1,0)))
for name,view in G['cameras']['views'].items():
 q=view['camera'];data=bpy.data.cameras.new('GUIDE_CAMERA_'+name);o=bpy.data.objects.new(data.name,data);refcol.objects.link(o);rot=R@Quaternion((q['quaternion'][3],*q['quaternion'][:3])).to_matrix();o.matrix_world=rot.to_4x4();o.location=C(q['position']);data.type='PERSP';data.sensor_fit='VERTICAL';data.sensor_height=24;data.lens=12/math.tan(math.radians(q['fov'])/2);data.clip_end=20000;o.hide_render=True

# One long, unequal double-wall cortical casing. Its big flared through-cells
# retain complete thick returns, not a smooth plane with decorative holes.
def shell(name,start,end,rows,columns,inner=False):
 lo,hi=(-.64,math.pi+.64) if not inner else (.08,math.pi-.12)
 holes=[(1686,1.44,82,.40),(1738,.20,83,.57),(1782,2.75,70,.55),(1885,.48,82,.54),(1938,2.45,77,.55),(1988,1.40,78,.42),(2110,.33,74,.57),(2132,2.60,68,.54)] if not inner else [(1820,.85,45,.42),(1902,2.25,44,.43)]
 def shape(s,a,layer):
  t=(s-start)/(end-start)
  if inner:rx=72+8*math.sin(t*math.pi);ry=111+12*math.sin(t*math.pi);extra=23;shift=-12
  else:rx=88+30*math.sin(t*math.pi*.9);ry=119+53*math.sin(t*math.pi*.85);extra=45+13*math.sin(t*math.pi);shift=5*math.sin(t*5.1)
  rx+=layer*extra;ry+=layer*(extra+10)
  # Broad cortical ridge/flute hierarchy, unequal shoulders and a broken crown.
  ridge=(6+layer*7)*math.exp(-((a-(.48+.14*math.sin(t*4)))/.22)**2)*math.sin(t*math.pi)
  ridge+=(7+layer*5)*math.exp(-((a-(2.45-.13*math.sin(t*3)))/.25)**2)
  x=shift+(rx+ridge)*math.copysign(abs(math.cos(a))**.82,math.cos(a))
  y=-48+ry*math.sin(a)+9*math.sin(t*5+a*1.3)*math.sin(a)**2
  point=at(s,x,y)
  if not inner:
   weight=1-smooth((min(a-lo,hi-a))/.36)
   point.y=point.y*(1-weight)+min(point.y,ground(point.x,point.z)-16)*weight
  return point
 def radius(theta,seed):return 1+.16*math.sin(theta*3+seed*.81)+.065*math.cos(theta*5-seed*.37)
 def hole(s,a):
  for k,(cs,ca,rs,ra)in enumerate(holes):
   u,v=(s-cs)/rs,(a-ca)/ra
   if math.hypot(u,v)<radius(math.atan2(v,u),k):return True
  return False
 masked=[[hole(start+(end-start)*(j+.5)/rows,lo+(hi-lo)*(i+.5)/columns)for i in range(columns)]for j in range(rows)]
 # Merge only diagonal pinches into their existing large cavity, retaining
 # a genuine closed branching passage instead of a zero-width cortical edge.
 for _ in range(4):
  for j in range(1,rows):
   for i in range(1,columns):
    a,b,c,d=masked[j-1][i-1],masked[j-1][i],masked[j][i-1],masked[j][i]
    if a==d and b==c and a!=b:
     masked[j-1][i-1]=masked[j-1][i]=masked[j][i-1]=masked[j][i]=True
 def removed(j,i):return 0<=j<rows and 0<=i<columns and masked[j][i]
 params=[]
 for j in range(rows+1):
  for i in range(columns+1):
   s=start+(end-start)*j/rows;a=lo+(hi-lo)*i/columns
   around=[removed(j-1,i-1),removed(j-1,i),removed(j,i-1),removed(j,i)]
   if 0<j<rows and 0<i<columns and any(around)and not all(around):
    choices=[]
    for k,(cs,ca,rs,ra)in enumerate(holes):
     u,v=(s-cs)/rs,(a-ca)/ra;r=math.hypot(u,v);b=radius(math.atan2(v,u),k);choices.append((abs(r-b),r,b,cs,ca,rs,ra,u,v))
    _,r,b,cs,ca,rs,ra,u,v=min(choices)
    if r>.08:s=cs+u/r*b*rs;a=ca+v/r*b*ra
   params.append((s,a))
 stride=columns+1;off=len(params);points=[shape(s,a,l)for l in[0,1]for s,a in params];faces=[];roles=[]
 def face(ids,role=0):faces.append(tuple(ids));roles.append(role)
 def wall(a,b):
  # Four depth bands make proper pale lips and a recessed warm marrow return.
  chain=[[a,b]]
  for t in [.14,.50,.86]:
   ids=[]
   for v in[a,b]:ids.append(len(points));points.append(points[v].lerp(points[v+off],t))
   chain.append(ids)
  chain.append([a+off,b+off])
  for k,(one,two)in enumerate(zip(chain,chain[1:])):face((one[0],two[0],two[1],one[1]),1 if k in[0,3]else 2)
 for j in range(rows):
  for i in range(columns):
   if removed(j,i):continue
   a=j*stride+i;b=a+1;d=a+stride;c=d+1
   face((a,d,c,b));face((a+off,b+off,c+off,d+off))
   if j==0 or removed(j-1,i):wall(a,b)
   if j==rows-1 or removed(j+1,i):wall(c,d)
   if i==0 or removed(j,i-1):wall(d,a)
   if i==columns-1 or removed(j,i+1):wall(b,c)
 return raw(name,points,faces,roles)

# Retain ONE early sheltered pocket; the rest is open unequal branching
# anatomy, not a uniform longitudinal hall or concentric annular sequence.
main=shell('Original / fractured sheltered occipital pocket',1620,1785,20,40)

# Broad closed tapered plates physically connect the measured far cheek to
# the new body and the deeper chamber. Contacts come from ACTUAL source faces.
skull_objects=[o for o in refcol.objects if o.name.startswith('GUIDE_fossil_')and o['source'].startswith('skull/')]
sv,sf=[],[]
for o in skull_objects:
 off=len(sv);sv.extend(v.co.copy()for v in o.data.vertices);sf.extend(tuple(off+i for i in p.vertices)for p in o.data.polygons)
skull_tree=BVHTree.FromPolygons(sv,sf,all_triangles=False)
contacts=[]
def plate(name,coords,widths,depths,steps=None,buried_end=False):
 pts=[Vector(p)for p in coords]
 if buried_end:
  pts[-1].y=min(pts[-1].y,ground(pts[-1].x,pts[-1].z)-max(widths[-1],depths[-1])-20)
 vv=[];ff=[];roles=[];steps=steps or max(24,(len(pts)-1)*10);sides=24
 def cat(t):
  station=t*(len(pts)-1);k=min(len(pts)-2,int(station));u=station-k
  p0,p1=pts[max(0,k-1)],pts[k];p2,p3=pts[k+1],pts[min(len(pts)-1,k+2)]
  return .5*((2*p1)+(-p0+p2)*u+(2*p0-5*p1+4*p2-p3)*u*u+(-p0+3*p1-3*p2+p3)*u*u*u)
 def profile(values,t):
  q=t*(len(values)-1);k=min(len(values)-2,int(q));u=smooth(q-k);return values[k]*(1-u)+values[k+1]*u
 for j in range(steps+1):
  t=j/steps;c=cat(t);tangent=(cat(min(1,t+.001))-cat(max(0,t-.001))).normalized()
  # Broad load face, tapered fans and real longitudinal cutback. These are
  # flattened cortical plates, not constant-radius tubes or painted channels.
  broad=Vector((0,1,0));broad=(broad-tangent*broad.dot(tangent)).normalized();normal=tangent.cross(broad).normalized()
  width=profile(widths,t);depth=profile(depths,t)
  for i in range(sides):
   a=math.tau*i/sides;u=math.cos(a);v=math.sin(a);u=math.copysign(abs(u)**.78,u);v=math.copysign(abs(v)**.72,v)
   cut=depth*.55*math.exp(-((u-.08)/.39)**4)*math.sin(t*math.pi)**.75 if v>0 else 0
   vv.append(c+broad*(u*width)+normal*(v*depth-cut))
 for j in range(steps):
  for i in range(sides):
   ff.append((j*sides+i,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,(j+1)*sides+i));roles.append(2 if i in[5,6]and steps*.18<j<steps*.84 else 0)
 ff.extend([tuple(range(sides-1,-1,-1)),tuple(steps*sides+i for i in range(sides))]);roles.extend([0,0])
 obj=raw(name,vv,ff,roles)
 if buried_end:TOE_POINTS[name+' / terminal toe cap']={'node':name,'points':vv[-sides:]}
 return obj
for side in[-1,1]:
 target=at(1680,side*78,48);hit,normal,face,distance=skull_tree.find_nearest(C(target));p=Vector(W(hit));n=Vector(W(normal));contacts.append({'name':'skull_far_cheek_'+str(side),'point':list(p),'normal':list(n),'sourceFace':face,'sourceQueryDistance':distance})
 plate('Original / broad seated far-cheek cortical fan '+str(side),[p-n*6,at(1700,side*95,42),at(1750,side*120,35)],[24,32],[18,27])
def cortical_fan(name,centre,base_lateral,base_y,rise,span_max,rows,cols,buried=False):
 # Genuine folded two-skin cortical fan: a spreading foot, forked spine,
 # long cutback flutes, broken processes and large connected stress galleries.
 # Unlike plate(), this is a porous anatomical surface, never an ellipse loft.
 # Several substantial unequal cells retain branching cortex BETWEEN them;
 # the previous overlapping masks collapsed into one long graphic slot.
 holes=[(-.43,.48,.25,.15),(.31,.63,.25,.15),(-.30,.79,.20,.105),(.55,.84,.14,.085),(-.20,.51,.13,.075)]
 def radius(theta,k):return 1+.16*math.sin(theta*3+k*.9)+.065*math.cos(theta*5-k*.6)
 def hole(u,t):
  for k,(x,y,rx,ry)in enumerate(holes):
   a,b=(u-x)/rx,(t-y)/ry
   if math.hypot(a,b)<radius(math.atan2(b,a),k):return True
  return False
 mask=[[hole(-1+2*(i+.5)/cols,(j+.5)/rows)for i in range(cols)]for j in range(rows)]
 for _ in range(5):
  for j in range(1,rows):
   for i in range(1,cols):
    a,b,c,d=mask[j-1][i-1],mask[j-1][i],mask[j][i-1],mask[j][i]
    if a==d and b==c and a!=b:mask[j-1][i-1]=mask[j-1][i]=mask[j][i-1]=mask[j][i]=True
 def removed(j,i):return 0<=j<rows and 0<=i<cols and mask[j][i]
 def shape(u,t,layer):
  span=28+span_max*math.sin(t*math.pi*.70)**1.13
  station=centre+span*u+13*math.sin(t*2.1)
  broken=(-29*math.exp(-((u+.48)/.18)**2)+18*math.exp(-((u-.18)/.13)**2)-32*math.exp(-((u-.72)/.14)**2))*t**6
  y=base_y+rise*(t**.57 if buried else t)-13*t**4*u+broken
  spine=28*math.exp(-((u-.10*math.sin(t*4))/.20)**2)*math.sin(t*math.pi*.88)
  forks=15*math.exp(-((u+.40-.16*t)/.16)**2)*math.sin(t*math.pi)
  cutbacks=19*math.exp(-((u+.25-.10*t)/.16)**4)+16*math.exp(-((u-.42+.09*t)/.17)**4)
  fold=16*u*u+7*math.sin(t*3.2)+spine+forks-cutbacks*math.sin(t*math.pi)
  thickness=18+33*(1-t)**2+13*math.exp(-(u/.30)**2)*(1-t)
  lateral=base_lateral+fold+(layer-.5)*thickness
  point=at(station,lateral,y)
  # Keep the measured lower foot fixed, but turn the broad upper face toward
  # its actual native approach. Previously the cell-bearing plane was edge-on.
  view='course-3' if buried else 'skull-gallery'
  target=Vector((1071.372,414.905,651.730) if buried else (675.482,463.055,914.747))
  camera=Vector(G['cameras']['views'][view]['camera']['position'])
  facing=camera-target;facing.y=0;facing.normalize()
  across=Vector((0,1,0)).cross(facing).normalized()
  oriented=target+across*(span*u+13*math.sin(t*2.1))+Vector((0,y+(35 if not buried else 0),0))+facing*(fold+(layer-.5)*thickness)
  point=point.lerp(oriented,smooth(t/.30))
  if buried:
   weight=1-smooth(t/.18);point.y=point.y*(1-weight)+min(point.y,ground(point.x,point.z)-20)*weight
  return point
 params=[]
 for j in range(rows+1):
  for i in range(cols+1):
   u,t=-1+2*i/cols,j/rows;around=[removed(j-1,i-1),removed(j-1,i),removed(j,i-1),removed(j,i)]
   if 0<j<rows and 0<i<cols and any(around)and not all(around):
    choices=[]
    for k,(x,y,rx,ry)in enumerate(holes):
     a,b=(u-x)/rx,(t-y)/ry;r=math.hypot(a,b);rad=radius(math.atan2(b,a),k)
     if r<.08:continue
     uu=x+a/r*rad*rx;tt=y+b/r*rad*ry
     if not any(math.hypot((uu-xx)/rrx,(tt-yy)/rry)<radius(math.atan2((tt-yy)/rry,(uu-xx)/rrx),kk)-.015 for kk,(xx,yy,rrx,rry)in enumerate(holes)if kk!=k):choices.append((abs(r-rad),uu,tt))
    if choices:
     _,u,t=min(choices);t=max(0,min(1,t));u=max(-1,min(1,u))
   params.append((u,t))
 stride=cols+1;off=len(params);points=[shape(u,t,l)for l in[0,1]for u,t in params];faces=[];roles=[];foot_points=[]
 def face(ids,role=0):faces.append(tuple(ids));roles.append(role)
 def wall(a,b):
  chain=[[a,b]]
  for q in[.10,.50,.90]:
   ids=[]
   for v in[a,b]:ids.append(len(points));points.append(points[v].lerp(points[v+off],q))
   chain.append(ids)
  chain.append([a+off,b+off])
  if buried and a<=cols and b<=cols:
   for pair in chain:foot_points.extend(points[v].copy()for v in pair)
  for k,(one,two)in enumerate(zip(chain,chain[1:])):face((one[0],two[0],two[1],one[1]),1 if k in[0,3]else 2)
 for j in range(rows):
  for i in range(cols):
   if removed(j,i):continue
   a=j*stride+i;b=a+1;d=a+stride;c=d+1
   face((a,d,c,b));face((a+off,b+off,c+off,d+off))
   if j==0 or removed(j-1,i):wall(a,b)
   if j==rows-1 or removed(j+1,i):wall(c,d)
   if i==0 or removed(j,i-1):wall(d,a)
   if i==cols-1 or removed(j,i+1):wall(b,c)
 obj=raw(name,points,faces,roles)
 if buried:TOE_POINTS[name+' / complete spreading foot']={'node':name,'points':foot_points}
 return obj

# Projected source-frame.right is IMAGE LEFT at the native course3 camera.
# NEGATIVE authored lateral is the opened/stepped-back IMAGE RIGHT shoulder.
plate('Original / main leached costal load plate',
 [at(1650,110,45),at(1740,140,90),at(1860,165,88),at(2010,175,55),at(2180,155,-70)],
 [30,43,32,44,57],[19,28,22,30,35],48,True)
cortical_fan('Original / stepped back asymmetric scapular load plate',1980,-250,-135,300,175,72,60,True)
plate('Original / unequal upper costal fork and rejoining lamina',
 [at(1740,140,85),at(1810,140,170),at(1910,155,190),at(2030,175,60)],
 [30,23,20,40],[21,18,17,30],40)
cortical_fan('Original / exposed branching scapular ridge',1780,-130,-18,154,108,60,54)
plate('Original / oblique occipital load plate behind bright exit',
 [at(1735,115,28),at(1770,75,82),at(1800,-5,102),at(1850,-145,33)],
 [28,20,19,38],[22,16,16,29],36)
plate('Original / deeper uneven fork seen through first gallery',
 [at(1795,-5,102),at(1850,35,152),at(1930,100,128),at(2010,175,55)],
 [19,18,24,40],[16,16,19,29],36)
plate('Original / lower unequal costal root returning to sediment',
 [at(1910,170,75),at(2000,180,-10),at(2120,175,-100)],
 [34,43,60],[25,28,38],28,True)

# One low mineral collar at the asymmetric shoulder; exact rendered dunes are
# its sole ground owner. This is new original geometry, not a copied terrain.
soil_points=[];soil_faces=[];rows=28
for layer in[0,1]:
 for j in range(rows+1):
  s=1720+(2190-1720)*j/rows;t=j/rows
  for k in range(5):
   x=-85-k*50;v=at(s,x,-60);v.y=ground(v.x,v.z)-18 if layer==0 else ground(v.x,v.z)+34*math.sin(k/4*math.pi)*math.sin(t*math.pi)**.7-6;soil_points.append(v)
soff=(rows+1)*5
for j in range(rows):
 for i in range(4):
  a=j*5+i;b=a+1;d=a+5;c=d+1;soil_faces.extend([(a,b,c,d),(a+soff,d+soff,c+soff,b+soff)])
for j in range(rows):
 for i in[0,4]:a=j*5+i;b=a+5;soil_faces.append((a,b,b+soff,a+soff))
for j in[0,rows]:
 for i in range(4):a=j*5+i;b=a+1;soil_faces.append((a,a+soff,b+soff,b))
TOE_POINTS['sediment / complete bottom footprint']={'node':'ossuary_sediment','points':soil_points[:soff]}
TOE_POINTS['sediment / complete top perimeter']={'node':'ossuary_sediment','points':[soil_points[soff+j*5+i]for j in range(rows+1)for i in range(5)if j in[0,rows]or i in[0,4]]}
soil_obj=raw('ossuary_sediment',soil_points,soil_faces);soil_obj.data.materials.clear();soil_obj.data.materials.append(soil);soil_obj['ossuarySediment']=True

# The retained structure receives ONE deterministic, restrained broad cavity
# bake. This changes only COLOR_0, never any point/index/normal or material role.
bake_vertices=[];bake_faces=[]
for obj in sourcecol.objects:
 if obj.type!='MESH' or obj.name=='ossuary_sediment':continue
 off=len(bake_vertices);bake_vertices.extend(v.co.copy()for v in obj.data.vertices);bake_faces.extend(tuple(off+i for i in poly.vertices)for poly in obj.data.polygons)
off=len(bake_vertices);bake_vertices.extend(sv);bake_faces.extend(tuple(off+i for i in face)for face in sf)
bake_tree=BVHTree.FromPolygons(bake_vertices,bake_faces,all_triangles=False)
hemisphere=[]
for i in range(12):
 radius=math.sqrt((i+.5)/12);angle=i*math.pi*(3-math.sqrt(5));hemisphere.append((radius*math.cos(angle),radius*math.sin(angle),math.sqrt(1-radius*radius)))
bake_values=[];bake_rays=0
def cavity_values(obj):
 global bake_rays
 if obj.name=='ossuary_sediment':return [1.0]*len(obj.data.vertices)
 values=[]
 for v in obj.data.vertices:
  normal=v.normal.normalized();tangent=normal.cross(Vector((0,0,1)))
  if tangent.length_squared<.01:tangent=normal.cross(Vector((0,1,0)))
  tangent.normalize();across=normal.cross(tangent).normalized();obscured=0
  for x,y,z in hemisphere:
   hit,_,_,distance=bake_tree.ray_cast(v.co+normal*.25,tangent*x+across*y+normal*z,72)
   if hit is not None:obscured+=max(0,1-(distance/72)**2)
   bake_rays+=1
  values.append(max(.76,min(1,1-.24*obscured/12)))
 neighbours=[set()for v in obj.data.vertices]
 for edge in obj.data.edges:
  a,b=edge.vertices;neighbours[a].add(b);neighbours[b].add(a)
 for _ in range(2):values=[.65*v+.35*sum(values[j]for j in neighbours[i])/len(neighbours[i])if neighbours[i]else v for i,v in enumerate(values)]
 bake_values.extend(values);return values
root=bpy.data.objects.new('ossuary_cranio_thoracic',None);exportcol.objects.link(root)
root['coordinates']='Identity GAME WORLD metres; +Y up; +Z forward; no runtime pose or deformation'
root['stage']='Retained connected anatomy; one restrained geometry-derived cavity vertex-colour bake'
export_objects=[];geometry=[];triangles=0;closed=[]
for o in list(sourcecol.objects):
 if o.type!='MESH':continue
 o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
 bm=bmesh.new();bm.from_mesh(o.data);boundary=sum(e.is_boundary for e in bm.edges);bad=sum(not e.is_manifold for e in bm.edges);volume=bm.calc_volume(signed=True);bm.free()
 if boundary or bad:raise RuntimeError('Open source component '+o.name+': '+str((boundary,bad)))
 closed.append({'name':o.name,'boundaryEdges':boundary,'nonmanifoldEdges':bad,'signedVolume':volume})
 colours=o.data.color_attributes.new(name='Cortical_shelter',type='FLOAT_COLOR',domain='CORNER');visibility=cavity_values(o)
 for p in o.data.polygons:
  for li in p.loop_indices:
   shade=visibility[o.data.loops[li].vertex_index];colours.data[li].color=(shade,shade,shade,1)
 o.data.color_attributes.active_color=colours
 o.parent=root;export_objects.append(o);geometry.append(o)
for item in contacts:
 e=bpy.data.objects.new(item['name'],None);exportcol.objects.link(e);e.parent=root;e.location=C(item['point']);export_objects.append(e)

# Complete actual-road protected-volume guard. BVH nearest-range is merely a
# broad phase; candidates use exact triangle-vs-oriented-box SAT afterward.
vertices=[];faces=[]
for o in geometry:
 off=len(vertices);vertices.extend(v.co.copy()for v in o.data.vertices);faces.extend(tuple(off+i for i in tri.vertices)for tri in o.data.loop_triangles)
body_tree=BVHTree.FromPolygons(vertices,faces,all_triangles=True)
def overlaps(a,b,c):
 centre=Vector((0,19.5,0));half=Vector((29,20.5,8));p=[a-centre,b-centre,c-centre];edges=[p[1]-p[0],p[2]-p[1],p[0]-p[2]];axes=[Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)),edges[0].cross(edges[1])]
 axes.extend(e.cross(axis)for e in edges for axis in[Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1))])
 for axis in axes:
  if axis.length_squared<1e-15:continue
  q=[v.dot(axis)for v in p];r=sum(abs(axis[i])*half[i]for i in range(3))
  if min(q)>r or max(q)<-r:return False
 return True
checks=0;blockers=[]
for f in F:
 origin=Vector(f['position']);r,u,t=Vector(f['right']),Vector(f['up']),Vector(f['tangent']);seen=set()
 for _,_,index,_ in body_tree.find_nearest_range(C(origin+u*19.5),46):
  if index in seen:continue
  seen.add(index);local=[]
  for i in faces[index]:
   delta=Vector(W(vertices[i]))-origin;local.append(Vector((delta.dot(r),delta.dot(u),delta.dot(t))))
  checks+=1
  if overlaps(*local):blockers.append({'s':f['s'],'triangle':index})
 if len(blockers)>12:break
if blockers:raise RuntimeError('Actual protected volume blockers: '+json.dumps(blockers))
def inside_closed(tree,point):
 direction=Vector((.137,.883,.449)).normalized();origin=point.copy();crossings=0
 for _ in range(128):
  hit,_,_,distance=tree.ray_cast(origin,direction,20000)
  if hit is None:return crossings%2==1
  crossings+=1;origin=hit+direction*.001
 raise RuntimeError('Unexpected excessive closed-volume intersections')
component_trees=[]
for obj in geometry:
 vv=[v.co.copy()for v in obj.data.vertices];ff=[tuple(p.vertices)for p in obj.data.polygons]
 component_trees.append((obj.name,BVHTree.FromPolygons(vv,ff,all_triangles=False),Vector(tuple(min(v[k]for v in vv)for k in range(3))),Vector(tuple(max(v[k]for v in vv)for k in range(3)))))
volume_checks=0
for f in F:
 centre=C(Vector(f['position'])+Vector(f['up'])*19.5)
 for name,tree,lo,hi in component_trees:
  if not all(lo[k]<=centre[k]<=hi[k]for k in range(3)):continue
  volume_checks+=1
  if inside_closed(tree,centre):raise RuntimeError('Protected volume enclosed in solid anatomy: '+name+' at '+str(f['s']))
cc=C(Vector(F[len(F)//3]['position'])+Vector(F[len(F)//3]['up'])*19.5)
vv=[cc+Vector((x,y,z))for x,y,z in[(-80,-80,-80),(-80,-80,80),(-80,80,80),(-80,80,-80),(80,-80,-80),(80,80,-80),(80,80,80),(80,-80,80)]]
control=BVHTree.FromPolygons(vv,[(0,1,2,3),(4,5,6,7),(0,4,7,1),(3,2,6,5),(0,3,5,4),(1,7,6,2)],all_triangles=False)
if not inside_closed(control,cc)or control.find_nearest_range(cc,46):raise RuntimeError('Enclosed-solid negative control failed')

if triangles>60000:raise RuntimeError('Substantive anatomy budget exceeded: '+str(triangles))
HERE.mkdir(parents=True,exist_ok=True);OUT.parent.mkdir(parents=True,exist_ok=True)
refcol.hide_render=True
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for o in export_objects:o.select_set(True)
bpy.context.view_layer.objects.active=geometry[0]
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_vertex_color='ACTIVE',export_animations=False,export_cameras=False,export_lights=False)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
# Reproducible final-export proof: retain actual accessor indices rather than
# confusing a guide query point with new geometry attachment/ground contact.
def exported_regions():
 data=OUT.read_bytes();json_size=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+json_size]);binary=20+json_size+8;records={}
 for node in doc['nodes']:
  if 'mesh' not in node:continue
  rows=[]
  for pi,primitive in enumerate(doc['meshes'][node['mesh']]['primitives']):
   ai=primitive['attributes']['POSITION'];a=doc['accessors'][ai];v=doc['bufferViews'][a['bufferView']];start=binary+v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',12);pp=[Vector(struct.unpack_from('<3f',data,start+i*stride))for i in range(a['count'])]
   h=hashlib.sha256(b''.join(struct.pack('<3f',*p)for p in pp)).hexdigest()
   for i,p in enumerate(pp):rows.append({'point':p,'primitive':pi,'accessor':ai,'index':i,'positionSha256':h})
  records[node['name']]=rows
 def unique(rows):
  out={}
  for row in rows:
   key=tuple(round(v,5)for v in row['point'])
   if key not in out:out[key]={'point':row['point'],'refs':[]}
   out[key]['refs'].append(row)
  return list(out.values())
 def refs(selected):
  out={}
  for row in selected:
   for r in row['refs']:
    key=(r['primitive'],r['accessor'],r['positionSha256']);out.setdefault(key,set()).add(r['index'])
  return [{'primitive':k[0],'positionAccessor':k[1],'positionSha256':k[2],'vertexIndices':sorted(v)}for k,v in sorted(out.items())]
 grounding=[]
 for name,region in TOE_POINTS.items():
  actual=unique(records[region['node']]);lookup={}
  for row in actual:
   key=tuple(math.floor(v/.01)for v in row['point']);lookup.setdefault(key,[]).append(row)
  expected={tuple(round(v,5)for v in p):p for p in region['points']};matched={};error=0
  for point in expected.values():
   key=tuple(math.floor(v/.01)for v in point);near=[r for x in[-1,0,1]for y in[-1,0,1]for z in[-1,0,1]for r in lookup.get((key[0]+x,key[1]+y,key[2]+z),[])];row=min(near,key=lambda r:(r['point']-point).length_squared)if near else None
   if row is None or(row['point']-point).length>.003:raise RuntimeError('Final exported toe mismatch: '+name)
   error=max(error,(row['point']-point).length);matched[tuple(round(v,5)for v in row['point'])]=row
  selected=list(matched.values());depth=[ground(r['point'].x,r['point'].z)-r['point'].y for r in selected]
  if min(depth)<=0:raise RuntimeError('Unburied exported toe: '+name)
  grounding.append({'name':name,'node':region['node'],'expectedSourceFootPoints':len(expected),'uniqueMatchedExportedPoints':len(selected),'maximumMatchingErrorMetres':error,'minimumBurialMetres':min(depth),'maximumBurialMetres':max(depth),'allPointsBuried':True,'primitiveRegions':refs(selected)})
 direction_vectors=[Vector((.013,1,.007)).normalized(),Vector((1,.117,.203)).normalized(),Vector((.223,.017,1)).normalized()]
 def in_skull(p,d):
  origin=C(p);direction=C(d);count=0
  for _ in range(128):
   hit,_,_,_=skull_tree.ray_cast(origin,direction,20000)
   if hit is None:return count%2==1
   count+=1;origin=hit+direction*.001
  raise RuntimeError('Excessive source skull parity crossings')
 attachment=[]
 for c in contacts:
  side=-1 if c['name'].endswith('_-1')else 1;name='Original / broad seated far-cheek cortical fan '+str(side);near=[r for r in unique(records[name])if(r['point']-Vector(c['point'])).length<45];contained=[r for r in near if all(in_skull(r['point'],d)for d in direction_vectors)]
  if len(contained)<5:raise RuntimeError('Actual exported fan lacks skull-volume attachment: '+name)
  attachment.append({'name':c['name'],'node':name,'measuredSourceFace':c['sourceFace'],'measuredSourceFacePoint':c['point'],'testedNearContactVertices':len(near),'actualContainedUniqueVertices':len(contained),'parityDirections':[list(d)for d in direction_vectors],'allThreeDirectionsAgree':True,'primitiveRegions':refs(contained)})
 return {'assetSha256':sha(OUT),'method':'Actual exported POSITION accessor indices, three-direction canonical skull volume parity, exact rendered dune triangle interpolation; no bounds-centre contact approximation.','contactRegions':attachment,'groundingRegions':grounding}
actual_export_proof=exported_regions()

points=[W(v.co)for o in geometry for v in o.data.vertices]
semantic={k:G[k]for k in['track','protectedEnvelope','road','terrain','fossils','context','cameras']}
manifest={'id':'ossuary-cranio-thoracic-v1','root':'ossuary_cranio_thoracic','stage':'Retained anatomy with one restrained geometry-derived cavity vertex-colour bake','coordinates':'Identity actual game-world metres,+Y up,+Z forward','source':{'file':str(Path(__file__).relative_to(GAME)),'sha256':sha(Path(__file__))},'blend':{'file':str(BLEND.relative_to(GAME)),'sha256':sha(BLEND)},'runtimeAsset':{'file':str(OUT.relative_to(GAME)),'sha256':sha(OUT),'bytes':OUT.stat().st_size},'guide':{'coordinateContract':'Explicit editor-only guide input; regenerated at any temporary path, never a runtime dependency','semanticGeometrySha256':hashlib.sha256(json.dumps(semantic,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'rebuildHelper':'assets/levels/eliminator-saffron/export-authoring-guides.mjs','inputFileHashesAtGeneration':G['inputs'],'viewSource':'assets/levels/eliminator-saffron/authoring-views.json','semanticViewsSha256':hashlib.sha256(json.dumps(G['cameras'],sort_keys=True,separators=(',',':')).encode()).hexdigest()},'geometry':{'triangles':triangles,'bounds':{'min':[min(p[k]for p in points)for k in range(3)],'max':[max(p[k]for p in points)for k in range(3)]},'materialRoles':ROLES,'closedSourceComponents':closed,'sourceContacts':contacts,'actualExportContactAndGrounding':actual_export_proof,'allRouteFrames':len(F),'actualTriangleSATChecks':checks,'blockers':0,'runtimeReferenceMeshes':0,'solidOccupancyGuard':{'componentFrameCentreChecks':volume_checks,'enclosedCentres':0,'enclosed160mSolidBlockNegativeControlRejected':True},'cavityBake':{'samplesPerVertex':12,'radiusMetres':72,'selfOffsetMetres':.25,'connectedSmoothingPasses':2,'rays':bake_rays,'minimum':min(bake_values),'maximum':max(bake_values),'mean':sum(bake_values)/len(bake_values),'rangeContract':[.76,1],'occluders':'Actual retained new closed anatomy plus canonical fitted skull; old competing web excluded'}},'reference':{'file':'assets/levels/saffron/scene-reference.png','sha256':sha(GAME/'assets/levels/saffron/scene-reference.png'),'promptProvenance':'assets/levels/saffron/PROVENANCE.md','promptProvenanceSha256':sha(GAME/'assets/levels/saffron/PROVENANCE.md')},'rights':'Original project-authored anatomy/mineral collar, source concept and material roles project-owned. Canonical geometry only editor guide, never shipped in this asset.'}
manifest['geometry']['actualExportContactAndGrounding']['guideSemanticGeometrySha256']=manifest['guide']['semanticGeometrySha256']
(HERE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'runtime':str(OUT),'triangles':triangles,'bounds':manifest['geometry']['bounds'],'contacts':contacts,'SATChecks':checks,'hash':sha(OUT)}))
