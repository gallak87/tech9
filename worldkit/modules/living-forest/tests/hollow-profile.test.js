import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createLivingHollow } from '../src/hollow.js';
import {
  loadSaplingForestKit,
  saplingForestURL,
} from '../../../src/living-forest-sapling.js';

const bodyProfile = [
  { v: 0, outer: 1.2, inner: 0.67 },
  { v: 0.2, outer: 1.08, inner: 0.76 },
  { v: 0.45, outer: 0.94, inner: 0.74 },
  { v: 0.72, outer: 0.85, inner: 0.71 },
  { v: 0.86, outer: 0.78, inner: 0.35 },
  { v: 0.96, outer: 0.71, inner: 0.1 },
  { v: 1, outer: 0.68, inner: 0.09 },
];
const bearings = [
  { angle: 0.35, v: 0.9, scale: 1, pitch: 0.1, splay: -0.12 },
  { angle: 2.6, v: 0.91, scale: 0.89, pitch: 0.24, splay: 0.13 },
  { angle: 4.55, v: 0.89, scale: 1.08, pitch: 0.35, splay: -0.08 },
];
const forkTransition = {
  rise: 110,
  crotchDrop: 18,
  start: 0.72,
  halfWidth: 1.1,
};
const materials = (material) => ({
  bark: material,
  inner: material,
  rim: material,
});

function firstRayHit(ray, geometry) {
  const p = geometry.attributes.position,
    index = geometry.index,
    a = new T.Vector3(),
    b = new T.Vector3(),
    c = new T.Vector3(),
    hit = new T.Vector3();
  let distance = Infinity;
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(p, index.getX(i));
    b.fromBufferAttribute(p, index.getX(i + 1));
    c.fromBufferAttribute(p, index.getX(i + 2));
    if (ray.intersectTriangle(a, b, c, false, hit))
      distance = Math.min(distance, hit.distanceTo(ray.origin));
  }
  return distance;
}

function corridorClearance(meshes, route, required) {
  const triangle = new T.Triangle(),
    closest = new T.Vector3(),
    bounds = new T.Box3();
  for (const mesh of meshes) {
    const p = mesh.geometry.attributes.position,
      index = mesh.geometry.index;
    const margin = required + (mesh.userData.crownKind === 'leaf' ? 2.4 : 0);
    for (let i = 0; i < index.count; i += 3) {
      triangle.a.fromBufferAttribute(p, index.getX(i));
      triangle.b.fromBufferAttribute(p, index.getX(i + 1));
      triangle.c.fromBufferAttribute(p, index.getX(i + 2));
      bounds
        .setFromPoints([triangle.a, triangle.b, triangle.c])
        .expandByScalar(margin);
      for (const point of route)
        if (bounds.containsPoint(point)) {
          const distance = triangle
            .closestPointToPoint(point, closest)
            .distanceTo(point);
          assert.ok(
            distance >= margin,
            `${mesh.name} reaches protected corridor: ${distance.toFixed(3)}m < ${margin}m`,
          );
        }
    }
  }
}

test('omitting the new body profile preserves every legacy geometry buffer byte', () => {
  const material = new T.MeshStandardMaterial(),
    hollow = createLivingHollow({ materials: materials(material) }),
    hash = createHash('sha256');
  try {
    for (const mesh of hollow.group.children) {
      for (const key of Object.keys(mesh.geometry.attributes).sort()) {
        const array = mesh.geometry.attributes[key].array;
        hash.update(key);
        hash.update(
          Buffer.from(array.buffer, array.byteOffset, array.byteLength),
        );
      }
      const array = mesh.geometry.index.array;
      hash.update(
        Buffer.from(array.buffer, array.byteOffset, array.byteLength),
      );
    }
    assert.equal(
      hash.digest('hex'),
      'e3ba16c9b4d2d0e78ab770dfcccd8f78d3d716f42a296ed455f59ff510e2fe8e',
    );
  } finally {
    hollow.dispose();
    material.dispose();
  }
});

test('an authored torso tapers into real upper wood with slim flutes and no legacy swelling', () => {
  const material = new T.MeshStandardMaterial();
  const options = {
    radius: 185,
    base: -112,
    top: 260,
    ageRelief: 1,
    bodyProfile,
    crownParts: [],
    materials: materials(material),
  };
  const hollow = createLivingHollow(options),
    smooth = createLivingHollow({ ...options, fluteDepth: 0 });
  try {
    assert.equal(hollow.metrics.bodyProfile, true);
    assert.ok(
      hollow.group.children[0].geometry.boundingBox.max.y < 269,
      'top is a low grown rim rather than old decorative horns',
    );
    const outer = hollow.group.children[0].geometry.attributes.position,
      base = smooth.group.children[0].geometry.attributes.position;
    let maxUpper = 0,
      maxFlute = 0;
    for (let i = 0; i < outer.count; i++) {
      if (outer.getY(i) > 225)
        maxUpper = Math.max(maxUpper, Math.hypot(outer.getX(i), outer.getZ(i)));
      maxFlute = Math.max(
        maxFlute,
        Math.hypot(outer.getX(i) - base.getX(i), outer.getZ(i) - base.getZ(i)),
      );
    }
    assert.ok(maxUpper < 165, 'upper torso has no broad shoulder or wound pad');
    assert.ok(
      maxFlute > 5 && maxFlute < 6.01,
      'longitudinal relief follows the authored six-metre bound',
    );
    const ray = new T.Ray(new T.Vector3(20, 250, -9), new T.Vector3(1, 0, 0));
    assert.ok(
      firstRayHit(ray, hollow.group.children[1].geometry) < 40,
      'unused upper cavity closes inward to support major fork roots',
    );
    assert.ok(
      firstRayHit(ray, hollow.group.children[0].geometry) > 110,
      'outer contour stays tapered while wood thickens inward',
    );
  } finally {
    hollow.dispose();
    smooth.dispose();
    material.dispose();
  }
});

test('three actual grown forks embed in the tapered torso while complete road and wind corridors stay clear', async (t) => {
  const bytes = await readFile(new URL(saplingForestURL));
  const parsed = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async () => parsed);
  const kit = await loadSaplingForestKit(),
    material = new T.MeshStandardMaterial(),
    rimMaterial = new T.MeshStandardMaterial();
  let materialDisposals = 0;
  for (const m of [material, rimMaterial])
    m.addEventListener('dispose', () => materialDisposals++);
  const localRoute = [
    [-400, 22, -24],
    [-75, 36, -24],
    [0, 78, 72],
    [80, 128, 65],
    [400, 145, 65],
  ].map((p) => new T.Vector3(...p));
  const samples = [];
  for (let i = 0; i < localRoute.length - 1; i++) {
    const count = Math.ceil(localRoute[i].distanceTo(localRoute[i + 1]) / 3);
    for (let j = 0; j < count; j++)
      samples.push(localRoute[i].clone().lerp(localRoute[i + 1], j / count));
  }
  samples.push(localRoute.at(-1));
  const hollow = createLivingHollow({
    radius: 185,
    base: -112,
    top: 260,
    ageRelief: 1,
    bodyProfile,
    forkTransition,
    materials: { bark: material, inner: material, rim: rimMaterial },
    routePoints: localRoute,
    clearance: 34,
    crownParts: kit.crownParts,
    crownBearings: bearings,
    crownScale: 3.2,
    crownMotionMargin: 2.4,
  });
  try {
    assert.equal(hollow.metrics.branches, 3);
    assert.equal(hollow.metrics.portalLoops, 2);
    assert.equal(hollow.metrics.openPortalVertices, 0);
    assert.equal(hollow.metrics.forkTransition, true);
    const rim = hollow.group.children[2];
    assert.deepEqual(
      rim.material,
      [rimMaterial, material],
      'carved portal wounds borrow warm rim material while grown fork crests borrow outer bark',
    );
    assert.deepEqual(
      rim.geometry.groups.map((group) => group.materialIndex),
      [0, 1],
    );
    assert.equal(
      rim.geometry.groups.reduce((sum, group) => sum + group.count, 0),
      rim.geometry.index.count,
    );
    assert.equal(
      hollow.metrics.draws,
      6,
      'terminal bark requires exactly one additional material draw',
    );
    assert.ok(
      hollow.group.children[0].geometry.boundingBox.max.y > 360,
      'upper torso continues into substantial unequal fork crests',
    );
    corridorClearance(hollow.group.children, samples, 34);
    const input = kit.crownParts.find((part) => part.kind === 'wood').geometry,
      p = input.attributes.position,
      index = input.index,
      cap = new Set();
    for (let i = 0; i < index.count; i += 3) {
      const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      if (ids.some((j) => Math.hypot(p.getX(j), p.getY(j), p.getZ(j)) < 1e-5))
        for (const j of ids) cap.add(j);
    }
    const wood = hollow.group.children.find(
        (mesh) => mesh.userData.crownKind === 'wood',
      ),
      out = wood.geometry.attributes.position,
      ray = new T.Ray(),
      point = new T.Vector3();
    assert.ok(cap.size > 8);
    for (let cluster = 0; cluster < 3; cluster++)
      for (const i of cap) {
        point.fromBufferAttribute(out, cluster * p.count + i);
        ray.origin.set(20, point.y, -9);
        ray.direction.set(point.x - 20, 0, point.z + 9).normalize();
        const radial = point.distanceTo(ray.origin);
        assert.ok(
          radial > firstRayHit(ray, hollow.group.children[1].geometry) + 0.1,
          'fork cap is outside the protected hollow cavity',
        );
        assert.ok(
          radial < firstRayHit(ray, hollow.group.children[0].geometry) - 0.1,
          'fork cap is buried beneath the retained outer bark',
        );
      }
  } finally {
    hollow.dispose();
    assert.equal(
      materialDisposals,
      0,
      'the hollow never disposes either borrowed skin material',
    );
    kit.dispose();
    material.dispose();
    rimMaterial.dispose();
  }
});

test('invalid torso profiles and motion bounds fail before geometry allocation', () => {
  const material = new T.MeshStandardMaterial(),
    options = { materials: materials(material) };
  try {
    assert.throws(
      () => createLivingHollow({ ...options, bodyProfile: [] }),
      /two rings/,
    );
    assert.throws(
      () =>
        createLivingHollow({
          ...options,
          bodyProfile: [
            { v: 0, outer: 1, inner: 0.7 },
            { v: 1, outer: 0.5, inner: 0.6 },
          ],
        }),
      /radius ratios/,
    );
    assert.throws(
      () => createLivingHollow({ ...options, bodyProfile, fluteDepth: -1 }),
      /fluteDepth/,
    );
    assert.throws(
      () => createLivingHollow({ ...options, crownMotionMargin: -1 }),
      /crownMotionMargin/,
    );
    assert.throws(
      () => createLivingHollow({ ...options, forkTransition }),
      /bodyProfile/,
    );
  } finally {
    material.dispose();
  }
});
