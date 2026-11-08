import test from 'node:test';
import assert from 'node:assert/strict';
import createGlasswake from '../src/levels/glasswake/index.js';
import createVesper from '../src/levels/vesper-forest/index.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createVehicleState } from '../src/physics/index.js';
import { getShip } from '../src/ships/catalog.js';

for (const [id, createLevel] of [
  ['glasswake', createGlasswake],
  ['vesper-forest', createVesper],
]) {
  test(`${id} native support covers the rendered deck and carries hulls smoothly through its corkscrew`, async (t) => {
    const level = createLevel();
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
      presentation: false,
      settings: { steeringAssist: 0.3 },
    });
    t.after(() => {
      runtime.dispose();
      native.dispose();
      collisionWorld.dispose();
    });
    for (let distance = 0; distance < track.length; distance += 3.1) {
      if (track.isGap(distance)) continue;
      for (const lateral of [-8, 0, 8])
        assert.ok(
          native.sampleRoadSurface(distance, lateral, track.sample(distance)),
          `missing rendered support at ${distance}m, lane ${lateral}`,
        );
    }
    for (const jump of track.jumps.filter((jump) => !jump.optional)) {
      const distance = (jump.takeoff + jump.landingStart) / 2;
      assert.equal(
        native.sampleRoadSurface(distance, 0, track.sample(distance)),
        null,
        'the real flight gap remains open',
      );
    }
    const roll =
      id === 'glasswake'
        ? {
            start: track.crevice.corkscrewStart,
            end: track.crevice.corkscrewEnd,
          }
        : track.inversions[0];
    let peak = 0,
      maxStep = 0,
      windows = 0,
      peakAt;
    for (const shipId of ['kestrel', 'shrike'])
      for (const boost of [false, true])
        for (const lateral of [-8, 0, 8]) {
          const speed =
            getShip(shipId).handling[boost ? 'boostSpeed' : 'cruiseSpeed'];
          let covered = roll.start;
          for (let start = roll.start - 24; start < roll.end; start += 12) {
            const label = `${id}, ${shipId}, lane ${lateral}, ${boost ? 'boost' : 'cruise'}, ${start.toFixed(2)}m`;
            const state = {
              ...createVehicleState(shipId),
              distance: start,
              lateral,
              speed,
            };
            native.reset();
            runtime.reset({ reason: 'initialize', state, seed: 7 });
            const heights = [];
            for (let tick = 0; tick < 30; tick++) {
              const events = runtime.advance(
                state,
                { throttle: 1, steer: 0, boost },
                1 / 120,
              );
              const body = actor.read(),
                visual = runtime.pose(1);
              const skin = native.sampleRoadSurface(
                state.distance,
                state.lateral,
                track.sample(state.distance),
              );
              assert.ok(skin, `${label}: support hole at ${state.distance}m`);
              assert.ok(
                body.support && visual.grounded,
                `${label}: lost adhesion`,
              );
              assert.equal(state.resetCount, 0, `${label}: recovered`);
              assert.ok(
                events.every(
                  ({ type }) =>
                    ![
                      'road-departure',
                      'road-recovery',
                      'impact',
                      'jump-launch',
                    ].includes(type),
                ),
                `${label}: false contact or departure`,
              );
              assert.equal(
                body.contacts.length,
                0,
                `${label}: false collider contact`,
              );
              heights.push({
                body: body.position.clone().sub(skin.position).dot(skin.up),
                visual: visual.position.clone().sub(skin.position).dot(skin.up),
              });
            }
            assert.ok(
              state.distance > start + 12,
              `${label}: forward window coverage`,
            );
            covered = Math.max(covered, state.distance);
            windows++;
            for (let i = 2; i < heights.length - 2; i++)
              for (const kind of ['body', 'visual']) {
                const mean =
                  heights
                    .slice(i - 2, i + 3)
                    .reduce((sum, row) => sum + row[kind], 0) / 5;
                const ripple = Math.abs(heights[i][kind] - mean);
                const step = Math.abs(heights[i][kind] - heights[i - 1][kind]);
                assert.ok(Number.isFinite(ripple));
                if (ripple > peak) {
                  peak = ripple;
                  peakAt = `${label}, tick ${i}, ${kind}`;
                }
                maxStep = Math.max(maxStep, step);
              }
          }
          assert.ok(covered >= roll.end, `${id}: the entire roll is covered`);
        }
    t.diagnostic(
      JSON.stringify({
        id,
        windows,
        peak,
        peakAt,
        maxStep,
        triangles: collisionWorld.triangleCount,
      }),
    );
    // Glasswake's authored bank-rate shoulder creates one localized whole-hull
    // clearance trough. Keep that shape, while rejecting repeated large facets
    // and the old missing-skin transitions; more rows do not remove the trough.
    assert.ok(peak < 0.03, `${peakAt}: ripple ${(peak * 1000).toFixed(2)}mm`);
    assert.ok(maxStep < 0.08, `abrupt step ${(maxStep * 1000).toFixed(2)}mm`);
  });
}
