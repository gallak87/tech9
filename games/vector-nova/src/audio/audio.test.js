import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio } from './index.js';
import { createPropulsion } from './propulsion.js';

class Param {
  value = 0;
  automation = [];
  cancelAndHoldAtTime(time) {
    this.automation = [{ type: 'hold', time }];
  }
  setTargetAtTime(value, time, response) {
    assert.ok(Number.isFinite(value));
    assert.ok(response > 0);
    this.value = value;
    this.automation.push({ type: 'target', value, time, response });
  }
  setValueAtTime(value, time) {
    this.value = value;
    this.automation.push({ type: 'set', value, time });
  }
  linearRampToValueAtTime(value, time) {
    this.value = value;
    this.automation.push({ type: 'linear', value, time });
  }
  exponentialRampToValueAtTime(value, time) {
    assert.ok(value > 0);
    this.value = value;
    this.automation.push({ type: 'exponential', value, time });
  }
}

class Context {
  state = 'suspended';
  sampleRate = 8000;
  currentTime = 0;
  destination = {};
  nodes = [];
  resumes = 0;
  closes = 0;
  failResume = false;
  node(kind) {
    const node = {
      kind,
      gain: new Param(),
      frequency: new Param(),
      detune: new Param(),
      Q: new Param(),
      pan: new Param(),
      threshold: new Param(),
      knee: new Param(),
      ratio: new Param(),
      attack: new Param(),
      release: new Param(),
      starts: 0,
      stops: [],
      disconnected: false,
      connect(destination) {
        this.destination = destination;
        return destination;
      },
      disconnect() {
        this.disconnected = true;
      },
      start() {
        this.starts++;
      },
      stop(time = 0) {
        this.stops.push(time);
      },
      setPeriodicWave() {},
    };
    this.nodes.push(node);
    return node;
  }
  createGain() {
    return this.node('gain');
  }
  createOscillator() {
    return this.node('oscillator');
  }
  createBiquadFilter() {
    return this.node('filter');
  }
  createStereoPanner() {
    return this.node('panner');
  }
  createBufferSource() {
    return this.node('buffer');
  }
  createDynamicsCompressor() {
    return this.node('compressor');
  }
  createPeriodicWave() {
    return {};
  }
  createBuffer(channels, length, rate) {
    const arrays = Array.from(
      { length: channels },
      () => new Float32Array(length),
    );
    return {
      duration: length / rate,
      getChannelData: (index) => arrays[index],
    };
  }
  async resume() {
    this.resumes++;
    if (this.failResume) throw new Error('Device unavailable');
    this.state = 'running';
  }
  async close() {
    this.closes++;
    this.state = 'closed';
  }
}
const state = { speed: 0, time: 0, steer: 0, boosting: false };

test('unlock is lazy, coalesced, initially silent and cannot reopen after disposal', async () => {
  const context = new Context();
  let creations = 0;
  const audio = createAudio({
    createContext: () => {
      creations++;
      return context;
    },
  });
  audio.update(state, 1, true);
  assert.equal(creations, 0);
  assert.deepEqual(await Promise.all([audio.unlock(), audio.unlock()]), [
    true,
    true,
  ]);
  assert.equal(creations, 1);
  assert.equal(context.resumes, 1);
  assert.equal(
    context.nodes.find((node) => node.kind === 'gain').gain.value,
    0,
  );
  await audio.dispose();
  await audio.dispose();
  assert.equal(await audio.unlock(), false);
  assert.equal(context.closes, 1);
  assert.ok(context.nodes.every((node) => node.disconnected));
  assert.ok(
    context.nodes
      .filter((node) => node.starts)
      .every((node) => node.stops.length === 1),
  );
});

test('mute, pause and invalid volumes target silence without recreating sources', async () => {
  const context = new Context();
  const audio = createAudio({ createContext: () => context });
  await audio.unlock();
  const master = context.nodes.find((node) => node.kind === 'gain').gain;
  audio.update(state, 10, true);
  assert.equal(master.value, 1);
  const count = context.nodes.length;
  for (const [volume, running] of [
    [0, true],
    [-1, true],
    [NaN, true],
    [1, false],
  ]) {
    audio.update(state, volume, running);
    assert.equal(master.value, 0);
    assert.equal(master.automation.at(-1).type, 'target');
  }
  assert.equal(context.nodes.length, count);
  await audio.dispose();
});

test('audio-device failure releases its graph and allows a later gesture to retry', async () => {
  const failed = new Context();
  failed.failResume = true;
  const recovered = new Context();
  let attempt = 0;
  const audio = createAudio({
    createContext: () => (attempt++ ? recovered : failed),
  });
  assert.equal(await audio.unlock(), false);
  assert.equal(failed.state, 'closed');
  assert.ok(failed.nodes.every((node) => node.disconnected));
  assert.equal(await audio.unlock(), true);
  await audio.dispose();
});

test('propulsion rises with speed/boost, eases under braking and sanitizes discontinuities', () => {
  const context = new Context();
  const propulsion = createPropulsion(context, context.destination);
  const body = context.nodes.find((node) => node.kind === 'oscillator');
  const filter = context.nodes.find((node) => node.kind === 'filter');
  propulsion.update(state);
  const idleFrequency = body.frequency.value;
  propulsion.update({ ...state, speed: 112, time: 1 });
  const cruiseFrequency = body.frequency.value;
  assert.ok(cruiseFrequency > idleFrequency);
  propulsion.update({ ...state, speed: 112, time: 1.05, boosting: true });
  assert.ok(body.frequency.value > cruiseFrequency);
  propulsion.update({ ...state, speed: 100, time: 1.1 });
  const brakeCutoff = filter.frequency.value;
  propulsion.update({ ...state, speed: 100, time: 3 });
  assert.ok(filter.frequency.value > brakeCutoff);
  propulsion.update({ ...state, speed: 0, time: 0 });
  assert.equal(body.frequency.value, idleFrequency);
  propulsion.update({ speed: Infinity, time: NaN, steer: NaN });
  assert.equal(body.frequency.value, idleFrequency);
  propulsion.dispose();
  propulsion.dispose();
  assert.ok(
    context.nodes
      .filter((node) => node.starts)
      .every((node) => node.stops.length === 1),
  );
});

test('existing cue voices have an attack, are bounded, and release on end/disposal', async () => {
  const context = new Context();
  const audio = createAudio({ createContext: () => context });
  await audio.unlock();
  const before = context.nodes.length;
  audio.event({ type: 'impact' });
  assert.equal(context.nodes.length, before);
  audio.update(state, 1, true);
  for (let index = 0; index < 9; index++) audio.event({ type: 'impact' });
  assert.equal(context.nodes.length, before + 8);
  const oscillator = context.nodes[before];
  const envelope = context.nodes[before + 1];
  assert.deepEqual(envelope.gain.automation[0], {
    type: 'set',
    value: 0,
    time: 0,
  });
  assert.equal(envelope.gain.automation[1].type, 'linear');
  oscillator.onended();
  assert.equal(oscillator.disconnected, true);
  audio.event({ type: 'lap' });
  assert.equal(context.nodes.length, before + 10);
  await audio.dispose();
  assert.ok(context.nodes.every((node) => node.disconnected));
});

test('Nacre thunder respects unlock, master mute, pause, reset and baseline isolation', async () => {
  const context = new Context();
  const audio = createAudio({ createContext: () => context, nacre: true });
  const event = {
    type: 'nacre-thunder',
    id: 'storm-0',
    submerged: 0,
    pan: 0.1,
  };
  audio.event(event);
  assert.equal(audio.getPresentation(), null);
  await audio.unlock();
  audio.update(state, 0, true);
  audio.event(event);
  assert.equal(audio.getPresentation().triggerCount, 0);
  audio.update(state, 0.35, true);
  audio.event(event);
  assert.equal(audio.getPresentation().activeVoices, 1);
  assert.equal(audio.getPresentation().triggerCount, 1);
  audio.update(state, 0.35, false);
  assert.equal(audio.getPresentation().activeVoices, 0);
  audio.event({ ...event, id: 'storm-1' });
  assert.equal(audio.getPresentation().triggerCount, 1);
  audio.update(state, 0.35, true);
  audio.event({ ...event, id: 'storm-2' });
  audio.resetEnvironment();
  assert.equal(audio.getPresentation().activeVoices, 0);
  audio.event({ ...event, id: 'storm-3' });
  audio.update(state, 0, true);
  assert.equal(audio.getPresentation().activeVoices, 0);
  await audio.dispose();
  assert.ok(context.nodes.every((node) => node.disconnected));

  const baseline = createAudio({ createContext: () => new Context() });
  await baseline.unlock();
  baseline.update(state, 1, true);
  baseline.event(event);
  assert.equal(baseline.getPresentation(), null);
  await baseline.dispose();
});
