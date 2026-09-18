import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {ASSET_MANIFEST} from '../src/assets.js';

const dist = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const mounts = ['/', '/tech9/chronoforge-echo/'];
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.json':'application/json'};
// A strict static server: no Vite/SPA fallback to hide missing asset paths.
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = pathname.startsWith(mounts[1]) ? pathname.slice(mounts[1].length) : pathname.slice(1);
    const file = path.resolve(dist, relative || 'index.html');
    if (!file.startsWith(dist + path.sep) || !(await fs.stat(file)).isFile()) throw Error('not found');
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({headless:true, channel:process.env.CHROME_CHANNEL || 'chrome'});
  for (const mount of mounts) {
    const context = await browser.newContext({viewport:{width:1280,height:800}});
    try {
      const page = await context.newPage(), errors = [], requests = new Set();
      page.on('pageerror', error => errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('response', response => {
        const url = new URL(response.url());
        if (url.origin !== origin) return;
        if (response.status() >= 400) errors.push(`${response.status()} ${url.pathname}`);
        if (!url.pathname.startsWith(mount)) errors.push(`Request escaped mount: ${url.pathname}`);
        requests.add(url.pathname);
      });
      const response = await page.goto(origin + mount + '?test=1');
      assert.equal(response.status(), 200, `Entry page not served at ${mount}`);
      try {
        await page.waitForFunction(() => window.__ECHO_READY__, {timeout:30000});
      } catch (error) {
        throw Error(`Boot failed at ${mount}: ${JSON.stringify({errors,requests:[...requests],screen:await page.locator('body').innerText()})}`, {cause:error});
      }
      assert.equal(await page.evaluate(() => typeof window.__ECHO__), 'undefined', 'Production exposed dev fixtures');
      await page.keyboard.press('Enter');
      for (let n=0; n<20 && await page.locator('[data-do="dialogue-next"]').count(); n++) await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      await page.keyboard.press('3');
      assert.match(await page.locator('.tabs .active').innerText(), /Inventory/i);
      // Exercise every bundled face, including italic prose not always visible
      // on the opening screen, without relying on platform fallback fonts.
      const fonts = await page.evaluate(async () => {
        const specs = ['400 16px Barlow','500 16px Barlow','600 16px Barlow','400 16px "EB Garamond"','italic 400 16px "EB Garamond"'];
        return Promise.all(specs.map(async font => (await document.fonts.load(font)).length));
      });
      assert.ok(fonts.every(count => count > 0), 'A bundled font failed to load');
      for (const asset of ASSET_MANIFEST) assert.ok(requests.has(mount + asset.url), `Missing request: ${mount + asset.url}`);
      assert.deepEqual(errors, []);
      console.log(`PASS ${mount}: title, opening, Inventory, 70 atlases and 5 font faces; no HTTP or browser errors.`);
    } finally { await context.close(); }
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
