import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from 'three';
import { VESSELS } from '../src/game/vessels.js';
import { createBoatView } from '../src/world/BoatView.js';

function fixture() {
  const boat = {
    vessel: VESSELS[0],
    x: 22,
    z: 114,
    heading: Math.PI / 2,
    speed: 0,
    steer: 0,
  };
  const rules = { state: 'ready', elapsed: 0 };
  const scene = new Scene();
  const view = createBoatView(boat, rules);
  view.init({ scene });
  return { boat, rules, scene, view };
}

test('both sailing rigs produce finite render attributes and usable helm poses', () => {
  const { boat, rules, scene, view } = fixture();
  for (const vessel of VESSELS) {
    boat.vessel = vessel;
    view.selectVessel();
    assert.equal(view.stats.vesselId, vessel.id);
    scene.traverse((object) => {
      if (!object.geometry) return;
      for (const [name, attribute] of Object.entries(
        object.geometry.attributes,
      )) {
        assert.ok(
          Array.from(attribute.array).every(Number.isFinite),
          `${vessel.id}: ${name} contains a non-finite value`,
        );
      }
    });
    view.setCameraMode('captain');
    assert.equal(
      scene.getObjectByName('Captain head and torso').visible,
      false,
    );
    for (const values of Object.values(view.getHelmPose()))
      assert.ok(values.every(Number.isFinite));
    rules.state = 'running';
    boat.steer = 1;
    for (let i = 0; i < 90; i++) view.update(1 / 60);
    assert.ok(view.stats.wheelAngle > 1.9);
    boat.steer = -1;
    for (let i = 0; i < 90; i++) view.update(1 / 60);
    assert.ok(view.stats.wheelAngle < -1.9);
  }
  view.dispose();
  assert.equal(scene.children.length, 0);
});

test('repeated fleet selection releases replaced ship meshes and disposal is idempotent', () => {
  const { boat, scene, view } = fixture();
  const root = scene.getObjectByName('Tidebreak sailing vessel');
  const disposed = new Map();
  for (let i = 0; i < 4; i++) {
    const previous = root.children[0];
    const resources = new Set();
    previous.traverse((object) => {
      if (object.geometry) resources.add(object.geometry);
      if (object.material) resources.add(object.material);
    });
    for (const resource of resources) {
      disposed.set(resource, 0);
      resource.addEventListener('dispose', () =>
        disposed.set(resource, disposed.get(resource) + 1),
      );
    }
    boat.vessel = VESSELS[(i + 1) % VESSELS.length];
    view.selectVessel();
    assert.equal(root.children.length, 1);
    assert.equal(scene.children.length, 3);
    assert.equal(previous.parent, null);
    for (const resource of resources) assert.equal(disposed.get(resource), 1);
  }
  view.dispose();
  view.dispose();
  assert.equal(scene.children.length, 0);
  for (const count of disposed.values()) assert.equal(count, 1);
});
