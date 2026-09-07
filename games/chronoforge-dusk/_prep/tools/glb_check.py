"""Small independent checks on exported glTF bytes; no visual-acceptance claim."""
import json
import math
from pathlib import Path
import struct


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_glb(path):
    raw = Path(path).read_bytes()
    require(len(raw) >= 20, 'Truncated GLB')
    magic, version, length = struct.unpack_from('<4sII', raw)
    require(magic == b'glTF' and version == 2 and length == len(raw), 'Invalid GLB header')
    offset, document, binary = 12, None, b''
    while offset < len(raw):
        require(offset+8 <= len(raw), 'Truncated GLB chunk header')
        size, kind = struct.unpack_from('<I4s', raw, offset)
        offset += 8
        require(offset+size <= len(raw), 'Truncated GLB chunk')
        block = raw[offset:offset+size]
        if kind == b'JSON':
            document = json.loads(block)
        elif kind == b'BIN\0':
            binary = block
        offset += size
    require(document is not None and binary, 'GLB requires JSON and embedded binary')
    require(all('uri' not in b for b in document.get('buffers', [])), 'External buffers forbidden')
    require(all('bufferView' in i and 'uri' not in i for i in document.get('images', [])), 'Textures must be embedded')
    return document, binary


def accessor(doc, binary, index):
    require(isinstance(index, int) and 0 <= index < len(doc['accessors']), 'Invalid accessor index')
    acc = doc['accessors'][index]
    require('sparse' not in acc, 'Sparse accessors not supported by this checker')
    require(0 <= acc['bufferView'] < len(doc['bufferViews']), 'Invalid accessor buffer view')
    view = doc['bufferViews'][acc['bufferView']]
    require(view.get('buffer', 0) == 0, 'Accessor must use embedded buffer')
    start, length = view.get('byteOffset', 0), view['byteLength']
    require(start >= 0 and length >= 0 and start+length <= len(binary), 'Buffer view out of bounds')
    code, size = {5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}[acc['componentType']]
    count = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[acc['type']]
    stride = view.get('byteStride', size*count)
    relative_offset = acc.get('byteOffset', 0)
    require(acc['count'] > 0 and relative_offset >= 0 and stride >= size*count, 'Invalid accessor layout')
    offset = start+relative_offset
    require(offset+(acc['count']-1)*stride+size*count <= start+length, 'Accessor out of bounds')
    result = []
    for row in range(acc['count']):
        position = offset+row*stride
        values = struct.unpack_from('<'+code*count, binary, position)
        if acc.get('normalized'):
            require(acc['componentType'] in (5120,5121,5122,5123), 'Invalid normalized accessor type')
            denominator = {5120:127,5121:255,5122:32767,5123:65535}[acc['componentType']]
            values = tuple(max(-1,v/denominator) for v in values)
        require(all(math.isfinite(v) for v in values), 'Non-finite accessor')
        result.append(values)
    return result


def check(path, metadata):
    doc, binary = read_glb(path)
    decoded = [accessor(doc,binary,index) for index in range(len(doc.get('accessors', [])))]
    skins = doc.get('skins', [])
    animations = doc.get('animations', [])
    required = {v['name'] for v in metadata.get('clips', {}).values()}
    actual = {a['name'] for a in animations}
    require(required <= actual, 'Missing declared GLB clips: '+str(required-actual))
    blended = 0
    if metadata['animation_mode'] == 'skeletal':
        require(skins, 'No actual skin in skeletal GLB')
        for skin in skins:
            require('inverseBindMatrices' in skin and skin['joints'], 'Missing skin binding')
            require(all(isinstance(j, int) and 0 <= j < len(doc['nodes']) for j in skin['joints'])
                    and len(set(skin['joints'])) == len(skin['joints']), 'Invalid skin joint nodes')
            binding = doc['accessors'][skin['inverseBindMatrices']]
            require(binding['type'] == 'MAT4' and binding['componentType'] == 5126
                    and binding['count'] == len(skin['joints']), 'Invalid inverse bind matrices')
        for node in doc.get('nodes', []):
            if 'mesh' not in node:
                continue
            require('skin' in node, 'Skeletal mesh node lacks skin')
            require(0 <= node['skin'] < len(skins), 'Invalid mesh skin index')
            skin = skins[node['skin']]
            for primitive in doc['meshes'][node['mesh']]['primitives']:
                attrs = primitive['attributes']
                require(all(name in attrs for name in ('POSITION','JOINTS_0','WEIGHTS_0')), 'Missing skin vertex attributes')
                position_acc, joint_acc, weight_acc = [doc['accessors'][attrs[name]] for name in ('POSITION','JOINTS_0','WEIGHTS_0')]
                require(joint_acc['type'] == 'VEC4' and joint_acc['componentType'] in (5121,5123)
                        and not joint_acc.get('normalized'), 'Invalid skin joint encoding')
                require(weight_acc['type'] == 'VEC4' and (weight_acc['componentType'] == 5126
                        or (weight_acc['componentType'] in (5121,5123) and weight_acc.get('normalized'))), 'Invalid skin weight encoding')
                require(position_acc['count'] == joint_acc['count'] == weight_acc['count'], 'Mismatched skin vertex counts')
                weights, joints = decoded[attrs['WEIGHTS_0']], decoded[attrs['JOINTS_0']]
                for ws, js in zip(weights,joints):
                    require(abs(sum(ws)-1) < .002 and all(0 <= w <= 1 for w in ws), 'Invalid skin weight sum')
                    require(all(0 <= j < len(skin['joints']) for j in js), 'Invalid joint index')
                    blended += sum(w > 1e-5 for w in ws) > 1
        require(blended > 0, 'No blended skin vertices')
        root_name = metadata['root_motion']['bone']
        roots = [i for i,n in enumerate(doc['nodes']) if n.get('name') == root_name]
        armatures = [i for i,n in enumerate(doc['nodes']) if n.get('name') == metadata['root_motion']['armature']]
        require(len(roots) == 1 and len(armatures) == 1, 'Missing or ambiguous displacement root/armature')
        require(roots[0] in doc['nodes'][armatures[0]].get('children', [])
                and any(roots[0] in s['joints'] for s in skins), 'Displacement root must be a top-level skin joint')
        root_indices = set(roots+armatures)
        for anim in animations:
            for channel in anim['channels']:
                target = channel['target']
                if target.get('node') in root_indices and target['path'] == 'translation':
                    values = decoded[anim['samplers'][channel['sampler']]['output']]
                    require(max(abs(v[i]-values[0][i]) for v in values for i in (0,2)) < 1e-5, 'Export still has horizontal root travel')
    else:
        require(not skins and not animations, 'Static GLB contains skin or animations')
    return {'format': 'glTF 2.0', 'embedded_resources': True, 'skin_count': len(skins), 'blended_vertices': blended,
            'animations': sorted(actual), 'images': len(doc.get('images', [])), 'materials': len(doc.get('materials', [])),
            'horizontal_root_motion': 'checked_constant' if skins else 'not_applicable', 'visual_acceptance': 'not established'}
