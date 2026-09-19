import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/progression.js';
import { getScene, isWalkable, nearby, safeArrival } from '../src/world.js';
import {
  HAVENTIDE_INTERIOR_ASSETS,
  havenInteriorLevel,
  havenInteriorFrame,
} from '../src/haventide-interior-art.js';
import {
  havenInteriorBounds,
  keyInteriorFrame,
} from '../src/haventide-interior-renderer.js';
import { HAVENTIDE_HALL } from '../src/haventide-interior-layout.js';
import { upgradePreviewStates } from '../src/dev-upgrade-preview.js';

const hall = getScene('haventide_town');

test('Haventide installs all twelve independently placed pieces for every real town-center level', () => {
  const parts = [
    'provisions',
    'forge',
    'inn',
    'archive',
    'engineering',
    'training',
    'board',
    'storage',
    'floor',
    'runner',
    'wall',
    'column',
  ];
  assert.equal(HAVENTIDE_INTERIOR_ASSETS.length, 4);
  for (const level of [1, 2, 3, 4]) {
    const state = createState();
    state.buildings.town_center = level;
    assert.equal(havenInteriorLevel(state), level);
    for (const part of parts) {
      const spec = havenInteriorFrame(part, state);
      assert.ok(spec, part);
      assert.equal(spec.asset.level, level);
      assert.equal(spec.frame.part, part);
      assert.ok(spec.frame.w > 0 && spec.frame.h > 0);
    }
    assert.equal(
      havenInteriorFrame('floor', state).frame.key,
      false,
      'Ground must not be removed by alpha extraction',
    );
  }
});

test('every service, story NPC and exit is reachable from the unchanged entrance', () => {
  const state = createState();
  state.tier = 4;
  const step = 16,
    origin = hall.spawn,
    points = [origin],
    seen = new Set(['0,0']),
    nodes = [[0, 0]];
  for (let i = 0; i < nodes.length; i++) {
    const [gx, gy] = nodes[i];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = gx + dx,
        ny = gy + dy,
        key = nx + ',' + ny;
      if (seen.has(key)) continue;
      const x = origin.x + nx * step,
        y = origin.y + ny * step;
      if (
        !isWalkable(hall, x, y) ||
        !isWalkable(hall, x - (dx * step) / 2, y - (dy * step) / 2)
      )
        continue;
      seen.add(key);
      nodes.push([nx, ny]);
      points.push({ x, y });
    }
  }
  for (const object of [...hall.objects, ...hall.portals].filter(
    (o) =>
      o.service ||
      ['mara', 'haventide_resident', 'ending_beacon'].includes(o.id) ||
      o.type === 'portal',
  )) {
    assert.ok(
      points.some((p) => nearby(hall, p.x, p.y, state).includes(object)),
      'No approach to ' + object.id,
    );
  }
  for (let y = 470; y <= 1050; y += 10)
    assert.ok(
      isWalkable(hall, 800, y),
      'Central entrance aisle blocked at ' + y,
    );
  assert.equal(hall.portals[0].x, 800);
  assert.equal(hall.portals[0].y, 1045);
  assert.deepEqual(hall.spawn, { x: 800, y: 993.75 });
});

test('service footprints block walking through counters and staff stand on open floor', () => {
  for (const object of hall.objects.filter((o) => o.service)) {
    assert.equal(
      isWalkable(hall, object.x, object.y - 10),
      false,
      object.id + ' counter',
    );
    assert.equal(
      isWalkable(hall, object.x, object.y + 28),
      true,
      object.id + ' approach',
    );
    if (object.type === 'npc')
      assert.equal(
        isWalkable(hall, object.x - object.artWidth * 0.5 - 24, object.y + 5),
        true,
        object.id + ' staff position',
      );
  }
});

test('old hall save positions recover to nearby floor, including the narrowed entrance corners', () => {
  for (let x = 83; x <= 1517; x += 24)
    for (let y = 145; y <= 1055; y += 24) {
      const arrival = safeArrival(hall, x, y);
      assert.ok(isWalkable(hall, arrival.x, arrival.y));
      if (isWalkable(hall, x, y)) assert.deepEqual(arrival, { x, y });
      assert.ok(Math.abs(arrival.x - x) < 180 && Math.abs(arrival.y - y) < 180);
    }
});

test('upgrading changes hall artwork while positions and service availability remain stable', () => {
  const state = createState(),
    geometry = JSON.stringify(hall),
    board = hall.objects.find((o) => o.service === 'construction');
  for (const fromLevel of [1, 2, 3]) {
    const plan = upgradePreviewStates(state, fromLevel);
    const old = havenInteriorFrame('board', plan.before),
      next = havenInteriorFrame('board', plan.after);
    assert.notEqual(old.asset.source, next.asset.source);
    for (const visual of [plan.before, plan.after]) {
      const bounds = havenInteriorBounds(board, visual);
      assert.ok(bounds.width > 150 && bounds.width < 300);
      assert.equal(
        bounds.left + bounds.width * 0.5,
        HAVENTIDE_HALL.services.construction.x,
      );
      assert.equal(
        bounds.top + bounds.height,
        HAVENTIDE_HALL.services.construction.y,
      );
    }
    const lab = hall.objects.find((o) => o.service === 'artificer');
    assert.equal(
      nearby(hall, lab.x, lab.y + 30, plan.after).includes(lab),
      false,
      'Town art does not advance civilization',
    );
  }
  assert.equal(JSON.stringify(hall), geometry);
});

test('alpha extraction removes only connected neutral background and respects enclosed seeds', () => {
  const w = 7,
    h = 7,
    pixels = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) pixels.set([200, 200, 200, 255], i * 4);
  // Colored closed ring encloses an ivory center that must survive.
  for (let y = 1; y < 6; y++)
    for (let x = 1; x < 6; x++)
      if (x === 1 || x === 5 || y === 1 || y === 5)
        pixels.set([30, 75, 70, 255], (y * w + x) * 4);
  keyInteriorFrame(pixels, w, h, {});
  assert.equal(pixels[3], 0);
  assert.equal(pixels[(3 * w + 3) * 4 + 3], 255);
  keyInteriorFrame(pixels, w, h, { backgroundSeeds: [[3, 3]] });
  assert.equal(pixels[(3 * w + 3) * 4 + 3], 0);
  assert.equal(pixels[(w + 1) * 4 + 3], 255);
});
