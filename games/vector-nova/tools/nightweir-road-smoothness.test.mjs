import test from 'node:test';
import assert from 'node:assert/strict';
import { createNightweirTrack } from '../src/levels/nightweir/track/model.js';
import { createNightweirRoad } from '../src/levels/nightweir/track/road.js';
import { createNightweirRuntime } from '../src/levels/nightweir/runtime.js';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../src/physics/collision-world.js';
import { createRoadSurface } from '../src/physics/road-surface.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { createVehicleState } from '../src/physics/index.js';

function runningSkin(track) {
  const triangles = [];
  const road = createNightweirRoad({
    track,
    collectSolid({ name, geometry, ...info }) {
      if (info.kind !== 'deck') return;
      triangles.push(
        ...indexedTriangles(
          geometry.attributes.position.array,
          geometry.index.array,
          { id: name, ...info },
          null,
          geometry.attributes.roadCoord,
        ),
      );
    },
  });
  road.dispose();
  return triangles;
}

test('Nightweir banked running faces and its grid extension stay close to the authored sheet', () => {
  const track = createNightweirTrack();
  const sample = createRoadSurface(runningSkin(track));
  try {
    assert.ok(
      track.sample(-10).up.distanceTo(track.sample(0.00001).up) < 1e-4,
      'the first positive station cannot introduce a sudden bank',
    );
    for (let s = 0; s < track.length; s += 2.1) {
      if (track.isGap(s)) continue;
      const reference = track.sample(s);
      for (const lateral of [-18, -9, 0, 9, 18]) {
        const face = sample(s, lateral, reference);
        assert.ok(face, `supported skin missing at ${s}, ${lateral}`);
        const error = Math.abs(
          face.position.clone().sub(reference.position).dot(reference.up),
        );
        assert.ok(
          error < 0.05,
          `banked panel rises ${error}m at ${s}, ${lateral}`,
        );
      }
    }
  } finally {
    sample.dispose();
  }
});

test('Nightweir native chassis stays still on the grid and crosses banked facets without large bobs', async (t) => {
  const track = createNightweirTrack();
  // Use the actual rendered/solid running faces. Isolate road ride quality
  // from intentional rails, scenery contacts and off-road recovery.
  const collisionWorld = createCollisionWorld({
    id: 'nightweir-running-skin-test',
    version: 1,
    geometryId: track.geometryVersion,
    triangles: runningSkin(track),
  });
  const native = await createRapierWorld({ collisionWorld });
  let actor;
  const dynamics = {
    ...native,
    createActor(...args) {
      actor = native.createActor(...args);
      return actor;
    },
  };
  const runtime = createNightweirRuntime({
    track,
    collisionWorld,
    dynamics,
    settings: { steeringAssist: 0.3 },
  });
  t.after(() => {
    runtime.dispose();
    native.dispose();
    collisionWorld.dispose();
  });
  const idle = createVehicleState();
  runtime.reset({ reason: 'initialize', state: idle, seed: 7 });
  const placement = runtime.pose(1);
  for (let tick = 0; tick < 360; tick++) {
    runtime.advance(idle, {}, 1 / 120);
    assert.ok(
      runtime.pose(1).position.distanceTo(placement.position) < 1e-5,
      `starting chassis bobbed at tick ${tick}`,
    );
  }
  for (const distance of [50, 1650, 11069.5])
    for (const lateral of [-8, 0, 8])
      for (const boost of [false, true]) {
        const label = `${distance}m, lane ${lateral}, ${boost ? 'boost' : 'cruise'}`;
        const state = {
          ...createVehicleState(),
          distance,
          lateral,
          speed: boost ? 168 : 118,
        };
        native.reset();
        runtime.reset({ reason: 'initialize', state, seed: 7 });
        let previousHeight;
        // Keep neutral-yaw probes within the actual supported corridor.
        const ticks = distance === 1650 ? 40 : 60;
        for (let tick = 0; tick < ticks; tick++) {
          runtime.advance(state, { throttle: 1, steer: 0, boost }, 1 / 120);
          const body = actor.read();
          const reference = track.sample(state.distance);
          const height = body.position
            .clone()
            .sub(reference.position)
            .dot(reference.up);
          if (previousHeight !== undefined)
            assert.ok(
              Math.abs(height - previousHeight) <
                (distance === 50 ? 0.005 : 0.04),
              `${label}: a facet changed support height by ${height - previousHeight}m`,
            );
          previousHeight = height;
          assert.ok(
            body.support && runtime.pose(1).grounded,
            `${label}: lost support`,
          );
          assert.equal(
            body.contacts.some(({ shape }) => shape.kind === 'deck'),
            false,
            `${label}: support skin also collided with the chassis`,
          );
        }
        assert.ok(
          state.distance > distance + 30,
          `${label}: retained forward travel`,
        );
      }
});
