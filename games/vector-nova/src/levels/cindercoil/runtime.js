import { Vector3 } from 'three';
import { createFlightModel } from '../../physics/flight.js';
import {
  CINDERCOIL_RULES,
  sampleCindercoilEvent,
  surgeAt,
  sampleSpill,
} from './mechanics.js';

export const CINDERCOIL_FLIGHT_RULES = Object.freeze({
  railHeight: Object.freeze({ 'vent-launch': 3.36 }),
  railOffset: Object.freeze({ 'vent-launch': 2.3 }),
});

export function createCindercoilRuntime(context) {
  const { track } = context;
  const model = createFlightModel(CINDERCOIL_FLIGHT_RULES);
  let contactSeconds = 0;
  let contactId = null;
  let disposed = false;
  const flight = model.createRuntime(context, {
    id: 'cindercoil-volcanic',
    version: 1,
    rulesId: `cindercoil-v1:${JSON.stringify({ geometry: track.geometryVersion, flight: model.rules, jumps: track.jumps, zones: track.surgeZones, rules: CINDERCOIL_RULES })}`,
    groundOptions: ({ state }) => ({
      surface: {
        drag: surgeAt(track, state)?.contact ? CINDERCOIL_RULES.surgeDrag : 0,
      },
    }),
    launchImpulse: ({ time }) =>
      new Vector3(
        0,
        sampleCindercoilEvent(time).vent * CINDERCOIL_RULES.ventImpulse,
        0,
      ),
  });
  const scenarios = Object.fromEntries(
    Object.entries(track.scenarios).map(([id, state]) => [
      id,
      { label: id.replaceAll('-', ' '), state: { ...state } },
    ]),
  );
  for (const [index, zone] of (track.surgeZones ?? []).entries()) {
    for (const [line, side] of [
      ['protected', -1],
      ['exposed', 1],
    ]) {
      scenarios[`surge${index + 1}-${line}`] = {
        label: `Surge ${index + 1} · ${line} line`,
        state: {
          distance:
            zone.kind === 'spill'
              ? (zone.start + zone.end) / 2
              : zone.start + 8,
          lateral:
            zone.kind === 'spill'
              ? line === 'exposed'
                ? sampleSpill(zone, (zone.start + zone.end) / 2).center
                : -zone.side * 8.5
              : side * zone.side * 8.5,
          speed: 45,
          time: (((4 - zone.phaseOffset) % 13) + 13) % 13,
        },
      };
    }
  }
  for (const [name, section] of [
    ['rupture-near', 'curtain'],
    ['rupture-middle', 'ember'],
    ['rupture-far', 'crown'],
  ]) {
    scenarios[name] = {
      label: name.replaceAll('-', ' '),
      state: { ...track.scenarios[`${section}-showcase`], time: 13 },
    };
  }
  const spill = track.surgeZones.find((z) => z.kind === 'spill');
  for (const [name, distance] of [
    ['spill-approach', spill.start - 95],
    ['spill-crossing', (spill.start + spill.end) / 2],
    ['spill-source', spill.end - 10],
    ['spill-outfall', spill.start + 10],
  ])
    scenarios[name] = {
      label: name.replaceAll('-', ' '),
      state: { distance, lateral: 0, speed: 0, time: 7 },
    };
  scenarios['coil-entry'] = {
    label: 'Furnace Coil · full roll entry',
    state: { distance: track.landmarks.coil.start + 4, speed: 62, time: 5 },
  };
  const jump = track.jumps[0];
  scenarios['vent-clean'] = {
    label: 'Vent · calm crossing',
    state: { distance: jump.takeoff - 3, speed: 102, time: 7 },
  };
  scenarios['vent-short'] = {
    label: 'Vent · short transfer and recovery',
    state: { distance: jump.takeoff - 3, speed: 45, time: 7 },
  };
  for (const [name, side] of [
    ['left', -1],
    ['right', 1],
  ])
    scenarios[`vent-edge-${name}`] = {
      label: `Vent · ${name} barrier catch`,
      state: {
        distance: jump.takeoff - 0.01,
        speed: 102,
        time: 7,
        lateral: side * 12,
        heading: side * 0.02,
      },
    };
  scenarios['vent-erupting'] = {
    label: 'Vent · erupting crossing',
    state: { distance: jump.takeoff - 3, speed: 102, time: 3 },
  };
  return {
    ...flight,
    scenarios,
    advance(state, input, dt) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return [];
      const events = [];
      const elapsed = Math.min(dt, 0.1);
      const count = Math.ceil(elapsed * 120 - 1e-10);
      for (let tick = 0; tick < count; tick++) {
        const step = elapsed / count;
        const contact = surgeAt(track, state);
        const pose = flight.pose(1);
        const touching = (!pose || pose.grounded) && contact?.contact;
        events.push(...flight.advance(state, input, step));
        if (touching) {
          state.energy = Math.max(
            0,
            state.energy - CINDERCOIL_RULES.reserveDrain * step,
          );
          contactSeconds += step;
          if (contactId !== contact.zone.id)
            events.push({
              type: 'lava-contact',
              payload: {
                id: contact.zone.id,
                drag: CINDERCOIL_RULES.surgeDrag,
                reserveDrain: CINDERCOIL_RULES.reserveDrain,
              },
            });
          contactId = contact.zone.id;
        } else contactId = null;
      }
      return events;
    },
    reset(args) {
      contactSeconds = 0;
      contactId = null;
      flight.reset(args);
    },
    snapshot() {
      return { flight: flight.snapshot(), contactSeconds, contactId };
    },
    restore(data) {
      if (
        !data ||
        !Number.isFinite(data.contactSeconds) ||
        data.contactSeconds < 0 ||
        (data.contactId !== null &&
          !track.surgeZones.some((zone) => zone.id === data.contactId))
      )
        throw new Error('Invalid Cindercoil hazard snapshot.');
      flight.restore(data.flight);
      contactSeconds = data.contactSeconds;
      contactId = data.contactId;
    },
    dispose() {
      disposed = true;
      flight.dispose();
    },
  };
}
