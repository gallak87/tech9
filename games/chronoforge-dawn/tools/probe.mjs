#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// The linear-light histogram probe.
//
//   node tools/probe.mjs                       every shot, at dawn
//   node tools/probe.mjs --shots hero,sun --t 12
//   node tools/probe.mjs --js "__DAWN__.post({exposure:0.7})"
//
// When you are fighting the look, measure it. A PNG cannot tell you whether the
// frame is dark or the exposure is low, and it cannot tell you that 6% of it is
// a flat white hole — the tile map can.
//
// LEFT grid  = mean luminance per tile (linear light, log-ish ramp).
// RIGHT grid = share of the tile that is FLAT WHITE — no colour, no gradient.
// Read them together: a bright region is either bright-with-detail or gone.
//
// Healthy dawn frame: median 0.05–0.16, p90 < 1.2, white% < 1.5, black% < 14.
// ─────────────────────────────────────────────────────────────────────────────
import { arg, flag, numArg, boot, settle, evalInPage } from './lib/harness.mjs';

const PORT = parseInt(arg('port', '5192'), 10);
const HOUR = numArg('t', numArg('hour', 6.4));
const QUALITY = arg('quality', 'ultra');
const WHITE_AT = numArg('whiteat', 1.6);

const h = await boot({
  port: PORT, width: parseInt(arg('w', '1920'), 10), height: parseInt(arg('h', '1080'), 10),
  quality: QUALITY, hour: HOUR, sim: numArg('sim', 0) || null,
});
const { page, errors } = h;
console.log(`gpu: ${h.renderer}${h.software ? '   *** SOFTWARE RASTERISER ***' : ''}`);

const js = arg('js');
if (js && js !== true) {
  const r = await evalInPage(page, js);
  console.log('js:', r.ok ? r.value : 'ERROR ' + r.value);
  if (!r.ok) await h.close(4);
}

const all = await page.evaluate(() => window.__DAWN__.shots);
const shots = (arg('shots') && arg('shots') !== true)
  ? String(arg('shots')).split(',').map((s) => s.trim()).filter(Boolean) : all;

const RAMP = ' .:-=+*#%@';
const fmt = (s) => `med ${s.median.toFixed(3)}  p90 ${s.p90.toFixed(2)}  p99 ${s.p99.toFixed(2)}`
  + `  max ${s.max.toFixed(1)}  clip% ${s.clippedPct.toFixed(2)}  black% ${s.blackPct.toFixed(1)}`
  + `  WHITE% ${s.whitePct.toFixed(2)}`;

function grids(t) {
  const out = [];
  for (let r = 0; r < t.rows; r++) {
    let a = '', b = '';
    for (let c = 0; c < t.cols; c++) {
      const i = r * t.cols + c;
      a += RAMP[Math.min(9, Math.max(0, Math.round(Math.log2(t.mean[i] * 8 + 1) * 1.9)))];
      const w = t.whitePct[i];
      b += w < 1 ? '.' : w < 10 ? '1' : w < 30 ? '3' : w < 60 ? '6' : w < 90 ? '8' : '#';
    }
    out.push('    ' + a + '   ' + b);
  }
  return out;
}

let worst = 0;
for (const shot of shots) {
  if (!all.includes(shot)) { console.warn('skip unknown shot:', shot); continue; }
  await page.evaluate((s) => window.__DAWN__.setShot(s), shot);
  await settle(page, 8);
  const p = await page.evaluate((wa) => window.__DAWN__.probe({ whiteAt: wa }), WHITE_AT);
  console.log(`\n[${shot}]  hour ${HOUR}  exposure ${p.exposure}  whiteAt ${p.whiteAt}`);
  console.log(`  scene(raw)  ${fmt(p.raw)}`);
  console.log(`  scene(exp)  ${fmt(p.exposed)}`);
  if (!flag('nogrid')) {
    console.log('    -- luminance --     -- blown --');
    for (const line of grids(p.exposed.tiles)) console.log(line);
  }
  worst = Math.max(worst, p.exposed.whitePct);
}

const stats = await page.evaluate(() => window.__DAWN__.stats());
console.log(`\nframe ${stats.frameMs.toFixed(1)}ms  ${stats.fps.toFixed(0)}fps  draws ${stats.calls}  tris ${stats.tris.toLocaleString()}`);
console.log(`worst blown-white across shots: ${worst.toFixed(2)}%`);
if (errors.length) console.error('\nERRORS:\n' + errors.slice(0, 10).join('\n'));
await h.close(errors.length ? 1 : 0);
