"""Extract the two original authored rock forms from the canonical forest kit.

No downloaded mesh inputs; preserves source positions/normals/indices and transforms.
Materials are consumer-owned. Run from any directory with Python 3.
"""
from pathlib import Path
import json
import struct

root = Path(__file__).resolve().parents[1]
source = root / 'modules/landscape/assets/runtime/forest-kit.glb'
output = source.with_name('rock-forms.glb')
data = source.read_bytes()
size = struct.unpack_from('<I', data, 12)[0]
source_json = json.loads(data[20:20 + size])
source_bin = data[28 + size:]
result = {'asset': {'version': '2.0', 'generator': 'Worldkit extract-rock-forms.py'}, 'scene': 0,
          'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [], 'accessors': [], 'bufferViews': [], 'buffers': []}
binary = bytearray()

def copy_accessor(index):
    accessor = dict(source_json['accessors'][index])
    view = source_json['bufferViews'][accessor['bufferView']]
    while len(binary) % 4:
        binary.append(0)
    start = len(binary)
    offset = view.get('byteOffset', 0)
    binary.extend(source_bin[offset:offset + view['byteLength']])
    result['bufferViews'].append({**view, 'buffer': 0, 'byteOffset': start})
    accessor['bufferView'] = len(result['bufferViews']) - 1
    result['accessors'].append(accessor)
    return len(result['accessors']) - 1

for name in ['rock_a_stone', 'rock_b_stone']:
    node = next(node for node in source_json['nodes'] if node.get('name') == name)
    primitives = []
    for primitive in source_json['meshes'][node['mesh']]['primitives']:
        primitives.append({'attributes': {key: copy_accessor(primitive['attributes'][key]) for key in ['POSITION', 'NORMAL']},
                           'indices': copy_accessor(primitive['indices'])})
    result['meshes'].append({'name': name, 'primitives': primitives})
    result['nodes'].append({**node, 'mesh': len(result['meshes']) - 1})
    result['scenes'][0]['nodes'].append(len(result['nodes']) - 1)
while len(binary) % 4:
    binary.append(0)
result['buffers'] = [{'byteLength': len(binary)}]
encoded = json.dumps(result, separators=(',', ':')).encode()
encoded += b' ' * (-len(encoded) % 4)
output.write_bytes(struct.pack('<III', 0x46546C67, 2, 28 + len(encoded) + len(binary)) +
                   struct.pack('<II', len(encoded), 0x4E4F534A) + encoded +
                   struct.pack('<II', len(binary), 0x004E4942) + binary)
print(f'{output.name}: {output.stat().st_size} bytes')
