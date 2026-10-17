"""Reproducible CPU-only Blender authoring. Run Blender --background --python build_vesper.py.
Three selected scene concepts are reference, never texture stand-ins. All geometry original.
Game-space metres use +Y up; B maps to Blender +Z up before glTF export.
"""
import bpy, bmesh, math, random, json
from mathutils.kdtree import KDTree
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
inner=mat('Vesper | shadowed cambium',(.20,.16,.11),.92)
leafmat=mat('Vesper | waxed blue teal leaves',(.08,.24,.19),.76)
vein=mat('Vesper | cool leaf veins',(.055,.30,.28),.45,glow=(.08,.43,.38),strength=.30)
amber=mat('Vesper | amber sap lantern',(.86,.35,.045),.23,glow=(1,.35,.035),strength=2.2)
ivory=mat('Vesper | flower milky inner tissue',(.73,.55,.34),.46,glow=(.3,.13,.03),strength=.18)
petalback=mat('Vesper | flower plum backs',(.23,.052,.075),.6)
creatureshell=mat('Vesper | walker layered carapace',(.115,.23,.26),.73,.04)
creatureunder=mat('Vesper | walker ivory joints',(.46,.40,.27),.84)
creatureridge=mat('Vesper | walker weathered plate margins',(.23,.35,.31),.8)
metal=mat('Vesper | maintenance bronze',(.28,.20,.11),.35,.58)
pores=mat('Vesper | fungal pore tissue',(.48,.56,.42),.78)
fungus=mat('Vesper | fungal moon tissue',(.22,.32,.19),.88,glow=(.04,.12,.08),strength=.13)
# One original imagegen material tile, embedded in the GLB and packed in Blender.
# Explicit UVs below survive mesh joining, distance simplification and instancing.
bark_image=bpy.data.images.load(str(ROOT.parent/'textures'/'ancient-bark-color.png'));bark_image.pack()
for material,tint in [(bark,(.53,.66,.69,1)),(inner,(.87,.70,.46,1)),(creatureshell,(.115,.23,.26,1)),(creatureunder,(.46,.40,.27,1)),(creatureridge,(.23,.35,.31,1))]:
    nodes=material.node_tree.nodes;links=material.node_tree.links
    image=nodes.new('ShaderNodeTexImage');image.image=bark_image;image.extension='REPEAT'
    color=nodes.new('ShaderNodeMix');color.data_type='RGBA';color.blend_type='MULTIPLY';color.inputs[0].default_value=1;color.inputs[7].default_value=tint
    links.new(image.outputs['Color'],color.inputs[6]);links.new(color.outputs[2],nodes.get('Principled BSDF').inputs['Base Color'])
# Export actual per-leaf color instead of an unused Blender color attribute.
nodes=leafmat.node_tree.nodes;links=leafmat.node_tree.links
color=nodes.new('ShaderNodeVertexColor');color.layer_name='COLOR_0'
mix=nodes.new('ShaderNodeMix');mix.data_type='RGBA';mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[7].default_value=(.08,.24,.19,1)
links.new(color.outputs['Color'],mix.inputs[6]);links.new(mix.outputs[2],nodes.get('Principled BSDF').inputs['Base Color'])


def empty(name,parent=None,loc=(0,0,0)):
    o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o); o.location=B(loc)
    if parent:o.parent=parent
    return o

def mesh(name, verts, faces, material, parent=None, smooth=True, uvs=None):
    d=bpy.data.meshes.new(name); d.from_pydata([B(v) for v in verts],[],faces); d.update()
    o=bpy.data.objects.new(name,d); bpy.context.collection.objects.link(o); o.data.materials.append(material)
    if parent:o.parent=parent
    for p in d.polygons:p.use_smooth=smooth
    if material in [bark,inner,sapwood,creatureshell,creatureunder,creatureridge]:
        uv=d.uv_layers.new(name='Living bark metres')
        for face in d.polygons:
            coords=[]
            for loop in face.loop_indices:
                v=d.vertices[d.loops[loop].vertex_index].co
                if name.startswith(('Sinuous hollow','Continuous upper trunk')):
                    coords.append((math.atan2(-v.y,v.x)*R/56,v.z/72))
                else:
                    normal=face.normal;axis=max(range(3),key=lambda a:abs(normal[a]))
                    coords.append(((v.y if axis==0 else v.x)/18,(v.y if axis==2 else v.z)/18))
            if name.startswith(('Sinuous hollow','Continuous upper trunk')) and max(u for u,v in coords)-min(u for u,v in coords)>math.pi*R/56:
                coords=[(u+math.tau*R/56 if u<0 else u,v) for u,v in coords]
            for loop,coord in zip(face.loop_indices,coords):uv.data[loop].uv=coord
    if uvs is not None:
        uv=d.uv_layers.new(name='Living tissue UV')
        for loop in d.loops:uv.data[loop.index].uv=uvs[loop.vertex_index]
    if material==leafmat:
        ca=d.color_attributes.new(name='COLOR_0',type='FLOAT_COLOR',domain='CORNER')
        for c in ca.data:c.color=(1,1,1,1)
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

# Organic hollow wall with continuously clipped apertures, shared smooth vertices,
# rather than grid-cell holes. The wall stands outside the whole internal spiral;
# the matching runtime support radius carries loads into this continuous enclosure.
envelope=json.loads((ROOT/'route-envelope.json').read_text()); h=envelope['hollow']; cx,_,cz=h['center']
route=[Vector((p[0]-cx,p[1]-h['base'],p[2]-cz)) for p in envelope['samples']]
kdt=KDTree(len(route))
for i,p in enumerate(route):kdt.insert(p,i)
kdt.balance()
hero=empty('hero_hollow'); R=h['radius']+46; H=h['top']-h['base']; n=192; levels=44

def ring(t,a,inside=False):
    warp=.055*math.sin(t*18+a*3)+.022*math.sin(t*39-a*7)
    radius=R*(1-.08*t)+5.5*math.sin((a+warp)*19+t*3)+2.2*math.sin((a+warp*.6)*37-t*4)
    # Broad healed swellings interrupt furrows without opening the enclosure.
    radius+=1.9*math.sin(a*11+t*29)*math.sin(t*17-a*5)**2
    radius+=3.2*math.sin(a*5+t*4)+2.1*math.sin(a*3-t*5)
    if inside:radius-=13+1.7*math.sin(a*13+t*9)
    else:
        # Old load-bearing ridges wind up from unequal buttresses; subordinate
        # corrugation stays in the bark maps, not a smooth swollen silhouette.
        growth=a+.055*math.sin(t*5+a*2)
        radius+=max(0,math.sin(growth*5+t*.35))**4*(38+18*math.sin(a*3+1)**2)*(1-.22*t)
        radius+=max(0,math.sin(growth*9-t*.4))**6*14
    y=t*H
    if t>.9:y+=(t-.9)*10*(8+18*math.sin(a*7)**2+6*math.sin(a*13))
    return Vector((math.cos(a)*radius,y,math.sin(a)*radius))

def field(t,a):
    # Irregular smooth scar edges follow actual clear road voids, never a square mask.
    distance=min(kdt.find(ring(t,a,False))[2],kdt.find(ring(t,a,True))[2])
    return distance-(46+3*math.sin(a*11+t*27)+2*math.sin(a*17-t*19))

verts=[[],[]];faces=[[],[]];rimverts=[];rimfaces=[]
for i in range(levels):
    for j in range(n):
        corners=[(i/levels,j*math.tau/n),(i/levels,(j+1)*math.tau/n),((i+1)/levels,(j+1)*math.tau/n),((i+1)/levels,j*math.tau/n)]
        for inds in [(0,1,2),(0,2,3)]:
            polygon=[corners[k] for k in inds]; result=[];cut=[]
            for k,q in enumerate(polygon):
                prev=polygon[k-1];fq=field(*q);fp=field(*prev)
                if (fq>=0)!=(fp>=0):
                    u=fp/(fp-fq);v=(prev[0]+(q[0]-prev[0])*u,prev[1]+(q[1]-prev[1])*u)
                    result.append(v);cut.append(v)
                if fq>=0:result.append(q)
            if len(result)<3:continue
            for insidewall in [0,1]:
                base=len(verts[insidewall]);verts[insidewall].extend(ring(t,a,bool(insidewall)) for t,a in result)
                for k in range(1,len(result)-1):faces[insidewall].append((base,base+k,base+k+1) if not insidewall else (base+k+1,base+k,base))
            if len(cut)==2:
                base=len(rimverts);rimverts.extend([ring(*cut[0]),ring(*cut[1]),ring(*cut[1],True),ring(*cut[0],True)]);rimfaces.append((base,base+1,base+2,base+3))
for insidewall,material in [(0,bark),(1,inner)]:
    o=mesh('Sinuous hollow '+('cambium' if insidewall else 'bark'),verts[insidewall],faces[insidewall],material,hero)
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.015);bm.to_mesh(o.data);bm.free()
mesh('Rounded pale aperture scar tissue',rimverts,rimfaces,sapwood,hero)
# Grounded basal flare continues the enclosed tree beneath its former source
# origin; roots end below the actual ravine floor instead of hovering above it.
skirt_vertices=[];skirt_faces=[]
for row in range(7):
    depth=row/6
    for j in range(n+1):
        q=ring(0,j/n*math.tau)
        q.x*=1+.18*depth;q.z*=1+.18*depth;q.y=-76*depth
        skirt_vertices.append(q)
for row in range(6):
    for j in range(n):
        a=row*(n+1)+j;b=a+n+1
        skirt_faces.append((a,a+1,b+1,b))
mesh('Ancient grounded basal flare',skirt_vertices,skirt_faces,bark,hero)

# Complete living upper trunk: the cavity continues upward before closing inside
# a tapering, branching bole. No roof cap is pasted across the raceway opening.
def upper_ring(t,a,inside=False):
    bottom=ring(1,a,inside)
    if t==0:return bottom
    outer_bottom=ring(1,a,False)
    base_radius=math.hypot(outer_bottom.x,outer_bottom.z)
    rr=(base_radius-7)*(1-t**1.25)**1.05+7
    rr+=22*math.sin(a*5+t*2)*math.sin(math.pi*t)*(1-t)
    rr+=5*max(0,math.sin(a*11-t*3))**3*math.sin(math.pi*t)
    if inside:rr=max(0,rr-13)*(max(0,1-t/.62))**.55
    return Vector((math.cos(a)*rr+49*math.sin(t*2.1),bottom.y+t*480,math.sin(a)*rr+31*math.sin(t*3.2)))
# Clip the upper continuation against the same actual road/camera envelope so
# the existing crown exit remains a genuine portal through the continuous bole.
for insidewall,material in [(False,bark),(True,inner)]:
    uv=[];uf=[];upper_levels=40
    for i in range(upper_levels):
        for j in range(n):
            corners=[(i/upper_levels,j*math.tau/n),(i/upper_levels,(j+1)*math.tau/n),((i+1)/upper_levels,(j+1)*math.tau/n),((i+1)/upper_levels,j*math.tau/n)]
            for inds in [(0,1,2),(0,2,3)]:
                poly=[corners[k] for k in inds];result=[]
                for k,q in enumerate(poly):
                    prev=poly[k-1]
                    fq=kdt.find(upper_ring(*q,insidewall))[2]-44;fp=kdt.find(upper_ring(*prev,insidewall))[2]-44
                    if (fq>=0)!=(fp>=0):
                        u=fp/(fp-fq);result.append((prev[0]+(q[0]-prev[0])*u,prev[1]+(q[1]-prev[1])*u))
                    if fq>=0:result.append(q)
                if len(result)<3:continue
                start=len(uv);uv.extend(upper_ring(t,a,insidewall) for t,a in result)
                for k in range(1,len(result)-1):uf.append((start+k+1,start+k,start) if insidewall else (start,start+k,start+k+1))
    o=mesh('Continuous upper trunk '+('cambium' if insidewall else 'bark'),uv,uf,material,hero)
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.015);bm.to_mesh(o.data);bm.free()
# Fine raised living grain follows the inside wall and splits around the route openings.
for j in range(50):
    a0=j*math.tau/50+.06*math.sin(j*7); run=[]
    for k in range(53):
        t=k/52; a=a0+.055*math.sin(t*12+j)+.025*math.sin(t*29+j*.7)
        q=ring(t,a,True);q*=Vector((.992,1,.992))
        if kdt.find(q)[2]>43:
            run.append(q)
        else:
            if len(run)>3:tube('Cambium sinew',run,[1.3+.5*math.sin(k*.6)**2]*len(run),sapwood if j%7==0 else bark,hero,6)
            run=[]
    if len(run)>3:tube('Cambium sinew',run,[1.1]*len(run),inner,hero,6)
for i in range(13):
    a=i*math.tau/13
    pts=[(math.cos(a+v*.08)*(R+v*110),25*(1-v)**2-65*v,math.sin(a+v*.08)*(R+v*110)) for v in [0,.2,.5,.75,1]]
    if any(kdt.find(Vector(p))[2]<38 for p in pts):continue
    tube('Great buttress root',pts,[18,17,12,7,1],bark,hero,10)
    tube('Root pale ridge',[(p[0],p[1]+6,p[2]) for p in pts],[3,3.5,2.5,1,.2],sapwood,hero,6)
for i in range(9):
    a=i*math.tau/9+.25
    pts=[(math.cos(a)*(R-6),H-15,math.sin(a)*(R-6)),(math.cos(a+.08)*(R+36),H+18,math.sin(a+.08)*(R+36)),(math.cos(a+.17)*(R+90),H+30,math.sin(a+.17)*(R+90))]
    if any(kdt.find(Vector(p))[2]<38 for p in pts):continue
    tube('Torn crown bough',pts,[13,10,2],bark,hero,10)
    for j in range(3):leaf('Crown lamina',pts[-1],42,16,a+j*1.9,-.2,leafmat,hero)
merge_materials(hero)

def crown_leaf(base,length,width,yaw,pitch,parent,tint=1):
    # Small broad cambered leaves compose real crown volumes; no repeated palm stars.
    verts=[];faces=[];rows=6;cols=4
    for i in range(rows):
        t=i/(rows-1)
        for j in range(cols+1):
            w=j/cols*2-1
            # Rounded, asymmetric lobes and curled margins vary by branch orientation.
            profile=math.sin(math.pi*t)**(.62+.16*math.sin(yaw*2))
            x=profile*width*w*(.88+.12*math.sin(t*math.pi*3+yaw))
            x+=length*.055*math.sin(math.pi*t)*math.sin(yaw*3)
            z=t*length; y=math.sin(math.pi*t)*length*.16+abs(w)**1.6*width*(.18+.18*math.sin(yaw))
            y-=t*t*length*(.10+.18*(.5+.5*math.sin(yaw*4)))
            y+=w*t*width*.16*math.sin(yaw*2)
            yy=y*math.cos(pitch)+z*math.sin(pitch);zz=z*math.cos(pitch)-y*math.sin(pitch)
            verts.append((base[0]+x*math.cos(yaw)+zz*math.sin(yaw),base[1]+yy,base[2]-x*math.sin(yaw)+zz*math.cos(yaw)))
    for i in range(rows-1):
        for j in range(cols):
            a=i*(cols+1)+j;faces.append((a,a+1,a+cols+2,a+cols+1))
    o=mesh('Clustered broad leaf',verts,faces,leafmat,parent)
    ca=o.data.color_attributes.get('COLOR_0') or o.data.color_attributes.new(name='COLOR_0',type='FLOAT_COLOR',domain='CORNER')
    for c in ca.data:c.color=(tint,tint*(.88+.12*tint),tint*.89,1)
    return o

def crown_cluster(center,radius,parent,seed,count=18,flat=False):
    rng=random.Random(seed)
    for j in range(count):
        a=j*2.399+.3*rng.random();r=radius*math.sqrt(rng.random())
        p=(center[0]+math.cos(a)*r,center[1]+(rng.random()-.5)*radius*(.42 if flat else .85),center[2]+math.sin(a)*r)
        # Leading leaves sit above smaller, drooping subordinate sprays.
        leader=j%5==0
        crown_leaf(p,(12 if leader else 8)+rng.random()*5,(5 if leader else 3)+rng.random()*3,a+rng.random(),(-.12 if leader else -.45)+rng.random()*.75,parent,.60+rng.random()*.65)

# High living crown grows out of the continuous bole, completing its silhouette.
for j in range(7):
    a=j*2.399;start_y=H+105+(j%3)*34
    start=(math.cos(a)*97,start_y,math.sin(a)*97)
    tip=(math.cos(a)*(180+(j%2)*28),H+230+(j%3)*28,math.sin(a)*(180+(j%2)*28))
    mid=(start[0]*.8+tip[0]*.2,start_y+55,start[2]*.8+tip[2]*.2)
    tube('Upper living crown fork',[start,mid,tip],[18,13,3],bark,hero,9)
    crown_cluster(tip,44,hero,9100+j,22)
    for side in [-1,1]:
        twig=(tip[0]+math.cos(a+side*.8)*28,tip[1]+20,tip[2]+math.sin(a+side*.8)*28)
        tube('High crown secondary arm',[mid,twig],[7,.8],bark,hero,6)
        crown_cluster(twig,32,hero,9200+j*2+side,12)
crown_cluster((22,H+337,12),39,hero,9337,26)
merge_materials(hero)

# Distinct authored species: twin-fork vault oak, crooked wounded elder, low broad bole.
for variant in range(3):
    root=empty('tree_'+str(variant));height=[176,205,144][variant];radius=[16,15,24][variant]
    verts=[];faces=[];rings=25;sides=24
    for i in range(rings):
        t=i/(rings-1)
        center=((math.sin(t*3+variant)-math.sin(variant))*[15,25,13][variant],t*height,math.sin(t*4+variant)*t*13)
        for j in range(sides):
            a=j*math.tau/sides;r=radius*(1-.79*t)*(1+.23*math.sin(a*(5+variant)-t*6))*(1+.7*math.exp(-t*11))
            r+=radius*.17*math.exp(-((t-.27)/.12)**2)*math.sin(a*3)**2
            verts.append((center[0]+r*math.cos(a),center[1],center[2]+r*math.sin(a)))
    for i in range(rings-1):
        for j in range(sides):
            a=i*sides+j;b=i*sides+(j+1)%sides;faces.append((a,b,b+sides,a+sides))
    mesh('Twisted fluted living bole',verts,faces,bark,root)
    for j in range(7):
        a=j*math.tau/7+variant*.31
        tube('Splayed buttress collar',[(math.cos(a)*radius*.55,34,math.sin(a)*radius*.55),(math.cos(a+.12)*radius*1.25,15,math.sin(a+.12)*radius*1.25),(math.cos(a+.3)*radius*2.4,-2,math.sin(a+.3)*radius*2.4)],[7,6,1],bark,root,7)
    # Pale tears and raised wound rims break uninterrupted vertical shafts.
    for j in range(3):
        a=.8+j*2.2+variant; y=35+j*27; r=radius*(1-.79*y/height)
        points=[]
        for k in range(13):
            u=k*math.tau/12
            points.append((math.cos(a+math.sin(u)*.2)*(r+2),y+math.cos(u)*[16,23,13][variant],math.sin(a+math.sin(u)*.2)*(r+2)))
        tube('Raised pale wound margin',points,[1.1]*len(points),sapwood,root,5)
    forks=[(-1,.54,[-43,35,6]),(1,.62,[39,40,-9])] if variant==0 else ([(-1,.47,[-48,29,13]),(1,.74,[42,20,-18]),(-1,.84,[-26,18,-29])] if variant==1 else [(-1,.36,[-40,37,17]),(1,.40,[42,40,-12]),(1,.67,[25,22,35])])
    for j,(side,t,extent) in enumerate(forks):
        y=height*t;base=(0,y,0);end=(extent[0],y+extent[1],extent[2])
        pts=[base,(extent[0]*.38,y+extent[1]*.38,extent[2]*.3),(extent[0]*.77,y+extent[1]*.85,extent[2]*.7),end]
        tube('Bifurcating structural arm',pts,[radius*.63,8,5,2],bark,root,9)
        for k in range(2):
            tip=(end[0]+(k-.5)*14,end[1]+6+k*5,end[2]+(k-.5)*24)
            tube('Secondary living branch',[pts[2],tip],[3.8,.7],bark,root,6)
            crown_cluster(tip,19 if variant!=2 else 23,root,1000+variant*100+j*10+k,20,variant==2)
    crown_cluster((9,height-3,5),25 if variant!=1 else 17,root,500+variant,25,variant==2)
    # One exposed broken arm with a genuine cut sapwood face.
    a=2.5+variant;end=(math.cos(a)*32,height*.64,math.sin(a)*32)
    tube('Storm-broken arm',[(0,height*.53,0),end],[7,4],bark,root,9)
    ellipsoid('Weathered pale break',end,(4,1.6,4),sapwood,root,5,10)
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
# Four unequal bracket forms spread around a root, not a concentric umbrella tower.
for j,(height,rad,bx,bz,dome) in enumerate([(17,15,-5,-4,3),(29,11,5,3,7),(41,16,-4,5,-1),(49,9,4,-5,4)]):
    angle=j*1.7;base=(bx,0,bz)
    tube('Gnarled fungal stalk',[base,(bx+3,height*.48,bz-2),(bx,height+dome,bz)],[2.2,1.6,1.1],sapwood,root,7)
    verts=[];faces=[];rings=6;sides=24
    def cap(t,a):
        outline=(.77+.23*math.cos(a-angle))*(1+.075*math.sin(a*3+j)+.035*math.sin(a*7-j))
        rr=rad*t*outline
        curl=(1.2*math.sin(a*3+j)+1.0*math.cos(a*2-j))*t**3
        y=height+dome*(1-t*t)+curl+t*.9*math.sin(a+j)
        return (bx+math.cos(a)*rr,y,bz+math.sin(a)*rr)
    for i in range(rings):
        for k in range(sides):verts.append(cap(i/(rings-1),k*math.tau/sides))
    for i in range(rings-1):
        for k in range(sides):
            a=i*sides+k;b=i*sides+(k+1)%sides;faces.append((a,b,b+sides,a+sides))
    mesh('Asymmetric curled fungal shelf',verts,faces,fungus,root,uvs=[((x-bx)/rad*.5+.5,(z-bz)/rad*.5+.5) for x,y,z in verts])
    lower=[(x,y-1.1,z) for x,y,z in verts]
    lowerfaces=[tuple(reversed(f)) for f in faces]
    # Ivory underside, fleshy edge thickness and cool gills carry separate shading.
    mesh('Pale fungal underside',lower,lowerfaces,pores,root,uvs=[((x-bx)/rad*.5+.5,(z-bz)/rad*.5+.5) for x,y,z in lower])
    rim=[cap(1,k*math.tau/32) for k in range(33)]
    tube('Steady luminous fungal lip',rim,[.22]*len(rim),vein,root,4)
    edge=[];edgefaces=[]
    for k in range(sides):
        top=cap(1,k*math.tau/sides);edge.extend([top,(top[0],top[1]-1.1,top[2])])
        edgefaces.append((k*2,k*2+1,((k+1)%sides)*2+1,((k+1)%sides)*2))
    mesh('Fleshy torn fungal edge',edge,edgefaces,fungus,root)
    for k in range(8):
        a=k*math.tau/8+j*.13
        pts=[cap(t,a+.08*t) for t in [.06,.5,.94]]
        tube('Underside radial gill',[(x,y-1.28,z) for x,y,z in pts],[.25,.22,.08],fungus,root,4)
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
                p=i*(nv+1)+k;faces.append((p+nv+1,p+nv+2,p+1,p))
        o=mesh('Curled flower petal',verts,faces,ivory,flower,uvs=[(i/nu,k/nv) for i in range(nu+1) for k in range(nv+1)]);o.data.materials.append(petalback)
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
# Transverse breathing ribs and inset grooves break up the broad belly mass.
for j in range(11):
    z=-53+j*10
    pts=[]
    for k in range(13):
        a=math.pi+.08+k*(math.pi-.16)/12
        pts.append((35*math.cos(a),120+27*math.sin(a),z+2*math.sin(a)))
    tube('Pale overlapping ventral rib',pts,[1.1+1.5*math.sin(k*math.pi/12)**2 for k in range(13)],creatureridge,body,6)

for j in range(10):
    z=-59+j*12
    ellipsoid('Overlapping dorsal shield',(0,136+6*math.sin(j*.3),z),(37*(.7+.3*math.sin((j+1)*math.pi/11)),17,17),creatureshell,body,10,24)
    # Chipped pale plate edges and one raised keel make each shield a real layered scale.
    width=37*(.7+.3*math.sin((j+1)*math.pi/11))
    ridge=[(width*math.cos(k*math.pi/16),136+6*math.sin(j*.3)+17*math.sin(k*math.pi/16),z+10) for k in range(17)]
    tube('Weathered carapace edge',ridge,[.65]*17,creatureridge,body,5)
    tube('Dorsal shield keel',[(0,149,z-7),(0,158,z),(0,150,z+13)],[1.6,2.1,.4],creatureridge,body,6)
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
    tube('Raised cheek ridge',[(side*8,7,-8),(side*13,3,8),(side*9,-1,25),(side*4,-2,36)],[1.4,1.8,1.2,.25],creatureridge,head,7)
    tube('Muzzle mouth seam',[(side*7,-5,13),(side*8,-5,26),(side*3,-4,36)],[.48,.5,.12],creatureshell,head,5)
    ellipsoid('Inset nostril',(side*4,0,34),(1.2,.6,2),creatureshell,head,6,10)
    for j in range(5):
        tube('Neck overlapping gill',[(side*13,1+j*5,14+j*7),(side*18,3+j*5,18+j*7),(side*12,5+j*5,24+j*7)],[1.1,1.7,.4],creatureridge,neck,6)

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
        for sideOffset in [-1,1]:
            tube('Raised lower tendon',[(sideOffset*5,-6,0),(side*12+sideOffset*3,-28,foot[2]*.5),(foot[0]+sideOffset,foot[1]+6,foot[2])],[1.2,.85,.2],creatureridge,lower,6)
        for band in range(3):
            y=-12-band*10;x=side*(-y/58)*22;zz=foot[2]*(-y/58)
            tube('Joint flexion crease',[(x-5,y,zz+2),(x,y-1,zz+5),(x+5,y,zz+2)],[.45,.6,.45],creatureshell,lower,5)

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
        dec=o.modifiers.new('Ordinary foliage interior reduction','DECIMATE')
        # Preserve the thick leaf perimeter; tiny cylindrical vein facets carry
        # little silhouette information and can use a stronger interior reduction.
        dec.ratio=.30 if o.data.materials[0]==vein else .45
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=dec.name)

# Geometric distance family preserves branch/leaf silhouettes without billboards.
for variant in range(3):
    source=bpy.data.objects['tree_'+str(variant)]
    lod=empty('tree_lod_'+str(variant))
    for original in source.children:
        if original.type!='MESH':continue
        o=original.copy();o.data=original.data.copy();bpy.context.collection.objects.link(o);o.parent=lod
        dec=o.modifiers.new('Distant silhouette simplification','DECIMATE')
        # Keep trunks/branches exact to the approved distance family, trimming
        # only redundant leaf interiors on ordinary far crowns.
        dec.ratio=.135 if o.data.materials[0]==leafmat else .18
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=dec.name)
# Approved placement envelopes remain fixed while leaf interiors are refined.
approved_tree_bounds=[((-76.9239197,-2.7276151,-42.7764816),(72.1163025,185.6220856,36.3825607)),((-87.206337,-2.706378,-58.949352),(72.585862,212.348862,45.301861)),((-73.538826,-2.838007,-56.924149),(81.618386,149.224426,67.558205))]
for variant,(lower,upper) in enumerate(approved_tree_bounds):
    for prefix in ['tree_','tree_lod_']:
        root=bpy.data.objects[prefix+str(variant)]
        root['clearanceSize']=[upper[k]-lower[k] for k in range(3)]
        for obj in root.children:
            if obj.type!='MESH':continue
            for v in obj.data.vertices:
                x,z,y=v.co.x,-v.co.y,v.co.z
                x=max(lower[0],min(upper[0],x));y=max(lower[1],min(upper[1],y));z=max(lower[2],min(upper[2],z))
                v.co=B((x,y,z))
            obj.data.update()
# Validate modifiers before export; the only texture is packed original art.
for obj in bpy.data.objects:
    if obj.type=='MESH':obj.data.validate(clean_customdata=False)
# Material-backed original meshes, no external dependencies or texture downloads.
for m in bpy.data.materials:
    m.use_backface_culling=False
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU'
scene['provenance']='Original generated by build_vesper.py from three built-in imagegen scene concepts, 2026-09-29.'
scene['route_revision']=envelope['revision']
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'vesper-assets.blend'))
bpy.ops.export_scene.gltf(filepath=str(DEST/'vesper-canopy.glb'),export_format='GLB',export_yup=True,export_apply=True,export_animations=False,export_extras=True)
metrics={'objects':len(bpy.data.objects),'meshes':len(bpy.data.meshes),'polygons':sum(len(o.data.polygons) for o in bpy.data.objects if o.type=='MESH'),'exportBytes':(DEST/'vesper-canopy.glb').stat().st_size,'routeRevision':envelope['revision'],'rendered':False}
(ROOT/'asset-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
print('VESPER_ASSET_METRICS '+json.dumps(metrics))
