"""Export lighter Workshop instances of the authored Zephyr islands.

Run Blender with --background --factory-startup --python followed by this file.
The original Zephyr Blender library remains the editable source.
"""

import hashlib
import json
from pathlib import Path
import struct
from tempfile import TemporaryDirectory

import bmesh
import bpy


SOURCE = Path(__file__).resolve().parent
GAME = SOURCE.parents[2]
LIBRARY = GAME / "assets/levels/zephyr/zephyr-asset-library.blend"
PUBLIC = GAME / "public/assets/levels/zephyr"
ROCK_TRIANGLES = 7000
ROCK_WELD_METRES = 0.8
ISLANDS = ("island-terrace", "island-shard")


def polygon_triangles(mesh):
    return sum(len(face.vertices) - 2 for face in mesh.polygons)


def triangle_counts(path):
    data = path.read_bytes()
    length = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20 + length])
    counts = {}
    for mesh in gltf["meshes"]:
        for primitive in mesh["primitives"]:
            name = gltf["materials"][primitive["material"]]["name"]
            count = gltf["accessors"][primitive["indices"]]["count"] // 3
            counts[name] = counts.get(name, 0) + count
    return counts


def export_island(name, staging):
    collection = bpy.data.collections[name]
    collection.hide_viewport = False
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")

    rock = next(obj for obj in collection.objects if obj.get("surfaceRole") == "rock")
    rock_material = rock.data.materials[0].name
    # Collapse the dense worn-rock bevel vertices before reducing the strata.
    # The largest authored bevel is 0.65 m, smaller than the rock profile or deck.
    rock_mesh = bmesh.new()
    rock_mesh.from_mesh(rock.data)
    bmesh.ops.remove_doubles(
        rock_mesh, verts=list(rock_mesh.verts), dist=ROCK_WELD_METRES,
    )
    rock_mesh.to_mesh(rock.data)
    rock_mesh.free()
    rock.data.update()
    bpy.context.view_layer.objects.active = rock
    modifier = rock.modifiers.new("Workshop rock reduction", "DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = min(1, ROCK_TRIANGLES / polygon_triangles(rock.data))
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    rock.data.set_sharp_from_angle(angle=1.05)
    assert rock.data.color_attributes.get("Color"), "Keep baked rock contact shade"

    # Keep the deck, exposed ledges, plants, and architectural dressing intact.
    for obj in collection.objects:
        obj.select_set(True)
    runtime = PUBLIC / f"editor-{name}.glb"
    output = staging / runtime.name
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_vertex_color="ACTIVE",
    )

    source = PUBLIC / f"{name}.glb"
    original = triangle_counts(source)
    exported = triangle_counts(output)
    for material in original.keys() - {rock_material}:
        assert exported[material] == original[material], material
    assert 10000 <= sum(exported.values()) <= 14000, exported
    return {
        "source": str(source.relative_to(GAME)),
        "runtime": str(runtime.relative_to(GAME)),
        "sourceTriangles": sum(original.values()),
        "runtimeTriangles": sum(exported.values()),
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
    }


if __name__ == "__main__":
    bpy.ops.wm.open_mainfile(filepath=str(LIBRARY), load_ui=False)
    with TemporaryDirectory(dir=SOURCE) as directory:
        staging = Path(directory)
        manifest = {
            "version": 1,
            "blender": bpy.app.version_string,
            "editableSource": str(LIBRARY.relative_to(GAME)),
            "provenance": (
                "Project-owned Zephyr islands with Blender bevel welding and collapse "
                "applied only to the dark rock body. Pale strata, architecture, plants "
                "and baked vertex colors remain in the export."
            ),
            "islands": {name: export_island(name, staging) for name in ISLANDS},
        }
        manifest_path = staging / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        for island in manifest["islands"].values():
            runtime = GAME / island["runtime"]
            output = staging / runtime.name
            if not runtime.exists() or output.read_bytes() != runtime.read_bytes():
                output.replace(runtime)
        manifest_path.replace(SOURCE / "manifest.json")
