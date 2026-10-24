import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { COMBAT_RULES } from './combat.js';
import { createCombatPresentation } from './combat-presentation.js';
import { createShipFeedbackPresentation } from './ship-feedback.js';
import { pickupPreviewFrame } from '../ships/pickup-preview-sequence.js';
import { createIonRibbon } from './ion-ribbon.js';
import { disposeGroup } from './geometry.js';

test('Ion deposits distinct glow nodes at wake endpoints, with joined depth and bounded lifetime', () => {
  const root = new T.Group();
  const ribbon = createIonRibbon(root);
  const state = {
    time: 1,
    emitters: {},
    wakes: [
      {
        a: [0, 2, -20],
        b: [0, 2, -10],
        quaternion: [0, 0, 0, 1],
        age: 0.2,
        burst: 1,
      },
      {
        a: [0, 2, -10],
        b: [2, 2, 0],
        quaternion: [0, 0, 0, 1],
        age: 0.1,
        burst: 1,
      },
    ],
  };
  ribbon.update(state, {}, false);
  const [mesh, nodes] = root.children;
  assert.equal(nodes.count, 2);
  assert.equal(mesh.geometry.drawRange.count, 24);
  const matrix = new T.Matrix4(),
    position = new T.Vector3();
  nodes.getMatrixAt(1, matrix);
  assert.deepEqual(
    position.setFromMatrixPosition(matrix).toArray(),
    state.wakes[1].b,
  );
  const vertices = mesh.geometry.getAttribute('position');
  const at = (index) => new T.Vector3().fromBufferAttribute(vertices, index);
  assert.ok(
    at(1).distanceTo(at(12)) < 1e-6,
    'horizontal faces share bend corners',
  );
  assert.ok(
    at(7).distanceTo(at(18)) < 1e-6,
    'vertical glow shares the bend too',
  );
  assert.ok([...vertices.array].every(Number.isFinite));
  const initialLife = nodes.geometry.getAttribute('pulseLife').getX(0);
  ribbon.update(state, {}, true);
  assert.ok(nodes.geometry.getAttribute('pulseLife').getX(0) < initialLife);
  assert.equal(mesh.material.uniforms.time.value, 0);
  state.wakes = [];
  ribbon.update(state, {}, false);
  assert.equal(nodes.count, 0);
  assert.equal(mesh.geometry.drawRange.count, 0);
  let released = 0;
  nodes.addEventListener('dispose', () => released++);
  ribbon.dispose();
  disposeGroup(root);
  assert.equal(released, 1);
});

test('Arc streaks grow forward from beneath the hull, including rotated ship frames', () => {
  const scene = new T.Group();
  const pose = {
    position: new T.Vector3(20, 30, 40),
    quaternion: new T.Quaternion().setFromEuler(new T.Euler(0.3, 1.1, -0.6)),
  };
  let state;
  const combat = createCombatPresentation(scene, {
    pose: () => pose,
    view: () => state,
  });
  const transform = (point) =>
    new T.Vector3(...point).applyQuaternion(pose.quaternion).add(pose.position);
  for (const age of [0, 0.005, 0.02, 0.15]) {
    state = pickupPreviewFrame('arc', COMBAT_RULES.arcDelay + age).combat;
    for (const shot of state.shots) {
      shot.position = transform(shot.position).toArray();
      shot.quaternion = pose.quaternion.toArray();
    }
    combat.update({ mode: 'racing' });
    scene.updateMatrixWorld(true);
    const pulse = scene.children[0].children.find(
      (object) => object.name === 'Arc / traveling pulse' && object.visible,
    );
    const localBounds = new T.Box3();
    for (const plane of pulse.children) {
      const vertices = plane.geometry.getAttribute('position');
      for (let index = 0; index < vertices.count; index++) {
        const point = plane.localToWorld(
          new T.Vector3().fromBufferAttribute(vertices, index),
        );
        point
          .sub(pose.position)
          .applyQuaternion(pose.quaternion.clone().invert());
        localBounds.expandByPoint(point);
      }
    }
    assert.ok(
      localBounds.min.z >= -1e-5,
      'no streak can extend aft of its launch point',
    );
    assert.ok(Math.abs(localBounds.max.z - age * COMBAT_RULES.arcSpeed) < 1e-5);
    assert.ok(Math.abs(localBounds.getCenter(new T.Vector3()).y + 0.15) < 1e-5);
    assert.ok(localBounds.max.z - localBounds.min.z <= 16.00001);
    if (state.flashes.length) {
      const flash = scene.children[0].children.find(
        (object) =>
          object.visible &&
          object.name === 'Combat / contact or pressure pulse',
      );
      assert.ok(flash.position.distanceTo(transform([0, -0.15, 0])) < 1e-9);
    }
  }
  combat.dispose();
  assert.equal(scene.children.length, 0);
});

test('Repulsor charge and pulse share the road frame, remain bounded, and retain their actual timing', () => {
  const scene = new T.Group();
  const pose = {
    position: new T.Vector3(5, 8, 13),
    quaternion: new T.Quaternion().setFromEuler(new T.Euler(0.3, 1, 0.8)),
  };
  let state;
  const combat = createCombatPresentation(scene, {
    pose: () => pose,
    view: () => state,
  });
  const sample = (time) => {
    state = pickupPreviewFrame('repulsor', time, -1, true).combat;
    for (const flash of state.flashes) {
      flash.position = new T.Vector3(...flash.position)
        .applyQuaternion(pose.quaternion)
        .add(pose.position)
        .toArray();
      flash.quaternion = pose.quaternion.toArray();
    }
    combat.update({ mode: 'racing' });
  };
  sample(0.1);
  const shell = scene.getObjectByName('Repulsor / compressed charge shell');
  const initialWidth = shell.scale.x;
  assert.equal(shell.parent.visible, true);
  assert.ok(shell.parent.quaternion.angleTo(pose.quaternion) < 1e-7);
  sample(COMBAT_RULES.pulseDelay - 0.001);
  assert.ok(shell.scale.x < initialWidth);
  assert.ok(
    shell.scale.x > 3,
    'charge stays around the hull instead of collapsing through it',
  );
  sample(COMBAT_RULES.pulseDelay + 0.08);
  assert.equal(shell.parent.visible, false);
  const flashes = scene.children[0].children.filter(
    (object) =>
      object.name === 'Combat / contact or pressure pulse' && object.visible,
  );
  assert.equal(
    flashes.length,
    2,
    'one pressure front and one real target contact',
  );
  const [pulse, hit] = flashes;
  assert.ok(pulse.position.distanceTo(pose.position) < 1e-9);
  assert.ok(pulse.quaternion.angleTo(pose.quaternion) < 1e-7);
  for (const flash of flashes) {
    assert.deepEqual(
      flash.children.map((mesh) => mesh.visible),
      [false, false, true, true],
    );
    assert.ok(
      flash.children.every((mesh) => mesh.scale.x <= COMBAT_RULES.pulseRadius),
    );
  }
  assert.ok(
    hit.children[2].scale.x >= 3 && hit.children[2].scale.x < 7,
    'stronger impact stays around the struck hull, below the outgoing 36 m pulse',
  );
  const intensity = pulse.children[3].material.uniforms.strength.value;
  combat.update({ mode: 'paused' });
  assert.equal(pulse.children[3].material.uniforms.strength.value, intensity);
  combat.update({ mode: 'paused', settings: { reducedMotion: true } });
  assert.ok(pulse.children[3].material.uniforms.strength.value < intensity);
  sample(COMBAT_RULES.pulseDelay + 0.55);
  assert.ok(flashes.every((object) => !object.visible));
  combat.dispose();
  assert.equal(scene.children.length, 0);
});

test('Repulsor source keeps a contained afterglow on discharge and clears it on reset or expiry', () => {
  const feedback = createShipFeedbackPresentation();
  const halo = feedback.group.getObjectByName('Repulsor / hull discharge halo');
  const shell = feedback.group.getObjectByName(
    'Repulsor / hull discharge shell',
  );
  const event = (type) => ({ type, payload: { kind: 'repulsor' } });
  feedback.update({ events: [event('pickup-activate')] });
  assert.equal(
    halo.visible,
    false,
    'release waits for the actual discharge event',
  );
  feedback.update({ events: [event('combat-fire')] });
  assert.equal(halo.visible, true);
  assert.equal(shell.visible, true);
  const peak = halo.material.uniforms.strength.value;
  feedback.update({ racing: false, driving: true, dt: 10 });
  assert.equal(halo.material.uniforms.strength.value, peak);
  feedback.update({ dt: 0.2 });
  assert.ok(halo.material.uniforms.strength.value < peak / 2);
  assert.ok(halo.scale.x < 5.5);
  feedback.update({ dt: 0.3 });
  assert.equal(halo.visible, false);
  feedback.update({
    events: [event('combat-fire')],
    settings: { reducedMotion: true },
  });
  assert.ok(halo.material.uniforms.strength.value < peak / 2);
  feedback.reset();
  assert.equal(halo.visible, false);
  assert.equal(shell.visible, false);
  let disposals = 0;
  for (const mesh of [halo, shell]) {
    mesh.geometry.addEventListener('dispose', () => disposals++);
    mesh.material.addEventListener('dispose', () => disposals++);
  }
  feedback.dispose();
  assert.equal(disposals, 4);
});

test('Arc hull forks follow activation and every shot, with a short paused-safe decay', () => {
  const feedback = createShipFeedbackPresentation();
  const arc = feedback.group.getObjectByName('Arc / branching hull discharge');
  const strength = () => arc.material.uniforms.strength.value;
  const event = (type) => ({ type, payload: { kind: 'arc' } });
  assert.equal(arc.visible, false);
  feedback.update({ events: [event('pickup-activate')] });
  const acquisition = strength();
  assert.ok(acquisition > 0);
  feedback.update({ dt: 0.15 });
  assert.ok(strength() < acquisition);
  feedback.update({ events: [event('combat-fire')] });
  const fired = strength();
  assert.ok(
    fired > acquisition,
    'the audible shot has the brightest discharge',
  );
  feedback.update({ racing: false, driving: true, dt: 10 });
  assert.equal(strength(), fired, 'pause must not consume a visual tail');
  feedback.update({ dt: 0.3 });
  assert.ok(
    arc.visible && strength() < fired / 4,
    'only faint residual charge remains',
  );
  feedback.update({ events: [event('combat-fire')] });
  assert.equal(
    strength(),
    fired,
    'successive shot events retrigger the same envelope',
  );
  feedback.update({ dt: 0.7 });
  assert.equal(arc.visible, false);
  feedback.update({
    events: [event('combat-fire')],
    settings: { reducedMotion: true },
  });
  const reduced = strength();
  feedback.update({
    events: [event('pickup-activate')],
    settings: { reducedMotion: true },
  });
  assert.equal(
    strength(),
    reduced,
    'reduced motion avoids the bright firing peak',
  );
  assert.ok(reduced < acquisition / 2);
  feedback.reset();
  assert.equal(arc.visible, false);
  let geometryDisposed = 0,
    materialDisposed = 0;
  arc.geometry.addEventListener('dispose', () => geometryDisposed++);
  arc.material.addEventListener('dispose', () => materialDisposed++);
  feedback.dispose();
  assert.equal(geometryDisposed, 1);
  assert.equal(materialDisposed, 1);
});
