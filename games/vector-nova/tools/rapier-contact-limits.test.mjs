import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../src/physics/collision-world.js';

const DT = 1 / 120;
const pose = (x, y, z, quaternion = new T.Quaternion()) => ({
  position: new T.Vector3(x, y, z),
  quaternion,
});

test('self contact limits are immutable replay configuration and default snapshots stay unchanged', async (t) => {
  const world = await createRapierWorld({ gravity: 0 });
  t.after(() => world.dispose());
  for (const limit of [0, -1, NaN, Infinity])
    assert.throws(
      () => world.createActor({ selfContactSpeedLimit: limit }),
      /positive/,
    );
  const ordinary = world.createActor();
  const limited = world.createActor({
    selfContactSpeedLimit: 100,
    contactSpeedLimit: 180,
  });
  ordinary.reset({ pose: pose(0, 0, 0), active: true });
  limited.reset({
    pose: pose(100, 0, 0),
    velocity: new T.Vector3(0, 0, 160),
    active: true,
  });
  const saved = world.snapshot();
  assert.equal(
    Object.hasOwn(saved.actors[ordinary.id], 'selfContactSpeedLimit'),
    false,
  );
  assert.equal(saved.actors[limited.id].selfContactSpeedLimit, 100);
  world.step(DT);
  assert.equal(
    limited.read().velocity.length(),
    160,
    'free travel is not speed capped',
  );
  const before = world.snapshot();
  for (const value of [null, 99, 180]) {
    const invalid = structuredClone(saved);
    invalid.actors[limited.id].selfContactSpeedLimit = value;
    assert.throws(() => world.restore(invalid), /identity/);
    assert.deepEqual(
      world.snapshot(),
      before,
      'a mismatched limit cannot partially restore',
    );
  }
  world.restore(saved);
  assert.deepEqual(world.snapshot(), saved);
  const defaultOption = structuredClone(saved);
  defaultOption.actors[ordinary.id].selfContactSpeedLimit = undefined;
  world.restore(defaultOption);
  assert.deepEqual(
    world.snapshot(),
    saved,
    'an optional default remains immutable when explicitly undefined',
  );
  world.restore(saved);
  assert.deepEqual(world.snapshot(), saved);
  world.reset();
  assert.equal(world.snapshot().actors[limited.id].selfContactSpeedLimit, 100);
});

test('a nearly constrained massive crush bounds the struck actor before remaining movement and penetration correction', async (t) => {
  const run = async (selfContactSpeedLimit, reverse = false) => {
    const world = await createRapierWorld({ gravity: 0 });
    t.after(() => world.dispose());
    const tilt = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 0, 1),
      0.001,
    );
    const createPress = () =>
      world.createActor({
        hull: { halfWidth: 4, halfLength: 8, hover: 1 },
        mass: 1e6,
      });
    let press = reverse ? createPress() : null;
    const actor = world.createActor({
      selfContactSpeedLimit,
      contactSpeedLimit: 180,
    });
    actor.reset({
      pose: pose(0, 0.72, 0, tilt),
      support: pose(0, 0.72, 0, tilt),
      active: true,
    });
    press ??= createPress();
    press.reset({
      pose: pose(0, 3, 0),
      velocity: new T.Vector3(0, -200, 0),
      active: true,
    });
    const before = actor.read().position;
    world.step(DT);
    return {
      state: actor.read(),
      displacement: actor.read().position.distanceTo(before),
      world,
      actor,
    };
  };
  const ordinary = await run(null);
  const limited = await run(100);
  assert.ok(
    limited.state.contacts.length,
    'the real constrained hull contact must resolve',
  );
  assert.ok(
    ordinary.state.velocity.length() > 100,
    'the fixture exceeds the opt-in bound without protection',
  );
  assert.ok(limited.state.velocity.length() <= 100 + 1e-8);
  assert.ok(
    limited.displacement <= 100 * DT + 0.3 * 10 + 1e-5,
    'remaining travel and each contact correction stay bounded',
  );
  const reversed = await run(100, true);
  assert.ok(
    reversed.state.contacts.length,
    'the bounded actor also resolves as the second participant',
  );
  assert.ok(reversed.state.velocity.length() <= 100 + 1e-8);
  assert.ok(reversed.displacement <= 100 * DT + 0.3 * 10 + 1e-5);
  const saved = limited.world.snapshot();
  limited.world.step(DT);
  const next = limited.actor.read();
  assert.ok(next.velocity.length() <= 100 + 1e-8);
  limited.world.restore(saved);
  limited.world.step(DT);
  assert.deepEqual(
    limited.actor.read(),
    next,
    'contact response restores exactly',
  );
});

test('repeated static rail contacts cap only the opted-in hull and preserve a tangential support guide', async (t) => {
  const geometry = new T.BoxGeometry(0.1, 20, 100);
  const triangles = indexedTriangles(
    geometry.attributes.position.array,
    geometry.index.array,
    { id: 'rail', kind: 'rail', distance: 0 },
  );
  geometry.dispose();
  const source = createCollisionWorld({
    id: 'contact-limit-rail',
    version: 1,
    geometryId: 'rail-v1',
    triangles,
  });
  const world = await createRapierWorld({ collisionWorld: source, gravity: 0 });
  t.after(() => {
    world.dispose();
    source.dispose();
  });
  const actor = world.createActor({
    selfContactSpeedLimit: 100,
    contactSpeedLimit: 180,
  });
  let contacts = 0;
  for (let tick = 0; tick < 4; tick++) {
    const start = pose(-3, 1, tick * 3);
    actor.reset({
      pose: start,
      velocity: new T.Vector3(2000, 0, 0),
      active: true,
    });
    actor.stage({
      support: {
        ...start,
        destination: start.position
          .clone()
          .add(new T.Vector3(2000 * DT, 0, 200 * DT)),
      },
    });
    world.step(DT);
    const state = actor.read();
    contacts += state.contacts.length;
    assert.ok(
      state.velocity.length() <= 100 + 1e-8,
      'a static contact caps the actor itself despite its opponent limit',
    );
    assert.ok(
      state.position.x < -1,
      'the whole hull stays on the near side of the rail',
    );
    assert.ok(
      state.position.distanceTo(start.position) < 3,
      'the remaining tick cannot launch the hull away',
    );
    assert.ok(
      state.position.z - start.position.z > 1.1,
      'the independent tangential support guide survives the velocity clamp',
    );
  }
  assert.ok(contacts >= 4, 'every repeated native rail contact must happen');
});
