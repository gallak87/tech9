import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createFreestyleController } from './controller.js';

const track = {
  jumps: Array.from({ length: 5 }, (_, i) => ({
    id: `jump-${i}`,
    target: i * 100,
    targetLateral: 0,
  })),
  sample: (distance) => ({
    position: new T.Vector3(0, 0, distance),
    right: new T.Vector3(1, 0, 0),
    up: new T.Vector3(0, 1, 0),
    tangent: new T.Vector3(0, 0, 1),
    quaternion: new T.Quaternion(),
  }),
};
function steps(controller, input, seconds) {
  for (let i = 0; i < Math.round(seconds * 120); i++)
    controller.step(input, 1 / 120);
}
function contact(controller, index = 0) {
  const jump = track.jumps[index];
  return controller.land({
    jump,
    outcome: 'landed',
    position: new T.Vector3(0, 0.72, jump.target),
    quaternion: new T.Quaternion().fromArray(controller.snapshot().orientation),
    velocity: new T.Vector3(0, 0, 145),
  });
}

test('directional torque ramps up, coasts on release, reverses and remains bounded on diagonals', () => {
  const c = createFreestyleController({ track });
  c.launch('jump-0');
  steps(c, { aerialRoll: 1 }, 0.2);
  const ramp = c.snapshot();
  assert.ok(ramp.angular[2] > 0 && ramp.angular[2] < 3);
  const before = new T.Quaternion().fromArray(ramp.orientation);
  c.step({}, 1 / 120);
  assert.ok(c.snapshot().angular[2] > 0);
  assert.ok(
    before.angleTo(new T.Quaternion().fromArray(c.snapshot().orientation)) > 0,
  );
  steps(c, { aerialRoll: -1 }, 0.7);
  assert.ok(c.snapshot().angular[2] < -2);
  steps(c, { aerialRoll: 1, aerialPitch: 1, aerialYaw: 1 }, 3);
  assert.ok(Math.hypot(...c.snapshot().angular) <= 3.200001);
});

test('full rolls in both directions and multi-axis corkscrews are recognized without one-button animations', () => {
  for (const input of [
    { aerialRoll: 1 },
    { aerialRoll: -1 },
    { aerialPitch: 1, aerialRoll: 1 },
  ]) {
    const c = createFreestyleController({ track });
    c.launch('jump-0');
    steps(c, input, 2);
    steps(c, {}, 1);
    assert.ok(
      c
        .snapshot()
        .flight.tricks.includes(input.aerialPitch ? 'corkscrew' : 'roll'),
    );
  }
});

test('five clean slope catches grow a chain, bank only once each, and cannot earn gold without tricks', () => {
  const c = createFreestyleController({ track });
  for (let i = 0; i < 5; i++) {
    c.launch(track.jumps[i].id);
    steps(c, {}, 0.1);
    steps(c, { airbrake: true }, 0.25);
    const leg = contact(c, i);
    assert.equal(leg.perfect, true);
    assert.equal(leg.chain, i + 1);
    const score = c.snapshot().score;
    assert.equal(contact(c, i), null);
    assert.equal(c.snapshot().score, score);
  }
  const result = c.complete('kestrel');
  assert.equal(result.bestChain, 5);
  assert.equal(result.score, 15000);
  assert.equal(result.medal, 'Silver');
  assert.equal(result.playerValid, true);
});

test('held or early catch inputs do not automatically bank landings', () => {
  const c = createFreestyleController({ track });
  steps(c, { airbrake: true }, 1);
  c.launch('jump-0');
  steps(c, { airbrake: true }, 0.3);
  assert.equal(contact(c).clean, false);
  c.reset();
  c.launch('jump-0');
  steps(c, { airbrake: true }, 1);
  assert.equal(contact(c).clean, false);
});

test('an unfinished rotation, collision or missed receiver breaks the link and preserves earlier banks', () => {
  const c = createFreestyleController({ track });
  c.launch('jump-0');
  steps(c, {}, 0.1);
  steps(c, { airbrake: true }, 0.25);
  contact(c);
  assert.equal(c.snapshot().score, 1000);
  c.launch('jump-1');
  steps(c, { aerialRoll: 1 }, 1);
  steps(c, { airbrake: true }, 0.25);
  assert.equal(contact(c, 1).clean, false);
  assert.equal(c.snapshot().chain, 0);
  assert.equal(c.snapshot().score, 1000);
  c.launch('jump-2');
  steps(c, {}, 0.1);
  steps(c, { airbrake: true }, 0.25);
  c.damage();
  assert.equal(contact(c, 2).clean, false);
});

test('pause-safe snapshots replay torque and points, while partial routes and manual recovery stay unranked', () => {
  const a = createFreestyleController({ track }),
    b = createFreestyleController({ track });
  a.launch('jump-0');
  steps(a, { aerialPitch: -1 }, 1);
  const saved = JSON.parse(JSON.stringify(a.snapshot()));
  b.restore(saved);
  steps(a, { aerialRoll: 1 }, 0.5);
  steps(b, { aerialRoll: 1 }, 0.5);
  assert.deepEqual(a.snapshot(), b.snapshot());
  assert.equal(a.complete('kestrel').playerValid, false);
  b.invalidate();
  assert.equal(b.complete('kestrel').playerValid, false);
});
