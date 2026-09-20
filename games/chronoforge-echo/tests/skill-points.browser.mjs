import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import {
  createState,
  recruit,
  awardXp,
  xpForLevel,
} from '../src/progression.js';

// A staged level-12 crew reproduces the reported 7 / 10 / 8 balances through
// normal menu clicks. Inspect saved data at the end to check actual debits.
const state = createState();
while (state.heroes[0].level < 12)
  awardXp(state, xpForLevel(state.heroes[0].level));
recruit(state, 'vex');
recruit(state, 'rune');
state.settings.music = 0;
state.settings.sfx = 0;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    }),
    errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(process.env.ECHO_MENU_URL || 'http://127.0.0.1:4334/');
  await page.evaluate((state) => {
    localStorage.clear();
    localStorage.setItem(
      'chronforge_echo_v1:checkpoint',
      JSON.stringify({ version: 1, savedAt: new Date().toISOString(), state }),
    );
  }, state);
  await page.reload();
  await page.waitForFunction(() => window.__ECHO_READY__);
  assert.equal(await page.evaluate(() => typeof window.__ECHO__), 'undefined');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.keyboard.press('4');
  const click = (a) => page.locator(`[data-do="${a}"]`).click();
  const balance = async (name, n) => {
    assert.equal(
      await page.locator('.exp-heading>span').textContent(),
      `${name} · ${n} SKILL POINTS AVAILABLE`,
    );
    assert.match(
      await page.locator('.exp-crew-choice[aria-pressed="true"]').textContent(),
      new RegExp(`${name}.*${n} SP`),
    );
  };
  await balance('Kaida', 11);
  await click('learn:chrono_strike');
  await balance('Kaida', 10);
  await click('learn:time_sever');
  await balance('Kaida', 7);
  await click('hero:1');
  await balance('Vex', 11);
  assert.equal(await page.locator('.ui-toast').count(), 0);
  await click('learn:null_field');
  await balance('Vex', 10);
  await click('hero:2');
  await balance('Rune', 11);
  await click('learn:bulwark');
  await balance('Rune', 10);
  await click('learn:harbor_break');
  await balance('Rune', 8);
  assert.match(
    await page.locator('.ui-toast').textContent(),
    /Rune learned Harbor Break\. 2 SP spent · 10 → 8 SP\./,
  );
  // A combo belongs to the crew, but the hero who learns it pays once.
  await click('hero:0');
  await balance('Kaida', 7);
  assert.equal(
    await page.locator('[data-do="learn:harbor_break"]').isDisabled(),
    true,
  );
  await balance('Kaida', 7);
  await page.keyboard.press('6');
  await click('save:1');
  const result = await page.evaluate(
    () => JSON.parse(localStorage.getItem('chronforge_echo_v1:1')).state,
  );
  assert.deepEqual(
    result.heroes.map((h) => h.skillPoints),
    [7, 10, 8],
  );
  assert.equal(
    result.heroes.filter((h) => h.skills.includes('harbor_break')).length,
    1,
  );
  assert.ok(result.heroes[2].skills.includes('harbor_break'));
  assert.equal(errors.length, 0);
  console.log(
    JSON.stringify({
      balances: result.heroes.map((h) => ({ hero: h.name, sp: h.skillPoints })),
      comboChargedOnce: true,
      headerMatchesSelectedHero: true,
      errors,
    }),
  );
} finally {
  await browser.close();
}
