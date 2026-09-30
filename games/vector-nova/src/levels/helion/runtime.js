import { createFlightModel } from '../../physics/flight.js';
import {
  HELION_HEAT_RULES,
  sampleHelionThermal,
  integrateHelionHeat,
  helionThrustScale,
} from './thermal.js';

const FLIGHT_RULES = {
  gravity: 26,
  airAcceleration: 4,
  airYaw: 0.22,
  recoveryDelay: 1.5,
  timeout: 6,
};
const flightModel = createFlightModel(FLIGHT_RULES);
const wrapped = (s, length) => ((s % length) + length) % length;

export function helionRoadBounds(track, distance) {
  const s = wrapped(distance, track.length);
  return track.jumps.some((jump) => s >= jump.takeoff && s < jump.landingStart)
    ? { min: -track.width / 2, max: 0 }
    : undefined;
}
export function helionShouldLaunch({ state }) {
  const hull =
    Math.abs(Math.cos(state.heading)) * 2.25 +
    Math.abs(Math.sin(state.heading)) * 3.5;
  return state.lateral >= hull + 0.15;
}
export function createHelionRuntime(context, telemetry = {}) {
  const { track } = context;
  let heat = 0,
    disposed = false;
  const rulesId = `helion-thermal-flight-v1:${JSON.stringify({ geometry: track.geometryVersion, heat: HELION_HEAT_RULES, flight: flightModel.rules, jumps: track.jumps, zones: track.thermalZones })}`;
  const scenarios = Object.fromEntries(
    Object.entries(track.scenarios).map(([name, state]) => [
      name,
      { label: name.replaceAll('-', ' '), state: { ...state } },
    ]),
  );
  const firstFurnace = track.thermalZones.find(
    (zone) => zone.kind === 'furnace',
  );
  const firstFlare = track.thermalZones.find((zone) => zone.kind === 'flare');
  if (firstFurnace)
    scenarios['heat-hot'] = {
      label: 'Hot furnace · thrust loss / cooling test',
      state: { distance: firstFurnace.start + 8, lateral: 0, speed: 50 },
    };
  if (firstFlare)
    scenarios['flare-contact'] = {
      label: 'Flare lane · contact and evade',
      state: { distance: firstFlare.start + 12, lateral: 0, speed: 0, time: 5 },
    };
  const base = flightModel.createRuntime(context, {
    id: 'helion-thermal-flight',
    version: 1,
    rulesId,
    scenarios,
    shouldLaunch: helionShouldLaunch,
    groundOptions: ({ state }) => ({
      surface: { thrustScale: helionThrustScale(heat) },
      roadBounds: helionRoadBounds(track, state.distance),
    }),
  });
  let flightMode = 'magnetic';
  function publish(state) {
    const sample = sampleHelionThermal(
      track,
      state.distance,
      state.lateral,
      state.time,
      { airborne: flightMode === 'flight' },
    );
    let warning = sample.warning;
    const s = wrapped(state.distance, track.length);
    const next = track.jumps.find(
      (jump) => jump.takeoff - s > 0 && jump.takeoff - s < 150,
    );
    if (next && !warning)
      warning = `OPTIONAL LEFT JUMP · ${Math.ceil(next.takeoff - s)} m · ${state.speed < 78 ? 'BUILD SPEED' : 'HOLD LINE'}`;
    Object.assign(telemetry, sample, {
      heat,
      thrustScale: helionThrustScale(heat),
      flightMode,
      warning,
    });
  }
  return {
    id: base.id,
    version: base.version,
    rulesId,
    scenarios,
    advance(state, input, dt) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return [];
      const elapsed = Math.min(dt, 0.1),
        count = Math.ceil(elapsed * 120 - 1e-10),
        step = elapsed / count;
      const events = [];
      for (let i = 0; i < count; i++) {
        const sample = sampleHelionThermal(
          track,
          state.distance,
          state.lateral,
          state.time,
          { airborne: flightMode === 'flight' },
        );
        const before = heat;
        events.push(...base.advance(state, input, step));
        flightMode = base.snapshot().mode;
        heat = integrateHelionHeat(heat, sample, step);
        if (before < 62 !== heat < 62)
          events.push({
            type: 'helion-power',
            payload: {
              heat,
              thrustScale: helionThrustScale(heat),
              limited: heat >= 62,
            },
          });
      }
      return events;
    },
    reset(options = {}) {
      base.reset(options);
      flightMode = 'magnetic';
      heat = options.scenario === 'heat-hot' ? 78 : 0;
      if (options.state) publish(options.state);
    },
    snapshot: () => ({ flight: base.snapshot(), heat }),
    restore(data) {
      if (
        !data ||
        !Number.isFinite(data.heat) ||
        data.heat < 0 ||
        data.heat > 100
      )
        throw new Error('Invalid Helion thermal state.');
      base.restore(data.flight);
      heat = data.heat;
      flightMode = data.flight.mode;
    },
    pose: (alpha) => base.pose(alpha),
    update(frame) {
      base.update?.(frame);
      publish(frame.state);
    },
    dispose() {
      disposed = true;
      base.dispose();
    },
  };
}
