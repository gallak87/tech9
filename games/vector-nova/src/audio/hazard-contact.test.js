import test from 'node:test';
import { setImmediate } from 'node:timers';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  createHazardContactAudio,
  HAZARD_CONTACT_AUDIO,
} from './hazard-contact.js';

class Param {
  value = 0;
  changes = [];
  setValueAtTime(value, time) {
    this.value = value;
    this.changes.push({ value, time });
  }
  cancelAndHoldAtTime() {}
  linearRampToValueAtTime(value, time) {
    this.value = value;
    this.changes.push({ value, time });
  }
}
function fixture({ available = true, decode } = {}) {
  const nodes = [];
  let requests = 0;
  const context = {
    state: 'running',
    currentTime: 0,
    decodeAudioData: decode ?? (async () => ({ duration: 2 })),
    node(kind) {
      const node = {
        kind,
        gain: new Param(),
        starts: 0,
        stops: 0,
        disconnected: false,
        connect(target) {
          this.target = target;
          return target;
        },
        disconnect() {
          this.disconnected = true;
        },
        start() {
          this.starts++;
        },
        stop() {
          this.stops++;
        },
      };
      nodes.push(node);
      return node;
    },
    createBufferSource() {
      return this.node('source');
    },
    createGain() {
      return this.node('gain');
    },
  };
  const destination = {};
  const audio = createHazardContactAudio(context, destination, {
    kind: 'fire',
    readFeedback: (frame) => frame.feedback,
    fetchAudio: async () => {
      requests++;
      return { ok: available, arrayBuffer: async () => new ArrayBuffer(8) };
    },
  });
  const frame = (contact, extra = {}) => ({
    mode: 'racing',
    feedback: { contact, envelope: 1 },
    ...extra,
  });
  return {
    context,
    audio,
    nodes,
    destination,
    frame,
    requests: () => requests,
  };
}

test('one prepared sample follows solved contact with a bounded onset, loop and release instead of per-frame voices', async () => {
  const f = fixture();
  await f.audio.prepare();
  await f.audio.prepare();
  assert.equal(f.requests(), 1);
  assert.equal(f.nodes.length, 0, 'decoding never starts an ambient voice');
  f.audio.update(f.frame(0));
  assert.equal(f.nodes.length, 0);
  f.audio.update(f.frame(1));
  const source = f.nodes.find(({ kind }) => kind === 'source');
  const gain = f.nodes.find(({ kind }) => kind === 'gain');
  assert.equal(source.loop, true);
  assert.equal(source.target, gain);
  assert.equal(gain.target, f.destination);
  assert.equal(gain.gain.value, HAZARD_CONTACT_AUDIO.fire.gain);
  assert.equal(
    gain.gain.changes.at(-1).time,
    HAZARD_CONTACT_AUDIO.attackSeconds,
  );
  const changes = gain.gain.changes.length;
  for (let frame = 0; frame < 500; frame++) f.audio.update(f.frame(1));
  assert.equal(f.audio.getPresentation().starts, 1);
  assert.equal(
    gain.gain.changes.length,
    changes,
    'steady contact does not add automation every frame',
  );
  f.audio.update(f.frame(0));
  assert.equal(f.audio.getPresentation().releasing, true);
  assert.equal(
    gain.gain.changes.at(-1).time,
    HAZARD_CONTACT_AUDIO.releaseSeconds,
  );
  f.context.currentTime = 0.09;
  f.audio.update(f.frame(0.5));
  assert.equal(
    f.audio.getPresentation().starts,
    1,
    're-entry reuses a releasing source',
  );
  assert.equal(f.audio.getPresentation().releasing, false);
  f.audio.update(f.frame(0));
  f.context.currentTime += HAZARD_CONTACT_AUDIO.releaseSeconds;
  f.audio.update(f.frame(0));
  assert.equal(f.audio.getPresentation().activeVoices, 0);
  assert.ok(f.nodes.every(({ disconnected }) => disconnected));
  f.audio.dispose();
});

test('title, pause, results, recovery reset, invalid feedback and a suspended context cannot retain audible contact', async () => {
  const f = fixture();
  await f.audio.prepare();
  for (const mode of [
    'title',
    'paused',
    'results',
    'countdown',
    'overview',
    'fly',
  ]) {
    f.audio.update(f.frame(1, { mode }));
    assert.equal(f.audio.getPresentation().activeVoices, 0);
    f.audio.update(f.frame(1));
    assert.equal(f.audio.getPresentation().activeVoices, 1);
    f.audio.update(f.frame(1, { mode }));
    assert.equal(f.audio.getPresentation().activeVoices, 0);
  }
  f.audio.update(f.frame(1));
  f.audio.update(f.frame(1, { reset: true }));
  assert.equal(f.audio.getPresentation().activeVoices, 0);
  for (const contact of [undefined, NaN, Infinity, -1])
    f.audio.update(f.frame(contact));
  assert.equal(f.audio.getPresentation().activeVoices, 0);
  f.context.state = 'suspended';
  f.audio.update(f.frame(1));
  assert.equal(f.audio.getPresentation().activeVoices, 0);
  f.context.state = 'running';
  f.audio.update(f.frame(1));
  f.audio.stop();
  assert.equal(f.audio.getPresentation().activeVoices, 0);
  f.audio.dispose();
  f.audio.dispose();
  f.audio.update(f.frame(1));
  assert.equal(f.audio.getPresentation().activeVoices, 0);
  assert.ok(f.nodes.every(({ disconnected }) => disconnected));
});

test('reduced motion keeps the same restrained contact sound and release, without altering its voice budget', async () => {
  const f = fixture();
  await f.audio.prepare();
  f.audio.update(f.frame(1, { settings: { reducedMotion: true } }));
  assert.equal(f.audio.getPresentation().activeVoices, 1);
  assert.equal(
    f.audio.getPresentation().maxGain,
    HAZARD_CONTACT_AUDIO.fire.gain,
  );
  f.audio.update(f.frame(0, { settings: { reducedMotion: true } }));
  assert.equal(f.audio.getPresentation().releasing, true);
  f.audio.dispose();
});

test('missing or late audio stays silent until a current supported contact; disposal aborts ownership', async () => {
  const absent = fixture({ available: false });
  await absent.audio.prepare();
  absent.audio.update(absent.frame(1));
  assert.equal(absent.audio.getPresentation().activeVoices, 0);
  assert.equal(absent.audio.getPresentation().missing.length, 1);
  absent.audio.dispose();
  let finish;
  const late = fixture({
    decode: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const pending = late.audio.prepare();
  await new Promise((resolve) => setImmediate(resolve));
  late.audio.update(late.frame(1));
  late.audio.update(late.frame(0));
  finish({ duration: 2 });
  await pending;
  assert.equal(
    late.audio.getPresentation().activeVoices,
    0,
    'a loaded sample never replays a stale contact',
  );
  late.audio.update(late.frame(0));
  assert.equal(late.audio.getPresentation().activeVoices, 0);
  late.audio.update(late.frame(1));
  assert.equal(late.audio.getPresentation().activeVoices, 1);
  late.audio.dispose();
  assert.equal(late.audio.getPresentation().loaded, false);
  let finishDisposed;
  const disposed = fixture({
    decode: () =>
      new Promise((resolve) => {
        finishDisposed = resolve;
      }),
  });
  const disposalPending = disposed.audio.prepare();
  await new Promise((resolve) => setImmediate(resolve));
  disposed.audio.dispose();
  finishDisposed({ duration: 2 });
  await disposalPending;
  disposed.audio.update(disposed.frame(1));
  assert.equal(disposed.audio.getPresentation().loaded, false);
  assert.equal(
    disposed.nodes.length,
    0,
    'a late decoder cannot revive a disposed world',
  );
});

test('committed generated textures match their provenance and small mono loop budget', async () => {
  const base = new URL('../../assets/audio/sfx/', import.meta.url);
  const provenance = JSON.parse(
    await readFile(new URL('hazard-contact-provenance.json', base)),
  );
  for (const [id, cue] of Object.entries(provenance.cues)) {
    const wav = await readFile(new URL(id + '.wav', base));
    const config = await readFile(new URL(cue.config, base));
    assert.equal(createHash('sha256').update(wav).digest('hex'), cue.sha256);
    assert.equal(
      createHash('sha256').update(config).digest('hex'),
      cue.configSha256,
    );
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt32LE(24), 24000);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.ok(wav.length < 120000);
    assert.ok(cue.seconds > 1.5 && cue.seconds < 2.5);
    assert.ok(cue.peakDbfs < -6 && cue.rmsDbfs > -30);
    let ordinaryDelta = 0;
    for (let offset = 46; offset < wav.length; offset += 2)
      ordinaryDelta += Math.abs(
        wav.readInt16LE(offset) - wav.readInt16LE(offset - 2),
      );
    ordinaryDelta /= (wav.length - 44) / 2 - 1;
    assert.ok(
      Math.abs(wav.readInt16LE(44) - wav.readInt16LE(wav.length - 2)) <=
        ordinaryDelta,
      'the loop boundary adds less of a step than the average ordinary crackle sample',
    );
  }
});
