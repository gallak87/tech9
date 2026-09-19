import {reviewRoot} from '../scripts/review-output.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = new URL('../', import.meta.url).pathname;
const report = { method: 'Production loadAssets and drawIcon. Fixture inventory supplies every catalog item for visual coverage; no earned-progression claim. Contact sheet uses real 24/32/64/96 pixel destinations on near-black and parchment.', errors: [], captures: [] };
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', error => report.errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
const requested = [];
page.on('request', request => requested.push(request.url()));
await page.routeWebSocket('**/*', socket => { socket.send('{"type":"connected"}'); socket.onMessage(() => {}); });
const capture = async name => { await page.screenshot({ path: reviewRoot + 'icon-refresh/' + name + '.png' }); report.captures.push(name + '.png'); };
try {
  await page.goto('http://127.0.0.1:4321/?test=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ECHO_READY__);
  report.load = await page.evaluate(async () => {
    const { ASSET_MANIFEST, assetDiagnostics } = await import('/src/assets.js');
    const { RASTER_ICON_ASSETS } = await import('/src/raster-icon-manifest.js');
    const { rasterIconMetrics } = await import('/src/raster-icons.js');
    const { ITEMS } = await import('/src/content.js');
    const { drawItemIcon } = await import('/src/item-art.js');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    return { assets: assetDiagnostics, metrics: rasterIconMetrics(), manifest: ASSET_MANIFEST.map(a => ({ id: a.id, url: a.url })), selected: RASTER_ICON_ASSETS.map(a => a.id), expected: ['food', 'ore', 'energy', 'renown', 'xp', ...Object.values(ITEMS).filter(i => !['weapon', 'armor'].includes(i.slot)).map(i => i.id)], catalogSupport: Object.keys(ITEMS).map(id => ({ id, supported: drawItemIcon(context, id, 0, 0, 128) })) };
  });
  assert.deepEqual(report.load.assets.errors, []);
  assert.equal(report.load.metrics.loaded.length, 20);
  assert.deepEqual([...report.load.selected].sort(), [...report.load.expected].sort());
  assert.ok(report.load.catalogSupport.every(a => a.supported));
  report.localOnly = requested.every(url => url.startsWith('http://127.0.0.1:4321/'));
  assert.ok(report.localOnly);
  report.compressedManifestBytes = 0;
  for (const asset of report.load.manifest) report.compressedManifestBytes += (await fs.stat(base + 'public/' + asset.url)).size;
  await page.evaluate(async () => { __ECHO__.preset('party'); const g = __ECHO__.game; g.resetSession(); g.update = () => {}; const { ITEMS } = await import('/src/content.js'); g.state.inventory = Object.fromEntries(Object.keys(ITEMS).map(id => [id, 3])); g.ui.render(); });
  await capture('world-hud');
  report.hud = await page.locator('.resources [data-icon]').evaluateAll(nodes => nodes.map(n => ({ id: n.dataset.icon, backing: [n.width, n.height], css: [n.getBoundingClientRect().width, n.getBoundingClientRect().height] })));
  await page.keyboard.press('Escape'); await page.keyboard.press('3');
  await capture('inventory');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const g = __ECHO__.game; g.ui.showVendor({ id: 'icon_visual_provisions', name: 'Provisions — icon review fixture', service: 'provisions', variant: 'shopkeeper' }); });
  await capture('vendor');
  await page.evaluate(async () => {
    const { drawIcon } = await import('/src/art.js');
    const { RASTER_ICON_ASSETS } = await import('/src/raster-icon-manifest.js');
    const c = document.createElement('canvas'); c.id = 'icon-contact-sheet'; c.width = 1600; c.height = 1050;
    Object.assign(c.style, { position: 'fixed', zIndex: 999999, left: '0', top: '0', width: '1600px', height: '1050px' });
    document.body.append(c); const ctx = c.getContext('2d');
    ctx.fillStyle = '#222024'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = '#f4ebd3'; ctx.font = '16px monospace'; ctx.fillText('Production drawIcon: each row 24 / 32 / 64 / 96 px • original alpha on near-black and parchment', 14, 25);
    RASTER_ICON_ASSETS.forEach((asset, index) => {
      const x = index % 5 * 320, y = 40 + Math.floor(index / 5) * 252;
      ctx.fillStyle = '#f4ebd3'; ctx.font = '14px monospace'; ctx.fillText(asset.id, x + 12, y + 17);
      for (let bg = 0; bg < 2; bg++) {
        const top = y + 26 + bg * 108; ctx.fillStyle = bg ? '#e7dcc1' : '#111216'; ctx.fillRect(x + 4, top, 312, 104);
        const sizes = [24, 32, 64, 96], offsets = [15, 59, 107, 199];
        sizes.forEach((size, n) => drawIcon(ctx, asset.id, x + offsets[n], top + (104 - size) / 2, size));
      }
    });
  });
  await page.locator('#icon-contact-sheet').screenshot({ path: reviewRoot + 'icon-refresh/contact-native.png' });
  report.captures.push('contact-native.png');
  assert.deepEqual(report.errors, []);
  report.result = 'pass';
} catch (error) { report.result = 'fail'; report.failure = String(error); process.exitCode = 1; }
finally { await fs.writeFile(reviewRoot + 'icon-refresh/results.json', JSON.stringify(report, null, 2)); await browser.close(); console.log(JSON.stringify({ result: report.result, failure: report.failure, count: report.load?.assets.loaded.length, decodedBytes: report.load?.assets.bytes, compressedBytes: report.compressedManifestBytes, iconMetrics: report.load?.metrics, errors: report.errors })); }
