import test from 'node:test';
import * as T from 'three';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createUmbraTrack } from '../track/model.js';
import { createUmbraSceneryLayout } from './index.js';
import { collectUmbraAssets } from './assets.js';
import { sampleUmbraAccretion, createUmbraAccretion } from './accretion.js';
import { createUmbraBackdrop } from '../backdrop/index.js';

test('Umbra scenery retains hero structures and reserves road/camera clearance', () => {
  const layout = createUmbraSceneryLayout(createUmbraTrack());
  assert.ok(layout.length >= 45);
  for (const entry of layout)
    assert.ok(entry.routeMargin >= 38, `${entry.role} clearance`);
  for (const role of [
    'tilted-lens',
    'inversion-vault',
    'lensward-leap-flight-fragment',
    'knot-leap-flight-fragment',
  ])
    assert.ok(
      layout.some((entry) => entry.role === role),
      role,
    );
});

test('Umbra giant event has coherent intact/stretch/fracture/infall/reset phases', () => {
  assert.equal(sampleUmbraAccretion(0).phase, 'intact');
  assert.equal(sampleUmbraAccretion(24).phase, 'stretching');
  assert.equal(sampleUmbraAccretion(32).phase, 'fragmenting');
  assert.equal(sampleUmbraAccretion(44).phase, 'spiralling');
  assert.equal(sampleUmbraAccretion(55).phase, 'consumed');
  assert.equal(sampleUmbraAccretion(-40).elapsed, 0);
  let previous = -1;
  for (let time = 0; time <= 60; time += 0.25) {
    const event = sampleUmbraAccretion(time);
    assert.ok(event.progress >= previous);
    previous = event.progress;
  }
});

test('Blender export has all authored stages and absolute-time replayable deformation', async () => {
  const file = await readFile(
    new URL(
      '../../../../public/assets/levels/umbra/umbra-observatory.glb',
      import.meta.url,
    ),
  );
  const gltf = await new Promise((resolve, reject) =>
    new GLTFLoader().parse(
      file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
      '',
      resolve,
      reject,
    ),
  );
  const assets = collectUmbraAssets(gltf.scene);
  for (const name of [
    'terrace',
    'gallery',
    'wall',
    'wall_solid',
    'wall_breach',
    'lens',
    'vault',
    'instrument',
    'rib',
    'event_stretched',
    'event_fragmented',
  ])
    assert.ok(assets.templates[name].length > 0, name);
  const bounds = new T.Box3(
    new T.Vector3(-80, -70, -27),
    new T.Vector3(80, 80, 27),
  );
  for (const { geometry } of ['wall', 'wall_solid', 'wall_breach'].flatMap(
    (name) => assets.templates[name],
  )) {
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      assert.ok(
        bounds.containsPoint(
          new T.Vector3().fromBufferAttribute(geometry.attributes.position, i),
        ),
        'gallery clearance bounds contain actual masonry',
      );
    }
  }
  // Runtime batching retains the authored member-local cavity shading.
  for (const { geometry, material } of [
    'wall',
    'wall_solid',
    'wall_breach',
  ].flatMap((name) => assets.templates[name])) {
    const color = geometry.attributes.color;
    assert.ok(
      color && material.vertexColors,
      'baked cavities survive flattening',
    );
    let min = 1,
      max = 0;
    for (let i = 0; i < color.count; i++) {
      min = Math.min(min, color.getX(i));
      max = Math.max(max, color.getX(i));
    }
    assert.ok(min < max && min > 0, 'contact shading is varied and bounded');
  }
  assert.equal(assets.eventPieces.length, 12);
  const event = createUmbraAccretion(assets);
  event.update(32);
  const live = event.getPresentation();
  event.update(0);
  event.update(32);
  assert.deepEqual(event.getPresentation(), live);
  event.update(32, { reducedMotion: true, quality: 'low' });
  assert.equal(event.getPresentation().decorativeTime, 0);
  assert.equal(event.getPresentation().eventPhase, live.eventPhase);
  event.update(0);
  assert.equal(event.getPresentation().eventPhase, 'intact');
  event.dispose();
  assets.dispose();
});

test('Accretion backdrop pauses and replay restores absolute disk time', async () => {
  const backdrop = await createUmbraBackdrop({
    loadTexture: async () => new T.Texture(),
  });
  const disk = backdrop.group.getObjectByName(
    'Layered incandescent orbital accretion',
  );
  backdrop.update({ time: 20, dt: 1 / 60, reset: false });
  backdrop.update({ time: 25, dt: 0 });
  assert.equal(disk.material.uniforms.time.value, 20);
  backdrop.update({ time: 20, dt: 0, reset: true });
  assert.equal(disk.material.uniforms.time.value, 20);
  backdrop.update({ time: 20, dt: 0, settings: { reducedMotion: true } });
  assert.equal(disk.material.uniforms.time.value, 0);
  backdrop.dispose();
});

test('Rejected observatory kit releases loaded geometry and materials', () => {
  const scene = new T.Group();
  const geometry = new T.BoxGeometry();
  const material = new T.MeshStandardMaterial();
  scene.add(new T.Mesh(geometry, material));
  const surfaceTexture = new T.Texture();
  let textureReleased = 0;
  surfaceTexture.addEventListener('dispose', () => textureReleased++);
  let geometryReleased = 0,
    materialReleased = 0;
  geometry.addEventListener('dispose', () => geometryReleased++);
  material.addEventListener('dispose', () => materialReleased++);
  assert.throws(
    () => collectUmbraAssets(scene, surfaceTexture),
    /missing required terrace/,
  );
  assert.equal(geometryReleased, 1);
  assert.equal(materialReleased, 1);
  assert.equal(textureReleased, 1);
});
