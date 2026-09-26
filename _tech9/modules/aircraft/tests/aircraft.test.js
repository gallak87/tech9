import test from 'node:test';
import assert from 'node:assert/strict';
import { createAircraft } from '../src/Aircraft.js';
for (const profile of ['trainer', 'sport'])
  test(`${profile} model follows motion and provides a rolled cockpit pose`, () => {
    const a = createAircraft({
      profile,
      stabilization: false,
      spawn: { x: 12, z: -8, y: 300, heading: 0.4, roll: Math.PI, speed: 40 },
    });
    const state = a.step(1 / 60, { roll: 0.4, pitch: 0.2, yaw: 0.3 });
    assert.equal(a.group.position.x, state.x);
    assert.ok(a.visual.ailerons[0].rotation.x > 0);
    assert.ok(a.getCockpitPose().up[1] < -0.95);
    a.setCockpitMode(true);
    assert.equal(a.visual.exterior.visible, false);
    assert.equal(a.visual.cockpit.visible, true);
    let released = 0;
    const count = a.visual.resources.size;
    for (const resource of a.visual.resources)
      resource.addEventListener('dispose', () => released++);
    a.dispose();
    a.dispose();
    assert.equal(released, count);
  });
