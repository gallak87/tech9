import test from 'node:test';
import assert from 'node:assert/strict';
import createLevel from '../src/levels/helion/index.js';
import { createRacers } from '../src/race/racers.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
const level = createLevel({});
const track = level.createTrack();
const devices = level.racing.createDevices(track);
const createRuntime = () =>
  createDeviceRuntime({
    track,
    devices,
    motion: level.racing.createMotion({
      track,
      presentation: false,
      settings: { steeringAssist: 0.3 },
    }),
  });

for (const difficulty of ['easy', 'medium', 'hard'])
  test(`Helion ${difficulty}: all three physical rivals traverse all furnaces and shield wall, finish two valid laps`, () => {
    const racers = createRacers({ track, devices, createRuntime });
    const traversals = {};
    try {
      racers.reset({ enabled: true, difficulty });
      for (const o of racers.opponents) {
        traversals[o.specification.id] = new Set();
        const advance = o.runtime.advance.bind(o.runtime);
        o.runtime.advance = (...args) => {
          const before = args[0].distance;
          const events = advance(...args);
          const after = args[0].distance;
          for (const zone of [
            ...track.thermalZones.filter((z) => z.kind === 'furnace'),
            {
              id: 'wall',
              start: track.wallRide.holdStart,
              end: track.wallRide.holdEnd,
            },
          ]) {
            for (let lap = 0; lap < 2; lap++) {
              const middle = (zone.start + zone.end) / 2 + lap * track.length;
              if (
                before <= middle &&
                after >= middle &&
                o.runtime.pose(1)?.grounded !== false
              )
                traversals[o.specification.id].add(`${zone.id}:${lap}`);
            }
          }
          return events;
        };
      }
      for (let tick = 0; tick < 120 * 300; tick++) {
        racers.advance(1 / 120, {
          playerInput: { boost: difficulty === 'hard' && tick % 1200 < 240 },
        });
        if (racers.opponents.every((o) => o.race.history.length >= 2)) break;
      }
      for (const o of racers.opponents) {
        assert.equal(
          o.race.history.length,
          2,
          `${o.specification.id} two laps`,
        );
        assert.ok(o.race.history.every((l) => l.valid));
        assert.equal(traversals[o.specification.id].size, 8);
      }
      const saved = racers.serialize();
      for (let t = 0; t < 90; t++) racers.advance(1 / 120);
      const expected = racers.serialize();
      racers.restore(saved);
      for (let t = 0; t < 90; t++) racers.advance(1 / 120);
      assert.deepEqual(racers.serialize(), expected);
      racers.reset({ enabled: false, difficulty });
      const solo = racers.serialize();
      for (let t = 0; t < 120; t++) racers.advance(1 / 120);
      assert.deepEqual(racers.serialize(), solo);
    } finally {
      racers.dispose();
    }
  });

import { createVehicleState } from '../src/physics/index.js';

test('Helion hardware contacts apply propulsion, shield protection and deterministic continuation', () => {
  for (const device of devices) {
    const runtime = createRuntime();
    const state = {
      ...createVehicleState(),
      distance: device.distance - device.length / 2 - 8,
      lateral: device.lateral,
      speed: 60,
    };
    try {
      runtime.reset({ state });
      const events = [];
      for (let tick = 0; tick < 50; tick++)
        events.push(...runtime.advance(state, { throttle: 1 }, 1 / 120));
      assert.ok(
        events.some(
          (e) => e.type === 'pickup-activate' && e.payload.kind === device.type,
        ),
      );
      if (device.type === 'vector') assert.ok(state.speed > 150);
      const saved = { state: { ...state }, runtime: runtime.snapshot() };
      const continuation = () => {
        const events = [];
        for (let tick = 0; tick < 100; tick++)
          events.push(...runtime.advance(state, { throttle: 1 }, 1 / 120));
        return { state: { ...state }, runtime: runtime.snapshot(), events };
      };
      const expected = continuation();
      Object.assign(state, saved.state);
      runtime.restore(saved.runtime);
      assert.deepEqual(continuation(), expected);
    } finally {
      runtime.dispose();
    }
  }
});

test('Helion forwards Aegis into actual rail impacts without changing collision separation', () => {
  const device = devices.find((d) => d.type === 'aegis');
  const runtime = createRuntime();
  const bare = level.racing.createMotion({ track });
  const state = {
    ...createVehicleState(),
    distance: device.distance - 15,
    lateral: device.lateral,
    speed: 60,
  };
  try {
    runtime.reset({ state });
    for (let i = 0; i < 45; i++)
      runtime.advance(state, { throttle: 1 }, 1 / 120);
    assert.ok(runtime.snapshot().aegisRemaining > 0);
    Object.assign(state, { lateral: 13, heading: 0.25, speed: 85 });
    const plain = { ...state };
    bare.restore(runtime.snapshot().motion);
    const shielded = [],
      unshielded = [];
    for (let i = 0; i < 20; i++) {
      shielded.push(...runtime.advance(state, { steer: -1 }, 1 / 120));
      unshielded.push(...bare.advance(plain, { steer: -1 }, 1 / 120));
    }
    assert.ok(shielded.some((e) => e.type === 'impact' && e.payload.shielded));
    assert.ok(
      unshielded.some((e) => e.type === 'impact' && !e.payload.shielded),
    );
    assert.ok(state.energy > plain.energy);
    assert.equal(state.lateral, plain.lateral);
    assert.equal(state.speed, plain.speed);
    assert.equal(runtime.snapshot().aegisRemaining, 0);
  } finally {
    runtime.dispose();
    bare.dispose();
  }
});
