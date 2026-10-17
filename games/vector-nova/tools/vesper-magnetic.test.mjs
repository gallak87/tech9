import test from 'node:test';
import assert from 'node:assert/strict';
import { createVesperTrack } from '../src/levels/vesper/track/model.js';
import { createVesperRuntime } from '../src/levels/vesper/runtime.js';
import {
  getRacerControl,
  createRacers,
  RACE_GRID,
} from '../src/race/racers.js';
import createNacreLevel from '../src/levels/nacre/index.js';
import createVesperLevel from '../src/levels/vesper/index.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { createRace } from '../src/race/index.js';
import { advanceSession } from '../src/core/session-runtime.js';
import { createVesperCollisionWorld } from '../src/levels/vesper/collision.js';
import { createMagneticBody } from '../src/physics/magnetic-body.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createVehicleState } from '../src/physics/index.js';

// Actual Vesper geometry and actual Kestrel hull: the old fixed support target
// lost up to 119 m/s in one tick here even without touching a collider.
test('Vesper tree turns and descending road preserve momentum between genuine contacts', async (t) => {
  const track = createVesperTrack();
  const collision = createVesperCollisionWorld({ track });
  const world = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track, collision),
  });
  t.after(() => {
    world.dispose();
    collision.dispose();
  });
  const actor = world.createActor();
  const body = createMagneticBody({ track, dynamics: world, actor });
  for (const distance of [300, 660, 680, 740, 760, 3520, 3660, 3940]) {
    for (const speed of [80, 160]) {
      const state = { ...createVehicleState(), distance, speed };
      body.reset(state);
      for (let tick = 0; tick < 12; tick++) {
        const before = state.speed;
        body.stage(state, { throttle: 1, steer: 0 }, 1 / 120);
        world.step(1 / 120);
        body.finish(state);
        assert.equal(
          actor.read().contacts.length,
          0,
          'probe stays inside the clear road',
        );
        assert.ok(
          before - state.speed < 1.3,
          `false braking at ${distance}m/${speed}m/s tick ${tick}: ${before} -> ${state.speed}`,
        );
      }
      assert.ok(
        state.speed > speed - 12,
        `lost cruising momentum at ${distance}m`,
      );
    }
  }
});

test('the Bloomspan corkscrew carries native hulls through a complete inversion without launches or false braking', async (t) => {
  const track = createVesperTrack();
  const collisionWorld = createVesperCollisionWorld({ track });
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  });
  const runtime = createVesperRuntime({
    track,
    collisionWorld,
    dynamics,
    presentation: false,
  });
  t.after(() => {
    runtime.dispose();
    dynamics.dispose();
    collisionWorld.dispose();
  });
  const { start, end } = track.inversions[0];
  for (const lateral of [-8, 0, 8]) {
    for (const speed of [112, 160]) {
      dynamics.reset();
      const state = {
        ...createVehicleState(),
        distance: start - 40,
        lateral,
        speed,
      };
      runtime.reset({ state });
      let inverted = false;
      for (let tick = 0; tick < 1400 && state.distance < end + 40; tick++) {
        const before = state.speed;
        const events = runtime.advance(
          state,
          {
            ...getRacerControl(state, track, {
              runtime,
              difficulty: 'hard',
              lane: lateral,
            }),
            throttle: 1,
            brake: 0,
            boost: speed === 160,
          },
          1 / 120,
        );
        assert.equal(
          runtime.pose(1)?.grounded,
          true,
          `road lost at ${state.distance}`,
        );
        assert.equal(
          events.some(({ type }) =>
            ['road-departure', 'road-recovery', 'impact'].includes(type),
          ),
          false,
          `unexpected contact at ${state.distance}`,
        );
        assert.ok(
          before - state.speed < 1.3,
          `false braking at ${state.distance}: ${before} -> ${state.speed}`,
        );
        inverted ||= track.sample(state.distance).up.y < -0.95;
        assert.ok(
          Math.abs(state.lateral) < 11.5,
          `lane lost at ${state.distance}: ${state.lateral}`,
        );
      }
      assert.ok(
        state.distance > end + 39 && inverted,
        `incomplete inversion ${lateral}/${speed}`,
      );
    }
  }
});

test('the Vesper crown transfer retains forward momentum through physical landing and magnetic capture', async (t) => {
  const track = createVesperTrack();
  const collisionWorld = createVesperCollisionWorld({ track });
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  });
  const runtime = createVesperRuntime({
    track,
    collisionWorld,
    dynamics,
    presentation: false,
  });
  t.after(() => {
    runtime.dispose();
    dynamics.dispose();
    collisionWorld.dispose();
  });
  for (const scenario of ['crown-fast']) {
    dynamics.reset();
    const state = { ...createVehicleState(), ...track.scenarios[scenario] };
    runtime.reset({ state });
    const controls = () =>
      getRacerControl(state, track, {
        runtime,
        difficulty: 'hard',
        lane: 0,
      });
    let flight = false,
      transfer;
    for (let tick = 0; tick < 600 && !transfer; tick++) {
      const events = runtime.advance(state, controls(), 1 / 120);
      flight ||= runtime.pose(1)?.grounded === false;
      transfer = events.find(({ type }) => type === 'jump-transfer');
    }
    assert.ok(flight, `${scenario} must actually leave the road`);
    assert.equal(transfer?.payload.outcome, 'landed', scenario);
    assert.ok(
      state.speed > 100,
      `${scenario} loses momentum on landing: ${state.speed}`,
    );
    for (let tick = 0; tick < 30; tick++) {
      runtime.advance(state, controls(), 1 / 120);
      assert.ok(
        state.speed > 80,
        `${scenario} false braking during magnetic capture: ${state.speed}`,
      );
    }
  }
});

test('Vesper tree-side hull straddles recover at their departure station instead of hanging', async (t) => {
  const track = createVesperTrack();
  const collision = createVesperCollisionWorld({ track });
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track, collision),
  });
  t.after(() => {
    dynamics.dispose();
    collision.dispose();
  });
  const actor = dynamics.createActor();
  const body = createMagneticBody({ track, dynamics, actor });
  for (const [distance, lateral] of [
    [760, -13.5],
    [1100, 13.5],
  ]) {
    const state = { ...createVehicleState(), distance, lateral };
    body.reset(state);
    let departure, recovered;
    for (let tick = 0; tick < 480 && !recovered; tick++) {
      body.stage(
        state,
        { throttle: 1, steer: Math.sign(lateral) * 0.5 },
        1 / 120,
      );
      dynamics.step(1 / 120);
      const events = body.finish(state);
      departure ??= events.find(({ type }) => type === 'road-departure');
      recovered ??= events.find(({ type }) => type === 'road-recovery');
      if (body.pose().recovering) {
        assert.equal(actor.read().support, null);
        assert.equal(state.distance, departure.payload.distance);
      }
    }
    assert.ok(
      departure && recovered,
      'straddling the production rail starts bounded recovery',
    );
    assert.equal(state.lateral, 0);
    assert.equal(state.distance, departure.payload.distance);
    assert.equal(state.speed, 0);
    assert.equal(body.pose().grounded, true);
  }
});

// User reproduction: Quick Race, nine opponents, hold Up without boost.
// Check both the regraded course and an unchanged course that also showed hops.
for (const [level, createLevel] of [
  ['vesper', createVesperLevel],
  ['nacre', createNacreLevel],
]) {
  test(`${level} full-field starts retain magnetic adhesion through ordinary bumps`, async () => {
    const definition = createLevel({ shape: false });
    const track = definition.createTrack();
    const collisionWorld = definition.createCollisionWorld({ track });
    try {
      let contacts = 0;
      for (const difficulty of ['easy', 'medium', 'hard']) {
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
        const devices = definition.racing.createDevices(track);
        const createRuntime = () =>
          createDeviceRuntime({
            track,
            devices,
            identity: definition.racing.identity,
            motion: definition.racing.createMotion({
              track,
              collisionWorld,
              dynamics,
              presentation: false,
            }),
          });
        const state = { ...createVehicleState(), ...RACE_GRID.player };
        const runtime = createRuntime();
        const racers = createRacers({
          track,
          devices,
          dynamics,
          createRuntime,
        });
        const race = createRace(track, { rulesId: runtime.rulesId });
        try {
          runtime.reset({ reason: 'initialize', state });
          dynamics.reset();
          racers.reset({ enabled: true, difficulty });
          runtime.reset({ reason: 'fresh-lap', state });
          for (let tick = 0; tick < 960; tick++) {
            const events = advanceSession({
              state,
              input: { throttle: 1, steer: 0, boost: false },
              dt: 1 / 120,
              runtime,
              race,
              dynamics,
              racers,
              emit() {},
            });
            assert.equal(
              events.some(
                ({ type }) =>
                  type === 'road-departure' || type === 'road-recovery',
              ),
              false,
              `${level}/${difficulty} departed at ${state.distance}m`,
            );
            assert.equal(runtime.pose(1)?.grounded, true);
            const actor = actors[0].read();
            assert.ok(actor.support);
            const up = track.sample(state.distance).up;
            const heightError = actor.position
              .clone()
              .sub(actor.support.position)
              .dot(up);
            assert.ok(
              Math.abs(heightError) < 0.04,
              `${level}/${difficulty} hover error ${heightError}m at ${state.distance}m`,
            );
            contacts += actor.contacts.filter(
              ({ shape }) => shape.kind === 'racer',
            ).length;
            assert.ok(Math.abs(state.lateral) <= track.width / 2 + 0.15);
          }
          assert.ok(
            state.distance > 300,
            'ordinary bumps cannot strand the player',
          );
        } finally {
          racers.dispose();
          runtime.dispose();
          dynamics.dispose();
        }
      }
      assert.ok(
        contacts > 0,
        'the race set must include real player/racer contacts',
      );
    } finally {
      collisionWorld.dispose();
    }
  });
}

// The first crowded crown landing used to lose 48 m/s in a single tick even
// with zero contact impulse: a rigid clearance correction saturated the solve.
test('crowded Vesper touchdown absorbs normal motion without false forward braking', async (t) => {
  const definition = createVesperLevel({ shape: false });
  const track = definition.createTrack();
  const collisionWorld = definition.createCollisionWorld({ track });
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
  const devices = definition.racing.createDevices(track);
  const createRuntime = () =>
    createDeviceRuntime({
      track,
      devices,
      motion: definition.racing.createMotion({
        track,
        collisionWorld,
        dynamics,
        presentation: false,
      }),
    });
  const state = { ...createVehicleState(), ...RACE_GRID.player };
  const runtime = createRuntime();
  const racers = createRacers({ track, devices, dynamics, createRuntime });
  const race = createRace(track, { rulesId: runtime.rulesId });
  t.after(() => {
    racers.dispose();
    runtime.dispose();
    dynamics.dispose();
    collisionWorld.dispose();
  });
  runtime.reset({ reason: 'initialize', state });
  dynamics.reset();
  racers.reset({ enabled: true, difficulty: 'hard' });
  runtime.reset({ reason: 'fresh-lap', state });
  let landed = false,
    settledTicks = 0,
    captureTicks = 0,
    nearbyTicks = 0;
  for (let tick = 0; tick < 4200 && settledTicks < 35; tick++) {
    const input = getRacerControl(state, track, {
      runtime,
      devices,
      difficulty: 'hard',
      nearby: racers.opponents.map(({ state }) => state),
    });
    const events = advanceSession({
      state,
      input,
      dt: 1 / 120,
      runtime,
      race,
      dynamics,
      racers,
      emit() {},
    });
    const transfer = events.find(({ type }) => type === 'jump-transfer');
    if (transfer) {
      assert.equal(transfer.payload.outcome, 'landed');
      landed = true;
    }
    if (!landed) continue;
    settledTicks++;
    const actor = actors[0].read();
    captureTicks += Number(actor.support?.normalCompliance === true);
    nearbyTicks += Number(
      actors
        .slice(1)
        .some((other) => other.read().position.distanceTo(actor.position) < 12),
    );
    assert.ok(
      state.speed > 90,
      `false landing braking at ${state.distance}m: ${state.speed}m/s`,
    );
    assert.equal(
      events.some(({ type }) => type === 'road-departure'),
      false,
    );
  }
  assert.ok(landed && settledTicks === 35);
  assert.ok(
    captureTicks > 0 && nearbyTicks > 0,
    'touchdown settling happens beside the real race field',
  );
  assert.equal(
    actors[0].read().support.normalCompliance,
    false,
    'ordinary road adhesion returns after capture',
  );
});
