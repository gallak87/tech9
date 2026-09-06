// ─────────────────────────────────────────────────────────────────────────────
// Shared boot for every tool in tools/.
//
// One place that knows how to start the dev server, launch a REAL GPU-backed
// Chromium, wait for `__DAWN__.ready`, and collect console errors. Thirteen
// probes are planned; thirteen copies of this would drift within a week.
//
// GPU matters. A software rasteriser (SwiftShader/llvmpipe) mangles bloom,
// normal maps and half-float precision, so a capture taken on one is not a
// capture of this game. `boot()` reports the renderer string and flags it.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function arg(name, def = null, argv = process.argv) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
export const flag = (n, argv = process.argv) => argv.includes(`--${n}`);
export const numArg = (n, d) => { const v = parseFloat(arg(n, null)); return Number.isFinite(v) ? v : d; };

export async function waitForServer(url, ms = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok || r.status === 404) return true; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/**
 * Boot the game headless and hand back a driven page.
 *
 * @returns {{page, browser, errors: string[], logs: string[], renderer: string,
 *            software: boolean, url: string, close: (code?: number) => never}}
 */
export async function boot({
  port = 5190, width = 1920, height = 1080, quality = 'ultra',
  hour = null, sim = null, shot = null, extraParams = '', timeout = 120000,
} = {}) {
  const base = `http://127.0.0.1:${port}`;
  let server = null;

  if (!(await waitForServer(base, 1200))) {
    if (!existsSync(path.join(ROOT, 'node_modules'))) {
      console.error('node_modules missing — run `npm install` in games/chronoforge-dawn first');
      process.exit(2);
    }
    server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
      cwd: ROOT, stdio: 'ignore', detached: false,
    });
    if (!(await waitForServer(base, 45000))) {
      console.error(`vite failed to start on ${base}`);
      server.kill();
      process.exit(2);
    }
  }

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-angle=metal',            // software rasterisers mangle HDR + normals
      '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization',
      '--enable-webgl',
      '--disable-frame-rate-limit',
      '--force-color-profile=srgb',
      '--disable-lcd-text',
      '--hide-scrollbars',
      '--mute-audio',
    ],
  });

  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [], logs = [];
  page.on('console', (m) => {
    const txt = `${m.type()}: ${m.text()}`;
    logs.push(txt);
    if (m.type() === 'error' || m.type() === 'warning') logs.push('');
    if (m.type() === 'error') errors.push(txt);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack || ''}`));

  const q = new URLSearchParams({ quality });
  /* Review captures frame the WORLD, not the player. Traversal spawns by
     default now (it graduated out of ?play=1), and a spawned player drags
     ctx.world.focus to itself — which would silently re-aim every shot in
     the repo. Opt out unless the caller asked for play explicitly. */
  if (!/(^|&)play=/.test(extraParams)) q.set('play', '0');
  if (hour != null) q.set('hour', String(hour));
  if (sim != null) q.set('sim', String(sim));
  if (shot) q.set('shot', shot);
  const url = `${base}/?${q}${extraParams ? '&' + extraParams : ''}`;

  const close = async (code) => {
    await browser.close().catch(() => {});
    if (server) server.kill();
    if (code != null) process.exit(code);
  };

  await page.goto(url, { waitUntil: 'load', timeout });

  try {
    await page.waitForFunction(() => window.__DAWN__ && window.__DAWN__.ready, null,
      { timeout, polling: 100 });
    /* A forged character's body is a fetch, and it lands well after `ready`.
       Measured: ~120 frames for Kaida's 10.5 MB glb. Every capture taken before
       it photographs the code-built placeholder instead — silently, since the
       placeholder renders fine. Wait it out. */
    await page.waitForFunction(() => (window.__DAWN__.forgePending?.() ?? 0) === 0, null,
      { timeout, polling: 100 });
  } catch {
    console.error('game never reported ready.');
    console.error(errors.join('\n') || logs.slice(-40).join('\n'));
    await close(3);
  }

  const renderer = await page.evaluate(() => {
    const gl = window.__DAWN__.engine.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  const software = /swiftshader|llvmpipe|software/i.test(renderer);

  return { page, browser, server, errors, logs, renderer, software, url, close };
}

/** Present N frames and wait for them. A screenshot taken without this catches
 *  whatever was in the buffer, which is not necessarily the frame you set up. */
export const settle = (page, n = 6) => page.evaluate((frames) => new Promise((r) => {
  let i = 0;
  const tick = () => (++i >= frames ? r() : requestAnimationFrame(tick));
  requestAnimationFrame(tick);
}), n);

/** Run an expression in the page, failing loudly. `--js` uses this. */
export async function evalInPage(page, src) {
  const res = await page.evaluate((s) => {
    try { return { ok: true, value: JSON.stringify(eval(s) ?? null) }; }
    catch (e) { return { ok: false, value: String(e) }; }
  }, String(src));
  return res;
}
