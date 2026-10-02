import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const base = process.env.VN_URL;
if (!base)
  throw new Error('Set VN_URL to the completed desktop production preview.');
const folder = resolve('.experiments/expansion/cindercoil/mobile');
await mkdir(folder, { recursive: true });
const report = {
  cases: [],
  errors: [],
  limitations: [
    'Headless Chromium viewport/touch emulation; physical mobile hardware, audible mix and foreground pacing are unverified.',
  ],
};
const browser = await chromium.launch({
  headless: true,
  channel: process.env.VN_BROWSER_CHANNEL || 'chrome',
});
const snapshot = (page) => page.evaluate(() => window.__VN.getSnapshot());
async function capture(page, name) {
  const state = await snapshot(page);
  assert.deepEqual(state.errors, []);
  assert.ok(
    Math.abs(state.camera.playerScreenX) < 0.95,
    `craft outside horizontal framing: ${name}`,
  );
  const layout = await page.evaluate(() => {
    const notice = document.querySelector('.cindercoil-notice');
    const own = notice.getBoundingClientRect();
    const visible = notice.checkVisibility();
    const conflicts = visible
      ? [
          ...document.querySelectorAll(
            '.lap,.timing,#minimap,.speed,.energy,#shape-controls,#touch button,#notice',
          ),
        ]
          .filter((n) => {
            if (!n.checkVisibility()) return false;
            const r = n.getBoundingClientRect();
            return (
              r.width &&
              r.height &&
              Math.min(own.right, r.right) - Math.max(own.left, r.left) > 0.5 &&
              Math.min(own.bottom, r.bottom) - Math.max(own.top, r.top) > 0.5
            );
          })
          .map((n) => n.id || n.className || n.textContent)
      : [];
    const buttons = [...document.querySelectorAll('#touch button')]
      .filter((n) => n.checkVisibility())
      .map((n) => {
        const r = n.getBoundingClientRect();
        return {
          label: n.dataset.drive,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        };
      });
    return { visible, conflicts, buttons };
  });
  assert.deepEqual(layout.conflicts, [], `notice overlap: ${name}`);
  for (const b of layout.buttons)
    assert.ok(
      b.x >= 0 &&
        b.y >= 0 &&
        b.x + b.width <= page.viewportSize().width + 1 &&
        b.y + b.height <= page.viewportSize().height + 1,
      `touch button outside viewport: ${name}`,
    );
  await page.screenshot({ path: `${folder}/${name}.png` });
  report.cases.push({
    name,
    state,
    layout,
    metrics: await page.evaluate(() => window.__VN.getMetrics()),
  });
}
try {
  for (const [view, width, height] of [
    ['portrait', 390, 844],
    ['landscape', 844, 390],
    ['compact', 640, 360],
  ]) {
    for (const quality of ['high', 'low']) {
      const name = `${view}-${quality}`;
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
      });
      try {
        await context.addInitScript(
          (settings) =>
            localStorage.setItem(
              'vector-nova.settings',
              JSON.stringify(settings),
            ),
          { quality, reducedMotion: quality === 'low', volume: 0 },
        );
        const page = await context.newPage();
        page.on('pageerror', (e) => report.errors.push(e.message));
        await page.goto(`${base.replace(/\/$/, '')}/?level=cindercoil`);
        await page.waitForFunction(() => window.__VN?.ready, null, {
          timeout: 120000,
        });
        await capture(page, `${name}-title`);
        await page.locator('#start').tap();
        await page.evaluate(() =>
          window.__VN.loadScenario('surge1-protected', 71),
        );
        await page.waitForTimeout(120);
        await capture(page, `${name}-surge-closed`);
        await page.locator('#review-toggle').tap();
        await page.waitForTimeout(120);
        assert.equal(
          (await snapshot(page)).environment.cindercoil.visible,
          false,
        );
        await capture(page, `${name}-review-open`);
        await page.locator('#review-toggle').tap();
        const client = await context.newCDPSession(page);
        const button = page.locator('[data-drive="throttle"]');
        const box = await button.boundingBox();
        const point = {
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
          id: 1,
        };
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [point],
        });
        await page.waitForFunction(
          () => window.__VN.getSnapshot().input.throttle === 1,
        );
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
        });
        await page.waitForFunction(
          () => window.__VN.getSnapshot().input.throttle === 0,
        );
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [point],
        });
        await page.waitForFunction(
          () => window.__VN.getSnapshot().input.throttle === 1,
        );
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchCancel',
          touchPoints: [],
        });
        await page.waitForFunction(
          () => window.__VN.getSnapshot().input.throttle === 0,
        );
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [point],
        });
        await page.waitForFunction(
          () => window.__VN.getSnapshot().input.throttle === 1,
        );
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
        });
        const blurred = await snapshot(page);
        assert.equal(blurred.mode, 'paused');
        assert.equal(blurred.input.throttle, 0);
        await page.locator('#resume').tap();
        for (const scenario of [
          'coil-inverted',
          'vent-approach',
          'vent-erupting',
          'crown-showcase',
          'spill-approach',
          'spill-crossing',
          'spill-source',
          'spill-outfall',
        ]) {
          await page.evaluate((n) => window.__VN.loadScenario(n, 71), scenario);
          await page.waitForTimeout(120);
          await capture(page, `${name}-${scenario}`);
        }
        await page.evaluate(() =>
          window.__VN.loadScenario('vent-edge-right', 71),
        );
        await page.waitForFunction(
          () =>
            window.__VN.getSnapshot().events.some((e) => e.type === 'impact'),
          null,
          { timeout: 20000 },
        );
        await capture(page, `${name}-barrier-catch`);
        await page.waitForFunction(
          () =>
            window.__VN
              .getSnapshot()
              .events.some((e) => e.type === 'jump-transfer'),
          null,
          { timeout: 20000 },
        );
        assert.equal(
          (await snapshot(page)).events.find((e) => e.type === 'jump-transfer')
            .payload.outcome,
          'landed',
        );
        await capture(page, `${name}-barrier-landed`);
        if (view === 'compact') {
          await page.evaluate(() => window.__VN.loadScenario('vent-short', 71));
          await page.waitForFunction(
            () =>
              window.__VN.getSnapshot().runtime.state.flight.mode ===
              'recovery',
            null,
            { timeout: 20000 },
          );
          await capture(page, `${name}-short-recovery`);
          await page.waitForFunction(
            () =>
              window.__VN
                .getSnapshot()
                .events.some((e) => e.type === 'jump-transfer'),
            null,
            { timeout: 20000 },
          );
          await capture(page, `${name}-short-recovered`);
        }
        await page.evaluate(() => window.__VN.dispose());
        assert.equal(await page.locator('.cindercoil-exposure').count(), 0);
        await client.detach();
        console.log(`${name}: layout, touch release/cancel and blur passed`);
      } finally {
        await context.close();
      }
    }
  }
} catch (error) {
  report.errors.push(error.stack);
  process.exitCode = 1;
} finally {
  await browser.close();
  report.browserClosed = true;
  await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      cases: report.cases.length,
      errors: report.errors,
      browserClosed: true,
      folder,
    }),
  );
}
