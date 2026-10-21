import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio } from './index.js';
import { createPropulsion } from './propulsion.js';
import { createPickupAudio } from '../pickups/audio.js';
import { DEVICE_SAMPLES, deviceSample } from '../pickups/sample-cues.js';
import { deviceCue } from '../pickups/sound-design.js';
import { createSoundPreview } from './sound-preview.js';
import { soundEffects } from './sounds.js';
import { RACE_SAMPLES, raceSample } from './sample-cues.js';

class Param {
  value = 0;
  automation = [];
  cancelAndHoldAtTime(time) {
    this.automation = [{ type: 'hold', time }];
  }
  cancelScheduledValues(time) {
    this.automation = [{ type: 'cancel', time }];
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
const fetchAudio = async (url) => ({
  ok: true,
  arrayBuffer: async () => new TextEncoder().encode(url).buffer,
});
function sampleContext(durations = {}) {
  const context = new Context();
  context.decodeAudioData = async (bytes) => {
    const sampleUrl = new TextDecoder().decode(bytes);
    return { duration: durations[sampleUrl] ?? 0.5, sampleUrl };
  };
  return context;
}

test('sample-backed device events have no alternate synthesized cue', () => {
  for (const kind of ['arc', 'repulsor', 'aegis', 'ion', 'vector'])
    for (const type of [
      'pickup-activate',
      'pickup-expire',
      'pickup-cancel',
      'shield-hit',
      'combat-fire',
      'combat-hit',
      'combat-confirm',
      'combat-contact',
    ])
      for (const shielded of [true, false]) {
        const event = { type, payload: { kind, shielded } };
        if (deviceSample(event))
          assert.deepEqual(deviceCue(event), [], `${kind} ${type} ${shielded}`);
      }
});

test('complete device sets distinguish outgoing, incoming, blocked and grace contacts', () => {
  for (const kind of ['arc', 'repulsor']) {
    const event = (type, shielded = false) => ({
      type,
      payload: { kind, shielded },
    });
    assert.equal(deviceSample(event('combat-hit')).id, `${kind}-hit`);
    assert.equal(deviceSample(event('combat-hit', true)), null);
    assert.equal(deviceSample(event('combat-confirm')).gain, 0.6);
    assert.equal(
      deviceSample(event('combat-confirm', true)).id,
      'shield-block',
    );
    assert.equal(deviceSample(event('combat-contact')).gain, 0.35);
    assert.deepEqual(deviceCue(event('pickup-expire')), []);
  }
  assert.equal(deviceSample({ type: 'shield-hit' }).id, 'shield-block');
  assert.deepEqual(
    deviceSample({
      type: 'combat-confirm',
      payload: { kind: 'ion', shielded: true },
    }),
    { id: 'shield-block', gain: 0.6 },
  );
  assert.equal(
    deviceSample({
      type: 'combat-confirm',
      payload: { kind: 'ion', shielded: false },
    }),
    null,
    'unshielded Ion contact keeps its own cue',
  );
  for (const [type, id, gain] of [
    ['pickup-activate', 'aegis-activate', 1],
    ['pickup-expire', 'shield-block', 0.65],
    ['pickup-cancel', 'shield-block', 0.4],
  ]) {
    assert.deepEqual(deviceSample({ type, payload: { kind: 'aegis' } }), {
      id,
      gain,
    });
  }
  assert.equal(
    deviceSample({ type: 'combat-fire', payload: { kind: 'arc' } }),
    null,
    'retain the deep Arc shots already tuned with the owner',
  );
});

test('utility events stay silent and Ion ends through its bed fade while mute remains immediate', async () => {
  const context = new Context();
  const audio = createPickupAudio({
    createContext: () => context,
    samples: {},
  });
  await audio.unlock();
  audio.update({ volume: 0.4 }, true);
  audio.setEffects({ ion: true });
  const ion = context.nodes.find(
    (node) => node.kind === 'filter' && node.frequency.value === 780,
  ).destination.gain;
  assert.ok(ion.value > 0);
  const nodes = context.nodes.length;
  for (const event of [
    ...['vector', 'aegis', 'arc', 'repulsor', 'ion'].map((kind) => ({
      type: 'pickup-unavailable',
      payload: { kind },
    })),
    { type: 'pickup-cancel', payload: { kind: 'vector' } },
    { type: 'pickup-expire', payload: { kind: 'ion' } },
  ])
    audio.event(event);
  assert.equal(context.nodes.length, nodes);
  assert.equal(audio.getStatus().shots, 0);
  audio.setEffects({});
  assert.equal(ion.automation.at(-1).type, 'target');
  assert.equal(ion.automation.at(-1).value, 0);
  assert.ok(
    ion.automation.at(-1).response >= 0.1,
    'natural end fades over a few hundred milliseconds',
  );
  audio.update({ volume: 0.4, muted: true }, true);
  assert.equal(ion.automation.at(-1).type, 'set');
  assert.equal(ion.value, 0);
  await audio.dispose();
  assert.ok(context.nodes.every((node) => node.disconnected));
});

test('sample cues share effects mix, bounded voices, caching and pause/disposal with synthesis', async () => {
  const context = new Context();
  let fetches = 0,
    decodes = 0;
  context.decodeAudioData = async () => {
    decodes++;
    return { duration: 1.42 };
  };
  const audio = createPickupAudio({
    createContext: () => context,
    samples: { 'repulsor-fire': '/fire.wav', 'arc-hit': '/hit.wav' },
    fetchAudio: async () => {
      fetches++;
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
    },
  });
  await Promise.all([audio.unlock(), audio.unlock()]);
  assert.equal(fetches, 2);
  assert.equal(decodes, 2);
  audio.update({ volume: 0.4 }, true);
  const fire = { type: 'combat-fire', payload: { kind: 'repulsor' } };
  audio.event(fire);
  assert.equal(audio.duration(fire), 1.42);
  const source = context.nodes.filter((node) => node.kind === 'buffer').at(-1);
  assert.equal(source.buffer.duration, 1.42);
  assert.equal(source.destination.destination.destination.kind, 'compressor');
  for (let n = 0; n < 6; n++)
    audio.event({ type: 'combat-contact', payload: { kind: 'arc' } });
  assert.equal(audio.getStatus().shots, 4);
  assert.ok(
    source.stops.length > 0,
    'old sample retires through the same voice budget',
  );
  audio.update({ volume: 0.4, muted: true }, true);
  assert.equal(audio.getStatus().shots, 0);
  assert.equal(source.disconnected, true);
  await audio.unlock();
  assert.equal(fetches, 2, 'decoded samples survive pause and retrigger');
  await audio.dispose();
  assert.ok(context.nodes.every((node) => node.disconnected));
  assert.equal(context.closes, 1);
});

test('a fresh or re-enabled pickup bus gives Arc its full attack before smoothing later volume changes', async () => {
  const context = new Context();
  const audio = createPickupAudio({
    createContext: () => context,
    samples: {},
  });
  await audio.unlock();
  const master = context.nodes[0].gain;
  audio.update({ volume: 0.4 }, true);
  assert.deepEqual(master.automation.at(-1), {
    type: 'set',
    value: 0.38,
    time: 0,
  });
  audio.event({ type: 'combat-fire', payload: { kind: 'arc' } });
  assert.equal(audio.getStatus().shots, 1);
  assert.equal(
    context.nodes.filter((node) => node.kind === 'oscillator' && node.starts)
      .length,
    2,
  );
  audio.update({ volume: 0.5 }, true);
  assert.equal(master.automation.at(-1).type, 'target');
  audio.silence();
  audio.update({ volume: 0.4 }, true);
  assert.equal(master.automation.at(-1).type, 'set');
  await audio.dispose();
});

test('every Sounds entry reaches a live cue or bed, using the current sample whenever one is assigned', async () => {
  let context, driver;
  const preview = createSoundPreview({
    getSettings: () => ({ volume: 0.35 }),
    createDeviceAudio: () => {
      context = sampleContext();
      driver = createPickupAudio({ createContext: () => context, fetchAudio });
      return driver;
    },
    createRaceAudio: (options) => {
      context = sampleContext();
      driver = createAudio({
        ...options,
        createContext: () => context,
        fetchAudio,
      });
      return driver;
    },
    schedule: () => 0,
    cancel: () => {},
  });
  for (const sound of soundEffects) {
    assert.equal(await preview.play(sound.id), true, sound.id);
    if (sound.bus === 'devices') {
      if (sound.event) {
        assert.equal(driver.getStatus().shots, 1, sound.id);
        const sample = deviceSample(sound.event);
        if (sample) {
          const source = context.nodes
            .filter((node) => node.kind === 'buffer' && !node.loop)
            .at(-1);
          assert.equal(
            source.buffer.sampleUrl,
            DEVICE_SAMPLES[sample.id],
            sound.id,
          );
          assert.equal(
            context.nodes.filter((node) => node.kind === 'oscillator').length,
            0,
            'sample-only cue',
          );
        }
      } else {
        const bed = context.nodes.find(
          (node) =>
            node.kind === 'filter' &&
            node.type === 'bandpass' &&
            node.destination.gain.value > 0,
        );
        assert.ok(bed, sound.id);
      }
    } else {
      assert.equal(driver.getStatus().audible, true, sound.id);
      const sample = raceSample(sound.event);
      if (sample) {
        const source = context.nodes.find(
          (node) => node.kind === 'buffer' && !node.loop,
        );
        assert.equal(
          source.buffer.sampleUrl,
          RACE_SAMPLES[sample.id],
          sound.id,
        );
        assert.equal(
          context.nodes.filter((node) => node.kind === 'oscillator').length,
          0,
        );
      } else
        assert.ok(
          context.nodes.some(
            (node) => node.kind === 'oscillator' && node.starts,
          ),
          sound.id,
        );
    }
    preview.stop();
    await driver.dispose();
  }
  preview.dispose();
});

for (const [payload, id] of [
  [{ valid: true, position: 1 }, 'race-winner'],
  [{ valid: true, position: 2 }, 'race-finisher'],
  [{ valid: false, position: 1 }, 'race-invalid'],
]) {
  test(`${id} plays through results on the announcement bus and obeys pause`, async () => {
    const context = sampleContext({ [RACE_SAMPLES[id]]: 2.4 });
    const audio = createAudio({
      createContext: () => context,
      engine: false,
      immersion: true,
      fetchAudio,
    });
    await audio.unlock();
    audio.update(state, 0.35, true);
    const finish = {
      type: 'player-race-complete',
      payload,
    };
    audio.event(finish);
    const source = context.nodes.find((node) => node.kind === 'buffer');
    assert.equal(source.buffer.sampleUrl, RACE_SAMPLES[id]);
    assert.equal(audio.duration(finish), 2.4);
    assert.equal(source.destination.destination.destination.kind, 'compressor');
    assert.equal(source.stops.length, 1);
    assert.ok(Math.abs(source.stops[0] - 2.41) < 1e-9);
    const scheduledStops = [...source.stops];
    audio.update(state, 0.35, false, { results: true });
    assert.equal(source.disconnected, false);
    assert.deepEqual(
      source.stops,
      scheduledStops,
      'results preserve the full finish tail',
    );
    const nodeCount = context.nodes.length;
    audio.event(finish);
    assert.equal(
      context.nodes.length,
      nodeCount,
      'results do not retrigger cues',
    );
    audio.update(state, 0.35, false);
    assert.equal(source.disconnected, true);
    assert.equal(source.destination.disconnected, true);
    await audio.dispose();
  });
}

test('sample fetch failure stays silent; disposal aborts loading without starting sound', async () => {
  for (const createBus of [createPickupAudio, createAudio]) {
    const context = sampleContext();
    const audio = createBus({
      createContext: () => context,
      engine: false,
      fetchAudio: async () => ({ ok: false }),
    });
    assert.equal(await audio.unlock(), true);
    if (createBus === createAudio) audio.update(state, 1, true);
    else audio.update({ volume: 1 }, true);
    const before = context.nodes.length;
    const events =
      createBus === createAudio
        ? soundEffects
            .filter((sound) => sound.bus === 'race' && raceSample(sound.event))
            .map((sound) => sound.event)
        : [{ type: 'combat-fire', payload: { kind: 'repulsor' } }];
    for (const event of events) {
      audio.event(event);
      assert.equal(context.nodes.length, before);
      assert.equal(audio.duration(event), 0);
    }
    assert.ok(audio.getStatus().missingSamples.length > 0);
    await audio.dispose();
  }

  let signal, release;
  const pendingContext = sampleContext();
  const waiting = createPickupAudio({
    createContext: () => pendingContext,
    samples: { 'arc-hit': '/hit.wav' },
    fetchAudio: async (_, options) => {
      signal = options.signal;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  const unlock = waiting.unlock();
  await Promise.resolve();
  const disposed = waiting.dispose();
  assert.equal(signal.aborted, true);
  release({ ok: false });
  assert.equal(await unlock, false);
  await disposed;
  assert.equal(pendingContext.closes, 1);
});

test('cue-only audio omits the engine graph but keeps the actual race cues and cleanup', async () => {
  const context = new Context();
  const audio = createAudio({ createContext: () => context, engine: false });
  await audio.unlock();
  assert.equal(
    context.nodes.filter((node) => node.kind === 'oscillator').length,
    0,
  );
  assert.equal(
    context.nodes.filter((node) => node.kind === 'buffer').length,
    0,
  );
  audio.update(state, 0.35, true);
  audio.event({ type: 'countdown-beep', payload: { step: 3 } });
  const oscillator = context.nodes.find((node) => node.kind === 'oscillator');
  assert.equal(oscillator.frequency.value, 480);
  await audio.dispose();
  assert.equal(oscillator.disconnected, true);
  assert.equal(context.closes, 1);
});

test('a later gesture retries Safari audio while the first resume stays pending', async () => {
  const context = new Context();
  let unblock;
  context.resume = () => {
    if (++context.resumes === 1)
      return new Promise((resolve) => {
        unblock = resolve;
      });
    context.state = 'running';
    unblock();
    return Promise.resolve();
  };
  const audio = createAudio({ createContext: () => context });
  const pending = audio.unlock();
  const nextGesture = audio.unlock();
  assert.equal(pending, nextGesture, 'reuse one graph and its pending unlock');
  assert.equal(await nextGesture, true);
  assert.equal(context.resumes, 2);
  await audio.dispose();
});

test('listener immersion filters the complete propulsion/cue/thunder graph and device bus, then eases back to dry', async () => {
  const context = new Context();
  const audio = createAudio({
    createContext: () => context,
    nacre: true,
    immersion: true,
  });
  await audio.unlock();
  audio.update({ ...state, speed: 112, boosting: true }, 0.5, true);
  audio.setImmersion(1);
  const wet = audio.getStatus().immersion;
  assert.equal(wet.cutoff, 560);
  assert.equal(wet.gain, 0.65);
  const waterFilter = context.nodes.find(
    (node) => node.kind === 'filter' && node.frequency.value === 560,
  );
  const masterBus = context.nodes.find((node) => node.kind === 'filter');
  assert.equal(masterBus.destination, waterFilter);
  audio.event({ type: 'nacre-thunder', id: 'wet', submerged: 1 });
  audio.event({ type: 'impact' });
  const thunder = context.nodes.filter((node) => node.kind === 'buffer').at(-1);
  let destination = thunder.destination;
  for (let n = 0; n < 10 && destination !== waterFilter; n++)
    destination = destination.destination;
  assert.equal(
    destination,
    waterFilter,
    'already-playing thunder shares the output filter',
  );
  audio.setImmersion(0.5);
  assert.ok(audio.getStatus().immersion.cutoff > wet.cutoff);
  audio.setImmersion(0);
  assert.ok(audio.getStatus().immersion.cutoff > 3000);
  assert.equal(waterFilter.frequency.automation.at(-1).response, 0.22);
  audio.update(state, 0, true);
  assert.equal(audio.getStatus().audible, false);
  await audio.dispose();
  assert.ok(context.nodes.every((node) => node.disconnected));

  const deviceContext = new Context();
  const devices = createPickupAudio({
    createContext: () => deviceContext,
    immersion: true,
    samples: {},
  });
  await devices.unlock();
  devices.update({ volume: 0.5 }, true, 1);
  devices.event({ type: 'pickup-activate', payload: { kind: 'vector' } });
  assert.deepEqual(devices.getStatus().immersion, wet);
  const voice = deviceContext.nodes.find((node) => node.kind === 'oscillator');
  const deviceWaterFilter = deviceContext.nodes.find(
    (node) => node.kind === 'filter' && node.frequency.value === 560,
  );
  let deviceOutput = voice.destination;
  for (let n = 0; n < 10 && deviceOutput !== deviceWaterFilter; n++)
    deviceOutput = deviceOutput.destination;
  assert.equal(
    deviceOutput,
    deviceWaterFilter,
    'device cues share the underwater output after local compression',
  );
  devices.update({ volume: 0.5 }, false, 1);
  assert.equal(devices.getStatus().shots, 0);
  devices.update({ volume: 0.5 }, true, 0);
  assert.equal(devices.getStatus().immersion.gain, 1);
  await devices.dispose();
  assert.ok(deviceContext.nodes.every((node) => node.disconnected));
});

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

test('collision samples keep their attack, share the voice budget and release on end/disposal', async () => {
  const context = sampleContext();
  const audio = createAudio({ createContext: () => context, fetchAudio });
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
  assert.equal(oscillator.kind, 'buffer');
  assert.equal(oscillator.buffer.sampleUrl, RACE_SAMPLES['ship-impact']);
  assert.equal(envelope.gain.automation[1].value, 0.8);
  assert.equal(
    context.nodes.find((node) => node.kind === 'gain').gain.automation.at(-1)
      .type,
    'set',
  );
  assert.equal(audio.duration({ type: 'impact' }), 0.5);
  oscillator.onended();
  assert.equal(oscillator.disconnected, true);
  audio.event({ type: 'impact', payload: { shielded: true } });
  assert.equal(
    context.nodes.length,
    before + 8,
    'shield-hit owns the blocked collision',
  );
  audio.event({ type: 'lap' });
  assert.equal(context.nodes.length, before + 10);
  await audio.dispose();
  assert.ok(context.nodes.every((node) => node.disconnected));
});

test('countdown has three distinct beats and a sustained higher GO tone without propulsion, and obeys pause/mute', async () => {
  const context = new Context();
  const audio = createAudio({ createContext: () => context });
  audio.event({ type: 'countdown-beep', payload: { step: 3 } });
  assert.equal(
    context.nodes.length,
    0,
    'A countdown cannot create audio before a user gesture',
  );
  await audio.unlock();
  const master = context.nodes.find((node) => node.kind === 'gain');
  const propulsionBus = context.nodes.filter((node) => node.kind === 'gain')[1];
  audio.update(state, 0.35, false, { countdown: true });
  assert.equal(master.gain.value, 0.35);
  assert.equal(
    propulsionBus.gain.value,
    0,
    'Countdown opens cue audio without the engine bed',
  );
  const voices = [];
  for (const step of [3, 2, 1]) {
    const before = context.nodes.length;
    audio.event({ type: 'countdown-beep', payload: { step } });
    const voice = context.nodes[before];
    voices.push(voice);
    assert.equal(voice.kind, 'oscillator');
    assert.ok(voice.stops[0] > context.currentTime + 0.25);
    assert.ok(
      voice.stops[0] < context.currentTime + 0.35,
      'Ready beat leaves clear silence before the next second',
    );
    voice.onended();
  }
  const beforeGo = context.nodes.length;
  audio.event({ type: 'countdown-go', payload: {} });
  const go = context.nodes[beforeGo];
  const goEnvelope = context.nodes[beforeGo + 1].gain.automation;
  assert.ok(
    go.frequency.automation[0].value > voices[0].frequency.automation[0].value,
  );
  assert.ok(go.stops[0] > context.currentTime + 0.7);
  assert.ok(go.stops[0] < context.currentTime + 0.85);
  assert.ok(
    goEnvelope.some(
      (entry) =>
        entry.type === 'set' &&
        entry.value > 0 &&
        entry.time > context.currentTime + 0.5,
    ),
    'GO sustains before its smooth release',
  );
  assert.equal(goEnvelope.at(-1).value, 0);
  assert.equal(voices.length, 3);
  audio.update(state, 0.35, false);
  assert.equal(master.gain.value, 0);
  assert.equal(go.disconnected, true, 'Pause immediately releases the GO cue');
  const pausedCount = context.nodes.length;
  audio.event({ type: 'countdown-beep', payload: { step: 1 } });
  assert.equal(context.nodes.length, pausedCount);
  audio.update(state, 0, false, { countdown: true });
  audio.event({ type: 'countdown-beep', payload: { step: 1 } });
  assert.equal(
    context.nodes.length,
    pausedCount,
    'Master mute suppresses cue creation',
  );
  audio.update(state, 0.35, true);
  assert.equal(
    propulsionBus.gain.value,
    1,
    'GO enables the existing propulsion graph',
  );
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

test('level-owned shelf sound uses the shared master bus and obeys unlock, mute, pause, reset and disposal', async () => {
  const { createGlasswakeShelfAudio } =
    await import('../levels/glasswake/audio.js');
  const context = new Context();
  const audio = createAudio({
    createContext: () => context,
    environment: createGlasswakeShelfAudio,
  });
  const event = { type: 'glasswake-shelf', id: 'opening-sheet' };
  audio.event(event);
  assert.equal(context.nodes.length, 0);
  await audio.unlock();
  audio.update(state, 0.35, false, { countdown: true });
  audio.event(event);
  assert.equal(
    audio.getPresentation().triggerCount,
    0,
    'countdown does not play shelf events',
  );
  audio.update(state, 0, true);
  audio.event(event);
  assert.equal(audio.getPresentation().triggerCount, 0);
  audio.update(state, 0.35, true);
  audio.event(event);
  audio.event(event);
  assert.equal(audio.getPresentation().triggerCount, 1);
  assert.equal(audio.getPresentation().activeVoices, 1);
  // The same cached crack/snow buffer serves the distant shelf too.
  const openingVoice = context.nodes.filter((n) => n.kind === 'buffer').at(-1);
  openingVoice.onended();
  const secondCue = { type: 'glasswake-shelf', id: 'calving-shelf:0' };
  audio.event(secondCue);
  audio.event(secondCue);
  assert.equal(audio.getPresentation().triggerCount, 2);
  assert.equal(audio.getPresentation().activeVoices, 1);
  assert.equal(
    context.nodes.filter((n) => n.kind === 'buffer').at(-1).buffer,
    openingVoice.buffer,
  );
  audio.event({ type: 'glasswake-shelf', id: 'unrelated' });
  assert.equal(audio.getPresentation().triggerCount, 2);
  audio.update(state, 0.35, false);
  assert.equal(audio.getPresentation().activeVoices, 0);
  audio.event(event);
  assert.equal(audio.getPresentation().triggerCount, 2);
  audio.update(state, 0.35, true);
  audio.event(event);
  audio.resetEnvironment();
  assert.equal(audio.getPresentation().activeVoices, 0);
  audio.event(event);
  audio.update(state, 0, true);
  assert.equal(audio.getPresentation().activeVoices, 0);
  await audio.dispose();
  await audio.dispose();
  assert.equal(context.closes, 1);
  assert.ok(context.nodes.every((n) => n.disconnected));
  const ordinary = createAudio({ createContext: () => new Context() });
  await ordinary.unlock();
  ordinary.update(state, 1, true);
  ordinary.event(event);
  assert.equal(ordinary.getPresentation(), null);
  await ordinary.dispose();
});
