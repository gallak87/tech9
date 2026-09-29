import { createHalcyonDevices } from './placements.js';
import { createPickupPresentation } from './presentation.js';
import { createHalcyonSimulationRuntime } from './runtime.js';

export function createHalcyonRuntime(context) {
  return createHalcyonSimulationRuntime({
    track: context.track,
    presentation: createPickupPresentation({
      ...context,
      devices: createHalcyonDevices(context.track),
    }),
  });
}
