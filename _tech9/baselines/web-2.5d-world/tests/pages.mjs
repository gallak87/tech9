import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { installedChromium, root } from './lib/browser.mjs';

const output = path.join(root, '.artifacts/verification');
await mkdir(output, { recursive: true });
const dist = path.join(root, 'dist'),
  prefix = '/coast-check/';
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, 'http://localhost').pathname,
    );
    if (pathname === '/away') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>Away</title><p>Navigation test</p>');
      return;
    }
    if (!pathname.startsWith(prefix)) throw new Error('Outside package route');
    const relative = pathname.slice(prefix.length) || 'index.html',
      file = path.resolve(dist, relative);
    if (!file.startsWith(dist + path.sep)) throw new Error('Unsafe path');
    const content = await readFile(file);
    res.writeHead(200, {
      'content-type': mime[path.extname(file)] || 'application/octet-stream',
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
let browser;
const report = { checks: [], errors: [] };
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    headless: true,
    executablePath: await installedChromium(),
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  page.on('pageerror', (e) => report.errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) report.errors.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(origin + prefix, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Explore the coast' }).click();
  assert.equal(await page.locator('#stage canvas').count(), 1);
  assert.equal(
    await page.evaluate(() => typeof window.__COAST_TEST__),
    'undefined',
  );
  report.checks.push(
    'production loads all artwork/fonts under a subpath without test globals',
  );
  await page.keyboard.down('w');
  await page.waitForTimeout(250);
  await page.keyboard.up('w');
  await page.screenshot({ path: path.join(output, 'production-subpath.png') });
  await page.goto(origin + '/away');
  await page.goBack({ waitUntil: 'networkidle' });
  if (await page.getByRole('button', { name: 'Explore the coast' }).isVisible())
    await page.getByRole('button', { name: 'Explore the coast' }).click();
  else if (
    await page
      .getByRole('button', { name: 'Return to the coast', exact: true })
      .isVisible()
  )
    await page
      .getByRole('button', { name: 'Return to the coast', exact: true })
      .click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  assert.equal(await page.locator('#paused').isVisible(), true);
  await page
    .getByRole('button', { name: 'Return to the coast', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Return to start', exact: true })
    .click();
  await page.waitForFunction(() => !document.querySelector('#reset').disabled);
  assert.equal(await page.locator('#stage canvas').count(), 1);
  report.checks.push(
    'back navigation leaves working pause/resume/restart controls (BFCache or reload)',
  );
  assert.deepEqual(report.errors, []);
  for (const file of await readdir(path.join(dist, 'assets'))) {
    if (file.endsWith('.js'))
      assert.ok(
        !(await readFile(path.join(dist, 'assets', file), 'utf8')).includes(
          '__COAST_TEST__',
        ),
        'production must eliminate test API',
      );
  }
  report.checks.push('compiled production modules exclude test API');
  console.log(
    'PASS production subpath, navigation recovery and test isolation',
  );
} catch (error) {
  report.error = error.stack;
  process.exitCode = 1;
  console.error(error);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await writeFile(
    path.join(output, 'pages-report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
}
