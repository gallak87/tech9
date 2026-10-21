import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createShatterlineTrack } from '../src/levels/shatterline/track/model.js';
import { createShatterlineTube } from '../src/levels/shatterline/track/tube.js';
import { indexedTriangles } from '../src/physics/collision-world.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { createMagneticBody } from '../src/physics/magnetic-body.js';
import { createVehicleState } from '../src/physics/index.js';

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

for (const level of ['helion']) {
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

test('finite support preserves Shatterline closed tube seams and widened collector lanes', async (t) => {
  const track = createShatterlineTrack();
  const dynamics = await createRapierWorld();
  t.after(() => dynamics.dispose());
  const actor = dynamics.createActor();
  const body = createMagneticBody({ track, dynamics, actor });
  for (const tube of track.tubes) {
    for (const [distance, seam] of [
      [(tube.entryEnd + tube.exitStart) / 2, true],
      [tube.exitStart + 2, false],
    ]) {
      const surface = track.sampleSurface(distance, 0);
      assert.equal(surface.period > 0, seam);
      const lateral = seam ? surface.period / 2 + 3 : surface.bounds.max - 5;
      assert.ok(
        Math.abs(lateral) > track.width / 2,
        'probe is outside the ordinary road width',
      );
      const state = { ...createVehicleState(), distance, lateral, speed: 40 };
      body.reset(state);
      for (let tick = 0; tick < 12; tick++) {
        body.stage(state, { throttle: 1 }, 1 / 120);
        dynamics.step(1 / 120);
        const events = body.finish(state);
        assert.equal(
          events.some(({ type }) => type === 'road-departure'),
          false,
        );
        assert.equal(body.pose().grounded, true);
        assert.ok(actor.read().support);
      }
    }
  }
});

const policyFixture = () => ({
  id: 'boundary-policy-fixture',
  geometryVersion: 'fixture-v1',
  length: 40,
  width: 20,
  jumps: [],
  sample(distance) {
    return {
      position: new Vector3(0, 0, distance),
      right: new Vector3(1, 0, 0),
      up: new Vector3(0, 1, 0),
      tangent: new Vector3(0, 0, 1),
      quaternion: new Quaternion(),
    };
  },
});

test('undeclared boundary policy retains existing continuous faces and replay identity', () => {
  const track = policyFixture(),
    old = withMagneticBoundaries(track),
    explicitUndefined = withMagneticBoundaries({
      ...track,
      boundaryIntervals: undefined,
    });
  assert.deepEqual(old, explicitUndefined);
  assert.equal(generated(old).length, 40);
  assert.equal(
    old.rulesId,
    `${track.id}:road-bounds-4m-v3-authored-coverage:${JSON.stringify({ geometry: track.geometryVersion, length: track.length, width: track.width, closed: true, jumps: [] })}`,
  );
});

test('explicit open edges retain authored contacts without generating invisible walls', () => {
  const track = { ...policyFixture(), boundaryIntervals: [] };
  const rail = {
    id: 'visible-connector',
    kind: 'rail',
    points: [
      [10, 0, 8],
      [10, 1, 8],
      [10, 0, 12],
    ],
    roadBoundary: true,
    start: 8,
    end: 12,
  };
  const world = withMagneticBoundaries(track, {
    id: 'visible',
    rulesId: 'visible-v1',
    triangles: [rail],
  });
  assert.deepEqual(world.triangles, [rail]);
  assert.match(world.rulesId, /:boundary-policy-v1:\[\]$/);
});

test('bounded policies cut exactly at authored ends and reject invalid intervals', () => {
  const track = policyFixture();
  const world = withMagneticBoundaries({
    ...track,
    boundaryIntervals: [{ start: 5, end: 14 }],
  });
  const faces = generated(world);
  assert.ok(faces.length > 0);
  assert.equal(Math.min(...faces.map((face) => face.start)), 5);
  assert.equal(Math.max(...faces.map((face) => face.end)), 14);
  assert.ok(faces.every((face) => face.start >= 5 && face.end <= 14));
  for (const boundaryIntervals of [
    null,
    {},
    [{ start: 9, end: 4 }],
    [{ start: -1, end: 4 }],
    [{ start: 0, end: 41 }],
    [{ start: NaN, end: 8 }],
  ])
    assert.throws(
      () => withMagneticBoundaries({ ...track, boundaryIntervals }),
      /Invalid track boundary intervals/,
    );
});
