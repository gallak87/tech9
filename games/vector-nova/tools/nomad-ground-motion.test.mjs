import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import createLevel from '../src/levels/nomad/index.js';
import { createNomadDynamics } from '../src/levels/nomad/dynamics.js';
import { createCollisionWorld } from '../src/physics/collision-world.js';
import { NOMAD_MOTION_RULES } from '../src/levels/nomad/motion.js';
import {
  NOMAD_GROUND_GROUP,
  sampleNomadGroundMotion,
} from '../src/levels/nomad/ground-motion.js';

test('ground landmarks advect backward at convoy speed and remain on the actual salt grade', () => {
  const track = createLevel().createTrack();
  for (const time of [0, 1.5, 19, 70, 180]) {
    const { translation, velocity } = sampleNomadGroundMotion(track, time);
    assert.equal(velocity.z, -NOMAD_MOTION_RULES.convoySpeed);
    assert.ok(
      translation.distanceTo(velocity.clone().multiplyScalar(time)) < 1e-9,
    );
    const point = new Vector3(
      1300,
      track.saltPlane.height - track.saltPlane.grade * 7000,
      7000,
    ).add(translation);
    assert.ok(
      Math.abs(
        point.y - (track.saltPlane.height - track.saltPlane.grade * point.z),
      ) < 1e-9,
    );
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
