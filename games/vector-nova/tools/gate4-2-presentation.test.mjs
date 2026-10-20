import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrack } from '../src/levels/halcyon/track/model.js';
import { sweepGeometry } from '../src/track/geometry.js';
import {
  createRoadProjector,
  createDeviceGeometry,
  createShipFeedback,
  disposeGroup,
} from '../src/pickups/geometry.js';
import { createPickupAudio } from '../src/pickups/audio.js';
import { createCameraRig } from '../src/camera/index.js';
import { createHalcyonDevices } from '../src/levels/halcyon/devices.js';

test('pickup panels conform to real road triangle planes through banking, inversion, plunge and seam', () => {
  const track = createTrack();
  const surface = sweepGeometry(track, [
    [-14, 0],
    [14, 0],
  ]);
  const projector = createRoadProjector(track, surface);
  const road = new THREE.Mesh(
    surface,
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  road.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const centre = new THREE.Vector3();
  const up = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  let checked = 0;
  for (const s of [
    0, 70, 360, 1100, 1760, 2210, 2450, 2960, 3770, 4500, 5000,
  ]) {
    const shapes = [
      [
        [-7, s - 9],
        [7, s - 9],
        [7, s + 9],
        [-7, s + 9],
      ],
      [
        [-6, s - 24],
        [6, s - 24],
        [0, s - 20],
      ],
    ];
    const panel = projector.geometry(shapes, 0.08);
    const position = panel.attributes.position;
    for (let i = 0; i < position.count; i += 3) {
      centre.set(0, 0, 0);
      for (let corner = 0; corner < 3; corner++) {
        vertex.fromBufferAttribute(position, i + corner);
        assert.ok(vertex.toArray().every(Number.isFinite));
        centre.addScaledVector(vertex, 1 / 3);
      }
      up.fromBufferAttribute(panel.attributes.normal, i);
      ray.set(centre.clone().addScaledVector(up, 0.1), up.clone().negate());
      ray.far = 0.25;
      const hit = ray.intersectObject(road)[0];
      assert.ok(hit, `No real road beneath pickup triangle at ${s}m`);
      assert.ok(
        Math.abs(hit.distance - 0.18) < 0.0006,
        `Panel penetrates/floats off triangle: ${hit.distance - 0.1}`,
      );
      checked++;
    }
    panel.dispose();
  }
  assert.ok(checked > 150);
  surface.dispose();
  road.material.dispose();
});

test('device geometry is finite, bounded and entirely owned for disposal', () => {
  const track = createTrack();
  const projector = createRoadProjector(track);
  const group = new THREE.Group();
  for (const type of ['vector', 'aegis']) {
    const visual = createDeviceGeometry(
      track,
      {
        id: type,
        type,
        distance: 2210,
        lateral: 2,
        width: 8,
        length: type === 'vector' ? 18 : 8,
      },
      projector,
    );
    group.add(visual.group);
    let draws = 0;
    visual.group.traverse((object) => {
      if (object.isMesh) draws++;
    });
    assert.equal(
      draws,
      type === 'vector' ? 5 : 9,
      'Raised arch is owned separately from solid road panels',
    );
    const bounds = new THREE.Box3().setFromObject(visual.group);
    assert.ok(bounds.min.toArray().every(Number.isFinite));
    assert.ok(bounds.max.toArray().every(Number.isFinite));
    assert.ok(bounds.getSize(new THREE.Vector3()).length() < 85);
    visual.setAvailable(false);
    assert.equal(visual.materials.signal.emissiveIntensity, 0.06);
  }
  const feedback = createShipFeedback();
  group.add(feedback.group);
  let disposedGeometries = 0;
  let disposedMaterials = 0;
  group.traverse((object) => {
    object.geometry?.addEventListener('dispose', () => disposedGeometries++);
    object.material?.addEventListener('dispose', () => disposedMaterials++);
  });
  disposeGroup(group);
  assert.equal(disposedGeometries, 17);
  assert.equal(disposedMaterials, 17);
  projector.dispose();
});

class Param {
  value = 0;
  automation = [];
  setValueAtTime(value, time) {
    this.value = value;
    this.automation.push({ type: 'set', value, time });
  }
  setTargetAtTime(value, time) {
    this.value = value;
    this.automation.push({ type: 'target', value, time });
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
  cancelScheduledValues() {}
  cancelAndHoldAtTime() {}
}
class Context {
  state = 'suspended';
  sampleRate = 48000;
  currentTime = 1;
  destination = {};
  nodes = [];
  fail = false;
  createGain() {
    return this.node('gain');
  }
  createBuffer(channels, length) {
    const data = Array.from(
      { length: channels },
      () => new Float32Array(length),
    );
    return { getChannelData: (channel) => data[channel] };
  }
  createBufferSource() {
    return this.node('buffer');
  }
  createBiquadFilter() {
    return this.node('filter');
  }
  createDynamicsCompressor() {
    return this.node('compressor');
  }
  createOscillator() {
    return this.node('oscillator');
  }
  node(kind) {
    const node = {
      kind,
      gain: new Param(),
      frequency: new Param(),
      Q: new Param(),
      threshold: new Param(),
      knee: new Param(),
      ratio: new Param(),
      attack: new Param(),
      release: new Param(),
      stopped: false,
      stopTimes: [],
      disconnected: false,
      connect() {
        return this;
      },
      disconnect() {
        this.disconnected = true;
      },
      start(time) {
        this.startTime = time;
      },
      stop(time) {
        this.stopped = true;
        this.stopTimes.push(time);
      },
    };
    this.nodes.push(node);
    return node;
  }
  async resume() {
    if (this.fail) throw new Error('Blocked');
    this.state = 'running';
  }
  async close() {
    this.state = 'closed';
  }
}

test('pickup audio is silent before gestures, while paused/muted and after disposal', async () => {
  const context = new Context();
  const audio = createPickupAudio({
    createContext: () => context,
    samples: {},
  });
  const event = { type: 'pickup-activate', payload: { kind: 'vector' } };
  audio.update({ volume: 0.35 }, true);
  audio.event(event);
  assert.equal(context.nodes.length, 0);
  assert.equal(await audio.unlock(), true);
  audio.update({ volume: 0.35 }, true);
  audio.event(event);
  assert.equal(audio.getStatus().shots, 1);
  audio.update({ volume: 0.35 }, false);
  assert.equal(audio.getStatus().shots, 0);
  assert.equal(context.nodes[0].gain.value, 0);
  audio.event(event);
  assert.equal(audio.getStatus().shots, 0);
  audio.update({ volume: 1, muted: true }, true);
  assert.equal(context.nodes[0].gain.value, 0);
  audio.update({ volume: 0 }, true);
  assert.equal(audio.getStatus().active, false);
  audio.update({ volume: 1 }, true);
  for (const type of [
    'pickup-activate',
    'shield-hit',
    'pickup-expire',
    'pickup-unavailable',
    'pickup-cancel',
  ])
    audio.event({ type, payload: { kind: 'aegis' } });
  assert.equal(audio.getStatus().shots, 4, 'Bounded polyphony');
  await audio.dispose();
  assert.equal(context.state, 'closed');
  assert.ok(context.nodes.every((node) => node.disconnected));
  assert.equal(await audio.unlock(), false);
});

test('blocked and absent AudioContext cannot prevent visual gameplay', async () => {
  const unavailable = createPickupAudio({
    createContext() {
      throw new Error('Unavailable');
    },
  });
  assert.equal(await unavailable.unlock(), false);
  unavailable.update({ volume: 1 }, true);
  unavailable.event({ type: 'shield-hit' });
  await unavailable.dispose();
  const context = new Context();
  context.fail = true;
  const blocked = createPickupAudio({
    createContext: () => context,
    samples: {},
  });
  assert.equal(await blocked.unlock(), false);
  blocked.update({ volume: 1 }, true);
  blocked.event({ type: 'shield-hit' });
  assert.equal(blocked.getStatus().shots, 0);
  await blocked.dispose();
  assert.equal(context.state, 'closed');
});

test('acquisition signatures are distinct, finite and release every layered voice', async () => {
  const context = new Context();
  const audio = createPickupAudio({
    createContext: () => context,
    samples: {},
  });
  await audio.unlock();
  audio.update({ volume: 0.5 }, true);
  const busNodeCount = context.nodes.length;
  const signatures = [];
  for (const [type, kind] of [
    ['pickup-activate', 'vector'],
    ['pickup-activate', 'aegis'],
    ['shield-hit', 'aegis'],
  ]) {
    const first = context.nodes.length;
    audio.event({ type, payload: { kind } });
    const voices = context.nodes
      .slice(first)
      .filter((node) => node.kind === 'oscillator' || node.kind === 'buffer');
    const envelopes = context.nodes
      .slice(first)
      .filter((node) => node.kind === 'gain');
    assert.ok(
      voices.length > 1,
      'A complete signature has a body and harmonic layer',
    );
    assert.equal(audio.getStatus().shots, 1);
    signatures.push(
      voices.map((voice) => [voice.type, voice.frequency.automation]),
    );
    for (const envelope of envelopes) {
      assert.equal(envelope.gain.automation[0].value, 0);
      const attack = envelope.gain.automation.find(
        (item) => item.type === 'linear' && item.value > 0,
      );
      assert.ok(attack.time > context.currentTime);
      assert.equal(envelope.gain.automation.at(-1).value, 0);
    }
    for (const voice of voices) {
      assert.ok(Number.isFinite(voice.stopTimes[0]));
      assert.ok(voice.stopTimes[0] > voice.startTime);
    }
    voices[0].onended();
    assert.equal(
      audio.getStatus().shots,
      1,
      'Ending one layer leaves its remaining tail owned',
    );
    for (const voice of voices.slice(1)) voice.onended();
    assert.equal(audio.getStatus().shots, 0);
    assert.ok([...voices, ...envelopes].every((node) => node.disconnected));
  }
  assert.notDeepEqual(signatures[0], signatures[1]);
  assert.notDeepEqual(signatures[1], signatures[2]);
  audio.event({ type: 'pickup-activate', payload: { kind: 'aegis' } });
  audio.silence();
  assert.equal(audio.getStatus().shots, 0);
  assert.ok(
    context.nodes.slice(busNodeCount).every((node) => node.disconnected),
  );
  await audio.dispose();
});

test('failed audio unlock releases its graph and a later gesture can recover', async () => {
  const failed = new Context();
  failed.fail = true;
  const recovered = new Context();
  let attempts = 0;
  const audio = createPickupAudio({
    samples: {},
    createContext: () => (attempts++ ? recovered : failed),
  });
  assert.equal(await audio.unlock(), false);
  assert.equal(failed.state, 'closed');
  assert.ok(failed.nodes.every((node) => node.disconnected));
  assert.equal(await audio.unlock(), true);
  audio.update({ volume: 1 }, true);
  audio.event({ type: 'pickup-activate', payload: { kind: 'vector' } });
  assert.equal(audio.getStatus().shots, 1);
  await audio.dispose();
  assert.equal(recovered.state, 'closed');
});

test('later unprotected contact replaces protection feedback immediately; pause and reset freeze/clear effects', async () => {
  // Load the actual module with only browser CSS removed for the Node harness.
  const { readFile } = await import('node:fs/promises');
  const sourceUrl = new URL('../src/pickups/presentation.js', import.meta.url);
  const source = (await readFile(sourceUrl, 'utf8'))
    .replace("import './style.css';", '')
    .replace("'three'", JSON.stringify(import.meta.resolve('three')))
    .replace(/'(\.\/[^']+\.js)'/g, (_, path) =>
      JSON.stringify(new URL(path, sourceUrl).href),
    );
  const { createPickupPresentation } = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  );
  class Element {
    children = new Map();
    style = {
      setProperty(name, value) {
        this[name] = value;
      },
    };
    dataset = {};
    classes = new Set();
    classList = {
      toggle: (name, active) => {
        if (active) this.classes.add(name);
        else this.classes.delete(name);
      },
    };
    textContent = '';
    querySelector(selector) {
      if (!this.children.has(selector))
        this.children.set(selector, new Element());
      return this.children.get(selector);
    }
    setAttribute() {}
    append() {}
    remove() {
      this.removed = true;
    }
  }
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = {
    hidden: false,
    createElement: () => new Element(),
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  const ship = new THREE.Group();
  const scene = new THREE.Scene();
  const track = createTrack();
  const road = new THREE.Mesh(
    sweepGeometry(track, [
      [-14, 0],
      [14, 0],
    ]),
    new THREE.MeshBasicMaterial(),
  );
  road.userData.roadSurface = true;
  const view = createPickupPresentation({
    track,
    road,
    scene,
    ship,
    host: new Element(),
    settings: { volume: 0 },
  });
  const field = ship.children[0].children.find(
    (object) => object.name === 'Aegis / hull field and outward pulses',
  );
  const drive = ship.children[0].children.find(
    (object) => object.name === 'Vector / soft twin nozzle volume',
  );
  const notice = view.hud.querySelector('.race-device-message');
  try {
    const frame = {
      state: { distance: 370 },
      effects: { aegisRemaining: 0, vectorActive: false },
      mode: 'racing',
      dt: 0.01,
      settings: { volume: 0 },
    };
    const vectorRow = view.hud.querySelector('[data-kind="vector"]');
    view.update({
      ...frame,
      effects: { vectorActive: true, aegisRemaining: 0 },
      events: [{ type: 'pickup-activate', payload: { kind: 'vector' } }],
    });
    assert.equal(vectorRow.classes.has('is-acquired'), true);
    assert.equal(
      vectorRow.querySelector('[data-toast]').textContent,
      'CATAPULT',
    );
    assert.equal(
      vectorRow.querySelector('[data-value]').textContent,
      'CATAPULT',
    );
    assert.equal(drive.visible, true);
    assert.equal(
      vectorRow.querySelector('em').style.transform,
      undefined,
      'Vector has no timed meter',
    );
    const acquisitionPop = vectorRow.style['--device-pop'];
    view.update({ ...frame, mode: 'paused', dt: 10 });
    assert.equal(
      vectorRow.style['--device-pop'],
      acquisitionPop,
      'Pause freezes acquisition feedback',
    );
    view.update({
      ...frame,
      dt: 0.1,
      events: [{ type: 'pickup-exit', payload: { kind: 'vector' } }],
    });
    assert.equal(
      drive.visible,
      false,
      'Strip exit stops force feedback immediately',
    );
    assert.equal(vectorRow.querySelector('[data-value]').textContent, 'CARRY');
    assert.match(notice.textContent, /SPEED CARRIED/);
    view.update({ ...frame, dt: 1.2 });
    assert.equal(vectorRow.classes.has('is-acquired'), false);
    assert.equal(vectorRow.querySelector('[data-toast]').textContent, '');
    view.update({
      ...frame,
      events: [{ type: 'shield-hit', payload: { kind: 'aegis', side: -1 } }],
    });
    assert.match(notice.textContent, /RESERVE PROTECTED/);
    assert.equal(field.visible, true);
    assert.equal(field.material.uniforms.hitSide.value, -1);
    view.update({ ...frame, mode: 'paused', dt: 10 });
    assert.match(notice.textContent, /RESERVE PROTECTED/);
    view.update({
      ...frame,
      events: [{ type: 'impact', payload: { severity: 0.5, side: -1 } }],
    });
    assert.equal(notice.textContent, 'UNPROTECTED HIT · RESERVE LOST');
    assert.equal(
      field.visible,
      false,
      'Later damage cannot retain a shield hit pulse',
    );
    view.update({
      ...frame,
      events: [{ type: 'pickup-expire', payload: { kind: 'aegis' } }],
    });
    assert.equal(
      field.visible,
      true,
      'Expiry has a restrained release response',
    );
    view.update({ ...frame, dt: 0.6 });
    assert.equal(field.visible, false);
    view.update({
      ...frame,
      effects: { aegisRemaining: 4, vectorActive: true },
      settings: { volume: 0, reducedMotion: true },
    });
    assert.equal(drive.visible, true);
    assert.equal(view.hud.classes.has('has-vector'), true);
    assert.equal(view.hud.classes.has('has-aegis'), true);
    assert.equal(drive.material.uniforms.flowTime.value, 0);
    assert.equal(field.material.uniforms.reducedMotion.value, 1);
    view.reset();
    assert.equal(notice.textContent, '');
    assert.equal(field.visible, false);
    assert.equal(drive.visible, false);
    assert.equal(vectorRow.classes.has('is-acquired'), false);
  } finally {
    view.dispose();
    road.geometry.dispose();
    road.material.dispose();
    assert.equal(scene.children.length, 0);
    assert.equal(ship.children.length, 0);
    assert.equal(view.hud.removed, true);
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});

test('all Aegis arches clear the whole chase corridor through pickup, braking and stop without fading the road', () => {
  const track = createTrack();
  const projector = createRoadProjector(track);
  const aegis = createHalcyonDevices(track).filter(
    (device) => device.type === 'aegis',
  );
  // Also exercise a fully inverted frame without adding a production device.
  aegis.push({ ...aegis[0], id: 'inverted-check', distance: 2210 });
  for (const device of aegis) {
    const visual = createDeviceGeometry(track, device, projector);
    const roadMeshes = visual.group.children.filter(
      (object) => object.isMesh && !object.userData.aoExclude,
    );
    for (const [width, height] of [
      [1600, 900],
      [390, 844],
      [844, 390],
    ]) {
      for (const available of [true, false]) {
        visual.setAvailable(available);
        for (const offset of [
          -35, -20, -15, 0, 5, 10, 11.14, 11.63, 12, 14, 18, 50,
        ]) {
          const state = {
            distance: device.distance + offset,
            lateral: device.lateral,
            speed: 0,
          };
          const frame = track.sample(state.distance);
          const shipPosition = frame.position
            .clone()
            .addScaledVector(frame.right, state.lateral)
            .addScaledVector(frame.up, 0.72);
          const camera = new THREE.PerspectiveCamera(
            61,
            width / height,
            0.1,
            2000,
          );
          createCameraRig(camera).update(track, state, 0, { mode: 'chase' });
          // No dt/active-effect requirement: paused and spent/missed devices use
          // the same current camera clearance, including after a viewport change.
          visual.updateCamera(camera, shipPosition);
          const label = `${device.id}, +${offset}m, ${width}x${height}, available=${available}`;
          if (offset >= 0 && offset <= 14)
            assert.equal(visual.arch.visible, false, label);
          else if (offset < 0 || offset > 45)
            assert.equal(visual.arch.visible, true, label);
          if (offset < -14 || offset > 45)
            assert.equal(
              visual.arch.children[0].material.opacity,
              1,
              `Approach silhouette preserved: ${label}`,
            );
          assert.ok(
            roadMeshes.every(
              (mesh) =>
                mesh.visible &&
                mesh.material.opacity === 1 &&
                !mesh.material.transparent,
            ),
            `Road is never faded: ${label}`,
          );
        }
      }
    }
    disposeGroup(visual.group);
  }
  projector.dispose();
});

test('device voice priority preserves hits, fades stolen voices and owns sustained beds', async () => {
  const context = new Context();
  const audio = createPickupAudio({
    createContext: () => context,
    samples: {},
  });
  await audio.unlock();
  audio.update({ volume: 0.8 }, true);
  const bedGains = context.nodes
    .filter((node) => node.kind === 'gain')
    .slice(1);
  audio.setEffects({ vector: true, ion: true });
  assert.deepEqual(
    bedGains.map((node) => node.gain.value),
    [0.09, 0.07],
  );
  const first = context.nodes.length;
  const fire = { type: 'combat-fire', payload: { kind: 'arc' } };
  audio.event(fire);
  const firstVoices = context.nodes
    .slice(first)
    .filter((node) => node.kind === 'oscillator' || node.kind === 'buffer');
  const firstGains = context.nodes
    .slice(first)
    .filter((node) => node.kind === 'gain');
  for (let i = 0; i < 3; i++) audio.event(fire);
  const fullCount = context.nodes.length;
  audio.event({ type: 'combat-hit', payload: { kind: 'arc', shielded: true } });
  audio.event({ type: 'pickup-unavailable', payload: { kind: 'arc' } });
  assert.equal(
    context.nodes.length,
    fullCount,
    'Empty/lower-priority cues cannot evict an attack',
  );
  assert.ok(firstVoices.every((node) => node.stopTimes.length === 1));
  audio.event({ type: 'shield-hit', payload: { kind: 'aegis' } });
  assert.equal(audio.getStatus().shots, 4);
  for (const gain of firstGains)
    assert.deepEqual(gain.gain.automation.at(-1), {
      type: 'linear',
      value: 0,
      time: context.currentTime + 0.008,
    });
  for (const voice of firstVoices) {
    assert.equal(voice.stopTimes.at(-1), context.currentTime + 0.01);
    assert.equal(
      voice.disconnected,
      false,
      'Tail remains connected through its release',
    );
  }
  audio.update({ volume: 0.8 }, false);
  assert.deepEqual(
    bedGains.map((node) => node.gain.value),
    [0, 0],
  );
  assert.ok(
    context.nodes.slice(first).every((node) => node.disconnected),
    'Pause releases active and retiring voices',
  );
  audio.setEffects({ vector: true, ion: true });
  assert.deepEqual(
    bedGains.map((node) => node.gain.value),
    [0, 0],
    'Effect updates cannot restart paused sound',
  );
  await audio.dispose();
  assert.ok(context.nodes.every((node) => node.disconnected));
});
