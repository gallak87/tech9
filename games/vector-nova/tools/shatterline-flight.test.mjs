import test from 'node:test';
import assert from 'node:assert/strict';
import { createShatterlineTrack } from '../src/levels/shatterline/track/model.js';
import {
  createShatterlineRuntime,
  SHATTERLINE_RULES,
} from '../src/levels/shatterline/runtime.js';
import { createVehicleState, getVehiclePace } from '../src/physics/index.js';
import { SHIPS } from '../src/ships/catalog.js';
import { sprintRunoutControl } from '../src/race/course.js';
import {
  inspectJump,
  inspectSprint,
  inspectDescent,
  inspectCompetition,
  FLIGHT_STEP,
  COAST,
} from './shatterline-inspect.mjs';

const track = createShatterlineTrack();
const clone = (value) => structuredClone(value);

test('Shatterline has twelve real gaps, three separated long flights and a grounded finish', () => {
  assert.equal(track.closed, false);
  assert.equal(track.jumps.length, 12);
  assert.deepEqual(
    track.jumps.filter((jump) => jump.hero).map((jump) => jump.id),
    ['severance', 'crown-shot', 'horizon-transfer'],
  );
  for (const jump of track.jumps) {
    assert.equal(
      track.surfaceCoverage((jump.takeoff + jump.landingStart) / 2),
      0,
    );
    assert.equal(track.surfaceCoverage(jump.recovery), 1);
    assert.ok(jump.landingStart < jump.landingEnd);
    const next = track.jumps.find(
      (candidate) => candidate.takeoff > jump.takeoff,
    );
    assert.ok(
      jump.landingEnd < (next?.takeoff ?? track.finishDistance),
      `${jump.id}: supported driving follows the receiving interval`,
    );
  }
  assert.equal(track.surfaceCoverage(track.finishDistance), 1);
  assert.ok(track.finishDistance < track.length);
});

test('the entire supported raceway visibly descends, including every receiving deck', () => {
  const summit = track.sample(0).position.y;
  const finish = track.sample(track.finishDistance).position.y;
  assert.ok(
    summit - finish > 2500,
    'the route descends a mountainside rather than connecting level shelves',
  );
  const minimumDownwardGrade = -Math.sin((2 * Math.PI) / 180);
  for (let distance = 0; distance < track.finishDistance; distance += 1) {
    if (!track.surfaceCoverage(distance)) continue;
    assert.ok(
      track.sample(distance).tangent.y < minimumDownwardGrade,
      `supported road stays downhill at ${distance}m`,
    );
  }
  for (const jump of track.jumps) {
    assert.ok(
      track.sample(jump.landingEnd).position.y <
        track.sample(jump.landingStart).position.y,
      `${jump.id} receiving runway continues downhill`,
    );
    for (const distance of [
      jump.takeoff - 0.1,
      jump.landingStart + 0.1,
      jump.landingEnd - 0.1,
    ])
      assert.ok(
        track.sample(distance).tangent.y < minimumDownwardGrade,
        `${jump.id} has no flat launch or landing shelf`,
      );
  }
});

test('authored source and arc coordinates round trip independently of the scenery spine', () => {
  let previousSpine = -Infinity,
    previousDistance = -Infinity;
  for (let source = 0; source <= track.sourceLength; source += 7) {
    const distance = track.distanceAt(source),
      spine = track.spineZAt(source);
    assert.ok(
      spine > previousSpine,
      `the scenery reference spine reverses at source ${source}`,
    );
    assert.ok(
      distance > previousDistance,
      'race progress remains monotone through the crossover',
    );
    assert.ok(Math.abs(track.sourceAtSpineZ(spine) - source) < 2e-8);
    assert.ok(Math.abs(track.sourceAt(distance) - source) < 1e-8);
    assert.ok(
      track.sample(distance).position.distanceTo(track.pointAtSource(source)) <
        1e-7,
    );
    previousSpine = spine;
    previousDistance = distance;
  }
});

test('the new descents carry continuous orthonormal frames through physical metre coordinates', () => {
  for (const descent of [...track.descents, ...track.variations]) {
    assert.ok(
      descent.end - descent.start > 500,
      `${descent.id} is a sustained driving section`,
    );
    for (let distance = descent.start; distance < descent.end; distance += 1) {
      const next = Math.min(distance + 1, descent.end);
      const a = track.sample(distance),
        b = track.sample(next);
      if (track.descents.includes(descent))
        assert.equal(
          track.surfaceCoverage(distance),
          1,
          'rolls retain a real supported road',
        );
      assert.ok(
        Math.abs(a.position.distanceTo(b.position) - (next - distance)) < 0.001,
        `physical metre precision at ${distance}`,
      );
      assert.ok(
        a.quaternion.angleTo(b.quaternion) < 0.015,
        `continuous driving frame at ${distance}`,
      );
      for (const axis of [a.right, a.up, a.tangent]) {
        assert.ok(axis.toArray().every(Number.isFinite));
        assert.ok(Math.abs(axis.lengthSq() - 1) < 1e-8);
      }
      assert.ok(Math.abs(a.right.dot(a.up)) < 1e-8);
      assert.ok(Math.abs(a.right.dot(a.tangent)) < 1e-8);
      assert.ok(a.right.clone().cross(a.up).distanceTo(a.tangent) < 1e-8);
    }
  }
});

test('each roll turns the real driving face upside down and returns upright before any jump', () => {
  assert.deepEqual(
    track.inversions.map((section) => section.id),
    ['service-corkscrew', 'overturn-descent'],
  );
  for (const inversion of track.inversions) {
    const start = track.sample(inversion.start),
      end = track.sample(inversion.end);
    assert.ok(
      Math.abs(end.roll - start.roll - Math.PI * 2 * inversion.turns) < 0.04,
      `${inversion.id} completes its authored rotations`,
    );
    assert.ok(start.up.y > 0 && end.up.y > 0, 'both joins are upright');
    let invertedMetres = 0;
    for (
      let distance = inversion.start;
      distance < inversion.end;
      distance += 1
    )
      if (track.sample(distance).up.y < 0) invertedMetres++;
    assert.ok(
      invertedMetres > 200,
      `${inversion.id} has a meaningful inverted driving reach`,
    );
  }
  for (const jump of track.jumps)
    for (const distance of [
      jump.takeoff - 1,
      jump.landingStart + 1,
      jump.landingEnd - 1,
    ])
      assert.ok(
        track.sample(distance).up.y > 0.9,
        `${jump.id} retains an upright flight corridor`,
      );
});

test('Overturn has opposite curved tubes and an exposed reverse corkscrew', () => {
  assert.equal(
    track.descents.find((section) => section.id === 'overturn-descent').kind,
    'tube',
  );
  assert.equal(track.tubes.length, 2);
  assert.ok(track.overturn.weaveEnd - track.overturn.weaveStart > 450);
  assert.equal(track.overturn.rollSegments.length, 3);
  assert.ok(track.sample(track.overturn.start).up.y > 0.9);
  assert.ok(track.sample(track.overturn.end).up.y > 0.9);
  for (const segment of track.overturn.rollSegments) {
    const rotation =
      track.sample(segment.end).roll - track.sample(segment.start).roll;
    assert.ok(
      Math.abs(rotation - (segment.to - segment.from)) < 0.04,
      `${segment.id} follows its signed roll`,
    );
  }
  for (const tube of track.tubes) {
    assert.equal(tube.radius, 35);
    assert.equal(tube.referenceLane, 'ceiling');
    assert.equal(tube.guidanceStart, tube.exitStart - 100);
    assert.equal(tube.guidanceEnd, tube.end);
    assert.ok(tube.exitStart - tube.entryEnd >= 340);
    assert.ok(track.sample(tube.start).up.y < 0);
    assert.ok(track.sample(tube.end).up.y < 0);
    const startYaw = Math.atan2(
      track.sample(tube.entryEnd).tangent.x,
      track.sample(tube.entryEnd).tangent.z,
    );
    const endYaw = Math.atan2(
      track.sample(tube.exitStart).tangent.x,
      track.sample(tube.exitStart).tangent.z,
    );
    assert.ok(
      (endYaw - startYaw) * (tube.axisBend === 'left' ? -1 : 1) > 0.05,
      'the physical enclosed axis bends in its authored direction',
    );
    for (
      let distance = tube.entryEnd;
      distance <= tube.exitStart;
      distance += 20
    ) {
      assert.equal(track.tubeAt(distance).id, tube.id);
      const ceiling = track.sampleSurface(distance, 0);
      const floor = track.sampleSurface(distance, Math.PI * tube.radius);
      const otherSeam = track.sampleSurface(distance, -Math.PI * tube.radius);
      assert.ok(floor.up.y > 0.65, 'the freely reached floor remains upright');
      assert.ok(ceiling.up.y < -0.65, 'the normal entry lane remains inverted');
      assert.ok(
        Math.abs(floor.position.distanceTo(ceiling.position) - 70) < 1e-8,
      );
      assert.ok(floor.position.distanceTo(otherSeam.position) < 1e-8);
      assert.ok(floor.up.distanceTo(otherSeam.up) < 1e-8);
      assert.ok(floor.tangent.y < 0 && ceiling.tangent.y < 0);
    }
  }
  const middle = (track.overturn.weaveStart + track.overturn.weaveEnd) / 2;
  assert.equal(track.tubeAt(middle), null);
  assert.equal(track.tubeProfile(middle), null);
  assert.equal(track.sampleSurface(middle, 0).kind, 'road');
  assert.equal(track.sampleSurface(middle, 0).viewBlend, 0);
  assert.equal(
    track.sampleSurface(middle, 0).hullSupport,
    undefined,
    'open ribbon preserves ordinary rail inset',
  );
});

test('Scissor Dive passes physically below its earlier road with separate hull and camera corridors', () => {
  assert.equal(
    track.width,
    50,
    'the authored driving surface is fifty metres wide',
  );
  assert.ok(
    track.crossings.length > 0,
    'the scissor contains an actual crossing',
  );
  for (const crossing of track.crossings) {
    const upper = track.sample(crossing.upperDistance).position;
    const lower = track.sample(crossing.lowerDistance).position;
    assert.ok(
      Math.hypot(upper.x - lower.x, upper.z - lower.z) < 0.1,
      'both reaches share the same horizontal position',
    );
    assert.ok(
      upper.y - lower.y > track.width + 32,
      'the full swept road, fixtures, and chase camera fit between the reaches',
    );
    assert.ok(crossing.upperDistance < crossing.lowerDistance);
    for (const [point, source] of [
      [upper, crossing.upperSource],
      [lower, crossing.lowerSource],
    ])
      assert.ok(
        Math.abs(track.nearestSourceAt(point) - source) < 0.001,
        'three-dimensional placement distinguishes the two crossing reaches',
      );
  }
});

test('all ships drive the new descents using ordinary inputs without losing magnetic support', (t) => {
  for (const descent of track.descents)
    for (const ship of SHIPS)
      for (const speed of [
        getVehiclePace(ship.id, track.pace).cruiseSpeed,
        getVehiclePace(ship.id, track.pace).boostSpeed,
      ]) {
        const result = inspectDescent({
          track,
          descent,
          shipId: ship.id,
          speed,
        });
        const label = `${descent.id} ${ship.id}@${speed}`;
        assert.equal(
          result.complete,
          true,
          `${label} completes the supported section`,
        );
        assert.equal(
          result.ungroundedTicks,
          0,
          `${label} stays attached through inversion`,
        );
        assert.equal(
          result.launches.length,
          0,
          `${label} never substitutes a flight for the corkscrew`,
        );
        assert.equal(
          result.recoveries.length,
          0,
          `${label} never resets across the section`,
        );
        assert.equal(
          result.impacts.length,
          0,
          `${label} remains driveable without rail collisions`,
        );
        assert.ok(
          Object.values(result.state).every(
            (value) => typeof value !== 'number' || Number.isFinite(value),
          ),
        );
        if (descent.kind === 'corkscrew' || descent.kind === 'inversion')
          assert.ok(result.invertedSeconds > 1, `${label} drives upside down`);
        t.diagnostic(
          `${label}: ${result.elapsed.toFixed(2)}s, inverted ${result.invertedSeconds.toFixed(2)}s, peak lane offset ${result.maxLateral.toFixed(2)}m`,
        );
      }
});

test('every ship crosses every mandatory gap without reserve or a pickup, from cruise through boosted speed', async (t) => {
  for (const ship of SHIPS) {
    await t.test(ship.id, () => {
      for (const jump of track.jumps) {
        const pace = getVehiclePace(ship.id, track.pace);
        for (const speed of new Set([
          pace.cruiseSpeed,
          155,
          pace.boostSpeed,
          230,
          250,
        ])) {
          const result = inspectJump({ track, jump, shipId: ship.id, speed });
          assert.equal(
            result.outcome,
            'landed',
            `${jump.id} ${ship.id}@${speed}: ${JSON.stringify(result.failure)}`,
          );
          assert.equal(
            result.events.filter((event) => event.type === 'jump-launch')
              .length,
            1,
          );
          assert.equal(
            result.events.filter((event) => event.type === 'jump-transfer')
              .length,
            1,
          );
          assert.ok(
            result.landedDistance > jump.landingStart &&
              result.landedDistance < jump.landingEnd,
          );
          assert.ok(
            result.groundedBeforeNext > result.landingRemainder,
            'landings have further supported racing space before the next lip',
          );
          if (jump.hero && speed === 155)
            assert.ok(
              result.airtime >= 4.5 && result.airtime <= 5.5,
              `${jump.id} nominal flight is ${result.airtime.toFixed(3)}s`,
            );
        }
      }
    });
  }
});

test('all ships drive the Avalanche Sweep and Scissor Dive with ordinary controls', (t) => {
  for (const section of track.variations)
    for (const ship of SHIPS)
      for (const speed of [
        getVehiclePace(ship.id, track.pace).cruiseSpeed,
        getVehiclePace(ship.id, track.pace).boostSpeed,
      ]) {
        const result = inspectDescent({
          track,
          descent: section,
          shipId: ship.id,
          speed,
          maxSeconds: 60,
        });
        const label = `${section.id} ${ship.id}@${speed}`;
        const jumps = track.jumps.filter(
          (jump) => jump.takeoff > section.start && jump.takeoff < section.end,
        );
        assert.equal(
          result.complete,
          true,
          `${label} completes the whole section`,
        );
        assert.equal(
          result.impacts.length,
          0,
          `${label} clears the containment`,
        );
        assert.equal(result.recoveries.length, 0, label);
        assert.equal(result.misses.length, 0, label);
        assert.equal(
          result.launches.length,
          jumps.length,
          `${label} crosses each authored gap once`,
        );
        assert.equal(
          result.landings.length,
          jumps.length,
          `${label} lands every authored gap`,
        );
        t.diagnostic(
          `${label}: ${result.elapsed.toFixed(2)}s, peak lane offset ${result.maxLateral.toFixed(2)}m`,
        );
      }
});

test('Scissor Transfer catches slow and boosted ships across both outer approach lanes', () => {
  const jump = track.jumps.find((candidate) => candidate.id === 'last-relay');
  for (const ship of SHIPS)
    for (const speed of [
      getVehiclePace(ship.id, track.pace).cruiseSpeed,
      155,
      230,
      250,
    ])
      for (const lateral of [-10, 10]) {
        const result = inspectJump({
          track,
          jump,
          shipId: ship.id,
          speed,
          lateral,
        });
        const label = `${ship.id}@${speed}, lateral ${lateral}`;
        assert.equal(result.outcome, 'landed', label);
        assert.equal(
          result.events.filter((event) => event.type === 'impact').length,
          0,
          label,
        );
        assert.ok(
          result.groundedBeforeNext > 300,
          `${label} leaves more than a second of supported road before the next lip, even at the upper envelope`,
        );
      }
});

test('the long flights use measured ballistic motion with no hidden forward or target-seeking force', () => {
  for (const jump of track.jumps.filter((candidate) => candidate.hero)) {
    const result = inspectJump({ track, jump, retainTrace: true });
    const samples = result.trace.filter((sample) => sample.mode === 'flight');
    assert.ok(samples.length >= 120 * 4.5);
    for (let index = 1; index < samples.length; index++) {
      const before = samples[index - 1],
        after = samples[index];
      const elapsed = after.time - before.time;
      const acceleration = [0, -SHATTERLINE_RULES.gravity, 0];
      for (let axis = 0; axis < 3; axis++) {
        assert.ok(
          Math.abs(
            after.velocity[axis] -
              before.velocity[axis] -
              acceleration[axis] * elapsed,
          ) < 1e-7,
          'velocity follows gravity and zero pilot input',
        );
        assert.ok(
          Math.abs(
            after.position[axis] -
              before.position[axis] -
              before.velocity[axis] * elapsed -
              (acceleration[axis] * elapsed ** 2) / 2,
          ) < 1e-7,
          'position follows the physical trajectory',
        );
      }
    }
  }
});

test('unprepared short launches recover on supported road with elapsed-time loss', () => {
  for (const jump of track.jumps) {
    const result = inspectJump({ track, jump, speed: 55 });
    assert.equal(
      result.outcome,
      'recovered',
      `${jump.id}: low-speed miss cannot be credited as a landing`,
    );
    const miss = result.events.find((event) => event.type === 'jump-miss');
    const transfer = result.events.find(
      (event) => event.type === 'jump-transfer',
    );
    assert.ok(miss && transfer);
    assert.ok(
      transfer.time - miss.time >= 1.5 - FLIGHT_STEP,
      'automatic recovery consumes simulation time',
    );
    assert.ok(Math.abs(result.state.distance - jump.recovery) < 1e-8);
    assert.equal(track.surfaceCoverage(result.state.distance), 1);
    assert.equal(result.state.speed, 0);
  }
});

test('midair snapshot restore repeats the long flight, supported transfer and settlement exactly', () => {
  const jump = track.jumps.find((candidate) => candidate.hero);
  const runtime = createShatterlineRuntime({ track, presentation: false });
  const state = {
    ...createVehicleState(),
    distance: jump.takeoff - 0.1,
    speed: 166,
  };
  try {
    for (let tick = 0; tick < 240; tick++)
      runtime.advance(state, COAST, FLIGHT_STEP);
    assert.equal(runtime.snapshot().mode, 'flight');
    const saved = clone({ state, motion: runtime.snapshot() });
    const advance = () => {
      const events = [];
      for (let tick = 0; tick < 500; tick++)
        events.push(...runtime.advance(state, COAST, FLIGHT_STEP));
      return clone({ state, motion: runtime.snapshot(), events });
    };
    const expected = advance();
    assert.ok(
      expected.events.some(
        (event) =>
          event.type === 'jump-transfer' && event.payload.outcome === 'landed',
      ),
    );
    Object.assign(state, saved.state);
    runtime.restore(saved.motion);
    assert.deepEqual(advance(), expected);
  } finally {
    runtime.dispose();
  }
});

test('the supported finish stops every ship above the measured maximum landing speed', () => {
  for (const ship of SHIPS) {
    // The 250 m/s headroom launch lands below 275 m/s; allow a further margin.
    const state = {
      ...createVehicleState(ship.id),
      distance: track.finishDistance,
      speed: 280,
    };
    const runtime = createShatterlineRuntime({ track, presentation: false });
    try {
      runtime.reset({ state });
      for (let tick = 0; tick < 120 * 20 && state.speed > 0; tick++)
        runtime.advance(state, sprintRunoutControl(track, state), FLIGHT_STEP);
      assert.equal(state.speed, 0, ship.id);
      assert.ok(
        state.distance > track.finishDistance &&
          state.distance < track.length - 8,
        `${ship.id} stops the entire hull on the physical runout`,
      );
      assert.equal(runtime.pose(1).grounded, true);
      const stopped = state.distance;
      for (let tick = 0; tick < 120; tick++)
        runtime.advance(state, COAST, FLIGHT_STEP);
      assert.equal(
        state.distance,
        stopped,
        'hover hold prevents roll-away after stopping',
      );
    } finally {
      runtime.dispose();
    }
  }
});

test('the Easy field clears production seams and finishes after any verified midair racer collision', async () => {
  // The original seam contact needed the real staged field/engine history.
  // A standalone captured-state departure did not reproduce it, so preserve
  // the actual competitive path instead of asserting a synthetic substitute.
  const result = await inspectCompetition({
    difficulty: 'easy',
    verifyReplay: false,
  });
  for (const racer of result.racers) {
    assert.equal(racer.launches, track.jumps.length, racer.id);
    assert.equal(
      racer.landed + racer.recovered,
      track.jumps.length,
      `${racer.id} completes every physical gap`,
    );
    // Real midair shoves can spoil a landing as pack spacing changes. Keep
    // rejecting unexplained misses and geometry-seam failures; a collision
    // exception must identify an airborne impact and finish bounded recovery.
    for (const miss of racer.misses) {
      const transfer = racer.transfers.find(({ id }) => id === miss.id);
      assert.ok(transfer, `${racer.id}/${miss.id} completes its transfer`);
      const launchedAt = transfer.time - transfer.airtime;
      assert.ok(
        racer.impacts.some(
          (impact) =>
            impact.contactKind === 'racer' &&
            impact.response === 'deflection' &&
            impact.time >= launchedAt &&
            impact.time <= miss.time,
        ),
        `${racer.id}/${miss.id}: ${miss.reason} must follow a real midair racer impact`,
      );
      assert.ok(
        transfer.time - miss.time <= 3.1,
        `${racer.id}/${miss.id} resolves within recovery plus one boundary grace period`,
      );
    }
    assert.deepEqual(
      racer.impacts.filter((impact) => impact.contactKind === 'structure'),
      [],
    );
    assert.equal(
      racer.complete && racer.stopped && racer.supportedRunout,
      true,
    );
    assert.equal(racer.finish.length, 1);
    assert.equal(racer.finish[0].valid, true);
  }
});

test('all four ships drive the complete sprint with twelve landings, one valid finish and a supported stop', (t) => {
  for (const ship of SHIPS) {
    const result = inspectSprint({ track, shipId: ship.id });
    assert.equal(result.complete, true, `${ship.id} reaches the actual finish`);
    assert.equal(result.valid, true);
    assert.equal(result.launches, track.jumps.length);
    assert.deepEqual(
      result.flights.map((flight) => flight.id),
      track.jumps.map((jump) => jump.id),
    );
    assert.equal(
      result.recoveries,
      0,
      `${ship.id} crosses all twelve gaps using ordinary AI inputs`,
    );
    assert.equal(
      result.impacts,
      0,
      `${ship.id} clears every supported connector: ${JSON.stringify(result.impactEvents)}`,
    );
    assert.equal(result.result.length, 1, 'results are retained once');
    assert.equal(result.stopped, true);
    assert.ok(
      result.distance > track.finishDistance && result.distance < track.length,
      'braking remains on the supported runout',
    );
    assert.ok(
      result.elapsed > result.finishedAt + 1,
      'the finish does not instantly stop the craft',
    );
    t.diagnostic(
      `${ship.id}: finish ${result.finishedAt.toFixed(2)}s, ${result.launches} landings, ${result.recoveries} recoveries, ${result.impacts} rail impacts`,
    );
    for (const jump of track.jumps.filter((candidate) => candidate.hero)) {
      const flight = result.flights.find(
        (candidate) => candidate.id === jump.id,
      );
      assert.ok(
        flight.duration >= 4.5 && flight.duration <= 5.5,
        `${ship.id} ${jump.id} gives the promised long flight`,
      );
    }
  }
});
