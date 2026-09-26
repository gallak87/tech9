import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, PerspectiveCamera, Scene, Vector3 } from 'three';
import { createSailingShip } from '../src/SailingShipModel.js';
import { SHIP_PRESETS, getShipPreset } from '../src/presets.js';
import { FollowCamera } from '../../follow-camera/src/FollowCamera.js';

test('both supported ships steer, switch captain visibility and release owned assets', () => {
  const scene = new Scene();
  for (const profile of SHIP_PRESETS) {
    const ship = createSailingShip(profile.id);
    scene.add(ship.group);
    assert.equal(ship.profile, profile);
    assert.ok(Object.isFrozen(profile));
    const resources = new Set();
    ship.group.traverse((object) => {
      if (object.geometry) {
        resources.add(object.geometry);
        for (const attribute of Object.values(object.geometry.attributes))
          assert.ok(attribute.array.every(Number.isFinite));
      }
      for (const material of [object.material].flat().filter(Boolean)) {
        resources.add(material);
        for (const value of Object.values(material))
          if (value?.isTexture) resources.add(value);
      }
    });
    const captain = ship.group.getObjectByName('Captain head and torso');
    ship.setView('captain');
    assert.equal(captain.visible, false);
    for (const steer of [1, -1]) {
      let angle;
      for (let i = 0; i < 90; i++) angle = ship.update(1 / 60, steer * 10);
      assert.ok(angle * steer > 1.9 && Math.abs(angle) <= 2.05);
    }
    ship.setView('outside');
    assert.equal(captain.visible, true);
    ship.reset();
    assert.equal(ship.update(0), 0);
    assert.throws(() => ship.update(NaN), /finite/);
    assert.throws(() => ship.update(-1), /finite/);
    assert.throws(() => ship.update(0.1, Infinity), /finite/);
    assert.throws(() => ship.setView('orbit'), /view/);
    const counts = new Map();
    for (const resource of resources) {
      counts.set(resource, 0);
      resource.addEventListener('dispose', () =>
        counts.set(resource, counts.get(resource) + 1),
      );
    }
    ship.dispose();
    ship.dispose();
    ship.update(0.1, 1);
    ship.setView('captain');
    ship.reset();
    assert.equal(ship.group.parent, null);
    assert.equal(scene.children.length, 0);
    for (const count of counts.values()) assert.equal(count, 1);
  }
  assert.throws(() => getShipPreset('dinghy'), /Unknown/);
  assert.throws(() => createSailingShip({ length: 90 }), /Unknown/);
});

test('helm attachment follows moved/rolled parents and plugs into the existing mounted camera', () => {
  const ship = createSailingShip();
  const local = ship.getHelmPose();
  const scene = new Scene(),
    parent = new Group();
  scene.add(parent);
  parent.add(ship.group);
  parent.position.set(23, 7, -15);
  parent.rotation.set(0.1, 1.2, -0.2);
  ship.group.position.set(4, 2, 9);
  ship.group.rotation.y = 0.7;
  // Caller need not run a render first to obtain a correct world-space pose.
  const pose = ship.getHelmPose();
  const expected = new Vector3()
    .fromArray(local.position)
    .applyMatrix4(ship.group.matrixWorld);
  assert.ok(expected.distanceTo(new Vector3().fromArray(pose.position)) < 1e-8);
  assert.ok(Math.abs(new Vector3().fromArray(pose.up).length() - 1) < 1e-8);
  const camera = new PerspectiveCamera();
  const view = new FollowCamera(camera, {
    getTarget: () => ({ x: 0, z: 0, heading: 0 }),
    mounted: { getPose: ship.getHelmPose },
  });
  view.setMode('mounted');
  view.update(0.01);
  assert.ok(camera.position.distanceTo(expected) < 1e-8);
  parent.position.x += 13;
  view.update(0.01);
  assert.ok(
    camera.position.distanceTo(expected.add(new Vector3(13, 0, 0))) < 1e-8,
  );
  view.dispose();
  ship.dispose();
});
