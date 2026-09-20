import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../src/content.js';
import {
  createState,
  recruit,
  equip,
  unequip,
  build,
  advanceTier,
  production,
  stats,
  serviceAvailable,
  serviceStock,
  buy,
  sell,
  sellPrice,
} from '../src/progression.js';
import {
  COMMUNITY_DEFINITIONS,
  communityLevel,
  communityRegion,
  communityStatus,
  restoreCommunity,
  reforgeCommunityWeapon,
} from '../src/community-restoration.js';
import {
  migrate,
  saveState,
  loadState,
  exportSave,
  importSave,
  parseSaveFile,
  SAVE_PREFIX,
  SAVE_GAME,
} from '../src/persistence.js';

function prepared(region = 'emberline', level = 12) {
  const state = createState();
  state.heroes[0].level = level;
  recruit(state, 'rune');
  recruit(state, 'vex');
  state.region = `${region}_town`;
  state.x = 400;
  state.y = 400;
  state.flags[`${region}_liberated`] = true;
  state.resources = { food: 2000, ore: 2000, energy: 2000, renown: 100 };
  return state;
}

function finish(state, region = state.region) {
  for (const project of communityStatus(state, region).projects) {
    const result = restoreCommunity(state, region, project.id);
    assert.equal(result.ok, true, result.message);
  }
}

function store() {
  const rows = new Map();
  return {
    getItem: (key) => rows.get(key) ?? null,
    setItem: (key, value) => rows.set(key, String(value)),
  };
}

test('community projects are ordered, local, liberated, affordable and charge only once', () => {
  const state = prepared(),
    before = structuredClone(state),
    [first, second, last] = communityStatus(state, 'emberline').projects;
  assert.equal(communityRegion('emberline_town'), 'emberline');
  assert.equal(communityRegion('haventide_town'), null);
  assert.equal(communityRegion('constructor'), null);
  assert.equal(communityLevel(state, 'haventide'), 0);
  assert.equal(restoreCommunity(state, 'emberline', second.id).ok, false);
  assert.deepEqual(state, before);
  assert.equal(
    restoreCommunity(state, 'last_crown', 'public_garden').ok,
    false,
  );
  assert.deepEqual(state, before);
  delete state.flags.emberline_liberated;
  assert.equal(restoreCommunity(state, 'emberline', first.id).ok, false);
  state.cleared.ember_guard = true;
  state.resources.ore = first.cost.ore - 1;
  const poor = structuredClone(state);
  assert.equal(restoreCommunity(state, 'emberline', first.id).ok, false);
  assert.deepEqual(state, poor);
  state.resources = { ...before.resources };
  assert.equal(restoreCommunity(state, 'emberline', first.id).ok, true);
  for (const [resource, cost] of Object.entries(first.cost))
    assert.equal(state.resources[resource], before.resources[resource] - cost);
  const afterFirst = structuredClone(state);
  assert.equal(restoreCommunity(state, 'emberline', first.id).ok, false);
  assert.deepEqual(state, afterFirst);
  assert.equal(restoreCommunity(state, 'emberline', second.id).ok, true);
  const final = restoreCommunity(state, 'emberline', last.id);
  assert.equal(final.ok, true);
  assert.equal(final.previousLevel, 3);
  assert.equal(final.level, 4);
  assert.ok(final.rewards.some((reward) => reward.id === 'duneglass_blade_2'));
  const complete = structuredClone(state);
  assert.equal(restoreCommunity(state, 'emberline', last.id).ok, false);
  assert.deepEqual(state, complete);
  assert.deepEqual(state.buildings, before.buildings);
  assert.deepEqual(
    state.communities.orbital_reach,
    before.communities.orbital_reach,
  );
  assert.deepEqual(state.communities.last_crown, before.communities.last_crown);
  assert.equal(state.tier, before.tier);
  assert.deepEqual(state.quests, before.quests);
  assert.equal(state.flags.mara_trade_route, undefined);
});

test('each community gives one Exotic at its owner’s level band, independently of party or civilization tier', () => {
  for (const definition of COMMUNITY_DEFINITIONS)
    for (const [level, tier] of [
      [1, 1],
      [9, 1],
      [10, 2],
      [19, 2],
      [20, 3],
      [29, 3],
      [30, 4],
      [40, 4],
      [60, 4],
    ]) {
      const state = prepared(definition.id, 60),
        owner = state.heroes.find((hero) => hero.id === definition.heroId);
      owner.level = level;
      finish(state);
      const id = `${definition.weaponId}_${tier}`,
        item = ITEMS[id];
      assert.equal(state.inventory[id], 1, `${definition.id} level ${level}`);
      assert.equal(state.communities[definition.id].weaponTier, tier);
      assert.equal(item.exotic, true);
      assert.equal(item.unique, true);
      assert.equal(item.price, 0);
      assert.equal(item.iconId, definition.weaponId);
      assert.equal(state.tier, 1);
      assert.equal(buy(state, id).ok, false);
      assert.equal(sell(state, id).ok, false);
      assert.equal(sellPrice(id), 0);
      state.tier = 4;
      for (const service of ['smith', 'provisions'])
        assert.ok(!serviceStock(state, service).includes(id));
    }
});

test('final project clearly waits for its hero without charging or granting a copy', () => {
  const state = prepared('last_crown'),
    projects = communityStatus(state, state.region).projects;
  state.heroes = state.heroes.filter((hero) => hero.id !== 'vex');
  for (const project of projects.slice(0, 2))
    assert.equal(restoreCommunity(state, state.region, project.id).ok, true);
  const before = structuredClone(state),
    result = restoreCommunity(state, state.region, projects[2].id);
  assert.equal(result.ok, false);
  assert.match(result.message, /Vex/);
  assert.deepEqual(state, before);
  recruit(state, 'vex');
  assert.equal(restoreCommunity(state, state.region, projects[2].id).ok, true);
});

test('reforges replace the unique bag or equipped copy and charge the same total when bands are skipped', () => {
  const stepped = prepared('emberline', 9);
  finish(stepped);
  const skipped = structuredClone(stepped),
    startingOre = stepped.resources.ore,
    startingEnergy = stepped.resources.energy;
  assert.equal(reforgeCommunityWeapon(stepped, 'emberline').ok, false);
  stepped.heroes[0].level = 10;
  assert.equal(reforgeCommunityWeapon(stepped, 'emberline').ok, true);
  assert.equal(stepped.inventory.duneglass_blade_1, undefined);
  assert.equal(stepped.inventory.duneglass_blade_2, 1);
  assert.equal(equip(stepped, 'kaida', 'duneglass_blade_2').ok, true);
  stepped.heroes[0].level = 20;
  assert.equal(reforgeCommunityWeapon(stepped, 'emberline').ok, true);
  assert.equal(stepped.heroes[0].equip.weapon, 'duneglass_blade_3');
  assert.ok(!stepped.inventory.duneglass_blade_3);
  stepped.heroes[0].level = 30;
  assert.equal(reforgeCommunityWeapon(stepped, 'emberline').ok, true);
  assert.equal(stepped.heroes[0].equip.weapon, 'duneglass_blade_4');
  const completed = structuredClone(stepped);
  assert.equal(reforgeCommunityWeapon(stepped, 'emberline').ok, false);
  assert.deepEqual(stepped, completed);
  skipped.heroes[0].level = 30;
  assert.equal(reforgeCommunityWeapon(skipped, 'emberline').ok, true);
  assert.equal(skipped.inventory.duneglass_blade_4, 1);
  assert.equal(skipped.resources.ore, stepped.resources.ore);
  assert.equal(skipped.resources.energy, stepped.resources.energy);
  assert.equal(startingOre - stepped.resources.ore, 60);
  assert.equal(startingEnergy - stepped.resources.energy, 30);
  assert.equal(unequip(stepped, 'kaida', 'weapon').ok, true);
  assert.equal(stepped.inventory.duneglass_blade_4, 1);
});

test('reforge rejects wrong community, missing weapon and insufficient resources atomically', () => {
  const state = prepared('orbital_reach', 10);
  finish(state);
  state.heroes.find((hero) => hero.id === 'rune').level = 30;
  state.region = 'emberline_town';
  let before = structuredClone(state);
  assert.equal(reforgeCommunityWeapon(state, 'orbital_reach').ok, false);
  assert.deepEqual(state, before);
  state.region = 'orbital_reach_town';
  delete state.inventory.rescue_gauntlets_2;
  before = structuredClone(state);
  assert.equal(reforgeCommunityWeapon(state, 'orbital_reach').ok, false);
  assert.deepEqual(state, before);
  state.inventory.rescue_gauntlets_2 = 1;
  state.resources.ore = 0;
  before = structuredClone(state);
  assert.equal(reforgeCommunityWeapon(state, 'orbital_reach').ok, false);
  assert.deepEqual(state, before);
});

test('Haventide alone produces income and global building bonuses; regional services use local restoration', () => {
  const state = prepared(),
    initial = structuredClone(state);
  state.tier = 2;
  initial.tier = 2;
  state.buildings = {
    town_center: 3,
    farm: 2,
    mine: 2,
    energy_extractor: 1,
    barracks: 2,
    research_lab: 2,
  };
  initial.buildings = { ...state.buildings };
  assert.equal(serviceAvailable(state, 'trainer'), false);
  assert.equal(serviceAvailable(state, 'archivist'), false);
  const [project] = communityStatus(state, state.region).projects;
  assert.equal(restoreCommunity(state, state.region, project.id).ok, true);
  assert.equal(serviceAvailable(state, 'trainer'), true);
  assert.equal(serviceAvailable(state, 'archivist'), true);
  assert.equal(serviceAvailable(state, 'trainer', 'orbital_reach_town'), false);
  state.resources = { ...initial.resources };
  production(state, 120);
  production(initial, 120);
  assert.deepEqual(state.resources, initial.resources);
  assert.deepEqual(
    stats(state.heroes[0], state),
    stats(initial.heroes[0], initial),
  );
  delete state.buildings.barracks;
  delete state.buildings.research_lab;
  assert.equal(serviceAvailable(state, 'trainer'), true);
  assert.equal(serviceAvailable(state, 'archivist'), true);
  assert.equal(serviceAvailable(state, 'trainer', 'haventide_town'), false);
  assert.equal(serviceAvailable(state, 'archivist', 'haventide_town'), false);
  const before = structuredClone(state);
  assert.equal(build(state, 'town_center').ok, false);
  assert.equal(advanceTier(state).ok, false);
  assert.deepEqual(state, before);
});

test('legacy saves preserve Haven and every existing progression field and gain fresh independent communities', () => {
  const legacy = prepared('last_crown', 25);
  legacy.buildings = { town_center: 4, farm: 3, mine: 2, walls: 2 };
  legacy.flags.research_concord = true;
  legacy.flags.mara_trade_route = true;
  legacy.quests.main_mire = { completed: true };
  delete legacy.communityRevision;
  delete legacy.communities;
  const before = structuredClone(legacy),
    migrated = migrate(legacy);
  assert.deepEqual(legacy, before);
  const { communities, communityRevision, ...preserved } = migrated;
  assert.deepEqual(preserved, before);
  assert.equal(communityRevision, 1);
  for (const community of Object.values(communities))
    assert.deepEqual(community, { level: 1, weaponTier: 0 });
  assert.deepEqual(migrate(migrated), migrated);
  const storage = store(),
    savedAt = '2026-09-19T10:00:00.000Z';
  storage.setItem(
    `${SAVE_PREFIX}:1`,
    JSON.stringify({ game: SAVE_GAME, version: 1, savedAt, state: legacy }),
  );
  assert.deepEqual(loadState(1, storage), migrated);
  const rewritten = JSON.parse(storage.getItem(`${SAVE_PREFIX}:1`));
  assert.equal(rewritten.savedAt, savedAt);
  assert.equal(rewritten.state.communityRevision, 1);
});

test('save/load/export/import retain restoration and an equipped reforged weapon without duplicate rewards', () => {
  const state = prepared('last_crown', 19),
    storage = store();
  finish(state);
  assert.equal(equip(state, 'vex', 'orchard_staff_2').ok, true);
  state.heroes.find((hero) => hero.id === 'vex').level = 30;
  assert.equal(reforgeCommunityWeapon(state, state.region).ok, true);
  saveState(state, 1, storage);
  assert.deepEqual(loadState(1, storage), state);
  const portable = parseSaveFile(exportSave(1, storage));
  importSave(portable, 2, storage);
  const loaded = loadState(2, storage);
  assert.deepEqual(loaded, state);
  assert.equal(
    loaded.heroes.find((hero) => hero.id === 'vex').equip.weapon,
    'orchard_staff_4',
  );
  assert.equal(
    restoreCommunity(loaded, 'last_crown', 'learning_pavilion').ok,
    false,
  );
  assert.equal(reforgeCommunityWeapon(loaded, 'last_crown').ok, false);
  assert.deepEqual(loaded, state);
});

test('invalid community revisions, foreign state and inconsistent unique ownership are rejected', () => {
  const state = prepared();
  finish(state);
  for (const mutate of [
    (s) => {
      s.communityRevision = 2;
    },
    (s) => {
      delete s.communities;
    },
    (s) => {
      s.communities.unknown = { level: 1, weaponTier: 0 };
    },
    (s) => {
      s.communities.emberline.level = 5;
    },
    (s) => {
      s.communities.emberline.level = 2.5;
    },
    (s) => {
      s.communities.emberline.unexpected = true;
    },
    (s) => {
      s.communities.orbital_reach.weaponTier = 1;
    },
    (s) => {
      s.communities.emberline.weaponTier = 4;
    },
    (s) => {
      s.inventory.duneglass_blade_2 = 2;
    },
    (s) => {
      s.inventory.duneglass_blade_1 = 1;
    },
    (s) => {
      delete s.inventory.duneglass_blade_2;
    },
  ]) {
    const invalid = structuredClone(state);
    mutate(invalid);
    assert.throws(() => migrate(invalid), /community restoration/);
  }
});
