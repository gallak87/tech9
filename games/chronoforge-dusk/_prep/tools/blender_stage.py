"""Fixed Blender preparation/export/reimport operations, called by pipeline.py."""
import bpy
import hashlib
import json
import math
from pathlib import Path
import sys
from mathutils import Vector


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def curves(action):
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                yield from bag.fcurves


def scene_meshes():
    # Blender's glTF importer adds editor-only bone display shapes (Icosphere).
    shapes = {b.custom_shape for o in bpy.context.scene.objects if o.type == 'ARMATURE' for b in o.pose.bones if b.custom_shape}
    return [o for o in bpy.context.scene.objects if o.type == 'MESH' and o not in shapes]


def inspect():
    meshes = scene_meshes()
    require(meshes, 'No meshes in source')
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    vertices = []
    for obj in meshes:
        evaluated = obj.evaluated_get(deps)
        mesh = evaluated.to_mesh()
        vertices.extend(evaluated.matrix_world @ v.co for v in mesh.vertices)
        evaluated.to_mesh_clear()
    require(all(math.isfinite(n) for v in vertices for n in v), 'Non-finite geometry')
    bounds = [[min(v[i] for v in vertices) for i in range(3)], [max(v[i] for v in vertices) for i in range(3)]]
    mesh_info = []
    for obj in meshes:
        obj.data.calc_loop_triangles()
        blend = sum(sum(g.weight > 1e-6 for g in v.groups) > 1 for v in obj.data.vertices)
        mesh_info.append({'name': obj.name, 'vertices': len(obj.data.vertices), 'triangles': len(obj.data.loop_triangles),
                          'uv_layers': len(obj.data.uv_layers), 'blended_vertices': blend,
                          'unweighted_vertices': sum(sum(g.weight for g in v.groups) < .999 for v in obj.data.vertices) if obj.vertex_groups else len(obj.data.vertices)})
    mats = []
    for mat in bpy.data.materials:
        images = []
        if mat.node_tree:
            for node in mat.node_tree.nodes:
                if node.type == 'TEX_IMAGE' and node.image:
                    img = node.image
                    pixels = img.pixels[:]
                    require(pixels and img.size[0] > 0, 'Missing texture: ' + img.name)
                    images.append({'name': img.name, 'size': list(img.size), 'color_space': img.colorspace_settings.name,
                                   'pixel_sha256': hashlib.sha256(bytes(max(0,min(255,round(v*255))) for v in pixels)).hexdigest(),
                                   'connections': [link.to_socket.name for link in node.outputs['Color'].links]})
        mats.append({'name': mat.name, 'images': images})
    rigs = []
    for rig in [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']:
        rigs.append({'name': rig.name, 'bones': [{'name': b.name, 'parent': b.parent.name if b.parent else None,
                                               'rest_matrix': [list(row) for row in b.matrix_local]} for b in rig.data.bones]})
    return {'coordinate_space': 'Blender metres Z up +Y forward', 'bounds': bounds, 'meshes': mesh_info,
            'materials': mats, 'rigs': rigs, 'actions': [{'name': a.name, 'frames': list(a.frame_range),
                                                       'duration_seconds': (a.frame_range[1]-a.frame_range[0])/bpy.context.scene.render.fps} for a in bpy.data.actions]}


def export(meta, prep, out):
    master = next(s for s in meta['source_files'] if s['role'] == 'editable_master')
    bpy.ops.wm.open_mainfile(filepath=str(prep / master['path']))
    bpy.context.scene.frame_set(1)
    # Physical dimensions describe the bind mesh, independent of which action
    # happened to be selected when the artist saved the master.
    rigs = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
    pose_positions = {o.name: o.data.pose_position for o in rigs}
    for rig in rigs:
        rig.data.pose_position = 'REST'
    report = inspect()
    for rig in rigs:
        rig.data.pose_position = pose_positions[rig.name]
    bpy.context.view_layer.update()
    dims = meta['dimensions']
    measured_height = report['bounds'][1][2] - report['bounds'][0][2]
    require(abs(measured_height-dims['height_m']) < .025, 'Source height differs from descriptor')
    require(abs(report['bounds'][0][2]) < .015, 'Source must be grounded')
    require(bpy.context.scene.unit_settings.scale_length == 1, 'Prepare source in metres first')
    for obj in bpy.context.scene.objects:
        require(all(abs(s-1) < 1e-5 for s in obj.scale), 'Apply source scale first: '+obj.name)
    root_correction = []
    if meta['animation_mode'] == 'skeletal':
        require(report['rigs'], 'Skeletal source requires a real armature')
        require(sum(m['blended_vertices'] for m in report['meshes']) > 0, 'Fixture must prove blended skin deformation')
        require(all(m['unweighted_vertices'] == 0 for m in report['meshes']), 'Skeletal mesh has unweighted or underweighted vertices')
        op = meta['root_motion']
        require(op['operation'] == 'remove_root_xy', 'Unknown motion operation')
        rig = bpy.data.objects.get(op['armature'])
        require(rig and rig.type == 'ARMATURE' and op['bone'] in rig.pose.bones, 'Missing declared displacement bone')
        root = rig.data.bones[op['bone']]
        require(root.parent is None, 'Displacement bone must be top-level')
        # Fixed operation needs local axes aligned with Blender world coordinates.
        require(root.matrix_local.to_quaternion().angle < 1e-5 and rig.rotation_euler.to_quaternion().angle < 1e-5, 'Root local axes must match world axes; finish the source before export')
        for role, clip in meta['clips'].items():
            require(clip['name'] in bpy.data.actions, 'Missing action for '+role)
        for action in bpy.data.actions:
            for curve in curves(action):
                if curve.data_path == f'pose.bones["{op["bone"]}"].location' and curve.array_index in (0,1):
                    values = [float(p.co.y) for p in curve.keyframe_points]
                    root_correction.append({'action': action.name, 'axis': curve.array_index, 'source_range_m': [min(values), max(values)]})
                    for key in curve.keyframe_points:
                        key.co.y = 0
                        key.handle_left.y = 0
                        key.handle_right.y = 0
                    curve.update()
        # Other useful bones/actions remain. This does not retarget arbitrary rigs.
        rig.animation_data.action = bpy.data.actions[meta['clips']['idle']['name']]
    else:
        require(not report['rigs'] and not report['actions'], 'Static recipe expects an unanimated source')
    bpy.context.scene.frame_set(1)
    (out / 'working').mkdir()
    bpy.ops.wm.save_as_mainfile(filepath=str(out / 'working/export.blend'))
    settings = {'export_format': 'GLB', 'export_yup': True, 'export_animations': meta['animation_mode'] != 'none',
                'export_animation_mode': 'ACTIONS', 'export_force_sampling': True, 'export_frame_range': False,
                'export_anim_slide_to_zero': True,
                'export_skins': True, 'export_all_influences': False, 'export_def_bones': False,
                'export_materials': 'EXPORT', 'export_image_format': 'AUTO', 'export_cameras': False,
                'export_lights': False, 'export_apply': False}
    (out / 'export-settings.json').write_text(json.dumps(settings, indent=2)+'\n')
    bpy.ops.export_scene.gltf(filepath=str(out / 'runtime/model.glb'), **settings)
    report['root_correction'] = root_correction
    report['visual_acceptance'] = 'not established'
    (out / 'inspection.json').write_text(json.dumps(report, indent=2)+'\n')


def reimport(meta, out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=str(out / 'runtime/model.glb'))
    # Rest-pose bounds and texture connections after actual GLB import.
    for rig in [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']:
        if rig.animation_data:
            rig.animation_data.action = None
        for bone in rig.pose.bones:
            bone.matrix_basis.identity()
    bpy.context.view_layer.update()
    report = inspect()
    (out / 'reimport.json').write_text(json.dumps(report, indent=2)+'\n')
    require(abs(report['bounds'][1][2] - report['bounds'][0][2] - meta['dimensions']['height_m']) < .025, 'Reimport changed height: '+str(report['bounds']))
    before = json.loads((out / 'inspection.json').read_text())
    before_images = sorted(tuple(image['size']) for mat in before['materials'] for image in mat['images'])
    after_images = sorted(tuple(image['size']) for mat in report['materials'] for image in mat['images'])
    require(before_images == after_images, 'Reimport changed texture inventory')
    require(sorted(i['pixel_sha256'] for m in before['materials'] for i in m['images']) == sorted(i['pixel_sha256'] for m in report['materials'] for i in m['images']), 'Reimport changed texture pixels')
    report['checks'] = {'height': True, 'texture_inventory': True}
    if meta['animation_mode'] == 'skeletal':
        require(report['rigs'], 'GLB lost skeleton')
        require(sum(m['blended_vertices'] for m in report['meshes']) > 0, 'GLB lost blended weights')
        rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
        require(all(b['name'] in rig.data.bones for b in before['rigs'][0]['bones']), 'GLB lost source bones')
        # Independently evaluate skin in the exported GLB at two attack times.
        clip = meta['clips']['attack']['name']
        action = next((a for a in bpy.data.actions if a.name == clip or a.name.startswith(clip+'_')), None)
        require(action is not None, 'GLB lost attack action')
        rig.animation_data_create()
        rig.animation_data.action = action
        if action.slots:
            rig.animation_data.action_slot = action.slots[0]
        def positions(frame):
            bpy.context.scene.frame_set(int(frame), subframe=frame-int(frame))
            deps = bpy.context.evaluated_depsgraph_get()
            points = []
            for obj in sorted(scene_meshes(), key=lambda o:o.name):
                evaluated = obj.evaluated_get(deps)
                mesh = evaluated.to_mesh()
                points.extend(obj.matrix_world @ v.co for v in mesh.vertices)
                evaluated.to_mesh_clear()
            return points
        first = positions(action.frame_range[0])
        middle = positions(sum(action.frame_range)/2)
        distance = max((b-a).length for a,b in zip(first,middle))
        require(distance > .05, 'Reimported skin does not deform during attack')
        report['checks'].update({'bones_preserved': True, 'blended_weights': True, 'evaluated_attack_displacement_m': distance})
    report['visual_acceptance'] = 'not established; inspect in Dusk'
    (out / 'reimport.json').write_text(json.dumps(report, indent=2)+'\n')


if __name__ == '__main__':
    stage, metadata, output = sys.argv[sys.argv.index('--')+1:]
    meta = json.loads(Path(metadata).read_text())
    out = Path(output)
    if stage == 'export':
        export(meta, Path(__file__).resolve().parents[1], out)
    elif stage == 'reimport':
        reimport(meta, out)
    else:
        raise RuntimeError('Unknown named stage')
