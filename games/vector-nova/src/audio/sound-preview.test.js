import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundPreview } from './sound-preview.js';
import { RACE_SAMPLES } from './sample-cues.js';
import { DEVICE_SAMPLES } from '../pickups/sample-cues.js';

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
      loadedSamples: Object.keys({ ...DEVICE_SAMPLES, ...RACE_SAMPLES }),
      cueDuration: 0,
      presentation: { loaded: true },
      getStatus() {
        return { loadedSamples: this.loadedSamples, landing: { loaded: true } };
      },
      getPresentation() {
        return this.presentation;
      },
      duration() {
        return this.cueDuration;
      },
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

test('race cues omit propulsion while engine presets acquire it; removed environment previews do nothing', async () => {
  const { preview, drivers } = harness();
  assert.equal(await preview.play('nacre-thunder-submerged'), false);
  assert.equal(await preview.play('glasswake-shelf'), false);
  assert.equal(drivers.length, 0);
  await preview.play('countdown-go');
  assert.equal(drivers[0].options.engine, false);
  await preview.play('engine-boost');
  assert.equal(drivers[1].options.engine, true);
  assert.equal(drivers[1].updates[0][0].boosting, true);
  preview.dispose();
});

test('missing generated cues report a load failure instead of auditioning old synthesis', async () => {
  const h = harness();
  const resume = h.deferUnlock();
  const playing = h.preview.play('arc-hit');
  h.drivers[0].loadedSamples = [];
  resume();
  assert.equal(await playing, false);
  assert.equal(h.drivers[0].events.length, 0);
  assert.equal(h.drivers[0].disposals, 1);
  assert.equal(h.statuses.at(-1), 'Sample unavailable: arc-hit');
  assert.equal(h.timers.size, 0);
  h.preview.dispose();
});

test('a decoded cue keeps its full tail even when longer than the catalog estimate', async () => {
  const h = harness();
  const resume = h.deferUnlock();
  const playing = h.preview.play('arc-hit');
  h.drivers[0].cueDuration = 1.2;
  resume();
  assert.equal(await playing, true);
  assert.equal([...h.timers][0].duration, 1300);
  h.preview.dispose();
});

test('landing and Freestyle auditions route their real owners without propulsion or an extra landing thunk', async () => {
  const h = harness();
  await h.preview.play('landing-catch');
  assert.deepEqual(
    h.drivers[0].events.map(({ type }) => type),
    ['landing-catch'],
  );
  assert.equal(h.drivers[0].options.engine, false);
  await h.preview.play('freestyle-bank-perfect');
  const driver = h.drivers[1];
  assert.equal(driver.options.engine, false);
  assert.equal(typeof driver.options.environment, 'function');
  assert.deepEqual(driver.options.samples, {});
  assert.deepEqual(
    driver.events.map(({ type }) => type),
    ['freestyle-bank'],
  );
  assert.equal(driver.events[0].payload.perfect, true);
  await h.preview.play('freestyle-trick');
  assert.equal(h.drivers[2].events[0].type, 'freestyle-trick');
  assert.equal(h.drivers[2].events[0].payload.ordinal, 1);
  h.preview.dispose();
});

test('a missing graded reward reports the missing recording and never substitutes synthesis', async () => {
  const h = harness();
  const resume = h.deferUnlock();
  const playing = h.preview.play('freestyle-bank-great');
  h.drivers[0].presentation.loaded = false;
  resume();
  assert.equal(await playing, false);
  assert.equal(h.drivers[0].events.length, 0);
  assert.equal(h.statuses.at(-1), 'Sample unavailable: freestyle-bank-great');
  h.preview.dispose();
});
