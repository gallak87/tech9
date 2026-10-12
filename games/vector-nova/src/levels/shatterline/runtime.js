import { createFlightModel } from '../../physics/flight.js';
import { SHATTERLINE_PACE } from './pace.js';

export const SHATTERLINE_RULES = Object.freeze({
  gravity: 26,
  timeout: 8,
  missBelow: 70,
  missBeyond: 45,
  missLateral: 85,
  airAcceleration: 4,
  airYaw: 0.16,
  pitchTolerance: 1.05,
});
const EXIT_RECOVERY = Object.freeze({
  inwardSpeed: 75,
  speedRetention: 0.88,
  duration: 0.9,
  yawRate: 3.5,
  energyScale: 0.25,
});
const model = createFlightModel(SHATTERLINE_RULES);
export function createShatterlineRuntime(context) {
  const pace = context.track.pace ?? SHATTERLINE_PACE;
  return model.createRuntime(context, {
    id: 'shatterline-ballistic-sprint',
    version: 4,
    rulesId: `shatterline-v4:surface-metric-v1:${JSON.stringify({ geometry: context.track.geometryVersion, pace, exitRecovery: EXIT_RECOVERY, rules: model.rules, jumps: context.track.jumps })}`,
    groundOptions: ({ state, track }) => {
      const tube = track.tubeAt?.(state.distance);
      return {
        pace,
        supportHeight: 0.04,
        ...(tube &&
        state.distance >= tube.guidanceStart &&
        state.distance <= tube.guidanceEnd
          ? { railRecovery: { id: tube.id, ...EXIT_RECOVERY } }
          : {}),
      };
    },
    testLaunch: Boolean(context.playtest),
    forgivingContacts: true,
    // Keep the hovering hull clear of the lip while its tail crosses the
    // solid end face; zero clearance can snag the float32 cap at this altitude.
    supportHeight: 0.04,
    automaticRecovery: context.playtest?.automaticRecovery !== false,
    scenarios: Object.fromEntries(
      Object.entries(context.track.scenarios).map(([id, state]) => [
        id,
        { label: id.replaceAll('-', ' '), state: { ...state } },
      ]),
    ),
  });
}
