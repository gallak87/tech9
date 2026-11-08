import test from 'node:test';
import assert from 'node:assert/strict';
import { createRace } from './index.js';
import {
  captureRaceProgress,
  restoreRaceProgress,
  captureOwnedRace,
  restoreOwnedRace,
} from './checkpoint.js';

const track = {
  id: 'codec',
  length: 1000,
  width: 30,
  checkpoints: [
    { distance: 0 },
    { distance: 250 },
    { distance: 500 },
    { distance: 750 },
  ],
};
const progressKeys = [
  'lap',
  'checkpoint',
  'elapsed',
  'lastLap',
  'best',
  'valid',
  'complete',
  'startDistance',
  'history',
  'completedTransfers',
  'splits',
  'completedTime',
];

test('race progress codec keeps published key order and defensive nested copies', () => {
  const race = createRace(track);
  race.history.push({ duration: 45, valid: true, rulesId: race.rulesId });
  race.completedTransfers.push('0:jump');
  const data = captureRaceProgress(race);
  assert.deepEqual(Object.keys(data), progressKeys);
  data.history[0].duration = 50;
  data.completedTransfers.push('1:jump');
  assert.equal(race.history[0].duration, 45);
  assert.deepEqual(race.completedTransfers, ['0:jump']);
});

test('progress restore preserves legacy defaults, methods and course identity', () => {
  const race = createRace(track),
    step = race.step,
    course = race.course;
  const data = captureRaceProgress(race);
  delete data.splits;
  delete data.completedTime;
  data.step = 'untrusted';
  data.course = 'untrusted';
  data.rulesId = 'untrusted';
  data.lap = 3;
  restoreRaceProgress(race, data);
  assert.equal(race.lap, 3);
  assert.deepEqual(race.splits, []);
  assert.equal(race.completedTime, 0);
  assert.equal(race.step, step);
  assert.equal(race.course, course);
  assert.notEqual(race.rulesId, 'untrusted');
});

test('full owned codec matches the prior data-only property order and restores exact sprint identity', () => {
  const sprint = {
    ...track,
    closed: false,
    finishDistance: 900,
    checkpoints: [{ distance: 0 }, { distance: 500 }, { distance: 900 }],
  };
  const race = createRace(sprint, { rulesId: 'owned-run' });
  const prior = Object.fromEntries(
    Object.entries(Object.getOwnPropertyDescriptors(race))
      .filter(
        ([, descriptor]) =>
          Object.hasOwn(descriptor, 'value') &&
          typeof descriptor.value !== 'function',
      )
      .map(([key, descriptor]) => [key, descriptor.value]),
  );
  const data = captureOwnedRace(race);
  assert.equal(JSON.stringify(data), JSON.stringify(prior));
  const restored = createRace(sprint, { rulesId: race.rulesId });
  assert.notEqual(
    restored.rulesId,
    race.rulesId,
    'constructor appends the sprint namespace',
  );
  restoreOwnedRace(restored, { ...data, recover: 'untrusted', extra: true });
  assert.equal(restored.rulesId, race.rulesId);
  assert.equal(typeof restored.recover, 'function');
  assert.equal('extra' in restored, false);
  assert.deepEqual(captureOwnedRace(restored), data);
});
