import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createState, recruit, equip } from '../src/progression.js';
import { ITEMS } from '../src/content.js';
import {
  COMMUNITY_DEFINITIONS,
  communityStatus,
} from '../src/community-restoration.js';
import { vendorAction } from '../src/vendor-actions.js';
register('./helpers/css-loader.mjs', import.meta.url);
const { UI } = await import('../src/ui.js');
const { inventoryPage } = await import('../src/inventory-menu.js');
const { renderExpedition } = await import('../src/expedition-menu.js');

function fixture(t) {
  const state = createState();
  recruit(state, 'vex');
  recruit(state, 'rune');
  for (const id of Object.keys(state.resources)) state.resources[id] = 3000;
  for (const town of COMMUNITY_DEFINITIONS)
    state.flags[`${town.id}_liberated`] = true;
  state.region = 'emberline_town';
  const checkpointed = [];
  const ui = Object.assign(Object.create(UI.prototype), {
    game: {
      state,
      mode: 'world',
      keys: new Set(),
      audio: { sound() {} },
      checkpoint: () => checkpointed.push(structuredClone(state)),
    },
    panel: { type: 'build' },
    menu: false,
    hero: 0,
    tab: 0,
    notice: '',
    root: { querySelector: () => null, querySelectorAll: () => [] },
    render() {
      this.notifications?.retain(this.feedbackContext());
    },
  });
  ui.game.ui = ui;
  t.after(() => ui.notifications?.clear());
  return { ui, state, checkpointed };
}

const action = (html, id) =>
  html.match(new RegExp(`<button[^>]*data-do="${id}"[^>]*>`))?.[0];
const completeTown = (ui) => {
  for (const project of ui.community.status.projects) {
    if (project.complete) continue;
    ui.action(`community-restore:${project.id}`);
    ui.action('community-confirm');
  }
};

test('regional panels show local projects and balances without Haventide building or civilization controls', (t) => {
  const { ui, state } = fixture(t);
  state.buildings.town_center = 4;
  state.tier = 4;
  for (const town of COMMUNITY_DEFINITIONS) {
    state.region = `${town.id}_town`;
    const html = ui.renderBuild();
    assert.match(html, new RegExp(`data-community="${town.id}"`));
    assert.match(html, /Local restoration <strong>LV 1 \/ 4/);
    assert.match(html, /aria-label="Available resources"/);
    assert.ok(
      html.indexOf('Available resources') < html.indexOf('atlas-body scroll'),
    );
    assert.doesNotMatch(
      html,
      /data-do="(?:build:|tier")|CIVILIZATION|Town Center|ALL HARBORS/,
    );
    assert.equal((html.match(/data-community-project=/g) || []).length, 3);
    assert.doesNotMatch(
      action(html, `community-restore:${town.projects[0].id}`),
      /disabled/,
    );
    assert.match(
      action(html, `community-restore:${town.projects[1].id}`),
      /disabled/,
    );
  }
  state.region = 'haventide_town';
  assert.match(ui.renderBuild(), /HAVENTIDE \/ YOUR SETTLEMENT/);
  assert.match(ui.renderBuild(), /data-do="build:town_center"/);
});

test('project confirmation stays inside its card and Escape cancels without spending or saving', (t) => {
  const { ui, state, checkpointed } = fixture(t);
  const project = ui.community.status.projects[0];
  const before = structuredClone(state);
  ui.action(`community-restore:${project.id}`);
  assert.equal(ui.panel.type, 'build');
  const html = ui.renderBuild();
  assert.match(html, /data-do="community-confirm"/);
  assert.doesNotMatch(html, /class="modal/);
  assert.match(
    html,
    new RegExp(
      `data-community-project="${project.id}".*data-do="community-confirm"`,
      's',
    ),
  );
  assert.equal(ui.handleEscape(), true);
  assert.equal(ui.panel.type, 'build');
  assert.equal(ui.community.quote, null);
  assert.deepEqual(state, before);
  assert.equal(checkpointed.length, 0);
});

test('unaffordable projects are disabled and cannot open a confirmation', (t) => {
  const { ui, state, checkpointed } = fixture(t);
  state.resources.ore = 0;
  const project = ui.community.status.projects[0];
  const html = ui.renderBuild();
  assert.match(action(html, `community-restore:${project.id}`), /disabled/);
  assert.match(html, /community-unavailable/);
  ui.action(`community-restore:${project.id}`);
  ui.action('community-confirm');
  assert.equal(ui.community.quote, undefined);
  assert.equal(checkpointed.length, 0);
  assert.equal(ui.community.status.level, 1);
});

test('regional service requirements point to local restoration instead of Haventide buildings', (t) => {
  const { state } = fixture(t);
  for (const service of ['trainer', 'archivist']) {
    const action = vendorAction(state, { service });
    assert.match(action.status, /local community restoration level 2/);
    assert.doesNotMatch(action.status, /Barracks|Research Lab/);
  }
});

test('stale quote after travel cannot restore or spend in another community', (t) => {
  const { ui, state, checkpointed } = fixture(t);
  ui.action(`community-restore:${ui.community.status.projects[0].id}`);
  state.region = 'orbital_reach_town';
  const resources = { ...state.resources };
  ui.action('community-confirm');
  assert.equal(ui.community.status.level, 1);
  assert.equal(communityStatus(state, 'emberline').level, 1);
  assert.deepEqual(state.resources, resources);
  assert.equal(checkpointed.length, 0);
  assert.equal(ui.notifications.current.ok, false);
});

test('completion checkpoints once per project and retains exact reward and next reforge information', (t) => {
  const { ui, state, checkpointed } = fixture(t);
  state.heroes[0].level = 21;
  ui.game.devTools = { worldPreviewActive: true };
  completeTown(ui);
  assert.equal(checkpointed.length, 3);
  assert.equal(state.inventory.duneglass_blade_3, 1);
  assert.equal(checkpointed[2].inventory.duneglass_blade_3, 1);
  const html = ui.renderBuild();
  assert.match(html, /Community complete/);
  assert.match(html, /YOUR COMMUNITY KEEPSAKE/);
  assert.match(html, /Received · In your inventory · Ready to equip/);
  assert.match(html, /UPGRADE YOUR WEAPON/);
  assert.ok(action(html, 'community-inventory'));
  assert.match(html, /Duneglass Blade/);
  assert.match(html, /Ascendant/);
  assert.match(html, /level 30/);
  assert.equal((html.match(/data-project-state="complete"/g) || []).length, 3);
  assert.match(
    ui.notifications.current.message,
    /restoration complete.*Duneglass Blade.*Exotic.*Ascendant.*Kaida.*level 30/,
  );
  assert.match(ui.notifications.current.message, /Temporary world preview/);
  assert.match(html, /<\/div><aside class="ui-toast"/);
  ui.action('community-confirm');
  assert.equal(checkpointed.length, 3);
});

test('a level-26 reward is immediately accessible through inventory even with an earlier hero filter', (t) => {
  const { ui, state, checkpointed } = fixture(t);
  state.region = 'orbital_reach_town';
  const rune = state.heroes.find((hero) => hero.id === 'rune');
  rune.level = 26;
  assert.equal(action(ui.renderBuild(), 'community-inventory'), undefined);
  ui.action('community-inventory');
  assert.equal(ui.menu, false);
  completeTown(ui);
  assert.equal(state.inventory.rescue_gauntlets_3, 1);
  assert.equal(checkpointed[2].inventory.rescue_gauntlets_3, 1);
  assert.match(action(ui.renderBuild(), 'community-reforge'), /disabled/);

  Object.assign(ui, {
    inventoryHero: 'kaida',
    inventoryFilter: 'accessory',
    inventoryRecipientItem: 'data_chip',
    inventoryNavigation: { row: 2 },
    menuScroll: { 2: { body: 300, pack: 600 } },
  });
  const before = structuredClone(state);
  ui.action('community-inventory');
  assert.equal(ui.panel, null);
  assert.equal(ui.menu, true);
  assert.equal(ui.tab, 2);
  assert.equal(ui.inventoryHero, 'rune');
  assert.equal(ui.inventoryFilter, 'weapon');
  assert.equal(ui.inventoryRecipientItem, null);
  assert.equal(ui.inventoryNavigation, null);
  assert.deepEqual(ui.menuScroll[2], { body: 0, pack: 0 });
  assert.equal(ui.item, 'rescue_gauntlets_3');
  assert.match(inventoryPage(ui), /data-do="equip:rescue_gauntlets_3:rune"/);
  assert.deepEqual(state, before);
  assert.equal(checkpointed.length, 3);

  assert.equal(equip(state, 'rune', 'rescue_gauntlets_3').ok, true);
  Object.assign(ui, { menu: false, panel: { type: 'build' } });
  assert.match(ui.renderBuild(), /Received · Equipped on Rune/);
  let focused = false;
  ui.root.querySelector = (selector) =>
    selector === '[data-do="inventory-slot:weapon:rune"]'
      ? {
          focus() {
            focused = true;
          },
          scrollIntoView() {},
        }
      : null;
  ui.action('community-inventory');
  assert.equal(focused, true);
  assert.equal(rune.equip.weapon, 'rescue_gauntlets_3');
  assert.equal(state.inventory.rescue_gauntlets_3 || 0, 0);
  assert.equal(checkpointed.length, 3);
});

test('reforge confirmation keeps equipped Exotic, saves once, and distinguishes identity from tier throughout menus', (t) => {
  const { ui, state, checkpointed } = fixture(t);
  state.heroes[0].level = 9;
  completeTown(ui);
  assert.equal(equip(state, 'kaida', 'duneglass_blade_1').ok, true);
  state.heroes[0].level = 20;
  ui.action('community-reforge');
  assert.match(ui.renderBuild(), /Reforge to.*Ascendant/);
  assert.match(ui.renderBuild(), /Reforge stat changes/);
  assert.match(ui.renderBuild(), /Strength<\/dt><dd>\+15/);
  ui.action('community-confirm');
  assert.equal(state.heroes[0].equip.weapon, 'duneglass_blade_3');
  assert.equal(checkpointed.length, 4);
  assert.equal(checkpointed[3].heroes[0].equip.weapon, 'duneglass_blade_3');
  assert.match(ui.notifications.current.message, /Reforge complete.*Ascendant/);
  ui.action('community-reforge');
  ui.action('community-confirm');
  assert.equal(checkpointed.length, 4);
  Object.assign(ui, {
    inventoryFilter: 'all',
    inventoryHero: 'kaida',
    inventorySort: 'tier',
    inventoryIndex: 0,
  });
  assert.match(
    inventoryPage(ui),
    /exp-inventory-slot-meta[\s\S]*Ascendant[\s\S]*exotic-badge/,
  );
  ui.inventoryHero = null;
  assert.match(inventoryPage(ui), /exp-inventory-crew-slot[\s\S]*exotic-badge/);
  ui.tab = 1;
  assert.match(
    renderExpedition(ui),
    /exp-equipment-meta[\s\S]*Ascendant[\s\S]*exotic-badge/,
  );
  state.inventory.orchard_staff_2 = 1;
  assert.match(
    inventoryPage(ui),
    /data-pack-item="orchard_staff_2" data-tier="2" data-exotic="true"/,
  );
  assert.equal(ITEMS.orchard_staff_2.tier, 2);
});
