"""Print a rigged file's bone names, one per line. Blender, headless.

  blender --background --python tools/dump-joints.py -- <file.fbx|.glb>

suggest-map reads glTF JSON directly, which is fast and dependency-free but
cannot see inside an FBX. Rigging services hand back FBX, so this supplies the
same list from anything Blender can open.
"""
import sys

import bpy

src = sys.argv[sys.argv.index("--") + 1]
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
before = set(bpy.data.objects)

low = src.lower()
if low.endswith(".fbx"):
    bpy.ops.import_scene.fbx(filepath=src, automatic_bone_orientation=True)
elif low.endswith((".glb", ".gltf")):
    bpy.ops.import_scene.gltf(filepath=src)
else:
    sys.exit(f"[joints] unsupported input {src}")

arms = [o for o in bpy.data.objects if o.type == "ARMATURE" and o not in before]
if len(arms) != 1:
    sys.exit(f"[joints] {len(arms)} armatures, need exactly 1")
for b in arms[0].data.bones:
    print(f"[joint] {b.name}")
