import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = process.env.VN_URL;
if (!base)
  throw new Error('Set VN_URL to the intended Cindercoil production preview.');
const folder = '.experiments/expansion/cindercoil/assets';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.VN_BROWSER_CHANNEL || 'chrome',
});
const report = [];
try {
  for (const asset of [
    'cindercoil-hero-kit-v6.glb',
    'cindercoil-sky-v2.png',
    'basalt-albedo-v1.png',
  ]) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.route(`**/assets/levels/cindercoil/${asset}`, (route) =>
        route.abort('failed'),
      );
      await page.goto(`${base.replace(/\/$/, '')}/?level=cindercoil`);
      await page
        .locator('.failure')
        .waitFor({ state: 'visible', timeout: 120000 });
      await page.waitForTimeout(100);
      assert.equal(await page.locator('canvas#world').count(), 0);
      assert.equal(
        await page.locator('.cindercoil-notice,.cindercoil-exposure').count(),
        0,
      );
      report.push({
        asset,
        status: 'pass',
        failure: await page.locator('.failure').innerText(),
      });
      console.log(`${asset}: visible failure and owned DOM cleanup passed`);
    } finally {
      await context.close();
    }
  }
} catch (error) {
  report.push({ error: error.stack });
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    `${folder}/report.json`,
    JSON.stringify({ cases: report, browserClosed: true }, null, 2),
  );
}
