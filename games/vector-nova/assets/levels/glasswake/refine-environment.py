"""Non-destructive second edition of the selected Glasswake Blender scene.
Keeps the original .blend, generator, scene reference and prompt unchanged.
Run in background Blender from the game root; no render, bake or external data.
"""
import bpy, math, os, json
ROOT=os.path.dirname(os.path.abspath(__file__))
OUT=os.path.abspath(os.path.join(ROOT,'../../../public/assets/levels/glasswake'))
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'glasswake-environment.blend'))
# Erode the barrel ends and give the existing vault broad broken recesses.
roof=bpy.data.objects['cave_roof']
for v in roof.data.vertices:
    x,z,y=v.co.x,-v.co.y,v.co.z
    z*=.91+.055*math.sin(x*.12)+.075*math.cos(x*.041)
    y+=4*math.sin(x*.062+.8)+3*math.sin(z*.038)
    y-=5*math.exp(-((z-x*.7-12)/18)**2)
    v.co=(x,-z,y)
roof.data.update()
# Broad torn sheets with diagonal fault planes and recessed melt pockets.
# This replaces only the curtain template, not the preserved original scene.
old=bpy.data.objects['ice_curtain'];mats=list(old.data.materials)
bpy.data.objects.remove(old,do_unlink=True)
verts=[];faces=[];mids=[];cols=30;rows=15
for side in range(2):
    for j in range(rows+1):
        t=j/rows
        for i in range(cols+1):
            x=-38+i/cols*76
            top=52+6*math.sin(i*.43)+4*math.sin(i*.91+1)
            bottom=-19-14*max(0,math.sin(i*.47+2))-7*math.sin(i*.73)
            y=top*(1-t)+bottom*t
            fold=3*math.sin(x*.13+t*2.1)+2*math.sin(x*.047-t)
            pocket=5*math.exp(-((x-8)/12)**2-((t-.55)/.24)**2)
            fault=2.7*math.tanh((x-y*.31+5)/4)
            z=(6+fold+fault-pocket)*(-1 if side else 1)
            verts.append((x,-z,y))
size=(rows+1)*(cols+1)
for side in range(2):
    for j in range(rows):
        for i in range(cols):
            a=side*size+j*(cols+1)+i;b=a+1;c=a+cols+2;d=a+cols+1
            faces.append((a,b,c,d) if side else (d,c,b,a))
            mids.append(1 if abs(i-j*.31-16)<1.5 else 0)
for j in [0,rows]:
    for i in range(cols):
        a=j*(cols+1)+i;faces.append((a,a+1,a+size+1,a+size));mids.append(1)
for i in [0,cols]:
    for j in range(rows):
        a=j*(cols+1)+i;faces.append((a,a+cols+1,a+size+cols+1,a+size));mids.append(1)
d=bpy.data.meshes.new('Glasswake broken ice sheet');d.from_pydata(verts,[],faces);d.update()
o=bpy.data.objects.new('ice_curtain',d);bpy.context.collection.objects.link(o)
for m in mats:d.materials.append(m)
for p,i in zip(d.polygons,mids):p.material_index=i;p.use_smooth=False
# Tilt and erode the broad cliff crowns rather than repeat level capped columns.
# A shared metre-scale fold changes full strata coherently, preserving closed solids.
for k in range(3):
    obj=bpy.data.objects['cliff_'+str(k)]
    for v in obj.data.vertices:
        x,z,y=v.co.x,-v.co.y,v.co.z
        crown=max(0,min(1,(y+190)/150))
        fold=18*math.sin(x*.032+k*.9)+12*math.sin(z*.041+k*1.7)
        fault=11*math.tanh((x+z*.47-9-k*8)/8)
        y+=crown*(fold+fault)
        x+=crown*5*math.sin(z*.028+k)
        v.co=(x,-z,y)
    obj.data.update()
# Thick recessed cavern backing: a closed solid with broad erosion pockets.
# The near curtains sit in front; the back wall closes their accidental sky gaps.
blue=bpy.data.materials['Blue compact ice planes']
edge=bpy.data.materials['Fresh fracture blue edges']
core=bpy.data.materials['Cobalt buried blue-black core'].copy()
core.name='Cobalt buried cavern recess'
core.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.055,.115,.19,1)
verts=[];faces=[];mids=[];cols=24;rows=18
for side in range(2):
    for j in range(rows+1):
        y=-100+j/rows*290
        for i in range(cols+1):
            z=-162+i/cols*324
            edgefall=(abs(z)/162)**1.8
            recess=19*math.exp(-((z+25)/70)**2-((y-38)/82)**2)
            crease=5*math.tanh((z-y*.8+10)/12)
            extent=.34+.66*math.sqrt(max(0,1-(z/174)**2))
            x=((-37+recess+crease+4*math.sin(y*.05+z*.018)) if side==0 else 46)*extent
            topfold=12*math.sin(z*.027)+9*math.cos(z*.054)
            yy=-100+(250-108*edgefall)*(j/rows)+topfold*(j/rows)**3
            z*=.77+.23*math.sin(j/rows*math.pi)**.65
            verts.append((x,-z,yy))
size=(rows+1)*(cols+1)
for side in range(2):
    for j in range(rows):
        for i in range(cols):
            a=side*size+j*(cols+1)+i;b=a+1;c=a+cols+2;d=a+cols+1
            faces.append((a,b,c,d) if side else (d,c,b,a))
            mids.append((0 if j/rows<.68 else 1) if side==0 else (1 if j/rows<.8 else 2))
for j in [0,rows]:
    for i in range(cols):
        a=j*(cols+1)+i;faces.append((a,a+1,a+size+1,a+size));mids.append(2)
for i in [0,cols]:
    for j in range(rows):
        a=j*(cols+1)+i;faces.append((a,a+cols+1,a+size+cols+1,a+size));mids.append(1)
d=bpy.data.meshes.new('Glasswake deep eroded chamber mass');d.from_pydata(verts,[],faces);d.update()
o=bpy.data.objects.new('recess_wall',d);bpy.context.collection.objects.link(o)
for mat in [core,blue,edge]:d.materials.append(mat)
for p,i in zip(d.polygons,mids):p.material_index=i;p.use_smooth=False
for item in bpy.context.scene.objects:
    if item.type=='MESH':item['source']='scene-reference.png; refine-environment.py over original .blend'
bpy.context.preferences.filepaths.save_version=0
bpy.context.scene['asset_notes']='Refined vaults, torn sheets, eroded cliff crowns and thick chamber recesses; original scene preserved separately.'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'glasswake-environment-v2.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'glasswake-environment-v2.glb'),export_format='GLB',export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False)
manifest={'generator':'refine-environment.py','base':'glasswake-environment.blend','reference':'scene-reference.png','runtime':'/assets/levels/glasswake/glasswake-environment-v2.glb','meshes':[]}
for item in bpy.context.scene.objects:
    if item.type=='MESH':
        item.data.calc_loop_triangles();manifest['meshes'].append({'name':item.name,'vertices':len(item.data.vertices),'triangles':len(item.data.loop_triangles)})
manifest['triangles']=sum(m['triangles'] for m in manifest['meshes']);manifest['bytes']=os.path.getsize(os.path.join(OUT,'glasswake-environment-v2.glb'))
with open(os.path.join(ROOT,'asset-manifest-v2.json'),'w') as f:json.dump(manifest,f,indent=2)
print('GLASSWAKE_REFINEMENT',manifest['triangles'],manifest['bytes'])
