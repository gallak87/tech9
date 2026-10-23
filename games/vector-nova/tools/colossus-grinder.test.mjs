import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import createLevel from '../src/levels/colossus/index.js';
import { createColossusGrinders } from '../src/levels/colossus/environment/grinders.js';
import { crossfeedBounds } from '../src/levels/colossus/mechanics.js';
import { collectRoadSurfaces } from '../src/pickups/device-mount.js';

const track = createLevel({ shape: true }).createTrack();
const grinderMeshes = (owner) => {
  const meshes = [];
  owner.group.traverse((object) => {
    if (object.userData.grinderSurface) meshes.push(object);
  });
  return meshes;
};

// A zero-scale hidden instance generated NaN normals and blackened the entire
// HDR frame. Returned cutting blocks must be omitted from the draw instead.
test('grinder travel submits only finite, invertible active instances', () => {
  const owner = createColossusGrinders({ track, shape: true });
  const meshes = grinderMeshes(owner);
  const matrix = new T.Matrix4();
  try {
    assert.equal(meshes.length, track.belts.length);
    for (const time of [
      0, 0.001, 0.07, 0.137, 0.44, 0.49, 0.777, 1.53, 6.8, 23.2, -0.1,
    ]) {
      owner.update({ time });
      for (const mesh of meshes) {
        assert.ok(mesh.count > 0 && mesh.count < mesh.instanceMatrix.count);
        for (let index = 0; index < mesh.count; index++) {
          mesh.getMatrixAt(index, matrix);
          assert.ok(matrix.elements.every(Number.isFinite));
          assert.ok(
            matrix.determinant() > 1e-5,
            'live normal transforms must stay invertible',
          );
        }
      }
    }
  } finally {
    owner.dispose();
  }
});

test('raised grinder tools stay on the declared moving half through their return', () => {
  const owner = createColossusGrinders({ track, shape: true });
  const meshes = grinderMeshes(owner);
  const matrix = new T.Matrix4();
  try {
    for (const time of [0, 0.137, 0.777, 1.53, 8.39]) {
      owner.update({ time });
      meshes.forEach((mesh, beltIndex) => {
        const belt = track.belts[beltIndex];
        const { min, max } = crossfeedBounds(belt);
        const coordinates = mesh.userData.grinderCoordinates;
        mesh.geometry.computeBoundingBox();
        assert.ok(
          mesh.geometry.boundingBox.max.y < 0.65,
          'cutting lips stay below nominal hover height',
        );
        for (let index = 0; index < mesh.count; index++) {
          mesh.getMatrixAt(index, matrix);
          const distance = coordinates[index * 2];
          const lateral = coordinates[index * 2 + 1];
          const e = matrix.elements;
          const halfWidth = 1.55 * Math.hypot(e[0], e[1], e[2]);
          assert.ok(distance > belt.start && distance < belt.end);
          assert.ok(
            lateral - halfWidth >= min + 0.73,
            'tooth must clear the quiet-side return slot',
          );
          assert.ok(
            lateral + halfWidth <= max - 0.73,
            'tooth must clear the outer return slot',
          );
        }
      });
    }
  } finally {
    owner.dispose();
  }
});

test('grinder shape mode borrows no finish and resources dispose once', () => {
  for (const shape of [true, false]) {
    const bound = [];
    let finishDisposals = 0;
    const finish = {
      bind(material, kind) {
        bound.push([material.name, kind]);
      },
      dispose() {
        finishDisposals++;
      },
    };
    const owner = createColossusGrinders({ track, shape, finish });
    const meshes = grinderMeshes(owner);
    const geometry = meshes[0].geometry;
    const [cast, steel] = meshes[0].material;
    const disposed = { geometry: 0, cast: 0, steel: 0 };
    geometry.addEventListener('dispose', () => disposed.geometry++);
    cast.addEventListener('dispose', () => disposed.cast++);
    steel.addEventListener('dispose', () => disposed.steel++);
    assert.deepEqual(
      bound.map(([, kind]) => kind),
      shape ? [] : ['cast', 'steel'],
    );
    assert.ok(cast.isMeshStandardMaterial && steel.isMeshStandardMaterial);
    assert.equal(cast.map, null);
    assert.equal(steel.map, null);
    owner.dispose();
    owner.dispose();
    owner.update({ time: 2 });
    assert.equal(owner.group.children.length, 0);
    assert.deepEqual(disposed, { geometry: 1, cast: 1, steel: 1 });
    assert.equal(
      finishDisposals,
      0,
      'the road owns the borrowed generated finish',
    );
  }
});

// This late row of the first belt straddles a change in the rendered triangle
// plane. The whole cast root must meet or enter the sheet on both sides.
test('grinder cast roots remain seated across the observed bank-plane junction', () => {
  const owner = createColossusGrinders({ track, shape: true });
  const road = createLevel({ shape: true }).createRoad({ track });
  road.group.updateMatrixWorld(true);
  const surfaces = collectRoadSurfaces(road.group);
  const mesh = grinderMeshes(owner)[0];
  const distance = track.belts[0].start + 4 + 22 * 5.8;
  const matrix = new T.Matrix4();
  const point = new T.Vector3();
  const up = track.sample(distance).up;
  const ray = new T.Raycaster();
  let checked = 0;
  try {
    owner.update({ time: 0 });
    mesh.geometry.computeBoundingBox();
    const rootHeight = mesh.geometry.boundingBox.min.y;
    for (let i = 0; i < mesh.count; i++) {
      const coordinates = mesh.userData.grinderCoordinates;
      if (
        Math.abs(coordinates[i * 2] - distance) > 0.01 ||
        Math.abs(coordinates[i * 2 + 1] - 25.35) > 0.01
      )
        continue;
      mesh.getMatrixAt(i, matrix);
      for (const [x, z] of [
        [-1.4, -1.8],
        [-1.4, 1.8],
        [1.4, -1.8],
        [1.4, 1.8],
      ]) {
        point.set(x, rootHeight, z).applyMatrix4(matrix);
        ray.set(point.clone().addScaledVector(up, 2), up.clone().negate());
        ray.far = 4;
        const hit = ray.intersectObjects(surfaces, false)[0];
        assert.ok(hit, 'cast root must be backed by a rendered working sheet');
        assert.ok(
          hit.distance - 2 < 0.025,
          'cast root must meet or enter the steel: ' +
            JSON.stringify({ x, z, gap: hit.distance - 2, rootHeight }),
        );
        checked++;
      }
    }
    assert.equal(checked, 4, 'the observed junction remains covered');
  } finally {
    owner.dispose();
    road.dispose();
  }
});
