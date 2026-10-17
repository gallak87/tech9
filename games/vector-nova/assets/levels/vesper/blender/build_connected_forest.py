"""Regenerate Vesper secondary trees only. The colossal hollow library is read-only.

Three mature growth habits use voxel-united wood and overlapping crown masses,
with a retained showcase pilot. Middle and distance variants preserve attached
broadleaf placements; union bounds cover every representation.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT))
from connected_tree_geometry import broadleaf_surface, make_connected_tree

DEST = ROOT.parents[3] / 'public/assets/levels/vesper'
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'vesper-assets.blend'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
MATERIALS = {
    'wood': bpy.data.materials['Vesper | ridged indigo bark'],
    'leaves': bpy.data.materials['Vesper | waxed blue teal leaves'],
}
# Keep authored metre scales stable: refitting enlarged crowns to the previous
# bounds would silently cancel the requested growth.
TREE_SCALE = 1.12


def mesh_objects(name,data,scale):
    root=bpy.data.objects.new(name,None)
    bpy.context.collection.objects.link(root)
    # Blender axes x,-z,y; resulting glTF is game-space +Y up.
    root.scale=(scale[0],scale[2],scale[1])
    for kind,material in MATERIALS.items():
        d=data['parts'][kind]
        mesh=bpy.data.meshes.new(name+'_'+kind)
        mesh.from_pydata(d['v'],[],d['f']);mesh.update()
        uv=mesh.uv_layers.new(name='Living bark metres' if kind=='wood' else 'Leaf surface')
        colors=mesh.color_attributes.new(name='COLOR_0',type='FLOAT_COLOR',domain='CORNER') if kind=='leaves' else None
        for poly in mesh.polygons:
            poly.use_smooth=True
            for loop in poly.loop_indices:
                vi=mesh.loops[loop].vertex_index
                uv.data[loop].uv=d['uv'][vi]
                if colors:colors.data[loop].color=d['c'][vi]
        mesh.validate(clean_customdata=False)
        obj=bpy.data.objects.new(name+'_'+kind,mesh)
        bpy.context.collection.objects.link(obj);obj.parent=root
        obj.data.materials.append(material)
    return root


from mature_grove_geometry import make_mature_grove, weld_grove_wood
report={'asset':'vesper-connected-forest-v1.glb','families':[],'colossalHollowUnchanged':True}
for variant,seed in enumerate([290927,290930,290934]):
    representations={q:make_mature_grove(seed,quality=q) for q in ['high','mid','low']}
    points=[v for data in representations.values() for d in data['parts'].values() for v in d['v']]
    radius=max(math.hypot(v[0],v[1]) for v in points)
    top=max(v[2] for v in points)
    scale=(.85,.92,.85)
    roots=[]
    for quality,data in representations.items():
        name='connected_tree_'+('' if quality=='high' else 'mid_' if quality=='mid' else 'lod_')+str(variant)
        root=mesh_objects(name,data,scale)
        weld_grove_wood(root,quality=quality)
        root['clearanceSize']=[2*radius*scale[0],top*scale[1],2*radius*scale[2]]
        root['clearanceBottom']=min(v[2] for v in points)*scale[1]
        root['connectedTreeFamily']=variant
        root['seed']=seed
        root['rooted']=True
        root['volumetricCrown']=True
        roots.append(root)
    if variant==1:
        pilot=mesh_objects('pilot_connected_elder',make_connected_tree(seed),(TREE_SCALE,TREE_SCALE,TREE_SCALE))
        pilot['approvedPilot']=True
    counts=lambda root:sum(len(p.vertices)-2 for o in root.children for p in o.data.polygons)
    report['families'].append({'variant':variant,'seed':seed,'highTriangles':counts(roots[0]),'middleTriangles':counts(roots[1]),'distanceTriangles':counts(roots[2]),'leafCount':representations['high']['leafCount'],'scale':list(scale)})

# Low, connected rosettes cover the forest floor without another tree-shaped
# silhouette. One reusable mesh is spatially batched by the runtime.
for quality, rows, columns in [('high',7,5),('low',5,3)]:
    rosette={'parts':{kind:{'v':[],'f':[],'uv':[],'c':[]} for kind in MATERIALS}}
    for k in range(11):
        angle=k*2.399; length=8+4*math.sin(k*1.7)**2
        direction=Vector((math.cos(angle),.22+.3*(k%3)/2,math.sin(angle)))
        leaf=broadleaf_surface(Vector((0,-1,0)),direction,length,2.0+(k%3)*.6,.8+.12*(k%4),rows=rows,columns=columns)
        d=rosette['parts']['leaves'];start=len(d['v'])
        d['v'].extend((p.x,-p.z,p.y) for p in leaf['v']);d['uv'].extend(leaf['uv']);d['c'].extend(leaf['c'])
        d['f'].extend(tuple(start+i for i in f) for f in leaf['f'])
    mesh_objects('ground_broadleaf_rosette_'+quality,rosette,(1,1,1))

# Composed mature groves use a different silhouette and physically united wood.
for quality in ['high','low']:
    data=make_mature_grove(low=quality=='low')
    root=mesh_objects('mature_grove_'+quality,data,(1,1,1))
    # Preserve the near grove's curved foliage on Low, with cheaper wood.
    weld_grove_wood(root,low=quality=='low',triangle_budget=2000 if quality=='low' else None)
    root['rooted']=True
    root['volumetricCrown']=True

from forest_materials import apply_forest_materials
apply_forest_materials(embed=False)
bpy.data.orphans_purge(do_recursive=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'vesper-connected-forest.blend'),compress=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(DEST/report['asset']),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_extras=True)
evidence=ROOT.parents[3]/'.experiments/expansion/vesper/leaf-refinement'
evidence.mkdir(parents=True,exist_ok=True)
(evidence/'generator-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('CONNECTED_FOREST_REPORT',json.dumps(report))
