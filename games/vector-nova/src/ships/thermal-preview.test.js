import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
} from 'three';
import { createAudio } from '../audio/index.js';
import { createHazardContactAudio } from '../audio/hazard-contact.js';
import { createPickupPreview } from './pickup-preview.js';
import { DEVICE_PREVIEWS } from './pickup-preview-sequence.js';
import {
  createThermalPreview,
  thermalPreviewFeedback,
} from './thermal-preview.js';

class Param {
  value = 0;
  cancelAndHoldAtTime() {}
  cancelScheduledValues() {}
  setTargetAtTime(value) {
    this.value = value;
  }
  setValueAtTime(value) {
    this.value = value;
  }
  linearRampToValueAtTime(value) {
    this.value = value;
  }
}

function fixture({ main = false, defer = false } = {}) {
  const scene = new Group(),
    frame = new Group(),
    ship = new Group();
  const geometry = new BoxGeometry(3, 1, 6),
    material = new MeshBasicMaterial();
  ship.add(new Mesh(geometry, material));
  scene.add(frame);
  frame.add(ship);
  frame.rotation.y = 0.7;
  const camera = new PerspectiveCamera();
  camera.position.set(10, 8, 14);
  camera.lookAt(0, 0, 0);
  const settings = {
    masterVolume: 0.5,
    volume: 0.4,
    quality: 'high',
    reducedMotion: false,
  };
  const nodes = [],
    contexts = [],
    owners = [];
  let resolveFetch;
  const pending = defer
    ? new Promise((resolve) => {
        resolveFetch = resolve;
      })
    : null;
  const context = {
    state: 'suspended',
    currentTime: 0,
    destination: {},
    closes: 0,
    node(kind) {
      const node = {
        kind,
        starts: 0,
        stops: 0,
        disconnected: false,
        connect(target) {
          this.destination = target;
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
      for (const name of [
        'gain',
        'frequency',
        'Q',
        'threshold',
        'knee',
        'ratio',
        'attack',
        'release',
      ])
        node[name] = new Param();
      nodes.push(node);
      return node;
    },
    createGain() {
      return this.node('gain');
    },
    createBiquadFilter() {
      return this.node('filter');
    },
    createDynamicsCompressor() {
      return this.node('compressor');
    },
    createBufferSource() {
      return this.node('source');
    },
    async decodeAudioData() {
      return { duration: 4 };
    },
    async resume() {
      this.state = 'running';
    },
    async close() {
      this.state = 'closed';
      this.closes++;
    },
  };
  const createThermal = (options) =>
    createThermalPreview({
      ...options,
      createRaceAudio(options) {
        assert.equal(options.engine, false);
        assert.deepEqual(options.samples, {});
        const audio = createAudio({
          ...options,
          createContext: () => {
            contexts.push(context);
            return context;
          },
        });
        owners.push(audio);
        return audio;
      },
      createContactAudio(context, bus, options) {
        assert.deepEqual(Object.keys(options), ['readFeedback']);
        return createHazardContactAudio(context, bus, {
          ...options,
          fetchAudio: async () => {
            if (pending) await pending;
            return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
          },
        });
      },
    });
  const options = { ship, frame, scene, camera, getSettings: () => settings };
  const preview = main
    ? createPickupPreview({
        ...options,
        createThermal,
        createAudio: () => ({
          prepare() {
            throw new Error('Fire must not prepare pickup samples');
          },
          stop() {},
          update() {},
          setEffects() {},
          event() {},
          dispose() {},
        }),
      })
    : createThermal(options);
  return {
    preview,
    scene,
    frame,
    ship,
    settings,
    context,
    nodes,
    contexts,
    owners,
    geometry,
    resolve: () => resolveFetch?.(),
    dispose() {
      preview.dispose();
      geometry.dispose();
      material.dispose();
      return Promise.all(owners.map((audio) => audio.dispose()));
    },
  };
}

test('the combined selector stages one fire contact and its full cooling tail without pickup events', () => {
  const entries = DEVICE_PREVIEWS.filter(({ id }) => id === 'fire-contact');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].group, 'World contact');
  const contact = thermalPreviewFeedback(0.3),
    recovery = thermalPreviewFeedback(4.3),
    clear = thermalPreviewFeedback(9);
  assert.equal(contact.contact, 1);
  assert.equal(contact.contactAge, 0);
  assert.equal(recovery.contact, 0);
  assert.ok(Math.abs(recovery.contactAge - 0.3) < 1e-12);
  assert.ok(recovery.smoke > 0 && recovery.flame > 0);
  assert.equal(clear.smoke, 0);
  assert.equal(clear.flame, 0);
});

test('combined preview uses actual shared heat meshes and fire voice, with world-space plumes and volume/pause/recovery ownership', async () => {
  const f = fixture();
  assert.equal(f.contexts.length, 0);
  assert.equal(
    f.ship.children.length,
    1,
    'other inspector choices allocate no thermal hull shell',
  );
  await f.preview.prepare();
  f.preview.update(0.3);
  let snapshot = f.preview.getSnapshot();
  assert.equal(snapshot.audio.type, 'hazard-contact');
  assert.equal(snapshot.audio.activeVoices, 1);
  assert.equal(snapshot.heatwaveEnabled, true);
  assert.equal(snapshot.heatwaveAmount, 1);
  assert.equal(snapshot.heatwaveDrawSuppressed, false);
  assert.ok(
    snapshot.outlineVisible &&
      snapshot.outlineStrength > 0 &&
      snapshot.smokeVisible &&
      snapshot.flameVisible,
  );
  const outline = f.ship.getObjectByName(
    'Thermal contact / lava-red hull envelope',
  );
  assert.equal(
    outline.children[0].geometry,
    f.geometry,
    'borrow actual selected hull geometry',
  );
  const smoke = f.scene.getObjectByName(
    'Inspector fire / trailing hot hull smoke',
  );
  const heat = f.ship.getObjectByName('Thermal contact / hull heat refraction')
    .userData.exhaustHeat;
  assert.equal(snapshot.heatwaveEnabled, heat.enabled);
  assert.equal(snapshot.heatwaveAmount, heat.strength);
  assert.equal(
    smoke.parent.parent,
    f.scene,
    'world-space billows do not rotate twice with the studio frame',
  );
  const master = f.nodes.find(
    (n) => n.kind === 'gain' && n.destination === f.context.destination,
  );
  assert.equal(
    master.gain.value,
    0.2,
    'Master × Effects is applied once by the real owner',
  );
  const matrices = Array.from(smoke.instanceMatrix.array);
  f.preview.update(0.3, true);
  assert.equal(f.preview.getSnapshot().audio.activeVoices, 0);
  assert.deepEqual(
    Array.from(smoke.instanceMatrix.array),
    matrices,
    'paused visual poses do not advance',
  );
  f.settings.reducedMotion = true;
  f.settings.quality = 'low';
  f.preview.update(0.3);
  const reduced = f.preview.getSnapshot().outlineStrength;
  assert.ok(reduced > 0 && reduced < snapshot.outlineStrength);
  assert.equal(smoke.count, 24);
  assert.equal(f.preview.getSnapshot().heatwaveEnabled, false);
  assert.equal(f.preview.getSnapshot().heatwaveDrawSuppressed, true);
  f.settings.volume = 0;
  f.preview.configure();
  assert.equal(f.preview.getSnapshot().audio.activeVoices, 0);
  assert.equal(
    f.preview.getSnapshot().smokeVisible,
    true,
    'muting sound leaves the visible audition running',
  );
  f.settings.volume = 0.4;
  f.settings.quality = 'high';
  f.settings.reducedMotion = false;
  f.preview.configure();
  assert.equal(f.preview.getSnapshot().audio.activeVoices, 1);
  f.context.currentTime = 4;
  f.preview.update(4);
  snapshot = f.preview.getSnapshot();
  assert.equal(snapshot.contact, 0);
  assert.equal(snapshot.envelope, 1);
  assert.equal(snapshot.heatwaveEnabled, true);
  assert.equal(snapshot.audio.activeVoices, 1);
  assert.equal(snapshot.audio.releasing, false);
  assert.ok(
    snapshot.smokeVisible && snapshot.flameVisible && snapshot.outlineVisible,
  );
  const contactSource = f.nodes.filter((n) => n.kind === 'source').at(-1);
  const fullGain = contactSource.destination.gain.value;
  const starts = snapshot.audio.starts;
  f.context.currentTime = 5;
  f.preview.update(5);
  snapshot = f.preview.getSnapshot();
  assert.equal(snapshot.audio.activeVoices, 1);
  assert.equal(
    snapshot.audio.starts,
    starts,
    'the same loop voice continues into cooling',
  );
  assert.ok(contactSource.destination.gain.value < fullGain);
  assert.ok(
    snapshot.outlineVisible && snapshot.smokeVisible && snapshot.flameVisible,
  );
  f.context.currentTime = 9;
  f.preview.update(9);
  snapshot = f.preview.getSnapshot();
  assert.equal(snapshot.smokeVisible, false);
  assert.equal(snapshot.flameVisible, false);
  assert.equal(snapshot.outlineVisible, false);
  assert.equal(snapshot.heatwaveEnabled, false);
  assert.equal(snapshot.heatwaveAmount, 0);
  assert.equal(snapshot.audio.releasing, true);
  f.context.currentTime = 9.2;
  f.preview.update(9.2);
  assert.equal(f.preview.getSnapshot().audio.activeVoices, 0);
  f.preview.stop();
  assert.equal(f.preview.getSnapshot().active, false);
  assert.equal(f.preview.getSnapshot().heatwaveDrawSuppressed, true);
  assert.equal(
    f.contexts.length,
    1,
    'one audio owner serves retrigger and settings changes',
  );
  await f.dispose();
  assert.equal(f.context.closes, 1);
  assert.ok(f.nodes.every((n) => n.disconnected));
  assert.equal(outline.parent, null);
});

test('inspector Trigger, seek, Stop, change, chassis replacement and automatic end share thermal cleanup', async () => {
  const f = fixture({ main: true });
  assert.equal(await f.preview.trigger('fire-contact'), true);
  f.preview.update(0.3);
  let snapshot = f.preview.getSnapshot();
  assert.equal(snapshot.kind, 'fire-contact');
  assert.equal(snapshot.thermal.audio.activeVoices, 1);
  f.preview.stop();
  snapshot = f.preview.getSnapshot();
  assert.equal(snapshot.kind, null);
  assert.equal(snapshot.thermal.active, false);
  assert.equal(snapshot.thermal.audio.activeVoices, 0);
  await f.preview.trigger('fire-contact', { time: 4.3, paused: true });
  snapshot = f.preview.getSnapshot();
  assert.ok(snapshot.thermal.smokeVisible && snapshot.thermal.outlineVisible);
  assert.equal(snapshot.thermal.audio.activeVoices, 0);
  f.preview.update(1);
  assert.equal(f.preview.getSnapshot().time, 4.3);
  f.preview.select('arc');
  assert.equal(f.preview.getSnapshot().thermal, null);
  await f.preview.trigger('fire-contact');
  f.preview.setShip(null);
  assert.equal(
    f.ship.getObjectByName('Thermal contact / lava-red hull envelope'),
    undefined,
  );
  assert.equal(f.preview.getSnapshot().thermal.audio.activeVoices, 0);
  const replacement = new Group();
  replacement.add(new Mesh(f.geometry, new MeshBasicMaterial()));
  f.frame.add(replacement);
  f.preview.setShip(replacement);
  await f.preview.trigger('fire-contact');
  f.preview.update(9);
  assert.equal(f.preview.getSnapshot().kind, null);
  assert.equal(f.preview.getSnapshot().thermal.smokeVisible, false);
  assert.equal(f.preview.getSnapshot().thermal.audio.activeVoices, 0);
  assert.equal(f.contexts.length, 1);
  await f.dispose();
  assert.equal(f.context.closes, 1);
  assert.equal(
    replacement.getObjectByName('Thermal contact / lava-red hull envelope'),
    undefined,
  );
});

test('Stop cancels a thermal audition whose shared sound is still decoding', async () => {
  const f = fixture({ main: true, defer: true });
  const pending = f.preview.trigger('fire-contact');
  await Promise.resolve();
  await Promise.resolve();
  f.preview.stop();
  f.resolve();
  assert.equal(await pending, false);
  const snapshot = f.preview.getSnapshot();
  assert.equal(snapshot.kind, null);
  assert.equal(snapshot.thermal.active, false);
  assert.equal(snapshot.thermal.audio.activeVoices, 0);
  assert.equal(snapshot.thermal.smokeVisible, false);
  await f.dispose();
});
