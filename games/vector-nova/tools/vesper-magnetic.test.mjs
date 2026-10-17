import test from 'node:test';
import assert from 'node:assert/strict';
import { createVesperTrack } from '../src/levels/vesper/track/model.js';
import { createVesperRuntime } from '../src/levels/vesper/runtime.js';
import { getRacerControl } from '../src/race/racers.js';
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

test('Vesper tree-side hull straddles recover through the physical barrier instead of hanging', async (t) => {
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
    let released = false;
    for (let tick = 0; tick < 240; tick++) {
      body.stage(
        state,
        { throttle: 1, steer: Math.sign(lateral) * 0.5 },
        1 / 120,
      );
      dynamics.step(1 / 120);
      body.finish(state);
      released ||= Boolean(body.snapshot().edgeEscape);
    }
    assert.ok(
      released,
      'straddling the production rail activates edge release',
    );
    assert.ok(Math.abs(state.lateral) < 11, 'actual hull clears the wall');
    assert.ok(
      state.speed > 25 && state.distance > distance + 10,
      'racer drives away from the formerly pinned tree turn',
    );
  }
});
