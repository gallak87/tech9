import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createCameraRig } from '../src/camera/index.js';
import createLevel from '../src/levels/zephyr/index.js';
const level = createLevel(),
  track = level.createTrack();
test('numeric chase preview retains the same pose as a constant callback', () => {
  const a = new T.PerspectiveCamera(61, 1.6, 0.1, 12000),
    b = a.clone();
  const ra = createCameraRig(a, {
      lookAhead: 35,
      chaseHeight: 5,
      chaseDistance: 12.5,
    }),
    rb = createCameraRig(b, {
      lookAhead: () => 35,
      chaseHeight: () => 5,
      chaseDistance: () => 12.5,
    });
  for (let i = 0; i < 300; i++) {
    const state = {
      distance: 1100 + i * 0.8,
      lateral: Math.sin(i * 0.05) * 7,
      speed: 95,
    };
    ra.update(track, state, 1 / 120);
    rb.update(track, state, 1 / 120);
    assert.deepEqual(a.position.toArray(), b.position.toArray());
    assert.deepEqual(a.quaternion.toArray(), b.quaternion.toArray());
  }
});
test('Zephyr spiral camera preview is bounded, periodic and continuous without state changes', () => {
  let previous = 38;
  for (let s = 0; s < track.length; s += 0.5) {
    const state = { distance: s, speed: 100, lateral: 0 },
      before = { ...state };
    const ahead = level.camera.lookAhead(track, state);
    assert.ok(ahead >= 38 && ahead <= 260);
    assert.ok(Math.abs(ahead - previous) < 2);
    assert.ok(
      Math.abs(
        ahead -
          level.camera.lookAhead(track, {
            ...state,
            distance: s + track.length,
          }),
      ) < 1e-8,
    );
    assert.deepEqual(state, before);
    previous = ahead;
  }
  assert.equal(level.camera.lookAhead(track, { distance: 1200 }), 38);
  assert.ok(
    level.camera.lookAhead(track, { distance: track.landmarks.cloudspire.s }) >
      170,
  );
});

for (const aspect of [1.6, 844 / 390, 640 / 360])
  test(`spiral camera keeps the full hull in its HUD-safe frame at aspect ${aspect}`, () => {
    const bounds = new T.Box3(
      new T.Vector3(-2.25, -0.12, -3.51),
      new T.Vector3(2.25, 1.8, 3.7),
    );
    const camera = new T.PerspectiveCamera(61, aspect, 0.1, 12000),
      subject = new T.Group();
    const rig = createCameraRig(camera, level.camera, bounds);
    const safe = level.camera.safeFrame(aspect);
    let previous = null;
    for (let s = 1800; s < 2850; s += 110 / 120) {
      const f = track.sample(s),
        state = { distance: s, speed: 110, lateral: 7 * Math.sin(s * 0.005) };
      subject.position
        .copy(f.position)
        .addScaledVector(f.right, state.lateral)
        .addScaledVector(f.up, 0.72);
      subject.quaternion.copy(f.quaternion);
      subject.updateMatrixWorld(true);
      rig.update(track, state, 1 / 120, { subject });
      camera.updateMatrixWorld(true);
      if (previous)
        assert.ok(
          camera.quaternion.angleTo(previous) < 0.12,
          'abrupt chase rotation',
        );
      previous = camera.quaternion.clone();
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) {
            const p = new T.Vector3(x, y, z)
              .applyMatrix4(subject.matrixWorld)
              .project(camera);
            assert.ok(
              p.x >= safe.left - 0.01 &&
                p.x <= safe.right + 0.01 &&
                p.y >= safe.bottom - 0.01 &&
                p.y <= safe.top + 0.01,
              `hull leaves safe frame at ${s}`,
            );
          }
    }
  });
