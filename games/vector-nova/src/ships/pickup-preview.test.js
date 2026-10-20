import test from 'node:test';
import assert from 'node:assert/strict';
import { Group } from 'three';
import { COMBAT_RULES } from '../pickups/combat.js';
import { AEGIS_DURATION, ARC_TARGET_HALF_LENGTH } from '../pickups/rules.js';
import { createShipFeedbackPresentation } from '../pickups/ship-feedback.js';
import { createPickupPreview } from './pickup-preview.js';
import { createPickupPreviewAudio } from './pickup-preview-audio.js';
import {
  PICKUP_PREVIEWS,
  PREVIEW_TARGET_DISTANCE,
  pickupPreviewFrame,
} from './pickup-preview-sequence.js';

test('each audition emits one acquisition; Arc retains the real three-shot timing and speed', () => {
  for (const { id } of PICKUP_PREVIEWS) {
    assert.deepEqual(pickupPreviewFrame(id, 0).events, [
      { type: 'pickup-activate', payload: { kind: id } },
    ]);
    assert.equal(pickupPreviewFrame(id, 0.01, 0).events.length, 0);
  }
  const events = [];
  for (let index = 1; index <= 100; index++)
    events.push(
      ...pickupPreviewFrame('arc', index / 100, (index - 1) / 100).events,
    );
  assert.equal(
    events.filter((event) => event.type === 'combat-fire').length,
    3,
  );
  assert.equal(
    events.filter((event) => event.type === 'pickup-expire').length,
    1,
  );
  const frame = pickupPreviewFrame('arc', COMBAT_RULES.arcDelay + 0.05, 0);
  assert.ok(
    Math.abs(frame.combat.shots[0].position[2] - COMBAT_RULES.arcSpeed * 0.05) <
      1e-9,
  );
  assert.equal(frame.combat.flashes[0].type, 'muzzle');
});

test('Aegis, Repulsor and Ion follow their authored lifetime and retain visible tails', () => {
  const aegis = pickupPreviewFrame(
    'aegis',
    AEGIS_DURATION,
    AEGIS_DURATION - 0.01,
  );
  assert.equal(aegis.effects.aegisRemaining, 0);
  assert.equal(aegis.events[0].type, 'pickup-expire');
  assert.equal(aegis.end, AEGIS_DURATION + 0.5);
  const pulse = pickupPreviewFrame('repulsor', COMBAT_RULES.pulseDelay, 0);
  assert.equal(pulse.combat.emitters.player, undefined);
  assert.equal(pulse.combat.flashes[0].radius, COMBAT_RULES.pulseRadius);
  const ion = pickupPreviewFrame('ion', COMBAT_RULES.wakeDuration + 0.01, 0);
  assert.equal(ion.beds.ion, false);
  assert.ok(ion.combat.wakes.length > 0);
  assert.ok(ion.combat.wakes.every((wake) => wake.a[2] < wake.b[2]));
  const ended = pickupPreviewFrame('ion', ion.end, ion.end - 0.01);
  assert.equal(ended.combat.wakes.length, 0);
});

test('shared hull effects preserve paused timers, impact clearing and reduced-motion feedback', () => {
  const feedback = createShipFeedbackPresentation();
  const shield = feedback.group.children.find(
    (mesh) => mesh.material?.uniforms.hit,
  );
  const drive = feedback.group.children.find((mesh) =>
    mesh.name.startsWith('Vector'),
  );
  const acquisition = feedback.group.children.find(
    (mesh) => mesh.material?.uniforms.kind,
  );
  feedback.update({
    events: [{ type: 'pickup-activate', payload: { kind: 'arc' } }],
  });
  assert.equal(acquisition.visible, true);
  assert.equal(acquisition.material.uniforms.kind.value, 3);
  feedback.update({ racing: false, driving: true, dt: 5 });
  assert.equal(acquisition.material.uniforms.age.value, 0);
  feedback.update({ dt: 0.31 });
  assert.equal(acquisition.visible, false);
  feedback.update({
    events: [{ type: 'shield-hit', payload: { side: -1 } }],
    settings: { reducedMotion: true },
  });
  assert.equal(feedback.hitActive, true);
  assert.equal(shield.material.uniforms.hit.value, 0.55);
  assert.equal(shield.material.uniforms.hitSide.value, -1);
  feedback.update({
    events: [{ type: 'impact', payload: { shielded: false } }],
  });
  assert.equal(feedback.hitActive, false);
  assert.equal(shield.visible, false);
  feedback.update({
    effects: { vectorActive: true },
    time: 3,
    settings: { reducedMotion: true },
  });
  assert.equal(drive.visible, true);
  assert.equal(drive.material.uniforms.flowTime.value, 0);
  feedback.reset();
  assert.equal(drive.visible, false);
  feedback.dispose();
});

function previewHarness(target) {
  const ship = new Group();
  const settings = { volume: 0.35, muted: false };
  const events = [];
  const statuses = [];
  let prepare = () => Promise.resolve(2.34);
  const audio = {
    prepare: (...args) => prepare(...args),
    updates: [],
    stops: 0,
    disposals: 0,
    update(...args) {
      this.updates.push(args);
    },
    event(event) {
      events.push(event);
    },
    setEffects() {},
    stop() {
      this.stops++;
    },
    dispose() {
      this.disposals++;
    },
  };
  const preview = createPickupPreview({
    ship,
    target,
    getSettings: () => settings,
    onStatus: (value) => statuses.push(value),
    createAudio: () => audio,
  });
  return {
    preview,
    ship,
    settings,
    audio,
    events,
    statuses,
    defer() {
      let resume;
      prepare = () =>
        new Promise((resolve) => {
          resume = resolve;
        });
      return () => resume(2.34);
    },
  };
}

test('the dev target stops Arc pellets at its hull and uses the gameplay hit grace and flash', () => {
  const distance = PREVIEW_TARGET_DISTANCE - ARC_TARGET_HALF_LENGTH;
  const impact = COMBAT_RULES.arcDelay + distance / COMBAT_RULES.arcSpeed;
  const before = pickupPreviewFrame('arc', impact - 0.001, 0, true);
  assert.equal(before.combat.shots.length, 1);
  assert.ok(before.combat.shots[0].position[2] < distance);
  const hit = pickupPreviewFrame('arc', impact + 0.001, impact - 0.001, true);
  assert.equal(hit.combat.shots.length, 0);
  assert.equal(
    hit.events.filter((event) => event.type === 'combat-confirm').length,
    1,
  );
  const flash = hit.combat.flashes.find((flash) => flash.type !== 'muzzle');
  assert.equal(flash.position[2], distance);
  assert.equal(flash.kind, 'arc');
  const all = pickupPreviewFrame('arc', 1, -1, true).events;
  assert.equal(all.filter((event) => event.type === 'combat-fire').length, 3);
  assert.equal(
    all.filter((event) => event.type === 'combat-confirm').length,
    1,
    'later shots land during the same hit grace',
  );
  for (let index = 0; index < 3; index++) {
    const at = impact + index * COMBAT_RULES.arcInterval + 0.001;
    const contact = pickupPreviewFrame('arc', at, at - 0.002, true);
    assert.ok(
      contact.combat.flashes.some(
        (flash) => flash.target === 'rook' && flash.age < 0.002,
      ),
    );
  }
  const repulsor = pickupPreviewFrame(
    'repulsor',
    COMBAT_RULES.pulseDelay,
    0,
    true,
  );
  assert.ok(
    repulsor.combat.flashes.some(
      (flash) => flash.position[2] === PREVIEW_TARGET_DISTANCE,
    ),
  );
  assert.equal(repulsor.events.at(-1).type, 'combat-confirm');
});

test('the target stays visible between auditions, follows ship changes and detaches on teardown', async () => {
  const target = new Group();
  const h = previewHarness(target);
  assert.equal(target.parent, h.ship);
  assert.equal(target.position.z, PREVIEW_TARGET_DISTANCE);
  await h.preview.trigger('arc');
  h.preview.update(0.2);
  const flashes = h.ship.children[0].children[1].children.filter(
    (object) => object.visible && object.children.length === 4,
  );
  assert.ok(
    flashes.some(
      (object) =>
        object.position.z === PREVIEW_TARGET_DISTANCE - ARC_TARGET_HALF_LENGTH,
    ),
  );
  h.preview.stop();
  assert.equal(target.visible, true);
  assert.equal(target.parent, h.ship);
  h.preview.setShip(null);
  assert.equal(target.parent, null);
  assert.equal(h.ship.children.length, 0);
  const replacement = new Group();
  h.preview.setShip(replacement);
  assert.equal(target.parent, replacement);
  h.preview.dispose();
  assert.equal(replacement.children.length, 0);
});

test('audio preparation gates both sound and VFX; Stop and changing ship cancel late starts', async () => {
  const h = previewHarness();
  const finish = h.defer();
  const pending = h.preview.trigger('arc');
  assert.equal(h.ship.children[0].visible, false);
  assert.equal(h.events.length, 0);
  h.preview.stop();
  finish();
  assert.equal(await pending, false);
  assert.equal(h.events.length, 0);
  const finishAgain = h.defer();
  const next = h.preview.trigger('arc');
  const replacement = new Group();
  h.preview.setShip(replacement);
  finishAgain();
  assert.equal(await next, false);
  assert.equal(h.ship.children.length, 0);
  assert.equal(replacement.children[0].visible, false);
  h.preview.dispose();
  assert.equal(replacement.children.length, 0);
  assert.equal(h.audio.disposals, 1);
});

test('Arc candidate plays beyond the shorter burst; retrigger, mute and disposal have one owner', async () => {
  const h = previewHarness();
  assert.equal(await h.preview.trigger('arc'), true);
  h.preview.update(1.6);
  assert.equal(h.ship.children[0].visible, true);
  assert.equal(
    h.events.filter((event) => event.type === 'combat-fire').length,
    3,
  );
  h.preview.update(0.75);
  assert.equal(h.ship.children[0].visible, false);
  assert.equal(h.statuses.at(-1), 'Ready');
  await h.preview.trigger('ion');
  await h.preview.trigger('aegis');
  assert.equal(h.ship.children.length, 1);
  h.settings.muted = true;
  h.preview.configure();
  assert.equal(h.audio.updates.at(-1)[0].muted, true);
  h.preview.dispose();
  h.preview.dispose();
  assert.equal(h.audio.disposals, 1);
  assert.equal(await h.preview.trigger('arc'), false);
});

test('candidate audio replaces only Arc activation, caches decoding, and follows effects volume', async () => {
  const cues = [];
  const sources = [];
  const gains = [];
  let fetches = 0,
    decodes = 0,
    disposals = 0;
  const context = {
    currentTime: 0,
    destination: {},
    createGain() {
      const node = {
        gain: {
          value: 1,
          setTargetAtTime(value) {
            this.value = value;
          },
        },
        connect() {},
        disconnect() {},
      };
      gains.push(node);
      return node;
    },
    createBufferSource() {
      const source = {
        starts: 0,
        stops: 0,
        connect() {},
        disconnect() {},
        start() {
          this.starts++;
        },
        stop() {
          this.stops++;
        },
      };
      sources.push(source);
      return source;
    },
    async decodeAudioData() {
      decodes++;
      return { duration: 2.34 };
    },
  };
  const audio = createPickupPreviewAudio({
    candidateURL: '/candidate.wav',
    createContext: () => context,
    createAudio: ({ createContext }) => ({
      async unlock() {
        createContext();
        return true;
      },
      update() {},
      setEffects() {},
      silence() {},
      event: (cue) => cues.push(cue),
      dispose() {
        disposals++;
      },
    }),
    async fetchAudio() {
      fetches++;
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
    },
  });
  assert.equal(await audio.prepare('arc'), 2.34);
  assert.equal(gains[0].gain.value, 0);
  audio.update({ volume: 0.2 }, true);
  audio.event({ type: 'pickup-activate', payload: { kind: 'arc' } });
  audio.event({ type: 'combat-fire', payload: { kind: 'arc' } });
  assert.equal(sources[0].starts, 1);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].type, 'combat-fire');
  assert.equal(gains[0].gain.value, 0.2);
  audio.update({ volume: 0.2, muted: true }, true);
  assert.equal(gains[0].gain.value, 0);
  audio.stop();
  assert.equal(sources[0].stops, 1);
  await audio.prepare('arc');
  assert.equal(fetches, 1);
  assert.equal(decodes, 1);
  audio.dispose();
  audio.dispose();
  assert.equal(disposals, 1);
});
