import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createLevel3Track } from '../src/levels/nacre/track/model.js';
import { createNacreCollisionWorld } from '../src/levels/nacre/collision.js';
import { createNacreRuntime } from '../src/levels/nacre/track/runtime.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createVehicleState } from '../src/physics/index.js';
import { getShip } from '../src/ships/catalog.js';

async function nativeRoad(t) {
  const track = createLevel3Track();
  const collisionWorld = createNacreCollisionWorld({ track });
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
  const runtime = createNacreRuntime({
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

test('Nacre panel seams carry native chassis smoothly at cruise and boost', async (t) => {
  const { track, native, runtime, readBody } = await nativeRoad(t);
  // Four real panel joins on the authored receiving straight, away from
  // takeoff, touchdown, rails and devices. Use production triangles and hulls.
  const start = track.jumps[1].landingStart + 45;
  const up = new Vector3(0, 1, 0);
  for (const shipId of ['kestrel', 'shrike'])
    for (const lateral of [-4, 0, 4])
      for (const boost of [false, true]) {
        const speed =
          getShip(shipId).handling[boost ? 'boostSpeed' : 'cruiseSpeed'];
        const label = `${shipId} lane ${lateral}, ${speed}m/s`;
        const state = {
          ...createVehicleState(shipId),
          distance: start,
          lateral,
          speed,
        };
        native.reset();
        runtime.reset({ reason: 'initialize', state, seed: 7 });
        let minimum = Infinity,
          maximum = -Infinity,
          previousHeight,
          covered = 0,
          ticks = 0;
        for (; ticks < 120 && state.distance < start + 80; ticks++) {
          const before = state.speed;
          const events = runtime.advance(
            state,
            { throttle: 1, steer: 0, boost },
            1 / 120,
          );
          const body = readBody();
          const reference = track.sample(state.distance);
          const surface = native.sampleRoadSurface(
            state.distance,
            state.lateral,
            reference,
          );
          if (surface) covered++;
          const height = body.position
            .clone()
            .sub(reference.position)
            .dot(reference.up);
          minimum = Math.min(minimum, height);
          maximum = Math.max(maximum, height);
          if (previousHeight !== undefined)
            assert.ok(
              Math.abs(height - previousHeight) < 0.008,
              `${label}: panel join raises the hull by ${height - previousHeight}m`,
            );
          previousHeight = height;
          const tilt = up
            .clone()
            .applyQuaternion(body.quaternion)
            .angleTo(reference.up);
          assert.ok(tilt < 0.003, `${label}: panel join pitches the hull`);
          assert.ok(body.support && runtime.pose(1).grounded, label);
          assert.equal(
            body.contacts.some(({ shape }) => shape.kind === 'deck'),
            false,
            `${label}: supporting panels cannot also hit the chassis`,
          );
          assert.equal(
            events.some(({ type }) =>
              ['road-departure', 'jump-miss', 'jump-transfer'].includes(type),
            ),
            false,
            label,
          );
          assert.ok(before - state.speed < 0.015, `${label}: seam braking`);
        }
        assert.ok(state.distance >= start + 80, `${label}: forward progress`);
        assert.ok(covered > ticks * 0.9, `${label}: actual road skins sampled`);
        assert.ok(maximum - minimum < 0.012, `${label}: repeated seam bobbing`);
        assert.ok(state.speed > speed * 0.99, `${label}: retained momentum`);
      }
});

test('Nacre banks retain continuous native support beyond the jump corridors', async (t) => {
  const { track, native, runtime, readBody } = await nativeRoad(t);
  // Include the former 1620 m skin/fallback boundary and every strong bank.
  // These are short native windows, not full races or camera simulations.
  const starts = [348, 473, 1608, 1948, 2163, 2298, 2973, 3988, 4508, 4768];
  const peak = { body: 0, visual: 0 };
  let coverageSamples = 0;
  for (let distance = 0; distance < track.length; distance += 7.3) {
    if (
      track.jumps.some(
        (jump) => distance > jump.takeoff && distance < jump.landingStart,
      )
    )
      continue;
    const reference = track.sample(distance);
    // Sweep both ordinary centres and the old lateral joint coordinates.
    for (const lateral of [-11, -9, -8, -5, -4.84, 0, 4.84, 5, 8, 9, 11]) {
      assert.ok(
        native.sampleRoadSurface(distance, lateral, reference),
        `missing rendered support at ${distance.toFixed(2)}m, lane ${lateral}`,
      );
      coverageSamples++;
    }
  }
  const cases = starts.flatMap((start) =>
    ['kestrel', 'shrike'].flatMap((shipId) =>
      [false, true].flatMap((boost) =>
        [-6, 4, 6].map((lateral) => ({ start, shipId, boost, lateral })),
      ),
    ),
  );
  // Exact original boundary reproduction, safely before its rail encounter.
  cases.push({ start: 1608, shipId: 'kestrel', boost: false, lateral: -9 });
  for (const { start, shipId, boost, lateral } of cases) {
    const speed =
      getShip(shipId).handling[boost ? 'boostSpeed' : 'cruiseSpeed'];
    const state = {
      ...createVehicleState(shipId),
      distance: start,
      lateral,
      speed,
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
      assert.ok(skin, `${label}: changed to analytic fallback`);
      assert.ok(body.support && visual.grounded, `${label}: lost support`);
      assert.equal(body.contacts.length, 0, `${label}: unexpected contact`);
      assert.equal(state.resetCount, 0, `${label}: recovered`);
      assert.ok(
        events.every(
          ({ type }) =>
            ![
              'impact',
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
    for (let i = 2; i < heights.length - 2; i++)
      for (const kind of ['body', 'visual']) {
        const mean =
          heights.slice(i - 2, i + 3).reduce((sum, row) => sum + row[kind], 0) /
          5;
        const ripple = Math.abs(heights[i][kind] - mean);
        assert.ok(Number.isFinite(ripple), `${label}: nonfinite height`);
        if (ripple > peak[kind]) {
          peak[kind] = ripple;
          peak[`${kind}At`] =
            `${label}, station ${heights[i].distance.toFixed(2)}m`;
        }
      }
  }
  t.diagnostic(
    JSON.stringify({ coverageSamples, cases: cases.length, ...peak }),
  );
  // Keep the original panel density: its small geometric variation is well
  // below the former 30 cm spikes and the corridor-boundary support jump.
  for (const kind of ['body', 'visual'])
    assert.ok(
      peak[kind] < 0.02,
      `${peak[`${kind}At`]}: ${kind} five-tap ripple ${(peak[kind] * 1000).toFixed(2)}mm exceeds 20mm`,
    );
});
