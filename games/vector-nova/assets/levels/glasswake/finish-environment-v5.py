"""Final desktop ice-form pass. Preserves all earlier editable scenes.
Opens v4; carves coherent 4–15m vertical faults and chipped horizontal seams.
CPU geometry/export only; selected scene-reference.png remains art direction.
"""
import bpy, math, os, json
from mathutils import Vector
ROOT=os.path.dirname(os.path.abspath(__file__))
OUT=os.path.abspath(os.path.join(ROOT,'../../../public/assets/levels/glasswake'))
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'glasswake-environment-v4.blend'))
# Add actual cut depth to broad faces, following a common fault field rather than
# independent jitter. Keep the gross envelope and attached support contacts.
names=['cliff_0','cliff_1','cliff_2','cave_pier','recess_wall','crevice_wall','ice_curtain','cave_roof','bell_vault','calving_back']
for seed,name in enumerate(names):
    obj=bpy.data.objects[name];mesh=obj.data
    mesh.update()
    normals=[v.normal.copy() for v in mesh.vertices]
    for v,n in zip(mesh.vertices,normals):
        x,z,y=v.co.x,-v.co.y,v.co.z
        # Curved vertical runnels separate large coherent ice fins. Fine chips
        # sit on the edges of broader cuts rather than make an evenly noisy lump.
        phase=seed*.91
        a=(x+z*.73)*.31+math.sin(y*.048+phase)*.48
        fissure=math.exp(-(math.sin(a)*5.5)**2)
        shoulder=math.exp(-((abs(math.sin(a))-.31)*8)**2)
        band=y*.43+math.sin(z*.076+x*.044+phase)*.7
        seam=math.exp(-(math.sin(band)*6.5)**2)
        chip=math.sin(x*.64-z*.37+y*.19)*math.sin(z*.51+y*.33)
        depth=-3.4*fissure-1.2*seam+.55*shoulder+.36*chip*shoulder
        # Fine cuts on overhead/cavity surfaces; preserve the hole and silhouette.
        if name in ['cave_roof','bell_vault','calving_back']:depth*=.6
        v.co+=n*depth
    mesh.update()
    # Preserve authored material strata; the cuts carry their own light/normal
    # response instead of painting whole sparse quads as checker-like patches.
    for p in mesh.polygons:
        p.use_smooth=name not in ['ice_curtain','crevice_wall','recess_wall']
    if hasattr(mesh,'set_sharp_from_angle'):mesh.set_sharp_from_angle(angle=.44)
# Meteor: subdivide the old obvious ico facets then cut asymmetric scar basins.
obj=bpy.data.objects['dark_inclusion'];bpy.context.view_layer.objects.active=obj
mod=obj.modifiers.new('Embedded inclusion erosion','SUBSURF');mod.levels=1
bpy.ops.object.modifier_apply(modifier=mod.name)
for v in obj.data.vertices:
    x,z,y=v.co.x,-v.co.y,v.co.z
    if x*x+z*z<37*37 and y<76:
        scar=math.exp(-((z-y*.31-5)/5)**2)*math.exp(-((y-24)/46)**2)
        v.co.x*=1-.11*scar
        v.co.z+=.65*math.sin(x*.42+z*.18)*math.sin(y*.3)
for p in obj.data.polygons:p.use_smooth=True
obj.data.update()
# Distinct blue fresh-break planes contrast the pale fixed roof during calving.
for i in range(9):
    o=bpy.data.objects['calving_chunk_%02d'%i]
    old=bpy.data.materials['Blue compact ice planes']
    m=old.copy();m.name='Calving exposed compact ice %02d'%i
    m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.16+(i%3)*.035,.34+(i%3)*.045,.46+(i%3)*.035,1)
    o.data.materials.append(m)
    for p in o.data.polygons:
        if p.normal.x<-.25:p.material_index=len(o.data.materials)-1
# Keep the buried Gallery backing dark blue with readable relief.
m=bpy.data.materials['Cobalt buried cavern recess']
m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.075,.16,.245,1)
m=bpy.data.materials['Blue compact ice planes']
m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.30,.53,.66,1)
for o in bpy.context.scene.objects:
    if o.type=='MESH':o['source']='scene-reference.png; finish-environment-v5.py over retained v4'
bpy.context.preferences.filepaths.save_version=0
bpy.context.scene['asset_notes']='Coherent carved ice runnels and chipped seams; eroded inclusion. Earlier scenes retained.'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'glasswake-environment-v5.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'glasswake-environment-v5.glb'),export_format='GLB',export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False)
manifest={'generator':'finish-environment-v5.py','base':'glasswake-environment-v4.blend','reference':'scene-reference.png','runtime':'/assets/levels/glasswake/glasswake-environment-v5.glb','meshes':[]}
m=bpy.data.materials['Blue compact ice planes']
m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.30,.53,.66,1)
for o in bpy.context.scene.objects:
    if o.type=='MESH':
        o.data.calc_loop_triangles();manifest['meshes'].append({'name':o.name,'vertices':len(o.data.vertices),'triangles':len(o.data.loop_triangles)})
manifest['triangles']=sum(m['triangles'] for m in manifest['meshes']);manifest['bytes']=os.path.getsize(os.path.join(OUT,'glasswake-environment-v5.glb'))
with open(os.path.join(ROOT,'asset-manifest-v5.json'),'w') as f:json.dump(manifest,f,indent=2)
print('GLASSWAKE_V5',manifest['triangles'],manifest['bytes'])
