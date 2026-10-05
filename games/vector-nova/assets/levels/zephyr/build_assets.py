"""Zephyr Basilica: reproducible CPU-only Blender asset library.

Run with Blender 4+ in background mode:
  blender --background --python assets/levels/zephyr/build_assets.py -- <app root>

The modeling API uses game coordinates: X lateral, Y up, Z forward. Vertices
are converted to Blender native Z-up when constructed and exported as glTF
Y-up. Contact occlusion is sampled on CPU. No rendering, texture baking, network, or GPU work is performed.
"""

import bpy
import bmesh
import json
import math
import random
import sys
from collections import defaultdict
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree


REFERENCE = {
    "file": "zephyr-scene-reference.png",
    "tool": "image_gen__imagegen (built-in image generation; no CLI)",
    "generatedDate": "2026-09-29",
    "originalOutput": "/Users/g/.codex/generated_images/01a0f0ba-5093-7dc0-b2cb-d41cc4e1ec01/exec-b5054043-fd06-4664-8c67-8de09028f8d8.png",
    "usage": "Selected scene reference for modeling, not a runtime texture or rendered backdrop.",
    "prompt": "Use case: stylized-concept. Asset type: selected world scene concept reference for editable 3D racing-game assets, Zephyr Basilica. Create one wide cinematic architectural scene at actual driving scale in a floating cathedral archipelago. In foreground a small angular antigravity racing ship on a broad 32 metre woven graphite bridge, warm deep bronze keel and outward swept sail-like side ribs. The route pierces the huge shattered rose window of a weathered limestone cathedral into a deep shadowed rib-vaulted nave, curves up its inside wall and launches through a missing floor toward an adjacent chapel on another floating island. Massive silver waterfalls originate in carved stone catch basins, pour beside and through selected bridge gaps, with broken layered sheets and white foam, tapering hundreds of metres down into pastel cloud bands. At side a separate cathedral tower is slowly falling from its island, pulling a long trailing arc of water into the clouds. Include tall central stone needle behind, a broken stone halo far above, terraced islands with visibly stratified tapered undersides. The next landing shelf must be visibly clear through the backlit water. Lighting: dark violet grey nave interior with rose-window colored light and warm roof shafts contrasting pale peach/aqua exterior atmosphere. Palette: weathered ivory, graphite, bronze, silver water, dusty lilac and apricot clouds. High-end detailed game environment concept with large readable architectural forms, real apertures and convincing scale. Avoid neon strip aesthetics, asphalt, repeated identical rocks, opaque fog, flat water planes, text, logos or UI.",
}


ROOT = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
SOURCE = ROOT / "assets/levels/zephyr"
PUBLIC = ROOT / "public/assets/levels/zephyr"
SOURCE.mkdir(parents=True, exist_ok=True)
PUBLIC.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for old in list(bpy.data.collections):
    if old.name != "Collection":
        bpy.data.collections.remove(old)


def material(name, color, roughness=.8, metallic=0., alpha=1., emission=0.):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, alpha)
    m.use_backface_culling = "glass" not in name
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, alpha)
    p.inputs["Roughness"].default_value = roughness
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Alpha"].default_value = alpha
    p.inputs["Emission Color"].default_value = (*color, 1)
    p.inputs["Emission Strength"].default_value = emission
    if alpha < 1:
        m.surface_render_method = "DITHERED"
    return m


MATERIALS = {
    "limestone": material("Zephyr · weathered warm limestone", (.46, .425, .36)),
    "pale": material("Zephyr · pale worn edge stone", (.66, .615, .50), .77),
    "shadow": material("Zephyr · deep carved recess", (.19, .195, .22), .9),
    "slate": material("Zephyr · slate vault interior", (.245, .26, .285), .93),
    "bronze": material("Zephyr · aged bronze ferrules", (.32, .195, .09), .4, .68),
    "copper": material("Zephyr · weathered copper roofs", (.19, .315, .29), .57, .35),
    "moss": material("Zephyr · mineral reed green", (.21, .255, .16), .93),
    "rock": material("Zephyr · ancient grey strata", (.345, .36, .365), .96),
    "rock_light": material("Zephyr · exposed pale strata", (.46, .435, .395), .96),
    "rock_dark": material("Zephyr · underside stone", (.245, .26, .29), .96),
    "rose_blue": material("Zephyr · blue rose glass", (.24, .435, .60), .27, .15, 1, .12),
    "rose_amber": material("Zephyr · amber rose glass", (.70, .365, .16), .27, .15, 1, .14),
    "rose_lilac": material("Zephyr · violet rose glass", (.44, .29, .51), .3, .15, 1, .12),
    "water": material("Zephyr · water deep volume", (.40, .63, .68), .21, .12, .87),
    "water_silver": material("Zephyr · water silver mass", (.69, .82, .82), .3, .07, .9),
    "water_foam": material("Zephyr · water broken foam", (.88, .91, .87), .66, .03, .9),
    "water_shadow": material("Zephyr · water depth grooves", (.265, .44, .50), .22, .12, .82),
}


def vec(a):
    return Vector(a)


def mix(a, b, t):
    return tuple(a[i] * (1 - t) + b[i] * t for i in range(3))


class Meshes:
    def __init__(self, name):
        self.name = name
        self.data = defaultdict(lambda: [[], []])
        self.collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(self.collection)
        self.root = bpy.data.objects.new(name, None)
        self.root["coordinateConvention"] = "glTF Y-up, road forward +Z; units metres"
        self.collection.objects.link(self.root)
        self.objects = []

    def mesh(self, verts, faces, mat):
        bucket = self.data[mat]
        start = len(bucket[0])
        bucket[0].extend(verts)
        bucket[1].extend([tuple(start + n for n in f) for f in faces])

    def box(self, center, size, mat="limestone", angle=0):
        x, y, z = center
        a, b, c = (s * .5 for s in size)
        vs = []
        for xx, yy, zz in [(-a,-b,-c),(a,-b,-c),(a,b,-c),(-a,b,-c),
                           (-a,-b,c),(a,-b,c),(a,b,c),(-a,b,c)]:
            vs.append((x + xx * math.cos(angle) + zz * math.sin(angle),
                       y + yy, z + zz * math.cos(angle) - xx * math.sin(angle)))
        self.mesh(vs, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)], mat)

    def beam(self, a, b, width, mat="pale", sides=8, width2=None):
        d = (vec(b) - vec(a)).normalized()
        p = d.cross(Vector((0, 1, 0)))
        if p.length < .01:
            p = d.cross(Vector((0, 0, 1)))
        p.normalize()
        q = d.cross(p).normalized()
        vs = []
        for pos, radius in [(vec(a), width), (vec(b), width if width2 is None else width2)]:
            for i in range(sides):
                t = math.tau * i / sides
                v = pos + p * math.cos(t) * radius + q * math.sin(t) * radius
                vs.append(tuple(v))
        fs = [tuple(reversed(range(sides))), tuple(range(sides, sides*2))]
        fs.extend([(i, (i+1)%sides, (i+1)%sides+sides, i+sides) for i in range(sides)])
        self.mesh(vs, fs, mat)

    def path(self, points, radius, mat="pale", sides=7):
        # A continuous tube gives smooth flowing ribs without hundreds of draws.
        vs = []
        for i, pos in enumerate(points):
            d = (vec(points[min(i+1, len(points)-1)]) - vec(points[max(i-1,0)])).normalized()
            p = d.cross(Vector((0,0,1)))
            if p.length < .01:
                p = d.cross(Vector((1,0,0)))
            p.normalize()
            q = d.cross(p).normalized()
            for k in range(sides):
                t = math.tau * k / sides
                vs.append(tuple(vec(pos) + p * math.cos(t)*radius + q * math.sin(t)*radius))
        fs = []
        for i in range(len(points)-1):
            for k in range(sides):
                fs.append((i*sides+k, i*sides+(k+1)%sides, (i+1)*sides+(k+1)%sides, (i+1)*sides+k))
        fs.extend([tuple(reversed(range(sides))), tuple(range((len(points)-1)*sides, len(points)*sides))])
        self.mesh(vs, fs, mat)

    def ring(self, cx, cy, z, ri, ro, depth, mat="pale", segments=64, start=0, end=math.tau):
        vs=[]
        for k in range(segments+1):
            t=start+(end-start)*k/segments
            for zz, rr in [(-depth/2,ri),(-depth/2,ro),(depth/2,ri),(depth/2,ro)]:
                vs.append((cx+rr*math.cos(t), cy+rr*math.sin(t), z+zz))
        fs=[]
        for k in range(segments):
            n=k*4
            fs.extend([(n,n+4,n+5,n+1),(n+2,n+3,n+7,n+6),(n,n+2,n+6,n+4),(n+1,n+5,n+7,n+3)])
        fs.extend([(0,1,3,2),(segments*4,segments*4+2,segments*4+3,segments*4+1)])
        self.mesh(vs,fs,mat)

    def portal(self, x, y, z, inner=45, thick=8, spring=40, depth=8, mat="limestone"):
        # True through-arch. No collision hull or concealed fill crosses the portal.
        self.box((x-inner-thick/2,y+(spring-22)/2,z),(thick,spring+22,depth),mat)
        self.box((x+inner+thick/2,y+(spring-22)/2,z),(thick,spring+22,depth),mat)
        self.ring(x,y+spring,z,inner,inner+thick,depth,mat,32,0,math.pi)

    def finish(self, info):
        bpy.ops.object.select_all(action="DESELECT")
        all_vertices=[]
        triangles=0
        for mat,(verts,faces) in self.data.items():
            mesh=bpy.data.meshes.new(self.name+"_"+mat)
            # glTF export's (x,z,-y) converts these back to game coordinates.
            mesh.from_pydata([(x,-z,y) for x,y,z in verts], [], faces)
            mesh.update()
            obj=bpy.data.objects.new(self.name+"__"+mat,mesh)
            self.collection.objects.link(obj)
            obj.parent=self.root
            obj.data.materials.append(MATERIALS[mat])
            obj["surfaceRole"]=mat
            # Architecture keeps crisp plane breaks. Water receives smooth shading.
            if mat.startswith("water"):
                for poly in mesh.polygons:
                    poly.use_smooth=True
            if mat in ("limestone","pale","shadow","slate","bronze","copper"):
                bpy.context.view_layer.objects.active=obj
                bevel=obj.modifiers.new("Worn carved arris", "BEVEL")
                bevel.width=.18
                bevel.segments=2
                bevel.limit_method="ANGLE"
                bevel.angle_limit=.55
                bpy.ops.object.modifier_apply(modifier=bevel.name)
                mesh=obj.data
                bm=bmesh.new();bm.from_mesh(mesh)
                bmesh.ops.triangulate(bm,faces=list(bm.faces))
                tiny=[f for f in bm.faces if f.calc_area()<.0001]
                if tiny:bmesh.ops.delete(bm,geom=tiny,context='FACES_ONLY')
                bm.normal_update();bm.to_mesh(mesh);bm.free();mesh.update()
            if mat.startswith("rock"):
                bm=bmesh.new();bm.from_mesh(mesh)
                bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.001)
                bm.normal_update();bm.to_mesh(mesh);bm.free();mesh.update()
                if self.name in ('island-grand','island-terrace') and mat=='rock':
                    # An actual eroded through-cavern, with a thick load-bearing
                    # arch remaining below the dressed terrace.
                    rx,rz,dep=(143,120,215) if self.name=='island-grand' else (110,78,103)
                    bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=20,location=(rx*.10,0,-dep*.37))
                    cutter=bpy.context.object;cutter.scale=(rx*.25,rz*2.8,dep*.16)
                    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
                    # Fractured arch shoulders avoid a perfect punched ellipse.
                    for v in cutter.data.vertices:
                        x,y,z=v.co
                        v.co.x+=3.2*math.sin(z*.19+y*.031)+1.5*math.sin(z*.47)
                        v.co.z+=2.5*math.sin(x*.23+y*.043)
                    cutter.data.update()
                    bpy.context.view_layer.objects.active=obj
                    opening=obj.modifiers.new('Eroded through-cavern','BOOLEAN');opening.operation='DIFFERENCE';opening.solver='EXACT';opening.object=cutter
                    bpy.ops.object.modifier_apply(modifier=opening.name)
                    bpy.data.objects.remove(cutter,do_unlink=True)
                    mesh=obj.data
                if self.name.startswith('island-') and mat=='rock':
                    bpy.context.view_layer.objects.active=obj
                    edge=obj.modifiers.new('Worn geological breaks','BEVEL');edge.width=.65;edge.segments=2;edge.limit_method='ANGLE';edge.angle_limit=.4
                    bpy.ops.object.modifier_apply(modifier=edge.name);mesh=obj.data
                    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.triangulate(bm,faces=list(bm.faces))
                    tiny=[f for f in bm.faces if f.calc_area()<.0001]
                    if tiny:bmesh.ops.delete(bm,geom=tiny,context='FACES_ONLY')
                    bm.normal_update();bm.to_mesh(mesh);bm.free();mesh.update()
                for poly in mesh.polygons:poly.use_smooth=not self.name.startswith("island-")
            self.objects.append(obj)
            all_vertices.extend((v.co.x,v.co.z,-v.co.y) for v in mesh.vertices)
            triangles+=sum(len(poly.vertices)-2 for poly in mesh.polygons)
            obj.select_set(True)
        # CPU contact shade is attached to the actual carved surfaces and moves
        # with the falling tower. Water stays unbaked and receives live lighting.
        opaque=[o for o in self.objects if not o['surfaceRole'].startswith('water') and 'rose' not in o['surfaceRole']]
        vertices=[];faces=[]
        for o in opaque:
            offset=len(vertices);vertices.extend([v.co.copy() for v in o.data.vertices])
            faces.extend([tuple(offset+i for i in poly.vertices) for poly in o.data.polygons])
        if vertices:
            tree=BVHTree.FromPolygons(vertices,faces,all_triangles=False)
            for o in opaque:
                colors=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
                o.data.color_attributes.active_color=colors
                cache={}
                for poly in o.data.polygons:
                    for li in poly.loop_indices:
                        vertex=o.data.vertices[o.data.loops[li].vertex_index]
                        v=vertex.co;n=vertex.normal if poly.use_smooth else poly.normal
                        key=tuple(round(c,3) for c in (*v,*n))
                        if key not in cache:
                            tangent=n.cross(Vector((0,0,1)) if abs(n.z)<.9 else Vector((0,1,0))).normalized();bitangent=n.cross(tangent)
                            occlusion=0
                            for j in range(6):
                                theta=(j+.5)*math.tau/6
                                direction=(n*.6+tangent*math.cos(theta)*.8+bitangent*math.sin(theta)*.8).normalized()
                                hit=tree.ray_cast(v+n*.12,direction,12)
                                if hit[0] is not None:occlusion+=1-hit[3]/16
                            cache[key]=max(.29,1-occlusion/6*.83)
                        ao=cache[key]
                        colors.data[li].color=(ao,ao,ao,1)
        self.root.select_set(True)
        path=PUBLIC/(self.name+".glb")
        bpy.ops.export_scene.gltf(filepath=str(path),export_format="GLB",use_selection=True,
                                  export_yup=True,export_materials="EXPORT",export_cameras=False,
                                  export_lights=False,export_animations=False,export_vertex_color='ACTIVE')
        info.update({"file":"/assets/levels/zephyr/"+self.name+".glb", "root":self.name,
                     "bounds":{"min":[round(min(p[i] for p in all_vertices),3) for i in range(3)],
                               "max":[round(max(p[i] for p in all_vertices),3) for i in range(3)]},
                     "triangles":triangles,"meshCount":len(self.objects),"bytes":path.stat().st_size})
        return info


def pinnacle(m,x,y,z,height=28,width=4):
    m.box((x,y+1,z),(width*2.6,2,width*2.6),"pale")
    m.beam((x,y+2,z),(x,y+height*.54,z),width,"limestone",8,width*.7)
    m.box((x,y+height*.53,z),(width*2,1.3,width*2),"pale")
    m.beam((x,y+height*.55,z),(x,y+height,z),width*1.2,"copper",8,.18)
    m.beam((x,y+height,z),(x,y+height+3,z),.21,"bronze",6,.12)


def pier(m,x,z,bottom=-28,top=116,radius=5):
    m.box((x,bottom+3,z),(radius*3,6,radius*3),"shadow")
    m.box((x,bottom+7,z),(radius*2.7,2.2,radius*2.7),"pale")
    m.beam((x,bottom+8,z),(x,top,z),radius,"limestone",10)
    for a in range(6):
        t=math.tau*a/6
        m.beam((x+math.cos(t)*radius,z*0+bottom+8,z+math.sin(t)*radius),
               (x+math.cos(t)*radius,top-6,z+math.sin(t)*radius),radius*.19,"pale",6)
    for y in range(math.ceil(bottom+13),math.floor(top-12),12):
        m.beam((x,y,z),(x,y+.5,z),radius*1.055,"shadow",10)
        for side in [-1,1]:
            m.box((x+side*radius*.72,y+3,z-radius*.84),(radius*.22,3.7,.42),"pale")
    for y in [bottom+11,top-9,top-5,top-2]:
        m.box((x,y,z),(radius*2.5,1.5,radius*2.5),"pale")


def masonry_wall(m,x,z,width,bottom,top,depth,seed):
    # Large dressed blocks create broad stone courses and readable deep joints.
    rng=random.Random(seed)
    h=8
    y=bottom
    row=0
    while y<top:
        cursor=-width/2
        while cursor<width/2-.1:
            bw=min(width/2-cursor,rng.uniform(9,17))
            bh=min(h,top-y)
            mat="limestone" if rng.random()>.22 else "pale"
            m.box((x+cursor+bw/2,y+bh/2,z),(max(.2,bw-.18),max(.2,bh-.14),depth+rng.uniform(-.15,.15)),mat)
            cursor+=bw
        y+=h
        row+=1


def facade():
    m=Meshes("cathedral-facade")
    cy=8
    # A complete pierced rose frame, surrounded by isolated towers and a high gable.
    m.ring(0,cy,0,64,75,18,"limestone",80)
    m.ring(0,cy,-10,63.5,66.4,4,"pale",80)
    m.ring(0,cy,-12,69,71,3,"bronze",80)
    m.ring(0,cy,11,65,70,4,"pale",80)
    for k in range(80):
        a=math.tau*k/80
        # Alternating radial stone divisions give thickness, not a flat decal.
        r=73
        m.beam((math.cos(a)*r,cy+math.sin(a)*r,-10.6),
               (math.cos(a)*(r+3),cy+math.sin(a)*(r+3),-10.6),.8,"pale",5)
    rng=random.Random(806)
    # Deep surviving Gothic petals wrap a clear central flight aperture. Broken
    # sectors retain mullions, inset glass cells and fractured masonry shoulders.
    for k in range(20):
        a=math.tau*k/20+.022
        b=a+math.tau/20*.84
        mid=(a+b)/2
        if k in (10,11,12,13,14,15,16,17,18,19):
            inner=49
        else:
            inner=46
        if k in (1,8,10,18):inner=57
        def polar(r,t,z):return (r*math.cos(t),cy+r*math.sin(t),z)
        outer=63.5
        curve=[polar(outer,a,-6),polar(inner+3,(a+mid)/2,-8),polar(inner,mid,-9),polar(inner+3,(mid+b)/2,-8),polar(outer,b,-6)]
        m.path(curve,1.55,"pale",8)
        m.path([(x,y,z+4) for x,y,z in curve],.8,"limestone",6)
        for j in range(3):
            aa=a+(b-a)*j/3;bb=a+(b-a)*(j+1)/3
            rim=inner+4+4*abs(j-1)
            verts=[polar(rim,aa,-5.8),polar(62,aa,-5.8),polar(62,bb,-5.8),polar(rim,bb,-5.8)]
            if (k+j)%7!=0:m.mesh(verts,[(0,1,2,3)],["rose_blue","rose_amber","rose_lilac"][(k+j)%3])
            m.beam(verts[0],verts[1],.26,"bronze",6)
        m.ring(*polar(57,mid,-8)[:2],-8,1.5,2.25,1.8,"pale",12)
        if k%3==0:
            for j in range(3):
                r=68+j*2.1
                m.box(polar(r,mid,-11),(1.5,2.1,2.4),"pale",mid)
    # Weathered stone fragments remain attached to the broken rose shoulders.
    for side in [-1,1]:
        for k in range(9):
            y=-19+k*9.5;x=side*(77+3*math.sin(k*1.9))
            m.box((x,y,-13.7),(5+(k%3),2.1,3.5),"limestone",side*.18)
    # Gable sits above the rose, leaving every part of the through-circle open.
    m.mesh([(-66,84,-6),(66,84,-6),(0,142,-6),(-66,84,7),(66,84,7),(0,142,7)],
           [(0,2,1),(3,4,5),(0,3,5,2),(1,2,5,4),(0,1,4,3)],"limestone")
    for z in [-9,9]:
        m.beam((-68,83,z),(0,144,z),2,"pale",8)
        m.beam((0,144,z),(68,83,z),2,"pale",8)
    # High lancets and bronze inset reliefs strengthen the facade from long range.
    for x in [-24,0,24]:
        for yy in range(89,113,8):
            ww=max(1,8-abs(x)*.06-(yy-89)*.08)
            m.box((x,yy,-7.2),(ww,6,1.3),"shadow")
        m.beam((x,85,-10),(x,117-abs(x)*.35,-10),.9,"bronze",6)
    for side in [-1,1]:
        x=side*88
        masonry_wall(m,x,0,31,-34,136,26,8+side)
        for xx in [x-12,x+12]:
            for zz in [-17,16]:
                pier(m,xx,zz,-34,143,3.3)
                pinnacle(m,xx,145,zz,35,3)
        # Recessed galleries: dark openings behind projecting columns and ledges.
        for y in [6,56,108]:
            m.box((x,y+10,-13.8),(20,26,1.5),"shadow")
            for xx in [x-7,x,x+7]:
                m.beam((xx,y-3,-17.6),(xx,y+24,-17.6),1,"pale",7)
            m.box((x,y-6,-17),(29,3,8),"pale")
            m.box((x,y+27,-17),(29,2,8),"pale")
        # External flying buttress and deeply stepped architectural foot.
        m.box((side*111,-15,8),(12,37,32),"limestone")
        m.beam((side*113,0,11),(side*98,68,6),4,"pale",6)
        m.beam((side*114,4,11),(side*98,45,6),3,"limestone",6)
        pinnacle(m,side*111,5,9,36,4)
        m.box((x,-34,0),(39,7,39),"shadow")
        m.box((x,-29,0),(37,2,38),"pale")
    pinnacle(m,0,143,0,27,2.5)
    return m.finish({"purpose":"Drive-through shattered rose facade", "anchor":"road crosses origin along +Z",
                     "clearEnvelope":{"x":[-32,32],"y":[-18,38],"z":[-22,22]},
                     "placement":"Align local +Z with route tangent; local +Y with route up."})


def vault_height(x):
    return 53+74*(1-(abs(x)/58)**1.45)


def nave_geometry(m,zmin=-36,zmax=36,roof=True):
    # Exterior walls are deep aisle piers; the central bay is fully traversable.
    for side in [-1,1]:
        x=side*58
        for z in [zmin,zmax]:
            pier(m,x,z,-28,63,5.2)
            m.box((side*67,15,z),(13,79,16),"limestone")
            m.beam((side*68,45,z),(side*81,-18,z),3.4,"pale",6)
            pinnacle(m,side*73,52,z,30,3.2)
        m.box((side*59,-24,(zmin+zmax)/2),(13,8,zmax-zmin),"shadow")
        m.box((side*60,61,(zmin+zmax)/2),(15,8,zmax-zmin),"limestone")
        m.box((side*60,66,(zmin+zmax)/2),(16,2,zmax-zmin+2),"pale")
        # Tall side windows have open sightlines, multiple leaf ribs and colored heads.
        for z in [zmin+(zmax-zmin)*.25,zmin+(zmax-zmin)*.5,zmin+(zmax-zmin)*.75]:
            m.beam((side*61,-17,z),(side*61,58,z),1.15,"pale",7)
            for dz in [-5,5]:
                m.beam((side*61,17,z+dz),(side*61,54,z),.72,"bronze",6)
        # High clerestory above the outer aisles.
        for z in [zmin+10,zmax-10]:
            m.box((side*50,72,z),(3,18,11),"shadow")
            m.box((side*49.7,72,z),(3.2,13,6),"rose_blue" if side>0 else "rose_lilac")
    # Real stone roof volume darkens the interior under coherent game lights.
    if roof:
        N=28
        vs=[]
        for z in [zmin,zmax]:
            for i in range(N+1):
                x=-58+116*i/N
                h=vault_height(x)
                vs.extend([(x,h,z),(x,h+3.5,z)])
        fs=[]
        for i in range(N):
            a=i*2
            b=(N+1)*2+i*2
            fs.extend([(a,a+2,b+2,b),(a+1,b+1,b+3,a+3),(a,a+1,a+3,a+2),
                       (b,b+2,b+3,b+1)])
        fs.extend([(0,(N+1)*2,(N+1)*2+1,1),(N*2,N*2+1,(N+1)*2+N*2+1,(N+1)*2+N*2)])
        m.mesh(vs,fs,"slate")
    for z in [zmin,zmax]:
        pts=[(-58+116*i/40,vault_height(-58+116*i/40)-2,z) for i in range(41)]
        m.path(pts,2.6,"pale",9)
        m.path([(x,y+4,z+1.6) for x,y,z in pts],1.3,"limestone",7)
    # Crossing ribs make each bay read as a vaulted room from every camera angle.
    for direction in [-1,1]:
        pts=[]
        for i in range(33):
            t=i/32
            x=-58+116*t
            z=(zmin+(zmax-zmin)*t) if direction==1 else (zmax-(zmax-zmin)*t)
            pts.append((x,vault_height(x)-3.3,z))
        m.path(pts,1.55,"pale",7)
    m.beam((0,126,zmin),(0,126,zmax),1.8,"bronze",8)
    # Tiered transverse ribs and small open aisle arcades articulate the
    # otherwise broad vault soffits, with bosses at the intersecting webs.
    for z in [zmin*.34,zmax*.34]:
        pts=[(-58+116*i/32,vault_height(-58+116*i/32)-3.8,z) for i in range(33)]
        m.path(pts,1.05,"limestone",7)
        for side in [-1,1]:
            # Each secondary web seats into the continuous aisle cornice.
            m.beam((side*58,vault_height(58)-3.8,z),(side*60,61,z),1.7,"pale",7)
    for z in [zmin*.34,0,zmax*.34]:
        m.beam((0,120,z),(0,124,z),2.8,"bronze",8,1.7)
        for k in range(6):
            a=math.tau*k/6
            m.beam((math.cos(a)*1.5,122,z+math.sin(a)*1.5),(math.cos(a)*4,124,z+math.sin(a)*4),.55,"pale",6)
    for side in [-1,1]:
        for z in [zmin+12,(zmin+zmax)/2,zmax-12]:
            for dz in [-10,10]:
                pier(m,side*54,z+dz,-18,28,1.7)
            pts=[(side*54,28+11*math.sin(math.pi*k/20),z-10+20*k/20) for k in range(21)]
            m.path(pts,1.05,"pale",7)
            # Recessed low clerestory cells sit behind the structural arcades.
            m.box((side*61,35,z),(1.3,13,7),"rose_amber" if z<0 else "rose_blue")
    # Suspended aisle balconies stay far outside the full road/camera envelope.
    for side in [-1,1]:
        m.box((side*49,-19,(zmin+zmax)/2),(12,4,zmax-zmin),"limestone")
        for z in [zmin+12,zmax-12]:
            m.box((side*49,-15,z),(10,4,4),"pale")
            m.beam((side*47,-18,z),(side*57,2,z),1.4,"bronze",6)


def nave():
    m=Meshes("nave-bay")
    nave_geometry(m)
    # Keep the vault and aisles close enough to read from the banking chase view.
    for bucket in m.data.values():
        bucket[0]=[(x*.74,y*.62,z) for x,y,z in bucket[0]]
    return m.finish({"purpose":"Reusable rib-vaulted nave bay with clerestories and dark real roof",
                     "anchor":"road at origin, bay from z=-36 to +36",
                     "clearEnvelope":{"x":[-28,28],"y":[-11,34],"z":[-36,36]},
                     "placement":"Use overlapping bays in gentle curves; road wall ride remains inside broad clear envelope."})


def chapel():
    m=Meshes("chapel")
    nave_geometry(m,-67,67)
    # Open pointed frames on both ends let the ship land and immediately read exit.
    for z in [-69,69]:
        m.portal(0,0,z,47,9,44,9,"limestone")
        m.portal(0,0,z-6,47,2,44,3,"pale")
        for side in [-1,1]:
            pier(m,side*60,z,-28,113,5.8)
            pinnacle(m,side*60,114,z,35,3.4)
        # Broken rose crown in the gable does not cover the route portal.
        m.ring(0,112,z,9,14,7,"pale",32)
        for a in range(8):
            t=math.tau*a/8
            m.beam((math.cos(t)*4,112+math.sin(t)*4,z-5),
                   (math.cos(t)*9,112+math.sin(t)*9,z-5),.7,"bronze",6)
        m.beam((-57,92,z),(0,146,z),2.6,"pale",8)
        m.beam((0,146,z),(57,92,z),2.6,"pale",8)
        pinnacle(m,0,146,z,20,2.1)
    for side in [-1,1]:
        # Asymmetric ruined transept on one flank, compact apse on the other.
        for z in [-38,0,38]:
            x=side*(80 if side<0 else 76)
            m.box((x,-17,z),(22,9,21),"limestone")
            m.beam((x,-14,z),(x,39+(z==0)*10,z),3.2,"limestone",8)
            pinnacle(m,x,40+(z==0)*10,z,21,2.7)
            m.beam((side*58,60,z),(x,22,z),2.8,"pale",8)
    return m.finish({"purpose":"Open floating chapel with two true portals, nave and transepts",
                     "anchor":"road at origin, entrance z=-69, exit z=+69",
                     "clearEnvelope":{"x":[-40,40],"y":[-18,45],"z":[-75,75]}})


def island(name,rx,rz,depth,seed,terraces=2):
    m=Meshes(name)
    rng=random.Random(seed)
    n=48
    phase=[rng.uniform(-.019,.019) for _ in range(n)]
    # The three authored families have different bed thickness and skew, rather
    # than the same repeated concentric steps scaled to different sizes.
    radial=[1+.09*math.sin(k*.39+seed)+.045*math.sin(k*1.31)+rng.uniform(-.035,.035) for k in range(n)]
    if 'terrace' in name:
        rings=[(0,.82),(-6,.97),(-depth*.23,.91),(-depth*.27,.65),(-depth*.71,.54),(-depth*.75,.31),(-depth,.035)]
    elif 'shard' in name:
        rings=[(0,.78),(-7,.95),(-depth*.12,.88),(-depth*.15,.69),(-depth*.61,.47),(-depth*.65,.34),(-depth,.025)]
    else:
        rings=[(0,.82),(-8,.97),(-depth*.18,.93),(-depth*.205,.67),(-depth*.57,.60),(-depth*.60,.39),(-depth*.84,.28),(-depth,.035)]
    expanded=[]
    for a,b in zip(rings[:-1],rings[1:]):
        expanded.append(a)
        if abs(a[0]-b[0])>depth*.18:
            for t in [.33,.67]:expanded.append((a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t))
    rings=expanded+[rings[-1]]
    ringverts=[]
    for ri,(yy,s) in enumerate(rings):
        rr=[]
        for k in range(n):
            t=math.tau*k/n+phase[k]
            offset=0 if ri==0 else depth*(.031*math.sin(t*2+ri*.28)+.019*math.sin(t*5.3+seed))+rng.uniform(-depth*.006,depth*.006)
            r=radial[k]*s*(1+.047*math.sin(k*.63+ri*.61)+.025*math.sin(k*2.1+ri*.3))
            rr.append((math.cos(t)*rx*r+math.sin(ri*.23)*rx*.12,
                       yy+offset,math.sin(t)*rz*r+math.cos(ri*.33)*rz*.07))
        ringverts.append(rr)
    # Dressed broad top supports architecture; natural strata remain faceted.
    top=[(0,0,0)]+ringverts[0]
    m.mesh(top,[(0,(k+1)%n+1,k+1) for k in range(n)],"rock")
    for ri in range(len(rings)-1):
        for k in range(n):
            a=ringverts[ri][k]
            b=ringverts[ri][(k+1)%n]
            c=ringverts[ri+1][(k+1)%n]
            d=ringverts[ri+1][k]
            mat="rock"
            # Triangulate uneven strata with alternating diagonals to reveal relief.
            m.mesh([a,b,c,d],[(0,1,2),(0,2,3)],mat)
    bottom=[(0,-depth,0)]+ringverts[-1]
    m.mesh(bottom,[(0,k+1,(k+1)%n+1) for k in range(n)],"rock")
    # Projecting shelves and architectural roots break the silhouette at all scales.
    for k in range(18):
        t=math.tau*k/18+rng.uniform(-.12,.12)
        r=rng.uniform(.72,.95)
        x=math.cos(t)*rx*r
        z=math.sin(t)*rz*r
        y=-rng.uniform(6,depth*.25)
        m.box((x,y,z),(rng.uniform(13,26),rng.uniform(3,7),rng.uniform(10,24)),"rock_light",t)
        if k%3==0:
            m.beam((x,y-5,z),(x*.62,y-depth*.44,z*.63),rng.uniform(3,5),"rock_dark",7,.6)
    # Broken terrace rim defines a construction language without paving the whole island.
    for k in range(24):
        if (k+seed)%7 in [0,1]:
            continue
        t=math.tau*k/24
        x=math.cos(t)*rx*.77
        z=math.sin(t)*rz*.77
        m.box((x,2.2,z),(rx*.12,4.4,rz*.095),"limestone",math.pi/2-t)
        if k%5==0:
            pinnacle(m,x,4.4,z,rng.uniform(13,23),2.1)
    # Broad bronze suspension saddles and straps hang from the stone terraces.
    for side in [-1,1]:
        for z in [-rz*.40,rz*.36]:
            x=side*rx*.80
            m.box((x,-11,z),(13,12,16),"bronze")
            m.beam((x,-12,z),(x*.63,-depth*.4,z*.6),1.5,"bronze",8)
    # Small nonuniform mineral reeds lie at the perimeter, never at the center.
    for k in range(44):
        a=rng.random()*math.tau
        r=rng.uniform(.61,.81)
        x=math.cos(a)*rx*r
        z=math.sin(a)*rz*r
        h=rng.uniform(3,11)
        m.beam((x,2,z),(x+rng.uniform(-2,2),h,z+rng.uniform(-2,2)),.4,"moss",5,.16)
    return m.finish({"purpose":"Stratified floating island with eroded undersides, terraces and suspension roots",
                     "anchor":"terrace center [0,0,0]; choose road-relative vertical offset explicitly",
                     "placement":"Keep terrace safely below road; nonuniform scaling acceptable within 0.7..1.5."})


def tower():
    m=Meshes("falling-tower")
    # Base-origin pivot supports deterministic whole-tower tilting in the level.
    m.box((0,4,0),(57,8,57),"shadow")
    m.box((0,9,0),(51,3,51),"pale")
    for yy,h,w in [(14,47,41),(61,49,36),(110,41,32)]:
        m.box((0,yy+h/2,0),(w,h,w),"limestone")
        for side in [-1,1]:
            for other in [-1,1]:
                x=side*(w/2+.5)
                z=other*(w/2+.5)
                m.beam((x,yy,z),(x,yy+h,z),2.1,"pale",8)
        for offset in [0,h*.42,h-2]:
            m.box((0,yy+offset,0),(w+5,2,w+5),"pale")
        # Recessed lancets on all four sides create a legible tower at range.
        for a in range(4):
            t=math.pi*a/2
            for x in [-w*.20,w*.20]:
                zz=w/2+.15
                px=x*math.cos(t)+zz*math.sin(t)
                pz=zz*math.cos(t)-x*math.sin(t)
                m.box((px,yy+h*.54,pz),(5,h*.58,.65),"shadow",t)
                m.beam((px,yy+h*.32,pz),(px,yy+h*.76,pz),.7,"bronze",6)
    # Bell chamber is open: piers carry a heavy cornice and weathered crown.
    for side in [-1,1]:
        for other in [-1,1]:
            pier(m,side*15,other*15,150,194,3.3)
    for yy,w,h in [(151,39,3),(192,40,4),(197,44,3)]:
        # Ring cornices leave a true interior void.
        for side in [-1,1]:
            m.box((side*(w/2-2),yy,0),(4,h,w),"pale")
            m.box((0,yy,side*(w/2-2)),(w,h,4),"pale")
    # Four pointed belfry arches. Side pairs are rotated from the same open form.
    for a in range(4):
        t=math.pi*a/2
        pts=[]
        for k in range(25):
            theta=math.pi*k/24
            x=12*math.cos(theta)
            yy=178+13*math.sin(theta)
            z=16
            pts.append((x*math.cos(t)+z*math.sin(t),yy,z*math.cos(t)-x*math.sin(t)))
        m.path(pts,1.9,"pale",7)
    # The bell is a volumetric flared bronze shell, not a billboard.
    n=24
    vs=[]
    for yy,r in [(177,4),(173,5.6),(166,7.7),(162,11.2),(160,11.6)]:
        for k in range(n):
            t=math.tau*k/n
            vs.append((r*math.cos(t),yy,r*math.sin(t)))
    fs=[]
    for j in range(4):
        for k in range(n):
            fs.append((j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k))
    m.mesh(vs,fs,"bronze")
    m.beam((0,190,0),(0,156,0),.85,"bronze",8)
    m.beam((0,200,0),(0,247,0),23,"copper",8,.3)
    for side in [-1,1]:
        for other in [-1,1]:
            pinnacle(m,side*18,199,other*18,35,3.1)
    m.beam((0,247,0),(0,260,0),.8,"bronze",8,.3)
    m.beam((-3,255,0),(3,255,0),.5,"bronze",6)
    return m.finish({"purpose":"Massive falling belfry, open bell chamber, weathered copper spire",
                     "anchor":"base pivot [0,0,0] for whole-object tilt/fall",
                     "placement":"Animate group around origin; attach a separate flowing-water asset to source ledge."})


def water_ribbon(m,center,width,length,thickness,seed,mat="water",bend=0,sections=46,across=16):
    rng=random.Random(seed)
    phase=rng.uniform(0,math.tau)
    x0,y0,z0=center
    vs=[]
    # Closed volume, front/back separated by varying depth. Every vertex belongs
    # to the visible water surface; this is not a row of alpha cards.
    for j in range(sections+1):
        t=j/sections
        yy=y0-length*t
        taper=(.90+.13*math.sin(t*4+phase)+.24*t*t)
        for side in [-1,1]:
            for k in range(across+1):
                u=k/across*2-1
                ruffle=math.sin(t*19+u*4+phase)*1.4+math.sin(t*43+u*11)*.45
                xx=x0+u*width*.5*taper+math.sin(t*7+phase)*width*.035
                zz=z0+bend*t*t+math.sin(t*13+phase)*1.6+ruffle
                bulge=thickness*(.6+.25*math.sin(t*17+u*5+phase))*(.64+.36*(1-u*u))
                vs.append((xx,yy+math.sin(u*11+phase)*.7,zz+side*bulge/2))
    row=(across+1)*2
    fs=[]
    for j in range(sections):
        for side in range(2):
            for k in range(across):
                a=j*row+side*(across+1)+k
                b=a+row
                fs.append((a,b,b+1,a+1) if side==1 else (a,a+1,b+1,b))
        for k in [0,across]:
            a=j*row+k
            b=a+across+1
            fs.append((a,a+row,b+row,b) if k==0 else (a,b,b+row,a+row))
    for j in [0,sections]:
        for k in range(across):
            a=j*row+k
            b=a+across+1
            fs.append((a,b,b+1,a+1) if j==0 else (a,a+1,b+1,b))
    m.mesh(vs,fs,mat)


def aqueduct():
    m=Meshes("aqueduct-source")
    m.box((0,-6,-11),(108,12,28),"limestone")
    m.box((0,1,-24),(108,8,3),"pale")
    for side in [-1,1]:
        pier(m,side*48,-11,-143,-6,5.5)
        for y in [-131,-92,-52,-13]:
            m.box((side*48,y,-11),(17,3,23),"pale")
        m.box((side*48,-144,-11),(29,8,34),"rock_dark")
        m.box((side*52,1,-11),(5,8,27),"pale")
        m.beam((side*45,-48,-11),(side*16,-11,-11),2.3,"pale",8)
        m.beam((side*48,-130,-19),(side*48,-12,-19),.85,"bronze",8)
        pinnacle(m,side*51,5,-17,15,2)
    m.box((0,-.3,-12),(97,1.2,21),"water")
    m.box((0,-1.8,0),(98,3,3),"pale")
    # Incised face courses, projecting cornice and scalloped spill channels.
    for x in range(-44,45,8):
        m.box((x,-6,3),(6.6,4,1.8),"shadow")
        m.box((x,-4.8,4),(6,1.1,1.1),"bronze")
    return m.finish({"purpose":"Carved reservoir, spill lip and full-height piers attached to a receiving island",
                     "anchor":"source water at origin; foundations at y=-148",
                     "clearEnvelope":{"x":[-25,25],"y":[-90,-27],"z":[-30,12]}})


def waterfall():
    m=Meshes("waterfall")
    water_ribbon(m,(0,0,0),70,360,10,910,"water",22)
    water_ribbon(m,(-15,-2,-5),27,345,5,23,"water_silver",27,42,8)
    water_ribbon(m,(15,-1,-5.5),22,328,5.5,241,"water_silver",18,40,8)
    water_ribbon(m,(1,-5,-6.5),13,351,3,70,"water_shadow",24,42,6)
    # Irregular foamy strands trail at different lengths, leaving depth grooves.
    rng=random.Random(118)
    for k in range(15):
        x=-32+k*4.5+rng.uniform(-1,1)
        length=rng.uniform(290,368)
        width=rng.uniform(.6,2.2)
        water_ribbon(m,(x,rng.uniform(-1,-10),-7-rng.uniform(0,2)),width,length,rng.uniform(1,2.5),
                     880+k,"water_foam" if k%3 else "water_silver",rng.uniform(15,31),36,3)
    # Two side plumes taper and break the parallel rectangular fall silhouette.
    for side in [-1,1]:
        water_ribbon(m,(side*35,-20,3),9,250,5,67+side,"water_silver",33,30,5)
    return m.finish({"purpose":"Hero modeled waterfall with closed layered volume, grooves and irregular long strands",
                     "anchor":"source lip centered [0,0,0], flow down -Y; wide face in XY",
                     "deformation":"Optional level shader may bend by normalized -Y/370; preserve source lip and phase by simulation time.",
                     "materials":"water, water_silver, water_shadow, water_foam are separate merged mesh roles"})


def curtain():
    m=Meshes("waterfall-curtain")
    # A thin flowing veil spans the lane; thick outer lobes carry the mass and
    # long foam ropes into cloud. The receiving deck remains readable centrally.
    water_ribbon(m,(0,0,2.5),77,205,2.4,397,"water",10,50,22)
    for side in [-1,1]:
        water_ribbon(m,(side*31,0,0),28,245,8,398+side,"water_silver",15,50,10)
        water_ribbon(m,(side*42,-3,-5),14,224,6,414+side,"water_shadow",13,46,8)
    rng=random.Random(399)
    for k in range(35):
        x=-46+k*2.7
        outer=abs(x)>20
        water_ribbon(m,(x,0,-3),rng.uniform(.35,1.3) if not outer else rng.uniform(.8,2.4),rng.uniform(178,253),1.3,
                     500+k,"water_foam" if k%3 else "water_silver",rng.uniform(8,16),42,3)
    return m.finish({"purpose":"Readable traversable water curtain, layered thin central veil with deep outer lobes and long foam ropes",
                     "anchor":"source at y=0; place source 45–60 m above road; road crossing local z=0",
                     "collision":"Visual only; actual wet-zone response belongs to level runtime/presentation."})


def needle():
    m=Meshes("cloudspire-needle")
    rng=random.Random(891)
    n=21
    rings=[]
    for j in range(13):
        t=j/12
        radius=46*(1-t)**.8+1.2
        yy=t*310
        ring=[]
        for k in range(n):
            a=k*math.tau/n
            r=radius*(1+.16*math.sin(k*1.7+j*.6)+rng.uniform(-.09,.09))
            ring.append((math.cos(a)*r+5*math.sin(t*4),yy+rng.uniform(-2,2),math.sin(a)*r))
        rings.append(ring)
    for j in range(len(rings)-1):
        for k in range(n):
            mat="rock" if k%4 else "rock_light"
            if k%7==0:
                mat="rock_dark"
            m.mesh([rings[j][k],rings[j][(k+1)%n],rings[j+1][(k+1)%n],rings[j+1][k]],
                   [(0,2,1),(0,3,2)],mat)
    for k in range(7):
        a=math.tau*k/7
        x=math.cos(a)
        z=math.sin(a)
        h=rng.uniform(120,210)
        # Long off-axis stone fins leave eroded openings between buttresses.
        m.beam((x*48,-3,z*48),(x*21,h,z*21),5.5,"rock_light",5,1.3)
        m.beam((x*49,4,z*49),(x*26,75,z*26),4.2,"rock_dark",5,2)
        if k%2==0:
            m.beam((x*40,68,z*40),(x*22,123,z*22),1.7,"bronze",7)
        m.box((x*44,0,z*44),(15,9,15),"limestone",-a)
    # Carved, pierced crowns anchor the spiral to a recognizable sacred needle.
    # Each open gallery follows the shrinking rock; its dark lancets, colonettes
    # and broken upper pinnacles remain visible through the banked ascent.
    for yy,r,h in [(72,37,52),(157,25,43),(231,14,32)]:
        for k in range(8):
            a=math.tau*k/8
            x,z=math.cos(a)*r,math.sin(a)*r
            pier(m,x,z,yy,yy+h,1.65)
            pinnacle(m,x,yy+h,z,17+k%3*3,1.6)
            b=a+math.tau/8
            pts=[]
            for j in range(17):
                t=j/16
                pts.append((r*((1-t)*math.cos(a)+t*math.cos(b)),
                            yy+h-15+12*math.sin(math.pi*t),
                            r*((1-t)*math.sin(a)+t*math.sin(b))))
            m.path(pts,1.2,"pale",7)
            m.beam((x,yy+5,z),(x*.67,yy+h-5,z*.67),1.1,"bronze",7)
    # High suspended platform and needle top echo the cathedral's bronze saddles.
    for y,r in [(42,41),(137,25),(231,12)]:
        for k in range(8):
            a=math.tau*k/8
            b=math.tau*(k+1)/8
            m.beam((math.cos(a)*r,y,math.sin(a)*r),(math.cos(b)*r,y,math.sin(b)*r),1.3,"bronze",6)
    m.beam((0,285,0),(1.5,331,0),3.3,"pale",7,.2)
    m.beam((1.5,328,0),(1.5,342,0),.55,"bronze",6,.1)
    return m.finish({"purpose":"Slender eroded Cloudspire needle with separated buttress fins and bronze suspension collars",
                     "anchor":"spire base at origin; vertical along +Y"})


def halo():
    m=Meshes("broken-halo")
    ranges=[(8,53),(69,125),(144,192),(208,249),(266,333)]
    for group,(a,b) in enumerate(ranges):
        pieces=round((b-a)/7)
        for k in range(pieces):
            start=math.radians(a+(b-a)*k/pieces+.25)
            end=math.radians(a+(b-a)*(k+1)/pieces-.25)
            m.ring(0,0,0,107,122,17,"limestone" if k%3 else "pale",4,start,end)
            m.ring(0,0,-10.2,108,110,3,"pale",4,start,end)
            m.ring(0,0,-11.7,117.6,119.2,2.7,"bronze",4,start,end)
            m.ring(0,0,10.2,108,110,3,"pale",4,start,end)
            if k%2==0:
                mid=(start+end)/2
                c=math.cos(mid)
                s=math.sin(mid)
                m.beam((c*112,s*112,-12),(c*129,s*129,-12),1.1,"bronze",6)
                m.beam((c*121,s*121,0),(c*133,s*133,0),2.5,"pale",6,1.1)
        for deg in [a,b]:
            ang=math.radians(deg)
            c=math.cos(ang)
            s=math.sin(ang)
            m.beam((c*104,s*104,-10),(c*128,s*128,-10),1.7,"bronze",6)
            # Broken teeth at the ends give scale and a visibly fractured edge.
            m.beam((c*121,s*121,2),(c*130+math.sin(ang)*2,s*130,5),2.1,"rock",5,.7)
    # Fine tethers preserve the broken construction while connecting a few pieces.
    for a,b in [(53,69),(125,144),(249,266)]:
        points=[]
        for k in range(17):
            t=k/16
            ang=math.radians(a+(b-a)*t)
            r=125+math.sin(t*math.pi)*4
            points.append((math.cos(ang)*r,math.sin(ang)*r,-2))
        m.path(points,.65,"bronze",6)
    return m.finish({"purpose":"Monumental broken stone halo in XY plane with five fractured runs, carved lips and bronze tethers",
                     "anchor":"center of clear circle [0,0,0]; circle normal +Z",
                     "clearEnvelope":{"circleRadius":103},
                     "placement":"Rotate full group to frame a road vista or off-axis world composition."})


ASSETS=[]
ASSETS.append(facade())
ASSETS.append(nave())
ASSETS.append(chapel())
ASSETS.append(island("island-grand",143,120,215,810))
ASSETS.append(island("island-terrace",110,78,103,802))
ASSETS.append(island("island-shard",57,41,139,830))
ASSETS.append(tower())
ASSETS.append(aqueduct())
ASSETS.append(waterfall())
ASSETS.append(curtain())
ASSETS.append(needle())
ASSETS.append(halo())

# Blender source preserves each asset in a named collection, at export origin.
# Select a collection and isolate it to edit; regeneration intentionally replaces
# generated outputs. Store manual variants in a new collection/source file.
for collection in bpy.data.collections:
    if collection.name != "cathedral-facade":
        collection.hide_viewport=True
bpy.ops.object.select_all(action="DESELECT")
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/"zephyr-asset-library.blend"))
manifest={
    "name":"Zephyr Basilica authored scene kit",
    "version":2,
    "coordinates":"Runtime glTF uses metres, X lateral, Y up, +Z forward. Blender source converts native coordinates as (X,-Z,Y).",
    "source":"build_assets.py; zephyr-asset-library.blend",
    "concept":REFERENCE,
    "workflow":"Selected scene reference → CPU Blender mesh/material modeling → glTF → in-game lighting and inspection. CPU contact occlusion retained as vertex color; live lighting and no image planes.",
    "copyright":"Original procedural geometry authored for this task. No external models, textures, fonts, or third-party source assets.",
    "approximations":["Stone detail and erosion are modeled from deterministic geometry rather than sculpted displacement.",
                      "Stained-glass fragments are colored solid materials; motivated shafts and local light remain level-owned.",
                      "Water is a reusable modeled volume; streaming motion, mist, trailing arc and wet presentation remain level-owned."],
    "assets":ASSETS,
    "totalExportBytes":sum(a["bytes"] for a in ASSETS),
    "uniqueTriangles":sum(a["triangles"] for a in ASSETS),
}
(SOURCE/"asset-manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
print("ZEPHYR_ASSET_MANIFEST="+json.dumps(manifest))
