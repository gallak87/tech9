import { RNG } from '../core/rng.js';
import { fbm2D, ridged2D } from '../render/textures.js';

// ─────────────────────────────────────────────────────────────────────────────
// The shape of Corneria.
//
// Everything geometric about the level is defined here as a pure function of
// (x, z): the meander of the river, the cross-section of the canyon at each
// point along it, and the relief of the highland beyond the walls. The mesh
// builders, the city planner, the scatter and the water shader all read from
// this one source, so nothing can ever disagree about where the ground is.
//
// ── Sampling and Nyquist ─────────────────────────────────────────────────────
// The terrain mesh is a river-aligned grid: rows step along -Z at a fixed rate,
// columns step laterally at `spacing(d)`, which grows with distance from the
// centreline so that the corridor you actually fly through is dense and the
// far ridgelines are cheap. That makes the local sample rate an explicit,
// known function — so every noise band is faded out by `gainFor()` once its
// wavelength drops below ~4 samples. Detail never becomes fizz; it dissolves.
// ─────────────────────────────────────────────────────────────────────────────

export const WORLD = {
  length: 9000,
  waterLevel: 0,

  nearHalf: 1100,        // lateral extent of the high-detail tier
  farHalf: 5600,         // lateral extent of the ridgeline tier
  chunkLen: 240,
  resZ: 6,               // metres per row, near tier
  farChunkLen: 1200,
  farResZ: 30,

  zStart: 720,           // terrain is built from here…
  zEnd: -9840,           // …to here (both are multiples of chunkLen apart)
};

/** Lateral sample spacing at distance `d` from the river centreline. */
export function spacing(d) { return 6 * (1 + d / 280); }

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

/* ── centreline ───────────────────────────────────────────────────────────── */
// Unchanged from the original — the flight model is tuned around this meander.

export function centrelineX(z) {
  const t = -z;
  return Math.sin(t * 0.00055) * 210 + Math.sin(t * 0.00181 + 1.7) * 78 + Math.sin(t * 0.0041 + 0.4) * 22;
}
export function centrelineY(z) {
  const t = -z;
  return 44 + Math.sin(t * 0.00042 + 0.9) * 16 + Math.sin(t * 0.00133 + 2.3) * 7;
}
/** dX/dz of the centreline — the terrain grid shears along it. */
export function centrelineDX(z) {
  const t = -z;
  return -(Math.cos(t * 0.00055) * 210 * 0.00055
    + Math.cos(t * 0.00181 + 1.7) * 78 * 0.00181
    + Math.cos(t * 0.0041 + 0.4) * 22 * 0.0041);
}

/* ── noise bands ──────────────────────────────────────────────────────────── */
// Each band is listed with the domain scale it is sampled at and the shortest
// wavelength that survives, in metres. `gainFor` fades a band out where the
// local sample spacing can no longer carry it.

const R = new RNG('corneria:relief-2');
const nFar = ridged2D(R, { octaves: 3, base: 2, gain: 0.60 });   // λmin 2750 m
const nMacro = fbm2D(R, { octaves: 3, base: 2, gain: 0.62 });    // λmin 2000 m
const nRange = ridged2D(R, { octaves: 4, base: 3, gain: 0.55 }); // λmin  292 m
const nHill = fbm2D(R, { octaves: 4, base: 4, gain: 0.50 });     // λmin  140 m
const nFine = fbm2D(R, { octaves: 3, base: 6, gain: 0.50 });     // λmin   92 m
const nCrag = ridged2D(R, { octaves: 3, base: 5, gain: 0.55 });  // λmin   80 m
const nJitA = fbm2D(R, { octaves: 2, base: 4, gain: 0.50 });     // λmin  300 m
const nJitB = fbm2D(R, { octaves: 2, base: 8, gain: 0.50 });     // λmin   75 m
const nSide = fbm2D(R, { octaves: 2, base: 3, gain: 0.50 });     // λmin 1000 m
const nWarp = fbm2D(R, { octaves: 2, base: 3, gain: 0.50 });     // λmin 1000 m

const S_FAR = 1 / 22000, S_MACRO = 1 / 16000, S_RANGE = 1 / 6997;
const S_HILL = 1 / 4501, S_FINE = 1 / 2213, S_CRAG = 1 / 1601;
const L_FAR = 2750, L_MACRO = 2000, L_RANGE = 292, L_HILL = 140, L_FINE = 92, L_CRAG = 80;

/** 1 while a wavelength is comfortably above Nyquist for `sp`, 0 once it isn't. */
function gainFor(lambda, sp) { return smooth(0.55, 1.40, lambda / (4 * sp)); }

/* ── cross-section keyframes ──────────────────────────────────────────────── */
//
//  wallH ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╭──── plateau + relief
//                                    ╭──╯   a3 = cliff top
//  shelfH ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╭───────╯      a2 = cliff foot
//  beachH ┈┈┈┈┈┈┈┈┈╭─────────╯              a1 = shelf foot
//    0  ───────────╯                        a0 = waterline (= inner)
//              ╲__╱                         riverbed, `bed` deep
//
// `zone` names are only for the reader; interpolation is continuous.

const KEYS = [
  //  z        inner bed beachW beachH shelfW shelfH cliffW wallH relief  zone
  { z: 720, inner: 460, bed: 15, beachW: 100, beachH: 5, shelfW: 130, shelfH: 15, cliffW: 210, wallH: 55, relief: 0.9 },
  { z: -400, inner: 395, bed: 18, beachW: 90, beachH: 5, shelfW: 115, shelfH: 17, cliffW: 190, wallH: 95, relief: 1.0 },
  { z: -1250, inner: 300, bed: 22, beachW: 68, beachH: 6, shelfW: 92, shelfH: 22, cliffW: 150, wallH: 165, relief: 1.15 },
  { z: -1950, inner: 210, bed: 26, beachW: 52, beachH: 6, shelfW: 70, shelfH: 26, cliffW: 112, wallH: 255, relief: 1.30 },
  { z: -2650, inner: 152, bed: 30, beachW: 34, beachH: 7, shelfW: 48, shelfH: 30, cliffW: 78, wallH: 335, relief: 1.35 },
  { z: -3250, inner: 126, bed: 32, beachW: 24, beachH: 7, shelfW: 36, shelfH: 33, cliffW: 62, wallH: 395, relief: 1.40 },  // the narrows
  { z: -3850, inner: 178, bed: 28, beachW: 44, beachH: 6, shelfW: 62, shelfH: 27, cliffW: 98, wallH: 300, relief: 1.20 },
  { z: -4450, inner: 250, bed: 24, beachW: 58, beachH: 5, shelfW: 88, shelfH: 25, cliffW: 132, wallH: 215, relief: 1.00 },
  { z: -5250, inner: 268, bed: 22, beachW: 54, beachH: 5, shelfW: 98, shelfH: 27, cliffW: 142, wallH: 200, relief: 0.92 },
  { z: -6050, inner: 236, bed: 24, beachW: 48, beachH: 5, shelfW: 82, shelfH: 25, cliffW: 122, wallH: 235, relief: 1.02 },
  { z: -6550, inner: 168, bed: 28, beachW: 32, beachH: 6, shelfW: 50, shelfH: 31, cliffW: 82, wallH: 325, relief: 1.22 },  // dam gorge
  { z: -7150, inner: 152, bed: 30, beachW: 28, beachH: 6, shelfW: 46, shelfH: 31, cliffW: 74, wallH: 345, relief: 1.30 },
  { z: -7850, inner: 270, bed: 22, beachW: 70, beachH: 5, shelfW: 92, shelfH: 21, cliffW: 152, wallH: 195, relief: 1.00 },
  { z: -8550, inner: 440, bed: 14, beachW: 112, beachH: 4, shelfW: 132, shelfH: 14, cliffW: 224, wallH: 110, relief: 0.80 },
  { z: -9840, inner: 580, bed: 10, beachW: 145, beachH: 3, shelfW: 165, shelfH: 12, cliffW: 265, wallH: 75, relief: 0.70 },
];

const FIELDS = ['inner', 'bed', 'beachW', 'beachH', 'shelfW', 'shelfH', 'cliffW', 'wallH', 'relief'];

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
  return smooth(-4150, -4550, z) * (1 - smooth(-6100, -6400, z));
}

/* ── islands, sandbars and the delta ──────────────────────────────────────── */

const ISLANDS = (() => {
  const r = new RNG('corneria:islands');
  const out = [];
  // outer bay: rocky stacks and a breakwater shoal
  for (let i = 0; i < 9; i++) {
    const z = r.range(400, -1500);
    const u = r.sign() * r.range(170, 620);
    out.push({ z, u, r: r.range(60, 165), h: r.range(16, 62), pow: r.range(1.4, 2.6) });
  }
  // delta: long low sandbars splitting the channel
  for (let i = 0; i < 14; i++) {
    const z = r.range(-7700, -9700);
    const u = r.sign() * r.range(60, 520);
    out.push({ z, u, r: r.range(90, 250), h: r.range(4, 13), pow: r.range(2.2, 3.6), flat: 1 });
  }
  // a pair of stacks in the narrows you thread between
  out.push({ z: -3060, u: -46, r: 42, h: 190, pow: 1.15, spire: 1 });
  out.push({ z: -3390, u: 52, r: 38, h: 165, pow: 1.15, spire: 1 });
  return out.sort((a, b) => b.z - a.z);
})();

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
  return (nJitA(z * (1 / 2400) + p, z * (1 / 37000) + q) * 2 - 1) * 44
    + (nJitB(z * (1 / 1200) + q, z * (1 / 23000) + p) * 2 - 1) * 14;
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

  const wm = 0.72 + 0.56 * nSide(z * (1 / 6000) + (right ? 0.11 : 0.61), (right ? 0.21 : 0.79));
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
  const wx = (nWarp(u * (1 / 9000) + 0.4, z * (1 / 9000) + 0.2) - 0.5) * 260;
  const px = u + wx, pz = z + wx * 0.7;

  const plateau = smooth(a2, a3 + 70, d);
  if (plateau > 0.001) {
    const far = smooth(a3 + 400, a3 + 3200, d);
    const amp = P.relief * (0.42 + 2.4 * far);
    const rg = nRange(px * S_RANGE + 0.13, pz * S_RANGE * 0.72 + 0.51);
    let rel = (Math.pow(rg, 1.7) - 0.30) * 250 * gainFor(L_RANGE, sp);
    rel += (nHill(px * S_HILL + 0.7, pz * S_HILL * 0.8 + 0.2) - 0.5) * 96 * gainFor(L_HILL, sp);
    rel += (nMacro(px * S_MACRO + 0.25, pz * S_MACRO + 0.61) - 0.5) * 300;
    rel += (Math.pow(nFar(px * S_FAR + 0.8, pz * S_FAR + 0.35), 1.5) - 0.28) * 620 * smooth(1500, 3800, d);
    rel += (nFine(px * S_FINE, pz * S_FINE * 0.85) - 0.5) * 40 * gainFor(L_FINE, sp);
    h += plateau * amp * rel;
  }

  // crenellation on the cliff face itself — buttresses and gullies, not fizz
  const wallMask = smooth(a1 + P.shelfW * 0.35, a2 + P.cliffW * 0.5, d) * (1 - plateau * 0.45);
  if (wallMask > 0.001) {
    h += wallMask * (nCrag(px * S_CRAG + 0.09, pz * S_CRAG * 0.55 + 0.44) - 0.42) * 46 * gainFor(L_CRAG, sp);
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

/** Where the waterline sits on a given bank — used to place surf and scatter. */
export function shoreU(z, right) {
  const P = profileAt(z);
  const s = right ? 1 : -1;
  // invert the jitter approximately: the waterline is where h crosses 0
  let lo = 0, hi = P.inner + P.beachW + 60;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) * 0.5;
    if (heightAtU(s * mid, z, P) < 0) lo = mid; else hi = mid;
  }
  return s * (lo + hi) * 0.5;
}
