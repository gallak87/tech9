import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const framework = fileURLToPath(new URL('../../../', import.meta.url));
const output = path.join(framework, '.artifacts/weather/example');
await mkdir(output, { recursive: true });
const port = Number(process.env.SCENE_PORT ?? 4500);
const url = `http://127.0.0.1:${port}/modules/weather/examples/`;
const server = await createServer({
  root: framework,
  configFile: false,
  logLevel: 'warn',
  server: { host: '127.0.0.1', port, strictPort: true },
});
let browser;
const errors = [];
try {
  await server.listen();
  browser = await chromium.launch({
    headless: process.env.HEADED !== '1',
    executablePath: process.env.CHROMIUM_PATH ?? chromium.executablePath(),
  });
  const page = await browser.newPage({
    viewport: { width: 1200, height: 800 },
    deviceScaleFactor: 1,
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(url);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(3000);
  for (const preset of ['rain', 'winter', 'snowfall', 'clear']) {
    await page.locator(`#${preset}`).click();
    await page.waitForTimeout(3600);
    await page.screenshot({ path: path.join(output, `${preset}.png`) });
  }
  await page.mouse.move(850, 450);
  await page.mouse.down();
  await page.mouse.move(730, 440, { steps: 10 });
  await page.mouse.up();
  await page.screenshot({ path: path.join(output, 'orbit.png') });
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(
      {
        browser: await browser.version(),
        viewport: [1200, 800],
        errors,
        controls: 'Four preset buttons and real pointer orbit exercised',
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS standalone weather example presets, orbit input and shaders',
  );
} finally {
  await browser?.close();
  await server.close();
}
