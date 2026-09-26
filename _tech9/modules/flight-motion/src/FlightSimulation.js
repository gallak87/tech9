const FIXED_STEP = 1 / 120;
const SWEEP_SPACING = 0.5;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const axis = (value) => (Number.isFinite(value) ? clamp(value, -1, 1) : 0);
const approach = (value, target, rate, dt) =>
  value + (target - value) * (1 - Math.exp(-rate * dt));
const heading = (value) => Math.atan2(Math.sin(value), Math.cos(value));

export const FLIGHT_PROFILES = Object.freeze({
  trainer: Object.freeze({
    stallSpeed: 18,
    takeoffSpeed: 23,
    acceleration: 6,
    drag: 0.00165,
    rollRate: 0.8,
    pitchRate: 0.4,
    groundClearance: 1.35,
  }),
  sport: Object.freeze({
    stallSpeed: 23,
    takeoffSpeed: 29,
    acceleration: 8.4,
    drag: 0.00145,
    rollRate: 1.3,
    pitchRate: 0.58,
    groundClearance: 1.15,
  }),
});

function spawnPose(value) {
  if (!value || ![value.x, value.z, value.heading].every(Number.isFinite))
    throw new TypeError('Spawn requires finite x, z and heading.');
  const pose = {
    x: value.x,
    z: value.z,
    heading: heading(value.heading),
    pitch: value.pitch ?? 0,
    roll: value.roll ?? 0,
    speed: value.speed ?? 0,
    verticalSpeed: value.verticalSpeed ?? 0,
    throttle: value.throttle ?? 0,
  };
  if (value.y !== undefined) {
    if (!Number.isFinite(value.y))
      throw new TypeError('Spawn altitude must be finite.');
    pose.y = value.y;
  }
  for (const [key, min, max] of [
    ['pitch', -0.6, 0.65],
    ['roll', -1.05, 1.05],
    ['speed', 0, 1000],
    ['verticalSpeed', -1000, 1000],
    ['throttle', 0, 1],
  ]) {
    if (!Number.isFinite(pose[key]) || pose[key] < min || pose[key] > max)
      throw new RangeError(`Invalid spawn ${key}.`);
  }
  return Object.freeze(pose);
}

/** Arcade flight in metres, seconds and radians; heading zero faces -Z. */
export class FlightSimulation {
  constructor({
    profile = 'trainer',
    handling = {},
    spawn = { x: 0, z: 0, heading: 0 },
    groundHeight = () => 0,
    obstacle = () => null,
    footprint = 3.2,
    maxFrameTime = 0.1,
  } = {}) {
    if (!Object.hasOwn(FLIGHT_PROFILES, profile))
      throw new RangeError('Unknown flight profile.');
    if (typeof groundHeight !== 'function' || typeof obstacle !== 'function')
      throw new TypeError('Ground and obstacle queries must be functions.');
    if (!Number.isFinite(footprint) || footprint <= 0 || footprint > 1000)
      throw new RangeError('Footprint must be positive and at most 1000.');
    if (
      !Number.isFinite(maxFrameTime) ||
      maxFrameTime < FIXED_STEP ||
      maxFrameTime > 1
    )
      throw new RangeError('maxFrameTime must be between 1/120 and 1 second.');
    for (const [key, value] of Object.entries(handling)) {
      const positive = [
        'stallSpeed',
        'takeoffSpeed',
        'groundClearance',
      ].includes(key);
      if (
        !Object.hasOwn(FLIGHT_PROFILES.trainer, key) ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 1000 ||
        (positive && value === 0)
      )
        throw new RangeError(`Invalid handling option: ${key}`);
    }
    this.handling = Object.freeze({ ...FLIGHT_PROFILES[profile], ...handling });
    if (this.handling.takeoffSpeed < this.handling.stallSpeed)
      throw new RangeError('Takeoff speed must be at least stall speed.');
    this.groundHeight = groundHeight;
    this.obstacle = obstacle;
    this.footprint = footprint;
    this.maxFrameTime = maxFrameTime;
    this.reset(spawn);
  }

  _ground(x, z) {
    const height = this.groundHeight(x, z);
    if (!Number.isFinite(height))
      throw new TypeError('Ground query must return a finite height.');
    return height;
  }

  reset(spawn = this._spawn) {
    const next = spawnPose(spawn);
    const floor = this._ground(next.x, next.z) + this.handling.groundClearance;
    const y = next.y ?? floor;
    if (y < floor) throw new RangeError('Spawn is below ground clearance.');
    if (this.obstacle(next.x, y, next.z, this.footprint))
      throw new RangeError('Spawn intersects an obstacle.');
    const grounded = y <= floor + 1e-8;
    this._spawn = next;
    this._state = {
      x: next.x,
      y,
      z: next.z,
      heading: next.heading,
      pitch: next.pitch,
      roll: next.roll,
      speed: next.speed,
      verticalSpeed: grounded ? 0 : next.verticalSpeed,
      throttle: next.throttle,
      grounded,
      stall: !grounded && next.speed < this.handling.stallSpeed,
      pitchInput: 0,
      rollInput: 0,
      yawInput: 0,
    };
    this._remainder = 0;
    this._contact = null;
    return this.snapshot();
  }

  step(dt, input = {}) {
    this._contact = null;
    if (!Number.isFinite(dt) || dt <= 0) return this.snapshot();
    const duration = this._remainder + Math.min(dt, this.maxFrameTime);
    const ticks = Math.floor((duration + 1e-10) / FIXED_STEP);
    this._remainder = Math.max(0, duration - ticks * FIXED_STEP);
    const controls = {
      pitch: axis(input.pitch),
      roll: axis(input.roll),
      yaw: axis(input.yaw),
      throttle: axis(input.throttle),
      brake: !!input.brake,
      level: !!input.level,
    };
    for (let tick = 0; tick < ticks; tick++) {
      this._tick(controls);
      if (this._contact) {
        this._remainder = 0;
        break;
      }
    }
    return this.snapshot();
  }

  _tick(input) {
    const dt = FIXED_STEP,
      h = this.handling,
      previous = this._state;
    const next = {
      ...previous,
      pitchInput: input.pitch,
      rollInput: input.roll,
      yawInput: input.yaw,
    };
    next.throttle = clamp(next.throttle + input.throttle * dt * 0.45, 0, 1);
    const brake = input.brake && next.grounded ? 7 : 0;
    next.speed = Math.max(
      0,
      next.speed +
        (h.acceleration * next.throttle -
          0.45 -
          h.drag * next.speed ** 2 -
          brake -
          (next.grounded ? 0.45 : Math.sin(next.pitch) * 3.5)) *
          dt,
    );
    const authority = clamp(next.speed / h.takeoffSpeed, 0.12, 1.3);
    if (next.grounded) {
      next.heading +=
        (input.yaw + input.roll * 0.7) *
        0.6 *
        clamp(next.speed / 10, 0, 1) *
        dt;
      next.roll = approach(next.roll, 0, 8, dt);
      next.pitch = approach(
        next.pitch,
        input.pitch > 0 && next.speed > h.takeoffSpeed * 0.75
          ? input.pitch * 0.22
          : 0,
        2.5,
        dt,
      );
      next.verticalSpeed = 0;
      next.stall = false;
      if (next.speed >= h.takeoffSpeed && next.pitch > 0.065 && !input.brake) {
        next.grounded = false;
        next.y += 0.07;
        next.verticalSpeed = 1;
      }
    } else {
      next.pitch = clamp(
        next.pitch + input.pitch * h.pitchRate * authority * dt,
        -0.6,
        0.65,
      );
      next.roll = clamp(
        next.roll + input.roll * h.rollRate * authority * dt,
        -1.05,
        1.05,
      );
      if (!input.pitch)
        next.pitch = approach(next.pitch, 0.015, input.level ? 3 : 0.18, dt);
      if (!input.roll)
        next.roll = approach(next.roll, 0, input.level ? 4 : 0.25, dt);
      next.heading +=
        ((9.81 * Math.tan(next.roll)) / Math.max(next.speed, 15) +
          input.yaw * 0.22 * authority) *
        dt;
      const sink = Math.max(0, h.stallSpeed + 2 - next.speed) * 1.6;
      next.stall = next.speed < h.stallSpeed;
      next.verticalSpeed = approach(
        next.verticalSpeed,
        Math.sin(next.pitch) * next.speed -
          0.7 -
          sink -
          Math.abs(next.roll) * 1.2,
        2.1,
        dt,
      );
      next.y += next.verticalSpeed * dt;
    }
    next.heading = heading(next.heading);
    const travel = next.speed * Math.cos(next.pitch) * dt;
    next.x += Math.sin(next.heading) * travel;
    next.z -= Math.cos(next.heading) * travel;
    this._move(previous, next);
  }

  _move(previous, next) {
    let dx = next.x - previous.x,
      dy = next.y - previous.y,
      dz = next.z - previous.z;
    const distance = Math.hypot(dx, dy, dz);
    const fraction =
      distance > SWEEP_SPACING * 128 ? (SWEEP_SPACING * 128) / distance : 1;
    dx *= fraction;
    dy *= fraction;
    dz *= fraction;
    const divisions = Math.max(
      1,
      Math.ceil((distance * fraction) / SWEEP_SPACING),
    );
    let lastX = previous.x,
      lastY = previous.y,
      lastZ = previous.z;
    for (let segment = 1; segment <= divisions; segment++) {
      const alpha = segment / divisions;
      const x = previous.x + dx * alpha,
        z = previous.z + dz * alpha;
      const floor = this._ground(x, z) + this.handling.groundClearance;
      const y = next.grounded ? floor : previous.y + dy * alpha;
      const hit = this.obstacle(x, Math.max(y, floor), z, this.footprint);
      if (hit) {
        // Capture an owned observation before stopping at the last clear pose.
        const obstacle = structuredClone(hit);
        this._contact = {
          kind: 'obstacle',
          x,
          y,
          z,
          heading: next.heading,
          pitch: next.pitch,
          roll: next.roll,
          speed: next.speed,
          verticalSpeed: next.verticalSpeed,
          obstacle,
        };
        this._state = {
          ...next,
          x: lastX,
          y: lastY,
          z: lastZ,
          speed: 0,
          verticalSpeed: 0,
          stall: !next.grounded,
        };
        return;
      }
      if (!next.grounded && y <= floor) {
        this._contact = {
          kind: 'ground',
          x,
          y: floor,
          z,
          heading: next.heading,
          pitch: next.pitch,
          roll: next.roll,
          speed: next.speed,
          verticalSpeed: next.verticalSpeed,
        };
        this._state = {
          ...next,
          x,
          y: floor,
          z,
          verticalSpeed: 0,
          grounded: true,
          stall: false,
        };
        return;
      }
      lastX = x;
      lastY = y;
      lastZ = z;
    }
    this._state = { ...next, x: lastX, y: lastY, z: lastZ };
  }

  snapshot() {
    return {
      ...this._state,
      contact: this._contact ? structuredClone(this._contact) : null,
    };
  }
}
