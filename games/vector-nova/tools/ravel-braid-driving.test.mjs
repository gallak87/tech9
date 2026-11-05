import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import createLevel from '../src/levels/ravel/index.js';
import { createVehicleState } from '../src/physics/index.js';
import { getRacerControl } from '../src/race/racers.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';

const descriptor = createLevel();
const track = descriptor.createTrack();
const collisionWorld = descriptor.createCollisionWorld({ track });
const devices = descriptor.racing.createDevices(track);
after(() => collisionWorld.dispose());

// This drives the same CPU controls, road queries, devices and staged body used
// by the live race. The single actors avoid traffic obscuring a route failure.
async function driveBraid(chassisId, shipId) {
  const dynamics = await descriptor.createDynamics({ track, collisionWorld });
  const motion = descriptor.createRuntime({
    track,
    collisionWorld,
    dynamics,
    presentation: false,
  });
  const runtime = createDeviceRuntime({ track, devices, motion });
  const state = {
    ...createVehicleState(shipId),
    chassisId,
    distance: track.braid.start - 200,
    speed: 135,
    lateral: 0,
  };
  const events = [];
  let selectedBranch = null;
  let groundedCoreTicks = 0;
  let maximumSpeed = state.speed;
  runtime.reset({ state });
  try {
    for (
      let tick = 0;
      tick < 45 * 120 && state.distance < track.braid.end + 100;
      tick++
    ) {
      const input = getRacerControl(state, track, {
        runtime,
        devices,
        difficulty: 'hard',
        pace: 1,
      });
      events.push(
        ...runtime.advance(state, input, 1 / 120).map((event) => ({
          ...event,
          at: state.time,
        })),
      );
      runtime.update({});
      maximumSpeed = Math.max(maximumSpeed, state.speed);
      if (
        state.distance > track.braid.splitEnd + 40 &&
        state.distance < track.braid.mergeStart
      ) {
        selectedBranch ??= track.branchAt(state.distance, state.lateral).id;
        if (runtime.pose(1)?.grounded !== false) groundedCoreTicks++;
      }
    }
    return { state, events, selectedBranch, groundedCoreTicks, maximumSpeed };
  } finally {
    runtime.dispose();
    dynamics.dispose();
  }
}

for (const [branch, chassisId, shipId] of [
  ['inner', 'mule', 'bastion'],
  ['middle', 'manta', 'bastion'],
  ['outer', 'rook', 'kestrel'],
]) {
  test(`the real CPU driver selects the ${branch} ribbon and drives through its common merge`, async () => {
    const result = await driveBraid(chassisId, shipId);
    const { state, events } = result;
    assert.equal(
      result.selectedBranch,
      branch,
      'the driver must take its selected route from the fan',
    );
    assert.ok(
      result.groundedCoreTicks > 120,
      'the ship drives the ribbon, not an airborne shortcut',
    );
    assert.ok(
      state.distance >= track.braid.end + 100,
      'ordinary controls reach the supported merge',
    );
    assert.ok(
      Math.abs(state.lateral) < track.mainWidth / 2 - 5,
      'the whole ship rejoins the common road',
    );
    assert.ok(Number.isFinite(state.speed) && state.speed > 40);
    assert.equal(
      events.filter((event) => event.type === 'road-departure').length,
      0,
    );
    assert.equal(
      events.filter((event) => event.type === 'jump-miss').length,
      0,
    );
    assert.equal(
      events.filter(
        (event) =>
          event.type === 'jump-transfer' && event.payload.outcome !== 'landed',
      ).length,
      0,
    );
    if (branch === 'outer') {
      const transfer = events.find(
        (event) =>
          event.type === 'jump-transfer' &&
          event.payload.id === 'outer-transfer',
      );
      assert.equal(
        transfer?.payload.outcome,
        'landed',
        'outside route crosses its actual gap and lands',
      );
      assert.ok(
        events.some(
          (event) =>
            event.type === 'pickup-activate' &&
            event.payload.deviceId === 'ravel-outer-long-vector',
        ),
        'the longer branch earns its sustained Vector strip',
      );
      const activated = events.find(
        (event) =>
          event.type === 'pickup-activate' &&
          event.payload.deviceId === 'ravel-outer-long-vector',
      );
      const exited = events.find(
        (event) =>
          event.type === 'pickup-exit' &&
          event.payload.deviceId === 'ravel-outer-long-vector',
      );
      assert.ok(
        exited && exited.at - activated.at > 1,
        'the real boost contact lasts longer than a brief pickup',
      );
    } else {
      assert.ok(
        !events.some(
          (event) =>
            event.type === 'jump-launch' &&
            event.payload.id === 'outer-transfer',
        ),
        'other ribbons keep their supported merge',
      );
    }
  });
}
