import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSaffronTrack } from '../track/model.js';
import { createSaffronEnvironment } from './index.js';
import { skullPlacement } from './fossils.js';
import { sampleBurrower } from './effects.js';

// Tests live under src/levels/saffron/environment, four levels below app root.
const assetPath = new URL(
  '../../../../public/assets/levels/saffron/leviathan-kit.glb',
  import.meta.url,
);
async function loadKit() {
  const bytes = await fs.readFile(assetPath);
  return new Promise((resolve, reject) =>
    new GLTFLoader().parse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
      resolve,
      reject,
    ),
  );
}

function disposeFixture(scene) {
  const geometries = new Set(),
    materials = new Set();
  scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of [object.material].flat().filter(Boolean))
      materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

test('actual Blender skull clears the descending banked road and camera envelope', async () => {
  const track = createSaffronTrack();
  const gltf = await loadKit();
  const placement = skullPlacement(track).matrix;
  const triangles = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.getObjectByName('skull').traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry,
      positions = geometry.attributes.position,
      indices = geometry.index;
    for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
      const vertices = [0, 1, 2].map((offset) =>
        new T.Vector3()
          .fromBufferAttribute(
            positions,
            indices ? indices.getX(i + offset) : i + offset,
          )
          .applyMatrix4(object.matrixWorld)
          .applyMatrix4(placement),
      );
      triangles.push({
        name: object.name,
        vertices,
        box: new T.Box3().setFromPoints(vertices),
      });
    }
  });
  assert.ok(
    triangles.length > 17000,
    'The production authored model must actually be checked',
  );
  const envelope = new T.Box3(
    new T.Vector3(-22, -10, -6),
    new T.Vector3(22, 26, 6),
  );
  const triangle = new T.Triangle();
  const collisions = [];
  for (
    let s = track.landmarks.skullStart - 20;
    s <= track.landmarks.skullEnd + 20;
    s += 8
  ) {
    const frame = track.sample(s);
    const roadMatrix = new T.Matrix4().compose(
      frame.position,
      frame.quaternion,
      new T.Vector3(1, 1, 1),
    );
    const inverse = roadMatrix.clone().invert();
    const worldEnvelope = envelope.clone().applyMatrix4(roadMatrix);
    for (const candidate of triangles) {
      if (!candidate.box.intersectsBox(worldEnvelope)) continue;
      triangle.set(
        ...candidate.vertices.map((vertex) =>
          vertex.clone().applyMatrix4(inverse),
        ),
      );
      if (envelope.intersectsTriangle(triangle))
        collisions.push({ s, name: candidate.name });
    }
  }
  disposeFixture(gltf.scene);
  assert.deepEqual(collisions, []);
});

test('production asset loading, deterministic spectacle and repeated ownership disposal', async () => {
  const track = createSaffronTrack();
  const gltf = await loadKit();
  let sourceDisposals = 0;
  const geometries = new Set();
  gltf.scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
  });
  for (const geometry of geometries)
    geometry.addEventListener('dispose', () => sourceDisposals++);
  const environment = createSaffronEnvironment(
    { track },
    { loadAsset: async () => gltf },
  );
  assert.equal(await environment.ready, true);
  assert.ok(environment.group.userData.metrics.triangleCount < 700000);
  assert.ok(environment.group.userData.metrics.meshCount < 80);
  const frame = {
    time: 32,
    settings: { quality: 'high', reducedMotion: false },
  };
  environment.update(frame);
  const first = environment.group.userData.getLeviathanPresentation();
  assert.equal(first.phase, 'breaching');
  assert.equal(first.active, true);
  environment.reset();
  environment.update(frame);
  assert.deepEqual(
    environment.group.userData.getLeviathanPresentation(),
    first,
  );
  environment.update({
    ...frame,
    settings: { quality: 'low', reducedMotion: true },
  });
  const reduced = environment.group.userData.getLeviathanPresentation();
  assert.deepEqual(
    reduced.position,
    first.position,
    'Presets do not change event position or clock',
  );
  assert.equal(reduced.age, first.age);
  environment.dispose();
  environment.dispose();
  assert.equal(sourceDisposals, geometries.size);
  assert.equal(environment.group.children.length, 0);
});

test('late asset completion after disposal releases loaded buffers without attaching children', async () => {
  const track = createSaffronTrack();
  const gltf = await loadKit();
  let sourceDisposals = 0;
  const geometries = new Set();
  gltf.scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
  });
  for (const geometry of geometries)
    geometry.addEventListener('dispose', () => sourceDisposals++);
  let resolve;
  const deferred = new Promise((done) => {
    resolve = done;
  });
  const environment = createSaffronEnvironment(
    { track },
    { loadAsset: () => deferred },
  );
  environment.dispose();
  resolve(gltf);
  assert.equal(await environment.ready, false);
  assert.equal(sourceDisposals, geometries.size);
  assert.equal(environment.group.children.length, 0);
});

test('asset failure unwinds the environment and neutral shape remains asset-free', async () => {
  const track = createSaffronTrack();
  const environment = createSaffronEnvironment(
    { track },
    {
      loadAsset: async () => {
        throw new Error('fixture asset failure');
      },
    },
  );
  await assert.rejects(environment.ready, /fixture asset failure/);
  assert.equal(environment.group.children.length, 0);
  let loads = 0;
  const shape = createSaffronEnvironment(
    { track },
    {
      shape: true,
      loadAsset: () => {
        loads++;
      },
    },
  );
  await shape.ready;
  assert.equal(loads, 0);
  assert.ok(
    shape.group.getObjectByName(
      'Saffron / neutral skull mouth and occipital clearance',
    ),
  );
  shape.dispose();
  assert.deepEqual(sampleBurrower(32), sampleBurrower(80));
  assert.equal(sampleBurrower(18).phase, 'moving-ridge');
});
