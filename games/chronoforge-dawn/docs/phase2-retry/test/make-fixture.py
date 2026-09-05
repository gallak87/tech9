"""Build a deliberately non-conforming rigged character. Blender, headless.

  blender --background --python test/make-fixture.py -- --output <fixture.glb>

The gate needs an input that is wrong in every way the contract cares about, so
that a pass means the canonicaliser actually did the work rather than that the
input happened to be fine. This fixture is wrong on purpose:

  names      "rig:Hips" style, not spec names
  rest pose  T-pose, arms along +/-X instead of -Y
  scale      3.44 m tall, exactly 2x the contract
  ground     floating, hips at z=+1.2
  animation  one action present, which the contract forbids

It is a stick figure with one cube per bone. Nothing about it needs to look
good — it needs to be structurally exactly like a real auto-rigger's output.
"""
import sys

import bpy
from mathutils import Vector

# Spec hierarchy, but posed as a T and at 2x scale. Offsets are the CONTRACT's,
# rotated for the arms, so the canonicaliser has real work to do.
K = 2.0
T_POSE = {
    "shoulder_L": (0.19, 0.04, 0), "upperArm_L": (0.28, 0, 0),
    "lowerArm_L": (0.24, 0, 0), "hand_L": (0.09, 0, 0),
    "shoulder_R": (-0.19, 0.04, 0), "upperArm_R": (-0.28, 0, 0),
    "lowerArm_R": (-0.24, 0, 0), "hand_R": (-0.09, 0, 0),
}
SPEC = [
    ("hips", None, (0, 0.96, 0)), ("spine_lower", "hips", (0, 0.14, 0)),
    ("spine_upper", "spine_lower", (0, 0.22, 0)), ("neck", "spine_upper", (0, 0.08, 0)),
    ("head", "neck", (0, 0.32, 0)),
    ("shoulder_L", "spine_upper", (0.19, 0.04, 0)), ("upperArm_L", "shoulder_L", (0, -0.28, 0)),
    ("lowerArm_L", "upperArm_L", (0, -0.24, 0)), ("hand_L", "lowerArm_L", (0, -0.09, 0)),
    ("shoulder_R", "spine_upper", (-0.19, 0.04, 0)), ("upperArm_R", "shoulder_R", (0, -0.28, 0)),
    ("lowerArm_R", "upperArm_R", (0, -0.24, 0)), ("hand_R", "lowerArm_R", (0, -0.09, 0)),
    ("upperLeg_L", "hips", (0.10, -0.02, 0)), ("lowerLeg_L", "upperLeg_L", (0, -0.42, 0)),
    ("foot_L", "lowerLeg_L", (0, -0.46, 0)),
    ("upperLeg_R", "hips", (-0.10, -0.02, 0)), ("lowerLeg_R", "upperLeg_R", (0, -0.42, 0)),
    ("foot_R", "lowerLeg_R", (0, -0.46, 0)),
]
SRC = lambda n: "rig:" + n.replace("_L", ".L").replace("_R", ".R").capitalize()

out = sys.argv[sys.argv.index("--") + 1:][1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
arm = bpy.context.object
arm.name = "Fixture"
eb = arm.data.edit_bones
eb.remove(eb[0])

# Blender is Z-up; the contract's -Y (down) is Blender's -Z. Build in Blender
# space, let the glTF exporter convert on the way out.
heads = {}
for name, parent, off in SPEC:
    o = T_POSE.get(name, off)
    ox, oy, oz = o[0] * K, -o[2] * K, o[1] * K         # glTF (x,y,z) -> blender (x,-z,y)
    base = Vector((0, 0, 1.2)) if parent is None else heads[parent]
    head = base + Vector((ox, oy, oz)) if parent else base + Vector((0, 0, 0.96 * K))
    b = eb.new(SRC(name))
    b.head = head
    b.tail = head + Vector((0, 0, 0.08))
    if parent:
        b.parent = eb[SRC(parent)]
    heads[name] = head
# Give every bone a tail that points at its single child, so the rig reads as a
# real skeleton rather than a cloud of stubs.
kids = {}
for name, parent, _ in SPEC:
    if parent:
        kids.setdefault(parent, []).append(name)
for name, _, _ in SPEC:
    k = kids.get(name, [])
    if len(k) == 1:
        eb[SRC(name)].tail = heads[k[0]]

bpy.ops.object.mode_set(mode="OBJECT")

# One cube per bone, joined, bound with automatic weights.
cubes = []
for name, parent, _ in SPEC:
    b = arm.data.bones[SRC(name)]
    mid = (b.head_local + b.tail_local) / 2
    bpy.ops.mesh.primitive_cube_add(size=0.14 * K, location=mid)
    cubes.append(bpy.context.object)
bpy.ops.object.select_all(action="DESELECT")
for c in cubes:
    c.select_set(True)
bpy.context.view_layer.objects.active = cubes[0]
bpy.ops.object.join()
body = bpy.context.object
body.name = "FixtureBody"

bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type="ARMATURE_AUTO")

# An action the contract forbids, so the gate proves it gets stripped.
arm.animation_data_create()
pb = arm.pose.bones[SRC("hips")]
pb.location = (0, 0, 0)
pb.keyframe_insert("location", frame=1)
pb.location = (0, 0, 0.5)
pb.keyframe_insert("location", frame=24)
pb.location = (0, 0, 0)
if arm.animation_data.action:
    arm.animation_data.action.name = "ShouldBeStripped"

bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_skins=True,
                          export_animations=True, export_yup=True)
crown = max((body.matrix_world @ v.co).z for v in body.data.vertices)
low = min((body.matrix_world @ v.co).z for v in body.data.vertices)
print(f"[fixture] {len(arm.data.bones)} bones, {len(body.data.vertices)} verts")
print(f"[fixture] T-pose, height {crown - low:.3f} m, soles at z={low:.3f}, 1 action")
print(f"[fixture] wrote {out}")
