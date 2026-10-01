"""Regenerate Vesper secondary trees only. The colossal hollow library is read-only.

High trees retain the approved pilot construction. Distance trees preserve a
parent-anchored skeleton and attached broadleaf sprays at a much lower budget.
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
from connected_tree_geometry import broadleaf_surface, make_connected_tree, LEAF_LENGTH_SCALE, LEAF_WIDTH_SCALE, BRANCH_REACH_SCALE, BRANCH_RADIUS_SCALE

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
BASE_SCALES = [(0.8899411351875766,0.7837743848951181,0.8899411351875766),
               (1.0059162811908304,0.8990763613492714,1.0059162811908304),
               (1.0062208464490618,0.6348278746856992,1.0062208464490618)]



def sample(points, fraction):
    u=max(0,min(1,fraction))*(len(points)-1)
    index=min(len(points)-2,int(u))
    return points[index].lerp(points[index+1],u-index)


def closest(point, points):
    candidates=[]
    for a,b in zip(points,points[1:]):
        delta=b-a
        t=max(0,min(1,(point-a).dot(delta)/delta.length_squared))
        candidates.append(a+delta*t)
    return min(candidates,key=lambda p:(p-point).length_squared)


def make_distance_tree(full):
    parts={kind:{'v':[],'f':[],'uv':[],'c':[]} for kind in MATERIALS}
    paths={}
    attachments=[]

    def vertex(kind,point,uv=(0,0),shade=1):
        d=parts[kind]
        d['v'].append((point.x,-point.z,point.y))
        d['uv'].append(uv)
        d['c'].append((shade,shade*.97,shade*.88,1))
        return len(d['v'])-1

    def tube(name, points, radii, sides):
        rings=[]
        length=0
        for i,p in enumerate(points):
            tangent=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
            side=tangent.cross(Vector((0,1,0)))
            if side.length<.01:side=tangent.cross(Vector((0,0,1)))
            side.normalize();up=tangent.cross(side).normalized()
            if i:length+=(p-points[i-1]).length
            rings.append([vertex('wood',p+(side*math.cos(j/sides*math.tau)+up*math.sin(j/sides*math.tau))*radii[i],(j/sides*max(1,radii[0]*math.tau/16),length/16)) for j in range(sides+1)])
        for i in range(len(rings)-1):
            for j in range(sides):
                parts['wood']['f'].append((rings[i][j],rings[i][j+1],rings[i+1][j+1],rings[i+1][j]))
        parts['wood']['f'].append(tuple(reversed(rings[0][:-1])))
        parts['wood']['f'].append(tuple(rings[-1][:-1]))
        paths[name]=points

    def spray(base,direction,seed):
        forward=direction.normalized()
        across=forward.cross(Vector((0,1,0))).normalized()
        for i in range(4):
            side=(i-1.5)*.72
            out=(forward+across*side+Vector((0,.12+.18*math.sin(seed+i),0))).normalized()
            data=broadleaf_surface(base,out,(16+(seed%4))*1.45,5.3*1.65,.85+.1*math.sin(seed+i),rows=3)
            ids=[vertex('leaves',p,uv,color[0]) for p,uv,color in zip(data['v'],data['uv'],data['c'])]
            parts['leaves']['f'].extend(tuple(ids[i] for i in face) for face in data['f'])

    for part in full['structure']:
        name=part['id']
        # Fine terminal shoots and petioles are represented by attached sprays.
        if '-shoot-' in name or '-petiole-' in name or '-leader' in name or name.startswith('apical-'):
            continue
        source=full['paths'][name]
        count=17 if name=='trunk' else 3 if name.startswith('buttress') else 4 if '-fork-' not in name else 2
        points=[sample(source,i/(count-1)) for i in range(count)]
        parent=part['parent']
        if parent:
            socket=closest(points[0],paths[parent])
            delta=socket-points[0]
            points=[p+delta for p in points]
            attachments.append((name,parent,(points[0]-closest(points[0],paths[parent])).length))
        profile=full['profiles'][name]
        radii=[]
        for i in range(count):
            u=i/(count-1)*(len(profile)-1);a=min(len(profile)-2,int(u))
            radii.append(profile[a]+(profile[a+1]-profile[a])*(u-a))
        sides=6 if name=='trunk' else 3 if '-fork-' in name or name.startswith('buttress') else 4
        tube(name,points,radii,sides)
        if name.startswith('limb-'):
            spray(points[-1],points[-1]-points[-2],len(paths))
    spray(paths['trunk'][-1],Vector((.15,1,.2)),71)
    assert all(gap<1e-4 for _,_,gap in attachments)
    return {'parts':parts,'attachmentCount':len(attachments),'maxAttachmentGapMetres':max(x[2] for x in attachments)}


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


report={'asset':'vesper-connected-forest-v1.glb','families':[],'colossalHollowUnchanged':True,'growth':{'treeScale':TREE_SCALE,'branchReach':BRANCH_REACH_SCALE,'branchRadius':BRANCH_RADIUS_SCALE,'leafLength':LEAF_LENGTH_SCALE,'leafWidth':LEAF_WIDTH_SCALE}}
for variant,seed in enumerate([290927,290930,290934]):
    full=make_connected_tree(seed,forest_budget=True)
    maximum_gap=0
    for part in full['structure']:
        if not part['parent']:continue
        gap=(Vector(part['base'])-closest(Vector(part['base']),full['paths'][part['parent']])).length
        assert gap<1e-4
        maximum_gap=max(maximum_gap,gap)
    lod=make_distance_tree(full)
    points=[v for d in full['parts'].values() for v in d['v']]
    radius=max(math.hypot(v[0],v[1]) for v in points)
    top=max(v[2] for v in points)
    scale=tuple(v*TREE_SCALE for v in BASE_SCALES[variant])
    high=mesh_objects('connected_tree_'+str(variant),full,scale)
    low=mesh_objects('connected_tree_lod_'+str(variant),lod,scale)
    for root in [high,low]:
        root['clearanceSize']=[2*radius*scale[0],top*scale[1],2*radius*scale[2]]
        root['connectedTreeFamily']=variant
        root['seed']=seed
        root['rooted']=True
    if variant==1:
        # Retain full-detail pilot construction with the same requested growth.
        pilot=mesh_objects('pilot_connected_elder',make_connected_tree(seed),(TREE_SCALE,TREE_SCALE,TREE_SCALE))
        pilot['approvedPilot']=True
    counts=lambda root:sum(len(p.vertices)-2 for o in root.children for p in o.data.polygons)
    report['families'].append({'variant':variant,'seed':seed,'highTriangles':counts(high),'distanceTriangles':counts(low),'leafCount':full['leafCount'],'attachmentCount':len(full['structure'])-1,'maxAttachmentGapMetres':maximum_gap,'distanceAttachments':lod['attachmentCount'],'distanceMaxAttachmentGapMetres':lod['maxAttachmentGapMetres'],'scale':list(scale)})

bpy.data.orphans_purge(do_recursive=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'vesper-connected-forest.blend'),compress=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(DEST/report['asset']),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_extras=True)
evidence=ROOT.parents[3]/'.experiments/expansion/vesper/leaf-refinement'
evidence.mkdir(parents=True,exist_ok=True)
(evidence/'generator-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('CONNECTED_FOREST_REPORT',json.dumps(report))
