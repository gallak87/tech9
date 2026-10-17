import test from 'node:test';
import assert from 'node:assert/strict';
import { createVesperTrack } from '../src/levels/vesper/track/model.js';
import { createVesperRuntime } from '../src/levels/vesper/runtime.js';
import {
  getRacerControl,
  createRacers,
  RACE_GRID,
} from '../src/race/racers.js';
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

test('both Vesper transfers retain forward momentum through physical landing and magnetic capture', async (t) => {
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
  for (const scenario of ['crown-fast', 'branch-runup']) {
    dynamics.reset();
    const state = { ...createVehicleState(), ...track.scenarios[scenario] };
    runtime.reset({ state });
    const controls = () =>
      getRacerControl(state, track, {
        runtime,
        difficulty: 'hard',
        lane: scenario === 'branch-runup' ? 8.5 : 0,
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

// User reproduction: Quick Race, nine opponents, hold Up without steering or boost.
// This previously kept the ship magnetized over the empty inside of the first bend.
test('Vesper full-field Up-only starts cannot hover across empty space on any difficulty', async () => {
  const definition = createVesperLevel();
  const track = definition.createTrack();
  const collisionWorld = definition.createCollisionWorld({ track });
  try {
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
      const racers = createRacers({ track, devices, dynamics, createRuntime });
      const race = createRace(track, { rulesId: runtime.rulesId });
      try {
        runtime.reset({ reason: 'initialize', state });
        dynamics.reset();
        racers.reset({ enabled: true, difficulty });
        runtime.reset({ reason: 'fresh-lap', state });
        let departure,
          recovered,
          unsupportedTicks = 0;
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
          const leaving = events.find(({ type }) => type === 'road-departure');
          if (leaving) departure = { ...leaving.payload, time: state.time };
          const recovery = events.find(({ type }) => type === 'road-recovery');
          if (recovery) {
            recovered = recovery;
            assert.ok(
              Math.abs(state.time - departure.time - 1.5) < 1 / 120 + 1e-7,
            );
            assert.equal(state.distance, departure.distance);
            assert.equal(state.lateral, 0);
            assert.equal(state.speed, 0);
          }
          if (runtime.pose(1)?.recovering) {
            unsupportedTicks++;
            assert.equal(
              actors[0].read().support,
              null,
              'off-road ship has no support joint',
            );
            assert.equal(runtime.pose(1).grounded, false);
            assert.equal(
              state.distance,
              departure.distance,
              'flight across the bend earns no progress',
            );
          } else {
            assert.ok(
              Math.abs(state.lateral) <= track.width / 2 + 0.15,
              'magnetic support is finite',
            );
          }
        }
        assert.ok(
          departure && recovered && unsupportedTicks >= 175,
          `${difficulty} must exercise the reported departure and recovery`,
        );
      } finally {
        racers.dispose();
        runtime.dispose();
        dynamics.dispose();
      }
    }
  } finally {
    collisionWorld.dispose();
  }
});
