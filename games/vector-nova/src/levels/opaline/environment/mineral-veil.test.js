import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createOpalineTrack } from '../track/model.js';
import { createMineralVeilGeometry } from './mineral-veil.js';

function pointOnSurface(surface, u, v) {
  const uv = surface.attributes.uv,
    position = surface.attributes.position,
    normal = surface.attributes.normal;
  const target = new T.Vector3(u, v, 0),
    triangle = new T.Triangle(),
    bary = new T.Vector3();
  for (let i = 0; i < surface.index.count; i += 3) {
    const ids = [
      surface.index.getX(i),
      surface.index.getX(i + 1),
      surface.index.getX(i + 2),
    ];
    const coords = ids.map((id) => new T.Vector3(uv.getX(id), uv.getY(id), 0));
    triangle.set(...coords);
    triangle.getBarycoord(target, bary);
    if (bary.x >= -1e-7 && bary.y >= -1e-7 && bary.z >= -1e-7) {
      const p = new T.Vector3(),
        n = new T.Vector3();
      ids.forEach((id, j) => {
        p.addScaledVector(
          new T.Vector3().fromBufferAttribute(position, id),
          bary.getComponent(j),
        );
        n.addScaledVector(
          new T.Vector3().fromBufferAttribute(normal, id),
          bary.getComponent(j),
        );
      });
      return { p, n: n.normalize() };
    }
  }
  throw new Error('Surface sample missing');
}

test('mineral veil is bounded closed shell geometry with four physically open windows', () => {
  const track = createOpalineTrack(),
    span = track.landmarks.veil;
  const { surface, crust } = createMineralVeilGeometry(
    track,
    span.start,
    span.end,
  );
  const material = new T.MeshBasicMaterial({ side: T.DoubleSide });
  try {
    assert.ok(crust.index.count / 3 < 50000);
    for (const geometry of [surface, crust]) {
      assert.ok(
        Array.from(geometry.attributes.position.array).every(Number.isFinite),
      );
      assert.ok(
        Array.from(geometry.attributes.normal.array).every(Number.isFinite),
      );
      assert.ok(geometry.boundingSphere.radius > 0);
    }
    const allowed = surface.boundingBox.clone().expandByScalar(2.5);
    assert.ok(
      allowed.containsBox(crust.boundingBox),
      'shell remains within its 2.4m maximum offset',
    );
    const edges = new Map();
    for (let i = 0; i < crust.index.count; i += 3) {
      const t = [
        crust.index.getX(i),
        crust.index.getX(i + 1),
        crust.index.getX(i + 2),
      ];
      for (let j = 0; j < 3; j++) {
        const a = t[j],
          b = t[(j + 1) % 3],
          key = a < b ? `${a}:${b}` : `${b}:${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    assert.ok(
      [...edges.values()].every((count) => count === 2),
      'every shell edge has exactly two faces',
    );
    const mesh = new T.Mesh(crust, material),
      ray = new T.Raycaster();
    const hitAt = (u, v) => {
      const { p, n } = pointOnSurface(surface, u, v);
      ray.set(p.clone().addScaledVector(n, 6), n.clone().negate());
      ray.far = 12;
      return ray.intersectObject(mesh).length;
    };
    for (const [u, v] of [
      [0.4, 0.14],
      [0.57, 0.37],
      [0.4, 0.6],
      [0.57, 0.84],
    ])
      assert.equal(hitAt(u, v), 0, 'window has no crust surface');
    assert.ok(hitAt(0.08, 0.3) > 0, 'surrounding crust remains solid');
  } finally {
    surface.dispose();
    crust.dispose();
    material.dispose();
  }
});
