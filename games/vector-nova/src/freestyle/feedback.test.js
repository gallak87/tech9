import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  freestyleAttitudeCue,
  freestylePracticeOutcome,
  freestyleLaunchSpeed,
  freestyleReceiverCorrection,
} from './feedback.js';

test('practice preserves actual miss evidence and describes geometry without inventing a cause', () => {
  for (const [reason, label] of [
    ['short', 'Dropped below the receiver'],
    ['long', 'Carried past the receiver'],
    ['lateral', 'Wide of the receiver'],
    ['timeout', 'Airborne too long'],
    ['rail', 'Clipped the rail'],
    ['deck', 'Hard deck contact'],
    ['structure', 'Struck a structure'],
    ['unrecognized', 'Missed receiver'],
  ]) {
    const payload = {
      id: 'transfer-3',
      reason,
      delay: 0.6,
      automaticRecovery: true,
    };
    const outcome = freestylePracticeOutcome({ type: 'jump-miss', payload });
    assert.equal(outcome.clean, false);
    assert.equal(outcome.landed, false);
    assert.equal(outcome.reason, label);
    assert.equal(outcome.kind, 'jump-miss');
    assert.equal(outcome.sourceReason, reason);
    assert.deepEqual(outcome.diagnostics, payload);
    outcome.diagnostics.delay = 3;
    assert.equal(
      payload.delay,
      0.6,
      'diagnostics borrow no mutable event state',
    );
  }
  assert.equal(
    freestylePracticeOutcome({ type: 'impact', payload: { kind: 'rail' } }),
    null,
  );
});

test('practice keeps the actual bank quality and failure description', () => {
  const payload = {
    id: 'transfer-2',
    clean: false,
    reason: 'Still rotating',
    quality: 'rough',
    bank: 80,
  };
  const outcome = freestylePracticeOutcome({ type: 'freestyle-bank', payload });
  assert.equal(outcome.reason, 'Still rotating');
  assert.equal(outcome.clean, false);
  assert.deepEqual(outcome.diagnostics, payload);
  assert.equal(
    freestylePracticeOutcome({
      type: 'freestyle-bank',
      payload: { ...payload, clean: true, reason: 'Tube catch' },
    }).clean,
    true,
  );
});

test('practice reports a recovered landing as credited without pretending it was clean', () => {
  const outcome = freestylePracticeOutcome({
    type: 'freestyle-bank',
    payload: {
      landed: true,
      clean: false,
      quality: 'landed',
      reason: 'Recovered landing',
      bank: 1000,
    },
  });
  assert.equal(outcome.landed, true);
  assert.equal(outcome.clean, false);
  assert.equal(outcome.reason, 'Recovered landing');
});

test('launch speed guidance uses only authored bands and reports human display units', () => {
  assert.equal(freestyleLaunchSpeed(undefined, 140), null);
  assert.equal(freestyleLaunchSpeed([160, 140], 150), null);
  assert.equal(freestyleLaunchSpeed([0, 160], 150), null);
  assert.equal(freestyleLaunchSpeed([140, NaN], 150), null);
  assert.equal(freestyleLaunchSpeed([140, 160], Infinity), null);
  assert.equal(freestyleLaunchSpeed([140, 160], 139).advice, 'Build speed');
  assert.equal(freestyleLaunchSpeed([140, 160], 140).state, 'ready');
  assert.equal(freestyleLaunchSpeed([140, 160], 160).state, 'ready');
  assert.equal(freestyleLaunchSpeed([140, 160], 161).advice, 'Bleed speed');
  assert.equal(freestyleLaunchSpeed([140, 160], 150).label, '504–576 km/h');
});

test('receiver correction uses the real local quaternion and shortest rotation', () => {
  const hull = new T.Quaternion().setFromEuler(new T.Euler(0.4, 0.7, -0.2));
  for (const [axis, key] of [
    [new T.Vector3(1, 0, 0), 'pitch'],
    [new T.Vector3(0, 1, 0), 'yaw'],
    [new T.Vector3(0, 0, 1), 'roll'],
  ]) {
    for (const angle of [-0.8, 0.8, 2 * Math.PI - 0.8]) {
      const target = hull
        .clone()
        .multiply(new T.Quaternion().setFromAxisAngle(axis, angle));
      const correction = freestyleReceiverCorrection(hull, target);
      assert.ok(
        Math.abs(correction[key] - (angle > Math.PI ? -0.8 : angle)) < 1e-9,
      );
      for (const other of ['pitch', 'yaw', 'roll'].filter(
        (value) => value !== key,
      ))
        assert.ok(Math.abs(correction[other]) < 1e-9);
    }
  }
});

test('attitude advice supplies actual signed keys, a quiet deadband and rotation recovery priority', () => {
  const reference = { correction: { pitch: 0.3, yaw: 0.1, roll: -0.7 } };
  assert.equal(freestyleAttitudeCue(reference), 'E roll right · X nose down');
  assert.equal(
    freestyleAttitudeCue(reference, { gamepad: true }),
    'Y roll right · STICK ↓ nose down',
  );
  assert.equal(
    freestyleAttitudeCue(
      { correction: { pitch: -0.4, yaw: 0.7, roll: 0 } },
      { gamepad: true },
    ),
    'STICK → turn right · STICK ↑ nose up',
  );
  assert.equal(
    freestyleAttitudeCue({
      correction: { pitch: 0.04, yaw: -0.03, roll: 0.02 },
    }),
    'Attitude matched · hold your bank',
  );
  assert.equal(
    freestyleAttitudeCue(reference, { angularSpeed: 1 }),
    'Release rotation · SPACE fine trim',
  );
  assert.equal(freestyleAttitudeCue(undefined), '');
});
