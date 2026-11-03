import test from 'node:test';
import assert from 'node:assert/strict';
import createColossusLevel from '../src/levels/colossus/index.js';
import createUmbraLevel from '../src/levels/umbra/index.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createVehicleState, getVehiclePace } from '../src/physics/index.js';
import { getShip } from '../src/ships/catalog.js';

async function nativeRide(t, level, track) {
  const collisionWorld = level.createCollisionWorld({ track });
  const context = {
    track,
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  };
  const native = level.createDynamics
    ? await level.createDynamics(context)
    : await createRapierWorld(context);
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
    presentation: false,
    settings: { steeringAssist: 0.3 },
  });
  t.after(() => {
    runtime.dispose();
    native.dispose();
    collisionWorld.dispose();
  });
  return { native, runtime, readBody: () => actor.read() };
}

async function checkRolls(t, level, rollsFor, lanes) {
  const track = level.createTrack();
  const { native, runtime, readBody } = await nativeRide(t, level, track);
  for (const jump of track.jumps) {
    if (jump.optional) continue;
    const middle = (jump.takeoff + jump.landingStart) / 2;
    assert.equal(
      native.sampleRoadSurface(middle, 0, track.sample(middle)),
      null,
      `${jump.id}: the authored gap stays open`,
    );
  }
  const peaks = [];
  for (const roll of rollsFor(track)) {
    const peak = { roll: roll.id, body: 0, visual: 0, windows: 0 };
    for (const shipId of ['kestrel', 'shrike'])
      for (const boost of [false, true])
        for (const lateral of lanes) {
          const pace =
            getVehiclePace(shipId, track.pace) ?? getShip(shipId).handling;
          let covered = roll.start;
          for (let start = roll.start - 24; start < roll.end; start += 20) {
            const label = `${roll.id}, ${shipId}, lane ${lateral}, ${boost ? 'boost' : 'cruise'}, ${start.toFixed(2)}m`;
            const state = {
              ...createVehicleState(shipId),
              distance: start,
              lateral,
              speed: boost ? pace.boostSpeed : pace.cruiseSpeed,
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
              const body = readBody();
              const visual = runtime.pose(1);
              const skin = native.sampleRoadSurface(
                state.distance,
                state.lateral,
                track.sample(state.distance),
              );
              assert.ok(skin, `${label}: actual deck coverage`);
              assert.ok(body.support && visual.grounded, `${label}: support`);
              assert.equal(
                body.contacts.some(({ shape }) => shape.kind === 'deck'),
                false,
                `${label}: false deck contact`,
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
                `${label}: departure or recovery`,
              );
              heights.push({
                station: state.distance,
                body: body.position.clone().sub(skin.position).dot(skin.up),
                visual: visual.position.clone().sub(skin.position).dot(skin.up),
              });
            }
            assert.ok(state.distance > start + 20, `${label}: forward travel`);
            covered = Math.max(covered, state.distance);
            peak.windows++;
            // A centered five-sample residual isolates repeated short facet
            // bounce from slower, necessary whole-hull clearance changes.
            for (let i = 2; i < heights.length - 2; i++)
              for (const kind of ['body', 'visual']) {
                const average =
                  heights
                    .slice(i - 2, i + 3)
                    .reduce((sum, row) => sum + row[kind], 0) / 5;
                const residual = Math.abs(heights[i][kind] - average);
                assert.ok(Number.isFinite(residual), label);
                if (residual > peak[kind]) {
                  peak[kind] = residual;
                  peak[`${kind}At`] =
                    `${label}, station ${heights[i].station.toFixed(2)}m`;
                }
              }
          }
          assert.ok(covered >= roll.end, `${roll.id}: full roll coverage`);
        }
    peaks.push(peak);
    t.diagnostic(JSON.stringify(peak));
  }
  for (const peak of peaks)
    for (const kind of ['body', 'visual'])
      assert.ok(
        peak[kind] < 0.015,
        `${peak[`${kind}At`]}: ${kind} five-sample ripple ${(peak[kind] * 1000).toFixed(2)}mm`,
      );
}

test('Colossus reversing rolls keep actual native and visible hull ripple below 1.5 centimetres', async (t) => {
  await checkRolls(
    t,
    createColossusLevel({}),
    (track) => track.rolls,
    [-23, 4, 23],
  );
});

test('Umbra inversion keeps continuous native deck support and hull ripple below 1.5 centimetres', async (t) => {
  await checkRolls(
    t,
    createUmbraLevel({}),
    (track) => [{ id: 'inversion-vault', ...track.inversion }],
    [-12, 4, 12],
  );
});
