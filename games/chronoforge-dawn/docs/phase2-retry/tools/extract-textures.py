"""Write a mesh's embedded textures out as files. Blender, headless.

  blender --background --python tools/extract-textures.py -- \
      --input <mesh.fbx|.glb> --output <dir>

Rigging services do not carry textures — Mixamo's backend rejects an upload
carrying 2048-square maps outright, and returns geometry, skeleton and weights
with no appearance at all. The textures therefore have to survive OUTSIDE that
round trip, so they are extracted once here and re-attached after rigging.

Each image is named by the role it plays, not by whatever the generator called
it, so the re-attach step can find them without a lookup table.
"""
import pathlib
import sys

import bpy

ROLES = ("normal", "roughness", "metallic", "occlusion", "emissive")

a = sys.argv[sys.argv.index("--") + 1:]
args = {a[i].lstrip("-"): a[i + 1] for i in range(0, len(a), 2)}
for k in ("input", "output"):
    if k not in args:
        sys.exit(f"[tex] missing --{k}")

out = pathlib.Path(args["output"])
out.mkdir(parents=True, exist_ok=True)

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

low = args["input"].lower()
if low.endswith(".fbx"):
    bpy.ops.import_scene.fbx(filepath=args["input"], automatic_bone_orientation=True)
elif low.endswith((".glb", ".gltf")):
    bpy.ops.import_scene.gltf(filepath=args["input"])
else:
    sys.exit(f"[tex] unsupported input {args['input']}")

written = []
for img in bpy.data.images:
    if img.source == "VIEWER" or img.name == "Render Result":
        continue
    # A packed image reports has_data == False until something forces the decode,
    # so checking it first silently skips every texture but the one Blender
    # happened to have already loaded. Touch the buffer to bring it in.
    if not img.has_data:
        try:
            img.update()
            _ = img.pixels[0]
        except Exception:
            pass
    if not img.has_data or img.size[0] == 0:
        print(f"[tex] skipped {img.name}: no decodable image data")
        continue
    role = next((r for r in ROLES if r in img.name.lower()), "base_color")
    dst = out / f"{role}.png"
    img.filepath_raw = str(dst)
    img.file_format = "PNG"
    img.save()
    written.append(f"{role}.png ({img.size[0]}x{img.size[1]})")

if not written:
    sys.exit("[tex] no image data found — is the mesh textured?")
for w in written:
    print(f"[tex] wrote {w}")
