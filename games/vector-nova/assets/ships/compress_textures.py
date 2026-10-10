"""Repack embedded PNG ship textures as mipmapped UASTC KTX2.

Requires Khronos toktx 4.4.2. Geometry/accessors/material factors stay unchanged.
Run after the Blender exporter. The retained source PNGs are never modified.
"""
import argparse
import json
import os
from pathlib import Path
import struct
import subprocess
import tempfile


def compress(source, output, encoder):
    data=source.read_bytes()
    magic,version,length=struct.unpack_from('<III',data)
    if magic!=0x46546c67 or version!=2 or length!=len(data):
        raise ValueError('Expected a complete GLB 2.0')
    jsize,jtype=struct.unpack_from('<II',data,12)
    if jtype!=0x4e4f534a:raise ValueError('Missing JSON chunk')
    doc=json.loads(data[20:20+jsize])
    bsize,btype=struct.unpack_from('<II',data,20+jsize)
    if btype!=0x004e4942:raise ValueError('Missing BIN chunk')
    binary=data[28+jsize:28+jsize+bsize]
    if 'KHR_texture_basisu' in doc.get('extensionsUsed',[]):
        raise ValueError('Already compressed; rebuild PNG GLB before converting')
    if len(doc.get('buffers',[]))!=1:raise ValueError('Only embedded GLB buffers supported')
    srgb=set();normal=set()
    for mat in doc.get('materials',[]):
        pbr=mat.get('pbrMetallicRoughness',{})
        for slot in [pbr.get('baseColorTexture'),mat.get('emissiveTexture')]:
            if slot:srgb.add(doc['textures'][slot['index']]['source'])
        if mat.get('normalTexture'):normal.add(doc['textures'][mat['normalTexture']['index']]['source'])
    replacements={}
    with tempfile.TemporaryDirectory(prefix='vector-nova-ktx-') as temp:
        for index,img in enumerate(doc.get('images',[])):
            if img.get('mimeType')!='image/png' or 'bufferView' not in img:
                raise ValueError('Expected embedded PNG source images')
            view=doc['bufferViews'][img['bufferView']];start=view.get('byteOffset',0)
            png=Path(temp)/f'{index}.png';ktx=png.with_suffix('.ktx2')
            png.write_bytes(binary[start:start+view['byteLength']])
            command=[encoder,'--t2','--encode','uastc','--uastc_quality','3','--zcmp','18',
                     '--genmipmap','--upper_left_maps_to_s0t0','--threads','4','--assign_oetf','srgb' if index in srgb else 'linear',
                     '--assign_primaries','bt709' if index in srgb else 'none']
            # Keep RGB tangent normals: normal_mode swizzles to X/alpha and is
            # incompatible with the standard glTF/Three MeshStandardMaterial.
            if index in normal:command+=['--normalize']
            subprocess.run(command+[str(ktx),str(png)],check=True,env={k:v for k,v in os.environ.items() if k!='TOKTX_OPTIONS'})
            replacements[img['bufferView']]=ktx.read_bytes();img['mimeType']='image/ktx2'
        packed=bytearray()
        for index,view in enumerate(doc['bufferViews']):
            start=view.get('byteOffset',0)
            payload=replacements.get(index,binary[start:start+view['byteLength']])
            while len(packed)%4:packed.append(0)
            view['byteOffset']=len(packed);view['byteLength']=len(payload);packed.extend(payload)
        doc['buffers'][0]['byteLength']=len(packed)
        while len(packed)%4:packed.append(0)
        for texture in doc.get('textures',[]):
            texture.setdefault('extensions',{})['KHR_texture_basisu']={'source':texture.pop('source')}
        for sampler in doc.get('samplers',[]):sampler['minFilter']=9987
        for key in ('extensionsUsed','extensionsRequired'):
            doc[key]=list(dict.fromkeys(doc.get(key,[])+['KHR_texture_basisu']))
        metadata=json.dumps(doc,separators=(',',':')).encode()
        metadata+=b' '*((-len(metadata))%4)
        result=struct.pack('<III',magic,2,28+len(metadata)+len(packed))
        result+=struct.pack('<II',len(metadata),jtype)+metadata
        result+=struct.pack('<II',len(packed),btype)+packed
        output.parent.mkdir(parents=True,exist_ok=True)
        temp_output=output.with_suffix('.glb.tmp');temp_output.write_bytes(result);os.replace(temp_output,output)
    print(f'{source.name}: {len(data):,} -> {len(result):,} bytes; {len(replacements)} mipmapped KTX2 images')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input',type=Path)
    parser.add_argument('output',type=Path)
    parser.add_argument('--toktx',default='toktx')
    args=parser.parse_args()
    print(subprocess.check_output([args.toktx,'--version'],text=True).strip())
    compress(args.input,args.output,args.toktx)
