import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, SERVICES, REGIONAL_SHOP_TIERS } from '../src/content.js';
import { ALL_SCENES } from '../src/world.js';
import {
  createState,
  serviceStock,
  serviceAvailable,
  research,
  shopStockTier,
} from '../src/progression.js';

const regions = Object.keys(REGIONAL_SHOP_TIERS);

test('town ceilings are paired by authored region, independent of discovery order and hero level', () => {
  const ceilings = {
    haventide: 1,
    emberline: 1,
    orbital_reach: 2,
    forest_veil: 2,
    mire_bog: 3,
    crater_ember: 3,
    frost_canyon: 4,
    last_crown: 4,
  };
  assert.deepEqual(REGIONAL_SHOP_TIERS, ceilings);
  for (const order of [regions, [...regions].reverse()]) {
    const state = createState();
    state.heroes[0].level = 8;
    for (const region of order) {
      state.visited[region] = state.visited[region + '_town'] = true;
      for (const tier of [1, 2, 3, 4]) {
        state.tier = tier;
        const available = Math.min(ceilings[region], tier);
        assert.equal(shopStockTier(state, region + '_town'), available);
        for (const service of ['smith', 'provisions']) {
          const stock = serviceStock(state, service, region);
          assert.ok(stock.length, region + ' offers basic stock immediately');
          for (const id of stock)
            assert.ok(
              ITEMS[id].slot === 'consumable'
                ? ITEMS[id].tier <= available
                : ITEMS[id].tier === available,
            );
        }
      }
    }
  }
  const state = createState();
  state.heroes[0].level = 8;
  state.region = 'mire_bog_town';
  assert.ok(serviceStock(state, 'smith').includes('iron_blade'));
  assert.ok(!serviceStock(state, 'smith').includes('magma_blade'));
  state.tier = 3;
  assert.ok(serviceStock(state, 'smith').includes('magma_blade'));
  assert.ok(!serviceStock(state, 'smith').includes('iron_blade'));
  state.tier = 1;
  state.heroes[0].level = 40;
  assert.ok(
    !serviceStock(state, 'smith').includes('magma_blade'),
    'Hero level never bypasses civilization',
  );
});

test('each town has exactly one smith/provisions pair with disjoint stock and complete retail coverage', () => {
  const state = createState();
  state.tier = 4;
  const sold = new Set();
  for (const region of regions) {
    const town = ALL_SCENES[region + '_town'];
    const shops = town.objects.filter((o) => SERVICES[o.service]?.shop);
    assert.deepEqual(shops.map((o) => o.service).sort(), [
      'provisions',
      'smith',
    ]);
    const smith = serviceStock(state, 'smith', town.id);
    const provisions = serviceStock(state, 'provisions', town.id);
    assert.ok(smith.length && provisions.length);
    assert.ok(
      smith.every((id) => ['weapon', 'armor'].includes(ITEMS[id].slot)),
    );
    assert.ok(
      provisions.every((id) =>
        ['accessory', 'consumable'].includes(ITEMS[id].slot),
      ),
    );
    assert.ok(!smith.some((id) => provisions.includes(id)));
    for (const id of [...smith, ...provisions]) {
      const item = ITEMS[id];
      assert.ok(
        item.slot === 'consumable'
          ? item.tier <= REGIONAL_SHOP_TIERS[region]
          : item.tier === REGIONAL_SHOP_TIERS[region],
      );
      sold.add(id);
    }
    assert.deepEqual(serviceStock(state, 'smith', region), smith);
    assert.deepEqual(serviceStock(state, 'provisions', region), provisions);
    if (state.communities[region] || region === 'haventide')
      assert.ok(
        town.objects.some(
          (o) => o.service === 'artificer' && o.havenPart === 'engineering',
        ),
      );
  }
  assert.deepEqual(
    [...sold].sort(),
    Object.values(ITEMS)
      .filter((i) => i.price > 0 && !i.unique)
      .map((i) => i.id)
      .sort(),
  );
});

test('local equipment stops at its ceiling; supplies carry forward through the available band', () => {
  const state = createState();
  state.tier = 4;
  assert.deepEqual(
    serviceStock(state, 'smith', 'haventide').sort(),
    [
      'iron_blade',
      'bog_fang',
      'void_shard',
      'rune_gauntlet',
      'scrap_vest',
    ].sort(),
  );
  assert.deepEqual(
    serviceStock(state, 'provisions', 'forest_veil').sort(),
    [
      'crit_lens',
      'swamp_coil',
      'moss_ward',
      'field_tonic',
      'ether_cell',
      'dawn_seed',
    ].sort(),
  );
  assert.deepEqual(
    serviceStock(state, 'provisions', 'last_crown').sort(),
    [
      'ember_crown',
      'field_tonic',
      'ether_cell',
      'dawn_seed',
      'tide_elixir',
      'star_cell',
    ].sort(),
  );
  assert.deepEqual(serviceStock(state, 'smith', 'missing'), []);
  assert.deepEqual(serviceStock(state, 'provisions', 'missing'), []);
  state.tier = 2;
  assert.deepEqual(
    serviceStock(state, 'provisions', 'orbital_reach').sort(),
    [
      'crit_lens',
      'swamp_coil',
      'moss_ward',
      'field_tonic',
      'ether_cell',
      'dawn_seed',
    ].sort(),
  );
  assert.ok(
    serviceStock(state, 'smith', 'orbital_reach').includes('signal_saber'),
  );
  assert.ok(
    !serviceStock(state, 'smith', 'emberline').includes('signal_saber'),
  );
});

test('archivists retain one-time research while artificers never unlock trading', () => {
  const state = createState();
  state.heroes[0].level = 40;
  state.buildings.forge = 4;
  state.buildings.research_lab = 4;
  for (let tier = 1; tier <= 4; tier++) {
    state.tier = tier;
    assert.equal(serviceAvailable(state, 'artificer'), false);
    for (const region of regions) {
      assert.deepEqual(serviceStock(state, 'archivist', region), []);
      assert.deepEqual(serviceStock(state, 'artificer', region), []);
    }
  }
  state.resources.ore = 200;
  state.resources.energy = 200;
  assert.equal(serviceAvailable(state, 'archivist'), true);
  assert.equal(research(state).ok, true);
  assert.equal(state.flags.research_concord, true);
  assert.equal(state.resources.ore, 120);
  assert.equal(state.resources.energy, 130);
  assert.equal(research(state).ok, false);
});
