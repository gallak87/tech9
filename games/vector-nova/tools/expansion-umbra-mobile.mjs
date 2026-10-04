import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

if (!process.env.VN_URL)
  throw new Error('VN_URL must identify the owned preview');
const output = resolve(process.env.VN_EVIDENCE ?? '.experiments/umbra-mobile');
await mkdir(output, { recursive: true });
const report = {
  cases: [],
  limitations: [
    'Hidden viewport/pointer emulation; no physical-device certification',
  ],
};
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--mute-audio'],
});
const overlaps = (a, b) =>
  a &&
  b &&
  a.left < b.right &&
  a.right > b.left &&
  a.top < b.bottom &&
  a.bottom > b.top;
async function geometry(page) {
  return page.evaluate(() => {
    const result = {
      width: innerWidth,
      height: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
    for (const selector of [
      '#minimap',
      '.speed',
      '.energy',
      '.top-telemetry .position',
      '.top-telemetry .lap',
      '.top-telemetry .timing',
      '#touch',
      '#race-roster',
      '.race-devices',
      '.umbra-field',
      '#notice',
      '#shape-controls',
    ]) {
      const node = document.querySelector(selector);
      if (
        !node ||
        !node.getClientRects().length ||
        getComputedStyle(node).visibility === 'hidden'
      )
        continue;
      const r = node.getBoundingClientRect();
      if (r.width && r.height)
        result[selector] = {
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
        };
    }
    return result;
  });
}
function fits(r, g) {
  return (
    r &&
    r.left >= -1 &&
    r.right <= g.width + 1 &&
    r.top >= -1 &&
    r.bottom <= g.height + 1
  );
}
const snapshot = (page) => page.evaluate(() => window.__VN.getSnapshot());
async function capture(page, item, suffix) {
  await page.waitForTimeout(70);
  item.views.push({
    suffix,
    geometry: await geometry(page),
    snapshot: await snapshot(page),
  });
  await page.screenshot({
    path: resolve(output, `${item.name}-${suffix}.png`),
  });
}
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 640, height: 360 },
  ]) {
    for (const quality of ['high', 'low']) {
      for (const shape of process.env.VN_PRODUCTION_ONLY === '1'
        ? [false]
        : [false, true]) {
        const name = `${viewport.width}x${viewport.height}-${quality}-${shape ? 'shape' : 'production'}`;
        const context = await browser.newContext({
          viewport,
          deviceScaleFactor: 1,
          hasTouch: true,
          isMobile: true,
        });
        const item = { name, views: [], faults: [], status: 'running' };
        report.cases.push(item);
        try {
          await context.addInitScript(
            ({ quality }) =>
              localStorage.setItem(
                'vector-nova.settings',
                JSON.stringify({
                  quality,
                  reducedMotion: quality === 'low',
                  volume: 0,
                }),
              ),
            { quality },
          );
          const page = await context.newPage();
          page.on('pageerror', (e) => item.faults.push(e.message));
          page.on('console', (m) => {
            if (m.type() === 'error') item.faults.push(m.text());
          });
          const url = new URL(process.env.VN_URL);
          url.search = `?level=umbra${shape ? '&review=shape' : ''}`;
          await page.goto(url.href);
          await page.waitForFunction(() => window.__VN?.ready, null, {
            timeout: 90000,
          });
          await capture(page, item, 'paddock');
          await page.locator('#start').click();
          await page.waitForFunction(
            () => window.__VN.getSnapshot().mode === 'racing',
            null,
            { timeout: 12000 },
          );
          if (
            shape &&
            (await page
              .locator('#review-toggle')
              .getAttribute('aria-expanded')) === 'true'
          )
            await page.locator('#review-toggle').click();
          await capture(page, item, 'race');
          const g = await geometry(page);
          assert.equal(g.overflow, false, 'horizontal overflow');
          for (const selector of ['#minimap', '.speed', '.energy', '#touch'])
            assert.ok(fits(g[selector], g), `${selector} fits`);
          assert.ok(!overlaps(g['#minimap'], g['.speed']), 'map clears speed');
          assert.ok(
            !overlaps(g['#race-roster'], g['#touch']),
            'roster clears touch row',
          );
          for (const selector of [
            '.top-telemetry .position',
            '.top-telemetry .lap',
            '.top-telemetry .timing',
          ])
            assert.ok(
              !overlaps(g['.race-devices'], g[selector]),
              `devices clear ${selector}`,
            );
          assert.ok(
            !overlaps(g['#race-roster'], g['.speed']),
            'roster clears speed',
          );
          // A native pointer sequence exercises the same capture/release path as touch.
          for (const [drive, key, active] of [
            ['throttle', 'throttle', 1],
            ['right', 'steer', 1],
            ['brake', 'brake', 1],
            ['boost', 'boost', true],
            ['airbrake', 'airbrake', true],
          ]) {
            const box = await page
              .locator(`[data-drive=${drive}]`)
              .boundingBox();
            assert.ok(box, `${drive} visible`);
            await page.mouse.move(
              box.x + box.width / 2,
              box.y + box.height / 2,
            );
            await page.mouse.down();
            await page.waitForTimeout(100);
            assert.equal(
              (await snapshot(page)).input[key],
              active,
              `${drive} held`,
            );
            await page.mouse.move(2, viewport.height / 2);
            await page.mouse.up();
            await page.waitForTimeout(60);
            assert.equal(
              (await snapshot(page)).input[key],
              typeof active === 'boolean' ? false : 0,
              `${drive} released outside`,
            );
          }
          await page.evaluate(() =>
            window.__VN.loadScenario('knot-tide-test', 47219),
          );
          await capture(page, item, 'tidal');
          if (!shape) {
            const g = await geometry(page);
            assert.ok(fits(g['.umbra-field'], g), 'tidal feedback fits');
            for (const other of [
              '#minimap',
              '.speed',
              '.energy',
              '.top-telemetry .position',
              '.top-telemetry .lap',
              '.top-telemetry .timing',
              '#touch',
              '.race-devices',
            ])
              assert.ok(
                !overlaps(g['.umbra-field'], g[other]),
                `tidal feedback clears ${other}`,
              );
          }
          const box = await page.locator('[data-drive=throttle]').boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.waitForTimeout(100);
          await page.keyboard.press('Escape');
          await page.mouse.up();
          const paused = await snapshot(page);
          assert.equal(
            paused.input.throttle,
            0,
            'pause releases pointer throttle',
          );
          await page.waitForTimeout(100);
          assert.equal(
            (await snapshot(page)).tick,
            paused.tick,
            'pause freezes ticks',
          );
          await page.locator('#resume').click();
          if (shape) {
            if (
              (await page
                .locator('#review-toggle')
                .getAttribute('aria-expanded')) !== 'true'
            )
              await page.locator('#review-toggle').click();
            await capture(page, item, 'review-open');
            assert.equal(
              await page
                .locator('#review-toggle')
                .getAttribute('aria-expanded'),
              'true',
            );
            await page.locator('[data-overview=top]').click();
            await capture(page, item, 'overview');
            await page.evaluate(() =>
              window.__VN.loadScenario('fold-descent', 47219),
            );
            if (
              (await page
                .locator('#review-toggle')
                .getAttribute('aria-expanded')) === 'true'
            )
              await page.locator('#review-toggle').click();
          } else {
            await page.evaluate(() =>
              window.__VN.loadScenario('fold-descent', 47219),
            );
          }
          await capture(page, item, 'fold');
          if (!shape) {
            await page.evaluate(() =>
              window.__VN.loadScenario('jump1-short', 47219),
            );
            await page.keyboard.down('s');
            await page.waitForFunction(
              () => window.__VN.getSnapshot().runtime.state.mode === 'recovery',
              null,
              { timeout: 12000 },
            );
            await page.keyboard.up('s');
            await capture(page, item, 'recovery-delay');
            await page.waitForFunction(
              () => window.__VN.getSnapshot().runtime.state.mode === 'magnetic',
              null,
              { timeout: 12000 },
            );
            await capture(page, item, 'recovery-notice');
            const g = await geometry(page);
            assert.ok(fits(g['#notice'], g), 'actual recovery notice fits');
            for (const other of ['#minimap', '.speed', '.energy', '#touch'])
              assert.ok(
                !overlaps(g['#notice'], g[other]),
                `recovery notice clears ${other}`,
              );
          }
          const s = await snapshot(page);
          assert.ok(
            [
              ...s.camera.position,
              ...s.camera.quaternion,
              ...s.ship.position,
            ].every(Number.isFinite),
            'finite camera/craft',
          );
          assert.ok(
            Math.abs(s.camera.playerScreenX) < 0.75,
            'craft inside horizontal safe frame',
          );
          assert.deepEqual(item.faults, []);
          item.status = 'pass';
        } catch (error) {
          item.status = 'fail';
          item.error = error.stack;
        } finally {
          await context.close();
          console.log(
            `${name}: ${item.status}${item.error ? ' ' + item.error.split('\n')[0] : ''}`,
          );
        }
      }
    }
  }
} finally {
  await browser.close();
  report.browser = 'CLOSED';
  await writeFile(
    resolve(output, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
}
if (report.cases.some((c) => c.status !== 'pass')) process.exitCode = 1;
