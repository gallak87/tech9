/* global window, document, requestAnimationFrame */
import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, preview } from 'vite';

const framework = fileURLToPath(new URL('../../../', import.meta.url));
const root = fileURLToPath(new URL('../example/', import.meta.url));
const output = path.join(framework, '.artifacts/vehicles-framework');
const outDir = path.join(framework, '.artifacts/vehicles-example');
const port = Number(process.env.VEHICLES_PORT ?? 4490);
await mkdir(output, { recursive: true });
await build({
  root,
  configFile: false,
  logLevel: 'warn',
  build: { outDir, emptyOutDir: true },
});
let server, browser;
const errors = [];
const records = [];
try {
  server = await preview({
    root,
    configFile: false,
    logLevel: 'warn',
    build: { outDir },
    preview: { host: '127.0.0.1', port, strictPort: true },
  });
  const executablePath = process.env.CHROMIUM_PATH ?? chromium.executablePath();
  await access(executablePath);
  browser = await chromium.launch({
    executablePath,
    headless: process.env.HEADED !== '1',
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('requestfailed', (request) =>
    errors.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText}`,
    ),
  );
  await page.goto(`http://127.0.0.1:${port}/?test=1`);
  await page.waitForFunction(() => Boolean(window.__vehiclesExample));
  const snapshot = () =>
    page.evaluate(() => window.__vehiclesExample.snapshot());
  const until = (predicate) =>
    page.waitForFunction(predicate, null, { timeout: 10000 });
  for (const type of ['jeep', 'atv', 'bike']) {
    await page.selectOption('#vehicle', type);
    assert.equal((await snapshot()).vehicle, type);
    assert.equal((await snapshot()).paused, true);
    await page.click('#resume');
    await page.keyboard.down('KeyW');
    await until(() => window.__vehiclesExample.snapshot().speed > 4);
    await page.keyboard.down('KeyD');
    await until(() => window.__vehiclesExample.snapshot().heading > 0.15);
    await page.keyboard.up('KeyD');
    await page.keyboard.up('KeyW');
    const moving = await snapshot();
    assert.ok(moving.distance > 1 && moving.x > 0);
    await page.keyboard.down('Space');
    await until(
      () => Math.abs(window.__vehiclesExample.snapshot().speed) < 0.1,
    );
    await page.keyboard.up('Space');
    await page.keyboard.press('KeyC');
    assert.equal((await snapshot()).mode, 'mounted');
    assert.ok(
      Object.values(
        await page.evaluate(() => window.__vehiclesExample.mountedPose()),
      )
        .flat()
        .every(Number.isFinite),
    );
    await page.screenshot({ path: path.join(output, `${type}-mounted.png`) });
    await page.keyboard.press('KeyC');
    await page.keyboard.press('KeyT');
    assert.ok((await snapshot()).distance < 0.01);
    await page.screenshot({ path: path.join(output, `${type}-follow.png`) });
    await page.keyboard.down('KeyW');
    await until(() => window.__vehiclesExample.snapshot().collision);
    const stopped = await snapshot();
    assert.ok(stopped.z > -14 + 1.3, 'cannot drive through obstacle');
    await page.keyboard.up('KeyW');
    await page.keyboard.press('KeyR');
    assert.ok(Math.abs((await snapshot()).speed) < 0.1);
    await page.keyboard.press('KeyT');
    await page.keyboard.down('KeyS');
    await until(() => window.__vehiclesExample.snapshot().speed < -1);
    await page.keyboard.up('KeyS');
    await page.keyboard.press('Escape');
    const paused = await snapshot();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(160);
    assert.deepEqual(await snapshot(), paused, 'pause freezes simulation');
    await page.keyboard.up('KeyW');
    await page.click('#resume');
    await page.keyboard.press('KeyT');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal((await snapshot()).paused, true);
    await page.click('#resume');
    await page.waitForTimeout(100);
    assert.ok(
      Math.abs((await snapshot()).speed) < 0.1,
      'resume requires a fresh press',
    );
    records.push({
      type,
      moved: moving.distance,
      turned: moving.heading,
      collisionZ: stopped.z,
    });
  }
  // Warm every model and compare the same final selection across repeated cycles.
  const cycle = async () => {
    for (const type of ['jeep', 'atv', 'bike']) {
      await page.selectOption('#vehicle', type);
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
    }
    return page.evaluate(() => window.__vehiclesExample.memory());
  };
  const warm = await cycle();
  const repeated = await cycle();
  assert.deepEqual(
    repeated,
    warm,
    'switches must not accumulate render resources',
  );
  const gpu = await page.evaluate(() => window.__vehiclesExample.renderer());
  await page.evaluate(() => window.__vehiclesExample.dispose());
  assert.equal(await page.locator('canvas').count(), 0);
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector('canvas');
  assert.equal(await page.evaluate(() => '__vehiclesExample' in window), false);
  await page.click('#resume');
  await page.keyboard.down('KeyW');
  await page.waitForFunction(
    () => !document.querySelector('#status').textContent.includes('0 km/h'),
  );
  await page.keyboard.up('KeyW');
  assert.deepEqual(errors, []);
  const report = {
    checkpoint: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: framework,
      encoding: 'utf8',
    }).trim(),
    browser: browser.version(),
    gpu,
    viewport: '1440x900 @1',
    records,
    warm,
    repeated,
    errors,
  };
  await writeFile(
    path.join(output, 'verification.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  if (server)
    await new Promise((resolve, reject) =>
      server.httpServer.close((error) => (error ? reject(error) : resolve())),
    );
}
