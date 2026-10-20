import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createCombatPresentation } from './combat-presentation.js';
import { createShipFeedbackPresentation } from './ship-feedback.js';
import { createHitFeedback } from './hit-feedback.js';
import { createLowDeviceGeometry } from './low-geometry.js';
import { createRoadProjector, disposeGroup } from './geometry.js';
import { ION_WAKE_RADIUS } from './rules.js';
import { pickupPreviewFrame } from '../ships/pickup-preview-sequence.js';

const low = { quality: 'low' },
  high = { quality: 'high' };
function plain(root) {
  root.traverse((object) => {
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (!material) continue;
      assert.ok(
        material.isMeshBasicMaterial || material.isLineBasicMaterial,
        material.name,
      );
      assert.equal(material.map ?? null, null);
    }
    assert.equal(object.castShadow, false);
  });
}
function resources(root) {
  const all = new Set();
  root.traverse((object) => {
    if (object.geometry) all.add(object.geometry);
    if (object.isInstancedMesh) all.add(object);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      if (material) all.add(material);
  });
  return all;
}

test('Low combat uses four plain batches, preserves live shots/wakes and releases each quality tier', () => {
  const scene = new T.Group();
  let state = pickupPreviewFrame('arc', 0.36).combat;
  const combat = {
    view: () => state,
    pose: () => ({ position: new T.Vector3(), quaternion: new T.Quaternion() }),
  };
  const presentation = createCombatPresentation(scene, combat, low);
  plain(presentation.group);
  assert.equal(presentation.group.children.length, 4);
  const owned = resources(presentation.group),
    freed = new Set();
  for (const resource of owned)
    resource.addEventListener('dispose', () => freed.add(resource));
  presentation.update({ mode: 'racing', settings: low });
  assert.equal(
    presentation.group.getObjectByName('Low Arc / bolts').count,
    state.shots.length,
  );
  const snapshot = JSON.stringify(state);
  presentation.update({ mode: 'paused', settings: high });
  assert.equal(freed.size, owned.size);
  const detailed = resources(presentation.group),
    detailedFreed = new Set();
  for (const resource of detailed)
    resource.addEventListener('dispose', () => detailedFreed.add(resource));
  presentation.update({ mode: 'paused', settings: low });
  assert.equal(detailedFreed.size, detailed.size);
  assert.equal(scene.children.length, 1);
  assert.equal(JSON.stringify(state), snapshot, 'quality never mutates combat');
  plain(presentation.group);
  state = {
    time: 1,
    emitters: {},
    shots: [],
    flashes: [],
    wakes: Array.from({ length: 256 }, (_, i) => ({
      a: [0, 2, i * 10],
      b: [0, 2, i * 10 + 8],
      quaternion: [0, 0, 0, 1],
      age: 0.1,
    })),
  };
  state.wakes[0].b = [...state.wakes[0].a];
  presentation.update({ mode: 'racing', settings: low });
  const wake = presentation.group.getObjectByName(
    'Low Ion / live wake footprint',
  );
  assert.equal(wake.geometry.drawRange.count, 256 * 30);
  const positions = wake.geometry.attributes.position.array;
  assert.ok([...positions].every(Number.isFinite));
  const first = new T.Box3().setFromPoints(
    Array.from({ length: 30 }, (_, i) =>
      new T.Vector3().fromArray(positions, i * 3),
    ),
  );
  assert.ok(
    first.max.x > ION_WAKE_RADIUS - 0.001 &&
      first.min.x < -ION_WAKE_RADIUS + 0.001,
  );
  assert.ok(
    first.max.z > ION_WAKE_RADIUS - 0.001 &&
      first.min.z < -ION_WAKE_RADIUS + 0.001,
    'a stationary deposit keeps a visible contact area',
  );
  state.wakes = [];
  presentation.update({ mode: 'racing', settings: low });
  assert.equal(wake.geometry.drawRange.count, 0);
  presentation.dispose();
  presentation.dispose();
  assert.equal(scene.children.length, 0);
});

test('Low shield and collection cues freeze on pause, expire and survive active quality changes', () => {
  const ship = new T.Group();
  const feedback = createShipFeedbackPresentation(low);
  ship.add(feedback.group);
  plain(feedback.group);
  feedback.update({
    effects: { aegisRemaining: 4, vectorActive: true },
    settings: low,
  });
  assert.equal(
    feedback.group.children.filter((child) => child.visible).length,
    2,
  );
  feedback.update({ events: [{ type: 'shield-hit' }], settings: low });
  assert.equal(feedback.hitActive, true);
  const shield = feedback.group.getObjectByName('Low Aegis / field');
  const opacity = shield.material.opacity;
  feedback.update({ racing: false, driving: true, dt: 20, settings: low });
  assert.equal(shield.material.opacity, opacity);
  feedback.update({ dt: 1, settings: low });
  assert.equal(shield.visible, false);
  for (const settings of [high, low, high, low]) {
    feedback.update({ effects: { aegisRemaining: 2 }, settings });
    assert.equal(feedback.group.parent, ship);
    assert.equal(ship.children.length, 1);
    assert.ok(feedback.group.children.some((child) => child.visible));
  }
  feedback.reset();
  assert.ok(feedback.group.children.every((child) => !child.visible));
  feedback.dispose();
  assert.equal(ship.children.length, 0);
});

test('Low hull hits allocate one outline, borrow no hull resources and preserve inspector reparenting', () => {
  const ship = new T.Group(),
    studio = new T.Group();
  const geometry = new T.BoxGeometry(4, 2, 8),
    material = new T.MeshBasicMaterial();
  ship.add(new T.Mesh(geometry, material));
  const feedback = createHitFeedback(ship, low);
  studio.add(feedback.group);
  const target = new T.Mesh(geometry, material);
  target.position.z = 30;
  ship.add(target);
  plain(feedback.group);
  assert.equal(feedback.group.children.length, 1);
  let hullDisposed = false;
  geometry.addEventListener('dispose', () => {
    hullDisposed = true;
  });
  for (const settings of [low, high, low]) {
    feedback.update(0.08, settings, 'arc');
    assert.equal(feedback.group.visible, true);
    assert.equal(feedback.group.parent, studio);
    assert.equal(studio.children.length, 1);
    if (settings.quality === 'high')
      assert.equal(feedback.group.children.length, 2);
    else
      assert.ok(
        feedback.group.children[0].scale.z < 5,
        'later dev targets never enter hull bounds',
      );
  }
  feedback.update(undefined, low, 'ion', { ionContact: 1 });
  assert.equal(feedback.group.visible, true);
  feedback.update();
  assert.equal(feedback.group.visible, false);
  plain(feedback.group);
  feedback.dispose();
  assert.equal(hullDisposed, false);
  disposeGroup(ship);
});

test('all five Low devices are two projected draws with distinct colored symbols and no shader allocation', () => {
  const track = {
    length: 1000,
    width: 50,
    sample: (distance) => ({
      position: new T.Vector3(0, 0, distance),
      right: new T.Vector3(1, 0, 0),
      up: new T.Vector3(0, 1, 0),
      tangent: new T.Vector3(0, 0, 1),
      quaternion: new T.Quaternion(),
    }),
  };
  const projector = createRoadProjector(track);
  const counts = [];
  for (const type of ['vector', 'aegis', 'arc', 'repulsor', 'ion']) {
    const device = {
      id: type,
      type,
      distance: 100,
      lateral: 0,
      width: 6,
      length: 10,
    };
    const visual = createLowDeviceGeometry(track, device, projector, {
      mountHeight: 2,
    });
    plain(visual.group);
    assert.equal(visual.group.children.length, 2);
    const bounds = new T.Box3().setFromObject(visual.group);
    assert.ok(bounds.min.y >= 2);
    counts.push(visual.group.children[1].geometry.attributes.position.count);
    visual.setAvailable(false);
    visual.update({ time: 10 });
    assert.equal(visual.group.children[1].material.color.getHex(), 0x49515b);
    disposeGroup(visual.group);
  }
  assert.equal(new Set(counts).size, 5, 'every kind keeps a distinct symbol');
  projector.dispose();
});
