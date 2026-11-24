"""Extract two CC0 MeadowGrass prototypes and resample maps with Pillow."""

from io import BytesIO
import json
import struct
import sys
from pathlib import Path

from PIL import Image


game = Path(__file__).resolve().parents[3]
source = game.parent.parent / 'worldkit/modules/landscape/assets/runtime/forest-kit.glb'
output = game / 'public/assets/levels/oriel/workshop-meadow-grass.glb'
data = source.read_bytes()
magic, version, _, json_size, json_kind = struct.unpack_from('<IIIII', data)
assert (magic, version, json_kind) == (0x46546C67, 2, 0x4E4F534A)
original = json.loads(data[20:20 + json_size])
source_binary = data[28 + json_size:]
result = {
    'asset': {'version': '2.0', 'generator': 'Oriel extract-meadow-grass.py'},
    'scene': 0,
    'scenes': [{'nodes': []}],
    **{key: [] for key in ('nodes', 'meshes', 'accessors', 'bufferViews',
                           'buffers', 'materials', 'textures', 'images', 'samplers')},
}
binary = bytearray()


def add(key, value):
    result[key].append(value)
    return len(result[key]) - 1


def append_view(data, template):
    binary.extend(b'\0' * (-len(binary) % 4))
    start = len(binary)
    binary.extend(data)
    return add('bufferViews', {**template, 'buffer': 0, 'byteOffset': start,
                               'byteLength': len(data)})


def view_data(index):
    view = original['bufferViews'][index]
    offset = view.get('byteOffset', 0)
    return source_binary[offset:offset + view['byteLength']]


def copy_accessor(index):
    accessor = original['accessors'][index]
    view = accessor['bufferView']
    return add('accessors', {**accessor, 'bufferView':
                           append_view(view_data(view), original['bufferViews'][view])})


def resize_image(image_info, alpha_cutoff):
    pixels = Image.open(BytesIO(view_data(image_info['bufferView'])))
    alpha = pixels.getchannel('A') if 'A' in pixels.mode else None
    cut = round(255 * alpha_cutoff)
    pixels.thumbnail((512, 512), Image.Resampling.LANCZOS)
    if alpha:
        # Preserve the original visible-area fraction at the cutout threshold.
        visible = sum(alpha.histogram()[cut:]) / (alpha.width * alpha.height)
        resized = pixels.getchannel('A')
        remaining = round(visible * pixels.width * pixels.height)
        for value, count in reversed(list(enumerate(resized.histogram()))):
            remaining -= count
            if remaining <= 0:
                break
        if 0 < value < 255:
            resized = resized.point([
                round(cut * x / value if x <= value
                      else cut + (255 - cut) * (x - value) / (255 - value))
                for x in range(256)
            ])
            pixels.putalpha(resized)
    encoded = BytesIO()
    if image_info['mimeType'] == 'image/jpeg':
        pixels.save(encoded, format='JPEG', quality=93, subsampling=0, optimize=True)
    else:
        pixels.save(encoded, format='PNG', optimize=True)
    return encoded.getvalue()


def copy_texture(binding, alpha_cutoff):
    texture = original['textures'][binding['index']]
    image = original['images'][texture['source']]
    image_id = add('images', {**image, 'bufferView': append_view(resize_image(image, alpha_cutoff), {})})
    sampler_id = add('samplers', original['samplers'][texture['sampler']])
    return {**binding, 'index': add('textures', {**texture, 'source': image_id, 'sampler': sampler_id})}


material_id, source_material = next(
    (index, material) for index, material in enumerate(original['materials'])
    if material['name'] == 'MeadowGrass'
)
material = dict(source_material)
material['normalTexture'] = copy_texture(material['normalTexture'], material['alphaCutoff'])
pbr = material['pbrMetallicRoughness'] = dict(material['pbrMetallicRoughness'])
for name in ('baseColorTexture', 'metallicRoughnessTexture'):
    pbr[name] = copy_texture(pbr[name], material['alphaCutoff'])
add('materials', material)
result['extensionsUsed'] = list(material.get('extensions', {}))

for name in ('grass_short_lod', 'grass_tiny'):
    root = next(node for node in original['nodes'] if node.get('name') == name)
    leaf = original['nodes'][root['children'][0]]
    source_mesh = original['meshes'][leaf['mesh']]
    primitives = []
    for primitive in source_mesh['primitives']:
        assert primitive['material'] == material_id
        attributes = {key: copy_accessor(value) for key, value in primitive['attributes'].items()}
        primitives.append({**primitive, 'attributes': attributes,
                           'indices': copy_accessor(primitive['indices']), 'material': 0})
    mesh = add('meshes', {**source_mesh, 'primitives': primitives})
    child = add('nodes', {**leaf, 'mesh': mesh})
    result['scenes'][0]['nodes'].append(add('nodes', {**root, 'children': [child]}))

binary.extend(b'\0' * (-len(binary) % 4))
add('buffers', {'byteLength': len(binary)})
encoded = json.dumps(result, separators=(',', ':')).encode()
encoded += b' ' * (-len(encoded) % 4)
glb = (struct.pack('<III', 0x46546C67, 2, 28 + len(encoded) + len(binary))
       + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
       + struct.pack('<II', len(binary), 0x004E4942) + binary)

if '--check' in sys.argv:
    assert output.read_bytes() == glb, 'Oriel ground cover GLB needs regeneration'
else:
    output.write_bytes(glb)
print(f'{output.name}: {len(glb)} bytes')
