import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompletionSkidAudio } from './completion-skid-audio.js';
import { createCompletionAudio } from './completion-audio.js';
import { createCompletionRevAudio } from './completion-rev-audio.js';

class Param {
  value = 0;
  automation = [];
  cancelAndHoldAtTime(time) {
    this.automation = [{ type: 'hold', time }];
  }
  cancelScheduledValues(time) {
    this.automation = [{ type: 'cancel', time }];
  }
  setValueAtTime(value, time) {
    this.value = value;
    this.automation.push({ type: 'set', value, time });
  }
  setTargetAtTime(value, time, response) {
    assert.ok(Number.isFinite(value));
    assert.ok(response > 0);
    this.value = value;
    this.automation.push({ type: 'target', value, time, response });
  }
}
class Context {
  sampleRate = 8000;
  currentTime = 0;
  state = 'suspended';
  destination = {};
  nodes = [];
  closes = 0;
  node(kind) {
    const node = {
      kind,
      starts: 0,
      stops: 0,
      disconnects: 0,
      ...Object.fromEntries(
        [
          'gain',
          'frequency',
          'Q',
          'detune',
          'pan',
          'threshold',
          'knee',
          'ratio',
        ].map((key) => [key, new Param()]),
      ),
      connect(destination) {
        this.destination = destination;
        return destination;
      },
      disconnect() {
        this.disconnects++;
      },
      start() {
        this.starts++;
      },
      stop() {
        this.stops++;
      },
      setPeriodicWave() {},
    };
    this.nodes.push(node);
    return node;
  }
  createBufferSource() {
    return this.node('buffer');
  }
  createGain() {
    return this.node('gain');
  }
  createBiquadFilter() {
    return this.node('filter');
  }
  createOscillator() {
    return this.node('oscillator');
  }
  createStereoPanner() {
    return this.node('panner');
  }
  createDynamicsCompressor() {
    return this.node('compressor');
  }
  createPeriodicWave() {
    return {};
  }
  createBuffer(channels, length, rate) {
    const data = Array.from(
      { length: channels },
      () => new Float32Array(length),
    );
    return { duration: length / rate, getChannelData: (index) => data[index] };
  }
  async resume() {
    this.state = 'running';
  }
  async suspend() {
    this.state = 'suspended';
  }
  async close() {
    this.state = 'closed';
    this.closes++;
  }
}
const sliding = () => ({
  grounded: true,
  recovering: false,
  race: { complete: true },
  state: { speed: 100, time: 14.5, steer: 0.5 },
  input: { airbrake: true, brake: 0.3, steer: 0.5 },
  effects: {
    slide: { active: true, slipSpeed: 6, phase: 'drifting', progress: 0.5 },
  },
});
const lastGain = (context) =>
  context.nodes.filter(({ kind }) => kind === 'gain').at(-1);

test('magnetic skid follows real grounded postfinish slip, never a held control alone', () => {
  const context = new Context();
  const sound = createCompletionSkidAudio(context, context.destination);
  const level = lastGain(context).gain;
  const actor = sliding();
  sound.update(actor);
  const slidingGain = level.value;
  assert.ok(slidingGain > 0 && slidingGain <= 0.03);
  for (const quiet of [
    { ...actor, grounded: false },
    { ...actor, recovering: true },
    { ...actor, race: { complete: false } },
    { ...actor, effects: {} },
    { ...actor, effects: { slide: { active: false, slipSpeed: 8 } } },
    { ...actor, effects: { slide: { active: true, slipSpeed: 0 } } },
    { ...actor, state: { speed: 0 } },
    { ...actor, state: { speed: 2 } },
    { ...actor, input: { airbrake: false, brake: 0, steer: 1 } },
    undefined,
  ]) {
    sound.update(quiet);
    assert.equal(level.value, 0);
  }
  sound.update({
    ...actor,
    effects: { slide: { active: true, slipSpeed: 2 } },
  });
  assert.ok(level.value > 0 && level.value < slidingGain);
  sound.update({ ...actor, state: { speed: 22 } });
  assert.equal(
    level.value,
    slidingGain,
    'a deliberate slow slide keeps its actual slip intensity',
  );
  sound.update({ ...actor, state: { speed: 10 } });
  assert.ok(
    level.value > 0 && level.value < slidingGain,
    'only the approach to standstill fades that intensity',
  );
  sound.dispose();
});

test('the skid is bounded filtered noise with a soft envelope and immediate owner cancellation', () => {
  const context = new Context();
  const sound = createCompletionSkidAudio(context, context.destination);
  const source = context.nodes.find(({ kind }) => kind === 'buffer');
  const filters = context.nodes.filter(({ kind }) => kind === 'filter');
  const level = lastGain(context).gain;
  assert.equal(
    context.nodes.filter(({ kind }) => kind === 'oscillator').length,
    0,
  );
  assert.equal(source.starts, 1);
  assert.equal(source.loop, true);
  assert.equal(source.buffer.duration, 1.5);
  assert.ok(
    source.buffer.getChannelData(0).every((value) => Math.abs(value) <= 1),
  );
  assert.equal(filters[0].type, 'highpass');
  assert.ok(filters[0].frequency.value >= 100);
  assert.ok(filters.every((filter) => filter.Q.value <= 0.7));
  assert.equal(filters.at(-1).type, 'lowpass');
  assert.ok(filters.at(-1).frequency.value <= 1800);
  const actor = sliding();
  for (const speed of [NaN, Infinity, -10, 0, 50, 10000])
    for (const slipSpeed of [NaN, Infinity, 0, -4, 8, 10000]) {
      sound.update({
        ...actor,
        state: { speed },
        effects: { slide: { active: true, slipSpeed } },
      });
      assert.ok(level.value >= 0 && level.value <= 0.03);
      assert.ok(filters[1].frequency.value <= 1300);
    }
  sound.update(actor);
  assert.ok(level.automation.at(-1).response >= 0.035);
  sound.update({ ...actor, effects: {} });
  assert.ok(level.automation.at(-1).response >= 0.1);
  sound.update(actor);
  sound.cancel();
  assert.equal(level.value, 0);
  assert.equal(level.automation.at(-1).type, 'set');
  sound.update(actor);
  sound.update(actor, { reducedMotion: true });
  assert.equal(level.value, 0);
  const nodeCount = context.nodes.length;
  sound.dispose();
  sound.dispose();
  sound.update(actor);
  assert.equal(context.nodes.length, nodeCount);
  assert.equal(level.value, 0);
  assert.equal(source.stops, 1);
  assert.equal(source.buffer, null);
  assert.ok(context.nodes.every((node) => node.disconnects === 1));
});

test('a separate bounded motor rev rises through the drift and falls at the stop', () => {
  const context = new Context();
  const rev = createCompletionRevAudio(context, context.destination);
  const motor = context.nodes.find(({ kind }) => kind === 'oscillator');
  const filter = context.nodes.find(({ kind }) => kind === 'filter');
  const level = lastGain(context).gain;
  const actor = sliding();
  const at = (progress) => ({
    ...actor,
    effects: { slide: { ...actor.effects.slide, progress } },
  });
  rev.update(at(0.1));
  const openingPitch = motor.frequency.value;
  rev.update(at(0.75));
  assert.ok(motor.frequency.value > openingPitch * 1.8);
  assert.ok(level.value > 0.02 && level.value <= 0.05);
  const movingPitch = motor.frequency.value;
  for (const progress of [-10, 0, 0.5, 1, 100]) {
    rev.update(at(progress));
    assert.ok(motor.frequency.value >= 100 && motor.frequency.value <= 260);
    assert.ok(level.value >= 0 && level.value <= 0.05);
    assert.ok(filter.frequency.value <= 1700);
  }
  rev.update({
    ...actor,
    effects: { slide: { ...actor.effects.slide, phase: 'stopped' } },
  });
  assert.equal(level.value, 0);
  assert.ok(motor.frequency.value < movingPitch);
  assert.ok(level.automation.at(-1).response >= 0.08);
  for (const quiet of [
    { ...actor, grounded: false },
    { ...actor, recovering: true },
    { ...actor, race: { complete: false } },
    { ...actor, effects: { slide: { active: true, progress: NaN } } },
    undefined,
  ]) {
    rev.update(quiet);
    assert.equal(level.value, 0);
  }
  rev.update(actor);
  rev.update(actor, { reducedMotion: true });
  assert.equal(level.value, 0);
  assert.equal(level.automation.at(-1).type, 'set');
  rev.update(actor);
  rev.cancel();
  assert.equal(level.value, 0);
  rev.dispose();
  rev.dispose();
  rev.update(actor);
  assert.equal(motor.stops, 1);
  assert.ok(context.nodes.every((node) => node.disconnects === 1));
});

test('completion motor and skid share saved effects mix, pause, reduced motion and one audio owner', () => {
  const previous = globalThis.AudioContext;
  let context;
  globalThis.AudioContext = class extends Context {
    constructor() {
      super();
      context = this;
    }
  };
  let audio;
  try {
    const settings = { masterVolume: 0.5, volume: 0.4 };
    audio = createCompletionAudio(() => settings);
    const master = context.nodes[0].gain;
    const level = lastGain(context).gain;
    const revLevel = context.nodes.find(
      (node) => node.kind === 'oscillator' && node.frequency.value === 100,
    ).destination.destination.gain;
    const sample = { time: 14.5, hero: sliding(), events: [] };
    audio.update(sample);
    assert.equal(master.value, 0);
    assert.equal(level.value, 0);
    assert.equal(revLevel.value, 0);
    audio.resume();
    audio.update(sample);
    assert.equal(master.value, 0.2);
    assert.ok(level.value > 0);
    assert.ok(revLevel.value > 0);
    settings.muted = true;
    audio.update(sample);
    assert.equal(master.value, 0);
    assert.equal(level.value, 0);
    assert.equal(revLevel.value, 0);
    settings.muted = false;
    settings.reducedMotion = true;
    audio.update(sample);
    assert.equal(level.value, 0);
    assert.equal(revLevel.value, 0);
    settings.reducedMotion = false;
    audio.update(sample);
    assert.ok(level.value > 0);
    audio.pause();
    assert.equal(context.state, 'suspended');
    assert.equal(master.value, 0);
    assert.equal(level.value, 0);
    assert.equal(revLevel.value, 0);
    audio.update(sample);
    assert.equal(level.value, 0);
    audio.resume();
    audio.update(sample);
    assert.ok(level.value > 0);
    audio.dispose();
    audio.dispose();
    assert.equal(context.closes, 1);
    assert.ok(context.nodes.every((node) => node.disconnects === 1));
    assert.ok(
      context.nodes
        .filter((node) => node.starts)
        .every((node) => node.stops === 1),
    );
  } finally {
    audio?.dispose();
    if (previous === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previous;
  }
});
