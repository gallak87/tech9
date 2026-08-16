#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Did that change any bytes? Hashes what the generators produce — every baked
// texture's pixels, every static geometry's attribute arrays, and a fixed
// lattice of world field samples — so a refactor that must not change output
// can be proved rather than eyeballed.
//
//   node tools/digest.mjs --out shots/before.json
//   …change something…
//   node tools/digest.mjs --against shots/before.json      # exit 1 if any differ
//   node tools/digest.mjs --level foundry --out shots/foundry.json
//
// This is the safety net for PLAN-PERF B3 and B4, which rewrite the inside of
// the noise bakery and must leave its output identical. A screenshot cannot
// answer that — two images can look the same and differ in a hundred texels.
//
// What is hashed and what is not. Textures are baked once and never mutated, so
// every texture reachable from the scene is fair game. Geometry is hashed only
// under the world root and the ship, because fx pools rewrite their attribute
// arrays every frame and would report a difference on every run. Field samples
// go through `groundAt`, which is a pure function of the active DNA and catches
// a `profile.js` change even when the meshing happens to land identically.
//
// A digest is a change detector, not a checksum: it is order-sensitive, so a
// generator that emits the same bytes in a different order reports a change.
// That is intended — the traversal order is part of the output.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
const PORT = parseInt(arg('port', '5471'), 10);
const QUALITY = arg('quality', 'high');
const LEVEL = arg('level', 'corneria');
const OUT = arg('out', null);
const AGAINST = arg('against', null);

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
  if (!(await up(base))) { console.error('vite failed'); process.exit(2); }
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e.message)));

// `texcache=0` is not optional. This tool exists to prove the generators still
// produce the same bytes; reading those bytes out of a cache instead of running
// them would make it report "identical" across exactly the change it is here to
// catch.
await page.goto(`${base}/?quality=${QUALITY}&level=${LEVEL}&hud=0&t=0.1&texcache=0`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__VULPINE__ && window.__VULPINE__.ready, null, { timeout: 180000, polling: 100 });
await page.waitForFunction(() => window.__VULPINE__.world.buildProgress >= 1, null, { timeout: 180000, polling: 100 });

const digest = await page.evaluate(() => {
  const V = window.__VULPINE__;

  /* 32-bit FNV-1a, stepped 4 bytes at a time where alignment allows. Not FNV
     proper at that stride, and it does not need to be — it needs to be
     deterministic and to notice a single flipped byte. */
  const hash = (view) => {
    const u8 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    let h = 0x811c9dc5;
    if (u8.byteOffset % 4 === 0 && u8.byteLength % 4 === 0) {
      const u32 = new Uint32Array(u8.buffer, u8.byteOffset, u8.byteLength / 4);
      for (let i = 0; i < u32.length; i++) { h ^= u32[i]; h = Math.imul(h, 16777619); }
    } else {
      for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 16777619); }
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  };

  const entries = [];
  const seenTex = new Set();

  // Stable label: an object's name where it has one, its index in its parent
  // where it does not. Both are deterministic for a given build.
  const pathOf = (o) => {
    const parts = [];
    for (let n = o; n && n.parent; n = n.parent) {
      parts.unshift(n.name || `#${n.parent.children.indexOf(n)}`);
    }
    return parts.join('/');
  };

  const TEX_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
    'emissiveMap', 'alphaMap', 'displacementMap', 'bumpMap'];

  const addTextures = (mat, where) => {
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      if (!m) continue;
      for (const slot of TEX_SLOTS) {
        const t = m[slot];
        if (!t || seenTex.has(t.uuid)) continue;
        seenTex.add(t.uuid);
        const data = t.image && t.image.data;
        // Render targets and canvas-backed textures have no readable array;
        // they are not generator output and are skipped on purpose.
        if (!data || !data.byteLength) continue;
        entries.push({
          kind: 'texture',
          id: `${t.name || slot}@${where}`,
          bytes: data.byteLength,
          digest: hash(data),
        });
      }
      // Shader materials carry baked data in uniforms rather than slots.
      if (m.uniforms) {
        for (const [k, u] of Object.entries(m.uniforms)) {
          const t = u && u.value;
          if (!t || !t.isTexture || seenTex.has(t.uuid)) continue;
          seenTex.add(t.uuid);
          const data = t.image && t.image.data;
          if (!data || !data.byteLength) continue;
          entries.push({ kind: 'texture', id: `${k}@${where}`, bytes: data.byteLength, digest: hash(data) });
        }
      }
    }
  };

  // Textures: every one in the scene, wherever it hangs.
  V.engine.scene.traverse((o) => { if (o.material) addTextures(o.material, pathOf(o)); });

  // Geometry: static procedural meshes only. fx pools rewrite their attributes
  // every frame and would differ on every run for reasons that are not a change.
  const geoRoots = [V.world.root, V.ship].filter(Boolean);
  for (const root of geoRoots) {
    root.traverse((o) => {
      const g = o.geometry;
      if (!g || !g.attributes) return;
      const where = pathOf(o);
      for (const name of Object.keys(g.attributes).sort()) {
        const a = g.attributes[name];
        if (!a || !a.array) continue;
        entries.push({ kind: 'geometry', id: `${where}.${name}`, bytes: a.array.byteLength, digest: hash(a.array) });
      }
      if (g.index) entries.push({ kind: 'geometry', id: `${where}.index`, bytes: g.index.array.byteLength, digest: hash(g.index.array) });
    });
  }

  // Field samples: a fixed lattice through `groundAt`, which is pure in the
  // active DNA. Catches a profile change that the meshing rounds away.
  const S = 73, ZN = 97, zEnd = -9000;
  const samples = new Float64Array(S * ZN);
  for (let j = 0; j < ZN; j++) {
    const z = (j / (ZN - 1)) * zEnd;
    for (let i = 0; i < S; i++) {
      const x = -900 + (1800 * i) / (S - 1);
      const g = V.world.groundAt(x, z);
      samples[j * S + i] = Number.isFinite(g) ? g : -1e9;
    }
  }
  entries.push({ kind: 'field', id: 'groundAt lattice 73x97', bytes: samples.byteLength, digest: hash(samples) });

  entries.sort((a, b) => (a.kind + a.id).localeCompare(b.kind + b.id));
  // One number for "did anything at all move", over the per-entry digests.
  const all = new TextEncoder().encode(entries.map(e => `${e.kind}:${e.id}:${e.digest}`).join('|'));
  return { entries, overall: hash(all), counts: {
    texture: entries.filter(e => e.kind === 'texture').length,
    geometry: entries.filter(e => e.kind === 'geometry').length,
    field: entries.filter(e => e.kind === 'field').length,
  } };
});

await browser.close();
if (server) server.kill();

if (errors.length) {
  console.error(`  console errors: ${errors.length}\n    ` + errors.slice(0, 8).join('\n    '));
  process.exit(1);
}

const record = { level: LEVEL, quality: QUALITY, ...digest };
console.log(`\n  level=${LEVEL} quality=${QUALITY}`);
console.log(`  ${digest.counts.texture} textures, ${digest.counts.geometry} geometry arrays, ${digest.counts.field} field lattice`);
console.log(`  overall ${digest.overall}`);

if (OUT && OUT !== true) {
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(record, null, 2));
  console.log(`  written to ${OUT}`);
}

if (AGAINST && AGAINST !== true) {
  const prev = JSON.parse(await readFile(AGAINST, 'utf8'));
  if (prev.level !== LEVEL) console.log(`  ** comparing across levels: ${prev.level} vs ${LEVEL} **`);
  const pm = new Map(prev.entries.map(e => [`${e.kind}:${e.id}`, e]));
  const cm = new Map(digest.entries.map(e => [`${e.kind}:${e.id}`, e]));
  const changed = [], added = [], removed = [];
  for (const [k, e] of cm) {
    const p = pm.get(k);
    if (!p) added.push(k);
    else if (p.digest !== e.digest) changed.push({ k, from: p.digest, to: e.digest, bytes: e.bytes, wasBytes: p.bytes });
  }
  for (const k of pm.keys()) if (!cm.has(k)) removed.push(k);

  console.log(`\n  against ${AGAINST}: ${changed.length} changed, ${added.length} added, ${removed.length} removed`);
  for (const c of changed.slice(0, 40)) {
    console.log(`    CHANGED  ${c.k.padEnd(52)} ${c.from} → ${c.to}${c.bytes !== c.wasBytes ? `  (${c.wasBytes} → ${c.bytes} bytes)` : ''}`);
  }
  for (const k of added.slice(0, 20)) console.log(`    ADDED    ${k}`);
  for (const k of removed.slice(0, 20)) console.log(`    REMOVED  ${k}`);
  if (changed.length + added.length + removed.length) {
    console.log('\n  *** OUTPUT IS NOT IDENTICAL ***');
    process.exit(1);
  }
  console.log('  identical.');
}
