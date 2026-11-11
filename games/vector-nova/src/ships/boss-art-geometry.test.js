import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { createBeveledBossPart } from './boss-art-geometry.js';
import { GOLIATH_HULL } from './interceptor-target-hull.js';
import { WRAITH_HULL, BULWARK_HULL } from './boss-hulls.js';

const boxVertices = (x, y, z) =>
  [-1, 1].flatMap((sx) =>
    [-1, 1].flatMap((sy) => [-1, 1].flatMap((sz) => [sx * x, sy * y, sz * z])),
  );
const pointAt = (attribute, vertex) =>
  new Vector3().fromBufferAttribute(attribute, vertex);
function validSurface(geometry) {
  const { position, normal, uv } = geometry.attributes;
  assert.ok(position.count > 0 && position.count % 3 === 0);
  assert.equal(position.count, normal.count);
  assert.equal(position.count, uv.count);
  assert.ok(position.count / 3 <= 5000);
  assert.ok(position.array.every(Number.isFinite));
  assert.ok(uv.array.every(Number.isFinite));
  for (let i = 0; i < normal.count; i++)
    assert.ok(Math.abs(pointAt(normal, i).length() - 1) < 2e-6);
}

test('beveled box has real circular edge and spherical corner positions with matching smooth normals and flat faces', () => {
  const radius = 0.15;
  const geometry = createBeveledBossPart(boxVertices(2, 1, 3), {
    radius,
    segments: 3,
  });
  try {
    validSurface(geometry);
    const { position, normal, uv } = geometry.attributes;
    assert.ok(
      position.count / 3 > 100,
      'fillets have real additional surface geometry',
    );
    assert.ok(
      uv.array.some((value) => Math.abs(value) > 1),
      'UVs retain metre scale rather than fitting every face to one tile',
    );
    let roundedEdges = 0,
      roundedCorners = 0;
    for (let vertex = 0; vertex < position.count; vertex++) {
      const point = pointAt(position, vertex);
      const inner = point
        .clone()
        .clamp(
          new Vector3(-2 + radius, -1 + radius, -3 + radius),
          new Vector3(2 - radius, 1 - radius, 3 - radius),
        );
      const radial = point.sub(inner);
      assert.ok(
        Math.abs(radial.length() - radius) < 2e-6,
        'each sampled bevel vertex lies on the intended round offset surface',
      );
      assert.ok(
        radial.normalize().dot(pointAt(normal, vertex)) > 1 - 2e-6,
        'shading follows the analytic fillet normal',
      );
      const curvedAxes = [radial.x, radial.y, radial.z].filter(
        (value) => Math.abs(value) > 0.05,
      ).length;
      if (curvedAxes === 2) roundedEdges++;
      if (curvedAxes === 3) roundedCorners++;
    }
    assert.ok(roundedEdges > 0 && roundedCorners > 0);
    for (const axis of [0, 1, 2])
      for (const side of [-1, 1]) {
        const plane = [2, 1, 3][axis] * side;
        const flatNormal = new Vector3().setComponent(axis, side);
        let triangles = 0;
        for (let face = 0; face < position.count; face += 3) {
          const vertices = [0, 1, 2].map((offset) =>
            pointAt(position, face + offset),
          );
          if (
            !vertices.every(
              (point) => Math.abs(point.getComponent(axis) - plane) < 1e-6,
            )
          )
            continue;
          triangles++;
          for (let offset = 0; offset < 3; offset++)
            assert.ok(
              pointAt(normal, face + offset).dot(flatNormal) > 1 - 1e-6,
              'large coplanar faces keep uniform flat-face normals',
            );
        }
        assert.ok(
          triangles >= 2,
          'all six original face planes remain present',
        );
      }
  } finally {
    geometry.dispose();
  }
});

test('real boss principal parts preserve source bounds, finite metre UVs and normalized fillet shading without changing hull data', () => {
  for (const hull of [GOLIATH_HULL, WRAITH_HULL, BULWARK_HULL])
    for (const part of hull.parts) {
      const before = [...part.vertices];
      const geometry = createBeveledBossPart(part.vertices);
      try {
        validSurface(geometry);
        for (let axis = 0; axis < 3; axis++) {
          assert.ok(
            Math.abs(
              geometry.boundingBox.min.getComponent(axis) -
                part.bounds.min[axis],
            ) < 1e-5,
            part.id,
          );
          assert.ok(
            Math.abs(
              geometry.boundingBox.max.getComponent(axis) -
                part.bounds.max[axis],
            ) < 1e-5,
            part.id,
          );
        }
        assert.deepEqual(part.vertices, before);
        assert.equal(geometry.userData.bossBevel.uvMetres, true);
      } finally {
        geometry.dispose();
      }
    }
});

test('bevels are deterministic, separately owned geometry and safely clamp radius on thin parts', () => {
  const vertices = boxVertices(2, 0.02, 4);
  const a = createBeveledBossPart(vertices, { radius: 100, segments: 6 });
  const b = createBeveledBossPart(vertices, { radius: 100, segments: 6 });
  let disposed = 0;
  a.addEventListener('dispose', () => disposed++);
  try {
    validSurface(a);
    assert.ok(a.userData.bossBevel.radius <= 0.0081);
    for (const name of ['position', 'normal', 'uv']) {
      assert.notEqual(a.attributes[name].array, b.attributes[name].array);
      assert.deepEqual(a.attributes[name].array, b.attributes[name].array);
    }
    a.dispose();
    assert.equal(disposed, 1);
    assert.ok(b.attributes.position.array.every(Number.isFinite));
  } finally {
    b.dispose();
  }
});

test('pointed extrema retain the original envelope and zero radius stays a valid flat convex surface', () => {
  const vertices = [-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 0, 3, 0];
  for (const radius of [0, 0.1]) {
    const geometry = createBeveledBossPart(vertices, { radius });
    try {
      validSurface(geometry);
      const expected = new Box3(new Vector3(-1, 0, -1), new Vector3(1, 3, 1));
      assert.ok(geometry.boundingBox.min.distanceTo(expected.min) < 1e-6);
      assert.ok(geometry.boundingBox.max.distanceTo(expected.max) < 1e-6);
    } finally {
      geometry.dispose();
    }
  }
  assert.throws(
    () => createBeveledBossPart([0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1]),
    /nonzero convex volume/,
  );
  assert.throws(
    () => createBeveledBossPart([0, 0, 0, 1, 0, 0, 1, 1, 1, NaN, 0, 1]),
    /finite metre-space/,
  );
  assert.throws(
    () => createBeveledBossPart(boxVertices(1, 1, 1), { radius: -1 }),
    /finite radius/,
  );
  assert.throws(
    () => createBeveledBossPart(boxVertices(1, 1, 1), { segments: 100 }),
    /segments/,
  );
});
