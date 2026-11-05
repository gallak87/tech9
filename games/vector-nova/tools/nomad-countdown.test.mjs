import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { Vector3 } from 'three';
import createLevel from '../src/levels/nomad/index.js';
import { sampleCarrierMotion } from '../src/levels/nomad/motion.js';
import {
  sampleNomadGroundMotion,
  NOMAD_GROUND_GROUP,
} from '../src/levels/nomad/ground-motion.js';
import { createVehicleState } from '../src/physics/index.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import {
  captureInitial,
  stageSessionCountdown,
} from '../src/core/session-runtime.js';

const level = createLevel();
const track = level.createTrack();
const collisionWorld = level.createCollisionWorld({ track });
let dynamics, player, rival, playerMotion, rivalMotion, state, rivalState;
const neutral = {
  throttle: 1,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};
const copy = (value) => JSON.parse(JSON.stringify(value));

before(async () => {
  dynamics = await level.createDynamics({ track, collisionWorld });
  playerMotion = level.createRuntime({
    track,
    collisionWorld,
    dynamics,
    settings: { steeringAssist: 0.3 },
  });
  rivalMotion = level.createRuntime({
    track,
    collisionWorld,
    dynamics,
    settings: { steeringAssist: 0.3 },
    presentation: false,
  });
  const devices = level.racing.createDevices(track);
  player = createDeviceRuntime({ track, devices, motion: playerMotion });
  rival = createDeviceRuntime({
    track,
    devices,
    motion: rivalMotion,
    combatId: 'countdown-rival',
  });
});

after(() => {
  player?.dispose();
  rival?.dispose();
  dynamics?.dispose();
  collisionWorld.dispose();
});

function reset() {
  dynamics.reset();
  state = createVehicleState('kestrel');
  rivalState = { ...createVehicleState('needle'), distance: -12, lateral: 4 };
  player.reset({ reason: 'fresh-lap', seed: 79, state });
  rival.reset({ reason: 'fresh-lap', seed: 79, state: rivalState });
}

function stage(phase) {
  stageSessionCountdown(
    {
      state,
      runtime: player,
      racers: { opponents: [{ state: rivalState, runtime: rival }] },
    },
    phase,
  );
}

function snapshot() {
  return {
    player: captureInitial(state, player),
    rival: captureInitial(rivalState, rival),
    dynamics: copy(dynamics.snapshot()),
  };
}

function assertSupported(runtime, vehicle, phase) {
  const frame = track.surfaceAtTime(vehicle.distance, vehicle.lateral, phase);
  const pose = runtime.pose(1);
  const offset = pose.position.clone().sub(frame.position);
  assert.ok(
    Math.abs(offset.dot(frame.right)) < 1e-8,
    'Locked ship stays centered on its real moving deck',
  );
  assert.ok(Math.abs(offset.dot(frame.tangent)) < 1e-8);
  assert.ok(
    offset.dot(frame.up) > 0.5,
    'Whole-hull hover clearance remains present',
  );
}

test('actual grid, Native skins and all presentation clocks move before green without a race tick', () => {
  reset();
  const initialVehicles = copy([state, rivalState]);
  const firstPose = player.pose(1).position.clone();
  for (const phase of [-3, -2.5, -1.25, -0.1]) {
    stage(phase);
    assert.deepEqual(
      [state, rivalState],
      initialVehicles,
      'No vehicle time, control, reserve or progress advance',
    );
    assert.equal(
      player.snapshot().countdownOffset,
      phase,
      'Device wrapper forwards the staging hook',
    );
    assert.equal(track.presentationTime, phase);
    assertSupported(player, state, phase);
    assertSupported(rival, rivalState, phase);
    const groups = new Map(
      dynamics.snapshot().world.motionGroups.map((group) => [group.id, group]),
    );
    for (const carrier of track.carriers) {
      const actual = groups.get(carrier.id);
      const expected = sampleCarrierMotion(carrier, phase);
      assert.ok(
        new Vector3()
          .copy(actual.translation)
          .distanceTo(expected.translation) < 1e-10,
      );
      assert.ok(
        new Vector3().copy(actual.velocity).distanceTo(expected.velocity) <
          1e-10,
      );
    }
    const ground = groups.get(NOMAD_GROUND_GROUP);
    assert.ok(
      new Vector3()
        .copy(ground.translation)
        .distanceTo(sampleNomadGroundMotion(track, phase).translation) < 1e-10,
    );
  }
  assert.ok(
    firstPose.distanceTo(player.pose(1).position) > 0.1,
    'The grid is actually carried by a moving rig',
  );
});

test('green restores the exact deterministic initial state and the first live tick matches a fresh race', () => {
  reset();
  const initial = snapshot();
  for (const phase of [-3, -2.2, -1.4, -0.1, 0]) stage(phase);
  assert.deepEqual(
    snapshot(),
    initial,
    'Countdown wall time is excluded from replay initial state',
  );
  player.advance(state, neutral, 1 / 120);
  const afterPreroll = snapshot();
  reset();
  player.advance(state, neutral, 1 / 120);
  assert.deepEqual(
    snapshot(),
    afterPreroll,
    'No Native/ship start-phase teleport or changed first-tick physics',
  );
});

test('paused countdown snapshots hold their phase, restore transactionally and resume into zero', () => {
  reset();
  const initial = snapshot();
  stage(-1.25);
  const retained = snapshot();
  for (let i = 0; i < 60; i++) {
    player.pose(1);
    rival.pose(1);
  }
  assert.deepEqual(
    snapshot(),
    retained,
    'Pose reads during pause/inspection cannot move the world',
  );
  stage(-0.5);
  player.restore(retained.player.runtime);
  rival.restore(retained.rival.runtime);
  dynamics.restore(retained.dynamics);
  assert.deepEqual(snapshot(), retained);
  const rejected = copy(playerMotion.snapshot());
  rejected.motion.mode = 'invalid';
  assert.throws(() => playerMotion.restore(rejected), /Invalid flight runtime/);
  assert.equal(
    track.presentationTime,
    -1.25,
    'Rejected nested restore preserves the exact preroll phase',
  );
  assert.deepEqual(snapshot(), retained);
  assert.throws(() => player.stageCountdown(state, 0.1), /pre-start phase/);
  stage(0);
  assert.deepEqual(snapshot(), initial);
});
