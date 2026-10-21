import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Scene, Vector3 } from 'three';
import { createVehicle, VEHICLE_PRESETS } from '../src/index.js';

const world = () => ({
  height: (x, z) => x * 0.07 - z * 0.05,
  bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
});
for (const type of Object.keys(VEHICLE_PRESETS)) {
  test(`${type} public factory drives, articulates, teleports and releases its model under a rigid parent`, () => {
    const terrain = world();
    const vehicle = createVehicle({
      type,
      world: terrain,
      spawn: { x: 8, z: 6, heading: 0.4 },
    });
    const scene = new Scene(),
      parent = new Group();
    parent.position.set(7, 3, -11);
    parent.rotation.set(0.1, 0.8, -0.1);
    scene.add(parent);
    parent.add(vehicle.group);
    try {
      const first = vehicle.snapshot();
      for (let i = 0; i < 90; i++)
        vehicle.update(1 / 60, { throttle: 1, steer: 0.35 });
      const state = vehicle.snapshot();
      assert.equal(state.vehicle, type);
      assert.ok(Object.isFrozen(state) && Object.isFrozen(state.contacts[0]));
      assert.equal(first.distance, 0);
      assert.ok(state.distance > 5 && state.heading > first.heading);
      assert.ok(
        vehicle.group.getWorldPosition(new Vector3()).distanceTo(state) < 1e-8,
      );
      let index = 0;
      for (const axle of ['front', 'rear'])
        for (const side of type === 'bike' ? ['center'] : ['left', 'right']) {
          const actual = vehicle.group
            .getObjectByName(`${axle}-${side}-suspension`)
            .getWorldPosition(new Vector3());
          const contact = state.contacts[index++];
          assert.ok(actual.distanceTo(contact) < 1e-8);
          assert.ok(
            Math.abs(
              actual.y -
                terrain.height(actual.x, actual.z) -
                VEHICLE_PRESETS[type].wheelRadius,
            ) < 1e-8,
          );
        }
      vehicle.setDriverView(true);
      assert.ok(
        Object.values(vehicle.mountedPose()).flat().every(Number.isFinite),
      );
      vehicle.setDriverView(false);
      const recovered = vehicle.recover();
      assert.equal(recovered.speed, 0);
      assert.ok(
        vehicle.group.getWorldPosition(new Vector3()).distanceTo(recovered) <
          1e-8,
      );
      const reset = vehicle.reset({ x: -10, z: 20, heading: -1 });
      assert.equal(reset.x, -10);
      assert.equal(reset.distance, 0);
      assert.equal(reset.wheelSpin, 0);
      assert.ok(
        vehicle.group.getWorldPosition(new Vector3()).distanceTo(reset) < 1e-8,
      );
      vehicle.update(0, {});
    } finally {
      vehicle.dispose();
    }
    vehicle.dispose();
    assert.equal(vehicle.group.parent, null);
    assert.equal(parent.children.length, 0);
    assert.throws(() => vehicle.update(0), /disposed/);
    assert.throws(() => vehicle.mountedPose(), /disposed/);
  });
}

test('factory validates public inputs and keeps model-dependent tuning fixed', () => {
  for (const type of ['fourWheel', '__proto__', [], null])
    assert.throws(() => createVehicle({ type, world: world() }), /type/);
  for (const handling of [
    null,
    [],
    { wheelRadius: 0.8 },
    { dimensions: {} },
    { suspension: 1 },
    { unknown: 2 },
  ])
    assert.throws(
      () => createVehicle({ world: world(), handling }),
      /handling/,
    );
  assert.throws(
    () => createVehicle({ world: world(), lighting: {} }),
    /lighting/,
  );
  const handling = { topSpeed: 3 };
  const vehicle = createVehicle({ world: world(), handling });
  try {
    handling.topSpeed = 100;
    for (let i = 0; i < 90; i++) vehicle.update(1 / 60, { throttle: 1 });
    assert.ok(vehicle.snapshot().speed <= 3);
    const state = vehicle.snapshot();
    for (const dt of [-1, Infinity, NaN])
      assert.throws(() => vehicle.update(dt), /dt/);
    assert.throws(() => vehicle.update(0.1, null), /controls/);
    assert.equal(vehicle.snapshot(), state);
    assert.throws(() => vehicle.reset({ x: NaN, z: 0, heading: 0 }), /Spawn/);
    assert.equal(vehicle.snapshot(), state);
  } finally {
    vehicle.dispose();
  }
});

test('failed lighting initialization releases the partially created model', () => {
  const owned = new Set();
  let disposed = 0;
  const lighting = {
    apply(group) {
      group.traverse((part) => {
        if (part.geometry) owned.add(part.geometry);
      });
      for (const geometry of owned)
        geometry.addEventListener('dispose', () => disposed++);
      throw new Error('environment unavailable');
    },
  };
  assert.throws(
    () => createVehicle({ world: world(), lighting }),
    /environment unavailable/,
  );
  assert.ok(owned.size > 0);
  assert.equal(disposed, owned.size);
});
