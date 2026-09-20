import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import {
  DialogNotifications,
  notificationMarkup,
} from '../src/ui-notifications.js';
import {
  createState,
  recruit,
  restCost,
  rest,
  buildingEligibility,
  build,
  tierEligibility,
} from '../src/progression.js';
import { vendorAction } from '../src/vendor-actions.js';
import { BUILDINGS } from '../src/content.js';
register('./helpers/css-loader.mjs', import.meta.url);
const { UI } = await import('../src/ui.js');
const { renderExpedition } = await import('../src/expedition-menu.js');

test('success replaces the previous toast; stale timers cannot clear a newer result', () => {
  const callbacks = [],
    removed = [];
  const notices = new DialogNotifications(() => removed.push(true), {
    setTimeout(callback) {
      callbacks.push(callback);
      return callbacks.length;
    },
    clearTimeout() {},
  });
  notices.show({ ok: true, message: 'First purchase' }, 'shop');
  notices.show({ ok: true, message: 'Second purchase' }, 'shop');
  callbacks[0]();
  assert.equal(notices.current.message, 'Second purchase');
  callbacks[1]();
  assert.equal(notices.current, null);
  assert.ok(removed.length);
});

test('errors persist without timers, can be dismissed, and do not follow a different panel', () => {
  let scheduled = 0;
  const notices = new DialogNotifications(() => {}, {
    setTimeout() {
      scheduled++;
    },
    clearTimeout() {},
  });
  notices.show({ ok: false, message: 'Could not save <record>' }, 'menu:5');
  assert.equal(scheduled, 0);
  notices.retain('menu:5');
  assert.match(notificationMarkup(notices), /role="alert"/);
  assert.match(notificationMarkup(notices), /Dismiss notification/);
  assert.match(notificationMarkup(notices), /&lt;record&gt;/);
  notices.clear();
  assert.equal(notificationMarkup(notices), '');
  notices.show({ ok: false, message: 'Could not save' }, 'menu:5');
  notices.retain('menu:3');
  assert.equal(notices.current, null);
});

function fixture(t) {
  const previous = globalThis.document;
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null },
  });
  globalThis.document = { activeElement: null };
  t.after(() => {
    globalThis.document = previous;
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage);
    else delete globalThis.localStorage;
  });
  const state = createState();
  const rewards = [];
  const ui = Object.assign(Object.create(UI.prototype), {
    game: {
      state,
      mode: 'world',
      rewards: (items) => rewards.push(...items),
      audio: { sound() {} },
      checkpoint() {},
      keys: new Set(),
    },
    panel: null,
    menu: false,
    hero: 0,
    tab: 0,
    notice: '',
    root: { querySelector: () => null, querySelectorAll: () => [] },
    render() {
      this.notifications?.retain(this.feedbackContext());
    },
  });
  t.after(() => ui.notifications?.clear());
  return { ui, state, rewards };
}

test('rest shows the exact debit or free hospitality and keeps the service open', (t) => {
  const { ui, state } = fixture(t);
  ui.panel = { type: 'vendor', object: { service: 'rest' } };
  for (const food of [50, 1]) {
    state.resources.food = food;
    state.heroes[0].hp = 1;
    const expected = restCost(state);
    assert.match(
      vendorAction(state, ui.panel.object).label,
      new RegExp(expected ? `${expected} food` : 'Free'),
    );
    ui.action('rest');
    assert.equal(state.resources.food, food - expected);
    assert.ok(state.heroes[0].hp > 1);
    assert.match(
      ui.notifications.current.message,
      new RegExp(expected ? `−${expected} food` : 'Free rest'),
    );
    assert.equal(ui.panel.type, 'vendor');
    assert.equal(ui.notice, '');
  }
  state.flags.mara_shelter = true;
  state.resources.food = 50;
  assert.equal(restCost(state), 0);
  rest(state);
  assert.equal(state.resources.food, 50);
});

test('training combines XP and level-ups into one result without duplicate reward toasts', (t) => {
  const { ui, state, rewards } = fixture(t);
  state.heroes[0].level = 10;
  recruit(state, 'vex');
  state.tier = 2;
  state.buildings.barracks = 1;
  state.resources.food = state.resources.energy = 100;
  ui.panel = { type: 'vendor', object: { service: 'trainer' } };
  ui.action('train');
  assert.equal(state.resources.food, 70);
  assert.equal(state.resources.energy, 80);
  assert.match(ui.notifications.current.message, /Training complete.*500 XP/);
  assert.match(ui.notifications.current.message, /Kaida · Level 11/);
  assert.match(ui.notifications.current.message, /Vex · Level 11/);
  assert.deepEqual(rewards, []);
});

test('research retains its completed state and insufficient resources disable services', (t) => {
  const { ui, state } = fixture(t);
  state.tier = 2;
  state.heroes[0].level = 10;
  state.buildings.research_lab = state.buildings.barracks = 1;
  state.resources.ore = state.resources.energy = 100;
  ui.panel = { type: 'vendor', object: { service: 'archivist' } };
  ui.action('research');
  assert.equal(state.flags.research_concord, true);
  assert.match(ui.notifications.current.message, /\+6/);
  const complete = vendorAction(state, ui.panel.object);
  assert.equal(complete.disabled, true);
  assert.match(complete.label, /researched/);
  state.resources.food = state.resources.energy = 0;
  const training = vendorAction(state, { service: 'trainer' });
  assert.equal(training.disabled, true);
  assert.match(training.status, /Need 30 more food.*20 more energy/);
});

test('building buttons use the same eligibility as payment for costs, tiers and completion', (t) => {
  const { ui, state } = fixture(t);
  ui.panel = { type: 'build' };
  for (const scenario of [
    () => {},
    () => {
      state.flags.haventide_liberated = true;
      state.resources.food = state.resources.ore = state.resources.energy = 0;
    },
    () => {
      state.resources.food =
        state.resources.ore =
        state.resources.energy =
          10000;
    },
    () => {
      state.tier = 4;
      for (const id of Object.keys(BUILDINGS)) state.buildings[id] = 4;
    },
  ]) {
    scenario();
    for (const id of Object.keys(BUILDINGS)) {
      const status = buildingEligibility(state, id);
      assert.equal(build(structuredClone(state), id).ok, status.eligible);
      const html = ui.renderBuild();
      const attrs = html.match(new RegExp(`data-do="build:${id}"([^>]*)>`))[1];
      assert.equal(attrs.includes('disabled'), !status.eligible);
    }
  }
  state.tier = 1;
  state.buildings.town_center = 2;
  state.flags.beacon_restored = true;
  state.resources.renown = 1000;
  assert.equal(tierEligibility(state).eligible, true);
  for (const region of [
    'emberline_town',
    'orbital_reach_town',
    'last_crown_town',
  ]) {
    state.region = region;
    const html = ui.renderBuild();
    assert.match(html, /Community Restoration/);
    assert.doesNotMatch(
      html,
      /data-do="(?:build:|tier")|class="tier-heading"|Town Center/,
    );
    const before = structuredClone(state);
    ui.action('tier');
    assert.deepEqual(
      state,
      before,
      'hidden regional advancement cannot spend resources',
    );
  }
});

test('Skills and Save feedback above a vendor uses the shared toast outside the scroll content', (t) => {
  const { ui, rewards } = fixture(t);
  ui.panel = { type: 'vendor', object: { service: 'smith' } };
  ui.menu = true;
  for (const tab of [3, 5, 6, 0]) {
    ui.tab = tab;
    ui.feedback({ ok: true, message: 'Action completed.' });
    const html = renderExpedition(ui);
    assert.equal(ui.notice, '');
    assert.match(html, /<\/div><aside class="ui-toast"/);
    assert.ok(!html.includes('class="notice"'));
    assert.equal(ui.notifications.current.context, `menu:${tab}`);
  }
  assert.deepEqual(rewards, []);
});

test('locked and learned skills are disabled; rebinding replaces the key label in place', (t) => {
  const { ui } = fixture(t);
  ui.menu = true;
  ui.tab = 3;
  const html = renderExpedition(ui);
  const rows = [
    ...html.matchAll(/<button class="exp-skill-row (learned|locked)"([^>]*)>/g),
  ];
  assert.ok(rows.length > 0);
  for (const row of rows) assert.match(row[2], /disabled/);
  ui.tab = 6;
  ui.action('rebind:up');
  assert.equal(ui.notice, '');
  assert.match(ui.settingsBody(), /up<small>Press a key…<\/small>/);
  ui.handleKey('i');
  assert.equal(ui.game.state.settings.keys.up, 'i');
  assert.equal(ui.bindCapture, null);
  assert.match(ui.settingsBody(), /up<small>I<\/small>/);
  assert.match(ui.notifications.current.message, /bound to I/);
});
