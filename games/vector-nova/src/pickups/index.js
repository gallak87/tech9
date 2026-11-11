import { createPickupPresentation } from './presentation.js';
import { createDeviceRuntime } from './runtime.js';

export function createCircuitDeviceRuntime(
  context,
  {
    motion,
    devices,
    identity,
    scenarios,
    team = context.team,
    hitBounds = context.hitBounds,
    equipmentTuning = context.equipmentTuning,
    beforeCombat = context.beforeCombat,
  },
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
      team,
      hitBounds,
      equipmentTuning,
      beforeCombat,
    });
  } catch (error) {
    presentation?.dispose();
    motion.dispose();
    throw error;
  }
}
