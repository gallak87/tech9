import test from 'node:test';
import assert from 'node:assert/strict';
import { createNomadTrack } from '../src/levels/nomad/track/model.js';
import { createDevices } from '../src/levels/nomad/devices.js';
import { isCombatDevice } from '../src/pickups/combat.js';
import {
  createPickupSimulation,
  VECTOR_PROPULSION,
} from '../src/pickups/simulation.js';
import { AEGIS_DURATION } from '../src/pickups/rules.js';

const track = createNomadTrack();
const devices = createDevices(track);

test('Nomad weapons leave full receiving and launch buffers with reachable shield counterplay', () => {
  for (const device of devices.filter((entry) => isCombatDevice(entry.type))) {
    const start = device.distance - device.length / 2;
    const end = device.distance + device.length / 2;
    for (const jump of track.jumps) {
      const landingEnd = Math.max(jump.landingEnd, jump.recovery);
      assert.ok(end < jump.takeoff || start > landingEnd, device.id);
      if (end < jump.takeoff)
        assert.ok(
          jump.takeoff - end >= (device.type === 'ion' ? 800 : 350),
          device.id,
        );
      if (start > landingEnd) assert.ok(start - landingEnd >= 150, device.id);
    }
    const shield = devices.findLast(
      (entry) => entry.type === 'aegis' && entry.distance < device.distance,
    );
    assert.ok(shield, `${device.id}: preceding shield`);
    assert.ok(
      (device.distance - shield.distance) / VECTOR_PROPULSION.cruiseSpeed <
        AEGIS_DURATION,
      `${device.id}: shield remains active through the weapon choice`,
    );
  }
});

test('the opening Vector and side-lane Arc activate independently and only once', () => {
  const arc = devices.find((entry) => entry.type === 'arc');
  const vector = devices.find((entry) => entry.id === 'nomad-tailforge-vector');
  assert.ok(
    Math.abs(arc.distance - vector.distance) < (arc.length + vector.length) / 2,
  );
  for (const lateral of [0, arc.lateral]) {
    let state = {
      distance: 300,
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
    while (state.distance < 430) {
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
