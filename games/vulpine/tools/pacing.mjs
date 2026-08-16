// Encounter pacing probe. Screenshots cannot answer "is there dead air between
// waves" or "how long does a raptor stay shootable" — those are questions about
// the sim over time, not about one frame. This steps the fixed-step sim and
// samples the live fight 10x/second, then reports what the handoff actually
// asked for: wave-to-wave gaps, time-on-target, and entry range.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const ROOT = '/Users/g/code/scratch/tech9/games/vulpine';
const PORT = parseInt(process.argv[2] || '5250', 10);
const UNTIL = parseFloat(process.argv[3] || '26');
// Which level's encounters to measure. Without this the probe can only ever
// report on the first level, whichever one was re-paced.
const LEVEL = process.argv[4] || 'corneria';

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

const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));

await page.goto(`${base}/?quality=medium&t=0.1&fight=1&hud=0&level=${LEVEL}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__VULPINE__ && window.__VULPINE__.ready, null, { timeout: 120000 });

const data = await page.evaluate(async (until) => {
  const V = window.__VULPINE__;
  const FIXED = 1 / 120;
  const per = Math.round(0.1 / FIXED);
  const track = new Map();          // root.id -> per-foe record
  const timeline = [];
  let t = 0;
  while (t < until) {
    V.step(per);
    t += per * FIXED;
    const p = V.flight.pos;
    const foes = V.combat.foes || [];
    let live = 0, shootable = 0;
    for (const f of foes) {
      const a = f.agent;
      if (a.dying) continue;
      live++;
      const dx = a.pos.x - p.x, dy = a.pos.y - p.y, dz = a.pos.z - p.z;
      const range = Math.hypot(dx, dy, dz);
      // the rail runs toward -Z, so "ahead" is -dz; cos of the off-axis angle
      const ahead = range > 1 ? (-dz) / range : 1;
      const canShoot = range < 900 && ahead > 0.90;   // ~26 deg half-angle
      if (canShoot) shootable++;
      let r = track.get(f.root.id);
      if (!r) {
        r = { kind: f.kind, t0: +t.toFixed(1), entry: Math.round(range), shoot: 0, tEnd: 0, minR: 1e9 };
        track.set(f.root.id, r);
      }
      if (canShoot) r.shoot += 0.1;
      r.tEnd = +t.toFixed(1);
      if (range < r.minR) r.minR = Math.round(range);
    }
    timeline.push([+t.toFixed(1), Math.round(V.flight.railZ), live, shootable]);
  }
  return { foes: [...track.values()], timeline };
}, UNTIL);

/* ── report ──────────────────────────────────────────────────────────────── */
console.log('errors:', data.errs || errs.slice(0, 5));

console.log('\n--- dead air (samples with zero live hostiles) ---');
let runStart = null;
for (const [t, z, live] of data.timeline) {
  if (live === 0 && runStart === null) runStart = t;
  if (live > 0 && runStart !== null) {
    const dur = +(t - runStart).toFixed(1);
    if (dur >= 0.6) console.log(`  ${dur.toFixed(1)}s of empty sky   t=${runStart}s -> ${t}s  (railZ ${z})`);
    runStart = null;
  }
}
if (runStart !== null) console.log(`  still empty from t=${runStart}s to end`);

console.log('\n--- per-spawn: entry range, time actually shootable ---');
const byKind = new Map();
for (const f of data.foes) {
  if (!byKind.has(f.kind)) byKind.set(f.kind, []);
  byKind.get(f.kind).push(f);
}
for (const [kind, list] of byKind) {
  const sh = list.map(f => f.shoot);
  const avg = sh.reduce((a, b) => a + b, 0) / sh.length;
  console.log(`  ${kind.padEnd(9)} n=${String(list.length).padStart(2)}  ` +
    `entry ${Math.round(list.reduce((a, f) => a + f.entry, 0) / list.length)}m  ` +
    `closest ${Math.round(list.reduce((a, f) => a + f.minR, 0) / list.length)}m  ` +
    `shootable avg ${avg.toFixed(1)}s  min ${Math.min(...sh).toFixed(1)}s  max ${Math.max(...sh).toFixed(1)}s`);
}

console.log('\n--- live/shootable count over time (t, railZ, live, shootable) ---');
for (let i = 0; i < data.timeline.length; i += 5) {
  const [t, z, live, sh] = data.timeline[i];
  console.log(`  t=${String(t).padStart(5)}  z=${String(z).padStart(6)}  live=${String(live).padStart(2)}  shootable=${sh}`);
}

await browser.close();
if (server) server.kill();
