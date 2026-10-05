import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.VN_URL || 'http://127.0.0.1:5192/';
const output = path.resolve(
  process.env.VN_EVIDENCE || '.experiments/gate4-1/feel-storm',
);
await mkdir(output, { recursive: true });
const report = { checks: [], errors: [], views: [], traces: [] };
const check = (name, pass, detail) =>
  report.checks.push({ name, pass, detail });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--mute-audio', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
page.on('pageerror', (error) => report.errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') report.errors.push(message.text());
});
page.on('response', (response) => {
  if (response.status() >= 400)
    report.errors.push(`${response.status()} ${response.url()}`);
});
const snap = () => page.evaluate(() => window.__VN.getSnapshot());
const load = (name) =>
  page.evaluate((n) => window.__VN.loadScenario(n, 47219), name);
const wait = (predicate) =>
  page.waitForFunction(predicate, undefined, {
    timeout: 15000,
    polling: 'raf',
  });
const capture = async (name) => {
  await page.screenshot({ path: path.join(output, name + '.png') });
  report.views.push({
    name,
    state: await snap(),
    metrics: await page.evaluate(() => window.__VN.getMetrics()),
  });
};
async function settings(quality, reducedMotion, volume = '0.35') {
  await page.evaluate(() => window.__VN.pause());
  await page.locator('#quality').selectOption(quality);
  await page.locator('#motion').setChecked(reducedMotion);
  await page.locator('#volume').focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < Math.round(Number(volume) / 0.05); i += 1)
    await page.keyboard.press('ArrowRight');
  await page.locator('#resume').click();
}
try {
  await page.goto(base + '?level=nacre');
  await page.waitForFunction(() => window.__VN?.ready, undefined, {
    timeout: 90000,
  });
  report.build = await page.locator('script[type=module]').getAttribute('src');
  report.stylesheets = await page
    .locator('link[rel=stylesheet]')
    .evaluateAll((links) => links.map((link) => link.href));
  check(
    'title has no storm flash or underwater grade',
    !(await snap()).environment.storm.stormEnabled &&
      (await snap()).environment.immersion.opacity === 0,
  );
  await page.locator('#start').click();
  for (const quality of ['high', 'low']) {
    await settings(quality, false);
    await load('storm-showcase');
    const before = (await snap()).environment.thunder.triggerCount;
    await wait(
      () =>
        window.__VN.getSnapshot().environment.storm.lightningIntensity > 0.1,
    );
    await capture('lightning-' + quality);
    await wait(
      () => window.__VN.getSnapshot().environment.thunder.activeVoices > 0,
    );
    const storm = await snap();
    check(
      `${quality} early visible bolt and restrained flash`,
      storm.vehicle.time < 4 &&
        storm.environment.storm.lightningIntensity > 0 &&
        storm.environment.immersion.flash > 0 &&
        storm.environment.immersion.flash <= 0.0321,
      storm.environment.storm,
    );
    check(
      `${quality} thunder triggers once through existing master bus`,
      storm.environment.thunder.triggerCount === before + 1 &&
        storm.environment.thunder.lastGain <= 0.32,
      storm.environment.thunder,
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);
    const paused = await snap();
    await page.waitForTimeout(220);
    const frozen = await snap();
    check(
      `${quality} pause freezes lightning and stops thunder`,
      paused.environment.storm.elapsed === frozen.environment.storm.elapsed &&
        paused.environment.storm.lightningIntensity ===
          frozen.environment.storm.lightningIntensity &&
        frozen.environment.thunder.activeVoices === 0,
    );
    await page.locator('#resume').click();
    await wait(
      () => window.__VN.getSnapshot().environment.storm.lightningAge > 1,
    );
    check(
      `${quality} resume does not duplicate thunder`,
      (await snap()).environment.thunder.triggerCount === before + 1,
    );
  }
  await settings('low', true);
  await load('storm-showcase');
  const reducedBefore = (await snap()).environment.thunder.triggerCount;
  await wait(() => window.__VN.getSnapshot().vehicle.time > 3.6);
  let state = await snap();
  check(
    'reduced motion suppresses bolts, flash and thunder',
    state.environment.storm.lightningIntensity === 0 &&
      state.environment.immersion.flash === 0 &&
      state.environment.thunder.triggerCount === reducedBefore,
  );
  await settings('high', false, '0');
  await load('storm-showcase');
  const mutedBefore = (await snap()).environment.thunder.triggerCount;
  await wait(() => window.__VN.getSnapshot().vehicle.time > 3.6);
  state = await snap();
  check(
    'muted storm never starts a thunder voice',
    state.environment.thunder.triggerCount === mutedBefore &&
      state.environment.thunder.activeVoices === 0,
  );

  for (const quality of ['high', 'low']) {
    await settings(quality, false);
    await load('surface-entry-fast');
    await page.keyboard.down('KeyW');
    await wait(
      () => window.__VN.getSnapshot().environment.water.activeSplashCount > 0,
    );
    await capture('larger-splash-' + quality);
    await wait(
      () => window.__VN.getSnapshot().environment.immersion.opacity > 0.38,
    );
    await capture('immersed-world-ship-hud-' + quality);
    await page.keyboard.up('KeyW');
    const grade = await page.locator('.nacre-immersion').evaluate((el) => {
      const style = getComputedStyle(el),
        bounds = el.getBoundingClientRect();
      return {
        opacity: Number(style.opacity),
        blend: style.mixBlendMode,
        pointerEvents: style.pointerEvents,
        z: Number(style.zIndex),
        width: bounds.width,
        height: bounds.height,
      };
    });
    check(
      `${quality} immersion grades the full scene and HUD without blocking controls`,
      grade.opacity > 0.38 &&
        grade.opacity <= 0.5 &&
        grade.blend === 'multiply' &&
        grade.pointerEvents === 'none' &&
        grade.z > 20 &&
        grade.width === 1440 &&
        grade.height === 900,
      grade,
    );
    await load('staging');
    await wait(
      () => window.__VN.getSnapshot().environment.immersion.opacity === 0,
    );
    check(
      `${quality} reset clears underwater tint`,
      (await snap()).environment.immersion.opacity === 0,
    );
  }
  await settings('high', false);
  for (let jump = 1; jump <= 2; jump += 1) {
    await load(`jump${jump}-approach`);
    await page.evaluate(() => {
      window.__feelTrace = [];
      window.__feelTracing = true;
      const sample = () => {
        if (!window.__feelTracing) return;
        const s = window.__VN.getSnapshot();
        window.__feelTrace.push({
          time: s.vehicle.time,
          phase: s.runtime.state.mode,
          screenX: s.camera.playerScreenX,
          lateral: s.vehicle.lateral,
          position: s.ship.position,
          quaternion: s.ship.quaternion,
        });
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    await wait(() =>
      window.__VN.getSnapshot().events.some((e) => e.type === 'jump-transfer'),
    );
    await page.waitForTimeout(500);
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    await capture(`jump${jump}-settled`);
    const trace = await page.evaluate(() => {
      window.__feelTracing = false;
      return window.__feelTrace;
    });
    const transitions = [];
    for (let i = 1; i < trace.length; i += 1)
      if (trace[i].phase !== trace[i - 1].phase) {
        const dt = trace[i].time - trace[i - 1].time;
        transitions.push({
          from: trace[i - 1].phase,
          to: trace[i].phase,
          dt,
          screenStep: Math.abs(trace[i].screenX - trace[i - 1].screenX),
          lateral: trace[i].lateral,
        });
      }
    state = await snap();
    check(
      `jump${jump} aligned real-key approach still lands`,
      state.events.some(
        (e) => e.type === 'jump-transfer' && e.payload.outcome === 'landed',
      ),
    );
    check(
      `jump${jump} takeoff and landing have no sideways screen snap`,
      transitions.length === 2 &&
        transitions.every((t) => t.dt <= 0.06 && t.screenStep < 0.025),
      transitions,
    );
    report.traces.push({ jump, transitions, trace });
  }
  for (const query of ['', '?level=orbital', '?level=nacre&review=shape']) {
    await page.goto(base + query);
    await page.waitForFunction(() => window.__VN?.ready, undefined, {
      timeout: 90000,
    });
    check(
      `${query || 'Halcyon'} does not mount immersion or storm overlays`,
      (await page.locator('.nacre-immersion, .nacre-storm-flash').count()) ===
        0,
    );
  }
} catch (error) {
  report.errors.push(error.stack || String(error));
} finally {
  await browser.close();
  report.browserClosed = true;
  report.passed =
    report.errors.length === 0 && report.checks.every((c) => c.pass);
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify(
      {
        build: report.build,
        stylesheets: report.stylesheets,
        passed: report.passed,
        checks: report.checks.length,
        failures: report.checks.filter((c) => !c.pass),
        errors: report.errors,
        browserClosed: true,
      },
      null,
      2,
    ),
  );
  if (!report.passed) process.exitCode = 1;
}
