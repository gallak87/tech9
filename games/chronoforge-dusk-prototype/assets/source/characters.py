"""Original smooth, articulated Chronoforge hero sculptures.

Run: blender -b -t 4 -P assets/source/characters.py
All geometry, palettes, portrait-like facial forms, clothing and equipment are
authored here. Blender -Y is forward; the exported glTF heroes face +Z.
Named empty pivots preserve the game's lightweight procedural animation rig.
"""
import bpy, math, os, random, json
from mathutils import Vector
from collections import defaultdict

random.seed(8120)
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../..'))
OUT = os.path.join(ROOT, 'public/models')
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for block in bpy.data.materials: bpy.data.materials.remove(block)
PIVOTS = {}

def material(name, color, metallic=0, rough=.52, emission=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Metallic'].default_value=metallic
    bs.inputs['Roughness'].default_value=rough
    if emission:
        bs.inputs['Emission Color'].default_value=(*color,1)
        bs.inputs['Emission Strength'].default_value=emission
    return m

M={
 'skinK':material('Kaida • sunset skin',(.56,.31,.20),rough=.56),
 'skinV':material('Vex • lilac porcelain',(.54,.43,.52),rough=.49),
 'skinR':material('Rune • warm umber skin',(.35,.21,.15),rough=.58),
 'lipK':material('Kaida • rose lips',(.32,.13,.115),rough=.54),
 'lipV':material('Vex • muted plum lips',(.30,.18,.25),rough=.5),
 'lipR':material('Rune • earthen lips',(.23,.12,.10),rough=.55),
 'skinShade':material('Skin • subtle creases',(.17,.105,.096),rough=.8),
 'skinShadeV':material('Vex • soft shadow',(.27,.20,.31),rough=.8),
 'eyeWhite':material('Eyes • warm ivory',(.72,.73,.64),rough=.25),
 'eyeAmber':material('Eyes • amber',(.38,.23,.055),rough=.21),
 'eyeViolet':material('Eyes • amethyst',(.31,.16,.43),rough=.21),
 'eyeGreen':material('Eyes • moss',(.16,.26,.17),rough=.21),
 'pupil':material('Eyes • pupils',(.008,.019,.024),rough=.17),
 'glint':material('Eyes • catchlights',(.93,.93,.8),rough=.13),
 'hairK':material('Kaida • burnished auburn',(.20,.061,.035),rough=.42),
 'hairKLight':material('Kaida • copper strands',(.37,.135,.060),rough=.47),
 'hairKDark':material('Kaida • auburn shadows',(.105,.032,.024),rough=.55),
 'hairV':material('Vex • lavender silver',(.54,.49,.64),metallic=.08,rough=.39),
 'hairVLight':material('Vex • moonlit strands',(.77,.70,.78),metallic=.1,rough=.36),
 'hairVDark':material('Vex • lavender shadows',(.26,.22,.37),rough=.5),
 'hairR':material('Rune • steel-grey hair',(.10,.12,.13),rough=.75),
 'hairRLight':material('Rune • silver at the temples',(.29,.32,.31),rough=.68),
 'teal':material('Kaida • storm-blue wool',(.062,.15,.19),rough=.87),
 'tealShade':material('Kaida • deep wool folds',(.036,.078,.10),rough=.9),
 'tealLight':material('Kaida • worn seams',(.13,.25,.28),rough=.85),
 'scarf':material('Kaida • vermilion linen',(.48,.12,.082),rough=.87),
 'scarfLight':material('Kaida • sun-faded scarf edge',(.70,.26,.13),rough=.9),
 'violet':material('Vex • twilight velvet',(.108,.082,.19),rough=.83),
 'violetLight':material('Vex • woven lilac lining',(.28,.21,.36),rough=.8),
 'violetShade':material('Vex • deep robe folds',(.052,.047,.10),rough=.87),
 'runeCloth':material('Rune • woven underarmor',(.048,.093,.12),rough=.88),
 'runeCape':material('Rune • weathered sea-green cloak',(.11,.25,.25),rough=.9),
 'runeCapeLight':material('Rune • cloak seam',(.22,.37,.34),rough=.85),
 'leather':material('Oiled brown leather',(.087,.051,.036),rough=.72),
 'leatherLight':material('Leather • raised welt',(.22,.12,.066),rough=.77),
 'sole':material('Boots • layered rubber soles',(.023,.033,.039),rough=.92),
 'steel':material('Weathered titanium',(.29,.39,.41),metallic=.75,rough=.34),
 'steelLight':material('Titanium • burnished edges',(.48,.57,.56),metallic=.82,rough=.27),
 'steelDark':material('Oxidized gunmetal',(.075,.12,.15),metallic=.74,rough=.43),
 'runeArmor':material('Rune • patinated blue titanium',(.19,.31,.34),metallic=.73,rough=.4),
 'copper':material('Salvage brass',(.50,.31,.14),metallic=.8,rough=.35),
 'copperDark':material('Tarnished bronze',(.23,.12,.061),metallic=.78,rough=.5),
 'cyan':material('Reclaimed energy • cyan',(.19,.73,.70),metallic=.15,rough=.25,emission=2.3),
 'pink':material('Temporal energy • violet',(.58,.19,.61),metallic=.12,rough=.22,emission=2.0),
 'gem':material('Temporal focus • glassy obsidian',(.085,.08,.19),metallic=.5,rough=.13),
}

def pivot(name, loc=(0,0,0), parent=None):
    o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o)
    PIVOTS[o.name]=Vector(loc)
    if parent: o.parent=parent; o.location=Vector(loc)-PIVOTS[parent.name]
    else: o.location=loc
    o.empty_display_type='PLAIN_AXES'; o.empty_display_size=.045
    return o

def attach(o, parent):
    if parent:
        o.parent=parent; o.location-=PIVOTS[parent.name]
    return o

def finish(o, mat, parent, smooth=True, bevel=0, sub=0):
    o.data.materials.append(M[mat] if isinstance(mat,str) else mat)
    if smooth:
        for p in o.data.polygons:p.use_smooth=True
    if bevel:
        mod=o.modifiers.new('Hand-rounded edges','BEVEL');mod.width=bevel;mod.segments=3
    if sub:
        mod=o.modifiers.new('Sculpted surface','SUBSURF');mod.levels=sub;mod.render_levels=sub
    attach(o,parent);return o

def mesh(name, verts, faces, mat, parent, sub=0, bevel=0):
    d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update()
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o)
    return finish(o,mat,parent,sub=sub,bevel=bevel)

def ellipsoid(name,loc,scale,mat,parent,segments=32,rings=20,rot=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=loc)
    o=bpy.context.object;o.name=name;o.scale=scale
    if rot:o.rotation_euler=rot
    return finish(o,mat,parent)

def rounded(name, loc, scale, mat, parent, bevel=.015, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=bpy.context.object;o.name=name;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if rot:o.rotation_euler=rot
    return finish(o,mat,parent,bevel=bevel)

def curve(name,points,radius,mat,parent,res=3,cyclic=False):
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=1 if len(points)>20 else 4
    cu.bevel_depth=radius;cu.bevel_resolution=min(res,1 if radius<.004 else 2)
    sp=cu.splines.new('BEZIER');sp.bezier_points.add(len(points)-1)
    for b,p in zip(sp.bezier_points,points):b.co=p;b.handle_left_type='AUTO';b.handle_right_type='AUTO'
    sp.use_cyclic_u=cyclic
    o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o)
    cu.materials.append(M[mat]);attach(o,parent);return o

def circle(name,center,rx,ry,mat,parent,r=.006,plane='xy',n=48):
    pts=[]
    for i in range(n):
        a=i*math.tau/n
        off=(math.cos(a)*rx,math.sin(a)*ry,0) if plane=='xy' else (math.cos(a)*rx,0,math.sin(a)*ry)
        pts.append(tuple(Vector(center)+Vector(off)))
    return curve(name,pts,r,mat,parent,res=2,cyclic=True)

def loft(name,rings,mat,parent,n=40,sub=1,cap=True,fold=0):
    # rings: (x,y,z, horizontal radius, depth radius), organic tailored forms
    verts=[];faces=[]
    for j,(cx,cy,z,rx,ry) in enumerate(rings):
        for i in range(n):
            a=i*math.tau/n
            f=1+fold*math.cos(a*7+j*.55)
            verts.append((cx+math.sin(a)*rx*f,cy-math.cos(a)*ry*f,z))
    for j in range(len(rings)-1):
        for i in range(n):a=j*n+i;b=j*n+(i+1)%n;faces.append((a,b,b+n,a+n))
    if cap:faces.extend([tuple(range(n-1,-1,-1)),tuple((len(rings)-1)*n+i for i in range(n))])
    return mesh(name,verts,faces,mat,parent,sub=sub)

def catmull(points,steps=5):
    p=[Vector(points[0])]+[Vector(q) for q in points]+[Vector(points[-1])]
    out=[]
    for i in range(1,len(p)-2):
        for j in range(steps):
            t=j/steps
            out.append(.5*((2*p[i])+(-p[i-1]+p[i+1])*t+(2*p[i-1]-5*p[i]+4*p[i+1]-p[i+2])*t*t+(-p[i-1]+3*p[i]-3*p[i+1]+p[i+2])*t*t*t))
    return out+[Vector(points[-1])]

def lock(name,points,width,mat,parent,depth=.65,steps=5):
    pts=catmull(points,steps);verts=[];faces=[];n=8
    for j,p in enumerate(pts):
        tangent=(pts[min(j+1,len(pts)-1)]-pts[max(0,j-1)]).normalized()
        normal=tangent.cross(Vector((0,1,0)))
        if normal.length<.05:normal=tangent.cross(Vector((1,0,0)))
        normal.normalize();binormal=tangent.cross(normal).normalized()
        taper=(.45+.65*math.sin(math.pi*j/(len(pts)-1)))*(1-j/(len(pts)-1)*.65)
        if j==len(pts)-1:taper=.025
        for k in range(n):
            a=k*math.tau/n
            verts.append(tuple(p+width*taper*(normal*math.cos(a)+binormal*math.sin(a)*depth)))
    for j in range(len(pts)-1):
        for k in range(n):a=j*n+k;b=j*n+(k+1)%n;faces.append((a,b,b+n,a+n))
    faces.extend([tuple(range(n-1,-1,-1)),tuple((len(pts)-1)*n+i for i in range(n))])
    return mesh(name,verts,faces,mat,parent,sub=1)

def plate(name,outline,y,depth,mat,parent,bevel=.01):
    # beveled armor polygon, outline is (x,z) in forward plane
    verts=[(x,y,z) for x,z in outline]+[(x,y+depth,z) for x,z in outline]
    n=len(outline);faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,verts,faces,mat,parent,bevel=bevel)

def ribbon(name,points,width,mat,parent,thick=.006,sub=1):
    pts=catmull(points,6);verts=[];faces=[]
    for j,p in enumerate(pts):
        side=Vector((1,0,0));w=width*(.94+.06*math.sin(j*.8))
        for k in range(5):
            t=k/4-.5
            verts.append(tuple(p+side*t*w+Vector((0,math.sin(k*math.pi)*.006,0))))
    for j in range(len(pts)-1):
        for k in range(4):a=j*5+k;faces.append((a,a+1,a+6,a+5))
    o=mesh(name,verts,faces,mat,parent,sub=sub)
    mod=o.modifiers.new('Fabric thickness','SOLIDIFY');mod.thickness=thick
    return o

def cape(name,parent,mat,lining,zTop=1.46,zBottom=.39,width=.57,back=.18,flare=.19):
    verts=[];faces=[];nx=24;nz=26
    for j in range(nz+1):
        t=j/nz
        for i in range(nx+1):
            u=i/nx*2-1
            x=u*width*(.60+.40*t)
            y=back+flare*t+.042*math.cos(u*math.pi*5)*(.20+.80*t)+.035*u*u
            z=zTop-(zTop-zBottom)*t-.035*math.cos(u*8)*t**6
            verts.append((x,y,z))
    for j in range(nz):
        for i in range(nx):a=j*(nx+1)+i;faces.append((a,a+1,a+nx+2,a+nx+1))
    o=mesh(name,verts,faces,mat,parent,sub=1)
    mod=o.modifiers.new('Lined woven thickness','SOLIDIFY');mod.thickness=.008
    # Fine contrast hand-bound edges and a double seam near the hem.
    for side in [-1,1]:
        pts=[]
        for j in range(8):
            t=j/7;u=side
            pts.append((u*width*(.60+.40*t),back+flare*t+.042*math.cos(u*math.pi*5)*(.20+.80*t)+.035,zTop-(zTop-zBottom)*t-.035*math.cos(u*8)*t**6))
        curve(name+' bound edge',pts,.005,lining,parent)
    for inset in [.014,.032]:
        pts=[]
        for i in range(25):
            u=i/24*2-1;t=1-inset/(zTop-zBottom)
            pts.append((u*width*(.60+.40*t),back+flare*t+.042*math.cos(u*math.pi*5)*(.20+.80*t)+.035*u*u+.005,zTop-(zTop-zBottom)*t-.035*math.cos(u*8)*t**6))
        curve(name+' hem stitches',pts,.0025,lining,parent,res=1)

def face(hero,parent):
    skin={'kaida':'skinK','vex':'skinV','rune':'skinR'}[hero]
    lip={'kaida':'lipK','vex':'lipV','rune':'lipR'}[hero]
    brow={'kaida':'hairKDark','vex':'hairVDark','rune':'hairR'}[hero]
    shade='skinShadeV' if hero=='vex' else 'skinShade'
    mass=1.055 if hero=='rune' else .95 if hero=='vex' else 1
    rings=[(1.522,.040,.057),(1.535,.063,.072),(1.555,.083,.086),(1.590,.111,.097),(1.633,.128,.112),(1.676,.139,.122),(1.719,.140,.119),(1.755,.142,.121),(1.792,.142,.125),(1.831,.130,.119),(1.866,.109,.105),(1.895,.073,.073),(1.908,.014,.020)]
    verts=[];faces=[];n=64
    for z,rx,ry in rings:
        for i in range(n):
            a=i*math.tau/n;x=math.sin(a)*rx*mass;y=-math.cos(a)*ry
            if y<0:
                # Anatomical cheek pads, eye sockets, and the forward chin.
                y-=.010*math.exp(-((abs(x)-.079)/.042)**2-((z-1.666)/.04)**2)
                y+=.008*math.exp(-((abs(x)-.058)/.03)**2-((z-1.737)/.022)**2)
                y-=.010*math.exp(-(x/.042)**2-((z-1.566)/.032)**2)
            verts.append((x,y,z))
    for j in range(len(rings)-1):
        for i in range(n):a=j*n+i;b=j*n+(i+1)%n;faces.append((a,b,b+n,a+n))
    faces += [tuple(range(n-1,-1,-1)),tuple((len(rings)-1)*n+i for i in range(n))]
    mesh(hero+' sculpted face',verts,faces,skin,parent,sub=2)
    loft('Neck with subtle throat',[(0,.018,1.435,.068,.060),(0,.009,1.48,.066,.061),(0,.012,1.545,.059,.057),(0,.012,1.595,.068,.064)],skin,parent,n=32,sub=1)
    # Soft asymmetrical nose planes are modeled, not painted.
    loft('Bridge and alar nose',[(0,-.117,1.774,.008,.004),(0,-.131,1.752,.011,.015),(0,-.144,1.714,.013,.019),(0,-.159,1.695,.020,.023),(0,-.146,1.680,.026,.012),(0,-.129,1.674,.013,.004)],skin,parent,n=24,sub=2)
    for s in [-1,1]:
        ellipsoid('Nostril', (s*.015,-.157,1.681),(.006,.0027,.003),shade,parent,segments=16,rings=8)
        ellipsoid('Auricle', (s*.141*mass,.003,1.691),(.021,.029,.046),skin,parent,segments=24,rings=16,rot=(0,s*.10,s*.1))
        ellipsoid('Ear concha', (s*.151*mass,-.020,1.688),(.010,.006,.022),lip,parent,segments=16,rings=12)
        curve('Sculpted helix',[(s*.143*mass,-.020,1.654),(s*.158*mass,-.021,1.675),(s*.158*mass,-.018,1.716),(s*.145*mass,-.022,1.725)],.004,skin,parent,res=2)
        x=s*.059*mass;y=-.118;z=1.741
        ellipsoid('Eye sclera',(x,y-.003,z),(.027,.011,.012),'eyeWhite',parent,segments=28,rings=16)
        iris={'kaida':'eyeAmber','vex':'eyeViolet','rune':'eyeGreen'}[hero]
        ellipsoid('Colored iris',(x+s*.001,y-.013,z),(.009,.0034,.0095),iris,parent,segments=24,rings=16)
        ellipsoid('Pupil',(x+s*.001,y-.016,z),(.0038,.0014,.0052),'pupil',parent,segments=16,rings=12)
        ellipsoid('Wet eye glint',(x-.002,y-.0177,z+.003),(.0018,.001,.0018),'glint',parent,segments=12,rings=8)
        curve('Upper sculpted eyelid',[(x-.027,y-.003,z-.001),(x-.014,y-.012,z+.010),(x+.006,y-.014,z+.011),(x+.027,y-.003,z-.001)],.0038,skin,parent,res=2)
        curve('Lower sculpted eyelid',[(x-.027,y-.003,z-.001),(x-.010,y-.012,z-.008),(x+.010,y-.012,z-.008),(x+.027,y-.003,z-.001)],.0031,skin,parent,res=2)
        curve('Upper lash line',[(x-.025,y-.004,z+.001),(x-.009,y-.014,z+.008),(x+.010,y-.013,z+.008),(x+.025,y-.005,z)],.0016,brow,parent,res=2)
        lock('Tapered brow',[(x-s*.026,-.116,1.773),(x-s*.008,-.127,1.780),(x+s*.017,-.120,1.777),(x+s*.033,-.105,1.771)],.007,brow,parent,depth=.4,steps=3)
    curve('Cupid upper lip',[(-.030,-.116,1.638),(-.014,-.127,1.645),(0,-.130,1.641),(.014,-.127,1.645),(.030,-.116,1.639)],.0035,lip,parent,res=3)
    curve('Soft lower lip',[(-.028,-.116,1.636),(-.013,-.126,1.630),(0,-.129,1.629),(.014,-.125,1.632),(.029,-.116,1.638)],.0040,lip,parent,res=3)
    curve('Mouth parting',[(-.029,-.120,1.638),(-.012,-.131,1.637),(0,-.132,1.637),(.017,-.127,1.639),(.029,-.118,1.640)],.0013,shade,parent,res=1)
    if hero=='kaida':
        for s in [-1,1]:
            for i in range(5):
                x=s*(.078+(i%3)*.012);z=1.702-(i//3)*.01
                ellipsoid('Sun freckle',(x,-.114+(abs(x)-.08)*.25,z),(.0016,.001,.0016),'lipK',parent,segments=8,rings=6)
        curve('Fine cheek scar',[(.103,-.091,1.728),(.096,-.107,1.709),(.099,-.109,1.687)],.0017,'skinK',parent,res=1)
        curve('Brass earring',[(-.159,-.024,1.674),(-.164,-.024,1.644),(-.155,-.024,1.633),(-.147,-.024,1.647)],.0025,'copper',parent)
        ellipsoid('Turquoise earring',(-.158,-.025,1.629),(.006,.004,.009),'cyan',parent,segments=16,rings=10)
    if hero=='vex':
        curve('Long chronometer earring',[(-.155,-.026,1.665),(-.158,-.027,1.622),(-.152,-.027,1.587)],.0022,'steelLight',parent)
        lock('Earring crystal',[(-.152,-.027,1.610),(-.152,-.027,1.593),(-.152,-.027,1.569)],.008,'pink',parent,depth=.65,steps=3)
    if hero=='rune':
        for i in range(60):
            a=random.uniform(-1.1,1.1);z=random.uniform(1.554,1.612)
            x=math.sin(a)*(.079+(z-1.554)*.46);y=-math.cos(a)*(.088+(z-1.554)*.4)-.004
            curve('Salt-and-pepper stubble',[(x,y,z),(x+.001,y-.001,z+.004)],.0009,'hairRLight' if i%5==0 else 'hairR',parent,res=1)
        for z in [1.803,1.818]:curve('Forehead expression line',[(-.055,-.111,z),(0,-.128,z+.003),(.045,-.115,z)],.0012,'skinShade',parent,res=1)
        curve('Old temple scar',[(.019,-.123,1.786),(.030,-.123,1.765),(.018,-.130,1.744),(.025,-.134,1.720)],.002,'lipK',parent,res=1)

def hair(hero,parent):
    main={'kaida':'hairK','vex':'hairV','rune':'hairR'}[hero]
    light={'kaida':'hairKLight','vex':'hairVLight','rune':'hairRLight'}[hero]
    dark={'kaida':'hairKDark','vex':'hairVDark','rune':'hairR'}[hero]
    # Hair cap has an irregular, deliberately high open hairline.
    verts=[];faces=[];n=48;nr=14
    for j in range(nr+1):
        for i in range(n):
            a=i*math.tau/n
            bottom=1.805 if math.cos(a)>.35 else 1.665
            if hero=='rune':bottom=1.802 if math.cos(a)>.1 else 1.731
            z=1.918-(1.918-bottom)*j/nr
            rad=math.sqrt(max(.006,1-((z-1.723)/.205)**2))
            verts.append((math.sin(a)*.15*rad,-math.cos(a)*.14*rad+.012,z))
    for j in range(nr):
        for i in range(n):a=j*n+i;b=j*n+(i+1)%n;faces.append((a,a+n,b+n,b))
    mesh(hero+' shaped hair underlayer',verts,faces,dark,parent,sub=1)
    if hero=='kaida':
        for i in range(9):
            d=i*.010
            pts=[(.075-d*.4,-.043+d*.15,1.915),(.017-d*.45,-.110-d*.07,1.882),(-.075-d*.35,-.131+d*.18,1.804),(-.131-d*.13,-.095+d*.15,1.698+i*.004)]
            lock('Swept auburn fringe',pts,.023,main if i%3 else light,parent,depth=.6)
            if i%2==0:curve('Copper hair filament',[(x-.004,y-.010,z+.001) for x,y,z in pts[:-1]],.0016,light,parent,res=1)
        for s in [-1,1]:
            for i in range(7):
                a=.4+i*.21
                pts=[(s*.09, .025+i*.006,1.90-i*.007),(s*(.135+i*.003),.025+i*.011,1.807),(s*(.149+i*.005),.047+i*.015,1.681),(s*(.128+i*.009),.093+i*.009,1.559),(s*(.153+i*.006),.047+i*.01,1.506+i*.015)]
                lock('Layered shoulder-length hair',pts,.026,main if i%3 else light,parent,depth=.58)
        # Tied crown section fans into a curved, tapered ponytail.
        for i in range(8):
            d=(i-3.5)*.012
            lock('Flowing tied back hair',[(.035+d,.092,1.845),(.055+d,.18,1.80),(.07+d,.241,1.69),(.105+d,.251,1.53),(.084+d,.294,1.447)],.032,main if i%3 else light,parent,depth=.58)
        circle('Leather hair tie',(.055,.182,1.786),.057,.030,'leatherLight',parent,r=.009,plane='xz')
    elif hero=='vex':
        for i in range(9):
            d=i*.009
            pts=[(.067-d*.35,-.017,1.924),(.030-d*.65,-.100,1.892),(-.054-d*.40,-.136+d*.15,1.819),(-.131-d*.07,-.088+d*.11,1.687+i*.010)]
            lock('Silver temporal swept fringe',pts,.023,main if i%3 else light,parent,depth=.55)
        for s in [-1,1]:
            for i in range(4):
                pts=[(s*(.10+i*.011),.016,1.846),(s*(.145+i*.005),-.032,1.757),(s*(.147+i*.007),-.036,1.638),(s*(.132+i*.006),-.047,1.562+i*.018)]
                lock('Long tapered silver side lock',pts,.023,main if i%2 else light,parent,depth=.45)
    else:
        for i in range(17):
            x=(i-8)*.011
            lock('Short swept steel hair',[(x,-.104+abs(x)*.32,1.843),(x-.005,-.033,1.920-abs(x)*.14),(x-.008,.055,1.889-abs(x)*.15)],.012,main if i%3 else light,parent,depth=.45,steps=4)
        for s in [-1,1]:
            for i in range(8):
                z=1.758+i*.012
                curve('Clipped silver temple strand',[(s*.141,.021,z),(s*.139,-.013,z+.010)],.0015,light,parent,res=1)

def boot(hero,side,parent,mass=1):
    x=side*.13*mass;armor=hero=='rune'
    # Curved fitted calf, heel, instep and layered sole instead of box feet.
    loft('Fitted boot shaft',[(x,.017,.16,.080,.090),(x,.011,.24,.076,.079),(x,.014,.34,.089,.086),(x,.013,.47,.093,.095),(x,.014,.48,.091,.092)],'leather' if not armor else 'runeCloth',parent,n=32,sub=1,fold=.025)
    ellipsoid('Shaped leather instep',(x,-.075,.122),(.087,.162,.083),'leather',parent,segments=32,rings=16)
    loft('Contoured stacked sole',[(x,-.065,.025,.087,.162),(x,-.065,.039,.093,.167),(x,-.065,.063,.093,.168),(x,-.065,.074,.086,.160)],'sole',parent,n=36,sub=1)
    for z in [.039,.055]:circle('Boot welt',(x,-.065,z),.092,.164,'leatherLight',parent,r=.0025)
    ellipsoid('Reinforced toe cap',(x,-.160,.095),(.088,.071,.057),'runeArmor' if armor else 'steelDark',parent,segments=28,rings=16)
    for z in [.25,.405]:
        circle('Boot strap',(x,.010,z),.082 if z<.3 else .091,.085 if z<.3 else .094,'leatherLight',parent,r=.014)
        rounded('Boot strap clasp',(x+side*.059,-.059,z),(.033,.014,.043),'copper',parent,bevel=.004)
        rounded('Clasp inset',(x+side*.059,-.068,z),(.016,.006,.025),'leather',parent,bevel=.002)
    if armor:
        plate('Sculpted greave',[(x-.085,.43),(x,.49),(x+.085,.43),(x+.073,.20),(x,.165),(x-.073,.20)],-.096,.042,'runeArmor',parent,bevel=.014)
        plate('Greave face bevel',[(x-.060,.418),(x,.46),(x+.060,.418),(x+.048,.225),(x,.20),(x-.048,.225)],-.120,.020,'steel',parent,bevel=.008)
        curve('Greave energy inset',[(x,-.141,.245),(x,-.141,.347),(x,-.129,.413)],.005,'cyan',parent)
    else:
        for i in range(6):
            z=.26+i*.023
            curve('Crossed boot lacing',[(x-.028,-.076,z),(x+.026,-.082,z+.019)],.0024,'leatherLight',parent,res=1)
        curve('Boot long seam',[(x+side*.07,.047,.23),(x+side*.08,.053,.42)],.002,'tealLight' if hero=='kaida' else 'violetLight',parent,res=1)

def hand(hero,side,parent,x,z=.86):
    cloth='leather' if hero!='vex' else 'violetShade'
    ellipsoid('Contoured gloved palm',(x,-.006,z),(.051,.043,.065),cloth,parent,segments=24,rings=16,rot=(0,side*-.08,0))
    # Four separate curved fingers and a thumb make a clear articulated hand.
    for i in range(4):
        xx=x+(i-1.5)*.019
        lock('Gloved articulated finger',[(xx,-.014,z-.027),(xx,-.029,z-.070),(xx,-.057,z-.079),(xx,-.068,z-.059)],.010,cloth,parent,depth=.88,steps=3)
        ellipsoid('Finger knuckle',(xx,-.043,z-.033),(.008,.006,.010),'steelDark' if hero=='rune' else 'leatherLight',parent,segments=12,rings=8)
    lock('Opposed gloved thumb',[(x-side*.037,-.005,z+.013),(x-side*.062,-.017,z-.011),(x-side*.055,-.051,z-.032)],.016,cloth,parent,depth=.8,steps=4)
    if hero!='vex':plate('Hand dorsal plate',[(x-.038,z+.035),(x+.038,z+.035),(x+.039,z-.019),(x,z-.046),(x-.039,z-.019)],-.044,.009,'runeArmor' if hero=='rune' else 'steelDark',parent,bevel=.005)

def humanoid(hero):
    root=pivot(hero);body=pivot('body',(0,0,0),root)
    mass=1.17 if hero=='rune' else .95 if hero=='vex' else 1
    cloth={'kaida':'teal','vex':'violet','rune':'runeCloth'}[hero]
    # Clothing is sewn around anatomical form, with a defined waist and ribcage.
    loft('Tailored anatomical torso',[(0,.008,.92,.168*mass,.106),(0,.008,.98,.182*mass,.115),(0,.009,1.06,.152*mass,.105),(0,.012,1.17,.173*mass,.118),(0,.016,1.32,.218*mass,.132),(0,.018,1.42,.234*mass,.119),(0,.015,1.47,.193*mass,.099),(0,.010,1.49,.118,.069)],cloth,body,n=40,sub=2,fold=.012)
    loft('Tailored hip and pelvis',[(0,.019,.855,.172*mass,.112),(0,.020,.94,.197*mass,.124),(0,.012,1.02,.164*mass,.112)],cloth,body,n=36,sub=1)
    legs=[];knees=[];arms=[]
    for side,name in [(-1,'left'),(1,'right')]:
        x=side*.13*mass;leg=pivot(name+'Leg',(x,.012,.935),body);legs.append(leg)
        loft('Sewn thigh',[(x,.014,.91,.109,.103),(x,.019,.86,.112,.111),(x,.024,.74,.105,.102),(x,.027,.60,.087,.083),(x,.014,.53,.073,.071)],cloth,leg,n=32,sub=1,fold=.025)
        knee=pivot(name+'Knee',(x,.012,.53),leg);knees.append(knee)
        ellipsoid('Anatomical knee',(x,.006,.526),(.077,.076,.091),cloth,knee,segments=24,rings=16)
        if hero!='vex':
            plate('Beveled knee shell',[(x-.068,.584),(x,.603),(x+.068,.584),(x+.073,.516),(x,.472),(x-.073,.516)],-.078,.041,'runeArmor' if hero=='rune' else 'steelDark',knee,bevel=.013)
            curve('Knee inset bevel',[(x-.047,-.118,.558),(x,-.121,.576),(x+.047,-.118,.558)],.003,'copper',knee)
        boot(hero,side,knee,mass)
        ax=side*.265*mass;arm=pivot(name+'Arm',(ax,.010,1.426),body);arms.append(arm)
        loft('Fitted upper sleeve',[(ax,.01,1.45,.095,.105),(ax+side*.020,.005,1.40,.106,.109),(ax+side*.024,.01,1.29,.082,.081),(ax+side*.028,.006,1.20,.069,.074),(ax+side*.030,0,1.135,.064,.067)],cloth,arm,n=32,sub=1,fold=.04)
        ellipsoid('Soft elbow articulation',(ax+side*.030,.012,1.135),(.070,.071,.074),cloth,arm,segments=24,rings=16)
        loft('Fitted forearm sleeve',[(ax+side*.030,0,1.14,.069,.070),(ax+side*.033,-.002,1.07,.075,.072),(ax+side*.033,-.005,.97,.061,.060),(ax+side*.035,-.004,.919,.046,.05)],cloth,arm,n=32,sub=1,fold=.035)
        hand(hero,side,arm,ax+side*.035,.865)
    head=pivot('head',(0,.010,1.535),body)
    face(hero,head);hair(hero,head)
    cloak=pivot('cloak',(0,.13,1.445),body)
    weapon=pivot('weapon',(PIVOTS[arms[1].name].x+.035,-.05,.856),arms[1])
    return root,body,head,arms,legs,knees,cloak,weapon

def kaida_details(body,head,arms,legs,knees,cloak,weapon):
    # High tailored collar, diagonal leather baldric, articulated cuirass panels.
    loft('High asymmetric jacket collar',[(0,.008,1.408,.096,.085),(0,.014,1.44,.092,.080),(0,.018,1.494,.088,.075)],'tealShade',body,n=32,sub=1)
    for side in [-1,1]:
        curve('Jacket princess seam',[(side*.178,-.059,1.431),(side*.146,-.093,1.30),(side*.117,-.096,1.12),(side*.146,-.109,1.016)],.003,'tealLight',body)
        ribbon('Split tailored coat tail',[(side*.115,.043,1.006),(side*.163,.075,.905),(side*.18,.112,.70),(side*.215,.129,.60)],.23,'teal',cloak,sub=1)
        curve('Coat-tail seam',[(side*.22,.069,.943),(side*.244,.098,.81),(side*.29,.132,.624)],.003,'tealLight',cloak)
    plate('Layered chest armor left',[(-.191,1.366),(-.034,1.401),(-.036,1.20),(-.144,1.167),(-.205,1.26)],-.119,.035,'steelDark',body,bevel=.017)
    plate('Layered chest armor right',[(.026,1.402),(.183,1.37),(.204,1.259),(.150,1.17),(.034,1.202)],-.119,.035,'tealShade',body,bevel=.014)
    curve('Cuirass brass edge',[(-.184,-.156,1.358),(-.050,-.160,1.384),(-.049,-.160,1.21),(-.144,-.148,1.188)],.0035,'copper',body)
    for z in [1.073,1.032]:circle('Wide waist belt',(0,.010,z),.181,.119,'leather',body,r=.023)
    rounded('Belt buckle',(.008,-.119,1.054),(.082,.025,.071),'copper',body,bevel=.008)
    rounded('Buckle inset',(.008,-.136,1.054),(.050,.012,.043),'leather',body,bevel=.003)
    curve('Buckle prong',[(.003,-.145,1.052),(.034,-.145,1.052)],.003,'copper',body)
    # Diagonal strap follows the tailored chest, with punched holes and a buckle.
    for delta in [-.016,0,.016]:curve('Broad sword baldric',[(-.198+delta,-.085,1.434),(-.117+delta,-.151,1.321),(.003+delta,-.159,1.176),(.12+delta,-.119,1.037)],.014,'leather',body)
    curve('Baldric stitching',[(-.216,-.099,1.424),(-.135,-.171,1.312),(-.017,-.173,1.169),(.102,-.140,1.032)],.0018,'leatherLight',body,res=1)
    rounded('Baldric brass keeper',(-.107,-.178,1.302),(.064,.015,.069),'copper',body,bevel=.005,rot=(0,-.66,0))
    rounded('Baldric keeper inset',(-.107,-.189,1.302),(.037,.008,.045),'leather',body,bevel=.002,rot=(0,-.66,0))
    for i in range(4):ellipsoid('Strap punched hole',(.037+i*.012,-.157+i*.004,1.117-i*.015),(.0018,.0015,.002),'sole',body,segments=8,rings=6)
    # Belt pouches with flaps, closure tabs, and stitched rims.
    for side in [-1,1]:
        x=side*.195
        rounded('Weathered belt pouch',(x,-.022,.973),(.107,.097,.134),'leather',body,bevel=.025,rot=(0,side*.14,0))
        rounded('Pouch folded flap',(x,-.073,1.019),(.112,.017,.071),'leatherLight',body,bevel=.016)
        ellipsoid('Pouch brass snap',(x,-.085,.999),(.010,.004,.010),'copper',body,segments=16,rings=10)
    # Draped scarf: several overlapping asymmetric curved linen bands.
    for j in range(4):
        pts=[]
        for i in range(13):
            a=i/12*math.tau
            pts.append((math.sin(a)*(.105+j*.010),-math.cos(a)*(.100+j*.006),1.472-j*.020+.008*math.sin(a*2+j)))
        curve('Wrapped scarf fold',pts,.022,'scarf',body,res=4,cyclic=True)
    curve('Scarf sun-faded rim',[(-.114,-.047,1.493),(-.090,-.115,1.477),(.0,-.133,1.466),(.090,-.114,1.479),(.126,-.05,1.476)],.003,'scarfLight',body)
    ribbon('Long wind-shaped scarf tail',[(.069,.095,1.444),(.147,.197,1.384),(.229,.28,1.20),(.321,.302,1.023),(.347,.365,.879)],.142,'scarf',cloak,sub=2)
    curve('Scarf bound edge',[(.006,.095,1.444),(.082,.197,1.38),(.158,.28,1.2),(.253,.30,1.023),(.28,.365,.88)],.003,'scarfLight',cloak)
    for i in range(9):curve('Scarf loose fringe',[(.286+i*.014,.365,.885),(.290+i*.014,.373,.856-random.random()*.014)],.0018,'scarfLight',cloak,res=1)
    for side,arm in zip([-1,1],arms):
        ax=side*.265
        ellipsoid('Forged pauldron',(ax+side*.006,.012,1.416),(.134,.149,.107),'steel' if side<0 else 'steelDark',arm,segments=32,rings=20)
        circle('Pauldron raised rim',(ax+side*.010,.012,1.387),.128,.142,'copper',arm,r=.005)
        plate('Pauldron face inset',[(ax-.089,1.432),(ax,1.477),(ax+.083,1.43),(ax+.064,1.355),(ax-.068,1.356)],-.119,.019,'steelDark',arm,bevel=.009)
        for xx in [-.065,.065]:ellipsoid('Shoulder rivet',(ax+xx,-.142,1.386),(.008,.004,.008),'copper',arm,segments=12,rings=8)
        plate('Layered forearm bracer',[(ax-.044,1.115),(ax+.094,1.115),(ax+.098,.978),(ax+.022,.935),(ax-.039,.976)],-.070,.032,'steelDark',arm,bevel=.012)
        curve('Bracer raised ridge',[(ax+.029,-.109,.966),(ax+.027,-.112,1.074),(ax+.019,-.101,1.115)],.004,'steelLight',arm)
        for z in [1.00,1.09]:circle('Bracer leather tie',(ax+side*.033,-.002,z),.076,.077,'leatherLight',arm,r=.010)
    # Custom forged sword: tapered, gently swept double-sided bevel and fullers.
    wx=PIVOTS[weapon.name].x
    curve('Sword wrapped hilt',[(wx,-.070,.792),(wx,-.065,.924)],.021,'leather',weapon,res=4)
    for z in [.804,.824,.844,.864,.884,.904]:circle('Copper hilt winding',(wx,-.066,z),.021,.021,'copperDark',weapon,r=.003)
    ellipsoid('Sword pommel',(wx,-.065,.932),(.026,.027,.031),'copper',weapon,segments=24,rings=12)
    lock('Swept sword guard',[(wx-.122,-.067,.776),(wx-.055,-.092,.799),(wx,-.075,.804),(wx+.055,-.057,.799),(wx+.123,-.034,.813)],.025,'copper',weapon,depth=.48,steps=4)
    blade=[(wx-.038,.788),(wx+.035,.788),(wx+.034,.318),(wx+.015,.183),(wx-.009,.126),(wx-.040,.308)]
    plate('Hand-forged blade bevel',blade,-.082,.038,'steelLight',weapon,bevel=.003)
    plate('Blade dark fuller',[(wx-.013,.766),(wx+.009,.766),(wx+.005,.309),(wx-.010,.242)],-.087,.003,'steelDark',weapon,bevel=.001)
    curve('Fine cyan blade channel',[(wx+.020,-.090,.750),(wx+.018,-.090,.342),(wx+.005,-.090,.218)],.0025,'cyan',weapon,res=1)
    # Sheathed utility knife along the hip.
    lock('Weathered short scabbard',[(-.18,.086,1.04),(-.243,.146,.76),(-.259,.159,.66)],.035,'leather',body,depth=.6)
    curve('Utility knife grip',[(-.175,.082,1.02),(-.152,.059,1.126)],.021,'leatherLight',body)

def vex_details(body,head,arms,legs,knees,cloak,weapon):
    cape('Vex • fully lined flowing cloak',cloak,'violet','violetLight',zBottom=.22,width=.39,back=.15,flare=.17)
    # Robe skirt is split down the front: each tailored panel has shaped folds.
    for side in [-1,1]:
        ribbon('Split silk-velvet robe front',[(side*.11,-.046,1.052),(side*.147,-.095,.861),(side*.165,-.08,.57),(side*.199,-.032,.27)],.23,'violet',cloak,sub=2)
        curve('Robe embroidered open edge',[(side*.015,-.053,1.023),(side*.029,-.104,.833),(side*.047,-.092,.573),(side*.087,-.049,.275)],.004,'copperDark',cloak)
    # Anatomically shaped high collar rises behind the cheekbones.
    for side in [-1,1]:
        plate('High velvet collar',[(side*.032,1.38),(side*.107,1.54),(side*.147,1.587),(side*.191,1.43),(side*.104,1.322)],-.062,.022,'violetLight',body,bevel=.013)
        curve('Collar bound embroidery',[(side*.044,-.091,1.383),(side*.113,-.082,1.535),(side*.146,-.072,1.568),(side*.177,-.072,1.439)],.003,'copper',body)
    # Sculpted hood, open in front with a proper curved rim and fabric thickness.
    verts=[];faces=[];n=30;nr=17
    for j in range(nr+1):
        t=j/nr;z=1.514+.483*t
        radius=.198*math.sqrt(max(.035,1-((z-1.738)/.266)**2))+.015
        for i in range(n+1):
            a=-2.17+i/n*4.34
            verts.append((math.sin(a)*radius,math.cos(a)*radius+.038,z+.015*math.cos(a)*t))
    for j in range(nr):
        for i in range(n):a=j*(n+1)+i;faces.append((a,a+1,a+n+2,a+n+1))
    hood=mesh('Structured open velvet hood',verts,faces,'violet',head,sub=1)
    mod=hood.modifiers.new('Hood lining thickness','SOLIDIFY');mod.thickness=.012
    for side in [-1,1]:
        pts=[]
        for j in range(nr+1):
            t=j/nr;z=1.514+.483*t;r=.198*math.sqrt(max(.035,1-((z-1.738)/.266)**2))+.015
            pts.append((math.sin(side*2.17)*r,math.cos(side*2.17)*r+.033,z+.015*math.cos(side*2.17)*t))
        curve('Hood soft silk rim',pts,.006,'violetLight',head)
    # Celestial embroidered clock-lines are modeled fine threads.
    for side in [-1,1]:
        for i in range(4):
            z=1.04+i*.068;x=side*(.115+i*.008)
            curve('Observatory script woven on chest',[(x-side*.014,-.115,z-.014),(x,-.127,z),(x+side*.014,-.115,z-.012),(x,-.125,z-.027)],.0018,'copperDark',body,res=1)
    circle('Twined belt',(0,.016,1.028),.166,.115,'leather',body,r=.019)
    for z in [1.014,1.044]:circle('Belt embroidered binding',(0,.016,z),.168,.117,'copperDark',body,r=.003)
    plate('Chronometer clasp',[(-.039,1.078),(.039,1.078),(.052,1.025),(0,.984),(-.052,1.025)],-.123,.017,'steelDark',body,bevel=.007)
    ellipsoid('Chronometer clasp crystal',(0,-.147,1.034),(.018,.008,.024),'pink',body,segments=24,rings=16)
    # Chest focus, chain, and minute orbiting insets.
    curve('Fine focus necklace',[(-.084,-.065,1.474),(-.048,-.116,1.398),(0,-.142,1.347),(.048,-.116,1.398),(.084,-.065,1.474)],.0025,'copper',body)
    plate('Focus pendant silver frame',[(-.022,1.362),(0,1.386),(.025,1.363),(.020,1.334),(0,1.308),(-.021,1.334)],-.147,.009,'steelLight',body,bevel=.003)
    lock('Long luminous focus gem',[(0,-.160,1.371),(0,-.166,1.346),(0,-.163,1.317)],.013,'cyan',body,depth=.65,steps=3)
    # Off-center belt folio and hourglass phials.
    rounded('Weathered codex case',(-.185,.023,.94),(.13,.07,.17),'leather',body,bevel=.016,rot=(0,-.12,0))
    rounded('Codex brass cover inset',(-.185,-.016,.941),(.105,.009,.132),'copperDark',body,bevel=.008,rot=(0,-.12,0))
    for x in [.145,.183,.220]:
        ellipsoid('Sealed energy phial',(x,-.047,.951),(.013,.015,.039),'gem',body,segments=20,rings=12)
        circle('Phial brass cap',(x,-.047,.983),.014,.015,'copper',body,r=.005)
        curve('Phial contained light',[(x,-.060,.93),(x,-.060,.971)],.004,'pink',body)
    for side,arm in zip([-1,1],arms):
        ax=side*.265*.95
        loft('Flared embroidered cuff',[(ax+side*.033,-.002,1.097,.084,.087),(ax+side*.034,-.002,.968,.071,.074),(ax+side*.035,-.002,.919,.076,.077)],'violetLight',arm,n=32,sub=1,fold=.06)
        for z,r in [(1.086,.084),(.936,.075)]:circle('Cuff metallic piping',(ax+side*.035,-.002,z),r,r,'copperDark',arm,r=.004)
        for i in range(3):
            z=.97+i*.032
            curve('Cuff sigil',[(ax-.009,-.081,z),(ax+.022,-.089,z+.01),(ax+.047,-.079,z)],.002,'copper',arm,res=1)
        circle('Shoulder silk ring',(ax,.008,1.430),.101,.111,'violetLight',arm,r=.012)
    # Astrolabe staff, turned bronze fittings, inner orb, concentric orbit rings.
    wx=PIVOTS[weapon.name].x
    curve('Turned astrolabe staff',[(wx,-.045,.104),(wx,-.045,1.76)],.018,'copperDark',weapon,res=4)
    curve('Staff silver inlay',[(wx+.012,-.057,.18),(wx+.012,-.057,1.68)],.003,'steelLight',weapon)
    for z in [.17,.22,.67,.74,1.02,1.10,1.66,1.70]:circle('Turned staff ferrule',(wx,-.045,z),.021,.021,'copper',weapon,r=.008)
    for j in range(8):circle('Wrapped staff grip',(wx,-.045,.787+j*.019),.024,.025,'leatherLight',weapon,r=.006)
    circle('Outer astrolabe orbit',(wx,-.045,1.871),.147,.163,'copper',weapon,r=.009,plane='xz',n=64)
    circle('Inner astrolabe orbit',(wx,-.045,1.871),.104,.118,'steelLight',weapon,r=.005,plane='xz',n=48)
    ellipsoid('Void focus orb',(wx,-.045,1.871),(.071,.071,.071),'gem',weapon,segments=40,rings=28)
    circle('Energy suspended orbit',(wx,-.045,1.871),.089,.089,'pink',weapon,r=.0028,plane='xy',n=48)
    lock('Faceted hovering central crystal',[(wx,-.112,1.919),(wx,-.124,1.87),(wx,-.112,1.823)],.020,'pink',weapon,depth=.8,steps=3)
    for side in [-1,1]:
        lock('Crescent astrolabe horn',[(wx+side*.135,-.043,1.836),(wx+side*.127,-.043,1.953),(wx+side*.071,-.043,2.036)],.023,'steel',weapon,depth=.45)
        ellipsoid('Astrolabe mounting stud',(wx+side*.125,-.050,1.779),(.012,.009,.012),'copper',weapon,segments=16,rings=12)

def rune_details(body,head,arms,legs,knees,cloak,weapon):
    cape('Rune • short weathered campaign cloak',cloak,'runeCape','runeCapeLight',zBottom=.62,width=.37,back=.235,flare=.14)
    # Flexible ribbed neck seal and sculpted clavicle guards.
    for z in [1.457,1.475,1.493,1.511]:circle('Ribbed neck seal',(0,.012,z),.085,.078,'steelDark',body,r=.008)
    for side in [-1,1]:
        plate('Protective rising collar',[(side*.037,1.405),(side*.099,1.563),(side*.176,1.556),(side*.220,1.423),(side*.114,1.354)],-.060,.076,'runeArmor',body,bevel=.016)
        curve('Collar forged brass rim',[(side*.102,-.079,1.545),(side*.164,-.079,1.543),(side*.202,-.095,1.434),(side*.111,-.117,1.375)],.005,'copper',body)
    # Rounded cuirass follows ribcage, separate overlapping abdominal lames.
    loft('Anatomically forged breastplate',[(0,-.001,1.10,.173,.130),(0,.003,1.20,.206,.152),(0,.008,1.34,.256,.153),(0,.014,1.40,.249,.127),(0,.017,1.445,.170,.09)],'runeArmor',body,n=48,sub=2)
    for side in [-1,1]:
        plate('Beveled chest face panel',[(side*.027,1.404),(side*.190,1.396),(side*.234,1.332),(side*.185,1.20),(side*.034,1.174)],-.137,.036,'steel',body,bevel=.014)
        curve('Chest panel etched edge',[(side*.049,-.177,1.382),(side*.175,-.177,1.370),(side*.207,-.177,1.324),(side*.170,-.177,1.227),(side*.053,-.177,1.207)],.003,'steelLight',body)
    for j in range(3):
        z=1.04+j*.049
        plate('Overlapping articulated abdomen lame',[(-.175,z+.033),(0,z+.012),(.175,z+.033),(.165,z-.006),(0,z-.03),(-.165,z-.006)],-.130-j*.005,.045,'steelDark',body,bevel=.007)
        curve('Lame lower silver edge',[(-.159,-.170-j*.005,z-.002),(0,-.176-j*.005,z-.022),(.159,-.170-j*.005,z-.002)],.003,'steel',body)
    # Hexagonal chest reactor, nested manufactured parts and luminous core.
    outline=[(math.sin(i*math.tau/6)*.070,1.294+math.cos(i*math.tau/6)*.077) for i in range(6)]
    plate('Chest reactor brass surround',outline,-.200,.019,'copper',body,bevel=.007)
    outline=[(math.sin(i*math.tau/6)*.052,1.294+math.cos(i*math.tau/6)*.059) for i in range(6)]
    plate('Chest reactor recessed chamber',outline,-.218,.009,'steelDark',body,bevel=.003)
    ellipsoid('Chest reactor glass',(0,-.235,1.294),(.036,.012,.042),'cyan',body,segments=32,rings=20)
    plate('Reactor central diamond',[(0,1.325),(.019,1.294),(0,1.263),(-.019,1.294)],-.250,.005,'steelLight',body,bevel=.002)
    # Hip plate panels, utility belt and armored thigh guards.
    circle('Heavy utility belt',(0,.020,1.004),.221,.147,'leather',body,r=.025)
    rounded('Sentinel belt central clasp',(0,-.132,1.012),(.096,.043,.072),'copper',body,bevel=.01)
    rounded('Sentinel clasp inner',(0,-.157,1.012),(.058,.009,.044),'steelDark',body,bevel=.004)
    for side,leg in zip([-1,1],legs):
        x=side*.1521
        plate('Flared hip tasset',[(x-.084,.974),(x+.079,.974),(x+.10,.841),(x+.062,.795),(x-.079,.822)],-.130,.048,'runeArmor',leg,bevel=.014)
        plate('Contoured thigh guard',[(x-.070,.806),(x+.072,.804),(x+.069,.637),(x,.596),(x-.065,.637)],-.084,.052,'runeArmor',leg,bevel=.017)
        curve('Thigh armor inset',[(x-.047,-.14,.768),(x+.046,-.14,.768),(x+.045,-.14,.656),(x,-.14,.631),(x-.043,-.14,.656)],.0035,'steelLight',leg)
        for z in [.86,.927]:
            rounded('Hip tasset vent',(x,-.183,z),(.076,.008,.013),'steelDark',leg,bevel=.003)
    # Layered beveled shoulder shells and elbow/forearm protection.
    for side,arm in zip([-1,1],arms):
        ax=side*.265*1.17
        ellipsoid('Broad forged shoulder shell',(ax+side*.022,.013,1.43),(.169,.174,.127),'runeArmor',arm,segments=40,rings=24)
        circle('Shoulder rolled metal lip',(ax+side*.022,.013,1.397),.161,.167,'steelLight',arm,r=.009)
        plate('Shoulder angular facing',[(ax-.113,1.471),(ax+.092,1.471),(ax+.145,1.415),(ax+.101,1.337),(ax-.107,1.345),(ax-.137,1.412)],-.142,.027,'steel',arm,bevel=.012)
        plate('Shoulder inset field',[(ax-.083,1.45),(ax+.071,1.45),(ax+.115,1.413),(ax+.078,1.36),(ax-.081,1.365),(ax-.106,1.412)],-.174,.008,'runeArmor',arm,bevel=.006)
        for i in [-1,1]:ellipsoid('Shoulder brass fastening',(ax+i*.090,-.185,1.399),(.009,.004,.009),'copper',arm,segments=16,rings=10)
        for i in range(3):rounded('Shoulder service status lamp',(ax-.047+i*.039,-.187,1.420),(.025,.006,.008),'cyan' if i==0 else 'copper',arm,bevel=.002)
        ellipsoid('Armored elbow shell',(ax+side*.030,-.008,1.143),(.087,.092,.083),'steelDark',arm,segments=28,rings=16)
        plate('Layered sentinel vambrace',[(ax-.043,1.114),(ax+.104,1.114),(ax+.105,.976),(ax+.031,.918),(ax-.046,.979)],-.086,.057,'runeArmor',arm,bevel=.014)
        plate('Vambrace brushed face bevel',[(ax-.025,1.093),(ax+.082,1.092),(ax+.080,.992),(ax+.030,.950),(ax-.025,.992)],-.147,.016,'steel',arm,bevel=.008)
        for z in [1.02,1.06]:curve('Vambrace recessed vents',[(ax-.008,-.168,z),(ax+.064,-.168,z+.004)],.004,'steelDark',arm)
        circle('Wrist articulated ring',(ax+side*.035,-.004,.928),.059,.062,'copperDark',arm,r=.010)
    # Ocular implant leaves one expressive eye and half the face exposed.
    plate('Ocular implant temple frame',[(.020,1.777),(.079,1.784),(.124,1.765),(.145,1.728),(.116,1.692),(.055,1.699),(.027,1.726)],-.119,.019,'steelDark',head,bevel=.007)
    plate('Ocular implant beveled casing',[(.033,1.767),(.078,1.772),(.116,1.757),(.133,1.730),(.111,1.705),(.060,1.712),(.039,1.733)],-.143,.016,'steel',head,bevel=.005)
    plate('Ocular lens inset',[(.053,1.750),(.101,1.756),(.115,1.735),(.093,1.724),(.055,1.731)],-.163,.005,'steelDark',head,bevel=.002)
    curve('Ocular luminous sight',[(.060,-.171,1.742),(.100,-.171,1.745)],.0045,'cyan',head)
    curve('Temple implant cable',[(.122,-.125,1.733),(.155,-.073,1.750),(.160,.034,1.79)],.006,'steelDark',head)
    for x,z in [(.040,1.763),(.113,1.712)]:ellipsoid('Ocular microscrew',(x,-.164,z),(.0025,.0015,.0025),'copper',head,segments=12,rings=8)
    # A compact power pack with rounded cylinders, hoses, vents and copper trim.
    rounded('Rounded reactor backpack',(0,.209,1.283),(.361,.162,.364),'steelDark',body,bevel=.041)
    rounded('Reactor backpack plated spine',(0,.303,1.289),(.101,.031,.325),'runeArmor',body,bevel=.016)
    for side in [-1,1]:
        x=side*.122
        loft('Backpack turned accumulator',[(x,.253,1.128,.043,.046),(x,.253,1.155,.053,.054),(x,.253,1.447,.053,.054),(x,.253,1.473,.038,.042)],'copperDark',body,n=28,sub=1)
        for z in [1.15,1.205,1.399,1.45]:circle('Accumulator machined band',(x,.253,z),.055,.055,'steel',body,r=.007)
        curve('Accumulator visible energy tube',[(x,.310,1.224),(x,.310,1.377)],.012,'cyan',body)
        curve('Flexible shoulder power conduit',[(x,.25,1.457),(side*.20,.218,1.53),(side*.245,.09,1.485)],.018,'steelDark',body,res=4)
        for j in range(5):circle('Power pack exhaust rib',(side*.08,.309,1.196+j*.030),.016,.008,'steel',body,r=.003,plane='xz',n=20)
    # Left-arm forged kite shield, with beveled edge and luminous emblem.
    lax=PIVOTS[arms[0].name].x
    sx=lax-.042
    shieldOutline=[(sx-.163,1.194),(sx,1.257),(sx+.167,1.192),(sx+.157,.831),(sx,.728),(sx-.157,.832)]
    plate('Forged sentinel kite shield',shieldOutline,-.175,.087,'steelDark',arms[0],bevel=.026)
    shieldInset=[(sx-.137,1.173),(sx,1.224),(sx+.141,1.173),(sx+.132,.849),(sx,.764),(sx-.132,.849)]
    plate('Shield broad curved bevel',shieldInset,-.226,.039,'copper',arms[0],bevel=.019)
    inner=[(sx-.119,1.160),(sx,1.203),(sx+.121,1.160),(sx+.113,.865),(sx,.792),(sx-.113,.865)]
    plate('Shield patinated field',inner,-.253,.018,'runeArmor',arms[0],bevel=.014)
    curve('Shield raised central spine',[(sx,-.281,.817),(sx,-.299,1.02),(sx,-.283,1.184)],.012,'steelLight',arms[0])
    circle('Shield energy sigil',(sx,-.279,1.044),.067,.087,'steelDark',arms[0],r=.009,plane='xz')
    curve('Shield luminous broken sun',[(sx-.056,-.295,1.047),(sx-.041,-.302,1.10),(sx,-.308,1.122),(sx+.041,-.302,1.10),(sx+.056,-.295,1.047)],.004,'cyan',arms[0])
    for side in [-1,1]:
        for z in [.906,1.142]:ellipsoid('Shield forged rivet',(sx+side*.094,-.282,z),(.008,.004,.008),'copper',arms[0],segments=16,rings=10)
    # Right hand carries a sleek compact emitter, with a sculpted tapered barrel.
    wx=PIVOTS[weapon.name].x
    rounded('Emitter rounded receiver',(wx,-.111,.858),(.135,.203,.112),'runeArmor',weapon,bevel=.024)
    rounded('Emitter upper housing',(wx,-.135,.906),(.114,.231,.043),'steel',weapon,bevel=.014)
    rounded('Emitter muzzle',(wx,-.237,.862),(.112,.057,.101),'steelDark',weapon,bevel=.016)
    rounded('Emitter cyan aperture',(wx,-.269,.865),(.067,.008,.045),'cyan',weapon,bevel=.013)
    for side in [-1,1]:curve('Emitter longitudinal rail',[(wx+side*.057,-.220,.902),(wx+side*.057,-.074,.902)],.006,'copper',weapon)
    for i in range(3):rounded('Emitter heat sink',(wx,-.094-i*.032,.933),(.067,.009,.013),'steelDark',weapon,bevel=.002)

def apply_and_merge(root):
    allobjs=[root]+list(root.children_recursive)
    for o in allobjs:
        if o.type not in {'MESH','CURVE'}:continue
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        if o.type=='CURVE':bpy.ops.object.convert(target='MESH')
        for mod in list(o.modifiers):
            try:bpy.ops.object.modifier_apply(modifier=mod.name)
            except Exception as e:print('Modifier note',o.name,str(e))
        # Apply scale so glTF normals, shadowing, and subsequent merges are clean.
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    groups=defaultdict(list)
    for o in root.children_recursive:
        if o.type=='MESH':
            key=(o.parent.name,tuple(m.name for m in o.data.materials))
            groups[key].append(o)
    for (par,mats),objs in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:o.select_set(True)
        bpy.context.view_layer.objects.active=objs[0]
        if len(objs)>1:bpy.ops.object.join()
        o=bpy.context.object;o.name=par+' • '+mats[0].split(' • ')[-1]
    # Preserve the sculpted silhouettes while removing redundant tessellation.
    meshes=[o for o in root.children_recursive if o.type=='MESH']
    total=0
    for o in meshes:o.data.calc_loop_triangles();total+=len(o.data.loop_triangles)
    ratio=min(1.0,94000/max(1,total))
    if ratio<.999:
        for o in meshes:
            if len(o.data.polygons)<100:continue
            bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
            mod=o.modifiers.new('Game-ready sculpt reduction','DECIMATE');mod.ratio=ratio;mod.use_collapse_triangulate=True
            bpy.ops.object.modifier_apply(modifier=mod.name)
    return [root]+list(root.children_recursive)

heroes=[];stats={}
for hero in ['kaida','vex','rune']:
    print('SCULPTING',hero,flush=True)
    parts=humanoid(hero);root,body,head,arms,legs,knees,cloak,weapon=parts
    {'kaida':kaida_details,'vex':vex_details,'rune':rune_details}[hero](*parts[1:])
    members=apply_and_merge(root)
    bpy.ops.object.select_all(action='DESELECT')
    for o in members:o.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,hero+'.glb'),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_apply=True,export_materials='EXPORT',export_extras=False)
    triangles=0
    for o in members:
        if o.type=='MESH':o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
    stats[hero]={'triangles':triangles,'meshes':sum(o.type=='MESH' for o in members),'bytes':os.path.getsize(os.path.join(OUT,hero+'.glb'))}
    print('EXPORTED',hero,stats[hero],flush=True)
    heroes.append(root)
    # Each GLB has clean shared pivot names; source-scene names are unique.
    for o in members:
        if o != root:o.name=hero+'_'+o.name

# A retained, lit source scene gives the models an immediately useful inspection view.
for root,x in zip(heroes,[-1.28,0,1.30]):root.location.x=x
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,.0));floor=bpy.context.object;floor.name='Studio • matte floor';finish(floor,material('Studio • charcoal',(.022,.032,.039),rough=.88),None)
def area(name,loc,color,power,size,target):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('Warm dusk softbox',(-3,-4,5),(1,.75,.56),550,4,(0,0,1))
area('Cool sky fill',(3,-2,3),(.52,.75,1),300,3,(0,0,1))
area('Moon rim',(0,2.0,3.8),(.45,.78,1),600,3,(0,0,1.2))
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.065,.088,.12,1);world.node_tree.nodes['Background'].inputs[1].default_value=.25
bpy.ops.object.camera_add(location=(3.15,-7.8,3.0));camera=bpy.context.object;camera.name='Character atelier • three-quarter review'
camera.rotation_euler=(Vector((0,0,1.04))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=4.90
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1800;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.join(HERE,'characters-preview.png')
scene.render.film_transparent=False
with open(os.path.join(HERE,'characters-stats.json'),'w') as f:json.dump(stats,f,indent=2)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE,'characters.blend'))
bpy.ops.render.render(write_still=True)
print('CHARACTERS COMPLETE',json.dumps(stats),flush=True)
