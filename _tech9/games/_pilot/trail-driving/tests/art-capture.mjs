import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { openScene, root } from './lib/browser.mjs';
const h = await openScene({ mode: 'preview' }),
  { page } = h;
const output = path.join(
  root,
  '.artifacts',
  process.env.ART_ROUND || 'art-round-1',
);
await mkdir(output, { recursive: true });
try {
  const routes = await page.evaluate(() => window.__SCENE_TEST__.routes());
  for (const [i, vehicle] of ['jeep', 'atv', 'bike'].entries()) {
    await page
      .locator(`[data-action="vehicle"][data-value="${vehicle}"]`)
      .click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(output, `${vehicle}-garage.png`) });
    await page
      .locator(`[data-action="route"][data-value="${routes[i].id}"]`)
      .click();
    await page.locator('[data-action="free"]').click();
    const index = [100, 220, 200][i],
      a = routes[i].points[index],
      b = routes[i].points[index + 1];
    await page.evaluate((p) => window.__SCENE_TEST__.arrange(p), {
      ...a,
      heading: Math.atan2(b.x - a.x, -(b.z - a.z)),
    });
    await page.keyboard.down('w');
    await page.waitForTimeout(1500);
    await page.keyboard.up('w');
    await page.screenshot({ path: path.join(output, `${vehicle}-trail.png`) });
    await page.keyboard.press('c');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(output, `${vehicle}-driver.png`) });
    await page.keyboard.press('Escape');
    if (i === 0)
      await page.screenshot({ path: path.join(output, 'pause.png') });
    await page.locator('[data-action="garage"]').last().click();
  }
  await page.locator('[data-action="settings"]').click();
  await page.screenshot({ path: path.join(output, 'settings.png') });
  await page.locator('[data-action="garage"]').last().click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'narrow-garage.png') });
  await page.locator('[data-action="free"]').click();
  await page.screenshot({ path: path.join(output, 'narrow-hud.png') });
  for (const errors of Object.values(h.errors)) assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, 'capture.json'),
    JSON.stringify(
      {
        environment: h.environment,
        errors: h.errors,
        source:
          'Built preview; scenic arrangement is for art observation, never completed-run evidence.',
      },
      null,
      2,
    ),
  );
} finally {
  await h.close();
}
