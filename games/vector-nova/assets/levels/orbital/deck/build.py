"""Author Asterion's seamless coated-alloy cassette PBR maps and encode KTX2.

Requires Python, numpy, Pillow and Khronos toktx 4.4.2. No downloaded imagery.
One cassette is 28/6 by 6 metres; relief is in metres, not color-derived bump.
The map origin is bottom-left: array row y is positive tangent-space v.
Usage: python build.py --toktx /path/to/toktx
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT.parents[3] / 'public/assets/levels/orbital/deck'
SIZE = 2048
WIDTH, LENGTH = 28 / 6, 6.0


def smooth(a, b, value):
    t = np.clip((value - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def author():
    # Sampling pixel centres keeps mirrored tile boundaries continuous.
    y, x = np.meshgrid((np.arange(SIZE, dtype=np.float32) + .5) * LENGTH / SIZE,
                       (np.arange(SIZE, dtype=np.float32) + .5) * WIDTH / SIZE,
                       indexing='ij')
    edge_x, edge_y = np.minimum(x, WIDTH - x), np.minimum(y, LENGTH - y)
    edge = np.minimum(np.minimum(edge_x, edge_y), (edge_x + edge_y - .22) / np.sqrt(2))
    plate = smooth(.019, .025, edge)
    bevel = smooth(.026, .060, edge)
    face = smooth(.068, .076, edge)
    height = -.014 + .014 * bevel
    # Periodic finish variation is intentionally subtle and has no directional light.
    grain = (np.sin(x * (2 * np.pi / WIDTH) * 503 + np.sin(y * (2 * np.pi / LENGTH) * 17))
             + np.sin(y * (2 * np.pi / LENGTH) * 431 + x * (2 * np.pi / WIDTH) * 23)) * .5
    broad = np.sin(x * (2 * np.pi / WIDTH) * 3) * np.sin(y * (2 * np.pi / LENGTH) * 2)
    color = np.zeros((SIZE, SIZE, 3), dtype=np.float32) + [24, 35, 42]
    rough = np.full((SIZE, SIZE), .83, dtype=np.float32)
    metal = np.full_like(rough, .02)
    ao = .63 + .37 * smooth(.019, .08, edge)

    def blend(mask, rgb, r, m):
        nonlocal color, rough, metal
        color = color * (1 - mask[..., None]) + np.asarray(rgb) * mask[..., None]
        rough = rough * (1 - mask) + r * mask
        metal = metal * (1 - mask) + m * mask

    blend(plate, [115, 133, 144], .34, .76)  # Machined shoulder below coating.
    blend(face, [111, 129, 142], .43 + .035 * broad + .025 * grain, .23)
    color += (grain * .8 + broad * .7)[..., None] * face[..., None]
    height += face * grain * .00004
    # A shallow pressed register follows the panel contour, not a painted border.
    groove = np.exp(-((edge - .16) / .0055) ** 2)
    height -= groove * .0015
    rough += groove * .045
    ao -= groove * .07
    # Four seated quarter-turn retainers, with machined countersinks and a slot.
    for px in [.245, WIDTH - .245]:
        for py in [.255, LENGTH - .255]:
            dx, dy = x - px, y - py
            radius = np.hypot(dx, dy)
            socket = 1 - smooth(.035, .040, radius)
            head = 1 - smooth(.022, .029, radius)
            height -= .0055 * socket * (1 - head)
            blend(socket, [36, 45, 50], .65, .35)
            blend(head, [151, 163, 169], .32, .86)
            slot = (1 - smooth(.002, .0045, np.abs(dy))) * (1 - smooth(.013, .017, np.abs(dx)))
            height -= slot * .003
            blend(slot, [25, 34, 39], .78, .12)
            ao -= .18 * socket * (1 - head)
    # Small removable contact blocks at each end, with seated warm metal contacts.
    for py in [.30, LENGTH - .30]:
        dx, dy = np.abs(x - WIDTH / 2), np.abs(y - py)
        recess = (1 - smooth(.25, .26, dx)) * (1 - smooth(.049, .06, dy))
        lip = (1 - smooth(.263, .269, dx)) * (1 - smooth(.065, .071, dy))
        blend(lip, [139, 153, 158], .34, .82)
        blend(recess, [24, 34, 41], .7, .1)
        height -= recess * .009
        ao -= recess * .18
        for px in [-.156, -.052, .052, .156]:
            contact = (1 - smooth(.025, .029, np.abs(x - WIDTH / 2 - px))) * (1 - smooth(.028, .032, dy))
            blend(contact, [147, 133, 103], .3, .82)
            height += contact * .006
    # Central derivative with wrapped boundaries: a genuine GL tangent normal map.
    dhdx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * WIDTH / SIZE)
    dhdy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * LENGTH / SIZE)
    normal = np.stack([-dhdx, -dhdy, np.ones_like(height)], axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    return {
        'color': np.uint8(np.clip(color, 0, 255)),
        'normal': np.uint8(np.clip((normal * .5 + .5) * 255, 0, 255)),
        'arm': np.uint8(np.clip(np.stack([ao, rough, metal], axis=-1) * 255, 0, 255)),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--toktx', default='toktx')
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    records = []
    with tempfile.TemporaryDirectory(prefix='asterion-deck-') as directory:
        for name, pixels in author().items():
            source = Path(directory) / (name + '.png')
            image = Image.fromarray(pixels)
            if name == 'arm':
                image = image.resize((1024, 1024), Image.Resampling.LANCZOS)
            image.save(source)
            target = OUTPUT / (name + '.ktx2')
            command = [args.toktx, '--t2', '--encode', 'uastc', '--uastc_quality', '3',
                       '--zcmp', '18', '--genmipmap', '--lower_left_maps_to_s0t0',
                       '--threads', '4', '--assign_oetf', 'srgb' if name == 'color' else 'linear',
                       '--assign_primaries', 'bt709' if name == 'color' else 'none']
            if name == 'normal':
                command += ['--normalize']
            subprocess.run(command + [str(target), str(source)], check=True)
            records.append({'file': target.name, 'dimensions': list(image.size),
                            'bytes': target.stat().st_size,
                            'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
            print(target.name, target.stat().st_size, flush=True)
    version = subprocess.run([args.toktx, '--version'], check=True, capture_output=True, text=True)
    provenance = {
        'title': 'Asterion sealed induction cassette / coated alloy',
        'creator': 'VECTOR//NOVA project contributors',
        'rights': 'Project-authored; no third-party asset restrictions',
        'source': 'build.py: deterministic analytic relief and original surface design; no imagegen, external images or baked illumination',
        'physicalTileMetres': [WIDTH, LENGTH],
        'channels': {'color': 'sRGB albedo', 'normal': 'OpenGL tangent-space +Y',
                     'arm': 'linear R ambient occlusion, G roughness, B metalness'},
        'encoder': (version.stdout or version.stderr).strip(),
        'runtime': records,
    }
    (ROOT / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')


if __name__ == '__main__':
    main()
