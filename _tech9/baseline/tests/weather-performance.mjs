import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { openScene, root, samplePerformance } from './lib/browser.mjs';

// Run without video and serialize GPU windows with other scene tasks.
const output = path.resolve(root, '../.artifacts/weather/performance');
await mkdir(output, { recursive: true });
const report = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  timestamp: new Date().toISOString(),
  competingLoad:
    process.env.COMPETING_LOAD || 'Not recorded; do not treat as isolated.',
  quality: 'balanced',
  videoRecording: false,
  targetFps: 60,
  presets: [],
};
const h = await openScene({ mode: 'preview', width: 1600, height: 1000 });
report.environment = h.environment;
try {
  const { page } = h;
  await page.locator('[data-setting="quality"]').selectOption('balanced');
  await page.locator('#close-panel').click();
  for (const preset of ['clear', 'drizzle', 'rain', 'winter', 'snowfall']) {
    await page.locator(`[data-preset="${preset}"]`).click();
    await page.waitForTimeout(6500);
    const timing = await samplePerformance(page, 6000);
    const snapshot = await h.snapshot();
    report.presets.push({
      preset,
      timing,
      condition: snapshot.weather,
      renderer: snapshot.renderer,
    });
    console.log(
      `${preset}: ${timing.meanFps.toFixed(1)} FPS, mean ${timing.meanMs.toFixed(2)} ms, p95 ${timing.p95Ms.toFixed(2)} ms`,
    );
  }
  assert.deepEqual(h.errors, {
    console: [],
    page: [],
    requests: [],
    webgl: [],
  });
  report.errors = h.errors;
} finally {
  await h.close();
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
}
