import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  createEditorHandles,
  projectEditorHandle,
  constrainEditorPoint,
} from './viewport-handles.js';

function camera() {
  const result = new T.PerspectiveCamera(48, 1000 / 600, 0.5, 200000);
  result.position.set(0, 180, 420);
  result.lookAt(0, 52, 0);
  result.updateMatrixWorld();
  return result;
}
const draft = () => ({
  courseType: 'downhill',
  points: [
    { id: 'point-one', x: 0, y: 52, z: 0 },
    { id: 'point-two', x: 80, y: 65, z: -100 },
    { id: 'point-three', x: -60, y: 80, z: -200 },
  ],
});

test('3D handles remain pickable on incomplete drafts and their visible elevation arrow has a distinct target', () => {
  const scene = new T.Scene(),
    handles = createEditorHandles(scene),
    view = camera();
  handles.setDocument(draft(), { selectedPoint: 0, drawMode: true });
  handles.update(view, 1000, 600);
  const state = handles.getState();
  assert.equal(state.selectedPointId, 'point-one');
  assert.ok(state.points[0].visible);
  const ray = new T.Raycaster();
  ray.setFromCamera(
    new T.Vector2(state.points[0].x / 500 - 1, 1 - state.points[0].y / 300),
    view,
  );
  assert.deepEqual(handles.pick(ray), { kind: 'point', index: 0 });
  assert.ok(state.heightHandle.visible);
  ray.setFromCamera(
    new T.Vector2(
      state.heightHandle.x / 500 - 1,
      1 - state.heightHandle.y / 300,
    ),
    view,
  );
  assert.deepEqual(handles.pick(ray), { kind: 'height', index: 0 });
  handles.setVisible(false);
  assert.equal(handles.pick(ray), null);
  handles.dispose();
  handles.dispose();
  assert.equal(scene.children.length, 0);
});

test('handle projection clips points behind the camera and keeps the same pixel size at different view depths', () => {
  const view = new T.PerspectiveCamera(48, 1000 / 600, 0.5, 200000);
  view.position.set(0, 0, 1000);
  view.lookAt(0, 0, 0);
  view.updateMatrixWorld();
  assert.equal(
    projectEditorHandle(new T.Vector3(0, 0, 2000), view, 1000, 600).visible,
    false,
  );
  assert.equal(
    projectEditorHandle(new T.Vector3(1e7, 0, 0), view, 1000, 600).visible,
    false,
  );
  const scene = new T.Scene(),
    handles = createEditorHandles(scene);
  handles.setDocument({
    courseType: 'downhill',
    points: [
      { id: 'near', x: -100, y: 0, z: 0 },
      { id: 'far', x: 100, y: 0, z: -1000 },
    ],
  });
  handles.update(view, 1000, 600);
  const mesh = scene.children[0].children[0],
    pixels = [];
  for (let i = 0; i < 2; i++) {
    const matrix = new T.Matrix4();
    mesh.getMatrixAt(i, matrix);
    const center = new T.Vector3().setFromMatrixPosition(matrix),
      radius = new T.Vector3().setFromMatrixScale(matrix).x;
    const a = projectEditorHandle(center, view, 1000, 600),
      b = projectEditorHandle(
        center.clone().add(new T.Vector3(radius, 0, 0)),
        view,
        1000,
        600,
      );
    pixels.push(Math.abs(b.x - a.x));
  }
  assert.ok(Math.abs(pixels[0] - pixels[1]) < 0.001);
  assert.ok(Math.abs(pixels[0] - 6) < 0.001);
  handles.dispose();
});

test('problem halo marks the measured curve position while retaining the editable control ID', () => {
  const scene = new T.Scene(),
    handles = createEditorHandles(scene),
    view = camera();
  const doc = draft();
  const position = [35, 58, -55];
  handles.setDocument(doc, {
    selectedPoint: 1,
    problemPoint: 1,
    problemPosition: position,
  });
  handles.update(view, 1000, 600);
  const marker = handles.getState().problemMarker;
  const expected = projectEditorHandle(
    new T.Vector3(...position),
    view,
    1000,
    600,
  );
  assert.equal(marker.x, expected.x);
  assert.equal(marker.y, expected.y);
  assert.equal(marker.index, 1);
  assert.equal(marker.pointId, doc.points[1].id);
  assert.notEqual(marker.x, handles.getState().points[1].x);
  handles.dispose();
});

test('finishing a drag rebuilds selected-span geometry from the edited route and movement respects authoring bounds', () => {
  const scene = new T.Scene(),
    handles = createEditorHandles(scene),
    doc = draft();
  handles.setDocument(doc, {
    selectedPoint: 0,
    section: { start: 0, end: 0.6 },
  });
  handles.setDragging(true);
  const edited = structuredClone(doc);
  edited.points[0].x = 150;
  handles.setDocument(edited, {
    selectedPoint: 0,
    section: { start: 0, end: 0.6 },
  });
  handles.setDragging(false);
  const selectedLine = scene.children[0].children[5];
  assert.ok(
    Math.abs(selectedLine.geometry.attributes.position.getX(0) - 150) < 0.001,
  );
  assert.deepEqual(constrainEditorPoint({ x: 99999, y: 99999, z: -99999 }), {
    x: 25000,
    y: 3000,
    z: -25000,
  });
  handles.dispose();
});

test('Draw guidance has a bounded 100m grid, follows the editing height, clips the ghost, and distinguishes a circuit closing cue', () => {
  const scene = new T.Scene(),
    handles = createEditorHandles(scene),
    view = camera();
  const doc = { ...draft(), width: 40 };
  handles.setDocument(doc, { selectedPoint: 2, drawMode: true });
  handles.setDrawCursor({ x: 20, y: 52, z: -150 });
  handles.update(view, 1000, 600);
  const drawing = handles.getState().drawing;
  assert.equal(drawing.spacing, 100);
  assert.equal(drawing.planeHeight, 80);
  assert.equal(
    drawing.cursor.world[1],
    80,
    'ghost matches the actual drawing plane',
  );
  assert.equal(drawing.closing, false);
  const grid = scene.getObjectByName('Workshop / 100 metre drawing grid');
  assert.equal(grid.children[0].geometry.attributes.position.count, 124);
  const continuation = scene.getObjectByName('Next road segment');
  const geometry = continuation.geometry;
  for (let i = 0; i < 20; i++) {
    handles.setDrawCursor({ x: 20 + i, y: 52, z: -150 });
    handles.update(view, 1000, 600);
  }
  assert.equal(continuation.geometry, geometry, 'hover reuses GPU buffers');
  handles.setDrawCursor({ x: 0, y: 80, z: 2000 });
  handles.update(view, 1000, 600);
  assert.equal(
    handles.getState().drawing.cursor,
    null,
    'no behind-camera ghost',
  );
  const circuit = {
    ...doc,
    courseType: 'circuit',
    points: [...doc.points, { id: 'fourth', x: -100, y: 52, z: -50 }],
  };
  handles.setDocument(circuit, { selectedPoint: 3, drawMode: true });
  handles.setDrawCursor(circuit.points[0], { closing: true });
  handles.update(view, 1000, 600);
  assert.equal(handles.getState().drawing.closing, true);
  handles.setDocument(circuit, { selectedPoint: 3, drawMode: false });
  handles.update(view, 1000, 600);
  assert.equal(handles.getState().drawing, null);
  assert.equal(grid.visible, false);
  handles.dispose();
  assert.equal(scene.children.length, 0);
});

test('a diagnosed road point stays red when selected and nearby healthy points retain their normal colour', () => {
  const scene = new T.Scene(),
    handles = createEditorHandles(scene);
  handles.setDocument(draft(), { selectedPoint: 1, problemPoint: 1 });
  handles.update(camera(), 1000, 600);
  const dots = scene.children[0].children[0],
    bad = new T.Color(),
    healthy = new T.Color();
  dots.getColorAt(1, bad);
  dots.getColorAt(0, healthy);
  assert.equal(bad.getHexString(), 'ff5a55');
  assert.equal(healthy.getHexString(), 'e7f2f4');
  assert.equal(handles.getState().problemPoint, 1);
  handles.dispose();
});

test('a numbered problem halo stays readable above other handles at both overview and focused zoom, and clips behind the camera', () => {
  const scene = new T.Scene(),
    handles = createEditorHandles(scene),
    view = camera();
  const doc = {
    courseType: 'downhill',
    points: Array.from({ length: 16 }, (_, i) => ({
      id: `point-${i + 1}`,
      x: (i - 13) * 80,
      y: 52,
      z: 0,
    })),
  };
  handles.setDocument(doc, { selectedPoint: 13, problemPoint: 13 });
  const halo = scene.getObjectByName('Workshop / diagnosed road point');
  const dots = scene.children[0].children[0];
  const geometry = halo.geometry;
  for (const distance of [420, 1680]) {
    view.position.set(0, distance * 0.4, distance);
    view.lookAt(0, 52, 0);
    handles.update(view, 1000, 600);
    const marker = handles.getState().problemMarker;
    assert.equal(marker.index, 13);
    assert.equal(marker.number, 14);
    assert.equal(marker.pointId, 'point-14');
    assert.equal(marker.visible, true);
    assert.equal(halo.visible, true);
    assert.equal(halo.material.depthTest, false);
    assert.equal(halo.material.fog, false);
    assert.ok(halo.renderOrder > dots.renderOrder);
    const right = new T.Vector3(1, 0, 0).applyQuaternion(view.quaternion);
    const edge = projectEditorHandle(
      halo.position.clone().addScaledVector(right, halo.scale.x),
      view,
      1000,
      600,
    );
    assert.ok(
      Math.abs(edge.x - marker.x - 18) < 0.001,
      'warning remains18px at any zoom',
    );
    assert.equal(halo.geometry, geometry);
    const ray = new T.Raycaster();
    ray.setFromCamera(
      new T.Vector2(marker.x / 500 - 1, 1 - marker.y / 300),
      view,
    );
    assert.deepEqual(
      handles.pick(ray),
      { kind: 'point', index: 13 },
      'halo does not intercept selection',
    );
  }
  doc.points[13].z = 4000;
  handles.setDocument(doc, { selectedPoint: 13, problemPoint: 13 });
  handles.update(view, 1000, 600);
  assert.equal(handles.getState().problemMarker.visible, false);
  assert.equal(halo.visible, false);
  handles.setDocument(doc, { selectedPoint: 13, problemPoint: null });
  handles.update(view, 1000, 600);
  assert.equal(handles.getState().problemMarker, null);
  let disposed = 0;
  geometry.addEventListener('dispose', () => disposed++);
  handles.dispose();
  handles.dispose();
  assert.equal(disposed, 1);
});
