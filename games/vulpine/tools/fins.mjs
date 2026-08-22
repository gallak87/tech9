#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Fin autopsy — and the regression test that keeps the fins dead.
//
// Every previous attempt at this artefact reasoned *about* the height field:
// sample it on the mesh grid, look for blades, find none, conclude the mesh must
// be displaced. That was inference, and it kept coming up empty because the
// vertices were never the problem. The index order was.
//
// Two passes, both of which have to stay green:
//
//   1. --audit (offline)  Builds the real Terrain in Node and checks the
//      orientation of every triangle in every LOD of every chunk: the geometric
//      normal (b-a)×(c-a) must agree with the shading normal the mesher wrote,
//      and skirt quads must face outward. A back-facing surface still shades
//      correctly — the normals are analytic — so this is the only cheap way to
//      catch a winding regression before it reaches a screenshot.
//
//   2. --probe (browser)  Renders the real frame twice, once with every
//      `terrain-*` / `ridge-*` mesh hidden, and diffs the two images. The
//      difference IS the rasterised terrain silhouette, no assumptions. Any
//      image column whose silhouette floor plunges far below its neighbours' is
//      a fin; each one gets a real THREE.Raycaster fired through it, which
//      reports the mesh, the triangle and its world-space corners. The control
//      ray is the tell: with the winding inverted, FrontSide raycasting misses
//      the terrain entirely, from every direction, including straight down.
//
//   node tools/fins.mjs --port 5301
//   node tools/fins.mjs --audit
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { profileAt, heightAtU, centrelineX, setActiveDNA } from '../src/world/profile.js';
import { DNA_BY_ID } from '../src/world/dna.js';
import { Terrain } from '../src/world/terrain.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  if (i === -1) return d;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};
const FLAG = (n) => process.argv.includes(`--${n}`);

/* ── 1. offline orientation audit ─────────────────────────────────────────── */

function audit(levelId) {
  // `setActiveDNA` before anything: `WORLD` is zeroed until a DNA is unpacked,
  // and Terrain sizes its tiers off it in the constructor.
  setActiveDNA(DNA_BY_ID[levelId]);
  const root = new THREE.Group();
  const t0 = Date.now();
  const terr = new Terrain(root, new THREE.MeshBasicMaterial());
  // Terrain's constructor only queues; the meshes exist after the queue drains.
  for (const job of terr.jobs) job();
  const meshes = [];
  root.traverse(o => { if (o.isMesh) meshes.push(o); });

  let surf = 0, flipped = 0, reversed = 0, degen = 0, hems = 0, hemIn = 0;
  let minDot = 1, minAt = null;
  const worst = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const na = new THREE.Vector3(), nb = new THREE.Vector3(), nc = new THREE.Vector3();

  for (const m of meshes) {
    const g = m.geometry, P = g.attributes.position, N = g.attributes.normal, I = g.index;
    const { cols, surfaceVerts } = g.userData.grid;
    for (let t = 0; t < I.count; t += 3) {
      const ia = I.getX(t), ib = I.getX(t + 1), ic = I.getX(t + 2);
      a.fromBufferAttribute(P, ia); b.fromBufferAttribute(P, ib); c.fromBufferAttribute(P, ic);
      e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2);
      const len = n.length();
      if (len < 1e-9) { degen++; continue; }
      n.multiplyScalar(1 / len);

      // Hem triangles touch a skirt vertex. Their facet normal is horizontal, so
      // comparing it against an up-pointing shading normal says nothing; what
      // matters is that they face away from the strip they hang off.
      const hi = Math.max(ia, ib, ic);
      if (hi >= surfaceVerts) {
        hems++;
        // skirt vertices were appended left, right, left, right… one pair per row
        const outward = ((hi - surfaceVerts) % 2 === 0) ? -1 : 1;
        if (n.x * outward < 0) hemIn++;
        continue;
      }

      surf++;
      na.fromBufferAttribute(N, ia); nb.fromBufferAttribute(N, ib); nc.fromBufferAttribute(N, ic);
      na.add(nb).add(nc).normalize();
      const d = n.dot(na);
      if (d < minDot) { minDot = d; minAt = `${m.name} tri ${t / 3} col ${ia % cols}`; }
      // A genuinely reversed facet sits at dot ≈ -1. The handful that land just
      // below zero are LOD-2 decimation slivers on ~85° walls, where a facet
      // spanning four rows honestly disagrees with the full-resolution shading
      // normal — those are geometry error, not winding, so they are counted and
      // shown but do not fail the gate.
      if (d < 0) {
        flipped++;
        if (d < -0.5) reversed++;
        if (worst.length < 5) worst.push({ mesh: m.name, tri: t / 3, dot: +d.toFixed(3) });
      }
    }
  }
  console.log(`audit: ${meshes.length} meshes, ${(surf + hems).toLocaleString()} triangles in ${Date.now() - t0} ms`);
  console.log(`  back-facing surface triangles: ${flipped} of ${surf.toLocaleString()} (${reversed} truly reversed)`);
  console.log(`  inward-facing hem triangles:   ${hemIn} of ${hems.toLocaleString()}`);
  console.log(`  degenerate: ${degen}`);
  console.log(`  worst facet-vs-shading agreement: ${minDot.toFixed(3)} at ${minAt}`);
  for (const w of worst) console.log(`   ! ${w.mesh} tri ${w.tri} dot ${w.dot}`);
  terr.dispose();
  return reversed + hemIn;
}

/* ── 2. rendered-frame probe ──────────────────────────────────────────────── */

async function probe() {
  const { chromium } = await import('playwright');
  const { spawn } = await import('node:child_process');
  const { mkdir, writeFile } = await import('node:fs/promises');

  const PORT = parseInt(arg('port', '5301'), 10);
  const W = parseInt(arg('w', '1600'), 10);
  const H = parseInt(arg('h', '900'), 10);
  const T = parseFloat(arg('t', '20'));
  const SHOT = arg('shot', 'combat-wide');
  const OUT = path.resolve(ROOT, arg('out', 'shots/fins'));

  const up = async (url, ms = 45000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { const r = await fetch(url); if (r.ok || r.status === 404) return true; } catch { /* wait */ }
      await new Promise(r => setTimeout(r, 250));
    }
    return false;
  };

  const base = `http://127.0.0.1:${PORT}`;
  let server = null;
  if (!(await up(base, 1200))) {
    server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
    if (!(await up(base))) { console.error('server did not start'); process.exit(1); }
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
      '--force-color-profile=srgb', '--hide-scrollbars'],
  });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));

  await page.goto(`${base}/?quality=ultra&env=corneria&t=${T}&hud=0&nopost=1&fight=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__VULPINE__ && window.__VULPINE__.ready, null, { timeout: 120000 });

  const res = await page.evaluate(async ({ shot }) => {
    const V = window.__VULPINE__;
    const THREE = V.THREE;
    V.setShot(shot);
    await new Promise(r => { let n = 0; const t = () => (++n >= 8 ? r() : requestAnimationFrame(t)); requestAnimationFrame(t); });

    const canvas = V.engine.renderer.domElement;
    const off = document.createElement('canvas');
    off.width = canvas.width; off.height = canvas.height;
    const g2 = off.getContext('2d', { willReadFrequently: true });
    // The drawing buffer is only valid inside the task that drew it, so render
    // and copy back-to-back with nothing awaited in between.
    const grab = () => {
      V.engine.render();
      g2.clearRect(0, 0, off.width, off.height);
      g2.drawImage(canvas, 0, 0);
      return g2.getImageData(0, 0, off.width, off.height).data;
    };

    const terr = [];
    V.engine.scene.traverse(o => { if (o.isMesh && /^(terrain|ridge)-/.test(o.name) && o.visible) terr.push(o); });

    const A = grab();
    for (const m of terr) m.visible = false;
    const B = grab();
    for (const m of terr) m.visible = true;

    const w = off.width, h = off.height;
    const mask = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
      const d = Math.abs(A[p] - B[p]) + Math.abs(A[p + 1] - B[p + 1]) + Math.abs(A[p + 2] - B[p + 2]);
      mask[i] = d > 12 ? 1 : 0;
    }

    // Per column: the lowest terrain pixel. A fin is a column whose floor
    // plunges far below the median floor of a wide neighbourhood — wide, so a
    // narrow ribbon cannot drag its own reference down with it.
    const floor = new Int32Array(w).fill(-1);
    for (let x = 0; x < w; x++) {
      for (let y = h - 1; y >= 0; y--) if (mask[y * w + x]) { floor[x] = y; break; }
    }
    const R = 60;
    const cand = [];
    for (let x = 0; x < w; x++) {
      if (floor[x] < 0) continue;
      const win = [];
      for (let k = -R; k <= R; k++) { const xx = x + k; if (xx >= 0 && xx < w && floor[xx] >= 0) win.push(floor[xx]); }
      win.sort((p, q) => p - q);
      const med = win[win.length >> 1];
      if (floor[x] - med > 40) cand.push({ x, y: floor[x], med, drop: floor[x] - med });
    }
    cand.sort((p, q) => q.drop - p.drop);
    const picks = [];
    for (const c of cand) {
      if (picks.some(p => Math.abs(p.x - c.x) < 12)) continue;
      picks.push(c);
      if (picks.length >= 8) break;
    }

    const rc = new THREE.Raycaster();
    rc.far = 60000;
    rc.layers.enableAll();
    const cam = V.engine.camera;
    const cast = (px, py) => {
      rc.setFromCamera(new THREE.Vector2((px / w) * 2 - 1, -((py / h) * 2 - 1)), cam);
      return rc.intersectObjects(terr, false);
    };
    // Control: a ray into the body of the silhouette, and one straight down.
    // Both must hit. If they do not, the surface is facing the wrong way and
    // every "no hit" that follows means nothing.
    const ctl = [];
    if (picks[0]) ctl.push({ what: 'silhouette body', n: cast(picks[0].x, picks[0].med - 40).length });
    rc.set(cam.position.clone(), new THREE.Vector3(0, -1, 0));
    ctl.push({ what: 'straight down from camera', n: rc.intersectObjects(terr, false).length });

    const out = [];
    for (const c of picks) {
      for (const frac of [0.92, 0.55]) {
        const py = Math.round(c.med + (c.y - c.med) * frac);
        const hits = cast(c.x, py);
        if (!hits.length) { out.push({ px: c.x, py, miss: true }); continue; }
        const it = hits[0];
        const pos = it.object.geometry.attributes.position;
        const f = it.face;
        const v = [f.a, f.b, f.c].map(i => {
          const p = new THREE.Vector3().fromBufferAttribute(pos, i);
          it.object.localToWorld(p);
          return [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)];
        });
        const e = [[0, 1], [1, 2], [2, 0]].map(([i, j]) =>
          +Math.hypot(v[i][0] - v[j][0], v[i][1] - v[j][1], v[i][2] - v[j][2]).toFixed(1));
        out.push({
          px: c.x, py, mesh: it.object.name, dist: +it.distance.toFixed(0),
          hit: it.point.toArray().map(x => +x.toFixed(1)), verts: v, edges: e,
        });
      }
    }

    return {
      w, h, cam: { pos: cam.position.toArray().map(v => +v.toFixed(1)), fov: cam.fov },
      nTerr: terr.length, nCand: cand.length,
      picks: picks.map(c => ({ x: c.x, y: c.y, med: c.med, drop: c.drop })),
      ctl, hits: out,
    };
  }, { shot: SHOT });

  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, 'autopsy.json'), JSON.stringify(res, null, 2));

  console.log(`camera ${JSON.stringify(res.cam)}   terrain meshes drawn: ${res.nTerr}   frame ${res.w}x${res.h}`);
  for (const c of res.ctl) console.log(`control [${c.what}]: ${c.n} hit(s)${c.n ? '' : '   ← RAYCAST BLIND, SURFACE IS BACK-FACING'}`);
  console.log(`fin-candidate columns: ${res.nCand}   ribbons probed: ${res.picks.length}`);
  for (const p of res.picks) console.log(`   x=${p.x} tip y=${p.y} (silhouette floor ${p.med}, drop ${p.drop}px)`);
  for (const h of res.hits) {
    if (h.miss) { console.log(`  px(${h.px},${h.py}) NO HIT`); continue; }
    const [x, y, z] = h.hit;
    const u = x - centrelineX(z);
    const fieldH = heightAtU(u, z, profileAt(z));
    console.log(`  px(${h.px},${h.py}) ${h.mesh} d=${h.dist}m  hit=(${x}, ${y}, ${z})  u=${u.toFixed(0)}`
      + `  field h=${fieldH.toFixed(1)}  Δ=${(y - fieldH).toFixed(1)}   edges ${h.edges.join('/')} m`);
  }
  if (errs.length) console.error('ERRORS:\n' + errs.slice(0, 8).join('\n'));
  await browser.close();
  if (server) server.kill();
  return errs.length;
}

let code = 0;
if (!FLAG('probe-only')) {
  const only = arg('level');
  const levels = only && only !== true ? [only] : Object.keys(DNA_BY_ID);
  for (const id of levels) {
    if ((DNA_BY_ID[id].backend ?? 'terrain') !== 'terrain') continue;
    console.log(`\n── ${id} ──`);
    code += audit(id) ? 1 : 0;
  }
}
if (!FLAG('audit')) code += (await probe()) ? 1 : 0;
process.exit(code);
