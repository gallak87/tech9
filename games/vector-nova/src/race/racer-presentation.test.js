import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import { createRacerPresentation } from './racer-presentation.js';
import { createDeviceRuntime } from '../pickups/runtime.js';
import { createVehicleState } from '../physics/index.js';
import { createTrack } from '../levels/halcyon/track/model.js';
import { createHalcyonDevices } from '../levels/halcyon/devices.js';

test('rivals follow their own speed, boost/Vector, simulation clock and live graphics tier', async () => {
  const frames = [];
  let vectorActive = false;
  const state = { steer: 0, speed: 120, time: 8, boosting: true, energy: 50 };
  const racer = {
    specification: { id: 'rook', name: 'Rook' },
    state,
    prev: { speed: 100 },
    runtime: {
      snapshot: () => ({ vectorActive }),
      pose: () => ({ position: new Vector3(), quaternion: new Quaternion() }),
    },
  };
  const presentation = await createRacerPresentation({
    racers: { enabled: true, opponents: [racer] },
    scene: new Scene(),
    settings: { quality: 'low' },
    loadRival: async (_id, { settings }) => {
      assert.equal(settings.quality, 'low');
      return {
        group: new Group(),
        update: (frame) => frames.push(frame),
        dispose() {},
      };
    },
  });
  try {
    presentation.update({
      alpha: 0.5,
      mode: 'racing',
      settings: { quality: 'low' },
    });
    assert.equal(frames.at(-1).speed, 110);
    assert.equal(frames.at(-1).boost, true);
    assert.equal(frames.at(-1).catapulting, false);
    assert.equal(frames.at(-1).energy, 0.5);
    state.boosting = false;
    vectorActive = true;
    presentation.update({
      mode: 'paused',
      settings: { quality: 'high', reducedMotion: true },
    });
    assert.equal(frames.at(-1).boost, false);
    assert.equal(frames.at(-1).catapulting, true);
    assert.equal(frames.at(-1).time, 8);
    assert.equal(frames.at(-1).quality, 'high');
    assert.equal(frames.at(-1).reducedMotion, true);
    presentation.update({ mode: 'title', settings: { quality: 'low' } });
    assert.equal(frames.at(-1).visible, false);
  } finally {
    presentation.dispose();
  }
});

test('racing applies the shared Arc glow to the struck rival, preserves pause, and clears it on exit', async () => {
  const scene = new Scene();
  const groups = [];
  const state = { flashes: [], time: 1 };
  let exposure = 0;
  const racers = {
    enabled: true,
    opponents: ['rook', 'latch'].map((id) => ({
      specification: { id, name: id },
      state: { steer: 0 },
      runtime: {
        pose: () => ({ position: new Vector3(), quaternion: new Quaternion() }),
      },
    })),
  };
  const presentation = await createRacerPresentation({
    racers,
    scene,
    combat: {
      view: () => state,
      ionContact: (id) => (id === 'rook' ? exposure : 0),
    },
    loadRival: async () => {
      const group = new Group();
      const geometry = new BoxGeometry();
      const material = new MeshBasicMaterial();
      group.add(new Mesh(geometry, material));
      groups.push(group);
      return {
        group,
        dispose() {
          group.removeFromParent();
          geometry.dispose();
          material.dispose();
        },
      };
    },
  });
  const effects = groups.map((group) =>
    group.getObjectByName('Combat / hull hit outline'),
  );
  state.flashes = [{ target: 'latch', kind: 'arc', age: 0.08 }];
  presentation.update({ mode: 'racing' });
  assert.equal(effects[0].visible, false);
  assert.equal(effects[1].visible, true);
  const strength = effects[1].children[0].material.uniforms.strength;
  assert.equal(strength.value, 1);
  presentation.update({ mode: 'paused' });
  assert.equal(strength.value, 1);
  presentation.update({ mode: 'racing', settings: { reducedMotion: true } });
  assert.equal(strength.value, 0.45);
  state.flashes.push({ target: 'latch', kind: 'arc', age: 0 });
  presentation.update({ mode: 'racing' });
  assert.equal(
    strength.value,
    0,
    'a new pellet contact starts a fresh soft pulse',
  );
  state.flashes = [{ target: 'rook', kind: 'aegis', age: 0.08 }];
  presentation.update({ mode: 'racing' });
  assert.ok(
    effects.every((effect) => !effect.visible),
    'shield blocks do not pretend to hit bare hull',
  );
  state.flashes = [{ target: 'rook', kind: 'repulsor', age: 0.08 }];
  presentation.update({ mode: 'racing' });
  assert.equal(effects[0].visible, true);
  assert.equal(effects[1].visible, false);
  const response = effects[0].children[0].material.uniforms;
  assert.ok(
    response.color.value.r > response.color.value.b,
    'Repulsor hits tint the whole target rose',
  );
  assert.equal(response.strength.value, 1);
  state.flashes = [];
  exposure = 1;
  presentation.update({ mode: 'racing' });
  assert.equal(response.interference.value, 1);
  assert.equal(response.strength.value, 0.38);
  assert.equal(effects[1].visible, false, 'only the exposed rival glows');
  presentation.update({ mode: 'paused' });
  assert.equal(response.time.value, 1);
  assert.equal(response.strength.value, 0.38);
  state.flashes = [{ target: 'rook', kind: 'aegis', age: 0.1 }];
  presentation.update({ mode: 'racing' });
  assert.equal(effects[0].visible, false, 'shield fracture takes priority');
  exposure = 0;
  state.flashes = [{ target: 'rook', kind: 'arc', age: 0.08 }];
  presentation.update({ mode: 'title' });
  assert.ok(effects.every((effect) => !effect.visible));
  presentation.dispose();
  presentation.dispose();
  assert.equal(scene.children.length, 0);
  assert.ok(effects.every((effect) => effect.parent === null));
});

test('rival shield consumes real combat hits, cracks once, freezes on pause and releases its observer', async () => {
  const track = createTrack();
  const actors = new Map();
  const combat = {
    bind: (id, actor) => actors.set(id, actor),
    resetActor: (id) => actors.delete(id),
    view: () => ({ flashes: [] }),
    disruption: () => null,
  };
  const state = {
    ...createVehicleState(),
    distance: 359.7,
    lateral: 3,
    speed: 80,
  };
  const runtime = createDeviceRuntime({
    track,
    devices: createHalcyonDevices(track),
    combat,
    combatId: 'rook',
  });
  runtime.reset({ state });
  const group = new Group();
  const presentation = await createRacerPresentation({
    racers: {
      enabled: true,
      opponents: [
        {
          specification: { id: 'rook', name: 'Rook' },
          state,
          prev: { ...state },
          runtime,
        },
      ],
    },
    scene: new Scene(),
    track,
    combat,
    loadRival: async () => ({ group, dispose: () => group.removeFromParent() }),
  });
  try {
    runtime.advance(state, { throttle: 1 }, 1 / 120);
    runtime.update({});
    presentation.update({ mode: 'racing' });
    const shield = group.getObjectByName(
      'Aegis / hull field and outward pulses',
    );
    const field = shield.material.uniforms;
    assert.equal(shield.visible, true);
    const reserve = state.energy;
    assert.equal(
      actors.get('rook').hit({
        source: 'player',
        kind: 'arc',
        impulse: new Vector3(),
        cost: 6,
      }),
      true,
    );
    assert.equal(
      state.energy,
      reserve,
      'shield protection still comes from the runtime',
    );
    runtime.update({});
    presentation.update({ mode: 'racing' });
    assert.equal(runtime.snapshot().aegisRemaining, 0);
    assert.equal(field.hit.value, 1);
    assert.equal(
      group.getObjectByName('Aegis / dim driving trail').visible,
      false,
    );
    runtime.update({});
    for (let i = 0; i < 2; i++) {
      runtime.advance(state, { throttle: 1 }, 0.1);
      runtime.update({});
      presentation.update({ mode: 'racing' });
    }
    const age = field.breakAge.value;
    assert.ok(
      age > 0.19 && age < 0.21,
      'drained hit events never restart the fracture',
    );
    presentation.update({ mode: 'paused' });
    assert.equal(field.breakAge.value, age);
    for (let i = 0; i < 10; i++) {
      runtime.advance(state, { throttle: 1 }, 0.1);
      runtime.update({});
      presentation.update({ mode: 'racing' });
    }
    assert.equal(shield.visible, false);
    presentation.dispose();
    assert.equal(group.getObjectByName('Rival / pickups'), undefined);
    assert.doesNotThrow(() => {
      runtime.reset({ state });
      runtime.advance(state, { throttle: 1 }, 0.1);
      runtime.update({});
    }, 'disposed race presentation leaves no active observer');
  } finally {
    presentation.dispose();
    runtime.dispose();
  }
});
