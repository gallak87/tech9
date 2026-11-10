import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createOpenJawGeometry } from './jaw-housings.js';

test('private jaw openings remove only source housings and preserve the shared spindle', async () => {
  const bytes = await fs.readFile(
    new URL(
      '../../../public/assets/levels/ravel/anchor-fleet.glb',
      import.meta.url,
    ),
  );
  const { scene } = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  const root = scene.getObjectByName('tension_spindle');
  const sourceIndices = new Map();
  root.traverse((mesh) => {
    if (mesh.isMesh)
      sourceIndices.set(mesh.geometry, mesh.geometry.index?.array.slice());
  });
  const result = createOpenJawGeometry(root);
  try {
    assert.equal(
      result.removedTriangles,
      216,
      'only the two bevelled housing components are removed',
    );
    assert.equal(result.replacements.size, 1);
    for (const [source, replacement] of result.replacements) {
      assert.notEqual(replacement, source);
      assert.deepEqual(source.index.array, sourceIndices.get(source));
      assert.equal(source.index.count - replacement.index.count, 216 * 3);
      assert.deepEqual(
        replacement.attributes.position.array,
        source.attributes.position.array,
      );
      assert.deepEqual(
        replacement.attributes.normal.array,
        source.attributes.normal.array,
      );
    }
    root.traverse((mesh) => {
      if (mesh.isMesh)
        assert.deepEqual(
          mesh.geometry.index?.array,
          sourceIndices.get(mesh.geometry),
        );
    });
  } finally {
    for (const geometry of result.replacements.values()) geometry.dispose();
    const geometry = new Set(),
      materials = new Set();
    scene.traverse((mesh) => {
      if (mesh.isMesh) {
        geometry.add(mesh.geometry);
        for (const material of [mesh.material].flat()) materials.add(material);
      }
    });
    for (const item of geometry) item.dispose();
    for (const item of materials) item.dispose();
    scene.clear();
  }
});
