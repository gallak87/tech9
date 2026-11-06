import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Scene } from 'three';
import { createLevelPresentation } from './presentation.js';

test('results keep world presentation moving while pauses retain the displayed frame', async () => {
  const updates = [];
  const part = () => ({
    group: new Group(),
    update: (frame) => updates.push(frame),
    dispose() {},
  });
  const world = await createLevelPresentation(
    { createRoad: part, createEnvironment: part },
    { view: { scene: new Scene(), updatePresentation() {} } },
  );
  try {
    world.update({ mode: 'results', dt: 1 / 60, time: 125 });
    assert.equal(updates.length, 2);
    assert.ok(
      updates.every((frame) => frame.dt === 1 / 60 && frame.time === 125),
    );
    updates.length = 0;
    world.update({ mode: 'paused', dt: 1 / 60, time: 125 });
    assert.ok(updates.every((frame) => frame.dt === 0));
  } finally {
    world.dispose();
  }
});
