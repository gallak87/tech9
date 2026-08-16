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

/**
 * Tileable value-noise lattice. Returns a sampler closure; coordinates are in
 * lattice cells and may sit anywhere on the real line — `profile.js` samples
 * these at world coordinates, so the wrap is load-bearing, not decorative.
 *
 * The wrap is written out rather than called because this sampler was, at 1573
 * ms, 28% of the game's entire boot: every texel of every baked texture and
 * every `groundAt` lookup lands here. Four `wrap()` calls per sample became two
 * inline reductions — the upper corner is the lower corner plus one, wrapping to
 * 0 exactly at the edge — and the doubled modulo of `((v % n) + n) % n` became a
 * conditional add, which is the same value for every integer. Output is
 * bit-identical by construction, and `tools/digest.mjs --against` is the proof.
 *
 * Power-of-two lattices take `& mask` instead, identical to the modulo for any
 * integer inside ±2³¹. Sizes here top out in the hundreds and sample
 * coordinates are O(1)–O(100) cells, so `x0` stays orders of magnitude inside
 * that; a caller sampling at 10⁹ cells would be the thing that broke it.
 */
export function latticeNoise(size, rng) {
  const g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  const mask = size - 1;
  const pot = (size & mask) === 0;
  return (x, y) => {
    const fx = x * size, fy = y * size;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const sx = fx - x0, sy = fy - y0;
    const tx = sx * sx * sx * (sx * (sx * 6 - 15) + 10);
    const ty = sy * sy * sy * (sy * (sy * 6 - 15) + 10);
    let x0w, y0w;
    if (pot) {
      x0w = x0 & mask; y0w = y0 & mask;
    } else {
      x0w = x0 % size; if (x0w < 0) x0w += size;
      y0w = y0 % size; if (y0w < 0) y0w += size;
    }
    const x1w = x0w + 1 === size ? 0 : x0w + 1;
    const r0 = (y0w * size), r1 = (y0w + 1 === size ? 0 : y0w + 1) * size;
    const a = g[r0 + x0w], b = g[r0 + x1w];
    const c = g[r1 + x0w], d = g[r1 + x1w];
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

/**
 * Cloud density sheet — the substrate for the sky's layered cloud decks.
 *
 * Packed so one fetch feeds every layer:
 *   R  low-frequency coverage (domain-warped, gives the deck its shape)
 *   G  billow / cauliflower lumps from inverted Worley (cumulus silhouette)
 *   B  fine erosion detail (wispy edges)
 *   A  wind-smeared streaks (cirrus)
 *
 * Nyquist: the top octave of every field is kept under ~80 cells across the
 * sheet, i.e. ≥6 texels per cell at 512. Anything finer aliases into fizz the
 * moment the sky is minified toward the horizon.
 */
export function bakeCloudSheet({ seed = 'cloud', size = 512 } = {}) {
  const rng = new RNG(seed);
  const warpF = fbm2D(rng, { octaves: 3, base: 3, gain: 0.5 });    // 12 cells
  const covF = fbm2D(rng, { octaves: 4, base: 3, gain: 0.58 });    // 24 cells
  const billA = worley2D(rng, 5);
  const billB = worley2D(rng, 11);
  const detF = fbm2D(rng, { octaves: 4, base: 9, gain: 0.58 });    // 72 cells
  const cirF = fbm2D(rng, { octaves: 4, base: 6, gain: 0.55 });    // 48 cells

  const n = size * size;
  const cov = new Float32Array(n);
  const bill = new Float32Array(n);
  const det = new Float32Array(n);
  const cir = new Float32Array(n);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const i = y * size + x;
      const wx = (warpF(u, v) - 0.5) * 0.11;
      const wy = (warpF(v, u) - 0.5) * 0.11;
      cov[i] = covF(u + wx, v + wy);
      bill[i] = 1 - Math.min(1, billA(u, v) * 0.66 + billB(u + 0.31, v + 0.17) * 0.44);
      det[i] = detF(u, v);
      cir[i] = cirF(u, v);
    }
  }

  // Cirrus is the same field smeared along the wind axis, then ridged — that
  // is what turns fbm blobs into the thin fibrous streaks of real cirrus.
  const K = 14;
  const smear = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    const row = y * size;
    for (let x = 0; x < size; x++) {
      let s = 0;
      for (let k = -K; k <= K; k++) s += cir[row + ((x + k) % size + size) % size];
      smear[row + x] = s / (2 * K + 1);
    }
  }
  let lo = 1, hi = 0;
  for (let i = 0; i < n; i++) { if (smear[i] < lo) lo = smear[i]; if (smear[i] > hi) hi = smear[i]; }
  const span = Math.max(1e-4, hi - lo);

  return bakeRGBA(size, (u, v, out, x, y) => {
    const i = y * size + x;
    const s = (smear[i] - lo) / span;
    const streak = 1 - Math.abs(s * 2 - 1);                 // ridged → fibres
    out[0] = cov[i];
    out[1] = bill[i];
    out[2] = det[i];
    out[3] = Math.min(1, streak * (0.55 + det[i] * 0.65));
  });
}

/**
 * Lens dirt — the smeared grease and dust on a real front element. Multiplied
 * against the bloom pyramid so it only shows when something is actually bright,
 * which is the only way it reads as a lens and not as a texture overlay.
 */
export function bakeLensDirt({ seed = 'dirt', size = 256 } = {}) {
  const rng = new RNG(seed);
  const grime = fbm2D(rng, { octaves: 4, base: 4, gain: 0.55 });
  const blobs = [];
  for (let i = 0; i < 46; i++) {
    blobs.push({
      x: rng.next(), y: rng.next(),
      r: rng.range(0.006, 0.055),
      a: rng.range(0.15, 1.0),
      sx: rng.range(0.6, 3.2),
    });
  }
  const scr = [];
  for (let i = 0; i < 18; i++) {
    scr.push({ x: rng.next(), y: rng.next(), ang: rng.range(0, Math.PI), len: rng.range(0.04, 0.30), a: rng.range(0.1, 0.5) });
  }
  return bakeRGBA(size, (u, v, out) => {
    let a = grime(u, v) * 0.20;
    for (const b of blobs) {
      let dx = u - b.x, dy = v - b.y;
      if (dx > 0.5) dx -= 1; if (dx < -0.5) dx += 1;
      if (dy > 0.5) dy -= 1; if (dy < -0.5) dy += 1;
      const d = Math.hypot(dx / b.sx, dy) / b.r;
      if (d < 1) a += b.a * Math.pow(1 - d, 2.2);
    }
    for (const s of scr) {
      let dx = u - s.x, dy = v - s.y;
      if (dx > 0.5) dx -= 1; if (dx < -0.5) dx += 1;
      if (dy > 0.5) dy -= 1; if (dy < -0.5) dy += 1;
      const along = dx * Math.cos(s.ang) + dy * Math.sin(s.ang);
      const across = -dx * Math.sin(s.ang) + dy * Math.cos(s.ang);
      if (Math.abs(along) < s.len && Math.abs(across) < 0.004) {
        a += s.a * (1 - Math.abs(along) / s.len);
      }
    }
    a = Math.min(1, a * 0.55);
    out[0] = a * 1.0; out[1] = a * 0.96; out[2] = a * 0.88; out[3] = 1;
  }, { repeat: 1 });
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
