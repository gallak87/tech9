import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion, Matrix4 } from 'three';
import {
  compileEditorJumps,
  createEditorFlightRuntime,
  predictEditorJumpTrajectory,
  analyzeEditorJumps,
  EDITOR_JUMP_SPEEDS,
  EDITOR_FLIGHT_RULES,
} from './jumps.js';
import {
  generateDocument,
  addJump,
  analyzeDocument,
  documentIdentity,
  validateDocument,
} from './document.js';
import { createEditorTrack } from './track.js';
import { createEditorCollisionWorld } from './nightweir.js';
import { createVehicleState } from '../physics/index.js';
import { createRapierWorld } from '../physics/rapier-world.js';
import { withMagneticBoundaries } from '../physics/magnetic-boundaries.js';

const DT = 1 / 120;
const controls = (boost = false) => ({
  throttle: 1,
  brake: 0,
  steer: 0,
  airbrake: false,
  boost,
});

function fixture({
  gap = 300,
  height = 80,
  receiver = 5,
  receiving = 600,
} = {}) {
  const takeoff = 200,
    landingStart = takeoff + gap,
    angle = Math.PI / 12;
  const jump = {
    id: 'jump-test',
    takeoff,
    landingStart,
    landingEnd: landingStart + receiving,
    recovery: landingStart + receiving,
    halfWidth: 20,
  };
  const track = {
    id: 'editor-jump-fixture',
    geometryVersion: 'physical-ramp-v1',
    length: 4000,
    width: 40,
    closed: false,
    finishDistance: 3400,
    jumps: [jump],
    checkpoints: [
      { distance: 0 },
      { distance: landingStart },
      { distance: 3400 },
    ],
    isGap: (s) => s > takeoff && s < landingStart,
    sample(s) {
      const tangent =
        s <= takeoff
          ? new Vector3(0, Math.sin(angle), Math.cos(angle))
          : new Vector3(0, 0, 1);
      const right = new Vector3(1, 0, 0),
        up = tangent.clone().cross(right);
      const y =
        s <= takeoff
          ? height + (s - takeoff) * Math.sin(angle)
          : s < landingStart
            ? height + ((receiver - height) * (s - takeoff)) / gap
            : receiver;
      const z =
        s <= takeoff
          ? s * Math.cos(angle)
          : takeoff * Math.cos(angle) + s - takeoff;
      return {
        position: new Vector3(0, y, z),
        tangent,
        right,
        up,
        quaternion: new Quaternion().setFromRotationMatrix(
          new Matrix4().makeBasis(right, up, tangent),
        ),
        curvature: 0,
        bank: 0,
      };
    },
  };
  return { track, jump };
}

test('jump compilation accepts huge gaps while protecting receivers, ordered spans and downhill finish runout', () => {
  const track = { length: 7000, width: 40, finishDistance: 6400 };
  const doc = {
    jumps: [{ id: 'jump-huge', start: 0.05, end: 0.55, receiving: 1200 }],
  };
  const [jump] = compileEditorJumps(doc, track);
  assert.ok(Math.abs(jump.landingStart - jump.takeoff - 3500) < 1e-8);
  assert.equal(jump.recovery, jump.landingEnd);
  assert.ok(jump.landingEnd < track.finishDistance);
  assert.throws(
    () =>
      compileEditorJumps(
        {
          jumps: [
            ...doc.jumps,
            { id: 'jump-overlap', start: 0.5, end: 0.6, receiving: 300 },
          ],
        },
        track,
      ),
    /overlap/,
  );
  assert.throws(
    () =>
      compileEditorJumps(
        {
          jumps: [{ id: 'jump-finish', start: 0.7, end: 0.9, receiving: 300 }],
        },
        track,
      ),
    /finish/,
  );
  assert.deepEqual(compileEditorJumps({}, track), []);
});

test('advisory trajectories use unassisted gravity and exact shared receiving contacts, with detached cached results', () => {
  const { track, jump } = fixture();
  const cruise = predictEditorJumpTrajectory(track, jump);
  const boost = predictEditorJumpTrajectory(track, jump, {
    speed: EDITOR_JUMP_SPEEDS.boost,
    boost: true,
  });
  assert.equal(cruise.status, 'landed');
  assert.equal(boost.status, 'landed');
  assert.ok(boost.landingDistance > cruise.landingDistance + 200);
  assert.ok(cruise.landing.distance >= jump.landingStart);
  const sample = cruise.samples.find(
    (entry) => Math.abs(entry.time - 1) < DT / 2,
  );
  assert.ok(sample);
  const origin = new Vector3().fromArray(cruise.points[0]);
  const expected = origin.addScaledVector(
    track.sample(jump.takeoff).tangent,
    EDITOR_JUMP_SPEEDS.cruise * sample.time,
  );
  expected.y -= (EDITOR_FLIGHT_RULES.gravity * sample.time * sample.time) / 2;
  assert.ok(
    expected.distanceTo(new Vector3().fromArray(sample.position)) < 1e-7,
    'the preview is ballistic, without a target-seeking force',
  );
  cruise.points[0][0] = 9999;
  assert.equal(predictEditorJumpTrajectory(track, jump).points[0][0], 0);
  const report = analyzeEditorJumps(track);
  assert.equal(report.jumps[0].cruise.landed, true);
  assert.equal(report.jumps[0].boost.landed, true);
});

test('a thousand-metre transfer is allowed and truthful cruise/boost warnings reflect the real range', () => {
  const { track, jump } = fixture({
    gap: 1000,
    height: 400,
    receiver: 0,
    receiving: 1200,
  });
  const cruise = predictEditorJumpTrajectory(track, jump);
  const boost = predictEditorJumpTrajectory(track, jump, {
    speed: EDITOR_JUMP_SPEEDS.boost,
    boost: true,
  });
  assert.equal(cruise.status, 'short');
  assert.equal(boost.status, 'landed');
  assert.ok(boost.time > 6);
  assert.ok(boost.gapLength >= 1000);
  assert.ok(boost.warnings.some((warning) => /Large gap/.test(warning)));
  assert.ok(cruise.warnings.some((warning) => /misses/.test(warning)));
  assert.ok(
    boost.landingDistance >= jump.landingStart &&
      boost.landingDistance <= jump.landingEnd,
  );
});

test('ordinary driving releases at the visible ramp with no setup hook, then lands and credits the finite receiving road', () => {
  const { track, jump } = fixture();
  const runtime = createEditorFlightRuntime({ track });
  assert.equal(
    runtime.launch,
    undefined,
    'ordinary gameplay exposes no launch shortcut',
  );
  const state = {
    ...createVehicleState(),
    distance: jump.takeoff - 30,
    speed: EDITOR_JUMP_SPEEDS.cruise,
  };
  const events = [];
  try {
    runtime.reset({ state });
    for (
      let tick = 0;
      tick < 1200 && !events.some((event) => event.type === 'jump-transfer');
      tick++
    ) {
      events.push(...runtime.advance(state, controls(), DT));
      if (runtime.status().mode === 'flight')
        assert.equal(
          state.distance,
          jump.takeoff,
          'flight cannot earn checkpoints by advancing over the void',
        );
    }
    assert.ok(events.some((event) => event.type === 'jump-launch'));
    const landed = events.find((event) => event.type === 'jump-transfer');
    assert.equal(landed?.payload.outcome, 'landed');
    assert.ok(landed.payload.to >= jump.landingStart);
    assert.equal(runtime.status().mode, 'magnetic');
    const launch = events.find((event) => event.type === 'jump-launch');
    const prediction = predictEditorJumpTrajectory(track, jump, {
      speed: launch.payload.speed,
    });
    assert.ok(Math.abs(prediction.landingDistance - landed.payload.to) < 3);
  } finally {
    runtime.dispose();
  }
});

test('misses use ordinary bounded recovery and designs without jumps retain the base magnetic runtime', () => {
  const { track, jump } = fixture({ gap: 1800, receiving: 400 });
  const runtime = createEditorFlightRuntime({ track });
  const state = {
    ...createVehicleState(),
    distance: jump.takeoff - 1,
    speed: EDITOR_JUMP_SPEEDS.cruise,
  };
  try {
    runtime.reset({ state });
    const events = [];
    for (
      let tick = 0;
      tick < 2400 && !events.some((event) => event.type === 'jump-transfer');
      tick++
    )
      events.push(...runtime.advance(state, controls(), DT));
    assert.ok(events.some((event) => event.type === 'jump-miss'));
    const transfer = events.find((event) => event.type === 'jump-transfer');
    assert.equal(transfer?.payload.outcome, 'recovered');
    assert.equal(transfer.payload.to, jump.recovery);
    assert.equal(state.speed, 0);
  } finally {
    runtime.dispose();
  }
  const magnetic = createEditorFlightRuntime({
    track: { ...track, jumps: [] },
  });
  try {
    assert.equal(magnetic.id, 'magnetic');
  } finally {
    magnetic.dispose();
  }
  assert.throws(
    () => createEditorFlightRuntime({ track, dynamics: { gravity: 35 } }),
    /gravity/,
  );
});

test('authored editor jump saves survive reload and the real Rapier ship launches and lands on the rendered receiving deck', async (t) => {
  const before = generateDocument({
    generatorVersion: 1,
    seedJumps: false,
    length: 3000,
    courseType: 'downhill',
    density: 0,
  });
  const doc = addJump(before, {
    startIndex: 2,
    endIndex: 4,
    receiving: 300,
    id: 'jump-native',
  });
  assert.equal(analyzeDocument(doc).valid, true);
  assert.notEqual(documentIdentity(doc), documentIdentity(before));
  const restored = validateDocument(JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(restored.jumps, doc.jumps);
  const track = createEditorTrack(restored),
    jump = track.jumps[0];
  assert.equal(
    track.checkpoints.filter(
      (cp) => cp.distance > jump.takeoff && cp.distance <= jump.recovery,
    ).length,
    1,
  );
  const collision = createEditorCollisionWorld(restored, track);
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track, collision),
  });
  const runtime = createEditorFlightRuntime({
    track,
    collisionWorld: collision,
    dynamics,
    settings: { steeringAssist: 0.3 },
  });
  t.after(() => {
    runtime.dispose();
    dynamics.dispose();
    collision.dispose();
  });
  assert.equal(dynamics.gravity, EDITOR_FLIGHT_RULES.gravity);
  const state = {
    ...createVehicleState(),
    distance: jump.takeoff - 20,
    speed: EDITOR_JUMP_SPEEDS.cruise,
  };
  runtime.reset({ state });
  const events = [];
  for (
    let tick = 0;
    tick < 2400 && !events.some((event) => event.type === 'jump-transfer');
    tick++
  )
    events.push(...runtime.advance(state, controls(), DT));
  assert.ok(events.some((event) => event.type === 'jump-launch'));
  assert.equal(
    events.find((event) => event.type === 'jump-transfer')?.payload.outcome,
    'landed',
  );
  assert.ok(state.distance >= jump.landingStart);
  assert.equal(runtime.status().mode, 'magnetic');
});
