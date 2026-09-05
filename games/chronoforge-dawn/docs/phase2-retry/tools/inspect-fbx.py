"""Report what is actually inside an FBX. Read-only; writes nothing.

  blender --background --python docs/phase2/inspect-fbx.py -- <file.fbx>

Answers the questions that decide whether a mesh can be rigged and loaded:
is there an armature, is it one mesh or many, how many tris, is there a UV
set, what scale did it arrive at, and are the textures linked or dangling.
"""
import sys
import bpy
import mathutils

src = sys.argv[sys.argv.index("--") + 1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src, automatic_bone_orientation=True)

arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
meshes = [o for o in bpy.data.objects if o.type == "MESH"]

print(f"[i] armatures = {len(arms)}")
for a in arms:
    print(f"[i]   {a.name}: {len(a.data.bones)} bones")
    for b in a.data.bones:
        print(f"[i]     bone {b.name}")
if not arms:
    print("[i]   NOT RIGGED — no skeleton, no skin weights")

print(f"[i] meshes = {len(meshes)}")
tris = 0
for m in meshes:
    m.data.calc_loop_triangles()
    tris += len(m.data.loop_triangles)
    print(f"[i]   {m.name}: verts={len(m.data.vertices)} "
          f"polys={len(m.data.polygons)} tris={len(m.data.loop_triangles)}")
    print(f"[i]     uv_layers={[u.name for u in m.data.uv_layers]}")
    print(f"[i]     vertex_groups={len(m.vertex_groups)} "
          f"shape_keys={bool(m.data.shape_keys)} "
          f"modifiers={[mo.type for mo in m.modifiers]}")
    print(f"[i]     scale={tuple(round(v, 4) for v in m.scale)} "
          f"loc={tuple(round(v, 4) for v in m.location)}")
print(f"[i] total tris = {tris}")

# World-space bounds across every mesh: the character's real height, which is
# what the loader's scale normalisation has to correct.
if meshes:
    mn, mx = [1e9] * 3, [-1e9] * 3
    for m in meshes:
        for corner in m.bound_box:
            w = m.matrix_world @ mathutils.Vector(corner)
            for i in range(3):
                mn[i], mx[i] = min(mn[i], w[i]), max(mx[i], w[i])
    print(f"[i] world bbox min={[round(v, 4) for v in mn]} "
          f"max={[round(v, 4) for v in mx]}")
    print(f"[i] world dims (x,y,z) = {[round(mx[i] - mn[i], 4) for i in range(3)]} "
          f"unit_scale={bpy.context.scene.unit_settings.scale_length}")

print(f"[i] materials = {[m.name for m in bpy.data.materials]}")
for mat in bpy.data.materials:
    if mat.use_nodes:
        imgs = [n.image.name for n in mat.node_tree.nodes
                if n.type == "TEX_IMAGE" and n.image]
        print(f"[i]   {mat.name}: textures={imgs}")

# Blender resolves external texture paths from disk. An uploader will not, so a
# populated list here does not mean the textures travel with the file.
for i in bpy.data.images:
    if i.name == "Render Result":
        continue
    print(f"[i] image {i.name}: {i.size[0]}x{i.size[1]} "
          f"packed={bool(i.packed_file)} source={i.filepath or '<embedded>'}")
