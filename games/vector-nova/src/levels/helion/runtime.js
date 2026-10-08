import { headingExtents } from '../../physics/hull.js';
import { createFlightModel } from '../../physics/flight.js';
import {
  HELION_HEAT_RULES,
  sampleHelionThermal,
  integrateHelionHeat,
  helionActiveThrustScale,
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
  const hull = headingExtents(state.heading).lateral;
  return state.lateral >= hull + 0.15;
}
export function createHelionRuntime(context, telemetry = {}) {
  const { track } = context;
  let heat = 0,
    contactAge = HELION_HEAT_RULES.visualRelease,
    contactHeat = 0,
    disposed = false;
  const rulesId = `helion-thermal-flight-v3:${JSON.stringify({ geometry: track.geometryVersion, heat: HELION_HEAT_RULES, flight: flightModel.rules, jumps: track.jumps, zones: track.thermalZones })}`;
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
      surface: { thrustScale: thrustScale(state) },
      roadBounds: helionRoadBounds(track, state.distance),
    }),
  });
  let flightMode = 'magnetic';
  function thrustScale(state) {
    const sample = sampleHelionThermal(
      track,
      state.distance,
      state.lateral,
      state.time,
      { airborne: flightMode !== 'magnetic' },
    );
    return helionActiveThrustScale(
      heat,
      sample.exposure > 0 ? 0 : contactAge,
      state.time,
    );
  }
  function publish(state) {
    const sample = sampleHelionThermal(
      track,
      state.distance,
      state.lateral,
      state.time,
      { airborne: flightMode !== 'magnetic' },
    );
    let warning = sample.warning;
    const s = wrapped(state.distance, track.length);
    const next = track.jumps.find(
      (jump) => jump.takeoff - s > 0 && jump.takeoff - s < 150,
    );
    if (next && !warning)
      warning = `OPTIONAL LEFT JUMP · ${Math.ceil(next.takeoff - s)} m · ${state.speed < 78 ? 'BUILD SPEED' : 'HOLD LINE'}`;
    const flight = base.snapshot();
    const destination =
      flight.mode === 'recovery'
        ? track.jumps.find((jump) => jump.id === flight.flight?.id)
        : null;
    const target = destination ? track.sample(destination.recovery) : null;
    const recoveryTarget = target
      ? target.position.clone().addScaledVector(target.up, 2)
      : null;
    Object.assign(telemetry, sample, {
      recoveryTarget: recoveryTarget?.toArray() ?? null,
      recoveryDistance:
        recoveryTarget && flight.currentPose
          ? recoveryTarget.distanceTo({
              x: flight.currentPose.position[0],
              y: flight.currentPose.position[1],
              z: flight.currentPose.position[2],
            })
          : 0,
      heat,
      thrustScale: thrustScale(state),
      contactAge: sample.exposure > 0 ? 0 : contactAge,
      contactHeat,
      heatTime: state.time,
      flightMode,
      warning,
    });
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
        const sample = sampleHelionThermal(
          track,
          state.distance,
          state.lateral,
          state.time,
          { airborne: flightMode !== 'magnetic' },
        );
        const before = thrustScale(state);
        events.push(...base.advance(state, input, step, modifiers));
        flightMode = base.snapshot().mode;
        heat = integrateHelionHeat(heat, sample, step);
        if (sample.exposure > 0 && !sample.sheltered) {
          contactAge = 0;
          contactHeat = heat;
        } else {
          contactAge = Math.min(
            HELION_HEAT_RULES.visualRelease,
            contactAge + step,
          );
        }
        const power = thrustScale(state);
        if (before < 1 !== power < 1)
          events.push({
            type: 'helion-power',
            payload: {
              heat,
              thrustScale: power,
              limited: power < 1,
            },
          });
      }
      return events;
    },
    reset(options = {}) {
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
      heat = data.heat;
      contactAge = data.contactAge;
      contactHeat = data.contactHeat;
      flightMode = data.flight.mode;
    },
    pose: (alpha) => base.pose(alpha),
    update(frame) {
      base.update?.(frame);
      if (frame.state) publish(frame.state);
    },
    dispose() {
      disposed = true;
      base.dispose();
    },
  };
}
