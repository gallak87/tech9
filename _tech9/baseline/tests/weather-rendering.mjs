import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { openScene, root } from './lib/browser.mjs';
const h = await openScene({ mode: 'preview' });
const { page } = h;
const output = path.resolve(root, '../.artifacts/weather/rendering');
await mkdir(output, { recursive: true });
const report = { environment: h.environment };
async function capture() {
  return page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    const source = document.querySelector('#scene'),
      sample = document.createElement('canvas');
    sample.width = source.width;
    sample.height = source.height;
    const context = sample.getContext('2d');
    context.drawImage(source, 0, 0);
    return Array.from(context.getImageData(350, 250, 900, 650).data);
  });
}
try {
  await page.locator('[data-setting="quality"]').selectOption('balanced');
  await page.evaluate(() =>
    window.__SCENE_TEST__.setWeather({
      rain: 0,
      snowfall: 0,
      snow: 0,
      wetness: 0,
      wind: 0,
      cloud: 0,
      winter: 0,
      transition: 0,
      paused: false,
    }),
  );
  await page.waitForTimeout(200);
  await page.evaluate(() =>
    window.__SCENE_TEST__.setWeather({ paused: true, wetness: 0 }),
  );
  const clear = await capture();
  await page.evaluate(() =>
    window.__SCENE_TEST__.setWeather({ rain: 1, paused: false }),
  );
  await page.waitForTimeout(200);
  await page.evaluate(() =>
    window.__SCENE_TEST__.setWeather({ paused: true, wetness: 0 }),
  );
  const rain = await capture();
  let changed = 0;
  for (let i = 0; i < rain.length; i += 4)
    if (
      Math.abs(rain[i] - clear[i]) +
        Math.abs(rain[i + 1] - clear[i + 1]) +
        Math.abs(rain[i + 2] - clear[i + 2]) >
      18
    )
      changed++;
  report.rainPixels = changed;
  assert.ok(
    changed > 400,
    `Only ${changed} pixels changed; rain may be culled`,
  );
  await page.screenshot({ path: path.join(output, 'visible-rain.png') });
  assert.deepEqual(h.errors, {
    console: [],
    page: [],
    requests: [],
    webgl: [],
  });
  report.errors = h.errors;
  console.log(
    `PASS rain visibly changes ${changed} pixels with identical dry material and lighting state`,
  );
} finally {
  await h.close();
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
}
