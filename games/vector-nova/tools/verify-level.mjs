import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { loadLevel } from './level-checks/level-contract.mjs';

// An existing, coordinated preview is required. This harness never starts a
// server, records video, exposes a browser or drives a full lap.
const slug = process.argv[2];
const base = process.env.VN_URL;
if (!base || process.argv.length !== 3)
  throw new Error(
    'Usage: VN_URL=http://127.0.0.1:<port> npm run verify:level -- <slug>',
  );
const { metadata, createLevel } = await loadLevel(slug);
const output = resolve(
  process.env.VN_EVIDENCE || `.experiments/level-checks/${slug}`,
);
await mkdir(output, { recursive: true });
const report = {
  level: slug,
  base,
  headless: true,
  cases: [],
  failures: [],
  limitations: [
    'Short functional smoke check; no foreground pacing, art judgment, audio listening or physical input certification.',
    'Sampled route and authored scenery/jump clearance require their separate CPU checks.',
  ],
};
const browser = await chromium.launch({
  headless: true,
  ...(process.env.VN_BROWSER_PATH
    ? { executablePath: process.env.VN_BROWSER_PATH }
    : process.env.VN_BROWSER_CHANNEL
      ? { channel: process.env.VN_BROWSER_CHANNEL }
      : {}),
});
function urlFor({ shape = false, id = slug } = {}) {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('level', id);
  if (shape) url.searchParams.set('review', 'shape');
  return url.href;
}
const snapshot = (page) => page.evaluate(() => window.__VN.getSnapshot());
function finitePose(state) {
  for (const array of [
    state.ship.position,
    state.ship.quaternion,
    state.camera.position,
    state.camera.up,
    state.trackFrame.position,
    state.trackFrame.up,
    state.trackFrame.tangent,
  ])
    assert.ok(
      array.every(Number.isFinite),
      'non-finite ship, camera or route pose',
    );
  for (const key of ['distance', 'lateral', 'speed', 'heading', 'time'])
    assert.ok(Number.isFinite(state.vehicle[key]), `non-finite vehicle ${key}`);
  assert.deepEqual(state.errors, []);
  assert.equal(state.handling.steeringAssist, 0.3);
}
let assetForFailure;
try {
  for (const shape of metadata.shape ? [false, true] : [false]) {
    const expected = await (await createLevel({ shape })).createTrack();
    for (const quality of ['high', 'low']) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
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
        const faults = [],
          requests = [];
        const result = {
          shape,
          quality,
          reducedMotion: quality === 'low',
          requests,
          faults,
          status: 'running',
        };
        report.cases.push(result);
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
        await page.goto(urlFor({ shape }), { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(
          () => window.__VN?.ready || document.querySelector('.failure'),
          null,
          { timeout: 120000 },
        );
        assert.equal(
          await page.locator('.failure').count(),
          0,
          `level boot failed: ${await page.locator('.failure').allTextContents()}`,
        );
        const initial = await snapshot(page);
        finitePose(initial);
        assert.equal(
          initial.track.id,
          expected.id,
          'served circuit differs from the local module',
        );
        assert.ok(
          Math.abs(initial.track.length - expected.length) < 1e-5,
          'served route length differs from the local module',
        );
        assert.equal(initial.settings.quality, quality);
        assert.equal(initial.settings.reducedMotion, quality === 'low');
        await page.locator('#start').click();
        await page.keyboard.down('w');
        await page.waitForFunction(() => window.__VN.getSnapshot().tick >= 20);
        await page.keyboard.up('w');
        await page.keyboard.press('Escape');
        await page.waitForFunction(
          () => window.__VN.getSnapshot().mode === 'paused',
        );
        const paused = await snapshot(page);
        finitePose(paused);
        assert.ok(paused.tick >= 20);
        assert.equal(paused.input.throttle, 0);
        await page.waitForTimeout(100);
        const still = await snapshot(page);
        assert.equal(still.tick, paused.tick, 'pause advanced ticks');
        assert.equal(
          still.vehicle.time,
          paused.vehicle.time,
          'pause advanced simulation time',
        );
        const metrics = await page.evaluate(() => window.__VN.getMetrics());
        assert.ok(
          metrics.frames > 0,
          'renderer did not record displayed frames',
        );
        const replayed = await page.evaluate(() => {
          const replay = window.__VN.getReplay();
          return window.__VN.playReplay(replay);
        });
        assert.equal(replayed.tick, paused.tick);
        for (const key of [
          'distance',
          'lateral',
          'speed',
          'heading',
          'time',
          'energy',
        ])
          assert.ok(
            Math.abs(replayed.vehicle[key] - paused.vehicle[key]) < 1e-8,
            `replay differs: ${key}`,
          );
        if (metadata.review) {
          await page.evaluate(() => window.__VN.overview('top'));
          await page.waitForTimeout(75);
          finitePose(await snapshot(page));
        }
        const reset = await page.evaluate(() => {
          window.__VN.restart();
          window.__VN.pause();
          return window.__VN.getSnapshot();
        });
        assert.equal(reset.tick, 0);
        assert.equal(reset.vehicle.time, 0);
        finitePose(reset);
        const beforeDispose = reset.tick;
        await page.evaluate(() => {
          window.__VN.dispose();
          window.__VN.dispose();
        });
        await page.waitForTimeout(75);
        assert.equal(await page.evaluate(() => window.__VN.ready), false);
        assert.equal(await page.locator('canvas#world').count(), 0);
        assert.equal((await snapshot(page)).tick, beforeDispose);
        assert.deepEqual(faults, []);
        assetForFailure ||= requests.find((url) =>
          /\/assets\/ships\/.*\.glb(?:\?|$)/.test(url),
        );
        Object.assign(result, {
          shape,
          quality,
          reducedMotion: quality === 'low',
          ticks: paused.tick,
          trackId: initial.track.id,
          metrics,
          requests: [...new Set(requests)],
          status: 'pass',
        });
        console.log(
          `${slug}: ${shape ? 'shape' : 'production'} ${quality} passed`,
        );
      } finally {
        await context.close();
      }
    }
  }
  // Unknown selection must fail visibly before a renderer survives boot.
  for (const failure of ['unknown-level', 'asset-load']) {
    if (failure === 'asset-load' && !assetForFailure)
      throw new Error(
        'No owned ship asset observed for the failure-cleanup check',
      );
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    try {
      const page = await context.newPage();
      if (failure === 'asset-load')
        await page.route(assetForFailure, (route) => route.abort('failed'));
      await page.goto(
        urlFor({
          id: failure === 'unknown-level' ? 'contract-missing-level' : slug,
        }),
        { waitUntil: 'domcontentloaded' },
      );
      await page
        .locator('.failure')
        .waitFor({ state: 'visible', timeout: 120000 });
      assert.ok(await page.locator('.failure p').textContent());
      assert.equal(await page.locator('.failure button').count(), 2);
      assert.equal(
        await page.locator('canvas#world').count(),
        0,
        'failed boot retained a renderer canvas',
      );
      assert.equal(await page.evaluate(() => !!window.__VN?.ready), false);
      report.failures.push({ case: failure, status: 'pass' });
    } finally {
      await context.close();
    }
  }
} catch (error) {
  report.error = error.stack;
  process.exitCode = 1;
  console.error(error.message);
} finally {
  await browser.close();
  await writeFile(
    resolve(output, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(`Report: ${resolve(output, 'report.json')}`);
}
