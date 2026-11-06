import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Quaternion, Scene, Vector3 } from 'three';
import { createCompletionEffects } from './completion-effects.js';
import { sampleCompletionTimeline } from './completion-timeline.js';

const track = {
  length: 5000,
  sample: (distance) => ({
    position: new Vector3(0, 0, distance),
    right: new Vector3(1, 0, 0),
    up: new Vector3(0, 1, 0),
    tangent: new Vector3(0, 0, 1),
    quaternion: new Quaternion(),
  }),
};

test('braking traces remain in road space while craft advance, and reduced motion suppresses effects', () => {
  const scene = new Scene();
  const effects = createCompletionEffects({ scene, track });
  const models = new Map(
    ['hero', 'rook', 'manta'].map((id) => [id, { group: new Group() }]),
  );
  const root = scene.getObjectByName('Career finale / weapons and braking');
  const traces = scene.getObjectByName(
    'Career finale / fixed road skid traces',
  );
  const positions = [...traces.geometry.attributes.position.array];
  try {
    effects.update(sampleCompletionTimeline(17), { models });
    assert.equal(traces.visible, true);
    models.get('hero').group.position.set(100, 80, 1000);
    effects.update(sampleCompletionTimeline(19.5), { models });
    assert.deepEqual([...traces.geometry.attributes.position.array], positions);
    assert.ok(
      positions
        .filter((_, index) => index % 3 === 1)
        .every((height) => Math.abs(height - 0.07) < 1e-7),
      'traces sit on the sampled ground plane',
    );
    effects.update(sampleCompletionTimeline(19.5), {
      models,
      reducedMotion: true,
    });
    assert.equal(root.visible, false);
    assert.equal(root.userData.aoExclude, true);
  } finally {
    effects.dispose();
  }
});

test('the effects owner releases every geometry/material exactly once', () => {
  const scene = new Scene();
  const effects = createCompletionEffects({ scene, track });
  const resources = new Set();
  scene.traverse((object) => {
    if (object.geometry) resources.add(object.geometry);
    if (object.material) resources.add(object.material);
  });
  let disposed = 0;
  for (const resource of resources)
    resource.addEventListener('dispose', () => disposed++);
  effects.dispose();
  effects.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(disposed, resources.size);
});
