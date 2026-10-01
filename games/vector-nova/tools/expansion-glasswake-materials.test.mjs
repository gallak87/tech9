import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { consolidateIceParts } from '../src/levels/glasswake/environment/consolidate.js';

test('batching the authored ice preserves every triangle, bounds, colour and differentiated response; special parts stay separate', async () => {
  const bytes = await readFile(
    new URL(
      '../public/assets/levels/glasswake/glasswake-environment-v5.glb',
      import.meta.url,
    ),
  );
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  gltf.scene.updateMatrixWorld(true);
  const composite = new T.MeshStandardMaterial({ vertexColors: true });
  const owned = new Set();
  try {
    for (const name of ['cliff_0', 'dock_mast']) {
      const parts = [],
        bounds = new T.Box3();
      gltf.scene.getObjectByName(name).traverse((mesh) => {
        if (!mesh.isMesh) return;
        const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        owned.add(geometry);
        geometry.computeBoundingBox();
        bounds.union(geometry.boundingBox);
        parts.push({ geometry, material: mesh.material });
      });
      const special = parts.filter((p) =>
        /Titanium|Warm navigation|Deep cavity/.test(p.material.name),
      );
      const total = parts.reduce(
        (n, p) =>
          n + (p.geometry.index?.count ?? p.geometry.attributes.position.count),
        0,
      );
      const result = consolidateIceParts(parts, composite);
      owned.add(result.geometry);
      assert.equal(
        result.parts.length,
        special.length + 1,
        'one ice draw plus retained special primitives',
      );
      for (const p of special)
        assert.ok(result.parts.includes(p), p.material.name);
      assert.equal(
        result.parts.reduce(
          (n, p) =>
            n +
            (p.geometry.index?.count ?? p.geometry.attributes.position.count),
          0,
        ),
        total,
        'no dropped faces',
      );
      const after = new T.Box3();
      for (const p of result.parts) {
        p.geometry.computeBoundingBox();
        after.union(p.geometry.boundingBox);
      }
      assert.ok(
        after.min.distanceTo(bounds.min) < 1e-5 &&
          after.max.distanceTo(bounds.max) < 1e-5,
        'same physical silhouette',
      );
      if (name === 'cliff_0') {
        const colors = result.geometry.attributes.color,
          rough = result.geometry.attributes.iceRoughness;
        const sourceColors = new Set(
          parts.map((p) =>
            p.material.color
              .toArray()
              .map((n) => n.toFixed(4))
              .join(','),
          ),
        );
        const actualColors = new Set();
        for (let i = 0; i < colors.count; i++)
          actualColors.add(
            [colors.getX(i), colors.getY(i), colors.getZ(i)]
              .map((n) => n.toFixed(4))
              .join(','),
          );
        assert.deepEqual(
          actualColors,
          sourceColors,
          'all authored linear colours survive',
        );
        assert.ok(
          Math.min(...rough.array) < 0.3 && Math.max(...rough.array) > 0.9,
          'fresh break and frost responses remain distinct',
        );
      }
    }
  } finally {
    for (const g of owned) g?.dispose();
    composite.dispose();
    gltf.scene.traverse((mesh) => {
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    });
  }
});
