#!/usr/bin/env node
// forge.mjs — image → mesh → rig → installed character. Manifest-driven, one
// stage at a time, skipping anything whose inputs have not moved.
//
//   node docs/phase2/forge.mjs docs/phase2/forge-manifest.json --only kaida
//   node docs/phase2/forge.mjs docs/phase2/forge-manifest.json --only kaida --stage mesh
//   node docs/phase2/forge.mjs docs/phase2/forge-manifest.json --only kaida --force
//   node docs/phase2/forge.mjs docs/phase2/forge-manifest.json --list
//
// Same shape as ref-gen.mjs: same arg parsing, same manifest style, no
// dependencies. Python is a spawned binary, not a second language in the
// codebase, as tools/sprite-gen.js shells out to `sips`.
//
// The hash cache is not an optimisation. `mesh` is a ~15-minute Hunyuan pass on
// an M1 Pro and `rig` is unmeasured; without skipping, one failure in `rig`
// costs a full re-mesh on every retry. `out/.hashes.json` holds
// sha256(input bytes + stage config) per character/stage. `--force` overrides.
//
// Progress goes to stdout. No streaming protocol, no job runner.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

/* ── args ────────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const VALUED = new Set(['--only', '--stage']);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (VALUED.has(a)) flags[a.slice(2)] = argv[++i];
  else if (a.startsWith('--')) flags[a.slice(2)] = true;
  else positional.push(a);
}

const manifestPath = positional[0];
if (!manifestPath) {
  console.error('usage: node forge.mjs <manifest.json> [--only <name>] [--stage <stage>] [--force] [--list]');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const DIR = path.dirname(path.resolve(manifestPath));
const OUT = path.resolve(DIR, manifest.out || 'out');
const ASSETS = path.resolve(DIR, manifest.assets || '../../assets');
const HASHES = path.join(OUT, '.hashes.json');

const resolve = (p) => (path.isAbsolute(p) ? p : path.resolve(DIR, p));
const rel = (p) => path.relative(process.cwd(), p);

/* ── stages ──────────────────────────────────────────────────────────────── */

const STAGE_NAMES = manifest.stages?.length ? manifest.stages : ['mesh', 'rig', 'install'];

async function loadStage(name) {
  const file = path.join(DIR, 'stages', `${name}.mjs`);
  if (!fs.existsSync(file)) throw new Error(`no stage module at ${rel(file)}`);
  const mod = await import(pathToFileURL(file).href);
  const s = mod.default;
  if (!s || typeof s.run !== 'function') throw new Error(`${rel(file)} does not default-export a stage with run()`);
  if (s.name !== name) throw new Error(`${rel(file)} declares name "${s.name}" but lives at ${name}.mjs`);
  return s;
}

/** `inputs` / `outputs` may be a literal array or a function of (entry, ctx). */
const listOf = (v, entry, env) => (typeof v === 'function' ? v(entry, env) : (v || [])).map(resolve);

/* ── hash cache ──────────────────────────────────────────────────────────── */

function readHashes() {
  try { return JSON.parse(fs.readFileSync(HASHES, 'utf8')); } catch { return {}; }
}
function writeHashes(h) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(HASHES, `${JSON.stringify(h, null, 2)}\n`);
}

/** sha256 over every input's BYTES plus the stage's config. Bytes, not mtimes:
 *  a `git checkout` or a re-save moves an mtime without changing a pixel, and
 *  the cost of a false miss here is a 15-minute re-mesh. */
function hashInputs(inputs, config) {
  const h = crypto.createHash('sha256');
  for (const f of inputs) {
    h.update(path.basename(f));
    h.update(fs.readFileSync(f));
  }
  h.update(JSON.stringify(config ?? {}));
  return h.digest('hex');
}

/* ── run ─────────────────────────────────────────────────────────────────── */

const chars = (manifest.characters || []).filter(c => !flags.only || c.name === flags.only);
if (!chars.length) {
  console.error(flags.only ? `no character named "${flags.only}" in the manifest` : 'manifest has no characters');
  process.exit(1);
}
const wanted = flags.stage ? [flags.stage] : STAGE_NAMES;
for (const s of wanted) {
  if (!STAGE_NAMES.includes(s)) {
    console.error(`unknown stage "${s}" — manifest declares ${STAGE_NAMES.join(', ')}`);
    process.exit(1);
  }
}

if (flags.list) {
  console.log(`forge · ${chars.length} character(s) · stages ${STAGE_NAMES.join(' → ')}`);
  for (const c of chars) console.log(`  ${c.name.padEnd(10)} ref ${c.ref}`);
  process.exit(0);
}

console.log(`forge · ${chars.length} character(s) × ${wanted.length} stage(s)`);
console.log(`  out    ${rel(OUT)}/`);
console.log(`  assets ${rel(ASSETS)}/\n`);

/* Every stage module, loaded once — all of them, not just the wanted ones.
   `--stage install` still has to name the stage that produces the input it is
   missing, and that answer comes from the other stages' declared outputs
   rather than from a filename convention duplicated here. */
const stages = new Map();
try {
  for (const n of STAGE_NAMES) stages.set(n, await loadStage(n));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const hashes = readHashes();
let ran = 0, skipped = 0, failed = 0;

for (const entry of chars) {
  const env = { manifest, dir: DIR, out: OUT, assets: ASSETS };
  const io = new Map();
  for (const [n, s] of stages) {
    io.set(n, {
      inputs: listOf(s.inputs, entry, { ...env, config: manifest[n] || {} }),
      outputs: listOf(s.outputs, entry, { ...env, config: manifest[n] || {} }),
    });
  }
  const producerOf = (file) => [...io].find(([, x]) => x.outputs.includes(file))?.[0];

  for (const stageName of wanted) {
    const label = `${entry.name}/${stageName}`;
    const stage = stages.get(stageName);
    const config = manifest[stageName] || {};
    const { inputs, outputs } = io.get(stageName);

    const missing = inputs.filter(f => !fs.existsSync(f));
    if (missing.length) {
      console.log(`  ${label.padEnd(18)} BLOCKED`);
      for (const m of missing) {
        const p = producerOf(m);
        console.log(`     missing input: ${rel(m)}${p ? `  — the \`${p}\` stage writes this. Run it first, or drop the file in by hand.` : ''}`);
      }
      failed++;
      break;
    }

    const key = `${entry.name}:${stageName}`;
    const hash = hashInputs(inputs, config);
    const fresh = !flags.force && outputs.length > 0 && outputs.every(f => fs.existsSync(f)) && hashes[key] === hash;
    if (fresh) {
      console.log(`  ${label.padEnd(18)} skip  (inputs unchanged)`);
      skipped++;
      continue;
    }

    const t0 = Date.now();
    const ctx = {
      name: entry.name,
      entry,
      manifest,
      config,
      dir: DIR,
      out: OUT,
      assets: ASSETS,
      inputs,
      outputs,
      force: !!flags.force,
      resolve,
      rel,
      log: (msg) => console.log(`     ${msg}`),
      progress: (f, msg = '') => {
        const pct = `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`.padStart(4);
        console.log(`     ${pct}  ${msg}`);
      },
    };

    process.stdout.write(`  ${label.padEnd(18)} running ...\n`);
    try {
      fs.mkdirSync(OUT, { recursive: true });
      await stage.run(ctx);
      const late = outputs.filter(f => !fs.existsSync(f));
      if (late.length) throw new Error(`stage reported success but did not write ${late.map(rel).join(', ')}`);
      hashes[key] = hash;
      writeHashes(hashes);
      console.log(`  ${label.padEnd(18)} done  ${((Date.now() - t0) / 1000).toFixed(1)}s → ${outputs.map(f => path.basename(f)).join(', ')}`);
      ran++;
    } catch (err) {
      console.log(`  ${label.padEnd(18)} FAILED`);
      for (const line of String(err.message).split('\n')) console.log(`     ${line}`);
      failed++;
      /* Stop this character's chain: a downstream stage fed a stale output
         silently re-installs yesterday's glb. */
      break;
    }
  }
}

console.log(`\n${ran} ran, ${skipped} skipped, ${failed} failed`);
process.exit(failed ? 1 : 0);
