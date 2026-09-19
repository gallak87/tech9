import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMIES } from '../src/content.js';
import { ALL_SCENES } from '../src/world.js';
import { createState } from '../src/progression.js';
import { createBattle, battleView, battleKey, updateBattle } from '../src/combat.js';
import { migrate } from '../src/persistence.js';
import { enemyLevel, enemyLevelLabel, enemyNameWithLevel, encounterLevelLabel, encounterInteractionLabel } from '../src/enemy-levels.js';
import { drawEncounterLevels } from '../src/enemy-labels.js';

test('every authored enemy and encounter has an explicit strength level, distinct from civilization tier', () => {
  for (const enemy of Object.values(ENEMIES)) {
    assert.ok(Number.isInteger(enemy.level) && enemy.level >= 1 && enemy.level <= 60, enemy.id);
    assert.equal(enemyLevel(enemy.id), enemy.level);
  }
  for (const scene of Object.values(ALL_SCENES)) for (const encounter of scene.objects.filter(o => o.type === 'encounter')) {
    assert.ok(!encounterLevelLabel(encounter).includes('?'), encounter.id);
  }
  assert.ok(ENEMIES.drone_sentinel.level > ENEMIES.rust_scrapper.level);
  assert.ok(ENEMIES.bog_stalker.level > ENEMIES.drone_sentinel.level);
  assert.ok(ENEMIES.void_architect.level > ENEMIES.architect_herald.level);
  assert.notEqual(ENEMIES.void_architect.level, ENEMIES.void_architect.tier);
});

test('mixed patrols show the complete range and identical levels collapse to one value', () => {
  assert.equal(encounterLevelLabel({ enemies: ['bog_stalker'] }), 'LVL 3');
  assert.equal(encounterLevelLabel({ enemies: ['bog_stalker', 'rust_scrapper', 'drone_sentinel'] }), 'LVL 1–3');
  assert.equal(encounterLevelLabel({ enemies: ['bog_stalker', 'bog_stalker'] }), 'LVL 3');
  assert.equal(encounterLevelLabel({ enemies: ['glacier_wolf', 'mire_hulk'] }), 'LVL 10');
  assert.equal(encounterLevelLabel({ enemies: ['unknown', 'bog_stalker'] }), 'LVL ?');
  assert.equal(enemyLevelLabel('unknown'), 'LVL ?');
  assert.equal(enemyLevel({ level: NaN }), null);
});

test('interaction prompts expose levels for named encounters, blockades and repeat patrols', () => {
  const encounter = { enemies: ['gravbot', 'drone_sentinel'], name: 'Exchange blockade' };
  assert.equal(encounterInteractionLabel(encounter), 'Engage Exchange blockade · LVL 2–8');
  assert.equal(encounterInteractionLabel({ ...encounter, guard: 'emberline' }), 'Confront Gravbot · LVL 2–8 · gate sentry');
  assert.equal(encounterInteractionLabel(encounter, true), 'Revisit patrol · LVL 2–8 · reduced spoils');
  assert.equal(enemyNameWithLevel('bog_stalker'), 'Bog Stalker · LVL 3');
});

test('enemy levels and existing combat stats stay fixed across party and civilization progression', () => {
  const state = createState(), encounter = { id: 'fixed', enemies: Object.keys(ENEMIES).slice(0, 4) };
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
  const battle = createBattle(state, { id: 'legacy', enemies: ['bog_stalker', 'gravbot', 'bog_stalker'] });
  battle.heroes[0].atb = 99.99;
  updateBattle(battle, state, .01);
  battleKey(battle, state, 'Enter');
  battleKey(battle, state, 'Enter');
  assert.equal(battle.mode, 'target');
  for (const enemy of battle.enemies) delete enemy.level;
  state.suspendedBattle = battle;
  const loaded = migrate(JSON.parse(JSON.stringify(state))), before = JSON.stringify(loaded);
  const view = battleView(loaded.suspendedBattle, loaded);
  assert.deepEqual(view.enemies.map(e => e.level), [3, 8, 3]);
  assert.deepEqual(view.targets.map(e => [e.id, e.level]), [['enemy_0', 3], ['enemy_1', 8], ['enemy_2', 3]]);
  assert.equal(enemyNameWithLevel(view.targets[1]), 'Gravbot · LVL 8');
  assert.equal(JSON.stringify(loaded), before);
  assert.equal(enemyLevel({ id: 'gravbot', level: 99 }), ENEMIES.gravbot.level, 'Canonical levels stay authoritative.');
});

test('world badges follow camera coordinates and hide cleared one-off enemies but retain repeat patrols', () => {
  const labels = [];
  const ctx = {
    save() {}, restore() {}, fillRect() {}, strokeRect() {},
    measureText: text => ({ width: text.length * 5 }),
    fillText: (...args) => labels.push(args),
  };
  const encounter = (id, extra = {}) => ({ id, type: 'encounter', x: 140, y: 200, enemies: ['bog_stalker'], ...extra });
  const scene = { objects: [
    encounter('live'), encounter('repeat'), encounter('boss', { boss: true }),
    encounter('guard', { guard: 'haventide' }), encounter('quest', { flag: 'done' }),
    encounter('sentry', { guard: 'emberline', enemies: ['gravbot', 'drone_sentinel'], x: 250 }),
    encounter('far', { x: 3000 }), { type: 'tree', x: 150, y: 205 },
  ] };
  const state = { cleared: { repeat: true, boss: true, guard: true, quest: true }, settings: { reducedMotion: true } };
  const before = JSON.stringify({ scene, state });
  drawEncounterLevels(ctx, scene, { x: 100, y: 150 }, state);
  assert.deepEqual(labels, [['LVL 3', 40, 68.5], ['LVL 3', 40, 68.5], ['LVL 2–8 · SENTRY', 150, 68.5]]);
  assert.equal(JSON.stringify({ scene, state }), before);
});
