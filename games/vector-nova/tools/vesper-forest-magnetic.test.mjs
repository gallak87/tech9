import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createVesperTrack } from '../src/levels/vesper-forest/track/model.js';
import { createVesperRuntime } from '../src/levels/vesper-forest/runtime.js';
import {
  getRacerControl,
  createRacers,
  RACE_GRID,
} from '../src/race/racers.js';
import createNacreLevel from '../src/levels/nacre/index.js';
import createVesperForestLevel from '../src/levels/vesper-forest/index.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { createRace } from '../src/race/index.js';
import { advanceSession } from '../src/core/session-runtime.js';
import { createVesperCollisionWorld } from '../src/levels/vesper-forest/collision.js';
import { createMagneticBody } from '../src/physics/magnetic-body.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createVehicleState } from '../src/physics/index.js';
import { getShip } from '../src/ships/catalog.js';

// Actual Vesper Forest geometry and actual Kestrel hull: the old fixed support target
// lost up to 119 m/s in one tick here even without touching a collider.
test('Vesper Forest tree turns and descending road preserve momentum between genuine contacts', async (t) => {
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

test('the Bloomspan corkscrew inverts and unwinds at cruising pace without launches or false braking', async (t) => {
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
  const pace = [];
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
      const maxTicks = Math.ceil(((end - start + 80) / (speed * 0.8)) * 120);
      let inverted = false,
        bodyRoll = 0,
        peakRoll = 0,
        minSpeed = speed,
        previousBank = null;
      let ticks = 0;
      for (; ticks < maxTicks && state.distance < end + 40; ticks++) {
        const before = state.speed;
        minSpeed = Math.min(minSpeed, before);
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
        const pose = runtime.pose(1);
        assert.equal(pose?.grounded, true, `road lost at ${state.distance}`);
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
        const frame = track.sample(state.distance);
        // Remove the climb pitch before measuring the actual hull's roll.
        const unbankedUp = new T.Vector3(0, 1, 0)
          .addScaledVector(frame.tangent, -frame.tangent.y)
          .normalize();
        const bodyUp = new T.Vector3(0, 1, 0).applyQuaternion(pose.quaternion);
        const relativeUp = bodyUp.dot(unbankedUp);
        inverted ||= relativeUp < -0.95;
        const unbankedRight = new T.Vector3().crossVectors(
          unbankedUp,
          frame.tangent,
        );
        const bank = Math.atan2(-bodyUp.dot(unbankedRight), relativeUp);
        if (previousBank !== null) {
          const change = bank - previousBank;
          bodyRoll += Math.atan2(Math.sin(change), Math.cos(change));
        }
        previousBank = bank;
        peakRoll = Math.max(peakRoll, bodyRoll);
        assert.ok(
          Math.abs(state.lateral) < 11.5,
          `lane lost at ${state.distance}: ${state.lateral}`,
        );
      }
      assert.ok(
        state.distance > end + 39 && inverted,
        `incomplete inversion ${lateral}/${speed} after ${ticks / 120}s: ${state.distance}m of ${end + 40}m, speed ${state.speed}, inverted ${inverted}`,
      );
      assert.ok(
        Math.abs(
          bodyRoll -
            (track.sample(state.distance).roll - track.sample(start - 40).roll),
        ) < 0.05 && peakRoll > Math.PI,
        `native hull rolls past inversion and unwinds ${lateral}/${speed}: peak ${peakRoll}, finish ${bodyRoll}`,
      );
      assert.ok(
        minSpeed > speed * 0.85,
        `corkscrew pace ${lateral}/${speed}: ${minSpeed}`,
      );
      const meanSpeed = (end - start + 80) / (ticks / 120);
      assert.ok(
        meanSpeed > speed * 0.85,
        `corkscrew average pace ${lateral}/${speed}`,
      );
      pace.push({ lateral, entry: speed, minimum: minSpeed, mean: meanSpeed });
    }
  }
  t.diagnostic(JSON.stringify({ pace }));
});

test('the Vesper Forest crown transfer retains forward momentum through physical landing and magnetic capture', async (t) => {
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

test('both Vesper transfers catch slow, cruising and boosted stock hulls without losing momentum', async (t) => {
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
  for (const jump of track.jumps)
    for (const shipId of ['kestrel', 'shrike', 'bastion', 'needle'])
      for (const [speed, boost] of [
        [65, false],
        [getShip(shipId).handling.cruiseSpeed, false],
        [getShip(shipId).handling.boostSpeed, true],
      ]) {
        dynamics.reset();
        const state = {
          ...createVehicleState(shipId),
          distance: jump.takeoff - 2,
          speed,
        };
        runtime.reset({ state });
        let launched = false,
          transfer;
        for (let tick = 0; tick < 900 && !transfer; tick++) {
          const events = runtime.advance(
            state,
            { throttle: 1, steer: 0, boost },
            1 / 120,
          );
          launched ||= events.some(({ type }) => type === 'jump-launch');
          transfer = events.find(({ type }) => type === 'jump-transfer');
        }
        const label = `${jump.id}/${shipId}/${speed}/${boost}`;
        assert.ok(launched, `${label}: must cross a real gap`);
        assert.equal(transfer?.payload.outcome, 'landed', label);
        assert.ok(
          state.distance >= jump.landingStart &&
            state.distance < jump.landingEnd,
          `${label}: must land inside the authored receiver`,
        );
        assert.ok(
          state.speed > speed * 0.85,
          `${label}: touchdown speed ${state.speed}`,
        );
        for (let tick = 0; tick < 30; tick++) {
          const events = runtime.advance(
            state,
            { throttle: 1, steer: 0, boost },
            1 / 120,
          );
          assert.equal(
            runtime.pose(1)?.grounded,
            true,
            `${label}: capture lost`,
          );
          assert.equal(
            events.some(({ type }) =>
              ['road-departure', 'road-recovery'].includes(type),
            ),
            false,
            label,
          );
          assert.ok(
            state.speed > speed * 0.85,
            `${label}: settled speed ${state.speed}`,
          );
        }
      }
});

test('Vesper Forest tree-side hull straddles separate or recover instead of hanging', async (t) => {
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
    let departure, recovered, freed;
    for (let tick = 0; tick < 480 && !recovered && !freed; tick++) {
      body.stage(
        state,
        { throttle: 1, steer: Math.sign(lateral) * 0.5 },
        1 / 120,
      );
      dynamics.step(1 / 120);
      const events = body.finish(state);
      departure ??= events.find(({ type }) => type === 'road-departure');
      recovered ??= events.find(({ type }) => type === 'road-recovery');
      freed ||=
        !departure &&
        state.distance > distance + 20 &&
        state.speed > 20 &&
        Math.abs(state.lateral) < track.width / 2 - 1;
      if (body.pose().recovering) {
        assert.equal(actor.read().support, null);
        assert.equal(state.distance, departure.payload.distance);
      }
    }
    // A convex controller can push clear immediately; recovery is needed only
    // if the hull remains trapped. Both paths must leave the racer driveable.
    if (freed) continue;
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
  ['vesper-forest', createVesperForestLevel],
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
            if (level === 'vesper-forest' && tick === 480) {
              // The broader opening no longer guarantees an incidental bump.
              // Stage one genuine close-pack contact, then keep the original
              // unsteered player input and all ten native actors advancing.
              const neighbour = racers.opponents.at(-1);
              Object.assign(neighbour.state, {
                distance: state.distance + 5,
                lateral: state.lateral + 0.4,
                speed: state.speed - 2,
              });
              Object.assign(neighbour.prev, neighbour.state);
              neighbour.runtime.reset({ state: neighbour.state });
            }
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
test('crowded Vesper Forest touchdown absorbs normal motion without false forward braking', async (t) => {
  const definition = createVesperForestLevel({ shape: false });
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
  // Start a packed field on the approach. Contact tuning may change the order
  // over a whole lap; this regression must still exercise a crowded landing.
  const approach = track.jumps[0].takeoff - 80;
  Object.assign(state, { distance: approach, speed: 130 });
  runtime.reset({ state });
  for (const opponent of racers.opponents) {
    opponent.state.distance =
      approach + RACE_GRID[opponent.specification.id].distance;
    opponent.state.speed = 130;
    Object.assign(opponent.prev, opponent.state);
    opponent.runtime.reset({ state: opponent.state });
  }
  let landed = false,
    settledTicks = 0,
    supportedTicks = 0,
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
    if (actor.support) {
      supportedTicks++;
      const normal = new T.Vector3(0, 1, 0).applyQuaternion(
        actor.support.quaternion,
      );
      assert.ok(
        new T.Vector3(0, 1, 0).applyQuaternion(actor.quaternion).dot(normal) >
          0.9999,
        'crowded touchdown retains road alignment',
      );
      assert.ok(
        Math.abs(actor.velocity.dot(normal)) < 1e-6,
        'magnetic support absorbs normal bounce immediately',
      );
    }
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
    supportedTicks === settledTicks - 1 && nearbyTicks > 0,
    'support returns on the first tick after touchdown beside the real race field',
  );
});
