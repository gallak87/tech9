"""Shatterline: original deterministic editable Blender environment kit.
Run: blender --background --python assets/levels/shatterline/build_assets.py -- <app-root>
Uses game X lateral / Y up / Z forward; export converts to glTF Y-up.
No downloaded geometry or raster scenery. All materials, fracture faces and details authored here.
"""
import bpy, bmesh, math, random, json, sys
from pathlib import Path
from collections import defaultdict
from mathutils import Vector
ROOT=Path(sys.argv[sys.argv.index('--')+1]).resolve()
SOURCE=ROOT/'assets/levels/shatterline'; PUBLIC=ROOT/'public/assets/levels/shatterline'
PUBLIC.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.name!='Collection': bpy.data.collections.remove(c)
def material(name,c,rough=.7,metal=.0,emission=0):
    m=bpy.data.materials.new('Shatterline / '+name);m.diffuse_color=(*c,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=emission
    m.use_backface_culling=True;return m
M={
'ceramic':material('warm fired ceramic',(.63,.59,.49),.68),
'edge':material('ivory worn arris',(.77,.73,.63),.63),
'graphite':material('recessed graphite cassettes',(.049,.061,.073),.64,.35),
'metal':material('brushed titanium',(.25,.285,.31),.37,.72),
'coil':material('heat stained copper coils',(.27,.17,.095),.47,.67),
'oxide':material('vermilion maintenance paint',(.48,.10,.038),.75,.08),
'light':material('blue-white induction inserts',(.29,.64,.82),.38,.12,1.6),
'amber':material('warm service luminaire',(.95,.49,.15),.44,.0,1.8),
'rock':material('pale limestone',(.64,.605,.525),.96),
'rockLight':material('chalk fracture faces',(.73,.69,.60),.98),
'rockDark':material('limestone deep lamina',(.47,.465,.43),.97),
'rockFacet':material('limestone fresh angular cleavage',(.655,.625,.55),.95),
}
for key in ['rock','rockLight','rockDark','rockFacet']:M[key].use_backface_culling=False
MANIFEST={}; COLLIDERS={}
class Kit:
    def __init__(self,name):
        self.name=name;self.data=defaultdict(lambda:[[],[]]);self.colliders=[]
        self.collection=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(self.collection)
        self.root=bpy.data.objects.new(name,None);self.collection.objects.link(self.root)
        self.root['units']='meters';self.root['coordinateConvention']='game X lateral, Y up, Z forward'
    def mesh(self,vs,fs,mat):
        arr=self.data[mat];n=len(arr[0]);arr[0].extend(vs);arr[1].extend([tuple(n+i for i in f) for f in fs])
    def box(self,c,size,mat='metal',angle=0,solid=False):
        vs=[]
        for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
            xx=x*size[0]/2;yy=y*size[1]/2
            vs.append((c[0]+xx*math.cos(angle)-yy*math.sin(angle),c[1]+xx*math.sin(angle)+yy*math.cos(angle),c[2]+z*size[2]/2))
        fs=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]
        self.mesh(vs,fs,mat)
        if solid:
            for f in fs:self.colliders.extend([[vs[f[0]],vs[f[1]],vs[f[2]]],[vs[f[0]],vs[f[2]],vs[f[3]]]])
    def beam(self,a,b,r,mat='metal',sides=6):
        d=(Vector(b)-Vector(a)).normalized();p=d.cross(Vector((0,0,1)))
        if p.length<.01:p=d.cross(Vector((0,1,0)))
        p.normalize();q=d.cross(p).normalized();vs=[]
        for pt in [a,b]:
            for k in range(sides):
                t=k*math.tau/sides;vs.append(tuple(Vector(pt)+p*(r*math.cos(t))+q*(r*math.sin(t))))
        fs=[tuple(reversed(range(sides))),tuple(range(sides,2*sides))]
        fs.extend([(k,(k+1)%sides,(k+1)%sides+sides,k+sides) for k in range(sides)]);self.mesh(vs,fs,mat)
    def panel(self,c,size,mat='ceramic',chamfer=1.5):
        # A formed sheet has clipped corners and a real return edge, not a decal.
        x,y,z=[n/2 for n in size];k=min(chamfer,x*.35,y*.35)
        outline=[(-x+k,-y),(x-k,-y),(x,-y+k),(x,y-k),(x-k,y),(-x+k,y),(-x,y-k),(-x,-y+k)]
        vs=[(c[0]+xx,c[1]+yy,c[2]+zz) for zz in [-z,z] for xx,yy in outline]
        fs=[tuple(reversed(range(8))),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
        self.mesh(vs,fs,mat)
    def arc(self,r,thick,cy,depth,a,b,mat='ceramic',z=0,solid=False):
        count=max(1,math.ceil(abs(b-a)/.055));vs=[]
        for i in range(count+1):
            t=a+(b-a)*i/count
            for rr,zz in [(r,-depth/2),(r+thick,-depth/2),(r,depth/2),(r+thick,depth/2)]:vs.append((rr*math.cos(t),cy+rr*math.sin(t),z+zz))
        fs=[]
        for i in range(count):
            n=i*4;fs.extend([(n,n+4,n+5,n+1),(n+2,n+3,n+7,n+6),(n,n+2,n+6,n+4),(n+1,n+5,n+7,n+3)])
        fs.extend([(0,1,3,2),(count*4,count*4+2,count*4+3,count*4+1)])
        self.mesh(vs,fs,mat)
        if solid:
            for f in fs:self.colliders.extend([[vs[f[0]],vs[f[1]],vs[f[2]]],[vs[f[0]],vs[f[2]],vs[f[3]]]])
    def finish(self):
        bpy.ops.object.select_all(action='DESELECT');bounds=[];triangles=0
        for key,(vs,fs) in self.data.items():
            mesh=bpy.data.meshes.new(self.name+'_'+key);mesh.from_pydata([(x,-z,y) for x,y,z in vs],[],fs);mesh.update()
            obj=bpy.data.objects.new(self.name+'__'+key,mesh);self.collection.objects.link(obj);obj.parent=self.root;obj.data.materials.append(M[key]);obj['surfaceRole']=key
            bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
            # Per-face mineral / coating variation survives GLB and cheap instancing.
            attr=mesh.color_attributes.new(name='Weathering',type='FLOAT_COLOR',domain='CORNER')
            rng=random.Random(188+sum(map(ord,self.name+key)))
            for poly in mesh.polygons:
                if key.startswith('rock'): poly.use_smooth=key!='rockFacet'
                normal=poly.normal;shade=(.87+rng.random()*.13)*(1-.08*max(0,-normal.z))
                for li in poly.loop_indices:attr.data[li].color=(shade,shade,shade,1)
            mesh.color_attributes.active_color=attr
            obj.select_set(True);bounds.extend(vs);triangles+=len(mesh.polygons)
        self.root.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(PUBLIC/(self.name+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_animations=False,export_vertex_color='ACTIVE')
        MANIFEST[self.name]={'triangles':triangles,'bounds':{'min':[min(v[k] for v in bounds) for k in range(3)],'max':[max(v[k] for v in bounds) for k in range(3)]},'materials':list(self.data)}
        COLLIDERS[self.name]=self.colliders

def crown(name,r,cy,spans):
    a=Kit(name);rng=random.Random(74)
    for lo,hi in spans:
        lo=math.radians(lo);hi=math.radians(hi)
        a.arc(r,28,cy,30,lo-.018,hi+.013,'graphite',solid=True)
        for depthz in [-17,17]:
            a.arc(r+1,4,cy,4,lo,hi,'metal',depthz)
            a.arc(r+23,5,cy,4,lo,hi,'edge',depthz)
        # Discrete heavy protective tiles are separated by deep load joints.
        n=math.ceil((hi-lo)/.125)
        for i in range(n):
            t=lo+(hi-lo)*i/n;end=lo+(hi-lo)*(i+1)/n;mid=(t+end)/2
            # Several lost ceramic skins expose the deeper cassette layers.
            if i%11 not in [5]:
                a.arc(r+8,15,cy,38,t+.009,end-.009,'ceramic')
                a.arc(r+8,15,cy,1.2,t+.013,end-.013,'edge',-20.2)
            else:
                for lam in range(5):a.arc(r+9+lam*2.6,1.4,cy,1.8,t+.016,end-.016,'coil',-17.5)
                a.arc(r+8,15,cy,1,t+.01,t+.025,'metal',-21.)
            a.arc(r+28,4,cy,7,t+.003,end-.003,'graphite',-13)
            a.arc(r+32,3,cy,3,t+.006,end-.006,'metal',-15)
            if i%3==0:
                a.arc(r+2,1.5,cy,1.5,t+.026,end-.026,'light',-20.5)
            if i%4==1:
                for vent in range(4):a.arc(r+11+vent*2.5,1.2,cy,1,t+.027,end-.025,'graphite',-21.1)
            # Broad oxidized exposed-joint foot and unequal maintenance repair plate.
            a.arc(r+7,18,cy,2,t+.001,t+.009,'metal',-21)
            if i%7==2:a.arc(r+10,10,cy,1.4,t+.035,end-.025,'graphite',-21.8)

            a.arc(r+9,2,cy,1.0,t+.023,end-.023,'metal',-21)
            # recessed induction laminations and crisp luminous pins, never bloom tube
            for k in range(3):a.arc(r+.4+k*1.6,.8,cy,22,t+.018,end-.018,'coil')
            if i%3!=1:a.arc(r+.1,1.2,cy,1.7,t+.024,end-.024,'light',-12)
            for radial in [r+10,r+21]:
                for ang in [t+.024,end-.024]:
                    x=math.cos(ang)*radial;y=cy+math.sin(ang)*radial
                    a.box((x,y,-21.0),(1.5,1.5,1.0),'graphite',ang)
            if i%5==0:
                a.arc(r+28,6,cy,10,t+.02,end-.03,'metal')
                a.arc(r+14,7,cy,1.2,t+.02,t+.052,'oxide',-21.7)
        # Exposed torn bars at each broken end create actual fracture depth.
        for end in [lo,hi]:
            for j in range(11):
                rr=r+2+j*2.5;t=end+(rng.random()-.5)*.025
                pt=(rr*math.cos(t),cy+rr*math.sin(t),rng.uniform(-13,13));length=rng.uniform(2,9)
                direction=1 if end==hi else -1
                tip=(pt[0]-math.sin(t)*length*direction,pt[1]+math.cos(t)*length*direction,pt[2]+rng.uniform(-2,2))
                elbow=(pt[0]+(tip[0]-pt[0])*.63,pt[1]+(tip[1]-pt[1])*.61,pt[2]+rng.uniform(-4,4))
                a.beam(pt,elbow,.5 if j%2 else 1.0,'metal' if j%3 else 'coil')
                a.beam(elbow,tip,.45 if j%2 else .85,'metal' if j%3 else 'coil')
            # Jagged alloy tongues are short torn plates staggered through depth.
            for j in range(5):
                rr=r+5+j*4;t=end
                center=(rr*math.cos(t),cy+rr*math.sin(t),-17+j*7)
                tangent=(-math.sin(t),math.cos(t),0)
                radial=(math.cos(t),math.sin(t),0)
                direction=1 if end==hi else -1
                vs=[]
                for dr,dt,dz in [(-2,0,-1),(2,0,-1),(1,7+3*(j%2),0),(-2,4,1)]:vs.append((center[0]+radial[0]*dr+tangent[0]*dt*direction,center[1]+radial[1]*dr+tangent[1]*dt*direction,center[2]+dz))
                a.mesh(vs,[(0,1,2),(0,2,3)],'metal')
    for side in [-1,1]:
        x=side*(r*.85);y=cy-r*.57
        a.box((x,y-46,0),(37,86,46),'ceramic',solid=True)
        a.box((x,y-46,-24),(29,65,2),'graphite')
        a.box((x,y-63,-26),(39,8,3),'oxide')
        for dx in [-11,11]:a.box((x+dx,y-48,-27),(3,83,5),'metal')
        a.box((x,y-90,0),(62,9,64),'edge',solid=True)
    a.finish()
crown('crown-severed',145,92,[(-33,67),(82,236),(250,290)])
crown('crown-broken',112,66,[(-32,15),(108,234),(252,281)])
crown('crown-hero',160,90,[(-36,67),(83,218),(237,289)])
crown('crown-terminal',125,89,[(-37,217),(234,258),(277,300)])

# Side maintenance assembly: 2m railings, visible stair flights, finned transformers.
a=Kit('service-gallery')
a.box((0,-2,0),(31,4,72),'graphite',solid=True)
for x in [-14,14]:
    a.box((x,-5,0),(3,6,72),'metal')
    for z in range(-32,36,8):
        a.box((x,1.25,z),(.4,2.5,.4),'oxide')
    a.box((x,2.4,0),(.55,.45,72),'oxide')
for z in range(-29,30,13):
    a.box((-5,3.2,z),(9,6.4,8),'ceramic',solid=True)
    a.box((-5,3.2,z-4.1),(7,4.6,.5),'graphite')
    for x in range(-8,-1):a.box((x,3.2,z-4.5),(.32,4.4,.5),'metal')
    a.box((-5,6.7,z),(10,1,9),'edge')
    a.box((4,.3,z),(6,.35,7),'edge')
for z in [-24,24]:
    a.beam((-12,-5,z),(-6,-31,z),2,'metal');a.beam((12,-5,z),(-6,-31,z),2,'metal')
    a.box((-6,-34,z),(12,8,11),'ceramic',solid=True)
    a.box((12,5,z),(1,6,1),'metal');a.box((12,8,z),(3,.5,3),'amber')
for i in range(18):a.box((9,.25-i*.55,30+i*1.15),(7,.5,1.2),'metal')
a.finish()
a=Kit('load-foundation')
a.box((0,-83,0),(31,158,38),'ceramic',solid=True)
for x in [-17,17]:
    a.box((x,-83,0),(5,158,42),'metal')
    a.box((x,-24,-23),(7,18,5),'oxide')
for y in [-18,-66,-118]:
    a.box((0,y,-21),(23,28,3),'graphite')
    a.box((0,y-16,-24),(40,4,14),'metal')
    for x in [-14,14]:a.beam((x,y-18,-25),(-x,y+18,-25),1.5,'metal')
a.box((0,-164,0),(72,13,88),'edge',solid=True)
a.box((0,-7,0),(56,12,55),'graphite',solid=True)
a.box((0,-.5,0),(66,3,64),'graphite',solid=True)
for x in [-29,29]:a.box((x,1,0),(8,3,64),'edge')
for z in [-28,28]:a.box((0,1,z),(50,3,8),'ceramic')
for x in [-17,17]:
    a.box((x,1.2,0),(9,1.4,44),'metal')
    for z in range(-18,20,4):a.box((x,2.2,z),(10,.9,1.2),'graphite')
a.box((0,0,0),(15,1,43),'ceramic')
for z in [-19,0,19]:a.box((0,1,z),(16,1,1.6),'metal')
a.box((22,2.5,-18),(5,1.5,16),'oxide')
a.finish()
a=Kit('service-shelter')
# Clear physical inner width 94 m and ceiling 44 m, including chase camera.
for x in [-54,54]:
    a.box((x,16,0),(13,58,84),'ceramic',solid=True)
    a.box((x,9,-45),(15,38,8),'graphite')
    for z in [-32,-10,12,34]:
        a.box((x,15,z),(17,61,3),'metal')
        a.box((x-(6 if x>0 else -6),17,z),(1,3,5),'amber')
    a.box((x,36,-44),(17,7,2),'oxide')
a.box((0,49,0),(122,10,87),'graphite',solid=True)
for z in [-34,-12,10,32]:
    a.box((0,43,z),(116,4,3),'metal')
    a.box((0,54,z),(122,1,16),'edge')
    for x in [-38,38]:a.beam((x,44,z),(math.copysign(51,x),30,z),2,'metal')
a.finish()
a=Kit('receiving-tower')
a.box((0,58,0),(34,134,39),'ceramic',solid=True)
a.box((0,62,-21),(23,120,4),'graphite')
for y in range(5,119,8):
    a.box((0,y,-24),(24,1.5,3),'metal')
for x in [-20,20]:a.box((x,60,0),(5,132,45),'metal')
a.box((0,110,-25),(31,6,2),'oxide');a.box((0,128,0),(50,7,56),'edge')
for x in [-12,12]:a.box((x,135,0),(4,11,4),'light')
a.box((0,-9,0),(72,12,80),'graphite',solid=True)
a.finish()

a=Kit('fractured-cassette')
a.box((0,0,0),(28,13,35),'graphite',solid=True)
a.box((-7,7,0),(12,3,37),'ceramic',angle=.07)
a.box((9,7,-4),(11,3,29),'edge',angle=-.1)
for x in range(-10,13,4):
    a.box((x,1,-18),(2,8,3),'coil')
    a.beam((x,5,-15),(x+2,12,-23),.7,'metal')
a.box((9,9,-7),(7,1,12),'oxide')
a.finish()

# Coherent geological volumes: irregular asymmetric erosion over broad sedimentary
# masses. No polar rings, repeated block shelves or radial umbrella profiles.
from mathutils import noise as bnoise

def fbm(x,z,seed=0):
    return sum(bnoise.noise_vector(Vector((x*f,z*f,seed+3.17)))[0]*amp for f,amp in [(1,.59),(2.09,.26),(4.33,.105),(9.1,.045)])

def make_mass(name,seed,width,length,height):
    a=Kit(name);nx=44;nz=76;vertices=[];edge=[]
    # Broad, fractured sedimentary escarpment. Crest persists along most of the
    # mass so overlapping districts read as a mountain face, not isolated cones.
    rng=random.Random(seed*479+11)
    # Unequal, angular ridge blocks with deep passes prevent a single extruded
    # crest. End slopes fall beneath surrounding terrain, hiding the source ends.
    ridge=[(0,0),(.075,.25)]
    for i,h in enumerate([.81,.58,.98,.54,.88,.69,1.0,.45,.76]):
        ridge.append((.15+i*.079+rng.uniform(-.018,.018),h*rng.uniform(.91,1.05)))
    ridge.extend([(.92,.28),(1,0)]);ridge.sort()
    gullies=[(.245+rng.uniform(-.02,.02),.046),(.515+rng.uniform(-.025,.025),.055),(.785+rng.uniform(-.02,.02),.042)]
    def cut(v):return max(max(0,1-abs(v-center)/width)**1.3 for center,width in gullies)
    def crest(v):
        for i in range(len(ridge)-1):
            lo,h0=ridge[i];hi,h1=ridge[i+1]
            if lo<=v<=hi:
                t=(v-lo)/(hi-lo)
                return -285+height*(h0+(h1-h0)*t)-height*.22*cut(v)+fbm(v*19,3,seed)*height*.025
        return -285
    def frontx(v):return 39*math.sin(v*7+seed)+67*fbm(v*9,1,seed+5)+cut(v)*240
    for i in range(nx+1):
        u=i/nx
        for j in range(nz+1):
            v=j/nz;z=(v-.5)*length
            x=frontx(v)+u*width
            # Wide broken top planes, a secondary spine and long descending lee.
            top=crest(v)
            y=top+(height*.10)*math.sin(min(1,u/.23)*math.pi*.75)-height*.57*u**1.2
            y+=fbm(u*4,v*8,seed)*height*.075+fbm(u*15,v*19,seed+8)*12
            y-=cut(v+u*.075)*height*.17+28*max(0,math.sin(v*32+u*5+seed))**4
            vertices.append((x,y,z))
    faces=[]
    for i in range(nx):
        for j in range(nz):
            k=i*(nz+1)+j;n=k+nz+1;faces.extend([(k,n,k+1),(k+1,n,n+1)])
    a.mesh(vertices,faces,'rock')
    # Deep irregular buttresses and diagonally bedded erosion are actual relief.
    # Medium angular ridges cast shadows across broad planes at race-view scales.
    front=[];layers=42
    for k in range(layers+1):
        t=k/layers
        for j in range(nz+1):
            v=j/nz;top=vertices[j];z=top[2];y=-350+(top[1]+350)*t
            buttress=1-abs(2*((v*5.7+seed*.071)%1)-1)
            gully=cut(v+(t-.5)*.024)
            bed=(y+z*.19)/39
            ledge=(2*((bed/math.tau)%1)-1)*14+max(0,math.sin(bed*1.03+.7))**6*23
            x=top[0]-110*(1-t)-100*buttress*math.sin(t*math.pi)+gully*110*math.sin(t*math.pi)+ledge*math.sin(t*math.pi)
            x+=fbm(v*18,t*11,seed+7)*14*math.sin(t*math.pi)
            front.append((x,y,z))
    for k in range(layers):
        for j in range(nz):
            n=k*(nz+1)+j;q=n+nz+1
            avg=(front[n][1]+front[q+1][1])*.5+(front[n][2]+front[q+1][2])*.095
            band=math.sin(avg/78+seed)
            mat='rockDark' if band<-.70 else 'rockLight' if band>.85 else 'rock'
            a.mesh([front[n],front[n+1],front[q],front[q+1]],[(0,1,2),(1,3,2)],mat)
    # Interlocking cleavage slabs share the diagonal bedding direction. They
    # project from the parent face with irregular five-sided fracture silhouettes,
    # never regular boxes or evenly stacked ledges.
    for n in range(19):
        v=.13+(n*.173)% .73
        if cut(v)>.48:continue
        j=min(nz-1,max(1,round(v*nz)));z=(v-.5)*length
        t=.29+(n*.217)% .53;y=-350+(vertices[j][1]+350)*t
        if y<-125:continue
        k=min(layers-1,round(t*layers));base=front[k*(nz+1)+j][0]
        span=length*(.045+.029*((n*7)%5)/4);thick=44+((n*13)%5)*11
        face=[]
        for dz,dy,dx in [(-.54,-.35,4),(.13,-.62,-11),(.55,-.17,2),(.36,.54,-7),(-.44,.43,8)]:
            zz=z+span*dz;yy=y+thick*dy-(zz-z)*.19
            face.append((base-22+dx+dz*17,yy,zz))
        backface=[(x+80+thick*.4,yy,zz) for x,yy,zz in face]
        vs=face+backface;fs=[(0,1,2,3,4),(9,8,7,6,5)]
        fs.extend([(i,(i+1)%5,(i+1)%5+5,i+5) for i in range(5)])
        a.mesh(vs,fs,'rockFacet')
    # Connected talus apron, broad enough to bind the face into the mountainside.
    apron=[];steps=11
    for k in range(steps+1):
        u=k/steps
        for j in range(nz+1):
            v=j/nz;z=(v-.5)*length;x=frontx(v)-110-u*250
            y=-90-170*u+50*fbm(v*11,u*7,seed+31)+26*math.sin(v*28+seed)*(1-u)
            apron.append((x,y,z))
    fs=[]
    for k in range(steps):
        for j in range(nz):
            n=k*(nz+1)+j;q=n+nz+1;fs.extend([(n,n+1,q),(n+1,q+1,q)])
    a.mesh(apron,fs,'rockDark')
    for side in [0,nz]:
        edge=[vertices[i*(nz+1)+side] for i in range(nx+1)]
        for i in range(nx):
            v1=edge[i];v2=edge[i+1];a.mesh([v1,v2,(v2[0],-350,v2[2]),(v1[0],-350,v1[2])],[(0,1,2,3)],'rock')
    back=[vertices[nx*(nz+1)+j] for j in range(nz+1)]
    for j in range(nz):
        v1=back[j];v2=back[j+1];a.mesh([v1,v2,(v2[0],-350,v2[2]),(v1[0],-350,v1[2])],[(0,1,2,3)],'rock')
    a.finish()
make_mass('geology-bedded-ridge',3,1150,1600,880)
make_mass('geology-eroded-bluff',11,880,1260,770)

def make_mountain_range():
    """A closed, branching mountain massif; no extruded crest or vertical ends."""
    a=Kit('geology-distant-range');nx=88;nz=112;width=3100;length=4600
    # Independently oriented ridges share saddles and form broad, unequal spurs.
    # The secondary branches meet below the main summits instead of producing a
    # repeated row of cones. Coordinates are normalized across the full footprint.
    ridges=[
        [(-.77,-.72,.10),(-.46,-.42,.72),(-.19,-.18,1.0),(.12,.17,.40),(.32,.39,.91),(.67,.69,.12)],
        [(-.84,.50,.05),(-.53,.34,.59),(-.24,.08,.70),(-.19,-.18,1.0),(.28,-.48,.52),(.69,-.72,.03)],
        [(.32,.39,.91),(.64,.06,.63),(.86,-.16,.04)],
        [(-.53,.34,.59),(-.33,.72,.20),(-.22,.91,.01)],
        [(-.46,-.42,.72),(-.78,-.13,.16),(-.93,.02,.01)],
    ]
    def ridged(u,v):
        best=0
        for ri,path in enumerate(ridges):
            for j in range(len(path)-1):
                x0,z0,h0=path[j];x1,z1,h1=path[j+1]
                dx=x1-x0;dz=z1-z0;den=dx*dx+dz*dz
                t=max(0,min(1,((u-x0)*dx+(v-z0)*dz)/den))
                distance=math.hypot(u-x0-dx*t,v-z0-dz*t)
                width=.26+ri*.015
                shoulder=max(0,1-distance/width)
                spine=(h0+(h1-h0)*t)*shoulder**1.13
                best=max(best,spine)
        return best
    vertices=[]
    for i in range(nx+1):
        u=i/nx*2-1
        for j in range(nz+1):
            v=j/nz*2-1;x=(u+.66)*width*.5;z=v*length*.5
            # Broad fracture trenches run across the slopes, with smaller
            # angular rock planes on their shoulders, never shelf-sized ribbons.
            warp=fbm(u*2.7,v*3.1,72)
            ridge=ridged(u+warp*.045,v+warp*.032)
            foothill=max(0,1-(abs(u)**3+abs(v)**3))**.75
            y=-610+ridge*2110+foothill*210
            drainage=abs(math.sin(v*15.7+u*7.1+fbm(u*4,v*5,91)*1.5))
            trench=max(0,1-drainage*3.7)**1.1*230
            y-=trench*max(0,min(1,ridge*3))
            y+=fbm(u*6,v*8,55)*125+abs(fbm(u*17,v*19,31))*52
            # The whole perimeter dives into a buried skirt. There are no tall
            # closing faces that could read as the cut end of a modular wall.
            edge=max(abs(u),abs(v));bury=max(0,(edge-.82)/.18)
            y=y*(1-bury)+(-1180)*bury
            vertices.append((x,y,z))
    faces=[]
    for i in range(nx):
        for j in range(nz):
            k=i*(nz+1)+j;n=k+nz+1
            if (i+j)%2:faces.extend([(k,n,n+1),(k,n+1,k+1)])
            else:faces.extend([(k,n,k+1),(k+1,n,n+1)])
    a.mesh(vertices,faces,'rock')
    # A buried floor closes the authored volume without visible vertical rims.
    perimeter=[vertices[j] for j in range(nz+1)]+[vertices[i*(nz+1)+nz] for i in range(1,nx+1)]+[vertices[nx*(nz+1)+j] for j in range(nz-1,-1,-1)]+[vertices[i*(nz+1)] for i in range(nx-1,0,-1)]
    centre=(width*.33,-1190,0)
    for i in range(len(perimeter)):a.mesh([centre,perimeter[(i+1)%len(perimeter)],perimeter[i]],[(0,1,2)],'rockDark')
    a.finish()

make_mountain_range()

# Receiving campus uses continuous galleries and deep process halls tied to a
# single excavated site, with one distinct command structure, never tower scatter.
a=Kit('receiver-process-hall')
a.box((0,20,0),(106,48,180),'graphite',solid=True)
for x in [-54,54]:
    a.box((x,19,0),(8,54,184),'ceramic',solid=True)
    for z in range(-78,80,26):
        a.box((x,22,z),(11,61,4),'metal')
        a.box((x,48,z),(13,4,18),'edge')
    side=1 if x>0 else -1
    for z in [-65,-13,39,65]:
        a.box((x+side*5,23,z),(3,33,20),'graphite')
        a.box((x+side*7,8,z),(3,3,24),'edge')
        for yy in [15,23,31]:a.box((x+side*8,yy,z),(4,2,17),'metal')
for z in [-92,92]:
    a.box((0,22,z),(104,49,5),'ceramic')
    a.box((0,20,z*1.04),(77,31,3),'graphite')
    for x in [-31,0,31]:a.box((x,20,z*1.06),(3,33,3),'metal')
    a.box((0,36,z*1.07),(76,1.2,2),'amber')
    for x in [-42,42]:
        a.panel((x,22,z*1.045),(15,40,3),'edge')
        a.box((x,10,z*1.07),(8,7,1.4),'oxide')
for z in range(-72,74,18):
    a.box((0,47,z),(102,5,14),'edge')
    a.box((0,51,z),(75,2.5,8),'graphite')
    for x in range(-32,33,8):a.box((x,53,z),(3,2,9),'metal')
a.box((0,-9,0),(130,14,204),'ceramic',solid=True)
a.box((0,3,-103),(80,3,17),'metal')
for x,z in [(-35,-45),(34,27)]:
    a.box((x,59,z),(26,12,38),'graphite')
    a.box((x,68,z),(29,5,43),'ceramic')
    for zz in [-12,0,12]:
        a.box((x,72,z+zz),(21,3,5),'metal')
    a.beam((x,58,z-19),(x,58,z-44),3,'metal',10)
a.finish()
a=Kit('receiver-command')
a.box((0,30,0),(142,68,100),'ceramic',solid=True)
a.box((0,17,-54),(115,26,5),'graphite')
for x in range(-51,52,17):a.box((x,17,-58),(2,27,4),'metal')
a.box((0,53,0),(158,9,117),'graphite')
a.box((0,66,0),(115,15,78),'ceramic')
a.box((0,71,-42),(98,8,4),'light')
a.box((0,79,0),(140,5,105),'edge')
a.box((0,91,14),(74,23,46),'graphite',solid=True)
for x in [-43,43]:
    a.box((x,92,14),(8,36,55),'ceramic')
    for z in [-6,5,16,27,38]:a.box((x,114,z),(14,4,6),'metal')
a.box((0,106,14),(94,7,61),'edge')
a.box((-35,18,-62),(41,7,4),'oxide')
a.box((0,-10,0),(180,20,139),'graphite',solid=True)
a.finish()

# Monumental receiver housing: an asymmetric deep intake, load-bearing ceramic
# jaws, recessed machinery, split stepped roof and an attached lower process wing.
a=Kit('receiver-primary')
a.box((0,52,20),(218,139,300),'graphite',solid=True)
for x in [-118,118]:
    a.box((x,78,-3),(28,198,345),'ceramic',solid=True)
    a.box((x,92,-180),(37,179,16),'edge')
    a.box((x,24,-191),(28,32,7),'oxide')
    for z in range(-146,162,44):
        a.box((x,70,z),(38,164,9),'metal')
        a.box((x,159,z),(45,13,27),'edge')
# Ceramic side skins have recessed cassettes and real maintenance shelf depth.
for side in [-1,1]:
    x=side*134
    for z in [-122,-46,34,114]:
        a.box((x,97,z),(3,97,66),'graphite')
        for yy in [59,94,132]:a.box((x+side*2,yy,z),(4,3,61),'metal')
        for dz in [-29,29]:a.box((x+side*3,94,z+dz),(4,76,3),'edge')
        a.box((x+side*5,74,z-11),(8,27,28),'ceramic')
        a.box((x+side*10,74,z-11),(2,19,21),'graphite')
        for dz in [-18,-11,-4]:a.box((x+side*12,74,z+dz),(2,18,2),'metal')
    a.box((side*146,43,-7),(29,5,277),'metal')
    for z in [-128,-65,1,67,130]:
        a.beam((side*132,15,z),(side*158,40,z),2,'metal')
        a.box((side*158,48,z),(.9,8,.9),'oxide')
    a.box((side*158,52,-1),(.8,.8,259),'oxide')
    for yy in [16,27]:a.beam((side*148,yy,-161),(side*148,yy,164),3.5,'metal',10)
    a.box((side*148,23,-143),(18,27,23),'ceramic')
    a.box((side*153,23,-155),(11,18,2),'graphite')
a.box((0,63,-168),(205,128,19),'graphite')
for y in range(14,120,16):
    a.box((0,y,-181),(193,6,12),'metal')
    a.box((0,y-3,-187),(184,2,4),'coil')
for x in [-87,-44,0,44,87]:a.box((x,63,-190),(5,123,15),'graphite')
a.box((0,139,-76),(251,25,210),'ceramic',solid=True)
a.box((0,155,-67),(263,7,193),'edge')
for x in [-106,-70,-34,2,38,74,110]:
    a.box((x,139,-182),(34,18,3),'graphite')
    a.panel((x,139,-185),(29,14,3),'ceramic',2)
    for dx in [-10,10]:a.box((x+dx,139,-187),(1.5,8,1.1),'metal')
a.box((0,184,97),(244,58,110),'ceramic',solid=True)
a.box((0,215,97),(260,8,125),'edge')
a.box((0,187,33),(185,26,7),'graphite')
a.box((0,190,27),(141,5,4),'light')
for x in [-89,-43,3,49,95]:
    a.box((x,185,39),(40,42,5),'graphite')
    a.panel((x,186,35),(33,32,4),'ceramic',3)
    a.box((x,177,32),(24,4,2),'metal')
    a.box((x,171,32),(24,1.5,2),'coil')
for z in range(-140,151,29):
    a.box((0,160 if z<45 else 221,z),(191,10,13),'metal')
    a.box((0,166 if z<45 else 227,z),(167,3,7),'graphite')
for x,z,y,w in [(-65,-77,173,32),(52,-105,174,43),(-22,81,234,49),(71,108,234,27)]:
    a.box((x,y,z),(w,13,31),'ceramic')
    a.box((x,y+8,z),(w+7,4,37),'metal')
    a.box((x,y+11,z),(w-6,3,24),'graphite')
    for dz in [-9,0,9]:a.box((x,y+13,z+dz),(w-10,2,3),'edge')
# Recessed maintenance deck, unequal trunking and ganged heat exchangers break
# the large roof planes at a scale visible from the Horizon flight camera.
for side in [-1,1]:
    x=side*91
    a.box((x,163,-62),(18,4,151),'graphite')
    for z in range(-128,4,21):a.box((x,166,z),(14,2,13),'metal')
    for z in [-128,-62,4]:
        a.box((x+side*11,175,z),(1.4,20,1.4),'edge')
    a.box((x+side*11,183,-62),(1.4,1.4,138),'metal')
for x in [-37,-13,11]:
    a.box((x,164,-57),(19,5,109),'graphite')
    for z in [-99,-66,-33]:
        a.box((x,171,z),(16,11,24),'metal')
        a.box((x,178,z),(18,3,26),'ceramic')
        for dx in [-5,0,5]:a.box((x+dx,181,z),(2,3,20),'graphite')
a.beam((-71,172,-33),(-71,172,24),4,'metal',10)
a.beam((-71,172,24),(-71,218,24),4,'metal',10)
a.box((-71,196,24),(13,7,13),'edge')
for x in [-80,-27,27,80]:
    a.box((x,26,178),(41,72,74),'ceramic',solid=True)
    a.beam((x,31,195),(x,31,260),8,'metal',12)
    a.beam((x,31,258),(x,-14,258),8,'metal',12)
a.box((0,-23,24),(283,27,382),'graphite',solid=True)
for x in [-134,134]:
    for z in [-130,-40,50,140]:a.box((x,-3,z),(30,22,47),'ceramic')
a.finish()
a=Kit('receiver-condenser')
a.box((0,-9,0),(151,20,148),'graphite',solid=True)
for x,z,h in [(-42,-32,48),(36,-18,67),(-9,42,38)]:
    a.beam((x,0,z),(x,h,z),24,'metal',12)
    a.beam((x,h-9,z),(x,h+1,z),26,'ceramic',12)
    a.beam((x,7,z),(x,11,z),26,'graphite',12)
    for dx in [-20,20]:a.box((x+dx,h*.5,z),(4,h,8),'edge')
    a.beam((x,8,z-18),(x,8,-72),5,'metal',10)
for z in [-58,0,58]:a.box((0,0,z),(157,7,7),'ceramic')
a.finish()

bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'shatterline-environment.blend'))
(SOURCE/'asset-manifest.json').write_text(json.dumps(MANIFEST,indent=2)+'\n')
(PUBLIC/'collision-kit.json').write_text(json.dumps(COLLIDERS,separators=(',',':'))+'\n')
(SOURCE/'collision-kit.json').write_text(json.dumps(COLLIDERS,separators=(',',':'))+'\n')
(SOURCE/'model-provenance.json').write_text(json.dumps({'author':'Codex original procedural Blender modeling','source':'build_assets.py','editable':'shatterline-environment.blend','runtime':'public/assets/levels/shatterline/*.glb','licence':'Project-owned original geometry; no third-party model inputs','reference':'reference/shatterline-scene-v1.png','assets':list(MANIFEST)},indent=2)+'\n')
print('SHATTERLINE COMPLETE',json.dumps(MANIFEST))
