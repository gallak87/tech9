#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Deterministic screenshot harness.
//
//   node tools/shot.mjs                          all shots at t=14
//   node tools/shot.mjs --shots ship-hero,valley --t 20
//   node tools/shot.mjs --out shots/round3 --w 1920 --h 1080
//   node tools/shot.mjs --list
//
// Boots a real GPU-backed Chromium (ANGLE/Metal on macOS — software rasterisers
// mangle bloom and normal maps), fast-forwards the sim to a fixed time so the
// frame is byte-comparable across builds, then captures each named shot.
//
// Exits non-zero and prints the console errors if the page threw — a silent
// black PNG is the worst possible review artefact.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
const FLAG = (n) => process.argv.includes(`--${n}`);

const PORT = parseInt(arg('port', '5180'), 10);
const WIDTH = parseInt(arg('w', '1920'), 10);
const HEIGHT = parseInt(arg('h', '1080'), 10);
const TIME = parseFloat(arg('t', '14'));
const QUALITY = arg('quality', 'ultra');
const ENV = arg('env', 'corneria');
const OUT = path.resolve(ROOT, arg('out', 'shots/latest'));
const TIMEOUT = parseInt(arg('timeout', '120000'), 10);

const DEFAULT_SHOTS = [
  'chase', 'ship-hero', 'ship-rear', 'ship-detail',
  'ship-engines', 'valley', 'water', 'sun', 'underside',
];

async function waitForServer(url, ms = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url, { method: 'GET' });
      if (r.ok || r.status === 404) return true;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

async function main() {
  const base = `http://127.0.0.1:${PORT}`;
  let server = null;

  if (!(await waitForServer(base, 1200))) {
    if (!existsSync(path.join(ROOT, 'node_modules'))) {
      console.error('node_modules missing — run npm install in games/vulpine first');
      process.exit(2);
    }
    server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
      cwd: ROOT, stdio: 'ignore', detached: false,
    });
    if (!(await waitForServer(base, 45000))) {
      console.error('vite failed to start on', base);
      server.kill();
      process.exit(2);
    }
  }

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-angle=metal',
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization',
      '--enable-webgl',
      '--enable-webgl2-compute-context',
      '--disable-frame-rate-limit',
      '--force-color-profile=srgb',
      '--disable-lcd-text',
      '--hide-scrollbars',
      '--mute-audio',
    ],
  });

  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });

  const errors = [];
  const logs = [];
  page.on('console', (m) => {
    const txt = `${m.type()}: ${m.text()}`;
    logs.push(txt);
    if (m.type() === 'error') errors.push(txt);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack || ''}`));

  const url = `${base}/?quality=${QUALITY}&env=${ENV}&t=${TIME}`;
  await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT });

  try {
    await page.waitForFunction(() => window.__VULPINE__ && window.__VULPINE__.ready, null,
      { timeout: TIMEOUT, polling: 100 });
  } catch (e) {
    console.error('game never reported ready.');
    console.error(errors.join('\n') || logs.slice(-40).join('\n'));
    await browser.close(); if (server) server.kill();
    process.exit(3);
  }

  if (FLAG('list')) {
    const shots = await page.evaluate(() => window.__VULPINE__.shots);
    console.log(shots.join('\n'));
    await browser.close(); if (server) server.kill();
    return;
  }

  const shots = (arg('shots') && arg('shots') !== true)
    ? String(arg('shots')).split(',').map(s => s.trim()).filter(Boolean)
    : DEFAULT_SHOTS;

  await mkdir(OUT, { recursive: true });

  const renderer = await page.evaluate(() => {
    const gl = window.__VULPINE__.engine.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  const software = /swiftshader|llvmpipe|software/i.test(renderer);
  console.log(`gpu: ${renderer}${software ? '  ⚠️  SOFTWARE RASTERISER' : ''}`);

  // --js "__VULPINE__.post({exposure:0.6})" — tune without editing source
  const js = arg('js');
  if (js && js !== true) {
    const res = await page.evaluate((src) => {
      try { return { ok: true, value: JSON.stringify(eval(src) ?? null) }; }
      catch (e) { return { ok: false, value: String(e) }; }
    }, String(js));
    console.log(`js: ${res.ok ? res.value : 'ERROR ' + res.value}`);
    if (!res.ok) { await browser.close(); if (server) server.kill(); process.exit(4); }
  }

  const written = [];
  for (const shot of shots) {
    const ok = await page.evaluate((s) => {
      const api = window.__VULPINE__;
      api.setShot(s);
      return api.shots.includes(s);
    }, shot);
    if (!ok) { console.warn(`skip unknown shot: ${shot}`); continue; }

    // let TAA-free passes settle and the plume shader advance a few frames
    await page.evaluate(() => new Promise(r => {
      let n = 0;
      const tick = () => (++n >= 6 ? r() : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    }));

    const file = path.join(OUT, `${shot}.png`);
    const buf = await page.screenshot({ type: 'png' });
    await writeFile(file, buf);
    written.push(file);
    process.stdout.write(`  ✓ ${path.relative(ROOT, file)}\n`);
  }

  const stats = await page.evaluate(() => window.__VULPINE__.stats());
  const meta = { url, time: TIME, quality: QUALITY, env: ENV, width: WIDTH, height: HEIGHT, renderer, software, stats, errors, shots: written.map(f => path.basename(f)) };
  await writeFile(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));

  console.log(`\nframe: ${stats.frameMs.toFixed(1)}ms (${stats.fps.toFixed(0)} fps)  draws: ${stats.calls}  tris: ${stats.tris.toLocaleString()}`);
  if (errors.length) {
    console.error(`\n${errors.length} console error(s):`);
    console.error(errors.slice(0, 12).join('\n'));
  }

  await browser.close();
  if (server) server.kill();
  process.exit(errors.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
