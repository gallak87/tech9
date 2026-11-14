import {
  Data3DTexture,
  RedFormat,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
} from 'three';

const leases = new WeakMap();
let shared = null,
  users = 0;

export function createUmbraSurfaceNoise(size = 64) {
  const data = new Uint8Array(size ** 3);
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const hash = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
        data[x + size * (y + size * z)] = Math.round(
          (hash - Math.floor(hash)) * 255,
        );
      }
  const texture = new Data3DTexture(data, size, size, size);
  texture.name = 'Umbra / shared filtered mineral noise';
  texture.format = RedFormat;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = RepeatWrapping;
  texture.generateMipmaps = true;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

// Every finished material leases the same small volume. The last material's
// disposal releases it; creating a new world starts a fresh owned allocation.
export function leaseUmbraSurfaceNoise(material) {
  if (leases.has(material)) return leases.get(material);
  shared ??= createUmbraSurfaceNoise();
  const texture = shared;
  users++;
  leases.set(material, texture);
  const release = () => {
    material.removeEventListener('dispose', release);
    leases.delete(material);
    delete material.umbraNoise;
    if (--users === 0) {
      texture.dispose();
      shared = null;
    }
  };
  material.addEventListener('dispose', release);
  // Keep this sampler visible to resource accounting as well as shader uniforms.
  material.umbraNoise = texture;
  return texture;
}
