import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, OrthographicCamera } from 'three';
import { createReadoutAnchor } from './readout-anchor.js';

function fixture() {
  const ship = new Group();
  const camera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(0, 1.6, 10);
  camera.updateMatrixWorld();
  const anchor = createReadoutAnchor();
  const frame = { ship, camera, width: 1000, height: 1000, dt: 1 / 60 };
  const update = (options) => anchor.update({ ...frame, ...options });
  return { ship, camera, anchor, update };
}

test('readout projects the current camera and hull transforms before rendering', () => {
  const { ship, camera, update } = fixture();
  const cameraRig = new Group();
  cameraRig.add(camera);
  cameraRig.position.y = 0.5;
  const hullParent = new Group();
  hullParent.add(ship);
  hullParent.position.y = 0.25;
  const position = update();
  assert.equal(position.x, 500);
  assert.ok(Math.abs(position.y - 513) < 1e-9);
});

test('readout suppresses repeated road-height jitter at 30, 60 and 120 fps', () => {
  for (const fps of [30, 60, 120]) {
    const { ship, update } = fixture();
    const baseline = update().y;
    const samples = [];
    for (let i = 1; i <= fps * 3; i++) {
      ship.position.y = 0.08 * Math.sin((i / fps) * Math.PI * 2 * 10);
      const y = update({ dt: 1 / fps }).y;
      if (i > fps) samples.push(y - baseline);
    }
    const rms = Math.sqrt(
      samples.reduce((total, value) => total + value * value, 0) /
        samples.length,
    );
    assert.ok(rms < 0.9, `${fps} fps: ${rms} px RMS from 8 px road jitter`);
  }
});

test('readout follows a real elevation change promptly without bouncing', () => {
  const results = [];
  for (const fps of [30, 60, 120]) {
    const { ship, update } = fixture();
    let previous = update().y;
    const target = previous - 60;
    ship.position.y = 0.6;
    for (let i = 0; i < fps / 2; i++) {
      const y = update({ dt: 1 / fps }).y;
      assert.ok(y <= previous && y >= target);
      previous = y;
    }
    assert.ok(Math.abs(previous - target) < 0.1);
    results.push(previous);
  }
  assert.ok(Math.max(...results) - Math.min(...results) < 1e-8);
});

test('zero-delta frames hold position; reset, cuts and resize reacquire immediately', () => {
  const { ship, anchor, update } = fixture();
  const initial = { ...update() };
  ship.position.set(0.2, 0.4, 0);
  assert.deepEqual(update({ dt: 0 }), initial);
  anchor.reset();
  assert.deepEqual(update(), { x: 520, y: 448 });
  ship.position.x = 3.5;
  const cut = update();
  assert.ok(Math.abs(cut.x - 850) < 1e-9);
  assert.equal(cut.y, 448);
  const resized = update({ width: 600, height: 800 });
  assert.ok(Math.abs(resized.x - 510) < 1e-9);
  assert.ok(Math.abs(resized.y - 356) < 1e-9);
});

test('readout hides behind the camera and reacquires without stale velocity', () => {
  const { ship, update } = fixture();
  update();
  ship.position.y = 0.5;
  update();
  ship.position.z = 20;
  assert.equal(update(), null);
  ship.position.set(0, 0, 0);
  assert.deepEqual(update(), { x: 500, y: 488 });
});
