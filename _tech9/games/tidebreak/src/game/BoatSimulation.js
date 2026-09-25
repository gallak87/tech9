import { START, isNavigable } from '../world/islandDefinition.js';

const FIXED_STEP = 1 / 120;
const FOOTPRINT = 2.8;
const SWEEP_SPACING = 0.2;
const clampInput = (value) =>
  Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;

/** Planar, metre/second boat motion. Heading zero faces -Z; positive turns right. */
export class BoatSimulation {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = START.x;
    this.z = START.z;
    this.heading = START.heading;
    this.vx = 0;
    this.vz = 0;
    this.speed = 0;
    this.steer = 0;
    this.collisions = 0;
    this._remainder = 0;
    this._touching = false;
    return this.snapshot();
  }

  step(dt, { throttle = 0, steer = 0 } = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return this.snapshot();
    const drive = clampInput(throttle);
    const rudder = clampInput(steer);
    const duration = this._remainder + dt;
    const ticks = Math.floor((duration + 1e-10) / FIXED_STEP);
    this._remainder = Math.max(0, duration - ticks * FIXED_STEP);
    for (let tick = 0; tick < ticks; tick++) this._tick(drive, rudder);
    return this.snapshot();
  }

  _tick(throttle, rudder) {
    const dt = FIXED_STEP;
    this.steer += (rudder - this.steer) * (1 - Math.exp(-9 * dt));
    const previousForward =
      this.vx * Math.sin(this.heading) - this.vz * Math.cos(this.heading);
    // A stopped boat cannot pivot. The rudder changes direction in reverse.
    this.heading += this.steer * previousForward * 0.088 * dt;
    this.heading = Math.atan2(Math.sin(this.heading), Math.cos(this.heading));
    const fx = Math.sin(this.heading);
    const fz = -Math.cos(this.heading);
    let forward = this.vx * fx + this.vz * fz;
    let lateral = this.vx * -fz + this.vz * fx;
    let thrust = throttle >= 0 ? throttle * 2.56 : throttle * 0.9;
    if (throttle < 0 && forward > 0.1) thrust = throttle * 4;
    if (throttle > 0 && forward < -0.1) thrust = throttle * 3.8;
    forward +=
      (thrust - 0.16 * forward - 0.036 * forward * Math.abs(forward)) * dt;
    lateral *= Math.exp(-2.9 * dt);
    this.vx = fx * forward - fz * lateral;
    this.vz = fz * forward + fx * lateral;
    const hit = this._move(this.vx * dt, this.vz * dt);
    if (hit && !this._touching) this.collisions++;
    this._touching = hit;
    this.speed = this.vx * fx + this.vz * fz;
  }

  _move(dx, dz) {
    // Sweep the footprint even for a long frame or unusually large velocity.
    const divisions = Math.max(
      1,
      Math.ceil(Math.hypot(dx, dz) / SWEEP_SPACING),
    );
    let stepX = dx / divisions;
    let stepZ = dz / divisions;
    let hit = false;
    for (let i = 0; i < divisions; i++) {
      if (isNavigable(this.x + stepX, this.z + stepZ, FOOTPRINT)) {
        this.x += stepX;
        this.z += stepZ;
        continue;
      }
      hit = true;
      // Keep the free component so glancing contacts slide. Removing only the
      // blocked velocity also leaves reverse available immediately on contact.
      const freeX = isNavigable(this.x + stepX, this.z, FOOTPRINT);
      const freeZ = isNavigable(this.x, this.z + stepZ, FOOTPRINT);
      if (freeX && (!freeZ || Math.abs(stepX) > Math.abs(stepZ))) {
        this.x += stepX;
        this.vz = 0;
        stepZ = 0;
      } else if (freeZ) {
        this.z += stepZ;
        this.vx = 0;
        stepX = 0;
      } else {
        this.vx = 0;
        this.vz = 0;
        break;
      }
    }
    return hit;
  }

  snapshot() {
    return {
      x: this.x,
      z: this.z,
      heading: this.heading,
      speed: this.speed,
      planarSpeed: Math.hypot(this.vx, this.vz),
      vx: this.vx,
      vz: this.vz,
      steer: this.steer,
      collisions: this.collisions,
    };
  }
}
