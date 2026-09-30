import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createHelionTrack,
  buildHelionRoad,
} from '../src/levels/helion/track/index.js';
import { framePoint } from '../src/track/frames.js';

const track = createHelionTrack();

test('Helion is a continuous metre-parameterized 30 m route with 206 m relief', () => {
  assert.ok(track.length > 4900 && track.length < 5050);
  assert.equal(track.width, 30);
  let minY = Infinity;
  let maxY = -Infinity;
  let measured = 0;
  for (let s = 0; s < track.length; s += 1) {
    const span = Math.min(1, track.length - s);
    const a = track.sample(s);
    const b = track.sample(s + span);
    const chord = a.position.distanceTo(b.position);
    measured += chord;
    assert.ok(Math.abs(chord - span) < 0.0005, `Arc length at ${s}`);
    assert.ok(a.quaternion.angleTo(b.quaternion) < 0.026, `Frame step at ${s}`);
    assert.ok(Math.abs(a.curvature) < 0.025, `Curvature at ${s}`);
    for (const axis of [a.tangent, a.right, a.up])
      assert.ok(Math.abs(axis.length() - 1) < 1e-8);
    assert.ok(Math.abs(a.tangent.dot(a.right)) < 1e-8);
    assert.ok(Math.abs(a.up.dot(a.right)) < 1e-8);
    minY = Math.min(minY, a.position.y);
    maxY = Math.max(maxY, a.position.y);
  }
  assert.ok(Math.abs(measured - track.length) < 0.02);
  assert.ok(maxY - minY > 200 && maxY - minY < 215);
  assert.ok(
    track.sample(0).position.distanceTo(track.sample(track.length).position) <
      1e-8,
  );
  assert.ok(
    track.sample(0).quaternion.angleTo(track.sample(track.length).quaternion) <
      1e-8,
  );
});

test('shield wall holds 103 degrees continuously and releases before its braking shelf', () => {
  const wall = track.wallRide;
  assert.ok(wall.holdEnd - wall.holdStart > 260);
  for (let s = wall.holdStart; s <= wall.holdEnd; s += 2) {
    const sample = track.sample(s);
    assert.ok(Math.abs(THREE.MathUtils.radToDeg(sample.bank) + 103) < 0.001);
    assert.ok(sample.up.y < -0.2, `Beyond vertical at ${s}`);
    assert.ok(sample.right.y < -0.94);
  }
  assert.ok(Math.abs(track.sample(wall.end).bank) < 0.001);
  assert.ok(
    track.brakingShelves.some((s) => s > wall.end && s - wall.end < 65),
  );
  assert.ok(
    track.sample(track.scenarios['slope-rest'].distance).tangent.y > 0.18,
  );
  assert.equal(track.scenarios['bank-rest'].speed, 0);
});

test('route bays and return keep nonadjacent driving corridors apart', () => {
  const samples = [];
  for (let s = 0; s < track.length; s += 10)
    samples.push({ s, point: track.sample(s).position });
  for (let i = 0; i < samples.length; i += 1) {
    for (let j = i + 1; j < samples.length; j += 1) {
      const along = Math.min(
        samples[j].s - samples[i].s,
        track.length - samples[j].s + samples[i].s,
      );
      if (along < 140) continue;
      assert.ok(
        samples[i].point.distanceTo(samples[j].point) > 100,
        `Deck/camera envelope at ${samples[i].s}/${samples[j].s}`,
      );
    }
  }
});

test('sections, checkpoint transfer windows and thermal preparation are authored in physical metres', () => {
  assert.equal(track.sections[0].start, 0);
  assert.equal(track.sections.at(-1).end, track.length);
  for (const [i, section] of track.sections.entries()) {
    if (i) assert.equal(track.sections[i - 1].end, section.start);
    assert.ok(
      section.showcase > section.start && section.showcase < section.end,
    );
    assert.ok(track.scenarios[`${section.id}-showcase`]);
  }
  for (const jump of track.jumps) {
    assert.equal(jump.optional, true);
    assert.equal(jump.halfWidth, 15);
    assert.ok(jump.landingEnd - jump.landingStart >= 245);
    const checkpoints = track.checkpoints.filter(
      ({ distance }) =>
        distance >= jump.landingStart && distance <= jump.recovery,
    );
    assert.equal(checkpoints.length, 1);
    assert.equal(checkpoints[0].distance, jump.landingStart);
    assert.ok(Math.abs(track.sample(jump.takeoff).bank) < 0.001);
    assert.ok(track.sample(jump.takeoff).tangent.y > 0.13);
    assert.ok(Math.abs(track.sample(jump.landingStart + 30).tangent.y) < 0.001);
  }
  const zones = track.thermalZones;
  for (const [i, zone] of zones.entries()) {
    assert.ok(zone.start < zone.end);
    if (i) assert.ok(zones[i - 1].end < zone.start);
    if (zone.kind !== 'furnace') continue;
    assert.ok(zone.end - zone.start > 60 && zone.end - zone.start < 65);
    assert.equal(zones[i - 1].kind, 'cooling');
    assert.equal(zones[i + 1].kind, 'cooling');
    assert.ok(zones[i - 1].end - zones[i - 1].start > 75);
    assert.ok(zones[i + 1].end - zones[i + 1].start > 75);
  }
});

test('production and neutral geometry preserve actual left-side gaps and solid right detours', () => {
  for (const shape of [true, false]) {
    const road = buildHelionRoad(track, {
      shape,
      settings: { quality: 'high' },
    });
    const surface = road.group.children.find(
      (mesh) => mesh.userData.drivingSurface,
    );
    surface.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    for (const jump of track.jumps) {
      for (const s of [
        jump.takeoff + 8,
        (jump.takeoff + jump.landingStart) / 2,
        jump.landingStart - 8,
      ]) {
        const frame = track.sample(s);
        for (const lateral of [-8, 8]) {
          ray.set(framePoint(frame, lateral, 20), frame.up.clone().negate());
          ray.far = 35;
          assert.equal(
            ray.intersectObject(surface).length > 0,
            lateral < 0,
            `${shape}/${s}/${lateral}`,
          );
          assert.equal(track.surfaceCoverage(s, lateral), lateral < 0 ? 1 : 0);
        }
      }
      const frame = track.sample(jump.landingStart + 15);
      ray.set(framePoint(frame, 8, 20), frame.up.clone().negate());
      assert.ok(
        ray.intersectObject(surface).length > 0,
        'Receiving deck is real',
      );
    }
    assert.ok(road.group.children.length <= 30);
    road.dispose();
    road.dispose();
    assert.equal(road.group.children.length, 0);
  }
});

test('observatory support beams remain beneath the full running surface', () => {
  const road = buildHelionRoad(track, {
    shape: false,
    settings: { quality: 'low' },
  });
  road.group.updateMatrixWorld(true);
  const surface = road.group.children.find(
    (mesh) => mesh.userData.drivingSurface,
  );
  surface.material.side = THREE.DoubleSide;
  const ray = new THREE.Raycaster();
  const matrix = new THREE.Matrix4();
  for (const mesh of road.group.children.filter(
    (entry) =>
      entry.isInstancedMesh &&
      /support pier|cantilever truss roots|anchor load braces/.test(entry.name),
  )) {
    for (let i = 0; i < mesh.count; i += 1) {
      mesh.getMatrixAt(i, matrix);
      for (const [x, z] of [
        [0, 0],
        [-0.45, -0.45],
        [-0.45, 0.45],
        [0.45, -0.45],
        [0.45, 0.45],
      ]) {
        const start = new THREE.Vector3(x, -0.5, z).applyMatrix4(matrix);
        const end = new THREE.Vector3(x, 0.5, z).applyMatrix4(matrix);
        ray.set(start, end.clone().sub(start).normalize());
        ray.far = start.distanceTo(end);
        assert.equal(
          ray.intersectObject(surface).length,
          0,
          `${mesh.name} ${i} pierces road`,
        );
      }
    }
  }
  road.dispose();
});
