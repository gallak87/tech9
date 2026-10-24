import test from 'node:test';
import assert from 'node:assert/strict';
import {
  combatDisruption,
  sampleCombatDisruption,
} from './combat-consequences.js';
import { sampleCombatScreen } from './combat-screen-feedback.js';

test('volleys cannot compound speed loss or extend the original recovery clock', () => {
  const first = combatDisruption(null, 'arc', 10, 120);
  const later = combatDisruption(first, 'arc', 11.6, 50);
  assert.deepEqual(later, first);
  assert.equal(sampleCombatDisruption(first, 10).speedLimit, 74.4);
  assert.equal(sampleCombatDisruption(later, 12), null);
  const upgraded = combatDisruption(first, 'repulsor', 11.6, 50);
  assert.equal(upgraded.startedAt, 10);
  assert.equal(upgraded.entrySpeed, 120);
  assert.equal(sampleCombatDisruption(upgraded, 13), null);
  assert.equal(
    sampleCombatDisruption(combatDisruption(null, 'repulsor', 1, 15), 1)
      .speedLimit,
    30,
  );
});

test('HUD distinguishes an Arc pulse and Repulsor tunnel; reduced motion has no flash or pulsing', () => {
  const sample = (kind, age, quiet = false) =>
    sampleCombatScreen(
      sampleCombatDisruption(combatDisruption(null, kind, 0, 120), age),
      quiet,
    );
  assert.ok(sample('arc', 0.02).flash > 0);
  assert.equal(sample('arc', 0.3).flash, 0);
  assert.ok(sample('arc', 0.5).pulse > sample('arc', 0.25).pulse);
  assert.equal(sample('arc', 0.5).tunnel, 0);
  assert.ok(sample('repulsor', 1).tunnel > 0.5);
  assert.equal(sample('repulsor', 3).tunnel, 0);
  assert.equal(sample('arc', 0.02, true).flash, 0);
  assert.equal(sample('arc', 0.25, true).pulse, sample('arc', 0.5, true).pulse);
});
