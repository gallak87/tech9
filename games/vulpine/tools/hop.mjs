#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Hop probe — is the victory lap and the transition out of a level smooth?
//
//   node tools/hop.mjs                 aquas
//   node tools/hop.mjs --level venom --seconds 16
//   node tools/hop.mjs --headed        watch it
//
// Screenshots cannot answer this: jitter is a per-frame quantity and a capture
// is one frame. This kills the boss with the dev hook, then records every
// rendered frame of the lap and the hop and reports the camera-to-ship offset,
// which is what the eye reads as shake — the hull sitting still in frame is the
// whole job of the chase rig.
//
// The number that matters is the frame-to-frame CHANGE in that offset. A rig
// that lags smoothly has a large offset and a small change; a rig that is being
// fed two different clocks has a small offset that flickers.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const ROOT = '/Users/g/code/scratch/tech9/games/vulpine';
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const LEVEL = arg('level', 'aquas');
const SECONDS = parseFloat(arg('seconds', '14'));
const PORT = parseInt(arg('port', '5410'), 10);
const HEADED = process.argv.includes('--headed');
// Frames to capture across the recording, evenly spaced. A hop is a sequence,
// and one screenshot of a sequence answers nothing.
const BURST = parseInt(arg('burst', '0'), 10);
const OUT = arg('out', 'shots/hop');

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
  if (!(await up(base))) { console.error('server did not start'); process.exit(1); }
}

const browser = await chromium.launch({ headless: !HEADED, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
await page.goto(`${base}/?quality=high&t=0.1&fight=1&hud=0&level=${LEVEL}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__VULPINE__ && window.__VULPINE__.ready, null, { timeout: 120000 });

if (BURST) await mkdir(OUT, { recursive: true });
const out = await page.evaluate(async (secs) => {
  const A = window.__VULPINE__;
  // Fast-forward to the boss. `seek` runs the fixed step with no input, so the
  // ship flies the rail and the wave cursor arms everything on the way.
  // `killBoss` is the detector as well as the hook: it returns false until one
  // is on the field, which is cheaper than guessing which state field holds it.
  A.resume();
  let bossAt = 'never spawned';
  for (let t = 8; t <= 90; t += 2) {
    A.seek(t);
    if (A.combat.killBoss()) { bossAt = `killed at t=${t}s, railZ ${A.flight.railZ.toFixed(0)}`; break; }
  }

  const cam = A.engine.camera || A.engine.renderer?.camera;
  const ship = A.ship;
  const rows = [];
  const t0 = performance.now();
  await new Promise((done) => {
    let last = performance.now();
    (function tick() {
      const now = performance.now();
      rows.push({
        t: (now - t0) / 1000,
        dt: (now - last) / 1000,
        phase: A.ctx.campaign?.phase ?? '?',
        climb: A.flight.climb,
        // camera-to-ship, the quantity the chase rig exists to hold steady
        dx: cam.position.x - ship.position.x,
        dy: cam.position.y - ship.position.y,
        dz: cam.position.z - ship.position.z,
        sy: ship.position.y,
        // Hull attitude. "Jittering between looking up or forward" is pitch;
        // "shaking side to side" is roll, or a camera roll off `bank`.
        pitch: Math.asin(Math.max(-1, Math.min(1, 2 * (ship.quaternion.w * ship.quaternion.x - ship.quaternion.z * ship.quaternion.y)))) * 180 / Math.PI,
        roll: Math.atan2(2 * (ship.quaternion.w * ship.quaternion.z + ship.quaternion.x * ship.quaternion.y),
                         1 - 2 * (ship.quaternion.x ** 2 + ship.quaternion.z ** 2)) * 180 / Math.PI,
        rate: A.flight.climbRate,
      });
      last = now;
      if ((now - t0) / 1000 < secs) requestAnimationFrame(tick); else done();
    })();
  });
  return { bossAt, rows };
}, SECONDS);

if (BURST) {
  // A second pass: the recorder above consumed the sequence, so replay it and
  // capture instead of sampling. Same boot, same kill, same clock.
  await page.goto(`${base}/?quality=high&t=0.1&fight=1&hud=1&level=${LEVEL}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__VULPINE__ && window.__VULPINE__.ready, null, { timeout: 120000 });
  await page.evaluate(() => {
    const A = window.__VULPINE__;
    A.resume();
    for (let t = 8; t <= 90; t += 2) { A.seek(t); if (A.combat.killBoss()) break; }
  });
  const gap = (SECONDS * 1000) / BURST;
  for (let i = 0; i < BURST; i++) {
    await new Promise(r => setTimeout(r, gap));
    const phase = await page.evaluate(() => window.__VULPINE__.ctx.campaign?.phase ?? '?');
    const alt = await page.evaluate(() => Math.round(window.__VULPINE__.ship.position.y));
    await page.screenshot({ path: `${OUT}/${String(i).padStart(2, '0')}-${phase}-alt${alt}.png` });
  }
  console.log(`\nburst: ${BURST} frames in ${OUT}/`);
}

if (server) server.kill();
await browser.close();

const R = out.rows;
console.log(`level ${LEVEL}  boss ${out.bossAt}  ${R.length} frames over ${SECONDS} s\n`);

// Jerk: how much the camera-to-ship offset moves frame to frame. A smooth rig
// changes it slowly and monotonically; jitter alternates sign every frame.
function report(key, rows = R) {
  const d = [];
  for (let i = 1; i < rows.length; i++) d.push(rows[i][key] - rows[i - 1][key]);
  const flips = d.reduce((n, v, i) => n + (i && Math.sign(v) !== Math.sign(d[i - 1]) && Math.abs(v) > 0.02 ? 1 : 0), 0);
  const abs = d.map(Math.abs).sort((a, b) => a - b);
  return `${key}  median ${abs[abs.length >> 1].toFixed(3)} m/frame   p95 ${abs[Math.floor(abs.length * 0.95)].toFixed(3)}`
    + `   worst ${abs[abs.length - 1].toFixed(3)}   sign flips ${flips}/${d.length}`;
}
const phases = [...new Set(R.map(r => r.phase))];
console.log(`phases seen: ${phases.join(' → ')}`);
for (const p of phases) {
  const rows = R.filter(r => r.phase === p);
  if (rows.length < 8) continue;
  const sub = R; // reported over the whole run below; per-phase counts printed here
  console.log(`  ${p.padEnd(9)} ${rows.length} frames   climb ${rows[0].climb.toFixed(0)} → ${rows[rows.length - 1].climb.toFixed(0)} m`
    + `   ship y ${rows[0].sy.toFixed(0)} → ${rows[rows.length - 1].sy.toFixed(0)}`);
}
// Split, because the two halves want different things. The lap is the level
// still being flown and keeps the ordinary chase rig — its damper, its lead and
// the shake off a capital ship coming apart all belong there. The hop is pinned
// and should read as very nearly zero on every axis.
const LAPF = R.filter(r => r.phase === 'play' || r.phase === 'lap');
const HOPF = R.filter(r => r.phase !== 'play' && r.phase !== 'lap');
for (const [name, rows] of [['lap (live rig)', LAPF], ['hop (pinned)', HOPF]]) {
  if (rows.length < 8) continue;
  console.log(`\n${name} — camera-to-ship offset, frame to frame:`);
  for (const k of ['dx', 'dy', 'dz']) console.log('  ' + report(k, rows));
  console.log(`${name} — hull attitude, degrees frame to frame:`);
  for (const k of ['pitch', 'roll']) console.log('  ' + report(k, rows));
}
const lap = R.filter(r => r.phase === 'lap' || r.phase === 'ascent');
if (lap.length) {
  const rates = lap.map(r => r.rate);
  console.log(`\nclimbRate over lap+ascent: min ${Math.min(...rates).toFixed(0)}  max ${Math.max(...rates).toFixed(0)} m/s`);
  const ps = R.map(r => r.pitch);
  console.log(`hull pitch over the whole run: ${Math.min(...ps).toFixed(0)}° (nose down) to ${Math.max(...ps).toFixed(0)}° (nose up)`);
  console.log('  first 24 frames: ' + rates.slice(0, 24).map(v => v.toFixed(0)).join(' '));
}
const dts = R.map(r => r.dt).sort((a, b) => a - b);
console.log(`\nframe dt  median ${(dts[dts.length >> 1] * 1000).toFixed(1)} ms   p95 ${(dts[Math.floor(dts.length * 0.95)] * 1000).toFixed(1)}   worst ${(dts[dts.length - 1] * 1000).toFixed(1)}`);
if (errs.length) { console.log('\nCONSOLE ERRORS:', errs.slice(0, 4).join(' | ')); process.exit(1); }
