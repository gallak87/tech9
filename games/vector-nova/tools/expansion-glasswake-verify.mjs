import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.VN_URL;
if (!base)
  throw new Error(
    'VN_URL is required; use this worktree’s production preview.',
  );
const out = resolve(
  process.env.VN_EVIDENCE || '.experiments/expansion/glasswake/verification',
);
await mkdir(out, { recursive: true });
const report = {
  checks: [],
  views: [],
  faults: [],
  headless: true,
  timingsAreForegroundEvidence: false,
};
const browser = await chromium.launch({
  headless: true,
  channel: process.env.VN_BROWSER_CHANNEL || 'chrome',
  args: ['--mute-audio'],
});
const check = (name, pass, detail) => {
  report.checks.push({ name, pass, detail });
  if (!pass) process.exitCode = 1;
};
try {
  for (const quality of ['high', 'low']) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    try {
      await context.addInitScript(
        (quality) =>
          localStorage.setItem(
            'vector-nova.settings',
            JSON.stringify({
              quality,
              reducedMotion: quality === 'low',
              volume: 0,
            }),
          ),
        quality,
      );
      const page = await context.newPage();
      page.on('pageerror', (error) => report.faults.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') report.faults.push(message.text());
      });
      await page.goto(`${base}?level=glasswake`);
      await page.waitForFunction(() => window.__VN?.ready, null, {
        timeout: 120000,
      });
      console.log(`${quality}: production ready`);
      report.build = await page
        .locator('script[type=module]')
        .getAttribute('src');
      report.css = await page
        .locator('link[rel=stylesheet]')
        .getAttribute('href');
      const snap = () => page.evaluate(() => window.__VN.getSnapshot());
      const load = async (name) => {
        await page.evaluate((name) => {
          window.__VN.loadScenario(name);
          window.__VN.start();
          window.__VN.pause();
        }, name);
        await page.waitForTimeout(120);
      };
      const capture = async (name) => {
        await page.locator('#pause-panel').evaluate((node) => {
          node.style.visibility = 'hidden';
        });
        await page.screenshot({ path: resolve(out, `${quality}-${name}.png`) });
        await page.locator('#pause-panel').evaluate((node) => {
          node.style.visibility = '';
        });
        report.views.push({
          quality,
          name,
          snapshot: await snap(),
          metrics: await page.evaluate(() => window.__VN.getMetrics()),
        });
      };
      for (const name of [
        'berth-showcase',
        'mouth-showcase',
        'gallery-showcase',
        'fracture-showcase',
        'rim-showcase',
        'chasm-showcase',
        'return-showcase',
        'hardest-turn',
        'calving-approach',
        'calving-departure',
        'crevice-dive',
        'corkscrew-inverted',
        'crevice-floor',
        'crevice-ascent',
        'blizzard-rim',
      ]) {
        const names = (await snap()).track.scenarios;
        if (!names.includes(name)) continue;
        await load(name);
        await page.evaluate(() => window.__VN.resume());
        await page.keyboard.down('KeyW');
        const tick = (await snap()).tick;
        await page.waitForFunction(
          (tick) => window.__VN.getSnapshot().tick >= tick + 12,
          tick,
          { timeout: 20000 },
        );
        await page.keyboard.up('KeyW');
        await page.evaluate(() => window.__VN.pause());
        await capture(name);
      }
      console.log(
        `${quality}: section views complete; checking fracture flights`,
      );
      for (const index of [1, 2]) {
        for (const mode of quality === 'high'
          ? ['success', 'short', 'approach']
          : ['success', 'short']) {
          console.log(`${quality}: jump${index}-${mode}`);
          await load(`jump${index}-${mode}`);
          await page.evaluate(() => window.__VN.resume());
          await page.keyboard.down(mode === 'short' ? 'KeyS' : 'KeyW');
          if (mode === 'approach') await page.keyboard.down('ShiftLeft');
          await page.waitForFunction(
            () =>
              window.__VN
                .getSnapshot()
                .events.some((e) => e.type === 'jump-launch'),
            null,
            { timeout: 20000 },
          );
          await capture(`jump${index}-${mode}-flight`);
          await page.waitForFunction(
            () =>
              window.__VN
                .getSnapshot()
                .events.some((e) => e.type === 'jump-transfer'),
            null,
            { timeout: 25000 },
          );
          await page.keyboard.up(mode === 'short' ? 'KeyS' : 'KeyW');
          await page.keyboard.up('ShiftLeft');
          await page.evaluate(() => window.__VN.pause());
          const state = await snap();
          const event = state.events.find((e) => e.type === 'jump-transfer');
          check(
            `${quality} jump${index} ${mode}`,
            event?.payload.outcome ===
              (mode === 'short' ? 'recovered' : 'landed'),
            event,
          );
          const replay = await page.evaluate(() => window.__VN.getReplay());
          const replayed = await page.evaluate(
            (replay) => window.__VN.playReplay(replay),
            replay,
          );
          check(
            `${quality} jump${index} ${mode} replay`,
            JSON.stringify(state.vehicle) ===
              JSON.stringify(replayed.vehicle) &&
              JSON.stringify(state.runtime) ===
                JSON.stringify(replayed.runtime),
          );
          const rejected = await page.evaluate((replay) => {
            replay.runtime.rulesId += '-incompatible';
            try {
              window.__VN.playReplay(replay);
              return false;
            } catch {
              return true;
            }
          }, replay);
          check(`${quality} rejects incompatible rules`, rejected);
          await capture(`jump${index}-${mode}-result`);
        }
      }
      console.log(`${quality}: flights complete; comparing grip`);
      report.gripSamples ??= [];
      for (const scenario of ['frost-matched', 'crystal-matched']) {
        await load(scenario);
        const before = await snap();
        await page.evaluate(() => window.__VN.resume());
        await page.keyboard.down('KeyS');
        await page.keyboard.down('KeyD');
        await page.waitForFunction(
          (tick) => window.__VN.getSnapshot().tick >= tick + 24,
          before.tick,
          { timeout: 20000 },
        );
        await page.keyboard.up('KeyS');
        await page.keyboard.up('KeyD');
        await page.evaluate(() => window.__VN.pause());
        report.gripSamples.push({
          quality,
          scenario,
          before,
          after: await snap(),
        });
        await capture(scenario);
      }
      await page.evaluate(() => {
        window.__VN.dispose();
        window.__VN.dispose();
      });
      check(
        `${quality} own HUD disposed`,
        (await page.locator('[data-glasswake-weather-glass]').count()) === 0,
      );
    } finally {
      await context.close();
    }
  }
  check(
    'production desktop has no renderer or application faults',
    report.faults.length === 0,
    report.faults,
  );
  for (const ownedAsset of [
    'glasswake-environment-v5.glb',
    'aurora-sky-v1.png',
    'ice-surface-v1.png',
  ]) {
    const failureContext = await browser.newContext({
      viewport: { width: 640, height: 360 },
    });
    try {
      const failurePage = await failureContext.newPage();
      await failurePage.route(
        `**/assets/levels/glasswake/${ownedAsset}`,
        (route) => route.abort('failed'),
      );
      await failurePage.goto(`${base}?level=glasswake`);
      await failurePage
        .locator('.failure')
        .waitFor({ state: 'visible', timeout: 60000 });
      check(
        `Glasswake ${ownedAsset} load failure cleans renderer`,
        (await failurePage
          .locator('canvas#world, [data-glasswake-weather-glass]')
          .count()) === 0,
      );
      check(
        `Glasswake ${ownedAsset} load error is actionable`,
        (await failurePage.locator('.failure button').count()) === 2,
      );
      const failureText = await failurePage.locator('.failure').innerText();
      check(
        `Glasswake ${ownedAsset} load error identifies the asset`,
        failureText.includes(
          ownedAsset === 'aurora-sky-v1.png'
            ? 'Glasswake aurora sky failed to load'
            : ownedAsset === 'ice-surface-v1.png'
              ? 'failed to load'
              : 'Glasswake environment failed to load',
        ) && !failureText.includes('[object Event]'),
      );
    } finally {
      await failureContext.close();
    }
  }
} catch (error) {
  report.error = error.stack;
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      checks: report.checks,
      faults: report.faults,
      error: report.error,
      browser: 'CLOSED',
    }),
  );
}
