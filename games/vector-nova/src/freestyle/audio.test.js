import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFreestyleAudio,
  FREESTYLE_AUDIO_RULES,
  FREESTYLE_SAMPLES,
} from './audio.js';

const durations = {
  good: 0.26,
  great: 2,
  perfect: 2,
  miss: 2,
  trick: 0.06,
};
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
    landed: quality !== 'miss',
    clean: quality === 'great' || quality === 'perfect',
    perfect: quality === 'perfect',
    chain,
  },
});
const tick = (ordinal = 1) => ({
  type: 'freestyle-score-tick',
  payload: { id: 'transfer-1', ordinal },
});
const scoreFrame = (points, clock, flight = {}) => ({
  mode: 'racing',
  motion: {
    freestyle: {
      clock,
      flight: { id: 'transfer-1', rotationPoints: points, ...flight },
    },
  },
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
  assert.equal(requests.length, 5);
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
  assert.equal(requests.length, 5);
  audio.dispose();
});

test('only confirmed banks and misses play their grade recording, separate from touchdown and point counting', async () => {
  const { audio, context } = rig();
  await audio.prepare();
  for (const event of [
    { type: 'jump-transfer', payload: { id: 'jump-1', outcome: 'landed' } },
    { type: 'landing-catch', payload: { id: 'jump-1', at: 10 } },
    { type: 'freestyle-score', payload: { id: 'jump-1', points: 500 } },
    {
      type: 'freestyle-bank',
      payload: { id: 'jump-1', at: 10, landed: 'false', perfect: true },
    },
    { type: 'freestyle-bank', payload: { landed: true } },
    { ...bank(), payload: { ...bank().payload, at: NaN } },
  ])
    assert.equal(audio.trigger(event), false);
  for (const [index, grade] of ['good', 'great', 'perfect', 'miss'].entries()) {
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

test('chains preserve the recorded pitch, gain and authored grade', async () => {
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
  assert.deepEqual(rates, Array(8).fill(1));
  audio.dispose();
});

test('confirmed misses sound once after failure; airborne misses, pending recovery and transfers stay silent', async () => {
  const { audio, context } = rig();
  await audio.prepare();
  assert.equal(audio.trigger(tick()), true);
  const tallySource = sources(context).at(-1);
  for (const event of [
    { type: 'jump-miss', payload: { id: 'transfer-1', at: 10 } },
    {
      type: 'jump-transfer',
      payload: { id: 'transfer-1', at: 10, outcome: 'missed' },
    },
    { type: 'road-recovery', payload: { id: 'transfer-1', at: 10 } },
    { type: 'freestyle-score', payload: { id: 'transfer-1', points: 0 } },
  ])
    assert.equal(audio.trigger(event), false);
  assert.equal(audio.getPresentation().lastGrade, null);
  assert.equal(
    sources(context).length,
    1,
    'no failure cue while recovery is pending',
  );
  const event = bank('transfer-1', 'miss', 0);
  event.payload.bank = 0;
  assert.equal(audio.trigger(event), true);
  assert.equal(
    tallySource.disconnected,
    true,
    'confirmed failure takes priority over score ticks',
  );
  const source = sources(context).at(-1);
  assert.equal(source.buffer.cue, 'miss');
  assert.equal(source.playbackRate.value, 1);
  assert.equal(source.target.gain.value, FREESTYLE_AUDIO_RULES.gains.miss);
  assert.equal(audio.getPresentation().lastGrade, 'miss');
  assert.ok(Math.abs(audio.remainingSeconds() - durations.miss) < 1e-12);
  assert.equal(audio.duration(event), durations.miss);
  assert.equal(audio.trigger(event), false);
  assert.equal(
    audio.trigger({ type: 'jump-miss', payload: event.payload }),
    false,
  );
  assert.equal(
    sources(context).length,
    2,
    'repeated failure delivery cannot double the cue',
  );
  source.onended();
  assert.equal(
    audio.trigger(event),
    false,
    'an already confirmed miss cannot arrive late',
  );
  assert.equal(audio.remainingSeconds(), 0);
  audio.dispose();
});

test('completed rotations are silent; tally ticks retain the recording and pitch', async () => {
  const { audio, context } = rig();
  await audio.prepare();
  for (const [index, kind] of ['roll', 'flip', 'spin', 'corkscrew'].entries()) {
    const completed = {
      type: 'freestyle-trick',
      payload: { id: 'transfer-1', ordinal: index + 1, kind },
    };
    assert.equal(audio.trigger(completed), false);
    assert.equal(audio.duration(completed), 0);
  }
  assert.equal(sources(context).length, 0);
  audio.update(scoreFrame(0, 0));
  assert.equal(audio.update(scoreFrame(24, 0.03)), false);
  assert.equal(audio.update(scoreFrame(25, 0.04)), true);
  const source = sources(context).at(-1);
  assert.equal(source.buffer.cue, 'trick');
  assert.equal(source.playbackRate.value, 1);
  assert.equal(source.target.gain.value, FREESTYLE_AUDIO_RULES.gains.trick);
  assert.equal(audio.duration(tick()), durations.trick);
  assert.equal(source.stops[0], context.currentTime + durations.trick);
  assert.equal(audio.getPresentation().lastCue, 'score-tick');
  assert.equal(audio.update(scoreFrame(25, 0.04)), false);
  assert.equal(
    source.disconnected,
    false,
    'duplicate render does not cut a tick',
  );
  assert.equal(audio.update(scoreFrame(25, 0.05)), false);
  assert.equal(source.disconnected, true, 'release stops the tally');
  audio.dispose();
});

test('25-point cadence survives render quantization and never exceeds 32 ticks per second', async () => {
  for (const fps of [30, 60, 144]) {
    const { audio, context } = rig();
    await audio.prepare();
    audio.update(scoreFrame(0, 0));
    for (let i = 1; i <= fps * 2; i++) {
      const time = i / fps;
      context.currentTime = 4 + time;
      for (const source of sources(context))
        if (!source.disconnected && source.stops[0] <= context.currentTime)
          source.onended();
      audio.update(scoreFrame(time * 800, time));
    }
    const starts = sources(context).map((source) => source.startedAt);
    assert.ok(starts.length >= 56 && starts.length <= 64, `${fps} FPS cadence`);
    for (let i = 1; i < starts.length; i++)
      assert.ok(starts[i] - starts[i - 1] >= 1 / 32 - 1e-9);
    audio.dispose();
  }
});

test('slow frames, loading, pause and restored flights never queue a catch-up tally', async () => {
  const { audio, context } = rig();
  audio.update(scoreFrame(0, 0));
  assert.equal(audio.update(scoreFrame(500, 1)), false);
  await audio.prepare();
  assert.equal(audio.update(scoreFrame(510, 1.1)), false);
  assert.equal(audio.update(scoreFrame(1500, 2)), true);
  assert.equal(sources(context).length, 1, 'a slow frame sounds only once');
  context.currentTime += 0.01;
  assert.equal(audio.update(scoreFrame(1600, 2.01)), false);
  context.currentTime += 0.2;
  assert.equal(
    audio.update(scoreFrame(1600, 2.25)),
    false,
    'release drops a due tick',
  );
  assert.equal(audio.update(scoreFrame(1610, 2.3)), false);
  audio.stop();
  assert.equal(
    audio.update(scoreFrame(3000, 4)),
    false,
    'resume baselines muted points',
  );
  assert.equal(audio.update(scoreFrame(3100, 4.2)), true);
  assert.equal(
    audio.update(scoreFrame(0, 0)),
    false,
    'restore baselines a rewind',
  );
  assert.equal(audio.getPresentation().activeVoices, 0);
  assert.equal(audio.update(scoreFrame(500, 1, { id: 'transfer-2' })), false);
  assert.equal(
    audio.update(scoreFrame(600, 1.2, { id: 'transfer-2', failed: true })),
    false,
  );
  assert.equal(audio.getPresentation().activeVoices, 0);
  audio.dispose();
});

test('banks win over score ticks; rejected or over-budget cues are never deferred', async () => {
  const { audio, context } = rig();
  await audio.prepare();
  assert.equal(audio.trigger(tick()), true);
  assert.equal(audio.trigger(tick()), false);
  context.currentTime += 0.125;
  assert.equal(audio.trigger(tick(2)), true);
  context.currentTime += 0.125;
  assert.equal(audio.trigger(tick(3)), false);
  assert.equal(audio.getPresentation().activeVoices, 2);
  const ticks = sources(context);
  assert.equal(
    ticks[0].buffer,
    ticks[1].buffer,
    'score ticks share one recording',
  );
  assert.equal(ticks[0].playbackRate.value, 1);
  assert.equal(ticks[1].playbackRate.value, 1);
  assert.equal(audio.trigger(bank()), true);
  assert.ok(ticks.every((node) => node.disconnected));
  assert.equal(audio.getPresentation().activeVoices, 1);
  assert.equal(audio.trigger(tick(4)), false);
  sources(context).at(-1).onended();
  assert.equal(audio.trigger(tick(3)), false);
  assert.equal(audio.trigger(tick(4)), false);
  assert.equal(audio.trigger(tick(5)), true);
  assert.equal(audio.getPresentation().lastCue, 'score-tick');
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
