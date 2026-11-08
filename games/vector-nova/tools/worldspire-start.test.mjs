import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import createLevel from '../src/levels/worldspire/index.js';
import { setMetreUV } from '../src/levels/worldspire/track/finish.js';
import { sweepGeometry } from '../src/track/geometry.js';
import { createVehicleState } from '../src/physics/index.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { getRacerControl } from '../src/race/racers.js';

test('Worldspire metre UVs stay continuous across transverse deck columns and hard profile faces', () => {
  const track = {
    length: 20,
    sample: (s) => ({
      position: new T.Vector3(0, 0, s),
      right: new T.Vector3(1, 0, 0),
      up: new T.Vector3(0, 1, 0),
      tangent: new T.Vector3(0, 0, 1),
    }),
  };
  const geometry = sweepGeometry(
    track,
    [
      [-4, 0],
      [4, 0],
      [4, -2],
    ],
    { step: 4, transverseStep: 2 },
  );
  try {
    setMetreUV(geometry);
    const { uv, roadCoord } = geometry.attributes;
    const deckVertices = geometry.userData.sweep.rows * 5;
    for (let i = 0; i < deckVertices; i++) {
      assert.equal(
        uv.getX(i),
        roadCoord.getY(i),
        'deck texture uses lateral metres',
      );
      assert.equal(
        uv.getY(i),
        roadCoord.getX(i),
        'deck texture uses route metres',
      );
    }
    for (let i = deckVertices; i < uv.count; i += 2) {
      assert.equal(
        uv.getX(i),
        4,
        'the next profile face starts at its own edge',
      );
      assert.equal(
        uv.getX(i + 1),
        6,
        'the two-metre fascia retains its texture scale',
      );
      assert.equal(uv.getY(i), roadCoord.getX(i));
    }
  } finally {
    geometry.dispose();
  }
});

test('Worldspire native easy starts cross the opening bank without large support-height steps', async (t) => {
  const level = createLevel({ shape: true });
  const track = level.createTrack();
  const collisionWorld = level.createCollisionWorld({ track });
  const native = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  });
  let actor;
  const dynamics = {
    ...native,
    createActor(...args) {
      actor = native.createActor(...args);
      return actor;
    },
  };
  const runtime = level.racing.createMotion({
    track,
    collisionWorld,
    dynamics,
    settings: { steeringAssist: 0.3 },
    presentation: false,
  });
  t.after(() => {
    runtime.dispose();
    native.dispose();
    collisionWorld.dispose();
  });
  for (const lateral of [0, 4, -4]) {
    native.reset();
    const state = { ...createVehicleState(), lateral };
    runtime.reset({ reason: 'initialize', state });
    let previousHeight;
    for (let tick = 0; tick < 360; tick++) {
      const events = runtime.advance(
        state,
        getRacerControl(state, track, { runtime, difficulty: 'easy', lane: 0 }),
        1 / 120,
      );
      const body = actor.read();
      const frame = track.sample(state.distance);
      const height = body.position.clone().sub(frame.position).dot(frame.up);
      if (previousHeight !== undefined)
        assert.ok(
          Math.abs(height - previousHeight) < 0.02,
          `lane ${lateral}, tick ${tick}: support height changed by ${height - previousHeight}m`,
        );
      previousHeight = height;
      assert.ok(
        body.support && runtime.pose(1).grounded,
        'the bank retains support',
      );
      assert.equal(
        body.contacts.length,
        0,
        'the supported hull has no false contacts',
      );
      assert.ok(
        !events.some(({ type }) =>
          ['road-departure', 'road-recovery', 'impact'].includes(type),
        ),
      );
    }
    assert.ok(
      state.distance > 180,
      'the three-second probe traverses the reported bob',
    );
  }
});
