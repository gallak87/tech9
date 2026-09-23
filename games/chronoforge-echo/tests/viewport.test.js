import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createViewport,
  clampCamera,
  clientToView,
  clientToWorld,
  worldToClient,
} from '../src/viewport.js';
import {
  mobileBattleLayout,
  mobileBattlePresentation,
} from '../src/battle-layout.js';
import { createBattle } from '../src/combat.js';
import { createState, recruit } from '../src/progression.js';

test('desktop keeps its logical view and backing scale at every CSS size and quality', () => {
  for (const [cssWidth, cssHeight] of [
    [320, 800],
    [1920, 1080],
    [800, 320],
  ]) {
    const view = createViewport({
      cssWidth,
      cssHeight,
      quality: 'balanced',
      zoom: 0.88,
      pixelRatio: 3,
    });
    assert.equal(view.width, 960);
    assert.equal(view.height, 540);
    assert.equal(view.renderScale, 2);
    assert.equal(view.mobile, false);
  }
});

test('mobile drawing and pointer transforms round trip after rotation, zoom and safe-area offsets', () => {
  for (const [cssWidth, cssHeight] of [
    [393, 560],
    [700, 310],
    [320, 420],
  ]) {
    for (const zoom of [1, 0.88]) {
      const view = createViewport({
        cssWidth,
        cssHeight,
        mobile: true,
        zoom,
        pixelRatio: 3,
      });
      const rect = { left: 18, top: 39, width: cssWidth, height: cssHeight };
      const camera = { x: 1134.6, y: 952.3 },
        point = { x: 1240.4, y: 1120.8 };
      const client = worldToClient(point, camera, view, rect);
      const restored = clientToWorld(client, camera, view, rect);
      assert.ok(Math.abs(restored.x - point.x) < 1e-9);
      assert.ok(Math.abs(restored.y - point.y) < 1e-9);
      assert.deepEqual(
        clientToView({ x: rect.left, y: rect.top }, view, rect),
        { x: 0, y: 0 },
      );
      assert.ok(view.width * view.height * view.renderScale ** 2 <= 750_001);
    }
  }
});

test('portrait zoom adds context without changing landscape and small interiors stay filled', () => {
  const standard = createViewport({
    cssWidth: 390,
    cssHeight: 600,
    mobile: true,
  });
  const zoomed = createViewport({
    cssWidth: 390,
    cssHeight: 600,
    mobile: true,
    zoom: 0.88,
  });
  assert.ok(zoomed.width > standard.width && zoomed.height > standard.height);
  assert.deepEqual(
    createViewport({ cssWidth: 750, cssHeight: 340, mobile: true, zoom: 0.88 }),
    createViewport({ cssWidth: 750, cssHeight: 340, mobile: true }),
  );
  const scene = { width: 400, height: 300 };
  const view = createViewport({
    cssWidth: 390,
    cssHeight: 600,
    mobile: true,
    scene,
  });
  assert.ok(view.width <= scene.width && view.height <= scene.height);
  assert.deepEqual(clampCamera({ x: -10, y: 200 }, scene, view), {
    x: 0,
    y: 0,
  });
  const edge = clampCamera(
    { x: 99999, y: 99999 },
    { width: 2400, height: 1800 },
    standard,
  );
  assert.equal(edge.x + standard.width, 2400);
  assert.equal(edge.y + standard.height, 1800);
});

test('mobile battle formations reframe all seven actors without mutating combat or a pending action', () => {
  const state = createState();
  recruit(state, 'vex');
  recruit(state, 'rune');
  const battle = createBattle(state, {
    id: 'viewport-formation',
    enemies: [
      'rust_scrapper',
      'drone_sentinel',
      'rust_scrapper',
      'drone_sentinel',
    ],
    biome: 'coast',
  });
  battle.pending = { kind: 'attack', target: 'enemy' };
  battle.floaters.push({
    x: battle.enemies[0].home.x,
    y: battle.enemies[0].home.y - 30,
    text: '12',
    life: 1,
    maxLife: 1,
  });
  const before = structuredClone(battle);
  for (const [cssWidth, cssHeight, portrait] of [
    [393, 504, true],
    [320, 340, true],
    [480, 390, false],
  ]) {
    const view = createViewport({
      cssWidth,
      cssHeight,
      mobile: true,
      portrait,
    });
    const layout = mobileBattleLayout(view),
      presentation = mobileBattlePresentation(battle, layout);
    assert.equal(presentation.heroes.length + presentation.enemies.length, 7);
    for (const actor of [...presentation.heroes, ...presentation.enemies]) {
      assert.ok(actor.home.x > 0 && actor.home.x < layout.width);
      assert.ok(actor.home.y > 0 && actor.home.y < layout.height);
    }
    assert.equal(presentation.pending, battle.pending);
    assert.deepEqual(battle, before);
  }
});
