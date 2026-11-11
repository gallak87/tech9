import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createVesperSapEffects, withVesperSapEffects } from './sap-effects.js';

function fixture() {
  const geometry = new T.BoxGeometry(4, 2, 7);
  const material = new T.MeshStandardMaterial();
  const ship = { group: new T.Group() };
  ship.group.add(new T.Mesh(geometry, material));
  ship.group.position.set(250, 32, -180);
  ship.group.rotation.set(0.1, 0.6, -0.2);
  ship.group.userData.bounds = {
    min: [-2, -0.2, -3.5],
    max: [2, 1.8, 3.5],
  };
  return {
    frame: {
      ship,
      mode: 'racing',
      time: 2.7,
      state: { speed: 90 },
      motion: { motion: { mode: 'magnetic', surface: { id: 'sap' } } },
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

test('sap contact uses a gold hull coat and bounded droplets, freezes when paused and clears on safe road or flight', () => {
  const effect = createVesperSapEffects();
  const { frame, dispose } = fixture();
  effect.update(frame);
  assert.equal(effect.group.visible, true);
  const droplets = effect.group.children[0];
  const positions = Array.from(droplets.instanceMatrix.array);
  assert.ok(positions.every(Number.isFinite));
  assert.equal(droplets.count, 32);
  const outline = frame.ship.group.children.find((node) =>
    /hull contact envelope/.test(node.name),
  );
  assert.equal(outline.visible, true);
  assert.equal(
    outline.children[0].material.uniforms.color.value.getHex(),
    0xffd256,
  );
  assert.equal(
    frame.ship.group.children[0].material.color.getHex(),
    0xffffff,
    'shared hull finish is borrowed',
  );
  effect.update({ ...frame, mode: 'paused' });
  assert.deepEqual(Array.from(droplets.instanceMatrix.array), positions);
  effect.update({ ...frame, settings: { quality: 'low' } });
  assert.equal(droplets.count, 12);
  assert.equal(effect.group.visible, true, 'Low retains visible sap contact');
  effect.update({ ...frame, settings: { reducedMotion: true } });
  assert.equal(effect.group.visible, false);
  assert.equal(
    outline.visible,
    true,
    'reduced motion retains the static contact coat',
  );
  for (const change of [
    { motion: { mode: 'magnetic', surface: { id: 'resin' } } },
    { motion: { mode: 'airborne', surface: { id: 'sap' } } },
    { mode: 'inspection' },
    { reviewing: true },
  ]) {
    effect.update({ ...frame, ...change });
    assert.equal(effect.group.visible, false);
    assert.equal(outline.visible, false);
  }
  effect.update(frame);
  effect.reset();
  assert.equal(effect.group.visible, false);
  assert.equal(outline.visible, false);
  effect.dispose();
  dispose();
});

test('sap wrapper releases every owned effect once before its environment and preserves borrowed hull geometry', () => {
  const group = new T.Group();
  let released = 0;
  const wrapped = withVesperSapEffects({
    group,
    dispose() {
      assert.equal(group.children.length, 0);
      released++;
    },
  });
  const { frame, dispose } = fixture();
  let hullReleased = 0;
  frame.ship.group.children[0].geometry.addEventListener(
    'dispose',
    () => hullReleased++,
  );
  wrapped.update(frame);
  const resources = new Set();
  group.traverse((node) => {
    if (node.isInstancedMesh) resources.add(node);
    if (node.geometry) resources.add(node.geometry);
    if (node.material) resources.add(node.material);
  });
  const outline = frame.ship.group.children.find((node) =>
    /hull contact envelope/.test(node.name),
  );
  resources.add(outline.children[0].material);
  const counts = new Map([...resources].map((resource) => [resource, 0]));
  for (const resource of resources)
    resource.addEventListener('dispose', () =>
      counts.set(resource, counts.get(resource) + 1),
    );
  wrapped.dispose();
  wrapped.dispose();
  assert.equal(released, 1);
  assert.equal(hullReleased, 0);
  assert.equal(outline.parent, null);
  for (const value of counts.values()) assert.equal(value, 1);
  dispose();
});
