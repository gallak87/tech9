import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createHelionTrack } from '../track/model.js';
import { createHelionEnvironment } from './index.js';
import { createHelionBackdrop } from '../backdrop/index.js';

async function asset() {
  const bytes = await readFile(
    new URL(
      '../../../../public/assets/levels/helion/thermal-observatory.glb',
      import.meta.url,
    ),
  );
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
}

test('Helion modeled world stays bounded, deterministic across presets, and releases resources once', async () => {
  const track = createHelionTrack();
  const loaded = await asset();
  assert.deepEqual(
    loaded.scene.children.map((part) => part.name),
    [
      'Sunshield',
      'RadiatorFan',
      'JumpCanopy',
      'InstrumentTower',
      'ServiceGantry',
      'ProminenceCrown',
      'ProminenceRibbon',
    ],
  );
  const view = { sun: new T.DirectionalLight('#ffffff', 3) };
  const world = await createHelionEnvironment(
    { track, view },
    { loadAsset: async () => loaded },
  );
  assert.ok(world.metrics.meshCount < 130, JSON.stringify(world.metrics));
  assert.ok(world.metrics.triangles < 900000);
  assert.equal(world.metrics.modelPlacements, 24);
  world.group.updateMatrixWorld(true);
  const ray = new T.Raycaster();
  ray.near = 0;
  ray.far = 22;
  for (const jump of track.jumps) {
    const cover = world.metrics.airborneCover.find(
      (entry) => entry.id === jump.id,
    );
    assert.ok(cover.start <= jump.takeoff - 50);
    assert.ok(cover.end >= jump.landingEnd + 30);
    assert.ok(cover.minimumUndersideUp > 24 + 8);
    for (let i = 1; i < cover.intervals.length; i++)
      assert.ok(cover.intervals[i].start < cover.intervals[i - 1].end);
    // Check real exported roof geometry from above the maximum tested flight
    // apex, across the entire supported landing envelope and jump branch.
    for (let s = jump.takeoff - 45; s <= jump.landingEnd + 25; s += 8) {
      const frame = track.sample(s);
      for (const lateral of [3.5, 8, 14]) {
        ray.set(
          frame.position
            .clone()
            .addScaledVector(frame.right, lateral)
            .addScaledVector(frame.up, 24),
          frame.up,
        );
        const hits = ray.intersectObject(world.group, true);
        assert.ok(
          hits.length > 0,
          `Missing physical jump cover: ${jump.id} at ${s}, ${lateral}`,
        );
        assert.ok(
          hits[0].distance + 24 >= 32.65,
          `Low jump roof: ${jump.id} at ${s}, ${lateral}`,
        );
      }
    }
  }
  const disposal = new Map();
  for (const root of [loaded.scene, world.group])
    root.traverse((object) => {
      for (const resource of [
        object.geometry,
        object.material,
        object.material?.uniforms?.density?.value,
      ]
        .flat()
        .filter(Boolean)) {
        if (disposal.has(resource)) continue;
        disposal.set(resource, 0);
        resource.addEventListener('dispose', () =>
          disposal.set(resource, disposal.get(resource) + 1),
        );
      }
    });
  const zone = track.thermalZones.find((part) => part.kind === 'flare');
  const frame = {
    time: 5,
    dt: 1 / 60,
    reset: true,
    state: { distance: zone.start + 5, lateral: 0 },
    settings: { quality: 'high', reducedMotion: false },
  };
  world.update(frame);
  const surface = world.group.getObjectByName(
    `${zone.label} / physical heat boundary`,
  );
  const positions = Array.from(surface.geometry.attributes.position.array);
  world.update({ ...frame, settings: { quality: 'low', reducedMotion: true } });
  assert.deepEqual(
    Array.from(surface.geometry.attributes.position.array),
    positions,
  );
  assert.ok(positions.every(Number.isFinite));
  world.update({ ...frame, time: 8 });
  assert.notDeepEqual(
    Array.from(surface.geometry.attributes.position.array),
    positions,
  );
  world.reset();
  world.dispose();
  world.dispose();
  assert.equal(view.sun.intensity, 3);
  for (const [resource, count] of disposal)
    assert.equal(
      count,
      1,
      `resource ${resource.name || resource.type} release count`,
    );
});

test('Helion stellar backdrop accepts stationary reflection calls and reset lifecycle', async () => {
  const texture = new T.DataTexture(new Uint8Array([20, 8, 14, 255]), 1, 1);
  let releases = 0;
  texture.addEventListener('dispose', () => releases++);
  const backdrop = await createHelionBackdrop({
    settings: { reducedMotion: true },
    loadTexture: async () => texture,
  });
  backdrop.update({ camera: new T.PerspectiveCamera(), time: 0, reset: true });
  backdrop.update({
    time: 15,
    settings: { quality: 'low', reducedMotion: true },
  });
  assert.equal(backdrop.ownedTextures[0], texture);
  assert.ok(backdrop.group.children.length >= 3);
  assert.ok(backdrop.sunDirection.length() > 0.999);
  backdrop.dispose();
  backdrop.dispose();
  assert.equal(backdrop.group.children.length, 0);
  assert.equal(releases, 1);
});
