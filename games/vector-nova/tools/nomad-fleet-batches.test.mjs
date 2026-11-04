import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import createLevel from '../src/levels/nomad/index.js';
import { createNomadEnvironment } from '../src/levels/nomad/environment.js';
import { createNomadFleetBatches } from '../src/levels/nomad/fleet-batches.js';
import {
  sampleCarrierMotion,
  NOMAD_MOTION_RULES,
} from '../src/levels/nomad/motion.js';
import kit from '../assets/levels/nomad/blender/carrier-kit-provenance.json' with { type: 'json' };

const anchors = kit.prototypes
  .find((part) => part.name === 'nomad_carrier')
  .anchors.filter((anchor) => anchor.kind === 'wheel');
const details = ['', '_mid', '_far'];
async function model(path = 'carrier-kit.glb') {
  const bytes = await readFile(
    new URL(`../public/assets/levels/nomad/${path}`, import.meta.url),
  );
  return (
    await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    )
  ).scene;
}
const source = await model();
source.traverse((mesh) => {
  if (mesh.isMesh)
    mesh.geometry.setAttribute(
      'industrialCoord',
      mesh.geometry.attributes.position.clone(),
    );
});
source.updateWorldMatrix(true, true);
const partsOf = (kind, level) => {
  const root = source.getObjectByName(`nomad_${kind}${details[level]}`);
  const parts = new Map();
  root.traverse((mesh) => {
    if (mesh.isMesh) parts.set(mesh.material, mesh);
  });
  return parts;
};
function expectedMatrix(carrier, time, kind, anchorIndex, mesh) {
  const position = carrier.origin
    .clone()
    .add(sampleCarrierMotion(carrier, time).translation);
  const matrix = new T.Matrix4().compose(
    position,
    carrier.quaternion,
    carrier.scale,
  );
  if (kind === 'wheel') {
    const angle =
      (NOMAD_MOTION_RULES.convoySpeed * time +
        sampleCarrierMotion(carrier, time).translation.z) /
      (24 * carrier.scale.x);
    matrix
      .multiply(
        new T.Matrix4()
          .makeScale(1, 1, carrier.scale.x / carrier.scale.z)
          .setPosition(
            new T.Vector3().fromArray(anchors[anchorIndex].position),
          ),
      )
      .multiply(new T.Matrix4().makeRotationX(angle));
    let root = mesh;
    while (!/^nomad_wheel(?:_mid|_far)?$/.test(root.name)) root = root.parent;
    matrix.multiply(
      root.matrixWorld.clone().invert().multiply(mesh.matrixWorld),
    );
  } else {
    let root = mesh;
    while (!/^nomad_carrier(?:_mid|_far)?$/.test(root.name)) root = root.parent;
    matrix.multiply(
      (root.parent?.matrixWorld ?? new T.Matrix4())
        .clone()
        .invert()
        .multiply(mesh.matrixWorld),
    );
  }
  return matrix;
}

test('fleet batches retain all authored LOD vertices, normals, finish coordinates, indices and materials', () => {
  const track = createLevel().createTrack(),
    fleet = createNomadFleetBatches({ track, source });
  try {
    assert.deepEqual(fleet.report, {
      batches: 10,
      hullInstances: 66,
      wheelInstances: 792,
      hullTriangles: [56092, 14300, 3554],
      wheelTriangles: [4896, 905, 240],
    });
    const camera = new T.PerspectiveCamera();
    for (const [level, distance] of [0, 2200, 6000].entries()) {
      camera.position
        .copy(track.carriers[0].origin)
        .add(new T.Vector3(distance, 0, 0));
      camera.updateMatrixWorld();
      fleet.update({ camera });
      for (const batch of fleet.group.children) {
        assert.equal(batch.perObjectFrustumCulled, true);
        assert.equal(batch.sortObjects, false);
        assert.equal(batch.castShadow, true);
        assert.equal(batch.receiveShadow, true);
        const original = partsOf(batch.userData.nomadFleetKind, level).get(
          batch.material,
        );
        assert.ok(original, batch.name);
        const range = batch.getGeometryRangeAt(batch.getGeometryIdAt(0));
        assert.equal(
          range.vertexCount,
          original.geometry.attributes.position.count,
        );
        assert.equal(range.indexCount, original.geometry.index.count);
        for (const [name, attribute] of Object.entries(
          original.geometry.attributes,
        )) {
          const packed = batch.geometry.attributes[name];
          assert.equal(packed.itemSize, attribute.itemSize);
          assert.equal(packed.normalized, attribute.normalized);
          for (let vertex = 0; vertex < attribute.count; vertex++)
            for (let component = 0; component < attribute.itemSize; component++)
              assert.equal(
                packed.getComponent(range.vertexStart + vertex, component),
                attribute.getComponent(vertex, component),
                `${batch.name}/${level}/${name}/${vertex}/${component}`,
              );
        }
        for (let index = 0; index < range.indexCount; index++)
          assert.equal(
            batch.geometry.index.getX(range.indexStart + index) -
              range.vertexStart,
            original.geometry.index.getX(index),
          );
        if (
          !original.geometry.hasAttribute('uv') &&
          batch.geometry.hasAttribute('uv')
        )
          for (let vertex = 0; vertex < range.vertexCount; vertex++)
            assert.equal(
              batch.geometry.attributes.uv.getX(range.vertexStart + vertex) +
                batch.geometry.attributes.uv.getY(range.vertexStart + vertex),
              0,
            );
      }
    }
    const versions = fleet.group.children.map(
      (batch) => batch._matricesTexture.version,
    );
    fleet.update({ camera });
    assert.deepEqual(
      fleet.group.children.map((batch) => batch._matricesTexture.version),
      versions,
      'a paused pose and stable LOD do not re-upload matrix textures',
    );
    track.presentationTime += 0.1;
    fleet.update({ camera });
    assert.ok(
      fleet.group.children.every(
        (batch, index) => batch._matricesTexture.version > versions[index],
      ),
      'real carrier and wheel motion immediately refreshes every material batch',
    );
  } finally {
    fleet.dispose();
  }
});

test('all carrier/wheel matrices, world vertices and bounds agree with the former hierarchy at every LOD and motion phase', (t) => {
  const track = createLevel().createTrack(),
    fleet = createNomadFleetBatches({ track, source });
  const camera = new T.PerspectiveCamera(),
    actual = new T.Matrix4();
  let maxError = 0,
    matrices = 0,
    vertices = 0;
  try {
    for (const time of [0, 9.5, 27, 81.125]) {
      track.presentationTime = time;
      for (const [carrierIndex, carrier] of track.carriers.entries()) {
        const position = carrier.origin
          .clone()
          .add(sampleCarrierMotion(carrier, time).translation);
        for (const [level, distance] of [0, 2200, 6000].entries()) {
          camera.position.copy(position).add(new T.Vector3(distance, 0, 0));
          camera.updateMatrixWorld();
          fleet.update({ camera });
          for (const batch of fleet.group.children) {
            const kind = batch.userData.nomadFleetKind;
            const original = partsOf(kind, level).get(batch.material);
            const copies = kind === 'wheel' ? anchors.length : 1;
            for (let anchor = 0; anchor < copies; anchor++) {
              const instance = carrierIndex * copies + anchor;
              const range = batch.getGeometryRangeAt(
                batch.getGeometryIdAt(instance),
              );
              assert.equal(
                range.indexCount,
                original.geometry.index.count,
                `${carrier.id}/${kind}/${level}`,
              );
              batch.getMatrixAt(instance, actual);
              const expected = expectedMatrix(
                carrier,
                time,
                kind,
                anchor,
                original,
              );
              for (let index = 0; index < 16; index++)
                assert.ok(
                  Math.abs(actual.elements[index] - expected.elements[index]) <
                    0.001,
                  `${carrier.id}/${kind}/${anchor}: matrix component ${index}`,
                );
              matrices++;
              const attribute = original.geometry.attributes.position;
              // Every actual source vertex for the first carrier and wheel;
              // the remaining placements use their exact matrices and extrema.
              const stride =
                carrierIndex === 0 && anchor === 0
                  ? 1
                  : Math.max(1, Math.floor(attribute.count / 24));
              for (let vertex = 0; vertex < attribute.count; vertex += stride) {
                const point = new T.Vector3().fromBufferAttribute(
                  attribute,
                  vertex,
                );
                const expectedPoint = point.clone().applyMatrix4(expected);
                const actualPoint = point.applyMatrix4(actual);
                maxError = Math.max(
                  maxError,
                  expectedPoint.distanceTo(actualPoint),
                );
                vertices++;
                assert.ok(
                  batch.boundingBox.containsPoint(actualPoint),
                  `${batch.name}: bounded full motion`,
                );
                assert.ok(
                  batch.boundingSphere.containsPoint(actualPoint),
                  `${batch.name}: bounded all wheel angles`,
                );
              }
              if (kind === 'wheel') {
                const centre = new T.Vector3().applyMatrix4(actual);
                const ry = new T.Vector3(0, 24, 0)
                  .applyMatrix4(actual)
                  .distanceTo(centre);
                const rz = new T.Vector3(0, 0, 24)
                  .applyMatrix4(actual)
                  .distanceTo(centre);
                assert.ok(
                  Math.abs(ry - rz) < 0.00001,
                  `${carrier.id}: rotating tyres stay circular`,
                );
              }
            }
          }
        }
      }
    }
    assert.ok(maxError < 0.0015, `maximum world error ${maxError}`);
    t.diagnostic(
      `${matrices} exact hierarchy matrices, ${vertices} vertices, maximum float32 world error ${maxError.toFixed(7)}m`,
    );
  } finally {
    fleet.dispose();
  }
});

test('LOD transitions match THREE.LOD including camera zoom and a transformed parent', () => {
  const track = createLevel().createTrack(),
    carrier = track.carriers[0];
  const fleet = createNomadFleetBatches({ track, source, carriers: [carrier] });
  const reference = new T.Group(),
    root = new T.Object3D(),
    lod = new T.LOD();
  fleet.group.position.set(71, -43, 102);
  fleet.group.rotation.y = 0.2;
  fleet.group.scale.set(1.02, 0.99, 1.01);
  reference.copy(fleet.group, false);
  reference.add(root);
  root.add(lod);
  for (const distance of [0, 1800, 4500]) lod.addLevel(new T.Group(), distance);
  const camera = new T.PerspectiveCamera();
  try {
    track.presentationTime = 19;
    root.position
      .copy(carrier.origin)
      .add(sampleCarrierMotion(carrier, 19).translation);
    root.quaternion.copy(carrier.quaternion);
    root.scale.copy(carrier.scale);
    reference.updateWorldMatrix(true, true);
    const origin = new T.Vector3().setFromMatrixPosition(lod.matrixWorld);
    for (const zoom of [1, 2])
      for (const distance of [
        0, 1799.99, 1800, 1800.01, 4499.99, 4500, 4500.01, 7000, 1700,
      ]) {
        camera.zoom = zoom;
        camera.position.copy(origin).add(new T.Vector3(distance * zoom, 0, 0));
        camera.updateMatrixWorld();
        lod.update(camera);
        fleet.update({ camera });
        const expectedLevel = lod.getCurrentLevel();
        for (const batch of fleet.group.children) {
          const original = partsOf(
            batch.userData.nomadFleetKind,
            expectedLevel,
          ).get(batch.material);
          assert.equal(
            batch.getGeometryRangeAt(batch.getGeometryIdAt(0)).indexCount,
            original.geometry.index.count,
          );
        }
      }
  } finally {
    fleet.dispose();
  }
});

test('batch disposal is idempotent, releases owned native resources once and never releases borrowed sources or finishes', () => {
  const track = createLevel().createTrack(),
    borrowed = new Map(),
    released = new Map();
  const watch = (object, map) =>
    object.addEventListener('dispose', () =>
      map.set(object, (map.get(object) ?? 0) + 1),
    );
  source.traverse((mesh) => {
    if (mesh.isMesh) {
      watch(mesh.geometry, borrowed);
      watch(mesh.material, borrowed);
    }
  });
  const fleet = createNomadFleetBatches({ track, source });
  for (const batch of fleet.group.children) {
    watch(batch, released);
    watch(batch.geometry, released);
    watch(batch._matricesTexture, released);
    watch(batch._indirectTexture, released);
  }
  const expected = fleet.report.batches * 4;
  fleet.dispose();
  fleet.dispose();
  fleet.update();
  assert.equal(fleet.group.children.length, 0);
  assert.equal(borrowed.size, 0);
  assert.equal(released.size, expected);
  assert.ok([...released.values()].every((count) => count === 1));
  const invalid = source.clone(true);
  invalid.getObjectByName('nomad_wheel_far').removeFromParent();
  const events = [],
    originalDispose = T.BatchedMesh.prototype.dispose;
  T.BatchedMesh.prototype.dispose = function () {
    events.push(this);
    return originalDispose.call(this);
  };
  try {
    assert.throws(
      () => createNomadFleetBatches({ track, source: invalid }),
      /missing a detail tier/,
    );
  } finally {
    T.BatchedMesh.prototype.dispose = originalDispose;
  }
  assert.equal(
    events.length,
    6,
    'already acquired hull batches unwind after a wheel-tier error',
  );
  assert.equal(borrowed.size, 0);
});

test('environment integration retains carrier attachments and cleans up normal, interrupted and failed loads', async () => {
  const track = createLevel().createTrack();
  const scenes = await Promise.all([model(), model('route-supports.glb')]);
  const environment = createNomadEnvironment({
    track,
    loadAsset: async (url) => ({
      scene: scenes[/route-supports/.test(url) ? 1 : 0],
    }),
  });
  await environment.ready;
  try {
    let batches = 0,
      lods = 0;
    environment.group.traverse((object) => {
      if (object.userData.nomadFleetKind) batches++;
      if (object.isLOD) lods++;
    });
    assert.equal(batches, 10);
    assert.equal(lods, 0);
    track.presentationTime = 17;
    environment.update();
    for (const carrier of track.carriers) {
      const root = environment.carrierRoots.get(carrier.id);
      assert.ok(
        root.position.distanceTo(
          carrier.origin
            .clone()
            .add(sampleCarrierMotion(carrier, 17).translation),
        ) < 1e-10,
      );
      assert.equal(
        root.children.filter((child) => child.name === 'nomad_freight').length,
        2,
      );
    }
  } finally {
    environment.dispose();
    environment.dispose();
  }
  const late = await Promise.all([model(), model('route-supports.glb')]),
    pending = [],
    released = new Map();
  for (const scene of late)
    scene.traverse((mesh) => {
      if (!mesh.isMesh) return;
      for (const resource of [mesh.geometry, mesh.material])
        if (!released.has(resource)) {
          released.set(resource, 0);
          resource.addEventListener('dispose', () =>
            released.set(resource, released.get(resource) + 1),
          );
        }
    });
  const interrupted = createNomadEnvironment({
    track,
    loadAsset: () => new Promise((resolve) => pending.push(resolve)),
  });
  await Promise.resolve();
  assert.equal(pending.length, 2);
  interrupted.dispose();
  pending.forEach((resolve, index) => resolve({ scene: late[index] }));
  await interrupted.ready;
  interrupted.dispose();
  assert.ok(
    [...released.values()].every((count) => count === 1),
    'late source assets are released once',
  );
  const failed = createNomadEnvironment({
    track,
    loadAsset: async () => {
      throw new Error('fixture load failure');
    },
  });
  await assert.rejects(failed.ready, /could not load/);
  failed.dispose();
});
