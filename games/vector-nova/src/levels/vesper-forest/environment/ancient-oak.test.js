import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { loadAncientTree } from '@worldkit/environment/living-forest/ancient-tree';
import { allowWorldkitAssetReads } from './asset-test-utils.js';

test('the retained ancient oak export matches its build inputs and preserves attached foliage fields', async (t) => {
  allowWorldkitAssetReads(t);
  const url = new URL(
    '../../../../assets/levels/vesper-forest/ancient-oak-v1.glb',
    import.meta.url,
  );
  const bytes = await readFile(url);
  const manifest = JSON.parse(
    await readFile(new URL('./ancient-oak-v1.json', url), 'utf8'),
  );
  assert.equal(bytes.length, manifest.glbBytes);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    manifest.glbSHA256,
  );
  for (const [file, key] of [
    ['shape.json', 'shapeSHA256'],
    ['canopy.json', 'canopyRecipeSHA256'],
  ]) {
    const input = await readFile(
      new URL(
        `../../../../../../worldkit/modules/living-forest/art/ancient-oak/${file}`,
        import.meta.url,
      ),
    );
    assert.equal(
      createHash('sha256').update(input).digest('hex'),
      manifest[key],
    );
  }
  const document = JSON.parse(
    bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
  );
  assert.equal(
    document.images?.length ?? 0,
    0,
    'the export borrows registered Worldkit images',
  );
  assert.equal(
    document.materials?.length ?? 0,
    0,
    'consumer palette stays authoritative',
  );
  const materials = {
    bark: new T.MeshStandardMaterial(),
    inner: new T.MeshStandardMaterial(),
    leaf: new T.MeshStandardMaterial(),
  };
  const tree = await loadAncientTree({ url, materials });
  try {
    assert.ok(
      tree.metrics.triangles <= 240000,
      'the complete landmark stays inside its geometry budget',
    );
    assert.equal(tree.metrics.triangles, manifest.triangles.final);
    const leaves =
      tree.group.getObjectByName('AncientOak_Leaves').geometry.attributes;
    const groups = new Map();
    const point = new T.Vector3(),
      anchor = new T.Vector3(),
      gradient = new T.Vector3();
    for (let i = 0; i < leaves.position.count; i++) {
      point.fromBufferAttribute(leaves.position, i);
      anchor.fromBufferAttribute(leaves.windAnchor, i);
      gradient.fromBufferAttribute(leaves.windGradient, i);
      const weight = leaves.windWeight.getX(i),
        phase = leaves.windPhase.getX(i);
      assert.ok(
        [
          ...point.toArray(),
          ...anchor.toArray(),
          ...gradient.toArray(),
          weight,
          phase,
        ].every(Number.isFinite),
      );
      assert.ok(weight >= 0 && weight <= 1);
      assert.ok(
        Math.abs(point.sub(anchor).dot(gradient) - weight) < 0.0001,
        'exported weights follow their Y-up spray gradients',
      );
      const key = [...anchor.toArray(), phase].join(',');
      if (!groups.has(key))
        groups.set(key, {
          base: new T.Vector3(),
          count: 0,
          anchor: anchor.clone(),
        });
      if (weight === 0) {
        const group = groups.get(key);
        group.base.add(new T.Vector3().fromBufferAttribute(leaves.position, i));
        group.count++;
      }
    }
    assert.equal(groups.size, manifest.foliageSprays);
    for (const group of groups.values()) {
      assert.ok(group.count > 0);
      assert.ok(
        group.base.divideScalar(group.count).distanceTo(group.anchor) < 0.0001,
        'spray bases remain pinned to their branches',
      );
    }
  } finally {
    tree.dispose();
    Object.values(materials).forEach((material) => material.dispose());
  }
});
