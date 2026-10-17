// Asset validation only: does not add rivals to the playable fleet.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Box3, Raycaster, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SHIPS } from '../src/ships/catalog.js';
import { RIVAL_SHIPS } from '../src/ships/rivals.js';

const directory = new URL('../assets/ships/rivals/', import.meta.url);
const results = [];
assert.equal(RIVAL_SHIPS.length, 9, 'Nine distinct AI chassis');
assert.equal(new Set(RIVAL_SHIPS.map(({ id }) => id)).size, 9);
for (const { id } of RIVAL_SHIPS) {
  assert.ok(
    !SHIPS.some((ship) => ship.id === id),
    'Rivals must remain outside the player catalog',
  );
  const bytes = await readFile(
    new URL(`../public/assets/ships/rivals/${id}/${id}.glb`, import.meta.url),
  );
  const manifest = JSON.parse(
    await readFile(new URL(`${id}/asset-manifest.json`, directory), 'utf8'),
  );
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    manifest.sha256,
    `${id}: canonical export matches its authored manifest`,
  );
  const loader = new GLTFLoader();
  // In-game inspection validates decoding; this pass inspects asset geometry.
  loader.register(() => ({
    name: 'CPU_TEXTURES',
    loadTexture: async () => new Texture(),
  }));
  const { scene, parser } = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  const bounds = new Box3().setFromObject(scene);
  assert.ok(
    bounds.min.x >= -2.25 && bounds.max.x <= 2.25,
    `${id}: width envelope`,
  );
  assert.ok(
    bounds.min.z >= -3.51 && bounds.max.z <= 3.51,
    `${id}: length envelope`,
  );
  assert.ok(
    bounds.min.y >= 0 && bounds.max.y <= 1.8,
    `${id}: hover datum / height`,
  );
  const expected = Object.keys(manifest.anchors).sort();
  assert.ok(
    JSON.stringify(expected) === JSON.stringify(['Exhaust_C']) ||
      JSON.stringify(expected) === JSON.stringify(['Exhaust_L', 'Exhaust_R']),
    `${id}: single or paired authored nozzle contract`,
  );
  const anchors = [];
  let meshes = 0,
    triangles = 0;
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  scene.traverse((object) => {
    if (object.name.startsWith('Exhaust_')) anchors.push(object.name);
    if (!object.isMesh) return;
    meshes++;
    geometries.add(object.geometry);
    triangles +=
      (object.geometry.index?.count ??
        object.geometry.attributes.position.count) / 3;
    for (const attribute of Object.values(object.geometry.attributes))
      assert.ok(
        Array.from(attribute.array).every(Number.isFinite),
        `${id}: finite vertex data`,
      );
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value?.isTexture) textures.add(value);
    }
  });
  assert.deepEqual(anchors.sort(), expected.sort());
  for (const name of expected) {
    const position = scene
      .getObjectByName(name)
      .getWorldPosition(new Vector3());
    assert.ok(
      position.distanceTo(new Vector3(...manifest.anchors[name])) < 1e-5,
      `${id}: ${name} coordinate contract`,
    );
    assert.ok(position.z < -2.8, `${id}: nozzle is at the rear`);
    const ray = new Raycaster(
      position.clone().add(new Vector3(0, 0, -0.5)),
      new Vector3(0, 0, 1),
      0,
      1.5,
    );
    const hit = ray.intersectObject(scene, true)[0];
    assert.ok(
      hit?.object.material.name.endsWith('_Ion'),
      `${id}: ${name} ion core must be visible through the nozzle`,
    );
  }
  assert.ok(
    meshes <= 10 && triangles < 35000,
    `${id}: crowd asset geometry budget`,
  );
  assert.ok(parser.json.images.length >= 9, `${id}: baked surface maps`);
  assert.ok(
    parser.json.images.every(
      (image) => image.bufferView !== undefined && !image.uri,
    ),
    `${id}: all textures embedded`,
  );
  assert.ok(
    !parser.json.animations?.length && !parser.json.cameras?.length,
    `${id}: no studio/animation export`,
  );
  assert.equal(bytes.byteLength, manifest.glbBytes);
  results.push({
    id,
    dimensions: bounds
      .getSize(new Vector3())
      .toArray()
      .map((value) => Number(value.toFixed(2))),
    meshes,
    triangles,
    anchors,
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}
console.log(JSON.stringify(results, null, 2));
console.log(
  'Nine rival inspection assets passed; none registered in the playable fleet.',
);
