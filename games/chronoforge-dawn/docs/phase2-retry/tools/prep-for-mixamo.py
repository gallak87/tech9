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
import pathlib
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
TARGET_TRIS = int(args.get("tris", 0))            # 0 = leave the mesh alone
# Textures are stripped by DEFAULT because Mixamo rejects uploads carrying
# full-size maps — measured, same 24k mesh, 5.7 MB textured rejected and 0.9 MB
# geometry-only accepted. The maps travel around the round trip instead, via
# extract-textures.py and canonicalise --textures. Pass --keep-textures 1 only
# to test a service that does accept them.
STRIP_TEX = args.get("keep-textures") != "1"

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

# Decimate BEFORE rigging, never after: reducing a rigged mesh degrades the skin
# weights it already carries. A game character does not need 82k triangles —
# the stand-in this pipeline was proven against is 12,609 — and a smaller upload
# is also the first thing to try when a rigging service rejects a valid file.
if TARGET_TRIS and tris > TARGET_TRIS:
    ratio = TARGET_TRIS / tris
    for m in meshes:
        bpy.context.view_layer.objects.active = m
        mod = m.modifiers.new(name="prep_decimate", type="DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)
    after = 0
    for m in meshes:
        m.data.calc_loop_triangles()
        after += len(m.data.loop_triangles)
    print(f"[prep] decimated {tris} -> {after} tris (ratio {ratio:.3f})")
    tris = after

if STRIP_TEX:
    # Rigging needs geometry, not appearance. Dropping the textures makes the
    # upload a fraction of the size, which isolates "the service rejects my
    # file" from "the service cannot take my file".
    for m in meshes:
        m.data.materials.clear()
    for img in list(bpy.data.images):
        if img.source != "VIEWER" and img.name != "Render Result":
            bpy.data.images.remove(img)
    print("[prep] stripped textures — geometry only")

# Meshy already embeds its textures; Blender unpacks them to a .fbm sidecar on
# import and re-embeds them on export. Pack anything that somehow is not, then
# VERIFY rather than assume — an earlier version of this script judged success
# by comparing file sizes, concluded the textures were missing when they were
# not, and "fixed" it by relinking an image to the wrong file on disk.
packed = 0
for img in bpy.data.images:
    if img.name == "Render Result" or img.source == "VIEWER" or img.packed_file:
        continue
    try:
        img.pack()
        packed += 1
    except Exception as e:
        print(f"[prep] could not pack {img.name}: {e}")

carried = [i.name for i in bpy.data.images
           if i.source != "VIEWER" and i.name != "Render Result" and i.packed_file]
loose = [] if STRIP_TEX else [i.name for i in bpy.data.images
         if i.source != "VIEWER" and i.name != "Render Result" and not i.packed_file]
print(f"[prep] textures carried in the file: {len(carried)} -> {', '.join(carried)}")
if loose:
    die(f"{len(loose)} texture(s) are NOT embedded and Mixamo will return a grey "
        f"character: {', '.join(loose)}")

print(f"[prep] {len(meshes)} mesh(es), {tris} tris, packed {packed} image(s)")
if tris > 80000:
    print(f"[prep] NOTE {tris} tris may exceed Mixamo's ceiling. If it rejects the "
          f"upload, add a Decimate pass and retry — do not decimate after rigging, "
          f"it degrades the weights.")

# Sit the character on the floor. Meshy centres its meshes on the origin, so an
# upload arrives half sunk into the ground plane. Our own canonicalise stage
# re-grounds whatever comes back, so this changes nothing downstream — it is for
# the riggers that DO read the floor, and so a human eyeballing the upload sees a
# character standing rather than one buried to the waist.
bpy.context.view_layer.update()
lowest = min((m.matrix_world @ v.co).z for m in meshes for v in m.data.vertices)
if abs(lowest) > 1e-4:
    for o in imported:
        if o.parent is None:
            o.location.z -= lowest
    bpy.context.view_layer.update()
    print(f"[prep] grounded: lowest point {lowest:+.3f} -> 0.000")

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
