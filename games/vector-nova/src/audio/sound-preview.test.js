import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundPreview } from './sound-preview.js';

function harness() {
  const drivers = [];
  const timers = new Set();
  const settings = { volume: 0.35 };
  const statuses = [];
  let nextUnlock;
  const createDriver = (options) => {
    const driver = {
      options,
      events: [],
      updates: [],
      disposals: 0,
      unlock: () => nextUnlock ?? Promise.resolve(true),
      update(...args) {
        this.updates.push(args);
      },
      setImmersion(value) {
        this.submerged = value;
      },
      setEffects(value) {
        this.effects = value;
      },
      event(event) {
        this.events.push(event);
      },
      async dispose() {
        this.disposals++;
      },
    };
    drivers.push(driver);
    return driver;
  };
  const preview = createSoundPreview({
    getSettings: () => settings,
    onStatus: (status) => statuses.push(status),
    createRaceAudio: createDriver,
    createDeviceAudio: createDriver,
    schedule(callback, duration) {
      const timer = { callback, duration };
      timers.add(timer);
      return timer;
    },
    cancel: (timer) => timers.delete(timer),
  });
  return {
    preview,
    drivers,
    timers,
    settings,
    statuses,
    deferUnlock() {
      let resolve;
      nextUnlock = new Promise((done) => {
        resolve = done;
      });
      return () => {
        resolve(true);
        nextUnlock = undefined;
      };
    },
  };
}

test('audition uses current pickup events, replaces the previous cue and releases its timer', async () => {
  const { preview, drivers, timers } = harness();
  await preview.play('vector-activate');
  assert.deepEqual(drivers[0].events, [
    { type: 'pickup-activate', payload: { kind: 'vector' } },
  ]);
  await preview.play('ion-bed');
  assert.equal(drivers[0].disposals, 1);
  assert.deepEqual(drivers[1].effects, { ion: true });
  assert.equal(timers.size, 1);
  const timer = [...timers][0];
  assert.equal(timer.duration, 3000);
  timer.callback();
  assert.equal(drivers[1].disposals, 1);
  assert.equal(timers.size, 0);
  preview.dispose();
  assert.equal(drivers[1].disposals, 1);
});

test('muting during audition releases audio and a late unlock cannot restart a stopped preview', async () => {
  const h = harness();
  const resume = h.deferUnlock();
  const pending = h.preview.play('vector-activate');
  h.preview.stop();
  resume();
  assert.equal(await pending, false);
  assert.equal(h.drivers[0].events.length, 0);
  assert.equal(h.drivers[0].disposals, 1);
  await h.preview.play('arc-fire');
  h.settings.volume = 0;
  h.preview.configure();
  assert.equal(h.drivers[1].disposals, 1);
  assert.equal(h.statuses.at(-1), 'Effects muted');
  assert.equal(h.timers.size, 0);
  h.preview.dispose();
  assert.equal(await h.preview.play('arc-fire'), false);
});

test('environment previews omit propulsion and only the selected environment is acquired', async () => {
  const { preview, drivers } = harness();
  await preview.play('nacre-thunder-submerged');
  assert.equal(drivers[0].options.engine, false);
  assert.equal(drivers[0].options.nacre, true);
  assert.equal(drivers[0].options.environment, undefined);
  assert.equal(drivers[0].submerged, 1);
  await preview.play('glasswake-shelf');
  assert.equal(drivers[1].options.engine, false);
  assert.equal(drivers[1].options.nacre, false);
  assert.equal(typeof drivers[1].options.environment, 'function');
  await preview.play('engine-boost');
  assert.equal(drivers[2].options.engine, true);
  assert.equal(drivers[2].updates[0][0].boosting, true);
  preview.dispose();
});
