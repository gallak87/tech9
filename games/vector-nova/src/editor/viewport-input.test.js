import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { bindEditorViewportInput } from './viewport-input.js';

function harness(t, { tool = 'draw', courseType = 'downhill', points } = {}) {
  const originals = new Map(
    ['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame'].map(
      (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)],
    ),
  );
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { hidden: false });
  const frames = new Map();
  let nextFrame = 0;
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: window },
    document: { configurable: true, value: document },
    requestAnimationFrame: {
      configurable: true,
      value: (fn) => {
        const id = ++nextFrame;
        frames.set(id, fn);
        return id;
      },
    },
    cancelAnimationFrame: {
      configurable: true,
      value: (id) => frames.delete(id),
    },
  });
  const captured = new Set();
  const canvas = Object.assign(new EventTarget(), {
    clientWidth: 1000,
    clientHeight: 600,
    style: {},
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 1000,
      height: 600,
    }),
    focus() {},
    setPointerCapture: (id) => captured.add(id),
    hasPointerCapture: (id) => captured.has(id),
    releasePointerCapture: (id) => captured.delete(id),
  });
  const camera = new T.PerspectiveCamera(48, 1000 / 600, 0.5, 200000);
  camera.position.set(0, 500, 800);
  camera.lookAt(0, 52, 0);
  camera.updateMatrixWorld();
  const deck = new T.Mesh(
    new T.PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2),
    new T.MeshBasicMaterial({ side: T.DoubleSide }),
  );
  deck.position.y = 52;
  deck.userData.roadSurface = true;
  const group = new T.Group();
  group.add(deck);
  const h = {
    camera,
    canvas,
    window,
    document,
    captured,
    doc: {
      courseType,
      points: points ?? [
        { id: 'point-a', x: -100, y: 52, z: 0 },
        { id: 'point-b', x: 100, y: 52, z: 0 },
      ],
    },
    selection: { selectedPoint: 1, drawMode: tool === 'draw', tool },
    hit: null,
    hover: null,
    ghost: null,
    selected: [],
    added: [],
    moved: [],
    rolled: [],
    bankEnded: 0,
    bankCancelled: 0,
    ended: 0,
    cancelled: 0,
    orbit: 0,
    pan: 0,
    before: null,
  };
  const handles = {
    pick: () => h.hit,
    point: (index) => {
      const p = h.doc.points[index];
      return new T.Vector3(p.x, p.y, p.z);
    },
    setDragging: (value) => {
      h.dragging = value;
    },
    setHover: (value) => {
      const changed = JSON.stringify(value) !== JSON.stringify(h.hover);
      h.hover = value;
      return changed;
    },
    setDrawCursor: (value) => {
      const changed = JSON.stringify(value) !== JSON.stringify(h.ghost);
      h.ghost = value;
      return changed;
    },
  };
  h.input = bindEditorViewportInput(canvas, {
    getCamera: () => camera,
    getWorld: () => ({ group }),
    getDocument: () => h.doc,
    getHandles: () => handles,
    getSelection: () => h.selection,
    getCameraState: () => ({}),
    isFlying: () => false,
    onOrbit: () => h.orbit++,
    onPan(dx, dy, _start, ground) {
      h.pan++;
      h.lastPan = { dx, dy, ground };
    },
    onSelectPoint(index, meta) {
      h.selected.push({ index, meta });
      h.selection.selectedPoint = index;
      if (meta.finishDrawing || !meta.preserveTool) {
        h.selection.tool = 'move';
        h.selection.drawMode = false;
      }
      h.input?.syncTool();
    },
    onAddPoint(point) {
      h.added.push(point);
      h.doc.points.push({ id: `point-${h.doc.points.length}`, ...point });
      h.selection.selectedPoint = h.doc.points.length - 1;
    },
    onDragPoint(index, point) {
      h.before ??= structuredClone(h.doc);
      Object.assign(h.doc.points[index], point);
      h.moved.push({ index, ...point });
    },
    onDragEnd() {
      h.before = null;
      h.ended++;
    },
    onDragCancel() {
      if (h.before) h.doc = h.before;
      h.before = null;
      h.cancelled++;
    },
    onBankDrag(index, roll) {
      h.before ??= structuredClone(h.doc);
      h.doc.points[index].roll = roll;
      h.rolled.push({ index, roll });
    },
    onBankDragEnd() {
      h.before = null;
      h.bankEnded++;
    },
    onBankDragCancel() {
      if (h.before) h.doc = h.before;
      h.before = null;
      h.bankCancelled++;
    },
    draw() {},
  });
  h.event = (type, options = {}, target = canvas) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, {
      pointerId: 1,
      button: 0,
      clientX: 500,
      clientY: 300,
      shiftKey: false,
      ...options,
    });
    target.dispatchEvent(event);
  };
  h.frame = () => {
    const queued = [...frames.values()];
    frames.clear();
    queued.forEach((fn) => fn(0));
  };
  h.screen = (point) => {
    const p = new T.Vector3(point.x, point.y, point.z).project(camera);
    return { clientX: (p.x + 1) * 500, clientY: (1 - p.y) * 300 };
  };
  h.setTool = (value) => {
    h.selection.tool = value;
    h.selection.drawMode = value === 'draw';
    h.input.syncTool();
  };
  t.after(() => {
    h.input.dispose();
    deck.geometry.dispose();
    deck.material.dispose();
    for (const [key, descriptor] of originals)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
  });
  return h;
}

test('Draw survives a height-handle edit and can place the next point above an existing road deck', (t) => {
  const h = harness(t);
  const at = h.screen(h.doc.points[1]);
  h.hit = { kind: 'height', index: 1 };
  h.event('pointerdown', at);
  for (const delta of [20, 40, 60]) {
    h.event('pointermove', { ...at, clientY: at.clientY - delta });
    h.frame();
  }
  h.event('pointerup', { ...at, clientY: at.clientY - 60 });
  assert.ok(h.doc.points[1].y > 52);
  assert.equal(h.selection.tool, 'draw');
  assert.equal(h.selection.drawMode, true);
  assert.equal(h.ended, 1, 'height drag is one undo transaction');
  assert.equal(h.selected[0].meta.preserveTool, true);
  const height = h.doc.points[1].y;
  h.hit = null;
  h.event('pointerdown');
  h.event('pointerup');
  assert.equal(h.added.length, 1, 'a road hit must not swallow Draw placement');
  assert.equal(
    h.added[0].y,
    height,
    'new point inherits the changed drawing height',
  );
  assert.equal(h.doc.points.length, 3);
});

test('Alt makes a height gesture precise while keeping one undo transaction', (t) => {
  const h = harness(t, { tool: 'height' });
  const at = h.screen(h.doc.points[1]);
  h.hit = { kind: 'height', index: 1 };
  h.event('pointerdown', at);
  h.event('pointermove', { ...at, clientY: at.clientY - 40 });
  h.frame();
  const ordinaryDelta = h.doc.points[1].y - 52;
  h.event('pointermove', { ...at, clientY: at.clientY - 40, altKey: true });
  h.frame();
  const fineDelta = h.doc.points[1].y - 52;
  assert.ok(ordinaryDelta > 0);
  assert.ok(fineDelta > 0 && fineDelta < ordinaryDelta);
  assert.ok(
    Math.abs(fineDelta - ordinaryDelta * 0.2) <= 1,
    'fine movement respects the metre grid',
  );
  h.event('pointerup', { ...at, clientY: at.clientY - 40, altKey: true });
  assert.equal(h.ended, 1);
  assert.equal(h.selection.tool, 'height');
});

test('Draw point selection and Shift-height edits preserve the active drawing tool', (t) => {
  const h = harness(t);
  h.hit = { kind: 'point', index: 0 };
  const at = h.screen(h.doc.points[0]);
  h.event('pointerdown', at);
  h.event('pointerup', at);
  assert.equal(h.selection.tool, 'draw');
  assert.equal(h.selection.selectedPoint, 0);
  assert.equal(h.moved.length, 0);
  h.event('pointerdown', { ...at, shiftKey: true });
  h.event('pointermove', { ...at, clientY: at.clientY - 45, shiftKey: true });
  h.frame();
  h.event('pointerup', { ...at, clientY: at.clientY - 45, shiftKey: true });
  assert.ok(h.doc.points[0].y > 52);
  assert.equal(h.selection.tool, 'draw');
  assert.equal(h.ended, 1);
  assert.equal(
    h.selected.at(-1).meta.extendRange,
    false,
    'height drag does not select a range',
  );
});

test('Move changes XZ while Height changes Y, and both keep their selected tool', (t) => {
  const h = harness(t, { tool: 'move' });
  h.hit = { kind: 'point', index: 1 };
  let at = h.screen(h.doc.points[1]);
  h.event('pointerdown', at);
  h.event('pointermove', { ...at, clientX: at.clientX + 45 });
  h.frame();
  h.event('pointerup', { ...at, clientX: at.clientX + 45 });
  assert.notEqual(h.doc.points[1].x, 100);
  assert.equal(h.doc.points[1].y, 52);
  assert.equal(h.selection.tool, 'move');
  const before = { ...h.doc.points[1] };
  h.setTool('height');
  at = h.screen(before);
  h.event('pointerdown', at);
  h.event('pointermove', { ...at, clientY: at.clientY - 50 });
  h.frame();
  h.event('pointerup', { ...at, clientY: at.clientY - 50 });
  assert.ok(h.doc.points[1].y > before.y);
  assert.equal(h.doc.points[1].x, before.x);
  assert.equal(h.doc.points[1].z, before.z);
  assert.equal(h.selection.tool, 'height');
  assert.equal(h.ended, 2);
});

test('Select is click-only; Orbit and Pan primary drags never select or modify a road point', (t) => {
  const h = harness(t, { tool: 'select' });
  h.hit = { kind: 'point', index: 1 };
  h.event('pointerdown');
  h.event('pointermove', { clientX: 550 });
  h.frame();
  h.event('pointerup', { clientX: 550 });
  assert.equal(h.selected.length, 0);
  h.event('pointerdown');
  h.event('pointerup');
  assert.equal(h.selected.length, 1);
  assert.equal(h.moved.length, 0);
  h.setTool('orbit');
  h.event('pointerdown');
  h.event('pointermove', { clientX: 540 });
  h.event('pointerup', { clientX: 540 });
  h.setTool('pan');
  h.event('pointerdown');
  h.event('pointermove', { clientY: 350 });
  h.event('pointerup', { clientY: 350 });
  assert.equal(h.orbit, 1);
  assert.equal(h.pan, 1);
  assert.equal(h.selected.length, 1);
  assert.equal(h.moved.length, 0);
  assert.equal(h.added.length, 0);
});

test('empty ground pans the view and a Draw drag never becomes a click', (t) => {
  const h = harness(t, { tool: 'move', points: [] });
  const ground = { clientX: 100, clientY: 150 };
  const moved = { clientX: 140, clientY: 180 };
  h.event('pointermove', ground);
  assert.equal(h.canvas.style.cursor, 'grab');
  h.event('pointerdown', ground);
  h.event('pointermove', { ...ground, clientX: 101 });
  assert.equal(h.pan, 0, 'ordinary click jitter does not pan');
  h.event('pointermove', moved);
  assert.equal(h.canvas.style.cursor, 'grabbing');
  h.event('pointerup', moved);
  assert.deepEqual(h.lastPan, { dx: 40, dy: 30, ground: true });
  assert.deepEqual(h.doc.points, []);
  assert.deepEqual(h.selected, []);

  h.setTool('draw');
  h.event('pointerdown', ground);
  h.event('pointermove', moved);
  h.event('pointermove', ground);
  h.event('pointerup', ground);
  assert.deepEqual(h.lastPan, { dx: 0, dy: 0, ground: true });
  assert.deepEqual(
    h.added,
    [],
    'a drag that returns to its start places nothing',
  );

  h.event('pointerdown');
  h.event('pointerup');
  assert.equal(h.added.length, 1, 'a new click still places a point');
});

test('switching tools cancels the current transaction and queued movement, and clears stale hover guidance', (t) => {
  const h = harness(t, { tool: 'move' });
  const before = structuredClone(h.doc);
  h.hit = { kind: 'point', index: 1 };
  h.event('pointerdown');
  h.event('pointermove', { clientX: 550 });
  h.frame();
  assert.notDeepEqual(h.doc, before);
  h.event('pointermove', { clientX: 580 });
  h.hover = h.hit;
  h.ghost = { x: 20, y: 52, z: 20 };
  h.setTool('orbit');
  h.frame();
  assert.deepEqual(h.doc, before);
  assert.equal(h.cancelled, 1);
  assert.equal(h.ended, 0);
  assert.equal(h.input.isDragging(), false);
  assert.equal(h.captured.size, 0);
  assert.equal(h.hover, null);
  assert.equal(h.ghost, null);
  assert.equal(h.canvas.style.cursor, '');
});

test('pointer cancellation rolls back height once and does not prevent subsequent Draw placement', (t) => {
  const h = harness(t);
  const before = structuredClone(h.doc);
  h.hit = { kind: 'height', index: 1 };
  h.event('pointerdown');
  h.event('pointermove', { clientY: 250 });
  h.frame();
  h.event('pointercancel');
  h.event('lostpointercapture');
  assert.deepEqual(h.doc, before);
  assert.equal(h.cancelled, 1);
  assert.equal(h.selection.tool, 'draw');
  h.hit = null;
  h.event('pointerdown');
  h.event('pointerup');
  assert.equal(h.added.length, 1);
  assert.equal(h.added[0].y, 52);
});

test('the Draw circuit start finishes only after a confirmed click, preserving pointerdown camera and selection', (t) => {
  const h = harness(t, {
    courseType: 'circuit',
    points: [
      { id: 'one', x: -100, y: 52, z: -100 },
      { id: 'two', x: 100, y: 52, z: -100 },
      { id: 'three', x: 100, y: 52, z: 100 },
      { id: 'four', x: -100, y: 52, z: 100 },
    ],
  });
  h.selection.selectedPoint = 3;
  h.hit = { kind: 'point', index: 0 };
  h.event('pointerdown');
  assert.equal(h.selected.length, 0);
  assert.equal(h.selection.selectedPoint, 3);
  assert.equal(h.selection.tool, 'draw');
  h.event('pointerup');
  assert.equal(h.selected.length, 1);
  assert.equal(h.selected[0].meta.finishDrawing, true);
  assert.equal(h.selection.tool, 'move');
});

test('camera shortcuts override Draw without placing a point or consuming a height edit', (t) => {
  const h = harness(t);
  h.hit = { kind: 'height', index: 1 };
  for (const options of [
    { button: 2 },
    { button: 1 },
    { button: 2, shiftKey: true },
  ]) {
    h.event('pointerdown', options);
    h.event('pointermove', { ...options, clientX: 550 });
    h.event('pointerup', { ...options, clientX: 550 });
  }
  h.event('keydown', { key: ' ', code: 'Space' });
  h.event('pointerdown');
  h.event('pointermove', { clientX: 550 });
  h.event('pointerup', { clientX: 550 });
  h.event('keyup', { key: ' ', code: 'Space' }, h.window);
  assert.equal(h.orbit, 2);
  assert.equal(h.pan, 2);
  assert.equal(h.selection.tool, 'draw');
  assert.equal(h.selected.length, 0);
  assert.equal(h.moved.length, 0);
  assert.equal(h.added.length, 0);
});

test('legacy selection state defaults to Move and still supports Draw-height-placement without an explicit tool field', (t) => {
  const h = harness(t, { tool: 'move' });
  delete h.selection.tool;
  h.input.syncTool();
  h.hit = { kind: 'point', index: 1 };
  h.event('pointerdown');
  h.event('pointermove', { clientX: 540 });
  h.frame();
  h.event('pointerup', { clientX: 540 });
  assert.notEqual(h.doc.points[1].x, 100);
  assert.equal(h.doc.points[1].y, 52);
  h.selection.drawMode = true;
  h.input.syncTool();
  h.hit = { kind: 'height', index: 1 };
  h.event('pointerdown');
  h.event('pointermove', { clientY: 260 });
  h.frame();
  h.event('pointerup', { clientY: 260 });
  const height = h.doc.points[1].y;
  assert.ok(height > 52);
  assert.equal(h.selection.drawMode, true);
  h.hit = null;
  h.event('pointerdown');
  h.event('pointerup');
  assert.equal(h.added.length, 1);
  assert.equal(h.added[0].y, height);
});

test('Draw can drag ordinary nodes in XZ, including its start, without finishing the circuit or losing placement', (t) => {
  const h = harness(t, {
    courseType: 'circuit',
    points: [
      { id: 'one', x: -100, y: 52, z: -100 },
      { id: 'two', x: 100, y: 52, z: -100 },
      { id: 'three', x: 100, y: 52, z: 100 },
      { id: 'four', x: -100, y: 52, z: 100 },
    ],
  });
  h.selection.selectedPoint = 3;
  h.hit = { kind: 'point', index: 0 };
  const at = h.screen(h.doc.points[0]);
  h.event('pointerdown', at);
  assert.equal(
    h.selected.length,
    0,
    'start selection is deferred until click or actual motion',
  );
  for (const dx of [20, 40, 60]) {
    h.event('pointermove', { ...at, clientX: at.clientX + dx });
    h.frame();
  }
  h.event('pointerup', { ...at, clientX: at.clientX + 60 });
  assert.notEqual(h.doc.points[0].x, -100);
  assert.equal(h.doc.points[0].y, 52);
  assert.equal(h.selection.tool, 'draw');
  assert.equal(h.ended, 1);
  assert.ok(h.selected.every(({ meta }) => !meta.finishDrawing));
  h.hit = null;
  h.event('pointerdown');
  h.event('pointerup');
  assert.equal(h.added.length, 1, 'drawing continues after an XZ adjustment');
  assert.equal(h.doc.points.length, 5);
});

test('plain drags preserve group membership while Shift and Command/Ctrl clicks keep their modifiers', (t) => {
  const h = harness(t, { tool: 'move' });
  h.hit = { kind: 'point', index: 1 };
  h.event('pointerdown');
  assert.equal(h.selected.length, 0);
  h.event('pointermove', { clientX: 555 });
  h.frame();
  h.event('pointerup', { clientX: 555 });
  assert.equal(h.selected[0].meta.preserveSelection, true);
  for (const flag of ['shiftKey', 'metaKey', 'ctrlKey']) {
    h.event('pointerdown', { [flag]: true });
    h.event('pointerup');
    assert.equal(h.selected.at(-1).meta[flag], true);
    assert.equal(h.selected.at(-1).meta.extendRange, flag === 'shiftKey');
  }
});

test('the Roll handle reports signed unwrapped radians, supports Alt and rolls back cancellation', (t) => {
  const h = harness(t, { tool: 'move' });
  const start = Math.PI * 2;
  h.doc.points[1].roll = start;
  h.hit = { kind: 'bank', index: 1 };
  h.event('pointerdown');
  h.event('pointermove', { clientX: 540 });
  h.frame();
  assert.ok(
    Math.abs(h.rolled.at(-1).roll - (start + (50 * Math.PI) / 180)) < 1e-10,
  );
  h.event('pointermove', { clientX: 520, altKey: true });
  h.frame();
  assert.ok(
    Math.abs(h.rolled.at(-1).roll - (start + (45 * Math.PI) / 180)) < 1e-10,
  );
  h.event('pointerup', { clientX: 520 });
  assert.equal(h.bankEnded, 1);
  assert.equal(h.selected.length, 0);
  const previous = h.doc.points[1].roll;
  h.event('pointerdown');
  h.event('pointermove', { clientX: 560 });
  h.frame();
  h.event('pointercancel');
  h.event('lostpointercapture');
  assert.equal(h.bankCancelled, 1);
  assert.equal(h.doc.points[1].roll, previous);
  assert.equal(h.moved.length, 0);
});
