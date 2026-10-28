import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Box3, Texture } from 'three';
import { createInterceptorTarget } from './interceptor-target.js';
import { GOLIATH_HULL } from './interceptor-target-hull.js';
import { SHIPS } from './catalog.js';
import { createCrucibleTrack } from '../levels/crucible/track/model.js';
import { createInterceptorTrack } from '../levels/interceptor/track/model.js';
import { createInterceptorDevices } from '../levels/interceptor/devices.js';

test('Goliath is a distinct large AI hull whose contact bounds match its rendered chassis', () => {
  const target = createInterceptorTarget({ quality: 'low' }),
    body = target.group.getObjectByName('Goliath / manufactured chassis');
  const bounds = new Box3().setFromObject(body);
  assert.equal(target.specification.id, 'goliath');
  assert.equal(
    SHIPS.some((ship) => ship.id === 'goliath'),
    false,
  );
  for (let axis = 0; axis < 3; axis++) {
    assert.ok(
      Math.abs(bounds.min.getComponent(axis) - GOLIATH_HULL.bounds.min[axis]) <
        1e-6,
    );
    assert.ok(
      Math.abs(bounds.max.getComponent(axis) - GOLIATH_HULL.bounds.max[axis]) <
        1e-6,
    );
  }
  assert.deepEqual(GOLIATH_HULL.bounds, {
    min: [-8, -0.2, -20],
    max: [8, 5.8, 20],
  });
  assert.equal(
    GOLIATH_HULL.hullSha256,
    createHash('sha256')
      .update(
        JSON.stringify({
          vertices: GOLIATH_HULL.vertices,
          parts: GOLIATH_HULL.parts,
        }),
      )
      .digest('hex'),
  );
  assert.ok(GOLIATH_HULL.parts.length >= 8);
  for (const part of GOLIATH_HULL.parts) {
    assert.ok(part.vertices.length >= 12);
    assert.ok(part.vertices.every(Number.isFinite));
    assert.equal(part.vertices.length % 3, 0);
  }
  for (const side of ['L', 'R', 'C'])
    assert.ok(target.group.getObjectByName('Exhaust_' + side).position.z < -18);
  assert.ok(
    body.children.length <= 10,
    'source assemblies are consolidated by material',
  );
  target.dispose();
});

test('large propulsion stays bounded across repeated frames and quality changes, with exactly-once resource disposal', () => {
  const target = createInterceptorTarget({ quality: 'low' }),
    resources = new Set(),
    counts = new Map(),
    borrowed = new Texture();
  target.group.traverse((object) => {
    if (object.geometry) resources.add(object.geometry);
    if (object.material) {
      resources.add(object.material);
      object.material.envMap = borrowed;
    }
  });
  for (const resource of [...resources, borrowed])
    resource.addEventListener('dispose', () =>
      counts.set(resource, (counts.get(resource) ?? 0) + 1),
    );
  const frame = {
    speed: 120,
    time: 1,
    quality: 'low',
    energy: 1,
    visible: true,
  };
  target.update(frame);
  const plume = target.group.getObjectByName('Rival / propulsion').children[0],
    scale = plume.scale.toArray();
  target.update(frame);
  assert.deepEqual(
    plume.scale.toArray(),
    scale,
    'repeated rendered frames do not compound the large-craft scale',
  );
  assert.ok(scale[0] > 4 && scale[2] > 8);
  target.update({ ...frame, quality: 'high' });
  target.update({ ...frame, quality: 'low', visible: false });
  assert.equal(
    target.group.getObjectByName('Rival / propulsion').visible,
    false,
  );
  target.dispose();
  target.dispose();
  for (const resource of resources) assert.equal(counts.get(resource), 1);
  assert.equal(counts.has(borrowed), false);
  borrowed.dispose();
});

test('Crucible Dispatch is a pursuit identity on the unchanged Foundry course, with propulsion and defense hardware only', () => {
  const original = createCrucibleTrack(),
    pursuit = createInterceptorTrack();
  assert.notEqual(original.id, pursuit.id);
  assert.equal(pursuit.geometryVersion, original.geometryVersion);
  assert.equal(pursuit.length, original.length);
  for (let i = 0; i < 30; i++)
    assert.ok(
      original
        .sample((original.length * i) / 30)
        .position.equals(pursuit.sample((pursuit.length * i) / 30).position),
    );
  const devices = createInterceptorDevices(pursuit);
  assert.ok(devices.length > 4);
  assert.ok(
    devices.every((device) => ['vector', 'aegis'].includes(device.type)),
  );
});
