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
 * @property {'sedimentary'|'glacial'} [surfaceKind]  wall material and structure
 * @property {Object} grid                   mesh tiers and sample spacing
 * @property {Object} centreline             meander: sine terms + smoothstep dog-legs
 * @property {Array}  [zones]                zone sequence; compiled to `keys` and
 *                                           dog-legs by `zones.js:expandZones`
 * @property {Array}  [keys]                 cross-section keyframes, z descending.
 *                                           Hand-authored, or emitted from `zones`
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
  backend: 'terrain',
  // What the walls are made of, as opposed to what colour they are. Selects the
  // texture set and the structural GLSL in world-materials.js; `palette` and
  // `lithology` only recolour whichever one is chosen.
  surfaceKind: 'sedimentary',

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
    y: { base: 44, waves: [], bends: [] },
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
// An ice sheet with a slot cut through it, authored as a sequence of zones (see
// zones.js). The landform vocabulary is Corneria's — there is no new shape
// function here — and everything that makes it a different planet is pacing,
// width, wall height and skin: it opens on an open icefield, spends 1400 m
// closing into the trough, pinches to a 128 m slot for a little over a second,
// releases into a cirque, climbs 160 m over a high pass, threads a crevasse and
// runs out onto a wide shelf.
//
// `inner` runs 128 → 620 (4.8×) against Corneria's 4.6×; the keys the expander
// emits are spaced 150–1950 m apart, bunched at the slot and the crevasse. Above
// the rim `relief` stays roughly half Corneria's, so the skyline is still a flat
// white table.

export const DNA_FICHINA = {
  id: 'fichina',
  seed: 'fichina:relief-2',
  length: 9000,
  zStart: 720,
  zEnd: -9840,
  waterLevel: 0,
  surface: 'ice',
  surfaceKind: 'glacial',

  centreline: {
    x: {
      // Two long, shallow sines: the trough is straight between its turns, and
      // together they contribute only ~0.063 of dX/dz.
      waves: [
        { a: 96, w: 0.00031, p: 0 },
        { a: 34, w: 0.00097, p: 2.4 },
      ],
      // Dog-legs come from the zones that turn — see `bend` below. dX/dz peaks
      // at 1.5·dx/width per bend and the sines add on top, so each is kept at
      // ~0.52 to stay clear of the 0.8 shear limit.
      bends: [],
    },
    // The rail climbs over the pass and sheds it again on the way to the shelf;
    // both come from zone `climb`. Base 52 is 6 m above the floor of the offset
    // box, which is as low as the rail can sit over a surface at y = 0.
    y: { base: 52, waves: [{ a: 11, w: 0.00037, p: 1.4 }], bends: [] },
  },

  // Lengths must tile [zStart, zEnd] exactly — 10560 m. `blend` is the
  // transition *into* each zone, so a long blend before a short zone is a long
  // approach to a brief moment, which is the whole shape of the slot.
  zones: [
    // Open ice, a low rim you can see over. 4.3 s before it starts closing.
    { kind: 'basin', len: 2180, inner: 620, wallH: 150, relief: 0.48 },
    // 1400 m of tightening — the longest single gesture in the level.
    { kind: 'reach', len: 1680, blend: 1400, inner: 240, wallH: 430 },
    // The slot. 200 m held = 1.1 s, and it turns while you are in it.
    { kind: 'narrows', len: 900, blend: 900, inner: 128, wallH: 620, bend: { dx: 220, width: 640 } },
    // Release. The one place with room to fight.
    { kind: 'basin', len: 1200, blend: 500, inner: 480, wallH: 300 },
    // The pass: tight, tall, and 160 m above the ice you were flying on.
    { kind: 'gorge', len: 1500, blend: 800, inner: 200, wallH: 560, climb: 160, bend: { dx: -270, width: 780 } },
    // 150 m held = 0.86 s. The tightest thing in either level.
    { kind: 'narrows', len: 800, blend: 400, inner: 135, wallH: 640, bend: { dx: 190, width: 620 } },
    // Down onto the shelf, wide open for the commander.
    { kind: 'basin', len: 2300, blend: 900, inner: 560, wallH: 220, relief: 0.50, climb: -160 },
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

  // Placed per zone, because `u` is an absolute offset from the rail: a group
  // spread over the whole level puts the same sérac on open ice in one place and
  // halfway up a wall in another.
  islands: {
    seed: 'fichina:ice-2',
    groups: [
      // séracs, on the three wide floors that have room to calve onto
      { n: 12, z: [400, -1400], u: [90, 540], r: [24, 62], h: [12, 38], pow: [1.1, 1.8] },
      { n: 6, z: [-4200, -5000], u: [80, 420], r: [22, 54], h: [10, 30], pow: [1.1, 1.8] },
      { n: 10, z: [-7900, -9600], u: [70, 480], r: [22, 58], h: [10, 32], pow: [1.1, 1.8] },
      // pressure ridges: long low welts across the open ice
      { n: 8, z: [-4200, -5100], u: [0, 380], r: [120, 260], h: [5, 14], pow: [2.4, 3.8], flat: 1 },
      { n: 7, z: [-8000, -9700], u: [0, 440], r: [130, 280], h: [6, 15], pow: [2.4, 3.8], flat: 1 },
    ],
    // Nunataks — bare rock through the ice, in the two tight zones. Offset to
    // one side of the rail and clear of the ±105 m offset box on the other, so
    // each is threaded rather than dodged, the way Corneria's narrows stacks are.
    fixed: [
      { z: -3600, u: -44, r: 34, h: 210, pow: 1.2 },
      { z: -3760, u: 50, r: 30, h: 185, pow: 1.2 },
      { z: -7020, u: 58, r: 30, h: 260, pow: 1.2 },
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

/* ── Sector Ω ─────────────────────────────────────────────────────────────── */
//
// The first world in the game that is not a corridor. `backend: 'field'` means
// no heightfield: no terrain mesh, no surface plane, no baked shore or horizon,
// and no floor — `groundAt` answers -Infinity. What is around the rail is a few
// thousand discrete bodies, including overhead, which is the one thing a
// single-valued heightfield can never produce at any parameter value.
//
// Almost nothing here is a cross-section, because there is no cross-section.
// `keys` still exists because `profileAt` is called by code that does not know
// which backend is live; it is one flat entry and nothing samples it for height.

export const DNA_SECTOR_OMEGA = {
  id: 'omega',
  seed: 'omega:belt-1',
  length: 9000,
  zStart: 720,
  zEnd: -9840,
  waterLevel: 0,
  surface: 'none',
  backend: 'field',

  centreline: {
    // A belt has no walls to shear against, so the rail can turn harder than
    // the 0.8 limit that binds a corridor — nothing here is sampled on a
    // rail-aligned grid. Kept moderate anyway: at 175 m/s the turn is felt.
    x: {
      waves: [
        { a: 260, w: 0.00041, p: 0.4 },
        { a: 95, w: 0.00119, p: 2.1 },
        { a: 38, w: 0.00287, p: 1.2 },
      ],
      bends: [],
    },
    // The rail rolls through the belt plane instead of sitting on a floor — but
    // the swing must stay inside what the offset box can absorb. Authored first
    // at ±164 (a 251 m swing) on the reasoning that a belt has no ground to
    // limit it; measured, that put every contact permanently out of reach,
    // because a craft placed against the rail 1500 m ahead arrives where the
    // rail has since moved 100 m and the box only reaches +78/-46. 92 m of
    // swing is still 2.7x Corneria's 34 and costs nothing.
    y: { base: 0, waves: [{ a: 34, w: 0.00052, p: 0.7 }, { a: 12, w: 0.00131, p: 2.6 }], bends: [] },
  },

  belt: {
    chunkLen: 620,
    perChunk: 52,
    clear: 165,
    radius: 1700,
    nearHalf: 560,
    // Flattened, so it reads as a plane of debris you fly through rather than a
    // tube you fly down — a tube would be a canyon again, in rock.
    flatten: 0.52,
    size: [16, 120],
    shapes: 7,
    nearFade: 3400,
    farFade: 7400,
  },

  // One entry, never interpolated against anything. See the note above.
  keys: [
    { z: 720, inner: 400, bed: 0, beachW: 40, beachH: 0, shelfW: 40, shelfH: 0, cliffW: 40, wallH: 0, relief: 0 },
    { z: -9840, inner: 400, bed: 0, beachW: 40, beachH: 0, shelfW: 40, shelfH: 0, cliffW: 40, wallH: 0, relief: 0 },
  ],

  city: null,
  islands: null,

  lithology: {
    // Chondrite: dark, iron-stained, with a bright plagioclase vein set. Value
    // range is deliberately low — a rock lit only by a sun and a nebula has no
    // sky fill to lift its shadow side, so the albedo has to stay off the floor.
    base: [0.186, 0.170, 0.158],
    members: [
      { color: [0.252, 0.208, 0.166], k: 0.80, in: [0.04, 0.12], out: [0.20, 0.32] },
      { color: [0.140, 0.136, 0.144], k: 0.70, in: [0.36, 0.44], out: [0.52, 0.60] },
      { color: [0.300, 0.286, 0.268], k: 0.75, in: [0.64, 0.72], out: [0.79, 0.88] },
      { color: [0.196, 0.118, 0.086], k: 0.55, in: [0.90, 0.95], out: [0.99, 1.00] },
    ],
  },
};

export const DNA_BY_ID = {
  corneria: DNA_CORNERIA,
  fichina: DNA_FICHINA,
  omega: DNA_SECTOR_OMEGA,
};
