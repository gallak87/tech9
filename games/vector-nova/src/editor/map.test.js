import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from './document.js';
import { createRouteMap } from './map.js';

const originalPoint = globalThis.DOMPoint;
before(() => {
  globalThis.DOMPoint = class {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
    matrixTransform(m) {
      return {
        x: this.x * m.a + this.y * m.c + m.e,
        y: this.x * m.b + this.y * m.d + m.f,
      };
    }
  };
});
after(() => {
  if (originalPoint) globalThis.DOMPoint = originalPoint;
  else delete globalThis.DOMPoint;
});
class Surface {
  constructor() {
    this.listeners = new Map();
    this.captures = new Set();
    this.dataset = {};
    this.id = 'test-map';
    this.children = [];
    this.ctmScale = 1;
  }
  addEventListener(type, listener, { signal } = {}) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
    signal?.addEventListener(
      'abort',
      () => this.listeners.get(type).delete(listener),
      { once: true },
    );
  }
  emit(type, properties = {}) {
    const event = {
      type,
      target: this,
      pointerId: 1,
      button: 0,
      clientX: 500,
      clientY: 340,
      shiftKey: false,
      preventDefault() {
        this.prevented = true;
      },
      stopPropagation() {
        this.stopped = true;
      },
      ...properties,
    };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return event;
  }
  closest() {
    return null;
  }
  get innerHTML() {
    return this.children.map((child) => child.innerHTML).join('');
  }
  append(child) {
    this.children.push(child);
  }
  getScreenCTM() {
    const scale = this.ctmScale;
    return {
      inverse: () => ({ a: 1 / scale, b: 0, c: 0, d: 1 / scale, e: 0, f: 0 }),
    };
  }
  setPointerCapture(id) {
    this.captures.add(id);
  }
  hasPointerCapture(id) {
    return this.captures.has(id);
  }
  releasePointerCapture(id) {
    this.captures.delete(id);
  }
  replaceChildren() {
    this.children = [];
  }
}
const node = (index) => ({
  dataset: { mapPoint: String(index) },
  closest() {
    return this;
  },
});
const clone = (value) => structuredClone(value);
function fixture() {
  return {
    ...createDocument({ blank: true }),
    points: [
      [0, 0],
      [400, 0],
      [400, 400],
      [0, 400],
    ].map(([x, z], i) => ({
      id: `point-${i + 1}`,
      x,
      y: 50,
      z,
      bank: 0,
      roll: 0,
    })),
  };
}
function harness(initialTool = 'move') {
  const svg = new Surface(),
    view = new Surface();
  svg.ownerDocument = {
    defaultView: view,
    createElementNS: () => ({ innerHTML: '' }),
  };
  let doc = fixture(),
    tool = initialTool,
    selected = 0,
    previous,
    decorations = {};
  const calls = {
    select: [],
    drag: [],
    add: [],
    end: 0,
    cancel: 0,
    bank: [],
    bankEnd: 0,
  };
  const sync = () => map.setDocument(doc, selected, { tool, ...decorations });
  const map = createRouteMap(svg, {
    onSelect(index, meta) {
      calls.select.push({ index, meta });
      selected = index;
      if (!meta?.preserveTool || meta.finishDrawing) tool = 'move';
      sync();
    },
    onAdd(position) {
      calls.add.push(position);
      doc.points.push({
        id: `point-${doc.points.length + 1}`,
        y: doc.points[selected]?.y ?? 50,
        bank: 0,
        roll: 0,
        ...position,
      });
      selected = doc.points.length - 1;
      sync();
    },
    onDrag(index, position, meta) {
      previous ??= clone(doc);
      calls.drag.push({ index, position, meta });
      Object.assign(doc.points[index], position);
      sync();
    },
    onBankDrag(index, roll) {
      previous ??= clone(doc);
      doc.points[index].roll = roll;
      calls.bank.push({ index, roll });
      sync();
    },
    onBankDragEnd() {
      previous = null;
      calls.bankEnd++;
    },
    onDragEnd() {
      calls.end++;
      previous = null;
    },
    onDragCancel() {
      calls.cancel++;
      if (previous) doc = previous;
      previous = null;
      sync();
    },
  });
  sync();
  return {
    svg,
    view,
    map,
    calls,
    get doc() {
      return doc;
    },
    get tool() {
      return tool;
    },
    setTool(next) {
      tool = next;
      sync();
    },
    decorate(options) {
      decorations = options;
      sync();
    },
  };
}
function pointScreen(svg, index) {
  const match = svg.innerHTML.match(
    new RegExp(
      `data-map-point="${index}"[^>]*transform="translate\\(([-\\d.]+) ([-\\d.]+)\\)"`,
    ),
  );
  assert(match);
  return { x: Number(match[1]), y: Number(match[2]) };
}
function gesture(h, index, dx, dy, modifiers = {}) {
  const at = pointScreen(h.svg, index),
    target = node(index);
  h.svg.emit('pointerdown', {
    target,
    clientX: at.x,
    clientY: at.y,
    ...modifiers,
  });
  h.svg.emit('pointermove', {
    target,
    clientX: at.x + dx,
    clientY: at.y + dy,
    ...modifiers,
  });
  h.svg.emit('pointerup', {
    target,
    clientX: at.x + dx,
    clientY: at.y + dy,
    ...modifiers,
  });
  h.svg.emit('click');
}

test('Select chooses points without moving them, while Move edits only X/Z', () => {
  const selected = harness('select'),
    original = clone(selected.doc);
  gesture(selected, 1, 80, 40);
  assert.deepEqual(selected.doc, original);
  assert.equal(
    selected.calls.select.length,
    0,
    'a cancelled click never changes selection',
  );
  gesture(selected, 1, 0, 0);
  assert.equal(selected.calls.select.length, 1);
  assert.equal(selected.calls.select[0].meta.preserveTool, true);
  assert.equal(selected.calls.drag.length, 0);
  assert.equal(selected.calls.end, 0);
  const moved = harness('move');
  gesture(moved, 1, 80, 0);
  assert.notEqual(moved.doc.points[1].x, original.points[1].x);
  assert.equal(Math.abs(moved.doc.points[1].z - original.points[1].z), 0);
  assert.equal(moved.doc.points[1].y, original.points[1].y);
  assert.equal(moved.calls.end, 1);
  assert.deepEqual(Object.keys(moved.calls.drag[0].position).sort(), [
    'x',
    'z',
  ]);
});

test('Height changes only elevation and Draw continues placing after a Shift-height edit', () => {
  const height = harness('height'),
    original = clone(height.doc);
  height.svg.ctmScale = 2;
  gesture(height, 1, 75, -25);
  const ordinary = height.doc.points[1].y - original.points[1].y;
  const fine = harness('height');
  fine.svg.ctmScale = 2;
  gesture(fine, 1, 75, -25, { altKey: true });
  assert.ok(
    ordinary > 13 && ordinary < 14,
    'height follows SVG viewbox units continuously',
  );
  assert.ok(
    Math.abs(fine.doc.points[1].y - original.points[1].y - ordinary * 0.2) <
      1e-8,
  );
  assert.equal(height.doc.points[1].x, original.points[1].x);
  assert.equal(height.doc.points[1].z, original.points[1].z);
  assert.deepEqual(Object.keys(height.calls.drag[0].position), ['y']);
  assert.equal(height.tool, 'height');
  const drawn = harness('draw');
  gesture(drawn, 1, 0, -25, { shiftKey: true });
  assert.equal(drawn.tool, 'draw');
  assert.equal(drawn.calls.select[0].meta.preserveTool, true);
  assert.equal(drawn.calls.drag[0].meta.preserveTool, true);
  const elevated = drawn.doc.points[1].y;
  drawn.svg.emit('pointerdown', { clientX: 80, clientY: 80 });
  drawn.svg.emit('pointerup', { clientX: 80, clientY: 80 });
  drawn.svg.emit('click', { clientX: 80, clientY: 80 });
  assert.equal(
    drawn.calls.add.length,
    1,
    'a pointer click must add exactly one point despite SVG replacement',
  );
  assert.equal(drawn.doc.points.at(-1).y, elevated);
  assert.equal(drawn.tool, 'draw');
});

test('Draw finishes a Circuit start click on release, but dragging the start keeps drawing', () => {
  const finished = harness('draw'),
    target = node(0);
  finished.svg.emit('pointerdown', { target });
  assert.equal(
    finished.calls.select.length,
    0,
    'no finish/camera handoff occurs on pointerdown',
  );
  finished.svg.emit('pointerup', { target });
  finished.svg.emit('click');
  assert.equal(finished.calls.select.length, 1);
  assert.equal(finished.calls.select[0].meta.finishDrawing, true);
  assert.equal(finished.calls.add.length, 0);
  assert.equal(finished.tool, 'move');
  const moved = harness('draw');
  gesture(moved, 0, 25, 0);
  assert.equal(moved.calls.select[0].meta.finishDrawing, undefined);
  assert.equal(moved.calls.end, 1);
  assert.equal(moved.tool, 'draw');
});

for (const type of ['pointercancel', 'lostpointercapture']) {
  test(`${type} rolls back a moved point once instead of committing it`, () => {
    const h = harness('move'),
      original = clone(h.doc),
      target = node(1);
    h.svg.emit('pointerdown', { target });
    h.svg.emit('pointermove', { clientX: 580 });
    assert.notDeepEqual(h.doc, original);
    h.svg.emit(type);
    h.svg.emit('pointerup');
    h.svg.emit('lostpointercapture');
    assert.deepEqual(h.doc, original);
    assert.equal(h.calls.cancel, 1);
    assert.equal(h.calls.end, 0);
    assert.equal(h.svg.captures.size, 0);
  });
}

test('Pan changes only map bounds and cancel restores the previous framing', () => {
  const h = harness('pan'),
    original = clone(h.doc),
    before = pointScreen(h.svg, 0);
  h.svg.emit('pointerdown', { target: node(0), clientX: 400, clientY: 300 });
  h.svg.emit('pointermove', { clientX: 500, clientY: 340 });
  h.svg.emit('pointerup');
  const after = pointScreen(h.svg, 0);
  assert(Math.abs(after.x - before.x - 100) < 0.02);
  assert(Math.abs(after.y - before.y - 40) < 0.02);
  assert.deepEqual(h.doc, original);
  assert.equal(h.calls.select.length, 0);
  assert.equal(h.calls.drag.length, 0);
  h.svg.emit('pointerdown', { clientX: 400, clientY: 300 });
  h.svg.emit('pointermove', { clientX: 450, clientY: 300 });
  h.svg.emit('pointercancel');
  assert.deepEqual(pointScreen(h.svg, 0), after);
  assert.equal(
    h.calls.cancel,
    0,
    'camera panning never opens a road-edit history transaction',
  );
});

test('Escape and a tool change cancel the road transaction without losing the restored document', () => {
  for (const action of ['escape', 'tool']) {
    const h = harness('move'),
      original = clone(h.doc);
    h.svg.emit('pointerdown', { target: node(1) });
    h.svg.emit('pointermove', { clientX: 580 });
    if (action === 'escape') {
      const event = h.view.emit('keydown', { key: 'Escape' });
      assert(event.prevented && event.stopped);
    } else h.setTool('height');
    assert.deepEqual(h.doc, original);
    assert.equal(h.calls.cancel, 1);
    assert.equal(h.calls.end, 0);
    h.map.dispose();
  }
});

test('explicit tools override legacy Draw and unrelated pointer releases do not finish edits', () => {
  const h = harness('move');
  h.map.setDocument(h.doc, 0, { drawMode: true, tool: 'select' });
  h.svg.emit('click');
  assert.equal(h.calls.add.length, 0);
  h.map.setDocument(h.doc, 0, { drawMode: true });
  assert.equal(h.svg.dataset.editorTool, 'draw');
  h.svg.emit('pointerdown', { clientX: 80, clientY: 80, pointerId: 1 });
  h.svg.emit('pointerup', { clientX: 80, clientY: 80, pointerId: 2 });
  assert.equal(h.calls.add.length, 0);
  h.svg.emit('pointerup', { clientX: 80, clientY: 80, pointerId: 1 });
  assert.equal(h.calls.add.length, 1);
});

test('Map handles retain selection on drag, support modifiers on clicks and show the live signed roll', () => {
  const h = harness();
  gesture(h, 1, 0, 0, { shiftKey: true });
  gesture(h, 2, 0, 0, { ctrlKey: true });
  assert.equal(h.calls.select[0].meta.shiftKey, true);
  assert.equal(h.calls.select[1].meta.ctrlKey, true);
  gesture(h, 2, 12, 0);
  assert.equal(h.calls.select[2].meta.preserveSelection, true);

  h.decorate({
    selectedPoints: [0, 2],
    rollRateSections: [{ start: 0.2, end: 0.27 }],
  });
  assert.match(
    h.svg.innerHTML,
    /data-map-point="0" class="workshop-map-point selected/,
  );
  assert.match(
    h.svg.innerHTML,
    /data-map-point="2" class="workshop-map-point selected/,
  );
  assert.match(h.svg.innerHTML, /<title>Fast twist<\/title>/);
  assert.match(h.svg.innerHTML, /data-map-handle="height"/);
  const target = {
    dataset: { mapHandle: 'bank' },
    closest: (selector) => (selector === '[data-map-handle]' ? target : null),
  };
  h.svg.emit('pointerdown', { target, clientX: 500 });
  h.svg.emit('pointermove', { target, clientX: 476 });
  assert.match(h.svg.innerHTML, /Roll −30°/);
  h.svg.emit('pointerup', { target, clientX: 476 });
  assert.equal(h.calls.bankEnd, 1);
  assert.equal(h.calls.bank[0].index, 2);
  assert.equal(
    h.calls.select.length,
    3,
    'the selected Roll handle never reselects the point',
  );
});

test('dense maps keep distant points readable and hit the closest dot outside its small drawn circle', () => {
  const h = harness();
  h.doc.points = Array.from({ length: 126 }, (_, index) => ({
    id: `dense-point-${index}`,
    x: 650 * Math.cos((index * Math.PI) / 63),
    y: 60,
    z: 650 * Math.sin((index * Math.PI) / 63),
    bank: 0,
    roll: 0,
  }));
  h.decorate({});
  assert.equal((h.svg.innerHTML.match(/data-map-point="/g) ?? []).length, 126);
  assert((h.svg.innerHTML.match(/data-map-marker="badge"/g) ?? []).length < 24);
  const match = h.svg.innerHTML.match(
    /data-map-point="(\d+)" class="[^"]*" data-map-marker="dot"/,
  );
  assert(match);
  const index = Number(match[1]);
  const { x, y } = pointScreen(h.svg, index);
  const radial = Math.hypot(x - 500, y - 340);
  const offset = (pixels) => ({
    clientX: x + (pixels * (x - 500)) / radial,
    clientY: y + (pixels * (y - 340)) / radial,
  });
  h.svg.emit('pointermove', offset(8));
  assert.match(
    h.svg.innerHTML,
    new RegExp(
      `data-map-point="${index}" class="[^"]*" data-map-marker="badge"`,
    ),
  );
  h.svg.emit('pointerleave');
  const tap = { ...offset(16), pointerType: 'touch' };
  h.svg.emit('pointerdown', tap);
  h.svg.emit('pointerup', tap);
  assert.equal(h.calls.select[0].index, index);
  assert.equal(h.calls.drag.length, 0);
});

test('a hidden map updates its document without rebuilding markup', () => {
  const h = harness();
  const before = h.svg.innerHTML;
  h.map.setDocument(h.doc, 2, { visible: false, frame: true });
  assert.equal(h.svg.innerHTML, before);
  h.map.setDocument(h.doc, 2, { visible: true });
  assert.match(
    h.svg.innerHTML,
    /data-map-point="2" class="workshop-map-point selected/,
  );
});
