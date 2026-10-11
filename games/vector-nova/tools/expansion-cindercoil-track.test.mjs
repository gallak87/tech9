import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createCindercoilTrack,
  createCindercoilRoad,
} from '../src/levels/cindercoil/track/index.js';
import { roadIntervals } from '../src/levels/cindercoil/track/production.js';
import { framePoint } from '../src/track/frames.js';

const track = createCindercoilTrack();

test('Cindercoil measured route closes with finite transported frames and a full coil', () => {
  assert.equal(track.geometryVersion, 'cindercoil-route-v1');
  assert.equal(track.width, 30);
  assert.ok(track.length > 4450 && track.length < 4550);
  let minY = Infinity,
    maxY = -Infinity,
    maxCurvature = 0,
    maxFrameStep = 0;
  for (let s = 0; s < track.length; s += 1) {
    const frame = track.sample(s);
    for (const key of ['position', 'right', 'up', 'tangent'])
      assert.ok(frame[key].toArray().every(Number.isFinite));
    assert.ok(Math.abs(frame.right.length() - 1) < 1e-9);
    assert.ok(Math.abs(frame.right.dot(frame.up)) < 1e-9);
    assert.ok(Math.abs(frame.tangent.dot(frame.up)) < 1e-9);
    assert.ok(frame.right.clone().cross(frame.up).dot(frame.tangent) > 0.99999);
    minY = Math.min(minY, frame.position.y);
    maxY = Math.max(maxY, frame.position.y);
    maxCurvature = Math.max(maxCurvature, Math.abs(frame.curvature));
    maxFrameStep = Math.max(
      maxFrameStep,
      frame.up.angleTo(track.sample(s + 1).up),
    );
  }
  assert.ok(Math.abs(maxY - minY - 260) < 0.01);
  assert.ok(maxCurvature < 0.036, `Curvature ${maxCurvature}`);
  assert.ok(maxFrameStep < 0.03, `Frame turn ${maxFrameStep}`);
  assert.ok(
    track.sample(0).position.distanceTo(track.sample(track.length).position) <
      1e-9,
  );
  assert.ok(track.sample(-0.01).up.angleTo(track.sample(0.01).up) < 0.001);
  const { start, end } = track.landmarks.coil;
  assert.ok(
    Math.abs(track.sample(end).roll - track.sample(start).roll - 2 * Math.PI) <
      1e-7,
  );
  assert.ok(track.sample((start + end) / 2).up.y < -0.8);
});

test('Cindercoil vent has an explicit physical gap and exactly one transfer checkpoint', () => {
  const jump = track.jumps[0];
  assert.equal(track.jumps.length, 1);
  assert.ok(
    jump.takeoff < jump.landingStart &&
      jump.landingStart < jump.landingEnd &&
      jump.landingEnd < jump.recovery,
  );
  const a = track.sample(jump.takeoff),
    b = track.sample(jump.landingStart);
  assert.ok(Math.abs(b.position.x - a.position.x - 86) < 0.001);
  assert.ok(Math.abs(a.position.y - b.position.y - 20) < 0.001);
  assert.ok(Math.abs(a.tangent.y - Math.sin(Math.PI / 18)) < 0.002);
  assert.ok(Math.abs(b.tangent.y) < 0.002);
  const credited = track.checkpoints.filter(
    ({ distance }) =>
      distance >= jump.landingStart && distance <= jump.recovery,
  );
  assert.equal(credited.length, 1);
  assert.equal(credited[0].distance, jump.landingStart);
  assert.ok(
    roadIntervals(track).every(
      ({ start, end }) => end <= jump.takeoff || start >= jump.landingStart,
    ),
  );
  for (const scenario of Object.values(track.scenarios))
    assert.ok(
      scenario.distance <= jump.takeoff ||
        scenario.distance >= jump.landingStart,
    );
});

test('Cindercoil coil reserves a clear tower and chase-camera envelope', () => {
  const coil = track.landmarks.coil;
  let minimumRadius = Infinity;
  for (let s = coil.start; s <= coil.end; s += 3) {
    const frame = track.sample(s);
    for (const right of [-24, 24])
      for (const up of [-8, 25])
        for (const forward of [-18, 18]) {
          const p = framePoint(frame, right, up, forward);
          minimumRadius = Math.min(
            minimumRadius,
            Math.hypot(p.x - coil.center[0], p.z - coil.center[2]),
          );
        }
  }
  assert.ok(
    minimumRadius > coil.towerRadius + 8,
    `Tower clearance ${minimumRadius - coil.towerRadius}`,
  );
});

test('Cindercoil road keeps the vent open, supports outside the camera corridor, and disposes once', () => {
  const road = createCindercoilRoad({
    track,
    shape: false,
    settings: { quality: 'high' },
  });
  const jump = track.jumps[0];
  const launch = track.sample(jump.takeoff).position;
  const landing = track.sample(jump.landingStart).position;
  const ownedGeometry = new Set(),
    ownedMaterial = new Set(),
    ownedTexture = new Set();
  let meshes = 0,
    triangles = 0,
    surfaceArea = 0;
  road.group.traverse((object) => {
    if (!object.isMesh) return;
    meshes += 1;
    const geometry = object.geometry;
    ownedGeometry.add(geometry);
    ownedMaterial.add(object.material);
    for (const key of ['map', 'roughnessMap', 'bumpMap']) {
      if (object.material[key]) ownedTexture.add(object.material[key]);
    }
    triangles +=
      ((geometry.index?.count ?? geometry.attributes.position.count) / 3) *
      (object.count ?? 1);
    if (!object.userData.drivingSurface) return;
    assert.equal(
      object.material.map,
      null,
      'CPU construction does not load texture assets',
    );
    const position = geometry.attributes.position;
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    for (let index = 0; index < geometry.index.count; index += 3) {
      a.fromBufferAttribute(position, geometry.index.getX(index));
      b.fromBufferAttribute(position, geometry.index.getX(index + 1));
      c.fromBufferAttribute(position, geometry.index.getX(index + 2));
      surfaceArea += b.sub(a).cross(c.sub(a)).length() / 2;
    }
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index),
        y = position.getY(index),
        z = position.getZ(index);
      assert.ok(
        !(
          x > launch.x + 0.25 &&
          x < landing.x - 0.25 &&
          y > 230 &&
          y < 280 &&
          Math.abs(z - launch.z) < 14.8
        ),
        'Rendered road enters the flight gap',
      );
    }
  });
  assert.ok(meshes < 40);
  // Beveled wall modules add physical edge catches while retaining 25 draws.
  assert.ok(triangles < 250000);
  const referenceArea =
    (track.length - jump.landingStart + jump.takeoff) * track.width;
  assert.ok(
    surfaceArea > referenceArea * 0.98 && surfaceArea < referenceArea * 1.025,
    'Single ceramic tessellation must neither duplicate nor omit the running surface',
  );
  assert.equal(ownedTexture.size, 0);
  assert.ok(road.group.userData.supportCounts.piers >= 30);
  assert.ok(road.group.userData.supportCounts.coilArms >= 3);
  const frames = [];
  for (let s = 0; s < track.length; s += 2.5) frames.push(track.sample(s));
  for (const segment of road.group.userData.supportSegments) {
    const from = new THREE.Vector3(...segment.from),
      to = new THREE.Vector3(...segment.to);
    const count = Math.ceil(from.distanceTo(to) / 2);
    for (let index = 0; index <= count; index += 1) {
      const p = from.clone().lerp(to, index / count);
      for (const frame of frames) {
        const delta = p.clone().sub(frame.position);
        const inside =
          Math.abs(delta.dot(frame.tangent)) < 6 &&
          Math.abs(delta.dot(frame.right)) < 23 &&
          delta.dot(frame.up) > -7.5 &&
          delta.dot(frame.up) < 25;
        assert.ok(
          !inside,
          `${segment.kind} support enters road/camera corridor`,
        );
      }
    }
  }
  const counts = { geometry: 0, material: 0, texture: 0 };
  for (const item of ownedGeometry)
    item.addEventListener('dispose', () => (counts.geometry += 1));
  for (const item of ownedMaterial)
    item.addEventListener('dispose', () => (counts.material += 1));
  for (const item of ownedTexture)
    item.addEventListener('dispose', () => (counts.texture += 1));
  road.dispose();
  road.dispose();
  assert.equal(counts.geometry, ownedGeometry.size);
  assert.equal(counts.material, ownedMaterial.size);
  assert.equal(counts.texture, ownedTexture.size);
  const shape = createCindercoilRoad({
    track,
    shape: true,
    settings: { quality: 'low' },
  });
  assert.deepEqual(
    shape.group.userData.roadIntervals,
    road.group.userData.roadIntervals,
  );
  shape.dispose();
});
