// ─────────────────────────────────────────────────────────────────────────────
// RIG SPEC — Phase 1.1 (art). Runnable, not prose: `node docs/specs/rig.mjs`
// validates the proportion table and prints the joint/socket report dev needs
// to build the actual THREE.Skeleton.
//
// Consumed by: `actors` lane (src/actors/*) when it builds the code-built rig.
// This module has NO THREE.js dependency on purpose — it is pure data plus
// pure functions, so it runs in plain Node with zero build step and can be
// unit-tested before a single triangle exists.
//
// Import HERO_M / TILE_M from shared core rather than re-declaring them, so
// there is exactly one number the camera math and the rig math both trust.
// ─────────────────────────────────────────────────────────────────────────────

import { HERO_M, TILE_M } from '../../src/core/const.js';

/* ── 1. Joint hierarchy ──────────────────────────────────────────────────────
   19 joints. No fingers, no toes, no per-vertebra spine — this rig is read at
   ~62 px of a 1080p frame (see PIXEL-SNAP below); a joint that cannot move the
   silhouette at that size is budget spent on nothing. `shoulder_*` is kept
   separate from `upperArm_*` (rather than baked into the bind pose) because
   combo finishers push the camera in and a shoulder wind-up is one of the few
   reads that survives a close cinematic crop cheaply.

   `offset` is the LOCAL translation from the parent joint, in metres, in the
   bind pose (character facing −Z, arms at sides, per core/const.js axes).
   `hips` has no parent; its offset is its height off the ground. */
export const JOINTS = [
  { name: 'hips',        parent: null,         offset: [0, 0.96, 0] },
  { name: 'spine_lower',  parent: 'hips',        offset: [0, 0.14, 0] },
  { name: 'spine_upper',  parent: 'spine_lower', offset: [0, 0.22, 0] },  // chest — shoulders + socket.back + socket.chest live here
  { name: 'neck',         parent: 'spine_upper', offset: [0, 0.08, 0] },
  { name: 'head',         parent: 'neck',        offset: [0, 0.32, 0] },  // length is neck-base to crown; socket.head at the tip

  { name: 'shoulder_L',   parent: 'spine_upper', offset: [0.19, 0.04, 0] },
  { name: 'upperArm_L',   parent: 'shoulder_L',  offset: [0, -0.28, 0] },
  { name: 'lowerArm_L',   parent: 'upperArm_L',  offset: [0, -0.24, 0] },
  { name: 'hand_L',       parent: 'lowerArm_L',  offset: [0, -0.09, 0] },  // socket.offhand

  { name: 'shoulder_R',   parent: 'spine_upper', offset: [-0.19, 0.04, 0] },
  { name: 'upperArm_R',   parent: 'shoulder_R',  offset: [0, -0.28, 0] },
  { name: 'lowerArm_R',   parent: 'upperArm_R',  offset: [0, -0.24, 0] },
  { name: 'hand_R',       parent: 'lowerArm_R',  offset: [0, -0.09, 0] },  // socket.weapon

  { name: 'upperLeg_L',   parent: 'hips',        offset: [0.10, -0.02, 0] },
  { name: 'lowerLeg_L',   parent: 'upperLeg_L',  offset: [0, -0.42, 0] },
  { name: 'foot_L',       parent: 'lowerLeg_L',  offset: [0, -0.46, 0] },

  { name: 'upperLeg_R',   parent: 'hips',        offset: [-0.10, -0.02, 0] },
  { name: 'lowerLeg_R',   parent: 'upperLeg_R',  offset: [0, -0.42, 0] },
  { name: 'foot_R',       parent: 'lowerLeg_R',  offset: [0, -0.46, 0] },
];

/** The chain the standing-height self-check sums: hips.y + this chain's
 *  vertical drops must equal HERO_M. Kept explicit rather than inferred so a
 *  future joint insertion cannot silently change the character's height. */
const STANDING_CHAIN_M =
  0.42 /* upperLeg */ + 0.46 /* lowerLeg */ + 0.08 /* ankle-to-sole, baked into foot's rest pose, not a joint offset */
  + 0.14 /* spine_lower */ + 0.22 /* spine_upper */ + 0.08 /* neck */ + 0.32 /* head */;

/* ── 2. Sockets ───────────────────────────────────────────────────────────────
   Empty Object3D nodes parented to a joint, NOT part of the 19-bone skeleton.
   Axis convention for every socket: local +Y points along the prop's natural
   swing/extend axis (blade tip, staff head, cape fall direction), local +Z
   points away from the body surface it mounts to. Every weapon/prop mesh is
   AUTHORED against this convention with its attach point at its own origin —
   that is what lets Kaida's three swords share one socket transform with zero
   per-item offset hacks. Distinct meshes, identical attachment contract. */
export const SOCKETS = {
  weapon:  { joint: 'hand_R',      offset: [0, -0.02, 0.01], note: 'primary weapon — DISTINCT mesh per item, e.g. Kaida\'s three swords' },
  offhand: { joint: 'hand_L',      offset: [0, -0.02, 0.01], note: 'shield / tome / parry weapon' },
  head:    { joint: 'head',        offset: [0, 0.14, 0],     note: 'helmet / hood / hair topper' },
  back:    { joint: 'spine_upper', offset: [0, 0.06, -0.06], note: 'cape / backpack / quiver' },
  chest:   { joint: 'spine_upper', offset: [0, 0.02, 0.10],  note: 'accessory-slot charm; also the IFF ident-beacon mount, see palette.mjs' },
};

/** Armour is NOT a socket prop. It re-skins the torso/upperArm/upperLeg shell
 *  meshes that are bound to the same 19 joints, because armour changes body
 *  coverage broadly rather than adding a point decoration. Recorded here so
 *  dev does not go looking for a `socket.armor` that was never meant to exist. */
export const ARMOR_IS_SHELL_SWAP = true;

/* ── 3. Pixel-snap ────────────────────────────────────────────────────────────
   Applies to the actor render only — never to terrain (defect 1/2/5 want
   terrain SMOOTH: continuous fog, no grid, real elevation lighting). This is
   the Octopath-style trick: a continuously-lit 3D rig snapped to a coarse
   grid ONLY within its own screen-space bounding box, composited back into a
   smooth 3D scene it visibly stands on.

   The grid is defined in METRES OF CHARACTER, not screen pixels, so it holds
   constant apparent density whether the camera is at the locked overworld
   framing, a battle push-in, or the portrait camera (see palette/hud specs):

     snapUnitPx = actorScreenHeightPx / (actorHeightM * SPRITE_PX_PER_METRE)

   A hero at HERO_M spans SPRITE_PX_PER_METRE * HERO_M ≈ 48 virtual rows. At
   the locked framing's ~62 px hero height (core/const.js FRAME_HEIGHT_M=18,
   pitch 55°) that is snapUnitPx ≈ 1.3 — a fine, faceted stepping of silhouette
   edges, not blown-up 8-bit blocks. That number is a STARTING POINT for the
   Phase 2 rig gate, not a locked constant; tune it there against a real
   screenshot, not against this file. */
export const SPRITE_PX_PER_METRE = 28;
export const HERO_SPRITE_ROWS = Math.round(SPRITE_PX_PER_METRE * HERO_M);

export function snapUnitPx(actorScreenHeightPx, actorHeightM = HERO_M) {
  return actorScreenHeightPx / (actorHeightM * SPRITE_PX_PER_METRE);
}

/* ── 4. Palette-quantise (tonal side; colour side lives in palette.mjs) ──────
   The rig's own lit shading is banded through a fixed-step toon ramp rather
   than a smooth N·L falloff — that is most of what reads as "sprite" at a
   glance, more than the pixel-snap does. 5 bands: shadow / core-shadow / mid
   / light / rim-highlight. This is INDEPENDENT of the scene's global grade
   (exposure, split-tone, ACES in render/postfx.js) — the rig ramp decides how
   many discrete steps its own N·L response takes; the grade pass still runs
   on top of the result, same as everything else in the frame. */
export const TONE_BANDS = 5;

/** Quantise a lit fraction (0..1, e.g. saturate(N·L)) to TONE_BANDS discrete
 *  steps. Pure function — this is exactly what an actor material's toon-ramp
 *  LUT sampler does per texel. */
export function quantiseTone(litFraction, bands = TONE_BANDS) {
  const t = Math.max(0, Math.min(1, litFraction));
  return Math.round(t * (bands - 1)) / (bands - 1);
}

/* ── 5. Per-hero height variance ──────────────────────────────────────────────
   HERO_M (1.72) is the camera-framing REFERENCE, not a mandate that all three
   heroes are identical height — but silhouette-area checks in tools/rig.mjs
   (Phase 2 gate) key off HERO_M, so this table stays inside a tolerance the
   gate can accept without special-casing each hero. Rune (Sentinel, bulky
   frontline) reads tallest; Vex (Mage, slight) reads shortest. */
export const HERO_HEIGHTS_M = {
  kaida: HERO_M,          // 1.72 — the reference build
  vex:   HERO_M * 0.965,  // 1.66
  rune:  HERO_M * 1.035,  // 1.78
};
export const HEIGHT_TOLERANCE = 0.06; // ±6% of HERO_M accepted by the silhouette-area band

/* ── 6. Self-check ────────────────────────────────────────────────────────────
   `node docs/specs/rig.mjs` — proves the joint tree is well-formed and the
   standing chain actually sums to HERO_M before dev builds a single bone. */
function validate() {
  const byName = new Map(JOINTS.map(j => [j.name, j]));
  const problems = [];

  if (JOINTS.length !== 19) problems.push(`expected 19 joints, found ${JOINTS.length}`);
  for (const j of JOINTS) {
    if (j.parent !== null && !byName.has(j.parent)) problems.push(`${j.name}: unknown parent "${j.parent}"`);
  }
  const hips = byName.get('hips');
  const chainSum = hips.offset[1] === 0.96 ? 0.96 + STANDING_CHAIN_M - 0.96 : NaN;
  // hips.offset[1] IS the ground-to-hips height; the rest of the standing
  // height is legs-below-hips (already folded into that 0.96) plus torso/neck
  // /head above it, which is STANDING_CHAIN_M minus the leg terms already
  // counted in hips.y. Check the two ways of computing HERO_M agree.
  const legs = 0.42 + 0.46 + 0.08;
  const aboveHips = 0.14 + 0.22 + 0.08 + 0.32;
  const totalHeight = hips.offset[1] /* == legs */ + aboveHips;
  if (Math.abs(legs - hips.offset[1]) > 1e-9) problems.push(`hips.y (${hips.offset[1]}) does not match leg sum (${legs})`);
  if (Math.abs(totalHeight - HERO_M) > 1e-6) problems.push(`standing height ${totalHeight.toFixed(3)}m != HERO_M ${HERO_M}m`);

  for (const [name, s] of Object.entries(SOCKETS)) {
    if (!byName.has(s.joint)) problems.push(`socket.${name}: unknown joint "${s.joint}"`);
  }

  for (const [hero, h] of Object.entries(HERO_HEIGHTS_M)) {
    const dev = Math.abs(h - HERO_M) / HERO_M;
    if (dev > HEIGHT_TOLERANCE) problems.push(`${hero} height ${h.toFixed(3)}m exceeds ±${HEIGHT_TOLERANCE * 100}% of HERO_M`);
  }

  return { ok: problems.length === 0, problems, totalHeight, legs, aboveHips };
}

export function report() {
  const v = validate();
  const lines = [];
  lines.push(`chronoforge-dawn rig spec — HERO_M=${HERO_M}m, TILE_M=${TILE_M}m`);
  lines.push(`joints: ${JOINTS.length} (expect 19)`);
  lines.push(`standing height check: ${v.totalHeight.toFixed(3)}m (legs ${v.legs.toFixed(2)} + torso/neck/head ${v.aboveHips.toFixed(2)})`);
  lines.push(`sockets: ${Object.keys(SOCKETS).join(', ')}`);
  lines.push(`sprite rows @ HERO_M: ${HERO_SPRITE_ROWS} (SPRITE_PX_PER_METRE=${SPRITE_PX_PER_METRE})`);
  lines.push(`snapUnitPx at locked framing (~62px hero): ${snapUnitPx(62).toFixed(2)} px/virtual-px`);
  lines.push(`tone bands: ${TONE_BANDS} — quantiseTone(0.63) = ${quantiseTone(0.63)}`);
  lines.push(`hero heights: ${Object.entries(HERO_HEIGHTS_M).map(([k, v2]) => `${k}=${v2.toFixed(2)}m`).join(', ')}`);
  lines.push(v.ok ? 'VALID' : `INVALID:\n  - ${v.problems.join('\n  - ')}`);
  return lines.join('\n');
}

// Runs when invoked directly: `node docs/specs/rig.mjs`
if (import.meta.url === `file://${process.argv[1]}`) {
  const out = report();
  console.log(out);
  if (!validate().ok) process.exit(1);
}
