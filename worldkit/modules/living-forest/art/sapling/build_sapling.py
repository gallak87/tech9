"""Build the canonical Sapling forest family in an isolated Blender process.

Sapling Tree Gen 1.0.0 supplies all growth curves. This recipe samples them
into bounded near/far game meshes, adds metre-scaled bark UVs, and seats the
canonical Living Forest foliage spray on actual grown branch points.

Run in Blender 5.2+ with Sapling enabled in the user_default extension profile:
  blender -b --factory-startup --python modules/living-forest/art/sapling/build_sapling.py
"""

import addon_utils
import bpy
import hashlib
import json
import math
import sys
from pathlib import Path
from mathutils import Vector
from mathutils.geometry import interpolate_bezier

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE))
from foliage import Surface, sprays
ASSETS = HERE.parent.parent / "assets"
addon_utils.enable("bl_ext.user_default.sapling_tree_gen", default_set=False)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
BASE = json.loads((HERE / "settings.json").read_text())
RECIPES = json.loads((HERE / "variants.json").read_text())




def material(name, texture, leaf=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bs = mat.node_tree.nodes.get("Principled BSDF")
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(ASSETS / texture), check_existing=True)
    color = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    color.layer_name = "Color"
    mix = mat.node_tree.nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1
    mat.node_tree.links.new(tex.outputs["Color"], mix.inputs[1])
    mat.node_tree.links.new(color.outputs["Color"], mix.inputs[2])
    mat.node_tree.links.new(mix.outputs[0], bs.inputs["Base Color"])
    bs.inputs["Roughness"].default_value = .9
    if leaf:
        mat.node_tree.links.new(tex.outputs["Alpha"], bs.inputs["Alpha"])
        mat.surface_render_method = "DITHERED"
        mat.use_backface_culling = False
    return mat


WOOD_MAT = material("Sapling / shared weathered bark", "silver-bark-color-v1.png")
LEAF_MAT = material("Sapling / shared attached sprays", "leaf-spray-v1.png", True)


def grow(recipe, label):
    settings = {**BASE, **recipe}
    bpy.ops.curve.tree_add(**settings)
    source = bpy.context.view_layer.objects.active
    if source.get("sapling_role") != "tree":
        source = next(ob for ob in bpy.context.scene.objects
                      if ob.get("sapling_role") == "tree" and ob.name.startswith("tree"))
    source.name = label + "_LiveSapling"
    source.hide_render = source.hide_viewport = True
    curves_ob = next(ob for ob in source.children_recursive if ob.get("sapling_role") == "tree_curves")
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
    for ob in source.children_recursive:
        ob.hide_render = ob.hide_viewport = True
    return source, curves


def crown_point(p):
    # Transform the grown skeleton into a bough, then sweep circular sections
    # around its new directions. In exported Y-up space it grows toward +X.
    # A low-forking oak spreads laterally instead of becoming a narrow feather
    # when the consumer seats several leaders around an ancient trunk.
    # Preserve the grown forks, but saturate distal leader progress and long
    # secondary limbs into a round oak envelope instead of three spear tips.
    z = p.z if p.z <= 45 else 45 + 30 * (1 - math.exp(-(p.z - 45) / 30))
    x, y = 58 * math.tanh(p.x / 58), 58 * math.tanh(p.y / 58)
    # Orthogonal growth/radial bases retain the source crown's 3D volume.
    # Adding both axes in the same direction collapses an oak into a leaf fan.
    return Vector((z * .78 + x * .625, y * 1.1,
                   z * .625 - x * .78))


def samples(curve, detail, crown=False):
    r0 = curve["r"][0]
    steps = 1 if detail == "far" else 3 if r0 > 1.8 else 2 if r0 > .6 else 1
    centers, radii = [], []
    for j in range(len(curve["p"]) - 1):
        points = interpolate_bezier(curve["p"][j], curve["right"][j],
                                    curve["left"][j + 1], curve["p"][j + 1], steps + 1)
        for k in range(steps):
            p = points[k]
            centers.append(crown_point(p) if crown else p)
            radii.append(curve["r"][j] + (curve["r"][j + 1] - curve["r"][j]) * k / steps)
    p = curve["p"][-1]
    centers.append(crown_point(p) if crown else p)
    radii.append(max(.009, curve["r"][-1]))
    if detail == "far":
        centers, radii = simplify(centers, radii, .3)
    return centers, radii


def simplify(points, radii, tolerance):
    """Keep curvature and radius shoulders, omit subpixel straight samples."""
    keep = {0, len(points) - 1}
    pending = [(0, len(points) - 1)]
    while pending:
        first, last = pending.pop()
        edge = points[last] - points[first]
        length_squared = max(1e-12, edge.length_squared)
        worst, selected = 1, None
        for j in range(first + 1, last):
            t = max(0, min(1, (points[j] - points[first]).dot(edge) / length_squared))
            position_error = (points[j] - (points[first] + edge * t)).length / tolerance
            radius_error = abs(radii[j] - (radii[first] + (radii[last] - radii[first]) * t)) / .15
            error = max(position_error, radius_error)
            if error > worst:
                worst, selected = error, j
        if selected is not None:
            keep.add(selected)
            pending.extend([(first, selected), (selected, last)])
    order = sorted(keep)
    return [points[j] for j in order], [radii[j] for j in order]


def sweep(surface, curve, detail, crown=False):
    r0 = curve["r"][0]
    if detail == "far" and r0 < .2:
        return
    if detail == "far":
        sides = 8 if r0 > 1.8 else 6 if r0 > .6 else 4
    else:
        sides = 12 if r0 > 1.8 else 8 if r0 > .6 else 6 if r0 > .16 else 4
    centers, radii = samples(curve, detail, crown)
    distance, normal, previous = 0, None, None
    for j, (center, r) in enumerate(zip(centers, radii)):
        tangent = centers[min(j + 1, len(centers) - 1)] - centers[max(0, j - 1)]
        tangent.normalize()
        if normal is None:
            normal = tangent.cross(Vector((0, 1, 0)))
            if normal.length < .01:
                normal = tangent.cross(Vector((1, 0, 0)))
        normal = (normal - tangent * normal.dot(tangent)).normalized()
        binormal = tangent.cross(normal).normalized()
        if j:
            distance += (center - centers[j - 1]).length
        ring = []
        for side in range(sides + 1):
            a = side * math.tau / sides
            ridge = math.sin(a * (3 if detail == "far" else 5) + distance * .055 + curve["index"] * .31)
            relief = 1 + (.065 if r0 > .6 else .025) * ridge
            offset = normal * math.cos(a) + binormal * math.sin(a)
            tint = .84 + .12 * (.5 + .5 * ridge)
            ring.append(surface.vertex(center + offset * r * relief,
                                       (side / sides * max(1, math.tau * r0 / 6.5), distance / 6.5),
                                       (tint * .97, tint, tint * .94, 1)))
        if previous:
            for side in range(sides):
                surface.faces.append((previous[side], previous[side + 1], ring[side + 1], ring[side]))
        else:
            cap(surface, ring, center, sides, True)
        previous = ring
    cap(surface, previous, centers[-1], sides, False)


def cap(surface, ring, center, sides, reverse):
    c = surface.vertex(center, (.5, .5))
    for side in range(sides):
        surface.faces.append((c, ring[side + 1], ring[side]) if reverse else (c, ring[side], ring[side + 1]))


def foliage_sites(curves, crown=False):
    sites = []
    for curve in curves:
        centers, _ = samples(curve, "near", crown)
        length = sum((b - a).length for a, b in zip(centers, centers[1:]))
        if length <= 2:
            continue
        if curve["r"][0] >= (.95 if crown else .65):
            # Living leaders finish in attached terminal growth; do not leave
            # the giant's tallest trunk ends as bare pointed poles above its roof.
            if crown and curve["r"][-1] < max(.15, curve["r"][0] * .12):
                sites.append((centers[-1], (centers[-1] - centers[max(0, len(centers) - 3)]).normalized(), curve["index"]))
            continue
        sites.append((centers[-1], (centers[-1] - centers[max(0, len(centers) - 3)]).normalized(), curve["index"]))
        if length > 6:
            at = max(1, int(len(centers) * .67))
            sites.append((centers[at], (centers[min(at + 1, len(centers) - 1)] - centers[at - 1]).normalized(), curve["index"] + 1000))
    return sites




exports, stats = [], []
for ordinal, record in enumerate(RECIPES["groves"] + [RECIPES["crown"]]):
    label, crown = record["name"], record["name"] == "Crown"
    source, curves = grow(record["settings"], label)
    sites = foliage_sites(curves, crown)
    source.location.x = ordinal * 230
    spray_scale = record.get("sprayScale", 1)
    counts = {"name": label, "seed": record["settings"]["seed"], "saplingCurves": len(curves), "foliageSites": len(sites), "sprayScale": spray_scale}
    for detail in (["near"] if crown else ["near", "far"]):
        wood, leaves = Surface(), Surface()
        for curve in curves:
            sweep(wood, curve, detail, crown)
        sprays(leaves, sites, detail, spray_scale)
        suffix = "" if crown else detail.title()
        for kind, surface, mat in [("Wood", wood, WOOD_MAT), ("Leaves", leaves, LEAF_MAT)]:
            ob = surface.object(f"{label}_{kind}{suffix}")
            ob.location = (ordinal * 230, 230 if detail == "far" else 0, 0)
            ob.data.materials.append(mat)
            exports.append(ob)
            counts[f"{kind.lower()}{suffix}Triangles"] = surface.triangles
    stats.append(counts)

# The source blend presents near/far variants in separate rows. Exported nodes
# are all local-origin prototypes, and borrow the consumer's canonical images.
bpy.ops.object.select_all(action="DESELECT")
for ob in exports:
    ob.select_set(True)
bpy.context.view_layer.objects.active = exports[0]
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "sapling-forest.blend"))
bpy.ops.file.make_paths_relative()
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "sapling-forest.blend"))
for ob in exports:
    ob.location = (0, 0, 0)
    ob.data.materials.clear()
output = ASSETS / "sapling-forest-v1.glb"
bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", use_selection=True,
                          export_yup=True, export_apply=True, export_materials="NONE", export_extras=False,
                          export_attributes=True,
                          export_vertex_color="ACTIVE", export_all_vertex_colors=True)
manifest = {"generator": "Sapling Tree Gen 1.0.0", "blender": bpy.app.version_string,
            "variants": stats, "glbBytes": output.stat().st_size,
            "glbSHA256": hashlib.sha256(output.read_bytes()).hexdigest()}
(HERE / "asset.json").write_text(json.dumps(manifest, indent=2) + "\n")
provenance_path = ASSETS / "provenance.json"
provenance = json.loads(provenance_path.read_text())
provenance["assets"] = [r for r in provenance["assets"] if r["file"] != output.name]
provenance["assets"].append({
    "file": output.name, "type": "generated-tree-family", "source": "Sapling Tree Gen 1.0.0 in Blender 5.2.3 LTS; adapted Coast Live Oak growth recipes.",
    "toolURL": "https://extensions.blender.org/add-ons/sapling-tree-gen/", "toolLicense": "GPL-3.0-or-later",
    "toolArchiveSHA256": "65a1ae7ab3a73a675a2de7370e27a6186e889f2e396fd27af0a44666bc3b9a9a",
    "presetAttribution": "Coast Live Oak preset by Brad Chamberlain (2026), GPL-3.0-only.",
    "sourceRecipe": "../art/sapling/build_sapling.py", "settings": ["../art/sapling/settings.json", "../art/sapling/variants.json"],
    "editableSource": "../art/sapling/sapling-forest.blend", "bytes": manifest["glbBytes"], "sha256": manifest["glbSHA256"],
    "variants": stats, "textures": ["silver-bark-color-v1.png", "leaf-spray-v1.png"],
    "notes": "Four near/far grove trees and one outward-growing crown bough. All skeletons grown with Sapling; original adaptive export mesh recipe. No embedded images or imported third-party tree meshes."
})
provenance_path.write_text(json.dumps(provenance, indent=2) + "\n")
print(json.dumps(manifest, indent=2))
