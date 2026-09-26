import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detailTile,
  groundHeight,
  trees,
  treeCells,
  forestCover,
  trailDistance,
} from '../src/flight/LandscapeLayout.js';
import { getObstacle } from '../src/flight/FlightWorld.js';

test('traveling detail is deterministic, finite and independently repeatable in every quadrant', () => {
  const first = detailTile(10, -29);
  for (const [x, z] of [
    [-60, -65],
    [0, 0],
    [65, 60],
    [-55, 48],
    [10, -29],
  ]) {
    const entries = detailTile(x, z);
    assert.ok(entries.length <= 2200);
    assert.ok(
      entries.every(
        (e) =>
          e.x >= x * 32 &&
          e.x < (x + 1) * 32 &&
          e.z >= z * 32 &&
          e.z < (z + 1) * 32 &&
          e.y === groundHeight(e.x, e.z),
      ),
    );
  }
  assert.deepEqual(detailTile(10, -29), first);
  assert.ok(
    first.some((e) => e.kind.startsWith('fern')) &&
      first.some((e) => e.kind.startsWith('rock')),
  );
});

test('fixed forest placements drive distant/near trees and collision queries across the valley', () => {
  assert.ok(trees.length > 30000 && trees.length < 160000);
  for (const tree of trees.filter((_, i) => i % 1999 === 0)) {
    assert.ok(forestCover(tree.x, tree.z) > 0);
    assert.ok(trailDistance(tree.x, tree.z) >= 4);
    assert.ok(
      treeCells
        .get(`${Math.floor(tree.x / 80)},${Math.floor(tree.z / 80)}`)
        .includes(tree),
    );
    assert.equal(
      getObstacle(tree.x, tree.y + tree.height * 0.45, tree.z)?.id,
      'tree',
    );
  }
});
