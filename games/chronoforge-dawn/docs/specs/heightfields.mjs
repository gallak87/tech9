// docs/specs/heightfields.mjs
// Phase 1.2 (level) — per-biome heightfield parameters for all eight biomes.
//
// These are the numbers `world` feeds to fbm2D/ridge2D in src/core/rng.js when
// it builds terrain in Phase 4. This module is not a description of them: it
// evaluates the real field with the real noise kit and asserts the result.
//
// ── what the camera can actually see ──────────────────────────────────────
// TILE_M 2.0, maps 45x30 tiles -> 90 x 60 m outdoors. FRAME_HEIGHT_M 18 at a
// locked 55 deg pitch shows ~32 m across by ~22 m deep, so an outdoor map is
// about 3x3 screens. Two consequences drive every number below:
//
//   * The dominant landform must have a 25-60 m wavelength. Longer than ~90 m
//     and it is a tilt you never notice; shorter than ~25 m and it is bumps.
//   * Amplitude is read through SHADOW, not silhouette. At DAWN_HOUR the sun
//     sits 11.6 deg up, so 1 m of rise throws 4.9 m of shadow. A 3 m ridge
//     lays a 15 m shadow — half a screen. That is why total relief here lands
//     at 3.6-11 m and not at the 20-30 m the Phase 0 placeholder used: 11 m
//     of relief already casts 53 m of dawn shadow, which is the whole frame.
//
// ── traversability ────────────────────────────────────────────────────────
// Every tile of every map is walkable (the donor marks all tiles passable and
// nothing here changes that), so the field itself must never exceed
// MAX_WALKABLE_SLOPE_DEG anywhere — including at map edges. Cliffs, ice walls
// and ruin masonry are PROP GEOMETRY placed on top of the field by `world`;
// they are not the field. The map boundary already contains the party.
//
// ── Nyquist (CONTRACT.md SS4.5) ───────────────────────────────────────────
// The mesh samples at VERTEX_SPACING_M, so no octave may have a wavelength
// finer than 4x that. Every term below is checked against it, and the check
// fails rather than warns.
//
//   node docs/specs/heightfields.mjs

import { fbm2D, noise2D } from '../../src/core/rng.js';
import { TILE_M } from '../../src/core/const.js';
import { MAPS, OUTDOOR_IDS, INTERIOR_IDS, OUTDOOR_W_M, OUTDOOR_D_M, tileToM } from './world-graph.mjs';

/** Terrain mesh resolution. 0.5 m gives 181x121 = 21,901 verts / 43,200 tris
 *  per outdoor map in ONE draw call — 1.7% of the 2.6 M triangle budget. */
export const VERTEX_SPACING_M = 0.5;
export const NYQUIST_MIN_WAVELENGTH_M = 4 * VERTEX_SPACING_M;   // 2.0 m

/** Hard ceiling for the field, every biome, every tile. Phase 5 traversal
 *  reads this as its maxClimb. Anything steeper is a prop, not terrain. */
export const MAX_WALKABLE_SLOPE_DEG = 34;

/** SURFACE CONTINUITY.
 *
 *  Max slope is a FIRST-derivative test and it structurally cannot see a
 *  crease: a field can be everywhere under 20 deg and still change slope by
 *  several degrees across a single vertex line, which reads as a lit seam
 *  under a raking dawn key. That needs a second-derivative gate.
 *
 *  The gate is DIVERGENCE UNDER REFINEMENT, not magnitude.
 *
 *  Probe |d2h| / e2 at the mesh spacing and again at half of it:
 *    - a C1 break of slope magnitude D contributes D/e, so the reading
 *      DOUBLES every time the probe spacing halves;
 *    - anything C1-continuous contributes h'' and the reading is bounded.
 *  So the ratio between the two scales is ~2.0 at a crease and ~1.0
 *  everywhere else, whatever the biome's relief or its median curvature.
 *
 *  Magnitude was tried first and rejected — worst |d2h| against the biome's
 *  own median. It works (it caught all eight biomes on the first run) but it
 *  measures the wrong thing once the carves are C1: `noise2D` in
 *  src/core/rng.js interpolates value noise with smoothstep, which is C1 but
 *  NOT C2, so its second derivative is discontinuous at every lattice line.
 *  Measured directly: |d2h|/e2 at a lattice line reads 2.9437 / 2.9636 /
 *  2.9736 / 2.9786 as e halves from 0.02 to 0.0025 — large, bounded, and 0.0
 *  between lattice lines. A magnitude gate therefore scores the noise kit, not
 *  the carves, and shared core is not mine to change. It is also invisible:
 *  a C2 break leaves the surface NORMAL continuous, so nothing shades wrong.
 *
 *  The alternative the coordinator offered — "the worst curvature must not
 *  land within epsilon of a carve parameter coordinate" — was rejected for
 *  three reasons: it only catches a kink that happens to be the WORST one on
 *  the map (this pass found creases in `channel`, `plateau` and `basins`
 *  influence masks that are real and are not the worst); it needs a second
 *  table of parameter coordinates kept in sync with the carve code by hand,
 *  so a carve kind added later registers nothing and passes silently; and it
 *  cannot see a crease that is not at a parameter coordinate at all, such as
 *  the max-selection seam where two craters overlap. It survives as a
 *  DIAGNOSTIC PRINT: when the gate trips, the report names the nearest carve
 *  boundary so the failure points at the parameter that caused it. */
export const CREASE_PROBE_SPACING_M = 0.5;      // the mesh spacing that ships
export const CREASE_DIVERGENCE_MAX = 1.45;      // 1.0 = smooth, 2.0 = C1 break

/** A building foundation must read level. Haventide's 17 plots are checked
 *  against this and against PLOT_FOOTPRINT_M of local height spread. */
export const PLOT_MAX_SLOPE_DEG = 12;
export const PLOT_FOOTPRINT_M = 6;
export const PLOT_MAX_SPREAD_M = 1.2;

/** A doorway must not sit on a wall. */
export const DOOR_MAX_SLOPE_DEG = 20;

// ── biome parameter sets ───────────────────────────────────────────────────
// amplitudeM      peak-to-peak the composed field is authored to deliver
// baseWavelengthM wavelength of octave 0 of the rolling fbm term
// ridge           the term that makes spines instead of dunes; weight blends
//                 it against the roll, exponent sharpens it
// warp            domain warp, in metres — kills the axis-aligned lattice look
// detail          the fine grit octave; small amplitude, coarse enough to
//                 survive the pixel-snap pass without aliasing
// carve           the one authored landform that gives the biome its identity
// albedo          linear-ish sRGB hex handed to `render`; mid is the base
//                 ground tone and is what the dawn exposure ramp sees
// amplitudeM      peak-to-peak of the NOISE stack alone
// targetReliefM   peak-to-peak the whole map should deliver (noise + carve).
//                 The two are separate knobs on purpose: max slope scales as
//                 ~K x amplitudeM / baseWavelengthM, so relief bought from
//                 noise is paid for in gradient, while relief bought from a
//                 CARVE has a gradient you set directly (depth / wall width).
//                 That is why every dramatic biome here is a gentle noise
//                 field with an authored landform cut into it, and not a
//                 tall noise field: 11 m of relief from noise on a 90 m map
//                 is a 45 deg wall, and the party cannot walk on it.
// baseWavelengthM wavelength of octave 0 of the rolling fbm term
// ridge           the term that makes spines instead of dunes. Expensive in
//                 gradient: ridge2D folds and squares, so it runs about 3x
//                 the slope of plain fbm at equal amplitude before `exponent`
//                 multiplies it again. Kept to 2 octaves and exponent <= 1.5.
// warp            domain warp, in metres — kills the axis-aligned lattice
//                 look. Its Jacobian multiplies every gradient below it, so
//                 amountM stays under ~0.07 x wavelengthM.
// detail          the fine grit octave; small amplitude, coarse enough to
//                 survive the pixel-snap pass without aliasing
// carve           the one authored landform that gives the biome its identity
// albedo          sRGB hex handed to `render`; mid is the base ground tone and
//                 is what the fixed dawn exposure ramp sees
export const BIOMES = {

  grassland_ruins: {
    id: 'grassland_ruins', label: 'Grassland Ruins', regions: ['haventide_region'],
    amplitudeM: 2.8, targetReliefM: 5.0, baseWavelengthM: 52, octaves: 3, lacunarity: 2.0, gain: 0.42, seed: 1101,
    ridge: null,
    warp: { amountM: 2.5, wavelengthM: 50, seed: 1102 },
    detail: { amplitudeM: 0.18, wavelengthM: 10.0, octaves: 2, lacunarity: 2.0, gain: 0.5, seed: 1103 },
    // The coast. Donor art puts the sea west of Haventide; the ground has to
    // fall toward it or the beach is a texture, not a place. Linear and long
    // so the build plots in the western half stay level.
    carve: { kind: 'shore', axis: 'x', startM: 32, dropM: 2.6, damp: 0.5 },
    maxSlopeDeg: 20,
    albedo: { low: '#6d7a4a', mid: '#8b9457', high: '#b6ac86', cliff: '#8a8172' },
    note: 'Home region and the settlement site. The calmest field in the game on purpose — 17 build plots need level ground and this is the tutorial vista.',
  },

  neon_wastes: {
    id: 'neon_wastes', label: 'Neon Wastes', regions: ['emberline_region'],
    amplitudeM: 4.8, targetReliefM: 6.5, baseWavelengthM: 40, octaves: 3, lacunarity: 2.0, gain: 0.42, seed: 2201,
    ridge: { weight: 0.25, wavelengthM: 58, octaves: 2, lacunarity: 2.0, gain: 0.48, exponent: 1.4, seed: 2202 },
    warp: { amountM: 3.0, wavelengthM: 56, seed: 2203 },
    detail: { amplitudeM: 0.25, wavelengthM: 11.0, octaves: 2, lacunarity: 2.0, gain: 0.5, seed: 2204 },
    // A braided dry wash running N->S. Somewhere the ground goes DOWN, or the
    // long dawn shadows never cross anything.
    carve: { kind: 'channel', depthM: 4.0, widthM: 38, sinuosityM: 7, wavelengthM: 115, axis: 'z', damp: 0.6 },
    maxSlopeDeg: 26,
    albedo: { low: '#8c6f4c', mid: '#ab8659', high: '#c9b18a', cliff: '#8f7d68' },
    note: 'Second full-fidelity region for Tier 1. Long escarpment plus a dry wash so the neon city reads against a lit slope rather than a flat pan.',
  },

  forest_veil: {
    id: 'forest_veil', label: 'Forest Veil', regions: ['forest_veil_region'],
    amplitudeM: 4.2, targetReliefM: 5.0, baseWavelengthM: 36, octaves: 3, lacunarity: 2.0, gain: 0.42, seed: 3301,
    ridge: { weight: 0.15, wavelengthM: 64, octaves: 2, lacunarity: 2.0, gain: 0.48, exponent: 1.4, seed: 3302 },
    warp: { amountM: 2.5, wavelengthM: 48, seed: 3303 },
    detail: { amplitudeM: 0.28, wavelengthM: 9.0, octaves: 2, lacunarity: 2.0, gain: 0.5, seed: 3304 },
    carve: { kind: 'channel', depthM: 2.0, widthM: 24, sinuosityM: 5, wavelengthM: 95, axis: 'z', damp: 0.55 },
    maxSlopeDeg: 24,
    albedo: { low: '#4f6440', mid: '#66794c', high: '#8e9268', cliff: '#7a7460' },
    note: 'Canopy does the vertical work. Ground stays low-relief and hummocky so trees, not terrain, occlude sightlines.',
  },

  mire_bog: {
    id: 'mire_bog', label: 'Mire Bog', regions: ['mire_bog_region'],
    amplitudeM: 2.7, targetReliefM: 3.2, baseWavelengthM: 40, octaves: 3, lacunarity: 2.0, gain: 0.42, seed: 4401,
    ridge: null,
    warp: { amountM: 2.5, wavelengthM: 38, seed: 4402 },
    detail: { amplitudeM: 0.16, wavelengthM: 8.0, octaves: 2, lacunarity: 2.0, gain: 0.5, seed: 4403 },
    // Six shallow basins. The look is standing water, so the field has to sit
    // BELOW the water plane over a real fraction of the map, not just dip.
    carve: { kind: 'basins', radiusM: 14, depthM: 2.6, damp: 0.6, sites: [
      { fx: 0.18, fz: 0.22 }, { fx: 0.42, fz: 0.55 }, { fx: 0.70, fz: 0.30 },
      { fx: 0.30, fz: 0.78 }, { fx: 0.82, fz: 0.68 }, { fx: 0.55, fz: 0.12 },
    ] },
    waterPlaneM: -0.28,
    submergedFraction: [0.16, 0.36],
    maxSlopeDeg: 18,
    albedo: { low: '#4a5138', mid: '#5f6444', high: '#7c7a5c', cliff: '#6b6552' },
    note: 'Flattest biome. You wade here, you do not climb. Water plane sits 0.28 m below the field median.',
  },

  frozen_ruins: {
    id: 'frozen_ruins', label: 'Frozen Ruins', regions: ['orbital_reach_region'],
    amplitudeM: 4.8, targetReliefM: 7.0, baseWavelengthM: 42, octaves: 3, lacunarity: 2.0, gain: 0.42, seed: 5501,
    ridge: { weight: 0.30, wavelengthM: 72, octaves: 2, lacunarity: 2.0, gain: 0.48, exponent: 1.5, seed: 5502 },
    warp: { amountM: 3.0, wavelengthM: 54, seed: 5503 },
    detail: { amplitudeM: 0.22, wavelengthM: 10.0, octaves: 2, lacunarity: 2.0, gain: 0.5, seed: 5504 },
    // A mesa under the elevator base, centred on the city tile (20,18).
    carve: { kind: 'plateau', cxM: tileToM(20), czM: tileToM(18), radiusM: 18, riseM: 3.8, falloffM: 20, damp: 0.8 },
    maxSlopeDeg: 28,
    albedo: { low: '#8e9aa2', mid: '#aab4bb', high: '#c6ccd0', cliff: '#7f868c' },
    note: 'Elevator base sits on a mesa so the cyan mast has something to rise from. Snow albedo deliberately dirtied — see LVL-1 in STATUS.json.',
  },

  frost_canyon: {
    id: 'frost_canyon', label: 'Frost Canyon', regions: ['frost_canyon_region'],
    amplitudeM: 4.6, targetReliefM: 11.0, baseWavelengthM: 60, octaves: 3, lacunarity: 2.0, gain: 0.42, seed: 6601,
    ridge: { weight: 0.38, wavelengthM: 70, octaves: 2, lacunarity: 2.0, gain: 0.48, exponent: 1.5, seed: 6602 },
    warp: { amountM: 3.0, wavelengthM: 56, seed: 6603 },
    detail: { amplitudeM: 0.20, wavelengthM: 9.0, octaves: 2, lacunarity: 2.0, gain: 0.5, seed: 6604 },
    // THE canyon, and the clearest example of why relief comes from the carve
    // and not from noise: 7.5 m of drop over a 17 m wall is 27 deg, walkable.
    // The same 7.5 m asked of the noise stack would be a 45 deg wall.
    // 47 m rim to rim in a 90 m map, so from one rim you see the far wall and
    // the floor at once, and from the floor you see sky and wall.
    carve: { kind: 'trench', depthM: 7.5, floorWidthM: 13, rimWidthM: 47, sinuosityM: 8, wavelengthM: 120, axis: 'z', damp: 0.90 },
    minTrenchReliefM: 6.5,
    maxSlopeDeg: 33,
    albedo: { low: '#7d8a94', mid: '#9fabb4', high: '#bfc7cc', cliff: '#6e767d' },
    note: 'Steepest biome. Still under the 34 deg walkable ceiling everywhere; the vertical drama is the carve plus prop ice-cliffs on the rim.',
  },

  alien_terraform: {
    id: 'alien_terraform', label: 'Alien Terraform', regions: ['last_crown_region'],
    amplitudeM: 8.5, targetReliefM: 6.5, baseWavelengthM: 38, octaves: 3, lacunarity: 2.0, gain: 0.42, seed: 7701,
    ridge: { weight: 0.24, wavelengthM: 44, octaves: 2, lacunarity: 2.0, gain: 0.48, exponent: 1.3, seed: 7702 },
    // Heavy warp is what stops this reading as erosion. Nothing eroded this.
    warp: { amountM: 4.0, wavelengthM: 56, seed: 7703 },
    detail: { amplitudeM: 0.18, wavelengthM: 11.0, octaves: 2, lacunarity: 2.0, gain: 0.5, seed: 7704 },
    // Grown platforms. Partial terracing only — a full quantise both bands the
    // surface and multiplies every local gradient by ~1.5/blendFrac.
    carve: { kind: 'terrace', stepM: 1.4, blendFrac: 0.90, mix: 0.45 },
    maxSlopeDeg: 30,
    albedo: { low: '#5d4a6b', mid: '#7a6188', high: '#a288ac', cliff: '#6a5f78' },
    note: 'The only biome whose landform is not erosional. Terracing is a look decision and the one thing here worth a human eyeball at Phase 10.',
  },

  crater_ember: {
    id: 'crater_ember', label: 'Crater Ember', regions: ['crater_ember_region'],
    amplitudeM: 5.0, targetReliefM: 9.5, baseWavelengthM: 52, octaves: 3, lacunarity: 2.0, gain: 0.42, seed: 8801,
    ridge: { weight: 0.26, wavelengthM: 60, octaves: 2, lacunarity: 2.0, gain: 0.48, exponent: 1.4, seed: 8802 },
    warp: { amountM: 3.5, wavelengthM: 50, seed: 8803 },
    detail: { amplitudeM: 0.26, wavelengthM: 9.0, octaves: 2, lacunarity: 2.0, gain: 0.5, seed: 8804 },
    // Four craters: sunken floor, raised lip. Craters never SUM — the strongest
    // influence at a point wins, or two overlapping rims stack into a wall.
    // Placement is AUTHORED, not derived. It used to come from noise2D(i*7.3,...)
    // and all four centres landed inside a 10 m cluster at the map middle — four
    // craters on paper, one blob on the ground.
    carve: { kind: 'craters', floorDropM: 5.8, rimRiseM: 1.4, wallM: 22, damp: 0.75, sites: [
      { fx: 0.28, fz: 0.30, r: 13 }, { fx: 0.72, fz: 0.58, r: 9 }, { fx: 0.46, fz: 0.80, r: 6.5 },
    ] },
    // The glowing cracks. 3.5 m wide = 7 vertices across at 0.5 m spacing and
    // 11% of a 32 m screen, so they resolve both on the mesh and on screen.
    lavaChannel: { depthM: 1.2, widthM: 3.5, emissive: '#ff6a1e' },
    maxSlopeDeg: 32,
    albedo: { low: '#4a4340', mid: '#655d59', high: '#8a8078', cliff: '#514a47' },
    note: 'Basalt is genuinely 6-8% reflectance and that is the Phase 0 trap (a dark ground blows the sky trying to expose it). Mid is ash-grey, not basalt-black; the lava emissive supplies the contrast.',
  },
};

/** Interiors are floors, not terrain. Micro-relief only, so contact shadows
 *  do not land on a mathematically perfect plane. No biome field applies. */
export const INTERIOR_FIELD = {
  amplitudeM: 0.30, wavelengthM: 7.0, octaves: 2, lacunarity: 2.0, gain: 0.5, seed: 9001,
  maxSlopeDeg: 6,
};

// ── the reference field ────────────────────────────────────────────────────
// This is the composition `world` implements in Phase 4. It is here so the
// parameters above are proved against real evaluation, not asserted in prose.

/** A signed fbm over a 2-3 lattice-cell window spans roughly +/-0.62, not
 *  +/-1. Without this correction every biome under-delivers its authored
 *  relief by ~40% and `amplitudeM` stops meaning what it says. Measured, not
 *  guessed: it is the value that makes measured relief track amplitudeM
 *  across all eight biomes in selfCheck(). */
const BASE_FIT = 1.60;

const clamp01 = (t) => t < 0 ? 0 : t > 1 ? 1 : t;
const smooth01 = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

/** Polynomial smooth-min / smooth-max (Inigo Quilez). Where two instances of
 *  the same carve compete, a hard Math.min/max leaves a seam along the arc
 *  where the winner changes: both branches are smooth, but their gradients
 *  differ there, so the join is C0. These blend over `k`, and the two kinks
 *  cancel exactly — that cancellation is the whole point of the construction. */
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);

/** How far an influence mask takes to fall from 1 to 0, in metres.
 *
 *  This is a slope budget, not a cosmetic choice. `infl` multiplies the noise
 *  stack through `damp`, so d(infl)/dx acts on the FULL noise amplitude:
 *  h = base * S * (1 - damp*infl) + delta, and the mask contributes
 *  base * S * damp * d(infl)/dx to the gradient. With base*S at +/-4 m, a mask
 *  that falls over 4 m contributes up to 1.12 to the gradient on its own —
 *  more than any wall in the spec. Measured: crater_ember peaked at 32.7 deg
 *  at a point 2.3 m OUTSIDE the nearest crater's footprint, and deleting the
 *  carve dropped the gradient there from 0.570 to 0.046. Taper wide. */
export const INFL_TAPER_M = 12;

/** Blend widths for the above: metres for a height, [0,1] for an influence. */
export const CARVE_BLEND_M = 0.8;
export const INFL_BLEND = 0.30;

/** Fraction of a ramp's run spent easing each shoulder. */
export const RAMP_SHOULDER = 0.20;

/** [0,1] -> [0,1], linear across the middle, C1 (in fact C2) at both ends.
 *
 *  This is the shape a carve wall wants and neither of the two obvious choices
 *  is. A linear ramp holds the mean gradient but leaves a corner at each end —
 *  that corner is the shore crease. A smoothstep has no corner but peaks at
 *  1.5x the mean gradient, which is what tipped the western build plots over
 *  the slope gate on the first pass.
 *
 *  Built by integrating a trapezoidal DERIVATIVE: smooth01 up over the first
 *  `k`, flat across the middle, smooth01 down over the last `k`. Area 1 forces
 *  the middle slope to 1/(1-k), so the peak-gradient penalty is 1.25 at k=0.20
 *  instead of smoothstep's 1.5, and the derivative is zero at both ends by
 *  construction rather than by luck. */
export function rampC1(w, k = RAMP_SHOULDER) {
  w = clamp01(w);
  const m = 1 / (1 - k);
  const P = (v) => v * v * v - v * v * v * v / 2;   // integral of smooth01; P(1) = 0.5
  if (w < k) return m * k * P(w / k);
  if (w > 1 - k) return 1 - m * k * P((1 - w) / k);
  return m * (w - k / 2);
}

/** Softening on the ridge fold, as a fraction of the noise's own [-1,1] range. */
export const RIDGE_FOLD_SOFTEN = 0.12;

/** Ridged noise, C1.
 *
 *  NOT `ridge2D` from src/core/rng.js, and this is a deliberate substitution
 *  with evidence. That function folds with `1 - Math.abs(2v - 1)`, and an
 *  absolute value is C0: its slope flips sign across the fold, so the surface
 *  changes gradient discontinuously along EVERY ridge crest. Squaring the
 *  result does not repair it — the fold sits at n = 1, where d(n^2)/dn = 2.
 *  Measured on the bare function, |d2|/e2 grows 1.91x when the probe spacing
 *  halves, against 0.0 for `noise2D` and `fbm2D`, which are both clean.
 *
 *  Same octave structure, same seed stride, same output range; only the fold
 *  changes, from a corner to a hyperbola rounded over `soften` of the range.
 *  n(0) = 1 and n(+/-1) = 0 exactly as before, so the ridge character is the
 *  same at a distance and only the crest line stops being a knife edge.
 *
 *  src/core/rng.js is shared core and not mine to edit — logged as a
 *  core-change REQUEST (LVL-5 in docs/STATUS.json) rather than made. It also
 *  affects src/world/index.js, which uses ridge2D for both its placeholder
 *  terrain and its rock meshes. */
export function ridgeC1(x, z, { octaves = 4, lacunarity = 2.0, gain = 0.5, seed = 0, soften = RIDGE_FOLD_SOFTEN } = {}) {
  const A = Math.sqrt(1 + soften * soften);
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const v = noise2D(x * freq, z * freq, seed + i * 7717) * 2 - 1;
    const n = (A - Math.sqrt(v * v + soften * soften)) / (A - soften);
    sum += amp * n * n;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Signed value noise in [-1,1] at a given wavelength in metres. */
const sfbm = (x, z, lam, o) =>
  fbm2D(x / lam, z / lam, { octaves: o.octaves, lacunarity: o.lacunarity, gain: o.gain, seed: o.seed }) * 2 - 1;

/** Instance centres for the multi-instance carves. Factored out so the
 *  curvature diagnostic reads exactly what the field reads — a second copy of
 *  this arithmetic is how a diagnostic starts lying about the thing it checks. */
export function basinCentres(c) {
  return c.sites.map(s => ({ cx: s.fx * OUTDOOR_W_M, cz: s.fz * OUTDOOR_D_M, r: c.radiusM }));
}
export function craterCentres(c) {
  return c.sites.map(s => ({ cx: s.fx * OUTDOOR_W_M, cz: s.fz * OUTDOOR_D_M, r: s.r, pad: s.r + c.wallM }));
}

/** Carve returns { delta, infl }. `infl` is the DAMPING footprint — it covers
 *  the whole landform including its walls, not just its floor, because the
 *  walls are exactly where an undamped noise octave breaks the slope ceiling.
 *  Overlapping instances never sum; the strongest influence wins. */
function carveEval(b, x, z) {
  const c = b.carve;
  if (!c) return { delta: 0, infl: 0 };

  switch (c.kind) {
    case 'shore': {
      // Was pure linear, which left a corner at x = startM: d(delta)/dx jumped
      // 0 -> dropM/startM on one vertex line straight through Haventide's main
      // vista. rampC1 keeps the linear run across the plot-bearing western half
      // and rounds only the two shoulders.
      const t = clamp01((c.startM - x) / c.startM);
      return { delta: -c.dropM * rampC1(t), infl: smooth01(t * 1.4) };
    }
    case 'channel':
    case 'trench': {
      const along = c.axis === 'z' ? z : x;
      const across = c.axis === 'z' ? x : z;
      const span = c.axis === 'z' ? OUTDOOR_W_M : OUTDOOR_D_M;
      const centre = span / 2 + Math.sin(along / c.wavelengthM * Math.PI * 2) * c.sinuosityM;
      const d = Math.abs(across - centre);
      if (c.kind === 'channel') {
        const t = smooth01(1 - d / (c.widthM / 2));
        return { delta: -c.depthM * t, infl: smooth01(1 - (d - c.widthM / 2) / (c.inflTaperM ?? INFL_TAPER_M)) };
      }
      const half = c.floorWidthM / 2;
      const wall = (c.rimWidthM - c.floorWidthM) / 2;
      const infl = smooth01(1 - (d - c.rimWidthM / 2) / (c.inflTaperM ?? INFL_TAPER_M));
      if (d <= half) return { delta: -c.depthM, infl: 1 };
      // The lipMix blend of linear and smoothstep was C0 only: the surviving
      // linear component left a 0.29 slope jump at BOTH the floor edge and the
      // rim, and the rim one was this biome's worst curvature in the whole map.
      const shaped = rampC1((d - half) / wall);
      return { delta: -c.depthM * (1 - shaped), infl };
    }
    case 'basins': {
      // Basins are MEANT to merge into one marsh, so they blend rather than
      // compete. Winner-takes-all left an 18 deg slope seam along the arc
      // where the deeper basin took over — the last crease in the set.
      let delta = 0, infl = 0;
      for (const { cx, cz } of basinCentres(c)) {
        const d = Math.hypot(x - cx, z - cz);
        delta = smin(delta, -c.depthM * smooth01(1 - d / c.radiusM), CARVE_BLEND_M);
        infl = smax(infl, smooth01(1 - (d - c.radiusM) / (c.inflTaperM ?? INFL_TAPER_M)), INFL_BLEND);
      }
      return { delta, infl };
    }
    case 'plateau': {
      const d = Math.hypot(x - c.cxM, z - c.czM);
      const t = 1 - smooth01((d - c.radiusM) / c.falloffM);
      return { delta: c.riseM * t, infl: smooth01(1 - (d - c.radiusM - c.falloffM) / (c.inflTaperM ?? INFL_TAPER_M)) };
    }
    case 'craters': {
      // Each bowl is C1 AND compactly supported — rampC1(1) = 1 kills the floor
      // term at the footprint edge and sin^2(pi) kills the lip term, both with
      // zero slope. Compactly-supported C1 functions SUM to a C1 function, so
      // there is no winner-takes-all selection here and therefore no seam.
      // Floors are authored disjoint (asserted in selfCheck) so the only thing
      // that ever overlaps is two wall skirts, where both are near zero.
      let delta = 0, infl = 0;
      for (const { cx, cz, r, pad } of craterCentres(c)) {
        const d = Math.hypot(x - cx, z - cz);
        infl = smax(infl, smooth01(1 - (d - pad) / (c.inflTaperM ?? INFL_TAPER_M)), INFL_BLEND);
        if (d >= pad) continue;
        if (d <= r) { delta += -c.floorDropM; continue; }
        const w = clamp01((d - r) / c.wallM);
        const lip = Math.sin(w * Math.PI);
        delta += -c.floorDropM * (1 - rampC1(w)) + c.rimRiseM * lip * lip;
      }
      return { delta, infl };
    }
    case 'terrace':
      return { delta: 0, infl: 0 };                          // applied post-hoc
    default:
      return { delta: 0, infl: 0 };
  }
}

function terrace(h, c) {
  const u = h / c.stepM;
  const k = Math.floor(u), f = u - k;
  const lo = 0.5 - c.blendFrac / 2, hi = 0.5 + c.blendFrac / 2;
  const s = smooth01((f - lo) / (hi - lo));
  return h * (1 - c.mix) + c.stepM * (k + s) * c.mix;
}

/** Height in metres. (x,z) are MAP-LOCAL metres, origin at the NW corner. */
export function heightAt(biomeId, x, z) {
  const b = BIOMES[biomeId];
  if (!b) throw new Error(`unknown biome ${biomeId}`);

  let wx = x, wz = z;
  if (b.warp) {
    const w = b.warp;
    wx += sfbm(x, z, w.wavelengthM, { octaves: 3, lacunarity: 2.0, gain: 0.5, seed: w.seed }) * w.amountM;
    wz += sfbm(x, z, w.wavelengthM, { octaves: 3, lacunarity: 2.0, gain: 0.5, seed: w.seed + 1 }) * w.amountM;
  }

  const roll = sfbm(wx, wz, b.baseWavelengthM,
    { octaves: b.octaves, lacunarity: b.lacunarity, gain: b.gain, seed: b.seed });

  let base = roll;
  if (b.ridge) {
    const r = b.ridge;
    const rd = Math.pow(ridgeC1(wx / r.wavelengthM, wz / r.wavelengthM,
      { octaves: r.octaves, lacunarity: r.lacunarity, gain: r.gain, seed: r.seed }), r.exponent);
    base = roll * (1 - r.weight) + (rd * 2 - 1) * r.weight;
  }

  const c = carveEval(b, x, z);
  const damp = b.carve && b.carve.damp ? (1 - b.carve.damp * c.infl) : 1;
  let h = base * (b.amplitudeM / 2) * BASE_FIT * damp + c.delta;

  const d = b.detail;
  h += sfbm(x, z, d.wavelengthM, { octaves: d.octaves, lacunarity: d.lacunarity, gain: d.gain, seed: d.seed })
       * d.amplitudeM * (b.carve && b.carve.kind === 'trench' ? damp : 1);

  if (b.carve && b.carve.kind === 'terrace') h = terrace(h, b.carve);
  return h;
}

export function normalSlopeDeg(biomeId, x, z, e = VERTEX_SPACING_M) {
  const hx = (heightAt(biomeId, x + e, z) - heightAt(biomeId, x - e, z)) / (2 * e);
  const hz = (heightAt(biomeId, x, z + e) - heightAt(biomeId, x, z - e)) / (2 * e);
  return Math.atan(Math.hypot(hx, hz)) * 180 / Math.PI;
}

// ── surface continuity ────────────────────────────────────────────────────

/** Worst |d2h|/e2 over the map, both axes, at one probe spacing. */
function curvaturePeak(biomeId, wM, dM, e) {
  const nx = Math.round(wM / e) + 1, nz = Math.round(dM / e) + 1;
  const g = new Float64Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) g[j * nx + i] = heightAt(biomeId, i * e, j * e);
  const e2 = e * e;
  let max = 0, at = [0, 0], axis = 'x';
  for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const h = g[j * nx + i];
    const dxx = Math.abs(g[j * nx + i - 1] - 2 * h + g[j * nx + i + 1]) / e2;
    const dzz = Math.abs(g[(j - 1) * nx + i] - 2 * h + g[(j + 1) * nx + i]) / e2;
    if (dxx > max) { max = dxx; at = [i * e, j * e]; axis = 'x'; }
    if (dzz > max) { max = dzz; at = [i * e, j * e]; axis = 'z'; }
  }
  return { max, at, axis };
}

/** Two scales. `divergence` ~2.0 means a slope discontinuity; ~1.0 means the
 *  field is C1 and the peak is genuine curvature. `slopeJump` is what the
 *  crease would actually be worth if it is one: rise/run change concentrated
 *  at a point, which is the number that decides whether it lights up. */
function creaseScan(biomeId, wM, dM, e = CREASE_PROBE_SPACING_M) {
  const coarse = curvaturePeak(biomeId, wM, dM, e);
  const fine = curvaturePeak(biomeId, wM, dM, e / 2);
  return {
    coarse: coarse.max, fine: fine.max,
    divergence: fine.max / coarse.max,
    at: fine.at, axis: fine.axis,
    slopeJumpDeg: Math.atan(fine.max * (e / 2)) * 180 / Math.PI,
  };
}

/** Nearest coordinate where this biome's carve CHANGES FORMULA, to the given
 *  point. Diagnostic only — the ratio above is the gate. Reads the same `c`
 *  object and the same centre helpers the field reads. */
function nearestCarveBoundary(b, x, z) {
  const c = b.carve;
  if (!c) return null;
  const cand = [];
  const push = (label, dist) => cand.push({ label, dist: Math.abs(dist) });
  switch (c.kind) {
    case 'shore':
      push(`startM=${c.startM}`, x - c.startM); break;
    case 'channel':
    case 'trench': {
      const along = c.axis === 'z' ? z : x;
      const across = c.axis === 'z' ? x : z;
      const span = c.axis === 'z' ? OUTDOOR_W_M : OUTDOOR_D_M;
      const centre = span / 2 + Math.sin(along / c.wavelengthM * Math.PI * 2) * c.sinuosityM;
      const d = Math.abs(across - centre);
      push('centreline', d);
      if (c.kind === 'channel') {
        push(`widthM/2=${c.widthM / 2}`, d - c.widthM / 2);
        push(`infl taper`, d - (c.widthM / 2 + (c.inflTaperM ?? INFL_TAPER_M)));
      } else {
        push(`floorWidthM/2=${c.floorWidthM / 2}`, d - c.floorWidthM / 2);
        push(`rimWidthM/2=${c.rimWidthM / 2}`, d - c.rimWidthM / 2);
        push('infl taper', d - (c.rimWidthM / 2 + (c.inflTaperM ?? INFL_TAPER_M)));
      }
      break;
    }
    case 'basins':
      for (const { cx, cz, r } of basinCentres(c)) {
        const d = Math.hypot(x - cx, z - cz);
        push(`radiusM=${r}`, d - r);
        push('infl taper', d - (r + (c.inflTaperM ?? INFL_TAPER_M)));
      }
      break;
    case 'plateau': {
      const d = Math.hypot(x - c.cxM, z - c.czM);
      push(`radiusM=${c.radiusM}`, d - c.radiusM);
      push(`radiusM+falloffM=${c.radiusM + c.falloffM}`, d - (c.radiusM + c.falloffM));
      push('infl taper', d - (c.radiusM + c.falloffM + (c.inflTaperM ?? INFL_TAPER_M)));
      break;
    }
    case 'craters':
      for (const { cx, cz, r, pad } of craterCentres(c)) {
        const d = Math.hypot(x - cx, z - cz);
        push(`crater r=${r} floor edge`, d - r);
        push(`crater r=${r} wall top`, d - pad);
        push(`crater r=${r} infl taper`, d - (pad + (c.inflTaperM ?? INFL_TAPER_M)));
      }
      break;
    case 'terrace':
      push('terrace riser (height-space, not planar)', Infinity); break;
  }
  cand.sort((p, q) => p.dist - q.dist);
  return cand[0];
}

// ── cost ───────────────────────────────────────────────────────────────────
export function meshCost(wM, dM) {
  const nx = Math.round(wM / VERTEX_SPACING_M) + 1;
  const nz = Math.round(dM / VERTEX_SPACING_M) + 1;
  const verts = nx * nz;
  const tris = (nx - 1) * (nz - 1) * 2;
  // pos+normal+colour 12 B each, uv 8 B, index 4 B x 3 per tri
  const bytes = verts * 44 + tris * 12;
  return { nx, nz, verts, tris, drawCalls: 1, mib: bytes / (1024 * 1024) };
}

function noiseEvalsPerVertex(b) {
  let n = b.octaves;
  if (b.ridge) n += b.ridge.octaves;
  n += b.detail.octaves;
  if (b.warp) n += 6;
  return n;
}

// ── albedo ─────────────────────────────────────────────────────────────────
const srgbToLinear = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = srgbToLinear(((n >> 16) & 255) / 255);
  const g = srgbToLinear(((n >> 8) & 255) / 255);
  const bl = srgbToLinear((n & 255) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}
export const ALBEDO_BAND = [0.06, 0.55];
export const ALBEDO_MAX_SPREAD = 6.0;

// ── self-check ─────────────────────────────────────────────────────────────
function sampleField(biomeId, wM, dM) {
  const s = VERTEX_SPACING_M;
  const nx = Math.round(wM / s) + 1, nz = Math.round(dM / s) + 1;
  const g = new Float64Array(nx * nz);
  let min = Infinity, max = -Infinity;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const h = heightAt(biomeId, i * s, j * s);
    g[j * nx + i] = h;
    if (h < min) min = h; if (h > max) max = h;
  }
  // slope between 4-neighbours, which is what the mesh actually builds
  let maxSlope = 0, maxAt = null, sum = 0, n = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const h = g[j * nx + i];
    if (i + 1 < nx) { const d = Math.abs(g[j * nx + i + 1] - h) / s; sum += d; n++; if (d > maxSlope) { maxSlope = d; maxAt = [i * s, j * s]; } }
    if (j + 1 < nz) { const d = Math.abs(g[(j + 1) * nx + i] - h) / s; sum += d; n++; if (d > maxSlope) { maxSlope = d; maxAt = [i * s, j * s]; } }
  }
  const deg = (t) => Math.atan(t) * 180 / Math.PI;
  return { g, nx, nz, min, max, range: max - min, mean: (min + max) / 2,
           maxSlopeDeg: deg(maxSlope), meanSlopeDeg: deg(sum / n), maxAt };
}

function finestWavelength(lamM, octaves, lacunarity) {
  return lamM / Math.pow(lacunarity, octaves - 1);
}

function selfCheck() {
  const fail = [];
  const F = (m) => fail.push(m);
  const t0 = Date.now();

  console.log(`Camera: FRAME_HEIGHT_M 18 @ 55 deg -> ~32 m across x ~22 m deep visible.`);
  console.log(`Outdoor map ${OUTDOOR_W_M} x ${OUTDOOR_D_M} m = ${(OUTDOOR_W_M / 32).toFixed(1)} x ${(OUTDOOR_D_M / 22).toFixed(1)} screens.`);
  const mc = meshCost(OUTDOOR_W_M, OUTDOOR_D_M);
  console.log(`Mesh @ ${VERTEX_SPACING_M} m spacing: ${mc.nx}x${mc.nz} = ${mc.verts.toLocaleString()} verts, ` +
    `${mc.tris.toLocaleString()} tris, ${mc.drawCalls} draw call, ${mc.mib.toFixed(2)} MiB per outdoor map ` +
    `(${(100 * mc.tris / 2_600_000).toFixed(2)}% of the 2.6 M triangle budget).`);
  const mi = meshCost(60, 40);
  console.log(`Interior 30x20 tiles: ${mi.tris.toLocaleString()} tris, ${mi.mib.toFixed(2)} MiB.`);
  console.log(`Nyquist floor: no octave finer than ${NYQUIST_MIN_WAVELENGTH_M} m. Walkable ceiling: ${MAX_WALKABLE_SLOPE_DEG} deg.\n`);

  // 1. Nyquist, on every noise term of every biome.
  for (const b of Object.values(BIOMES)) {
    const terms = [
      ['roll', b.baseWavelengthM, b.octaves, b.lacunarity],
      ['detail', b.detail.wavelengthM, b.detail.octaves, b.detail.lacunarity],
    ];
    if (b.ridge) terms.push(['ridge', b.ridge.wavelengthM, b.ridge.octaves, b.ridge.lacunarity]);
    if (b.warp) terms.push(['warp', b.warp.wavelengthM, 3, 2.0]);
    for (const [name, lam, oct, lac] of terms) {
      const fw = finestWavelength(lam, oct, lac);
      if (fw < NYQUIST_MIN_WAVELENGTH_M)
        F(`${b.id}.${name}: finest octave ${fw.toFixed(2)} m < Nyquist floor ${NYQUIST_MIN_WAVELENGTH_M} m`);
    }
    if (b.maxSlopeDeg > MAX_WALKABLE_SLOPE_DEG)
      F(`${b.id}: authored maxSlopeDeg ${b.maxSlopeDeg} exceeds the ${MAX_WALKABLE_SLOPE_DEG} deg ceiling`);
  }

  // 2. sample every biome over a real 90x60 m map
  console.log('Biome            noise  target  measured |  slope max / mean   limit   finest oct   evals/v');
  const stats = {};
  for (const id of Object.keys(BIOMES)) {
    const b = BIOMES[id];
    const s = sampleField(id, OUTDOOR_W_M, OUTDOOR_D_M);
    stats[id] = s;
    const lo = b.targetReliefM * 0.75, hi = b.targetReliefM * 1.30;
    if (s.range < lo || s.range > hi)
      F(`${id}: measured relief ${s.range.toFixed(2)} m is outside [${lo.toFixed(2)}, ${hi.toFixed(2)}] for targetReliefM ${b.targetReliefM}`);
    if (s.maxSlopeDeg > b.maxSlopeDeg)
      F(`${id}: max slope ${s.maxSlopeDeg.toFixed(1)} deg exceeds its own limit ${b.maxSlopeDeg} deg at (${s.maxAt[0]}, ${s.maxAt[1]}) m`);
    if (s.maxSlopeDeg > MAX_WALKABLE_SLOPE_DEG)
      F(`${id}: max slope ${s.maxSlopeDeg.toFixed(1)} deg breaks the global walkable ceiling`);
    const terms = [finestWavelength(b.baseWavelengthM, b.octaves, b.lacunarity),
                   finestWavelength(b.detail.wavelengthM, b.detail.octaves, b.detail.lacunarity)];
    if (b.ridge) terms.push(finestWavelength(b.ridge.wavelengthM, b.ridge.octaves, b.ridge.lacunarity));
    console.log(`${id.padEnd(16)} ${String(b.amplitudeM).padStart(5)}  ${String(b.targetReliefM).padStart(6)}  ${s.range.toFixed(2).padStart(8)} |` +
      `  ${s.maxSlopeDeg.toFixed(1).padStart(5)} / ${s.meanSlopeDeg.toFixed(1).padStart(4)} deg` +
      `   ${String(b.maxSlopeDeg).padStart(2)}    ${Math.min(...terms).toFixed(2).padStart(5)} m` +
      `      ${String(noiseEvalsPerVertex(b)).padStart(2)}`);
  }

  // 2b. surface continuity — the crease class max-slope cannot see
  console.log(`\nSurface continuity: |d2h|/e2 at ${CREASE_PROBE_SPACING_M} m vs ${CREASE_PROBE_SPACING_M / 2} m.`);
  console.log(`Divergence ~2.0 = C1 break, ~1.0 = genuine curvature. Ceiling ${CREASE_DIVERGENCE_MAX}.`);
  console.log('Biome             @0.5m   @0.25m   diverg   worst at (x,z) m   ax   nearest carve boundary');
  for (const id of Object.keys(BIOMES)) {
    const b = BIOMES[id];
    const cs = creaseScan(id, OUTDOOR_W_M, OUTDOOR_D_M);
    const nb = nearestCarveBoundary(b, cs.at[0], cs.at[1]);
    const tag = !nb ? 'no carve'
      : nb.dist <= CREASE_PROBE_SPACING_M ? `ON ${nb.label}`
      : Number.isFinite(nb.dist) ? `${nb.dist.toFixed(1)} m from ${nb.label}` : nb.label;
    console.log(`${id.padEnd(16)} ${cs.coarse.toFixed(3).padStart(6)}  ${cs.fine.toFixed(3).padStart(7)}  ` +
      `${cs.divergence.toFixed(2).padStart(6)}x  ` + `(${cs.at[0].toFixed(2)}, ${cs.at[1].toFixed(2)})`.padEnd(18) +
      ` ${cs.axis}   ${tag}`);
    if (cs.divergence > CREASE_DIVERGENCE_MAX)
      F(`${id}: |d2h| grows ${cs.divergence.toFixed(2)}x when the probe halves at (${cs.at[0]}, ${cs.at[1]}) m ` +
        `along ${cs.axis} — a C1 crease worth ${cs.slopeJumpDeg.toFixed(1)} deg of slope across one vertex line` +
        (nb && nb.dist <= CREASE_PROBE_SPACING_M ? ` (on ${nb.label})` : ''));
  }

  // 2c. crater floors must not overlap — summing two floors doubles the drop
  //     and stacks two walls into one, which is how this carve blew the slope
  //     ceiling by 36 deg on the first pass.
  {
    const cc = craterCentres(BIOMES.crater_ember.carve);
    let worst = -Infinity, pair = null;
    for (let i = 0; i < cc.length; i++) for (let j = i + 1; j < cc.length; j++) {
      const gap = Math.hypot(cc[i].cx - cc[j].cx, cc[i].cz - cc[j].cz) - cc[i].r - cc[j].r;
      if (-gap > worst) { worst = -gap; pair = [i, j]; }
    }
    console.log(`\ncrater_ember floors: ${cc.length} sites, closest floor-to-floor gap ${(-worst).toFixed(1)} m (must be > 0).`);
    if (worst >= 0) F(`crater_ember: floors of craters ${pair[0]} and ${pair[1]} overlap by ${worst.toFixed(1)} m`);
  }

  // 3. Haventide build plots must be level enough to put a building on
  console.log('\nHaventide build plots (17) against a %d deg / %s m spread limit over a %d m footprint:',
    PLOT_MAX_SLOPE_DEG, PLOT_MAX_SPREAD_M, PLOT_FOOTPRINT_M);
  let worstPlot = { slope: 0 }, worstSpread = { spread: 0 };
  for (const p of MAPS.haventide_region.city.plots) {
    const x = tileToM(p.x), z = tileToM(p.y);
    const slope = normalSlopeDeg('grassland_ruins', x, z);
    let lo = Infinity, hi = -Infinity;
    for (let dz = -PLOT_FOOTPRINT_M / 2; dz <= PLOT_FOOTPRINT_M / 2; dz += 1)
      for (let dx = -PLOT_FOOTPRINT_M / 2; dx <= PLOT_FOOTPRINT_M / 2; dx += 1) {
        const h = heightAt('grassland_ruins', x + dx, z + dz);
        if (h < lo) lo = h; if (h > hi) hi = h;
      }
    const spread = hi - lo;
    if (slope > worstPlot.slope) worstPlot = { slope, p };
    if (spread > worstSpread.spread) worstSpread = { spread, p };
    if (slope > PLOT_MAX_SLOPE_DEG) F(`Haventide plot ${p.slotIdx} (${p.x},${p.y}): slope ${slope.toFixed(1)} deg > ${PLOT_MAX_SLOPE_DEG}`);
    if (spread > PLOT_MAX_SPREAD_M) F(`Haventide plot ${p.slotIdx} (${p.x},${p.y}): ${spread.toFixed(2)} m of relief across ${PLOT_FOOTPRINT_M} m > ${PLOT_MAX_SPREAD_M}`);
  }
  console.log(`  worst slope  ${worstPlot.slope.toFixed(1)} deg at slot ${worstPlot.p.slotIdx} (${worstPlot.p.x},${worstPlot.p.y})`);
  console.log(`  worst spread ${worstSpread.spread.toFixed(2)} m at slot ${worstSpread.p.slotIdx} (${worstSpread.p.x},${worstSpread.p.y})`);

  // 4. every doorway is on walkable, non-cliff ground
  console.log(`\nDoorways (${DOOR_MAX_SLOPE_DEG} deg limit):`);
  let worstDoor = { slope: 0 };
  for (const id of OUTDOOR_IDS) {
    const b = MAPS[id].biome;
    for (const d of MAPS[id].doorways) {
      const slope = normalSlopeDeg(b, tileToM(d.x), tileToM(d.y));
      if (slope > worstDoor.slope) worstDoor = { slope, id, d };
      if (slope > DOOR_MAX_SLOPE_DEG)
        F(`${id} door (${d.x},${d.y}) on ${slope.toFixed(1)} deg ground > ${DOOR_MAX_SLOPE_DEG}`);
    }
  }
  console.log(`  worst ${worstDoor.slope.toFixed(1)} deg at ${worstDoor.id} (${worstDoor.d.x},${worstDoor.d.y})`);

  // 5. biome-specific promises
  const mb = BIOMES.mire_bog, mbs = stats.mire_bog;
  let below = 0;
  const sorted = Float64Array.from(mbs.g).sort();
  const median = sorted[sorted.length >> 1];
  const plane = median + mb.waterPlaneM;
  for (const h of mbs.g) if (h < plane) below++;
  const frac = below / mbs.g.length;
  const [flo, fhi] = mb.submergedFraction;
  if (frac < flo || frac > fhi)
    F(`mire_bog: ${(frac * 100).toFixed(1)}% of the map sits below the water plane, outside [${flo * 100}%, ${fhi * 100}%]`);
  console.log(`\nmire_bog standing water: ${(frac * 100).toFixed(1)}% of the surface below the plane at ${plane.toFixed(2)} m (band ${flo * 100}-${fhi * 100}%).`);

  const fc = BIOMES.frost_canyon;
  const floorH = heightAt('frost_canyon', OUTDOOR_W_M / 2 + Math.sin(30 / fc.carve.wavelengthM * Math.PI * 2) * fc.carve.sinuosityM, 30);
  let rimH = -Infinity;
  for (let z = 0; z <= OUTDOOR_D_M; z += 2) {
    const centre = OUTDOOR_W_M / 2 + Math.sin(z / fc.carve.wavelengthM * Math.PI * 2) * fc.carve.sinuosityM;
    for (const side of [-1, 1]) {
      const x = centre + side * fc.carve.rimWidthM / 2;
      if (x < 0 || x > OUTDOOR_W_M) continue;
      rimH = Math.max(rimH, heightAt('frost_canyon', x, z));
    }
  }
  const relief = rimH - floorH;
  if (relief < fc.minTrenchReliefM)
    F(`frost_canyon: rim-to-floor relief ${relief.toFixed(2)} m < required ${fc.minTrenchReliefM} m — the canyon is not a canyon`);
  console.log(`frost_canyon rim-to-floor relief: ${relief.toFixed(2)} m (required >= ${fc.minTrenchReliefM} m), rim-to-rim ${fc.carve.rimWidthM} m of a ${OUTDOOR_W_M} m map.`);

  // 6. interiors
  const its = sampleField_interior();
  function sampleField_interior() {
    const f = INTERIOR_FIELD, s = VERTEX_SPACING_M;
    let min = Infinity, max = -Infinity, maxSlope = 0;
    const H = (x, z) => (fbm2D(x / f.wavelengthM, z / f.wavelengthM,
      { octaves: f.octaves, lacunarity: f.lacunarity, gain: f.gain, seed: f.seed }) * 2 - 1) * f.amplitudeM / 2;
    for (let z = 0; z <= 48; z += s) for (let x = 0; x <= 70; x += s) {
      const h = H(x, z);
      if (h < min) min = h; if (h > max) max = h;
      const d = Math.abs(H(x + s, z) - h) / s;
      if (d > maxSlope) maxSlope = d;
    }
    return { range: max - min, maxSlopeDeg: Math.atan(maxSlope) * 180 / Math.PI };
  }
  if (its.maxSlopeDeg > INTERIOR_FIELD.maxSlopeDeg)
    F(`interior micro-relief slope ${its.maxSlopeDeg.toFixed(1)} deg > ${INTERIOR_FIELD.maxSlopeDeg}`);
  console.log(`Interiors (${INTERIOR_IDS.length}): flat floors + ${its.range.toFixed(2)} m micro-relief, max slope ${its.maxSlopeDeg.toFixed(1)} deg. No biome field applies.`);

  // 7. albedo — the Phase 0 lesson: a dark ground blows the sky trying to
  //    expose it, and a bright one clips. Dawn 6.4 h is signed off and must
  //    not regress, so the eight mids have to sit in one band.
  console.log('\nGround albedo (linear luminance, band %s-%s):', ALBEDO_BAND[0], ALBEDO_BAND[1]);
  let lmin = Infinity, lmax = -Infinity;
  for (const b of Object.values(BIOMES)) {
    const L = luminance(b.albedo.mid);
    lmin = Math.min(lmin, L); lmax = Math.max(lmax, L);
    const flag = (L < ALBEDO_BAND[0] || L > ALBEDO_BAND[1]) ? '  <-- OUT OF BAND' : '';
    console.log(`  ${b.id.padEnd(16)} ${b.albedo.mid}  ${L.toFixed(3)}${flag}`);
    if (L < ALBEDO_BAND[0] || L > ALBEDO_BAND[1]) F(`${b.id}: mid albedo luminance ${L.toFixed(3)} outside ${ALBEDO_BAND}`);
  }
  const spread = lmax / lmin;
  console.log(`  spread ${lmin.toFixed(3)} -> ${lmax.toFixed(3)} = ${spread.toFixed(2)}x (limit ${ALBEDO_MAX_SPREAD}x)`);
  if (spread > ALBEDO_MAX_SPREAD)
    F(`albedo spread ${spread.toFixed(2)}x exceeds ${ALBEDO_MAX_SPREAD}x — one region would force the fixed exposure ramp off the others`);

  // 8. handoff to Phase 1.3, printed not asserted: local relief at the 36
  //    inherited encounter tiles, which is what "combat clearance" is measured
  //    against when 1.3 re-places them.
  console.log('\nPhase 1.3 input — relief within 7 m of each inherited encounter tile:');
  for (const id of OUTDOOR_IDS) {
    const b = MAPS[id].biome;
    const rows = MAPS[id].encounters.map(e => {
      const x = tileToM(e.x), z = tileToM(e.y);
      let lo = Infinity, hi = -Infinity;
      for (let dz = -7; dz <= 7; dz += 1) for (let dx = -7; dx <= 7; dx += 1) {
        if (dx * dx + dz * dz > 49) continue;
        const h = heightAt(b, x + dx, z + dz);
        if (h < lo) lo = h; if (h > hi) hi = h;
      }
      return `${e.id}:${(hi - lo).toFixed(1)}`;
    });
    console.log(`  ${id.replace('_region', '').padEnd(14)} ${rows.join('  ')}`);
  }

  console.log(`\nsampled ${Object.keys(BIOMES).length} biomes x ${stats.grassland_ruins.g.length.toLocaleString()} vertices in ${Date.now() - t0} ms`);

  if (fail.length) {
    console.error(`\nFAIL - ${fail.length} issue(s):`);
    for (const f of fail) console.error('  - ' + f);
    process.exitCode = 1;
  } else {
    console.log(`\nPASS - 8 biomes: relief in band, every slope under its own limit and under the ${MAX_WALKABLE_SLOPE_DEG} deg walkable ceiling, every octave above the Nyquist floor, 17 plots level, ${OUTDOOR_IDS.reduce((n, id) => n + MAPS[id].doorways.length, 0)} outdoor doorways on walkable ground.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) selfCheck();
