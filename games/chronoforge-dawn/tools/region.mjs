#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// The region gate — "does the world that got BUILT agree with the world that
// was AUTHORED?"
//
//   node tools/region.mjs                    all twelve maps, live
//   node tools/region.mjs --maps haventide_region,emberline_region
//   node tools/region.mjs --dry              offline half only, no browser
//   node tools/region.mjs --selftest         prove the gate catches a fault
//   node tools/region.mjs --json             machine output
//   node tools/region.mjs --wait 600         poll for the runtime, then run
//
// Flags: --port (5190), --maps a,b, --verbose, --grid <m>, --htol, --stol,
//        --fault <name> to run one selftest fault instead of all ten.
//
// Phase 4a's gate. `docs/specs/world-graph.mjs` already proves the DATA is
// coherent and exits 0. It cannot prove anything about the runtime, because
// the runtime is the thing that turns tiles into metres, and that conversion
// is where this class of bug lives.
//
// THE METRIC: live minus offline, per probe, in metres and degrees. Not a
// boolean. For every doorway landing, every encounter stage, every build plot
// and a full-map height scan, the same quantity is computed twice — once from
// `docs/specs/*` in node, once from the LIVE `ctx.world` in the page — and
// what gets reported is the difference.
//
// WHY THE OBVIOUS METRIC IS WRONG. The obvious gate is a list of absolute
// assertions: landing in bounds, landing passable, slope under 20 deg, stage
// spread under 2.58 m. Run that against a world built with
//
//     worldX = tx * TILE_M - widthM / 2          // the contract says tx + 0.5
//
// and every single assertion passes. The error is 1 m. Every doorway is still
// in bounds, still passable, still on gentle ground; every stage still clears;
// every plot is still level. The whole map is one metre north-west of where
// the design says it is, the party walks through a door and arrives a metre
// off the mark on all twelve maps, and an absolute-threshold gate reports
// green. Only the delta against the offline answer sees it. That half-tile is
// the default `--selftest` fault for exactly this reason.
//
// A recomputation is not a check. If this tool derived the expected doorway
// height from `heightfields.mjs` and then compared it to a number it had also
// derived from `heightfields.mjs`, it would prove that arithmetic is
// deterministic. The live sample is the only value in this file that this
// file did not compute, and it is the only reason the file exists.
//
// THE CONTROL. Both sides run the SAME loop over the SAME sample geometry —
// same disc radii, same 0.5 m step, same float accumulation, same slope
// estimator shape. The only variable is where `h` comes from. The offline
// clearance loop is cross-checked against `heightfields.mjs clearanceAt()`
// itself at startup and must agree to 1e-9, so that when a delta shows up it
// is the world disagreeing and not this tool's copy of the algorithm.
//
// AND: a gate that has never failed is not known to work. `--selftest` injects
// ten known-bad conditions at the live-reading boundary. Each one names the
// assertion that MUST fire, and the selftest only passes if that specific
// assertion fires — 'something else failed' does not count, or a fault could
// be scored as caught by an assertion that had nothing to do with it.
// `--fault <name>` runs one. If any fault gets through, the selftest exits
// non-zero even though the world itself is fine.
//
// TWO THINGS THIS TURNED UP, both recorded here because they are properties of
// the pair and not of either side:
//
//   * The runtime CLAMPS map-local coordinates into the map rect
//     (src/world/field.js); heightfields.heightAt() evaluates its noise field
//     anywhere. 17 of the 36 encounter discs and 1 build plot reach past the
//     edge, mire_bog e13 by 8.16 m of a 9.16 m radius. Their live-vs-offline
//     deltas measure the DOMAIN, not the field, so they are advisory. The
//     absolute clearance limits still gate, on the clamped surface, because
//     that is the ground the party actually fights on.
//   * heightfields.mjs checks doorway ground slope for OUTDOOR doorways only.
//     The four city-interior exits land on outdoor tiles that are not doorway
//     records, so nothing checked them until this tool did. One of them —
//     last_crown_interior -> last_crown_region (32,26) — sits at 19.0 deg
//     against a 20 deg limit. It passes with one degree to spare.
//
// EXIT: 0 clean, 1 assertion failures, 2 environment, 3 runtime not present,
//       4 selftest failed to catch an injected fault.
// ─────────────────────────────────────────────────────────────────────────────
import { arg, flag, numArg, boot, settle } from './lib/harness.mjs';
import * as G from '../docs/specs/world-graph.mjs';
import * as HF from '../docs/specs/heightfields.mjs';
import { fbm2D } from '../src/core/rng.js';
import { TILE_M } from '../src/core/const.js';

const PORT     = parseInt(arg('port', '5190'), 10);
const DRY      = flag('dry');
const JSON_OUT = flag('json');
const VERBOSE  = flag('verbose');
const SELFTEST = flag('selftest');
const FAULT    = arg('fault', 'all');
const WAIT_S   = numArg('wait', 0);          // poll this long for ctx.world.setMap
const GRID_M   = numArg('grid', HF.VERTEX_SPACING_M);   // full-map scan step, metres

/* Tolerances. Position and dimension are EXACT quantities — the contract
   states the formula — so their tolerance is float noise and nothing more.
   Height and slope are field evaluations and the runtime may legitimately
   differ in its noise plumbing by a hair; those two are the only knobs. */
const POS_TOL_M   = 1e-3;
const DIM_TOL_M   = 1e-6;
const H_TOL_M     = numArg('htol', 0.05);
const SLOPE_TOL_D = numArg('stol', 2.0);

const ALL_IDS = Object.keys(G.MAPS);
const RUN_IDS = (() => {
  const sel = arg('maps', null);
  if (!sel || sel === true) return ALL_IDS;
  const want = String(sel).split(',').map(s => s.trim()).filter(Boolean);
  const bad = want.filter(id => !G.MAPS[id]);
  if (bad.length) { console.error(`unknown map id(s): ${bad.join(', ')}`); process.exit(2); }
  return want;
})();
const PARTIAL = RUN_IDS.length !== ALL_IDS.length;

const R_FRAME = HF.frameRadiusM();
const R_STAGE = HF.R_STAGE_M;
const DISC_STEP = 0.5;                     // matches clearanceAt()
const PLOT_HALF = HF.PLOT_FOOTPRINT_M / 2;
const PLOT_STEP = 1;                       // matches the heightfields plot loop

// ── the sample geometry, written once and run on both sides ─────────────────
// H(x,z) -> metres, S(x,z) -> degrees. Only those two differ between offline
// and live. Everything else — radii, step, the order of the float
// accumulation — is shared, so a delta is a statement about the world.

function discSample(H, S, cx, cz, rF, rS, step) {
  let sLo = Infinity, sHi = -Infinity, fLo = Infinity, fHi = -Infinity, maxSlope = 0;
  for (let dz = -rF; dz <= rF; dz += step) for (let dx = -rF; dx <= rF; dx += step) {
    const rr = dx * dx + dz * dz;
    if (rr > rF * rF) continue;
    const h = H(cx + dx, cz + dz);
    if (h < fLo) fLo = h; if (h > fHi) fHi = h;
    if (rr > rS * rS) continue;
    if (h < sLo) sLo = h; if (h > sHi) sHi = h;
    const sl = S(cx + dx, cz + dz);
    if (sl > maxSlope) maxSlope = sl;
  }
  return { stageSpread: sHi - sLo, stageMaxSlopeDeg: maxSlope, frameSpread: fHi - fLo };
}

function plotSample(H, S, cx, cz, half, step) {
  let lo = Infinity, hi = -Infinity;
  for (let dz = -half; dz <= half; dz += step) for (let dx = -half; dx <= half; dx += step) {
    const h = H(cx + dx, cz + dz);
    if (h < lo) lo = h; if (h > hi) hi = h;
  }
  return { spread: hi - lo, slopeDeg: S(cx, cz) };
}

/* The full-map scan. TWO slope numbers, because the biome's authored
   `maxSlopeDeg` was measured one specific way and a different-but-reasonable
   way disagrees with it enough to invent a failure.

     axisSlopeDeg   forward difference between 4-neighbours, one axis at a
                    time — exactly what heightfields.mjs sampleField() does,
                    and therefore the only definition that may be compared to
                    the biome's own ceiling. This is the gated number.
     normalSlopeDeg central difference on both axes, combined — the true
                    surface slope, and what the runtime's normalAt() reports.
                    Always the larger of the two. Reported, and used for the
                    live-vs-offline delta, not gated against the ceiling.

   mire_bog is the case that made this necessary: 18.0 deg by the axis
   definition, 18.4 deg by the normal definition, against an 18 deg ceiling.
   Gating the wrong one fails a map that is fine.

   Both come out of ONE height grid, so the live side pays 1 heightAt per
   point and not 5, and both sides run identical arithmetic on it. */
function gridScan(H, x0, z0, step, nx, nz) {
  const g = new Float64Array(nx * nz);
  let min = Infinity, max = -Infinity;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const h = H(x0 + i * step, z0 + j * step);
    g[j * nx + i] = h;
    if (h < min) min = h; if (h > max) max = h;
  }
  let axis = 0, axisAt = null;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const h = g[j * nx + i];
    if (i + 1 < nx) { const d = Math.abs(g[j * nx + i + 1] - h) / step; if (d > axis) { axis = d; axisAt = [x0 + i * step, z0 + j * step]; } }
    if (j + 1 < nz) { const d = Math.abs(g[(j + 1) * nx + i] - h) / step; if (d > axis) { axis = d; axisAt = [x0 + i * step, z0 + j * step]; } }
  }
  let norm = 0, normAt = null;
  for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const hx = (g[j * nx + i + 1] - g[j * nx + i - 1]) / (2 * step);
    const hz = (g[(j + 1) * nx + i] - g[(j - 1) * nx + i]) / (2 * step);
    const s = Math.hypot(hx, hz);
    if (s > norm) { norm = s; normAt = [x0 + i * step, z0 + j * step]; }
  }
  const deg = (t) => Math.atan(t) * 180 / Math.PI;
  return { minH: min, maxH: max, range: max - min,
           axisSlopeDeg: deg(axis), axisAt,
           normalSlopeDeg: deg(norm), normalAt: normAt };
}

// ── the offline field, per map ──────────────────────────────────────────────
// Outdoor maps evaluate their biome. Interiors have no biome field: the
// contract sets `biomeId` to null for them and heightfields.mjs only publishes
// INTERIOR_FIELD's parameters, not a callable. The reference below is that
// parameter set evaluated exactly as heightfields.mjs' own interior sampler
// does it. Because the runtime is NOT contractually bound to that formula,
// every interior height/slope delta is reported ADVISORY and cannot fail the
// gate; the absolute limits on interiors still can.

const IF = HF.INTERIOR_FIELD;
const interiorH = (x, z) =>
  (fbm2D(x / IF.wavelengthM, z / IF.wavelengthM,
    { octaves: IF.octaves, lacunarity: IF.lacunarity, gain: IF.gain, seed: IF.seed }) * 2 - 1)
  * IF.amplitudeM / 2;
const interiorSlope = (x, z, e = HF.VERTEX_SPACING_M) =>
  Math.atan(Math.hypot((interiorH(x + e, z) - interiorH(x - e, z)) / (2 * e),
                       (interiorH(x, z + e) - interiorH(x, z - e)) / (2 * e))) * 180 / Math.PI;

function fieldOf(mapId) {
  const m = G.MAPS[mapId];
  if (m.isInterior) {
    return { advisory: true, biomeId: null, H: interiorH, S: interiorSlope,
             maxSlopeDeg: IF.maxSlopeDeg, targetReliefM: IF.amplitudeM };
  }
  const b = HF.BIOMES[m.biome];
  return { advisory: false, biomeId: m.biome,
           H: (x, z) => HF.heightAt(m.biome, x, z),
           S: (x, z) => HF.normalSlopeDeg(m.biome, x, z),
           maxSlopeDeg: b.maxSlopeDeg, targetReliefM: b.targetReliefM };
}

const dimsOf = (mapId) => ({ widthM: G.MAPS[mapId].w * TILE_M, depthM: G.MAPS[mapId].h * TILE_M });

/* How far a sampling footprint of radius r centred at map-local (lx,lz) reaches
   PAST the edge of the map, in metres. Zero if it stays inside.

   This matters more than it looks. `src/world/field.js` clamps local
   coordinates into [0,widthM] x [0,depthM], so the built world is flat outside
   its own rectangle. `heightfields.mjs heightAt()` has no such notion and
   happily evaluates the noise field out there. An encounter on the last tile
   column has a 9.16 m frame disc, so a fifth of its clearance sample sits on
   terrain that does not exist in the built world, and the live-vs-offline
   delta for that encounter is measuring the DOMAIN, not the field.

   So: absolute clearance limits are still gated, because they are measured on
   the clamped surface the player actually fights on. The live-vs-offline delta
   is demoted to advisory for those probes, and the overhang is printed. */
function overhang(lx, lz, r, widthM, depthM) {
  return Math.max(0, r - lx, lx + r - widthM, r - lz, lz + r - depthM);
}

// ── the probe plan ──────────────────────────────────────────────────────────
// Every tile that has to be looked at, filed under the map it actually lives
// on. A doorway's landing tile belongs to the TARGET map, so it can only be
// sampled while that map is the live one — which is the whole reason this tool
// walks all twelve rather than reading a table.

function buildPlan() {
  const plan = new Map();
  const need = (mapId) => {
    if (!plan.has(mapId)) plan.set(mapId, { mapId, tiles: [], tileIndex: new Map(), discs: [], plots: [] });
    return plan.get(mapId);
  };
  const tile = (mapId, tx, ty) => {
    const p = need(mapId), k = `${tx},${ty}`;
    if (!p.tileIndex.has(k)) { p.tileIndex.set(k, p.tiles.length); p.tiles.push({ tx, ty }); }
    return p.tileIndex.get(k);
  };

  const doorRefs = [];      // one per doorway record
  for (const id of ALL_IDS) {
    for (const d of G.MAPS[id].doorways) {
      const ref = {
        from: id, to: d.to.mapId, gate: d.gate,
        self: { mapId: id, tx: d.x, ty: d.y },
        land: { mapId: d.to.mapId, tx: d.to.x, ty: d.to.y },
        selfIdx: null, landIdx: null,
        outdoor: !G.MAPS[id].isInterior && !G.MAPS[d.to.mapId].isInterior,
      };
      if (RUN_IDS.includes(id)) ref.selfIdx = tile(id, d.x, d.y);
      if (RUN_IDS.includes(d.to.mapId) && G.MAPS[d.to.mapId]) ref.landIdx = tile(d.to.mapId, d.to.x, d.to.y);
      doorRefs.push(ref);
    }
  }

  const encRefs = [];
  for (const id of G.OUTDOOR_IDS) {
    if (!RUN_IDS.includes(id)) continue;
    const { widthM, depthM } = dimsOf(id);
    for (const e of G.MAPS[id].encounters) {
      const lx = G.tileToM(e.x), lz = G.tileToM(e.y);
      const p = need(id);
      encRefs.push({ mapId: id, id: e.id, tx: e.x, ty: e.y, enemy: e.enemy,
                     lx, lz, discIdx: p.discs.length,
                     overhangM: overhang(lx, lz, R_FRAME, widthM, depthM) });
      p.discs.push({ wx: lx - widthM / 2, wz: lz - depthM / 2 });
    }
  }

  const plotRefs = [];
  const plotSets = [
    { mapId: 'haventide_region', plots: G.MAPS.haventide_region.city.plots, advisory: false },
    { mapId: 'haventide_interior', plots: G.MAPS.haventide_interior.plots, advisory: true },
  ];
  for (const set of plotSets) {
    if (!RUN_IDS.includes(set.mapId)) continue;
    const { widthM, depthM } = dimsOf(set.mapId);
    const p = need(set.mapId);
    for (const pl of set.plots) {
      const lx = G.tileToM(pl.x), lz = G.tileToM(pl.y);
      plotRefs.push({ mapId: set.mapId, slotIdx: pl.slotIdx, tx: pl.x, ty: pl.y,
                      lx, lz, advisory: set.advisory, idx: p.plots.length,
                      overhangM: overhang(lx, lz, PLOT_HALF, widthM, depthM) });
      p.plots.push({ wx: lx - widthM / 2, wz: lz - depthM / 2 });
    }
  }

  // Every run map needs a grid, even one with no doorway of its own.
  for (const id of RUN_IDS) {
    const p = need(id), { widthM, depthM } = dimsOf(id);
    p.grid = {
      x0: -widthM / 2, z0: -depthM / 2, step: GRID_M,
      nx: Math.floor(widthM / GRID_M) + 1, nz: Math.floor(depthM / GRID_M) + 1,
    };
    p.discParams = { rF: R_FRAME, rS: R_STAGE, step: DISC_STEP };
    p.plotParams = { half: PLOT_HALF, step: PLOT_STEP };
  }

  return { plan, doorRefs, encRefs, plotRefs };
}

// ── the offline answer ──────────────────────────────────────────────────────

function offlineProbe(job) {
  const id = job.mapId, m = G.MAPS[id], f = fieldOf(id);
  const { widthM, depthM } = dimsOf(id);
  const toW = (tx, ty) => ({ x: G.tileToM(tx) - widthM / 2, z: G.tileToM(ty) - depthM / 2 });
  const HW = (wx, wz) => f.H(wx + widthM / 2, wz + depthM / 2);
  const SW = (wx, wz) => f.S(wx + widthM / 2, wz + depthM / 2);

  const points = job.tiles.map(t => {
    const w = toW(t.tx, t.ty);
    return { x: w.x, z: w.z, y: HW(w.x, w.z), h: HW(w.x, w.z), slopeDeg: SW(w.x, w.z) };
  });

  // Clearance comes from the SPEC HELPER, not from this file's loop. The two
  // are cross-checked in verifyLoop() so the loop can be trusted on the live
  // side, where clearanceAt() cannot reach.
  const discs = job.discs.map(d => {
    const lx = d.wx + widthM / 2, lz = d.wz + depthM / 2;
    return m.isInterior ? discSample(f.H, f.S, lx, lz, R_FRAME, R_STAGE, DISC_STEP)
                        : HF.clearanceAt(m.biome, lx, lz);
  });

  const plots = job.plots.map(p => plotSample(HW, SW, p.wx, p.wz, PLOT_HALF, PLOT_STEP));

  const g = job.grid;
  const grid = gridScan(HW, g.x0, g.z0, g.step, g.nx, g.nz);

  return { mapId: id, biomeId: f.biomeId, widthM, depthM, size: Math.max(widthM, depthM),
           points, discs, plots, grid };
}

/** The loop in this file must equal the spec's helper, or every clearance
 *  delta below is measuring this file rather than the world. */
function verifyLoop() {
  let worst = 0, at = null;
  for (const id of G.OUTDOOR_IDS) {
    const b = G.MAPS[id].biome;
    for (const e of G.MAPS[id].encounters) {
      const lx = G.tileToM(e.x), lz = G.tileToM(e.y);
      const spec = HF.clearanceAt(b, lx, lz);
      const mine = discSample((x, z) => HF.heightAt(b, x, z), (x, z) => HF.normalSlopeDeg(b, x, z),
                              lx, lz, R_FRAME, R_STAGE, DISC_STEP);
      for (const k of ['stageSpread', 'stageMaxSlopeDeg', 'frameSpread']) {
        const d = Math.abs(spec[k] - mine[k]);
        if (d > worst) { worst = d; at = `${id} ${e.id} ${k}`; }
      }
    }
  }
  return { worst, at };
}

// ── the live answer ─────────────────────────────────────────────────────────

const PAGE_PROBE = (job) => {
  const D = window.__DAWN__, w = D.ctx.world, T = D.THREE;
  const n = new T.Vector3();
  const H = (x, z) => w.heightAt(x, z);
  const S = (x, z) => {
    w.normalAt(x, z, n);
    return Math.acos(Math.min(1, Math.max(-1, n.y))) * 180 / Math.PI;
  };
  const dsc = (cx, cz, rF, rS, step) => {
    let sLo = Infinity, sHi = -Infinity, fLo = Infinity, fHi = -Infinity, ms = 0;
    for (let dz = -rF; dz <= rF; dz += step) for (let dx = -rF; dx <= rF; dx += step) {
      const rr = dx * dx + dz * dz;
      if (rr > rF * rF) continue;
      const h = H(cx + dx, cz + dz);
      if (h < fLo) fLo = h; if (h > fHi) fHi = h;
      if (rr > rS * rS) continue;
      if (h < sLo) sLo = h; if (h > sHi) sHi = h;
      const sl = S(cx + dx, cz + dz);
      if (sl > ms) ms = sl;
    }
    return { stageSpread: sHi - sLo, stageMaxSlopeDeg: ms, frameSpread: fHi - fLo };
  };

  const out = {
    mapId: w.mapId ?? null, biomeId: w.biomeId ?? null,
    widthM: w.widthM, depthM: w.depthM, size: w.size,
    hasToWorld: typeof w.toWorld === 'function',
  };

  out.points = job.tiles.map(t => {
    const v = w.toWorld(t.tx, t.ty);
    return { x: v.x, z: v.z, y: v.y, h: H(v.x, v.z), slopeDeg: S(v.x, v.z) };
  });

  const dp = job.discParams;
  out.discs = job.discs.map(d => dsc(d.wx, d.wz, dp.rF, dp.rS, dp.step));

  const pp = job.plotParams;
  out.plots = job.plots.map(p => {
    let lo = Infinity, hi = -Infinity;
    for (let dz = -pp.half; dz <= pp.half; dz += pp.step)
      for (let dx = -pp.half; dx <= pp.half; dx += pp.step) {
        const h = H(p.wx + dx, p.wz + dz);
        if (h < lo) lo = h; if (h > hi) hi = h;
      }
    return { spread: hi - lo, slopeDeg: S(p.wx, p.wz) };
  });

  const g = job.grid, gr = new Float64Array(g.nx * g.nz);
  let min = Infinity, max = -Infinity;
  for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
    const h = H(g.x0 + i * g.step, g.z0 + j * g.step);
    gr[j * g.nx + i] = h;
    if (h < min) min = h; if (h > max) max = h;
  }
  let axis = 0, axisAt = null;
  for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
    const h = gr[j * g.nx + i];
    if (i + 1 < g.nx) { const d = Math.abs(gr[j * g.nx + i + 1] - h) / g.step; if (d > axis) { axis = d; axisAt = [g.x0 + i * g.step, g.z0 + j * g.step]; } }
    if (j + 1 < g.nz) { const d = Math.abs(gr[(j + 1) * g.nx + i] - h) / g.step; if (d > axis) { axis = d; axisAt = [g.x0 + i * g.step, g.z0 + j * g.step]; } }
  }
  let norm = 0, normAt = null;
  for (let j = 1; j < g.nz - 1; j++) for (let i = 1; i < g.nx - 1; i++) {
    const hx = (gr[j * g.nx + i + 1] - gr[j * g.nx + i - 1]) / (2 * g.step);
    const hz = (gr[(j + 1) * g.nx + i] - gr[(j - 1) * g.nx + i]) / (2 * g.step);
    const sv = Math.hypot(hx, hz);
    if (sv > norm) { norm = sv; normAt = [g.x0 + i * g.step, g.z0 + j * g.step]; }
  }
  const dg = (t) => Math.atan(t) * 180 / Math.PI;
  out.grid = { minH: min, maxH: max, range: max - min,
               axisSlopeDeg: dg(axis), axisAt, normalSlopeDeg: dg(norm), normalAt: normAt };
  return out;
};

// ── fault injection ─────────────────────────────────────────────────────────
// Faults are applied to the LIVE READING, never to src/. Each names the
// assertion that must fire; if that assertion does not fire, the selftest
// fails and the gate is not trusted.

const FAULTS = {
  halftile: {
    why: 'tile->metre conversion drops the +0.5 tile-centre term (the contract formula, off by one half tile)',
    expect: /tile->metre|off by [\d.]+ m/,
    apply: (r) => { for (const p of r.points) { p.x -= TILE_M / 2; p.z -= TILE_M / 2; } },
  },
  tile: {
    why: 'tile->metre conversion is one whole tile east',
    expect: /off by [\d.]+ m/,
    apply: (r) => { for (const p of r.points) p.x += TILE_M; },
  },
  flipz: {
    why: 'map origin is at the SW corner, not the NW — the whole map is mirrored in z',
    expect: /off by [\d.]+ m/,
    apply: (r) => { for (const p of r.points) p.z = -p.z; },
  },
  dims: {
    why: 'widthM computed from w-1 tiles',
    expect: /widthM live|depthM live/,
    apply: (r) => { r.widthM -= TILE_M; r.size = Math.max(r.widthM, r.depthM); },
  },
  lift: {
    why: 'the built mesh sits 9 m above the field it was generated from',
    expect: /height live .* delta|relief .* outside the authored band/,
    apply: (r) => {
      for (const p of r.points) { p.h += 9; p.y += 9; }
      r.grid.minH += 9; r.grid.maxH += 9;
    },
  },
  steepdoor: {
    why: 'a doorway landing nudged onto a wall — reported ground slope x4',
    expect: /DOOR_MAX_SLOPE_DEG/,
    apply: (r) => { for (const p of r.points) p.slopeDeg = p.slopeDeg * 4 + 25; },
  },
  outofbounds: {
    why: 'a doorway landing converted to a position outside the built map',
    expect: /outside the built map/,
    apply: (r) => { if (r.points.length) r.points[0].x = r.widthM; },
  },
  stage: {
    why: 'terrain under an encounter is 4 m more broken than the field says',
    expect: /stage spread|stage slope|frame spread/,
    apply: (r) => {
      if (r.discs.length) { r.discs[0].stageSpread += 4; r.discs[0].stageMaxSlopeDeg += 20; }
    },
  },
  plot: {
    why: 'a Haventide build plot sits on 25 deg of ground',
    expect: /PLOT_MAX_SLOPE_DEG|PLOT_MAX_SPREAD|plot \d+ .* live spread/,
    apply: (r) => { if (r.plots.length) { r.plots[0].slopeDeg += 25; r.plots[0].spread += 3; } },
  },
  walkable: {
    why: 'the built surface exceeds the biome slope ceiling somewhere',
    expect: /biome ceiling|walkable ceiling/,
    apply: (r) => { r.grid.axisSlopeDeg += 40; r.grid.normalSlopeDeg += 40; },
  },
};

// ── the assertions ──────────────────────────────────────────────────────────

function evaluate(offline, live, refs, ctxInfo) {
  const fail = [], advisory = [], rows = [];
  const F = (mapId, msg) => fail.push(`[${mapId}] ${msg}`);
  const A = (mapId, msg) => advisory.push(`[${mapId}] ${msg}`);
  const d = (a, b) => a - b;

  // 1. every map built, dimensions agree, size is conservative
  const mapRows = [];
  for (const id of RUN_IDS) {
    const off = offline.get(id), lv = live.get(id);
    if (!lv) { F(id, 'map did not build — no live probe'); continue; }
    if (lv.built === false) { F(id, `setMap('${id}') threw: ${lv.error}`); continue; }
    if (lv.mapId !== id) F(id, `ctx.world.mapId is "${lv.mapId}" after setMap("${id}")`);
    if (lv.hasToWorld === false) F(id, 'ctx.world.toWorld is not a function — contract key missing');

    const dW = d(lv.widthM, off.widthM), dD = d(lv.depthM, off.depthM);
    if (Math.abs(dW) > DIM_TOL_M) F(id, `widthM live ${lv.widthM} vs ${off.widthM} (${G.MAPS[id].w} tiles x ${TILE_M} m), delta ${dW.toFixed(4)} m`);
    if (Math.abs(dD) > DIM_TOL_M) F(id, `depthM live ${lv.depthM} vs ${off.depthM} (${G.MAPS[id].h} tiles x ${TILE_M} m), delta ${dD.toFixed(4)} m`);
    const wantSize = Math.max(lv.widthM, lv.depthM);
    if (Math.abs(lv.size - wantSize) > DIM_TOL_M)
      F(id, `size ${lv.size} is not max(widthM,depthM) ${wantSize} — main.js clamps the shadow focus with it`);

    const wantBiome = G.MAPS[id].isInterior ? null : G.MAPS[id].biome;
    if ((lv.biomeId ?? null) !== wantBiome) F(id, `biomeId live "${lv.biomeId}" vs "${wantBiome}"`);

    if (lv.consoleErrors && lv.consoleErrors.length)
      F(id, `${lv.consoleErrors.length} console error(s) while building: ${lv.consoleErrors[0].slice(0, 160)}`);

    // 7. walkable surface — max live slope against the biome's own ceiling.
    //    Gated on axisSlopeDeg: that is the definition the ceiling was set with.
    const f = fieldOf(id);
    const dSlope = d(lv.grid.axisSlopeDeg, off.grid.axisSlopeDeg);
    const dNorm  = d(lv.grid.normalSlopeDeg, off.grid.normalSlopeDeg);
    const dRange = d(lv.grid.range, off.grid.range);
    const at = (a) => (a || []).map(v => v.toFixed(1)).join(', ');
    if (lv.grid.axisSlopeDeg > f.maxSlopeDeg)
      F(id, `max live slope ${lv.grid.axisSlopeDeg.toFixed(1)} deg > biome ceiling ${f.maxSlopeDeg} deg at (${at(lv.grid.axisAt)}) m`);
    if (lv.grid.axisSlopeDeg > HF.MAX_WALKABLE_SLOPE_DEG)
      F(id, `max live slope ${lv.grid.axisSlopeDeg.toFixed(1)} deg breaks the global walkable ceiling ${HF.MAX_WALKABLE_SLOPE_DEG} deg at (${at(lv.grid.axisAt)}) m`);

    // relief band: the authored peak-to-peak, on the surface that got built
    if (!f.advisory) {
      const lo = f.targetReliefM * 0.75, hi = f.targetReliefM * 1.30;
      if (lv.grid.range < lo || lv.grid.range > hi)
        F(id, `live relief ${lv.grid.range.toFixed(2)} m outside the authored band [${lo.toFixed(2)}, ${hi.toFixed(2)}] for targetReliefM ${f.targetReliefM}`);
      if (Math.abs(dRange) > H_TOL_M * 4)
        F(id, `live relief ${lv.grid.range.toFixed(2)} m vs offline ${off.grid.range.toFixed(2)} m, delta ${dRange.toFixed(3)} m`);
      if (Math.abs(dSlope) > SLOPE_TOL_D)
        F(id, `max axis slope live ${lv.grid.axisSlopeDeg.toFixed(1)} vs offline ${off.grid.axisSlopeDeg.toFixed(1)} deg, delta ${dSlope.toFixed(2)} deg`);
      if (Math.abs(dNorm) > SLOPE_TOL_D)
        F(id, `max surface slope live ${lv.grid.normalSlopeDeg.toFixed(1)} vs offline ${off.grid.normalSlopeDeg.toFixed(1)} deg, delta ${dNorm.toFixed(2)} deg`);
    } else {
      if (Math.abs(dRange) > H_TOL_M * 4) A(id, `interior relief live ${lv.grid.range.toFixed(2)} m vs reference ${off.grid.range.toFixed(2)} m`);
      if (Math.abs(dSlope) > SLOPE_TOL_D) A(id, `interior max slope live ${lv.grid.axisSlopeDeg.toFixed(1)} vs reference ${off.grid.axisSlopeDeg.toFixed(1)} deg`);
    }

    mapRows.push({
      mapId: id, biomeId: lv.biomeId ?? null, advisory: f.advisory,
      widthM: lv.widthM, depthM: lv.depthM, dW, dD,
      reliefLive: lv.grid.range, reliefOff: off.grid.range, dRange,
      slopeLive: lv.grid.axisSlopeDeg, slopeOff: off.grid.axisSlopeDeg, dSlope,
      normLive: lv.grid.normalSlopeDeg, normOff: off.grid.normalSlopeDeg, dNorm,
      slopeLimit: f.maxSlopeDeg,
      reliefBand: f.advisory ? null : [f.targetReliefM * 0.75, f.targetReliefM * 1.30],
    });
  }

  // 2/3. doorways: landing converts in-bounds, is passable, is on ground the
  //      live field agrees with, and is not on a wall
  const doorRows = [];
  let worstPos = { v: -1 }, worstH = { v: -1 }, worstDoorSlope = { v: -1 };
  for (const r of refs.doorRefs) {
    const row = { from: r.from, to: r.to, self: [r.self.tx, r.self.ty], land: [r.land.tx, r.land.ty], gate: r.gate };

    for (const side of ['self', 'land']) {
      const t = r[side], idx = r[side === 'self' ? 'selfIdx' : 'landIdx'];
      if (idx == null) { row[side + 'Skipped'] = true; continue; }
      const off = offline.get(t.mapId), lv = live.get(t.mapId);
      if (!lv || lv.built === false) { row[side + 'Skipped'] = true; continue; }
      const o = off.points[idx], p = lv.points[idx];
      const tag = `${r.from}(${r.self.tx},${r.self.ty})->${r.to}(${r.land.tx},${r.land.ty}) ${side}`;

      const dPos = Math.hypot(p.x - o.x, p.z - o.z);
      if (dPos > worstPos.v) worstPos = { v: dPos, tag };
      if (dPos > POS_TOL_M)
        F(t.mapId, `${tag} tile (${t.tx},${t.ty}) -> live (${p.x.toFixed(3)}, ${p.z.toFixed(3)}) m, contract says (${o.x.toFixed(3)}, ${o.z.toFixed(3)}) m — off by ${dPos.toFixed(3)} m (${(dPos / TILE_M).toFixed(2)} tiles)`);

      const halfW = lv.widthM / 2, halfD = lv.depthM / 2;
      if (!(p.x >= -halfW && p.x <= halfW && p.z >= -halfD && p.z <= halfD))
        F(t.mapId, `${tag} lands at (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) m, outside the built map (+/-${halfW} x +/-${halfD} m)`);

      if (!G.passableAt(t.mapId, t.tx, t.ty))
        F(t.mapId, `${tag} tile (${t.tx},${t.ty}) is not passable`);

      if (!Number.isFinite(p.h))
        F(t.mapId, `${tag} live heightAt is ${p.h} — not finite`);

      const f = fieldOf(t.mapId);
      const dH = p.h - o.h;
      if (Math.abs(dH) > worstH.v) worstH = { v: Math.abs(dH), tag };
      if (Number.isFinite(p.h)) {
        // inside the biome's authored relief envelope, measured on the live map
        const lo = lv.grid.minH - H_TOL_M, hi = lv.grid.maxH + H_TOL_M;
        if (p.h < lo || p.h > hi)
          F(t.mapId, `${tag} height ${p.h.toFixed(2)} m is outside the live field envelope [${lo.toFixed(2)}, ${hi.toFixed(2)}] m`);
        if (Math.abs(dH) > H_TOL_M) {
          const msg = `${tag} height live ${p.h.toFixed(3)} vs offline ${o.h.toFixed(3)} m, delta ${dH.toFixed(3)} m`;
          f.advisory ? A(t.mapId, msg) : F(t.mapId, msg);
        }
      }

      if (side === 'land') {
        if (p.slopeDeg > worstDoorSlope.v) worstDoorSlope = { v: p.slopeDeg, tag };
        if (p.slopeDeg > HF.DOOR_MAX_SLOPE_DEG)
          F(t.mapId, `${tag} landing on ${p.slopeDeg.toFixed(1)} deg ground > DOOR_MAX_SLOPE_DEG ${HF.DOOR_MAX_SLOPE_DEG}`);
        const dS = p.slopeDeg - o.slopeDeg;
        if (Math.abs(dS) > SLOPE_TOL_D) {
          const msg = `${tag} landing slope live ${p.slopeDeg.toFixed(1)} vs offline ${o.slopeDeg.toFixed(1)} deg, delta ${dS.toFixed(2)} deg`;
          f.advisory ? A(t.mapId, msg) : F(t.mapId, msg);
        }
        row.landSlope = p.slopeDeg; row.landSlopeOff = o.slopeDeg;
      }
      row[side + 'Pos'] = [p.x, p.z]; row[side + 'PosDelta'] = dPos;
      row[side + 'H'] = p.h; row[side + 'HDelta'] = dH;
    }

    /* Reciprocity. The coordinate half is a property of the DATA and
       world-graph.mjs already proves it; comparing B's return-door tile to A's
       landing tile in the live world would compare a tile to itself and always
       report zero. What the built world adds is the other half: the tile you
       arrive back on has to be a real standable place on A's BUILT map. That
       fails if A never built, or if A's own tile->metre conversion put the
       return tile outside its own extents. */
    if (r.outdoor) {
      const back = G.doorwayAt(r.to, r.land.tx, r.land.ty);
      if (!back) F(r.from, `no return door at ${r.to} (${r.land.tx},${r.land.ty})`);
      else if (back.to.mapId !== r.from || back.to.x !== r.self.tx || back.to.y !== r.self.ty)
        F(r.from, `asymmetric: ${r.from}(${r.self.tx},${r.self.ty}) -> ${r.to}(${r.land.tx},${r.land.ty}) returns to ${back.to.mapId}(${back.to.x},${back.to.y})`);
      else if (RUN_IDS.includes(r.from)) {
        const lvA = live.get(r.from);
        if (!lvA || lvA.built === false)
          F(r.from, `reciprocity: ${r.to} sends you back to ${r.from}, which did not build`);
        else if (r.selfIdx != null) {
          const p = lvA.points[r.selfIdx], halfW = lvA.widthM / 2, halfD = lvA.depthM / 2;
          if (!Number.isFinite(p.h) || p.x < -halfW || p.x > halfW || p.z < -halfD || p.z > halfD)
            F(r.from, `reciprocity: the return from ${r.to} lands on tile (${r.self.tx},${r.self.ty}) -> live (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) m, h ${p.h}, which is not a standable position on the built map`);
        }
      }
      if (back && back.gate !== r.gate)
        F(r.from, `gate mismatch ${r.from}<->${r.to}: ${r.gate} vs ${back.gate}`);
    }
    doorRows.push(row);
  }

  // 4. encounters: 36 combat stages on the LIVE field
  const encRows = [];
  let worstEnc = { v: -1 }, worstEncDelta = { v: -1 };
  for (const e of refs.encRefs) {
    const off = offline.get(e.mapId), lv = live.get(e.mapId);
    if (!lv || lv.built === false) continue;
    const o = off.discs[e.discIdx], p = lv.discs[e.discIdx];
    const use = p.stageSpread / HF.STAGE_MAX_SPREAD_M;
    if (use > worstEnc.v) worstEnc = { v: use, e, p };
    const dSpread = p.stageSpread - o.stageSpread;
    const dSlope = p.stageMaxSlopeDeg - o.stageMaxSlopeDeg;
    const dFrame = p.frameSpread - o.frameSpread;
    const worstD = Math.max(Math.abs(dSpread), Math.abs(dFrame));
    if (worstD > worstEncDelta.v) worstEncDelta = { v: worstD, e };

    if (p.stageSpread > HF.STAGE_MAX_SPREAD_M)
      F(e.mapId, `${e.id} (${e.tx},${e.ty}) stage spread ${p.stageSpread.toFixed(2)} m > ${HF.STAGE_MAX_SPREAD_M.toFixed(2)} m live`);
    if (p.stageMaxSlopeDeg > HF.STAGE_MAX_SLOPE_DEG)
      F(e.mapId, `${e.id} (${e.tx},${e.ty}) stage slope ${p.stageMaxSlopeDeg.toFixed(1)} deg > ${HF.STAGE_MAX_SLOPE_DEG} live`);
    if (p.frameSpread > HF.FRAME_MAX_SPREAD_M)
      F(e.mapId, `${e.id} (${e.tx},${e.ty}) frame spread ${p.frameSpread.toFixed(2)} m > ${HF.FRAME_MAX_SPREAD_M} live`);
    const oob = e.overhangM > 0;
    const D_ = oob ? A : F;
    const tail = oob ? ` [disc overhangs the map edge by ${e.overhangM.toFixed(2)} m — the runtime clamps there, the spec helper does not]` : '';
    if (Math.abs(dSpread) > H_TOL_M)
      D_(e.mapId, `${e.id} stage spread live ${p.stageSpread.toFixed(3)} vs offline ${o.stageSpread.toFixed(3)} m, delta ${dSpread.toFixed(3)} m${tail}`);
    if (Math.abs(dSlope) > SLOPE_TOL_D)
      D_(e.mapId, `${e.id} stage slope live ${p.stageMaxSlopeDeg.toFixed(1)} vs offline ${o.stageMaxSlopeDeg.toFixed(1)} deg, delta ${dSlope.toFixed(2)} deg${tail}`);
    if (Math.abs(dFrame) > H_TOL_M * 4)
      D_(e.mapId, `${e.id} frame spread live ${p.frameSpread.toFixed(3)} vs offline ${o.frameSpread.toFixed(3)} m, delta ${dFrame.toFixed(3)} m${tail}`);

    encRows.push({ mapId: e.mapId, id: e.id, tile: [e.tx, e.ty], enemy: e.enemy,
                   stageSpread: p.stageSpread, dSpread, stageSlope: p.stageMaxSlopeDeg, dSlope,
                   frameSpread: p.frameSpread, dFrame, budget: use, overhangM: e.overhangM });
  }

  // 5. Haventide build plots on the LIVE field
  const plotRows = [];
  let worstPlot = { v: -1 };
  for (const pl of refs.plotRefs) {
    const off = offline.get(pl.mapId), lv = live.get(pl.mapId);
    if (!lv || lv.built === false) continue;
    const o = off.plots[pl.idx], p = lv.plots[pl.idx];
    if (p.slopeDeg > worstPlot.v) worstPlot = { v: p.slopeDeg, pl };
    const dS = p.slopeDeg - o.slopeDeg, dSp = p.spread - o.spread;
    const report = (pl.advisory || pl.overhangM > 0) ? A : F;
    const ptail = pl.overhangM > 0 ? ` [footprint overhangs the map edge by ${pl.overhangM.toFixed(2)} m]` : '';
    // the absolute limits are measured on the clamped surface the player gets,
    // so they gate even at the edge; only the delta is demoted
    const gateAbs = pl.advisory ? A : F;
    if (p.slopeDeg > HF.PLOT_MAX_SLOPE_DEG)
      gateAbs(pl.mapId, `plot ${pl.slotIdx} (${pl.tx},${pl.ty}) live slope ${p.slopeDeg.toFixed(1)} deg > PLOT_MAX_SLOPE_DEG ${HF.PLOT_MAX_SLOPE_DEG}`);
    if (p.spread > HF.PLOT_MAX_SPREAD_M)
      gateAbs(pl.mapId, `plot ${pl.slotIdx} (${pl.tx},${pl.ty}) live spread ${p.spread.toFixed(2)} m over ${HF.PLOT_FOOTPRINT_M} m > ${HF.PLOT_MAX_SPREAD_M}`);
    if (Math.abs(dS) > SLOPE_TOL_D) report(pl.mapId, `plot ${pl.slotIdx} slope live ${p.slopeDeg.toFixed(1)} vs offline ${o.slopeDeg.toFixed(1)} deg, delta ${dS.toFixed(2)}${ptail}`);
    if (Math.abs(dSp) > H_TOL_M) report(pl.mapId, `plot ${pl.slotIdx} spread live ${p.spread.toFixed(3)} vs offline ${o.spread.toFixed(3)} m, delta ${dSp.toFixed(3)}${ptail}`);
    plotRows.push({ mapId: pl.mapId, slotIdx: pl.slotIdx, tile: [pl.tx, pl.ty], advisory: pl.advisory,
                    slopeDeg: p.slopeDeg, dS, spread: p.spread, dSp, overhangM: pl.overhangM });
  }

  // 6. reachability, tied to maps that actually built
  const reach = [];
  const opensAt = {};
  for (const t of G.SETTLEMENT_TIERS) {
    const s = G.reachableAt(t);
    reach.push({ tier: t, count: s.size, regions: [...s].sort() });
    for (const r of s) if (opensAt[r] === undefined) opensAt[r] = t;
  }
  for (const r of G.OUTDOOR_IDS)
    if (opensAt[r] === undefined) F(r, 'UNREACHABLE from Haventide at every settlement tier');
  const maxTier = G.SETTLEMENT_TIERS[G.SETTLEMENT_TIERS.length - 1];
  for (const e of G.REGION_EDGES) {
    if (!G.edgeOpenAt(e, maxTier)) F(e.a, `PERMANENT ONE-WAY ${e.a}<->${e.b} (gate ${e.gate}) at ${maxTier}`);
    // and both ends of that edge must have BUILT, or "traversable" is a claim
    // about a table rather than about the world
    for (const side of [e.a, e.b]) {
      if (!RUN_IDS.includes(side)) continue;
      const lv = live.get(side);
      if (!lv || lv.built === false) F(side, `edge ${e.a}<->${e.b} is open at ${maxTier} but ${side} did not build`);
    }
  }

  return { fail, advisory, mapRows, doorRows, encRows, plotRows, reach, opensAt,
           worst: { pos: worstPos, height: worstH, doorSlope: worstDoorSlope,
                    enc: worstEnc, encDelta: worstEncDelta, plot: worstPlot } };
}

// ── run ─────────────────────────────────────────────────────────────────────

async function collectOffline(refs) {
  const out = new Map();
  for (const id of RUN_IDS) out.set(id, offlineProbe(refs.plan.get(id)));
  return out;
}

async function collectLive(refs, h) {
  const { page, errors } = h;
  const out = new Map();
  for (const id of RUN_IDS) {
    const before = errors.length;
    let built = true, error = null;
    try {
      await page.evaluate((mid) => {
        const D = window.__DAWN__;
        if (typeof D.setMap === 'function') return D.setMap(mid);
        return D.ctx.world.setMap(mid);
      }, id);
      await settle(page, 4);
    } catch (e) { built = false; error = String(e.message || e).split('\n')[0]; }

    if (!built) { out.set(id, { mapId: id, built: false, error, consoleErrors: errors.slice(before) }); continue; }

    const job = refs.plan.get(id);
    const wire = { tiles: job.tiles, discs: job.discs, plots: job.plots,
                   grid: job.grid, discParams: job.discParams, plotParams: job.plotParams };
    let res;
    try { res = await page.evaluate(PAGE_PROBE, wire); }
    catch (e) { out.set(id, { mapId: id, built: false, error: String(e.message || e).split('\n')[0], consoleErrors: errors.slice(before) }); continue; }
    res.built = true;
    res.consoleErrors = errors.slice(before);
    out.set(id, res);
  }
  return out;
}

/** Wait for the world lane to land `setMap`. Reload between polls — the module
 *  graph is fixed at page load, so a src/ that appeared after boot is invisible
 *  until the page comes back. */
async function waitForSetMap(h, seconds) {
  const t0 = Date.now();
  for (;;) {
    const ok = await h.page.evaluate(() => {
      const D = window.__DAWN__;
      return typeof D?.setMap === 'function' || typeof D?.ctx?.world?.setMap === 'function';
    }).catch(() => false);
    if (ok) return true;
    if ((Date.now() - t0) / 1000 >= seconds) return false;
    await new Promise(r => setTimeout(r, 2000));
    await h.page.reload({ waitUntil: 'load' }).catch(() => {});
    await h.page.waitForFunction(() => window.__DAWN__ && window.__DAWN__.ready, null,
      { timeout: 60000, polling: 100 }).catch(() => {});
  }
}

const fmt = (v, n = 3) => (Number.isFinite(v) ? v.toFixed(n) : String(v));
const short = (id) => id.replace('_region', '').replace('_interior', '*');

function report(res, meta) {
  const { mapRows, encRows, plotRows, reach, worst, fail, advisory } = res;

  console.log(`\nmode: ${meta.mode}${meta.fault ? `   INJECTED FAULT: ${meta.fault}` : ''}`);
  if (meta.mode === 'dry') {
    console.log('*** DRY: the "live" side IS the offline spec, so every delta is 0 by construction.');
    console.log('*** It proves the assertion logic runs and that the injected faults are caught.');
    console.log('*** It proves NOTHING about the runtime. Only a live run is the Phase 4a gate.');
  }
  if (PARTIAL) console.log(`*** PARTIAL: ${RUN_IDS.length}/${ALL_IDS.length} maps. Not the Phase 4a gate.`);
  console.log(`loop control: this file's clearance loop vs heightfields.clearanceAt() — worst disagreement ${meta.loop.worst.toExponential(2)}${meta.loop.at ? ` (${meta.loop.at})` : ''}`);
  console.log(`grid ${GRID_M} m   disc step ${DISC_STEP} m   R_STAGE ${R_STAGE} m   R_FRAME ${R_FRAME.toFixed(2)} m`);
  console.log(`tolerances: position ${POS_TOL_M} m (exact), dims ${DIM_TOL_M} m (exact), height ${H_TOL_M} m, slope ${SLOPE_TOL_D} deg`);

  console.log('\nMAPS — live vs offline (delta = live - offline)');
  console.log('map              biome            dims live     dW      dD  |  relief live/off    dRel  band           | axis slope l/o   dSlp  ceil | surf slope l/o  dSlp');
  for (const r of mapRows) {
    const band = r.reliefBand ? `[${r.reliefBand[0].toFixed(2)},${r.reliefBand[1].toFixed(2)}]` : '(interior)';
    console.log(
      `${short(r.mapId).padEnd(16)} ${(r.biomeId || '-').padEnd(16)} ` +
      `${(r.widthM + 'x' + r.depthM).padStart(8)} ${fmt(r.dW, 3).padStart(6)} ${fmt(r.dD, 3).padStart(7)}  | ` +
      `${fmt(r.reliefLive, 2).padStart(6)}/${fmt(r.reliefOff, 2).padStart(5)} ${fmt(r.dRange, 3).padStart(7)}  ${band.padEnd(14)} | ` +
      `${fmt(r.slopeLive, 1).padStart(5)}/${fmt(r.slopeOff, 1).padStart(5)} ${fmt(r.dSlope, 2).padStart(6)} ${String(r.slopeLimit).padStart(5)} | ` +
      `${fmt(r.normLive, 1).padStart(5)}/${fmt(r.normOff, 1).padStart(5)} ${fmt(r.dNorm, 2).padStart(6)}`);
  }

  console.log('\nDOORWAYS — 24 records, landing tile converted by the LIVE runtime');
  console.log(`  worst tile->metre position delta : ${fmt(worst.pos.v)} m  ${worst.pos.tag || ''}`);
  console.log(`  worst landing height delta       : ${fmt(worst.height.v)} m  ${worst.height.tag || ''}`);
  console.log(`  worst landing ground slope       : ${fmt(worst.doorSlope.v, 1)} deg (limit ${HF.DOOR_MAX_SLOPE_DEG})  ${worst.doorSlope.tag || ''}`);
  if (VERBOSE) {
    console.log('  from -> to                                       land tile   live pos (x,z) m       dPos     h live    dH    slope');
    for (const r of res.doorRows) {
      if (!r.landPos) continue;
      console.log(`  ${(short(r.from) + ' -> ' + short(r.to)).padEnd(44)} ` +
        `(${String(r.land[0]).padStart(2)},${String(r.land[1]).padStart(2)})   ` +
        `(${fmt(r.landPos[0], 2).padStart(7)},${fmt(r.landPos[1], 2).padStart(7)})  ${fmt(r.landPosDelta).padStart(7)}  ` +
        `${fmt(r.landH, 2).padStart(7)} ${fmt(r.landHDelta).padStart(7)}  ${fmt(r.landSlope, 1).padStart(5)}`);
    }
  }

  console.log(`\nENCOUNTERS — ${encRows.length} staged on the live field (stage spread <= ${HF.STAGE_MAX_SPREAD_M.toFixed(2)} m, slope <= ${HF.STAGE_MAX_SLOPE_DEG} deg, frame <= ${HF.FRAME_MAX_SPREAD_M} m)`);
  if (worst.enc.e) {
    const w = worst.enc;
    console.log(`  tightest: ${short(w.e.mapId)} ${w.e.id} at ${(100 * w.v).toFixed(0)}% of the spread budget (${fmt(w.p.stageSpread, 2)} m, ${fmt(w.p.stageMaxSlopeDeg, 1)} deg)`);
  }
  if (worst.encDelta.e) console.log(`  worst live-vs-offline clearance delta: ${fmt(worst.encDelta.v)} m at ${short(worst.encDelta.e.mapId)} ${worst.encDelta.e.id}`);
  const oobEnc = encRows.filter(r => r.overhangM > 0);
  const oobPlot = plotRows.filter(r => r.overhangM > 0);
  if (oobEnc.length || oobPlot.length) {
    console.log(`  ${oobEnc.length}/${encRows.length} encounter discs and ${oobPlot.length}/${plotRows.length} plot footprints reach past the map edge.`);
    console.log('  The runtime clamps outside the rect; heightfields.heightAt() does not. Their deltas are advisory:');
    for (const r of oobEnc)
      console.log(`    ${short(r.mapId).padEnd(14)} ${r.id.padEnd(4)} (${r.tile[0]},${r.tile[1]})  overhang ${fmt(r.overhangM, 2)} m   frame spread live ${fmt(r.frameSpread, 3)} vs offline ${fmt(r.frameSpread - r.dFrame, 3)} m`);
    for (const r of oobPlot)
      console.log(`    ${short(r.mapId).padEnd(14)} plot ${String(r.slotIdx).padEnd(2)} (${r.tile[0]},${r.tile[1]})  overhang ${fmt(r.overhangM, 2)} m   spread live ${fmt(r.spread, 3)} vs offline ${fmt(r.spread - r.dSp, 3)} m`);
  }
  if (VERBOSE) {
    console.log('  map            enc   tile     spread  dSpread   slope  dSlope    frame  dFrame  budget');
    for (const r of encRows)
      console.log(`  ${short(r.mapId).padEnd(14)} ${r.id.padEnd(5)} (${String(r.tile[0]).padStart(2)},${String(r.tile[1]).padStart(2)})  ` +
        `${fmt(r.stageSpread, 2).padStart(6)} ${fmt(r.dSpread).padStart(8)}  ${fmt(r.stageSlope, 1).padStart(5)} ${fmt(r.dSlope, 2).padStart(7)}  ` +
        `${fmt(r.frameSpread, 2).padStart(7)} ${fmt(r.dFrame).padStart(7)}  ${(100 * r.budget).toFixed(0).padStart(4)}%`);
  }

  const gated = plotRows.filter(p => !p.advisory);
  if (gated.length) {
    const w = gated.reduce((a, b) => (b.slopeDeg > a.slopeDeg ? b : a));
    const ws = gated.reduce((a, b) => (b.spread > a.spread ? b : a));
    console.log(`\nBUILD PLOTS — ${gated.length} in Haventide (limits ${HF.PLOT_MAX_SLOPE_DEG} deg, ${HF.PLOT_MAX_SPREAD_M} m over ${HF.PLOT_FOOTPRINT_M} m)`);
    console.log(`  worst live slope  ${fmt(w.slopeDeg, 1)} deg at slot ${w.slotIdx} (${w.tile[0]},${w.tile[1]})  delta ${fmt(w.dS, 2)} deg`);
    console.log(`  worst live spread ${fmt(ws.spread, 2)} m at slot ${ws.slotIdx} (${ws.tile[0]},${ws.tile[1]})  delta ${fmt(ws.dSp)} m`);
  }
  const adv = plotRows.filter(p => p.advisory);
  if (adv.length) {
    const w = adv.reduce((a, b) => (b.slopeDeg > a.slopeDeg ? b : a));
    console.log(`  interior plots (${adv.length}, advisory): worst live slope ${fmt(w.slopeDeg, 1)} deg at slot ${w.slotIdx}`);
  }

  console.log('\nREACHABILITY from Haventide, per settlement tier');
  for (const r of reach)
    console.log(`  ${r.tier.padEnd(12)} ${r.count}/${G.OUTDOOR_IDS.length}  [${r.regions.map(short).join(', ')}]`);
  console.log(`  every edge open at ${G.SETTLEMENT_TIERS[G.SETTLEMENT_TIERS.length - 1]}: ` +
    `${G.REGION_EDGES.every(e => G.edgeOpenAt(e, G.SETTLEMENT_TIERS[G.SETTLEMENT_TIERS.length - 1])) ? 'yes' : 'NO'} (${G.REGION_EDGES.length} edges)`);

  if (advisory.length) {
    console.log(`\nADVISORY (${advisory.length}) — deltas the runtime is not contractually bound to match:`);
    console.log('  interiors (no published field) and probes whose footprint leaves the map rect.');
    for (const a of advisory.slice(0, 12)) console.log('  ~ ' + a);
    if (advisory.length > 12) console.log(`  ... ${advisory.length - 12} more`);
  }

  if (fail.length) {
    console.error(`\nFAIL - ${fail.length} issue(s):`);
    for (const f of fail) console.error('  - ' + f);
  } else {
    console.log(`\nPASS - ${mapRows.length} map(s) built; every doorway landing converts to the contract position ` +
      `(worst ${fmt(worst.pos.v)} m), lands in bounds on passable ground under ${HF.DOOR_MAX_SLOPE_DEG} deg, ` +
      `and reciprocates; ${encRows.length} encounters clear combat staging live; ` +
      `${gated.length} Haventide plots level; no live slope over any biome ceiling; ` +
      `every region opens at some tier and every edge traverses both ways at max.`);
  }
}

async function runOnce(refs, live, offline, meta) {
  const res = evaluate(offline, live, refs, meta);
  return res;
}

function cloneLive(live) {
  return new Map([...live].map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
}

// ── main ────────────────────────────────────────────────────────────────────

const t0 = Date.now();
const refs = buildPlan();
const loop = verifyLoop();
if (loop.worst > 1e-9) {
  console.error(`this file's clearance loop disagrees with heightfields.clearanceAt() by ${loop.worst} at ${loop.at}.`);
  console.error('every clearance delta below would be measuring the tool. refusing to run.');
  process.exit(2);
}

const offline = await collectOffline(refs);

let h = null, live = null, mode = DRY ? 'dry' : 'live';
if (DRY) {
  live = cloneLive(offline);
  for (const [, v] of live) { v.built = true; v.consoleErrors = []; v.hasToWorld = true; }
} else {
  h = await boot({ port: PORT, quality: 'low' });
  console.log(`gpu: ${h.renderer}${h.software ? '   *** SOFTWARE RASTERISER ***' : ''}`);
  const ok = await waitForSetMap(h, WAIT_S);
  if (!ok) {
    console.error('\nctx.world.setMap is not a function — the Phase 4a world runtime has not landed.');
    console.error('This tool refuses to invent a live result. Options:');
    console.error('  node tools/region.mjs --dry            offline half of every assertion');
    console.error('  node tools/region.mjs --wait 600       poll (and reload) until the lane lands it');
    await h.close(3);
  }
  live = await collectLive(refs, h);
}

const meta = { mode, loop, fault: null };

if (SELFTEST) {
  const kinds = FAULT === 'all' ? Object.keys(FAULTS) : String(FAULT).split(',').map(s => s.trim());
  const bad = kinds.filter(k => !FAULTS[k]);
  if (bad.length) { console.error(`unknown fault(s): ${bad.join(', ')}. known: ${Object.keys(FAULTS).join(', ')}`); process.exit(2); }

  const clean = await runOnce(refs, live, offline, meta);
  console.log(`\nSELFTEST — a gate that has never failed is not known to work.`);
  console.log(`mode: ${mode}${mode === 'dry' ? ' (the null result below is 0 by construction; the FAULT rows are the point)' : ''}`);
  console.log(`baseline (no fault): ${clean.fail.length} failure(s)${clean.fail.length ? ' — the world is already failing, see the run above' : ''}`);

  const results = [];
  for (const kind of kinds) {
    const f = FAULTS[kind];
    const hurt = cloneLive(live);
    // Inject into the first map in the run that actually built, and — for the
    // faults that must be seen everywhere — into all of them.
    for (const [, v] of hurt) { if (v.built !== false) f.apply(v); }
    const r = await runOnce(refs, hurt, offline, meta);
    const newOnes = r.fail.filter(x => !clean.fail.includes(x));
    // "Caught" means the assertion that is SUPPOSED to see this fault saw it.
    // Any other failure firing is not evidence about this fault at all.
    const named = newOnes.filter(x => f.expect.test(x));
    results.push({ kind, caught: named.length > 0, count: newOnes.length,
                   named: named.length, first: named[0] || newOnes[0] || null,
                   expect: String(f.expect), why: f.why });
  }

  console.log('\nfault         caught  new fails  by the named assertion  first matching failure');
  for (const r of results)
    console.log(`  ${r.kind.padEnd(12)} ${(r.caught ? 'YES' : 'NO ').padStart(4)}  ${String(r.count).padStart(9)}  ${String(r.named).padStart(21)}  ${r.first ? r.first.slice(0, 96) : '(none)'}`);
  console.log('\nthe assertion each fault must trip:');
  for (const r of results) console.log(`  ${r.kind.padEnd(12)} ${r.expect}`);
  console.log('\nwhat each fault is:');
  for (const r of results) console.log(`  ${r.kind.padEnd(12)} ${r.why}`);

  const missed = results.filter(r => !r.caught);
  if (JSON_OUT) console.log(JSON.stringify({ selftest: results, mode }, null, 2));
  if (h) await h.close(null);
  if (missed.length) {
    console.error(`\nSELFTEST FAIL - ${missed.length} injected fault(s) were not caught by the assertion meant to catch them: ${missed.map(m => m.kind).join(', ')}`);
    console.error('The null result from this tool is not trustworthy until these are caught.');
    process.exit(4);
  }
  console.log(`\nSELFTEST PASS - all ${results.length} injected faults caught. The null result means something.`);
  process.exit(clean.fail.length ? 1 : 0);
}

const res = await runOnce(refs, live, offline, meta);

if (JSON_OUT) {
  console.log(JSON.stringify({
    mode, partial: PARTIAL, maps: RUN_IDS, ms: Date.now() - t0,
    loopControl: loop, tolerances: { POS_TOL_M, DIM_TOL_M, H_TOL_M, SLOPE_TOL_D },
    mapRows: res.mapRows, doorRows: res.doorRows, encRows: res.encRows,
    plotRows: res.plotRows, reach: res.reach, opensAt: res.opensAt,
    advisory: res.advisory, failures: res.fail,
    pass: res.fail.length === 0,
  }, null, 2));
} else {
  report(res, meta);
  console.log(`\n${RUN_IDS.length} map(s) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

if (h) await h.close(null);
process.exit(res.fail.length ? 1 : 0);
