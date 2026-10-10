import { createFlightModel } from '../../physics/flight.js';

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
const model = createFlightModel(SHATTERLINE_RULES);
const runtimes = new WeakMap();
export function createShatterlineRuntime(context) {
  const runtime = model.createRuntime(context, {
    id: 'shatterline-ballistic-sprint',
    version: 1,
    rulesId: `shatterline-v1:${JSON.stringify({ geometry: context.track.geometryVersion, rules: model.rules, jumps: context.track.jumps })}`,
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
  if (context.presentation !== false) runtimes.set(context.track, runtime);
  return runtime;
}
export function createShatterlineOverlay({ track, host }) {
  if (typeof document === 'undefined' || !host?.appendChild)
    return { dispose() {} };
  const element = document.createElement('div');
  Object.assign(element.style, {
    position: 'absolute',
    left: '50%',
    top: '19%',
    transform: 'translateX(-50%)',
    color: '#f1e8d6',
    font: '600 11px system-ui',
    letterSpacing: '.13em',
    textAlign: 'center',
    pointerEvents: 'none',
    textShadow: '0 2px 5px #000',
    zIndex: '4',
  });
  host.append(element);
  return {
    update({ state, mode }) {
      if (!state || mode !== 'racing') {
        element.textContent = '';
        return;
      }
      const motion = runtimes.get(track)?.snapshot();
      const jump = motion?.flight
        ? track.jumps.find((j) => j.id === motion.flight.id)
        : track.jumps.find(
            (j) =>
              j.takeoff > state.distance && j.takeoff - state.distance < 230,
          );
      if (motion?.mode === 'flight')
        element.textContent = `${jump?.label?.toUpperCase() ?? 'FLIGHT'}  /  ${motion.flight.elapsed.toFixed(1)} S AIRBORNE`;
      else if (motion?.mode === 'recovery')
        element.textContent = 'RECOVERING · TIME CONTINUES';
      else if (jump)
        element.textContent = `${jump.hero ? 'LONG FLIGHT · ' : ''}${jump.label.toUpperCase()}  /  ${Math.ceil((jump.takeoff - state.distance) / 10) * 10} M`;
      else element.textContent = '';
    },
    dispose() {
      element.remove();
    },
  };
}
