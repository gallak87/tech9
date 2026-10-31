import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createCupStore, CUP_STORAGE_KEY } from '../src/race/cup.js';
import { RACE_OPPONENTS } from '../src/race/roster.js';
import { CUP_COLLECTION_KEY } from '../src/progression/cup-collection.js';
import { careerKey, seedVerificationCareer } from './verification-career.mjs';

const base = process.env.VN_URL;
if (!base) throw Error('Set VN_URL to this checkout’s dev server');
const [width, height] = (process.env.VN_CUP_VIEWPORT ?? '1440x900')
  .split('x')
  .map(Number);
const result = (position = 1) => {
  const ids = RACE_OPPONENTS.map((row) => row.id);
  ids.splice(position - 1, 0, 'player');
  return {
    mode: 'cup',
    final: true,
    remaining: 0,
    playerValid: true,
    playerTotalTime: 100 + position,
    courseFormat: 'circuit',
    laps: 2,
    playerLapTimes: [50, 50 + position],
    difficulty: 'easy',
    standings: ids.map((id, i) => ({
      id,
      name: id,
      position: i + 1,
      finished: true,
      valid: true,
      totalTime: 100 + i,
    })),
  };
};
function savedFinal(position = 1, complete = false) {
  const values = new Map();
  const store = createCupStore(() => ({
    getItem: (k) => values.get(k),
    setItem: (k, v) => values.set(k, v),
  }));
  store.start('founders', 'shrike', 'easy');
  store.finish(result(position));
  store.next();
  store.finish(result(position));
  store.next();
  if (complete) store.finish(result(position));
  return store.snapshot().state;
}
const browser = await chromium.launch({
  args: ['--mute-audio'],
  channel: 'chrome',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width, height },
  hasTouch: width < 900,
});
try {
  await seedVerificationCareer(context);
  await context.addInitScript(() => {
    if (!localStorage.getItem('vector-nova.settings'))
      localStorage.setItem(
        'vector-nova.settings',
        JSON.stringify({ quality: 'low', volume: 0, reducedMotion: false }),
      );
    window.__cupPad = {
      id: 'Cup verification standard controller',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [window.__cupPad],
    });
  });
  // Inject at the browser boundary; production code has no result-writing hook.
  await context.route('**/src/core/game.js*', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    assert.ok(source.includes('      getSnapshot() {'));
    await route.fulfill({
      response,
      body: source.replace(
        '      getSnapshot() {',
        '      verifyCupResults(data) { mode = "results"; onResults?.(data); },\n      getSnapshot() {',
      ),
    });
  });
  const page = await context.newPage();
  const faults = [];
  page.on('pageerror', (error) => faults.push(error.message));
  const settle = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  const pad = async (index) => {
    for (const pressed of [true, false]) {
      await page.evaluate(
        ({ index, pressed }) => {
          window.__cupPad.buttons[index] = { pressed, value: Number(pressed) };
        },
        { index, pressed },
      );
      await settle();
    }
  };
  const state = () => page.evaluate(() => window.__VN_FRONTEND.getState());
  const openCup = async () => {
    await page.locator('[data-action="cup-hub"]').click();
    if (width < 900) await page.locator('[data-action="circuits"]').click();
  };
  const fits = async () => {
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.equal(
      await page
        .locator('#front-shell, .cup-victory, .cup-menu-panel')
        .evaluateAll((nodes) =>
          nodes.some((node) => node.scrollWidth > node.clientWidth + 1),
        ),
      false,
      'no clipped horizontal content',
    );
    if (width >= 900 && height >= 700)
      assert.equal(
        await page
          .locator('#front-shell')
          .evaluate((node) => node.scrollHeight <= node.clientHeight + 1),
        true,
        'desktop cup menu and reveal fit without scrolling',
      );
  };
  const capture = async (name) => {
    if (process.env.VN_CUP_CAPTURE)
      await page.screenshot({
        path: `${process.env.VN_CUP_CAPTURE}/${name}.png`,
      });
  };
  await page.goto(base + '?intro=0&music=0');
  await openCup();
  await page.locator('[data-cup="founders"]').focus();
  await settle();
  await pad(15);
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.cup),
    'frontier',
  );
  await pad(13);
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.cup),
    'apex',
  );
  await fits();
  await page.keyboard.press('Home');
  assert.equal(
    await page.locator('[data-cup="founders"]').getAttribute('aria-pressed'),
    'true',
  );
  await page
    .locator('.cup-card img')
    .evaluateAll((nodes) => Promise.all(nodes.map((node) => node.decode())));
  assert.equal(await page.locator('.cup-cabinet .is-earned').count(), 0);
  await fits();
  await capture('unearned-menu');

  await page.evaluate(
    ({ key, saved }) => localStorage.setItem(key, JSON.stringify(saved)),
    { key: careerKey(CUP_STORAGE_KEY), saved: savedFinal() },
  );
  await page.reload();
  await openCup();
  await page.locator('[data-action="cup-resume"]').focus();
  await settle();
  await pad(0);
  await page.waitForFunction(
    () =>
      window.__VN?.ready && window.__VN_FRONTEND.getState().screen === 'race',
    null,
    { timeout: 120000 },
  );
  await page.evaluate(
    (data) =>
      window.__VN.verifyCupResults({ ...data, final: false, remaining: 20 }),
    result(),
  );
  await page.locator('.cup-waiting').waitFor();
  await page.evaluate((data) => window.__VN.verifyCupResults(data), result());
  await page.locator('.cup-victory').waitFor();
  assert.equal((await state()).cupCollection.cups.founders.points, 75);
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.action),
    'cup-standings',
  );
  const reveal = await page.locator('.cup-victory').elementHandle();
  await page.evaluate((data) => window.__VN.verifyCupResults(data), result());
  assert.equal(
    await reveal.evaluate((node) => node.isConnected),
    true,
    'duplicate classification never replays the reveal',
  );
  await page
    .locator('.cup-victory-trophy')
    .evaluate((node) =>
      Promise.all([
        node.decode(),
        ...node.getAnimations().map((animation) => animation.finished),
      ]),
    );
  await fits();
  await capture('champion');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await page
      .locator('.cup-victory-trophy')
      .evaluate((node) => getComputedStyle(node).animationName),
    'none',
  );
  assert.equal(await page.locator('.cup-victory-sparks').isVisible(), false);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => document.body.classList.add('reduced-motion'));
  assert.equal(
    await page
      .locator('.cup-victory-trophy')
      .evaluate((node) => getComputedStyle(node).animationName),
    'none',
  );
  await settle();
  await pad(1);
  assert.equal(
    await page.locator('.cup-victory').count(),
    0,
    'controller B skips to standings',
  );
  assert.equal(await page.locator('.cup-standings tbody tr').count(), 10);
  await page.locator('[data-action="cup-retry"]').click();
  await page.waitForFunction(
    () => window.__VN_FRONTEND.getState().screen === 'race',
  );
  await page.evaluate((data) => window.__VN.verifyCupResults(data), result());
  assert.match(
    await page.locator('.cup-victory .kicker').textContent(),
    /CUP DEFENDED/,
  );
  assert.equal(Object.keys((await state()).cupCollection.cups).length, 1);
  await settle();
  await pad(0);
  assert.equal(
    await page.locator('.cup-victory').count(),
    0,
    'controller A opens standings immediately',
  );
  await page.locator('[data-action="cup-abandon"]').focus();
  await settle();
  await pad(0);
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.action),
    'cup-cancel',
  );
  await pad(1);
  assert.equal(await page.locator('.cup-confirm').count(), 0);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  assert.equal((await state()).cup.state, null);
  assert.equal(
    await page.locator('[data-cup="founders"].is-earned').count(),
    1,
  );
  assert.equal(await page.locator('[data-cup="apex"].is-earned').count(), 0);
  const opacity = (id) =>
    page
      .locator(`[data-cup="${id}"] .cup-card-trophy`)
      .evaluate((node) => getComputedStyle(node).opacity);
  assert.equal(await opacity('founders'), '1');
  assert.equal(await opacity('frontier'), '0.62');
  assert.equal(
    await page
      .locator('[data-cup="frontier"] .cup-card-background')
      .evaluate((node) => getComputedStyle(node).opacity),
    '1',
  );
  await fits();
  await capture('earned-menu');
  await page.reload();
  await page.locator('.cup-cabinet').waitFor();
  assert.equal(await page.locator('.cup-cabinet .is-earned').count(), 1);
  assert.equal((await state()).cupCelebration, false);

  // Old championship wins backfill once, without requiring another race or replaying fanfare.
  await page.evaluate(
    ({ key, collection, saved }) => {
      localStorage.removeItem(collection);
      localStorage.setItem(key, JSON.stringify(saved));
    },
    {
      key: careerKey(CUP_STORAGE_KEY),
      collection: careerKey(CUP_COLLECTION_KEY),
      saved: savedFinal(1, true),
    },
  );
  await page.reload();
  await page.locator('.cup-cabinet').waitFor();
  assert.equal((await state()).cupCollection.cups.founders.points, 75);
  assert.equal((await state()).cupCelebration, false);
  // A complete P2 championship is still unearned, even on migration.
  await page.evaluate(
    ({ key, collection, saved }) => {
      localStorage.removeItem(collection);
      localStorage.setItem(key, JSON.stringify(saved));
    },
    {
      key: careerKey(CUP_STORAGE_KEY),
      collection: careerKey(CUP_COLLECTION_KEY),
      saved: savedFinal(2, true),
    },
  );
  await page.reload();
  await page.locator('.cup-cabinet').waitFor();
  assert.deepEqual((await state()).cupCollection.cups, {});
  assert.equal(await page.locator('.cup-cabinet .is-earned').count(), 0);
  assert.deepEqual(faults, []);
  console.log(
    `PASS cup awards ${width}x${height}: art, controller/keyboard, first-place collection, reveal, reduced motion, persistence and old-save migration`,
  );
} finally {
  await context.close();
  await browser.close();
}
