#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Pilot harness — drives the game with real keyboard input and measures what a
// player would experience. Every other probe in this directory either steps the
// sim with no input (`pacing`, `bossprobe`) or presses one key at a time
// (`inputtest`); this one flies.
//
//   node tools/pilot.mjs aim                 reticle lead direction and throw
//   node tools/pilot.mjs fly --seconds 90    autopilot playthrough, playability
//   node tools/pilot.mjs aim --params wpn=3  extra URL switches
//
// Adding a scenario: drop an entry in SCENARIOS. It gets `{ page, frames, keys,
// sample, evaluate }` and returns whatever its own `print` understands, so a new
// question does not mean a new file or a new copy of the boot code.
//
// What this can and cannot do: it measures. "Does the reticle lead the turn" and
// "can the level be flown end to end without dying" are measurable and live here.
// Whether the flying *feels* good is not — that stays a hands-on question, and
// the dev-panel knobs exist for it.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const ROOT = '/Users/g/code/scratch/tech9/games/vulpine';

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

const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
// nomenu so input reaches the sim immediately; hud off so nothing is occluded
await page.goto(`${base}/?quality=${QUALITY}&t=6&nomenu=1&hud=0${EXTRA}`, { waitUntil: 'load' });
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
    shield: Math.round(st.shieldRaw), lives: st.lives, score: st.score, kills: st.hits,
    outcome: st.outcome, live: st.enemies ? st.enemies.length : 0,
    boss: !!V.combat.boss, weapon: st.weapon ? st.weapon.label : '?',
    fps: Math.round(1000 / V.engine.avgFrameMs),
  };
});
const ctx = { page, frames, keys, sample, evaluate: (fn, a) => page.evaluate(fn, a) };

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
      console.log(`neutral: hull (${zero.shipX}, ${zero.shipY})  reticle (${zero.aimX}, ${zero.aimY})\n`);
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
   * Playability: fly the level with a crude autopilot and see whether it can be
   * got through. Steers toward the nearest live contact and holds the trigger, so
   * unlike `pacing.mjs` the guns are actually being used and damage is actually
   * being taken. Catches "wave 3 is unsurvivable" and "the ship leaves the frame
   * under real input" — not whether it feels good.
   */
  fly: {
    async run({ frames, keys, sample, evaluate }) {
      const rows = [];
      // The autopilot lives in the page: reading contacts out per frame and
      // deciding here would cost a round trip per frame.
      await evaluate(() => {
        const V = window.__VULPINE__;
        window.__PILOT__ = { want: { x: 0, y: 0 } };
        window.__PILOT_TICK__ = () => {
          const st = V.state;
          const list = st.enemies || [];
          let best = null, bestD = 1e9;
          for (const e of list) {
            if (!e.pos) continue;
            const dz = e.pos.z - st.pz;
            if (dz > -40) continue;                       // only what is ahead
            const d = Math.hypot(e.pos.x - st.px, e.pos.y - st.py, dz);
            if (d < bestD) { bestD = d; best = e; }
          }
          const w = window.__PILOT__.want;
          if (best) {
            w.x = Math.max(-1, Math.min(1, (best.pos.x - st.px) / 45));
            w.y = Math.max(-1, Math.min(1, (best.pos.y - st.py) / 45));
          } else { w.x = 0; w.y = 0; }
        };
      });
      await page.keyboard.down('Space');                  // hold the trigger
      const held = new Set();
      const t0 = Date.now();
      let nextSample = 0;
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
        await frames(6);
        const el = (Date.now() - t0) / 1000;
        if (el >= nextSample) { nextSample = el + 3; rows.push(await sample()); }
        const s = rows[rows.length - 1];
        if (s && (s.outcome || s.railZ < -8600)) break;
      }
      for (const k of held) await keys.up(k);
      await page.keyboard.up('Space');
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
