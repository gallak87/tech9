import test from 'node:test';
import assert from 'node:assert/strict';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createVehicleState } from '../src/physics/index.js';

for (const slug of ['nightweir', 'umbra', 'zephyr', 'vesper']) {
  test(`${slug}: countdown and recovery already use the first driving tick's road placement`, async (t) => {
    const level = (await import(`../src/levels/${slug}/index.js`)).default({});
    const track = level.createTrack();
    const collisionWorld = level.createCollisionWorld({ track });
    const native = await createRapierWorld({
      collisionWorld: withMagneticBoundaries(track, collisionWorld),
    });
    const actors = [];
    const dynamics = {
      ...native,
      createActor(...args) {
        const actor = native.createActor(...args);
        actors.push(actor);
        return actor;
      },
    };
    const runtime = level.racing.createMotion({
      track,
      collisionWorld,
      dynamics,
    });
    const inactiveRival = level.racing.createMotion({
      track,
      collisionWorld,
      dynamics,
    });
    t.after(() => {
      runtime.dispose();
      inactiveRival.dispose();
      native.dispose();
      collisionWorld.dispose();
    });
    const actor = actors[0];
    for (const [distance, heading] of [
      [0, 0],
      [60, 0],
      [350, 0.3],
    ]) {
      const state = { ...createVehicleState(), distance, lateral: 4, heading };
      native.reset();
      runtime.reset({ state });
      const before = runtime.pose(1);
      assert.ok(before?.grounded, 'placement exists before the first tick');
      assert.equal(
        actor.read().active,
        false,
        'placement does not activate collision',
      );
      // A disabled rival at the same station must not bump the player in practice.
      inactiveRival.reset({ state: { ...state, chassisId: 'rook' } });
      const initial = structuredClone(runtime.snapshot());
      const physics = structuredClone(native.snapshot());
      const run = () => {
        for (let tick = 0; tick < 12; tick++) {
          const events = runtime.advance(state, {}, 1 / 120);
          const pose = runtime.pose(1);
          assert.ok(
            pose.position.distanceTo(before.position) < 1e-5,
            `${distance}m: idle placement changed by ${pose.position.distanceTo(before.position)}m`,
          );
          assert.ok(pose.quaternion.angleTo(before.quaternion) < 1e-6);
          assert.equal(actors[1].read().active, false);
          assert.ok(!events.some(({ type }) => type === 'impact'));
        }
        return structuredClone(runtime.snapshot());
      };
      const initialState = { ...state };
      const expected = run();
      Object.assign(state, initialState);
      runtime.restore(initial);
      native.restore(physics);
      assert.deepEqual(
        run(),
        expected,
        'pre-start snapshots replay the same placement',
      );
    }
  });
}
