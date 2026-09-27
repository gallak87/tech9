import test from 'node:test';
import assert from 'node:assert/strict';
import { VehicleMotion, VEHICLES } from '../src/driving/VehicleMotion.js';

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
  for (const vehicle of Object.keys(VEHICLES)) {
    const motion = new VehicleMotion({ vehicle, world: flat() });
    const straight = drive(motion, 2);
    speeds.push(straight.speed);
    assert.ok(straight.z < -8);
    assert.equal(straight.contacts.length, vehicle === 'bike' ? 2 : 4);
    const turned = drive(motion, 1, { throttle: 1, steer: 0.7 });
    assert.ok(
      turned.heading > 0 && turned.x > 0,
      'positive steering turns right',
    );
    const stopped = drive(motion, 3, { brake: 1 });
    assert.equal(stopped.speed, 0);
    const reverse = drive(motion, 3, { throttle: -1 });
    assert.ok(
      reverse.speed < -1 && reverse.speed >= -VEHICLES[vehicle].reverseSpeed,
    );
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
        contact.y - height(contact.x, contact.z) - VEHICLES.jeep.wheelRadius,
      ) < 1e-8,
    );
    assert.ok(Math.abs(contact.compression) <= VEHICLES.jeep.suspension);
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
  const bounded = new VehicleMotion({ vehicle: 'bike', world });
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
  for (const vehicle of Object.keys(VEHICLES)) {
    const motion = new VehicleMotion({ vehicle, world: flat({ height }) });
    let flew = false,
      landed = false;
    for (let i = 0; i < 500; i++) {
      const state = motion.update(1 / 60, { throttle: 1 });
      flew ||= state.airborne;
      landed ||= state.landing > 0;
      assert.ok(Number.isFinite(state.y));
    }
    assert.ok(flew, `${vehicle} must leave the crest`);
    assert.ok(landed, `${vehicle} must reconnect with ground`);
    assert.equal(motion.snapshot().airborne, false);
    assert.equal(motion.snapshot().y, 0);
  }
});

test('bike assisted lean is bounded and recenters when braking to rest', () => {
  const motion = new VehicleMotion({ vehicle: 'bike', world: flat() });
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
    () => new VehicleMotion({ vehicle: 'truck', world: flat() }),
    /Unknown/,
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
