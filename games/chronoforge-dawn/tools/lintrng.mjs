#!/usr/bin/env node
// Determinism gate. `Math.random()` makes every capture and every headless probe
// run unreproducible, which makes review impossible — so it is a defect here,
// not a style note. Use `rng('your.stream')` from src/core/rng.js.
//
// Comments are allowed to name it (this file and the docs do); code is not.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hits = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(js|mjs)$/.test(name)) continue;
    if (p === fileURLToPath(import.meta.url)) continue;   // this file names it on purpose
    const src = readFileSync(p, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (!/Math\s*\.\s*random\s*\(/.test(line)) return;
      const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
      if (/Math\s*\.\s*random\s*\(/.test(code)) hits.push(`${path.relative(ROOT, p)}:${i + 1}: ${line.trim()}`);
    });
  }
}

for (const d of ['src', 'tools']) walk(path.join(ROOT, d));

if (hits.length) {
  console.error(`Math.random() is a defect — use rng('your.stream') from src/core/rng.js\n`);
  console.error(hits.join('\n'));
  process.exit(1);
}
console.log('rng: clean — no Math.random() in src/ or tools/');
