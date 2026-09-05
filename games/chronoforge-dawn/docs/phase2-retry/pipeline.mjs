#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// The runner. One command turns a manifest entry into a character in the game.
//
//   node docs/phase2-retry/pipeline.mjs manifest.json --only kaida
//   node docs/phase2-retry/pipeline.mjs manifest.json --only kaida --stage install
//   node docs/phase2-retry/pipeline.mjs manifest.json --list
//
// Stages run in order and skip when their inputs have not moved. The skip is
// not an optimisation: mesh generation is a ~20 minute pass, so without it a
// failure in a later stage costs a full re-mesh on every retry.
//
// A stage that cannot run says exactly what is missing and exactly what it
// would have run. It never approximates, and it never half-produces an output.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* ── args ─────────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const flags = { force: argv.includes('--force'), list: argv.includes('--list') };
for (const k of ['only', 'stage']) {
  const i = argv.indexOf(`--${k}`);
  if (i !== -1) flags[k] = argv[i + 1];
}
const manifestPath = argv.find(a => !a.startsWith('--') && a !== flags.only && a !== flags.stage)
  || path.join(HERE, 'manifest.json');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const ROOT = path.resolve(HERE, '..', '..');
const abs = (p) => path.isAbsolute(p) ? p : path.join(ROOT, p);
const rel = (p) => path.relative(ROOT, p) || p;

const OUT = abs(manifest.out);
const HASHES = path.join(OUT, '.hashes.json');
fs.mkdirSync(OUT, { recursive: true });

/* ── stages ───────────────────────────────────────────────────────────────── */
const names = manifest.stages;
const stages = new Map();
for (const n of names) {
  const file = path.join(HERE, 'stages', `${n}.mjs`);
  if (!fs.existsSync(file)) { console.error(`no stage module at ${rel(file)}`); process.exit(2); }
  const mod = (await import(file)).default;
  if (typeof mod?.run !== 'function') { console.error(`${rel(file)} has no run()`); process.exit(2); }
  stages.set(n, mod);
}

let chars = manifest.characters;
if (flags.only) {
  chars = chars.filter(c => c.name === flags.only);
  if (!chars.length) { console.error(`no character "${flags.only}"`); process.exit(2); }
}
const wanted = flags.stage ? [flags.stage] : names;
for (const s of wanted) if (!stages.has(s)) { console.error(`unknown stage "${s}"`); process.exit(2); }

if (flags.list) {
  console.log(`stages: ${names.join(' → ')}`);
  for (const c of chars) console.log(`  ${c.name}  ref=${c.ref ?? '—'}`);
  process.exit(0);
}

/* ── hash cache ───────────────────────────────────────────────────────────── */
const loadHashes = () => { try { return JSON.parse(fs.readFileSync(HASHES, 'utf8')); } catch { return {}; } };
const saveHashes = (h) => fs.writeFileSync(HASHES, JSON.stringify(h, null, 2) + '\n');

/** sha256 over every input's BYTES plus the stage's config. Bytes, not mtimes:
 *  a file restored from git has a new mtime and identical content, and
 *  re-running a 20-minute stage for that is the whole thing this prevents. */
function hashInputs(inputs, config) {
  const h = crypto.createHash('sha256');
  for (const f of inputs) {
    if (!fs.existsSync(f)) return null;
    h.update(fs.readFileSync(f));
  }
  h.update(JSON.stringify(config ?? {}));
  return h.digest('hex');
}

/* ── run ──────────────────────────────────────────────────────────────────── */
const env = { out: OUT, root: ROOT, assets: abs(manifest.assets), manifest };
const hashes = loadHashes();
let ran = 0, skipped = 0, failed = 0;

console.log(`pipeline · ${chars.length} character(s) · ${wanted.join(' → ')}\n`);

for (const entry of chars) {
  for (const name of wanted) {
    const stage = stages.get(name);
    const key = `${entry.name}/${name}`;
    const config = { ...(manifest[name] ?? {}), ...(entry[name] ?? {}) };
    const inputs = stage.inputs(entry, env, config).map(abs);
    const outputs = stage.outputs(entry, env, config).map(abs);

    const have = outputs.every(f => fs.existsSync(f));
    const hash = hashInputs(inputs, config);
    if (!flags.force && have && hash && hashes[key] === hash) {
      console.log(`· ${key}  skip (inputs unchanged)`);
      skipped++;
      continue;
    }

    const missing = inputs.filter(f => !fs.existsSync(f));
    if (missing.length) {
      console.log(`✗ ${key}  needs ${missing.map(rel).join(', ')} — run the stage before it`);
      failed++;
      break;   // later stages of this character cannot run either
    }

    try {
      process.stdout.write(`▶ ${key}\n`);
      await stage.run({ entry, env, config, inputs, outputs, rel, abs,
        log: (m) => console.log(`    ${m}`) });
      const produced = outputs.filter(f => fs.existsSync(f));
      if (produced.length !== outputs.length) {
        throw new Error(`did not produce ${outputs.filter(f => !fs.existsSync(f)).map(rel).join(', ')}`);
      }
      hashes[key] = hashInputs(inputs, config);
      saveHashes(hashes);
      console.log(`✓ ${key}  ${outputs.map(rel).join(', ')}`);
      ran++;
    } catch (e) {
      console.log(`✗ ${key}  ${e.message}`);
      failed++;
      break;
    }
  }
}

console.log(`\n${ran} ran, ${skipped} skipped, ${failed} failed`);
process.exit(failed ? 1 : 0);
