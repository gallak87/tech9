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

/** Seconds in each phase of the hop. The lap is bounded by the rail, not time. */
const PHASE = {
  ascent: 3.5,
  space: 2.0,
  approach: 6.0,
  reentry: 3.0,
};
const ORDER = ['ascent', 'space', 'approach', 'reentry'];

// Hard ceiling on the victory lap, in case the rail never reaches `zEnd` —
// killing the carrier early with the dev tool leaves several km to fly, and a
// transition that waits 40 s reads as a hang.
const LAP_MAX = 14;

// Per-frame mesh budget during the hop. Generous because nothing else is
// competing: the terrain is hidden and the field is empty.
const BUILD_MS = 6;

// Metres climbed during the ascent and shed again on re-entry. Large enough that
// the corridor walls fall out of frame and the horizon curves.
const CLIMB = 2200;

/* ── Fichina ──────────────────────────────────────────────────────────────────
   Shorter and colder than Corneria: no weapon grants, because the run carries
   its tier across the hop, and no wasp swarms — the trough is a 200–260 m slot
   with sheer walls, so the level's pressure comes from the corridor rather than
   from filling it with drones.

   The finale spawns `commander:ice` through the ordinary enemy path. It fights
   as a heavy contact, NOT yet as a boss: no health bar, no station-keeping, no
   win trigger. Wiring the commander to the boss plumbing is the next task. */
const FICHINA_WAVES = [
  { z: -260, kind: 'raptor', n: 3, form: 'vee', from: 'ahead', spawn: 1250, arc: 0.55, climb: 0.22, life: 7.5 },
  { z: -900, kind: 'bulwark', n: 3, form: 'banks', first: 760, step: 320, bank: 95 },
  { z: -1500, kind: 'raptor', n: 4, form: 'echelon', from: 'ahead', spawn: 1300, arc: -0.60, climb: 0.18, skill: 0.18, life: 8 },
  { z: -2200, kind: 'hornet', n: 2, form: 'pair', from: 'ahead', spawn: 1550, arc: 0.28, climb: 0.12, skill: 0.24, life: 11 },
  { z: -2900, kind: 'bulwark', n: 4, form: 'banks', first: 720, step: 290, bank: 88 },
  { z: -3500, kind: 'raptor', n: 5, form: 'vee', from: 'ahead', spawn: 1250, arc: 0.48, climb: -0.24, skill: 0.3, aggro: 0.14, hunt: true, life: 8.5 },
  { z: -4300, kind: 'hornet', n: 3, form: 'vee', from: 'ahead', spawn: 1500, arc: -0.34, climb: 0.2, skill: 0.34, aggro: 0.16, life: 10.5 },
  { z: -5100, kind: 'raptor', n: 4, form: 'echelon', from: 'behind', skill: 0.28 },
  { z: -5900, kind: 'vanguard', n: 1, form: 'pair', from: 'ahead', spawn: 2300, arc: -0.05, climb: 0.14, skill: 0.38, aggro: 0.22, life: 24, close: 200, escort: 2 },
  { z: -6800, kind: 'bulwark', n: 4, form: 'banks', first: 700, step: 270, bank: 82 },
  { z: -7400, kind: 'hornet', n: 3, form: 'vee', from: 'ahead', spawn: 1450, arc: 0.4, climb: -0.12, skill: 0.46, aggro: 0.24, life: 10 },
  { z: -8300, kind: 'commander:ice', n: 1, form: 'pair', from: 'ahead', spawn: 2400, arc: 0, climb: 0.1, skill: 0.5, aggro: 0.3, life: 40, close: 260 },
];

const FICHINA_COMMS = [
  { z: -140, who: 'PEPPY', text: 'Fichina. Watch the ice — that trough gets tight.' },
  { z: -880, who: 'SLIPPY', text: 'Batteries dug into the ridge line!' },
  { z: -2180, who: 'FALCO', text: 'Gunboats again. You know the drill.' },
  { z: -3480, who: 'FALCO', text: "They're on me! Somebody get them off!" },
  { z: -5880, who: 'PEPPY', text: 'Transport coming out of the whiteout, Fox.' },
  { z: -8200, who: 'PEPPY', text: 'That gun platform is the objective. Find the weak points!' },
];

export const LEVELS = [
  {
    id: 'corneria', name: 'CORNERIA', dna: 'corneria', env: 'corneria',
    brief: 'SECTOR I · CORNERIA',
    waves: CORNERIA_WAVES, comms: CORNERIA_COMMS, grants: CORNERIA_GRANTS,
  },
  {
    id: 'fichina', name: 'FICHINA', dna: 'fichina', env: 'fichina',
    brief: 'SECTOR II · FICHINA',
    waves: FICHINA_WAVES, comms: FICHINA_COMMS, grants: [],
  },
];

export function installCampaign(ctx) {
  const state = {
    index: 0,
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

  function begin() {
    const to = next();
    if (!to) return;                         // last level: the win card stands
    state.phase = 'ascent';
    state.t = 0;
    ctx.fx.transit?.enter(level().env, to.env);
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
    const dur = PHASE[state.phase];
    const u = Math.min(1, state.t / dur);
    ctx.fx.transit?.setPhase(state.phase, u);

    // Altitude. The sky alone does not sell leaving a planet — without this the
    // banner reads LEAVING ATMOSPHERE over a ship still skimming the water.
    // Climbing on ascent and shedding it on re-entry is also what puts the ground
    // back under the ship at exactly the moment the terrain is unhidden.
    const ease = (p) => p * p * (3 - 2 * p);
    if (state.phase === 'ascent') ctx.flight.climb = ease(u) * CLIMB;
    else if (state.phase === 'reentry') ctx.flight.climb = (1 - ease(u)) * CLIMB;
    else ctx.flight.climb = CLIMB;

    if (state.building) {
      state.progress = ctx.world.step(BUILD_MS);
      if (state.progress >= 1) state.building = false;
    }

    // The terrain comes back at the re-entry commit point, which is where the
    // destination preset lands — before that the sky is still the old world's.
    if (state.phase === 'reentry' && u >= 0.62 && !ctx.world.root.visible) setWorldVisible(true);

    state.hud = {
      phase: state.phase,
      label: PHASE_LABEL[state.phase],
      to: next()?.brief ?? '',
      // The bar tracks the whole hop, not the mesh job: the player is being told
      // how long this lasts, and the mesh finishes long before the sequence does.
      progress: (ORDER.indexOf(state.phase) + u) / ORDER.length,
      loading: state.building ? state.progress : 1,
    };

    if (u >= 1) {
      const i = ORDER.indexOf(state.phase);
      if (i === ORDER.length - 1) { arrive(); return; }
      state.phase = ORDER[i + 1];
      state.t = 0;
      if (state.phase === 'space') startRebuild();
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
  ctx.state.campaign = api;
  return api;
}

const PHASE_LABEL = {
  ascent: 'LEAVING ATMOSPHERE',
  space: 'ORBITAL TRANSIT',
  approach: 'APPROACH',
  reentry: 'RE-ENTRY',
};
