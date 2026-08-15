// ─────────────────────────────────────────────────────────────────────────────
// Level DNA — every number that decides the shape and skin of one world.
//
// One DNA is live at a time. `setActiveDNA()` in profile.js reads these fields
// into module-local scalars, so the height field stays a set of pure functions
// of (x, z) with no per-sample object dereference. Nothing outside profile.js
// and world-materials.js reads a DNA directly.
//
// Anything omitted falls back to `DEFAULTS` below, so a new world only has to
// state what makes it different.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} DNA
 * @property {string} id                     stream/label for the world
 * @property {string} seed                   RNG stream for the relief bands
 * @property {number} length                 nominal corridor length, metres
 * @property {number} zStart                 terrain is built from here…
 * @property {number} zEnd                   …to here
 * @property {number} waterLevel
 * @property {'water'|'ice'|'none'} surface
 * @property {Object} grid                   mesh tiers and sample spacing
 * @property {Object} centreline             meander: sine terms + smoothstep dog-legs
 * @property {Array}  keys                   cross-section keyframes, z descending
 * @property {Object} bands                  relief noise: scale, amplitude, band limit
 * @property {Object|null} city              urban window along z, or null
 * @property {Object|null} islands           stacks, sandbars, séracs
 * @property {Object} palette                vertex tint ratios on the rock albedo
 * @property {Object} lithology              GLSL member colours for the strata
 */

export const DEFAULTS = {
  length: 9000,
  zStart: 720,
  zEnd: -9840,
  waterLevel: 0,
  surface: 'water',

  grid: {
    nearHalf: 1100,        // lateral extent of the high-detail tier
    farHalf: 5600,         // lateral extent of the ridgeline tier
    chunkLen: 240,
    resZ: 6,               // metres per row, near tier
    farChunkLen: 1200,
    farResZ: 30,
    spacingBase: 6,        // lateral sample spacing at the centreline…
    spacingGrowth: 280,    // …doubling every this many metres out
  },

  centreline: {
    // X = Σ sin(-z·w + p)·a  +  Σ dx·smoothstep across a dog-leg
    x: { waves: [], bends: [] },
    // Y is the rail height; cameras and shots read it, the height field does not
    y: { base: 44, waves: [] },
  },

  bands: {
    // `from`/`to` on `far` are absolute distances from the centreline; on
    // `relief` they are offsets past the cliff top.
    far: { scale: 1 / 22000, amp: 620, pow: 1.5, bias: 0.28, from: 1500, to: 3800 },
    macro: { scale: 1 / 16000, amp: 300 },
    range: { scale: 1 / 6997, amp: 250, pow: 1.7, bias: 0.30, lambda: 292 },
    hill: { scale: 1 / 4501, amp: 96, lambda: 140 },
    fine: { scale: 1 / 2213, amp: 40, lambda: 92 },
    crag: { scale: 1 / 1601, amp: 46, bias: 0.42, lambda: 80 },
    warp: { scale: 1 / 9000, amp: 260, shear: 0.7 },
    jitter: { a: 44, b: 14 },
    side: { scale: 1 / 6000, base: 0.72, amp: 0.56 },
    relief: { base: 0.42, far: 2.4, from: 400, to: 3200 },
  },

  city: null,
  islands: null,

  // Ratios that multiply the triplanar rock albedo, not colours. Anything that
  // has to read as a different material comes from here.
  palette: {
    rock: [1.00, 0.97, 0.93],
    sand: [1.60, 1.36, 0.96],
    scrub: [0.38, 0.62, 0.26],
    dry: [1.30, 1.06, 0.52],
    pale: [1.14, 1.02, 0.84],
    urban: [0.90, 0.89, 0.86],
    moss: [0.52, 0.68, 0.40],
    amount: { pale: 1, dry: 0.8, veg: 1, moss: 0.55, sand: 1, urban: 0.75 },
  },

  // Linear albedos for the fragment stage. Real stone lives between 0.10 and
  // 0.42; the separation that makes a wall read as sedimentary is hue between
  // members, not brightness.
  lithology: {
    base: [0.246, 0.204, 0.156],
    members: [
      { color: [0.312, 0.208, 0.126], k: 0.85, in: [0.03, 0.11], out: [0.19, 0.30] },
      { color: [0.176, 0.166, 0.166], k: 0.70, in: [0.38, 0.45], out: [0.50, 0.58] },
      { color: [0.352, 0.312, 0.240], k: 0.80, in: [0.63, 0.70], out: [0.78, 0.86] },
      { color: [0.276, 0.152, 0.100], k: 0.55, in: [0.90, 0.94], out: [0.98, 1.00] },
    ],
  },
};

/* ── Corneria ─────────────────────────────────────────────────────────────── */
//
//  wallH ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╭──── plateau + relief
//                                    ╭──╯   a3 = cliff top
//  shelfH ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╭───────╯      a2 = cliff foot
//  beachH ┈┈┈┈┈┈┈┈┈╭─────────╯            a1 = shelf foot
//    0  ───────────╯                      a0 = waterline (= inner)
//              ╲__╱                       riverbed, `bed` deep

export const DNA_CORNERIA = {
  id: 'corneria',
  seed: 'corneria:relief-2',
  length: 9000,
  zStart: 720,
  zEnd: -9840,
  waterLevel: 0,
  surface: 'water',

  centreline: {
    x: {
      waves: [
        { a: 210, w: 0.00055, p: 0 },
        { a: 78, w: 0.00181, p: 1.7 },
        { a: 22, w: 0.0041, p: 0.4 },
      ],
      bends: [],
    },
    y: { base: 44, waves: [{ a: 16, w: 0.00042, p: 0.9 }, { a: 7, w: 0.00133, p: 2.3 }] },
  },

  keys: [
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
  ],

  city: { from: -4150, to: -6400, fadeIn: 400, fadeOut: 300 },

  islands: {
    seed: 'corneria:islands',
    groups: [
      // outer bay: rocky stacks and a breakwater shoal
      { n: 9, z: [400, -1500], u: [170, 620], r: [60, 165], h: [16, 62], pow: [1.4, 2.6] },
      // delta: long low sandbars splitting the channel
      { n: 14, z: [-7700, -9700], u: [60, 520], r: [90, 250], h: [4, 13], pow: [2.2, 3.6], flat: 1 },
    ],
    // a pair of stacks in the narrows you thread between
    fixed: [
      { z: -3060, u: -46, r: 42, h: 190, pow: 1.15, spire: 1 },
      { z: -3390, u: 52, r: 38, h: 165, pow: 1.15, spire: 1 },
    ],
  },
};

/* ── Fichina ──────────────────────────────────────────────────────────────── */
//
// A glacial trough, not a river valley: the floor is flat and the same width
// for nine kilometres, the walls rise from it at 78–80° with almost no beach or
// shelf between, and the corridor turns through three dog-legs instead of
// meandering. Above the rim the land is an ice sheet — `relief` is roughly half
// Corneria's, so the skyline is a flat white table cut by a slot.

export const DNA_FICHINA = {
  id: 'fichina',
  seed: 'fichina:relief-1',
  length: 9000,
  zStart: 720,
  zEnd: -9840,
  waterLevel: 0,
  surface: 'ice',

  centreline: {
    x: {
      // Two long, shallow sines: the trough is straight between its turns.
      waves: [
        { a: 96, w: 0.00031, p: 0 },
        { a: 34, w: 0.00097, p: 2.4 },
      ],
      // dX/dz peaks at 1.5·dx/width per bend; 0.56 is 1.6× Corneria's whole
      // meander, which is as far as the rail-aligned grid shears cleanly.
      bends: [
        { z: -2450, width: 640, dx: 240 },
        { z: -5600, width: 780, dx: -290 },
        { z: -7900, width: 620, dx: 200 },
      ],
    },
    y: { base: 52, waves: [{ a: 11, w: 0.00037, p: 1.4 }] },
  },

  keys: [
    { z: 720, inner: 250, bed: 8, beachW: 16, beachH: 4, shelfW: 24, shelfH: 12, cliffW: 130, wallH: 260, relief: 0.55 },
    { z: -900, inner: 236, bed: 8, beachW: 14, beachH: 4, shelfW: 22, shelfH: 13, cliffW: 116, wallH: 355, relief: 0.58 },
    { z: -2100, inner: 224, bed: 9, beachW: 12, beachH: 4, shelfW: 20, shelfH: 14, cliffW: 104, wallH: 430, relief: 0.60 },
    { z: -3300, inner: 214, bed: 9, beachW: 11, beachH: 4, shelfW: 18, shelfH: 14, cliffW: 96, wallH: 480, relief: 0.62 },
    { z: -4500, inner: 206, bed: 9, beachW: 10, beachH: 4, shelfW: 17, shelfH: 15, cliffW: 92, wallH: 515, relief: 0.62 },
    { z: -5700, inner: 218, bed: 9, beachW: 12, beachH: 4, shelfW: 19, shelfH: 14, cliffW: 100, wallH: 470, relief: 0.60 },
    { z: -6900, inner: 198, bed: 10, beachW: 9, beachH: 4, shelfW: 16, shelfH: 15, cliffW: 88, wallH: 545, relief: 0.64 },
    { z: -8100, inner: 228, bed: 9, beachW: 13, beachH: 4, shelfW: 21, shelfH: 13, cliffW: 110, wallH: 425, relief: 0.58 },
    { z: -9840, inner: 262, bed: 8, beachW: 17, beachH: 4, shelfW: 26, shelfH: 11, cliffW: 140, wallH: 330, relief: 0.54 },
  ],

  bands: {
    // Ice planes the crags off and fills the gullies; what is left above the rim
    // is a broad swell, so range/crag/fine drop and macro/far carry the skyline.
    far: { scale: 1 / 26000, amp: 760, pow: 1.5, bias: 0.28, from: 1400, to: 4200 },
    macro: { scale: 1 / 18000, amp: 340 },
    range: { scale: 1 / 8200, amp: 120, pow: 1.9, bias: 0.34, lambda: 342 },
    hill: { scale: 1 / 5200, amp: 54, lambda: 162 },
    fine: { scale: 1 / 2213, amp: 18, lambda: 92 },
    crag: { scale: 1 / 1601, amp: 22, bias: 0.42, lambda: 80 },
    warp: { scale: 1 / 9000, amp: 150, shear: 0.7 },
    // Near-zero: the walls are parallel, so the bank line must not wander.
    jitter: { a: 9, b: 3 },
    side: { scale: 1 / 7400, base: 0.88, amp: 0.26 },
    relief: { base: 0.30, far: 1.9, from: 300, to: 3600 },
  },

  city: null,

  islands: {
    seed: 'fichina:ice-1',
    groups: [
      // séracs: ice blocks calved onto the frozen channel
      { n: 16, z: [200, -9200], u: [40, 190], r: [22, 58], h: [10, 34], pow: [1.1, 1.8] },
      // pressure ridges: long low welts across the floor
      { n: 10, z: [-800, -8800], u: [0, 150], r: [110, 240], h: [5, 12], pow: [2.4, 3.8], flat: 1 },
    ],
    // nunataks — bare rock standing out of the ice at the two tightest turns
    fixed: [
      { z: -2560, u: -78, r: 54, h: 165, pow: 1.2 },
      { z: -5720, u: 86, r: 48, h: 140, pow: 1.2 },
      { z: -7960, u: -62, r: 44, h: 120, pow: 1.25 },
    ],
  },

  palette: {
    // Snow and blue ice, not stone. `rock` is the shadowed ice that fills the
    // trough floor; `pale` is the sunlit cap on everything above the rim.
    rock: [1.22, 1.31, 1.44],
    sand: [1.30, 1.40, 1.56],
    scrub: [0.46, 0.56, 0.72],
    dry: [1.10, 1.18, 1.30],
    pale: [1.52, 1.58, 1.70],
    urban: [0.90, 0.89, 0.86],
    moss: [0.40, 0.52, 0.70],
    // No vegetation, no beach sand, no city; the wet-rock and scoured-rim terms
    // stay because they are what keeps the floor from reading as one flat white.
    amount: { pale: 1, dry: 0.45, veg: 0.22, moss: 0.30, sand: 0.6, urban: 0 },
  },

  lithology: {
    base: [0.470, 0.512, 0.560],
    members: [
      { color: [0.560, 0.606, 0.660], k: 0.80, in: [0.05, 0.14], out: [0.22, 0.34] },
      { color: [0.286, 0.372, 0.452], k: 0.72, in: [0.36, 0.44], out: [0.52, 0.62] },   // blue ice
      { color: [0.620, 0.652, 0.688], k: 0.75, in: [0.66, 0.73], out: [0.80, 0.88] },
      { color: [0.238, 0.246, 0.262], k: 0.60, in: [0.91, 0.95], out: [0.99, 1.00] },   // exposed basalt
    ],
  },
};

export const DNA_BY_ID = {
  corneria: DNA_CORNERIA,
  fichina: DNA_FICHINA,
};
