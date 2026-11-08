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
    const portside = carrier.id === 'nomad-portside-dive';
    // Portside's broad receiving deck ends 1000m into the carrier.
    add(
      carrier,
      'aegis',
      portside ? 1050 : carrier.index ? 520 : 150,
      0,
      8,
      10,
    );
    add(carrier, 'vector', carrier.index ? 760 : 360, 0, 65, 14);
    // Short cargo holds have no offensive lane clear of both catch and launch.
    // Keep all three choices on supported deck after reachable shield gates.
    if (carrier.id === 'nomad-tailforge') add(carrier, 'arc', 350, -17, 10, 8);
    if (portside) add(carrier, 'ion', 1200, -17, 10, 8);
    if (carrier.id === 'nomad-saltwind')
      add(carrier, 'repulsor', 655, 17, 10, 8);
  }
  return createDeviceLayout(
    track,
    devices.sort((a, b) => a.distance - b.distance),
  );
}
