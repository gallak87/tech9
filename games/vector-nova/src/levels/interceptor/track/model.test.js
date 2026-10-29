import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createInterceptorTrack } from './model.js';
import { createCrucibleTrack } from '../../crucible/track/model.js';
import { createCrucibleRoad } from '../../crucible/track/road.js';
import { createMagneticRuntime } from '../../../core/session-runtime.js';
import { createRapierWorld } from '../../../physics/rapier-world.js';
import { createVehicleState } from '../../../physics/index.js';
import { getRacerControl } from '../../../race/racers.js';

test('Dispatch owns its large supported plunge and bank reversal without changing Foundry', () => {
  const track = createInterceptorTrack(),
    original = createCrucibleTrack();
  assert.equal(original.id, 'crucible-foundry-v1');
  assert.ok(Math.abs(original.length - 4300) < 0.01);
  assert.notEqual(track.geometryVersion, original.geometryVersion);
  assert.ok(track.length > original.length && track.length < 4400);
  assert.equal(track.width, 44);
  assert.equal(track.closed, true);
  assert.deepEqual(track.jumps, []);
  const plunge = track.routeMoments.find((moment) => moment.type === 'drop'),
    reversal = track.routeMoments.find(
      (moment) => moment.type === 'bank-reversal',
    );
  assert.ok(
    track.sample(plunge.start).position.y -
      track.sample(plunge.end).position.y >
      270,
  );
  let left = 0,
    right = 0;
  for (let s = reversal.start; s < reversal.end; s += 8) {
    const f = track.sample(s);
    left = Math.min(left, f.right.y);
    right = Math.max(right, f.right.y);
  }
  assert.ok(left < -0.8 && right > 0.8);
  for (let s = 0; s < track.length; s += 2) {
    const a = track.sample(s),
      b = track.sample(s + 0.5);
    assert.ok(Math.abs(a.tangent.y) < 0.46);
    assert.ok(a.quaternion.angleTo(b.quaternion) < 0.006);
    assert.ok(Math.abs(a.right.dot(a.up)) < 1e-8);
    for (const side of [-22, 22]) {
      const p = a.position.clone().addScaledVector(a.right, side),
        q = b.position.clone().addScaledVector(b.right, side);
      assert.ok(Math.abs(q.y - p.y) / 0.5 < 0.47, `smooth edge at ${s}`);
    }
  }
  assert.ok(
    track.sample(-0.01).position.distanceTo(track.sample(0.01).position) <
      0.021,
  );
  assert.ok(
    track.sample(-0.01).quaternion.angleTo(track.sample(0.01).quaternion) <
      0.00006,
  );
  const road = createCrucibleRoad({ track });
  try {
    const deck = road.group.children.find((mesh) => mesh.userData.roadSurface),
      coord = deck.geometry.attributes.roadCoord,
      positions = deck.geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 34) {
      const frame = track.sample(coord.getX(i)),
        expected = frame.position
          .clone()
          .addScaledVector(frame.right, coord.getY(i));
      assert.ok(
        expected.distanceTo(new T.Vector3().fromBufferAttribute(positions, i)) <
          0.002,
      );
    }
  } finally {
    road.dispose();
  }
});

test('stock and equipment magnetic bodies stay on Dispatch through the plunge and reversed banks', async () => {
  const track = createInterceptorTrack(),
    dynamics = await createRapierWorld({});
  try {
    for (const equipment of [false, true]) {
      const state = createVehicleState('shrike');
      state.distance = track.routeMoments[0].start - 100;
      state.speed = 300 / 3.6;
      const end = track.routeMoments.at(-1).end + 60;
      const runtime = createMagneticRuntime({
        track,
        dynamics,
        equipment,
        settings: { steeringAssist: 0.3 },
      });
      runtime.reset({ state });
      let impacts = 0;
      try {
        for (let tick = 0; tick < 120 * 40 && state.distance < end; tick++) {
          const control = getRacerControl(state, track, {
            difficulty: 'medium',
          });
          control.boost = false;
          const events = runtime.advance(state, control, 1 / 120),
            frame = track.sample(state.distance),
            height = runtime
              .pose(1)
              .position.clone()
              .sub(frame.position)
              .dot(frame.up);
          impacts += events.filter((event) => event.type === 'impact').length;
          assert.ok(state.speed > 80);
          assert.ok(Math.abs(state.lateral) < 0.5);
          assert.ok(height > 0.7 && height < 1);
        }
        assert.ok(state.distance > end);
        assert.equal(impacts, 0);
      } finally {
        runtime.dispose();
      }
    }
  } finally {
    dynamics.dispose();
  }
});
