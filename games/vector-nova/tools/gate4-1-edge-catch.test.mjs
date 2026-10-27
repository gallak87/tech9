import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createLevel3Track } from '../src/levels/nacre/track/model.js';
import {
  createNacreRuntime,
  NACRE_FLIGHT_RULES as R,
  sweptNacreLanding,
  sweptNacreRail,
} from '../src/levels/nacre/track/runtime.js';
import { createVehicleState } from '../src/physics/index.js';
import { createRace } from '../src/race/index.js';
import { advanceSession } from '../src/core/session-runtime.js';
import { landingZoneEnd } from '../src/physics/landing-zone.js';

const track = createLevel3Track();
const control = {
  throttle: 1,
  brake: 0,
  // Coast through contact so reserve drain/air thrust cannot mask its penalty.
  boost: false,
  airbrake: false,
  steer: 0,
};
const step = 1 / 120;
const extent = (q, direction) =>
  [
    [1, 0, 0, R.halfWidth],
    [0, 1, 0, R.hover],
    [0, 0, 1, R.halfLength],
  ].reduce(
    (sum, [x, y, z, r]) =>
      sum +
      Math.abs(new T.Vector3(x, y, z).applyQuaternion(q).dot(direction)) * r,
    0,
  );
const poseAt = (frame, lateral, height, quaternion = frame.quaternion) => ({
  position: frame.position
    .clone()
    .addScaledVector(frame.right, lateral)
    .addScaledVector(frame.up, height),
  quaternion: quaternion.clone(),
});

test('both sides of both receiving decks accept exactly half-width support and reject a smaller overlap', () => {
  for (const jump of track.jumps) {
    const frame = track.sample(jump.landingStart + 60);
    for (const side of [-1, 1])
      for (const yaw of [-0.12, 0, 0.12]) {
        const q = frame.quaternion
          .clone()
          .multiply(
            new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw),
          );
        for (const excess of [0, 0.002]) {
          const before = poseAt(frame, side * (jump.halfWidth + excess), 12, q),
            after = poseAt(frame, side * (jump.halfWidth + excess), -12, q);
          const hit = sweptNacreLanding(
            track,
            jump,
            before,
            after,
            frame.up.clone().multiplyScalar(-100),
          );
          assert.equal(!!hit, excess === 0);
          if (hit) {
            assert.equal(hit.edgeCatch, true);
            assert.ok(Math.abs(hit.overlap - 0.5) < 1e-8);
            assert.equal(hit.side, side);
          }
        }
      }
  }
});

test('swept finite rail volumes catch top and sideways wing hits before penetration, including across segment seams', () => {
  for (const jump of track.jumps)
    for (const side of [-1, 1])
      for (const offset of [40, 42, 44]) {
        const frame = track.sample(jump.landingStart + offset);
        const before = poseAt(
          frame,
          side * jump.halfWidth,
          R.railHeight[jump.id] + 4,
        );
        const after = poseAt(frame, side * jump.halfWidth, 1);
        const top = sweptNacreRail(track, jump, before, after);
        assert.ok(top);
        assert.ok(Math.abs(top.overlap - 0.5) < 1e-8);
        assert.ok(
          Math.abs(
            top.position.clone().sub(frame.position).dot(frame.up) -
              R.hover -
              R.railHeight[jump.id],
          ) < 1e-6,
        );
        const lateral = sweptNacreRail(
          track,
          jump,
          poseAt(frame, side * 12, 2),
          poseAt(frame, side * 16, 2),
        );
        assert.ok(lateral);
        assert.ok(lateral.fraction > 0 && lateral.fraction < 1);
        assert.ok(
          Math.abs(Math.abs(lateral.lateral) + R.halfWidth - jump.halfWidth) <
            1e-6,
        );
      }
});

test('rail forgiveness respects boosted receiving runout and rejects unsupported or invalid contacts', () => {
  for (const jump of track.jumps) {
    const frame = track.sample(jump.landingStart + 50);
    const from = poseAt(frame, jump.halfWidth, R.railHeight[jump.id] + 5),
      to = poseAt(frame, jump.halfWidth, 1);
    const rejected = [
      [
        poseAt(frame, jump.halfWidth + 0.01, 12),
        poseAt(frame, jump.halfWidth + 0.01, 1),
      ],
      [poseAt(frame, 12, 20), poseAt(frame, 16, 20)],
      [poseAt(frame, 13, -2), poseAt(frame, 14, 2)],
      [
        poseAt(track.sample(jump.landingStart - 10), 15, 12),
        poseAt(track.sample(jump.landingStart - 10), 15, 1),
      ],
      [
        poseAt(track.sample(landingZoneEnd(track, jump) + 10), 15, 12),
        poseAt(track.sample(landingZoneEnd(track, jump) + 10), 15, 1),
      ],
    ];
    for (const axis of [new T.Vector3(0, 1, 0), new T.Vector3(0, 0, 1)]) {
      const q = frame.quaternion
        .clone()
        .multiply(new T.Quaternion().setFromAxisAngle(axis, Math.PI));
      rejected.push([poseAt(frame, 15, 12, q), poseAt(frame, 15, 1, q)]);
    }
    for (const [before, after] of rejected)
      assert.equal(sweptNacreRail(track, jump, before, after), null);
    const runout = track.sample(jump.landingEnd + 10);
    assert.ok(
      sweptNacreRail(
        track,
        jump,
        poseAt(runout, jump.halfWidth, R.railHeight[jump.id] + 5),
        poseAt(runout, jump.halfWidth, 1),
      ),
      'boosted overshoots retain supported receiving-rail contact',
    );
    assert.equal(sweptNacreRail(track, { ...jump }, from, to), null);
    assert.equal(
      sweptNacreRail(
        track,
        track.jumps.find((j) => j !== jump),
        from,
        to,
      ),
      null,
    );
  }
});

function edgeRun(index, side, dt = step, lap = 0) {
  const runtime = createNacreRuntime({ track });
  const state = {
    ...createVehicleState(),
    ...runtime.scenarios[`jump${index}-edge-${side}`].state,
  };
  state.distance += track.length * lap;
  const race = createRace(track, { rulesId: runtime.rulesId });
  race.placeScenario(state.distance);
  const events = [];
  let contact;
  for (let tick = 0; tick < 1400; tick++) {
    const before = { ...state };
    const beforeFlight = runtime.snapshot().flight;
    const next = advanceSession({
      state,
      input: control,
      dt,
      runtime,
      race,
      emit: (e) => events.push(e),
    });
    if (next.some((e) => e.payload?.source === 'nacre-edge-catch'))
      contact = {
        before,
        beforeFlight,
        after: { ...state },
        snapshot: runtime.snapshot(),
      };
    if (next.some((e) => e.type === 'jump-transfer')) break;
  }
  return { runtime, state, race, events, contact };
}

test('both edge catches bounce inward once with a 5% forward-speed and 2-point reserve penalty, preserving flight then landing', () => {
  for (const index of [1, 2])
    for (const side of ['left', 'right']) {
      const result = edgeRun(index, side),
        sign = side === 'left' ? 1 : -1;
      const impacts = result.events.filter((e) => e.type === 'impact');
      assert.equal(impacts.length, 1);
      assert.equal(impacts[0].payload.source, 'nacre-edge-catch');
      assert.equal(impacts[0].payload.energyCost, 2);
      assert.equal(impacts[0].payload.speedRetention, 0.95);
      assert.equal(
        result.contact.snapshot.mode,
        'flight',
        'rail catch does not pull down to the road',
      );
      assert.equal(result.contact.after.energy, 98);
      const velocity = new T.Vector3().fromArray(
        result.contact.snapshot.flight.velocity,
      );
      const frame = track.sample(impacts[0].payload.distance);
      const incoming = new T.Vector3().fromArray(
        result.contact.beforeFlight.velocity,
      );
      assert.ok(
        Math.abs(
          velocity.dot(frame.tangent) / incoming.dot(frame.tangent) - 0.95,
        ) < 1e-9,
        'penalty applies to forward momentum, while gravity and the inward bounce retain their own components',
      );
      assert.equal(result.contact.after.speed, velocity.length());
      assert.ok(sign * velocity.dot(frame.right) < -1.9);
      const pose = result.runtime.pose(1),
        landing = track.sample(result.state.distance);
      assert.ok(
        Math.abs(result.state.lateral) +
          extent(pose.quaternion, landing.right) <
          track.width / 2,
      );
      assert.equal(
        result.events.find((e) => e.type === 'jump-transfer').payload.outcome,
        'landed',
      );
      assert.equal(
        result.events.find((e) => e.type === 'jump-transfer').payload
          .edgeCaught,
        true,
      );
      assert.equal(
        result.events.some((e) => e.type === 'jump-miss'),
        false,
      );
      assert.equal(result.state.resetCount, 0);
      for (let i = 0; i < 100; i++)
        result.events.push(
          ...result.runtime.advance(
            result.state,
            { ...control, boost: false },
            step,
          ),
        );
      assert.equal(
        result.events.filter((e) => e.type === 'impact').length,
        1,
        'no second standard rail penalty while settling',
      );
      result.runtime.dispose();
    }
});

test('edge contacts are bounded at coarse ticks/later laps and replay/reset preserves one-shot penalty state', () => {
  for (const index of [1, 2])
    for (const dt of [1 / 60, 0.1]) {
      const result = edgeRun(index, 'left', dt, 2);
      assert.equal(
        result.events.find((e) => e.type === 'jump-transfer').payload.outcome,
        'landed',
      );
      assert.equal(
        result.events.filter((e) => e.payload?.source === 'nacre-edge-catch')
          .length,
        1,
      );
      assert.ok(
        result.state.distance >
          2 * track.length + track.jumps[index - 1].landingStart,
      );
      const a = createNacreRuntime({ track }),
        b = createNacreRuntime({ track });
      const snapshot = JSON.parse(JSON.stringify(result.contact.snapshot));
      a.restore(snapshot);
      b.restore(snapshot);
      const sa = { ...result.contact.after },
        sb = { ...sa };
      a.advance(sa, control, 0);
      assert.deepEqual(a.snapshot(), snapshot);
      for (let i = 0; i < 100; i++)
        assert.deepEqual(
          a.advance(sa, control, step),
          b.advance(sb, control, step),
        );
      assert.deepEqual(sa, sb);
      assert.deepEqual(a.snapshot(), b.snapshot());
      a.reset({ state: sa, seed: 7 });
      assert.equal(a.snapshot().flight, null);
      assert.equal(a.pose(), null);
      for (const runtime of [result.runtime, a, b]) runtime.dispose();
    }
});
