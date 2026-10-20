import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AdditiveBlending,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import { createArcHitFeedback } from './arc-hit-feedback.js';

test('Arc response follows the complete hull, with a blue halo and a soft bounded envelope', () => {
  const ship = new Group();
  const wing = new Group();
  wing.position.set(2, 0.2, -1);
  wing.rotation.y = 0.2;
  const geometry = new BoxGeometry();
  const original = new MeshBasicMaterial({ color: 0x777777 });
  const body = new Mesh(geometry, original);
  const tip = new Mesh(geometry, original);
  const plume = new Mesh(
    geometry,
    new MeshBasicMaterial({ transparent: true }),
  );
  wing.add(tip);
  ship.add(body, wing, plume);
  const color = original.color.clone();
  const feedback = createArcHitFeedback(ship);
  assert.equal(
    feedback.group.children.length,
    4,
    'outline + glow for both opaque hull parts',
  );
  assert.equal(feedback.group.visible, false);
  const glow = feedback.group.children.find(
    (mesh) => mesh.material.blending === AdditiveBlending,
  );
  assert.ok(glow);
  assert.ok(
    glow.material.uniforms.color.value.b > glow.material.uniforms.color.value.r,
  );
  feedback.update(0);
  assert.equal(
    glow.material.uniforms.strength.value,
    0,
    'no abrupt flash on contact',
  );
  feedback.update(0.08);
  assert.equal(glow.material.uniforms.strength.value, 1);
  feedback.update(0.08, { reducedMotion: true });
  assert.equal(glow.material.uniforms.strength.value, 0.45);
  feedback.update(0.08);
  assert.equal(
    glow.material.uniforms.strength.value,
    1,
    'paused age keeps a stable brightness',
  );
  ship.position.set(10, 4, -9);
  ship.rotation.y = 1;
  feedback.update(0.3);
  ship.updateMatrixWorld(true);
  const overlay = feedback.group.children[2];
  assert.ok(
    overlay
      .getWorldPosition(new Vector3())
      .distanceTo(tip.getWorldPosition(new Vector3())) < 1e-10,
  );
  assert.ok(glow.material.uniforms.strength.value < 0.6);
  assert.ok(
    original.color.equals(color),
    'base materials are never tinted or replaced',
  );
  feedback.update(0.55);
  assert.equal(feedback.group.visible, false);
  let geometryDisposals = 0,
    materialDisposals = 0;
  geometry.addEventListener('dispose', () => geometryDisposals++);
  for (const material of new Set(
    feedback.group.children.map((mesh) => mesh.material),
  ))
    material.addEventListener('dispose', () => materialDisposals++);
  feedback.dispose();
  feedback.dispose();
  assert.equal(
    geometryDisposals,
    0,
    'the ship still owns its borrowed geometry',
  );
  assert.equal(materialDisposals, 2);
  assert.equal(feedback.group.parent, null);
  geometry.dispose();
  original.dispose();
  plume.material.dispose();
});
