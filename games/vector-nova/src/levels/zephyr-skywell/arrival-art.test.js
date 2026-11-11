import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSkywellArrivalArt } from './arrival-art.js';
import { createSkywellTrack } from './track/model.js';

test('one 70 m beacon design retains its wide fit at every banked receiver', async (t) => {
  const track = createSkywellTrack(),
    sources = new Map(),
    loadedURLs = [],
    resources = new Map();
  const art = await createSkywellArrivalArt({
    track,
    jumpIds: track.jumps.map((jump) => jump.id),
    loadAsset: async (url) => {
      loadedURLs.push(url);
      const data = await readFile(
        new URL(`../../../public${url}`, import.meta.url),
      );
      const asset = await new GLTFLoader().parseAsync(
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
        '',
      );
      asset.scene.updateWorldMatrix(true, true);
      const bounds = new T.Box3().setFromObject(asset.scene, true);
      asset.scene.traverse((mesh) => {
        if (!mesh.isMesh) return;
        sources.set(mesh.geometry, {
          matrix: mesh.matrixWorld.clone(),
          bounds,
        });
        for (const resource of [mesh.geometry, ...[mesh.material].flat()]) {
          if (resources.has(resource)) continue;
          resources.set(resource, 0);
          resource.addEventListener('dispose', () =>
            resources.set(resource, resources.get(resource) + 1),
          );
        }
      });
      return asset;
    },
  });
  t.after(() => art.dispose());
  assert.deepEqual(loadedURLs, [
    '/assets/levels/launchworks/arrival-beacon.glb',
  ]);
  assert.equal(
    sources.size,
    4,
    'all receivers borrow the same four-role beacon asset',
  );
  const canonicalBounds = sources.values().next().value.bounds;
  assert.ok(Math.abs(canonicalBounds.max.y - 70) < 0.001);
  assert.ok(
    Math.abs(canonicalBounds.max.x - canonicalBounds.min.x - 10) < 0.001,
  );
  art.group.updateWorldMatrix(true, true);
  const extents = new Map(),
    matrix = new T.Matrix4(),
    fit = new T.Matrix4(),
    position = new T.Vector3(),
    quaternion = new T.Quaternion(),
    scale = new T.Vector3(),
    point = new T.Vector3();
  let instances = 0;
  art.group.traverse((mesh) => {
    if (!mesh.isMesh) return;
    assert.equal(mesh.isInstancedMesh, true, 'beacons retain spatial batching');
    const jump = track.jumps.find(
      (item) => item.id === mesh.userData.receiverId,
    );
    assert.ok(jump, 'each draw retains its receiver identity');
    const frame = track.sample(jump.landingStart + 15),
      expectedOffset =
        jump === track.jumps[0] ? 109 : jump === track.jumps[1] ? 101 : 91;
    const source = sources.get(mesh.geometry);
    for (let instance = 0; instance < mesh.count; instance++) {
      instances++;
      mesh.getMatrixAt(instance, matrix);
      matrix.premultiply(mesh.matrixWorld);
      fit.copy(matrix).multiply(source.matrix.clone().invert());
      fit.decompose(position, quaternion, scale);
      quaternion.normalize();
      position.sub(frame.position);
      const lateral = position.dot(frame.right),
        side = Math.sign(lateral),
        key = `${jump.id}:${side}`;
      assert.ok(
        Math.abs(lateral - side * expectedOffset) < 0.001,
        'each pillar is another 60 m outboard of its original fit',
      );
      assert.ok(
        Math.abs(position.dot(frame.tangent)) < 0.001,
        'forward fit is unchanged',
      );
      assert.ok(
        Math.abs(position.dot(frame.up)) < 0.001,
        'the canonical beacon origin stays on the road plane',
      );
      assert.ok(
        quaternion.angleTo(frame.quaternion) < 0.00001,
        'road-aligned rotation is unchanged',
      );
      assert.ok(
        scale.distanceTo(new T.Vector3(1, 1, 1)) < 0.00001,
        'every pair uses the canonical asset at its authored size',
      );
      const vertices = mesh.geometry.attributes.position;
      const extent = extents.get(key) ?? {
        highest: -Infinity,
        lowest: Infinity,
        clearance: Infinity,
        source: source.bounds,
      };
      for (let vertex = 0; vertex < vertices.count; vertex++) {
        point
          .fromBufferAttribute(vertices, vertex)
          .applyMatrix4(matrix)
          .sub(frame.position);
        const height = point.dot(frame.up);
        extent.highest = Math.max(extent.highest, height);
        extent.lowest = Math.min(extent.lowest, height);
        extent.clearance = Math.min(
          extent.clearance,
          Math.abs(point.dot(frame.right)) - track.width / 2,
        );
      }
      extents.set(key, extent);
    }
  });
  assert.equal(
    instances,
    40,
    'five intact pairs retain all four material roles',
  );
  assert.equal(extents.size, 10);
  for (const [receiver, extent] of extents) {
    assert.ok(
      Math.abs(extent.highest - 70) < 0.001,
      `${receiver}: the actual tip is 70 m above the roadway`,
    );
    assert.ok(
      Math.abs(extent.lowest - extent.source.min.y) < 0.001,
      `${receiver}: the actual base retains the canonical fit`,
    );
    assert.ok(
      extent.clearance > 60,
      `${receiver}: actual geometry has ${extent.clearance} m of road-edge clearance`,
    );
  }
  art.dispose();
  art.dispose();
  assert.equal(art.group.children.length, 0);
  for (const count of resources.values())
    assert.equal(count, 1, 'private source resources release exactly once');
});
