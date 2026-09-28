import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const scenario = process.argv[2] || 'staging';
const folder = process.env.VN_EVIDENCE || `.experiments/current-${scenario}`;
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: process.env.VN_HEADED !== '1',
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.goto(process.env.VN_URL || 'http://127.0.0.1:5179/');
await page.waitForFunction(() => window.__VN?.ready, { timeout: 45000 });
await page.evaluate((s) => {
  if (s !== 'title') window.__VN.loadScenario(s, 47219);
}, scenario);
await page.waitForTimeout(1000);
await page.screenshot({ path: path.join(folder, 'view.png') });
const report = await page.evaluate(() => ({
  snapshot: window.__VN.getSnapshot(),
  metrics: window.__VN.getMetrics(),
}));
await writeFile(
  path.join(folder, 'report.json'),
  JSON.stringify({ ...report, errors }, null, 2),
);
console.log(
  JSON.stringify({ folder, errors, metrics: report.metrics }, null, 2),
);
await browser.close();
if (errors.length) process.exitCode = 1;
