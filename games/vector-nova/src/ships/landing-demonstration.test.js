import test from 'node:test';
import assert from 'node:assert/strict';
import {
  landingDemonstration,
  LANDING_PREVIEW_CONTACT,
  LANDING_PREVIEW_BANK,
  LANDING_PREVIEWS,
} from './landing-demonstration.js';

test('studio landing events separate physical contact from graded points and never repeat on held frames', () => {
  for (const entry of LANDING_PREVIEWS) {
    const before = landingDemonstration(
      entry.id,
      LANDING_PREVIEW_CONTACT - 0.01,
    );
    assert.equal(before.airborne, true);
    assert.ok(before.position[1] > 0);
    const contact = landingDemonstration(
      entry.id,
      LANDING_PREVIEW_CONTACT,
      LANDING_PREVIEW_CONTACT - 0.01,
    );
    assert.equal(contact.airborne, false);
    assert.deepEqual(
      contact.events.map(({ type }) => type),
      ['landing-catch'],
    );
    assert.equal(
      landingDemonstration(
        entry.id,
        LANDING_PREVIEW_CONTACT,
        LANDING_PREVIEW_CONTACT,
      ).events.length,
      0,
    );
    const bank = landingDemonstration(
      entry.id,
      LANDING_PREVIEW_BANK,
      LANDING_PREVIEW_CONTACT,
    );
    assert.deepEqual(
      bank.events.map(({ type }) => type),
      entry.id === 'landing-catch' ? [] : ['freestyle-bank'],
    );
    if (entry.id !== 'landing-catch') {
      assert.equal(bank.freestyle.legs[0].touchdownAt, LANDING_PREVIEW_CONTACT);
      assert.equal(bank.freestyle.legs[0].at, LANDING_PREVIEW_BANK);
      assert.equal(bank.freestyle.legs[0].landed, true);
    }
  }
});

test('common and Freestyle studio hulls use the gameplay magnetic seat, with reduced-motion relief', () => {
  for (const kind of [
    'landing-catch',
    'freestyle-good',
    'freestyle-great',
    'freestyle-perfect',
  ]) {
    const contact = landingDemonstration(kind, LANDING_PREVIEW_CONTACT + 0.11);
    assert.ok(contact.position[1] <= -0.23 && contact.position[1] >= -0.24);
    assert.ok(contact.rotation[0] > 0);
    const reduced = landingDemonstration(
      kind,
      LANDING_PREVIEW_CONTACT + 0.11,
      -1,
      true,
    );
    assert.deepEqual(reduced.position, [0, 0, 0]);
    assert.deepEqual(reduced.rotation, [0, 0, 0]);
    const released = landingDemonstration(kind, 2);
    assert.deepEqual(released.position, [0, 0, 0]);
    assert.deepEqual(released.rotation, [0, 0, 0]);
  }
});

test('the completed-roll example produces one trick tick before contact and a Perfect reward after it', () => {
  const tick = landingDemonstration('freestyle-trick', 0.32, 0.31);
  assert.deepEqual(
    tick.events.map(({ type }) => type),
    ['freestyle-trick'],
  );
  assert.equal(tick.events[0].payload.kind, 'roll');
  assert.equal(tick.airborne, true);
  assert.equal(
    landingDemonstration('freestyle-trick', 0.33, 0.32).events.length,
    0,
  );
  const reward = landingDemonstration(
    'freestyle-trick',
    LANDING_PREVIEW_BANK,
    LANDING_PREVIEW_BANK - 0.01,
  );
  assert.equal(reward.events[0].payload.perfect, true);
});
