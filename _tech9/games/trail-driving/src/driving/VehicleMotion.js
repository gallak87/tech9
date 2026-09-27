const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const approach = (value, target, response, dt) =>
  value + (target - value) * (1 - Math.exp(-response * dt));
const finite = (value, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;

/** Metres, seconds and radians. Geometry mounts at the terrain plane, facing -Z. */
export const VEHICLES = Object.freeze(
  Object.fromEntries(
    Object.entries({
      jeep: {
        name: 'Ridge Jeep',
        summary: 'Planted traction · strong climbs · broad turns',
        topSpeed: 25,
        reverseSpeed: 5.2,
        acceleration: 6.8,
        braking: 12.5,
        dimensions: { wheelBase: 2.8, track: 1.65, width: 1.94, length: 4.2 },
        wheelRadius: 0.43,
        steering: 0.53,
        steeringResponse: 5.3,
        grip: 1.12,
        suspension: 0.27,
        suspensionResponse: 8,
        weightTransfer: 0.009,
      },
      atv: {
        name: 'Scout ATV',
        summary: 'Nimble turns · quick response · lively suspension',
        topSpeed: 28,
        reverseSpeed: 4.5,
        acceleration: 8.1,
        braking: 15,
        dimensions: { wheelBase: 1.55, track: 1.1, width: 1.22, length: 2.3 },
        wheelRadius: 0.31,
        steering: 0.58,
        steeringResponse: 8.5,
        grip: 1,
        suspension: 0.23,
        suspensionResponse: 11,
        weightTransfer: 0.013,
      },
      bike: {
        name: 'Summit Bike',
        summary: 'Light momentum · assisted lean · clean landings',
        topSpeed: 31,
        reverseSpeed: 2.4,
        acceleration: 9.1,
        braking: 16,
        dimensions: { wheelBase: 1.48, track: 0, width: 0.74, length: 2.2 },
        wheelRadius: 0.35,
        steering: 0.48,
        steeringResponse: 6.5,
        grip: 0.95,
        suspension: 0.25,
        suspensionResponse: 12,
        weightTransfer: 0.01,
      },
    }).map(([key, value]) => [
      key,
      Object.freeze({
        ...value,
        id: key,
        dimensions: Object.freeze(value.dimensions),
      }),
    ]),
  ),
);

/** Static world circles are indexed once; query and render placements share data. */
class CollisionIndex {
  constructor(colliders = []) {
    this.cells = new Map();
    for (const item of colliders) {
      if (
        ![item.x, item.z, item.radius].every(Number.isFinite) ||
        item.radius <= 0
      )
        throw new TypeError(
          'Colliders require finite x, z and a positive radius.',
        );
      for (
        let x = Math.floor((item.x - item.radius) / 16);
        x <= Math.floor((item.x + item.radius) / 16);
        x++
      ) {
        for (
          let z = Math.floor((item.z - item.radius) / 16);
          z <= Math.floor((item.z + item.radius) / 16);
          z++
        ) {
          const key = `${x},${z}`;
          if (!this.cells.has(key)) this.cells.set(key, []);
          this.cells.get(key).push(item);
        }
      }
    }
  }

  query(minX, maxX, minZ, maxZ) {
    const found = new Set();
    for (let x = Math.floor(minX / 16); x <= Math.floor(maxX / 16); x++) {
      for (let z = Math.floor(minZ / 16); z <= Math.floor(maxZ / 16); z++) {
        for (const collider of this.cells.get(`${x},${z}`) ?? [])
          found.add(collider);
      }
    }
    return found;
  }
}

function distanceToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax,
    dz = bz - az;
  const t = clamp(
    ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1),
    0,
    1,
  );
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

/**
 * Forgiving arcade motion: a traction-limited bicycle model, sampled wheel
 * support, ballistic jumps and a conservative swept footprint. No render owner.
 * world.height/surface are pure queries; world.colliders remain static per instance.
 */
export class VehicleMotion {
  constructor({ vehicle = 'jeep', world, spawn = { x: 0, z: 0, heading: 0 } }) {
    if (!VEHICLES[vehicle]) throw new TypeError(`Unknown vehicle: ${vehicle}`);
    if (typeof world?.height !== 'function')
      throw new TypeError('world.height must be a function.');
    const bounds = world.bounds;
    if (
      !bounds ||
      !['minX', 'maxX', 'minZ', 'maxZ'].every((key) =>
        Number.isFinite(bounds[key]),
      ) ||
      bounds.minX >= bounds.maxX ||
      bounds.minZ >= bounds.maxZ
    )
      throw new TypeError('world.bounds must be a finite nonempty rectangle.');
    this.vehicle = vehicle;
    this.config = VEHICLES[vehicle];
    this.world = world;
    this.index = new CollisionIndex(world.colliders);
    const { width, length, wheelBase, track } = this.config.dimensions;
    // Each of five discs encloses a full rectangular slice of the chassis.
    this.footprintRadius = Math.hypot(width / 2, length / 10) + 0.025;
    this.footprintOffsets = Array.from(
      { length: 5 },
      (_, i) => -length / 2 + (length * (i + 0.5)) / 5,
    );
    this.wheelOffsets =
      vehicle === 'bike'
        ? [
            [0, wheelBase / 2],
            [0, -wheelBase / 2],
          ]
        : [
            [-track / 2, wheelBase / 2],
            [track / 2, wheelBase / 2],
            [-track / 2, -wheelBase / 2],
            [track / 2, -wheelBase / 2],
          ];
    this.safeHistory = [];
    this.reset(spawn);
  }

  point(x, z, heading, right, forward) {
    return {
      x: x + Math.cos(heading) * right + Math.sin(heading) * forward,
      z: z + Math.sin(heading) * right - Math.cos(heading) * forward,
    };
  }

  height(x, z) {
    const value = this.world.height(x, z);
    if (!Number.isFinite(value))
      throw new TypeError('Terrain height must be finite.');
    return value;
  }

  support(x, z, heading) {
    const wheels = this.wheelOffsets.map(([right, forward]) => {
      const p = this.point(x, z, heading, right, forward);
      return { ...p, ground: this.height(p.x, p.z), right, forward };
    });
    const front = wheels.slice(0, wheels.length / 2),
      rear = wheels.slice(wheels.length / 2);
    const mean = (items) =>
      items.reduce((sum, item) => sum + item.ground, 0) / items.length;
    const y = mean(wheels);
    const pitch = Math.atan2(
      mean(front) - mean(rear),
      this.config.dimensions.wheelBase,
    );
    let roll;
    if (this.vehicle === 'bike') {
      const a = this.point(x, z, heading, -0.4, 0),
        b = this.point(x, z, heading, 0.4, 0);
      roll = Math.atan2(this.height(b.x, b.z) - this.height(a.x, a.z), 0.8);
    } else {
      roll = Math.atan2(
        (wheels[1].ground +
          wheels[3].ground -
          wheels[0].ground -
          wheels[2].ground) /
          2,
        this.config.dimensions.track,
      );
    }
    return { y, pitch, roll, wheels };
  }

  collisionBetween(from, to) {
    const r = this.footprintRadius,
      { bounds } = this.world;
    // Rotation between tiny simulation steps is enclosed by padding the chord.
    const turnPad =
      this.config.dimensions.length *
      (1 - Math.cos((to.heading - from.heading) / 2));
    for (const forward of this.footprintOffsets) {
      const a = this.point(from.x, from.z, from.heading, 0, forward);
      const b = this.point(to.x, to.z, to.heading, 0, forward);
      const radius = r + turnPad;
      if (
        b.x - radius < bounds.minX ||
        b.x + radius > bounds.maxX ||
        b.z - radius < bounds.minZ ||
        b.z + radius > bounds.maxZ
      )
        return true;
      const nearby = this.index.query(
        Math.min(a.x, b.x) - radius,
        Math.max(a.x, b.x) + radius,
        Math.min(a.z, b.z) - radius,
        Math.max(a.z, b.z) + radius,
      );
      for (const item of nearby) {
        if (
          distanceToSegment(item.x, item.z, a.x, a.z, b.x, b.z) <
          item.radius + radius
        )
          return true;
      }
    }
    return false;
  }

  validPose(pose) {
    if (
      ![pose.x, pose.z, pose.heading].every(Number.isFinite) ||
      this.collisionBetween(pose, pose)
    )
      return false;
    const ground = this.support(pose.x, pose.z, pose.heading);
    return Math.abs(ground.pitch) < 0.68 && Math.abs(ground.roll) < 0.6;
  }

  findGroundedPose(requested) {
    if (this.validPose(requested)) return { ...requested };
    // Recovery/spawn is deterministic and searches locally before falling back.
    for (let radius = 1; radius <= 30; radius++) {
      for (let i = 0; i < 24; i++) {
        const angle = (i * Math.PI) / 12;
        const pose = {
          x: requested.x + Math.cos(angle) * radius,
          z: requested.z + Math.sin(angle) * radius,
          heading: requested.heading,
        };
        if (this.validPose(pose)) return pose;
      }
    }
    throw new RangeError(
      'No valid grounded vehicle pose within 30 metres of spawn.',
    );
  }

  reset(spawn = this.spawn) {
    const requested = {
      x: finite(spawn.x),
      z: finite(spawn.z),
      heading: finite(spawn.heading),
    };
    const pose = this.findGroundedPose(requested);
    this.spawn = { ...pose };
    this.safeHistory = [{ ...pose }];
    this.safeTime = 0;
    this.elapsed = 0;
    this.ground = this.support(pose.x, pose.z, pose.heading);
    this.state = {
      ...pose,
      y: this.ground.y,
      speed: 0,
      steer: 0,
      pitch: this.ground.pitch,
      roll: this.ground.roll,
      lean: 0,
      airborne: false,
      verticalSpeed: 0,
      wheelSpin: 0,
      throttle: 0,
      brake: 0,
      collision: false,
      landing: 0,
      slip: 0,
      distance: 0,
      acceleration: 0,
    };
    this.state.surface = this.surfaceAt(pose.x, pose.z);
    this.refreshContacts();
    return this.snapshot();
  }

  surfaceAt(x, z) {
    const surface = this.world.surface?.(x, z) ?? {};
    return {
      kind: surface.kind ?? 'trail',
      grip: clamp(finite(surface.grip, 1), 0.15, 1.5),
      roughness: clamp(finite(surface.roughness), 0, 1),
    };
  }

  update(dt, input = {}) {
    const time = clamp(finite(dt), 0, 0.1);
    this.state.collision = false;
    this.state.landing = 0;
    const count = Math.max(1, Math.ceil(time / (1 / 120)));
    const control = {
      throttle: clamp(finite(input.throttle), -1, 1),
      steer: clamp(finite(input.steer), -1, 1),
      brake: clamp(finite(Number(input.brake)), 0, 1),
    };
    for (let i = 0; i < count && time > 0; i++)
      this.step(time / count, control);
    this.refreshContacts();
    return this.snapshot();
  }

  step(dt, input) {
    const s = this.state,
      c = this.config;
    this.elapsed += dt;
    s.throttle = input.throttle;
    s.surface = this.surfaceAt(s.x, s.z);
    const grip = s.surface.grip * c.grip;
    const previousSpeed = s.speed;
    const reversing = input.throttle * s.speed < -0.2;
    s.brake = Math.max(input.brake, reversing ? Math.abs(input.throttle) : 0);
    const drive = s.airborne
      ? 0
      : reversing
        ? input.throttle * c.braking
        : input.throttle * c.acceleration * Math.min(grip, 1.1);
    const slope = s.airborne ? 0 : -Math.sin(this.ground.pitch) * 5.5;
    const drag =
      (0.43 +
        Math.abs(s.speed) * 0.023 +
        s.speed * s.speed * 0.0055 +
        s.surface.roughness * 1.25) *
      Math.sign(s.speed);
    s.speed += (drive + slope - (s.airborne ? 0.06 * s.speed : drag)) * dt;
    if (input.brake > 0) {
      const braking = c.braking * input.brake * dt;
      s.speed = Math.sign(s.speed) * Math.max(0, Math.abs(s.speed) - braking);
    }
    if (!input.throttle && Math.abs(s.speed) < 0.08) s.speed = 0;
    s.speed = clamp(
      s.speed,
      -c.reverseSpeed,
      c.topSpeed * (1 - 0.12 * s.surface.roughness),
    );
    // Steering lock reduces with speed; grip limits actual lateral acceleration.
    const steeringLimit = c.steering / (1 + Math.abs(s.speed) * 0.038);
    s.steer = approach(
      s.steer,
      input.steer * steeringLimit,
      c.steeringResponse,
      dt,
    );
    const requestedYaw = (Math.tan(s.steer) * s.speed) / c.dimensions.wheelBase;
    const maxYaw = (6.8 * grip + 2) / Math.max(2.5, Math.abs(s.speed));
    const yawRate = s.airborne
      ? requestedYaw * 0.06
      : clamp(requestedYaw, -maxYaw, maxYaw);
    s.slip = Math.max(0, Math.abs(requestedYaw) - maxYaw) / 2;
    const nextHeading = s.heading + yawRate * dt;
    const next = {
      x: s.x + Math.sin(nextHeading) * s.speed * dt,
      z: s.z - Math.cos(nextHeading) * s.speed * dt,
      heading: nextHeading,
    };
    const oldPose = { x: s.x, z: s.z, heading: s.heading };
    if (this.collisionBetween(oldPose, next)) {
      s.collision = true;
      // Preserve tangential progress on a glancing impact, never penetrate a proxy.
      const slideX = { x: next.x, z: s.z, heading: s.heading };
      const slideZ = { x: s.x, z: next.z, heading: s.heading };
      if (!this.collisionBetween(oldPose, slideX)) s.x = slideX.x;
      else if (!this.collisionBetween(oldPose, slideZ)) s.z = slideZ.z;
      s.speed *= Math.exp(-22 * dt);
      if (Math.abs(s.speed) < 0.7) s.speed = 0;
    } else Object.assign(s, next);
    const travelled = Math.hypot(s.x - oldPose.x, s.z - oldPose.z);
    s.distance += travelled;
    s.wheelSpin += (travelled * Math.sign(s.speed)) / c.wheelRadius;
    s.acceleration = (s.speed - previousSpeed) / dt;
    const ground = this.support(s.x, s.z, s.heading);
    const terrainVelocity = (ground.y - this.ground.y) / dt;
    const gravity = 16;
    const ballisticY = s.y + s.verticalSpeed * dt - (gravity * dt * dt) / 2;
    if (
      !s.airborne &&
      Math.abs(s.speed) > 5 &&
      ((s.verticalSpeed > 0.7 &&
        ballisticY > ground.y + gravity * dt * dt * 0.4) ||
        ground.y < s.y - 0.15)
    )
      s.airborne = true;
    if (s.airborne) {
      s.y = ballisticY;
      s.verticalSpeed -= gravity * dt;
      if (s.y <= ground.y) {
        s.landing = Math.max(
          s.landing,
          Math.abs(s.verticalSpeed - terrainVelocity),
        );
        s.airborne = false;
        s.y = ground.y;
        s.verticalSpeed = terrainVelocity;
        s.speed *= 1 - clamp(s.landing * 0.012, 0, 0.28);
      }
    } else {
      s.y = ground.y;
      s.verticalSpeed = terrainVelocity;
    }
    const lateral = yawRate * s.speed;
    const transfer = clamp(s.acceleration * c.weightTransfer, -0.11, 0.09);
    s.pitch = approach(
      s.pitch,
      s.airborne ? s.pitch * 0.98 : ground.pitch + transfer,
      c.suspensionResponse,
      dt,
    );
    s.roll = approach(
      s.roll,
      s.airborne
        ? 0
        : ground.roll + (this.vehicle === 'bike' ? 0 : lateral * 0.012),
      c.suspensionResponse,
      dt,
    );
    // Assisted balance recentres while stationary and cannot accumulate a fall.
    const leanTarget =
      this.vehicle === 'bike'
        ? -clamp(Math.atan2(lateral, 12) * 0.85, -0.48, 0.48) *
          (s.airborne ? 0.35 : 1)
        : 0;
    s.lean = approach(s.lean, leanTarget, 7, dt);
    this.ground = ground;
    this.safeTime += dt;
    if (
      this.safeTime >= 0.5 &&
      !s.airborne &&
      !s.collision &&
      Math.abs(ground.pitch) < 0.52 &&
      Math.abs(ground.roll) < 0.42 &&
      this.validPose(s)
    ) {
      this.safeTime = 0;
      this.safeHistory.push({ x: s.x, z: s.z, heading: s.heading });
      if (this.safeHistory.length > 18) this.safeHistory.shift();
    }
  }

  refreshContacts() {
    const s = this.state,
      c = this.config;
    s.contacts = this.ground.wheels.map((wheel) => {
      const nominal =
        s.y +
        c.wheelRadius +
        Math.sin(s.pitch) * wheel.forward +
        Math.sin(s.roll) * wheel.right;
      const compression = clamp(
        wheel.ground + c.wheelRadius - nominal,
        -c.suspension,
        c.suspension,
      );
      const grounded =
        !s.airborne || wheel.ground + c.wheelRadius >= nominal - c.suspension;
      return {
        x: wheel.x,
        y: grounded ? wheel.ground + c.wheelRadius : nominal - c.suspension,
        z: wheel.z,
        compression: grounded ? compression : -c.suspension,
        grounded,
      };
    });
  }

  recover() {
    // Two samples back avoids dropping immediately against the same obstruction.
    const candidates = this.safeHistory
      .slice(0, Math.max(1, this.safeHistory.length - 2))
      .reverse();
    const pose =
      candidates.find((candidate) => this.validPose(candidate)) ??
      this.findGroundedPose(this.spawn);
    const poseIndex = this.safeHistory.indexOf(pose);
    const history =
      poseIndex >= 0 ? this.safeHistory.slice(0, poseIndex + 1) : [{ ...pose }];
    const spawn = this.spawn;
    const distance = this.state.distance;
    this.reset(pose);
    this.spawn = spawn;
    this.safeHistory = history;
    this.state.distance = distance;
    return this.snapshot();
  }

  snapshot() {
    return Object.freeze({
      ...this.state,
      vehicle: this.vehicle,
      contacts: Object.freeze(
        this.state.contacts.map((contact) => Object.freeze({ ...contact })),
      ),
      surface: Object.freeze({ ...this.state.surface }),
    });
  }
}
