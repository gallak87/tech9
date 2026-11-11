import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterceptorDevices } from './devices.js';
import { createCrucibleDevices } from '../crucible/devices.js';
import { interceptorBoss } from '../../events/interceptor-bosses.js';

test('pursuit gates retain shields and attacks without track boost strips', () => {
  const track = { length: 4300, width: 44, closed: true };
  const expected = [
    ...createCrucibleDevices(track).filter((device) => device.type === 'aegis'),
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
  const devices = createInterceptorDevices(track);
  assert.deepEqual(
    devices.filter((device) => !device.id.startsWith('dispatch-core-slam-')),
    expected,
  );
  assert.ok(devices.every((device) => device.type !== 'vector'));
});

test('only Dispatch adds a narrow recentering pulse during every earned overload window', () => {
  const track = { length: 4354.64, width: 44, closed: true };
  const boss = interceptorBoss('goliath'),
    attack = boss.attack;
  const speed = boss.cruiseKph / 3.6;
  const opens = attack.telegraph + attack.turn * 2 + attack.hold;
  const gates = createInterceptorDevices(track).filter((device) =>
    device.id.startsWith('dispatch-core-slam-'),
  );
  assert.equal(gates.length, 3);
  for (const [index, gate] of gates.entries()) {
    assert.equal(gate.type, 'repulsor');
    assert.equal(gate.lateral, 0);
    assert.equal(gate.width, 6, 'the pilot must deliberately recenter');
    assert.ok(gate.distance + gate.length / 2 < track.length);
    const marker = attack.markers[index] * track.length;
    const fireAfter = (gate.distance + 32 - marker) / speed + 0.5;
    assert.ok(
      fireAfter > opens + 0.5 && fireAfter < opens + attack.pressure.breach - 1,
      `ordinary delayed pulse fires ${fireAfter.toFixed(2)}s after beat ${index + 1}`,
    );
    assert.ok(
      (track.length - gate.distance - 32) / speed - 0.5 >= 0.4,
      'the final delayed pulse lands before the boss reaches the escape line',
    );
  }
  for (const prefix of ['helion-breach', 'nightweir-lockdown']) {
    const sibling = createInterceptorDevices(track, {
      prefix,
      supportDevices: [],
    });
    assert.ok(sibling.every((device) => !device.id.includes('core-slam')));
  }
});
