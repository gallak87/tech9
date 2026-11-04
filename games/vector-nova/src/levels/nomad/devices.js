import { createDeviceLayout } from '../../pickups/layout.js';

export function createDevices(track) {
  const devices = [];
  const add = (carrier, type, offset, lateral, length, width = 12) => {
    const distance = carrier.start + offset;
    if (
      distance - length / 2 < carrier.start + 12 ||
      distance + length / 2 > carrier.end - 35
    )
      return;
    if (
      track.jumps.some(
        (jump) =>
          distance + length / 2 + 8 >= jump.takeoff &&
          distance - length / 2 - 8 <= Math.max(jump.landingEnd, jump.recovery),
      )
    )
      return;
    devices.push({
      id: `${carrier.id}-${type}`,
      type,
      distance,
      lateral,
      length,
      width,
      label: carrier.name,
    });
  };
  for (const carrier of track.carriers) {
    add(carrier, 'aegis', carrier.index ? 520 : 150, 0, 8, 10);
    add(carrier, 'vector', carrier.index ? 760 : 360, 0, 65, 14);
    // The roof carriers now devote their broad approaches to big-air catches.
    // Keep the optional Arc on the supported opening hold, after its shield.
    if (carrier.index === 0) add(carrier, 'arc', 540, -17, 10, 8);
    if (carrier.index === 4) add(carrier, 'repulsor', 670, 17, 10, 8);
    if (carrier.index === 8) add(carrier, 'ion', 670, -17, 10, 8);
  }
  return createDeviceLayout(
    track,
    devices.sort((a, b) => a.distance - b.distance),
  );
}
