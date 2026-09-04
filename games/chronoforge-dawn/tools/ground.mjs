#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// The ground-contact gate — "do her feet actually touch the hill?"
//
//   node tools/ground.mjs                 controlled A/B across every slope
//   node tools/ground.mjs --phases 12     finer sampling of the run cycle
//   node tools/ground.mjs --step 4        denser position grid (slower)
//
// Phase 2.4's gate. The claim it has to support: at MAX_WALKABLE_SLOPE_DEG the
// planted foot is on the ground, not floating above it and not buried in it.
//
// THE METRIC: min(|errL|, |errR|) — how far the BETTER-PLANTED foot sits from
// its own ground. Not max, and not the mean. Half of a run cycle is one foot
// deliberately in the air; a metric that punishes the swing foot is measuring
// the animation, not the grounding, and will happily report a shuffle as a
// success. What must hold every frame is that AT LEAST ONE foot is planted.
//
// THE CONTROL MATTERS MORE THAN THE METRIC. Two earlier versions of this
// measurement gave confidently wrong answers and both are worth remembering:
//
//   1. Sampling her STANDING still. At idle the feet are 0.23 m apart, so the
//      slope difference between them is small by construction and the whole
//      defect is invisible. At a run they reach 1.42 m apart. Measure the pose
//      where the problem lives.
//   2. Driving her with real input for N frames per config. She takes a
//      different route each time — one run topped out at 17 deg of slope and
//      the other at 40 — so the two configs were scored on different terrain.
//      That comparison said the fix was a REGRESSION. It was not; the
//      instrument was.
//
// So: identical positions, identical stride phases, both configs, animator
// clock pinned. Same terrain, same pose, one variable.
// ─────────────────────────────────────────────────────────────────────────────
import { arg, numArg, boot, settle } from './lib/harness.mjs';

const PORT = parseInt(arg('port', '5190'), 10);
const PHASES = parseInt(arg('phases', '8'), 10);
const STEP = parseInt(arg('step', '6'), 10);

/* Bands. The absolute numbers are small on smooth dunes — a planted foot on a
   continuous heightfield is never far from the root sample — so the assertion
   that carries the weight is the SECOND one: the error must not grow with
   slope. A fix that merely shrinks the error uniformly has tuned a constant; a
   fix that flattens it against slope has actually absorbed the hill. */
const P95_MAX = numArg('p95', 0.02);
const SLOPE_GROWTH_MAX = numArg('growth', 2.0);

const h = await boot({ port: PORT, quality: 'ultra', hour: 6.4, extraParams: 'play=1' });
const { page, errors } = h;
console.log(`gpu: ${h.renderer}${h.software ? '   *** SOFTWARE RASTERISER ***' : ''}`);
await settle(page, 12);

const out = await page.evaluate(({ PHASES, STEP }) => {
  const D = window.__DAWN__, w = D.ctx.world, T = D.THREE;
  const tr = D.ctx.traversal, ac = D.ctx.actors, p = tr.player;
  if (!p) return { err: 'no player — ?play=1 did not take control' };

  const spots = [];
  const half = (w.size ?? 240) * 0.5 - 20;
  for (let x = -half; x <= half; x += STEP) {
    for (let z = -half; z <= half; z += STEP) {
      const n = w.normalAt(x, z);
      const s = T.MathUtils.radToDeg(Math.acos(Math.min(1, n.y)));
      if (s >= 3) spots.push({ x, z, s });
    }
  }

  const res = {};
  for (const on of [false, true]) {
    ac.setGround(on);
    const by = {};
    for (const sp of spots) {
      const b = Math.min(35, Math.round(sp.s / 5) * 5);
      tr.teleport(sp.x, sp.z);
      for (let i = 0; i < PHASES; i++) {
        const t = (i / PHASES) * 0.58;
        // Pin the clip AND its clock: the pose must not drift while the IK's
        // damping settles, or each sample is taken at a different stride.
        p.anim.clip = 'run'; p.anim.prev = null; p.anim.blend = 1; p.anim.timeScale = 0;
        for (let j = 0; j < 60; j++) { p.anim.t = t; D.step(1); }
        const e = ac.footError();
        if (!e) continue;
        (by[b] = by[b] || []).push(Math.min(Math.abs(e.L), Math.abs(e.R)));
      }
    }
    res[on ? 'on' : 'off'] = by;
    p.anim.timeScale = 1;
  }
  ac.setGround(true);
  return { res, spots: spots.length };
}, { PHASES, STEP });

if (out.err) { console.error(out.err); await h.close(4); }

const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * f))]; };
console.log(`\ncontrolled: ${out.spots} positions x ${PHASES} stride phases, identical for both configs`);
console.log('metric: min(|errL|,|errR|) — the better-planted foot, in metres\n');
console.log('  slope    OFF p50   OFF p95     ON p50    ON p95');

const buckets = Object.keys(out.res.off).map(Number).sort((a, b) => a - b);
let offAll = [], onAll = [];
const onP95 = [];
for (const b of buckets) {
  const o = out.res.off[b] || [], n = out.res.on[b] || [];
  if (!o.length || !n.length) continue;
  offAll = offAll.concat(o); onAll = onAll.concat(n);
  onP95.push({ slope: b, v: q(n, 0.95) });
  console.log(`  ${String(b).padStart(3)}deg   ${q(o, 0.5).toFixed(3)}     ${q(o, 0.95).toFixed(3)}      ${q(n, 0.5).toFixed(3)}     ${q(n, 0.95).toFixed(3)}`);
}
const offP95 = q(offAll, 0.95), onP95All = q(onAll, 0.95);
console.log(`\n  ALL     ${q(offAll, 0.5).toFixed(3)}     ${offP95.toFixed(3)}      ${q(onAll, 0.5).toFixed(3)}     ${onP95All.toFixed(3)}`);

/* Growth: the shallowest bucket against the steepest. Flat means the hill is
   being absorbed rather than a constant being tuned away. */
const lo = onP95[0], hi = onP95[onP95.length - 1];
const growth = hi.v / Math.max(1e-4, lo.v);
console.log(`  improvement ${(offP95 / Math.max(1e-4, onP95All)).toFixed(1)}x   `
  + `growth ${lo.slope}deg→${hi.slope}deg: ${growth.toFixed(2)}x (limit ${SLOPE_GROWTH_MAX})`);

const fail = [];
if (onP95All > P95_MAX) fail.push(`planted-foot p95 ${onP95All.toFixed(3)}m > ${P95_MAX}m`);
if (growth > SLOPE_GROWTH_MAX) fail.push(`error grows ${growth.toFixed(2)}x with slope > ${SLOPE_GROWTH_MAX}x — the hill is not being absorbed`);
if (errors.length) console.error('\nERRORS:\n' + errors.slice(0, 8).join('\n'));
console.log(`\n${fail.length ? 'FAIL: ' + fail.join('; ') : 'PASS: the planted foot is on the ground at every walkable slope'}`);
await h.close(fail.length || errors.length ? 1 : 0);
