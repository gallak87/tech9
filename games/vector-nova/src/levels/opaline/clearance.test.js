import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpalineTrack } from './track/model.js';
import { createOpalineCollisionWorld } from './collision.js';
import { createOpalineRuntime } from './runtime.js';
import { createCollisionWorld } from '../../physics/collision-world.js';
import { createVehicleState } from '../../physics/index.js';
import { VEHICLE_HULL } from '../../physics/hull.js';

const track = createOpalineTrack();
const COAST = {
  throttle: 0,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};
function terrainWorld() {
  const full = createOpalineCollisionWorld({ track });
  try {
    return createCollisionWorld({
      id: 'opaline-bank-clearance',
      version: 1,
      geometryId: track.geometryVersion,
      triangles: full.triangles.filter(
        (triangle) => triangle.kind === 'terrain',
      ),
    });
  } finally {
    full.dispose();
  }
}

test('full rendered bank triangles leave central and near-edge racing lanes unobstructed', () => {
  const world = terrainWorld();
  try {
    for (let distance = 0; distance < track.length; distance += 6) {
      if (track.isGap(distance)) continue;
      const frame = track.sample(distance);
      for (const lateral of [-15, -14, -8, 0, 8, 14, 15]) {
        const base = frame.position
          .clone()
          .addScaledVector(frame.right, lateral);
        const hit = world.sweepHull(
          {
            position: base.clone().addScaledVector(frame.up, 22),
            quaternion: frame.quaternion,
          },
          {
            position: base.clone().addScaledVector(frame.up, 0.25),
            quaternion: frame.quaternion,
          },
          { halfWidth: 0.03, halfLength: 0.03, hover: 0.03 },
        );
        assert.equal(
          hit,
          null,
          `Bank ${hit?.shape.id} intrudes at ${distance}m / lane ${lateral}`,
        );
      }
    }
    // A separate high probe catches a different route's cliff canopy above the
    // ordinary chassis/camera corridor, even when its face is more than 22m up.
    for (let distance = 0; distance < track.length; distance += 12) {
      if (track.isGap(distance)) continue;
      const frame = track.sample(distance);
      for (const lateral of [-8, 0, 8]) {
        const base = frame.position
          .clone()
          .addScaledVector(frame.right, lateral);
        const hit = world.sweepHull(
          {
            position: base.clone().addScaledVector(frame.up, 300),
            quaternion: frame.quaternion,
          },
          {
            position: base.clone().addScaledVector(frame.up, 0.25),
            quaternion: frame.quaternion,
          },
          { halfWidth: 0.03, halfLength: 0.03, hover: 0.03 },
        );
        assert.equal(
          hit,
          null,
          `Bank ${hit?.shape.id} buries route ${distance}m / lane ${lateral}`,
        );
      }
    }
  } finally {
    world.dispose();
  }
});

test('both actual ballistic envelopes clear every full-map bank at ordinary and boosted speeds', () => {
  const world = terrainWorld();
  try {
    for (const jump of track.jumps)
      for (const speed of [65, 90, 112, 140])
        for (const lateral of [-9, 0, 9]) {
          const runtime = createOpalineRuntime({ track }),
            state = {
              ...createVehicleState(),
              distance: jump.takeoff - 0.01,
              speed,
              lateral,
            };
          runtime.reset({ state, seed: 7 });
          let previous = null,
            transfer;
          try {
            for (let tick = 0; tick < 1200; tick++) {
              const events = runtime.advance(state, COAST, 1 / 120),
                pose = runtime.pose(1);
              if (previous && pose) {
                const hit = world.sweepHull(previous, pose, VEHICLE_HULL);
                assert.equal(
                  hit,
                  null,
                  `${jump.id} ${speed}m/s lane${lateral} crosses ${hit?.shape.id}`,
                );
              }
              previous = pose;
              transfer = events.find((event) => event.type === 'jump-transfer');
              if (transfer) break;
            }
            assert.equal(
              transfer?.payload.outcome,
              'landed',
              `${jump.id} ${speed}m/s lane${lateral}`,
            );
          } finally {
            runtime.dispose();
          }
        }
  } finally {
    world.dispose();
  }
});
