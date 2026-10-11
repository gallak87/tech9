"""Build a dense heat-ceramic finish from ambientCG Concrete034 (CC0).

Rebuild with Python, Pillow, NumPy and Khronos toktx 4.4.2:
python build.py --toktx /path/to/toktx
Source maps are retained unchanged; no tile joints are baked into the material.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--toktx', default='toktx')
args = parser.parse_args()
output = root.parents[3] / 'public/assets/levels/helion/ceramic'
output.mkdir(parents=True, exist_ok=True)
files = {key: root / 'source' / f'Concrete034_2K-PNG_{name}.png' for key, name in
         [('color', 'Color'), ('normal', 'NormalGL'), ('roughness', 'Roughness')]}
color = np.asarray(Image.open(files['color']).convert('RGB'), dtype=np.float32) / 255
# Keep the mineral relief while lifting albedo for the existing ivory tints.
color = np.clip(.25 + color * .75, 0, 1)
normal = Image.open(files['normal']).convert('RGB')
roughness = np.asarray(Image.open(files['roughness']).convert('L').resize((1024, 512), Image.Resampling.LANCZOS), dtype=np.float32) / 255
arm = np.zeros((512, 1024, 3), dtype=np.uint8)
arm[..., 0] = 255
arm[..., 1] = np.rint(255 * (.28 + .42 * roughness)).astype(np.uint8)
records = []
with tempfile.TemporaryDirectory(prefix='helion-ceramic-') as temp:
    images = {'color': Image.fromarray(np.rint(color * 255).astype(np.uint8)),
              'normal': normal, 'arm': Image.fromarray(arm)}
    for name, image in images.items():
        path = Path(temp) / (name + '.png')
        image.save(path)
        target = output / (name + '.ktx2')
        command = [args.toktx, '--t2', '--encode', 'uastc', '--uastc_quality', '3',
                   '--zcmp', '18', '--genmipmap', '--lower_left_maps_to_s0t0',
                   '--threads', '4', '--assign_oetf', 'srgb' if name == 'color' else 'linear',
                   '--assign_primaries', 'bt709' if name == 'color' else 'none']
        if name == 'normal': command += ['--normalize']
        subprocess.run(command + [str(target), str(path)], check=True)
        records.append({'file': target.name, 'dimensions': list(image.size),
                        'bytes': target.stat().st_size,
                        'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
        print(name, records[-1]['bytes'], flush=True)
version = subprocess.run([args.toktx, '--version'], check=True, capture_output=True, text=True)
provenance = {
    'title': 'Helion dense mineral heat ceramic',
    'source': 'https://ambientcg.com/view?id=Concrete034',
    'sourceDownload': 'https://ambientcg.com/get?file=Concrete034_2K-PNG.zip',
    'creator': 'Lennart Demes / ambientCG',
    'license': 'CC0-1.0', 'licenseURL': 'https://docs.ambientcg.com/license/',
    'sourceTechnique': 'Approximation, as described by ambientCG; not a photogrammetric scan',
    'sourceRepeatMetres': [1.1, .55], 'runtimeRepeatMetres': [4.4, 2.2],
    'adaptation': 'Source albedo lifted 25% toward white. OpenGL normal retained. Roughness remapped to .28–.70. Fine mineral relief becomes the substrate for ivory heat ceramics and graphite-covered cassettes; material parameters distinguish new, heat-cycled and sheltered panels. Geometry supplies all joints. The source aspect ratio is preserved in metric road coordinates.',
    'channels': {'color': 'sRGB', 'normal': 'linear OpenGL +Y', 'arm': 'linear R=1 AO, G=roughness, B=0 metalness'},
    'sources': [{'file': str(p.relative_to(root)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files.values()],
    'runtime': records,
    'encoder': (version.stdout or version.stderr).strip()
}
(root / 'provenance.json').write_text(json.dumps(provenance, indent=2, ensure_ascii=False) + '\n')
