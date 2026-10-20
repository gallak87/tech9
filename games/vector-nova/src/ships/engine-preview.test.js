import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnginePreview } from './engine-preview.js';

function harness() {
  const state = { available: true, driving: false, boost: false, time: 1 };
  const settings = { volume: 0.35, muted: false };
  const updates = [];
  let creations = 0,
    disposals = 0,
    unlock = async () => true;
  const preview = createEnginePreview({
    getState: () => state,
    getSettings: () => settings,
    createEngine() {
      creations++;
      return {
        unlock: () => unlock(),
        update: (...args) => updates.push(args),
        dispose: () => {
          disposals++;
        },
      };
    },
  });
  return {
    preview,
    state,
    settings,
    updates,
    get creations() {
      return creations;
    },
    get disposals() {
      return disposals;
    },
    defer() {
      let finish;
      const pending = new Promise((resolve) => {
        finish = resolve;
      });
      unlock = () => pending;
      return () => finish(true);
    },
  };
}

test('engine opt-in follows both preview buttons and shares the effects volume/mute', async () => {
  const h = harness();
  h.preview.update();
  h.state.driving = true;
  await h.preview.changed();
  assert.equal(h.creations, 0, 'ordinary inspector controls stay silent');
  h.state.driving = false;
  h.preview.setEnabled(true);
  assert.equal(h.creations, 0, 'checking alone does not start an idle engine');
  h.state.driving = true;
  await h.preview.changed();
  assert.equal(h.creations, 1);
  assert.deepEqual(h.updates.at(-1), [
    { speed: 400 / 3.6, boosting: false, steer: 0, time: 1 },
    0.35,
    true,
  ]);
  h.state.boost = true;
  await h.preview.changed();
  assert.equal(h.updates.at(-1)[0].boosting, true);
  h.state.driving = false;
  h.preview.update();
  assert.equal(h.updates.at(-1)[0].speed, 0);
  assert.equal(h.updates.at(-1)[2], true, 'Boost can be auditioned on its own');
  h.settings.muted = true;
  h.preview.update();
  assert.equal(h.updates.at(-1)[1], 0);
  h.settings.muted = false;
  h.settings.volume = 0.2;
  h.preview.update();
  assert.equal(h.updates.at(-1)[1], 0.2);
  h.state.boost = false;
  h.preview.update();
  assert.equal(h.updates.at(-1)[2], false);
  h.preview.dispose();
  h.preview.dispose();
  assert.equal(h.disposals, 1);
});

test('loading, non-fleet tabs and losing focus silence propulsion independently of powerups', async () => {
  const h = harness();
  h.state.driving = true;
  h.preview.setEnabled(true);
  await h.preview.changed();
  h.state.available = false;
  h.preview.update();
  assert.equal(h.updates.at(-1)[2], false);
  h.state.available = true;
  h.preview.setForeground(false);
  assert.equal(h.updates.at(-1)[2], false);
  h.preview.setForeground(true);
  await h.preview.changed();
  assert.equal(h.updates.at(-1)[2], true);
  h.preview.setEnabled(false);
  assert.equal(h.updates.at(-1)[2], false);
  assert.equal(h.creations, 1, 'one private engine owner is reused');
  h.preview.dispose();
});

test('a delayed browser unlock cannot revive disabled or disposed audition audio', async () => {
  const h = harness();
  const finish = h.defer();
  h.state.boost = true;
  h.preview.setEnabled(true);
  const pending = h.preview.changed();
  h.preview.setEnabled(false);
  finish();
  await pending;
  assert.equal(h.updates.at(-1)[2], false);
  const finishAgain = h.defer();
  h.preview.setEnabled(true);
  const closing = h.preview.changed();
  h.preview.dispose();
  const count = h.updates.length;
  finishAgain();
  await closing;
  assert.equal(h.updates.length, count, 'no updates after disposal');
  assert.equal(h.disposals, 1);
});
