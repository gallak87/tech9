import * as THREE from 'three';
import { fbm2D, ridge2D, noise2D } from '../core/rng.js';

// ─────────────────────────────────────────────────────────────────────────────
// The procedural texture kit. Every map in this game is baked here, in code.
// No PNGs, no fetch, no CDN — that is a hard rule, not a preference.
//
// NYQUIST: a baked map is sampled by the GPU at whatever rate the surface
// happens to occupy on screen. Frequency content finer than ~4× that rate is
// not detail, it is aliasing, and it reads as dirt at every zoom. Pick octaves
// against the *repeat* the material will use, not against the texture size.
//
// Everything here is deterministic (seeded value noise, no Math.random) and
// cached by key, so `digest.mjs` can hash the output and prove a refactor
// changed nothing.
// ─────────────────────────────────────────────────────────────────────────────

const cache = new Map();

/** Bake once per key per page. `cached('rock.normal', () => bake(...))`. */
export function cached(key, make) {
  let t = cache.get(key);
  if (!t) { t = make(); cache.set(key, t); }
  return t;
}

export function clearTextureCache() {
  for (const t of cache.values()) t?.dispose?.();
  cache.clear();
}

/** Keys baked so far — `digest.mjs` walks these. */
export function textureKeys() { return [...cache.keys()].sort(); }

function finish(tex, { repeat = 1, aniso = 8, srgb = false } = {}) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

/**
 * Tileable height field, as a plain Float32Array. Everything else is derived
 * from one of these — normals, roughness, albedo variation — so that a normal
 * map and the roughness map that goes with it agree about where the bumps are.
 */
export function bakeHeightField(size, fn) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) h[y * size + x] = fn(x / size, y / size, x, y);
  }
  return h;
}

/** Sobel a height field into a tangent-space normal map. */
export function normalFromHeight(h, size, strength = 1.6) {
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1))
               - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))
               - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const i = (y * size + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = (nz * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  return tex;
}

/** A single-channel map (roughness, AO, metalness mask) from a height field. */
export function grayFromHeight(h, size, map = (v) => v) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.max(0, Math.min(1, map(h[i], i))) * 255;
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
}

/** Colour map from a height field plus a ramp. Written in LINEAR light. */
export function colorFromHeight(h, size, ramp) {
  const data = new Uint8Array(size * size * 4);
  const c = new THREE.Color();
  for (let i = 0; i < size * size; i++) {
    ramp(h[i], i, c);
    data[i * 4] = c.r * 255;
    data[i * 4 + 1] = c.g * 255;
    data[i * 4 + 2] = c.b * 255;
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ── ready-made surfaces ─────────────────────────────────────────────────── */

/**
 * Ground detail. Two octaves of tileable fbm with a hint of ridge, at a
 * frequency chosen for a ~4 m repeat: fine enough to break up a 30 m frame,
 * coarse enough not to shimmer under the pixel-snap pass later.
 */
export function groundDetail({ size = 512, seed = 11, period = 4, repeat = 11 } = {}) {
  // Three octaves at a 4-cell base over an ~22 m repeat: the finest feature is
  // about 0.7 m, which is roughly 40 px in the shipping framing. The first pass
  // used four octaves over an 8 m repeat and every square metre of the world
  // read as identical gravel — uniform-amplitude detail at every scale is not
  // detail, it is a wash. Coarse and directional beats fine and even.
  const h = bakeHeightField(size, (u, v) => {
    const a = fbm2D(u * period, v * period, { octaves: 3, gain: 0.48, seed, period });
    const b = ridge2D(u * period * 2, v * period * 2, { octaves: 2, gain: 0.5, seed: seed + 91, period: period * 2 });
    return a * 0.80 + b * 0.20;
  });
  return {
    normal: finish(normalFromHeight(h, size, 1.15), { repeat }),
    rough: finish(grayFromHeight(h, size, (v) => 0.66 + v * 0.28), { repeat }),
    height: h,
  };
}

/** Coarse, sharp-shouldered rock. Higher normal strength, lower roughness range. */
export function rockDetail({ size = 512, seed = 47, period = 6, repeat = 3 } = {}) {
  const h = bakeHeightField(size, (u, v) => {
    const r = ridge2D(u * period, v * period, { octaves: 5, gain: 0.55, seed, period });
    const f = fbm2D(u * period * 3, v * period * 3, { octaves: 3, seed: seed + 7, period: period * 3 });
    return r * 0.8 + f * 0.2;
  });
  return {
    normal: finish(normalFromHeight(h, size, 3.4), { repeat }),
    rough: finish(grayFromHeight(h, size, (v) => 0.55 + (1 - v) * 0.35), { repeat }),
  };
}

/** Brushed / pitted metal for the alien-terraformed hardware. */
export function metalDetail({ size = 512, seed = 5, repeat = 2 } = {}) {
  const h = bakeHeightField(size, (u, v) => {
    // Mildly anisotropic — brushed, not corduroy. A 32:1 stretch mapped onto a
    // sphere's UV turns into concentric rings, which is a texture reading as a
    // modelling error; 6:1 keeps the direction and loses the rings.
    const brush = fbm2D(u * 8, v * 48, { octaves: 3, gain: 0.5, seed, period: 48 });
    const pit = fbm2D(u * 26, v * 26, { octaves: 2, seed: seed + 3, period: 26 });
    return brush * 0.7 + (pit > 0.78 ? 0.3 : 0);
  });
  return {
    normal: finish(normalFromHeight(h, size, 0.7), { repeat }),
    rough: finish(grayFromHeight(h, size, (v) => 0.18 + v * 0.42), { repeat }),
  };
}

/**
 * A vertical gradient strip used for emissive neon trim. 64×1 — a big texture
 * for a one-dimensional ramp is wasted memory and wasted bandwidth.
 */
export function neonRamp(stops, size = 64) {
  const data = new Uint8Array(size * 4);
  const a = new THREE.Color(), b = new THREE.Color(), c = new THREE.Color();
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    let lo = stops[0], hi = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) { lo = stops[s]; hi = stops[s + 1]; break; }
    }
    const k = hi[0] === lo[0] ? 0 : (t - lo[0]) / (hi[0] - lo[0]);
    a.set(lo[1]); b.set(hi[1]);
    c.copy(a).lerp(b, k);
    data[i * 4] = c.r * 255; data[i * 4 + 1] = c.g * 255; data[i * 4 + 2] = c.b * 255; data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Blue-noise-ish dither tile for the grade pass. 64² is plenty. */
export function ditherTile(size = 64, seed = 313) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = noise2D((i % size) * 1.7, ((i / size) | 0) * 1.7, seed, size) * 255;
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
