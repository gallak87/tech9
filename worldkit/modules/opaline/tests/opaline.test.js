import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as T from 'three';
import {
  createOpalineKit,
  createOpalineMassGeometry,
  createOpalineArchGeometry,
  createOpalineMaterials,
  opalineStoneURL,
} from '../../../src/opaline.js';

const triangleCount = (geometry) => geometry.index.count / 3;

test('near and far mineral sculptures retain seeded forms within bounded triangle counts', () => {
  const high = createOpalineKit(),
    low = createOpalineKit({ detail: 'low' });
  try {
    assert.equal(high.prototypes.length, 6);
    assert.equal(new Set(high.prototypes.map((p) => p.name)).size, 6);
    for (let i = 0; i < high.prototypes.length; i++) {
      const a = high.prototypes[i],
        b = low.prototypes[i];
      assert.ok(triangleCount(a.geometry) < 7500);
      assert.ok(triangleCount(b.geometry) < 1700);
      assert.equal(a.bounds.min.y, 0);
      assert.ok(
        a.bounds
          .getSize(new T.Vector3())
          .distanceTo(b.bounds.getSize(new T.Vector3())) < 4,
        'lower detail preserves silhouette and height',
      );
      for (const geometry of [a.geometry, b.geometry]) {
        for (const attribute of ['position', 'normal', 'uv'])
          assert.ok(
            Array.from(geometry.attributes[attribute].array).every(
              Number.isFinite,
            ),
          );
        assert.ok(geometry.boundingSphere.radius > 0);
        const normals = geometry.attributes.normal;
        for (let n = 0; n < normals.count; n++)
          assert.ok(
            new T.Vector3().fromBufferAttribute(normals, n).length() > 0.98,
          );
      }
    }
    assert.ok(triangleCount(high.archParts[0].geometry) < 4000);
    assert.ok(triangleCount(low.archParts[0].geometry) < 850);
  } finally {
    high.dispose();
    low.dispose();
  }
});

test('seeded sculptural variants have deterministic geometry and continuous seam normals', () => {
  const a = createOpalineMassGeometry({ seed: 123, detail: 'low' }),
    b = createOpalineMassGeometry({ seed: 123, detail: 'low' }),
    c = createOpalineMassGeometry({ seed: 124, detail: 'low' });
  try {
    assert.deepEqual(a.attributes.position.array, b.attributes.position.array);
    assert.notDeepEqual(
      a.attributes.position.array,
      c.attributes.position.array,
    );
    for (let row = 0; row <= 24; row++) {
      const first = row * 33,
        last = first + 32;
      assert.ok(
        new T.Vector3()
          .fromBufferAttribute(a.attributes.position, first)
          .distanceTo(
            new T.Vector3().fromBufferAttribute(a.attributes.position, last),
          ) < 0.0001,
      );
      assert.deepEqual(
        Array.from(a.attributes.normal.array.slice(first * 3, first * 3 + 3)),
        Array.from(a.attributes.normal.array.slice(last * 3, last * 3 + 3)),
      );
    }
  } finally {
    a.dispose();
    b.dispose();
    c.dispose();
  }
});

test('mass and arch faces point outward and arch preserves an open passage', () => {
  const mass = createOpalineMassGeometry({ detail: 'low' }),
    arch = createOpalineArchGeometry({ detail: 'low' });
  try {
    const normal = mass.attributes.normal,
      position = mass.attributes.position;
    let outward = 0;
    for (let row = 1; row < 24; row++)
      for (let side = 0; side < 32; side++) {
        const i = row * 33 + side;
        if (
          new T.Vector3(position.getX(i), 0, position.getZ(i)).dot(
            new T.Vector3().fromBufferAttribute(normal, i),
          ) > 0
        )
          outward++;
      }
    assert.ok(outward > 700, 'side normals point away from the mineral mass');
    assert.ok(normal.getY(position.count - 2) < -0.99);
    assert.ok(normal.getY(position.count - 1) > 0.99);
    assert.ok(
      arch.attributes.normal.getY(arch.attributes.position.count - 2) < -0.99,
    );
    assert.ok(
      arch.attributes.normal.getY(arch.attributes.position.count - 1) < -0.99,
    );
    const mesh = new T.Mesh(arch, new T.MeshBasicMaterial());
    const ray = new T.Raycaster(
      new T.Vector3(0, 30, -100),
      new T.Vector3(0, 0, 1),
    );
    assert.equal(ray.intersectObject(mesh).length, 0, 'open hole under arch');
    ray.set(new T.Vector3(0, 95, -100), new T.Vector3(0, 0, 1));
    assert.ok(ray.intersectObject(mesh).length > 0, 'solid arch above passage');
    mesh.material.dispose();
  } finally {
    mass.dispose();
    arch.dispose();
  }
});

test('materials and kit own resources exactly once while preserving borrowed maps', () => {
  const color = new T.Texture(),
    bump = new T.Texture(),
    normal = new T.Texture(),
    roughness = new T.Texture();
  const maps = [color, bump, normal, roughness];
  let borrowedDisposals = 0;
  maps.forEach((map) =>
    map.addEventListener('dispose', () => borrowedDisposals++),
  );
  const kit = createOpalineKit({
    detail: 'low',
    textures: {
      stone: {
        map: color,
        bumpMap: bump,
        normalMap: normal,
        roughnessMap: roughness,
      },
    },
  });
  assert.equal(kit.materials.stone.map, color);
  assert.equal(
    kit.materials.stone.bumpMap,
    null,
    'far geometry avoids bump samples',
  );
  assert.equal(kit.materials.stone.normalMap, normal);
  assert.equal(kit.materials.stone.roughnessMap, roughness);
  assert.equal(kit.materials.stone.vertexColors, false);
  assert.equal(
    kit.materials.translucent.transmission,
    0,
    'thin mineral does not allocate a transmission pass',
  );
  const resources = [
    ...kit.prototypes.map((p) => p.geometry),
    ...kit.archParts.map((p) => p.geometry),
    ...kit.materialList,
  ];
  const disposals = new Map(resources.map((resource) => [resource, 0]));
  resources.forEach((resource) =>
    resource.addEventListener('dispose', () =>
      disposals.set(resource, disposals.get(resource) + 1),
    ),
  );
  kit.dispose();
  kit.dispose();
  assert.ok([...disposals.values()].every((value) => value === 1));
  assert.equal(borrowedDisposals, 0);
  maps.forEach((map) => map.dispose());
});

test('public input validation rejects invalid dimensions before allocating a scene', () => {
  assert.throws(() => createOpalineKit({ detail: 'ultra' }), /high or low/);
  assert.throws(() => createOpalineMassGeometry({ width: 0 }), /positive/);
  assert.throws(
    () => createOpalineMassGeometry({ height: Infinity }),
    /finite/,
  );
  assert.throws(
    () => createOpalineMassGeometry({ profile: 'sphere' }),
    /profile/,
  );
  assert.throws(() => createOpalineArchGeometry({ thickness: -5 }), /positive/);
  assert.throws(() => createOpalineMaterials({ textureScale: 0 }), /positive/);
});

test('mineral shader programs share cache keys and add instancing-safe world triplanar inputs', () => {
  const a = createOpalineMaterials(),
    b = createOpalineMaterials(),
    far = createOpalineMaterials({ detail: 'low' });
  try {
    assert.equal(
      a.stone.customProgramCacheKey(),
      b.stone.customProgramCacheKey(),
    );
    assert.equal(
      a.stone.customProgramCacheKey(),
      a.shadow.customProgramCacheKey(),
    );
    assert.notEqual(
      a.stone.customProgramCacheKey(),
      far.stone.customProgramCacheKey(),
    );
    const shader = {
      uniforms: {},
      vertexShader: T.ShaderLib.standard.vertexShader,
      fragmentShader: T.ShaderLib.standard.fragmentShader,
    };
    a.stone.onBeforeCompile(shader);
    assert.equal(shader.uniforms.opalineTextureScale.value, 0.07);
    assert.ok(
      shader.vertexShader.includes('instanceMatrix * opalineWorldPosition'),
    );
    assert.ok(shader.fragmentShader.includes('opalineTriplanar(map'));
    assert.ok(shader.fragmentShader.includes('opalinePerturb'));
    assert.ok(!shader.fragmentShader.includes('#include <map_fragment>'));
  } finally {
    a.dispose();
    b.dispose();
    far.dispose();
  }
});

test('original mineral image ships intact with exact provenance', async () => {
  const image = await readFile(new URL(opalineStoneURL));
  const {
    assets: [record],
  } = JSON.parse(
    await readFile(
      new URL('../assets/provenance.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(image.readUInt32BE(16), record.width);
  assert.equal(image.readUInt32BE(20), record.height);
  assert.equal(createHash('sha256').update(image).digest('hex'), record.sha256);
  assert.deepEqual(record.transformations, []);
});

test('far mineral silhouettes retain undercut ledges and fractured multi-height ribs', () => {
  const terrace = createOpalineMassGeometry({
    detail: 'low',
    width: 100,
    height: 80,
  });
  const rib = createOpalineMassGeometry({
    detail: 'low',
    width: 60,
    height: 140,
    profile: 'spire',
  });
  try {
    const p = terrace.attributes.position;
    let strongestLip = 0;
    for (let row = 0; row < 24; row++)
      for (let side = 0; side < 32; side++) {
        const a = row * 33 + side,
          b = a + 33;
        const radiusA = Math.hypot(p.getX(a), p.getZ(a)),
          radiusB = Math.hypot(p.getX(b), p.getZ(b));
        if (p.getY(b) - p.getY(a) < 8)
          strongestLip = Math.max(strongestLip, radiusB - radiusA);
      }
    assert.ok(
      strongestLip > 6,
      'low detail keeps a clearly projecting undercut',
    );
    const rp = rib.attributes.position;
    const rim = Array.from({ length: 32 }, (_, side) =>
      rp.getY(24 * 33 + side),
    );
    assert.ok(
      Math.max(...rim) - Math.min(...rim) > 15,
      'spire ends in a fractured multi-height rim, not a single cone',
    );
    assert.ok(rib.boundingBox.max.y > 130, 'rib preserves nominal stature');
  } finally {
    terrace.dispose();
    rib.dispose();
  }
});
