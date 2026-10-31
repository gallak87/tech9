"""Editable Zephyr masonry aqueduct bay, authored and exported in Blender.

Run: blender --background --python assets/levels/zephyr/aqueduct/build_aqueduct.py -- <app root>
The 78 m bay uses game coordinates X across, Y up, Z along its span. Exported
arrays retain Blender's evaluated bevels and split normals, without runtime I/O.
"""

import bpy
import bmesh
import json
import math
import sys
from pathlib import Path

root = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
source = root / "assets/levels/zephyr/aqueduct"
output = root / "src/levels/zephyr/environment/geometry/aqueduct-bay.js"
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1
materials = {}
for role, color in [("stone", (.46, .425, .36, 1)), ("trim", (.66, .615, .50, 1))]:
    material = bpy.data.materials.new("Zephyr aqueduct " + role)
    material.diffuse_color = color
    materials[role] = material


def prism(name, polygon, depth, role="stone", offset=0, bevelled=True):
    """Extrude an ordered Z/Y outline across X, preserving editable blocks."""
    vertices = [(x + offset, -z, y) for x in [-depth / 2, depth / 2] for z, y in polygon]
    n = len(polygon)
    faces = [tuple(reversed(range(n))), tuple(range(n, n * 2))]
    faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    mesh.materials.append(materials[role])
    obj["surfaceRole"] = role
    if bevelled:
        bevel = obj.modifiers.new("Dressed masonry arris", "BEVEL")
        bevel.width = .12 if role == "stone" else .075
        bevel.segments = 1
        bevel.limit_method = "ANGLE"
    return obj


def box(name, z, y, width, height, depth, role="stone", offset=0):
    return prism(name, [(z-width/2, y-height/2), (z+width/2, y-height/2),
                        (z+width/2, y+height/2), (z-width/2, y+height/2)], depth, role, offset)


# Two pointed openings divide the load through deep radial voussoirs. The
# spandrel webs meet real horizontal masonry bands instead of floating tubes.
for tier, spring, top in [("upper", -49, -3.5), ("lower", -104, -59)]:
    half, rise, thickness = 29.5, 35, 4.3
    center = (rise * rise - half * half) / (2 * half)
    radius = half + center
    end_angle = math.acos(-center / radius)
    # One continuous full-width core backs both extrados shoulders and all
    # radial joints. Separate vertical strips miss the outward-leaning web at
    # the springers and allow the sky through those small triangular gaps.
    core = [(-39, top), (-39, spring)]
    for side, samples in [(-1, range(12)), (1, range(10, -1, -1))]:
        for k in samples:
            angle = math.pi + (end_angle-math.pi)*k/11
            core.append((side*-(center+math.cos(angle)*radius), spring+math.sin(angle)*radius))
    core.extend([(39, spring), (39, top)])
    prism(f"{tier} continuous masonry web", core, 19.5, bevelled=False)
    for side in [-1, 1]:
        def arc(angle, r):
            return (side * -(center + math.cos(angle) * r), spring + math.sin(angle) * r)

        for k in range(11):
            a = math.pi + (end_angle-math.pi)*k/11
            b = math.pi + (end_angle-math.pi)*(k+1)/11
            gap = .0018
            aa, bb = a-gap, b+gap
            inner_a, inner_b = arc(aa, radius), arc(bb, radius)
            outer_a, outer_b = arc(aa, radius+thickness), arc(bb, radius+thickness)
            prism(f"{tier} radial voussoir {side} {k}",
                  [inner_a, inner_b, outer_b, outer_a], 22)
            # The broad web remains one quiet continuous plane behind this
            # fitted ring. Individual bevelled vertical strips sparkle in sun
            # from racing distance and obscure the structural mass.
            # Front and back dressed arrises seat directly on the voussoir face.
            for face in [-1, 1]:
                trim_a, trim_b = arc(aa, radius+.70), arc(bb, radius+.70)
                prism(f"{tier} inner arris {side} {k} {face}",
                      [inner_a, inner_b, trim_b, trim_a], .65, "trim", face*11.25)
    # A tapered, seated keystone closes the two circular halves at the crown.
    crown = spring + rise
    prism(tier + " crown keystone", [(-1.8,crown-.4), (1.8,crown-.4),
                                    (2.7,top), (-2.7,top)], 22.5, "trim")
    for side in [-1, 1]:
        # Springers sit on the full-depth pier and communicate lateral thrust.
        box(f"{tier} springer {side}", side*34, spring-1, 10.4, 3.4, 24, "trim")
box("Intermediate continuous masonry band", 0, -56, 78, 6, 22)
for face in [-1, 1]:
    box("Intermediate dressed drip", 0, -52.4, 78, 1.3, .9, "trim", face*11.05)
for side in [-1, 1]:
    box(f"Pier seated capital {side}", side*39, -5.3, 20.5, 3.6, 22, "trim")
    box(f"Pier stepped impost {side}", side*39, -9, 18.7, 3.8, 19)

# Static CPU buffers are imported by the existing three-material batch builder.
# There are no extra runtime meshes, textures, loaders or owners.
bpy.context.view_layer.update()
depsgraph = bpy.context.evaluated_depsgraph_get()
buffers = {role: {"position": [], "normal": []} for role in materials}
for obj in scene.objects:
    if obj.type != "MESH":
        continue
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    mesh.calc_loop_triangles()
    role = obj["surfaceRole"]
    for tri in mesh.loop_triangles:
        for index in tri.loops:
            vertex = mesh.vertices[mesh.loops[index].vertex_index].co
            normal = mesh.corner_normals[index].vector
            buffers[role]["position"].extend(round(v, 4) for v in (vertex.x, vertex.z, -vertex.y))
            buffers[role]["normal"].extend(round(v, 5) for v in (normal.x, normal.z, -normal.y))
    evaluated.to_mesh_clear()
output.write_text("// Generated by assets/levels/zephyr/aqueduct/build_aqueduct.py using Blender.\n"
                  "// Metres, X lateral, Y up, span Z=-39..39. Preserve source bevels and normals.\n"
                  "export const zephyrAqueductBay = " + json.dumps(buffers,separators=(",", ":")) + ";\n")
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(source / "aqueduct-bay.blend"))
print(json.dumps({role: len(data["position"])//9 for role,data in buffers.items()}))
