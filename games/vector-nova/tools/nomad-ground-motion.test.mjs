import assert from 'node:assert/strict';
import test from 'node:test';
import { Quaternion, Triangle, Vector3 } from 'three';
import createLevel from '../src/levels/nomad/index.js';
import { createNomadDynamics } from '../src/levels/nomad/dynamics.js';
import { createCollisionWorld } from '../src/physics/collision-world.js';
import { NOMAD_MOTION_RULES } from '../src/levels/nomad/motion.js';
import {
  NOMAD_GROUND_GROUP,
  sampleNomadGroundMotion,
} from '../src/levels/nomad/ground-motion.js';
import {
  createNomadTerrainTriangles,
  NOMAD_TERRAIN_GEOMETRY_VERSION,
} from '../src/levels/nomad/terrain.js';

test('ground landmarks advect backward at convoy speed and remain on the actual salt grade', () => {
  const track = createLevel().createTrack();
  assert.equal(NOMAD_MOTION_RULES.convoySpeed * 3.6, 1500);
  for (const time of [0, 1.5, 19, 70, 180]) {
    const { translation, velocity } = sampleNomadGroundMotion(track, time);
    assert.equal(velocity.z, -NOMAD_MOTION_RULES.convoySpeed);
    assert.ok(
      translation.distanceTo(velocity.clone().multiplyScalar(time)) < 1e-9,
    );
    const point = new Vector3(1300, track.groundHeightAt(1300, 7000), 7000).add(
      translation,
    );
    assert.ok(
      Math.abs(point.y - track.groundHeightAt(point.x, point.z)) < 1e-9,
    );
  }
});

test('actual retained terrain collides only at its current native ground clock and replays identically', async () => {
  const track = createLevel().createTrack();
  const triangles = createNomadTerrainTriangles({ track });
  const wall = triangles
    .map((face) => {
      const triangle = new Triangle(
        ...face.points.map((point) => new Vector3().fromArray(point)),
      );
      return {
        face,
        triangle,
        normal: triangle.getNormal(new Vector3()),
        area: triangle.getArea(),
      };
    })
    .filter(({ face, normal, triangle }) => {
      const centre = triangle.getMidpoint(new Vector3());
      return (
        face.motionGroup === NOMAD_GROUND_GROUP &&
        Math.abs(normal.y) < 0.3 &&
        centre.y - track.groundHeightAt(centre.x, centre.z) > 8
      );
    })
    .sort((a, b) => b.area - a.area)[0];
  assert.ok(
    wall?.area > 100,
    'a substantial actual salt wall supplies the native contact',
  );
  const source = createCollisionWorld({
    id: 'nomad-real-ground-clock',
    version: 1,
    geometryId: NOMAD_TERRAIN_GEOMETRY_VERSION,
    triangles,
  });
  const dynamics = await createNomadDynamics({ track, collisionWorld: source });
  const actor = dynamics.createActor();
  const at = (time) => {
    const motion = sampleNomadGroundMotion(track, time);
    actor.stage({
      pose: {
        position: wall.triangle
          .getMidpoint(new Vector3())
          .add(motion.translation)
          .addScaledVector(wall.normal, 4),
        quaternion: new Quaternion(),
      },
      velocity: motion.velocity.addScaledVector(wall.normal, -50),
      active: true,
    });
  };
  const values = () => {
    const result = actor.read();
    return {
      position: result.position.toArray(),
      velocity: result.velocity.toArray(),
      contacts: result.contacts.map((hit) => ({
        id: hit.shape.id,
        group: hit.shape.motionGroup,
      })),
    };
  };
  try {
    for (const time of [17, 70]) {
      dynamics.reset();
      dynamics.setNomadTime(time);
      at(time);
      const saved = dynamics.snapshot();
      dynamics.step(0.1);
      const result = values();
      assert.ok(
        result.contacts.some(
          ({ id, group }) =>
            id === wall.face.id && group === NOMAD_GROUND_GROUP,
        ),
        `clock${time}: the real advected salt wall meets the native hull`,
      );
      dynamics.restore(saved);
      dynamics.step(0.1);
      assert.deepEqual(
        values(),
        result,
        'restoring the live terrain clock reproduces actual contacts',
      );
    }
    dynamics.reset();
    at(70);
    dynamics.step(0.1);
    assert.equal(
      values().contacts.length,
      0,
      'negative control: leaving native terrain at its old clock misses that same current-world position',
    );
    dynamics.reset();
    const ground = dynamics
      .snapshot()
      .world.motionGroups.find(({ id }) => id === NOMAD_GROUND_GROUP);
    assert.equal(new Vector3().copy(ground.translation).length(), 0);
    assert.deepEqual(
      new Vector3().copy(ground.velocity),
      sampleNomadGroundMotion(track, 0).velocity,
    );
  } finally {
    dynamics.dispose();
    source.dispose();
  }
});

test('native ground solids share exact landmark motion, fixed-step integration, reset and replay', async () => {
  const track = createLevel().createTrack();
  const collisionWorld = createCollisionWorld({
    id: 'nomad-ground-fixture',
    version: 1,
    geometryId: 'nomad-ground-fixture-v1',
    triangles: [
      {
        id: 'ground-shelf',
        kind: 'structure',
        motionGroup: NOMAD_GROUND_GROUP,
        points: [
          [1000, 0, 0],
          [1010, 0, 0],
          [1000, 10, 0],
        ],
      },
    ],
  });
  const dynamics = await createNomadDynamics({ track, collisionWorld });
  const motion = () =>
    dynamics
      .snapshot()
      .world.motionGroups.find(({ id }) => id === NOMAD_GROUND_GROUP);
  try {
    dynamics.setNomadTime(17);
    const expected = sampleNomadGroundMotion(track, 17);
    assert.ok(
      new Vector3()
        .copy(motion().translation)
        .distanceTo(expected.translation) < 1e-8,
    );
    const saved = dynamics.snapshot();
    dynamics.step(1 / 120);
    assert.ok(
      new Vector3()
        .copy(motion().translation)
        .distanceTo(sampleNomadGroundMotion(track, 17 + 1 / 120).translation) <
        1e-8,
    );
    const next = dynamics.snapshot();
    dynamics.restore(saved);
    dynamics.step(1 / 120);
    assert.deepEqual(dynamics.snapshot(), next);
    for (const dt of [0, NaN, Infinity, 0.2]) {
      assert.throws(() => dynamics.step(dt));
      assert.deepEqual(dynamics.snapshot(), next);
    }
    dynamics.reset();
    assert.equal(dynamics.snapshot().convoyTime, 0);
    assert.equal(new Vector3().copy(motion().translation).length(), 0);
  } finally {
    dynamics.dispose();
    collisionWorld.dispose();
  }
});
