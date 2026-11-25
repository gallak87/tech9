import assert from 'node:assert/strict';
import test from 'node:test';
import { Euler, Quaternion, Vector3 } from 'three';
import { createLatticeLayout } from '../levels/orbital/track/lattice.js';
import { createLevel2Track } from '../levels/orbital/track/model.js';
import { createGlideWake } from './glide-wake.js';

const bounds = { min: [-1.8, -0.3, -3.8], max: [1.8, 1.25, 3] };
const accent = 0xff674f;
const frameTime = 1 / 60;

function harness(t) {
  const wake = createGlideWake();
  const { mesh } = wake;
  const state = {
    active: true,
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
  for (let i = 0; i <= lastVertex; i += 4) {
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
  assert.ok(Math.abs(length - 42) < 1e-4, `wake follows ${length}m of the arc`);
  const { along, fade } = mesh.geometry.attributes;
  const olderRow = rows.findIndex((_, i) => along.getX(i * 4) >= 36);
  assert.ok(olderRow > 0 && fade.getX(olderRow * 4) > 0.05);
  const middle = rows[Math.floor(rows.length / 2)];
  const chord = rows.at(-1).clone().sub(rows[0]);
  const fromHead = middle.clone().sub(rows[0]);
  assert.ok(fromHead.cross(chord).length() / chord.length() > 0.06);
});

test('The center and edges stay aligned to a straight driven line', (t) => {
  const { mesh, state, tick } = harness(t);
  for (let step = 0; step < 25; step++) {
    state.position.z += 1.4;
    tick();
  }
  const rows = drawnRows(mesh);
  const { position } = mesh.geometry.attributes;
  assert.equal(rows.length, 25);
  for (let row = 0; row < rows.length; row++) {
    assert.equal(rows[row].x, state.position.x);
    assert.equal(position.getX(row * 4), position.getX(0));
    assert.equal(position.getX(row * 4 + 1), position.getX(1));
  }
});

test('Asterion Orbital open lattice keeps a connected wake across the gaps', (t) => {
  const { mesh, state, tick } = harness(t);
  const track = createLevel2Track();
  const lattice = createLatticeLayout(track);
  const start = lattice.spans[0].start;
  assert.equal(lattice.surfaceCoverage(start + 16, 0), 1);
  assert.equal(lattice.surfaceCoverage(start + 40, 0), 0);
  const expected = [];
  for (let step = 14; step <= 49; step++) {
    const frame = track.sample(start + step);
    state.position.copy(frame.position).addScaledVector(frame.up, 0.72);
    state.quaternion.copy(frame.quaternion);
    tick();
    expected.unshift(
      new Vector3(0, bounds.min[1] - 0.12, -0.57)
        .applyQuaternion(state.quaternion)
        .add(state.position),
    );
  }
  const rows = drawnRows(mesh);
  assert.equal(rows.length, expected.length);
  assert.equal(mesh.geometry.drawRange.count, (rows.length - 1) * 12);
  for (const [index, row] of rows.entries())
    assert.ok(row.distanceTo(expected[index]) < 0.0002);
});

test('An airborne trick leaves both hull-local axes of each emitted row in the wake', (t) => {
  const { mesh, state, tick } = harness(t);
  const hullFrames = [0, Math.PI / 2, Math.PI].map((roll) =>
    new Quaternion().setFromEuler(new Euler(0.2, 0.35, roll)),
  );
  for (const frame of hullFrames) {
    state.position.z += 1.5;
    state.quaternion.copy(frame);
    tick();
  }

  assert.equal(drawnRows(mesh).length, hullFrames.length);
  const { position, fade } = mesh.geometry.attributes;
  for (const [row, frame] of hullFrames.toReversed().entries()) {
    const vertex = row * 4;
    const right = new Vector3()
      .fromBufferAttribute(position, vertex + 1)
      .sub(new Vector3().fromBufferAttribute(position, vertex));
    const up = new Vector3()
      .fromBufferAttribute(position, vertex + 3)
      .sub(new Vector3().fromBufferAttribute(position, vertex + 2));
    const expectedRight = new Vector3(1, 0, 0).applyQuaternion(frame);
    const expectedUp = new Vector3(0, 1, 0).applyQuaternion(frame);
    assert.ok(right.length() > 1);
    assert.ok(up.length() > 0.2 && up.length() < right.length());
    assert.ok(right.normalize().dot(expectedRight) > 0.99999);
    assert.ok(up.normalize().dot(expectedUp) > 0.99999);
    assert.ok(fade.getX(vertex + 2) > 0);
    assert.ok(fade.getX(vertex + 2) < fade.getX(vertex));
  }
});

test('A single wake carries the takeoff arc through touchdown and freezes on pause', (t) => {
  const { mesh, state, tick, fly } = harness(t);
  for (const y of [0, 0, 0.6, 1.7, 2.5, 1.8, 0.5, 0, 0]) {
    state.position.z += 1.5;
    state.position.y = 15 + y;
    tick();
  }
  const rows = drawnRows(mesh);
  assert.equal(rows.length, 9);
  assert.ok(Math.abs(rows[0].y - rows.at(-1).y) < 1e-6);
  assert.ok(rows[4].y > rows[0].y + 2);

  const { geometry } = mesh;
  const positions = geometry.attributes.position.array.slice();
  const fades = geometry.attributes.fade.array.slice();
  const indexCount = geometry.drawRange.count;
  const { opacity } = mesh.material.uniforms;
  const visibleOpacity = opacity.value;
  assert.ok(mesh.visible && Math.max(...fades) > 0);

  tick({ paused: true, position: state.position.clone().addScalar(12) });
  assert.deepEqual(geometry.attributes.position.array, positions);
  assert.deepEqual(geometry.attributes.fade.array, fades);
  assert.equal(geometry.drawRange.count, indexCount);
  assert.equal(opacity.value, visibleOpacity);

  fly(1);
  assert.ok(drawnRows(mesh)[1].distanceTo(rows[0]) < 1e-6);
});

test('Reset, reduced motion, inactive mode and teleport discard wake history', (t) => {
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
