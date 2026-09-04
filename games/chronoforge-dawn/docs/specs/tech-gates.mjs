// docs/specs/tech-gates.mjs
// Tech-gate curve — Phase 1.1 (gamedesign), co-owned with `level`.
//
// CONCEPT.md / CONTRACT.md decide that doorway edges gate on settlement tech
// tier and that gates are TEMPORARY: at max tier the whole world traverses
// both ways. This module is the POLICY (which tier opens which region,
// checked against the renown/XP curve) applied to the inherited region
// graph ported from games/chronoforge/src/world.js MAPS[*].doorways — a
// tree of 8 outdoor regions and 7 bidirectional edges, zero cycles.
//
// `level` owns final edge placement in Phase 1.2/1.3 and is explicitly
// licensed to redesign the topology; if it does, re-run this table's gate
// assignment against the new edge set using the same rule (see
// agents/gamedesign-output.md SS4). Per CONTRACT.md SS"Gate data is authored
// before the system that reads it": the runtime check stubs to unlocked
// until settlement ships in Phase 9, but region.mjs must be able to walk
// this table across every tier state from Tier 1 onward, which is exactly
// what selfCheck() below does offline.

export const SETTLEMENT_TIERS = ['Survivor', 'Reclaimer', 'Ascendant', 'Transcendent'];

export const REGIONS = [
  'haventide_region',
  'emberline_region',
  'forest_veil_region',
  'mire_bog_region',
  'orbital_reach_region',
  'frost_canyon_region',
  'last_crown_region',
  'crater_ember_region',
];

// gate = the MINIMUM settlement tier required to cross this edge in EITHER
// direction. 'Survivor' means ungated (open from a new game).
// UPDATED IN PHASE 1.2 (level). The Phase 1.1 table below carried the donor's
// 7 tree edges; `level` accepted 3 lateral cycles (marked NEW), so the gate
// assignment was re-run over the 10-edge set using the SS4.2 rule unchanged.
// The three additions gate at the tier at which BOTH their endpoints were
// already reachable, so the per-tier reachability profile is byte-identical to
// the 7-edge version: 4 / 6 / 8 / 8. The table in agents/gamedesign-output.md
// SS4.3 lists the original 7 rows; THIS module is the live table, and
// docs/specs/world-graph.mjs selfCheck() asserts the two agree.
export const REGION_EDGES = [
  // starting web — always open, no new player is ever stranded at the door
  { a: 'haventide_region',     b: 'emberline_region',     gate: 'Survivor' },
  { a: 'emberline_region',     b: 'forest_veil_region',   gate: 'Survivor' },
  { a: 'forest_veil_region',   b: 'mire_bog_region',      gate: 'Survivor' },
  // NEW (level, 1.2): closes the starting web into a triangle. Both endpoints
  // are already open at Survivor, so this gates at Survivor by rule 2 and
  // adds no reachability — only a second way home from the southern chain.
  { a: 'haventide_region',     b: 'forest_veil_region',   gate: 'Survivor' },

  // T2 -> T3 step: first real gate, placed on the edges that actually
  // first reach T3 content (Orbital Reach). Frost Canyon (also T3) is gated
  // transitively through Orbital Reach, so it carries no direct gate of its
  // own — see SS4 "no stacked gates" rule in agents/gamedesign-output.md.
  { a: 'emberline_region',     b: 'orbital_reach_region', gate: 'Reclaimer' },
  // NEW (level, 1.2): the second first-entry into T3. Rule 1 gates EVERY edge
  // that first reaches a higher tier, not just one of them — leaving this at
  // Survivor would make the Reclaimer gate above trivially bypassable.
  { a: 'mire_bog_region',      b: 'orbital_reach_region', gate: 'Reclaimer' },
  { a: 'orbital_reach_region', b: 'frost_canyon_region',  gate: 'Survivor' },

  // T3 -> T4 step: the story finale (Last Crown, Void Architect's herald)
  // and the inherited two-tier jump (Emberline T2 -> Crater Ember T4) both
  // land at the SAME tier. That is deliberate: it turns the two-tier jump
  // from a wall into "the hard way in" — reachable in parallel with the
  // properly-leveled Orbital Reach -> Last Crown route, not gated a tier
  // higher than it. A player who rushes Ascendant without clearing Orbital
  // Reach / Frost Canyon first will be under-leveled for Crater Ember's T4
  // mobs; that is the intended risk, not a progression wall.
  { a: 'orbital_reach_region', b: 'last_crown_region',    gate: 'Ascendant' },
  { a: 'emberline_region',     b: 'crater_ember_region',  gate: 'Ascendant' },
  // NEW (level, 1.2): fire-and-ice border, and the third first-entry into T4.
  // Same Ascendant gate as the other two T4 edges, per rule 1 + rule 4.
  { a: 'crater_ember_region',  b: 'frost_canyon_region',  gate: 'Ascendant' },
];

export function tierIndex(tier) {
  return SETTLEMENT_TIERS.indexOf(tier);
}

// An edge is traversable at `tier` if the settlement has reached at least
// the edge's gate tier. No edge's gate exceeds 'Ascendant' in this table, so
// by 'Transcendent' every edge is open — satisfying "gates are temporary."
export function edgeOpenAt(edge, tier) {
  return tierIndex(tier) >= tierIndex(edge.gate);
}

export function reachableAt(tier, start = 'haventide_region') {
  const open = REGION_EDGES.filter(e => edgeOpenAt(e, tier));
  const adj = new Map(REGIONS.map(r => [r, []]));
  for (const e of open) {
    adj.get(e.a).push(e.b);
    adj.get(e.b).push(e.a);
  }
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop();
    for (const n of adj.get(cur)) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  }
  return seen;
}

// --- renown pacing evidence (why these gates don't strand anyone) ---
// Per-region first-clear renown, summed from games/chronoforge/src/battle.js
// ENEMY_TEMPLATES against games/chronoforge/src/world.js MAPS[*].encounters.
export const REGION_RENOWN = {
  haventide_region: 13, emberline_region: 28, forest_veil_region: 22, mire_bog_region: 36,
  orbital_reach_region: 34, frost_canyon_region: 56, last_crown_region: 63, crater_ember_region: 67,
};
// Renown available from clearing every region reachable at 'Survivor' alone
// (Haventide + Emberline + Forest Veil + Mire Bog), before any settlement
// spend: 13+28+22+36 = 99 — one point short of Reclaimer's 100. A single
// Town Center tier-2 upgrade (+40 renown, cost 120 ore / 40 food, no tech
// gate, affordable from tick one) clears it easily. Reclaimer is reachable
// almost exactly at "cleared the starting web," never later.
export const RECLAIMER_RENOWN_REQ = 100;
export const STARTING_WEB_RENOWN =
  REGION_RENOWN.haventide_region + REGION_RENOWN.emberline_region +
  REGION_RENOWN.forest_veil_region + REGION_RENOWN.mire_bog_region;

// --- self-check: `node docs/specs/tech-gates.mjs` ---
function selfCheck() {
  const failures = [];

  const reachableAtMax = reachableAt('Transcendent');
  for (const r of REGIONS) {
    if (!reachableAtMax.has(r)) failures.push(`UNREACHABLE at any tier: ${r}`);
  }

  for (const e of REGION_EDGES) {
    if (tierIndex(e.gate) === -1) failures.push(`BAD GATE TIER on edge ${e.a}<->${e.b}: ${e.gate}`);
    if (!edgeOpenAt(e, 'Transcendent')) failures.push(`PERMANENT ONE-WAY (never opens even at max tier): ${e.a}<->${e.b}`);
  }

  console.log('Reachability by settlement tier:');
  for (const tier of SETTLEMENT_TIERS) {
    const set = reachableAt(tier);
    console.log(`  ${tier.padEnd(12)} ${set.size}/${REGIONS.length}  [${[...set].sort().join(', ')}]`);
  }

  console.log(`\nStarting-web renown available at Survivor: ${STARTING_WEB_RENOWN} (Reclaimer needs ${RECLAIMER_RENOWN_REQ}; ` +
    `one Town Center T2 upgrade (+40, ungated) closes the gap without leaving the starting web).`);

  if (failures.length) {
    console.error(`\nFAIL - ${failures.length} issue(s):`);
    for (const f of failures) console.error(' - ' + f);
    process.exitCode = 1;
  } else {
    console.log(`\nPASS - all ${REGIONS.length} regions reachable, all ${REGION_EDGES.length} edges open by Transcendent.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) selfCheck();
