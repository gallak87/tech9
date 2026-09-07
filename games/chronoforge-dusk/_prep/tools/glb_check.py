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
    acc = doc['accessors'][index]
    require('sparse' not in acc, 'Sparse accessors not supported by this checker')
    view = doc['bufferViews'][acc['bufferView']]
    code, size = {5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}[acc['componentType']]
    count = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[acc['type']]
    stride = view.get('byteStride', size*count)
    offset = view.get('byteOffset', 0)+acc.get('byteOffset', 0)
    result = []
    for row in range(acc['count']):
        position = offset+row*stride
        require(position+size*count <= view.get('byteOffset',0)+view['byteLength'], 'Accessor out of bounds')
        values = struct.unpack_from('<'+code*count, binary, position)
        if acc.get('normalized'):
            denominator = {5121:255,5123:65535}[acc['componentType']]
            values = tuple(v/denominator for v in values)
        require(all(math.isfinite(v) for v in values), 'Non-finite accessor')
        result.append(values)
    return result


def check(path, metadata):
    doc, binary = read_glb(path)
    for index in range(len(doc.get('accessors', []))):
        accessor(doc,binary,index)
    skins = doc.get('skins', [])
    animations = doc.get('animations', [])
    required = {v['name'] for v in metadata.get('clips', {}).values()}
    actual = {a['name'] for a in animations}
    require(required <= actual, 'Missing declared GLB clips: '+str(required-actual))
    blended = 0
    if metadata['animation_mode'] == 'skeletal':
        require(skins, 'No actual skin in skeletal GLB')
        for node in doc.get('nodes', []):
            if 'mesh' not in node:
                continue
            require('skin' in node, 'Skeletal mesh node lacks skin')
            skin = skins[node['skin']]
            require('inverseBindMatrices' in skin and skin['joints'], 'Missing skin binding')
            for primitive in doc['meshes'][node['mesh']]['primitives']:
                attrs = primitive['attributes']
                require('JOINTS_0' in attrs and 'WEIGHTS_0' in attrs, 'Missing skin vertex attributes')
                weights = accessor(doc,binary,attrs['WEIGHTS_0'])
                joints = accessor(doc,binary,attrs['JOINTS_0'])
                for ws, js in zip(weights,joints):
                    require(abs(sum(ws)-1) < .002 and all(0 <= w <= 1 for w in ws), 'Invalid skin weight sum')
                    require(all(j < len(skin['joints']) for j in js), 'Invalid joint index')
                    blended += sum(w > 1e-5 for w in ws) > 1
        require(blended > 0, 'No blended skin vertices')
        root_name = metadata['root_motion']['bone']
        root_indices = {i for i,n in enumerate(doc['nodes']) if n.get('name') in (root_name, metadata['root_motion']['armature'])}
        require(root_indices, 'Missing displacement root')
        for anim in animations:
            for channel in anim['channels']:
                target = channel['target']
                if target.get('node') in root_indices and target['path'] == 'translation':
                    values = accessor(doc,binary,anim['samplers'][channel['sampler']]['output'])
                    require(max(abs(v[i]-values[0][i]) for v in values for i in (0,2)) < 1e-5, 'Export still has horizontal root travel')
    else:
        require(not skins and not animations, 'Static GLB contains skin or animations')
    return {'format': 'glTF 2.0', 'embedded_resources': True, 'skin_count': len(skins), 'blended_vertices': blended,
            'animations': sorted(actual), 'images': len(doc.get('images', [])), 'materials': len(doc.get('materials', [])),
            'horizontal_root_motion': 'checked_constant' if skins else 'not_applicable', 'visual_acceptance': 'not established'}
