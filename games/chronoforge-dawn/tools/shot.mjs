#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Deterministic screenshot harness.
//
//   node tools/shot.mjs                            every shot, at dawn
//   node tools/shot.mjs --shots hero,ridge --t 18  named shots at dusk
//   node tools/shot.mjs --out shots/round3 --w 1920 --h 1080
//   node tools/shot.mjs --list
//   node tools/shot.mjs --js "__DAWN__.post({exposure:0.8})"
//
// Flags
//   --shots a,b     named camera presets (default: all of them)
//   --t <hour>      TIME OF DAY in hours, 0–24. 6.4 is dawn, the signature hour.
//   --sim <sec>     fast-forward the fixed-step sim this far before capturing
//   --out <dir>     output directory (default shots/latest)
//   --w --h         viewport, in CSS pixels
//   --quality       low|medium|high|ultra
//   --port          dev server port — PICK A UNIQUE ONE if another agent is running
//   --js "<expr>"   evaluated in the page before capture
//   --seq N         capture a burst of N frames per shot, --seq-steps apart
//   --probe         also print the linear-light histogram per shot
//   --params "a=1"  extra URL switches
//   --list          print the available shot names and exit
//
// Boots a real GPU-backed Chromium (ANGLE/Metal — software rasterisers mangle
// bloom, normal maps and half-float precision), pins the time of day and the
// sim clock so the frame is comparable across builds, then captures each shot.
//
// Exits non-zero and prints the console errors if the page threw. A silent
// black PNG is the worst possible review artefact.
// ─────────────────────────────────────────────────────────────────────────────
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, arg, flag, numArg, boot, settle, evalInPage } from './lib/harness.mjs';

const PORT = parseInt(arg('port', '5190'), 10);
const WIDTH = parseInt(arg('w', '1920'), 10);
const HEIGHT = parseInt(arg('h', '1080'), 10);
const HOUR = numArg('t', numArg('hour', 6.4));
const SIM = numArg('sim', 0);
const QUALITY = arg('quality', 'ultra');
const OUT = path.resolve(ROOT, arg('out', 'shots/latest'));
const TIMEOUT = parseInt(arg('timeout', '120000'), 10);
const SEQ = parseInt(arg('seq', '0'), 10) || 0;
const SEQ_STEPS = parseInt(arg('seq-steps', '12'), 10);

const h = await boot({
  port: PORT, width: WIDTH, height: HEIGHT, quality: QUALITY,
  hour: HOUR, sim: SIM || null, timeout: TIMEOUT,
  extraParams: typeof arg('params', '') === 'string' ? arg('params', '') : '',
});
const { page, errors } = h;

if (flag('list')) {
  console.log((await page.evaluate(() => window.__DAWN__.shots)).join('\n'));
  await h.close(0);
}

console.log(`gpu: ${h.renderer}${h.software ? '   *** SOFTWARE RASTERISER ***' : ''}`);

const js = arg('js');
if (js && js !== true) {
  const res = await evalInPage(page, js);
  console.log(`js: ${res.ok ? res.value : 'ERROR ' + res.value}`);
  if (!res.ok) await h.close(4);
}

const all = await page.evaluate(() => window.__DAWN__.shots);
const shots = (arg('shots') && arg('shots') !== true)
  ? String(arg('shots')).split(',').map((s) => s.trim()).filter(Boolean)
  : all;

await mkdir(OUT, { recursive: true });

const written = [];
const probes = {};
for (const shot of shots) {
  if (!all.includes(shot)) { console.warn(`skip unknown shot: ${shot}`); continue; }
  await page.evaluate((s) => window.__DAWN__.setShot(s), shot);
  await settle(page, 8);

  const grab = async (file) => {
    await writeFile(file, await page.screenshot({ type: 'png' }));
    written.push(file);
  };

  if (SEQ > 1) {
    for (let i = 0; i < SEQ; i++) {
      if (i > 0) { await page.evaluate((n) => window.__DAWN__.step(n), SEQ_STEPS); await settle(page, 3); }
      await grab(path.join(OUT, `${shot}-${String(i).padStart(2, '0')}.png`));
    }
    process.stdout.write(`  ok ${shot} x${SEQ}\n`);
  } else {
    const file = path.join(OUT, `${shot}.png`);
    await grab(file);
    process.stdout.write(`  ok ${path.relative(ROOT, file)}\n`);
  }

  if (flag('probe')) {
    const p = await page.evaluate(() => {
      const r = window.__DAWN__.probe();
      for (const k of ['raw', 'exposed']) if (r[k]) delete r[k].tiles;
      return r;
    });
    probes[shot] = p;
    const e = p.exposed;
    console.log(`     med ${e.median.toFixed(3)}  p90 ${e.p90.toFixed(2)}  white% ${e.whitePct.toFixed(2)}  black% ${e.blackPct.toFixed(1)}`);
  }
}

const stats = await page.evaluate(() => window.__DAWN__.stats());
await writeFile(path.join(OUT, 'meta.json'), JSON.stringify({
  url: h.url, hour: HOUR, sim: SIM, quality: QUALITY, width: WIDTH, height: HEIGHT,
  renderer: h.renderer, software: h.software, stats, probes, errors,
  shots: written.map((f) => path.basename(f)),
}, null, 2));

const b = stats.budget;
console.log(`\nframe ${stats.frameMs.toFixed(1)}ms (${stats.fps.toFixed(0)} fps)  draws ${stats.calls}/${b.calls.limit}  tris ${stats.tris.toLocaleString()}  progs ${stats.programs}`);
console.log(`budget: ${b.ok ? 'OK' : 'OVER'}   camera locked: ${stats.cameraLocked}   sun ${stats.sunElevation}deg at ${stats.hour}h`);
const bad = Object.entries(stats.modules).filter(([, m]) => !m.ok);
if (bad.length) console.error(`modules down: ${bad.map(([k, m]) => `${k} (${m.error})`).join(', ')}`);

if (errors.length) {
  console.error(`\n${errors.length} console error(s):`);
  console.error(errors.slice(0, 12).join('\n'));
}
await h.close(errors.length || bad.length ? 1 : 0);
