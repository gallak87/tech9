import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { assertTrackContract } from '../../../../tools/level-checks/track-contract.mjs';
import { createUmbraTrack, buildUmbraRoad } from './index.js';

const track = createUmbraTrack();

test('Umbra closes its physical distance and transported frames through the full inversion', () => {
  const report = assertTrackContract(track, {
    arcTolerance: 0.002,
    maxFrameTurnPerMetre: 0.045,
  });
  assert.ok(Math.abs(track.length - 5400) < 0.001);
  assert.equal(track.width, 28);
  assert.ok(report.maxArcError < 0.002);
  const heights = [];
  for (let s = 0; s < track.length; s += 3)
    heights.push(track.sample(s).position.y);
  assert.ok(Math.max(...heights) - Math.min(...heights) >= 319);
  assert.ok(Math.max(...heights) - Math.min(...heights) < 321);
  assert.ok(track.inversion.holdEnd - track.inversion.holdStart > 430);
  for (let s = track.inversion.holdStart; s < track.inversion.holdEnd; s += 4) {
    const frame = track.sample(s);
    assert.ok(
      frame.up.y < -0.94,
      `The vault holds an actual inversion at ${s}`,
    );
    assert.ok(Math.abs(frame.roll - Math.PI) < 0.001);
  }
  assert.ok(track.sample(track.inversion.end + 30).up.y > 0.9);
});

test('separate stacked crossings and fold keep conservative vehicle/camera envelopes clear', () => {
  const frames = [];
  for (let s = 0; s < track.length; s += 4)
    if (!track.isGap(s)) frames.push({ s, frame: track.sample(s) });
  const regions = new Set();
  let minimum = Infinity;
  for (let i = 0; i < frames.length; i += 1)
    for (let j = i + 1; j < frames.length; j += 1) {
      const a = frames[i];
      const b = frames[j];
      if (Math.min(b.s - a.s, track.length - b.s + a.s) < 170) continue;
      const horizontal = Math.hypot(
        a.frame.position.x - b.frame.position.x,
        a.frame.position.z - b.frame.position.z,
      );
      if (horizontal >= 35) continue;
      const extent = (frame) =>
        Math.abs(frame.right.y) * 16 + Math.abs(frame.up.y) * 12;
      const clearance =
        Math.abs(a.frame.position.y - b.frame.position.y) -
        extent(a.frame) -
        extent(b.frame);
      assert.ok(
        clearance > 15,
        `Road-local body/camera clearance ${clearance} at ${a.s}/${b.s}`,
      );
      minimum = Math.min(minimum, clearance);
      if (horizontal < 10)
        regions.add(`${Math.floor(a.s / 300)}:${Math.floor(b.s / 300)}`);
    }
  assert.ok(minimum < 50 && minimum > 15);
  assert.ok(
    regions.size >= 3,
    'Two separated stacks and final fold must be real crossings',
  );
  for (let s = track.fold.start; s < track.fold.end; s += 4)
    assert.equal(track.isGap(s), false);
  const top = track.sample(track.fold.start).position.y;
  const bottom = track.sample(track.fold.end).position.y;
  assert.ok(
    top - bottom > 225,
    'The folded descent must remain strongly three-dimensional',
  );
  assert.ok(
    track.sample(track.fold.overGrid).position.y >
      track.sample(0).position.y + 55,
  );
});

test('both curved gaps have visible lower decks and exactly one ordered transfer checkpoint', () => {
  assert.equal(track.jumps.length, 2);
  for (const jump of track.jumps) {
    const launch = track.sample(jump.takeoff);
    const landing = track.sample(jump.landingStart);
    assert.ok(launch.position.y - landing.position.y > 34.9);
    assert.ok(launch.tangent.y > 0.068 && launch.tangent.y < 0.071);
    assert.ok(
      launch.tangent.angleTo(landing.tangent) > 0.35,
      'Flight path is deliberately curved',
    );
    assert.ok(jump.landingEnd - jump.landingStart >= 200);
    assert.ok(jump.landingStart - jump.takeoff > 120);
    assert.deepEqual(jump.airAcceleration.length, 3);
    assert.ok(jump.airAcceleration.every(Number.isFinite));
    const credited = track.checkpoints.filter(
      (checkpoint) =>
        checkpoint.distance > jump.takeoff &&
        checkpoint.distance <= jump.recovery,
    );
    assert.equal(credited.length, 1);
    assert.equal(credited[0].distance, jump.landingStart);
    assert.equal(
      track.surfaceCoverage((jump.takeoff + jump.landingStart) / 2),
      0,
    );
    for (const distance of [
      jump.takeoff - 0.1,
      jump.landingStart,
      jump.landingEnd,
      jump.recovery,
    ])
      assert.equal(track.surfaceCoverage(distance), 1);
    const sight = landing.position.clone().sub(launch.position).normalize();
    assert.ok(
      sight.dot(launch.tangent) > 0.86,
      'Lower landing is ahead of the launch view',
    );
  }
});

test('shape and production are finite, share true gap boundaries, and release owned GPU resources once', () => {
  for (const shape of [true, false]) {
    const surfaceTexture = shape ? null : new THREE.Texture();
    const reflection = new THREE.Texture();
    let reflectionReleased = 0;
    reflection.addEventListener('dispose', () => reflectionReleased++);
    const road = buildUmbraRoad(track, { shape, surfaceTexture });
    road.setReflection(reflection);
    const disposed = new Map();
    const watched = new Set();
    const watch = (resource) => {
      if (watched.has(resource)) return;
      watched.add(resource);
      resource.addEventListener('dispose', () =>
        disposed.set(resource, (disposed.get(resource) ?? 0) + 1),
      );
    };
    if (surfaceTexture) watch(surfaceTexture);
    let triangles = 0;
    let meshes = 0;
    road.group.traverse((object) => {
      if (!object.isMesh) return;
      meshes += 1;
      watch(object.geometry);
      watch(object.material);
      if (object.isInstancedMesh) watch(object);
      const position = object.geometry.getAttribute('position');
      assert.ok(Array.from(position.array).every(Number.isFinite), object.name);
      if (object.isInstancedMesh && object.material.anisotropy > 0) {
        const tangent = object.geometry.getAttribute('tangent');
        const normal = object.geometry.getAttribute('normal');
        assert.ok(
          tangent,
          'anisotropic housings carry an explicit unit tangent basis',
        );
        for (let i = 0; i < tangent.count; i++) {
          const t = new THREE.Vector3().fromBufferAttribute(tangent, i);
          const n = new THREE.Vector3().fromBufferAttribute(normal, i);
          assert.ok(
            Math.abs(t.length() - 1) < 1e-5 && Math.abs(t.dot(n)) < 1e-5,
          );
        }
      }
      triangles +=
        ((object.geometry.index?.count ?? position.count) / 3) *
        (object.isInstancedMesh ? object.count : 1);
    });
    assert.ok(meshes <= 20);
    assert.ok(triangles < 250000);
    const surface = road.group.children.find(
      (child) => child.userData.solidRuns,
    );
    assert.deepEqual(surface.userData.solidRuns, track.solidRuns);
    const positions = surface.geometry.attributes.position;
    let offset = 0;
    for (const [start, end] of track.solidRuns) {
      const count = Math.ceil((end - start) / 2);
      for (const [index, s] of [
        [0, start],
        [count, end],
      ]) {
        const frame = track.sample(s);
        const actual = new THREE.Vector3().fromBufferAttribute(
          positions,
          offset + index * 2,
        );
        const expected = frame.position
          .clone()
          .addScaledVector(frame.right, -14)
          .addScaledVector(frame.up, shape ? 0 : -0.12);
        assert.ok(
          actual.distanceTo(expected) < 0.0001,
          'Each rendered deck ends exactly at its declared gap',
        );
      }
      offset += (count + 1) * 2;
    }
    road.dispose();
    road.dispose();
    assert.equal(reflectionReleased, 0, 'Renderer reflection remains borrowed');
    reflection.dispose();
    for (const resource of watched)
      assert.equal(
        disposed.get(resource),
        1,
        'Each owned resource releases exactly once',
      );
  }
});

test('Umbra practicals light the driving side through inversion and restore by distance', () => {
  const road = buildUmbraRoad(track);
  const lights = road.group.children.filter((node) => node.isSpotLight);
  assert.equal(lights.length, 3);
  const distance = (track.inversion.holdStart + track.inversion.holdEnd) / 2;
  const sample = () =>
    lights
      .map((light) => ({
        position: light.position.toArray(),
        target: light.target.position.toArray(),
        intensity: light.intensity,
      }))
      .sort((a, b) => a.position[0] - b.position[0]);
  road.update({ state: { distance } });
  const expected = sample();
  assert.ok(lights.some((light) => light.intensity > 0));
  for (const light of lights) {
    assert.ok(
      light.target.position.y > light.position.y,
      'inverted optic aims upward toward the driving surface',
    );
  }
  road.update({ state: { distance }, dt: 0, time: 1000 });
  assert.deepEqual(
    sample(),
    expected,
    'pause does not change practical light state',
  );
  road.update({ state: { distance: 50 } });
  road.update({ state: { distance } });
  assert.deepEqual(
    sample(),
    expected,
    'scenario restoration is independent of previous selection',
  );
  road.dispose();
  road.dispose();
});
