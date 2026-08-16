import { DNA_BY_ID } from '../world/dna.js';
// `WORLD` is mutated in place by `setActiveDNA`, so it is the live corridor
// extent — reading `zEnd` off the level's own DNA would be a frame ahead of the
// terrain during a rebuild.
import { WORLD } from '../world/profile.js';
import { CORNERIA_WAVES, CORNERIA_GRANTS, CORNERIA_COMMS } from './combat.js';

// ─────────────────────────────────────────────────────────────────────────────
// Campaign — the level list, and the only thing that ends a mission.
//
// Three rules this file exists to enforce:
//
//   1. THE SIM NEVER STOPS.  A hop is flown, not watched. `mode` stays PLAYING
//      throughout, the player keeps the stick, and nothing here pauses anything.
//      That is the whole difference between this and a loading screen.
//   2. THE RAIL IS DETACHED, NOT REWOUND.  Resetting `railZ` to 0 while the
//      world is still being flown would fire the next level's waves during the
//      hop and drop the ship onto terrain that is not drawn yet. `flight`
//      detaches instead: the rail holds and the ground clamp is skipped for
//      exactly as long as the ship is off-world.
//   3. THE REBUILD HIDES BEHIND THE HOP.  `world.rebuild` disposes the old
//      terrain the instant it is called, so it cannot start until the world is
//      off screen. It starts at SPACE and has ~11 s to finish ~1.6 s of work.
//
// `setWorldVisible(false)` runs before the build is queued, and that ordering is
// load-bearing in a way that is easy to break: `renderer.compile` walks
// `traverseVisible`, so the warm job at the tail of the rebuild has to unhide the
// root for its own call or it compiles nothing. See `corneria.js:_warm`.
// ─────────────────────────────────────────────────────────────────────────────

/* ── transitions ──────────────────────────────────────────────────────────────
   Two kinds, and the difference is the point rather than a saving.

   An ORBITAL hop says "different planet". Used once, between Corneria and
   Sector Omega, because that is the one time the destination looks like nothing
   you have seen — the set-piece and the payoff land on the same beat.

   An OVERLAND hop says "further up the same valley". Corneria's two sectors are
   one river system: the lowland reach and, above it, the ice cap it drains from.
   They share a landform grammar because they are the same landform, which is
   the whole reason to make this transition overland — a fiction that promises a
   different planet and then delivers the same cross-section reads as a bug,
   where a fiction that promises the head of the same valley reads as continuity.

   Both drive `fx.transit`, which owns no timing: `setPhase(phase, t)` is its
   entire input. The overland hop simply never enters the two phases that draw a
   planet from space, so it needs no new art. */
const HOPS = {
  orbital: {
    order: ['ascent', 'space', 'approach', 'reentry'],
    dur: { ascent: 3.5, space: 2.0, approach: 6.0, reentry: 3.0 },
    // Enough that the corridor walls fall out of frame and the horizon curves.
    climb: 2200,
    // The rebuild starts here, and has the rest of the sequence to finish.
    buildAt: 'space',
    label: {
      ascent: 'LEAVING ATMOSPHERE', space: 'ORBITAL TRANSIT',
      approach: 'APPROACH', reentry: 'RE-ENTRY',
    },
  },
  overland: {
    // **climb is 0 and that is the point.** The first attempt at this reused a
    // shortened orbital ascent, and a short climb into a thinning sky reads as
    // leaving the planet quickly rather than as not leaving it — the altitude
    // was the tell, not the duration. The ship stays in the canyon for the whole
    // transition and the weather does the covering.
    order: ['runin', 'whiteout', 'clear'],
    dur: { runin: 1.8, whiteout: 5.0, clear: 2.6 },
    climb: 0,
    buildAt: 'whiteout',
    label: { runin: 'CLIMBING THE VALLEY', whiteout: 'WHITEOUT', clear: 'CORNERIA HIGHLANDS' },
    // `runin` drives nothing: the world is still the one being flown and must
    // look untouched. The two transit phases below never show a planet and never
    // blend through the space preset.
    transit: { runin: null, whiteout: ['whiteout', null], clear: ['clear', null] },
  },
};

// Hard ceiling on the victory lap, in case the rail never reaches `zEnd` —
// killing the carrier early with the dev tool leaves several km to fly, and a
// transition that waits 40 s reads as a hang.
const LAP_MAX = 14;

// Per-frame mesh budget during the hop. Generous because nothing else is
// competing: the terrain is hidden and the field is empty.
const BUILD_MS = 6;

/* ── Fichina ──────────────────────────────────────────────────────────────────
   Placed against the zone sequence in `dna.js`, not on an even grid. Three rules
   came out of doing it, and none of them is enforced by anything:

   1. A wave's `z` only ARMS it. The craft appears `spawn` metres further down
      the rail and closes at roughly `speed + closeRate`, so it is on screen from
      `z` and in the fight around `z - spawn·175/(175+close)`. Both numbers have
      to land in the zone you meant.
   2. Ground batteries sit on the ground, and `bank` is an absolute offset from
      the rail (`combat.js:647`). So a battery wave has to fire inside ONE zone's
      held stretch with `bank` set near that zone's `inner` — and never where the
      rail is climbing, or the whole battery is 160 m below the ship.
   3. The slot and the crevasse are 1.1 s and 0.86 s long. Nothing is armed to
      make contact inside them; they are the two places the level is looked at
      rather than fought in.

   Nothing sorts or validates this table, so it stays z-descending by hand.

   The finale is a real boss as of 2026-08-15 — see the `boss:` row below. */
const FICHINA_WAVES = [
  // Open icefield: the longest sightline in the level, so the longest spawn.
  { z: -240, kind: 'raptor', n: 3, form: 'vee', from: 'ahead', spawn: 1500, arc: 0.55, climb: 0.22, life: 7.5 },
  // Batteries land at -1980…-2600, inside the trough — hence bank 250 ≈ inner.
  { z: -1200, kind: 'bulwark', n: 3, form: 'banks', first: 780, step: 310, bank: 250 },
  { z: -2400, kind: 'raptor', n: 4, form: 'echelon', from: 'ahead', spawn: 1300, arc: -0.60, climb: 0.18, skill: 0.18, life: 8 },
  // Rear pressure over the approach to the slot: the one attack that works in a
  // place too tight to turn around in, and it leaves the frame ahead empty.
  { z: -3000, kind: 'raptor', n: 3, form: 'echelon', from: 'behind', skill: 0.28 },
  // Armed past the slot's exit key, so they resolve as the walls open out.
  { z: -3900, kind: 'hornet', n: 2, form: 'pair', from: 'ahead', spawn: 1550, arc: 0.28, climb: 0.12, skill: 0.24, life: 11 },
  { z: -4500, kind: 'raptor', n: 5, form: 'vee', from: 'ahead', spawn: 1250, arc: 0.48, climb: -0.24, skill: 0.3, aggro: 0.14, hunt: true, life: 8.5 },
  // Contact at ≈ -6470, mid-pass, head-on while the rail is 160 m up.
  { z: -5400, kind: 'vanguard', n: 1, form: 'pair', from: 'ahead', spawn: 2300, arc: -0.05, climb: 0.14, skill: 0.38, aggro: 0.22, life: 24, close: 200, escort: 2 },
  { z: -6200, kind: 'hornet', n: 3, form: 'vee', from: 'ahead', spawn: 1450, arc: 0.4, climb: -0.12, skill: 0.46, aggro: 0.24, life: 9 },
  // Batteries land at -8200…-9040: the shelf, wide and back at rail height.
  { z: -7500, kind: 'bulwark', n: 4, form: 'banks', first: 700, step: 280, bank: 560 },
  { z: -8000, kind: 'hornet', n: 3, form: 'vee', from: 'ahead', spawn: 1450, arc: -0.36, climb: 0.18, skill: 0.5, aggro: 0.26, life: 10 },
  // The finale. `boss:` rather than `kind:` is the whole difference between a
  // heavy contact that flies past and a fight that can be won — it routes to
  // spawnBoss, which station-keeps the rig, publishes the health bar and ends
  // the mission when the last weak point dies.
  { z: -8300, boss: 'commander:ice' },
];

const FICHINA_COMMS = [
  { z: -120, who: 'PEPPY', text: 'Fichina. Open ice ahead — it closes up fast.' },
  { z: -1180, who: 'SLIPPY', text: 'Batteries dug into the trough wall!' },
  { z: -3250, who: 'FALCO', text: 'That slot is barely wider than a wing. Line it up.' },
  { z: -4450, who: 'PEPPY', text: 'It opens out here, Fox. Use the room while you have it.' },
  { z: -5150, who: 'SLIPPY', text: 'Reading a climb — the pass runs high over the ice.' },
  { z: -6750, who: 'FALCO', text: 'Crevasse coming up. Straight through!' },
  { z: -8250, who: 'PEPPY', text: 'That gun platform is the objective. Find the weak points!' },
];

/* ── Sector Omega ─────────────────────────────────────────────────────────────
   No `bulwark` anywhere in this table, and that is a hard constraint rather than
   a taste call: ground batteries are placed at `groundAt(x, z) + 3.2`
   (`combat.js:649`), and a field world answers -Infinity because it has no
   ground. A battery here would be placed at negative infinity.

   Everything else works untouched. The rail exists, so `from: 'ahead'` spawn
   distances, formations, arcs and lifetimes all mean exactly what they mean in
   a canyon — which is the point of the backend being a world-lane concern. */
const OMEGA_WAVES = [
  { z: -300, kind: 'raptor', n: 4, form: 'vee', from: 'ahead', spawn: 1500, arc: -0.5, climb: 0.3, skill: 0.3, life: 8 },
  { z: -1100, kind: 'wasp', n: 5, form: 'swarm', from: 'ahead', spawn: 1500, arc: 0.1, climb: -0.4, skill: 0.32, life: 8, markFor: 2.2, stagger: 0.6 },
  { z: -1900, kind: 'raptor', n: 5, form: 'echelon', from: 'ahead', spawn: 1350, arc: 0.62, climb: 0.18, skill: 0.36, aggro: 0.16, life: 8.5 },
  { z: -2700, kind: 'hornet', n: 3, form: 'vee', from: 'ahead', spawn: 1600, arc: -0.3, climb: 0.34, skill: 0.4, aggro: 0.2, life: 11 },
  { z: -3600, kind: 'raptor', n: 4, form: 'echelon', from: 'behind', skill: 0.4 },
  { z: -4400, kind: 'wasp', n: 6, form: 'swarm', from: 'ahead', spawn: 1450, arc: -0.15, climb: 0.5, skill: 0.42, life: 8.5, markFor: 2.0, stagger: 0.5 },
  { z: -5300, kind: 'hornet', n: 4, form: 'vee', from: 'ahead', spawn: 1550, arc: 0.44, climb: -0.28, skill: 0.46, aggro: 0.24, life: 10.5 },
  { z: -6300, kind: 'vanguard', n: 1, form: 'pair', from: 'ahead', spawn: 2300, arc: 0.05, climb: -0.12, skill: 0.5, aggro: 0.28, life: 26, close: 200, escort: 2 },
  { z: -7300, kind: 'raptor', n: 6, form: 'vee', from: 'ahead', spawn: 1300, arc: -0.55, climb: 0.24, skill: 0.5, aggro: 0.3, hunt: true, life: 9 },
  { z: -8200, kind: 'hornet', n: 4, form: 'echelon', from: 'ahead', spawn: 1500, arc: 0.36, climb: 0.3, skill: 0.55, aggro: 0.32, life: 11 },
  { z: -8800, boss: 'commander:void' },
];

const OMEGA_COMMS = [
  { z: -160, who: 'PEPPY', text: 'Sector Omega. No ground, no horizon — watch your six.' },
  { z: -1050, who: 'SLIPPY', text: 'Rocks everywhere! I can barely get a lock!' },
  { z: -2650, who: 'FALCO', text: "Now this is more like it. Try and keep up, Fox." },
  { z: -3560, who: 'PEPPY', text: 'Behind you! Use the rocks, Fox — break their line!' },
  { z: -5250, who: 'SLIPPY', text: "Something big just lit up on the far side of the belt." },
  { z: -6260, who: 'FALCO', text: "That's their heavy. Nowhere to hide out here." },
  { z: -8760, who: 'PEPPY', text: 'Flagship dead ahead, Fox. This is the one.' },
];

/* ── The Foundry ──────────────────────────────────────────────────────────────
   The one level where the corridor closes over you, so the encounter rules are
   different in one specific way: `spawn` distances are shorter throughout,
   because a roofed bay has no sightline to spend them on — a craft arriving
   1500 m out in a tunnel simply pops into existence at the far end of it. */
const FOUNDRY_WAVES = [
  { z: -280, kind: 'raptor', n: 4, form: 'vee', from: 'ahead', spawn: 1100, arc: 0.5, climb: 0.2, skill: 0.34, life: 8 },
  { z: -1000, kind: 'bulwark', n: 4, form: 'banks', first: 620, step: 250, bank: 170 },
  { z: -1700, kind: 'raptor', n: 5, form: 'echelon', from: 'ahead', spawn: 950, arc: -0.55, climb: 0.16, skill: 0.38, aggro: 0.18, life: 8 },
  { z: -2500, kind: 'hornet', n: 3, form: 'vee', from: 'ahead', spawn: 1000, arc: 0.3, climb: 0.24, skill: 0.42, aggro: 0.2, life: 10 },
  { z: -3300, kind: 'raptor', n: 4, form: 'echelon', from: 'behind', skill: 0.42 },
  { z: -4100, kind: 'bulwark', n: 4, form: 'banks', first: 600, step: 240, bank: 170 },
  { z: -4900, kind: 'wasp', n: 6, form: 'swarm', from: 'ahead', spawn: 1050, arc: -0.1, climb: 0.4, skill: 0.44, life: 8.5, markFor: 2.0, stagger: 0.5 },
  { z: -5800, kind: 'hornet', n: 4, form: 'vee', from: 'ahead', spawn: 1000, arc: 0.38, climb: -0.2, skill: 0.48, aggro: 0.26, life: 10.5 },
  { z: -6700, kind: 'vanguard', n: 1, form: 'pair', from: 'ahead', spawn: 1600, arc: 0, climb: 0.1, skill: 0.52, aggro: 0.3, life: 26, close: 210, escort: 2 },
  { z: -7600, kind: 'raptor', n: 6, form: 'vee', from: 'ahead', spawn: 950, arc: -0.5, climb: 0.22, skill: 0.52, aggro: 0.32, hunt: true, life: 9 },
  // The last fight in the game. Reuses the carrier: it is the only capital hull
  // built, and a bespoke foundry boss is the obvious next thing rather than
  // something to fake with a third commander variant.
  { z: -8500, boss: 'gargantua' },
];

const FOUNDRY_COMMS = [
  { z: -160, who: 'PEPPY', text: 'This is it, Fox. Whatever they built in here, we end it.' },
  { z: -960, who: 'SLIPPY', text: 'Emplacements on the deck! They dug in good.' },
  { z: -2460, who: 'FALCO', text: 'Watch the roof sections — no room to climb out.' },
  { z: -4860, who: 'SLIPPY', text: 'Drones pouring out of the bulkhead ports!' },
  { z: -6660, who: 'PEPPY', text: 'Heavy inbound. Keep it in front of you.' },
  { z: -8440, who: 'PEPPY', text: "That's their carrier. Finish this, Fox." },
];

export const LEVELS = [
  {
    id: 'corneria', name: 'CORNERIA', dna: 'corneria', env: 'corneria',
    brief: 'SECTOR I · CORNERIA LOWLANDS',
    waves: CORNERIA_WAVES, comms: CORNERIA_COMMS, grants: CORNERIA_GRANTS,
    // The way OUT of this level: up the valley, not off the planet.
    hop: 'overland',
  },
  {
    // Same planet, 4 km higher: the ice cap Corneria's river drains from. The
    // internal `dna` and `env` keys stay 'fichina' because they are keys — the
    // env preset, the planet palette in fx/transit.js and the enemy materials
    // are all keyed off that string and renaming them buys nothing.
    id: 'highlands', name: 'HIGHLANDS', dna: 'fichina', env: 'fichina',
    brief: 'SECTOR II · CORNERIA HIGHLANDS',
    waves: FICHINA_WAVES, comms: FICHINA_COMMS, grants: [],
    hop: 'orbital',
  },
  {
    id: 'omega', name: 'SECTOR OMEGA', dna: 'omega', env: 'space',
    brief: 'SECTOR III · SECTOR OMEGA',
    waves: OMEGA_WAVES, comms: OMEGA_COMMS, grants: [],
    hop: 'orbital',
  },
  {
    id: 'foundry', name: 'THE FOUNDRY', dna: 'foundry', env: 'foundry',
    brief: 'SECTOR IV · THE FOUNDRY',
    waves: FOUNDRY_WAVES, comms: FOUNDRY_COMMS, grants: [],
  },
];

export function installCampaign(ctx, startIndex = 0) {
  const state = {
    index: startIndex,
    phase: 'play',        // play | lap | ascent | space | approach | reentry
    t: 0,                 // seconds inside the current phase
    lapT: 0,
    building: false,
    progress: 1,
    /** Published for the HUD. Null except during a hop. */
    hud: null,
  };

  const level = () => LEVELS[state.index];
  const next = () => LEVELS[state.index + 1] || null;
  /** The transition out of the level being flown. */
  const hop = () => HOPS[level().hop] || HOPS.orbital;

  function begin() {
    const to = next();
    if (!to) return;                         // last level: the win card stands
    state.phase = hop().order[0];
    state.t = 0;
    // A belt has no body to arrive at, so the approach must not grow a planet
    // out of the star field and then not be there.
    ctx.fx.transit?.enter(level().env, to.env, {
      destBody: (DNA_BY_ID[to.dna].backend ?? 'terrain') !== 'field',
    });
    // Clearing the outcome fades the MISSION COMPLETE card back out; it has had
    // the whole victory lap on screen by now. The final level never gets here,
    // so its card is the one that holds.
    ctx.state.outcome = null;
    ctx.flight.detached = true;
  }

  /** Swap the world, the rail and the wave tables over to the next level. */
  function startRebuild() {
    const to = next();
    state.building = true;
    state.progress = 0;
    ctx.world.rebuild(DNA_BY_ID[to.dna]);
    // Rail and combat move together: the wave table is indexed by `railZ`, so a
    // reset of one without the other either replays or skips a level.
    ctx.flight.resetRail();
    ctx.combat.resetForLevel(to);
    setWorldVisible(false);
  }

  function arrive() {
    state.index++;
    state.phase = 'play';
    state.t = 0;
    state.building = false;
    state.hud = null;
    setWorldVisible(true);
    ctx.fx.transit?.exit();
    ctx.flight.detached = false;
    ctx.flight.climb = 0;
    ctx.combat.say('PEPPY', `Entering ${level().name} airspace. Stay sharp!`);
  }

  function setWorldVisible(v) { ctx.world.root.visible = v; }

  function update(dt) {
    const s = ctx.state;

    if (state.phase === 'play') {
      // A win with a level still to come starts the lap; a win on the last level
      // is the end of the game and is left alone.
      if (s.outcome === 'win' && next()) { state.phase = 'lap'; state.lapT = 0; }
      return;
    }

    if (state.phase === 'lap') {
      state.lapT += dt;
      const past = ctx.flight.railZ <= WORLD.zEnd;
      if (past || state.lapT >= LAP_MAX) begin();
      return;
    }

    /* ── the hop ──────────────────────────────────────────────────────────── */
    state.t += dt;
    const H = hop();
    const dur = H.dur[state.phase];
    const u = Math.min(1, state.t / dur);
    // An overland hop reuses the orbital phases it can and skips the two that
    // draw a planet, so it maps its own phase names onto transit's.
    if (H.transit) {
      const m = H.transit[state.phase];
      if (m) ctx.fx.transit?.setPhase(m[0], m[1] == null ? u : m[1]);
    } else {
      ctx.fx.transit?.setPhase(state.phase, u);
    }

    // Altitude. The sky alone does not sell leaving a planet — without this the
    // banner reads LEAVING ATMOSPHERE over a ship still skimming the water.
    // Climbing on ascent and shedding it on re-entry is also what puts the ground
    // back under the ship at exactly the moment the terrain is unhidden.
    const ease = (p) => p * p * (3 - 2 * p);
    const first = H.order[0], last = H.order[H.order.length - 1];
    if (state.phase === first) ctx.flight.climb = ease(u) * H.climb;
    else if (state.phase === last) ctx.flight.climb = (1 - ease(u)) * H.climb;
    else ctx.flight.climb = H.climb;

    if (state.building) {
      state.progress = ctx.world.step(BUILD_MS);
      if (state.progress >= 1) state.building = false;
    }

    // The terrain comes back at the commit point of the last phase, which is
    // where the destination preset lands — before that the sky is still the old
    // world's.
    if (state.phase === last && u >= 0.62 && !ctx.world.root.visible) setWorldVisible(true);

    state.hud = {
      phase: state.phase,
      label: H.label[state.phase],
      to: next()?.brief ?? '',
      // The bar tracks the whole hop, not the mesh job: the player is being told
      // how long this lasts, and the mesh finishes long before the sequence does.
      progress: (H.order.indexOf(state.phase) + u) / H.order.length,
      loading: state.building ? state.progress : 1,
    };

    if (u >= 1) {
      const i = H.order.indexOf(state.phase);
      if (i === H.order.length - 1) { arrive(); return; }
      state.phase = H.order[i + 1];
      state.t = 0;
      if (state.phase === H.buildAt) startRebuild();
    }
  }

  const api = {
    get index() { return state.index; },
    get level() { return level(); },
    get next() { return next(); },
    get phase() { return state.phase; },
    /** True while the ship is off-world — the HUD hides the radar and threat arcs. */
    get hopping() { return state.phase !== 'play' && state.phase !== 'lap'; },
    get hud() { return state.hud; },
    update,
    /** Dev: jump straight into the hop from wherever the ship is. */
    forceHop() { if (state.phase === 'play' || state.phase === 'lap') begin(); },
  };
  // Booting mid-campaign: the world is already built from this level's DNA, but
  // combat still holds the first level's tables. The rail is at 0 either way, so
  // only the tables need moving.
  if (startIndex > 0) ctx.combat.resetForLevel(level());

  ctx.state.campaign = api;
  return api;
}

