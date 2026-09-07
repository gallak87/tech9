"""Prepare this supplied Meshy batch without reducing or reshaping its mesh.

Run with Blender 5.1.1 --background --python-exit-code 1 --python this_file.
Source downloads and existing prepared revisions are never overwritten.
"""
import bpy
import bmesh
import hashlib
import json
import math
from pathlib import Path
import shutil
import tempfile
from mathutils import Vector

ASSET = Path(__file__).resolve().parent
PREP = ASSET.parents[1]
RAW = ASSET / 'downloads/meshy-r2'
SOURCE = ASSET / 'sources/meshy-r2'
EXPORT = ASSET / 'exports/rigging-r1'
EVIDENCE = ASSET / 'inspection/meshy-r2'
MAPS = {'basecolor': ('texture.png', 'Base Color', 'sRGB'),
        'roughness': ('texture_roughness.png', 'Roughness', 'Non-Color'),
        'metallic': ('texture_metallic.png', 'Metallic', 'Non-Color'),
        'normal': ('texture_normal.png', 'Normal', 'Non-Color')}


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write(path, value):
    Path(path).write_text(json.dumps(value, indent=2)+'\n')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def inspect(mesh):
    data=mesh.data
    data.calc_loop_triangles()
    points=[mesh.matrix_world@v.co for v in data.vertices]
    bm=bmesh.new();bm.from_mesh(data)
    result={'vertices':len(data.vertices),'triangles':len(data.loop_triangles),
            'bounds':[[min(v[i] for v in points) for i in range(3)], [max(v[i] for v in points) for i in range(3)]],
            'uv_layers':[uv.name for uv in data.uv_layers],
            'boundary_edges':sum(e.is_boundary for e in bm.edges),
            'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),
            'degenerate_faces':sum(f.calc_area()<1e-12 for f in bm.faces),
            'rigs':sum(o.type=='ARMATURE' for o in bpy.context.scene.objects),
            'actions':[a.name for a in bpy.data.actions]}
    bm.free()
    return result


def material():
    mat=bpy.data.materials.new('Kaida / supplied PBR maps')
    mat.diffuse_color=(.02,.55,.65,1)
    mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    mappings={}
    for role,(suffix,socket,color_space) in MAPS.items():
        original=next(p for p in RAW.glob('*.png') if p.name.endswith(suffix))
        copied=SOURCE/'textures'/f'kaida-{role}.png'
        shutil.copyfile(original,copied)
        image=bpy.data.images.load(str(copied),check_existing=False)
        image.name='Kaida '+role
        image.colorspace_settings.name=color_space
        image.pack()
        node=mat.node_tree.nodes.new('ShaderNodeTexImage')
        node.name='Kaida '+role;node.label=role+' / '+color_space;node.image=image
        node.location=(-600,-len(mappings)*240)
        if role=='normal':
            normal=mat.node_tree.nodes.new('ShaderNodeNormalMap')
            normal.location=(-200,-500)
            mat.node_tree.links.new(node.outputs['Color'],normal.inputs['Color'])
            mat.node_tree.links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
        else:
            mat.node_tree.links.new(node.outputs['Color'],bsdf.inputs[socket])
        mappings[role]={'original':original.name,'working':copied.relative_to(ASSET).as_posix(),
                        'sha256':digest(copied),'color_space':color_space,'size':list(image.size)}
    return mat,mappings


def configure_view(focus):
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active
                space.shading.type='MATERIAL'
                space.region_3d.view_location=focus
                space.region_3d.view_distance=3.0
                space.region_3d.view_rotation=Vector((0,-1,0)).to_track_quat('-Z','Y')
                space.region_3d.view_perspective='ORTHO'


def main():
    require(bpy.app.version_string=='5.1.1','Use pinned Blender 5.1.1')
    for path in (SOURCE,EXPORT,EVIDENCE):
        require(not path.exists(),'Refusing to overwrite prepared revision: '+str(path))
    receipt=json.loads((RAW/'receipt.json').read_text())
    for name,sha in receipt['files'].items():
        require(digest(RAW/name)==sha,'Raw download changed: '+name)
    SOURCE.mkdir(parents=True)
    (SOURCE/'textures').mkdir()
    EXPORT.mkdir(parents=True)
    EVIDENCE.mkdir(parents=True)
    # FBX import may extract embedded media. Keep such derivatives out of RAW.
    with tempfile.TemporaryDirectory(prefix='kaida-fbx-',dir=PREP/'.build') as temp:
        source=next(RAW.glob('*.fbx'))
        copied=Path(temp)/'kaida-meshy-r2.fbx'
        shutil.copyfile(source,copied)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.fbx(filepath=str(copied),use_image_search=False)
        meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
        require(len(meshes)==1,'Inspect a changed source structure before preparing it')
        mesh=meshes[0]
        mesh.name='Kaida';mesh.data.name='Kaida mesh / original topology'
        before=inspect(mesh)
        require(before['rigs']==0 and not before['actions'],'This preparation is for the supplied unrigged mesh')
        mat,maps=material()
        mesh.data.materials.clear();mesh.data.materials.append(mat)
        # Discard unused imported material/image datablocks; their bytes remain in RAW FBX.
        for old in list(bpy.data.materials):
            if old!=mat and old.users==0:bpy.data.materials.remove(old)
        for image in list(bpy.data.images):
            if image.users==0:bpy.data.images.remove(image)
        scene=bpy.context.scene
        scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
        scene.render.fps=30
        bpy.context.view_layer.objects.active=mesh
        bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True)
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'kaida-r2-imported.blend'))
        # Observed front was Blender -Y. Rotate into the shared +Y producer facing.
        mesh.rotation_euler.z+=math.pi
        bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
        mesh.location.z-=before['bounds'][0][2]
        bpy.ops.object.transform_apply(location=True,rotation=False,scale=False)
        bpy.context.view_layer.update()
        after=inspect(mesh)
        require(after['vertices']==before['vertices'] and after['triangles']==before['triangles'],'Preparation altered topology')
        require(after['nonmanifold_edges']==0 and after['degenerate_faces']==0,'Prepared mesh failed structural checks')
        require(abs(after['bounds'][0][2])<1e-5,'Feet are not grounded')
        height=after['bounds'][1][2]-after['bounds'][0][2]
        configure_view(Vector((0,0,height/2)))
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'kaida-r2-prepared.blend'))
        fbx_settings={'use_selection':True,'object_types':{'MESH'},'axis_forward':'-Z','axis_up':'Y',
                      'apply_unit_scale':True,'use_space_transform':True,'bake_space_transform':False,
                      'path_mode':'COPY','embed_textures':True,'bake_anim':False,'use_mesh_modifiers':False,
                      'mesh_smooth_type':'FACE','add_leaf_bones':False}
        bpy.ops.export_scene.fbx(filepath=str(EXPORT/'kaida-r2-for-mixamo.fbx'),**fbx_settings)
        bpy.ops.export_scene.gltf(filepath=str(EXPORT/'kaida-r2-unrigged.glb'),export_format='GLB',
                                  use_selection=True,export_yup=True,export_animations=False,export_skins=False,
                                  export_cameras=False,export_lights=False,export_materials='EXPORT')
        report={'asset_id':'kaida','source_batch':'meshy-r2','status':'unrigged_mesh_prepared; Mixamo base and clips pending',
                'before':before,'after':after,'dimensions':{'height_m':height,'forward':'+Y in Blender / -Z in glTF','up':'+Z in Blender / +Y in glTF','origin':'ground'},
                'changes':['Clear working names','Supplied PNGs explicitly connected and packed','Base color sRGB; data maps Non-Color','Rotate 180 degrees about Blender Z','Place feet at ground origin'],
                'geometry_changes':'None: no decimation, remeshing, topology edits or proportion changes.',
                'visual_review_notes':['Meshy reintroduced small brown wristbands absent from the r2 reference.','Palms, fingers and joint deformation still need rigged review; closed topology does not establish deformation quality.','Normal map used as supplied with Blender tangent-space convention; no channel inversion applied.'],
                'maps':maps,'fbx_settings':{k:sorted(v) if isinstance(v,set) else v for k,v in fbx_settings.items()},
                'tools':{'blender':bpy.app.version_string,'build':bpy.app.build_hash.decode()},
                'receipt_sha256':digest(RAW/'receipt.json'),'script_sha256':digest(__file__)}
        write(EVIDENCE/'preparation.json',report)
        write(SOURCE/'source-map.json',maps)
        write(EXPORT/'manifest.json',{'asset_id':'kaida','source_batch':'meshy-r2','purpose':'Manual rigging input; not a game-ready character candidate',
                                    'files':{p.name:digest(p) for p in EXPORT.iterdir() if p.is_file()}})


if __name__=='__main__':
    main()
