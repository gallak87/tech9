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

  camBack: 15.4,
  camUp: 3.55,
  camLookAhead: 42,
  camOffsetFollow: 0.30,
  camDamp: 7.2,
  camBoostBack: 4.6,
  camBoostFov: 11,
  camBrakeBack: -3.0,
  fovBase: 58,
};

const _v = new THREE.Vector3();
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

    // soft walls — push back rather than clamp, so the edge has weight
    const softClamp = (v, vel, lo, hi) => {
      if (v > hi) { const over = v - hi; return [hi + over * 0.35, vel * 0.35 - over * 6 * dt]; }
      if (v < lo) { const over = lo - v; return [lo - over * 0.35, vel * 0.35 + over * 6 * dt]; }
      return [v, vel];
    };
    [this.off.x, this.offVel.x] = softClamp(this.off.x, this.offVel.x, -TUNE.boxX, TUNE.boxX);
    [this.off.y, this.offVel.y] = softClamp(this.off.y, this.offVel.y, -TUNE.boxYDown, TUNE.boxYUp);

    /* ── world transform ────────────────────────────────────────────────── */
    this.railPoint(this.railZ, this.railPos);
    this.railTangent(this.railZ, this.railDir);

    this.pos.set(this.railPos.x + this.off.x, this.railPos.y + this.off.y, this.railZ);

    // terrain floor — you can graze the deck but not swim
    const gy = this.world ? this.world.groundAt(this.pos.x, this.pos.z) + 5.5 : -Infinity;
    if (this.pos.y < gy) {
      const push = gy - this.pos.y;
      this.pos.y = gy;
      this.off.y += push;
      if (this.offVel.y < 0) this.offVel.y *= -0.25;
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
    let somerPitch = 0;
    if (this.somersaultT >= 0) {
      const p = this.somersaultT / TUNE.somersaultDuration;
      somerPitch = Math.sin(p * Math.PI) * Math.PI * (p < 0.5 ? 1 : 1) * (1 - Math.cos(p * Math.PI * 2)) * 0.5;
      somerPitch = (1 - Math.cos(p * Math.PI * 2)) * 0.5 * Math.PI * 2 * 0.5;
    }

    _e.set(this.pitch + somerPitch, this.yaw + Math.atan2(this.railDir.x, -this.railDir.z), this.bank + rollExtra, 'YXZ');
    this.quat.setFromEuler(_e);

    this.ship.position.copy(this.pos);
    this.ship.quaternion.copy(this.quat);

    const api = this.ship.userData.api;
    if (api) api.update(dt, { throttle: this.throttleN, boost: this.boostActive, roll: stickX });

    /* ── shake decay ────────────────────────────────────────────────────── */
    this.shake = Math.max(0, this.shake - dt * 2.1);
    this._shakeSeed += dt * 47;
  }

  /** Chase camera. Lags the ship, leads the rail, widens under boost. */
  updateCamera(dt, camera) {
    const back = TUNE.camBack + this.boostActive * TUNE.camBoostBack + this.brakeActive * TUNE.camBrakeBack;
    const railAhead = this.railPoint(this.railZ - TUNE.camLookAhead, _v).clone();

    const desired = new THREE.Vector3(
      this.railPos.x + this.off.x * TUNE.camOffsetFollow,
      this.railPos.y + this.off.y * TUNE.camOffsetFollow + TUNE.camUp,
      this.railZ + back,
    );
    const lookAt = new THREE.Vector3(
      railAhead.x + this.off.x * (TUNE.camOffsetFollow * 0.55),
      railAhead.y + this.off.y * (TUNE.camOffsetFollow * 0.55) + 1.2,
      railAhead.z,
    );

    if (!this._camInit) { this.camPos.copy(desired); this.camLook.copy(lookAt); this._camInit = true; }
    const k = 1 - Math.exp(-TUNE.camDamp * dt);
    this.camPos.lerp(desired, k);
    this.camLook.lerp(lookAt, k);

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
