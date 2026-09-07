"""Two bounded Blender preparation recipes: Mixamo upload and material restore."""
import bpy
import hashlib
import json
import math
from pathlib import Path
import shutil
import sys
from mathutils import Vector
from mathutils.kdtree import KDTree

PREP = Path(__file__).resolve().parents[1]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def only_mesh():
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    require(len(meshes) == 1, 'This recipe supports one prepared humanoid mesh')
    return meshes[0]


def geometry(mesh):
    require(len(mesh.data.uv_layers) == 1, 'Expected one UV layer')
    points = [(mesh.matrix_world @ v.co).copy() for v in mesh.data.vertices]
    uv = mesh.data.uv_layers.active.data
    faces = {}
    for poly in mesh.data.polygons:
        require(len(poly.vertices) == 3, 'Prepare a triangulated source first')
        key = tuple(sorted(poly.vertices))
        require(key not in faces, 'Duplicate triangle in source')
        faces[key] = {mesh.data.loops[i].vertex_index: tuple(uv[i].uv) for i in poly.loop_indices}
    return points, faces


def compare_geometry(reference, mesh):
    points, faces = reference
    require(len(mesh.data.vertices) == len(points) and len(mesh.data.polygons) == len(faces),
            'Geometry counts changed; inspect before restoring materials')
    require(len(mesh.data.uv_layers) == 1, 'UV layer missing or ambiguous')
    tree = KDTree(len(points))
    for index, point in enumerate(points):
        tree.insert(point, index)
    tree.balance()
    remap = {}
    displacement = 0.0
    for v in mesh.data.vertices:
        _, index, distance = tree.find(mesh.matrix_world @ v.co)
        remap[v.index] = index
        displacement = max(displacement, distance)
    require(displacement < 1e-5 and len(set(remap.values())) == len(points),
            'Bind geometry moved, scaled or changed; deliberate alignment is required')
    actual_uv = mesh.data.uv_layers.active.data
    seen = set()
    uv_error = 0.0
    for poly in mesh.data.polygons:
        key = tuple(sorted(remap[v] for v in poly.vertices))
        require(key in faces and key not in seen, 'Triangle connectivity changed')
        seen.add(key)
        for loop in poly.loop_indices:
            original = remap[mesh.data.loops[loop].vertex_index]
            uv_error = max(uv_error, *(abs(a-b) for a, b in zip(actual_uv[loop].uv, faces[key][original])))
    require(uv_error < 1e-5, 'Per-corner UVs changed; cannot safely restore source maps')
    return {'vertices': len(points), 'triangles': len(faces), 'max_vertex_displacement_m': displacement,
            'max_uv_error': uv_error, 'triangle_connectivity_preserved': True}


def skin(mesh):
    rigs = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
    require(len(rigs) == 1, 'Expected one returned rig')
    rig = rigs[0]
    require(any(m.type == 'ARMATURE' and m.object == rig for m in mesh.modifiers),
            'Mesh has no modifier bound to the returned rig')
    groups = {g.index: g.name for g in mesh.vertex_groups}
    max_influences, max_sum_error = 0, 0.0
    for v in mesh.data.vertices:
        weights = [g for g in v.groups if g.weight > 1e-8]
        require(weights, 'Unweighted vertex in returned mesh')
        require(all(groups[g.group] in rig.data.bones and math.isfinite(g.weight) for g in weights),
                'Invalid bone influence')
        max_influences = max(max_influences, len(weights))
        max_sum_error = max(max_sum_error, abs(sum(g.weight for g in weights)-1))
    require(max_sum_error < 1e-3, 'Returned skin weights are not normalized')
    return rig, {'bones': len(rig.data.bones), 'unweighted_vertices': 0,
                 'max_influences': max_influences, 'max_weight_sum_error': max_sum_error}


def actions_report():
    return [{'name': a.name, 'range': list(a.frame_range)} for a in bpy.data.actions]


def evaluated_points(mesh):
    bpy.context.view_layer.update()
    obj = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    return [(obj.matrix_world @ v.co).copy() for v in obj.data.vertices]


def image_signature(material):
    images = {node.image for node in material.node_tree.nodes if node.type == 'TEX_IMAGE' and node.image}
    require(images and all(i.packed_file for i in images), 'Reference material must have packed source maps')
    return sorted((i.name, i.colorspace_settings.name,
                   hashlib.sha256(i.packed_file.data).hexdigest()) for i in images)


def upload(metadata, out, sources):
    bpy.ops.wm.open_mainfile(filepath=str(sources['editable_master']))
    mesh = only_mesh()
    require(len(bpy.context.scene.objects) == 1 and not mesh.modifiers and not bpy.data.actions,
            'Upload requires one unrigged mesh without modifiers or actions')
    reference = geometry(mesh)
    mesh.data.materials.clear()
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)
    for image in list(bpy.data.images):
        bpy.data.images.remove(image)
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    target = out / (metadata['asset_id']+'-geometry-only.fbx')
    bpy.ops.export_scene.fbx(filepath=str(target), use_selection=True, object_types={'MESH'},
                             axis_forward='-Z', axis_up='Y', apply_unit_scale=True,
                             use_space_transform=True, bake_space_transform=False,
                             path_mode='COPY', embed_textures=False, bake_anim=False,
                             use_mesh_modifiers=False, mesh_smooth_type='FACE', add_leaf_bones=False)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(target), use_image_search=False)
    mesh = only_mesh()
    report = compare_geometry(reference, mesh)
    require(len(bpy.context.scene.objects) == 1 and not mesh.data.materials and not bpy.data.images
            and not bpy.data.actions, 'Upload contains unexpected scene/material/animation data')
    report.update({'armatures': 0, 'images': 0, 'material_slots': 0,
                   'upload': target.name, 'service_acceptance': 'Not implied by local export validation'})
    return report


def restore(metadata, out, sources):
    bpy.ops.wm.open_mainfile(filepath=str(sources['reference_master']))
    reference_mesh = only_mesh()
    reference = geometry(reference_mesh)
    require(len(reference_mesh.data.materials) == 1 and reference_mesh.data.materials[0],
            'This restore recipe supports one source material')
    material_name = reference_mesh.data.materials[0].name
    expected_images = image_signature(reference_mesh.data.materials[0])
    # Import a scratch copy so extracted FBX media never alters retained downloads.
    copied = out / 'input.fbx'
    shutil.copyfile(sources['rigged_download'], copied)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(copied), use_image_search=False)
    copied.unlink()
    extracted = out / 'input.fbm'
    if extracted.exists():
        shutil.rmtree(extracted)
    mesh = only_mesh()
    require(all(o.type in {'MESH', 'ARMATURE'} for o in bpy.context.scene.objects), 'Unexpected scene objects')
    report = compare_geometry(reference, mesh)
    rig, report['skin'] = skin(mesh)
    report['actions'] = actions_report()
    first = int(min((a.frame_range[0] for a in bpy.data.actions), default=1))
    last = int(max((a.frame_range[1] for a in bpy.data.actions), default=first))
    scene = bpy.context.scene
    scene.frame_set(first)
    before_pose = evaluated_points(mesh)
    scene.frame_set(last)
    last_pose = evaluated_points(mesh)
    report['endpoint_pose_change_m'] = max((a-b).length for a, b in zip(before_pose, last_pose))
    scene.frame_set(first)
    with bpy.data.libraries.load(str(sources['reference_master']), link=False) as (_, loaded):
        loaded.materials = [material_name]
    mesh.data.materials.clear()
    mesh.data.materials.append(loaded.materials[0])
    require(image_signature(loaded.materials[0]) == expected_images, 'Source map bytes or color spaces changed')
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    # This adjusts only the editor view, never the rig, rest pose or source action.
    toward = Vector((0, 1 if metadata.get('view_from') == '-Y' else -1, 0))
    minimum = min(p.z for p in before_pose)
    maximum = max(p.z for p in before_pose)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                space = area.spaces.active
                space.shading.type = 'MATERIAL'
                space.region_3d.view_location = Vector((0, 0, (minimum+maximum)/2))
                space.region_3d.view_distance = (maximum-minimum)*1.8
                space.region_3d.view_rotation = toward.to_track_quat('-Z', 'Y')
                space.region_3d.view_perspective = 'ORTHO'
    target = out / 'master.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(target))
    bpy.ops.wm.open_mainfile(filepath=str(target))
    mesh = only_mesh()
    compare_geometry(reference, mesh)
    _, reopened_skin = skin(mesh)
    require(reopened_skin == report['skin'] and actions_report() == report['actions'], 'Saved rig/action structure changed')
    require(image_signature(mesh.data.materials[0]) == expected_images, 'Saved packed material changed')
    reopened_pose = evaluated_points(mesh)
    require(max((a-b).length for a, b in zip(before_pose, reopened_pose)) < 1e-5,
            'Saving/restoring materials changed evaluated pose')
    report.update({'packed_maps': len(expected_images), 'master': target.name,
                   'status': 'Rig and source actions retained; animation finishing and runtime candidate remain separate'})
    return report


def main():
    args = sys.argv[sys.argv.index('--')+1:]
    metadata = json.loads(Path(args[0]).read_text())
    out = Path(args[1])
    sources = {s['role']: PREP/s['path'] for s in metadata['source_files']}
    operation = {'mixamo_upload': upload, 'mixamo_restore': restore}[metadata['recipe']]
    report = operation(metadata, out, sources)
    (out/'preparation.json').write_text(json.dumps(report, indent=2)+'\n')
    print('PREPARATION_OK', metadata['recipe'], json.dumps(report))


if __name__ == '__main__':
    main()
