"""Repair the run carry in the already in-place r4 source; preserve other motion.

blender --background --python-exit-code 1 --python <this file> -- run-carry-r1
"""
import hashlib
import json
import math
from pathlib import Path
import sys
import bpy
from mathutils import Matrix, Vector

PREP = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PREP / 'tools'))
from clip_stage import action_digest
from blender_stage import curves
sys.path.insert(0, str(Path(__file__).resolve().parent))
from grip_pose import BLADE_AXIS, apply_grip

revision = sys.argv[sys.argv.index('--') + 1]
assert revision.replace('-', '').isalnum()
out = PREP / 'assets/kaida/sources' / revision
assert not out.exists(), 'Preserve existing source revisions'
out.mkdir(parents=True)
source = PREP / 'assets/kaida/sources/foundation-r3/master.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
rig = bpy.data.objects['KaidaRig']
scene = bpy.context.scene
before = {a.name: action_digest(a) for a in bpy.data.actions}
action = bpy.data.actions['run']
rig.animation_data.action = action
rig.animation_data.action_slot = action.slots[0]
changed = [b for b in rig.pose.bones if b.name in ['mixamorig:RightArm', 'mixamorig:RightForeArm'] or b.name.startswith('mixamorig:RightHand')]
unchanged = [b for b in rig.pose.bones if b not in changed and b.name != "SwordSocket"]
old_poses = {}
for frame in range(1, 24):
    scene.frame_set(frame)
    old_poses[frame] = {b.name: b.matrix.copy() for b in unchanged}

# Same arm/grip construction as author_foundation, evaluated AFTER removing travel.
def pb(short):
    return rig.pose.bones['mixamorig:' + short]

def aim(short, direction):
    b = pb(short)
    q = (b.tail-b.head).normalized().rotation_difference(Vector(direction).normalized()) @ b.matrix.to_quaternion()
    b.matrix = Matrix.LocRotScale(b.head, q, Vector((1, 1, 1)))
    bpy.context.view_layer.update()

def carry():
    a, b = pb('RightArm'), pb('RightForeArm')
    origin = a.head.copy()
    delta = Vector((.34, .16, 1.14)) - origin
    distance = min(delta.length, a.length + b.length - .001)
    axis = delta.normalized()
    pole = Vector((.25, -.15, -1))
    bend = (pole - axis*pole.dot(axis)).normalized()
    along = (a.length*a.length-b.length*b.length+distance*distance)/(2*distance)
    elbow = origin + axis*along + bend*math.sqrt(max(0, a.length*a.length-along*along))
    aim('RightArm', elbow-origin)
    aim('RightForeArm', origin+axis*distance-b.head)
    hand = pb('RightHand')
    blade = Vector((.32, .75, .48)).normalized()
    forearm = (pb('RightForeArm').tail-pb('RightForeArm').head).normalized()
    rest_angle = math.asin(BLADE_AXIS.y)
    limit = math.radians(30)
    along = max(math.sin(rest_angle-limit), min(math.sin(rest_angle+limit), blade.dot(forearm)))
    perpendicular = (blade-forearm*blade.dot(forearm)).normalized()
    blade = perpendicular*math.sqrt(1-along*along)+forearm*along
    forward = (forearm-blade*forearm.dot(blade)).normalized()
    local_forward = (Vector((0,1,0))-BLADE_AXIS*BLADE_AXIS.y).normalized()
    local_basis = Matrix((BLADE_AXIS,local_forward,BLADE_AXIS.cross(local_forward))).transposed()
    world_basis = Matrix((blade,forward,blade.cross(forward))).transposed()
    hand.matrix = Matrix.LocRotScale(hand.head, (world_basis @ local_basis.transposed()).to_quaternion(), Vector((1,1,1)))
    bpy.context.view_layer.update()
    apply_grip(rig, bpy.context.view_layer.update)

previous = {}
for frame in range(1, 24):
    scene.frame_set(frame)
    carry()
    for b in changed:
        if b.name in previous and previous[b.name].dot(b.rotation_quaternion) < 0:
            b.rotation_quaternion.negate()
        previous[b.name] = b.rotation_quaternion.copy()
        for prop in ['location', 'rotation_quaternion', 'scale']:
            b.keyframe_insert(prop, frame=frame, group=b.name)
for curve in curves(action):
    if any(curve.data_path.startswith('pose.bones["' + b.name + '"]') for b in changed):
        for key in curve.keyframe_points:
            key.interpolation = 'LINEAR'

maximum_unrelated_change = 0.0
positions = []
for i in range(177):
    at = 1 + 22*i/176
    scene.frame_set(int(at), subframe=at-int(at))
    positions.append(pb('RightHand').head.copy())
for frame in range(1, 24):
    scene.frame_set(frame)
    for b in unchanged:
        maximum_unrelated_change = max(maximum_unrelated_change, max(abs(b.matrix[r][c]-old_poses[frame][b.name][r][c]) for r in range(4) for c in range(4)))
after = {a.name: action_digest(a) for a in bpy.data.actions}
assert all(before[name] == after[name] for name in before if name != 'run'), 'Other source clips changed'
assert maximum_unrelated_change < 1e-5, maximum_unrelated_change
assert (positions[-1]-positions[0]).length < 1e-5
scene.frame_set(1)
scene.frame_start, scene.frame_end = 1,23
bpy.ops.wm.save_as_mainfile(filepath=str(out/'master.blend'))
report = {'source':str(source.relative_to(PREP)), 'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(), 'before_action_sha256':before, 'after_action_sha256':after, 'changed_bones':[b.name for b in changed], 'maximum_unrelated_pose_change':maximum_unrelated_change, 'maximum_hand_step_at_240hz_m':max((b-a).length for a,b in zip(positions, positions[1:])), 'loop_seam_m':(positions[-1]-positions[0]).length, 'cause':'Carry IK was solved in world space before source root travel was removed; fix solves only the run arm on the in-place source.'}
(out/'correction.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
