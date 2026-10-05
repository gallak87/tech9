import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import * as T from 'three';
const shape = process.env.VN_SHAPE_ONLY === '1';
const base = process.env.VN_URL;
if (!base)
  throw new Error('Set VN_URL to the completed desktop production preview.');
const folder = resolve(
  process.env.VN_EVIDENCE || '.experiments/helion2-mobile',
);
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
  const drive = await page.locator('#boost-status').innerText();
  const flightMode =
    state.runtime.state.motion?.mode ?? state.runtime.state.mode;
  if (flightMode === 'flight') assert.equal(drive, 'AIRBORNE');
  if (flightMode === 'recovery') assert.equal(drive, 'RECOVERY DELAY');
  assert.ok(
    Math.abs(state.camera.playerScreenX) < 0.95,
    `craft outside horizontal framing: ${name}`,
  );
  const layout = await page.evaluate(() => {
    const notice = document.querySelector('[data-helion-thermal]');
    const own = notice.getBoundingClientRect();
    const visible = notice.checkVisibility();
    const conflicts = visible
      ? [
          ...document.querySelectorAll(
            '.lap,.timing,#minimap,.speed,.energy,#shape-controls,#touch button,#notice,[data-helion-recovery]',
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
    return {
      visible,
      conflicts,
      buttons,
      notice: {
        left: own.left,
        right: own.right,
        top: own.top,
        bottom: own.bottom,
      },
    };
  });
  assert.deepEqual(layout.conflicts, [], `notice overlap: ${name}`);
  if (state.mode === 'racing') {
    const { width, height } = page.viewportSize();
    const camera = new T.PerspectiveCamera(
      state.camera.fov,
      width / height,
      0.1,
      42000,
    );
    camera.position.fromArray(state.camera.position);
    camera.quaternion.fromArray(state.camera.quaternion);
    camera.updateMatrixWorld();
    const transform = new T.Matrix4().compose(
      new T.Vector3().fromArray(state.ship.position),
      new T.Quaternion().fromArray(state.ship.quaternion),
      new T.Vector3(1, 1, 1),
    );
    const hull = {
      left: Infinity,
      right: -Infinity,
      top: Infinity,
      bottom: -Infinity,
    };
    for (const x of [-2.25, 2.25])
      for (const y of [-0.12, 1.8])
        for (const z of [-3.51, 3.7]) {
          const p = new T.Vector3(x, y, z)
            .applyMatrix4(transform)
            .project(camera);
          const sx = (p.x + 1) * width * 0.5,
            sy = (1 - p.y) * height * 0.5;
          hull.left = Math.min(hull.left, sx);
          hull.right = Math.max(hull.right, sx);
          hull.top = Math.min(hull.top, sy);
          hull.bottom = Math.max(hull.bottom, sy);
        }
    assert.ok(
      hull.left >= 0 &&
        hull.right <= width &&
        hull.top >= 0 &&
        hull.bottom <= height,
      `full hull outside viewport: ${name}`,
    );
    const n = layout.notice;
    const overlap =
      Math.min(n.right, hull.right) - Math.max(n.left, hull.left) > 0.5 &&
      Math.min(n.bottom, hull.bottom) - Math.max(n.top, hull.top) > 0.5;
    assert.ok(
      !layout.visible || !overlap,
      `thermal panel covers hull: ${name}`,
    );
    layout.hull = hull;
  }
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
    if (process.env.VN_VIEW && view !== process.env.VN_VIEW) continue;
    for (const [quality, reducedMotion] of [
      ['high', false],
      ['high', true],
      ['low', true],
    ]) {
      const name = `${shape ? 'shape-' : ''}${view}-${quality}${reducedMotion ? '-reduced' : ''}`;
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
          { quality, reducedMotion, volume: 0 },
        );
        const page = await context.newPage();
        page.on('pageerror', (e) => report.errors.push(e.message));
        await page.goto(
          `${base.replace(/\/$/, '')}/?level=helion${shape ? '&review=shape' : ''}`,
        );
        await page.waitForFunction(() => window.__VN?.ready, null, {
          timeout: 120000,
        });
        await capture(page, `${name}-title`);
        await page.locator('#start').tap();
        await page.evaluate(() => window.__VN.loadScenario('heat-hot', 71));
        await page.waitForTimeout(120);
        await capture(page, `${name}-heat-closed`);
        if (await page.locator('#review-toggle').count()) {
          await page.locator('#review-toggle').tap();
          await page.waitForTimeout(120);
          assert.equal(
            await page.locator('#review-toggle').getAttribute('aria-expanded'),
            'true',
          );
          await capture(page, `${name}-review-open`);
          await page.locator('[data-overview="top"]').tap();
          await page.waitForTimeout(120);
          assert.equal(
            await page.locator('[data-helion-thermal]').isVisible(),
            false,
          );
          await capture(page, `${name}-overview`);
          await page.evaluate(() => window.__VN.loadScenario('heat-hot', 71));
          await page.waitForTimeout(120);
          assert.equal(
            await page.locator('#review-toggle').getAttribute('aria-expanded'),
            'false',
          );
          await capture(page, `${name}-review-closed`);
        }
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
          'heliopause-showcase',
          'flare-contact',
          'jump1-success',
          'jump2-success',
        ]) {
          await page.evaluate((n) => window.__VN.loadScenario(n, 71), scenario);
          await page.waitForTimeout(120);
          await capture(page, `${name}-${scenario}`);
        }
        await page.evaluate(() =>
          window.__VN.loadScenario('jump1-success', 71),
        );
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
        await capture(page, `${name}-landed`);
        if (view === 'compact') {
          await page.evaluate(() =>
            window.__VN.loadScenario('jump2-short', 71),
          );
          await page.waitForFunction(
            () =>
              (window.__VN.getSnapshot().runtime.state.motion?.mode ??
                window.__VN.getSnapshot().runtime.state.mode) === 'recovery',
            null,
            { timeout: 20000 },
          );
          await capture(page, `${name}-recovering`);
          await page.waitForFunction(
            () =>
              window.__VN
                .getSnapshot()
                .events.some((e) => e.type === 'jump-transfer'),
            null,
            { timeout: 20000 },
          );
          await capture(page, `${name}-recovered`);
        }
        await page.evaluate(() => window.__VN.dispose());
        assert.equal(
          await page
            .locator(
              '[data-helion-visor],[data-helion-recovery],[data-helion-thermal]',
            )
            .count(),
          0,
        );
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
