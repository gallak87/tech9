#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Pilot harness — drives the game with real keyboard input and measures what a
// player would experience. Every other probe in this directory either steps the
// sim with no input (`pacing`, `bossprobe`) or presses one key at a time
// (`inputtest`); this one flies.
//
//   node tools/pilot.mjs aim                 reticle lead direction and throw
//   node tools/pilot.mjs fly --seconds 90    autopilot playthrough, playability
//   node tools/pilot.mjs drops               every drop reaches the player
//   node tools/pilot.mjs roll                barrel roll: spin, dodge, recovery
//   node tools/pilot.mjs aim --params wpn=3  extra URL switches
//   node tools/pilot.mjs fly --headed        watch it fly, HUD and all
//   node tools/pilot.mjs fly --headed --chrome    …in the real Chrome, not Chromium
//   node tools/pilot.mjs roll --film out/    write a PNG per sample
//
// Adding a scenario: drop an entry in SCENARIOS. It gets `{ page, frames, keys,
// sample, snap, evaluate }` and returns whatever its own `print` understands, so
// a new question does not mean a new file or a new copy of the boot code.
//
// What this can and cannot do: it measures. "Does the reticle lead the turn" and
// "can the level be flown end to end without dying" are measurable and live here.
// Whether the flying *feels* good is not — that stays a hands-on question, and
// the dev-panel knobs exist for it.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
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
const WHICH = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : 'aim';
const PORT = parseInt(arg('port', '5460'), 10);
const SECONDS = parseFloat(arg('seconds', '75'));
const EXTRA = arg('params', '') ? '&' + String(arg('params', '')).replace(/^&/, '') : '';
const QUALITY = arg('quality', 'low');
const FILM = arg('film', null);          // directory for per-sample PNGs
// Sim seconds to seek to before flying. ~44 lands just short of the carrier, so
// the boss fight can be exercised without flying the 8 km in front of it.
const START_T = arg('t', '6');

/* ── boot ─────────────────────────────────────────────────────────────────── */

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

// --headed to watch the autopilot fly. Slowed slightly so the input is legible.
const HEADED = !!arg('headed', false);
// --chrome runs the installed Google Chrome instead of Playwright's bundled
// Chromium. Not cosmetic: the two disagree on GPU paths, and this project has an
// open measurement (the motion-blur mask's 8 ms) that is suspected to be a
// headless-ANGLE artefact. A number taken here is the one the owner sees.
const CHROME = !!arg('chrome', false);
const browser = await chromium.launch({
  headless: !HEADED,
  ...(CHROME ? { channel: 'chrome' } : {}),
  slowMo: HEADED ? 12 : 0,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
// The HUD stays ON. This is a pilot harness: the crosshair and the lock box are
// the instruments the core loop is flown on, so hiding them models a player
// flying blind. `--nohud` is there for the rare capture that wants a clean frame.
// (It never affected the measurements either way — lock state lives in combat.js,
// and screen positions here come from projecting world points directly.)
const HUD = arg('nohud', false) ? 0 : 1;
await page.goto(`${base}/?quality=${QUALITY}&t=${START_T}&nomenu=1&hud=${HUD}${EXTRA}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__VULPINE__ && window.__VULPINE__.ready, null, { timeout: 180000 });
await page.evaluate(() => window.focus());

/** Wait n rendered frames. The sim advances on its own clock; this yields to it. */
const frames = (n) => page.evaluate(
  (k) => new Promise(r => { let i = 0; const t = () => (++i >= k ? r() : requestAnimationFrame(t)); requestAnimationFrame(t); }),
  n,
);
const keys = {
  down: (k) => page.keyboard.down(k),
  up: (k) => page.keyboard.up(k),
  async hold(k, n) { await this.down(k); await frames(n); await this.up(k); },
};

/**
 * One sample of everything a pilot scenario tends to want. Projects the same
 * world points the game uses through the live camera, so screen positions are
 * what the player sees rather than what the tuning intends.
 */
const sample = () => page.evaluate(() => {
  const V = window.__VULPINE__;
  const cam = V.engine.camera;
  const proj = (p) => { const v = p.clone().project(cam); return Number.isFinite(v.x) ? v : null; };
  const shipN = proj(V.ship.position);
  const aimN = V.state.aimPoint ? proj(V.state.aimPoint) : null;
  const st = V.state;
  return {
    t: +st.time.toFixed(2),
    railZ: Math.round(V.flight.railZ),
    offX: +V.flight.off.x.toFixed(1), offY: +V.flight.off.y.toFixed(1),
    offVelX: +V.flight.offVel.x.toFixed(1), offVelY: +V.flight.offVel.y.toFixed(1),
    shipX: shipN ? +shipN.x.toFixed(3) : null, shipY: shipN ? +shipN.y.toFixed(3) : null,
    aimX: aimN ? +aimN.x.toFixed(3) : null, aimY: aimN ? +aimN.y.toFixed(3) : null,
    leadX: +V.flight.aimLeadX.toFixed(3), leadY: +V.flight.aimLeadY.toFixed(3),
    // Crab: the angle between where the hull points and where it is actually
    // going. Non-zero with no input means the engine trails will visibly veer,
    // because the trail is laid along travel while the nozzles point along the
    // hull. This is the number behind "the trails veer without me steering".
    crabDeg: (() => {
      const fwd = new V.THREE.Vector3(0, 0, -1).applyQuaternion(V.ship.quaternion);
      const vel = V.flight.railDir.clone().multiplyScalar(V.flight.speed);
      vel.x += V.flight.offVel.x; vel.y += V.flight.offVel.y;
      return +V.THREE.MathUtils.radToDeg(fwd.angleTo(vel.normalize())).toFixed(2);
    })(),
    shield: Math.round(st.shieldRaw), lives: st.lives, score: st.score, kills: st.hits,
    outcome: st.outcome, live: st.enemies ? st.enemies.length : 0,
    boss: !!V.combat.boss, weapon: st.weapon ? st.weapon.label : '?',
    fps: Math.round(1000 / V.engine.avgFrameMs),
    // Attitude, from the hull's own basis rather than from `flight.bank`: bank
    // and the barrel-roll sweep are separate terms summed into one Euler, and
    // the question every attitude scenario asks is what came out of it. `upX` is
    // the hull's up vector along world +X — positive is top-tipped-right, which
    // a camera behind the ship sees as a clockwise roll.
    upX: +new V.THREE.Vector3(0, 1, 0).applyQuaternion(V.ship.quaternion).x.toFixed(3),
    rollT: +V.flight.rollT.toFixed(3), rollDir: V.flight.rollDir,
    bank: +V.flight.bank.toFixed(3),
  };
});
/** Write a PNG beside the samples. No-op unless --film named a directory. */
const snap = async (name) => {
  if (!FILM) return;
  await mkdir(FILM, { recursive: true });
  await writeFile(`${FILM}/${name}.png`, await page.screenshot());
};
const ctx = { page, frames, keys, sample, snap, evaluate: (fn, a) => page.evaluate(fn, a) };

/* ── scenarios ────────────────────────────────────────────────────────────── */

const SCENARIOS = {
  /**
   * Does the crosshair lead the turn? `dNdc` (reticle minus hull, in NDC) must
   * carry the same sign as the offset velocity. Same sign = out ahead on the side
   * you are travelling toward. Opposite = it trails you, which reads as the
   * crosshair fighting the stick.
   */
  aim: {
    async run({ frames, keys, sample }) {
      // Everything is measured as a *displacement from neutral*. Comparing the
      // reticle's absolute position to the hull's does not work: the hull sits
      // ~0.3 ndc below frame centre by design (camUp / camLookUp), so that fixed
      // bias reads as a vertical inversion no matter which way the aim moves. An
      // earlier version of this probe did exactly that and reported two false
      // inversions, which is worse than no probe.
      await frames(45);
      const zero = await sample();
      const arm = async (label, key, axis) => {
        await keys.down(key);
        await frames(55);
        const s = await sample();
        await keys.up(key);
        await frames(45);
        return { ...s, label, axis };
      };
      return {
        zero,
        arms: [
          await arm('hold RIGHT (D)', 'KeyD', 'x'),
          await arm('hold LEFT  (A)', 'KeyA', 'x'),
          await arm('hold UP    (W)', 'KeyW', 'y'),
          await arm('hold DOWN  (S)', 'KeyS', 'y'),
        ],
      };
    },
    print({ zero, arms }) {
      console.log('Reticle lead, as displacement from neutral. NDC, half-frame = 1.0.');
      console.log(`neutral: hull (${zero.shipX}, ${zero.shipY})  reticle (${zero.aimX}, ${zero.aimY})`);
      // Hands-off crab is the one that matters: with no input the hull should be
      // pointed exactly where it is travelling, or the trails veer on their own.
      const crabVerdict = zero.crabDeg < 1.5 ? 'aligned' : '*** CRABBING — trails will veer ***';
      console.log(`hands-off crab: ${zero.crabDeg}°  ${crabVerdict}`);
      console.log(`under input:    ${arms.map(a => `${a.label.trim().split(' ')[1]} ${a.crabDeg}°`).join('  ')}\n`);
      console.log('  TRACKS = reticle moves the way you steer.  LEADS = it outruns the hull.\n');
      console.log('  input             offVel    dHull     dAim   ratio   verdict');
      let bad = 0;
      for (const r of arms) {
        const x = r.axis === 'x';
        const vel = x ? r.offVelX : r.offVelY;
        const dHull = (x ? r.shipX - zero.shipX : r.shipY - zero.shipY);
        const dAim = (x ? r.aimX - zero.aimX : r.aimY - zero.aimY);
        const tracks = Math.sign(dAim) === Math.sign(vel) && Math.abs(dAim) > 0.02;
        const leads = tracks && Math.abs(dAim) > Math.abs(dHull);
        if (!tracks) bad++;
        const ratio = dHull === 0 ? '-' : (dAim / dHull).toFixed(2);
        const verdict = !tracks ? '*** INVERTED ***' : (leads ? 'TRACKS + LEADS' : 'tracks, but trails the hull');
        console.log(`  ${r.label} ${String(vel).padStart(7)} ${String(dHull.toFixed(3)).padStart(8)} ${String(dAim.toFixed(3)).padStart(8)} ${String(ratio).padStart(7)}   ${verdict}`);
      }
      console.log(bad ? `\n  ${bad} of ${arms.length} axes INVERTED.` : '\n  all four axes track the stick.');
    },
  },

  /**
   * The level transition, end to end: kill the carrier, fly the lap, hop, and
   * arrive on Fichina. Checks the three things that make it seamless rather than
   * a loading screen — the sim never stops, the rail lands back at 0 on the new
   * world, and the terrain is never on screen while it is being rebuilt.
   */
  hop: {
    async run({ frames, sample, evaluate, snap }) {
      const rows = [];
      // Straight to the carrier and kill it: the fight is `fly`'s job, and
      // replaying 8 km per run to test the last 15 s is the wrong trade.
      await evaluate(() => {
        const V = window.__VULPINE__;
        V.seek(48);
        let g = 0;
        while (!V.combat.boss && g++ < 400) V.step(30);
        V.combat.killBoss();
      });
      const t0 = Date.now();
      let last = null, seen = 0;
      while ((Date.now() - t0) / 1000 < 45) {
        const s = await sample();
        const c = await evaluate(() => {
          const V = window.__VULPINE__;
          const cp = V.state.campaign;
          return {
            phase: cp ? cp.phase : 'none',
            level: cp ? cp.level.id : '?',
            build: +V.world.buildProgress.toFixed(2),
            worldVis: V.world.root.visible,
            simActive: V.ctx.mode.simActive,
          };
        });
        const row = { ...s, ...c };
        rows.push(row);
        // Snapping on the phase *change* films the first frame of each phase,
        // which is precisely the frame on which nothing has happened yet — an
        // ascent shot taken there shows a ship that has not climbed. Film a
        // start/middle/end of every phase instead.
        if (c.phase !== last) { seen = 0; last = c.phase; }
        if (c.phase !== 'play' && [0, 4, 9].includes(seen)) {
          await snap(`${c.phase}-${['a', 'b', 'c'][[0, 4, 9].indexOf(seen)]}`);
        }
        seen++;
        if (c.level === 'fichina' && c.phase === 'play') break;
        await frames(8);
      }
      return rows;
    },
    print(rows) {
      if (!rows.length) { console.log('no samples'); return; }
      console.log('  phase        level     railZ  build  worldVis  simActive   fps');
      let prev = null;
      for (const r of rows) {
        if (r.phase === prev) continue;              // one line per phase change
        prev = r.phase;
        console.log(`  ${r.phase.padEnd(11)} ${r.level.padEnd(9)} ${String(r.railZ).padStart(6)}`
          + ` ${String(r.build).padStart(5)}  ${String(r.worldVis).padStart(8)}  ${String(r.simActive).padStart(9)} ${String(r.fps).padStart(5)}`);
      }
      const last = rows[rows.length - 1];
      const stalled = rows.filter(r => !r.simActive).length;
      // Terrain visible while the mesh is incomplete is the defect the whole
      // sequence exists to prevent — it would show the world building itself.
      const leak = rows.filter(r => r.worldVis && r.build < 1).length;
      console.log(`\n  arrived on: ${last.level} (phase ${last.phase})  railZ ${last.railZ}`);
      console.log(`  sim stopped on ${stalled} of ${rows.length} samples  ${stalled ? '*** THE SIM PAUSED ***' : 'never — flown throughout'}`);
      console.log(`  terrain visible mid-rebuild on ${leak} samples  ${leak ? '*** REBUILD ON SCREEN ***' : 'never'}`);
      console.log(`  fps min ${Math.min(...rows.map(r => r.fps))} / max ${Math.max(...rows.map(r => r.fps))}`);
    },
  },

  /**
   * The barrel roll, on three questions the eye cannot settle on its own:
   * does it spin the way it dodges, how far does the dodge throw you, and does
   * any of that come back. Sampled at 3-frame intervals because the whole
   * manoeuvre is `rollDuration` 0.62 s — coarser than that and the sweep is two
   * points and an assumption.
   */
  /**
   * Is the transition smooth? `hop` above answers whether it is *correct* — the
   * sim never stops, the rail lands at 0, no terrain leaks on screen. It samples
   * every 8 frames, so it structurally cannot see a jolt.
   *
   * This records every rendered frame from inside the page (a round trip per
   * frame would perturb the thing being measured) and reports second differences
   * of camera position and view direction. A discontinuity in *acceleration* is
   * what reads as a jump — the same measurement that found the camera snap on a
   * held turn, where per-tick accel went 0.854 m -> 0.102.
   */
  hopjolt: {
    async run({ frames, evaluate, snap }) {
      // Straight into the hop from wherever the ship is — this is dev key 3
      // (Skip level), which is how the owner reproduces it.
      await evaluate(() => {
        const V = window.__VULPINE__;
        V._jolt = [];
        const cam = V.engine.camera;
        const fwd = new V.THREE.Vector3();
        let last = performance.now();
        const rec = () => {
          const now = performance.now();
          const dt = (now - last) / 1000; last = now;
          cam.getWorldDirection(fwd);
          const cp = V.state.campaign;
          const s = V.ship.position.clone().project(cam);
          V._jolt.push({
            dt: +dt.toFixed(4),
            phase: cp ? cp.phase : 'none',
            cx: cam.position.x, cy: cam.position.y, cz: cam.position.z,
            fx: fwd.x, fy: fwd.y, fz: fwd.z,
            ndcX: Number.isFinite(s.x) ? +s.x.toFixed(4) : null,
            ndcY: Number.isFinite(s.y) ? +s.y.toFixed(4) : null,
            climb: +V.flight.climb.toFixed(1),
            railZ: Math.round(V.flight.railZ),
            vis: V.world.root.visible,
            build: +V.world.buildProgress.toFixed(2),
          });
          if (V._joltOn) requestAnimationFrame(rec);
        };
        V._joltOn = true;
        requestAnimationFrame(rec);
        V.state.campaign.forceHop();
      });
      // The hop is ~14.5 s of phases plus the lap; give it room, then stop.
      const t0 = Date.now();
      let done = false;
      while (!done && (Date.now() - t0) / 1000 < 40) {
        await frames(30);
        done = await evaluate(() => window.__VULPINE__.state.campaign.phase === 'play'
          && window.__VULPINE__.state.campaign.level.id !== 'corneria');
      }
      await frames(20);
      await snap('arrived');
      return evaluate(() => { window.__VULPINE__._joltOn = false; return window.__VULPINE__._jolt; });
    },
    print(rows) {
      if (rows.length < 4) { console.log('no samples'); return; }
      const D = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy, a.cz - b.cz);
      const ang = (a, b) => {
        const d = Math.min(1, Math.max(-1, a.fx * b.fx + a.fy * b.fy + a.fz * b.fz));
        return Math.acos(d) * 180 / Math.PI;
      };
      const ev = [];
      for (let i = 2; i < rows.length; i++) {
        const [p, q, r] = [rows[i - 2], rows[i - 1], rows[i]];
        ev.push({
          i, phase: r.phase, railZ: r.railZ, climb: r.climb, vis: r.vis,
          // Second differences: the frame-to-frame *change* in step size. A
          // constant velocity, however fast, reads as zero here; only a
          // discontinuity shows up.
          posJolt: Math.abs(D(r, q) - D(q, p)),
          angJolt: Math.abs(ang(r, q) - ang(q, p)),
          ndcJump: (r.ndcX != null && q.ndcX != null)
            ? Math.hypot(r.ndcX - q.ndcX, r.ndcY - q.ndcY) : 0,
        });
      }
      const phases = [...new Set(rows.map(r => r.phase))];
      console.log(`  ${rows.length} frames, phases: ${phases.join(' → ')}`);
      console.log('\n  worst 12 frames by camera position jolt (m/frame²):');
      console.log('    frame  phase        railZ   climb  vis   posJolt   angJolt   ndcJump');
      for (const e of [...ev].sort((a, b) => b.posJolt - a.posJolt).slice(0, 12)) {
        console.log(`    ${String(e.i).padStart(5)}  ${e.phase.padEnd(11)} ${String(e.railZ).padStart(6)}`
          + ` ${String(e.climb).padStart(7)} ${String(e.vis).padStart(5)}`
          + ` ${e.posJolt.toFixed(2).padStart(9)} ${e.angJolt.toFixed(3).padStart(9)} ${e.ndcJump.toFixed(4).padStart(9)}`);
      }
      console.log('\n  worst 6 by view-direction jolt (deg/frame²):');
      for (const e of [...ev].sort((a, b) => b.angJolt - a.angJolt).slice(0, 6)) {
        console.log(`    ${String(e.i).padStart(5)}  ${e.phase.padEnd(11)} ${String(e.railZ).padStart(6)}`
          + ` ${String(e.climb).padStart(7)} ${String(e.vis).padStart(5)}`
          + ` ${e.posJolt.toFixed(2).padStart(9)} ${e.angJolt.toFixed(3).padStart(9)} ${e.ndcJump.toFixed(4).padStart(9)}`);
      }
      console.log('\n  per phase — median and worst:');
      console.log('    phase          n   posJolt med/max      angJolt med/max     longest frame');
      for (const ph of phases) {
        const g = ev.filter(e => e.phase === ph);
        if (!g.length) continue;
        const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
        const dts = rows.filter(r => r.phase === ph).map(r => r.dt);
        console.log(`    ${ph.padEnd(11)} ${String(g.length).padStart(4)}`
          + `   ${med(g.map(e => e.posJolt)).toFixed(2).padStart(6)} / ${Math.max(...g.map(e => e.posJolt)).toFixed(2).padStart(8)}`
          + `   ${med(g.map(e => e.angJolt)).toFixed(3).padStart(6)} / ${Math.max(...g.map(e => e.angJolt)).toFixed(3).padStart(7)}`
          + `   ${(Math.max(...dts) * 1000).toFixed(0).padStart(6)} ms`);
      }
      // Phase boundaries are where a discontinuity is most likely to have been
      // authored rather than to have emerged, so call them out by name.
      console.log('\n  at each phase boundary:');
      for (let i = 1; i < ev.length; i++) {
        if (ev[i].phase === ev[i - 1].phase) continue;
        const w = ev.slice(Math.max(0, i - 2), i + 3);
        const worst = w.reduce((a, b) => (b.posJolt > a.posJolt ? b : a));
        console.log(`    ${ev[i - 1].phase} → ${ev[i].phase}`.padEnd(30)
          + `worst posJolt ${worst.posJolt.toFixed(2).padStart(8)} m/f²`
          + `   angJolt ${worst.angJolt.toFixed(3).padStart(7)} °/f²`);
      }
    },
  },

  roll: {
    async run({ frames, keys, sample, snap }) {
      const arm = async (key, label) => {
        await frames(40);
        const rows = [{ ...(await sample()), tag: 'pre' }];
        await keys.hold(key, 2);
        for (let i = 0; i < 16; i++) {
          rows.push({ ...(await sample()), tag: String(i) });
          await snap(`${label}-${String(i).padStart(2, '0')}`);
          await frames(3);
        }
        // Long tail: the dodge is only a dodge if the offset comes back.
        await frames(150);
        rows.push({ ...(await sample()), tag: 'rest' });
        return { label, rows };
      };
      return [await arm('KeyC', 'right'), await arm('KeyZ', 'left')];
    },
    print(runs) {
      for (const { label, rows } of runs) {
        const pre = rows[0], rest = rows[rows.length - 1];
        console.log(`\n=== barrel roll ${label} ===`);
        console.log('  tag   rollT  dir     upX   offVelX     offX    bank');
        for (const r of rows) {
          console.log(`  ${r.tag.padEnd(5)} ${String(r.rollT).padStart(6)} ${String(r.rollDir).padStart(4)}`
            + ` ${String(r.upX).padStart(7)} ${String(r.offVelX).padStart(9)} ${String(r.offX).padStart(8)} ${String(r.bank).padStart(7)}`);
        }
        // Spin direction is read from the FIRST QUARTER TURN, never from the
        // peak. The sweep is a full 360°, so |upX| peaks near 90° and again near
        // 270° with opposite signs — taking the larger reports whichever side of
        // the half-turn the sampling happened to land on. Reading peak |upX| on a
        // 3-frame cadence called an inverted roll correct.
        //
        // Sign convention, confirmed against filmstrip frames rather than
        // derived: rolling clockwise from the chase camera drops the right wing,
        // which tips the hull's top toward screen right, so `upX > 0` IS
        // clockwise. Roll-right (C) must land here.
        //
        // 0.15 s is a sampling requirement, not a copy of the tuning: it is under
        // a quarter of `flight.js` TUNE.rollDuration at 0.62 s. If that duration
        // is ever cut below ~0.6 s this bound has to come down with it.
        const early = rows.find(r => r.rollT > 0 && r.rollT < 0.15);
        if (!early) {
          console.log('  spin vs dodge: no sample inside the first quarter turn — sample faster');
        } else {
          const cw = early.upX;
          const agree = Math.sign(cw) === Math.sign(early.offVelX) && Math.abs(early.upX) > 0.02;
          console.log(`  spin vs dodge, at rollT ${early.rollT} (first quarter turn):`
            + ` clockwise ${cw.toFixed(3)}, dodge ${early.offVelX}`);
          console.log(`    ${agree ? 'AGREE — spins the way it dodges'
            : '*** OPPOSED — the roll spins away from its own dodge ***'}`);
        }
        // The displacement is the design question: a dodge returns, a lane
        // change does not.
        console.log(`  offX  ${pre.offX} → peak ${rows.reduce((a, r) => Math.abs(r.offX) > Math.abs(a) ? r.offX : a, 0)}`
          + ` → ${rest.offX} after 150 idle frames  (net ${(rest.offX - pre.offX).toFixed(1)} m)`);
      }
    },
  },

  /**
   * Playability: fly the level with a crude autopilot and see whether it can be
   * got through. Steers toward the nearest live contact and holds the trigger, so
   * unlike `pacing.mjs` the guns are actually being used and damage is actually
   * being taken. Catches "wave 3 is unsurvivable" and "the ship leaves the frame
   * under real input" — not whether it feels good.
   */
  /**
   * The drop guarantee: **every drop reaches the player.** That is a claim about
   * position over time under adversarial geometry — a drop ejected behind a
   * boosting player has to out-run 235 m/s of rail — and no screenshot can
   * answer it. So: eject one at each corner case, fly on, and time how long it
   * takes to arrive. A row with `t = —` is a drop that escaped, which is a
   * defect and not a tuning question.
   *
   * The boosted arm matters more than the unboosted one. `seekOver` is added to
   * the player's *live* speed for exactly this case; the day someone re-tunes it
   * to a constant, this is the probe that catches it.
   */
  drops: {
    async run({ frames, keys, evaluate }) {
      // ahead / up / side, in the rail frame. Deliberately includes two that
      // start behind the player and one that starts below the rail.
      const CASES = [
        ['health', 260, 30, 0, 'near ahead'],
        ['weapon', 900, 60, 0, 'far ahead'],
        ['bomb', 420, 10, 300, 'wide starboard'],
        ['health', 700, -70, -160, 'low port'],
        ['weapon', -320, 25, 0, 'behind'],
        ['bomb', -260, 40, -260, 'behind, wide port'],
        ['health', 1400, 110, 380, 'far and wide'],
      ];
      const rows = [];
      for (const boosted of [false, true]) {
        if (boosted) await keys.down('ShiftLeft');
        for (const [kind, ahead, up, side, label] of CASES) {
          // Settle first: a case launched on the frame the previous one was
          // collected inherits its screen flash and its ribbon.
          await frames(12);
          const t0 = await evaluate(([k, a, u, s]) => {
            const V = window.__VULPINE__;
            V.combat.dropTest(k, a, u, s);
            return { t: V.state.time, speed: Math.round(V.flight.speed) };
          }, [kind, ahead, up, side]);
          let got = null;
          // 12 s of sim is four times the worst arrival measured; anything that
          // has not landed by then is not late, it is lost.
          for (let i = 0; i < 200 && !got; i++) {
            await frames(4);
            got = await evaluate((t) => {
              const V = window.__VULPINE__;
              if (V.combat.pickups.length) {
                return V.state.time - t > 12 ? { lost: true, t: V.state.time - t } : null;
              }
              return { lost: false, t: V.state.time - t, label: V.state.pickup ? V.state.pickup.label : '—' };
            }, t0.t);
          }
          rows.push({
            arm: boosted ? 'boost' : 'cruise', label, kind,
            speed: t0.speed,
            dist: Math.round(Math.hypot(ahead, up, side)),
            t: got && !got.lost ? +got.t.toFixed(2) : null,
            paid: got && !got.lost ? got.label : '',
          });
        }
        if (boosted) await keys.up('ShiftLeft');
      }
      return rows;
    },
    print(rows) {
      const lost = rows.filter(r => r.t == null);
      console.log(`${rows.length - lost.length} of ${rows.length} drops reached the player`);
      const got = rows.filter(r => r.t != null).map(r => r.t);
      if (got.length) {
        console.log(`  arrival ${Math.min(...got).toFixed(2)}–${Math.max(...got).toFixed(2)} s`
          + `  (median ${got.slice().sort((a, b) => a - b)[got.length >> 1].toFixed(2)} s)`);
      }
      if (lost.length) console.log(`  ESCAPED: ${lost.map(r => `${r.arm}/${r.label}`).join(', ')}`);
      console.log('\n  arm     case                 kind    dist  spd   arrive  paid out');
      for (const r of rows) {
        console.log(`  ${r.arm.padEnd(7)} ${r.label.padEnd(20)} ${r.kind.padEnd(7)} `
          + `${String(r.dist).padStart(4)} ${String(r.speed).padStart(4)}  `
          + `${(r.t == null ? 'LOST' : r.t.toFixed(2) + 's').padStart(6)}  ${r.paid}`);
      }
    },
  },

  fly: {
    async run({ frames, keys, sample, evaluate }) {
      const rows = [];
      // The autopilot lives in the page: reading contacts out per frame and
      // deciding here would cost a round trip per frame.
      await evaluate(() => {
        const V = window.__VULPINE__;
        window.__PILOT__ = { want: { x: 0, y: 0 } };
        // Contacts are published FLAT — {x, y, z, ally, boss} — not {pos}. Reading
        // `e.pos` silently skipped every one of them and the autopilot flew the
        // whole level as a passenger: zero steering, zero kills, and framing
        // numbers that looked perfect because nothing ever moved.
        window.__PILOT_TICK__ = () => {
          const st = V.state;
          const list = st.enemies || [];
          let best = null, bestD = 1e9;
          for (const e of list) {
            if (e.ally) continue;
            const dz = e.z - st.pz;
            if (dz > -30) continue;                       // only what is ahead
            const d = Math.hypot(e.x - st.px, e.y - st.py, dz);
            if (d < bestD) { bestD = d; best = e; }
          }
          const w = window.__PILOT__.want;
          w.target = !!best;
          w.lockOn = st.lockOn;
          w.locked = !!st.lockTarget;
          if (best) {
            w.x = Math.max(-1, Math.min(1, (best.x - st.px) / 40));
            w.y = Math.max(-1, Math.min(1, (best.y - st.py) / 40));
          } else { w.x = 0; w.y = 0; }
        };
      });
      // Hold, wait for the lock, release. That is the game's core loop: holding
      // tap-fires, then builds a charge and acquires a lock, and releasing on a
      // locked contact lands a guaranteed homing hit. The first version of this
      // scenario held the trigger for the whole level and never let go, so the
      // charged shot never fired and it scored zero across 9 km. Rapid-tapping
      // instead would also be wrong - it models a game this is not.
      let trigger = false;
      const held = new Set();
      const t0 = Date.now();
      let nextSample = 0;
      let iter = 0;
      while ((Date.now() - t0) / 1000 < SECONDS) {
        await evaluate(() => window.__PILOT_TICK__());
        const want = await evaluate(() => window.__PILOT__.want);
        // translate the desired lateral/vertical into key state, with a deadzone
        const map = [
          ['KeyD', want.x > 0.18], ['KeyA', want.x < -0.18],
          ['KeyW', want.y > 0.18], ['KeyS', want.y < -0.18],
        ];
        for (const [k, on] of map) {
          if (on && !held.has(k)) { await keys.down(k); held.add(k); }
          if (!on && held.has(k)) { await keys.up(k); held.delete(k); }
        }
        // hold to build the lock, release once it is full to loose the shot
        if (!trigger) { await keys.down('Space'); trigger = true; }
        else if (want.lockOn >= 0.95) { await keys.up('Space'); trigger = false; }
        await frames(6);
        const el = (Date.now() - t0) / 1000;
        if (el >= nextSample) { nextSample = el + 3; rows.push(await sample()); }
        // Only a decided outcome ends the run. Breaking on railZ would cut the
        // boss fight off the moment it started: the rail keeps advancing all the
        // way through it, so -8600 is reached seconds after the carrier spawns.
        const s = rows[rows.length - 1];
        if (s && s.outcome) break;
      }
      for (const k of held) await keys.up(k);
      if (trigger) await keys.up('Space');
      return rows;
    },
    print(rows) {
      if (!rows.length) { console.log('no samples'); return; }
      const last = rows[rows.length - 1];
      const min = (k) => Math.min(...rows.map(r => r[k]));
      const max = (k) => Math.max(...rows.map(r => r[k]));
      console.log(`flew to z=${last.railZ} in ${last.t}s of sim  outcome=${last.outcome ?? 'still flying'}`);
      console.log(`  kills ${last.kills}  score ${last.score}  lives ${last.lives}  shield ${last.shield}  weapon ${last.weapon}  boss=${last.boss}`);
      console.log(`  shield low-water ${min('shield')}   fps min ${min('fps')} / max ${max('fps')}`);
      // Framing under real input is the thing no hands-off probe can see.
      console.log(`  hull stayed within ndcX [${min('shipX')}, ${max('shipX')}]  ndcY [${min('shipY')}, ${max('shipY')}]`);
      const off = rows.filter(r => Math.abs(r.shipX) > 0.85 || Math.abs(r.shipY) > 0.85).length;
      console.log(`  samples with the hull near/past a frame edge: ${off} of ${rows.length}`);
      console.log('\n     t   railZ  shield  live  kills   ndcX    ndcY   fps');
      for (const r of rows) {
        console.log(`  ${String(r.t).padStart(5)} ${String(r.railZ).padStart(7)} ${String(r.shield).padStart(7)} ${String(r.live).padStart(5)} ${String(r.kills).padStart(6)} ${String(r.shipX).padStart(6)} ${String(r.shipY).padStart(7)} ${String(r.fps).padStart(5)}`);
      }
    },
  },
};

/* ── run ──────────────────────────────────────────────────────────────────── */

const scenario = SCENARIOS[WHICH];
if (!scenario) {
  console.error(`unknown scenario "${WHICH}". available: ${Object.keys(SCENARIOS).join(', ')}`);
  process.exit(1);
}
const rows = await scenario.run(ctx);
scenario.print(rows);
console.log(errs.length ? `\nCONSOLE ERRORS: ${errs.slice(0, 4).join(' | ')}` : '\nno console errors');
await browser.close();
if (server) server.kill();
