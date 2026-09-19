import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createState, recruit } from '../src/progression.js';
import { ITEMS } from '../src/content.js';

// Explicit browser check, run only when playtesting is requested.
const state = createState();
recruit(state, 'vex');
recruit(state, 'rune');
state.inventory = Object.fromEntries(Object.keys(ITEMS).map((id) => [id, 2]));
state.inventory.magma_blade = 1;
state.heroes[0].hp = 1;
state.heroes[0].equip.accessory = 'data_chip';
state.settings.music = 0;
state.settings.sfx = 0;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(process.env.ECHO_MENU_URL || 'http://127.0.0.1:4334/');
  await page.evaluate((saved) => {
    localStorage.clear();
    localStorage.setItem(
      'chronforge_echo_v1:checkpoint',
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        state: saved,
      }),
    );
  }, state);
  await page.reload();
  await page.waitForFunction(() => window.__ECHO_READY__);
  assert.equal(await page.evaluate(() => typeof window.__ECHO__), 'undefined');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.keyboard.press('3');
  const key = (value) => page.keyboard.press(value);
  const focus = () => page.evaluate(() => document.activeElement?.dataset.do);
  const tile = (id) => page.locator(`[data-pack-item="${id}"]`);
  const action = (id) => page.locator(`[data-do="${id}"]`);
  const detail = () =>
    page.locator('.exp-inventory-card.selected').textContent();
  const scroll = () =>
    page.evaluate(() => ({
      body: document.querySelector('.atlas-body').scrollTop,
      pack: document.querySelector('.exp-pack-items').scrollTop,
    }));
  const filter = () =>
    page
      .locator('.exp-inventory-filter[aria-pressed="true"]')
      .getAttribute('data-do');
  assert.match(await focus(), /^item:/);
  assert.equal(await page.locator('.exp-inventory-detail').count(), 0);
  assert.equal(
    await page.locator('.exp-inventory-card .exp-inventory-action').count(),
    Object.keys(state.inventory).length,
  );
  assert.equal(
    await page.locator('.exp-inventory-hero [data-portrait]').count(),
    3,
  );
  assert.deepEqual(
    await page
      .locator('.exp-inventory-group')
      .evaluateAll((els) => els.map((el) => el.dataset.slot)),
    ['weapon', 'armor', 'accessory', 'consumable'],
  );
  for (const slot of ['weapon', 'armor', 'accessory', 'consumable']) {
    const ids = await page
      .locator(`[data-slot="${slot}"] [data-pack-item]`)
      .evaluateAll((els) => els.map((el) => el.dataset.packItem));
    assert.deepEqual(
      ids,
      [...ids].sort(
        (a, b) =>
          ITEMS[b].tier - ITEMS[a].tier ||
          ITEMS[a].name.localeCompare(ITEMS[b].name),
      ),
    );
  }
  const initial = await focus();
  await key('ArrowRight');
  assert.notEqual(await focus(), initial);
  await key('ArrowLeft');
  assert.equal(await focus(), initial);
  await key('End');
  assert.equal(await focus(), 'item:field_tonic');
  await key('Home');
  assert.equal(await focus(), initial);

  await tile('rune_gauntlet').click();
  for (const text of ['Technique', '+7', 'Defense', '+3', 'Strength', '-5']) {
    assert.ok((await detail()).includes(text), text);
  }
  assert.match(
    await action('inventory-slot:weapon').textContent(),
    /Iron Blade/,
  );
  const before = await scroll();
  await key(']');
  assert.match(await detail(), /on Vex/);
  assert.equal(await focus(), 'item:rune_gauntlet');
  assert.deepEqual(await scroll(), before);
  await key('[');
  await key('Space');
  assert.match(
    await action('inventory-slot:weapon').textContent(),
    /Rune Gauntlet/,
  );
  assert.match(await detail(), /No stat changes/);
  assert.equal(await focus(), 'item:rune_gauntlet');
  assert.deepEqual(await scroll(), before);

  await action('inventory-slot:armor').click();
  assert.equal(await filter(), 'inventory-filter:armor');
  assert.equal(await page.locator('.exp-inventory-group').count(), 1);
  await key('Space');
  assert.equal(await filter(), 'inventory-filter:all');
  assert.equal(
    await focus(),
    undefined,
    'Deactivating a filter releases focus',
  );
  await action('inventory-filter:weapon').focus();
  await key('Enter');
  await key('ArrowDown');
  assert.match(await focus(), /^item:/);
  assert.equal(await filter(), 'inventory-filter:weapon');
  await key(']');
  assert.equal(await filter(), 'inventory-filter:weapon');
  await key('[');
  await page.locator('.exp-inventory-heading h2').click();
  assert.equal(await filter(), 'inventory-filter:all');
  await action('inventory-filter:accessory').click();
  await tile('data_chip').click();
  assert.equal(
    await filter(),
    'inventory-filter:accessory',
    'Browsing retains the filter',
  );
  await action('inventory-filter:accessory').focus();
  await key('Enter');
  assert.equal(await filter(), 'inventory-filter:all');
  assert.equal(await focus(), undefined);

  await tile('field_tonic').click();
  await key('Enter');
  await page.locator('.purchase-confirm').waitFor();
  await key('Escape');
  assert.match(await tile('field_tonic').textContent(), /×2/);
  assert.equal(await focus(), 'item:field_tonic');
  await key('Space');
  await page.locator('.purchase-confirm').waitFor();
  await key('Enter');
  assert.equal(await focus(), 'item:field_tonic');
  assert.match(await tile('field_tonic').textContent(), /×1/);
  await tile('magma_blade').click();
  const index = await tile('magma_blade').evaluate((el) =>
    [...document.querySelectorAll('[data-pack-item]')].indexOf(el),
  );
  await key('Enter');
  assert.equal(await tile('magma_blade').count(), 0);
  assert.match(
    await action('inventory-slot:weapon').textContent(),
    /Magma Blade/,
  );
  const nextIndex = await page
    .locator('.exp-inventory-item[aria-pressed="true"]')
    .evaluate((el) =>
      [...document.querySelectorAll('[data-pack-item]')].indexOf(
        el.closest('[data-pack-item]'),
      ),
    );
  assert.equal(
    nextIndex,
    index,
    'Last-copy equipment keeps the cursor near its old position',
  );
  assert.match(await focus(), /^item:/);
  assert.equal(await page.locator('button button').count(), 0);

  await key('6');
  await action('save:1').click();
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('chronforge_echo_v1:1')).state,
  );
  assert.equal(saved.heroes[0].equip.weapon, 'magma_blade');
  assert.equal(saved.heroes[1].equip.weapon, 'void_shard');
  assert.equal(saved.heroes[0].hp, 81);
  assert.equal(saved.inventory.field_tonic, 1);
  assert.deepEqual(errors, []);
  console.log(
    'Inventory grouping, deltas, keyboard actions, filter lifecycle, focus and persistence passed.',
  );
} finally {
  await browser.close();
}
