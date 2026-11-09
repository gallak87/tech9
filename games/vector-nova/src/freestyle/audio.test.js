import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFreestyleAudio,
  createFreestyleAudioBuffer,
  FREESTYLE_AUDIO_RULES,
} from './audio.js';

function context() {
  return {
    state: 'running',
    sampleRate: 22050,
    currentTime: 4,
    destination: {},
    nodes: [],
    createBuffer(channels, length, rate) {
      const data = Array.from(
        { length: channels },
        () => new Float32Array(length),
      );
      return { duration: length / rate, getChannelData: (i) => data[i] };
    },
    node(kind) {
      const node = {
        kind,
        disconnected: false,
        stops: [],
        connect(target) {
          this.target = target;
          return target;
        },
        disconnect() {
          this.disconnected = true;
        },
        start(at) {
          this.startedAt = at;
        },
        stop(at) {
          this.stops.push(at);
        },
        gain: {
          setValueAtTime(value, at) {
            this.value = value;
            this.at = at;
          },
        },
      };
      this.nodes.push(node);
      return node;
    },
    createBufferSource() {
      return this.node('source');
    },
    createGain() {
      return this.node('gain');
    },
  };
}
const bank = (id = 'transfer-1', quality = 'great') => ({
  type: 'freestyle-bank',
  payload: {
    id,
    at: 10,
    landed: true,
    clean: quality !== 'good',
    perfect: quality === 'perfect',
  },
});
const trick = (ordinal = 1) => ({
  type: 'freestyle-trick',
  payload: { id: 'transfer-1', kind: 'roll', ordinal },
});
const rms = (data) =>
  Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);

test('original catch voices are distinct, finite, bounded and end silently without a trailing transient', () => {
  const c = context();
  const fingerprints = [];
  for (const kind of ['good', 'great', 'perfect', 'trick']) {
    const buffer = createFreestyleAudioBuffer(c, kind);
    const samples = buffer.getChannelData(0);
    assert.ok(
      Math.abs(buffer.duration - FREESTYLE_AUDIO_RULES.durations[kind]) <
        1 / c.sampleRate,
    );
    assert.equal(samples[0], 0);
    assert.equal(Math.abs(samples.at(-1)), 0);
    assert.ok(samples.every(Number.isFinite));
    assert.ok(
      Math.max(...samples.map(Math.abs)) <= FREESTYLE_AUDIO_RULES.peak + 1e-6,
    );
    const tail = samples.slice(-Math.round(c.sampleRate * 0.025));
    const attack = samples.slice(0, Math.round(c.sampleRate * 0.025));
    assert.ok(
      rms(tail) < rms(attack) * 0.1,
      `${kind}: tail releases into silence`,
    );
    fingerprints.push(samples.slice(100, 108).join(','));
    assert.deepEqual(
      samples,
      createFreestyleAudioBuffer(c, kind).getChannelData(0),
    );
  }
  assert.equal(new Set(fingerprints).size, 4);
});

test('only real credited landing grades play; repeated delivery is silent and the owner routes through its supplied bus', () => {
  const c = context(),
    destination = {};
  const audio = createFreestyleAudio(c, destination);
  assert.equal(
    audio.trigger({ type: 'jump-transfer', payload: { outcome: 'landed' } }),
    false,
  );
  assert.equal(
    audio.trigger({
      type: 'freestyle-bank',
      payload: { landed: false, clean: true },
    }),
    false,
  );
  for (const [i, grade] of ['good', 'great', 'perfect'].entries()) {
    const event = bank(`transfer-${i + 1}`, grade);
    assert.equal(audio.trigger(event), true);
    assert.equal(audio.trigger(event), false);
    assert.equal(audio.getPresentation().lastGrade, grade);
    const source = c.nodes.filter((n) => n.kind === 'source').at(-1);
    assert.equal(source.target.target, destination);
    assert.equal(source.target.gain.value, FREESTYLE_AUDIO_RULES.gains[grade]);
    assert.equal(source.startedAt, c.currentTime);
    assert.equal(source.stops[0], c.currentTime + source.buffer.duration);
    source.onended();
    assert.equal(audio.getPresentation().activeVoices, 0);
  }
});

test('catch takes priority over trick ticks; voice cap, stop and disposal release every owned node', () => {
  const c = context(),
    audio = createFreestyleAudio(c, c.destination);
  assert.equal(audio.trigger(trick()), true);
  assert.equal(audio.trigger(trick()), false);
  assert.equal(audio.trigger(trick(2)), true);
  assert.equal(audio.trigger(trick(3)), false);
  assert.equal(audio.getPresentation().activeVoices, 2);
  const ticks = c.nodes.filter((n) => n.kind === 'source');
  assert.equal(audio.trigger(bank()), true);
  assert.ok(ticks.every((node) => node.disconnected));
  assert.equal(audio.getPresentation().activeVoices, 1);
  assert.equal(audio.trigger(trick(4)), false);
  audio.stop();
  assert.equal(audio.getPresentation().activeVoices, 0);
  assert.ok(c.nodes.every((node) => node.disconnected));
  assert.equal(
    audio.trigger(bank()),
    true,
    'a reset can replay the same transfer',
  );
  c.state = 'suspended';
  assert.equal(audio.trigger(bank('transfer-2')), false);
  audio.dispose();
  audio.dispose();
  assert.equal(audio.getPresentation().activeVoices, 0);
  assert.ok(c.nodes.every((node) => node.disconnected));
  c.state = 'running';
  assert.equal(audio.trigger(bank('transfer-3')), false);
});
