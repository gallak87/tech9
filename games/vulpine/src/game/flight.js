import * as THREE from 'three';
import { centrelineX, centrelineY } from '../world/corneria.js';
import { WORLD } from '../world/profile.js';

// ─────────────────────────────────────────────────────────────────────────────
// Flight model — Star Fox's on-rails feel, which is not a physics sim: a rail
// carrier advances down the track at its own speed and the player flies a
// bounded 2D offset around it. Everything that makes it feel good lives in the
// second-order response of that offset (spring + damper), the bank/pitch that
// falls out of offset velocity, and a camera that lags just enough to sell it.
// ─────────────────────────────────────────────────────────────────────────────

export const TUNE = {
  cruiseSpeed: 175,      // m/s along the rail
  boostSpeed: 300,
  brakeSpeed: 105,
  accel: 130,            // m/s² toward the target speed
  boostDrain: 42,        // boost units/s
  boostRefill: 22,
  boostMax: 100,

  boxX: 105,             // lateral half-range around the centreline
  boxYUp: 78,
  boxYDown: 46,
  stickAccel: 520,       // offset acceleration from full stick
  offsetDamp: 4.1,
  offsetMaxSpeed: 132,
  // Soft-wall spring. Stiff enough that the overshoot past the box stays small
  // (v/sqrt(k) ~ 9 m at full offset speed) without needing to rewrite position.
  wallSpring: 220,
  wallDamp: 7,
  // Ground cushion: metres of clearance over which the deck starts pushing back.
  // Small enough that the deck is still reachable for a low pass.
  groundCushion: 9,
  groundSpring: 150,
  groundDamp: 5,
  // Shallower than the ground's cushion on purpose: a roof is ducked under, not
  // skimmed along, so it should be felt later and give way sooner.
  //
  // The two cushions set how tight a lidded corridor can be before it grips
  // from both sides at once. Each clamp holds 5.5 m off its surface, so the
  // ship is inside both wherever the lid is under 26 m above the ground
  // (9 + 6 + 5.5 + 5.5). `tools/lid.mjs --audit` is the check that no level
  // authors one.
  ceilCushion: 6,
  ceilSpring: 150,
  ceilDamp: 5,

  bankPerOffsetVel: 0.0068,
  bankPerStick: 0.62,
  bankMax: 1.15,
  pitchPerOffsetVel: 0.0042,
  pitchPerStick: 0.30,
  yawPerStick: 0.20,
  // Yaw into a lateral slide, the counterpart of `pitchPerOffsetVel`. Its absence
  // was an asymmetry: vertical movement turned the nose into itself and lateral
  // movement did not, so measured crab was ~2° climbing against 19-23° panning,
  // and the trails veered through every turn. Zeroing crab entirely would need
  // atan(132/175) = 37°, which reads as the ship flying sideways; this leaves a
  // deliberate few degrees of slide, which is the Arwing's character. Live on the
  // `yaw into slide` dev knob.
  yawPerOffsetVel: 0.0030,
  attitudeDamp: 7.5,

  rollDuration: 0.62,
  rollCooldown: 0.16,
  somersaultDuration: 1.05,
  uturnDuration: 1.25,

  camBack: 17.0,
  camUp: 3.15,
  camLookAhead: 46,
  camLookUp: 2.6,
  // Hard cap, in metres, on how far the ship may lead the rig. Sized against
  // the trail: at 17 m back, 4.5 m puts the ship 15° off the camera axis and
  // 2.5 m puts it 18° below, inside a 58° frustum with room to spare.
  camLeadX: 4.5,
  camLeadY: 2.5,
  // How hard the aim swings out with that lead. 0 keeps the ship furthest
  // off-centre, 1 nearly re-centres it.
  camAimLead: 0.6,
  camDamp: 8.4,
  // Scales the velocity-derived lead before the cap. The lead is the damper's
  // own lag (`off - smoothedOff`), which is ~ velocity / camDamp: at terminal
  // offset speed that is 132 / 8.4 = 15.7 m, so a gain of 1 already saturates
  // both caps at full stick and ramps proportionally on the way there.
  camLeadGain: 1.0,

  // Aim lead — how far the crosshair rides ahead of the hull, as half-angles off
  // the camera axis. Saturating through tanh so there is a definite "fully
  // panned". Driven by offset *velocity*: which side of the corridor you sit on
  // must never enter an aim term (see the centreline note in updateCamera).
  // The camera lead already carries the hull to ~0.15 ndcX at full pan, so these
  // have to clear that to read as leading rather than trailing.
  // Sized against the camera lead, measured: the hull itself displaces ~0.17 ndc
  // at full pan, so these are set to put the reticle ~1.3x that. Equal throw
  // would read as the crosshair being welded to the hull rather than leading it.
  aimYawMax: 0.26,         // rad -> ~0.23 ndc of throw at aimRange
  aimPitchMax: 0.17,
  aimVelScale: 78,         // m/s of offset velocity that saturates the lead
  // Distance the aim point sits ahead of the hull. Must match `converge` in
  // combat.js: the guns are handed this exact point, so a mismatch would put the
  // rounds somewhere the crosshair is not.
  aimRange: 520,
  // How much of the corridor's heading the hull and the camera adopt. The meander
  // sweeps ±13.7°. One factor drives both the hull's yaw and the camera's heading,
  // so they cannot disagree.
  //
  // 1.0 for a reason, not as a default: the ship travels along the full corridor
  // heading regardless of this value, so anything less leaves the hull angled off
  // its own velocity by the remainder. That crab shows up as the engine trails
  // veering with no input touched — the trail is laid down along true travel while
  // the nozzles point along the hull. Owner-reported, and it is the direct
  // arithmetic consequence of a partial value.
  //
  // Below 1.0 is available on the `rail yaw` dev knob, but expect the veer back.
  railYawFollow: 1.0,
  // Scales both aim-lead maxima together, for tuning the crosshair's throw
  // without touching their ratio. Live on the `aim lead` dev knob.
  aimLeadScale: 1.0,
  camBoostBack: 4.2,
  camBoostFov: 11,
  camBrakeBack: -2.6,
  fovBase: 58,
};

const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

const _v = new THREE.Vector3();
const _vCam = new THREE.Vector3();
const _vAim = new THREE.Vector3();
const _vRight = new THREE.Vector3();
const _vUp = new THREE.Vector3();
const _vHead = new THREE.Vector3();
const _vShip = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

export class Flight {
  constructor(ship, world) {
    this.ship = ship;
    this.world = world;

    this.railZ = 0;
    this.speed = TUNE.cruiseSpeed;
    this.boost = TUNE.boostMax;
    this.boostActive = 0;
    this.brakeActive = 0;

    this.off = new THREE.Vector2(0, 12);
    this.offVel = new THREE.Vector2(0, 0);

    this.bank = 0; this.pitch = 0; this.yaw = 0;
    this.rollT = -1; this.rollDir = 1; this.rollCd = 0;
    this.somersaultT = -1;
    this.detached = false;
    // Set only through `die()`/`revive()`, which combat.js calls from the one
    // place that knows: the death and respawn path. See `update()`.
    this.dead = false;
    this.climb = 0;
    this.invuln = 0;

    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    // Where the guns converge and where the reticle is drawn — one point, so the
    // crosshair cannot promise a shot the guns do not take. Built in updateCamera,
    // in the camera's own basis.
    this.aimDir = new THREE.Vector3(0, 0, -1);
    // Seeded ahead of the start pose: it is rebuilt in updateCamera, but the first
    // sim step can land before the first render, and the guns read it.
    this.aimPoint = new THREE.Vector3(0, 12, -TUNE.aimRange);
    this.aimLeadX = 0;
    this.aimLeadY = 0;
    this.railPos = new THREE.Vector3();
    this.railDir = new THREE.Vector3(0, 0, -1);

    // Resolved per level by `lens()`, keyed on `WORLD.camera`'s identity.
    this._lensOf = undefined;
    this._lens = null;

    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this._camInit = false;
    this.shake = 0;
    this._shakeSeed = 0;

    this.throttleN = 0.5;   // 0..1 for engine visuals

    // Previous sim state, for render interpolation. The sim advances in fixed
    // 120 Hz quanta while frames land wherever the display puts them; drawing
    // raw sim state makes the ship stutter against the smoothly-damped camera
    // whenever the steps-per-frame count oscillates. See applyRenderState().
    this.prevPos = new THREE.Vector3();
    this.prevQuat = new THREE.Quaternion();
    this.prevRailZ = 0;
    this.prevOff = new THREE.Vector2(0, 12);
    this._hasPrev = false;
  }

  /**
   * Put the ship back at the head of a fresh corridor. `prevRailZ` goes with it
   * or the render interpolator draws one frame smeared across the whole level.
   */
  resetRail() {
    this.railZ = 0;
    this.prevRailZ = 0;
    this.off.set(0, 0);
    this.offVel.set(0, 0);
  }

  railPoint(z, out = new THREE.Vector3()) {
    return out.set(centrelineX(z), centrelineY(z), z);
  }

  railTangent(z, out = new THREE.Vector3()) {
    const e = 6;
    const a = this.railPoint(z + e, _v).clone();
    const b = this.railPoint(z - e, _v);
    return out.copy(b).sub(a).normalize();
  }

  addShake(amount) { this.shake = Math.min(1.6, this.shake + amount); }

  /**
   * The lens this level is flown through: `TUNE`'s defaults with the active
   * DNA's `camera` over the top.
   *
   * One camera height, one FOV and one centred vanishing point across all seven
   * levels means a level with a different shape still arrives through an
   * identical frame. Read every frame, so it is cached on the config's
   * identity, which a world swap replaces.
   */
  get lens() {
    if (this._lensOf !== WORLD.camera) {
      const c = WORLD.camera;
      this._lensOf = c;
      this._lens = {
        back: c?.back ?? TUNE.camBack,
        up: c?.up ?? TUNE.camUp,
        lookAhead: c?.lookAhead ?? TUNE.camLookAhead,
        lookUp: c?.lookUp ?? TUNE.camLookUp,
        fov: c?.fov ?? TUNE.fovBase,
      };
    }
    return this._lens;
  }

  /** The player blew up. Stops the level; see the `dead` branch in `update()`. */
  die() { this.dead = true; }

  /**
   * A new ship arrives, at the rail position the last one died at. Speed is
   * restored outright rather than accelerated back up from the zero `die()`
   * bled it to: a respawn that spends 1.3 s at walking pace hands the player a
   * second penalty for the death they have already paid for.
   */
  revive() {
    this.dead = false;
    this.speed = TUNE.cruiseSpeed;
    this.offVel.set(0, 0);
    this.rollT = -1;
    this.somersaultT = -1;
  }

  update(dt, input) {
    /* ── snapshot previous state for render interpolation ───────────────── */
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    this.prevRailZ = this.railZ;
    this.prevOff.copy(this.off);

    /* ── dead: the level stops with the player ──────────────────────────────
       THE RAIL IS THE LEVEL'S CLOCK. combat.js arms every wave, comm and grant
       off `railZ`, so a rail that keeps running through a 2.2 s death spawns
       ~390 m of level into an empty sky and the respawn lands mid-encounter
       against contacts it never saw arrive. Freezing the rail is the whole fix;
       the rest of this branch is what has to freeze *with* it so the frame does
       not contradict it — a hull that still banks to the stick, engine trails
       still being laid from a ship that is not drawn, and a chase camera still
       flying the corridor all say "you are alive" over the top of an explosion.

       What keeps running: the decays. Shake settles, the offset drifts to a
       stop, and speed bleeds to zero so the engine note dies under the
       explosion instead of holding a cruise note through it. Nothing here reads
       `input` — that is the point. */
    if (this.dead) {
      this.speed = Math.max(0, this.speed - TUNE.accel * 2.6 * dt);
      this.throttleN = 0;
      this.boostActive *= Math.exp(-9 * dt);
      this.brakeActive *= Math.exp(-9 * dt);
      this.offVel.multiplyScalar(Math.exp(-5 * dt));
      this.aimLeadX = 0; this.aimLeadY = 0;
      this.shake = Math.max(0, this.shake - dt * 2.1);
      this._shakeSeed += dt * 47;
      this._hasPrev = true;
      return;
    }

    /* ── speed ──────────────────────────────────────────────────────────── */
    const wantBoost = input.boost > 0.05 && this.boost > 0;
    const wantBrake = input.brake > 0.05;
    this.boostActive += ((wantBoost ? 1 : 0) - this.boostActive) * Math.min(1, dt * 9);
    this.brakeActive += ((wantBrake ? 1 : 0) - this.brakeActive) * Math.min(1, dt * 9);

    if (wantBoost) this.boost = Math.max(0, this.boost - TUNE.boostDrain * dt * input.boost);
    else this.boost = Math.min(TUNE.boostMax, this.boost + TUNE.boostRefill * dt);

    let target = TUNE.cruiseSpeed;
    if (wantBoost) target = THREE.MathUtils.lerp(TUNE.cruiseSpeed, TUNE.boostSpeed, input.boost);
    else if (wantBrake) target = THREE.MathUtils.lerp(TUNE.cruiseSpeed, TUNE.brakeSpeed, input.brake);
    this.speed += THREE.MathUtils.clamp(target - this.speed, -TUNE.accel * dt * 2.4, TUNE.accel * dt);
    // `detached` is the between-levels state: the ship is off-world, so the rail
    // holds and the terrain floor below is skipped. Both together, never one —
    // advancing the rail would fire the next level's waves during the hop, and
    // clamping to the ground would drop the ship onto terrain that is not drawn.
    if (!this.detached) this.railZ -= this.speed * dt;
    this.throttleN = THREE.MathUtils.clamp((this.speed - TUNE.brakeSpeed) / (TUNE.boostSpeed - TUNE.brakeSpeed), 0, 1);

    /* ── manoeuvres ─────────────────────────────────────────────────────── */
    this.rollCd = Math.max(0, this.rollCd - dt);
    if (this.rollT >= 0) {
      this.rollT += dt;
      if (this.rollT >= TUNE.rollDuration) { this.rollT = -1; this.rollCd = TUNE.rollCooldown; }
    } else if (this.rollCd <= 0 && (input.rollLPressed || input.rollRPressed)) {
      this.rollT = 0;
      this.rollDir = input.rollRPressed ? 1 : -1;
      this.invuln = Math.max(this.invuln, TUNE.rollDuration * 0.8);
    }
    if (this.somersaultT >= 0) {
      this.somersaultT += dt;
      if (this.somersaultT >= TUNE.somersaultDuration) this.somersaultT = -1;
    } else if (input.somersaultPressed) {
      this.somersaultT = 0;
    }
    this.invuln = Math.max(0, this.invuln - dt);

    /* ── 2D offset: spring toward stick-driven velocity ─────────────────── */
    const rolling = this.rollT >= 0;
    const stickX = rolling ? this.rollDir * 0.55 : input.yaw;
    const stickY = rolling ? 0 : input.pitch;

    this.offVel.x += stickX * TUNE.stickAccel * dt;
    this.offVel.y += -stickY * TUNE.stickAccel * dt;
    const damp = Math.exp(-TUNE.offsetDamp * dt);
    this.offVel.multiplyScalar(damp);
    const sp = this.offVel.length();
    if (sp > TUNE.offsetMaxSpeed) this.offVel.multiplyScalar(TUNE.offsetMaxSpeed / sp);

    this.off.x += this.offVel.x * dt;
    this.off.y += this.offVel.y * dt;

    // Soft walls — a spring and extra damping past the limit, so the edge has
    // weight. The position is never rewritten: remapping it each tick
    // (`hi + over * 0.35`) is an iterated map that lands a fresh discontinuity
    // on the offset on every tick spent against the wall, measured at 0.85 m of
    // per-tick acceleration. The chase camera sits rigid against the hull at
    // full deflection, so it passes all of that straight to the frame.
    const softClamp = (v, vel, lo, hi) => {
      const over = v > hi ? v - hi : (v < lo ? v - lo : 0);
      if (over === 0) return [v, vel];
      return [v, (vel - over * TUNE.wallSpring * dt) * Math.exp(-TUNE.wallDamp * dt)];
    };
    [this.off.x, this.offVel.x] = softClamp(this.off.x, this.offVel.x, -TUNE.boxX, TUNE.boxX);
    [this.off.y, this.offVel.y] = softClamp(this.off.y, this.offVel.y, -TUNE.boxYDown, TUNE.boxYUp);

    /* ── world transform ────────────────────────────────────────────────── */
    this.railPoint(this.railZ, this.railPos);
    this.railTangent(this.railZ, this.railDir);

    // `climb` is the hop's altitude, kept out of `off.y` on purpose: the offset
    // is a box with sprung walls and a ground cushion, and pushing 2 km through
    // it would fight both. It is added after, so the corridor physics never see
    // it and are unchanged the moment it returns to zero.
    this.pos.set(this.railPos.x + this.off.x, this.railPos.y + this.off.y + this.climb, this.railZ);

    // The lid, cushioned and clamped exactly as the floor is. Only a `works`
    // roof or a canopy reports one; everywhere else it is Infinity and both
    // tests below are dead.
    //
    // Runs before the floor so that the floor wins a corridor too tight for
    // both: through the roof is a wrong picture, through the ground is no
    // picture at all.
    //
    // Stood down while `climb` is non-zero. The hop is deliberately leaving the
    // level — `climb` is kept out of `off.y` so the corridor physics never see
    // it, and a lid that held the ship down would be the one thing that did.
    const cy = (this.world && !this.detached && this.climb === 0)
      ? this.world.ceilingAt(this.pos.x, this.pos.z) - 5.5 : Infinity;
    const headroom = cy - this.pos.y;
    if (headroom < TUNE.ceilCushion) {
      const pen = TUNE.ceilCushion - headroom;
      this.offVel.y = (this.offVel.y - pen * TUNE.ceilSpring * dt) * Math.exp(-TUNE.ceilDamp * dt);
    }
    if (this.pos.y > cy) {
      const push = this.pos.y - cy;
      this.pos.y = cy;
      this.off.y -= push;
      if (this.offVel.y > 0) this.offVel.y = 0;
      this.addShake(Math.min(0.5, push * 0.05));
    }

    // Terrain floor — you can graze the deck but not swim. Cushioned rather
    // than bounced: the ship is sprung away over the last few metres of
    // clearance, so the hard stop below is a backstop that rarely fires. A
    // velocity sign flip on contact is a discontinuity, and at full deflection
    // the camera rides rigid against the hull and passes it to the frame.
    const gy = (this.world && !this.detached)
      ? this.world.groundAt(this.pos.x, this.pos.z) + 5.5 : -Infinity;
    const clearance = this.pos.y - gy;
    if (clearance < TUNE.groundCushion) {
      const pen = TUNE.groundCushion - clearance;
      this.offVel.y = (this.offVel.y + pen * TUNE.groundSpring * dt) * Math.exp(-TUNE.groundDamp * dt);
    }
    if (this.pos.y < gy) {
      const push = gy - this.pos.y;
      this.pos.y = gy;
      this.off.y += push;
      if (this.offVel.y < 0) this.offVel.y = 0;
      this.addShake(Math.min(0.5, push * 0.05));
    }

    /* ── attitude ───────────────────────────────────────────────────────── */
    const bankTarget = THREE.MathUtils.clamp(
      -this.offVel.x * TUNE.bankPerOffsetVel - stickX * TUNE.bankPerStick, -TUNE.bankMax, TUNE.bankMax);
    const pitchTarget = THREE.MathUtils.clamp(
      this.offVel.y * TUNE.pitchPerOffsetVel + -stickY * TUNE.pitchPerStick, -0.6, 0.6);
    // Negated: YXZ maps yaw θ to forward (-sinθ, 0, -cosθ), so a *positive* yaw
    // swings the nose toward -x. Without the sign, pushing right (stickX > 0)
    // pitched the nose left while the ship translated right — the hull crabbed
    // against its own travel by 0.2 rad, worth -0.36 ndcX of aim at the 520 m
    // convergence range. That is the whole of the "horizontal is backwards"
    // report: the aim lead rides the hull, so it inherited the error and doubled
    // it. Measured with `tools/pilot.mjs aim`.
    const yawTarget = -(stickX * TUNE.yawPerStick + this.offVel.x * TUNE.yawPerOffsetVel);

    const k = 1 - Math.exp(-TUNE.attitudeDamp * dt);
    this.bank += (bankTarget - this.bank) * k;
    this.pitch += (pitchTarget - this.pitch) * k;
    this.yaw += (yawTarget - this.yaw) * k;

    let rollExtra = 0;
    if (this.rollT >= 0) {
      const p = this.rollT / TUNE.rollDuration;
      const eased = p * p * (3 - 2 * p);
      // Negated for the same reason `bankTarget` is: a Z Euler term rotates the
      // hull's up vector to -x, so a *positive* sweep reads as counter-clockwise
      // from the chase camera. Unnegated, roll-right (C) spun anti-clockwise
      // while dodging right, and fought the bank it was carrying — the two terms
      // are summed into one Euler and disagreed by construction.
      rollExtra = -this.rollDir * eased * Math.PI * 2;
    }
    // Somersault: one clean 360° pitch loop, eased so the apex hangs.
    let somerPitch = 0;
    if (this.somersaultT >= 0) {
      somerPitch = easeInOut(this.somersaultT / TUNE.somersaultDuration) * Math.PI * 2;
    }

    // YXZ maps yaw θ to forward (-sinθ, 0, -cosθ), so pointing the nose down the
    // corridor needs the negated x. Without it the hull mirrors about the
    // corridor, and since the camera aims down the corridor the two swings add
    // instead of cancelling.
    const railYaw = Math.atan2(-this.railDir.x, -this.railDir.z) * TUNE.railYawFollow;
    _e.set(this.pitch + somerPitch, this.yaw + railYaw, this.bank + rollExtra, 'YXZ');
    this.quat.setFromEuler(_e);

    this.ship.position.copy(this.pos);
    this.ship.quaternion.copy(this.quat);

    // How hard the player is crossing the corridor, normalised and saturating:
    // ±1 at `aimVelScale` of offset velocity. Scalars only — the aim geometry is
    // built in `updateCamera`, in the camera's basis, because the crosshair is an
    // extension of the *camera*, not of the hull or the corridor. Keeping the two
    // apart is the point: this is a sim-rate input reading, that is a per-frame
    // projection, and conflating them is what put the aim on the hull's
    // exaggerated attitude in the first place.
    this.aimLeadX = Math.tanh(this.offVel.x / TUNE.aimVelScale);
    this.aimLeadY = Math.tanh(this.offVel.y / TUNE.aimVelScale);

    const api = this.ship.userData.api;
    if (api) api.update(dt, { throttle: this.throttleN, boost: this.boostActive, roll: stickX });

    /* ── shake decay ────────────────────────────────────────────────────── */
    this.shake = Math.max(0, this.shake - dt * 2.1);
    this._shakeSeed += dt * 47;
    this._hasPrev = true;
  }

  /**
   * Blend the ship's *rendered* transform between the last two sim states.
   * alpha = accumulator remainder / fixed step, i.e. how far into the next
   * sim step this frame lands. Rendering trails the sim by <1 step, which is
   * imperceptible; the payoff is that motion is continuous no matter how the
   * fixed steps quantise across frames.
   */
  applyRenderState(alpha) {
    if (!this._hasPrev) return;
    const a = THREE.MathUtils.clamp(alpha, 0, 1);
    this.ship.position.lerpVectors(this.prevPos, this.pos, a);
    this.ship.quaternion.slerpQuaternions(this.prevQuat, this.quat, a);
  }

  /** Chase camera. Lags the ship, leads the rail, widens under boost.
   *  `alpha` interpolates the sim state exactly as applyRenderState does, so
   *  the camera targets and the rendered ship move on the same timeline. */
  updateCamera(dt, camera, alpha = 1) {
    const a = this._hasPrev ? THREE.MathUtils.clamp(alpha, 0, 1) : 1;
    const railZ = this.prevRailZ + (this.railZ - this.prevRailZ) * a;
    const offX = this.prevOff.x + (this.off.x - this.prevOff.x) * a;
    const offY = this.prevOff.y + (this.off.y - this.prevOff.y) * a;
    const railPos = this.railPoint(railZ, _vCam);

    const L = this.lens;
    const back = L.back + this.boostActive * TUNE.camBoostBack + this.brakeActive * TUNE.camBrakeBack;

    // Damp the player's offset, never the ride along the rail. The rail is a
    // known function of railZ, so lagging it buys no smoothing — it only puts
    // the camera where the ship was, and on a meandering rail that lateral lag
    // reads as the ship sliding across the frame with the meander's period.
    const k = 1 - Math.exp(-TUNE.camDamp * dt);
    if (!this._camInit) { this._sOffX = offX; this._sOffY = offY; this._camInit = true; }
    this._sOffX += (offX - this._sOffX) * k;
    this._sOffY += (offY - this._sOffY) * k;

    // Both the rig and its aim hang off the ship, and the ship's lead over the
    // rig is capped in metres. Expressed as a share of the offset it is not:
    // the box is 105 m wide and 124 m tall against a 17 m trail, so at full
    // deflection the ship sat 56° off axis laterally and 47° below — outside a
    // 58° frustum, i.e. gone. Capping the realised gap also bounds the damper's
    // own lag, worth 15 m on its own at terminal offset speed.
    // tanh, not clamp: a hard cap flips between rigid-to-ship when saturated and
    // damped-to-rail when not, and that derivative corner reads as a snap every
    // time the lead crosses it. tanh matches the linear response for small leads
    // and approaches the cap without ever reaching a corner.
    //
    // The lead is the damper's own lag and nothing else. It used to be
    // `off - smoothedOff * camOffsetFollow`, which expands to
    // `(off - smoothedOff) + 0.3 * smoothedOff` — a velocity term plus 30% of
    // *position*. That position term made which side of the ship the camera sat
    // on a function of which half of the corridor the ship was in: saturated to
    // +4.5 m out at one wall and -4.5 m at the other, swinging through zero in
    // the middle ±30 m. Crossing the centreline therefore whipped the rig 9 m
    // laterally plus 5.4 m of aim in about 0.45 s — seen-from-the-left to
    // seen-from-the-right — while travelling middle-to-edge only ever showed half
    // that swing, in the direction of travel, and felt correct. Position must
    // never enter a lead term.
    const softCap = (v, cap) => cap * Math.tanh(v / cap);
    const leadX = softCap((offX - this._sOffX) * TUNE.camLeadGain, TUNE.camLeadX);
    const leadY = softCap((offY - this._sOffY) * TUNE.camLeadGain, TUNE.camLeadY);
    // ── heading ────────────────────────────────────────────────────────────
    // The rig is built along the *heading*, not along world z. `camPos.z` used to
    // be `railZ + back`, which parks the camera behind the ship in world z rather
    // than behind it along its direction of travel; on a corridor that bends
    // ±13.7° those are different places, and the camera never swings round to sit
    // behind the hull. Everything below is expressed in heading / right / up, so
    // the rail supplies the path and the heading and is never a visual anchor.
    _vHead.copy(this.railDir).normalize();
    if (TUNE.railYawFollow < 0.999) {
      // Blend toward world-forward. Anything less than 1 leaves the hull angled
      // off its own velocity by the remainder — that crab is what makes the engine
      // trails veer with no input touched, since the trail is laid down along true
      // travel while the nozzles point along the hull.
      _vHead.set(
        _vHead.x * TUNE.railYawFollow,
        _vHead.y * TUNE.railYawFollow,
        _vHead.z * TUNE.railYawFollow + -1 * (1 - TUNE.railYawFollow),
      ).normalize();
    }
    _vRight.crossVectors(_vHead, UP).normalize();

    // `climb` is added here and nowhere else in the rig: it must move the camera
    // with the ship, but it must NOT enter the lead terms below, which are built
    // from offset velocity. A 2 km ramp read as offset velocity would saturate
    // the lead cap for the whole ascent and weld the rig to the hull.
    _vShip.set(railPos.x + offX, railPos.y + offY + this.climb, railZ);
    this.camPos.copy(_vShip)
      .addScaledVector(_vHead, -back)
      .addScaledVector(_vRight, -leadX)
      .addScaledVector(UP, L.up - leadY);
    // Aim past the ship rather than at it, so the ship sits low-centre in frame
    // and the player is looking at where they are going, not at their own tail.
    // The aim tracks the ship's own height: pinning it to the rail pitched the
    // camera up while the player dived, which threw the ship out of frame from
    // the other side.
    this.camLook.copy(_vShip)
      .addScaledVector(_vHead, L.lookAhead)
      .addScaledVector(_vRight, leadX * TUNE.camAimLead)
      .addScaledVector(UP, L.lookUp);

    camera.position.copy(this.camPos);
    if (this.shake > 0.001) {
      const s = this.shake * this.shake * 1.5;
      camera.position.x += Math.sin(this._shakeSeed * 1.7) * s;
      camera.position.y += Math.sin(this._shakeSeed * 2.3 + 1.1) * s;
      camera.position.z += Math.sin(this._shakeSeed * 1.3 + 2.7) * s * 0.4;
    }
    camera.lookAt(this.camLook);
    // subtle camera roll into the bank — sells the turn without inducing nausea
    camera.rotateZ(this.bank * 0.16);

    // ── aim point ──────────────────────────────────────────────────────────
    // Where the guns converge and where the reticle is drawn. Built in the
    // *camera's* basis, after the camera is final, which is what makes the
    // on-screen behaviour exact instead of emergent: a point `aimRange` straight
    // down the view axis from the ship projects to the ship's own screen
    // position, so displacing it along camera-right/up moves the crosshair off
    // the hull by a known amount, in a known direction, on a known axis.
    //
    // Two earlier bases both failed, measured with `tools/pilot.mjs aim`:
    //  • the hull's quaternion — bank and pitch are exaggerated for looks
    //    (climbing reaches 0.75 rad), and 520 m of lever arm turned that into a
    //    1.03 ndcY swing that threw the crosshair off the frame;
    //  • the corridor heading — the reticle then wandered with the meander, which
    //    is drift by another name.
    // Velocity drives the lead, never position: position in a lead term is the
    // centreline-crossing bug documented above.
    const aimK = TUNE.aimLeadScale;
    const throwX = TUNE.aimRange * Math.tan(TUNE.aimYawMax) * aimK * this.aimLeadX;
    const throwY = TUNE.aimRange * Math.tan(TUNE.aimPitchMax) * aimK * this.aimLeadY;
    _vAim.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _vRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _vUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    this.aimPoint.copy(this.ship.position)
      .addScaledVector(_vAim, TUNE.aimRange)
      .addScaledVector(_vRight, throwX)
      .addScaledVector(_vUp, throwY);
    this.aimDir.copy(this.aimPoint).sub(this.ship.position).normalize();

    const fov = L.fov + this.boostActive * TUNE.camBoostFov - this.brakeActive * 4;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 6);
      camera.updateProjectionMatrix();
    }
  }
}
