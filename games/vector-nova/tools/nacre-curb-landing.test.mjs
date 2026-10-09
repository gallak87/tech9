import test from 'node:test';
import assert from 'node:assert/strict';
import createLevel from '../src/levels/nacre/index.js';
import { createVehicleState } from '../src/physics/index.js';

test('Nacre Abyss curb landings keep moving and regain traction before the flight timeout', (t) => {
  const level = createLevel({ shape: false });
  const track = level.createTrack();
  const world = level.createCollisionWorld({ track });
  t.after(() => world.dispose());
  for (const lateral of [-12.3, 12.3]) {
    let curbContacts = 0;
    const collisionWorld = {
      ...world,
      sweepHull(...args) {
        const hit = world.sweepHull(...args);
        if (
          hit?.shape.id.startsWith('continuous-readable-pearl-curb') &&
          hit.shape.distance >= track.jumps[1].landingStart
        )
          curbContacts++;
        return hit;
      },
    };
    const runtime = level.createRuntime({
      track,
      collisionWorld,
      presentation: false,
    });
    const state = {
      ...createVehicleState(),
      ...track.scenarios['jump2-long'],
      speed: 133.6,
      lateral,
    };
    let previous = null;
    let stalled = 0;
    let longestStall = 0;
    let caughtAt = null;
    const events = [];
    try {
      for (let tick = 0; tick < 920; tick++) {
        const emitted = runtime.advance(state, {}, 1 / 120);
        events.push(...emitted);
        if (curbContacts && caughtAt === null) caughtAt = state.time;
        const position = runtime.pose()?.position;
        stalled =
          position && previous && position.distanceTo(previous) < 0.01
            ? stalled + 1
            : 0;
        longestStall = Math.max(longestStall, stalled);
        previous = position?.clone();
        if (emitted.some(({ type }) => type === 'jump-transfer')) break;
      }
      assert.ok(
        curbContacts > 0,
        `side ${lateral}: real production curb contact`,
      );
      assert.ok(
        longestStall < 3,
        `side ${lateral}: stuck for ${longestStall} ticks`,
      );
      assert.ok(!events.some(({ type }) => type === 'jump-miss'));
      const transfers = events.filter(({ type }) => type === 'jump-transfer');
      assert.equal(transfers.length, 1);
      assert.equal(transfers[0].payload.outcome, 'landed');
      assert.ok(
        state.time - caughtAt < 0.6,
        'curb catch settles onto the adjacent deck',
      );
      const landed = state.distance;
      for (let tick = 0; tick < 30; tick++)
        runtime.advance(state, { throttle: 1 }, 1 / 120);
      assert.equal(runtime.snapshot().mode, 'magnetic');
      assert.ok(
        state.distance > landed + 10,
        'driving continues after landing',
      );
    } finally {
      runtime.dispose();
    }
  }
});
