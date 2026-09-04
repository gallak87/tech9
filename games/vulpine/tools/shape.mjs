#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Shape audit — do the levels have different cross-sections, or one?
//
// The acceptance test for PLAN-LEVELS phase 9. Five of seven levels read as the
// same level because the cross-section was a valley by construction; this
// measures whether that is still true, so "they all look like Corneria" is a
// number rather than an opinion.
//
//   node tools/shape.mjs                 the table
//   node tools/shape.mjs --strict        exit 1 on a clash or a regressed brief
//   node tools/shape.mjs --level fortuna
//   node tools/shape.mjs --draw venom    ASCII cross-sections + the rail height
//
// Three things, in increasing strength:
//
//   the twelve-sample table   a picture of the level, printed for reading
//   coverage                  what fraction of the corridor is each shape,
//                             sampled every COVER_STEP metres
//   the four-levels table     each level checked against its row in
//                             PLAN-LEVELS.md, which is the lane's own
//                             acceptance test and which nothing read until now
//
// The middle one exists because the first cannot answer "how much of this
// level". Venom sat marked done for two sessions on twelve samples while 82% of
// it was stock zone kinds; against coverage it reads RIDGE 18% of a required
// 55%, a rail moving 24 m of a required 250, and one monotone run of three.
//
// Sampled in the NEAR FIELD. The ship flies within `boxX` (105 m) of the rail
// and the chase camera sits 17 m behind it, so what reads as "the shape of this
// place" is the first few hundred metres. A 600 m wall is skyline: it is in the
// frame, but it is not the shape you are flying through. Both are reported —
// `near` decides the classification, `far` is printed because a level can be
// flat underfoot and still walled in, which is a different level from one that
// is flat and open.
//
// Classification, against the mean bank height at ±NEAR:
//   RIDGE   centre above the banks — you are on top of something
//   FLAT    banks within FLAT_RISE of the centre — a plain, not a corridor
//   VALLEY  banks above that — the default this lane exists to break
// and independently:
//   asym    the two banks differ by more than ASYM — one wall, one open side
//
// And once per level, from the FLANK pass: whether what stands beside the ship
// is continuous or not.
//   walled    something is up there nearly everywhere — a corridor with sides
//   columns   it comes and goes — a forest, a colonnade, a stack field
//   open      almost nothing stands beside the rail at all
// A cross-section cannot answer this. RIDGE/FLAT/VALLEY read two rays at one z,
// so a trunk 250 m off the rail and a canyon wall 250 m off the rail are the
// same sample; what tells them apart is that a wall is still there 200 m later
// and a trunk is not. Fortuna is 86% FLAT and Corneria is 63% FLAT, and before
// this pass existed those two levels signed identically.
//
// A `works` corridor has no height field and so no cross-section, and for two
// sessions this tool printed one line about it and measured nothing. It is
// measured by the BUILT pass instead, off the same authored profile the world
// is built from: how wide the box is, how far the deck moves, how much of the
// level is roofed and how often that changes, and whether the two flanks are
// the same. Those are the four rows the Foundry's brief actually names.
//
// FLAT and VALLEY are the distinction the first version of this audit missed:
// it had only RIDGE / asym / valley, so it called Fortuna's near-flat lagoon a
// valley and would have had phase 9 author away the one thing already right.
// ─────────────────────────────────────────────────────────────────────────────
import { setActiveDNA, terrainHeight, centrelineX, centrelineY, WORLD } from '../src/world/profile.js';
import { DNA_BY_ID } from '../src/world/dna.js';
import { Works } from '../src/world/works.js';

// The Highlands' campaign id is `highlands` and its DNA key is `fichina`; every
// doc and every probe flag uses the campaign id, so accept it here too.
const DNA_FOR = (id) => DNA_BY_ID[id] ?? DNA_BY_ID[{ highlands: 'fichina' }[id]];

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  if (i === -1) return d;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};
const STRICT = process.argv.includes('--strict');

const NEAR = 250;         // what the ship reads as the shape it is inside
const FAR = 600;          // skyline, reported but not classified on
const FLAT_RISE = 30;     // bank rise, in metres, under which it is a plain
const ASYM = 120;         // bank-to-bank difference that reads as one-sided
const SAMPLES = 12;

// The lateral band searched for something standing beside the ship, and how
// far under the rail it has to reach to count. Inside `boxX` is the ship's own
// lane and past ~800 m is scenery; between the two is what the corridor is
// made of, whether that is rock or props.
const FLANK = [180, 260, 340, 430, 520, 620, 720, 800];
const FLANK_DROP = 40;
// Risings per kilometre above which a flank reads as columns rather than as a
// wall. Measured: 0.09 on all three walled levels, 1.42 on Fortuna.
const FLANK_RUNS = 0.8;
// Occupancy above which a flank reads as walled rather than open.
const FLANK_BESIDE = 0.6;

// Metres between samples for the COVERAGE pass. The twelve above are a picture
// of the level; these are a measurement of it. Twelve samples cannot say how
// much of a corridor is any given shape, and that is the hole this tool sat in
// for two sessions: Venom was 18% authored — eleven seconds of ridge and
// forty-nine of stock zone kinds — and its whole claim to a unique shape set
// rested on the two samples that happened to land inside the authored part.
const COVER_STEP = 40;

// The four-levels table in PLAN-LEVELS.md, which that file calls "the
// acceptance test for the lane" and which nothing read until now.
//
// `done` is the gate. A row marked done must keep meeting its brief or --strict
// fails; a row not yet done prints as outstanding and fails nothing, so this
// stays green on a clean tree and never becomes noise the way a permanently red
// gate does.
//
// Thresholds on a `done` row are set BELOW the measured value, so the row is a
// regression test and not a restatement of today's numbers. Thresholds on an
// `open` row are targets and are expected to fail until that level is authored;
// they fail nothing. The measured values are printed in the coverage table
// above, so a threshold written from intent shows up as a broken row the first
// time it runs — which is how `minRuns: 4` on Venom was caught.
const BRIEF = {
  aquas: {
    done: true,
    row: 'terraced, asymmetric / deep dive',
    // Its signature is the asymmetry: one wall, one open side, at the drop-off.
    // measured: VALLEY 43%, asym 29%, rail moves 759 m in 2 runs
    shape: { kind: 'VALLEY', asym: true, minCover: 0.12 },
    rail: { minRange: 400, minRuns: 2 },
  },
  venom: {
    done: true,
    row: 'inverted, whole level / rhythm',
    // measured: RIDGE 85%, rail moves 366 m in 3 runs (down, up, down)
    shape: { kind: 'RIDGE', minCover: 0.55 },
    rail: { minRange: 250, minRuns: 3 },
  },
  fortuna: {
    done: true,
    row: 'flat and drowned, columnar / level rail',
    // The only level whose corridor is made of props rather than of ground, so
    // `flank` is the row that carries its identity and `FLAT` only says that
    // nothing else does.
    //
    // `maxRange` rather than `minRange`, and it is the one row in this table
    // that asks a rail to stay still. A rail that moves is only felt where
    // something moves with it, and this level's floor is a plane everywhere —
    // 735 m of authored descent read as nothing in frame and spent the pitch
    // budget doing it.
    // measured: FLAT 86%, flank columns at 1.42 starts/km beside 48%,
    // rail moves 0 m
    shape: { kind: 'FLAT', minCover: 0.70 },
    rail: { maxRange: 20 },
    flank: { kind: 'columns', min: 1.0 },
  },
  // The one built level. Its row is checked against the BUILT pass, not against
  // a cross-section it does not have.
  foundry: {
    done: false,
    row: 'escarpment / steep shaft',
    built: {
      // One flank climbing while the other falls, for the exterior run.
      minAsym: 0.20,
      // Roofed for a good part of the level and NOT all of it: "built, varies"
      // is a range with two ends, and a tunnel from end to end fails it exactly
      // as an open trench does.
      minRoofed: 0.30, maxRoofed: 0.80,
      // How often the sky comes and goes, per kilometre.
      minSwitch: 0.4,
      // The box itself has to change shape, or the level is one corridor with
      // different things over it.
      minWidthRange: 150,
    },
    rail: { minRange: 250, minPeak: 30 },
  },
};

// Rail excursion a local extreme has to clear to count as a turn rather than as
// the centreline's own sine term, which is 7-16 m on every level.
const RUN_PROMINENCE = 80;

// Degrees of corridor yaw allowed, anywhere, on any level.
//
// The rail does not turn. The ship's offset box travels with the rail and the
// camera rig is built along the corridor heading, so a corridor at yaw θ hands
// the player a box at θ to the screen: `boxX * cos θ` of screen-lateral, and
// `boxX * sin θ` of the stick's throw spent moving toward and away from the
// camera instead of across it — changing continuously as the meander runs.
// Measured at the 29° the corridors used to reach: 13 m of the 105 gone and
// ±51 m of throw on depth.
//
// Vertical is still authorable, and costs less: the box is 105 wide against
// 78/46 tall, and aiming is mostly horizontal.
const MAX_YAW = 0.5;

// The level the others are being told apart from. Labelled in the output.
const REFERENCE = 'corneria';

// Corneria and the Highlands are ONE landform on purpose. The overland hop
// between them exists to say "further up the same valley" — `campaign.js:39-45`
// — so a shared shape set there is the design, not a defect. Every other pair
// sharing one is a finding.
const ONE_LANDFORM = [['corneria', 'fichina']];

// How far the floor under the rail moves over the whole level. A corridor that
// climbs a pass and drops off it is a different place from one held at a
// constant height, and {RIDGE, FLAT, VALLEY} cannot say so — all three describe
// the cross-section at one z, not where that section sits in the world.
function floorRange() {
  let lo = Infinity, hi = -Infinity;
  const span = WORLD.zStart - WORLD.zEnd;
  for (let q = 0; q <= 80; q++) {
    const z = WORLD.zStart - span * (q / 80);
    const h = terrainHeight(centrelineX(z), z);
    if (h < lo) lo = h;
    if (h > hi) hi = h;
  }
  return hi - lo;
}

/** Fraction of the corridor measuring each shape, and how far the rail moves. */
function coverage() {
  const span = WORLD.zStart - WORLD.zEnd;
  const n = Math.floor(span / COVER_STEP);
  const hits = {};
  for (let q = 0; q <= n; q++) {
    const s = shapeAt(WORLD.zStart - span * (q / n));
    for (const k of [s.kind, s.asym ? 'asym' : null]) if (k) hits[k] = (hits[k] || 0) + 1;
  }
  const cover = {};
  for (const [k, v] of Object.entries(hits)) cover[k] = v / (n + 1);

  // What stands beside the ship, and whether it stops. One pass, two numbers:
  // how much of the level has anything in the flank band at all, and how many
  // times that starts — a wall starts once, a forest starts every few hundred
  // metres. Sampled at the same step as the coverage above.
  let beside = 0, risings = 0, was = false;
  for (let q = 0; q <= n; q++) {
    const z = WORLD.zStart - span * (q / n);
    const cx = centrelineX(z), rail = centrelineY(z);
    let top = -Infinity;
    for (const u of FLANK) {
      const l = terrainHeight(cx - u, z), r = terrainHeight(cx + u, z);
      if (l > top) top = l;
      if (r > top) top = r;
    }
    const on = top > rail - FLANK_DROP;
    if (on) beside++;
    if (on && !was) risings++;
    was = on;
  }

  // Monotone runs in the rail, which is what "rhythm" means and what a single
  // range cannot say: a level that descends 300 m once and one that goes down,
  // up and down again have the same range and are not the same ride.
  const ys = [];
  for (let q = 0; q <= n; q++) ys.push(centrelineY(WORLD.zStart - span * (q / n)));
  let runs = 1, dir = 0, pivot = ys[0];
  for (const y of ys) {
    const d = Math.sign(y - pivot);
    if (d !== 0 && Math.abs(y - pivot) > RUN_PROMINENCE) {
      if (dir !== 0 && d !== dir) runs++;
      dir = d; pivot = y;
    } else if (dir !== 0 && Math.sign(y - pivot) === dir) {
      pivot = y;
    }
  }
  // Steepest the rail ever gets, in degrees. A range says how far it went and
  // runs say how many times it changed its mind; neither says whether it dived
  // or drifted, and "steep shaft" is a claim about exactly that.
  let peak = 0;
  for (let q = 0; q <= n; q++) {
    const z = WORLD.zStart - span * (q / n);
    const g = Math.abs((centrelineY(z + 6) - centrelineY(z - 6)) / 12);
    if (g > peak) peak = g;
  }
  return {
    cover, railRange: Math.max(...ys) - Math.min(...ys), runs,
    railPeak: Math.atan(peak) * 180 / Math.PI,
    beside: beside / (n + 1), flankRuns: risings / (span / 1000),
  };
}

/**
 * The built corridor, at the same step as `coverage`. Everything here comes off
 * the authored `works` profile rather than off geometry, for the reason the
 * whole tool is offline: the numbers that decide the shape are the numbers, and
 * meshing them first only adds a way for the two to disagree.
 */
function built() {
  const span = WORLD.zStart - WORLD.zEnd;
  const n = Math.floor(span / COVER_STEP);
  let roofed = 0, asym = 0, switches = 0;
  let wLo = Infinity, wHi = -Infinity, dLo = Infinity, dHi = -Infinity;
  let was = null;
  for (let q = 0; q <= n; q++) {
    const z = WORLD.zStart - span * (q / n);
    const half = Works.halfAt(z), deck = Works.deckY(z);
    const [rl, rr] = Works.riseAt(z);
    const on = Works.ceilingY(z) !== Infinity;
    if (on) roofed++;
    if (was !== null && on !== was) switches++;
    was = on;
    // A flank that falls while the other climbs is the escarpment. Measured on
    // the difference rather than on the sign, so a run that is merely taller on
    // one side counts for less than one that drops away.
    if (Math.abs(rl - rr) > 0.5) asym++;
    if (half < wLo) wLo = half;
    if (half > wHi) wHi = half;
    if (deck < dLo) dLo = deck;
    if (deck > dHi) dHi = deck;
  }
  return {
    roofed: roofed / (n + 1), asym: asym / (n + 1),
    switches: switches / (span / 1000),
    widthRange: wHi - wLo, halfMin: wLo, halfMax: wHi, deckRange: dHi - dLo,
  };
}

/** Peak corridor yaw in degrees, from the same ±6 m difference `railTangent` uses. */
function maxYaw() {
  const span = WORLD.zStart - WORLD.zEnd;
  let worst = 0;
  for (let q = 0; q <= 4000; q++) {
    const z = WORLD.zStart - span * (q / 4000), e = 6;
    const d = Math.abs((centrelineX(z + e) - centrelineX(z - e)) / (2 * e));
    if (d > worst) worst = d;
  }
  return Math.atan(worst) * 180 / Math.PI;
}

/** walled / columns / open — see the header. */
function flankKind(r) {
  if (r.flankRuns >= FLANK_RUNS) return 'columns';
  return r.beside >= FLANK_BESIDE ? 'walled' : 'open';
}

/** Metres of corridor carrying a hand-authored `section`, as a fraction. */
function authored(dna) {
  if (!dna.zones) return null;
  const span = (dna.zStart ?? 720) - (dna.zEnd ?? -9840);
  return dna.zones.filter(z => z.section).reduce((a, z) => a + z.len, 0) / span;
}

function shapeAt(z) {
  const cx = centrelineX(z);
  const at = (u) => terrainHeight(cx + u, z);
  const c = at(0);
  const l = at(-NEAR), r = at(NEAR);
  const rise = (l + r) / 2 - c;
  const kind = rise < -5 ? 'RIDGE' : (rise < FLAT_RISE ? 'FLAT' : 'VALLEY');
  return {
    kind, asym: Math.abs(l - r) > ASYM, rise,
    far: (at(-FAR) + at(FAR)) / 2 - c,
  };
}

// ASCII cross-section straight off `terrainHeight`, so the picture and the
// classification cannot disagree. Height is scaled per drawing, printed above
// it, because a pass at 700 m and a lagoon at 40 share no useful scale.
function draw(z, cols = 74, rows = 15, half = 1250) {
  const cx = centrelineX(z);
  const h = [];
  for (let i = 0; i < cols; i++) h.push(terrainHeight(cx + (-half + (2 * half * i) / (cols - 1)), z));
  const lo = Math.min(...h), hi = Math.max(...h);
  const rail = centrelineY(z);
  const top = Math.max(hi, rail + 20), bot = Math.min(lo, 0);
  const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
  const row = (y) => Math.round((rows - 1) * (1 - (y - bot) / Math.max(1, top - bot)));
  for (let i = 0; i < cols; i++) {
    const r = Math.max(0, Math.min(rows - 1, row(h[i])));
    grid[r][i] = '_';
    for (let k = r + 1; k < rows; k++) grid[k][i] = '#';
  }
  const rr = Math.max(0, Math.min(rows - 1, row(rail)));
  grid[rr][Math.floor(cols / 2)] = 'A';
  return { art: grid.map(g => '  ' + g.join('')).join('\n'), top, bot, rail, lo, hi };
}

if (arg('draw', null)) {
  const id = arg('draw');
  const dna = DNA_FOR(id);
  if (!dna) { console.error(`unknown level "${id}"`); process.exit(2); }
  setActiveDNA(dna);
  const span = WORLD.zStart - WORLD.zEnd;
  const at = arg('at', null);
  const fracs = at ? [parseFloat(at)] : [0.04, 0.2, 0.36, 0.52, 0.68, 0.84];
  for (const f of fracs) {
    const z = WORLD.zStart - span * f;
    const d = draw(z);
    const sh = shapeAt(z);
    console.log(`\n${id}  z ${Math.round(z)}  (${Math.round(f * 100)}% in)  ${sh.kind}${sh.asym ? '+asym' : ''}`);
    console.log(`  ground ${Math.round(d.lo)}..${Math.round(d.hi)} m, rail at ${Math.round(d.rail)} m, A = the ship, ±1250 m across`);
    console.log(d.art);
  }
  process.exit(0);
}

const only = arg('level', null);
const ids = only && only !== true ? [only] : Object.keys(DNA_BY_ID);
const rows = [];
for (const id of ids) {
  setActiveDNA(DNA_BY_ID[id]);
  if (WORLD.backend !== 'terrain') {
    rows.push({
      id, skip: WORLD.backend, yaw: maxYaw(),
      ...coverage(), ...(WORLD.backend === 'works' ? { built: built() } : {}),
    });
    continue;
  }
  const span = WORLD.zStart - WORLD.zEnd;
  const cells = [];
  for (let q = 0; q < SAMPLES; q++) {
    const s = shapeAt(WORLD.zStart - span * (0.04 + q * 0.0845));
    cells.push(s);
  }
  const kinds = new Set(cells.map(c => c.kind + (c.asym ? '+asym' : '')));
  // Coarse on purpose: this is an identity axis, not a tuning dial.
  const fr = floorRange();
  kinds.add(fr > 100 ? 'climbs' : 'level-floor');
  const row = { id, cells, kinds, fr, yaw: maxYaw(), ...coverage(), auth: authored(DNA_BY_ID[id]) };
  kinds.add(flankKind(row));
  rows.push(row);
}

console.log(`near ±${NEAR} m, far ±${FAR} m, flat under ${FLAT_RISE} m of bank rise\n`);
for (const r of rows) {
  if (r.skip) { console.log(`${r.id.padEnd(10)} (${r.skip} backend — no cross-section)`); continue; }
  const cells = r.cells.map(c => (c.kind + (c.asym ? '+' : ' ')).padEnd(7)).join('');
  console.log(`${r.id.padEnd(10)} ${cells}`);
  console.log(`${''.padEnd(10)} ${r.cells.map(c => `${Math.round(c.rise)}/${Math.round(c.far)}`.padEnd(7)).join('')}  rise near/far`);
}

// CONTRACT.md hard rule 8, made measurable: a level must name a section
// combination no other level uses. Set equality is the weak form of that test —
// it says two levels are built from the same vocabulary, not that they are
// identical — so read the proportions printed above it before acting.
const sig = (r) => [...r.kinds].sort().join(',');
const terr = rows.filter(r => !r.skip);
const clash = [];
for (let i = 0; i < terr.length; i++) {
  for (let j = i + 1; j < terr.length; j++) {
    const pair = [terr[i].id, terr[j].id];
    const paired = ONE_LANDFORM.some(([a, b]) => pair.includes(a) && pair.includes(b));
    if (!paired && sig(terr[i]) === sig(terr[j])) clash.push(pair);
  }
}

const pct = (v) => (v == null ? '   —' : `${Math.round(v * 100)}%`.padStart(4));

console.log(`\ncoverage: fraction of the corridor measuring each shape, every ${COVER_STEP} m`);
console.log(`  ${'level'.padEnd(10)} ${'RIDGE'.padStart(6)}${'FLAT'.padStart(6)}${'VALLEY'.padStart(7)}${'asym'.padStart(6)}`
  + `${'authored'.padStart(10)}${'rail moves'.padStart(12)}${'runs'.padStart(6)}`
  + `${'beside'.padStart(8)}${'starts/km'.padStart(11)}${'  flank'}`);
for (const r of terr) {
  console.log(`  ${r.id.padEnd(10)} ${pct(r.cover.RIDGE || 0).padStart(6)}${pct(r.cover.FLAT || 0).padStart(6)}`
    + `${pct(r.cover.VALLEY || 0).padStart(7)}${pct(r.cover.asym || 0).padStart(6)}`
    + `${pct(r.auth).padStart(10)}${(Math.round(r.railRange) + ' m').padStart(12)}${String(r.runs).padStart(6)}`
    + `${pct(r.beside).padStart(8)}${r.flankRuns.toFixed(2).padStart(11)}  ${flankKind(r).padEnd(7)}`
    + (r.id === REFERENCE ? '  (reference)' : ''));
}

const builtRows = rows.filter(r => r.built);
if (builtRows.length) {
  console.log('\nbuilt corridor: the same step, off the authored `works` profile');
  console.log(`  ${'level'.padEnd(10)} ${'half'.padStart(11)}${'deck moves'.padStart(12)}${'roofed'.padStart(8)}`
    + `${'sky/km'.padStart(8)}${'asym'.padStart(6)}${'rail moves'.padStart(12)}${'runs'.padStart(6)}${'steepest'.padStart(10)}`);
  for (const r of builtRows) {
    const b = r.built;
    console.log(`  ${r.id.padEnd(10)} ${`${Math.round(b.halfMin)}-${Math.round(b.halfMax)} m`.padStart(11)}`
      + `${(Math.round(b.deckRange) + ' m').padStart(12)}${pct(b.roofed).padStart(8)}${b.switches.toFixed(2).padStart(8)}`
      + `${pct(b.asym).padStart(6)}${(Math.round(r.railRange) + ' m').padStart(12)}${String(r.runs).padStart(6)}`
      + `${(r.railPeak.toFixed(0) + '°').padStart(10)}`);
  }
}

/* ── the four-levels table, checked ───────────────────────────────────────── */
const briefFails = [];
const briefLines = [];
for (const [id, b] of Object.entries(BRIEF)) {
  const r = rows.find(x => x.id === id);
  if (!r) continue;
  if (b.built) {
    const m = r.built;
    const bad = [];
    if (!m) bad.push('not a works corridor');
    else {
      if (m.asym < b.built.minAsym) bad.push(`flanks differ over ${Math.round(m.asym * 100)}% of ${Math.round(b.built.minAsym * 100)}%`);
      if (m.roofed < b.built.minRoofed) bad.push(`roofed ${Math.round(m.roofed * 100)}% of ${Math.round(b.built.minRoofed * 100)}%`);
      if (m.roofed > b.built.maxRoofed) bad.push(`roofed ${Math.round(m.roofed * 100)}%, over the ${Math.round(b.built.maxRoofed * 100)}% this row holds it to`);
      if (m.switches < b.built.minSwitch) bad.push(`sky comes and goes ${m.switches.toFixed(2)}/km of ${b.built.minSwitch}`);
      if (m.widthRange < b.built.minWidthRange) bad.push(`corridor width varies ${Math.round(m.widthRange)} m of ${b.built.minWidthRange}`);
      if (b.rail.minRange != null && r.railRange < b.rail.minRange) bad.push(`rail moves ${Math.round(r.railRange)} m of ${b.rail.minRange}`);
      if (b.rail.minPeak != null && r.railPeak < b.rail.minPeak) bad.push(`rail peaks at ${r.railPeak.toFixed(0)}° of ${b.rail.minPeak}°`);
    }
    const state = bad.length ? (b.done ? 'BROKEN' : 'open') : 'meets';
    if (bad.length && b.done) briefFails.push(`${id}: ${bad.join('; ')}`);
    briefLines.push(`  ${id.padEnd(10)} ${state.padEnd(7)} ${b.row}${bad.length ? `\n${''.padEnd(21)}${bad.join('\n'.padEnd(22))}` : ''}`);
    continue;
  }
  const got = r.cover[b.shape.kind] || 0;
  const gotAsym = r.cover.asym || 0;
  const bad = [];
  if (got < b.shape.minCover) bad.push(`${b.shape.kind} covers ${Math.round(got * 100)}% of ${Math.round(b.shape.minCover * 100)}%`);
  if (b.shape.asym && gotAsym < b.shape.minCover) bad.push(`asym covers ${Math.round(gotAsym * 100)}% of ${Math.round(b.shape.minCover * 100)}%`);
  if (b.rail.minRange != null && r.railRange < b.rail.minRange) {
    bad.push(`rail moves ${Math.round(r.railRange)} m of ${b.rail.minRange}`);
  }
  if (b.rail.maxRange != null && r.railRange > b.rail.maxRange) {
    bad.push(`rail moves ${Math.round(r.railRange)} m, over the ${b.rail.maxRange} this row holds it to`);
  }
  if (b.rail.minRuns != null && r.runs < b.rail.minRuns) {
    bad.push(`${r.runs} rail runs of ${b.rail.minRuns}`);
  }
  if (b.flank) {
    const got = flankKind(r);
    if (got !== b.flank.kind) bad.push(`flank reads ${got}, not ${b.flank.kind}`);
    if (r.flankRuns < b.flank.min) bad.push(`flank starts ${r.flankRuns.toFixed(2)}/km of ${b.flank.min}`);
  }
  const state = bad.length ? (b.done ? 'BROKEN' : 'open') : 'meets';
  if (bad.length && b.done) briefFails.push(`${id}: ${bad.join('; ')}`);
  briefLines.push(`  ${id.padEnd(10)} ${state.padEnd(7)} ${b.row}${bad.length ? `\n${''.padEnd(21)}${bad.join('\n'.padEnd(22))}` : ''}`);
}
if (briefLines.length) {
  console.log('\nfour-levels table (PLAN-LEVELS) — `done` rows are the gate, `open` rows are the work');
  console.log(briefLines.join('\n'));
}

console.log();
for (const r of terr) {
  const counts = {};
  for (const c of r.cells) { const k = c.kind + (c.asym ? '+asym' : ''); counts[k] = (counts[k] || 0) + 1; }
  const mix = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} x${n}`).join(', ');
  console.log(`  ${r.id.padEnd(10)} ${mix.padEnd(52)} floor moves ${Math.round(r.fr)} m${r.id === REFERENCE ? '   (reference)' : ''}`);
}

if (only && only !== true) {
  console.log('\n(one level named — the clash test needs at least two)');
} else if (clash.length) {
  console.log();
  for (const [a, b] of clash) console.log(`SAME SHAPE SET: ${a} and ${b} draw from the same shapes; only the proportions differ`);
  console.log('PLAN-LEVELS phase 9 is the work; this is its acceptance test.');
} else {
  console.log('\nevery level names a shape combination no other level uses');
}
if (briefFails.length) {
  console.log();
  for (const f of briefFails) console.log(`BRIEF REGRESSED: ${f}`);
  console.log('A level marked done in this tool\'s BRIEF table no longer meets its row.');
}

/* ── the rail does not turn ───────────────────────────────────────────────── */
const turners = rows.filter(r => r.yaw > MAX_YAW);
console.log(`\npeak corridor yaw, all levels (limit ${MAX_YAW}°)`);
console.log('  ' + rows.map(r => `${r.id} ${r.yaw.toFixed(2)}°`).join('   '));
if (turners.length) {
  console.log();
  for (const r of turners) console.log(`RAIL TURNS: ${r.id} peaks at ${r.yaw.toFixed(1)}° of yaw`);
  console.log('A turning rail moves the player\'s offset box, not the world. See MAX_YAW above.');
}
process.exit(STRICT && (clash.length || briefFails.length || turners.length) ? 1 : 0);
