"""Optional clean-finish GLB authoring from an exact procedural boss snapshot.

Fast preview (no baking or production replacement):
  node tools/export-boss-source.mjs --ship wraith
  blender --background --threads 6 --python assets/ships/bosses/build_boss_finish.py -- \
    --source .experiments/boss-finish/wraith/source.json --preview

Then prove one material family in the same Three.js studio before a full bake:
  ... --source PATH --bake-material 'ceramic|silver' --size 512

Only coincident vertices are welded for usable connected UV islands; positions,
triangles, custom split normals, source names and metre-space scale are retained.
No remeshing, smoothing modifier, new geometry or image-generated pixels.
"""
import argparse
import json
import math
import re
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion

SHIPS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SHIPS))
from clean_finish import crafted_finish
from surface_finish import bake_finish


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--out-dir', type=Path)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--preview', action='store_true')
    mode.add_argument('--bake-material', metavar='REGEX')
    mode.add_argument('--bake-all', action='store_true')
    parser.add_argument('--size', type=int, default=512)
    parser.add_argument('--main-size', type=int, default=2048)
    parser.add_argument('--save-blend', action='store_true')
    parser.add_argument('--ao-distance', type=float, default=0.045, help='Clean fitted-joint occlusion distance in metres')
    parser.add_argument('--bevel-scale', type=float, default=1.0, help='Multiplier on the shared clean-finish normal radius')
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def coordinates(vector):
    return (vector[0], -vector[2], vector[1])


def material_from_source(source):
    material = bpy.data.materials.new(source['name'])
    material.use_nodes = True
    material.use_backface_culling = source['side'] != 2
    material.diffuse_color = (*source['color'], source['opacity'])
    material['source_finish'] = source['finish'] or ''
    bsdf = material.node_tree.nodes.get('Principled BSDF')
    values = {
        'Base Color': (*source['color'], source['opacity']),
        'Metallic': source['metalness'], 'Roughness': source['roughness'],
        'Coat Weight': source['clearcoat'], 'Coat Roughness': source['clearcoatRoughness'],
        'IOR': source['ior'], 'Coat IOR': 1.5,
        'Emission Color': (*source['emissive'], 1),
        'Emission Strength': source['emissiveIntensity'],
        'Alpha': source['opacity'],
    }
    for key, value in values.items():
        bsdf.inputs[key].default_value = value
    anisotropy = bsdf.inputs.get('Anisotropic IOR Level') or bsdf.inputs.get('Anisotropic')
    if anisotropy is not None:
        anisotropy.default_value = source.get('anisotropy', 0)
    rotation = bsdf.inputs.get('Anisotropic Rotation')
    if rotation is not None:
        rotation.default_value = source.get('anisotropyRotation', 0) / (math.pi * 2)
    return material


def add_source_mesh(source, materials, collection):
    # The source frequently has per-triangle vertices. Exact-position welding
    # makes panel UV islands connected without moving or deleting any triangle.
    vertices, mapping, lookup = [], [], {}
    for offset in range(0, len(source['positions']), 3):
        position = coordinates(source['positions'][offset:offset + 3])
        if position not in lookup:
            lookup[position] = len(vertices)
            vertices.append(position)
        mapping.append(lookup[position])
    faces, normals = [], []
    indices = source['indices']
    for offset in range(0, len(indices), 3):
        triangle = indices[offset:offset + 3]
        faces.append(tuple(mapping[index] for index in triangle))
        normals.extend(coordinates(source['normals'][index * 3:index * 3 + 3]) for index in triangle)
    data = bpy.data.meshes.new(source['name'])
    data.from_pydata(vertices, [], faces)
    data.update()
    for polygon in data.polygons:
        polygon.use_smooth = True
    data.normals_split_custom_set(normals)
    obj = bpy.data.objects.new(source['name'], data)
    collection.objects.link(obj)
    obj.data.materials.append(materials[source['material']])
    obj['source_name'] = source['name']
    if source.get('contactPart'):
        obj['contactPart'] = source['contactPart']
    return obj


def clean_channels(material, source, ao_distance=0.045, bevel_scale=1.0):
    kind = {
        'ceramic': 'pearl', 'service': 'pearl2', 'carbon': 'carbon',
        'alloy': 'metal', 'darkalloy': 'darkmetal', 'paint': 'pearl2',
    }.get(source['finish'])
    if not kind:
        return None
    channels = crafted_finish(material, kind)
    for node in material.node_tree.nodes:
        if node.bl_idname == 'ShaderNodeAmbientOcclusion':
            node.inputs['Distance'].default_value = ao_distance
            node.samples = 32
        elif node.bl_idname == 'ShaderNodeBevel':
            node.inputs['Radius'].default_value *= bevel_scale
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    base = tuple(bsdf.inputs['Base Color'].default_value)
    original_roughness = bsdf.inputs['Roughness'].default_value
    # The shared clean recipe provides only relative manufacturing response.
    # Preserve this ship's authored palette and all scalar finish choices.
    multiply = nodes.new('ShaderNodeMixRGB')
    multiply.label = 'Preserve authored boss palette'
    multiply.blend_type = 'MULTIPLY'
    multiply.inputs[0].default_value = 1
    links.new(channels['color'], multiply.inputs[1])
    multiply.inputs[2].default_value = tuple(source['color'][i] / max(base[i], 0.00001) for i in range(3)) + (1,)
    channels['color'] = multiply.outputs[0]
    roughness = nodes.new('ShaderNodeMath')
    roughness.operation = 'ADD'
    roughness.label = 'Preserve authored boss roughness'
    links.new(channels['roughness'], roughness.inputs[0])
    roughness.inputs[1].default_value = source['roughness'] - original_roughness
    channels['roughness'] = roughness.outputs[0]
    links.new(channels['color'], bsdf.inputs['Base Color'])
    links.new(channels['roughness'], bsdf.inputs['Roughness'])
    bsdf.inputs['Metallic'].default_value = source['metalness']
    bsdf.inputs['Coat Weight'].default_value = source['clearcoat']
    bsdf.inputs['Coat Roughness'].default_value = source['clearcoatRoughness']
    bsdf.inputs['IOR'].default_value = source['ior']
    material.diffuse_color = (*source['color'], source['opacity'])
    return channels


def merge_family(objects, material, name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0
    return obj


def main():
    args = arguments()
    if args.size < 64 or args.main_size < 64:
        raise ValueError('Texture sizes must be at least 64 pixels')
    source = json.loads(args.source.read_text())
    if source.get('format') != 'vector-nova-boss-source' or source.get('version') != 1:
        raise ValueError('Unsupported boss source snapshot')
    output = args.out_dir or args.source.parent / ('preview' if args.preview else 'baked')
    output.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 16
    collection = bpy.data.collections.new(source['chassisName'])
    scene.collection.children.link(collection)
    materials = [material_from_source(surface) for surface in source['surfaces']]
    families = {index: [] for index in range(len(materials))}
    for mesh in source['meshes']:
        families[mesh['material']].append(add_source_mesh(mesh, materials, collection))
    root = bpy.data.objects.new(source['chassisName'], None)
    collection.objects.link(root)
    root['sourceSha256'] = source['sourceSha256']
    root['hullSha256'] = source['hullSha256']
    root['finishMode'] = 'scalar-preview' if args.preview else 'clean-bake'
    baked = []
    pattern = re.compile(args.bake_material, re.I) if args.bake_material else None
    for index, objects in families.items():
        if not objects:
            continue
        material = materials[index]
        selected = not args.preview and (args.bake_all or pattern.search(material.name))
        if selected:
            channels = clean_channels(material, source['surfaces'][index], args.ao_distance, args.bevel_scale)
            if channels is not None:
                obj = merge_family(objects, material, material.name)
                obj.parent = root
                texture_directory = output / 'textures' / ('surface-' + str(index))
                texture_directory.mkdir(parents=True, exist_ok=True)
                size = args.main_size if source['surfaces'][index]['finish'] == 'ceramic' and args.bake_all else args.size
                # The shared baker uses the material name as a file stem;
                # runtime labels contain slashes, so sanitize only while baking.
                original_name = material.name
                material.name = re.sub(r'[^A-Za-z0-9_.-]+', '-', original_name).strip('-')
                bake_finish(obj, material, channels, texture_directory, size)
                bsdf = material.node_tree.nodes.get('Principled BSDF')
                if bsdf.inputs['Coat Weight'].default_value > 0 and bsdf.inputs['Normal'].links:
                    material.node_tree.links.new(bsdf.inputs['Normal'].links[0].from_socket, bsdf.inputs['Coat Normal'])
                material.name = original_name
                baked.append(original_name)
                continue
        for obj in objects:
            obj.parent = root
    if not args.preview and not baked:
        raise ValueError('No bakeable material matched; glass/emitters remain scalar')
    for anchor in source['anchors']:
        obj = bpy.data.objects.new(anchor['name'], None)
        collection.objects.link(obj)
        obj.location = coordinates(anchor['position'])
        # Source exhaust anchors normally have identity rotations. Convert the
        # general quaternion through the same X-axis basis as all mesh normals.
        basis = Quaternion((1, 0, 0), math.pi / 2)
        x, y, z, w = anchor['quaternion']
        obj.rotation_mode = 'QUATERNION'
        obj.rotation_quaternion = basis @ Quaternion((w, x, y, z)) @ basis.inverted()
    if args.save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=str((output / (source['ship'] + '.blend')).resolve()))
    bpy.ops.object.select_all(action='SELECT')
    glb = (output / (source['ship'] + '.glb')).resolve()
    bpy.ops.export_scene.gltf(
        filepath=str(glb), export_format='GLB', use_selection=True,
        export_yup=True, export_apply=False, export_extras=True,
        export_cameras=False, export_lights=False, export_materials='EXPORT',
        export_animations=False,
    )
    # Small durable metadata supports source identity and controlled runtime
    # comparison; no Blender beauty renders or self-assigned quality score.
    manifest = {
        'ship': source['ship'], 'mode': root['finishMode'],
        'sourceSha256': source['sourceSha256'], 'hullSha256': source['hullSha256'],
        'sourceBounds': source['bounds'], 'bakedMaterials': baked,
        'sourceTriangles': sum(len(mesh['indices']) // 3 for mesh in source['meshes']),
        'glbBytes': glb.stat().st_size,
        'coordinateMapping': 'Three(x,y,z) -> Blender(x,-z,y) -> glTF(x,y,z)',
        'source': str(args.source),
        'aoDistanceMetres': args.ao_distance, 'bevelRadiusScale': args.bevel_scale,
    }
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'glb': str(glb), **manifest}))


if __name__ == '__main__':
    main()
