#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Does a locked round actually track?
//
// The lock reticle is a HUD element and the bolt is a particle, so every
// screenshot in the world can show a beautiful lock-on over a shot that flew
// dead straight and missed. This steps the fixed-step sim, finds rounds with a
// live `seek`, and follows each one frame to frame — reporting how far its
// heading turned between spawn and death, how close it got to its target, and
// whether it struck.
//
//   node tools/homing.mjs --port 5243 --secs 45
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
const PORT = parseInt(arg('port', '5243'), 10);
const SECS = parseFloat(arg('secs', '45'));

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

const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));

await page.goto(`${base}/?quality=low&env=corneria&hud=0&fight=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__VULPINE__ && window.__VULPINE__.ready, null, { timeout: 120000 });

const out = await page.evaluate(async (secs) => {
  const V = window.__VULPINE__;
  const dt = 1 / 60;
  const tracked = new Map();     // bullet → record
  const done = [];
  let straight = 0, homing = 0;

  // same swept test combat.js uses to decide a hit
  const segPointDist = (ax, ay, az, bx, by, bz, p) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    let t = len2 > 1e-9 ? ((p.x - ax) * dx + (p.y - ay) * dy + (p.z - az) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(ax + dx * t - p.x, ay + dy * t - p.y, az + dz * t - p.z);
  };

  const norm = (b) => {
    const s = Math.hypot(b.vx, b.vy, b.vz) || 1;
    return [b.vx / s, b.vy / s, b.vz / s];
  };

  for (let i = 0; i < secs * 60; i++) {
    V.step(dt);
    const bs = V.combat.bullets || [];
    const live = new Set(bs);
    for (const b of bs) {
      if (b.enemy) continue;
      if (!b.turn) { if (!tracked.has(b)) straight++; continue; }
      let r = tracked.get(b);
      if (!r) {
        r = {
          charged: !!b.charged, dir0: norm(b), minDist: Infinity, frames: 0,
          spawnDist: 0, radius: 0, lostTarget: false,
        };
        const t0 = b.seek && b.seek.agent;
        if (t0) {
          r.spawnDist = Math.hypot(b.x - t0.pos.x, b.y - t0.pos.y, b.z - t0.pos.z);
          r.radius = (t0.spec ? t0.spec.radius : 3) + b.r;
        }
        tracked.set(b, r);
        homing++;
      }
      r.frames++;
      r.dirN = norm(b);
      r.endLife = b.life;
      const t = b.seek && b.seek.agent;
      // `b.seek` is nulled by the sim when the target dies — from that moment the
      // round is unguided through no fault of the guidance, so score it apart.
      if (!t || t.dying) r.lostTarget = true;
      else {
        // Sampling the gap once per tick is not good enough to say hit or miss:
        // a tap round covers 16 m per tick, so the true closest approach happens
        // between two samples and a clean strike reads as a 13 m near miss. The
        // sim tests the swept segment; so must this, or the measurement disagrees
        // with the thing it is measuring.
        const d = r.prev
          ? segPointDist(r.prev[0], r.prev[1], r.prev[2], b.x, b.y, b.z, t.pos)
          : Math.hypot(b.x - t.pos.x, b.y - t.pos.y, b.z - t.pos.z);
        if (d < r.minDist) r.minDist = d;
      }
      r.prev = [b.x, b.y, b.z];
    }
    for (const [b, r] of tracked) {
      if (live.has(b)) continue;
      const c = Math.max(-1, Math.min(1, r.dir0[0] * r.dirN[0] + r.dir0[1] * r.dirN[1] + r.dir0[2] * r.dirN[2]));
      r.turnDeg = Math.acos(c) * 57.2958;
      done.push(r);
      tracked.delete(b);
    }
  }

  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const med = (a, f) => { const v = a.map(f).sort((x, y) => x - y); return v[v.length >> 1]; };
  const grp = (k) => {
    const all = done.filter(r => r.charged === k && isFinite(r.minDist));
    if (!all.length) return null;
    // Only rounds that kept a live target for the whole flight test the guidance.
    const fair = all.filter(r => !r.lostTarget);
    const hit = fair.filter(r => r.minDist <= r.radius);
    return {
      fired: all.length,
      targetDiedInFlight: all.length - fair.length,
      guidedToCompletion: fair.length,
      hits: hit.length,
      hitRate: fair.length ? +(hit.length / fair.length).toFixed(2) : null,
      medianSpawnRangeM: fair.length ? +med(fair, r => r.spawnDist).toFixed(0) : null,
      medianClosestM: fair.length ? +med(fair, r => r.minDist).toFixed(1) : null,
      medianTurnDeg: +med(all, r => r.turnDeg).toFixed(1),
      maxTurnDeg: +Math.max(...all.map(r => r.turnDeg)).toFixed(1),
      rounds: fair.map(r => ({
        closest: +r.minDist.toFixed(1), radius: +r.radius.toFixed(1),
        spawn: +r.spawnDist.toFixed(0), turn: +r.turnDeg.toFixed(1),
        frames: r.frames, endLife: +r.endLife.toFixed(3),
      })).sort((a, b2) => a.closest - b2.closest),
    };
  };
  const d = V.combat.diag;
  return {
    // counted inside the sim, where the damage is actually applied
    truth: {
      fired: d.homingFired,
      hit: d.homingHit,
      hitRate: d.homingFired ? +(d.homingHit / d.homingFired).toFixed(2) : null,
      lostTargetMidFlight: d.homingLostTarget,
      expired: d.homingExpired,
    },
    straightRounds: straight, homingRounds: homing,
    charged: grp(true), tap: grp(false),
  };
}, SECS);

console.log(JSON.stringify(out, null, 2));
if (errs.length) { console.error('\nconsole errors:'); for (const e of errs.slice(0, 8)) console.error('  ' + e); }
await browser.close();
if (server) server.kill();
process.exit(errs.length ? 1 : 0);
