import * as THREE from 'three';
import { rng } from '../core/rng.js';
import { registerShot } from './shots.js';
import { createEnemy, disposeEnemy, animateEnemy, enemySpec } from '../ships/enemies.js';
import { createBoss, BOSS } from '../ships/boss.js';
import { createArwing } from '../ships/arwing.js';
import { emissive } from '../render/materials.js';
import {
  makeAgent, think, thinkWingman, killAgent, aimShot, orient, setState, clamp,
} from './ai.js';

// ─────────────────────────────────────────────────────────────────────────────
// Combat / AI / mission seam.  OWNER: combat agent.
//
// This file is the referee. It owns nothing visual and nothing about flying:
// ships/enemies.js builds the hulls, game/ai.js flies them, fx draws the
// consequences. What lives here is the part a player actually feels — who is
// on screen, when, how much they hurt, and what it takes to kill them.
//
// Three rules the whole file is built around:
//
//   1. THE RAIL IS THE CLOCK.  Waves trigger on `flight.railZ`, never on wall
//      time. Fly faster and the level does not desynchronise; a review capture
//      at t=14 always shows the same fight.
//   2. NOTHING IS A HITSCAN.  Every shot is a travelling body with a position,
//      so it can be dodged, out-run and seen to miss. Enemy fire is slow enough
//      (520 m/s against your 175) to read as an object, not a state change.
//   3. THE HUD IS DOWNSTREAM.  Everything the UI needs is published onto
//      `ctx.state` once per tick and never read back. The HUD cannot influence
//      the fight, so it can never desync it.
// ─────────────────────────────────────────────────────────────────────────────

const R = rng('combat.spawn');
const RG = rng('combat.gun');

/* ── tuning ───────────────────────────────────────────────────────────────── */

const TUNE = {
  // Bullet radii are generous on purpose. A 2.2 m round against a 2.6 m raptor
  // half a kilometre out is a simulation, not an arcade shooter — Star Fox
  // forgives by a wide margin and reads as precise because the *feedback* is
  // precise, not because the collision is.
  playerBullet: { speed: 980, range: 1100, dmg: 1, r: 5.5 },
  chargedBullet: { speed: 470, range: 900, dmg: 6, r: 14.0 },
  enemyBullet: { speed: 520, range: 700, r: 1.4 },

  converge: 520,           // metres at which the guns cross the aim ray
  fireGap: 0.135,          // twin-linked, so 2 rounds per interval
  chargeTime: 1.05,        // hold-to-lock, seconds
  lockCone: 0.955,         // cos of the half-angle the lock will hold
  lockRange: 900,

  // Homing. The lock reticle promised a tracking shot and the rounds flew dead
  // straight, so the whole lock-on ceremony was decoration — you still had to
  // hand-lead a crossing target, and the reticle actively lied about where the
  // shot would go. These are turn rates in rad/s, applied to the round's
  // velocity direction while its target lives.
  //
  // The charged round turns hard: it is the pay-off for holding the trigger for
  // a second, and in Star Fox 64 it is the shot that genuinely cannot be dodged
  // once it has you. The tap stream turns gently — enough to close the last few
  // degrees on a target that is already under the reticle, not enough to make
  // aiming optional. That distinction is the whole feel: aim assist, not
  // auto-kill.
  homeCharged: 3.4,
  homeTap: 1.15,
  // A flat turn rate cannot hit anything. A round at 470 m/s bending at
  // 3.4 rad/s has a turn radius of 138 m, so once it is 60 m off-axis with 200 m
  // to run it is geometrically incapable of closing — measured: mean closest
  // approach 68 m against a 17 m hit radius, i.e. a clean miss that *looks*
  // guided. Real guidance tightens as the range collapses, because the turn
  // needed to correct a fixed miss distance goes as 1/d². So the rate carries a
  // term proportional to (speed / range): far out it barely bends, in the last
  // hundred metres it whips onto the target.
  homeCloseGain: 1.8,
  homeMaxTurn: 20,         // rad/s — ω·dt must stay well under a right angle
  homeCloseFloor: 40,      // m — clamp on the 1/d term, so ω cannot run away
  // Where steering stops. This was 26 m, which sounds harmlessly small and was
  // the entire reason nothing connected: the hit radius is only 8 m for a tap
  // and 17 m for a charged round, so cutting guidance at 26 m left the last
  // stretch — the one that decides hit or miss — flying blind. Measured median
  // closest approach was 13–19 m, i.e. every round sailed just past the hull.
  // Guide it all the way in and let the collision test end the flight.
  homeMinRange: 5,

  // A 2.6 s fuse on an invisible projectile is indistinguishable from a dead
  // key. The bomb now has a body you can see leave the ship, a much shorter
  // fuse, and a second press detonates it early — the Star Fox 64 behaviour.
  bombFuse: 1.5,
  bombArm: 0.18,           // grace before a second press can detonate it
  bombSpeed: 320,
  bombRadius: 105,
  bombDmg: 40,

  playerRadius: 4.2,
  shieldMax: 100,
  respawnInvuln: 2.4,

  ramDmg: 18,

  // Boss station, hard-clamped into a box around the player so a boosting
  // player cannot outrun the follow. Sized off the guns: a tap round dies at
  // 1100 m and the lock cone is ±17°, so ±170 m lateral at this station stays
  // both in range and inside the cone.
  boss: {
    z: -520,          // metres ahead it wants to sit
    zNear: -300,      // nearest it may close
    zFar: -760,       // furthest it may run
    lateral: 170,
    up: 105,
    down: 70,
    clearance: 55,    // minimum height over whatever is under it
    follow: 1.6,      // rad/s-ish exponential follow; 0.55 lagged ~300 m
  },
};

/* the ship's four gun mounts, in Arwing local space */
const PODS = [
  new THREE.Vector3(3.05, -0.28, -3.15),
  new THREE.Vector3(-3.05, -0.28, -3.15),
  new THREE.Vector3(1.35, -0.10, -3.90),
  new THREE.Vector3(-1.35, -0.10, -3.90),
];

/* ── the mission ──────────────────────────────────────────────────────────── */
//
// Corneria, front to back. `z` is the rail position that arms the wave; the
// spawn happens once, when the player crosses it. Keep the gaps honest — a
// shooter that never stops shooting has no dynamics, and the quiet stretches
// are where the level gets to be looked at.
//
// Per-wave knobs, and why each one exists:
//
//   spawn   metres ahead at which the wave appears. Everything used to appear
//           at ~700 m — close enough to resolve as a ship, so waves *arrived*
//           instead of *approaching*. A long spawn buys the player a read.
//   arc     entry bearing as a screen fraction: -1 hard left, +1 hard right.
//           Measured, every wave in the old table entered at |ndc.x| ≈ 0.1, i.e.
//           on the crosshair, so all sixteen encounters looked identical.
//   climb   the same, vertically.
//   life    seconds a craft owns the field before it is required to leave. The
//           single most important number in this table — see ai.js:think.
//   skill   added to every pilot's roll. Now runs 0 → 0.5 across the mission,
//           against a much narrower base roll, so the ramp is actually felt.
//   aggro   pushes reload rate and how hard a pass presses in.
//   markFor / stagger  ram-drone commit delay and per-drone spacing.
//   first / step / bank  ground-battery placement (see spawnWave).
//
// The two `from: 'behind'` waves are left exactly as they were found — the
// owner has deferred the rear-attacker question and is reviewing it separately.

const WAVES = [
  // ── act 1: teach the fight ────────────────────────────────────────────────
  // Three raptors resolving out of the haze off the left shoulder. One pass,
  // then they are gone: the player's first encounter has to have an end.
  { z: -170, kind: 'raptor', n: 3, form: 'vee', from: 'ahead', spawn: 1250, arc: -0.62, climb: 0.30, life: 7.0 },
  // Same enemy, more of them, from the other side, pressing harder.
  { z: -900, kind: 'raptor', n: 4, form: 'echelon', from: 'ahead', spawn: 1200, arc: 0.70, climb: -0.20, skill: 0.08, aggro: 0.05, life: 7.5 },
  // First "oh no": a swarm that arrives as one mass and comes apart into five
  // committed dives, 0.6 s apart, each of which can be dodged.
  { z: -1500, kind: 'wasp', n: 5, form: 'swarm', from: 'ahead', spawn: 1450, arc: 0.08, climb: 0.44, life: 8.0, markFor: 2.3, stagger: 0.62 },
  // The ground shoots back. Staggered down the rail so you meet them one at a
  // time and can see the tracers coming off the bank.
  { z: -2050, kind: 'bulwark', n: 3, form: 'banks', first: 780, step: 330, bank: 115 },

  { z: -2380, kind: 'raptor', n: 4, form: 'vee', from: 'behind', skill: 0.1 },

  // ── act 2: the gorge ──────────────────────────────────────────────────────
  // Two gunboats. Heavy, slow, 14 hp — the first enemy that does not die to a
  // single burst, so it is worth spawning far out and letting it loom.
  { z: -2900, kind: 'hornet', n: 2, form: 'pair', from: 'ahead', spawn: 1550, arc: -0.30, climb: 0.10, skill: 0.14, life: 11 },
  { z: -3380, kind: 'bulwark', n: 4, form: 'banks', first: 720, step: 300, bank: 105 },
  // The rescue beat: one of them peels onto a wingman and Slippy calls for help.
  { z: -3800, kind: 'raptor', n: 5, form: 'echelon', from: 'ahead', spawn: 1300, arc: 0.55, climb: -0.28, skill: 0.20, aggro: 0.10, hunt: true, life: 9 },
  { z: -4380, kind: 'wasp', n: 6, form: 'swarm', from: 'ahead', spawn: 1500, arc: -0.25, climb: 0.36, skill: 0.2, life: 8.0, markFor: 1.9, stagger: 0.50 },
  { z: -4850, kind: 'hornet', n: 3, form: 'vee', from: 'ahead', spawn: 1500, arc: 0.34, climb: 0.22, skill: 0.26, aggro: 0.12, life: 11 },
  { z: -5350, kind: 'bulwark', n: 4, form: 'banks', first: 760, step: 280, bank: 100 },
  { z: -5800, kind: 'raptor', n: 5, form: 'vee', from: 'ahead', spawn: 1250, arc: -0.48, climb: 0.32, skill: 0.32, aggro: 0.16, hunt: true, life: 8.5 },

  // ── act 3: the dropship ───────────────────────────────────────────────────
  // A 30 m assault transport is the level's only mid-boss, and it was a single
  // craft spawned at 650 m with no escort and no staging — 1500 points that the
  // player flew past. It now resolves over 2.3 km of approach and puts two
  // fighters in the air out of its hangar as you close.
  { z: -6150, kind: 'vanguard', n: 1, form: 'pair', from: 'ahead', spawn: 2300, arc: 0.06, climb: 0.16, skill: 0.34, aggro: 0.2, life: 24, close: 200, escort: 2 },

  { z: -6800, kind: 'raptor', n: 4, form: 'echelon', from: 'behind', skill: 0.2 },

  // ── act 4: the run in ─────────────────────────────────────────────────────
  { z: -7250, kind: 'hornet', n: 3, form: 'vee', from: 'ahead', spawn: 1450, arc: -0.40, climb: -0.14, skill: 0.42, aggro: 0.22, life: 10 },
  // Last swarm, tightest stagger in the game — and it clears 700 m before the
  // carrier trigger, so the boss does not arrive into a cloud of leftovers.
  { z: -7550, kind: 'wasp', n: 8, form: 'swarm', from: 'ahead', spawn: 1400, arc: 0.20, climb: 0.30, skill: 0.5, life: 7.0, markFor: 1.6, stagger: 0.38 },
  { z: -8300, boss: true },
];

const COMMS = [
  { z: -150, who: 'PEPPY', text: 'Contacts, high off your port bow!' },
  { z: -880, who: 'FALCO', text: 'Second flight, starboard. I\'ve got the far one.' },
  { z: -1480, who: 'FALCO', text: "Drones! Don't let them touch you — break when they commit." },
  { z: -2030, who: 'SLIPPY', text: 'Ground batteries on both banks!' },
  { z: -2860, who: 'PEPPY', text: 'Gunboats. They soak a lot more than the fighters.' },
  { z: -3780, who: 'PEPPY', text: 'They\'re going for Slippy — shake them off!' },
  { z: -4360, who: 'FALCO', text: 'Gorge is tightening. Watch the walls.' },
  { z: -5950, who: 'SLIPPY', text: 'Big contact ahead — that reads as a dropship!' },
  { z: -6420, who: 'PEPPY', text: 'It\'s armoured, Fox. Hit the engines.' },
  { z: -7950, who: 'FALCO', text: 'Scopes are clear. Too clear.' },
  { z: -8260, who: 'PEPPY', text: 'Carrier dead ahead. This is it, Fox.' },
];

/* ── formations ───────────────────────────────────────────────────────────── */

function station(form, i, n) {
  const s = i - (n - 1) / 2;
  switch (form) {
    case 'vee': return [s * 78, Math.abs(s) * -12 + 10, -Math.abs(s) * 60];
    case 'echelon': return [s * 66 + 40, s * 20, -i * 55];
    case 'pair': return [s * 120, 12, 0];
    case 'swarm': return [
      Math.sin(i * 2.4) * 130, Math.cos(i * 1.7) * 55 + 20, Math.sin(i * 1.1) * 90,
    ];
    default: return [s * 90, 14, 0];
  }
}

/**
 * Where a wave first shows up on screen, in metres, from a bearing expressed as
 * a screen fraction. At the default 58° vertical FOV and 16:9, `arc = 1` puts
 * the craft at roughly |ndc.x| = 0.7 — well outside the reticle, so the player
 * turns to look at it — and the attack state walks it back to the centreline as
 * it closes. `fan` spreads the wing across that bearing so a formation enters
 * as a line of contacts rather than a stack of one.
 */
function entryPoint(w, i, n, dist, out) {
  const s = n > 1 ? (i - (n - 1) / 2) / ((n - 1) / 2) : 0;
  const arc = (w.arc ?? 0) + s * (w.fan ?? 0.18);
  const climb = (w.climb ?? 0) + s * (w.fanY ?? 0.06);
  return out.set(arc * dist * 0.42, climb * dist * 0.20, -dist);
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export function installCombat(ctx) {
  const THREE_ = ctx.THREE;
  const group = new THREE.Group();
  group.name = 'combat';
  ctx.scene.add(group);

  const enemyGroup = new THREE.Group(); enemyGroup.name = 'enemies';
  const allyGroup = new THREE.Group(); allyGroup.name = 'wingmen';
  group.add(enemyGroup, allyGroup);

  /* ── shared, UI-readable game state ─────────────────────────────────────── */
  const state = {
    shield: 1, shieldRaw: TUNE.shieldMax, shieldMax: TUNE.shieldMax,
    lives: 3, score: 0, hits: 0,
    bombs: 3,
    boost: 1, boostActive: 0,
    speed: 0, alt: 0,
    time: 0,
    lockOn: 0,
    lockTarget: null,
    px: 0, py: 0, pz: 0,
    fwd: new THREE.Vector3(0, 0, -1),
    right: new THREE.Vector3(1, 0, 0),
    wingmen: [
      { id: 'falco', name: 'FALCO', health: 100, alive: true },
      { id: 'peppy', name: 'PEPPY', health: 100, alive: true },
      { id: 'slippy', name: 'SLIPPY', health: 100, alive: true },
    ],
    enemies: [],
    message: null,
    bossHealth: null,
    checkpoint: 0,
    outcome: null,          // null | 'win' | 'lose'
  };
  ctx.state = state;

  /* ── live entities ──────────────────────────────────────────────────────── */
  const foes = [];          // { agent, root, kind, spec, contact }
  const allies = [];
  const bullets = [];       // pooled below

  // Hit accounting for tracked rounds. Counting these from outside is not
  // possible: a round is spliced out of the pool on the tick it connects, so a
  // sampler only ever sees the frame *before* impact and every strike reads as
  // a near miss just outside the hull. Count them where the damage is applied.
  const diag = {
    homingFired: 0, homingHit: 0, homingLostTarget: 0, homingExpired: 0,
    // `bossNear` is the broad phase (within 76 m of the hull), `bossLand` the
    // weak-point test. High near with zero land = rounds arrive but the
    // weak-point test rejects them; both zero = they never arrive.
    bossFired: 0, bossNear: 0, bossLand: 0, bossMinD: 1e9,
    pGround: 0, pExpire: 0, pFoe: 0,
  };
  const bombs = [];
  let boss = null;          // { root, api, agent-ish }
  let firedWaves = 0;
  let firedComms = 0;
  let fireT = 0;
  let charge = 0;
  let charging = false;
  let invuln = 0;
  let deadT = -1;
  let firstKill = false;
  let shotParity = 0;
  let bombGeo = null, bombMat = null;

  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _aim = new THREE.Vector3();
  const _conv = new THREE.Vector3();
  const _vb = new THREE.Vector3();
  const _hitP = new THREE.Vector3();
  const _wp = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);

  /* ── wingmen: three Arwings that hold station off your wing ─────────────── */
  const WING_SLOTS = [
    [-62, -6, 46],   // falco, port and slightly back
    [66, -4, 54],    // peppy, starboard
    [-14, 16, 92],   // slippy, high and trailing
  ];
  /**
   * Visual-only deep clone. `Object3D.clone()` JSON-stringifies userData, and
   * the Arwing hangs its animation API off `userData.api`, which holds a back
   * reference to the root — so the stock clone throws on a circular structure.
   * Wingmen need the hull, not the rig: geometry and materials are shared, and
   * userData is deliberately dropped.
   */
  function cloneVisual(src) {
    const out = src.isMesh ? new THREE.Mesh(src.geometry, src.material)
      : src.isPoints ? new THREE.Points(src.geometry, src.material)
        : src.isLine ? new THREE.Line(src.geometry, src.material)
          : new THREE.Group();
    out.name = src.name;
    out.position.copy(src.position);
    out.quaternion.copy(src.quaternion);
    out.scale.copy(src.scale);
    out.visible = src.visible;
    out.renderOrder = src.renderOrder;
    out.frustumCulled = src.frustumCulled;
    for (const c of src.children) out.add(cloneVisual(c));
    return out;
  }

  {
    const proto = createArwing({ scale: 1.0 });
    for (let i = 0; i < 3; i++) {
      const root = cloneVisual(proto);
      root.name = 'wingman-' + state.wingmen[i].id;
      allyGroup.add(root);
      const spec = {
        kind: 'arwing', radius: 4.0, hp: 100,
        maxSpeed: 260, turnRate: 1.5, accel: 150,
        guns: [], fireRange: 0, burst: 0, burstGap: 1, reload: 1, dmg: 0,
      };
      const a = makeAgent(spec, R, {});
      a.homeSlot = new THREE.Vector3(...WING_SLOTS[i]);
      a.offset.copy(a.homeSlot);
      a.state = 'form';
      a.alive = true;
      allies.push({ agent: a, root, info: state.wingmen[i] });
    }
  }

  /* ── review mode ────────────────────────────────────────────────────────── */
  // The screenshot harness never touches the keyboard, so every review frame
  // caught the level with the guns cold — no muzzle flash, no tracers, no
  // impacts, nothing a critic could judge the *game* by. `?fight=1` drives the
  // trigger and the lock from the sim clock instead of from input, so a capture
  // shows a firefight in progress and stays byte-reproducible.
  let autoFight = false;
  try { autoFight = new URLSearchParams(location.search).get('fight') === '1'; }
  catch { /* non-browser host */ }
  let autoT = 0;

  /* ── the world view handed to ai.js ─────────────────────────────────────── */
  const view = {
    time: 0,
    player: { pos: new THREE.Vector3(), vel: new THREE.Vector3() },
    playerRange: 0,
    rng: RG,
    neighbours: null,
    groundAt: (x, z) => ctx.world.groundAt(x, z),
    fire: (a) => enemyFire(a),
  };

  /* ── bullets ────────────────────────────────────────────────────────────── */
  function spawnBullet(o) {
    const b = bullets.length < 400 ? {} : null;
    if (!b) return;
    b.x = o.x; b.y = o.y; b.z = o.z;
    b.vx = o.vx; b.vy = o.vy; b.vz = o.vz;
    b.life = o.life; b.dmg = o.dmg; b.enemy = o.enemy; b.r = o.r;
    b.charged = !!o.charged;
    b.seek = o.seek || null;          // foe this round is tracking, if any
    b.turn = o.turn || 0;             // rad/s it may bend its velocity by
    if (b.turn) diag.homingFired++;
    bullets.push(b);
  }

  /**
   * Where the player's shots are actually going: the point under the reticle.
   *
   * Firing along the hull's own forward axis is the obvious thing and it is
   * wrong. The chase camera sits behind and above the Arwing, so "straight
   * ahead of the ship" and "the middle of the screen" are several degrees
   * apart — shots drift off the crosshair, and the game reads as though the
   * guns do not work. Every rail shooter converges its guns on the aim point
   * for exactly this reason. A live lock overrides it and leads the target.
   */
  /**
   * @param aimRay force the reticle ray even when a lock is live. A tracked
   *   round is launched down the reticle rather than at the firing solution:
   *   solving the intercept at launch is *more* accurate, and it is the wrong
   *   choice, because the round then flies almost straight and the guidance is
   *   invisible — measured median bend over a whole flight, 2°. Launching along
   *   the barrel and letting the seeker pull it round is what makes a homing
   *   shot read as homing. The accuracy is recovered by the guidance, which is
   *   also the thing the player is meant to be watching.
   */
  function convergePoint(out, speed = TUNE.playerBullet.speed, from = null, aimRay = false) {
    const t = aimRay ? null : state.lockTarget;
    if (t && !t.agent.dying) {
      // Lead it. Firing at where a raptor *is* means missing behind it by the
      // full flight time — 0.5 s at 500 m, which for a 90 m/s crossing target is
      // 45 m of miss, several times its own length. One Newton step on the
      // intercept equation is plenty: the target is not manoeuvring hard enough
      // for the second iteration to be worth the cycles.
      const a = t.agent;
      const src = from || ctx.ship.position;
      const flight = out.copy(a.pos).sub(src).length() / speed;
      out.copy(a.pos);
      if (a.vel) out.addScaledVector(a.vel, flight);
      return out;
    }
    const cam = ctx.camera;
    return out.set(0, 0, -1).applyQuaternion(cam.quaternion)
      .multiplyScalar(TUNE.converge).add(cam.position);
  }

  function playerFire() {
    const ship = ctx.ship;
    ship.updateMatrixWorld();
    const lock0 = state.lockTarget && !state.lockTarget.agent.dying ? state.lockTarget : null;
    convergePoint(_conv, TUNE.playerBullet.speed, null, !!lock0);
    const inherit = view.player.vel;
    // Twin-linked: alternate outer and inner pods so the pair reads as a
    // rhythm rather than a wall of light. This keyed off `state.hits`, which
    // only increments on a *kill* — so the pods alternated once per dead
    // enemy instead of once per shot, and the rhythm never existed.
    const pair = (shotParity++ & 1) ? [2, 3] : [0, 1];
    const lock = lock0;
    for (const i of pair) {
      _v.copy(PODS[i]).applyMatrix4(ship.matrixWorld);
      _v2.copy(_conv).sub(_v).normalize();
      // A tracking round draws its own ribbon from its real position each tick;
      // the `laser()` bolt is a GPU particle on a straight p₀+v₀t path and would
      // peel away from the round the moment it started to bend.
      if (!lock) ctx.fx.laser(_v, _v2, { inherit });
      spawnBullet({
        x: _v.x, y: _v.y, z: _v.z,
        vx: _v2.x * TUNE.playerBullet.speed + inherit.x,
        vy: _v2.y * TUNE.playerBullet.speed + inherit.y,
        vz: _v2.z * TUNE.playerBullet.speed + inherit.z,
        life: TUNE.playerBullet.range / TUNE.playerBullet.speed,
        dmg: TUNE.playerBullet.dmg, enemy: false, r: TUNE.playerBullet.r,
        seek: lock, turn: lock ? TUNE.homeTap : 0,
      });
      ctx.fx.muzzle(_v, _v2, { inherit });
    }
    ctx.audio.play('laser', { pos: _v });
  }

  function playerChargedFire() {
    const ship = ctx.ship;
    ship.updateMatrixWorld();
    _v.set(0, -0.2, -3.6).applyMatrix4(ship.matrixWorld);
    const lock = state.lockTarget && !state.lockTarget.agent.dying ? state.lockTarget : null;
    convergePoint(_conv, TUNE.chargedBullet.speed, _v, !!lock);
    _v2.copy(_conv).sub(_v).normalize();
    // `chargedShot` also fires the release burst around the muzzle, which we want
    // either way — but it draws a straight bolt, and a tracking round supplies
    // its own. Suppress just the bolt by giving it zero range.
    ctx.fx.chargedShot(_v, _v2, { inherit: view.player.vel, bolt: !lock });
    spawnBullet({
      x: _v.x, y: _v.y, z: _v.z,
      vx: _v2.x * TUNE.chargedBullet.speed + view.player.vel.x,
      vy: _v2.y * TUNE.chargedBullet.speed + view.player.vel.y,
      vz: _v2.z * TUNE.chargedBullet.speed + view.player.vel.z,
      life: TUNE.chargedBullet.range / TUNE.chargedBullet.speed,
      dmg: TUNE.chargedBullet.dmg, enemy: false, r: TUNE.chargedBullet.r, charged: true,
      seek: lock, turn: lock ? TUNE.homeCharged : 0,
    });
    ctx.audio.play('chargedShot', { pos: _v });
  }

  function enemyFire(a) {
    const spec = a.spec;
    const mounts = spec.guns;
    if (!mounts || !mounts.length) return;
    for (const m of mounts) {
      _v.copy(m);
      if (spec.static) {
        _v.applyAxisAngle(UP, a.turretYaw || 0).add(a.pos);
      } else {
        _v.applyQuaternion(a.quat).add(a.pos);
      }
      aimShot(a, _v, view, TUNE.enemyBullet.speed, _aim);
      ctx.fx.laser(_v, _aim, { enemy: true });
      ctx.fx.muzzle(_v, _aim, { enemy: true });
      spawnBullet({
        x: _v.x, y: _v.y, z: _v.z,
        vx: _aim.x * TUNE.enemyBullet.speed,
        vy: _aim.y * TUNE.enemyBullet.speed,
        vz: _aim.z * TUNE.enemyBullet.speed,
        life: TUNE.enemyBullet.range / TUNE.enemyBullet.speed,
        dmg: spec.dmg, enemy: true, r: TUNE.enemyBullet.r,
      });
    }
    ctx.audio.play('enemyLaser', { pos: _v });
  }

  /* ── spawning ───────────────────────────────────────────────────────────── */
  function spawnWave(w) {
    if (w.boss) {
      // Stage the boss: anything still on the field is told to go home so the
      // capital ship arrives into clean air instead of a cloud of leftovers.
      for (const f of foes) if (!f.spec.static) f.agent.leaveAt = 0;
      spawnBoss();
      return;
    }
    const spec = enemySpec(w.kind);
    for (let i = 0; i < w.n; i++) {
      const root = createEnemy(w.kind);
      enemyGroup.add(root);
      const a = makeAgent(spec, R, {
        skill: w.skill ?? 0, aggro: w.aggro ?? 0, wing: firedWaves,
        life: w.life ?? 8.5, markFor: w.markFor ?? 1.8,
      });
      const [sx, sy, sz] = station(w.form, i, w.n);

      if (spec.static) {
        // Ground batteries sit on the bank, alternating sides, ahead of you.
        // They used to start 420 m out and sit 150–270 m off the rail, which is
        // 30° off axis at contact: measured, a battery was inside the reticle
        // for 0.24 s of its entire life. Further ahead and tighter in means you
        // see the tracers leave the bank and have time to answer them.
        const side = i % 2 ? 1 : -1;
        const z = view.player.pos.z - ((w.first ?? 760) + i * (w.step ?? 310));
        // Batteries sit on the bank, so they are placed off the *rail centre*
        // at that z, not off the player — the river meanders and a fixed world
        // offset would drop half of them in the water.
        const u = side * ((w.bank ?? 110) + R.range(0, 85));
        const x = ctx.flight.railPoint(z, _v).x + u;
        const g = ctx.world.groundAt(x, z);
        a.pos.set(x, g + 3.2, z);
        a.state = 'static';
        a.turretYaw = 0; a.turretPitch = 0;
        root.position.copy(a.pos);
      } else {
        const behind = w.from === 'behind';
        a.entryZ = behind ? 340 : -(620 + i * 40);
        a.closeRate = w.close ?? 285;
        a.runX = sx; a.runY = sy;
        a.homeZ = sz - 300;
        a.attackAt = 0.5 + i * 0.28 + R.range(0, 0.4);
        a.maxPasses = 1 + (R.next() < 0.45 ? 1 : 0);
        a.strafeFor = 2.4 + R.range(0, 1.6);
        a.openWith = behind ? 'attack' : (R.next() < 0.25 ? 'strafe' : 'attack');
        if (behind) {
          a.offset.set(sx, sy, a.entryZ);
          a.entryX = sx; a.entryY = sy;
        } else {
          entryPoint(w, i, w.n, (w.spawn ?? 1250) + i * 60, _v2);
          a.entryX = _v2.x; a.entryY = _v2.y;
          a.offset.copy(_v2);
        }
        if (spec.ram) a.ramWait = (w.markFor ?? 1.8) + i * (w.stagger ?? 0.6);
        a.pos.copy(view.player.pos).add(a.offset);
        a.pos.y = Math.max(a.pos.y, ctx.world.groundAt(a.pos.x, a.pos.z) + 30);
        // Nose-on. An 'ahead' wave flies *at* you, so it enters pointing +z; it
        // used to enter pointing away and spend two seconds of turn rate
        // reversing while sliding backwards down the rail.
        a.fwd.set(0, 0, behind ? -1 : 1);
        a.state = 'enter';
        orient(a);
      }

      // one wave, one leader — the rest hold slots off them
      const foe = { agent: a, root, kind: w.kind, spec, hitFlash: 0 };
      if (i > 0 && !spec.static) {
        a.leader = foes.length ? foes[foes.length - 1].agent : null;
        a.slot.set(sx * 0.4, sy * 0.4, sz * 0.4);
      }
      // a carrier puts fighters in the air instead of just being large
      if (spec.carrier && w.escort) foe.launch = { left: w.escort, t: 3.2 };
      foes.push(foe);
    }

    if (w.hunt) {
      // send one at a wingman, so the rescue objective is visible
      const live = allies.filter(al => al.info.alive);
      const prey = live.length ? live[Math.floor(R.next() * live.length)] : null;
      const hunter = foes[foes.length - 1];
      if (prey && hunter && !hunter.spec.static) {
        hunter.agent.prey = { pos: prey.agent.pos, alive: true, info: prey.info };
        setState(hunter.agent, 'hunt', view);
        prey.agent.state = 'chased';
        prey.agent.stateT = 0;
        say(prey.info.name, 'Get him off me!');
      }
    }
  }

  /**
   * A dropship's hangar mouth is modelled and animated; nothing ever came out
   * of it. Two fighters launched as the player closes turns 1500 points of
   * scenery into a set piece, and costs two craft rather than a bigger wave.
   */
  function launchEscort(carrier) {
    const spec = enemySpec('raptor');
    const root = createEnemy('raptor');
    enemyGroup.add(root);
    const a = makeAgent(spec, R, { skill: 0.28, aggro: 0.2, life: 7.5, wing: 99 });
    a.pos.copy(carrier.agent.pos);
    a.pos.x += R.range(-11, 11);
    a.pos.y -= 2.5;
    a.offset.copy(a.pos).sub(view.player.pos);
    a.entryX = a.offset.x; a.entryY = a.offset.y;
    a.entryZ = Math.min(-260, a.offset.z + 140);
    a.closeRate = 340;
    a.runX = R.range(-80, 80); a.runY = 14;
    a.homeZ = a.entryZ - 200;
    a.attackAt = 0.3;
    a.maxPasses = 1;
    a.strafeFor = 1.4;
    a.openWith = 'attack';
    a.fwd.set(0, 0, 1);
    a.state = 'enter';
    orient(a);
    foes.push({ agent: a, root, kind: 'raptor', spec, hitFlash: 0 });
    ctx.audio.play('bombLaunch', { pos: a.pos });
  }

  function spawnBoss() {
    if (boss) return;
    const root = createBoss();
    const api = root.userData.api;
    group.add(root);
    const pos = new THREE.Vector3();
    pos.copy(view.player.pos);
    // 1400 m was 8 s of approach at cruise, but the wave before it used to land
    // 2.6 s earlier, so the carrier resolved behind a screen of fighters. It
    // now gets clean air and a longer walk-in.
    pos.z -= 1900;
    pos.y = Math.max(pos.y + 40, ctx.world.groundAt(pos.x, pos.z) + 90);
    root.position.copy(pos);
    boss = {
      root, api, pos, hp: BOSS.hullHp,
      t: 0, phase: 1, chargeT: 0, fireT: 3.5,
      turretT: [0, 0, 0, 0],
      list: 0, dying: -1,
      range: 1900, lockSeen: false, aimPart: null,
      prevPos: new THREE.Vector3().copy(pos),
    };
    for (const q of api.parts) q.hitT = 0;
    state.bossHealth = { label: 'GARGANTUA', value: 1, parts: api.parts.map(p => ({ id: p.id, label: p.label, v: 1 })) };
    say('PEPPY', 'Aim for the engines, Fox!');
    ctx.audio.music('boss');
  }

  function say(who, text) {
    state.message = { who, text, until: view.time + 4.2 };
    ctx.audio.play('comm');
  }

  /* ── damage ─────────────────────────────────────────────────────────────── */
  function hurtFoe(foe, dmg, hitPos, impulse) {
    const a = foe.agent;
    if (a.dying) return;
    a.hp -= dmg;
    a.hitT = 0.12;
    foe.hitFlash = 1;
    a.evadeT = Math.max(a.evadeT, 0.5);
    ctx.fx.impact(hitPos, _v2.copy(hitPos).sub(a.pos).normalize(),
      { scale: 0.75 + foe.spec.radius * 0.09 });
    if (a.hp <= 0) {
      killAgent(a, RG, impulse);
      state.score += foe.spec.score;
      state.hits++;
      // fx.explosion reads `scale`, not `size` — this call passed `size` and so
      // every kill in the game, from a 1.5 m drone to a 9.5 m dropship, went off
      // at exactly scale 1. `boomScale` has been sitting in every enemy spec
      // unused since the hulls were written.
      const boom = foe.spec.boomScale ?? 1;
      // Two stages: the round that kills it opens it up, and the wreck goes off
      // properly when it hits something (the retire path below). One full-size
      // detonation twice in a row reads as a bug rather than as a kill.
      ctx.fx.explosion(a.pos, { scale: boom * 0.55, velocity: a.vel });
      ctx.audio.play('explosion', { pos: a.pos, size: foe.spec.radius * boom * 0.7 });
      // A kill you can feel. Scaled by distance so a wing dying at 600 m does
      // not shake the camera, and by mass so a dropship lands harder.
      const near = a.pos.distanceTo(view.player.pos);
      if (near < 340) ctx.flight.addShake(Math.min(0.34, 0.10 * boom * (1 - near / 340)));
      if (!firstKill) {
        firstKill = true;
        say('FALCO', 'Good shot, Fox!');
      }
      if (a.prey) a.prey.info && (a.prey = null);
    } else {
      ctx.audio.play('impact', { pos: hitPos });
    }
  }

  function hurtPlayer(dmg, from) {
    if (invuln > 0 || deadT >= 0 || state.outcome) return;
    state.shieldRaw = Math.max(0, state.shieldRaw - dmg);
    // The flash budget is shared and it accumulates. Five drone rams inside a
    // second used to stack to the 1.2 cap and white the entire frame out for
    // the whole encounter — see shots/k0-t10. A hit should punch, not blind.
    ctx.fx.addFlash(Math.min(0.3, dmg * 0.011));
    ctx.flight.addShake(Math.min(1.2, dmg * 0.05));
    if (from) ctx.fx.shieldHit(ctx.ship.position, from, TUNE.playerRadius * 1.6, 1);
    ctx.audio.play('playerHit', { amount: dmg / 30 });
    if (state.shieldRaw <= 0) killPlayer();
  }

  function killPlayer() {
    deadT = 0;
    ctx.fx.explosion(ctx.ship.position, { scale: 2.6 });
    ctx.fx.addFlash(0.9);
    ctx.flight.addShake(1.6);
    ctx.audio.play('explosion', { pos: ctx.ship.position, size: 6 });
    ctx.ship.visible = false;
    state.lives--;
    if (state.lives < 0) { state.outcome = 'lose'; say('PEPPY', 'Fox! No...'); }
  }

  function respawn() {
    deadT = -1;
    state.shieldRaw = TUNE.shieldMax;
    invuln = TUNE.respawnInvuln;
    ctx.ship.visible = true;
    ctx.audio.play('respawn');
  }

  /* ── boss ───────────────────────────────────────────────────────────────── */
  /**
   * Resolve a round's flight *segment* against the carrier's weak-point table.
   * Swept, not sampled: a tap round covers 16 m per tick against a 13 m hit
   * sphere, so a point test at the tick position lets rounds tunnel through.
   */
  function bossHit(bullet, ax, ay, az, bx, by, bz) {
    const api = boss.api;
    let best = null, bestD = Infinity;
    for (const p of api.parts) {
      if (!p.alive || (p.locked && api.st.shutter < 0.5 && p.kind === 'core')) continue;
      api.partPoint(p, _v);
      const d = segClosest(ax, ay, az, bx, by, bz, _v, _hitP);
      if (d < p.radius + bullet.r && d < bestD) { best = p; bestD = d; _wp.copy(_hitP); }
    }
    if (!best) return false;
    const wp = _wp;
    best.hp -= bullet.dmg * (best.kind === 'hull' ? 0.5 : 1);
    best.hitT = HIT_TICK;

    // Hit register: impact scaled to the part (a flat scale 1 is ~4 px at
    // 500 m), spray along the part's own surface normal, and a flash on the
    // part. The HUD tick is published from updateBoss off `hitT`.
    api.partPoint(best, _v);
    _v2.copy(wp).sub(_v);
    if (_v2.lengthSq() < 1e-8) _v2.copy(wp).sub(boss.root.position);
    if (_v2.lengthSq() < 1e-8) _v2.set(0, 1, 0);
    _v2.normalize();
    ctx.fx.impact(wp, _v2, { scale: 0.85 + best.radius * 0.10 });
    api.hitPart(best, wp);
    ctx.audio.play('impact', { pos: wp });
    if (best.hp <= 0 && best.alive) {
      best.alive = false;
      api.partPoint(best, _v);
      ctx.fx.explosion(_v, { scale: best.radius * 0.5 });
      ctx.audio.play('explosion', { pos: _v, size: best.radius });
      state.score += 500;
      if (best.kind === 'engine') { api.killNacelle(best.index); boss.list += 0.16; }
      if (best.kind === 'turret') api.killTurret(best.index);
      if (best.kind === 'core') { bossDie(); return true; }
      // all turrets down → the core armour retracts
      if (api.parts.filter(p => p.kind === 'turret' && p.alive).length === 0 && boss.phase < 2) {
        boss.phase = 2;
        api.setPhase(2);
        say('FALCO', 'Armour\'s open — hit the core!');
      }
    }
    return true;
  }

  function bossDie() {
    boss.dying = 0;
    state.outcome = 'win';
    say('PEPPY', 'That\'s it! Great work, Fox!');
    ctx.audio.music('victory');
  }

  function updateBoss(dt) {
    const b = boss, api = b.api;
    b.t += dt;

    if (b.dying >= 0) {
      b.dying += dt;
      // a capital ship does not pop; it comes apart over four seconds
      if (b.dying < 4.0 && RG.next() < dt * 9) {
        _v.copy(b.root.position);
        _v.x += RG.range(-32, 32); _v.y += RG.range(-9, 14); _v.z += RG.range(-34, 34);
        ctx.fx.explosion(_v, { scale: 1.4 + RG.range(0, 2.6) });
        ctx.audio.play('explosion', { pos: _v, size: 8 });
      }
      b.root.position.y -= dt * 7 * Math.min(1, b.dying * 0.5);
      b.root.rotation.z += dt * 0.16;
      api.update(dt, { power: Math.max(0, 1 - b.dying * 0.5), list: b.list });
      if (b.dying > 5.5) { b.root.visible = false; }
      state.bossHealth = null;
      return;
    }

    /* ── station keeping, on a leash (see TUNE.boss) ───────────────────────── */
    const L = TUNE.boss;
    const pl = view.player.pos;
    const want = _v.copy(pl);
    // Weave amplitude is bounded by the lock cone: the leash settles at ~412 m,
    // where ±55 m is ±7.6° off the ship's forward axis. Stacked on the player's
    // own banking, much more than that falls outside the ±17° cone.
    want.x += Math.sin(b.t * 0.31) * 55 + Math.sin(b.t * 0.77 + 2.1) * 16;
    want.y += 14 + Math.sin(b.t * 0.43 + 1.1) * 11;
    want.z += L.z;
    // Sampled under the carrier, not under the station: the station is 520 m up
    // a meandering corridor and lands inside the canyon wall, where groundAt
    // returns the rim.
    const floor = ctx.world.groundAt(b.root.position.x, b.root.position.z) + L.clearance;
    if (want.y < floor) want.y = floor;
    b.root.position.lerp(want, Math.min(1, dt * L.follow));

    const bp = b.root.position;
    bp.x = clamp(bp.x, pl.x - L.lateral, pl.x + L.lateral);
    bp.y = clamp(bp.y, pl.y - L.down, pl.y + L.up);
    bp.z = clamp(bp.z, pl.z + L.zFar, pl.z + L.zNear);
    // last resort: never inside the landscape, even if that breaks the leash
    const hard = ctx.world.groundAt(bp.x, bp.z) + 30;
    if (bp.y < hard) bp.y = hard;

    b.root.lookAt(pl.x, bp.y, pl.z + 900);

    // `view.playerRange` is written by whichever agent updated last — by the
    // `view.playerRange` holds whichever agent updated last — a wingman by the
    // time the boss runs — so the carrier measures its own.
    const bossRange = bp.distanceTo(pl);
    b.range = bossRange;

    // The renderer refreshes matrices after the sim, but partPoint, the lock
    // adapter and the turret muzzles all read them during it.
    b.root.updateMatrixWorld(true);

    const alive = api.parts.filter(q => q.kind === 'engine' && q.alive).length;
    api.setAlert(bossRange < 700 ? 1 : 0.35);
    api.setShutter(b.phase >= 2 ? Math.min(1, (api.st.shutter + dt * 0.6)) : 0);
    api.setHangar(b.phase >= 2 ? 0.9 : 0.15 + 0.15 * Math.sin(b.t * 0.6));

    /* turrets track and fire */
    for (let i = 0; i < 4; i++) {
      const p = api.parts.find(q => q.kind === 'turret' && q.index === i);
      if (!p || !p.alive) continue;
      const muzzle = api.aimTurret(i, view.player.pos, dt, _v);
      b.turretT[i] -= dt;
      if (muzzle && b.turretT[i] <= 0 && bossRange < 1100) {
        b.turretT[i] = 1.6 + RG.range(0, 1.1);
        const fakeAgent = { skill: 0.62, spec: { dmg: 11 } };
        aimShot(fakeAgent, muzzle, view, TUNE.enemyBullet.speed, _aim);
        ctx.fx.laser(muzzle, _aim, { enemy: true });
        ctx.fx.muzzle(muzzle, _aim, { enemy: true });
        spawnBullet({
          x: muzzle.x, y: muzzle.y, z: muzzle.z,
          vx: _aim.x * TUNE.enemyBullet.speed, vy: _aim.y * TUNE.enemyBullet.speed,
          vz: _aim.z * TUNE.enemyBullet.speed,
          life: 1.6, dmg: 11, enemy: true, r: TUNE.enemyBullet.r,
        });
        ctx.audio.play('enemyLaser', { pos: muzzle });
      }
    }

    /* spinal cannon: a long, telegraphed wind-up so it can be dodged */
    b.fireT -= dt;
    if (b.fireT <= 1.9 && b.fireT > 0) {
      b.chargeT = 1 - b.fireT / 1.9;
      api.setCharge(b.chargeT);
      if (b.chargeT > 0.02 && b.chargeT < 0.06) ctx.audio.play('bossCharge');
    } else if (b.fireT <= 0) {
      api.fireBeam(1000);
      ctx.audio.play('bossBeam');
      ctx.fx.addFlash(0.35);
      b.fireT = 6.5 + RG.range(0, 2.5);
      b.chargeT = 0;
      api.setCharge(0);
      // the beam is a lane down the boss's forward axis
      _v.set(0, 0, -1).applyQuaternion(b.root.quaternion);
      _v2.copy(view.player.pos).sub(b.root.position);
      const along = _v2.dot(_v);
      const perp = _v2.addScaledVector(_v, -along).length();
      if (along > 0 && perp < 26) hurtPlayer(34, b.root.position);
    }

    api.update(dt, { power: alive ? 1 : 0.15, list: b.list });
    updateBossLock(dt);

    for (const q of api.parts) if (q.hitT > 0) q.hitT = Math.max(0, q.hitT - dt);

    const total = api.parts.reduce((s, q) => s + Math.max(0, q.hp), 0);
    const max = api.parts.reduce((s, q) => s + q.max, 0);
    state.bossHealth = {
      label: 'GARGANTUA',
      value: clamp(total / max, 0, 1),
      parts: api.parts.map(q => ({
        id: q.id, label: q.label, v: clamp(q.hp / q.max, 0, 1), alive: q.alive,
        hit: clamp((q.hitT || 0) / HIT_TICK, 0, 1),
        aim: bossLock.part === q,
      })),
    };
  }

  /* ── the carrier as a lock target ───────────────────────────────────────── */
  //
  // `updateLock` walks `foes`, and the carrier is a rig of parts with no agent.
  // This adapter gives it a foe's shape — `{ agent: { pos, vel, dying } }` is
  // all the lock, the lead solver, the seeker and the HUD projection read.
  // `pos` tracks the current weak point rather than the hull centre, so a
  // guided round goes into a nacelle instead of 900 HP of plating at ½ damage.
  const HIT_TICK = 0.30;
  const bossLock = {
    boss: true, part: null, radius: BOSS.radius,
    agent: { pos: new THREE.Vector3(), vel: new THREE.Vector3(), dying: false },
  };

  /** The part the lock should hold: the objective for the current phase. */
  function bossAimPart() {
    const api = boss.api;
    const core = api.parts.find(q => q.kind === 'core' && q.alive);
    if (core && api.st.shutter >= 0.5) return core;
    let best = null, bestScore = Infinity;
    for (const q of api.parts) {
      if (!q.alive || q.kind === 'hull' || q.kind === 'core') continue;
      api.partPoint(q, _vb);
      // Engines are the phase-1 objective ("Aim for the engines, Fox!"), so they
      // win ties by a wide margin; among equals, take the closest.
      const s = _vb.distanceTo(ctx.ship.position) - (q.kind === 'engine' ? 500 : 0);
      if (s < bestScore) { bestScore = s; best = q; }
    }
    return best || api.parts.find(q => q.kind === 'hull' && q.alive) || null;
  }

  function updateBossLock(dt) {
    const b = boss, api = boss.api;

    // Sticky. The nacelles are 60 m apart, so re-picking per tick teleports the
    // lock point and the seeker's lead term reads that as ~7 km/s of target
    // motion.
    const core = api.parts.find(q => q.kind === 'core' && q.alive);
    const coreOpen = !!core && api.st.shutter >= 0.5;
    if (!b.aimPart || !b.aimPart.alive || (coreOpen && b.aimPart !== core)) {
      b.aimPart = bossAimPart();
      b.lockSeen = false;         // no lead until there are two samples of it
    }
    const part = b.aimPart;
    bossLock.part = part;
    bossLock.radius = part ? Math.max(part.radius, 6) : BOSS.radius;
    if (part) api.partPoint(part, bossLock.agent.pos);
    else bossLock.agent.pos.copy(b.root.position);

    // Lead off the carrier's velocity, not the aim point's: turret slew and
    // shutter animation are part-relative motion, and over a 1/120 s step they
    // are just noise.
    if (b.lockSeen) bossLock.agent.vel.subVectors(b.root.position, b.prevPos).divideScalar(Math.max(dt, 1e-4));
    else { bossLock.agent.vel.set(0, 0, 0); b.lockSeen = true; }
    b.prevPos.copy(b.root.position);
    bossLock.agent.dying = b.dying >= 0;
  }

  /* ── lock-on ────────────────────────────────────────────────────────────── */
  function updateLock(dt) {
    const input = ctx.input.state;
    let held = input.fire;

    if (autoFight) {
      autoT += dt;
      // 2.6 s cycle: a charged shot released at the top, then a burst of taps.
      const c = autoT % 2.6;
      held = c < 1.25 || (c > 1.5 && c < 2.35);
    }

    if (held && !charging && !state.outcome && deadT < 0) { charging = true; ctx.fx.chargeStart(); ctx.audio.play('chargeStart'); }
    if (charging) {
      charge = Math.min(1, charge + dt / TUNE.chargeTime);
      // pick the best target inside the forward cone
      let best = null, bestScore = -Infinity;
      _v2.set(0, 0, -1).applyQuaternion(ctx.ship.quaternion).normalize();
      for (const f of foes) {
        if (f.agent.dying) continue;
        _v.copy(f.agent.pos).sub(ctx.ship.position);
        const d = _v.length();
        if (d > TUNE.lockRange) continue;
        const dot = _v.normalize().dot(_v2);
        if (dot < TUNE.lockCone) continue;
        const sc = dot * 2 - d / TUNE.lockRange;
        if (sc > bestScore) { bestScore = sc; best = f; }
      }
      // …and the carrier. The cone is widened by the target's angular size — a
      // cone tuned for a 3 m raptor rejects a 68 m hull whose centre sits a few
      // degrees off the reticle — and the range gate stretched to cover the
      // leash station.
      if (boss && boss.dying < 0 && boss.lockSeen) {
        _v.copy(bossLock.agent.pos).sub(ctx.ship.position);
        const d = _v.length();
        if (d <= TUNE.lockRange * 1.35) {
          const dot = _v.normalize().dot(_v2);
          const slack = Math.min(0.10, (bossLock.radius + 22) / Math.max(d, 1));
          if (dot >= TUNE.lockCone - slack) {
            // A live capital ship outranks anything escorting it.
            const sc = dot * 2 - d / (TUNE.lockRange * 1.35) + 0.30;
            if (sc > bestScore) { bestScore = sc; best = bossLock; }
          }
        }
      }
      const prev = state.lockTarget;
      state.lockTarget = charge > 0.35 ? best : null;
      if (state.lockTarget && state.lockTarget !== prev) ctx.audio.play('lockOn');
      else if (charge < 1 && Math.floor(charge * 8) !== Math.floor((charge - dt / TUNE.chargeTime) * 8)) ctx.audio.play('lockTick');
      state.lockOn = charge;
      if (!held) {
        charging = false;
        ctx.fx.chargeStop();
        if (charge > 0.55) playerChargedFire();
        else playerFire();
        charge = 0;
        state.lockOn = 0;
        state.lockTarget = null;
        fireT = TUNE.fireGap;
      }
    }

    // tap-fire: holding also produces a normal stream until the charge takes
    if (held && charge < 0.5) {
      fireT -= dt;
      if (fireT <= 0 && deadT < 0 && !state.outcome) { fireT = TUNE.fireGap; playerFire(); }
    }
  }

  /* ── bombs ──────────────────────────────────────────────────────────────── */
  /** The visible body of a bomb in flight. Shared geometry, one material. */
  function bombMesh() {
    if (!bombGeo) {
      bombGeo = new THREE.SphereGeometry(1.15, 16, 12);
      bombMat = emissive(0xffb347, 4.2);
    }
    const m = new THREE.Mesh(bombGeo, bombMat);
    m.name = 'bomb';
    group.add(m);
    return m;
  }

  function updateBombs(dt) {
    const input = ctx.input.state;
    // Second press detonates whatever is already in the air, before spending
    // another one from the rack.
    //
    // `*Pressed` is sampled per frame but read per fixed step, 1–8 times, so
    // the launch guard must be a predicate the launch invalidates. `!bombs.length`
    // is; `state.bombs > 0` is not.
    if (input.bombPressed && bombs.length && bombs[0].t > TUNE.bombArm) {
      bombs[0].detonate = true;
    } else if (input.bombPressed && !bombs.length && state.bombs > 0 && deadT < 0 && !state.outcome) {
      state.bombs--;
      _v2.set(0, 0, -1).applyQuaternion(ctx.ship.quaternion).normalize();
      _v.set(0, -0.6, -2.2).applyMatrix4(ctx.ship.matrixWorld);
      bombs.push({
        x: _v.x, y: _v.y, z: _v.z,
        vx: _v2.x * TUNE.bombSpeed + view.player.vel.x,
        vy: _v2.y * TUNE.bombSpeed + view.player.vel.y,
        vz: _v2.z * TUNE.bombSpeed + view.player.vel.z,
        t: 0, detonate: false, mesh: bombMesh(),
      });
      ctx.audio.play('bombLaunch', { pos: _v });
    }

    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i];
      b.t += dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.vy -= 12 * dt;
      // Visible body: it tumbles and pulses so it reads as armed, and it is on
      // screen the instant the key goes down.
      if (b.mesh) {
        b.mesh.position.set(b.x, b.y, b.z);
        b.mesh.rotation.set(b.t * 5.1, b.t * 3.7, 0);
        b.mesh.scale.setScalar(1 + 0.22 * Math.sin(b.t * 26));
      }
      const g = ctx.world.groundAt(b.x, b.z);
      let boom = b.detonate || b.t >= TUNE.bombFuse || b.y <= g + 1.5;
      if (!boom) {
        for (const f of foes) {
          if (f.agent.dying) continue;
          if (f.agent.pos.distanceToSquared(_v.set(b.x, b.y, b.z)) < 900) { boom = true; break; }
        }
      }
      if (boom) {
        _v.set(b.x, b.y, b.z);
        ctx.fx.explosion(_v, { scale: 4.2, shock: true });
        ctx.fx.addFlash(0.4);
        ctx.flight.addShake(0.5);
        ctx.audio.play('explosion', { pos: _v, size: 18 });
        for (const f of foes) {
          if (f.agent.dying) continue;
          const d = f.agent.pos.distanceTo(_v);
          if (d < TUNE.bombRadius) {
            hurtFoe(f, TUNE.bombDmg * (1 - d / TUNE.bombRadius), f.agent.pos,
              _v2.copy(f.agent.pos).sub(_v).normalize().multiplyScalar(40));
          }
        }
        if (boss && boss.dying < 0) {
          const d = boss.root.position.distanceTo(_v);
          if (d < TUNE.bombRadius + 30) bossHit({ dmg: TUNE.bombDmg, r: 40 }, _v.x, _v.y, _v.z, _v.x, _v.y, _v.z);
        }
        if (b.mesh) group.remove(b.mesh);
        bombs.splice(i, 1);
      }
    }
  }

  /* ── collisions ─────────────────────────────────────────────────────────── */
  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];

      // ── homing ────────────────────────────────────────────────────────────
      // Rotate the velocity toward the intercept point by at most `turn` rad
      // this tick, keeping speed constant. Turning the *direction* rather than
      // adding an acceleration is what makes it read as a guided round instead
      // of a thrown one: the shot holds its speed and simply bends, which is
      // both the Star Fox 64 look and far easier to keep stable.
      if (b.seek) {
        const a = b.seek.agent;
        if (a.dying) { b.seek = null; diag.homingLostTarget++; }
        else {
          const sp = Math.hypot(b.vx, b.vy, b.vz);
          // Aim at where it will be, not where it is — otherwise the round
          // tail-chases a crossing target and never closes the last few metres.
          _v.copy(a.pos);
          const eta = _v.distanceTo(_vb.set(b.x, b.y, b.z)) / Math.max(1, sp);
          if (a.vel) _v.addScaledVector(a.vel, eta);
          _v.sub(_vb);
          const dist = _v.length();
          if (dist > TUNE.homeMinRange && sp > 1) {
            _v.divideScalar(dist);
            _v2.set(b.vx / sp, b.vy / sp, b.vz / sp);
            const cos = Math.min(1, Math.max(-1, _v2.dot(_v)));
            const ang = Math.acos(cos);
            const omega = Math.min(
              TUNE.homeMaxTurn,
              b.turn * (1 + TUNE.homeCloseGain * sp / Math.max(dist, TUNE.homeCloseFloor)),
            );
            const step = Math.min(ang, omega * dt);
            if (step > 1e-5) {
              // rotate _v2 toward _v by `step`, then rescale to the old speed
              const s = Math.sin(ang);
              if (s > 1e-4) {
                const k1 = Math.sin(ang - step) / s, k2 = Math.sin(step) / s;
                b.vx = (_v2.x * k1 + _v.x * k2) * sp;
                b.vy = (_v2.y * k1 + _v.y * k2) * sp;
                b.vz = (_v2.z * k1 + _v.z * k2) * sp;
              }
            }
          }
        }
      }

      const px = b.x, py = b.y, pz = b.z;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.life -= dt;

      // A tracked round is drawn by its own ribbon, pushed from the position it
      // actually reached this tick. `b.turn` rather than `b.seek` is the test:
      // the streak must survive the target dying mid-flight, or the round goes
      // invisible at the exact moment the player is watching it.
      if (b.turn) ctx.fx.tracer(b, b.x, b.y, b.z, { charged: b.charged });

      let gone = b.life <= 0;
      if (gone && b.turn) diag.homingExpired++;

      if (!gone && b.enemy) {
        // vs player — swept sphere against the segment travelled this tick
        const d = segPointDist(px, py, pz, b.x, b.y, b.z, view.player.pos);
        if (d < TUNE.playerRadius + b.r) {
          _v.set(b.x, b.y, b.z);
          hurtPlayer(b.dmg, _v);
          gone = true;
        }
      } else if (!gone) {
        for (const f of foes) {
          const a = f.agent;
          if (a.dying) continue;
          const d = segPointDist(px, py, pz, b.x, b.y, b.z, a.pos);
          if (d < a.spec.radius + b.r) {
            _v.set(b.x, b.y, b.z);
            hurtFoe(f, b.dmg, _v, _v2.set(b.vx, b.vy, b.vz).normalize().multiplyScalar(18));
            if (b.turn) diag.homingHit++;
            diag.pFoe++;
            gone = true;
            break;
          }
        }
        if (!gone && boss && boss.dying < 0) {
          const dRoot = segPointDist(px, py, pz, b.x, b.y, b.z, boss.root.position);
          if (dRoot < diag.bossMinD) diag.bossMinD = Math.round(dRoot);
          if (dRoot < BOSS.radius + 46) {
            diag.bossNear++;
            if (bossHit(b, px, py, pz, b.x, b.y, b.z)) { diag.bossLand++; gone = true; }
          }
        }
      }

      // terrain
      if (!gone && b.y <= ctx.world.groundAt(b.x, b.z)) {
        _v.set(b.x, ctx.world.groundAt(b.x, b.z), b.z);
        ctx.fx.impact(_v, UP, { ground: true });
        gone = true;
        if (!b.enemy) diag.pGround++;
      } else if (gone && !b.enemy && b.life <= 0) diag.pExpire++;

      if (gone) {
        if (b.turn) ctx.fx.tracerEnd(b);
        bullets[i] = bullets[bullets.length - 1]; bullets.pop();
      }
    }
  }

  function segPointDist(ax, ay, az, bx, by, bz, p) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    let t = len2 > 1e-9 ? ((p.x - ax) * dx + (p.y - ay) * dy + (p.z - az) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + dx * t - p.x, cy = ay + dy * t - p.y, cz = az + dz * t - p.z;
    return Math.sqrt(cx * cx + cy * cy + cz * cz);
  }

  /** As above, but also writes the point on the segment that was closest. */
  function segClosest(ax, ay, az, bx, by, bz, p, out) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    let t = len2 > 1e-9 ? ((p.x - ax) * dx + (p.y - ay) * dy + (p.z - az) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    out.set(ax + dx * t, ay + dy * t, az + dz * t);
    return out.distanceTo(p);
  }

  /* ═══════════════════════════════════════════════════════════════════════ */

  function update(dt) {
    const flight = ctx.flight;
    view.time += dt;
    state.time = view.time;

    /* player view */
    view.player.pos.copy(flight.pos);
    view.player.vel.copy(flight.railDir).multiplyScalar(flight.speed);
    state.px = flight.pos.x; state.py = flight.pos.y; state.pz = flight.pos.z;
    state.fwd.copy(flight.railDir);
    state.right.crossVectors(flight.railDir, UP).normalize().multiplyScalar(-1);
    state.speed = flight.speed;
    state.alt = flight.pos.y - ctx.world.groundAt(flight.pos.x, flight.pos.z);
    state.shield = state.shieldRaw / state.shieldMax;
    state.boost = flight.boost / 100;
    state.boostActive = flight.boostActive;

    if (invuln > 0) invuln -= dt;

    /* death / respawn */
    if (deadT >= 0) {
      deadT += dt;
      if (deadT > 2.2 && state.lives >= 0 && !state.outcome) respawn();
    }

    /* mission triggers */
    while (firedWaves < WAVES.length && flight.railZ <= WAVES[firedWaves].z) {
      spawnWave(WAVES[firedWaves]);
      firedWaves++;
    }
    while (firedComms < COMMS.length && flight.railZ <= COMMS[firedComms].z) {
      say(COMMS[firedComms].who, COMMS[firedComms].text);
      firedComms++;
    }
    if (state.message && view.time > state.message.until) state.message = null;

    /* input-driven systems */
    updateLock(dt);
    updateBombs(dt);

    /* enemies */
    view.neighbours = foes.length < 24 ? foes.map(f => f.agent) : null;
    for (let i = foes.length - 1; i >= 0; i--) {
      const f = foes[i];
      const a = f.agent;
      view.playerRange = a.pos.distanceTo(view.player.pos);
      think(a, dt, view);
      f.hitFlash = Math.max(0, f.hitFlash - dt * 4);

      f.root.position.copy(a.pos);
      f.root.quaternion.copy(a.quat);
      animateEnemy(f.root, dt, {
        power: a.dying ? 0 : 1,
        alert: a.alert,
        // `hitFlash` was set on every hit, decayed every frame, and read by
        // nothing. Folded into the damage term it drops the engines and eyes
        // out for a beat, so the craft visibly flinches — which is how the
        // player knows a round connected on something that did not die.
        damage: a.dying ? 1 : Math.min(1, (1 - a.hp / a.maxHp) + f.hitFlash * 0.55),
        t: view.time,
      });

      // a carrier feeds the fight instead of merely being big
      if (f.launch && !a.dying && a.state !== 'exit') {
        f.launch.t -= dt;
        if (f.launch.t <= 0 && f.launch.left > 0 && view.playerRange < 1700) {
          f.launch.left--;
          f.launch.t = 2.4;
          launchEscort(f);
        }
      }

      // ram drones trade themselves for a chunk of your shield
      if (!a.dying && a.spec.ram && view.playerRange < TUNE.playerRadius + a.spec.radius + 2) {
        hurtPlayer(a.spec.dmg || TUNE.ramDmg, a.pos);
        killAgent(a, RG);
        ctx.fx.explosion(a.pos, { scale: a.spec.boomScale ?? 1 });
        ctx.audio.play('explosion', { pos: a.pos, size: a.spec.radius });
      }

      // Retire: dead, or so far behind that it will never matter again. A craft
      // that has decided to leave is retired as soon as the chase camera cannot
      // see it — the old 700 m threshold kept departing fighters alive and
      // shooting from over the player's shoulder for another four seconds each,
      // which is most of where the "everything is behind me" feeling came from.
      const behind = a.pos.z - view.player.pos.z;
      const stale = a.state === 'exit' && (behind > 300 || a.stateT > 6);
      if (a.dead || behind > (a.spec.static ? 720 : 1400) || stale) {
        if (a.dead && !a.spec.static) {
          const boom = f.spec.boomScale ?? 1;
          ctx.fx.explosion(a.pos, { scale: boom });
          ctx.audio.play('explosion', { pos: a.pos, size: a.spec.radius * boom });
        }
        enemyGroup.remove(f.root);
        disposeEnemy(f.root);
        for (const o of foes) if (o.agent.leader === a) o.agent.leader = null;
        foes[i] = foes[foes.length - 1];
        foes.pop();
      }
    }

    /* wingmen */
    for (const al of allies) {
      const a = al.agent;
      if (!al.info.alive) continue;
      view.playerRange = a.pos.distanceTo(view.player.pos);
      thinkWingman(a, dt, view);
      al.root.position.copy(a.pos);
      al.root.quaternion.copy(a.quat);
      // is anything hunting them?
      const hunted = foes.some(f => f.agent.prey && f.agent.prey.info === al.info && !f.agent.dying);
      if (!hunted && a.state === 'chased') { a.state = 'form'; a.stateT = 0; }
    }

    /* boss */
    if (boss) updateBoss(dt);

    updateBullets(dt);

    /* publish contacts for the radar */
    const list = state.enemies;
    list.length = 0;
    for (const f of foes) {
      if (f.agent.dying) continue;
      list.push({
        x: f.agent.pos.x, y: f.agent.pos.y, z: f.agent.pos.z,
        locked: state.lockTarget === f,
      });
    }
    for (const al of allies) {
      if (!al.info.alive) continue;
      list.push({ x: al.agent.pos.x, y: al.agent.pos.y, z: al.agent.pos.z, ally: true });
    }
    if (boss && boss.dying < 0) {
      list.push({
        x: boss.root.position.x, y: boss.root.position.y, z: boss.root.position.z,
        boss: true, locked: state.lockTarget === bossLock,
      });
    }
  }

  /* ── review cameras (registered from this file, per CONTRACT §1) ────────── */
  registerShot('combat-wave', (c) => {
    c.flight.updateCamera(1 / 60, c.engine.camera);
  });
  registerShot('combat-wide', (c) => {
    const cam = c.engine.camera;
    const p = c.flight.pos;
    cam.position.set(p.x + 95, p.y + 42, p.z + 130);
    cam.fov = 44;
    cam.updateProjectionMatrix();
    cam.lookAt(p.x - 20, p.y, p.z - 420);
  });
  // A tracked round is the one thing in the game whose whole point is the shape
  // of its path, and no camera in the level could see one: `combat-wide` frames
  // 400 m of canyon, in which a homing bolt is four pixels. This one finds a
  // round that is actually seeking, then watches it side-on from the midpoint of
  // the round-to-target line — the only vantage where a curve reads as a curve
  // rather than as foreshortening.
  registerShot('combat-homing', (c) => {
    const cam = c.engine.camera;
    let b = null;
    for (const q of bullets) {
      if (q.turn && q.seek && !q.seek.agent.dying) { b = q; break; }
    }
    if (!b) { c.flight.updateCamera(1 / 60, cam); return; }
    const t = b.seek.agent.pos;
    _v.set((b.x + t.x) * 0.5, (b.y + t.y) * 0.5, (b.z + t.z) * 0.5);
    const range = Math.hypot(t.x - b.x, t.y - b.y, t.z - b.z);
    // Stand off perpendicular to the round's velocity, far enough back that both
    // the round and the thing it is chasing fit — and high enough to be clear of
    // the water haze, which at 28 m filled the entire frame with flat blue.
    const off = Math.max(160, range * 1.5);
    _v2.set(-b.vz, 0, b.vx).normalize().multiplyScalar(off);
    cam.position.set(_v.x + _v2.x, _v.y + Math.max(70, range * 0.55), _v.z + _v2.z);
    cam.fov = 40;
    cam.updateProjectionMatrix();
    cam.lookAt(_v.x, _v.y, _v.z);
  });
  registerShot('combat-boss', (c) => {
    const cam = c.engine.camera;
    const t = boss ? boss.root.position : c.flight.pos;
    cam.position.set(t.x + 70, t.y + 34, t.z + 190);
    cam.fov = 40;
    cam.updateProjectionMatrix();
    cam.lookAt(t.x, t.y, t.z);
  });

  return {
    group,
    state,
    get foes() { return foes; },
    get boss() { return boss; },
    // Rounds in flight. A screenshot cannot answer "does a locked shot bend
    // toward its target" — that is a question about velocity over time — so the
    // pool is readable for the harness to sample.
    get bullets() { return bullets; },
    get diag() { return diag; },
    update,
    dispose() {
      for (const f of foes) { enemyGroup.remove(f.root); disposeEnemy(f.root); }
      if (boss) boss.api.dispose();
      ctx.scene.remove(group);
    },
  };
}
