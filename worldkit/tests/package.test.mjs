import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import * as worldkit from '@worldkit/environment';
import {
  LANDSCAPE_ASSETS,
  FOREST_MATERIAL_ASSETS,
  prepareForestParts,
  disposeForestKit,
} from '@worldkit/environment/forest';
import { createIslandCoast } from '@worldkit/environment/ocean';
import { createShoreline } from '@worldkit/environment/water';
import { validateWeather } from '@worldkit/environment/weather';

test('public entry points import without a browser or scene and use the consumer Three instance', () => {
  assert.equal(typeof worldkit.createComposedLandscape, 'function');
  assert.equal(typeof worldkit.createLandscape, 'function');
  assert.equal(typeof worldkit.createWeather, 'function');
  const coast = createIslandCoast({ radius: 40 });
  assert.equal(typeof coast.terrainHeight, 'function');
  assert.equal(typeof createShoreline().terrainHeight, 'function');
  assert.equal(validateWeather({ rain: 0.4 }).rain, 0.4);
  const water = worldkit.createPondWaterLayer();
  const ocean = worldkit.createOceanLayer();
  water.dispose();
  ocean.dispose();
  const parts = prepareForestParts(new THREE.Group(), 'trail_pebble');
  assert.ok(parts[0].geometry instanceof THREE.BufferGeometry);
  assert.ok(parts[0].material instanceof THREE.Material);
  parts[0].geometry.dispose();
  parts[0].material.dispose();
});

test('canonical material URLs and runtime forest art exist, including embedded image data', async () => {
  for (const [name, url] of Object.entries({
    ...LANDSCAPE_ASSETS,
    ...FOREST_MATERIAL_ASSETS,
  })) {
    const file = fileURLToPath(url);
    assert.ok((await stat(file)).size > 0, name);
  }
  const glb = await readFile(new URL(LANDSCAPE_ASSETS['forest-kit.glb']));
  assert.equal(glb.readUInt32LE(0), 0x46546c67);
  const gltf = JSON.parse(
    glb.subarray(20, 20 + glb.readUInt32LE(12)).toString(),
  );
  for (const name of ['pine_a', 'fern_a', 'rock_a', 'fallen_log']) {
    assert.ok(
      gltf.nodes.some((node) => node.name === name),
      name,
    );
  }
  assert.ok(gltf.images.length > 0);
  assert.ok(gltf.images.every((image) => Number.isInteger(image.bufferView)));
});

test('prepared parts own geometry/materials and borrow kit textures until final teardown', () => {
  const texture = new THREE.Texture();
  const prototype = new THREE.Group();
  prototype.name = 'fern_a';
  const source = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 2),
    new THREE.MeshStandardMaterial({ map: texture }),
  );
  source.position.set(2, 3, 4);
  prototype.add(source);
  const kit = new THREE.Group();
  kit.add(prototype);
  let textureDisposals = 0;
  texture.addEventListener('dispose', () => textureDisposals++);
  const [part] = prepareForestParts(kit, 'fern_a');
  assert.notEqual(part.geometry, source.geometry);
  assert.notEqual(part.material, source.material);
  assert.equal(part.material.map, texture);
  part.geometry.computeBoundingBox();
  assert.equal(part.geometry.boundingBox.min.x, 1.5);
  assert.equal(part.geometry.boundingBox.min.y, 2);
  part.geometry.dispose();
  part.material.dispose();
  assert.equal(textureDisposals, 0);
  disposeForestKit(kit);
  assert.equal(textureDisposals, 1);
});
