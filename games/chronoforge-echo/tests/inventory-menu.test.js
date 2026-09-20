import test from 'node:test';
import { register } from 'node:module';
import assert from 'node:assert/strict';
import { ITEMS } from '../src/content.js';
import { createState, recruit, equip } from '../src/progression.js';
import { canEquip, weaponOwner } from '../src/equipment.js';
import { saveState, loadState } from '../src/persistence.js';
register('./helpers/css-loader.mjs', import.meta.url);
const { inventoryHero, inventoryRecipient, inventoryItems, inventoryPage } =
  await import('../src/inventory-menu.js');
import { navigateExpedition } from '../src/expedition-navigation.js';
const { renderExpedition } = await import('../src/expedition-menu.js');
const { UI } = await import('../src/ui.js');

function fixture(allCrew = true) {
  const state = createState();
  if (allCrew) {
    recruit(state, 'vex');
    recruit(state, 'rune');
  }
  state.inventory = Object.fromEntries(Object.keys(ITEMS).map((id) => [id, 2]));
  return {
    game: { state, mode: 'world' },
    hero: 0,
    inventoryHero: null,
    inventoryFilter: 'all',
    inventorySort: 'tier',
    inventoryIndex: 0,
    item: null,
    notice: '',
  };
}

function card(html, id) {
  return html.match(
    new RegExp(`<article[^>]*data-pack-item="${id}"[\\s\\S]*?</article>`),
  )?.[0];
}

test('hero filters retain all shared items and combine with item type and tier sorting', () => {
  const ui = fixture();
  assert.equal(inventoryItems(ui).length, Object.keys(ITEMS).length);
  for (const hero of ui.game.state.heroes) {
    ui.inventoryHero = hero.id;
    const ids = inventoryItems(ui);
    assert.ok(
      ids.every((id) => ITEMS[id].slot !== 'weapon' || canEquip(hero.id, id)),
    );
    for (const item of Object.values(ITEMS).filter((i) => i.slot !== 'weapon'))
      assert.ok(ids.includes(item.id));
    ui.inventoryFilter = 'weapon';
    const weapons = inventoryItems(ui);
    assert.ok(weapons.length >= 4);
    assert.ok(
      weapons.every(
        (id) => ITEMS[id].slot === 'weapon' && canEquip(hero.id, id),
      ),
    );
    assert.ok(
      weapons.every(
        (id, i) => !i || ITEMS[weapons[i - 1]].tier >= ITEMS[id].tier,
      ),
    );
    ui.inventoryFilter = 'all';
  }
  ui.inventoryHero = null;
  assert.equal(inventoryItems(ui).length, Object.keys(ITEMS).length);
  ui.inventoryHero = 'unrecruited';
  assert.equal(inventoryHero(ui), null);
  assert.equal(inventoryItems(ui).length, Object.keys(ITEMS).length);
});

test('unfiltered weapons compare and equip only their recruited owner, never the Party hero', () => {
  const ui = fixture();
  ui.hero = 0;
  const html = inventoryPage(ui);
  assert.ok(html.includes('Equipped · All crew'));
  assert.equal(
    (html.match(/class="exp-inventory-hero"[^>]*aria-pressed="true"/g) || [])
      .length,
    0,
  );
  assert.ok(!html.includes('data-menu-hero='));
  for (const item of Object.values(ITEMS).filter((i) => i.slot === 'weapon')) {
    const owner = weaponOwner(item.id);
    assert.equal(inventoryRecipient(ui, item.id).id, owner);
    const itemHtml = card(html, item.id);
    assert.ok(itemHtml.includes(`data-do="equip:${item.id}:${owner}"`));
    assert.ok(
      itemHtml.includes(
        `on ${ui.game.state.heroes.find((h) => h.id === owner).name}`,
      ),
    );
  }
});

test('shared equipment and consumables require a recipient when the hero filter is clear', () => {
  const ui = fixture();
  ui.hero = 2;
  for (const id of ['scrap_vest', 'data_chip', 'field_tonic'])
    assert.equal(inventoryRecipient(ui, id), null);
  let html = inventoryPage(ui);
  for (const id of ['scrap_vest', 'data_chip', 'field_tonic']) {
    assert.ok(card(html, id).includes(`data-do="inventory-recipient:${id}"`));
    assert.ok(card(html, id).includes('Choose recipient'));
  }
  assert.ok(card(html, 'scrap_vest').includes('aria-label="Item stats"'));
  ui.inventoryHero = 'vex';
  ui.game.state.heroes.find((h) => h.id === 'vex').hp = 1;
  html = inventoryPage(ui);
  assert.ok(
    card(html, 'scrap_vest').includes('data-do="equip:scrap_vest:vex"'),
  );
  assert.ok(
    card(html, 'field_tonic').includes('data-do="use:field_tonic:vex"'),
  );
  assert.ok(html.includes('data-menu-hero="vex"'));
  assert.equal(inventoryRecipient(ui, 'iron_blade'), null);
});

test('unrecruited weapon owners cannot receive equipment through the all-crew view', () => {
  const ui = fixture(false);
  const html = card(inventoryPage(ui), 'void_shard');
  assert.equal(inventoryRecipient(ui, 'void_shard'), null);
  assert.ok(html.includes('Recruit Vex'));
  assert.match(html, /class="exp-inventory-action"[^>]*disabled/);
  assert.ok(!html.includes('Equip on Kaida'));
});

test('equipping from a filtered pack retains the filter and a valid grid selection', () => {
  const ui = fixture();
  ui.inventoryHero = 'vex';
  ui.inventoryFilter = 'weapon';
  ui.game.state.inventory.glass_needle = 1;
  ui.item = 'glass_needle';
  inventoryPage(ui);
  assert.equal(
    equip(ui.game.state, inventoryRecipient(ui, ui.item).id, ui.item).ok,
    true,
  );
  inventoryPage(ui);
  assert.equal(ui.inventoryHero, 'vex');
  assert.equal(ui.inventoryFilter, 'weapon');
  assert.ok(inventoryItems(ui).includes(ui.item));
});

test('bracket shortcuts cycle all crew and each hero independently of the Party selection', () => {
  const previous = globalThis.document;
  globalThis.document = { activeElement: null };
  try {
    const ui = fixture();
    ui.tab = 2;
    ui.root = {};
    ui.hero = 2;
    const actions = [];
    ui.action = (action) => {
      actions.push(action);
      ui.inventoryHero =
        action.split(':')[1] === 'all' ? null : action.split(':')[1];
    };
    for (let i = 0; i < 4; i++) assert.equal(navigateExpedition(ui, ']'), true);
    assert.deepEqual(actions, [
      'inventory-hero:kaida',
      'inventory-hero:vex',
      'inventory-hero:rune',
      'inventory-hero:all',
    ]);
    assert.equal(navigateExpedition(ui, '['), true);
    assert.equal(ui.inventoryHero, 'rune');
    assert.equal(ui.hero, 2);
  } finally {
    globalThis.document = previous;
  }
});

test('Space and Enter on a card invoke its explicit recipient or recipient chooser', () => {
  const previous = globalThis.document;
  try {
    for (const key of [' ', 'Enter']) {
      let activated = 0;
      const item = { closest: () => cardElement, matches: () => true };
      const cardElement = {
        querySelector: (selector) =>
          selector === '.exp-inventory-item'
            ? item
            : { click: () => activated++ },
      };
      globalThis.document = { activeElement: item };
      assert.equal(navigateExpedition({ tab: 2, root: {} }, key), true);
      assert.equal(activated, 1);
    }
  } finally {
    globalThis.document = previous;
  }
});

test('Party equipment links preserve the intended hero and use family-specific weapon art', () => {
  const ui = fixture();
  ui.tab = 1;
  ui.hero = 1;
  const html = renderExpedition(ui);
  assert.ok(html.includes('data-do="inventory-open:vex"'));
  assert.ok(html.includes('data-do="inventory-slot:weapon:vex"'));
  assert.ok(html.includes('data-inventory-icon="void_shard"'));
  assert.ok(html.includes('data-icon="food"'));
});

function actionFixture() {
  const ui = Object.assign(Object.create(UI.prototype), fixture(), {
    tab: 2,
    panel: null,
    inventoryRecipientItem: null,
    render() {},
    feedback(result) {
      this.result = result;
    },
    restoreShopRow() {},
    confirm(title, text, run, options) {
      this.confirmation = { title, text, run, ...options };
    },
    root: {
      querySelectorAll: () => [],
      querySelector: () => ({
        focus() {},
        remove() {},
        querySelector: () => null,
        scrollTop: 0,
      }),
    },
  });
  ui.game.audio = { sound() {} };
  ui.game.checkpoint = () => {};
  return ui;
}

test('hero activation toggles and blurs its filter; clearing and Party shortcuts keep recipients explicit', () => {
  const previous = globalThis.document;
  let blurs = 0;
  globalThis.document = { activeElement: { blur: () => blurs++ } };
  try {
    const ui = actionFixture();
    ui.action('inventory-hero:vex');
    assert.equal(ui.inventoryHero, 'vex');
    ui.action('inventory-filter:weapon');
    assert.equal(ui.inventoryHero, 'vex');
    assert.equal(ui.inventoryFilter, 'weapon');
    ui.action('inventory-hero:vex');
    assert.equal(ui.inventoryHero, null);
    assert.equal(ui.inventoryFilter, 'weapon');
    assert.equal(blurs, 1);
    ui.action('inventory-slot:armor:rune');
    assert.equal(ui.inventoryHero, 'rune');
    assert.equal(ui.inventoryFilter, 'armor');
    ui.clearInventoryFilters();
    assert.equal(ui.inventoryHero, null);
    assert.equal(ui.inventoryFilter, 'all');
    ui.action('inventory-open:vex');
    assert.equal(ui.inventoryHero, 'vex');
    assert.equal(ui.inventoryFilter, 'all');
  } finally {
    globalThis.document = previous;
  }
});

test('shared recipient selection returns to the item; explicit actions ignore stale Party selection', () => {
  const ui = actionFixture();
  const focused = [];
  ui.root.querySelector = (selector) => ({
    focus: () => focused.push(selector),
  });
  ui.action('inventory-recipient:scrap_vest');
  assert.equal(ui.inventoryHero, null);
  assert.equal(focused.at(-1), '.exp-inventory-hero');
  ui.action('inventory-hero:vex');
  assert.equal(focused.at(-1), '[data-do="item:scrap_vest"]');
  assert.equal(ui.inventoryRecipientItem, null);
  const kaidaWeapon = ui.game.state.heroes[0].equip.weapon;
  ui.inventoryHero = null;
  ui.action('equip:glass_needle:vex');
  assert.equal(ui.result.ok, true);
  assert.equal(
    ui.game.state.heroes.find((h) => h.id === 'vex').equip.weapon,
    'glass_needle',
  );
  assert.equal(ui.game.state.heroes[0].equip.weapon, kaidaWeapon);
  const before = structuredClone(ui.game.state);
  ui.action('equip:scrap_vest');
  assert.deepEqual(ui.game.state, before);
});

test('menu consumables confirm the explicit recipient and ATB use remains rejected', () => {
  const previous = globalThis.document;
  globalThis.document = {
    activeElement: { dataset: { do: 'use:field_tonic:vex' } },
  };
  try {
    const ui = actionFixture(),
      s = ui.game.state;
    s.heroes[1].hp = 1;
    const count = s.inventory.field_tonic;
    ui.action('use:field_tonic:vex');
    assert.equal(s.inventory.field_tonic, count);
    assert.ok(ui.confirmation.text.startsWith('Vex restores'));
    assert.equal(ui.confirmation.returnFocus, 'use:field_tonic:vex');
    ui.confirmation.run();
    assert.equal(s.inventory.field_tonic, count - 1);
    assert.ok(s.heroes[1].hp > 1);
    ui.game.mode = 'battle';
    ui.confirmation = null;
    ui.action('use:field_tonic:vex');
    assert.equal(ui.confirmation, null);
    assert.equal(ui.result.ok, false);
    assert.equal(s.inventory.field_tonic, count - 1);
  } finally {
    globalThis.document = previous;
  }
});

test('vendors compare weapon families with eligible crew and retain shared armor comparison', () => {
  const ui = actionFixture();
  ui.panel = { type: 'vendor', object: { service: 'smith', name: 'Forge' } };
  ui.shop.sellMode = false;
  ui.game.state.tier = 2;
  ui.game.state.region = 'emberline';
  ui.game.state.heroes[0].level = 20;
  ui.game.state.buildings.forge = 1;
  ui.shell = (_title, body) => body;
  const html = ui.renderVendor();
  const row = (id) =>
    html.match(
      new RegExp(`<article[^>]*data-shop-item="${id}"[\\s\\S]*?</article>`),
    )?.[0];
  assert.ok(row('glass_needle').includes('Staff · Vex'));
  assert.ok(row('glass_needle').includes('vs Vex'));
  assert.ok(!row('glass_needle').includes('vs Kaida'));
  assert.ok(row('glass_needle').includes('data-inventory-icon="glass_needle"'));
  assert.ok(row('signal_saber').includes('vs Kaida'));
  assert.ok(row('bio_weave').includes('vs Kaida'));
  const section = (type) =>
    html.match(
      new RegExp(`<section[^>]*data-shop-type="${type}"[\\s\\S]*?</section>`),
    )?.[0];
  assert.ok(!section('weapon').includes('shop-heroes'));
  assert.ok(section('armor').includes('shop-hero:armor:0'));
  ui.action('shop-hero:armor:1');
  const changed = ui.renderVendor();
  assert.match(changed, /data-shop-item="bio_weave"[\s\S]*?vs Vex/);
  assert.match(changed, /data-shop-item="signal_saber"[\s\S]*?vs Kaida/);
  ui.game.state.heroes = [ui.game.state.heroes[0]];
  const alone = ui
    .renderVendor()
    .match(/<article[^>]*data-shop-item="glass_needle"[\s\S]*?<\/article>/)[0];
  assert.ok(alone.includes('Staff · Vex'));
  assert.ok(!alone.includes('shop-comparison'));
});

test('provisions compare accessories locally and sell supplies without a hero selector', () => {
  const ui = actionFixture();
  ui.panel = {
    type: 'vendor',
    object: { service: 'provisions', name: 'Supplies' },
  };
  ui.shop.sellMode = false;
  ui.game.state.tier = 2;
  ui.game.state.region = 'emberline_town';
  ui.shell = (_title, body) => body;
  const html = ui.renderVendor();
  assert.ok(html.includes('buy:crit_lens'));
  assert.ok(html.includes('buy:dawn_seed'));
  assert.ok(!html.includes('data-shop-type="weapon"'));
  const accessories = html.match(
    /data-shop-type="accessory"[\s\S]*?<\/section>/,
  )[0];
  const supplies = html.match(
    /data-shop-type="consumable"[\s\S]*?<\/section>/,
  )[0];
  assert.ok(accessories.includes('shop-hero:accessory:0'));
  assert.ok(!supplies.includes('shop-heroes'));
  ui.shop.sellMode = true;
  assert.ok(!ui.renderVendor().includes('shop-heroes'));
});

test('research and closed workshops expose no trade controls or transactions', () => {
  const ui = actionFixture();
  ui.game.state.tier = 4;
  ui.game.state.heroes[0].level = 40;
  ui.game.state.buildings.research_lab = 1;
  ui.game.state.buildings.forge = 1;
  ui.shell = (_title, body) => body;
  for (const service of ['archivist', 'artificer']) {
    ui.shop.sellMode = false;
    ui.panel = { type: 'vendor', object: { service, name: service } };
    const html = ui.renderVendor();
    assert.ok(!html.includes('shop-toolbar'));
    assert.ok(!html.includes('data-do="buy:'));
    assert.ok(!html.includes('data-do="sell:'));
    assert.ok(!html.includes('shop-heroes'));
    if (service === 'archivist') assert.ok(html.includes('data-do="research"'));
    else {
      assert.ok(html.includes('Counter closed.'));
      assert.ok(!html.includes('This service opens'));
    }
    const before = structuredClone(ui.game.state);
    ui.confirmation = null;
    ui.action('trade-mode');
    ui.action('sell:iron_blade');
    ui.action('buy:iron_blade');
    assert.equal(ui.shop.sellMode, false);
    assert.equal(ui.confirmation, null);
    assert.deepEqual(ui.game.state, before);
  }
});

test('an early visit explains a regional gear lock without claiming the pack is empty', () => {
  const ui = actionFixture();
  ui.panel = {
    type: 'vendor',
    object: { service: 'smith', name: 'Anchor Smith' },
  };
  ui.shop.sellMode = false;
  ui.game.state.region = 'orbital_reach_town';
  ui.game.state.tier = 2;
  ui.shell = (_title, body) => body;
  const html = ui.renderVendor();
  assert.ok(html.includes('Local equipment requires Ascendant civilization.'));
  assert.ok(!html.includes('No items in your pack'));
});

test('shop purchases charge the quoted quantity and recheck regional stock before payment', () => {
  const ui = actionFixture();
  const state = ui.game.state;
  ui.panel = {
    type: 'vendor',
    object: { service: 'smith', name: 'Brass Anvil' },
  };
  state.tier = 2;
  state.region = 'emberline_town';
  state.resources.ore = 300;
  const owned = state.inventory.signal_saber;
  ui.action('shop-qty:signal_saber:up');
  ui.action('buy:signal_saber');
  assert.equal(state.resources.ore, 300);
  assert.equal(ui.panel.type, 'vendor');
  ui.action('shop-confirm:signal_saber');
  assert.equal(ui.result.ok, true);
  assert.equal(state.resources.ore, 140);
  assert.equal(state.inventory.signal_saber, owned + 2);
  ui.action('shop-qty:signal_saber:down');
  ui.action('buy:signal_saber');
  state.region = 'haventide_town';
  ui.action('shop-confirm:signal_saber');
  assert.equal(ui.result.ok, false);
  assert.equal(state.resources.ore, 140);
  assert.equal(state.inventory.signal_saber, owned + 2);
});

function shopCard(ui, id) {
  return ui
    .renderVendor()
    .match(
      new RegExp(`<article[^>]*data-shop-item="${id}"[\\s\\S]*?</article>`),
    )?.[0];
}
function shopButton(ui, id, action = 'buy:' + id) {
  return shopCard(ui, id)?.match(
    new RegExp(`<button[^>]*data-do="${action}"[^>]*>`),
  )?.[0];
}

function shopFixture() {
  const ui = actionFixture();
  ui.panel = { type: 'vendor', object: { service: 'smith', name: 'Forge' } };
  ui.shop.sellMode = false;
  ui.game.state.region = 'haventide_town';
  ui.shell = (_title, body) => body;
  return ui;
}

test('shop affordability follows quantity, discounts and whole-ore pricing', () => {
  const ui = shopFixture(),
    state = ui.game.state;
  state.resources.ore = 30;
  assert.ok(!shopButton(ui, 'iron_blade').includes('disabled'));
  assert.ok(shopButton(ui, 'bog_fang').includes('disabled'));
  state.resources.ore = 60;
  ui.action('shop-qty:iron_blade:up');
  state.resources.ore = 30;
  assert.ok(shopButton(ui, 'iron_blade').includes('disabled'));
  state.flags.mara_trade_route = true;
  state.resources.ore = 51;
  assert.ok(!shopButton(ui, 'iron_blade').includes('disabled'));
  state.resources.ore = 50.99;
  assert.ok(shopButton(ui, 'iron_blade').includes('disabled'));
  ui.action('shop-qty:iron_blade:down');
  state.resources.ore = 25.99;
  assert.ok(shopButton(ui, 'iron_blade').includes('disabled'));
  state.resources.ore = 26;
  assert.ok(!shopButton(ui, 'iron_blade').includes('disabled'));
  ui.panel.object.service = 'provisions';
  state.resources.ore = 0;
  assert.ok(shopButton(ui, 'field_tonic').includes('disabled'));
  assert.ok(shopButton(ui, 'data_chip').includes('disabled'));
});

test('unaffordable actions cannot open confirmation or alter the pack or balance', () => {
  const ui = shopFixture(),
    state = ui.game.state;
  state.tier = 3;
  state.region = 'orbital_reach_town';
  state.resources.ore = 31;
  const before = structuredClone(state);
  ui.action('buy:magma_blade');
  assert.equal(ui.panel.type, 'vendor');
  assert.equal(ui.confirmation, undefined);
  assert.deepEqual(state, before);
});

test('purchases disable unaffordable stock and selling enables it again', () => {
  const ui = shopFixture(),
    state = ui.game.state;
  state.resources.ore = 30;
  ui.action('buy:iron_blade');
  ui.action('shop-confirm:iron_blade');
  assert.equal(ui.result.ok, true);
  assert.equal(state.resources.ore, 0);
  assert.ok(shopButton(ui, 'iron_blade').includes('disabled'));
  ui.action('trade-mode');
  assert.ok(
    !shopButton(ui, 'iron_blade', 'sell:iron_blade').includes('disabled'),
  );
  ui.action('shop-qty:iron_blade:up');
  ui.action('shop-qty:iron_blade:up');
  ui.action('sell:iron_blade');
  ui.action('shop-confirm:iron_blade');
  assert.equal(ui.result.ok, true);
  assert.equal(state.resources.ore, 39);
  ui.action('trade-mode');
  assert.ok(!shopButton(ui, 'iron_blade').includes('disabled'));
  assert.ok(!shopButton(ui, 'bog_fang').includes('disabled'));
});

test('confirmed purple weapons enter Inventory for each eligible hero', () => {
  const ui = shopFixture(),
    state = ui.game.state;
  state.tier = 3;
  state.region = 'orbital_reach_town';
  state.resources.ore = 465;
  state.inventory = {};
  for (const id of ['magma_blade', 'ember_core', 'ash_gauntlet']) {
    ui.action('buy:' + id);
    assert.equal(ui.panel.type, 'vendor');
    assert.ok(ui.shop.quote);
    ui.action('shop-confirm:' + id);
    assert.equal(ui.result.ok, true);
    assert.equal(state.inventory[id], 1);
    ui.inventoryHero = weaponOwner(id);
    assert.ok(inventoryItems(ui).includes(id));
    assert.ok(card(inventoryPage(ui), id));
  }
  assert.equal(state.resources.ore, 0);
  assert.ok(shopButton(ui, 'magma_blade').includes('disabled'));
});

test('successful purchases and sales checkpoint the updated pack and ore at either retail service', () => {
  for (const [service, id] of [
    ['smith', 'iron_blade'],
    ['provisions', 'field_tonic'],
  ]) {
    const ui = shopFixture(),
      state = ui.game.state;
    ui.panel.object.service = service;
    state.x = 200;
    state.y = 200;
    state.resources.ore = 100;
    const slots = new Map(),
      storage = {
        getItem: (key) => slots.get(key) ?? null,
        setItem: (key, value) => slots.set(key, value),
      };
    saveState(state, 1, storage);
    const manual = loadState(1, storage);
    let writes = 0;
    ui.game.checkpoint = () => {
      writes++;
      saveState(ui.game.state, 'checkpoint', storage);
    };
    ui.action('buy:' + id);
    assert.equal(writes, 0);
    ui.action('shop-cancel:' + id);
    assert.equal(writes, 0);
    ui.action('buy:' + id);
    ui.action('shop-confirm:' + id);
    assert.equal(writes, 1);
    let saved = loadState('checkpoint', storage);
    assert.equal(saved.inventory[id], manual.inventory[id] + 1);
    assert.equal(saved.resources.ore, 100 - ITEMS[id].price);

    ui.action('trade-mode');
    ui.action('sell:' + id);
    ui.action('shop-confirm:' + id);
    assert.equal(writes, 2);
    saved = loadState('checkpoint', storage);
    assert.deepEqual(saved.inventory, state.inventory);
    assert.equal(saved.resources.ore, state.resources.ore);
    assert.deepEqual(loadState(1, storage), manual);

    ui.action('trade-mode');
    ui.action('buy:' + id);
    state.resources.ore = 0;
    ui.action('shop-confirm:' + id);
    assert.equal(ui.result.ok, false);
    assert.equal(
      writes,
      2,
      'Rejected transactions must not overwrite the checkpoint',
    );
  }
});

test('Sell All confirms a full stack above 99 and preserves equipped items and other stacks', () => {
  const ui = shopFixture(),
    state = ui.game.state;
  state.inventory.iron_blade = 120;
  state.resources.ore = 0;
  const equipment = structuredClone(state.heroes.map((h) => h.equip));
  const before = structuredClone(state.inventory);
  let writes = 0;
  ui.game.checkpoint = () => writes++;
  ui.action('trade-mode');
  assert.ok(shopButton(ui, 'iron_blade', 'sell-all:iron_blade'));
  ui.action('sell-all:iron_blade');
  assert.equal(ui.shop.quote.quantity, 120);
  assert.equal(ui.shop.quote.total, 1560);
  assert.ok(shopCard(ui, 'iron_blade').includes('aria-label="Quantity 120"'));
  assert.ok(shopCard(ui, 'iron_blade').includes('13 ore each'));
  assert.ok(shopButton(ui, 'iron_blade', 'shop-confirm:iron_blade'));
  assert.ok(shopButton(ui, 'iron_blade', 'shop-cancel:iron_blade'));
  assert.deepEqual(state.inventory, before);
  ui.action('shop-cancel:iron_blade');
  assert.equal(writes, 0);
  ui.action('sell-all:iron_blade');
  ui.action('shop-confirm:iron_blade');
  assert.equal(writes, 1);
  assert.equal(state.resources.ore, 1560);
  assert.deepEqual(state.inventory, { ...before, iron_blade: 0 });
  assert.deepEqual(
    state.heroes.map((h) => h.equip),
    equipment,
  );
  ui.action('shop-confirm:iron_blade');
  assert.equal(writes, 1, 'Repeated confirmation cannot sell twice');
});

test('Sell All rejects keepsakes, invalid contexts and changed ownership', () => {
  const ui = shopFixture(),
    state = ui.game.state;
  let writes = 0;
  ui.game.checkpoint = () => writes++;
  ui.action('sell-all:iron_blade');
  assert.equal(ui.shop.quote, null);
  ui.action('trade-mode');
  assert.ok(
    shopButton(ui, 'namekeeper', 'sell-all:namekeeper').includes('disabled'),
  );
  ui.action('sell-all:namekeeper');
  assert.equal(ui.shop.quote, null);
  ui.action('sell-all:iron_blade');
  state.inventory.iron_blade = 1;
  const before = structuredClone(state);
  ui.action('shop-confirm:iron_blade');
  assert.equal(ui.result.ok, false);
  assert.deepEqual(state, before);
  assert.equal(writes, 0);
});

test('weapon comparisons name current equipment and show losses against an upgrade', () => {
  const ui = shopFixture(),
    kaida = ui.game.state.heroes[0];
  assert.ok(shopCard(ui, 'iron_blade').includes('Equipped'));
  kaida.equip.weapon = 'magma_blade';
  const blade = shopCard(ui, 'iron_blade');
  assert.ok(blade.includes('vs Kaida · Magma Blade'));
  assert.ok(blade.includes('Strength -17'));
  assert.ok(blade.includes('Critical % -5'));
  assert.ok(!blade.includes('No stat change'));
});

test('each shop card owns its quantity and changing it cancels the pending trade', () => {
  const ui = shopFixture();
  ui.game.state.resources.ore = 200;
  ui.action('shop-qty:iron_blade:up');
  assert.equal(ui.shop.quantity('iron_blade'), 2);
  assert.equal(ui.shop.quantity('bog_fang'), 1);
  ui.action('buy:iron_blade');
  assert.equal(ui.shop.quote.total, 60);
  assert.equal(ui.panel.type, 'vendor');
  assert.ok(shopButton(ui, 'iron_blade', 'shop-confirm:iron_blade'));
  assert.ok(!shopButton(ui, 'iron_blade', 'buy:iron_blade'));
  ui.action('shop-qty:iron_blade:up');
  assert.equal(ui.shop.quote, null);
  assert.equal(ui.shop.quantity('iron_blade'), 3);
  ui.action('shop-confirm:iron_blade');
  assert.equal(ui.game.state.resources.ore, 200);
  ui.action('buy:iron_blade');
  ui.action('trade-mode');
  assert.equal(ui.shop.quote, null);
  assert.equal(ui.shop.quantity('iron_blade'), 1);
  assert.ok(!ui.renderVendor().includes('data-do="qty:'));
});

test('a quantity that becomes unaffordable can be decreased without enabling payment', () => {
  const ui = shopFixture();
  ui.game.state.resources.ore = 100;
  ui.action('shop-qty:iron_blade:up');
  ui.action('shop-qty:iron_blade:up');
  ui.action('buy:bog_fang');
  ui.action('shop-confirm:bog_fang');
  assert.equal(ui.game.state.resources.ore, 64);
  assert.equal(ui.shop.quantity('iron_blade'), 3);
  assert.ok(shopButton(ui, 'iron_blade').includes('disabled'));
  assert.ok(
    !shopButton(ui, 'iron_blade', 'shop-qty:iron_blade:down').includes(
      'disabled',
    ),
  );
  ui.action('shop-qty:iron_blade:down');
  assert.equal(ui.shop.quantity('iron_blade'), 2);
  assert.ok(!shopButton(ui, 'iron_blade').includes('disabled'));
  ui.game.state.resources.ore = 29;
  for (const action of [
    'buy:iron_blade',
    'shop-qty:iron_blade:up',
    'shop-qty:iron_blade:down',
  ])
    assert.ok(shopButton(ui, 'iron_blade', action).includes('disabled'));
});

test('inline confirmation rejects changed balance, prices, stock, vendor and session', () => {
  for (const change of [
    (ui) => {
      ui.game.state.resources.ore = 29;
    },
    (ui) => {
      ui.game.state.flags.mara_trade_route = true;
    },
    (ui) => {
      ui.game.state.region = 'emberline_town';
    },
    (ui) => {
      ui.panel = { type: 'vendor', object: { service: 'provisions' } };
    },
    (ui) => {
      ui.game.state = structuredClone(ui.game.state);
    },
  ]) {
    const ui = shopFixture();
    ui.game.state.resources.ore = 100;
    ui.action('buy:iron_blade');
    change(ui);
    const before = structuredClone(ui.game.state);
    ui.action('shop-confirm:iron_blade');
    assert.deepEqual(ui.game.state, before);
    assert.equal(ui.shop.quote, null);
    assert.equal(ui.result.ok, false);
  }
});

test('sales confirm the selected quantity and retain unique keepsakes', () => {
  const ui = shopFixture(),
    state = ui.game.state;
  state.resources.ore = 0;
  ui.action('trade-mode');
  ui.action('shop-qty:iron_blade:up');
  ui.action('sell:iron_blade');
  assert.equal(state.inventory.iron_blade, 2);
  assert.equal(state.resources.ore, 0);
  assert.equal(ui.shop.quote.total, 26);
  ui.action('shop-cancel:iron_blade');
  assert.equal(ui.shop.quote, null);
  ui.action('sell:iron_blade');
  state.inventory.iron_blade = 1;
  ui.action('shop-confirm:iron_blade');
  assert.equal(ui.result.ok, false);
  assert.equal(state.inventory.iron_blade, 1);
  const keepsake = Object.values(ITEMS).find((item) => item.unique);
  assert.ok(keepsake);
  ui.action('sell:' + keepsake.id);
  assert.equal(ui.shop.quote, null);
});

test('Space and Enter buy then confirm inline, and Escape cancels without leaving the shop', () => {
  const previous = globalThis.document;
  try {
    for (const key of [' ', 'Enter']) {
      const ui = shopFixture(),
        state = ui.game.state;
      state.resources.ore = 100;
      ui.game.keys = new Set();
      const button = (action) => ({
        tagName: 'BUTTON',
        matches: () => false,
        dataset: { do: action },
        click: () => ui.action(action),
      });
      ui.root.contains = () => true;
      ui.shop.refresh = (_id, action) => {
        globalThis.document.activeElement = button(action);
      };
      globalThis.document = { activeElement: button('buy:iron_blade') };
      ui.handleKey(key);
      assert.equal(state.resources.ore, 100);
      assert.equal(ui.panel.type, 'vendor');
      assert.equal(
        globalThis.document.activeElement.dataset.do,
        'shop-confirm:iron_blade',
      );
      ui.handleKey('Escape');
      assert.equal(ui.panel.type, 'vendor');
      assert.equal(ui.shop.quote, null);
      assert.equal(state.resources.ore, 100);
      ui.handleKey(key);
      ui.handleKey(key);
      assert.equal(state.resources.ore, 70);
      assert.equal(ui.panel.type, 'vendor');
    }
  } finally {
    globalThis.document = previous;
  }
});

test('shop feedback is an overlay toast with current resources and no duplicate reward', () => {
  const ui = shopFixture();
  ui.shop.sync();
  const rewards = [];
  ui.game.rewards = (items) => rewards.push(...items);
  ui.feedback = UI.prototype.feedback;
  ui.feedback({
    ok: true,
    message: 'Bought 1 Iron Blade.',
    rewards: [{ id: 'iron_blade', amount: 1 }],
  });
  assert.equal(ui.notice, '');
  assert.equal(ui.notifications.current.message, 'Bought 1 Iron Blade.');
  assert.deepEqual(rewards, []);
  ui.game.state.resources.ore = 7;
  const html = UI.prototype.shell.call(
    ui,
    'Shop',
    '<div id="wares">Items</div>',
  );
  assert.ok(html.includes('class="shop-resources"'));
  assert.ok(html.includes('aria-label="7 ore"'));
  assert.ok(!html.includes('class="notice"'));
  assert.ok(
    html.indexOf('class="ui-toast"') >
      html.indexOf('<div id="wares">Items</div></div>'),
  );
  ui.feedback({ ok: false, message: 'Price changed.' });
  assert.equal(ui.notifications.current.message, 'Price changed.');
  assert.equal(ui.notifications.current.ok, false);
  assert.ok(UI.prototype.shell.call(ui, 'Shop', '').includes('ui-toast-error'));
  ui.notifications.clear();
});

test('Inventory feedback above a vendor retains its reserved notice and rewards', () => {
  const ui = shopFixture();
  ui.menu = true;
  const rewards = [];
  ui.game.rewards = (items) => rewards.push(...items);
  UI.prototype.feedback.call(ui, {
    ok: true,
    message: 'Technique learned.',
    rewards: [{ id: 'xp', amount: 2 }],
  });
  assert.equal(ui.notice, 'Technique learned.');
  assert.deepEqual(rewards, [{ id: 'xp', amount: 2 }]);
  assert.equal(ui.notifications, undefined);
});

test('selling the final copy focuses the next remaining item without jumping to the toolbar', () => {
  const ui = shopFixture(),
    state = ui.game.state;
  ui.shop.sellMode = true;
  state.inventory.iron_blade = 1;
  state.inventory.scrap_vest = 1;
  ui.shop.sync();
  ui.shop.request('iron_blade', 'sell');
  let focused = null;
  ui.root.querySelectorAll = (selector) =>
    selector === '[data-shop-item]'
      ? ['iron_blade', 'scrap_vest'].map((id) => ({
          dataset: { shopItem: id },
        }))
      : [];
  ui.root.querySelector = (selector) =>
    selector === '[data-shop-item="scrap_vest"] .shop-trade:not(:disabled)'
      ? {
          focus: () => {
            focused = 'scrap_vest';
          },
        }
      : null;
  ui.shop.confirm('iron_blade');
  assert.equal(state.inventory.iron_blade, 0);
  assert.equal(focused, 'scrap_vest');
});

test('Space and Enter on an unaffordable receipt preserve focus instead of restarting shop navigation', () => {
  const previous = globalThis.document;
  try {
    const ui = shopFixture();
    let focusChanges = 0;
    ui.focus = () => focusChanges++;
    const receipt = {
      matches: (selector) => selector === '[data-shop-item]',
      querySelector: () => null,
    };
    globalThis.document = { activeElement: receipt };
    ui.handleKey('Enter');
    ui.handleKey(' ');
    assert.equal(focusChanges, 0);
    assert.equal(globalThis.document.activeElement, receipt);
  } finally {
    globalThis.document = previous;
  }
});
