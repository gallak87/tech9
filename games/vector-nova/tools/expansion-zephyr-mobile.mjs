import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import * as T from 'three';
const base = process.env.VN_URL;
if (!base)
  throw new Error('Set VN_URL to the completed desktop production preview.');
const shape = process.env.VN_SHAPE_ONLY === '1';
const folder =
  process.env.VN_EVIDENCE ||
  `.experiments/zephyr2/mobile${shape ? '-shape' : ''}`;
await mkdir(folder, { recursive: true });
const report = {
  cases: [],
  errors: [],
  limitations: [
    'Headless Chromium touch/viewport emulation; physical hardware, listening and foreground pacing are unverified.',
  ],
};
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const snapshot = (p) => p.evaluate(() => window.__VN.getSnapshot());
async function capture(page, name) {
  const state = await snapshot(page);
  assert.deepEqual(state.errors, []);
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
        const sx = ((p.x + 1) * width) / 2,
          sy = ((1 - p.y) * height) / 2;
        hull.left = Math.min(hull.left, sx);
        hull.right = Math.max(hull.right, sx);
        hull.top = Math.min(hull.top, sy);
        hull.bottom = Math.max(hull.bottom, sy);
      }
  const layout = await page.evaluate(() => {
    const selectors = [
      '.lap',
      '.timing',
      '#minimap',
      '.speed',
      '.energy',
      '.race-devices',
      '#touch button',
    ];
    const rects = selectors.flatMap((selector) =>
      [...document.querySelectorAll(selector)]
        .filter((n) => n.checkVisibility())
        .map((n) => {
          const r = n.getBoundingClientRect();
          return {
            name: n.dataset.drive || selector,
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          };
        }),
    );
    const visor = document.querySelector('[data-zephyr-visor]');
    return {
      rects,
      visor: visor
        ? {
            opacity: Number(visor.style.opacity),
            pointerEvents: getComputedStyle(visor).pointerEvents,
          }
        : null,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  await page.screenshot({ path: `${folder}/${name}.png` });
  report.cases.push({
    name,
    state,
    layout,
    hull,
    metrics: await page.evaluate(() => window.__VN.getMetrics()),
  });
  assert.equal(layout.overflow, false, `${name}: viewport overflow`);
  if (layout.visor) assert.equal(layout.visor.pointerEvents, 'none');
  if (state.mode === 'racing') {
    assert.ok(
      hull.left >= 0 &&
        hull.right <= width &&
        hull.top >= 0 &&
        hull.bottom <= height,
      `${name}: full hull outside viewport ${JSON.stringify(hull)}`,
    );
    for (const r of layout.rects) {
      assert.ok(
        r.left >= -0.5 &&
          r.top >= -0.5 &&
          r.right <= width + 0.5 &&
          r.bottom <= height + 0.5,
        `${name}: ${r.name} outside viewport`,
      );
      const overlaps =
        Math.min(r.right, hull.right) - Math.max(r.left, hull.left) > 0.5 &&
        Math.min(r.bottom, hull.bottom) - Math.max(r.top, hull.top) > 0.5;
      assert.equal(overlaps, false, `${name}: ${r.name} covers craft`);
    }
  }
  const motion = state.runtime.state.motion?.mode ?? state.runtime.state.mode;
  const drive = await page.locator('#boost-status').innerText();
  if (motion === 'flight') assert.equal(drive, 'AIRBORNE');
  if (motion === 'recovery') assert.equal(drive, 'RECOVERY DELAY');
}
try {
  for (const [view, width, height] of [
    ['portrait', 390, 844],
    ['landscape', 844, 390],
    ['compact', 640, 360],
  ].filter(
    ([name]) =>
      !process.env.VN_VIEWPORT ||
      process.env.VN_VIEWPORT.split(',').includes(name),
  ))
    for (const [quality, reducedMotion] of [
      ['high', false],
      ['high', true],
      ['low', true],
    ]) {
      const name = `${view}-${quality}${reducedMotion ? '-reduced' : ''}`;
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
          `${base.replace(/\/$/, '')}/?level=zephyr${shape ? '&review=shape' : ''}`,
        );
        await page.waitForFunction(() => window.__VN?.ready, null, {
          timeout: 120000,
        });
        assert.equal((await snapshot(page)).settings.quality, quality);
        assert.equal(
          (await snapshot(page)).settings.reducedMotion,
          reducedMotion,
        );
        await capture(page, `${name}-title`);
        await page.locator('#start').tap();
        await page.evaluate(() => window.__VN.loadScenario('nave-wall', 71));
        await page.waitForTimeout(120);
        await capture(page, `${name}-nave`);
        if (await page.locator('#review-toggle').count()) {
          await page.locator('#review-toggle').tap();
          await page.waitForTimeout(120);
          await capture(page, `${name}-review-open`);
          await page.locator('[data-overview="top"]').tap();
          await page.waitForTimeout(120);
          await capture(page, `${name}-overview`);
          await page.evaluate(() => window.__VN.loadScenario('staging', 71));
          await page.waitForTimeout(120);
          assert.equal(
            await page.locator('#review-toggle').getAttribute('aria-expanded'),
            'false',
          );
        }
        const client = await context.newCDPSession(page);
        const box = await page.locator('[data-drive="throttle"]').boundingBox();
        const point = {
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
          id: 1,
        };
        for (const end of ['touchEnd', 'touchCancel', 'blur']) {
          await client.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [point],
          });
          await page.waitForFunction(
            () => window.__VN.getSnapshot().input.throttle === 1,
          );
          if (end === 'blur')
            await page.evaluate(() => window.dispatchEvent(new Event('blur')));
          await client.send('Input.dispatchTouchEvent', {
            type: end === 'blur' ? 'touchEnd' : end,
            touchPoints: [],
          });
          await page.waitForFunction(
            () => window.__VN.getSnapshot().input.throttle === 0,
          );
          if (end === 'blur') {
            assert.equal((await snapshot(page)).mode, 'paused');
            await page.locator('#resume').tap();
          }
        }
        for (const scenario of [
          'hardest-turn',
          'cloudspire-showcase',
          'jump1-success',
          'jump2-success',
        ]) {
          await page.evaluate((n) => window.__VN.loadScenario(n, 71), scenario);
          await page.waitForTimeout(120);
          await capture(page, `${name}-${scenario}`);
        }
        await page.evaluate(() =>
          window.__VN.loadScenario('jump2-success', 71),
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
            window.__VN.loadScenario('jump1-short', 71),
          );
          await page.waitForFunction(
            () =>
              (window.__VN.getSnapshot().runtime.state.motion?.mode ??
                window.__VN.getSnapshot().runtime.state.mode) === 'recovery',
            null,
            { timeout: 20000 },
          );
          await capture(page, `${name}-recovery`);
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
        assert.equal(await page.locator('[data-zephyr-visor]').count(), 0);
        await client.detach();
        console.log(`${name}: passed`);
      } finally {
        await context.close();
      }
    }
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.errors.push(String(error.stack));
  process.exitCode = 1;
} finally {
  await browser.close();
  report.browserClosed = true;
  await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      cases: report.cases.length,
      errors: report.errors,
      folder,
      browserClosed: true,
    }),
  );
}
