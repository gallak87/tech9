import test from 'node:test';
import assert from 'node:assert/strict';
import createHelionLevel from '../helion/index.js';
import { createHelionRuntime } from '../helion/runtime.js';
import { createHelionCollisionWorld } from '../helion/collision.js';
import { createVehicleState } from '../../physics/index.js';
import { createPickupSimulation } from '../../pickups/simulation.js';
import {
  validateDefinition,
  validateMetadata,
  validateTrack,
} from '../contract.js';
import createLevel from './index.js';
import metadata from './metadata.js';

const dt = 1 / 120;
const settings = { steeringAssist: 0.3 };
const controls = { throttle: 1, brake: 0, steer: 0, boost: false };

test('Helion Breach owns a Wraith mission while preserving every thermal and flight surface', () => {
  const base = createHelionLevel({ shape: false });
  const level = createLevel();
  const original = validateTrack(base.createTrack());
  const track = validateTrack(level.createTrack());
  assert.equal(validateMetadata(metadata), metadata);
  assert.equal(validateDefinition(level), level);
  assert.equal(metadata.order, 43);
  assert.equal(track.name, 'Helion Breach');
  assert.notEqual(track.id, original.id);
  assert.notEqual(level.version, base.version);
  assert.equal(track.geometryVersion, original.geometryVersion);
  assert.equal(track.width, original.width);
  assert.equal(track.length, original.length);
  for (const key of ['jumps', 'thermalZones', 'wallRide', 'checkpoints'])
    assert.deepEqual(track[key], original[key], key);
  for (let index = 0; index <= 64; index++) {
    const distance = (track.length * index) / 64;
    const before = original.sample(distance),
      after = track.sample(distance);
    for (const key of ['position', 'tangent', 'right', 'up'])
      assert.ok(
        before[key].distanceTo(after[key]) < 1e-9,
        `${key}:${distance}`,
      );
    assert.ok(before.quaternion.angleTo(after.quaternion) < 1e-7);
    assert.equal(before.curvature, after.curvature);
    assert.equal(before.bank, after.bank);
    for (const lateral of [-10, 0, 10])
      assert.equal(
        track.surfaceCoverage(distance, lateral),
        original.surfaceCoverage(distance, lateral),
      );
  }
  assert.deepEqual(level.event, {
    type: 'interceptor',
    targetId: 'wraith',
    bossId: 'wraith',
    escapeLaps: 2,
  });
  assert.equal(level.racing.createMotion, createHelionRuntime);
  assert.equal(level.createCollisionWorld, createHelionCollisionWorld);
  for (const key of [
    'createRuntime',
    'createEnvironment',
    'createOverlay',
    'createRoad',
    'createBackdrop',
  ])
    assert.equal(typeof level[key], 'function', key);
});

test('pursuit gates preserve support strips and clear both vaults and the shield-wall transition', () => {
  const base = createHelionLevel({ shape: false });
  const level = createLevel(),
    track = level.createTrack();
  const devices = level.racing.createDevices(track);
  const support = (layout) =>
    layout.filter((device) => ['vector', 'aegis'].includes(device.type));
  assert.deepEqual(support(devices), support(base.racing.createDevices(track)));
  assert.equal(
    new Set(devices.map((device) => device.id)).size,
    devices.length,
  );
  assert.ok(
    devices.every(
      (device, index) =>
        index === 0 || device.distance >= devices[index - 1].distance,
    ),
  );
  const attacks = devices.filter((device) =>
    ['arc', 'repulsor'].includes(device.type),
  );
  assert.ok(
    attacks.length >= 12,
    'regular attack choices remain around the physical hazards',
  );
  assert.ok(attacks.some((device) => device.type === 'arc'));
  assert.ok(attacks.some((device) => device.type === 'repulsor'));
  for (const device of devices) {
    assert.ok(Math.abs(device.lateral) + device.width / 2 <= track.width / 2);
    for (const jump of track.jumps)
      assert.ok(
        device.distance + device.length / 2 < jump.takeoff ||
          device.distance - device.length / 2 > jump.recovery,
      );
  }
  for (const device of attacks) {
    for (const jump of track.jumps)
      assert.ok(
        device.distance + device.length / 2 < jump.takeoff - 60 ||
          device.distance - device.length / 2 > jump.recovery + 30,
      );
    assert.ok(
      device.distance + device.length / 2 < track.wallRide.start - 60 ||
        device.distance - device.length / 2 > track.wallRide.end + 45,
    );
  }
  const identity = createPickupSimulation({
    trackLength: track.length,
    devices,
  }).snapshot().layoutKey;
  const original = createPickupSimulation({
    trackLength: track.length,
    devices: base.racing.createDevices(track),
  }).snapshot().layoutKey;
  assert.notEqual(identity, original);
});

for (const role of ['player', 'rival'])
  test(`${role} retains active furnace heat, cooling, pause and exact thermal replay continuation`, () => {
    const level = createLevel(),
      track = level.createTrack();
    const createRuntime =
      role === 'player' ? level.createRuntime : level.racing.createMotion;
    const runtime = createRuntime({
      track,
      settings,
      presentation: role === 'player',
    });
    const copy = createRuntime({ track, settings, presentation: false });
    const furnace = track.thermalZones.find((zone) => zone.kind === 'furnace');
    const cooling = track.thermalZones.find((zone) => zone.kind === 'cooling');
    const state = { ...createVehicleState(), distance: furnace.start + 15 };
    try {
      runtime.reset({ state });
      assert.equal(runtime.id, 'helion-thermal-flight');
      for (let tick = 0; tick < 400; tick++) runtime.advance(state, {}, dt);
      assert.ok(
        runtime.snapshot().heat > 80,
        'visible furnace is still a real heat hazard',
      );
      const saved = structuredClone(runtime.snapshot());
      runtime.advance(state, controls, 0);
      runtime.update({ state, dt: 0, mode: 'paused' });
      assert.deepEqual(runtime.snapshot(), saved);
      const restored = structuredClone(state);
      copy.restore(saved);
      for (let tick = 0; tick < 60; tick++)
        assert.deepEqual(
          runtime.advance(state, controls, dt),
          copy.advance(restored, controls, dt),
        );
      assert.deepEqual(state, restored);
      assert.deepEqual(runtime.snapshot(), copy.snapshot());
      Object.assign(state, {
        distance: cooling.start + 15,
        speed: 0,
        lateral: 0,
        heading: 0,
      });
      for (let tick = 0; tick < 360; tick++) runtime.advance(state, {}, dt);
      assert.equal(
        runtime.snapshot().heat,
        0,
        'original cooling strip still removes stored heat',
      );
    } finally {
      runtime.dispose();
      copy.dispose();
    }
  });

test('boost retains Helion fire resistance in the pursuit runtime', () => {
  const level = createLevel(),
    track = level.createTrack();
  const fire = track.thermalZones.find((zone) => zone.kind === 'furnace');
  const hot = level.createRuntime({ track, settings });
  const safe = level.createRuntime({
    track: { ...track, thermalZones: [] },
    settings,
  });
  const a = { ...createVehicleState(), distance: fire.start + 5, speed: 30 };
  const b = structuredClone(a);
  try {
    hot.reset({ state: a });
    safe.reset({ state: b });
    for (let tick = 0; tick < 120; tick++) {
      hot.advance(a, { ...controls, boost: true }, dt);
      safe.advance(b, { ...controls, boost: true }, dt);
    }
    assert.ok(hot.snapshot().heat > 0);
    assert.ok(a.speed < b.speed * 0.8, `fire=${a.speed}, clear=${b.speed}`);
  } finally {
    hot.dispose();
    safe.dispose();
  }
});
