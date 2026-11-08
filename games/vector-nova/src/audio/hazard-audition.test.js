import test from 'node:test';
import assert from 'node:assert/strict';
import { soundEffects } from './sounds.js';
import { createSoundPreview } from './sound-preview.js';
import { HAZARD_CONTACT_AUDIO } from './hazard-contact.js';

function fixture() {
  const drivers = [],
    timers = new Set(),
    statuses = [],
    factories = [];
  const settings = { masterVolume: 0.5, volume: 0.4 };
  let pendingUnlock = null;
  const preview = createSoundPreview({
    getSettings: () => settings,
    onStatus: (status) => statuses.push(status),
    createContactAudio(context, bus, options) {
      factories.push({ context, bus, options });
      return {};
    },
    createRaceAudio(options) {
      const audio = {
        options,
        frames: [],
        updates: [],
        disposals: 0,
        loaded: true,
        unlock: () => pendingUnlock ?? Promise.resolve(true),
        getStatus: () => ({ loadedSamples: [] }),
        getPresentation() {
          return { loaded: this.loaded };
        },
        update(...args) {
          this.updates.push(args);
        },
        setEnvironment(frame) {
          this.frames.push(frame);
        },
        async dispose() {
          this.disposals++;
        },
      };
      drivers.push(audio);
      return audio;
    },
    schedule(callback, duration) {
      const timer = { callback, duration };
      timers.add(timer);
      return timer;
    },
    cancel(timer) {
      timers.delete(timer);
    },
  });
  return {
    preview,
    drivers,
    timers,
    settings,
    statuses,
    factories,
    deferUnlock() {
      let resolve;
      pendingUnlock = new Promise((done) => {
        resolve = done;
      });
      return () => {
        resolve(true);
        pendingUnlock = null;
      };
    },
  };
}

test('the canonical Sounds inventory exposes one shared fire texture for menu and docked inspector use', () => {
  const hazards = soundEffects.filter((sound) => sound.hazard);
  assert.deepEqual(
    hazards.map(({ id, label, hazard, group, bus, seconds }) => ({
      id,
      label,
      hazard,
      group,
      bus,
      seconds,
    })),
    [
      {
        id: 'fire-contact',
        label: 'Fire · bonfire crackle',
        hazard: true,
        group: 'World contact',
        bus: 'race',
        seconds: 3,
      },
    ],
  );
  assert.equal(
    new Set(soundEffects.map(({ id }) => id)).size,
    soundEffects.length,
  );
});

test('a contact audition uses only the real world-audio owner and shares gain, bounded loop and release', async () => {
  const f = fixture();
  assert.equal(await f.preview.play('fire-contact'), true);
  const audio = f.drivers.at(-1);
  assert.equal(audio.options.engine, false);
  assert.deepEqual(
    audio.options.samples,
    {},
    'do not decode unrelated race announcements for a contact audition',
  );
  const context = {},
    bus = {};
  audio.options.environment(context, bus);
  assert.equal(f.factories.at(-1).context, context);
  assert.equal(f.factories.at(-1).bus, bus);
  assert.deepEqual(Object.keys(f.factories.at(-1).options), ['readFeedback']);
  assert.equal(
    f.factories.at(-1).options.readFeedback(audio.frames[0]).contact,
    1,
  );
  assert.equal(
    audio.updates[0][1],
    0.2,
    'Master and effects multiply only once through the shared owner',
  );
  assert.equal(f.timers.size, 1);
  const loop = [...f.timers][0];
  assert.equal(loop.duration, 3000);
  loop.callback();
  assert.equal(audio.frames.at(-1).feedback.contact, 0);
  assert.equal(
    f.timers.size,
    1,
    'replace the contact timer with one release timer',
  );
  const release = [...f.timers][0];
  assert.equal(release.duration, HAZARD_CONTACT_AUDIO.releaseSeconds * 1000);
  f.preview.configure();
  assert.equal(
    audio.frames.at(-1).feedback.contact,
    0,
    'a settings refresh cannot restart a releasing loop',
  );
  assert.equal(audio.frames.at(-1).feedback.envelope, 0);
  release.callback();
  assert.equal(audio.disposals, 1);
  assert.equal(f.timers.size, 0);
  f.preview.dispose();
});

test('replacement, muting, missing samples and a late unlock cannot leave a contact audition running', async () => {
  const f = fixture();
  await f.preview.play('fire-contact');
  await f.preview.play('fire-contact');
  assert.equal(f.drivers[0].disposals, 1);
  assert.equal(f.timers.size, 1);
  f.settings.volume = 0;
  f.preview.configure();
  assert.equal(f.drivers[1].disposals, 1);
  assert.equal(f.timers.size, 0);
  f.settings.volume = 0.4;
  const finish = f.deferUnlock();
  const pending = f.preview.play('fire-contact');
  f.preview.stop();
  finish();
  assert.equal(await pending, false);
  assert.equal(f.drivers[2].frames.length, 0);
  assert.equal(f.drivers[2].disposals, 1);
  const missingReady = f.deferUnlock();
  const missing = f.preview.play('fire-contact');
  f.drivers[3].loaded = false;
  missingReady();
  assert.equal(await missing, false);
  assert.equal(f.statuses.at(-1), 'Sample unavailable: fire-contact');
  assert.equal(f.drivers[3].frames.length, 0);
  assert.equal(f.drivers[3].disposals, 1);
  assert.equal(f.timers.size, 0);
  f.preview.dispose();
});
