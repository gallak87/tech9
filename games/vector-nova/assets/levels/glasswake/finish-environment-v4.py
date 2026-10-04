"""CPU-authored glacial fault families over preserved v3, saved separately.
Selected original scene reference remains the composition/art direction source.
"""
import bpy, math, random, os, json
ROOT=os.path.dirname(os.path.abspath(__file__))
OUT=os.path.abspath(os.path.join(ROOT,'../../../.experiments/glasswake-authoring'))
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'glasswake-environment-v3.blend'))
M=[bpy.data.materials[n] for n in ['Cobalt buried blue-black core','Blue compact ice planes','Pale fractured wind-polished ice','Opaque frost crust','Fresh fracture blue edges']]
def mass(name,w,d,h,seed,center):
    bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
    rng=random.Random(seed);phase=rng.random()*math.tau;n=64;rows=25;verts=[];faces=[];mids=[]
    def crown(x,z):
        return 12*math.sin(x*.038+phase)+9*math.cos(z*.046-phase)+8*math.tanh((x+z*.52-9)/5)-6*math.tanh((z-x*.3+16)/4)
    for j in range(rows):
        t=j/(rows-1)
        for i in range(n):
            a=i*math.tau/n;c=math.cos(a);s=math.sin(a)
            ridge=.15*math.sin(a*3+phase)+.10*math.sin(a*5-phase)+.045*math.sin(a*11+phase*.3)
            fault=.065*math.tanh(math.sin(a*4+phase)*6+t*4-2)
            undercut=.20*math.exp(-((t-.62)/.14)**2)*max(0,math.sin(a*2+phase))**4
            radius=.91+ridge+fault-undercut+.035*math.sin(t*22+a*3)
            x=math.copysign(abs(c)**.86,c)*w*.5*radius
            z=math.copysign(abs(s)**.86,s)*d*.5*radius
            y=(-.5+t)*h+crown(x,z)*(.25+.75*t)+3.8*math.sin(a*9+t*6)
            verts.append((center[0]+x,center[1]+y,center[2]+z))
    faces.append(tuple(reversed(range(n))));mids.append(0)
    for j in range(rows-1):
        for i in range(n):
            a=j*n+i;b=j*n+(i+1)%n;c=(j+1)*n+(i+1)%n;e=(j+1)*n+i
            faces.append((a,b,c,e))
            mids.append(0 if j<4 else 4 if (i+seed)%19<2 else 2 if math.sin(i*.14+j*.17+phase)>.35 else 1)
    outer=(rows-1)*n
    for scale in [.79,.49,.18]:
        start=len(verts)
        for i in range(n):
            x,_,z=verts[outer+i];x=(x-center[0])*scale;z=(z-center[2])*scale
            verts.append((x+center[0],center[1]+h*.5+crown(x,z)+3*math.sin(x*.17+z*.12),z+center[2]))
        for i in range(n):faces.append((outer+i,outer+(i+1)%n,start+(i+1)%n,start+i));mids.append(3)
        outer=start
    faces.append(tuple(outer+i for i in range(n)));mids.append(3)
    mesh=bpy.data.meshes.new(name);mesh.from_pydata([(x,-z,y) for x,y,z in verts],[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    for mat in M:mesh.materials.append(mat)
    for p,mi in zip(mesh.polygons,mids):p.material_index=mi;p.use_smooth=True
    if hasattr(mesh,'set_sharp_from_angle'):mesh.set_sharp_from_angle(angle=.52)
    return obj
for i,(w,d,h) in enumerate([(98,106,174),(132,92,145),(98,130,202)]):mass('cliff_'+str(i),w,d,h,811+i,(0,-h*.5,0))
mass('cave_pier',64,98,130,928,(0,5,0))
# Coherent vertical faults and deep angular erosional hollows in the tall fissure.
o=bpy.data.objects['crevice_wall']
for v in o.data.vertices:
    x,z,y=v.co.x,-v.co.y,v.co.z
    if x<22:
        x+=6*math.tanh((z-y*.24-8)/3)+5*math.sin(z*.11+y*.065)
        x+=12*math.exp(-((z-34)/18)**2-((y-98)/50)**2)
        x-=9*math.exp(-((z+49)/22)**2-((y-157)/72)**2)
    v.co=(x,-z,y)
o.data.update()
for p in o.data.polygons:p.use_smooth=True
# Attached tapered icicles break the calving cavity's uniform horizontal shelves.
parts=[bpy.data.objects['calving_roof']]
for i in range(13):
    z=-190+i*31;length=18+(i*17)%29
    bpy.ops.mesh.primitive_cone_add(vertices=7,radius1=.45,radius2=3.4+(i%3),depth=length,location=(14+(i%4)*8,-z,153-length*.5))
    ice=bpy.context.object;ice.data.materials.append(M[1 if i%3 else 4]);parts.append(ice)
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();parts[0].name='calving_roof'
for o in bpy.context.scene.objects:
    if o.type=='MESH':o['source']='scene-reference.png; finish-environment-v4.py over preserved v3'
bpy.context.preferences.filepaths.save_version=0
bpy.context.scene['asset_notes']='Asymmetric fault massifs, deep fissure cuts and attached cavity ice; earlier scenes preserved.'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'glasswake-environment-v4.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'glasswake-environment-v4.glb'),export_format='GLB',export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False)
manifest={'generator':'finish-environment-v4.py','base':'glasswake-environment-v3.blend','reference':'scene-reference.png','authoringExport':'.experiments/glasswake-authoring/glasswake-environment-v4.glb','meshes':[]}
for o in bpy.context.scene.objects:
    if o.type=='MESH':
        o.data.calc_loop_triangles();manifest['meshes'].append({'name':o.name,'vertices':len(o.data.vertices),'triangles':len(o.data.loop_triangles)})
manifest['triangles']=sum(m['triangles'] for m in manifest['meshes']);manifest['bytes']=os.path.getsize(os.path.join(OUT,'glasswake-environment-v4.glb'))
with open(os.path.join(ROOT,'asset-manifest-v4.json'),'w') as f:json.dump(manifest,f,indent=2)
print('GLASSWAKE_V4',manifest['triangles'],manifest['bytes'])
