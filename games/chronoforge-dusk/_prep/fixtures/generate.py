#!/usr/bin/env python3
"""Original rigid diagnostic mannequin; stdlib only, no production art or pipeline.
Coordinates are authored directly in glTF metres, Y up, -Z forward, feet at Y=0.
Re-run with Python 3.10+ from any directory. Stable output, no timestamps.
"""
import hashlib
import json
import math
import struct
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'game/assets/fixtures'
OUT.mkdir(parents=True, exist_ok=True)

class GLB:
    def __init__(self):
        self.binary = bytearray()
        self.doc = {'asset': {'version': '2.0', 'generator': 'Dusk diagnostic fixture v1 (Python stdlib)'},
                    'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': 'Fixture', 'children': []}],
                    'meshes': [], 'materials': [], 'accessors': [], 'bufferViews': []}

    def data(self, values, kind, width, component=5126):
        while len(self.binary) % 4:
            self.binary.append(0)
        offset = len(self.binary)
        fmt = 'f' if component == 5126 else 'H'
        flat = [v for row in values for v in row] if width > 1 else values
        self.binary.extend(struct.pack('<' + fmt * len(flat), *flat))
        view = len(self.doc['bufferViews'])
        self.doc['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(self.binary) - offset})
        a = {'bufferView': view, 'componentType': component, 'count': len(values), 'type': kind}
        if kind in ('VEC3', 'SCALAR'):
            rows = values if width > 1 else [[v] for v in values]
            a.update(min=[min(r[i] for r in rows) for i in range(width)], max=[max(r[i] for r in rows) for i in range(width)])
        self.doc['accessors'].append(a)
        return len(self.doc['accessors']) - 1

    def cube(self, color):
        positions, normals = [], []
        for normal, corners in [
            ((0,0,1), [(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]),
            ((0,0,-1), [(1,-1,-1),(-1,-1,-1),(-1,1,-1),(1,1,-1)]),
            ((1,0,0), [(1,-1,1),(1,-1,-1),(1,1,-1),(1,1,1)]),
            ((-1,0,0), [(-1,-1,-1),(-1,-1,1),(-1,1,1),(-1,1,-1)]),
            ((0,1,0), [(-1,1,1),(1,1,1),(1,1,-1),(-1,1,-1)]),
            ((0,-1,0), [(-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1)])]:
            for i in [0,1,2,0,2,3]:
                positions.append([v / 2 for v in corners[i]])
                normals.append(normal)
        material = len(self.doc['materials'])
        self.doc['materials'].append({'name': f'Matte_{material}', 'pbrMetallicRoughness': {'baseColorFactor': color, 'metallicFactor': 0.08, 'roughnessFactor': 0.72}})
        mesh = len(self.doc['meshes'])
        self.doc['meshes'].append({'primitives': [{'attributes': {'POSITION': self.data(positions, 'VEC3', 3), 'NORMAL': self.data(normals, 'VEC3', 3)}, 'material': material}]})
        return mesh

    def node(self, name, parent=0, translation=None, scale=None, mesh=None):
        n = {'name': name}
        if translation: n['translation'] = translation
        if scale: n['scale'] = scale
        if mesh is not None: n['mesh'] = mesh
        index = len(self.doc['nodes'])
        self.doc['nodes'].append(n)
        self.doc['nodes'][parent].setdefault('children', []).append(index)
        return index

    def animation(self, name, duration, tracks):
        times = [duration * i / 8 for i in range(9)]
        a = {'name': name, 'samplers': [], 'channels': []}
        for node, angles in tracks:
            rotations = [[math.sin(v/2),0,0,math.cos(v/2)] for v in angles]
            sampler = len(a['samplers'])
            a['samplers'].append({'input': self.data(times, 'SCALAR', 1), 'output': self.data(rotations, 'VEC4', 4), 'interpolation': 'LINEAR'})
            a['channels'].append({'sampler': sampler, 'target': {'node': node, 'path': 'rotation'}})
        self.doc.setdefault('animations', []).append(a)

    def write(self, name):
        self.doc['buffers'] = [{'byteLength': len(self.binary)}]
        raw = json.dumps(self.doc, separators=(',', ':')).encode()
        raw += b' ' * (-len(raw) % 4)
        binary = bytes(self.binary) + b'\0' * (-len(self.binary) % 4)
        payload = struct.pack('<III', 0x46546c67, 2, 12+8+len(raw)+8+len(binary)) + struct.pack('<II', len(raw), 0x4e4f534a) + raw + struct.pack('<II', len(binary), 0x004e4942) + binary
        (OUT / name).write_bytes(payload)
        return {'path': f'res://assets/fixtures/{name}', 'sha256': hashlib.sha256(payload).hexdigest()}

def prop():
    g = GLB()
    mesh = g.cube([0.72,0.69,0.57,1])
    g.node('Baton', translation=[0,0,-0.32], scale=[0.065,0.065,0.64], mesh=mesh)
    return g.write('baton-r1.glb')

baton = prop()
for revision, color in [('slate-r1', [0.27,0.40,0.46,1]), ('clay-r1', [0.53,0.39,0.29,1])]:
    g = GLB()
    body = g.cube(color)
    dark = g.cube([0.12,0.16,0.18,1])
    light = g.cube([0.66,0.70,0.68,1])
    torso = g.node('Torso', translation=[0,1.15,0])
    g.node('Chest', torso, [0,0.12,0], [0.55,0.62,0.30], body)
    g.node('Head', torso, [0,0.55,0], [0.32,0.30,0.31], light)
    g.node('FacingMarker', torso, [0,0.56,-0.162], [0.24,0.085,0.018], dark)
    arms, legs = [], []
    for sign, side in [(-1,'Left'),(1,'Right')]:
        arm = g.node(f'{side}Arm', torso, [sign*0.37,0.35,0])
        g.node(f'{side}ArmMesh', arm, [0,-0.29,0], [0.17,0.58,0.19], body)
        g.node(f'{side}Hand', arm, [0,-0.61,0], [0.16,0.14,0.18], light)
        if sign == 1: g.node('Grip', arm, [0,-0.60,-0.10])
        leg = g.node(f'{side}Leg', translation=[sign*0.16,0.96,0])
        g.node(f'{side}LegMesh', leg, [0,-0.40,0], [0.23,0.80,0.24], dark)
        g.node(f'{side}Foot', leg, [0,-0.89,-0.08], [0.25,0.14,0.40], light)
        arms.append(arm)
        legs.append(leg)
    for name, duration, amplitude in [('idle',2.4,0.035),('walk',1.0,0.42),('run',0.65,0.72)]:
        waves = [math.sin(i*math.tau/8)*amplitude for i in range(9)]
        g.animation(name, duration, [(arms[0],waves),(arms[1],[-v for v in waves]),(legs[0],[-v for v in waves]),(legs[1],waves)])
    g.animation('attack',0.9,[(arms[1],[0,0.5,0.7,0.1,-1.45,-1.0,-0.5,-0.1,0]),(torso,[0,-0.05,-0.12,-0.10,0.15,0.10,0.06,0.02,0])])
    g.animation('hurt',0.5,[(torso,[0,-0.12,-0.22,-0.18,-0.12,-0.08,-0.03,0,0])])
    model = g.write(f'mannequin-{revision}.glb')
    clips = {role:{'file': model['path'], 'name': role, 'loop':role in ('idle','walk','run')} for role in ['idle','walk','run','attack','hurt']}
    descriptor = {'format':1,'asset_id':'diagnostic.mannequin','revision':revision,'label':f'Diagnostic mannequin / {revision}',
        'kind':'character','animation_mode':'rigid','placeholder':True,'model':model,
        'dimensions':{'height_m':1.85,'radius_m':0.34,'forward':'-Z','up':'+Y','origin':'ground'},
        'clips':clips,'attachments':[{'id':'practice_baton','socket_path':'Fixture/Torso/RightArm/Grip','model':baton,'position_m':[0,0,0],'rotation_degrees':[0,0,0]}],
        'motion':{'traversal':'controller','action':'controller','clips':'in_place'}}
    (OUT / f'mannequin-{revision}.json').write_text(json.dumps(descriptor,indent=2)+'\n')
print('Wrote two immutable diagnostic candidates, embedded clips and a separate baton.')
