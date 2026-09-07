"""Render a Kaida source revision, its grip and every attack frame; never save it.

blender --background --python-exit-code 1 --python <this file> -- SOURCE_REV SWORD_REV OUTPUT_DIR
Uses this asset's named rig/socket; these measurements are not visual acceptance.
"""
import bpy,sys,math
from pathlib import Path
from mathutils import Vector,Matrix
p=Path(__file__).resolve().parents[2]
source_rev,sword_rev,output=sys.argv[sys.argv.index('--')+1:]
assert all(x.replace('-','').isalnum() for x in (source_rev,sword_rev))
out=Path(output).resolve()
assert not out.exists(), 'Choose a fresh evidence directory'
out.mkdir(parents=True)
sys.path.insert(0,str(p/'tools'))
from clip_stage import bind_action
bpy.ops.wm.open_mainfile(filepath=str(p/'assets/kaida/sources'/source_rev/'master.blend'))
s=bpy.context.scene
r=bpy.data.objects['KaidaRig']
with bpy.data.libraries.load(str(p/'assets/kaida.energy-sword/sources'/sword_rev/'master.blend'),link=False) as (src,dst):
    dst.objects=src.objects
weapon=bpy.data.objects.new('Sword preview attachment',None)
s.collection.objects.link(weapon)
constraint=weapon.constraints.new('COPY_TRANSFORMS');constraint.target=r;constraint.subtarget='SwordSocket'
for o in dst.objects:
    s.collection.objects.link(o)
    o.parent=weapon
    o.matrix_basis=Matrix.Translation((0,-.135,0))@Matrix.Rotation(-math.pi/2,4,'X')
def aim(o,at):o.rotation_euler=(Vector(at)-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(3.0,5.0,2.3))
cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=2.65;aim(cam,(0,.1,1));s.camera=cam
for pos,power,size in [((2,3,5),450,4),((-3,1,3),300,3),((0,-3,4),500,3)]:
    bpy.ops.object.light_add(type='AREA',location=pos)
    l=bpy.context.object;l.data.energy=power;l.data.shape='DISK';l.data.size=size;aim(l,(0,0,1))
s.world=bpy.data.worlds.new('Review world')
s.world.color=(.2,.2,.2)
s.render.engine='CYCLES';s.cycles.samples=12;s.cycles.use_denoising=True
s.render.resolution_x=600;s.render.resolution_y=700;s.render.resolution_percentage=100
s.view_settings.view_transform='AgX'
s.render.image_settings.file_format='PNG'

import json,math
metrics=[]
bind_action(r,bpy.data.actions['attack'])
cam.data.ortho_scale=2.9
aim(cam,(0,.1,1.2))
for f in range(1,42):
    s.frame_set(f)
    hand=r.pose.bones['mixamorig:RightHand']
    arm=r.pose.bones['mixamorig:RightArm']
    fore=r.pose.bones['mixamorig:RightForeArm']
    wrist=math.degrees((hand.tail-hand.head).angle(fore.tail-fore.head))
    elbow=math.degrees((arm.tail-arm.head).angle(fore.tail-fore.head))
    metrics.append({'frame':f,'wrist_deviation_degrees':wrist,'elbow_flexion_degrees':elbow})
    s.render.filepath=str(out/f'attack-{f:03}.png')
    bpy.ops.render.render(write_still=True)
(out/'motion-check.json').write_text(json.dumps({'source_revision':source_rev,'sword_revision':sword_rev,'max_wrist_deviation_degrees':max(x['wrist_deviation_degrees'] for x in metrics),'frames':metrics},indent=2))

# Close-ups in the hand frame reveal the palm and fingertips consistently.
for f in (1,15,21):
    s.frame_set(f)
    hand=r.pose.bones['mixamorig:RightHand']
    center=hand.matrix.inverted() @ r.pose.bones['SwordSocket'].head
    for side,offset in [('palm',(-.3,.4,1)),('back',(.3,.4,-1)),('fingertips',(-.3,1,1))]:
        cam.location=hand.matrix@(center+Vector(offset))
        cam.data.ortho_scale=.29
        aim(cam,hand.matrix@center)
        s.render.filepath=str(out/f'grip-{f:03}-{side}.png')
        bpy.ops.render.render(write_still=True)
