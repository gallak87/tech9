import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { openScene, root, samplePerformance } from './lib/browser.mjs';

const output = path.join(root, '.artifacts/verification');
await mkdir(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), checks: [] };
const harness = await openScene({ mode: 'preview' });
const { page, snapshot } = harness;
report.environment = harness.environment;
async function check(name, action) {
  try {
    const detail = await action();
    report.checks.push({ name, pass: true, detail });
    console.log(`PASS ${name}`);
  } catch (error) {
    const screenshot = `${name.replace(/[^a-z0-9]+/gi, '-')}.png`;
    await page.screenshot({ path: path.join(output, screenshot) });
    report.checks.push({ name, pass: false, error: error.message, screenshot });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
try {
  await check('ready and complete scene', async () => {
    const state = await snapshot();
    assert.equal(await page.locator('canvas').count(), 1);
    assert.ok(state.camera.position.every(Number.isFinite));
    assert.equal(state.settings.quality, 'high');
    return state;
  });
  await check('exactly five live high-level controls', async () => {
    const controls = page.locator('[data-setting]');
    assert.equal(await controls.count(), 5);
    const names = await controls.evaluateAll((items) =>
      items.map((item) => item.dataset.setting).sort(),
    );
    assert.deepEqual(names, [
      'atmosphere',
      'exposure',
      'quality',
      'richness',
      'sunlight',
    ]);
    await page.locator('[data-setting="quality"]').selectOption('balanced');
    assert.equal((await snapshot()).settings.quality, 'balanced');
    const exposure = page.locator('[data-setting="exposure"]');
    await exposure.focus();
    await page.keyboard.press('End');
    assert.equal((await snapshot()).settings.exposure, 1.6);
  });
  await check('flight responds to keyboard and elevation', async () => {
    await page.evaluate(() => window.__SCENE_TEST__.setView('trail'));
    await page.locator('canvas').click({ position: { x: 500, y: 500 } });
    const before = (await snapshot()).camera.position;
    await page.keyboard.down('w');
    await page.waitForTimeout(550);
    await page.keyboard.up('w');
    const after = (await snapshot()).camera.position;
    const distance = Math.hypot(...after.map((value, i) => value - before[i]));
    assert.ok(distance > 0.1, `Keyboard moved only ${distance} metres`);
    await page.keyboard.down('e');
    await page.waitForTimeout(350);
    await page.keyboard.up('e');
    const elevated = (await snapshot()).camera.position;
    assert.ok(elevated[1] > after[1], 'E raises the fly camera');
    await page.keyboard.press('Escape');
    return { before, after, elevated, distance };
  });
  await check('flight stops at authored map bounds', async () => {
    await page.evaluate(() => window.__SCENE_TEST__.setView('boundary'));
    await page.locator('canvas').click({ position: { x: 500, y: 500 } });
    await page.keyboard.down('Shift');
    await page.keyboard.down('w');
    await page.waitForTimeout(1200);
    await page.keyboard.up('w');
    await page.keyboard.up('Shift');
    await page.keyboard.press('Escape');
    const state = await snapshot();
    const [x, y, z] = state.camera.position;
    const bounds = state.bounds;
    assert.ok(x >= bounds.minX && x <= bounds.maxX);
    assert.ok(z >= bounds.minZ && z <= bounds.maxZ);
    assert.ok(y <= (bounds.maxY ?? 36));
    return { position: state.camera.position, bounds };
  });
  await check('all quality settings and authored camera presets', async () => {
    for (const quality of ['balanced', 'high', 'ultra']) {
      await page.evaluate(
        (quality) => window.__SCENE_TEST__.setSettings({ quality }),
        quality,
      );
      assert.equal((await snapshot()).settings.quality, quality);
    }
    const views = {};
    for (const view of ['trail', 'grove', 'ridge']) {
      await page.evaluate((view) => window.__SCENE_TEST__.setView(view), view);
      views[view] = (await snapshot()).camera.position;
    }
    assert.notDeepEqual(views.trail, views.grove);
    assert.notDeepEqual(views.trail, views.ridge);
    await page.evaluate(() => {
      window.__SCENE_TEST__.setView('trail');
      window.__SCENE_TEST__.setSettings({ quality: 'high', exposure: 1 });
    });
    return views;
  });
  await check('responsive canvas and controls', async () => {
    for (const viewport of [
      { width: 900, height: 640 },
      { width: 1600, height: 1000 },
    ]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(200);
      const box = await page.locator('canvas').boundingBox();
      assert.equal(Math.round(box.width), viewport.width);
      assert.equal(Math.round(box.height), viewport.height);
      assert.equal(await page.locator('[data-setting]').count(), 5);
    }
  });
  await check(
    'repeated quality and density tuning releases GPU resources',
    async () => {
      const settle = () =>
        page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
      await settle();
      const before = (await snapshot()).renderer.memory;
      for (let cycle = 0; cycle < 3; cycle++) {
        for (const quality of ['balanced', 'ultra', 'high']) {
          await page.evaluate(
            (quality) =>
              window.__SCENE_TEST__.setSettings({
                quality,
                richness: quality === 'ultra' ? 1.6 : 1,
              }),
            quality,
          );
          await settle();
        }
      }
      const after = (await snapshot()).renderer.memory;
      assert.ok(
        after.geometries <= before.geometries,
        'Reconfiguration leaks geometries',
      );
      assert.ok(
        after.textures <= before.textures,
        'Reconfiguration leaks textures',
      );
      // Shader variants are retained intentionally, but these presets were warmed above.
      assert.ok(
        after.programs <= before.programs,
        'Repeated warmed presets create new shaders',
      );
      return { before, after };
    },
  );
  await check('measured frame timing and render metrics', async () => {
    await page.waitForTimeout(1000);
    report.performance = await samplePerformance(page, 5000);
    assert.ok(report.performance.samples >= 5, 'Renderer produces frames');
    return {
      performance: report.performance,
      metrics: (await snapshot()).metrics,
    };
  });
  await check('no browser asset or WebGL errors', () => {
    for (const [kind, errors] of Object.entries(harness.errors))
      assert.deepEqual(errors, [], `${kind}: ${errors.join('; ')}`);
  });
  await page.screenshot({ path: path.join(output, 'trail.png') });
  report.finalSnapshot = await snapshot();
  report.errors = harness.errors;
  report.passed = report.checks.every((item) => item.pass);
  report.finishedAt = new Date().toISOString();
  await writeFile(
    path.join(output, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  if (!report.passed) process.exitCode = 1;
} finally {
  await harness.close();
}
