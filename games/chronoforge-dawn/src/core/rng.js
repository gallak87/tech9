// ─────────────────────────────────────────────────────────────────────────────
// Deterministic RNG. Every system in this game pulls from a NAMED stream, so a
// capture taken today is byte-identical to the same capture taken next month
// and a headless probe run can be replayed exactly.
//
//   import { rng } from '../core/rng.js';
//   const r = rng('world.terrain');
//   const h = r.range(-1, 1);
//
// `Math.random()` is a defect in this repo — it makes review impossible. There
// is a lint for it: `npm run lint:rng` greps src/ and fails on a hit.
//
// Stream names are dotted and namespaced by lane: `world.*`, `actors.*`,
// `battle.*`, `fx.*`. Two lanes must never share a stream name, because pulling
// from a shared stream couples their output — adding one particle in `fx` would
// then move a rock in `world`.
// ─────────────────────────────────────────────────────────────────────────────

/** Global seed. Change it and the whole world regenerates; probes pin it. */
export const WORLD_SEED = 'chronoforge-dawn';

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** sfc32 — small, fast, passes PractRand well past anything a game needs. */
export class RNG {
  constructor(seed = WORLD_SEED) {
    const s = typeof seed === 'string' ? xmur3(seed)() : seed >>> 0;
    this.seed = seed;
    this.reset(s);
  }

  reset(s = this._s0) {
    this._s0 = s;
    this.a = s || 0x9e3779b9;
    this.b = (s ^ 0x85ebca6b) >>> 0 || 1;
    this.c = (s ^ 0xc2b2ae35) >>> 0 || 2;
    this.d = 1;
    this._g = null;
    for (let i = 0; i < 12; i++) this.next();
    return this;
  }

  next() {
    const t = (this.a + this.b | 0) + this.d | 0;
    this.d = this.d + 1 | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = this.c + (this.c << 3) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = this.c + t | 0;
    return (t >>> 0) / 4294967296;
  }

  range(lo, hi) { return lo + (hi - lo) * this.next(); }
  int(lo, hi) { return Math.floor(this.range(lo, hi + 1)); }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.min(arr.length - 1, (this.next() * arr.length) | 0)]; }
  /** In-place Fisher-Yates. Deterministic given the stream position. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (this.next() * (i + 1)) | 0;
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  /** Box–Muller, cached. Used for scatter and damage variance. */
  gauss() {
    if (this._g != null) { const g = this._g; this._g = null; return g; }
    const u = Math.max(1e-9, this.next()), v = this.next();
    const r = Math.sqrt(-2 * Math.log(u)), th = 2 * Math.PI * v;
    this._g = r * Math.sin(th);
    return r * Math.cos(th);
  }
  /** Weighted pick from `[[value, weight], …]`. Drop tables use this. */
  weighted(pairs) {
    let total = 0;
    for (const [, w] of pairs) total += w;
    let x = this.next() * total;
    for (const [v, w] of pairs) { if ((x -= w) <= 0) return v; }
    return pairs[pairs.length - 1][0];
  }
}

const streams = new Map();

/**
 * Named deterministic stream. `rng('world.terrain')` returns the same sequence
 * on every load. Streams are lazily created and live for the page's lifetime.
 */
export function rng(name) {
  let r = streams.get(name);
  if (!r) { r = new RNG(WORLD_SEED + ':' + name); streams.set(name, r); }
  return r;
}

/** Rewind every stream. `__DAWN__.reseed()` calls this before a replay. */
export function resetStreams() {
  for (const r of streams.values()) r.reset();
}

/** Names of every stream pulled so far — `census.mjs` reads this. */
export function streamNames() { return [...streams.keys()].sort(); }

/**
 * A one-shot stream that is NOT registered globally — for a system that needs a
 * fresh sequence per call (a battle seeded by encounter id, say) without
 * disturbing the shared streams.
 */
export function makeRng(seed) { return new RNG(seed); }

/* ── value noise ─────────────────────────────────────────────────────────────
   Terrain, textures and scatter all need coherent noise, and they all need the
   SAME noise so a probe can reproduce it. Hash-based, so it needs no table and
   no stream state — the seed is baked into the hash.                          */

function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ (seed | 0);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);
const wrap = (v, p) => (p ? ((v % p) + p) % p : v);

/**
 * Value noise in [0,1].
 * `period` makes the lattice wrap, which is what a TILEABLE texture needs — a
 * baked map without it shows a seam at every repeat and there is no shader
 * trick that hides one.
 */
export function noise2D(x, y, seed = 0, period = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const x0 = wrap(xi, period), x1 = wrap(xi + 1, period);
  const y0 = wrap(yi, period), y1 = wrap(yi + 1, period);
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/**
 * Fractal Brownian motion in [0,1].
 *
 * NYQUIST: do not ask for octaves whose wavelength is finer than ~4× the
 * sampling rate of whatever consumes this. Detail below that is not detail, it
 * is aliasing noise, and it will read as dirt at every zoom level. If the mesh
 * has a 1 m vertex spacing, the finest useful octave has a ~4 m wavelength.
 */
export function fbm2D(x, y, { octaves = 4, lacunarity = 2.0, gain = 0.5, seed = 0, period = 0 } = {}) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2D(x * freq, y * freq, seed + i * 1013, period ? period * freq : 0);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged variant — the one that makes mountains rather than dunes. */
export function ridge2D(x, y, opts = {}) {
  const { octaves = 4, lacunarity = 2.0, gain = 0.5, seed = 0, period = 0 } = opts;
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise2D(x * freq, y * freq, seed + i * 7717, period ? period * freq : 0) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}
