#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Diagnostic free camera. The named shots in game/shots.js all frame the level
// from inside it, which is exactly the wrong place to stand when the question
// is "what shape is this level actually". This parks the camera anywhere and
// looks anywhere, so structural problems (missing skirts, floating slabs, LOD
// seams) are visible instead of inferred.
//
//   node tools/freecam.mjs --port 5311 --pos 300,1800,-2200 --look 300,0,-2600
//   node tools/freecam.mjs --pos ... --look ... --fov 40 --wire --out shots/diag/top.png
//
// --wire draws every mesh as wireframe; --nopost bypasses the grade so what you
// read is geometry, not tone mapping.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  if (i === -1) return d;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};
const FLAG = (n) => process.argv.includes(`--${n}`);
const vec = (s, d) => (s ? s.split(',').map(Number) : d);

const PORT = parseInt(arg('port', '5311'), 10);
const W = parseInt(arg('w', '1600'), 10);
const H = parseInt(arg('h', '900'), 10);
const T = parseFloat(arg('t', '14'));
const POS = vec(arg('pos'), [300, 1600, -2200]);
const LOOK = vec(arg('look'), [300, 0, -2600]);
const FOV = parseFloat(arg('fov', '45'));
const FAR = parseFloat(arg('far', '40000'));
const OUT = path.resolve(ROOT, arg('out', 'shots/diag/freecam.png'));

async function up(url, ms = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok || r.status === 404) return true; } catch { /* wait */ }
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

const base = `http://127.0.0.1:${PORT}`;
let server = null;
if (!(await up(base, 1200))) {
  server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: 'ignore', detached: false });
  if (!(await up(base))) { console.error('server did not start'); process.exit(1); }
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
    '--disable-frame-rate-limit', '--force-color-profile=srgb', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));

const q = `${base}/?quality=ultra&env=${arg('env', 'corneria')}&t=${T}&hud=0${FLAG('nopost') ? '&nopost=1' : ''}`;
await page.goto(q, { waitUntil: 'load' });
await page.waitForFunction(() => window.__VULPINE__ && window.__VULPINE__.ready, null, { timeout: 120000 });

const info = await page.evaluate(({ pos, look, fov, far, wire, nofog, nowater, hide }) => {
  const V = window.__VULPINE__;
  V.setShot(null);
  V.pause();
  const cam = V.engine.camera;
  cam.position.set(pos[0], pos[1], pos[2]);
  cam.fov = fov;
  cam.far = far;
  cam.updateProjectionMatrix();
  cam.lookAt(look[0], look[1], look[2]);
  cam.updateMatrixWorld(true);
  if (wire) {
    V.engine.scene.traverse(o => {
      if (o.isMesh && o.material && !Array.isArray(o.material)) o.material.wireframe = true;
    });
  }
  // Fog hides exactly the structure we are looking for. It is usually FogExp2,
  // which has no `.far` — so drop the reference entirely rather than tweak it.
  const fog = { had: !!V.engine.scene.fog, type: V.engine.scene.fog?.type };
  if (nofog) V.engine.scene.fog = null;
  // The water plane is opaque from above and covers the whole world; hiding it
  // is the only way to see whether the land under it is actually there.
  let waterHidden = 0;
  if (nowater) {
    V.engine.scene.traverse(o => {
      if (o.isMesh && /water|sea|ocean/i.test(o.name || o.parent?.name || '')) { o.visible = false; waterHidden++; }
    });
  }
  // --hide <regex> against mesh name: the fastest way to assign an artefact to
  // the thing that draws it. "Is that fin the far tier?" is one run, not an
  // afternoon of inference.
  let hidden = 0;
  if (hide) {
    const re = new RegExp(hide);
    V.engine.scene.traverse(o => { if (o.isMesh && re.test(o.name)) { o.visible = false; hidden++; } });
  }
  return { pos: cam.position.toArray(), far: cam.far, fog, waterHidden, hidden };
}, {
  pos: POS, look: LOOK, fov: FOV, far: FAR,
  wire: FLAG('wire'), nofog: FLAG('nofog'), nowater: FLAG('nowater'),
  hide: typeof arg('hide') === 'string' ? arg('hide') : null,
});

await page.evaluate(() => new Promise(r => {
  let n = 0; const t = () => (++n >= 8 ? r() : requestAnimationFrame(t)); requestAnimationFrame(t);
}));

await mkdir(path.dirname(OUT), { recursive: true });
await page.screenshot({ path: OUT });
console.log('  ✓', path.relative(ROOT, OUT), JSON.stringify(info));
if (errs.length) { console.error('ERRORS:\n' + errs.slice(0, 8).join('\n')); }
await browser.close();
if (server) server.kill();
process.exit(errs.length ? 1 : 0);
