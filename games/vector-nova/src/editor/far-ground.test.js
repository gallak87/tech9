import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createFarGroundGeometry } from './far-ground.js';

function plan({ nx = 4, nz = 3, dx = 125, dz = 90 } = {}) {
  const heights = new Float32Array((nx + 1) * (nz + 1));
  for (let z = 0; z <= nz; z++)
    for (let x = 0; x <= nx; x++)
      heights[z * (nx + 1) + x] = -72 + x * 3 - z * 2.25;
  return {
    seaLevel: -50,
    terrain: { nx, nz, dx, dz, minX: -825, minZ: 480, heights },
  };
}
function meshFor(geometry) {
  const mesh = new T.Mesh(geometry, new T.MeshStandardMaterial());
  mesh.updateMatrixWorld();
  return mesh;
}
function point(attribute, index) {
  return new T.Vector3().fromBufferAttribute(attribute, index);
}
function clip(poly, axis, boundary, greater) {
  const result = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      da = a[axis] - boundary,
      db = b[axis] - boundary,
      insideA = greater ? da >= 0 : da <= 0,
      insideB = greater ? db >= 0 : db <= 0;
    if (insideA) result.push(a);
    if (insideA !== insideB) {
      const fraction = da / (da - db);
      result.push(a.map((n, k) => n + (b[k] - n) * fraction));
    }
  }
  return result;
}
function projectedArea(poly) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    area += a[0] * b[2] - a[2] * b[0];
  }
  return Math.abs(area) / 2;
}

test('exterior horizon joins every exact surveyed edge without covering the centre', () => {
  const p = plan(),
    { nx, nz, dx, dz, minX, minZ, heights } = p.terrain,
    before = heights.slice(),
    geometry = createFarGroundGeometry(p),
    positions = geometry.getAttribute('position'),
    perimeter = 2 * (nx + nz),
    inner = [];
  for (let z = 0; z <= nz; z++)
    for (let x = 0; x <= nx; x++)
      if (x === 0 || x === nx || z === 0 || z === nz)
        inner.push(
          [
            Math.fround(minX + x * dx),
            heights[z * (nx + 1) + x],
            Math.fround(minZ + z * dz),
          ].join(','),
        );
  assert.equal(positions.count, perimeter * 2);
  assert.equal(geometry.index.count / 3, perimeter * 2);
  assert.deepEqual(
    Array.from({ length: perimeter }, (_, i) =>
      point(positions, i).toArray().join(','),
    ).sort(),
    inner.sort(),
  );
  assert.deepEqual(heights, before, 'terrain elevations remain authoritative');

  const index = geometry.index.array;
  for (let i = 0; i < index.length; i += 3) {
    let triangle = [...index.slice(i, i + 3)].map((n) =>
      point(positions, n).toArray(),
    );
    triangle = clip(triangle, 0, minX, true);
    triangle = clip(triangle, 0, minX + nx * dx, false);
    triangle = clip(triangle, 2, minZ, true);
    triangle = clip(triangle, 2, minZ + nz * dz, false);
    assert(
      projectedArea(triangle) < 1e-6,
      'no triangle covers any surveyed interior area',
    );
  }
  geometry.dispose();
});

test('raycasts hit the horizon outside and never replace interior valleys', () => {
  const p = plan(),
    { nx, nz, dx, dz, minX, minZ, heights } = p.terrain;
  heights[nx + 1 + 1] = -150;
  const geometry = createFarGroundGeometry(p),
    mesh = meshFor(geometry),
    cast = (x, z) =>
      new T.Raycaster(
        new T.Vector3(x, 1000, z),
        new T.Vector3(0, -1, 0),
      ).intersectObject(mesh);
  for (let z = 0; z < nz; z++)
    for (let x = 0; x < nx; x++)
      assert.equal(
        cast(minX + (x + 0.37) * dx, minZ + (z + 0.61) * dz).length,
        0,
      );
  for (const [x, z] of [
    [minX - 1000, minZ + dz],
    [minX + nx * dx + 1000, minZ + dz],
    [minX + dx, minZ - 1000],
    [minX + dx, minZ + nz * dz + 1000],
  ]) {
    const hits = cast(x, z);
    assert(hits.length > 0, 'exterior ring remains physical land');
    assert(hits.every((hit) => hit.point.y >= -100 && hit.point.y < 0));
  }
  assert.equal(heights[nx + 1 + 1], -150);
  mesh.material.dispose();
  geometry.dispose();
});

test('ring is watertight with upward triangles, finite metre UVs and shared terrain normals', () => {
  const p = plan(),
    geometry = createFarGroundGeometry(p),
    positions = geometry.getAttribute('position'),
    normals = geometry.getAttribute('normal'),
    uv = geometry.getAttribute('uv'),
    indices = geometry.index.array,
    edges = new Map(),
    innerCount = positions.count / 2,
    { nx, nz, dx, dz, minX, minZ, heights } = p.terrain;
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [...indices.slice(i, i + 3)],
      pa = point(positions, a),
      pb = point(positions, b),
      pc = point(positions, c);
    assert(new T.Vector3().crossVectors(pb.sub(pa), pc.sub(pa)).y > 0);
    for (const [x, y] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = [x, y].sort((u, v) => u - v).join(':');
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  const boundaryEdges = [...edges.values()].filter((n) => n === 1).length;
  assert.equal(
    boundaryEdges,
    innerCount * 2,
    'only inner and outer loops are open boundaries',
  );
  assert(
    [...edges.values()].every((n) => n === 1 || n === 2),
    'no overlapping or nonmanifold strip edges',
  );
  for (let i = 0; i < positions.count; i++) {
    const n = point(normals, i),
      pos = point(positions, i);
    assert(n.toArray().every(Number.isFinite));
    assert(Math.abs(n.length() - 1) < 1e-6 && n.y > 0);
    assert(Math.abs(uv.getX(i) - pos.x / 20) < 0.001);
    assert(Math.abs(uv.getY(i) - pos.z / 20) < 0.001);
    if (i >= innerCount) {
      assert.equal(pos.y, p.seaLevel - 28);
      continue;
    }
    const x = Math.round((pos.x - minX) / dx),
      z = Math.round((pos.z - minZ) / dz),
      x0 = Math.max(0, x - 1),
      x1 = Math.min(nx, x + 1),
      z0 = Math.max(0, z - 1),
      z1 = Math.min(nz, z + 1),
      expected = new T.Vector3(
        -(heights[z * (nx + 1) + x1] - heights[z * (nx + 1) + x0]) /
          ((x1 - x0) * dx),
        1,
        -(heights[z1 * (nx + 1) + x] - heights[z0 * (nx + 1) + x]) /
          ((z1 - z0) * dz),
      ).normalize();
    assert(
      n.distanceTo(expected) < 1e-6,
      'survey and horizon use the same seam normal',
    );
  }
  geometry.dispose();
});

test('oversize surveys stay inside the outer horizon with bounded deterministic geometry', () => {
  for (const p of [plan(), plan({ nx: 9, nz: 2, dx: 60000, dz: 130000 })]) {
    const a = createFarGroundGeometry(p),
      b = createFarGroundGeometry(p),
      { minX, minZ, nx, nz, dx, dz } = p.terrain;
    for (const key of ['position', 'normal', 'uv'])
      assert.deepEqual(a.getAttribute(key).array, b.getAttribute(key).array);
    assert.deepEqual(a.index.array, b.index.array);
    assert(a.boundingBox.min.x <= minX - dx);
    assert(a.boundingBox.max.x >= minX + (nx + 1) * dx);
    assert(a.boundingBox.min.z <= minZ - dz);
    assert(a.boundingBox.max.z >= minZ + (nz + 1) * dz);
    assert.equal(a.getAttribute('position').count, 4 * (nx + nz));
    assert(Number.isFinite(a.boundingSphere.radius));
    a.dispose();
    b.dispose();
  }
});

test('a minimal one-cell survey still closes all four sides', () => {
  const p = plan({ nx: 1, nz: 1, dx: 2, dz: 3 }),
    geometry = createFarGroundGeometry(p, { size: 1 });
  assert.equal(geometry.getAttribute('position').count, 8);
  assert.equal(geometry.index.count, 24);
  assert(geometry.boundingBox.min.x <= p.terrain.minX - 2);
  assert.throws(
    () => createFarGroundGeometry(p, { size: 0 }),
    /finite rectangular terrain grid/,
  );
  geometry.dispose();
});
