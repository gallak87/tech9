import { DNA_BY_ID } from '../world/dna.js';
// `WORLD` is mutated in place by `setActiveDNA`, so it is the live corridor
// extent — reading `zEnd` off the level's own DNA would be a frame ahead of the
// terrain during a rebuild.
import { WORLD, railOverSurface } from '../world/profile.js';
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

   An ORBITAL hop says "different planet". It carries every transition in the
   campaign except the first: Highlands to Omega, then Omega, Aquas, Fortuna
   and the Foundry each to the level after it. Venom carries no `hop` at all,
   because it is the finale and the win card is what holds.

   An OVERLAND hop says "further up the same valley". Used once, Corneria to
   the Highlands, and the only transition that is not orbital. Those two sectors
   are one river system: the lowland reach and, above it, the ice cap it drains
   from. They share a landform grammar because they are the same landform, which is
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
    // Read instead when the world being left has no body, and so no atmosphere
    // to leave.
    vacuumLabel: { ascent: 'DEPARTING SECTOR' },
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

/** A `field` world is a belt: no globe to grow in the frame, arriving or leaving. */
const hasBody = (dnaId) => (DNA_BY_ID[dnaId].backend ?? 'terrain') !== 'field';

/* The victory lap, floor and ceiling.

   THE FLOOR IS THE ONE THAT WAS MISSING. The lap ended on `railZ <= zEnd`, and
   every boss in the game is armed close enough to the end of its corridor that a
   fight of normal length finishes with the rail already well past it — Corneria's
   carrier arms at z -8300 against a zEnd of -9840, which is 8.8 s of rail for a
   fight that takes about 45 s. So the test was true on the tick the boss died and
   the hop opened on the next one: the kill, the win card and the ascent all
   landed on the same beat. Owner, live play: "boss dies and it like immediately
   starts transitioning, kind of abrupt."

   Seven seconds is picked off the two things it has to cover: a capital ship
   comes apart over four (`updateBoss`), and the wing's victory pass runs about
   seven from the kill to the last pilot back on its slot (`ai.js`, `lap`). Under
   that the hop opens over a squadron still out of formation.

   The ceiling is unchanged and is for the opposite case: killing the carrier
   early with the dev tool leaves several km to fly, and a transition that waits
   40 s reads as a hang. */
// Metres of clearance the lap leaves over a surface it lifts the ship through.
// Enough that the ship is flying over it rather than sitting in it, and clear of
// the offset box's 46 m of down-stick.
const SURFACE_CLEAR = 95;

const LAP_MIN = 7;
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

   `drops` (2026-08-16) follows the same authoring rules as Corneria's — see the
   `## drops` block in combat.js. Every level past the first carries weapon drops
   even though the tier survives `resetForLevel` and a campaign player arrives at
   the top of the table: booting straight into a level with `?level=highlands`
   starts at tier 0 with no `grants` row to fix it, so without drops the later
   levels were only completable by flying the campaign from level 1. A weapon
   drop collected at full tier pays out a bomb (`grantWeapon`), so the campaign
   player is not handed a dud.

   Nothing sorts or validates this table, so it stays z-descending by hand.

   The finale is a real boss as of 2026-08-15 — see the `boss:` row below. */
const FICHINA_WAVES = [
  // Open icefield: the longest sightline in the level, so the longest spawn.
  { z: -240, kind: 'raptor', n: 3, form: 'vee', from: 'ahead', spawn: 1500, arc: 0.55, climb: 0.22, life: 7.5 },
  // Batteries land at -1980…-2600, inside the trough — hence bank 250 ≈ inner.
  { z: -1200, kind: 'bulwark', n: 3, form: 'banks', first: 780, step: 310, bank: 250, drops: ['health'] },
  { z: -2400, kind: 'raptor', n: 4, form: 'echelon', from: 'ahead', spawn: 1300, arc: -0.60, climb: 0.18, skill: 0.18, life: 8 },
  // Rear pressure over the approach to the slot: the one attack that works in a
  // place too tight to turn around in, and it leaves the frame ahead empty.
  { z: -3000, kind: 'raptor', n: 3, form: 'echelon', from: 'behind', skill: 0.28 },
  // Armed past the slot's exit key, so they resolve as the walls open out.
  { z: -3900, kind: 'hornet', n: 2, form: 'pair', from: 'ahead', spawn: 1550, arc: 0.28, climb: 0.12, skill: 0.24, life: 11, drops: ['weapon'] },
  { z: -4500, kind: 'raptor', n: 5, form: 'vee', from: 'ahead', spawn: 1250, arc: 0.48, climb: -0.24, skill: 0.3, aggro: 0.14, hunt: true, life: 8.5, drops: ['bomb'] },
  // Contact at ≈ -6470, mid-pass, head-on while the rail is 160 m up.
  { z: -5400, kind: 'vanguard', n: 1, form: 'pair', from: 'ahead', spawn: 2300, arc: -0.05, climb: 0.14, skill: 0.38, aggro: 0.22, life: 24, close: 200, escort: 2, drops: ['weapon', 'health'] },
  { z: -6200, kind: 'hornet', n: 3, form: 'vee', from: 'ahead', spawn: 1450, arc: 0.4, climb: -0.12, skill: 0.46, aggro: 0.24, life: 9 },
  // Batteries land at -8200…-9040: the shelf, wide and back at rail height.
  { z: -7500, kind: 'bulwark', n: 4, form: 'banks', first: 700, step: 280, bank: 560, drops: ['health', 'bomb'] },
  { z: -8000, kind: 'hornet', n: 3, form: 'vee', from: 'ahead', spawn: 1450, arc: -0.36, climb: 0.18, skill: 0.5, aggro: 0.26, life: 10, drops: ['health'] },
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
  { z: -2700, kind: 'hornet', n: 3, form: 'vee', from: 'ahead', spawn: 1600, arc: -0.3, climb: 0.34, skill: 0.4, aggro: 0.2, life: 11, drops: ['weapon', 'health'] },
  { z: -3600, kind: 'raptor', n: 4, form: 'echelon', from: 'behind', skill: 0.4 },
  { z: -4400, kind: 'wasp', n: 6, form: 'swarm', from: 'ahead', spawn: 1450, arc: -0.15, climb: 0.5, skill: 0.42, life: 8.5, markFor: 2.0, stagger: 0.5 },
  { z: -5300, kind: 'hornet', n: 4, form: 'vee', from: 'ahead', spawn: 1550, arc: 0.44, climb: -0.28, skill: 0.46, aggro: 0.24, life: 10.5, drops: ['weapon', 'bomb'] },
  { z: -6300, kind: 'vanguard', n: 1, form: 'pair', from: 'ahead', spawn: 2300, arc: 0.05, climb: -0.12, skill: 0.5, aggro: 0.28, life: 26, close: 200, escort: 2, drops: ['weapon', 'health'] },
  { z: -7300, kind: 'raptor', n: 6, form: 'vee', from: 'ahead', spawn: 1300, arc: -0.55, climb: 0.24, skill: 0.5, aggro: 0.3, hunt: true, life: 9 },
  { z: -8200, kind: 'hornet', n: 4, form: 'echelon', from: 'ahead', spawn: 1500, arc: 0.36, climb: 0.3, skill: 0.55, aggro: 0.32, life: 11, drops: ['health', 'bomb'] },
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
  // u = bank + rand(0,85), and the deck ends at half = 190 — past that a
  // battery is placed inside the massing.
  { z: -1000, kind: 'bulwark', n: 4, form: 'banks', first: 620, step: 250, bank: 96, drops: ['health'] },
  { z: -1700, kind: 'raptor', n: 5, form: 'echelon', from: 'ahead', spawn: 950, arc: -0.55, climb: 0.16, skill: 0.38, aggro: 0.18, life: 8 },
  { z: -2500, kind: 'hornet', n: 3, form: 'vee', from: 'ahead', spawn: 1000, arc: 0.3, climb: 0.24, skill: 0.42, aggro: 0.2, life: 10, drops: ['weapon'] },
  { z: -3300, kind: 'raptor', n: 4, form: 'echelon', from: 'behind', skill: 0.42 },
  { z: -4100, kind: 'bulwark', n: 4, form: 'banks', first: 600, step: 240, bank: 96, drops: ['health', 'bomb'] },
  { z: -4900, kind: 'wasp', n: 6, form: 'swarm', from: 'ahead', spawn: 1050, arc: -0.1, climb: 0.4, skill: 0.44, life: 8.5, markFor: 2.0, stagger: 0.5 },
  { z: -5800, kind: 'hornet', n: 4, form: 'vee', from: 'ahead', spawn: 1000, arc: 0.38, climb: -0.2, skill: 0.48, aggro: 0.26, life: 10.5, drops: ['weapon', 'health'] },
  { z: -6700, kind: 'vanguard', n: 1, form: 'pair', from: 'ahead', spawn: 1600, arc: 0, climb: 0.1, skill: 0.52, aggro: 0.3, life: 26, close: 210, escort: 2, drops: ['weapon', 'health'] },
  { z: -7600, kind: 'raptor', n: 6, form: 'vee', from: 'ahead', spawn: 950, arc: -0.5, climb: 0.22, skill: 0.52, aggro: 0.32, hunt: true, life: 9, drops: ['health', 'bomb'] },
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

/* ── Aquas ────────────────────────────────────────────────────────────────────
   Every spawn distance in this table is shorter than the equivalent one in an
   air level, and that is the level's fog, not a taste call: at density 0.00062
   a contact 1500 m out is 76% extinction, so it does not enter the frame, it
   fades up in the middle of it. 1000-1200 m is where a hostile crosses out of
   the murk with time left to read it — the same reasoning the Foundry applies
   to a roofed bay, arrived at from the opposite direction.

   Zone boundaries, for placing anything against the shape:
     720 basin -1380 reach -2980 narrows -3740 basin/drop-off -5440 gorge
     -6940 narrows -7640 basin -9840
   Batteries are in the three basins only, and clear of the `climb` blends at
   -3740, -5440 and -7640 — a battery placed while the rail is descending sits
   over the ship instead of under it. */
const AQUAS_WAVES = [
  { z: -220, kind: 'raptor', n: 4, form: 'vee', from: 'ahead', spawn: 1150, arc: 0.52, climb: 0.26, skill: 0.40, life: 8 },
  // Lands -1000…-1560: the shelf, wide and shallow. bank 620 ≈ inner 640.
  { z: -400, kind: 'bulwark', n: 3, form: 'banks', first: 640, step: 260, bank: 620, drops: ['health'] },
  { z: -1500, kind: 'wasp', n: 5, form: 'swarm', from: 'ahead', spawn: 1050, arc: -0.14, climb: 0.42, skill: 0.42, life: 8, markFor: 2.1, stagger: 0.55 },
  { z: -2300, kind: 'raptor', n: 5, form: 'echelon', from: 'ahead', spawn: 1000, arc: -0.58, climb: 0.20, skill: 0.44, aggro: 0.20, life: 8, drops: ['weapon'] },
  // Rear pressure into the swim-through. Nothing is armed to make contact
  // inside it: -2980…-3740 is looked at, not fought in.
  { z: -3000, kind: 'raptor', n: 3, form: 'echelon', from: 'behind', skill: 0.46 },
  // Resolves as the floor falls away — the contact and the drop-off land together.
  { z: -4000, kind: 'hornet', n: 3, form: 'vee', from: 'ahead', spawn: 1100, arc: 0.34, climb: -0.30, skill: 0.48, aggro: 0.24, life: 10.5, drops: ['bomb'] },
  // Deep basin, past the descent blend. bank 660 ≈ inner 700.
  { z: -4500, kind: 'bulwark', n: 4, form: 'banks', first: 620, step: 250, bank: 660, drops: ['health'] },
  { z: -5300, kind: 'raptor', n: 6, form: 'vee', from: 'ahead', spawn: 950, arc: 0.50, climb: 0.24, skill: 0.50, aggro: 0.28, hunt: true, life: 8.5 },
  { z: -6100, kind: 'vanguard', n: 1, form: 'pair', from: 'ahead', spawn: 1700, arc: 0.04, climb: 0.10, skill: 0.52, aggro: 0.28, life: 26, close: 205, escort: 2, drops: ['weapon', 'health'] },
  { z: -7100, kind: 'hornet', n: 4, form: 'echelon', from: 'ahead', spawn: 1050, arc: -0.38, climb: 0.22, skill: 0.54, aggro: 0.30, life: 11, drops: ['health'] },
  // Far shelf. bank 560 ≈ inner 620, and past the +85 climb out of the trench.
  { z: -8150, kind: 'bulwark', n: 4, form: 'banks', first: 600, step: 240, bank: 560, drops: ['bomb'] },
  { z: -8600, boss: 'commander:tide' },
];

const AQUAS_COMMS = [
  { z: -140, who: 'PEPPY', text: 'Surface is coming up fast, Fox. Once you are under it, you are staying under it.' },
  { z: -380, who: 'SLIPPY', text: 'Emplacements all across the reef!' },
  { z: -2900, who: 'FALCO', text: 'That gap in the coral is the only way through. Thread it.' },
  { z: -3900, who: 'SLIPPY', text: 'Floor is dropping away — sonar just lost the bottom.' },
  { z: -5350, who: 'PEPPY', text: 'They are on the wingmen, Fox. Break them off!' },
  { z: -6060, who: 'FALCO', text: 'Heavy coming up out of the trench.' },
  { z: -8550, who: 'PEPPY', text: 'Submersible on the shelf. That is the objective — find the pods!' },
];

/* ── Fortuna ──────────────────────────────────────────────────────────────────
   The opposite constraint to Aquas: fog density 0.00034 and every hostile
   carrying a lamp against a black sky, so this is the longest sightline in the
   game and the spawns are the longest with it. A wave armed at 1600 m here is
   visible for its whole approach, which is what makes the level readable at
   night rather than a set of things that appear at 400 m.

   THE LEVEL HAS NO BANKS. It is a drowned forest — open water bank to bank,
   with the corridor made of trunks — so the only ground a battery can stand on
   is the six mud bars in `islands.fixed`, and each of the three `banks` waves
   is authored ONTO one pair. All three of `bank`, `first` and `step` are part
   of that fit. `bank` 430 is where the bar tops are flat; `step` 150 keeps the
   line inside one bar, where 290 ran the outer guns off the end of it; and
   `first` 1500 is what makes a gun that far out a target at all — at 700 it
   sits 31° off the nose, which is the angle `combat.js` moved every battery in
   the game away from. Move one of these and the wave stops working.

   Zone boundaries:
     720 crowns -780 plunge -2180 reach -3480 stand -4680 clearing -5830
     hollow -7280 gallery -8280 bloom -9840

   The rail descends from 860 to 125 across those, so a wave's altitude changes
   with where it fires far more than on any other level. */
const FORTUNA_WAVES = [
  { z: -260, kind: 'raptor', n: 4, form: 'vee', from: 'ahead', spawn: 1650, arc: -0.50, climb: 0.24, skill: 0.44, life: 8.5 },
  // In the plunge, taken head-on at 43° of nose down.
  { z: -1450, kind: 'hornet', n: 3, form: 'vee', from: 'ahead', spawn: 1600, arc: 0.32, climb: 0.18, skill: 0.48, aggro: 0.24, life: 10.5, drops: ['weapon'] },
  // Lands -3930…-4230 on the first bar pair, under a rail held at 205.
  { z: -2430, kind: 'bulwark', n: 3, form: 'banks', first: 1500, step: 150, bank: 430, drops: ['health'] },
  { z: -2900, kind: 'raptor', n: 5, form: 'echelon', from: 'ahead', spawn: 1500, arc: 0.60, climb: -0.22, skill: 0.50, aggro: 0.26, life: 8.5 },
  { z: -4300, kind: 'raptor', n: 4, form: 'echelon', from: 'behind', skill: 0.52 },
  // The clearing: the one place in the forest with room to turn, and the only
  // wave in the level that has any.
  { z: -5100, kind: 'wasp', n: 6, form: 'swarm', from: 'ahead', spawn: 1450, arc: -0.10, climb: 0.46, skill: 0.50, life: 8.5, markFor: 2.0, stagger: 0.5, drops: ['bomb'] },
  { z: -5800, kind: 'hornet', n: 4, form: 'vee', from: 'ahead', spawn: 1550, arc: -0.40, climb: 0.26, skill: 0.56, aggro: 0.30, life: 11, drops: ['weapon', 'health'] },
  // Lands -7600…-7900, out past the gallery's masts.
  { z: -6100, kind: 'bulwark', n: 3, form: 'banks', first: 1500, step: 150, bank: 430 },
  { z: -6600, kind: 'vanguard', n: 1, form: 'pair', from: 'ahead', spawn: 2100, arc: -0.05, climb: 0.12, skill: 0.56, aggro: 0.32, life: 26, close: 205, escort: 2, drops: ['weapon', 'health'] },
  { z: -7300, kind: 'raptor', n: 6, form: 'vee', from: 'ahead', spawn: 1400, arc: 0.46, climb: 0.22, skill: 0.58, aggro: 0.34, hunt: true, life: 9 },
  // Lands -9105…-9555 on the arena's own bars, so the boss is fought over a
  // crossfire rather than into clean water.
  { z: -7605, kind: 'bulwark', n: 4, form: 'banks', first: 1500, step: 150, bank: 430, drops: ['health', 'bomb'] },
  { z: -8700, boss: 'commander:bloom' },
];

/* Each line sits just PAST the wave it is about, because both cursors
   edge-trigger off the same descending `railZ` and a warning that fires first
   is a warning about nothing. The exception is the battery lines: those waves
   place their emplacements 1500 m ahead of their own trigger, so the useful
   moment is most of a kilometre later. */
const FORTUNA_COMMS = [
  { z: -180, who: 'SLIPPY', text: 'Fox, we are over the tops of them. That whole forest is alive.' },
  { z: -1180, who: 'FALCO', text: 'Going down into it. Watch your wingtips in there.' },
  { z: -2980, who: 'PEPPY', text: 'They dug guns into the mud bars. Do not let them settle on you.' },
  { z: -4260, who: 'PEPPY', text: 'Behind you, Fox!' },
  { z: -5060, who: 'SLIPPY', text: 'Swarm in the clearing! They came out of the water!' },
  { z: -6560, who: 'FALCO', text: 'Their heavy is in the trunks with us. Keep it in front of you.' },
  { z: -8650, who: 'PEPPY', text: 'There it is — the machine that is eating this place. Intakes and the spine coil!' },
];

/* ── Venom ────────────────────────────────────────────────────────────────────
   The last level in the game, and the hardest table in it: every skill value is
   the highest of its class anywhere, the vanguard arrives with three escorts
   instead of two, and there are two rear attacks rather than one.

   Zone boundaries:
     720 rim -780 spine -2080 dive -3480 saddle -4580 climb -6080 high spine
     -7280 descent -8280 sump -9840

   THE WHOLE LEVEL IS A RIDGE. There is no channel and no wall to put anything
   against — the ground falls away to lava on both sides everywhere, so `bank`
   has to stay inside the crest or an emplacement is standing in the lava. The
   crest meets the lava between 345 m and 580 m out depending on the zone, and
   the three battery runs below sit at 240, 260 and 420 because that is what
   those three zones have.

   Batteries also stay clear of the three `climb` blends: the rail runs 400 on
   the rim, 150 in the saddle and 520 on the high spine, so one armed mid-dive is
   several hundred metres under the ship rather than beside it. Each fires inside
   one zone's HELD stretch — the zone less half a blend at each end. */
const VENOM_WAVES = [
  { z: -200, kind: 'raptor', n: 5, form: 'vee', from: 'ahead', spawn: 1300, arc: 0.54, climb: 0.24, skill: 0.50, aggro: 0.20, life: 8 },
  // Lands -40…-340, on the rim's own crest and inside its held stretch, which
  // ends at -530. bank 240 puts them on the flank at about 235, under the rail
  // at 400 — every emplacement on this level is looked DOWN at.
  { z: 200, kind: 'bulwark', n: 3, form: 'banks', first: 240, step: 150, bank: 240, drops: ['health'] },
  { z: -1400, kind: 'hornet', n: 3, form: 'vee', from: 'ahead', spawn: 1250, arc: -0.36, climb: 0.22, skill: 0.54, aggro: 0.28, life: 10.5, drops: ['weapon'] },
  { z: -2200, kind: 'raptor', n: 5, form: 'echelon', from: 'behind', skill: 0.56 },
  // Armed so it resolves in the saddle, which is the lowest and most exposed
  // the ridge gets — nothing is fought on the dive itself.
  { z: -3700, kind: 'wasp', n: 7, form: 'swarm', from: 'ahead', spawn: 1150, arc: 0.08, climb: -0.44, skill: 0.58, life: 8, markFor: 1.9, stagger: 0.45, drops: ['bomb'] },
  { z: -4200, kind: 'hornet', n: 4, form: 'echelon', from: 'ahead', spawn: 1200, arc: 0.42, climb: 0.20, skill: 0.60, aggro: 0.34, life: 11, drops: ['weapon', 'health'] },
  { z: -5600, kind: 'vanguard', n: 1, form: 'pair', from: 'ahead', spawn: 1900, arc: 0.03, climb: -0.10, skill: 0.62, aggro: 0.36, life: 28, close: 210, escort: 3, drops: ['weapon', 'health'] },
  // Lands -6380…-6700, the high spine's held stretch (-6330 to -6880). bank 260
  // is inside its port flank, which is the sheer one.
  { z: -6000, kind: 'bulwark', n: 3, form: 'banks', first: 380, step: 160, bank: 260, drops: ['health'] },
  { z: -6600, kind: 'raptor', n: 6, form: 'echelon', from: 'behind', skill: 0.62 },
  { z: -7400, kind: 'raptor', n: 6, form: 'vee', from: 'ahead', spawn: 1250, arc: -0.52, climb: 0.26, skill: 0.64, aggro: 0.38, hunt: true, life: 9, drops: ['health'] },
  // The sump plateau, the one flat top on the level and the only place with a
  // run long enough for five. bank 420 is well inside its 560 m shoreline.
  { z: -8400, kind: 'bulwark', n: 5, form: 'banks', first: 260, step: 230, bank: 420, drops: ['health', 'bomb'] },
  { z: -8600, boss: 'commander:forge' },
];

const VENOM_COMMS = [
  { z: -140, who: 'PEPPY', text: 'Venom. Andross is down there somewhere, Fox. Everything ends here.' },
  { z: -900, who: 'SLIPPY', text: 'The ridge is the only ground on this whole plain. Everything either side of you is molten.' },
  { z: -2300, who: 'FALCO', text: 'Spine drops away ahead. Ride it down, do not go around it.' },
  { z: -3900, who: 'SLIPPY', text: 'Hull temperature climbing! The crest is barely above the lava here!' },
  { z: -5000, who: 'PEPPY', text: 'It climbs again past this. Stay on the high ground, Fox.' },
  { z: -5560, who: 'PEPPY', text: 'Their heavy brought escorts this time. Watch the flanks.' },
  { z: -7350, who: 'FALCO', text: 'They are going for the wing, Fox. Get them off!' },
  { z: -8250, who: 'FALCO', text: 'There it is. Sitting on the only flat rock for nine kilometres.' },
  { z: -8450, who: 'PEPPY', text: 'That is their fortress ship. Heat sinks and the crucible — end it, Fox.' },
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
    id: 'aquas', name: 'AQUAS', dna: 'aquas', env: 'aquas',
    brief: 'SECTOR IV · AQUAS',
    waves: AQUAS_WAVES, comms: AQUAS_COMMS, grants: [],
    hop: 'orbital',
  },
  {
    id: 'fortuna', name: 'FORTUNA', dna: 'fortuna', env: 'fortuna',
    brief: 'SECTOR V · FORTUNA',
    waves: FORTUNA_WAVES, comms: FORTUNA_COMMS, grants: [],
    hop: 'orbital',
  },
  {
    id: 'foundry', name: 'THE FOUNDRY', dna: 'foundry', env: 'foundry',
    brief: 'SECTOR VI · THE FOUNDRY',
    waves: FOUNDRY_WAVES, comms: FOUNDRY_COMMS, grants: [],
    hop: 'orbital',
  },
  {
    // The finale, and the one hop in the game whose origin and destination are
    // the same body: `PLANET_FOR.foundry` is Venom because the Foundry is in
    // Venom orbit, so leaving it you watch the planet you are about to fly
    // into swing under the frame and then grow back out of it.
    id: 'venom', name: 'VENOM', dna: 'venom', env: 'venom',
    brief: 'SECTOR VII · VENOM',
    waves: VENOM_WAVES, comms: VENOM_COMMS, grants: [],
  },
];

/* ── the level card ───────────────────────────────────────────────────────────
   Every level opens on its own name, held for a few seconds while the ship
   flies. Published here rather than raised by the HUD off a level change,
   because this file is the only thing that knows a level has begun: level 1 at
   install, levels 2–4 in `arrive`.

   The window is in SIM time, the same `until` idiom `message` and `pickup`
   already use: a harness seek to t=14 then arrives with the card spent instead
   of parked over the capture.

   Seconds, not phases: `ui/levelcard.js` splits the window into fade, hold and
   fade itself. The UI seam only ever runs one way — game publishes onto
   `ctx.state` and ui/ reads it — so the drawn timing cannot be imported from
   there, and nothing here should know it. */
const CARD_LIFE = 4.45;
function levelCard(ctx, L) {
  const t = ctx.state.time;
  ctx.state.levelCard = {
    // `brief` is 'SECTOR IV · THE FOUNDRY' — the tail is the name again, and a
    // card that says its own name twice is a card with nothing on it.
    eyebrow: (L.brief.split('\u00b7')[0] || '').trim() || 'MISSION',
    name: L.name,
    from: t,
    until: t + CARD_LIFE,
  };
}

export function installCampaign(ctx, startIndex = 0) {
  const state = {
    index: startIndex,
    phase: 'play',        // play | lap | ascent | space | approach | reentry
    t: 0,                 // seconds inside the current phase
    lapT: 0,
    // Metres of `climb` the lap added to lift the ship clear of a surface it was
    // flown under. The hop's ascent starts from this, not from zero.
    surfaceClimb: 0,
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
    // A belt has no body to arrive at or lift off from, so neither the approach
    // nor the ascent may grow a planet out of the star field.
    ctx.fx.transit?.enter(level().env, to.env, {
      destBody: hasBody(to.dna),
      originBody: hasBody(level().dna),
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
    // Belongs to the level just left; the next lap measures its own.
    state.surfaceClimb = 0;
    levelCard(ctx, level());
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
      // Surface, on a level that is flown under one. The lap is the only stretch
      // between the kill and the hop, so it is where a level you plunged into
      // gets climbed back out of — otherwise the ascent begins underwater and
      // the whole rise happens behind the transition's own effects.
      //
      // `climb` rather than the offset box: it is already the thing that moves
      // the ship outside the corridor, the ceiling clamp stands down while it is
      // non-zero, and the hop picks it up from here rather than from zero.
      const under = railOverSurface(ctx.flight.railZ);
      if (under !== null && under < 0) {
        state.surfaceClimb = -under + SURFACE_CLEAR;
      }
      if (state.surfaceClimb > 0) {
        const p = Math.min(1, state.lapT / LAP_MIN);
        ctx.flight.climb = state.surfaceClimb * (p * p * (3 - 2 * p));
      }
      if (state.lapT < LAP_MIN) return;
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
    // From wherever the lap left the ship, not from zero: on a level the lap
    // surfaced, restarting the ramp at zero drops it back through the surface
    // on the first frame of the hop.
    const base = state.surfaceClimb || 0;
    if (state.phase === first) ctx.flight.climb = base + ease(u) * (H.climb - base);
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
      label: (!hasBody(level().dna) && H.vacuumLabel?.[state.phase]) || H.label[state.phase],
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

  // The first level's card is raised here, at sim t = 0, and NOT on the first
  // tick of `update`. Both look the same in play — sim time is frozen under the
  // title card, so the window opens the moment the player launches — but only
  // this one survives the harness: `seekTo` drives `step()` directly and never
  // calls `update`, so a card keyed to the first tick would be raised at
  // whatever time the seek landed on and sit over every `--hud` capture.
  levelCard(ctx, level());

  ctx.state.campaign = api;
  return api;
}

