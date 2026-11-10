"""Original Skywell roadside arrival kit; CPU Blender modeling/export only.

Run: Blender --background --python assets/levels/launchworks/build_arrival_art.py -- <app root>
The modeling API uses game metres: X lateral, Y up, +Z route forward. Each
asset is one editable collection with four merged material-role meshes.
"""

import bpy
import bmesh
import hashlib
import json
import math
import sys
from collections import defaultdict
from pathlib import Path
from mathutils import Vector

ROOT = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
SOURCE = ROOT / "assets/levels/launchworks"
PUBLIC = ROOT / "public/assets/levels/launchworks"
SOURCE.mkdir(parents=True, exist_ok=True)
PUBLIC.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.name != "Collection":
        bpy.data.collections.remove(collection)


def material(name, color, metallic=0, roughness=.65, emission=0):
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    value.diffuse_color = (*color, 1)
    node = value.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (*color, 1)
    node.inputs["Metallic"].default_value = metallic
    node.inputs["Roughness"].default_value = roughness
    node.inputs["Emission Color"].default_value = (*color, 1)
    node.inputs["Emission Strength"].default_value = emission
    return value


MATERIALS = {
    "stone": material("Skywell · worn ivory anchor stone", (.48, .435, .35), roughness=.78),
    "bronze": material("Skywell · satin bronze formed exoskeleton", (.34, .205, .09), .78, .39),
    "recess": material("Skywell · dark recessed induction core", (.035, .055, .063), .42, .56),
    "light": material("Skywell · recessed mint induction glass", (.32, .74, .65), .16, .26, 2.2),
}


class Assembly:
    def __init__(self, name, transform=lambda p: p, bevel_segments=2):
        self.name = name
        self.transform = transform
        self.bevel_segments = bevel_segments
        self.parts = defaultdict(lambda: [[], []])
        self.collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(self.collection)
        self.objects = []

    def mesh(self, points, faces, role):
        vertices, indices = self.parts[role]
        offset = len(vertices)
        vertices.extend(self.transform(tuple(point)) for point in points)
        indices.extend(tuple(offset + i for i in face) for face in faces)

    def prism(self, profile, front, back, role):
        n = len(profile)
        points = [(x, y, z) for z in [front, back] for x, y in profile]
        faces = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
        faces.extend((i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n))
        self.mesh(points, faces, role)

    def box(self, centre, size, role):
        x, y, z = centre
        a, b, c = (value / 2 for value in size)
        self.prism([(x-a, y-b), (x+a, y-b), (x+a, y+b), (x-a, y+b)], z-c, z+c, role)

    def taper(self, rings, role):
        # Octagonal closed sections give broad quiet faces and real bevel edges.
        points = []
        for y, x, z in rings:
            cut = min(x, z) * .24
            points.extend([(a, y, b) for a, b in [
                (-x+cut, -z), (x-cut, -z), (x, -z+cut), (x, z-cut),
                (x-cut, z), (-x+cut, z), (-x, z-cut), (-x, -z+cut),
            ]])
        faces = [tuple(reversed(range(8))), tuple(range((len(rings)-1)*8, len(rings)*8))]
        for ring in range(len(rings)-1):
            for i in range(8):
                faces.append((ring*8+i, ring*8+(i+1)%8, (ring+1)*8+(i+1)%8, (ring+1)*8+i))
        self.mesh(points, faces, role)

    def beam(self, start, end, width, depth, role):
        a, b = Vector(start), Vector(end)
        axis = (b-a).normalized()
        side = axis.cross(Vector((0, 0, 1)))
        if side.length < .01:
            side = axis.cross(Vector((0, 1, 0)))
        side.normalize()
        across = axis.cross(side).normalized()
        points = []
        for p in [a, b]:
            for sx, sy in [(-1,-1), (1,-1), (1,1), (-1,1)]:
                points.append(tuple(p + side*sx*width/2 + across*sy*depth/2))
        self.mesh(points, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], role)

    def bolt(self, centre, radius=.2, length=.32, role="bronze"):
        x, y, z = centre
        points = [(x+math.cos(i*math.tau/6)*radius, y+math.sin(i*math.tau/6)*radius, zz)
                  for zz in [z-length/2, z+length/2] for i in range(6)]
        faces = [tuple(reversed(range(6))), tuple(range(6,12))]
        faces.extend((i,(i+1)%6,(i+1)%6+6,i+6) for i in range(6))
        self.mesh(points, faces, role)

    def finish(self):
        for role, (points, faces) in self.parts.items():
            mesh = bpy.data.meshes.new(f"{self.name} / {role}")
            # Blender export maps native (x,z,-y) back to game (x,y,z).
            mesh.from_pydata([(x,-z,y) for x,y,z in points], [], faces)
            mesh.materials.append(MATERIALS[role])
            mesh.update()
            obj = bpy.data.objects.new(mesh.name, mesh)
            self.collection.objects.link(obj)
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            bm = bmesh.new()
            bm.from_mesh(mesh)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            bm.to_mesh(mesh)
            bm.free()
            # Chamfer geometry is real, not a normal-map edge illusion.
            if role != "light":
                bevel = obj.modifiers.new("Fitted metal/stone edge chamfers", "BEVEL")
                bevel.width = .09 if role == "bronze" else .12 if role == "stone" else .045
                bevel.segments = self.bevel_segments
                bevel.limit_method = "ANGLE"
                bevel.angle_limit = math.radians(35)
                bpy.ops.object.modifier_apply(modifier=bevel.name)
            triangulate = obj.modifiers.new("Stable runtime triangles", "TRIANGULATE")
            bpy.ops.object.modifier_apply(modifier=triangulate.name)
            # Deliberately restrained original vertex finish: cavities remain
            # dark geometry/materials, with minor cast-metal tonal variation.
            mesh = obj.data
            color = mesh.color_attributes.new(name="SkywellFinish", type="BYTE_COLOR", domain="CORNER")
            for poly in mesh.polygons:
                for index in poly.loop_indices:
                    vertex = mesh.vertices[mesh.loops[index].vertex_index]
                    p = vertex.co
                    grain = .96 + .035 * math.sin(p.x*3.1 + p.y*2.4 + p.z*.15)
                    color.data[index].color = (grain, grain, grain, 1)
            obj["skywellRole"] = role
            obj.select_set(False)
            self.objects.append(obj)
        return self

    def export(self):
        bpy.ops.object.select_all(action="DESELECT")
        for obj in self.objects:
            obj.select_set(True)
        path = PUBLIC / f"{self.name}.glb"
        bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                                  export_yup=True, export_materials="EXPORT", export_cameras=False,
                                  export_lights=False, export_animations=False, export_vertex_color="ACTIVE")
        game_points = [(v.co.x, v.co.z, -v.co.y) for obj in self.objects for v in obj.data.vertices]
        bounds = {"min": [min(p[i] for p in game_points) for i in range(3)],
                  "max": [max(p[i] for p in game_points) for i in range(3)]}
        return {"file": f"{self.name}.glb", "boundsMetres": bounds,
                "triangles": sum(len(obj.data.polygons) for obj in self.objects),
                "materialDraws": len(self.objects), "bytes": path.stat().st_size,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def beacon(name, small=False):
    def transform(p):
        x,y,z = p
        return (x*.7, y*(29/188) if y >= 0 else y*.7, z*.7) if small else p
    kit = Assembly(name, transform)
    # Closed stone anchor shoe and stepped bronze collar have a real load path.
    kit.taper([(-14,5,5.8),(-12.5,5,5.8),(-11.8,4.5,5.2),(-7.5,4.5,5.2),(-6.5,3.6,3.7)], "stone")
    kit.taper([(-6.6,3.7,3.8),(-4.8,3.7,3.8),(-3.7,3.2,2.7)], "bronze")
    kit.taper([(-4,2.65,2.25),(24,2.5,2.0),(84,2.1,1.8),(152,1.55,1.45),(176,.55,.55)], "recess")
    # Unequal-depth bronze spines enclose the core instead of one flat sign.
    for side in [-1,1]:
        profile = [(side*3,-4,0),(side*2.85,24,0),(side*2.5,84,0),
                   (side*1.95,152,0),(side*.9,177,0),(0,188,0)]
        for a,b in zip(profile,profile[1:]):
            kit.beam(a,b,.72,3.4,"bronze")
        # Broad buttress shoulders close into the shoe, all outside the road.
        kit.beam((side*4.2,-7,2.4),(side*2.8,18,1),.8,1.1,"bronze")
        kit.beam((side*4.2,-7,-2.4),(side*2.8,18,-1),.8,1.1,"bronze")
        for y,x,z in [(22,2.86,0),(82,2.51,0),(133,2.14,0),(167,1.38,0)]:
            kit.box((side*x,y,z),(.98,1.25,4.2),"bronze")
    # Recessed lancet gallery: black back, raised side jambs, separately inset
    # luminous cells. Real depth remains visible against the bright cloud sky.
    gallery = [(-1.5,92),(-1.5,169),(-.8,174),(0,177),(.8,174),(1.5,169),(1.5,92)]
    kit.prism(gallery,-1.57,-1.08,"recess")
    for side in [-1,1]:
        kit.beam((side*1.58,91,-1.78),(side*1.58,168,-1.45),.29,.55,"bronze")
        kit.beam((side*1.58,168,-1.45),(0,178,-.8),.29,.55,"bronze")
        for lo,hi in [(96,112),(115,133),(136,153),(156,169)]:
            x=side*.66
            shape=[(x-.31,lo),(x+.31,lo),(x+.31,hi-1.2),(x,hi),(x-.31,hi-1.2)]
            kit.prism(shape,-1.65,-1.42,"light")
    for y in [93,113.5,134.5,154.5]:
        kit.box((0,y,-1.89),(3.5,.95,.65),"bronze")
        for x in [-1.5,1.5]:
            kit.bolt((x,y,-2.26),.17,.25)
    # The lower service collar is intentionally quieter than the locator head.
    for y in [7,32,57]:
        kit.box((0,y,-2.12),(4.7,1.0,.7),"bronze")
        for x in [-1.8,1.8]:
            kit.bolt((x,y,-2.6),.23,.3)
    for x in [-3.4,3.4]:
        for y in [-11,-8.8]:
            kit.bolt((x,y,-5.29),.28,.32)
    # A front/back ridge and a low stone inset keep the base legible up close.
    kit.box((0,12,1.94),(1.3,35,.5),"bronze")
    kit.box((0,10,-2.3),(2.25,10,.18),"recess")
    return kit.finish()


def saddle():
    kit=Assembly("terrace-saddle")
    # A continuous formed lower spine with outboard haunches. Everything lies
    # below the unchanged road; this is a decorative carriage, never support.
    profile=[(-31,-4),(-26,-4),(-19,-14),(19,-14),(26,-4),(31,-4),
             (29,-10),(22,-21),(-22,-21),(-29,-10)]
    kit.prism(profile,-5,5,"bronze")
    inner=[(-24,-9),(-18,-16),(18,-16),(24,-9),(20,-18),(-20,-18)]
    kit.prism(inner,-5.12,-4.96,"recess")
    for side in [-1,1]:
        # Seated pickup flanges overlap the existing flat keel underside
        # (y=-3.2, x=+/-19.684 at the authored 44m road width). Four tapered
        # formed webs carry that load into the existing U spine; there is no
        # decorative air gap between the raceway and its suspended carriage.
        kit.box((side*17.3,-3.425,0),(4,.75,9.2),"bronze")
        pickup=[(15.8,-3.65),(18.8,-3.65),(20.1,-14.5),(17.3,-14.5)]
        for z in [-3.7,3.7]:
            kit.prism([(side*x,y) for x,y in pickup],z-.55,z+.55,"bronze")
        for z in [-4.4,4.4]:
            kit.beam((side*29,-4,z),(side*19,-23,z),1.6,1.6,"bronze")
            kit.beam((side*19,-23,z),(side*10,-27,z),1.6,1.6,"bronze")
        # Bearing shoes sit on the outer formed haunch, outside the full road
        # corridor even as neighbouring bank frames sweep past a carriage.
        kit.box((side*28,-3.5,0),(4,3,12),"stone")
        kit.box((side*21,-16,-5.4),(5.2,5.5,.6),"bronze")
        for x in [-1.6,1.6]:
            for y in [-1.8,1.8]:
                kit.bolt((side*21+x,-16+y,-5.8),.24,.34)
    kit.box((0,-23,0),(23,3,7),"recess")
    kit.box((0,-26.7,0),(23.5,1.4,8.4),"bronze")
    return kit.finish()


def veil_spill_lip():
    kit=Assembly("veil-spill-lip",bevel_segments=1)
    # This is a covered feeder and four real open spout throats, not a new
    # waterfall. It sits entirely above the unchanged curtain's y=0 source.
    # Its local frame is copied from that curtain, including its x=.85 scale.
    mouths=[(-49.98,-32.34),(-26.46,-16.66),(14.7,24.5),(30.87,49.49)]
    kit.box((0,2.75,-18.0),(110,1.5,18.0),"stone")
    kit.box((0,5.75,-26.0),(110,6.0,3.2),"stone")
    for side in [-1,1]:
        kit.box((side*53.8,5.7,-17.8),(2.4,6.0,18.0),"stone")
    # Layered, bevelled coping closes the distributor over its central dry
    # interval. Deep front pockets expose the actual thickness below the cap.
    kit.box((0,8.75,-15.8),(112,1.25,24.4),"stone")
    kit.box((0,9.75,-15.8),(111,.5,23.6),"stone")
    kit.box((0,9.46,-15.8),(110,.25,23.8),"bronze")
    # The solid central distribution bridge carries three carved inset panels,
    # rather than leaving the large gap between the water strands unexplained.
    kit.box((-.98,4.9,-8.3),(31.36,6.0,6.0),"stone")
    for x in [-15.9,-5.7,4.1,13.94]:
        kit.box((x,5.0,-4.35),(1.5,5.5,2.3),"stone")
    kit.box((-.98,2.1,-4.35),(31.36,.8,2.3),"stone")
    kit.box((-.98,7.62,-4.35),(31.36,.75,2.3),"stone")
    for x in [-10.8,-.8,9.0]:
        kit.box((x,4.8,-5.16),(8.2,4.45,.18),"recess")
        kit.prism([(x-3.6,6.72),(x,7.5),(x+3.6,6.72),
                   (x+3.6,7.12),(x,7.92),(x-3.6,7.12)],-4.05,-3.55,"stone")
        kit.box((x,3.0,-3.72),(6.9,.25,.45),"bronze")
    for left,right in mouths:
        width=right-left
        center=(left+right)/2
        # At y=0 every stone cheek stays strictly outside the given source
        # mouth. There is no sill, grille or cap across the falling water.
        kit.prism([(left-2.5,0),(left,0),(left,6.7),
                   (left-1.1,7.8),(left-2.9,7.5)],-8.3,.8,"stone")
        kit.prism([(right,0),(right+2.5,0),(right+2.9,7.5),
                   (right+1.1,7.8),(right,6.7)],-8.3,.8,"stone")
        kit.box((center,7.82,-3.7),(width+5.8,1.25,9.4),"stone")
        kit.box((center,8.68,-3.7),(width+5.2,.45,9.0),"bronze")
        # Real dark throats are recessed behind the unchanged first water
        # vertices. No opaque stone is placed in front of their y=0 mouths.
        kit.box((center,3.45,-8.51),(width-.25,6.25,.20),"recess")
        for side,x in [(-1,left-1.15),(1,right+1.15)]:
            kit.box((x,4.3,.91),(.55,5.6,.18),"bronze")
            kit.prism([(x-.8,5.65),(x+.8,5.65),(x+.48,7.14),(x-.48,7.14)],
                      -.08,.96,"stone")
    # A fitted right-hand block is the actual contact for the source arm.
    # The specified x50/y6/z-12 attachment point is inside this distributor.
    kit.prism([(48.8,2.5),(55.6,2.5),(55.6,8.4),(48.8,8.4)],-16,-8,"stone")
    kit.box((55.78,5.6,-12),(.4,3.4,5.2),"bronze")
    kit.box((55.99,5.6,-12),(.02,2.1,3.9),"recess")
    return kit.finish()


assets=[beacon("arrival-beacon-crown"),beacon("arrival-beacon-small",True),saddle(),veil_spill_lip()]
manifest={"version":1,"source":"build_arrival_art.py; skywell-arrival-kit.blend",
          "coordinateConvention":"Metres, X lateral / Y up / +Z forward; identity glTF node transforms",
          "reference":{"file":"../zephyr/zephyr-scene-reference.png",
                       "promptSource":"../zephyr/asset-manifest.json#concept",
                       "direction":"Original Skywell arrival furniture derived from the approved ivory Gothic/bronze Zephyr world, not a new scene or generated image."},
          "provenance":"Original Blender-authored geometry/materials/vertex finish. No downloaded models, texture images, fonts or generated runtime media. Four or fewer merged role meshes; original sources remain editable.",
          "saddleConstruction":{"pickupWebs":4,"underKeelFlanges":2,"newGeometryMaximumY":-3.05,
                                "keelUndersideY":-3.2,"flangeKeelOverlap":.15,
                                "flangeWebOverlap":.15,"webSpineOverlap":.5,
                                "editableReference":"REFERENCE / original 44m road keel (not exported)"},
          "veilSourceConstruction":{"mouthsX":[[-49.98,-32.34],[-26.46,-16.66],[14.7,24.5],[30.87,49.49]],
                                    "waterSourceY":0,"waterSourceZ":0,"armContact":[50,6,-12],
                                    "placement":"Copy the unchanged gameplay curtain matrix, including x=.85; no water mesh or opacity changes."},
          "assets":[asset.export() for asset in assets]}
(SOURCE/"arrival-art-manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
# Editable reference only: the original running deck and its unmodified folded
# keel section. This collection is created after every runtime export and never
# included in the GLBs. Wire display exposes the pickup/flange seating.
reference=bpy.data.collections.new("REFERENCE / original 44m road keel (not exported)")
bpy.context.scene.collection.children.link(reference)
profile=[(-22,-.08),(-19.6842105263,-3.2),(19.6842105263,-3.2),(22,-.08)]
points=[(x,-z,y) for z in [-9,9] for x,y in profile]
faces=[(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(3,2,1,0),(4,5,6,7)]
mesh=bpy.data.meshes.new("Reference / original road keel section")
mesh.from_pydata(points,[],faces)
mesh.materials.append(MATERIALS["recess"])
proxy=bpy.data.objects.new(mesh.name,mesh)
reference.objects.link(proxy)
proxy.display_type="WIRE"
proxy.hide_render=True
proxy["source"]="Unchanged Skywell road keel profile for fit inspection only; never exported"
for collection in bpy.data.collections:
    collection.hide_viewport=collection.name!="arrival-beacon-crown"
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/"skywell-arrival-kit.blend"))
print(json.dumps(manifest,indent=2))
