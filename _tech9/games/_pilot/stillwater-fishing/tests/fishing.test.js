import test from 'node:test';
import assert from 'node:assert/strict';
import { FishingRules } from '../src/game/FishingRules.js';

function cast(rules) {
  assert.equal(rules.startCharge(), true);
  rules.tick(0.7);
  assert.equal(rules.cast(true, 21), true);
  rules.tick(1);
  assert.equal(rules.phase, 'waiting');
}

function hook(rules) {
  cast(rules);
  rules.tick(rules.biteDelay);
  assert.equal(rules.phase, 'bite');
  assert.equal(rules.action(), true);
  assert.equal(rules.phase, 'fight');
}

function land(rules, dt = 0.1) {
  let reeling = true;
  while (rules.phase === 'fight') {
    if (rules.tension > 0.7) reeling = false;
    if (rules.tension < 0.3) reeling = true;
    rules.tick(dt, { reeling });
  }
}

test('a careful tension strategy lands a trout in under a minute and can repeat', () => {
  const rules = new FishingRules();
  hook(rules);
  land(rules);
  assert.equal(rules.phase, 'landed');
  assert.ok(rules.fightTime >= 35 && rules.fightTime <= 60);
  assert.equal(rules.catches, 1);
  assert.equal(rules.lastCatch.species, 'Brook trout');
  assert.ok(rules.lastCatch.lengthCm > 0 && rules.lastCatch.weightKg > 0);
  rules.tick(100, { reeling: true });
  assert.equal(rules.catches, 1);
  assert.equal(rules.phase, 'landed');
  assert.equal(rules.action(), true);
  assert.equal(rules.phase, 'ready');
  hook(rules);
  land(rules);
  assert.equal(rules.catches, 2);
});

test('continuous over-reeling breaks the line before fifteen seconds', () => {
  const rules = new FishingRules();
  hook(rules);
  rules.tick(15, { reeling: true });
  assert.equal(rules.phase, 'failed');
  assert.match(rules.reason, /line snapped/);
  assert.ok(rules.fightTime < 15);
  assert.equal(rules.catches, 0);
});

test('leaving the reel alone lets the trout escape, then retry is immediate', () => {
  const rules = new FishingRules();
  hook(rules);
  rules.tick(26);
  assert.equal(rules.phase, 'failed');
  assert.match(rules.reason, /shook the hook/);
  assert.ok(rules.fightTime >= 25 && rules.fightTime < 26);
  rules.action();
  assert.equal(rules.phase, 'ready');
  assert.equal(rules.startCharge(), true);
});

test('a missed bite produces a readable failure and no catch', () => {
  const rules = new FishingRules();
  cast(rules);
  assert.ok(rules.biteDelay >= 4 && rules.biteDelay <= 8);
  rules.tick(rules.biteDelay);
  assert.equal(rules.phase, 'bite');
  rules.tick(2.3);
  assert.equal(rules.phase, 'failed');
  assert.match(rules.reason, /Set the hook/);
  assert.equal(rules.catches, 0);
});

test('a bank cast fails cleanly and can be retried without reloading', () => {
  const rules = new FishingRules();
  rules.startCharge();
  rules.tick(0.5);
  assert.equal(rules.cast(false, 2), false);
  assert.equal(rules.phase, 'failed');
  assert.match(rules.reason, /bank/);
  rules.action();
  assert.equal(rules.reason, '');
  hook(rules);
  assert.equal(rules.phase, 'fight');
});

test('pause freezes timers and actions in every active phase; reset is clean', () => {
  const rules = new FishingRules();
  const checkPause = () => {
    rules.paused = true;
    const before = rules.snapshot();
    rules.tick(90, { reeling: true });
    rules.startCharge();
    rules.cast(true, 20);
    rules.action();
    assert.deepEqual(rules.snapshot(), before);
    rules.paused = false;
  };
  checkPause();
  rules.startCharge();
  rules.tick(0.4);
  checkPause();
  rules.cast(true, 21);
  checkPause();
  rules.tick(1);
  checkPause();
  rules.tick(rules.biteDelay);
  checkPause();
  rules.action();
  rules.tick(0.8, { reeling: true });
  checkPause();
  land(rules);
  checkPause();
  rules.reset();
  assert.deepEqual(rules.snapshot(), new FishingRules().snapshot());
});

test('invalid state actions are inert, and bad time values cannot corrupt state', () => {
  const rules = new FishingRules();
  const before = rules.snapshot();
  assert.equal(rules.action(), false);
  assert.equal(rules.cast(true, 20), false);
  rules.tick(-1);
  rules.tick(Infinity);
  rules.tick(NaN);
  assert.deepEqual(rules.snapshot(), before);
  rules.startCharge();
  rules.tick(0.5);
  const charging = rules.snapshot();
  assert.equal(rules.startCharge(), false);
  assert.equal(rules.action(), false);
  assert.deepEqual(rules.snapshot(), charging);
  rules.cast(true, 20);
  const casting = rules.snapshot();
  assert.equal(rules.action(), false);
  assert.equal(rules.startCharge(), false);
  assert.equal(rules.cast(false, 2), false);
  assert.deepEqual(rules.snapshot(), casting);
});

test('charge oscillates without escaping its range and reset repeats bite timing', () => {
  const rules = new FishingRules();
  rules.startCharge();
  for (let frame = 0; frame < 400; frame++) {
    rules.tick(0.1);
    assert.ok(rules.power >= 0 && rules.power <= 1);
  }
  rules.cast(true, 20);
  const delay = rules.biteDelay;
  rules.reset();
  cast(rules);
  assert.equal(rules.biteDelay, delay);
});

test('snapshots cannot mutate the recorded catch', () => {
  const rules = new FishingRules();
  hook(rules);
  land(rules);
  const snapshot = rules.snapshot();
  snapshot.lastCatch.species = 'Changed';
  assert.equal(rules.lastCatch.species, 'Brook trout');
  assert.deepEqual(
    JSON.parse(JSON.stringify(rules.snapshot())),
    rules.snapshot(),
  );
});
