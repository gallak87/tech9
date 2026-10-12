import test from 'node:test';
import assert from 'node:assert/strict';
import { createNacreOceanClock } from './ocean-clock.js';

test('ocean advances before green without advancing simulation or losing phase at the start', () => {
  const clock = createNacreOceanClock();
  const frame = Object.freeze({ mode: 'title', time: 0 });
  assert.equal(clock(frame, 0), 0);
  for (let i = 1; i <= 60; i++) clock(frame, i / 60);
  assert.equal(frame.time, 0);
  const countdown = { mode: 'countdown', time: 0 };
  const startPhase = clock({ ...countdown, reset: true }, 1);
  assert.ok(Math.abs(startPhase - 1) < 1e-10);
  for (let i = 1; i <= 180; i++) clock(countdown, 1 + i / 60);
  const green = clock({ mode: 'racing', time: 1 / 60 }, 4 + 1 / 60);
  assert.ok(Math.abs(green - (4 + 1 / 60)) < 1e-10);
  assert.equal(clock({ mode: 'racing', time: 2 }, 6), 6);
});

test('ocean phase freezes on pause/inspection and fresh scenarios reset its independent offset', () => {
  const clock = createNacreOceanClock();
  clock({ mode: 'countdown', time: 0 }, 0);
  clock({ mode: 'countdown', time: 0 }, 0.1);
  const paused = clock({ mode: 'paused', time: 0 }, 0.2);
  for (const mode of ['paused', 'fly', 'inspection', 'overview'])
    assert.equal(clock({ mode, time: 0 }, 100), paused);
  assert.equal(clock({ mode: 'countdown', time: 0 }, 101), paused);
  assert.equal(clock({ mode: 'countdown', time: 0 }, 151), paused + 0.1);
  assert.equal(clock({ mode: 'racing', time: 0, reset: true }, 152), 0);
  assert.equal(clock({ mode: 'racing', time: 3 }, 155), 3);
  assert.equal(clock({ mode: 'paused', time: 1 }, 156), 1);
});

test('manual recovery keeps the ocean phase while a fresh session clears it', () => {
  const clock = createNacreOceanClock();
  clock({ mode: 'countdown', time: 0 }, 0);
  clock({ mode: 'countdown', time: 0 }, 0.1);
  assert.equal(clock({ mode: 'racing', time: 4 }, 4.1), 4.1);
  assert.equal(
    clock(
      { mode: 'racing', time: 4, reset: true, state: { resetCount: 1 } },
      4.2,
    ),
    4.1,
  );
  assert.equal(
    clock({ mode: 'racing', time: 5, state: { resetCount: 1 } }, 5.2),
    5.1,
  );
  assert.equal(
    clock(
      { mode: 'inspection', time: 5, reset: true, state: { resetCount: 1 } },
      6,
    ),
    5.1,
  );
  assert.equal(
    clock(
      { mode: 'racing', time: 0, reset: true, state: { resetCount: 0 } },
      5.3,
    ),
    0,
  );
});
