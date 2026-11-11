import test from 'node:test';
import assert from 'node:assert/strict';
import { createVesperPresentationClock } from './presentation-clock.js';

const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);

test('decorative phase advances before green and carries into racing using only supplied simulation deltas', () => {
  const clock = createVesperPresentationClock();
  assert.deepEqual(clock({ mode: 'title', dt: 0, time: 0 }, 10), {
    dt: 0,
    time: 0,
    paused: false,
  });
  near(clock({ mode: 'title', dt: 0, time: 0 }, 10.02).dt, 0.02);
  const countdown = clock({ mode: 'countdown', dt: 0, time: -3 }, 10.05);
  near(countdown.time, 0.05);
  const green = clock({ mode: 'racing', dt: 0.016, time: 0 }, 1000);
  near(green.dt, 0.016);
  near(green.time, countdown.time + 0.016);
  const stalledSimulation = clock({ mode: 'racing', dt: 0, time: 500 }, 2000);
  assert.equal(
    stalledSimulation.time,
    green.time,
    'wall time and simulation seeks cannot advance a racing frame',
  );
});

test('pause, free camera, inspection, review and reduced motion freeze the shared clock without resume debt', () => {
  for (const frozen of [
    { mode: 'paused' },
    { mode: 'fly' },
    { mode: 'inspection' },
    { mode: 'overview' },
    { mode: 'title', reviewing: true },
    { mode: 'title', paused: true },
    { mode: 'title', suspended: true },
    { mode: 'title', settings: { reducedMotion: true } },
    { mode: 'title', reducedMotion: true },
  ]) {
    const clock = createVesperPresentationClock();
    clock({ mode: 'title' }, 1);
    const before = clock({ mode: 'title' }, 1.02);
    const stopped = clock({ dt: 10, time: 600, ...frozen }, 400);
    assert.deepEqual(stopped, { dt: 0, time: before.time, paused: true });
    const held = clock({ dt: 10, time: 900, ...frozen }, 900);
    assert.equal(held.time, before.time);
    const resume = clock({ mode: 'title' }, 1200);
    assert.deepEqual(resume, { dt: 0, time: before.time, paused: false });
    near(clock({ mode: 'title' }, 1200.02).time, before.time + 0.02);
  }
});

test('long/background gaps are bounded and invalid or negative frame deltas cannot reverse time', () => {
  const clock = createVesperPresentationClock();
  clock({ mode: 'countdown' }, 0);
  assert.equal(clock({ mode: 'countdown' }, 200).dt, 0.05);
  assert.equal(clock({ mode: 'racing', dt: 100 }, 300).dt, 0.05);
  const before = clock({ mode: 'racing', dt: 0 }, 301).time;
  for (const dt of [-2, NaN, Infinity, undefined])
    assert.equal(clock({ mode: 'racing', dt }, 302).time, before);
  assert.equal(
    clock({ mode: 'countdown' }, 303).dt,
    0,
    'entering waiting does not inherit old wall time',
  );
  assert.equal(
    clock({ mode: 'countdown' }, 302).dt,
    0,
    'a clock correction never reverses presentation',
  );
  const invalid = clock({ mode: 'countdown' }, NaN);
  assert.equal(invalid.dt, 0);
  assert.ok(Number.isFinite(invalid.time));
});

test('recoveries, lap restart and title return preserve phase while results use their explicit presentation delta', () => {
  const clock = createVesperPresentationClock();
  const start = clock(
    { mode: 'racing', dt: 0.02, time: 150, state: { resetCount: 0 } },
    1,
  );
  const recover = clock(
    {
      mode: 'racing',
      dt: 0.02,
      time: 80,
      reset: true,
      state: { resetCount: 1 },
    },
    2,
  );
  near(recover.time, start.time + 0.02);
  const restart = clock(
    { mode: 'racing', dt: 0, time: 0, reset: true, state: { resetCount: 0 } },
    3,
  );
  assert.equal(restart.time, recover.time);
  const results = clock(
    { mode: 'results', dt: 0, presentationDt: 0.03, time: 0 },
    4,
  );
  near(results.time, recover.time + 0.03);
  const title = clock({ mode: 'title', dt: 0, time: 0 }, 40);
  assert.equal(title.time, results.time);
  near(clock({ mode: 'title' }, 40.02).time, title.time + 0.02);
});
