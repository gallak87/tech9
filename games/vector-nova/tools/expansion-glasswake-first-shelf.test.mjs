import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createGlasswakeTrack } from '../src/levels/glasswake/track/model.js';
import { createGlasswakeRuntime } from '../src/levels/glasswake/runtime.js';
import { createVehicleState } from '../src/physics/index.js';
import { createGlasswakeEnvironment } from '../src/levels/glasswake/environment/index.js';
import {
  FIRST_SHELF_RULES,
  sampleFirstShelf,
} from '../src/levels/glasswake/environment/first-shelf.js';
import {
  createGlasswakeShelfBuffer,
  SHELF_AUDIO_RULES,
} from '../src/levels/glasswake/audio.js';
const controls = {
  throttle: 0,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};
const fresh = (fields) => Object.assign(createVehicleState(), fields);
const shelfEvents = (events) =>
  events.filter((e) => e.type === 'glasswake-shelf');

test('opening sheet cracks first, falls once, remains gone on subsequent laps/recovery, and rearms on fresh session', () => {
  const track = createGlasswakeTrack(),
    runtime = createGlasswakeRuntime({ track });
  const state = fresh({ distance: 324.99, speed: 30 });
  runtime.reset({ reason: 'fresh-lap', state });
  assert.equal(runtime.snapshot().openingShelf, null);
  assert.equal(
    shelfEvents(runtime.advance(state, controls, 1 / 120)).length,
    1,
  );
  assert.equal(
    sampleFirstShelf(runtime.snapshot().openingShelf).phase,
    'cracking',
  );
  const events = [];
  for (let i = 0; i < 450; i++)
    events.push(...runtime.advance(state, controls, 1 / 120));
  assert.equal(
    sampleFirstShelf(runtime.snapshot().openingShelf).phase,
    'fallen',
  );
  assert.equal(shelfEvents(events).length, 0);
  // The vehicle's route distance is unwrapped, just as it is in live racing.
  for (let lap = 1; lap <= 3; lap++) {
    state.distance = track.length * lap - 0.01;
    state.speed = 30;
    assert.equal(
      shelfEvents(runtime.advance(state, controls, 1 / 120)).length,
      0,
    );
    assert.ok(state.distance > track.length * lap);
    assert.equal(runtime.snapshot().openingShelf, FIRST_SHELF_RULES.duration);
    state.distance = track.length * lap + 324.99;
    assert.equal(
      shelfEvents(runtime.advance(state, controls, 1 / 120)).length,
      0,
    );
  }
  runtime.reset({ reason: 'manual-recover', state });
  state.distance = 324.99;
  state.speed = 30;
  assert.equal(
    shelfEvents(runtime.advance(state, controls, 1 / 120)).length,
    0,
  );
  runtime.reset({ reason: 'fresh-lap', state });
  state.distance = 324.99;
  assert.equal(
    shelfEvents(runtime.advance(state, controls, 1 / 120)).length,
    1,
  );
  runtime.dispose();
});

test('opening collapse snapshots resume exactly; scenario seeks and pause never manufacture audio events', () => {
  const track = createGlasswakeTrack(),
    first = createGlasswakeRuntime({ track });
  const state = fresh({ distance: 324.99, speed: 30 });
  first.advance(state, controls, 1 / 120);
  for (let i = 0; i < 110; i++) first.advance(state, controls, 1 / 120);
  const saved = structuredClone(first.snapshot()),
    copy = { ...state };
  const second = createGlasswakeRuntime({ track });
  second.restore(saved);
  assert.deepEqual(second.advance(copy, controls, 0), []);
  assert.deepEqual(second.snapshot(), saved);
  for (let i = 0; i < 500; i++)
    assert.deepEqual(
      first.advance(state, controls, 1 / 120),
      second.advance(copy, controls, 1 / 120),
    );
  assert.deepEqual(state, copy);
  assert.deepEqual(first.snapshot(), second.snapshot());
  assert.throws(() => second.restore({ ...saved, openingShelf: NaN }));
  assert.throws(() => second.restore({ ...saved, openingShelf: -1 }));
  for (const [scenario, phase] of [
    ['first-shelf-approach', 'intact'],
    ['first-shelf-crack', 'cracking'],
    ['first-shelf-fall', 'falling'],
    ['first-shelf-gone', 'fallen'],
  ]) {
    const fixture = fresh(track.scenarios[scenario]);
    second.reset({ reason: 'scenario', scenario, state: fixture });
    assert.equal(sampleFirstShelf(second.snapshot().openingShelf).phase, phase);
    assert.equal(
      shelfEvents(second.advance(fixture, controls, 1 / 120)).length,
      0,
    );
  }
  first.dispose();
  second.dispose();
});

test('the actual opening vault falls clear of the entire rolled route/camera corridor, with bounded powder and identical preset poses', async (context) => {
  const track = createGlasswakeTrack(),
    runtime = createGlasswakeRuntime({ track });
  const bytes = await readFile(
    new URL(
      '../public/assets/levels/glasswake/glasswake-environment-v5.glb',
      import.meta.url,
    ),
  );
  const env = createGlasswakeEnvironment({
    track,
    loadAsset: () =>
      new GLTFLoader().parseAsync(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
        '',
      ),
  });
  try {
    await env.ready;
    const root = env.group.getObjectByName('Glasswake / opening ice sheet');
    assert.ok(root);
    const pivot = root.children[0],
      sheet = pivot.children[0];
    env.update();
    env.group.updateMatrixWorld(true);
    const original = new T.Box3().setFromObject(sheet);
    assert.ok(
      original
        .getCenter(new T.Vector3())
        .distanceTo(new T.Vector3(-310.334, 177.59, 367.628)) < 0.01,
      'detach the existing visible vault without replacing/repositioning it',
    );
    const corridors = [];
    for (let s = 0; s < track.length; s += 4) {
      const frame = track.sample(s),
        box = new T.Box3();
      for (const lateral of [-27, 27])
        for (const height of [-13, 45])
          for (const along of [-2.5, 2.5])
            box.expandByPoint(
              frame.position
                .clone()
                .addScaledVector(frame.right, lateral)
                .addScaledVector(frame.up, height)
                .addScaledVector(frame.tangent, along),
            );
      corridors.push({ s, box });
    }
    const saved = runtime.snapshot();
    let comparisons = 0;
    for (let index = 0; index <= 120; index++) {
      runtime.restore({
        ...saved,
        openingShelf: (FIRST_SHELF_RULES.duration * index) / 120,
      });
      env.update({ settings: { quality: 'high' } });
      env.group.updateMatrixWorld(true);
      const bounds = new T.Box3().setFromObject(sheet);
      for (const corridor of corridors) {
        comparisons++;
        if (!bounds.intersectsBox(corridor.box)) continue;
        // The authored vault has a real aperture: its enclosing box can span
        // empty air. Refine candidates against the actual transformed triangles.
        sheet.traverse((mesh) => {
          if (!mesh.isMesh) return;
          const position = mesh.geometry.attributes.position,
            indices = mesh.geometry.index;
          const triangle = new T.Triangle();
          for (let i = 0; i < (indices?.count ?? position.count); i += 3) {
            triangle.a
              .fromBufferAttribute(position, indices?.getX(i) ?? i)
              .applyMatrix4(mesh.matrixWorld);
            triangle.b
              .fromBufferAttribute(position, indices?.getX(i + 1) ?? i + 1)
              .applyMatrix4(mesh.matrixWorld);
            triangle.c
              .fromBufferAttribute(position, indices?.getX(i + 2) ?? i + 2)
              .applyMatrix4(mesh.matrixWorld);
            assert.equal(
              corridor.box.intersectsTriangle(triangle),
              false,
              `opening sheet triangle ${i / 3} at phase ${index}/120 intersects route/camera near ${corridor.s}m`,
            );
          }
        });
      }
      const pose = [...pivot.position.toArray(), ...pivot.quaternion.toArray()];
      env.update({
        settings: { quality: 'low', reducedMotion: true },
        state: { time: 1000 },
      });
      assert.deepEqual(
        [...pivot.position.toArray(), ...pivot.quaternion.toArray()],
        pose,
      );
    }
    assert.equal(pivot.visible, false);
    assert.ok(
      root.children.find((n) => n.name.includes('powder')).geometry
        .instanceCount <= 80,
    );
    runtime.reset({ reason: 'manual-recover' });
    env.reset();
    assert.equal(pivot.visible, false);
    runtime.reset({ reason: 'fresh-lap' });
    env.reset();
    env.group.updateMatrixWorld(true);
    assert.equal(pivot.visible, true);
    assert.ok(new T.Box3().setFromObject(sheet).equals(original));
    context.diagnostic(
      JSON.stringify({
        poses: 121,
        routeSamples: corridors.length,
        comparisons,
        powderHigh: 80,
        powderLow: 36,
      }),
    );
  } finally {
    runtime.dispose();
    env.dispose();
  }
});

test('original cached shelf synthesis contains a sharp initial crack and delayed snow rush, with finite bounded samples', () => {
  const context = {
    sampleRate: 22050,
    createBuffer(channels, length, rate) {
      const data = Array.from(
        { length: channels },
        () => new Float32Array(length),
      );
      return { duration: length / rate, getChannelData: (i) => data[i] };
    },
  };
  const a = createGlasswakeShelfBuffer(context),
    b = createGlasswakeShelfBuffer(context);
  assert.equal(a.duration, SHELF_AUDIO_RULES.duration);
  const left = a.getChannelData(0),
    right = a.getChannelData(1);
  assert.deepEqual(left, b.getChannelData(0));
  let peak = 0;
  for (const channel of [left, right])
    for (const sample of channel) {
      assert.ok(Number.isFinite(sample));
      peak = Math.max(peak, Math.abs(sample));
    }
  assert.ok(Math.abs(peak - SHELF_AUDIO_RULES.peak) < 1e-6);
  const rms = (start, end) => {
    const slice = left.subarray(
      Math.floor(start * context.sampleRate),
      Math.floor(end * context.sampleRate),
    );
    return Math.sqrt(
      slice.reduce((sum, value) => sum + value * value, 0) / slice.length,
    );
  };
  assert.ok(rms(0.005, 0.035) > rms(0.31, 0.38) * 3, 'prominent brittle crack');
  assert.ok(
    rms(0.6, 1.5) > rms(0.31, 0.38) * 2,
    'snow rush builds after fracture',
  );
  assert.ok(rms(3.35, 3.4) < rms(0.6, 1.5) * 0.15, 'clean tail');
});
