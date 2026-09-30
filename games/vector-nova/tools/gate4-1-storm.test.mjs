import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  createNacreBackdrop,
  sampleNacreLightning,
  NACRE_STORM_RULES,
} from '../src/renderer/level3/index.js';
import {
  createNacreThunder,
  createNacreThunderBuffer,
  NACRE_THUNDER_RULES,
} from '../src/audio/nacre-thunder.js';

const position = new T.Vector3(0, 70, 0);
const direction = new T.Vector3(0, 0, 1);
const onset = sampleNacreLightning(0).onset;
const peakTime = onset + NACRE_STORM_RULES.attackSeconds;

test('Nacre storm strikes soon and at bounded seeded cadence with one continuous pulse, never a strobe', () => {
  let previousOnset;
  for (let cycle = 0; cycle < 100; cycle += 1) {
    const sample = sampleNacreLightning(
      cycle * NACRE_STORM_RULES.periodSeconds,
    );
    const start = cycle * NACRE_STORM_RULES.periodSeconds + sample.onset;
    assert.ok(sample.onset >= 2.6 && sample.onset <= 3.2);
    if (previousOnset !== undefined)
      assert.ok(start - previousOnset >= 11.4 && start - previousOnset <= 12.6);
    previousOnset = start;
    let transitions = 0;
    let lit = false;
    for (let age = -0.01; age < 0.9; age += 0.01) {
      const pulse = sampleNacreLightning(start + age);
      assert.deepEqual(pulse, sampleNacreLightning(start + age));
      assert.ok(pulse.intensity >= 0 && pulse.intensity <= 0.14);
      assert.ok(pulse.flash >= 0 && pulse.flash <= 0.032);
      assert.equal(sampleNacreLightning(start + age, true).intensity, 0);
      const next = pulse.intensity > 0;
      if (lit !== next) transitions += 1;
      lit = next;
    }
    assert.equal(transitions, 2);
  }
  for (const time of [-1, NaN, Infinity])
    assert.equal(sampleNacreLightning(time).intensity, 0);
});

test('Nacre bolt is in front across compass headings and stays world-anchored during the pulse', () => {
  for (const azimuth of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const sky = createNacreBackdrop();
    const facing = new T.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
    sky.update(position, peakTime, {}, { direction: facing });
    const state = sky.getPresentation();
    assert.ok(state.lightningIntensity > 0.139);
    const camera = new T.PerspectiveCamera(64, 1440 / 900, 0.2, 14000);
    camera.position.copy(position);
    camera.lookAt(position.clone().add(facing));
    camera.updateMatrixWorld();
    const ray = new T.Vector3(
      Math.cos(state.lightningAzimuth),
      0.27,
      Math.sin(state.lightningAzimuth),
    ).normalize();
    const point = ray.multiplyScalar(10000).add(position).project(camera);
    assert.ok(Math.abs(point.x) < 0.3 && Math.abs(point.y) < 0.7);
    assert.ok(point.z > -1 && point.z < 1);
    sky.update(position, peakTime + 0.02, {}, { direction: facing.negate() });
    assert.equal(
      sky.getPresentation().lightningAzimuth,
      state.lightningAzimuth,
    );
    assert.equal(sky.metrics.stormRenderPasses, 0);
    assert.equal(sky.metrics.stormLights, 0);
    sky.dispose();
  }
});

test('Nacre first thunder survives title/reset and emits once on simulation time; pause, reduced motion, seek and teardown are safe', () => {
  const sky = createNacreBackdrop();
  for (let count = 0; count < 5; count++)
    sky.update(position, 0, {}, { enabled: false });
  sky.update(position, 0, {}, { direction, enabled: true, reset: true });
  const events = [];
  for (let time = 0.01; time < 4; time += 0.01) {
    sky.update(position, time, {}, { direction, enabled: true });
    events.push(...sky.drainStormEvents());
  }
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'nacre-thunder');
  assert.equal(events[0].id, 'nacre-storm-0');
  assert.ok(events[0].simulationTime >= onset + 0.16);
  const beforePause = sky.getPresentation();
  for (let count = 0; count < 20; count++)
    sky.update(position, beforePause.elapsed, {}, { direction });
  assert.deepEqual(sky.getPresentation(), beforePause);
  assert.deepEqual(sky.drainStormEvents(), []);
  sky.update(position, 0, {}, { direction, reset: true });
  for (let time = 0.01; time < 4; time += 0.01)
    sky.update(position, time, { reducedMotion: true }, { direction });
  assert.equal(sky.getPresentation().lightningIntensity, 0);
  assert.equal(sky.getPresentation().lightningFlash, 0);
  assert.deepEqual(sky.drainStormEvents(), []);
  sky.update(position, 0, {}, { reset: true });
  sky.update(position, onset + 0.2, {}, { direction });
  sky.update(position, onset + 0.21, {}, { direction });
  assert.deepEqual(sky.drainStormEvents(), []);
  sky.setOverview(true);
  sky.update(position, peakTime, {}, { direction });
  assert.equal(sky.getPresentation().lightningIntensity, 0);
  sky.dispose();
  sky.dispose();
  assert.equal(sky.group.children.length, 0);
});

test('Nacre submerged sky attenuates the visible strike while its event carries muffling depth', () => {
  const sky = createNacreBackdrop();
  const underwater = new T.Vector3(0, -20, 0);
  sky.update(underwater, 0, {}, { direction, reset: true });
  const events = [];
  for (let time = 0.01; time < 4; time += 0.01) {
    sky.update(underwater, time, {}, { direction });
    assert.equal(sky.getPresentation().lightningIntensity, 0);
    assert.equal(sky.getPresentation().lightningFlash, 0);
    events.push(...sky.drainStormEvents());
  }
  assert.equal(events.length, 1);
  assert.equal(events[0].submerged, 1);
  sky.dispose();
});

class Param {
  value = 0;
  automation = [];
  setValueAtTime(value, time) {
    this.automation.push({ value, time });
  }
  linearRampToValueAtTime(value, time) {
    this.automation.push({ value, time });
  }
  exponentialRampToValueAtTime(value, time) {
    assert.ok(value > 0);
    this.automation.push({ value, time });
  }
}
class Context {
  sampleRate = 12000;
  currentTime = 4;
  state = 'running';
  destination = {};
  nodes = [];
  buffers = 0;
  createBuffer(channels, length, sampleRate) {
    this.buffers++;
    const data = Array.from(
      { length: channels },
      () => new Float32Array(length),
    );
    return {
      duration: length / sampleRate,
      getChannelData: (channel) => data[channel],
    };
  }
  node(kind) {
    const node = {
      kind,
      gain: new Param(),
      frequency: new Param(),
      Q: new Param(),
      pan: new Param(),
      starts: [],
      stops: [],
      disconnected: false,
      connect(other) {
        this.destination = other;
        return other;
      },
      disconnect() {
        this.disconnected = true;
      },
      start(time = 0) {
        this.starts.push(time);
      },
      stop(time = 0) {
        this.stops.push(time);
      },
    };
    this.nodes.push(node);
    return node;
  }
  createBufferSource() {
    return this.node('source');
  }
  createBiquadFilter() {
    return this.node('filter');
  }
  createGain() {
    return this.node('gain');
  }
  createStereoPanner() {
    return this.node('pan');
  }
}

test('Nacre thunder synthesis is original deterministic stereo with a finite crack, audible roll and bounded tail', () => {
  const context = new Context();
  const first = createNacreThunderBuffer(context);
  const second = createNacreThunderBuffer(context);
  assert.equal(first.duration, 2.8);
  for (let channel = 0; channel < 2; channel++) {
    const data = first.getChannelData(channel);
    assert.deepEqual(data, second.getChannelData(channel));
    assert.ok(data.every(Number.isFinite));
    const peak = data.reduce(
      (value, sample) => Math.max(value, Math.abs(sample)),
      0,
    );
    assert.ok(peak <= NACRE_THUNDER_RULES.peakBufferAmplitude + 1e-6);
    const rms = (a, b) => {
      const slice = data.slice(a * context.sampleRate, b * context.sampleRate);
      return Math.sqrt(
        slice.reduce((sum, sample) => sum + sample * sample, 0) / slice.length,
      );
    };
    assert.ok(rms(0.004, 0.07) > rms(0.25, 0.8));
    assert.ok(rms(0.25, 0.8) > 0.02);
    assert.ok(rms(2.6, 2.8) < 0.01);
  }
});

test('Nacre thunder voices are lazy, cached, deduplicated, bounded and muffled underwater; stop/dispose releases every node', () => {
  const context = new Context();
  const thunder = createNacreThunder(context, context.destination);
  assert.equal(context.buffers, 0);
  const event = { type: 'nacre-thunder', id: '0', pan: 50, submerged: 0 };
  assert.equal(thunder.trigger({ type: 'impact' }), false);
  context.state = 'suspended';
  assert.equal(thunder.trigger(event), false);
  context.state = 'running';
  assert.equal(thunder.trigger(event), true);
  assert.equal(thunder.trigger(event), false);
  assert.equal(context.buffers, 1);
  assert.equal(thunder.getPresentation().lastGain, 0.32);
  assert.equal(
    context.nodes.find((node) => node.kind === 'pan').pan.value,
    0.25,
  );
  assert.equal(thunder.trigger({ ...event, id: '1', submerged: 1 }), true);
  assert.equal(thunder.trigger({ ...event, id: '2' }), false);
  assert.equal(thunder.getPresentation().lastLowpass, 460);
  assert.ok(thunder.getPresentation().lastGain < 0.17);
  assert.equal(context.buffers, 1);
  for (const gain of context.nodes.filter((node) => node.kind === 'gain'))
    assert.ok(
      gain.gain.automation.every(({ value }) => value >= 0 && value <= 0.32),
    );
  context.nodes.find((node) => node.kind === 'source').onended();
  assert.equal(thunder.getPresentation().activeVoices, 1);
  thunder.stop();
  assert.equal(thunder.getPresentation().activeVoices, 0);
  assert.ok(context.nodes.every((node) => node.disconnected));
  assert.equal(thunder.trigger(event), true);
  assert.equal(context.buffers, 1);
  thunder.dispose();
  thunder.dispose();
  assert.ok(context.nodes.every((node) => node.disconnected));
  assert.equal(thunder.trigger({ ...event, id: '3' }), false);
});
