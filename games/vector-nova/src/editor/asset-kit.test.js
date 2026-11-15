import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { gzipSync } from 'node:zlib';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  assetKitBounds,
  createAssetKit,
  createAssetSourceCache,
  loadEditorStaticAsset,
} from './asset-kit.js';
import { createTextureBudget } from '../renderer/texture-budget.js';
import metadata from './kits/shatterline-assets.json' with { type: 'json' };

const faces = [
  [
    [-1, 0, -1],
    [1, 0, -1],
    [0, 2, 1],
  ],
];
const descriptor = {
  url: '/registered-art.glb',
  bounds: [
    [-1, 1, -1],
    [1, 3, 1],
  ],
  triangles: faces,
};
const matrix = (x = 0, y = 0, z = 0) =>
  new T.Matrix4().makeTranslation(x, y, z);
function fixture(map = null) {
  const scene = new T.Group(),
    geometry = new T.BoxGeometry(2, 2, 2);
  const material = new T.MeshStandardMaterial({
    name: 'Authored limestone',
    map,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Retained source mesh';
  mesh.position.y = 2;
  scene.add(mesh);
  let releases = 0;
  geometry.addEventListener('dispose', () => releases++);
  return {
    value: { scene },
    mesh,
    material,
    geometry,
    get releases() {
      return releases;
    },
  };
}
const make = (options) =>
  createAssetKit({
    assets: { rock: descriptor },
    placements: [{ id: 'r0', asset: 'rock', matrix: matrix() }],
    cache: createAssetSourceCache(),
    ...options,
  });

test('named prototypes share one source load and retain parent transforms without including library siblings', async () => {
  const source = fixture(),
    scene = source.value.scene;
  const root = new T.Group();
  root.name = 'Library root';
  root.position.set(17, 3, -9);
  scene.remove(source.mesh);
  root.add(source.mesh);
  scene.add(root);
  source.mesh.name = 'Complete prototype';
  const sibling = new T.Mesh(
    new T.BoxGeometry(40, 40, 40),
    new T.MeshStandardMaterial(),
  );
  sibling.position.x = 1000;
  scene.add(sibling);
  scene.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(source.mesh);
  let loads = 0;
  const selected = {
    ...descriptor,
    node: 'Complete prototype',
    bounds: [box.min.toArray(), box.max.toArray()],
  };
  const kit = createAssetKit({
    assets: { first: selected, second: selected },
    placements: [
      { id: 'a', asset: 'first', matrix: matrix(100) },
      { id: 'b', asset: 'second', matrix: matrix(200) },
    ],
    cache: createAssetSourceCache(),
    loadAsset: async () => {
      loads++;
      return source.value;
    },
  });
  await kit.ready;
  assert.equal(loads, 1);
  assert.equal(kit.group.children.length, 2);
  const actual = new T.Matrix4();
  kit.group.children[0].getMatrixAt(0, actual);
  assert.deepEqual(
    actual.toArray(),
    matrix(100).multiply(source.mesh.matrixWorld).toArray(),
  );
  kit.dispose();
});

test('prototype selection uses authored glTF names when the loader sanitizes runtime names', async () => {
  const source = fixture();
  source.mesh.name = 'Complete_prototype';
  source.value.parser = {
    json: { nodes: [{ name: 'Complete / prototype' }] },
    associations: new Map([[source.mesh, { nodes: 0 }]]),
  };
  const kit = make({
    assets: { rock: { ...descriptor, node: 'Complete / prototype' } },
    loadAsset: async () => source.value,
  });
  await kit.ready;
  assert.equal(kit.group.children.length, 1);
  kit.dispose();
});

test('rotated prototype bounds compare real vertices rather than invented local-box corners', async () => {
  const scene = new T.Group();
  const geometry = new T.BufferGeometry();
  geometry.setAttribute(
    'position',
    new T.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 0, 2, 0], 3),
  );
  const mesh = new T.Mesh(geometry, new T.MeshStandardMaterial());
  mesh.rotation.z = Math.PI / 4;
  scene.add(mesh);
  scene.updateMatrixWorld(true);
  const exact = new T.Box3().setFromObject(scene, true),
    approximate = new T.Box3().setFromObject(scene);
  assert(!exact.containsBox(approximate));
  const kit = make({
    assets: {
      rock: {
        ...descriptor,
        bounds: [exact.min.toArray(), exact.max.toArray()],
      },
    },
    loadAsset: async () => ({ scene }),
  });
  await kit.ready;
  assert.equal(kit.group.children.length, 1);
  kit.dispose();
});

test('compressed production exports load once with both raw gzip and host-decoded response bodies', async (t) => {
  const bytes = Buffer.from('glTF fixture body');
  let parsed = 0;
  t.mock.method(GLTFLoader.prototype, 'parseAsync', async (buffer, path) => {
    assert.equal(Buffer.from(buffer).toString(), bytes.toString());
    assert.equal(path, '/registered/');
    parsed++;
    return { scene: new T.Group() };
  });
  for (const body of [gzipSync(bytes), bytes]) {
    t.mock.method(globalThis, 'fetch', async () => new Response(body));
    await loadEditorStaticAsset('/registered/district.glb.gz');
  }
  assert.equal(parsed, 2);
});

test('mirrored authored nodes bake into owned geometry with outward winding and unchanged source resources', async () => {
  const source = fixture();
  source.mesh.scale.x = -1;
  source.mesh.position.x = 3;
  source.value.scene.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(source.value.scene);
  const originalPosition = source.geometry
    .getAttribute('position')
    .array.slice();
  const kit = make({
    assets: {
      rock: {
        ...descriptor,
        bounds: [bounds.min.toArray(), bounds.max.toArray()],
      },
    },
    loadAsset: async () => source.value,
  });
  await kit.ready;
  const mesh = kit.group.children[0],
    transform = new T.Matrix4();
  mesh.getMatrixAt(0, transform);
  assert.equal(transform.determinant(), 1);
  assert.notEqual(mesh.geometry, source.geometry);
  const actual = new T.Vector3().fromBufferAttribute(
    mesh.geometry.getAttribute('position'),
    0,
  );
  const expected = new T.Vector3()
    .fromBufferAttribute(source.geometry.getAttribute('position'), 0)
    .applyMatrix4(source.mesh.matrixWorld);
  assert(actual.distanceTo(expected) < 1e-6);
  const sourceFace = Array.from(source.geometry.index.array).slice(0, 3);
  assert.deepEqual(Array.from(mesh.geometry.index.array).slice(0, 3), [
    sourceFace[0],
    sourceFace[2],
    sourceFace[1],
  ]);
  assert.deepEqual(
    source.geometry.getAttribute('position').array,
    originalPosition,
  );
  let disposals = 0;
  mesh.geometry.addEventListener('dispose', () => disposals++);
  kit.dispose();
  kit.dispose();
  assert.equal(disposals, 1);
});

test('geometry finish attributes use owned clones and cannot invalidate physical shape', async () => {
  const source = fixture();
  const kit = make({
    loadAsset: async () => source.value,
    prepareGeometry(geometry) {
      geometry.setAttribute(
        'industrialCoord',
        geometry.getAttribute('position').clone(),
      );
    },
  });
  await kit.ready;
  assert(kit.group.children[0].geometry.getAttribute('industrialCoord'));
  assert.equal(source.geometry.getAttribute('industrialCoord'), undefined);
  kit.dispose();
  const failureSource = fixture();
  const failed = make({
    loadAsset: async () => failureSource.value,
    prepareGeometry(geometry) {
      geometry.translate(10, 0, 0);
    },
  });
  await assert.rejects(failed.ready, /physical positions/);
  assert(failed.isDisposed());
});

test('compact indexed collision keeps authored apertures and decodes without loading graphics', () => {
  // Four separate bars form a square aperture; a solid AABB would wrongly hit
  // the centre ray, while these exact indexed bars leave the passage open.
  const group = new T.Group();
  for (const [x, y, w, h] of [
    [-2, 0, 1, 5],
    [2, 0, 1, 5],
    [0, -2, 3, 1],
    [0, 2, 3, 1],
  ]) {
    const geometry = new T.BoxGeometry(w, h, 1);
    geometry.translate(x, y, 0);
    group.add(new T.Mesh(geometry, new T.MeshBasicMaterial()));
  }
  const positions = [],
    indices = [];
  for (const mesh of group.children) {
    const offset = positions.length / 3;
    positions.push(...mesh.geometry.getAttribute('position').array);
    indices.push(
      ...Array.from(mesh.geometry.index.array, (index) => index + offset),
    );
  }
  const encoded = {
    format: 'indexed-f32-v1',
    positions: Buffer.from(new Float32Array(positions).buffer).toString(
      'base64',
    ),
    indices: Buffer.from(new Uint16Array(indices).buffer).toString('base64'),
    indexType: 'u16',
  };
  let captured;
  const kit = make({
    assets: { rock: { ...descriptor, collision: encoded } },
    collectSolid(solid) {
      captured = solid.geometry;
    },
    loadAsset() {
      throw new Error('CPU must not fetch');
    },
  });
  const mesh = new T.Mesh(
    captured,
    new T.MeshBasicMaterial({ side: T.DoubleSide }),
  );
  const ray = new T.Raycaster(new T.Vector3(0, 0, 10), new T.Vector3(0, 0, -1));
  assert.equal(ray.intersectObject(mesh).length, 0);
  ray.ray.origin.x = 2;
  assert(ray.intersectObject(mesh).length > 0);
  kit.dispose();
  mesh.material.dispose();
  group.children.forEach((node) => {
    node.geometry.dispose();
    node.material.dispose();
  });
  assert.throws(
    () =>
      make({
        assets: {
          rock: { ...descriptor, collision: { ...encoded, indices: 'a' } },
        },
        collectSolid() {},
      }),
    /encoding|length/,
  );
});

test('CPU collision is synchronous, transformed and limited to explicit authored faces', async () => {
  let calls = 0;
  const solids = [],
    transform = matrix(10, 20, 30);
  const kit = make({
    assets: { rock: descriptor, decoration: { ...descriptor, triangles: [] } },
    placements: [
      { id: 'solid', asset: 'rock', matrix: transform },
      { id: 'decorative', asset: 'rock', matrix: matrix(), solid: false },
      { id: 'no-proxy', asset: 'decoration', matrix: matrix() },
    ],
    collectSolid: (solid) => solids.push(solid),
    loadAsset: () => {
      calls++;
      throw new Error('CPU collision must not load art');
    },
  });
  assert.equal(solids.length, 1);
  assert.equal(calls, 0);
  assert.equal(kit.group.children.length, 0);
  const positions = solids[0].geometry.getAttribute('position');
  const actual = new T.Vector3()
    .fromBufferAttribute(positions, 0)
    .applyMatrix4(solids[0].matrix);
  assert.deepEqual(actual.toArray(), [9, 20, 29]);
  assert.equal(solids[0].kind, 'structure');
  assert.equal(solids[0].asset, 'rock');
  let disposed = 0;
  solids[0].geometry.addEventListener('dispose', () => disposed++);
  await kit.ready;
  kit.dispose();
  kit.dispose();
  assert.equal(disposed, 1);
});

test('visual batches use source-node transforms and spatial cells while preserving source art', async () => {
  const source = fixture();
  const transform = new T.Matrix4().compose(
    new T.Vector3(12, 40, -15),
    new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), 0.6),
    new T.Vector3(2, 3, 2),
  );
  const kit = make({
    placements: [
      { id: 'near', asset: 'rock', matrix: transform },
      { id: 'distant', asset: 'rock', matrix: matrix(20000) },
    ],
    loadAsset: async () => source.value,
    finishMaterial: (material) => {
      material.roughness = 0.31;
    },
  });
  const borrowedReflection = new T.Texture();
  let reflectedDisposed = 0;
  borrowedReflection.addEventListener('dispose', () => reflectedDisposed++);
  kit.setReflection(borrowedReflection);
  await kit.ready;
  assert.equal(kit.group.children.length, 2);
  const near = kit.group.children[0],
    actual = new T.Matrix4();
  near.getMatrixAt(0, actual);
  const expected = transform.clone().multiply(source.mesh.matrixWorld);
  actual.elements.forEach((n, i) =>
    assert(Math.abs(n - expected.elements[i]) < 1e-5),
  );
  assert.deepEqual(near.userData.placementIds, ['near']);
  assert.equal(near.geometry, source.geometry);
  assert.notEqual(near.material, source.material);
  assert.equal(near.material.roughness, 0.31);
  assert.equal(source.material.roughness, 1);
  assert.equal(near.material.envMap, borrowedReflection);
  assert(near.boundingBox && near.boundingSphere);
  kit.dispose();
  assert.equal(source.releases, 1);
  assert.equal(reflectedDisposed, 0, 'reflection is borrowed');
});

test('overlapping owners deduplicate loads and retain geometry until the last lease ends', async () => {
  const cache = createAssetSourceCache(),
    source = fixture();
  let loads = 0;
  const loadAsset = async () => {
    loads++;
    return source.value;
  };
  const old = make({ cache, loadAsset }),
    next = make({ cache, loadAsset });
  await Promise.all([old.ready, next.ready]);
  assert.equal(loads, 1);
  old.dispose();
  assert.equal(
    source.releases,
    0,
    'the warmed replacement still needs its shared geometry',
  );
  next.dispose();
  assert.equal(source.releases, 1);
  const reopened = make({ cache, loadAsset });
  await reopened.ready;
  assert.equal(loads, 1, 'bounded cached CPU data can be uploaded again');
  reopened.dispose();
  assert.equal(source.releases, 2);
});

test('Low test-drive textures cannot mutate a retained High preview or cached source', async () => {
  const mips = [2048, 1024, 512].map((width) => ({
    width,
    height: width,
    data: new Uint8Array(width * width),
  }));
  const map = new T.CompressedTexture(mips, 2048, 2048, T.RGBA_ASTC_4x4_Format);
  const source = fixture(map),
    cache = createAssetSourceCache();
  const high = make({ cache, loadAsset: async () => source.value });
  const low = make({ cache, loadAsset: async () => source.value });
  await Promise.all([high.ready, low.ready]);
  const highMap = high.group.children[0].material.map,
    lowMap = low.group.children[0].material.map;
  assert.notEqual(highMap, map);
  assert.notEqual(highMap, lowMap);
  assert.notEqual(highMap.source, lowMap.source);
  assert.notEqual(highMap.source, map.source);
  assert.notEqual(highMap.mipmaps, map.mipmaps);
  const budget = createTextureBudget();
  budget.apply(low.group, { textureSize: 512, anisotropy: 2 });
  assert.equal(lowMap.image.width, 512);
  assert.equal(highMap.image.width, 2048);
  assert.equal(map.image.width, 2048);
  lowMap.image = { width: 123, height: 123 };
  assert.equal(
    highMap.image.width,
    2048,
    'even direct Source replacement is owner-local',
  );
  assert.equal(map.image.width, 2048);
  budget.dispose();
  low.dispose();
  high.dispose();
});

test('registered finish textures are ready before material hooks and owned once', async () => {
  const source = fixture(),
    rockTexture = new T.Texture({ width: 1024, height: 1024 });
  let finish = 0;
  const kit = make({
    loadAsset: async () => source.value,
    textures: { limestone: '/registered-limestone.png' },
    loadTexture: async () => rockTexture,
    configureTexture(texture) {
      texture.colorSpace = T.SRGBColorSpace;
      texture.wrapS = T.RepeatWrapping;
    },
    finishMaterial(material, asset, textures) {
      finish++;
      assert.equal(asset, 'rock');
      assert.equal(textures.limestone.colorSpace, T.SRGBColorSpace);
      assert.notEqual(textures.limestone, rockTexture);
      material.userData.finishTexture = textures.limestone;
    },
  });
  await kit.ready;
  assert.equal(finish, 1);
  assert.equal(kit.ownedTextures.size, 1);
  let released = 0;
  kit.textures.limestone.addEventListener('dispose', () => released++);
  kit.dispose();
  kit.dispose();
  assert.equal(released, 1);
  assert.equal(kit.ownedTextures.size, 0);
});

test('abort and early disposal release late loads without attaching meshes', async () => {
  for (const cancel of ['abort', 'dispose']) {
    const source = fixture(),
      controller = new AbortController();
    let resolve;
    const pending = new Promise((done) => {
      resolve = done;
    });
    const kit = make({ signal: controller.signal, loadAsset: () => pending });
    await Promise.resolve();
    if (cancel === 'abort') controller.abort();
    else kit.dispose();
    resolve(source.value);
    await assert.rejects(kit.ready, { name: 'AbortError' });
    assert.equal(kit.group.children.length, 0);
    assert.equal(source.releases, 1);
  }
  const controller = new AbortController();
  controller.abort();
  const kit = make({
    signal: controller.signal,
    loadAsset: () => assert.fail('already canceled'),
  });
  await assert.rejects(kit.ready, { name: 'AbortError' });
});

test('partial failure, stale bounds and failing finishes clean every acquired owner', async () => {
  const source = fixture();
  const kit = make({
    assets: {
      rock: descriptor,
      missing: { ...descriptor, url: '/missing.glb' },
    },
    placements: [
      { id: 'a', asset: 'rock', matrix: matrix() },
      { id: 'b', asset: 'missing', matrix: matrix() },
    ],
    loadAsset: async (url) => {
      if (url === '/missing.glb') throw new Error('Missing asset');
      return source.value;
    },
  });
  await assert.rejects(kit.ready, /Missing asset/);
  assert.equal(source.releases, 1);
  assert(kit.isDisposed());
  const stale = make({
    assets: {
      rock: {
        ...descriptor,
        bounds: [
          [0, 0, 0],
          [0.1, 0.1, 0.1],
        ],
      },
    },
    loadAsset: async () => fixture().value,
  });
  await assert.rejects(stale.ready, /baked bounds/);
  assert.equal(stale.group.children.length, 0);
  const failed = make({
    loadAsset: async () => fixture().value,
    finishMaterial: () => {
      throw new Error('Broken finish');
    },
  });
  await assert.rejects(failed.ready, /Broken finish/);
  assert.equal(failed.materials.size, 0);
});

test('failed loads remain retryable and the parsed source cache evicts only idle entries', async () => {
  const cache = createAssetSourceCache({ maxEntries: 1 });
  await assert.rejects(
    cache.acquire('broken', async () => {
      throw new Error('retry');
    }),
  );
  assert.equal(cache.size, 0);
  const first = await cache.acquire('one', async () => fixture().value);
  const second = await cache.acquire('two', async () => fixture().value);
  assert.equal(cache.size, 2, 'active owners cannot be evicted');
  first.release();
  assert.equal(cache.size, 1);
  second.release();
  const retry = await cache.acquire('broken', async () => fixture().value);
  retry.release();
  assert.equal(cache.size, 1);
});

test('baked Shatterline proxies preserve authored architectural openings and bounded solid geology', () => {
  for (const [id, asset] of Object.entries(metadata)) {
    assert.equal(asset.sourceHash.length, 64);
    assert(asset.triangles.length > 0, id);
    const bounds = assetKitBounds(asset);
    assert(
      bounds.containsBox(
        new T.Box3(
          new T.Vector3(...asset.visualBounds[0]),
          new T.Vector3(...asset.visualBounds[1]),
        ),
      ),
    );
    if (id.startsWith('geology-')) {
      assert(asset.triangles.length <= 100);
      assert.equal(asset.proxy, 'conservative-solid-geology-26planes');
      const edges = new Map();
      for (const face of asset.triangles)
        for (let i = 0; i < 3; i++) {
          const key = [face[i].join(','), face[(i + 1) % 3].join(',')]
            .sort()
            .join('/');
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      assert(
        [...edges.values()].every((count) => count === 2),
        'the coarse rock shell is closed',
      );
    } else assert.equal(asset.proxy, 'authored-collision-kit');
  }
  const transformed = assetKitBounds(descriptor, matrix(10, 20, 30));
  assert.deepEqual(transformed.min.toArray(), [9, 21, 29]);
  assert.deepEqual(transformed.max.toArray(), [11, 23, 31]);
});
