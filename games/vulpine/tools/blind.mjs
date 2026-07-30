#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Blind A/B pair builder.
//
//   node tools/blind.mjs shots/r2 shots/r3 --out shots/blind --key /tmp/key.json
//
// Copies matching shot names from two builds into one directory as
// `<shot>--left.png` / `<shot>--right.png` with the side assignment randomised
// per shot, and writes the answer key somewhere the reviewer is not looking.
//
// The point: a reviewer who knows which image is the new build will find the
// new build better. Strip the label and the judgement is worth something.
// ─────────────────────────────────────────────────────────────────────────────
import { readdir, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const positional = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { i++; continue; }
  positional.push(a);
}

async function main() {
  const [dirA, dirB] = positional;
  if (!dirA || !dirB) {
    console.error('usage: node tools/blind.mjs <dirA> <dirB> [--out shots/blind] [--key path] [--seed s]');
    process.exit(2);
  }
  const out = path.resolve(ROOT, arg('out', 'shots/blind'));
  const keyPath = path.resolve(arg('key', path.join(out, '..', '.blind-key.json')));
  const seed = String(arg('seed', Date.now()));

  const absA = path.resolve(ROOT, dirA), absB = path.resolve(ROOT, dirB);
  const namesA = new Set((await readdir(absA)).filter(f => f.endsWith('.png') && f !== 'sheet.png'));
  const namesB = new Set((await readdir(absB)).filter(f => f.endsWith('.png') && f !== 'sheet.png'));
  const shared = [...namesA].filter(n => namesB.has(n)).sort();
  if (!shared.length) { console.error('no shot names in common'); process.exit(2); }

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  const key = { seed, dirA, dirB, map: {} };
  for (const n of shared) {
    // deterministic per (seed, shot) so a run can be reproduced from the key
    const h = createHash('sha256').update(seed + ':' + n).digest()[0];
    const aIsLeft = (h & 1) === 0;
    const base = n.replace(/\.png$/, '');
    await copyFile(path.join(aIsLeft ? absA : absB, n), path.join(out, `${base}--left.png`));
    await copyFile(path.join(aIsLeft ? absB : absA, n), path.join(out, `${base}--right.png`));
    key.map[base] = { left: aIsLeft ? dirA : dirB, right: aIsLeft ? dirB : dirA };
  }

  await writeFile(keyPath, JSON.stringify(key, null, 2));
  console.log(`${shared.length} pairs → ${path.relative(ROOT, out)}`);
  console.log(`key → ${keyPath}  (do not show this to the reviewer)`);
}

main().catch(e => { console.error(e); process.exit(1); });
