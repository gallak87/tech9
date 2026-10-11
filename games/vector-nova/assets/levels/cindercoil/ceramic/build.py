"""Build Cindercoil fired mineral ceramic from ambientCG Concrete030 (CC0).

Python + Pillow + NumPy; pass --toktx /path/to/toktx (KTX-Software 4.4.2).
Source maps stay unchanged. Panel construction is independent of these maps.
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
output = root.parents[3] / 'public/assets/levels/cindercoil/ceramic'
output.mkdir(parents=True, exist_ok=True)
files = {key: root / 'source' / f'Concrete030_2K-PNG_{name}.png' for key, name in
         [('color', 'Color'), ('normal', 'NormalGL'), ('roughness', 'Roughness')]}
source = np.asarray(Image.open(files['color']).convert('RGB'), dtype=np.float32) / 255
# Neutral mineral substrate preserves the circuit's ivory/oxide/charcoal tints.
luma = source @ np.array([.2126, .7152, .0722])
color = np.clip(.88 + (luma - luma.mean()) * .95, 0, 1)
color = np.repeat(color[..., None], 3, axis=2)
normal = Image.open(files['normal']).convert('RGB')
roughness = np.asarray(Image.open(files['roughness']).convert('L').resize((1024, 1024), Image.Resampling.LANCZOS), dtype=np.float32) / 255
arm = np.zeros((1024, 1024, 3), dtype=np.uint8)
arm[..., 0] = 255
arm[..., 1] = np.rint(255 * (.42 + .53 * roughness)).astype(np.uint8)
records = []
with tempfile.TemporaryDirectory(prefix='cindercoil-ceramic-') as temp:
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
    'title': 'Cindercoil fired mineral ceramic',
    'source': 'https://ambientcg.com/view?id=Concrete030',
    'sourceDownload': 'https://ambientcg.com/get?file=Concrete030_2K-PNG.zip',
    'creator': 'Lennart Demes / ambientCG',
    'license': 'CC0-1.0', 'licenseURL': 'https://docs.ambientcg.com/license/',
    'sourceTechnique': 'Procedural, as described by ambientCG; not a photogrammetric scan',
    'runtimeRepeatMetres': [3, 3],
    'adaptation': 'Neutral albedo centered at .88 with retained mineral variation. OpenGL normal retained. Roughness remapped to .42–.95. One compressed set serves matte fired bodies, oxide repair cassettes and a separate dark Crown glaze. Metric coordinates keep grain square; analytical fitted seams follow original 6 × 12 m cassette UVs without moving contact geometry. No baked lighting or lava color.',
    'channels': {'color': 'sRGB', 'normal': 'linear OpenGL +Y', 'arm': 'linear R=1 AO, G=roughness, B=0 metalness'},
    'sources': [{'file': str(p.relative_to(root)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files.values()],
    'runtime': records, 'encoder': (version.stdout or version.stderr).strip()
}
(root / 'provenance.json').write_text(json.dumps(provenance, indent=2, ensure_ascii=False) + '\n')
