import test from 'node:test';
import assert from 'node:assert/strict';
import createLevel from '../src/levels/zephyr/index.js';
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
  test(`Zephyr ${difficulty}: all three physical rivals land both gaps and finish two valid laps`, () => {
    const racers = createRacers({ track, devices, createRuntime });
    const landings = {};
    try {
      racers.reset({ enabled: true, difficulty });
      for (const o of racers.opponents) {
        landings[o.specification.id] = [];
        const advance = o.runtime.advance.bind(o.runtime);
        o.runtime.advance = (...args) => {
          const events = advance(...args);
          for (const e of events)
            if (e.type === 'jump-transfer')
              landings[o.specification.id].push(e.payload);
          return events;
        };
      }
      for (let tick = 0; tick < 120 * 260; tick++) {
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
        const mandatory = landings[o.specification.id];
        assert.equal(mandatory.length, 4);
        assert.ok(
          mandatory.every((e) => e.outcome === 'landed'),
          JSON.stringify(mandatory),
        );
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

test('Zephyr hardware contacts apply propulsion, shield protection and deterministic continuation', () => {
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
      let maximum = state.speed;
      for (let tick = 0; tick < 50; tick++) {
        events.push(...runtime.advance(state, { throttle: 1 }, 1 / 120));
        maximum = Math.max(maximum, state.speed);
      }
      assert.ok(
        events.some(
          (e) => e.type === 'pickup-activate' && e.payload.kind === device.type,
        ),
      );
      if (device.type === 'vector') assert.ok(maximum > 160, device.id);
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

test('Zephyr forwards Aegis into actual rail impacts without changing collision separation', () => {
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

test('opponents never take ownership of player wetness or tower presentation', () => {
  const player = level.createRuntime({ track });
  const owner = track.zephyrPresentation;
  const opponent = createRuntime();
  const state = {
    ...createVehicleState(),
    distance: track.curtains[0].s - 0.2,
    speed: 112,
  };
  opponent.reset({ state });
  for (let i = 0; i < 60; i++)
    opponent.advance(state, { throttle: 1 }, 1 / 120);
  assert.equal(track.zephyrPresentation, owner);
  assert.equal(owner.wetStart, null);
  opponent.dispose();
  player.dispose();
});
