const FIXED_STEP = 1 / 120;
const SWEEP_SPACING = 0.2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const input = (value) => (Number.isFinite(value) ? clamp(value, -1, 1) : 0);

export const DEFAULT_HANDLING = Object.freeze({
  acceleration: 2.56,
  reverseAcceleration: 0.9,
  braking: 4,
  forwardBraking: 3.8,
  linearDrag: 0.16,
  quadraticDrag: 0.036,
  lateralDamping: 2.9,
  steeringResponse: 9,
  turning: 0.088,
  maxForwardSpeed: 12,
  maxReverseSpeed: 5,
});

function pose(value) {
  if (!value || ![value.x, value.z, value.heading].every(Number.isFinite))
    throw new TypeError('Spawn requires finite x, z and heading.');
  return Object.freeze({ x: value.x, z: value.z, heading: value.heading });
}

/** Planar metres/seconds. Heading zero faces -Z; positive turns right. */
export class BoatSimulation {
  constructor({
    spawn = { x: 0, z: 0, heading: 0 },
    footprint = 1,
    canOccupy = () => true,
    handling = {},
    maxFrameTime = 0.25,
  } = {}) {
    if (!Number.isFinite(footprint) || footprint <= 0)
      throw new RangeError('Footprint must be positive.');
    if (typeof canOccupy !== 'function')
      throw new TypeError('canOccupy must be a function.');
    if (
      !Number.isFinite(maxFrameTime) ||
      maxFrameTime < FIXED_STEP ||
      maxFrameTime > 1
    )
      throw new RangeError('maxFrameTime must be between 1/120 and 1 second.');
    for (const [key, value] of Object.entries(handling))
      if (
        !Object.hasOwn(DEFAULT_HANDLING, key) ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 1000
      )
        throw new RangeError(`Invalid handling option: ${key}`);
    this.handling = Object.freeze({ ...DEFAULT_HANDLING, ...handling });
    this.spawn = pose(spawn);
    this.footprint = footprint;
    this.canOccupy = canOccupy;
    this.maxFrameTime = maxFrameTime;
    this.reset();
  }

  reset(spawn = this.spawn) {
    const next = pose(spawn);
    if (!this.canOccupy(next.x, next.z, this.footprint))
      throw new RangeError('Spawn does not fit the navigable area.');
    this.spawn = next;
    this.x = next.x;
    this.z = next.z;
    this.heading = Math.atan2(Math.sin(next.heading), Math.cos(next.heading));
    this.vx = this.vz = this.speed = this.steer = this.collisions = 0;
    this._remainder = 0;
    this._touching = false;
    this._clearContactTime = 0;
    return this.snapshot();
  }

  step(dt, { throttle = 0, steer = 0 } = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return this.snapshot();
    const duration = this._remainder + Math.min(dt, this.maxFrameTime);
    const ticks = Math.floor((duration + 1e-10) / FIXED_STEP);
    this._remainder = Math.max(0, duration - ticks * FIXED_STEP);
    for (let tick = 0; tick < ticks; tick++)
      this._tick(input(throttle), input(steer));
    return this.snapshot();
  }

  _tick(throttle, rudder) {
    const dt = FIXED_STEP,
      h = this.handling;
    this.steer +=
      (rudder - this.steer) * (1 - Math.exp(-h.steeringResponse * dt));
    const previousForward =
      this.vx * Math.sin(this.heading) - this.vz * Math.cos(this.heading);
    this.heading += this.steer * previousForward * h.turning * dt;
    this.heading = Math.atan2(Math.sin(this.heading), Math.cos(this.heading));
    const fx = Math.sin(this.heading),
      fz = -Math.cos(this.heading);
    let forward = this.vx * fx + this.vz * fz;
    let lateral = this.vx * -fz + this.vz * fx;
    let thrust =
      throttle >= 0
        ? throttle * h.acceleration
        : throttle * h.reverseAcceleration;
    if (throttle < 0 && forward > 0.1) thrust = throttle * h.braking;
    if (throttle > 0 && forward < -0.1) thrust = throttle * h.forwardBraking;
    forward = clamp(
      forward +
        (thrust -
          h.linearDrag * forward -
          h.quadraticDrag * forward * Math.abs(forward)) *
          dt,
      -h.maxReverseSpeed,
      h.maxForwardSpeed,
    );
    lateral = clamp(
      lateral * Math.exp(-h.lateralDamping * dt),
      -h.maxReverseSpeed,
      h.maxForwardSpeed,
    );
    this.vx = fx * forward - fz * lateral;
    this.vz = fz * forward + fx * lateral;
    const hit = this._move(this.vx * dt, this.vz * dt);
    if (hit && !this._touching) this.collisions++;
    if (hit) {
      this._touching = true;
      this._clearContactTime = 0;
    } else if ((this._clearContactTime += dt) > 0.25) this._touching = false;
    this.speed = this.vx * fx + this.vz * fz;
  }

  _move(dx, dz) {
    const distance = Math.hypot(dx, dz);
    // Even extreme tuning has a bounded sweep. Excess travel is discarded.
    const scale =
      distance > SWEEP_SPACING * 128 ? (SWEEP_SPACING * 128) / distance : 1;
    const divisions = Math.max(
      1,
      Math.ceil((distance * scale) / SWEEP_SPACING),
    );
    let stepX = (dx * scale) / divisions,
      stepZ = (dz * scale) / divisions;
    let hit = false;
    const free = (x, z) => this.canOccupy(x, z, this.footprint);
    for (let i = 0; i < divisions; i++) {
      if (free(this.x + stepX, this.z + stepZ)) {
        this.x += stepX;
        this.z += stepZ;
        continue;
      }
      hit = true;
      const freeX = free(this.x + stepX, this.z),
        freeZ = free(this.x, this.z + stepZ);
      if (freeX && (!freeZ || Math.abs(stepX) > Math.abs(stepZ))) {
        this.x += stepX;
        this.vz = 0;
        stepZ = 0;
      } else if (freeZ) {
        this.z += stepZ;
        this.vx = 0;
        stepX = 0;
      } else {
        this.vx = this.vz = 0;
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
      footprint: this.footprint,
      speed: this.speed,
      planarSpeed: Math.hypot(this.vx, this.vz),
      vx: this.vx,
      vz: this.vz,
      steer: this.steer,
      collisions: this.collisions,
    };
  }
}
