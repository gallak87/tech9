// Explicitly requested integration checks for slow/failed mobile preparation.
import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const executablePath =
  process.env.CHROMIUM_PATH ||
  path.join(
    os.homedir(),
    'Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',
  );
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(executablePath) ? { executablePath } : {}),
});
const context = await browser.newContext({
  ...devices['iPhone 13'],
  deviceScaleFactor: 1,
});
const page = await context.newPage();
await page.routeWebSocket('**/*', (socket) => {
  socket.send(JSON.stringify({ type: 'connected' }));
  socket.onMessage(() => {});
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const base = process.env.ECHO_BASE_URL || 'http://127.0.0.1:4321';
try {
  await page.goto(`${base}/?test=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="boot-loading"][value="mobile"]').check();
  await page.locator('.mobile-boot button').tap();
  await page.waitForFunction(() => window.__ECHO_READY__, null, {
    timeout: 120000,
  });
  assert.equal(
    await page.evaluate(() => window.__ECHO__.snapshot().mobile.loading),
    'mobile',
  );
  console.log(
    'PASS First phone boot offers loading choice before preparing assets',
  );
  await page.evaluate(() => {
    const g = window.__ECHO__.game;
    g.startNew();
    g.ui.panel = null;
    g.ui.render();
  });
  const failedURL = await page.evaluate(() => {
    const loader = window.__ECHO__.game.assetLoading.loader;
    const id = loader
      .specification('emberline')
      .ids.find((id) => !loader.loaded.has(id));
    return loader.entries.get(id).url;
  });
  const pattern = `**/${failedURL}`;
  await page.route(pattern, (route) => route.abort('failed'));
  await page.evaluate(() => window.__ECHO__.game.travel('emberline'));
  await page
    .locator('[data-load-return]')
    .waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(
    await page.evaluate(() => window.__ECHO__.game.state.region),
    'haventide',
  );
  await page.locator('[data-load-return]').tap();
  assert.equal(
    await page.evaluate(() => window.__ECHO__.game.transition),
    null,
  );
  console.log(
    'PASS Failed destination stays hidden; Return keeps source playable',
  );
  await page.evaluate(() => window.__ECHO__.game.travel('emberline'));
  await page
    .locator('[data-load-retry]')
    .waitFor({ state: 'visible', timeout: 30000 });
  await page.unroute(pattern);
  await page.locator('[data-load-retry]').tap();
  await page.waitForFunction(
    () =>
      window.__ECHO__.game.state.region === 'emberline' &&
      !window.__ECHO__.game.transition,
    null,
    { timeout: 30000 },
  );
  console.log('PASS Retry prepares missing art and arrives successfully');
  await page.evaluate(async () => {
    const g = window.__ECHO__.game;
    window.__ECHO__.preset('final');
    g.ui.menu = true;
    await g.assetLoading.loader.prepare({
      ...g.state,
      region: 'last_crown',
      suspendedBattle: g.battle,
    });
    g.assetLoading.loader.activate('last_crown');
    g.state.region = 'last_crown';
    const point = g.safePoint(g.scene, g.scene.spawn.x, g.scene.spawn.y);
    Object.assign(g.state, point);
    g.ui.menu = false;
    g.ui.render();
    g.save(2);
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ECHO_READY__, null, {
    timeout: 120000,
  });
  await page.evaluate(() => window.__ECHO__.game.load(2));
  await page.waitForFunction(
    () =>
      window.__ECHO__.game.mode === 'battle' &&
      window.__ECHO__.game.state.region === 'last_crown' &&
      !window.__ECHO__.game.assetLoading.busy,
    null,
    { timeout: 30000 },
  );
  assert.equal(
    await page.evaluate(() => window.__ECHO__.game.battle.enemies[0].id),
    'void_architect',
  );
  console.log(
    'PASS Cold reload prepares a saved late-region boss battle before resuming',
  );
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.locator('#resume-play button').waitFor({ state: 'visible' });
  const clock = await page.evaluate(() => window.__ECHO__.game.battle.clock);
  await page.waitForTimeout(200);
  assert.equal(
    await page.evaluate(() => window.__ECHO__.game.battle.clock),
    clock,
  );
  await page.evaluate(() => {
    delete document.hidden;
  });
  await page.locator('#resume-play button').tap();
  assert.equal(
    await page.evaluate(() => window.__ECHO__.game.lifecyclePaused),
    false,
  );
  console.log(
    'PASS Simulated background interruption pauses battle and requires explicit Resume',
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
