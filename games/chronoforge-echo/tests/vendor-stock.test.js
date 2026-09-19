import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, SERVICES } from '../src/content.js';
import { ALL_SCENES } from '../src/world.js';
import {
  createState,
  serviceStock,
  serviceAvailable,
  research,
} from '../src/progression.js';

const regions = ['haventide', 'emberline', 'orbital_reach', 'last_crown'];

test('each town has exactly one smith/provisions pair with disjoint stock and complete retail coverage', () => {
  const state = createState();
  state.tier = 4;
  const sold = new Set();
  for (const [index, region] of regions.entries()) {
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
          ? item.tier <= index + 1
          : item.tier === index + 1,
      );
      sold.add(id);
    }
    assert.deepEqual(serviceStock(state, 'smith', region), smith);
    assert.deepEqual(serviceStock(state, 'provisions', region), provisions);
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

test('local equipment never expands into earlier or later bands; supplies carry forward', () => {
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
    serviceStock(state, 'provisions', 'emberline').sort(),
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
  assert.deepEqual(serviceStock(state, 'smith', 'forest_veil'), []);
  assert.deepEqual(serviceStock(state, 'provisions', 'crater_ember'), []);
  state.tier = 2;
  assert.deepEqual(serviceStock(state, 'smith', 'orbital_reach'), []);
  assert.deepEqual(
    serviceStock(state, 'provisions', 'orbital_reach').sort(),
    ['field_tonic', 'ether_cell', 'dawn_seed'].sort(),
  );
  assert.ok(serviceStock(state, 'smith', 'emberline').includes('signal_saber'));
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
