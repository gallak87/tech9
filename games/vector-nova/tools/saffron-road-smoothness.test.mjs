import test from 'node:test';
import assert from 'node:assert/strict';
import createLevel from '../src/levels/saffron/index.js';
import { createVehicleState, getVehiclePace } from '../src/physics/index.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { getRacerControl } from '../src/race/racers.js';
import { getShip } from '../src/ships/catalog.js';

async function nativeRoad(t) {
  const level = createLevel({});
  const track = level.createTrack();
  const collisionWorld = level.createCollisionWorld({ track });
  const native = await level.createDynamics({
    track,
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
  const runtime = level.createRuntime({
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
  return { track, native, runtime, readBody: () => actor.read() };
}

test('Saffron native launch ride follows the supported opening bank without facet drops', async (t) => {
  const { track, runtime, readBody } = await nativeRoad(t);
  const state = createVehicleState();
  runtime.reset({ reason: 'initialize', state, seed: 7 });
  let before = runtime.pose(1).position.clone();
  for (let tick = 0; tick < 480; tick++) {
    const input = getRacerControl(state, track, {
      runtime,
      difficulty: 'easy',
    });
    const events = runtime.advance(state, input, 1 / 120);
    const body = readBody();
    const frame = track.sample(state.distance);
    // Measure real chassis motion along the road normal, rather than only
    // height relative to a changing route frame. The former broad triangles
    // created actual 8–10 cm drops while support and contact flags stayed valid.
    const normalStep = body.position.clone().sub(before).dot(frame.up);
    assert.ok(
      Math.abs(normalStep) < 0.02,
      `physical opening-bank step ${normalStep}m at tick ${tick}, ${state.distance}m`,
    );
    assert.ok(
      body.support && runtime.pose(1).grounded,
      `lost opening support at tick ${tick}`,
    );
    assert.equal(
      body.contacts.some(({ shape }) => shape.kind === 'deck'),
      false,
    );
    assert.ok(
      !events.some(({ type }) => ['impact', 'road-departure'].includes(type)),
    );
    before = body.position.clone();
  }
  assert.ok(
    state.distance > 200,
    'the probe traverses the first bank at racing speed',
  );
});

test('Saffron later banks keep whole-hull facet ripple below one centimetre', async (t) => {
  const { track, native, runtime, readBody } = await nativeRoad(t);
  const peak = { body: 0, visual: 0 };
  // Ordinary amber/return banks, away from gaps and rails. These spans exposed
  // 14 cm periodic support changes beneath the former full-width triangles.
  for (const start of [4233, 4603, 4793, 5043])
    for (const shipId of ['kestrel', 'shrike'])
      for (const boost of [false, true])
        for (const lateral of [-12, 4, 12]) {
          const pace =
            getVehiclePace(shipId, track.pace) ?? getShip(shipId).handling;
          const state = {
            ...createVehicleState(shipId),
            distance: start,
            lateral,
            speed: boost ? pace.boostSpeed : pace.cruiseSpeed,
          };
          const label = `${start}m, ${shipId}, lane ${lateral}, ${boost ? 'boost' : 'cruise'}`;
          native.reset();
          runtime.reset({ reason: 'initialize', state, seed: 7 });
          const heights = [];
          for (let tick = 0; tick < 30; tick++) {
            const events = runtime.advance(
              state,
              { throttle: 1, steer: 0, boost },
              1 / 120,
            );
            const body = readBody();
            const visual = runtime.pose(1);
            const skin = native.sampleRoadSurface(
              state.distance,
              state.lateral,
              track.sample(state.distance),
            );
            assert.ok(skin, `${label}: missing actual running skin`);
            assert.ok(
              body.support && visual.grounded,
              `${label}: lost support`,
            );
            assert.equal(
              body.contacts.length,
              0,
              `${label}: unexpected contact`,
            );
            assert.equal(state.resetCount, 0, `${label}: recovered`);
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
              `${label}: departed or recovered`,
            );
            heights.push({
              distance: state.distance,
              body: body.position.clone().sub(skin.position).dot(skin.up),
              visual: visual.position.clone().sub(skin.position).dot(skin.up),
            });
          }
          assert.ok(state.distance > start + 20, `${label}: forward travel`);
          // Remove slow, legitimate clearance changes while retaining the
          // repeated ridge response at normal 120 Hz racing/boost speeds.
          for (let i = 2; i < heights.length - 2; i++)
            for (const kind of ['body', 'visual']) {
              const mean =
                heights
                  .slice(i - 2, i + 3)
                  .reduce((sum, row) => sum + row[kind], 0) / 5;
              const ripple = Math.abs(heights[i][kind] - mean);
              assert.ok(Number.isFinite(ripple), `${label}: nonfinite height`);
              if (ripple > peak[kind]) {
                peak[kind] = ripple;
                peak[`${kind}At`] =
                  `${label}, station ${heights[i].distance.toFixed(2)}m`;
              }
            }
        }
  t.diagnostic(JSON.stringify(peak));
  for (const kind of ['body', 'visual'])
    assert.ok(
      peak[kind] < 0.01,
      `${peak[`${kind}At`]}: ${kind} five-tap ripple ${(peak[kind] * 1000).toFixed(2)}mm exceeds 10mm`,
    );
});
