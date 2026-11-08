import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createVehicleState } from '../src/physics/index.js';
import createLevel from '../src/levels/ravel/index.js';
import { getRacerControl } from '../src/race/racers.js';
import {
  ravelWaveTimeForPhase,
  sampleRavelWave,
} from '../src/levels/ravel/waves.js';
import {
  createRavelRuntime,
  ravelShouldLaunch,
} from '../src/levels/ravel/runtime.js';
let track, collisionWorld, dynamics;
const controls = { throttle: 1, steer: 0, boost: false, brake: 0 };
before(async () => {
  const definition = createLevel();
  track = definition.createTrack();
  collisionWorld = await definition.createCollisionWorld({ track });
  dynamics = await definition.createDynamics({ track, collisionWorld });
});
after(() => {
  dynamics?.dispose();
  collisionWorld?.dispose();
});
const makeRuntime = (extra = {}) =>
  createRavelRuntime({ track, dynamics, collisionWorld, ...extra });
const stateAt = (fields) => ({ ...createVehicleState(), ...fields });

test('large swells span the sail bays with exact velocity, quiet seams and matching support', () => {
  assert.ok(
    track.waveZones.length >= 4,
    'swells extend beyond the first bay and middle ribbon',
  );
  const epsilon = 1e-4;
  for (const zone of track.waveZones) {
    const at = (zone.start + zone.end) / 2;
    const crestTime = ravelWaveTimeForPhase(track, at, 0, 30);
    const risingTime = ravelWaveTimeForPhase(track, at, -Math.PI / 2, 30);
    const crest = sampleRavelWave(track, at, 30, crestTime);
    assert.equal(crest.id, zone.id);
    assert.ok(
      crest.dynamicHeight >= 12,
      `${zone.id}: visibly substantial crest`,
    );
    assert.ok(Math.abs(crest.dynamicHeight - zone.amplitude) < 1e-8);
    for (const time of [0, 1, 2, 3, 4]) {
      assert.equal(
        sampleRavelWave(track, at, -35, time).dynamicHeight,
        0,
        `${zone.id}: steady left seam`,
      );
      assert.equal(
        sampleRavelWave(track, at, 400, time).dynamicHeight,
        0,
        `${zone.id}: fixed outer wall or ribbon`,
      );
      for (const boundary of [zone.start, zone.end])
        assert.ok(
          Math.abs(sampleRavelWave(track, boundary, 30, time).dynamicHeight) <
            1e-12,
          `${zone.id}: displacement fades to zero at its boundary`,
        );
    }
    const velocity =
      (sampleRavelWave(track, at, 30, risingTime + epsilon).height -
        sampleRavelWave(track, at, 30, risingTime - epsilon).height) /
      (2 * epsilon);
    assert.ok(
      Math.abs(
        velocity - sampleRavelWave(track, at, 30, risingTime).materialVelocity,
      ) < 1e-6,
      `${zone.id}: analytic material velocity matches actual displacement`,
    );
    const frame = track.surfaceAtTime(at, 30, risingTime);
    assert.ok(
      frame.position.distanceTo(track.pointAtTime(at, 30, risingTime)) < 1e-9,
    );
    assert.ok(Math.abs(frame.right.dot(frame.up)) < 1e-8);
    assert.ok(Math.abs(frame.tangent.dot(frame.up)) < 1e-8);
  }
});

test('native hulls drive the added swells and middle ribbon across opposite starting phases', () => {
  const zones = track.waveZones.filter(
    (zone) =>
      !track.jumps.some(
        (jump) => jump.takeoff > zone.start && jump.takeoff < zone.end,
      ),
  );
  assert.ok(
    zones.length >= 3,
    'exercise the added bays and original middle ribbon',
  );
  for (const zone of zones) {
    for (const phase of [-Math.PI / 2, Math.PI / 2]) {
      const runtime = makeRuntime();
      try {
        const start = zone.start + 70;
        const end = Math.min(zone.end - 60, start + 280);
        const time = ravelWaveTimeForPhase(track, start, phase, 30);
        const state = stateAt({
          distance: start,
          lateral: 30,
          speed: 120,
          time,
        });
        runtime.reset({ state });
        const events = [];
        for (let tick = 0; tick < 720 && state.distance < end; tick++) {
          const input = getRacerControl(state, track, {
            lane: 30,
            difficulty: 'hard',
            devices: [],
          });
          events.push(
            ...runtime.advance(state, { ...input, boost: false }, 1 / 120),
          );
          const pose = runtime.pose(1);
          assert.equal(
            pose.grounded,
            true,
            `${zone.id}/${phase}: actual magnetic support`,
          );
          assert.equal(
            Boolean(pose.recovering),
            false,
            `${zone.id}/${phase}: no recovery`,
          );
        }
        assert.ok(
          state.distance >= end,
          `${zone.id}/${phase}: ordinary thrust traverses the wave bay`,
        );
        assert.ok(
          !events.some((event) =>
            [
              'road-departure',
              'road-recovery',
              'jump-launch',
              'jump-miss',
            ].includes(event.type),
          ),
          `${zone.id}/${phase}: uninterrupted supported drive`,
        );
      } finally {
        runtime.dispose();
      }
    }
  }
});

test('collision excludes live bays, crest hole is real, and phase never suppresses release', () => {
  for (const triangle of collisionWorld.triangles) {
    if (triangle.kind !== 'deck' || !triangle.roadCoordinates) continue;
    const s = triangle.roadCoordinates.reduce((sum, p) => sum + p[0], 0) / 3;
    const lateral =
      triangle.roadCoordinates.reduce((sum, point) => sum + point[1], 0) / 3;
    // The continuous bowl's outer walls stay static while its central floor
    // flexes. Static wall triangles are legitimate inside a live bay's span.
    assert.ok(sampleRavelWave(track, s, lateral, 0).weight < 1e-8);
  }
  assert.equal(track.surfaceCoverage(980, 30), 0);
  assert.equal(track.surfaceCoverage(980, -35), 1);
  const jump = track.jumps.find((entry) => entry.id === 'crest-skip');
  for (const time of [0, 1, 2, 3, 4]) {
    assert.equal(
      ravelShouldLaunch(track, { jump, state: stateAt({ lateral: 30, time }) }),
      true,
    );
    assert.equal(
      ravelShouldLaunch(track, {
        jump,
        state: stateAt({ lateral: -35, time }),
      }),
      false,
    );
  }
});

test('actual Rapier magnetic hull follows moving sheet while parked', () => {
  const runtime = makeRuntime();
  try {
    const state = stateAt({ distance: 800, lateral: 30, time: 0 });
    runtime.reset({ state });
    let minY = Infinity,
      maxY = -Infinity;
    for (let i = 0; i < 540; i++) {
      const events = runtime.advance(
        state,
        { throttle: 0, steer: 0, brake: 0 },
        1 / 120,
      );
      const pose = runtime.pose(1),
        surface = track.surfaceAtTime(
          state.distance,
          state.lateral,
          state.time,
        );
      const clearance = pose.position
        .clone()
        .sub(surface.position)
        .dot(surface.up);
      assert.equal(pose.grounded, true);
      assert.ok(!events.some((event) => event.type === 'road-departure'));
      assert.ok(clearance > 0.2 && clearance < 4, `clearance ${clearance}`);
      minY = Math.min(minY, pose.position.y);
      maxY = Math.max(maxY, pose.position.y);
    }
    assert.ok(maxY - minY > 4, `moving hull range ${maxY - minY}`);
    assert.ok(Math.abs(state.distance - 800) < 5);
  } finally {
    runtime.dispose();
  }
});

function crossCrest(phase) {
  const runtime = makeRuntime();
  try {
    const time = ravelWaveTimeForPhase(track, 950, phase, 30);
    const state = stateAt({ distance: 949.8, lateral: 30, speed: 135, time });
    runtime.reset({ state });
    const events = [];
    for (let i = 0; i < 1100; i++) {
      const batch = runtime.advance(state, controls, 1 / 120);
      events.push(...batch);
      if (batch.some((event) => event.type === 'jump-launch')) {
        const snapshot = runtime.snapshot();
        assert.equal(snapshot.mode, 'flight');
        assert.deepEqual(snapshot.currentPose, snapshot.motion.currentPose);
        assert.deepEqual(snapshot.flight, snapshot.motion.flight);
        assert.ok(snapshot.currentPose.position.every(Number.isFinite));
      }
      if (events.some((event) => event.type === 'jump-transfer')) break;
    }
    return { events, elapsed: state.time - time };
  } finally {
    runtime.dispose();
  }
}
test('same physical crest lip lands in favourable phase and misses in adverse phase', () => {
  const good = crossCrest(-Math.PI / 2),
    bad = crossCrest(Math.PI / 2);
  assert.ok(good.events.some((event) => event.type === 'jump-launch'));
  assert.ok(
    good.events.some(
      (event) =>
        event.type === 'jump-transfer' && event.payload.outcome === 'landed',
    ),
  );
  assert.ok(!good.events.some((event) => event.type === 'jump-miss'));
  assert.ok(bad.events.some((event) => event.type === 'jump-launch'));
  assert.ok(bad.events.some((event) => event.type === 'jump-miss'));
  assert.ok(
    bad.events.some(
      (event) =>
        event.type === 'jump-transfer' && event.payload.outcome === 'recovered',
    ),
  );
  assert.ok(bad.elapsed > 1.5);
});

test('reinforced bypass stays supported across the optional gap', () => {
  const runtime = makeRuntime();
  try {
    const state = stateAt({ distance: 900, lateral: -35, speed: 125, time: 1 });
    runtime.reset({ state });
    const events = [];
    for (let i = 0; i < 220 && state.distance < 1070; i++)
      events.push(...runtime.advance(state, controls, 1 / 120));
    assert.ok(state.distance > 1050);
    assert.equal(runtime.pose(1).grounded, true);
    assert.ok(
      !events.some(
        (event) =>
          event.type === 'jump-launch' || event.type === 'road-departure',
      ),
    );
  } finally {
    runtime.dispose();
  }
});

test('snapshot replay is deterministic and rival clocks never move player scenery', () => {
  const runtime = makeRuntime(),
    rival = makeRuntime({ presentation: false });
  try {
    const state = stateAt({
      distance: 780,
      lateral: -35,
      speed: 50,
      time: 0.5,
    });
    runtime.reset({ state });
    const other = stateAt({ distance: 800, lateral: -35, speed: 0, time: 8 });
    rival.reset({ state: other });
    rival.advance(other, { throttle: 0, steer: 0 }, 1 / 120);
    assert.equal(track.presentationTime, 0.5);
    for (let i = 0; i < 25; i++) runtime.advance(state, controls, 1 / 120);
    const savedState = { ...state },
      savedRuntime = JSON.parse(JSON.stringify(runtime.snapshot())),
      savedDynamics = dynamics.snapshot();
    for (let i = 0; i < 35; i++) runtime.advance(state, controls, 1 / 120);
    const expected = { ...state },
      expectedPose = runtime.pose(1).position.clone();
    Object.assign(state, savedState);
    runtime.restore(savedRuntime);
    dynamics.restore(savedDynamics);
    for (let i = 0; i < 35; i++) runtime.advance(state, controls, 1 / 120);
    for (const key of [
      'distance',
      'lateral',
      'speed',
      'heading',
      'time',
      'energy',
    ])
      assert.ok(Math.abs(state[key] - expected[key]) < 1e-8, `replayed ${key}`);
    assert.ok(runtime.pose(1).position.distanceTo(expectedPose) < 1e-8);
    const snap = runtime.snapshot();
    runtime.pose(0.5);
    assert.ok(
      Math.abs(track.presentationTime - (snap.previousTime + snap.time) / 2) <
        1e-10,
    );
    assert.throws(
      () => runtime.restore({ time: -1, previousTime: 0 }),
      /snapshot/,
    );
  } finally {
    rival.dispose();
    runtime.dispose();
  }
});

test('vast sail sidewalls are physically supported, including the folded upper wall', () => {
  assert.ok(track.sheetProfileAt(800).halfWidth >= 600);
  for (const lateral of [-400, 400, 620]) {
    const runtime = makeRuntime();
    try {
      const state = stateAt({ distance: 800, lateral, time: 0 });
      runtime.reset({ state });
      const initial = runtime.pose(1).position.clone();
      for (let tick = 0; tick < 180; tick++) {
        const events = runtime.advance(
          state,
          { throttle: 0, steer: 0, brake: 0 },
          1 / 120,
        );
        const pose = runtime.pose(1),
          surface = track.surfaceAtTime(
            state.distance,
            state.lateral,
            state.time,
          );
        const clearance = pose.position
          .clone()
          .sub(surface.position)
          .dot(surface.up);
        assert.equal(
          pose.grounded,
          true,
          `sidewall ${lateral}: magnetic support`,
        );
        assert.equal(Boolean(pose.recovering), false);
        assert.ok(
          clearance > 0.2 && clearance < 3,
          `sidewall ${lateral}: hull follows actual curved skin`,
        );
        assert.ok(
          !events.some(
            (event) =>
              event.type === 'impact' || event.type === 'road-departure',
          ),
        );
        assert.equal(
          sampleRavelWave(track, state.distance, state.lateral, state.time)
            .dynamicHeight,
          0,
        );
      }
      const base = track.sample(state.distance);
      const rise = runtime
        .pose(1)
        .position.clone()
        .sub(base.position)
        .dot(base.up);
      const minimumRise = lateral < 0 ? 100 : 180;
      assert.ok(
        rise > minimumRise,
        `sidewall ${lateral}: real geometry rise ${rise}`,
      );
      assert.ok(
        runtime.pose(1).position.distanceTo(initial) < 0.05,
        'quiet outer wall stays physically steady',
      );
      if (lateral === 620)
        assert.ok(
          track.surfaceAtTime(800, lateral, state.time).up.dot(base.up) < 0,
          'upper fold carries an overhanging driving surface',
        );
    } finally {
      runtime.dispose();
    }
  }
});

test('ordinary propulsion drives both broad sail walls away from the centre guide', () => {
  for (const lateral of [-400, 400]) {
    const runtime = makeRuntime();
    try {
      const state = stateAt({ distance: 500, lateral, speed: 80, time: 0 });
      runtime.reset({ state });
      const start = runtime.pose(1).position.clone();
      const events = [];
      for (let tick = 0; tick < 300 && state.distance < 605; tick++) {
        events.push(
          ...runtime.advance(
            state,
            { throttle: 1, steer: 0, brake: 0 },
            1 / 120,
          ),
        );
        assert.equal(runtime.pose(1).grounded, true);
        assert.equal(Boolean(runtime.pose(1).recovering), false);
      }
      assert.ok(
        state.distance > 600,
        'ordinary thrust advances on the actual sheet wall',
      );
      assert.ok(
        Math.abs(state.lateral) > 300,
        'driving stays well outside the 100m centre guide',
      );
      assert.ok(runtime.pose(1).position.distanceTo(start) > 70);
      assert.ok(
        !events.some(
          (event) =>
            event.type === 'impact' ||
            event.type === 'road-departure' ||
            event.type === 'jump-launch',
        ),
      );
    } finally {
      runtime.dispose();
    }
  }
});
