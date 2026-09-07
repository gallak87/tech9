"""Measured grip for this Kaida rig; re-fit when the hand or weapon changes."""
import math

from mathutils import Matrix, Quaternion, Vector

# Coordinates are in the hand bone's rest-local frame, in meters. The handle
# crosses near the knuckles, on a diagonal, rather than behind the fingers.
GRIP_CENTER = Vector((0, .087, .023))
BLADE_AXIS = Vector((.95, -.28, .14)).normalized()
PALM_NORMAL = BLADE_AXIS.cross(Vector((0, 1, 0))).normalized()
FINGER_ANGLES = {
    'Index': (32, 65, 62),
    'Middle': (33, 69, 65),
    'Ring': (50, 48, 45),
    'Pinky': (50, 30, 10),
}
THUMB_TARGETS = ((.040, .055, .035), (.028, .082, .053), (.006, .090, .052))


def apply_grip(rig, update):
    hand = rig.pose.bones['mixamorig:RightHand']
    rest_normal = hand.bone.matrix_local.to_quaternion() @ PALM_NORMAL
    for digit, angles in FINGER_ANGLES.items():
        for index, angle in enumerate(angles, 1):
            bone = rig.pose.bones[f'mixamorig:RightHand{digit}{index}']
            rest_direction = (bone.bone.tail_local - bone.bone.head_local).normalized()
            axis = rest_direction.cross(rest_normal).normalized()
            local_axis = bone.bone.matrix_local.to_quaternion().inverted() @ axis
            bone.rotation_quaternion = Quaternion(local_axis, math.radians(angle))
    update()
    for index, target in enumerate(THUMB_TARGETS, 1):
        bone = rig.pose.bones[f'mixamorig:RightHandThumb{index}']
        direction = hand.matrix @ Vector(target) - bone.head
        q = (bone.tail - bone.head).normalized().rotation_difference(direction.normalized()) @ bone.matrix.to_quaternion()
        bone.matrix = Matrix.LocRotScale(bone.head, q, Vector((1, 1, 1)))
        update()
