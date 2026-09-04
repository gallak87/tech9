#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// The rig gate — "is this the same character in every pose?"
//
//   node tools/rig.mjs                       every character, every pose
//   node tools/rig.mjs --ids kaida,grunt
//   node tools/rig.mjs --selftest            prove the gate can FAIL
//   node tools/rig.mjs --out shots/rig       where the contact sheet lands
//
// Phase 2 exists because the code-built rig had never been built, and the whole
// character pipeline is thrown away if it does not hold. The claim it has to
// support is narrow and checkable: Kaida idling, running, casting, hurt and
// victorious is ONE skeleton at five values of t, and she is identical in every
// one by construction. This tool is that sentence turned into numbers.
//
// What is asserted, per character, over every pose x 6 phases:
//
//   1. MATERIAL DRIFT — the head and torso material fingerprint (vertex
//      colours, per-vertex material class, every shading uniform behind them)
//      must be byte-identical in every pose. Zero tolerance. This is where
//      PER-PART identity lives, and the reason it lives here rather than in the
//      histogram is measured: the head is ~8% of the silhouette, so painting
//      the whole head hot magenta moves the frame histogram LESS (tv 0.096)
//      than raising an arm into the key light does (tv 0.19). --selftest holds
//      that case permanently.
//   2. PALETTE HISTOGRAM — the pose's quantised colour histogram against the
//      idle reference: total-variation distance, share still accounted for by
//      the reference's core colours, and share held by colours the reference
//      never had. This catches what the fingerprint cannot see — the RENDERED
//      result drifting while the source data is untouched, e.g. flipped
//      normals from a bind-matrix determinant regression.
//   3. SILHOUETTE AREA — covered pixels as a ratio of the idle reference.
//      Skinning and bind-matrix breakage that leaves colour alone.
//   4. STANDING HEIGHT — the bind-pose silhouette against HERO_HEIGHTS_M at the
//      spec's own HEIGHT_TOLERANCE, so the rig cannot drift from the table the
//      camera math trusts.
//
// A lit render CANNOT hold its histogram exactly across poses and it is not
// supposed to: raising an arm into the key light legitimately mints a band the
// idle pose never had. So the bands below are empirical — measured across all
// four characters x 7 poses x 6 phases, then given headroom. Worst clean run:
// tv 0.190, coreCov 0.899, alien 0.084, area 0.734-1.074. Bands sit ~1.4x out
// from those. --selftest is what makes "tight enough to catch something" more
// than an assertion; run it after any change to the rig, the material or these
// numbers.
//
// KNOWN MARGIN, stated rather than hidden: the flipped-normals fault reads
// tv 0.412 against a 0.28 band and a 0.190 clean worst. That is a factor of
// ~2.2 between the worst legitimate pose and a real fault — comfortable, but
// not enormous, and it is the tightest of the four. A subtler lighting
// regression than a full normal flip could sit inside the band.
//
// The gate renders its OWN actor in its OWN scene under its OWN fixed lights
// (src/actors/gate.js) — nothing here reads the world, the hour, the exposure
// or the post chain, because a measurement that moves when the sun moves cannot
// answer the question. How it LOOKS is the screenshots' job; the contact sheet
// this writes is for the human, not for the assertions.
// ─────────────────────────────────────────────────────────────────────────────
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, arg, flag, numArg, boot, settle } from './lib/harness.mjs';

const PORT = parseInt(arg('port', '5190'), 10);
const OUT = path.resolve(ROOT, arg('out', 'shots/rig'));
const PHASES = parseInt(arg('phases', '6'), 10);

/* Empirical bands. See the header for where these came from — they are measured
   with headroom, not invented, and re-deriving them is a survey run, not a
   guess. Moving one is a Phase 2 decision, not a convenience. */
const BAND = {
  tv: numArg('tv', 0.28),              // total-variation distance vs idle
  coreCoverage: numArg('core', 0.88),  // share still held by the reference's core colours
  alienShare: numArg('alien', 0.10),   // share held by colours the reference never had
  areaMin: numArg('areamin', 0.66),
  areaMax: numArg('areamax', 1.20),
};

const h = await boot({ port: PORT, quality: 'ultra', hour: 6.4 });
const { page, errors } = h;
console.log(`gpu: ${h.renderer}${h.software ? '   *** SOFTWARE RASTERISER ***' : ''}`);
await settle(page, 6);

const CAST = (arg('ids') && arg('ids') !== true)
  ? String(arg('ids')).split(',').map((s) => s.trim()).filter(Boolean)
  : null;

/* ── the measurement, in-page ─────────────────────────────────────────────── */
const run = await page.evaluate(async ({ BAND, PHASES, CAST, wantSheet }) => {
  const gate = window.__DAWN__.ctx.actors.gate;
  const cast = CAST || [...gate.heroes.map((id) => [id, 'ally']), ['grunt', 'hostile']]
    .map((x) => (Array.isArray(x) ? x : [x, 'ally']));
  const list = CAST ? CAST.map((id) => [id, id === 'grunt' ? 'hostile' : 'ally']) : cast;

  const tvDist = (a, b) => {
    let d = 0;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) d += Math.abs((a[k] || 0) - (b[k] || 0));
    return d / 2;
  };

  /* Contact-sheet compositor. Cells are the gate's own 192×288 target, drawn at
     half size — the sheet is for reading silhouettes side by side, and a
     full-size grid of 28 cells does not fit on a screen. */
  const { w: CW, h: CH } = gate.size;
  const S = 0.5, cw = CW * S, ch = CH * S, pad = 22, lead = 20;
  let sheet = null, sctx = null, cell = null, cctx = null, col = 0, row = 0;
  const poses = gate.poses;
  if (wantSheet) {
    sheet = document.createElement('canvas');
    sheet.width = pad + poses.length * (cw + pad);
    sheet.height = lead + list.length * (ch + lead + pad);
    sctx = sheet.getContext('2d');
    sctx.fillStyle = '#12141c';
    sctx.fillRect(0, 0, sheet.width, sheet.height);
    cell = document.createElement('canvas');
    cell.width = CW; cell.height = CH;
    cctx = cell.getContext('2d');
  }
  function draw(label) {
    if (!sctx) return;
    const px = gate.pixels;
    const img = cctx.createImageData(CW, CH);
    for (let y = 0; y < CH; y++) {                 // readRenderTargetPixels is bottom-up
      const src = (CH - 1 - y) * CW * 4, dst = y * CW * 4;
      img.data.set(px.subarray(src, src + CW * 4), dst);
    }
    cctx.putImageData(img, 0, 0);
    const x = pad + col * (cw + pad), y = lead + row * (ch + lead + pad);
    sctx.fillStyle = '#0a0b10';
    sctx.fillRect(x, y, cw, ch);
    sctx.drawImage(cell, x, y, cw, ch);
    sctx.fillStyle = '#7de3ff';
    sctx.font = '11px ui-monospace, monospace';
    sctx.fillText(label, x, y - 5);
  }

  const out = [];
  for (const [id, faction] of list) {
    const info = gate.begin(id, faction);

    gate.setPose('idle', 0);
    const ref = gate.sample();
    const refHead = gate.fingerprint('head');
    const refTorso = gate.fingerprint('torso');
    const core = Object.entries(ref.shares).filter(([, v]) => v >= 0.01).map(([k]) => k);

    const expectH = gate.heroHeights[id] ?? null;
    const heightDev = expectH ? Math.abs(ref.heightM - expectH) / expectH : 0;

    const samples = [];
    col = 0;
    for (const p of poses) {
      let worst = null;
      for (let i = 0; i < PHASES; i++) {
        const t = i / PHASES;
        gate.setPose(p, t);
        const s = gate.sample();
        const head = gate.fingerprint('head'), torso = gate.fingerprint('torso');
        const alien = Object.entries(s.shares).filter(([k]) => !ref.shares[k]);
        const r = {
          pose: p, t: +t.toFixed(3),
          area: s.area, ratio: s.area / ref.area,
          heightM: s.heightM,
          tv: tvDist(ref.shares, s.shares),
          coreCoverage: core.reduce((a, k) => a + (s.shares[k] || 0), 0),
          alienShare: alien.reduce((a, [, v]) => a + v, 0),
          alienCount: alien.length,
          headDrift: head.hash !== refHead.hash,
          torsoDrift: (torso?.hash ?? null) !== (refTorso?.hash ?? null),
        };
        r.fail = [];
        if (r.headDrift) r.fail.push('head material drift');
        if (r.torsoDrift) r.fail.push('torso material drift');
        if (r.tv > BAND.tv) r.fail.push(`tv ${r.tv.toFixed(3)} > ${BAND.tv}`);
        if (r.coreCoverage < BAND.coreCoverage) r.fail.push(`coreCov ${r.coreCoverage.toFixed(3)} < ${BAND.coreCoverage}`);
        if (r.alienShare > BAND.alienShare) r.fail.push(`alien ${r.alienShare.toFixed(3)} > ${BAND.alienShare}`);
        if (r.ratio < BAND.areaMin || r.ratio > BAND.areaMax) r.fail.push(`area ${r.ratio.toFixed(3)} outside ${BAND.areaMin}–${BAND.areaMax}`);
        samples.push(r);
        // Sheet cell is the pose's mid-phase — the frame with the most motion in it.
        if (wantSheet && i === Math.floor(PHASES / 2)) draw(`${id}/${p}`);
        if (!worst || r.fail.length > worst.fail.length) worst = r;
      }
      col++;
    }
    row++;

    const agg = (f) => samples.map(f);
    out.push({
      id, faction, tris: info.tris, heightM: info.heightM,
      refArea: ref.area, refColors: Object.keys(ref.shares).length, coreColors: core.length,
      bindHeightM: ref.heightM, expectHeightM: expectH, heightDev,
      heightFail: expectH ? heightDev > gate.heightTolerance : false,
      max: {
        tv: Math.max(...agg((r) => r.tv)),
        alienShare: Math.max(...agg((r) => r.alienShare)),
        areaMax: Math.max(...agg((r) => r.ratio)),
      },
      min: {
        coreCoverage: Math.min(...agg((r) => r.coreCoverage)),
        areaMin: Math.min(...agg((r) => r.ratio)),
      },
      drift: samples.filter((r) => r.headDrift || r.torsoDrift).length,
      failures: samples.filter((r) => r.fail.length).map((r) => ({ pose: r.pose, t: r.t, why: r.fail })),
      samples: samples.length,
    });
    gate.end();
  }
  return { rows: out, poses, tolerance: gate.heightTolerance, sheet: sheet ? sheet.toDataURL('image/png') : null };
}, { BAND, PHASES, CAST, wantSheet: !flag('nosheet') });

/* ── report ───────────────────────────────────────────────────────────────── */
const bad = [];
console.log(`\nposes: ${run.poses.join(', ')}   phases: ${PHASES}   height tolerance ±${(run.tolerance * 100).toFixed(0)}%`);
console.log(`bands: tv ≤ ${BAND.tv}  coreCov ≥ ${BAND.coreCoverage}  alien ≤ ${BAND.alienShare}  area ${BAND.areaMin}–${BAND.areaMax}\n`);
for (const r of run.rows) {
  const ok = !r.failures.length && !r.heightFail;
  if (!ok) bad.push(r.id);
  console.log(`[${r.id}] ${r.faction}  ${r.tris} tri  ${r.samples} samples  ${ok ? 'PASS' : 'FAIL'}`);
  console.log(`   bind height ${r.bindHeightM.toFixed(3)}m vs spec ${r.expectHeightM?.toFixed(3) ?? '—'}m`
    + `  dev ${(r.heightDev * 100).toFixed(1)}%${r.heightFail ? '   *** OUT OF BAND ***' : ''}`);
  console.log(`   material drift ${r.drift} / ${r.samples} samples${r.drift ? '   *** DRIFT ***' : '   (clean)'}`);
  console.log(`   palette  tv max ${r.max.tv.toFixed(3)}   coreCov min ${r.min.coreCoverage.toFixed(3)}`
    + `   alien max ${r.max.alienShare.toFixed(3)}   (${r.coreColors} core of ${r.refColors} ref colours)`);
  console.log(`   silhouette  area ${r.min.areaMin.toFixed(3)}–${r.max.areaMax.toFixed(3)} × ref ${r.refArea}px`);
  for (const f of r.failures.slice(0, 8)) console.log(`   FAIL ${f.pose}@${f.t}: ${f.why.join('; ')}`);
  if (r.failures.length > 8) console.log(`   … and ${r.failures.length - 8} more`);
}

if (run.sheet) {
  await mkdir(OUT, { recursive: true });
  const p = path.join(OUT, 'poses.png');
  await writeFile(p, Buffer.from(run.sheet.split(',')[1], 'base64'));
  console.log(`\nsheet: ${path.relative(ROOT, p)}`);
}

/* ── self-test: a gate that has never been shown to fail is not evidence ──── */
if (flag('selftest')) {
  console.log('\n── selftest — inject a fault, the gate must catch it ──');
  const st = await page.evaluate(async ({ BAND }) => {
    const gate = window.__DAWN__.ctx.actors.gate;
    const tvDist = (a, b) => {
      let d = 0;
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) d += Math.abs((a[k] || 0) - (b[k] || 0));
      return d / 2;
    };
    const measure = (ref, core) => {
      const s = gate.sample();
      return {
        tv: tvDist(ref.shares, s.shares),
        coreCoverage: core.reduce((a, k) => a + (s.shares[k] || 0), 0),
        alienShare: Object.entries(s.shares).filter(([k]) => !ref.shares[k]).reduce((a, [, v]) => a + v, 0),
        ratio: s.area / ref.area,
        head: gate.fingerprint('head').hash,
      };
    };

    const cases = [];
    const faults = [
      {
        name: 'shading uniform nudged', assertion: 'MATERIAL',
        // The classic: "flash the hero on hurt" written against the SHARED
        // material instead of a per-actor one, so every character drifts.
        break: () => { gate.uniforms.uPivot.value += 0.11; },
        caught: (m, ref) => m.head !== ref.head,
      },
      {
        name: 'head re-tinted', assertion: 'MATERIAL',
        // Per-part identity lives in the fingerprint, NOT in the frame
        // histogram — and this case is why. The head is ~8% of the silhouette,
        // so painting the whole thing hot magenta moves the whole-body
        // histogram (tv 0.096) LESS than raising an arm into the key light does
        // (tv 0.19). Measured, not assumed. The fingerprint reads the vertex
        // colours directly and does not care how big the part is.
        break: () => {
          const a = gate.actor, r = a.partRanges.head;
          const c = a.mesh.geometry.getAttribute('color');
          for (let i = r.start; i < r.start + r.count; i++) c.setXYZ(i, 0.95, 0.15, 0.55);
          c.needsUpdate = true;
        },
        caught: (m, ref) => m.head !== ref.head,
      },
      {
        name: 'normals flipped', assertion: 'PALETTE',
        // The fault the fingerprint CANNOT see: vertex colours, material
        // uniforms and vertex positions are all untouched, so the hash holds
        // and the silhouette area holds — every lit band inverts and only the
        // histogram notices. A bind-matrix determinant flip or a winding
        // regression looks exactly like this.
        break: () => {
          const n = gate.actor.mesh.geometry.getAttribute('normal');
          for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
          n.needsUpdate = true;
        },
        caught: (m) => m.alienShare > BAND.alienShare || m.coreCoverage < BAND.coreCoverage || m.tv > BAND.tv,
      },
      {
        name: 'limb blow-up', assertion: 'SILHOUETTE',
        // A bone scaled 2.6x — a skinning or bind-matrix regression that leaves
        // colour and material untouched and wrecks the read.
        break: () => {
          const b = gate.actor.boneByName.get('upperArm_R');
          b.scale.setScalar(2.6);
          gate.actor.root.updateMatrixWorld(true);
        },
        caught: (m) => m.ratio < BAND.areaMin || m.ratio > BAND.areaMax,
      },
    ];

    for (const f of faults) {
      gate.begin('kaida', 'ally');
      gate.setPose('idle', 0);
      const ref = gate.sample();
      const core = Object.entries(ref.shares).filter(([, v]) => v >= 0.01).map(([k]) => k);
      const before = measure(ref, core);
      f.break();
      gate.setPose('idle', 0);              // re-evaluate the pose after the injury
      const after = measure(ref, core);
      cases.push({
        name: f.name, assertion: f.assertion,
        cleanPasses: !f.caught(before, before),
        caught: f.caught(after, before),
        before: { tv: +before.tv.toFixed(3), coreCoverage: +before.coreCoverage.toFixed(3), alienShare: +before.alienShare.toFixed(3), ratio: +before.ratio.toFixed(3) },
        after: { tv: +after.tv.toFixed(3), coreCoverage: +after.coreCoverage.toFixed(3), alienShare: +after.alienShare.toFixed(3), ratio: +after.ratio.toFixed(3) },
        headBefore: before.head, headAfter: after.head,
      });
      gate.end();                            // the injury dies with the actor
    }
    return cases;
  }, { BAND });

  for (const c of st) {
    const ok = c.caught && c.cleanPasses;
    if (!ok) bad.push(`selftest:${c.name}`);
    console.log(`  ${ok ? 'CAUGHT ' : 'MISSED '} ${c.assertion.padEnd(10)} ${c.name}`);
    console.log(`      clean  tv ${c.before.tv} coreCov ${c.before.coreCoverage} alien ${c.before.alienShare} area ${c.before.ratio} head ${c.headBefore}`);
    console.log(`      broken tv ${c.after.tv} coreCov ${c.after.coreCoverage} alien ${c.after.alienShare} area ${c.after.ratio} head ${c.headAfter}`);
    if (!c.cleanPasses) console.log('      *** the clean case also trips this assertion — the check is not discriminating ***');
  }
}

if (errors.length) console.error('\nERRORS:\n' + errors.slice(0, 10).join('\n'));
console.log(`\n${bad.length ? 'FAIL: ' + [...new Set(bad)].join(', ') : 'PASS: rig holds across every pose'}`);
await h.close(bad.length || errors.length ? 1 : 0);
