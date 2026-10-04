import bpy, math, json, os, random
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../../..'))
ART = ROOT + '/assets/levels/nacre/blender/leviathan'
OUT = ROOT + '/public/assets/levels/nacre/leviathan'
CAP = ROOT + '/.experiments/gate4-1/leviathan-review'
for path in [ART, OUT, CAP]: os.makedirs(path, exist_ok=True)
# This script is run with --factory-startup in a new background Blender process.
for obj in list(bpy.data.objects): bpy.data.objects.remove(obj, do_unlink=True)
scene = bpy.context.scene
bpy.context.preferences.filepaths.save_version = 0
scene.unit_settings.system = 'METRIC'
asset = bpy.data.collections.new('Nacre Leviathan / editable source')
scene.collection.children.link(asset)
stage = bpy.data.collections.new('Nacre Leviathan / still review only')
scene.collection.children.link(stage)
LENGTH = 180.0
TARGET_LENGTH = 280.0
BULK = 1.42

def material(name, color, roughness, metallic=0, emission=None):
    m = bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=roughness
    p.inputs['Metallic'].default_value=metallic
    if emission:
        p.inputs['Emission Color'].default_value=(*emission,1)
        p.inputs['Emission Strength'].default_value=0.66
    return m

skin=material('Living deep teal / wet hide',(0.025,0.105,0.12),.38,.08)
pearl=material('Nacre / overlapping dorsal shields',(.235,.36,.375),.49,.14)
fin=material('Translucent-looking teal / solid fin membranes',(.025,.125,.145),.48,.04)
glow=material('Cyan living photophores',(.04,.50,.57),.34,.08,(.045,.53,.61))
groove=material('Deep inset / mouth and gills',(.007,.026,.035),.42,.05)
parts={m.name:[] for m in [skin,pearl,fin,glow,groove]}

def mesh(name, verts, faces, mat, collection=asset):
    data=bpy.data.meshes.new(name); data.from_pydata(verts,[],faces); data.update()
    o=bpy.data.objects.new(name,data); collection.objects.link(o)
    data.materials.append(mat)
    if mat in [skin,pearl,fin]: paint_object(o,mat)
    for poly in data.polygons: poly.use_smooth=True
    if collection==asset: parts[mat.name].append(o)
    return o

profile=[(0,3.3,2.5),(3,5.5,4.1),(10,8.9,6.7),(18,8.7,8.2),(30,8.9,9.0),(48,8.0,8.25),(76,6.7,6.9),(106,5.0,5.2),(135,3.5,3.8),(159,2.0,2.25),(175,.69,.85),(180,.06,.1)]
def radii(x):
    for i in range(len(profile)-1):
        a,b=profile[i],profile[i+1]
        if x<=b[0]:
            t=max(0,min(1,(x-a[0])/(b[0]-a[0]))); t=t*t*(3-2*t)
            return a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t
    return .06,.1
def surface(x, angle, lift=0):
    ry,rz=radii(x)
    belly=(1.0*math.exp(-((x-26)/23)**2)+.45*math.exp(-((x-67)/35)**2))*max(0,-math.cos(angle))**2
    return (x,math.sin(angle)*(ry+lift),math.cos(angle)*(rz+lift)-belly)

# Vertex paint is actual GLTF COLOR_0 data, not a Blender-only procedural node.
# Values are in linear RGB and share the exact same material path in Blender
# and the game. Keep variation broad and restrained enough to read at distance.
base_colors={m.name:tuple(m.diffuse_color[:3]) for m in [skin,pearl,fin]}
for material in [skin,pearl,fin]:
    node=material.node_tree.nodes.new('ShaderNodeVertexColor');node.layer_name='OrganicTint'
    material.node_tree.links.new(node.outputs['Color'],material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
def smooth(t):
    t=max(0,min(1,t));return t*t*(3-2*t)
def paint_object(obj,material):
    colors=obj.data.color_attributes.new(name='OrganicTint',type='FLOAT_COLOR',domain='POINT')
    base=base_colors[material.name]
    for v,c in zip(obj.data.vertices,colors.data):
        x,y,z=v.co;ry,rz=radii(x)
        broad=math.sin(x*.27+math.sin(y*.56))*math.sin(y*.39+math.sin(x*.091)+z*.13)
        fine=math.sin(x*.79+y*.54+math.sin(z*.81))*.25
        mix=0.;target=base
        if material==skin:
            belly=smooth((-z/max(.15,rz)+.08)/1.05)
            mix=belly*.62;target=(.064,.158,.161)
            variation=.91+.14*broad+.045*fine
        elif material==fin:
            mix=smooth((abs(y)/max(.2,ry)-.9)/1.0)*.55;target=(.044,.092,.101)
            variation=.94+.09*broad
        else:
            if 'scute' in obj.name:
                # Darker organic growth margins, softer inner nacre surface.
                edge=1. if v.index<9 else (.17 if v.index<18 else 0.)
                mix=edge*.64;target=(.085,.187,.198)
                variation=.94+.075*math.sin(x*.34+y*.7)+.04*broad
            else:
                t=max(0,min(1,(x-.45)/22.8))
                angle=abs(math.atan2(y/max(.01,ry),z/max(.01,rz)))
                edge=max(smooth((angle-.46)/.50),smooth((t-.72)/.28)*.76)
                mix=edge*.58;target=(.095,.198,.211)
                variation=.88+.18*broad+.05*fine
        rgb=[max(.004,((1-mix)*base[i]+mix*target[i])*variation) for i in range(3)]
        c.color=(*rgb,1)

# Dense, even longitudinal rings permit continuous runtime spline deformation.
verts=[]; faces=[]; n=241; radial=40
for i in range(n):
    x=i*LENGTH/(n-1); ry,rz=radii(x)
    for j in range(radial):
        a=2*math.pi*j/radial
        groove_scale=1+(.009*math.cos(x*2.5))*(1 if x>18 else .15)
        p=surface(x,a);verts.append((p[0],p[1]*groove_scale,p[2]*groove_scale))
for i in range(n-1):
    for j in range(radial):
        a=i*radial+j; b=i*radial+(j+1)%radial
        faces.append((a,a+radial,b+radial,b))
faces += [tuple(range(radial)),tuple((n-1)*radial+j for j in reversed(range(radial)))]
mesh('Continuous ring-topology body',verts,faces,skin)

def ribbon(name, points, width, mat, radial=5):
    verts=[]; faces=[]
    for i,p in enumerate(points):
        p=Vector(p); prev=Vector(points[max(0,i-1)]); nex=Vector(points[min(len(points)-1,i+1)])
        tangent=(nex-prev).normalized(); ref=Vector((0,0,1))
        if abs(tangent.dot(ref))>.94: ref=Vector((0,1,0))
        r=tangent.cross(ref).normalized(); u=tangent.cross(r).normalized()
        for j in range(radial):
            a=j*math.tau/radial; verts.append(p+width*(r*math.cos(a)+u*math.sin(a)))
    for i in range(len(points)-1):
        for j in range(radial):
            a=i*radial+j; b=i*radial+(j+1)%radial
            faces.append((a,b,b+radial,a+radial))
    return mesh(name,verts,faces,mat)

# A single curved bony brow grows out of the rounded muzzle. Its small scalloped
# trailing edge exposes a living neck instead of paired aircraft-like panels.
v=[]; f=[]; nx=25; na=17
for i in range(nx):
    t=i/(nx-1); x=.45+t*22.8
    aperture=.60+.47*math.sin(math.pi*t)**.55
    for j in range(na):
        q=2*j/(na-1)-1; a=q*aperture
        scallop=(.65+1.55*math.sin(q*math.pi*3+.4)**2)*t**7
        v.append(surface(x+scallop,a,.13+.44*(1-q*q)*math.sin(math.pi*t)+.075*math.sin(x*1.05+q*3.4)*math.sin(math.pi*t)**2))
for i in range(nx-1):
    for j in range(na-1):
        a=i*na+j; f.append((a,a+na,a+na+1,a+1))
mesh('Rounded single cephalic crown',v,f,pearl)
for side in [-1,1]:
    pts=[surface(x,side*(1.82+.018*x),.10) for x in range(0,24)]
    ribbon('Continuous soft muzzle crease',pts,.14,groove)
    # A fleshy lower lip gives the head a whale-like expression.
    ribbon('Rounded lower lip',[surface(x,side*(1.88+.016*x),.16) for x in range(0,21)],.20,skin,6)
    for fold in range(3):
        points=[surface(13+i*.85,side*(1.03+fold*.16+.09*math.sin(i*.34)),.17) for i in range(15)]
        ribbon('Soft jaw-to-neck hide crease',points,.10+fold*.025,skin,5)
    for k,x in enumerate([25,29,33,37]):
        angles=[.94+i*.13 for i in range(12)]
        pts=[surface(x+.85*math.sin(a*1.5),side*a,.09) for a in angles]
        ribbon('Curved breathing gill recess',pts,.16,groove)
        ribbon('Soft raised gill fold',[(p[0]-.48,p[1]*1.007,p[2]) for p in pts],.19,skin,6)
        ribbon('Gill living light tip',pts[-4:],.045,glow,4)
    eye_x=9.1; eye_a=side*1.34
    eye_position=surface(eye_x,eye_a,.13)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=10, radius=1, location=eye_position)
    eye=bpy.context.object; eye.name='Recessed living cyan eye'; eye.scale=(.87,.30,.48)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    for c in list(eye.users_collection): c.objects.unlink(eye)
    asset.objects.link(eye); eye.data.materials.append(glow); parts[glow.name].append(eye)
    for poly in eye.data.polygons: poly.use_smooth=True
    points=[surface(eye_x-1.25+u*.42,side*(1.20-.035*math.sin(u*.8)),.23) for u in range(7)]
    ribbon('Heavy organic eye brow',points,.26,skin,6)

# Overlapping rounded scutes: raised inner rings and rolled edges, no flat
# repeated metal slats. The three rows are offset and leave broad hide channels.
for row,a in enumerate([-.84,0,.84]):
    for k in range(20):
        x=27+k*6.8+(3.25 if row!=1 else 0)+.65*math.sin(k*1.67+row*2)
        if x>164: continue
        length=(8.4 if x<125 else 7.0)*(1+.12*math.sin(k*1.29+row*3))
        aw=(.31 if row!=1 else .40)*(1+.16*math.sin(k*.83+row*1.7))
        a += .017*math.sin(k*2.1+row)
        outline=[(x-length*.46,a-aw*.72),(x-length*.21,a-aw),(x+length*.24,a-aw*.83),(x+length*.55,a-aw*.31),(x+length*.60,a),(x+length*.55,a+aw*.31),(x+length*.24,a+aw*.83),(x-length*.21,a+aw),(x-length*.46,a+aw*.72)]
        outline=[(u+.22*math.sin(j*2.2+k*.6),angle+.015*math.sin(j*2.4+k)) for j,(u,angle) in enumerate(outline)]
        inner=[(x+(u-x)*.71,a+(angle-a)*.71) for u,angle in outline]
        v=[surface(u,angle,.17) for u,angle in outline]+[surface(u,angle,.61) for u,angle in inner]+[surface(x-.5,a,.76)]
        n=len(outline); f=[]
        for j in range(n):
            f.append((j,(j+1)%n,(j+1)%n+n,j+n))
            f.append((j+n,(j+1)%n+n,n*2))
        mesh('Rounded overlapping nacre scute',v,f,pearl)

# Flowing low fins, attached continuously rather than free appendages.
for side in [-1,1]:
    v=[]; f=[]; samples=93
    for i in range(samples):
        x=31+i*1.46; t=i/(samples-1); ry,rz=radii(x)
        reach=(2.4+3.8*math.sin(math.pi*t)**.7)*(1-.4*t)*(1+.10*math.sin(x*.49))
        for j in range(3):
            q=j/2
            v.append((x+q*2.4,side*(ry*.75+reach*q),-rz*.51-q*(1.7+.45*math.sin(x*.55))))
    for i in range(samples-1):
        for j in range(2):
            a=i*3+j; f.append((a,a+1,a+4,a+3))
    # A closed, softly thickened insertion instead of a one-sided paper strip.
    top_count=len(v)
    v += [(p[0],p[1],p[2]-(.30*(1-(j%3)/2)+.035)) for j,p in enumerate(v)]
    f += [tuple(i+top_count for i in reversed(face)) for face in list(f)]
    for i in range(samples-1):
        a=i*3; b=(i+1)*3; f.append((a,b,b+top_count,a+top_count))
        a=i*3+2; b=(i+1)*3+2; f.append((a,a+top_count,b+top_count,b))
    mesh('Continuous lateral swimming fringe',v,f,fin)
    ribbon('Fleshy fin insertion',[v[i*3] for i in range(samples)],.25,skin,6)
    for i in range(0,samples,3):
        ribbon('Fine membrane rib',[v[i*3],v[i*3+1],v[i*3+2]],.085,skin,5)
    for start in range(0,samples-5,12):
        ribbon('Interrupted living fin margin',[v[i*3+2] for i in range(start,min(samples,start+8))],.045,glow,4)

# A narrow upright tail blade, broad enough to read at track scale.
v=[]; f=[]
for i in range(31):
    x=142+i*1.24; t=i/30; ry,rz=radii(min(x,180)); h=math.sin(math.pi*t)**1.2*6.5
    v.extend([(x,0,rz*.7),(x+2,0,rz+h)])
for i in range(30): f.append((i*2,i*2+1,i*2+3,i*2+2))
mesh('Low swept dorsal tail blade',v,f,fin)
ribbon('Tail fin luminous edge',[v[i*2+1] for i in range(31)],.095,glow)

# Light lives in irregular photophore chains, not full-length luminous cables.
for side in [-1,1]:
    for segment in range(14):
        x=15+segment*11.3+.8*math.sin(segment*2.4+side)
        length=4.0+2.1*(.5+.5*math.sin(segment*1.6))
        points=[surface(x+i*.6,side*(1.82+.10*math.sin((x+i*.6)*.12)),.065) for i in range(int(length/.6)+1)]
        ribbon('Broken lateral photophore chain',points,.065+.023*math.sin(segment*.9)**2,glow,4)
rng=random.Random(12943)
for i in range(300):
    x=rng.uniform(23,162); a=rng.choice([-1,1])*rng.uniform(.8,2.4)
    p=Vector(surface(x,a,.095)); r=.07+rng.random()*.11
    v=[p+Vector((r,0,0)),p+Vector((-r,0,0)),p+Vector((0,r*.2,r)),p+Vector((0,-r*.2,-r))]
    mesh('Living photophore',v,[(0,2,1),(0,1,3)],glow)

# Join by material: five meshes / five production draw calls, no image maps.
objects=[]
for name,items in parts.items():
    if not items: continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in items: o.select_set(True)
    bpy.context.view_layer.objects.active=items[0]; bpy.ops.object.join()
    o=bpy.context.object; o.name=name; objects.append(o)
    for v in o.data.vertices:
        v.co.x*=TARGET_LENGTH/LENGTH; v.co.y*=BULK; v.co.z*=BULK
    o.data.update()
    o['rest_axis']='X: head 0 m to tail 280 m; Blender +Z dorsal, +Y port'
    o['runtime_deformation']='Continuous arc-length path with transported normal frame'

# Editable armature is retained in the .blend for artist poses; runtime GLB is
# exported in its neutral rest pose and bent using the same dense source rings.
armdata=bpy.data.armatures.new('Leviathan / 31-station editing rig')
rig=bpy.data.objects.new('Leviathan / editing rig',armdata); asset.objects.link(rig)
bpy.context.view_layer.objects.active=rig; rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for i in range(31):
    b=armdata.edit_bones.new('Spine.%02d'%i); b.head=(i*TARGET_LENGTH/30,0,0); b.tail=((i+1)*TARGET_LENGTH/30,0,0)
    if i: b.parent=armdata.edit_bones['Spine.%02d'%(i-1)]; b.use_connect=True
bpy.ops.object.mode_set(mode='OBJECT')
rig.show_in_front=True
for o in objects:
    groups=[o.vertex_groups.new(name='Spine.%02d'%i) for i in range(31)]
    for v in o.data.vertices:
        s=max(0,min(29.999,v.co.x/(TARGET_LENGTH/30))); k=int(s); t=s-k
        groups[k].add([v.index],1-t,'REPLACE'); groups[k+1].add([v.index],t,'REPLACE')
    o.parent=rig
    mod=o.modifiers.new('Editable continuous spine','ARMATURE'); mod.object=rig

bpy.ops.object.select_all(action='DESELECT')
for o in objects: o.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
export_path=OUT+'/nacre-leviathan-v2.glb'
bpy.ops.export_scene.gltf(filepath=export_path,export_format='GLB',use_selection=True,export_skins=False,export_animations=False,export_apply=True,export_yup=True,export_vertex_color='MATERIAL',export_all_vertex_colors=False)
triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)
report={'lengthMetres':280,'conservativeRadius':24,'artRevision':11,'vertexColorMeshes':3,'materialVariation':'GLTF COLOR_0 organic growth edges, broad head mottling, muted belly gradient; exported scalar PBR roughness','materials':len(objects),'triangles':triangles,'textureCount':0,'vertexCount':sum(len(o.data.vertices) for o in objects),'blenderVersion':bpy.app.version_string,'runtimeAxis':'GLTF +X head-to-tail, +Y dorsal, +Z starboard','glbBytes':os.path.getsize(export_path)}
with open(ART+'/model-manifest-v2.json','w') as f: json.dump(report,f,indent=2)


scene['design']='One enormous organic aquatic worm: fuller muzzle and neck, curved nacre scutes, soft fin membranes. V2 source, original v1 preserved.'
bpy.ops.wm.save_as_mainfile(filepath=ART+'/nacre-leviathan-v2.blend')
print(json.dumps(report))
