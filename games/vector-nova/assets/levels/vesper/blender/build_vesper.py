"""Reproducible CPU-only Blender authoring. Run Blender --background --python build_vesper.py.
Three selected scene concepts are reference, never texture stand-ins. All geometry original.
Game-space metres use +Y up; B maps to Blender +Z up before glTF export.
"""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
DEST = ROOT.parents[3] / 'public' / 'assets' / 'levels' / 'vesper'
# assets/levels/vesper/blender -> vector-nova
DEST = ROOT.parents[3] / 'public' / 'assets' / 'levels' / 'vesper'
DEST.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
random.seed(84731)
B = lambda p: (p[0], -p[2], p[1])

def mat(name, rgb, rough=.7, metal=0, glow=None, strength=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*rgb,1); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*rgb,1)
    bs.inputs['Roughness'].default_value=rough; bs.inputs['Metallic'].default_value=metal
    if glow:
        bs.inputs['Emission Color'].default_value=(*glow,1); bs.inputs['Emission Strength'].default_value=strength
    return m

bark=mat('Vesper | ridged indigo bark',(.065,.10,.12),.9)
sapwood=mat('Vesper | exposed ivory sapwood',(.49,.35,.19),.73)
inner=mat('Vesper | shadowed cambium',(.12,.13,.125),.85)
leafmat=mat('Vesper | waxed blue teal leaves',(.035,.19,.18),.43)
vein=mat('Vesper | cool leaf veins',(.055,.30,.28),.45,glow=(.08,.43,.38),strength=.30)
amber=mat('Vesper | amber sap lantern',(.86,.35,.045),.23,glow=(1,.35,.035),strength=2.2)
ivory=mat('Vesper | flower milky inner tissue',(.73,.55,.34),.46,glow=(.3,.13,.03),strength=.18)
petalback=mat('Vesper | flower plum backs',(.23,.052,.075),.6)
creatureshell=mat('Vesper | walker layered carapace',(.07,.15,.20),.46,.16)
creatureunder=mat('Vesper | walker ivory joints',(.41,.36,.24),.8)
metal=mat('Vesper | maintenance bronze',(.28,.20,.11),.35,.58)
fungus=mat('Vesper | fungal moon tissue',(.17,.35,.35),.53,glow=(.025,.21,.23),strength=.25)

def empty(name,parent=None,loc=(0,0,0)):
    o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o); o.location=B(loc)
    if parent:o.parent=parent
    return o

def mesh(name, verts, faces, material, parent=None, smooth=True):
    d=bpy.data.meshes.new(name); d.from_pydata([B(v) for v in verts],[],faces); d.update()
    o=bpy.data.objects.new(name,d); bpy.context.collection.objects.link(o); o.data.materials.append(material)
    if parent:o.parent=parent
    for p in d.polygons:p.use_smooth=smooth
    return o

def tube(name, pts, radii, material, parent=None, sides=9):
    pts=[Vector(p) for p in pts]; verts=[]; faces=[]
    for i,p in enumerate(pts):
        t=pts[min(i+1,len(pts)-1)]-pts[max(i-1,0)]; t.normalize()
        n=t.cross(Vector((0,1,0)) if abs(t.y)<.94 else Vector((0,0,1))).normalized(); b=t.cross(n).normalized()
        for j in range(sides):
            a=j*math.tau/sides
            verts.append(p+(n*math.cos(a)+b*math.sin(a))*radii[i])
    for i in range(len(pts)-1):
        for j in range(sides):
            a=i*sides+j; b=i*sides+(j+1)%sides; faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))),tuple((len(pts)-1)*sides+j for j in range(sides))])
    return mesh(name,verts,faces,material,parent)

def ellipsoid(name,center,scale,material,parent=None,rings=10,sides=20):
    verts=[]; faces=[]
    for i in range(rings+1):
        v=math.pi*i/rings
        for j in range(sides):
            a=j*math.tau/sides
            verts.append((center[0]+scale[0]*math.sin(v)*math.cos(a),center[1]+scale[1]*math.cos(v),center[2]+scale[2]*math.sin(v)*math.sin(a)))
    for i in range(rings):
        for j in range(sides):
            a=i*sides+j;b=i*sides+(j+1)%sides;faces.append((a,b,b+sides,a+sides))
    return mesh(name,verts,faces,material,parent)

def leaf(name,base,length,width,yaw,pitch,material,parent,veins=True):
    verts=[]; faces=[]; rows=13; cols=8
    def pt(t,w):
        x=math.sin(math.pi*t)**.8*width*w*(.94+.06*math.cos(10*math.pi*t))
        y=length*(.10*math.sin(math.pi*t)-.11*t*t)+abs(w)**1.4*width*.19
        z=t*length
        yy=y*math.cos(pitch)+z*math.sin(pitch); zz=z*math.cos(pitch)-y*math.sin(pitch)
        return (base[0]+x*math.cos(yaw)+zz*math.sin(yaw),base[1]+yy,base[2]-x*math.sin(yaw)+zz*math.cos(yaw))
    for i in range(rows):
        for j in range(cols+1):verts.append(pt(i/(rows-1),2*j/cols-1))
    for i in range(rows-1):
        for j in range(cols):
            a=i*(cols+1)+j; faces.append((a,a+1,a+cols+2,a+cols+1))
    o=mesh(name,verts,faces,material,parent)
    o.data.materials.append(material)
    # Tiny thickness keeps oblique crowns readable and exports actual surfaces.
    sol=o.modifiers.new('Waxy lamina thickness','SOLIDIFY');sol.thickness=max(.08,length*.004)
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=sol.name)
    if veins:
        tube(name+' midrib',[pt(i/10,0) for i in range(11)],[length*.012*(1-i/12) for i in range(11)],vein,parent,5)
        for t in [.26,.44,.62,.78]:
            for side in [-1,1]:tube(name+' vein',[pt(t,0),pt(t+.07,.45*side),pt(min(.98,t+.13),.86*side)],[length*.005,.055,.015],vein,parent,4)
    return o

def merge_materials(parent):
    # Keep each joint separate; group static meshes by material for bounded draws.
    children=[o for o in parent.children if o.type=='MESH']
    groups={}
    for o in children:groups.setdefault(o.data.materials[0].name,[]).append(o)
    for name,obs in groups.items():
        if len(obs)<2:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in obs:o.select_set(True)
        bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join()
        obs[0].name=parent.name+' | '+name

# Hollow hero built against concrete route envelope, with true clipped apertures.
envelope=json.loads((ROOT/'route-envelope.json').read_text()); h=envelope['hollow']; cx,_,cz=h['center']
route=[Vector((p[0]-cx,p[1]-h['base'],p[2]-cz)) for p in envelope['samples']]
hero=empty('hero_hollow'); R=h['radius']; H=h['top']-h['base']; n=144; levels=30

def ring(i,j,inside=False):
    a=j*math.tau/n; t=i/levels
    radius=R*(1-.08*t)+5.5*math.sin(a*19+t*3)+2.2*math.sin(a*37-t*4)
    if inside:radius-=13
    y=t*H
    if i>levels-3:y+=((i-levels+3)/3)*(8+18*math.sin(a*7)**2+6*math.sin(a*13))
    return Vector((math.cos(a)*radius,y,math.sin(a)*radius))
keep={}
for i in range(levels):
    for j in range(n):
        p=(ring(i,j)+ring(i+1,j+1))*.5
        keep[i,j]=not any((p-r).length<39 for r in route)
for innerwall,material in [(False,bark),(True,inner)]:
    verts=[];faces=[]
    for i in range(levels):
        for j in range(n):
            if not keep[i,j]:continue
            v=[ring(i,j,innerwall),ring(i,j+1,innerwall),ring(i+1,j+1,innerwall),ring(i+1,j,innerwall)]
            a=len(verts);verts.extend(v);faces.append(tuple(a+k for k in ([3,2,1,0] if innerwall else [0,1,2,3])))
    mesh('Living trunk '+('inside' if innerwall else 'outside'),verts,faces,material,hero)
verts=[];faces=[]
for i in range(levels):
    for j in range(n):
        if not keep[i,j]:continue
        for ni,nj,ends in [(i-1,j,[(i,j),(i,j+1)]),(i+1,j,[(i+1,j+1),(i+1,j)]),(i,(j-1)%n,[(i+1,j),(i,j)]),(i,(j+1)%n,[(i,j+1),(i+1,j+1)])]:
            if keep.get((ni,nj),False):continue
            a=len(verts);verts.extend([ring(*ends[0]),ring(*ends[1]),ring(*ends[1],True),ring(*ends[0],True)]);faces.append((a,a+1,a+2,a+3))
mesh('Pale split edges and jagged crown',verts,faces,sapwood,hero)
for i in range(13):
    a=i*math.tau/13
    pts=[(math.cos(a+v*.08)*(R+v*110),25*(1-v)**2,math.sin(a+v*.08)*(R+v*110)) for v in [0,.2,.5,.75,1]]
    if any(any((Vector(p)-r).length<34 for r in route) for p in pts):continue
    tube('Great buttress root',pts,[18,17,12,7,1],bark,hero,10)
    tube('Root pale ridge',[(p[0],p[1]+6,p[2]) for p in pts],[3,3.5,2.5,1,.2],sapwood,hero,6)
# Crown boughs reach outward above the exit; no geometry intersects the road.
for i in range(9):
    a=i*math.tau/9+.25
    pts=[(math.cos(a)*(R-6),H-15,math.sin(a)*(R-6)),(math.cos(a+.08)*(R+36),H+18,math.sin(a+.08)*(R+36)),(math.cos(a+.17)*(R+90),H+30,math.sin(a+.17)*(R+90))]
    if any(any((Vector(p)-r).length<34 for r in route) for p in pts):continue
    tube('Torn crown bough',pts,[13,10,2],bark,hero,10)
    for j in range(3):leaf('Crown lamina',pts[-1],50,17,a+j*1.9,-.2,leafmat,hero)
merge_materials(hero)

# Three reusable author-designed trees: forked spire, wind-torn tier, swollen bole.
for variant in range(3):
    root=empty('tree_'+str(variant)); height=[170,215,145][variant]; radius=[13,17,23][variant]
    verts=[];faces=[]; rings=19;sides=28
    for i in range(rings):
        t=i/(rings-1); center=(math.sin(t*3+variant)*t*11,t*height,math.cos(t*2+variant)*t*8)
        for j in range(sides):
            a=j*math.tau/sides; r=radius*(1-.72*t)*(1+.17*math.sin(a*(7+variant)+t*6))*(1+.8*math.exp(-t*14))
            verts.append((center[0]+r*math.cos(a),center[1],center[2]+r*math.sin(a)))
    for i in range(rings-1):
        for j in range(sides):
            a=i*sides+j;b=i*sides+(j+1)%sides;faces.append((a,b,b+sides,a+sides))
    mesh('Sculpted fluted trunk',verts,faces,bark,root)
    for j in range(6):
        a=j*math.tau/6+.3*variant
        tube('Twisting root',[(math.cos(a)*radius*.5,18,math.sin(a)*radius*.5),(math.cos(a+.14)*radius*1.6,6,math.sin(a+.14)*radius*1.6),(math.cos(a+.3)*radius*3.1,-2,math.sin(a+.3)*radius*3.1)],[6,4,.4],bark,root,7)
    for j in range(9):
        a=j*2.399+variant; y=height*(.58+.043*j); l=36+13*math.sin(j*1.6)**2
        end=(math.cos(a)*l,y+18,math.sin(a)*l)
        tube('Asymmetric load bough',[(0,y,0),(math.cos(a)*l*.55,y+9,math.sin(a)*l*.55),end],[5,3.5,.5],bark,root,7)
        for k in range(3):leaf('Layered crown leaf',end,29+k*5,10+k*1.5,a+k*1.9-.6,-.12,leafmat,root,veins=k==0)
    merge_materials(root)

# Standalone reusable modules allow silhouette-led population with few draw calls.
for variant in range(3):
    root=empty('foliage_'+str(variant))
    for j in range(5+variant):
        a=j*2.4+variant
        leaf('Veined lamina',(0,j*.9,0),20+variant*7,6+variant*2,a,.18+j*.04,leafmat,root)
    merge_materials(root)
for variant in range(2):
    root=empty('root_'+str(variant));points=[]
    for j in range(9):
        t=j/8;points.append((math.sin(t*2.6+variant)*12,-3-t*10,t*85))
    tube('Braided shelf root',points,[9*(1-j/10) for j in range(9)],bark,root,10)
    for side in [-1,1]:tube('Pale twisted rib',[(p[0]+side*4*math.sin(i*.8),p[1]+4,p[2]) for i,p in enumerate(points)],[2.5*(1-j/10) for j in range(9)],sapwood,root,6)
    merge_materials(root)
root=empty('fungal_fan')
for j in range(5):
    base=(j*1.4,0,j*.7);tube('Fungal stem',[base,(base[0],8+j*2,base[2])],[.7,.4],sapwood,root,6)
    leaf('Fungal fan',(base[0],8+j*2,base[2]),15,11,j*1.5,-.1,fungus,root,veins=True)
merge_materials(root)

# Flower: thick curled double-layer petals, ribbed backs, actual hanging anthers.
flower=empty('hero_flower')
for layer,count in [(0,8),(1,6)]:
    for j in range(count):
        a=j*math.tau/count+layer*.31;verts=[];faces=[];nu=22;nv=12
        def petal(t,w):
            r=8+t*(82-layer*22);wid=math.sin(math.pi*t)**.65*(28-layer*4)*w
            y=-10-layer*12-30*math.sin(math.pi*t*.9)+37*t**6+abs(w)**1.7*12
            return (math.cos(a)*r-math.sin(a)*wid,y,math.sin(a)*r+math.cos(a)*wid)
        for i in range(nu+1):
            for k in range(nv+1):verts.append(petal(i/nu,2*k/nv-1))
        for i in range(nu):
            for k in range(nv):
                p=i*(nv+1)+k;faces.append((p,p+1,p+nv+2,p+nv+1))
        o=mesh('Curled flower petal',verts,faces,ivory,flower);o.data.materials.append(petalback)
        sol=o.modifiers.new('Thick living tissue','SOLIDIFY');sol.thickness=1.8;sol.material_offset=1;sol.material_offset_rim=1
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=sol.name)
        tube('Petal structural rib',[petal(k/16,0) for k in range(17)],[.58*(1-k/18) for k in range(17)],sapwood,flower,5)
        for w in [-.55,.55]:tube('Petal bioluminescent vein',[petal(k/12,w) for k in range(2,12)],[.22]*10,vein,flower,4)
for j in range(21):
    a=j*2.399;r=7+(j%5)*3;drop=35+(j%6)*5
    pts=[(math.cos(a)*r,-13,math.sin(a)*r),(math.cos(a+.15)*r*1.2,-drop*.7,math.sin(a+.15)*r*1.2),(math.cos(a+.25)*r*1.4,-drop,math.sin(a+.25)*r*1.4)]
    tube('Pollen filament',pts,[.5,.37,.23],sapwood,flower,5)
    ellipsoid('Amber hanging anther',pts[-1],(1.8,4.6,1.8),amber,flower,8,12)
for j in range(5):
    a=j*math.tau/5
    tube('Flower suspension vine',[(math.cos(a)*8,0,math.sin(a)*8),(math.cos(a)*30,40,math.sin(a)*30),(math.cos(a+.2)*110,65,math.sin(a+.2)*110)],[7,5,1.5],bark,flower,9)
merge_materials(flower)

# Original six-legged canopy walker. Parent empties are explicit animation joints.
walker=empty('hero_walker');body=empty('walker_body',walker)
ellipsoid('Long arched ribcage',(0,120,0),(35,27,68),creatureunder,body,14,32)
for j in range(10):
    z=-59+j*12
    ellipsoid('Overlapping dorsal shield',(0,136+6*math.sin(j*.3),z),(37*(.7+.3*math.sin((j+1)*math.pi/11)),17,17),creatureshell,body,10,24)
    for side in [-1,1]:
        leaf('Carapace scale',(side*24,128,z),20,8,side*1.8,.5,creatureshell,body,veins=False)
for j in range(46):
    a=j*2.399;z=-60+120*((j*17)%47)/47;x=33*math.sin(a);y=133+15*abs(math.cos(a))
    ellipsoid('Bioluminescent shell freckle',(x,y,z),(.55,.5,1.2),vein,body,5,6)
neck=empty('walker_neck',body,(0,130,53))
tube('Arched neck',[(0,0,0),(0,8,23),(0,24,43),(0,34,60)],[20,16,11,9],creatureshell,neck,14)
tube('Pale throat',[(0,-10,7),(0,0,29),(0,17,46),(0,27,61)],[9,8,6,5],creatureunder,neck,10)
head=empty('walker_head',neck,(0,33,63));ellipsoid('Leaf-shaped head',(0,0,8),(12,10,24),creatureshell,head,12,24)
ellipsoid('Pale tapered muzzle',(0,-3,24),(8,6,14),creatureunder,head,10,18)
for side in [-1,1]:
    ellipsoid('Amber eye',(side*10,4,10),(2,2.2,3),amber,head,8,12)
    tube('Delicate antenna',[(side*6,4,26),(side*13,0,48),(side*19,-9,64)],[.65,.4,.08],sapwood,head,6)
    ellipsoid('Antenna lantern',(side*19,-9,64),(.7,.7,.7),amber,head,6,8)
    for j in range(5):leaf('Antler crest',(side*(5+j*1.6),8,-j*4),19+j*2,3.5,side*(2.8-j*.18),.55,creatureunder,head,veins=False)
for side in [-1,1]:
    for j,z in enumerate([-47,0,45]):
        shoulder=empty(f'walker_shoulder_{side}_{j}',body,(side*28,122,z))
        knee=(side*30,-59,10 if j!=1 else -13)
        tube('Armoured upper limb',[(0,0,0),(side*13,-25,knee[2]*.55),knee],[13,12,7],creatureshell,shoulder,12)
        ellipsoid('Shoulder articulation',(0,0,0),(12,14,13),creatureunder,shoulder,10,16)
        lower=empty(f'walker_knee_{side}_{j}',shoulder,knee)
        foot=(side*22,-58,16 if j!=1 else -16)
        tube('Long ivory lower limb',[(0,0,0),(side*12,-27,foot[2]*.5),foot],[7.5,6,2.8],creatureunder,lower,10)
        ellipsoid('Knee joint',(0,0,0),(8,8,8),creatureshell,lower,10,16)
        for k in range(3):tube('Hooked toes',[foot,(foot[0]+(k-1)*4,foot[1]-3,foot[2]+8),(foot[0]+(k-1)*6,foot[1]-1,foot[2]+14)],[2.7,1.8,.15],creatureshell,lower,7)
        merge_materials(lower);merge_materials(shoulder)
merge_materials(head);merge_materials(neck);merge_materials(body)

# Split seedpod station: open grown enclosure kept to the side of the live road.
station=empty('seedpod_station')
for side in [-1,1]:
    for j in range(8):
        t=j/7;z=-32+t*64
        pts=[(side*15,0,z),(side*(22+12*math.sin(math.pi*t)),15,z),(side*(17+8*math.sin(math.pi*t)),35,z),(side*6,43-9*abs(t-.5),z)]
        tube('Open seedpod rib',pts,[2.1,2.3,1.9,.3],sapwood,station,7)
for side in [-1,1]:
    leaf('Split seedpod shell',(side*15,3,-32),63,18,side*.26,.32,petalback,station,veins=False)
    tube('Station warm guidance',[(side*16,3,-33),(side*21,5,0),(side*16,3,33)],[.7,.7,.7],amber,station,5)
for z in [-23,0,23]:ellipsoid('Station amber lantern',(0,35,z),(2,4,2),amber,station,8,12)
merge_materials(station)

# Landing branch: visible organic mass below the attached road, exported as authored module.
branch=empty('landing_branch')
tube('Great landing bough',[(0,-6,-90),(7,-10,-38),(0,-12,30),(-9,-24,95)], [10,15,13,4],bark,branch,14)
for side in [-1,1]:tube('Braided landing sapwood',[(side*7,-3,-85),(side*11,-7,-30),(side*8,-8,40),(side*6,-20,94)],[2.4,3,2.8,.3],sapwood,branch,7)
merge_materials(branch)

# Ordinary near foliage keeps its thick silhouette and modeled veins with fewer
# interior triangles; hero blossoms, trunks and articulated walker remain exact.
for variant in range(3):
    for o in bpy.data.objects['foliage_'+str(variant)].children:
        if o.type!='MESH':continue
        dec=o.modifiers.new('Ordinary foliage interior reduction','DECIMATE');dec.ratio=.65
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=dec.name)

# Geometric distance family preserves branch/leaf silhouettes without billboards.
for variant in range(3):
    source=bpy.data.objects['tree_'+str(variant)]
    lod=empty('tree_lod_'+str(variant))
    for original in source.children:
        if original.type!='MESH':continue
        o=original.copy();o.data=original.data.copy();bpy.context.collection.objects.link(o);o.parent=lod
        dec=o.modifiers.new('Distant silhouette simplification','DECIMATE');dec.ratio=.11
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=dec.name)
# Material-backed original meshes, no external dependencies or texture downloads.
for m in bpy.data.materials:
    m.use_backface_culling=False
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU'
scene['provenance']='Original generated by build_vesper.py from three built-in imagegen scene concepts, 2026-09-29.'
scene['route_revision']=envelope['revision']
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'vesper-assets.blend'))
bpy.ops.export_scene.gltf(filepath=str(DEST/'vesper-canopy.glb'),export_format='GLB',export_yup=True,export_apply=True,export_animations=False,export_extras=True)
metrics={'objects':len(bpy.data.objects),'meshes':len(bpy.data.meshes),'polygons':sum(len(o.data.polygons) for o in bpy.data.objects if o.type=='MESH'),'exportBytes':(DEST/'vesper-canopy.glb').stat().st_size,'routeRevision':envelope['revision'],'rendered':False}
(ROOT/'asset-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
print('VESPER_ASSET_METRICS '+json.dumps(metrics))
