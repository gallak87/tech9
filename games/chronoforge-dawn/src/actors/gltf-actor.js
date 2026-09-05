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
// ── THE BIND DELTA ───────────────────────────────────────────────────────────
//
// B(x) is node x's bind rotation in the actor's model space. q(b) is the clip's
// absolute spec-space rotation for bone b. W(b) is b's posed model rotation,
// and W_spec(b) = W_spec(m)·q(b) is what the code-built rig produces. m is b's
// SPEC parent; u is its ACTUAL scene parent, which may be an unmapped node — a
// twist bone, an armature root — that nothing animates and which therefore
// keeps its rest local.
//
// Both modes solve for one fixed pair per bone:
//
//     local(b) = pre(b) · q(b) · post(b)
//
// ABSOLUTE (default). W(b) = W_spec(b). An unposed clip returns the limbs to
// the SPEC bind — hanging along −Y, facing +Z — and the mesh is skinned there
// from wherever the auto-rigger's bind left it.
//
//     local(b) = W(u)⁻¹ · W_spec(b),   W(u) = W_spec(m)·B(m)⁻¹·B(u)
//     ⇒ pre = B(u)⁻¹·B(m),  post = identity
//
// Where u IS the spec parent — the ordinary case — pre collapses to identity
// and the retarget is a name lookup. The pair only does work where the glb
// interposes bones the spec does not have, or where the armature root carries a
// transform.
//
// ADDITIVE (`"bindMode": "additive"` in bones.json). W(b) = W_spec(b)·B(b): an
// unposed clip reproduces the glb's own bind and every clip reads as a delta
// from it.
//
//     local(b) = W(u)⁻¹·W(b) = B(u)⁻¹ · q(b) · B(b)
//     ⇒ pre = B(u)⁻¹,  post = B(b)
//
// The correction lives in the write path, not in the skeleton. Zeroing each
// bone's rest rotation to match the spec frames and recomputing the bind
// inverses renders correctly at rest and wrong the instant anything moves — the
// vertices are still laid out around the A-posed bones.
// ─────────────────────────────────────────────────────────────────────────────

/** The 19 spec bone names, read from the spec rather than retyped. */
export const SPEC_BONES = JOINTS.map(j => j.name);

/** Spec-bone → its spec parent. The retarget's `pre` term needs it. */
const SPEC_PARENT = new Map(JOINTS.map(j => [j.name, j.parent]));

/** Sanity band on the measured ankle-to-sole, in rig metres. Outside it the
 *  mesh's lowest point is not a boot — a hem, a dropped cape, a stray vertex —
 *  and the ground solve carries that error as a constant at every slope. */
const SOLE_MIN = 0.02;
const SOLE_MAX = 0.22;

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _box = new THREE.Box3();
const _b3 = new THREE.Box3();
const AXIS = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

/* The flag is parsed in rig.js `forgeRequest()`, so reading it costs no
   bundle. The forge installs to `assets/` at the game root, not `public/`:
   Vite full-page-reloads on any publicDir change, which defeats the hot swap
   at the bottom of this file. See vite.config.js.

   ── the bone map ───────────────────────────────────────────────────────────
   Data. The auto-rigger's names are unknowable until a rigged glb exists, so
   nothing here assumes a convention. `suggestBoneMap` writes the first draft
   of the file and the "no map" error text; it is never applied silently. */

/** Collapse a bone name to a comparison key: case, separators and the common
 *  rig prefixes (mixamorig:, Armature|, DEF-, ORG-) and the side token dropped,
 *  because the side is decided separately and a name is otherwise unmatchable
 *  across the three conventions that actually show up: `mixamorig:LeftForeArm`,
 *  `Bip01_L_Forearm` and `forearm.L`. */
export function bareKey(name) {
  return String(name)
    .replace(/^.*[:|]/, '')
    .replace(/^(DEF|ORG|MCH)[-_]/i, '')
    .replace(/left|right/ig, '')
    .replace(/(^|[^a-zA-Z])[lr]([^a-zA-Z]|$)/ig, '$1$2')
    .replace(/[\s._-]/g, '')
    .toLowerCase();
}

/** 'L', 'R', or null for a centre bone. Word form first (`LeftArm`), then a
 *  delimited single letter (`Bip01_L_Hand`, `forearm.L`). */
export function sideOf(name) {
  const n = String(name).replace(/^.*[:|]/, '');
  if (/left/i.test(n)) return 'L';
  if (/right/i.test(n)) return 'R';
  if (/(^|[^a-zA-Z])l([^a-zA-Z]|$)/i.test(n)) return 'L';
  if (/(^|[^a-zA-Z])r([^a-zA-Z]|$)/i.test(n)) return 'R';
  return null;
}

const SYNONYMS = {
  hips: ['hips', 'hip', 'pelvis'],
  spine_lower: ['spinelower', 'spine', 'spine1', 'abdomen', 'waist'],
  spine_upper: ['spineupper', 'spine2', 'spine3', 'chest', 'upperchest'],
  neck: ['neck', 'neck1'],
  head: ['head'],
  shoulder: ['shoulder', 'clavicle', 'collar'],
  upperArm: ['upperarm', 'uparm', 'arm'],
  lowerArm: ['lowerarm', 'forearm', 'elbow'],
  hand: ['hand', 'wrist'],
  upperLeg: ['upperleg', 'upleg', 'thigh'],
  lowerLeg: ['lowerleg', 'leg', 'shin', 'calf', 'knee'],
  foot: ['foot', 'ankle'],
};

const SIDED = ['shoulder', 'upperArm', 'lowerArm', 'hand', 'upperLeg', 'lowerLeg', 'foot'];

/**
 * Best-effort glb-name → spec-name suggestion, for the draft bones.json and the
 * loader's error text.
 *
 * Scored globally, not picked in a fixed pass order: the orderings conflict —
 * `arm` matches `Bip01_L_Forearm`, `upperarm` matches it better, and no single
 * order gets both. Longest synonym wins, a suffix match beats a substring
 * match, ties break on the glb's own bone order. Deterministic, because the
 * output is a file that gets diffed.
 */
export function suggestBoneMap(names) {
  const slots = [
    ...['hips', 'spine_lower', 'spine_upper', 'neck', 'head'].map(s => ({ spec: s, part: s, side: null })),
    ...['L', 'R'].flatMap(side => SIDED.map(part => ({ spec: `${part}_${side}`, part, side }))),
  ];
  const cands = [];
  for (const { spec, part, side } of slots) {
    for (let i = 0; i < names.length; i++) {
      const n = names[i];
      if (sideOf(n) !== side) continue;
      const b = bareKey(n);
      let score = 0;
      for (const syn of SYNONYMS[part]) {
        if (b.endsWith(syn)) score = Math.max(score, syn.length + 0.5);
        else if (b.includes(syn)) score = Math.max(score, syn.length);
      }
      if (score) cands.push({ spec, name: n, score, i });
    }
  }
  cands.sort((a, b) => b.score - a.score || a.i - b.i || a.spec.localeCompare(b.spec));
  const out = {};
  const taken = new Set();
  for (const c of cands) {
    if (out[c.spec] || taken.has(c.name)) continue;
    out[c.spec] = c.name;
    taken.add(c.name);
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
  // GLTFLoader sanitises node names on the way in: spaces become underscores
  // and `. : / [ ]` are dropped, so a rig authored as `mixamorig:Hips` arrives
  // as `mixamorigHips`. bones.json is written from the raw glTF JSON, where the
  // original survives — match on both or every Mixamo rig maps 0/19.
  for (const b of bones) {
    const raw = sanitiseNodeName(b.name);
    if (raw !== b.name && !byName.has(raw)) byName.set(raw, b);
  }
  const table = mapJson?.bones || {};
  const map = new Map();
  const missing = [];
  for (const spec of SPEC_BONES) {
    const glbName = table[spec];
    const bone = glbName
      ? (byName.get(glbName) ?? byName.get(sanitiseNodeName(glbName)))
      : null;
    if (bone) map.set(spec, bone); else missing.push(spec);
  }
  return { map, missing, names: bones.map(b => b.name) };
}

/** three.js PropertyBinding.sanitizeNodeName, reimplemented so the rule is
 *  visible here rather than inferred from a mismatch. */
export function sanitiseNodeName(name) {
  return String(name).replace(/\s/g, '_').replace(/[\.:\/\[\]]/g, '');
}

/* ── measurement ─────────────────────────────────────────────────────────────
   Measured off the loaded glb. No constant here describes a character; the one
   number is HERO_M, imported from core. */

/** Bind bounding box of every mesh under `node`, in `frame` space. At the bind
 *  pose every bone matrix is identity, so a skinned vertex lands at
 *  `mesh.matrixWorld · v` — correct for a SkinnedMesh without evaluating a
 *  single skin weight. */
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
 * centred on x/z. `group` is the wrapper the gltf scene hangs under, `frame`
 * the actor root.
 *
 * `faceYawDeg` is applied FIRST, so the measurement — and every bind rotation
 * derived from it — is taken in a frame where the character faces +Z.
 */
export function normaliseRig(group, frame, { faceYawDeg = 0, heightM = HERO_M } = {}) {
  group.position.set(0, 0, 0);
  group.quaternion.identity();
  group.scale.setScalar(1);
  group.rotation.y = THREE.MathUtils.degToRad(faceYawDeg);

  /* The measurement is taken in `frame` space, and index.js `place()` puts a
     per-hero height scale on the actor root every frame. Loading is async, so
     that scale is already there by the time a glb arrives and would divide
     itself out of `raw` — a 2.08 m rig measures 0.39 and gets scaled ×4.4.
     Neutralise it for the measurement, restore it after. */
  const frameScale = frame.scale.clone();
  frame.scale.setScalar(1);
  frame.updateMatrixWorld(true);

  const box = bindBox(group, frame, _box);
  const raw = box.max.y - box.min.y;

  frame.scale.copy(frameScale);
  frame.updateMatrixWorld(true);
  if (!(raw > 1e-6)) throw new Error('[forge] loaded mesh has zero height — nothing to normalise');
  const k = heightM / raw;

  group.scale.setScalar(k);
  group.position.set(
    -(box.min.x + box.max.x) * 0.5 * k,
    -box.min.y * k,
    -(box.min.z + box.max.z) * 0.5 * k,
  );
  frame.updateMatrixWorld(true);
  return { scale: k, sourceHeightM: raw, heightM, frameScale: frameScale.x };
}

/**
 * Ankle-to-sole and the two leg-link lengths, in normalised rig metres.
 *
 * ground.js's SOLE, THIGH and SHIN are the code-built rest pose. A generated
 * foot matches none of them; unmeasured, the error is a constant float or sink
 * at every slope plus a knee solve asking for a span the leg cannot reach.
 */
export function measureLegs(boneByName, frame) {
  const wp = (name) => boneByName.get(name).getWorldPosition(new THREE.Vector3())
    .applyMatrix4(_m.copy(frame.matrixWorld).invert());
  const hipL = wp('upperLeg_L'), kneeL = wp('lowerLeg_L'), ankL = wp('foot_L');
  const hipR = wp('upperLeg_R'), kneeR = wp('lowerLeg_R'), ankR = wp('foot_R');
  const thigh = (hipL.distanceTo(kneeL) + hipR.distanceTo(kneeR)) * 0.5;
  const shin = (kneeL.distanceTo(ankL) + kneeR.distanceTo(ankR)) * 0.5;
  /* normaliseRig has already put the lowest point at y = 0, so an ankle's own
     height IS its ankle-to-sole. The LOWER ankle owns that lowest point. */
  const sole = Math.min(ankL.y, ankR.y);
  return { thigh, shin, sole };
}

/* ── the retarget ────────────────────────────────────────────────────────────
   The write path for every spec-space rotation. poses.js and ground.js call it
   instead of touching bone.rotation, and only when `actor.retarget` exists —
   true for a generated character and nothing else. */

export const BIND_MODES = ['absolute', 'additive'];

export function makeRetarget(boneByName, frame, mode = 'absolute') {
  if (!BIND_MODES.includes(mode)) throw new Error(`[forge] unknown bindMode "${mode}" — expected ${BIND_MODES.join(' | ')}`);
  const pre = new Map();
  const post = new Map();
  const bind = new Map();
  frame.updateMatrixWorld(true);

  const B = (node) => (node ? bindOf(node, frame, new THREE.Quaternion()).q : new THREE.Quaternion());
  for (const bone of boneByName.values()) bind.set(bone, B(bone).clone());

  for (const [spec, bone] of boneByName) {
    const specParent = SPEC_PARENT.get(spec);
    const Bm = specParent ? bind.get(boneByName.get(specParent)).clone() : new THREE.Quaternion();
    const Bu = B(bone.parent).clone();
    if (mode === 'absolute') {
      pre.set(bone, Bu.invert().multiply(Bm));
      post.set(bone, new THREE.Quaternion());
    } else {
      pre.set(bone, Bu.invert());
      post.set(bone, bind.get(bone).clone());
    }
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
     * On an XYZ Euler that is a PRE-multiply: Rx(x+d)·Ry·Rz = Rx(d)·(Rx·Ry·Rz).
     * So it rotates in the PARENT's frame, and in the spec bind every parent
     * frame is the model frame — the axis ground.js means by "flex the knee
     * about X". A post-multiply would use the glb's own bone frame instead.
     */
    add(bone, axis, angle) {
      if (!pre.has(bone) || !angle) return;
      _q2.setFromAxisAngle(AXIS[axis], angle);
      bone.userData.qSpec.premultiply(_q2);
      write(bone);
    },
    /** Model-space rotation of a bone under the current pose. */
    modelRotation(bone, out = new THREE.Quaternion()) {
      frame.updateMatrixWorld(true);
      return bindOf(bone, frame, out).q;
    },
    /** The bone's model-space bind rotation, which the delta was solved from. */
    bind(bone) { return bind.get(bone); },
    mode,
  };
}

/* ── material ────────────────────────────────────────────────────────────────
   Plain MeshStandardMaterial on the glb's own maps, not the shared actor
   material — which is how the uBands toon ramp at material.js:155 is bypassed.
   The ramp compensates for a character with no maps; a generated mesh ships
   albedo, normal and roughness, and banding it against a world rendered in
   continuous PBR is the pasted-on read the ramp exists to fix.

   Built explicitly rather than reusing the loader's material, so a KHR
   extension cannot hand back a MeshPhysicalMaterial with a clearcoat lobe the
   world has no equivalent for. */
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

/* ── the swap ────────────────────────────────────────────────────────────── */

/**
 * Tear down a previously forged body. Runs before every swap, hot ones
 * included.
 *
 * Disposes two things: the geometries under the forge group, and the one
 * material this file created plus its textures. It does not walk `o.material` —
 * the weapon rides the SHARED actor material owned by index.js, and disposing
 * that takes the whole cast with it.
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

/** Lift the socket props clear of whatever is about to be destroyed. Separate
 *  meshes on the shared material; they outlive every body swap. */
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
 * Synchronous and renderer-free, so forge-selftest.mjs can drive it in plain
 * Node against a synthetic glb.
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

  /* Props first, then the old body. In the other order the second swap of a
     hot-reload loop disposes the weapon's geometry along with the mesh it was
     parented to, and remounts an empty. */
  detachProps(actor);
  shedCodeBuilt(actor);
  disposeActorSource(actor);

  const group = new THREE.Group();
  group.name = `forge:${actor.id}`;
  group.add(gltfScene);
  actor.root.add(group);

  /* HERO_M, not the hero's own height. The code-built rig is authored at
     HERO_M in rig space and per-hero height arrives as a uniform root scale
     that index.js `place()` re-applies every frame — normalising to heightM
     would apply it twice. It also keeps the measurements below in the same
     units as ground.js's spec constants. */
  const norm = normaliseRig(group, actor.root, {
    faceYawDeg: mapJson?.faceYawDeg ?? 0,
    heightM: HERO_M,
  });

  /* Rename the mapped bones to their spec names. The engine identifies a bone
     by spec name in poses.js, ground.js, gate.js and tools/rig.mjs; a second
     naming system carried through all four is where the two drift apart. The
     glb's own name stays on the bone, and bones.json is the diffable record. */
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
  const retarget = makeRetarget(boneByName, actor.root, mapJson?.bindMode ?? 'absolute');
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
  /* The despawn seam. index.js owns the actor list and calls this; without it
     a forged body's geometry and textures survive every clear(). */
  actor.releaseForge = () => releaseGltfActor(actor);

  if (legs.sole < SOLE_MIN || legs.sole > SOLE_MAX) {
    console.warn(`[forge] ${actor.id}: ankle-to-sole ${legs.sole.toFixed(3)} m, outside ${SOLE_MIN}–${SOLE_MAX}. ` +
      'The lowest point is not a boot; ground contact carries the error at every slope.');
  }
  if (mapJson?.reviewed !== true) {
    console.warn(`[forge] ${actor.id}: assets/${actor.id}.bones.json is not marked "reviewed": true — ` +
      'the map is suggested, not confirmed.');
  }
  return actor;
}

/**
 * Sockets on the mapped bones.
 *
 * Each socket carries the bone's inverse bind rotation and inverse bind scale,
 * so at bind it has unit scale and identity rotation in model space. That is
 * the frame the code-built rig's sockets have and the frame every weapon in
 * weaponParts() is authored against — three swords, one socket transform, no
 * per-item offset.
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
    /* The hand flip rig.js applies, for the same reason: socket local +Y runs
       to the blade tip and every weapon is authored that way, but a hand bone's
       own +Y runs back up the arm. Scoped to Kaida in both places. */
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
 * Load `req.glb` + `req.map` and swap them onto `actor`. Resolves to the actor,
 * or to null on any failure: no glb is the normal state of this repo until the
 * pipeline has been run, and a failure leaves the code-built body standing.
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
      console.error(`[forge] no bone map at ${req.map}. The map is data; this loader guesses no convention.\n` +
        `glb bones (${names.length}): ${names.join(', ')}\n` +
        `starting point:\n${JSON.stringify({ name: req.name, reviewed: false, faceYawDeg: 0, bones: suggestBoneMap(names) }, null, 2)}`);
      return null;
    }
    applyGltfActor(actor, gltf.scene, mapJson);
    actor._forge.req = req;
    LIVE.add(actor);
    console.info(`[forge] ${actor.id}: ${actor.tris} tri, source ${actor.sourceHeightM.toFixed(3)} m ` +
      `→ ${HERO_M.toFixed(2)} m (×${actor.rigScale.toFixed(4)}), ` +
      `sole ${actor.soleM.toFixed(3)} m, thigh ${actor.limb.thigh.toFixed(3)} shin ${actor.limb.shin.toFixed(3)}` +
      `, frameScale ${norm.frameScale.toFixed(4)}`);
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
   The watcher half is in vite.config.js: a runtime-fetched glb is not in the
   module graph, so Vite will not watch it without an explicit add.

   `import.meta.hot` is undefined in a production build and in Node, so this
   listener exists only under a dev server and forge-selftest.mjs never arms it.

   applyGltfActor disposes on every swap. 16 GB is shared with Vite and Chrome
   and the dev server has already been killed once by memory pressure; leaking
   one textured mesh per save gets back there in minutes. */
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
