// Run after build:demo. Developer gates use an isolated browser-only demo;
// a second smoke check loads the audited desktop renderer with a host-window
// bridge stub. Developer APIs must remain absent; native IPC has separate tests.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer, preview } from 'vite';
import config from '../vite.config.js';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
const root = resolve(import.meta.dirname, '..');
const server = await createServer({
  ...config,
  configFile: false,
  root,
  define: { 'import.meta.env.VN_EDITION': '"demo"' },
  server: { ...config.server, host: '127.0.0.1', port: 0, strictPort: false },
});
await server.listen();
const browser = await chromium.launch({
  channel: process.env.VN_BROWSER_CHANNEL ?? 'chrome',
  headless: true,
});
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const errors = [];
let compiled, activePage;
const state = (page) => page.evaluate(() => window.__VN_FRONTEND.getState());
async function pad(page, index) {
  for (const pressed of [true, false])
    await page.evaluate(
      ({ index, pressed }) => {
        window.testPad.buttons[index] = { pressed, value: Number(pressed) };
        return new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      },
      { index, pressed },
    );
}
async function open(query) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript(() => {
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({ quality: 'low', volume: 0, reducedMotion: true }),
    );
    window.testPad = {
      id: 'demo-check',
      index: 0,
      mapping: 'standard',
      connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [window.testPad],
    });
  });
  const page = await context.newPage();
  activePage = page;
  await page.addInitScript(() => {
    window.vectorNovaDesktop = {
      toggleFullscreen() {},
      getFullscreen: async () => false,
      onFullscreenChange: () => () => {},
      quit() {},
    };
  });
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error(error.message);
  });
  await page.goto(`${base}/?${query}`);
  await page.waitForFunction(() => window.__VN_FRONTEND);
  return { context, page };
}
const action = (page, id) => page.locator(`[data-action="${id}"]`).first();
const results = (page) =>
  page.waitForFunction(
    () => window.__VN_FRONTEND.getState().screen === 'results',
    null,
    { timeout: 90000 },
  );
try {
  if (!process.argv.includes('--compiled-only')) {
    {
      const { page, context } = await open('dev=1&finish=1&place=4');
      await page.locator('[data-reward-info="equipment-jump"]').focus();
      assert.match(
        await page.locator('#reward-detail-equipment-jump').innerText(),
        /3 valid races/,
      );
      await pad(page, 1);
      assert.equal(
        await page
          .locator('[data-reward-info="equipment-jump"]')
          .getAttribute('aria-expanded'),
        'false',
      );
      for (let i = 1; i <= 3; i++) {
        await action(page, i === 1 ? 'launch' : 'retry-race').focus();
        if (i === 2) await page.keyboard.press('Enter');
        else await pad(page, 0);
        await page.waitForFunction(
          (n) => window.__VN_FRONTEND.getState().career.state.finishes === n,
          i,
          { timeout: 90000 },
        );
        await results(page);
        const career = (await state(page)).career.state;
        assert.equal(career.finishes, i);
        assert.equal(career.wins, 0);
        assert.deepEqual(
          career.claims,
          i < 3 ? ['speed-1'] : ['speed-1', 'equipment-jump'],
        );
      }
      assert.match(
        await page.locator('.earned-rewards').innerText(),
        /Jump Drive/,
      );
      await context.close();
      console.log(
        'PASS demo first/third finish reveals through keyboard/controller',
      );
    }
    {
      const { page, context } = await open(
        'dev=1&cup=demo&event=final&finish=1',
      );
      await action(page, 'cup-hub').focus();
      await page.keyboard.press('Enter');
      assert.match(await page.locator('.cup-hero').innerText(), /Deflector/);
      await page.locator('.race-actions .primary').focus();
      await pad(page, 0);
      await results(page);
      assert.ok(
        (await state(page)).career.state.claims.includes('equipment-deflector'),
      );
      assert.ok((await state(page)).cupCollection.cups.demo);
      assert.equal(await page.locator('.cup-victory').count(), 1);
      await pad(page, 0);
      await action(page, 'equipment').focus();
      await pad(page, 0);
      await page.locator('[data-equip="deflector"]').focus();
      await pad(page, 0);
      assert.equal(
        (await state(page)).career.state.loadouts.kestrel[0],
        'deflector',
      );
      assert.equal(await page.locator('.garage-equipment-card').count(), 1);
      await context.close();
      console.log(
        'PASS Demo Cup trophy, reward and controller equipment selection',
      );
    }
    {
      const { page, context } = await open('dev=1&finish=1');
      await action(page, 'time-trial').focus();
      await page.keyboard.press('Enter');
      await action(page, 'launch').focus();
      await pad(page, 0);
      await page.waitForFunction(
        () =>
          window.__VN_FRONTEND
            .getState()
            .career.state.claims.includes('boost-1'),
        null,
        { timeout: 90000 },
      );
      assert.deepEqual((await state(page)).career.state.claims, ['boost-1']);
      assert.equal((await state(page)).career.state.finishes, 0);
      await context.close();
      console.log(
        'PASS clean Time Trial earns Boost I without racing prerequisite',
      );
    }
    {
      const { page, context } = await open('dev=2');
      await action(page, 'garage-tab').focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(
        () =>
          document.querySelector('.ship-preview')?.dataset.state === 'ready',
      );
      assert.equal(await page.locator('.garage-fleet button').count(), 1);
      assert.equal(await page.locator('.garage-equipment-card').count(), 2);
      assert.match(
        await page.locator('.garage-equipment-count').innerText(),
        /2 \/ 2/,
      );
      await page.locator('[data-equip="jump"]').focus();
      await page.keyboard.press('Enter');
      assert.match(
        await page.locator('.garage-equipment-count').innerText(),
        /1 \/ 2/,
      );
      await pad(page, 0);
      assert.match(
        await page.locator('.garage-equipment-count').innerText(),
        /2 \/ 2/,
      );
      // Final layout check after desktop interactions: no new mobile-only paths.
      for (const viewport of process.argv.includes('--desktop-only')
        ? []
        : [
            { width: 390, height: 844 },
            { width: 844, height: 390 },
          ]) {
        await page.setViewportSize(viewport);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
        for (const card of await page.locator('.garage-equipment-card').all())
          assert.ok(await card.isVisible());
      }
      await context.close();
      console.log(
        'PASS complete demo garage and two-slot toggles' +
          (process.argv.includes('--desktop-only')
            ? ''
            : ' with final responsive layouts'),
      );
    }
  }
  compiled = await preview({
    configFile: false,
    root,
    build: { outDir: '.desktop/demo/dist' },
    preview: { host: '127.0.0.1', port: 0 },
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.addInitScript(() => {
    window.vectorNovaDesktop = {
      toggleFullscreen() {},
      getFullscreen: async () => false,
      onFullscreenChange: () => () => {},
      quit() {},
    };
  });
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error(error.message);
  });
  await page.goto(
    `http://127.0.0.1:${compiled.httpServer.address().port}/?dev=2`,
  );
  try {
    await action(page, 'garage-tab').focus();
  } catch (error) {
    console.error(
      'Compiled renderer:',
      await page.locator('body').innerText(),
      errors,
    );
    throw error;
  }
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => document.querySelector('.ship-preview')?.dataset.state === 'ready',
  );
  assert.equal(await page.locator('.garage-fleet button').count(), 1);
  assert.equal(await page.locator('.garage-equipment-card').count(), 0);
  assert.equal(
    await page.evaluate(() => !!window.__VN || !!window.__VN_FRONTEND),
    false,
  );
  await action(page, 'race-tab').focus();
  await page.keyboard.press('Enter');
  await action(page, 'career').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.reward-milestone').count(), 4);
  assert.match(
    await page.locator('.career-intro').innerText(),
    /Export your save/,
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll('img.reward-art')].every(
      (img) => img.complete && img.naturalWidth > 0,
    ),
  );
  if (process.env.VN_EVIDENCE)
    await page.screenshot({ path: process.env.VN_EVIDENCE });
  assert.equal(
    await page
      .locator('img.reward-art')
      .evaluateAll((images) =>
        images.every((img) => img.complete && img.naturalWidth > 0),
      ),
    true,
  );
  const manifest = JSON.parse(
    await readFile(resolve(root, '.desktop/demo/release-manifest.json')),
  );
  assert.equal(
    manifest.files.filter((file) => file.path.includes('/rewards/icons-v2/'))
      .length,
    4,
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS audited demo renderer, four icons and no developer escape hatch',
  );
} catch (error) {
  if (activePage && !activePage.isClosed())
    console.error(
      'Browser state:',
      await state(activePage),
      await activePage.locator('body').innerText(),
    );
  console.error('Browser errors:', errors);
  throw error;
} finally {
  await browser.close();
  await server.close();
  await new Promise((resolve) =>
    compiled ? compiled.httpServer.close(resolve) : resolve(),
  );
}
