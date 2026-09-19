import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMIES } from '../src/content.js';
import { ALL_SCENES } from '../src/world.js';
import { createState } from '../src/progression.js';
import {
  createBattle,
  battleView,
  battleKey,
  updateBattle,
} from '../src/combat.js';
import { migrate } from '../src/persistence.js';
import {
  enemyLevel,
  enemyLevelLabel,
  enemyNameWithLevel,
  encounterLevelLabel,
  encounterLeader,
  encounterBadgeLabel,
  encounterInteractionLabel,
  encounterDanger,
  ENEMY_DANGER_STYLES,
} from '../src/enemy-levels.js';
import { drawEncounterLevels } from '../src/enemy-labels.js';

test('every authored enemy and encounter has an explicit strength level, distinct from civilization tier', () => {
  for (const enemy of Object.values(ENEMIES)) {
    assert.ok(
      Number.isInteger(enemy.level) && enemy.level >= 1 && enemy.level <= 60,
      enemy.id,
    );
    assert.equal(enemyLevel(enemy.id), enemy.level);
  }
  for (const scene of Object.values(ALL_SCENES))
    for (const encounter of scene.objects.filter(
      (o) => o.type === 'encounter',
    )) {
      assert.ok(!encounterLevelLabel(encounter).includes('?'), encounter.id);
    }
  assert.ok(ENEMIES.drone_sentinel.level > ENEMIES.rust_scrapper.level);
  assert.ok(ENEMIES.bog_stalker.level > ENEMIES.drone_sentinel.level);
  assert.ok(ENEMIES.void_architect.level > ENEMIES.architect_herald.level);
  assert.notEqual(ENEMIES.void_architect.level, ENEMIES.void_architect.tier);
});

test('mixed encounters show one level and name for their strongest visible fighter', () => {
  for (const scene of Object.values(ALL_SCENES))
    for (const encounter of scene.objects.filter(
      (o) => o.type === 'encounter',
    )) {
      const before = JSON.stringify(encounter),
        leader = encounterLeader(encounter);
      assert.equal(
        enemyLevel(leader),
        Math.max(...encounter.enemies.map(enemyLevel)),
        encounter.id,
      );
      assert.equal(
        encounterBadgeLabel(encounter),
        `LVL ${ENEMIES[leader].level} · ${ENEMIES[leader].name}`,
      );
      assert.equal(
        JSON.stringify(encounter),
        before,
        'Choosing the marker must not reorder battle formation',
      );
    }
  assert.equal(
    encounterLeader({ enemies: ['rust_scrapper', 'drone_sentinel'] }),
    'drone_sentinel',
  );
  assert.equal(
    encounterLeader({ enemies: ['glacier_wolf', 'mire_hulk'] }),
    'glacier_wolf',
    'Ties retain the authored leader',
  );
  assert.equal(
    encounterLevelLabel({
      enemies: ['bog_stalker', 'rust_scrapper', 'drone_sentinel'],
    }),
    'LVL 3',
  );
  for (const encounter of [{}, { enemies: [] }, { enemies: ['unknown'] }])
    assert.equal(encounterBadgeLabel(encounter), 'LVL ? · Enemy');
  assert.equal(enemyLevelLabel('unknown'), 'LVL ?');
  assert.equal(enemyLevel({ level: NaN }), null);
});

test('gate choices and replay prompts share the visible leader level', () => {
  const encounter = {
    enemies: ['drone_sentinel', 'gravbot'],
    name: 'Exchange blockade',
  };
  assert.equal(encounterInteractionLabel(encounter), 'Engage Gravbot · LVL 8');
  assert.equal(
    encounterInteractionLabel({ ...encounter, guard: 'emberline' }),
    'Confront Gravbot · LVL 8 · gate sentry',
  );
  assert.equal(
    encounterInteractionLabel(encounter, true),
    'Revisit patrol · LVL 8 · reduced spoils',
  );
  assert.equal(enemyNameWithLevel('bog_stalker'), 'Bog Stalker · LVL 3');
});

test('enemy levels and existing combat stats stay fixed across party and civilization progression', () => {
  const state = createState(),
    encounter = { id: 'fixed', enemies: Object.keys(ENEMIES).slice(0, 4) };
  const first = createBattle(state, encounter).enemies;
  state.heroes[0].level = 60;
  state.tier = 4;
  assert.deepEqual(createBattle(state, encounter).enemies, first);
  for (const enemy of first) {
    assert.equal(enemy.hp, ENEMIES[enemy.id].hp);
    assert.equal(enemy.xp, ENEMIES[enemy.id].xp);
  }
});

test('legacy suspended battles show individual canonical levels without changing the save or selection', () => {
  const state = createState();
  const battle = createBattle(state, {
    id: 'legacy',
    enemies: ['bog_stalker', 'gravbot', 'bog_stalker'],
  });
  battle.heroes[0].atb = 99.99;
  updateBattle(battle, state, 0.01);
  battleKey(battle, state, 'Enter');
  battleKey(battle, state, 'Enter');
  assert.equal(battle.mode, 'target');
  for (const enemy of battle.enemies) delete enemy.level;
  state.suspendedBattle = battle;
  const loaded = migrate(JSON.parse(JSON.stringify(state))),
    before = JSON.stringify(loaded);
  const view = battleView(loaded.suspendedBattle, loaded);
  assert.deepEqual(
    view.enemies.map((e) => e.level),
    [3, 8, 3],
  );
  assert.deepEqual(
    view.targets.map((e) => [e.id, e.level]),
    [
      ['enemy_0', 3],
      ['enemy_1', 8],
      ['enemy_2', 3],
    ],
  );
  assert.equal(enemyNameWithLevel(view.targets[1]), 'Gravbot · LVL 8');
  assert.equal(JSON.stringify(loaded), before);
  assert.equal(
    enemyLevel({ id: 'gravbot', level: 99 }),
    ENEMIES.gravbot.level,
    'Canonical levels stay authoritative.',
  );
});

test('world badges follow camera coordinates and hide cleared one-off enemies but retain repeat patrols', () => {
  const labels = [];
  const ctx = {
    save() {},
    restore() {},
    fillRect() {},
    strokeRect() {},
    measureText: (text) => ({ width: text.length * 5 }),
    fillText: (...args) => labels.push(args),
  };
  const encounter = (id, extra = {}) => ({
    id,
    type: 'encounter',
    x: 200,
    y: 200,
    enemies: ['bog_stalker'],
    ...extra,
  });
  const scene = {
    objects: [
      encounter('live'),
      encounter('repeat'),
      encounter('boss', { boss: true }),
      encounter('guard', { guard: 'haventide' }),
      encounter('quest', { flag: 'done' }),
      encounter('sentry', {
        guard: 'emberline',
        enemies: ['gravbot', 'drone_sentinel'],
        x: 250,
      }),
      encounter('far', { x: 3000 }),
      { type: 'tree', x: 150, y: 205 },
    ],
  };
  const state = {
    cleared: { repeat: true, boss: true, guard: true, quest: true },
    settings: { reducedMotion: true },
  };
  const before = JSON.stringify({ scene, state });
  drawEncounterLevels(ctx, scene, { x: 100, y: 150 }, state);
  assert.deepEqual(labels, [
    ['LVL 3 · Bog Stalker', 100.5, 83.5],
    ['LVL 3 · Bog Stalker', 100.5, 68.5],
    ['LVL 8 · Gravbot', 150.5, 83.5],
  ]);
  assert.equal(JSON.stringify({ scene, state }), before);
});

test('danger colors compare the strongest enemy with Kaida across every threshold', () => {
  const state = createState();
  state.heroes = [
    { id: 'rune', level: 60 },
    { id: 'kaida', level: 14 },
  ];
  const before = structuredClone(state);
  for (const [level, danger] of [
    [1, 'lower'],
    [12, 'lower'],
    [13, 'even'],
    [14, 'even'],
    [15, 'even'],
    [16, 'raised'],
    [17, 'raised'],
    [18, 'high'],
    [20, 'high'],
    [21, 'severe'],
    [60, 'severe'],
  ]) {
    assert.equal(
      encounterDanger({ enemies: [{ level }] }, state),
      danger,
      'enemy level ' + level,
    );
  }
  assert.equal(
    encounterDanger({ enemies: ['rust_scrapper', 'wraith_core'] }, state),
    'severe',
  );
  assert.equal(
    encounterDanger({ enemies: ['wraith_core', 'rust_scrapper'] }, state),
    'severe',
  );
  state.heroes[1].level = 23;
  assert.equal(
    encounterDanger({ enemies: ['wraith_core'] }, state),
    'even',
    'Colors respond to a level-up without scaling enemies',
  );
  state.heroes[1].level = 14;
  for (const enemies of [[], ['unknown']])
    assert.equal(encounterDanger({ enemies }, state), 'even');
  assert.equal(
    encounterDanger({ enemies: ['wraith_core'] }, { heroes: [] }),
    'even',
  );
  assert.deepEqual(state, before);
});

test('all badge colors keep level text readable, including the deep-red warning', () => {
  const luminance = (hex) => {
    const rgb = hex
      .slice(1, 7)
      .match(/../g)
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  for (const [danger, style] of Object.entries(ENEMY_DANGER_STYLES)) {
    // Check the most adverse white terrain behind the slightly translucent badge.
    const alpha = parseInt(style.background.slice(7) || 'ff', 16) / 255;
    const background =
      '#' +
      style.background
        .slice(1, 7)
        .match(/../g)
        .map((v) =>
          Math.round(parseInt(v, 16) * alpha + 255 * (1 - alpha))
            .toString(16)
            .padStart(2, '0'),
        )
        .join('');
    assert.ok(
      (luminance(style.text) + 0.05) / (luminance(background) + 0.05) >= 4.5,
      danger + ' text contrast',
    );
  }
});

test('severe live badges include a skull while cleared repeat encounters stay neutral', () => {
  const labels = [],
    skulls = [],
    fills = [];
  const ctx = {
    save() {},
    restore() {},
    strokeRect() {},
    beginPath() {},
    fill() {},
    ellipse(...args) {
      skulls.push(args);
    },
    fillRect() {
      fills.push(this.fillStyle);
    },
    measureText: (text) => ({ width: text.length * 5 }),
    fillText(text, x, y) {
      labels.push({ text, x, y, color: this.fillStyle });
    },
  };
  const encounter = {
    id: 'warning',
    type: 'encounter',
    x: 140,
    y: 200,
    enemies: ['wraith_core'],
  };
  const scene = {
    objects: [encounter, { ...encounter, id: 'repeat', x: 240 }],
  };
  const state = {
    heroes: [{ id: 'kaida', level: 14 }],
    cleared: { repeat: true },
  };
  drawEncounterLevels(ctx, scene, { x: 0, y: 0 }, state);
  assert.equal(skulls.length, 1);
  assert.ok(fills.includes(ENEMY_DANGER_STYLES.severe.background));
  assert.deepEqual(
    labels.map(({ text, color }) => [text, color]),
    [
      ['LVL 24 · Wraith Core', ENEMY_DANGER_STYLES.severe.text],
      ['LVL 24 · Wraith Core', ENEMY_DANGER_STYLES.lower.text],
    ],
  );
});

test('one-line name badges stay inside the viewport near its edges', () => {
  const labels = [],
    boxes = [],
    ctx = {
      save() {},
      restore() {},
      fillRect(...args) {
        boxes.push(args);
      },
      strokeRect() {},
      measureText: (text) => ({ width: text.length * 5 }),
      fillText(...args) {
        labels.push(args);
      },
    };
  const scene = {
    objects: [2, 958].map((x, i) => ({
      id: String(i),
      type: 'encounter',
      x,
      y: 535,
      enemies: ['architect_herald'],
    })),
  };
  drawEncounterLevels(ctx, scene, { x: 0, y: 0 }, { cleared: {} });
  assert.equal(labels.length, 2, 'Each enemy gets exactly one unwrapped label');
  for (const [x, y, w, h] of boxes) {
    assert.ok(x >= 0 && x + w <= 960);
    assert.ok(y >= 0 && y + h <= 540);
  }
  for (const [label] of labels)
    assert.equal(label, 'LVL 34 · Architect Herald');
});
