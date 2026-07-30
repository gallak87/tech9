// Deterministic RNG — every visual/gameplay system pulls from a named stream so
// captures are byte-identical across runs. Never call Math.random() in this game.

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

export class RNG {
  constructor(seed = 'vulpine') {
    const s = typeof seed === 'string' ? xmur3(seed)() : seed >>> 0;
    this.a = s || 0x9e3779b9;
    this.b = (s ^ 0x85ebca6b) >>> 0 || 1;
    this.c = (s ^ 0xc2b2ae35) >>> 0 || 2;
    this.d = 1;
    for (let i = 0; i < 12; i++) this.next();
  }

  // sfc32
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
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  // Box-Muller, cached
  gauss() {
    if (this._g != null) { const g = this._g; this._g = null; return g; }
    const u = Math.max(1e-9, this.next()), v = this.next();
    const r = Math.sqrt(-2 * Math.log(u)), th = 2 * Math.PI * v;
    this._g = r * Math.sin(th);
    return r * Math.cos(th);
  }
  onSphere(out) {
    const z = this.range(-1, 1), t = this.range(0, Math.PI * 2);
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    out.set(r * Math.cos(t), r * Math.sin(t), z);
    return out;
  }
}

const streams = new Map();
/** Named deterministic stream. `rng('fx.explosion')` is stable across reloads. */
export function rng(name) {
  let r = streams.get(name);
  if (!r) { r = new RNG('vulpine:' + name); streams.set(name, r); }
  return r;
}
export function resetStreams() { streams.clear(); }
