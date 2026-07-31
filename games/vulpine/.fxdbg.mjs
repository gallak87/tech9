// Debug driver: boot the game, apply a shot, then read live state AFTER the shot
// has been applied. tools/shot.mjs evaluates --js before the shot loop, which
// makes it useless for asking "what is on screen right now".
import { chromium } from 'playwright';

const PORT = process.argv.includes('--port')
  ? process.argv[process.argv.indexOf('--port') + 1] : '5194';
const SHOT = process.argv.includes('--shot')
  ? process.argv[process.argv.indexOf('--shot') + 1] : 'fx-explosion';
const EXPR = process.argv[process.argv.indexOf('--expr') + 1];
const T = process.argv.includes('--t') ? process.argv[process.argv.indexOf('--t') + 1] : '12';

const base = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
    '--disable-frame-rate-limit', '--force-color-profile=srgb', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
await page.goto(`${base}/?quality=ultra&env=corneria&t=${T}&hud=0`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__VULPINE__ && window.__VULPINE__.ready, null, { timeout: 120000 });

if (SHOT !== 'none') {
  await page.evaluate(s => window.__VULPINE__.setShot(s), SHOT);
  await page.evaluate(() => new Promise(r => {
    let n = 0; const t = () => (++n >= 6 ? r() : requestAnimationFrame(t)); requestAnimationFrame(t);
  }));
}

const res = await page.evaluate((src) => {
  try { return { ok: true, v: eval(src) }; } catch (e) { return { ok: false, v: String(e) + '\n' + e.stack }; }
}, EXPR);
console.log(JSON.stringify(res.v, null, 1));
if (errs.length) console.log('ERRORS:', errs.slice(0, 8).join('\n'));
await browser.close();
