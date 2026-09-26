import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BoxGeometry,
  Euler,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { VehiclePresentation } from '../src/VehiclePresentation.js';

const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const vectorClose = (actual, expected) =>
  actual.toArray().forEach((value, index) => close(value, expected[index]));
const pose = (extra = {}) => ({ x: 10, y: 3, z: -8, heading: 0, ...extra });

function fixture(count = 4, nested = false) {
  const scene = new Group();
  const root = new Group();
  scene.add(root);
  const wheels = Array.from({ length: count }, (_, index) => {
    const front = index < count / 2;
    const parent = nested ? new Group() : root;
    if (nested) {
      parent.position.set(0.5, 0.1, 0.2);
      parent.rotation.set(0.1, 0.3, -0.2);
      parent.scale.set(1.2, 0.8, 0.9);
      root.add(parent);
    }
    const hub = new Group(),
      steering = new Group(),
      spin = new Group();
    hub.position.set(
      count === 2 ? 0 : index % 2 ? 0.8 : -0.8,
      0.4,
      front ? -1 : 1,
    );
    parent.add(hub);
    hub.add(steering);
    steering.add(spin);
    return { hub, steering, spin, front };
  });
  const presentation = new VehiclePresentation({
    root,
    wheels,
    wheelRadius: 0.4,
    suspension: 0.2,
  });
  return { scene, root, wheels, presentation };
}

test('chassis world pose follows heading, pitch, roll and lean under a rigid scene parent', () => {
  const { scene, root, presentation } = fixture();
  scene.position.set(-30, 12, 5);
  scene.rotation.set(0.2, 0.8, -0.1);
  presentation.update(
    pose({ heading: 0.5, pitch: 0.2, roll: -0.1, lean: -0.15 }),
  );
  vectorClose(root.getWorldPosition(new Vector3()), [10, 3, -8]);
  const expected = new Quaternion().setFromEuler(
    new Euler(0.2, -0.5, -0.25, 'YXZ'),
  );
  close(Math.abs(root.getWorldQuaternion(new Quaternion()).dot(expected)), 1);
  presentation.update(pose({ heading: Math.PI / 2 }));
  vectorClose(
    new Vector3(0, 0, -1).applyQuaternion(
      root.getWorldQuaternion(new Quaternion()),
    ),
    [1, 0, 0],
  );
});

for (const count of [2, 4]) {
  test(`${count} world wheel contacts are exact through nested, rotated, scaled parents`, () => {
    const { root, wheels, presentation } = fixture(count, true);
    const contacts = wheels.map((_, index) => ({
      x: 8 + index * 0.7,
      y: 3.1 + index * 0.2,
      z: -9 + index,
      compression: 0.1,
    }));
    presentation.update(
      pose({
        pitch: 0.3,
        roll: 0.1,
        heading: 0.9,
        contacts,
        steer: 0.28,
        wheelSpin: 10,
      }),
    );
    wheels.forEach((wheel, index) => {
      const contact = contacts[index];
      vectorClose(wheel.hub.getWorldPosition(new Vector3()), [
        contact.x,
        contact.y,
        contact.z,
      ]);
      close(wheel.steering.rotation.y, wheel.front ? -0.28 : 0);
      close(wheel.spin.rotation.x, -10);
    });
    vectorClose(root.getWorldPosition(new Vector3()), [10, 3, -8]);
  });
}

test('missing world contacts restore independent rest positions with clamped compression', () => {
  const { wheels, presentation } = fixture(2);
  presentation.update(
    pose({
      contacts: [
        { x: 100, y: 100, z: 100 },
        { x: 100, y: 100, z: 100 },
      ],
    }),
  );
  presentation.update(
    pose({ contacts: [{ compression: 9 }, { compression: -9 }] }),
  );
  vectorClose(wheels[0].hub.position, [0, 0.6, -1]);
  vectorClose(wheels[1].hub.position, [0, 0.2, 1]);
  presentation.update(pose());
  vectorClose(wheels[0].hub.position, [0, 0.4, -1]);
  vectorClose(wheels[1].hub.position, [0, 0.4, 1]);
});

test('fallback spin integrates signed speed, clamps elapsed time and resumes explicit spin', () => {
  const { wheels, presentation } = fixture();
  presentation.update(pose({ speed: 4 }), 10);
  close(wheels[0].spin.rotation.x, -1);
  presentation.update(pose({ speed: -4 }), 0.05);
  close(wheels[0].spin.rotation.x, -0.5);
  presentation.update(pose({ wheelSpin: 20, speed: 4 }), 0.1);
  close(wheels[0].spin.rotation.x, -20);
  presentation.update(pose({ speed: 4 }), 0.1);
  close(wheels[0].spin.rotation.x, -21);
});

test('dispose leaves consumer resources, hierarchy and transforms intact and is idempotent', () => {
  const { scene, root, wheels, presentation } = fixture();
  const geometry = new BoxGeometry(),
    material = new MeshBasicMaterial();
  const mesh = new Mesh(geometry, material);
  wheels[0].spin.add(mesh);
  let disposed = 0;
  geometry.addEventListener('dispose', () => disposed++);
  material.addEventListener('dispose', () => disposed++);
  presentation.update(pose());
  presentation.dispose();
  presentation.dispose();
  presentation.update(pose({ x: 100 }));
  assert.equal(disposed, 0);
  assert.equal(root.parent, scene);
  assert.equal(mesh.parent, wheels[0].spin);
  assert.equal(root.position.x, 10);
  geometry.dispose();
  material.dispose();
  assert.equal(disposed, 2);
});

test('constructor rejects invalid layouts, shared nodes, missing hierarchy and settings', () => {
  const { root, wheels } = fixture();
  const create = (extra) =>
    new VehiclePresentation({ root, wheels, wheelRadius: 0.4, ...extra });
  for (const extra of [
    { root: null },
    { wheels: [] },
    { wheels: wheels.slice(0, 3) },
    { wheelRadius: 0 },
    { wheelRadius: NaN },
    { suspension: -1 },
    { wheels: [wheels[0], wheels[0]] },
    { wheels: wheels.map((wheel) => ({ ...wheel, front: true })) },
    { wheels: wheels.map((wheel) => ({ ...wheel, front: 1 })) },
  ])
    assert.throws(() => create(extra));
  wheels[0].hub.remove(wheels[0].steering);
  assert.throws(() => create({}), /hierarchy/);
});

test('updates reject malformed data before changing the chassis', () => {
  const { root, presentation } = fixture(2);
  presentation.update(pose());
  for (const snapshot of [
    null,
    pose({ x: NaN }),
    pose({ steer: Infinity }),
    pose({ contacts: [] }),
    pose({ wheelSpin: null }),
    pose({ contacts: [{ x: 0, y: 0 }, null] }),
    pose({ contacts: [{ compression: NaN }, null] }),
  ])
    assert.throws(() => presentation.update(snapshot));
  for (const dt of [-1, NaN, Infinity])
    assert.throws(() => presentation.update(pose({ x: 100 }), dt));
  assert.equal(root.position.x, 10);
});

test('updates reject reparented wheels, singular wheel parents and unsupported root transforms', () => {
  const { scene, root, wheels, presentation } = fixture(2, true);
  scene.scale.setScalar(2);
  assert.throws(() => presentation.update(pose()), /unit scale/);
  scene.scale.setScalar(1);
  scene.position.x = Infinity;
  assert.throws(() => presentation.update(pose()), /rigid transforms/);
  scene.position.x = 0;
  wheels[0].hub.parent.scale.x = 0;
  assert.throws(() => presentation.update(pose()), /invertible/);
  wheels[0].hub.parent.scale.x = 1;
  root.matrixAutoUpdate = false;
  assert.throws(() => presentation.update(pose()), /matrixAutoUpdate/);
  root.matrixAutoUpdate = true;
  scene.add(wheels[0].hub);
  assert.throws(() => presentation.update(pose()), /descend/);
});

test('wheel articulation chains cannot contain another wheel hub', () => {
  const { root, wheels, presentation } = fixture(2);
  wheels[0].spin.add(wheels[1].hub);
  assert.throws(() => presentation.update(pose()), /another wheel/);
  assert.throws(
    () => new VehiclePresentation({ root, wheels, wheelRadius: 0.4 }),
    /another wheel/,
  );
});

test('finite inputs that overflow combined rotation or spin are rejected', () => {
  const { root, wheels, presentation } = fixture(2);
  assert.throws(
    () =>
      presentation.update(
        pose({ roll: Number.MAX_VALUE, lean: Number.MAX_VALUE }),
      ),
    /remain finite/,
  );
  const tinyWheels = new VehiclePresentation({
    root,
    wheels,
    wheelRadius: Number.MIN_VALUE,
  });
  assert.throws(
    () => tinyWheels.update(pose({ speed: 10 }), 0.1),
    /remain finite/,
  );
  assert.equal(root.position.x, 0);
});
