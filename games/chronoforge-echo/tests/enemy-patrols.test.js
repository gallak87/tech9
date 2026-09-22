import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ALL_SCENES, distanceToRoad } from '../src/world.js';
import { createState } from '../src/progression.js';
import {
  EnemyPatrols,
  configureEnemyPatrols,
  patrolSegmentClear,
} from '../src/enemy-patrols.js';
import {
  contactEncounter,
  hasContactBoundary,
} from '../src/encounter-contact.js';
import { ASSET_MANIFEST } from '../src/assets.js';
import { ENEMIES } from '../src/content.js';
import { drawPatrolEnemy, installEnemyWalkSheet } from '../src/art.js';
import { WorldTraversal } from '../src/world-traversal.js';

const location = (o) => ({ x: o.x, y: o.y });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const start = (o) => o.patrol.points[o.patrol.startIndex || 0];
const routeLength = (points) =>
  points.slice(1).reduce((n, p, i) => n + distance(points[i], p), 0);
const tick = (patrols, scene, state, seconds) => {
  for (let i = 0; i < seconds * 20; i++) patrols.update(scene, state, 0.05);
};

test('every ordinary encounter has a bounded route clear of scenery and doors; bosses stay put', () => {
  let guards = 0,
    roaming = 0,
    caves = 0;
  for (const scene of Object.values(ALL_SCENES)) {
    for (const object of scene.objects.filter((o) => o.type === 'encounter')) {
      if (object.boss || object.flag) {
        assert.ok(!object.patrol, object.id);
        continue;
      }
      assert.ok(object.patrol, object.id);
      const { points, home, radius } = object.patrol;
      assert.deepEqual(home, location(object));
      for (let i = 0; i < points.length; i++) {
        assert.ok(distance(home, points[i]) <= radius + 0.001, object.id);
        if (object.patrol.kind === 'road' && i === points.length - 1) continue;
        assert.ok(
          patrolSegmentClear(
            scene,
            points[i],
            points[(i + 1) % points.length],
            object,
          ),
          object.id,
        );
      }
      if (object.guard) {
        guards++;
        assert.equal(radius, 64);
        assert.ok(points.every((p) => Math.abs(p.y - home.y) < 0.001));
      } else if (scene.kind === 'cave') {
        caves++;
        assert.equal(radius, 100);
        assert.ok(distance(home, scene.spawn) > 500);
        assert.ok(object.enemies.every((id) => ENEMIES[id]));
      } else {
        roaming++;
        assert.equal(radius, 650);
        assert.equal(object.patrol.kind, 'road');
        assert.ok(
          routeLength(points) >= 400,
          object.id + ' covers a substantial road stretch',
        );
        for (let i = 1; i < points.length; i++) {
          for (let t = 0; t <= 1; t += 0.25) {
            const x = points[i - 1].x + (points[i].x - points[i - 1].x) * t;
            const y = points[i - 1].y + (points[i].y - points[i - 1].y) * t;
            assert.ok(
              distanceToRoad(scene, x, y) < 0.001,
              object.id + ' follows the road around bends',
            );
          }
        }
      }
    }
  }
  assert.equal(guards, 4);
  assert.equal(roaming, 28);
  assert.equal(caves, 8);
});

test('patrols move inside their leash without changing authored scenes or saves', () => {
  const authored = ALL_SCENES.haventide;
  const before = structuredClone(authored);
  const state = createState();
  Object.assign(state, authored.spawn);
  const saved = structuredClone(state);
  const patrols = new EnemyPatrols();
  const scene = patrols.scene(authored, state);
  const visited = new Map();
  for (let frame = 0; frame < 2400; frame++) {
    patrols.update(scene, state, 0.05);
    for (const object of scene.objects.filter((o) => o.patrol)) {
      assert.ok(
        distance(object, object.patrol.home) <= object.patrol.radius + 0.001,
      );
      if (distance(object, object.patrol.home) > 15)
        visited.set(object.id, true);
      if (object.patrol.kind === 'road')
        assert.ok(distanceToRoad(scene, object.x, object.y) < 0.001, object.id);
    }
  }
  assert.equal(visited.size, scene.objects.filter((o) => o.patrol).length);
  assert.deepEqual(authored, before);
  assert.deepEqual(state, saved);
});

test('cave records and companion stories remain reachable outside every patrol segment', () => {
  for (const scene of Object.values(ALL_SCENES).filter(
    (s) => s.kind === 'cave',
  )) {
    const game = {
      scene,
      state: { ...scene.spawn },
      movePath: [],
      rewards() {},
    };
    const traversal = new WorldTraversal(game);
    const patrol = scene.objects.find((o) => o.patrol).patrol;
    for (const target of scene.objects.filter((o) =>
      ['console', 'npc'].includes(o.type),
    )) {
      game.movePath = [];
      traversal.walkTo(target.x, target.y);
      assert.ok(game.movePath.length, target.id);
      for (const point of game.movePath) {
        for (let i = 0; i < patrol.points.length; i++) {
          const from = patrol.points[i],
            to = patrol.points[(i + 1) % patrol.points.length];
          const dx = to.x - from.x,
            dy = to.y - from.y;
          const t = Math.max(
            0,
            Math.min(
              1,
              ((point.x - from.x) * dx + (point.y - from.y) * dy) /
                (dx * dx + dy * dy),
            ),
          );
          assert.ok(
            distance(point, { x: from.x + dx * t, y: from.y + dy * t }) > 60,
            target.id,
          );
        }
      }
    }
  }
});

test('cleared patrols return to a static replay marker; protection and prerequisites freeze movement', () => {
  const state = createState();
  const patrols = new EnemyPatrols();
  const scene = patrols.scene(ALL_SCENES.haventide, state);
  const object = scene.objects.find((o) => o.patrol);
  tick(patrols, scene, state, 4);
  const position = location(object);
  assert.ok(distance(position, object.patrol.home) > 0);
  patrols.update(scene, state, 1, { protected: true });
  assert.deepEqual(location(object), position);
  assert.equal(object.patrolMotion.moving, false);
  object.requires = 'future_gate';
  tick(patrols, scene, state, 2);
  assert.deepEqual(location(object), position);
  delete object.requires;
  state.cleared[object.id] = true;
  patrols.scene(ALL_SCENES.haventide, state);
  tick(patrols, scene, state, 5);
  assert.deepEqual(location(object), object.patrol.home);
  assert.equal(hasContactBoundary(object, state), false);
});

test('loaded nearby patrols allow an exit and separate expeditions never share patrol positions', () => {
  const authored = ALL_SCENES.haventide;
  const original = authored.objects.find((o) => o.patrol);
  const patrols = new EnemyPatrols();
  const state = createState();
  Object.assign(state, location(original));
  const scene = patrols.scene(authored, state);
  const object = scene.objects.find((o) => o.id === original.id);
  assert.equal(hasContactBoundary(object, state), false);
  tick(patrols, scene, state, 10);
  assert.deepEqual(location(object), start(original));
  state.x += 180;
  tick(patrols, scene, state, 4);
  assert.equal(hasContactBoundary(object, state), true);
  const position = location(object);
  const previewState = structuredClone(state);
  const preview = patrols.scene(authored, previewState);
  const previewObject = preview.objects.find((o) => o.id === object.id);
  assert.deepEqual(location(previewObject), start(original));
  tick(patrols, preview, previewState, 10);
  assert.deepEqual(
    location(
      patrols.scene(authored, state).objects.find((o) => o.id === object.id),
    ),
    position,
  );
  patrols.reset();
  assert.deepEqual(
    location(
      patrols.scene(authored, state).objects.find((o) => o.id === object.id),
    ),
    start(original),
  );
});

const roadScene = (roads, objects = []) => ({
  id: 'road_fixture',
  width: 2000,
  height: 1600,
  spawn: { x: 50, y: 50 },
  roads,
  portals: [],
  objects: [{ id: 'roamer', type: 'encounter', x: 450, y: 312 }, ...objects],
});

test('road patrols start on the path, round corners continuously, and reverse only at endpoints', () => {
  const authored = roadScene([
    [
      { x: 200, y: 300 },
      { x: 600, y: 300 },
      { x: 600, y: 850 },
      { x: 1200, y: 850 },
    ],
  ]);
  configureEnemyPatrols(authored);
  const state = { ...authored.spawn, cleared: {} },
    patrols = new EnemyPatrols();
  const scene = patrols.scene(authored, state),
    enemy = scene.objects[0];
  assert.equal(enemy.y, 300, 'An offset placement must not spawn off the road');
  enemy.patrolMotion.wait = 0;
  const { speed, points } = enemy.patrol;
  let reachedCorner = false,
    reachedEnd = false;
  for (let frame = 0; frame < 1600; frame++) {
    const before = location(enemy),
      previousWait = enemy.patrolMotion.wait;
    patrols.update(scene, state, 0.05);
    assert.ok(distanceToRoad(scene, enemy.x, enemy.y) < 0.001);
    if (enemy.patrolMotion.wait > 0) {
      assert.ok(
        distance(enemy, points[0]) < 0.001 ||
          distance(enemy, points.at(-1)) < 0.001,
      );
      reachedEnd = true;
    } else if (previousWait === 0) {
      // Movement through intermediate sample points must use the whole frame.
      assert.ok(distance(before, enemy) > speed * 0.05 * 0.7);
    }
    if (enemy.x > 599 && enemy.y > 350) reachedCorner = true;
  }
  assert.ok(reachedCorner);
  assert.ok(reachedEnd);
});

test('blocked road segments stop patrols without off-road detours or a diagonal fallback', () => {
  const scene = roadScene(
    [
      [
        { x: 200, y: 300 },
        { x: 1400, y: 300 },
      ],
    ],
    [
      {
        id: 'block',
        type: 'rock',
        x: 750,
        y: 310,
        solid: true,
        w: 100,
        h: 100,
      },
    ],
  );
  configureEnemyPatrols(scene);
  const patrol = scene.objects[0].patrol;
  assert.ok(patrol.points.every((p) => p.y === 300 && p.x < 700));
  assert.ok(routeLength(patrol.points) > 400);
  const noRoad = roadScene([]);
  configureEnemyPatrols(noRoad);
  assert.equal(noRoad.objects[0].patrol, undefined);
});

test('relative contact catches a moving enemy crossing a stationary party and avoids false parallel hits', () => {
  const object = {
    id: 'moving',
    type: 'encounter',
    x: 200,
    y: 100,
    patrolMotion: { previous: { x: 0, y: 100 } },
  };
  const state = { x: 100, y: 100, cleared: {}, flags: {} };
  assert.equal(contactEncounter({ objects: [object] }, state), object);
  Object.assign(state, { x: 300, y: 100 });
  assert.equal(
    contactEncounter({ objects: [object] }, state, { x: 100, y: 100 }),
    null,
  );
  state.y = 136;
  state.x = 100;
  assert.equal(contactEncounter({ objects: [object] }, state), null);
});

test('prompt provenance and directional animation cover every planned grounded enemy', () => {
  const registry = JSON.parse(
    fs.readFileSync(new URL('../art/enemy-prompts.json', import.meta.url)),
  );
  assert.deepEqual(
    registry.enemies.map((e) => e.id).sort(),
    Object.keys(ENEMIES).sort(),
  );
  for (const record of registry.enemies.filter(
    (e) => e.locomotion === 'sheet',
  )) {
    const asset = ASSET_MANIFEST.find(
      (a) => a.enemyId === record.id && a.kind === 'enemyWalk',
    );
    assert.ok(asset?.required, record.id);
    assert.equal(record.generations[0].output, asset.url);
    assert.ok(record.generations[0].prompt.includes('reference'));
    const metadata = asset.metadata;
    assert.equal(metadata.frames.length, 12);
    installEnemyWalkSheet(record.id, {}, metadata);
    let actual;
    const ctx = {
      save() {},
      restore() {},
      translate() {},
      scale() {},
      beginPath() {},
      ellipse() {},
      fill() {},
      fillRect() {},
      drawImage(...args) {
        actual = args;
      },
    };
    for (const [row, facing] of ['left', 'down', 'up'].entries()) {
      const scales = new Set(
        metadata.frames.slice(row * 4, row * 4 + 4).map((f) => f.pixelScale),
      );
      assert.equal(scales.size, 1, 'Gait must not resize on every frame');
      for (let phase = 0; phase < 4; phase++) {
        drawPatrolEnemy(ctx, record.id, 100, 100, {
          facing,
          moving: true,
          time: (phase + 0.1) / 6,
        });
        const f = metadata.frames[row * 4 + phase];
        assert.deepEqual(actual.slice(1, 5), [f.x, f.y, f.w, f.h]);
      }
    }
  }
});
