// Locally owned adaptation of Tech9 island-ocean procedural wind-ripple normals.
import * as THREE from 'three';

export function createNacreOceanNormals(size = 256) {
  if (
    !Number.isInteger(size) ||
    size < 16 ||
    size > 512 ||
    (size & (size - 1)) !== 0
  )
    throw new RangeError(
      'Normal texture size must be a power of two from 16 to 512.',
    );
  const data = new Uint8Array(size * size * 4);
  const noise = (x, y, cells) => {
    const u = (x / size) * cells,
      v = (y / size) * cells,
      ix = Math.floor(u),
      iy = Math.floor(v);
    const hash = (a, b) => {
      const k =
        Math.sin(
          (((a % cells) + cells) % cells) * 127.1 +
            (((b % cells) + cells) % cells) * 311.7 +
            48.7,
        ) * 43758.5453;
      return k - Math.floor(k);
    };
    const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10),
      fx = ease(u - ix),
      fy = ease(v - iy);
    const a = hash(ix, iy) * (1 - fx) + hash(ix + 1, iy) * fx,
      b = hash(ix, iy + 1) * (1 - fx) + hash(ix + 1, iy + 1) * fx;
    return a * (1 - fy) + b * fy;
  };
  const height = (x, y) =>
    noise(x, y, 8) +
    noise(x, y, 16) * 0.48 +
    noise(x, y, 32) * 0.21 +
    noise(x, y, 64) * 0.08;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4,
        dx = (height(x + 1, y) - height(x - 1, y)) * 3.8,
        dy = (height(x, y + 1) - height(x, y - 1)) * 3.8;
      data[i] = 128 + Math.max(-0.8, Math.min(0.8, dx)) * 127;
      data[i + 1] = 128 + Math.max(-0.8, Math.min(0.8, dy)) * 127;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  const normals = new THREE.DataTexture(data, size, size);
  normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
  normals.magFilter = THREE.LinearFilter;
  normals.minFilter = THREE.LinearMipmapLinearFilter;
  normals.generateMipmaps = true;
  normals.needsUpdate = true;
  return normals;
}
