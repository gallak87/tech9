#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PROBE — does the engine load and animate this character correctly?
//
//   npm run retry:probe -- assets/kaida.glb
//   npm run retry:probe -- assets/vex.glb --id vex --clips idle,run
//   npm run retry:probe -- assets/kaida.glb --json
//
// Node only. No browser, no renderer, no WebGL, no screenshots. Drives the real
// src/actors code against a real glb and measures the result in degrees.
//
// ── why this exists ──────────────────────────────────────────────────────────
// A character can pass every structural check and still animate into a
// face-down, splayed heap. That failure was found by eye, from a screenshot,
// twice — once per agent — and each time it cost a browser round trip to see
// and a guess to explain.
//
// It is measurable. `idle` is nearly the bind pose, so under a correct rig the
// limbs barely move; under a broken one they invert. Every check below is a
// number with a threshold, so "is it fixed yet" is a command rather than an
// opinion, and "is it getting better" is a diff.
//
// Every check reports its measurement whether it passes or fails. A probe that
// only says FAIL tells the next agent nothing about which way to move.
// ─────────────────────────────────────────────────────────────────────────────

// GLTFLoader resolves textures through browser globals. This harness has no DOM
// and does not test materials; give it the minimum rather than swapping in a
// different loader, which would prove nothing about the game.
globalThis.self = globalThis;
globalThis.URL.createObjectURL ??= () => 'blob:stub';
globalThis.URL.revokeObjectURL ??= () => {};
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { HERO_M } from '../../../src/core/const.js';
import { buildActor } from '../../../src/actors/rig.js';
import { makeActorUniforms, makeActorMaterial } from '../../../src/actors/material.js';
import { applyGltfActor, SPEC_BONES } from '../../../src/actors/gltf-actor.js';
import { samplePose, POSE_NAMES } from '../../../src/actors/poses.js';

/* ── options ──────────────────────────────────────────────────────────────── */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i === -1 ? d : argv[i + 1]; };
const has = (k) => argv.includes(`--${k}`);

if (has('help') || !argv.length) {
  console.log(`usage: node docs/phase2-retry/test/probe.mjs <asset.glb> [options]

  --id <name>        character id to build          default: the file's basename
  --clips a,b,c      clips to check                 default: all (${POSE_NAMES.join(',')})
  --t <n>            time to sample each clip at    default: 0.25
  --arm-max <deg>    arm deviation from -Y allowed  default: 55
  --limb-max <deg>   bind limb deviation allowed    default: 8
  --spine-min <y>    minimum hips→head Y            default: 0.9
  --json             machine-readable output
  --quiet            failures only

Exit 0 all pass, 1 any fail, 2 could not run.`);
  process.exit(has('help') ? 0 : 2);
}

const asset = path.resolve(argv.find(a => !a.startsWith('--') && !argv[argv.indexOf(a) - 1]?.startsWith('--')) ?? argv[0]);
const CFG = {
  id: opt('id', path.basename(asset, '.glb')),
  clips: (opt('clips', POSE_NAMES.join(','))).split(',').map(s => s.trim()).filter(Boolean),
  t: Number(opt('t', 0.25)),
  armMax: Number(opt('arm-max', 55)),
  limbMax: Number(opt('limb-max', 8)),
  spineMin: Number(opt('spine-min', 0.9)),
  json: has('json'),
  quiet: has('quiet'),
};

/* ── reporting ────────────────────────────────────────────────────────────── */

const results = [];
const check = (name, pass, measured, want) => {
  results.push({ name, pass, measured, want });
  if (CFG.json || (CFG.quiet && pass)) return;
  console.log(`  ${pass ? '✓' : '✗'} ${name.padEnd(38)} ${String(measured).padEnd(26)} ${pass ? '' : `want ${want}`}`);
};
const bail = (msg) => {
  if (CFG.json) console.log(JSON.stringify({ asset, ok: false, error: msg, checks: results }, null, 2));
  else console.error(`\nprobe cannot run: ${msg}`);
  process.exit(2);
};

if (!fs.existsSync(asset)) bail(`no asset at ${path.relative(REPO, asset)}`);
if (!CFG.json) console.log(`probe · ${path.relative(REPO, asset)} · id=${CFG.id} · clips=${CFG.clips.join(',')}\n`);

/* ── load ─────────────────────────────────────────────────────────────────── */

let gltf;
try { gltf = await new GLTFLoader().parseAsync(fs.readFileSync(asset).buffer, ''); }
catch (e) { bail(`GLTFLoader: ${e.message}`); }

const uniforms = makeActorUniforms();
const actor = buildActor({ id: CFG.id, faction: 'ally', uniforms, material: makeActorMaterial(uniforms) });

try { applyGltfActor(actor, gltf.scene); }
catch (e) { check('engine accepts the asset', false, e.message.split('\n')[0], 'a contract asset'); bail('applyGltfActor rejected it'); }
check('engine accepts the asset', true, 'loaded', '');

/* ── geometry helpers ─────────────────────────────────────────────────────── */

const DOWN = new THREE.Vector3(0, -1, 0);
const wp = (n) => actor.boneByName.get(n).getWorldPosition(new THREE.Vector3());
const dirOf = (a, b) => wp(b).sub(wp(a)).normalize();
const angFrom = (a, b, ref) => THREE.MathUtils.radToDeg(
  Math.acos(THREE.MathUtils.clamp(dirOf(a, b).dot(ref), -1, 1)));
const fixed = (n, d = 1) => Number(n.toFixed(d));

const LIMBS = [
  ['upperArm_L', 'lowerArm_L'], ['upperArm_R', 'lowerArm_R'],
  ['upperLeg_L', 'lowerLeg_L'], ['upperLeg_R', 'lowerLeg_R'],
];

/* ── 1. structure ─────────────────────────────────────────────────────────── */

const found = SPEC_BONES.filter(n => actor.boneByName?.get(n));
check('joints resolved by spec name', found.length === SPEC_BONES.length,
  `${found.length}/${SPEC_BONES.length}`, `${SPEC_BONES.length}/${SPEC_BONES.length}`);
if (found.length !== SPEC_BONES.length) bail(`missing: ${SPEC_BONES.filter(n => !actor.boneByName.get(n)).join(', ')}`);

/* ── 2. the pipeline already normalised it ────────────────────────────────── */

check('needs no rescaling', Math.abs(actor.rigScale - 1) <= 0.02,
  `×${fixed(actor.rigScale, 4)}`, '×1.00 ± 0.02');
check('source height is HERO_M', Math.abs(actor.sourceHeightM - HERO_M) <= 0.03,
  `${fixed(actor.sourceHeightM, 3)} m`, `${HERO_M} ± 0.03`);
check('ankle-to-sole measured, not assumed', actor.soleM > 0.02 && actor.soleM < 0.30,
  `${fixed(actor.soleM, 3)} m`, '0.02–0.30');

/* ── 3. the bind pose ─────────────────────────────────────────────────────── */

actor.root.updateMatrixWorld(true);
const spine0 = dirOf('hips', 'head');
const across = dirOf('shoulder_L', 'shoulder_R');
check('bind: stands upright', spine0.y >= CFG.spineMin,
  `hips→head y ${fixed(spine0.y, 2)}`, `≥ ${CFG.spineMin}`);
check('bind: shoulders run across X', Math.abs(across.x) > 0.9,
  `x ${fixed(across.x, 2)}`, '|x| > 0.9');
for (const [a, b] of LIMBS) {
  const d = angFrom(a, b, DOWN);
  check(`bind: ${a} hangs along -Y`, d <= CFG.limbMax, `${fixed(d)}°`, `≤ ${CFG.limbMax}°`);
}

/* ── 4. the clips ─────────────────────────────────────────────────────────── */
//
// The check the screenshots kept catching. A rig whose rest rotations are not
// what the write path assumes looks perfect at bind and inverts the moment a
// clip is applied — so bind alone proves nothing.

const applyClip = (clip, t) => {
  const pose = samplePose(clip, t);
  if (!pose) return null;
  for (const [name, [x, y, z]] of Object.entries(pose.j ?? {})) {
    const bone = actor.boneByName.get(name);
    if (bone && actor.retarget) actor.retarget.set(bone, x, y, z);
  }
  actor.root.updateMatrixWorld(true);
  return pose;
};

for (const clip of CFG.clips) {
  if (!POSE_NAMES.includes(clip)) { check(`clip "${clip}" exists`, false, 'unknown', POSE_NAMES.join('|')); continue; }
  if (!applyClip(clip, CFG.t)) { check(`clip "${clip}" samples`, false, 'null', 'a pose'); continue; }

  const s = dirOf('hips', 'head');
  check(`${clip}: upright`, s.y >= CFG.spineMin, `hips→head y ${fixed(s.y, 2)}`, `≥ ${CFG.spineMin}`);

  const worst = LIMBS.map(([a, b]) => ({ j: a, d: angFrom(a, b, DOWN) }))
    .sort((x, y) => y.d - x.d)[0];
  check(`${clip}: limbs not inverted`, worst.d <= CFG.armMax,
    `worst ${worst.j} ${fixed(worst.d)}°`, `≤ ${CFG.armMax}° from -Y`);
}

/* ── verdict ──────────────────────────────────────────────────────────────── */

const failed = results.filter(r => !r.pass);
if (CFG.json) {
  console.log(JSON.stringify({
    asset: path.relative(REPO, asset), id: CFG.id, ok: failed.length === 0,
    passed: results.length - failed.length, failed: failed.length,
    config: CFG, checks: results,
  }, null, 2));
} else {
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length) {
    console.log('\nA limb at ~180° from -Y is inverted, not merely posed: the write path in');
    console.log('src/actors/gltf-actor.js assumes every joint\'s rest rotation is identity,');
    console.log('and the asset carries one that is not. Fix it in the pipeline, not here —');
    console.log('see docs/phase2-retry/CONTRACT.md.');
  }
}
process.exit(failed.length ? 1 : 0);
