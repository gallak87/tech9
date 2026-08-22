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
 * @property {'water'|'ice'|'lava'|'none'} surface
 * @property {'sedimentary'|'glacial'|'volcanic'} [surfaceKind]  wall material and structure
 * @property {Object|null} [canopy]          lid over the corridor; see canopy.js
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
  works: null,
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
    // The pass. The rail climbs 160; the floor climbs with it, or this is not a
    // pass but the same ice seen from higher up. Asymmetric: a sheer face to
    // port, and to starboard a hanging bench at 200 that runs 340 m before the
    // outer wall resumes — the shoulder a glacier leaves when a tributary joins
    // above the trunk.
    {
      kind: 'gorge', len: 1500, blend: 800, inner: 200, wallH: 560, climb: 160,
      bend: { dx: -270, width: 780 },
      section: [
        [-1150, 695], [-520, 620], [-300, 450], [-165, 153], [0, 138],
        [175, 151], [300, 273], [640, 281], [1150, 685],
      ],
    },
    // 150 m held = 0.86 s. The tightest thing in either level, and it is still
    // up at pass height: the descent belongs to the zone that carries the
    // -160, not to the gap between them.
    {
      kind: 'narrows', len: 800, blend: 400, inner: 135, wallH: 640,
      bend: { dx: 190, width: 620 },
      section: [
        [-1150, 760], [-430, 690], [-215, 500], [-135, 145], [0, 130],
        [140, 143], [220, 510], [440, 700], [1150, 770],
      ],
    },
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
// Almost nothing here is a cross-section, because there is no cross-section:
// `profile.js` supplies a flat stand-in for any backend that omits `keys`.

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

/* ── The Foundry ──────────────────────────────────────────────────────────── */
//
// `backend: 'works'` — a corridor through something that was built. The third
// composition in the game and the first that is not natural rock: flat plate,
// right angles, a deck underfoot, and roofs and gantries overhead for stretches
// at a time. Enclosure is the axis neither of the other backends can reach — the
// heightfield is single-valued so it can never put anything above the rail, and
// a belt's bodies always leave sky between them.
//
// No `keys`, no `bands`, no `islands`, no `palette`: nothing here samples a
// height field. The only fields that matter are the rail and `works`.

export const DNA_FOUNDRY = {
  id: 'foundry',
  seed: 'foundry:build-1',
  length: 9000,
  zStart: 720,
  zEnd: -9840,
  waterLevel: 0,
  surface: 'none',
  backend: 'works',

  centreline: {
    // Long and shallow. A built corridor should read as *surveyed* — the meander
    // is what the builders had to route around, not a river's wander — so the
    // amplitude is under half Corneria's and there are no fast terms at all.
    x: {
      waves: [
        { a: 150, w: 0.00036, p: 1.1 },
        { a: 44, w: 0.00092, p: 2.8 },
      ],
      bends: [],
    },
    // Barely moves. The deck is flat and the roof is at a fixed height, so a
    // rail that wandered vertically would clip both.
    y: { base: 46, waves: [{ a: 9, w: 0.00048, p: 0.5 }], bends: [] },
  },

  works: {
    chunkLen: 520,
    half: 190,
    deckY: -26,
    roofY: 190,
    portW: 128, portH: 96, portY: 96,
    greebles: 7,
  },

  lithology: { base: [0.20, 0.21, 0.23], members: [] },
};

/* ── Aquas ────────────────────────────────────────────────────────────────── */
//
// The first world with no sky. `surface: 'none'` on a `terrain` backend is the
// combination neither of the first four levels used: there is a heightfield and
// no plane over it, so the floor of the corridor IS the ground and the volume
// above it is water rather than air. Everything that says "underwater" is
// therefore lighting and one piece of geometry — dense teal extinction, a sun
// high enough to throw shafts down into frame, and `canopy` (see canopy.js), the
// sea surface at y = 620. That lid is what the level has that a canyon cannot:
// a ceiling you can see, over an open corridor. The rail starts above it and
// crosses it once, so the same plane is floor for the first 1.5 km and lid for
// the rest — `railOverSurface` is what decides which.
//
// The cross-section is the opposite of Corneria's: low walls, wide floor, and
// the vertical carried by free-standing pinnacles instead of by the banks. A
// reef is a plain with towers on it.

export const DNA_AQUAS = {
  id: 'aquas',
  seed: 'aquas:reef-1',
  length: 9000,
  zStart: 720,
  zEnd: -9840,
  waterLevel: 0,
  surface: 'none',
  surfaceKind: 'sedimentary',

  // The lid, in world Y. Read by canopy.js and by `ceilingAt`.
  //
  // 620 is set against the tallest wall in the level (620 in the second
  // narrows), not against the rail: at 330 the lid sat ON the rim of every
  // zone past the shelf and the level read as a cave rather than as a sea. It
  // has to clear the highest thing that can stand under it, or there is no
  // water between the two and nothing says which one is the surface.
  canopy: { y: 620, half: 9000, tint: [0.20, 0.62, 0.66], sunTint: [1.30, 1.80, 1.72] },

  centreline: {
    // Wider and lazier than a river: water carves a reef pass by dissolving it,
    // not by cutting down a gradient, so the meander has no short terms.
    x: {
      waves: [
        { a: 185, w: 0.00043, p: 1.4 },
        { a: 62, w: 0.00121, p: 0.3 },
      ],
      bends: [],
    },
    // 710 starts the level 90 m ABOVE the sea surface at 620, which is what
    // makes the opening a flight over water rather than under it: past `PIERCE`
    // the canopy answers `groundAt` instead of `ceilingAt`. Zone 1 spends the
    // whole 648 back down, leaving the rest of the level at the 62 it has always
    // flown — headroom rather than altitude, since the drop-off takes the rail
    // 30 down and the offset box has to clear a bed at -58.
    y: { base: 710, waves: [{ a: 13, w: 0.00039, p: 2.1 }], bends: [] },
  },

  zones: [
    // The approach, flown at 710 over a sea at 620. The shelf below is 700 m
    // down through teal extinction, so this section is not what is being
    // looked at: it exists to carry the bank-620 emplacements at z -400 and to
    // give the surface something to be a surface OVER. The terrace beat is the
    // next zone, where the rail is among it.
    {
      kind: 'basin', len: 2100, inner: 640, bed: 26, wallH: 120, relief: 0.80,
      section: [
        [-900, 124], [-730, 50], [-555, 47], [-350, -6], [0, -26],
        [395, -9], [600, 34], [790, 31], [900, 116],
      ],
    },
    // The plunge, and the terraces it levels out among. 648 m over the 1100 m
    // blend, so the rail crosses the sea surface at 620 partway down and
    // everything after this is flown under it. The dive is the only place the
    // canopy is passable: `railOverSurface` stops flooring and starts lidding
    // across it.
    //
    // The held section runs from the key the dive ends on, so the benches
    // arrive as the ship levels out. Two a side at different depths and
    // unequal across the channel — matched benches read as one shape mirrored.
    // Port tops 118 and starboard 78 against a rail at 62, so both stand ABOVE
    // the ship and it flies between them rather than over them. Both banks
    // fall away past the benches: leaving the outermost points high puts a wall
    // back on each side, which is the shape the benches exist to break.
    //
    // `relief` comes down with them. The noise gate opens past the
    // second-outermost point on each bank and rebuilds a skyline out there
    // whatever the polyline says.
    {
      kind: 'reach', len: 1600, blend: 1100, inner: 300, bed: 34, wallH: 320, relief: 0.22,
      climb: -648,
      section: [
        [-880, -52], [-560, 96], [-300, 118], [-165, -6], [0, -30],
        [150, -22], [280, 78], [470, 70], [860, -56],
      ],
    },
    // The swim-through. 760 m, and it turns inside it.
    { kind: 'narrows', len: 760, blend: 700, inner: 150, wallH: 480, bend: { dx: 210, width: 600 } },
    // The drop-off, and the one asymmetric cross-section in the game: reef wall
    // to port, and to starboard the shelf simply ends. The rail follows the
    // floor down — the one descent that is not a hop.
    //
    // `surface: 'none'` is what makes the starboard side legal: with no plane
    // at y = 0 there is nothing to clamp the negative heights to, and `groundAt`
    // answers bare `terrainHeight`. On a water level the same section would be
    // invisible below the waterline.
    {
      kind: 'basin', len: 1700, blend: 700, inner: 700, bed: 58, wallH: 90, relief: 0.66, climb: -30,
      section: [
        [-980, 300], [-640, 208], [-330, 58], [-120, -30], [0, -58],
        [210, -96], [470, -190], [700, -300], [980, -420],
      ],
    },
    // The trench, which the rail descends into rather than crosses.
    //
    // Both carry a section rather than band fields because of that descent. A
    // generated section pins the bank line at height 0 whatever `bed` is, so
    // deepening the trough alone drops the floor and leaves the shoulders, and
    // a rail coming down into it loses the corridor it needs.
    //
    // Two things constrain the walls from opposite sides. They have to stand
    // high enough that the lid stops being the thing overhead, and they have to
    // stop short of the lid at 620 — terrain through the sea surface is the one
    // place this level cannot explain itself. The outermost point is the one
    // that decides it: `wm` scales that point alone and the relief bands stack
    // past the one inboard of it, so what the terrain reaches is well above what
    // is written here and is read from `tools/lid.mjs --audit` rather than
    // inferred.
    {
      kind: 'gorge', len: 1500, blend: 800, inner: 210, wallH: 455, relief: 0.30,
      climb: -55, bend: { dx: -250, width: 720 },
      section: [
        [-900, 500], [-380, 470], [-205, 60], [-140, -100], [0, -125],
        [190, -105], [330, 20], [560, 300], [900, 440],
      ],
    },
    {
      kind: 'narrows', len: 700, blend: 400, inner: 140, wallH: 530, relief: 0.30,
      section: [
        [-880, 530], [-420, 430], [-215, 20], [-130, -95], [0, -125],
        [140, -100], [240, 40], [430, 440], [880, 530],
      ],
    },
    // Back onto the shelf, wide open, and the rail climbs out of the trench —
    // the -30 of the drop-off and the -55 into the trench, together.
    { kind: 'basin', len: 2200, blend: 900, inner: 620, bed: 30, wallH: 160, relief: 0.76, climb: 85 },
  ],

  bands: {
    // A drowned shelf is not weathered by rain, so the skyline terms that carve
    // a rim into a canyon do almost nothing here. What is left is macro swell
    // and a strong crag band: coral heads, not ridgelines.
    far: { scale: 1 / 21000, amp: 380, pow: 1.4, bias: 0.30, from: 1600, to: 4000 },
    macro: { scale: 1 / 15000, amp: 210 },
    range: { scale: 1 / 6400, amp: 190, pow: 1.6, bias: 0.32, lambda: 268 },
    hill: { scale: 1 / 3900, amp: 132, lambda: 128 },
    fine: { scale: 1 / 1900, amp: 74, lambda: 82 },
    // Loudest crag band of any level. Coral is accreted, not eroded — the floor
    // of a reef pass is knobbly at every scale, and with the sun 60 degrees up
    // there is no long shadow to give a smooth floor form instead.
    crag: { scale: 1 / 1180, amp: 104, bias: 0.34, lambda: 62 },
    warp: { scale: 1 / 7600, amp: 300, shear: 0.7 },
    jitter: { a: 74, b: 26 },
    side: { scale: 1 / 5200, base: 0.62, amp: 0.70 },
    relief: { base: 0.62, far: 1.7, from: 350, to: 2800 },
  },

  city: null,

  // Pinnacles, not islands. `spire` and a low `pow` are what make a stack that
  // stands up out of a flat floor instead of a hill that pokes through it.
  islands: {
    seed: 'aquas:reef-2',
    groups: [
      // coral heads on the shelf: broad, rounded, in the shallows either side
      { n: 16, z: [500, -1900], u: [120, 600], r: [40, 130], h: [18, 74], pow: [1.6, 2.8] },
      // …and on the CHANNEL FLOOR, close in. The cross-section makes a smooth
      // bed and the relief bands only reach past the cliff top, so scatter is
      // the only thing that can put form on the ground you fly over. Kept under
      // 40 m tall so nothing here is an obstacle the rail did not author.
      { n: 26, z: [400, -9600], u: [0, 210], r: [26, 74], h: [9, 34], pow: [1.5, 2.6] },
      { n: 22, z: [-500, -9600], u: [140, 420], r: [30, 96], h: [12, 46], pow: [1.5, 2.6] },
      // the drop-off garden: tall thin towers, close to the rail
      { n: 11, z: [-5000, -6500], u: [80, 460], r: [22, 58], h: [70, 210], pow: [1.05, 1.35], spire: 1 },
      // rubble aprons on the far shelf
      { n: 13, z: [-8200, -9700], u: [60, 520], r: [80, 220], h: [6, 20], pow: [2.2, 3.4], flat: 1 },
    ],
    // Two pinnacles in the swim-through, one either side, threaded not dodged.
    fixed: [
      { z: -3620, u: -48, r: 30, h: 260, pow: 1.1, spire: 1 },
      { z: -3880, u: 54, r: 26, h: 235, pow: 1.1, spire: 1 },
      { z: -7480, u: 60, r: 28, h: 300, pow: 1.1, spire: 1 },
    ],
  },

  palette: {
    // Under 2 km of teal extinction every hue collapses toward the fog, so the
    // albedo is authored WARM and lets the water do the tinting. A rock painted
    // blue-green here arrives at the eye as one flat wash with the haze.
    rock: [0.90, 0.86, 0.76],
    // Carbonate sand is bright in air and this is not air. Authored at 1.72 it
    // composited as a snowfield: the floor is the largest lit area in frame and
    // the sun is nearly overhead, so it is the one surface with no extinction
    // between it and the key light.
    sand: [1.16, 1.10, 0.94],
    scrub: [0.32, 0.64, 0.44],
    dry: [1.10, 0.98, 0.68],
    pale: [1.12, 1.08, 0.96],
    urban: [0.90, 0.89, 0.86],
    moss: [0.28, 0.56, 0.46],
    // Heavy on the algal terms: a reef floor is either living or it is
    // carbonate sediment, and there is nothing dry about any of it.
    amount: { pale: 0.8, dry: 0.35, veg: 1.35, moss: 1.15, sand: 0.85, urban: 0 },
  },

  lithology: {
    // Reef limestone: cream carbonate with algal green in the recesses and a
    // dark drowned member near the floor. Values run higher than any other
    // level's stone because extinction takes most of it back before the eye.
    base: [0.252, 0.242, 0.206],
    members: [
      { color: [0.318, 0.302, 0.254], k: 0.82, in: [0.04, 0.12], out: [0.20, 0.32] },
      { color: [0.146, 0.196, 0.152], k: 0.70, in: [0.36, 0.44], out: [0.52, 0.62] },
      { color: [0.342, 0.335, 0.288], k: 0.78, in: [0.64, 0.72], out: [0.80, 0.88] },
      { color: [0.092, 0.114, 0.120], k: 0.55, in: [0.90, 0.95], out: [0.99, 1.00] },
    ],
  },
};

/* ── Fortuna ──────────────────────────────────────────────────────────────── */
//
// Night, and the only level lit from the ground up by something alive. The
// surface is water at y = 0 — the same mesh, the same reflector and the same
// shader Corneria uses — but under an aurora instead of a sun it is a black
// mirror, and the reflection is doing the work an ordinary sky-lit river never
// asks of it.
//
// Composition: a wide flooded valley with glow-stalks standing out of it. The
// `islands` table is unusually large because the stalks ARE the level; the walls
// are deliberately low and soft so nothing competes with them for the vertical.

export const DNA_FORTUNA = {
  id: 'fortuna',
  seed: 'fortuna:glow-1',
  length: 9000,
  zStart: 720,
  zEnd: -9840,
  waterLevel: 0,
  surface: 'water',
  surfaceKind: 'sedimentary',

  // The ground is a light source. Radiance, not colour — these run past 1 so
  // the bloom threshold finds them, and they are the brightest thing in the
  // level by a wide margin because the sun here delivers 1.15.
  glow: {
    color: [0.26, 1.45, 1.05],     // the mat: cyan-green
    color2: [0.78, 0.30, 1.30],    // the second colony: violet
    amount: 3.6,
    // Full at the waterline, gone by the stalk tops. A skyline that glows has
    // no silhouette, and the silhouette is what makes a stalk read as a stalk.
    height: [40, 340],
    pulse: 0.55,
  },

  centreline: {
    x: {
      waves: [
        { a: 240, w: 0.00048, p: 2.6 },
        { a: 84, w: 0.00139, p: 0.8 },
        { a: 26, w: 0.00352, p: 1.9 },
      ],
      bends: [],
    },
    y: { base: 46, waves: [{ a: 14, w: 0.00045, p: 0.2 }, { a: 6, w: 0.00128, p: 1.6 }], bends: [] },
  },

  zones: [
    // The lagoon. Low banks, long sightlines, the stalk field either side.
    { kind: 'basin', len: 2400, inner: 600, bed: 14, wallH: 180, relief: 0.75 },
    { kind: 'reach', len: 1600, blend: 1200, inner: 320, bed: 17, wallH: 380 },
    // The glade: a clearing in the stalks, and the one place to fight in. Raised
    // onto a mat plateau at 110, which is inside the stalks' own 90-320 rather
    // than under them — this level's two layers are heights, not sides of a
    // surface. The floor climbs with the rail; a rail climbing alone would be
    // the same lagoon seen from higher up.
    {
      kind: 'basin', len: 1500, blend: 600, inner: 540, bed: 15, wallH: 240, relief: 0.70, climb: 130,
      section: [
        [-1200, -30], [-880, -10], [-620, 30], [-330, 104], [0, 112],
        [340, 106], [640, 26], [900, -14], [1200, -34],
      ],
    },
    // Off the plateau and down into the understory: the same -130 the glade
    // climbed, so the gorge floor is back at lagoon level and dark.
    { kind: 'gorge', len: 1500, blend: 800, inner: 220, bed: 22, wallH: 520, climb: -130, bend: { dx: -240, width: 700 } },
    { kind: 'basin', len: 1300, blend: 600, inner: 500, bed: 16, wallH: 260, relief: 0.68 },
    { kind: 'narrows', len: 700, blend: 400, inner: 145, bed: 24, wallH: 600, bend: { dx: 200, width: 640 } },
    { kind: 'basin', len: 1560, blend: 800, inner: 620, bed: 15, wallH: 200, relief: 0.72 },
  ],

  bands: {
    // Wet, forested, deeply weathered: rounded at every scale. `crag` is the
    // one band held down, because a sharp edge is what this rock does not have.
    far: { scale: 1 / 19000, amp: 540, pow: 1.4, bias: 0.32, from: 1400, to: 3600 },
    macro: { scale: 1 / 13000, amp: 320 },
    range: { scale: 1 / 6100, amp: 230, pow: 1.5, bias: 0.34, lambda: 280 },
    hill: { scale: 1 / 4100, amp: 110, lambda: 136 },
    fine: { scale: 1 / 2050, amp: 46, lambda: 88 },
    crag: { scale: 1 / 1480, amp: 20, bias: 0.50, lambda: 76 },
    warp: { scale: 1 / 8200, amp: 340, shear: 0.7 },
    jitter: { a: 58, b: 20 },
    side: { scale: 1 / 5600, base: 0.66, amp: 0.64 },
    relief: { base: 0.50, far: 2.1, from: 380, to: 3000 },
  },

  city: null,

  islands: {
    seed: 'fortuna:stalks-1',
    groups: [
      // the stalk field: hundreds of metres of thin towers either side of the
      // lagoon, close enough to the rail to pass between
      { n: 22, z: [600, -2600], u: [110, 620], r: [16, 44], h: [90, 300], pow: [1.02, 1.28], spire: 1 },
      { n: 14, z: [-4000, -5400], u: [90, 520], r: [16, 40], h: [80, 260], pow: [1.02, 1.28], spire: 1 },
      { n: 18, z: [-7600, -9700], u: [100, 640], r: [16, 46], h: [95, 320], pow: [1.02, 1.28], spire: 1 },
      // cap mounds under them — the mycelial mat the stalks come out of
      { n: 15, z: [-1000, -9500], u: [60, 560], r: [70, 190], h: [8, 26], pow: [2.4, 3.6], flat: 1 },
    ],
    fixed: [
      { z: -6820, u: -50, r: 24, h: 330, pow: 1.05, spire: 1 },
      { z: -7060, u: 56, r: 22, h: 295, pow: 1.05, spire: 1 },
    ],
  },

  palette: {
    // Almost no light from above, so albedo alone decides what the ground-glow
    // picks out. `scrub` and `moss` are the luminous terms and they are pushed
    // past 1 on the green-blue axis; `rock` sits low so the mat reads against
    // wet black stone rather than against grey.
    rock: [0.52, 0.58, 0.62],
    sand: [0.72, 0.80, 0.78],
    scrub: [0.36, 1.20, 0.98],
    dry: [0.86, 0.52, 1.06],
    pale: [0.78, 0.94, 1.02],
    urban: [0.90, 0.89, 0.86],
    moss: [0.30, 0.96, 0.84],
    amount: { pale: 0.8, dry: 0.9, veg: 1.5, moss: 1.4, sand: 0.4, urban: 0 },
  },

  lithology: {
    // Wet basalt-grey stone with two living members through it: a cyan mat in
    // the damp band and a violet bloom above it. The dark base is most of the
    // wall by area, which is what keeps the two live members reading as light.
    base: [0.086, 0.104, 0.116],
    members: [
      { color: [0.106, 0.188, 0.196], k: 0.80, in: [0.05, 0.14], out: [0.22, 0.34] },
      { color: [0.078, 0.260, 0.232], k: 0.72, in: [0.36, 0.44], out: [0.52, 0.62] },
      { color: [0.176, 0.098, 0.216], k: 0.70, in: [0.66, 0.73], out: [0.80, 0.88] },
      { color: [0.052, 0.062, 0.074], k: 0.55, in: [0.91, 0.95], out: [0.99, 1.00] },
    ],
  },
};

/* ── Venom ────────────────────────────────────────────────────────────────── */
//
// `surface: 'lava'` — the third surface material, alongside water and ice, and
// the first one that is a light source. The molten channel at y = 0 is the key
// light for the whole level: the sun is 3.5 degrees off the horizon through an
// ash column and contributes almost nothing, so the walls are lit from
// underneath by the river they stand over.
//
// `surfaceKind: 'volcanic'` — the third wall structure. Sedimentary bands run
// horizontally and glacial foliation runs across the channel; columnar jointing
// runs VERTICALLY and is cellular rather than layered, because basalt columns
// grow perpendicular to the cooling front. That is the one axis the other two
// structures cannot reach, and it is why the walls here do not read as either.

export const DNA_VENOM = {
  id: 'venom',
  seed: 'venom:magma-1',
  length: 9000,
  zStart: 720,
  zEnd: -9840,
  waterLevel: 0,
  surface: 'lava',
  surfaceKind: 'volcanic',

  // Higher and wider than the default lens, and looking less far ahead. A level
  // whose opening is a ridge is read across the corridor, not down it: at
  // `camUp` 3.15 with 46 m of look-ahead the frame is filled by whatever stands
  // at the end of the channel, and the flanks falling away either side of the
  // ship — the whole point of an inverted section — leave the bottom of frame.
  camera: { up: 9, back: 21, lookAhead: 38, lookUp: 0, fov: 66 },

  centreline: {
    // A lava channel follows the steepest line it burned for itself: straighter
    // than a river, and what turning it does is abrupt. Hence small sines and
    // the work carried by the zone dog-legs.
    x: {
      waves: [
        { a: 118, w: 0.00037, p: 0.6 },
        { a: 41, w: 0.00108, p: 2.9 },
      ],
      bends: [],
    },
    // 380 is the crest, not the channel. The caldera rim stands at 330 and the
    // rail rides 50 m over it; everything after the rim descends off it, which
    // is what makes the first zone a summit rather than a bump. `surface: lava`
    // clamps `groundAt` at y = 0, so the floor of every later zone is the lava
    // plane and the rail can never come below the offset box's 46 m — the
    // descents below bottom out at 80.
    y: { base: 400, waves: [{ a: 12, w: 0.00041, p: 1.1 }], bends: [] },
  },

  // The rail ledger, which is the level's rhythm:
  //   400 rim  -320-> 80 channel/tube  +130-> 210 vent  -130-> 80 gorge/narrows
  //   +20-> 100 sump
  // Every zone carries a section: the four stock kinds are the valley grammar
  // this level is supposed to be the counter-example to.
  zones: [
    // The caldera rim: an inverted cross-section, so the ground falls away from
    // the rail instead of rising to meet it. The crest is at 330 with the rail
    // 50 m over it, and the flanks cross the lava plane at u = -430 and +455 —
    // everything past that is lake, because `groundAt` clamps at y = 0.
    //
    // The crossing has to clear the chase camera, not the ship. The camera
    // trails 21 m behind and below and banks with the roll, so it leaves the
    // 105 m offset box: a crossing at 215 m put it in the lava.
    //
    // The crest sits 70 m under the rail against a 46 m offset box, which is
    // also what keeps the spatter cones on the flanks clear of it.
    {
      // `relief` is the reason an inverted section still reads as a valley if it
      // is left alone: the relief gate opens past the second-outermost point
      // (here 830 m) and the noise bands build a skyline out there regardless
      // of what the polyline says. A spine has nothing standing around it, so
      // the band has to come down with the section.
      kind: 'basin', len: 1900, inner: 520, bed: 22, wallH: 260, relief: 0.14,
      section: [
        [-1200, 190], [-830, -80], [-430, 0], [-190, 250], [0, 330],
        [215, 262], [455, 0], [860, -85], [1200, 205],
      ],
    },
    // Off the crest and into the channel: 300 m over a 600 m blend, the steepest
    // descent in the game after Aquas' plunge. The blend is short because it
    // also runs between an inverted section and an upright one — the
    // interpolation passes through flat, and flat here is the lava plane, so a
    // long blend leaves the spine awash for the length of it.
    {
      kind: 'reach', len: 1400, blend: 600, inner: 260, bed: 26, wallH: 480, relief: 0.34,
      climb: -320,
      section: [
        [-1150, 560], [-700, 470], [-370, 150], [-185, 10], [0, -30],
        [195, 14], [390, 165], [740, 480], [1150, 570],
      ],
    },
    // The tube — a collapsed lava run, and the first half of "out, in, out".
    // Walls stand 340 m over the rail from only 250 m out, which is the whole
    // read: no room, and as close to no sky as a single-valued height field can
    // manage. The blends either side are short so the held stretch is 700 m
    // rather than the 150 m it was; a tube you are inside for under a second is
    // a texture change, not a beat.
    {
      kind: 'narrows', len: 1100, blend: 400, inner: 140, bed: 34, wallH: 700, relief: 0.50,
      bend: { dx: 200, width: 620 },
      section: [
        [-1100, 720], [-540, 660], [-250, 420], [-150, 20], [0, -30],
        [160, 16], [265, 440], [580, 680], [1100, 740],
      ],
    },
    // Out. The rail climbs 160 back out of the tube over 400 m — 32 degrees, and
    // the only place in the game the corridor opens upward faster than it
    // closes. Every wall here tops out BELOW the rail, so the frame is sky and
    // the plug domes are underneath: the one zone on this level flown over
    // rather than through.
    {
      kind: 'basin', len: 1300, blend: 400, inner: 460, bed: 24, wallH: 380, relief: 0.10,
      climb: 130,
      section: [
        [-1200, 30], [-830, 95], [-520, 70], [-270, 20], [0, -16],
        [290, 14], [560, 85], [930, 110], [1200, 40],
      ],
    },
    // In again, and asymmetric this time so it is not the tube twice: port
    // closes to 320 at 270 m while starboard is still open at 220.
    {
      kind: 'gorge', len: 1600, blend: 800, inner: 200, bed: 30, wallH: 620, relief: 0.50,
      climb: -130, bend: { dx: -260, width: 760 },
      section: [
        [-1150, 780], [-600, 720], [-270, 320], [-150, 14], [0, -30],
        [200, 0], [440, 220], [830, 600], [1150, 700],
      ],
    },
    // Tightest walls in the game outside the Foundry, and held for 170 m.
    {
      kind: 'narrows', len: 660, blend: 380, inner: 130, bed: 34, wallH: 720, relief: 0.52,
      section: [
        [-1080, 800], [-500, 740], [-215, 500], [-125, 18], [0, -32],
        [135, 14], [230, 520], [560, 760], [1080, 820],
      ],
    },
    // Out, and stays out: the sump is where the river pools and where the
    // fortress sits, so it has to be the widest thing since the rim.
    {
      kind: 'basin', len: 2600, blend: 600, inner: 600, bed: 28, wallH: 300, relief: 0.42,
      climb: 20,
      section: [
        [-1200, 330], [-790, 225], [-450, 70], [-230, -8], [0, -34],
        [255, -6], [490, 80], [840, 245], [1200, 340],
      ],
    },
  ],

  bands: {
    // Young volcanic rock has had no time to be rounded: every band above the
    // rim runs sharper and shorter than Corneria's, and `crag` is the loudest
    // it is anywhere in the game.
    far: { scale: 1 / 24000, amp: 700, pow: 1.7, bias: 0.24, from: 1500, to: 4000 },
    macro: { scale: 1 / 14000, amp: 280 },
    range: { scale: 1 / 6200, amp: 300, pow: 1.9, bias: 0.26, lambda: 276 },
    hill: { scale: 1 / 3800, amp: 118, lambda: 124 },
    fine: { scale: 1 / 1860, amp: 52, lambda: 78 },
    crag: { scale: 1 / 1320, amp: 78, bias: 0.34, lambda: 66 },
    warp: { scale: 1 / 8600, amp: 220, shear: 0.7 },
    // Raised for the rim. `bankJitter` perturbs the DISTANCE the cross-section
    // is sampled at, so on a steep flank it becomes height — which is the only
    // band that reaches an inverted section at all. The relief and crag gates
    // both open past the section's outer points, and on a ridge those are the
    // lava lakes, not the crest the ship flies over.
    jitter: { a: 84, b: 12 },
    side: { scale: 1 / 5800, base: 0.74, amp: 0.54 },
    relief: { base: 0.52, far: 2.6, from: 380, to: 3200 },
  },

  city: null,

  islands: {
    seed: 'venom:plugs-1',
    groups: [
      // Spatter cones ON the crest, not around it. The relief and crag bands
      // both gate on distance past the section's outer points, so on an inverted
      // section NO noise band reaches the ridge the ship is flying over — the
      // polyline is the whole surface and it renders as a smooth dune. Scatter
      // is the only thing that can put form there. Kept outside the 105 m
      // offset box so none of it is an obstacle the rail did not author.
      { n: 26, z: [640, -1450], u: [150, 470], r: [30, 100], h: [35, 95], pow: [1.5, 2.6] },
      // Plug domes on the vent-chamber floor. Kept under the rail at 210: this
      // is the one zone flown OVER, and a 230 m dome standing next to a rail at
      // 210 puts the walls back that the section just took away.
      { n: 11, z: [-4700, -5900], u: [90, 440], r: [30, 78], h: [40, 150], pow: [1.15, 1.55], spire: 1 },
      // cooled flow lobes across the sump
      { n: 14, z: [-8000, -9700], u: [40, 560], r: [90, 240], h: [5, 18], pow: [2.4, 3.8], flat: 1 },
    ],
    // Two column stacks in the tube, and one in the gorge.
    fixed: [
      { z: -3540, u: -42, r: 32, h: 300, pow: 1.08, spire: 1 },
      { z: -3820, u: 48, r: 28, h: 265, pow: 1.08, spire: 1 },
      { z: -6960, u: 54, r: 30, h: 340, pow: 1.08, spire: 1 },
    ],
  },

  palette: {
    // Basalt is near-black and stays near-black: the level's brightness comes
    // from the river, not from the rock. `dry` is the one hot term — chilled
    // ejecta on the rims, still red — and `pale` is ash, the only light value
    // on the whole wall.
    rock: [0.58, 0.55, 0.54],
    sand: [0.72, 0.66, 0.60],
    scrub: [0.44, 0.30, 0.24],
    // Chilled ejecta, still hot enough to read. Kept to the shoulders by a low
    // `amount` — at 1.2 it covered every bench in the caldera and the level
    // read as red sand rather than as black rock over a red river.
    dry: [1.30, 0.52, 0.20],
    pale: [0.88, 0.84, 0.82],
    urban: [0.90, 0.89, 0.86],
    moss: [0.40, 0.32, 0.28],
    // Every light term is held down, and the reason is the rim. These were set
    // when the crest was a 30 m mound seen edge-on inside a canyon; it is now a
    // 300 m ridge flown along the top of, so the biggest lit surface in the
    // level is a face that used to be a sliver. At the old amounts it composited
    // as a sand dune — the level reading as desert rather than as black rock
    // over a red river, which is the same failure `dry` was already pulled back
    // from once.
    amount: { pale: 0.35, dry: 0.22, veg: 0, moss: 0, sand: 0.28, urban: 0 },
  },

  lithology: {
    // Fresh basalt, scoria and a welded tuff band. The separation is hue and
    // almost no value: a wall lit from below by molten rock has all the value
    // contrast it can carry already, and adding more turns it into soot.
    base: [0.062, 0.056, 0.054],
    members: [
      { color: [0.108, 0.074, 0.062], k: 0.85, in: [0.03, 0.11], out: [0.19, 0.30] },
      { color: [0.046, 0.046, 0.050], k: 0.70, in: [0.38, 0.45], out: [0.50, 0.58] },
      { color: [0.146, 0.108, 0.086], k: 0.78, in: [0.63, 0.70], out: [0.78, 0.86] },
      { color: [0.190, 0.062, 0.034], k: 0.55, in: [0.90, 0.94], out: [0.98, 1.00] },
    ],
  },
};

export const DNA_BY_ID = {
  corneria: DNA_CORNERIA,
  fichina: DNA_FICHINA,
  omega: DNA_SECTOR_OMEGA,
  foundry: DNA_FOUNDRY,
  aquas: DNA_AQUAS,
  fortuna: DNA_FORTUNA,
  venom: DNA_VENOM,
};
