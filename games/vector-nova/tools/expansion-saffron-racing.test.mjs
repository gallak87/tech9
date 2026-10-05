import test from 'node:test';
import assert from 'node:assert/strict';
import createLevel from '../src/levels/saffron/index.js';
import { createRacers } from '../src/race/racers.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { createVehicleState } from '../src/physics/index.js';
import { sampleSaffronAtmosphere } from '../src/levels/saffron/atmosphere.js';
import { grazerTrigger } from '../src/levels/saffron/grazer.js';
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
  test(`Saffron ${difficulty}: all three physical rivals land both gaps and finish two valid laps`, () => {
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
      for (let tick = 0; tick < 120 * 220; tick++) {
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
        const mandatory = landings[o.specification.id].filter(
          (e) => e.id !== 'dune-skip',
        );
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

test('Saffron device catapults use actual flight and replay through an airborne snapshot', () => {
  for (const jump of track.jumps.filter((j) => !j.optional)) {
    const runtime = createRuntime();
    const state = {
      ...createVehicleState(),
      distance: jump.takeoff - 0.5,
      speed: 600 / 3.6,
    };
    try {
      runtime.reset({ state });
      for (let t = 0; t < 20; t++) runtime.advance(state, {}, 1 / 120);
      assert.equal(runtime.snapshot().mode, 'flight');
      const saved = { state: { ...state }, runtime: runtime.snapshot() };
      const continuation = () => {
        const events = [];
        for (let t = 0; t < 500; t++)
          events.push(...runtime.advance(state, {}, 1 / 120));
        assert.equal(
          events.find((e) => e.type === 'jump-transfer')?.payload.outcome,
          'landed',
        );
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

test('Saffron atmosphere clears in sheltered skull and follows deterministic sand exposure', () => {
  const skull = sampleSaffronAtmosphere(track, {
    distance: track.landmarks.skullCenter,
    time: 32,
  });
  assert.equal(skull.shelter, 1);
  assert.ok(skull.exposure < 0.04);
  const sand = sampleSaffronAtmosphere(track, track.scenarios['sand-deep']);
  const glass = sampleSaffronAtmosphere(track, track.scenarios['sand-glass']);
  assert.ok(sand.exposure > glass.exposure);
  assert.deepEqual(
    sand,
    sampleSaffronAtmosphere(track, track.scenarios['sand-deep']),
  );
});

test('Saffron grazer triggers once per lap and preserves its epoch through stop, recovery and replay restore', () => {
  const runtime = createRuntime();
  const state = {
    ...createVehicleState(),
    distance: grazerTrigger(track) - 0.2,
    speed: 100,
  };
  const grazer = () => runtime.snapshot().motion.saffron.grazer;
  try {
    runtime.reset({ reason: 'fresh-lap', state });
    assert.equal(grazer().startedAt, null);
    runtime.advance(state, {}, 1 / 120);
    const first = grazer();
    assert.equal(first.lap, 0);
    assert.ok(first.startedAt >= 0 && first.startedAt <= state.time);
    state.speed = 0;
    const saved = JSON.parse(
      JSON.stringify({ state, runtime: runtime.snapshot() }),
    );
    for (let tick = 0; tick < 240; tick++) runtime.advance(state, {}, 1 / 120);
    const expected = JSON.parse(
      JSON.stringify({ state, runtime: runtime.snapshot() }),
    );
    assert.ok(
      state.time > first.startedAt + 1.9,
      'simulation time continues while the car stops',
    );
    assert.deepEqual(grazer(), first);
    Object.assign(state, saved.state);
    runtime.restore(saved.runtime);
    for (let tick = 0; tick < 240; tick++) runtime.advance(state, {}, 1 / 120);
    assert.deepEqual(
      JSON.parse(JSON.stringify({ state, runtime: runtime.snapshot() })),
      expected,
    );
    runtime.reset({ reason: 'manual-recover', state });
    assert.deepEqual(grazer(), first);
    // Re-entering this lap's trigger after backing up/recovery cannot replay it.
    state.distance = grazerTrigger(track) - 0.2;
    state.speed = 100;
    runtime.advance(state, {}, 1 / 120);
    assert.deepEqual(grazer(), first);
    state.distance = track.length + grazerTrigger(track) - 0.2;
    runtime.advance(state, {}, 1 / 120);
    assert.equal(grazer().lap, 1);
    assert.ok(grazer().startedAt > first.startedAt);
    state.distance = 0;
    state.time = 0;
    runtime.reset({ reason: 'fresh-lap', state });
    assert.deepEqual(grazer(), { lap: -1, startedAt: null });
    Object.assign(state, track.scenarios['burrower-breach']);
    runtime.reset({ reason: 'scenario', scenario: 'burrower-breach', state });
    assert.equal(state.time - grazer().startedAt, 8);
  } finally {
    runtime.dispose();
  }
});
