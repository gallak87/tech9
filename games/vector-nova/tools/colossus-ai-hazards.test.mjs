import assert from 'node:assert/strict';
import test from 'node:test';
import { createColossusTrack } from '../src/levels/colossus/track/model.js';
import { createColossusRuntime } from '../src/levels/colossus/runtime.js';
import { createColossusCollisionWorld } from '../src/levels/colossus/collision.js';
import { createColossusDynamics } from '../src/levels/colossus/dynamics.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createVehicleState, getVehiclePace } from '../src/physics/index.js';
import { getRacerControl } from '../src/race/racers.js';

const DT = 1 / 120;
const track = createColossusTrack();
let collisionWorld, dynamics;
test.before(async () => {
  collisionWorld = createColossusCollisionWorld({ track });
  dynamics = await createColossusDynamics({
    track,
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  });
});
test.after(() => {
  dynamics?.dispose();
  collisionWorld?.dispose();
});

// Short native approaches use the production machinery, physical hulls and
// ordinary Hard driver. No renderer, authored motion or upgraded player build.
function approach(
  shipId,
  energy,
  { start, end, time = 0, nearby = [], jump, chassisId },
) {
  dynamics.reset();
  const runtime = createColossusRuntime({
    track,
    collisionWorld,
    dynamics,
    presentation: false,
  });
  const state = {
    ...createVehicleState(shipId),
    ...(chassisId ? { chassisId } : {}),
    distance: start,
    lateral: 4,
    speed: getVehiclePace(shipId, track.pace)[
      energy ? 'boostSpeed' : 'cruiseSpeed'
    ],
    energy,
    time,
  };
  runtime.reset({ state });
  const result = {
    initial: { shipId, chassisId, energy, start, end, time },
    contacts: 0,
    impacts: 0,
    airborne: 0,
    ticks: 0,
    transfers: [],
    state,
  };
  try {
    for (; result.ticks < 120 * 20 && state.distance < end; result.ticks++) {
      const control = getRacerControl(state, track, {
        runtime,
        lane: 4,
        pace: 1,
        difficulty: 'hard',
        nearby,
      });
      for (const event of runtime.advance(state, control, DT)) {
        if (event.type === 'colossus-conveyor-contact') result.contacts++;
        if (event.type === 'impact') result.impacts++;
        if (event.type === 'jump-transfer')
          result.transfers.push(event.payload);
      }
      if (runtime.pose(1)?.grounded === false) result.airborne++;
    }
    assert.ok(state.distance >= end, JSON.stringify(result));
    assert.equal(
      state.resetCount,
      0,
      'avoidance cannot recover past machinery: ' + JSON.stringify(result),
    );
    if (jump) {
      assert.ok(result.airborne > 0, 'the ordinary driver must actually jump');
      assert.ok(
        result.transfers.some(
          (event) => event.id === jump.id && event.outcome === 'landed',
        ),
        JSON.stringify(result),
      );
    } else
      assert.equal(
        result.airborne,
        0,
        'work-bed avoidance stays on the road: ' + JSON.stringify(result),
      );
    return result;
  } finally {
    runtime.dispose();
  }
}

for (const shipId of ['kestrel', 'shrike', 'bastion', 'needle']) {
  test(`${shipId}: anticipate both opposing crossfeeds with empty and full reserve`, () => {
    for (const energy of [0, 100]) {
      const result = approach(shipId, energy, {
        start: track.belts[0].start - 590,
        end: track.belts[1].end + 40,
      });
      assert.equal(result.contacts, 0, JSON.stringify(result));
      assert.equal(result.impacts, 0, JSON.stringify(result));
    }
  });

  test(`${shipId}: settle successive alternating presses without a machine impact`, () => {
    for (const energy of [0, 100]) {
      const result = approach(shipId, energy, {
        start: track.presses[0].distance - 500,
        end: track.presses[2].distance + 60,
      });
      assert.equal(result.impacts, 0, JSON.stringify(result));
    }
  });

  test(`${shipId}: moving ejector approaches keep physical forward progress`, () => {
    for (const energy of [0, 100])
      for (const ejector of track.ejectors) {
        const result = approach(shipId, energy, {
          start: ejector.distance - 550,
          end: ejector.distance + 100,
        });
        assert.equal(result.impacts, 0, JSON.stringify(result));
      }
  });

  test(`${shipId}: hazard planning leaves all three real transfer takeoffs and landings intact`, () => {
    for (const jump of track.jumps) {
      const result = approach(shipId, 100, {
        start: jump.takeoff - 200,
        end: jump.landingStart + 50,
        jump,
      });
      assert.equal(result.impacts, 0, JSON.stringify(result));
    }
  });
}

// Rival contact meshes are distinct from the four player hulls. Cover the
// balanced Rook, widest Manta and longest Pike rather than substituting skins.
for (const [chassisId, shipId] of [
  ['rook', 'kestrel'],
  ['manta', 'bastion'],
  ['pike', 'needle'],
]) {
  test(`${chassisId}: actual rival chassis clears opposing belts, presses and the reverse ejector`, () => {
    for (const [start, end] of [
      [track.belts[0].start - 590, track.belts[1].end + 40],
      [track.presses[0].distance - 500, track.presses[2].distance + 60],
      [track.ejectors[1].distance - 550, track.ejectors[1].distance + 100],
    ]) {
      const result = approach(shipId, 100, { start, end, chassisId });
      assert.equal(result.impacts, 0, JSON.stringify(result));
      if (start === track.belts[0].start - 590)
        assert.equal(result.contacts, 0, JSON.stringify(result));
    }
  });
}

test('half-cycle machine phases remain traversable rather than relying on one startup clock', () => {
  const press = approach('kestrel', 100, {
    start: track.presses[0].distance - 500,
    end: track.presses[2].distance + 60,
    time: 3.2,
  });
  assert.equal(press.impacts, 0, JSON.stringify(press));
  for (const ejector of track.ejectors) {
    const result = approach('kestrel', 100, {
      start: ejector.distance - 550,
      end: ejector.distance + 100,
      time: 3.4,
    });
    assert.equal(result.impacts, 0, JSON.stringify(result));
  }
});

test('native machine clock and pure hazard intent replay identically after restoring a checkpoint', () => {
  dynamics.reset();
  const runtime = createColossusRuntime({
    track,
    collisionWorld,
    dynamics,
    presentation: false,
  });
  const state = {
    ...createVehicleState(),
    distance: track.presses[0].distance - 400,
    speed: 130,
    lateral: 4,
    time: 1,
  };
  runtime.reset({ state });
  const options = { runtime, lane: 4, pace: 1, difficulty: 'hard' };
  const tick = () => {
    const control = getRacerControl(state, track, options);
    const events = runtime.advance(state, control, DT);
    return { control, events, state: { ...state } };
  };
  try {
    for (let index = 0; index < 80; index++) tick();
    const saved = structuredClone({
      state,
      runtime: runtime.snapshot(),
      dynamics: dynamics.snapshot(),
    });
    const expected = Array.from({ length: 160 }, tick);
    Object.assign(state, saved.state);
    runtime.restore(saved.runtime);
    dynamics.restore(saved.dynamics);
    assert.deepEqual(Array.from({ length: 160 }, tick), expected);
  } finally {
    runtime.dispose();
  }
});
