import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, PerspectiveCamera, Scene, Vector3 } from 'three';
import {
  VehicleMotion,
  VEHICLE_PRESETS,
} from '../modules/vehicle-motion/src/VehicleMotion.js';
import { VehiclePresentation } from '../modules/vehicle-presentation/src/VehiclePresentation.js';
import { FollowCamera } from '../modules/follow-camera/src/FollowCamera.js';
import { resolveCameraBoom } from '../modules/follow-camera/src/CameraBoom.js';

for (const [name, config] of Object.entries(VEHICLE_PRESETS)) {
  test(`${name} motion snapshots drive canonical presentation and camera together`, () => {
    const scene = new Scene(),
      root = new Group();
    scene.add(root);
    const world = {
      height: (x, z) => x * 0.04 + Math.sin(z * 0.15) * 0.3,
      surface: () => ({ kind: 'gravel', grip: 0.8, roughness: 0.2 }),
      bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
      colliders: [{ x: -6, z: 8, radius: 1 }],
    };
    const motion = new VehicleMotion({ config, world });
    const wheels = [];
    for (const front of [true, false]) {
      for (const side of config.layout === 'two-wheel' ? [0] : [-1, 1]) {
        const hub = new Group(),
          steering = new Group(),
          spin = new Group();
        hub.position.set(
          (side * config.dimensions.track) / 2,
          config.wheelRadius,
          ((front ? -1 : 1) * config.dimensions.wheelBase) / 2,
        );
        root.add(hub);
        hub.add(steering);
        steering.add(spin);
        wheels.push({ hub, steering, spin, front });
      }
    }
    const pose = new VehiclePresentation({
      root,
      wheels,
      wheelRadius: config.wheelRadius,
      suspension: config.suspension,
    });
    const camera = new PerspectiveCamera();
    const view = new FollowCamera(camera, {
      getTarget: () => motion.snapshot(),
      groundHeight: world.height,
      resolvePosition: (position, subject) =>
        resolveCameraBoom(
          { x: subject.x, y: subject.y + 1.65, z: subject.z },
          position,
          { groundHeight: world.height, colliders: world.colliders },
        ),
    });
    for (let i = 0; i < 240; i++) {
      const snapshot = motion.update(1 / 120, { throttle: 1, steer: 0.2 });
      pose.update(snapshot, 1 / 120);
      view.update(1 / 120);
      for (const [index, wheel] of wheels.entries()) {
        const actual = wheel.hub.getWorldPosition(new Vector3());
        assert.ok(actual.distanceTo(snapshot.contacts[index]) < 1e-8);
      }
      assert.ok(
        camera.position.y >=
          world.height(camera.position.x, camera.position.z) + 1,
      );
      assert.ok(camera.matrixWorld.elements.every(Number.isFinite));
    }
    const final = motion.snapshot();
    assert.ok(final.distance > 5);
    assert.ok(final.heading > 0.1);
    if (config.layout === 'two-wheel') assert.ok(final.lean < 0);
    pose.dispose();
    view.dispose();
    assert.equal(root.parent, scene);
  });
}
