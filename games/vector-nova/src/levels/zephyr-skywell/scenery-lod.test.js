import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSkywellSceneryLods } from './scenery-lod.js';

test('far authored surfaces retain an actual opening, vertex colours and borrowed source identity', async () => {
  const source = new T.TorusGeometry(50, 8, 48, 160).toNonIndexed();
  const positions = source.attributes.position.array.slice();
  const colors = new Uint8Array(source.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i++) colors[i] = 64 + (i % 128);
  source.setAttribute('color', new T.Uint8BufferAttribute(colors, 3, true));
  const lods = await createSkywellSceneryLods([source, source]);
  const far = lods.far.get(source);
  assert.equal(lods.far.size, 1);
  assert.notEqual(far, source);
  assert.ok(far.index.count < source.attributes.position.count * 0.3);
  assert.ok(far.userData.skywellLod.error <= 0.025);
  assert.deepEqual(source.attributes.position.array, positions);
  assert.equal(source.index, null);
  const normal = far.attributes.normal;
  assert.ok(normal.array.every(Number.isFinite));
  const material = new T.MeshBasicMaterial({ side: T.DoubleSide });
  const mesh = new T.Mesh(far, material);
  const ray = new T.Raycaster(
    new T.Vector3(0, 0, 100),
    new T.Vector3(0, 0, -1),
  );
  assert.equal(
    ray.intersectObject(mesh).length,
    0,
    'decimation preserves the open centre',
  );
  ray.ray.origin.x = 50;
  assert.ok(
    ray.intersectObject(mesh).length > 0,
    'the surrounding authored ring remains solid',
  );
  const originalsByPoint = new Map();
  for (let i = 0; i < source.attributes.position.count; i++) {
    const p = new T.Vector3().fromBufferAttribute(
      source.attributes.position,
      i,
    );
    const key = p.toArray().join(',');
    if (!originalsByPoint.has(key)) originalsByPoint.set(key, []);
    originalsByPoint.get(key).push(i);
  }
  for (let i = 0; i < far.attributes.position.count; i++) {
    const p = new T.Vector3().fromBufferAttribute(far.attributes.position, i);
    const representatives = originalsByPoint.get(p.toArray().join(','));
    assert.ok(representatives, 'every coarse vertex is an authored position');
    assert.ok(
      representatives.some((original) =>
        [0, 1, 2].every(
          (component) =>
            Math.abs(
              far.attributes.color.getComponent(i, component) -
                source.attributes.color.getComponent(original, component),
            ) < 1e-6,
        ),
      ),
      'normalised vertex colour comes from a real representative',
    );
  }
  let disposedSource = 0,
    disposedFar = 0;
  source.addEventListener('dispose', () => disposedSource++);
  far.addEventListener('dispose', () => disposedFar++);
  lods.dispose();
  lods.dispose();
  assert.equal(disposedSource, 0);
  assert.equal(disposedFar, 1);
  source.dispose();
  material.dispose();
});

test('small meshes and specialised water attributes keep their original geometry', async () => {
  const small = new T.PlaneGeometry();
  const water = new T.TorusGeometry(50, 8, 48, 160);
  water.setAttribute(
    'strandU',
    new T.Float32BufferAttribute(
      new Float32Array(water.attributes.position.count),
      1,
    ),
  );
  const lods = await createSkywellSceneryLods([small, water]);
  assert.equal(lods.far.get(small), small);
  assert.equal(lods.far.get(water), water);
  lods.dispose();
  small.dispose();
  water.dispose();
});

test('the real cathedral facade reduces while its drive-through aperture remains open', async () => {
  const bytes = await readFile(
    new URL(
      '../../../public/assets/levels/zephyr/cathedral-facade.glb',
      import.meta.url,
    ),
  );
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  const sources = new Set();
  gltf.scene.traverse((mesh) => {
    if (mesh.isMesh) sources.add(mesh.geometry);
  });
  const lods = await createSkywellSceneryLods(sources);
  let originalCount = 0,
    coarseCount = 0;
  const coarse = gltf.scene.clone(true);
  gltf.scene.traverse((mesh) => {
    if (mesh.isMesh)
      originalCount +=
        mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count;
  });
  coarse.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.geometry = lods.far.get(mesh.geometry);
    coarseCount +=
      mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count;
  });
  assert.ok(coarseCount < originalCount * 0.4);
  gltf.scene.updateMatrixWorld(true);
  coarse.updateMatrixWorld(true);
  const ray = new T.Raycaster(
    new T.Vector3(0, 10, -150),
    new T.Vector3(0, 0, 1),
    0,
    250,
  );
  assert.equal(ray.intersectObject(gltf.scene, true).length, 0);
  assert.equal(
    ray.intersectObject(coarse, true).length,
    0,
    'actual rose-facade passage remains open',
  );
  lods.dispose();
  sources.forEach((geometry) => geometry.dispose());
  const materials = new Set();
  gltf.scene.traverse((mesh) => {
    for (const material of [mesh.material].flat().filter(Boolean))
      materials.add(material);
  });
  materials.forEach((material) => material.dispose());
});

test('real fissured island surfaces simplify without losing the terrace top', async () => {
  const bytes = await readFile(
    new URL(
      '../../../public/assets/levels/zephyr/island-grand.glb',
      import.meta.url,
    ),
  );
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  const surfaces = [];
  gltf.scene.traverse((mesh) => {
    if (mesh.isMesh) surfaces.push(mesh);
  });
  const lods = await createSkywellSceneryLods(
    surfaces.map((mesh) => mesh.geometry),
  );
  let originalCount = 0,
    coarseCount = 0;
  const far = gltf.scene.clone(true);
  gltf.scene.traverse((mesh) => {
    if (mesh.isMesh)
      originalCount +=
        mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count;
  });
  far.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.geometry = lods.far.get(mesh.geometry);
    coarseCount +=
      mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count;
  });
  assert.ok(coarseCount < originalCount * 0.4);
  far.updateMatrixWorld(true);
  const ray = new T.Raycaster(
    new T.Vector3(0, 200, 0),
    new T.Vector3(0, -1, 0),
  );
  const hit = ray.intersectObject(far, true)[0];
  assert.ok(hit, 'the visible flat terrace survives coarse fracture geometry');
  assert.ok(Math.abs(hit.point.y) < 0.01);
  lods.dispose();
  surfaces.forEach((mesh) => {
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
});
