import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Raycaster, Vector3, Texture } from 'three';
import { createVehicleModel } from '../src/vehicles/VehicleModel.js';
import { VehicleMotion } from '../src/driving/VehicleMotion.js';

for (const vehicle of ['jeep', 'atv', 'bike']) {
  test(`${vehicle} rebuilt assets retain terrain contacts and finite mounted views`, () => {
    const model = createVehicleModel(vehicle);
    const motion = new VehicleMotion({
      vehicle,
      world: {
        height: (x, z) => x * 0.12 - z * 0.09,
        surface: () => ({ kind: 'trail', grip: 1, roughness: 0 }),
        colliders: [],
        bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
      },
      spawn: { x: 10, z: 10, heading: 0.35 },
    });
    for (let i = 0; i < 90; i++)
      motion.update(1 / 60, { throttle: 1, steer: 0.6 });
    const snapshot = motion.snapshot();
    model.update(snapshot, 1 / 60);
    const sides = vehicle === 'bike' ? ['center'] : ['left', 'right'];
    let index = 0;
    for (const axle of ['front', 'rear'])
      for (const side of sides) {
        const wheel = model.group.getObjectByName(`${axle}-${side}-suspension`);
        assert.ok(wheel, 'contact hierarchy remains inspectable');
        assert.ok(
          wheel
            .getWorldPosition(new Vector3())
            .distanceTo(snapshot.contacts[index++]) < 1e-7,
        );
      }
    const pose = model.mountedPose();
    for (const vector of [pose.position, pose.target, pose.up])
      assert.ok(vector.every(Number.isFinite));
    model.setDriverView(true);
    model.update(snapshot, 1 / 60);
    model.setDriverView(false);
    model.group.traverse((object) => {
      assert.ok(object.matrixWorld.elements.every(Number.isFinite));
      if (!object.geometry) return;
      for (const name of ['position', 'normal']) {
        const attribute = object.geometry.getAttribute(name);
        if (attribute) assert.ok(attribute.array.every(Number.isFinite));
      }
    });
    model.dispose();
  });

  test(`${vehicle} model disposes owned resources once and preserves borrowed reflections`, () => {
    const model = createVehicleModel(vehicle);
    const borrowed = new Texture();
    let borrowedDisposals = 0;
    borrowed.addEventListener('dispose', () => borrowedDisposals++);
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    model.group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of object.material
        ? Array.isArray(object.material)
          ? object.material
          : [object.material]
        : []) {
        materials.add(material);
        for (const [key, value] of Object.entries(material))
          if (key !== 'envMap' && value?.isTexture) textures.add(value);
        material.envMap = borrowed;
      }
    });
    const releases = new Map();
    for (const resource of [...geometries, ...materials, ...textures]) {
      releases.set(resource, 0);
      resource.addEventListener('dispose', () =>
        releases.set(resource, releases.get(resource) + 1),
      );
    }
    model.dispose();
    model.dispose();
    for (const count of releases.values()) assert.equal(count, 1);
    assert.equal(borrowedDisposals, 0);
    assert.equal(model.group.children.length, 0);
    borrowed.dispose();
  });
}

// Sample the rendered sole/support geometry instead of asserting authored anchor
// constants, so changes to boot shape or foot platforms cannot silently sink feet.
for (const vehicle of ['atv', 'bike']) {
  test(`${vehicle} boot soles stay planted above rendered supports`, () => {
    const model = createVehicleModel(vehicle);
    try {
      const boots = [];
      model.group.traverse((part) => {
        if (part.name === 'formed-motocross-boot') boots.push(part);
      });
      assert.equal(boots.length, 2);
      const body = model.group.getObjectByName('body');
      const down = new Vector3(0, -1, 0);
      for (const airborne of [false, true]) {
        for (const steer of [-1, 0, 1]) {
          for (let frame = 0; frame < 20; frame++)
            model.update(
              { x: 0, y: 0, z: 0, speed: 12, airborne, steer },
              1 / 60,
            );
          for (const boot of boots) {
            const bounds = new Box3().setFromObject(boot);
            const center = bounds.getCenter(new Vector3());
            let closest = Infinity;
            for (let sample = 1; sample < 50; sample++) {
              const z =
                bounds.min.z + ((bounds.max.z - bounds.min.z) * sample) / 50;
              const ray = new Raycaster(
                new Vector3(center.x, bounds.min.y + 0.008, z),
                down,
                0,
                0.04,
              );
              const hit = ray.intersectObject(body, true)[0];
              if (hit) closest = Math.min(closest, hit.distance - 0.008);
            }
            assert.ok(
              closest >= -0.001 && closest <= 0.008,
              `${vehicle} sole needs contact without penetration; support gap=${closest}`,
            );
          }
        }
      }
    } finally {
      model.dispose();
    }
  });
}
