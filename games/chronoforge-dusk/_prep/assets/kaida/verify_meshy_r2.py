"""Reimport the real unrigged exports and render source inspection views."""
import bpy
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
from mathutils import Vector

ASSET=Path(__file__).resolve().parent
PREP=ASSET.parents[1]
SOURCE=ASSET/'sources/meshy-r2'
EXPORT=ASSET/'exports/rigging-r1'
EVIDENCE=ASSET/'inspection/meshy-r2'
spec=importlib.util.spec_from_file_location('kaida_prepare',ASSET/'prepare_meshy_r2.py')
prepare=importlib.util.module_from_spec(spec);spec.loader.exec_module(prepare)


def pixel_hash(image):
    pixels=image.pixels[:]
    return hashlib.sha256(bytes(max(0,min(255,round(p*255))) for p in pixels)).hexdigest()


def images_report():
    return [{'name':i.name,'size':list(i.size),'colorspace':i.colorspace_settings.name,
             'packed':i.packed_file is not None,'pixel_sha256':pixel_hash(i)} for i in bpy.data.images if i.users and i.size[0]>0]


def require(condition,message):
    if not condition:raise RuntimeError(message)


def scene_report():
    mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    report=prepare.inspect(mesh)
    report['images']=images_report()
    return report


def main():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'kaida-r2-prepared.blend'))
    master=scene_report()
    require(len(master['images'])==4 and all(i['packed'] for i in master['images']),'Master must contain four packed maps')
    reports={'master':master}
    for kind,name in [('fbx','kaida-r2-for-mixamo.fbx'),('glb','kaida-r2-unrigged.glb')]:
        with tempfile.TemporaryDirectory(prefix='kaida-reimport-',dir=PREP/'.build') as temp:
            copied=Path(temp)/name
            shutil.copyfile(EXPORT/name,copied)
            bpy.ops.wm.read_factory_settings(use_empty=True)
            if kind=='fbx':bpy.ops.import_scene.fbx(filepath=str(copied),use_image_search=False)
            else:bpy.ops.import_scene.gltf(filepath=str(copied))
            report=scene_report()
            require(report['triangles']==master['triangles'],kind+' changed triangle count')
            require(report['rigs']==0 and not report['actions'],kind+' should be honestly unrigged')
            require(max(abs(a-b) for row1,row2 in zip(report['bounds'],master['bounds']) for a,b in zip(row1,row2))<1e-5,kind+' changed scale, placement or shape bounds')
            original_base=next(i for i in master['images'] if i['name']=='Kaida basecolor')['pixel_sha256']
            require(any(i['pixel_sha256']==original_base for i in report['images']),kind+' lost/changed the base-color pixels')
            require(report['uv_layers'],kind+' lost UVs')
            report['checks']={'triangle_count_preserved':True,'bounds_match_master':True,'uv_present':True,'basecolor_pixels_preserved':True,'unrigged_status_confirmed':True}
            reports[kind]=report
    reports['limitations']=['These checks do not prove Mixamo auto-rig success or deformation quality.','glTF packs metallic/roughness into one map; FBX material interpretation is checked separately from source retention.']
    (EVIDENCE/'roundtrip.json').write_text(json.dumps(reports,indent=2)+'\n')
    render_views()
    print('KAIDA_ROUNDTRIP_OK: FBX and GLB geometry, placement, UV presence and base-color pixels preserved; master has four packed maps.')


def render_views():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'kaida-r2-prepared.blend'))
    scene=bpy.context.scene
    scene.render.engine='CYCLES';scene.cycles.samples=24
    scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
    scene.view_settings.view_transform='Standard'
    scene.world=bpy.data.worlds.new('Neutral inspection');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.6,.6,.6,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
    data=bpy.data.cameras.new('Inspection');cam=bpy.data.objects.new('Inspection',data)
    scene.collection.objects.link(cam);scene.camera=cam;data.type='ORTHO'
    views=[('front',(0,4,.95),(0,0,.95),2.2,768,1024),
           ('back',(0,-4,.95),(0,0,.95),2.2,768,1024),
           ('side',(4,0,.95),(0,0,.95),2.2,768,1024),
           ('hand-front',(.37,3,1.05),(.37,0,1.05),.44,900,900),
           ('hand-back',(.37,-3,1.05),(.37,0,1.05),.44,900,900),
           ('hand-side',(3,0,1.05),(.37,0,1.05),.44,900,900)]
    for name,position,focus,scale,width,height in views:
        cam.location=position;cam.rotation_euler=(Vector(focus)-cam.location).to_track_quat('-Z','Y').to_euler()
        data.ortho_scale=scale;scene.render.resolution_x=width;scene.render.resolution_y=height
        scene.render.filepath=str(EVIDENCE/(name+'.png'));bpy.ops.render.render(write_still=True)
    print('KAIDA_INSPECTION_VIEWS_OK: six views rendered without modifying the Blender master.')


if __name__=='__main__':
    if '--render-only' in sys.argv:render_views()
    else:main()
