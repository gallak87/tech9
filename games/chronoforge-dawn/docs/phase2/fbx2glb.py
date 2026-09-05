"""Blender headless: FBX -> GLB, skinning kept, animation dropped.

  blender --background --python fbx2glb.py -- <src.fbx> <dst.glb>

Animation is dropped on purpose: the game's own clips drive the skeleton, and
importing a rig's bundled motion would only compete with them.
"""
import bpy, sys

src, dst = sys.argv[sys.argv.index("--") + 1:][:2]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src, automatic_bone_orientation=True)

# Mixamo FBX carries a unit scale the importer applies to object transforms but
# not to bone translations, so the mesh arrives in metres and the skeleton in
# centimetres. Baking object scale into the data puts both on one system;
# without it the loader measures a 4 mm character and scales it by ~437.
bpy.ops.object.select_all(action="SELECT")
bpy.context.view_layer.objects.active = next(
    (o for o in bpy.data.objects if o.type == "ARMATURE"), None)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
print(f"[fbx] armatures={len(arms)} meshes={len(meshes)}")
for a in arms:
    print(f"[fbx] {a.name}: {len(a.data.bones)} bones")
if not arms:
    raise SystemExit("[fbx] no armature — the FBX is not rigged")

bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB",
                          export_skins=True, export_animations=False,
                          export_apply=False)
print(f"[fbx] wrote {dst}")
