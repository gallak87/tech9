import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { FollowCamera } from '../../follow-camera/src/FollowCamera.js';
import { createAircraft, createAircraftControls } from '../src/Aircraft.js';
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

test('mounted camera tracks inversion and controls toggle assistance without consuming form keys', () => {
  const aircraft = createAircraft({
    profile: 'sport',
    spawn: { x: 0, z: 0, y: 400, heading: 0, roll: Math.PI, speed: 45 },
  });
  const camera = new PerspectiveCamera();
  const follow = new FollowCamera(camera, {
    getTarget: aircraft.snapshot,
    mounted: { getPose: aircraft.getCockpitPose },
  });
  follow.setMode('mounted');
  follow.update(0);
  assert.ok(camera.up.y < -0.99);
  const window = new EventTarget(),
    document = new EventTarget();
  const controls = createAircraftControls(aircraft, {
    window,
    document,
    enabled: true,
  });
  const press = (code) => {
    const event = new Event('keydown', { cancelable: true });
    Object.assign(event, { code, repeat: false });
    window.dispatchEvent(event);
  };
  press('KeyF');
  assert.equal(aircraft.snapshot().stabilization, false);
  document.activeElement = { tagName: 'INPUT' };
  press('KeyF');
  assert.equal(aircraft.snapshot().stabilization, false);
  document.activeElement = null;
  press('Space');
  assert.equal(controls.sample().level, true);
  window.dispatchEvent(new Event('blur'));
  assert.equal(controls.enabled, false);
  assert.equal(controls.sample().level, false);
  controls.dispose();
  follow.dispose();
  aircraft.dispose();
});
