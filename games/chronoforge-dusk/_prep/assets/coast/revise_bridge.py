"""r2: give the salvage deck its own bolted rail and a grounded readable profile.
Uses the original r1 Blender source; records a new source/package identity.
"""
import bpy,json,hashlib,math
from pathlib import Path
from mathutils import Vector
PREP=Path(__file__).resolve().parents[2]
source=PREP/'assets/coast.bridge/sources/r1/master.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
rust=bpy.data.materials.get('Oxidised iron')

def beam(a,b,r):
    bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=r,depth=(Vector(b)-Vector(a)).length,location=(Vector(a)+Vector(b))*.5)
    o=bpy.context.object; o.name='Bolted salvage railing'
    o.rotation_mode='QUATERNION'; o.rotation_quaternion=(Vector(b)-Vector(a)).to_track_quat('Z','Y');o.data.materials.append(rust)
    # Reuse the authored material and explicit cylinder UVs.
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
for x in [-1.83,1.83]:
    for y in [-1.4,1.4]:
        beam((x,y,.1),(x,y,1.35),.047)
        beam((x-.14,y,.32),(x+.14,y,.32),.032)
    for z in [.73,1.35]:beam((x,-1.5,z),(x,1.5,z),.035)
bpy.ops.object.select_all(action='SELECT');bpy.context.view_layer.objects.active=bpy.context.selected_objects[0];bpy.ops.object.join()
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
obj=bpy.context.object;obj.name='Coast_bridge';height=max(v.co.z for v in obj.data.vertices)
folder=PREP/'assets/coast.bridge/sources/r2';assert not folder.exists();folder.mkdir(parents=True)
bpy.ops.wm.save_as_mainfile(filepath=str(folder/'master.blend'))
meta=json.loads((PREP/'assets/coast.bridge/asset.json').read_text())
meta['revision']='r2';meta['label']='Coastal repair deck / bolted railing r2';meta['dimensions']['height_m']=height
meta['source_files']=[{'path':str(p.relative_to(PREP)),'role':role,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p,role in [(folder/'master.blend','editable_master'),(Path(__file__),'authoring_script'),(source,'previous_source')]]
(PREP/'assets/coast.bridge/asset.json').write_text(json.dumps(meta,indent=2)+'\n')
