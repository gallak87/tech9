import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createFlightModel } from '../physics/flight.js';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../physics/collision-world.js';
import { createRapierWorld } from '../physics/rapier-world.js';
import { createVehicleState } from '../physics/index.js';

const DT = 1 / 120;
const Z = new T.Vector3(0, 0, 1);
function course({ bank = 0, tube = false } = {}) {
  const radius = 22;
  const sample = (distance) => {
    const quaternion = new T.Quaternion().setFromAxisAngle(Z, bank);
    return {
      position: new T.Vector3(0, 0, distance),
      tangent: Z.clone(),
      right: new T.Vector3(1, 0, 0).applyQuaternion(quaternion),
      up: new T.Vector3(0, 1, 0).applyQuaternion(quaternion),
      quaternion,
      curvature: 0,
      bank,
    };
  };
  const surface = (distance, lateral) => {
    if (!tube) return null;
    const angle = lateral / radius;
    const right = new T.Vector3(Math.cos(angle), Math.sin(angle), 0);
    const up = new T.Vector3(-Math.sin(angle), Math.cos(angle), 0);
    return {
      ...sample(distance),
      position: new T.Vector3(
        radius * Math.sin(angle),
        radius * (1 - Math.cos(angle)),
        distance,
      ),
      right,
      up,
      quaternion: new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, up, Z),
      ),
      bounds: { min: -Math.PI * radius, max: Math.PI * radius },
      period: 2 * Math.PI * radius,
    };
  };
  const jump = {
    id: 'receiver',
    takeoff: 100,
    landingStart: 200,
    landingEnd: 900,
    recovery: 920,
    halfWidth: 19,
  };
  const track = {
    id: 'native-freestyle-capture',
    closed: false,
    width: 38,
    length: 1200,
    finishDistance: 1100,
    sample,
    ...(tube ? { sampleSurface: surface } : {}),
    jumps: [jump],
    checkpoints: [0, 200, 1100].map((distance) => ({ distance })),
  };
  const vertices = [],
    coordinates = [],
    indices = [];
  const segments = tube ? 96 : 1;
  const half = tube ? Math.PI * radius : 19;
  for (let row = 0; row < 2; row++) {
    const distance = row ? 900 : 200;
    for (let column = 0; column <= segments; column++) {
      const lateral = -half + (2 * half * column) / segments;
      const frame = surface(distance, lateral) ?? sample(distance);
      const p = frame.position.clone();
      if (!tube) p.addScaledVector(frame.right, lateral);
      vertices.push(...p.toArray());
      coordinates.push(distance, lateral);
    }
  }
  for (let column = 0; column < segments; column++) {
    const a = column,
      b = column + 1,
      c = column + segments + 1,
      d = c + 1;
    // Positive route-space winding gives the exact inward driving skin.
    indices.push(a, c, b, b, c, d);
  }
  const roadCoord = new T.Float32BufferAttribute(coordinates, 2);
  const collisionWorld = createCollisionWorld({
    id: 'native-freestyle-receiver',
    version: 1,
    geometryId: `${bank}:${tube}`,
    triangles: indexedTriangles(
      vertices,
      indices,
      { id: 'receiver-deck', kind: 'deck', start: 200, end: 900 },
      null,
      roadCoord,
    ),
  });
  return { track, jump, collisionWorld, surface };
}
async function flight(
  t,
  {
    bank = 0,
    tube = false,
    lateral = 0,
    flip = false,
    bad = null,
    surfaceLanding = true,
  } = {},
) {
  const { track, jump, collisionWorld, surface } = course({ bank, tube });
  const dynamics = await createRapierWorld({ collisionWorld });
  const receiver = surface(300, lateral) ?? track.sample(300);
  const orientation = receiver.quaternion.clone();
  if (bad === 'underside')
    orientation.multiply(new T.Quaternion().setFromAxisAngle(Z, Math.PI));
  const runtime = createFlightModel({
    timeout: 8,
    missBelow: 300,
  }).createRuntime(
    { track, collisionWorld, dynamics },
    {
      id: 'native-freestyle-capture',
      version: 1,
      rulesId: 'native-freestyle-capture',
      testLaunch: true,
      surfaceLanding,
      airAngularSpeed: 6,
      airAngularResponse: 24,
      airAttitude({ target, state }) {
        target.copy(orientation);
        if (flip)
          target.multiply(
            new T.Quaternion().setFromAxisAngle(
              new T.Vector3(1, 0, 0),
              Math.min(1, state.time / 2.2) * 2 * Math.PI,
            ),
          );
      },
    },
  );
  const state = createVehicleState('shrike');
  const position = receiver.position
    .clone()
    .addScaledVector(
      flip ? new T.Vector3(0, 1, 0) : receiver.up,
      flip ? 180 : 12,
    );
  if (!tube) position.addScaledVector(receiver.right, lateral);
  const velocity = receiver.tangent
    .clone()
    .multiplyScalar(110)
    .addScaledVector(receiver.up, flip ? 0 : -45);
  runtime.launch(state, {
    jump: jump.id,
    position: position.toArray(),
    quaternion: orientation.toArray(),
    velocity: velocity.toArray(),
  });
  const events = [];
  let inverted = false;
  for (let i = 0; i < 120 * 6; i++) {
    const before = runtime.snapshot();
    if (before.flight && runtime.pose(1)) {
      const up = new T.Vector3(0, 1, 0).applyQuaternion(
        runtime.pose(1).quaternion,
      );
      inverted ||= up.dot(receiver.up) < -0.9;
    }
    events.push(...runtime.advance(state, { throttle: 0, steer: 0 }, DT));
    if (
      events.some((event) => event.type === 'jump-transfer') ||
      runtime.snapshot().mode === 'recovery'
    )
      break;
  }
  t.after(() => {
    runtime.dispose();
    dynamics.dispose();
    collisionWorld.dispose();
  });
  return { runtime, state, events, inverted, receiver };
}

test('an actual native full flip can settle and magnetically capture a banked receiving deck', async (t) => {
  for (const bank of [-0.7, 0.7]) {
    const { runtime, state, events, inverted } = await flight(t, {
      bank,
      flip: true,
    });
    assert.equal(inverted, true, 'the native hull really crossed upside down');
    assert.equal(
      events.find((event) => event.type === 'jump-transfer')?.payload.outcome,
      'landed',
    );
    assert.equal(events.filter((event) => event.type === 'impact').length, 0);
    assert.equal(runtime.pose(1).grounded, true);
    const distance = state.distance;
    for (let i = 0; i < 30; i++) runtime.advance(state, { throttle: 1 }, DT);
    assert.equal(
      runtime.pose(1).grounded,
      true,
      'traction stays attached after capture',
    );
    assert.ok(state.distance > distance, 'capture restores ordinary driving');
  }
});

test('actual tube side and ceiling contacts capture their surface chart instead of the floor chord', async (t) => {
  for (const lateral of [Math.PI * 11, Math.PI * 22 - 2]) {
    const { runtime, state, events } = await flight(t, { tube: true, lateral });
    assert.equal(
      events.find((event) => event.type === 'jump-transfer')?.payload.outcome,
      'landed',
    );
    assert.equal(runtime.pose(1).grounded, true);
    assert.ok(
      Math.abs(state.lateral) > 25,
      'the received coordinate is real tube arclength',
    );
    for (let i = 0; i < 12; i++) runtime.advance(state, { throttle: 1 }, DT);
    assert.equal(runtime.pose(1).grounded, true);
  }
});

test('a banked underside hit remains a physical crash and never earns a transfer', async (t) => {
  const { runtime, events } = await flight(t, { bank: 0.7, bad: 'underside' });
  assert.equal(
    events.some((event) => event.type === 'jump-transfer'),
    false,
  );
  assert.equal(runtime.snapshot().mode, 'recovery');
  assert.ok(events.some((event) => event.type === 'impact'));
});
