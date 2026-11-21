import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import { sweepGeometry } from '../track/geometry.js';
import { createRoadEdit } from './road-edit.js';
import { createRouteSampler } from './route.js';

function circuit() {
  return {
    id: 'live-preview',
    courseType: 'circuit',
    width: 40,
    autoCloseRoll: false,
    rolls: [],
    jumps: [],
    points: Array.from({ length: 12 }, (_, i) => ({
      id: 'point-' + i,
      x: 400 * Math.cos((i * Math.PI) / 6),
      y: 110 + 16 * Math.cos((i * Math.PI) / 3),
      z: 400 * Math.sin((i * Math.PI) / 6),
      bank: 0,
      roll: 0,
    })),
  };
}

function preview(doc, intervals = null) {
  const route = createRouteSampler(doc),
    group = new T.Group();
  for (const [start, end] of intervals ?? [[0, route.length]]) {
    const surface = new T.Mesh(
      sweepGeometry(
        route,
        [
          [-20, 0],
          [20, 0],
        ],
        { start, end, step: 3, transverseStep: 5 },
      ),
    );
    surface.userData.drivingSurface = true;
    group.add(surface);
  }
  return { group, edit: createRoadEdit(doc, group) };
}
const dist = (a, b) => new T.Vector3(...a).distanceTo(new T.Vector3(...b));

test('held roll and bank trim deform the visible surface to its rebuilt pose and cancel byte-exactly', () => {
  const doc = circuit();
  const { group, edit } = preview(doc);
  const g = group.children[0].geometry;
  const positions = g.attributes.position.array.slice(),
    normals = g.attributes.normal.array.slice();
  const start = edit.getState(4).sample,
    far = edit.getState(9).sample;
  const next = structuredClone(doc);
  next.points[4].roll = 1.1;
  next.points[4].bank = 0.19;
  assert(edit.update(next, [4]));
  const after = edit.getState(4);
  assert(after.active && after.changedRows > 0);
  assert.equal(g, group.children[0].geometry);
  assert(dist(after.sample.center, start.center) < 0.002);
  assert(dist(after.sample.right, start.right) > 19);
  assert.deepEqual(edit.getState(9).sample, far);
  const rebuilt = preview(next).edit.getState(4).sample;
  assert(dist(rebuilt.right, after.sample.right) < 0.005);
  assert(dist(rebuilt.left, after.sample.left) < 0.005);
  next.points[4].bank = -0.11;
  edit.update(next, [4]);
  assert(
    dist(
      preview(next).edit.getState(4).sample.right,
      edit.getState(4).sample.right,
    ) < 0.005,
  );
  edit.clear();
  assert.deepEqual(g.attributes.position.array, positions);
  assert.deepEqual(g.attributes.normal.array, normals);
  assert.equal(edit.getState(4).active, false);
});

test('group height and horizontal edits follow the spline, including the seam and a second edit before replacement', () => {
  const doc = circuit(),
    { edit } = preview(doc);
  const far = edit.getState(6).sample;
  const next = structuredClone(doc);
  for (const i of [0, 1, 11]) {
    next.points[i].y += 32;
    next.points[i].x += 14;
  }
  const original = [0, 1, 11].map((i) => edit.getState(i).sample);
  edit.update(next, [0, 1, 11]);
  for (const [index, i] of [0, 1, 11].entries()) {
    const actual = edit.getState(i).sample.center,
      before = original[index].center;
    assert(Math.abs(actual[0] - before[0] - 14) < 0.06);
    assert(Math.abs(actual[1] - before[1] - 32) < 0.06);
  }
  assert.deepEqual(far, edit.getState(6).sample);
  const prior = edit.getState(0).sample;
  next.points[6].roll = -1.5;
  edit.update(next, [6]);
  assert.deepEqual(prior, edit.getState(0).sample);
  assert(dist(edit.getState(6).sample.right, far.right) > 26);
  assert.equal(
    edit.update({ ...doc, points: doc.points.slice(1) }, [0]),
    false,
  );
  assert.deepEqual(edit.getState(0).sample, original[0]);
});

test('jump gaps retain their missing deck and endpoint rows remain pickable during a drag', () => {
  const doc = circuit();
  const length = createRouteSampler(doc).length;
  const { group, edit } = preview(doc, [
    [0, length * 0.21],
    [length * 0.39, length],
  ]);
  const indices = group.children.map((m) => m.geometry.index.array.slice());
  const next = structuredClone(doc);
  next.points[3].y += 50;
  edit.update(next, [3]);
  const row = edit.getState(3).sample;
  assert(
    row.station < length * 0.21 + 0.01 || row.station > length * 0.39 - 0.01,
  );
  group.children.forEach((mesh, i) =>
    assert.deepEqual(mesh.geometry.index.array, indices[i]),
  );
});

test('road-mounted fixtures and pickup hardware follow group height while a grounded footing stays at its surveyed base', () => {
  const doc = circuit(),
    route = createRouteSampler(doc);
  const middle = 4,
    parameter = middle / doc.points.length;
  const distance =
    route.curve.getLengths()[
      Math.round(route.curve.arcLengthDivisions * parameter)
    ];
  const frame = route.sample(distance),
    base = 40;
  const group = new T.Group(),
    mesh = new T.InstancedMesh(
      new T.BoxGeometry(),
      new T.MeshBasicMaterial(),
      3,
    );
  const pierTop = frame.position.clone().addScaledVector(frame.right, 5);
  const beam = new T.Matrix4()
    .makeScale(4, pierTop.y - base, 5)
    .setPosition(pierTop.x, (base + pierTop.y) / 2, pierTop.z);
  const foot = new T.Matrix4()
    .makeScale(9, 3, 10)
    .setPosition(pierTop.x, base + 1.5, pierTop.z);
  const lamp = new T.Matrix4().makeTranslation(
    frame.position.x,
    frame.position.y + 6,
    frame.position.z,
  );
  for (const [i, m] of [beam, foot, lamp].entries()) mesh.setMatrixAt(i, m);
  mesh.userData.instanceMetadata = [
    { distance, pierTop, base, footing: false },
    { distance, pierTop, base, footing: true },
    { distance, grounded: false },
  ];
  group.add(mesh);
  const pickups = { group: new T.Group(), devices: [{ distance }] };
  const pickup = new T.Group();
  pickups.group.add(pickup);
  const edit = createRoadEdit(doc, group, pickups),
    next = structuredClone(doc);
  for (const i of [3, 4, 5, 6]) next.points[i].y += 38;
  edit.update(next, [3, 4, 5, 6]);
  const m = new T.Matrix4();
  mesh.getMatrixAt(0, m);
  assert(Math.abs(m.elements[5] - beam.elements[5] - 38) < 0.01);
  assert(Math.abs(m.elements[13] - beam.elements[13] - 19) < 0.01);
  mesh.getMatrixAt(1, m);
  assert.equal(m.elements[13], base + 1.5);
  mesh.getMatrixAt(2, m);
  assert(Math.abs(m.elements[13] - lamp.elements[13] - 38) < 0.01);
  assert(Math.abs(pickup.matrix.elements[13] - 38) < 0.02);
  edit.clear();
  assert.deepEqual(pickup.matrix.toArray(), new T.Matrix4().toArray());
});

test('downhill pre-grid rows move with the starting frame and preserve their longitudinal offsets', () => {
  const doc = circuit();
  doc.courseType = 'downhill';
  const route = createRouteSampler(doc);
  const track = {
    ...route,
    sample(s) {
      const frame = route.sample(s);
      if (s < 0) frame.position.copy(route.positionAt(s));
      return frame;
    },
  };
  const group = new T.Group();
  const mesh = new T.Mesh(
    sweepGeometry(
      track,
      [
        [-20, 0],
        [20, 0],
      ],
      { start: -70, end: route.length, step: 4 },
    ),
  );
  mesh.userData.drivingSurface = true;
  mesh.frustumCulled = false;
  group.add(mesh);
  const original = mesh.geometry.attributes.position.array.slice(0, 3);
  const edit = createRoadEdit(doc, group);
  const next = structuredClone(doc);
  for (const p of next.points) p.y += 50;
  edit.update(next, [0]);
  const first = mesh.geometry.attributes.position.array;
  assert(
    Math.abs(first[0] - original[0]) < 0.02 &&
      Math.abs(first[1] - original[1] - 50) < 0.02 &&
      Math.abs(first[2] - original[2]) < 0.02,
  );
  edit.clear();
  assert.deepEqual(first.slice(0, 3), original);
  assert.equal(mesh.frustumCulled, false);
});
