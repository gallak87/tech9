import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_SCENES } from '../src/world.js';
import { VIEW_WIDTH as W, VIEW_HEIGHT as H } from '../src/rendering.js';
import {
  worldViewCamera,
  worldViewSurfaceSize,
  worldViewTiles,
} from '../src/world-view-camera.js';
import {
  canOpenWorldView,
  mountWorldView,
  worldViewShortcut,
} from '../src/world-view.js';

test('world view begins at the untouched camera and fits every map beneath its controls', () => {
  const start = { x: 1700, y: 980 };
  for (const scene of Object.values(ALL_SCENES)) {
    const before = JSON.stringify({ scene, start });
    assert.deepEqual(worldViewCamera(scene, start, 0), { ...start, zoom: 1 });
    const end = worldViewCamera(scene, start, 1),
      left = -end.x * end.zoom,
      top = -end.y * end.zoom;
    assert.ok(left >= 24 - 1e-9, scene.id + ' left');
    assert.ok(
      left + scene.width * end.zoom <= W - 24 + 1e-9,
      scene.id + ' right',
    );
    assert.ok(top >= 54 - 1e-9, scene.id + ' top');
    assert.ok(
      top + scene.height * end.zoom <= H - 28 + 1e-9,
      scene.id + ' bottom',
    );
    let previous = 1;
    for (let t = 0; t <= 1; t += 0.05) {
      const c = worldViewCamera(scene, start, t);
      assert.ok(c.zoom <= previous);
      previous = c.zoom;
    }
    assert.equal(JSON.stringify({ scene, start }), before);
  }
});

test('native viewport tiles cover the entire scene exactly, including partial edge tiles', () => {
  for (const scene of Object.values(ALL_SCENES)) {
    const tiles = [...worldViewTiles(scene)];
    assert.equal(
      tiles.reduce((area, t) => area + t.width * t.height, 0),
      scene.width * scene.height,
      scene.id,
    );
    for (const t of tiles) {
      assert.ok(t.x + t.width <= scene.width && t.y + t.height <= scene.height);
      assert.ok(t.width > 0 && t.width <= W && t.height > 0 && t.height <= H);
      assert.equal(t.x % W, 0);
      assert.equal(t.y % H, 0);
    }
    assert.equal(new Set(tiles.map((t) => `${t.x},${t.y}`)).size, tiles.length);
  }
});

test('temporary map surface stays within a fixed pixel budget without enlarging art', () => {
  for (const scene of [
    ...Object.values(ALL_SCENES),
    { width: 100_000, height: 50_000 },
  ]) {
    const size = worldViewSurfaceSize(scene);
    assert.ok(size.width * size.height <= 16_777_216);
    assert.ok(size.width <= scene.width && size.height <= scene.height);
    assert.ok(
      Math.abs(size.width / size.height - scene.width / scene.height) < 0.01,
    );
  }
});

function fixture(t) {
  const frames = new Map(),
    canvases = [],
    logs = [],
    observers = [];
  let nextFrame = 0,
    failDraw = false;
  const document = { activeElement: null };
  function element(tag) {
    const node = {
      tag,
      children: [],
      events: {},
      inert: false,
      isConnected: true,
      clientWidth: 390,
      clientHeight: 844,
      append(...nodes) {
        this.children.push(...nodes);
      },
      setAttribute() {},
      addEventListener(name, handler) {
        this.events[name] = handler;
      },
      removeEventListener(name) {
        delete this.events[name];
      },
      getClientRects() {
        return this.hidden ? [] : [{}];
      },
      querySelectorAll(selector) {
        return this.children.flatMap((child) => [
          ...(child.tag === selector ? [child] : []),
          ...child.querySelectorAll(selector),
        ]);
      },
      focus() {
        document.activeElement = this;
      },
      remove() {
        this.isConnected = false;
      },
      querySelector(selector) {
        return (
          this.children.find((child) => child.tag === selector) ||
          this.children
            .map((child) => child.querySelector(selector))
            .find(Boolean)
        );
      },
      set innerHTML(value) {
        if (value.includes('<header>')) {
          const button = element('button');
          button.append(element('kbd'));
          this.append(element('strong'), button, element('p'));
        }
      },
    };
    if (tag === 'canvas') {
      const context = {
        globalAlpha: 1,
        draws: [],
        drawImage(...args) {
          if (failDraw) throw Error('Canvas unavailable');
          this.draws.push(args);
        },
        createImageData(width, height) {
          return { data: new Uint8ClampedArray(width * height * 4) };
        },
        putImageData(pixels) {
          this.pixels = pixels;
        },
      };
      for (const method of [
        'setTransform',
        'clearRect',
        'fillRect',
        'save',
        'restore',
        'translate',
        'scale',
        'beginPath',
        'arc',
        'stroke',
        'strokeRect',
      ])
        context[method] = () => {};
      node.getContext = () => context;
      canvases.push(node);
    }
    return node;
  }
  const host = element('main'),
    hud = element('aside'),
    existingModal = element('aside'),
    dev = element('aside');
  dev.id = 'dev-tools';
  existingModal.inert = true;
  host.append(hud, existingModal, dev);
  const previousFocus = element('button');
  previousFocus.focus();
  document.createElement = element;
  document.querySelector = (selector) => (selector === '#game' ? host : null);
  for (const [name, value] of Object.entries({
    document,
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe() {}
      disconnect() {}
    },
    requestAnimationFrame: (callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else delete globalThis[name];
    });
  }
  const game = {
    mode: 'world',
    battle: null,
    transition: null,
    visualTime: 4,
    keys: new Set(['w']),
    moving: true,
    movePath: [{ x: 80, y: 80 }],
    camera: { x: 0, y: 0 },
    followers: [],
    audio: { unlock() {} },
    scene: {
      id: 'overview-test',
      name: 'Test coast',
      biome: 'coast',
      width: 960,
      height: 540,
      objects: [],
      portals: [],
    },
    state: {
      x: 60,
      y: 90,
      facing: 'down',
      settings: { reducedMotion: true },
      fog: { haventide: [1] },
      playTime: 25,
    },
    get visualState() {
      return this.state;
    },
    log(type, data) {
      logs.push({ type, ...data });
    },
  };
  game.ui = {
    menu: false,
    panel: null,
    get blocked() {
      return this.menu || !!this.panel || !!game.worldView?.open;
    },
    positionInteraction() {},
  };
  game.worldView = mountWorldView(game);
  const root = host.children.at(-1),
    view = game.worldView;
  return {
    game,
    view,
    root,
    hud,
    existingModal,
    dev,
    frames,
    canvases,
    logs,
    previousFocus,
    document,
    observers,
    failDraw() {
      failDraw = true;
    },
    frame() {
      const [id, callback] = frames.entries().next().value;
      frames.delete(id);
      callback(performance.now() + 1000);
    },
  };
}

const key = (value, extra = {}) => ({
  key: value,
  preventDefault() {
    this.prevented = true;
  },
  ...extra,
});

test('the production shortcut pauses exploration and returns without changing the expedition', (t) => {
  const f = fixture(t),
    { game, view, root, hud, existingModal, dev, canvases, frames } = f;
  const before = JSON.stringify({ state: game.state, camera: game.camera });
  assert.equal(view.handleKey(key('r')), true);
  assert.equal(view.open, true);
  assert.equal(game.ui.blocked, true);
  assert.equal(root.hidden, false);
  assert.equal(hud.inert, true);
  assert.equal(dev.inert, false);
  assert.equal(game.keys.size, 0);
  assert.deepEqual(game.movePath, []);
  assert.equal(game.moving, false);
  assert.equal(
    view.openView(),
    false,
    'Opening twice must not allocate another map',
  );
  const image = canvases[1],
    scratch = canvases[2],
    fog = canvases.find((canvas) => canvas.getContext('2d').pixels);
  assert.ok(fog, 'Normal play creates an exploration mask');
  assert.equal(
    canvases[0].getContext('2d').draws.at(-1)[0],
    fog,
    'Fog covers even the first frame before the flyout',
  );
  while (frames.size) f.frame();
  assert.match(root.querySelector('p').textContent, /amber ring/);
  assert.match(root.querySelector('p').textContent, /Explored terrain/);
  view.handleKey(key('Tab'));
  assert.equal(f.document.activeElement, root.querySelector('button'));
  view.handleKey(key('R'));
  assert.equal(view.open, false);
  assert.equal(game.ui.blocked, false);
  assert.equal(root.hidden, true);
  assert.equal(hud.inert, false);
  assert.equal(existingModal.inert, true);
  assert.equal(f.document.activeElement, f.previousFocus);
  assert.equal(image.width, 0);
  assert.equal(scratch.width, 0);
  assert.equal(frames.size, 0);
  assert.equal(fog.width, 0);
  assert.equal(
    JSON.stringify({ state: game.state, camera: game.camera }),
    before,
  );
  assert.deepEqual(f.logs, []);
});

test('the dev overview can reveal the full scene without changing normal exploration', (t) => {
  const f = fixture(t),
    { game, view, canvases } = f,
    before = JSON.stringify(game.state);
  assert.equal(view.openView({ revealAll: true }), true);
  while (f.frames.size) f.frame();
  assert.match(f.root.querySelector('p').textContent, /Full map/);
  assert.equal(
    canvases.some((canvas) => canvas.getContext('2d').pixels),
    false,
  );
  view.close();
  assert.equal(JSON.stringify(game.state), before);
  view.openView();
  assert.ok(
    canvases.some((canvas) => canvas.getContext('2d').pixels),
    'Full reveal does not carry over to the field button',
  );
  view.close();
});

test('world view leaves menus, battles, travel, typing and custom R bindings alone', (t) => {
  const { game, view } = fixture(t);
  for (const [owner, property, value] of [
    [game, 'mode', 'title'],
    [game, 'mode', 'battle'],
    [game, 'battle', {}],
    [game, 'transition', {}],
    [game.state, 'recruitmentWalk', {}],
    [game.ui, 'menu', true],
    [game.ui, 'panel', { type: 'dialogue' }],
  ]) {
    const previous = owner[property];
    owner[property] = value;
    assert.equal(canOpenWorldView(game), false, property);
    assert.equal(view.openView(), false);
    assert.equal(view.handleKey(key('r')), false);
    owner[property] = previous;
  }
  for (const extra of [
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { isComposing: true },
    { target: { closest: () => ({}) } },
  ])
    assert.equal(view.handleKey(key('r', extra)), false);
  view.handleKey(key('r', { repeat: true }));
  assert.equal(view.open, false);
  for (const action of ['up', 'left', 'down', 'right', 'interact']) {
    game.state.settings.keys = { [action]: 'R' };
    assert.equal(worldViewShortcut(game.state.settings), '');
    assert.equal(view.handleKey(key('r')), false);
  }
  assert.equal(
    view.openView(),
    true,
    'The button still opens when R has another binding',
  );
  assert.equal(view.handleKey(key('Escape')), true);
  assert.equal(view.open, false);
});

test('closing during preparation cancels rendering; errors and disposal release the modal', (t) => {
  const f = fixture(t),
    { view, root, frames, hud } = f;
  view.openView();
  assert.ok(frames.size > 0);
  view.handleKey(key('Escape'));
  assert.equal(frames.size, 0);
  assert.equal(hud.inert, false);
  view.openView();
  f.failDraw();
  f.frame();
  assert.equal(view.open, false);
  assert.equal(root.hidden, true);
  assert.equal(hud.inert, false);
  assert.equal(frames.size, 0);
  assert.equal(f.logs[0].type, 'world_view_error');
  view.dispose();
  assert.equal(root.isConnected, false);
  assert.equal(f.canvases[0].width, 0);
});

test('mobile overview retains scene proportions in portrait and after rotation', (t) => {
  const f = fixture(t);
  f.game.mobile = { enabled: true };
  assert.equal(f.view.openView({ revealAll: true }), true);
  const screen = f.canvases[0];
  assert.equal(screen.width, 585);
  assert.equal(screen.height, 1266);
  while (f.frames.size) f.frame();
  const camera = worldViewCamera(f.game.scene, f.game.camera, 1, {
    width: 390,
    height: 844,
  });
  assert.ok(camera.zoom * f.game.scene.width <= 390 - 48);
  assert.ok(camera.zoom * f.game.scene.height <= 844 - 82);
  f.root.clientWidth = 844;
  f.root.clientHeight = 390;
  f.observers[0].callback();
  assert.equal(screen.width, 1266);
  assert.equal(screen.height, 585);
  assert.equal(f.view.open, true);
  f.view.dispose();
});
