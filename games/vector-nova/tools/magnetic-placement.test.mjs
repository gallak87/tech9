import test from 'node:test';
import assert from 'node:assert/strict';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createVehicleState } from '../src/physics/index.js';
import { createMagneticRuntime } from '../src/core/session-runtime.js';
import { RACE_GRID, RACE_OPPONENTS } from '../src/race/roster.js';

for (const slug of [
  'halcyon',
  'orbital',
  'nacre',
  'glasswake',
  'cindercoil',
  'saffron',
  'umbra',
  'helion',
  'zephyr',
  'vesper-forest',
  'shatterline',
  'colossus',
  'worldspire',
  'nightweir',
]) {
  test(`${slug}: countdown and recovery already use the first driving tick's road placement`, async (t) => {
    const level = (await import(`../src/levels/${slug}/index.js`)).default({});
    const track = level.createTrack();
    let collisionWorld = level.createCollisionWorld?.({ track }) ?? null;
    const physicalWorld = withMagneticBoundaries(track, collisionWorld);
    let native = level.createDynamics
      ? await level.createDynamics({ track, collisionWorld: physicalWorld })
      : await createRapierWorld({ collisionWorld: physicalWorld });
    const actors = [];
    let dynamics = {
      ...native,
      createActor(...args) {
        const actor = native.createActor(...args);
        actors.push(actor);
        return actor;
      },
    };
    const createMotion = level.racing.createMotion ?? createMagneticRuntime;
    let runtime = createMotion({
      track,
      collisionWorld,
      dynamics,
    });
    let inactiveRival = createMotion({
      track,
      collisionWorld,
      dynamics,
    });
    t.after(() => {
      runtime.dispose();
      inactiveRival.dispose();
      native.dispose();
      collisionWorld?.dispose();
      // node:test retains hook closures until the file finishes. Release their
      // disposed worlds and actor closures before building the next course.
      actors.length = 0;
      runtime = null;
      inactiveRival = null;
      dynamics = null;
      native = null;
      collisionWorld = null;
    });
    const actor = actors[0];
    // Exercise the real ten-racer grid, including sprint starting-deck
    // extrapolation and circuit lap seams, with each assigned chassis.
    const grid = Object.entries(RACE_GRID).map(([id, position]) => ({
      ...position,
      shipId:
        RACE_OPPONENTS.find((racer) => racer.id === id)?.shipId ?? 'kestrel',
      heading: 0,
    }));
    for (const { distance, lateral, heading, shipId } of [
      ...grid,
      { distance: 60, lateral: 4, heading: 0, shipId: 'kestrel' },
      { distance: 350, lateral: 4, heading: 0.3, shipId: 'kestrel' },
    ]) {
      const state = {
        ...createVehicleState(shipId),
        distance,
        lateral,
        heading,
      };
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
        // Nightweir's former starting wedge bobbed after the first few ticks.
        // Hold the complete grid through three seconds, beyond that transient.
        for (let tick = 0; tick < (slug === 'nightweir' ? 360 : 12); tick++) {
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
