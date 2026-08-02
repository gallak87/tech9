import * as THREE from 'three';
import { centrelineX, centrelineY } from '../world/corneria.js';

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

  bankPerOffsetVel: 0.0068,
  bankPerStick: 0.62,
  bankMax: 1.15,
  pitchPerOffsetVel: 0.0042,
  pitchPerStick: 0.30,
  yawPerStick: 0.20,
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
  // How much of the ship's offset the camera copies. Low values leave the ship
  // pinned to the rail and sliding around the frame; high values glue the
  // camera to the ship and kill the sense of manoeuvring. 0.7 is the Star Fox
  // compromise — the ship leads the frame without escaping it.
  camOffsetFollow: 0.70,
  camDamp: 8.4,
  // How much of the corridor's heading the hull and the camera lean into. The
  // meander sweeps ±13.7°, so at 1.0 the whole view S-turns forever with the
  // rail's periods (8.7 s / 20 s / 65 s) with no input touched. Both terms are
  // scaled together — scaling only one makes them disagree and the nose wanders
  // across the frame. Below 1.0 the ship crabs by the remainder, which reads as
  // a crosswind; the corridor slides past instead of rotating around you.
  railYawFollow: 0.0,
  camBoostBack: 4.2,
  camBoostFov: 11,
  camBrakeBack: -2.6,
  fovBase: 58,
};

const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

const _v = new THREE.Vector3();
const _vCam = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

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
    this.invuln = 0;

    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.railPos = new THREE.Vector3();
    this.railDir = new THREE.Vector3(0, 0, -1);

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

  update(dt, input) {
    /* ── snapshot previous state for render interpolation ───────────────── */
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    this.prevRailZ = this.railZ;
    this.prevOff.copy(this.off);

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
    this.railZ -= this.speed * dt;
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

    this.pos.set(this.railPos.x + this.off.x, this.railPos.y + this.off.y, this.railZ);

    // Terrain floor — you can graze the deck but not swim. Cushioned rather
    // than bounced: the ship is sprung away over the last few metres of
    // clearance, so the hard stop below is a backstop that rarely fires. A
    // velocity sign flip on contact is a discontinuity, and at full deflection
    // the camera rides rigid against the hull and passes it to the frame.
    const gy = this.world ? this.world.groundAt(this.pos.x, this.pos.z) + 5.5 : -Infinity;
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
    const yawTarget = stickX * TUNE.yawPerStick;

    const k = 1 - Math.exp(-TUNE.attitudeDamp * dt);
    this.bank += (bankTarget - this.bank) * k;
    this.pitch += (pitchTarget - this.pitch) * k;
    this.yaw += (yawTarget - this.yaw) * k;

    let rollExtra = 0;
    if (this.rollT >= 0) {
      const p = this.rollT / TUNE.rollDuration;
      const eased = p * p * (3 - 2 * p);
      rollExtra = this.rollDir * eased * Math.PI * 2;
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

    const back = TUNE.camBack + this.boostActive * TUNE.camBoostBack + this.brakeActive * TUNE.camBrakeBack;
    const railAhead = this.railPoint(railZ - TUNE.camLookAhead, _v).clone();

    // Damp the player's offset, never the ride along the rail. The rail is a
    // known function of railZ, so lagging it buys no smoothing — it only puts
    // the camera where the ship was, and on a meandering rail that lateral lag
    // reads as the ship sliding across the frame with the meander's period.
    const k = 1 - Math.exp(-TUNE.camDamp * dt);
    if (!this._camInit) { this._sOffX = offX; this._sOffY = offY; this._camInit = true; }
    this._sOffX += (offX - this._sOffX) * k;
    this._sOffY += (offY - this._sOffY) * k;

    const f = TUNE.camOffsetFollow;
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
    const softCap = (v, cap) => cap * Math.tanh(v / cap);
    const leadX = softCap(offX - this._sOffX * f, TUNE.camLeadX);
    const leadY = softCap(offY - this._sOffY * f, TUNE.camLeadY);
    this.camPos.set(
      railPos.x + offX - leadX,
      railPos.y + offY - leadY + TUNE.camUp,
      railZ + back,
    );
    // Aim past the ship rather than at it, so the ship sits low-centre in frame
    // and the player is looking at where they are going, not at their own tail.
    // The aim tracks the ship's own height: pinning it to the rail pitched the
    // camera up while the player dived, which threw the ship out of frame from
    // the other side.
    this.camLook.set(
      railPos.x + offX + (railAhead.x - railPos.x) * TUNE.railYawFollow + leadX * TUNE.camAimLead,
      railPos.y + offY + TUNE.camLookUp,
      railAhead.z,
    );

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

    const fov = TUNE.fovBase + this.boostActive * TUNE.camBoostFov - this.brakeActive * 4;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 6);
      camera.updateProjectionMatrix();
    }
  }
}
