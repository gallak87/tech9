import * as THREE from 'three';
import { JOINTS, SOCKETS, HERO_HEIGHTS_M, HEIGHT_TOLERANCE } from '../../docs/specs/rig.mjs';
import { HERO_PALETTES, ENEMY_PALETTE_FAMILY, IFF_BEACON } from '../../docs/specs/palette.mjs';
import { HERO_M } from '../core/const.js';
import { MAT, makeActorMaterial } from './material.js';
import { kaidaShellParts, kaidaWeaponParts, KAIDA_PALETTE } from './kaida.js';

// ─────────────────────────────────────────────────────────────────────────────
// The code-built hero rig.
//
// 19 bones straight out of docs/specs/rig.mjs — offsets, sockets and per-hero
// heights are READ from the spec, never retyped. A low-poly shell of tapered
// prisms is authored in each bone's local space, transformed into model space
// by that bone's bind matrix, and merged into ONE SkinnedMesh with rigid
// weights (every vertex 100% to one bone).
//
// Rigid weights, not smooth skinning, and that is a decision worth the line:
// the whole character is 48 virtual rows tall (HERO_SPRITE_ROWS). A smooth
// deformation across a joint is sub-virtual-pixel — it costs weight painting
// and buys nothing you can see, while a hard crease at the joint is exactly
// the read a hand-drawn sprite has. It also lets the entire body be one draw
// call, which is what makes a party of three plus three enemies affordable.
//
// FACING: +Z. docs/specs/rig.mjs's prose says the bind pose faces −Z, but its
// own socket offsets contradict that — socket.chest is at z +0.10 and
// socket.back at z −0.06, which only describes a character facing +Z. The
// offsets are the load-bearing half of the spec, so the rig is built facing
// +Z. That also puts the character's face toward the locked camera (which
// sits due +Z looking −Z), which is what the overworld framing wants anyway.
// Flagged for art in the Phase 2 report.
// ─────────────────────────────────────────────────────────────────────────────

const col = (hex) => new THREE.Color().setStyle(hex);

/** A tapered box. Six flat-shaded faces, 24 verts, 12 triangles.
 *  Everything on this character is one of these — that is the point. */
function prism({ y0, y1, w0, d0, w1 = w0, d1 = d0, x0 = 0, z0 = 0, x1 = x0, z1 = z0 }) {
  const b = [
    [x0 - w0 / 2, y0, z0 - d0 / 2], [x0 + w0 / 2, y0, z0 - d0 / 2],
    [x0 + w0 / 2, y0, z0 + d0 / 2], [x0 - w0 / 2, y0, z0 + d0 / 2],
  ];
  const t = [
    [x1 - w1 / 2, y1, z1 - d1 / 2], [x1 + w1 / 2, y1, z1 - d1 / 2],
    [x1 + w1 / 2, y1, z1 + d1 / 2], [x1 - w1 / 2, y1, z1 + d1 / 2],
  ];
  const faces = [
    [b[0], b[3], b[2], b[1]],   // −Y sole
    [t[0], t[1], t[2], t[3]],   // +Y
    [b[0], b[1], t[1], t[0]],   // −Z back
    [b[1], b[2], t[2], t[1]],   // +X
    [b[2], b[3], t[3], t[2]],   // +Z front
    [b[3], b[0], t[0], t[3]],   // −X
  ];
  const pos = [], nor = [], idx = [];
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
  let base = 0;
  for (const f of faces) {
    v0.fromArray(f[0]); v1.fromArray(f[1]); v2.fromArray(f[2]);
    e1.subVectors(v1, v0); e2.subVectors(v2, v0);
    n.crossVectors(e1, e2);
    if (n.lengthSq() < 1e-12) n.set(0, 1, 0); else n.normalize();
    for (const p of f) { pos.push(p[0], p[1], p[2]); nor.push(n.x, n.y, n.z); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    base += 4;
  }
  return { pos, nor, idx };
}

/** A flat pennant blade — apex up, mounted proud of the chest. `scale.y = -1`
 *  turns ally into hostile with zero extra geometry. Shape is the primary IFF
 *  channel; colour only reinforces it (docs/specs/palette.mjs IFF_BEACON). */
function pennant({ h = 0.115, w = 0.075, thick = 0.012 }) {
  const pos = [], nor = [], idx = [];
  const front = [[0, h, thick], [-w, -h * 0.45, thick], [w, -h * 0.45, thick]];
  const back = [[0, h, -thick], [w, -h * 0.45, -thick], [-w, -h * 0.45, -thick]];
  const push = (tri, nz) => {
    const base = pos.length / 3;
    for (const p of tri) { pos.push(p[0], p[1], p[2]); nor.push(0, 0, nz); }
    idx.push(base, base + 1, base + 2);
  };
  push(front, 1); push(back, -1);
  // three rim quads so the pennant has thickness in silhouette from the side
  const rims = [[front[0], front[1], back[2], back[0]], [front[1], front[2], back[1], back[2]], [front[2], front[0], back[0], back[1]]];
  const a = new THREE.Vector3(), b2 = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
  for (const q of rims) {
    a.fromArray(q[0]); b2.fromArray(q[1]); c.fromArray(q[2]);
    e1.subVectors(b2, a); e2.subVectors(c, a);
    n.crossVectors(e1, e2).normalize();
    const base = pos.length / 3;
    for (const p of q) { pos.push(p[0], p[1], p[2]); nor.push(n.x, n.y, n.z); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { pos, nor, idx };
}

/* ── per-hero shell parameters ───────────────────────────────────────────────
   Height comes from HERO_HEIGHTS_M in the spec and is applied as a uniform
   scale on the root, so proportions always sum to HERO_M in rig space and the
   silhouette-area band in tools/rig.mjs needs no per-hero special case. */
const BUILD = {
  kaida: { lofted: true, torsoW: 0.30, torsoD: 0.19, arm: 0.105, leg: 0.135, boot: 0.150, skirt: 'coat', pauldron: 'right', hair: 'ponytail', weapon: 'kaida-sword', back: null },
  vex: { torsoW: 0.255, torsoD: 0.165, arm: 0.090, leg: 0.120, boot: 0.130, skirt: 'robe', pauldron: 'none', hair: 'hood', weapon: 'staff', back: null },
  rune: { torsoW: 0.360, torsoD: 0.230, arm: 0.125, leg: 0.160, boot: 0.175, skirt: null, pauldron: 'both', hair: 'crop', weapon: 'maul', back: 'pack' },
  grunt: { torsoW: 0.320, torsoD: 0.215, arm: 0.115, leg: 0.145, boot: 0.155, skirt: null, pauldron: 'both', hair: 'crest', weapon: 'cleaver', back: null },
};

/** Enemy palette, shaped like a hero palette so every downstream consumer —
 *  material builder, gate, portrait — takes exactly one code path. */
function enemyPalette(variant = 0) {
  const E = ENEMY_PALETTE_FAMILY;
  return {
    skin: E.hide[variant % E.hide.length],
    hair: E.chitin[0], eyes: E.eyes,
    clothPrimary: E.chitin[variant % E.chitin.length], clothSecondary: E.hide[(variant + 1) % E.hide.length],
    trim: E.warning, metal: '#6b6355', weaponEmissive: E.warning, shadowTint: '#0f0b07',
  };
}

export function paletteFor(id) {
  // Kaida's palette is SAMPLED from her own sprites (see kaida.js). The
  // inherited HERO_PALETTES entry was invented and is wrong where you can see
  // it — a navy jacket that is plainly teal, a tan skin tone on a pale
  // character. The other three keep theirs until their own re-spec.
  if (id === 'kaida') return { ...HERO_PALETTES.kaida, ...KAIDA_PALETTE };
  return HERO_PALETTES[id] || enemyPalette(0);
}

/* ── shell authoring ─────────────────────────────────────────────────────────
   Each entry: [boneName, prismArgs, paletteKey, materialClass, partTag].
   partTag groups verts so the gate can fingerprint "head" and "torso"
   independently of how many prisms each happens to be made of. */
function shellParts(id, P, B) {
  // Kaida is rebuilt from lofted cross-sections (Phase 2.3). The other three
  // still use the prism shell and will until their own pass — the whole point
  // of the Kaida-only scope is that she settles the language first.
  if (id === 'kaida') return kaidaShellParts();
  const A = B.arm, L = B.leg;
  const parts = [];
  const add = (bone, geo, key, mat, tag) => parts.push({ bone, geo, key, mat, tag });

  // pelvis + belt — bone `hips` (world y 0.96)
  add('hips', prism({ y0: -0.07, y1: 0.14, w0: B.torsoW * 0.88, d0: B.torsoD * 0.92, w1: B.torsoW * 0.94, d1: B.torsoD * 0.95 }), 'clothSecondary', MAT.CLOTH, 'torso');
  add('hips', prism({ y0: 0.09, y1: 0.145, w0: B.torsoW * 0.99, d0: B.torsoD * 1.02 }), 'metal', MAT.METAL, 'torso');
  if (B.skirt === 'coat') {
    add('hips', prism({ y0: -0.30, y1: 0.06, w0: B.torsoW * 1.22, d0: B.torsoD * 1.35, w1: B.torsoW * 0.96, d1: B.torsoD * 1.0 }), 'clothPrimary', MAT.CLOTH, 'torso');
  } else if (B.skirt === 'robe') {
    add('hips', prism({ y0: -0.62, y1: 0.10, w0: B.torsoW * 1.45, d0: B.torsoD * 1.55, w1: B.torsoW * 1.0, d1: B.torsoD * 1.05 }), 'clothPrimary', MAT.CLOTH, 'torso');
  }

  // chest + trim + collar — bone `spine_upper` (world y 1.32)
  add('spine_upper', prism({ y0: -0.23, y1: 0.09, w0: B.torsoW * 0.93, d0: B.torsoD, w1: B.torsoW * 1.06, d1: B.torsoD * 1.06 }), 'clothPrimary', MAT.CLOTH, 'torso');
  add('spine_upper', prism({ y0: -0.16, y1: 0.05, w0: 0.055, d0: 0.02, z0: B.torsoD * 0.53 }), 'metal', MAT.METAL, 'torso');
  add('spine_upper', prism({ y0: 0.055, y1: 0.115, w0: 0.135, d0: 0.115 }), 'metal', MAT.METAL, 'torso');
  if (B.back === 'pack') {
    add('spine_upper', prism({ y0: -0.16, y1: 0.06, w0: 0.24, d0: 0.10, z0: -B.torsoD * 0.62 }), 'clothSecondary', MAT.CLOTH, 'torso');
  }

  // head — bone `neck` (world y 1.40). Crown lands at exactly 1.72 = HERO_M.
  add('neck', prism({ y0: 0.005, y1: 0.32, w0: 0.195, d0: 0.20, w1: 0.185, d1: 0.19 }), 'skin', MAT.SKIN, 'head');
  add('neck', prism({ y0: 0.155, y1: 0.195, w0: 0.155, d0: 0.02, z0: 0.098 }), 'eyes', MAT.NEON, 'head');
  if (B.hair === 'hood') {
    add('neck', prism({ y0: -0.01, y1: 0.32, w0: 0.235, d0: 0.245, w1: 0.16, d1: 0.17, z1: -0.02 }), 'clothPrimary', MAT.CLOTH, 'head');
    add('neck', prism({ y0: 0.20, y1: 0.28, w0: 0.16, d0: 0.06, z0: 0.115 }), 'clothSecondary', MAT.CLOTH, 'head');
  } else {
    add('neck', prism({ y0: 0.245, y1: 0.32, w0: 0.215, d0: 0.215, w1: 0.19, d1: 0.19 }), 'hair', MAT.CLOTH, 'head');
    add('neck', prism({ y0: 0.06, y1: 0.30, w0: 0.20, d0: 0.055, z0: -0.085 }), 'hair', MAT.CLOTH, 'head');
    if (B.hair === 'ponytail') add('neck', prism({ y0: -0.14, y1: 0.26, w0: 0.075, d0: 0.075, w1: 0.055, d1: 0.055, z0: -0.13, z1: -0.16 }), 'hair', MAT.CLOTH, 'head');
    if (B.hair === 'crest') add('neck', prism({ y0: 0.30, y1: 0.40, w0: 0.03, d0: 0.17 }), 'trim', MAT.NEON, 'head');
  }
  // neck stub rides the chest, not the head, so a head turn does not drag it
  add('spine_upper', prism({ y0: 0.04, y1: 0.10, w0: 0.085, d0: 0.085 }), 'skin', MAT.SKIN, 'torso');

  for (const s of ['L', 'R']) {
    const sgn = s === 'L' ? 1 : -1;
    add(`shoulder_${s}`, prism({ y0: -0.28, y1: 0.02, w0: A, d0: A, w1: A * 1.24, d1: A * 1.24 }), 'clothPrimary', MAT.CLOTH, 'arm');
    if (B.pauldron === 'both' || (B.pauldron === 'right' && s === 'R')) {
      add(`shoulder_${s}`, prism({ y0: -0.075, y1: 0.085, w0: A * 1.75, d0: A * 1.7, w1: A * 1.5, d1: A * 1.45, x0: sgn * 0.012 }), 'metal', MAT.METAL, 'arm');
    }
    add(`upperArm_${s}`, prism({ y0: -0.24, y1: 0.01, w0: A * 0.82, d0: A * 0.82, w1: A * 0.98, d1: A * 0.98 }), 'clothSecondary', MAT.CLOTH, 'arm');
    add(`lowerArm_${s}`, prism({ y0: -0.10, y1: 0.01, w0: A * 0.86, d0: A * 0.94 }), 'metal', MAT.METAL, 'arm');
    add(`upperLeg_${s}`, prism({ y0: -0.42, y1: 0.03, w0: L * 0.86, d0: L * 0.94, w1: L, d1: L * 1.08 }), 'clothPrimary', MAT.CLOTH, 'leg');
    add(`lowerLeg_${s}`, prism({ y0: -0.46, y1: 0.01, w0: L * 0.80, d0: L * 0.88, w1: L * 0.92, d1: L * 1.0 }), 'clothSecondary', MAT.CLOTH, 'leg');
    add(`lowerLeg_${s}`, prism({ y0: -0.05, y1: 0.045, w0: L * 0.96, d0: L * 0.55, z0: L * 0.34 }), 'metal', MAT.METAL, 'leg');
    add(`foot_${s}`, prism({ y0: -0.06, y1: 0.055, w0: B.boot, d0: B.boot * 1.7, w1: B.boot * 0.88, d1: B.boot * 1.25, z0: B.boot * 0.30, z1: B.boot * 0.12 }), 'metal', MAT.HIDE, 'leg');
  }
  return parts;
}

/* ── weapons — separate meshes on socket.weapon, per the spec's contract ─────
   Authored with the grip at their own local origin, +Y toward the tip. That is
   what lets three different swords share one socket transform with no per-item
   offset hack, which is the entire reason the socket convention exists. */
export function weaponParts(kind, P) {
  const p = [];
  const add = (geo, key, mat) => p.push({ geo, key, mat });
  if (kind === 'kaida-sword') return kaidaWeaponParts();
  if (kind === 'sword') {
    add(prism({ y0: -0.11, y1: 0.02, w0: 0.038, d0: 0.048 }), 'shadowTint', MAT.HIDE);
    add(prism({ y0: 0.02, y1: 0.062, w0: 0.20, d0: 0.055 }), 'metal', MAT.METAL);
    add(prism({ y0: 0.062, y1: 0.86, w0: 0.082, d0: 0.030, w1: 0.020, d1: 0.012 }), 'metal', MAT.METAL);
    add(prism({ y0: 0.09, y1: 0.80, w0: 0.020, d0: 0.036, w1: 0.008, d1: 0.020 }), 'weaponEmissive', MAT.NEON);
  } else if (kind === 'staff') {
    add(prism({ y0: -0.42, y1: 0.92, w0: 0.036, d0: 0.036, w1: 0.030, d1: 0.030 }), 'metal', MAT.METAL);
    add(prism({ y0: 0.92, y1: 1.02, w0: 0.105, d0: 0.105, w1: 0.06, d1: 0.06 }), 'weaponEmissive', MAT.NEON);
    add(prism({ y0: -0.04, y1: 0.03, w0: 0.07, d0: 0.07 }), 'clothSecondary', MAT.CLOTH);
  } else if (kind === 'maul') {
    add(prism({ y0: -0.16, y1: 0.62, w0: 0.048, d0: 0.048 }), 'shadowTint', MAT.HIDE);
    add(prism({ y0: 0.62, y1: 0.84, w0: 0.24, d0: 0.19, w1: 0.20, d1: 0.16 }), 'metal', MAT.METAL);
    add(prism({ y0: 0.68, y1: 0.78, w0: 0.26, d0: 0.045 }), 'weaponEmissive', MAT.NEON);
  } else if (kind === 'cleaver') {
    add(prism({ y0: -0.09, y1: 0.04, w0: 0.045, d0: 0.05 }), 'shadowTint', MAT.HIDE);
    add(prism({ y0: 0.04, y1: 0.58, w0: 0.055, d0: 0.026, w1: 0.16, d1: 0.020, z1: 0.05 }), 'metal', MAT.METAL);
    add(prism({ y0: 0.10, y1: 0.56, w0: 0.018, d0: 0.030, z0: -0.02 }), 'weaponEmissive', MAT.NEON);
  }
  return p;
}

/** Merge a list of {geo, key, mat} into one indexed BufferGeometry, optionally
 *  transforming each part by its bone's bind matrix and tagging skin weights. */
function mergeParts(parts, palette, { bindOf = null, indexOf = null } = {}) {
  const pos = [], nor = [], colr = [], amat = [], sIdx = [], sWt = [], idx = [];
  const ranges = {};
  const v = new THREE.Vector3(), nv = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  let vbase = 0;
  for (const part of parts) {
    const m = bindOf ? bindOf(part.bone) : null;
    if (m) nm.getNormalMatrix(m);
    const bi = indexOf ? indexOf(part.bone) : 0;
    const c = col(palette[part.key] ?? '#ff00ff');
    const n = part.geo.pos.length / 3;
    const tag = part.tag || 'prop';
    const r = ranges[tag] || (ranges[tag] = { start: vbase, count: 0 });
    for (let i = 0; i < n; i++) {
      v.set(part.geo.pos[i * 3], part.geo.pos[i * 3 + 1], part.geo.pos[i * 3 + 2]);
      nv.set(part.geo.nor[i * 3], part.geo.nor[i * 3 + 1], part.geo.nor[i * 3 + 2]);
      if (m) { v.applyMatrix4(m); nv.applyMatrix3(nm).normalize(); }
      pos.push(v.x, v.y, v.z); nor.push(nv.x, nv.y, nv.z);
      colr.push(c.r, c.g, c.b);
      amat.push(part.mat);
      sIdx.push(bi, 0, 0, 0); sWt.push(1, 0, 0, 0);
    }
    for (const i of part.geo.idx) idx.push(vbase + i);
    vbase += n;
    r.count = vbase - r.start;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(amat, 1));
  if (indexOf) {
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sWt, 4));
  }
  g.setIndex(idx);
  g.computeBoundingSphere();
  return { geometry: g, ranges };
}

/**
 * Build one actor.
 *
 * @param {object} o
 * @param {string} o.id        hero id: kaida | vex | rune | grunt
 * @param {'ally'|'hostile'} o.faction   drives the IFF pennant (shape first)
 * @param {object} o.uniforms  the shared actor uniforms
 */
export function buildActor({ id = 'kaida', faction = 'ally', uniforms, material }) {
  const B = BUILD[id] || BUILD.kaida;
  const P = paletteFor(id);
  const heightM = HERO_HEIGHTS_M[id] ?? HERO_M;

  /* bones, straight from the spec table */
  const boneByName = new Map();
  const bones = [];
  for (const j of JOINTS) {
    const b = new THREE.Bone();
    b.name = j.name;
    b.position.fromArray(j.offset);
    boneByName.set(j.name, b);
    bones.push(b);
  }
  for (const j of JOINTS) {
    if (j.parent) boneByName.get(j.parent).add(boneByName.get(j.name));
  }
  const rootBone = boneByName.get('hips');

  const root = new THREE.Group();
  root.name = `actor:${id}`;
  root.add(rootBone);
  root.updateMatrixWorld(true);              // bind pose, root still identity

  const skeleton = new THREE.Skeleton(bones); // captures the bind inverses here
  const boneIndex = new Map(bones.map((b, i) => [b.name, i]));

  const bindOf = (name) => boneByName.get(name).matrixWorld;
  const indexOf = (name) => boneIndex.get(name) ?? 0;

  const { geometry, ranges } = mergeParts(shellParts(id, P, B), P, { bindOf, indexOf });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = `${id}:body`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(skeleton);

  /* sockets — empty Object3Ds on a joint, NOT bones */
  const sockets = {};
  for (const [name, s] of Object.entries(SOCKETS)) {
    const o = new THREE.Object3D();
    o.name = `socket:${name}`;
    o.position.fromArray(s.offset);
    /* HAND SOCKETS FLIP. docs/specs/rig.mjs says a socket's local +Y points
       "along the prop's natural swing/extend axis", and every weapon is
       authored grip-at-origin, +Y-to-tip against that. But a hand bone's local
       +Y points back UP the arm toward the elbow — the chain's offsets run
       negative-Y downward — so an unrotated hand socket aimed every blade at
       its owner's shoulder. Kaida's sword was hanging point-up along her
       forearm, which is what made it visible. The spec's convention is right;
       the socket was not honouring it. Rotating here rather than authoring
       weapons upside-down keeps the contract that three swords share one
       transform with no per-item offset hack.

       SCOPED TO KAIDA. Applying it to everyone made tools/rig.mjs fail vex:
       her staff is long enough that pointing it correctly dangles the tip below
       her feet, which inflated her bind-pose silhouette to 1.816 m against a
       1.660 m spec — a 9.4% deviation on a +-6% band. That is the gate working,
       and it says two things worth keeping: the weapon convention needs a
       per-weapon carry pose (a staff is shouldered or planted, not hung), and
       the height assertion should measure the BODY rather than the body plus
       whatever it is holding. Both logged as weapon-socket-inverted. Kaida is
       the character in scope; the rest get this with their own re-spec. */
    if (B.lofted && (s.joint === 'hand_R' || s.joint === 'hand_L')) o.rotation.x = Math.PI;
    boneByName.get(s.joint).add(o);
    sockets[name] = o;
  }

  /* primary weapon, its own mesh, grip at its own local origin */
  let weapon = null;
  const wp = weaponParts(B.weapon, P);
  if (wp.length) {
    const w = mergeParts(wp, P);
    weapon = new THREE.Mesh(w.geometry, material);
    weapon.name = `${id}:${B.weapon}`;
    weapon.castShadow = true;
    weapon.receiveShadow = true;
    weapon.frustumCulled = false;
    sockets.weapon.add(weapon);
  }

  /* IFF ident-beacon on socket.chest. Shape is the read; colour reinforces. */
  const spec = IFF_BEACON[faction] || IFF_BEACON.ally;
  const beaconUniforms = { ...uniforms, uEmissive: { value: 3.4 } };
  const beaconMat = makeActorMaterial(beaconUniforms, { name: `beacon:${faction}` });
  const bg = mergeParts([{ geo: pennant({}), key: 'beacon', mat: MAT.NEON, tag: 'beacon' }],
    { beacon: spec.color });
  const beacon = new THREE.Mesh(bg.geometry, beaconMat);
  beacon.name = `${id}:iff:${spec.shape}`;
  beacon.frustumCulled = false;
  if (spec.shape === 'down') beacon.scale.y = -1;
  /* Not on the lofted character. Art's call, per GAME_PLAN 2.1: friend/foe must
     not be a glowing badge stapled to her chest — at 43 px it was the loudest
     thing on the whole figure, and defect 6 forbids a non-diegetic marker
     anyway. Kaida reads as a hero because she looks like one. The read for the
     rest of the cast is still open and is deferred, not solved. */
  if (!B.lofted) sockets.chest.add(beacon);

  /* per-hero height, applied as a uniform scale so proportions stay on-spec */
  const s = heightM / HERO_M;
  root.scale.setScalar(s);

  return {
    id, faction, root, mesh, weapon, beacon, beaconMat, beaconUniforms,
    skeleton, bones, boneByName, sockets, palette: P, build: B,
    heightM, scale: s, partRanges: ranges, weaponKind: B.weapon,
    pulseHz: spec.pulseHz, iffShape: spec.shape, iffColor: spec.color,
    tris: geometry.index.count / 3 + (weapon ? weapon.geometry.index.count / 3 : 0)
      + bg.geometry.index.count / 3,
  };
}

/** The spec's own tolerance, re-exported so callers do not invent a second one. */
export { HEIGHT_TOLERANCE, HERO_HEIGHTS_M, BUILD };
