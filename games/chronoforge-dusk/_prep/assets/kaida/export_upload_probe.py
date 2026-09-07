"""Export texture-free upload probes from the retained Kaida master.

Blender 5.1.1 --background --python-exit-code 1 --python this_file
No Dawn code/assets are reused. Existing source and export revisions stay intact.
"""
import bpy
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
from mathutils.kdtree import KDTree

ASSET = Path(__file__).resolve().parent
PREP = ASSET.parents[1]
MASTER = ASSET / 'sources/meshy-r2/kaida-r2-prepared.blend'
OUTPUT = ASSET / 'exports/mixamo-upload-r2'


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    require(bpy.app.version_string == '5.1.1', 'Use pinned Blender 5.1.1')
    require(not OUTPUT.exists(), 'Refusing to overwrite upload probe revision')
    master_sha = sha(MASTER)
    retained = json.loads((ASSET / 'inspection/meshy-r2/integrity.json').read_text())
    require(master_sha == retained['files'][MASTER.relative_to(ASSET).as_posix()],
            'Prepared master changed since inspection')
    bpy.ops.wm.open_mainfile(filepath=str(MASTER))
    objects = list(bpy.context.scene.objects)
    require(len(objects) == 1 and objects[0].type == 'MESH', 'Expected one unrigged mesh')
    mesh = objects[0]
    require(not mesh.modifiers and not bpy.data.actions, 'Unexpected modifiers or animation')
    points = [(mesh.matrix_world @ v.co).copy() for v in mesh.data.vertices]
    tree = KDTree(len(points))
    for index, point in enumerate(points):
        tree.insert(point, index)
    tree.balance()
    faces = {}
    uv = mesh.data.uv_layers.active.data
    for poly in mesh.data.polygons:
        require(len(poly.vertices) == 3, 'Expected triangulated source')
        key = tuple(sorted(poly.vertices))
        require(key not in faces, 'Duplicate source triangle')
        faces[key] = {mesh.data.loops[i].vertex_index: tuple(uv[i].uv) for i in poly.loop_indices}

    mesh.data.materials.clear()
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)
    for image in list(bpy.data.images):
        bpy.data.images.remove(image)
    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)
    # Match the textured r1 FBX settings; only material/media content is removed.
    fbx_settings = json.loads((ASSET / 'inspection/meshy-r2/preparation.json').read_text())['fbx_settings']
    fbx_settings['object_types'] = set(fbx_settings['object_types'])
    (PREP / '.build').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='kaida-upload-probe-', dir=PREP / '.build') as temp:
        folder = Path(temp)
        fbx = folder / 'kaida-r2-geometry-only.fbx'
        obj = folder / 'kaida-r2-geometry-only.obj'
        bpy.ops.export_scene.fbx(filepath=str(fbx), **fbx_settings)
        bpy.ops.wm.obj_export(filepath=str(obj), export_selected_objects=True,
                              apply_modifiers=False, export_materials=False,
                              export_uv=True, export_normals=True,
                              forward_axis='NEGATIVE_Z', up_axis='Y', global_scale=1.0)
        reports = {}
        for path in (fbx, obj):
            bpy.ops.wm.read_factory_settings(use_empty=True)
            if path.suffix == '.fbx':
                bpy.ops.import_scene.fbx(filepath=str(path), use_image_search=False)
            else:
                bpy.ops.wm.obj_import(filepath=str(path), forward_axis='NEGATIVE_Z', up_axis='Y',
                                     use_split_objects=False, use_split_groups=False)
            imported = list(bpy.context.scene.objects)
            require(len(imported) == 1 and imported[0].type == 'MESH', 'Reimport must be mesh only')
            result = imported[0]
            require(len(result.data.vertices) == len(points), 'Vertex count changed')
            require(len(result.data.polygons) == len(faces), 'Face count changed')
            require(not result.data.materials and not bpy.data.images and not bpy.data.actions,
                    'Unexpected materials, images or animation in upload')
            require(result.data.uv_layers.active is not None, 'UV layer lost')
            remap = {}
            displacement = 0.0
            for v in result.data.vertices:
                _, original_index, distance = tree.find(result.matrix_world @ v.co)
                remap[v.index] = original_index
                displacement = max(displacement, distance)
            require(displacement < 1e-5 and len(set(remap.values())) == len(points),
                    'Vertex positions or vertex identity changed')
            actual_uv = result.data.uv_layers.active.data
            seen = set()
            uv_error = 0.0
            for poly in result.data.polygons:
                key = tuple(sorted(remap[v] for v in poly.vertices))
                require(key in faces and key not in seen, 'Triangle connectivity changed')
                seen.add(key)
                for loop in poly.loop_indices:
                    original = remap[result.data.loops[loop].vertex_index]
                    uv_error = max(uv_error, *(abs(a-b) for a, b in zip(actual_uv[loop].uv, faces[key][original])))
            require(uv_error < 1e-5, 'Per-corner UV coordinates changed')
            reports[path.name] = {'bytes': path.stat().st_size, 'sha256': sha(path),
                                 'vertices': len(points), 'triangles': len(faces),
                                 'max_vertex_displacement_m': displacement, 'max_uv_error': uv_error,
                                 'triangle_connectivity_preserved': True,
                                 'armatures': 0, 'images': 0, 'material_slots': 0}
        require(sha(MASTER) == master_sha, 'Master was modified')
        report = {'asset_id': 'kaida', 'purpose': 'Manual Mixamo upload diagnosis; acceptance pending',
                  'source': MASTER.relative_to(ASSET).as_posix(), 'source_sha256': master_sha,
                  'script_sha256': sha(Path(__file__)), 'blender': bpy.app.version_string,
                  'changes': 'Remove material/media content only; no decimation or geometry edits',
                  'primary_test': fbx.name, 'fallback_format_test': obj.name,
                  'files': reports}
        (folder / 'manifest.json').write_text(json.dumps(report, indent=2) + '\n')
        shutil.copytree(folder, OUTPUT)
    print('KAIDA_UPLOAD_PROBES_OK ' + json.dumps(reports))


if __name__ == '__main__':
    main()
