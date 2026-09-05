"""Do the arms pass through the body? Measure it. Blender, headless.

  blender --background --python tools/check-clipping.py -- --input <char.glb>

A character can satisfy every skeletal check and still have her forearms buried
in her jacket, because nothing that measures bones can see the skin. This splits
the mesh by which bone owns each vertex, then tests every arm vertex against the
torso surface: a vertex on the inward side of that surface is inside the body.

Reports the worst penetration in millimetres and how many vertices are inside,
so "is it fixed" is a number and "is it better" is a diff.
"""
import sys

import bpy
from mathutils import Vector

# Only what should NEVER be inside the body. A shoulder joint sits inboard of the
# arm and the top of the upper arm is genuinely within the torso volume, so
# counting those reports 60% of the arm as clipping on a character that is fine.
# The forearm and hand are the honest test: nothing about them belongs inside.
ARM = ("lowerArm_", "hand_")
TORSO = ("hips", "spine_lower", "spine_upper")

a = sys.argv[sys.argv.index("--") + 1:]
args = {a[i].lstrip("-"): a[i + 1] for i in range(0, len(a), 2)}
if "input" not in args:
    sys.exit("[clip] missing --input")
TOL_MM = float(args.get("tol", 2.0))     # anything shallower is surface contact

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=args["input"])
imported = [o for o in bpy.data.objects if o not in before]

arm = next((o for o in imported if o.type == "ARMATURE"), None)
meshes = [o for o in imported if o.type == "MESH" and any(
    m.type == "ARMATURE" and m.object is arm for m in o.modifiers)]
if not meshes:
    sys.exit("[clip] no skinned mesh")
src = meshes[0]

# Which bone owns each vertex — the group with the largest weight.
gi = {g.index: g.name for g in src.vertex_groups}
def owner(v):
    best, bw = None, 0.0
    for g in v.groups:
        if g.weight > bw:
            best, bw = gi.get(g.group, ""), g.weight
    return best or ""

arm_v = [v.index for v in src.data.vertices if owner(v).startswith(ARM)]
torso_v = {v.index for v in src.data.vertices if owner(v) in TORSO}
print(f"[clip] {len(arm_v)} arm vertices, {len(torso_v)} torso vertices")
if not arm_v or not torso_v:
    sys.exit("[clip] could not separate arm from torso — are the bones spec-named?")

# Per-height CROSS-SECTION. Not a solid test, and not a silhouette either.
#
# Two earlier attempts were wrong in instructive ways, both recorded so nobody
# rebuilds them. closest_point_on_mesh needs a CLOSED surface to answer
# inside/outside; a torso split off from a character is an open shell, its
# normals near the arm and neck holes point anywhere, and it called 1082 of 1496
# forearm vertices buried in a character whose forearms are plainly visible.
# Replacing it with a width-per-height silhouette was worse — 1464 of 1496 —
# because a silhouette ignores DEPTH, and an arm beside the hip in X but in front
# of it in Z is not touching anything.
#
# So each height slice gets the torso's extent in BOTH horizontal axes, and a
# forearm vertex counts only if it is inside that rectangle. A rectangle is
# generous around a rounded torso, so this over-reports rather than under-reports,
# which is the safe direction for a check nobody should trust blindly.
SLICE = 0.02

prof = {}
for vi in torso_v:
    co = src.data.vertices[vi].co
    k = round(co.z / SLICE)
    b = prof.get(k)
    if b is None:
        prof[k] = [co.x, co.x, co.y, co.y]
    else:
        b[0] = min(b[0], co.x); b[1] = max(b[1], co.x)
        b[2] = min(b[2], co.y); b[3] = max(b[3], co.y)

worst, inside, tol = 0.0, 0, TOL_MM / 1000.0
for vi in arm_v:
    co = src.data.vertices[vi].co
    b = prof.get(round(co.z / SLICE))
    if b is None:
        continue
    dx = min(co.x - b[0], b[1] - co.x)      # depth inside the box in x
    dy = min(co.y - b[2], b[3] - co.y)      # and in y
    d = min(dx, dy)                          # inside only if inside on BOTH
    if d > tol:
        inside += 1
        worst = max(worst, d * 1000.0)

print(f"[clip] torso profile: {len(prof)} height slices")
print(f"[clip] forearm/hand vertices inside the torso volume: {inside} of {len(arm_v)}")
print(f"[clip] worst penetration: {worst:.1f} mm  (tolerance {TOL_MM:.1f} mm)")
print("[clip] VERDICT " + ("CLEAN" if inside == 0 else "CLIPPING"))
sys.exit(1 if inside else 0)
