#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Where does boot go, and where does the transition freeze go? CPU sampling
// profile over navigation → `ready`, or over a forced hop, with self time
// aggregated by module and by function.
//
//   node tools/bootprof.mjs boot --quality high
//   node tools/bootprof.mjs hop --level highlands --port 5502
//   node tools/bootprof.mjs boot --top 40
//
// This is the instrument for PLAN-PERF Phase B. It answers "which code" — it
// does not answer "how many milliseconds in the owner's Chrome": headless runs
// at devicePixelRatio 1, so absolutes here are not comparable to a real-Chrome
// number. Compare arms taken the same way, and read the proportions.
//
// Two things it deliberately does not measure. GPU time is invisible to a JS
// sampler, so a pass that costs the GPU 5 ms shows as nothing here — use the
// frame-time harness for that. And a synchronous driver wait (a shader link
// queried for status) is attributed to whatever JS called it, which is the
// point: `getProgramInfoLog` appearing high in the table IS the finding.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Resolved from this file, not hard-coded: the harness has to serve whichever
// checkout it was invoked from, or a run against a git worktree silently
// measures the main tree instead.
const ROOT = fileURLToPath(new URL('..', import.meta.url));

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
const WHICH = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : 'boot';
const PORT = parseInt(arg('port', '5470'), 10);
const QUALITY = arg('quality', 'high');
const LEVEL = arg('level', 'corneria');
const ENV = arg('env', null);
const WARM = arg('warm', false) === true;
const TOP = parseInt(arg('top', '26'), 10);
// 150 µs. Finer than this and the sampler's own cost shows up in the table.
const INTERVAL = parseInt(arg('interval', '150'), 10);

const base = `http://127.0.0.1:${PORT}`;
async function up(url, ms = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok || r.status === 404) return true; } catch { /* wait */ }
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}
let server = null;
if (!(await up(base, 1200))) {
  server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  if (!(await up(base))) { console.error('vite failed'); process.exit(2); }
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e.message)));

const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: INTERVAL });

// Cold by default: a headless launch gets an empty profile, so every run would
// be a first visit anyway, and every boot number recorded in PLAN-PERF was taken
// with the bakers actually running. `--warm` measures the other case — it boots
// once to fill the texture cache, waits for the write, and profiles a reload.
const url = `${base}/?quality=${QUALITY}&hud=1&level=${LEVEL}${ENV ? `&env=${ENV}` : ''}`
  + `&texcache=${WARM ? 1 : 0}`
  + (WHICH === 'hop' ? '&t=0.1' : '');
const ready = () => page.waitForFunction(
  () => window.__VULPINE__ && window.__VULPINE__.ready, null, { timeout: 180000, polling: 100 });

let wall;
if (WARM) {
  // Fill the cache, and wait for the write to land — profiling a reload against
  // a half-written store measures neither arm.
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await ready();
  await page.waitForFunction(() => window.__VULPINE__.cacheWrote >= 0, null, { timeout: 60000, polling: 100 });
}
if (WHICH === 'boot') {
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await ready();
  wall = Date.now() - t0;
} else {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await ready();
  // Settle: a profile started on the first live frame carries boot's tail.
  await page.waitForTimeout(1500);
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  const hopped = await page.evaluate(() => {
    const cp = window.__VULPINE__.state.campaign;
    if (!cp || !cp.next) return false;
    cp.forceHop();
    return true;
  });
  if (!hopped) { console.error(`level ${LEVEL} has no next level to hop to`); process.exit(2); }
  // Through ascent and space, which is where the rebuild and the compile land.
  await page.waitForTimeout(7000);
  wall = Date.now() - t0;
}
const { profile } = await cdp.send('Profiler.stop');

/* ── aggregate ─────────────────────────────────────────────────────────────
   Self time only. `timeDeltas[i]` is the gap before sample `i`, so charging it
   to the node `samples[i]` names the function that was on top of the stack for
   that slice — which is the question. Anything else needs the tree. */
const byId = new Map(profile.nodes.map(n => [n.id, n]));
const self = new Map();
let total = 0;
for (let i = 0; i < profile.samples.length; i++) {
  const dt = profile.timeDeltas[i] || 0;
  total += dt;
  const n = byId.get(profile.samples[i]);
  if (!n) continue;
  const cf = n.callFrame;
  const file = (cf.url || '').replace(/^https?:\/\/[^/]+\//, '').replace(/\?.*$/, '');
  const where = file ? `${file}${cf.lineNumber >= 0 ? ':' + (cf.lineNumber + 1) : ''}` : '';
  self.set(`${cf.functionName || '(anonymous)'}\t${where}`, (self.get(`${cf.functionName || '(anonymous)'}\t${where}`) || 0) + dt);
}

// Roll up to "which lane" before "which line" — the module table is the one
// that has changed a decision, twice.
const byModule = new Map();
for (const [k, v] of self) {
  const f = k.split('\t')[1] || '';
  const mod = f.startsWith('src/') ? f.split('/').slice(0, 2).join('/')
    : f.includes('three') ? 'three'
      : f ? f.split('/')[0] : '(native)';
  byModule.set(mod, (byModule.get(mod) || 0) + v);
}

const ms = (us) => (us / 1000).toFixed(0).padStart(6);
const pct = (us) => ((us / (total || 1)) * 100).toFixed(1).padStart(5);

console.log(`\n  ${WHICH}  quality=${QUALITY}  level=${LEVEL}  —  wall ${wall} ms, profiled ${(total / 1000).toFixed(0)} ms`);
console.log(`\n  by module              ms      %`);
for (const [k, v] of [...byModule].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
  console.log(`  ${k.slice(0, 20).padEnd(20)}${ms(v)}  ${pct(v)}`);
}
console.log(`\n  by function (self)                                                   ms      %`);
for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, TOP)) {
  console.log(`  ${k.replace('\t', '  ').slice(0, 66).padEnd(67)}${ms(v)}  ${pct(v)}`);
}

const info = await page.evaluate(() => {
  const r = window.__VULPINE__.engine.renderer;
  return { programs: r.info.programs.length, geometries: r.info.memory.geometries, textures: r.info.memory.textures };
});
console.log(`\n  renderer: programs ${info.programs}  geometries ${info.geometries}  textures ${info.textures}`);
if (WHICH === 'hop') console.log('  (programs here is the post-hop count — the pre-hop boot count is the `boot` arm)');

await browser.close();
if (server) server.kill();
if (errors.length) {
  console.error(`\n  console errors: ${errors.length}\n    ` + errors.slice(0, 8).join('\n    '));
  process.exit(1);
}
