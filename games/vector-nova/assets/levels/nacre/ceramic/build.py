"""Build ambientCG Terrazzo019S into a pearl mineral-composite finish.

Python + Pillow + NumPy, Khronos toktx 4.4.2. Retained source PNGs are unchanged.
Rebuild: python build.py --toktx /path/to/toktx
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
output = root.parents[3] / 'public/assets/levels/nacre/ceramic'
output.mkdir(parents=True, exist_ok=True)
source = root / 'source'
files = {key: source / f'Terrazzo019S_2K-PNG_{name}.png' for key, name in
         [('color', 'Color'), ('normal', 'NormalGL'), ('roughness', 'Roughness')]}
color = np.asarray(Image.open(files['color']).convert('RGB'), dtype=np.float32) / 255
# Cool/desaturate the beige source to leave Nacre's existing panel tints in charge.
luma = color @ np.array([.2126, .7152, .0722], dtype=np.float32)
color = np.clip(.4 + .6 * (luma[..., None] * .75 + color * .25), 0, 1)
normal = Image.open(files['normal']).convert('RGB')
roughness = np.asarray(Image.open(files['roughness']).convert('L').resize((1024, 1024), Image.Resampling.LANCZOS), dtype=np.float32) / 255
arm = np.zeros((1024, 1024, 3), dtype=np.uint8)
arm[..., 0] = 255
arm[..., 1] = np.rint(255 * (.24 + .46 * roughness)).astype(np.uint8)
records = []
with tempfile.TemporaryDirectory(prefix='nacre-ceramic-') as temp:
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
    'title': 'Nacre pearl mineral-composite ceramic',
    'source': 'https://ambientcg.com/view?id=Terrazzo019S',
    'sourceDownload': 'https://ambientcg.com/get?file=Terrazzo019S_2K-PNG.zip',
    'creator': 'Lennart Demes / ambientCG',
    'license': 'CC0-1.0', 'licenseURL': 'https://docs.ambientcg.com/license/',
    'sourceTechnique': 'Approximation (as described by ambientCG); not claimed as a photogrammetric scan',
    'sourceRepeatMetres': .4, 'runtimeRepeatMetres': 1.2,
    'adaptation': 'Source albedo desaturated 75% and lifted 40% toward white to retain the existing pearl panel tints. Unchanged OpenGL normal. Linear roughness remapped to .24–.70 and packed with neutral AO and zero metalness. Larger mineral scale supports racing-distance readability. Geometry and glazing unchanged.',
    'channels': {'color': 'sRGB', 'normal': 'linear OpenGL +Y', 'arm': 'linear R=1 AO, G=roughness, B=0 metalness'},
    'sources': [{'file': str(p.relative_to(root)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files.values()],
    'runtime': records,
    'encoder': (version.stdout or version.stderr).strip()
}
(root / 'provenance.json').write_text(json.dumps(provenance, indent=2, ensure_ascii=False) + '\n')
