import test from 'node:test';
import { register } from 'node:module';
import assert from 'node:assert/strict';
import { ITEMS } from '../src/content.js';
import { createState, recruit, equip } from '../src/progression.js';
import { canEquip, weaponOwner } from '../src/equipment.js';
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
    root: { querySelector: () => ({ focus() {}, scrollTop: 0 }) },
  });
  ui.game.audio = { sound() {} };
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
  ui.qty = 1;
  ui.sellMode = false;
  ui.game.state.tier = 2;
  ui.game.state.region = 'emberline';
  ui.game.state.heroes[0].level = 20;
  ui.game.state.buildings.forge = 1;
  ui.shell = (_title, body) => body;
  const html = ui.renderVendor();
  const row = (id) =>
    html.match(
      new RegExp(`<button[^>]*data-do="buy:${id}"[\\s\\S]*?</button>`),
    )?.[0];
  assert.ok(row('glass_needle').includes('Staff · Vex'));
  assert.ok(row('glass_needle').includes('vs Vex'));
  assert.ok(!row('glass_needle').includes('vs Kaida'));
  assert.ok(row('glass_needle').includes('data-inventory-icon="glass_needle"'));
  assert.ok(row('signal_saber').includes('vs Kaida'));
  assert.ok(row('bio_weave').includes('vs Kaida'));
  ui.game.state.heroes = [ui.game.state.heroes[0]];
  const alone = ui
    .renderVendor()
    .match(/<button[^>]*data-do="buy:glass_needle"[\s\S]*?<\/button>/)[0];
  assert.ok(alone.includes('Staff · Vex'));
  assert.ok(!alone.includes('shop-comparison'));
});
