import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  createVehicleState,
  stepVehicle,
  surfaceHullClearance,
  STEERING_ASSIST,
} from './index.js';
import { createShatterlineTrack } from '../levels/shatterline/track/model.js';
import { createShatterlineRuntime } from '../levels/shatterline/runtime.js';
import { createTubeSurface } from '../levels/shatterline/track/tube-surface.js';
import { VEHICLE_HULL } from './hull.js';
import { getRacerControl } from '../race/racers.js';

const dt = 1 / 120;
const input = {
  throttle: 1,
  steer: 0,
  boost: false,
  brake: 0,
  airbrake: false,
};
const flatFrame = (distance) => ({
  position: new T.Vector3(0, 0, distance),
  tangent: new T.Vector3(0, 0, 1),
  right: new T.Vector3(1, 0, 0),
  up: new T.Vector3(0, 1, 0),
  quaternion: new T.Quaternion(),
  curvature: 0,
  bank: 0,
  roll: 0,
});
const plain = { width: 50, length: 4000, sample: flatFrame };
const tube = createTubeSurface({ sample: flatFrame, start: 100, end: 3000 });
const cylinder = {
  ...plain,
  sampleSurface: tube.sampleSurface,
  tubes: [tube.descriptor],
  tubeAt: (distance) =>
    distance >= tube.descriptor.start && distance <= tube.descriptor.end
      ? tube.descriptor
      : null,
  closed: false,
  jumps: [],
  checkpoints: [],
  scenarios: {},
  geometryVersion: 'surface-test-v1',
};
const wrap = (n, period) =>
  ((((n + period / 2) % period) + period) % period) - period / 2;

test('an absent or inactive surface preserves the ordinary physics arithmetic exactly', () => {
  const a = { ...createVehicleState(), speed: 105 },
    b = { ...a };
  const nullSurface = { ...plain, sampleSurface: () => null };
  for (let i = 0; i < 800; i++) {
    const controls = {
      ...input,
      steer: Math.sin(i / 27) * 0.3,
      airbrake: i > 500,
    };
    assert.deepEqual(
      stepVehicle(a, controls, plain, dt),
      stepVehicle(b, controls, nullSurface, dt),
    );
  }
  assert.deepEqual(a, b);
  assert.equal(STEERING_ASSIST, 0.3);
});

test('surface metrics convert physical motion without adding lateral drift', () => {
  const track = {
    ...plain,
    sampleSurface: (s, l) => ({
      ...flatFrame(s),
      position: new T.Vector3(l + 0.5 * s, 0, 2 * s),
      longitudinalMetric: 2,
      lateralMetric: 1,
      longitudinalShear: 0.5,
      bounds: { min: -1000, max: 1000 },
      period: 0,
    }),
  };
  const state = { ...createVehicleState(), speed: 112 };
  stepVehicle(state, input, track, dt);
  const point = track.sampleSurface(state.distance, state.lateral).position;
  assert.ok(
    Math.abs(point.x) < 1e-12,
    'longitudinal shear is a coordinate effect, not side thrust',
  );
  assert.ok(Math.abs(point.z - ((112 + state.speed) * dt) / 2) < 1e-12);
});

test('ordinary steering completes either direction of a closed tube without a seam impact', () => {
  for (const sign of [-1, 1]) {
    const state = {
      ...createVehicleState(),
      distance: tube.descriptor.entryEnd + 20,
      speed: 155,
    };
    const runtime = createShatterlineRuntime({
      track: cylinder,
      presentation: false,
    });
    let travelled = 0,
      previous = state.lateral,
      ceiling = false,
      impacts = 0,
      previousPosition = null;
    try {
      for (
        let tick = 0;
        tick < 1200 && Math.abs(travelled) < Math.PI * 70;
        tick++
      ) {
        const events = runtime.advance(
          state,
          { ...input, steer: tick < 30 ? sign : 0 },
          dt,
        );
        travelled += wrap(state.lateral - previous, Math.PI * 70);
        previous = state.lateral;
        const surface = cylinder.sampleSurface(state.distance, state.lateral);
        assert.ok(
          surface?.period > 0,
          'rotation completes within the physically closed interval',
        );
        ceiling ||= surface.up.y < -0.95;
        const pose = runtime.pose(1);
        if (previousPosition)
          assert.ok(
            pose.position.distanceTo(previousPosition) < 2,
            'no seam teleport',
          );
        previousPosition = pose.position;
        impacts += events.filter((event) => event.type === 'impact').length;
      }
      assert.ok(
        Math.abs(travelled) >= Math.PI * 70,
        'a complete circumference is freely drivable',
      );
      assert.ok(ceiling);
      assert.equal(impacts, 0);
      assert.equal(runtime.snapshot().mode, 'magnetic');
    } finally {
      runtime.dispose();
    }
  }
});

test('concave support clears the whole yawed hull and snapshot replay crosses the seam exactly', () => {
  const state = {
    ...createVehicleState(),
    distance: 1000,
    lateral: 109,
    heading: 0.3,
    speed: 155,
  };
  const runtime = createShatterlineRuntime({
    track: cylinder,
    presentation: false,
  });
  try {
    runtime.advance(state, input, dt);
    const surface = cylinder.sampleSurface(state.distance, state.lateral);
    const clearance = surfaceHullClearance(surface, state.heading);
    assert.ok(clearance > 0 && clearance < 0.3);
    const pose = runtime.pose(1);
    const centre = flatFrame(state.distance).position.add(
      new T.Vector3(0, 35, 0),
    );
    for (const x of [-VEHICLE_HULL.halfWidth, VEHICLE_HULL.halfWidth])
      for (const z of [-VEHICLE_HULL.halfLength, VEHICLE_HULL.halfLength]) {
        const corner = new T.Vector3(x, -VEHICLE_HULL.hover, z)
          .applyQuaternion(pose.quaternion)
          .add(pose.position)
          .sub(centre);
        assert.ok(
          Math.hypot(corner.x, corner.y) < 35,
          'flat hull corners stay inside the bore',
        );
      }
    const saved = structuredClone({ state, runtime: runtime.snapshot() });
    const advance = () => {
      for (let tick = 0; tick < 300; tick++) runtime.advance(state, input, dt);
      return structuredClone({ state, runtime: runtime.snapshot() });
    };
    const expected = advance();
    Object.assign(state, saved.state);
    runtime.restore(saved.runtime);
    assert.deepEqual(advance(), expected);
  } finally {
    runtime.dispose();
  }
});

test('angled collector contact retains rail-tangential velocity without rotating the hull instantly', () => {
  const makeTrack = (limited) => ({
    ...plain,
    sampleSurface: (s, l) => ({
      ...flatFrame(s),
      position: new T.Vector3(l, 0, s),
      longitudinalMetric: 1,
      lateralMetric: 1,
      longitudinalShear: 0,
      bounds: {
        min: -1000,
        max: limited ? 25 - 0.2 * s : 1000,
        maxDerivative: -0.2,
      },
      period: 0,
    }),
  });
  const state = { ...createVehicleState(), lateral: 22.04, speed: 100 },
    free = { ...state };
  stepVehicle(free, input, makeTrack(false), dt);
  const events = stepVehicle(state, input, makeTrack(true), dt);
  assert.equal(events.filter((event) => event.type === 'impact').length, 1);
  assert.equal(state.heading, 0);
  const alongRail = (s) =>
    (s.speed - 0.2 * s.lateralSpeed) / Math.hypot(1, 0.2);
  assert.ok(Math.abs(alongRail(state) - alongRail(free)) < 1e-10);
  assert.ok(state.lateralSpeed < 0, 'the physical rail deflects motion inward');
});

test('AI treats opposite seam coordinates as nearby lanes on the same surface', () => {
  const state = {
    ...createVehicleState(),
    distance: 1000,
    lateral: Math.PI * 35 - 0.1,
    speed: 140,
  };
  const controls = getRacerControl(state, cylinder, {
    lane: -Math.PI * 35 + 0.1,
    difficulty: 'medium',
  });
  assert.ok(
    controls.steer < 0,
    'the driver takes the short positive-lateral seam crossing',
  );
  assert.ok(
    Math.abs(controls.steer) < 0.05,
    'a nearby lane does not trigger a full-circumference correction',
  );
});

test('both curved Overturn collectors keep ordinary centre, wall and seam departures supported', () => {
  const track = createShatterlineTrack();
  assert.equal(track.tubes.length, 2);
  for (const [index, descriptor] of track.tubes.entries()) {
    for (const fraction of [0, 0.5, index ? -0.9999 : 0.9999]) {
      const state = {
        ...createVehicleState(),
        distance: descriptor.exitStart - 10,
        lateral: fraction * Math.PI * descriptor.radius,
        speed: 155,
      };
      const runtime = createShatterlineRuntime({ track, presentation: false });
      let previousPosition = null;
      try {
        for (
          let tick = 0;
          tick < 2400 && state.distance < descriptor.end + 5;
          tick++
        ) {
          runtime.advance(
            state,
            getRacerControl(state, track, { runtime, difficulty: 'medium' }),
            dt,
          );
          const pose = runtime.pose(1);
          if (previousPosition)
            assert.ok(
              pose.position.distanceTo(previousPosition) < 1.6,
              descriptor.id + ': no collector position jump',
            );
          previousPosition = pose.position;
          assert.equal(pose.grounded, true);
        }
        assert.ok(
          state.distance > descriptor.end,
          descriptor.id + ': physical collector reaches the ordinary road',
        );
        assert.ok(
          Math.abs(state.lateral) < track.width / 2 - VEHICLE_HULL.halfWidth,
        );
        assert.ok(
          state.speed > 0,
          'scraping a collector rail does not teleport or park the craft',
        );
      } finally {
        runtime.dispose();
      }
    }
  }
});

test('opt-in exit bumper redirects a real hit with less speed and reserve loss', () => {
  const track = {
    ...plain,
    sampleSurface: (s, l) => ({
      ...flatFrame(s),
      position: new T.Vector3(l, 0, s),
      longitudinalMetric: 1,
      lateralMetric: 1,
      longitudinalShear: 0,
      bounds: { min: -1000, max: 25 - 0.8 * s, maxDerivative: -0.8 },
      period: 0,
    }),
  };
  const original = { ...createVehicleState(), lateral: 22.04, speed: 100 };
  const assisted = { ...original };
  stepVehicle(original, input, track, dt);
  const events = stepVehicle(assisted, input, track, dt, {
    railRecovery: { id: 'exit', inwardSpeed: 75 },
  });
  assert.equal(events[0].payload.response, 'exit-nudge');
  assert.ok(assisted.speed >= 88 && assisted.speed > original.speed);
  assert.ok(assisted.energy > original.energy);
  assert.ok(assisted.lateralSpeed < -18);
  assert.equal(
    assisted.heading,
    0,
    'the contact does not instantly rotate the hull',
  );
  assert.equal(
    assisted.lateral,
    original.lateral,
    'the contact adds no position teleport',
  );
});

test('Shatterline exit help is dormant for clean lines and ends outside the red tube zone', () => {
  const track = createShatterlineTrack(),
    tube = track.tubes[0];
  const state = {
    ...createVehicleState(),
    distance: tube.exitStart - 30,
    speed: 130,
  };
  const runtime = createShatterlineRuntime({ track, presentation: false });
  try {
    for (let tick = 0; tick < 30; tick++) {
      const events = runtime.advance(state, input, dt);
      assert.equal(
        events.some((e) => e.payload?.response === 'exit-nudge'),
        false,
      );
      assert.equal(Object.hasOwn(state, 'railRecovery'), false);
    }
    for (const distance of [
      tube.start + 10,
      tube.end + 30,
      track.overturn.end + 100,
    ]) {
      Object.assign(state, createVehicleState(), {
        distance,
        speed: 70,
        lateral: 0,
        railRecovery: { id: tube.id, until: 100 },
      });
      runtime.reset({ state });
      runtime.advance(state, input, dt);
      assert.equal(
        state.railRecovery,
        null,
        'entry and ordinary road have no exit help',
      );
    }
  } finally {
    runtime.dispose();
  }
});

test('contact-triggered exit recovery survives a mid-nudge replay exactly', () => {
  const track = createShatterlineTrack(),
    tube = track.tubes[0];
  const state = {
    ...createVehicleState(),
    distance: tube.exitStart - 10,
    lateral: Math.PI * tube.radius * 0.9999,
    speed: 155,
  };
  const runtime = createShatterlineRuntime({ track, presentation: false });
  try {
    for (let tick = 0; tick < 600 && !state.railRecovery; tick++)
      runtime.advance(state, input, dt);
    assert.ok(
      state.railRecovery,
      'a ceiling approach touches the actual opening rim',
    );
    const saved = structuredClone({ state, runtime: runtime.snapshot() });
    const advance = () => {
      for (let tick = 0; tick < 240; tick++) runtime.advance(state, input, dt);
      return structuredClone({ state, runtime: runtime.snapshot() });
    };
    const expected = advance();
    Object.assign(state, saved.state);
    runtime.restore(saved.runtime);
    assert.deepEqual(advance(), expected);
  } finally {
    runtime.dispose();
  }
});
