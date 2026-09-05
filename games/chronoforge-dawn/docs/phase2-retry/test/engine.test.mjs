#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Does the ENGINE load a contract asset correctly? Node only — no browser, no
// renderer, no WebGL. Drives the real src/actors code against the real glb.
//
//   node docs/phase2-retry/test/engine.test.mjs [asset.glb]
//
// The gate proves the pipeline PRODUCES a contract asset. This proves the
// engine CONSUMES one, which is the other half and the half a screenshot
// cannot check precisely.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { HERO_M } from '../../../src/core/const.js';
import { buildActor } from '../../../src/actors/rig.js';
import { makeActorUniforms, makeActorMaterial } from '../../../src/actors/material.js';
import { applyGltfActor, SPEC_BONES } from '../../../src/actors/gltf-actor.js';
import { samplePose } from '../../../src/actors/poses.js';

// GLTFLoader resolves texture images through browser globals it assumes exist.
// This harness has no DOM and does not test materials, so give it the minimum
// rather than swapping in a different loader — testing a loader the game does
// not use would prove nothing about the game.
globalThis.self = globalThis;
globalThis.URL.createObjectURL ??= () => 'blob:stub';
globalThis.URL.revokeObjectURL ??= () => {};
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

const HERE = path.dirname(fileURLToPath(import.meta.url));
const asset = process.argv[2] || path.join(HERE, '..', '..', '..', 'assets', 'kaida.glb');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? `  ${detail}` : ''}`); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

if (!fs.existsSync(asset)) {
  console.error(`no asset at ${asset} — run the pipeline's install stage first`);
  process.exit(2);
}
console.log(`engine test · ${path.relative(process.cwd(), asset)}\n`);

const gltf = await new GLTFLoader().parseAsync(fs.readFileSync(asset).buffer, '');

const uniforms = makeActorUniforms();
const actor = buildActor({ id: 'kaida', faction: 'ally', uniforms, material: makeActorMaterial(uniforms) });

// 1. The engine accepts it with no bone map, no mode flag, no configuration.
let applied = null;
try { applied = applyGltfActor(actor, gltf.scene); }
catch (e) { console.log(`  ✗ applyGltfActor threw\n      ${e.message.split('\n')[0]}`); fail++; }
ok('loads with no bones.json and no bindMode', !!applied);

if (applied) {
  // 2. Every spec joint resolved by name alone.
  const found = SPEC_BONES.filter(n => actor.boneByName?.get(n));
  ok(`resolves ${SPEC_BONES.length}/${SPEC_BONES.length} joints by spec name`,
    found.length === SPEC_BONES.length, `got ${found.length}`);

  // 3. THE assertion that proves canonicalisation earned its place: a contract
  //    asset needs NO rescaling, because the pipeline already put it at HERO_M.
  ok('needs no rescaling — arrives at HERO_M',
    near(actor.rigScale, 1, 0.02), `rigScale ${actor.rigScale?.toFixed(4)}`);
  ok('source height is HERO_M',
    near(actor.sourceHeightM, HERO_M, 0.03), `${actor.sourceHeightM?.toFixed(3)} m`);

  // 4. Ankle-to-sole was measured off the asset, not assumed from a constant.
  ok('ankle-to-sole measured from the asset',
    actor.soleM > 0.02 && actor.soleM < 0.30, `${actor.soleM?.toFixed(3)} m`);

  // 5. The bind IS the spec rest pose, so an unposed clip leaves limbs hanging
  //    along -Y. This is what the old additive/absolute split existed to fudge.
  actor.root.updateMatrixWorld(true);
  const wp = (n) => actor.boneByName.get(n).getWorldPosition(new THREE.Vector3());
  const down = (a, b) => {
    const d = wp(b).sub(wp(a)).normalize();
    return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(d.dot(new THREE.Vector3(0, -1, 0)), -1, 1)));
  };
  const armL = down('upperArm_L', 'lowerArm_L');
  const legL = down('upperLeg_L', 'lowerLeg_L');
  ok('unposed bind hangs the arm along -Y', armL < 8, `${armL.toFixed(1)}° off`);
  ok('unposed bind hangs the leg along -Y', legL < 8, `${legL.toFixed(1)}° off`);

  // 6. A clip actually drives the rig, and moves the bone it names.
  const before = wp('hand_R').clone();
  const pose = samplePose('attack', 0.5);
  for (const [name, [x, y, z]] of Object.entries(pose.j ?? {})) {
    const bone = actor.boneByName.get(name);
    if (bone && actor.retarget) actor.retarget.set(bone, x, y, z);
  }
  actor.root.updateMatrixWorld(true);
  const moved = wp('hand_R').distanceTo(before);
  ok('a clip moves the rig', moved > 0.05, `hand_R moved ${moved.toFixed(3)} m`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
