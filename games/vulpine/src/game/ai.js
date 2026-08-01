import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Enemy and wingman flying.  OWNER: combat agent.
//
// The thing that separates a shooter whose enemies feel *flown* from one whose
// enemies feel *animated* is not the number of behaviours. It is three details:
//
//   1. NOTHING TELEPORTS ITS HEADING.  Every craft has a turn-rate limit and an
//      acceleration limit, so it overshoots, corrects, and arcs. A sine wave
//      has no overshoot, which is exactly why sine-wave enemies look fake.
//   2. THEY BANK INTO THE TURN.  Roll is derived from the *measured* yaw rate,
//      not from the input, so it always agrees with the path being flown.
//   3. THEY LEAD.  Shots are aimed at a solved intercept, degraded by a per-
//      pilot skill number, so a good pilot hits you where you are going and a
//      bad one hits where you were. That difference reads instantly.
//
// Stations are expressed in the *player's* frame — "hold 320 m ahead, 40 m
// left" — because the whole level is sliding down the rail at 175 m/s and any
// absolute-world station would be behind the player a second later. The
// behaviour tree writes an offset; `flyStep` turns it into a flight path.
// ─────────────────────────────────────────────────────────────────────────────

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Solved intercept: where to aim so a round of `speed` meets a target moving at
 * `targetVel`. Returns false (and the raw target position) if no solution — a
 * target running away faster than the bullet, which is a legitimate miss.
 */
export function leadPoint(from, targetPos, targetVel, speed, out) {
  const rx = targetPos.x - from.x, ry = targetPos.y - from.y, rz = targetPos.z - from.z;
  const a = targetVel.lengthSq() - speed * speed;
  const b = 2 * (rx * targetVel.x + ry * targetVel.y + rz * targetVel.z);
  const c = rx * rx + ry * ry + rz * rz;
  let t = -1;
  if (Math.abs(a) < 1e-3) {
    if (Math.abs(b) > 1e-6) t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      const t1 = (-b + s) / (2 * a), t2 = (-b - s) / (2 * a);
      t = Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
      if (!Number.isFinite(t)) t = -1;
    }
  }
  if (t <= 0 || t > 6) { out.copy(targetPos); return false; }
  out.copy(targetPos).addScaledVector(targetVel, t);
  return true;
}

/* ── agent ─────────────────────────────────────────────────────────────────── */

/**
 * @param {object} spec  from ships/enemies.js — maxSpeed, turnRate, accel, …
 * @param {RNG} rng      named stream; every pilot's personality comes from here
 */
export function makeAgent(spec, rng, opts = {}) {
  return {
    spec,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(0, 0, -spec.maxSpeed * 0.7),
    fwd: new THREE.Vector3(0, 0, -1),
    quat: new THREE.Quaternion(),
    speed: spec.maxSpeed * 0.7,
    bank: 0, bankVel: 0,
    yawRate: 0,

    state: 'enter', stateT: 0,
    offset: new THREE.Vector3(0, 0, -600),   // station in player frame
    slot: new THREE.Vector3(),               // formation slot inside the wing
    leader: null,
    wing: opts.wing ?? 0,

    // How long this craft gets to own the field before it is required to leave.
    // Without a budget a wave never resolves: passes loop, the wing drifts
    // behind you, and by the fourth encounter there are a dozen leftovers on
    // the radar that the player never got a clean shot at. A fight you cannot
    // finish is not difficulty, it is a pile-up.
    lifeT: 0,
    leaveAt: opts.life ?? 9,

    // ram drones: mark → dive → spent (see ramStep)
    ram: 'mark', ramWait: opts.markFor ?? 1.6, ramT: 0,
    ramAim: new THREE.Vector3(), ramDist0: 1, ramFixes: 0,

    // personality — a wing of five must not fly as one object.
    // The base is deliberately low and the spread narrow: it used to be
    // 0.35 + rand*0.55, which meant a wave-one pilot rolled anywhere up to 0.90
    // and the +0.2 the wave table could add was lost in the noise. The mission
    // could not ramp because the dice were louder than the design.
    skill: clamp(0.18 + rng.next() * 0.30 + (opts.skill ?? 0), 0.06, 0.96),
    aggression: clamp(0.45 + rng.next() * 0.45 + (opts.aggro ?? 0), 0.3, 1.45),
    phase: rng.next() * Math.PI * 2,
    phase2: rng.next() * Math.PI * 2,
    wobble: 0.7 + rng.next() * 0.8,
    reflex: 0.12 + rng.next() * 0.22,

    fireT: rng.next() * 0.8,
    burstLeft: 0,
    burstT: 0,
    evadeT: 0,
    passes: 0,
    alert: 0,

    hp: spec.hp, maxHp: spec.hp,
    dying: false, dieT: 0, spin: new THREE.Vector3(),
    dead: false,
    hitT: 0,
  };
}

/**
 * Integrate one agent toward a desired world velocity under its own turn and
 * acceleration limits, then derive attitude from the path actually flown.
 */
export function flyStep(a, desiredVel, dt) {
  const wantSpeed = clamp(desiredVel.length(), a.spec.maxSpeed * 0.12, a.spec.maxSpeed);
  _a.copy(desiredVel);
  if (_a.lengthSq() < 1e-8) _a.copy(a.fwd);
  _a.normalize();

  // turn-rate limit — the source of every arc in this file
  const dot = clamp(a.fwd.dot(_a), -1, 1);
  const ang = Math.acos(dot);
  const maxAng = a.spec.turnRate * dt;
  let turned = ang;
  if (ang > maxAng) {
    _b.crossVectors(a.fwd, _a);
    if (_b.lengthSq() < 1e-10) _b.copy(UP);
    _b.normalize();
    _q.setFromAxisAngle(_b, maxAng);
    a.fwd.applyQuaternion(_q).normalize();
    turned = maxAng;
  } else {
    a.fwd.copy(_a);
  }

  // signed yaw rate about the world up, for the bank
  _c.crossVectors(UP, a.fwd).normalize();          // agent right, level
  const signedTurn = (ang > 1e-5 ? Math.sign(_c.dot(_a) - _c.dot(a.fwd)) : 0);
  a.yawRate = lerp(a.yawRate, (turned / Math.max(dt, 1e-4)) * (signedTurn || 0), 1 - Math.exp(-dt * 12));

  a.speed += clamp(wantSpeed - a.speed, -a.spec.accel * 1.8 * dt, a.spec.accel * dt);
  a.vel.copy(a.fwd).multiplyScalar(a.speed);
  a.pos.addScaledVector(a.vel, dt);

  // bank into the measured turn, with a little spring so it settles
  const bankTarget = clamp(-a.yawRate * 1.15, -1.35, 1.35) + a.evadeT * 0;
  a.bank = lerp(a.bank, bankTarget, 1 - Math.exp(-dt * 5.0));
  orient(a);
}

/** Build the agent quaternion from its heading plus roll. */
export function orient(a) {
  _c.copy(a.fwd).multiplyScalar(-1);                // local +Z is aft
  if (Math.abs(_c.y) > 0.995) _c.y = Math.sign(_c.y) * 0.995;
  _c.normalize();
  _a.crossVectors(UP, _c);
  if (_a.lengthSq() < 1e-8) _a.set(1, 0, 0);
  _a.normalize();
  _b.crossVectors(_c, _a).normalize();
  _m.makeBasis(_a, _b, _c);
  a.quat.setFromRotationMatrix(_m);
  _q.setFromAxisAngle(Z, a.bank);
  a.quat.multiply(_q);
}

/** Smooth per-pilot wander so no two craft trace the same line. */
function wander(a, t, amp, out) {
  return out.set(
    Math.sin(t * 0.63 * a.wobble + a.phase) * amp,
    Math.sin(t * 0.81 * a.wobble + a.phase2) * amp * 0.55,
    Math.sin(t * 0.44 * a.wobble + a.phase * 1.7) * amp * 0.8,
  );
}

/* ── behaviour ─────────────────────────────────────────────────────────────── */

const ST = {};

/** Fly the station the wing was given; hold the slot off the leader. */
ST.form = (a, dt, w) => {
  const lead = a.leader && !a.leader.dying ? a.leader : null;
  if (lead) {
    a.offset.copy(lead.offset).add(a.slot);
  } else {
    a.offset.z += (a.homeZ - a.offset.z) * Math.min(1, dt * 0.35);
  }
  if (a.stateT > a.attackAt) setState(a, 'attack', w);
};

/**
 * Attack run. The station walks in from long range to inside 70 m while
 * weaving; the craft is nose-on for most of it, so it is shootable, and the
 * weave is per-pilot so a wing of five arrives as five aircraft.
 */
ST.attack = (a, dt, w) => {
  const u = clamp(a.stateT / (2.6 + (1 - a.aggression) * 1.6), 0, 1);
  // Every pass has to actually arrive. The old curve topped out at 0.75 for a
  // mild pilot, so a "run" ended 200 m out and the player never got a nose-on
  // silhouette to shoot at — the enemy just hovered and drifted past.
  const closeZ = lerp(a.entryZ, -55, clamp(u * u * (0.78 + a.aggression * 0.30), 0, 1));
  a.offset.z += (closeZ - a.offset.z) * Math.min(1, dt * 1.6);
  a.offset.x += (a.runX * (1 - u * 0.65) - a.offset.x) * Math.min(1, dt * 1.1);
  a.offset.y += (a.runY * (1 - u * 0.4) + 6 - a.offset.y) * Math.min(1, dt * 1.1);
  a.alert = 1;
  if (a.offset.z > -95 || a.stateT > 5.5) setState(a, 'break', w);
};

/** Break away: pick a side, roll hard, and leave over the player's shoulder. */
ST.break_ = (a, dt, w) => {
  const k = Math.min(1, dt * 1.5);
  a.offset.x += (a.breakX - a.offset.x) * k;
  a.offset.y += (a.breakY - a.offset.y) * k;
  a.offset.z += (190 - a.offset.z) * Math.min(1, dt * 1.1);
  a.alert = 0.4;
  a.bank = lerp(a.bank, a.breakX > 0 ? -1.5 : 1.5, 1 - Math.exp(-dt * 4.5));
  if (a.stateT > 2.4) {
    a.passes++;
    if (a.passes >= a.maxPasses) setState(a, 'exit', w);
    else setState(a, 'loop', w);
  }
};

/** Loop back: climb out wide and re-enter from ahead for another pass. */
ST.loop = (a, dt, w) => {
  const k = Math.min(1, dt * 0.9);
  a.offset.x += (a.runX * 1.5 - a.offset.x) * k;
  a.offset.y += (a.runY + 55 - a.offset.y) * k;
  a.offset.z += (a.entryZ * 1.15 - a.offset.z) * Math.min(1, dt * 1.3);
  a.alert = 0.5;
  if (a.offset.z < a.entryZ * 0.9 || a.stateT > 4.0) setState(a, 'attack', w);
};

/** Cross the player's front at constant range — the readable "traffic" beat. */
ST.strafe = (a, dt, w) => {
  const sweep = Math.sin(a.stateT * 0.55 + a.phase) * 150;
  a.offset.x += (sweep - a.offset.x) * Math.min(1, dt * 1.2);
  a.offset.y += (a.runY + 18 - a.offset.y) * Math.min(1, dt * 1.0);
  a.offset.z += (-230 - a.offset.z) * Math.min(1, dt * 0.9);
  a.alert = 0.8;
  if (a.stateT > a.strafeFor) setState(a, 'attack', w);
};

/** Sit on a wingman's tail. The rescue objective made visible. */
ST.hunt = (a, dt, w) => {
  const prey = a.prey;
  if (!prey || !prey.alive) { setState(a, 'attack', w); return; }
  _a.copy(prey.pos).sub(w.player.pos);
  a.offset.x += (_a.x + Math.sin(a.stateT * 1.3 + a.phase) * 16 - a.offset.x) * Math.min(1, dt * 2.0);
  a.offset.y += (_a.y + 4 - a.offset.y) * Math.min(1, dt * 2.0);
  a.offset.z += (_a.z + 62 - a.offset.z) * Math.min(1, dt * 2.0);
  a.alert = 1;
  // A hunter that never gives up is exempt from the life budget for ever, which
  // is how one raptor from the rescue beat ends up still on the radar at the
  // boss. Ten seconds is long enough for the rescue to read as a rescue.
  if (a.stateT > 10) setState(a, 'attack', w);
};

/**
 * Leave the level, and mean it. The old exit crawled to +520 m over about four
 * seconds and combat.js would not retire the craft until it was 700 m behind,
 * so "leaving" took the better part of ten seconds and the craft spent all of
 * it hanging off the player's shoulder taking pot shots. Departure is a beat,
 * not a state to live in.
 */
ST.exit = (a, dt, w) => {
  const k = Math.min(1, dt * 1.6);
  a.offset.x += (Math.sign(a.breakX || 1) * 520 - a.offset.x) * k;
  a.offset.y += (a.runY + 200 - a.offset.y) * k;
  a.offset.z += (980 - a.offset.z) * Math.min(1, dt * 1.5);
  a.alert = 0;
};

/** Hold a fixed world point — ground turrets. */
ST.static_ = (a, dt, w) => { a.alert = w.playerRange < a.spec.fireRange ? 1 : 0.2; };

/**
 * Ingress. The wave appears far out on a bearing and closes at a fixed rate, so
 * the approach has a designed *duration* rather than whatever falls out of a
 * lerp. Waves used to materialise 700 m away and within ten degrees of the
 * crosshair — inside the frustum, at a size the eye resolves, on the exact spot
 * the player is already looking. Nothing was ever seen coming; it was seen
 * arriving.
 */
ST.enter = (a, dt, w) => {
  a.offset.z = Math.min(a.entryZ, a.offset.z + (a.closeRate ?? 285) * dt);
  a.offset.x += (a.entryX - a.offset.x) * Math.min(1, dt * 0.7);
  a.offset.y += (a.entryY - a.offset.y) * Math.min(1, dt * 0.7);
  a.alert = 0.45;
  if (a.offset.z >= a.entryZ - 1 && a.stateT > a.attackAt) setState(a, a.openWith || 'attack', w);
};

export function setState(a, s, w) {
  a.state = s;
  a.stateT = 0;
  if (s === 'break') {
    a.breakX = (a.offset.x >= 0 ? 1 : -1) * (150 + a.aggression * 130);
    a.breakY = a.offset.y + (w && w.rng.next() < 0.45 ? -45 : 70);
  }
  if (s === 'loop') a.runX = -a.runX;
}

const STEP = {
  enter: ST.enter, form: ST.form, attack: ST.attack, break: ST.break_,
  loop: ST.loop, strafe: ST.strafe, hunt: ST.hunt, exit: ST.exit, static: ST.static_,
};

/**
 * One agent tick. `w` is the shared world view built by combat.js:
 *   { time, player:{pos,vel}, playerRange, groundAt(x,z), rng, fire(a, aim) }
 */
export function think(a, dt, w) {
  a.stateT += dt;
  a.lifeT += dt;
  a.hitT = Math.max(0, a.hitT - dt);

  if (a.dying) { dieStep(a, dt, w); return; }

  /* The wave life budget. Measured: with a 3.2 s wave cadence and a 10–20 s
     attack/break/loop cycle, live enemy count climbed 3 → 7 → 12 → 32 over one
     run and no wave ever resolved. Over budget, a craft finishes the pass it is
     flying and then goes home; past a grace period it goes home regardless. */
  if (!a.spec.static && a.lifeT > a.leaveAt && a.state !== 'exit' && a.state !== 'hunt') {
    if (a.lifeT > a.leaveAt + 5 || (a.state !== 'attack' && a.state !== 'break')) {
      setState(a, 'exit', w);
    } else {
      a.maxPasses = 0;               // break → exit instead of break → loop
    }
  }

  const step = STEP[a.state] || ST.attack;
  step(a, dt, w);

  if (a.spec.static) { staticAim(a, dt, w); return; }

  /* desired world position = player + station + personal wander */
  wander(a, w.time, a.state === 'attack' ? 9 : 16, _d);
  _a.copy(w.player.pos).add(a.offset).add(_d);

  /* evade: a hard lateral displacement that decays — jinking, not oscillating */
  if (a.evadeT > 0) {
    a.evadeT -= dt;
    const e = a.evadeT;
    _a.x += Math.sin(e * 9.0 + a.phase) * 46 * e;
    _a.y += Math.cos(e * 7.4 + a.phase2) * 26 * e;
  }

  /* terrain: nobody flies into the deck */
  const g = w.groundAt(_a.x, _a.z) + (a.spec.radius + 14);
  if (_a.y < g) _a.y = g;

  /* seek that point, inheriting the player's rail velocity so a "station" is
     genuinely a station and not a point the world slides out from under */
  _b.copy(_a).sub(a.pos);
  const dist = _b.length();
  const closeK = clamp(dist / 60, 0.25, 1);
  _b.normalize().multiplyScalar(a.spec.maxSpeed * closeK);
  _b.addScaledVector(w.player.vel, clamp(1 - dist / 400, 0, 1));

  /* a ram drone trades itself for your shield — see ramStep */
  if (a.spec.ram && a.state !== 'exit') ramStep(a, dt, w, _b);

  /* light separation so a wing does not converge to a point */
  if (w.neighbours) {
    for (const o of w.neighbours) {
      if (o === a || o.dying) continue;
      _c.copy(a.pos).sub(o.pos);
      const d2 = _c.lengthSq();
      const rr = (a.spec.radius + o.spec.radius) * 2.6;
      if (d2 < rr * rr && d2 > 1e-4) _b.addScaledVector(_c.normalize(), a.spec.maxSpeed * 0.55 * (1 - Math.sqrt(d2) / rr));
    }
  }

  flyStep(a, _b, dt);
  gunnery(a, dt, w);
}

/**
 * Ram drones, in three beats: MARK → DIVE → SPENT.
 *
 * The old version re-solved a perfect intercept every tick and flew it at
 * 270 m/s with a 2.2 rad/s turn rate. That is a homing missile, and it showed:
 * measured over a five-drone swarm, all five closed to within 2 m and the
 * player lost 70 of 100 shield with no input that could have changed it. A
 * suicide drone has to be *beatable by moving*, or it is a tax rather than a
 * threat.
 *
 * So a drone now shadows you first (flaring its core, which is the telegraph),
 * then commits to a single solved intercept and flies that line. Sidestep and
 * it goes past. Better pilots get exactly one mid-course correction. The wave
 * staggers its commits, so five drones read as five decisions the player can
 * answer one at a time instead of one wall of damage.
 */
function ramStep(a, dt, w, out) {
  a.ramT += dt;

  if (a.ram === 'mark') {
    // hold station, and flare just before committing so the dive is legible
    a.alert = a.ramT > a.ramWait - 0.6 ? 1 : 0.5;
    if (a.ramT >= a.ramWait) {
      a.ram = 'dive';
      a.ramT = 0;
      leadPoint(a.pos, w.player.pos, w.player.vel, a.spec.maxSpeed, a.ramAim);
      a.ramDist0 = Math.max(1, a.pos.distanceTo(a.ramAim));
      a.ramFixes = a.skill > 0.5 ? 1 : 0;
    }
    return;
  }

  if (a.ram === 'dive') {
    _c.copy(a.ramAim).sub(a.pos);
    let d = _c.length();
    if (a.ramFixes > 0 && d < a.ramDist0 * 0.5) {
      a.ramFixes--;
      leadPoint(a.pos, w.player.pos, w.player.vel, a.spec.maxSpeed, a.ramAim);
      _c.copy(a.ramAim).sub(a.pos);
      d = _c.length();
    }
    // spent once the line is flown out, or once it is past the player
    if (d < 10 || a.pos.z > w.player.pos.z + 60 || a.ramT > 7) { a.ram = 'spent'; return; }
    a.alert = 1;
    out.copy(_c).normalize().multiplyScalar(a.spec.maxSpeed);
    return;
  }

  // spent — it missed, and a drone that missed does not get a second attempt
  if (a.state !== 'exit') { a.state = 'exit'; a.stateT = 0; }
  a.alert = 0;
}

/** Turrets do not fly; they slew. */
function staticAim(a, dt, w) {
  _a.copy(w.player.pos).sub(a.pos);
  const range = _a.length();
  a.turretYaw = a.turretYaw ?? 0;
  a.turretPitch = a.turretPitch ?? 0;
  if (range < a.spec.fireRange * 1.6) {
    const wantYaw = Math.atan2(_a.x, -_a.z);
    const wantPitch = Math.atan2(_a.y, Math.hypot(_a.x, _a.z));
    let dy = wantYaw - a.turretYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    a.turretYaw += clamp(dy, -a.spec.turnRate * dt, a.spec.turnRate * dt);
    a.turretPitch += clamp(wantPitch - a.turretPitch, -a.spec.turnRate * dt, a.spec.turnRate * dt);
  } else {
    a.turretYaw += dt * 0.25;
  }
  gunnery(a, dt, w);
}

/**
 * Burst fire with a solved lead and a skill-scaled error cone. A weak pilot
 * misses *behind* you, which is legible; a strong one makes you dodge.
 */
function gunnery(a, dt, w) {
  const spec = a.spec;
  if (!spec.guns || !spec.guns.length) return;
  a.fireT -= dt;

  if (a.burstLeft > 0) {
    a.burstT -= dt;
    if (a.burstT <= 0) {
      a.burstT = spec.burstGap;
      a.burstLeft--;
      w.fire(a);
    }
    return;
  }

  if (a.fireT > 0 || a.state === 'exit' || a.state === 'loop') return;
  if (w.playerRange > spec.fireRange) return;

  if (!spec.static) {
    // only shoot when actually pointing at the player — no shooting sideways
    _a.copy(w.player.pos).sub(a.pos).normalize();
    if (_a.dot(a.fwd) < 0.90) return;
  } else {
    _a.copy(w.player.pos).sub(a.pos);
    const wantYaw = Math.atan2(_a.x, -_a.z);
    let dy = wantYaw - a.turretYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    if (Math.abs(dy) > 0.14) return;
  }

  a.burstLeft = spec.burst;
  a.burstT = 0;
  a.fireT = spec.reload * (1.4 - a.aggression * 0.55);
}

/** Aim vector for one round, including the pilot's error. */
export function aimShot(a, from, w, bulletSpeed, out) {
  leadPoint(from, w.player.pos, w.player.vel, bulletSpeed, out);
  const err = (1 - a.skill) * (18 + w.playerRange * 0.045);
  out.x += (w.rng.next() - 0.5) * 2 * err;
  out.y += (w.rng.next() - 0.5) * 2 * err;
  out.z += (w.rng.next() - 0.5) * 2 * err;
  return out.sub(from).normalize();
}

/* ── death ─────────────────────────────────────────────────────────────────── */

export function killAgent(a, rng, impulse = null) {
  if (a.dying) return;
  a.dying = true;
  a.dieT = 0;
  a.dieFor = 0.55 + rng.next() * 0.85;
  a.spin.set(rng.range(-7, 7), rng.range(-5, 5), rng.range(-11, 11));
  if (impulse) a.vel.addScaledVector(impulse, 1);
  a.speed *= 0.72;
}

function dieStep(a, dt, w) {
  a.dieT += dt;
  a.speed = Math.max(20, a.speed - dt * 55);
  a.vel.copy(a.fwd).multiplyScalar(a.speed);
  a.vel.y -= 26 * a.dieT;                        // it falls out of the sky
  a.pos.addScaledVector(a.vel, dt);
  _q.setFromEuler(new THREE.Euler(a.spin.x * dt, a.spin.y * dt, a.spin.z * dt));
  a.quat.multiply(_q);
  const g = w.groundAt(a.pos.x, a.pos.z);
  if (a.dieT >= a.dieFor || a.pos.y <= g + a.spec.radius * 0.5) a.dead = true;
}

/* ── wingmen ───────────────────────────────────────────────────────────────── */

/**
 * Allied AI. A wingman is mostly a formation-keeper that peels onto a target of
 * opportunity and comes back — the fantasy is that they are *with* you, so the
 * default has to be visible in your peripheral vision, not off screen.
 */
export function thinkWingman(a, dt, w) {
  a.stateT += dt;
  if (a.dying) { dieStep(a, dt, w); return; }

  const home = a.homeSlot;
  if (a.state === 'chased') {
    // jink hard while the player peels the hunter off
    a.offset.x += (home.x + Math.sin(a.stateT * 2.1 + a.phase) * 55 - a.offset.x) * Math.min(1, dt * 1.6);
    a.offset.y += (home.y + Math.sin(a.stateT * 1.5 + a.phase2) * 26 - a.offset.y) * Math.min(1, dt * 1.6);
    a.offset.z += (home.z - 40 - a.offset.z) * Math.min(1, dt * 1.2);
  } else if (a.state === 'engage' && a.target && !a.target.dead) {
    _a.copy(a.target.pos).sub(w.player.pos);
    a.offset.x += (_a.x * 0.9 - a.offset.x) * Math.min(1, dt * 1.1);
    a.offset.y += (_a.y * 0.9 + 8 - a.offset.y) * Math.min(1, dt * 1.1);
    a.offset.z += (_a.z + 90 - a.offset.z) * Math.min(1, dt * 1.1);
    if (a.stateT > 5 || !a.target || a.target.dead) { a.state = 'form'; a.stateT = 0; a.target = null; }
  } else {
    a.state = a.state === 'chased' ? a.state : 'form';
    a.offset.x += (home.x - a.offset.x) * Math.min(1, dt * 0.9);
    a.offset.y += (home.y - a.offset.y) * Math.min(1, dt * 0.9);
    a.offset.z += (home.z - a.offset.z) * Math.min(1, dt * 0.9);
  }

  wander(a, w.time, 5.5, _d);
  _a.copy(w.player.pos).add(a.offset).add(_d);
  const g = w.groundAt(_a.x, _a.z) + 18;
  if (_a.y < g) _a.y = g;

  _b.copy(_a).sub(a.pos);
  const dist = _b.length();
  _b.normalize().multiplyScalar(a.spec.maxSpeed * clamp(dist / 45, 0.2, 1));
  _b.addScaledVector(w.player.vel, clamp(1 - dist / 260, 0, 1));
  flyStep(a, _b, dt);
}
