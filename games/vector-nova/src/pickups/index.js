import { createPickupPresentation } from './presentation.js';
import { createDeviceRuntime } from './runtime.js';

export function createCircuitDeviceRuntime(
  context,
  { motion, devices, identity, scenarios },
) {
  let presentation;
  try {
    presentation = createPickupPresentation({ ...context, devices });
    return createDeviceRuntime({
      ...context,
      motion,
      devices,
      identity,
      scenarios,
      presentation,
    });
  } catch (error) {
    presentation?.dispose();
    motion.dispose();
    throw error;
  }
}
