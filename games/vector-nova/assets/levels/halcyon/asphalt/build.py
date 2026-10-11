"""Build the retained CC0 asphalt maps into browser-ready mipmapped KTX2.

Requires Khronos toktx 4.4.2; input files and source hashes are in provenance.json.
Color/normal retain 2K, packed AO/roughness/metalness uses 1K. No painted lighting.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--toktx', default='toktx')
args = parser.parse_args()
output = root.parents[3] / 'public/assets/levels/halcyon/asphalt'
output.mkdir(parents=True, exist_ok=True)
records = []
for name in ['color', 'normal', 'arm']:
    source, target = root / (name + '.png'), output / (name + '.ktx2')
    command = [args.toktx, '--t2', '--encode', 'uastc', '--uastc_quality', '3',
               '--zcmp', '18', '--genmipmap', '--lower_left_maps_to_s0t0',
               '--threads', '4', '--assign_oetf', 'srgb' if name == 'color' else 'linear',
               '--assign_primaries', 'bt709' if name == 'color' else 'none']
    if name == 'normal':
        command += ['--normalize']
    subprocess.run(command + [str(target), str(source)], check=True)
    records.append({'file': target.name, 'bytes': target.stat().st_size,
                    'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
    print(target.name, target.stat().st_size)
provenance = json.loads((root / 'provenance.json').read_text())
provenance['runtime'] = records
version = subprocess.run([args.toktx, '--version'], check=True, capture_output=True, text=True)
provenance['encoder'] = (version.stdout or version.stderr).strip()
(root / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
