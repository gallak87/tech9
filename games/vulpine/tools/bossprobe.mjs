// Boss-fight probe. Steps the sim to the boss trigger, then samples 4x/second:
// the leash envelope per axis, time inside the guns' range and cone, whether
// the lock holds and on which part, rounds landed, and weak-point kill times.
// All of it is behaviour over time, which no screenshot can answer.
//
//   node tools/bossprobe.mjs <port> [seconds of fight] [extra query params]
//
// The third argument is appended to the page URL, which is how the two arms of
// a weapon A/B are run against the same build:
//   node tools/bossprobe.mjs 5313 190 'grants=0'   # baseline gun
//   node tools/bossprobe.mjs 5313 190             # granted gun
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const ROOT = '/Users/g/code/scratch/tech9/games/vulpine';
const PORT = parseInt(process.argv[2] || '5313', 10);
const FIGHT = parseFloat(process.argv[3] || '70');
const EXTRA = process.argv[4] ? '&' + process.argv[4].replace(/^&/, '') : '';

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

await page.goto(`${base}/?quality=medium&t=0.1&fight=1&hud=0${EXTRA}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__VULPINE__ && window.__VULPINE__.ready, null, { timeout: 120000 });

const data = await page.evaluate(async (fight) => {
  const V = window.__VULPINE__;
  const FIXED = 1 / 120;
  const chunk = Math.round(0.25 / FIXED);

  // The harness never dodges: without this the player is out of lives before
  // the carrier spawns and every counter below freezes.
  const keepAlive = () => {
    V.state.shieldRaw = V.state.shieldMax;
    V.state.lives = 3;
    V.state.outcome = null;
  };

  // `V.step(n)` refreshes the scene once, at the end. The guns converge on the
  // camera ray, so batching fires every volley down a stale camera pose.
  const stepN = (n) => { for (let i = 0; i < n; i++) V.step(1); };

  // run to the boss trigger
  let t = 0, guard = 0;
  while (!V.combat.boss && guard++ < 2000) { keepAlive(); stepN(chunk); t += chunk * FIXED; }
  if (!V.combat.boss) return { error: 'boss never spawned', t };
  const tSpawn = t;

  // Counters are cumulative and the level fires hundreds of rounds before the
  // carrier spawns — snapshot and difference.
  const diag0 = JSON.parse(JSON.stringify(V.combat.diag));
  const samples = [];
  let trkB = null;
  const partT = {};                 // part id -> sim time it died
  let lockedSamples = 0, lockedPart = {};
  const end = t + fight;
  while (t < end && V.combat.boss && V.combat.boss.dying < 0) {
    keepAlive();
    stepN(chunk);
    t += chunk * FIXED;
    const b = V.combat.boss;
    if (!b) break;
    const p = V.flight.pos;
    const bp = b.root.position;
    const dx = bp.x - p.x, dy = bp.y - p.y, dz = bp.z - p.z;
    const range = Math.hypot(dx, dy, dz);
    // ship forward, for the real cone test the lock uses
    const f = new V.THREE.Vector3(0, 0, -1).applyQuaternion(V.ship.quaternion);
    const toB = new V.THREE.Vector3(dx, dy, dz).normalize();
    const cos = toB.dot(f);
    const lt = V.state.lockTarget;
    const lockedOnBoss = !!(lt && lt.boss);
    if (lockedOnBoss) {
      lockedSamples++;
      const id = lt.part ? lt.part.id : '(none)';
      lockedPart[id] = (lockedPart[id] || 0) + 1;
    }
    samples.push({
      t: +(t - tSpawn).toFixed(2),
      inFlight: V.combat.bullets.filter(q => !q.enemy).length,
      seeking: V.combat.bullets.filter(q => q.seek && q.seek.boss).length,
      lockOn: +V.state.lockOn.toFixed(2),
      // Follow one round by identity: the pool swap-removes, so `find()` alone
      // returns a different round each sample.
      trk: (() => {
        if (!trkB || V.combat.bullets.indexOf(trkB) < 0) {
          trkB = V.combat.bullets.find(z => z.seek && z.seek.boss) || null;
        }
        const q = trkB;
        if (!q) return null;
        const tp = q.seek.agent.pos;
        return {
          dTgt: Math.round(Math.hypot(q.x - tp.x, q.y - tp.y, q.z - tp.z)),
          dRoot: Math.round(Math.hypot(q.x - bp.x, q.y - bp.y, q.z - bp.z)),
          dShip: Math.round(Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z)),
          life: +q.life.toFixed(2),
          sp: Math.round(Math.hypot(q.vx, q.vy, q.vz)),
          tv: Math.round(q.seek.agent.vel.length()),
        };
      })(),
      dx: Math.round(dx), dy: Math.round(dy), dz: Math.round(dz),
      range: Math.round(range), cos: +cos.toFixed(3),
      locked: lockedOnBoss,
      hp: b.api.parts.map(q => Math.max(0, Math.round(q.hp))),
      flash: b.api.parts.some(q => q.flash > 0.01),
    });
    for (const q of b.api.parts) {
      if (!q.alive && partT[q.id] === undefined) partT[q.id] = +(t - tSpawn).toFixed(1);
    }
  }
  const b = V.combat.boss;
  return {
    tSpawn: +tSpawn.toFixed(1),
    dur: +(t - tSpawn).toFixed(1),
    killed: !!(b && b.dying >= 0),
    partIds: b ? b.api.parts.map(q => q.id) : [],
    partHp: b ? b.api.parts.map(q => Math.max(0, Math.round(q.hp))) : [],
    partMax: b ? b.api.parts.map(q => q.max) : [],
    partT, samples, lockedSamples, lockedPart,
    score: V.state.score, hits: V.state.hits,
    diag: (() => {
      const d1 = V.combat.diag, out = {};
      for (const k of Object.keys(d1)) out[k] = k === 'bossMinD' ? d1[k] : d1[k] - (diag0[k] || 0);
      return out;
    })(),
    bullets: V.combat.bullets.length,
    // Confirms the pre-boss grants actually fired, rather than assuming it from
    // the rail position — the fight is balanced against the granted tier.
    weapon: { ...V.state.weapon, dps: Math.round(V.combat.dps) },
    outcome: V.state.outcome, lives: V.state.lives, shield: Math.round(V.state.shieldRaw),
  };
}, FIGHT);

if (data.error) { console.error(data.error, 'at t=' + data.t); process.exit(1); }

const S = data.samples;
const col = (k) => S.map(s => s[k]);
const stat = (a) => ({
  min: Math.min(...a), max: Math.max(...a),
  mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1),
});
const pct = (n) => ((100 * n) / S.length).toFixed(1) + '%';

console.log(`boss spawned at sim t=${data.tSpawn}s; sampled ${data.dur}s (${S.length} samples)`);
console.log(`killed: ${data.killed}   score ${data.score}   kills ${data.hits}`);
console.log(`player: outcome=${data.outcome}  lives=${data.lives}  shield=${data.shield}`);
const W = data.weapon || {};
console.log(`weapon: tier ${W.tier}/${(W.tiers ?? 1) - 1} ${W.label}  ${W.dps} dps fired`);
if (errs.length) console.log('CONSOLE ERRORS:', errs.slice(0, 6));

console.log('\n--- leash envelope (boss minus player, metres) ---');
for (const k of ['dx', 'dy', 'dz', 'range']) {
  const s = stat(col(k));
  console.log(`  ${k.padEnd(6)} min ${String(s.min).padStart(6)}  mean ${String(s.mean).padStart(7)}  max ${String(s.max).padStart(6)}`);
}

console.log('\n--- inside the guns ---');
console.log(`  range < 1100 (tap round dies there): ${pct(S.filter(s => s.range < 1100).length)}`);
console.log(`  range <  900 (lock range)          : ${pct(S.filter(s => s.range < 900).length)}`);
console.log(`  cos > 0.955  (lock cone, +-17 deg) : ${pct(S.filter(s => s.cos > 0.955).length)}`);
console.log(`  both                               : ${pct(S.filter(s => s.range < 900 && s.cos > 0.955).length)}`);
console.log(`  lock actually held on the boss     : ${pct(data.lockedSamples)}  ${JSON.stringify(data.lockedPart)}`);
console.log(`  a part was flashing (hit register) : ${pct(S.filter(s => s.flash).length)}`);

console.log('\n--- rounds vs the carrier (deltas since the carrier spawned) ---');
console.log(' ', JSON.stringify(data.diag));
console.log(`  player rounds in flight: mean ${stat(col('inFlight')).mean}  max ${stat(col('inFlight')).max}`);
console.log(`  of those, seeking the boss: mean ${stat(col('seeking')).mean}  max ${stat(col('seeking')).max}`);
console.log(`  lockOn charge: mean ${stat(col('lockOn')).mean}  max ${stat(col('lockOn')).max}`);

console.log('\n--- weak points ---');
data.partIds.forEach((id, i) => {
  const died = data.partT[id];
  console.log(`  ${id.padEnd(9)} ${String(data.partHp[i]).padStart(4)}/${String(data.partMax[i]).padStart(4)}` +
    (died !== undefined ? `   destroyed at ${died}s` : ''));
});

console.log('\n--- a tracked round, sampled (dTgt = to its aim point, dRoot = to the hull) ---');
for (const s of S.filter(x => x.trk).slice(0, 24)) {
  const k = s.trk;
  console.log(`  t=${String(s.t).padStart(6)}  dShip ${String(k.dShip).padStart(4)}  dTgt ${String(k.dTgt).padStart(5)}  dRoot ${String(k.dRoot).padStart(5)}  life ${String(k.life).padStart(5)}  sp ${String(k.sp).padStart(4)}  tgtVel ${k.tv}`);
}

console.log('\n--- first 20 samples ---');
console.log('   t    dx    dy    dz  range   cos  lock');
for (const s of S.slice(0, 20)) {
  console.log(`  ${String(s.t).padStart(5)} ${String(s.dx).padStart(5)} ${String(s.dy).padStart(5)} ${String(s.dz).padStart(5)} ${String(s.range).padStart(6)} ${String(s.cos).padStart(6)}  ${s.locked ? 'Y' : '.'}`);
}

await browser.close();
if (server) server.kill();
process.exit(errs.length ? 1 : 0);
