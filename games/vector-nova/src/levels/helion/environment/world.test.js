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
  assert.equal(world.metrics.modelPlacements, 23);
  const disposal = new Map();
  for (const root of [loaded.scene, world.group])
    root.traverse((object) => {
      for (const resource of [object.geometry, object.material]
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

test('Helion stellar backdrop accepts stationary reflection calls and reset lifecycle', () => {
  const backdrop = createHelionBackdrop({ settings: { reducedMotion: true } });
  backdrop.update({ camera: new T.PerspectiveCamera(), time: 0, reset: true });
  backdrop.update({
    time: 15,
    settings: { quality: 'low', reducedMotion: true },
  });
  assert.equal(backdrop.ownedTextures.length, 0);
  assert.ok(backdrop.group.children.length >= 3);
  assert.ok(backdrop.sunDirection.length() > 0.999);
  backdrop.dispose();
  backdrop.dispose();
  assert.equal(backdrop.group.children.length, 0);
});
