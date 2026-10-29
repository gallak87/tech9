import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterceptorDevices } from './devices.js';
import { createCrucibleDevices } from '../crucible/devices.js';

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
  assert.deepEqual(createInterceptorDevices(track), expected);
});
