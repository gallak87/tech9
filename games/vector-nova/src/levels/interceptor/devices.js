import { createCrucibleDevices } from '../crucible/devices.js';
import { createDeviceLayout } from '../../pickups/layout.js';
import { interceptorBoss } from '../../events/interceptor-bosses.js';

// Offensive gates supply attacks independently of the career loadout. At the
// courier's cruise speed, the next attack is around three seconds of driving.
export function createInterceptorDevices(track, options) {
  const support = options?.supportDevices ?? createCrucibleDevices(track);
  const width = Math.min(18, track.width - 8);
  const lateral = Math.min(8, (track.width - width) / 2 - 1);
  const count = options
    ? Math.max(1, Math.ceil((track.length - 360) / 250))
    : 16;
  const plan = [
    ...support.filter((device) => device.type === 'aegis'),
    ...Array.from({ length: count }, (_, index) => ({
      id: `${options?.prefix ?? 'dispatch'}-attack-${index + 1}`,
      type: index % 4 === 3 ? 'repulsor' : 'arc',
      distance: 180 + index * 250,
      lateral: index % 2 === 0 ? -lateral : lateral,
      width,
      length: 11,
      label: index % 4 === 3 ? 'Close-range pulse' : 'Forward burst',
    })),
  ];
  if (!options) {
    const boss = interceptorBoss('goliath'),
      attack = boss.attack;
    // Cross the narrow centre gate after the core opens, then let the ordinary
    // half-second pulse charge finish while the moving stern is still exposed.
    const offset =
      (boss.cruiseKph / 3.6) *
        (attack.telegraph + attack.turn * 2 + attack.hold + 0.8) -
      32;
    plan.push(
      ...attack.markers.map((marker, index) => ({
        id: `dispatch-core-slam-${index + 1}`,
        type: 'repulsor',
        distance: Math.min(
          marker * track.length + offset,
          track.length - 32 - (boss.cruiseKph / 3.6) * (0.5 + 0.45),
        ),
        lateral: 0,
        width: 6,
        length: 11,
        label: 'Core slam',
      })),
    );
  }
  // Keep authored attack order on Dispatch. Sibling courses use distance order
  // for the shared driver's pickup look-ahead. Pursuits omit induction strips;
  // closing the gap uses the pilot's manual boost and issued Reserve Injector.
  return createDeviceLayout(
    track,
    options ? plan.toSorted((a, b) => a.distance - b.distance) : plan,
  );
}
