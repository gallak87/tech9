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
// FLAT and VALLEY are the distinction the first version of this audit missed:
// it had only RIDGE / asym / valley, so it called Fortuna's near-flat lagoon a
// valley and would have had phase 9 author away the one thing already right.
// ─────────────────────────────────────────────────────────────────────────────
import { setActiveDNA, terrainHeight, centrelineX, centrelineY, WORLD } from '../src/world/profile.js';
import { DNA_BY_ID } from '../src/world/dna.js';

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
    done: false,
    row: 'near-flat / dive + climb',
    // Target, not a measurement. Its brief is over the canopy, down through a
    // gap, along the understory and back out, so the rail has to cross the
    // surface twice — that is the range and the third run it does not have.
    shape: { kind: 'FLAT', minCover: 0.55 },
    rail: { minRange: 300, minRuns: 3 },
  },
  foundry: { done: false, row: 'escarpment / steep shaft', backend: 'works' },
};

// Rail excursion a local extreme has to clear to count as a turn rather than as
// the centreline's own sine term, which is 7-16 m on every level.
const RUN_PROMINENCE = 80;

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
  return { cover, railRange: Math.max(...ys) - Math.min(...ys), runs };
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
  if (WORLD.backend !== 'terrain') { rows.push({ id, skip: WORLD.backend }); continue; }
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
  rows.push({ id, cells, kinds, fr, ...coverage(), auth: authored(DNA_BY_ID[id]) });
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
  + `${'authored'.padStart(10)}${'rail moves'.padStart(12)}${'runs'.padStart(6)}`);
for (const r of terr) {
  console.log(`  ${r.id.padEnd(10)} ${pct(r.cover.RIDGE || 0).padStart(6)}${pct(r.cover.FLAT || 0).padStart(6)}`
    + `${pct(r.cover.VALLEY || 0).padStart(7)}${pct(r.cover.asym || 0).padStart(6)}`
    + `${pct(r.auth).padStart(10)}${(Math.round(r.railRange) + ' m').padStart(12)}${String(r.runs).padStart(6)}`
    + (r.id === REFERENCE ? '   (reference)' : ''));
}

/* ── the four-levels table, checked ───────────────────────────────────────── */
const briefFails = [];
const briefLines = [];
for (const [id, b] of Object.entries(BRIEF)) {
  const r = rows.find(x => x.id === id);
  if (!r) continue;
  if (b.backend) {
    briefLines.push(`  ${id.padEnd(10)} ${'open'.padEnd(7)} ${b.row} — ${b.backend} backend carries no section`);
    continue;
  }
  const got = r.cover[b.shape.kind] || 0;
  const gotAsym = r.cover.asym || 0;
  const bad = [];
  if (got < b.shape.minCover) bad.push(`${b.shape.kind} covers ${Math.round(got * 100)}% of ${Math.round(b.shape.minCover * 100)}%`);
  if (b.shape.asym && gotAsym < b.shape.minCover) bad.push(`asym covers ${Math.round(gotAsym * 100)}% of ${Math.round(b.shape.minCover * 100)}%`);
  if (r.railRange < b.rail.minRange) bad.push(`rail moves ${Math.round(r.railRange)} m of ${b.rail.minRange}`);
  if (r.runs < b.rail.minRuns) bad.push(`${r.runs} rail runs of ${b.rail.minRuns}`);
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
process.exit(STRICT && (clash.length || briefFails.length) ? 1 : 0);
