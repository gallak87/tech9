import * as THREE from 'three';

const clamp = (value, min = 0, max = 255) =>
  Math.max(min, Math.min(max, value));
const smooth = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
const hash = (x, y, salt = 0) => {
  let value =
    Math.imul(x + salt * 47, 374761393) + Math.imul(y - salt * 17, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
};
const noise = (x, y, salt) => {
  const a = Math.floor(x),
    b = Math.floor(y),
    tx = smooth(x - a),
    ty = smooth(y - b);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(hash(a, b, salt), hash(a + 1, b, salt), tx),
    THREE.MathUtils.lerp(hash(a, b + 1, salt), hash(a + 1, b + 1, salt), tx),
    ty,
  );
};

// Original CPU-authored fired-ceramic maps. Coarse ash staining, porous glaze,
// hairline scuffs and a restrained bevel/joint are physically separate scales.
// No image assets, browser canvas, renderer or random simulation state required.
export function createCeramicTextures() {
  const width = 512,
    height = 1024;
  const channels = Object.fromEntries(
    ['plateColor', 'bodyColor', 'plateHeight', 'bodyHeight', 'roughness'].map(
      (key) => [key, new Uint8Array(width * height * 4)],
    ),
  );
  const scratches = Array.from({ length: 32 }, (_, index) => ({
    x: hash(index, 51, 13) * width,
    y: hash(index, 97, 5) * height,
    length: 16 + hash(index, 18, 3) * 96,
    slope: (hash(index, 41, 11) - 0.5) * 0.45,
  }));
  const write = (array, offset, r, g = r, b = r) =>
    array.set([clamp(r), clamp(g), clamp(b), 255], offset);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const fine = hash(x, y, 6);
      const coarse = noise(x / 74, y / 117, 2);
      const ash = noise(x / 22, y / 37, 9);
      const pore = fine < 0.032 ? 1 - fine / 0.032 : 0;
      let scuff = 0;
      for (const scratch of scratches) {
        const dy = y - scratch.y;
        if (dy < 0 || dy > scratch.length) continue;
        const dx = Math.abs(x - scratch.x - dy * scratch.slope);
        if (dx < 1.4)
          scuff = Math.max(
            scuff,
            (1 - dx / 1.4) * Math.sin((Math.PI * dy) / scratch.length),
          );
      }
      const mottling = (coarse - 0.5) * 24 + (ash - 0.5) * 13;
      const body = 238 + mottling + (fine - 0.5) * 9 - pore * 34 - scuff * 22;
      const baseHeight =
        143 + (fine - 0.5) * 24 + (ash - 0.5) * 8 - pore * 69 - scuff * 17;
      // The sealed expansion joint is 2–3 cm wide on a 6 m cassette. A 7 cm
      // rounded edge fades into it, catching the light without a raised overlay.
      const edgeDistance = Math.min(
        x / width,
        (width - 1 - x) / width,
        y / height,
        (height - 1 - y) / height,
      );
      const edge = smooth(edgeDistance / 0.013);
      const seal = smooth(edgeDistance / 0.0034);
      const border = THREE.MathUtils.lerp(0.58, 1, seal) * (0.97 + edge * 0.03);
      write(
        channels.plateColor,
        offset,
        body * border,
        (body - 1) * border,
        (body - 4) * border,
      );
      write(channels.bodyColor, offset, body, body - 1, body - 4);
      write(channels.plateHeight, offset, baseHeight * (0.38 + edge * 0.62));
      write(channels.bodyHeight, offset, baseHeight);
      write(
        channels.roughness,
        offset,
        211 + (coarse - 0.5) * 24 + pore * 28 + scuff * 14,
      );
    }
  return Object.fromEntries(
    Object.entries(channels).map(([key, bytes]) => {
      const texture = new THREE.DataTexture(bytes, width, height);
      texture.name = `Cindercoil original ceramic / ${key}`;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = 8;
      if (key.endsWith('Color')) texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      return [key, texture];
    }),
  );
}
