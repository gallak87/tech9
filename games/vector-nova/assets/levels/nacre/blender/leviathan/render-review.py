import bpy, json, math, os, sys, hashlib, shutil
from mathutils import Vector, Quaternion

ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../../..'))
candidate=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else '9'
FOLDER=ROOT+'/.experiments/gate4-1/leviathan-review/candidate-'+candidate
context_bytes=open(FOLDER+'/context.json','rb').read()
context=json.loads(context_bytes)
context_hash=hashlib.sha256(context_bytes).hexdigest()
asset_hash=hashlib.sha256(open(ROOT+'/'+context['modelAsset'],'rb').read()).hexdigest()
shutil.copy2(ROOT+'/'+context['modelAsset'],FOLDER+'/model-reviewed.glb')
track_data=json.load(open(FOLDER+'/track-geometry.json'))
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=24; scene.cycles.use_denoising=True
scene.render.resolution_x=1600; scene.render.resolution_y=1000; scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'; scene.view_settings.look='AgX - Medium High Contrast'
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
bpy.context.preferences.filepaths.save_version=0
C=Quaternion((1,0,0),math.pi/2)
def cv(p): return Vector((p[0],-p[2],p[1]))
def mesh(name,vertices,faces,mat,collection):
    data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.update()
    o=bpy.data.objects.new(name,data);collection.objects.link(o)
    if mat:data.materials.append(mat)
    for p in data.polygons:p.use_smooth=True
    return o
def mat(name,color,rough=.5,metal=.0,emission=None):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    if emission:
        p.inputs['Emission Color'].default_value=(*emission,1);p.inputs['Emission Strength'].default_value=1
    return m
stage=bpy.data.collections.new('ROUND '+candidate+' / exact production context')
scene.collection.children.link(stage)
labels=bpy.data.collections.new('Review labels');scene.collection.children.link(labels)
asset=bpy.data.collections.get('Nacre Leviathan / editable source')
source=[o for o in asset.objects if o.type=='MESH']
for o in asset.objects:o.hide_render=True
posed=[]
for original in source:
    copy=original.copy();copy.data=original.data.copy();copy.modifiers.clear();copy.parent=None;copy.hide_render=False
    stage.objects.link(copy);copy.name='POSED / '+original.name
    posed.append((copy,[v.co.copy() for v in original.data.vertices]))

track_objects=[];cached={}
for i,d in enumerate(track_data['meshes']):
    key=(tuple(d['color']),tuple(d['emissive']),d['roughness'],d['metalness'],bool(d.get('vertexColors')))
    if key not in cached:
        m=mat('Track / '+str(len(cached)),d['color'],d['roughness'],d['metalness'],d['emissive'])
        if d.get('vertexColors'):
            p=m.node_tree.nodes.get('Principled BSDF')
            c=m.node_tree.nodes.new('ShaderNodeVertexColor');c.layer_name='TrackColors'
            mix=m.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[1].default_value=(*d['color'],1)
            m.node_tree.links.new(c.outputs['Color'],mix.inputs[2]);m.node_tree.links.new(mix.outputs[0],p.inputs['Base Color'])
        cached[key]=m
    p=d['positions'];v=[(p[j],-p[j+2],p[j+1]) for j in range(0,len(p),3)]
    ix=d['triangles'];f=[tuple(ix[j:j+3]) for j in range(0,len(ix),3)]
    o=mesh('ACTUAL ROAD / '+d['name'],v,f,cached[key],stage);track_objects.append(o)
    if d.get('vertexColors'):
        c=d['vertexColors'];a=o.data.color_attributes.new(name='TrackColors',type='FLOAT_COLOR',domain='POINT')
        # Export contains per-vertex linear RGB values.
        a.data.foreach_set('color',[value for j in range(0,len(c),3) for value in (c[j],c[j+1],c[j+2],1)])
    if i%200==0:print('Imported track meshes',i,flush=True)

world=scene.world or bpy.data.worlds.new('Storm study');scene.world=world;world.use_nodes=True
n=world.node_tree.nodes;n.clear();out=n.new('ShaderNodeOutputWorld');background=n.new('ShaderNodeBackground');background.inputs[1].default_value=.55
image=n.new('ShaderNodeTexEnvironment');image.image=bpy.data.images.load(ROOT+'/public/assets/levels/nacre/nacre-storm-sky-v1.png',check_existing=True)
world.node_tree.links.new(image.outputs['Color'],background.inputs[0]);world.node_tree.links.new(background.outputs[0],out.inputs[0])
def area(name,p,energy,size,color,target):
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size;data.color=color
    o=bpy.data.objects.new(name,data);stage.objects.link(o);o.location=p;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
area('Broad overcast cool key',(300,-750,800),6500000,720,(.65,.82,1),(760,-470,110))
area('Pale storm horizon rim',(1150,-50,500),4500000,600,(1,.90,.76),(760,-470,110))
area('Ocean reflected fill',(550,-200,160),700000,420,(.30,.72,.80),(760,-470,110))

# The source-native swell profile is reused for the authoring sea. Shader foam,
# fog and reflection response are an approximation, not a gameplay capture.
profile=json.load(open(ROOT+'/src/levels/nacre/environment/ocean-profile.json'))
wave_vertices=[];wave_faces=[];extent=1800;steps=181
for z in range(steps):
    for x in range(steps):wave_vertices.append((760-extent+x*extent*2/(steps-1),-470-extent+z*extent*2/(steps-1),0))
for z in range(steps-1):
    for x in range(steps-1):
        a=z*steps+x;wave_faces.append((a,a+1,a+1+steps,a+steps))
sea_mat=mat('Source-profile sea / study shader',(.016,.078,.089),.28,.33)
p=sea_mat.node_tree.nodes.get('Principled BSDF');vcol=sea_mat.node_tree.nodes.new('ShaderNodeVertexColor');vcol.layer_name='WaveColor';sea_mat.node_tree.links.new(vcol.outputs['Color'],p.inputs['Base Color'])
ocean=mesh('Source-profile storm ocean',wave_vertices,wave_faces,sea_mat,stage)
colors=ocean.data.color_attributes.new(name='WaveColor',type='FLOAT_COLOR',domain='POINT')

foam_mat=mat('Contact foam study',(.61,.83,.81),.53,.05)
foam=[]
for contact in context['path']['contacts']:
    pos=cv(contact['position'])
    for radius in [17,25,34]:
        verts=[];faces=[]
        for i in range(80):
            a=i*math.tau/80;r=radius*(1+.06*math.sin(i*.72))
            verts.extend([pos+Vector((math.cos(a)*(r-1.2),math.sin(a)*(r-1.2),.08)),pos+Vector((math.cos(a)*(r+1.2),math.sin(a)*(r+1.2),.08))])
        for i in range(80):faces.append((i*2,(i*2+2)%160,(i*2+3)%160,i*2+1))
        foam.append((mesh('Contact foam / study proxy',verts,faces,foam_mat,stage),contact))


# Point centres, physical radii, alpha and type are exported from the actual
# deterministic runtime effect. Only the Blender sprite shader is approximated.
water_particle_material=bpy.data.materials.new('SOURCE WATER PARTICLES / radial sprite approximation')
water_particle_material.use_nodes=True
nodes=water_particle_material.node_tree.nodes;nodes.clear();links=water_particle_material.node_tree.links
out=nodes.new('ShaderNodeOutputMaterial');transparent=nodes.new('ShaderNodeBsdfTransparent')
emission=nodes.new('ShaderNodeEmission');emission.inputs['Color'].default_value=(.81,.95,.96,1);emission.inputs['Strength'].default_value=1
mix=nodes.new('ShaderNodeMixShader');links.new(transparent.outputs[0],mix.inputs[1]);links.new(emission.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],out.inputs['Surface'])
uv=nodes.new('ShaderNodeTexCoord');sub=nodes.new('ShaderNodeVectorMath');sub.operation='SUBTRACT';sub.inputs[1].default_value=(.5,.5,0);links.new(uv.outputs['UV'],sub.inputs[0])
length=nodes.new('ShaderNodeVectorMath');length.operation='LENGTH';links.new(sub.outputs['Vector'],length.inputs[0])
radial=nodes.new('ShaderNodeMapRange');radial.interpolation_type='SMOOTHSTEP';radial.clamp=True;radial.inputs['From Min'].default_value=.15;radial.inputs['From Max'].default_value=.5;radial.inputs['To Min'].default_value=1;radial.inputs['To Max'].default_value=0;links.new(length.outputs['Value'],radial.inputs['Value'])
alpha=nodes.new('ShaderNodeVertexColor');alpha.layer_name='SourceAlpha'
multiply=nodes.new('ShaderNodeMath');multiply.operation='MULTIPLY';links.new(alpha.outputs['Alpha'],multiply.inputs[0]);links.new(radial.outputs['Result'],multiply.inputs[1]);links.new(multiply.outputs[0],mix.inputs[0])
particles_object=None
def water_particle_pose(particles):
    global particles_object
    if particles_object:
        old=particles_object.data;bpy.data.objects.remove(particles_object,do_unlink=True);bpy.data.meshes.remove(old)
    verts=[];faces=[];alphas=[]
    for particle in particles:
        if particle['alpha']<=.005:continue
        center=cv(particle['position']);radius=particle['radius'];normal=(camera.location-center).normalized()
        right=Vector((0,0,1)).cross(normal).normalized();vertical=normal.cross(right).normalized()
        width=radius*(.32 if particle['kind']=='shedding' else 1.0)
        i=len(verts)
        verts.extend([center-right*width-vertical*radius,center+right*width-vertical*radius,center+right*width+vertical*radius,center-right*width+vertical*radius]);faces.append((i,i+1,i+2,i+3));alphas.extend([particle['alpha']*.8]*4)
    particles_object=mesh('EXACT SOURCE water particle centres / alpha sprites',verts,faces,water_particle_material,stage)
    particles_object.visible_shadow=False
    colors=particles_object.data.color_attributes.new(name='SourceAlpha',type='FLOAT_COLOR',domain='POINT')
    colors.data.foreach_set('color',[v for a in alphas for v in (1,1,1,a)])
    layer=particles_object.data.uv_layers.new(name='SpriteUV');corners=[(0,0),(1,0),(1,1),(0,1)]
    for loop in particles_object.data.loops:layer.data[loop.index].uv=corners[loop.vertex_index%4]


proxy_mat=mat('7m neutral ship scale proxy',(.63,.66,.65),.38,.3)
proxy_template=[(-2.1,0,-3.4),(2.1,0,-3.4),(-1.7,0,1.1),(1.7,0,1.1),(0,0,3.6),(-1.2,1.1,-1),(1.2,1.1,-1),(0,1.2,1.5)]
proxy_faces=[(0,1,3,4,2),(0,5,6,1),(0,2,7,5),(1,6,7,3),(2,4,7),(3,7,4),(5,7,6)]
proxy=mesh('7 METRE SCALE PROXY / not the user ship',proxy_template,proxy_faces,proxy_mat,stage)

camdata=bpy.data.cameras.new('Exact source chase camera');camera=bpy.data.objects.new('Exact source chase camera',camdata);stage.objects.link(camera);scene.camera=camera;camdata.clip_start=.05;camdata.clip_end=14000;camdata.sensor_fit='HORIZONTAL'
labelmat=mat('Review label',(.8,.9,.93),1,0,(.8,.9,.93));backmat=mat('Review label background',(.006,.012,.016),1,0,(.006,.012,.016))
labelobjs=[]
def setlabel(title,subtitle,fovy):
    for o in labelobjs:bpy.data.objects.remove(o,do_unlink=True)
    labelobjs.clear();distance=1.1;half_y=math.tan(fovy/2)*distance;half_x=half_y*1.6
    for text,size,y in [(title,.018,-half_y+.072),(subtitle,.012,-half_y+.043)]:
        data=bpy.data.curves.new('AUTHORING STUDY LABEL','FONT');data.body=text;data.size=size;data.align_x='LEFT';data.space_character=1.02
        o=bpy.data.objects.new('AUTHORING STUDY LABEL',data);labels.objects.link(o);o.parent=camera;o.location=(-half_x+.02,y,-distance);data.materials.append(labelmat);labelobjs.append(o)
    b=mesh('Label strip',[(-half_x,-half_y,0),(half_x,-half_y,0),(half_x,-half_y+.10,0),(-half_x,-half_y+.10,0)],[(0,1,2,3)],backmat,labels)
    b.parent=camera;b.location=(0,0,-distance-.003);labelobjs.append(b)

def ocean_pose(time):
    col=[]
    for i,rest in enumerate(wave_vertices):
        x,z=rest[0],-rest[1];h=0;crest=0
        for w in profile['waves']:
            ux,uz=w['direction'];length=math.hypot(ux,uz);ux/=length;uz/=length
            phase=math.tau/w['wavelength']*(ux*x+uz*z-w['speed']*time)+w['phase'];s=math.sin(phase)
            h+=w['amplitude']*(s-w['sharpness']*math.cos(2*phase));crest+=max(0,s)**8*w['amplitude']/18.3
        shelter=1
        for c in context['path']['contacts']:
            d=math.hypot(x-c['position'][0],z-c['position'][2]);q=max(0,min(1,(d-80)/50));shelter*=q*q*(3-2*q)
        ocean.data.vertices[i].co.z=h*shelter
        whiten=max(0,min(1,(crest-.32)/.68))*.48*shelter
        col.extend((.014+whiten*.53,.070+whiten*.56,.085+whiten*.55,1))
    colors.data.foreach_set('color',col);ocean.data.update()

def pose(frame):
    for o,rest in posed:
        o.hide_render=False
        for v,r in zip(o.data.vertices,rest):
            x=max(0,min(len(frame['stations'])-1.001,r.x));i=int(x);t=x-i
            a,b=frame['stations'][i:i+2]
            p=Vector(a['position']).lerp(Vector(b['position']),t)
            u=Vector(a['up']).lerp(Vector(b['up']),t)
            s=Vector(a['side']).lerp(Vector(b['side']),t)
            v.co=cv(p+u*r.z-s*r.y)
        o.data.update()
    cam=frame['camera'];camera.location=cv(cam['position']);q=cam['quaternion'];camera.rotation_mode='QUATERNION';camera.rotation_quaternion=C@Quaternion((q[3],q[0],q[1],q[2]))
    camdata.type='PERSP';fov=math.radians(cam['verticalFov']);camdata.lens=camdata.sensor_width/(2*math.tan(fov/2)*cam['aspect'])
    q=frame['shipQuaternion'];q=Quaternion((q[3],q[0],q[1],q[2]));pos=Vector(frame['shipPosition'])
    for v,p in zip(proxy.data.vertices,proxy_template):v.co=cv(pos+q@Vector(p))
    proxy.data.update()
    for o,c in foam:o.hide_render=not (c['age']<frame['age']<c['age']+4.7)
    ocean_pose(frame['distance']/frame['speed'])
    water_particle_pose(frame.get('waterParticles',[]))
    setlabel('ROUND '+candidate+' | '+str(frame['speed'])+' m/s | '+frame['name'].upper()+' | '+frame.get('cameraKind','EXACT SOURCE CAMERA'), 'BLENDER STUDY - NOT GAMEPLAY | SOURCE ROAD + PATH + WATER PARTICLES | 7m SHIP PROXY',fov)
    scene.render.filepath=FOLDER+'/'+str(frame['speed']).replace('.','_')+'-'+frame['name']+'.png'
    bpy.ops.render.render(write_still=True)
    print('REVIEW_STILL '+scene.render.filepath,flush=True)

seq={s['speed']:s for s in context['sequences']}
for speed,name in [(112,'approach-wide'),(157,'approach-wide'),(112,'approach-near'),(112,'dive-contact'),(112,'takeoff'),(112,'early-airborne')]:
    frame=next((f for f in seq[speed]['frames'] if f['name']==name),None)
    if frame:pose(frame)


if context.get('waterContactStudy'):
    study=context['waterContactStudy']
    base=next(f for f in seq[112]['frames'] if f['name']=='approach-near')
    contact_frame=dict(base)
    eye=Vector((240,195,120));target=Vector((context['path']['center'][0],80,330))
    q=C.inverted()@((cv(target)-cv(eye)).to_track_quat('-Z','Y'))
    contact_frame.update({'name':'dive-contact','age':study['age'],'stations':study['stations'],'waterParticles':study.get('waterParticles',[]),'cameraKind':'DIAGNOSTIC AUTHORING CAMERA','camera':{'position':list(eye),'quaternion':[q.x,q.y,q.z,q.w],'verticalFov':56,'aspect':1.6}})
    pose(contact_frame)

# Exact neutral mesh, separate from gameplay framing, makes art changes legible.
for link in list(world.node_tree.links):
    if link.to_node==background and link.to_socket==background.inputs[0]:world.node_tree.links.remove(link)
background.inputs[0].default_value=(.065,.095,.12,1);background.inputs[1].default_value=.7
area('Neutral softbox',(20,-170,240),480000,250,(.75,.87,1),(120,0,0))
area('Neutral rim',(160,130,170),320000,180,(1,.85,.65),(120,0,0))
for o in track_objects:o.hide_render=True
ocean.hide_render=True;proxy.hide_render=True
if particles_object:particles_object.hide_render=True
for o,c in foam:o.hide_render=True
for o,r in posed:o.hide_render=True
for o in source:o.hide_render=False
camera.location=(-155,-360,205);target=Vector((130,0,0));camera.rotation_quaternion=(target-camera.location).to_track_quat('-Z','Y');camdata.type='ORTHO';camdata.ortho_scale=320
for o in labelobjs:bpy.data.objects.remove(o,do_unlink=True)
labelobjs.clear()
# Orthographic labels use model-scale positions at the same near camera plane.
data=bpy.data.curves.new('Neutral label','FONT');data.body='ROUND '+candidate+' / EXACT V2 MESH / 280m / BLENDER AUTHORING STUDY - NOT GAMEPLAY';data.size=3.5
o=bpy.data.objects.new('Neutral label',data);labels.objects.link(o);o.parent=camera;o.location=(-155,-92,-5);data.materials.append(labelmat)
scene.render.filepath=FOLDER+'/neutral-three-quarter.png';bpy.ops.render.render(write_still=True)
manifest={'kind':'Blender authoring stills; not gameplay screenshots','candidate':candidate,'asset':context['modelAsset'],'assetSha256':asset_hash,'contextSha256':context_hash,'trackSha256':hashlib.sha256(open(FOLDER+'/track-geometry.json','rb').read()).hexdigest(),'camera':'Driving frames use exact exported source camera; contact is diagnostic; neutral is orthographic' ,'ocean':'Source wave profile; authoring approximation of shading and foam rings','waterParticles':'Exact exported live positions/radii/alpha; radial sprite shading approximated in Blender','stills':[f for f in os.listdir(FOLDER) if f.endswith('.png')]}
json.dump(manifest,open(FOLDER+'/render-manifest.json','w'),indent=2)
print(json.dumps(manifest),flush=True)
