import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  loadSaplingForestKit,
  saplingForestURL,
} from '../../../src/living-forest-sapling.js';
import { createLivingHollow } from '../src/hollow.js';
import { createWoodGeometry } from '../src/geometry.js';

function fixture() {
  const wood = createWoodGeometry(
    [
      [0, 0, 0],
      [18, 11, 0],
      [39, 27, 4],
    ],
    [4, 2.5, 0.3],
    { segments: 20, sides: 12 },
  );
  const leaf = new T.SphereGeometry(12, 12, 8).translate(40, 29, 4);
  const bark = new T.MeshStandardMaterial({ vertexColors: true });
  const leaves = new T.MeshStandardMaterial({ side: T.DoubleSide });
  return {
    parts: [
      { geometry: wood, material: bark, kind: 'wood' },
      { geometry: leaf, material: leaves, kind: 'leaf' },
    ],
    materials: { bark, inner: bark, rim: bark },
    dispose() {
      wood.dispose();
      leaf.dispose();
      bark.dispose();
      leaves.dispose();
    },
  };
}
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

test('omitting the crown preserves default horns and an explicit empty crown changes no shell vertices', () => {
  const source = fixture(),
    options = { materials: source.materials, radius: 110, base: -80, top: 300 };
  const original = createLivingHollow(options),
    empty = createLivingHollow({ ...options, crownParts: [] });
  try {
    assert.equal(original.metrics.branches, 6);
    assert.equal(empty.metrics.branches, 0);
    for (let i = 0; i < 3; i++)
      assert.deepEqual(
        original.group.children[i].geometry.attributes.position.array,
        empty.group.children[i].geometry.attributes.position.array,
      );
  } finally {
    original.dispose();
    empty.dispose();
    source.dispose();
  }
});

test('grown crown modules have unequal embedded bearings and own transformed geometry without borrowing disposal', () => {
  const source = fixture();
  const snapshots = source.parts.map(
    (part) => new Float32Array(part.geometry.attributes.position.array),
  );
  let sourceDisposals = 0,
    materialDisposals = 0;
  source.parts.forEach((part) =>
    part.geometry.addEventListener('dispose', () => sourceDisposals++),
  );
  for (const material of new Set(source.parts.map((part) => part.material)))
    material.addEventListener('dispose', () => materialDisposals++);
  const hollow = createLivingHollow({
    radius: 185,
    base: -112,
    top: 410,
    materials: source.materials,
    crownParts: source.parts,
    crownScale: 1.5,
  });
  const owned = hollow.group.children.map((mesh) => mesh.geometry),
    counts = owned.map(() => 0);
  owned.forEach((geometry, i) =>
    geometry.addEventListener('dispose', () => counts[i]++),
  );
  try {
    const wood = hollow.group.getObjectByName(
      'Living Forest / attached Sapling crown wood',
    );
    const leaves = hollow.group.getObjectByName(
      'Living Forest / attached Sapling crown foliage',
    );
    assert.ok(wood && leaves);
    assert.equal(hollow.metrics.branches, 5);
    assert.equal(hollow.metrics.draws, 5);
    assert.equal(wood.material, source.parts[0].material);
    assert.equal(leaves.material, source.parts[1].material);
    const attachments = wood.userData.crownAttachments;
    assert.equal(new Set(attachments.map((part) => part.scale)).size, 5);
    assert.ok(
      Math.max(...attachments.map((part) => part.position[1])) -
        Math.min(...attachments.map((part) => part.position[1])) >
        35,
    );
    const input = source.parts[0].geometry.attributes.position,
      output = wood.geometry.attributes.position;
    const ray = new T.Ray(),
      point = new T.Vector3();
    for (let cluster = 0; cluster < attachments.length; cluster++)
      for (let i = 0; i < input.count; i++) {
        if (Math.hypot(input.getX(i), input.getY(i), input.getZ(i)) > 5)
          continue;
        point.fromBufferAttribute(output, cluster * input.count + i);
        ray.origin.set(0, point.y, 0);
        ray.direction.set(point.x, 0, point.z).normalize();
        const radial = Math.hypot(point.x, point.z);
        assert.ok(
          radial > firstRayHit(ray, hollow.group.children[1].geometry) + 0.2,
          'source foot stays outside the carved cavity',
        );
        assert.ok(
          radial < firstRayHit(ray, hollow.group.children[0].geometry) - 0.2,
          'source foot cap is buried inside actual outer bark',
        );
      }
    let tip = 0;
    for (let i = 1; i < input.count; i++)
      if (
        Math.hypot(input.getX(i), input.getY(i), input.getZ(i)) >
        Math.hypot(input.getX(tip), input.getY(tip), input.getZ(tip))
      )
        tip = i;
    let visibleTips = 0;
    for (let cluster = 0; cluster < attachments.length; cluster++) {
      point.fromBufferAttribute(output, cluster * input.count + tip);
      ray.origin.set(0, point.y, 0);
      ray.direction.set(point.x, 0, point.z).normalize();
      const radial = Math.hypot(point.x, point.z),
        inside = firstRayHit(ray, hollow.group.children[1].geometry),
        outside = firstRayHit(ray, hollow.group.children[0].geometry);
      if (
        !Number.isFinite(inside) ||
        !Number.isFinite(outside) ||
        radial < inside - 0.2 ||
        radial > outside + 0.2
      )
        visibleTips++;
    }
    assert.ok(
      visibleTips >= 3,
      'grown tips emerge from real wood into the crown or its open cavity',
    );
    source.parts.forEach((part, i) =>
      assert.deepEqual(part.geometry.attributes.position.array, snapshots[i]),
    );
  } finally {
    hollow.dispose();
    hollow.dispose();
  }
  assert.ok(counts.every((count) => count === 1));
  assert.equal(sourceDisposals, 0);
  assert.equal(materialDisposals, 0);
  source.dispose();
});

test('invalid source crown parts fail before shell geometry allocation', () => {
  const source = fixture();
  try {
    assert.throws(
      () => createLivingHollow({ materials: source.materials, crownParts: {} }),
      /array/,
    );
    assert.throws(
      () =>
        createLivingHollow({
          materials: source.materials,
          crownParts: [source.parts[1]],
        }),
      /wood bearing/,
    );
    assert.throws(
      () =>
        createLivingHollow({
          materials: source.materials,
          crownParts: source.parts,
          crownScale: 0,
        }),
      /positive/,
    );
    assert.throws(
      () =>
        createLivingHollow({
          materials: source.materials,
          crownParts: source.parts,
          crownBearings: {},
        }),
      /array/,
    );
    assert.throws(
      () =>
        createLivingHollow({
          materials: source.materials,
          crownParts: source.parts,
          crownBearings: [{ angle: 0, v: 1.2 }],
        }),
      /finite angles/,
    );
  } finally {
    source.dispose();
  }
});

test('merged leaf crowns retain transformed wind anchors and inverse-transpose weight gradients', () => {
  const source = fixture(),
    leaf = source.parts[1].geometry,
    p = leaf.attributes.position;
  const anchors = [],
    gradients = [],
    weights = [],
    phases = [];
  for (let i = 0; i < p.count; i++) {
    anchors.push(25, 15, 0);
    gradients.push(0, 0.04, 0);
    weights.push((p.getY(i) - 15) * 0.04);
    phases.push(0.7);
  }
  leaf.setAttribute('windAnchor', new T.Float32BufferAttribute(anchors, 3));
  leaf.setAttribute('windGradient', new T.Float32BufferAttribute(gradients, 3));
  leaf.setAttribute('windWeight', new T.Float32BufferAttribute(weights, 1));
  leaf.setAttribute('windPhase', new T.Float32BufferAttribute(phases, 1));
  const hollow = createLivingHollow({
    radius: 185,
    base: -112,
    top: 410,
    materials: source.materials,
    crownParts: source.parts,
    crownScale: 1.5,
  });
  try {
    const output = hollow.group.children.find(
      (mesh) => mesh.userData.crownKind === 'leaf',
    ).geometry;
    const pos = output.attributes.position,
      anchor = output.attributes.windAnchor,
      gradient = output.attributes.windGradient;
    assert.equal(anchor.count, p.count * 5);
    const point = new T.Vector3(),
      origin = new T.Vector3(),
      covector = new T.Vector3();
    for (let i = 0; i < pos.count; i++) {
      point.fromBufferAttribute(pos, i);
      origin.fromBufferAttribute(anchor, i);
      covector.fromBufferAttribute(gradient, i);
      assert.ok(
        Math.abs(point.sub(origin).dot(covector) - weights[i % p.count]) < 1e-5,
        'baked clone transforms preserve the wind weight field',
      );
      assert.equal(
        output.attributes.windWeight.getX(i),
        leaf.attributes.windWeight.getX(i % p.count),
      );
      assert.equal(
        output.attributes.windPhase.getX(i),
        leaf.attributes.windPhase.getX(i % p.count),
      );
    }
    assert.deepEqual(
      leaf.attributes.windAnchor.array,
      new Float32Array(anchors),
      'source anchors remain borrowed and unchanged',
    );
  } finally {
    hollow.dispose();
    source.dispose();
  }
});

test('the actual Sapling crown root fan is buried within both skins at all eight authored bearings', async (t) => {
  const bytes = await readFile(new URL(saplingForestURL));
  const parsed = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async () => parsed);
  const kit = await loadSaplingForestKit();
  const material = new T.MeshStandardMaterial();
  const crownBearings = [
    [0.24, 0.74, 1.02, -0.07, 0.4],
    [1.56, 0.83, 0.86, 0.1, 0.98],
    [2.72, 0.77, 1.08, -0.09, 0.32],
    [4.06, 0.86, 0.92, 0.06, 1.12],
    [5.34, 0.79, 0.98, 0.12, 0.25],
    [0.88, 0.88, 0.83, -0.18, 1.3],
    [3.36, 0.87, 0.91, 0.16, 1.18],
    [5.9, 0.86, 0.78, -0.12, 1.37],
  ].map(([angle, v, scale, splay, pitch]) => ({
    angle,
    v,
    scale,
    splay,
    pitch,
  }));
  const hollow = createLivingHollow({
    radius: 185,
    base: -112,
    top: 410,
    ageRelief: 1,
    materials: { bark: material, inner: material, rim: material },
    crownParts: kit.crownParts,
    crownBearings,
  });
  try {
    const input = kit.crownParts.find((part) => part.kind === 'wood').geometry;
    const p = input.attributes.position,
      index = input.index,
      cap = new Set();
    for (let i = 0; i < index.count; i += 3) {
      const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      if (ids.some((j) => Math.hypot(p.getX(j), p.getY(j), p.getZ(j)) < 1e-5))
        for (const j of ids) cap.add(j);
    }
    assert.ok(cap.size > 8, 'canonical source retains its closed root fan');
    const wood = hollow.group.getObjectByName(
      'Living Forest / attached Sapling crown wood',
    );
    assert.equal(wood.userData.crownAttachments.length, 8);
    const output = wood.geometry.attributes.position,
      ray = new T.Ray(),
      point = new T.Vector3();
    for (
      let cluster = 0;
      cluster < wood.userData.crownAttachments.length;
      cluster++
    )
      for (const i of cap) {
        point.fromBufferAttribute(output, cluster * p.count + i);
        ray.origin.set(0, point.y, 0);
        ray.direction.set(point.x, 0, point.z).normalize();
        const radial = Math.hypot(point.x, point.z);
        assert.ok(
          radial > firstRayHit(ray, hollow.group.children[1].geometry) + 0.1,
          `source cap escapes into cavity at bearing${cluster}`,
        );
        assert.ok(
          radial < firstRayHit(ray, hollow.group.children[0].geometry) - 0.1,
          `source cap escapes outside bark at bearing${cluster}`,
        );
      }
  } finally {
    hollow.dispose();
    kit.dispose();
    material.dispose();
  }
});
