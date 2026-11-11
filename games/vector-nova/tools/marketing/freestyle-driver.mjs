import { createTransferPilot } from '../freestyle-pilot.mjs';

// A held roll or left/down corkscrew, then ordinary receiver alignment.
// Every command passes through the native torque, flight and contact rules.
export function createStuntPilot(
  track,
  { transfer = 3, rollSeconds = 2.4, trick = 'roll' } = {},
) {
  const pilot = createTransferPilot(track, {
    reaction: 0.1,
    quantum: 0.125,
    targetSpeed: 'course',
  });
  let launchedAt = null;
  return (frame) => {
    const motion = frame.motion.motion ?? frame.motion;
    const freestyle = motion.freestyle;
    const control = pilot(frame);
    if (freestyle?.flight?.id === `transfer-${transfer}`) {
      launchedAt ??= frame.state.time;
      if (frame.state.time - launchedAt < rollSeconds) {
        control.aerialPitch = trick === 'corkscrew' ? -1 : 0;
        control.aerialYaw = 0;
        control.aerialRoll = trick === 'corkscrew' ? -1 : 1;
      }
    }
    // Standard controller X/Y are digital yaw buttons. Keep the CPU rehearsal
    // identical to the real-time pad driver rather than supplying analog yaw.
    control.aerialYaw = Math.round(control.aerialYaw);
    return control;
  };
}
