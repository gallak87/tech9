import test from 'node:test';
import assert from 'node:assert/strict';
import { createCupFinish } from './cup-finish.js';
import { createTrack } from '../levels/halcyon/track/model.js';
import { createHalcyonSimulationRuntime } from '../levels/halcyon/device-runtime.js';
import { createVehicleState } from '../physics/index.js';
import { createRace } from '../race/index.js';
import { createRacers } from '../race/racers.js';
import { classifyCupRace } from '../race/cup.js';

test('fast-forward preserves the full 30 simulated seconds and the finish beat', () => {
  let ticks = 0;
  const finish = createCupFinish({
    simulationTime: () => 100 + ticks / 120,
    allFinished: () => false,
    step: () => ticks++,
    now: () => 0,
  });
  let progress;
  for (let frame = 0; frame < 15; frame++) progress = finish.advance(1 / 60);
  assert.equal(ticks, 3600);
  assert.deepEqual(progress, { complete: true, ready: false });
  assert.deepEqual(finish.advance(2.2), { complete: true, ready: true });
  finish.advance(10);
  assert.equal(
    ticks,
    3600,
    'classification never continues after the deadline',
  );
});

test('slow work yields to the browser without prematurely classifying the field', () => {
  let ticks = 0,
    clock = 0;
  const finish = createCupFinish({
    simulationTime: () => ticks / 120,
    allFinished: () => ticks === 12,
    step: () => {
      ticks++;
      clock += 5;
    },
    now: () => clock,
  });
  assert.deepEqual(finish.advance(3), { complete: false, ready: false });
  assert.equal(ticks, 3);
  // A pause simply stops pumping; elapsed wall time cannot consume race time.
  clock += 60000;
  assert.deepEqual(finish.advance(0), { complete: false, ready: false });
  assert.equal(ticks, 6);
  finish.advance(0);
  assert.deepEqual(finish.advance(0), { complete: true, ready: true });
  assert.equal(ticks, 12, 'the final finisher stops simulation immediately');
});

test('an already finished field keeps the banner without advancing physics', () => {
  const finish = createCupFinish({
    simulationTime: () => 100,
    allFinished: () => true,
    step: () => assert.fail('no remaining race'),
  });
  assert.deepEqual(finish.advance(1), { complete: true, ready: false });
  assert.deepEqual(finish.advance(1.4), { complete: true, ready: true });
});

test('fixed-tick fast-forward retains actual rival times, points, invalid finishes and DNFs', () => {
  const track = createTrack();
  const racers = createRacers({
    track,
    createRuntime: () => createHalcyonSimulationRuntime({ track }),
  });
  const playerState = { ...createVehicleState(), distance: track.length * 2 };
  const playerRace = createRace(track);
  playerRace.step(0, track.length, 60);
  playerRace.step(track.length, track.length * 2, 59);
  const context = { playerState, playerRace };
  try {
    racers.reset({ ...context, enabled: true });
    racers.opponents.forEach((opponent, i) => {
      const distance = i === 8 ? 0 : track.length * 1.85 - i * 45;
      opponent.race.step(0, distance, 119);
      if (i === 0) opponent.race.recover();
      Object.assign(opponent.state, { distance, speed: 90 });
      opponent.runtime.reset({ reason: 'scenario', state: opponent.state });
    });
    const initial = racers.serialize();
    const results = () => classifyCupRace(racers.snapshot(context).results);
    for (let tick = 0; tick < 3600; tick++) racers.advance(1 / 120, context);
    const expected = results();
    assert.ok(
      expected.some((row) => row.status === 'finished' && row.id !== 'player'),
    );
    assert.ok(expected.some((row) => row.status === 'invalid'));
    assert.ok(expected.some((row) => row.status === 'dnf'));
    racers.restore(initial);
    let ticks = 0;
    const finish = createCupFinish({
      simulationTime: () => ticks / 120,
      allFinished: () => racers.opponents.every((racer) => racer.finish),
      step: () => {
        racers.advance(1 / 120, context);
        ticks++;
      },
      now: () => 0,
    });
    while (!finish.advance(1 / 60).complete) {
      /* bounded frames */
    }
    assert.deepEqual(results(), expected);
  } finally {
    racers.dispose();
  }
});
