"""Reproducible Blender source for the approved Kestrel Concept 01.
Run: blender --background --threads 6 --python assets/ships/kestrel/build_kestrel.py -- --render
Authoring coordinates below are game metres: +Z nose, +Y up. C() maps into
Blender Z-up so the standard glTF exporter returns the declared game axes.
"""
import bpy, bmesh, math, json, sys, argparse
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from surface_finish import surface_finish, bake_finish
from propulsion_chamber import add_emitter_chamber

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'assets/ships/kestrel'
OUTPUT = ROOT / 'public/assets/ships/kestrel'
REVIEW = ROOT / '.experiments/kestrel-blender'
for p in (SOURCE, OUTPUT, REVIEW): p.mkdir(parents=True, exist_ok=True)
args = argparse.ArgumentParser()
args.add_argument('--render', action='store_true')
args.add_argument('--views', default='front,top,rear,side,underside')
args.add_argument('--samples', default=40, type=int)
opts = args.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if not collection.objects: bpy.data.collections.remove(collection)
ship = bpy.data.collections.new('KESTREL | authored components')
bpy.context.scene.collection.children.link(ship)
studio = bpy.data.collections.new('STUDIO | not exported')
bpy.context.scene.collection.children.link(studio)


def C(v): return (v[0], -v[2], v[1])
def move_collection(obj, collection=ship):
    for col in list(obj.users_collection): col.objects.unlink(obj)
    collection.objects.link(obj)
    return obj

def material(name, color, metal=0, rough=.3, emission=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color,1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color,1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission[0],1)
        bsdf.inputs['Emission Strength'].default_value = emission[1]
    if name in ('Kestrel_Ceramic','Kestrel_Glass'):
        bsdf.inputs['Coat Weight'].default_value = .38 if name=='Kestrel_Ceramic' else .68
        bsdf.inputs['Coat Roughness'].default_value = .2 if name=='Kestrel_Ceramic' else .055
    if name=='Kestrel_Vermilion':
        bsdf.inputs['Specular IOR Level'].default_value=.30
    return mat
M = {
 'pearl': material('Kestrel_Ceramic',(.62,.65,.65),.09,.295),
 'pearl2': material('Kestrel_CeramicService',(.23,.27,.29),.04,.44),
 'carbon': material('Kestrel_Graphite',(.034,.049,.061),.20,.43),
 'edge': material('Kestrel_Edge',(.016,.022,.026),.52,.25),
 'vent': material('Kestrel_Recess',(.007,.011,.014),.2,.36),
 'metal': material('Kestrel_Titanium',(.24,.27,.285),.86,.32),
 'darkmetal': material('Kestrel_Mechanism',(.092,.12,.135),.8,.34),
 'machined': material('Kestrel_MachinedLip',(.55,.61,.64),.95,.19),
 'glass': material('Kestrel_Glass',(.005,.016,.022),.02,.085),
 'red': material('Kestrel_Vermilion',(.48,.022,.009),0,.36),
 'cyan': material('Kestrel_Power',(.02,.20,.24),.28,.23,((.12,.75,.89),2.4)),
 'dimcyan': material('Kestrel_Standby',(.011,.05,.064),.4,.26,((.02,.24,.31),.5)),
}

def mesh(name, vertices, faces, mat, bevel=0, smooth=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata([C(v) for v in vertices],[],faces)
    data.update()
    bm = bmesh.new(); bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    bm.to_mesh(data); bm.free()
    obj = bpy.data.objects.new(name,data); ship.objects.link(obj)
    obj.data.materials.append(M[mat] if isinstance(mat,str) else mat)
    if smooth or bevel:
        for poly in data.polygons: poly.use_smooth=True
    if bevel:
        mod = obj.modifiers.new('Machined edge radii','BEVEL')
        mod.width=bevel*({'pearl':1.22,'pearl2':1.22,'machined':.72,'metal':.80}.get(mat,1)); mod.segments=3; mod.affect='EDGES'
        mod.limit_method='ANGLE'; mod.angle_limit=.30
        mod.harden_normals=True
        normals=obj.modifiers.new('Area weighted panel normals','WEIGHTED_NORMAL')
        normals.keep_sharp=True; normals.weight=35
    return obj

def solid(name, outline, thickness, mat, bevel=.01):
    # Extrudes an authored 3D top polygon down by thickness in game Y.
    n=len(outline)
    verts=outline+[(x,y-thickness,z) for x,y,z in outline]
    faces=[tuple(range(n)),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,verts,faces,mat,bevel)

def beam(name, a,b,width,depth,mat='darkmetal',bevel=.008):
    # Rectangular beam with oriented section, primarily in XZ plane.
    a,b=Vector(a),Vector(b); axis=(b-a).normalized()
    transverse=Vector((0,1,0)).cross(axis).normalized()
    up=axis.cross(transverse).normalized()
    verts=[]
    for p in (a,b):
        for u,v in ((-1,-1),(-1,1),(1,1),(1,-1)):
            verts.append(tuple(p+transverse*(u*width/2)+up*(v*depth/2)))
    return mesh(name,verts,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],mat,bevel)

def line(name,points,radius,mat):
    curve=bpy.data.curves.new(name,'CURVE'); curve.dimensions='3D'
    curve.resolution_u=1; curve.bevel_depth=radius; curve.bevel_resolution=1
    spline=curve.splines.new('POLY'); spline.points.add(len(points)-1)
    for p,co in zip(spline.points,points): p.co=(*C(co),1)
    obj=bpy.data.objects.new(name,curve);ship.objects.link(obj);curve.materials.append(M[mat])
    return obj

# Front->rear: station, inner edge, outer chine, principal deck height, belly height.
STATIONS=[
 (3.69,.105,.173,.225,.167),
 (3.34,.14,.364,.275,.160),
 (2.63,.205,.663,.376,.153),
 (1.80,.32,.975,.487,.147),
 (.90,.452,1.204,.591,.144),
 (.02,.505,1.388,.663,.145),
 (-.86,.492,1.522,.670,.155),
 (-1.39,.526,1.682,.650,.180),
 (-1.64,.576,1.407,.640,.194),
 (-2.10,.618,1.241,.599,.205),
 (-2.43,.640,1.218,.505,.210),
]

def deck(x,z):
    for a,b in zip(STATIONS,STATIONS[1:]):
        if a[0]>=z>=b[0]:
            t=(a[0]-z)/(a[0]-b[0]);_,ix,ox,y,bot=[a[k]*(1-t)+b[k]*t for k in range(5)]
            u=(abs(x)-ix)/(ox-ix)
            # Corresponds exactly to the top section of shell().
            samples=[(0,-.024),(.23,.028),(.70,.010),(1,-.069)]
            for (u0,h0),(u1,h1) in zip(samples,samples[1:]):
                if u<=u1: return y+h0+(h1-h0)*(u-u0)/(u1-u0)
            return y-.069
    return .5

def shell_section(name,stations,sign,mat='pearl'):
    verts=[]
    for z,ix,ox,y,bot in stations:
        thick=.045+.12*min(1,max(0,(3.69-z)/3))
        for x,h in ((ix,y-.024),(ix+(ox-ix)*.23,y+.028),(ix+(ox-ix)*.7,y+.01),(ox,y-.069),(ox-.018,y-.069-thick),(ix+(ox-ix)*.55,y+.005-thick),(ix,min(bot+.060,y-.024-thick))):
            verts.append((sign*x,h,z))
    n=7; faces=[tuple(range(n)),tuple(range((len(stations)-1)*n,len(stations)*n))]
    for j in range(len(stations)-1):
        for k in range(n): faces.append((j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k))
    obj=mesh(name,verts,faces,mat,.015)
    # The underside is formed from intentional planar panels. Do not blend
    # their broad normals through the concave keel/outer-chine junction.
    for j in range(len(stations)-1):
        for k in (4,5,6):obj.data.polygons[2+j*n+k].use_smooth=False
    return obj


def shell(name, stations, sign, mat='pearl'):
    # Four closed formed panels follow the approved shell stations exactly.
    # Real 18 mm transverse reveals expose the structure without fragile chains
    # of shallow boolean cuts across a concave monocoque.
    def at(z):
        for a,b in zip(stations,stations[1:]):
            if a[0]>=z>=b[0]:
                t=(a[0]-z)/(a[0]-b[0])
                return tuple(a[k]*(1-t)+b[k]*t for k in range(5))
        return stations[-1]
    panels=[]
    for index,(front,rear) in enumerate([(3.69,2.60),(2.582,1.40),(1.382,-.92),(-.938,-2.43)]):
        section=[at(front)]+[station for station in stations if front>station[0]>rear]+[at(rear)]
        panel=shell_section(name+' / formed plate '+str(index+1),section,sign,mat)
        bpy.context.view_layer.objects.active=panel
        for mod in list(panel.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
        panels.append(panel)
    bpy.ops.object.select_all(action='DESELECT')
    for panel in panels:panel.select_set(True)
    bpy.context.view_layer.objects.active=panels[0];bpy.ops.object.join()
    panels[0].name=name
    return panels[0]


SURFACES={}
def surface_y(x,z):
    tree=SURFACES.get(-1 if x<0 else 1)
    if tree:
        location,normal,index,distance=tree.ray_cast(Vector(C((x,2.5,z))),Vector((0,0,-1)),5)
        if location is not None:return location.z
    return deck(x,z)

def paint(name,coords,mat):
    # Dense real mesh film is projected onto the evaluated ceramic. No decals
    # cross the monocoque as flat non-planar n-gons or fight the hull at depth.
    bm=bmesh.new()
    verts=[bm.verts.new(C((x,surface_y(x,z)+.004,z))) for x,z in coords]
    bm.faces.new(verts)
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=7,use_grid_fill=True)
    for v in bm.verts:v.co.z=surface_y(v.co.x,-v.co.y)+.004
    bm.normal_update()
    for f in bm.faces:
        if f.normal.z<0:f.normal_flip()
    data=bpy.data.meshes.new(name);bm.to_mesh(data);bm.free()
    obj=bpy.data.objects.new(name,data);ship.objects.link(obj);data.materials.append(M[mat])
    return obj

def intake_ring(name,outer,inner):
    verts=[]
    for loop,drop in ((outer,0),(inner,0),(outer,-.025),(inner,-.025)):
        for x,z in loop:verts.append((x,surface_y(x,z)+.006+drop,z))
    faces=[]
    for i in range(4):
        j=(i+1)%4
        faces.extend([(i,j,4+j,4+i),(i,8+i,8+j,j),(4+i,4+j,12+j,12+i),(8+i,12+i,12+j,8+j)])
    return mesh(name,verts,faces,'darkmetal',.003)

for sign,label in ((-1,'L'),(1,'R')):
    body=shell('Ceramic swept monocoque '+label,STATIONS,sign)
    bpy.context.view_layer.update()
    SURFACES[sign]=BVHTree.FromObject(body,bpy.context.evaluated_depsgraph_get())
    # A continuous dark blade follows the lower external chine.
    chine=[]
    for z,ix,ox,y,bot in STATIONS:
        thick=.045+.12*min(1,max(0,(3.69-z)/3))
        chine.append((sign*(ox-.009),y-.069-thick+.009,z))
    line('Continuous graphite chine '+label,chine,.014,'edge')
    # Long bright racing flash set flush to the authored ceramic plane.
    stripe=[(sign*.267,3.30),(sign*.745,1.90),(sign*.810,1.62),(sign*.770,2.02),(sign*.538,2.61)]
    paint('Vermilion nose flash '+label,stripe,'red')
    # Red cut tips on the swept shoulder.
    shoulder=[(sign*1.393,-1.03),(sign*1.64,-1.385),(sign*1.50,-1.455),(sign*1.355,-1.29)]
    paint('Vermilion wingtip '+label,shoulder,'red')
    # Authored panel seams, few and deliberate. Fine recessed-dark reveal.
    # A removable formed hatch has a physical return, not a painted outline.
    hatch=[(sign*.52,.89),(sign*.66,.68),(sign*.70,.08),(sign*.57,.12)]
    solid('Cockpit service hatch '+label,[(x,surface_y(x,z)+.016,z) for x,z in hatch],.022,'pearl',.004)
    # Broad satin ceramic thermal-service zone follows the formed aft shell.
    paint('Aft ceramic thermal-service finish '+label,[(sign*x,z) for x,z in
        [(.58,-.99),(.82,-1.02),(1.26,-.94),(1.38,-1.16),(1.23,-1.34),(.62,-1.33)]],'pearl2')
    # Recessed intake pockets sit inside a chamfered frame, with directional louvers.
    pocket=[(sign*.79,.50),(sign*1.125,.43),(sign*1.242,-.61),(sign*.858,-.59)]
    inner=[(sign*.819,.464),(sign*1.094,.41),(sign*1.209,-.575),(sign*.884,-.556)]
    cutter=solid('TEMP intake cut',[(x,1.5,z) for x,z in inner],1.6,'vent',0)
    bpy.context.view_layer.objects.active=body
    for mod in list(body.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
    cut=body.modifiers.new('True recessed intake opening','BOOLEAN');cut.operation='DIFFERENCE';cut.solver='EXACT';cut.object=cutter
    bpy.ops.object.modifier_apply(modifier=cut.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    intake_ring('Flush intake bezel '+label,pocket,inner)
    solid('Deep intake pocket '+label,[(x,surface_y(x,z)-.104,z) for x,z in pocket],.020,'vent',.005)
    for i in range(7):
        z=.365-i*.138
        offset=(.37-z)*.092
        x0=sign*(.839+offset);x1=sign*(1.083+offset)
        beam('Intake louver '+label+f' {i:02}',(x0,surface_y(x0,z)-.030,z),(x1,surface_y(x1,z)-.030,z-.018),.055,.041,'darkmetal',.004)
    # Underwing rails with open triangular bays, visibly below the shell.
    rail=[(sign*.59,.035,2.29),(sign*1.335,.027,-.21),(sign*1.572,.075,-1.30),(sign*1.265,.064,-1.49),(sign*.512,.039,1.90)]
    solid('Floating underwing chassis rail '+label,rail,.046,'carbon',.012)
    web_stations=[(2.06,.64,.063),(1.18,.835,.055),(.24,1.075,.052),(-.68,1.302,.079),(-1.40,1.410,.116)]
    web_verts=[]
    for z,x,bottom in web_stations:
        top=surface_y(sign*x,z)-.105
        for xx,yy in ((x-.039,bottom),(x-.039,top),(x+.039,top),(x+.039,bottom)):
            web_verts.append((sign*xx,yy,z))
    web_faces=[(0,1,2,3),tuple(range(16,20))]
    for j in range(4):
        for k in range(4):web_faces.append((j*4+k,j*4+(k+1)%4,(j+1)*4+(k+1)%4,(j+1)*4+k))
    web=mesh('Continuous swept lattice spar '+label,web_verts,web_faces,'carbon',0)
    for j,(a,b) in enumerate(zip(web_stations,web_stations[1:])):
        za,xa,ba=a;zb,xb,bb=b
        ta=surface_y(sign*xa,za)-.105;tb=surface_y(sign*xb,zb)-.105
        window=[(ba+.062,za-.15),(bb+.060,zb+.14),(tb-.056,zb+.14)]
        vs=[(sign*x,y,z) for x in (.34,1.75) for y,z in window]
        cutmesh=mesh('TEMP lattice window',vs,[(0,1,2),(3,5,4),(0,3,4,1),(1,4,5,2),(2,5,3,0)],'vent')
        bpy.context.view_layer.objects.active=web
        cut=web.modifiers.new('Open triangular web window','BOOLEAN');cut.operation='DIFFERENCE';cut.solver='EXACT';cut.object=cutmesh
        bpy.ops.object.modifier_apply(modifier=cut.name);bpy.data.objects.remove(cutmesh,do_unlink=True)
    mod=web.modifiers.new('Structural edge radii','BEVEL');mod.width=.008;mod.segments=3
    # Upper attachment seats bridge the web into the monocoque; bottom cord is
    # embedded in the continuous rail, so no free-floating blocks remain.
    for z,x,bottom in (web_stations[0],web_stations[2],web_stations[-1]):
        y=surface_y(sign*x,z)-.111
        solid('Lattice upper saddle '+label+str(z),[(sign*(x-.085),y,z+.095),(sign*(x+.075),y,z+.067),(sign*(x+.075),y,z-.075),(sign*(x-.085),y,z-.09)],.034,'darkmetal',.009)
    # Thin induction shoes below the structural rails, not chunky pods.
    for z0,x0 in ((1.42,.725),(-.71,1.185)):
        shoe=[(sign*(x0-.09),.035,z0+.39),(sign*(x0+.065),.035,z0+.28),(sign*(x0+.10),.035,z0-.35),(sign*(x0-.085),.035,z0-.40)]
        solid('Induction shoe '+label+str(z0),shoe,.075,'edge',.012)
        line('Induction active slit '+label+str(z0),[(sign*(x0+.086),.013,z0+.20),(sign*(x0+.108),.013,z0-.30)],.012,'dimcyan')

# Graphite centre keel with integrated sharp nose and mechanical tail.
SPINE=[(3.46,.084,.188,.118),(2.4,.21,.347,.108),(1.4,.36,.455,.08),(.3,.46,.543,.067),(-.8,.45,.575,.069),(-1.6,.38,.588,.08),(-2.6,.30,.423,.10),(-3.02,.19,.263,.12)]
verts=[]
for z,w,y,bot in SPINE:
    verts += [(-w,y-.055,z),(-w*.62,y,z),(w*.62,y,z),(w,y-.055,z),(w*.75,bot,z),(-w*.75,bot,z)]
faces=[tuple(range(6)),tuple(range((len(SPINE)-1)*6,len(SPINE)*6))]
for j in range(len(SPINE)-1):
    for k in range(6):faces.append((j*6+k,j*6+(k+1)%6,(j+1)*6+(k+1)%6,(j+1)*6+k))
mesh('Graphite central torsion spine',verts,faces,'carbon',.022)

# Flush elongated canopy, smoothly swept surface across an angular seat.
CANOPY=[(1.98,.012,.428,.433),(1.80,.124,.455,.529),(1.40,.267,.501,.688),(.87,.362,.551,.861),(.25,.375,.584,.970),(-.33,.330,.601,.982),(-.80,.237,.613,.891),(-1.13,.132,.617,.741),(-1.26,.023,.610,.644)]
# Catmull-Rom interpolation gives a controlled continuous aerospace canopy.
def catmull(p0,p1,p2,p3,t): return .5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)
dense=[]
for j in range(len(CANOPY)-1):
    for q in range(5):
        t=q/5
        dense.append(tuple(catmull(CANOPY[max(0,j-1)][k],CANOPY[j][k],CANOPY[j+1][k],CANOPY[min(len(CANOPY)-1,j+2)][k],t) for k in range(4)))
dense.append(CANOPY[-1])
dense=[(z,w,base,base+(peak-base)*.69) for z,w,base,peak in dense]

def canopy(name,scale,lower,mat):
    verts=[]; rings=20
    for z,w,base,peak in dense:
        for k in range(rings+1):
            u=k/rings; angle=-math.pi/2+math.pi*u
            x=math.sin(angle)*w*scale
            y=base+(peak-base)*max(0,math.cos(angle))**.75+lower
            verts.append((x,y,z))
    faces=[];r=rings+1
    for j in range(len(dense)-1):
        for k in range(rings):faces.append((j*r+k,(j+1)*r+k,(j+1)*r+k+1,j*r+k+1))
    faces.append(tuple(list(range(r-1,-1,-1))+[(len(dense)-1)*r+k for k in range(r)]))
    return mesh(name,verts,faces,mat,0,True)
canopy('Canopy structural seat',1.12,-.025,'edge')
canopy('Flush smoked canopy',1,0,'glass')
for sign in (-1,1):
    line('Canopy elastomer gasket',[(sign*w*1.06,base-.004,z) for z,w,base,peak in dense],.009,'vent')
    line('Canopy thin titanium seal',[(sign*w*1.015,base+.002,z) for z,w,base,peak in dense],.008,'darkmetal')
# Aft spine cowling flows from canopy into two subtle hot-air cooling slots.
COLLAR=[(-.95,.335,.66,.744,.43),(-1.28,.40,.67,.795,.43),(-1.70,.34,.64,.735,.33),(-2.24,.24,.49,.57,.24)]
verts=[]
for z,w,side,peak,bot in COLLAR:
    verts.extend([(-w,side,z),(-w*.52,peak,z),(w*.52,peak,z),(w,side,z),(w*.78,bot,z),(-w*.78,bot,z)])
faces=[tuple(range(6)),tuple(range(18,24))]
for j in range(3):
    for k in range(6):faces.append((j*6+k,j*6+(k+1)%6,(j+1)*6+(k+1)%6,(j+1)*6+k))
mesh('Integrated graphite canopy tail fairing',verts,faces,'carbon',.02)
for i in range(5):
    z=-1.51-i*.095
    y=.763-(i*.027)
    beam('Spine heat exchanger '+str(i),(-.15,y+.007,z),(.15,y+.007,z),.022,.009,'vent',.002)

# Eight-sided, compact nacelles. The rear is actually open, with layered cavity.
OCT=[(-.66,1),(.66,1),(1,.56),(1,-.56),(.66,-1),(-.66,-1),(-1,-.56),(-1,.56)]
def oct_ring(cx,cy,z,rx,ry): return [(cx+x*rx,cy+y*ry,z) for x,y in OCT]
def duct(name,cx,cy,stations,mat,cap_front=True,cap_back=False,bevel=.012):
    verts=[]
    for z,rx,ry in stations:verts+=oct_ring(cx,cy,z,rx,ry)
    faces=[]
    for j in range(len(stations)-1):
        for k in range(8):faces.append((j*8+k,j*8+(k+1)%8,(j+1)*8+(k+1)%8,(j+1)*8+k))
    if cap_front:faces.append(tuple(range(8)))
    if cap_back:faces.append(tuple(range((len(stations)-1)*8,len(stations)*8)))
    return mesh(name,verts,faces,mat,bevel)

def oct_annulus(name,cx,cy,z,outer,inner,mat,bevel=.005,depth=.035):
    verts=oct_ring(cx,cy,z,outer[0],outer[1])+oct_ring(cx,cy,z,inner[0],inner[1])+oct_ring(cx,cy,z+depth,outer[0],outer[1])+oct_ring(cx,cy,z+depth,inner[0],inner[1])
    faces=[]
    for i in range(8):
        j=(i+1)%8
        faces += [(i,j,8+j,8+i),(i,16+i,16+j,j),(8+i,8+j,24+j,24+i),(16+i,24+i,24+j,16+j)]
    return mesh(name,verts,faces,mat,bevel)

for sign,label in ((-1,'L'),(1,'R')):
    cx=sign*.955;cy=.448
    duct('Integrated graphite power housing '+label,cx,cy,[(-1.27,.285,.27),(-1.66,.381,.339),(-2.37,.385,.350),(-2.66,.369,.341)],'carbon',True,True,.018)
    duct('Continuous nozzle pressure sleeve '+label,cx,cy,[(-2.34,.373,.342),(-2.62,.393,.350),(-3.16,.346,.312)],'darkmetal',False,False,.006)
    petal_sections=[('Cold mounting cuff',[(-2.35,.385,.350),(-2.53,.414,.375),(-2.70,.421,.379)]),
        ('Overlapping hot petal',[(-2.755,.423,.380),(-3.025,.399,.357),(-3.195,.366,.334)])]
    for facet in range(8):
        av=Vector(OCT[facet]);bv=Vector(OCT[(facet+1)%8]);mid=(av+bv)*.5
        left=mid+(av-mid)*.955;right=mid+(bv-mid)*.955
        for section,stations in petal_sections:
            pv=[]
            for z,rx,ry in stations:
                for uv,radial in ((left,1),(right,1),(right,.954),(left,.954)):
                    pv.append((cx+uv.x*rx*radial,cy+uv.y*ry*radial,z))
            pf=[(0,1,2,3),(8,11,10,9)]
            for j in range(2):
                for k in range(4):pf.append((j*4+k,j*4+(k+1)%4,(j+1)*4+(k+1)%4,(j+1)*4+k))
            mesh(section+' '+label+str(facet),pv,pf,'metal',.004)
            if section=='Overlapping hot petal' and facet in (0,2):
                for edge in (-1,1):
                    u=mid+(bv-av)*(.32*edge)
                    line('Petal axial machined return '+label,[(cx+u.x*rx*1.003,cy+u.y*ry*1.003,z) for z,rx,ry in stations],.0045,'darkmetal')
        if facet in (0,2):
            left=mid+(av-mid)*.18;right=mid+(bv-mid)*.18
            pv=[]
            for z,rx,ry in [(-2.61,.429,.388),(-2.73,.433,.390),(-2.88,.421,.379)]:
                for uv,radial in ((left,1),(right,1),(right,.975),(left,.975)):
                    pv.append((cx+uv.x*rx*radial,cy+uv.y*ry*radial,z))
            pf=[(0,1,2,3),(8,11,10,9)]
            for j in range(2):
                for k in range(4):pf.append((j*4+k,j*4+(k+1)%4,(j+1)*4+(k+1)%4,(j+1)*4+k))
            mesh('Nozzle overlap keeper '+label+str(facet),pv,pf,'darkmetal',.003)
    oct_annulus('Forward cowl compression band '+label,cx,cy,-2.547,(.422,.383),(.411,.372),'darkmetal',.002,.044)
    oct_annulus('Rear machined retaining lip '+label,cx,cy,-3.211,(.373,.341),(.357,.324),'machined',.003,.053)
    # Four small flush retainers sit in the compression band, not scattered greeble.
    for facet in (0,2,4,6):
        v=(Vector(OCT[facet])+Vector(OCT[(facet+1)%8]))*.5
        normal=Vector((v.x,0,v.y)).normalized()
        pos=C((cx+v.x*.426,cy+v.y*.387,-2.529))
        bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=.014,depth=.009,location=pos)
        bolt=move_collection(bpy.context.object);bolt.name='Cowl band flush retainer '+label+str(facet)
        bolt.rotation_euler=Vector(C((v.x,v.y,0))).to_track_quat('Z','Y').to_euler();bolt.data.materials.append(M['darkmetal'])
    # The outer nacelle cheek has one defined service recess with an inset
    # directional heat shield; the geometry follows the existing octagonal side.
    outer=cx+sign*.383
    cheek=[(outer,.306,-1.82),(outer,.595,-1.91),(outer,.590,-2.30),(outer,.303,-2.26)]
    cheekv=cheek+[(x-sign*.013,y,z) for x,y,z in cheek]
    cheekf=[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]
    mesh('Recessed power-unit access panel '+label,cheekv,cheekf,'edge',.008)
    for j in range(3):
        z=-1.995-j*.085
        beam('Directional nacelle heat vane '+label+str(j),(outer+sign*.010,.348,z),(outer+sign*.009,.543,z-.033),.018,.021,'darkmetal',.004)
    oct_annulus('Exhaust protective lip '+label,cx,cy,-3.22,(.370,.339),(.301,.276),'darkmetal',.007,.048)
    duct('Deep nozzle ceramic throat '+label,cx,cy,[(-3.21,.303,.279),(-2.86,.247,.228),(-2.70,.227,.210)],'vent',False,True,.003)
    oct_annulus('Recessed power aperture '+label,cx,cy,-3.062,(.278,.255),(.244,.221),'cyan',.003,.025)
    oct_annulus('Internal ceramic nozzle collar '+label,cx,cy,-2.91,(.260,.237),(.221,.198),'darkmetal',.004,.018)
    oct_annulus('Internal standby aperture '+label,cx,cy,-2.749,(.218,.196),(.190,.166),'dimcyan',.002,.016)
    add_emitter_chamber(duct,oct_annulus,beam,label,cx,cy,-3.22,.370,.339)
    # Long narrow rear deck spine integrates the nacelle rather than hanging it free.
    solid('Power housing service spine '+label,[(cx-.13,.795,-1.60),(cx-.14,.813,-2.31),(cx-.13,.821,-2.58),(cx+.13,.821,-2.58),(cx+.14,.813,-2.31),(cx+.13,.795,-1.60)],.052,'pearl2',.011)
    for side in (-1,1):
        line('Service spine lower gasket '+label,[(cx+side*.138,.748,-1.62),
            (cx+side*.146,.764,-2.31),(cx+side*.136,.770,-2.56)],.008,'edge')
    # Rear fins are thin swept composite laminates with pearl face and vermilion cap.
    base=[(sign*.91,.715,-1.23),(sign*1.137,1.317,-2.16),(sign*1.179,1.342,-2.55),(sign*1.022,.783,-2.47)]
    # Extrusion across X preserves the compact side profile and canted silhouette.
    n=len(base);verts=base+[(x+sign*.036,y,z) for x,y,z in base]
    faces=[tuple(range(n)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh('Swept canted fin '+label,verts,faces,'pearl',.011)
    tip=[(sign*1.121,1.274,-2.10),(sign*1.137,1.317,-2.16),(sign*1.179,1.342,-2.55),(sign*1.166,1.296,-2.541)]
    mesh('Vermilion fin tip '+label,tip+[(x+sign*.041,y,z) for x,y,z in tip],faces,'red',.004)
    # Root dark fairing gives the fin a designed load path.
    solid('Fin root composite saddle '+label,[(sign*.773,.672,-1.13),(sign*.95,.807,-1.77),(sign*1.067,.825,-2.49),(sign*.838,.768,-2.43)],.070,'edge',.018)
    # Exhaust anchors export identity rotation in the game frame.
    empty=bpy.data.objects.new('Exhaust_'+label,None);ship.objects.link(empty)
    empty.location=C((cx,cy,-3.23));empty.empty_display_type='ARROWS';empty.empty_display_size=.15
    empty['game_position']=[cx,cy,-3.23];empty['game_aft']=[0,0,-1]

# Underbody: purposeful service plates, not primitive engine drums.
solid('Central belly thermal panel',[(-.25,.03,2.42),(-.49,.03,.87),(-.55,.03,-1.02),(-.30,.03,-2.59),(.30,.03,-2.59),(.55,.03,-1.02),(.49,.03,.87),(.25,.03,2.42)],.026,'darkmetal',.017)
for sign in (-1,1):
    line('Belly power bus '+str(sign),[(sign*.27,.007,1.48),(sign*.345,.007,.06),(sign*.30,.007,-1.63)],.023,'carbon')
    for j in range(4):
        z=-1.02-j*.25
        beam('Lower thermal vane '+str(sign)+str(j),(sign*.18,.014,z),(sign*.40,.014,z-.12),.038,.034,'edge',.006)
# Dark tail vane gives a clean central finish between the two nozzles.
solid('Centre tail aerofoil',[(-.37,.265,-2.25),(-.49,.239,-2.97),(-.20,.253,-3.055),(.20,.253,-3.055),(.49,.239,-2.97),(.37,.265,-2.25)],.062,'carbon',.013)

# Stencil numerals 07, authored geometry, no font or texture dependency.
def marking_polygon(name,coords,x0,z0,sx,sz,mat='edge'):
    return paint(name,[(x0+u*sx,z0-v*sz) for u,v in coords],mat)
# 0 as four chamfered bands; top-view legibility aligned to the nose.
x0=.650;z0=1.430;sw=.162;sh=.31
zero=[[(.16,0),(.78,0),(.90,.11),(.73,.17),(.23,.17),(.17,.24),(0,.18)],[(.90,.11),(1,.83),(.84,1),(.73,.82),(.73,.20)],[(.84,1),(.18,1),(0,.83),(.21,.77),(.27,.83),(.72,.83)],[(0,.83),(0,.18),(.17,.24),(.23,.73),(.21,.77)]]
for j,poly in enumerate(zero):marking_polygon('Stencil 0 '+str(j),poly,x0,z0,sw,sh)
marking_polygon('Stencil 7',[(0,1),(1,1),(1,.83),(.42,0),(.12,0),(.76,.81),(0,.81)],x0+.224,z0,sw,sh)
# Tiny fastener countersinks on service corners; retain sparse readable hierarchy.
for sign in (-1,1):
    for x,z in ((.28,2.58),(.61,2.49),(.44,1.44),(1.00,1.20),(.61,.87),(.64,.15),(1.20,-.74),(.60,-.94),(1.18,-1.68),(.985,1.17)):
        y=surface_y(sign*x,z)+.004
        bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.022,depth=.006,location=C((sign*x,y,z)))
        obj=move_collection(bpy.context.object);obj.name='Flush titanium fastener';obj.data.materials.append(M['darkmetal'])

texture_directory=SOURCE/'textures';texture_directory.mkdir(exist_ok=True)
scuffs=[(sign*x,z,sign*dx,dz) for sign in (-1,1) for x,z,dx,dz in [( .28,2.90,.025,-.12),(.43,2.57,.03,-.09),(.46,2.53,.019,-.06),(.97,1.30,-.028,.11),(.93,1.33,-.025,.06),(.61,.80,.015,-.10),(1.13,-.70,-.02,-.12),(1.17,-.73,-.018,-.06),(1.38,-1.30,.02,-.06)]]
finishes={M[kind].name:surface_finish(M[kind],kind,2.35,3.22,scuffs) for kind in ('pearl','carbon','metal','darkmetal')}

# Metadata and editable source are saved before export-consolidation.
scene=bpy.context.scene
scene['asset']='KESTREL / CONCEPT 01'
scene['coordinate_contract']='Metres; exported +Z nose / +Y up; hover hardware near Y=0'
scene['provenance']='Original Blender model based on user-approved original generated concept-01.png'
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
scene.render.engine='CYCLES';scene.cycles.samples=opts.samples
scene.cycles.use_denoising=True
scene.render.resolution_x=1500;scene.render.resolution_y=1050;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.28,.31,.34,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45

floor_mat=material('Studio graphite floor',(.145,.157,.165),.10,.48)
bpy.ops.mesh.primitive_plane_add(size=200,location=C((0,-.33,0)))
floor=move_collection(bpy.context.object,studio);floor.name='Studio ground | not asset';floor.data.materials.append(floor_mat)

def aim(obj,game_target):obj.rotation_euler=(Vector(C(game_target))-obj.location).to_track_quat('-Z','Y').to_euler()
def area(name,pos,power,size,color,target=(0,.4,0),size_y=None):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color
    data.shape='RECTANGLE';data.size=size;data.size_y=size_y or size
    ob=bpy.data.objects.new(name,data);studio.objects.link(ob);ob.location=C(pos);aim(ob,target);return ob
area('Large soft key',(-4,7,4),1450,6,(1,.91,.82),size_y=4)
area('Long canopy reflection',(2,6,1),1050,3,(.78,.87,1),size_y=8)
area('Rear grazing strip',(-2,4,-7),1800,5,(1,.91,.80),size_y=2)
area('Front fill',(5,2,5),500,5,(.79,.88,1),size_y=4)
cam_data=bpy.data.cameras.new('Review camera');cam=bpy.data.objects.new('Review camera',cam_data);studio.objects.link(cam);scene.camera=cam
cam_data.lens=56
cam.location=C((8.6,6.5,10.8));aim(cam,(0,.45,.0))
# Tidy outliner and a useful default editing viewpoint.
for obj in ship.objects:obj.select_set(False)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'kestrel.blend'))

# GLB duplicate scene: apply modifiers and join by material for predictable calls.
source_objects=list(ship.objects)
exports=[]
for obj in source_objects:
    dup=obj.copy()
    if obj.data:dup.data=obj.data.copy()
    scene.collection.objects.link(dup);exports.append(dup)
    dup.name='EXPORT_'+obj.name if obj.type!='EMPTY' else obj.name+'_export'
for obj in source_objects:
    obj.hide_render=True
    if obj.type=='EMPTY':obj.name='SOURCE_'+obj.name
bpy.ops.object.select_all(action='DESELECT')
for obj in exports:
    if obj.type in ('MESH','CURVE'):
        obj.select_set(True);bpy.context.view_layer.objects.active=obj
        bpy.ops.object.convert(target='MESH')
        obj.select_set(False)
# Join each material into one mesh without changing editable source.
groups={}
for obj in exports:
    if obj.type=='MESH':groups.setdefault(obj.data.materials[0].name,[]).append(obj)
joined=[]
anchors=[o for o in exports if o.type=='EMPTY']
for name,objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1:bpy.ops.object.join()
    out=bpy.context.object;out.name=name+'_Geometry';joined.append(out)
    # Explicit triangulation ensures Blender and glTF use identical faces.
    tri=out.modifiers.new('Deterministic triangulation','TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier=tri.name)
for obj in joined:
    mat=obj.data.materials[0]
    if mat.name in finishes:
        bake_finish(obj,mat,finishes[mat.name],texture_directory,2048 if 'Ceramic' in mat.name else 512)
for o in anchors:o.name=o.name.replace('_export','')
bpy.ops.object.select_all(action='DESELECT')
for obj in joined+anchors:obj.select_set(True)
bpy.context.view_layer.objects.active=joined[0]
bpy.ops.export_scene.gltf(filepath=str(OUTPUT/'kestrel.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False,export_materials='EXPORT',export_animations=False)
# Read actual evaluated geometry and converted game-frame bounds.
verts=[obj.matrix_world@v.co for obj in joined for v in obj.data.vertices]
game=[(v.x,v.z,-v.y) for v in verts]
bounds={'min':[min(v[k] for v in game) for k in range(3)],'max':[max(v[k] for v in game) for k in range(3)]}
report={'asset':'Kestrel Concept 01','revision':10,'blender':bpy.app.version_string,'axes':'+Z forward, +Y up','bounds':bounds,'dimensions':[bounds['max'][k]-bounds['min'][k] for k in range(3)],'triangles':sum(len(o.data.polygons) for o in joined),'meshes':len(joined),'materials':len(groups),'glbBytes':(OUTPUT/'kestrel.glb').stat().st_size,'anchors':{'Exhaust_L':[-.955,.448,-3.23],'Exhaust_R':[.955,.448,-3.23]},'sourceComponents':len(source_objects),'textureCount':len(finishes)*4,'textures':'Embedded original base color, roughness, tangent normal and short-range cavity occlusion maps; editable procedural Blender materials','renderViews':opts.views.split(',') if opts.render else []}
(SOURCE/'asset-manifest.json').write_text(json.dumps(report,indent=2)+'\n')
print('KESTREL_ASSET_REPORT '+json.dumps(report),flush=True)
# Export copies render identically; render them and keep original .blend clean.
if opts.render:
    views={'front':((8.1,5.85,10.3),(0,.4,.0),56),'top':((0,13,.02),(0,.2,.15),52),'rear':((7.5,4.7,-10.3),(0,.47,-.25),56),'side':((12.7,3.1,.45),(0,.45,.15),55),'underside':((7.8,-5.2,9.5),(0,.2,.0),54)}
    for view in opts.views.split(','):
        pos,target,lens=views[view];cam.location=C(pos);aim(cam,target);cam_data.lens=lens
        cam_data.type='PERSP'
        if view=='top':
            cam_data.type='ORTHO';cam_data.ortho_scale=10.85;cam.rotation_euler=(0,0,0);cam.location=C((0,13,.22))
        floor.hide_render=view=='underside'
        if view=='underside':
            area('Underside inspection softbox',(1,-5,1),1300,7,(.9,.95,1),target=(0,0,0))
        scene.render.filepath=str(REVIEW/(view+'.png'))
        bpy.ops.render.render(write_still=True)
        print('KESTREL_RENDER '+view,flush=True)
print('KESTREL_DONE',flush=True)
