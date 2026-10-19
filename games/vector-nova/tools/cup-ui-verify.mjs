import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { RACE_OPPONENTS } from '../src/race/roster.js';
const base = process.env.VN_URL;
if (!base) throw Error('Set VN_URL to a dev server');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
try {
  await context.addInitScript(() =>
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({ quality: 'low', volume: 0, reducedMotion: true }),
    ),
  );
  await context.route('**/src/core/game.js*', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    assert.ok(source.includes('      getSnapshot() {'));
    await route.fulfill({
      response,
      body: source.replace(
        '      getSnapshot() {',
        '      verifyCupResults(data) { onResults?.(data); },\n      getSnapshot() {',
      ),
    });
  });
  const page = await context.newPage();
  const faults = [];
  page.on('pageerror', (e) => faults.push(e.message));
  await page.goto(base + '?music=0');
  await page.locator('[data-action="cup-hub"]').click();
  await page.locator('[data-action="cup-start"]').click();
  await page.waitForFunction(
    () => window.__VN?.ready && window.__VN.getSnapshot().cup,
    null,
    { timeout: 120000 },
  );
  await page.evaluate(() => window.__VN.pause());
  const rows = ['player', ...RACE_OPPONENTS.map((r) => r.id)].map((id, i) => ({
    id,
    name: id,
    position: i + 1,
    finished: i === 0,
    valid: true,
    totalTime: i === 0 ? 100 : null,
  }));
  const waiting = {
    mode: 'cup',
    final: false,
    remaining: 25,
    standings: rows,
    playerValid: true,
    playerTotalTime: 100,
    playerLapTimes: [50, 50],
    laps: 2,
    difficulty: 'easy',
  };
  await page.evaluate((data) => window.__VN.verifyCupResults(data), waiting);
  await page.locator('[data-action="cup-hub"]').focus();
  await page.evaluate((data) => window.__VN.verifyCupResults(data), {
    ...waiting,
    remaining: 24,
  });
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.action),
    'cup-hub',
  );
  const final = {
    ...waiting,
    final: true,
    remaining: 0,
    standings: rows.map((r, i) => ({
      ...r,
      finished: true,
      totalTime: 100 + i,
    })),
  };
  await page.evaluate((data) => window.__VN.verifyCupResults(data), final);
  assert.equal(await page.evaluate(() => document.activeElement.tagName), 'H1');
  assert.equal(await page.locator('.cup-standings tbody tr').count(), 10);
  assert.deepEqual(faults, []);
  console.log(
    'PASS cup live result keyboard focus and final classification focus',
  );
} finally {
  await context.close();
  await browser.close();
}
