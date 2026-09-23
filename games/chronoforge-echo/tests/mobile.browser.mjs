// Explicitly requested browser checks only. Fixtures establish progression;
// subsequent movement, battle commands and menu actions use real touch input.
import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { reviewRoot } from '../scripts/review-output.mjs';
const output = path.join(reviewRoot, 'mobile');
await fs.mkdir(output, { recursive: true });
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
const report = { checks: [], errors: [], crossings: [] };
const check = (name) => {
  report.checks.push(name);
  console.log('PASS', name);
};
const base = process.env.ECHO_BASE_URL || 'http://127.0.0.1:4321';
async function createContext(mobile) {
  const context = await browser.newContext(
    mobile
      ? { ...devices['iPhone 13'], deviceScaleFactor: 2 }
      : { viewport: { width: 1280, height: 720 } },
  );
  if (mobile)
    await context.addInitScript(() =>
      localStorage.setItem(
        'chronoforge-echo:device',
        JSON.stringify({ loading: 'mobile', loadingChosen: true }),
      ),
    );
  const page = await context.newPage();
  await page.routeWebSocket('**/*', (socket) => {
    socket.send(JSON.stringify({ type: 'connected' }));
    socket.onMessage(() => {});
  });
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.setDefaultTimeout(10000);
  await page.goto(`${base}/?test=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ECHO_READY__, null, {
    timeout: 120000,
  });
  return { context, page };
}
async function bounds(page, selector) {
  return page.locator(selector).first().boundingBox();
}
async function battleFixture(page, name = 'battle') {
  await page.evaluate(async (name) => {
    const g = window.__ECHO__.game;
    window.__ECHO__.preset(name);
    g.ui.menu = true;
    await g.assetLoading.loader.prepare({
      ...g.state,
      suspendedBattle: g.battle,
    });
    g.assetLoading.loader.activate(g.state.region);
    g.ui.menu = false;
    g.battle.enemies.forEach((enemy) => {
      enemy.atb = 0;
    });
    g.battle.heroes.forEach((hero) => {
      hero.atb = 100;
    });
    g.battle.readyQueue = g.battle.heroes.map((hero) => hero.id);
    g.ui.render();
  }, name);
  await page.waitForTimeout(100);
}
try {
  const { context, page } = await createContext(true);
  const initial = await page.evaluate(() => window.__ECHO__.snapshot());
  assert.equal(initial.mobile.loading, 'mobile');
  assert(initial.assetLoading.loadedCount < initial.assetLoading.totalCount);
  report.mobileAssets = initial.assetLoading;
  check('Mobile startup prepares a bounded regional set');
  await page.evaluate(() => {
    const g = window.__ECHO__.game;
    g.startNew();
    g.ui.panel = null;
    g.ui.render();
  });
  await page.waitForTimeout(150);
  const cdp = await context.newCDPSession(page);
  const pad = await bounds(page, '.touch-stick');
  const point = { x: pad.x + pad.width / 2, y: pad.y + pad.height / 2, id: 1 };
  const start = await page.evaluate(() => ({
    x: window.__ECHO__.game.state.x,
    y: window.__ECHO__.game.state.y,
  }));
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...point, x: point.x + 44 }],
  });
  await page.waitForTimeout(250);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  const moved = await page.evaluate(() => ({
    x: window.__ECHO__.game.state.x,
    y: window.__ECHO__.game.state.y,
    movement: window.__ECHO__.game.touchControls.movement,
  }));
  assert(Math.hypot(moved.x - start.x, moved.y - start.y) > 10);
  assert.equal(moved.movement.active, false);
  await page.waitForTimeout(150);
  assert.equal(
    await page.evaluate(() => window.__ECHO__.game.state.x),
    moved.x,
  );
  check('Real joystick drag moves; release stops');
  await page.locator('[data-touch-action="run"]').tap();
  assert.equal(
    await page.evaluate(() => window.__ECHO__.game.touchControls.input.run),
    true,
  );
  await page.locator('[data-touch-action="run"]').tap();
  await page.touchscreen.tap(point.x, point.y);
  await page.waitForTimeout(70);
  await page.touchscreen.tap(point.x, point.y);
  assert.equal(
    await page.evaluate(() => window.__ECHO__.game.touchControls.input.run),
    true,
  );
  check('Run button and double-tap toggle the same running preference');
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point],
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(150);
  assert.equal(
    await page.evaluate(
      () => window.__ECHO__.game.touchControls.movement.active,
    ),
    false,
  );
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  });
  await page.screenshot({ path: path.join(output, 'world-landscape.png') });
  check('Rotation clears held movement and preserves the expedition');
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 390, height: 664 },
    { width: 820, height: 1180 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(150);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    for (const selector of [
      '.touch-stick',
      '[data-touch-action="interact"]',
      '[data-touch-action="run"]',
    ]) {
      const box = await bounds(page, selector);
      assert(box.width >= 44 && box.height >= 44);
      assert(box.x >= 0 && box.x + box.width <= viewport.width + 1);
    }
  }
  check(
    'Small phone, portrait and tablet controls fit with usable touch targets',
  );
  await page.setViewportSize({ width: 390, height: 664 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(output, 'world-portrait.png') });
  await page.locator('[data-touch-action="map"]').tap();
  for (let tab = 0; tab < 7; tab++) {
    await page.locator(`.tabs [data-do="tab:${tab}"]`).tap();
    assert.equal(await page.evaluate(() => window.__ECHO__.game.ui.tab), tab);
    const box = await bounds(page, '.atlas');
    assert(box.x >= -1 && box.x + box.width <= 391);
    if (tab === 2 || tab === 6)
      await page.screenshot({ path: path.join(output, `menu-${tab}.png`) });
  }
  await page.locator('[data-do="dismiss-panel"]').first().tap();
  assert.equal(await page.evaluate(() => window.__ECHO__.game.ui.menu), false);
  check('All seven menu tabs and Return work by touch');
  await page.evaluate(() => window.__ECHO__.game.worldView.openView());
  await page.locator('[data-world-zoom="in"]').tap();
  await page.locator('.world-view header button').tap();
  assert.equal(
    await page.evaluate(() => window.__ECHO__.game.worldView.open),
    false,
  );
  check('World overview touch zoom and Return');
  for (const cleared of [false, true]) {
    await page.evaluate(async (cleared) => {
      const g = window.__ECHO__.game;
      window.__ECHO__.preset('party');
      g.ui.menu = true;
      Object.assign(g.state, { region: 'emberline', x: 800, y: 1350 });
      g.state.cleared.ember_arrival = cleared;
      g.state.flags.battle_taught = true;
      g.patrols.reset();
      await g.assetLoading.loader.prepare(g.state);
      g.assetLoading.loader.activate(g.state.region);
      g.resetFollowers();
      g.updateCamera(true);
      g.ui.menu = false;
      g.ui.render();
    }, cleared);
    await page.waitForFunction(
      () => !document.querySelector('[data-touch-action="interact"]').disabled,
    );
    assert.equal(await page.evaluate(() => window.__ECHO__.game.mode), 'world');
    assert.equal(
      await page.evaluate(() => window.__ECHO__.game.near?.id),
      'ember_arrival',
    );
    assert.match(
      await page.locator('[data-touch-action="interact"]').textContent(),
      cleared ? /Revisit patrol/ : /Engage Mutant Hound/,
    );
    await page.locator('[data-touch-action="interact"]').tap();
    await page.waitForFunction(() => window.__ECHO__.game.mode === 'battle');
    assert.equal(
      await page.evaluate(() => window.__ECHO__.game.battle.encounter.id),
      'ember_arrival',
    );
    check(
      cleared
        ? 'Cleared patrol replays by touch'
        : 'Arrival-protected enemy can be engaged by touch',
    );
  }
  await battleFixture(page, 'battle-four');
  await page
    .locator('.cb-party-rail [data-battle-intent="hero"]')
    .first()
    .tap();
  await page.locator('[data-battle-intent="command"][data-index="0"]').tap();
  assert.equal(
    await page.evaluate(() => window.__ECHO__.game.battle.mode),
    'target',
  );
  await page.locator('[data-battle-intent="target"]').first().tap();
  await page.screenshot({
    path: path.join(output, 'battle-target-portrait.png'),
  });
  await page.locator('[data-battle-intent="execute"]').tap();
  const afterExecute = await page.evaluate(
    () => window.__ECHO__.game.battle.action,
  );
  assert(afterExecute);
  assert.equal(afterExecute.timingAttempted, false);
  await page.locator('[data-battle-intent="timing"]').tap();
  assert.equal(
    await page.evaluate(
      () => window.__ECHO__.game.battle.action?.timingAttempted,
    ),
    true,
  );
  check('Touch crew/action/target/Execute and a separate Strike press');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(output, 'battle-landscape.png') });
  await page.locator('[data-battle-intent="pause"]').tap();
  assert.equal(await page.evaluate(() => window.__ECHO__.game.ui.menu), true);
  check('Battle rotates and pauses without losing its state');
  await page.evaluate(() => {
    const g = window.__ECHO__.game;
    g.battle = null;
    g.mode = 'world';
    g.ui.menu = false;
    g.ui.panel = null;
    g.ui.render();
  });
  for (const scene of [
    'haventide_town',
    'hav_cave',
    'emberline',
    'emberline_town',
    'forest_veil',
    'mire_bog',
    'crater_ember',
    'orbital_reach',
    'frost_canyon',
    'last_crown',
    'last_crown_town',
    'haventide',
  ]) {
    const started = Date.now();
    await page.evaluate((scene) => {
      const g = window.__ECHO__.game;
      g.ui.panel = null;
      g.ui.menu = false;
      g.ui.render();
      g.travel(scene);
    }, scene);
    await page.waitForFunction(
      (scene) =>
        window.__ECHO__.game.state.region === scene &&
        !window.__ECHO__.game.transition,
      scene,
      { timeout: 90000 },
    );
    const snapshot = await page.evaluate(() => window.__ECHO__.snapshot());
    assert.equal(snapshot.errors.length, 0);
    assert.equal(snapshot.assetLoading.errors.length, 0);
    report.crossings.push({
      scene,
      ms: Date.now() - started,
      loaded: snapshot.assetLoading.loadedCount,
      retainedBytes: snapshot.assetLoading.retainedBytes,
      groups: snapshot.assetLoading.retainedGroups,
    });
    console.log('CROSS', scene, Date.now() - started, 'ms');
  }
  check(
    'All eight regions plus town/cave crossings prepare before arrival and evict inactive art',
  );
  assert(report.crossings.some((crossing) => crossing.loaded < 177));
  await page.setViewportSize({ width: 390, height: 664 });
  await page.screenshot({ path: path.join(output, 'returned-coast.png') });
  await context.close();
  const desktop = await createContext(false);
  const snapshot = await desktop.page.evaluate(() =>
    window.__ECHO__.snapshot(),
  );
  assert.equal(snapshot.mobile.enabled, false);
  assert.equal(snapshot.mobile.loading, 'full');
  assert.equal(
    snapshot.assetLoading.loadedCount,
    snapshot.assetLoading.totalCount,
  );
  assert.equal(snapshot.mobile.viewport.width, 960);
  assert.equal(snapshot.mobile.viewport.height, 540);
  report.desktopAssets = snapshot.assetLoading;
  await desktop.page.screenshot({
    path: path.join(output, 'desktop-title.png'),
  });
  check('Desktop still loads the complete atlas and uses 960×540 presentation');
  await desktop.context.close();
  assert.deepEqual(report.errors, []);
} finally {
  await fs.writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
