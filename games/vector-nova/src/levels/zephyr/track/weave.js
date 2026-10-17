import * as THREE from 'three';

// Eight 10 cm structural bands per repeat preserve Zephyr's broad woven grid
// at race distance. Relief and satin-coating roughness remain independent maps.
const REPEAT_METRES = 0.8;
export function createZephyrWeave() {
  const size = 512,
    cell = size / 8;
  const color = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const phase = (Math.floor(y / cell) - Math.floor(x / cell) + 8) % 4;
      const warp = phase < 2;
      const cross = (((warp ? x : y) % cell) + 0.5) / cell;
      const along =
        ((warp ? phase : phase - 2) + (((warp ? y : x) % cell) + 0.5) / cell) /
        2;
      const crown = Math.pow(Math.sin(cross * Math.PI), 0.55);
      const crossing = Math.sin(along * Math.PI);
      const fibre = Math.sin(cross * Math.PI * 24);
      const i = (y * size + x) * 4;
      const value = 102 + crown * 23 + crossing * 9 + fibre * crown * 2;
      color.set([value, value + 2, value + 3, 255], i);
      height[y * size + x] =
        crown * 0.0009 + crossing * 0.00045 + fibre * crown * 0.000025;
      const r = 233 - crown * 30 - crossing * 14 + fibre * 4;
      roughness.set([r, r, r, 255], i);
    }
  }
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  const pitch = REPEAT_METRES / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (at(x - 1, y) - at(x + 1, y)) / (2 * pitch);
      const ny = (at(x, y - 1) - at(x, y + 1)) / (2 * pitch);
      const scale = 1 / Math.hypot(nx, ny, 1);
      normal.set(
        [
          Math.round((nx * scale * 0.5 + 0.5) * 255),
          Math.round((ny * scale * 0.5 + 0.5) * 255),
          Math.round((scale * 0.5 + 0.5) * 255),
          255,
        ],
        (y * size + x) * 4,
      );
    }
  }
  return [color, normal, roughness].map((pixels, i) => {
    const texture = new THREE.DataTexture(pixels, size, size);
    texture.name = `Zephyr metric twill / ${['color', 'normal', 'roughness'][i]}`;
    texture.colorSpace = i === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(32 / REPEAT_METRES, 2.5 / REPEAT_METRES);
    texture.anisotropy = 8;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  });
}
