import test from 'node:test';
import assert from 'node:assert/strict';
import { Group } from 'three';
import { createLandingPreview } from './landing-preview.js';
import {
  LANDING_PREVIEW_CONTACT,
  LANDING_PREVIEW_BANK,
} from './landing-demonstration.js';

function harness() {
  const scene = new Group(),
    frame = new Group(),
    ship = new Group();
  scene.add(frame);
  frame.add(ship);
  frame.position.y = 0.15;
  frame.rotation.y = 0.43;
  const settings = { quality: 'high', volume: 0.35, reducedMotion: false };
  const events = [],
    updates = [];
  const audio = {
    options: null,
    disposed: 0,
    resets: 0,
    unlock: async () => true,
    getStatus: () => ({ landing: { loaded: true } }),
    getPresentation: () => ({ loaded: true }),
    duration: (event) => (event.type === 'freestyle-bank' ? 2 : 1),
    event: (event) => events.push(event),
    update: (...args) => updates.push(args),
    resetEnvironment() {
      this.resets++;
    },
    dispose() {
      this.disposed++;
    },
  };
  const owner = createLandingPreview({
    ship,
    frame,
    getSettings: () => settings,
    createRaceAudio: (options) => {
      audio.options = options;
      return audio;
    },
  });
  return { owner, scene, frame, ship, settings, events, updates, audio };
}

test('inspector lands, seats and grades the real shared VFX at the same sound anchors', async () => {
  const h = harness();
  await h.owner.prepare('freestyle-perfect');
  assert.equal(h.audio.options.engine, false);
  assert.equal(typeof h.audio.options.environment, 'function');
  h.owner.update('freestyle-perfect', 0.6, false, 0);
  assert.equal(h.events.length, 0);
  assert.equal(h.owner.getSnapshot().vfx.visible, false);
  h.owner.update('freestyle-perfect', LANDING_PREVIEW_CONTACT, false, 0.6);
  assert.equal(h.events[0].type, 'landing-catch');
  h.owner.update(
    'freestyle-perfect',
    LANDING_PREVIEW_CONTACT + 0.11,
    false,
    LANDING_PREVIEW_CONTACT,
  );
  assert.ok(h.ship.position.y < -0.23);
  assert.equal(h.owner.getSnapshot().vfx.visible, true);
  const grade = h.owner.update(
    'freestyle-perfect',
    LANDING_PREVIEW_BANK + 0.01,
    false,
    LANDING_PREVIEW_CONTACT + 0.11,
  );
  assert.equal(h.events[1].type, 'freestyle-bank');
  assert.equal(h.owner.getSnapshot().vfx.grade, 'perfect');
  assert.equal(h.owner.getSnapshot().bankAt, LANDING_PREVIEW_BANK);
  assert.ok(grade.end >= LANDING_PREVIEW_BANK + 2);
  h.owner.dispose();
});

test('paused capture frames freeze effects without playing historical sounds; Stop and chassis changes clear owners', async () => {
  const h = harness();
  await h.owner.prepare('freestyle-great');
  h.owner.update('freestyle-great', LANDING_PREVIEW_CONTACT + 0.11, true, -1);
  const snapshot = h.owner.getSnapshot();
  assert.equal(snapshot.paused, true);
  assert.equal(snapshot.vfx.visible, true);
  assert.equal(h.events.length, 0);
  h.owner.update(
    'freestyle-great',
    LANDING_PREVIEW_CONTACT + 0.11,
    true,
    LANDING_PREVIEW_CONTACT + 0.11,
  );
  assert.deepEqual(h.owner.getSnapshot(), snapshot);
  assert.equal(h.updates.at(-1)[2], false);
  h.owner.stop();
  assert.equal(h.owner.getSnapshot().active, false);
  assert.equal(h.owner.getSnapshot().vfx.visible, false);
  h.owner.setShip(new Group());
  assert.ok(h.audio.resets >= 2);
  h.owner.dispose();
  h.owner.dispose();
  assert.equal(h.audio.disposed, 1);
  assert.equal(
    h.scene.children.length,
    1,
    'shared VFX groups detach from the studio scene',
  );
});

test('the Miss preview clears success VFX and never emits a physical landing thump or positive bank', async () => {
  const h = harness();
  await h.owner.prepare('freestyle-perfect');
  h.owner.update('freestyle-perfect', LANDING_PREVIEW_CONTACT + 0.11, true, -1);
  assert.equal(h.owner.getSnapshot().vfx.visible, true);
  h.owner.update('freestyle-miss', LANDING_PREVIEW_CONTACT + 0.11, false, 0);
  assert.equal(h.owner.getSnapshot().vfx.visible, false);
  assert.equal(h.owner.getSnapshot().contactAt, null);
  assert.equal(h.owner.getSnapshot().bankAt, null);
  assert.deepEqual(h.events, []);
  h.owner.update(
    'freestyle-miss',
    LANDING_PREVIEW_BANK + 0.01,
    false,
    LANDING_PREVIEW_CONTACT + 0.11,
  );
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].type, 'freestyle-bank');
  assert.equal(h.events[0].payload.landed, false);
  assert.equal(h.owner.getSnapshot().vfx.visible, false);
  assert.equal(h.owner.getSnapshot().failureAt, LANDING_PREVIEW_BANK);
  assert.equal(h.owner.getSnapshot().bankAt, null);
  h.owner.stop();
  assert.deepEqual(h.ship.position.toArray(), [0, 0, 0]);
  h.owner.dispose();
});
