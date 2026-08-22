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
//   node tools/shape.mjs --strict        exit 1 if two levels share a shape set
//   node tools/shape.mjs --level fortuna
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

// The level the others are being told apart from. Labelled in the output; it
// gets no exemption from the clash test, because two levels sharing a shape set
// is a finding whichever two they are.
const REFERENCE = 'corneria';

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
  rows.push({ id, cells, kinds, fr });
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
    if (sig(terr[i]) === sig(terr[j])) clash.push([terr[i].id, terr[j].id]);
  }
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
process.exit(STRICT && clash.length ? 1 : 0);
