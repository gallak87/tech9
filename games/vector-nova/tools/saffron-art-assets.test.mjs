import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { createBaffleGeometry } from '../src/levels/saffron/track/solids.js';

const app = new URL('../', import.meta.url);
const directory = new URL('assets/levels/saffron/', app);
const readJSON = async (name) =>
  JSON.parse(await readFile(new URL(name, directory)));

function validateGeometry(mesh, label, { connected = false } = {}) {
  const { positions, normals, indices, colors } = mesh;
  assert.ok(
    Array.isArray(positions) && positions.length > 0,
    `${label}: positions`,
  );
  assert.equal(positions.length % 3, 0, `${label}: position triples`);
  assert.equal(normals.length, positions.length, `${label}: matching normals`);
  assert.ok(positions.every(Number.isFinite), `${label}: finite positions`);
  assert.ok(normals.every(Number.isFinite), `${label}: finite normals`);
  const count = positions.length / 3;
  assert.ok(
    indices.length > 0 && indices.length % 3 === 0,
    `${label}: triangle indices`,
  );
  assert.ok(
    indices.every(
      (index) => Number.isSafeInteger(index) && index >= 0 && index < count,
    ),
    `${label}: indices reference real vertices`,
  );
  if (colors) {
    assert.equal(colors.length, positions.length, `${label}: matching colors`);
    assert.ok(
      colors.every(
        (value) => Number.isFinite(value) && value >= 0 && value <= 1,
      ),
    );
  }
  for (let i = 0; i < count; i++) {
    const normal = new T.Vector3().fromArray(normals, i * 3);
    assert.ok(
      Math.abs(normal.length() - 1) < 0.00003,
      `${label}: unit normal ${i}`,
    );
  }

  // Split normals/colors deliberately duplicate export vertices. Weld by exact
  // exported position before checking topology, so a missing cap, seam or
  // reversed triangle cannot hide behind those material/normal boundaries.
  const welded = new Map();
  const vertexIds = [];
  for (let i = 0; i < count; i++) {
    const key = positions.slice(i * 3, i * 3 + 3).join(',');
    if (!welded.has(key)) welded.set(key, welded.size);
    vertexIds.push(welded.get(key));
  }
  const edges = new Map();
  const neighbors = Array.from({ length: welded.size }, () => new Set());
  let volume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = indices.slice(i, i + 3);
    const [a, b, c] = triangle.map((index) =>
      new T.Vector3().fromArray(positions, index * 3),
    );
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    assert.ok(
      normal.lengthSq() > 1e-16,
      `${label}: nondegenerate triangle ${i / 3}`,
    );
    normal.normalize();
    for (const index of triangle) {
      const exported = new T.Vector3().fromArray(normals, index * 3);
      assert.ok(
        normal.dot(exported) > 0.95,
        `${label}: outward normal on triangle ${i / 3}`,
      );
    }
    volume += a.dot(b.clone().cross(c)) / 6;
    for (let edge = 0; edge < 3; edge++) {
      const from = vertexIds[triangle[edge]],
        to = vertexIds[triangle[(edge + 1) % 3]];
      const key = `${Math.min(from, to)},${Math.max(from, to)}`;
      const record = edges.get(key) ?? { count: 0, winding: 0 };
      record.count++;
      record.winding += from < to ? 1 : -1;
      edges.set(key, record);
      neighbors[from].add(to);
      neighbors[to].add(from);
    }
  }
  for (const [key, edge] of edges) {
    assert.equal(edge.count, 2, `${label}: closed solid at edge ${key}`);
    assert.equal(
      edge.winding,
      0,
      `${label}: consistent outward winding at edge ${key}`,
    );
  }
  assert.ok(volume > 0, `${label}: positive closed volume`);
  if (connected) {
    const visited = new Set([0]),
      queue = [0];
    while (queue.length) {
      for (const neighbor of neighbors[queue.pop()]) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    assert.equal(
      visited.size,
      welded.size,
      `${label}: one connected geological mass`,
    );
  }
  return indices.length / 3;
}

test('authored baffle geometry stays closed and inside the unchanged physical vane', async () => {
  const kit = await readJSON('baffles-meshes.json');
  const manifest = await readJSON('baffles-manifest.json');
  assert.equal(kit.format, 1);
  assert.deepEqual(Object.keys(kit.groups).sort(), [
    'bronze',
    'ceramic',
    'graphite',
  ]);
  const physical = createBaffleGeometry();
  try {
    physical.computeBoundingBox();
    const center = physical.boundingBox.getCenter(new T.Vector3());
    const positions = physical.getAttribute('position');
    const planes = [];
    for (let i = 0; i < positions.count; i += 3) {
      const plane = new T.Plane().setFromCoplanarPoints(
        ...[0, 1, 2].map((offset) =>
          new T.Vector3().fromBufferAttribute(positions, i + offset),
        ),
      );
      if (plane.distanceToPoint(center) > 0) plane.negate();
      planes.push(plane);
    }
    let triangles = 0;
    for (const [name, mesh] of Object.entries(kit.groups)) {
      const count = validateGeometry(mesh, name);
      triangles += count;
      assert.equal(manifest.materialTriangles[name], count);
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const point = new T.Vector3().fromArray(mesh.positions, i);
        for (const plane of planes)
          assert.ok(
            plane.distanceToPoint(point) <= 0.000002,
            `${name}: protrudes through physical vane`,
          );
        point.toArray().forEach((value, axis) => {
          assert.ok(value >= manifest.collisionEnvelope.min[axis]);
          assert.ok(value <= manifest.collisionEnvelope.max[axis]);
        });
      }
    }
    assert.equal(triangles, manifest.triangleCount);
    assert.ok(triangles < 800, 'bounded per-vane detail');
  } finally {
    physical.dispose();
  }
});

test('authored scarp geometry has three closed connected families within its normalized budget', async () => {
  const kit = await readJSON('scarps-meshes.json');
  const manifest = await readJSON('scarps-manifest.json');
  assert.equal(kit.format, 1);
  assert.equal(kit.families.length, 3);
  assert.deepEqual(
    kit.families.map((family) => family.name),
    ['scarp_0', 'scarp_1', 'scarp_2'],
  );
  let triangles = 0;
  for (const family of kit.families) {
    const count = validateGeometry(family, family.name, { connected: true });
    triangles += count;
    const record = manifest.families.find(
      (entry) => entry.name === family.name,
    );
    assert.equal(record.triangles, count);
    const bounds = {
      min: [0, 1, 2].map((axis) =>
        Math.min(...family.positions.filter((value, i) => i % 3 === axis)),
      ),
      max: [0, 1, 2].map((axis) =>
        Math.max(...family.positions.filter((value, i) => i % 3 === axis)),
      ),
    };
    assert.deepEqual(bounds, record.bounds);
    assert.ok(bounds.min[0] >= -1.4 && bounds.max[0] <= 1.4);
    assert.ok(bounds.min[1] >= -0.20001 && bounds.max[1] <= 1.00001);
    assert.ok(bounds.min[2] >= -1.2 && bounds.max[2] <= 1.2);
    assert.ok(family.colors, 'retain authored lithology colors');
  }
  assert.ok(triangles < 6000, 'bounded shared family geometry');
});

for (const name of ['baffles', 'scarps']) {
  test(`${name} source and runtime hashes match the current asset manifest`, async () => {
    const manifest = await readJSON(`${name}-manifest.json`);
    const entries = Object.entries(manifest.sha256);
    for (const required of [
      `build_${name}.py`,
      `${name}.blend`,
      `${name}-meshes.json`,
    ])
      assert.ok(
        entries.some(([path]) => path.endsWith(required)),
        `${name}: records ${required}`,
      );
    for (const [path, expected] of entries) {
      assert.match(expected, /^[a-f\d]{64}$/);
      const bytes = await readFile(
        new URL(path, path.includes('/') ? app : directory),
      );
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        expected,
        `${name}: stale ${path}`,
      );
    }
  });
}
