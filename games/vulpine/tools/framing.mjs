// Where does the ship actually sit in the frame, over time?
//
// "The nose swings left then right forever" is a question about the ship's
// position and orientation *in screen space* across many seconds, which no
// single screenshot can answer. This steps the sim one tick at a time (the
// camera damper only advances inside a step, so batching ticks changes the
// answer) and reports, per sample:
//
//   ndcX      ship centre in normalised device coords, -1 left .. +1 right
//   offDeg    angle between camera forward and the direction to the ship
//   noseDeg   angle between camera forward and the hull's nose axis
//
// A rigid chase camera holds all three near zero. Drift in offDeg is the ship
// sliding across the frame; drift in noseDeg is the hull rotating in place.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const ROOT = '/Users/g/code/scratch/tech9/games/vulpine';
const PORT = parseInt(process.argv[2] || '5262', 10);
const UNTIL = parseFloat(process.argv[3] || '40');

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

await page.goto(`${base}/?quality=low&t=0.1&hud=0&nomenu=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__VULPINE__ && window.__VULPINE__.ready, null, { timeout: 120000 });

const rows = await page.evaluate(async (until) => {
  const V = window.__VULPINE__;
  const T = V.THREE;
  const FIXED = 1 / 120;
  const out = [];
  const fwd = new T.Vector3(), toShip = new T.Vector3(), nose = new T.Vector3(), p = new T.Vector3();
  const DEG = 180 / Math.PI;
  let t = 0;
  while (t < until) {
    V.step(1);
    t += FIXED;
    if (out.length > t * 10) continue;         // sample 10x/s
    const cam = V.engine.camera;
    cam.updateMatrixWorld();
    fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    p.copy(V.ship.position);
    toShip.copy(p).sub(cam.position).normalize();
    nose.set(0, 0, -1).applyQuaternion(V.ship.quaternion);
    // signed horizontal angle: project onto the camera's right axis
    const right = new T.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const ndc = p.clone().project(cam);
    const e = new T.Euler().setFromQuaternion(cam.quaternion, 'YXZ');
    const rd = V.flight.railDir;
    out.push({
      t: +t.toFixed(1),
      z: Math.round(V.flight.railZ),
      ndcX: +ndc.x.toFixed(3),
      ndcY: +ndc.y.toFixed(3),
      offDeg: +(Math.asin(T.MathUtils.clamp(toShip.dot(right), -1, 1)) * DEG).toFixed(2),
      noseDeg: +(Math.asin(T.MathUtils.clamp(nose.dot(right), -1, 1)) * DEG).toFixed(2),
      stick: +(V.flight.yaw * DEG).toFixed(2),
      rail: +(Math.atan2(rd.x, -rd.z) * DEG).toFixed(2),
      camY: +(e.y * DEG).toFixed(2),
    });
  }
  return out;
}, UNTIL);

await browser.close();
if (server) server.kill();

const span = (k) => {
  const v = rows.map(r => r[k]);
  return { min: Math.min(...v), max: Math.max(...v), pp: +(Math.max(...v) - Math.min(...v)).toFixed(3) };
};
console.log('  t      z    ndcX   offDeg  noseDeg    stick     rail     camY');
for (const r of rows) {
  if (Math.round(r.t * 10) % 20) continue;      // print every 2 s
  console.log(`${String(r.t).padStart(5)} ${String(r.z).padStart(6)} ${String(r.ndcX).padStart(7)} ${String(r.offDeg).padStart(8)} ${String(r.noseDeg).padStart(8)} ${String(r.stick).padStart(8)} ${String(r.rail).padStart(8)} ${String(r.camY).padStart(8)}`);
}
for (const k of ['ndcX', 'ndcY', 'offDeg', 'noseDeg', 'stick', 'rail', 'camY']) {
  const s = span(k);
  console.log(`${k.padEnd(8)} min ${String(s.min).padStart(7)}  max ${String(s.max).padStart(7)}  peak-to-peak ${s.pp}`);
}
if (errs.length) { console.error('\nconsole errors:\n' + errs.slice(0, 8).join('\n')); process.exit(1); }
