import test from 'node:test';
import assert from 'node:assert/strict';
import {
  placementCircle,
  placementCapsuleChain,
  canStandAt,
  moveGrounded,
} from '../src/placementCollisions.js';

const matrix = (x = 0, z = 0, angle = 0, sx = 1, sz = sx) => ({
  elements: [
    Math.cos(angle) * sx,
    0,
    -Math.sin(angle) * sx,
    0,
    0,
    1,
    0,
    0,
    Math.sin(angle) * sz,
    0,
    Math.cos(angle) * sz,
    0,
    x,
    0,
    z,
    1,
  ],
});
const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };

test('circle uses rendered translation, rotation and largest horizontal scale', () => {
  const p = {
    id: 'boulder',
    kind: 'solid',
    matrix: matrix(10, -3, Math.PI / 2, 2, 3),
  };
  const circle = placementCircle(p, { radius: 0.5, center: [1, 0, 0] });
  assert.deepEqual(circle, {
    id: 'boulder',
    kind: 'solid',
    x: 10,
    z: -5,
    radius: 1.5,
  });
  assert.ok(Object.isFrozen(circle));
});

test('capsule chain transforms both endpoints and conservatively covers its full centerline', () => {
  const placement = {
    id: 'beam',
    kind: 'solid',
    matrix: matrix(2, 3, Math.PI / 3, 1.2),
  };
  const circles = placementCapsuleChain(placement, {
    start: [0, 0, 0],
    end: [5.44, 0, 0],
    radius: 0.34,
  });
  assert.ok(Object.isFrozen(circles));
  assert.deepEqual([circles[0].x, circles[0].z], [2, 3]);
  const last = circles.at(-1);
  assert.ok(Math.abs(last.x - (2 + Math.cos(Math.PI / 3) * 5.44 * 1.2)) < 1e-9);
  assert.ok(Math.abs(last.z - (3 - Math.sin(Math.PI / 3) * 5.44 * 1.2)) < 1e-9);
  for (let i = 0; i <= 500; i++) {
    const along = (5.44 * 1.2 * i) / 500;
    const x =
      2 + Math.cos(Math.PI / 3) * along + Math.sin(Math.PI / 3) * 0.34 * 1.2;
    const z =
      3 - Math.sin(Math.PI / 3) * along + Math.cos(Math.PI / 3) * 0.34 * 1.2;
    assert.ok(
      circles.some((c) => Math.hypot(x - c.x, z - c.z) <= c.radius + 1e-9),
    );
  }
  assert.equal(new Set(circles.map((c) => c.id)).size, circles.length);
});

test('invalid placement dimensions fail at authoring time', () => {
  assert.throws(() => placementCircle({ matrix: [] }, { radius: 1 }), /matrix/);
  assert.throws(
    () => placementCircle({ matrix: matrix() }, { radius: -1 }),
    /radius/,
  );
  assert.throws(
    () =>
      placementCapsuleChain(
        { matrix: matrix() },
        { end: [1, 0, 0], radius: 1, spacing: 0 },
      ),
    /spacing/,
  );
});

test('disc checks account for feet at bounds and an authored shoreline', () => {
  const options = {
    bounds,
    playerRadius: 0.3,
    isWalkable: (x, z) => x + z < 2,
  };
  assert.equal(canStandAt(0, 0, options), true);
  assert.equal(canStandAt(0.9, 0.9, options), false);
  assert.equal(canStandAt(-9.8, 0, options), false);
  assert.equal(canStandAt(NaN, 0, options), false);
});

test('substeps stop at thin obstacles and slide along a blocked axis', () => {
  const options = {
    bounds,
    playerRadius: 0.3,
    colliders: [{ x: 0, z: -2, radius: 0.1 }],
  };
  const position = { x: 0, z: 0 };
  const result = moveGrounded(position, 0, -4, options);
  assert.ok(result.z > -1.61);
  assert.deepEqual(position, { x: 0, z: 0 });
  const shore = { bounds, playerRadius: 0.3, isWalkable: (x) => x <= 1 };
  const slide = moveGrounded({ x: 0.6, z: 0 }, 1, 1, shore);
  assert.ok(slide.x <= 0.7 + 1e-9);
  assert.ok(slide.z > 0.9);
});

test('large deltas remain bounded work and never jump through colliders or map limits', () => {
  const options = {
    bounds,
    playerRadius: 0.3,
    colliders: [{ x: 0, z: -2, radius: 0.1 }],
  };
  const result = moveGrounded({ x: 0, z: 0 }, 0, -1e12, options);
  assert.ok(result.z > -1.61);
  const edge = moveGrounded({ x: 0, z: 0 }, 1e12, 0, { bounds });
  assert.ok(edge.x <= 9.7);
  assert.deepEqual(moveGrounded({ x: 1, z: 2 }, Infinity, 0, options), {
    x: 1,
    z: 2,
  });
});
