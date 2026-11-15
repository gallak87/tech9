import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createEditorOwner } from './world-owner.js';
import { equalGeometry } from './geometry-reuse.js';

function make(previous, changed = false) {
  const owner = createEditorOwner('Regional fixture', true, {
    previous,
    regional: true,
  });
  const material = owner.material('Same registered material', {
    color: '#999999',
  });
  owner.block(
    'near',
    material,
    new T.Vector3(changed ? 20 : 0, 0, 0),
    new T.Vector3(1, 2, 3),
  );
  owner.block(
    'far',
    material,
    new T.Vector3(20000, 0, 0),
    new T.Vector3(1, 2, 3),
  );
  owner.solid(
    'unchanged terrain chunk',
    new T.PlaneGeometry(100, 100, 2, 2),
    material,
  );
  owner.finish();
  return owner;
}

test('regional owners borrow only exact geometry and spatial instance buffers without moving old meshes', () => {
  const before = make();
  const originals = [...before.group.children];
  before.finish();
  assert.deepEqual(before.group.children, originals, 'finish is idempotent');
  const incremental = make(before, true);
  assert.deepEqual(before.group.children, originals);
  assert.equal(incremental.incremental.reusedChunks, 2);
  assert.equal(incremental.incremental.rebuiltChunks, 1);
  const fresh = make(null, true);
  assert.equal(incremental.group.children.length, fresh.group.children.length);
  incremental.group.children.forEach((mesh, i) => {
    assert.equal(mesh.name, fresh.group.children[i].name);
    assert(equalGeometry(mesh.geometry, fresh.group.children[i].geometry));
    if (mesh.instanceMatrix)
      assert.deepEqual(
        mesh.instanceMatrix.array,
        fresh.group.children[i].instanceMatrix.array,
      );
  });
  const reused = incremental.group.children.find(
    (mesh) => mesh.isInstancedMesh && mesh.instanceMatrix.array[12] === 20000,
  );
  const original = originals.find(
    (mesh) => mesh.instanceMatrix === reused.instanceMatrix,
  );
  assert(original);
  let disposedGeometry = 0,
    disposedInstances = 0;
  reused.geometry.addEventListener('dispose', () => disposedGeometry++);
  original.addEventListener('dispose', () => disposedInstances++);
  before.dispose();
  assert.equal(disposedGeometry, 0);
  assert.equal(disposedInstances, 0);
  incremental.dispose();
  assert.equal(disposedGeometry, 1);
  assert.equal(disposedInstances, 1);
  incremental.dispose();
  assert.equal(disposedGeometry, 1);
  fresh.dispose();
});

test('same-sized but changed indexed geometry is rebuilt rather than borrowed', () => {
  const before = make();
  const after = createEditorOwner('Changed terrain', true, {
    previous: before,
    regional: true,
  });
  const material = after.material('Same registered material', {
    color: '#999999',
  });
  const geometry = new T.PlaneGeometry(100, 100, 2, 2);
  geometry.getAttribute('position').setY(0, 4);
  after.solid('unchanged terrain chunk', geometry, material);
  after.finish();
  assert.equal(after.incremental.reusedChunks, 0);
  assert.equal(after.incremental.rebuiltChunks, 1);
  before.dispose();
  after.dispose();
});

test('discarding a prepared replacement leaves the source buffers and instance lifetime intact', () => {
  const before = make(),
    pending = make(before);
  const source = before.group.children.find((mesh) => mesh.isInstancedMesh);
  const matrices = source.instanceMatrix.array.slice();
  let geometryDisposals = 0,
    instanceDisposals = 0;
  source.geometry.addEventListener('dispose', () => geometryDisposals++);
  source.addEventListener('dispose', () => instanceDisposals++);
  pending.dispose();
  assert.deepEqual(source.instanceMatrix.array, matrices);
  assert.equal(geometryDisposals, 0);
  assert.equal(instanceDisposals, 0);
  assert.equal(before.group.children.length, 3);
  before.dispose();
  assert.equal(geometryDisposals, 1);
  assert.equal(instanceDisposals, 1);
});
