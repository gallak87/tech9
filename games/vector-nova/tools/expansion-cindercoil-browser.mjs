import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createCindercoilTrack } from '../src/levels/cindercoil/track/model.js';
const route = createCindercoilTrack();
const base = process.env.VN_URL;
if (!base)
  throw new Error(
    'Set VN_URL to the coordinated Cindercoil production preview.',
  );
const folder = resolve('.experiments/expansion/cindercoil/preflight');
await mkdir(folder, { recursive: true });
const report = {
  cases: [],
  errors: [],
  browserClosed: false,
  limitations: [
    'Hidden browser checks; foreground pacing, physical devices and independent audio listening remain unverified.',
  ],
};
const browser = await chromium.launch({
  headless: true,
  channel: process.env.VN_BROWSER_CHANNEL || 'chrome',
});
const snapshot = (page) => page.evaluate(() => window.__VN.getSnapshot());
const capture = async (page, name) => {
  const state = await snapshot(page);
  assert.deepEqual(state.errors, []);
  for (const values of [
    state.ship.position,
    state.ship.quaternion,
    state.camera.position,
    state.camera.up,
  ])
    assert.ok(values.every(Number.isFinite));
  const layout = await page.evaluate(() => {
    const notice = document.querySelector('.cindercoil-notice');
    if (!notice || getComputedStyle(notice).display === 'none')
      return { visible: false, conflicts: [] };
    const own = notice.getBoundingClientRect();
    const conflicts = [
      ...document.querySelectorAll(
        '.lap,.timing,#minimap,.speed,.energy,#shape-controls,#touch button,#notice',
      ),
    ]
      .filter((element) => {
        const r = element.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.height > 0 &&
          Math.min(own.right, r.right) - Math.max(own.left, r.left) > 0.5 &&
          Math.min(own.bottom, r.bottom) - Math.max(own.top, r.top) > 0.5
        );
      })
      .map((element) => element.id || element.className || element.textContent);
    return { visible: true, conflicts };
  });
  assert.deepEqual(layout.conflicts, [], `Cindercoil notice overlaps ${name}`);
  await page.screenshot({ path: `${folder}/${name}.png` });
  const metrics = await page.evaluate(() => window.__VN.getMetrics());
  report.cases.push({ name, state, metrics, layout });
  return state;
};
try {
  for (const config of [
    { id: 'high', quality: 'high', width: 1280, height: 800 },
    {
      id: 'low-reduced',
      quality: 'low',
      reducedMotion: true,
      width: 1280,
      height: 800,
    },
    { id: 'portrait', quality: 'high', width: 390, height: 844 },
    { id: 'landscape', quality: 'high', width: 844, height: 390 },
    { id: 'compact', quality: 'high', width: 640, height: 360 },
  ]) {
    const context = await browser.newContext({
      viewport: { width: config.width, height: config.height },
      deviceScaleFactor: 1,
    });
    await context.addInitScript(
      (settings) =>
        localStorage.setItem('vector-nova.settings', JSON.stringify(settings)),
      {
        quality: config.quality,
        reducedMotion: !!config.reducedMotion,
        volume: 0,
      },
    );
    const page = await context.newPage();
    page.on('pageerror', (error) => report.errors.push(error.message));
    await page.goto(`${base.replace(/\/$/, '')}/?level=cindercoil`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(
      () => window.__VN?.ready || document.querySelector('.failure'),
      null,
      { timeout: 120000 },
    );
    assert.equal(
      await page.locator('.failure').count(),
      0,
      await page.locator('.failure').allTextContents(),
    );
    await capture(page, `${config.id}-title`);
    await page.keyboard.press('Enter');
    const scenarios =
      config.id === 'high'
        ? [
            'ashgate-showcase',
            'ember-showcase',
            'teeth-showcase',
            'curtain-showcase',
            'coil-showcase',
            'coil-inverted',
            'vent-approach',
            'crown-showcase',
            'return-showcase',
            'rupture-near',
            'rupture-middle',
            'rupture-far',
          ]
        : config.id === 'low-reduced'
          ? [
              'ember-showcase',
              'coil-inverted',
              'rupture-near',
              'crown-showcase',
            ]
          : ['surge1-protected'];
    for (const name of scenarios) {
      await page.evaluate(
        (scenario) => window.__VN.loadScenario(scenario, 71),
        name,
      );
      await page.waitForTimeout(180);
      await capture(page, `${config.id}-${name}`);
    }
    if (config.id === 'high') {
      for (const [number, line] of [1, 2, 3].flatMap((number) =>
        ['protected', 'exposed'].map((line) => [number, line]),
      )) {
        await page.evaluate(
          (scenario) => window.__VN.loadScenario(scenario, 71),
          `surge${number}-${line}`,
        );
        await page.keyboard.down('w');
        await page.waitForTimeout(350);
        await page.keyboard.up('w');
        const state = await capture(page, `high-surge${number}-${line}-real-W`);
        if (line === 'protected')
          assert.equal(state.runtime.state.contactSeconds, 0);
        else assert.ok(state.runtime.state.contactSeconds > 0.15);
        await page.keyboard.press('Escape');
        const paused = await snapshot(page);
        await page.waitForTimeout(100);
        const still = await snapshot(page);
        assert.equal(still.vehicle.time, paused.vehicle.time);
        assert.deepEqual(still.runtime.state, paused.runtime.state);
        const replayed = await page.evaluate(() =>
          window.__VN.playReplay(window.__VN.getReplay()),
        );
        assert.deepEqual(replayed.runtime.state, paused.runtime.state);
      }
      await page.evaluate(() => window.__VN.loadScenario('coil-entry', 71));
      const coilDeadline = Date.now() + 18000;
      let coilState;
      while (Date.now() < coilDeadline) {
        coilState = await snapshot(page);
        if (coilState.vehicle.distance > route.landmarks.coil.end + 12) break;
        const vehicle = coilState.vehicle;
        const curvature = route.sample(vehicle.distance).curvature;
        const targetHeading = (curvature * vehicle.speed * 0.75) / 7.2;
        const desired = Math.max(
          -1,
          Math.min(
            1,
            (-curvature * vehicle.speed) / 1.5 +
              (vehicle.heading - targetHeading) * 1.7 +
              vehicle.lateral * 0.012 +
              vehicle.lateralSpeed * 0.007,
          ),
        );
        if (vehicle.speed < 65) {
          await page.keyboard.up('s');
          await page.keyboard.down('w');
        } else {
          await page.keyboard.up('w');
          if (vehicle.speed > 69) await page.keyboard.down('s');
          else await page.keyboard.up('s');
        }
        const key = desired > 0 ? 'd' : 'a';
        const duration = Math.round(Math.abs(desired) * 90);
        if (duration > 0) {
          await page.keyboard.down(key);
          await page.waitForTimeout(duration);
          await page.keyboard.up(key);
        }
        await page.waitForTimeout(Math.max(1, 90 - duration));
      }
      await page.keyboard.up('w');
      await page.keyboard.up('s');
      assert.ok(
        coilState.vehicle.distance > route.landmarks.coil.end,
        'real-key coil traversal reaches full roll exit',
      );
      await capture(page, 'high-coil-full-real-key-traversal');
      for (const phase of ['clean', 'erupting']) {
        await page.evaluate(
          (scenario) => window.__VN.loadScenario(scenario, 71),
          `vent-${phase}`,
        );
        await page.keyboard.down('w');
        await page.waitForTimeout(700);
        const flight = await capture(page, `high-vent-${phase}-airborne`);
        assert.equal(flight.runtime.state.flight.mode, 'flight');
        await page.waitForFunction(
          () =>
            window.__VN
              .getSnapshot()
              .events.some((event) => event.type === 'jump-transfer'),
          null,
          { timeout: 8000 },
        );
        await page.keyboard.up('w');
        const landed = await capture(page, `high-vent-${phase}-landing`);
        assert.equal(
          landed.events.find((event) => event.type === 'jump-transfer').payload
            .outcome,
          'landed',
        );
      }
      await page.evaluate(() => window.__VN.loadScenario('fast-corner', 71));
      await page.keyboard.down('w');
      await page.keyboard.down('a');
      await page.waitForTimeout(160);
      await page.keyboard.up('a');
      await page.keyboard.down('s');
      await page.waitForTimeout(260);
      await page.keyboard.up('s');
      await page.keyboard.up('w');
      await capture(page, 'high-hard-turn-steer-brake');
      for (const scenario of ['rupture-near', 'coil-showcase']) {
        await page.evaluate((name) => {
          window.__VN.loadScenario(name, 71);
          window.__VN.setCamera('vista');
        }, scenario);
        await page.waitForTimeout(180);
        await capture(page, `high-off-axis-${scenario}`);
      }
      await page.evaluate(() => window.__VN.overview('perspective'));
      await page.waitForTimeout(160);
      await capture(page, 'high-route-overview');
    }
    await context.close();
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
