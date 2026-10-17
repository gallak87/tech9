import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createShatterlineTrack } from '../src/levels/shatterline/track/model.js';
import { createShatterlineTube } from '../src/levels/shatterline/track/tube.js';
import { indexedTriangles } from '../src/physics/collision-world.js';

const generated = (world) =>
  world.triangles.filter((triangle) =>
    triangle.id.startsWith('magnetic-edge-'),
  );
const overlaps = (triangle, start, end) =>
  triangle.start < end && triangle.end > start;

test('authored tube collectors and fading rims receive no invisible raised safety fins', () => {
  const track = createShatterlineTrack();
  const triangles = [];
  const tube = createShatterlineTube({
    track,
    shape: true,
    collectSolid({ name, geometry, ...info }) {
      triangles.push(
        ...indexedTriangles(
          geometry.attributes.position.array,
          geometry.index.array,
          { id: name, ...info },
        ),
      );
    },
  });
  try {
    const world = withMagneticBoundaries(track, {
      id: 'tube-fixture',
      rulesId: 'tube-fixture',
      triangles,
    });
    const added = generated(world);
    for (const tube of track.tubes) {
      assert.ok(
        triangles.some(
          (triangle) =>
            triangle.roadBoundary &&
            overlaps(triangle, tube.exitStart, tube.end),
        ),
        'real collector guides retained',
      );
      assert.equal(
        added.filter((triangle) => overlaps(triangle, tube.start, tube.end))
          .length,
        0,
        `${tube.id} must use its authored rim throughout entry/closed/collector`,
      );
      assert.ok(track.tubeProfile(tube.exitStart + 2).railHeight < 0.001);
    }
    assert.ok(
      added.some((triangle) => triangle.start === 0),
      'ordinary road keeps physical safety faces',
    );
    assert.ok(
      triangles.every((triangle) => world.triangles.includes(triangle)),
      'authored faces preserved exactly',
    );
  } finally {
    tube.dispose();
  }
});

for (const level of ['vesper', 'helion']) {
  test(`${level} optional split uses its real divider without an outer rail over the missing branch`, async () => {
    const definition = (
      await import(`../src/levels/${level}/index.js`)
    ).default();
    const track = definition.createTrack();
    const collisionWorld = definition.createCollisionWorld({ track });
    try {
      const added = generated(withMagneticBoundaries(track, collisionWorld));
      const splits = track.jumps.filter((jump) => jump.optional);
      assert.ok(splits.length > 0);
      for (const jump of splits)
        assert.equal(
          added.filter((triangle) =>
            overlaps(triangle, jump.takeoff, jump.landingStart),
          ).length,
          0,
          jump.id,
        );
      assert.ok(
        added.some((triangle) => triangle.start < track.jumps[0].takeoff - 100),
        'jump corridor geometry must not suppress ordinary road edges',
      );
    } finally {
      collisionWorld.dispose();
    }
  });
}

test('partial one-sided authored coverage never suppresses another side or the whole support interval', () => {
  const track = {
    id: 'partial-fixture',
    length: 40,
    width: 20,
    closed: false,
    jumps: [{ optional: true, takeoff: 8, landingStart: 24 }],
    sample(distance) {
      return {
        position: new Vector3(0, 0, distance),
        right: new Vector3(1, 0, 0),
        up: new Vector3(0, 1, 0),
        tangent: new Vector3(0, 0, 1),
        quaternion: new Quaternion(),
      };
    },
  };
  const triangles = [
    {
      id: 'divider',
      kind: 'rail',
      roadBoundary: true,
      start: 0,
      end: 40,
      distance: 32 / 3,
      points: [
        [0, 0, 8],
        [0, 1, 8],
        [0, 0, 16],
      ],
    },
    {
      id: 'divider',
      kind: 'rail',
      roadBoundary: true,
      start: 0,
      end: 40,
      distance: 40 / 3,
      points: [
        [0, 1, 8],
        [0, 1, 16],
        [0, 0, 16],
      ],
    },
    {
      id: 'unlocated-short-curb',
      kind: 'rail',
      roadBoundary: true,
      start: 0,
      end: 40,
      points: [
        [-10, 0, 0],
        [-10, 1, 0],
        [-10, 0, 2],
      ],
    },
  ];
  const added = generated(withMagneticBoundaries(track, { triangles }));
  assert.equal(
    added.filter(
      (triangle) =>
        triangle.id === 'magnetic-edge-1' && overlaps(triangle, 8, 16),
    ).length,
    0,
  );
  assert.ok(
    added.some(
      (triangle) =>
        triangle.id === 'magnetic-edge--1' && overlaps(triangle, 8, 16),
    ),
  );
  assert.ok(
    added.some(
      (triangle) =>
        triangle.id === 'magnetic-edge-1' && overlaps(triangle, 16, 24),
    ),
  );
  assert.ok(
    added.some(
      (triangle) =>
        triangle.id === 'magnetic-edge-1' && overlaps(triangle, 0, 8),
    ),
  );
});
