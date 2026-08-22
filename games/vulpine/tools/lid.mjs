#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Lid audit — is there room to fly under the ceiling?
//
// A ceiling is the one world query with no visible failure mode. Terrain that is
// wrong looks wrong; a lid that is wrong looks like a lid, and the level is
// simply unflyable in a way no screenshot shows — the ship is pinned, or it
// passes through a surface it should not. Aquas already paid for this once: its
// canopy at 330 sat on the rim of every zone past the shelf and the level read
// as a cave, which took a capture cycle to see and a number to fix.
//
//   node tools/lid.mjs --audit          every level, offline
//   node tools/lid.mjs --audit --level aquas
//
// Three things have to hold, and each one is a defect that has happened or is
// one authored number away:
//
//   1. Every key carries a finite lid. `ceilingAtZ` blends two keys, so one
//      undefined `ceiling` is a NaN ceiling for the whole span leading into it,
//      and a NaN compares false against everything — the clamp silently stops
//      clamping rather than failing.
//
//   2. The lid clears the flyable corridor. Measured inside `boxX`, because
//      that is how far the player can actually get from the rail: a lid that
//      clears the corridor is flyable however tall the scenery beyond it is.
//      This is the Aquas lesson as an assert — its canopy at 330 sat on the rim
//      of the corridor itself, which is what made it a cave.
//
//   3. A world with no canopy answers Infinity. `ai.js` and the flight clamp are
//      both one-sided tests against it, so a large finite value where Infinity
//      belongs is a ceiling nobody authored.
//
// Terrain that breaks the lid *outside* the corridor is reported and does not
// fail: on a sea surface that is an emergent reef, which is a question about the
// look rather than about whether the level can be flown. Aquas has 1.7 km of it
// today. A gate that is red on arrival gates nothing, so the two are kept apart.
// ─────────────────────────────────────────────────────────────────────────────
import { setActiveDNA, ceilingAtZ, terrainHeight, centrelineX, centrelineY, railOverSurface, PIERCE, WORLD } from '../src/world/profile.js';
import { DNA_BY_ID } from '../src/world/dna.js';

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  if (i === -1) return d;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};

// Both from `TUNE` in flight.js. `boxYUp` is how far above the rail the ship
// reaches under full stick, so a lid closer than that to the ground is a
// corridor the player cannot fly; `boxX` is how far it can get sideways, which
// bounds where "under the lid" is a question about flying at all.
const BOX_Y_UP = 78;
const BOX_X = 105;

// How far out to look for terrain breaking the surface. Past the corridor this
// is a note, not a failure, so the range only has to cover what is visible.
const REPORT_HALF_U = 1250;
const U_STEP = 15;
const Z_STEP = 20;

function auditLevel(id) {
  const dna = DNA_BY_ID[id];
  setActiveDNA(dna);
  const bad = [];

  if (!WORLD.canopy) {
    // Rule 3. Sampled rather than assumed: a per-zone `ceiling` on a level with
    // no canopy is rejected at author time, and this is the other end of it.
    for (let z = WORLD.zStart; z > WORLD.zEnd; z -= Z_STEP * 8) {
      if (ceilingAtZ(z) !== Infinity) {
        bad.push(`z ${z.toFixed(0)}: no canopy, but the lid answers ${ceilingAtZ(z)}`);
        break;
      }
    }
    return { id, lid: false, bad, worst: null };
  }

  let worst = null;
  let broke = null;                     // terrain through the lid, outside the corridor
  for (let z = WORLD.zStart; z > WORLD.zEnd; z -= Z_STEP) {
    const lid = ceilingAtZ(z);
    if (!Number.isFinite(lid)) {                                    // rule 1
      bad.push(`z ${z.toFixed(0)}: lid is ${lid}`);
      if (bad.length > 4) break;
      continue;
    }
    // Where the rail runs at or above the surface it is not a lid at all — it
    // is the floor the ship flies over, and `groundAt` owns it.
    //
    // And for `BOX_Y_UP` past the crossing it cannot owe full headroom either:
    // clearance ramps from zero as the rail descends through, so a dive is
    // always momentarily inside the box. What that costs is a ceiling clamp
    // while the ship is already diving, which is not the level being unflyable.
    // The lid answers for itself once the box fits under it.
    const over = railOverSurface(z);
    if (over !== null && over > -(PIERCE + BOX_Y_UP)) continue;

    const cx = centrelineX(z);
    // Rule 2, inside the corridor. The floor here is whichever is higher, the
    // rail or the terrain under it: where terrain rises into the corridor the
    // ground clamp carries the ship up with it, and it is that carried ship the
    // lid has to clear.
    let ground = centrelineY(z);
    for (let u = -BOX_X; u <= BOX_X; u += U_STEP) {
      const h = terrainHeight(cx + u, z);
      if (h > ground) ground = h;
    }
    const room = lid - ground;
    if (!worst || room < worst.room) worst = { z, lid, ground, room };

    for (let u = -REPORT_HALF_U; u <= REPORT_HALF_U; u += U_STEP) {
      if (Math.abs(u) <= BOX_X) continue;
      const h = terrainHeight(cx + u, z);
      if (h <= lid) continue;
      if (!broke) broke = { z0: z, z1: z, over: h - lid, uMin: Math.abs(u) };
      broke.z1 = z;
      if (h - lid > broke.over) broke.over = h - lid;
      if (Math.abs(u) < broke.uMin) broke.uMin = Math.abs(u);
    }
  }
  if (worst && worst.room < BOX_Y_UP) {
    bad.push(`z ${worst.z.toFixed(0)}: lid ${worst.lid.toFixed(0)} over ground `
      + `${worst.ground.toFixed(0)} leaves ${worst.room.toFixed(0)} m in the corridor, `
      + `under the ${BOX_Y_UP} m the offset box needs`);
  }
  return { id, lid: true, bad, worst, broke };
}

const only = arg('level', null);
const levels = only && only !== true ? [only] : Object.keys(DNA_BY_ID);
let failed = 0;
for (const id of levels) {
  const r = auditLevel(id);
  const head = r.lid
    ? `lid, worst headroom ${r.worst ? `${r.worst.room.toFixed(0)} m at z ${r.worst.z.toFixed(0)}` : 'n/a'}`
    : 'no lid';
  console.log(`${r.bad.length ? 'FAIL' : 'ok  '}  ${id.padEnd(9)} ${head}`);
  for (const b of r.bad) console.log(`        ${b}`);
  if (r.broke) {
    console.log(`        note: terrain breaks the lid by up to ${r.broke.over.toFixed(0)} m from `
      + `|u| ${r.broke.uMin.toFixed(0)}, z ${r.broke.z0.toFixed(0)}..${r.broke.z1.toFixed(0)} — look, not flyability`);
  }
  if (r.bad.length) failed++;
}
console.log(failed ? `\n${failed} level(s) failed` : '\nall levels clear');
process.exit(failed ? 1 : 0);
