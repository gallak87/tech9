import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFreestyleAudio,
  FREESTYLE_AUDIO_RULES,
  FREESTYLE_SAMPLES,
} from './audio.js';

const durations = { good: 0.35, great: 0.45, perfect: 0.65, trick: 0.1 };
const sampleIds = Object.keys(FREESTYLE_SAMPLES);
function rig({ missing = new Set() } = {}) {
  const requests = [],
    decoded = [];
  const context = {
    state: 'running',
    currentTime: 4,
    nodes: [],
    destination: {},
    async decodeAudioData(bytes) {
      const cue = sampleIds[new Uint8Array(bytes)[0]];
      decoded.push(cue);
      return { cue, duration: durations[cue] };
    },
    createBuffer() {
      assert.fail('recorded feedback has no procedural fallback');
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
        playbackRate: { value: 1 },
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
  const audio = createFreestyleAudio(context, context.destination, {
    async fetchAudio(url, { signal }) {
      const cue = sampleIds.find((id) => FREESTYLE_SAMPLES[id] === url);
      assert.ok(cue);
      requests.push({ cue, signal });
      return {
        ok: !missing.has(cue),
        arrayBuffer: async () =>
          new Uint8Array([sampleIds.indexOf(cue)]).buffer,
      };
    },
  });
  return { audio, context, requests, decoded };
}
const bank = (id = 'transfer-1', quality = 'great', chain = 1) => ({
  type: 'freestyle-bank',
  payload: {
    id,
    at: 10,
    landed: true,
    clean: quality !== 'good',
    perfect: quality === 'perfect',
    chain,
  },
});
const trick = (ordinal = 1, kind = 'roll') => ({
  type: 'freestyle-trick',
  payload: { id: 'transfer-1', kind, ordinal },
});
const sources = (context) =>
  context.nodes.filter((node) => node.kind === 'source');

// The actual generated WAV format and bounds are checked by the asset pipeline;
// these tests exercise the decoded source used by real gameplay and previews.
test('recorded reward sources prepare once and never replay an event missed during loading', async () => {
  const { audio, requests, decoded, context } = rig();
  assert.equal(audio.duration(bank()), 0);
  assert.equal(audio.trigger(bank()), false);
  assert.deepEqual(await Promise.all([audio.prepare(), audio.prepare()]), [
    true,
    true,
  ]);
  assert.equal(requests.length, 4);
  assert.deepEqual(decoded, sampleIds);
  assert.equal(audio.getPresentation().loaded, true);
  assert.deepEqual(audio.getPresentation().loadedSamples, sampleIds);
  assert.deepEqual(audio.getPresentation().missingSamples, []);
  assert.deepEqual(audio.getPresentation().durations, durations);
  assert.equal(
    audio.trigger(bank()),
    false,
    'loading does not queue a stale bank',
  );
  assert.equal(sources(context).length, 0);
  await audio.prepare();
  assert.equal(requests.length, 4);
  audio.dispose();
});

test('only accepted banks play their distinct grade recording, separate from touchdown and point counting', async () => {
  const { audio, context } = rig();
  await audio.prepare();
  for (const event of [
    { type: 'jump-transfer', payload: { id: 'jump-1', outcome: 'landed' } },
    { type: 'landing-catch', payload: { id: 'jump-1', at: 10 } },
    { type: 'freestyle-score', payload: { id: 'jump-1', points: 500 } },
    {
      type: 'freestyle-bank',
      payload: { id: 'jump-1', at: 10, landed: false, perfect: true },
    },
    { type: 'freestyle-bank', payload: { landed: true } },
    { ...bank(), payload: { ...bank().payload, at: NaN } },
  ])
    assert.equal(audio.trigger(event), false);
  for (const [index, grade] of ['good', 'great', 'perfect'].entries()) {
    const event = bank(`transfer-${index + 1}`, grade);
    assert.equal(audio.trigger(event), true);
    assert.equal(audio.trigger(event), false);
    const source = sources(context).at(-1);
    assert.equal(source.buffer.cue, grade);
    assert.equal(source.target.target, context.destination);
    assert.equal(source.target.gain.value, FREESTYLE_AUDIO_RULES.gains[grade]);
    assert.equal(source.startedAt, context.currentTime);
    assert.equal(source.playbackRate.value, 1);
    assert.equal(source.stops[0], context.currentTime + durations[grade]);
    assert.equal(audio.duration(event), durations[grade]);
    assert.equal(audio.getPresentation().lastGrade, grade);
    source.onended();
    assert.equal(audio.getPresentation().activeVoices, 0);
  }
  audio.dispose();
});

test('chain pitch rises subtly within a bound while gain and the authored grade remain unchanged', async () => {
  const { audio, context } = rig();
  await audio.prepare();
  const rates = [];
  for (const [index, chain] of [1, 2, 3, 4, 5, 99, -1, NaN].entries()) {
    const event = bank(`transfer-${index}`, 'perfect', chain);
    assert.equal(audio.trigger(event), true);
    const source = sources(context).at(-1);
    rates.push(source.playbackRate.value);
    assert.equal(source.target.gain.value, FREESTYLE_AUDIO_RULES.gains.perfect);
    assert.equal(source.buffer.cue, 'perfect');
    assert.equal(
      audio.duration(event),
      durations.perfect / source.playbackRate.value,
    );
    assert.equal(source.stops[0], context.currentTime + audio.duration(event));
    source.onended();
  }
  assert.equal(rates[0], 1);
  assert.ok(rates[1] > rates[0] && rates[4] > rates[3]);
  assert.ok(rates.every((rate) => rate >= 1 && rate < 1.09));
  assert.equal(rates[5], rates[4]);
  assert.equal(rates[6], 1);
  assert.equal(rates[7], 1);
  audio.dispose();
});

test('banks win over completed-trick ticks; rejected or over-budget cues are never deferred', async () => {
  const { audio, context } = rig();
  await audio.prepare();
  assert.equal(audio.trigger(trick()), true);
  assert.equal(audio.trigger(trick()), false);
  assert.equal(audio.trigger(trick(2, 'flip')), true);
  assert.equal(audio.trigger(trick(3, 'spin')), false);
  assert.equal(audio.getPresentation().activeVoices, 2);
  const ticks = sources(context);
  assert.equal(
    ticks[0].buffer,
    ticks[1].buffer,
    'trick kinds share the restrained source',
  );
  assert.ok(ticks[1].playbackRate.value > ticks[0].playbackRate.value);
  assert.equal(audio.trigger(bank()), true);
  assert.ok(ticks.every((node) => node.disconnected));
  assert.equal(audio.getPresentation().activeVoices, 1);
  assert.equal(audio.trigger(trick(4)), false);
  sources(context).at(-1).onended();
  assert.equal(audio.trigger(trick(3)), false);
  assert.equal(audio.trigger(trick(4)), false);
  assert.equal(audio.trigger(trick(5, 'corkscrew')), true);
  assert.equal(audio.getPresentation().lastCue, 'trick:corkscrew');
  assert.equal(audio.getPresentation().lastGrade, 'great');
  audio.dispose();
});

test('active source deadlines expose only real remaining tails, while stop/reset/suspend/disposal stay immediate', async () => {
  const { audio, context, requests } = rig();
  await audio.prepare();
  const event = bank('transfer-1', 'perfect', 5);
  assert.equal(audio.trigger(event), true);
  const duration = audio.duration(event);
  assert.ok(Math.abs(audio.remainingSeconds() - duration) < 1e-12);
  context.currentTime += duration / 2;
  assert.ok(Math.abs(audio.remainingSeconds() - duration / 2) < 1e-12);
  context.currentTime += duration;
  assert.equal(
    audio.remainingSeconds(),
    0,
    'an expired source has no remaining tail',
  );
  audio.stop();
  assert.equal(audio.getPresentation().activeVoices, 0);
  assert.ok(context.nodes.every((node) => node.disconnected));
  assert.equal(
    audio.trigger(event),
    true,
    'reset can audition the same transfer again',
  );
  audio.reset();
  assert.equal(audio.remainingSeconds(), 0);
  context.state = 'suspended';
  assert.equal(audio.trigger(bank('transfer-2')), false);
  context.state = 'running';
  assert.equal(audio.trigger(bank('transfer-2')), true);
  audio.dispose();
  audio.dispose();
  assert.equal(audio.remainingSeconds(), 0);
  assert.equal(audio.getPresentation().activeVoices, 0);
  assert.ok(context.nodes.every((node) => node.disconnected));
  assert.ok(requests.every(({ signal }) => signal.aborted));
  assert.equal(audio.trigger(bank('transfer-3')), false);
  assert.equal(await audio.prepare(), false);
});

test('a missing recording stays silent and visible to previews, with no synthesized substitute', async () => {
  const missing = new Set(['great']);
  const { audio, context, requests } = rig({ missing });
  assert.equal(await audio.prepare(), false);
  assert.equal(audio.getPresentation().loaded, false);
  assert.deepEqual(audio.getPresentation().missingSamples, ['great']);
  const event = bank();
  assert.equal(audio.trigger(event), false);
  assert.equal(audio.duration(event), 0);
  assert.equal(audio.remainingSeconds(), 0);
  assert.equal(sources(context).length, 0);
  missing.clear();
  assert.equal(await audio.prepare(), true);
  assert.equal(requests.filter(({ cue }) => cue === 'great').length, 2);
  assert.equal(
    audio.trigger(event),
    false,
    'a once-missed reward never arrives late',
  );
  assert.equal(audio.trigger(bank('transfer-2')), true);
  audio.dispose();
});
