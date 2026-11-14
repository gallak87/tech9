import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createRavelFreestyleTrack } from './model.js';
import { createSkywellTrack } from '../../zephyr-skywell/track/model.js';
import { createSkywellRoad } from '../../zephyr-skywell/track/road.js';
import {
  createSailbreakPlan,
  createSailGeometry,
  clearanceAt,
} from '../scenery.js';

test('Sailbreak preserves the generous source envelopes with two full-width pipe arrivals', () => {
  const track = createRavelFreestyleTrack(),
    source = createSkywellTrack();
  assert.equal(track.jumps.length, 5);
  assert.equal(track.tubes.length, 2);
  assert.ok(track.width >= 54);
  assert.notEqual(track.id, source.id);
  for (const [i, jump] of track.jumps.entries()) {
    assert.equal(jump.takeoff, source.jumps[i].takeoff);
    assert.equal(jump.landingStart, source.jumps[i].landingStart);
    assert.equal(jump.landingEnd, source.jumps[i].landingEnd);
    assert.ok(jump.catchWidth >= track.width * 0.9);
    assert.ok(jump.landingStart - jump.takeoff > 620);
    for (let s = jump.takeoff; s < jump.landingEnd; s += 60) {
      const sample = track.sample(s);
      assert.ok(
        Math.abs(sample.position.y - source.sample(s).position.y - 500) < 0.002,
      );
      assert.ok(Math.abs(sample.tangent.length() - 1) < 1e-6);
    }
    if (jump.releaseLength)
      assert.ok(
        track
          .sample(jump.takeoff - 2)
          .tangent.dot(track.sample(jump.takeoff - 160).tangent) > 0.9999,
      );
  }
  for (const tube of track.tubes) {
    const s = (tube.entryEnd + tube.exitStart) / 2;
    assert.ok(track.sampleSurface(s, 0));
    assert.ok(track.sampleSurface(s, Math.PI * tube.radius));
  }
  const road = createSkywellRoad({ track, shape: true });
  try {
    assert.ok(road.group.children.some((mesh) => mesh.userData.drivingSurface));
  } finally {
    road.dispose();
  }
});

test('folded collector sheets clear the whole winding course and its generous air columns', () => {
  const track = createRavelFreestyleTrack(),
    plan = createSailbreakPlan(track);
  assert.equal(plan.stations.length, 5);
  // The current five-transfer course has one collector at each receiver.
  assert.equal(plan.sails.length, 5);
  let nearest = Infinity,
    count = 0;
  for (const sail of plan.sails) {
    const geometry = createSailGeometry(sail);
    try {
      const positions = geometry.attributes.position,
        point = new T.Vector3();
      assert.equal(geometry.attributes.roadCoord.count, positions.count);
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i);
        assert.ok(point.toArray().every(Number.isFinite));
        nearest = Math.min(nearest, clearanceAt(point, plan.route));
      }
      count += geometry.index.count / 3;
    } finally {
      geometry.dispose();
    }
  }
  // Construction uses 205m sampled clearance, leaving a real margin for the
  // finer rendered fold cage, receiver tube walls, craft and chase camera.
  assert.ok(nearest > 160, `collector clearance ${nearest.toFixed(1)}m`);
  assert.ok(count > 15000 && count < 20000);
});
