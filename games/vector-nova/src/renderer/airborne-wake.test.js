import assert from 'node:assert/strict';
import test from 'node:test';
import { Euler, Quaternion, Vector3 } from 'three';
import { createAirborneWake } from './airborne-wake.js';

const bounds = { min: [-1.8, -0.3, -3.8], max: [1.8, 1.25, 3] };
const accent = 0xff674f;
const frameTime = 1 / 60;

function harness(t) {
  const wake = createAirborneWake();
  const { mesh } = wake;
  const state = {
    active: true,
    airborne: true,
    resetCount: 0,
    speed: 110,
    quaternion: new Quaternion(),
    bounds,
    accent,
    position: new Vector3(100, 15, -50),
  };
  let time = 0;
  t.after(() => wake.dispose());
  function tick(overrides = {}) {
    time += frameTime;
    wake.update({ ...state, time, ...overrides });
  }
  function fly(steps) {
    for (let step = 0; step < steps; step++) {
      state.position.z += 1;
      state.position.y += 0.13;
      tick();
    }
  }
  return { mesh, state, tick, fly };
}

function drawnRows(mesh) {
  const { index, drawRange, attributes } = mesh.geometry;
  if (drawRange.count === 0) return [];
  const drawn = index.array.subarray(
    drawRange.start,
    drawRange.start + drawRange.count,
  );
  const lastVertex = Math.max(...drawn);
  const rows = [];
  for (let i = 0; i <= lastVertex; i += 2) {
    const left = new Vector3().fromBufferAttribute(attributes.position, i);
    const right = new Vector3().fromBufferAttribute(attributes.position, i + 1);
    rows.push(left.add(right).multiplyScalar(0.5));
  }
  return rows;
}

test('The world-space wake follows the banked underside along a bounded curved path', (t) => {
  const { mesh, state, tick } = harness(t);
  for (let step = 0; step < 64; step++) {
    state.position.set(
      100 + 0.3 * step,
      15 + 4 * Math.sin(step * 0.075),
      -50 + 1.35 * step,
    );
    state.quaternion.setFromEuler(new Euler(0.16, 0.28 + 0.002 * step, -0.32));
    tick();
  }

  assert.ok(mesh.visible);
  const rows = drawnRows(mesh);
  assert.ok(rows.length > 4);
  assert.equal(mesh.material.uniforms.accent.value.getHex(), accent);
  assert.ok(mesh.geometry.attributes.fade.getX(4) > 0.05);
  const expected = new Vector3(0, bounds.min[1] - 0.12, -0.57)
    .applyQuaternion(state.quaternion)
    .add(state.position);
  assert.ok(
    rows[0].distanceTo(expected) < 1e-5,
    'the newest row follows the positioned and banked hull',
  );
  let length = 0;
  for (let i = 1; i < rows.length; i++)
    length += rows[i - 1].distanceTo(rows[i]);
  assert.ok(Math.abs(length - 30) < 1e-4, `wake follows ${length}m of the arc`);
  const middle = rows[Math.floor(rows.length / 2)];
  const chord = rows.at(-1).clone().sub(rows[0]);
  const fromHead = middle.clone().sub(rows[0]);
  assert.ok(fromHead.cross(chord).length() / chord.length() > 0.06);
});

test('Pause freezes the flight trace and landing fades its last rows in place', (t) => {
  const { mesh, state, tick, fly } = harness(t);
  fly(16);
  const { geometry } = mesh;
  const positions = geometry.attributes.position.array.slice();
  const fades = geometry.attributes.fade.array.slice();
  const indexCount = geometry.drawRange.count;
  const { opacity } = mesh.material.uniforms;
  const airborneOpacity = opacity.value;
  assert.ok(mesh.visible && Math.max(...fades) > 0);

  tick({ paused: true, position: state.position.clone().addScalar(12) });
  assert.deepEqual(geometry.attributes.position.array, positions);
  assert.deepEqual(geometry.attributes.fade.array, fades);
  assert.equal(geometry.drawRange.count, indexCount);
  assert.equal(opacity.value, airborneOpacity);

  const head = drawnRows(mesh)[0];
  state.position.add(new Vector3(0, -0.35, 1.3));
  for (let step = 0; step < 4; step++) tick({ airborne: false });
  assert.ok(mesh.visible);
  assert.ok(drawnRows(mesh)[0].distanceTo(head) < 1e-6);
  assert.ok(opacity.value > 0 && opacity.value < airborneOpacity);
  for (let step = 0; step < 13; step++) tick({ airborne: false });
  assert.equal(mesh.visible, false);
  assert.equal(geometry.drawRange.count, 0);
});

test('Reset, reduced motion, inactive mode and teleport discard flight history', (t) => {
  const { mesh, state, tick, fly } = harness(t);
  for (const invalidate of [
    () => ({ resetCount: ++state.resetCount }),
    () => ({ reducedMotion: true }),
    () => ({ active: false }),
    () => {
      state.position.z += 180;
      return {};
    },
  ]) {
    fly(8);
    assert.ok(mesh.visible);
    tick(invalidate());
    assert.equal(mesh.visible, false);
    assert.equal(mesh.geometry.drawRange.count, 0);
  }
});
