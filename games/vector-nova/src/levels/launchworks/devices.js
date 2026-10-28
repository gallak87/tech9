import { createDeviceLayout } from '../../pickups/layout.js';

// Use the ordinary Vector hardware and propulsion; the approach supplies launch
// speed without spending the pilot's manual boost reserve.
export function createLaunchworksDevices(track) {
  return createDeviceLayout(
    track,
    track.jumps.map((jump, i) => ({
      id: `launch-vector-${i + 1}`,
      type: 'vector',
      distance: jump.takeoff - 66,
      lateral: 0,
      width: 28,
      length: 68,
      label: `Transfer ${i + 1} launch strip`,
    })),
  );
}
