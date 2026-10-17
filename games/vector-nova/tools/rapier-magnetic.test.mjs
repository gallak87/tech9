import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import {
  COLLISION_HULLS,
  getCollisionHull,
} from '../src/ships/collision-hulls.js';

const DT = 1 / 120;
const identity = () => new T.Quaternion();
const pose = (position, quaternion = identity()) => ({ position, quaternion });
const near = (actual, expected, tolerance = 1e-4) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} ~= ${expected}`,
  );

test('staged forces cover the entire shared tick exactly once and clear before the next tick', async (t) => {
  const world = await createRapierWorld({ gravity: 26 });
  t.after(() => world.dispose());
  const actors = [0.5, 3].map((mass, index) => {
    const actor = world.createActor({ mass });
    actor.reset({ pose: pose(new T.Vector3(0, 20, index * 20)), active: true });
    return actor;
  });
  for (let tick = 0; tick < 60; tick++) {
    for (const actor of actors)
      actor.stage({ acceleration: new T.Vector3(12, 26, 0) });
    world.step(DT);
  }
  for (const actor of actors) {
    near(actor.read().velocity.x, 6, 0.001);
    near(actor.read().velocity.y, 0, 0.001);
  }
  world.step(DT);
  for (const actor of actors) {
    near(actor.read().velocity.x, 6, 0.001);
    near(actor.read().velocity.y, -26 * DT, 0.001);
  }
});

test('fixed magnetic constraints do not inject collision energy into real chassis or unequal masses', async (t) => {
  const cases = [
    ...Object.keys(COLLISION_HULLS).flatMap((id) =>
      [40, 160].map((speed) => ({ ids: [id, id], masses: [1, 1], speed })),
    ),
    ...Object.keys(COLLISION_HULLS).flatMap((id) =>
      [12, 12.37].flatMap((gap) => [
        { ids: [id, id], masses: [1, 1], speed: 320, gap },
        {
          ids: [id, id],
          masses: [1, 1],
          speed: 160,
          secondSpeed: -160,
          opposing: true,
          gap,
        },
        {
          ids: [id, id],
          masses: [1, 1],
          speed: 160,
          secondSpeed: -160,
          opposing: true,
          lateral: 1.1,
          gap,
        },
      ]),
    ),
    { ids: ['kestrel', 'gannet'], masses: [0.5, 2], speed: 160 },
    {
      ids: ['needle', 'bastion'],
      masses: [2, 0.5],
      speed: 160,
      bank: Math.PI / 2,
    },
  ];
  for (const entry of cases) {
    const world = await createRapierWorld({ gravity: 0 });
    t.after(() => world.dispose());
    const frame = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 0, 1),
      entry.bank ?? 0,
    );
    const racers = entry.ids.map((id, index) => {
      const actor = world.createActor({ mass: entry.masses[index] });
      actor.setContactShape(getCollisionHull(id));
      const supported = pose(
        new T.Vector3(
          index ? (entry.lateral ?? 0) : 0,
          0.72,
          index ? 0 : -(entry.gap ?? 12),
        ).applyQuaternion(frame),
        frame,
      );
      const orientation = frame
        .clone()
        .multiply(
          new T.Quaternion().setFromAxisAngle(
            new T.Vector3(0, 1, 0),
            index && entry.opposing ? Math.PI : 0,
          ),
        );
      actor.reset({
        pose: { ...supported, quaternion: orientation },
        support: supported,
        velocity: new T.Vector3(
          0,
          0,
          index ? (entry.secondSpeed ?? 0) : entry.speed,
        ),
        active: true,
      });
      return actor;
    });
    // Read the engine's actual compound inertia once; total energy includes
    // contact-induced rotation as well as centre-of-mass translation.
    const snapshot = world.snapshot();
    for (const body of snapshot.actors) {
      assert.ok(
        body.contactShape.parts.length > 1,
        'the regression uses structural compound parts, not an enclosing convex hull',
      );
      assert.equal(body.colliderHandles.length, body.contactShape.parts.length);
    }
    const inspection = RAPIER.World.restoreSnapshot(
      Uint8Array.from(atob(snapshot.engine), (character) =>
        character.charCodeAt(0),
      ),
    );
    const inertia = snapshot.actors.map(({ bodyHandle }) => {
      const body = inspection.getRigidBody(bodyHandle);
      assert.ok(
        Math.abs(
          body.mass() -
            snapshot.actors.find((entry) => entry.bodyHandle === bodyHandle)
              .mass,
        ) < 1e-5,
        'component masses sum to the requested racer mass',
      );
      return {
        principal: new T.Vector3().copy(body.principalInertia()),
        frame: new T.Quaternion().copy(body.principalInertiaLocalFrame()),
      };
    });
    inspection.free();
    const initialEnergy =
      (entry.masses[0] * entry.speed ** 2 +
        entry.masses[1] * (entry.secondSpeed ?? 0) ** 2) /
      2;
    let contacts = 0;
    for (let tick = 0; tick < 120; tick++) {
      world.step(DT);
      let energy = 0;
      for (const [index, actor] of racers.entries()) {
        const body = actor.read();
        // Sloped compound parts may tilt and shove one another, but must not
        // turn a supported bump into a vertical launch over the containment.
        near(
          body.position.dot(new T.Vector3(0, 1, 0).applyQuaternion(frame)),
          0.72,
          0.003,
        );
        contacts += body.contacts.filter(
          ({ shape }) => shape.kind === 'racer',
        ).length;
        const omega = body.angularVelocity
          .clone()
          .applyQuaternion(
            body.quaternion.clone().multiply(inertia[index].frame).invert(),
          );
        const spinEnergy =
          omega.clone().multiply(omega).dot(inertia[index].principal) / 2;
        energy += (body.mass * body.velocity.lengthSq()) / 2 + spinEnergy;
      }
      assert.ok(
        energy <= initialEnergy * 1.01,
        `${entry.ids.join('/')} at ${entry.speed - (entry.secondSpeed ?? 0)} m/s closing, gap ${entry.gap ?? 12}, lateral ${entry.lateral ?? 0}, tick ${tick}: ${energy} J exceeds ${initialEnergy} J input`,
      );
    }
    assert.ok(
      contacts > 0,
      'the real chassis collide under their fixed support constraints',
    );
  }
});

test('off-centre racer impacts exchange momentum and yaw on flat, banked and inverted support', async (t) => {
  for (const bank of [0, 80, 180]) {
    const world = await createRapierWorld({ gravity: 9.81 });
    t.after(() => world.dispose());
    const quaternion = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 0, 1),
      (bank * Math.PI) / 180,
    );
    const up = new T.Vector3(0, 1, 0).applyQuaternion(quaternion);
    const right = new T.Vector3(1, 0, 0).applyQuaternion(quaternion);
    const forward = new T.Vector3(0, 0, 1).applyQuaternion(quaternion);
    const support = pose(up.clone().multiplyScalar(0.72), quaternion);
    const racers = [1, -1].map((sign) => {
      const actor = world.createActor();
      actor.reset({
        pose: pose(
          support.position
            .clone()
            .addScaledVector(forward, -5 * sign)
            .addScaledVector(right, 0.5 * sign),
          quaternion,
        ),
        velocity: forward.clone().multiplyScalar(30 * sign),
        support,
        active: true,
      });
      return actor;
    });
    const hits = [];
    for (let tick = 0; tick < 80; tick++) {
      world.step(DT);
      for (const racer of racers) hits.push(...racer.read().contacts);
    }
    assert.ok(
      hits.some((hit) => hit.shape.kind === 'racer' && hit.incomingSpeed > 55),
    );
    assert.ok(hits.some((hit) => hit.shape.actorId === racers[0].id));
    assert.ok(hits.some((hit) => hit.shape.actorId === racers[1].id));
    const [first, second] = racers.map((racer) => racer.read());
    near(first.velocity.dot(forward) + second.velocity.dot(forward), 0, 2e-4);
    assert.ok(
      first.velocity.dot(forward) < 3 && second.velocity.dot(forward) > -3,
    );
    for (const result of [first, second]) {
      near(result.position.dot(up), 0.72, 2e-4);
      assert.ok(
        Math.abs(result.angularVelocity.dot(up)) > 0.3,
        'contact-induced yaw persists',
      );
      near(
        new T.Vector3(0, 1, 0).applyQuaternion(result.quaternion).dot(up),
        1,
      );
    }
  }
});

test('support frame updates do not tow free axes, and detachment preserves solved momentum', async (t) => {
  const world = await createRapierWorld({ gravity: 26 });
  t.after(() => world.dispose());
  const actor = world.createActor();
  actor.reset({
    pose: pose(new T.Vector3(0, 0.72, 0)),
    velocity: new T.Vector3(4, 0, 20),
    active: true,
    support: pose(new T.Vector3(0, 0.72, 0)),
  });
  actor.stage({
    support: pose(new T.Vector3(1000, 0.72, -1000)),
    angularAcceleration: new T.Vector3(0, 6, 0),
  });
  world.step(DT);
  const attached = actor.read();
  near(attached.position.x, 4 * DT);
  near(attached.position.z, 20 * DT);
  near(attached.position.y, 0.72);
  assert.ok(
    attached.angularVelocity.y > 0.04,
    'physical steering torque changes yaw',
  );
  actor.stage({ support: null });
  const released = actor.read();
  assert.deepEqual(released.position, attached.position);
  assert.deepEqual(released.velocity, attached.velocity);
  assert.deepEqual(released.quaternion, attached.quaternion);
  for (let tick = 0; tick < 30; tick++) world.step(DT);
  const airborne = actor.read();
  near(airborne.velocity.x, 4);
  near(airborne.velocity.z, 20);
  assert.ok(airborne.position.y < 0 && airborne.velocity.y < -6);
  assert.equal(airborne.support, null);
});

test('a changing local support normal follows a closed tube without setting the racer pose', async (t) => {
  const world = await createRapierWorld({ gravity: 0 });
  t.after(() => world.dispose());
  const actor = world.createActor();
  const radius = 80;
  const supportAt = (position) => {
    const up = new T.Vector3(position.x, position.y, 0).normalize();
    const forward = new T.Vector3(0, 0, 1);
    const right = up.clone().cross(forward);
    return pose(
      up.clone().multiplyScalar(radius),
      new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, up, forward),
      ),
    );
  };
  const initial = supportAt(new T.Vector3(radius, 0, 0));
  actor.reset({
    pose: initial,
    velocity: new T.Vector3(0, 60, 0),
    support: initial,
    active: true,
  });
  let maxRadiusError = 0;
  for (let tick = 0; tick < 5 * 120; tick++) {
    const before = actor.read();
    actor.stage({ support: supportAt(before.position) });
    world.step(DT);
    const result = actor.read();
    maxRadiusError = Math.max(
      maxRadiusError,
      Math.abs(Math.hypot(result.position.x, result.position.y) - radius),
    );
    const normal = new T.Vector3(
      result.position.x,
      result.position.y,
      0,
    ).normalize();
    assert.ok(
      new T.Vector3(0, 1, 0).applyQuaternion(result.quaternion).dot(normal) >
        0.999,
    );
  }
  assert.ok(maxRadiusError < 0.03, `tube constraint error ${maxRadiusError}`);
  assert.ok(
    actor.read().position.x < -50,
    'travels past the inverted half of the tube',
  );
});

test('capture can change the joint body frame without imposing orientation and restores that target exactly', async (t) => {
  const world = await createRapierWorld({ gravity: 0 });
  t.after(() => world.dispose());
  const actor = world.createActor();
  const inverted = new T.Quaternion().setFromAxisAngle(
    new T.Vector3(0, 0, 1),
    Math.PI,
  );
  const support = {
    ...pose(new T.Vector3(0, 3, 0)),
    bodyFrame: inverted.clone().invert(),
    normalCompliance: true,
  };
  actor.reset({
    pose: pose(support.position, inverted),
    support,
    active: true,
  });
  world.step(DT);
  assert.ok(
    new T.Vector3(0, 1, 0).applyQuaternion(actor.read().quaternion).y < -0.999,
    'the initial constraint matches the actual inverted attitude',
  );
  const saved = JSON.parse(JSON.stringify(world.snapshot()));
  const capture = () => {
    for (let tick = 1; tick <= 30; tick++) {
      actor.stage({
        support: {
          ...support,
          bodyFrame: inverted
            .clone()
            .invert()
            .slerp(identity(), Math.min(1, tick / 20)),
        },
      });
      world.step(DT);
    }
    return actor.read();
  };
  const expected = capture();
  assert.ok(
    new T.Vector3(0, 1, 0).applyQuaternion(expected.quaternion).y > 0.999,
    'the solver follows the evolving capture target',
  );
  world.restore(saved);
  assert.ok(actor.read().support.bodyFrame.angleTo(support.bodyFrame) < 1e-8);
  assert.deepEqual(capture(), expected);
});

test('ten interacting racers restore their joint/contact state and repeat the same solve', async (t) => {
  const world = await createRapierWorld({ gravity: 0 });
  t.after(() => world.dispose());
  const support = pose(new T.Vector3(0, 0.72, 0));
  const racers = Array.from({ length: 10 }, (_, index) => {
    const actor = world.createActor({ mass: index === 0 ? 2 : 1 });
    actor.reset({
      pose: pose(new T.Vector3(0, 0.72, index * 7.2)),
      velocity: new T.Vector3(0, 0, index === 0 ? 90 : 0),
      support,
      active: true,
    });
    return actor;
  });
  world.step(DT);
  const checkpoint = JSON.parse(JSON.stringify(world.snapshot()));
  const run = () => {
    for (let tick = 0; tick < 60; tick++) world.step(DT);
    return JSON.parse(JSON.stringify(racers.map((racer) => racer.read())));
  };
  const first = run();
  assert.ok(
    first[9].velocity.z > 10,
    'contact impulses propagate through the whole field',
  );
  near(
    first.reduce((sum, racer) => sum + racer.mass * racer.velocity.z, 0),
    180,
    0.02,
  );
  world.restore(checkpoint);
  assert.deepEqual(run(), first);
  world.reset();
  assert.ok(
    racers.every(
      (racer) => racer.read().support === null && !racer.read().active,
    ),
  );
});

test('CCD resolves a high-speed dynamic pair and unequal per-actor time fractions are rejected', async (t) => {
  const world = await createRapierWorld({ gravity: 0 });
  t.after(() => world.dispose());
  const racers = [-1, 1].map((sign) => {
    const actor = world.createActor();
    actor.reset({
      pose: pose(new T.Vector3(0, 0, sign * 8)),
      velocity: new T.Vector3(0, 0, -sign * 1000),
      active: true,
    });
    return actor;
  });
  world.step(DT);
  assert.ok(
    racers[0].read().position.z < racers[1].read().position.z,
    'whole hulls cannot tunnel through each other',
  );
  assert.ok(Math.abs(racers[0].read().velocity.z) < 1000);
  assert.throws(
    () => racers[0].stage({ fraction: 0.5 }),
    /share the complete world step/,
  );
});

test('centimetre hover-plane corrections preserve free forward momentum at race speed', async (t) => {
  const world = await createRapierWorld({ gravity: 0 });
  t.after(() => world.dispose());
  const actor = world.createActor();
  actor.setContactShape(getCollisionHull('kestrel'));
  for (const bank of [0, 0.38, Math.PI / 2, Math.PI]) {
    const rotation = new T.Quaternion().setFromEuler(
      new T.Euler(0.12, 0.6, bank),
    );
    const up = new T.Vector3(0, 1, 0).applyQuaternion(rotation);
    const forward = new T.Vector3(0, 0, 1).applyQuaternion(rotation);
    for (const speed of [80, 160]) {
      const initial = pose(new T.Vector3(300, 60, -200), rotation);
      actor.reset({
        pose: initial,
        velocity: forward.clone().multiplyScalar(speed),
        support: initial,
        active: true,
      });
      world.step(DT);
      const target = {
        ...initial,
        position: initial.position.clone().addScaledVector(up, 0.2),
      };
      actor.stage({ support: target });
      // Pending interpolation is simulation state too, including a save made
      // after input staging but before the shared native solve.
      const saved = JSON.parse(JSON.stringify(world.snapshot()));
      world.step(DT);
      const result = actor.read();
      near(result.velocity.dot(forward), speed, 0.03);
      world.restore(saved);
      world.step(DT);
      const restored = actor.read();
      for (const key of [
        'position',
        'quaternion',
        'velocity',
        'angularVelocity',
      ])
        assert.deepEqual(restored[key], result[key]);
      world.step(DT);
      world.step(DT);
      near(actor.read().velocity.dot(forward), speed, 0.03);
      near(
        actor.read().position.clone().sub(target.position).dot(up),
        0,
        0.003,
      );
    }
  }
});

// A gentle overtake on changing banking used to wedge Rook's sloped wing
// against Kestrel's rigid hover constraint: a 1.34 m/s contact produced a
// 1,045 Ns impulse and reversed Kestrel. Keep the actual chassis/frames.
test('sloped racer contact yields through the suspension without reversing race momentum', async (t) => {
  const entries = [
    {
      chassis: 'kestrel',
      pose: [
        [-37.631687164, 71.235801697, 280.537689209],
        [-0.097780392, 0.101856545, -0.079418905, 0.986791253],
      ],
      velocity: [13.952111244, 14.572119713, 76.586669922],
      angularVelocity: [-0.066201009, -0.46849677, 0.101200856],
      support: [
        [-37.621996564, 71.312983429, 280.521457311],
        [-0.093911467, 0.130479902, -0.0744057, 0.984184649],
      ],
      previousSupport: [
        [-37.749526692, 71.115089826, 279.90175366],
        [-0.095464789, 0.130087532, -0.082187827, 0.983467777],
      ],
      acceleration: [30.870291394, 29.103480264, 33.186731255],
      angularAcceleration: [0.895335897, 7.130990034, -1.499700783],
    },
    {
      chassis: 'rook',
      pose: [
        [-35.061183929, 72.173660278, 284.149749756],
        [-0.086517207, 0.079912066, -0.022690678, 0.992780924],
      ],
      velocity: [12.362453461, 13.787231445, 79.54234314],
      angularVelocity: [-0.005663715, -0.178474918, 0.031815659],
      support: [
        [-35.062020374, 72.108256199, 284.161004443],
        [-0.083471214, 0.134118836, -0.017721727, 0.987284475],
      ],
      previousSupport: [
        [-35.170661126, 72.05957786, 283.490339885],
        [-0.085164881, 0.133434312, -0.027331975, 0.987013268],
      ],
      acceleration: [12.439586667, 32.07515791, 36.228916924],
      angularAcceleration: [0.050487775, 3.94778329, -0.679331761],
    },
  ];
  for (const bank of [0, Math.PI / 2, Math.PI]) {
    const world = await createRapierWorld({ gravity: 0 });
    t.after(() => world.dispose());
    const rotation = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 0, 1),
      bank,
    );
    const vector = (values) =>
      new T.Vector3(...values).applyQuaternion(rotation);
    const frame = ([position, quaternion]) => ({
      position: vector(position),
      quaternion: rotation.clone().multiply(new T.Quaternion(...quaternion)),
    });
    const racers = entries.map((entry) => {
      const actor = world.createActor();
      actor.setContactShape(getCollisionHull(entry.chassis));
      actor.reset({
        active: true,
        pose: frame(entry.pose),
        velocity: vector(entry.velocity),
        angularVelocity: vector(entry.angularVelocity),
        support: frame(entry.previousSupport),
      });
      // The captured acceleration includes the ordinary gravity cancellation.
      const acceleration = [...entry.acceleration];
      acceleration[1] -= 26;
      actor.stage({
        support: frame(entry.support),
        acceleration: vector(acceleration),
        angularAcceleration: vector(entry.angularAcceleration),
      });
      return actor;
    });
    const before = racers.map((actor) => actor.read());
    world.step(DT);
    const after = racers.map((actor) => actor.read());
    assert.ok(
      after[0].contacts.some((contact) => contact.shape.kind === 'racer'),
      'real model hulls must touch',
    );
    for (let i = 0; i < racers.length; i++) {
      const direction = before[i].velocity.clone().normalize();
      assert.ok(
        Math.abs(
          after[i].velocity.dot(direction) - before[i].velocity.length(),
        ) < 2,
        'a glancing hit preserves forward pace',
      );
      assert.ok(
        after[i].velocity.distanceTo(before[i].velocity) < 4,
        'no explosive contact impulse',
      );
      assert.ok(after[i].angularVelocity.length() < 4, 'no induced spinout');
    }
    const saved = world.snapshot();
    assert.ok(saved.actors.every((actor) => actor.compliantSupport));
    world.step(DT);
    const solved = () =>
      racers.map((actor) => {
        const { position, quaternion, velocity, angularVelocity, contacts } =
          actor.read();
        return { position, quaternion, velocity, angularVelocity, contacts };
      });
    const expected = solved();
    world.restore(saved);
    world.step(DT);
    assert.deepEqual(
      solved(),
      expected,
      'contact compliance restores deterministically',
    );
    // Separating the pair must restore ordinary support, not leave soft
    // suspension enabled for the rest of the lap.
    racers[1].setPose({
      position: vector([1000, 0, 0]),
      quaternion: new T.Quaternion(),
    });
    for (let tick = 0; tick < 30; tick++) world.step(DT);
    assert.ok(
      world.snapshot().actors.every((actor) => !actor.compliantSupport),
    );
  }
});
