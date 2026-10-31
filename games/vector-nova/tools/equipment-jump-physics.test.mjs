import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createVehicleState } from '../src/physics/index.js';
import { createMagneticRuntime } from '../src/core/session-runtime.js';
import { createFlightModel } from '../src/physics/flight.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import createHelionLevel from '../src/levels/helion/index.js';
import createOrbitalLevel from '../src/levels/orbital/index.js';
import { getCollisionHull } from '../src/ships/collision-hulls.js';
import { projectMagneticBody } from '../src/physics/magnetic-body.js';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../src/physics/collision-world.js';

const DT = 1 / 120;
const drive = { throttle: 1, steer: 0 };
const flat = {
  id: 'powered-hop-road',
  length: 2000,
  width: 28,
  closed: false,
  finishDistance: 1900,
  jumps: [],
  checkpoints: [],
  sample: (distance) => ({
    position: new T.Vector3(0, 0, distance),
    quaternion: new T.Quaternion(),
    tangent: new T.Vector3(0, 0, 1),
    right: new T.Vector3(1, 0, 0),
    up: new T.Vector3(0, 1, 0),
    curvature: 0,
  }),
};
async function fixture(t, track = flat, stateOverrides = {}, warmup = true) {
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track),
  });
  let actor;
  const runtime = createMagneticRuntime({
    track,
    dynamics: {
      ...dynamics,
      createActor(...args) {
        actor = dynamics.createActor(...args);
        return actor;
      },
    },
    equipment: true,
  });
  const state = {
    ...createVehicleState('kestrel'),
    distance: 100,
    speed: 80,
    ...stateOverrides,
  };
  runtime.reset({ state });
  if (warmup) runtime.advance(state, drive, DT);
  t.after(() => {
    runtime.dispose();
    dynamics.dispose();
  });
  return { runtime, state, dynamics, actor };
}
function finishHop(runtime, state, input = drive) {
  const events = [];
  const startHeight = runtime.pose(1).position.y;
  let maxRise = 0;
  for (let tick = 0; tick < 600; tick++) {
    events.push(...runtime.advance(state, input, DT));
    maxRise = Math.max(maxRise, runtime.pose(1).position.y - startHeight);
    const transfer = events.find(({ type }) => type === 'jump-transfer');
    if (transfer) return { transfer, events, ticks: tick + 1, maxRise };
  }
  return { transfer: null, events, ticks: 600, maxRise };
}

test('Jump Drive returns to a level road in about 70% of its previous airtime', async (t) => {
  const { runtime, state } = await fixture(t, flat, {}, false);
  assert.ok(runtime.jump(state));
  const result = finishHop(runtime, state);
  assert.equal(result.transfer?.payload.outcome, 'landed');
  const ratio = (result.ticks * DT) / ((2 * 22) / 26);
  assert.ok(ratio > 0.63 && ratio < 0.75, `airtime ratio ${ratio}`);
  const bounds = getCollisionHull('kestrel').bounds;
  const hullHeight = bounds.max[1] - bounds.min[1];
  assert.ok(result.maxRise / hullHeight > 4 && result.maxRise / hullHeight < 5);
  assert.ok(state.distance > 175, 'the hop preserves forward momentum');
  assert.equal(runtime.pose(1).grounded, true);
  assert.equal(
    runtime.snapshot().flight,
    null,
    'landing clears powered control',
  );
});

test('powered flight doubles its former lateral acceleration while normal flight stays at 4 m/s²', async (t) => {
  const powered = await fixture(t);
  assert.ok(powered.runtime.jump(powered.state));
  for (let tick = 0; tick < 30; tick++)
    powered.runtime.advance(powered.state, { ...drive, steer: 1 }, DT);
  assert.ok(Math.abs(powered.runtime.snapshot().flight.velocity[0] + 8) < 1e-8);
  const saved = powered.runtime.snapshot();
  powered.runtime.restore(saved);
  assert.equal(powered.runtime.snapshot().flight.equipmentControl, true);
  assert.throws(
    () =>
      powered.runtime.restore({
        ...saved,
        flight: { ...saved.flight, equipmentControl: 'yes' },
      }),
    /powered flight control/,
  );

  const jump = {
    id: 'normal-gap',
    takeoff: 50,
    landingStart: 500,
    landingEnd: 700,
    recovery: 600,
    halfWidth: 14,
  };
  const track = { ...flat, jumps: [jump], checkpoints: [{ distance: 500 }] };
  const dynamics = await createRapierWorld();
  const runtime = createFlightModel().createRuntime(
    { track, dynamics },
    {
      id: 'normal-flight-control',
      version: 1,
      rulesId: 'normal-flight-control-v1',
      testLaunch: true,
    },
  );
  t.after(() => {
    runtime.dispose();
    dynamics.dispose();
  });
  const state = createVehicleState('kestrel');
  runtime.reset({ state });
  assert.ok(runtime.jump(state));
  assert.equal(runtime.snapshot().flight.equipmentControl, true);
  runtime.launch(state, {
    jump: jump.id,
    position: [0, 20, 100],
    velocity: [0, 0, 80],
  });
  assert.equal(
    runtime.snapshot().flight.equipmentControl,
    undefined,
    'new normal launch clears powered control',
  );
  for (let tick = 0; tick < 30; tick++)
    runtime.advance(state, { ...drive, steer: 1 }, DT);
  const velocity = runtime.snapshot().flight.velocity;
  assert.ok(
    Math.abs(velocity[0] + 1) < 1e-8,
    'ordinary jump steering is unchanged',
  );
  assert.ok(
    Math.abs(velocity[1] + 6.5) < 1e-8,
    'ordinary jump gravity is unchanged',
  );
});

test('a stationary powered hop retains a visible arc and lands without pitching vertically', async (t) => {
  const { runtime, state } = await fixture(t, flat, { speed: 0 }, false);
  assert.ok(runtime.jump(state));
  const result = finishHop(runtime, state, { throttle: 0, steer: 0 });
  assert.equal(result.transfer?.payload.outcome, 'landed');
  assert.ok(result.maxRise > 6 && result.maxRise < 7);
  assert.equal(runtime.pose(1).grounded, true);
});

test('sampled-road powered landings catch half-supported hulls and steer them inboard', async (t) => {
  const { runtime, state } = await fixture(
    t,
    { ...flat, boundaryIntervals: [] },
    { lateral: 13.5 },
  );
  assert.ok(runtime.jump(state));
  const result = finishHop(runtime, state);
  assert.equal(result.transfer?.payload.outcome, 'landed');
  assert.equal(result.transfer?.payload.edgeCaught, true);
  assert.ok(state.lateral < 12, `inboard lateral ${state.lateral}`);
  assert.ok(state.speed > 60, 'edge catch retains useful forward momentum');
  assert.ok(
    result.events.some(
      ({ type, payload }) =>
        type === 'impact' && payload.source.endsWith('edge-catch'),
    ),
  );
});

test('sampled-road powered landings never invent a deck across an authored gap', async (t) => {
  const { runtime, state } = await fixture(t, {
    ...flat,
    jumps: [
      {
        id: 'real-gap',
        takeoff: 140,
        landingStart: 350,
        landingEnd: 500,
        recovery: 400,
        halfWidth: 14,
      },
    ],
    checkpoints: [{ distance: 350 }],
  });
  assert.ok(runtime.jump(state));
  const result = finishHop(runtime, state);
  assert.equal(result.transfer?.payload.outcome, 'recovered');
  assert.ok(
    result.events.every(
      ({ type, payload }) =>
        type !== 'jump-transfer' || payload.outcome !== 'landed',
    ),
  );
});

test('inverted powered edge landings keep native hulls above sampled roads through capture and replay', async (t) => {
  const track = { ...flat, boundaryIntervals: [] };
  const point = new T.Vector3();
  const inverted = new T.Quaternion()
    .setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI)
    .toArray();
  for (const shipId of ['kestrel', 'shrike', 'bastion', 'needle']) {
    const hull = getCollisionHull(shipId);
    const clearance = (pose) => {
      let minimum = Infinity;
      for (let i = 0; i < hull.vertices.length; i += 3) {
        point
          .fromArray(hull.vertices, i)
          .applyQuaternion(pose.quaternion)
          .add(pose.position);
        if (Math.abs(point.x) <= track.width / 2)
          minimum = Math.min(minimum, point.y);
      }
      return minimum;
    };
    for (const side of [-1, 1]) {
      const { runtime, state, dynamics, actor } = await fixture(t, track, {
        shipId,
        lateral: side * (track.width / 2 - 1.5),
      });
      assert.ok(runtime.jump(state));
      // Resume a powered hop after a contact has rolled the hull. The model
      // starts wholly above the road; production integration must catch its
      // asymmetric canopy before it crosses the deck, then settle it safely.
      const saved = runtime.snapshot();
      saved.currentPose = {
        position: [state.lateral, hull.bounds.max[1] + 0.15, 192],
        quaternion: inverted,
      };
      saved.previousPose = structuredClone(saved.currentPose);
      Object.assign(saved.flight, {
        velocity: [0, -20, 80],
        angularVelocity: [0, 0, 0],
        elapsed: 1.15,
        hitAt: 1.15,
        equipmentGuide: { distance: 192, lateral: state.lateral, height: 0.72 },
      });
      runtime.restore(saved);
      assert.ok(clearance(runtime.pose(1)) > 0.14, 'the initial hull is clear');
      const physics = dynamics.snapshot();
      const initialState = { ...state };
      let captured;
      const checkClearance = (tick) => {
        for (const [kind, pose] of [
          ['physical', actor.read()],
          ...[0, 0.5, 1].map((alpha) => [
            `visible alpha ${alpha}`,
            runtime.pose(alpha),
          ]),
        ])
          assert.ok(
            clearance(pose) >= -1e-5,
            `${shipId}, side ${side}, tick ${tick}: ${kind} hull penetrates the inboard road by ${-clearance(pose)}m`,
          );
        const snapshot = runtime.snapshot();
        if (snapshot.mode === 'magnetic')
          for (const [alpha, endpoint] of [
            [0, snapshot.magnetic.previous ?? snapshot.magnetic.current],
            [1, snapshot.magnetic.current],
          ])
            assert.ok(
              runtime
                .pose(alpha)
                .position.distanceTo(
                  new T.Vector3().fromArray(endpoint.position),
                ) < 1e-9,
              'already-clear endpoints retain their exact presentation height',
            );
      };
      const result = () => ({
        runtime: runtime.snapshot(),
        physics: dynamics.snapshot(),
        state: { ...state },
      });
      const run = () => {
        let transfer;
        for (let tick = 0; tick < 40; tick++) {
          const events = runtime.advance(state, {}, DT);
          transfer ??= events.find(({ type }) => type === 'jump-transfer');
          checkClearance(tick);
          if (transfer && !captured) captured = { ...result(), tick: tick + 1 };
        }
        assert.equal(transfer?.payload.outcome, 'landed');
        assert.equal(transfer.payload.edgeCaught, true);
        assert.ok(
          Math.abs(state.lateral) < 12,
          'the existing inward edge catch remains',
        );
        return result();
      };
      const expected = run();
      Object.assign(state, initialState);
      runtime.restore(saved);
      dynamics.restore(physics);
      assert.deepEqual(
        run(),
        expected,
        'native landing and settling replay exactly',
      );
      assert.equal(
        captured.runtime.magnetic.capture.sampledNativeClearance,
        true,
      );
      for (const invalidCapture of [
        { sampledNativeClearance: 'yes' },
        { distance: Infinity },
        { lateral: NaN },
        { chassisId: 'unknown-chassis' },
      ]) {
        const invalid = structuredClone(captured.runtime);
        Object.assign(invalid.magnetic.capture, invalidCapture);
        assert.throws(
          () => runtime.restore(invalid),
          /Invalid magnetic body state/,
        );
      }
      Object.assign(state, captured.state);
      runtime.restore(captured.runtime);
      dynamics.restore(captured.physics);
      for (let tick = captured.tick; tick < 40; tick++) {
        runtime.advance(state, {}, DT);
        checkClearance(tick);
      }
      assert.deepEqual(
        result(),
        expected,
        'interpolation clearance survives a mid-capture restore',
      );
    }
  }
});

test('sampled capture caches repeated interpolation reads without retaining mutable poses or stale state', async (t) => {
  let roadSamples = 0;
  const track = {
    ...flat,
    boundaryIntervals: [],
    sample(distance) {
      roadSamples++;
      return flat.sample(distance);
    },
  };
  const { runtime, state, dynamics } = await fixture(t, track, {
    lateral: 12.5,
  });
  assert.ok(runtime.jump(state));
  const saved = runtime.snapshot();
  saved.currentPose = {
    position: [12.5, 1.5, 192],
    quaternion: new T.Quaternion()
      .setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI)
      .toArray(),
  };
  saved.previousPose = structuredClone(saved.currentPose);
  Object.assign(saved.flight, {
    velocity: [0, -20, 80],
    angularVelocity: [0, 0, 0],
    elapsed: 1.15,
    hitAt: 1.15,
    equipmentGuide: { distance: 192, lateral: 12.5, height: 0.72 },
  });
  runtime.restore(saved);
  runtime.advance(state, {}, DT);
  runtime.advance(state, {}, DT);
  const retained = runtime.snapshot();
  assert.equal(retained.magnetic.capture.sampledNativeClearance, true);
  assert.equal(retained.magnetic.capture.aligning, false);
  const retainedPhysics = dynamics.snapshot(),
    retainedState = { ...state };

  const beforeFirst = roadSamples;
  const first = runtime.pose(0.5);
  assert.ok(
    roadSamples > beforeFirst,
    'the first interpolation read samples the road',
  );
  const sampled = roadSamples;
  const expectedPosition = first.position.clone(),
    expectedQuaternion = first.quaternion.clone();
  first.position.set(1000, -1000, 1000);
  first.quaternion.set(1, 0, 0, 0);
  const repeated = runtime.pose(0.5);
  assert.equal(roadSamples, sampled, 'same-alpha reads reuse their correction');
  assert.deepEqual(repeated.position, expectedPosition);
  assert.deepEqual(repeated.quaternion, expectedQuaternion);
  assert.deepEqual(
    runtime.snapshot(),
    retained,
    'derived corrections do not enter snapshots',
  );

  runtime.advance(state, {}, DT);
  const afterAdvance = roadSamples;
  runtime.pose(0.5);
  assert.ok(
    roadSamples > afterAdvance,
    'advancement invalidates the previous correction',
  );
  const advanced = roadSamples;
  runtime.pose(0.5);
  assert.equal(roadSamples, advanced, 'the new pose can be reused too');

  Object.assign(state, retainedState);
  runtime.restore(retained);
  dynamics.restore(retainedPhysics);
  const beforeRestoreRead = roadSamples;
  const restored = runtime.pose(0.5);
  assert.ok(
    roadSamples > beforeRestoreRead,
    'restore rebuilds derived corrections',
  );
  assert.deepEqual(restored.position, expectedPosition);
  assert.deepEqual(restored.quaternion, expectedQuaternion);

  runtime.reset({ state: { ...createVehicleState(), distance: 100 } });
  const afterReset = roadSamples;
  assert.deepEqual(runtime.pose(0.5).position, new T.Vector3(0, 0.72, 100));
  assert.equal(
    roadSamples,
    afterReset,
    'reset drops the capture and its cached correction',
  );
});

test('rolled Helion sampled touchdowns clear the curved road across the native footprint', async (t) => {
  const level = createHelionLevel();
  const track = level.createTrack();
  const collisionWorld = level.createCollisionWorld({ track });
  const native = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  });
  let actor;
  const dynamics = {
    ...native,
    createActor(...args) {
      actor = native.createActor(...args);
      return actor;
    },
  };
  t.after(() => {
    native.dispose();
    collisionWorld.dispose();
  });
  const hull = getCollisionHull('kestrel');
  const point = new T.Vector3();
  for (const side of [-1, 1]) {
    native.reset();
    const runtime = level.createRuntime({ track, collisionWorld, dynamics });
    try {
      const state = {
        ...createVehicleState(),
        distance: 100,
        lateral: side * (track.width / 2 - 1.5),
        speed: 80,
      };
      runtime.reset({ state });
      runtime.advance(state, drive, DT);
      assert.ok(runtime.jump(state));
      const saved = runtime.snapshot();
      const movement = saved.flight;
      const frame = track.sample(state.distance);
      const position = frame.position
        .clone()
        .addScaledVector(frame.right, state.lateral)
        .addScaledVector(frame.up, hull.bounds.max[1] + 0.15);
      const quaternion = frame.quaternion
        .clone()
        .multiply(
          new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI),
        );
      movement.currentPose = {
        position: position.toArray(),
        quaternion: quaternion.toArray(),
      };
      movement.previousPose = structuredClone(movement.currentPose);
      Object.assign(movement.flight, {
        velocity: frame.tangent
          .clone()
          .multiplyScalar(80)
          .addScaledVector(frame.up, -20)
          .toArray(),
        angularVelocity: [0, 0, 0],
        elapsed: 1.15,
        hitAt: 1.15,
        equipmentGuide: {
          distance: state.distance,
          lateral: state.lateral,
          height: 0.72,
        },
      });
      runtime.restore(saved);
      let landed = false;
      for (let tick = 0; tick < 40; tick++) {
        const events = runtime.advance(state, drive, DT);
        landed ||= events.some(
          ({ type, payload }) =>
            type === 'jump-transfer' && payload.outcome === 'landed',
        );
        for (const pose of [
          actor.read(),
          ...[0, 0.5, 1].map((alpha) => runtime.pose(alpha)),
        ])
          for (let i = 0; i < hull.vertices.length; i += 3) {
            point
              .fromArray(hull.vertices, i)
              .applyQuaternion(pose.quaternion)
              .add(pose.position);
            const projected = projectMagneticBody(
              track,
              point,
              state.distance,
              state.lateral,
              dynamics.sampleRoadSurface,
            );
            if (Math.abs(projected.lateral) > track.width / 2 - 0.01) continue;
            const clearance = point
              .clone()
              .sub(projected.frame.position)
              .dot(projected.frame.up);
            assert.ok(
              clearance >= -0.001,
              `side ${side}, tick ${tick}: native corner penetrates curved road by ${-clearance}m`,
            );
          }
      }
      assert.ok(landed, `side ${side}: the rolled powered hop actually lands`);
    } finally {
      runtime.dispose();
    }
  }
});

test('Helion powered hops land on ordinary road outside its physical jump corridors, including the lap seam', async (t) => {
  const level = createHelionLevel();
  const track = level.createTrack();
  const collisionWorld = level.createCollisionWorld({ track });
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  });
  t.after(() => {
    dynamics.dispose();
    collisionWorld.dispose();
  });
  for (const distance of [
    100,
    500,
    1000,
    2100,
    2600,
    3200,
    3800,
    4400,
    track.length - 35,
  ]) {
    const runtime = level.createRuntime({ track, collisionWorld, dynamics });
    try {
      const state = {
        ...createVehicleState('kestrel'),
        distance,
        lateral: -4,
        speed: distance > track.length - 40 ? 40 : 80,
      };
      runtime.reset({ state });
      runtime.advance(state, drive, DT);
      const from = state.distance;
      assert.ok(runtime.jump(state));
      const result = finishHop(runtime, state);
      assert.equal(
        result.transfer?.payload.outcome,
        'landed',
        `Helion ${distance}`,
      );
      assert.ok(
        state.distance > from + 20,
        `Helion ${distance}: no recovery teleport`,
      );
      assert.equal(runtime.pose(1).grounded, true);
    } finally {
      runtime.dispose();
    }
  }
});

test('boosted Orbital powered hops keep their full road-relative arc through rising banks and wall-ride releases', async (t) => {
  const track = createOrbitalLevel({ shape: false }).createTrack();
  const boundaries = withMagneticBoundaries(track);
  const dynamics = await createRapierWorld({ collisionWorld: boundaries });
  t.after(() => dynamics.dispose());
  const bounds = getCollisionHull('kestrel').bounds;
  const hullHeight = bounds.max[1] - bounds.min[1];
  for (const distance of [150, 280, 300, 620, 825, 955, 1050]) {
    const runtime = createMagneticRuntime({ track, dynamics, equipment: true });
    try {
      const state = {
        ...createVehicleState('kestrel'),
        distance,
        lateral: -6,
        speed: 205,
        enhancements: Object.fromEntries(
          [
            'speed',
            'acceleration',
            'handling',
            'braking',
            'boost',
            'toughness',
          ].map((key) => [key, 3]),
        ),
      };
      const input = { ...drive, boost: true };
      runtime.reset({ state });
      runtime.advance(state, input, DT);
      let guide = projectMagneticBody(
        track,
        runtime.pose(1).position,
        state.distance,
        state.lateral,
        dynamics.sampleRoadSurface,
      );
      const height = runtime
        .pose(1)
        .position.clone()
        .sub(guide.frame.position)
        .dot(guide.frame.up);
      assert.ok(runtime.jump(state));
      let maximum = 0,
        transfer,
        tick = 0;
      for (; tick < 360; tick++) {
        const events = runtime.advance(state, input, DT);
        const pose = runtime.pose(1);
        guide = projectMagneticBody(
          track,
          pose.position,
          guide.distance,
          guide.lateral,
          dynamics.sampleRoadSurface,
        );
        maximum = Math.max(
          maximum,
          pose.position.clone().sub(guide.frame.position).dot(guide.frame.up) -
            height,
        );
        transfer = events.find(({ type }) => type === 'jump-transfer');
        if (transfer) break;
      }
      assert.equal(transfer?.payload.outcome, 'landed', `Orbital ${distance}`);
      assert.ok(
        maximum > hullHeight * 4 && maximum < hullHeight * 5,
        `Orbital ${distance}: height ${maximum}`,
      );
      assert.ok(
        (tick + 1) * DT > 0.9 && (tick + 1) * DT < 1.4,
        `Orbital ${distance}: airtime ${(tick + 1) * DT}`,
      );
    } finally {
      runtime.dispose();
    }
  }
});

test('powered road guidance preserves replay continuation and rejects invalid saved coordinates', async (t) => {
  const track = createOrbitalLevel({ shape: false }).createTrack();
  const { runtime, state } = await fixture(t, track, {
    distance: 955,
    speed: 205,
    lateral: -6,
  });
  assert.ok(runtime.jump(state));
  for (let i = 0; i < 30; i++) runtime.advance(state, drive, DT);
  const saved = runtime.snapshot(),
    savedState = { ...state };
  assert.ok(Number.isFinite(saved.flight.equipmentGuide.height));
  const invalid = structuredClone(saved);
  invalid.flight.equipmentGuide.distance = Infinity;
  assert.throws(() => runtime.restore(invalid), /road guide/);
  for (let i = 0; i < 20; i++) runtime.advance(state, drive, DT);
  const expected = runtime.pose(1);
  runtime.restore(saved);
  Object.assign(state, savedState);
  for (let i = 0; i < 20; i++) runtime.advance(state, drive, DT);
  assert.ok(runtime.pose(1).position.distanceTo(expected.position) < 1e-6);
});

test('powered road guidance never bypasses an actual low ceiling', async (t) => {
  const geometry = new T.BoxGeometry(40, 1, 800);
  const source = createCollisionWorld({
    id: 'powered-hop-ceiling',
    version: 1,
    geometryId: 'powered-hop-ceiling-v1',
    triangles: indexedTriangles(
      geometry.attributes.position.array,
      geometry.index.array,
      { id: 'roof', kind: 'structure' },
      new T.Matrix4().makeTranslation(0, 4.5, 450),
    ),
  });
  geometry.dispose();
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(flat, source),
  });
  const runtime = createMagneticRuntime({
    track: flat,
    collisionWorld: source,
    dynamics,
    equipment: true,
  });
  t.after(() => {
    runtime.dispose();
    dynamics.dispose();
    source.dispose();
  });
  const state = { ...createVehicleState('kestrel'), distance: 100, speed: 80 };
  runtime.reset({ state });
  runtime.advance(state, drive, DT);
  assert.ok(runtime.jump(state));
  const result = finishHop(runtime, state);
  assert.ok(
    result.events.some(
      ({ type, payload }) =>
        type === 'impact' && payload.contactKind === 'structure',
    ),
  );
  assert.ok(
    result.maxRise < 3,
    `the physical roof limits rise to ${result.maxRise}`,
  );
});

test('powered curve guidance preserves authored airborne forces instead of cancelling their normal lift', async (t) => {
  const dynamics = await createRapierWorld();
  const runtime = createFlightModel().createRuntime(
    { track: flat, dynamics },
    {
      id: 'powered-local-force',
      version: 1,
      rulesId: 'powered-local-force-v1',
      forgivingContacts: true,
      airAcceleration: () => new T.Vector3(0, 10, 0),
    },
  );
  t.after(() => {
    runtime.dispose();
    dynamics.dispose();
  });
  const state = { ...createVehicleState('kestrel'), distance: 100, speed: 80 };
  runtime.reset({ state });
  runtime.advance(state, drive, DT);
  assert.ok(runtime.jump(state));
  const result = finishHop(runtime, state);
  assert.equal(result.transfer?.payload.outcome, 'landed');
  assert.ok(
    result.maxRise > 8.5 && result.maxRise < 9.6,
    `local-force rise ${result.maxRise}`,
  );
  assert.ok(
    result.ticks * DT > 1.5,
    'the authored lift extends powered airtime',
  );
});
