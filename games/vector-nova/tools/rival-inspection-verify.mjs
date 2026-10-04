import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.VN_URL ?? 'http://127.0.0.1:5237';
const quality = process.env.VN_QUALITY ?? 'low';
const out = '.experiments/rival-inspection';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const checks = [],
  errors = [];
const snapshot = (page) => page.evaluate(() => window.__VN.getSnapshot());
const ready = (page) =>
  page.waitForFunction(() => window.__VN?.ready, null, { timeout: 60000 });
async function selectRival(page, id) {
  await page.locator(`[data-rival="${id}"]`).click();
  await page.waitForFunction((id) => {
    const state = window.__VN.getSnapshot();
    return !state.inspection.loading && state.inspection.rivalId === id;
  }, id);
  assert.equal(
    await page.locator(`[data-rival="${id}"]`).getAttribute('aria-checked'),
    'true',
  );
}
async function checkColumns(page, panel) {
  const dimensions = await page
    .locator(`${panel} .ship-selection:not(.hidden)`)
    .evaluate((section) => {
      const rect = (element) => {
        const r = element.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      };
      return {
        choices: [...section.querySelectorAll('.ship-picker button')].map(rect),
        stats: [...section.querySelectorAll('.ship-stat')].map(rect),
      };
    });
  for (const list of [dimensions.choices, dimensions.stats])
    for (let i = 1; i < list.length; i++) {
      assert.ok(Math.abs(list[i].x - list[0].x) < 1);
      assert.ok(list[i].y >= list[i - 1].bottom);
    }
  if (dimensions.stats.length)
    assert.ok(dimensions.stats[0].x >= dimensions.choices[0].right);
}
async function checkControls(page, panel) {
  const controls = await page
    .locator(`${panel} button:visible`)
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        );
        return {
          text: button.textContent,
          inView:
            rect.x >= 0 &&
            rect.y >= 0 &&
            rect.right <= innerWidth &&
            rect.bottom <= innerHeight,
          clickable: button.contains(hit),
        };
      }),
    );
  assert.ok(
    controls.every((control) => control.inView && control.clickable),
    JSON.stringify(controls),
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
    true,
  );
}
try {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 900 },
  });
  await context.addInitScript(
    (quality) =>
      localStorage.setItem(
        'vector-nova.settings',
        JSON.stringify({ quality, volume: 0, reducedMotion: true }),
      ),
    quality,
  );
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const requests = [];
  page.on('request', (request) => {
    if (request.url().includes('/ships/rivals/')) requests.push(request.url());
  });
  await page.goto(base);
  await ready(page);
  assert.equal(requests.length, 0, 'Rivals are not loaded on launch');
  await page.locator('#title-panel [data-ship="needle"]').click();
  await page.waitForFunction(
    () =>
      !window.__VN.getSnapshot().ship.loading &&
      window.__VN.getSnapshot().ship.id === 'needle',
  );
  await checkColumns(page, '#title-panel');
  await checkControls(page, '#title-panel');
  await page.screenshot({ path: `${out}/paddock.png` });
  await page.locator('#inspect').click();
  await checkColumns(page, '#inspection-panel');
  await checkControls(page, '#inspection-panel');
  await page.screenshot({ path: `${out}/fleet.png` });
  await page.getByRole('tab', { name: 'AI racers' }).click();
  for (const id of ['rook', 'latch', 'mule']) {
    await selectRival(page, id);
    const s = await snapshot(page);
    assert.equal(s.ship.id, 'needle');
    assert.equal(s.vehicle.shipId, 'needle');
    assert.equal(s.mode, 'inspection');
    assert.equal(await page.locator('#inspect-start').isVisible(), false);
    assert.equal(
      await page.locator('#inspection-panel .ship-stats').isVisible(),
      false,
    );
    await checkColumns(page, '#inspection-panel');
    await checkControls(page, '#inspection-panel');
    await page.screenshot({ path: `${out}/${id}.png` });
  }
  // Native shortcuts and direct start cannot drive an AI preview.
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.__VN.start());
  assert.equal((await snapshot(page)).mode, 'inspection');
  assert.equal(
    await page.evaluate(() => localStorage.getItem('vector-nova.ship')),
    'needle',
  );
  checks.push(
    'All three rivals render without changing player selection, stats, physics or launch',
  );
  await page.getByRole('tab', { name: 'Your ships' }).click();
  assert.equal((await snapshot(page)).inspection.rivalId, null);
  await page.locator('#inspect-start').click();
  await page.keyboard.down('KeyW');
  await page.waitForFunction(
    () => window.__VN.getSnapshot().vehicle.speed > 10,
  );
  await page.keyboard.up('KeyW');
  assert.equal((await snapshot(page)).ship.id, 'needle');
  await page.evaluate(() => window.__VN.home());
  checks.push(
    'Returning to player fleet restores the selected ship and real driving',
  );

  // Cancel a slow load by leaving the inspector; the late response cannot replace the player.
  let release;
  await page.route('**/ships/rivals/rook/rook.glb', async (route) => {
    await new Promise((resolve) => {
      release = resolve;
    });
    await route.continue();
  });
  await page.locator('#inspect').click();
  await page.getByRole('tab', { name: 'AI racers' }).click();
  const pending = page.evaluate(() => window.__VN.inspectRival('rook'));
  await page.waitForFunction(
    () => window.__VN.getSnapshot().inspection.loading,
  );
  while (!release) await new Promise((resolve) => setTimeout(resolve, 20));
  await page.locator('#inspect-back').click();
  release();
  await pending;
  await page.unroute('**/ships/rivals/rook/rook.glb');
  assert.equal((await snapshot(page)).mode, 'title');
  assert.equal((await snapshot(page)).inspection.rivalId, null);
  checks.push('Leaving during a pending rival load discards the late asset');

  // Failed replacement retains the visible model and can be retried.
  await page.locator('#inspect').click();
  await page.getByRole('tab', { name: 'AI racers' }).click();
  await selectRival(page, 'mule');
  await page.route('**/ships/rivals/latch/latch.glb', (route) => route.abort());
  await page.locator('[data-rival="latch"]').click();
  await page.waitForFunction(
    () => !window.__VN.getSnapshot().inspection.loading,
  );
  assert.equal((await snapshot(page)).inspection.rivalId, 'mule');
  assert.match(
    await page.locator('.ship-load-status').textContent(),
    /Could not load Latch/,
  );
  await page.unroute('**/ships/rivals/latch/latch.glb');
  await selectRival(page, 'latch');
  checks.push('Failed rival load retains the previous model; retry succeeds');

  // Desktop checks precede responsive checks; both player screens use the same layout.
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
    { width: 390, height: 667 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.__VN.home());
    await checkColumns(page, '#title-panel');
    await checkControls(page, '#title-panel');
    await page.screenshot({
      path: `${out}/paddock-${viewport.width}-${viewport.height}.png`,
    });
    await page.locator('#inspect').click();
    await checkColumns(page, '#inspection-panel');
    await checkControls(page, '#inspection-panel');
    await page.screenshot({
      path: `${out}/fleet-${viewport.width}-${viewport.height}.png`,
    });
    await page.getByRole('tab', { name: 'AI racers' }).click();
    await selectRival(page, 'rook');
    await checkColumns(page, '#inspection-panel');
    await checkControls(page, '#inspection-panel');
    await page.screenshot({
      path: `${out}/ai-${viewport.width}-${viewport.height}.png`,
    });
    checks.push(
      `${viewport.width}×${viewport.height}: vertical selectors, right-hand stats, AI preview and controls fit`,
    );
  }
  assert.deepEqual(errors, []);
  await page.evaluate(() => window.__VN.dispose());
  await writeFile(
    `${out}/verification.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} finally {
  await browser.close();
}
