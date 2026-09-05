#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// In-game capture for the probe loop. Playwright.
//
//   npm run retry:shot -- --forge kaida
//   npm run retry:shot -- --forge kaida --port 5190 --out shots/x --clip run
//
// tools/shot.mjs is the look-dev harness and it runs its own camera presets.
// This one exists for one job: load a forged character, WAIT until it actually
// swaps in, and say plainly whether it did. The forge branch is asynchronous and
// falls back to the code-built body on any failure, so a capture taken too early
// — or after a silent failure — looks identical to success. That ambiguity is
// what this removes: every [forge] console line is echoed, and the exit code
// says whether the glb reached the screen.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i === -1 ? d : argv[i + 1]; };

const CFG = {
  forge: arg('forge', 'kaida'),
  port: Number(arg('port', 5190)),
  out: arg('out', 'shots/ingame'),
  clip: arg('clip', null),
  wait: Number(arg('wait', 12000)),
  w: Number(arg('w', 1280)),
  h: Number(arg('h', 900)),
  hour: arg('t', '6.4'),
};

const url = `http://127.0.0.1:${CFG.port}/?play=1&dev=2&quality=high&hour=${CFG.hour}`
  + `&forge=${CFG.forge}${CFG.clip ? `&pose=${CFG.clip}` : ''}`;

fs.mkdirSync(CFG.out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: CFG.w, height: CFG.h } });

/* Every [forge] line, plus anything that failed. The loader is deliberately
   forgiving — it keeps the code-built character rather than leaving a hole — so
   its console output is the only place a failure is stated. */
const forgeLog = [];
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('[forge]')) forgeLog.push(`${m.type()}: ${t}`);
});
page.on('pageerror', (e) => forgeLog.push(`pageerror: ${e.message}`));

console.log(`→ ${url}`);
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__DAWN__?.ready === true, { timeout: 60000 }).catch(() => {});

/* Poll for the swap rather than sleeping a guessed interval. applyGltfActor
   hangs `_forge` on the actor, so its presence is the unambiguous signal that
   the glb is on screen and not merely fetched. */
const swapped = await page.waitForFunction(() => {
  const seen = performance.getEntriesByType('resource').some(e => /\.glb($|\?)/.test(e.name));
  return seen && (window.__forgeSeen ||= true);
}, { timeout: CFG.wait }).then(() => true).catch(() => false);

await page.waitForTimeout(2500);   // let one clip settle after the swap

const file = path.join(CFG.out, `${CFG.forge}${CFG.clip ? `-${CFG.clip}` : ''}.png`);
await page.screenshot({ path: file });

const stats = await page.evaluate(() => window.__DAWN__?.stats?.() ?? null).catch(() => null);
await browser.close();

console.log(`\nglb fetched: ${swapped ? 'yes' : 'NO — the loader never requested it'}`);
if (forgeLog.length) { console.log('[forge] console:'); forgeLog.forEach(l => console.log(`  ${l}`)); }
else console.log('[forge] console: silent — the forge branch never ran, or never spoke');
if (stats?.tris) console.log(`tris on screen: ${stats.tris.toLocaleString()}`);
console.log(`\nwrote ${file}`);
process.exit(forgeLog.some(l => l.startsWith('error')) || !swapped ? 1 : 0);
