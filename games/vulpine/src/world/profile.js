import { RNG } from '../core/rng.js';
import { fbm2D, ridged2D } from '../render/textures.js';
import { DEFAULTS, DNA_CORNERIA } from './dna.js';
import { expandZones, FIELDS } from './zones.js';

// ─────────────────────────────────────────────────────────────────────────────
// The shape of a world.
//
// Everything geometric about the level is a pure function of (x, z): the
// meander of the channel, the cross-section at each point along it, and the
// relief of the highland beyond the walls. The mesh builders, the city planner,
// the scatter and the water shader all read from this one source, so nothing
// can ever disagree about where the ground is.
//
// ── One world at a time ──────────────────────────────────────────────────────
// Which world is a module-level fact, set by `setActiveDNA(dna)`. The functions
// below stay pure functions of (x, z) with no dna argument because they sit on
// the hot path of the flight model, the AI and every mesh build — `setActiveDNA`
// unpacks the DNA into module-local scalars and typed arrays so a sample never
// walks an object graph.
//
// ── Sampling and Nyquist ─────────────────────────────────────────────────────
// The terrain mesh is a channel-aligned grid: rows step along -Z at a fixed
// rate, columns step laterally at `spacing(d)`, which grows with distance from
// the centreline so that the corridor you actually fly through is dense and the
// far ridgelines are cheap. That makes the local sample rate an explicit, known
// function — so every noise band is faded out by `gainFor()` once its
// wavelength drops below ~4 samples. Detail never becomes fizz; it dissolves.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mesh tiers and extents for the active world. Mutated in place, never
 * replaced: terrain.js, water.js and world-materials.js hold a reference.
 */
export const WORLD = {
  id: '',
  length: 0,
  waterLevel: 0,
  surface: 'water',
  /**
   * What kind of world this is.
   *   'terrain' a continuous heightfield corridor, meshed by terrain.js
   *   'field'   discrete bodies around the rail, no heightfield and no floor
   * The rail and `groundAt` are the only things outside src/world/ that any
   * backend has to provide.
   */
  backend: 'terrain',
  /** Field-backend shape, or null. See belt.js for the defaults it merges over. */
  belt: null,

  nearHalf: 0,           // lateral extent of the high-detail tier
  farHalf: 0,            // lateral extent of the ridgeline tier
  chunkLen: 0,
  resZ: 0,               // metres per row, near tier
  farChunkLen: 0,
  farResZ: 0,

  zStart: 0,             // terrain is built from here…
  zEnd: 0,               // …to here (both are multiples of chunkLen apart)
};

/** The live DNA. Read it for identity and skin; never sample geometry off it. */
export let DNA = null;

/** Vertex-tint ratios for terrain.js. Replaced wholesale by `setActiveDNA`. */
export let PALETTE = DEFAULTS.palette;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

/* ── unpacked DNA ─────────────────────────────────────────────────────────── */
// Everything a height sample touches lives here as a scalar or a typed array.

const MAXW = 6;                       // sine terms per centreline axis
const MAXB = 6;                       // dog-legs

let SP_A = 6, SP_G = 280;

let cxN = 0, cyN = 0, cbN = 0, cbyN = 0, cyBase = 0;
const cxA = new Float64Array(MAXW), cxW = new Float64Array(MAXW), cxP = new Float64Array(MAXW);
const cyA = new Float64Array(MAXW), cyW = new Float64Array(MAXW), cyP = new Float64Array(MAXW);
const cbLo = new Float64Array(MAXB), cbHi = new Float64Array(MAXB), cbD = new Float64Array(MAXB);
const cbyLo = new Float64Array(MAXB), cbyHi = new Float64Array(MAXB), cbyD = new Float64Array(MAXB);

let KEYS = [];
let CITY_IN0 = 0, CITY_IN1 = 0, CITY_OUT0 = 0, CITY_OUT1 = 0, CITY_ON = 0;

let nFar, nMacro, nRange, nHill, nFine, nCrag, nJitA, nJitB, nSide, nWarp;
let S_FAR, S_MACRO, S_RANGE, S_HILL, S_FINE, S_CRAG, S_WARP, S_SIDE;
let L_RANGE, L_HILL, L_FINE, L_CRAG;
let A_FAR, A_MACRO, A_RANGE, A_HILL, A_FINE, A_CRAG, A_WARP;
let P_FAR, B_FAR, P_RANGE, B_RANGE, B_CRAG;
let D_FAR0, D_FAR1, D_REL0, D_REL1, K_WARPZ;
let J_A, J_B, SIDE_BASE, SIDE_AMP;
let REL_BASE, REL_FAR;

let ISLANDS = [];

/** Lateral sample spacing at distance `d` from the channel centreline. */
export function spacing(d) { return SP_A * (1 + d / SP_G); }

/* ── centreline ───────────────────────────────────────────────────────────── */
// Both axes are a sum of sine terms plus any number of smoothstep dog-legs. A
// dog-leg is the only shape in the vocabulary with a bounded, analytic
// derivative that can turn the corridor faster than a sine of the same
// amplitude, and the grid shears along dX/dz — past ~0.8 the "perpendicular"
// wall is no longer close to perpendicular and the lateral sample rate stops
// matching `spacing()`.
//
// Y has no equivalent shear: nothing samples height off the rail, so a Y dog-leg
// only moves the rail, the cameras and the shots. Its two limits are instead:
//
//   floor  `centrelineY(z) - TUNE.boxYDown` must stay above the surface, or the
//          bottom of the offset box is unreachable and full down-stick sits
//          permanently in the ground cushion. Over water or ice that is y = 0,
//          so the rail must not go below ~46 m. Both shipped levels sit at
//          44/52, i.e. on top of this limit already.
//   pitch  `railTangent` is a ±6 m central difference the ship and camera orient
//          to, so dY/dz is nose attitude. A dog-leg peaks at 1.5·dx/width.
//          Measure it with framing.mjs; there is no code that clamps it.

/** 0 before the bend, 1 after it. */
function bendS(z, i, lo, hi) {
  const t = clamp((z - lo[i]) / (hi[i] - lo[i]), 0, 1);
  return t * t * (3 - 2 * t);
}
function bendDS(z, i, lo, hi) {
  const w = hi[i] - lo[i];
  const t = clamp((z - lo[i]) / w, 0, 1);
  return 6 * t * (1 - t) / w;
}

export function centrelineX(z) {
  const t = -z;
  let s = 0;
  for (let i = 0; i < cxN; i++) s += Math.sin(t * cxW[i] + cxP[i]) * cxA[i];
  for (let i = 0; i < cbN; i++) s += cbD[i] * bendS(z, i, cbLo, cbHi);
  return s;
}
export function centrelineY(z) {
  const t = -z;
  let s = cyBase;
  for (let i = 0; i < cyN; i++) s += Math.sin(t * cyW[i] + cyP[i]) * cyA[i];
  for (let i = 0; i < cbyN; i++) s += cbyD[i] * bendS(z, i, cbyLo, cbyHi);
  return s;
}
/** dX/dz of the centreline — the terrain grid shears along it. */
export function centrelineDX(z) {
  const t = -z;
  let s = 0;
  for (let i = 0; i < cxN; i++) s += Math.cos(t * cxW[i] + cxP[i]) * cxA[i] * cxW[i];
  let d = -s;
  for (let i = 0; i < cbN; i++) d += cbD[i] * bendDS(z, i, cbLo, cbHi);
  return d;
}

/* ── noise bands ──────────────────────────────────────────────────────────── */
// Each band carries the domain scale it is sampled at and the shortest
// wavelength that survives, in metres. `gainFor` fades a band out where the
// local sample spacing can no longer carry it.

/** 1 while a wavelength is comfortably above Nyquist for `sp`, 0 once it isn't. */
function gainFor(lambda, sp) { return smooth(0.55, 1.40, lambda / (4 * sp)); }

/* ── cross-section keyframes ──────────────────────────────────────────────── */

const _P = {};
/** Cross-section parameters at `z`, smoothstep-blended between keyframes. */
export function profileAt(z, out = _P) {
  let i = 0;
  while (i < KEYS.length - 2 && z < KEYS[i + 1].z) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = smooth(a.z, b.z, z);
  for (const f of FIELDS) out[f] = lerp(a[f], b[f], t);
  return out;
}

/** 0..1 how "urban" the bank is here — drives the city planner and terraces. */
export function cityWeight(z) {
  if (!CITY_ON) return 0;
  return smooth(CITY_IN0, CITY_IN1, z) * (1 - smooth(CITY_OUT0, CITY_OUT1, z));
}

/* ── islands, sandbars and the delta ──────────────────────────────────────── */

function islandAt(u, z) {
  let h = 0;
  for (const I of ISLANDS) {
    const dz = z - I.z;
    if (dz > I.r * 2.2 || dz < -I.r * 2.2) continue;
    const du = u - I.u;
    const q = Math.hypot(du, dz * (I.flat ? 0.35 : 0.9)) / I.r;
    if (q >= 1) continue;
    h += I.h * Math.pow(1 - q * q, I.pow);
  }
  return h;
}

/* ── height field ─────────────────────────────────────────────────────────── */

/** Lateral wander of the bank line, independent per side. */
function bankJitter(z, right) {
  const p = right ? 0.31 : 0.77, q = right ? 0.19 : 0.68;
  return (nJitA(z * (1 / 2400) + p, z * (1 / 37000) + q) * 2 - 1) * J_A
    + (nJitB(z * (1 / 1200) + q, z * (1 / 23000) + p) * 2 - 1) * J_B;
}

/**
 * Terrain height at lateral offset `u` from the centreline at `z`.
 * `P` is `profileAt(z)`; pass it in so a whole mesh row shares one lookup.
 *
 * The band limit widens past the near tier, because the far tier steps
 * `spacing(d) * 2.6` laterally and 30 m along z — sampling it at the near
 * tier's rate leaves every ridged band well past its own Nyquist limit and it
 * aliases into spikes instead of dissolving.
 *
 * That widening MUST be a smooth function of `d` and never a per-caller
 * constant. The two tiers share the boundary column at `nearHalf`, so if they
 * disagree about the band limit there they disagree about the height there,
 * and that opens a seam down the entire length of the level — which is
 * precisely what the lateral skirts were papering over.
 */
export function heightAtU(u, z, P) {
  const right = u >= 0;
  const d0 = Math.abs(u);
  const sp = spacing(d0) * (1 + 1.6 * smooth(WORLD.nearHalf * 0.8, WORLD.nearHalf * 1.9, d0));

  const wm = SIDE_BASE + SIDE_AMP * nSide(z * S_SIDE + (right ? 0.11 : 0.61), (right ? 0.21 : 0.79));
  const d = Math.max(0, d0 + bankJitter(z, right) * smooth(0, 90, d0));

  const a0 = P.inner;
  const a1 = a0 + P.beachW;
  const a2 = a1 + P.shelfW;
  const a3 = a2 + P.cliffW;
  const wallH = P.wallH * wm;

  let h;
  if (d < a0) {
    const q = 1 - d / a0;
    h = -P.bed * q * q * (3 - 2 * q);
  } else {
    h = P.beachH * smooth(a0, a1, d)
      + (P.shelfH - P.beachH) * smooth(a1, a2, d)
      + (wallH - P.shelfH) * smooth(a2, a3, d);
  }

  // domain warp — kills the tell-tale grid of a tileable lattice
  const wx = (nWarp(u * S_WARP + 0.4, z * S_WARP + 0.2) - 0.5) * A_WARP;
  const px = u + wx, pz = z + wx * K_WARPZ;

  const plateau = smooth(a2, a3 + 70, d);
  if (plateau > 0.001) {
    const far = smooth(a3 + D_REL0, a3 + D_REL1, d);
    const amp = P.relief * (REL_BASE + REL_FAR * far);
    const rg = nRange(px * S_RANGE + 0.13, pz * S_RANGE * 0.72 + 0.51);
    let rel = (Math.pow(rg, P_RANGE) - B_RANGE) * A_RANGE * gainFor(L_RANGE, sp);
    rel += (nHill(px * S_HILL + 0.7, pz * S_HILL * 0.8 + 0.2) - 0.5) * A_HILL * gainFor(L_HILL, sp);
    rel += (nMacro(px * S_MACRO + 0.25, pz * S_MACRO + 0.61) - 0.5) * A_MACRO;
    rel += (Math.pow(nFar(px * S_FAR + 0.8, pz * S_FAR + 0.35), P_FAR) - B_FAR) * A_FAR * smooth(D_FAR0, D_FAR1, d);
    rel += (nFine(px * S_FINE, pz * S_FINE * 0.85) - 0.5) * A_FINE * gainFor(L_FINE, sp);
    h += plateau * amp * rel;
  }

  // crenellation on the cliff face itself — buttresses and gullies, not fizz
  const wallMask = smooth(a1 + P.shelfW * 0.35, a2 + P.cliffW * 0.5, d) * (1 - plateau * 0.45);
  if (wallMask > 0.001) {
    h += wallMask * (nCrag(px * S_CRAG + 0.09, pz * S_CRAG * 0.55 + 0.44) - B_CRAG) * A_CRAG * gainFor(L_CRAG, sp);
  }

  h += islandAt(u, z);
  return h;
}

/** Terrain height in world space. */
export function terrainHeight(x, z) {
  const P = profileAt(z);
  return heightAtU(x - centrelineX(z), z, P);
}

/** Surface normal, from analytic differences in rail space. */
export function terrainNormal(x, z, e = 4, out = { x: 0, y: 1, z: 0 }) {
  const P = profileAt(z);
  const u = x - centrelineX(z);
  const hu = (heightAtU(u + e, z, P) - heightAtU(u - e, z, P)) / (2 * e);
  const hz = (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
  const cx = centrelineDX(z);
  let nx = -hu, ny = 1, nz = cx * hu - hz;
  const l = Math.hypot(nx, ny, nz);
  out.x = nx / l; out.y = ny / l; out.z = nz / l;
  return out;
}

/* ── activation ───────────────────────────────────────────────────────────── */

function fill(dst, src, key, n) {
  for (let i = 0; i < n; i++) dst[i] = src[i][key];
}

function buildIslands(spec) {
  if (!spec) return [];
  const r = new RNG(spec.seed);
  const out = [];
  // Draw order is part of the seed contract: change it and every island in
  // every world that shares this stream moves.
  for (const g of spec.groups || []) {
    for (let i = 0; i < g.n; i++) {
      const z = r.range(g.z[0], g.z[1]);
      const u = r.sign() * r.range(g.u[0], g.u[1]);
      const rad = r.range(g.r[0], g.r[1]);
      const h = r.range(g.h[0], g.h[1]);
      const pow = r.range(g.pow[0], g.pow[1]);
      out.push(g.flat ? { z, u, r: rad, h, pow, flat: g.flat } : { z, u, r: rad, h, pow });
    }
  }
  for (const f of spec.fixed || []) out.push({ ...f });
  return out.sort((a, b) => b.z - a.z);
}

/**
 * Make `dna` the world every function in this module describes.
 *
 * Synchronous and complete: `terrainHeight`, `centrelineX` and `profileAt`
 * answer for the new world the instant this returns, long before any mesh for
 * it exists. That is what lets the flight model keep asking for ground
 * clearance through a mid-flight world swap.
 */
export function setActiveDNA(dna) {
  // Before anything else reads it. `world-materials.js` generates its GLSL twin
  // of `centrelineX` from `DNA.centreline.x.bends`, so publishing the unexpanded
  // DNA would compile a shader that disagrees with this module about where the
  // channel is, and every shore lookup would land on the wrong column.
  dna = expandZones(dna);
  DNA = dna;
  const g = { ...DEFAULTS.grid, ...dna.grid };
  const c = dna.centreline;
  const b = {};
  for (const k of Object.keys(DEFAULTS.bands)) b[k] = { ...DEFAULTS.bands[k], ...(dna.bands || {})[k] };

  WORLD.id = dna.id;
  WORLD.length = dna.length ?? DEFAULTS.length;
  WORLD.waterLevel = dna.waterLevel ?? DEFAULTS.waterLevel;
  WORLD.surface = dna.surface ?? DEFAULTS.surface;
  WORLD.backend = dna.backend ?? DEFAULTS.backend;
  WORLD.belt = dna.belt ?? null;
  WORLD.zStart = dna.zStart ?? DEFAULTS.zStart;
  WORLD.zEnd = dna.zEnd ?? DEFAULTS.zEnd;
  WORLD.nearHalf = g.nearHalf;
  WORLD.farHalf = g.farHalf;
  WORLD.chunkLen = g.chunkLen;
  WORLD.resZ = g.resZ;
  WORLD.farChunkLen = g.farChunkLen;
  WORLD.farResZ = g.farResZ;
  SP_A = g.spacingBase;
  SP_G = g.spacingGrowth;

  const xs = c.x.waves, ys = c.y.waves;
  const bends = c.x.bends || [], yBends = c.y.bends || [];
  if (xs.length > MAXW || ys.length > MAXW || bends.length > MAXB || yBends.length > MAXB) {
    throw new Error(`dna ${dna.id}: centreline exceeds MAXW/MAXB`);
  }
  cxN = xs.length; cyN = ys.length; cbN = bends.length; cbyN = yBends.length;
  fill(cxA, xs, 'a', cxN); fill(cxW, xs, 'w', cxN); fill(cxP, xs, 'p', cxN);
  fill(cyA, ys, 'a', cyN); fill(cyW, ys, 'w', cyN); fill(cyP, ys, 'p', cyN);
  cyBase = c.y.base;
  for (let i = 0; i < cbN; i++) {
    cbLo[i] = bends[i].z + bends[i].width * 0.5;
    cbHi[i] = bends[i].z - bends[i].width * 0.5;
    cbD[i] = bends[i].dx;
  }
  for (let i = 0; i < cbyN; i++) {
    cbyLo[i] = yBends[i].z + yBends[i].width * 0.5;
    cbyHi[i] = yBends[i].z - yBends[i].width * 0.5;
    cbyD[i] = yBends[i].dx;
  }

  KEYS = dna.keys;

  const city = dna.city ?? DEFAULTS.city;
  CITY_ON = city ? 1 : 0;
  if (city) {
    CITY_IN0 = city.from; CITY_IN1 = city.from - city.fadeIn;
    CITY_OUT0 = city.to + city.fadeOut; CITY_OUT1 = city.to;
  }

  const R = new RNG(dna.seed);
  nFar = ridged2D(R, { octaves: 3, base: 2, gain: 0.60 });
  nMacro = fbm2D(R, { octaves: 3, base: 2, gain: 0.62 });
  nRange = ridged2D(R, { octaves: 4, base: 3, gain: 0.55 });
  nHill = fbm2D(R, { octaves: 4, base: 4, gain: 0.50 });
  nFine = fbm2D(R, { octaves: 3, base: 6, gain: 0.50 });
  nCrag = ridged2D(R, { octaves: 3, base: 5, gain: 0.55 });
  nJitA = fbm2D(R, { octaves: 2, base: 4, gain: 0.50 });
  nJitB = fbm2D(R, { octaves: 2, base: 8, gain: 0.50 });
  nSide = fbm2D(R, { octaves: 2, base: 3, gain: 0.50 });
  nWarp = fbm2D(R, { octaves: 2, base: 3, gain: 0.50 });

  S_FAR = b.far.scale; S_MACRO = b.macro.scale; S_RANGE = b.range.scale;
  S_HILL = b.hill.scale; S_FINE = b.fine.scale; S_CRAG = b.crag.scale;
  S_WARP = b.warp.scale; S_SIDE = b.side.scale;
  L_RANGE = b.range.lambda; L_HILL = b.hill.lambda;
  L_FINE = b.fine.lambda; L_CRAG = b.crag.lambda;
  A_FAR = b.far.amp; A_MACRO = b.macro.amp; A_RANGE = b.range.amp;
  A_HILL = b.hill.amp; A_FINE = b.fine.amp; A_CRAG = b.crag.amp; A_WARP = b.warp.amp;
  P_FAR = b.far.pow; B_FAR = b.far.bias; P_RANGE = b.range.pow; B_RANGE = b.range.bias;
  B_CRAG = b.crag.bias;
  D_FAR0 = b.far.from; D_FAR1 = b.far.to;
  D_REL0 = b.relief.from; D_REL1 = b.relief.to;
  K_WARPZ = b.warp.shear;
  J_A = b.jitter.a; J_B = b.jitter.b;
  SIDE_BASE = b.side.base; SIDE_AMP = b.side.amp;
  REL_BASE = b.relief.base; REL_FAR = b.relief.far;

  ISLANDS = buildIslands(dna.islands ?? DEFAULTS.islands);

  const pal = { ...DEFAULTS.palette, ...dna.palette };
  pal.amount = { ...DEFAULTS.palette.amount, ...(dna.palette || {}).amount };
  PALETTE = pal;

  return dna;
}

setActiveDNA(DNA_CORNERIA);
