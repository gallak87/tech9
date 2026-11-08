import test from 'node:test';
import assert from 'node:assert/strict';
import createLevel from '../src/levels/zephyr/index.js';
import { createRoadSurface } from '../src/physics/road-surface.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { createVehicleState } from '../src/physics/index.js';
import { getShip } from '../src/ships/catalog.js';

test('Zephyr production road support continues through ordinary roads and jump-corridor boundaries', (t) => {
  const level = createLevel();
  const track = level.createTrack();
  const collisionWorld = level.createCollisionWorld({ track });
  const sample = createRoadSurface(collisionWorld.triangles);
  t.after(() => {
    sample.dispose();
    collisionWorld.dispose();
  });
  for (let distance = 0; distance < track.length; distance += 7.3) {
    if (track.isGap(distance)) continue;
    for (const lateral of [-12, 0, 12])
      assert.ok(
        sample(distance, lateral, track.sample(distance)),
        `missing running skin at ${distance.toFixed(2)}m, lane ${lateral}`,
      );
  }
});

test('Zephyr native and visible chassis cross the choir support boundary without repeated bobbing', async (t) => {
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
  const peak = {
    body: 0,
    visual: 0,
    bodyReference: 0,
    visualReference: 0,
    step: 0,
  };
  let missingNativeSkin = 0;
  for (const shipId of ['kestrel', 'shrike'])
    for (const boost of [false, true])
      for (const lateral of [-8, 4, 8])
        for (const start of [1374, 1398, 1422, 1446]) {
          const handling = getShip(shipId).handling;
          const state = {
            ...createVehicleState(shipId),
            distance: start,
            lateral,
            speed: boost ? handling.boostSpeed : handling.cruiseSpeed,
          };
          const label = `${shipId}, lane ${lateral}, ${boost ? 'boost' : 'cruise'}, ${start}m`;
          native.reset();
          runtime.reset({ reason: 'initialize', state, seed: 7 });
          const heights = [];
          for (let tick = 0; tick < 30; tick++) {
            const events = runtime.advance(
              state,
              { throttle: 1, steer: 0, boost },
              1 / 120,
            );
            const body = actor.read();
            const visible = runtime.pose(1);
            const reference = track.sample(state.distance);
            const skin = native.sampleRoadSurface(
              state.distance,
              state.lateral,
              reference,
            );
            if (!skin) missingNativeSkin++;
            assert.ok(body.support && visible.grounded, `${label}: grounded`);
            assert.equal(
              body.contacts.some(({ shape }) => shape.kind === 'deck'),
              false,
              `${label}: supported deck also collided with the hull`,
            );
            assert.equal(state.resetCount, 0, `${label}: recovery`);
            assert.ok(
              events.every(
                ({ type }) =>
                  ![
                    'road-departure',
                    'road-recovery',
                    'jump-launch',
                    'jump-miss',
                  ].includes(type),
              ),
              `${label}: road departure or flight`,
            );
            heights.push({
              distance: state.distance,
              body: body.position
                .clone()
                .sub(skin?.position ?? reference.position)
                .dot(skin?.up ?? reference.up),
              visual: visible.position
                .clone()
                .sub(skin?.position ?? reference.position)
                .dot(skin?.up ?? reference.up),
              bodyReference: body.position
                .clone()
                .sub(reference.position)
                .dot(reference.up),
              visualReference: visible.position
                .clone()
                .sub(reference.position)
                .dot(reference.up),
            });
            if (heights.length > 1)
              peak.step = Math.max(
                peak.step,
                Math.abs(
                  heights.at(-1).bodyReference - heights.at(-2).bodyReference,
                ),
                Math.abs(
                  heights.at(-1).visualReference -
                    heights.at(-2).visualReference,
                ),
              );
          }
          assert.ok(
            state.distance > start + state.speed * 0.17,
            `${label}: forward travel`,
          );
          // This authored bend turns whole-hull clearance upward smoothly.
          // Measure repeated facet ripple separately from that envelope; the
          // step guard also catches the former metre-high corridor-entry snap.
          for (let i = 2; i < heights.length - 2; i++)
            for (const kind of [
              'body',
              'visual',
              'bodyReference',
              'visualReference',
            ]) {
              const mean =
                heights
                  .slice(i - 2, i + 3)
                  .reduce((sum, h) => sum + h[kind], 0) / 5;
              const residual = Math.abs(heights[i][kind] - mean);
              if (residual > peak[kind]) {
                peak[kind] = residual;
                peak[`${kind}At`] =
                  `${label}, station ${heights[i].distance.toFixed(2)}m`;
              }
            }
        }
  t.diagnostic(JSON.stringify(peak));
  assert.equal(
    missingNativeSkin,
    0,
    'native running skin covers every driving tick',
  );
  assert.ok(
    peak.step < 0.08,
    `support boundary changed height by ${peak.step}m`,
  );
  for (const kind of ['body', 'visual'])
    assert.ok(
      peak[kind] < 0.03,
      `${peak[`${kind}At`]}: ${kind} five-tap ripple ${(peak[kind] * 1000).toFixed(2)}mm`,
    );
});
