import { createFlightModel } from '../../physics/flight.js';
import {
  sampleCrossfeed,
  samplePress,
  PRESS_RULES,
  sampleEjector,
  EJECTOR_RULES,
  CROSSFEED_RULES,
} from './mechanics.js';
export const COLOSSUS_FLIGHT_RULES = Object.freeze({
  gravity: 26,
  timeout: 8,
  missBelow: 80,
  missBeyond: 75,
  missLateral: 85,
  airAcceleration: 4,
  airYaw: 0.16,
  pitchTolerance: 1.05,
});
const model = createFlightModel(COLOSSUS_FLIGHT_RULES);
export function createColossusRuntime(context) {
  const { track } = context;
  let currentState = null;
  let contact = null;
  let lastContactTime = -Infinity;
  let disposed = false;
  const runtime = model.createRuntime(context, {
    id: 'colossus-industrial-flight',
    version: 1,
    rulesId:
      'colossus-flat-hazards-v8-grinders:' +
      JSON.stringify({
        geometry: track.geometryVersion,
        pace: track.pace,
        jumps: track.jumps,
        presses: track.presses,
        belts: track.belts,
        crossfeedRules: CROSSFEED_RULES,
        pressRules: PRESS_RULES,
        ejectors: track.ejectors,
        ejectorRules: EJECTOR_RULES,
        flight: model.rules,
      }),
    groundOptions: ({ state }) => {
      currentState = state;
      const belt = sampleCrossfeed(
        track,
        state.distance,
        state.lateral,
        state.time,
        state.speed,
      );
      return {
        pace: track.pace,
        surface: belt ? { ...belt, hazard: true } : {},
      };
    },
    forgivingContacts: true,
    automaticRecovery: context.playtest?.automaticRecovery !== false,
    testLaunch: Boolean(context.playtest),
    scenarios: Object.fromEntries(
      Object.entries(track.scenarios).map(([id, state]) => [
        id,
        { label: id.replaceAll('-', ' '), state: { ...state } },
      ]),
    ),
  });
  // Read the solved grounded pose, so flying over a belt never shakes the
  // camera. The tread phase comes from the same clock as the moving plates.
  function conveyorContact(state, events) {
    currentState = state;
    const belt =
      runtime.pose(1)?.grounded === false
        ? null
        : sampleCrossfeed(
            track,
            state.distance,
            state.lateral,
            state.time,
            state.speed,
          );
    if (!belt || belt.envelope < CROSSFEED_RULES.contactEnvelope) {
      if (contact)
        events.push({
          type: 'colossus-conveyor-exit',
          payload: { id: contact.id },
        });
      contact = null;
      return events;
    }
    const entry = contact?.id !== belt.id;
    contact = { id: belt.id, cell: belt.treadCell };
    if (state.time - lastContactTime >= CROSSFEED_RULES.contactInterval) {
      lastContactTime = state.time;
      events.push({
        type: 'colossus-conveyor-contact',
        payload: {
          id: belt.id,
          side: belt.side,
          contact: entry ? 'engage' : 'tread',
          intensity: belt.intensity,
          distance: state.distance,
          lateral: state.lateral,
        },
      });
    }
    return events;
  }
  // Decorate the existing finish hook in place: advance() still owns its
  // original subdivision, jump boundaries and pose history.
  const finishAdvance = runtime.finishAdvance;
  if (finishAdvance)
    runtime.finishAdvance = (state) =>
      conveyorContact(state, finishAdvance(state));
  return {
    ...runtime,
    advance(state, input, dt, modifiers) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return [];
      const events = runtime.advance(state, input, dt, modifiers);
      return finishAdvance ? events : conveyorContact(state, events);
    },
    snapshot() {
      return {
        ...runtime.snapshot(),
        crossfeedContact: {
          contact: contact && { ...contact },
          lastTime: Number.isFinite(lastContactTime) ? lastContactTime : null,
        },
      };
    },
    restore(data) {
      const saved = data?.crossfeedContact;
      if (
        !saved ||
        !(saved.lastTime === null || Number.isFinite(saved.lastTime)) ||
        !(
          saved.contact === null ||
          (track.belts.some((belt) => belt.id === saved.contact?.id) &&
            Number.isInteger(saved.contact?.cell))
        )
      )
        throw new Error('Invalid Colossus conveyor contact');
      runtime.restore(data);
      contact = saved.contact && { ...saved.contact };
      lastContactTime = saved.lastTime ?? -Infinity;
    },
    reset(args) {
      contact = null;
      lastContactTime = -Infinity;
      currentState = args.state;
      context.dynamics?.setMachineTime?.(args.state.time ?? 0);
      runtime.reset(args);
    },
    dispose() {
      disposed = true;
      contact = null;
      runtime.dispose();
    },
    avoidance() {
      const state = currentState;
      if (!state) return null;
      const distance =
        ((state.distance % track.length) + track.length) % track.length;
      const ejector = track.ejectors.find(
        (e) => e.distance - distance > -35 && e.distance - distance < 260,
      );
      if (ejector) {
        const arrival =
          state.time +
          Math.max(0, ejector.distance - distance) / Math.max(40, state.speed);
        const cycle = sampleEjector(arrival, ejector);
        // Pass behind a moving head. On approach, bias towards its departure side.
        if (cycle.warning || cycle.striking) return -ejector.side * 24;
        if (cycle.extension > 0.3) return -ejector.side * 22;
      }
      const press = track.presses.find(
        (p) => p.distance - distance > -30 && p.distance - distance < 220,
      );
      if (press) {
        const arrival =
          state.time +
          Math.max(0, press.distance - distance) / Math.max(40, state.speed);
        const sample = samplePress(arrival, press);
        if (sample.warning || sample.closure > 0.2)
          return -Math.sign(press.lateral) * 16;
      }
      const belt = track.belts.find(
        (b) => distance >= b.start - 130 && distance <= b.end,
      );
      return belt ? -belt.side * 19 : null;
    },
  };
}
