#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Quiet audit — does the rail hold still while the player is fighting?
//
//   node tools/quiet.mjs           the table
//   node tools/quiet.mjs --audit   exit 1 if any wave overlaps a rail move
//
// The rail is the player's own frame: `flight.js` holds the ship in an offset
// box around it, so every metre the rail moves is a metre of the player's own
// travel spent following the corridor instead of aiming. Lateral motion is gone
// entirely (CONTRACT hard rule 9); vertical is allowed, and this is the rule
// that keeps it from landing on a fight.
//
//   the rail is either STILL or in a fast TRANSITION, and a transition
//   happens in the gap between waves, never inside one
//
// Static, not a sim probe: it reads `centreline.y` off the DNA and the wave
// tables off `campaign.js`. `pacing.mjs` is the live-fight instrument and needs
// a browser; this has to be cheap enough to run on every commit.
//
// ── What counts as a move ────────────────────────────────────────────────────
// `MOVING` is a gradient, not a height: 0.02 is 1.1° of nose attitude, which is
// under what the hull renders as a pitch. Below it the rail is still as far as
// the player is concerned. Above it, the window runs until the gradient drops
// back under.
//
// ── What counts as a fight ───────────────────────────────────────────────────
// A wave's arm z, plus a guard either side, and NOT its whole `life`. A
// vanguard carries `life: 26`, which at 175 m/s is 4550 m — 43% of a level —
// and a rule that treats all of it as occupied has no gaps left to put a
// transition in and would be a permanently red gate rather than a check.
//
// The guard is asymmetric on purpose. Behind a wave (GUARD_BACK) is the fight
// itself and is the longer of the two. Ahead of one (GUARD_FWD) only has to
// cover the approach, and the wave is not being shot at yet.
//
// Ground batteries are checked at their EMPLACEMENTS, not at their arm z:
// `combat.js` lays them `first + i * step` further down the level, so the arm
// point and the fight are up to 1.5 km apart. This is the same rule
// PLAN-LEVELS already carried for batteries alone — "never where the rail is
// climbing" — applied to every wave kind.
// ─────────────────────────────────────────────────────────────────────────────
import { setActiveDNA, centrelineY, railStretch, WORLD } from '../src/world/profile.js';
import { DNA_BY_ID } from '../src/world/dna.js';
import { LEVELS } from '../src/game/campaign.js';

const AUDIT = process.argv.includes('--audit');

const SPEED = 175;        // TUNE.cruiseSpeed, m/s along the rail
const STEP = 10;          // z resolution of the scan
const MOVING = 0.02;      // dY/dz above which the rail is moving, = 1.1°
const GUARD_BACK = 450;   // metres after a wave arms that still belong to it
const GUARD_FWD = 350;    // metres before a wave arms that belong to its approach
// A transition longer than this is not a transition, it is the level going
// somewhere while you fight.
//
// Measured against the drop as well, because a move cannot be faster than its
// own descent: 648 m of plunge at 175 m/s is 3.7 s before any z is spent on it,
// so a flat 3 s cap would make Aquas permanently red for being a big drop
// rather than for lingering. A move passes if it is under MAX_SECONDS **or**
// within SLACK of the floor its own dy sets.
const MAX_SECONDS = 3.0;
const SLACK = 1.25;

/** Contiguous stretches where the rail is moving vertically. */
function moves() {
  const out = [];
  let open = null;
  for (let z = WORLD.zStart; z >= WORLD.zEnd; z -= STEP) {
    const g = Math.abs((centrelineY(z + 6) - centrelineY(z - 6)) / 12);
    if (g > MOVING) {
      if (!open) open = { z0: z, peak: 0, secs: 0 };
      open.peak = Math.max(open.peak, g);
      open.secs += STEP * railStretch(z) / SPEED;
    } else if (open) { open.z1 = z; out.push(open); open = null; }
  }
  if (open) { open.z1 = WORLD.zEnd; out.push(open); }
  for (const m of out) m.dy = centrelineY(m.z1) - centrelineY(m.z0);
  return out;
}

/** Every z the player is fighting at, one entry per wave. */
function fights(level) {
  const out = [];
  for (const w of level.waves) {
    if (w.boss) { out.push({ at: w.z, what: `boss ${w.boss}` }); continue; }
    if (w.form === 'banks') {
      const n = w.n ?? 1, first = w.first ?? 760, step = w.step ?? 310;
      for (let i = 0; i < n; i++) {
        out.push({ at: w.z - (first + i * step), what: `${w.kind} emplacement ${i + 1}/${n}` });
      }
      continue;
    }
    out.push({ at: w.z, what: `${w.kind} x${w.n ?? 1}` });
  }
  return out;
}

/**
 * Wave and comms tables must descend in z.
 *
 * `combat.js:1801` walks them with a monotone cursor — it fires `waves[i]` and
 * then tests `waves[i + 1]` against the same `railZ` — so a row listed out of
 * order does not fire early, it fires LATE and in the same tick as the row
 * before it. Venom's opening battery sat after a wave 400 m further down the
 * level and put its emplacements 400 m past where its own comment said.
 * Nothing at runtime notices, which is why it is checked here.
 */
function outOfOrder(rows) {
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (!(rows[i].z < rows[i - 1].z)) out.push(`${rows[i - 1].z} then ${rows[i].z}`);
  }
  return out;
}

let bad = 0;
for (const L of LEVELS) {
  const dna = DNA_BY_ID[L.dna];
  if (!dna) continue;
  setActiveDNA(dna);
  const ms = moves(), fs = fights(L);
  const lines = [];
  for (const m of ms) {
    const clash = fs.filter(f => f.at <= m.z0 + GUARD_FWD && f.at >= m.z1 - GUARD_BACK);
    const floor = Math.abs(m.dy) / SPEED;
    const slow = m.secs > MAX_SECONDS && m.secs > floor * SLACK;
    if (clash.length || slow) bad++;
    lines.push(`  z ${String(Math.round(m.z0)).padStart(6)} → ${String(Math.round(m.z1)).padStart(6)}`
      + `  ${(Math.round(m.z0 - m.z1) + ' m').padStart(7)}  dy ${m.dy.toFixed(0).padStart(5)}`
      + `  peak ${(Math.atan(m.peak) * 180 / Math.PI).toFixed(0).padStart(2)}°`
      + `  ${m.secs.toFixed(1)} s of ${(Math.abs(m.dy) / SPEED).toFixed(1)} floor${slow ? '  SLOW' : '     '}`
      + (clash.length ? `\n      IN A FIGHT: ${clash.map(c => `${c.what} @ ${Math.round(c.at)}`).join(', ')}` : ''));
  }
  console.log(`\n${L.id}  —  ${ms.length} rail move${ms.length === 1 ? '' : 's'}`);
  for (const [what, rows] of [['waves', L.waves], ['comms', L.comms || []]]) {
    for (const pair of outOfOrder(rows)) {
      console.log(`  OUT OF ORDER: ${what} run ${pair} — the cursor fires the second one late`);
      bad++;
    }
  }
  if (lines.length) console.log(lines.join('\n'));
  else console.log('  the rail never moves');
}

console.log(bad
  ? `\n${bad} rail move${bad === 1 ? '' : 's'} either land on a fight or linger.`
  : `\nevery rail move is as fast as its drop allows and lands in a gap between waves`);
process.exit(AUDIT && bad ? 1 : 0);
