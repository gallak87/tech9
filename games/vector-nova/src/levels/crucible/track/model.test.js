import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrucibleTrack } from './model.js';
import { createCrucibleDevices } from '../devices.js';
import { createCrucibleRoad } from './road.js';
import { createCrucibleEnvironment } from '../environment.js';
import { createVehicleState, stepVehicle } from '../../../physics/index.js';
import { getRacerControl } from '../../../race/racers.js';

test('the foundry loop closes smoothly and keeps crowded racing width clear of folded corners', () => {
  const track = createCrucibleTrack(),
    start = track.sample(0),
    end = track.sample(track.length - 0.001);
  assert.ok(Math.abs(track.length - 4300) < 0.01);
  assert.equal(track.width, 44);
  assert.ok(start.position.distanceTo(end.position) < 0.002);
  assert.ok(start.tangent.dot(end.tangent) > 0.99999);
  assert.ok(start.up.dot(end.up) > 0.99999);
  for (let d = 0; d < track.length; d += 8) {
    const f = track.sample(d);
    assert.ok(Math.abs(f.tangent.length() - 1) < 1e-8);
    assert.ok(Math.abs(f.up.dot(f.right)) < 1e-8);
    assert.ok(
      Math.abs(f.curvature) < 0.008,
      'every racing line has room inside a banked bend',
    );
    assert.ok(
      Math.abs(f.tangent.y) < 0.18,
      'grades retain crowded-field forward visibility',
    );
    assert.ok(
      f.up.y > 0.8,
      'this combat course does not turn into an inversion course',
    );
  }
  const devices = createCrucibleDevices(track);
  assert.equal(devices.filter((d) => d.type === 'vector').length, 4);
  assert.ok(
    devices.every(
      (d) => Math.abs(d.lateral) + d.width / 2 < track.width / 2 - 2,
    ),
  );
});

test('the ordinary shared driver completes a stock lap without rail contact', () => {
  const track = createCrucibleTrack(),
    state = createVehicleState('shrike');
  let impacts = 0;
  for (let i = 0; i < 120 * 70 && state.distance < track.length; i++) {
    const input = getRacerControl(state, track, { difficulty: 'medium' });
    const events = stepVehicle(state, input, track, 1 / 120);
    impacts += events.filter((e) => e.type === 'impact').length;
  }
  assert.ok(
    state.distance >= track.length,
    'the route remains drivable using ordinary controls',
  );
  assert.equal(impacts, 0);
  assert.ok(state.time < 70);
});

test('owned scene factories keep source-kit and road materials separate and dispose idempotently', () => {
  const track = createCrucibleTrack(),
    road = createCrucibleRoad({ track }),
    world = createCrucibleEnvironment({ track, road });
  let draws = 0,
    triangles = 0;
  const geometries = new Set();
  world.group.traverse((object) => {
    if (!object.isMesh) return;
    draws++;
    geometries.add(object.geometry);
    triangles +=
      ((object.geometry.index?.count ??
        object.geometry.attributes.position.count) /
        3) *
      (object.count ?? 1);
  });
  assert.ok(draws < 110);
  assert.ok(triangles < 120000);
  assert.ok(
    draws > 35,
    'district has grounded layered structures, not a bare road',
  );
  let disposed = 0;
  for (const geometry of geometries)
    geometry.addEventListener('dispose', () => disposed++);
  world.dispose();
  road.dispose();
  const once = disposed;
  world.dispose();
  road.dispose();
  assert.ok(once > 10);
  assert.equal(disposed, once);
});

test('reduced-motion cut warnings retain a brighter static signal', () => {
  const road = createCrucibleRoad({ track: createCrucibleTrack() });
  const lamp = road.group.getObjectByName(
    'Crucible cut signal housing',
  ).material;
  road.update({
    eliminator: { nextCut: 22, elapsed: 10 },
    time: 10,
    settings: { reducedMotion: true },
  });
  const idle = lamp.emissiveIntensity;
  road.update({
    eliminator: { nextCut: 22, elapsed: 20 },
    time: 20,
    settings: { reducedMotion: true },
  });
  const warning = lamp.emissiveIntensity;
  road.update({
    eliminator: { nextCut: 22, elapsed: 21 },
    time: 21,
    settings: { reducedMotion: true },
  });
  assert.ok(warning > idle);
  assert.equal(lamp.emissiveIntensity, warning);
  road.dispose();
});
