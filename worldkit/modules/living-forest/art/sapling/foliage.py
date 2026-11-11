"""Canonical curved cutout sprays and glTF wind attributes for Worldkit tree bakes."""

import bpy
import math
import random
from mathutils import Vector


class Surface:
    def __init__(self):
        self.positions, self.faces, self.uvs, self.colors = [], [], [], []
        self.wind = []

    def vertex(self, p, uv, color=(1, 1, 1, 1), wind=None):
        self.positions.append(tuple(p))
        self.uvs.append(tuple(uv))
        self.colors.append(tuple(color))
        self.wind.append(wind)
        return len(self.positions) - 1

    def object(self, name):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.positions, [], self.faces)
        mesh.update()
        uv = mesh.uv_layers.new(name="UVMap")
        for loop in mesh.loops:
            uv.data[loop.index].uv = self.uvs[loop.vertex_index]
        color = mesh.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="POINT")
        for i, value in enumerate(self.colors):
            color.data[i].color = value
        if any(value is not None for value in self.wind):
            # glTF rotates positions/normals to Y-up, but exports generic vector
            # attributes verbatim. Store these covectors/points in that frame.
            for attr_name, kind, field in [("_WIND_ANCHOR", "FLOAT_VECTOR", 0),
                                      ("_WIND_WEIGHT", "FLOAT", 1),
                                      ("_WIND_GRADIENT", "FLOAT_VECTOR", 2),
                                      ("_WIND_PHASE", "FLOAT", 3)]:
                attribute = mesh.attributes.new(name=attr_name, type=kind, domain="POINT")
                for i, value in enumerate(self.wind):
                    if kind == "FLOAT_VECTOR":
                        p = value[field]
                        attribute.data[i].vector = (p.x, p.z, -p.y)
                    else:
                        attribute.data[i].value = value[field]
        ob = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(ob)
        for face in mesh.polygons:
            face.use_smooth = True
        return ob

    @property
    def triangles(self):
        return sum(len(face) - 2 for face in self.faces)


def sprays(surface, sites, detail, spray_scale=1):
    for anchor, direction, index in sites:
        rng = random.Random(1709 + index)
        length = (7.5 + rng.random() * 3) * spray_scale
        width = length * (.78 + rng.random() * .2)
        forward = (direction + Vector((0, 0, .22))).normalized()
        phase = random.Random(8419 + index).random() * math.tau
        gradient = forward / length
        side = forward.cross(Vector((0, 0, 1)))
        if side.length < .01:
            side = Vector((1, 0, 0))
        side.normalize()
        up = side.cross(forward).normalized()
        rows_count = 2 if detail == "far" else 3
        tilts = [-.65, .65] if detail == "far" else [-.65, .65, 0]
        for tilt in tilts:
            lateral = side * math.cos(tilt) + up * math.sin(tilt)
            rows = []
            for row in range(rows_count):
                t = row / (rows_count - 1)
                center = anchor + forward * (t * length) + up * (math.sin(t * math.pi) * .65)
                tint = .88 + rng.random() * .12
                rows.append([surface.vertex(center + lateral * ((s - .5) * width), (s, t),
                                             (tint * .96, tint, tint * .97, 1),
                                             (anchor, t, gradient, phase)) for s in [0, 1]])
                if row:
                    surface.faces.append((rows[-2][0], rows[-2][1], rows[-1][1], rows[-1][0]))
