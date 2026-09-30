import { createFlightModel } from '../../../physics/flight.js';

export const NACRE_FLIGHT_RULES = Object.freeze({
  gravity: 26,
  hover: 0.72,
  halfWidth: 2.25,
  halfLength: 3.5,
  airAcceleration: 4,
  airYaw: 0.22,
  headingTolerance: 0.44,
  rollTolerance: 0.6,
  pitchTolerance: 0.7,
  recoveryDelay: 1.5,
  timeout: 6,
  step: 1 / 120,
  landingSettleDuration: 0.32,
  landingBounce: 0.06,
  edgeOverlap: 0.5,
  edgeInset: 0.3,
  edgeSpeedRetention: 0.95,
  edgeEnergyCost: 2,
  railHeight: { 'storm-leap': 5.15, 'abyss-crossing': 8.25 },
});
const R = NACRE_FLIGHT_RULES;

const model = createFlightModel(NACRE_FLIGHT_RULES);
export const sweptNacreRail = model.sweptRail;
export const sweptNacreLanding = model.sweptLanding;

export function createNacreRuntime({ track, host, settings = {} }) {
  if (track.id !== 'nacre-tempest-1-shape')
    throw new Error('Nacre flight requires its exact authored track.');
  let status = null;
  if (host?.appendChild && typeof document !== 'undefined') {
    status = document.createElement('div');
    status.dataset.nacreFlight = '';
    status.setAttribute('aria-live', 'polite');
    Object.assign(status.style, {
      position: 'absolute',
      left: '50%',
      top: '22%',
      transform: 'translateX(-50%)',
      color: '#e3f3ed',
      padding: '7px 10px',
      maxWidth: 'min(330px, calc(100vw - 28px))',
      width: 'max-content',
      boxSizing: 'border-box',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      lineHeight: '1.45',
      background: 'rgba(6,31,38,.85)',
      border: '1px solid #7cafb6',
      font: '600 clamp(11px, 2.8vw, 13px) system-ui',
      letterSpacing: '.035em',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '8',
    });
    host.appendChild(status);
  }
  const scenarioLabels = {};
  for (let i = 1; i <= track.jumps.length; i += 1) {
    scenarioLabels[`jump${i}-approach`] =
      `Jump ${i} · short approach · W + Shift`;
    scenarioLabels[`jump${i}-success`] = `Jump ${i} · aligned at 403 km/h`;
    scenarioLabels[`jump${i}-short`] = `Jump ${i} · slow launch at 187 km/h`;
    scenarioLabels[`jump${i}-lateral`] = `Jump ${i} · 15° sideways at 396 km/h`;
    scenarioLabels[`jump${i}-long`] = `Jump ${i} · full boost at 565 km/h`;
    scenarioLabels[`jump${i}-cruise70`] = `Jump ${i} · 70% cruise at 282 km/h`;
    scenarioLabels[`jump${i}-boost70`] = `Jump ${i} · 70% boost at 396 km/h`;
  }
  const scenarios = Object.fromEntries(
    Object.entries(track.scenarios).map(([name, state]) => [
      name,
      {
        label: scenarioLabels[name] ?? name.replaceAll('-', ' '),
        state: { ...state },
      },
    ]),
  );
  for (const [index] of track.jumps.entries())
    for (const side of [-1, 1]) {
      const name = `jump${index + 1}-edge-${side < 0 ? 'right' : 'left'}`;
      scenarios[name] = {
        label: `Jump ${index + 1} · ${side < 0 ? 'right' : 'left'} rail catch`,
        state: {
          ...track.scenarios[`jump${index + 1}-long`],
          lateral: side * 10.9,
          heading: side * 0.007,
        },
      };
    }
  const runtime = model.createRuntime(
    { track, settings },
    {
      id: 'nacre-flight',
      version: 5,
      rulesId: `nacre-jumps-v5:${JSON.stringify({ track: track.id, geometry: track.geometryVersion, rules: R, jumps: track.jumps })}`,
      edgeSource: 'nacre-edge-catch',
      scenarios,
    },
  );
  return {
    ...runtime,
    reset(options) {
      runtime.reset(options);
      if (status) status.style.display = 'none';
    },
    update({ state, mode: sessionMode } = {}) {
      if (!status) return;
      const { mode, flight } = runtime.snapshot();
      const width = globalThis.innerWidth ?? host?.clientWidth ?? 1440;
      const height = globalThis.innerHeight ?? host?.clientHeight ?? 900;
      const compactLandscape = height < 560 && width >= height;
      status.style.top =
        width < 600 && height > width
          ? '275px'
          : compactLandscape
            ? '148px'
            : '22%';
      status.style.padding = compactLandscape ? '5px 8px' : '7px 10px';
      status.style.fontSize = compactLandscape
        ? '11px'
        : 'clamp(11px, 2.8vw, 13px)';
      status.style.maxWidth = compactLandscape
        ? 'min(300px, calc(100vw - 28px))'
        : 'min(330px, calc(100vw - 28px))';
      let text = '';
      let warning = false;
      if (sessionMode === 'racing') {
        if (mode === 'recovery') {
          text = `MISSED LANDING · RECOVERY ${flight.remaining.toFixed(1)}s`;
          warning = true;
        } else if (mode === 'flight') {
          text = 'AIRBORNE · LIMITED AIR STEER';
        } else if (state) {
          const distance =
            ((state.distance % track.length) + track.length) % track.length;
          const index = track.jumps.findIndex((jump) => {
            const remaining = jump.takeoff - distance;
            return remaining >= 0 && remaining <= 220;
          });
          if (index >= 0) {
            const remaining = Math.ceil(track.jumps[index].takeoff - distance);
            // These are presentation-only observations of the tested launch
            // envelope, never speed clamps or automatic trajectory assistance.
            const low = state.speed < 78.4;
            warning = low;
            const guidance = low
              ? 'SPEED LOW · ACCELERATE'
              : 'SPEED READY · HOLD LINE';
            text = compactLandscape
              ? `JUMP ${index + 1} · ${remaining} m · ${low ? 'ACCELERATE' : 'HOLD LINE'}`
              : `JUMP ${index + 1} · ${remaining} m · BOOST WELCOME\n${guidance}`;
          }
        }
      }
      status.style.display = text ? 'block' : 'none';
      status.style.color = warning ? '#f1cf9a' : '#e3f3ed';
      status.style.borderColor = warning ? '#987853' : '#7cafb6';
      if (status.textContent !== text) status.textContent = text;
    },
    dispose() {
      runtime.dispose();
      status?.remove();
      status = null;
    },
  };
}
