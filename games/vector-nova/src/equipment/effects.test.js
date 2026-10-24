import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Quaternion, Vector3 } from 'three';
import { createEquipmentEffects } from './effects.js';
import { equipmentById } from '../progression/catalog.js';

const pose = { position: new Vector3(11, 4, -2), quaternion: new Quaternion() };
const frame = (time, ids, extra = {}) => ({
  mode: 'racing',
  pose,
  equipment: {
    time,
    slots: ids.map((id) => ({
      id,
      remaining: Math.max(0, equipmentById(id).cooldown - time),
      active: Math.max(0, equipmentById(id).duration - time),
    })),
    shield:
      ids.includes('deflector') && time < equipmentById('deflector').duration,
  },
  ...extra,
});
const find = (effects, name) => effects.group.getObjectByName(name);
const state = (effects) => {
  const result = [];
  effects.group.traverse((node) =>
    result.push({
      visible: node.visible,
      position: node.position.toArray(),
      scale: node.scale.toArray(),
      opacity: node.material?.opacity,
      uniforms: node.material?.uniforms
        ? Object.fromEntries(
            Object.entries(node.material.uniforms).map(([key, { value }]) => [
              key,
              value?.isColor ? value.getHex() : value,
            ]),
          )
        : null,
    }),
  );
  return result;
};

test('equipment combinations keep distinct directional effects and independent lifetimes', () => {
  const effects = createEquipmentEffects(new Group());
  const ids = [
    'jump',
    'injector',
    'slipstream',
    'deflector',
    'stabilizer',
    'lance',
  ];
  effects.update(frame(0.1, ids));
  assert.ok(effects.group.children.every((node) => node.visible));
  assert.deepEqual(effects.group.position.toArray(), pose.position.toArray());
  effects.group.traverse((node) =>
    assert.notEqual(node.geometry?.type, 'TorusGeometry'),
  );
  effects.update(frame(0.7, ids));
  assert.equal(
    find(effects, 'Jump Drive / underside impulse jets').visible,
    false,
  );
  assert.equal(find(effects, 'Lance / split muzzle rails').visible, false);
  assert.equal(
    find(effects, 'Reserve Injector / inward energy conduits').visible,
    true,
  );
  effects.update(frame(2, ids));
  assert.equal(
    find(effects, 'Reserve Injector / inward energy conduits').visible,
    false,
  );
  assert.equal(
    find(effects, 'Slipstream Drive / trailing airflow').visible,
    true,
  );
  assert.equal(
    find(effects, 'Magnetic Stabilizer / corrective jets').visible,
    true,
  );
  effects.update(frame(4.1, ids));
  assert.ok(effects.group.children.every((node) => !node.visible));
  effects.dispose();
});

test('pause is clock-stable and reset or restore does not replay stale impulse bursts', () => {
  const effects = createEquipmentEffects(new Group());
  effects.update(frame(0.15, ['jump', 'slipstream']));
  const before = state(effects);
  effects.update(frame(0.15, ['jump', 'slipstream'], { mode: 'paused' }));
  assert.deepEqual(state(effects), before);
  effects.reset();
  effects.update(frame(2, ['jump', 'injector', 'lance']));
  assert.ok(effects.group.children.every((node) => !node.visible));
  effects.update(frame(0, ['jump', 'injector', 'lance']));
  assert.equal(
    find(effects, 'Jump Drive / underside impulse jets').visible,
    true,
  );
  effects.update(frame(0.1, ['jump'], { suspended: true }));
  assert.equal(effects.group.visible, false);
  effects.dispose();
});

test('Deflector breaks toward contact, while ordinary expiry dissolves evenly', () => {
  const effects = createEquipmentEffects(new Group());
  effects.update(frame(0, ['deflector']));
  const hitFrame = frame(0.3, ['deflector'], {
    events: [
      {
        type: 'equipment-block',
        payload: { kind: 'deflector', position: [21, 4, -2] },
      },
    ],
  });
  hitFrame.equipment.shield = false;
  hitFrame.equipment.slots[0].active = 0;
  effects.update(hitFrame);
  const panels = find(
    effects,
    'Deflector / segmented conformal panels',
  ).children;
  assert.ok(
    panels[2].children[0].material.opacity >
      panels[6].children[0].material.opacity,
  );
  effects.reset();
  effects.update(frame(2.49, ['deflector']));
  effects.update(frame(2.5, ['deflector']));
  assert.equal(
    panels[2].children[0].material.opacity,
    panels[6].children[0].material.opacity,
  );
  effects.update(frame(2.85, ['deflector']));
  assert.equal(
    find(effects, 'Deflector / segmented conformal panels').visible,
    false,
  );
  effects.dispose();
});

test('Low and reduced motion retain identities with fewer draws and static restrained flow', () => {
  const effects = createEquipmentEffects(new Group());
  const ids = ['jump', 'injector', 'slipstream', 'deflector', 'stabilizer'];
  effects.update(frame(0.2, ids));
  const jump = find(effects, 'Jump Drive / underside impulse jets');
  const fullLength = jump.children[0].scale.y;
  const highStrength = jump.children[0].material.uniforms.strength.value;
  effects.update(
    frame(0.2, ids, { settings: { quality: 'low', reducedMotion: true } }),
  );
  assert.ok(jump.children[0].scale.y < fullLength);
  assert.ok(jump.children[0].material.uniforms.strength.value < highStrength);
  assert.equal(jump.children.filter((node) => node.visible).length, 2);
  const slip = find(effects, 'Slipstream Drive / trailing airflow');
  assert.equal(slip.children.filter((node) => node.visible).length, 2);
  assert.equal(slip.children[0].material.uniforms.motion.value, 0);
  assert.equal(slip.children[0].material.uniforms.time.value, 0);
  assert.ok(
    find(effects, 'Deflector / segmented conformal panels').children.every(
      (node) => !node.children[0].visible,
    ),
  );
  effects.dispose();
});

test('all shared geometries and materials are disposed exactly once', () => {
  const scene = new Group();
  const effects = createEquipmentEffects(scene);
  const resources = new Map();
  effects.group.traverse((node) => {
    for (const resource of [node.geometry, node.material]) {
      if (!resource || resources.has(resource)) continue;
      resources.set(resource, 0);
      resource.addEventListener('dispose', () =>
        resources.set(resource, resources.get(resource) + 1),
      );
    }
  });
  effects.dispose();
  effects.dispose();
  assert.equal(scene.children.length, 0);
  assert.ok([...resources.values()].every((count) => count === 1));
  effects.update(frame(0, ['jump']));
  assert.equal(scene.children.length, 0);
});
