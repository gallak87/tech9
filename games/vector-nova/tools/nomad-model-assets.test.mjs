import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const game = fileURLToPath(new URL('..', import.meta.url));
const blender = resolve(game, 'assets/levels/nomad/blender');
// JSON rounds to 5–6 decimals; Blender joins and glTF part transforms also
// round Float32 coordinates across these ~400m prototypes. A 0.25mm bound
// covers that encoding drift without accepting displaced physical art.
const tolerance = 0.00025;
const assets = [
  ['carrier-kit', 'carrier-kit-provenance.json'],
  ['route-supports', 'route-supports-provenance.json'],
  ['receiver-crown', 'receiver-crown/receiver-crown-provenance.json'],
  ['interior-freight', 'interior-freight/interior-freight-provenance.json'],
  ['companion-armour', 'companion-armour/companion-armour-provenance.json'],
  ['wallride-service', 'wallride-service/wallride-service-provenance.json'],
  ['saltwind-gallery', 'saltwind-gallery/saltwind-gallery-provenance.json'],
];

async function verifiedRecord(path) {
  const record = JSON.parse(await readFile(path, 'utf8'));
  const directory = dirname(path);
  const collision =
    typeof record.collision === 'string'
      ? record.collision
      : record.collision?.file;
  const retained = [
    resolve(directory, record.source),
    resolve(directory, record.blend),
    resolve(game, record.runtimeAsset),
    ...[collision, record.sourceHull, record.sourceBlend, record.roadGuides]
      .filter(Boolean)
      .map((name) => resolve(directory, name)),
  ];
  assert.ok(
    Object.keys(record.hashes).length >= 3,
    'builder, blend and runtime GLB must be recorded',
  );
  const hashed = new Set();
  for (const [name, expected] of Object.entries(record.hashes)) {
    assert.match(expected, /^[a-f0-9]{64}$/, `${name}: recorded SHA-256`);
    const matches = [
      ...new Set(retained.filter((file) => basename(file) === name)),
    ];
    assert.equal(
      matches.length,
      1,
      `${name}: resolve to one declared retained dependency`,
    );
    const file = matches[0];
    const actual = createHash('sha256')
      .update(await readFile(file))
      .digest('hex');
    assert.equal(
      actual,
      expected,
      `${file}: retained source/runtime dependency changed without provenance`,
    );
    hashed.add(file);
  }
  for (const file of retained)
    assert.ok(
      hashed.has(file),
      `${file}: declared source, collision and guide dependencies require hashes`,
    );
  return { record, collision: collision && resolve(directory, collision) };
}

function geometryOf(root) {
  const vertices = [],
    triangles = [];
  const frame = (root.parent?.matrixWorld ?? new T.Matrix4()).clone().invert();
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const position = mesh.geometry.attributes.position;
    const matrix = frame.clone().multiply(mesh.matrixWorld);
    const offset = vertices.length;
    for (let i = 0; i < position.count; i++)
      vertices.push(
        new T.Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix),
      );
    const count = mesh.geometry.index?.count ?? position.count;
    assert.equal(count % 3, 0, `${mesh.name}: complete rendered triangles`);
    for (let i = 0; i < count; i += 3)
      triangles.push(
        [0, 1, 2].map(
          (corner) =>
            offset + (mesh.geometry.index?.getX(i + corner) ?? i + corner),
        ),
      );
  });
  assert.ok(
    vertices.length && triangles.length,
    `${root.name}: real rendered geometry`,
  );
  return { vertices, triangles };
}

function pointIndex() {
  const cells = new Map(),
    points = [];
  const cell = (point) =>
    point.toArray().map((value) => Math.floor(value / tolerance));
  function find(point) {
    const [x, y, z] = cell(point);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++)
          for (const id of cells.get(`${x + dx},${y + dy},${z + dz}`) ?? [])
            if (points[id].distanceToSquared(point) <= tolerance * tolerance)
              return id;
    return null;
  }
  return {
    find,
    add(point) {
      const existing = find(point);
      if (existing !== null) return existing;
      const id = points.length,
        key = cell(point).join(',');
      points.push(point);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(id);
      return id;
    },
  };
}
const faceKey = (indices) => [...indices].sort((a, b) => a - b).join(',');

function agreeWithCollision(name, rendered, collision, exact) {
  assert.equal(
    collision.positions.length % 3,
    0,
    `${name}: complete collision vertices`,
  );
  assert.equal(
    collision.indices.length % 3,
    0,
    `${name}: complete collision faces`,
  );
  const index = pointIndex(),
    renderIds = rendered.vertices.map((point) => index.add(point));
  const collisionIds = [];
  for (let i = 0; i < collision.positions.length; i += 3) {
    const point = new T.Vector3().fromArray(collision.positions, i);
    assert.ok(
      point.toArray().every(Number.isFinite),
      `${name}: finite collision vertex`,
    );
    const id = index.find(point);
    assert.notEqual(
      id,
      null,
      `${name}: native vertex ${point.toArray()} belongs to its rendered prototype`,
    );
    collisionIds.push(id);
  }
  const faces = new Map();
  for (const triangle of rendered.triangles) {
    const key = faceKey(triangle.map((id) => renderIds[id]));
    faces.set(key, (faces.get(key) ?? 0) + 1);
  }
  for (let i = 0; i < collision.indices.length; i += 3) {
    const ids = collision.indices.slice(i, i + 3);
    assert.ok(
      ids.every(
        (id) => Number.isInteger(id) && id >= 0 && id < collisionIds.length,
      ),
      `${name}: valid native indices`,
    );
    const key = faceKey(ids.map((id) => collisionIds[id]));
    assert.ok(
      faces.get(key) > 0,
      `${name}: native face ${i / 3} is an actual rendered triangle`,
    );
    faces.set(key, faces.get(key) - 1);
  }
  if (collision.triangles !== undefined)
    assert.equal(collision.triangles, collision.indices.length / 3);
  if (exact)
    assert.equal(
      [...faces.values()].reduce((sum, count) => sum + count, 0),
      0,
      `${name}: exact addon must retain every rendered triangle in native collision`,
    );
}

function dispose(scene) {
  const geometries = new Set(),
    materials = new Set();
  scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material])
      materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

for (const [name, manifest] of assets)
  test(`Nomad ${name}: retained hashes, declared GLB roots and physical/rendered agreement`, async () => {
    const { record, collision } = await verifiedRecord(
      resolve(blender, manifest),
    );
    const bytes = await readFile(resolve(game, record.runtimeAsset));
    const { scene } = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
    try {
      scene.updateWorldMatrix(true, true);
      const native = collision && JSON.parse(await readFile(collision, 'utf8'));
      const declared = new Map(
        record.prototypes.map((prototype) => [prototype.name, prototype]),
      );
      if (native) {
        const expected = record.collision.prototypes ?? record.prototypes;
        assert.deepEqual(
          native.prototypes.map((prototype) => prototype.name).sort(),
          expected.map((prototype) => prototype.name).sort(),
          'every declared native prototype remains present',
        );
        for (const prototype of record.collision.prototypes ?? [])
          assert.equal(
            native.prototypes.find((part) => part.name === prototype.name)
              .indices.length / 3,
            prototype.triangles,
            `${prototype.name}: recorded substantial collision members`,
          );
        if (record.collision.triangles !== undefined)
          assert.equal(
            native.prototypes.reduce(
              (sum, prototype) => sum + prototype.indices.length / 3,
              0,
            ),
            record.collision.triangles,
            'recorded aggregate collision faces',
          );
      }
      for (const prototype of record.prototypes) {
        const root = scene.getObjectByName(prototype.name);
        assert.ok(
          root,
          `${prototype.name}: declared root exists in actual GLB`,
        );
        assert.equal(
          geometryOf(root).triangles.length,
          prototype.triangles,
          `${prototype.name}: provenance counts actual exported triangles`,
        );
      }
      for (const prototype of native?.prototypes ?? []) {
        assert.ok(
          declared.has(prototype.name),
          `${prototype.name}: native prototype is declared`,
        );
        const rendered = geometryOf(scene.getObjectByName(prototype.name));
        // Carrier running gear/cosmetics and the replacement Saltwind hull
        // deliberately retain only substantial members. Authored addons are exact.
        const exact =
          name !== 'carrier-kit' && prototype.name !== 'nomad_saltwind_hull';
        agreeWithCollision(prototype.name, rendered, prototype, exact);
        const count = declared.get(prototype.name).collisionTriangles;
        if (count !== undefined)
          assert.equal(count, prototype.indices.length / 3);
      }
    } finally {
      dispose(scene);
    }
  });
