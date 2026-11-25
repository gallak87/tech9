import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Group,
  Mesh,
  BufferGeometry,
  Float32BufferAttribute,
  MeshStandardMaterial,
  Matrix4,
  Vector3,
  Box3,
  PointLight,
  Float16BufferAttribute,
  Int16BufferAttribute,
  IntType,
} from 'three';
import { batchStaticWorld } from './static-batches.js';

function worldTriangles(root) {
  root.updateWorldMatrix(true, true);
  const result = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry,
      positions = geometry.attributes.position;
    const append = (start, count, matrix) => {
      for (let i = start; i < start + count; i += 3) {
        const triangle = [];
        for (let k = 0; k < 3; k++) {
          const index = geometry.index ? geometry.index.getX(i + k) : i + k;
          triangle.push(
            new Vector3()
              .fromBufferAttribute(positions, index)
              .applyMatrix4(matrix)
              .toArray()
              .map((v) => +v.toFixed(5)),
          );
        }
        result.push(JSON.stringify(triangle));
      }
    };
    if (object.isBatchedMesh) {
      for (let i = 0; i < object.instanceCount; i++) {
        const range = object.getGeometryRangeAt(object.getGeometryIdAt(i));
        const matrix = new Matrix4().multiplyMatrices(
          object.matrixWorld,
          object.getMatrixAt(i, new Matrix4()),
        );
        append(range.start, range.count, matrix);
      }
    } else
      append(0, geometry.index?.count ?? positions.count, object.matrixWorld);
  });
  return result.sort();
}
test('static spatial batches preserve every transformed triangle, material and shadow role', () => {
  const root = new Group();
  root.position.set(17, 9, -12);
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(
      [0, 0, 0, 2, 0, 0, 0, 2, 0, 1000, 0, 0, 1002, 0, 0, 1000, 2, 0],
      3,
    ),
  );
  geometry.setAttribute(
    'normal',
    new Float32BufferAttribute(
      [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
      3,
    ),
  );
  geometry.setAttribute(
    'uv',
    new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 2),
  );
  geometry.setIndex([0, 1, 2, 3, 4, 5]);
  const material = new MeshStandardMaterial();
  const mesh = new Mesh(geometry, material);
  mesh.position.set(12, 5, 7);
  mesh.rotation.y = 0.2;
  mesh.castShadow = true;
  root.add(mesh);
  const before = worldTriangles(root);
  const result = batchStaticWorld(root, { cellSize: 100, minTriangles: 1 });
  assert.deepEqual(result, { sourceMeshes: 1, batches: 1, pieces: 2 });
  const after = worldTriangles(root);
  assert.equal(after.length, before.length);
  for (let i = 0; i < before.length; i++) {
    const a = JSON.parse(after[i]).flat(),
      b = JSON.parse(before[i]).flat();
    for (let j = 0; j < a.length; j++)
      assert.ok(
        Math.abs(a[j] - b[j]) < 0.001,
        'GPU matrix storage retains sub-millimetre placement',
      );
  }
  const batch = root.children[0];
  assert.equal(batch.material, material);
  assert.equal(batch.castShadow, true);
  assert.equal(batch.receiveShadow, false);
  assert.equal(batch.perObjectFrustumCulled, true);
  const a = batch.getBoundingBoxAt(batch.getGeometryIdAt(0), new Box3());
  assert.ok(
    a.getSize(new Vector3()).length() < 5,
    'each piece has its own tight bound',
  );
  assert.deepEqual(
    [...batch.geometry.attributes.uv.array],
    [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
  );
  batch.dispose();
  material.dispose();
});
test('transparent and moving/instanced content remain owned by their existing presentation', () => {
  const root = new Group();
  const geometry = new BufferGeometry().setAttribute(
    'position',
    new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  );
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({ transparent: true }),
  );
  root.add(mesh);
  assert.deepEqual(batchStaticWorld(root, { minTriangles: 1 }), {
    sourceMeshes: 0,
    batches: 0,
    pieces: 0,
  });
  assert.equal(root.children[0], mesh);
  geometry.dispose();
  mesh.material.dispose();
});

test('only dense meshes use the finer cell size and every triangle is retained', () => {
  const root = new Group();
  const material = new MeshStandardMaterial();
  const makeGeometry = (positions) =>
    new BufferGeometry().setAttribute(
      'position',
      new Float32BufferAttribute(positions, 3),
    );
  const first = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  const second = [60, 0, 0, 61, 0, 0, 60, 1, 0];
  const third = [70, 0, 0, 71, 0, 0, 70, 1, 0];
  root.add(
    new Mesh(makeGeometry([...first, ...second]), material),
    new Mesh(makeGeometry([...first, ...second, ...third]), material),
  );

  const before = worldTriangles(root);
  assert.deepEqual(
    batchStaticWorld(root, {
      cellSize: 100,
      minTriangles: 1,
      dense: { cellSize: 50, minTriangles: 3 },
    }),
    { sourceMeshes: 2, batches: 1, pieces: 3 },
  );
  assert.deepEqual(worldTriangles(root), before);
  root.children[0].dispose();
  material.dispose();
});

test('hidden ancestry, mesh children and unsupported GPU attribute layouts retain their owners', () => {
  const root = new Group(),
    hidden = new Group();
  hidden.visible = false;
  root.add(hidden);
  const geometry = new BufferGeometry().setAttribute(
    'position',
    new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  );
  const material = new MeshStandardMaterial();
  const hiddenMesh = new Mesh(geometry, material);
  hidden.add(hiddenMesh);
  const parent = new Mesh(geometry, material),
    light = new PointLight();
  parent.add(light);
  root.add(parent);
  const half = geometry.clone();
  half.setAttribute(
    'half',
    new Float16BufferAttribute(new Uint16Array([0, 0, 0]), 1),
  );
  const halfMesh = new Mesh(half, material);
  root.add(halfMesh);
  const integer = geometry.clone(),
    ids = new Int16BufferAttribute([1, 2, 3], 1);
  ids.gpuType = IntType;
  integer.setAttribute('ids', ids);
  const integerMesh = new Mesh(integer, material);
  root.add(integerMesh);
  assert.deepEqual(batchStaticWorld(root, { minTriangles: 1 }), {
    sourceMeshes: 0,
    batches: 0,
    pieces: 0,
  });
  assert.equal(hiddenMesh.parent, hidden);
  assert.equal(light.parent, parent);
  assert.equal(
    halfMesh.geometry.attributes.half.isFloat16BufferAttribute,
    true,
  );
  assert.equal(integerMesh.geometry.attributes.ids.gpuType, IntType);
  geometry.dispose();
  half.dispose();
  integer.dispose();
  material.dispose();
  light.dispose();
});
