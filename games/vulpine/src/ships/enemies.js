import * as THREE from 'three';
import { rng } from '../core/rng.js';
import { emissive } from '../render/materials.js';
import { SMat, buildShipMaterials } from './ship-materials.js';
import {
  loft, superellipse, assemble, M,
  hullLoft, wingLoft, chamferBox, extrudePoly, ductGeo, louvers,
  boltRow, blisterGeo, tubeAlong, shellArc, triCount,
} from '../render/geobuild.js';

// ─────────────────────────────────────────────────────────────────────────────
// Hostile craft.  OWNER: combat agent.
//
// Design brief, in the order a player actually resolves them:
//
//   1. SILHOUETTE.  Every class has to be nameable at 100 px, and none of them
//      may be confusable with the Arwing. The Arwing is a *dart*: pointed nose,
//      aft-swept wings, tips turned UP. So every hostile here inverts at least
//      two of those cues — forward sweep, anhedral, blunt or forked noses,
//      horizontal masses instead of vertical ones.
//   2. COLOUR.  Cold dark plating and red emissives against the Arwing's pale
//      paint and blue engines. Friend/foe is legible before shape is.
//   3. MASS.  A raptor is 6 m and reads light; a hornet is 11 m and reads heavy;
//      the vanguard is 30 m and reads like something you should be worried by.
//
// Construction rules that keep this affordable: one prototype per class, built
// once, cloned per instance (geometry and most materials shared). Parts are
// bucketed by material and merged, so a fighter costs 5–6 draws rather than 40.
// Anything that moves is its own named node so `rig()` can find it on a clone.
// ─────────────────────────────────────────────────────────────────────────────

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const R = rng('ship.enemy');

/* ── extra emissives, hostile-side ─────────────────────────────────────────── */
export const EMat = {};
let matsBuilt = false;
function buildEnemyMaterials() {
  if (matsBuilt) return EMat;
  matsBuilt = true;
  buildShipMaterials();
  EMat.exhaust = emissive(0xff6a1e, 4.2);
  EMat.exhaustCore = emissive(0xffc98a, 7.0);
  EMat.intake = emissive(0xff2a12, 2.4);
  EMat.eye = emissive(0xff3a20, 6.0);
  EMat.eyeAmber = emissive(0xffa02a, 5.0);
  EMat.droneCore = emissive(0xff8a10, 6.5);
  // Additive plume: one shared material, gradient carried in vertex alpha, so
  // every engine in the game costs nothing but its own draw.
  EMat.plume = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide,
  });
  return EMat;
}

/* ── part bucketing ────────────────────────────────────────────────────────── */
function Parts() {
  const map = new Map();
  return {
    add(mat, geo, mtx = null) {
      if (!geo) return;
      let a = map.get(mat);
      if (!a) { a = []; map.set(mat, a); }
      a.push([geo, mtx]);
    },
    /** Add a part and its mirror image across x = 0. */
    both(mat, geo, mtx = null) {
      this.add(mat, geo, mtx);
      this.add(mat, geo, mtx ? M.chain(M.s(-1, 1, 1), mtx) : M.s(-1, 1, 1));
    },
    into(parent, { cast = true, receive = true } = {}) {
      for (const [mat, list] of map) {
        const m = new THREE.Mesh(assemble(list), mat);
        m.castShadow = cast && !!mat.map;
        m.receiveShadow = receive && !!mat.map;
        parent.add(m);
      }
      map.clear();
      return parent;
    },
  };
}

/**
 * Additive exhaust plume. Authored from z = 0 (nozzle) aft to z = len, with the
 * gradient in vertex alpha — so it fades out in depth rather than ending on a
 * hard rim, and the whole engine bank of a ship merges into one draw.
 */
function plumeGeo({ r0 = 0.3, r1 = 0.10, len = 2.4, sides = 12, bulge = 1.35 }) {
  const rings = [];
  const N = 7;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = THREE.MathUtils.lerp(r0, r1, t) * (1 + (bulge - 1) * Math.sin(t * Math.PI) * 0.6);
    rings.push(superellipse(sides, r, r, 2.1).map(q => V3(q.x, q.y, t * len)));
  }
  const g = loft(rings, { capStart: false, capEnd: false, closed: true });
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getZ(i) / len, 0, 1);
    const hot = Math.pow(1 - t, 2.4);
    col[i * 4 + 0] = 1.30 * hot + 0.55 * (1 - t);
    col[i * 4 + 1] = 0.62 * hot + 0.12 * (1 - t);
    col[i * 4 + 2] = 0.24 * hot + 0.04 * (1 - t);
    col[i * 4 + 3] = Math.pow(1 - t, 1.5) * 0.9;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  return g;
}

/** Emissive nozzle face + its plume, as one reusable assembly. */
function engineNode(x, y, z, r, { len = 2.6, ring = true } = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const face = new THREE.Mesh(new THREE.CircleGeometry(r * 0.86, 16), EMat.exhaustCore);
  face.rotation.y = Math.PI;             // faces aft (+Z)
  face.position.z = 0.02;
  g.add(face);
  if (ring) {
    const halo = new THREE.Mesh(new THREE.RingGeometry(r * 0.86, r * 1.10, 18), EMat.exhaust);
    halo.rotation.y = Math.PI;
    halo.position.z = 0.01;
    g.add(halo);
  }
  const plume = new THREE.Mesh(plumeGeo({ r0: r * 0.92, r1: r * 0.22, len }), EMat.plume);
  plume.renderOrder = 6;
  g.add(plume);
  g.userData.plume = plume;
  g.userData.face = face;
  return g;
}

/* ═══════════════════════════════════════════════════════════════════════════
   RAPTOR — light interceptor
   Forward-swept crescent wing, twin outboard gun booms reaching level with the
   nose, anhedral tail fins, one wide slot exhaust. Read at 100 px it is a
   chevron pointing *away* from you — the exact inverse of the Arwing's dart.
   ═══════════════════════════════════════════════════════════════════════════ */

const RAPTOR_BODY = [
  { z: -3.10, rx: 0.075, ry: 0.062, p: 2.5, squash: 0.92 },
  { z: -2.72, rx: 0.215, ry: 0.150, p: 2.8, squash: 0.84, shoulder: 0.08 },
  { z: -2.05, rx: 0.375, ry: 0.255, p: 3.0, squash: 0.78, shoulder: 0.16 },
  { z: -1.05, rx: 0.505, ry: 0.350, p: 3.2, squash: 0.74, shoulder: 0.22 },
  { z: 0.05, rx: 0.560, ry: 0.400, p: 3.3, squash: 0.72, shoulder: 0.24 },
  { z: 1.15, rx: 0.535, ry: 0.395, p: 3.2, squash: 0.76, shoulder: 0.20 },
  { z: 2.10, rx: 0.470, ry: 0.360, p: 3.0, squash: 0.84, shoulder: 0.10 },
  { z: 2.72, rx: 0.430, ry: 0.330, p: 2.9, squash: 0.90, shoulder: 0.02 },
];

const RAPTOR_WING = [
  { span: 0.44, chord: 2.55, thickness: 0.150, sweep: 0.34, rise: 0.07 },
  { span: 1.25, chord: 2.18, thickness: 0.120, sweep: -0.36, rise: 0.04 },
  { span: 2.15, chord: 1.76, thickness: 0.092, sweep: -1.16, rise: -0.03 },
  { span: 2.95, chord: 1.34, thickness: 0.072, sweep: -1.94, rise: -0.15 },
  { span: 3.42, chord: 0.98, thickness: 0.056, sweep: -2.44, rise: -0.28 },
];

const RAPTOR_FIN = [
  { span: 0.00, chord: 1.55, thickness: 0.150, sweep: 0.00 },
  { span: 0.48, chord: 1.26, thickness: 0.110, sweep: 0.30 },
  { span: 0.96, chord: 0.94, thickness: 0.078, sweep: 0.66 },
  { span: 1.30, chord: 0.56, thickness: 0.052, sweep: 1.02 },
];

const RAPTOR_POD = [
  { z: -3.44, rx: 0.050, ry: 0.050, p: 2.6 },
  { z: -3.18, rx: 0.145, ry: 0.140, p: 3.0 },
  { z: -2.60, rx: 0.205, ry: 0.195, p: 3.2 },
  { z: -1.60, rx: 0.215, ry: 0.205, p: 3.2 },
  { z: -0.75, rx: 0.185, ry: 0.180, p: 3.0 },
  { z: -0.30, rx: 0.130, ry: 0.126, p: 2.8 },
];

function raptorProto() {
  const root = new THREE.Group();
  root.name = 'raptor';
  const p = Parts();

  /* body — panel seams girth-wise, two stringers aft, an intake well each side */
  p.add(SMat.hostile, hullLoft({
    stations: RAPTOR_BODY, count: 24, steps: 22,
    circGrooves: [
      { z: -2.05, depth: 0.022, width: 0.055 },
      { z: -0.35, depth: 0.026, width: 0.06 },
      { z: 1.55, depth: 0.024, width: 0.055 },
    ],
    longGrooves: [
      { a: 0.25, depth: 0.020, width: 0.014, z0: -2.2, z1: 2.5 },
      { a: 0.75, depth: 0.020, width: 0.014, z0: -2.2, z1: 2.5 },
    ],
    dents: [
      { z: 0.55, a: 0.0, rz: 0.62, ra: 0.075, depth: 0.10, rim: 0.5 },
      { z: 0.55, a: 0.5, rz: 0.62, ra: 0.075, depth: 0.10, rim: 0.5 },
    ],
  }));

  /* dorsal spine — breaks the top silhouette so it is not a smooth tube */
  p.add(SMat.hostilePlate, hullLoft({
    stations: [
      { z: -1.85, rx: 0.11, ry: 0.030, p: 3.2, yOff: 0.30 },
      { z: -0.60, rx: 0.19, ry: 0.072, p: 3.4, yOff: 0.36 },
      { z: 0.90, rx: 0.175, ry: 0.068, p: 3.4, yOff: 0.35 },
      { z: 2.05, rx: 0.10, ry: 0.030, p: 3.0, yOff: 0.31 },
    ], count: 16, steps: 10,
  }));

  /* crescent wing + its leading-edge trim flash */
  const wing = wingLoft(RAPTOR_WING, {
    res: 20, steps: 9,
    spanGrooves: [{ span: 1.25, depth: 0.014, width: 0.05 }, { span: 2.15, depth: 0.014, width: 0.05 }],
    chordGrooves: [{ xc: 0.62, depth: 0.012, width: 0.05 }],
  });
  p.both(SMat.hostile, wing, M.chain(M.t(0, 0.04, 0.05), M.rz(-0.10)));

  // red chevron on the upper wing — the friend/foe tell at range
  const flash = extrudePoly([
    new THREE.Vector2(0.70, 0.10), new THREE.Vector2(3.05, -1.66),
    new THREE.Vector2(3.05, -1.22), new THREE.Vector2(0.70, 0.58),
  ], 0.05, 0.012);
  p.both(SMat.hostileTrim, flash, M.chain(M.t(0, 0.115, 0), M.rx(-Math.PI / 2), M.rz(0)));

  /* outboard gun booms */
  const pod = hullLoft({
    stations: RAPTOR_POD, count: 16, steps: 12,
    circGrooves: [{ z: -2.05, depth: 0.018, width: 0.05 }],
  });
  p.both(SMat.hostilePlate, pod, M.t(3.20, -0.16, -0.30));
  p.both(SMat.metalDark, ductGeo({ rx: 0.075, ry: 0.075, depth: 0.30, throat: 0.5, lip: 0.02, sides: 12 }),
    M.chain(M.t(3.20, -0.16, -3.50), M.ry(Math.PI)));
  p.both(SMat.metal, tubeAlong([V3(0, 0, -3.62), V3(0, 0, -3.30)], 0.048, 8),
    M.t(3.20, -0.16, 0));
  p.both(SMat.hostileGlow, new THREE.CircleGeometry(0.055, 10),
    M.chain(M.t(3.20, -0.16, -3.63), M.ry(Math.PI)));

  /* pylon from wing to boom — thickness, and it kills the floating-pod look */
  p.both(SMat.metalDark, chamferBox(0.10, 0.30, 1.30, 0.03), M.chain(M.t(3.20, 0.02, -1.35), M.rx(0.04)));

  /* anhedral tail fins */
  const fin = wingLoft(RAPTOR_FIN, { res: 16, steps: 7 });
  p.both(SMat.hostile, fin, M.chain(M.t(0.36, -0.12, 1.10), M.rz(-2.42)));
  p.both(SMat.hostileTrim, chamferBox(0.055, 0.30, 0.42, 0.02),
    M.chain(M.t(0.36, -0.12, 1.10), M.rz(-2.42), M.t(1.16, 0, 0.62)));

  /* canopy: dark, low, wrapped in a heavy frame — nothing like the Arwing bubble */
  p.add(SMat.hostilePlate, hullLoft({
    stations: [
      { z: -2.30, rx: 0.16, ry: 0.045, p: 3.0, yOff: 0.20 },
      { z: -1.90, rx: 0.30, ry: 0.135, p: 3.2, yOff: 0.22 },
      { z: -1.35, rx: 0.345, ry: 0.170, p: 3.4, yOff: 0.24 },
      { z: -0.85, rx: 0.30, ry: 0.130, p: 3.2, yOff: 0.25 },
      { z: -0.55, rx: 0.20, ry: 0.060, p: 3.0, yOff: 0.25 },
    ], count: 18, steps: 10,
  }));
  const glass = hullLoft({
    stations: [
      { z: -2.22, rx: 0.11, ry: 0.030, p: 3.0, yOff: 0.245 },
      { z: -1.88, rx: 0.245, ry: 0.115, p: 3.2, yOff: 0.255 },
      { z: -1.35, rx: 0.285, ry: 0.145, p: 3.4, yOff: 0.272 },
      { z: -0.88, rx: 0.245, ry: 0.108, p: 3.2, yOff: 0.278 },
      { z: -0.62, rx: 0.15, ry: 0.045, p: 3.0, yOff: 0.275 },
    ], count: 18, steps: 10,
  });

  /* nose sensor cluster — the red eye */
  p.add(SMat.metalDark, blisterGeo({ rx: 0.13, ry: 0.09, rz: 0.20, seg: 12, rings: 4 }),
    M.chain(M.t(0, -0.02, -2.70), M.rx(-1.62)));
  p.add(SMat.hostile, boltRow({ from: [-0.30, 0.16, -1.05], to: [0.30, 0.16, -1.05], n: 5, r: 0.016, h: 0.010 }));

  /* aft engine bay: slot nozzle, louvred heat vents either side */
  p.add(SMat.heat, hullLoft({
    stations: [
      { z: 2.30, rx: 0.47, ry: 0.36, p: 3.0, squash: 0.86 },
      { z: 2.78, rx: 0.44, ry: 0.335, p: 3.0, squash: 0.88 },
      { z: 2.98, rx: 0.40, ry: 0.30, p: 3.0, squash: 0.90 },
    ], count: 20, steps: 4, capStart: false,
  }));
  p.add(SMat.ceramic, ductGeo({ rx: 0.34, ry: 0.25, depth: 0.42, throat: 0.72, lip: 0.035, sides: 18, p: 3.0 }),
    M.chain(M.t(0, 0.03, 2.99), M.ry(Math.PI)));
  p.both(SMat.metalDark, louvers({ n: 5, w: 0.42, h: 0.030, d: 0.07, gap: 0.055, tilt: -0.5 }),
    M.chain(M.t(0.44, 0.16, 1.85), M.ry(1.32)));

  p.into(root);

  const g = new THREE.Mesh(glass, SMat.hostileGlass);
  g.renderOrder = 3;
  root.add(g);

  // eye + engine, per-instance emissives
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), EMat.eye);
  eye.position.set(0, -0.02, -2.86);
  eye.name = 'eye';
  root.add(eye);

  const eng = engineNode(0, 0.03, 3.0, 0.30, { len: 3.4 });
  eng.name = 'engine';
  root.add(eng);

  root.userData.spec = {
    kind: 'raptor', radius: 2.6, hp: 3, score: 100,
    guns: [V3(3.20, -0.16, -3.62), V3(-3.20, -0.16, -3.62)],
    maxSpeed: 235, turnRate: 1.55, accel: 130,
    fireRange: 620, burst: 3, burstGap: 0.13, reload: 1.35, dmg: 7,
    boomScale: 1.25,
  };
  return root;
}

/* ═══════════════════════════════════════════════════════════════════════════
   HORNET — twin-hull gunboat
   Two heavy engine hulls bridged by a thick centre box with a turret ball slung
   under it. A wide horizontal mass with two blobs and a ball: unmistakable in
   silhouette and physically impossible to confuse with a single-fuselage ship.
   ═══════════════════════════════════════════════════════════════════════════ */

const HORNET_HULL = [
  { z: -4.30, rx: 0.30, ry: 0.28, p: 3.0 },
  { z: -3.70, rx: 0.55, ry: 0.50, p: 3.2 },
  { z: -2.40, rx: 0.78, ry: 0.70, p: 3.4, shoulder: 0.10 },
  { z: -0.60, rx: 0.86, ry: 0.78, p: 3.5, shoulder: 0.14 },
  { z: 1.40, rx: 0.84, ry: 0.76, p: 3.5, shoulder: 0.12 },
  { z: 3.20, rx: 0.76, ry: 0.70, p: 3.4, shoulder: 0.05 },
  { z: 4.35, rx: 0.66, ry: 0.62, p: 3.2 },
  { z: 4.80, rx: 0.60, ry: 0.56, p: 3.1 },
];

function hornetProto() {
  const root = new THREE.Group();
  root.name = 'hornet';
  const p = Parts();

  /* outboard hulls */
  const hull = hullLoft({
    stations: HORNET_HULL, count: 24, steps: 22,
    circGrooves: [
      { z: -2.40, depth: 0.030, width: 0.07 },
      { z: 0.40, depth: 0.032, width: 0.075 },
      { z: 3.05, depth: 0.028, width: 0.07 },
    ],
    longGrooves: [{ a: 0.25, depth: 0.026, width: 0.016, z0: -3.4, z1: 4.2 }],
    dents: [{ z: -1.60, a: 0.0, rz: 0.85, ra: 0.09, depth: 0.13, rim: 0.5 },
    { z: -1.60, a: 0.5, rz: 0.85, ra: 0.09, depth: 0.13, rim: 0.5 }],
  });
  p.both(SMat.hostile, hull, M.t(3.55, 0, 0));

  // ram intake at the front of each hull — real depth, reads as an aircraft
  p.both(SMat.metalDark, ductGeo({ rx: 0.36, ry: 0.34, depth: 0.55, throat: 0.55, lip: 0.05, sides: 18, p: 3.0 }),
    M.chain(M.t(3.55, 0.02, -4.34), M.ry(Math.PI)));
  p.both(EMat.intake, new THREE.CircleGeometry(0.19, 14), M.chain(M.t(3.55, 0.02, -3.92), M.ry(Math.PI)));

  // armour bands over the hull crown
  for (const z of [-2.05, -0.15, 1.75]) {
    p.both(SMat.hostilePlate, shellArc({ r: 0.90, t: 0.055, a0: 0.55, a1: Math.PI - 0.55, z0: z - 0.42, z1: z + 0.42, seg: 12 }),
      M.t(3.55, 0, 0));
  }
  p.both(SMat.hostileTrim, shellArc({ r: 0.925, t: 0.030, a0: 1.30, a1: 1.84, z0: -3.0, z1: 3.4, seg: 5 }),
    M.t(3.55, 0, 0));

  /* centre wing box — thick, slabby, with recessed panel bays */
  p.add(SMat.hostilePlate, hullLoft({
    stations: [
      { z: -2.55, rx: 2.90, ry: 0.24, p: 3.8 },
      { z: -1.60, rx: 3.30, ry: 0.42, p: 4.0 },
      { z: 0.30, rx: 3.40, ry: 0.50, p: 4.0 },
      { z: 2.10, rx: 3.20, ry: 0.42, p: 3.9 },
      { z: 3.10, rx: 2.85, ry: 0.26, p: 3.6 },
    ], count: 26, steps: 14,
    circGrooves: [{ z: -0.70, depth: 0.035, width: 0.08 }, { z: 1.30, depth: 0.035, width: 0.08 }],
    longGrooves: [{ a: 0.25, depth: 0.030, width: 0.03, z0: -2.2, z1: 2.8 }],
  }));

  /* dorsal spine housing with a warning strobe */
  p.add(SMat.hostile, chamferBox(1.10, 0.44, 3.10, 0.10), M.t(0, 0.62, 0.10));
  p.add(SMat.hostileTrim, chamferBox(0.28, 0.10, 2.60, 0.03), M.t(0, 0.85, 0.10));
  p.add(SMat.metalDark, louvers({ n: 6, w: 0.90, h: 0.040, d: 0.09, gap: 0.070, tilt: -0.55 }),
    M.chain(M.t(0, 0.62, 1.62), M.rx(-1.35)));

  /* wing-root cannon barrels reaching forward past the box */
  p.both(SMat.metal, tubeAlong([V3(0, 0, -2.20), V3(0, 0, -4.30)], (t) => 0.085 - t * 0.020, 10),
    M.t(1.75, -0.18, 0));
  p.both(SMat.metalDark, chamferBox(0.24, 0.24, 0.34, 0.05), M.t(1.75, -0.18, -4.18));
  p.both(SMat.hostileGlow, new THREE.CircleGeometry(0.062, 10), M.chain(M.t(1.75, -0.18, -4.36), M.ry(Math.PI)));

  /* belly hardpoints */
  p.both(SMat.metalDark, chamferBox(0.36, 0.22, 1.50, 0.06), M.t(2.30, -0.58, 0.30));

  p.into(root);

  /* turret ball — the moving part. Yaws on Y, barrels elevate on X. */
  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, -0.62, -0.35);
  {
    const tp = Parts();
    tp.add(SMat.hostilePlate, hullLoft({
      stations: [
        { z: -0.55, rx: 0.42, ry: 0.40, p: 2.6 },
        { z: -0.10, rx: 0.62, ry: 0.58, p: 2.8 },
        { z: 0.45, rx: 0.55, ry: 0.52, p: 2.7 },
        { z: 0.72, rx: 0.36, ry: 0.34, p: 2.5 },
      ], count: 18, steps: 10,
      circGrooves: [{ z: 0.10, depth: 0.028, width: 0.06 }],
    }));
    tp.add(SMat.hostileTrim, shellArc({ r: 0.64, t: 0.04, a0: -0.5, a1: 0.5, z0: -0.25, z1: 0.30, seg: 8 }));
    tp.into(turret);
  }
  const barrels = new THREE.Group();
  barrels.name = 'barrels';
  barrels.position.set(0, 0, -0.42);
  {
    const bp = Parts();
    bp.add(SMat.metalDark, chamferBox(0.46, 0.30, 0.42, 0.06), M.t(0, 0, 0.06));
    bp.both(SMat.metal, tubeAlong([V3(0, 0, 0), V3(0, 0, -0.95)], (t) => 0.062 - t * 0.012, 8), M.t(0.15, 0, -0.10));
    bp.both(SMat.metalDark, chamferBox(0.13, 0.13, 0.16, 0.03), M.t(0.15, 0, -1.00));
    bp.both(SMat.hostileGlow, new THREE.CircleGeometry(0.042, 8), M.chain(M.t(0.15, 0, -1.09), M.ry(Math.PI)));
    bp.into(barrels);
  }
  const teye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), EMat.eyeAmber);
  teye.position.set(0, 0.13, -0.30);
  teye.name = 'eye';
  barrels.add(teye);
  turret.add(barrels);
  root.add(turret);

  /* engines */
  for (const sx of [1, -1]) {
    const e = engineNode(sx * 3.55, 0.02, 4.85, 0.44, { len: 4.6 });
    e.name = 'engine';
    root.add(e);
  }

  root.userData.spec = {
    kind: 'hornet', radius: 4.6, hp: 14, score: 350,
    guns: [V3(1.75, -0.18, -4.36), V3(-1.75, -0.18, -4.36)],
    turretGun: V3(0, -0.62, -1.80),
    maxSpeed: 190, turnRate: 0.85, accel: 70,
    fireRange: 760, burst: 4, burstGap: 0.17, reload: 1.9, dmg: 10,
    boomScale: 2.4,
  };
  return root;
}

/* ═══════════════════════════════════════════════════════════════════════════
   BULWARK — emplaced ground turret
   Sunk hexagonal barbette, armoured collar, twin cannon on an elevating
   trunnion. Vertical, static, and orange-eyed: it reads as terrain furniture
   rather than as traffic, which is what stops it competing with the fighters.
   ═══════════════════════════════════════════════════════════════════════════ */

function hexPts(r, rot = 0) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = rot + (i / 6) * Math.PI * 2;
    out.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  return out;
}

function bulwarkProto() {
  const root = new THREE.Group();
  root.name = 'bulwark';
  const p = Parts();

  /* plinth, sunk so the terrain eats the bottom edge */
  p.add(SMat.hostilePlate, extrudePoly(hexPts(2.75), 1.5, 0.10), M.chain(M.t(0, 0.10, 0), M.rx(-Math.PI / 2)));
  p.add(SMat.hostile, extrudePoly(hexPts(2.30), 0.55, 0.07), M.chain(M.t(0, 1.05, 0), M.rx(-Math.PI / 2)));
  // buttresses: six wedges tying the collar to the plinth
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.52;
    p.add(SMat.metalDark, chamferBox(0.42, 0.70, 0.70, 0.06),
      M.chain(M.ry(-a), M.t(0, 0.72, 1.95), M.rx(0.55)));
  }
  p.add(SMat.hostileTrim, extrudePoly(hexPts(2.42), 0.10, 0.02), M.chain(M.t(0, 1.38, 0), M.rx(-Math.PI / 2)));
  p.add(SMat.metalDark, boltRow({ from: [-1.7, 1.45, -1.0], to: [1.7, 1.45, -1.0], n: 7, r: 0.035, h: 0.02 }));
  p.add(SMat.metalDark, boltRow({ from: [-1.7, 1.45, 1.0], to: [1.7, 1.45, 1.0], n: 7, r: 0.035, h: 0.02 }));
  p.into(root);

  /* rotating barbette */
  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 1.48, 0);
  {
    const tp = Parts();
    tp.add(SMat.hostile, hullLoft({
      stations: [
        { z: -1.35, rx: 1.05, ry: 0.55, p: 3.2, yOff: 0.62 },
        { z: -0.55, rx: 1.42, ry: 0.86, p: 3.6, yOff: 0.72 },
        { z: 0.55, rx: 1.48, ry: 0.92, p: 3.8, yOff: 0.74 },
        { z: 1.35, rx: 1.12, ry: 0.62, p: 3.2, yOff: 0.64 },
      ], count: 22, steps: 12,
      circGrooves: [{ z: 0.0, depth: 0.035, width: 0.09 }],
      longGrooves: [{ a: 0.25, depth: 0.030, width: 0.03, z0: -1.1, z1: 1.1 }],
    }));
    // sloped glacis over the front — armour that reads as armour
    tp.add(SMat.hostilePlate, chamferBox(2.00, 0.16, 1.05, 0.05), M.chain(M.t(0, 0.98, -0.95), M.rx(0.62)));
    tp.add(SMat.hostileTrim, chamferBox(1.50, 0.09, 0.22, 0.03), M.chain(M.t(0, 1.22, -1.20), M.rx(0.62)));
    tp.both(SMat.metalDark, louvers({ n: 4, w: 0.55, h: 0.045, d: 0.10, gap: 0.085, tilt: -0.6 }),
      M.chain(M.t(1.22, 0.90, 0.75), M.ry(1.15)));
    tp.add(SMat.metalDark, blisterGeo({ rx: 0.30, ry: 0.22, rz: 0.42, seg: 12, rings: 4 }), M.t(0, 1.52, 0.35));
    tp.into(turret);
  }

  const barrels = new THREE.Group();
  barrels.name = 'barrels';
  barrels.position.set(0, 1.02, -0.55);
  {
    const bp = Parts();
    bp.add(SMat.metalDark, chamferBox(1.10, 0.62, 0.85, 0.10));
    bp.both(SMat.metal, tubeAlong([V3(0, 0, 0.1), V3(0, 0, -2.35)], (t) => 0.115 - t * 0.028, 10), M.t(0.34, 0, 0));
    bp.both(SMat.metalDark, chamferBox(0.26, 0.26, 0.34, 0.05), M.t(0.34, 0, -2.30));
    bp.both(SMat.hostileTrim, chamferBox(0.20, 0.06, 0.50, 0.02), M.t(0.34, 0.16, -1.30));
    bp.both(SMat.hostileGlow, new THREE.CircleGeometry(0.075, 10), M.chain(M.t(0.34, 0, -2.48), M.ry(Math.PI)));
    bp.into(barrels);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), EMat.eyeAmber);
  eye.position.set(0, 0.30, -0.72);
  eye.name = 'eye';
  barrels.add(eye);
  turret.add(barrels);
  root.add(turret);

  root.userData.spec = {
    kind: 'bulwark', radius: 3.0, hp: 8, score: 150, static: true,
    guns: [V3(0.34, 2.50, -3.05), V3(-0.34, 2.50, -3.05)],
    maxSpeed: 0, turnRate: 1.2, accel: 0,
    fireRange: 700, burst: 2, burstGap: 0.20, reload: 1.6, dmg: 9,
    boomScale: 1.9,
  };
  return root;
}

/* ═══════════════════════════════════════════════════════════════════════════
   WASP — attack drone
   A 2.5 m faceted wedge with a caged core. Small, fast, suicidal; the "many"
   in the encounter grammar. Reads as a hot orange spark with fins.
   ═══════════════════════════════════════════════════════════════════════════ */

function waspProto() {
  const root = new THREE.Group();
  root.name = 'wasp';
  const p = Parts();

  p.add(SMat.hostilePlate, hullLoft({
    stations: [
      { z: -1.15, rx: 0.05, ry: 0.05, p: 3.4 },
      { z: -0.72, rx: 0.30, ry: 0.28, p: 3.8 },
      { z: -0.10, rx: 0.48, ry: 0.44, p: 4.0 },
      { z: 0.52, rx: 0.40, ry: 0.37, p: 3.8 },
      { z: 0.95, rx: 0.24, ry: 0.22, p: 3.4 },
    ], count: 14, steps: 9,
    circGrooves: [{ z: -0.10, depth: 0.05, width: 0.07 }],
  }));
  // four swept fins in an X
  for (let i = 0; i < 4; i++) {
    p.add(SMat.hostile, extrudePoly([
      new THREE.Vector2(0.30, -0.30), new THREE.Vector2(1.02, 0.34),
      new THREE.Vector2(1.02, 0.62), new THREE.Vector2(0.30, 0.16),
    ], 0.055, 0.014), M.chain(M.rz(i * Math.PI / 2 + Math.PI / 4), M.t(0, 0, 0.10), M.rx(-Math.PI / 2), M.rz(Math.PI / 2)));
  }
  p.add(SMat.metalDark, tubeAlong([V3(0, 0, -0.30), V3(0, 0, 0.30)], 0.30, 6, { closedEnds: false }));
  p.add(SMat.hostileTrim, shellArc({ r: 0.50, t: 0.05, a0: -0.35, a1: 0.35, z0: -0.30, z1: 0.30, seg: 5 }));
  p.into(root);

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), EMat.droneCore);
  core.name = 'eye';
  root.add(core);
  const eng = engineNode(0, 0, 0.98, 0.20, { len: 1.9 });
  eng.name = 'engine';
  root.add(eng);

  root.userData.spec = {
    kind: 'wasp', radius: 1.5, hp: 1, score: 60,
    guns: [], ram: true,
    maxSpeed: 270, turnRate: 2.2, accel: 200,
    fireRange: 0, burst: 0, burstGap: 1, reload: 1, dmg: 14,
    boomScale: 0.9,
  };
  return root;
}

/* ═══════════════════════════════════════════════════════════════════════════
   VANGUARD — assault dropship
   The mid-level set piece. 30 m of slab-sided transport on four lift nacelles,
   with a hangar mouth that opens and spits fighters. Big enough to change the
   scale of the frame the moment it arrives.
   ═══════════════════════════════════════════════════════════════════════════ */

const VAN_HULL = [
  { z: -13.0, rx: 1.05, ry: 0.85, p: 3.6, squash: 0.90 },
  { z: -10.5, rx: 1.95, ry: 1.35, p: 3.8, squash: 0.86, shoulder: 0.10 },
  { z: -6.5, rx: 2.80, ry: 1.85, p: 4.0, squash: 0.82, shoulder: 0.16 },
  { z: -1.5, rx: 3.25, ry: 2.10, p: 4.2, squash: 0.80, shoulder: 0.20 },
  { z: 3.5, rx: 3.20, ry: 2.05, p: 4.2, squash: 0.82, shoulder: 0.18 },
  { z: 8.5, rx: 2.85, ry: 1.85, p: 4.0, squash: 0.86, shoulder: 0.10 },
  { z: 12.0, rx: 2.35, ry: 1.55, p: 3.8, squash: 0.92, shoulder: 0.02 },
  { z: 13.6, rx: 2.05, ry: 1.35, p: 3.6, squash: 0.95 },
];

function vanguardProto() {
  const root = new THREE.Group();
  root.name = 'vanguard';
  const p = Parts();

  p.add(SMat.hostile, hullLoft({
    stations: VAN_HULL, count: 28, steps: 26,
    circGrooves: [
      { z: -9.0, depth: 0.10, width: 0.30 }, { z: -4.0, depth: 0.11, width: 0.32 },
      { z: 1.5, depth: 0.11, width: 0.32 }, { z: 6.5, depth: 0.10, width: 0.30 },
    ],
    longGrooves: [
      { a: 0.25, depth: 0.09, width: 0.020, z0: -11, z1: 12 },
      { a: 0.12, depth: 0.08, width: 0.016, z0: -10, z1: 11 },
      { a: 0.38, depth: 0.08, width: 0.016, z0: -10, z1: 11 },
    ],
    dents: [
      { z: -3.0, a: 0.0, rz: 2.6, ra: 0.055, depth: 0.35, rim: 0.55 },
      { z: -3.0, a: 0.5, rz: 2.6, ra: 0.055, depth: 0.35, rim: 0.55 },
      { z: 5.5, a: 0.0, rz: 2.0, ra: 0.05, depth: 0.30, rim: 0.55 },
      { z: 5.5, a: 0.5, rz: 2.0, ra: 0.05, depth: 0.30, rim: 0.55 },
    ],
  }));

  /* dorsal command block + fin */
  p.add(SMat.hostilePlate, hullLoft({
    stations: [
      { z: -8.2, rx: 1.05, ry: 0.35, p: 3.6, yOff: 2.05 },
      { z: -6.4, rx: 1.55, ry: 0.85, p: 3.8, yOff: 2.30 },
      { z: -3.8, rx: 1.65, ry: 0.95, p: 4.0, yOff: 2.38 },
      { z: -1.8, rx: 1.20, ry: 0.55, p: 3.6, yOff: 2.20 },
    ], count: 20, steps: 12,
  }));
  p.add(SMat.hostileGlass, hullLoft({
    stations: [
      { z: -8.0, rx: 0.75, ry: 0.24, p: 3.4, yOff: 2.42 },
      { z: -6.6, rx: 1.20, ry: 0.52, p: 3.6, yOff: 2.56 },
      { z: -5.2, rx: 1.15, ry: 0.48, p: 3.6, yOff: 2.58 },
      { z: -4.4, rx: 0.80, ry: 0.26, p: 3.4, yOff: 2.48 },
    ], count: 18, steps: 8,
  }));
  p.add(SMat.hostile, extrudePoly([
    new THREE.Vector2(2.0, 0), new THREE.Vector2(7.6, 0),
    new THREE.Vector2(7.6, 1.4), new THREE.Vector2(3.4, 4.1), new THREE.Vector2(2.0, 4.1),
  ], 0.44, 0.07), M.chain(M.t(0, 2.0, 0), M.ry(Math.PI / 2), M.rz(Math.PI / 2), M.rx(Math.PI / 2)));
  p.add(SMat.hostileTrim, chamferBox(0.30, 1.10, 0.20, 0.04), M.t(0, 5.20, 4.30));

  /* outrigger pylons + lift nacelles, fore and aft */
  for (const z of [-5.2, 6.6]) {
    const long = z > 0;
    p.both(SMat.metalDark, chamferBox(3.10, 0.62, 1.55, 0.14), M.chain(M.t(4.60, 0.35, z), M.rz(-0.16)));
    p.both(SMat.hostilePlate, hullLoft({
      stations: [
        { z: -2.55, rx: 0.62, ry: 0.60, p: 3.0 },
        { z: -1.80, rx: 1.02, ry: 0.98, p: 3.3 },
        { z: 0.40, rx: 1.14, ry: 1.10, p: 3.4 },
        { z: 2.20, rx: 1.00, ry: 0.96, p: 3.2 },
        { z: 2.85, rx: 0.86, ry: 0.82, p: 3.0 },
      ], count: 20, steps: 12,
      circGrooves: [{ z: 0.0, depth: 0.05, width: 0.14 }],
    }), M.t(6.35, 0.05, z + (long ? 0.4 : 0)));
    p.both(SMat.metalDark, ductGeo({ rx: 0.62, ry: 0.60, depth: 0.85, throat: 0.5, lip: 0.08, sides: 18, p: 3.0 }),
      M.chain(M.t(6.35, 0.05, z - 2.6 + (long ? 0.4 : 0)), M.ry(Math.PI)));
    p.both(EMat.intake, new THREE.CircleGeometry(0.33, 14),
      M.chain(M.t(6.35, 0.05, z - 1.9 + (long ? 0.4 : 0)), M.ry(Math.PI)));
    p.both(SMat.hostileTrim, shellArc({ r: 1.17, t: 0.06, a0: 1.15, a1: 2.0, z0: -1.4, z1: 1.8, seg: 6 }),
      M.t(6.35, 0.05, z + (long ? 0.4 : 0)));
  }

  /* belly hangar surround — the doors themselves are a moving part */
  p.add(SMat.metalDark, hullLoft({
    stations: [
      { z: -2.60, rx: 1.75, ry: 0.30, p: 4.0, yOff: -1.85 },
      { z: -2.20, rx: 2.05, ry: 0.42, p: 4.2, yOff: -1.95 },
      { z: 2.20, rx: 2.05, ry: 0.42, p: 4.2, yOff: -1.95 },
      { z: 2.60, rx: 1.75, ry: 0.30, p: 4.0, yOff: -1.85 },
    ], count: 20, steps: 8,
  }));
  p.add(EMat.intake, new THREE.PlaneGeometry(3.0, 4.0), M.chain(M.t(0, -2.30, 0), M.rx(Math.PI / 2)));

  /* sponson gun mounts */
  p.both(SMat.metalDark, chamferBox(0.85, 0.75, 2.10, 0.12), M.t(3.15, -0.95, -6.20));
  p.both(SMat.metal, tubeAlong([V3(0, 0, 0), V3(0, 0, -2.30)], (t) => 0.115 - t * 0.03, 10), M.t(3.35, -0.95, -7.10));
  p.both(SMat.hostileGlow, new THREE.CircleGeometry(0.08, 10), M.chain(M.t(3.35, -0.95, -9.45), M.ry(Math.PI)));

  p.into(root);

  /* hangar doors: two leaves that slide apart */
  for (const sx of [1, -1]) {
    const d = new THREE.Group();
    d.name = sx > 0 ? 'doorR' : 'doorL';
    const dp = Parts();
    dp.add(SMat.hostilePlate, chamferBox(1.55, 0.22, 3.9, 0.06), M.t(sx * 0.80, -2.20, 0));
    dp.add(SMat.hostileTrim, chamferBox(0.22, 0.06, 3.4, 0.02), M.t(sx * 1.35, -2.32, 0));
    dp.into(d);
    root.add(d);
  }

  /* engines */
  for (const sx of [1, -1]) for (const z of [-2.6, 9.8]) {
    const e = engineNode(sx * 6.35, 0.05, z + (z > 0 ? 0 : 0), 0.72, { len: 6.5 });
    e.name = 'engine';
    root.add(e);
  }

  root.userData.spec = {
    kind: 'vanguard', radius: 9.5, hp: 60, score: 1500,
    guns: [V3(3.35, -0.95, -9.45), V3(-3.35, -0.95, -9.45)],
    maxSpeed: 150, turnRate: 0.35, accel: 40,
    fireRange: 900, burst: 3, burstGap: 0.22, reload: 2.2, dmg: 12,
    boomScale: 5.0, carrier: true,
  };
  return root;
}

/* ═══════════════════════════════════════════════════════════════════════════
   registry / instancing
   ═══════════════════════════════════════════════════════════════════════════ */

const BUILDERS = {
  raptor: raptorProto,
  hornet: hornetProto,
  bulwark: bulwarkProto,
  wasp: waspProto,
  vanguard: vanguardProto,
};

const protos = new Map();

export function enemyProto(kind) {
  let g = protos.get(kind);
  if (!g) {
    buildEnemyMaterials();
    const b = BUILDERS[kind];
    if (!b) throw new Error('unknown enemy kind: ' + kind);
    g = b();
    g.userData.spec.tris = triCount(g);
    protos.set(kind, g);
  }
  return g;
}

export function enemySpec(kind) { return enemyProto(kind).userData.spec; }

/**
 * A fresh instance. Geometry and hull materials are shared with the prototype;
 * only the emissives that have to animate per-ship (the eye, the nozzle face)
 * are cloned, which is a handful of tiny MeshBasicMaterials per hull.
 */
export function createEnemy(kind) {
  const proto = enemyProto(kind);
  const root = proto.clone(true);
  root.userData.spec = proto.userData.spec;

  const rig = { engines: [], eyes: [], turret: null, barrels: null, doors: [] };
  root.traverse((o) => {
    if (o.name === 'engine') rig.engines.push(o);
    else if (o.name === 'turret') rig.turret = o;
    else if (o.name === 'barrels') rig.barrels = o;
    else if (o.name === 'doorL' || o.name === 'doorR') rig.doors.push(o);
    if (o.isMesh && o.name === 'eye') { o.material = o.material.clone(); rig.eyes.push(o); }
  });
  // The nozzle discs animate with throttle, so they need their own materials.
  //
  // These are re-found on the clone every time rather than read from userData:
  // Object3D.clone() round-trips userData through JSON, so any node reference
  // the prototype stored there comes back as an inert plain object — truthy,
  // but with no .material. Trusting it threw on the first spawned enemy.
  for (const e of rig.engines) {
    const f = e.children.find(c => c.isMesh && c.geometry?.type === 'CircleGeometry');
    if (f) f.material = f.material.clone();
    e.userData.face = f || null;
    e.userData.plume = e.children.find(c => c.isMesh && c.material === EMat.plume) || null;
  }
  root.userData.rig = rig;
  return root;
}

/** Release the per-instance material clones made by createEnemy. */
export function disposeEnemy(root) {
  const rig = root.userData.rig;
  if (!rig) return;
  for (const e of rig.eyes) e.material.dispose();
  for (const e of rig.engines) e.userData.face?.material?.dispose();
}

const _c = new THREE.Color();

/**
 * Per-frame cosmetics. `power` drives the engines, `alert` the eyes, `damage`
 * dims the whole electrical system so a dying ship visibly loses its lights
 * before it comes apart.
 */
export function animateEnemy(root, dt, { power = 1, alert = 0, damage = 0, t = 0 } = {}) {
  const rig = root.userData.rig;
  if (!rig) return;
  const flick = 1 + Math.sin(t * 37 + root.id) * 0.05;
  const live = (1 - damage);
  for (const e of rig.engines) {
    const k = power * live * flick;
    if (e.userData.plume) e.userData.plume.scale.set(0.75 + k * 0.45, 0.75 + k * 0.45, 0.45 + k * 0.85);
    const f = e.userData.face;
    if (f) f.material.color.copy(_c.setRGB(1.0, 0.72 - damage * 0.4, 0.42 - damage * 0.3)).multiplyScalar(2.2 + k * 5.0);
  }
  for (const e of rig.eyes) {
    const pulse = 0.7 + 0.3 * Math.sin(t * (alert > 0.5 ? 11 : 3.4) + root.id * 0.7);
    e.material.color.copy(_c.setRGB(1.0, 0.26 + alert * 0.26, 0.12)).multiplyScalar((2.4 + alert * 4.6) * pulse * live);
  }
}
