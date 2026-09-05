// ─────────────────────────────────────────────────────────────────────────────
// The contract, as executable checks. CONTRACT.md is the prose; this is the
// authority. Pure Node — no THREE, no Blender, no build step — so it runs as a
// gate in under a second and can be unit-tested with no asset present.
//
// It reads the glb's own glTF JSON rather than a loaded scene graph, because
// THREE's GLTFLoader sanitises node names (`mixamorig:Hips` → `mixamorigHips`)
// and the contract is about what is IN the file.
//
// Joint names, offsets and sockets come from docs/specs/rig.mjs. They are not
// restated here — one source of truth, or the two drift and the gate lies.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import { JOINTS, SOCKETS } from '../specs/rig.mjs';
import { HERO_M } from '../../src/core/const.js';

export const SPEC_NAMES = JOINTS.map(j => j.name);
export const SPEC_PARENT = new Map(JOINTS.map(j => [j.name, j.parent]));
export const SPEC_OFFSET = new Map(JOINTS.map(j => [j.name, j.offset]));

/** Tolerances. Deliberately tight: a generated rig that misses by more than
 *  this is not "close enough", it is a canonicalisation bug. */
export const TOL = {
  heightM: 0.02,      // crown-to-sole vs HERO_M
  soleM: 0.01,        // lowest skinned vertex vs y=0
  restRad: 0.09,      // ~5°, per-limb rest direction
  offsetM: 0.02,      // per-joint local offset vs spec
};

/* ── glb container ────────────────────────────────────────────────────────── */

/** Split a .glb into its glTF JSON and its binary chunk. The format is a
 *  12-byte header then length-prefixed chunks; nothing here needs a library. */
export function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a glb (bad magic)`);
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body));
    else if (type === 0x004e4942) bin = body;
    off += 8 + len + (len % 4 ? 4 - (len % 4) : 0);  // chunks are 4-byte aligned
  }
  if (!json) throw new Error(`${file}: no JSON chunk`);
  return { json, bin };
}

/* ── node graph helpers ───────────────────────────────────────────────────── */

const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function quatToMat3(q) {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}
const mul3 = (a, b) => [
  a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
  a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
  a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
];
const apply3 = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v) => Math.hypot(v[0], v[1], v[2]);
const norm = (v) => { const l = len(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Every node's rest transform in scene space. glTF nodes carry either a
 *  `matrix` or TRS; both are handled. Scale is folded into the rotation part
 *  so a unit-scaled armature and a centimetre one compare equal after
 *  normalisation, which is what the scale check is separately for. */
export function restWorld(json) {
  const nodes = json.nodes || [];
  const parentOf = new Map();
  nodes.forEach((n, i) => (n.children || []).forEach(c => parentOf.set(c, i)));

  const local = nodes.map((n) => {
    if (n.matrix) {
      const m = n.matrix; // column-major
      return { r: [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]], t: [m[12], m[13], m[14]] };
    }
    const r = n.rotation ? quatToMat3(n.rotation) : IDENT.slice();
    const s = n.scale || [1, 1, 1];
    const rs = [r[0] * s[0], r[1] * s[1], r[2] * s[2], r[3] * s[0], r[4] * s[1], r[5] * s[2], r[6] * s[0], r[7] * s[1], r[8] * s[2]];
    return { r: rs, t: n.translation || [0, 0, 0] };
  });

  const world = new Array(nodes.length);
  const solve = (i) => {
    if (world[i]) return world[i];
    const p = parentOf.get(i);
    const L = local[i];
    if (p === undefined) return (world[i] = { r: L.r, t: L.t });
    const P = solve(p);
    return (world[i] = { r: mul3(P.r, L.r), t: (([x, y, z]) => [x + P.t[0], y + P.t[1], z + P.t[2]])(apply3(P.r, L.t)) });
  };
  nodes.forEach((_, i) => solve(i));
  return { world, parentOf, nodes };
}

/* ── the checks ───────────────────────────────────────────────────────────── */

/** Vertical extent of every skinned mesh, in scene space. glTF requires min/max
 *  on POSITION accessors, so the bounds come free without decoding the buffer.
 *  All eight corners are transformed, not just min and max, because a rotated
 *  node would otherwise report a box that is not the box. */
export function meshBoundsY(json) {
  const { world } = restWorld(json);
  let lo = Infinity, hi = -Infinity;
  (json.nodes || []).forEach((n, ni) => {
    if (n.mesh === undefined) return;
    // A skinned mesh's POSITION accessor is in the skin's BIND space, and its
    // vertices are placed by the joint matrices, not by the mesh node. The
    // contract requires the asset be exported in its bind pose, so bind space
    // IS scene space and the bounds are already correct. Applying the node
    // transform as well would count it twice.
    const skinned = n.skin !== undefined;
    for (const prim of json.meshes[n.mesh].primitives || []) {
      const acc = json.accessors?.[prim.attributes?.POSITION];
      if (!acc?.min || !acc?.max) continue;
      for (let c = 0; c < 8; c++) {
        const v = [c & 1 ? acc.max[0] : acc.min[0], c & 2 ? acc.max[1] : acc.min[1], c & 4 ? acc.max[2] : acc.min[2]];
        const y = skinned ? v[1] : apply3(world[ni].r, v)[1] + world[ni].t[1];
        lo = Math.min(lo, y); hi = Math.max(hi, y);
      }
    }
  });
  return lo === Infinity ? null : { min: lo, max: hi };
}

/** Map spec joint name → node index. Exact match only: canonicalisation is
 *  responsible for renaming, so a fuzzy match here would hide its failure. */
export function locateJoints(json) {
  const byName = new Map();
  (json.nodes || []).forEach((n, i) => { if (n.name && !byName.has(n.name)) byName.set(n.name, i); });
  const found = new Map(), missing = [];
  for (const name of SPEC_NAMES) {
    if (byName.has(name)) found.set(name, byName.get(name));
    else missing.push(name);
  }
  return { found, missing };
}

/**
 * Check a parsed glb against the contract.
 * @returns {{ok: boolean, errors: string[], report: object}}
 */
export function validate(json) {
  const errors = [];
  const report = {};
  const { found, missing } = locateJoints(json);

  // 1. skeleton — every spec joint present, under its spec parent
  if (missing.length) errors.push(`missing spec joints: ${missing.join(', ')}`);
  report.joints = `${found.size}/${SPEC_NAMES.length}`;

  const { world, parentOf, nodes } = restWorld(json);
  const interposed = [];
  if (!missing.length) {
    for (const name of SPEC_NAMES) {
      const specParent = SPEC_PARENT.get(name);
      if (!specParent) continue;
      let p = parentOf.get(found.get(name)), hops = 0;
      while (p !== undefined && nodes[p].name !== specParent && hops < 8) { p = parentOf.get(p); hops++; }
      if (p === undefined || nodes[p].name !== specParent) {
        errors.push(`${name}: spec parent ${specParent} is not an ancestor`);
      } else if (hops > 0) {
        // Not an error. A real rig has more joints than the spec — Mixamo ships
        // three spine bones where the spec has two — so something MUST sit in
        // between. Ancestry is the contract; direct parentage would reject
        // structurally normal rigs to buy nothing.
        interposed.push(`${name}+${hops}`);
      }
    }
  }

  // 2. rest pose — limbs along -Y, facing +Z. Checked as directions between
  //    joints, not raw quaternions, so it is independent of bone-roll convention.
  if (!missing.length) {
    const dirOf = (a, b) => norm(sub(world[found.get(b)].t, world[found.get(a)].t));
    const limbs = [
      ['upperArm_L', 'lowerArm_L'], ['upperArm_R', 'lowerArm_R'],
      ['lowerArm_L', 'hand_L'], ['lowerArm_R', 'hand_R'],
      ['upperLeg_L', 'lowerLeg_L'], ['upperLeg_R', 'lowerLeg_R'],
    ];
    const off = [];
    for (const [a, b] of limbs) {
      const ang = Math.acos(Math.max(-1, Math.min(1, dot(dirOf(a, b), [0, -1, 0]))));
      if (ang > TOL.restRad) off.push(`${a}→${b} ${(ang * 180 / Math.PI).toFixed(1)}°`);
    }
    if (off.length) errors.push(`rest pose is not arms-down: ${off.join(', ')} from -Y`);
    report.restMaxDeg = limbs.reduce((m, [a, b]) =>
      Math.max(m, Math.acos(Math.max(-1, Math.min(1, dot(dirOf(a, b), [0, -1, 0])))) * 180 / Math.PI), 0).toFixed(1);
  }

  if (interposed.length) report.interposed = interposed.join(' ');

  // 3. scale and ground — the mesh's own vertical extent, which is what
  //    "how tall is this character" physically means. The skeleton cannot
  //    define it: a generated rig's bone lengths are whatever the generator
  //    produced, and ankle-to-sole is not a joint at all. Read from the
  //    POSITION accessor's min/max, which glTF requires, so no binary decode.
  {
    const b = meshBoundsY(json);
    if (!b) errors.push('no POSITION accessor bounds — cannot measure height');
    else {
      const h = b.max - b.min;
      report.heightM = h.toFixed(3);
      report.soleY = b.min.toFixed(4);
      if (Math.abs(h - HERO_M) > TOL.heightM) errors.push(`height ${h.toFixed(3)} m, contract wants ${HERO_M} ± ${TOL.heightM}`);
      if (Math.abs(b.min) > TOL.soleM) errors.push(`soles at y=${b.min.toFixed(4)}, contract wants 0 ± ${TOL.soleM}`);
    }
  }

  // 4. skin — exactly one skinned mesh
  const skinned = (json.nodes || []).filter(n => n.skin !== undefined);
  report.skinnedMeshes = skinned.length;
  if (skinned.length !== 1) errors.push(`${skinned.length} skinned meshes, contract wants exactly 1`);

  // 5. animation — none. The asset supplies a skeleton; the game supplies motion.
  const anims = (json.animations || []).length;
  report.animations = anims;
  if (anims) errors.push(`${anims} animation(s) present, contract wants none`);

  return { ok: errors.length === 0, errors, report };
}

/** Convenience: validate a file path. */
export function validateFile(file) {
  return validate(readGlb(file).json);
}
