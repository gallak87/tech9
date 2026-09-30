import { createMagneticRuntime } from '../../core/session-runtime.js';

// Gate 4.1 preflight stub. Gate 4.2 owns this directory after patch handoff.
export function createHalcyonRuntime(context) {
  return {
    ...createMagneticRuntime(context),
    id: 'halcyon-pickups',
    version: 1,
    rulesId: 'halcyon-pickups-noop-v1',
  };
}
