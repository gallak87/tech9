import test from 'node:test';
import assert from 'node:assert/strict';
import { createRavelTrack } from '../src/levels/ravel/track/model.js';
import { installRavelBranches } from '../src/levels/ravel/track/branches.js';
import { installRavelWaves } from '../src/levels/ravel/waves.js';
import { createRavelRuntime } from '../src/levels/ravel/runtime.js';
import { createVehicleState, getVehiclePace } from '../src/physics/index.js';
import { assertTrackContract } from './level-checks/track-contract.mjs';

const track = createRavelTrack();
installRavelBranches(track);
installRavelWaves(track);
const coast = {
  throttle: 0,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};
const ships = ['kestrel', 'shrike', 'bastion', 'needle'];

/** Real tick crossing from just before the lip, with no test-launch shortcut. */
function crossJump(jump, shipId, speed, lateral = 0, heading = 0) {
  const runtime = createRavelRuntime({ track, presentation: false });
  const state = {
    ...createVehicleState(shipId),
    distance: jump.takeoff - 0.1,
    speed,
    lateral,
    heading,
  };
  runtime.reset({ state });
  let launchTime = null,
    transfer = null;
  const events = [];
  for (let i = 0; i < 1200 && !transfer; i++) {
    const batch = runtime.advance(state, coast, 1 / 120);
    events.push(...batch);
    if (batch.some((event) => event.type === 'jump-launch')) {
      const flight = runtime.snapshot().motion.flight;
      launchTime = state.time - (flight?.elapsed ?? 0);
    }
    transfer = batch.find((event) => event.type === 'jump-transfer');
  }
  const result = {
    id: jump.id,
    shipId,
    speed,
    lateral,
    heading,
    outcome: transfer?.payload.outcome ?? runtime.snapshot().motion.mode,
    airtime: launchTime === null ? null : state.time - launchTime,
    distance: state.distance,
    receiverRemaining: jump.landingEnd - state.distance,
    misses: events.filter((event) => event.type === 'jump-miss'),
    launches: events.filter((event) => event.type === 'jump-launch').length,
    transfers: events.filter((event) => event.type === 'jump-transfer').length,
  };
  runtime.dispose();
  return result;
}

test('Ravel is a closed physical 13.5 km reference circuit with a smooth lap seam', () => {
  assert.equal(track.closed, true);
  assert.equal(track.length, 13500);
  assert.equal(track.mainWidth, 100);
  assert.equal(track.roadHalfWidth, 50);
  assert.ok(track.width >= 300);
  assert.equal(track.braid.end - track.braid.start, 2800);
  assert.equal(track.braid.splitEnd - track.braid.start, 750);
  assert.equal(track.braid.end - track.braid.mergeStart, 500);
  assertTrackContract(track);
  const a = track.sampleBase(0),
    b = track.sampleBase(track.length - 0.001);
  assert.ok(a.position.distanceTo(b.position) < 0.0011);
  assert.ok(a.quaternion.angleTo(b.quaternion) < 0.001);
  assert.deepEqual(track.pace, {
    cruiseScale: 1.25,
    boostScale: 1.15,
    aerodynamicDragScale: 0.55,
    overspeedDeceleration: 0.4,
  });
});

test('four full corkscrews and large supported vertical sweeps are spread around the circuit', () => {
  assert.equal(track.rolls.length, 4);
  assert.deepEqual(
    track.rolls.map((roll) => roll.turns),
    [1, -1, 1, -1],
  );
  for (const roll of track.rolls) {
    assert.equal(roll.end - roll.start, 700);
    const middle = (roll.start + roll.end) / 2;
    assert.equal(track.isGap(middle), false);
    assert.ok(
      track.sampleBase(middle).up.y < -0.45,
      `${roll.id} is truly inverted`,
    );
  }
  let low = Infinity,
    high = -Infinity,
    steepClimb = 0,
    steepDive = 0,
    nearVerticalClimb = 0,
    nearVerticalDive = 0;
  for (let s = 0; s < track.length; s += 2) {
    if (track.isGap(s)) continue;
    const frame = track.sampleBase(s);
    low = Math.min(low, frame.position.y);
    high = Math.max(high, frame.position.y);
    if (frame.tangent.y > 0.5) steepClimb += 2;
    if (frame.tangent.y < -0.4) steepDive += 2;
    if (frame.tangent.y > 0.8) nearVerticalClimb += 2;
    if (frame.tangent.y < -0.8) nearVerticalDive += 2;
  }
  assert.ok(
    high - low > 500,
    'the supported course has monumental vertical extent',
  );
  assert.ok(steepClimb > 400, 'sustained steep climbs are real geometry');
  assert.ok(steepDive > 150, 'supported steep dives accompany the jumps');
  assert.ok(
    nearVerticalClimb > 400,
    'a broad nearly vertical climb remains supported',
  );
  assert.ok(
    nearVerticalDive > 200,
    'a broad nearly vertical plunge remains supported',
  );
});

test('the wide supported membrane has broad centreline bend radii', () => {
  let minimumRadius = Infinity;
  for (let s = 3; s < track.length - 3; s += 2) {
    if ([s - 2, s, s + 2].some((distance) => track.isGap(distance))) continue;
    const turn = track.tangentAt(s - 1).angleTo(track.tangentAt(s + 1));
    if (turn > 1e-8) minimumRadius = Math.min(minimumRadius, 2 / turn);
  }
  assert.ok(
    minimumRadius > 119,
    `100 m sheets retain at least 120 m bend radius: ${minimumRadius}`,
  );
});

test('six mandatory gaps have upright physical receivers and remain outside the braid', () => {
  assert.equal(track.mandatoryJumps.length, 6);
  assert.equal(track.jumps.filter((jump) => jump.optional).length, 2);
  for (const jump of track.mandatoryJumps) {
    assert.ok(jump.landingEnd - jump.landingStart > 230);
    assert.equal(track.isGap((jump.takeoff + jump.landingStart) / 2), true);
    assert.equal(track.isGap(jump.recovery), false);
    assert.ok(jump.landingEnd < track.length - 500);
    for (const distance of [jump.takeoff, jump.landingStart, jump.landingEnd]) {
      assert.ok(
        track.sampleBase(distance).up.y > 0.9,
        `${jump.id} has a level shelf`,
      );
    }
    assert.ok(
      jump.takeoff < track.braid.start || jump.takeoff > track.braid.end,
    );
  }
  const giant = track.mandatoryJumps.find((jump) => jump.hero);
  const from = track.sampleBase(giant.takeoff).position;
  const to = track.sampleBase(giant.landingStart).position;
  assert.ok(Math.hypot(from.x - to.x, from.z - to.z) > 400);
  assert.ok(from.y - to.y > 350);
  assert.ok(giant.landingEnd - giant.landingStart > 900);
});

test('every hull crosses every mandatory jump from cruise through fast boosted arrivals', () => {
  for (const shipId of ships) {
    const pace = getVehiclePace(shipId, track.pace);
    for (const jump of track.mandatoryJumps) {
      for (const speed of new Set([
        pace.cruiseSpeed,
        160,
        pace.boostSpeed,
        255,
      ])) {
        const result = crossJump(jump, shipId, speed);
        assert.equal(result.outcome, 'landed', JSON.stringify(result));
        assert.equal(result.launches, 1, JSON.stringify(result));
        assert.equal(result.transfers, 1, JSON.stringify(result));
        assert.equal(result.misses.length, 0, JSON.stringify(result));
        assert.ok(result.receiverRemaining > 0, JSON.stringify(result));
        if (jump.hero) {
          assert.ok(
            result.airtime >= 4.8 && result.airtime <= 5.3,
            JSON.stringify(result),
          );
          assert.ok(result.receiverRemaining > 90, JSON.stringify(result));
        }
      }
    }
  }
});

test('the giant transfer catches modest off-centre approaches at cruise and high speed', () => {
  const giant = track.mandatoryJumps.find((jump) => jump.hero);
  for (const shipId of ships) {
    for (const speed of [getVehiclePace(shipId, track.pace).cruiseSpeed, 255]) {
      for (const side of [-1, 1]) {
        const result = crossJump(giant, shipId, speed, side * 7, side * 0.007);
        assert.equal(result.outcome, 'landed', JSON.stringify(result));
      }
    }
  }
});
