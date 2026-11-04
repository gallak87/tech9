"""Saltwind-only hull with unequal, deeply recessed port service bays.

Run Blender --background --factory-startup --threads 6 --python <this file>.
Original shared carrier sources/exports are read-only inputs. The accepted
large core bay remains the anchor for two unequal adjacent service functions.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import struct
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent
GAME = HERE.parents[4]
OUT = GAME / 'public/assets/levels/nomad/saltwind-gallery.glb'
BLEND = HERE / 'saltwind-gallery.blend'
CONTACTS = HERE / 'saltwind-gallery-collision.json'
HULL = SOURCE / 'carrier-collision.json'
BASE_BLEND = SOURCE / 'nomad-carrier-kit.blend'
NAME = 'nomad_saltwind_gallery'
HULL_NAME = 'nomad_saltwind_hull'
START, END = 28, 140
FIELDS = [(28, 140, 'accepted radiator anchor'), (-140, -80, 'short horizontal cooling bay'), (-62, 12, 'open maintenance gallery')]

bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for item in list(bpy.data.materials):
    bpy.data.materials.remove(item)

def xyz(point):
    return Vector((point[0], -point[2], point[1]))


def game(point):
    return Vector((point.x, point.z, -point.y))


def material(name, colour, metal, rough):
    mat = bpy.data.materials.new('Nomad / ' + name)
    mat.diffuse_color = (*colour, 1)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*colour, 1)
    node.inputs['Metallic'].default_value = metal
    node.inputs['Roughness'].default_value = rough
    if name == 'warm ivory armour':
        node.inputs['Coat Weight'].default_value = .12
        node.inputs['Coat Roughness'].default_value = .45
    return mat


M = {
    'ivory': material('warm ivory armour', (.58, .535, .44), .16, .54),
    'navy': material('navy structural steel', (.026, .043, .058), .62, .49),
    'alloy': material('rubbed warm alloy', (.37, .325, .245), .83, .37),
    'oxide': material('oxide freight enamel', (.58, .17, .043), .14, .47),
}
collection = bpy.data.collections.new('Editable visible port-wall service bay / Saltwind Galleries')
bpy.context.scene.collection.children.link(collection)
root = bpy.data.objects.new('SOURCE__' + NAME, None)
collection.objects.link(root)
SEATS = []


def attach(obj, name, mat, edge=0):
    obj.name = name
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)
    obj.parent = root
    obj.data.materials.append(M[mat])
    if edge:
        mod = obj.modifiers.new('Formed edge radius', 'BEVEL')
        mod.width = edge
        mod.segments = 2 if edge >= .55 else 1
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(24)
        normal = obj.modifiers.new('Weighted manufactured face normals', 'WEIGHTED_NORMAL')
        normal.keep_sharp = True
    return obj


def mesh(name, points, faces, mat, edge=0):
    data = bpy.data.meshes.new(name)
    data.from_pydata([xyz(point) for point in points], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    return attach(obj, name, mat, edge)


def prism(name, profile, start, end, mat, edge=0):
    points = [(x, y, z) for z in [start, end] for x, y in profile]
    n = len(profile)
    faces = [tuple(range(n - 1, -1, -1)), tuple(n + i for i in range(n))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return mesh(name, points, faces, mat, edge)


def box(name, centre, size, mat, edge=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(centre))
    obj = bpy.context.object
    obj.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return attach(obj, name, mat, edge)


def girder(name, start, end, width, depth, mat, edge=.3):
    a, b = xyz(start), xyz(end)
    delta = b - a
    bpy.ops.mesh.primitive_cube_add(size=1, location=(a + b) / 2)
    obj = bpy.context.object
    obj.dimensions = (width, depth, delta.length)
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = delta.to_track_quat('Z', 'Y')
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return attach(obj, name, mat, edge)


def cylinder(name, start, end, radius, mat, segments=16):
    a, b = xyz(start), xyz(end)
    delta = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=radius,
        depth=delta.length, end_fill_type='NGON', location=(a + b) / 2)
    obj = bpy.context.object
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = delta.to_track_quat('Z', 'Y')
    attach(obj, name, mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return obj


# Clone only the editable near hull. Wheels remain level-owned instances from
# the unchanged shared wheel prototype; no shared .blend or GLB is overwritten.
with bpy.data.libraries.load(str(BASE_BLEND), link=False) as (source, target):
    target.collections = ['Editable / nomad_carrier']
body_collection = target.collections[0]
body_collection.name = 'Editable Saltwind-only retained hull'
bpy.context.scene.collection.children.link(body_collection)
body_collection.hide_render = False
body_collection.hide_viewport = False
body = next(obj for obj in body_collection.objects if obj.name.startswith('SOURCE__nomad_carrier') and obj.type == 'EMPTY')
body.name = 'SOURCE__' + HULL_NAME
for obj in body.children_recursive:
    if obj.type != 'MESH':
        continue
    for slot in obj.material_slots:
        if slot.material:
            base = slot.material.name.split('.')[0]
            if base in {mat.name for mat in M.values()}:
                slot.material = next(mat for mat in M.values() if mat.name == base)
bpy.context.view_layer.update()
CHANGES = []


def bounds_of(obj):
    points = [game(obj.matrix_world @ Vector(corner)) for corner in obj.bound_box]
    return ([min(point[axis] for point in points) for axis in range(3)],
            [max(point[axis] for point in points) for axis in range(3)])


def keep_segment(obj, cut, before):
    graph = bpy.context.evaluated_depsgraph_get()
    data = bpy.data.meshes.new_from_object(obj.evaluated_get(graph), preserve_all_data_layers=True, depsgraph=graph)
    data.transform(obj.matrix_world)
    bm = bmesh.new()
    bm.from_mesh(data)
    result = bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
        dist=1e-6, plane_co=xyz((0, 0, cut)), plane_no=xyz((0, 0, 1)),
        clear_outer=before, clear_inner=not before)
    edges = [item for item in result['geom_cut'] if isinstance(item, bmesh.types.BMEdge) and item.is_boundary]
    if edges:
        bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    if not len(data.polygons):
        bpy.data.meshes.remove(data)
        return
    copy = bpy.data.objects.new(obj.name + (' / retained before bay' if before else ' / retained after bay'), data)
    body_collection.objects.link(copy)
    copy.parent = body
    copy.matrix_basis = Matrix.Identity(4)
    copy['nomadCollision'] = bool(obj.get('nomadCollision'))


# Keep real structural breaks at Z=-146,-72 and20. Only the port wall
# fields between them are opened; the accepted Z28..140 bay is authored first.
for start, end, function in FIELDS:
    for obj in list(body.children_recursive):
        if obj.type != 'MESH':
            continue
        low, high = bounds_of(obj)
        if high[0] >= -54 or high[2] <= start or low[2] >= end:
            continue
        label = obj.name.partition(' / ')[2]
        whole_freight = ((function == 'short horizontal cooling bay' and 'seated side freight 1 /' in label)
            or (function == 'open maintenance gallery' and any(token in label for token in [
                'seated side freight 2 /', 'upper restrained freight 2 /', 'upper freight seated tie'])))
        blocker = whole_freight or any(token in label for token in [
            'formed inner shoulder liner', 'inner liner seated retaining strap',
            'upper service gallery', 'seated inner gallery baluster',
            'continuous gallery handrail', 'gallery lower guard',
            'diagonal cargo brace', 'side-gallery service bus',
            'seated side freight 3 /', 'interior crosshead 64 /',
        ])
        if not blocker:
            continue
        CHANGES.append({'name': label, 'field': [start,end], 'function': function,
            'action': 'replace full freight assembly' if whole_freight else 'open port field; retain clipped outside segments',
            'originalBounds': {'min': low, 'max': high}})
        if not whole_freight:
            if low[2] < start:
                keep_segment(obj, start, True)
            if high[2] > end:
                keep_segment(obj, end, False)
        bpy.data.objects.remove(obj, do_unlink=True)

# Profiled inside-only cavities retain the external shoulder skin. The accepted
# anchor Boolean/radius is kept first; added holes do not re-bevel that anchor.
tools = bpy.data.collections.new('Authoring only / Saltwind cavity tools')
bpy.context.scene.collection.children.link(tools)
for start, end, function in FIELDS:
    cavity = prism('AUTHORING ONLY / profiled cavity / '+function,
        [(-54,64),(-78,64),(-86.5,79),(-86.5,103),(-74.5,122),(-54,122)], start,end,'navy')
    cavity.parent = None
    for owner in list(cavity.users_collection):
        owner.objects.unlink(cavity)
    tools.objects.link(cavity)
    cavity.hide_render = True
    cavity.hide_set(True)
    for obj in list(body.children_recursive):
        if obj.type != 'MESH' or 'formed shoulder armour' not in obj.name:
            continue
        low, high = bounds_of(obj)
        if high[0] < -54 and high[2] > start and low[2] < end:
            mod = obj.modifiers.new('Saltwind inside recess / '+function,'BOOLEAN')
            mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cavity
            if function == 'accepted radiator anchor':
                edge=obj.modifiers.new('Manufactured cavity return radius','BEVEL')
                edge.width=.18;edge.segments=1;edge.limit_method='ANGLE';edge.angle_limit=math.radians(30)
            CHANGES.append({'name':obj.name.partition(' / ')[2], 'field':[start,end],
                'action':'profiled inside-only cavity; original exterior shoulder retained'})
bpy.context.view_layer.update()

# Build an exact BVH of the modified substantial source members for new seats.
graph = bpy.context.evaluated_depsgraph_get()
variant_points, variant_faces = [], []
for obj in body.children_recursive:
    if obj.type != 'MESH' or not obj.get('nomadCollision'):
        continue
    data = bpy.data.meshes.new_from_object(obj.evaluated_get(graph), depsgraph=graph)
    data.calc_loop_triangles()
    offset = len(variant_points)
    variant_points.extend(game(obj.matrix_world @ vertex.co) for vertex in data.vertices)
    variant_faces.extend(tuple(offset+i for i in tri.vertices) for tri in data.loop_triangles)
    bpy.data.meshes.remove(data)
variant_tree = BVHTree.FromPolygons(variant_points, variant_faces, all_triangles=True)


def clipped(a, b, c, d, radius):
    return [(a+radius, c), (b-radius, c), (b, c+radius), (b, d-radius),
            (b-radius, d), (a+radius, d), (a, d-radius), (a, c+radius)]


def opening(name, outer, inner, front, back, mat, edge=.25):
    n = len(outer)
    points = [(x, y, z) for x in [front, back] for loop in [outer, inner] for z, y in loop]
    faces = []
    for i in range(n):
        j = (i+1)%n
        faces += [(i,j,n+j,n+i), (2*n+i,3*n+i,3*n+j,2*n+j),
                  (i,2*n+i,2*n+j,j), (n+i,n+j,3*n+j,3*n+i)]
    return mesh(name, points, faces, mat, edge)


# One broad wall-sized canted aperture at racing height. A substantial returned
# casing, three deep cores and an unequal service module replace the old liner.
outer = clipped(START, END, 65, 116, 4)
inner = clipped(START+6, END-6, 72, 109, 3)
opening('single-bay formed canted service-wall coaming', outer, inner, -61.8, -70.3, 'ivory', .65)
opening('service-wall separately seated machined reveal',
    clipped(START+5.3, END-5.3, 71.4, 109.6, 3.2),
    clipped(START+7.5, END-7.5, 74, 107, 2.2), -61.55, -63.3, 'alloy', .18)
# Profiled rear plenum stays inside the preserved external armor skin.
prism('deep profiled navy service-wall rear plenum',
    [(-76,68),(-83.3,80),(-83.3,101.5),(-72.7,118),
     (-71.4,118),(-81.8,101),(-81.8,80.5),(-74.7,69)],
    START+3, END-3, 'navy', .2)
for z in [START+4, 65, 101, END-4]:
    girder('service-wall heavy upper roof return %s' % z,
        (-64,114,z), (-69.5,123,z), 4.5, 6, 'navy', .3)
    girder('service-wall deep transverse lower load frame %s' % z,
        (-64,69,z), (-82.5,80,z), 3.7, 5, 'navy', .25)
    girder('service-wall seated longitudinal jamb %s' % z,
        (-66,75,z), (-67.5,108,z), 2.5, 3.8, 'navy', .2)
# Real deep cores are unequal, with broad blades canted toward the approaching
# driver. Neither an upper slab nor the previous gallery masks their face.
for index, (a,b) in enumerate([(37,62),(68,99),(105,131)]):
    opening('cooling core %d / dark formed carrier' % index,
        clipped(a,b,74.5,107,1.8), clipped(a+2,b-2,77,104.5,1.2),
        -64.5,-78.8,'navy',.25)
    for vane in range(5):
        z=a+3+(b-a-6)*(vane+.5)/5
        profile=[(-65.1,77.5),(-66,77.5),(-77.6,102.7),
                 (-77.6,104),(-76.8,104),(-65.1,79)]
        prism('cooling core %d / large folded blade %d' % (index,vane),
            profile,z-.9,z+.9,'navy',.12)
        girder('cooling core %d / exposed alloy blade return %d' % (index,vane),
            (-65.2,78.2,z),(-77.2,103.4,z),.7,.9,'alloy',.12)
    for y in [76,105.5]:
        box('cooling core %d / seated end header' % index,
            (-72,y,(a+b)/2),(10,2,b-a-2),'navy',.2)
# One lower oxide process cover reads as a service function rather than freight.
box('recessed oxide pressure-service cover',(-64.7,83,116),(1.4,14,19),'oxide',.3)
for z in [108,124]:
    cylinder('service cover machined seated locking shaft',
        (-63.6,77,z),(-63.6,89,z),.45,'alloy',12)
# A shallow open toe service walk below the working faces is visibly supported;
# it remains OUTWARD of the original X=-56.8 inner portal boundary.
for z in range(32,140,6):
    box('open wall-toe transverse tread %s' % z,(-64.5,64.6,z),(6,.7,1.5),'alloy',.12)
for x in [-67,-61.5]:
    box('continuous wall-toe structural rail %s' % x,(x,63.7,84),(1.3,1.8,112),'navy',.18)
# The wall header carries the retained ceiling crosshead at Z64 and joins the
# original roof, so removing one interior cheek does not sever its load path.
box('continuous wall-to-roof deep navy header',(-69,120.8,84),(7,5,112),'navy',.35)
girder('retained roof-crosshead connected wall capital',
    (-69,123,64),(-56.5,123,64),4,4,'alloy',.25)

# Short cooling field: horizontal folded core fins and a recessed circulation
# hub give this bay a different function/profile from the accepted vertical cores.
a,b=-140,-80
opening('short cooling bay / broad returned armor coaming',
    clipped(a,b,67,114,3.5),clipped(a+5,b-5,74,108,2.5),-63.8,-71,'ivory',.6)
opening('short cooling bay / machined inset transition',
    clipped(a+4.5,b-4.5,73.5,108.5,2.7),clipped(a+6.5,b-6.5,76,106,1.5),-63.6,-65.3,'alloy',.18)
prism('short cooling bay / profiled rear plenum',
    [(-76,68),(-83.3,80),(-83.3,101.5),(-72.7,118),(-71.4,118),(-81.8,101),(-81.8,80.5),(-74.7,69)],
    a+3,b-3,'navy',.2)
for index,y in enumerate([77,83,89,95,101]):
    prism('short cooling bay / broad horizontal folded fin %s'%index,
        [(-65.1,y),(-66,y),(-80.5,y+3.8),(-82,y+3.8),(-82,y+5),(-80.3,y+5),(-65.1,y+1.2)],
        a+7,b-7,'navy',.15)
    box('short cooling bay / exposed broad fin return %s'%index,
        (-65.5,y+.7,(a+b)/2),(1,1,b-a-15),'alloy',.13)
for z in [a+4,b-4]:
    girder('short cooling bay / vertical plenum load frame %s'%z,(-68,72,z),(-69,111,z),3.7,4.4,'navy',.2)
cylinder('short cooling bay / recessed circulation hub',(-83,92,-111),(-77.8,92,-111),5.5,'navy',20)
cylinder('short cooling bay / machined circulation boss',(-77.9,92,-111),(-76.9,92,-111),3.5,'alloy',20)
for z,target in [(a,-146),(b,-72)]:
    girder('short cooling bay / connected retained-frame shoulder %s'%z,
        (-69,121,z),(-69,123,target),4,4,'navy',.25)
box('short cooling bay / continuous upper load header',(-69,120.8,(a+b)/2),(7,5,b-a),'navy',.3)

# Unequal middle field: a deep open maintenance gallery, with a real tread floor
# and process-access cover behind it, leaves open space rather than another core.
a,b=-62,12
opening('maintenance gallery / returned open wall surround',
    clipped(a,b,66,115,4),clipped(a+5,b-5,74,110,2.5),-63.5,-71,'ivory',.6)
opening('maintenance gallery / separately seated alloy reveal',
    clipped(a+4.5,b-4.5,73.5,110.5,2.7),clipped(a+6.5,b-6.5,76,108,1.5),-63.3,-65,'alloy',.15)
prism('maintenance gallery / recessed profiled structural wall',
    [(-76,68),(-83.3,80),(-83.3,101.5),(-72.7,118),(-71.4,118),(-81.8,101),(-81.8,80.5),(-74.7,69)],
    a+3,b-3,'navy',.2)
box('maintenance gallery / dark process-access seat',(-82,93,-24),(2,30,32),'navy',.4)
box('maintenance gallery / recessed oxide pressure door',(-80.8,93,-24),(1.5,26,27),'oxide',.4)
for z in [-35,-13]:
    cylinder('maintenance gallery / seated door lock shaft %s'%z,(-79.6,82,z),(-79.6,104,z),.5,'alloy',12)
for z in [-49,1]:
    cylinder('maintenance gallery / wall circulation feed %s'%z,(-79.5,81,z),(-79.5,108,z),1.4,'navy',14)
    for y in [83,105]:
        cylinder('maintenance gallery / fitted circulation collar %s %s'%(z,y),
            (-79.5,y-.8,z),(-79.5,y+.8,z),1.9,'alloy',14)
for z in range(a+4,b-2,7):
    box('maintenance gallery / open transverse tread %s'%z,(-72.5,77,z),(16,.65,1.6),'alloy',.12)
for x in [-80,-65]:
    box('maintenance gallery / separated load keel %s'%x,(x,76.1,(a+b)/2),(1.5,2,b-a-2),'navy',.18)
for y in [79.5,83.1]:
    cylinder('maintenance gallery / continuous open guard %s'%y,(-64.6,y,a+3),(-64.6,y,b-3),.35,'alloy',12)
for z in range(a+5,b-2,16):
    box('maintenance gallery / seated guard stanchion %s'%z,(-64.6,80,z),(.7,6.5,.8),'alloy',.12)
for z in [a+4,b-4]:
    girder('maintenance gallery / deep lower gallery seat %s'%z,(-65,76,z),(-82,80,z),3.5,4,'navy',.2)
    girder('maintenance gallery / open roof hanger %s'%z,(-66,108,z),(-69,123,z),3,4,'navy',.2)
box('maintenance gallery / continuous upper load header',(-69,120.8,(a+b)/2),(7,5,b-a),'navy',.3)
for z,target in [(a,-72),(b,20)]:
    girder('maintenance gallery / retained-frame upper connection %s'%z,(-69,121,z),(-69,123,target),4,4,'navy',.25)

# Canted face geometry leans outward into the original wall depth. Existing
# original inner limit X=-56.8 remains unoccupied throughout racing height.
for obj in root.children_recursive:
    if obj.type != 'MESH':
        continue
    obj.data.transform(obj.matrix_world)
    obj.matrix_basis = Matrix.Identity(4)
    for vertex in obj.data.vertices:
        p = game(vertex.co)
        if p.y <= 116 and p.x > -79:
            p.x -= .14 * max(0,p.y-66)
        vertex.co = xyz(p)
    obj.data.update()
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()

# Fitted structural seats are measured on the actual revised shoulder cavity,
# plus unchanged roof contacts. They are appended after the canted face shape.
for z in [42,121,-129,-91,-52,2]:
    for y in [81,103]:
        point,normal,triangle,distance=variant_tree.ray_cast(Vector((-54,y,z)),Vector((-1,0,0)),50)
        assert point is not None and -89<point.x<-73,(y,z,point)
        SEATS.append({'name':'revised shoulder seat %s %s'%(y,z),
            'position':list(point),'normal':list(normal),'sourceTriangle':triangle,'sourcePrototype':HULL_NAME})
        box('fitted revised-shoulder load shoe %s %s'%(y,z),
            (point.x+.2,y,z),(1.5,7,8),'alloy',.18)
        girder('visible deep shoulder load strut %s %s'%(y,z),
            point+normal*.9,(-68,y,z),4,5,'navy',.25)
for z in [37,84,132,-129,-90,-50,-5]:
    point,normal,triangle,distance=variant_tree.ray_cast(Vector((-65,115,z)),Vector((0,1,0)),20)
    assert point is not None and 123<point.y<131,(z,point)
    SEATS.append({'name':'retained roof bay seat %s'%z,
        'position':list(point),'normal':list(normal),'sourceTriangle':triangle,'sourcePrototype':HULL_NAME})
    box('fitted retained-roof bay saddle %s'%z,(-65,point.y-.35,z),(7,1.2,9),'alloy',.2)
    girder('roof-seated wall header stool %s'%z,point-Vector((0,.5,0)),(-69,122,z),3.5,4.5,'navy',.2)

bpy.context.scene.unit_settings.system='METRIC'
bpy.context.scene.unit_settings.scale_length=1
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.context.view_layer.update()
ROOTS={HULL_NAME:body,NAME:root}
exports,prototypes,contacts=[],[],[]
graph=bpy.context.evaluated_depsgraph_get()
for name,source in ROOTS.items():
    export=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(export);exports.append(export)
    batches,positions,indices,parts={},[],[],[]
    all_points=[]
    for obj in source.children_recursive:
        if obj.type!='MESH':continue
        data=bpy.data.meshes.new_from_object(obj.evaluated_get(graph),preserve_all_data_layers=True,depsgraph=graph)
        data.transform(obj.matrix_world);data.calc_loop_triangles()
        all_points.extend(game(v.co) for v in data.vertices)
        if name==NAME or obj.get('nomadCollision'):
            begin,offset=len(indices),len(positions)//3
            for vertex in data.vertices:positions.extend(round(v,6) for v in game(vertex.co))
            for tri in data.loop_triangles:indices.extend(offset+i for i in tri.vertices)
            parts.append({'name':obj.name.partition(' / ')[2] or obj.name,'indexStart':begin,'indexCount':len(indices)-begin})
        copy=bpy.data.objects.new('EXPORT__'+obj.name,data);bpy.context.scene.collection.objects.link(copy);copy.parent=export
        batches.setdefault(obj.data.materials[0].name,[]).append(copy)
    for mat,objects in batches.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        batch=bpy.context.object;batch.name=name+'__'+mat.split(' / ')[-1].replace(' ','_')
        batch.data.transform(batch.matrix_basis);batch.matrix_basis=Matrix.Identity(4)
    prototypes.append({'name':name,'materialBatches':len(batches),
        'bounds':{'min':[min(p[a] for p in all_points) for a in range(3)],'max':[max(p[a] for p in all_points) for a in range(3)]}})
    contacts.append({'name':name,'positions':positions,'indices':indices,'parts':parts,'triangles':len(indices)//3})
CONTACTS.write_text(json.dumps({'version':2,'coordinates':'+Y up, +Z bow; metres in nomad-saltwind carrier local frame',
    'source':'Exact evaluated revised hull substantial members and complete new wall assembly. Original small cosmetic hull fittings are excluded as before. No collision boxes.',
    'prototypes':contacts},separators=(',',':'))+'\n')
bpy.ops.object.select_all(action='DESELECT')
for obj in exports:
    obj.select_set(True)
    for child in obj.children_recursive:child.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_apply=True,
    export_extras=True,export_yup=True,export_cameras=False,export_lights=False,export_animations=False)
raw=OUT.read_bytes();length=struct.unpack_from('<I',raw,12)[0];gltf=json.loads(raw[20:20+length])
for record in prototypes:
    node=next(n for n in gltf['nodes'] if n.get('name')==record['name'])
    record['triangles']=sum(gltf['accessors'][p['indices']]['count']//3 for child in node.get('children',[])
        for p in gltf['meshes'][gltf['nodes'][child]['mesh']]['primitives'] if 'mesh' in gltf['nodes'][child])
    record['collisionTriangles']=next(c['triangles'] for c in contacts if c['name']==record['name'])
record={'title':'Nomad Procession / Saltwind unequal recessed service-wall bays',
    'generator':'Original retained editable carrier cloned locally; unequal port-side cooling, maintenance-gallery and accepted radiator fields open from inside while retaining structural breaks, exterior armor, roof, cargo portals, running gear and proportions.',
    'source':Path(__file__).name,'blend':BLEND.name,'runtimeAsset':str(OUT.relative_to(GAME)),'collision':CONTACTS.name,
    'coordinates':'+Y up,+Z bow,metres. Replace ONLY nomad-saltwind base hull with nomad_saltwind_hull, retain shared wheel instances, add nomad_saltwind_gallery at identity. Exact hull collider replaces its original body; gallery collider is additive.',
    'rights':'Project-authored retained carrier and original new Blender meshes with existing Nomad material aliases; no external models, textures or baked lighting.',
    'reference':'../../reference/nomad-procession-original.png','sourceHull':'../carrier-collision.json','sourceBlend':'../nomad-carrier-kit.blend',
    'wallBays':[{'sourceZ':[a,b],'function':function} for a,b,function in FIELDS],
    'retainedStructuralBreaks':[-146,-72,20,145],
    'prototypes':prototypes,'actualRevisedHullSeats':SEATS,'hullChanges':CHANGES,
    'clearance':'New racing-height structure remains outward of the original innermost X=-56.8 portal boundary. Deep cavity follows external shoulder profile and retains3-4m outer skin. Roof and true cargo portals stay unchanged; validate actual native road/flight/camera encounter.',
    'replacement':'Replace only carrier9 original hull/collider; original generic suspendedGallery remains omitted. Three unequal visible wall fields retain original structural breaks and the accepted large radiator anchor.',
    'materials':sorted({mat.name for source in ROOTS.values() for obj in source.children_recursive if obj.type=='MESH' for mat in obj.data.materials}),
    'hashes':{str(p.relative_to(HERE)) if p.is_relative_to(HERE) else p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),BLEND,OUT,CONTACTS,HULL,BASE_BLEND]}}
(HERE/'saltwind-gallery-provenance.json').write_text(json.dumps(record,indent=2)+'\n')
print('NOMAD_SALTWIND_WALL_VARIANT '+json.dumps(prototypes))
