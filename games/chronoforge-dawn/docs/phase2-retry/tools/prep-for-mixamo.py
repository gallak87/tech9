"""Re-export a mesh as an FBX with its textures embedded. Blender, headless.

  blender --background --python tools/prep-for-mixamo.py -- \
      --input <mesh.fbx|.glb> --output <embedded.fbx>

Mixamo's uploader does not follow external texture paths — Adobe's own note is
"make sure embed media is turned on for FBX files to upload your textures" — so
an FBX that references sibling PNGs comes back as a grey character. This bakes
them in.

Exists because rigging one generated mesh by hand answers the question the whole
phase is blocked on: can an auto-rigger handle generated topology at all. That
answer is the same whichever rigger is eventually chosen, so a one-off browser
round trip buys it cheaply and commits to nothing.
"""
import sys

import bpy


def die(m):
    print(f"[prep] FAIL {m}", flush=True)
    sys.exit(1)


a = sys.argv[sys.argv.index("--") + 1:]
args = {a[i].lstrip("-"): a[i + 1] for i in range(0, len(a), 2)}
for k in ("input", "output"):
    if k not in args:
        die(f"missing --{k}")

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
before = set(bpy.data.objects)

low = args["input"].lower()
if low.endswith(".fbx"):
    bpy.ops.import_scene.fbx(filepath=args["input"], automatic_bone_orientation=True)
elif low.endswith((".glb", ".gltf")):
    bpy.ops.import_scene.gltf(filepath=args["input"])
else:
    die(f"unsupported input {args['input']}")

imported = [o for o in bpy.data.objects if o not in before]
meshes = [o for o in imported if o.type == "MESH"]
if not meshes:
    die("no mesh imported")

tris = 0
for m in meshes:
    m.data.calc_loop_triangles()
    tris += len(m.data.loop_triangles)

# Pack every image into the .blend so the exporter has bytes, not paths.
packed = 0
for img in bpy.data.images:
    if img.name == "Render Result" or img.packed_file:
        continue
    try:
        img.pack()
        packed += 1
    except Exception as e:
        print(f"[prep] could not pack {img.name}: {e}")

print(f"[prep] {len(meshes)} mesh(es), {tris} tris, packed {packed} image(s)")
if tris > 80000:
    print(f"[prep] NOTE {tris} tris may exceed Mixamo's ceiling. If it rejects the "
          f"upload, add a Decimate pass and retry — do not decimate after rigging, "
          f"it degrades the weights.")

bpy.ops.object.select_all(action="DESELECT")
for o in imported:
    o.select_set(True)

bpy.ops.export_scene.fbx(
    filepath=args["output"],
    use_selection=True,
    path_mode="COPY",
    embed_textures=True,
    add_leaf_bones=False,
    bake_anim=False,
)
print(f"[prep] wrote {args['output']}")
