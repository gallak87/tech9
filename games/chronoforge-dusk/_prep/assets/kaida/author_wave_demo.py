"""Author a small FK wave over retained idle, in a separate review master.

Run through Blender MCP with the textured idle/run master already open.
This is an animation experiment, not a runtime-export recipe.
"""
import bpy
import json
import math
from pathlib import Path
import sys
from mathutils import Matrix, Quaternion, Vector

PREP = Path('/Users/g/code/scratch/tech9/games/chronoforge-dusk/_prep')
sys.path.insert(0, str(PREP/'tools'))
from blender_stage import curves
from clip_stage import action_digest, bind_action

OUT = PREP/'assets/kaida/demos/wave-r1'
OUT.mkdir(parents=True, exist_ok=True)
target = OUT/'kaida-wave-demo.blend'
if target.exists():
    raise RuntimeError('Review file already exists; create a new revision')
scene = bpy.context.scene
rig = bpy.data.objects['Armature']
source = bpy.data.actions['idle.source']
originals = {a.name: action_digest(a) for a in bpy.data.actions}
bind_action(rig, source)
scene.frame_set(1)
bpy.context.view_layer.update()
arm_names = ['mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:RightHand']
baseline = {name: rig.pose.bones[name].rotation_quaternion.copy() for name in arm_names}

# Turn each bone's current longitudinal axis toward a world-space direction.
# The shortest rotation preserves the source's roll as much as possible.
def aim(name, direction):
    bone = rig.pose.bones[name]
    matrix = rig.matrix_world @ bone.matrix
    rotation = matrix.to_quaternion()
    current_direction = (rig.matrix_world.to_3x3() @ (bone.tail-bone.head)).normalized()
    rotation = current_direction.rotation_difference(Vector(direction).normalized()) @ rotation
    bone.matrix = rig.matrix_world.inverted() @ Matrix.LocRotScale(matrix.translation, rotation, matrix.to_scale())
    bpy.context.view_layer.update()

aim(arm_names[0], (-.92, -.32, -.23))
aim(arm_names[1], (-.18, -.18, .97))
aim(arm_names[2], (-.06, -.06, 1))
raised = {name: rig.pose.bones[name].rotation_quaternion.copy() for name in arm_names}

action = source.copy()
action.name = 'wave.demo'
action.use_fake_user = True
# Keep all source idle motion except the three bones authored for this wave.
for layer in action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for curve in list(bag.fcurves):
                if any(curve.data_path == f'pose.bones["{name}"].rotation_quaternion' for name in arm_names):
                    bag.fcurves.remove(curve)
bind_action(rig, action)

# Rise, two small wrist sweeps, lower. The neutral idle continues underneath.
poses = [(1,0,0), (8,0,0), (22,.85,0), (30,1,-12), (39,1,13),
         (48,1,-12), (57,1,13), (64,1,0), (78,0,0), (90,0,0)]
for frame, lift, sway in poses:
    scene.frame_set(frame)
    for name in arm_names:
        bone = rig.pose.bones[name]
        neutral = baseline[name]
        pose = raised[name].copy()
        if neutral.dot(pose) < 0:
            pose.negate()
        bone.rotation_quaternion = neutral.slerp(pose,lift)
        if name == arm_names[-1]:
            bone.rotation_quaternion = bone.rotation_quaternion @ Quaternion((0,0,1),math.radians(sway))
        bone.keyframe_insert('rotation_quaternion', frame=frame, group='Wave / right arm')
for curve in curves(action):
    if any(curve.data_path == f'pose.bones["{name}"].rotation_quaternion' for name in arm_names):
        for key in curve.keyframe_points:
            key.interpolation = 'BEZIER'
            key.handle_left_type = key.handle_right_type = 'AUTO_CLAMPED'

assert all(action_digest(bpy.data.actions[name]) == digest for name,digest in originals.items())
for item in bpy.data.actions:
    item.use_fake_user = True
scene.render.fps = 30
scene.frame_start,scene.frame_end = 1,90
scene.frame_set(1)
for name,frame in [('Start / wave',1),('Raise hand',22),('Wave',39),('Lower hand',64)]:
    scene.timeline_markers.new(name,frame=frame)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
bpy.context.view_layer.objects.active = rig

readme = bpy.data.texts.new('START HERE - Kaida wave demo')
readme.write('''Kaida wave demo - first animation experiment

Move the pointer over the large character view. Space plays/pauses.
Shift+Left Arrow returns to the start.

Below the character is the Action Editor. Its action field shows wave.demo.
Click the action chooser beside the name to choose idle.source or run.source.
In the bottom Timeline, use these End values:
  wave.demo: 90
  idle.source: 60
  run.source: 23
Start is 1, playback is 30 FPS for all three.

The original run moves forward through the scene. That travel is retained.
This file is separate from the original master and is not a game candidate.
''')

# Keep the familiar Timeline and add an Action Editor immediately above it.
window = next(w for w in bpy.context.window_manager.windows if any(a.type == 'VIEW_3D' for a in w.screen.areas))
screen = window.screen
viewport = max((a for a in screen.areas if a.type == 'VIEW_3D'),key=lambda a:a.width*a.height)
with bpy.context.temp_override(window=window, area=viewport):
    bpy.ops.screen.area_split(direction='HORIZONTAL', factor=.25)
views = sorted((a for a in screen.areas if a.type == 'VIEW_3D'),key=lambda a:a.y)
editor = views[0]
editor.type = 'DOPESHEET_EDITOR'
editor.ui_type = 'DOPESHEET'
editor.spaces.active.mode = 'ACTION'
editor.spaces.active.dopesheet.show_only_selected = True
for area in screen.areas:
    if area.type == 'VIEW_3D':
        space = area.spaces.active
        space.overlay.show_overlays = False
        space.shading.type = 'MATERIAL'
        space.region_3d.view_location = (0,0,1)
        space.region_3d.view_distance = 3.6
        space.region_3d.view_rotation = Vector((0,1,0)).to_track_quat('-Z','Y')
        space.region_3d.view_perspective = 'ORTHO'
bpy.ops.wm.save_as_mainfile(filepath=str(target))
(OUT/'review.json').write_text(json.dumps({
    'status':'First authored animation demo; owner review pending',
    'base_master':'../../sources/mixamo-clips-r1/master.blend',
    'action':'wave.demo','frames':[1,90],'fps':30,
    'method':'Copied idle motion with authored FK rotations on right upper arm, forearm and hand',
    'original_actions_sha256':originals,
    'original_actions_preserved':True,
    'runtime_candidate':False,
},indent=2)+'\n')
result = {'demo':str(target),'action':action.name,'frames':[1,90], 'original_actions_preserved':True}
