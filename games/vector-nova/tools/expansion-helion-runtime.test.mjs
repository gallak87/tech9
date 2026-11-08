import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createHelionTrack } from '../src/levels/helion/track/model.js';
import {
  createHelionRuntime,
  helionRoadBounds,
} from '../src/levels/helion/runtime.js';
import {
  sampleHelionHeatFeedback,
  helionHeatPulse,
  HELION_HEAT_RULES,
} from '../src/levels/helion/thermal.js';
import { createVehicleState } from '../src/physics/index.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { createRace } from '../src/race/index.js';
import {
  advanceSession,
  compatibleRuntime,
  runtimeIdentity,
} from '../src/core/session-runtime.js';
const track = createHelionTrack();
const DT = 1 / 120;
const controls = {
  throttle: 1,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};
const adapter = () =>
  createHelionRuntime({ track, settings: { steeringAssist: 0.3 } });
function runJump(number, variant) {
  const runtime = adapter();
  const state = {
    ...createVehicleState(),
    ...track.scenarios[`jump${number}-${variant}`],
  };
  runtime.reset({ state });
  const race = createRace(track, { rulesId: runtime.rulesId });
  race.step(0, state.distance, 0);
  const events = [];
  for (let i = 0; i < 1200; i++) {
    advanceSession({
      state,
      input: controls,
      dt: DT,
      runtime,
      race,
      emit: (e) => events.push(e),
    });
    if (events.some((e) => e.type === 'jump-transfer')) break;
  }
  return { runtime, state, race, events };
}
test('both sheltered gaps have real ballistic landing envelopes and valid checkpoint transfers', () => {
  for (const number of [1, 2])
    for (const variant of ['success', 'cruise70', 'boost70', 'long']) {
      const r = runJump(number, variant);
      assert.equal(
        r.events.find((e) => e.type === 'jump-transfer')?.payload.outcome,
        'landed',
        `${number}:${variant}`,
      );
      assert.equal(r.race.valid, true);
      assert.equal(r.events.filter((e) => e.type === 'checkpoint').length, 1);
      assert.ok(r.state.time > 0.5);
      r.runtime.dispose();
    }
});
test('underspeed misses recover after timed flight without an invisible magnetic bridge', () => {
  for (const number of [1, 2]) {
    const r = runJump(number, 'short');
    assert.equal(
      r.events.find((e) => e.type === 'jump-transfer')?.payload.outcome,
      'recovered',
    );
    assert.ok(r.events.some((e) => e.type === 'jump-miss'));
    assert.ok(r.state.time > 2.5);
    assert.equal(r.race.valid, true);
    assert.ok(
      Math.abs(r.state.distance - track.jumps[number - 1].recovery) < 1e-8,
    );
  }
});
test('supported detours remain grounded and a visible inner divider contains lateral steering', () => {
  for (const jump of track.jumps) {
    const runtime = adapter(),
      state = {
        ...createVehicleState(),
        distance: jump.takeoff - 2,
        // Physical shelter starts beyond -8.5; -8 is still in the flare lane.
        lateral: -10,
        speed: 85,
      };
    runtime.reset({ state });
    const events = [];
    for (let i = 0; i < 130; i++)
      events.push(...runtime.advance(state, controls, DT));
    assert.equal(
      events.some((e) => e.type === 'jump-launch'),
      false,
    );
    assert.equal(runtime.snapshot().flight.mode, 'magnetic');
    assert.ok(state.distance > jump.landingStart);
    state.distance = jump.takeoff + 20;
    state.lateral = -4;
    state.heading = 0.12;
    state.speed = 60;
    const impacts = [];
    for (let i = 0; i < 25; i++)
      impacts.push(...runtime.advance(state, { ...controls, steer: -1 }, DT));
    assert.ok(state.lateral < 0);
    assert.ok(
      impacts.some((e) => e.type === 'impact' && e.payload.railLateral === 0),
    );
    assert.deepEqual(helionRoadBounds(track, jump.takeoff + 5), {
      min: -15,
      max: 0,
    });
  }
});
test('heat and airborne state snapshot/restore reproduce identical continuation', () => {
  const a = adapter(),
    b = adapter();
  const state = {
    ...createVehicleState(),
    ...track.scenarios['jump1-success'],
  };
  a.reset({ state });
  for (let i = 0; i < 40; i++) a.advance(state, controls, DT);
  const copy = structuredClone(state);
  b.restore(structuredClone(a.snapshot()));
  for (let i = 0; i < 280; i++) {
    assert.deepEqual(
      a.advance(state, controls, DT),
      b.advance(copy, controls, DT),
    );
  }
  assert.deepEqual(state, copy);
  assert.deepEqual(a.snapshot(), b.snapshot());
  assert.equal(compatibleRuntime(a, runtimeIdentity(b)), true);
  assert.equal(
    compatibleRuntime(a, { ...runtimeIdentity(b), rulesId: 'stale' }),
    false,
  );
});
test('stationary furnace accumulates heat and power loss, cooling/reset/pause recover honestly', () => {
  const runtime = adapter();
  const furnace = track.thermalZones.find((z) => z.kind === 'furnace');
  const cooling = track.thermalZones.find((z) => z.kind === 'cooling');
  const state = { ...createVehicleState(), distance: furnace.start + 15 };
  runtime.reset({ state });
  for (let i = 0; i < 400; i++) runtime.advance(state, {}, DT);
  assert.ok(runtime.snapshot().heat > 80);
  const paused = structuredClone(runtime.snapshot());
  runtime.advance(state, controls, 0);
  runtime.update({ state, dt: 0, mode: 'paused' });
  assert.deepEqual(runtime.snapshot(), paused);
  state.distance = cooling.start + 15;
  for (let i = 0; i < 360; i++) runtime.advance(state, {}, DT);
  assert.equal(runtime.snapshot().heat, 0);
  runtime.reset({ state, scenario: 'heat-hot' });
  assert.equal(runtime.snapshot().heat, 78);
  runtime.reset({ state, reason: 'manual-recover' });
  assert.equal(runtime.snapshot().heat, 0);
  assert.equal(runtime.pose(), null);
  runtime.dispose();
  runtime.dispose();
});

test('a numerical control traversal completes one ordered supported lap without contact', () => {
  const runtime = adapter(),
    state = createVehicleState(),
    race = createRace(track, { rulesId: runtime.rulesId });
  runtime.reset({ state });
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  let lap = null,
    impacts = 0;
  for (let i = 0; i < 24000; i++) {
    const frame = track.sample(state.distance);
    let curve = 0;
    for (let k = 0; k < 6; k++)
      curve = Math.max(
        curve,
        Math.abs(track.sample(state.distance + k * 15).curvature),
      );
    const target = clamp(Math.sqrt(28 / Math.max(0.001, curve)), 34, 90);
    const heading =
      (frame.curvature * state.speed * 0.75) / 7.2 +
      (-8 - state.lateral) * 0.025;
    const input = {
      throttle: state.speed < target ? 1 : 0.2,
      brake: state.speed > target + 2 ? 0.45 : 0,
      steer: clamp(
        -(
          (frame.curvature * state.speed) / 1.5 +
          (heading - state.heading) * 2.5
        ),
        -1,
        1,
      ),
      boost: false,
    };
    const previous = state.distance;
    const events = runtime.advance(state, input, DT);
    impacts += events.filter((e) => e.type === 'impact').length;
    lap = race
      .step(previous, state.distance, DT, events)
      .find((e) => e.type === 'lap');
    if (lap) break;
  }
  assert.equal(lap?.payload.valid, true);
  assert.equal(impacts, 0);
  assert.ok(state.time > 50 && state.time < 110);
});

test('overheated furnace traversal has a measurable declared engine power consequence', () => {
  const hot = adapter(),
    cold = adapter();
  const initial = {
    ...createVehicleState(),
    distance: track.thermalZones.find((z) => z.kind === 'furnace').start + 5,
    speed: 30,
  };
  const a = { ...initial },
    b = { ...initial };
  hot.reset({ state: a, scenario: 'heat-hot' });
  cold.reset({ state: b });
  for (let i = 0; i < 100; i++) {
    hot.advance(a, controls, DT);
    cold.advance(b, controls, DT);
  }
  assert.ok(
    a.speed < b.speed * 0.9,
    'overload adds at least 10% speed loss to the now-damaging cold fire contact',
  );
  assert.equal(a.energy, b.energy);
});

test('fire penalty recovers within one second while a cold brief hit stays visible for five', () => {
  const telemetry = {};
  const runtime = createHelionRuntime({ track }, telemetry);
  const furnace = track.thermalZones.find((z) => z.kind === 'furnace');
  const shelter = track.thermalZones.find((z) => z.kind === 'shelter');
  const state = { ...createVehicleState(), distance: furnace.start + 15 };
  runtime.reset({ state });
  for (let i = 0; i < 24; i++) runtime.advance(state, {}, DT);
  assert.ok(runtime.snapshot().heat > 4 && runtime.snapshot().heat < 6);
  state.distance = shelter.start + 15;
  for (let i = 0; i < 240; i++) runtime.advance(state, {}, DT);
  runtime.update({ state });
  assert.equal(telemetry.heat, 0);
  assert.equal(telemetry.thrustScale, 1);
  assert.ok(sampleHelionHeatFeedback(telemetry).smoke > 0.25);
  const saved = structuredClone(runtime.snapshot());
  runtime.advance(state, {}, 0);
  runtime.update({ state, mode: 'paused' });
  assert.deepEqual(runtime.snapshot(), saved);
  for (let i = 0; i < 370; i++) runtime.advance(state, {}, DT);
  runtime.update({ state });
  assert.equal(sampleHelionHeatFeedback(telemetry).smoke, 0);
  assert.equal(sampleHelionHeatFeedback(telemetry).severity, 0);
  state.distance = furnace.start + 15;
  runtime.reset({ state, scenario: 'heat-hot' });
  for (let i = 0; i < 120; i++) runtime.advance(state, {}, DT);
  runtime.update({ state });
  assert.ok(telemetry.thrustScale < 0.8);
  assert.equal(
    sampleHelionHeatFeedback(telemetry).pulse,
    helionHeatPulse(state.time),
  );
  state.distance = shelter.start + 15;
  for (let i = 0; i < 60; i++) runtime.advance(state, {}, DT);
  runtime.update({ state });
  assert.ok(telemetry.thrustScale < 1 && telemetry.thrustScale > 0.75);
  for (let i = 0; i < 65; i++) runtime.advance(state, {}, DT);
  runtime.update({ state });
  assert.ok(
    telemetry.heat > 62,
    'stored heat does not prolong the gameplay penalty',
  );
  assert.equal(telemetry.thrustScale, 1);
  assert.ok(sampleHelionHeatFeedback(telemetry).smoke > 0.4);
  runtime.reset({ state: { ...state, distance: 0 }, reason: 'manual-recover' });
  assert.equal(runtime.snapshot().contactAge, 5);
  assert.equal(runtime.snapshot().contactHeat, 0);
  assert.equal(sampleHelionHeatFeedback(telemetry).severity, 0);
  runtime.dispose();
});

test('contact timers and pulsing thrust replay exactly, independent of presentation settings', () => {
  const telemetryA = {},
    telemetryB = {};
  const a = createHelionRuntime({ track }, telemetryA);
  const b = createHelionRuntime(
    { track, settings: { reducedMotion: true, quality: 'low' } },
    telemetryB,
  );
  const state = {
    ...createVehicleState(),
    distance: track.thermalZones.find((z) => z.kind === 'furnace').start + 15,
  };
  a.reset({ state, scenario: 'heat-hot' });
  for (let i = 0; i < 80; i++) a.advance(state, {}, DT);
  state.distance =
    track.thermalZones.find((z) => z.kind === 'shelter').start + 15;
  for (let i = 0; i < 30; i++) a.advance(state, {}, DT);
  const copy = structuredClone(state);
  const saved = structuredClone(a.snapshot());
  b.restore(saved);
  for (const invalid of [NaN, -1, 5.1]) {
    assert.throws(
      () => b.restore({ ...saved, contactAge: invalid }),
      /Invalid Helion thermal state/,
    );
    assert.deepEqual(b.snapshot(), saved);
  }
  for (let i = 0; i < 660; i++) {
    assert.deepEqual(
      a.advance(state, controls, DT),
      b.advance(copy, controls, DT),
    );
    a.update({ state });
    b.update({ state: copy });
    assert.equal(telemetryA.thrustScale, telemetryB.thrustScale);
    assert.deepEqual(
      sampleHelionHeatFeedback(telemetryA),
      sampleHelionHeatFeedback(telemetryB),
    );
  }
  assert.deepEqual(state, copy);
  assert.deepEqual(a.snapshot(), b.snapshot());
  a.dispose();
  b.dispose();
});

for (const physical of [false, true])
  test(`${physical ? 'shared physical' : 'coordinate'} continuous fire releases all drag and overload at three seconds`, async () => {
    // Keep the real fire sampler and forces on a long straight patch so leaving
    // the zone, a bend or a rail cannot explain the regained acceleration.
    const fixture = {
      ...track,
      length: 10000,
      jumps: [],
      sampleSurface: undefined,
      thermalZones: [{ id: 'fire', kind: 'furnace', start: 100, end: 2000 }],
      sample: (distance) => ({
        position: new T.Vector3(0, 0, distance),
        tangent: new T.Vector3(0, 0, 1),
        right: new T.Vector3(1, 0, 0),
        up: new T.Vector3(0, 1, 0),
        quaternion: new T.Quaternion(),
        curvature: 0,
        bank: 0,
      }),
    };
    const dynamics = physical ? await createRapierWorld() : null;
    const telemetry = {};
    const runtime = createHelionRuntime(
      { track: fixture, dynamics },
      telemetry,
    );
    const state = { ...createVehicleState(), distance: 120 };
    try {
      runtime.reset({ state });
      assert.ok(Math.abs(telemetry.thrustScale - 0.45) < 1e-9);
      for (let i = 0; i < 359; i++) runtime.advance(state, {}, DT);
      runtime.update({ state });
      assert.ok(telemetry.thrustScale < 0.45);
      assert.ok(runtime.snapshot().contactDuration < 3);
      const release = runtime.advance(state, {}, DT);
      runtime.update({ state });
      assert.equal(runtime.snapshot().contactDuration, 3);
      assert.equal(telemetry.thrustScale, 1);
      assert.equal(
        release.find((event) => event.type === 'helion-power')?.payload.limited,
        false,
      );
      for (let i = 0; i < 240; i++) runtime.advance(state, controls, DT);
      runtime.update({ state });
      assert.equal(telemetry.contactDuration, 3);
      assert.equal(telemetry.thrustScale, 1);
      assert.equal(telemetry.heat, 100);
      assert.ok(state.distance < fixture.thermalZones[0].end);
      assert.ok(state.speed > 50, `accelerates inside fire: ${state.speed}`);
      assert.ok(sampleHelionHeatFeedback(telemetry).smoke > 0.6);
      assert.equal(state.resetCount, 0);
    } finally {
      runtime.dispose();
      dynamics?.dispose();
    }
  });

test('fire cap survives brief gaps, rearms after genuine clearance, and restores deterministically', () => {
  const telemetry = {};
  const a = createHelionRuntime({ track }, telemetry);
  const b = adapter();
  const furnace = track.thermalZones.find((zone) => zone.kind === 'furnace');
  const shelter = track.thermalZones.find((zone) => zone.kind === 'shelter');
  const state = { ...createVehicleState(), distance: furnace.start + 15 };
  try {
    a.reset({ state });
    for (let i = 0; i < 360; i++) a.advance(state, {}, DT);
    state.distance = shelter.start + 15;
    for (let i = 0; i < 30; i++) a.advance(state, {}, DT);
    a.update({ state });
    assert.equal(
      telemetry.thrustScale,
      1,
      'overload cannot return after the cap',
    );
    state.distance = furnace.start + 15;
    a.advance(state, {}, DT);
    a.update({ state });
    assert.equal(telemetry.thrustScale, 1, 'a brief gap does not restart fire');
    assert.equal(a.snapshot().contactDuration, 3);
    state.distance = shelter.start + 15;
    for (let i = 0; i < 60; i++) a.advance(state, {}, DT);
    a.update({ state });
    assert.equal(a.snapshot().fireClearAge, HELION_HEAT_RULES.contactRearm);
    assert.equal(telemetry.thrustScale, 1);
    const copy = structuredClone(state);
    const saved = structuredClone(a.snapshot());
    b.restore(saved);
    for (const [key, invalid] of [
      ['contactDuration', NaN],
      ['contactDuration', -1],
      ['contactDuration', 3.1],
      ['fireClearAge', NaN],
      ['fireClearAge', -1],
      ['fireClearAge', 0.6],
    ]) {
      assert.throws(
        () => b.restore({ ...saved, [key]: invalid }),
        /Invalid Helion thermal state/,
      );
      assert.deepEqual(b.snapshot(), saved);
    }
    state.distance = copy.distance = furnace.start + 15;
    for (let i = 0; i < 400; i++) {
      assert.deepEqual(a.advance(state, {}, DT), b.advance(copy, {}, DT));
      if (i === 0) {
        a.update({ state });
        assert.ok(telemetry.thrustScale < 0.45, 'a new contact has full bite');
        assert.ok(a.snapshot().contactDuration < 0.01);
      }
    }
    assert.deepEqual(state, copy);
    assert.deepEqual(a.snapshot(), b.snapshot());
    a.reset({ state });
    assert.equal(a.snapshot().contactDuration, 0);
    assert.equal(a.snapshot().fireClearAge, HELION_HEAT_RULES.contactRearm);
  } finally {
    a.dispose();
    b.dispose();
  }
});
