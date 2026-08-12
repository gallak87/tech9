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
//   node tools/pilot.mjs fly --headed        watch it fly, HUD and all
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
const browser = await chromium.launch({
  headless: !HEADED,
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
