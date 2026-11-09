import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFreestyleArcade,
  FREESTYLE_GRADES,
  freestyleLandingGrade,
  freestyleRotationCharge,
  freestyleStylePoints,
} from './arcade.js';
import { createFreestyleController } from './controller.js';

const frame = (overrides = {}) => ({
  clock: 0,
  score: 0,
  legs: [],
  flight: null,
  pendingLanding: null,
  angular: [0, 0, 0],
  progress: [0, 0, 0],
  compoundProgress: 0,
  ...overrides,
});

test('landing grades distinguish real recovered, clean and perfect catches from misses', () => {
  assert.equal(freestyleLandingGrade(null), 'miss');
  assert.equal(freestyleLandingGrade({ clean: true, perfect: true }), 'miss');
  assert.equal(freestyleLandingGrade({ landed: true }), 'good');
  assert.equal(freestyleLandingGrade({ landed: true, clean: true }), 'great');
  assert.equal(
    freestyleLandingGrade({ landed: true, clean: true, perfect: true }),
    'perfect',
  );
  for (const theme of Object.values(FREESTYLE_GRADES))
    assert.equal(Number.parseInt(theme.color.slice(1), 16), theme.hex);
});

test('air points count completed tricks with per-kind diminishing returns and no partial-rotation award', () => {
  assert.equal(freestyleStylePoints([]), 0);
  assert.equal(
    freestyleStylePoints(['roll', 'roll', 'flip', 'roll', 'spin', 'corkscrew']),
    6250,
  );
  const data = frame({
    flight: { id: 'one', tricks: [] },
    angular: [0, 0, 2],
    progress: [0, 0, Math.PI],
  });
  assert.equal(freestyleRotationCharge(data).kind, 'roll');
  assert.ok(freestyleRotationCharge(data).progress > 0.5);
  assert.equal(createFreestyleArcade().update(data).airPoints, 0);
  data.angular = [1, 0, 2];
  data.compoundProgress = 3;
  assert.equal(freestyleRotationCharge(data).kind, 'corkscrew');
  data.flight.failed = true;
  assert.equal(freestyleRotationCharge(data), null);
});

test('completed trick callouts preserve the actual award while only the visible number rolls up', () => {
  const arcade = createFreestyleArcade();
  arcade.update(frame({ flight: { id: 'one', tricks: [] } }));
  const data = frame({
    clock: 0.1,
    flight: { id: 'one', tricks: ['roll', 'roll'] },
  });
  const visible = arcade.update(data);
  assert.equal(visible.airPoints, 1500);
  assert.ok(visible.airScore > 0 && visible.airScore < 1500);
  assert.equal(visible.callout.label, 'Barrel roll');
  assert.equal(visible.callout.points, 500);
  assert.equal(visible.callout.ordinal, 2);
  assert.equal(data.score, 0);
  assert.deepEqual(data.flight.tricks, ['roll', 'roll']);
});

test('touchdown stays provisional; only an actual banked leg triggers the grade and score sweep', () => {
  const arcade = createFreestyleArcade();
  arcade.update(frame());
  const pending = arcade.update(
    frame({
      clock: 0.1,
      pendingLanding: { id: 'one', style: 1000, tricks: ['roll'] },
    }),
  );
  assert.equal(pending.airPoints, 1000);
  assert.equal(pending.score, 0);
  assert.equal(pending.payoff, null);
  const data = frame({
    clock: 0.2,
    score: 3000,
    legs: [{ id: 'one', landed: true, clean: true, bank: 3000, chain: 1 }],
  });
  const start = arcade.update(data);
  assert.equal(start.payoff.grade, 'great');
  assert.equal(start.score, 0);
  let visible;
  for (let i = 0; i < 12; i++) {
    data.clock += 0.1;
    visible = arcade.update(data);
  }
  assert.equal(visible.score, 3000);
  assert.equal(visible.payoff.points, 0);
  assert.equal(data.score, 3000);
  assert.equal(data.legs[0].bank, 3000);
});

test('pause freezes feedback, reduced motion removes countup, and restarts never replay old banks', () => {
  const arcade = createFreestyleArcade();
  arcade.update(frame());
  const data = frame({
    clock: 0.1,
    score: 1000,
    legs: [{ id: 'one', landed: true, bank: 1000, chain: 1 }],
  });
  const start = arcade.update(data);
  data.clock = 0.8;
  const paused = arcade.update(data, { running: false });
  assert.equal(paused.payoff.age, start.payoff.age);
  assert.equal(paused.score, start.score);
  data.clock = 0.9;
  const reduced = arcade.update(data, { reducedMotion: true });
  assert.equal(reduced.score, 1000);
  assert.equal(reduced.payoff.points, 1000);
  assert.equal(reduced.payoff.sweep, 0);
  assert.equal(reduced.payoff.entrance, 1);
  const reset = arcade.update(frame());
  assert.equal(reset.score, 0);
  assert.equal(reset.payoff, null);
  const restored = createFreestyleArcade().update(data);
  assert.equal(restored.score, 1000);
  assert.equal(restored.payoff, null);
});

test('the controller emits one presentation event for each actual completed trick and exposes copied charge data', () => {
  for (const input of [{ aerialRoll: 1 }, { aerialPitch: 1, aerialRoll: 1 }]) {
    const controller = createFreestyleController({ track: { jumps: [] } });
    assert.equal(controller.step({}, 1 / 120), null);
    controller.launch('one');
    const events = [];
    for (let i = 0; i < 600; i++) {
      const recognized = controller.step(input, 1 / 120);
      if (recognized) events.push(...recognized);
    }
    const snapshot = controller.snapshot();
    assert.ok(events.length > 1);
    assert.deepEqual(
      events,
      snapshot.flight.tricks.map((kind, i) => ({
        id: 'one',
        kind,
        ordinal: i + 1,
      })),
    );
    const exposed = controller.readFrame();
    assert.equal(exposed.compoundProgress, snapshot.compoundProgress);
    exposed.progress.fill(99);
    exposed.flight.tricks.push('spin');
    assert.deepEqual(controller.snapshot(), snapshot);
  }
});
