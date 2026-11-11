"""Build one review-only Sapling oak in an isolated Blender process.

Requires Sapling Tree Gen 1.0.0, enabled in the Blender profile. Growth comes
from Sapling; this export recipe resamples its curves for bounded game meshes,
adds metre-scaled bark UVs and attaches the canonical Living Forest spray image.
Run from Worldkit: blender -b --factory-startup --python
modules/living-forest/art/sapling/build_sapling.py
"""

import addon_utils
import bpy
import hashlib
import json
import math
import random
from pathlib import Path
from mathutils import Vector
from mathutils.geometry import interpolate_bezier

HERE = Path(__file__).resolve().parent
MODULE = HERE.parent.parent
ASSETS = MODULE / "assets"
addon_utils.enable("bl_ext.user_default.sapling_tree_gen", default_set=False)

# This script is only run with --factory-startup in an isolated process.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
settings = json.loads((HERE / "settings.json").read_text())
bpy.ops.curve.tree_add(**settings)
source = bpy.data.objects["tree"]
source.name = "SaplingSource"
curves = bpy.data.objects["tree_curves"].data


class Surface:
    def __init__(self):
        self.positions, self.faces, self.uvs, self.colors = [], [], [], []

    def vertex(self, p, uv, color=(1, 1, 1, 1)):
        self.positions.append(tuple(p))
        self.uvs.append(tuple(uv))
        self.colors.append(tuple(color))
        return len(self.positions) - 1

    def object(self, name):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.positions, [], self.faces)
        mesh.update()
        uv = mesh.uv_layers.new(name="UVMap")
        for loop in mesh.loops:
            uv.data[loop.index].uv = self.uvs[loop.vertex_index]
        color = mesh.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="POINT")
        for i, value in enumerate(self.colors):
            color.data[i].color = value
        ob = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(ob)
        for face in mesh.polygons:
            face.use_smooth = True
        return ob


wood, foliage = Surface(), Surface()
leaf_sites = []
curve_guides = []
for index, spline in enumerate(curves.curves):
    first, count = spline.first_point_index, spline.points_length
    if count < 2:
        continue
    p = [Vector(curves.position_data[first + i].vector) for i in range(count)]
    left = [Vector(curves.attributes["handle_left"].data[first + i].vector) for i in range(count)]
    right = [Vector(curves.attributes["handle_right"].data[first + i].vector) for i in range(count)]
    radius = [curves.attributes["radius"].data[first + i].value for i in range(count)]
    steps = 4 if radius[0] > 1.2 else 3 if radius[0] > .3 else 2
    sides = 16 if radius[0] > 1.8 else 12 if radius[0] > .6 else 8 if radius[0] > .16 else 6
    centers, radii = [], []
    for j in range(count - 1):
        samples = interpolate_bezier(p[j], right[j], left[j + 1], p[j + 1], steps + 1)
        for k in range(steps):
            centers.append(samples[k])
            radii.append(radius[j] + (radius[j + 1] - radius[j]) * k / steps)
    centers.append(p[-1])
    radii.append(max(.009, radius[-1]))
    distance = 0
    normal = None
    rings = []
    for j, (center, r) in enumerate(zip(centers, radii)):
        tangent = (centers[min(j + 1, len(centers) - 1)] - centers[max(0, j - 1)]).normalized()
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
            a = side * 2 * math.pi / sides
            ridge = math.sin(a * 5 + distance * .055 + index * .31)
            relief = 1 + (.075 if radius[0] > .6 else .035) * ridge
            offset = normal * math.cos(a) + binormal * math.sin(a)
            tint = .84 + .12 * (.5 + .5 * ridge)
            ring.append(wood.vertex(center + offset * r * relief,
                                    (side / sides * max(1, 2 * math.pi * radius[0] / 6.5), distance / 6.5),
                                    (tint * .97, tint, tint * .94, 1)))
        if rings:
            for side in range(sides):
                wood.faces.append((rings[-1][side], rings[-1][side + 1], ring[side + 1], ring[side]))
        rings.append(ring)
    # Close tips and bury the base cap in its parent. Keep the original grown
    # skeleton: no additional runtime growth or geometry is involved.
    for ring, center, reverse in [(rings[0], centers[0], True), (rings[-1], centers[-1], False)]:
        c = wood.vertex(center, (0, distance / 6.5))
        for side in range(sides):
            wood.faces.append((c, ring[side + 1], ring[side]) if reverse else (c, ring[side], ring[side + 1]))
    curve_guides.append({"index": index, "baseRadius": radius[0], "points": len(centers)})
    if radius[0] < .65 and distance > 2:
        leaf_sites.append((centers[-1], (centers[-1] - centers[-3]).normalized(), index))
        if distance > 6:
            at = max(1, int(len(centers) * .67))
            leaf_sites.append((centers[at], (centers[min(at + 1, len(centers) - 1)] - centers[at - 1]).normalized(), index + 1000))

for anchor, direction, index in leaf_sites:
    rng = random.Random(1709 + index)
    length = 7.5 + rng.random() * 3
    width = length * (.78 + rng.random() * .2)
    forward = (direction + Vector((0, 0, .22))).normalized()
    side = forward.cross(Vector((0, 0, 1)))
    if side.length < .01:
        side = Vector((1, 0, 0))
    side.normalize()
    up = side.cross(forward).normalized()
    # Three crossed, gently bent full-image sprays; every card starts on the
    # Sapling branch that actually carries it.
    for tilt in [-.65, .65, 0]:
        lateral = side * math.cos(tilt) + up * math.sin(tilt)
        rows = []
        for row in range(3):
            t = row / 2
            center = anchor + forward * (t * length) + up * (math.sin(t * math.pi) * .65)
            tint = .88 + rng.random() * .12
            rows.append([foliage.vertex(center + lateral * ((s - .5) * width), (s, t),
                                         (tint * .96, tint, tint * .97, 1)) for s in [0, 1]])
            if row:
                foliage.faces.append((rows[-2][0], rows[-2][1], rows[-1][1], rows[-1][0]))

wood_ob = wood.object("SaplingWood")
leaf_ob = foliage.object("SaplingLeaves")
# The source remains live in the .blend for inspection/regeneration. Exports
# contain only the two bounded mesh objects, with no duplicated texture payload.
source.hide_render = True
source.hide_viewport = True
for ob in source.children_recursive:
    ob.hide_render = True
    ob.hide_viewport = True


def material(name, texture, leaf=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bs = mat.node_tree.nodes.get("Principled BSDF")
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(ASSETS / texture), check_existing=True)
    vertex = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    vertex.layer_name = "Color"
    mix = mat.node_tree.nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1
    mat.node_tree.links.new(tex.outputs["Color"], mix.inputs[1])
    mat.node_tree.links.new(vertex.outputs["Color"], mix.inputs[2])
    mat.node_tree.links.new(mix.outputs[0], bs.inputs["Base Color"])
    bs.inputs["Roughness"].default_value = .9
    if leaf:
        mat.node_tree.links.new(tex.outputs["Alpha"], bs.inputs["Alpha"])
        mat.surface_render_method = "DITHERED"
        mat.use_backface_culling = False
    return mat


wood_ob.data.materials.append(material("Study bark", "silver-bark-color-v1.png"))
leaf_ob.data.materials.append(material("Study leaves", "leaf-spray-v1.png", True))
bpy.ops.object.select_all(action="DESELECT")
for ob in [wood_ob, leaf_ob]:
    ob.select_set(True)
bpy.context.view_layer.objects.active = wood_ob
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "sapling-oak-study.blend"))
bpy.ops.file.make_paths_relative()
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "sapling-oak-study.blend"))
# Material treatment is supplied by the consumer, retaining the same palette
# and borrowed images as the existing trees for this controlled comparison.
for ob in [wood_ob, leaf_ob]:
    ob.data.materials.clear()
bpy.ops.export_scene.gltf(filepath=str(ASSETS / "sapling-oak-study-v1.glb"),
                          export_format="GLB", use_selection=True,
                          export_yup=True, export_apply=True,
                          export_materials="NONE", export_extras=False,
                          export_vertex_color="ACTIVE", export_all_vertex_colors=True)
stats = {
    "generator": "Sapling Tree Gen 1.0.0", "seed": settings["seed"],
    "saplingCurves": len(curve_guides), "foliageSites": len(leaf_sites),
    "woodTriangles": sum(len(f) - 2 for f in wood.faces),
    "leafTriangles": sum(len(f) - 2 for f in foliage.faces),
    "glbBytes": (ASSETS / "sapling-oak-study-v1.glb").stat().st_size,
    "glbSHA256": hashlib.sha256((ASSETS / "sapling-oak-study-v1.glb").read_bytes()).hexdigest(),
}
(HERE / "asset.json").write_text(json.dumps(stats, indent=2) + "\n")
provenance_path = ASSETS / "provenance.json"
provenance = json.loads(provenance_path.read_text())
for record in provenance["assets"]:
    if record["file"] == "sapling-oak-study-v1.glb":
        record.update(bytes=stats["glbBytes"], sha256=stats["glbSHA256"],
                      woodTriangles=stats["woodTriangles"], leafTriangles=stats["leafTriangles"])
provenance_path.write_text(json.dumps(provenance, indent=2) + "\n")
print(json.dumps(stats, indent=2))
