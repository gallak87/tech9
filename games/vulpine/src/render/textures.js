import * as THREE from 'three';
import { RNG } from '../core/rng.js';

// ─────────────────────────────────────────────────────────────────────────────
// Procedural texture bakery. Everything the game renders is generated here at
// boot — no binary art assets, no network fetches, and byte-identical output
// every run because every generator takes a seeded RNG.
//
// All bakers return three textures ready to hand to a material; colour maps are
// tagged SRGBColorSpace, data maps (normal/rough/metal/ao) stay linear.
// ─────────────────────────────────────────────────────────────────────────────

/* ── noise primitives ─────────────────────────────────────────────────────── */

/** Tileable value-noise lattice. Returns a sampler closure over [0,1)². */
export function latticeNoise(size, rng) {
  const g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  const wrap = (v) => ((v % size) + size) % size;
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const fx = x * size, fy = y * size;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fade(fx - x0), ty = fade(fy - y0);
    const x0w = wrap(x0), x1w = wrap(x0 + 1), y0w = wrap(y0), y1w = wrap(y0 + 1);
    const a = g[y0w * size + x0w], b = g[y0w * size + x1w];
    const c = g[y1w * size + x0w], d = g[y1w * size + x1w];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
}

/**
 * Multi-octave fbm over tileable lattices. Returns a sampler in [0,1].
 *
 * Frequency lives in the lattice size alone — the sample coordinate is *not*
 * additionally scaled. (Doing both multiplies frequency by lacunarity² per
 * octave, which silently pushes the top octaves past Nyquist and turns the
 * whole field into aliased fizz.)
 *
 * Highest frequency = base × lacunarity^(octaves-1) cells across the unit
 * domain; keep that under a quarter of your sampling rate.
 */
export function fbm2D(rng, { octaves = 5, base = 4, lacunarity = 2, gain = 0.5 } = {}) {
  const layers = [];
  let freq = base, amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    layers.push({ n: latticeNoise(Math.max(2, Math.round(freq)), rng), a: amp });
    norm += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return (x, y) => {
    let s = 0;
    for (const l of layers) s += l.n(x, y) * l.a;
    return s / norm;
  };
}

/** Ridged fbm — sharp creases, right for rock and cloud edges. */
export function ridged2D(rng, opts = {}) {
  const f = fbm2D(rng, opts);
  return (x, y) => {
    const v = f(x, y);
    return 1 - Math.abs(v * 2 - 1);
  };
}

/** Worley / cellular F1 distance field, tileable. */
export function worley2D(rng, cells = 8) {
  const pts = new Float32Array(cells * cells * 2);
  for (let i = 0; i < cells * cells; i++) {
    pts[i * 2] = (i % cells + rng.next()) / cells;
    pts[i * 2 + 1] = (Math.floor(i / cells) + rng.next()) / cells;
  }
  return (x, y) => {
    let best = 4;
    const cx = Math.floor(x * cells), cy = Math.floor(y * cells);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const gx = ((cx + ox) % cells + cells) % cells;
        const gy = ((cy + oy) % cells + cells) % cells;
        const idx = (gy * cells + gx) * 2;
        let dx = pts[idx] + ox * 0 - x;
        let dy = pts[idx + 1] - y;
        // wrap shortest path
        if (dx > 0.5) dx -= 1; if (dx < -0.5) dx += 1;
        if (dy > 0.5) dy -= 1; if (dy < -0.5) dy += 1;
        const d = dx * dx + dy * dy;
        if (d < best) best = d;
      }
    }
    return Math.min(1, Math.sqrt(best) * cells * 0.85);
  };
}

/* ── texture construction ─────────────────────────────────────────────────── */

function finish(tex, { srgb = false, repeat = 1, aniso = 16 } = {}) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = aniso;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Build an RGBA8 DataTexture from a per-texel callback returning [r,g,b,a] 0..1. */
export function bakeRGBA(size, fn, opts = {}) {
  const data = new Uint8Array(size * size * 4);
  const out = [0, 0, 0, 1];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      fn(x / size, y / size, out, x, y);
      const i = (y * size + x) * 4;
      data[i] = Math.max(0, Math.min(255, out[0] * 255)) | 0;
      data[i + 1] = Math.max(0, Math.min(255, out[1] * 255)) | 0;
      data[i + 2] = Math.max(0, Math.min(255, out[2] * 255)) | 0;
      data[i + 3] = Math.max(0, Math.min(255, out[3] * 255)) | 0;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  return finish(tex, opts);
}

/** Height field (Float32Array, size²) → tangent-space normal map. */
export function normalFromHeight(height, size, strength = 2.0, opts = {}) {
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = at(x - 1, y), r = at(x + 1, y);
      const d = at(x, y - 1), u = at(x, y + 1);
      let nx = (l - r) * strength;
      let ny = (d - u) * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len;
      const i = (y * size + x) * 4;
      data[i] = ((nx * 0.5 + 0.5) * 255) | 0;
      data[i + 1] = ((ny * 0.5 + 0.5) * 255) | 0;
      data[i + 2] = ((nz / len * 0.5 + 0.5) * 255) | 0;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  return finish(tex, opts);
}

/* ── material sets ────────────────────────────────────────────────────────── */

/**
 * Brushed / panelled spacecraft hull. Returns { map, normalMap, roughnessMap,
 * metalnessMap, aoMap } — panel seams, rivet lines, micro-scratches and a
 * subtle roughness break-up so the highlight never reads as plastic.
 */
export function bakeHullMaterial({ seed = 'hull', size = 1024, panel = 8, tint = [0.80, 0.83, 0.88], grime = 0.35 } = {}) {
  const rng = new RNG(seed);
  const micro = fbm2D(rng, { octaves: 6, base: 32, gain: 0.55 });
  const macro = fbm2D(rng, { octaves: 4, base: 3, gain: 0.6 });
  const scratchRng = new RNG(seed + ':scratch');

  // scratch layer — thin anisotropic streaks
  const scratches = new Float32Array(size * size);
  for (let s = 0; s < 340; s++) {
    const x0 = scratchRng.next() * size, y0 = scratchRng.next() * size;
    const ang = scratchRng.range(-0.35, 0.35) + (scratchRng.next() < 0.5 ? 0 : Math.PI / 2);
    const len = scratchRng.range(12, 190);
    const dep = scratchRng.range(0.15, 0.75);
    for (let t = 0; t < len; t++) {
      const x = Math.round(x0 + Math.cos(ang) * t) % size;
      const y = Math.round(y0 + Math.sin(ang) * t) % size;
      const xi = (x + size) % size, yi = (y + size) % size;
      scratches[yi * size + xi] = Math.max(scratches[yi * size + xi], dep * (1 - t / len));
    }
  }

  const height = new Float32Array(size * size);
  const seam = (u, v) => {
    const su = Math.abs(((u * panel) % 1) - 0.5) * 2;
    const sv = Math.abs(((v * panel) % 1) - 0.5) * 2;
    const e = Math.max(su, sv);
    return Math.pow(Math.max(0, e - 0.955) / 0.045, 1.2);
  };
  const rivet = (u, v) => {
    const gu = (u * panel * 2) % 1, gv = (v * panel * 2) % 1;
    const d = Math.hypot(gu - 0.5, gv - 0.5);
    return Math.max(0, 1 - d / 0.045);
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const s = seam(u, v);
      const r = rivet(u, v);
      const m = micro(u, v);
      height[y * size + x] = -s * 0.55 + r * 0.35 + m * 0.06 - scratches[y * size + x] * 0.10;
    }
  }

  const map = bakeRGBA(size, (u, v, out) => {
    const s = seam(u, v);
    const plateId = Math.floor(u * panel) * 31 + Math.floor(v * panel) * 17;
    const plateShade = 0.94 + ((plateId * 2654435761) % 1000) / 1000 * 0.12;
    const dirt = macro(u, v);
    const sc = scratches[(Math.floor(v * size) * size + Math.floor(u * size))] || 0;
    const k = plateShade * (1 - s * 0.45) * (1 - dirt * grime * 0.5) + sc * 0.18;
    out[0] = tint[0] * k; out[1] = tint[1] * k; out[2] = tint[2] * k; out[3] = 1;
  }, { srgb: true });

  const normalMap = normalFromHeight(height, size, 3.0);

  const roughnessMap = bakeRGBA(size, (u, v, out) => {
    const s = seam(u, v);
    const m = micro(u, v);
    const dirt = macro(u, v);
    const sc = scratches[(Math.floor(v * size) * size + Math.floor(u * size))] || 0;
    const r = 0.24 + s * 0.42 + m * 0.14 + dirt * 0.22 * grime + sc * 0.35;
    out[0] = out[1] = out[2] = Math.min(1, r); out[3] = 1;
  });

  const metalnessMap = bakeRGBA(size, (u, v, out) => {
    const s = seam(u, v);
    const dirt = macro(u, v);
    const m = 1 - s * 0.55 - dirt * 0.30 * grime;
    out[0] = out[1] = out[2] = Math.max(0, m); out[3] = 1;
  });

  const aoMap = bakeRGBA(size, (u, v, out) => {
    const s = seam(u, v);
    const a = 1 - s * 0.55;
    out[0] = out[1] = out[2] = a; out[3] = 1;
  });

  return { map, normalMap, roughnessMap, metalnessMap, aoMap };
}

/** Soft round puff with fbm break-up — the cloud / smoke / dust billboard. */
export function bakePuff({ seed = 'puff', size = 256, softness = 1.0, detail = 0.65 } = {}) {
  const rng = new RNG(seed);
  const f = fbm2D(rng, { octaves: 5, base: 4, gain: 0.55 });
  return bakeRGBA(size, (u, v, out) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.hypot(dx, dy) * 2;
    const n = f(u, v);
    const edge = d + (n - 0.5) * detail;
    let a = 1 - smooth01(edge, 0.35 * softness, 1.0);
    a = Math.pow(Math.max(0, a), 1.35);
    out[0] = out[1] = out[2] = 1;
    out[3] = a;
  }, { repeat: 1 });
}

/** Hot core → cool edge radial gradient for muzzle flashes and explosions. */
export function bakeFlare({ seed = 'flare', size = 256, spikes = 6, spikeLen = 0.9 } = {}) {
  return bakeRGBA(size, (u, v, out) => {
    const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2;
    const d = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    const core = Math.pow(Math.max(0, 1 - d), 5.0);
    const halo = Math.pow(Math.max(0, 1 - d), 1.6) * 0.45;
    const star = spikes > 0
      ? Math.pow(Math.max(0, Math.abs(Math.cos(ang * spikes * 0.5))), 24) * Math.pow(Math.max(0, 1 - d), 1.1) * spikeLen
      : 0;
    const a = Math.min(1, core + halo + star);
    out[0] = out[1] = out[2] = 1;
    out[3] = a;
  });
}

/** Anisotropic streak used for engine trails and speed lines. */
export function bakeStreak({ size = 128 } = {}) {
  return bakeRGBA(size, (u, v, out) => {
    const dy = Math.abs(v - 0.5) * 2;
    const a = Math.pow(Math.max(0, 1 - dy), 2.2) * Math.pow(Math.max(0, 1 - Math.abs(u - 0.5) * 2), 0.6);
    out[0] = out[1] = out[2] = 1;
    out[3] = a;
  });
}

/** Starfield for space stages — magnitude-weighted, mild colour temperature. */
export function bakeStarfield({ seed = 'stars', size = 2048, count = 5200 } = {}) {
  const rng = new RNG(seed);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < count; i++) {
    const x = (rng.next() * size) | 0;
    const y = (rng.next() * size) | 0;
    const mag = Math.pow(rng.next(), 3.2);
    const b = 30 + mag * 225;
    // O..M spectral spread, mostly white
    const t = rng.next();
    const r = t < 0.12 ? 0.72 : t > 0.88 ? 1.0 : 0.94;
    const g = t < 0.12 ? 0.82 : t > 0.88 ? 0.86 : 0.95;
    const bl = t < 0.12 ? 1.0 : t > 0.88 ? 0.72 : 1.0;
    const spread = mag > 0.55 ? 1 : 0;
    for (let oy = -spread; oy <= spread; oy++) {
      for (let ox = -spread; ox <= spread; ox++) {
        const fall = ox === 0 && oy === 0 ? 1 : 0.28;
        const xi = (x + ox + size) % size, yi = (y + oy + size) % size;
        const idx = (yi * size + xi) * 4;
        data[idx] = Math.min(255, data[idx] + b * r * fall);
        data[idx + 1] = Math.min(255, data[idx + 1] + b * g * fall);
        data[idx + 2] = Math.min(255, data[idx + 2] + b * bl * fall);
        data[idx + 3] = 255;
      }
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Rock / terrain detail set. */
export function bakeRockMaterial({ seed = 'rock', size = 1024, tintA = [0.42, 0.36, 0.30], tintB = [0.62, 0.58, 0.52] } = {}) {
  const rng = new RNG(seed);
  const strata = fbm2D(rng, { octaves: 6, base: 6, gain: 0.55 });
  const crack = ridged2D(rng, { octaves: 5, base: 10, gain: 0.5 });
  const grit = fbm2D(rng, { octaves: 4, base: 48, gain: 0.6 });

  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      height[y * size + x] = strata(u, v) * 0.7 + Math.pow(crack(u, v), 3) * 0.5 + grit(u, v) * 0.12;
    }
  }
  const map = bakeRGBA(size, (u, v, out) => {
    const s = strata(u, v);
    const c = Math.pow(crack(u, v), 4);
    const g = grit(u, v);
    const k = s * 0.7 + g * 0.3;
    for (let i = 0; i < 3; i++) out[i] = (tintA[i] + (tintB[i] - tintA[i]) * k) * (1 - c * 0.45);
    out[3] = 1;
  }, { srgb: true });
  const normalMap = normalFromHeight(height, size, 2.4);
  const roughnessMap = bakeRGBA(size, (u, v, out) => {
    const g = grit(u, v), c = Math.pow(crack(u, v), 4);
    out[0] = out[1] = out[2] = Math.min(1, 0.72 + g * 0.2 + c * 0.1); out[3] = 1;
  });
  return { map, normalMap, roughnessMap };
}

function smooth01(x, a, b) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/* ── one-shot cache so bakers run once per boot ───────────────────────────── */
const _cache = new Map();
export function cached(key, fn) {
  let v = _cache.get(key);
  if (!v) { v = fn(); _cache.set(key, v); }
  return v;
}
