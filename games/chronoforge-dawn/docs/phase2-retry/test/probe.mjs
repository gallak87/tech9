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

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { HERO_M } from '../../../src/core/const.js';
import { buildActor } from '../../../src/actors/rig.js';
import { makeActorUniforms, makeActorMaterial } from '../../../src/actors/material.js';
import { applyGltfActor, SPEC_BONES } from '../../../src/actors/gltf-actor.js';
import { readGlb, meshBoundsX } from '../contract.mjs';
import { samplePose, POSE_NAMES } from '../../../src/actors/poses.js';
import { JOINTS } from '../../specs/rig.mjs';

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

  --shot             ALSO capture the character in-game (needs the dev server)
  --shot-port <n>    dev server port                default: 5190
  --shot-out <dir>   where the png lands            default: shots/probe

Exit 0 all pass, 1 any fail, 2 could not run.`);
  process.exit(has('help') ? 0 : 2);
}

const asset = path.resolve(argv.find(a => !a.startsWith('--') && !argv[argv.indexOf(a) - 1]?.startsWith('--')) ?? argv[0]);
const CFG = {
  id: opt('id', path.basename(asset, '.glb')),
  clips: (opt('clips', POSE_NAMES.join(','))).split(',').map(s => s.trim()).filter(Boolean),
  t: Number(opt('t', 0.25)),
  matchMax: Number(opt('match-max', 12)),
  limbMax: Number(opt('limb-max', 8)),
  spineMin: Number(opt('spine-min', 0.9)),
  json: has('json'),
  quiet: has('quiet'),
  shot: has('shot'),
  shotPort: opt('shot-port', '5190'),
  shotOut: opt('shot-out', 'shots/probe'),
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

// Every parent→child segment in the spec, derived from the spec rather than
// hand-picked. A hand-picked list checked four limb bones and passed a
// character whose arms were held straight out, because the shoulders — which
// were what moved them — were not in it. Deriving it means a joint added to the
// spec is covered without anyone remembering to add it here.
const SEGMENTS = JOINTS.filter(j => j.parent).map(j => [j.parent, j.name]);

// A segment "hangs" when the spec puts it predominantly along -Y. Derived from
// the offsets rather than matched on names: hips→upperLeg is [0.10, -0.02, 0],
// mostly hip WIDTH, and spine_upper→shoulder is shoulder width. Those encode the
// rig's proportions, which a canonical asset keeps as its own — a Mixamo
// shoulder does not sit where the spec's does and the mesh is skinned to where
// it is. Only the hanging segments are what the rest pose constrains.
const HANGS = new Set(JOINTS.filter(j => j.parent).filter((j) => {
  const [x, y, z] = j.offset;
  return -y > Math.hypot(x, z);
}).map(j => j.name));
const LIMBS = SEGMENTS.filter(([, b]) => HANGS.has(b));

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

/* ── 2b. does the SKIN follow the SKELETON? ───────────────────────────────── */
//
// The check that was missing. Everything else here measures bones, and a mesh
// can sit in the rigger's original pose while the skeleton is perfectly
// canonical — the file is internally consistent, every bone reads 0° from -Y,
// and the character renders with her arms straight out. Blender's
// `armature_apply` produces exactly that if the skin is not baked first.
//
// Compared against the hand span rather than an absolute width, so it holds for
// any character: with the arms down, the mesh is barely wider than the hands.
{
  const b = readGlb(asset).json;
  const skinNode = (b.nodes || []).find(n => n.skin !== undefined);
  const acc = skinNode && b.accessors?.[b.meshes[skinNode.mesh].primitives[0].attributes.POSITION];
  if (!acc?.min) check('mesh bounds readable', false, 'no POSITION bounds', 'accessor min/max');
  else {
    actor.root.updateMatrixWorld(true);
    const meshW = acc.max[0] - acc.min[0];
    const handSpan = wp('hand_L').distanceTo(wp('hand_R'));
    const slack = meshW - handSpan;
    check('the skin follows the skeleton', slack <= 0.5,
      `mesh ${fixed(meshW, 2)} m wide vs ${fixed(handSpan, 2)} m hand span`,
      '≤ 0.5 m wider than the hands');
  }
}

/* ── 3. the bind pose ─────────────────────────────────────────────────────── */

actor.root.updateMatrixWorld(true);
const spine0 = dirOf('hips', 'head');
const across = dirOf('shoulder_L', 'shoulder_R');
check('bind: stands upright', spine0.y >= CFG.spineMin,
  `hips→head y ${fixed(spine0.y, 2)}`, `≥ ${CFG.spineMin}`);
check('bind: shoulders run across X', Math.abs(across.x) > 0.9,
  `x ${fixed(across.x, 2)}`, '|x| > 0.9');
// Compare each segment to the direction the SPEC puts it in, not to -Y. Most
// limb segments do hang along -Y, but hips→upperLeg is [±0.10, -0.02, 0] —
// mostly sideways — and demanding it point down would fail a correct rig.
// Only the segments the rest pose actually constrains. A canonical asset keeps
// its own proportions — a Mixamo shoulder does not sit where the spec's does,
// and the mesh is skinned to where it is — so spine_upper→shoulder is a
// proportion, not a pose, and checking it against the spec offset would fail a
// correct rig. What the contract constrains is that the limbs HANG.
// Against each segment's OWN spec direction, not against -Y. The arms rest 10°
// out from vertical because a shoulder joint sits inboard of the arm and a
// perfectly vertical arm passes through the ribcage — see docs/specs/rig.mjs.
const SPEC_DIR = new Map(JOINTS.filter(j => j.parent)
  .map(j => [j.name, new THREE.Vector3(...j.offset).normalize()]));
for (const [a, b] of LIMBS) {
  const want = SPEC_DIR.get(b);
  const d = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(dirOf(a, b).dot(want), -1, 1)));
  check(`bind: ${a}→${b}`, d <= CFG.limbMax, `${fixed(d)}° off spec`, `≤ ${CFG.limbMax}°`);
}

// The check that would have caught arms buried in the torso. A skeleton can be
// exactly on spec while the character's hands sit inside her own body, because
// the spec's proportions are not the mesh's. Measured, not assumed: the hand
// must be at least as far from the midline as the mesh is wide.
{
  const b = meshBoundsX(readGlb(asset).json);
  if (b) {
    // From the mesh's OWN centre, not from x=0 — nothing centres the character
    // horizontally, so measuring against the origin reports a half-width that is
    // really an offset.
    const mid = (b.min + b.max) / 2;
    const half = (b.max - b.min) / 2;
    const reach = Math.min(Math.abs(wp('hand_L').x - mid), Math.abs(wp('hand_R').x - mid));
    check('arms clear the torso', reach >= half * 0.7,
      `hand ${fixed(reach, 3)} m from centre vs ${fixed(half, 3)} m half-width`,
      '≥ 70% of half-width');
  }
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

// Ground truth is the code-built character: the clips were hand-authored
// against it, so "correct" means the forged rig lands where that one lands.
// An absolute threshold cannot express that — `cast` legitimately puts an arm
// overhead, and no fixed angle from -Y distinguishes that from an inversion.
const ref = buildActor({ id: CFG.id, faction: 'ally', uniforms: makeActorUniforms(), material: makeActorMaterial(makeActorUniforms()) });
const refBone = new Map(SPEC_BONES.map(n => [n, ref.boneByName?.get(n) ?? null]));
const haveRef = [...refBone.values()].every(Boolean);
check('code-built reference available', haveRef,
  haveRef ? 'built' : 'missing bones', 'a reference rig to compare against');

const refWp = (n) => refBone.get(n).getWorldPosition(new THREE.Vector3());
const refDir = (a, b) => refWp(b).sub(refWp(a)).normalize();

for (const clip of CFG.clips) {
  if (!POSE_NAMES.includes(clip)) { check(`clip "${clip}" exists`, false, 'unknown', POSE_NAMES.join('|')); continue; }
  if (!applyClip(clip, CFG.t)) { check(`clip "${clip}" samples`, false, 'null', 'a pose'); continue; }

  const s = dirOf('hips', 'head');
  check(`${clip}: upright`, s.y >= CFG.spineMin, `hips→head y ${fixed(s.y, 2)}`, `≥ ${CFG.spineMin}`);
  if (!haveRef) continue;

  // Same clip, same instant, on the authored rig.
  const pose = samplePose(clip, CFG.t);
  for (const bone of refBone.values()) bone.rotation.set(0, 0, 0);
  for (const [name, [x, y, z]] of Object.entries(pose.j ?? {})) refBone.get(name)?.rotation.set(x, y, z);
  ref.root.updateMatrixWorld(true);

  // Orientation, not position. The forged rig and the authored one have
  // different proportions — a Mixamo shoulder does not sit where the spec's
  // does — so their joints are in different PLACES by design. What the
  // retarget owes us is the same ORIENTATION, which is what deforms the skin.
  // Segment DIRECTION, not world quaternion: two rigs can point a bone the same
  // way with a different roll about its own axis, and that roll is a rigging
  // convention rather than a pose difference. Direction is what the eye reads.
  // Restricted to LIMBS, because segments like spine_upper→shoulder encode the
  // rig's proportions rather than the clip's pose.
  const worst = LIMBS.map(([a, b]) => ({
    j: `${a}→${b}`,
    d: THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(dirOf(a, b).dot(refDir(a, b)), -1, 1))),
  })).sort((x, y) => y.d - x.d)[0];
  check(`${clip}: matches the authored pose`, worst.d <= CFG.matchMax,
    `worst ${worst.j} ${fixed(worst.d)}° off`, `≤ ${CFG.matchMax}°`);
}

/* ── 5. in-game capture, on request ───────────────────────────────────────── */
//
// Kept separate from the measurements above on purpose. Everything before this
// point is a number and runs anywhere; this needs a dev server and a GPU, and
// produces a picture rather than a verdict. A picture is still worth having —
// the numbers say a limb is 179° from -Y, the picture says her arms are over
// her head — but it must never be what the probe depends on.

if (CFG.shot) {
  const shot = path.join(REPO, 'docs', 'phase2-retry', 'tools', 'ingame.mjs');
  const outDir = path.isAbsolute(CFG.shotOut) ? CFG.shotOut : path.join(REPO, CFG.shotOut);
  try {
    const log = execFileSync('node', [shot,
      '--forge', CFG.id, '--port', String(CFG.shotPort), '--out', outDir,
    ], { encoding: 'utf8', cwd: REPO });
    const loaded = /\[forge\] console:/.test(log) && !/error:/.test(log);
    const file = (log.match(/wrote (.+)$/m) ?? [])[1] ?? '(none)';
    check('in-game: the forged glb loaded', loaded,
      loaded ? 'swapped onto the actor' : 'fell back to code-built', 'the glb on screen');
    check('in-game: screenshot captured', fs.existsSync(file),
      path.relative(REPO, file), 'a png');
  } catch (e) {
    check('in-game: capture ran', false,
      `${e.message.split('\n')[0]} — is the dev server up on :${CFG.shotPort}?`, 'a capture');
  }
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
    console.log('\n"matches the authored pose" compares the forged rig against the code-built');
    console.log('one under the same clip at the same instant. A large divergence means the');
    console.log('retarget in src/actors/gltf-actor.js is composing wrongly, or the asset was');
    console.log('not canonicalised — see docs/phase2-retry/CONTRACT.md.');
  }
}
process.exit(failed.length ? 1 : 0);
