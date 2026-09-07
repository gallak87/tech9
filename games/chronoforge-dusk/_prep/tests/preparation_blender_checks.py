"""Meaningful geometry/UV/skin rejection checks inside pinned Blender."""
import bpy
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'tools'))
import preparation_stage as stage


def rejects(fn, expected):
    try:
        fn()
    except ValueError as error:
        assert expected in str(error), str(error)
    else:
        raise AssertionError('Expected rejection: '+expected)


bpy.ops.wm.read_factory_settings(use_empty=True)
data = bpy.data.meshes.new('Fixture')
data.from_pydata([(0,0,0),(1,0,0),(0,1,0),(0,0,1)], [], [(0,2,1),(0,1,3),(0,3,2),(1,2,3)])
mesh = bpy.data.objects.new('Fixture', data)
bpy.context.scene.collection.objects.link(mesh)
data.uv_layers.new(name='UVMap')
reference = stage.geometry(mesh)
stage.compare_geometry(reference, mesh)
mesh.data.vertices[0].co.x = .1
rejects(lambda: stage.compare_geometry(reference, mesh), 'Bind geometry moved')
mesh.data.vertices[0].co.x = 0
mesh.data.uv_layers.active.data[0].uv.x = .1
rejects(lambda: stage.compare_geometry(reference, mesh), 'Per-corner UVs changed')
mesh.data.uv_layers.active.data[0].uv.x = 0
rejects(lambda: stage.skin(mesh), 'Expected one returned rig')
rig_data = bpy.data.armatures.new('Rig')
rig = bpy.data.objects.new('Rig', rig_data)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bone = rig_data.edit_bones.new('Root')
bone.tail = (0,0,1)
bpy.ops.object.mode_set(mode='OBJECT')
modifier = mesh.modifiers.new(name='Skin', type='ARMATURE')
modifier.object = rig
rejects(lambda: stage.skin(mesh), 'Unweighted vertex')
group = mesh.vertex_groups.new(name='Root')
group.add(list(range(4)), 1.0, 'REPLACE')
stage.skin(mesh)
group.add([0], .5, 'REPLACE')
rejects(lambda: stage.skin(mesh), 'not normalized')
print('PREPARATION_FAILURE_CHECKS_OK: changed shape, changed UV, missing rig, unweighted vertex, bad weight sums rejected')
