import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createVesperTrack } from '../src/levels/vesper/track/model.js';

// Invoked only under the integrator's exclusive GPU lease. Never starts a server.
const url = process.env.VN_URL;
if (!url)
  throw new Error(
    'VN_URL must identify the integrator-started Vesper production preview',
  );
const out = resolve(
  process.env.VN_EVIDENCE || '.experiments/expansion/vesper/builder',
);
await mkdir(out, { recursive: true });
const track = createVesperTrack();
const browser = await chromium.launch({ headless: true });
const deadline = setTimeout(
  () => void browser.close(),
  Number(process.env.VN_CAPTURE_TIMEOUT_MS || 210000),
);
const report = {
  url,
  headless: true,
  stills: [],
  drives: [],
  errors: [],
  metrics: [],
  limitations: [
    'Headless timing is not foreground pacing. No independent listening or physical device test.',
  ],
};
const held = new Set();
async function setKeys(page, keys) {
  for (const key of held)
    if (!keys.includes(key)) {
      await page.keyboard.up(key);
      held.delete(key);
    }
  for (const key of keys)
    if (!held.has(key)) {
      await page.keyboard.down(key);
      held.add(key);
    }
}
const snapshot = (page) => page.evaluate(() => window.__VN.getSnapshot());
async function load(page, scenario, paused = false) {
  await setKeys(page, []);
  await page.evaluate(
    ({ name, paused }) => {
      window.__VN.loadScenario(name, 47219);
      if (paused) window.__VN.pause();
    },
    { name: scenario, paused },
  );
  await page.waitForTimeout(220);
}
try {
  for (const quality of ['high', 'low']) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    await context.addInitScript(
      (settings) =>
        localStorage.setItem('vector-nova.settings', JSON.stringify(settings)),
      { quality, reducedMotion: quality === 'low', volume: 0 },
    );
    const page = await context.newPage();
    page.on('pageerror', (e) => report.errors.push(e.message));
    page.on('console', (message) => {
      if (message.type() === 'error') report.errors.push(message.text());
    });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__VN?.ready, null, {
      timeout: 120000,
    });
    for (const scenario of [
      'saplight-showcase',
      'pillar-showcase',
      'spiral-climb',
      'crown-showcase',
      'bloom-showcase',
      'creature-event',
      'rootfall-showcase',
      'vault-showcase',
      'dawnscar-showcase',
    ]) {
      await load(page, scenario);
      const path = resolve(out, `${quality}-${scenario}.png`);
      await page.screenshot({ path });
      report.stills.push({
        quality,
        scenario,
        path,
        snapshot: await snapshot(page),
      });
    }
    report.metrics.push({
      quality,
      viewport: 'desktop',
      metrics: await page.evaluate(() => window.__VN.getMetrics()),
    });
    if (quality === 'low') {
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
        { width: 640, height: 360 },
      ]) {
        await page.setViewportSize(viewport);
        await load(page, 'crown-showcase');
        const path = resolve(
          out,
          `${viewport.width}x${viewport.height}-crown.png`,
        );
        await page.screenshot({ path });
        report.stills.push({
          quality,
          viewport,
          path,
          snapshot: await snapshot(page),
        });
      }
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    if (quality === 'low' && process.argv.includes('--drive')) {
      for (const probe of [
        {
          scenario: 'trunk-entry',
          seconds: 22,
          targetSpeed: 40,
          targetLateral: 0,
        },
        {
          scenario: 'crown-runup',
          seconds: 5,
          targetSpeed: 140,
          targetLateral: 0,
          boost: true,
        },
        {
          scenario: 'crown-fast',
          seconds: 4,
          targetSpeed: 112,
          targetLateral: 0,
        },
        {
          scenario: 'crown-imperfect',
          seconds: 5,
          targetSpeed: 72,
          targetLateral: 0,
        },
        {
          scenario: 'branch-runup',
          seconds: 4,
          targetSpeed: 105,
          targetLateral: 8.5,
        },
        {
          scenario: 'sap-compare',
          seconds: 3,
          targetSpeed: 0,
          targetLateral: 2,
          coast: true,
        },
        {
          scenario: 'resin-compare',
          seconds: 3,
          targetSpeed: 0,
          targetLateral: -5,
          coast: true,
        },
        {
          scenario: 'creature-event',
          seconds: 6,
          targetSpeed: 58,
          targetLateral: 0,
        },
        {
          scenario: 'impact',
          seconds: 1.4,
          targetSpeed: 85,
          targetLateral: -13,
          impact: true,
        },
        {
          scenario: 'root-descent',
          seconds: 9,
          targetSpeed: 48,
          targetLateral: 4.5,
        },
      ]) {
        await load(page, probe.scenario, true);
        const initial = await snapshot(page);
        const samples = [];
        await page.evaluate(() => window.__VN.resume());
        const endTick = initial.tick + probe.seconds * 120;
        while (true) {
          const state = await snapshot(page);
          samples.push({
            tick: state.tick,
            vehicle: state.vehicle,
            motion: state.runtime.state.mode,
          });
          if (state.tick >= endTick) break;
          const v = state.vehicle,
            f = track.sample(v.distance);
          const desiredHeading =
            Math.asin(
              Math.max(
                -0.5,
                Math.min(0.5, (f.curvature * v.speed * 0.75) / 7.2),
              ),
            ) -
            (v.lateral - probe.targetLateral) * 0.02;
          const desired =
            -(
              f.curvature * v.speed * 0.7 +
              (desiredHeading - v.heading) * 2.5
            ) / 1.05;
          const keys = [];
          if (!probe.coast) {
            if (v.speed < probe.targetSpeed - 1) keys.push('w');
            else if (v.speed > probe.targetSpeed + 3) keys.push('s');
          }
          if (probe.boost && !keys.includes('s')) {
            if (!keys.includes('w')) keys.push('w');
            keys.push('Shift');
          }
          if (desired > 0.12) keys.push('d');
          else if (desired < -0.12) keys.push('a');
          await setKeys(page, probe.impact ? ['w', 'd'] : keys);
          await page.waitForFunction(
            (t) => window.__VN.getSnapshot().tick >= t,
            state.tick + 8,
            { timeout: 15000 },
          );
        }
        await setKeys(page, []);
        await page.keyboard.press('Escape');
        const final = await snapshot(page);
        const replay = await page.evaluate(() => window.__VN.getReplay());
        const replayed = await page.evaluate(
          (r) => window.__VN.playReplay(r),
          replay,
        );
        const replayState = await snapshot(page);
        report.drives.push({
          probe,
          initial,
          final,
          samples,
          inputCount: replay.inputs.length,
          replayReturned: !!replayed,
          replayVehicle: replayState.vehicle,
        });
      }
      report.metrics.push({
        quality,
        stage: 'driving',
        metrics: await page.evaluate(() => window.__VN.getMetrics()),
      });
    }
    await context.close();
  }
} finally {
  clearTimeout(deadline);
  await browser.close();
  report.browserClosed = true;
  console.log('BROWSER CLOSED');
  await writeFile(
    resolve(out, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
}
console.log(
  JSON.stringify(
    {
      stills: report.stills.length,
      drives: report.drives.map((d) => ({
        scenario: d.probe.scenario,
        start: d.initial.vehicle.distance,
        end: d.final.vehicle.distance,
        events: d.final.events.map((e) => e.type),
        speed: d.final.vehicle.speed,
        inputs: d.inputCount,
      })),
      errors: report.errors,
      metrics: report.metrics,
      output: out,
    },
    null,
    2,
  ),
);
