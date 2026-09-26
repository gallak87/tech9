import test from 'node:test';
import assert from 'node:assert/strict';
import { VehicleMotion, VEHICLE_PRESETS } from '../src/VehicleMotion.js';

const flat = (extra = {}) => ({
  height: () => 0,
  surface: () => ({ kind: 'trail', grip: 1, roughness: 0 }),
  bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 },
  colliders: [],
  ...extra,
});
const drive = (motion, seconds, input = { throttle: 1 }) => {
  let state;
  for (let frame = 0; frame < Math.round(seconds * 60); frame++)
    state = motion.update(1 / 60, input);
  return state;
};

test('three vehicles have distinct acceleration, steering and reverse behavior', () => {
  const speeds = [];
  for (const config of Object.values(VEHICLE_PRESETS)) {
    const motion = new VehicleMotion({ config, world: flat() });
    const straight = drive(motion, 2);
    speeds.push(straight.speed);
    assert.ok(straight.z < -8);
    assert.equal(
      straight.contacts.length,
      config.layout === 'two-wheel' ? 2 : 4,
    );
    const turned = drive(motion, 1, { throttle: 1, steer: 0.7 });
    assert.ok(
      turned.heading > 0 && turned.x > 0,
      'positive steering turns right',
    );
    const stopped = drive(motion, 3, { brake: 1 });
    assert.equal(stopped.speed, 0);
    const reverse = drive(motion, 3, { throttle: -1 });
    assert.ok(reverse.speed < -1 && reverse.speed >= -config.reverseSpeed);
  }
  assert.ok(speeds[0] < speeds[1] && speeds[1] < speeds[2]);
});

test('wheel contacts and body attitude follow the same sloped terrain', () => {
  const height = (x, z) => x * 0.09 - z * 0.12 + Math.sin(x * 3) * 0.06;
  const motion = new VehicleMotion({ world: flat({ height }) });
  const state = drive(motion, 2, { throttle: 0.5 });
  assert.ok(state.pitch > 0.07);
  assert.ok(state.roll > 0.02);
  assert.equal(state.airborne, false);
  for (const contact of state.contacts) {
    assert.ok(contact.grounded);
    assert.ok(
      Math.abs(
        contact.y -
          height(contact.x, contact.z) -
          VEHICLE_PRESETS.fourWheel.wheelRadius,
      ) < 1e-8,
    );
    assert.ok(
      Math.abs(contact.compression) <= VEHICLE_PRESETS.fourWheel.suspension,
    );
  }
});

test('swept footprint stops fast vehicles at thin solids and map boundaries', () => {
  const motion = new VehicleMotion({
    world: flat({ colliders: [{ x: 0, z: -32, radius: 0.12 }] }),
  });
  let collided = false;
  for (let i = 0; i < 400; i++) {
    const state = motion.update(1 / 60, { throttle: 1 });
    collided ||= state.collision;
    assert.ok(state.z > -31);
  }
  assert.ok(collided);
  assert.ok(motion.validPose(motion.snapshot()));
  const world = flat({ bounds: { minX: -8, maxX: 8, minZ: -20, maxZ: 8 } });
  const bounded = new VehicleMotion({
    config: VEHICLE_PRESETS.twoWheel,
    world,
  });
  assert.ok(drive(bounded, 10).z > -19);
});

test('recovery restores a valid grounded recent pose and clears kinetic state', () => {
  const motion = new VehicleMotion({ world: flat() });
  const last = drive(motion, 4, { throttle: 0.7, steer: 0.1 });
  const recovered = motion.recover();
  assert.equal(recovered.speed, 0);
  assert.equal(recovered.steer, 0);
  assert.equal(recovered.verticalSpeed, 0);
  assert.equal(recovered.airborne, false);
  assert.ok(motion.validPose(recovered));
  assert.ok(Math.hypot(recovered.x - last.x, recovered.z - last.z) < 25);
  assert.ok(Math.abs(recovered.z) > 4);
  assert.ok(
    Object.isFrozen(recovered) && Object.isFrozen(recovered.contacts[0]),
  );
});

test('a crest produces ballistic flight followed by stable grounded landing', () => {
  const height = (_x, z) => {
    const forward = -z;
    if (forward < 22) return 0;
    if (forward < 30) return (forward - 22) * 0.3;
    if (forward < 38) return (38 - forward) * 0.3;
    return 0;
  };
  for (const config of Object.values(VEHICLE_PRESETS)) {
    const motion = new VehicleMotion({ config, world: flat({ height }) });
    let flew = false,
      landed = false;
    for (let i = 0; i < 500; i++) {
      const state = motion.update(1 / 60, { throttle: 1 });
      flew ||= state.airborne;
      landed ||= state.landing > 0;
      assert.ok(Number.isFinite(state.y));
    }
    assert.ok(flew, `${config.layout} must leave the crest`);
    assert.ok(landed, `${config.layout} must reconnect with ground`);
    assert.equal(motion.snapshot().airborne, false);
    assert.equal(motion.snapshot().y, 0);
  }
});

test('two-wheel assisted lean is bounded and recenters when braking to rest', () => {
  const motion = new VehicleMotion({
    config: VEHICLE_PRESETS.twoWheel,
    world: flat(),
  });
  drive(motion, 3);
  const turn = drive(motion, 2, { steer: 1, throttle: 0.5 });
  assert.ok(turn.lean < -0.1 && turn.lean >= -0.48);
  const stop = drive(motion, 5, { brake: 1 });
  assert.ok(Math.abs(stop.lean) < 0.001);
});

test('invalid timesteps and input do not poison simulation, and caller snapshots are isolated', () => {
  const motion = new VehicleMotion({ world: flat() });
  const first = motion.snapshot();
  motion.update(NaN, { throttle: Infinity, steer: NaN });
  assert.deepEqual(motion.snapshot(), first);
  drive(motion, 1);
  assert.equal(first.speed, 0);
  assert.ok(motion.snapshot().speed > 0);
  assert.throws(
    () => new VehicleMotion({ config: {}, world: flat() }),
    /layout/,
  );
});

test('consecutive recoveries never restore a later discarded sample', () => {
  const motion = new VehicleMotion({ world: flat() });
  drive(motion, 0.6);
  const first = motion.recover();
  const second = motion.recover();
  assert.ok(
    second.z >= first.z,
    'recovery may only move back through its safe history',
  );
});

test('loose and rough surfaces reduce traction and acceleration', () => {
  const trail = new VehicleMotion({ world: flat() });
  const gravel = new VehicleMotion({
    world: flat({
      surface: () => ({ kind: 'gravel', grip: 0.65, roughness: 0.3 }),
    }),
  });
  const a = drive(trail, 3, { throttle: 1, steer: 0.5 });
  const b = drive(gravel, 3, { throttle: 1, steer: 0.5 });
  assert.ok(b.speed < a.speed);
  assert.equal(b.surface.kind, 'gravel');
});

test('consumer configuration is owned, frozen and drives a custom chassis', () => {
  const config = {
    ...VEHICLE_PRESETS.fourWheel,
    acceleration: 3,
    topSpeed: 12,
    dimensions: { wheelBase: 2.1, track: 1.3, width: 1.6, length: 3 },
  };
  const motion = new VehicleMotion({ config, world: flat() });
  config.acceleration = 90;
  config.dimensions.wheelBase = 10;
  assert.equal(motion.config.acceleration, 3);
  assert.equal(motion.config.dimensions.wheelBase, 2.1);
  assert.ok(Object.isFrozen(motion.config));
  assert.ok(Object.isFrozen(motion.config.dimensions));
  assert.throws(() => {
    motion.config = config;
  }, TypeError);
  const contacts = motion.snapshot().contacts;
  assert.equal(contacts[0].x, -0.65);
  assert.equal(contacts[0].z, -1.05);
  const state = drive(motion, 2);
  assert.ok(state.speed > 3 && state.speed < 6);
  assert.equal(state.layout, 'four-wheel');
});

test('static bounds and circles are detached from caller edits', () => {
  const world = flat({ colliders: [{ x: 0, z: -12, radius: 0.4 }] });
  const motion = new VehicleMotion({ world });
  world.colliders[0].x = 40;
  world.colliders.push({ x: 0, z: -3, radius: 2 });
  world.bounds.minZ = -2;
  world.height = () => 900;
  assert.equal(motion.world.colliders.length, 1);
  assert.equal(motion.world.colliders[0].x, 0);
  assert.equal(motion.height(0, 0), 0);
  assert.ok(Object.isFrozen(motion.world.bounds));
  const state = drive(motion, 4);
  assert.ok(state.z < -5 && state.z > -11);
  assert.equal(state.y, 0);
});

test('numeric and layout validation rejects unsafe configuration and worlds', () => {
  const badConfigs = [
    { topSpeed: Infinity },
    { steering: Math.PI / 2 },
    { acceleration: -1 },
    { wheelRadius: 0 },
    { suspensionResponse: NaN },
    { dimensions: { ...VEHICLE_PRESETS.fourWheel.dimensions, wheelBase: 0 } },
    { dimensions: { ...VEHICLE_PRESETS.fourWheel.dimensions, track: 5 } },
    { layout: 'two-wheel' },
  ];
  for (const overrides of badConfigs)
    assert.throws(
      () =>
        new VehicleMotion({
          config: { ...VEHICLE_PRESETS.fourWheel, ...overrides },
          world: flat(),
        }),
    );
  for (const overrides of [
    { bounds: { minX: -Infinity, maxX: 1, minZ: 0, maxZ: 1 } },
    { bounds: { minX: -1e20, maxX: 1e20, minZ: -1, maxZ: 1 } },
    { colliders: [{ x: 0, z: 0, radius: 1e30 }] },
    { colliders: [{ x: NaN, z: 0, radius: 1 }] },
    { colliders: new Array(10001).fill({ x: 100, z: 0, radius: 1 }) },
    { colliders: new Array(100).fill({ x: 0, z: 0, radius: 256 }) },
    { height: () => Infinity },
    { surface: 5 },
  ])
    assert.throws(() => new VehicleMotion({ world: flat(overrides) }));
});

test('invalid reset leaves state unchanged and a blocked spawn fails explicitly', () => {
  const motion = new VehicleMotion({ world: flat() });
  const state = drive(motion, 1);
  assert.throws(() => motion.reset({ x: NaN, z: 0, heading: 0 }), /Spawn/);
  assert.deepEqual(motion.snapshot(), state);
  assert.throws(
    () =>
      new VehicleMotion({
        world: flat({ colliders: [{ x: 0, z: 0, radius: 40 }] }),
      }),
    /No valid grounded/,
  );
  const relocated = new VehicleMotion({
    world: flat({ colliders: [{ x: 0, z: 0, radius: 2 }] }),
  });
  assert.ok(relocated.validPose(relocated.snapshot()));
  assert.ok(Math.hypot(relocated.snapshot().x, relocated.snapshot().z) > 2);
});

test('long public sweeps remain bounded and reject malformed poses', () => {
  const world = flat({
    bounds: { minX: -999999, maxX: 999999, minZ: -999999, maxZ: 999999 },
    colliders: [{ x: 100, z: 0, radius: 1 }],
  });
  const motion = new VehicleMotion({ world });
  assert.equal(
    motion.collisionBetween(
      { x: -100000, z: 0, heading: 0 },
      { x: 100000, z: 0, heading: 0 },
    ),
    true,
  );
  assert.equal(
    motion.collisionBetween(
      { x: -100000, z: 10, heading: 0 },
      { x: 100000, z: 10, heading: 0 },
    ),
    false,
  );
  assert.equal(
    motion.collisionBetween(
      { x: 1e300, z: 0, heading: 0 },
      { x: 0, z: 0, heading: 0 },
    ),
    true,
  );
  assert.equal(motion.validPose(null), false);
});

test('heading wrap preserves a short conservative rotational sweep', () => {
  const motion = new VehicleMotion({
    world: flat({ bounds: { minX: -1.4, maxX: 1.4, minZ: -10, maxZ: 10 } }),
  });
  const a = { x: 0, z: 0, heading: Math.PI - 0.001 };
  const b = { x: 0, z: 0, heading: -Math.PI + 0.001 };
  assert.equal(motion.collisionBetween(a, b), false);
});

test('surface payloads cannot retain mutable consumer objects in snapshots', () => {
  const kind = { label: 'mud' };
  const motion = new VehicleMotion({
    world: flat({ surface: () => ({ kind, grip: Infinity, roughness: NaN }) }),
  });
  const state = motion.snapshot();
  assert.deepEqual(state.surface, { kind: 'ground', grip: 1, roughness: 0 });
  assert.ok(Object.isFrozen(state.surface));
  assert.throws(() => {
    state.contacts[0].y = 400;
  }, TypeError);
});

test('opposite large finite headings cannot overflow and skip a solid sweep', () => {
  const motion = new VehicleMotion({
    world: flat({ colliders: [{ x: 0, z: 0, radius: 1 }] }),
    spawn: { x: -10, z: 0, heading: 0 },
  });
  assert.equal(
    motion.collisionBetween(
      { x: -10, z: 0, heading: 1e308 },
      { x: 10, z: 0, heading: -1e308 },
    ),
    true,
  );
});
