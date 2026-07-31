#!/usr/bin/env node
// Probe harness: boots the game, walks named shots, prints the linear-light
// histogram for each. Optional --js runs before probing.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const ROOT = '/Users/g/code/scratch/tech9/games/vulpine';
function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
const PORT = parseInt(arg('port', '5193'), 10);
const TIME = parseFloat(arg('t', '14'));
const QUALITY = arg('quality', 'ultra');
const ENV = arg('env', 'corneria');
const SHOTS = String(arg('shots', 'sun,chase,water,ship-hero')).split(',');

async function waitForServer(url, ms = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok || r.status === 404) return true; } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

const base = `http://127.0.0.1:${PORT}`;
let server = null;
if (!(await waitForServer(base, 1200))) {
  server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  if (!(await waitForServer(base, 45000))) { console.error('vite failed'); process.exit(2); }
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
    '--enable-webgl', '--disable-frame-rate-limit', '--force-color-profile=srgb', '--hide-scrollbars', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e.message)));

await page.goto(`${base}/?quality=${QUALITY}&env=${ENV}&t=${TIME}&hud=0`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__VULPINE__ && window.__VULPINE__.ready, null, { timeout: 120000, polling: 100 });

const js = arg('js');
if (js && js !== true) {
  const r = await page.evaluate(s => { try { return { ok: 1, v: JSON.stringify(eval(s) ?? null) }; } catch (e) { return { ok: 0, v: String(e) }; } }, String(js));
  console.log('js:', r.ok ? r.v : 'ERROR ' + r.v);
}

const settle = () => page.evaluate(() => new Promise(r => { let n = 0; const t = () => (++n >= 8 ? r() : requestAnimationFrame(t)); requestAnimationFrame(t); }));

const fmt = (s) => s
  ? `med ${s.median.toFixed(3)}  p90 ${s.p90.toFixed(2)}  p99 ${s.p99.toFixed(2)}  max ${s.max.toFixed(1)}`
  + `  clip% ${s.clippedPct.toFixed(2)}  black% ${s.blackPct.toFixed(1)}  WHITE% ${s.whitePct.toFixed(2)}`
  : 'n/a';

// Tile map. Left grid = mean luminance, right grid = % of the tile that is
// flat white. Reading them side by side tells you whether a bright region is
// bright-with-detail or simply gone.
const RAMP = ' .:-=+*#%@';
function grids(t) {
  if (!t) return [];
  const out = [];
  for (let r = 0; r < t.rows; r++) {
    let a = '', b = '';
    for (let c = 0; c < t.cols; c++) {
      const i = r * t.cols + c;
      const v = t.mean[i];
      a += RAMP[Math.min(9, Math.max(0, Math.round(Math.log2(v * 8 + 1) * 1.9)))];
      const w = t.whitePct[i];
      b += w < 1 ? '.' : w < 10 ? '1' : w < 30 ? '3' : w < 60 ? '6' : w < 90 ? '8' : '#';
    }
    out.push('    ' + a + '   ' + b);
  }
  return out;
}

for (const shot of SHOTS) {
  await page.evaluate(s => window.__VULPINE__.setShot(s), shot);
  await settle();
  const p = await page.evaluate(() => {
    const r = window.__VULPINE__.probe();
    // Float64Array does not survive structured cloning through evaluate cleanly
    for (const k of ['raw', 'exposed', 'composited']) {
      if (r[k]?.tiles) {
        r[k].tiles.mean = Array.from(r[k].tiles.mean);
        r[k].tiles.whitePct = Array.from(r[k].tiles.whitePct);
      }
    }
    return r;
  });
  console.log(`\n[${shot}]  exposure ${p.exposure}   whiteAt ${p.whiteAt.toFixed(2)}`);
  console.log(`  scene(raw)   ${fmt(p.raw)}`);
  console.log(`  scene(exp)   ${fmt(p.exposed)}`);
  console.log(`  composited   ${fmt(p.composited)}`);
  console.log('    ── luminance ──     ── blown ──');
  for (const line of grids(p.composited?.tiles)) console.log(line);
}

const stats = await page.evaluate(() => window.__VULPINE__.stats());
console.log(`\nframe ${stats.frameMs.toFixed(1)}ms  ${stats.fps.toFixed(0)}fps  draws ${stats.calls}  tris ${stats.tris}`);
if (errors.length) console.error('\nERRORS:\n' + errors.slice(0, 10).join('\n'));
await browser.close();
if (server) server.kill();
process.exit(errors.length ? 1 : 0);
