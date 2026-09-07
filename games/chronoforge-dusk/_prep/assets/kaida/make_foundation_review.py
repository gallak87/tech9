"""Create one beginner-friendly review file with a scene per clip and a sword.

This is a viewing copy of the production sources, never the export input.
blender --background --python <this file> -- REVIEW_REVISION
"""
import bpy
import math
from pathlib import Path
import sys
from mathutils import Matrix, Vector

PREP=Path(__file__).resolve().parents[2]
revision=sys.argv[sys.argv.index('--')+1]
assert revision.replace('-','').isalnum()
out=PREP/'assets/kaida/demos'/revision
assert not out.exists(), 'Choose a new review revision'
out.mkdir(parents=True)
bpy.ops.wm.open_mainfile(filepath=str(PREP/'assets/kaida/sources/foundation-r3/master.blend'))
base=bpy.context.scene
rig=bpy.data.objects['KaidaRig']
with bpy.data.libraries.load(str(PREP/'assets/kaida.energy-sword/sources/r2/master.blend'),link=False) as (src,dst):
    dst.objects=src.objects
socket=bpy.data.objects.new('Separate sword - follows hand socket',None)
base.collection.objects.link(socket)
constraint=socket.constraints.new('COPY_TRANSFORMS')
constraint.target=rig
constraint.subtarget='SwordSocket'
for obj in dst.objects:
    base.collection.objects.link(obj)
    obj.parent=socket
    obj.matrix_basis=Matrix.Translation((0,-.135,0))@Matrix.Rotation(-math.pi/2,4,'X')
objects=list(base.objects)
scenes=[]
for index,role in enumerate(('idle','walk','run','attack','hurt'),1):
    scene=bpy.data.scenes.new(f'{index:02} {role.title()}')
    scene.render.fps=30
    scene.unit_settings.scale_length=1
    mapping={obj:obj.copy() for obj in objects}
    for original,obj in mapping.items():
        scene.collection.objects.link(obj)
        if original.parent:obj.parent=mapping[original.parent]
        for modifier in obj.modifiers:
            if modifier.type=='ARMATURE':modifier.object=mapping[rig]
        for c in obj.constraints:
            if c.type=='COPY_TRANSFORMS':c.target=mapping[rig]
    actor=mapping[rig]
    actor.animation_data_create()
    actor.animation_data.action=bpy.data.actions[role]
    actor.animation_data.action_slot=bpy.data.actions[role].slots[0]
    scene.frame_start,scene.frame_end=map(int,bpy.data.actions[role].frame_range)
    scene.frame_set(1)
    if role=='attack':
        for label,frame in [('Ready',1),('Wind-up',15),('CONTACT',21),('Follow-through',25),('Recovered',41)]:
            scene.timeline_markers.new(label,frame=frame)
    scenes.append(scene)
    bpy.context.window.scene=scene
    for obj in scene.objects:obj.select_set(False)
    actor.select_set(True)
    bpy.context.view_layer.objects.active=actor
bpy.context.window.scene=scenes[3]
bpy.data.scenes.remove(base)
# Remove the now unused original objects so the Outliner stays focused.
for obj in objects:
    if not obj.users_collection:bpy.data.objects.remove(obj,do_unlink=True)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.overlay.show_overlays=False
            space.shading.type='MATERIAL'
            space.show_region_ui=False
            space.region_3d.view_location=(0,0,1.15)
            space.region_3d.view_distance=4.5
            space.region_3d.view_rotation=Vector((-.18,-1,-.04)).to_track_quat('-Z','Y')
            space.region_3d.view_perspective='ORTHO'
        elif area.type=='DOPESHEET_EDITOR':
            area.ui_type='DOPESHEET'
            area.spaces.active.mode='ACTION'
            area.spaces.active.dopesheet.show_only_selected=False
readme=bpy.data.texts.new('START HERE - five animation scenes')
readme.write('''KAIDA FOUNDATION REVIEW — first pass, not final polish

Space: play/pause. Shift+Left Arrow: return to the start.
Use the SCENE dropdown at the TOP RIGHT (currently 04 Attack):
01 Idle / 02 Walk / 03 Run / 04 Attack / 05 Hurt.
Each scene has the correct playback range already set, with the separate sword.
Leave the Action Editor action assigned as-is when using these scenes.

Attack: frames 1–41. Anticipation 15, contact 21, recovery complete 41.
All playback is 30 FPS. Walk/run are in place; Godot moves the character.
The earlier wave demo is a separate file. This review copy has the five game roles.
Production master: assets/kaida/sources/foundation-r3/master.blend.
Game candidate: assets/kaida/r4. This viewing copy is not an export source.
''')
bpy.ops.wm.save_as_mainfile(filepath=str(out/f'kaida-{revision}-review.blend'))
