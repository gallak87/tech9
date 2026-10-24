import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to the current browser build.');
const browser = await chromium.launch({
  channel: process.env.VN_BROWSER_CHANNEL ?? 'chrome',
  headless: true,
});
const target = resolve('public/assets/menu/ships');
try {
  await mkdir(target, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 400, height: 225 },
    deviceScaleFactor: 1,
  });
  await page.goto(base);
  await page.waitForFunction(() => window.__VN_FRONTEND);
  await page.evaluate(async () => {
    document.body.innerHTML = '';
    document.body.style.cssText =
      'margin:0;background:#111;width:400px;height:225px;overflow:hidden';
    const { createShipPreview } = await import('/src/frontend/ship-preview.js');
    window.captureStudio = createShipPreview();
    window.captureStudio.element.style.cssText =
      'width:400px;height:225px;background:#111;position:relative';
    window.captureStudio.element.querySelector(
      '.ship-preview-hint',
    ).style.display = 'none';
    document.body.append(window.captureStudio.element);
  });
  const captures = [];
  for (const id of ['shrike', 'bastion', 'needle', 'kestrel']) {
    await page.evaluate(async (id) => {
      await window.captureStudio.setShip(id);
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    }, id);
    captures.push([
      id,
      await page
        .locator(`.ship-preview[data-state="ready"][data-ship="${id}"] canvas`)
        .screenshot({ type: 'jpeg', quality: 88 }),
    ]);
    console.log(`Captured ${id}`);
  }
  await page.evaluate(() => window.captureStudio.dispose());
  for (const [id, buffer] of captures)
    await writeFile(resolve(target, `${id}.jpg`), buffer);
} finally {
  await browser.close();
}
