"""Add fresh Sapling fine branches and attached foliage to a baked solid oak.

Run only after reviewing the bare wood form. In Blender 5.2+ with Sapling 1.0.0:
  blender -b --factory-startup --python build_canopy.py -- \
    --blend consumer/ancient-oak-v1.blend --shape shape.json --canopy canopy.json

The shape is reusable Worldkit source; the blend/GLB and its carved passage are
consumer-owned. No legacy hollow generator or old crown geometry is loaded.
"""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import random
import sys
import time

import addon_utils
import bpy
from mathutils import Matrix, Vector
from mathutils.geometry import interpolate_bezier


HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


WOOD = load_module("worldkit_ancient_oak_source", HERE / "build_ancient_oak.py")
FOLIAGE = load_module("worldkit_tree_foliage", HERE.parent / "sapling" / "foliage.py")


def arguments():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--blend", type=Path, required=True)
    parser.add_argument("--shape", type=Path, default=HERE / "shape.json")
    parser.add_argument("--canopy", type=Path, default=HERE / "canopy.json")
    return parser.parse_args(argv)


def move_to(ob, collection):
    for owner in list(ob.users_collection):
        owner.objects.unlink(ob)
    collection.objects.link(ob)


def grow(settings, label, collection):
    before = set(bpy.data.objects)
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.curve.tree_add(**settings)
    created = set(bpy.data.objects) - before
    source = next(ob for ob in created if ob.get("sapling_role") == "tree")
    source.name = label + "_LiveSapling"
    curves_ob = next(ob for ob in source.children_recursive
                     if ob.get("sapling_role") == "tree_curves")
    data = curves_ob.data
    curves = []
    for index, spline in enumerate(data.curves):
        first, count = spline.first_point_index, spline.points_length
        if count < 2:
            continue
        curves.append({
            "index": index,
            "p": [Vector(data.position_data[first + i].vector) for i in range(count)],
            "left": [Vector(data.attributes["handle_left"].data[first + i].vector) for i in range(count)],
            "right": [Vector(data.attributes["handle_right"].data[first + i].vector) for i in range(count)],
            "r": [data.attributes["radius"].data[first + i].value for i in range(count)],
        })
    for ob in created:
        move_to(ob, collection)
        ob.hide_render = ob.hide_viewport = True
    return source, curves, data


def curve_samples(curve):
    points, radii = [], []
    steps = 3 if curve["r"][0] > .8 else 2
    for index in range(len(curve["p"]) - 1):
        segment = interpolate_bezier(curve["p"][index], curve["right"][index],
                                     curve["left"][index + 1], curve["p"][index + 1], steps + 1)
        for step in range(steps):
            points.append(segment[step])
            radii.append(curve["r"][index] +
                         (curve["r"][index + 1] - curve["r"][index]) * step / steps)
    points.append(curve["p"][-1])
    radii.append(max(.008, curve["r"][-1]))
    return points, radii


def simplify(points, radii, position_tolerance, radius_tolerance):
    keep, pending = {0, len(points) - 1}, [(0, len(points) - 1)]
    while pending:
        first, last = pending.pop()
        edge = points[last] - points[first]
        length_squared = max(1e-12, edge.length_squared)
        worst, selected = 1, None
        for index in range(first + 1, last):
            t = max(0, min(1, (points[index] - points[first]).dot(edge) / length_squared))
            error = max((points[index] - (points[first] + edge * t)).length / position_tolerance,
                        abs(radii[index] - (radii[first] + (radii[last] - radii[first]) * t)) / radius_tolerance)
            if error > worst:
                worst, selected = error, index
        if selected is not None:
            keep.add(selected)
            pending.extend([(first, selected), (selected, last)])
    indices = sorted(keep)
    return [points[i] for i in indices], [radii[i] for i in indices]


def sites_for_cluster(curves, rotation, anchor, count, ordinal, root_radius):
    candidates = []
    for curve in curves:
        points, _ = curve_samples(curve)
        if sum((b - a).length for a, b in zip(points, points[1:])) < 2:
            continue
        # Endpoints keep every grown leader alive. Intermediate sites on fine
        # branches make broad sprays overlap into a roof rather than tip balls.
        fractions = [1, .67, .4, .85] if curve["r"][0] < root_radius * .4 else [1]
        for candidate_index, fraction in enumerate(fractions):
            at = max(1, min(len(points) - 1, round((len(points) - 1) * fraction)))
            direction = points[min(at + 1, len(points) - 1)] - points[max(0, at - 1)]
            if direction.length < .001:
                continue
            world = rotation @ points[at] + anchor
            candidate_id = ordinal * 10000 + curve["index"] * 8 + candidate_index
            candidates.append((world, rotation @ direction.normalized(), candidate_id))
    if not candidates:
        raise ValueError("Sapling canopy produced no usable attached spray sites")
    # Spatially spread a bounded set while retaining deterministic source IDs.
    selected = [max(range(len(candidates)), key=lambda i: candidates[i][0].z)]
    remaining = set(range(len(candidates))) - set(selected)
    while remaining and len(selected) < count:
        best = max(remaining, key=lambda i: min((candidates[i][0] - candidates[j][0]).length_squared
                                               for j in selected))
        selected.append(best)
        remaining.remove(best)
    return [candidates[i] for i in selected]


def leaf_material():
    mat = bpy.data.materials.new("AncientOak / shared cutout sprays")
    mat.use_nodes = True
    bs = mat.node_tree.nodes.get("Principled BSDF")
    texture = mat.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(HERE.parent.parent / "assets" / "leaf-spray-v1.png"), check_existing=True)
    color = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    color.layer_name = "Color"
    mix = mat.node_tree.nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1
    mat.node_tree.links.new(texture.outputs["Color"], mix.inputs[1])
    mat.node_tree.links.new(color.outputs["Color"], mix.inputs[2])
    mat.node_tree.links.new(mix.outputs[0], bs.inputs["Base Color"])
    mat.node_tree.links.new(texture.outputs["Alpha"], bs.inputs["Alpha"])
    bs.inputs["Roughness"].default_value = .9
    mat.surface_render_method = "DITHERED"
    mat.use_backface_culling = False
    return mat


def main():
    args, start = arguments(), time.monotonic()
    shape, recipe = json.loads(args.shape.read_text()), json.loads(args.canopy.read_text())
    metadata_path = args.blend.with_suffix(".json")
    metadata = json.loads(metadata_path.read_text())
    shape_hash = hashlib.sha256(args.shape.read_bytes()).hexdigest()
    if metadata.get("shapeSHA256") != shape_hash:
        raise ValueError("Bare blend and shape recipe do not match; rebuild and inspect the bare form first")
    terminals = [path for path in shape["paths"] if "buttress" not in path["name"].lower()]
    if not terminals:
        raise ValueError("Canopy needs non-buttress shape paths with terminal attachments")
    bpy.ops.wm.open_mainfile(filepath=str(args.blend.resolve()))
    bpy.context.preferences.filepaths.save_version = 0
    addon_utils.enable("bl_ext.user_default.sapling_tree_gen", default_set=False)
    sources = bpy.data.collections.get("Editable growth and passage sources")
    finished = bpy.data.collections.get("Runtime ancient oak")
    if not sources or not finished:
        raise ValueError("Blend must contain the baked ancient oak source and runtime collections")
    # Existing bare skins remain intact. A repeated canopy bake replaces only
    # the explicitly owned fine-growth collection and its two runtime meshes.
    previous = bpy.data.collections.get("Editable ancient oak fine canopy")
    if previous:
        for ob in list(previous.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.collections.remove(previous)
    for name in ["AncientOak_Twigs", "AncientOak_Leaves"]:
        if name in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    canopy_sources = bpy.data.collections.new("Editable ancient oak fine canopy")
    bpy.context.scene.collection.children.link(canopy_sources)
    base_path = (args.canopy.parent / recipe["baseSettings"]).resolve()
    base = json.loads(base_path.read_text())
    bark = bpy.data.objects["AncientOak_Bark"].data.materials[0]
    twigs, leaves, records = [], FOLIAGE.Surface(), []
    for ordinal, path in enumerate(terminals):
        seed = recipe["seed"] + ordinal * recipe["seedStep"]
        rng = random.Random(seed)
        scale = rng.uniform(*recipe["scaleRange"])
        ratio = rng.uniform(*recipe["ratioRange"])
        settings = {**base, **recipe["settings"], "seed": seed, "scale": scale, "scaleV": 0, "ratio": ratio}
        source, curves, source_data = grow(settings, f"AncientOak fine cluster {ordinal + 1:02}", canopy_sources)
        nodes = path.get("points", path.get("nodes"))
        axis_yup = (Vector(nodes[-1]["point"]) - Vector(nodes[-2]["point"])).normalized()
        anchor_yup = Vector(nodes[-2]["point"]) - axis_yup * recipe.get("rootInset", 0)
        anchor, axis = WOOD.xyz(anchor_yup), WOOD.xyz(axis_yup)
        rotation = Vector((0, 0, 1)).rotation_difference(axis)
        root_radius = max(curve["r"][0] for curve in curves)
        radius_factor = min(recipe.get("maximumRadiusScale", 3),
                            nodes[-2]["radius"] * recipe.get("targetRootRadiusFraction", .45) / root_radius,
                            nodes[-2]["radius"] * recipe["rootRadiusFraction"] / root_radius)
        actual_root_radius = root_radius * radius_factor
        for curve in curves:
            curve["r"] = [r * radius_factor for r in curve["r"]]
        for radius in source_data.attributes["radius"].data:
            radius.value *= radius_factor
        source.matrix_world = Matrix.Translation(anchor) @ rotation.to_matrix().to_4x4()
        source["canopySeed"] = seed
        source["parentPath"] = path["name"]
        source["radiusFactor"] = radius_factor
        source["parentRadius"] = nodes[-2]["radius"]
        for curve in curves:
            if curve["r"][0] < recipe["minimumTwigRadius"]:
                continue
            points, radii = curve_samples(curve)
            if sum((b - a).length for a, b in zip(points, points[1:])) < 1:
                continue
            points, radii = simplify(points, radii, recipe["curveTolerance"], recipe["radiusTolerance"])
            samples = [{"center": rotation @ point + anchor, "radius": radius}
                       for point, radius in zip(points, radii)]
            sides = 6 if radii[0] > .7 else 4
            twigs.append(WOOD.sweep(f"Fine branch {ordinal + 1:02}/{curve['index']}", samples,
                                    sides, shape.get("barkTile", 6.5), canopy_sources, [bark]))
        sites = sites_for_cluster(curves, rotation, anchor, recipe["spraysPerCluster"], ordinal, actual_root_radius)
        FOLIAGE.sprays(leaves, sites, "near", recipe["sprayScale"])
        records.append({"parentPath": path["name"], "seed": seed, "scale": scale, "ratio": ratio,
                        "parentRadius": nodes[-2]["radius"], "rootRadius": actual_root_radius,
                        "anchor": tuple(anchor_yup), "axis": tuple(axis_yup),
                        "curves": len(curves), "sprays": len(sites)})
        print(f"Fine cluster {ordinal + 1}/{len(terminals)}: {len(curves)} curves, {len(sites)} sprays", flush=True)
    twig_mesh = WOOD.joined_copy(twigs, "AncientOak_Twigs", finished)
    twig_mesh.data.name = "AncientOak_Twigs"
    WOOD.decimate(twig_mesh, recipe["targetTwigTriangles"])
    leaf_mesh = leaves.object("AncientOak_Leaves")
    move_to(leaf_mesh, finished)
    leaf_mesh.data.materials.append(leaf_material())
    canopy_triangles = WOOD.triangles(twig_mesh) + leaves.triangles
    if canopy_triangles > recipe["maximumCanopyTriangles"]:
        raise ValueError(f"Canopy exceeded its triangle budget: {canopy_triangles}")
    canopy_sources.hide_render = canopy_sources.hide_viewport = True
    bpy.context.scene["canopyRecipe"] = str(args.canopy.resolve())
    bpy.ops.file.make_paths_relative()
    bpy.ops.wm.save_as_mainfile(filepath=str(args.blend.resolve()), compress=True)
    outputs = [bpy.data.objects[name] for name in ["AncientOak_Bark", "AncientOak_Heartwood", "AncientOak_Twigs", "AncientOak_Leaves"]]
    bpy.ops.object.select_all(action="DESELECT")
    for ob in outputs:
        ob.hide_set(False)
        ob.select_set(True)
        ob.data.materials.clear()
    bpy.context.view_layer.objects.active = outputs[0]
    output = args.blend.with_suffix(".glb")
    bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", use_selection=True,
                              export_yup=True, export_apply=True, export_materials="NONE", export_extras=False,
                              export_attributes=True, export_vertex_color="ACTIVE", export_all_vertex_colors=True)
    metadata.update({"canopyGenerator": "Sapling Tree Gen 1.0.0 / new native fine-branch graphs",
                     "canopyRecipe": args.canopy.name,
                     "canopyRecipeSHA256": hashlib.sha256(args.canopy.read_bytes()).hexdigest(),
                     "canopyClusters": records,
                     "canopyTriangles": canopy_triangles,
                     "foliageSprays": sum(record["sprays"] for record in records),
                     "meshes": [{"name": ob.name, "triangles": WOOD.triangles(ob)} for ob in outputs],
                     "glbBytes": output.stat().st_size,
                     "glbSHA256": hashlib.sha256(output.read_bytes()).hexdigest(),
                     "canopyBuildSeconds": round(time.monotonic() - start, 2)})
    metadata["triangles"]["bareFinal"] = metadata["triangles"].get("bareFinal", metadata["triangles"]["final"])
    metadata["triangles"]["final"] = sum(WOOD.triangles(ob) for ob in outputs)
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps({"canopyTriangles": canopy_triangles, "foliageSprays": metadata["foliageSprays"],
                      "glbSHA256": metadata["glbSHA256"]}, indent=2), flush=True)


if __name__ == "__main__":
    main()
