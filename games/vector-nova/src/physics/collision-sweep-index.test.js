import assert from 'node:assert/strict';
import test from 'node:test';
import { Box3, Vector3 } from 'three';
import { createCollisionWorld } from './collision-world.js';
import {
  createSweepIndex,
  packSweepBounds,
  sweepCandidates,
} from './collision-sweep-index.js';

function fullSortOrder(faces) {
  if (faces.length <= 12) return faces;
  const bounds = new Box3();
  for (const face of faces) bounds.union(face.bounds);
  const { x, y, z } = bounds.getSize(new Vector3());
  const axis = x >= y && x >= z ? 'x' : y >= z ? 'y' : 'z';
  faces.sort((a, b) => a.center[axis] - b.center[axis] || a.id - b.id);
  const mid = faces.length >> 1;
  return [
    ...fullSortOrder(faces.slice(0, mid)),
    ...fullSortOrder(faces.slice(mid)),
  ];
}

test('the compact sweep index preserves the full-sort candidate traversal', () => {
  for (const count of [0, 12, 13, 25, 193, 2010]) {
    const triangles = Array.from({ length: count }, (_, i) => {
      const x = (i * 12) % 41;
      const y = (i * 9) % 29;
      const z = (i * 27) % 65;
      const points = [
        [x, y, z],
        [x + 2, y - 1, z],
        [x, y, z + 2],
      ];
      // Give some faces equal centres so ordering needs its original ID tie.
      return {
        points:
          i % 5 === 0
            ? [
                [1, 2, 3],
                [2, 3, 4],
                [2, 4, 3],
              ]
            : points,
      };
    });
    const faces = fullSortOrder(
      triangles.map(({ points }, id) => {
        const bounds = new Box3().setFromPoints(
          points.map((p) => new Vector3(...p)),
        );
        return { id, bounds, center: bounds.getCenter(new Vector3()) };
      }),
    );
    const index = createSweepIndex(packSweepBounds(triangles));
    for (const [min, max] of [
      [
        [-10, -10, -10],
        [100, 100, 100],
      ],
      [
        [1, 2, 3],
        [15, 15, 25],
      ],
      [
        [4, 11, 15],
        [25, 23, 33],
      ],
      [
        [100, 100, 100],
        [101, 101, 101],
      ],
    ]) {
      const box = new Box3(new Vector3(...min), new Vector3(...max));
      assert.deepEqual(
        sweepCandidates(index, box),
        faces
          .filter((face) => face.bounds.intersectsBox(box))
          .map(({ id }) => id),
      );
    }
  }
});

test('cancelling an outstanding sweep index terminates its worker', async (t) => {
  let activeWorker;
  class PendingWorker extends EventTarget {
    constructor() {
      super();
      activeWorker = this;
    }
    postMessage(bounds, transfers) {
      assert.ok(bounds instanceof Float64Array);
      assert.deepEqual(transfers, [bounds.buffer]);
    }
    terminate() {
      this.terminated = true;
    }
  }
  const { Worker: previousWorker, window: previousWindow } = globalThis;
  globalThis.Worker = PendingWorker;
  globalThis.window = {};
  t.after(() => {
    if (previousWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = previousWorker;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  const points = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
  ];
  const world = createCollisionWorld({
    id: 'large-fixture',
    version: 1,
    geometryId: 'large-fixture-v1',
    triangles: Array.from({ length: 50_000 }, () => ({
      id: 'scenery',
      kind: 'structure',
      points,
    })),
  });
  t.after(() => world.dispose());
  const controller = new AbortController();
  const pending = world.prepareSweepIndex(controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(activeWorker.terminated, true);
});
