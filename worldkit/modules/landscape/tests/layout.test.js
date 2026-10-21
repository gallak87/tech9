import test from 'node:test';
import assert from 'node:assert/strict';
import { createLandscapeLayout } from '../src/layout.js';
test('relocated finite landscape has deterministic local cover and caller-owned exclusions', () => {
  const options = {
    bounds: { minX: 800, maxX: 1120, minZ: -1000, maxZ: -680 },
    seed: 12,
    groundHeight: (x, z) => 10 + x * 0.01 + z * 0.002,
    excludeDetail: (x) => x < 900,
    trail: false,
  };
  const a = createLandscapeLayout(options),
    b = createLandscapeLayout(options);
  assert.deepEqual(a.trees, b.trees);
  assert.deepEqual(a.detailTile(30, -25), b.detailTile(30, -25));
  assert.ok(a.detailTile(25, -25).length === 0);
  assert.ok(
    a.detailTile(30, -25).every((e) => e.y === options.groundHeight(e.x, e.z)),
  );
  assert.equal(
    a.sampleSurface(950, -800).position[1],
    options.groundHeight(950, -800),
  );
  assert.equal(a.sampleSurface(10000, -800), null);
  assert.throws(() =>
    createLandscapeLayout({
      bounds: { minX: 0, maxX: 10000, minZ: 0, maxZ: 500 },
    }),
  );
});

test('seed changes local detail, invalid callback output fails early, and finite terrain stops detail', () => {
  const options = {
    bounds: { minX: 100, maxX: 300, minZ: -800, maxZ: 400 },
    trail: false,
  };
  const a = createLandscapeLayout({ ...options, seed: 1 }),
    b = createLandscapeLayout({ ...options, seed: 2 });
  assert.notDeepEqual(a.detailTile(5, 0), b.detailTile(5, 0));
  assert.equal(a.detailTile(1000, 1000).length, 0);
  assert.throws(
    () => createLandscapeLayout({ ...options, groundHeight: () => NaN }),
    /finite/,
  );
  assert.throws(
    () => createLandscapeLayout({ ...options, forestCover: () => Infinity }),
    /finite/,
  );
  const empty = createLandscapeLayout({ ...options, forestCover: () => -5 });
  assert.equal(empty.trees.length, 0);
  assert.equal(empty.forestCover(0, 0), 0);
});
