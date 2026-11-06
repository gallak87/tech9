import test from 'node:test';
import assert from 'node:assert/strict';
import { createCupFinish } from './cup-finish.js';
import { createTrack } from '../levels/halcyon/track/model.js';
import { createHalcyonSimulationRuntime } from '../levels/halcyon/device-runtime.js';
import { createVehicleState } from '../physics/index.js';
import { createRace } from '../race/index.js';
import { createRacers } from '../race/racers.js';
import { classifyCupRace } from '../race/cup.js';

test('results open while the field continues at the ordinary simulation rate', () => {
  let simulationTime = 100;
  const finish = createCupFinish({
    simulationTime: () => simulationTime,
    allFinished: () => false,
  });
  for (let frame = 0; frame < 150; frame++) {
    simulationTime += 1 / 60;
    finish.advance(1 / 60);
  }
  assert.deepEqual(finish.advance(0), { complete: false, ready: true });
  assert.ok(
    Math.abs(simulationTime - 102.5) < 1e-8,
    'presentation cannot advance physics',
  );
  simulationTime = 129.99;
  assert.equal(finish.advance(0).complete, false);
  simulationTime = 130;
  assert.equal(finish.advance(0).complete, true);
});

test('a pause cannot consume the classification deadline', () => {
  let simulationTime = 0;
  const finish = createCupFinish({
    simulationTime: () => simulationTime,
    allFinished: () => false,
  });
  assert.deepEqual(finish.advance(60), { complete: false, ready: true });
  simulationTime = 29;
  assert.equal(finish.advance(0).complete, false);
  simulationTime = 30;
  assert.equal(finish.advance(0).complete, true);
});

test('the final rival classifies the field while the finish banner keeps its beat', () => {
  let finished = false;
  const finish = createCupFinish({
    simulationTime: () => 100,
    allFinished: () => finished,
  });
  assert.deepEqual(finish.advance(1), { complete: false, ready: false });
  finished = true;
  assert.deepEqual(finish.advance(1.4), { complete: true, ready: true });
});

test('live classification retains actual rival times, points, invalid finishes and DNFs', () => {
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
    });
    while (!finish.advance(1 / 60).complete) {
      for (let i = 0; i < 2; i++) {
        racers.advance(1 / 120, context);
        ticks++;
      }
    }
    assert.equal(
      ticks,
      3600,
      'the full grace period runs at two ticks per rendered 60Hz frame',
    );
    assert.deepEqual(results(), expected);
  } finally {
    racers.dispose();
  }
});
