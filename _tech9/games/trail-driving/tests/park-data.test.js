import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bounds,
  ROUTES,
  height,
  surface,
  colliders,
  placements,
  trailSample,
} from '../src/park/parkData.js';

test('three connected routes have complete directional gates and distinct surfaces', () => {
  assert.equal(ROUTES.length, 3);
  const materials = new Set();
  for (const route of ROUTES) {
    assert.ok(
      route.length > 1100 && route.length < 1800,
      `${route.id} route duration scale`,
    );
    assert.ok(route.gates.length > 14);
    const first = route.gates[0];
    assert.ok(
      Math.abs(
        Math.hypot(first.x - route.spawn.x, first.z - route.spawn.z) - 8,
      ) < 1e-6,
    );
    assert.ok(
      (first.x - route.spawn.x) * Math.sin(first.heading) -
        (first.z - route.spawn.z) * Math.cos(first.heading) >
        7.99,
    );
    for (const point of route.points) {
      assert.ok(point.x > bounds.minX + 10 && point.x < bounds.maxX - 10);
      assert.ok(point.z > bounds.minZ + 10 && point.z < bounds.maxZ - 10);
      assert.ok(trailSample(point.x, point.z).distance < 0.001);
      assert.notEqual(surface(point.x, point.z).kind, 'rough');
      materials.add(surface(point.x, point.z).kind);
    }
    for (let i = 1; i < route.gates.length; i++) {
      const a = route.gates[i - 1],
        b = route.gates[i];
      const gap = Math.hypot(b.x - a.x, b.z - a.z);
      assert.ok(gap > 35 && gap < 85, `${route.id} gate ${i} gap ${gap}`);
      assert.ok(Number.isFinite(b.heading));
      assert.equal(b.width, 15);
    }
    for (const times of Object.values(route.medals))
      assert.ok(times[0] < times[1] && times[1] < times[2]);
  }
  assert.deepEqual([...materials].sort(), ['gravel', 'trail']);
  assert.equal(surface(285, 285).kind, 'rough');
});

test('shared terrain is finite, continuous and traversable along all routes', () => {
  let min = Infinity,
    max = -Infinity,
    maxSlope = 0;
  for (let x = -295; x < 295; x += 4)
    for (let z = -295; z < 295; z += 4) {
      const y = height(x, z);
      assert.ok(Number.isFinite(y));
      min = Math.min(min, y);
      max = Math.max(max, y);
      maxSlope = Math.max(
        maxSlope,
        Math.hypot(
          (height(x + 0.25, z) - height(x - 0.25, z)) / 0.5,
          (height(x, z + 0.25) - height(x, z - 0.25)) / 0.5,
        ),
      );
    }
  assert.ok(max - min > 25, 'drivable landscape has meaningful elevation');
  assert.ok(maxSlope < 0.7, `maximum surface gradient ${maxSlope}`);
  for (const route of ROUTES)
    for (const { x, z } of route.points) {
      assert.ok(
        Math.abs(height(x + 0.00001, z) - height(x - 0.00001, z)) < 0.0001,
      );
      assert.ok(height(x, z) > bounds.minY && height(x, z) < bounds.maxY);
    }
});

test('render placements and substantial collision solids share coordinates and leave routes clear', () => {
  assert.ok(placements.length > 1000);
  assert.equal(new Set(colliders.map((c) => c.id)).size, colliders.length);
  for (const placement of placements) {
    const collider = colliders.find((c) => c.id === placement.id);
    assert.equal(collider.x, placement.x);
    assert.equal(collider.z, placement.z);
    assert.equal(collider.radius, placement.radius);
    assert.ok(
      trailSample(placement.x, placement.z).distance > placement.radius + 6.8,
      placement.id,
    );
  }
  for (const spawn of [...ROUTES.map((r) => r.spawn), { x: 0, z: 246 }])
    for (const c of colliders) {
      assert.ok(
        Math.hypot(spawn.x - c.x, spawn.z - c.z) > c.radius + 2.5,
        `${c.id} blocks a spawn`,
      );
    }
  assert.ok(colliders.some((c) => c.id === 'ranger-kiosk'));
  assert.ok(colliders.some((c) => c.id.startsWith('lookout-post')));
});
