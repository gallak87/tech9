"""Author Kaida's first grounded gameplay set; keep downloaded sources immutable.

blender --background --python-exit-code 1 --python <this file> -- REVISION
Outputs a separate editable master and reports. Review before candidate export.
"""
import bpy
import hashlib
import json
import math
from pathlib import Path
import sys
import numpy as np
from mathutils import Matrix, Quaternion, Vector

PREP = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PREP / 'tools'))
from clip_stage import action_digest
from blender_stage import curves

def bind_action(rig, action):
    rig.animation_data_create()
    rig.animation_data.action = action
    if action is not None:
        if not action.slots:
            action.slots.new(id_type='OBJECT', name=rig.name)
        rig.animation_data.action_slot = action.slots[0]

revision = sys.argv[sys.argv.index('--') + 1]
assert revision.replace('-', '').isalnum(), 'Use a simple revision token'
OUT = PREP / 'assets/kaida/sources' / revision
assert not OUT.exists(), 'Never overwrite a retained source revision'
OUT.mkdir(parents=True)
source_path = PREP / 'assets/kaida/sources/mixamo-clips-r1/master.blend'
bpy.ops.wm.open_mainfile(filepath=str(source_path))
scene = bpy.context.scene
old = bpy.data.objects['Armature']
mesh = bpy.data.objects['Kaida']
original_digests = {a.name: action_digest(a) for a in bpy.data.actions}
turn = Matrix.Rotation(math.pi, 4, 'Z')
old_world = turn @ old.matrix_world

# Capture evaluated world poses before changing units or adding a motion carrier.
samples = {}
for role, count in [('idle', 60), ('run', 23)]:
    bind_action(old, bpy.data.actions[role + '.source'])
    samples[role] = []
    for frame in range(1, count + 1):
        scene.frame_set(frame)
        samples[role].append({b.name: old_world @ b.matrix for b in old.pose.bones})

data = bpy.data.armatures.new('Kaida canonical skeleton')
rig = bpy.data.objects.new('KaidaRig', data)
scene.collection.objects.link(rig)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
root = data.edit_bones.new('MotionRoot')
root.head, root.tail = (0, 0, 0), (0, .1, 0)
root.use_deform = False
for source in old.data.bones:
    bone = data.edit_bones.new(source.name)
    bone.head = old_world @ source.head_local
    bone.tail = old_world @ source.tail_local
    bone.align_roll(old_world.to_3x3() @ source.matrix_local.to_3x3().col[2])
    bone.parent = data.edit_bones[source.parent.name] if source.parent else root
    bone.use_deform = source.use_deform
bpy.ops.object.mode_set(mode='OBJECT')

# Mesh positions and weights remain attached to the same named deform bones.
mesh.data = mesh.data.copy()
mesh.data.transform(turn @ mesh.matrix_world)
mesh.parent = rig
mesh.matrix_parent_inverse = Matrix.Identity(4)
mesh.matrix_basis = Matrix.Identity(4)
for modifier in mesh.modifiers:
    if modifier.type == 'ARMATURE':
        modifier.object = rig
names = [b.name for b in old.data.bones]
old.animation_data_clear()
bpy.data.objects.remove(old, do_unlink=True)
# Originals stay in the retained source master; export only the gameplay actions.
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)

def pb(short):
    return rig.pose.bones['mixamorig:' + short]

def fresh(name):
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    bind_action(rig, action)
    for b in rig.pose.bones:
        b.rotation_mode = 'QUATERNION'
        b.matrix_basis.identity()
    return action

def key_all(frame):
    for bone in rig.pose.bones:
        for path in ('location', 'rotation_quaternion', 'scale'):
            bone.keyframe_insert(path, frame=frame, group=bone.name)

def linear(action):
    for fc in curves(action):
        for key in fc.keyframe_points:
            key.interpolation = 'LINEAR'

# Bake the exact source pose into unit-scale bones. Horizontal travel is carried
# by MotionRoot so the existing export operation can remove it independently.
max_pose_error = 0
travel = {}
for role, frames in samples.items():
    action = fresh(role)
    first = frames[0]['mixamorig:Hips'].translation
    travel[role] = list(frames[-1]['mixamorig:Hips'].translation - first)
    for frame, targets in enumerate(frames, 1):
        scene.frame_set(frame)
        displacement = targets['mixamorig:Hips'].translation - first
        rig.pose.bones['MotionRoot'].location = (displacement.x, displacement.y, 0)
        bpy.context.view_layer.update()
        for name in names:
            target = targets[name]
            # Source armature scale affects translations, not pose-bone scale.
            target = Matrix.LocRotScale(target.translation, target.to_quaternion(), Vector((1, 1, 1)))
            rig.pose.bones[name].matrix = target
            bpy.context.view_layer.update()
            max_pose_error = max(max_pose_error, (rig.pose.bones[name].head - target.translation).length)
        key_all(frame)
    linear(action)
assert max_pose_error < .0001, max_pose_error

# Four influences are a deliberate export preparation, with original weights
# retained upstream. Report the discarded mass for review.
changed, discarded = 0, 0.0
for vertex in mesh.data.vertices:
    groups = sorted([(g.group, g.weight) for g in vertex.groups], key=lambda x: -x[1])
    if len(groups) > 4:
        changed += 1
        discarded = max(discarded, sum(w for _, w in groups[4:]))
    total = sum(w for _, w in groups[:4])
    for group, weight in groups:
        mesh.vertex_groups[group].remove([vertex.index])
    for group, weight in groups[:4]:
        mesh.vertex_groups[group].add([vertex.index], weight / total, 'REPLACE')

def aim(short, direction):
    bone = pb(short)
    matrix = bone.matrix.copy()
    q = (bone.tail - bone.head).normalized().rotation_difference(Vector(direction).normalized()) @ matrix.to_quaternion()
    bone.matrix = Matrix.LocRotScale(matrix.translation, q, Vector((1, 1, 1)))
    bpy.context.view_layer.update()

def solve_limb(upper, lower, target, pole):
    a, b = pb(upper), pb(lower)
    origin = a.head.copy()
    delta = Vector(target) - origin
    distance = min(delta.length, a.length + b.length - .001)
    axis = delta.normalized()
    bend = Vector(pole) - axis * Vector(pole).dot(axis)
    bend.normalize()
    along = (a.length*a.length - b.length*b.length + distance*distance) / (2*distance)
    knee = origin + axis*along + bend*math.sqrt(max(0, a.length*a.length-along*along))
    aim(upper, knee - origin)
    aim(lower, origin + axis*distance - b.head)

# Derive the grip from actual palm anatomy, then store a named socket bone.
bind_action(rig, None)
for b in rig.pose.bones:
    b.matrix_basis.identity()
bpy.context.view_layer.update()
hand = pb('RightHand')
long = (hand.tail-hand.head).normalized()
cross = pb('RightHandThumb1').head - pb('RightHandPinky1').head
blade_axis = (cross-long*cross.dot(long)).normalized()
palm_normal = long.cross(blade_axis).normalized()
grip = hand.head + long*.054 + palm_normal*.013
grip_local = hand.matrix.inverted() @ grip
axis_local = hand.matrix.to_quaternion().inverted() @ blade_axis
finger_axes = {}
for digit in ('Index', 'Middle', 'Ring', 'Pinky'):
    for n in (1, 2, 3):
        b = pb(f'RightHand{digit}{n}')
        axis = (b.tail-b.head).normalized().cross(palm_normal).normalized()
        finger_axes[b.name] = b.matrix.to_quaternion().inverted() @ axis
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
socket = data.edit_bones.new('SwordSocket')
socket.head, socket.tail = grip, grip + blade_axis*.1
socket.parent = data.edit_bones['mixamorig:RightHand']
socket.align_roll(palm_normal)
socket.use_deform = False
bpy.ops.object.mode_set(mode='OBJECT')

def sword_hand(direction):
    hand = pb('RightHand')
    current = hand.matrix.to_quaternion() @ axis_local
    q = current.rotation_difference(Vector(direction).normalized()) @ hand.matrix.to_quaternion()
    hand.matrix = Matrix.LocRotScale(hand.head, q, Vector((1, 1, 1)))
    bpy.context.view_layer.update()

def grip_fingers():
    # Curl each finger toward the palm; thumb folds across the grip.
    for digit in ('Index', 'Middle', 'Ring', 'Pinky'):
        for n, angle in [(1, 58), (2, 75), (3, 52)]:
            bone = pb(f'RightHand{digit}{n}')
            bone.rotation_quaternion = Quaternion(finger_axes[bone.name], math.radians(angle))
    pb('RightHandThumb1').rotation_quaternion = Quaternion((0, 0, 1), -.35)
    pb('RightHandThumb2').rotation_quaternion = Quaternion((1, 0, 0), .55)
    pb('RightHandThumb3').rotation_quaternion = Quaternion((1, 0, 0), .4)
    bpy.context.view_layer.update()

def armed_arm(wrist=(.35, .12, 1.08), blade=(.32, .75, .48)):
    solve_limb('RightArm', 'RightForeArm', wrist, (1, -.3, -.2))
    sword_hand(blade)
    grip_fingers()

# Retain lower-body motion, add a consistent carry pose and explicit loop seam.
for role in ('idle', 'run'):
    action = bpy.data.actions[role]
    bind_action(rig, action)
    end = int(action.frame_range[1])
    for frame in range(1, end+1):
        scene.frame_set(frame)
        armed_arm(wrist=(.34, .16, 1.14) if role == 'run' else (.35, .12, 1.08))
        key_all(frame)
    # Duplicate the opening pose at the loop endpoint while preserving source
    # travel in MotionRoot; original uncorrected clips stay upstream.
    scene.frame_set(1)
    loop_pose = {b.name: b.matrix_basis.copy() for b in rig.pose.bones}
    scene.frame_set(end)
    for b in rig.pose.bones:
        if b.name != 'MotionRoot':
            b.matrix_basis = loop_pose[b.name]
    key_all(end)
    linear(action)

# Stand and walk share a neutral torso, with analytically placed feet. The walk
# is authored as a contact/swing cycle, rather than slowing the running clip.
bind_action(rig, None)
for b in rig.pose.bones:
    b.matrix_basis.identity()
bpy.context.view_layer.update()
rest_hips = pb('Hips').matrix.copy()
feet = {s: pb(s+'Foot').matrix.copy() for s in ('Left', 'Right')}

def stance(bob=0, yaw=0):
    for b in rig.pose.bones:
        b.matrix_basis.identity()
    hip = rest_hips.copy()
    hip = Matrix.LocRotScale(hip.translation, Quaternion((0,0,1),math.pi) @ hip.to_quaternion(),Vector((1,1,1)))
    hip.translation.z -= .055 + bob
    pb('Hips').matrix = hip
    bpy.context.view_layer.update()
    for s, sign in [('Right', 1), ('Left', -1)]:
        target = Vector((sign*.145, sign*-.11, feet[s].translation.z))
        solve_limb(s+'UpLeg', s+'Leg', target, (0, 1, 0))
        mat = Matrix.LocRotScale(feet[s].translation, Quaternion((0,0,1),math.pi) @ feet[s].to_quaternion(),Vector((1,1,1)))
        mat.translation = pb(s+'Foot').head
        pb(s+'Foot').matrix = mat
        pb(s+'ToeBase').rotation_quaternion = Quaternion()
        bpy.context.view_layer.update()
    spine = pb('Spine1')
    mat = spine.matrix.copy()
    mat = Matrix.LocRotScale(mat.translation, Quaternion((0,0,1),yaw) @ mat.to_quaternion(), Vector((1,1,1)))
    spine.matrix = mat
    bpy.context.view_layer.update()
    aim('LeftArm', (-.28, .05, -.96))
    aim('LeftForeArm', (.08, .4, -.92))
    armed_arm()

walk = fresh('walk')
for frame in range(1, 22):
    phase = (frame-1)/20
    stance(bob=.018*math.cos(phase*math.tau*2))
    for side, sign, offset in [('Right',1,0), ('Left',-1,.5)]:
        t = (phase+offset) % 1
        if t < .5:  # stance foot travels backward relative to the moving actor
            y, lift = .38-1.52*t, 0
        else:
            t = (t-.5)*2
            y, lift = -.38+.76*(t*t*(3-2*t)), .11*math.sin(t*math.pi)
        target = (sign*.11, y, feet[side].translation.z+lift)
        solve_limb(side+'UpLeg', side+'Leg', target, (0,1,0))
        mat = Matrix.LocRotScale(feet[side].translation, Quaternion((0,0,1),math.pi) @ feet[side].to_quaternion(),Vector((1,1,1)))
        mat.translation = pb(side+'Foot').head
        pb(side+'Foot').matrix = mat
        bpy.context.view_layer.update()
    aim('LeftArm', (-.2, -.28*math.cos(phase*math.tau), -.96))
    aim('LeftForeArm', (0, .12-.2*math.cos(phase*math.tau), -.97))
    key_all(frame)
linear(walk)

# A single grounded right-to-left cut: fixed feet, winding torso, fast strike,
# overshoot, then settle. Contact is exactly halfway for foundation format 1.
attack = fresh('attack')
poses = [
    (1, 0, 0, (.35,.12,1.08), (.32,.75,.48)),
    (8, .015, -.15, (.40,-.08,1.29), (.35,-.25,.90)),
    (15, .035, -.35, (.40,-.12,1.56), (.20,-.45,.88)),
    (18, .03, -.26, (.43,.08,1.47), (.70,.65,.30)),
    (21, .02, .12, (.18,.43,1.24), (-.25,.95,-.20)),
    (25, .025, .40, (-.20,.29,.99), (-.78,.22,-.58)),
    (30, .01, .26, (-.12,.25,1.03), (-.65,.62,-.30)),
    (36, 0, .08, (.24,.18,1.08), (.15,.85,.40)),
    (41, 0, 0, (.35,.12,1.08), (.32,.75,.48)),
]
for frame, bob, yaw, wrist, blade in poses:
    stance(bob, yaw)
    armed_arm(wrist, blade)
    aim('LeftArm', (-.55,-.28,-.78))
    aim('LeftForeArm', (-.10,.28,-.90))
    key_all(frame)
for fc in curves(attack):
    for key in fc.keyframe_points:
        key.interpolation = 'BEZIER'
        key.handle_left_type = key.handle_right_type = 'AUTO_CLAMPED'

hurt = fresh('hurt')
for frame, lean, bob in [(1,0,0),(4,-.18,.015),(8,-.13,.04),(15,.045,.02),(24,0,0)]:
    stance(bob)
    b = pb('Spine1')
    mat = b.matrix.copy()
    b.matrix = Matrix.LocRotScale(mat.translation, Quaternion((1,0,0),lean) @ mat.to_quaternion(), Vector((1,1,1)))
    bpy.context.view_layer.update()
    armed_arm((.37,.08,1.11),(.50,.70,.50))
    key_all(frame)
for fc in curves(hurt):
    for key in fc.keyframe_points:
        key.interpolation = 'BEZIER'
        key.handle_left_type = key.handle_right_type = 'AUTO_CLAMPED'

# Make the runtime working master in place; original clips and extracted travel
# are still retained outside this file. The exporter independently checks Root.
for action in bpy.data.actions:
    for fc in curves(action):
        if fc.data_path == 'pose.bones["MotionRoot"].location' and fc.array_index in (0,1):
            for k in fc.keyframe_points:
                k.co.y = k.handle_left.y = k.handle_right.y = 0
    action.use_fake_user = True

scene.render.fps = 30
scene.unit_settings.scale_length = 1
# glTF uses one metallic/roughness texture. Pack the supplied channels explicitly
# so the export/reimport check can compare the exact runtime texture pixels.
mat = mesh.data.materials[0]
nodes, links = mat.node_tree.nodes, mat.node_tree.links
rough_node, metal_node = nodes['Kaida roughness'], nodes['Kaida metallic']
width, height = rough_node.image.size
rough = np.empty(width*height*4, dtype=np.float32)
metal = np.empty_like(rough)
rough_node.image.pixels.foreach_get(rough)
metal_node.image.pixels.foreach_get(metal)
packed = np.ones((width*height,4), dtype=np.float32)
packed[:,1], packed[:,2] = rough.reshape(-1,4)[:,0], metal.reshape(-1,4)[:,0]
orm = bpy.data.images.new('Kaida packed metallic roughness', width=width, height=height, alpha=True)
orm.colorspace_settings.name = 'Non-Color'
orm.pixels.foreach_set(packed.ravel())
orm.filepath_raw = str(OUT/'kaida-orm.png')
orm.file_format = 'PNG'
orm.save()
orm.pack()
nodes.remove(rough_node)
nodes.remove(metal_node)
tex = nodes.new('ShaderNodeTexImage')
tex.image = orm
split = nodes.new('ShaderNodeSeparateColor')
links.new(tex.outputs['Color'], split.inputs['Color'])
links.new(split.outputs['Green'], nodes['Principled BSDF'].inputs['Roughness'])
links.new(split.outputs['Blue'], nodes['Principled BSDF'].inputs['Metallic'])
bind_action(rig,bpy.data.actions['attack'])
scene.frame_start,scene.frame_end = 1,41
scene.frame_set(1)
scene.timeline_markers.clear()
for label, frame in [('Ready',1),('Anticipation',15),('CONTACT',21),('Follow-through',25),('Recovered',41)]:
    scene.timeline_markers.new(label,frame=frame)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            space=area.spaces.active
            space.overlay.show_overlays=False
            space.shading.type='MATERIAL'
            space.region_3d.view_location=(0,0,1)
            space.region_3d.view_distance=3.8
            space.region_3d.view_rotation=Vector((0,-1,0)).to_track_quat('-Z','Y')
            space.region_3d.view_perspective='ORTHO'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'master.blend'))
report={'source_master':str(source_path.relative_to(PREP)), 'source_sha256':hashlib.sha256(source_path.read_bytes()).hexdigest(),
        'source_actions_sha256':original_digests,'canonical_pose_max_error_m':max_pose_error,
        'source_root_travel_m':travel,'retained_bones':65,'added_bones':['MotionRoot','SwordSocket'],
        'weight_limit':4,'vertices_with_reduced_influences':changed,'max_discarded_weight':discarded,
        'clips':{a.name:list(a.frame_range) for a in bpy.data.actions},'attack_contact_frame':21,
        'attack_contact_fraction':.5,'walk_nominal_speed_m_s':2.28,
        'status':'Authored first pass; visual and runtime checks pending'}
(OUT/'authoring.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
