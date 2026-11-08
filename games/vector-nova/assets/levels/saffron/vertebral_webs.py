"""Subtractive vertebral cortex refinement for the editable Saffron kit.

Call refine_vertebral_webs([vertebra, vertebra_1, vertebra_2], bone, marrow)
before the main material merge/union. Also accepts already merged module roots.
Only removes bone above game Y=24; no road, receiver, floor or placement changes.
Game coordinates are converted to Blender with (x, -z, y).
"""

import math

import bpy
import bmesh
from mathutils import Vector


def _blender(point):
    return Vector((point[0], -point[2], point[1]))


def _game(point):
    return Vector((point[0], point[2], -point[1]))


def _closed_mesh(name, vertices, faces, collection, materials, material_index):
    data = bpy.data.meshes.new(name)
    data.from_pydata([_blender(point) for point in vertices], [], faces)
    data.update()
    for material in materials:
        data.materials.append(material)
    for polygon in data.polygons:
        polygon.material_index = material_index
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    return obj


def _break_sector(name, outline, collection, materials):
    """A closed, jagged upper fracture sector, extending through the module."""
    vertices = [(x, y, z) for z in (-85, 85) for x, y in outline]
    count = len(outline)
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count)
              for i in range(count)]
    return _closed_mesh(name, vertices, faces, collection, materials, 0)


def _gallery(name, center, radius_u, radius_v, half_depth, collection,
             materials, seed=0, axis="z"):
    """A thick, unequal, branching true cavity; closed ends lie outside bone."""
    across, up, forward = {
        "z": (Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))),
        "x": (Vector((0, 0, 1)), Vector((0, 1, 0)), Vector((1, 0, 0))),
        "y": (Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((0, 1, 0))),
    }[axis]
    center = Vector(center)
    vertices, faces = [], []
    sides = 18
    levels = [(-1, .88), (-.60, 1.08), (0, 1), (.56, .93), (1, .81)]
    for depth, flare in levels:
        for i in range(sides):
            angle = i * math.tau / sides
            lobes = 1 + .16 * math.sin(angle * 3 + seed * .91) + .07 * math.cos(angle * 5 - seed)
            # One oblique secondary lobe joins the main stress-aligned gallery,
            # leaving a branching cortical web rather than round drilled holes.
            branch = math.atan2(math.sin(angle - .55 - seed * .37),
                                math.cos(angle - .55 - seed * .37))
            lobes += .22 * math.exp(-(branch / .38) ** 2)
            u = math.cos(angle) * radius_u * lobes * flare
            v = math.sin(angle) * radius_v * lobes * flare
            u += v * (.16 if seed % 2 else -.12)
            point = center + forward * (depth * half_depth) + across * u + up * v
            assert point.y >= 24, (name, tuple(point))
            vertices.append(tuple(point))
    for row in range(len(levels) - 1):
        for i in range(sides):
            faces.append((row * sides + i, row * sides + (i + 1) % sides,
                          (row + 1) * sides + (i + 1) % sides, (row + 1) * sides + i))
    faces += [tuple(range(sides - 1, -1, -1)),
              tuple((len(levels) - 1) * sides + i for i in range(sides))]
    return _closed_mesh(name, vertices, faces, collection, materials, 1)


def _floor_vertices(root):
    inverse = root.matrix_world.inverted()
    result = set()
    for obj in root.children_recursive:
        if obj.type != "MESH":
            continue
        transform = inverse @ obj.matrix_world
        for vertex in obj.data.vertices:
            point = _game(transform @ vertex.co)
            if point.y <= 20:
                result.add(tuple(round(value, 5) for value in point))
    return result


def _stats(root):
    inverse = root.matrix_world.inverted()
    points, triangles = [], 0
    for obj in root.children_recursive:
        if obj.type != "MESH":
            continue
        transform = inverse @ obj.matrix_world
        points += [_game(transform @ vertex.co) for vertex in obj.data.vertices]
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    return {"triangles": triangles,
            "bounds": {"min": [min(point[i] for point in points) for i in range(3)],
                       "max": [max(point[i] for point in points) for i in range(3)]}}


def _seal_upper_mesh(obj, local):
    # Exact Boolean grazing intersections can leave centimetre
    # slivers in the old clipped variant. Weld/close only above the
    # protected base; this is far below the metre-scale anatomy.
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    upper_vertices = [vertex for vertex in bm.verts
          if _game(local @ vertex.co).y > 24]
    bmesh.ops.remove_doubles(bm, verts=upper_vertices, dist=.08)
    upper_edges = [edge for edge in bm.edges
                   if all(_game(local @ vertex.co).y > 24 for vertex in edge.verts)]
    bmesh.ops.dissolve_degenerate(bm, edges=upper_edges, dist=.001)
    boundary = [edge for edge in bm.edges if edge.is_boundary and
                all(_game(local @ vertex.co).y > 24 for vertex in edge.verts)]
    if boundary:
        bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
    # A grazing cut may retain one redundant sub-metre cap on an
    # already closed sheet. Remove only those fully overconnected
    # tiny caps; their surrounding cortical faces remain intact.
    redundant_caps = [face for face in bm.faces if face.calc_area() < 1.0 and
          all(_game(local @ vertex.co).y > 24 for vertex in face.verts) and
          all(len(edge.link_faces) > 2 for edge in face.edges)]
    if redundant_caps:
        bmesh.ops.delete(bm, geom=redundant_caps, context="FACES_ONLY")
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bad = sum(not edge.is_manifold for edge in bm.edges
              if all(_game(local @ vertex.co).y > 24 for vertex in edge.verts))
    bm.to_mesh(obj.data)
    bm.free()
    return bad


def _subtract(obj, cutters=None, cutter=None):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new("Broken neural cortex / true cancellous subtraction", "BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = "EXACT"
    if cutter is None:
        modifier.operand_type = "COLLECTION"
        modifier.collection = cutters
    else:
        modifier.operand_type = "OBJECT"
        modifier.object = cutter
    if hasattr(modifier, "use_self"):
        modifier.use_self = True
    if hasattr(modifier, "use_hole_tolerant"):
        modifier.use_hole_tolerant = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def refine_vertebral_webs(roots, bone_material, marrow_material):
    """Remove unequal bridge sectors and excavate integral cancellous galleries.

    Roots may contain original separate parts or the material-merged meshes.
    The function creates no permanent added mesh. Existing vertices below game
    Y20 must survive unchanged, and each cortical landmark stays above 60 m.
    """
    bpy.context.view_layer.update()
    results = {}
    outlines = [
        [(-17, 69), (-7, 76), (1, 72), (12, 80), (13, 205), (-22, 205)],
        [(-7, 63), (6, 58), (18, 64), (33, 57), (90, 67), (120, 205), (-5, 205)],
        [(-115, 69), (-70, 64), (-55, 69), (-36, 61), (-22, 68), (-15, 76), (-10, 205), (-120, 205)],
    ]
    for variant, root in enumerate(roots):
        if root.get("saffron_vertebral_web_refined"):
            results[root.name] = {"alreadyRefined": True}
            continue
        before, floor_before = _stats(root), _floor_vertices(root)
        cutters = bpy.data.collections.new(root.name + " temporary subtractive anatomy")
        bpy.context.scene.collection.children.link(cutters)
        materials = [bone_material, marrow_material]
        _break_sector(root.name + " unequal missing upper neural sector",
                      outlines[variant], cutters, materials)
        for side in (-1, 1):
            # Three connected cells per shoulder make one unequal branching
            # load-bearing web; the lowest cutter starts above the preserved base.
            for k, (x, y, ru, rv) in enumerate([(48, 35, 4.4, 6.0),
                                                (49, 44, 3.5, 5.0),
                                                (44, 53, 4.0, 6.0)]):
                _gallery(f"{root.name} shoulder {side} branching cell {k}",
                         (side * (x + math.sin(variant + k) * 1.4), y + variant * .8, 2),
                         ru, rv, 65, cutters, materials, variant * 6 + k + (side > 0) * 3)
        fractures = [
            [((-20, 79, 8), "x", 4.0, 4.3, 12), ((15, 79, 8), "x", 4.2, 4.0, 12)],
            [((-10, 73, 6), "x", 4.1, 4.8, 13), ((54, 57, 4), "y", 4.4, 4.0, 11)],
            [((-51, 64, 4), "y", 4.5, 4.0, 12), ((-14, 80, 7), "x", 4.2, 4.1, 12)],
        ][variant]
        for k, (center, axis, ru, rv, depth) in enumerate(fractures):
            _gallery(f"{root.name} exposed fracture cancellous gallery {k}",
                     center, ru, rv, depth, cutters, materials, 20 + variant * 3 + k, axis)
        upper_cells = [
            [(-36, 76, 5, 5.8, 3.4), (29, 75, 5, 5.2, 3.3)],
            [(-35, 62, 6, 5.0, 2.6)],
            [(35, 80, 4, 6.0, 3.2)],
        ][variant]
        for k, (x, y, z, ru, rv) in enumerate(upper_cells):
            _gallery(f"{root.name} retained neural stub cortical gallery {k}",
                     (x, y, z), ru, rv, 65, cutters, materials, 40 + variant * 2 + k)

        # The collection is in root coordinates. Applying its world transform
        # allows the helper to work on a moved diagnostic copy as well.
        for cutter in cutters.objects:
            cutter.matrix_world = root.matrix_world.copy()
        try:
            for obj in list(root.children_recursive):
                if obj.type != "MESH":
                    continue
                local = root.matrix_world.inverted() @ obj.matrix_world
                if max(_game(local @ vertex.co).y for vertex in obj.data.vertices) <= 24:
                    continue
                # The older premerge right-bridge variant has open fracture
                # boundaries. Seal only those above the protected floor first.
                bm = bmesh.new()
                bm.from_mesh(obj.data)
                boundary = [edge for edge in bm.edges if edge.is_boundary and
                            all(_game(local @ vertex.co).y > 20 for vertex in edge.verts)]
                if boundary:
                    bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
                bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
                bm.to_mesh(obj.data)
                bm.free()
                if marrow_material.name not in obj.data.materials:
                    obj.data.materials.append(marrow_material)
                backup = obj.data.copy()
                _subtract(obj, cutters=cutters)
                bad = _seal_upper_mesh(obj, local)
                if bad:
                    # Original unmerged ve1 contains a clipped open bridge.
                    # The sequential fallback avoids overlapping-operand slivers
                    # while preserving the same actual subtractive anatomy.
                    broken = obj.data
                    obj.data = backup
                    if broken.users == 0:
                        bpy.data.meshes.remove(broken)
                    for cutter in cutters.objects:
                        _subtract(obj, cutter=cutter)
                        bad = _seal_upper_mesh(obj, local)
                if backup.users == 0:
                    bpy.data.meshes.remove(backup)
                if bad and min(_game(local @ vertex.co).y for vertex in obj.data.vertices) > 24:
                    # The legacy unmerged, face-clipped bridge can remain
                    # self-intersecting after capping. It owns no protected base
                    # vertices, so a bounded local union may safely seal it.
                    # The merged-root path never needs this fallback.
                    union = obj.modifiers.new("Seal legacy upper bridge only", "REMESH")
                    union.mode = "VOXEL"
                    union.voxel_size = 1.2
                    union.adaptivity = .40
                    union.use_smooth_shade = True
                    bpy.ops.object.modifier_apply(modifier=union.name)
                    simplify = obj.modifiers.new("Bounded upper bridge cortex", "DECIMATE")
                    simplify.ratio = .50
                    bpy.ops.object.modifier_apply(modifier=simplify.name)
                    bad = _seal_upper_mesh(obj, local)
                assert bad == 0, obj.name
                obj.data.update()
                for polygon in obj.data.polygons:
                    polygon.use_smooth = True
                obj.select_set(False)
        finally:
            for cutter in list(cutters.objects):
                data = cutter.data
                bpy.data.objects.remove(cutter, do_unlink=True)
                if data.users == 0:
                    bpy.data.meshes.remove(data)
            bpy.data.collections.remove(cutters)
        bpy.context.view_layer.update()
        after, floor_after = _stats(root), _floor_vertices(root)
        assert floor_before == floor_after, f"{root.name}: protected floor vertices changed"
        assert after["bounds"]["max"][1] > 60, f"{root.name}: cortical landmark too short"
        root["saffron_vertebral_web_refined"] = True
        results[root.name] = {"before": before, "after": after,
                              "protectedFloorVertices": len(floor_before),
                              "floorPreserved": True}
    return results
