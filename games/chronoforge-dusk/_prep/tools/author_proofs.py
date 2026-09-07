"""Blender-only, original diagnostic sources. Never a Kaida generator."""
import bpy
import hashlib
import json
import math
from pathlib import Path
from mathutils import Vector

PREP = Path(__file__).resolve().parents[1]
SOURCE_REVISION = 'r2'


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1
    bpy.context.scene.render.fps = 30


def material(name, color, texture=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = .65
    if texture:
        node = mat.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = texture
        mat.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
    return mat


def box(name, center, size, mat, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Authored edge bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.append(mat)
    return obj


def finish(asset_id, animation_mode, height, sources, extra=None):
    directory = PREP / 'assets' / asset_id
    source_dir = directory / 'sources' / SOURCE_REVISION
    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(source_dir / 'master.blend'))
    source_files = []
    for path in sorted(source_dir.iterdir()):
        if path.is_file():
            source_files.append({'path': str(path.relative_to(PREP)),
                                 'role': 'editable_master' if path.suffix == '.blend' else 'texture_source',
                                 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    meta = {'production_format': 1, 'asset_id': asset_id, 'revision': 'r1',
            'label': 'Skinned diagnostic / NOT KAIDA' if animation_mode == 'skeletal' else 'Calibration grip probe',
            'kind': 'character' if animation_mode == 'skeletal' else 'prop',
            'animation_mode': animation_mode, 'placeholder': True,
            'recipe': 'skeletal_blend' if animation_mode == 'skeletal' else 'static_blend',
            'source_files': source_files, 'required_outputs': ['runtime/model.glb', 'runtime/descriptor.json', 'working/export.blend', 'inspection.json', 'reimport.json'],
            'dimensions': {'height_m': height, 'radius_m': .34 if animation_mode == 'skeletal' else .09, 'forward': '-Z', 'up': '+Y', 'origin': 'ground'},
            'dependencies': [], 'attachments': [],
            'provenance': {'origin': 'Newly authored for Dusk by tools/author_proofs.py', 'attribution': 'Original project diagnostic source; no external model, animation or texture reused.', 'provider': None,
                           'purpose': sources, 'source_coordinates': 'Blender metres, Z up, +Y forward; glTF exporter converts once to Y up, -Z forward'}}
    if extra:
        meta.update(extra)
    (directory / 'asset.json').write_text(json.dumps(meta, indent=2) + '\n')


def static():
    asset_id = 'diagnostic.grip-probe'
    directory = PREP / 'assets' / asset_id / 'sources' / SOURCE_REVISION
    if directory.exists():
        raise RuntimeError('Refusing to overwrite original sources: ' + str(directory))
    directory.mkdir(parents=True)
    reset()
    image = bpy.data.images.new('Calibration stripes sRGB', width=64, height=64)
    pixels = []
    for y in range(64):
        for x in range(64):
            pixels.extend((.03, .8, .9, 1) if (x // 8 + y // 16) % 2 else (.015, .12, .18, 1))
    image.pixels[:] = pixels
    image.filepath_raw = str(directory / 'calibration-basecolor.png')
    image.file_format = 'PNG'
    image.save()
    image.pack()
    shell = material('Paint / sRGB base color', (.03, .8, .9), image)
    dark = material('Rubber', (.018, .035, .055))
    white = material('Front marker', (1, .65, .08))
    box('Grip', (0, 0, .10), (.065, .065, .20), dark, .01)
    box('Sensor', (0, 0, .30), (.11, .09, .20), shell, .015)
    box('Front marker +Y', (0, .052, .30), (.055, .014, .12), white, .004)
    finish(asset_id, 'none', .40, 'Static Blender route and separate skeletal grip attachment. Not Kaida equipment.')


def skeletal():
    asset_id = 'diagnostic.skin-probe'
    directory = PREP / 'assets' / asset_id / 'sources' / SOURCE_REVISION
    if directory.exists():
        raise RuntimeError('Refusing to overwrite original sources: ' + str(directory))
    directory.mkdir(parents=True)
    reset()
    body_mat = material('Diagnostic amber', (.85, .31, .045))
    dark = material('Diagnostic slate', (.075, .13, .19))
    marker = material('Front marker', (.03, .8, .9))
    armature = bpy.data.armatures.new('Diagnostic skeleton')
    rig = bpy.data.objects.new('Rig', armature)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    definitions = [('Root', (0, 0, 0), (0, .2, 0), None),
                   ('Pelvis', (0, 0, .86), (0, 0, 1.04), 'Root'),
                   ('Spine', (0, 0, 1.04), (0, 0, 1.42), 'Pelvis'),
                   ('Head', (0, 0, 1.42), (0, 0, 1.76), 'Spine')]
    for side, s in [('L', 1), ('R', -1)]:
        definitions += [(f'UpperArm.{side}', (s*.23, 0, 1.38), (s*.40, 0, 1.12), 'Spine'),
                        (f'Forearm.{side}', (s*.40, 0, 1.12), (s*.53, 0, .90), f'UpperArm.{side}'),
                        (f'Hand.{side}', (s*.53, 0, .90), (s*.59, 0, .80), f'Forearm.{side}'),
                        (f'Thigh.{side}', (s*.115, 0, .90), (s*.14, 0, .49), 'Pelvis'),
                        (f'Shin.{side}', (s*.14, 0, .49), (s*.16, 0, .10), f'Thigh.{side}'),
                        (f'Foot.{side}', (s*.16, 0, .10), (s*.16, .18, .08), f'Shin.{side}')]
    for name, head, tail, parent in definitions:
        bone = armature.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        if parent:
            bone.parent = armature.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')

    def skin(obj, weights):
        obj.parent = rig
        for name, assignments in weights.items():
            group = obj.vertex_groups.new(name=name)
            for index, weight in assignments:
                if weight > 0:
                    group.add([index], weight, 'REPLACE')
        modifier = obj.modifiers.new('Real skin deformation', 'ARMATURE')
        modifier.object = rig

    def rigid_part(obj, bone):
        skin(obj, {bone: [(v.index, 1) for v in obj.data.vertices]})

    def limb(name, points, radius, bones):
        # Continuous surface spanning the joint; three rings blend both bones.
        verts, faces, weights = [], [], {bone: [] for bone in bones}
        start, joint, end = map(Vector, points)
        for ring in range(13):
            t = ring / 12
            center = start.lerp(joint, t * 2) if t <= .5 else joint.lerp(end, (t-.5)*2)
            axis = (end-start).normalized()
            u = Vector((0, 1, 0))
            v = axis.cross(u).normalized()
            blend = max(0, min(1, (t-.35)/.30))
            r = radius * (1 - .25*t)
            for edge in range(8):
                a = edge * math.tau/8
                verts.append(tuple(center + r*(math.cos(a)*u + math.sin(a)*v)))
                index = len(verts)-1
                weights[bones[0]].append((index, 1-blend))
                weights[bones[1]].append((index, blend))
                if ring:
                    prev = index-8
                    faces.append((prev, (ring-1)*8+(edge+1)%8, ring*8+(edge+1)%8, index))
        faces += [tuple(reversed(range(8))), tuple(range(96,104))]
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(body_mat)
        uv = mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops:
            uv.data[loop.index].uv = ((loop.vertex_index % 8)/7, (loop.vertex_index//8)/12)
        skin(obj, weights)

    rigid_part(box('Torso', (0, 0, 1.24), (.43, .24, .40), dark), 'Spine')
    rigid_part(box('Pelvis mesh', (0, 0, .95), (.31, .22, .20), dark), 'Pelvis')
    rigid_part(box('Head mesh', (0, 0, 1.62), (.25, .23, .32), body_mat), 'Head')
    rigid_part(box('Front visor +Y', (0, .125, 1.64), (.19, .028, .07), marker, .009), 'Head')
    for side, s in [('L', 1), ('R', -1)]:
        limb('Arm.'+side, [(s*.23,0,1.38),(s*.40,0,1.12),(s*.53,0,.90)], .074, [f'UpperArm.{side}',f'Forearm.{side}'])
        limb('Leg.'+side, [(s*.115,0,.90),(s*.14,0,.49),(s*.16,0,.10)], .10, [f'Thigh.{side}',f'Shin.{side}'])
        rigid_part(box('Hand mesh.'+side, (s*.565, 0, .85), (.085,.085,.13), dark, .01), 'Hand.'+side)
        rigid_part(box('Boot.'+side, (s*.16,.06,.055), (.17,.30,.11), dark, .015), 'Foot.'+side)

    rig.animation_data_create()
    for role, frames in [('idle',60),('walk',30),('run',24),('attack',24),('hurt',18)]:
        action = bpy.data.actions.new(role)
        action.use_fake_user = True
        rig.animation_data.action = action
        for frame in range(1, frames+2):
            t = (frame-1)/frames
            wave = math.sin(t*math.tau)
            for bone in rig.pose.bones:
                bone.rotation_mode = 'XYZ'
                bone.rotation_euler = (0,0,0)
                bone.location = (0,0,0)
            if role in ('walk','run'):
                # Original forward travel retained here; export corrects only Root X/Y.
                rig.pose.bones['Root'].location.y = t*(1.0 if role=='walk' else 2.4)
                for side, sign in [('L',1),('R',-1)]:
                    rig.pose.bones['Thigh.'+side].rotation_euler.x = wave*sign*(.36 if role=='walk' else .60)
                    rig.pose.bones['Shin.'+side].rotation_euler.x = max(0,-wave*sign)*.65
                    rig.pose.bones['UpperArm.'+side].rotation_euler.x = -wave*sign*.3
                    rig.pose.bones['Forearm.'+side].rotation_euler.x = -.22
            elif role=='attack':
                pulse = math.sin(t*math.pi)**2
                rig.pose.bones['UpperArm.R'].rotation_euler.x = -1.1*pulse
                rig.pose.bones['Forearm.R'].rotation_euler.x = -1.0*pulse
                rig.pose.bones['Spine'].rotation_euler.y = -.18*pulse
            elif role=='hurt':
                rig.pose.bones['Spine'].rotation_euler.x = .25*math.sin(t*math.pi)
            else:
                rig.pose.bones['Spine'].rotation_euler.x = .025*wave
            for bone in rig.pose.bones:
                bone.keyframe_insert(data_path='rotation_euler', frame=frame, group=bone.name)
                if bone.name=='Root':
                    bone.keyframe_insert(data_path='location', frame=frame, group=bone.name)
    rig.animation_data.action = bpy.data.actions['idle']
    finish(asset_id, 'skeletal', 1.78, 'Continuous weighted limbs, deliberately simple diagnostic clips and hands. Tests skin, root correction and grip, not production anatomy or motion quality.',
           {'root_motion': {'operation': 'remove_root_xy', 'armature': 'Rig', 'bone': 'Root'},
            'clips': {role: {'name': role, 'loop': role in ('idle','walk','run')} for role in ('idle','walk','run','attack','hurt')},
            'dependencies': ['candidates/diagnostic.grip-probe/r1/manifest.json'],
            'attachments': [{'id': 'grip-probe', 'dependency': 'diagnostic.grip-probe', 'skeleton_path': 'Rig/Skeleton3D', 'bone': 'Hand.R', 'position_m': [0,0,0], 'rotation_degrees': [90,0,0]}]})


if __name__ == '__main__':
    static()
    skeletal()
