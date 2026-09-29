import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLevel2Track, buildLevel2Blockout } from './index.js';

const track = createLevel2Track();

test('orbital blockout is a closed metre-parameterized route with continuous complete frames', () => {
  let actualLength = 0;
  for (let distance = 0; distance < track.length - 0.001; distance += 1) {
    const frame = track.sample(distance);
    const next = track.sample(distance + 1);
    const chord = frame.position.distanceTo(next.position);
    actualLength += chord;
    assert.ok(Math.abs(chord - 1) < 0.0003, `Arc parameter at ${distance}`);
    assert.ok(
      frame.tangent.angleTo(next.tangent) < 0.016,
      `Curve radius at ${distance}`,
    );
    assert.ok(
      frame.quaternion.angleTo(next.quaternion) < 0.022,
      `Frame step at ${distance}`,
    );
    assert.ok(
      [...frame.position.toArray(), ...frame.quaternion.toArray()].every(
        Number.isFinite,
      ),
    );
    for (const axis of [frame.right, frame.up, frame.tangent])
      assert.ok(Math.abs(axis.length() - 1) < 1e-9);
    assert.ok(Math.abs(frame.right.dot(frame.up)) < 1e-9);
    assert.ok(Math.abs(frame.right.dot(frame.tangent)) < 1e-9);
    assert.ok(Math.abs(frame.up.dot(frame.tangent)) < 1e-9);
  }
  assert.ok(Math.abs(track.length - 4500) < 0.001);
  assert.ok(Math.abs(actualLength - 4500) < 0.035);
  const before = track.sample(-0.001);
  const after = track.sample(0.001);
  assert.ok(before.position.distanceTo(after.position) < 0.00201);
  assert.ok(before.quaternion.angleTo(after.quaternion) < 0.0001);
  assert.ok(
    track
      .sample(50)
      .position.distanceTo(track.sample(track.length + 50).position) < 1e-8,
  );
});

test('nonadjacent sections and overpasses leave a vehicle-and-camera envelope clear', () => {
  const count = 1100;
  const frames = Array.from({ length: count }, (_, index) =>
    track.sample((index * track.length) / count),
  );
  let crossings = 0;
  let minimumSeparation = Infinity;
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      if ((Math.min(j - i, count - j + i) * track.length) / count < 160)
        continue;
      const a = frames[i];
      const b = frames[j];
      const separation = a.position.distanceTo(b.position);
      minimumSeparation = Math.min(minimumSeparation, separation);
      if (
        Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) >=
        45
      )
        continue;
      crossings += 1;
      // Road half-width, local 12 m overhead camera/vehicle envelope, and slab.
      const verticalExtent = (frame) =>
        (Math.abs(frame.right.y) * track.width) / 2 + Math.abs(frame.up.y) * 15;
      const clearance =
        Math.abs(a.position.y - b.position.y) -
        verticalExtent(a) -
        verticalExtent(b);
      assert.ok(
        clearance > 25,
        `Overpass envelope clearance ${clearance} at ${i}/${j}`,
      );
    }
  }
  assert.ok(
    crossings > 0,
    'The rising transfer must actually pass over the return',
  );
  assert.ok(
    minimumSeparation > 80,
    `Nonadjacent centreline separation ${minimumSeparation}`,
  );
});

test('terrain starts early and each region has a distinct reviewable road event', () => {
  assert.ok(track.sample(150).position.y > 20);
  assert.ok(track.sample(150).bank > 0.25);
  for (let distance = 825; distance <= 955; distance += 5) {
    const frame = track.sample(distance);
    assert.ok(Math.abs(frame.bank - THREE.MathUtils.degToRad(98)) < 1e-8);
    assert.ok(
      Math.abs(frame.right.y) > 0.96,
      'Wall ride must be visibly near vertical',
    );
    assert.ok(frame.up.y < -0.1, 'The wall ride briefly passes vertical');
  }
  assert.ok(track.sample(2000).tangent.y > 0.25);
  assert.ok(
    track.sample(2640).bank < -0.65,
    'Apogee reverses the earlier bank',
  );
  assert.ok(track.sample(3060).bank < -0.48);
  assert.ok(
    track.sample(3463).tangent.y < -0.96,
    'The dive remains over 73 degrees',
  );
  assert.ok(
    Math.abs(track.sample(3730).tangent.y) < 0.14,
    'Dive has a readable low catch',
  );
  assert.ok(
    track.sample(4290).bank < -0.5,
    'The return has a final corner, not a long straight',
  );
  for (let start = 0; start < track.length - 300; start += 100) {
    let active = false;
    for (let distance = start; distance < start + 300; distance += 10) {
      const frame = track.sample(distance);
      active ||=
        Math.abs(frame.bank) > 0.25 || Math.abs(frame.tangent.y) > 0.15;
    }
    assert.ok(active, `Flat unbanked filler at ${start}`);
  }
});

test('review sections cover the circuit and every human jump starts parked', () => {
  assert.equal(track.sections[0].start, 0);
  assert.equal(track.sections.at(-1).end, track.length);
  assert.equal(track.review.kind, 'bare-track');
  assert.equal(track.checkpoints.length, 8);
  for (let i = 0; i < track.sections.length; i += 1) {
    const section = track.sections[i];
    if (i) assert.equal(track.sections[i - 1].end, section.start);
    assert.ok(
      section.showcase > section.start && section.showcase < section.end,
    );
    const scenario = track.scenarios[`${section.id}-showcase`];
    assert.equal(scenario.distance, section.showcase);
    assert.equal(scenario.speed, 0);
    assert.equal(scenario.heading, 0);
    assert.ok(
      track.bounds.containsPoint(track.sample(section.showcase).position),
    );
  }
});

test('bare mesh shares road frames, has finite surface geometry and stays above the planet', () => {
  const group = buildLevel2Blockout(track);
  const surface = group.children.find((child) => child.userData.drivingSurface);
  const position = surface.geometry.getAttribute('position');
  const count = position.count / 2 - 1;
  for (let index = 0; index <= count; index += 1) {
    const frame = track.sample((index * track.length) / count);
    for (const side of [0, 1]) {
      const point = new THREE.Vector3().fromBufferAttribute(
        position,
        index * 2 + side,
      );
      const expected = frame.position
        .clone()
        .addScaledVector(
          frame.right,
          side ? track.width / 2 : -track.width / 2,
        );
      assert.ok(point.distanceTo(expected) < 0.00005);
    }
  }
  const planetCenter = new THREE.Vector3().fromArray(
    track.review.planet.center,
  );
  for (let distance = 0; distance < track.length; distance += 5) {
    assert.ok(
      track.sample(distance).position.distanceTo(planetCenter) -
        track.review.planet.radius >
        135,
    );
  }
  let triangleCount = 0;
  group.traverse((object) => {
    if (!object.geometry) return;
    assert.ok(
      Array.from(object.geometry.getAttribute('position').array).every(
        Number.isFinite,
      ),
    );
    triangleCount +=
      (object.geometry.index?.count ??
        object.geometry.getAttribute('position').count) / 3;
  });
  assert.ok(
    triangleCount < 60000,
    'Bare review geometry stays intentionally lightweight',
  );
  assert.ok(group.children.length < 12);
  group.userData.dispose();
});
