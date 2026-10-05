import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import { sampleHelionHeatFeedback } from './thermal.js';
import { createShipHeatEffects, withShipHeatEffects } from './ship-heat.js';

test('a brief cold hit leaves smoke, small flames and a synchronized five-second visual tail', () => {
  const contact = sampleHelionHeatFeedback({ heat: 0, exposure: 25 });
  assert.equal(contact.status, 'ON FIRE');
  assert.ok(contact.smoke > 0.5);
  assert.ok(contact.flame > 0);
  const cooling = sampleHelionHeatFeedback({
    heat: 0,
    exposure: 0,
    contactHeat: 5,
    contactAge: 2,
    sheltered: true,
  });
  assert.equal(cooling.status, 'COOLING');
  assert.ok(cooling.smoke > 0.35);
  assert.ok(cooling.flame > 0);
  const peak = sampleHelionHeatFeedback(
    { contactHeat: 5, contactAge: 3 },
    { time: 0 },
  );
  const trough = sampleHelionHeatFeedback(
    { contactHeat: 5, contactAge: 3 },
    { time: 0.6 },
  );
  for (const value of ['smoke', 'flame', 'severity']) {
    assert.ok(Math.abs(trough[value] / peak[value] - trough.pulse) < 1e-10);
  }
  assert.equal(
    sampleHelionHeatFeedback({ heat: 90, contactHeat: 90, contactAge: 5 })
      .smoke,
    0,
  );
  assert.equal(sampleHelionHeatFeedback({ heat: 90 }).status, '');
});

test('ship heat presentation freezes with simulation time, respects all modes, and clears after the tail', () => {
  const telemetry = { heat: 90, exposure: 25 };
  const effect = createShipHeatEffects(telemetry);
  const ship = { group: new T.Group() };
  ship.group.userData.bounds = {
    min: [-2.25, -0.12, -3.5],
    max: [2.25, 1.8, 3.7],
  };
  ship.group.position.set(250, 12, -180);
  ship.group.rotation.set(0.2, 0.7, 0.3);
  const camera = new T.PerspectiveCamera();
  camera.position.set(260, 20, -200);
  camera.lookAt(ship.group.position);
  const frame = {
    ship,
    camera,
    time: 2.7,
    mode: 'racing',
    state: { speed: 80 },
  };
  effect.update(frame);
  assert.ok(effect.group.visible);
  const smoke = effect.group.children[0];
  const positions = Array.from(smoke.instanceMatrix.array);
  assert.ok(positions.every(Number.isFinite));
  assert.ok(telemetry.shipSmoke > 0.5);
  effect.update({ ...frame, mode: 'paused' });
  assert.deepEqual(Array.from(smoke.instanceMatrix.array), positions);
  effect.update({ ...frame, settings: { reducedMotion: true } });
  const frozen = Array.from(smoke.instanceMatrix.array);
  effect.update({ ...frame, time: 18, settings: { reducedMotion: true } });
  assert.deepEqual(Array.from(smoke.instanceMatrix.array), frozen);
  effect.update({ ...frame, settings: { quality: 'low' } });
  assert.equal(smoke.count, 24);
  effect.update({ ...frame, mode: 'inspection' });
  assert.equal(effect.group.visible, false);
  effect.update({ ...frame, reviewing: true });
  assert.equal(effect.group.visible, false);
  telemetry.heat = 0;
  telemetry.exposure = 0;
  telemetry.contactHeat = 5;
  telemetry.contactAge = 3;
  effect.update(frame);
  assert.ok(effect.group.visible, 'cold hull still smokes after a brief hit');
  assert.ok(telemetry.shipFlame > 0);
  telemetry.contactAge = 5;
  effect.update(frame);
  assert.equal(effect.group.visible, false);
  assert.equal(telemetry.shipSmoke, 0);
  effect.dispose();
});

test('heat wrapper releases its owned particles before the environment and only once', () => {
  const group = new T.Group();
  let releases = 0;
  const world = withShipHeatEffects(
    {
      group,
      dispose() {
        assert.equal(group.children.length, 0);
        releases++;
      },
    },
    {},
  );
  const counts = new Map();
  group.traverse((node) => {
    for (const resource of [node.geometry, node.material].filter(Boolean)) {
      counts.set(resource, 0);
      resource.addEventListener('dispose', () =>
        counts.set(resource, counts.get(resource) + 1),
      );
    }
  });
  world.dispose();
  world.dispose();
  assert.equal(releases, 1);
  for (const count of counts.values()) assert.equal(count, 1);
});
