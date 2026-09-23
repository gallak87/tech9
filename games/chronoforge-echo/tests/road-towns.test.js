import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { ROAD_TOWNS } from '../src/road-town-definitions.js';
import {
  REGIONS,
  getScene,
  isWalkable,
  nearby,
  meetsWorldRequirement,
} from '../src/world.js';
import {
  createState,
  serviceAvailable,
  restCost,
  stats,
  productionSources,
  recomputeUnlocks,
} from '../src/progression.js';
import {
  communityRegion,
  communityStatus,
} from '../src/community-restoration.js';
import { townInteriorFrame } from '../src/town-interior-art.js';
import { townCenterBounds } from '../src/town-center-art.js';
import {
  mapTravelAction,
  settlementTravelAction,
} from '../src/expedition-map-model.js';
import { WorldTraversal } from '../src/world-traversal.js';
import {
  saveState,
  loadState,
  exportSave,
  parseSaveFile,
} from '../src/persistence.js';
import { mainObjective, onEvent } from '../src/narrative.js';
register('./helpers/css-loader.mjs', import.meta.url);
const { UI } = await import('../src/ui.js');

const regionIds = Object.keys(ROAD_TOWNS);

function fixture(region) {
  const state = createState(),
    slots = new Map(),
    checkpoints = [];
  state.region = region;
  Object.assign(state, getScene(region).spawn);
  const storage = {
    getItem: (key) => slots.get(key) ?? null,
    setItem: (key, value) => slots.set(key, value),
  };
  const game = {
    state,
    mode: 'world',
    camera: { x: 0, y: 0 },
    keys: new Set(),
    followers: [],
    followPath: [],
    movePath: [],
    transition: null,
    audio: { sound() {} },
    log() {},
    resolveResult() {},
    get scene() {
      return getScene(this.state.region);
    },
    checkpoint() {
      saveState(this.state, 'checkpoint', storage);
      checkpoints.push(structuredClone(this.state));
    },
  };
  const ui = Object.assign(Object.create(UI.prototype), {
    game,
    hero: 0,
    panel: null,
    render() {},
    shell: (_title, body) => body,
    restoreShopRow() {},
    feedback(result) {
      this.result = result;
    },
    root: {
      querySelectorAll: () => [],
      querySelector: () => null,
    },
  });
  game.ui = ui;
  return { game, ui, storage, checkpoints };
}

test('four optional road towns keep native anchors, clear approaches and three immediate services', () => {
  for (const [id, definition] of Object.entries(ROAD_TOWNS)) {
    const outside = REGIONS[id],
      hall = getScene(id + '_town'),
      entrance = outside.objects.find((o) => o.to === hall.id),
      state = createState();
    assert.equal(hall.name, definition.name);
    assert.equal(entrance.x, definition.x * 1.25);
    assert.equal(entrance.y, definition.y * 1.25);
    assert.deepEqual(entrance.spawn, hall.spawn);
    assert.equal(entrance.guard, undefined);
    assert.equal(entrance.requires, undefined);
    assert.ok(meetsWorldRequirement(state, entrance.requires));
    assert.equal(isWalkable(hall, hall.spawn.x, hall.spawn.y), true);
    const exit = hall.portals[0];
    assert.ok(isWalkable(outside, exit.spawn.x, exit.spawn.y));
    assert.ok(
      nearby(outside, exit.spawn.x, exit.spawn.y, state).includes(entrance),
    );
    const services = hall.objects.filter((o) => o.service);
    assert.deepEqual(services.map((o) => o.service).sort(), [
      'inn',
      'provisions',
      'smith',
    ]);
    for (const service of services)
      assert.ok(serviceAvailable(state, service.service, hall.id));
    assert.equal(communityRegion(id), null);
    assert.equal(
      hall.objects.some((o) => o.service === 'construction'),
      false,
    );
  }
  for (const id of ['haventide', 'emberline', 'orbital_reach', 'last_crown']) {
    const entrance = REGIONS[id].objects.find((o) => o.type === 'town');
    assert.ok(entrance.guard);
    assert.equal(entrance.requires, id + '_liberated');
    assert.equal(
      meetsWorldRequirement(createState(), entrance.requires),
      false,
    );
  }
});

test('road town art follows civilization using existing kits without advancing original communities', () => {
  const state = createState(),
    baseline = structuredClone(state.communities);
  state.buildings.town_center = 2;
  for (const level of [1, 2, 3, 4]) {
    state.tier = level;
    for (const [id, definition] of Object.entries(ROAD_TOWNS)) {
      const entrance = REGIONS[id].objects.find((o) => o.type === 'town');
      assert.equal(townCenterBounds(entrance, state).frameIndex, level - 1);
      for (const part of ['floor', 'provisions', 'forge', 'inn', 'wall']) {
        const { asset } = townInteriorFrame(part, state, id);
        assert.equal(asset.region, definition.interiorKit);
        assert.equal(asset.level, level);
      }
    }
    assert.equal(townInteriorFrame('floor', state, 'haventide').asset.level, 2);
    for (const id of Object.keys(baseline))
      assert.equal(townInteriorFrame('floor', state, id).asset.level, 1);
  }
  assert.deepEqual(state.communities, baseline);
});

test('entering a road town discovers its travel stop and persists through checkpoints and transfer', () => {
  for (const id of regionIds) {
    const { game, storage, checkpoints } = fixture(id),
      state = game.state,
      entrance = game.scene.objects.find((o) => o.type === 'town'),
      traversal = new WorldTraversal(game);
    state.visited[id] = true;
    state.flags[id + '_liberated'] = true;
    assert.match(mapTravelAction(game, id).reason, /Enter this settlement/);
    delete state.flags[id + '_liberated'];
    traversal.travel(entrance.to, entrance.spawn);
    assert.equal(checkpoints.length, 1);
    assert.equal(mapTravelAction(game, id).action, undefined);
    traversal.updateTransition(0.6);
    assert.equal(state.region, id + '_town');
    assert.equal(state.visited[id + '_town'], true);
    assert.equal(checkpoints.length, 2);
    assert.equal(mapTravelAction(game, id).action, 'travel:' + id);
    const loaded = loadState('checkpoint', storage);
    assert.equal(
      mapTravelAction({ ...game, state: loaded }, id).action,
      'travel:' + id,
    );
    const transferred = parseSaveFile(exportSave('checkpoint', storage)).state;
    assert.equal(transferred.visited[id + '_town'], true);
    for (const patch of [
      { mode: 'battle' },
      { battle: {} },
      { transition: {} },
      { upgradeTour: { open: true } },
      { state: { ...state, recruitmentWalk: {} } },
      { state: { ...state, flags: { ...state.flags, pendingEnding: true } } },
    ])
      assert.equal(
        mapTravelAction({ ...game, ...patch }, id).action,
        undefined,
      );
  }
});

test('map preview changes its action without blocking real settlement travel or homecoming', () => {
  const { game } = fixture('haventide');
  game.state.flags.haventide_liberated = true;
  game.devTools = { mapExplored: true };
  assert.equal(
    mapTravelAction(game, 'haventide').action,
    'dev-world:haventide',
  );
  assert.equal(
    settlementTravelAction(game, 'haventide').action,
    'travel:haventide',
  );
  game.state.visited.forest_veil = true;
  assert.equal(settlementTravelAction(game, 'forest_veil').action, undefined);
  game.state.visited.forest_veil_town = true;
  assert.equal(
    settlementTravelAction(game, 'forest_veil').action,
    'travel:forest_veil',
  );
});

test('new retail and rest services use normal prices, confirmation, civilization checks and autosaves', () => {
  for (const id of regionIds) {
    const { game, ui, storage, checkpoints } = fixture(id + '_town'),
      state = game.state;
    state.heroes[0].level = 8;
    state.resources.ore = 1000;
    state.resources.food = 100;
    const smith = game.scene.objects.find((o) => o.service === 'smith');
    ui.panel = { type: 'vendor', object: smith };
    ui.action('buy:magma_blade');
    assert.equal(ui.shop.quote, null);
    assert.equal(checkpoints.length, 0);
    const before = state.inventory.iron_blade || 0;
    ui.action('buy:iron_blade');
    assert.ok(ui.shop.quote);
    assert.equal(state.resources.ore, 1000);
    ui.action('shop-confirm:iron_blade');
    assert.equal(state.inventory.iron_blade, before + 1);
    assert.equal(state.resources.ore, 970);
    assert.equal(loadState('checkpoint', storage).resources.ore, 970);
    ui.action('trade-mode');
    ui.action('sell:iron_blade');
    ui.action('shop-confirm:iron_blade');
    assert.equal(state.inventory.iron_blade, before);
    assert.equal(state.resources.ore, 983);
    ui.action('trade-mode');
    if (id !== 'forest_veil') {
      state.tier = 3;
      ui.action('buy:magma_blade');
      assert.ok(
        ui.shop.quote,
        'Level 8 with civilization 3 can buy Ascendant stock',
      );
      state.tier = 1;
      ui.action('shop-confirm:magma_blade');
      assert.equal(ui.result.ok, false);
      assert.equal(state.resources.ore, 983);
      state.tier = 3;
      ui.action('buy:magma_blade');
      ui.action('shop-confirm:magma_blade');
      assert.equal(ui.result.ok, true);
    }
    ui.panel = {
      type: 'vendor',
      object: game.scene.objects.find((o) => o.service === 'provisions'),
    };
    const tonics = state.inventory.field_tonic || 0;
    ui.action('buy:field_tonic');
    ui.action('shop-confirm:field_tonic');
    assert.equal(state.inventory.field_tonic, tonics + 1);
    ui.panel = {
      type: 'vendor',
      object: game.scene.objects.find((o) => o.service === 'inn'),
    };
    state.heroes[0].hp = 1;
    state.heroes[0].mp = 0;
    const food = state.resources.food,
      cost = restCost(state),
      saved = checkpoints.length;
    ui.action('rest');
    assert.equal(ui.result.ok, true);
    assert.equal(state.resources.food, food - cost);
    assert.equal(state.heroes[0].hp, stats(state.heroes[0], state).maxHp);
    assert.equal(state.heroes[0].mp, stats(state.heroes[0], state).maxMp);
    assert.equal(ui.panel.object.service, 'inn');
    assert.equal(checkpoints.length, saved + 1);
    assert.deepEqual(loadState('checkpoint', storage), state);
  }
});

test('optional town visits add no campaign gates, community rewards or passive income', () => {
  const state = createState();
  recomputeUnlocks(state);
  const before = structuredClone(state),
    objective = mainObjective(state),
    sources = productionSources(state),
    community = communityStatus(state, 'emberline');
  for (const id of regionIds) {
    const result = onEvent(state, 'visit', id + '_town');
    assert.deepEqual(result.rewards, []);
  }
  assert.deepEqual(mainObjective(state), objective);
  assert.deepEqual(state.communities, before.communities);
  assert.deepEqual(state.inventory, before.inventory);
  assert.deepEqual(state.resources, before.resources);
  assert.deepEqual(state.flags, before.flags);
  assert.deepEqual(productionSources(state), sources);
  assert.deepEqual(communityStatus(state, 'emberline'), community);
  const branchGates = Object.values(REGIONS)
    .flatMap((r) => r.portals)
    .filter((p) =>
      ['forest_veil', 'mire_bog', 'crater_ember', 'frost_canyon'].includes(
        p.to,
      ),
    );
  assert.deepEqual(
    branchGates.map((p) => [p.id, p.requires]),
    [
      ['ember_to_forest', 'vex_recruited'],
      ['ember_to_crater', { tier: 3 }],
      ['forest_to_mire', 'forest_seal'],
      ['mire_to_forest', undefined],
      ['orbital_to_frost', 'rune_recruited'],
    ],
  );
});
