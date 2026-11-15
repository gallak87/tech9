import assert from 'node:assert/strict';
import { generateDocument } from '../src/editor/document.js';
import {
  launchVerificationBrowser,
  collectPageErrors,
} from './verification-browser.mjs';
import { seedVerificationCareer } from './verification-career.mjs';
import { openEditorSection, revealEditorAction } from './editor-controls.mjs';

// Matched warm CPU-submission/resource comparison. Run alone after functional
// checks; neither headless CPU submission nor estimates establish GPU/FPS headroom.
const practice = process.argv.includes('--practice');
const quality = process.env.VN_QUALITY ?? 'low';
assert(['low', 'high'].includes(quality));
const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to the isolated editor server.');
const browser = await launchVerificationBrowser();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const errors = [];
const results = [];
const quantile = (values, q) =>
  [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * q)];
try {
  await seedVerificationCareer(context);
  await context.routeWebSocket('**/*', () => {});
  await context.addInitScript((quality) => {
    localStorage.setItem('startUpMusicOn', 'false');
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({ quality, volume: 0, reducedMotion: true }),
    );
  }, quality);
  const page = await context.newPage();
  collectPageErrors(page, errors);
  await page.goto(new URL('?intro=0&music=0&editor=1', base).href);
  await page.locator('[data-editor-field="name"]').waitFor({ timeout: 90000 });
  for (const length of [3000, 20000]) {
    const source = generateDocument({
      generatorVersion: 3,
      seed: 42,
      length,
      courseType: 'circuit',
      crossovers: length === 20000 ? 1 : 0,
      bendiness: 0.75,
      elevation: 0.6,
      jumpFrequency: 'normal',
      jumpSize: 'mixed',
    });
    source.settings = {
      sceneryPreset: 'waterfront',
      density: 0.82,
      waterLevel: -28,
    };
    for (const layoutVersion of [0, 1]) {
      const fixture = structuredClone(source);
      fixture.name = `Budget ${length} layout ${layoutVersion}`;
      fixture.environment = { version: 1, seed: 7001, layoutVersion };
      await openEditorSection(page, 'library');
      const choosing = page.waitForEvent('filechooser');
      await (await revealEditorAction(page, 'import')).click();
      await (
        await choosing
      ).setFiles({
        name: 'budget.vntrack.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(fixture)),
      });
      await page.waitForFunction(
        (name) =>
          document.querySelector('[data-editor-field="name"]')?.value ===
            name &&
          !window.__VN_FRONTEND.getState().editor.busy &&
          window.__VN_FRONTEND.getState().editor.preview?.worldReady,
        fixture.name,
        { timeout: 90000 },
      );
      await page.locator('[data-editor-action="global-close"]').click();
      await page.locator('[data-editor-action="fit"]').click();
      if (practice) {
        await page.locator('[data-editor-action="test"]').click();
        await page.waitForFunction(
          () =>
            window.__VN?.ready &&
            !document.querySelector('#hud')?.classList.contains('hidden'),
          null,
          { timeout: 120000 },
        );
        await page.evaluate(() => window.__VN.loadScenario('staging', 7));
        await page.waitForFunction(
          () => window.__VN.getMetrics().frames >= 80,
          null,
          { timeout: 90000 },
        );
        await page.evaluate(() => window.__VN.loadScenario('staging', 7));
        await page.waitForFunction(
          () => window.__VN.getMetrics().frames >= 120,
          null,
          { timeout: 90000 },
        );
        const metric = await page.evaluate(() => window.__VN.getMetrics());
        results.push({
          length,
          layoutVersion,
          quality,
          scope:
            'Warm stationary Practice; headless cadence is not GPU duration',
          viewport: metric.viewport,
          renderer: metric.gpu,
          frames: metric.frames,
          frameCadenceMs: metric.frameMs,
          calls: metric.calls,
          triangles: metric.triangles,
          estimatedGpuMiB: Number(metric.estimatedGpuMiB.toFixed(2)),
          geometries: metric.geometries,
          textures: metric.textures,
          pipeline: metric.pipeline,
        });
        console.log(JSON.stringify(results.at(-1)));
        await page.evaluate(() => window.__VN.pause());
        await page.locator('#home').click();
        await page
          .locator('[data-editor-action="test"]')
          .waitFor({ timeout: 90000 });
        continue;
      }
      const samples = [];
      for (let i = 0; i < 90; i++) {
        const previous = await page.evaluate(
          () => window.__VN_FRONTEND.getState().editor.preview.frames,
        );
        await page
          .locator(`[data-editor-action="${i % 2 ? 'zoom-out' : 'zoom-in'}"]`)
          .click();
        await page.waitForFunction(
          (frame) =>
            window.__VN_FRONTEND.getState().editor.preview.frames > frame,
          previous,
        );
        const metric = await page.evaluate(
          () => window.__VN_FRONTEND.getState().editor.preview,
        );
        if (i >= 18) samples.push(metric);
      }
      const last = samples.at(-1);
      results.push({
        length,
        layoutVersion,
        samples: samples.length,
        renderer: last.renderer,
        viewport: last.viewport,
        preset: last.preset,
        medianCpuMs: quantile(
          samples.map((s) => s.frameMs),
          0.5,
        ),
        p95CpuMs: quantile(
          samples.map((s) => s.frameMs),
          0.95,
        ),
        medianCalls: quantile(
          samples.map((s) => s.calls),
          0.5,
        ),
        medianTriangles: quantile(
          samples.map((s) => s.triangles),
          0.5,
        ),
        estimatedGpuMB: Number((last.estimatedGpuBytes / 1048576).toFixed(2)),
        geometries: last.geometries,
        textures: last.textures,
      });
      console.log(JSON.stringify(results.at(-1)));
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    practice
      ? 'PASS matched warm Practice resource comparison; GPU timing unavailable, headless cadence is diagnostic only'
      : 'PASS matched warm Nightweir resource comparison; CPU submission only, GPU timing unavailable',
  );
} finally {
  await context.close();
  await browser.close();
}
