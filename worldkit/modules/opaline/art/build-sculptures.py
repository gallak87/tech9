"""Rebuild Opaline's authored mineral sculptures with Blender in background mode.
The cliff scan is sampled as physical relief; surfaces are baked into portable meshes.
Run: blender -b --python worldkit/modules/opaline/art/build-sculptures.py
"""
import bpy, math
from pathlib import Path
from mathutils import Vector, noise

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
HEIGHT = ASSETS / 'marble-cliff-01-height-2k.png'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
height_image = bpy.data.images.load(str(HEIGHT)) if HEIGHT.exists() else None
if height_image is None:
    raise RuntimeError('Build requires the canonical Marble Cliff 01 height source')
width, height = height_image.size
pixels = list(height_image.pixels)

def relief(x, y):
    # Tile in local geological planes. No color-to-height approximation.
    u, v = (x / 16.0) % 1.0, (y / 16.0) % 1.0
    ix, iy = int(u*(width-1)), int(v*(height-1))
    return pixels[(iy*width+ix)*4] - 0.5

def fbm(x,y,z,scale=1):
    p=Vector((x*scale,y*scale,z*scale))
    return noise.fractal(p,1.0,2.1,3,noise_basis='PERLIN_ORIGINAL')

def catmull(points,t):
    q=max(0,min(len(points)-1-1e-6,t*(len(points)-1)))
    i=int(q); a=q-i
    p0=Vector(points[max(0,i-1)]);p1=Vector(points[i]);p2=Vector(points[i+1]);p3=Vector(points[min(len(points)-1,i+2)])
    return (p1*2+(p2-p0)*a+(p0*2-p1*5+p2*4-p3)*a*a+(-p0+p1*3-p2*3+p3)*a*a*a)*.5

def shell(name, front, back, nu, nv, material='fracture', aperture=None):
    verts=[]; faces=[]
    for function in (front,back):
        for j in range(nv+1):
            for i in range(nu+1):verts.append(function(i/nu,j/nv))
    offset=(nu+1)*(nv+1)
    edges={}
    for j in range(nv):
        for i in range(nu):
            if aperture and aperture((i+.5)/nu,(j+.5)/nv):continue
            a=j*(nu+1)+i;b=a+1;c=a+nu+1;d=c+1
            faces.extend(((a,b,d,c),(offset+a,offset+c,offset+d,offset+b)))
            for p,q in ((a,b),(b,d),(d,c),(c,a)):
                key=tuple(sorted((p,q)))
                if key in edges:del edges[key]
                else:edges[key]=(p,q)
    for p,q in edges.values():faces.append((q,p,offset+p,offset+q))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    obj.data.materials.append(bpy.data.materials.get(material) or bpy.data.materials.new(material))
    for poly in mesh.polygons:poly.use_smooth=True
    # Triangulate before exporting so the authored relief is stable everywhere.
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    tri=obj.modifiers.new('Stable sculpt topology','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
    obj.select_set(False)
    return obj

for number in range(3):
    # Broad non-radial buttresses: tilted bedding, projecting broken cap and
    # deeply recessed lower face. Each has independent authored proportions.
    W,H,D=[(54,86,32),(72,62,38),(39,112,28)][number]
    seed=number*37+11
    crowns=[
        [(0,.38),(.18,.56),(.38,.92),(.48,1.03),(.61,.96),(.72,.70),(.9,.69),(1,.31)],
        [(0,.26),(.12,.80),(.22,.91),(.46,.85),(.64,.74),(.82,.59),(1,.26)],
        [(0,.25),(.15,.42),(.36,.98),(.55,1.05),(.72,.67),(.86,.63),(1,.38)],
    ][number]
    def outline(u,v):
        # The primary silhouette is authored, not a rectangle with noise on it:
        # diagonal cleaves, unequal stepped crowns and a leaning upper plate.
        j=next((j for j in range(len(crowns)-1) if u<=crowns[j+1][0]),len(crowns)-2)
        a,ha=crowns[j];b,hb=crowns[j+1]
        crown=H*(ha+(hb-ha)*(u-a)/(b-a)+.028*fbm(u*14,seed,2))
        x=(u-.5)*W*(1.22-.55*v)+(number-1)*v*v*9
        x+=math.sin(v*3+seed)*3+fbm(u*W+seed,v*H,0,.07)*1.4
        return x,v*crown
    def front(u,v):
        x,z=outline(u,v)
        strata=math.sin(v*22+u*1.7+seed)*1.8 + math.sin(v*57-u*2.3)*.7
        ledge=(max(0,math.sin(v*13+u*.7))**.25)*3.7
        channels=abs(math.sin(u*21+math.sin(v*4+seed)*.7))**8*3.8
        cap=math.exp(-((v-.74)/.12)**2)*(14 if number==1 else 9)
        recess=math.exp(-((v-.32)/.19)**2)*5
        y=-D*.5-cap+recess+strata-ledge+channels
        y+=relief(x+seed,z+u*8)*5.2+fbm(x+seed,z,seed,.11)*1.1
        z+=relief(x+13,z+9)*1.4+fbm(x,z+seed,3,.08)*1.1
        return (x,y,z)
    def back(u,v):
        x,z=outline(u,v)
        y=D*.5+fbm(x+seed,z,5,.06)*2.2
        return(x,y,z)
    shell('mineral-buttress-'+str(number+1),front,back,112,144)

# One asymmetric, ground-rooted curl, open towards the canyon. X is lateral,
# Y is depth and Z is elevation in Blender; export converts to Three's Y-up.
profile=[(100,-80),(96,-5),(84,44),(54,76),(9,82),(-34,66),(-68,43)]
def curl(u,v,outer=False):
    p=catmull(profile,u)
    ahead=catmull(profile,min(1,u+.001));behind=catmull(profile,max(0,u-.001))
    direction=(ahead-behind).normalized();normal=Vector((direction.y,-direction.x))
    along=(v-.5)*126
    taper=math.sin(math.pi*v)**.22
    p.x+=math.sin(v*4.7)*6+fbm(u*80,v*126,9,.045)*2
    p.y+=math.sin(v*7+u*3)*3+fbm(u*90,v*126,17,.06)*2
    chip=relief(u*155,along)*4.8 + fbm(u*130,along,11,.13)*1.3
    fissure=abs(math.sin(u*47+v*2.8))**12*2.3
    thickness=(15+math.sin(v*5+u*7)*3)*taper+4
    displacement=chip-fissure + (thickness if outer else 0)
    p+=normal*displacement
    return(p.x,along+math.sin(u*13)*1.8,p.y)
crust=shell('mineral-curl-crust',lambda u,v:curl(u,v,False),lambda u,v:curl(u,v,True),160,128,aperture=lambda u,v: .11<v<.89 and .38+.027*math.sin(v*19)+.018*math.sin(v*43)<u<.915)

# A broad inset liquid-bearing stratum follows the underside, with an irregular
# perimeter. It is not an oval portal or a disconnected painted rectangle.
def emerald(u,v,outer=False):
    vv=.08+v*.84
    edge=.027*math.sin(v*19)+.018*math.sin(v*43)
    uu=.35+edge+u*(.59-edge)
    p=Vector(curl(uu,vv,False))
    along=Vector(curl(min(.999,uu+.001),vv,False))-Vector(curl(max(0,uu-.001),vv,False))
    normal=Vector((along.z,0,-along.x)).normalized()
    # Place just inside the inner cave; a thick volume is retained at the rim.
    p-=normal*(1.3 if not outer else .55)
    return tuple(p)
shell('mineral-curl-emerald',lambda u,v:emerald(u,v,False),lambda u,v:emerald(u,v,True),112,96,'emerald')

# Runtime owns material assignment. Separate high/low GLBs share names and bounds.
objects=list(bpy.context.scene.objects)
for obj in objects:obj.select_set(True)
for detail,ratio in [('high',.62),('low',.16),('distant',.025)]:
    copies=[]
    for source in objects:
        obj=source.copy();obj.data=source.data.copy();bpy.context.collection.objects.link(obj)
        bpy.context.view_layer.objects.active=obj
        source.select_set(False);obj.select_set(True)
        mod=obj.modifiers.new('Bounded runtime topology','DECIMATE');mod.ratio=ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.name=source.name+'-'+detail
        copies.append(obj)
    for source in objects:source.select_set(False)
    for obj in copies:obj.select_set(True)
    path=ASSETS/('mineral-sculptures-'+detail+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),use_selection=True,export_format='GLB',export_materials='NONE',export_yup=True,export_texcoords=False,export_normals=True)
    print('EXPORTED',detail,sum(len(o.data.polygons) for o in copies),path)
    for obj in copies:bpy.data.objects.remove(obj,do_unlink=True)
print('Opaline sculptures complete')
