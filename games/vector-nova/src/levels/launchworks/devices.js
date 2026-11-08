import { createDeviceLayout } from '../../pickups/layout.js';

// Three powered entries end before release, leaving road angle and braking to
// determine the launch. The two plunges supply their own speed through gravity.
export function createLaunchworksDevices(track) {
  return createDeviceLayout(
    track,
    [0, 2, 3].map((index) => {
      const jump = track.jumps[index];
      return {
        id: `launch-vector-${index + 1}`,
        type: 'vector',
        distance: jump.takeoff - { 0: 170, 2: 200, 3: 240 }[index],
        lateral: 0,
        width: 28,
        length: 48,
        label: `${jump.label} approach strip`,
      };
    }),
  );
}
