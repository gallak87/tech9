import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createZephyrTrack,
  createZephyrRoad,
  zephyrSupportedRanges,
  ZEPHYR_ROAD_CLEARANCE,
} from '../src/levels/zephyr/track/index.js';
import { createFlightModel } from '../src/physics/flight.js';
import { createVehicleState, stepVehicle } from '../src/physics/index.js';
import { createRace } from '../src/race/index.js';

const track = createZephyrTrack();
const model = createFlightModel();
const dt = 1 / 120;
const idle = { throttle: 0, brake: 0, steer: 0, boost: false, airbrake: false };
const runtime = () =>
  model.createRuntime(
    { track, settings: { steeringAssist: 0.3 } },
    {
      id: 'zephyr-flight',
      version: 1,
      rulesId: `zephyr-route-test:${track.geometryVersion}`,
    },
  );
function jumpRun(
  index,
  speed,
  { heading = 0, lateral = 0, step = dt, lap = 0 } = {},
) {
  const jump = track.jumps[index];
  const state = {
    ...createVehicleState(),
    distance: jump.takeoff - 0.8 + lap * track.length,
    speed,
    heading,
    lateral,
  };
  const adapter = runtime();
  const events = [];
  let airborneFrames = 0;
  let maximumHeight = -Infinity;
  for (let tick = 0; tick < Math.ceil(12 / step); tick += 1) {
    const next = adapter.advance(state, idle, step);
    events.push(...next);
    const pose = adapter.pose(1);
    if (pose && !pose.grounded) {
      airborneFrames += 1;
      maximumHeight = Math.max(maximumHeight, pose.position.y);
    }
    if (next.some((event) => event.type === 'jump-transfer')) break;
  }
  return {
    state,
    adapter,
    events,
    airborneFrames,
    maximumHeight,
    transfer: events.find((event) => event.type === 'jump-transfer'),
  };
}

test('Zephyr metre frames are orthonormal, continuous, closed and within the authored envelope', () => {
  assert.ok(track.length > 4800 && track.length < 5000);
  assert.equal(track.width, 32);
  let minimum = Infinity;
  let maximum = -Infinity;
  let peakBank = 0;
  for (let s = 0; s < track.length; s += 1) {
    const frame = track.sample(s);
    const next = track.sample(s + 1);
    assert.ok(
      Math.abs(frame.position.distanceTo(next.position) - 1) < 0.003,
      `metre sample at ${s}`,
    );
    assert.ok(frame.tangent.angleTo(next.tangent) < 0.022, `tangent at ${s}`);
    assert.ok(
      frame.quaternion.angleTo(next.quaternion) < 0.031,
      `transported bank at ${s}`,
    );
    for (const axis of [frame.tangent, frame.right, frame.up])
      assert.ok(Math.abs(axis.length() - 1) < 1e-9);
    assert.ok(Math.abs(frame.right.dot(frame.up)) < 1e-9);
    assert.ok(Math.abs(frame.right.dot(frame.tangent)) < 1e-9);
    assert.ok(Math.abs(frame.up.dot(frame.tangent)) < 1e-9);
    assert.ok(
      new THREE.Vector3(0, 0, 1)
        .applyQuaternion(frame.quaternion)
        .distanceTo(frame.tangent) < 1e-8,
    );
    assert.ok(track.bounds.containsPoint(frame.position));
    minimum = Math.min(minimum, frame.position.y);
    maximum = Math.max(maximum, frame.position.y);
    peakBank = Math.max(peakBank, Math.abs(frame.bank));
  }
  assert.ok(maximum - minimum > 290 && maximum - minimum < 310);
  assert.ok(peakBank > THREE.MathUtils.degToRad(75));
  assert.ok(
    track.sample(-0.01).quaternion.angleTo(track.sample(0.01).quaternion) <
      0.001,
  );
  for (const s of [-300, 0, 800, 2400]) {
    assert.ok(
      track
        .sample(s)
        .position.distanceTo(track.sample(s + track.length).position) < 1e-8,
    );
    assert.ok(
      track
        .sample(s)
        .quaternion.angleTo(track.sample(s + track.length).quaternion) < 1e-7,
    );
  }
});

test('sections and landmarks describe the real route including a full rising spiral', () => {
  assert.equal(track.sections[0].start, 0);
  assert.equal(track.sections.at(-1).end, track.length);
  for (const [i, section] of track.sections.entries()) {
    if (i) assert.equal(track.sections[i - 1].end, section.start);
    assert.ok(
      section.showcase > section.start && section.showcase < section.end,
    );
    assert.equal(
      track.scenarios[`${section.id}-showcase`].distance,
      section.showcase,
    );
    assert.equal(track.scenarios[`${section.id}-showcase`].speed, 0);
  }
  const spiral = track.landmarks.cloudspire;
  const entry = track.sample(spiral.start).position;
  const exit = track.sample(spiral.end).position;
  assert.ok(exit.y - entry.y > 160);
  assert.ok(Math.hypot(exit.x - entry.x, exit.z - entry.z) < 6);
  let accumulated = 0;
  let previous = Math.atan2(
    entry.z - spiral.position[2],
    entry.x - spiral.position[0],
  );
  for (let s = spiral.start + 2; s <= spiral.end; s += 2) {
    const p = track.sample(s).position;
    const angle = Math.atan2(
      p.z - spiral.position[2],
      p.x - spiral.position[0],
    );
    accumulated += Math.atan2(
      Math.sin(angle - previous),
      Math.cos(angle - previous),
    );
    previous = angle;
  }
  assert.ok(accumulated > 6.1, 'long spiral turns through a full circle');
  assert.ok(
    Math.abs(track.sample(track.landmarks.nave.s).bank) > 1.3,
    'nave showcase actually demonstrates the wall ride',
  );
});

test('nonadjacent decks have vertical or lateral separation for road and camera envelopes', () => {
  const frames = [];
  for (let s = 0; s < track.length; s += 8)
    frames.push({ s, ...track.sample(s) });
  for (let a = 0; a < frames.length; a += 1) {
    for (let b = a + 1; b < frames.length; b += 1) {
      const delta = frames[b].s - frames[a].s;
      if (Math.min(delta, track.length - delta) < 110) continue;
      const displacement = frames[b].position.clone().sub(frames[a].position);
      if (displacement.length() > 85) continue;
      const f = frames[a];
      const g = frames[b];
      const axes = [f.right, f.up, f.tangent, g.right, g.up, g.tangent];
      // A conservative 36m-wide road/camera box reaches 22m above and 13m below.
      const centreF = f.position.clone().addScaledVector(f.up, 4.5);
      const centreG = g.position.clone().addScaledVector(g.up, 4.5);
      const extent = (frame, axis) =>
        18 * Math.abs(frame.right.dot(axis)) +
        17.5 * Math.abs(frame.up.dot(axis)) +
        6 * Math.abs(frame.tangent.dot(axis));
      assert.ok(
        axes.some(
          (axis) =>
            Math.abs(centreG.clone().sub(centreF).dot(axis)) >
            extent(f, axis) + extent(g, axis),
        ),
        `route camera envelope near ${f.s}/${g.s}`,
      );
    }
  }
});

test('mandatory jumps have real missing decks, readable receiving shelves and a single transfer checkpoint', () => {
  assert.equal(track.jumps.length, 2);
  const ranges = zephyrSupportedRanges(track);
  assert.equal(ranges.length, 3);
  for (const jump of track.jumps) {
    assert.ok(
      jump.takeoff < jump.landingStart &&
        jump.landingStart < jump.landingEnd &&
        jump.landingEnd < jump.recovery,
    );
    assert.ok(jump.landingEnd - jump.landingStart >= 220 - 0.001);
    const credited = track.checkpoints.filter(
      ({ distance }) => distance > jump.takeoff && distance <= jump.recovery,
    );
    assert.equal(credited.length, 1);
    assert.equal(credited[0].distance, jump.landingStart);
    assert.equal(
      track.surfaceCoverage((jump.takeoff + jump.landingStart) / 2),
      0,
    );
    assert.equal(track.surfaceCoverage(jump.recovery), 1);
    assert.ok(track.sample(jump.takeoff).tangent.y > 0.1);
    assert.ok(Math.abs(track.sample(jump.recovery).tangent.y) < 0.001);
    assert.ok(Math.abs(track.sample(jump.recovery).bank) < 0.003);
  }
});

test('shared ballistic flight lands both authored gaps from 70% cruise to full boost', () => {
  for (let i = 0; i < track.jumps.length; i += 1) {
    for (const speed of [78.4, 90, 112, 135, 157]) {
      const result = jumpRun(i, speed);
      assert.equal(
        result.transfer?.payload.outcome,
        'landed',
        `jump ${i + 1} at ${speed}`,
      );
      assert.equal(
        result.events.filter(({ type }) => type === 'jump-launch').length,
        1,
      );
      assert.ok(result.airborneFrames > 60);
      assert.ok(
        result.maximumHeight >
          track.sample(track.jumps[i].takeoff).position.y + 1.4,
      );
      assert.ok(result.state.speed > speed * 0.96);
      result.adapter.dispose();
    }
  }
});

test('slow and sideways launches genuinely miss, then recover once at the correct apron', () => {
  for (let i = 0; i < track.jumps.length; i += 1) {
    for (const [speed, heading] of [
      [52, 0],
      [110, 0.27],
    ]) {
      const result = jumpRun(i, speed, { heading });
      assert.equal(result.transfer?.payload.outcome, 'recovered');
      assert.equal(
        result.events.filter(({ type }) => type === 'jump-miss').length,
        1,
      );
      assert.equal(
        result.events.filter(({ type }) => type === 'jump-transfer').length,
        1,
      );
      assert.ok(
        Math.abs(result.state.distance - track.jumps[i].recovery) < 1e-8,
      );
      assert.equal(result.state.speed, 0);
      assert.equal(result.state.heading, 0);
      result.adapter.dispose();
    }
  }
});

test('large caller ticks and later laps preserve swept landing and ordered race credit', () => {
  for (const step of [dt, 1 / 60, 0.1]) {
    for (let i = 0; i < 2; i += 1) {
      const result = jumpRun(i, 157, { step, lap: 2 });
      assert.equal(result.transfer?.payload.outcome, 'landed');
      assert.ok(
        result.transfer.payload.to >
          2 * track.length + track.jumps[i].landingStart,
      );
      result.adapter.dispose();
    }
  }
  const race = createRace(track);
  let from = 0;
  for (let i = 0; i < track.jumps.length; i += 1) {
    const jump = track.jumps[i];
    race.step(from, jump.takeoff, 1);
    const result = jumpRun(i, 112);
    race.step(jump.takeoff, result.state.distance, 1, [result.transfer]);
    assert.equal(race.valid, true);
    from = result.state.distance;
    result.adapter.dispose();
  }
  race.step(from, track.length + 1, 1);
  assert.equal(race.history.length, 1);
  assert.equal(race.history[0].valid, true);
  const shortcut = createRace(track);
  shortcut.step(0, track.jumps[0].recovery, 1);
  assert.equal(
    shortcut.valid,
    false,
    'crossing the gap without the matching flight event cannot award progress',
  );
});

test('ordinary banking preserves parking, braking and driver-right while flight serializes deterministically', () => {
  for (const name of ['bank-rest', 'slope-rest']) {
    const state = { ...createVehicleState(), ...track.scenarios[name] };
    const initial = { ...state };
    for (let tick = 0; tick < 240; tick += 1)
      stepVehicle(state, idle, track, dt);
    assert.equal(state.distance, initial.distance);
    assert.equal(state.lateral, 0);
    assert.equal(state.speed, 0);
  }
  const start = track.jumps[0].takeoff - 90;
  const right = { ...createVehicleState(), distance: start, speed: 65 };
  const left = { ...right };
  const braking = { ...right };
  const coasting = { ...right };
  for (let tick = 0; tick < 24; tick += 1) {
    stepVehicle(right, { ...idle, steer: 1 }, track, dt);
    stepVehicle(left, { ...idle, steer: -1 }, track, dt);
    stepVehicle(braking, { ...idle, brake: 1 }, track, dt);
    stepVehicle(coasting, idle, track, dt);
  }
  assert.ok(right.lateral < -0.1 && left.lateral > 0.1);
  assert.ok(braking.speed < coasting.speed - 8);
  const state = {
    ...createVehicleState(),
    ...track.scenarios['jump2-success'],
  };
  const adapter = runtime();
  for (let tick = 0; tick < 50; tick += 1) adapter.advance(state, idle, dt);
  const snapshot = JSON.parse(JSON.stringify(adapter.snapshot()));
  const copy = { ...state };
  const restored = runtime();
  restored.restore(snapshot);
  for (let tick = 0; tick < 100; tick += 1)
    assert.deepEqual(
      adapter.advance(state, idle, dt),
      restored.advance(copy, idle, dt),
    );
  assert.deepEqual(state, copy);
  assert.deepEqual(adapter.snapshot(), restored.snapshot());
  adapter.reset();
  assert.equal(adapter.pose(), null);
  assert.equal(adapter.snapshot().mode, 'magnetic');
  adapter.dispose();
  restored.dispose();
});

test('production and neutral roads keep gaps, outside-camera sails, bounded geometry and owned disposal', () => {
  for (const shape of [false, true]) {
    const road = createZephyrRoad(track, { shape });
    const meshes = road.group.children;
    assert.ok(meshes.length <= 20);
    let count = 0;
    let disposed = 0;
    for (const mesh of meshes) {
      assert.ok(mesh.isMesh);
      const attribute = mesh.geometry.attributes.position;
      assert.ok(Array.from(attribute.array).every(Number.isFinite));
      count += attribute.count;
      mesh.geometry.addEventListener('dispose', () => {
        disposed += 1;
      });
      if (!mesh.userData.drivingSurface) continue;
      for (let i = 0; i < attribute.count; i += 1) {
        const point = new THREE.Vector3().fromBufferAttribute(attribute, i);
        for (const jump of track.jumps) {
          const launch = track.sample(jump.takeoff);
          const landing = track.sample(jump.landingStart);
          const offset = point.clone().sub(launch.position);
          if (
            Math.abs(offset.dot(launch.right)) > 17 ||
            point.y < landing.position.y - 2 ||
            point.y > launch.position.y + 2
          )
            continue;
          assert.ok(
            offset.dot(launch.tangent) < 0.02 ||
              point.clone().sub(landing.position).dot(landing.tangent) > -0.02,
            `rendered surface bridges ${jump.id}`,
          );
        }
      }
    }
    assert.ok(count < 150000);
    for (const sail of road.group.userData.sailEnvelope)
      assert.ok(
        sail.cameraHeightLateral > ZEPHYR_ROAD_CLEARANCE.cameraHalfWidth + 2,
      );
    road.dispose();
    assert.equal(disposed, meshes.length);
    road.dispose();
    assert.equal(disposed, meshes.length);
  }
});
