"""Original deterministic Asterion sphere maps. No external/source imagery.

Run with Python + NumPy + Pillow. Spherical 3D noise is sampled in longitude/
latitude, so both poles and the wrap seam are continuous. Maps are material
channels only; illumination, terminator, cloud shading and atmosphere are live.
"""
from pathlib import Path
import numpy as np
from PIL import Image

SIZE = (3072, 1536)
OUT = Path(__file__).resolve().parents[3] / 'public/assets/levels/orbital'
OUT.mkdir(parents=True, exist_ok=True)


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def noise(p):
    cell = np.floor(p).astype(np.int32)
    f = p - cell
    f = f * f * (3 - 2 * f)
    v = np.zeros(p.shape[:-1], dtype=np.float32)
    for x in range(2):
        for y in range(2):
            for z in range(2):
                with np.errstate(over='ignore'):
                    h = ((cell[..., 0] + x).astype(np.uint32) * np.uint32(1597334677)
                         ^ (cell[..., 1] + y).astype(np.uint32) * np.uint32(3812015801)
                         ^ (cell[..., 2] + z).astype(np.uint32) * np.uint32(958282363))
                    h = (h ^ (h >> 16)) * np.uint32(2246822519)
                    h = (h ^ (h >> 13)) * np.uint32(3266489917)
                    h = h ^ (h >> 16)
                n = h.astype(np.float32) / 4294967295
                w = (f[..., 0] if x else 1 - f[..., 0]) * (f[..., 1] if y else 1 - f[..., 1]) * (f[..., 2] if z else 1 - f[..., 2])
                v += n * w
    return v


def fbm(p, octaves=5):
    value = np.zeros(p.shape[:-1], dtype=np.float32)
    weight = .5
    for i in range(octaves):
        value += noise(p) * weight
        p = p * 2.03 + np.array([19.7, 6.13, -9.2])
        weight *= .5
    return value / (1 - 2 ** -octaves)


def mix(a, b, f):
    return np.asarray(a) * (1 - f[..., None]) + np.asarray(b) * f[..., None]


def render_region(size, bounds, suffix=''):
    SIZE = size
    surface = np.empty((SIZE[1], SIZE[0], 4), dtype=np.uint8)
    clouds = np.empty((SIZE[1], SIZE[0], 3), dtype=np.uint8)
    longitude = ((bounds[0] + (np.arange(SIZE[0], dtype=np.float32)[None, :] + .5) / SIZE[0] * bounds[2]) * 2 - 1) * np.pi
    for start in range(0, SIZE[1], 96):
        end = min(start + 96, SIZE[1])
        latitude = (np.pi / 2 - (bounds[1] + (np.arange(start, end, dtype=np.float32)[:, None] + .5) / SIZE[1] * bounds[3]) * np.pi)
        xx = np.cos(latitude) * np.cos(longitude)
        yy = np.sin(latitude) + np.zeros_like(longitude)
        zz = np.cos(latitude) * np.sin(longitude)
        p = np.stack([xx, yy, zz], axis=-1)
        warp = np.stack([fbm(p * 2.3 + k, 3) for k in (4.7, 17.3, -9.1)], axis=-1) - .5
        tectonic = fbm(p * 2.75 + warp * 2.8 + 7.2, 7)
        # Three broad crustal masses, broken by warped rifts and island shelves.
        continental = .54 * tectonic + .46 * fbm(p * 1.35 + np.array([11.2, 5.8, -3.4]), 4)
        continental += (fbm(p * 135 + 16.7, 4) - .5) * .004
        continental += (noise(p * 790 + 45.6) - .5) * .0008
        land = smooth(.5223, .5234, continental)
        shelf = smooth(.518, .5231, continental)
        detail = fbm(p * 390 + warp * 2, 5)
        relief = 1 - np.abs(2 * fbm(p * 74 + warp * 3, 5) - 1)
        ridge = smooth(.72, .94, relief) * smooth(.528, .58, continental)
        dry = smooth(.3, .76, fbm(p * 5.8 + 29.2, 4) + np.exp(-((np.abs(yy) - .43) / .24) ** 2) * .23)
        lowland = mix([39, 72, 58], [148, 132, 95], dry)
        lowland *= (.72 + detail * .47)[..., None]
        mountains = mix(lowland, [149, 148, 130], ridge * .62)
        snow = smooth(.82, .98, np.abs(yy) + ridge * .12 + detail * .015)
        terrain = mix(mountains, [216, 225, 224], snow)
        ocean = mix([8, 27, 48], [31, 95, 109], shelf * .6)
        ocean *= (.95 + detail * .09)[..., None]
        color = mix(ocean, terrain, land)
        ice = smooth(.93, .982, np.abs(yy) + (detail - .5) * .05)
        color = mix(color, [223, 232, 229], ice)
        # Store the land mask in nonzero alpha. Zero-alpha WebP pixels may
        # discard hidden RGB; a 64..255 range preserves the ocean material.
        surface[start:end] = np.clip(np.concatenate([color, 64 + np.maximum(land, ice)[..., None] * 191], axis=-1), 0, 255).astype(np.uint8)
        # Multiscale weather systems and resolved convective cells. Avoid the
        # longitudinal sine advection which caused the first pass's smear bands.
        qq = p.copy()
        for center, strength in [(np.array([.6, .28, .75]), 1.0), (np.array([-.5, -.46, .73]), -.9)]:
            center = center / np.linalg.norm(center)
            dist = np.sqrt(np.maximum(0, 2 - 2 * np.sum(p * center, axis=-1)))
            angle = strength * np.exp(-(dist / .25) ** 2)
            cos_a, sin_a = np.cos(angle), np.sin(angle)
            qq = qq * cos_a[..., None] + np.cross(center, qq) * sin_a[..., None] + center * np.sum(qq * center, axis=-1)[..., None] * (1 - cos_a[..., None])
        macro = fbm(qq * 8.5 + 43.8, 4)
        flow = np.stack([fbm(qq * 17 + k, 3) for k in (3.4, 15.7, -7.2)], axis=-1) - .5
        cell = fbm(qq * 105 + flow * .65, 6)
        erosion = fbm(qq * 620 + 7.1, 4)
        cumulus = smooth(.42, .68, cell + (macro - .5) * .68 - (erosion - .5) * .11)
        cloud = cumulus * smooth(.37, .53, macro)
        veil = smooth(.58, .71, fbm(qq * 49 + flow * 1.4 + 52.1, 5)) * .19
        clouds[start:end] = np.clip(np.stack([cloud, veil, cell], axis=-1) * 255, 0, 255).astype(np.uint8)
        print(f'{suffix or "globe"}: {end}/{SIZE[1]}', flush=True)

    for name, array in [('asterion-surface', surface), ('asterion-clouds', clouds)]:
        image = Image.fromarray(array)
        image.save(OUT / f'{name}{suffix}.webp', quality=97, method=6, exact=True)
        print(name, (OUT / f'{name}{suffix}.webp').stat().st_size)

render_region(SIZE, (0, 0, 1, 1))
# Near-region maps now use the original authored assets documented in
# PROVENANCE.json. This generator only maintains the far hemisphere.
