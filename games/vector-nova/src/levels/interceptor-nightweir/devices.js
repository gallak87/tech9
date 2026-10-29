import { createDeviceLayout } from '../../pickups/layout.js';
import { createInterceptorDevices } from '../interceptor/devices.js';
export function createLockdownDevices(track) {
  const support = createDeviceLayout(track, [
    ...[0.035, 0.25, 0.52, 0.78].map((f, index) => ({
      id: `lockdown-induction-${index}`,
      type: 'vector',
      distance: f * track.length,
      lateral: 0,
      width: 22,
      length: 40,
      label: 'Causeway induction',
    })),
    ...[0.13, 0.39, 0.67, 0.92].map((f, index) => ({
      id: `lockdown-shield-${index}`,
      type: 'aegis',
      distance: f * track.length,
      lateral: index % 2 ? -10 : 10,
      width: 8,
      length: 10,
      label: 'Lock control shielding',
    })),
  ]);
  return createInterceptorDevices(track, {
    prefix: 'nightweir-lockdown',
    supportDevices: support,
  });
}
