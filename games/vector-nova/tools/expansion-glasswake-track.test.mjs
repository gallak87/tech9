import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createGlasswakeTrack,
  buildGlasswakeRoad,
} from '../src/levels/glasswake/track/index.js';
import { createGlasswakeRuntime } from '../src/levels/glasswake/runtime.js';
import { createVehicleState } from '../src/physics/index.js';
import { createRace } from '../src/race/index.js';
import { assertTrackContract } from './level-checks/track-contract.mjs';
import { createRoadSurface } from '../src/physics/road-surface.js';
import { indexedTriangles } from '../src/physics/collision-world.js';

const track = createGlasswakeTrack();
const clamp = THREE.MathUtils.clamp;

test('Glasswake glass and frost form one flush, smooth driving surface across the lap', (t) => {
  const road = buildGlasswakeRoad(track, { collisionOnly: true });
  road.group.updateMatrixWorld(true);
  const surfaces = road.group.children.filter(
    (mesh) => mesh.userData.drivingSurface,
  );
  const triangles = surfaces.flatMap((mesh) =>
    indexedTriangles(
      mesh.geometry.attributes.position.array,
      mesh.geometry.index.array,
      { kind: 'deck', id: mesh.name },
      mesh.matrixWorld,
      mesh.geometry.attributes.roadCoord,
    ),
  );
  const sample = createRoadSurface(triangles);
  t.after(() => {
    sample.dispose();
    road.dispose();
  });
  assert.equal(surfaces.length, 3, 'retain the same three material draws');
  assert.ok(triangles.length < 70000, 'keep refinement bounded');
  for (const lateral of [-13.5, -4.5, 0, 4.5, 13.5]) {
    let previous = null;
    for (let distance = 0.3; distance < track.length; distance += 0.3) {
      if (track.isGap(distance)) {
        previous = null;
        continue;
      }
      const frame = track.sample(distance);
      const surface = sample(distance, lateral, frame);
      assert.ok(surface, `unsealed panel seam at ${distance}, ${lateral}`);
      const height = surface.position.clone().sub(frame.position).dot(frame.up);
      assert.ok(
        Math.abs(height) < (lateral === 0 ? 0.012 : 0.06),
        `deck sag at ${distance}, ${lateral}: ${height}`,
      );
      if (previous)
        assert.ok(
          surface.up.angleTo(previous) < 0.04,
          `contact-normal bump at ${distance}, ${lateral}`,
        );
      previous = surface.up;
    }
  }
  for (const jump of track.jumps) {
    const distance = (jump.takeoff + jump.landingStart) / 2;
    assert.equal(
      sample(distance, 0, track.sample(distance)),
      null,
      'real fracture gaps remain open',
    );
  }
});

test('Glasswake route is a continuous metre-parameterized loop with a pronounced crevice plunge', () => {
  const report = assertTrackContract(track);
  assert.ok(report.samples > 4800);
  assert.ok(track.length > 4700 && track.length < 5050);
  assert.equal(track.width, 30);
  let minimum = Infinity;
  let maximum = -Infinity;
  let maxTurn = 0;
  let maxFrame = 0;
  for (let distance = 0; distance < track.length; distance += 1) {
    const frame = track.sample(distance);
    const next = track.sample(distance + 1);
    minimum = Math.min(minimum, frame.position.y);
    maximum = Math.max(maximum, frame.position.y);
    maxTurn = Math.max(maxTurn, frame.tangent.angleTo(next.tangent));
    maxFrame = Math.max(maxFrame, frame.quaternion.angleTo(next.quaternion));
    assert.ok(Math.abs(frame.position.distanceTo(next.position) - 1) < 0.0003);
  }
  assert.ok(maximum - minimum > 250 && maximum - minimum < 258);
  assert.ok(maxTurn < 0.019, `Curvature turn ${maxTurn}`);
  assert.ok(maxFrame < 0.04, `Frame rotation ${maxFrame}`);
  assert.ok(
    track.sample(-0.001).position.distanceTo(track.sample(0.001).position) <
      0.00201,
  );
  assert.ok(
    track.sample(-0.001).quaternion.angleTo(track.sample(0.001).quaternion) <
      0.0001,
  );
});

test('Glasswake keeps nonadjacent road clear and places exactly one checkpoint across each transfer', () => {
  const frames = Array.from(
    { length: Math.ceil(track.length / 10) },
    (_, index) => track.sample(index * 10),
  );
  for (let i = 0; i < frames.length; i += 1)
    for (let j = i + 1; j < frames.length; j += 1) {
      if (Math.min(j - i, frames.length - j + i) * 10 < 160) continue;
      assert.ok(
        frames[i].position.distanceTo(frames[j].position) > 75,
        `Adjacent envelopes at ${i * 10}/${j * 10}`,
      );
    }
  assert.ok(track.bridge.length >= 450 && track.bridge.length <= 650);
  for (const jump of track.jumps) {
    const checkpoints = track.checkpoints.filter(
      ({ distance }) =>
        distance >= jump.takeoff &&
        distance <= Math.max(jump.landingEnd, jump.recovery),
    );
    assert.equal(checkpoints.length, 1);
    assert.equal(checkpoints[0].distance, jump.landingStart);
    assert.ok(jump.landingEnd < jump.recovery);
    assert.ok(!track.isGap(jump.recovery));
    const before = track.sample(jump.takeoff).position;
    const after = track.sample(jump.landingStart).position;
    assert.ok(before.y - after.y > 4);
  }
  for (const [name, scenario] of Object.entries(track.scenarios))
    assert.ok(
      !track.isGap(scenario.distance),
      `Scenario ${name} is parked over a real gap`,
    );
});

test('Glasswake rendered driving surfaces are truly absent across both gaps and frost boundaries match their material', () => {
  for (const shape of [false, true]) {
    const road = buildGlasswakeRoad(track, { shape });
    road.group.updateMatrixWorld(true);
    const surfaces = road.group.children.filter(
      (mesh) => mesh.userData.drivingSurface,
    );
    const probe = (distance, lateral) => {
      const frame = track.sample(distance);
      const origin = frame.position
        .clone()
        .addScaledVector(frame.right, lateral)
        .addScaledVector(frame.up, 5);
      return new THREE.Raycaster(
        origin,
        frame.up.clone().negate(),
        0,
        10,
      ).intersectObjects(surfaces, false);
    };
    for (const jump of track.jumps)
      for (const fraction of [0.2, 0.5, 0.8])
        for (const lateral of [-10, 0, 10])
          assert.equal(
            probe(
              THREE.MathUtils.lerp(jump.takeoff, jump.landingStart, fraction),
              lateral,
            ).length,
            0,
            `${jump.id} contains rendered road`,
          );
    for (const zone of track.gripZones) {
      const distance = (zone.start + zone.end) / 2;
      const lateral = (zone.lateralMin + zone.lateralMax) / 2;
      assert.equal(
        probe(distance, lateral)[0]?.object.userData.grip,
        0.25,
        `Missing frost ${zone.id}`,
      );
      const clearLateral = lateral < 0 ? 8 : -8;
      assert.notEqual(
        probe(distance, clearLateral)[0]?.object.userData.grip,
        0.25,
        `Frost leaks into the clear lane at ${zone.id}`,
      );
      assert.equal(track.surfaceAt(distance, clearLateral).grip, 1);
    }
    road.dispose();
  }
});

test('Glasswake high/low road retains topology, finite geometry and idempotent resource disposal', () => {
  const road = buildGlasswakeRoad(track, { settings: { quality: 'high' } });
  const resources = { geometry: new Set(), material: new Set() };
  road.group.traverse((mesh) => {
    if (!mesh.geometry) return;
    resources.geometry.add(mesh.geometry);
    resources.material.add(mesh.material);
    for (const value of mesh.geometry.attributes.position.array)
      assert.ok(Number.isFinite(value));
  });
  const glass = road.group.children.find(
    (mesh) => mesh.name === 'Optically clear crystal deck cassettes',
  );
  const high = glass.material;
  assert.equal(
    high.transmission,
    0,
    'crystal ice must not request a scene transmission pass',
  );
  assert.equal(high.transparent, true);
  assert.ok(
    high.opacity > 0 && high.opacity < 1,
    'alpha retains visibility through the ice',
  );
  const geometry = glass.geometry;
  road.update({ settings: { quality: 'low', reducedMotion: true } });
  assert.notEqual(glass.material, high);
  assert.equal(glass.geometry, geometry);
  resources.material.add(glass.material);
  road.update({ settings: { quality: 'high', reducedMotion: false } });
  assert.equal(glass.material, high);
  const disposed = { geometry: 0, material: 0 };
  for (const [kind, entries] of Object.entries(resources))
    for (const resource of entries)
      resource.addEventListener('dispose', () => (disposed[kind] += 1));
  road.dispose();
  road.dispose();
  assert.equal(road.group.children.length, 0);
  assert.equal(disposed.geometry, resources.geometry.size);
  assert.equal(disposed.material, resources.material.size);
});

// Verification-only normalized controller, never shipped as steering assistance.
// It drives the exact production runtime from rest without editing vehicle state.
function lapInput(state) {
  const frame = track.sample(state.distance);
  let curvatureAhead = 0;
  for (let distance = 0; distance <= 100; distance += 10)
    curvatureAhead = Math.max(
      curvatureAhead,
      Math.abs(track.sample(state.distance + distance).curvature),
    );
  const grip = track.surfaceAt(state.distance, state.lateral).grip;
  const target = Math.min(
    110,
    Math.sqrt(65 / Math.max(0.00001, curvatureAhead)),
  );
  const desiredHeading =
    (frame.curvature * state.speed * 0.75) / (7.2 * grip) +
    (9.81 * frame.right.y) / (7.2 * grip * Math.max(20, state.speed)) -
    state.lateral * 0.015 -
    state.lateralSpeed * 0.009;
  return {
    throttle: state.speed < target + 1 ? 1 : 0,
    brake: clamp((state.speed - target - 1) * 0.15, 0, 1),
    steer: clamp(
      (-frame.curvature * state.speed) / 1.5 +
        (state.heading - desiredHeading) * 3,
      -1,
      1,
    ),
    boost: false,
    airbrake: false,
  };
}

test('Glasswake completes an ordered CPU lap with existing 0.3 assistance and actual corner-exit jump speeds', () => {
  const state = createVehicleState();
  const runtime = createGlasswakeRuntime({
    track,
    settings: { steeringAssist: 0.3 },
  });
  const race = createRace(track, { rulesId: runtime.rulesId });
  const events = [];
  let maximumLateral = 0;
  for (let tick = 0; tick < 16000; tick += 1) {
    const before = state.distance;
    const input = runtime.snapshot().mode === 'magnetic' ? lapInput(state) : {};
    const next = runtime.advance(state, input, 1 / 120);
    events.push(...next, ...race.step(before, state.distance, 1 / 120, next));
    maximumLateral = Math.max(maximumLateral, Math.abs(state.lateral));
    if (events.some((event) => event.type === 'lap')) break;
  }
  const lap = events.find((event) => event.type === 'lap');
  assert.ok(lap?.payload.valid);
  assert.ok(lap.payload.duration > 45 && lap.payload.duration < 70);
  assert.equal(events.filter((event) => event.type === 'impact').length, 0);
  assert.ok(maximumLateral < 3);
  assert.deepEqual(
    events
      .filter((event) => event.type === 'checkpoint')
      .map((event) => event.payload.index),
    [1, 2, 3, 4, 5, 6, 7, 0],
  );
  assert.deepEqual(
    events
      .filter((event) => event.type === 'jump-transfer')
      .map((event) => event.payload.outcome),
    ['landed', 'landed'],
  );
  assert.equal(state.resetCount, 0);
  runtime.dispose();
});

test('Glasswake centered launch envelope has no isolated swept-contact holes from 78.4 to 157 m/s', () => {
  const speeds = [
    ...Array.from({ length: 315 }, (_, index) => 78.4 + index * 0.25),
    157,
  ];
  for (const jump of track.jumps) {
    for (const speed of speeds) {
      const state = Object.assign(createVehicleState(), {
        distance: jump.takeoff - 0.25,
        speed,
        heading: 0,
      });
      const runtime = createGlasswakeRuntime({
        track,
        settings: { steeringAssist: 0.3 },
      });
      let transfer;
      for (let tick = 0; tick < 1000 && !transfer; tick += 1) {
        transfer = runtime
          .advance(state, {}, 1 / 120)
          .find((event) => event.type === 'jump-transfer');
      }
      assert.equal(
        transfer?.payload.outcome,
        'landed',
        `${jump.id} fails centered ${speed.toFixed(2)} m/s launch`,
      );
      runtime.dispose();
    }
  }
});

test('Glasswake short launch setups reach both shelves from rest with held throttle and manual boost', () => {
  for (const [index, jump] of track.jumps.entries()) {
    const runtime = createGlasswakeRuntime({
      track,
      settings: { steeringAssist: 0.3 },
    });
    const state = Object.assign(
      createVehicleState(),
      track.scenarios[`jump${index + 1}-approach`],
    );
    const events = [];
    for (let tick = 0; tick < 1200; tick += 1) {
      events.push(
        ...runtime.advance(
          state,
          { throttle: 1, boost: true, steer: 0 },
          1 / 120,
        ),
      );
      if (events.some((event) => event.type === 'jump-transfer')) break;
    }
    assert.equal(
      events.find((event) => event.type === 'jump-transfer')?.payload.outcome,
      'landed',
      jump.id,
    );
    assert.equal(events.filter((event) => event.type === 'impact').length, 0);
    assert.ok(
      events.find((event) => event.type === 'jump-launch')?.payload.speed >
        78.4,
    );
    runtime.dispose();
  }
});

// Absolute frames verify a complete rotation and a genuinely steep descent,
// while retaining metre spacing and the original fracture takeoff geometry.
test('crevice corkscrew rotates continuously through inversion and climbs back out', () => {
  const { crevice } = track;
  const midpoint = (crevice.corkscrewStart + crevice.corkscrewEnd) / 2;
  assert.ok(track.sample(midpoint).up.y < -0.5);
  assert.ok(track.sample(crevice.floor).position.y < 0);
  assert.ok(
    track.sample(crevice.entry).position.y -
      track.sample(crevice.floor).position.y >
      240,
  );
  assert.ok(
    track.sample(crevice.exit).position.y -
      track.sample(crevice.floor).position.y >
      125,
  );
  let steepest = 0;
  for (let s = crevice.entry; s < crevice.floor; s += 2)
    steepest = Math.min(steepest, track.sample(s).tangent.y);
  assert.ok(steepest < -0.55);
});
