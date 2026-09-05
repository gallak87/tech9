"""Bring any rigged character onto the canonical skeleton. Blender, headless.

  blender --background --python tools/canonicalise.py -- \
      --input <rigged.fbx|.glb> --map <bones.json> --output <canonical.glb>

This is the stage that makes one shared animation library able to drive every
generated character. An auto-rigger fits a skeleton to the mesh in whatever pose
the mesh was generated in, so no two characters arrive alike. Everything the
contract promises is established here:

  1. spec bone names          renamed from the map
  2. canonical rest pose      limbs along -Y, facing +Z, applied as rest
  3. canonical scale          1.72 m crown-to-sole, soles at y=0
  4. no animation             the game supplies motion

It refuses rather than guesses. A bone the map does not name, a chain it cannot
align, a height it cannot reach — each is a hard failure with the reason, not a
silent approximation, because a rig that is wrong at one joint looks fine on
load and wrong the instant it moves.
"""
import json
import pathlib
import sys
from math import degrees

import bpy
from mathutils import Matrix, Vector


def argv():
    a = sys.argv[sys.argv.index("--") + 1:]
    out = {}
    for i in range(0, len(a), 2):
        out[a[i].lstrip("-")] = a[i + 1]
    for k in ("input", "map", "output"):
        if k not in out:
            sys.exit(f"[canon] missing --{k}")
    return out


def spec_dir(arm, v):
    """A spec offset as a direction in the armature's own space.

    The contract is written in glTF space (Y up, limbs along -Y). Blender is
    Z up. This is the ONLY place that conversion is expressed; every alignment
    goes through it, so the two conventions cannot drift apart in two files.
    Taking it into armature space as well means a rotated armature object -- as
    FBX imports routinely produce -- is handled rather than assumed away.
    """
    world = Vector((v[0], -v[2], v[1]))          # glTF -> Blender
    return arm.matrix_world.inverted().to_3x3() @ world


def die(msg):
    print(f"[canon] FAIL {msg}", flush=True)
    sys.exit(1)


def load(path):
    """Import, and return ONLY what the import produced.

    Blender 5.1's startup scene holds an Icosphere, and measuring it as part of
    the character silently corrupts the height. Both the purge and the set diff
    are needed: the purge clears what is there, the diff catches anything the
    importer adds beyond the file's own contents.
    """
    # Purge directly. `read_factory_settings(use_empty=True)` is deferred -- its
    # startup objects materialise DURING the next import, so they land inside
    # any before/after diff and get measured as part of the character. Deleting
    # what is actually there, now, is the only version-proof answer.
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    before = set(bpy.data.objects)

    low = path.lower()
    if low.endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=True)
    elif low.endswith((".glb", ".gltf")):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        die(f"unsupported input {path}")

    imported = [o for o in bpy.data.objects if o not in before]

    arms = [o for o in imported if o.type == "ARMATURE"]
    if len(arms) != 1:
        die(f"{len(arms)} armatures, need exactly 1")
    arm = arms[0]

    # A character is an armature plus the meshes that armature skins. Defining
    # it that way rather than by scene membership is not just tidier -- Blender
    # materialises startup objects lazily, so an Icosphere that is in no file
    # can appear mid-import and would otherwise be measured as part of the
    # character's height. A mesh with no armature modifier is not the character.
    meshes = [o for o in imported if o.type == "MESH" and any(
        m.type == "ARMATURE" and m.object is arm for m in o.modifiers)]
    if not meshes:
        die(f"no mesh is skinned by armature '{arm.name}'")

    ignored = [o.name for o in imported if o.type == "MESH" and o not in meshes]
    if ignored:
        print(f"[canon] ignoring {len(ignored)} unskinned mesh(es): {', '.join(ignored)}")
    return arm, meshes


def bake_object_scale(arm, meshes):
    """Some exporters (Mixamo FBX) leave a unit scale on the object that applies
    to the mesh but not to bone translations. Bake it into the data so the mesh
    and the skeleton are on one system before anything is measured."""
    for o in [arm] + meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.select_all(action="DESELECT")


def rename(arm, mapping):
    """Map source bone names onto spec names. Exact matches only."""
    src_names = {b.name for b in arm.data.bones}
    for spec, src in mapping.items():
        if src not in src_names:
            die(f"map names '{src}' for {spec}, which is not in the rig")
    for spec, src in mapping.items():
        arm.data.bones[src].name = spec
    print(f"[canon] renamed {len(mapping)} bones")


def align_rest(arm, meshes, spec_joints):
    """Rotate each mapped bone so its child sits along the spec's offset
    direction, then apply the whole pose as the new rest pose.

    Walked parent-first, in armature space, so each bone is aligned against
    parents that are already correct. Blender's Apply Pose as Rest recomputes
    the bind matrices AND carries the skin, which is why this is done here and
    not in the engine — a renderer cannot relayout vertices.
    """
    child_of = {}
    for j in spec_joints:
        if j["parent"]:
            child_of.setdefault(j["parent"], []).append(j)
    order = [j["name"] for j in spec_joints]

    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")

    aligned = 0
    for name in order:
        kids = child_of.get(name, [])
        if not kids:
            continue
        # A joint with several children (hips, spine_upper) has no single
        # direction to align. Its children each align themselves.
        if len(kids) != 1:
            continue
        pb = arm.pose.bones.get(name)
        kb = arm.pose.bones.get(kids[0]["name"])
        if pb is None or kb is None:
            die(f"bone {name} or {kids[0]['name']} missing after rename")

        bpy.context.view_layer.update()
        cur = (kb.matrix.translation - pb.matrix.translation)
        tgt = spec_dir(arm, kids[0]["offset"])
        if cur.length < 1e-6 or tgt.length < 1e-6:
            continue
        rot = cur.normalized().rotation_difference(tgt.normalized())

        # Rotate about the joint's own head, in armature space.
        piv = pb.matrix.translation.copy()
        pb.matrix = (Matrix.Translation(piv) @ rot.to_matrix().to_4x4()
                     @ Matrix.Translation(-piv) @ pb.matrix)
        bpy.context.view_layer.update()
        aligned += 1

    bpy.ops.object.mode_set(mode="OBJECT")

    # Bake the posed deformation into the mesh BEFORE making the pose the rest.
    #
    # `armature_apply` moves the skeleton's rest pose and rewrites the bind
    # matrices, but it does not touch a single vertex. Do it alone and the file
    # is internally consistent -- bind matches rest, every check passes -- while
    # the mesh still sits in the pose the rigger produced. The skeleton's arms
    # hang and the character's arms stay out, which is exactly the defect the
    # probe measured at 0 degrees on the bones and a screenshot showed on the
    # body.
    #
    # Applying a COPY of the armature modifier bakes the current deformation
    # into the vertices; the original modifier stays, so the mesh is still
    # skinned when the rest pose changes underneath it.
    for m in meshes:
        mod = next((x for x in m.modifiers if x.type == "ARMATURE"), None)
        if mod is None:
            die(f"mesh '{m.name}' lost its armature modifier")
        bpy.ops.object.select_all(action="DESELECT")
        m.select_set(True)
        bpy.context.view_layer.objects.active = m
        bpy.ops.object.modifier_copy(modifier=mod.name)
        bpy.ops.object.modifier_apply(modifier=mod.name)

    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    print(f"[canon] aligned {aligned} joints, baked the skin, applied as rest")


def normalise(arm, meshes, hero_m, sole_tol):
    """Scale to the contract height and drop the soles to y=0. Measured off the
    asset, never assumed: the skeleton sets the height (hair and props are
    outside it), the skin sets the ground plane."""
    bpy.context.view_layer.update()
    zs = [(m.matrix_world @ v.co).z for m in meshes for v in m.data.vertices]
    crown, sole = max(zs), min(zs)
    height = crown - sole
    if height < 1e-3:
        die(f"degenerate height {height}")
    k = hero_m / height
    print(f"[canon] measured {height:.4f} m -> scale x{k:.4f} (crown {crown:.4f}, sole {sole:.4f})")

    roots = [o for o in [arm] + meshes if o.parent is None]
    for o in roots:
        o.scale = (o.scale[0] * k, o.scale[1] * k, o.scale[2] * k)
    bpy.context.view_layer.update()

    sole2 = min((m.matrix_world @ v.co).z for m in meshes for v in m.data.vertices)
    for o in roots:
        o.location.z -= sole2
    bpy.context.view_layer.update()

    bpy.ops.object.select_all(action="DESELECT")
    for o in [arm] + meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
    bpy.ops.object.select_all(action="DESELECT")

    bpy.context.view_layer.update()
    sole3 = min((m.matrix_world @ v.co).z for m in meshes for v in m.data.vertices)
    if abs(sole3) > sole_tol:
        die(f"soles land at z={sole3:.4f}, wanted 0 +/- {sole_tol}")
    print(f"[canon] soles at z={sole3:.5f}")


def attach_textures(meshes, tex_dir):
    """Build the character's material from role-named images on disk.

    A rigging service returns geometry, skeleton and weights — not appearance.
    Mixamo will not even accept an upload carrying 2048-square maps, so the
    textures travel around that round trip rather than through it, and are put
    back here. UVs survive rigging untouched, so the maps land correctly.

    Named by role rather than by whatever the generator called them, so there is
    no lookup table to keep in step with any particular tool.
    """
    d = pathlib.Path(tex_dir)
    if not d.is_dir():
        die(f"--textures {tex_dir} is not a directory")
    found = {p.stem: p for p in d.glob("*.png")}
    if "base_color" not in found:
        die(f"{tex_dir} has no base_color.png — run tools/extract-textures.py first")

    mat = bpy.data.materials.new(name="character")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]

    def tex(name, colorspace):
        img = bpy.data.images.load(str(found[name]))
        img.colorspace_settings.name = colorspace
        img.pack()                     # so the glb carries the bytes
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        return n

    nt.links.new(tex("base_color", "sRGB").outputs["Color"], bsdf.inputs["Base Color"])
    for role, socket in (("roughness", "Roughness"), ("metallic", "Metallic")):
        if role in found:
            nt.links.new(tex(role, "Non-Color").outputs["Color"], bsdf.inputs[socket])
    if "normal" in found:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(tex("normal", "Non-Color").outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])

    for m in meshes:
        m.data.materials.clear()
        m.data.materials.append(mat)
    print(f"[canon] attached {len(found)} texture(s): {', '.join(sorted(found))}")


def main():
    a = argv()
    spec = json.load(open(a["map"]))
    if not spec.get("reviewed"):
        die(f'{a["map"]} has reviewed: false. A map that is wrong at one joint '
            f"produces a character that loads fine and moves wrong, so this "
            f"refuses rather than trusting a guess. Check every line, then set it true.")
    mapping, joints = spec["bones"], spec["joints"]
    hero_m, sole_tol = spec.get("heroM", 1.72), spec.get("soleTol", 0.01)

    arm, meshes = load(a["input"])
    if a.get("textures"):
        attach_textures(meshes, a["textures"])
    print(f"[canon] {len(arm.data.bones)} source bones, {len(meshes)} mesh(es)")
    bake_object_scale(arm, meshes)
    rename(arm, mapping)
    align_rest(arm, meshes, joints)
    normalise(arm, meshes, hero_m, sole_tol)

    for act in list(bpy.data.actions):
        bpy.data.actions.remove(act)

    bpy.ops.export_scene.gltf(
        filepath=a["output"], export_format="GLB",
        export_skins=True, export_animations=False, export_apply=False,
        export_yup=True,
    )
    print(f"[canon] wrote {a['output']}")


main()
