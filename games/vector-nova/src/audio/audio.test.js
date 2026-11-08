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
import { EQUIPMENT } from '../progression/catalog.js';

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
      startTimes: [],
      stops: [],
      disconnected: false,
      connect(destination) {
        this.destination = destination;
        return destination;
      },
      disconnect() {
        this.disconnected = true;
      },
      start(time = 0) {
        this.starts++;
        this.startTimes.push(time);
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

test('boss critical audio follows real player core damage and cancels without replay on pause', async () => {
  const context = sampleContext();
  const audio = createAudio({ createContext: () => context, fetchAudio });
  await audio.unlock();
  audio.update(state, 0.35, true);
  const critical = { target: 'goliath', source: 'player', weakPoint: true };
  const samples = () =>
    context.nodes.filter(
      (node) => node.kind === 'buffer' && node.buffer?.sampleUrl,
    );
  for (const payload of [
    { ...critical, source: 'rook' },
    { ...critical, weakPoint: false },
    { ...critical, target: 'player' },
  ])
    audio.event({ type: 'interceptor-hit', payload });
  assert.equal(
    samples().length,
    0,
    'ordinary and allied hits do not claim a critical',
  );
  audio.event({ type: 'interceptor-hit', payload: critical });
  assert.equal(samples().length, 1);
  assert.equal(samples()[0].buffer.sampleUrl, RACE_SAMPLES['goliath-core-hit']);
  audio.update(state, 0.35, false);
  assert.ok(samples()[0].stops.length > 0);
  audio.update(state, 0.35, true);
  assert.equal(samples().length, 1, 'resume never replays an old critical');
  await audio.dispose();
});

test('a boss lane lock ducks only its charging voice and the return reuses the magnetic turn', async () => {
  const context = sampleContext({ [RACE_SAMPLES['goliath-charge']]: 1.4 });
  const audio = createAudio({ createContext: () => context, fetchAudio });
  await audio.unlock();
  audio.update(state, 0.35, true);
  const cue = (value) => ({
    type: 'interceptor-cue',
    payload: { bossId: 'goliath', cue: value },
  });
  audio.event(cue('charge'));
  const sources = () =>
    context.nodes.filter(
      (node) => node.kind === 'buffer' && node.buffer?.sampleUrl,
    );
  const charge = sources()[0];
  context.currentTime = 1;
  audio.event(cue('lock'));
  assert.equal(sources()[1].buffer.sampleUrl, RACE_SAMPLES['goliath-lock']);
  const duck = charge.destination.gain.automation.find(
    (entry) => entry.type === 'linear' && Math.abs(entry.time - 1.015) < 1e-9,
  );
  assert.ok(duck);
  assert.equal(duck.value, 0.74 * 0.25);
  assert.equal(
    charge.stops.length,
    1,
    'charging body fades down without a hard stop',
  );
  context.currentTime = 4.2;
  audio.event(cue('return'));
  assert.equal(sources().at(-1).buffer.sampleUrl, RACE_SAMPLES['goliath-turn']);
  assert.ok(
    sources()
      .at(-1)
      .destination.gain.automation.some(
        (entry) => entry.type === 'set' && entry.value === 0.55,
      ),
  );
  await audio.dispose();
});

test('Bulwark exposes eight authored moving-vault cues and only confirmed player shoulder hits', () => {
  const entries = soundEffects.filter(
    ({ group }) => group === 'Interceptor · Bulwark',
  );
  assert.equal(entries.length, 8);
  assert.equal(
    new Set(entries.map(({ event }) => raceSample(event)?.id)).size,
    8,
  );
  for (const { event, bus } of entries) {
    assert.equal(bus, 'race');
    assert.ok(RACE_SAMPLES[raceSample(event)?.id]);
  }
  assert.deepEqual(
    raceSample({
      type: 'interceptor-cue',
      payload: {
        bossId: 'bulwark',
        cue: 'return',
      },
    }),
    { id: 'bulwark-turn', gain: 0.55 },
  );
  const critical = {
    bossId: 'bulwark',
    target: 'bulwark',
    source: 'player',
    weakPoint: true,
  };
  assert.deepEqual(raceSample({ type: 'interceptor-hit', payload: critical }), {
    id: 'bulwark-core-hit',
    gain: 0.88,
  });
  for (const payload of [
    { ...critical, source: 'rook' },
    { ...critical, weakPoint: false },
    { ...critical, target: 'player' },
  ])
    assert.equal(raceSample({ type: 'interceptor-hit', payload }), null);
});

test('Bulwark rupture hands its shoulder thud and shutter tails to the counter while preserving other bosses', async () => {
  const context = sampleContext();
  const audio = createAudio({
    createContext: () => context,
    engine: false,
    fetchAudio,
  });
  await audio.unlock();
  audio.update(state, 0.35, true);
  audio.event({
    type: 'interceptor-cue',
    payload: { bossId: 'goliath', cue: 'fire' },
  });
  audio.event({
    type: 'interceptor-cue',
    payload: { bossId: 'bulwark', cue: 'expose' },
  });
  audio.event({
    type: 'interceptor-hit',
    payload: {
      bossId: 'bulwark',
      target: 'bulwark',
      source: 'player',
      weakPoint: true,
    },
  });
  const sources = () => context.nodes.filter((node) => node.buffer?.sampleUrl);
  const old = sources();
  const other = structuredClone(old[0].destination.gain.automation);
  audio.event({
    type: 'interceptor-cue',
    payload: { bossId: 'bulwark', cue: 'counter' },
  });
  assert.equal(
    sources().at(-1).buffer.sampleUrl,
    RACE_SAMPLES['bulwark-counter'],
  );
  for (const [index, gain] of [
    [1, 0.74],
    [2, 0.88],
  ]) {
    const duck = old[index].destination.gain.automation.find(
      (entry) => entry.type === 'linear' && entry.time === 0.015,
    );
    assert.equal(duck?.value, gain * 0.25);
  }
  assert.deepEqual(old[0].destination.gain.automation, other);
  audio.resetEnvironment();
  assert.ok(sources().every((voice) => voice.disconnected));
  await audio.dispose();
});

test('Bulwark breakwater cadence, quieter return and complete defeat release survive their real phase windows', async () => {
  const durations = {
    charge: 1.6,
    lock: 0.25,
    turn: 0.9,
    fire: 0.45,
    counter: 0.55,
    expose: 0.6,
    'core-hit': 0.35,
    disable: 1.4,
  };
  const context = sampleContext(
    Object.fromEntries(
      Object.entries(durations).map(([cue, seconds]) => [
        RACE_SAMPLES[`bulwark-${cue}`],
        seconds,
      ]),
    ),
  );
  const audio = createAudio({
    createContext: () => context,
    engine: false,
    fetchAudio,
  });
  await audio.unlock();
  audio.update(state, 0.35, true);
  const sources = () => context.nodes.filter((node) => node.buffer?.sampleUrl);
  for (const [elapsed, cue] of [
    [0, 'charge'],
    [1, 'expose'],
    [1.4, 'core-hit'],
    [1.4, 'counter'],
    [4.3, 'lock'],
    [5.3, 'turn'],
    [6.2, 'fire'],
    [7.2, 'fire'],
    [8.2, 'return'],
    [12, 'disable'],
  ]) {
    context.currentTime = elapsed;
    for (const source of sources())
      if (!source.disconnected && source.stops[0] <= elapsed)
        source.onended?.();
    const before = sources().length;
    audio.event(
      cue === 'core-hit'
        ? {
            type: 'interceptor-hit',
            payload: {
              bossId: 'bulwark',
              target: 'bulwark',
              source: 'player',
              weakPoint: true,
            },
          }
        : {
            type: 'interceptor-cue',
            payload: { bossId: 'bulwark', cue, elapsed },
          },
    );
    assert.equal(
      sources().length,
      before + 1,
      `${cue} has room in the race voice budget`,
    );
    assert.equal(
      sources().at(-1).buffer.sampleUrl,
      RACE_SAMPLES[`bulwark-${cue === 'return' ? 'turn' : cue}`],
    );
    if (cue === 'disable') {
      const disable = sources().at(-1);
      assert.equal(disable.stops[0], 13.41);
      audio.update(state, 0.35, false, { results: true });
      assert.equal(disable.disconnected, false);
      audio.update(state, 0, false, { results: true });
      assert.equal(
        disable.disconnected,
        true,
        'mute still cancels the victory tail',
      );
    }
  }
  await audio.dispose();
});

test('Wraith exposes eight distinct authored auditions, its return alias and only real player capacitor hits', () => {
  const entries = soundEffects.filter(
    ({ group }) => group === 'Interceptor · Wraith',
  );
  assert.equal(entries.length, 8);
  assert.equal(
    new Set(entries.map(({ event }) => raceSample(event)?.id)).size,
    8,
  );
  for (const { event, bus } of entries) {
    assert.equal(bus, 'race');
    assert.ok(RACE_SAMPLES[raceSample(event)?.id]);
  }
  assert.deepEqual(
    raceSample({
      type: 'interceptor-cue',
      payload: {
        bossId: 'wraith',
        cue: 'return',
      },
    }),
    { id: 'wraith-turn', gain: 0.55 },
  );
  const critical = {
    bossId: 'wraith',
    target: 'wraith',
    source: 'player',
    weakPoint: true,
  };
  assert.deepEqual(raceSample({ type: 'interceptor-hit', payload: critical }), {
    id: 'wraith-core-hit',
    gain: 0.88,
  });
  for (const payload of [
    { ...critical, source: 'rook' },
    { ...critical, weakPoint: false },
    { ...critical, target: 'player' },
  ])
    assert.equal(raceSample({ type: 'interceptor-hit', payload }), null);
  assert.equal(
    raceSample({
      type: 'interceptor-cue',
      payload: {
        bossId: 'wraith',
        cue: 'recover',
      },
    }),
    null,
    'Goliath recharge does not borrow a Wraith sound',
  );
});

test('a successful Wraith counter hands off its own warning tails without ducking Goliath or player Lance', async (t) => {
  for (const phase of ['charge', 'lock', 'turn'])
    await t.test(phase, async () => {
      const context = sampleContext();
      const playerContext = sampleContext();
      const audio = createAudio({
        createContext: () => context,
        engine: false,
        fetchAudio,
      });
      const pickups = createPickupAudio({
        createContext: () => playerContext,
        fetchAudio,
      });
      await audio.unlock();
      await pickups.unlock();
      audio.update(state, 0.35, true);
      pickups.update({ volume: 0.35 }, true);
      pickups.event({
        type: 'combat-fire',
        payload: { equipment: 'lance', kind: 'lance' },
      });
      audio.event({
        type: 'interceptor-cue',
        payload: { bossId: 'goliath', cue: 'fire' },
      });
      audio.event({ type: 'impact' });
      const warning = {
        type: 'interceptor-cue',
        payload: { bossId: 'wraith', cue: phase },
      };
      audio.event(warning);
      const sources = () =>
        context.nodes.filter((node) => node.buffer?.sampleUrl);
      const old = sources();
      const playerLance = playerContext.nodes.find(
        (node) => node.buffer?.sampleUrl === DEVICE_SAMPLES['lance-fire'],
      );
      assert.ok(playerLance);
      const unchanged = [old[0], old[1], playerLance].map((voice) =>
        structuredClone(voice.destination.gain.automation),
      );
      context.currentTime = 0.1;
      audio.event({
        type: 'interceptor-cue',
        payload: { bossId: 'wraith', cue: 'counter' },
      });
      assert.equal(
        sources().at(-1).buffer.sampleUrl,
        RACE_SAMPLES['wraith-counter'],
      );
      const duck = old[2].destination.gain.automation.find(
        (entry) =>
          entry.type === 'linear' && Math.abs(entry.time - 0.115) < 1e-9,
      );
      assert.equal(duck?.value, raceSample(warning).gain * 0.25);
      for (const [index, voice] of [old[0], old[1], playerLance].entries())
        assert.deepEqual(voice.destination.gain.automation, unchanged[index]);
      audio.update(state, 0.35, false);
      assert.ok(sources().every((voice) => voice.disconnected));
      await audio.dispose();
      await pickups.dispose();
    });
});

test('Wraith disable owns a full results tail and retry silences it before the next encounter', async () => {
  const context = sampleContext({ [RACE_SAMPLES['wraith-disable']]: 1.2 });
  const audio = createAudio({
    createContext: () => context,
    engine: false,
    fetchAudio,
  });
  await audio.unlock();
  audio.update(state, 0.35, true);
  audio.event({
    type: 'interceptor-cue',
    payload: { bossId: 'wraith', cue: 'fire' },
  });
  audio.update(state, 0.35, false, { results: true });
  audio.event({
    type: 'interceptor-cue',
    payload: { bossId: 'wraith', cue: 'disable' },
  });
  const sources = () => context.nodes.filter((node) => node.buffer?.sampleUrl);
  const quench = sources().at(-1);
  assert.equal(quench.buffer.sampleUrl, RACE_SAMPLES['wraith-disable']);
  assert.equal(quench.stops[0], 1.21);
  audio.update(state, 0.35, false, { results: true });
  assert.equal(quench.disconnected, false);
  audio.event({
    type: 'interceptor-cue',
    payload: { bossId: 'wraith', cue: 'fire' },
  });
  assert.equal(sources().length, 2, 'results reject stale ion shots');
  audio.resetEnvironment();
  assert.ok(sources().every((voice) => voice.disconnected));
  audio.update(state, 0.35, true);
  assert.equal(sources().length, 2, 'retry never replays the quench');
  audio.event({
    type: 'interceptor-cue',
    payload: { bossId: 'wraith', cue: 'charge' },
  });
  assert.equal(sources().length, 3);
  await audio.dispose();
});

test('boss recovery ducks its own active cannon tail while retaining other cues and approved player Lance', async () => {
  const context = sampleContext({ [RACE_SAMPLES['goliath-fire']]: 0.7 });
  const playerContext = sampleContext();
  const audio = createAudio({
    createContext: () => context,
    engine: false,
    fetchAudio,
  });
  const pickups = createPickupAudio({
    createContext: () => playerContext,
    fetchAudio,
  });
  await audio.unlock();
  await pickups.unlock();
  audio.update(state, 0.35, true);
  pickups.update({ volume: 0.35 }, true);
  pickups.event({
    type: 'combat-fire',
    payload: { kind: 'lance', equipment: 'lance' },
  });
  const playerLance = playerContext.nodes.find(
    (node) => node.buffer?.sampleUrl === DEVICE_SAMPLES['lance-fire'],
  );
  assert.ok(playerLance, 'exercise the actual approved player fire sample');
  audio.event({
    type: 'interceptor-cue',
    payload: { bossId: 'goliath', cue: 'fire' },
  });
  audio.event({ type: 'impact' });
  audio.event({
    type: 'interceptor-hit',
    payload: {
      bossId: 'goliath',
      source: 'player',
      target: 'goliath',
      weakPoint: true,
    },
  });
  const sources = context.nodes.filter((node) => node.buffer?.sampleUrl);
  const fire = sources[0];
  const unchanged = [...sources, playerLance].map((voice) =>
    structuredClone(voice.destination.gain.automation),
  );
  context.currentTime = 1 / 60;
  audio.event({
    type: 'interceptor-cue',
    payload: { bossId: 'wraith', cue: 'recover' },
  });
  assert.deepEqual(
    fire.destination.gain.automation,
    unchanged[0],
    'another boss cannot duck Goliath',
  );
  audio.event({
    type: 'interceptor-cue',
    payload: { bossId: 'goliath', cue: 'recover' },
  });
  const duck = fire.destination.gain.automation.find(
    (entry) =>
      entry.type === 'linear' && Math.abs(entry.time - (1 / 60 + 0.015)) < 1e-9,
  );
  assert.equal(duck?.value, 0.9 * 0.5);
  assert.equal(
    fire.stops.length,
    1,
    'retain the original fire attack and fade its remaining body',
  );
  for (const [index, voice] of [...sources, playerLance].entries())
    if (voice !== fire)
      assert.deepEqual(
        voice.destination.gain.automation,
        unchanged[index],
        'other and player envelopes stay untouched',
      );
  audio.resetEnvironment();
  assert.ok(sources.every((voice) => voice.disconnected));
  assert.equal(
    playerLance.disconnected,
    false,
    'race retry does not own the player device bus',
  );
  await audio.dispose();
  await pickups.dispose();
});

test('a real boss disable quench survives results while ending attack voices and still obeys mute', async () => {
  const context = sampleContext({ [RACE_SAMPLES['goliath-disable']]: 1.2 });
  const audio = createAudio({ createContext: () => context, fetchAudio });
  await audio.unlock();
  audio.update(state, 0.35, true);
  const event = (cue) => ({
    type: 'interceptor-cue',
    payload: { bossId: 'goliath', cue },
  });
  const sources = () =>
    context.nodes.filter(
      (node) => node.kind === 'buffer' && node.buffer?.sampleUrl,
    );
  audio.event(event('charge'));
  const charge = sources()[0];
  audio.event(event('disable'));
  const disable = sources()[1];
  assert.equal(disable.buffer.sampleUrl, RACE_SAMPLES['goliath-disable']);
  assert.equal(charge.stops.length, 2, 'defeat ends an unfinished attack');
  audio.update(state, 0.35, false, { results: true });
  assert.equal(
    disable.stops.length,
    1,
    'results retain the full quench release',
  );
  audio.event(event('disable'));
  audio.event(event('fire'));
  assert.equal(
    sources().length,
    2,
    'neither duplicate defeat nor attack plays in results',
  );
  audio.update(state, 0, false, { results: true });
  assert.equal(disable.stops.length, 2, 'mute still silences the finish voice');
  audio.update(state, 0.35, false, { results: true });
  assert.equal(
    sources().length,
    2,
    'restoring volume does not replay the quench',
  );
  await audio.dispose();
});

test('captured Goliath clean and recovered attack cadences reach every authored cue without exhausting voices', async (t) => {
  const durations = {
    charge: 1.4,
    lock: 0.3,
    turn: 0.8,
    fire: 0.7,
    expose: 1.1,
    recover: 0.6,
    'core-hit': 0.5,
    disable: 1.2,
  };
  // Actual accepted events from the R07 hard clean/camp browser captures.
  const sequences = {
    clean: [
      [6.8624, 'charge'],
      [7.8624, 'lock'],
      [8.2624, 'turn'],
      [9.075, 'fire'],
      [10.075, 'fire'],
      [11.0624, 'return'],
      [11.8624, 'expose'],
      [12.6333, 'core-hit'],
      [13.35, 'core-hit'],
      [39.2917, 'disable'],
    ],
    recovered: [
      [22.0775, 'charge'],
      [23.0775, 'lock'],
      [23.4775, 'turn'],
      [24.2917, 'fire'],
      [24.3083, 'recover'],
      [25.2917, 'fire'],
      [26.2775, 'return'],
      [74.8833, 'disable'],
    ],
  };
  for (const [branch, sequence] of Object.entries(sequences))
    await t.test(branch, async () => {
      const context = sampleContext(
        Object.fromEntries(
          Object.entries(durations).map(([cue, seconds]) => [
            RACE_SAMPLES[`goliath-${cue}`],
            seconds,
          ]),
        ),
      );
      const audio = createAudio({
        createContext: () => context,
        engine: false,
        fetchAudio,
      });
      await audio.unlock();
      audio.update(state, 0.35, true);
      const sources = () =>
        context.nodes.filter(
          (node) => node.kind === 'buffer' && node.buffer?.sampleUrl,
        );
      for (const [elapsed, cue] of sequence) {
        context.currentTime = elapsed;
        for (const source of sources())
          if (!source.disconnected && source.stops[0] <= elapsed)
            source.onended?.();
        const before = sources().length;
        audio.event(
          cue === 'core-hit'
            ? {
                type: 'interceptor-hit',
                payload: {
                  source: 'player',
                  target: 'goliath',
                  bossId: 'goliath',
                  weakPoint: true,
                },
              }
            : {
                type: 'interceptor-cue',
                payload: { bossId: 'goliath', cue, elapsed },
              },
        );
        assert.equal(
          sources().length,
          before + 1,
          `${branch}: ${cue} is audible`,
        );
        const source = sources().at(-1);
        const id = `goliath-${cue === 'return' ? 'turn' : cue}`;
        assert.equal(source.buffer.sampleUrl, RACE_SAMPLES[id]);
        assert.equal(source.startTimes[0], elapsed, 'no stale deferred attack');
        assert.ok(sources().filter((voice) => !voice.disconnected).length <= 4);
        if (cue === 'disable') {
          audio.update(state, 0.35, false, { results: true });
          assert.equal(
            source.disconnected,
            false,
            'results keep the dedicated quench',
          );
        }
      }
      await audio.dispose();
      assert.ok(sources().every((source) => source.disconnected));
    });
});

test('boss disable may arrive on the results frame, then pause, mute, retry and disposal clear it without replay', async (t) => {
  for (const cancel of ['pause', 'mute', 'retry', 'dispose'])
    await t.test(cancel, async () => {
      const context = sampleContext({ [RACE_SAMPLES['goliath-disable']]: 1.2 });
      const audio = createAudio({
        createContext: () => context,
        engine: false,
        fetchAudio,
      });
      await audio.unlock();
      audio.update(state, 0.35, true);
      audio.update(state, 0.35, false, { results: true });
      const disableEvent = {
        type: 'interceptor-cue',
        payload: { bossId: 'goliath', cue: 'disable' },
      };
      audio.event(disableEvent);
      const sources = () =>
        context.nodes.filter(
          (node) => node.kind === 'buffer' && node.buffer?.sampleUrl,
        );
      const disable = sources()[0];
      assert.ok(
        disable,
        'the actual win is heard even after results becomes active',
      );
      assert.equal(disable.stops[0], 1.21, 'the complete quench is scheduled');
      context.currentTime = 0.2;
      if (cancel === 'pause') audio.update(state, 0.35, false);
      else if (cancel === 'mute')
        audio.update(state, 0, false, { results: true });
      else if (cancel === 'retry') audio.resetEnvironment();
      else await audio.dispose();
      assert.equal(disable.disconnected, true);
      assert.equal(disable.destination.disconnected, true);
      if (cancel === 'dispose') {
        audio.update(state, 0.35, true);
        audio.event(disableEvent);
        assert.equal(await audio.unlock(), false);
        assert.equal(context.closes, 1);
      } else {
        audio.update(state, 0.35, true, { countdown: cancel === 'retry' });
        assert.equal(
          sources().length,
          1,
          'resuming never replays the cancelled win',
        );
        audio.event({
          type: 'interceptor-cue',
          payload: { bossId: 'goliath', cue: 'charge' },
        });
        assert.equal(
          sources().length,
          2,
          'a new encounter has no stale finish guard',
        );
      }
      await audio.dispose();
    });
});

test('a mid-attack retry clears overlapping boss voices before the next countdown without reloading audio', async () => {
  const context = sampleContext();
  const audio = createAudio({
    createContext: () => context,
    engine: false,
    fetchAudio,
  });
  await audio.unlock();
  audio.update(state, 0.35, true);
  for (const cue of ['charge', 'fire'])
    audio.event({
      type: 'interceptor-cue',
      payload: { bossId: 'goliath', cue },
    });
  audio.event({
    type: 'interceptor-hit',
    payload: {
      source: 'player',
      target: 'goliath',
      bossId: 'goliath',
      weakPoint: true,
    },
  });
  const sources = () =>
    context.nodes.filter(
      (node) => node.kind === 'buffer' && node.buffer?.sampleUrl,
    );
  const old = sources();
  assert.equal(old.length, 3);
  const loaded = audio.getStatus().loadedSamples;
  audio.resetEnvironment();
  assert.ok(
    old.every((voice) => voice.disconnected && voice.destination.disconnected),
  );
  assert.equal(
    context.state,
    'running',
    'retry retains the unlocked audio device',
  );
  assert.deepEqual(
    audio.getStatus().loadedSamples,
    loaded,
    'decoded cues remain cached',
  );
  audio.update(state, 0.35, false, { countdown: true });
  audio.event({ type: 'countdown-beep', payload: { step: 3 } });
  assert.equal(
    sources().length,
    3,
    'the new countdown never replays stale attacks',
  );
  audio.update(state, 0.35, true);
  audio.event({
    type: 'interceptor-cue',
    payload: { bossId: 'goliath', cue: 'charge' },
  });
  assert.equal(
    sources().length,
    4,
    'fresh attacks remain available after retry',
  );
  assert.equal(sources().at(-1).disconnected, false);
  await audio.dispose();
});

test('Master scales race and device cues exactly once and Tunes remains independent', async () => {
  for (const id of ['countdown-go', 'repulsor-fire']) {
    const context = sampleContext();
    const settings = { masterVolume: 0.25, volume: 0.4, musicVolume: 0.8 };
    const statuses = [];
    let driver;
    const preview = createSoundPreview({
      getSettings: () => settings,
      onStatus: (value) => statuses.push(value),
      createRaceAudio: (options) =>
        (driver = createAudio({
          ...options,
          createContext: () => context,
          fetchAudio,
        })),
      createDeviceAudio: () =>
        (driver = createPickupAudio({
          createContext: () => context,
          fetchAudio,
        })),
      schedule: () => 0,
      cancel: () => {},
    });
    try {
      assert.equal(await preview.play(id), true, id);
      const master = context.nodes.find((node) => node.kind === 'gain').gain;
      const expected = 0.1 * (id === 'repulsor-fire' ? 0.95 : 1);
      assert.ok(Math.abs(master.value - expected) < 1e-12, id);
      settings.musicVolume = 0;
      assert.equal(preview.configure(), true);
      assert.ok(Math.abs(master.value - expected) < 1e-12, `${id}: music lane`);
      settings.masterVolume = 0;
      assert.equal(preview.configure(), false);
      assert.equal(master.value, 0, `${id}: Master silences active voices`);
      assert.equal(statuses.at(-1), 'Effects muted');
    } finally {
      preview.dispose();
      await driver?.dispose();
    }
  }
});

test('cup reward waits for the actual finish tail, survives results and cancels with its screen', async () => {
  const context = sampleContext({
    [RACE_SAMPLES['race-winner']]: 3,
    [RACE_SAMPLES['cup-champion']]: 3,
  });
  const audio = createAudio({
    createContext: () => context,
    engine: false,
    fetchAudio,
  });
  await audio.unlock();
  audio.update(state, 0.35, true);
  audio.event({
    type: 'player-race-complete',
    payload: { valid: true, position: 1 },
  });
  context.currentTime = 2.4;
  audio.update(state, 0.35, false, { results: true });
  const delay = audio.event({ type: 'cup-champion' });
  const sources = context.nodes.filter((node) => node.kind === 'buffer');
  const reward = sources.at(-1);
  assert.ok(Math.abs(reward.startTimes[0] - 3.26) < 1e-9);
  assert.ok(Math.abs(delay - 0.86) < 1e-9);
  assert.ok(reward.startTimes[0] >= sources[0].stops[0] + 0.25);
  audio.event({ type: 'cup-champion' });
  assert.equal(
    context.nodes.filter((node) => node.kind === 'buffer').length,
    2,
    'only one reveal voice',
  );
  audio.update(state, 0.35, false, { results: true });
  assert.equal(reward.disconnected, false);
  audio.update(state, 0.35, false);
  assert.equal(
    reward.disconnected,
    true,
    'leaving results cancels even a scheduled reward',
  );
  audio.update(state, 0.35, false, { results: true });
  assert.ok(
    Math.abs(audio.event({ type: 'cup-champion' }) - 0.6) < 1e-9,
    'no lingering finish delay',
  );
  const next = context.nodes.filter((node) => node.kind === 'buffer').at(-1);
  audio.update(state, 0, false, { results: true });
  assert.equal(next.disconnected, true, 'mute cancels the reward');
  assert.equal(audio.event({ type: 'cup-champion' }), undefined);
  await audio.dispose();
});

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

test('equipped abilities share their generated cues with gameplay and retain silent blocked hull hits', () => {
  assert.equal(
    deviceSample({
      type: 'jump-transfer',
      payload: { id: 'equipment-jump', outcome: 'landed' },
    }).id,
    'jump-land',
  );
  for (const payload of [
    { id: 'equipment-jump', outcome: 'recovered' },
    { id: 'course-jump', outcome: 'landed' },
  ])
    assert.equal(deviceSample({ type: 'jump-transfer', payload }), null);
  for (const { id } of EQUIPMENT.filter(({ id }) => id !== 'lance')) {
    const event = { type: 'equipment-activate', payload: { kind: id } };
    assert.equal(deviceSample(event).id, `${id}-activate`);
    assert.deepEqual(deviceCue(event), []);
    assert.ok(
      soundEffects.some(
        ({ event: cue }) => cue?.type === event.type && cue.payload.kind === id,
      ),
    );
  }
  const fire = {
    type: 'combat-fire',
    payload: { kind: 'arc', equipment: 'lance' },
  };
  assert.equal(deviceSample(fire).id, 'lance-fire');
  assert.deepEqual(deviceCue(fire), []);
  for (const type of ['combat-hit', 'combat-confirm', 'combat-contact']) {
    const event = { type, payload: { kind: 'repulsor', equipment: 'lance' } };
    assert.equal(deviceSample(event).id, 'lance-hit');
    assert.deepEqual(deviceCue(event), []);
  }
  assert.equal(
    deviceSample({
      type: 'combat-hit',
      payload: { kind: 'repulsor', equipment: 'lance', shielded: true },
    }),
    null,
  );
  assert.equal(
    deviceSample({
      type: 'combat-confirm',
      payload: { kind: 'repulsor', equipment: 'lance', shielded: true },
    }).id,
    'shield-block',
  );
  assert.equal(
    deviceSample({ type: 'equipment-block', payload: { kind: 'deflector' } })
      .id,
    'shield-block',
  );
  assert.equal(
    deviceSample({ type: 'equipment-expire', payload: { kind: 'deflector' } })
      .id,
    'shield-block',
  );
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
