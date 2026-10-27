import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createSaffronTrack,
  createSaffronRoad,
  sampleSaffronDeposits,
  saffronSandSection,
  saffronSandExposure,
} from '../src/levels/saffron/track/index.js';
import {
  createSaffronRuntime,
  SAFFRON_SAND_SEVERITY,
} from '../src/levels/saffron/runtime.js';
import { sampleHazardSurface } from '../src/physics/hazard-surface.js';
import { createVehicleState, stepVehicle } from '../src/physics/index.js';
import { createRace } from '../src/race/index.js';
import {
  compatibleRuntime,
  runtimeIdentity,
  advanceSession,
} from '../src/core/session-runtime.js';
import { createLandformSurvey } from '../src/levels/saffron/environment/terrain.js';

const track = createSaffronTrack();
const context = { track, settings: { steeringAssist: 0.3 } };
const neutral = {
  throttle: 0,
  brake: 0,
  steer: 0,
  airbrake: false,
  boost: false,
};
function fly(index, scenario, input = neutral, overrides = {}) {
  const runtime = createSaffronRuntime(context);
  const state = {
    ...createVehicleState(),
    ...track.scenarios[`jump${index}-${scenario}`],
    ...overrides,
  };
  const events = [];
  for (let tick = 0; tick < 1200; tick++) {
    events.push(
      ...runtime
        .advance(state, input, 1 / 120)
        .map((event) => ({ ...event, time: state.time })),
    );
    if (events.some((e) => e.type === 'jump-transfer')) break;
  }
  runtime.dispose();
  return {
    state,
    events,
    transfer: events.find((e) => e.type === 'jump-transfer'),
  };
}

test('Saffron 5.15 km route has 40 m width, 130 m relief and continuous metre frames', () => {
  assert.ok(track.length > 5100 && track.length < 5250);
  assert.equal(track.width, 40);
  let minimum = Infinity,
    maximum = -Infinity;
  for (let s = 0; s < track.length; s += 1) {
    const f = track.sample(s),
      n = track.sample(s + 1);
    minimum = Math.min(minimum, f.position.y);
    maximum = Math.max(maximum, f.position.y);
    assert.ok(
      Math.abs(f.position.distanceTo(n.position) - 1) < 0.0015,
      `metre parameter ${s}`,
    );
    assert.ok(f.quaternion.angleTo(n.quaternion) < 0.03, `smooth frame ${s}`);
    for (const v of [f.position, f.tangent, f.right, f.up])
      assert.ok(v.toArray().every(Number.isFinite));
    assert.ok(Math.abs(f.right.dot(f.up)) < 1e-8);
    assert.ok(Math.abs(f.right.dot(f.tangent)) < 1e-8);
    assert.ok(Math.abs(f.up.dot(f.tangent)) < 1e-8);
    assert.ok(Math.abs(f.up.length() - 1) < 1e-8);
  }
  assert.ok(Math.abs(maximum - minimum - 130) < 0.01);
  assert.ok(
    track.sample(-0.001).position.distanceTo(track.sample(0.001).position) <
      0.0021,
  );
  assert.ok(
    track.sample(-0.001).quaternion.angleTo(track.sample(0.001).quaternion) <
      0.0001,
  );
  assert.ok(track.landmarks.vistaEnd - track.landmarks.vistaStart > 600);
  assert.ok(track.landmarks.vistaEnd - track.landmarks.vistaStart < 750);
  assert.ok(
    track.sample(track.landmarks.skullStart).position.y -
      track.sample(track.landmarks.skullEnd).position.y >
      45,
  );
  assert.ok(track.sample(track.landmarks.skullCenter).bank > 0.5);
});

test('sections, explicit gaps, optional continuous crest and checkpoints are ordered', () => {
  assert.equal(track.sections[0].start, 0);
  assert.equal(track.sections.at(-1).end, track.length);
  for (let i = 0; i < track.sections.length; i++) {
    const section = track.sections[i];
    if (i) assert.equal(track.sections[i - 1].end, section.start);
    assert.ok(
      section.showcase > section.start && section.showcase < section.end,
    );
  }
  for (const jump of track.jumps) {
    const credited = track.checkpoints.filter(
      (c) =>
        c.distance > jump.takeoff &&
        c.distance <= Math.max(jump.landingEnd, jump.recovery),
    );
    assert.equal(credited.length, 1);
    assert.equal(credited[0].distance, jump.landingStart);
    assert.equal(
      track.isGap((jump.takeoff + jump.landingStart) / 2),
      !jump.optional,
    );
  }
  const frames = Array.from({ length: 650 }, (_, i) =>
    track.sample((i * track.length) / 650),
  );
  for (let i = 0; i < frames.length; i++)
    for (let j = i + 1; j < frames.length; j++) {
      if (
        (Math.min(j - i, frames.length - j + i) * track.length) /
          frames.length <
        150
      )
        continue;
      assert.ok(
        frames[i].position.distanceTo(frames[j].position) > 65,
        `route clearance ${i}/${j}`,
      );
    }
});

test('real takeoff and swept landing cover cruise envelopes; misses recover after 1.5 seconds', () => {
  for (let i = 1; i <= 3; i++) {
    for (const scenario of ['success', 'cruise70', 'boost70']) {
      const result = fly(i, scenario);
      assert.ok(result.events.some((e) => e.type === 'jump-launch'));
      assert.equal(
        result.transfer?.payload.outcome,
        'landed',
        `${i}/${scenario}`,
      );
      assert.ok(result.state.distance >= track.jumps[i - 1].landingStart);
      assert.ok(result.state.distance <= track.jumps[i - 1].landingEnd);
    }
    const slow = fly(i, 'short');
    assert.ok(slow.events.some((e) => e.type === 'jump-miss'));
    assert.equal(slow.transfer?.payload.outcome, 'recovered');
    assert.ok(
      Math.abs(slow.state.distance - track.jumps[i - 1].recovery) < 1e-8,
    );
    assert.ok(
      Math.abs(
        slow.transfer.time -
          slow.events.find((e) => e.type === 'jump-miss').time -
          1.5,
      ) < 1e-8,
    );
    if (i > 1) assert.equal(fly(i, 'long').transfer?.payload.outcome, 'landed');
  }
  assert.equal(
    fly(1, 'long').transfer?.payload.outcome,
    'recovered',
    'full boost deliberately overshoots compact optional bypass',
  );
});

test('Saffron offset landings remain supported inside the 40 m deck', () => {
  for (const [index, speed] of [
    [1, 87.4],
    [3, 143.4],
  ]) {
    const result = fly(index, 'success', neutral, { speed, heading: -0.025 });
    assert.equal(result.transfer?.payload.outcome, 'landed');
    assert.ok(
      !result.events.some(
        ({ type }) => type === 'jump-miss' || type === 'impact',
      ),
    );
    assert.ok(result.state.energy > 97);
  }
});

test('right glass line stays grounded across optional crest; magnetic hold and braking survive banks', () => {
  const runtime = createSaffronRuntime(context);
  const state = {
    ...createVehicleState(),
    ...track.scenarios['jump1-success'],
    lateral: -8,
  };
  const events = [];
  for (let tick = 0; tick < 60; tick++)
    events.push(...runtime.advance(state, neutral, 1 / 120));
  assert.ok(!events.some((e) => e.type === 'jump-launch'));
  assert.equal(runtime.snapshot().mode, 'magnetic');
  for (const scenario of ['bank-rest', 'slope-rest']) {
    runtime.reset();
    Object.assign(state, createVehicleState(), track.scenarios[scenario]);
    const before = { ...state };
    for (let tick = 0; tick < 180; tick++)
      runtime.advance(state, { ...neutral, steer: 0.8 }, 1 / 120);
    assert.equal(state.distance, before.distance);
    assert.equal(state.lateral, before.lateral);
    assert.equal(state.speed, 0);
    state.speed = 50;
    runtime.advance(state, { ...neutral, brake: 1 }, 0.1);
    assert.ok(state.speed < 50);
  }
  runtime.dispose();
});

test('migrating visible deposit samples match drag, preserve exposed glass and are deterministic', () => {
  assert.deepEqual(
    sampleSaffronDeposits(track, 19),
    sampleSaffronDeposits(track, 19),
  );
  assert.notEqual(
    sampleSaffronDeposits(track, 0)[0].start,
    sampleSaffronDeposits(track, 25)[0].start,
  );
  const zone = sampleSaffronDeposits(track, 0)[0],
    section = saffronSandSection(zone, 0.5);
  assert.equal(
    saffronSandExposure(track, section.distance, section.lateral, 0),
    1,
  );
  assert.equal(saffronSandExposure(track, section.distance, -10, 0), 0);
  for (const fraction of [0.1, 0.5, 0.9]) {
    const slice = saffronSandSection(zone, fraction);
    assert.equal(
      saffronSandExposure(
        track,
        slice.distance,
        slice.lateral + slice.halfWidth + 0.01,
        0,
      ),
      0,
    );
    assert.ok(
      saffronSandExposure(track, slice.distance, slice.lateral, 0) > 0.99,
    );
  }
  const runtime = createSaffronRuntime(context);
  assert.equal(SAFFRON_SAND_SEVERITY, 0.5);
  for (const speed of [30, 85, 150])
    for (const input of [neutral, { ...neutral, throttle: 1, boost: true }]) {
      const sandy = {
        ...createVehicleState(),
        distance: section.distance,
        lateral: section.lateral,
        speed,
      };
      const expected = { ...sandy };
      const baseline = { ...sandy };
      runtime.reset({ state: sandy });
      runtime.advance(sandy, input, 1 / 120);
      stepVehicle(expected, input, track, 1 / 120, {
        steeringAssist: 0.3,
        surface: sampleHazardSurface(speed, SAFFRON_SAND_SEVERITY),
      });
      stepVehicle(baseline, input, track, 1 / 120, { steeringAssist: 0.3 });
      assert.ok(
        Math.abs(expected.speed - sandy.speed) < 1e-9,
        'visible sand uses the shared speed-scaled resistance and thrust loss',
      );
      assert.ok(sandy.speed < baseline.speed, 'boost cannot bypass sand');
      assert.equal(runtime.snapshot().saffron.surfaceId, zone.id);

      const glass = { ...baseline, time: 0, lateral: -10, speed };
      const clear = { ...glass };
      runtime.reset({ state: glass });
      runtime.advance(glass, input, 1 / 120);
      stepVehicle(clear, input, track, 1 / 120, { steeringAssist: 0.3 });
      assert.ok(Math.abs(glass.speed - clear.speed) < 1e-9);
      assert.equal(runtime.snapshot().saffron.surfaceId, null);
    }
  runtime.dispose();
});

test('flight/sand snapshots replay exactly, identity rejects changed rules, disposal halts advance', () => {
  for (const scenario of ['jump2-success', 'sand-deep']) {
    const runtime = createSaffronRuntime(context),
      state = { ...createVehicleState(), ...track.scenarios[scenario] };
    for (let tick = 0; tick < 30; tick++)
      runtime.advance(state, neutral, 1 / 120);
    const saved = JSON.parse(
      JSON.stringify({ state, snapshot: runtime.snapshot() }),
    );
    const first = [];
    for (let tick = 0; tick < 180; tick++)
      first.push(...runtime.advance(state, neutral, 1 / 120));
    const expected = JSON.parse(
      JSON.stringify({ state, snapshot: runtime.snapshot() }),
    );
    Object.assign(state, saved.state);
    runtime.restore(saved.snapshot);
    const replay = [];
    for (let tick = 0; tick < 180; tick++)
      replay.push(...runtime.advance(state, neutral, 1 / 120));
    assert.deepEqual({ state, snapshot: runtime.snapshot() }, expected);
    assert.deepEqual(first, replay);
    assert.equal(compatibleRuntime(runtime, runtimeIdentity(runtime)), true);
    assert.equal(
      compatibleRuntime(runtime, {
        ...runtimeIdentity(runtime),
        rulesId: 'other',
      }),
      false,
    );
    runtime.dispose();
    const before = { ...state };
    assert.deepEqual(runtime.advance(state, neutral, 1 / 120), []);
    assert.deepEqual(state, before);
  }
});

test('ordered CPU lap credits exactly one checkpoint per real swept jump transfer', () => {
  const runtime = createSaffronRuntime(context),
    race = createRace(track, { rulesId: runtime.rulesId });
  const state = createVehicleState();
  let previous = 0;
  for (let i = 2; i <= 3; i++) {
    Object.assign(
      state,
      createVehicleState(),
      track.scenarios[`jump${i}-success`],
    );
    race.step(previous, state.distance, 1);
    runtime.reset();
    const events = [];
    for (let tick = 0; tick < 1200; tick++) {
      advanceSession({
        state,
        input: neutral,
        dt: 1 / 120,
        runtime,
        race,
        emit: (e) => events.push(e),
      });
      if (events.some((e) => e.type === 'jump-transfer')) break;
    }
    assert.equal(race.valid, true);
    assert.equal(events.filter((e) => e.type === 'checkpoint').length, 1);
    previous = state.distance;
  }
  race.step(previous, track.length, 1);
  assert.equal(race.history[0].valid, true);
  assert.equal(race.history[0].rulesId, runtime.rulesId);
  runtime.dispose();
});

test('production and shape expose real open spans, finite meshes and terrain-grounded shoes', () => {
  const survey = createLandformSurvey(track);
  for (const shape of [true, false]) {
    const road = createSaffronRoad(
      { track, settings: { quality: 'low' } },
      { shape },
    );
    const gaps = road.group.userData.openSpans;
    assert.equal(gaps.length, 2);
    assert.equal(
      road.group.children.filter((o) => o.name.startsWith('Migrating sand /'))
        .length,
      4,
    );
    let draws = 0,
      triangles = 0;
    road.group.traverse((o) => {
      if (!o.geometry) return;
      draws++;
      assert.ok(
        Array.from(o.geometry.attributes.position.array).every(Number.isFinite),
      );
      triangles +=
        ((o.geometry.index?.count ?? o.geometry.attributes.position.count) /
          3) *
        (o.count ?? 1);
      if (o.userData.drivingSurface)
        for (const gap of gaps)
          assert.ok(
            o.userData.interval[1] <= gap.start ||
              o.userData.interval[0] >= gap.end,
          );
    });
    assert.ok(draws < 80);
    assert.ok(triangles < 220000);
    const shoes = road.group.getObjectByName('Broad fossil shelf shoes'),
      matrix = new THREE.Matrix4(),
      position = new THREE.Vector3();
    for (let i = 0; i < shoes.count; i++) {
      shoes.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      assert.ok(
        Math.abs(position.y - survey.heightAt(position.x, position.z) - 0.2) <
          0.002,
      );
    }
    road.update({ time: 21 });
    road.reset();
    road.dispose();
    road.dispose();
  }
});
