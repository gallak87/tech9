import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createSapAnchorCache } from './sap-anchors.js';

test('sap anchors hit real visible underside skins, skip empty AABB corners and reuse their cached queries', () => {
  const ship = new T.Group();
  ship.position.set(20, 4, -60);
  ship.rotation.set(0.2, 0.7, -0.1);
  const geometry = new T.BoxGeometry(1.4, 1, 5),
    material = new T.MeshStandardMaterial();
  const left = new T.Mesh(geometry, material),
    right = new T.Mesh(geometry, material);
  left.position.x = -1.8;
  right.position.x = 1.8;
  ship.add(left, right);
  const ghost = new T.Mesh(new T.BoxGeometry(10, 1, 10), material);
  ghost.userData.aoExclude = true;
  ghost.position.y = -2;
  ship.add(ghost);
  const bounds = { min: [-3.2, -0.5, -3.5], max: [3.2, 0.5, 3.5] };
  const cache = createSapAnchorCache();
  const points = cache.read(ship, bounds);
  assert.ok(
    points.length >= 6,
    'both real undersides provide attachment points',
  );
  for (const p of points) {
    assert.ok(
      Math.abs(p.x) >= 1.099 && Math.abs(p.x) <= 2.501,
      'never invent an anchor in the hollow center or outside a wing',
    );
    assert.ok(
      Math.abs(p.y + 0.488) < 1e-5,
      'attachment overlaps the actual underside by 12mm',
    );
    assert.ok(Math.abs(p.z) <= 2.501);
  }
  assert.equal(
    cache.read(ship, bounds),
    points,
    'unchanged visible hull reuses the one-time ray results',
  );
  right.visible = false;
  const changed = cache.read(ship, bounds);
  assert.ok(
    changed.every((p) => p.x < 0),
    'hidden LOD/parts do not supply drips',
  );
  geometry.dispose();
  ghost.geometry.dispose();
  material.dispose();
});
