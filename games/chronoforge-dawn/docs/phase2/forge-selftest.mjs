#!/usr/bin/env node
// forge-selftest.mjs — the gate for src/actors/gltf-actor.js.
//
//   node docs/phase2/forge-selftest.mjs
//   node docs/phase2/forge-selftest.mjs --keep      # leave out/ in place
//
// No glb exists yet: generating one is a ~15-minute Hunyuan pass followed by an
// auto-rig that has never been run on this machine. So the asset is
// synthesised. This writes a spec-conformant rigged glb into out/ carrying
// everything the loader must survive:
//
//   • 19 bones under names the engine has never seen (`Bip01_L_Forearm`)
//   • an A-pose bind, 45° at both shoulders, as the reference images are drawn
//   • 3.7× scale and an origin 1.3 / 0.45 / −2.1 off, so nothing passes by
//     landing on a default
//   • an armature root yawed 180°, facing the character the wrong way
//   • an UNMAPPED twist bone between spine_lower and spine_upper — a generated
//     rig carries bones the spec does not, and the bind solver's parent term is
//     what handles them
//
// then parses it through the browser's own GLTFLoader and asserts the map, the
// normalisation and the bind delta against values computed here by a second
// route. Node only: no browser, no network, no renderer, no WebGL.
//
// Exit code is the gate: 0 all-pass, 1 otherwise.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { JOINTS, SOCKETS } from '../specs/rig.mjs';
import { HERO_M } from '../../src/core/const.js';
import { buildActor } from '../../src/actors/rig.js';
import { makeActorUniforms, makeActorMaterial } from '../../src/actors/material.js';
import { Animator, samplePose } from '../../src/actors/poses.js';
import { groundActor, footError } from '../../src/actors/ground.js';
import {
  applyGltfActor, suggestBoneMap, bindBox, SPEC_BONES,
} from '../../src/actors/gltf-actor.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const GLB = path.join(OUT, 'kaida-synthetic.glb');
const KEEP = process.argv.includes('--keep');

/* Every one of these is wrong in a way the loader must correct. None is 0, 1
   or 1.72. */
const S = 3.7;                       // scale error
const OFFSET = [1.3, 0.45, -2.1];    // origin error
const YAW = Math.PI;                 // facing error — the glb faces −Z
const APOSE = Math.PI / 4;           // 45°, per docs/phase2/reference-manifest.json
const R = 0.05 * S;                  // half-extent of each bone's box
const TWIST = { y: 0.11, ry: 0.19 }; // the unmapped bone, and its rest rotation

/** 3ds Max biped names: neither the spec's convention nor Mixamo's, so nothing
 *  in src/ can resolve them without the map. */
const GLB_NAME = {
  hips: 'Bip01_Pelvis', spine_lower: 'Bip01_Spine', spine_upper: 'Bip01_Spine2',
  neck: 'Bip01_Neck', head: 'Bip01_Head',
  shoulder_L: 'Bip01_L_Clavicle', upperArm_L: 'Bip01_L_UpperArm',
  lowerArm_L: 'Bip01_L_Forearm', hand_L: 'Bip01_L_Hand',
  shoulder_R: 'Bip01_R_Clavicle', upperArm_R: 'Bip01_R_UpperArm',
  lowerArm_R: 'Bip01_R_Forearm', hand_R: 'Bip01_R_Hand',
  upperLeg_L: 'Bip01_L_Thigh', lowerLeg_L: 'Bip01_L_Calf', foot_L: 'Bip01_L_Foot',
  upperLeg_R: 'Bip01_R_Thigh', lowerLeg_R: 'Bip01_R_Calf', foot_R: 'Bip01_R_Foot',
};
const TWIST_NAME = 'Bip01_Spine_Twist';

/* ── assertions ──────────────────────────────────────────────────────────── */

let passed = 0;
const failures = [];

function ok(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}${detail ? `  ${detail}` : ''}`); return true; }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`  ✗ ${name}${detail ? `  ${detail}` : ''}`);
  return false;
}

const near = (a, b, eps) => Math.abs(a - b) <= eps;

function okNear(name, a, b, eps) {
  return ok(name, near(a, b, eps), `${fmt(a)} vs ${fmt(b)} (±${eps})`);
}

/** Quaternion equality up to sign. q and −q are the same rotation, and which a
 *  decomposition returns is not a fact about the pose. */
function qNear(a, b, eps = 1e-5) { return Math.abs(Math.abs(a.dot(b)) - 1) <= eps; }

const fmt = (v) => (typeof v === 'number' ? (Math.abs(v) < 1e4 ? v.toFixed(5) : v.toExponential(3)) : String(v));

/* ── minimal glTF 2.0 binary writer ──────────────────────────────────────────
   No dependencies, as ref-gen.mjs inlines its PNG codec. Only what a rigged
   character needs: one skinned primitive, one skin, one material. */

class Bin {
  constructor() { this.parts = []; this.len = 0; this.views = []; this.accessors = []; }
  #pad() { const n = (4 - (this.len % 4)) % 4; if (n) { this.parts.push(Buffer.alloc(n)); this.len += n; } }
  view(buf, target) {
    this.#pad();
    const v = { buffer: 0, byteOffset: this.len, byteLength: buf.length };
    if (target) v.target = target;
    this.parts.push(buf); this.len += buf.length;
    this.views.push(v);
    return this.views.length - 1;
  }
  accessor(a) { this.accessors.push(a); return this.accessors.length - 1; }
  bytes() { this.#pad(); return Buffer.concat(this.parts); }
}

const buf = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);

function writeGlb(json, bin) {
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20);
  const binPad = Buffer.alloc((4 - (bin.length % 4)) % 4, 0);
  const chunk = (data, pad, type) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length + pad.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, data, pad]);
  };
  const c0 = chunk(jsonBuf, jsonPad, 0x4e4f534a);   // 'JSON'
  const c1 = chunk(bin, binPad, 0x004e4942);        // 'BIN\0'
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);              // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + c0.length + c1.length, 8);
  return Buffer.concat([header, c0, c1]);
}

/* ── build the synthetic character ───────────────────────────────────────── */

const CUBE = [
  0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1,
  1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
];
const CORNERS = [
  [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1],
  [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1],
];

function buildSynthetic() {
  /* Built with three, so the bind matrices come out of the same maths the
     loader uses rather than out of hand-written FK. */
  const armature = new THREE.Object3D();
  armature.name = 'Armature';
  armature.position.fromArray(OFFSET);
  armature.rotation.y = YAW;
  armature.scale.setScalar(S);

  const node = new Map();
  for (const j of JOINTS) {
    const o = new THREE.Object3D();
    o.name = GLB_NAME[j.name];
    o.position.fromArray(j.offset);
    node.set(j.name, o);
  }
  /* A-pose, both arms 45° out. shoulder_L sits at +X, so a positive rotation
     about Z swings its −Y child outward; the right side mirrors. The pose
     reference-manifest.json prompts for. */
  node.get('shoulder_L').rotation.z = APOSE;
  node.get('shoulder_R').rotation.z = -APOSE;

  /* The unmapped twist takes half of spine_upper's rise and carries a rest
     rotation, so the solver's B(actual parent) term is not identity. */
  const twist = new THREE.Object3D();
  twist.name = TWIST_NAME;
  twist.position.set(0, TWIST.y, 0);
  twist.rotation.y = TWIST.ry;
  node.get('spine_upper').position.set(0, 0.22 - TWIST.y, 0);

  armature.add(node.get('hips'));
  for (const j of JOINTS) {
    if (!j.parent) continue;
    if (j.name === 'spine_upper') { node.get('spine_lower').add(twist); twist.add(node.get('spine_upper')); }
    else node.get(j.parent).add(node.get(j.name));
  }
  armature.updateMatrixWorld(true);

  /* Flatten to glTF node order. */
  const order = [];
  (function walk(o) { order.push(o); for (const c of o.children) walk(c); })(armature);
  const idxOf = new Map(order.map((o, i) => [o, i]));

  const nodes = order.map((o) => {
    const n = { name: o.name };
    if (o.position.lengthSq() > 0) n.translation = o.position.toArray();
    if (Math.abs(o.quaternion.w - 1) > 1e-12) n.rotation = o.quaternion.toArray();
    if (Math.abs(o.scale.x - 1) > 1e-12) n.scale = o.scale.toArray();
    if (o.children.length) n.children = o.children.map(c => idxOf.get(c));
    return n;
  });

  /* The 19 spec bones AND the twist: an auto-rigger skins to everything it
     emits, and the loader must tolerate joints it cannot map. */
  const jointObjs = [...JOINTS.map(j => node.get(j.name)), twist];
  const joints = jointObjs.map(o => idxOf.get(o));

  /* One box per spec bone, in glb scene space, rigid-weighted to that bone.
     Transforms are what is under test; a smooth weight would only blur it. */
  const pos = [], jnt = [], wgt = [], idx = [];
  const p = new THREE.Vector3();
  JOINTS.forEach((j, ji) => {
    const o = node.get(j.name);
    o.getWorldPosition(p);
    const base = pos.length / 3;
    for (const c of CORNERS) {
      pos.push(p.x + c[0] * R, p.y + c[1] * R, p.z + c[2] * R);
      jnt.push(ji, 0, 0, 0);
      wgt.push(1, 0, 0, 0);
    }
    for (const i of CUBE) idx.push(base + i);
  });

  const positions = new Float32Array(pos);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], positions[i + a]);
      max[a] = Math.max(max[a], positions[i + a]);
    }
  }

  const ibm = new Float32Array(jointObjs.length * 16);
  const inv = new THREE.Matrix4();
  jointObjs.forEach((o, i) => { inv.copy(o.matrixWorld).invert(); ibm.set(inv.elements, i * 16); });

  const bin = new Bin();
  const aPos = bin.accessor({
    bufferView: bin.view(buf(positions), 34962), componentType: 5126,
    count: positions.length / 3, type: 'VEC3', min, max,
  });
  const aJnt = bin.accessor({
    bufferView: bin.view(buf(new Uint16Array(jnt)), 34962), componentType: 5123,
    count: jnt.length / 4, type: 'VEC4',
  });
  const aWgt = bin.accessor({
    bufferView: bin.view(buf(new Float32Array(wgt)), 34962), componentType: 5126,
    count: wgt.length / 4, type: 'VEC4',
  });
  const aIdx = bin.accessor({
    bufferView: bin.view(buf(new Uint32Array(idx)), 34963), componentType: 5125,
    count: idx.length, type: 'SCALAR',
  });
  const aIbm = bin.accessor({
    bufferView: bin.view(buf(ibm)), componentType: 5126,
    count: jointObjs.length, type: 'MAT4',
  });

  const meshNodeIndex = nodes.length;
  nodes.push({ name: 'kaida_synthetic', mesh: 0, skin: 0 });

  const binBytes = bin.bytes();
  const json = {
    asset: { version: '2.0', generator: 'chronoforge-dawn/forge-selftest' },
    scene: 0,
    scenes: [{ nodes: [0, meshNodeIndex] }],
    nodes,
    meshes: [{
      name: 'kaida_synthetic',
      primitives: [{
        attributes: { POSITION: aPos, JOINTS_0: aJnt, WEIGHTS_0: aWgt },
        indices: aIdx, material: 0,
      }],
    }],
    materials: [{
      name: 'synthetic',
      pbrMetallicRoughness: { baseColorFactor: [0.72, 0.68, 0.74, 1], metallicFactor: 0, roughnessFactor: 0.9 },
    }],
    skins: [{ name: 'synthetic', joints, inverseBindMatrices: aIbm, skeleton: 0 }],
    accessors: bin.accessors,
    bufferViews: bin.views,
    buffers: [{ byteLength: binBytes.length }],
  };

  /* Expectations, computed from the vertex array and the three scene — a
     second route to the numbers the loader reports from the parsed glb. */
  const rawHeight = max[1] - min[1];
  const k = HERO_M / rawHeight;
  const ankleY = node.get('foot_L').getWorldPosition(new THREE.Vector3()).y;
  const expect = {
    rawHeight,
    scale: k,
    minY: min[1],
    centreX: (min[0] + max[0]) / 2,
    centreZ: (min[2] + max[2]) / 2,
    sole: (ankleY - min[1]) * k,
    thigh: 0.42 * S * k,
    shin: 0.46 * S * k,
  };

  return { glb: writeGlb(json, binBytes), expect, boneNames: [...Object.values(GLB_NAME), TWIST_NAME] };
}

/* ── loading ─────────────────────────────────────────────────────────────── */

const loader = new GLTFLoader();

function parseGlb(bytes) {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((res, rej) => loader.parse(ab, '', res, rej));
}

function makeMap(extra = {}) {
  return {
    name: 'kaida', reviewed: true, faceYawDeg: 0,
    bones: { ...GLB_NAME }, ...extra,
  };
}

function newActor() {
  const uniforms = makeActorUniforms();
  const material = makeActorMaterial(uniforms, { name: 'selftest-shared' });
  return { actor: buildActor({ id: 'kaida', faction: 'ally', uniforms, material }), material };
}

/** The reference for every model-space comparison. Built from the spec table
 *  rather than from rig.js, so a bug in the shell authoring cannot mask one in
 *  the retarget. */
function specReference(poseName, t) {
  const root = new THREE.Group();
  const byName = new Map();
  for (const j of JOINTS) {
    const b = new THREE.Bone();
    b.name = j.name;
    b.position.fromArray(j.offset);
    byName.set(j.name, b);
  }
  for (const j of JOINTS) if (j.parent) byName.get(j.parent).add(byName.get(j.name));
  root.add(byName.get('hips'));
  const p = poseName ? samplePose(poseName, t) : { j: {} };
  for (const [name, b] of byName) {
    const r = p.j[name];
    b.rotation.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0);
  }
  root.updateMatrixWorld(true);
  return { root, byName, pose: p };
}

const worldQ = (o) => o.getWorldQuaternion(new THREE.Quaternion());

/* ── the run ─────────────────────────────────────────────────────────────── */

console.log('forge-selftest — synthetic rigged glb, no browser, no network\n');

const { glb, expect, boneNames } = buildSynthetic();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(GLB, glb);
console.log(`synthetic glb: ${path.relative(process.cwd(), GLB)}  ${(glb.length / 1024).toFixed(1)} KB`);
console.log(`  authored at ${expect.rawHeight.toFixed(3)} m tall, origin offset ${OFFSET.join(', ')}, yaw ${(YAW * 180 / Math.PI).toFixed(0)}°, A-pose ${(APOSE * 180 / Math.PI).toFixed(0)}°\n`);

/* ── 1. bone map ─────────────────────────────────────────────────────────── */
console.log('1. bone map');
{
  const s = suggestBoneMap(boneNames);
  const wrong = SPEC_BONES.filter(n => s[n] !== GLB_NAME[n]);
  ok('suggestBoneMap recovers all 19 from unseen names', wrong.length === 0,
    wrong.length ? `wrong: ${wrong.map(n => `${n}→${s[n] ?? '∅'}`).join(', ')}` : `${Object.keys(s).length}/19`);
  ok('the unmapped twist bone is left unmapped', !Object.values(s).includes(TWIST_NAME));
}

/* an incomplete map is a hard stop, never a guess */
{
  const gltf = await parseGlb(glb);
  const { actor } = newActor();
  let threw = null;
  try { applyGltfActor(actor, gltf.scene, { bones: { hips: GLB_NAME.hips } }); } catch (e) { threw = e; }
  ok('an incomplete bones.json throws, never half-maps', !!threw);
  ok('the error names the missing bones and the glb\'s own', !!threw &&
    threw.message.includes('spine_lower') && threw.message.includes(TWIST_NAME));
}

/* ── 2. normalisation ─────────────────────────────────────────────────────── */
console.log('\n2. scale normalisation');
let A = null;
{
  const gltf = await parseGlb(glb);
  const { actor, material } = newActor();
  A = applyGltfActor(actor, gltf.scene, makeMap());

  ok('source is a glb', A.source === 'gltf');
  okNear('measured source height', A.sourceHeightM, expect.rawHeight, 1e-4);
  ok('source height is wrong on purpose', A.sourceHeightM > 5, `${A.sourceHeightM.toFixed(3)} m`);
  okNear('normalisation factor', A.rigScale, expect.scale, 1e-6);

  /* The weapon hangs off a socket on a bone inside the group, and is authored
     in rig metres. normaliseRig measures before the sockets are mounted; this
     measures after, so lift it out or the assertion is about the sword. */
  const wp = A.weapon?.parent;
  if (wp) wp.remove(A.weapon);
  const box = bindBox(A._forge.group, A.root, new THREE.Box3());
  if (wp) wp.add(A.weapon);
  okNear('normalised height is HERO_M', box.max.y - box.min.y, HERO_M, 1e-4);
  okNear('lowest point sits on y = 0', box.min.y, 0, 1e-4);
  okNear('centred in x', (box.min.x + box.max.x) / 2, 0, 1e-4);
  okNear('centred in z', (box.min.z + box.max.z) / 2, 0, 1e-4);

  ok('not the shared actor material — uBands bypassed',
    A.mesh.material !== material && A.mesh.material.userData.actorUniforms === undefined);
  ok('material is a plain MeshStandardMaterial', A.mesh.material.type === 'MeshStandardMaterial');
  ok('Part isolation is off — a glb has no aPart', Object.keys(A.partRanges).length === 0);
}

/* ── 3. measured legs, against ground.js's constants ──────────────────────── */
console.log('\n3. ankle-to-sole and leg links, measured');
{
  okNear('ankle-to-sole', A.soleM, expect.sole, 1e-4);
  okNear('thigh', A.limb.thigh, expect.thigh, 1e-4);
  okNear('shin', A.limb.shin, expect.shin, 1e-4);
  ok('measured sole differs from ground.js\'s SOLE = 0.08',
    Math.abs(A.soleM - 0.08) > 0.02, `${A.soleM.toFixed(4)} vs 0.08`);
}

/* ── 4. bind delta, absolute ──────────────────────────────────────────────── */
console.log('\n4. bind delta — absolute (default)');
{
  ok('retarget is in absolute mode', A.retarget.mode === 'absolute');

  for (const b of A.bones) A.retarget.set(b, 0, 0, 0);
  A.root.updateMatrixWorld(true);
  const bad = A.bones.filter(b => !qNear(A.retarget.modelRotation(b), new THREE.Quaternion(), 1e-6));
  ok('unposed clip → spec bind, not the A-pose', bad.length === 0,
    bad.length ? bad.map(b => b.name).join(', ') : '19/19');

  const ref = specReference('victory', 0.9);
  for (const b of A.bones) {
    const r = ref.pose.j[b.name];
    A.retarget.set(b, r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0);
  }
  A.root.updateMatrixWorld(true);
  const off = A.bones.filter(b => !qNear(A.retarget.modelRotation(b), worldQ(ref.byName.get(b.name)), 1e-5));
  ok('posed clip → code-built model rotations', off.length === 0,
    off.length ? off.map(b => b.name).join(', ') : '19/19 under victory@0.9');

  /* ground.js's `bone.rotation.x += d`, through the retarget. A post-multiply
     in the glb's own bone frame passes every assertion above and still bends
     the knee about the wrong axis. */
  const knee = A.boneByName.get('lowerLeg_L');
  A.retarget.add(knee, 'x', 0.21);
  A.root.updateMatrixWorld(true);
  ref.byName.get('lowerLeg_L').rotation.x += 0.21;
  ref.root.updateMatrixWorld(true);
  ok('retarget.add matches `rotation.x +=` on the code-built rig',
    qNear(A.retarget.modelRotation(knee), worldQ(ref.byName.get('lowerLeg_L')), 1e-5));
  ok('add carries down the chain to the foot',
    qNear(A.retarget.modelRotation(A.boneByName.get('foot_L')), worldQ(ref.byName.get('foot_L')), 1e-5));
}

/* ── 5. bind delta, additive ──────────────────────────────────────────────── */
console.log('\n5. bind delta — additive (bindMode in bones.json)');
{
  const gltf = await parseGlb(glb);
  const { actor } = newActor();
  const rest = new Map();
  gltf.scene.traverse(o => { if (o.isBone) rest.set(o.name, o.quaternion.clone()); });

  const B = applyGltfActor(actor, gltf.scene, makeMap({ bindMode: 'additive' }));
  ok('retarget is in additive mode', B.retarget.mode === 'additive');

  for (const b of B.bones) B.retarget.set(b, 0, 0, 0);
  B.root.updateMatrixWorld(true);
  const drift = B.bones.filter(b => !qNear(b.quaternion, rest.get(b.userData.gltfName), 1e-9));
  ok('unposed clip → the glb\'s own bind, exactly', drift.length === 0,
    drift.length ? drift.map(b => b.name).join(', ') : '19/19');

  const ref = specReference('run', 0.31);
  for (const b of B.bones) {
    const r = ref.pose.j[b.name];
    B.retarget.set(b, r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0);
  }
  B.root.updateMatrixWorld(true);
  const off = B.bones.filter((b) => {
    const w = B.retarget.modelRotation(b).multiply(B.retarget.bind(b).clone().invert());
    return !qNear(w, worldQ(ref.byName.get(b.name)), 1e-5);
  });
  ok('posed clip → code-built delta on the glb bind', off.length === 0,
    off.length ? off.map(b => b.name).join(', ') : '19/19 under run@0.31');
}

/* ── 6. sockets ───────────────────────────────────────────────────────────── */
console.log('\n6. sockets');
{
  const gltf = await parseGlb(glb);
  const { actor } = newActor();
  const C = applyGltfActor(actor, gltf.scene, makeMap());
  C.root.updateMatrixWorld(true);

  const head = C.sockets.head;
  const s = head.getWorldScale(new THREE.Vector3());
  okNear('socket world scale is 1 despite the 3.7× source', s.x, 1, 1e-5);
  ok('a socket is model-axis aligned at bind', qNear(worldQ(head), new THREE.Quaternion(), 1e-5));

  const hp = C.boneByName.get('head').getWorldPosition(new THREE.Vector3());
  const sp = head.getWorldPosition(new THREE.Vector3());
  okNear('socket.head sits at the spec offset above the head bone',
    sp.y - hp.y, SOCKETS.head.offset[1], 1e-5);

  const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  ok('the hand socket keeps rig.js\'s +Y-to-tip flip',
    qNear(worldQ(C.sockets.weapon), flip, 1e-5));
  ok('the weapon survives the swap and stays mounted', C.weapon?.parent === C.sockets.weapon);
}

/* ── 7. ground contact ───────────────────────────────────────────────────── */
console.log('\n7. ground contact');
{
  const flat = {
    heightAt: () => 0,
    normalAt: (_x, _z, out) => out.set(0, 1, 0),
  };
  /* A frozen clip, re-applied every step. The IK is a damped follower: against
     a moving idle it trails by millimetres forever and the threshold below
     measures the half-life rather than the solve. Held at t = 0 it has a fixed
     point, and 300 steps is ~55 half-lives from it. */
  const settle = (a) => {
    const anim = new Animator(a);
    a.anim = anim;
    anim.clip = 'idle'; anim.t = 0; anim.blend = 1; anim.prev = null;
    const dt = 1 / 120;
    for (let i = 0; i < 300; i++) {
      anim.apply();
      a.root.position.set(0, 0, 0);
      a.root.rotation.y = 0;
      a.root.scale.setScalar(a.scale);
      groundActor(a, flat, dt);
    }
    const e = footError(a, flat);
    return Math.max(Math.abs(e.L), Math.abs(e.R));
  };

  const { actor: codeActor } = newActor();
  const codeErr = settle(codeActor);

  const gltf = await parseGlb(glb);
  const { actor } = newActor();
  const D = applyGltfActor(actor, gltf.scene, makeMap());
  const forgeErr = settle(D);

  /* Relative to the code-built rig, not against an absolute number: ground.js
     carries a ~4.7 mm standing residual at `idle` from its wantSpan clamp,
     which is recorded there and is not this file's to litigate. The claim under
     test is that a forged rig on its measured sole and measured leg links
     plants no worse than the rig Phase 2.4 already gated. */
  ok('code-built rig still plants', codeErr < 0.02, `${codeErr.toFixed(4)} m residual`);
  ok('forged rig plants no worse than code-built', forgeErr < codeErr + 0.0015,
    `forged ${forgeErr.toFixed(4)} m vs code-built ${codeErr.toFixed(4)} m`);
  ok('a hardcoded SOLE would have sunk it',
    Math.abs(0.08 - D.soleM) > 0.02, `${((0.08 - D.soleM) * 1000).toFixed(0)} mm of constant error`);
}

/* ── 8. the code-built path ──────────────────────────────────────────────── */
console.log('\n8. the code-built path');
{
  const { actor: a } = newActor();
  ok('an unflagged actor is code-built', a.source === 'code');
  ok('no retarget — poses.js writes straight to the bone', !a.retarget);
  ok('no measured sole — ground.js falls back to the spec', a.soleM === undefined);
  ok('still carries aPart for Part isolation', !!a.mesh.geometry.getAttribute('aPart'));
  ok('still 19 bones and its part ranges', a.bones.length === 19 && !!a.partRanges.head);
  const anim = new Animator(a);
  anim.play('victory', { fade: 0 });
  anim.update(0.4);
  const ref = specReference('victory', 0.4);
  a.root.updateMatrixWorld(true);
  const off = a.bones.filter(b => !qNear(worldQ(b), worldQ(ref.byName.get(b.name)), 1e-6));
  ok('still poses exactly as the spec table says', off.length === 0,
    off.length ? off.map(b => b.name).join(', ') : '19/19');
}

/* ── report ──────────────────────────────────────────────────────────────── */

if (!KEEP) fs.rmSync(OUT, { recursive: true, force: true });
else console.log(`\nkept ${path.relative(process.cwd(), OUT)}/`);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFAILED:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('forge-selftest: OK');
