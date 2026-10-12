import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Scene, Vector3 } from 'three';
import { createDeviceRuntime } from '../pickups/runtime.js';
import { createTrack } from '../levels/halcyon/track/model.js';
import { createVehicleState, STEERING_ASSIST } from '../physics/index.js';
import { createHalcyonSimulationRuntime } from '../levels/halcyon/device-runtime.js';
import { createHalcyonDevices } from '../levels/halcyon/devices.js';
import { createRace } from './index.js';
import {
  createRacers,
  createRacerPresentation,
  getRacerControl,
  RACE_GRID,
} from './racers.js';

const dt = 1 / 120;
const track = createTrack();
const createHalcyonRacers = ({ track }) =>
  createRacers({
    track,
    devices: createHalcyonDevices(track),
    createRuntime: () => createHalcyonSimulationRuntime({ track }),
  });
const step = (racers, seconds, context) => {
  const events = [];
  for (let tick = 0; tick < Math.round(seconds / dt); tick++)
    events.push(...racers.advance(dt, context));
  return events;
};
function playerWithTwoLaps({ valid = true } = {}) {
  const playerState = createVehicleState();
  const playerRace = createRace(track);
  if (!valid) playerRace.recover();
  playerRace.step(0, track.length, 60);
  playerRace.step(track.length, track.length * 2, 59);
  playerState.distance = track.length * 2;
  return { playerState, playerRace };
}

test('staggered grid, pause and solo never award the rear grid a partial lap', () => {
  const racers = createHalcyonRacers({ track });
  racers.reset({ enabled: true });
  assert.equal(STEERING_ASSIST, 0.3);
  racers.opponents.forEach(({ specification, state }) => {
    assert.equal(state.distance, RACE_GRID[specification.id].distance);
    assert.equal(state.lateral, RACE_GRID[specification.id].lateral);
  });
  const parked = racers.serialize();
  for (const invalid of [0, -1, Infinity, NaN])
    assert.deepEqual(racers.advance(invalid), []);
  assert.deepEqual(racers.serialize(), parked);
  step(racers, 3);
  for (const opponent of racers.opponents) {
    assert.ok(opponent.state.distance > 0);
    assert.equal(opponent.race.lap, 1);
    assert.equal(opponent.race.valid, true);
    assert.equal(opponent.race.history.length, 0);
  }
  racers.reset({ enabled: false });
  const solo = racers.serialize();
  step(racers, 2);
  assert.deepEqual(racers.serialize(), solo);
  assert.deepEqual(racers.snapshot().standings, []);
  assert.equal(racers.snapshot().results, null);
  racers.dispose();
});

test('each opponent owns device eligibility, shield timers and reserve independently', () => {
  const racers = createHalcyonRacers({ track });
  racers.reset({ enabled: true });
  const [rook, latch, mule] = racers.opponents;
  Object.assign(rook.state, { distance: 359.7, lateral: 3, speed: 80 });
  rook.runtime.reset({ reason: 'scenario', state: rook.state });
  racers.advance(dt);
  assert.equal(rook.runtime.snapshot().aegisRemaining, 6);
  assert.equal(latch.runtime.snapshot().aegisRemaining, 0);
  assert.equal(mule.runtime.snapshot().aegisRemaining, 0);
  const borrowed = rook.runtime.snapshot();
  borrowed.used['aegis-crown'] = 999;
  assert.equal(rook.runtime.snapshot().used['aegis-crown'], 0);
  assert.ok(latch.runtime.snapshot().used['aegis-crown'] < 0);
  racers.dispose();
});

test('open practice never becomes a finished race after two laps', () => {
  const racers = createHalcyonRacers({ track });
  const context = playerWithTwoLaps();
  racers.reset({ enabled: false, ...context });
  const snapshot = racers.snapshot(context);
  assert.equal(snapshot.playerFinished, false);
  assert.equal(snapshot.results, null);
  assert.deepEqual(snapshot.standings, []);
  racers.dispose();
});

test('live relative timing covers the full field and keeps its order and gaps through rollback', () => {
  const racers = createHalcyonRacers({ track });
  const playerState = { ...createVehicleState(), ...RACE_GRID.player };
  const playerRace = createRace(track);
  const runtime = createHalcyonSimulationRuntime({ track });
  runtime.reset({ state: playerState });
  racers.reset({ enabled: true });
  const context = { playerState, playerRace };
  for (let tick = 0; tick < 120 * 20; tick++) {
    const previous = playerState.distance;
    const events = runtime.advance(
      playerState,
      getRacerControl(playerState, track, { pace: 0.65 }),
      dt,
    );
    runtime.update({});
    playerRace.step(previous, playerState.distance, dt, events);
    racers.advance(dt, context);
  }
  const { standings, relative } = racers.snapshot(context);
  assert.equal(relative.field.length, 4);
  assert.deepEqual(
    relative.field.map(({ id, position }) => ({ id, position })),
    standings.map(({ id, position }) => ({ id, position })),
  );
  const playerIndex = relative.field.findIndex(({ id }) => id === 'player');
  assert.ok(
    playerIndex > 1,
    'more than the nearest opponent must have a measured gap',
  );
  relative.field.forEach((entry, index) => {
    assert.equal(
      entry.direction,
      index === playerIndex ? 'self' : index < playerIndex ? 'ahead' : 'behind',
    );
    if (entry.id === 'player') assert.equal(entry.seconds, 0);
    else
      assert.ok(
        Number.isFinite(entry.seconds) && entry.seconds > 0,
        `${entry.id} has a real passage gap`,
      );
  });
  const saved = racers.serialize();
  step(racers, 2, context);
  racers.restore(saved);
  assert.deepEqual(racers.snapshot(context).relative, relative);
  runtime.dispose();
  racers.dispose();
});

test('racer rollback reproduces all controls, clocks, checkpoint and device state exactly', () => {
  const racers = createHalcyonRacers({ track });
  racers.reset({ enabled: true });
  step(racers, 14);
  const saved = racers.serialize();
  step(racers, 8);
  const expected = racers.serialize();
  racers.restore(saved);
  step(racers, 8);
  assert.deepEqual(racers.serialize(), expected);
  const malformed = structuredClone(saved);
  malformed.opponents[0].state.distance = NaN;
  assert.throws(() => racers.restore(malformed), /finite/);
  assert.deepEqual(
    racers.serialize(),
    expected,
    'a refused rollback must not partially change live opponents',
  );
  racers.dispose();
});

test('player completion keeps unfinished rivals honest and returns defensive results', () => {
  const racers = createHalcyonRacers({ track });
  racers.reset({ enabled: true });
  const context = playerWithTwoLaps();
  const events = racers.advance(dt, context);
  assert.equal(
    events.filter((event) => event.type === 'player-race-complete').length,
    1,
  );
  const result = racers.snapshot(context);
  assert.equal(result.playerFinished, true);
  assert.deepEqual(result.results.playerLapTimes, [60, 59]);
  assert.equal(result.results.playerTotalTime, 119);
  assert.equal(
    result.standings.find((entry) => entry.id === 'player').position,
    1,
  );
  for (const entry of result.standings.filter(
    (entry) => entry.id !== 'player',
  )) {
    assert.equal(entry.finished, false);
    assert.equal(entry.totalTime, null);
  }
  result.results.playerLapTimes[0] = -1;
  result.standings[0].lapTimes[0] = -1;
  assert.deepEqual(racers.snapshot(context).results.playerLapTimes, [60, 59]);
  context.playerRace.step(track.length * 2, track.length * 3, 70);
  context.playerState.distance = track.length * 3;
  assert.equal(
    racers
      .advance(dt, context)
      .filter((event) => event.type === 'player-race-complete').length,
    0,
  );
  assert.deepEqual(racers.snapshot(context).results.playerLapTimes, [60, 59]);
  racers.dispose();
});

test('invalid laps remain visible without claiming a timed placement', () => {
  const racers = createHalcyonRacers({ track });
  racers.reset({ enabled: true });
  const context = playerWithTwoLaps({ valid: false });
  racers.advance(dt, context);
  const snapshot = racers.snapshot(context);
  const player = snapshot.standings.find((entry) => entry.id === 'player');
  assert.equal(snapshot.playerFinished, true);
  assert.equal(player.valid, false);
  assert.equal(player.position, null);
  assert.deepEqual(player.lapValidity, [false, true]);
  assert.equal(snapshot.results.playerValid, false);
  racers.dispose();
});

test('actual-physics opponents complete two valid laps and keep driving after times latch', () => {
  const racers = createHalcyonRacers({ track });
  const playerState = { ...createVehicleState(), ...RACE_GRID.player };
  const playerRace = createRace(track);
  const runtime = createHalcyonSimulationRuntime({ track });
  runtime.reset({ state: playerState });
  racers.reset({ enabled: true });
  let playerImpacts = 0;
  const completes = [];
  for (let tick = 0; tick < 120 * 128; tick++) {
    const previous = playerState.distance;
    const events = runtime.advance(
      playerState,
      getRacerControl(playerState, track),
      dt,
    );
    runtime.update({});
    playerImpacts += events.filter((event) => event.type === 'impact').length;
    playerRace.step(previous, playerState.distance, dt, events);
    completes.push(...racers.advance(dt, { playerState, playerRace }));
  }
  const context = { playerState, playerRace };
  const first = racers.snapshot(context);
  assert.equal(
    playerImpacts,
    0,
    'verification driver must follow the real route without rail farming',
  );
  assert.equal(first.playerFinished, true);
  assert.equal(first.standings.length, 4);
  assert.deepEqual(
    first.standings.map((entry) => entry.position),
    [1, 2, 3, 4],
  );
  first.standings.forEach((entry) => {
    assert.equal(entry.finished, true);
    assert.equal(entry.valid, true);
    assert.equal(entry.lapTimes.length, 2);
    assert.ok(entry.totalTime > 75 && entry.totalTime < 110);
  });
  assert.equal(
    completes.filter((event) => event.type === 'racer-complete').length,
    3,
  );
  const latched = first.standings.map(({ id, totalTime }) => ({
    id,
    totalTime,
  }));
  const distances = racers.opponents.map(({ state }) => state.distance);
  step(racers, 3, context);
  racers.opponents.forEach(({ state }, index) =>
    assert.ok(state.distance > distances[index] + 150),
  );
  assert.deepEqual(
    racers
      .snapshot(context)
      .standings.map(({ id, totalTime }) => ({ id, totalTime })),
    latched,
  );
  runtime.dispose();
  racers.dispose();
});

test('rival presentation follows banked/inverted world frames and owns cleanup', async () => {
  const racers = createHalcyonRacers({ track });
  const scene = new Scene();
  const groups = [];
  let disposals = 0;
  const presentation = await createRacerPresentation({
    racers,
    scene,
    track,
    loadRival: async () => {
      const group = new Group();
      groups.push(group);
      return {
        group,
        dispose() {
          disposals++;
          group.removeFromParent();
        },
      };
    },
  });
  racers.reset({ enabled: true });
  const invertedDistance = track.scenarios['signature-inverted'].distance;
  const opponent = racers.opponents[0];
  opponent.state.distance = invertedDistance;
  opponent.prev = { ...opponent.state };
  presentation.update({ alpha: 1, mode: 'racing' });
  assert.equal(groups[0].visible, true);
  const frame = track.sample(invertedDistance);
  const position = frame.position
    .clone()
    .addScaledVector(frame.right, opponent.state.lateral)
    .addScaledVector(frame.up, 0.72);
  assert.ok(groups[0].position.distanceTo(position) < 1e-10);
  assert.ok(Math.abs(groups[0].quaternion.dot(frame.quaternion)) > 1 - 1e-10);
  presentation.update({ mode: 'fly' });
  assert.ok(groups.every((group) => !group.visible));
  presentation.update({ mode: 'paused' });
  assert.ok(groups.every((group) => group.visible));
  assert.ok(groups[0].position.distanceTo(position) < 1e-10);
  presentation.update({ mode: 'inspection' });
  assert.equal(groups[0].visible, false);
  presentation.dispose();
  presentation.dispose();
  assert.equal(disposals, 3);
  assert.equal(scene.children.length, 0);
  racers.dispose();
});

test('a rejected rival asset releases already loaded racing meshes', async () => {
  const racers = createHalcyonRacers({ track });
  const scene = new Scene();
  let disposals = 0;
  await assert.rejects(
    createRacerPresentation({
      racers,
      scene,
      track,
      loadRival: async (id) => {
        if (id === 'latch') throw new Error('missing rival');
        const group = new Group();
        return {
          group,
          dispose() {
            disposals++;
            group.removeFromParent();
          },
        };
      },
    }),
    /missing rival/,
  );
  assert.equal(disposals, 1);
  assert.equal(scene.children.length, 0);
  racers.dispose();
});

function timedDifficulty(difficulty) {
  const racers = createHalcyonRacers({ track });
  racers.reset({ enabled: true, difficulty });
  for (let tick = 0; tick < 120 * 140; tick++) {
    racers.advance(dt);
    if (racers.opponents.every((opponent) => opponent.finish)) break;
  }
  const saved = racers.serialize();
  racers.dispose();
  return saved;
}

// Physical clean-driving reference: the same Kestrel, reserve and strip rules,
// steering on the centre line, full throttle/boost, and no braking or recovery.
function cleanKestrelTime() {
  const state = { ...createVehicleState(), ...RACE_GRID.player };
  const runtime = createHalcyonSimulationRuntime({ track });
  const race = createRace(track);
  runtime.reset({ state });
  let impacts = 0;
  for (let tick = 0; tick < 120 * 140 && race.history.length < 2; tick++) {
    const input = {
      ...getRacerControl(state, track, {
        difficulty: 'hard',
        devices: createHalcyonDevices(track),
      }),
      throttle: 1,
      brake: 0,
      boost: true,
    };
    const previous = state.distance;
    const events = runtime.advance(state, input, dt);
    impacts += events.filter((event) => event.type === 'impact').length;
    runtime.update({});
    race.step(previous, state.distance, dt, events);
  }
  runtime.dispose();
  assert.equal(impacts, 0, 'the calibration reference must be clean');
  assert.equal(race.history.length, 2);
  assert.ok(race.history.every((lap) => lap.valid));
  return race.history.reduce((sum, lap) => sum + lap.duration, 0);
}

test('difficulty ladder is faster throughout and hard stays close to a clean boosted Kestrel', () => {
  const easy = timedDifficulty('easy');
  const medium = timedDifficulty('medium');
  const hard = timedDifficulty('hard');
  for (let index = 0; index < 3; index++) {
    const gentle = easy.opponents[index];
    const quick = medium.opponents[index];
    const fastest = hard.opponents[index];
    for (const opponent of [gentle, quick, fastest]) {
      assert.equal(opponent.finish?.valid, true);
      assert.ok(opponent.state.energy >= 0 && opponent.state.energy <= 100);
    }
    assert.ok(
      gentle.finish.totalTime < 105,
      'easy must improve on the old 116–119s field',
    );
    assert.ok(
      quick.finish.totalTime < gentle.finish.totalTime * 0.92,
      `${quick.id}: medium must be meaningfully faster`,
    );
    assert.ok(
      fastest.finish.totalTime < quick.finish.totalTime,
      `${quick.id}: hard must be faster again`,
    );
  }
  const clean = cleanKestrelTime();
  const winner = Math.min(
    ...hard.opponents.map((opponent) => opponent.finish.totalTime),
  );
  assert.ok(winner > clean, 'a clean Kestrel run can still win');
  assert.ok(
    winner < clean * 1.04,
    'hard leaves less than 4% margin for mistakes',
  );
});

test('hard spends its own reserve regardless of player boost input and rolls back exactly', () => {
  const racers = createHalcyonRacers({ track });
  racers.reset({ enabled: true, difficulty: 'hard' });
  step(racers, 24, { playerInput: { boost: false } });
  const independent = racers.serialize();
  assert.ok(
    independent.opponents.every((opponent) => opponent.boostSeconds > 2),
  );
  racers.reset({ enabled: true, difficulty: 'hard' });
  step(racers, 24, { playerInput: { boost: true } });
  assert.deepEqual(
    racers.serialize(),
    independent,
    'player boost input cannot grant or withhold rival performance',
  );
  step(racers, 6);
  const expected = racers.serialize();
  racers.restore(independent);
  step(racers, 6);
  assert.deepEqual(racers.serialize(), expected);
  assert.throws(
    () => racers.restore({ ...independent, difficulty: 'other' }),
    /mismatch/,
  );
  assert.deepEqual(racers.serialize(), expected);
  assert.throws(() => racers.reset({ difficulty: 'other' }), /difficulty/);
  racers.dispose();
});

for (const difficulty of ['easy', 'medium', 'hard']) {
  test(`${difficulty} AI receives and retains the same full strip boost as a player`, () => {
    const straight = {
      id: 'vector-parity',
      length: 1000,
      width: 24,
      sample: (distance) => ({
        position: new Vector3(0, 0, distance),
        tangent: new Vector3(0, 0, 1),
        right: new Vector3(1, 0, 0),
        up: new Vector3(0, 1, 0),
        curvature: 0,
        bank: 0,
      }),
    };
    const devices = [
      {
        id: 'strip',
        type: 'vector',
        distance: 70,
        lateral: 0,
        length: 54,
        width: 14,
      },
    ];
    const run = (ai) => {
      const runtime = createDeviceRuntime({ track: straight, devices });
      const state = { ...createVehicleState(), speed: 95, energy: 0 };
      runtime.reset({ state });
      let activations = 0,
        cancelled = 0,
        peak = 0;
      const speeds = [];
      while (state.distance < 150) {
        const input = ai
          ? getRacerControl(state, straight, { devices, difficulty, runtime })
          : { throttle: 1 };
        const events = runtime.advance(state, input, dt);
        runtime.update({});
        activations += events.filter(
          (event) => event.type === 'pickup-activate',
        ).length;
        cancelled += events.filter(
          (event) => event.type === 'pickup-cancel',
        ).length;
        peak = Math.max(peak, state.speed);
        speeds.push(state.speed);
      }
      runtime.dispose();
      return { speeds, peak, activations, cancelled };
    };
    const player = run(false),
      rival = run(true);
    assert.equal(rival.activations, 1);
    assert.equal(rival.cancelled, 0);
    assert.ok(
      rival.peak * 3.6 > 599,
      'AI reaches the full 600 km/h catapult target',
    );
    assert.deepEqual(
      rival.speeds,
      player.speeds,
      'AI controls never cancel or brake away the strip benefit',
    );
  });
}
