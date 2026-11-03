"""Original editable Ravel anchor-fleet kit; Blender background builder.
Run Blender --background --factory-startup --python <this file> -- --stage carrier|all.
Game coordinates: metres, X beam, Y up, +Z bow. No external meshes/textures.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
import bmesh
from mathutils import Vector

ASSET = Path(__file__).resolve().parent
GAME = ASSET.parents[3]
OUT = GAME / 'public/assets/levels/ravel/anchor-fleet.glb'
BLEND = ASSET / 'ravel-anchor-fleet.blend'
TEMP = GAME / '.experiments/ravel-anchor-fleet'
args = argparse.ArgumentParser()
args.add_argument('--stage', choices=['carrier', 'all'], default='all')
args.add_argument('--render', action='store_true')
args = args.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])

bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.materials):
    bpy.data.materials.remove(block)


def xyz(point):
    x, y, z = point
    return Vector((x, -z, y))


def material(name, colour, metal=0.0, rough=0.4, emission=0.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*colour, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*colour, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if 'Coat Weight' in p.inputs and name.startswith('Ceramic'):
        p.inputs['Coat Weight'].default_value = 0.32
        p.inputs['Coat Roughness'].default_value = 0.23
    if emission:
        p.inputs['Emission Color'].default_value = (*colour, 1)
        p.inputs['Emission Strength'].default_value = emission
    return m


M = {
    'ivory': material('Ceramic / warm ivory', (0.67, 0.63, 0.51), 0.12, 0.29),
    'service': material('Ceramic / cool service', (0.25, 0.34, 0.37), 0.2, 0.34),
    'graphite': material('Graphite / structural carbon', (0.022, 0.035, 0.042), 0.5, 0.38),
    'titanium': material('Titanium / formed fittings', (0.38, 0.44, 0.45), 0.82, 0.26),
    'copper': material('Copper / heat and tension hardware', (0.44, 0.205, 0.09), 0.78, 0.32),
    'void': material('Interior / deep graphite', (0.007, 0.012, 0.017), 0.12, 0.68),
    'glass': material('Bridge / recessed blue glazing', (0.018, 0.065, 0.09), 0.45, 0.16),
    'amber': material('Power / warm service lights', (1.0, 0.43, 0.12), 0.15, 0.28, 2.1),
    'blue': material('Power / ion engine chambers', (0.12, 0.4, 1.0), 0.1, 0.24, 2.5),
}
SOURCES = {}
ANCHORS = {}


def root(name):
    o = bpy.data.objects.new('SOURCE__' + name, None)
    collection = bpy.data.collections.new('Source / ' + name)
    bpy.context.scene.collection.children.link(collection)
    collection.objects.link(o)
    SOURCES[name] = o
    ANCHORS[name] = []
    o['prototype'] = name
    return o


def parent_object(o, name, mat, parent):
    o.name = parent.name + ' / ' + name
    if mat is not None:
        o.data.materials.append(M[mat])
    o.parent = parent
    target = parent.users_collection[0]
    for collection in list(o.users_collection):
        collection.objects.unlink(o)
    target.objects.link(o)
    return o


def bevel(o, width=0.7, segments=2):
    if width <= 0:
        return o
    mod = o.modifiers.new('Manufactured edge radii', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(25)
    normal = o.modifiers.new('Weighted broad panel normals', 'WEIGHTED_NORMAL')
    normal.keep_sharp = True
    return o


def box(name, centre, size, mat, parent, edge=0.5):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(centre))
    o = bpy.context.object
    o.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    parent_object(o, name, mat, parent)
    return bevel(o, min(edge, min(size) * 0.2))


def mesh(name, vertices, faces, mat, parent, edge=0.0):
    data = bpy.data.meshes.new(name)
    data.from_pydata([xyz(p) for p in vertices], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    o = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(o)
    parent_object(o, name, mat, parent)
    return bevel(o, edge)


def beam(name, a, b, radius, mat, parent, vertices=16):
    start, finish = xyz(a), xyz(b)
    delta = finish - start
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=delta.length, end_fill_type='NGON', location=(start+finish)/2)
    o = bpy.context.object
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = delta.to_track_quat('Z', 'Y')
    parent_object(o, name, mat, parent)
    for polygon in o.data.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return bevel(o, min(radius * .06, .18), 1) if radius > 3 else o


def loft(name, stations, centre_x, mat, parent, open_side=None, bay_range=(-120,105)):
    # Eight broad formed faces, with a real omitted outer service-bay side.
    profile = [(-.72,1),(.72,1),(1,.55),(1,-.55),(.72,-1),(-.72,-1),(-1,-.55),(-1,.55)]
    vertices=[]
    for z,w,y,h in stations:
        vertices += [(centre_x+x*w, y+v*h, z) for x,v in profile]
    faces=[]
    for row in range(len(stations)-1):
        midpoint=(stations[row][0]+stations[row+1][0])/2
        for col in range(8):
            openings = open_side if isinstance(open_side, (list, tuple)) else [open_side]
            if col in openings and bay_range[0] < midpoint < bay_range[1]:
                continue
            faces.append((row*8+col,row*8+(col+1)%8,(row+1)*8+(col+1)%8,(row+1)*8+col))
    # The aft opening is real: no solid cap may occlude the engine throats.
    faces += [tuple((len(stations)-1)*8+i for i in range(8))]
    o=mesh(name,vertices,faces,mat,parent,.9)
    solid=o.modifiers.new('Formed skin thickness', 'SOLIDIFY')
    solid.thickness=.6
    return o


def prism(name, polygon, low, high, mat, parent, edge=.5):
    # Polygon in game X/Z, extruded in game Y.
    vertices=[(x,y,z) for y in [low,high] for x,z in polygon]
    n=len(polygon)
    faces=[tuple(range(n-1,-1,-1)),tuple(n+i for i in range(n))]
    faces += [(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)]
    return mesh(name,vertices,faces,mat,parent,edge)


def lathe(name, centre, profile, mat, parent, segments=64, axis='z'):
    # Profile consists of axial/radial pairs and may be closed to form a shell.
    vertices=[]
    for along,r in profile:
        for j in range(segments):
            a=2*math.pi*j/segments
            if axis=='z': q=(r*math.cos(a),r*math.sin(a),along)
            elif axis=='x': q=(along,r*math.cos(a),r*math.sin(a))
            else: q=(r*math.cos(a),along,r*math.sin(a))
            vertices.append(tuple(centre[k]+q[k] for k in range(3)))
    faces=[]
    for row in range(len(profile)-1):
        for j in range(segments):
            faces.append((row*segments+j,row*segments+(j+1)%segments,(row+1)*segments+(j+1)%segments,(row+1)*segments+j))
    o=mesh(name,vertices,faces,mat,parent)
    for poly in o.data.polygons: poly.use_smooth=True
    return o


def anchor(parent,name,position,kind):
    ANCHORS[parent['prototype']].append({'name':name,'position':position,'kind':kind})


def nozzle(parent,x,y,z,r,number):
    lathe('engine %d / seated collar'%number,(x,y,z),[(-3,r*1.12),(0,r*1.2),(7,r*1.15),(9,r*.96),(2,r*.9),(-3,r*.92),(-3,r*1.12)],'titanium',parent,72)
    lathe('engine %d / copper pressure sleeve'%number,(x,y,z),[(3,r*.93),(17,r*.8),(27,r*.65),(27,r*.54),(11,r*.62),(3,r*.8),(3,r*.93)],'copper',parent,64)
    lathe('engine %d / recessed throat'%number,(x,y,z),[(1,r*.87),(12,r*.66),(23,r*.52)],'void',parent,64)
    beam('engine %d / ion chamber'%number,(x,y,z+23),(x,y,z+24),r*.5,'blue',parent,48)
    for j in range(8):
        a=2*math.pi*j/8
        a0=(x+math.cos(a)*r*1.03,y+math.sin(a)*r*1.03,z+1)
        a1=(x+math.cos(a)*r*.77,y+math.sin(a)*r*.77,z+17)
        beam('engine %d / nozzle keeper'%number,a0,a1,r*.07,'graphite',parent,10)
    anchor(parent,'engine_%d'%number,(x,y,z),'engine')


def radiator(parent,name,x,y,z,width,length,rows=18):
    box(name+' / deep carrier',(x,y,z),(width,4,length),'graphite',parent,.7)
    for j in range(rows):
        q=z-length/2+(j+.5)*length/rows
        box(name+' / folded copper fin %d'%j,(x,y+2.4,q),(width-1,1.2,length/rows*.55),'copper',parent,.25)
    for side in [-1,1]:
        beam(name+' / coolant manifold',(x+side*width*.43,y+3,z-length/2),(x+side*width*.43,y+3,z+length/2),.8,'titanium',parent,16)


def reel(parent,name,centre,radius=22,width=22,axis='x'):
    lathe(name+' / cable bed',centre,[(-width/2,radius*.72),(-width/2+.8,radius),(-width/2+3,radius),(width/2-3,radius),(width/2-.8,radius),(width/2,radius*.72)],'graphite',parent,96,axis)
    for side in [-1,1]:
        q=side*width/2
        lathe(name+' / formed flange',centre,[(q-1.2,radius*.4),(q-1.2,radius*1.06),(q+.8,radius*1.06),(q+.8,radius*.4),(q-1.2,radius*.4)],'titanium',parent,96,axis)
    for j in range(11):
        a=-width*.36+j*width*.072
        lathe(name+' / wound cable',centre,[(a-.32,radius*.94),(a+.32,radius*.94)],'copper',parent,80,axis)
    # Six large structural spokes instead of a filled flat flange.
    for side in [-1,1]:
        q=side*(width/2+1)
        for j in range(6):
            a=2*math.pi*j/6
            if axis=='x':
                p0=(centre[0]+q,centre[1]+math.cos(a)*radius*.25,centre[2]+math.sin(a)*radius*.25)
                p1=(centre[0]+q,centre[1]+math.cos(a)*radius*.9,centre[2]+math.sin(a)*radius*.9)
            else:
                p0=(centre[0]+math.cos(a)*radius*.25,centre[1]+q,centre[2]+math.sin(a)*radius*.25)
                p1=(centre[0]+math.cos(a)*radius*.9,centre[1]+q,centre[2]+math.sin(a)*radius*.9)
            beam(name+' / spoke',p0,p1,radius*.07,'copper',parent,12)


def service_bay(parent,side,z0=-120,z1=100):
    x=side*42
    box('service bay / deep inner bulkhead',(x-side*15,1,(z0+z1)/2),(3,31,z1-z0),'void',parent,.3)
    box('service bay / lower work deck',(x, -16,(z0+z1)/2),(35,3,z1-z0),'graphite',parent,.6)
    box('service bay / upper lintel',(x,17,(z0+z1)/2),(36,4,z1-z0),'titanium',parent,.7)
    for z in [z0,-60,0,60,z1]:
        box('service bay / seated rib',(x+side*15,0,z),(5,35,4),'titanium',parent,.6)
        box('service bay / warm task strip',(x+side*12,12,z+2.2),(1.4,1.5,3),'amber',parent,.1)
    for z in [-90,-30,30,85]:
        box('service bay / recessed equipment bank',(x-side*10,0,z),(6,19,24),'service',parent,.7)
        for h in [-4,1,6]:
            box('service bay / cabinet louvre',(x-side*5.9,h,z),(.7,1.2,19),'graphite',parent,.1)
    # Long open rail line is attached to the deck rather than painted on a wall.
    for y in [-11,-6]:
        beam('service bay / safety rail',(x+side*18,y,z0),(x+side*18,y,z1),.42,'copper',parent,10)
    for z in range(-120,101,22):
        beam('service bay / rail post',(x+side*18,-14,z),(x+side*18,-5,z),.35,'titanium',parent,10)


def build_carrier():
    p=root('loom_carrier')
    stations=[(-228,9,-4,15),(-210,18,-1,25),(-160,22,0,28),(-120,22,0,28),(-30,21,0,28),(60,21,1,27),(100,20,2,26),(165,17,4,22),(220,7,3,12),(230,1,2,5)]
    for side in [-1,1]:
        loft('port hull' if side<0 else 'starboard hull',stations,side*42,'ivory',p,6 if side<0 else 2)
        service_bay(p,side)
        for z in [-190,-130,110,175]:
            box('formed graphite keel shoe',(side*42,-28,z),(28,10,38),'graphite',p,2)
        for z in [-168,136]:
            box('crosshead / carbon load spine',(0,-7,z),(126,20,28),'graphite',p,2)
            box('crosshead / fitted titanium cap',(0,7,z),(130,8,24),'titanium',p,1.4)
        for z in [-190,140]: radiator(p,'dorsal radiator',side*42,36,z,24,44,18)
        for j,y in enumerate([-11,11]): nozzle(p,side*42,y,-228,10.5,(0 if side<0 else 2)+j)
        cx=side*42
        # Large separately seated armor assemblies give the hull its hierarchy.
        prism('aft engine armor carrier',[(cx-20,-216),(cx+20,-216),(cx+21,-155),(cx-21,-155)],23,28,'graphite',p,1.2)
        prism('aft formed service armor',[(cx-19,-213),(cx+19,-213),(cx+19,-158),(cx-19,-158)],27,34,'service',p,1.6)
        prism('midship top service cassette',[(cx-13,-105),(cx+14,-105),(cx+16,-80),(cx+16,67),(cx+10,82),(cx-13,82)],27.5,31,'service',p,.9)
        prism('bow ceramic shoulder carrier',[(cx-20,109),(cx+20,109),(cx+17,170),(cx+5,207),(cx-9,198),(cx-18,155)],23,27,'graphite',p,1)
        prism('bow formed ceramic shoulder',[(cx-18,112),(cx+18,112),(cx+15,168),(cx+4,204),(cx-8,195),(cx-16,154)],26.5,32,'ivory',p,1.2)
    # The open central loom well stays empty: the real crossheads carry its load.
    box('central keel',(0,-30,-15),(24,14,330),'graphite',p,2.5)
    for z in [-130,-70,-10,50,110]:
        for side in [-1,1]:
            beam('loom well / diagonal stay',(side*10,-27,z),(side*31,-5,z+22),1.7,'titanium',p,20)
    prism('forward command saddle',[(-24,126),(46,126),(43,183),(-12,197)],18,34,'ivory',p,1.6)
    prism('bridge / dark recessed coaming',[(-20,135),(39,135),(36,178),(-10,188)],32,41,'graphite',p,1)
    prism('bridge / glazing face',[(-17,140),(35,140),(32,174),(-9,183)],34,39.2,'glass',p,.5)
    for z in [142,153,164,175]:
        box('bridge / seated glazing mullion',(9,39.5,z),(47,.8,1.2),'titanium',p,.2)
    prism('bridge / floating ceramic roof',[(-22,132),(42,132),(39,181),(-10,194)],40.5,44.5,'ivory',p,1.1)
    # Asymmetric loom machinery: one large spool and two paired service drums.
    reel(p,'port main cable reel',(-22,9,-60),22,20,'x')
    reel(p,'starboard upper return reel',(19,12,30),16,15,'x')
    for side,z in [(-1,-148),(1,112)]:
        box('tension socket / graphite seated foot',(side*57,19,z),(20,14,28),'graphite',p,1)
        lathe('tension socket / bronze bearing',(side*65,22,z),[(-6,6),(-6,11),(6,11),(6,6),(-6,6)],'copper',p,64,'x')
        beam('tension socket / titanium pin',(side*56,22,z),(side*72,22,z),5.7,'titanium',p,48)
        anchor(p,'cable_socket_port' if side<0 else 'cable_socket_starboard',(side*72,22,z),'cable')
    for side in [-1,1]:
        for z in [-110,-55,0,55,100]:
            box('deck / warm navigation lamp',(side*60,25,z),(2,1.7,6),'amber',p,.2)
    # Large aft gantry has real feet, paired truss chords and an open centre.
    for side in [-1,1]:
        box('gantry / seated pylon',(side*58,3,-174),(14,55,18),'service',p,1.8)
        beam('gantry / diagonal pylon stay',(side*59,-16,-196),(side*58,29,-165),2,'titanium',p,24)
    for y in [26,34]: beam('gantry / transverse chord',(-60,y,-171),(60,y,-171),2.4,'titanium',p,24)
    for j in range(8):
        x=-56+j*14
        beam('gantry / web diagonal',(x,26,-171),(x+14,34,-171),1.1,'copper',p,16)
    return p


def build_cutter():
    p=root('anchor_cutter')
    stations=[(-88,11,-2,12),(-68,25,0,18),(-25,30,0,20),(26,24,1,19),(64,13,2,12),(90,1,1,4)]
    loft('formed cutter hull',stations,0,'ivory',p,[2,6],(-25,26))
    prism('exposed lower keel',[(-15,-82),(15,-82),(22,18),(4,76),(-5,76),(-22,18)],-25,-14,'graphite',p,1.4)
    for side in [-1,1]:
        box('outer aft service pod',(side*26,-1,-50),(12,26,48),'service',p,1.6)
        nozzle(p,side*15,-3,-89,8.4,0 if side<0 else 1)
        radiator(p,'lateral folded radiator',side*24,20,-16,14,45,20)
        box('recessed flank bay / inner bulkhead',(side*13,0,1),(3,17,44),'void',p,.4)
        box('recessed flank bay / seated deck',(side*22,-10,1),(20,2,44),'graphite',p,.5)
        box('recessed flank bay / lintel',(side*22,10,1),(20,2,44),'titanium',p,.5)
        for z in [-8,9,25]:
            box('bay / seated retaining frame',(side*31,0,z),(3,18,2),'titanium',p,.3)
    prism('bridge / raised graphite coaming',[(-12,5),(17,5),(12,45),(-8,51)],18,25,'graphite',p,1)
    prism('bridge / recessed glazing',[(-9,9),(13,9),(9,42),(-6,47)],24,26,'glass',p,.4)
    prism('bridge / formed roof',[(-13,3),(18,3),(13,46),(-8,53)],27,30,'ivory',p,.8)
    # Starboard articulated cable claw, asymmetric with the port cooling bank.
    for z in [-20,17]:
        beam('anchor claw / cast arm',(22,7,z),(39,4,z+7),3.6,'titanium',p,32)
        lathe('anchor claw / seated joint',(38,4,z+7),[(-3,3),(-3,7),(3,7),(3,3),(-3,3)],'copper',p,64,'x')
    reel(p,'cutter winch',(0,11,-41),13,18,'x')
    for z in [-60,-20,20,60]: box('dorsal task lamp',(0,23,z),(3,1,4),'amber',p,.1)
    anchor(p,'cable_socket_starboard',(40,4,12),'cable')
    anchor(p,'tow_eye',(0,-13,-90),'tow')
    return p


def c_arc(parent,name,radius,width,depth,start,end,mat,segments=112):
    # C-frame lies in game X/Y; Z is its physical depth.
    vertices=[]
    profile=[(-width/2,-depth/2),(width/2,-depth/2),(width/2,depth/2),(-width/2,depth/2)]
    for i in range(segments+1):
        a=start+(end-start)*i/segments
        for radial,z in profile:
            vertices.append(((radius+radial)*math.cos(a),(radius+radial)*math.sin(a),z))
    faces=[]
    for i in range(segments):
        for j in range(4): faces.append((4*i+j,4*i+(j+1)%4,4*(i+1)+(j+1)%4,4*(i+1)+j))
    faces.extend([(3,2,1,0),tuple(4*segments+i for i in range(4))])
    return mesh(name,vertices,faces,mat,parent,.7)


def build_spindle():
    p=root('tension_spindle')
    start,end=math.radians(38),math.radians(322)
    c_arc(p,'continuous graphite C keel',147,20,28,start,end,'graphite')
    c_arc(p,'outer formed titanium flange',158,8,36,start,end,'titanium')
    c_arc(p,'inner copper carrier',134,7,24,start,end,'copper')
    # Unequal ceramic shields expose the deep working keel between assemblies.
    for j in range(12):
        a=start+(end-start)*j/12+.025
        b=start+(end-start)*(j+1)/12-.025
        c_arc(p,'ceramic shield segment %d'%j,148,21,17,a,b,'ivory',12)
    for j in range(19):
        a=start+(end-start)*(j+.35)/19
        for z in [-18,18]:
            x,y=146*math.cos(a),146*math.sin(a)
            tangent=(-math.sin(a),math.cos(a))
            beam('C frame / transverse rib',(x-10*math.cos(a),y-10*math.sin(a),z),(x+12*math.cos(a),y+12*math.sin(a),z),1.3,'titanium',p,16)
            if j%3==0:
                box('C frame / warm index lamp',(x,y,z+(.7 if z>0 else -.7)),(4,3,1.4),'amber',p,.15)
    for i,a in enumerate([math.radians(60),math.radians(150),math.radians(242)]):
        x,y=147*math.cos(a),147*math.sin(a)
        reel(p,'spindle reel %d'%i,(x,y,0),22,32,'x')
        box('reel / anchored drive shoe',(x,y-15,5),(34,20,33),'service',p,1.5)
        anchor(p,'cable_socket_%d'%i,(x,y,25),'cable')
    for side,a in enumerate([start,end]):
        x,y=147*math.cos(a),147*math.sin(a)
        box('C opening / jaw housing',(x,y,0),(35,28,45),'service',p,2)
        for z in [-16,16]:
            beam('C opening / seated clevis pin',(x-17,y,z),(x+17,y,z),5,'titanium',p,48)
        anchor(p,'jaw_%d'%side,(x,y,26),'jaw')
    return p


build_carrier()
if args.stage=='all':
    build_cutter()
    build_spindle()

# Save editable assemblies before the export-only material consolidation.
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
scene.unit_settings.scale_length=1
scene.world.color=(.12,.14,.17)
for prototype, source in SOURCES.items():
    source.users_collection[0].hide_viewport = prototype != 'loom_carrier'
    source.users_collection[0].hide_render = prototype != 'loom_carrier'
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
for source in SOURCES.values():
    source.users_collection[0].hide_viewport = False
    source.users_collection[0].hide_render = False
bpy.context.view_layer.update()

export_roots=[]
stats=[]
for prototype,source in SOURCES.items():
    export=bpy.data.objects.new(prototype,None)
    bpy.context.collection.objects.link(export)
    export['assetKind']='ravel-anchor-fleet'
    export_roots.append(export)
    dg=bpy.context.evaluated_depsgraph_get()
    batches={}
    for obj in list(source.children_recursive):
        if obj.type!='MESH': continue
        data=bpy.data.meshes.new_from_object(obj.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        copy=bpy.data.objects.new('EXPORT__'+obj.name,data)
        bpy.context.collection.objects.link(copy)
        copy.matrix_world=obj.matrix_world.copy()
        copy.parent=export
        key=obj.data.materials[0].name
        batches.setdefault(key,[]).append(copy)
    triangles=0
    for key,objects in batches.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects: obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        batch=bpy.context.object
        batch.name=prototype+'__'+key.split('/')[0].strip().lower()+'_'+key.split('/')[-1].strip().replace(' ','_')
        batch.data.calc_loop_triangles()
        triangles+=len(batch.data.loop_triangles)
    for item in ANCHORS[prototype]:
        node=bpy.data.objects.new(prototype+'__'+item['name'],None)
        bpy.context.collection.objects.link(node)
        node.parent=export
        node.location=xyz(item['position'])
        node['anchorKind']=item['kind']
    bounds_points = [obj.matrix_world @ Vector(corner) for obj in source.children_recursive if obj.type == 'MESH' for corner in obj.bound_box]
    game_points = [(q.x, q.z, -q.y) for q in bounds_points]
    lower = [min(q[k] for q in game_points) for k in range(3)]
    upper = [max(q[k] for q in game_points) for k in range(3)]
    stats.append({'name':prototype,'triangles':triangles,'materialBatches':len(batches),'bounds':{'min':lower,'max':upper},'dimensions':[upper[k]-lower[k] for k in range(3)],'anchors':ANCHORS[prototype]})

bpy.ops.object.select_all(action='DESELECT')
for obj in export_roots:
    obj.select_set(True)
    for child in obj.children_recursive: child.select_set(True)
OUT.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False,export_animations=False,export_materials='EXPORT',export_yup=True)

# Optional cheap review still. Final acceptance uses the actual exported GLB in game.
if args.render:
    for source in SOURCES.values():
        for child in source.children_recursive: child.hide_render=True
    for obj in export_roots:
        show=obj.name=='loom_carrier'
        for child in obj.children_recursive: child.hide_render=not show
    def area(name,point,power,size,colour):
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=colour
        o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=xyz(point)
        o.rotation_euler=(xyz((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
    area('large warm key',(180,240,120),6000000,220,(1,.78,.55))
    area('cool broad fill',(-170,110,-40),3500000,240,(.55,.7,1))
    area('rim',(70,100,-260),5500000,150,(1,.52,.24))
    camera_data=bpy.data.cameras.new('Review camera')
    camera=bpy.data.objects.new('Review camera',camera_data);bpy.context.collection.objects.link(camera)
    camera.location=xyz((360,230,-440));camera.rotation_euler=(xyz((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.type='ORTHO';camera_data.ortho_scale=550;scene.camera=camera
    scene.render.engine='CYCLES';scene.cycles.samples=24
    scene.render.resolution_x=1500;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX'
    TEMP.mkdir(parents=True,exist_ok=True)
    scene.render.filepath=str(TEMP/'loom-carrier-review.png')
    bpy.ops.render.render(write_still=True)

reference=ASSET.parent/'reference'
records={
    'generator':'Original procedural Blender geometry authored for VECTOR//NOVA',
    'stage':args.stage,'coordinates':'Metres, +Z forward, +Y up, +X starboard in glTF',
    'rights':'Project-authored meshes and scalar PBR materials; project-owned generated concepts used only as visual references. No external artwork or models.',
    'source':'build_anchor_fleet.py','blend':'ravel-anchor-fleet.blend',
    'runtimeAsset':'public/assets/levels/ravel/anchor-fleet.glb',
    'referenceImages':[{'file':str((reference/name).relative_to(GAME)), 'sha256':hashlib.sha256((reference/name).read_bytes()).hexdigest()} for name in ['ravel-anchor-narrows-concept.png','ravel-crown-fold-concept.png','sail-basin-selected-crop.png']],
    'prototypes':stats,'totalTriangles':sum(record['triangles'] for record in stats),
    'materials':[m.name for m in M.values()],
    'hashes':{file.name:hashlib.sha256(file.read_bytes()).hexdigest() for file in [Path(__file__),BLEND,OUT]},
}
(ASSET/'anchor-fleet-provenance.json').write_text(json.dumps(records,indent=2)+'\n')
print('RAVEL_ANCHOR_FLEET '+json.dumps({'stage':args.stage,'output':str(OUT),'prototypes':stats,'triangles':records['totalTriangles']}))
