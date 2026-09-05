import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { JOINTS, SOCKETS } from '../../docs/specs/rig.mjs';
import { HERO_M } from '../core/const.js';

// ─────────────────────────────────────────────────────────────────────────────
// The generated-character loader — Phase 2, "forge" path.
//
// A glb produced by image-to-3D + auto-rig arrives with NONE of the four things
// the engine assumes about a character:
//
//   1. bone names it has never heard of         → a data map, assets/<id>.bones.json
//   2. arbitrary scale and origin               → normalise to HERO_M, feet at y=0
//   3. an A-POSE bind, not the spec's hanging bind → derive a per-bone correction
//   4. no aMat / aPart / aInk attributes        → its own MeshStandardMaterial
//
// This file turns a loaded glb into the SAME actor object buildActor() returns,
// in place, so ground.js, poses.js, index.js and the dev panel keep working
// through the seams they already use. THE CODE-BUILT PATH IS UNTOUCHED: an
// actor only enters here when the forge flag names it, and any failure here
// leaves the code-built character standing.
//
// ── THE BIND DELTA, DERIVED ──────────────────────────────────────────────────
//
// Clips in poses.js write ABSOLUTE local rotations against the spec bind, where
// every bone's rest local rotation is identity — so a clip's "rotate the elbow
// about X" is a rotation about the MODEL X axis. A generated rig's bones sit at
// 45° with arbitrary local axes, so writing a clip quaternion straight onto one
// is meaningless.
//
// Let B(x) be node x's bind rotation in the actor's model space, q(b) the clip's
// absolute spec-space rotation for bone b, and u = b's actual scene parent
// (which may be an UNMAPPED node — twist bones, an armature root — that we never
// animate and which therefore stays at rest).
//
// We want b's posed model rotation to be the bind, then the same model-space
// delta the code-built rig would have produced:
//
//     W(b) = W_spec(b) · B(b)
//
// The parent's posed model rotation is W(u) = W_spec(m) · B(u) for b's mapped
// ancestor m, because every node between m and u keeps its rest local. So
//
//     local(b) = W(u)⁻¹ · W(b) = B(u)⁻¹ · q(b) · B(b)
//
// which is the whole solver: pre = B(parent)⁻¹, post = B(b). Two facts fall out
// of it and both are load-bearing:
//
//   • q = identity gives local = B(u)⁻¹·B(b) = the bone's own rest local. An
//     unposed clip reproduces the glb's bind EXACTLY, for any hierarchy, with
//     no eyeballed Euler offsets anywhere.
//   • W(b)·B(b)⁻¹ = W_spec(b) exactly, so a generated Kaida and a code-built
//     Kaida move identically in model space. That equality is what
//     forge-selftest.mjs asserts.
//
// ── WHY RETARGET INSTEAD OF REWRITING THE SKELETON ───────────────────────────
//
// The tempting alternative is to zero every bone's rest rotation so the local
// frames match the spec, and recompute the bind inverses. That renders the mesh
// correctly at rest and wrong the instant anything moves: the vertices are still
// laid out around the A-posed bones. The correction has to live in the write
// path, not in the skeleton — which is what `retarget` below is.
// ─────────────────────────────────────────────────────────────────────────────

/** The 19 spec bone names, read from the spec rather than retyped. */
export const SPEC_BONES = JOINTS.map(j => j.name);

/** Spec-bone → its spec parent, for reports and for validating a bones.json. */
const SPEC_PARENT = new Map(JOINTS.map(j => [j.name, j.parent]));

/** Sanity band on the measured ankle-to-sole, in rig metres. Outside it the
 *  mesh's lowest point is probably not a boot (a hem, a dropped cape, a stray
 *  vertex) and the ground solve would inherit that error at every slope. */
const SOLE_MIN = 0.02;
const SOLE_MAX = 0.22;

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _box = new THREE.Box3();
const _b3 = new THREE.Box3();
const AXIS = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

/* The flag that selects this path lives in rig.js `forgeRequest()`, so reading
   it costs no bundle. On disk the forge writes to `public/assets/`; in the URL
   that is `assets/` — Vite copies only publicDir into a build, and a
   runtime-fetched glb is not in the module graph, so it cannot live next to
   the source. */

/* ── the bone map ────────────────────────────────────────────────────────────
   DATA. The auto-rigger's names are not knowable until a rigged glb exists, so
   nothing here may assume a convention — `suggestBoneMap` exists only to write
   the FIRST draft of the file and to make the "no map" error actionable. */

/** Collapse a bone name to a comparison key: case, separators and the common
 *  rig prefixes (mixamorig:, Armature|, DEF-, ORG-, bone_) all dropped. */
export function boneKey(name) {
  return String(name)
    .replace(/^.*[:|]/, '')
    .replace(/^(DEF|ORG|MCH)[-_]/i, '')
    .replace(/[\s._-]/g, '')
    .toLowerCase();
}

const SYNONYMS = {
  hips: ['hips', 'hip', 'pelvis', 'root'],
  spine_lower: ['spinelower', 'spine', 'spine1', 'abdomen', 'waist'],
  spine_upper: ['spineupper', 'spine2', 'chest', 'upperchest', 'spine3'],
  neck: ['neck', 'neck1'],
  head: ['head'],
  shoulder: ['shoulder', 'clavicle', 'collar'],
  upperArm: ['upperarm', 'arm', 'upperarm1', 'shoulderarm'],
  lowerArm: ['lowerarm', 'forearm', 'elbow'],
  hand: ['hand', 'wrist'],
  upperLeg: ['upperleg', 'thigh', 'leg', 'hip'],
  lowerLeg: ['lowerleg', 'shin', 'calf', 'knee'],
  foot: ['foot', 'ankle'],
};

/**
 * Best-effort glb-name → spec-name suggestion. NEVER applied silently: it seeds
 * the draft `bones.json` the forge writes and the error text the loader prints.
 * A wrong guess that runs is worse than a hard stop, because it produces a
 * character that is subtly, unfalsifiably wrong at one joint.
 */
export function suggestBoneMap(names) {
  const out = {};
  const taken = new Set();
  const pick = (spec, want, side) => {
    for (const n of names) {
      if (taken.has(n)) continue;
      const k = boneKey(n);
      const sideOk = !side || k.endsWith(side.toLowerCase()) || k.startsWith(side.toLowerCase()) ||
        k.includes(side === 'L' ? 'left' : 'right');
      if (!sideOk) continue;
      const bare = k.replace(/(left|right|_l|_r)/g, '').replace(/[lr]$/, '');
      if (want.includes(bare)) { out[spec] = n; taken.add(n); return; }
    }
  };
  pick('hips', SYNONYMS.hips);
  pick('spine_lower', SYNONYMS.spine_lower);
  pick('spine_upper', SYNONYMS.spine_upper);
  pick('neck', SYNONYMS.neck);
  pick('head', SYNONYMS.head);
  for (const side of ['L', 'R']) {
    for (const part of ['shoulder', 'upperArm', 'lowerArm', 'hand', 'upperLeg', 'lowerLeg', 'foot']) {
      pick(`${part}_${side}`, SYNONYMS[part], side);
    }
  }
  return out;
}

/**
 * Resolve a bones.json against a live skeleton.
 * @returns {{ map: Map<string, THREE.Bone>, missing: string[], names: string[] }}
 */
export function resolveBoneMap(bones, mapJson) {
  const byName = new Map();
  for (const b of bones) byName.set(b.name, b);
  const table = mapJson?.bones || {};
  const map = new Map();
  const missing = [];
  for (const spec of SPEC_BONES) {
    const glbName = table[spec];
    const bone = glbName ? byName.get(glbName) : null;
    if (bone) map.set(spec, bone); else missing.push(spec);
  }
  return { map, missing, names: bones.map(b => b.name) };
}

/* ── measurement ─────────────────────────────────────────────────────────────
   Everything below is measured off the loaded glb. No constant in this file
   describes a character; the only number is HERO_M, imported from core. */

/** Bind bounding box of every mesh under `node`, expressed in `frame` space.
 *  At the bind pose every bone matrix is identity, so a skinned vertex lands at
 *  `mesh.matrixWorld · v` — which makes this the correct box for a SkinnedMesh
 *  without evaluating a single skin weight. */
export function bindBox(node, frame, target = new THREE.Box3()) {
  target.makeEmpty();
  const inv = _m.copy(frame.matrixWorld).invert();
  node.updateMatrixWorld(true);
  node.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    _b3.copy(o.geometry.boundingBox);
    _b3.applyMatrix4(_m2.multiplyMatrices(inv, o.matrixWorld));
    target.union(_b3);
  });
  return target;
}

/** A node's bind rotation and uniform scale in `frame` space. */
function bindOf(node, frame, q = new THREE.Quaternion()) {
  _m.copy(frame.matrixWorld).invert().multiply(node.matrixWorld);
  _m.decompose(_p, q, _s);
  return { q, scale: (_s.x + _s.y + _s.z) / 3 };
}

/**
 * Normalise the loaded rig: HERO_M crown-to-ground, lowest point at y = 0,
 * centred on x/z. `group` is the wrapper the gltf scene hangs under; `frame` is
 * the actor root. Any facing correction (`faceYawDeg` in bones.json) is applied
 * FIRST, so the measurement — and every bind rotation derived from it — is
 * taken in a frame where the character already faces +Z.
 */
export function normaliseRig(group, frame, { faceYawDeg = 0, heightM = HERO_M } = {}) {
  group.position.set(0, 0, 0);
  group.quaternion.identity();
  group.scale.setScalar(1);
  group.rotation.y = THREE.MathUtils.degToRad(faceYawDeg);
  frame.updateMatrixWorld(true);

  const box = bindBox(group, frame, _box);
  const raw = box.max.y - box.min.y;
  if (!(raw > 1e-6)) throw new Error('[forge] loaded mesh has zero height — nothing to normalise');
  const k = heightM / raw;

  group.scale.setScalar(k);
  group.position.set(
    -(box.min.x + box.max.x) * 0.5 * k,
    -box.min.y * k,
    -(box.min.z + box.max.z) * 0.5 * k,
  );
  frame.updateMatrixWorld(true);
  return { scale: k, sourceHeightM: raw, heightM };
}

/**
 * Ankle-to-sole and the two leg-link lengths, in normalised rig metres.
 *
 * ground.js hardcodes SOLE = 0.08 and THIGH/SHIN off the spec table, all three
 * baked into the code-built rest pose. A generated foot matches none of them,
 * and the error is not noise — it is a CONSTANT float or sink at every slope,
 * plus a knee solve asking for a span the leg cannot reach. So measure.
 */
export function measureLegs(boneByName, frame) {
  const wp = (name) => boneByName.get(name).getWorldPosition(new THREE.Vector3())
    .applyMatrix4(_m.copy(frame.matrixWorld).invert());
  const hipL = wp('upperLeg_L'), kneeL = wp('lowerLeg_L'), ankL = wp('foot_L');
  const hipR = wp('upperLeg_R'), kneeR = wp('lowerLeg_R'), ankR = wp('foot_R');
  const thigh = (hipL.distanceTo(kneeL) + hipR.distanceTo(kneeR)) * 0.5;
  const shin = (kneeL.distanceTo(ankL) + kneeR.distanceTo(ankR)) * 0.5;
  /* The sole is the lowest point of the normalised rig, which normaliseRig has
     already put at y = 0 — so the ankle's own height IS the ankle-to-sole. Take
     the LOWER ankle: that is the foot the lowest point belongs to. */
  const sole = Math.min(ankL.y, ankR.y);
  return { thigh, shin, sole };
}

/* ── the retarget ────────────────────────────────────────────────────────────
   The write path every spec-space rotation goes through. poses.js and ground.js
   call it instead of touching bone.rotation, and only when `actor.retarget`
   exists — which is only ever true for a generated character. */

export function makeRetarget(boneByName, frame) {
  const pre = new Map();
  const post = new Map();
  frame.updateMatrixWorld(true);

  for (const [spec, bone] of boneByName) {
    const B = bindOf(bone, frame, new THREE.Quaternion()).q.clone();
    const parent = bone.parent;
    const Bu = parent ? bindOf(parent, frame, new THREE.Quaternion()).q.clone() : new THREE.Quaternion();
    pre.set(bone, Bu.clone().invert());
    post.set(bone, B);
    bone.userData.qSpec = new THREE.Quaternion();
    bone.userData.specName = spec;
  }

  const write = (bone) => {
    const p = pre.get(bone), q = post.get(bone);
    if (!p) return;
    bone.quaternion.copy(p).multiply(bone.userData.qSpec).multiply(q);
  };

  return {
    /** Absolute spec-space Euler, as poses.js authors it. */
    set(bone, x, y, z) {
      if (!pre.has(bone)) return;
      bone.userData.qSpec.setFromEuler(_e.set(x, y, z, 'XYZ'));
      write(bone);
    },
    /**
     * `bone.rotation.x += d`, in the spec frame.
     *
     * On an XYZ Euler that is a PRE-multiply — Rx(x+d)·Ry·Rz = Rx(d)·(Rx·Ry·Rz)
     * — so it is a rotation in the PARENT's frame, and in the spec bind every
     * parent frame is the model frame. That is exactly the axis ground.js
     * means by "flex the knee about X", and it is why this must not be a
     * post-multiply in the glb's own bone frame.
     */
    add(bone, axis, angle) {
      if (!pre.has(bone) || !angle) return;
      _q2.setFromAxisAngle(AXIS[axis], angle);
      bone.userData.qSpec.premultiply(_q2);
      write(bone);
    },
    /** Model-space rotation of a bone under the current pose, for the selftest. */
    modelRotation(bone, out = new THREE.Quaternion()) {
      frame.updateMatrixWorld(true);
      return bindOf(bone, frame, out).q;
    },
    bind(bone) { return post.get(bone); },
  };
}

/* ── material ────────────────────────────────────────────────────────────────
   Plain MeshStandardMaterial on the glb's own maps, and NOT the shared actor
   material — which is how the uBands toon ramp at material.js:155 is bypassed.
   The ramp was compensating for a character that had no maps at all; a
   generated mesh ships albedo, normal and roughness, and posterising it against
   a world rendered in continuous PBR is the pasted-on read the ramp was
   supposed to be fixing. Built explicitly rather than reusing whatever the
   loader returned, so a KHR extension cannot quietly hand us a
   MeshPhysicalMaterial with a clearcoat lobe the world does not have. */
export function makeGltfMaterial(src, name = 'forge-actor') {
  const m = new THREE.MeshStandardMaterial({
    color: src?.color ? src.color.clone() : new THREE.Color(0xffffff),
    map: src?.map || null,
    normalMap: src?.normalMap || null,
    roughnessMap: src?.roughnessMap || null,
    metalnessMap: src?.metalnessMap || null,
    aoMap: src?.aoMap || null,
    emissiveMap: src?.emissiveMap || null,
    emissive: src?.emissive ? src.emissive.clone() : new THREE.Color(0x000000),
    roughness: src?.roughness ?? 0.85,
    metalness: src?.metalness ?? 0.0,
    envMapIntensity: 1.0,
    side: THREE.FrontSide,
    dithering: true,
  });
  if (src?.normalScale) m.normalScale.copy(src.normalScale);
  m.name = name;
  return m;
}

/* ── the swap ────────────────────────────────────────────────────────────────
   Everything above, applied to a live actor in place. */

/**
 * Tear down a previously forged body. Called before every swap, including the
 * hot one — see the note under the HMR block for why that is not optional.
 *
 * Disposes exactly two things: the geometries under the forge group, and the
 * ONE material this file created plus its textures. It deliberately does not
 * walk `o.material` — the weapon rides the SHARED actor material owned by
 * index.js, and disposing that takes the whole cast down with it.
 */
export function disposeActorSource(actor) {
  const g = actor._forge;
  if (!g) return;
  detachProps(actor);
  if (g.group) {
    actor.root.remove(g.group);
    g.group.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
  }
  if (g.material) disposeMaterial(g.material);
  actor._forge = null;
}

function disposeMaterial(m) {
  if (!m) return;
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']) {
    m[k]?.dispose?.();
  }
  m.dispose();
}

/** Lift the socket props clear of whatever is about to be destroyed. They are
 *  separate meshes on the shared material and they outlive every body swap. */
function detachProps(actor) {
  actor.weapon?.parent?.remove(actor.weapon);
  actor.beacon?.parent?.remove(actor.beacon);
}

/** Drop the code-built body, outline and skeleton off an actor, once. */
function shedCodeBuilt(actor) {
  if (actor.source === 'gltf') return;
  const { mesh, outline, root } = actor;
  root.remove(mesh);
  root.remove(outline);
  const rootBone = actor.boneByName.get('hips');
  if (rootBone?.parent === root) root.remove(rootBone);
  /* The outline shares the body's geometry, so it is disposed once, here. Its
     material is the actor's own — nothing else references it. */
  mesh.geometry.dispose();
  actor.outlineMat?.dispose();
  outline.visible = false;
}

/**
 * Turn a loaded glb scene into this actor's body.
 *
 * Synchronous and renderer-free on purpose: `forge-selftest.mjs` drives exactly
 * this function in plain Node against a synthetic glb, which is what makes the
 * loader gateable before any 15-minute mesh generation exists.
 *
 * @param {object} actor    the actor from buildActor()
 * @param {THREE.Object3D} gltfScene
 * @param {object} mapJson  parsed assets/<id>.bones.json
 */
export function applyGltfActor(actor, gltfScene, mapJson) {
  const skinned = [];
  gltfScene.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  if (!skinned.length) throw new Error('[forge] glb contains no SkinnedMesh — the rig stage did not run, or it wrote a static mesh');

  const skeleton = skinned[0].skeleton;
  const { map, missing, names } = resolveBoneMap(skeleton.bones, mapJson);
  if (missing.length) {
    throw new Error(
      `[forge] bones.json maps ${SPEC_BONES.length - missing.length}/${SPEC_BONES.length} spec bones. ` +
      `Missing: ${missing.join(', ')}\n` +
      `glb bones: ${names.join(', ')}\n` +
      `suggested map:\n${JSON.stringify(suggestBoneMap(names), null, 2)}`);
  }

  /* Props first, then the old body — in that order, or the second swap of a
     hot-reload loop disposes the weapon's geometry along with the mesh it was
     parented to and remounts an empty. */
  detachProps(actor);
  shedCodeBuilt(actor);
  disposeActorSource(actor);

  const group = new THREE.Group();
  group.name = `forge:${actor.id}`;
  group.add(gltfScene);
  actor.root.add(group);

  /* Normalise to HERO_M, not to the hero's own height. The code-built rig is
     authored at HERO_M in rig space and the per-hero height arrives as a
     uniform root scale (rig.js, and index.js `place()` re-applies it every
     frame); normalising to heightM here would apply that factor twice. It also
     keeps every measurement below in the same units as ground.js's spec
     constants. */
  const norm = normaliseRig(group, actor.root, {
    faceYawDeg: mapJson?.faceYawDeg ?? 0,
    heightM: HERO_M,
  });

  /* Rename the mapped bones to their spec names. The engine identifies a bone
     by spec name in five places (poses.js, ground.js ×6, gate.js, tools/rig.mjs)
     and carrying a second naming system through all of them is how the two
     drift apart. The glb's own name is kept on the bone for inspection, and
     bones.json is the diffable record of what mapped to what. */
  const boneByName = new Map();
  for (const [spec, bone] of map) {
    bone.userData.gltfName = bone.userData.gltfName ?? bone.name;
    bone.name = spec;
    boneByName.set(spec, bone);
  }

  const material = makeGltfMaterial(skinned[0].material, `forge:${actor.id}`);
  let tris = 0;
  for (const sm of skinned) {
    sm.material = material;
    sm.castShadow = true;
    sm.receiveShadow = true;
    sm.frustumCulled = false;
    const idx = sm.geometry.index;
    tris += (idx ? idx.count : sm.geometry.getAttribute('position').count) / 3;
  }

  actor.root.updateMatrixWorld(true);
  const legs = measureLegs(boneByName, actor.root);
  const retarget = makeRetarget(boneByName, actor.root);
  const sockets = mountSockets(actor, boneByName, actor.root);

  actor.source = 'gltf';
  actor.mesh = skinned[0];
  actor.skinned = skinned;
  actor.skeleton = skeleton;
  actor.bones = SPEC_BONES.map(n => boneByName.get(n));
  actor.boneByName = boneByName;
  actor.retarget = retarget;
  actor.sockets = sockets;
  actor.rigScale = norm.scale;
  actor.sourceHeightM = norm.sourceHeightM;
  actor.limb = { thigh: legs.thigh, shin: legs.shin };
  actor.soleM = legs.sole;
  actor.partRanges = {};          // no aPart on a glb — Part isolation is off
  actor.tris = Math.round(tris);
  actor._forge = { group, material, scene: gltfScene, boneNames: names };
  /* The despawn seam. index.js owns the actor list and calls this; without it a
     forged body's geometry and textures survive every clear() and the hot-swap
     loop climbs until the dev server is killed by memory pressure. */
  actor.releaseForge = () => releaseGltfActor(actor);

  if (legs.sole < SOLE_MIN || legs.sole > SOLE_MAX) {
    console.warn(`[forge] ${actor.id}: ankle-to-sole measured ${legs.sole.toFixed(3)} m, outside ${SOLE_MIN}–${SOLE_MAX}. ` +
      'The mesh\'s lowest point is probably not a boot; ground contact will carry that error at every slope.');
  }
  if (mapJson?.reviewed !== true) {
    console.warn(`[forge] ${actor.id}: assets/${actor.id}.bones.json is not marked "reviewed": true. ` +
      'The map was suggested, not confirmed — check it against the glb before trusting a joint.');
  }
  return actor;
}

/**
 * Sockets on the mapped bones.
 *
 * Each socket is given the bone's inverse bind rotation and inverse bind scale,
 * so at bind it has UNIT scale and IDENTITY rotation in model space — which is
 * precisely the frame the code-built rig's sockets have, and therefore the frame
 * every weapon in weaponParts() is authored against. Three swords, one socket
 * transform, no per-item offset hack: the spec's contract survives the swap.
 */
function mountSockets(actor, boneByName, frame) {
  const out = {};
  for (const [name, s] of Object.entries(SOCKETS)) {
    const bone = boneByName.get(s.joint);
    if (!bone) continue;
    const { q, scale } = bindOf(bone, frame, new THREE.Quaternion());
    const o = new THREE.Object3D();
    o.name = `socket:${name}`;
    o.quaternion.copy(q).invert();
    o.scale.setScalar(1 / (scale || 1));
    o.position.fromArray(s.offset).applyQuaternion(o.quaternion).divideScalar(scale || 1);
    /* Same hand flip the code-built rig applies, and for the same reason: the
       spec's socket convention says local +Y runs to the blade tip, and every
       weapon is authored that way, but the hand's own +Y runs back up the arm.
       Scoped to Kaida there; scoped to Kaida here. */
    if (actor.build?.lofted && (s.joint === 'hand_R' || s.joint === 'hand_L')) o.rotateX(Math.PI);
    bone.add(o);
    out[name] = o;
  }
  if (actor.weapon && out.weapon) out.weapon.add(actor.weapon);
  return out;
}

/* ── async entry point + hot swap ────────────────────────────────────────── */

const LIVE = new Set();
let loader = null;

/**
 * Load `req.glb` + `req.map` and swap them onto `actor`. Resolves to the actor
 * on success and to null on any failure — a failed forge leaves the code-built
 * character standing rather than blanking the screen, because a missing glb is
 * the NORMAL state of this repo until the human has run the pipeline.
 */
export async function attachGltfActor(actor, req) {
  try {
    loader = loader || new GLTFLoader();
    const [gltf, mapJson] = await Promise.all([
      loader.loadAsync(req.glb),
      fetch(req.map).then(r => (r.ok ? r.json() : null)),
    ]);
    if (!mapJson) {
      const names = [];
      gltf.scene.traverse(o => { if (o.isBone) names.push(o.name); });
      console.error(`[forge] no bone map at ${req.map}. Write it — the map is DATA, never a convention this loader guesses.\n` +
        `glb bones (${names.length}): ${names.join(', ')}\n` +
        `starting point:\n${JSON.stringify({ name: req.name, reviewed: false, faceYawDeg: 0, bones: suggestBoneMap(names) }, null, 2)}`);
      return null;
    }
    applyGltfActor(actor, gltf.scene, mapJson);
    actor._forge.req = req;
    LIVE.add(actor);
    console.info(`[forge] ${actor.id}: ${actor.tris} tri, source ${actor.sourceHeightM.toFixed(3)} m ` +
      `→ ${HERO_M.toFixed(2)} m (×${actor.rigScale.toFixed(4)}), ` +
      `sole ${actor.soleM.toFixed(3)} m, thigh ${actor.limb.thigh.toFixed(3)} shin ${actor.limb.shin.toFixed(3)}`);
    return actor;
  } catch (err) {
    console.error(`[forge] ${actor.id}: keeping the code-built character.\n${err.message}`);
    return null;
  }
}

/** Called by index.js on despawn so a hot-swap loop cannot leak. */
export function releaseGltfActor(actor) {
  LIVE.delete(actor);
  disposeActorSource(actor);
}

/* ── HMR ─────────────────────────────────────────────────────────────────────
   The watcher half lives in vite.config.js — a runtime-fetched glb is not in
   the module graph, so Vite will not watch it without an explicit add. This
   half only exists in a dev server; `import.meta.hot` is undefined in a
   production build and in Node, so forge-selftest.mjs imports this file
   without ever arming a listener.

   DISPOSE ON EVERY SWAP. This machine is 16 GB shared with Vite and Chrome and
   the dev server has already been killed once by memory pressure; a swap loop
   that leaks a textured mesh per save gets there in minutes. */
if (import.meta.hot) {
  import.meta.hot.on('forge:character', async (data) => {
    const name = data?.name;
    for (const actor of [...LIVE]) {
      if (name && actor.id !== name) continue;
      const req = actor._forge?.req;
      if (!req) continue;
      const bust = `?t=${data?.t ?? Date.now()}`;
      const fresh = { ...req, glb: req.glb + bust, map: req.map + bust };
      console.info(`[forge] hot-swapping ${actor.id} ← ${data?.file ?? req.glb}`);
      await attachGltfActor(actor, fresh);
    }
  });
}
