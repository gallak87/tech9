import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import { sampleHelionHeatFeedback } from './thermal.js';
import { createShipHeatEffects, withShipHeatEffects } from './ship-heat.js';

test('cold fire contact is immediate; stored heat smokes through cooling without false flames', () => {
  const contact = sampleHelionHeatFeedback({ heat: 0, exposure: 25 });
  assert.equal(contact.status, 'ON FIRE');
  assert.ok(contact.smoke > 0);
  assert.ok(contact.flame > 0);
  const cooling = sampleHelionHeatFeedback({
    heat: 90,
    exposure: 0,
    sheltered: true,
  });
  assert.equal(cooling.status, 'COOLING');
  assert.ok(cooling.smoke > contact.smoke);
  assert.equal(cooling.flame, 0);
  assert.equal(sampleHelionHeatFeedback({ heat: 90 }).status, 'OVERHEATING');
  assert.equal(sampleHelionHeatFeedback({ heat: 40 }).status, 'HOT · SMOKING');
  assert.equal(sampleHelionHeatFeedback({ heat: 0, sheltered: true }).smoke, 0);
});

test('ship heat presentation freezes with simulation time, respects all modes, and clears at zero heat', () => {
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
