import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { openCoast, root } from './lib/browser.mjs';

const output = path.join(root, '.artifacts/verification');
await mkdir(output, { recursive: true });
const report = {
  checks: [],
  captures: [],
  limits:
    'Chromium desktop and touch emulation; not physical mobile performance or driver-level GPU memory measurement.',
};
let harness;
async function shot(name) {
  await harness.page.screenshot({ path: path.join(output, name + '.png') });
  report.captures.push(name + '.png');
}
async function check(name, fn) {
  await fn();
  report.checks.push({ name, pass: true });
  console.log('PASS ' + name);
}
async function hold(key, ms) {
  await harness.page.keyboard.down(key);
  await harness.page.waitForTimeout(ms);
  await harness.page.keyboard.up(key);
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
try {
  harness = await openCoast();
  const { page, snapshot } = harness;
  report.environment = {
    browser: await harness.browser.version(),
    viewport: page.viewportSize(),
    gpu: await page.evaluate(() => {
      const gl = document.querySelector('#stage canvas').getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable';
    }),
  };
  await shot('desktop-welcome');
  await check('start and artwork ready', async () => {
    await page.getByRole('button', { name: 'Explore the coast' }).click();
    await page.waitForTimeout(100);
    const s = await snapshot();
    assert.equal(s.started, true);
    assert.equal(s.paused, false);
    assert.equal(s.stats.assetCount, 5);
    assert.equal(s.stats.textureCount, 1);
    assert.ok(s.stats.assetBytes > 0);
    assert.equal(await page.locator('#stage canvas').count(), 1);
  });
  await shot('desktop-start');
  await check('keyboard movement and following camera', async () => {
    const a = await snapshot();
    await hold('w', 550);
    await page.waitForTimeout(250);
    const b = await snapshot();
    assert.ok(b.actor.y < a.actor.y - 60);
    assert.ok(b.camera.y < a.camera.y - 25);
  });
  await check('pause and resume clear held motion', async () => {
    await page.keyboard.down('d');
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    await page.keyboard.up('d');
    assert.equal((await snapshot()).paused, true);
    assert.equal(await page.locator('#paused').isVisible(), true);
    const a = (await snapshot()).actor;
    await hold('w', 200);
    assert.ok(distance(a, (await snapshot()).actor) < 0.01);
    await page
      .getByRole('button', { name: 'Return to the coast', exact: true })
      .click();
    await page.waitForTimeout(150);
    assert.equal((await snapshot()).paused, false);
    const b = (await snapshot()).actor;
    await page.waitForTimeout(150);
    assert.ok(distance(b, (await snapshot()).actor) < 0.01);
  });
  await check(
    'restart recreates the world without retained resources',
    async () => {
      for (let i = 0; i < 3; i++) {
        await page
          .getByRole('button', { name: 'Return to start', exact: true })
          .click();
        await page.waitForFunction(
          () =>
            window.__COAST_TEST__?.snapshot()?.started &&
            !document.querySelector('#reset').disabled,
        );
        const s = await snapshot();
        assert.equal(s.actor.x, 870);
        assert.equal(s.actor.y, 980);
        assert.equal(s.lastDisposed.stats.assetCount, 0);
        assert.equal(s.lastDisposed.stats.surfaceCount, 0);
        assert.equal(s.lastDisposed.stats.textureCount, 0);
        assert.equal(await page.locator('.sprite-controls').count(), 1);
        assert.equal(await page.locator('#stage canvas').count(), 1);
      }
    },
  );
  await check(
    'pointer-to-world movement uses the actual stage rectangle',
    async () => {
      const s = await snapshot(),
        rect = await page.locator('#stage canvas').boundingBox();
      const point = { x: s.actor.x + 65, y: s.actor.y + 25 };
      await page.mouse.click(
        rect.x + ((point.x - s.camera.x) * rect.width) / s.viewport.width,
        rect.y + ((point.y - s.camera.y) * rect.height) / s.viewport.height,
      );
      await page.waitForTimeout(550);
      assert.ok(distance(point, (await snapshot()).actor) < 6);
    },
  );
  await check(
    'landmark interaction via real keyboard and dialog dismissal',
    async () => {
      await page
        .getByRole('button', { name: 'Return to start', exact: true })
        .click();
      await page.waitForFunction(
        () =>
          window.__COAST_TEST__?.snapshot()?.started &&
          !document.querySelector('#reset').disabled,
      );
      await hold('s', 470);
      assert.equal((await snapshot()).near?.id, 'gate');
      await page.keyboard.press('f');
      await page.waitForTimeout(80);
      assert.equal(await page.locator('#reading').isVisible(), true);
      assert.equal((await snapshot()).paused, true);
      await page.getByRole('button', { name: 'Keep wandering' }).click();
      await page.waitForFunction(
        () => window.__COAST_TEST__.snapshot().paused === false,
      );
      assert.equal((await snapshot()).paused, false);
    },
  );
  await check('foreground occlusion and grounded trunk collision', async () => {
    assert.equal(
      await page.evaluate(() => window.__COAST_TEST__.teleport(770, 925)),
      true,
    );
    await page.waitForTimeout(80);
    assert.ok((await snapshot()).stats.occludedProps > 0);
    await shot('desktop-occlusion');
    await hold('s', 600);
    const s = await snapshot();
    assert.ok(s.actor.y < 990, 'trunk blocks feet');
    assert.ok(s.actor.y > 950, 'can walk beneath painted canopy');
  });
  await check(
    'authored road reaches observatory and shoreline with pointer input',
    async () => {
      await page
        .getByRole('button', { name: 'Return to start', exact: true })
        .click();
      await page.waitForFunction(
        () =>
          window.__COAST_TEST__?.snapshot()?.started &&
          !document.querySelector('#reset').disabled,
      );
      const walkTo = async (point) => {
        const state = await snapshot(),
          rect = await page.locator('#stage canvas').boundingBox();
        await page.mouse.click(
          rect.x +
            ((point.x - state.camera.x) * rect.width) / state.viewport.width,
          rect.y +
            ((point.y - state.camera.y) * rect.height) / state.viewport.height,
        );
        await page.waitForFunction(
          (p) => {
            const a = window.__COAST_TEST__.snapshot().actor;
            return Math.hypot(a.x - p.x, a.y - p.y) < 6;
          },
          point,
          { timeout: 4000 },
        );
      };
      for (const [x, y] of [
        [890, 860],
        [970, 780],
        [1030, 700],
        [1010, 640],
      ])
        await walkTo({ x, y });
      await page.waitForTimeout(350);
      assert.equal((await snapshot()).near.id, 'observatory');
      await shot('desktop-observatory');
      for (const [x, y] of [
        [1030, 700],
        [1160, 760],
        [1280, 810],
        [1370, 885],
        [1430, 915],
      ])
        await walkTo({ x, y });
      await page.waitForTimeout(300);
      await shot('desktop-shoreline');
    },
  );
  await check('persisted page suspension can return and resume', async () => {
    await page.evaluate(() =>
      window.dispatchEvent(
        new PageTransitionEvent('pagehide', { persisted: true }),
      ),
    );
    assert.equal((await snapshot()).paused, true);
    const before = (await snapshot()).stats.frameCount;
    await page.waitForTimeout(100);
    assert.equal((await snapshot()).stats.frameCount, before);
    await page.evaluate(() =>
      window.dispatchEvent(
        new PageTransitionEvent('pageshow', { persisted: true }),
      ),
    );
    await page
      .getByRole('button', { name: 'Return to the coast', exact: true })
      .click();
    await page.waitForTimeout(80);
    assert.ok((await snapshot()).stats.frameCount > before);
    assert.equal((await snapshot()).paused, false);
  });
  await check(
    'focus loss pauses and resize preserves aspect and pixel limits',
    async () => {
      await page.keyboard.down('w');
      await page.waitForTimeout(80);
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.keyboard.up('w');
      const a = (await snapshot()).actor;
      await page.waitForTimeout(150);
      assert.equal((await snapshot()).paused, true);
      assert.ok(distance(a, (await snapshot()).actor) < 0.01);
      await page
        .getByRole('button', { name: 'Return to the coast', exact: true })
        .click();
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.waitForTimeout(120);
      const s = await snapshot();
      assert.ok(
        Math.abs(s.viewport.width / s.viewport.height - 1280 / 720) < 0.01,
      );
      assert.ok(
        s.viewport.width * s.viewport.height * s.viewport.renderScale ** 2 <=
          1500001,
      );
    },
  );
  await check('representative frame timing', async () => {
    report.performance = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const samples = [];
          let last = performance.now();
          function frame(now) {
            samples.push(now - last);
            last = now;
            if (samples.length < 181) requestAnimationFrame(frame);
            else {
              samples.shift();
              samples.sort((a, b) => a - b);
              resolve({
                frames: samples.length,
                medianMs: samples[Math.floor(samples.length * 0.5)],
                p95Ms: samples[Math.floor(samples.length * 0.95)],
                meanMs: samples.reduce((a, b) => a + b, 0) / samples.length,
                viewport: window.__COAST_TEST__.snapshot().viewport,
                stats: window.__COAST_TEST__.snapshot().stats,
              });
            }
          }
          requestAnimationFrame(frame);
        }),
    );
  });
  await check('disposal releases owned resources', async () => {
    const s = await page.evaluate(() => window.__COAST_TEST__.dispose());
    assert.equal(s.stats.assetCount, 0);
    assert.equal(s.stats.surfaceCount, 0);
    assert.equal(s.stats.textureCount, 0);
    assert.equal(await page.locator('#stage canvas').count(), 0);
    assert.equal(await page.locator('.sprite-controls').count(), 0);
  });
  assert.deepEqual(harness.errors, []);
  await harness.close();
  harness = null;
  harness = await openCoast({ width: 390, height: 844, touch: true });
  const mobile = harness.page;
  await mobile.getByRole('button', { name: 'Explore the coast' }).tap();
  await check('portrait touch movement and pointer cancellation', async () => {
    const pad = mobile.locator('.sprite-stick');
    assert.equal(await pad.isVisible(), true);
    const rect = await pad.boundingBox(),
      session = await mobile.context().newCDPSession(mobile),
      before = (await harness.snapshot()).actor;
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...center, id: 1 }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: center.x, y: center.y - rect.height * 0.32, id: 1 }],
    });
    await mobile.waitForTimeout(650);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchCancel',
      touchPoints: [],
    });
    await mobile.waitForTimeout(80);
    const after = (await harness.snapshot()).actor;
    assert.ok(after.y < before.y - 35);
    await mobile.waitForTimeout(150);
    assert.ok(distance(after, (await harness.snapshot()).actor) < 0.01);
    await session.detach();
    assert.ok((await harness.snapshot()).viewport.cssHeight < 844 - 100);
    await shot('mobile-portrait');
  });
  await check(
    'touch run toggle, rotation, and nonoverlapping usable controls',
    async () => {
      await mobile.locator('[data-action="run"]').tap();
      assert.equal(
        await mobile
          .locator('[data-action="run"]')
          .getAttribute('aria-pressed'),
        'true',
      );
      for (const size of [
        { width: 844, height: 390 },
        { width: 390, height: 844 },
      ]) {
        await mobile.setViewportSize(size);
        await mobile.waitForTimeout(180);
        for (const locator of [
          mobile.locator('.sprite-stick'),
          mobile.locator('[data-action="run"]'),
          mobile.locator('[data-action="interact"]'),
        ]) {
          const rect = await locator.boundingBox();
          assert.ok(rect && rect.width >= 44 && rect.height >= 44);
          assert.ok(
            rect.x >= 0 &&
              rect.y >= 0 &&
              rect.x + rect.width <= size.width + 1 &&
              rect.y + rect.height <= size.height + 1,
          );
        }
        const s = await harness.snapshot();
        assert.ok(
          s.viewport.width * s.viewport.height * s.viewport.renderScale ** 2 <=
            1500001,
        );
        await shot(
          size.width > size.height
            ? 'mobile-landscape'
            : 'mobile-portrait-return',
        );
      }
    },
  );
  assert.deepEqual(harness.errors, []);
} catch (error) {
  report.error = error.stack;
  if (harness) await shot('failure');
  process.exitCode = 1;
  console.error(error);
} finally {
  await harness?.close();
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
}
