import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { RACE_OPPONENTS } from '../src/race/roster.js';
import { cupDefinition } from '../src/race/cup.js';
const cup = cupDefinition(process.env.VN_CUP_ID ?? 'founders');
assert.ok(cup, 'VN_CUP_ID must name an available cup');
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
  await page.locator('[data-cup="founders"]').focus();
  await page.keyboard.press('End');
  assert.equal(
    await page.locator('[data-cup="frontier"]').getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.cup),
    'frontier',
  );
  assert.equal(
    await page.locator('.cup-panel h1').textContent(),
    'Frontier Cup',
  );
  assert.equal(
    await page
      .locator('.cup-route strong')
      .allTextContents()
      .then((names) => names.join(' → ')),
    'Vesper Canopy → Glasswake Comet → Cindercoil',
  );
  assert.equal(
    (await page.evaluate(() => window.__VN_FRONTEND.getState())).loadedId,
    null,
  );
  await page.keyboard.press('KeyS');
  await page.locator('[data-action="settings-back"]').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.cup),
    'frontier',
  );
  await page.keyboard.press('Home');
  assert.equal(
    await page.locator('[data-cup="founders"]').getAttribute('aria-pressed'),
    'true',
  );
  await page.locator(`[data-cup="${cup.id}"]`).click();
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
  const saved = await page.evaluate(
    () => window.__VN_FRONTEND.getState().cup.state,
  );
  assert.equal(saved.cupId, cup.id);
  await page.reload();
  await page.locator('[data-action="cup-hub"]').click();
  assert.equal(await page.locator('.cup-panel h1').textContent(), cup.name);
  assert.equal(await page.locator('[data-cup]').count(), 0);
  assert.deepEqual(
    await page.evaluate(() => window.__VN_FRONTEND.getState().cup.state),
    saved,
  );
  await page.locator('[data-action="cup-abandon"]').click();
  await page.locator('[data-action="cup-cancel"]').click();
  assert.deepEqual(
    await page.evaluate(() => window.__VN_FRONTEND.getState().cup.state),
    saved,
  );
  await page.locator('[data-action="cup-abandon"]').click();
  await page.locator('[data-action="cup-confirm"]').click();
  const otherCup = cup.id === 'founders' ? 'frontier' : 'founders';
  await page.locator(`[data-cup="${otherCup}"]`).click();
  await page.locator('[data-action="cup-start"]').click();
  await page.waitForFunction(
    (id) =>
      window.__VN?.ready &&
      window.__VN_FRONTEND.getState().screen === 'race' &&
      window.__VN_FRONTEND.getState().loadedId === id,
    cupDefinition(otherCup).tracks[0],
    { timeout: 120000 },
  );
  assert.equal(
    await page.evaluate(() => window.__VN_FRONTEND.getState().cup.state.cupId),
    otherCup,
  );
  assert.deepEqual(
    await page.evaluate(
      () => window.__VN_FRONTEND.getState().cup.state.results,
    ),
    [],
  );
  assert.deepEqual(faults, []);
  console.log(
    `PASS ${cup.name}: cup selection, keyboard focus, saved identity and switching cups after confirmed abandon`,
  );
} finally {
  await context.close();
  await browser.close();
}
