import { VEHICLE_PRESETS } from './VehiclePresets.js';
export { VEHICLE_PRESETS } from './VehiclePresets.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const approach = (value, target, response, dt) =>
  value + (target - value) * (1 - Math.exp(-response * dt));
const finite = (value, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;

const MAX_COORDINATE = 1_000_000;
const finiteCoordinate = (value) =>
  Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
const poseIsFinite = (pose) =>
  pose &&
  finiteCoordinate(pose.x) &&
  finiteCoordinate(pose.z) &&
  Number.isFinite(pose.heading);
const normalizeHeading = (heading) =>
  Math.atan2(Math.sin(heading), Math.cos(heading));

function range(value, name, low, high) {
  if (!Number.isFinite(value) || value < low || value > high)
    throw new RangeError(`${name} must be finite in [${low}, ${high}].`);
  return value;
}

/** Copy only the supported fields; caller objects never become live configuration. */
function ownedConfig(config) {
  if (!config || !['four-wheel', 'two-wheel'].includes(config.layout))
    throw new TypeError('config.layout must be four-wheel or two-wheel.');
  const limits = {
    topSpeed: [0.1, 150],
    reverseSpeed: [0.1, 30],
    acceleration: [0.1, 100],
    braking: [0.1, 100],
    wheelRadius: [0.02, 5],
    steering: [0.01, 1.2],
    steeringResponse: [0.1, 100],
    grip: [0.1, 3],
    suspension: [0, 3],
    suspensionResponse: [0.1, 100],
    weightTransfer: [0, 0.2],
  };
  const copy = { layout: config.layout };
  for (const [name, [low, high]] of Object.entries(limits))
    copy[name] = range(config[name], `config.${name}`, low, high);
  const d = config.dimensions ?? {};
  copy.dimensions = Object.freeze({
    wheelBase: range(d.wheelBase, 'dimensions.wheelBase', 0.1, 20),
    track: range(
      d.track,
      'dimensions.track',
      config.layout === 'two-wheel' ? 0 : 0.1,
      15,
    ),
    width: range(d.width, 'dimensions.width', 0.1, 15),
    length: range(d.length, 'dimensions.length', 0.1, 30),
  });
  if (
    d.wheelBase > d.length ||
    d.track > d.width ||
    (config.layout === 'two-wheel' && d.track !== 0)
  )
    throw new RangeError(
      'Wheelbase/track must fit the chassis; two-wheel track must be zero.',
    );
  return Object.freeze(copy);
}

function ownedColliders(colliders) {
  if (!Array.isArray(colliders) || colliders.length > 10000)
    throw new TypeError(
      'Obstacles must be an array of at most 10,000 circles.',
    );
  return Object.freeze(
    colliders.map((item) => {
      if (
        !item ||
        !finiteCoordinate(item.x) ||
        !finiteCoordinate(item.z) ||
        !Number.isFinite(item.radius) ||
        item.radius <= 0 ||
        item.radius > 256
      )
        throw new TypeError(
          'Colliders require coordinates within ±1,000,000 and radius in (0,256].',
        );
      return Object.freeze({ x: item.x, z: item.z, radius: item.radius });
    }),
  );
}

function ownedWorld(world) {
  if (typeof world?.height !== 'function')
    throw new TypeError('world.height must be a function.');
  for (const name of ['surface', 'queryObstacles'])
    if (world[name] !== undefined && typeof world[name] !== 'function')
      throw new TypeError(`world.${name} must be a function when supplied.`);
  const bounds = Object.fromEntries(
    ['minX', 'maxX', 'minZ', 'maxZ'].map((key) => [key, world.bounds?.[key]]),
  );
  if (
    !Object.values(bounds).every(finiteCoordinate) ||
    bounds.minX >= bounds.maxX ||
    bounds.minZ >= bounds.maxZ
  )
    throw new TypeError(
      'world.bounds must be a finite nonempty rectangle within ±1,000,000 metres.',
    );
  return Object.freeze({
    height: world.height.bind(world),
    surface: world.surface?.bind(world),
    queryObstacles: world.queryObstacles?.bind(world),
    bounds: Object.freeze(bounds),
    colliders: ownedColliders(world.colliders ?? []),
  });
}

/** Static circles are copied once. Limits keep both indexing and queries bounded. */
class CollisionIndex {
  constructor(colliders) {
    this.cells = new Map();
    this.colliders = colliders;
    let references = 0;
    for (const item of colliders) {
      const minX = Math.floor((item.x - item.radius) / 16);
      const maxX = Math.floor((item.x + item.radius) / 16);
      const minZ = Math.floor((item.z - item.radius) / 16);
      const maxZ = Math.floor((item.z + item.radius) / 16);
      references += (maxX - minX + 1) * (maxZ - minZ + 1);
      if (references > 100000)
        throw new RangeError(
          'Collider index exceeds 100,000 cell references; use fewer/smaller circles.',
        );
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          const key = `${x},${z}`;
          if (!this.cells.has(key)) this.cells.set(key, []);
          this.cells.get(key).push(item);
        }
      }
    }
  }

  query(minX, maxX, minZ, maxZ) {
    const x0 = Math.floor(minX / 16),
      x1 = Math.floor(maxX / 16);
    const z0 = Math.floor(minZ / 16),
      z1 = Math.floor(maxZ / 16);
    // Public long sweeps can span the entire world; scan the bounded collider
    // array instead of iterating millions of empty cells.
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 4096) return this.colliders;
    const found = new Set();
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
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
 * World callbacks are synchronous queries; colliders remain static per instance.
 */
export class VehicleMotion {
  #index;
  #footprintRadius;
  #footprintOffsets;
  #wheelOffsets;
  #safeHistory;
  #spawn;
  #safeTime;
  #ground;
  #state;
  constructor({
    config = VEHICLE_PRESETS.jeep,
    world,
    spawn = { x: 0, z: 0, heading: 0 },
  } = {}) {
    Object.defineProperties(this, {
      config: { value: ownedConfig(config), enumerable: true },
      world: { value: ownedWorld(world), enumerable: true },
    });
    this.#index = new CollisionIndex(this.world.colliders);
    const { width, length, wheelBase, track } = this.config.dimensions;
    // Each of five discs encloses a full rectangular slice of the chassis.
    this.#footprintRadius = Math.hypot(width / 2, length / 10) + 0.025;
    this.#footprintOffsets = Array.from(
      { length: 5 },
      (_, i) => -length / 2 + (length * (i + 0.5)) / 5,
    );
    this.#wheelOffsets =
      this.config.layout === 'two-wheel'
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
    this.#safeHistory = [];
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
    if (!finiteCoordinate(value))
      throw new TypeError(
        'Terrain height must be finite within ±1,000,000 metres.',
      );
    return value;
  }

  support(x, z, heading) {
    const wheels = this.#wheelOffsets.map(([right, forward]) => {
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
    if (this.config.layout === 'two-wheel') {
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
    if (!poseIsFinite(from) || !poseIsFinite(to)) return true;
    const r = this.#footprintRadius,
      { bounds } = this.world;
    // Rotation between tiny simulation steps is enclosed by padding the chord.
    const turnPad =
      this.config.dimensions.length *
      (1 -
        Math.cos(
          normalizeHeading(
            normalizeHeading(to.heading) - normalizeHeading(from.heading),
          ) / 2,
        ));
    for (const forward of this.#footprintOffsets) {
      const a = this.point(from.x, from.z, from.heading, 0, forward);
      const b = this.point(to.x, to.z, to.heading, 0, forward);
      const radius = r + turnPad;
      if (
        a.x - radius < bounds.minX ||
        a.x + radius > bounds.maxX ||
        a.z - radius < bounds.minZ ||
        a.z + radius > bounds.maxZ ||
        b.x - radius < bounds.minX ||
        b.x + radius > bounds.maxX ||
        b.z - radius < bounds.minZ ||
        b.z + radius > bounds.maxZ
      )
        return true;
      const area = {
        minX: Math.min(a.x, b.x) - radius,
        maxX: Math.max(a.x, b.x) + radius,
        minZ: Math.min(a.z, b.z) - radius,
        maxZ: Math.max(a.z, b.z) + radius,
      };
      const nearby = [
        ...this.#index.query(area.minX, area.maxX, area.minZ, area.maxZ),
      ];
      if (this.world.queryObstacles)
        nearby.push(
          ...ownedColliders(this.world.queryObstacles(Object.freeze(area))),
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
    if (!poseIsFinite(pose) || this.collisionBetween(pose, pose)) return false;
    const ground = this.support(pose.x, pose.z, pose.heading);
    return Math.abs(ground.pitch) < 0.68 && Math.abs(ground.roll) < 0.6;
  }

  findGroundedPose(requested) {
    if (!poseIsFinite(requested))
      throw new TypeError(
        'Spawn requires finite x/z within ±1,000,000 metres and a finite heading.',
      );
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

  reset(spawn = this.#spawn) {
    if (!poseIsFinite(spawn))
      throw new TypeError(
        'Spawn requires finite x/z within ±1,000,000 metres and a finite heading.',
      );
    const requested = {
      x: spawn.x,
      z: spawn.z,
      heading: normalizeHeading(spawn.heading),
    };
    const pose = this.findGroundedPose(requested);
    this.#spawn = { ...pose };
    this.#safeHistory = [{ ...pose }];
    this.#safeTime = 0;
    this.#ground = this.support(pose.x, pose.z, pose.heading);
    this.#state = {
      ...pose,
      y: this.#ground.y,
      speed: 0,
      steer: 0,
      pitch: this.#ground.pitch,
      roll: this.#ground.roll,
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
    this.#state.surface = this.surfaceAt(pose.x, pose.z);
    this.#refreshContacts();
    return this.snapshot();
  }

  surfaceAt(x, z) {
    const surface = this.world.surface?.(x, z) ?? {};
    return {
      kind: typeof surface.kind === 'string' ? surface.kind : 'ground',
      grip: clamp(finite(surface.grip, 1), 0.15, 1.5),
      roughness: clamp(finite(surface.roughness), 0, 1),
    };
  }

  update(dt, input = {}) {
    const time = clamp(finite(dt), 0, 0.1);
    this.#state.collision = false;
    this.#state.landing = 0;
    const count = Math.max(1, Math.ceil(time / (1 / 120)));
    const control = {
      throttle: clamp(finite(input.throttle), -1, 1),
      steer: clamp(finite(input.steer), -1, 1),
      brake: clamp(finite(Number(input.brake)), 0, 1),
    };
    for (let i = 0; i < count && time > 0; i++)
      this.#step(time / count, control);
    this.#refreshContacts();
    return this.snapshot();
  }

  #step(dt, input) {
    const s = this.#state,
      c = this.config;
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
    const slope = s.airborne ? 0 : -Math.sin(this.#ground.pitch) * 5.5;
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
    const nextHeading = normalizeHeading(s.heading + yawRate * dt);
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
    const terrainVelocity = (ground.y - this.#ground.y) / dt;
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
        : ground.roll +
            (this.config.layout === 'two-wheel' ? 0 : lateral * 0.012),
      c.suspensionResponse,
      dt,
    );
    // Assisted balance recentres while stationary and cannot accumulate a fall.
    const leanTarget =
      this.config.layout === 'two-wheel'
        ? -clamp(Math.atan2(lateral, 12) * 0.85, -0.48, 0.48) *
          (s.airborne ? 0.35 : 1)
        : 0;
    s.lean = approach(s.lean, leanTarget, 7, dt);
    this.#ground = ground;
    this.#safeTime += dt;
    if (
      this.#safeTime >= 0.5 &&
      !s.airborne &&
      !s.collision &&
      Math.abs(ground.pitch) < 0.52 &&
      Math.abs(ground.roll) < 0.42 &&
      this.validPose(s)
    ) {
      this.#safeTime = 0;
      this.#safeHistory.push({ x: s.x, z: s.z, heading: s.heading });
      if (this.#safeHistory.length > 18) this.#safeHistory.shift();
    }
  }

  #refreshContacts() {
    const s = this.#state,
      c = this.config;
    s.contacts = this.#ground.wheels.map((wheel) => {
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
    const candidates = this.#safeHistory
      .slice(0, Math.max(1, this.#safeHistory.length - 2))
      .reverse();
    const pose =
      candidates.find((candidate) => this.validPose(candidate)) ??
      this.findGroundedPose(this.#spawn);
    const poseIndex = this.#safeHistory.indexOf(pose);
    const history =
      poseIndex >= 0
        ? this.#safeHistory.slice(0, poseIndex + 1)
        : [{ ...pose }];
    const spawn = this.#spawn;
    const distance = this.#state.distance;
    this.reset(pose);
    this.#spawn = spawn;
    this.#safeHistory = history;
    this.#state.distance = distance;
    return this.snapshot();
  }

  snapshot() {
    return Object.freeze({
      ...this.#state,
      layout: this.config.layout,
      contacts: Object.freeze(
        this.#state.contacts.map((contact) => Object.freeze({ ...contact })),
      ),
      surface: Object.freeze({ ...this.#state.surface }),
    });
  }
}
