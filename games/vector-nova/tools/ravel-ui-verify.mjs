import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {
  createCareerSlots,
  createMemoryStorage,
} from '../src/progression/careers.js';

if (!process.env.VN_URL)
  throw new Error('Set VN_URL to the Ravel worktree dev server.');
const storage = createMemoryStorage();
createCareerSlots({ storage: () => storage, now: () => 1 }).create(1);
const seed = Array.from({ length: storage.length }, (_, i) => {
  const key = storage.key(i);
  return [key, storage.getItem(key)];
});
const browser = await chromium.launch({
  channel: process.env.VN_BROWSER_CHANNEL ?? 'chrome',
  headless: true,
  args: ['--mute-audio'],
});
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((seed) => {
    for (const [key, value] of seed) localStorage.setItem(key, value);
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({ quality: 'low', volume: 0, reducedMotion: true }),
    );
    window.__ravelPad = {
      id: 'Synthetic standard controller',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [window.__ravelPad],
      configurable: true,
    });
  }, seed);
  const settle = () =>
    page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        ),
    );
  const tap = async (index) => {
    await page.evaluate((i) => {
      window.__ravelPad.buttons[i] = { pressed: true, value: 1 };
    }, index);
    await settle();
    await page.evaluate((i) => {
      window.__ravelPad.buttons[i] = { pressed: false, value: 0 };
    }, index);
    await settle();
  };
  const navigate = async (selector) => {
    for (let i = 0; i < 25; i++) {
      if (
        await page.evaluate((s) => document.activeElement?.matches(s), selector)
      )
        return;
      await tap(13);
    }
    throw new Error('Controller could not reach ' + selector);
  };
  await page.goto(
    new URL('?intro=0&level=ravel&music=0', process.env.VN_URL).href,
  );
  await page.locator('[data-action="practice"]').click();
  assert.equal(
    await page.locator('.developer-note:visible').count(),
    0,
    'uses current frontend',
  );
  await page.locator('[data-action="launch"]').click();
  await page.waitForFunction(
    () => window.__VN?.ready && window.__VN.getSnapshot().mode === 'racing',
    null,
    { timeout: 120000 },
  );
  assert.equal(await page.locator('#front-shell:visible').count(), 0);
  assert.equal(await page.locator('.developer-note:visible').count(), 0);
  await page.keyboard.press('Escape');
  await page.locator('#ravel-test-section').waitFor({ state: 'visible' });
  for (
    let i = 0;
    i < 12 &&
    (await page.evaluate(
      () => document.activeElement.id !== 'ravel-test-section',
    ));
    i++
  )
    await page.keyboard.press('Tab');
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    'ravel-test-section',
  );
  // Native select typeahead works without an OS popup in headless macOS Chrome.
  await page.keyboard.press('m');
  assert.equal(
    await page.locator('#ravel-test-section').inputValue(),
    'wave-seam',
  );
  await page.keyboard.press('Tab');
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    'ravel-drive-section',
  );
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () =>
      window.__VN.getSnapshot().scenario === 'wave-seam' &&
      window.__VN.getSnapshot().mode === 'racing',
  );
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    'pause-button',
  );
  await tap(9);
  await page.waitForFunction(() => window.__VN.getSnapshot().mode === 'paused');
  await navigate('#ravel-test-section');
  await tap(15);
  assert.equal(
    await page.locator('#ravel-test-section').inputValue(),
    'crest-rising',
  );
  await tap(13);
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    'ravel-drive-section',
  );
  await tap(0);
  await page.waitForFunction(
    () =>
      window.__VN.getSnapshot().scenario === 'crest-rising' &&
      window.__VN.getSnapshot().mode === 'racing',
  );
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    'pause-button',
  );
  await tap(9);
  await page.waitForFunction(() => window.__VN.getSnapshot().mode === 'paused');
  await tap(1);
  await page.waitForFunction(() => window.__VN.getSnapshot().mode === 'racing');
  if (process.argv.includes('--responsive'))
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await page.keyboard.press('Escape');
      for (const id of ['ravel-test-section', 'ravel-drive-section']) {
        const control = page.locator('#' + id);
        await control.scrollIntoViewIfNeeded();
        const box = await control.boundingBox();
        assert.ok(
          box &&
            box.x >= 0 &&
            box.x + box.width <= viewport.width + 0.5 &&
            box.y >= 0 &&
            box.y + box.height <= viewport.height + 0.5,
          `${id} visible at ${viewport.width}x${viewport.height}`,
        );
      }
      await page.keyboard.press('Escape');
    }
  assert.deepEqual(errors, []);
  assert.deepEqual(
    await page.evaluate(() => window.__VN.getSnapshot().errors),
    [],
  );
  console.log(
    'Ravel current-frontend entry, keyboard and controller section selection, focus return and Back passed' +
      (process.argv.includes('--responsive')
        ? '; final narrow/landscape control bounds passed.'
        : '.'),
  );
} finally {
  await browser.close();
}
