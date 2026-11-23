import test from 'node:test';
import assert from 'node:assert/strict';
import { createNomadTrack } from '../src/levels/nomad/track/model.js';
import { createDevices } from '../src/levels/nomad/devices.js';
import { COMBAT_RULES, isCombatDevice } from '../src/pickups/combat.js';
import {
  createPickupSimulation,
  VECTOR_PROPULSION,
} from '../src/pickups/simulation.js';

const track = createNomadTrack();
const devices = createDevices(track);

test('every Nomad transfer has a usable attack approach and the gates stay on supported road', () => {
  const attacks = devices.filter((entry) => isCombatDevice(entry.type));
  const charge = {
    arc: COMBAT_RULES.arcDelay,
    ion: COMBAT_RULES.wakeDuration,
    repulsor: COMBAT_RULES.pulseDelay,
  };
  for (const jump of track.jumps) {
    const carrier = track.carriers.find(
      (entry) => entry.id === jump.departureCarrierId,
    );
    assert.ok(
      attacks.some(
        ({ distance }) => distance > carrier.start && distance < jump.takeoff,
      ),
      `${carrier.name} offers an attack before takeoff`,
    );
  }
  for (const device of attacks) {
    const start = device.distance - device.length / 2;
    const end = device.distance + device.length / 2;
    for (const jump of track.jumps) {
      const landingEnd = Math.max(jump.landingEnd, jump.recovery);
      assert.ok(end < jump.takeoff || start > landingEnd, device.id);
      if (end < jump.takeoff)
        assert.ok(
          jump.takeoff - end >=
            charge[device.type] * VECTOR_PROPULSION.cruiseSpeed,
          device.id,
        );
      if (start > landingEnd) assert.ok(start - landingEnd > 8, device.id);
    }
  }
  for (const { id, distance, lateral, length, width } of devices)
    for (const end of [-length / 2, length / 2])
      for (const edge of [-width / 2, width / 2])
        assert.equal(
          track.surfaceCoverage(distance + end, lateral + edge),
          1,
          id,
        );
});

test('the opening Vector and side-lane Arc activate independently and only once', () => {
  const arc = devices.find((entry) => entry.type === 'arc');
  const vector = devices.find((entry) => entry.id === 'nomad-tailforge-vector');
  const start = Math.min(
    arc.distance - arc.length / 2,
    vector.distance - vector.length / 2,
  );
  const end = Math.max(
    arc.distance + arc.length / 2,
    vector.distance + vector.length / 2,
  );
  for (const lateral of [0, arc.lateral]) {
    let state = {
      distance: start - 10,
      lateral,
      heading: 0,
      speed: 100,
      grounded: true,
    };
    const simulation = createPickupSimulation({
      trackLength: track.length,
      closed: false,
      devices,
      vehicle: state,
    });
    const activations = [];
    while (state.distance < end + 10) {
      const next = { ...state, distance: state.distance + 5 };
      const before = simulation.beforeStep({ throttle: 1 }, 0.05, state);
      activations.push(
        ...before.events,
        ...simulation.afterStep(state, next, { throttle: 1 }),
      );
      state = next;
    }
    const count = (id) =>
      activations.filter(
        (event) =>
          event.type === 'pickup-activate' && event.payload.deviceId === id,
      ).length;
    assert.equal(count(vector.id), lateral === 0 ? 1 : 0);
    assert.equal(count(arc.id), lateral === 0 ? 0 : 1);
  }
});
