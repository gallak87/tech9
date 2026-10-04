import { createPickupSimulation } from './simulation.js';

// Validate the shared contract once at boot while leaving the placement plan
// to the circuit. Ground hardware cannot occupy an airborne/recovery corridor.
export function createDeviceLayout(track, plan) {
  const devices = plan.map((device) => ({ ...device }));
  createPickupSimulation({ trackLength: track.length, devices });
  for (const device of devices) {
    if (Math.abs(device.lateral) + device.width / 2 > track.width / 2)
      throw new Error(`Device ${device.id} extends beyond the road`);
    for (const jump of track.jumps ?? [])
      if (
        device.distance + device.length / 2 >= jump.takeoff &&
        device.distance - device.length / 2 <= jump.recovery
      )
        throw new Error(`Device ${device.id} overlaps jump ${jump.id}`);
  }
  return devices;
}
