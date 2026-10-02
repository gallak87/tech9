import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import { SHIPS } from './catalog.js';
import { RIVAL_SHIPS, createRivalPreview } from './rivals.js';

test('AI inspection assets have no playable handling profile or fleet entry', async () => {
  for (const rival of RIVAL_SHIPS) {
    assert.ok(!SHIPS.some((ship) => ship.id === rival.id));
    assert.equal(rival.handling, undefined);
  }
  await assert.rejects(
    createRivalPreview('kestrel', {
      loadAsset: () => assert.fail('Unknown preview must not fetch an asset'),
    }),
    /Unknown rival/,
  );
});

test('rival preview releases shared asset resources exactly once, retaining borrowed reflections', async () => {
  const group = new Group();
  const geometry = new BoxGeometry(3, 1, 6);
  const texture = new Texture(),
    reflection = new Texture();
  const material = new MeshStandardMaterial({
    map: texture,
    roughnessMap: texture,
  });
  group.add(new Mesh(geometry, material), new Mesh(geometry, material));
  const disposed = new Map();
  for (const resource of [geometry, texture, material, reflection])
    resource.addEventListener('dispose', () =>
      disposed.set(resource, (disposed.get(resource) ?? 0) + 1),
    );
  const preview = await createRivalPreview('rook', {
    loadAsset: async (url) => {
      assert.equal(url, '/assets/ships/rivals/rook/rook.glb');
      return { scene: group };
    },
  });
  material.envMap = reflection;
  const parent = new Group();
  parent.add(preview.group);
  assert.deepEqual(preview.group.userData.bounds, {
    min: [-1.5, -0.5, -3],
    max: [1.5, 0.5, 3],
  });
  preview.dispose();
  preview.dispose();
  assert.equal(parent.children.length, 0);
  for (const resource of [geometry, texture, material])
    assert.equal(disposed.get(resource), 1);
  assert.equal(disposed.has(reflection), false);
});
