import { createInterceptorDevices } from '../interceptor/devices.js';
import { createDeviceLayout } from '../../pickups/layout.js';

const attack = (device) => ['arc', 'repulsor'].includes(device.type);

export function createHelionBreachDevices(track, supportDevices) {
  // The generic pursuit pattern knows no optional split deck. Generate the
  // candidates first, then validate the retained hardware on the actual route.
  const candidates = createInterceptorDevices(
    { ...track, jumps: [] },
    { prefix: 'helion-breach', supportDevices },
  );
  const exclusions = [
    ...track.jumps.map((jump) => ({
      start: jump.takeoff - 60,
      end: jump.recovery + 30,
    })),
    {
      start: track.wallRide.start - 60,
      end: track.wallRide.end + 45,
    },
  ];
  return createDeviceLayout(
    track,
    candidates.filter(
      (device) =>
        !attack(device) ||
        exclusions.every(
          ({ start, end }) =>
            device.distance + device.length / 2 < start ||
            device.distance - device.length / 2 > end,
        ),
    ),
  );
}
