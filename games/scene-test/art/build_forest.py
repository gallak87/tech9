"""Rebuild the original forest kit in an isolated Blender background process.

  python3 art/generate_needles.py
  blender --background --factory-startup --python art/build_forest.py

All design choices are deterministic. Image sources are in public/assets/ASSETS.md.
"""
import bpy
import json
import math
import random
from pathlib import Path
from mathutils import Vector, noise

ROOT=Path(__file__).resolve().parent
TEXTURES=ROOT/'textures'
OUTPUT=ROOT.parent/'public'/'assets'
OUTPUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def image_node(mat, filename, noncolor=False):
    node=mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image=bpy.data.images.load(str(TEXTURES/filename),check_existing=True)
    if noncolor:
        node.image.colorspace_settings.name='Non-Color'
    return node

def pbr(name,prefix=None,color=(.3,.3,.3,1),rough=.88,normal_strength=.65):
    mat=bpy.data.materials.new(name)
    mat.use_nodes=True
    bs=mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=color
    bs.inputs['Roughness'].default_value=rough
    if prefix:
        tex=image_node(mat,prefix+'_diff_1k.jpg')
        mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
        rou=image_node(mat,prefix+'_rough_1k.jpg',True)
        mat.node_tree.links.new(rou.outputs['Color'],bs.inputs['Roughness'])
        nor=image_node(mat,prefix+'_nor_gl_1k.jpg',True)
        normal=mat.node_tree.nodes.new('ShaderNodeNormalMap')
        normal.inputs['Strength'].default_value=normal_strength
        mat.node_tree.links.new(nor.outputs['Color'],normal.inputs['Color'])
        mat.node_tree.links.new(normal.outputs['Normal'],bs.inputs['Normal'])
    return mat

bark=pbr('Bark','bark_brown_02',normal_strength=1.0)
rockmat=pbr('MossyGranite','rock_boulder_cracked',normal_strength=.8)
for node in rockmat.node_tree.nodes:
    if node.type=='TEX_IMAGE' and node.image.name.startswith('rock_boulder_cracked_diff'):
        node.image=bpy.data.images.load(str(TEXTURES/'forest-granite-diff.jpg'),check_existing=True)
needlemat=pbr('PineNeedles',rough=.93)
nt=image_node(needlemat,'pine-spray.png')
bs=needlemat.node_tree.nodes.get('Principled BSDF')
needlemat.node_tree.links.new(nt.outputs['Color'],bs.inputs['Base Color'])
needlemat.node_tree.links.new(nt.outputs['Alpha'],bs.inputs['Alpha'])
bs.inputs['Specular IOR Level'].default_value=.22
needlemat.surface_render_method='DITHERED'
needlemat.use_backface_culling=False
needlemat['alpha_cutoff']=.42
wood=pbr('TimberEndgrain',rough=.98)
wt=image_node(wood,'timber-endgrain.jpg')
wood.node_tree.links.new(wt.outputs['Color'],wood.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

# glTF exports COLOR_0 only when the active color attribute participates in the
# material. Multiply keeps the photogrammetry while adding moss/crown variation.
for mat in (bark,rockmat,needlemat,wood):
    bs=mat.node_tree.nodes.get('Principled BSDF')
    incoming=bs.inputs['Base Color'].links[0].from_socket
    color=mat.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name='Color'
    mix=mat.node_tree.nodes.new('ShaderNodeMixRGB')
    mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
    mat.node_tree.links.new(incoming,mix.inputs[1])
    mat.node_tree.links.new(color.outputs['Color'],mix.inputs[2])
    mat.node_tree.links.new(mix.outputs['Color'],bs.inputs['Base Color'])

class Mesh:
    def __init__(self):
        self.v=[];self.f=[];self.uv=[];self.colors=[]
    def vertex(self,v,uv=(0,0),color=(1,1,1,1)):
        self.v.append(tuple(v));self.uv.append(uv);self.colors.append(color)
        return len(self.v)-1
    def finish(self,name,parent,mat):
        mesh=bpy.data.meshes.new(name)
        mesh.from_pydata(self.v,[],self.f)
        mesh.update()
        uvs=mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops: uvs.data[loop.index].uv=self.uv[loop.vertex_index]
        colors=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
        for i,c in enumerate(self.colors):colors.data[i].color=c
        obj=bpy.data.objects.new(name,mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent=parent
        obj.data.materials.append(mat)
        for poly in mesh.polygons:poly.use_smooth=True
        return obj

def root(name):
    obj=bpy.data.objects.new(name,None)
    bpy.context.collection.objects.link(obj)
    obj['asset_role']='reusable prototype; base origin; metres'
    return obj

def tube(mesh,points,radii,sides=8,uvscale=1,color=(1,1,1,1)):
    rings=[];length=0
    for i,point in enumerate(points):
        p=Vector(point)
        tangent=(Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])).normalized()
        axis=tangent.cross(Vector((0,1,0)))
        if axis.length < .1:axis=tangent.cross(Vector((1,0,0)))
        axis.normalize();other=tangent.cross(axis).normalized()
        if i:length+=(p-Vector(points[i-1])).length
        ring=[]
        for j in range(sides+1):
            a=j/sides*math.tau
            # Lobed irregularity is coherent along the trunk; no lathed silhouette.
            radial=radii[i]*(1+.11*math.sin(a*5+i*.19)+.055*math.sin(a*9-i*.13))
            v=p+(axis*math.cos(a)+other*math.sin(a))*radial
            ring.append(mesh.vertex(v,(j/sides*max(.35,radii[0]*3.8),length*uvscale),color))
        rings.append(ring)
    for i in range(len(rings)-1):
        for j in range(sides):mesh.f.append((rings[i][j],rings[i][j+1],rings[i+1][j+1],rings[i+1][j]))
    mesh.f.append(tuple(reversed(rings[0][:-1])))
    mesh.f.append(tuple(rings[-1][:-1]))

def spray(mesh,center,direction,size,rng,shade):
    along=Vector(direction).normalized()
    # Sprays occupy all three dimensions; horizontal-only cards disappear when
    # looking up from the ground and falsely make healthy pines look skeletal.
    normal=Vector((rng.uniform(-1,1),rng.uniform(-1,1),rng.uniform(-.6,1)))
    side=along.cross(normal).normalized()
    if side.length < .05:side=Vector((1,0,0))
    along=side.cross(normal).normalized()
    center=Vector(center)
    verts=[]
    # The authored atlas includes every twig, allowing a simple two-triangle card.
    for u,v in ((0,0),(1,0),(1,1),(0,1)):
        fold=(.5-abs(v-.5))*size*.17
        point=center+side*((u-.5)*size*.86)+along*((v-.38)*size)+normal*fold
        verts.append(mesh.vertex(point,(u,v),(shade,shade,shade,1)))
    mesh.f.append((verts[0],verts[1],verts[2],verts[3]))

def make_pine(name,seed,height,lean):
    rng=random.Random(seed)
    parent=root(name)
    tw=Mesh();leaves=Mesh()
    def trunk(t):return Vector((lean*t+math.sin(t*5)*.12,t*t*.27,height*t))
    segments=34
    pts=[trunk(i/segments) for i in range(segments+1)]
    radii=[.41*(1-i/segments)**.84+.024+(.19 if i==0 else .045 if i==1 else 0) for i in range(segments+1)]
    tube(tw,pts,radii,14,.34)
    for k in range(7):
        a=k/7*math.tau+rng.uniform(-.2,.2)
        d=Vector((math.cos(a),math.sin(a),0))
        tube(tw,[(0,0,.31),d*.48+Vector((0,0,.13)),d*rng.uniform(.9,1.35)+Vector((0,0,-.03))],[.15,.105,.015],7,.9)
    # Randomized whorls and missing branches deliberately break crown symmetry.
    for tier in range(11):
        t=.38+tier*.055+rng.uniform(-.012,.012)
        base=trunk(t)
        phase=tier*2.39+rng.random()*.6
        n=rng.choice([4,5])
        profile=(.35+math.sin((t-.29)/.73*math.pi)*.8)
        for k in range(n):
            if rng.random()<.1:continue
            a=phase+k/n*math.tau+rng.uniform(-.26,.26)
            direction=Vector((math.cos(a),math.sin(a),0))
            side=Vector((-math.sin(a),math.cos(a),0))
            length=rng.uniform(2.4,4.5)*profile
            rise=rng.uniform(.3,1.4)
            points=[]
            for j in range(6):
                f=j/5
                points.append(base+direction*(length*f)+side*(math.sin(f*3)*rng.uniform(-.17,.17))+Vector((0,0,-.42*math.sin(f*math.pi)+rise*f*f)))
            r=.095*(1-t*.65)*rng.uniform(.8,1.2)
            tube(tw,points,[r,r*.85,r*.62,r*.41,r*.23,.009],5,.75)
            for f in (.42,.69,.94):
                p=base+direction*(length*f)+Vector((0,0,-.42*math.sin(f*math.pi)+rise*f*f))
                for sign in (-1,1):
                    reach=length*(1-f*.52)*rng.uniform(.29,.46)
                    out=(direction*.47+side*sign*.81+Vector((0,0,.22))).normalized()
                    tip=p+out*reach
                    tube(tw,[p,tip],[r*.30,.0045],3,1)
                    for q in (.32,.69,1):
                        center=p+out*reach*q
                        center+=Vector((rng.uniform(-.10,.1),rng.uniform(-.10,.1),rng.uniform(-.08,.12)))
                        shoot=(out+Vector((rng.uniform(-.4,.4),rng.uniform(-.4,.4),rng.uniform(-.1,.7)))).normalized()
                        spray(leaves,center,shoot,rng.uniform(1.43,1.94),rng,rng.uniform(.85,1.09))
    # Exposed lower dead branch stubs preserve mature forest scale.
    for k in range(9):
        t=rng.uniform(.16,.42);a=rng.random()*math.tau
        p=trunk(t);d=Vector((math.cos(a),math.sin(a),rng.uniform(-.4,.2)))
        tube(tw,[p,p+d*.46,p+d*rng.uniform(.65,1.3)],[.07,.032,.009],6,.8)
    tw.finish(name+'_wood',parent,bark)
    leaves.finish(name+'_needles',parent,needlemat)
    return parent

make_pine('pine_a',417,21.5,.68)
make_pine('pine_b',849,24,-.8)

def make_rock(name,seed,scale):
    rng=random.Random(seed)
    parent=root(name)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4,radius=1)
    ob=bpy.context.object
    ob.name=name+'_stone';ob.parent=parent
    offset=Vector((seed*.13,seed*.27,seed*.31))
    for v in ob.data.vertices:
        p=v.co.copy()
        n=noise.fractal(p*2.3+offset,1.1,2,3)
        # Broad chipped planes and much finer edge wear.
        fac=1+n*.22+noise.noise(p*12+offset)*.035
        v.co.x=p.x*scale[0]*fac
        v.co.y=p.y*scale[1]*fac
        v.co.z=max(-.12,p.z*scale[2]*fac+.52*scale[2])
    uvs=ob.data.uv_layers.new(name='UVMap')
    for poly in ob.data.polygons:
        poly.use_smooth=True
        normal=poly.normal
        ax=max(range(3),key=lambda i:abs(normal[i]))
        for li in poly.loop_indices:
            p=ob.data.vertices[ob.data.loops[li].vertex_index].co
            if ax==0:uv=(p.y*.48,p.z*.48)
            elif ax==1:uv=(p.x*.48,p.z*.48)
            else:uv=(p.x*.48,p.y*.48)
            uvs.data[li].uv=uv
    cols=ob.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
    for i,v in enumerate(ob.data.vertices):
        moss=max(0,min(1,(v.co.z/scale[2]-.2)*.7+noise.noise(v.co*3+offset)*.65))
        cols.data[i].color=(1-moss*.47,1-moss*.35,1-moss*.70,1)
    ob.data.materials.append(rockmat)
    ob.data.update()
    return parent

make_rock('rock_a',19,(1.7,1.16,1.04))
make_rock('rock_b',93,(1.02,1.32,.80))

logparent=root('fallen_log')
log=Mesh();ends=Mesh()
logpoints=[Vector((i*.68,math.sin(i*.43)*.07,.34+math.sin(i*.55)*.035)) for i in range(9)]
tube(log,logpoints,[.32-i*.014 for i in range(9)],15,.4)
for i in (0,8):
    center=logpoints[i];r=.32-i*.014
    mid=ends.vertex(center,(.5,.5))
    ring=[]
    for j in range(15):
        a=j/15*math.tau
        ring.append(ends.vertex(center+Vector((-.006 if i==0 else .006,math.cos(a)*r,math.sin(a)*r)),(.5+math.cos(a)*.49,.5+math.sin(a)*.49)))
    for j in range(15):ends.f.append((mid,ring[j],ring[(j+1)%15]) if i else (mid,ring[(j+1)%15],ring[j]))
for j in (2,5,7):
    p=logpoints[j]
    tube(log,[p,p+Vector((.18,.41,.23)),p+Vector((.30,.58,.34))],[.095,.06,.035],7,.8)
log.finish('fallen_log_bark',logparent,bark)
ends.finish('fallen_log_endgrain',logparent,wood)

# Pack sources so the Blender project is portable and retain only asset objects.
for image in bpy.data.images:
    if image.source=='FILE':image.pack()
for obj in bpy.context.scene.objects:obj.select_set(True)
bpy.context.scene.unit_settings.system='METRIC'
bpy.context.scene.unit_settings.scale_length=1
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'forest-kit.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT/'forest-kit.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_extras=True,export_vertex_color='NAME',export_vertex_color_name='Color')

# Set a strict cutout rather than blended foliage; Blender 5's dithered mode is
# emitted as BLEND by the exporter. This glTF-level correction is deliberate.
import struct
path=OUTPUT/'forest-kit.glb'
data=path.read_bytes()
json_length=struct.unpack_from('<I',data,12)[0]
doc=json.loads(data[20:20+json_length])
for mat in doc.get('materials',[]):
    if mat.get('name')=='PineNeedles':
        mat['alphaMode']='MASK';mat['alphaCutoff']=.42;mat['doubleSided']=True
newjson=json.dumps(doc,separators=(',',':')).encode()
newjson+=b' '*((-len(newjson))%4)
tail=data[20+json_length:]
path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(newjson)+len(tail))+struct.pack('<I4s',len(newjson),b'JSON')+newjson+tail)
counts={obj.name:sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in bpy.context.scene.objects if obj.type=='MESH'}
report={'generator':'Blender '+bpy.app.version_string,'triangles':counts,'totalTriangles':sum(counts.values()),'glbBytes':path.stat().st_size,'prototypes':['pine_a','pine_b','rock_a','rock_b','fallen_log'],'units':'metres','upAxis':'Y (glTF)','license':'Original geometry and atlas, CC0 Poly Haven bark/rock images; see ASSETS.md'}
(ROOT/'asset-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('FOREST_ASSET_REPORT '+json.dumps(report))
