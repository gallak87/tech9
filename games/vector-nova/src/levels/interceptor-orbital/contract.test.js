import test from 'node:test';
import assert from 'node:assert/strict';
import createOrbital from '../orbital/index.js';
import createHalcyon from '../halcyon/index.js';
import createOrbitalIntercept from './index.js';
import createHalcyonIntercept from '../interceptor-halcyon/index.js';
import orbitalMetadata from './metadata.js';
import halcyonMetadata from '../interceptor-halcyon/metadata.js';
import { validateMetadata, validateTrack } from '../contract.js';
import { createInterceptorDevices } from '../interceptor/devices.js';
import { createCrucibleDevices } from '../crucible/devices.js';
import { createPickupSimulation } from '../../pickups/simulation.js';

for (const [metadata, createBase, createPursuit, bossId] of [
  [
    orbitalMetadata,
    () => createOrbital({ shape: false }),
    createOrbitalIntercept,
    'wraith',
  ],
  [halcyonMetadata, createHalcyon, createHalcyonIntercept, 'bulwark'],
]) {
  test(`${metadata.name} retains its approved route while owning its pursuit and fitting its combat layout`, () => {
    const base = createBase(),
      pursuit = createPursuit();
    const original = validateTrack(base.createTrack());
    const track = validateTrack(pursuit.createTrack());
    assert.equal(validateMetadata(metadata), metadata);
    assert.notEqual(pursuit.version, base.version);
    assert.notEqual(track.id, original.id);
    assert.equal(track.name, metadata.name);
    assert.equal(track.width, 28);
    assert.equal(track.length, original.length);
    assert.equal(track.closed, original.closed);
    assert.deepEqual(track.jumps ?? [], []);
    assert.deepEqual(track.checkpoints, original.checkpoints);
    for (let index = 0; index <= 64; index++) {
      const distance = (track.length * index) / 64;
      const before = original.sample(distance),
        after = track.sample(distance);
      for (const axis of ['position', 'tangent', 'right', 'up'])
        assert.ok(
          before[axis].distanceTo(after[axis]) < 1e-9,
          `${axis} at ${distance}`,
        );
      assert.ok(before.quaternion.angleTo(after.quaternion) < 1e-7);
      assert.equal(before.curvature, after.curvature);
      assert.equal(before.bank, after.bank);
    }
    assert.deepEqual(pursuit.event, {
      type: 'interceptor',
      targetId: bossId,
      bossId,
      escapeLaps: 2,
    });
    assert.equal(metadata.bossId, bossId);
    assert.equal(metadata.eventType, 'interceptor');
    assert.equal(pursuit.racing.identity, undefined);
    assert.equal(pursuit.racing.scenarios, undefined);
    const devices = pursuit.racing.createDevices(track);
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
    assert.deepEqual(
      [...new Set(devices.map((device) => device.type))].sort(),
      ['aegis', 'arc', 'repulsor', 'vector'],
    );
    const attacks = devices.filter((device) =>
      ['arc', 'repulsor'].includes(device.type),
    );
    assert.ok(attacks.length >= 16);
    for (const device of devices) {
      assert.ok(Math.abs(device.lateral) + device.width / 2 <= track.width / 2);
      assert.ok(device.distance - device.length / 2 >= 0);
      assert.ok(device.distance + device.length / 2 < track.length);
    }
    const layoutKey = createPickupSimulation({
      trackLength: track.length,
      devices,
    }).snapshot().layoutKey;
    const baseLayoutKey = createPickupSimulation({
      trackLength: original.length,
      devices: base.racing.createDevices(original),
    }).snapshot().layoutKey;
    assert.notEqual(layoutKey, baseLayoutKey);
  });
}

test('generalizing pursuit lanes preserves the existing Goliath layout exactly', () => {
  const track = { length: 4300, width: 44, closed: true };
  const expected = [
    ...createCrucibleDevices(track).filter((device) =>
      ['vector', 'aegis'].includes(device.type),
    ),
    ...Array.from({ length: 16 }, (_, index) => ({
      id: `dispatch-attack-${index + 1}`,
      type: index % 4 === 3 ? 'repulsor' : 'arc',
      distance: 180 + index * 250,
      lateral: index % 2 === 0 ? -8 : 8,
      width: 18,
      length: 11,
      label: index % 4 === 3 ? 'Close-range pulse' : 'Forward burst',
    })),
  ];
  assert.deepEqual(createInterceptorDevices(track), expected);
});
