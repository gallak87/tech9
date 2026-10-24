import { headingExtents } from '../../physics/hull.js';
import { createFlightModel } from '../../physics/flight.js';
import {
  HAZARD_SURFACE_RULES,
  sampleHazardSurface,
} from '../../physics/hazard-surface.js';
import {
  HELION_HEAT_RULES,
  sampleHelionThermal,
  integrateHelionHeat,
  helionActiveThrustScale,
} from './thermal.js';

export const HELION_FIRE_SEVERITY = 1;
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
  const hull = headingExtents(state.heading).lateral;
  return state.lateral >= hull + 0.15;
}
export function createHelionRuntime(context, telemetry = {}) {
  const { track } = context;
  let heat = 0,
    contactAge = HELION_HEAT_RULES.visualRelease,
    contactHeat = 0,
    disposed = false,
    staged = null;
  const rulesId = `helion-thermal-flight-v4:${JSON.stringify({ geometry: track.geometryVersion, heat: HELION_HEAT_RULES, hazard: HAZARD_SURFACE_RULES, severity: HELION_FIRE_SEVERITY, flight: flightModel.rules, jumps: track.jumps, zones: track.thermalZones })}`;
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
  if (firstFurnace)
    scenarios['fire-brief'] = {
      label: 'Brief fire crossing · five-second smoke / screen fade',
      state: { distance: firstFurnace.end - 6, lateral: 0, speed: 90 },
    };
  if (firstFlare)
    scenarios['flare-contact'] = {
      label: 'Flare lane · contact and evade',
      state: { distance: firstFlare.start + 12, lateral: 0, speed: 0, time: 5 },
    };
  const base = flightModel.createRuntime(context, {
    testLaunch: Boolean(context.playtest),
    forgivingContacts: Boolean(context.collisionWorld),
    id: 'helion-thermal-flight',
    version: 3,
    rulesId,
    scenarios,
    shouldLaunch: helionShouldLaunch,
    groundOptions: ({ state }) => ({
      surface: fireSurface(state),
      roadBounds: helionRoadBounds(track, state.distance),
    }),
  });
  let flightMode = 'magnetic';
  function fireSurface(state) {
    const sample = sampleHelionThermal(
      track,
      state.distance,
      state.lateral,
      state.time,
      { airborne: flightMode !== 'magnetic' },
    );
    const surface = sampleHazardSurface(
      state.speed,
      HELION_FIRE_SEVERITY,
      sample.contactStrength,
    );
    // Fire bites immediately, including a cold boost-through. Accumulated heat
    // still adds engine overload and its existing short recovery after escape.
    surface.thrustScale *= helionActiveThrustScale(
      heat,
      sample.exposure > 0 ? 0 : contactAge,
      state.time,
    );
    return surface;
  }
  const thrustScale = (state) => fireSurface(state).thrustScale;
  function publish(state) {
    const sample = sampleHelionThermal(
      track,
      state.distance,
      state.lateral,
      state.time,
      { airborne: flightMode !== 'magnetic' },
    );
    Object.assign(telemetry, sample, {
      heat,
      thrustScale: thrustScale(state),
      contactAge: sample.exposure > 0 ? 0 : contactAge,
      contactHeat,
      heatTime: state.time,
      flightMode,
    });
  }
  function prepareStep(state, dt) {
    return {
      sample: sampleHelionThermal(
        track,
        state.distance,
        state.lateral,
        state.time,
        {
          airborne: flightMode !== 'magnetic',
        },
      ),
      before: thrustScale(state),
      dt,
    };
  }
  function finishStep(state, { sample, before, dt }, events) {
    flightMode = base.snapshot().mode;
    heat = integrateHelionHeat(heat, sample, dt);
    if (sample.exposure > 0 && !sample.sheltered) {
      contactAge = 0;
      contactHeat = heat;
    } else
      contactAge = Math.min(HELION_HEAT_RULES.visualRelease, contactAge + dt);
    const power = thrustScale(state);
    if (before < 1 !== power < 1)
      events.push({
        type: 'helion-power',
        payload: { heat, thrustScale: power, limited: power < 1 },
      });
    return events;
  }
  return {
    id: base.id,
    version: base.version,
    rulesId: base.rulesId,
    scenarios,
    ...(base.launch ? { launch: base.launch } : {}),
    advance(state, input, dt, modifiers) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return [];
      const elapsed = Math.min(dt, 0.1),
        count = Math.ceil(elapsed * 120 - 1e-10),
        step = elapsed / count;
      const events = [];
      for (let i = 0; i < count; i++) {
        const sample = prepareStep(state, step);
        events.push(
          ...finishStep(
            state,
            sample,
            base.advance(state, input, step, modifiers),
          ),
        );
      }
      return events;
    },
    ...(base.beginAdvance
      ? {
          beginAdvance(state, input, dt, modifiers) {
            if (staged) throw new Error('Finish the pending Helion step first');
            staged = prepareStep(state, dt);
            base.beginAdvance(state, input, dt, modifiers);
          },
          finishAdvance(state) {
            if (!staged)
              throw new Error('Stage the Helion step before resolving it');
            const sample = staged;
            const events = base.finishAdvance(state);
            staged = null;
            return finishStep(state, sample, events);
          },
        }
      : {}),
    reset(options = {}) {
      staged = null;
      base.reset(options);
      flightMode = 'magnetic';
      heat = options.scenario === 'heat-hot' ? 78 : 0;
      contactAge = heat ? 0 : HELION_HEAT_RULES.visualRelease;
      contactHeat = heat;
      if (options.state) publish(options.state);
    },
    snapshot() {
      const flight = base.snapshot();
      return { mode: flight.mode, flight, heat, contactAge, contactHeat };
    },
    restore(data) {
      if (
        !data ||
        !Number.isFinite(data.heat) ||
        data.heat < 0 ||
        data.heat > 100 ||
        !Number.isFinite(data.contactAge) ||
        data.contactAge < 0 ||
        data.contactAge > HELION_HEAT_RULES.visualRelease ||
        !Number.isFinite(data.contactHeat) ||
        data.contactHeat < 0 ||
        data.contactHeat > HELION_HEAT_RULES.maximum
      )
        throw new Error('Invalid Helion thermal state.');
      base.restore(data.flight);
      staged = null;
      heat = data.heat;
      contactAge = data.contactAge;
      contactHeat = data.contactHeat;
      flightMode = data.flight.mode;
    },
    pose: (alpha) => base.pose(alpha),
    applyImpulse: (state, impulse) => base.applyImpulse(state, impulse),
    jump: (state) => base.jump(state),
    update(frame) {
      base.update?.(frame);
      if (frame.state) publish(frame.state);
    },
    dispose() {
      disposed = true;
      staged = null;
      base.dispose();
    },
  };
}
