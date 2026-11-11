import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createVesperTrack } from './model.js';
import { createVesperRoad } from './road.js';
import { createVesperCollisionWorld } from '../collision.js';
import { createRapierWorld } from '../../../physics/rapier-world.js';
import { withMagneticBoundaries } from '../../../physics/magnetic-boundaries.js';

test('Vesper keeps the entire 28 m ribbon through every runup, launch and receiver', async () => {
  const track = createVesperTrack();
  const road = createVesperRoad({ track });
  const collisionWorld = createVesperCollisionWorld({ track });
  const native = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  });
  try {
    assert.equal(track.width, 28);
    const half = track.width / 2;
    const surfaces = road.group.children.filter(
      (mesh) => mesh.userData.drivingSurface,
    );
    let rows = 0;
    for (const mesh of surfaces) {
      const { start, end, rows: count, columns } = mesh.geometry.userData.sweep;
      const position = mesh.geometry.attributes.position;
      assert.equal(mesh.userData.rightEdge, half);
      for (let row = 0; row < count; row++) {
        const distance = start + ((end - start) * row) / (count - 1);
        const frame = track.sample(distance);
        const left = new Vector3().fromBufferAttribute(
          position,
          row * columns[0],
        );
        const right = new Vector3().fromBufferAttribute(
          position,
          (row + 1) * columns[0] - 1,
        );
        assert.ok(
          Math.abs(left.distanceTo(right) - track.width) < 0.001,
          `rendered width at ${distance} m`,
        );
        assert.ok(
          Math.abs(left.sub(frame.position).dot(frame.right) + half) < 0.001,
          `left edge at ${distance} m`,
        );
        assert.ok(
          Math.abs(right.sub(frame.position).dot(frame.right) - half) < 0.001,
          `right edge at ${distance} m`,
        );
        rows++;
      }
    }
    assert.ok(rows > 5000, 'check every generated running cross section');
    const stations = [];
    for (let distance = 0.1; distance < track.length; distance += 27.3)
      if (!track.isGap(distance)) stations.push(distance);
    for (const jump of track.jumps)
      stations.push(
        jump.takeoff - 150,
        jump.takeoff - 75,
        jump.takeoff - 0.1,
        jump.landingStart + 0.1,
        jump.landingStart + 75,
        jump.landingEnd,
      );
    for (const distance of stations) {
      const frame = track.sample(distance);
      for (const lateral of [-half + 0.01, 0, half - 0.01])
        assert.ok(
          native.sampleRoadSurface(distance, lateral, frame),
          `native deck must reach ${lateral} m at ${distance} m`,
        );
      for (const lateral of [-half - 0.1, half + 0.1])
        assert.equal(
          native.sampleRoadSurface(distance, lateral, frame),
          null,
          `native deck ends at the visible edge at ${distance} m`,
        );
    }
    const guidance = road.group.getObjectByName(
      'Advance jump lane and landing guidance',
    );
    const uv = guidance.geometry.attributes.uv;
    for (const jump of track.jumps) {
      let left = Infinity,
        right = -Infinity;
      for (let vertex = 0; vertex < uv.count; vertex++) {
        const distance = uv.getY(vertex) * 16;
        if (distance < jump.takeoff - 150 || distance > jump.takeoff - 125)
          continue;
        const lateral = uv.getX(vertex) * track.width - half;
        left = Math.min(left, lateral);
        right = Math.max(right, lateral);
      }
      assert.ok(
        right - left > track.width * 0.85,
        `${jump.id} launch markings communicate the full apron width`,
      );
    }
  } finally {
    native.dispose();
    collisionWorld.dispose();
    road.dispose();
  }
});
