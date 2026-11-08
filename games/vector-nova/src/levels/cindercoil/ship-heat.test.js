import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import {
  readCindercoilHeatFeedback,
  withCindercoilShipHeatEffects,
} from './ship-heat.js';

test('lava feedback uses solved contact and checkpointed history, not atmosphere or cumulative exposure', () => {
  assert.equal(readCindercoilHeatFeedback().contact, 0);
  assert.equal(readCindercoilHeatFeedback().smoke, 0);
  const motion = {
    contactId: 'spill',
    contactAge: 0,
    contactDuration: 0.2,
    contactSeconds: 20,
  };
  const before = structuredClone(motion);
  const active = readCindercoilHeatFeedback({ motion: { motion }, time: 2 });
  assert.equal(active.contact, 1);
  assert.equal(active.contactDuration, 0.2);
  assert.ok(active.smoke > 0.5 && active.flame > 0);
  assert.deepEqual(motion, before);
  const release = { contactId: null, contactAge: 2, contactSeconds: 20 };
  const cooling = readCindercoilHeatFeedback({ motion: release });
  assert.equal(
    cooling.contact,
    0,
    'smoke must not sustain the audio contact loop',
  );
  assert.ok(cooling.smoke > 0 && cooling.smoke < active.smoke);
  assert.equal(
    readCindercoilHeatFeedback({ motion: { ...release, contactAge: 5 } }).smoke,
    0,
  );
  assert.deepEqual(
    readCindercoilHeatFeedback({
      motion,
      time: 1,
      settings: { reducedMotion: true },
    }),
    readCindercoilHeatFeedback({
      motion,
      time: 99,
      settings: { reducedMotion: true },
    }),
  );
});

test('lava plumes and hull outline are absent from inactive staging and release fully after five seconds', () => {
  const environment = { group: new T.Group(), dispose() {} };
  const world = withCindercoilShipHeatEffects(environment);
  const ship = { group: new T.Group() };
  const geometry = new T.BoxGeometry(3, 1, 6),
    material = new T.MeshBasicMaterial();
  ship.group.add(new T.Mesh(geometry, material));
  const camera = new T.PerspectiveCamera();
  const frame = {
    ship,
    camera,
    mode: 'title',
    time: 0,
    motion: { contactId: null, contactAge: 5 },
  };
  const visible = (object) => {
    for (let node = object; node; node = node.parent)
      if (!node.visible) return false;
    return true;
  };
  world.update(frame);
  const rendered = [];
  for (const root of [environment.group, ship.group])
    root.traverse((node) => {
      if (node.isMesh && node.userData.aoExclude && visible(node))
        rendered.push(node);
    });
  assert.deepEqual(
    rendered,
    [],
    'no added draw is visible in a saved menu still',
  );
  world.update({
    ...frame,
    mode: 'racing',
    motion: { contactId: 'lava', contactDuration: 0.1, contactAge: 0 },
  });
  const smoke = environment.group.getObjectByName(
    'Cindercoil / trailing hot hull smoke',
  );
  const outline = ship.group.getObjectByName(
    'Thermal contact / smoke-gray hull outline',
  );
  assert.ok(visible(smoke) && outline.visible);
  const matrices = Array.from(smoke.instanceMatrix.array);
  world.update({
    ...frame,
    mode: 'paused',
    motion: { contactId: 'lava', contactDuration: 0.1, contactAge: 0 },
  });
  assert.deepEqual(Array.from(smoke.instanceMatrix.array), matrices);
  world.update({
    ...frame,
    mode: 'racing',
    motion: { contactId: null, contactAge: 2 },
  });
  assert.ok(visible(smoke));
  assert.equal(outline.visible, false);
  world.update({
    ...frame,
    mode: 'racing',
    motion: { contactId: null, contactAge: 5 },
  });
  assert.equal(visible(smoke), false);
  assert.equal(outline.visible, false);
  world.dispose();
  geometry.dispose();
  material.dispose();
});
