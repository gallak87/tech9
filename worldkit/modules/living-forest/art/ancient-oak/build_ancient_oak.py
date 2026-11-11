"""Bake a joined old-growth tree and an optional consumer-owned carved passage.

Blender 5.2+: blender -b --factory-startup --python build_ancient_oak.py -- \
  --shape shape.json --passage consumer-clearance.json --output /path/tree-v1

Shape and passage coordinates are local metres, +Y up. The source blend retains
the individual growth sweeps and cutter; the runtime GLB contains only the final
wood skins and no materials/images. Foliage is deliberately a separate asset.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import time

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform


HERE = Path(__file__).resolve().parent


def arguments():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shape", type=Path, default=HERE / "shape.json")
    parser.add_argument("--passage", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args(argv)


def xyz(value):
    """Right-handed source Y-up -> Blender Z-up; glTF reverses this on export."""
    x, y, z = value
    return Vector((x, -z, y))


def activate(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def apply(ob, modifier):
    activate(ob)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1)
    principled.inputs["Roughness"].default_value = .9
    return mat


def mesh_object(name, points, faces, uvs, collection, materials, slot=0):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name="UVMap")
    for loop in mesh.loops:
        uv.data[loop.index].uv = uvs[loop.vertex_index]
    for mat in materials:
        mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        polygon.material_index = slot
    ob = bpy.data.objects.new(name, mesh)
    collection.objects.link(ob)
    return ob


def catmull_points(nodes, spacing):
    controls = [xyz(node["point"]) for node in nodes]
    if len(controls) < 2 or any(node["radius"] <= 0 for node in nodes):
        raise ValueError("Every tree path needs two points and positive radii")
    output = []
    for i in range(len(controls) - 1):
        a, b = controls[i], controls[i + 1]
        p = controls[max(0, i - 1)]
        q = controls[min(len(controls) - 1, i + 2)]
        count = max(2, math.ceil((b - a).length / spacing))
        for step in range(count):
            t = step / count
            position = ((2 * a) + (-p + b) * t +
                        (2 * p - 5 * a + 4 * b - q) * t * t +
                        (-p + 3 * a - 3 * b + q) * t * t * t) * .5
            radius = nodes[i]["radius"] * (1 - t) + nodes[i + 1]["radius"] * t
            ea = nodes[i].get("ellipse", [1, 1])
            eb = nodes[i + 1].get("ellipse", [1, 1])
            ellipse = [ea[j] * (1 - t) + eb[j] * t for j in range(2)]
            output.append({"center": position, "radius": radius, "ellipse": ellipse})
    output.append({"center": controls[-1], "radius": nodes[-1]["radius"],
                   "ellipse": nodes[-1].get("ellipse", [1, 1])})
    return output


def sweep(name, samples, sides, tile, collection, materials, slot=0):
    positions, uvs, faces = [], [], []
    normal, distance = None, 0
    for row, sample in enumerate(samples):
        center = sample["center"]
        tangent = samples[min(row + 1, len(samples) - 1)]["center"] - samples[max(0, row - 1)]["center"]
        if tangent.length < .0001:
            raise ValueError(f"{name}: coincident sweep points")
        tangent.normalize()
        if "right" in sample:
            n = sample["right"].copy()
            n = (n - tangent * n.dot(tangent)).normalized()
        elif normal is None:
            axis = Vector((0, 0, 1)) if abs(tangent.z) < .9 else Vector((1, 0, 0))
            n = tangent.cross(axis).normalized()
        else:
            n = (normal - tangent * normal.dot(tangent)).normalized()
        normal = n
        binormal = tangent.cross(n).normalized()
        if row:
            distance += (center - samples[row - 1]["center"]).length
        radius, ellipse = sample["radius"], sample.get("ellipse", [1, 1])
        for side in range(sides + 1):
            angle = math.tau * side / sides
            position = center + n * (math.cos(angle) * radius * ellipse[0]) + binormal * (math.sin(angle) * radius * ellipse[1])
            positions.append(tuple(position))
            uvs.append((math.tau * radius * side / sides / tile, distance / tile))
            if row and side < sides:
                a = (row - 1) * (sides + 1) + side
                b = row * (sides + 1) + side
                faces.append((a, a + 1, b + 1, b))
    for row, reverse in [(0, True), (len(samples) - 1, False)]:
        center = len(positions)
        positions.append(tuple(samples[row]["center"]))
        uvs.append((0, row * distance / max(1, len(samples) - 1) / tile))
        ring = row * (sides + 1)
        for side in range(sides):
            faces.append((center, ring + side + 1, ring + side) if reverse else
                         (center, ring + side, ring + side + 1))
    return mesh_object(name, positions, faces, uvs, collection, materials, slot)


def joined_copy(objects, name, collection):
    copies = []
    for ob in objects:
        copy = ob.copy()
        copy.data = ob.data.copy()
        collection.objects.link(copy)
        copies.append(copy)
    bpy.ops.object.select_all(action="DESELECT")
    for ob in copies:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = name
    return ob


def remesh(ob, voxel):
    modifier = ob.modifiers.new("Joined solid growth", "REMESH")
    modifier.mode = "VOXEL"
    modifier.voxel_size = voxel
    modifier.adaptivity = 0
    modifier.use_smooth_shade = True
    apply(ob, modifier)


def smooth(ob, factor, iterations):
    modifier = ob.modifiers.new("Grown junction rounding", "SMOOTH")
    modifier.factor = factor
    modifier.iterations = iterations
    apply(ob, modifier)


def triangles(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def decimate(ob, target):
    count = triangles(ob)
    if count <= target:
        return
    modifier = ob.modifiers.new("Bounded runtime surface", "DECIMATE")
    modifier.ratio = target / count
    modifier.use_collapse_triangulate = True
    apply(ob, modifier)


def transfer_uv(ob, source):
    if not ob.data.uv_layers:
        ob.data.uv_layers.new(name="UVMap")
    modifier = ob.modifiers.new("Metric bark from growth sweeps", "DATA_TRANSFER")
    modifier.object = source
    modifier.use_loop_data = True
    modifier.data_types_loops = {"UV"}
    modifier.loop_mapping = "POLYINTERP_NEAREST"
    modifier.layers_uv_select_src = "ALL"
    modifier.layers_uv_select_dst = "NAME"
    apply(ob, modifier)


def repair_uv_charts(ob, source, tile=6.5, maximum_stretch=4, minimum_span=1):
    """Repair transferred UV foldovers without mixing charts inside a face.

    Large curved growth sweeps may overlap themselves or neighboring branches.
    Per-loop nearest transfer can then select unrelated longitudinal charts at
    adjacent corners, stretching many texture repeats across a short triangle.
    Only such overstretched faces are reprojected, using one lateral source
    triangle's affine UV chart for all corners. Buried cap fans are not donors.
    """
    mesh, donor = ob.data, source.data
    uv = mesh.uv_layers.active.data

    def stretch(points, values):
        return max(((values[i] - values[j]).length * tile /
                    max((points[i] - points[j]).length, .00001)
                    for i in range(len(points)) for j in range(i)), default=0)

    pending, largest_before = [], 0
    for face in mesh.polygons:
        points = [mesh.vertices[i].co for i in face.vertices]
        values = [uv[i].uv.copy() for i in face.loop_indices]
        ratio = stretch(points, values)
        largest_before = max(largest_before, ratio)
        span = max(((values[i] - values[j]).length
                    for i in range(len(values)) for j in range(i)), default=0)
        if ratio > maximum_stretch and span > minimum_span:
            pending.append(face.index)
    if not pending:
        return {"repairedFaces": 0, "largestStretchBefore": largest_before,
                "largestStretchAfter": largest_before}
    vertices = [vertex.co.copy() for vertex in donor.vertices]
    triangles, loops = [], []
    donor_uv = donor.uv_layers.active.data
    for face in donor.polygons:
        if len(face.vertices) < 4:
            continue
        for i in range(1, len(face.vertices) - 1):
            ids = (face.vertices[0], face.vertices[i], face.vertices[i + 1])
            corners = (face.loop_indices[0], face.loop_indices[i], face.loop_indices[i + 1])
            values = [donor_uv[j].uv for j in corners]
            if stretch([vertices[j] for j in ids], values) > maximum_stretch:
                continue
            triangles.append(ids)
            loops.append(corners)
    if not triangles:
        raise ValueError("UV repair requires lateral source charts")
    tree = BVHTree.FromPolygons(vertices, triangles, all_triangles=True)
    matrix = source.matrix_world.inverted() @ ob.matrix_world
    for index in pending:
        face = mesh.polygons[index]
        points = [matrix @ mesh.vertices[i].co for i in face.vertices]
        center = sum(points, Vector()) / len(points)
        nearest = tree.find_nearest(center)
        triangle = triangles[nearest[2]]
        a, b, c = [vertices[i] for i in triangle]
        ua, ub, uc = [Vector((*donor_uv[i].uv, 0)) for i in loops[nearest[2]]]
        for loop, point in zip(face.loop_indices, points):
            value = barycentric_transform(point, a, b, c, ua, ub, uc)
            uv[loop].uv = value.x, value.y
    mesh.update()
    largest_after = max((stretch([mesh.vertices[i].co for i in face.vertices],
                                 [uv[i].uv for i in face.loop_indices])
                         for face in mesh.polygons), default=0)
    return {"repairedFaces": len(pending), "largestStretchBefore": largest_before,
            "largestStretchAfter": largest_after}


def passage_samples(data):
    records = data.get("route", {}).get("samples") or data.get("points") or data.get("frames")
    if not records:
        raise ValueError("Passage JSON needs route.samples, points, or frames")
    settings = data.get("clearance", data)
    radius = settings.get("cutterRadius", settings.get("radius", 29))
    lift = settings.get("centerOffsetUp", settings.get("lift", 12.5))
    samples = []
    for record in records:
        up = Vector(record.get("up", [0, 1, 0]))
        point = record.get("point", record.get("position"))
        center = record.get("cutterPoint")
        if center is None:
            center = Vector(point) + up * lift
        samples.append({"center": xyz(center), "radius": radius,
                        "right": xyz(record.get("right", [1, 0, 0]))})
    return samples, radius, data.get("voxelSize", 2)


def relevant_runs(samples, ob, reserve):
    corners = [ob.matrix_world @ Vector(p) for p in ob.bound_box]
    minimum = Vector(tuple(min(p[i] for p in corners) - reserve for i in range(3)))
    maximum = Vector(tuple(max(p[i] for p in corners) + reserve for i in range(3)))
    inside = [all(minimum[i] <= s["center"][i] <= maximum[i] for i in range(3)) for s in samples]
    # Caps stay a full cutter diameter beyond the wood. This only trims remote
    # route districts; it does not change the volume intersecting the tree.
    runs, run = [], []
    for i, sample in enumerate(samples):
        if inside[i]:
            if not run and i:
                run.append(samples[i - 1])
            run.append(sample)
        elif run:
            run.append(sample)
            if len(run) > 2:
                runs.append(run)
            run = []
    if run:
        if inside[0] and runs:
            overlap = (run[-1]["center"] - runs[0][0]["center"]).length < .0001
            runs[0] = run + runs[0][1 if overlap else 0:]
        elif len(run) > 2:
            runs.append(run)
    return runs


def split_skin(ob, slot, name, collection, material):
    polygons = [p for p in ob.data.polygons if p.material_index == slot]
    if not polygons:
        return None
    used = sorted({v for p in polygons for v in p.vertices})
    lookup = {old: new for new, old in enumerate(used)}
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([ob.data.vertices[i].co for i in used], [],
                     [[lookup[v] for v in p.vertices] for p in polygons])
    mesh.update()
    uv = mesh.uv_layers.new(name="UVMap")
    source_uv = ob.data.uv_layers.active.data
    for source, target in zip(polygons, mesh.polygons):
        target.use_smooth = True
        for a, b in zip(source.loop_indices, target.loop_indices):
            uv.data[b].uv = source_uv[a].uv
    color = mesh.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="POINT")
    for value in color.data:
        value.color = (1, 1, 1, 1)
    mesh.materials.append(material)
    result = bpy.data.objects.new(name, mesh)
    collection.objects.link(result)
    return result


def remove_boolean_ears(ob):
    """Remove tiny dangling fins, preserving the real two-face surface beneath.

    A Boolean ear adds a third face to a manifold AB edge, with two one-face
    edges AC/BC and an otherwise unused C vertex. Ordinary small triangles are
    retained: deleting those would open the carved skin.
    """
    mesh = bmesh.new()
    mesh.from_mesh(ob.data)
    ears = [face for face in mesh.faces
            if len(face.verts) == 3 and face.calc_area() < .01
            and max(edge.calc_length() for edge in face.edges) < .5
            and sorted(len(edge.link_faces) for edge in face.edges) == [1, 1, 3]
            and any(len(vertex.link_faces) == 1 for vertex in face.verts)]
    count = len(ears)
    if ears:
        bmesh.ops.delete(mesh, geom=ears, context="FACES_ONLY")
        wires = [edge for edge in mesh.edges if not edge.link_faces]
        if wires:
            bmesh.ops.delete(mesh, geom=wires, context="EDGES")
        isolated = [vertex for vertex in mesh.verts if not vertex.link_edges]
        if isolated:
            bmesh.ops.delete(mesh, geom=isolated, context="VERTS")
    visited, chips, component_count = set(), [], 0
    for start in mesh.verts:
        if start in visited:
            continue
        component_count += 1
        pending, component = [start], []
        visited.add(start)
        while pending:
            vertex = pending.pop()
            component.append(vertex)
            for edge in vertex.link_edges:
                other = edge.other_vert(vertex)
                if other not in visited:
                    visited.add(other)
                    pending.append(other)
        if len(component) < 64:
            extent = max(max(v.co[i] for v in component) - min(v.co[i] for v in component)
                         for i in range(3))
            if extent < 4:
                chips.append(component)
    if chips:
        bmesh.ops.delete(mesh, geom=[v for chip in chips for v in chip], context="VERTS")
    if ears or chips:
        mesh.normal_update()
        mesh.to_mesh(ob.data)
        ob.data.update()
    statistics = {"removedDanglingEars": count,
                  "removedDetachedChips": len(chips),
                  "components": component_count - len(chips),
                  "boundaryEdges": sum(len(edge.link_faces) == 1 for edge in mesh.edges),
                  "nonmanifoldEdges": sum(len(edge.link_faces) != 2 for edge in mesh.edges)}
    mesh.free()
    return statistics


def main():
    args = arguments()
    start = time.monotonic()
    shape = json.loads(args.shape.read_text())
    stem = args.output.with_suffix("") if args.output.suffix in {".glb", ".blend", ".json"} else args.output
    stem.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.context.preferences.filepaths.save_version = 0
    sources = bpy.data.collections.new("Editable growth and passage sources")
    finished = bpy.data.collections.new("Runtime ancient oak")
    bpy.context.scene.collection.children.link(sources)
    bpy.context.scene.collection.children.link(finished)
    mats = [material("AncientOak / bark clay", (.43, .45, .4)),
            material("AncientOak / exposed heartwood clay", (.58, .5, .39))]
    wood_sources = []
    for index, record in enumerate(shape["paths"]):
        record = {"points": record} if isinstance(record, list) else record
        nodes = record.get("points", record.get("nodes"))
        if record.get("ellipse"):
            nodes = [{"ellipse": record["ellipse"], **n} for n in nodes]
        samples = catmull_points(nodes, shape.get("sampleSpacing", 3))
        wood_sources.append(sweep(record.get("name", f"Growth {index + 1}"), samples,
                                   shape.get("sides", 32), shape.get("barkTile", 6.5), sources, mats))
    uv_source = joined_copy(wood_sources, "Original metric bark sweeps", sources)
    wood = joined_copy(wood_sources, "Joined carved wood", sources)
    counts = {"growthSource": triangles(wood)}
    print(f"Remeshing wood from {counts['growthSource']} source triangles", flush=True)
    remesh(wood, shape.get("voxelSize", 3))
    counts["joined"] = triangles(wood)
    smooth(wood, shape.get("smoothFactor", .5), shape.get("smoothIterations", 3))
    target = shape.get("targetTriangles", 140000)
    decimate(wood, target * (.82 if args.passage else 1))
    transfer_uv(wood, uv_source)
    for polygon in wood.data.polygons:
        polygon.material_index = 0
    cutter, cutter_uv, route_records = None, None, 0
    if args.passage:
        passage = json.loads(args.passage.read_text())
        samples, radius, voxel = passage_samples(passage)
        runs = relevant_runs(samples, wood, radius * 2 + voxel * 3)
        route_records = sum(len(run) for run in runs)
        if not runs:
            raise ValueError("The supplied passage does not approach the authored tree")
        cutters = [sweep(f"Passage sweep {i + 1}", run, 32, shape.get("barkTile", 6.5), sources, mats, 1)
                   for i, run in enumerate(runs)]
        cutter_uv = joined_copy(cutters, "Original metric passage sweeps", sources)
        cutter = joined_copy(cutters, "Watertight passage cutter", sources)
        print(f"Unioning {len(runs)} passage runs, {route_records} retained frames", flush=True)
        remesh(cutter, voxel)
        transfer_uv(cutter, cutter_uv)
        for polygon in cutter.data.polygons:
            polygon.material_index = 1
        modifier = wood.modifiers.new("Consumer swept driving passage", "BOOLEAN")
        modifier.operation = "DIFFERENCE"
        modifier.solver = "EXACT"
        modifier.object = cutter
        print(f"Carving {triangles(cutter)} cutter triangles from joined tree", flush=True)
        apply(wood, modifier)
        counts["carved"] = triangles(wood)
        decimate(wood, target)
    modifier = wood.modifiers.new("Runtime triangles", "TRIANGULATE")
    apply(wood, modifier)
    cleanup = remove_boolean_ears(wood)
    outputs = []
    uv_repairs = {}
    for slot, label in [(0, "AncientOak_Bark"), (1, "AncientOak_Heartwood")]:
        skin = split_skin(wood, slot, label, finished, mats[slot])
        if skin:
            donor = uv_source if slot == 0 else cutter_uv
            if donor:
                uv_repairs[label] = repair_uv_charts(skin, donor, shape.get("barkTile", 6.5))
            outputs.append(skin)
    counts["final"] = sum(triangles(ob) for ob in outputs)
    for ob in sources.objects:
        ob.hide_render = ob.hide_viewport = True
    sources.hide_render = sources.hide_viewport = True
    bpy.context.scene["shapeRecipe"] = str(args.shape.resolve())
    bpy.context.scene["passageRecipe"] = str(args.passage.resolve()) if args.passage else ""
    bpy.ops.wm.save_as_mainfile(filepath=str(stem.with_suffix(".blend")), compress=True)
    bpy.ops.object.select_all(action="DESELECT")
    for ob in outputs:
        ob.select_set(True)
        ob.data.materials.clear()
    bpy.context.view_layer.objects.active = outputs[0]
    output = stem.with_suffix(".glb")
    bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", use_selection=True,
                              export_yup=True, export_apply=True, export_materials="NONE",
                              export_extras=False, export_vertex_color="ACTIVE", export_all_vertex_colors=True)
    metadata = {"generator": "Worldkit joined ancient oak", "blender": bpy.app.version_string,
                "units": "metres", "axis": "+Y up", "shape": args.shape.name,
                "shapeSHA256": hashlib.sha256(args.shape.read_bytes()).hexdigest(),
                "passage": args.passage.name if args.passage else None,
                "passageSHA256": hashlib.sha256(args.passage.read_bytes()).hexdigest() if args.passage else None,
                "voxelSize": shape.get("voxelSize", 3), "passageFrames": route_records,
                "triangles": counts, "topologyCleanup": cleanup,
                "uvChartRepair": uv_repairs,
                "meshes": [{"name": ob.name, "triangles": triangles(ob)} for ob in outputs],
                "glbBytes": output.stat().st_size, "glbSHA256": hashlib.sha256(output.read_bytes()).hexdigest(),
                "buildSeconds": round(time.monotonic() - start, 2)}
    stem.with_suffix(".json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps(metadata, indent=2), flush=True)


if __name__ == "__main__":
    main()
