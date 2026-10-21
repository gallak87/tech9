import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  loadOpalineSculptures,
  opalineSculptureURLs,
} from '../../../src/opaline.js';

const NAMES = [
  'mineral-buttress-1',
  'mineral-buttress-2',
  'mineral-buttress-3',
  'mineral-curl-crust',
  'mineral-curl-emerald',
];
function assetLoader({ failAt = -1, omit, omitTier = 'high' } = {}) {
  const parser = new GLTFLoader(),
    counts = new Map();
  const cause = new Error('failed sculpture acquisition');
  let calls = 0;
  return {
    counts,
    cause,
    async loadAsync(url) {
      if (calls++ === failAt) throw cause;
      const bytes = await readFile(fileURLToPath(url));
      const gltf = await parser.parseAsync(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
        '',
      );
      gltf.scene.traverse((object) => {
        if (!object.isMesh) return;
        if (
          omit &&
          url === opalineSculptureURLs[omitTier] &&
          object.name.replace(/-(high|low|distant)$/, '') === omit
        )
          object.name = 'unrecognised-sculpture';
        const resources = [
          object.geometry,
          ...(Array.isArray(object.material)
            ? object.material
            : [object.material]),
        ];
        for (const resource of resources)
          if (resource && !counts.has(resource)) {
            counts.set(resource, 0);
            resource.addEventListener('dispose', () =>
              counts.set(resource, counts.get(resource) + 1),
            );
          }
      });
      return gltf;
    },
  };
}
function allDisposedOnce(counts) {
  assert.ok(counts.size > 0);
  for (const [resource, count] of counts)
    assert.equal(count, 1, resource.name || resource.type);
}

test('canonical sculpture GLBs expose finite named geometry at all three detail levels and release exactly once', async () => {
  const loader = assetLoader();
  const sculptures = await loadOpalineSculptures({ loader });
  try {
    assert.deepEqual(Object.keys(opalineSculptureURLs).sort(), [
      'distant',
      'high',
      'low',
    ]);
    for (const detail of ['high', 'low', 'distant']) {
      assert.deepEqual(
        Object.keys(sculptures[detail]).sort(),
        NAMES.toSorted(),
      );
      for (const { geometry, bounds } of Object.values(sculptures[detail])) {
        assert.ok(geometry.attributes.position.count > 3);
        for (const name of ['position', 'normal'])
          assert.ok(
            [...geometry.attributes[name].array].every(Number.isFinite),
            `${detail}/${name}`,
          );
        assert.ok(
          [...bounds.min.toArray(), ...bounds.max.toArray()].every(
            Number.isFinite,
          ),
        );
        assert.ok(!bounds.isEmpty());
        assert.ok(
          Number.isFinite(geometry.boundingSphere.radius) &&
            geometry.boundingSphere.radius > 0,
        );
      }
    }
    for (const name of NAMES) {
      assert.ok(
        sculptures.low[name].geometry.attributes.position.count <
          sculptures.high[name].geometry.attributes.position.count,
        `${name} has a smaller low mesh`,
      );
      assert.ok(
        sculptures.distant[name].geometry.attributes.position.count <
          sculptures.low[name].geometry.attributes.position.count,
        `${name} has a smaller distant mesh`,
      );
    }
    assert.ok([...loader.counts.values()].every((count) => count === 0));
  } finally {
    sculptures.dispose();
    sculptures.dispose();
  }
  allDisposedOnce(loader.counts);
});

for (const failAt of [1, 2])
  test(`a failed sculpture asset ${failAt + 1} releases every previously parsed tier`, async () => {
    const loader = assetLoader({ failAt });
    await assert.rejects(
      loadOpalineSculptures({ loader }),
      (error) => error === loader.cause,
    );
    allDisposedOnce(loader.counts);
  });

for (const omitTier of ['high', 'low', 'distant'])
  test(`a missing required ${omitTier} sculpture rejects and releases all acquired geometry and materials`, async () => {
    const loader = assetLoader({ omit: 'mineral-curl-emerald', omitTier });
    await assert.rejects(
      loadOpalineSculptures({ loader }),
      new RegExp(`Missing Opaline sculpture mineral-curl-emerald/${omitTier}`),
    );
    allDisposedOnce(loader.counts);
  });
