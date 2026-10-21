import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaceFeedback } from './race-feedback.js';

const frame = (time, extra = {}) => ({
  state: { time, speed: 112, boosting: false },
  mode: 'racing',
  ...extra,
});
test('camera impulses distinguish hits from confirms, settle fully, and pause in simulation time', () => {
  const hit = createRaceFeedback(),
    confirm = createRaceFeedback();
  for (const controller of [hit, confirm]) controller.update(frame(1));
  hit.event({ type: 'combat-hit', time: 1, payload: { kind: 'arc' } });
  confirm.event({ type: 'combat-confirm', time: 1, payload: { kind: 'arc' } });
  const a = hit.update(frame(1.04)),
    b = confirm.update(frame(1.04));
  assert.ok(Math.abs(a.position[2]) > Math.abs(b.position[2]) * 3);
  assert.deepEqual(hit.update(frame(1.04, { mode: 'paused' })), a);
  assert.deepEqual(hit.update(frame(1.04)), a);
  assert.deepEqual(hit.update(frame(2)).position, [0, 0, 0]);
});

test('wall/racer impacts are directional and bounded even with overlapping weapon fire', () => {
  const controller = createRaceFeedback();
  controller.update(frame(1));
  for (let i = 0; i < 100; i++)
    controller.event({
      type: 'impact',
      time: 1,
      payload: { severity: 1, side: -1 },
    });
  const response = controller.update(frame(1.03));
  assert.ok(response.position[0] < 0);
  assert.ok(Math.abs(response.rotation[2]) <= 0.018);
  assert.ok(Math.abs(response.position[2]) <= 0.155);
  assert.ok(response.impact <= 1);
  assert.deepEqual(
    controller.update(frame(0)).position,
    [0, 0, 0],
    'time resets clear all pulses',
  );
});

test('speed, boost and Vector have distinct FOV levels; reduced motion removes all added movement', () => {
  const controller = createRaceFeedback();
  const cruise = controller.update(frame(0));
  let boost;
  for (let i = 1; i <= 30; i++)
    boost = controller.update(
      frame(i / 60, {
        state: { time: i / 60, speed: 112, boosting: true },
      }),
    );
  assert.ok(boost.fov > cruise.fov + 3.8);
  assert.ok(
    controller.update(frame(0.51, { catapulting: true })).fov > boost.fov,
  );
  controller.event({
    type: 'pickup-activate',
    time: 0.51,
    payload: { kind: 'repulsor' },
  });
  const quiet = controller.update(
    frame(0.54, { reducedMotion: true, heat: 1 }),
  );
  assert.equal(quiet.fov, 0);
  assert.deepEqual(quiet.position, [0, 0, 0]);
  assert.deepEqual(quiet.rotation, [0, 0, 0]);
  assert.equal(controller.update(frame(0.55, { mode: 'title' })).fov, 0);
});

test('hot contact produces a small deterministic tremor, without accumulating or persisting after reset', () => {
  const controller = createRaceFeedback();
  const hot = controller.update(frame(10, { heat: 1 }));
  assert.ok(hot.position.some((v) => v !== 0));
  assert.deepEqual(controller.update(frame(10, { heat: 1 })), hot);
  controller.event({ type: 'road-recovery', time: 10 });
  assert.ok(
    controller.update(frame(10.1)).rotation.every((value) => value === 0),
  );
});

test('later Arc contacts still respond gently during damage grace', () => {
  const responses = ['player', 'rook'].map((target) => {
    const feedback = createRaceFeedback();
    feedback.update(frame(1));
    feedback.event({
      type: 'combat-contact',
      time: 1,
      payload: { kind: 'arc', target },
    });
    return feedback.update(frame(1.025));
  });
  assert.ok(responses[0].impact > responses[1].impact);
  assert.ok(responses[1].impact > 0);
  assert.ok(responses[0].position.every((value) => Math.abs(value) < 0.02));
});
