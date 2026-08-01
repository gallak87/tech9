#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Drives real keyboard input at the running game and reports what the sim did
// with it. The screenshot harness never presses a key, so "does the fire button
// actually fire" is a question no capture can answer.
//
//   node tools/inputtest.mjs --port 5311
//
// Presses each control in turn, runs the sim, and prints the state that should
// have changed. A control that reports no delta is broken, not subtle.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};
const PORT = parseInt(arg('port', '5311'), 10);

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
  server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  if (!(await up(base))) { console.error('server did not start'); process.exit(1); }
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));

await page.goto(`${base}/?quality=medium&t=6&hud=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__VULPINE__ && window.__VULPINE__.ready, null, { timeout: 120000 });

/** Run real frames (not seek) so input is sampled by the live loop. */
async function frames(n) {
  await page.evaluate((k) => new Promise(r => {
    let i = 0; const t = () => (++i >= k ? r() : requestAnimationFrame(t)); requestAnimationFrame(t);
  }), n);
}

const snap = () => page.evaluate(() => {
  const V = window.__VULPINE__;
  const s = V.state || {};
  return {
    fire: V.ctx.input.state.fire,
    bomb: V.ctx.input.state.bomb,
    bombPressed: V.ctx.input.state.bombPressed,
    boost: +V.flight.boostActive.toFixed(2),
    bombs: s.bombs,
    score: s.score,
    lockOn: +(s.lockOn ?? 0).toFixed(2),
    enemies: (s.enemies || []).length,
    fxAdd: V.fx.stats().addSpawned,
    railZ: Math.round(V.flight.railZ),
  };
});

const rows = [];
async function probe(label, keyDown, holdFrames = 40, keyUp = true) {
  const before = await snap();
  if (keyDown) await page.keyboard.down(keyDown);
  await frames(holdFrames);
  const during = await snap();
  if (keyDown && keyUp) await page.keyboard.up(keyDown);
  await frames(12);
  const after = await snap();
  rows.push({
    label,
    key: keyDown || '-',
    fireSeen: during.fire,
    dFx: after.fxAdd - before.fxAdd,
    dScore: after.score - before.score,
    dBombs: after.bombs - before.bombs,
    lock: during.lockOn,
    boost: during.boost,
  });
}

await frames(30);
await probe('baseline (no key)', null, 40);
await probe('fire — tap/hold', 'Space', 40);
await probe('fire — long hold (charge)', 'Space', 150);
await probe('bomb', 'KeyB', 40);
await probe('boost', 'ShiftLeft', 40);

/* ── menu capture ───────────────────────────────────────────────────────────
   The title card and the pause menu are only reachable through real key
   presses, so the screenshot harness cannot photograph them. This can. */
if (process.argv.includes('--menu')) {
  const { mkdir } = await import('node:fs/promises');
  const out = path.resolve(ROOT, 'shots/menu');
  await mkdir(out, { recursive: true });

  // pause, from the live game we have been shooting up
  await page.keyboard.press('Escape');
  await frames(30);
  await page.screenshot({ path: path.join(out, 'pause.png') });
  const paused = await page.evaluate(() => window.__VULPINE__.ctx.mode.mode);

  // menu navigation actually moves the selection
  await page.keyboard.press('KeyS');
  await frames(8);
  const moved = await page.evaluate(() => window.__VULPINE__.ctx.mode.index);
  await page.screenshot({ path: path.join(out, 'pause-nav.png') });

  // resume
  await page.keyboard.press('Escape');
  await frames(20);
  const resumed = await page.evaluate(() => window.__VULPINE__.ctx.mode.mode);

  // title card needs a boot with no seek
  await page.goto(`${base}/?quality=medium&hud=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__VULPINE__ && window.__VULPINE__.ready, null, { timeout: 120000 });
  await frames(60);
  await page.screenshot({ path: path.join(out, 'title.png') });
  const title = await page.evaluate(() => window.__VULPINE__.ctx.mode.mode);
  await page.keyboard.press('Enter');
  await frames(30);
  const launched = await page.evaluate(() => window.__VULPINE__.ctx.mode.mode);

  console.log('\n  menu: pause=%s  navIndex=%d  resume=%s  boot=%s  afterEnter=%s',
    paused, moved, resumed, title, launched);
  console.log('  wrote shots/menu/{title,pause,pause-nav}.png');
}

const final = await snap();
console.log('\n  control                     key         fire?   ΔfxParticles  Δscore  Δbombs   lock  boost');
console.log('  ' + '─'.repeat(88));
for (const r of rows) {
  console.log(`  ${r.label.padEnd(26)} ${r.key.padEnd(11)} ${String(r.fireSeen).padEnd(7)} ${String(r.dFx).padStart(12)} ${String(r.dScore).padStart(7)} ${String(r.dBombs).padStart(7)} ${String(r.lock).padStart(6)} ${String(r.boost).padStart(6)}`);
}
console.log('\n  final:', JSON.stringify(final));
if (errs.length) console.log('\n  ERRORS:\n   ' + errs.slice(0, 8).join('\n   '));

await browser.close();
if (server) server.kill();
process.exit(errs.length ? 1 : 0);
