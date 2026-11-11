import * as T from 'three';

// Original clean manufacturing maps. These are restrained material response,
// not painted lighting, arbitrary dirt or a substitute for formed geometry.
export function createBossFinish({ quality = 'high' } = {}) {
  const size = quality === 'low' ? 128 : 256;
  const textures = new Set(),
    materials = new Set();
  const map = (sample, color = false, repeat = 1) => {
    const bytes = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const channels = sample(x / size, y / size);
        const offset = (y * size + x) * 4;
        for (let channel = 0; channel < 3; channel++)
          bytes[offset + channel] = Math.round(
            T.MathUtils.clamp(channels[channel], 0, 255),
          );
        bytes[offset + 3] = 255;
      }
    const texture = new T.DataTexture(bytes, size, size, T.RGBAFormat);
    texture.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    texture.magFilter = T.LinearFilter;
    texture.minFilter = T.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    textures.add(texture);
    return texture;
  };
  const wave = (x, count) => Math.sin(x * count * Math.PI * 2);
  const coat = map((u, v) => {
    const value = 247 + 5 * wave(u, 7) * wave(v, 9) + 2 * wave(u + v, 33);
    return [value, value, value];
  });
  const metal = map((u, v) => {
    const value =
      235 + 12 * wave(u, 64) + 5 * wave(u + wave(v, 3) * 0.001, 121);
    return [value, value, value];
  });
  const carbon = map(
    (u, v) => {
      const a = wave(u, 4),
        b = wave(v, 4);
      const weave = a * b * 0.5 + 0.5;
      const value = 233 + weave * 17;
      return [value, value, value];
    },
    true,
    6,
  );
  const carbonNormal = map(
    (u, v) => [
      128 + 5 * wave(u, 4) * wave(v, 8),
      128 + 5 * wave(v, 4) * wave(u, 8),
      255,
    ],
    false,
    6,
  );
  const presets = {
    ceramic: {
      color: '#cbd5d9',
      metalness: 0.025,
      roughness: 0.24,
      clearcoat: 0.78,
      clearcoatRoughness: 0.1,
      roughnessMap: coat,
    },
    service: {
      color: '#647b88',
      metalness: 0.025,
      roughness: 0.3,
      clearcoat: 0.6,
      clearcoatRoughness: 0.14,
      roughnessMap: coat,
    },
    carbon: {
      color: '#29343d',
      metalness: 0.12,
      roughness: 0.31,
      clearcoat: 0.82,
      clearcoatRoughness: 0.1,
      map: carbon,
      normalMap: carbonNormal,
      normalScale: new T.Vector2(0.16, 0.16),
    },
    alloy: {
      color: '#b8c5cb',
      metalness: 0.94,
      roughness: 0.26,
      anisotropy: 0.32,
      roughnessMap: metal,
      clearcoat: 0,
    },
    darkalloy: {
      color: '#56636b',
      metalness: 0.88,
      roughness: 0.32,
      roughnessMap: metal,
      clearcoat: 0,
    },
    glass: {
      color: '#0b1c28',
      metalness: 0.02,
      roughness: 0.13,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      ior: 1.5,
    },
    paint: {
      color: '#b53430',
      metalness: 0.015,
      roughness: 0.26,
      clearcoat: 0.72,
      clearcoatRoughness: 0.11,
      roughnessMap: coat,
    },
  };
  function bind(material, kind, overrides = {}) {
    const recipe = presets[kind];
    if (!recipe) throw new Error(`Unknown boss finish: ${kind}`);
    const values = { ...recipe, ...overrides };
    if (!material.isMeshPhysicalMaterial)
      for (const key of [
        'clearcoat',
        'clearcoatRoughness',
        'ior',
        'anisotropy',
      ])
        delete values[key];
    material.setValues(values);
    material.userData.bossFinish = kind;
    material.needsUpdate = true;
    return material;
  }
  return {
    bind,
    material(name, kind, overrides) {
      const result = new T.MeshPhysicalMaterial();
      result.name = name;
      materials.add(result);
      return bind(result, kind, overrides);
    },
    dispose() {
      materials.forEach((value) => value.dispose());
      textures.forEach((value) => value.dispose());
      materials.clear();
      textures.clear();
    },
  };
}
