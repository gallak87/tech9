import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.VN_URL;
if (!base)
  throw new Error(
    'Use VN_URL=http://127.0.0.1:<port>/ node tools/racing-verify.mjs',
  );
const slugs = (
  process.env.VN_LEVELS ?? 'halcyon,orbital,vesper,glasswake,cindercoil,nacre'
).split(',');
const smokeOnly = process.env.VN_SMOKE_ONLY === '1';
const output = resolve(process.env.VN_EVIDENCE ?? '.experiments/shared-racing');
await mkdir(output, { recursive: true });
const report = { base, cases: [] };
const browser = await chromium.launch({
  headless: true,
  ...(process.env.VN_BROWSER_PATH
    ? { executablePath: process.env.VN_BROWSER_PATH }
    : { channel: 'chrome' }),
  args: ['--mute-audio', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const snapshot = (page) => page.evaluate(() => window.__VN.getSnapshot());
async function boot(context, slug, faults, requests) {
  const page = await context.newPage();
  page.on('pageerror', (error) => faults.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') faults.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      faults.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', (request) =>
    faults.push(`${request.failure()?.errorText} ${request.url()}`),
  );
  page.on('request', (request) => requests.push(request.url()));
  const url = new URL(base);
  url.searchParams.set('level', slug);
  await page.goto(url.href);
  await page.waitForFunction(
    () => window.__VN?.ready || document.querySelector('.failure'),
    null,
    { timeout: 45000 },
  );
  assert.equal(await page.locator('.failure').count(), 0, `boot ${slug}`);
  const initial = await snapshot(page);
  assert.deepEqual(initial.errors, []);
  assert.ok(
    !requests.some((url) => /\/assets\/(level3|sky|orbital)\//.test(url)),
    'no legacy asset requests',
  );
  const pathname = new URL(base).pathname;
  assert.ok(
    requests
      .filter((url) => url.includes('/assets/'))
      .every((url) => new URL(url).pathname.startsWith(`${pathname}assets/`)),
    'asset deployment base',
  );
  return page;
}
async function acquire(page, id, kind) {
  await page.evaluate((id) => window.__VN.loadScenario(id), id);
  await page.keyboard.down('KeyW');
  try {
    await page.waitForFunction(
      (kind) => {
        const effects = window.__VN.getSnapshot().runtime.state;
        return kind === 'vector'
          ? effects.vectorActive
          : effects.aegisRemaining > 0;
      },
      kind,
      { timeout: 15000, polling: 'raf' },
    );
  } finally {
    await page.keyboard.up('KeyW');
  }
}
async function hudBounds(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    return {
      device: rect('.race-devices'),
      roster: rect('#race-roster'),
      map: rect('#minimap'),
      energy: rect('.energy'),
      speed: rect('.speed'),
      telemetry: rect('.top-telemetry'),
      touch: rect('#touch'),
      width: innerWidth,
      height: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}
const overlaps = (a, b) =>
  a.width > 0 &&
  b.width > 0 &&
  a.left < b.right &&
  a.right > b.left &&
  a.top < b.bottom &&
  a.bottom > b.top;
function fits(rect, geometry) {
  return (
    rect.left >= 0 &&
    rect.right <= geometry.width &&
    rect.top >= 0 &&
    rect.bottom <= geometry.height
  );
}
async function checkCase(slug, quality, viewport, mobile = false) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    ...(mobile ? { isMobile: true, hasTouch: true } : {}),
  });
  const faults = [],
    requests = [];
  const entry = {
    slug,
    quality,
    viewport,
    mobile,
    status: 'running',
    requests,
    faults,
  };
  report.cases.push(entry);
  try {
    await context.addInitScript(
      ({ quality }) =>
        localStorage.setItem(
          'vector-nova.settings',
          JSON.stringify({
            quality,
            reducedMotion: quality === 'low',
            volume: 0,
            difficulty: 'medium',
          }),
        ),
      { quality },
    );
    const page = await boot(context, slug, faults, requests);
    const competitive = slug !== 'nacre';
    assert.equal(
      await page.locator('#difficulty').count(),
      competitive ? 1 : 0,
    );
    assert.equal(
      await page.locator('.race-devices').count(),
      competitive ? 1 : 0,
    );
    if (!smokeOnly) {
      await page.locator('#start').click();
      await page.evaluate(() => window.__VN.pause());
      const grid = await snapshot(page);
      if (competitive) {
        assert.equal(grid.competition.standings.length, 4);
        assert.equal(grid.competition.difficulty, 'medium');
        assert.equal(grid.competition.elapsed, 0);
        await page.evaluate(() => window.__VN.resume());
        await page.waitForFunction(
          () => window.__VN.getSnapshot().mode === 'racing',
          null,
          { timeout: 10000 },
        );
        const geometry = await hudBounds(page);
        assert.ok(
          fits(geometry.roster, geometry) && !geometry.overflow,
          'live roster fits viewport',
        );
        for (const other of ['map', 'speed', 'touch'])
          assert.ok(
            !overlaps(geometry.roster, geometry[other]),
            `live roster clears ${other}`,
          );
        assert.ok(
          !overlaps(geometry.device, geometry.telemetry),
          'device HUD clears lap telemetry',
        );
        if (quality === 'high' || mobile)
          await page.screenshot({
            path: resolve(
              output,
              `${slug}-${mobile ? 'mobile' : 'desktop'}-${viewport.width}-race.png`,
            ),
          });
        await page.keyboard.down('KeyW');
        await page.waitForFunction(
          () => window.__VN.getSnapshot().vehicle.distance > 5,
          null,
          { timeout: 15000 },
        );
        await page.keyboard.up('KeyW');
        await page.evaluate(() => window.__VN.pause());
        const replay = await page.evaluate(() => {
          const before = window.__VN.getSnapshot();
          const log = window.__VN.getReplay();
          const after = window.__VN.playReplay(log);
          const invalid = structuredClone(log);
          invalid.initial.vehicle.energy -= 1;
          let rejected = false;
          try {
            window.__VN.playReplay(invalid);
          } catch {
            rejected = true;
          }
          const retained = window.__VN.getSnapshot();
          return { before, after, retained, rejected };
        });
        for (const key of ['vehicle', 'competition']) {
          assert.deepEqual(
            replay.after[key],
            replay.before[key],
            `${slug}: competitive replay ${key}`,
          );
          assert.deepEqual(
            replay.retained[key],
            replay.after[key],
            `${slug}: rejected replay preserves ${key}`,
          );
        }
        assert.deepEqual(
          replay.after.runtime.state,
          replay.before.runtime.state,
        );
        assert.equal(replay.rejected, true);
        const { createHalcyonDevices, createDevices } = await import(
          `../src/levels/${slug}/devices.js`
        );
        // The live track is represented by the local pure factory for the plan.
        const factoryNames = {
          halcyon: 'createTrack',
          orbital: 'createLevel2Track',
          vesper: 'createVesperTrack',
          glasswake: 'createGlasswakeTrack',
          cindercoil: 'createCindercoilTrack',
        };
        const track = (await import(`../src/levels/${slug}/track/model.js`))[
          factoryNames[slug]
        ]();
        const devices = (createDevices ?? createHalcyonDevices)(track);
        await acquire(
          page,
          devices.find((device) => device.type === 'vector').id,
          'vector',
        );
        assert.equal(
          (await snapshot(page)).competition.enabled,
          false,
          'section practice remains solo',
        );
        if (quality === 'low')
          assert.equal(
            (await page.evaluate(() => window.__VN.getMetrics())).pipeline
              .racingBlurStrength,
            0,
            'reduced motion',
          );
        else
          assert.ok(
            (await page.evaluate(() => window.__VN.getMetrics())).pipeline
              .racingBlurStrength > 0,
            'shared launch blur',
          );
        await acquire(
          page,
          devices.find((device) => device.type === 'aegis').id,
          'aegis',
        );
        assert.ok((await snapshot(page)).runtime.state.aegisRemaining > 0);
        if (mobile) {
          const geometry = await hudBounds(page);
          assert.ok(
            fits(geometry.device, geometry) &&
              geometry.device.bottom < geometry.touch.top &&
              !geometry.overflow,
            'device HUD fits and clears touch controls',
          );
          assert.ok(
            !overlaps(geometry.device, geometry.energy),
            'active device HUD clears reserve telemetry',
          );
        }
      } else {
        assert.equal(grid.competition, null, 'Nacre gameplay remains deferred');
        await page.evaluate(() => window.__VN.resume());
      }
      if (quality === 'high' || mobile)
        await page.screenshot({
          path: resolve(
            output,
            `${slug}-${mobile ? 'mobile' : 'desktop'}-${viewport.width}-${quality}.png`,
          ),
        });
      await page.evaluate(() => {
        window.__VN.dispose();
        window.__VN.dispose();
      });
      assert.equal(
        await page.locator('.race-devices').count(),
        0,
        'owned device HUD disposed',
      );
    }
    assert.deepEqual(faults, []);
    entry.status = 'passed';
    console.log(
      `${slug}: ${mobile ? 'mobile' : 'desktop'} ${quality} ${viewport.width} passed`,
    );
  } finally {
    await context.close();
  }
}
try {
  for (const slug of slugs)
    for (const quality of smokeOnly ? ['low'] : ['high', 'low'])
      await checkCase(slug, quality, { width: 1280, height: 720 });
  if (!smokeOnly) {
    // Mobile is the final rendering pass after all desktop checks.
    for (const slug of slugs)
      await checkCase(slug, 'low', { width: 390, height: 844 }, true);
    for (const slug of slugs)
      await checkCase(slug, 'low', { width: 844, height: 390 }, true);
  }
} catch (error) {
  report.failure = error.stack;
  throw error;
} finally {
  await writeFile(
    resolve(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
