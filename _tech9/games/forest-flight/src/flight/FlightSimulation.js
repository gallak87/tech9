import { Euler, Quaternion, Vector3 } from 'three';
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const approach = (n, target, rate, dt) =>
  n + (target - n) * (1 - Math.exp(-rate * dt));
export const AIRCRAFT = Object.freeze({
  trainer: Object.freeze({
    name: 'Cedar T-1',
    role: 'High-wing trainer',
    stall: 18,
    rotate: 23,
    thrust: 6,
    drag: 0.00165,
    rollRate: 0.8,
    pitchRate: 0.4,
    gear: 1.35,
    landingSink: 5,
    color: '#e76b4b',
  }),
  sport: Object.freeze({
    name: 'Swift S-2',
    role: 'Low-wing sport',
    stall: 23,
    rotate: 29,
    thrust: 8.4,
    drag: 0.00145,
    rollRate: 1.3,
    pitchRate: 0.58,
    gear: 1.15,
    landingSink: 4.2,
    color: '#50b4ac',
  }),
});

/** Metres, seconds and radians. Heading zero faces -Z; positive bank turns right. */
export class FlightSimulation {
  constructor({
    type = 'trainer',
    groundHeight = () => 0,
    obstacle = () => null,
    bounds = 2400,
    landmarks = [],
  } = {}) {
    this.groundHeight = groundHeight;
    this.obstacle = obstacle;
    this.bounds = bounds;
    this.landmarks = landmarks;
    this.rotation = new Euler(0, 0, 0, 'YXZ');
    this.attitude = new Quaternion();
    this.increment = new Quaternion();
    this.forward = new Vector3();
    this.up = new Vector3();
    this.axisX = new Vector3(1, 0, 0);
    this.axisY = new Vector3(0, 1, 0);
    this.axisZ = new Vector3(0, 0, 1);
    this.reset(type);
  }
  reset(type = this.state?.type ?? 'trainer') {
    if (!AIRCRAFT[type]) throw new RangeError('Unknown aircraft');
    this.spec = AIRCRAFT[type];
    this.state = {
      type,
      stabilization: this.state?.stabilization ?? true,
      x: 0,
      y: this.spec.gear,
      z: 340,
      heading: 0,
      pitch: 0,
      roll: 0,
      speed: 0,
      verticalSpeed: 0,
      throttle: 0,
      grounded: true,
      phase: 'ready',
      airborneTime: 0,
      time: 0,
      distance: 0,
      visited: [],
      stall: false,
      pitchInput: 0,
      rollInput: 0,
      yawInput: 0,
      landingSink: null,
      reason: '',
      maxAltitude: 0,
    };
    this.paused = false;
    this.touchdown = false;
  }
  setStabilization(enabled) {
    this.state.stabilization = Boolean(enabled);
  }
  start() {
    if (this.state.phase === 'ready') this.state.phase = 'taxi';
  }
  crash(reason) {
    this.state.phase = 'crashed';
    this.state.reason = reason;
    this.state.throttle = 0;
    this.state.pitchInput = this.state.rollInput = this.state.yawInput = 0;
  }
  update(dt, input = {}) {
    if (
      !Number.isFinite(dt) ||
      dt <= 0 ||
      this.paused ||
      ['ready', 'crashed', 'landed'].includes(this.state.phase)
    )
      return;
    // Substeps prevent high-speed contacts passing through terrain after a slow frame.
    let remaining = Math.min(dt, 0.1);
    while (remaining > 1e-8) {
      const step = Math.min(remaining, 1 / 120);
      this.step(step, input);
      remaining -= step;
      if (['crashed', 'landed'].includes(this.state.phase)) break;
    }
  }
  step(dt, input) {
    const s = this.state,
      spec = this.spec;
    const pitch = clamp(input.pitch || 0, -1, 1),
      roll = clamp(input.roll || 0, -1, 1),
      yaw = clamp(input.yaw || 0, -1, 1);
    s.pitchInput = pitch;
    s.rollInput = roll;
    s.yawInput = yaw;
    s.time += dt;
    s.throttle = clamp(
      s.throttle + clamp(input.throttle || 0, -1, 1) * dt * 0.45,
      0,
      1,
    );
    const brake = input.brake && s.grounded ? 7 : 0;
    s.speed = Math.max(
      0,
      s.speed +
        (spec.thrust * s.throttle -
          0.45 -
          spec.drag * s.speed ** 2 -
          brake -
          (s.grounded ? 0.45 : Math.sin(s.pitch) * 3.5)) *
          dt,
    );
    const authority = clamp(s.speed / spec.rotate, 0.12, 1.3);
    if (s.grounded) {
      s.heading += (yaw + roll * 0.7) * 0.6 * clamp(s.speed / 10, 0, 1) * dt;
      s.roll = approach(s.roll, 0, 8, dt);
      s.pitch = approach(
        s.pitch,
        pitch > 0 && s.speed > spec.rotate * 0.75 ? pitch * 0.22 : 0,
        2.5,
        dt,
      );
      s.y = this.groundHeight(s.x, s.z) + spec.gear;
      s.verticalSpeed = 0;
      if (s.speed >= spec.rotate && s.pitch > 0.065 && !input.brake) {
        s.grounded = false;
        s.phase = 'flight';
        s.y += 0.07;
        s.verticalSpeed = 1;
        this.touchdown = false;
      }
    } else {
      s.airborneTime += dt;
      // Rotate about the aircraft's local axes: pitch reverses its world-space
      // effect when inverted, and no Euler-angle clamp blocks a roll or loop.
      this.attitude.setFromEuler(
        this.rotation.set(s.pitch, -s.heading, -s.roll, 'YXZ'),
      );
      this.attitude.multiply(
        this.increment.setFromAxisAngle(
          this.axisX,
          pitch * spec.pitchRate * authority * dt,
        ),
      );
      this.attitude.multiply(
        this.increment.setFromAxisAngle(
          this.axisZ,
          -roll * spec.rollRate * authority * dt,
        ),
      );
      this.attitude.multiply(
        this.increment.setFromAxisAngle(
          this.axisY,
          -yaw * 0.22 * authority * dt,
        ),
      );
      const turn =
        (9.81 * Math.sin(s.roll)) /
        (Math.max(s.speed, 15) * Math.max(0.5, Math.abs(Math.cos(s.roll))));
      this.attitude.premultiply(
        this.increment.setFromAxisAngle(this.axisY, -turn * dt),
      );
      this.rotation.setFromQuaternion(this.attitude.normalize(), 'YXZ');
      s.pitch = this.rotation.x;
      s.heading = -this.rotation.y;
      s.roll = -this.rotation.z;
      if (s.stabilization || input.level) {
        if (!pitch || input.level)
          s.pitch = approach(s.pitch, 0.015, input.level ? 3 : 0.18, dt);
        if (!roll || input.level)
          s.roll = approach(s.roll, 0, input.level ? 4 : 0.25, dt);
      }
      this.attitude.setFromEuler(
        this.rotation.set(s.pitch, -s.heading, -s.roll, 'YXZ'),
      );
      this.forward.set(0, 0, -1).applyQuaternion(this.attitude);
      this.up.set(0, 1, 0).applyQuaternion(this.attitude);
      const sink = Math.max(0, spec.stall + 2 - s.speed) * 1.6;
      s.stall = s.speed < spec.stall;
      s.verticalSpeed = approach(
        s.verticalSpeed,
        this.forward.y * s.speed - 0.7 - sink - (1 - this.up.y) * 4.5,
        2.1,
        dt,
      );
      s.y += s.verticalSpeed * dt;
    }
    const travel = s.speed * Math.cos(s.pitch) * dt;
    s.x += Math.sin(s.heading) * travel;
    s.z -= Math.cos(s.heading) * travel;
    s.distance += Math.abs(travel);
    const ground = this.groundHeight(s.x, s.z);
    s.maxAltitude = Math.max(s.maxAltitude, s.y - ground);
    if (!s.grounded && s.y <= ground + spec.gear) {
      const runway = Math.abs(s.x) < 14 && Math.abs(s.z) < 450;
      const aligned = Math.abs(Math.sin(s.heading)) < 0.32;
      if (
        Math.abs(s.roll) > 0.35 ||
        s.verticalSpeed < -spec.landingSink ||
        s.pitch < -0.18 ||
        s.pitch > 0.38
      ) {
        this.crash(
          'Hard landing. Keep wings level and ease back just above the runway.',
        );
      } else if (!runway || !aligned) {
        this.crash(
          'Off-airfield landing. Follow the runway centerline for a clear touchdown.',
        );
      } else {
        s.landingSink = Math.abs(s.verticalSpeed);
        s.grounded = true;
        s.y = ground + spec.gear;
        s.verticalSpeed = 0;
        s.stall = false;
        s.phase = 'rollout';
        this.touchdown = true;
      }
    }
    if (s.grounded) {
      s.y = ground + spec.gear;
      if (Math.abs(s.x) > 38 && s.speed > 13)
        this.crash(
          'Rough ground. Use a little throttle and gentle steering on the taxiway.',
        );
      if (this.touchdown && s.airborneTime > 6 && s.speed < 2.5) {
        s.phase = 'landed';
        s.throttle = 0;
        s.speed = 0;
      }
    }
    if (s.y > 750 || Math.abs(s.x) > this.bounds || Math.abs(s.z) > this.bounds)
      this.crash(
        'You left the flight valley. Start a fresh circuit from the airstrip.',
      );
    const hit = this.obstacle(s.x, s.y, s.z, 3.2);
    if (hit)
      this.crash(
        `Contact with ${typeof hit === 'string' ? hit : hit.name || 'an obstacle'}. Give the forest and buildings more clearance.`,
      );
    for (const marker of this.landmarks) {
      if (
        !s.visited.includes(marker.id) &&
        Math.hypot(s.x - marker.x, s.y - marker.y, s.z - marker.z) < 150
      )
        s.visited.push(marker.id);
    }
  }
  snapshot() {
    return {
      ...this.state,
      visited: [...this.state.visited],
      paused: this.paused,
    };
  }
}
