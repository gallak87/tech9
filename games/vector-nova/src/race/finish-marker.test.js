import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import * as T from 'three';
import { createFinishMarker } from './finish-marker.js';

function straight({ closed = true, checkpoint = 0, finishDistance } = {}) {
  return {
    width: 12,
    length: 100,
    closed,
    finishDistance,
    checkpoints: [{ distance: checkpoint }],
    sample(distance) {
      if (!closed) assert.ok(distance >= 0 && distance <= 100);
      return {
        position: new T.Vector3(0, 0, distance),
        up: new T.Vector3(0, 1, 0),
        right: new T.Vector3(1, 0, 0),
      };
    },
  };
}

test('finish paint aligns with checkpoint zero, stays within the road and owns one draw', () => {
  const marker = createFinishMarker(straight({ checkpoint: 17 }));
  const mesh = marker.group.children[0];
  const box = new T.Box3().setFromObject(marker.group);
  assert.equal(marker.group.children.length, 1);
  assert.equal(marker.group.userData.finishDistance, 17);
  assert.ok(Math.abs(box.getCenter(new T.Vector3()).z - 17) < 1e-5);
  assert.ok(box.min.x > -6 && box.max.x < 6);
  assert.ok(Math.abs(box.min.y - 0.13) < 1e-5);
  assert.equal(mesh.material.vertexColors, true);
  assert.ok(mesh.geometry.getAttribute('position').count <= 512);
  const owner = new T.Group();
  owner.add(marker.group);
  let geometryDisposals = 0,
    materialDisposals = 0;
  mesh.geometry.addEventListener('dispose', () => geometryDisposals++);
  mesh.material.addEventListener('dispose', () => materialDisposals++);
  marker.dispose();
  marker.dispose();
  assert.equal(owner.children.length, 0);
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
});

test('banked markers sample surface corners without retaining borrowed frame vectors', () => {
  const track = straight();
  const frame = track.sample(0);
  track.sample = (s) => {
    const angle = s * 0.2;
    frame.position.set(0, s * 0.1, s);
    frame.right.set(Math.cos(angle), Math.sin(angle), 0);
    frame.up.set(-Math.sin(angle), Math.cos(angle), 0);
    return frame;
  };
  const marker = createFinishMarker(track, { width: 10, tileSize: 2 });
  const geometry = marker.group.children[0].geometry;
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  for (let i = 0; i < positions.count; i++) {
    const p = new T.Vector3().fromBufferAttribute(positions, i);
    const n = new T.Vector3().fromBufferAttribute(normals, i);
    const f = track.sample(p.z);
    const relative = p.clone().sub(f.position);
    assert.ok(Math.abs(relative.dot(f.up) - 0.13) < 1e-5);
    assert.ok(Math.abs(relative.dot(f.right)) <= 5.00001);
    assert.ok(n.distanceTo(f.up) < 1e-5);
  }
  marker.dispose();
});

test('open finishes use finishDistance and keep an endpoint stripe on the supported route', () => {
  for (const finishDistance of [0, 37, 100]) {
    const marker = createFinishMarker(
      straight({ closed: false, finishDistance }),
    );
    const box = new T.Box3().setFromObject(marker.group);
    assert.equal(marker.group.userData.finishDistance, finishDistance);
    assert.ok(box.min.z >= 0 && box.max.z <= 100);
    if (finishDistance === 37)
      assert.ok(Math.abs(box.getCenter(new T.Vector3()).z - 37) < 1e-5);
    else
      assert.equal(
        finishDistance === 0 ? box.min.z : box.max.z,
        finishDistance,
      );
    marker.dispose();
  }
});

test('every shipped circuit gets finite paint at its actual timing seam without loading a world', async () => {
  const root = new URL('../levels/', import.meta.url);
  let circuits = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const model = await import(new URL(`${entry.name}/track/model.js`, root));
    const factory = Object.entries(model).find(([name]) =>
      /^create.*Track$/.test(name),
    )?.[1];
    assert.equal(typeof factory, 'function', entry.name);
    const track = factory();
    const marker = createFinishMarker(track);
    try {
      const distance = track.checkpoints[0].distance ?? track.checkpoints[0].s;
      assert.equal(marker.group.userData.finishDistance, distance, entry.name);
      assert.ok(marker.group.userData.width < track.width, entry.name);
      const geometry = marker.group.children[0].geometry;
      for (const key of ['position', 'normal', 'color'])
        assert.ok(
          Array.from(geometry.getAttribute(key).array).every(Number.isFinite),
          `${entry.name} ${key}`,
        );
      // Both rows meet at the true seam, even when that seam changes banking.
      const vertex = new T.Vector3().fromBufferAttribute(
        geometry.getAttribute('position'),
        1,
      );
      const frame = track.sample(distance);
      const expected = frame.position
        .clone()
        .addScaledVector(frame.right, -marker.group.userData.width / 2)
        .addScaledVector(frame.up, marker.group.userData.height);
      assert.ok(vertex.distanceTo(expected) < 0.001, entry.name);
      circuits++;
    } finally {
      marker.dispose();
    }
  }
  assert.ok(circuits >= 12);
});
