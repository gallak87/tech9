"""Attach compatible Mixamo source actions without retargeting or losing travel."""
import bpy
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
from blender_stage import curves
from preparation_stage import require, only_mesh, geometry, compare_geometry, skin, image_signature


def one_rig():
    rigs = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
    require(len(rigs) == 1, 'Expected exactly one armature in clip/base')
    return rigs[0]


def rig_signature(rig):
    return {'object_matrix': [list(row) for row in rig.matrix_world],
            'bones': {b.name: {'parent': b.parent.name if b.parent else None,
                               'rest': [list(row) for row in b.matrix_local]} for b in rig.data.bones}}


def compare_rig(expected, actual):
    require(set(expected['bones']) == set(actual['bones']), 'Clip bone names differ; retargeting is required')
    require(all(b['parent'] == actual['bones'][name]['parent'] for name,b in expected['bones'].items()),
            'Clip bone hierarchy differs; retargeting is required')
    rest_delta = max(abs(x-y) for name,b in expected['bones'].items()
                     for row_a,row_b in zip(b['rest'],actual['bones'][name]['rest']) for x,y in zip(row_a,row_b))
    transform_delta = max(abs(x-y) for row_a,row_b in zip(expected['object_matrix'],actual['object_matrix'])
                          for x,y in zip(row_a,row_b))
    require(rest_delta < 1e-5 and transform_delta < 1e-6, 'Clip rest pose or unit transform differs; finish deliberately')
    return {'bone_names_match': True, 'hierarchy_matches': True,
            'max_rest_matrix_delta': rest_delta, 'max_object_matrix_delta': transform_delta}


def action_digest(action):
    data = []
    for curve in sorted(curves(action), key=lambda c:(c.data_path,c.array_index)):
        require(not curve.modifiers, 'Bake curve modifiers before using this clip recipe')
        data.append([curve.data_path,curve.array_index,curve.extrapolation,
                     [[list(k.co),list(k.handle_left),list(k.handle_right),k.interpolation] for k in curve.keyframe_points]])
    require(data, 'Clip contains no animation curves')
    return hashlib.sha256(json.dumps(data).encode()).hexdigest()


def bind_action(rig, action):
    require(len(action.slots) == 1, 'Clip needs one unambiguous action slot')
    rig.animation_data_create()
    rig.animation_data.action = action
    rig.animation_data.action_slot = action.slots[0]


def sampled_pose(rig, start, end):
    result = []
    root = next(b for b in rig.pose.bones if b.parent is None)
    roots = []
    for frame in range(start,end+1):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        result.append([n for bone in sorted(rig.pose.bones,key=lambda b:b.name)
                       for row in rig.matrix_world @ bone.matrix for n in row])
        roots.append(list(rig.matrix_world @ root.head))
    return result, roots


def pose_difference(a, b):
    require(len(a) == len(b), 'Frame sampling changed')
    return max(abs(x-y) for pose_a,pose_b in zip(a,b) for x,y in zip(pose_a,pose_b))


def assemble(metadata, out, sources):
    bpy.ops.wm.open_mainfile(filepath=str(sources['rigged_master']))
    base_rig = one_rig()
    base_signature = rig_signature(base_rig)
    base_mesh = only_mesh()
    reference_geometry = geometry(base_mesh)
    _, expected_skin = skin(base_mesh)
    expected_images = image_signature(base_mesh.data.materials[0])
    fps = bpy.context.scene.render.fps / bpy.context.scene.render.fps_base
    existing = {a.name:action_digest(a) for a in bpy.data.actions}
    require(not set(metadata['clips'].values()) & set(existing), 'Source action name already exists; choose new names')
    packages, reports = {}, {}
    with tempfile.TemporaryDirectory(prefix='clips-', dir=out) as temp:
        scratch = Path(temp)
        for role, name in metadata['clips'].items():
            raw = scratch/(role+'.fbx')
            shutil.copyfile(sources['clip_'+role], raw)
            bpy.ops.wm.read_factory_settings(use_empty=True)
            bpy.ops.import_scene.fbx(filepath=str(raw), use_image_search=False)
            rig = one_rig()
            require(all(o.type in {'MESH','ARMATURE'} for o in bpy.context.scene.objects), 'Unexpected clip scene object')
            check = compare_rig(base_signature, rig_signature(rig))
            require(abs(bpy.context.scene.render.fps / bpy.context.scene.render.fps_base-fps) < 1e-6,
                    'Clip FPS differs; resample deliberately before assembly')
            meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
            require(len(meshes) <= 1, 'Unexpected extra meshes in clip')
            if meshes:
                check['included_mesh'] = compare_geometry(reference_geometry, meshes[0])
            require(rig.animation_data and rig.animation_data.action and len(bpy.data.actions) == 1,
                    'Expected one active source action')
            action = rig.animation_data.action
            start,end = map(int, action.frame_range)
            require(end > start, 'Clip has no playback range')
            poses, roots = sampled_pose(rig,start,end)
            action_hash = action_digest(action)
            action_file = scratch/(role+'.blend')
            bpy.data.libraries.write(str(action_file), {action}, fake_user=True)
            packages[role] = {'path':action_file,'poses':poses,'hash':action_hash,'range':(start,end)}
            reports[role] = {'source':sources['clip_'+role].name, 'source_action':action.name,
                             'action':name, 'fps':fps, 'frames':[start,end], 'frame_count':end-start+1,
                             'timeline_duration_seconds':(end-start)/fps, 'source_curves_sha256':action_hash,
                             'source_root_end_displacement_m':[roots[-1][i]-roots[0][i] for i in range(3)],
                             'root_motion':'preserved; this is not an in-place runtime export', 'compatibility':check}
        bpy.ops.wm.open_mainfile(filepath=str(sources['rigged_master']))
        rig = one_rig()
        for action in bpy.data.actions:
            action.use_fake_user = True
        for role,name in metadata['clips'].items():
            package = packages[role]
            with bpy.data.libraries.load(str(package['path']), link=False) as (available, loaded):
                loaded.actions = list(available.actions)
            require(len(loaded.actions) == 1, 'Ambiguous action library')
            action = loaded.actions[0]
            action.name = name
            action.use_fake_user = True
            bind_action(rig, action)
            require(action_digest(action) == package['hash'], 'Action curve data changed during transfer')
            poses,_ = sampled_pose(rig,*package['range'])
            difference = pose_difference(package['poses'], poses)
            require(difference < 1e-5, 'Transferred action evaluates differently on the retained rig')
            reports[role]['max_transferred_pose_delta'] = difference
        primary = 'idle' if 'idle' in metadata['clips'] else next(iter(metadata['clips']))
        bind_action(rig, bpy.data.actions[metadata['clips'][primary]])
        scene = bpy.context.scene
        scene.frame_start,scene.frame_end = packages[primary]['range']
        scene.frame_set(scene.frame_start)
        bpy.ops.wm.save_as_mainfile(filepath=str(out/'master.blend'))
        bpy.ops.wm.open_mainfile(filepath=str(out/'master.blend'))
        rig,mesh = one_rig(),only_mesh()
        compare_rig(base_signature, rig_signature(rig))
        compare_geometry(reference_geometry,mesh)
        _, actual_skin = skin(mesh)
        require(actual_skin == expected_skin and image_signature(mesh.data.materials[0]) == expected_images,
                'Saved master lost its skin or packed maps')
        require(all(name in bpy.data.actions and action_digest(bpy.data.actions[name]) == digest
                    for name,digest in existing.items()), 'Preexisting source actions were lost or changed')
        for role,name in metadata['clips'].items():
            action = bpy.data.actions[name]
            require(action_digest(action) == packages[role]['hash'], 'Saved clip curves changed')
            bind_action(rig,action)
            poses,_ = sampled_pose(rig,*packages[role]['range'])
            difference = pose_difference(packages[role]['poses'],poses)
            require(difference < 1e-5, 'Saved clip pose differs from original FBX')
            reports[role]['max_reopened_pose_delta'] = difference
    return {'master':'master.blend', 'clips':reports, 'skin':actual_skin,'packed_maps':len(expected_images),
            'status':'Source clips assembled; motion/rig finishing and missing gameplay roles remain separate'}
