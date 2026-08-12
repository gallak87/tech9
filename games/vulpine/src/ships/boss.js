import * as THREE from 'three';
import { emissive } from '../render/materials.js';
import { SMat, buildShipMaterials } from './ship-materials.js';
import { EMat } from './enemies.js';
import {
  loft, superellipse, assemble, M,
  hullLoft, chamferBox, extrudePoly, ductGeo, louvers,
  boltRow, blisterGeo, tubeAlong, shellArc, triCount,
} from '../render/geobuild.js';

// ─────────────────────────────────────────────────────────────────────────────
// ORBITAL ASSAULT CARRIER "GARGANTUA" — the Corneria set-piece.
//
// 68 m long, 72 m across, and built to be the most expensive object on screen,
// because it is the only one when it is there. The rules it is designed around:
//
//   · READ THE WEAK POINTS.  A multi-part boss is only fun if the player can
//     see where to shoot without a tutorial. Every destructible is a *lit*
//     feature on an otherwise cold hull: two amber engine intakes, four turret
//     eyes, and finally a white-hot core. Nothing else on the ship glows.
//   · TELEGRAPH EVERYTHING.  The spinal cannon takes 2.4 s to spin up, and it
//     announces itself with three accelerator rings lighting in sequence and a
//     targeting line drawn down the corridor. Being killed by it is the
//     player's fault, which is the only way a big attack is satisfying.
//   · CHANGE STATE VISIBLY.  Phase 2 opens the belly hangar. Phase 3 retracts
//     six armour petals off the reactor. You can tell what phase you are in
//     from the silhouette alone.
//
// This file owns the *object* — geometry, rig, and the presentation of state.
// The decisions (when to charge, what to shoot) live in game/combat.js.
// ─────────────────────────────────────────────────────────────────────────────

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// HP is a stopwatch: the player's guns do ~14.8 dmg/s with every round on
// target, so 170 is eleven seconds of perfect fire. Budget the whole rig
// against how long the fight should last, not against how tough it should feel.
export const BOSS = {
  length: 68, span: 72,
  radius: 30,
  // Halved on the owner's call (2026-08-11) after playing it with the granted
  // gun. The older note said not to cut boss hp — that was written when tier-0's
  // 3.7 landed dmg/s was the only lever and cutting hp would have traded away the
  // per-compartment fight the owner likes. Both levers are in now: the pre-boss
  // grants give 5.6x dps *and* the compartments come down faster, so this is a
  // length cut on a fight whose structure already works, not a substitute for it.
  hullHp: 450,          // never the objective; it exists so stray rounds land
  engineHp: 85,
  turretHp: 30,
  coreHp: 160,
};

/* ── materials specific to the carrier ─────────────────────────────────────── */
const BM = {};
let built = false;
function bossMaterials() {
  if (built) return BM;
  built = true;
  buildShipMaterials();
  BM.core = emissive(0xfff0c8, 7.5);
  BM.coreRing = emissive(0xffb43a, 3.6);
  BM.intake = emissive(0xffa022, 3.2);
  BM.intakeDead = emissive(0x241a12, 0.6);
  BM.eye = emissive(0xff3a20, 5.0);
  BM.charge = emissive(0xffd070, 6.0);
  // Hit register: amber = a destructible part took the round, cold blue =
  // plating. The colour is how the player learns where to shoot.
  BM.hitWeak = new THREE.Color(1.00, 0.72, 0.30);
  BM.hitHull = new THREE.Color(0.52, 0.76, 1.00);
  BM.beam = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide,
  });
  BM.aim = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xff2a14).multiplyScalar(1.6), transparent: true, opacity: 0.0,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
    side: THREE.DoubleSide,
  });
  return BM;
}

function Parts() {
  const map = new Map();
  return {
    add(mat, geo, mtx = null) {
      if (!geo) return;
      let a = map.get(mat);
      if (!a) { a = []; map.set(mat, a); }
      a.push([geo, mtx]);
    },
    both(mat, geo, mtx = null) {
      this.add(mat, geo, mtx);
      this.add(mat, geo, mtx ? M.chain(M.s(-1, 1, 1), mtx) : M.s(-1, 1, 1));
    },
    into(parent, { cast = true } = {}) {
      for (const [mat, list] of map) {
        const m = new THREE.Mesh(assemble(list), mat);
        m.castShadow = cast && !!mat.map;
        m.receiveShadow = !!mat.map;
        parent.add(m);
      }
      map.clear();
      return parent;
    },
  };
}

/** Additive tube with the falloff in vertex alpha — beams and plumes. */
function glowTube({ r0, r1, len, sides = 14, hot = [1.6, 1.1, 0.5], cool = [0.9, 0.22, 0.06], power = 1.6 }) {
  const rings = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = THREE.MathUtils.lerp(r0, r1, t);
    rings.push(superellipse(sides, r, r, 2.0).map(q => V3(q.x, q.y, t * len)));
  }
  const g = loft(rings, { capStart: false, capEnd: false, closed: true });
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getZ(i) / len, 0, 1);
    const k = Math.pow(1 - t, power);
    col[i * 4 + 0] = cool[0] + (hot[0] - cool[0]) * k;
    col[i * 4 + 1] = cool[1] + (hot[1] - cool[1]) * k;
    col[i * 4 + 2] = cool[2] + (hot[2] - cool[2]) * k;
    col[i * 4 + 3] = 0.15 + 0.85 * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  return g;
}

/* ── main hull ─────────────────────────────────────────────────────────────── */
const HULL = [
  { z: -34.0, rx: 2.4, ry: 1.9, p: 4.0, squash: 0.92 },
  { z: -29.5, rx: 5.4, ry: 3.4, p: 4.2, squash: 0.86, shoulder: 0.10 },
  { z: -21.5, rx: 8.6, ry: 5.2, p: 4.4, squash: 0.80, shoulder: 0.16 },
  { z: -11.0, rx: 11.0, ry: 6.4, p: 4.6, squash: 0.78, shoulder: 0.21 },
  { z: 0.0, rx: 11.8, ry: 6.9, p: 4.6, squash: 0.78, shoulder: 0.23 },
  { z: 11.0, rx: 11.2, ry: 6.5, p: 4.6, squash: 0.80, shoulder: 0.20 },
  { z: 21.0, rx: 9.3, ry: 5.6, p: 4.4, squash: 0.85, shoulder: 0.11 },
  { z: 29.5, rx: 7.2, ry: 4.5, p: 4.2, squash: 0.91, shoulder: 0.03 },
  { z: 34.0, rx: 6.2, ry: 3.9, p: 4.0, squash: 0.95 },
];

/* ── one dorsal turret barbette ────────────────────────────────────────────── */
function turretModule(name) {
  const g = new THREE.Group();
  g.name = name;
  const p = Parts();
  p.add(SMat.bossHull, hullLoft({
    stations: [
      { z: -2.30, rx: 1.55, ry: 0.95, p: 3.4, yOff: 0.60 },
      { z: -0.90, rx: 2.15, ry: 1.45, p: 3.8, yOff: 0.78 },
      { z: 0.90, rx: 2.10, ry: 1.42, p: 3.8, yOff: 0.77 },
      { z: 2.30, rx: 1.50, ry: 0.92, p: 3.4, yOff: 0.58 },
    ], count: 22, steps: 12,
    circGrooves: [{ z: 0.0, depth: 0.06, width: 0.13 }],
  }));
  p.add(SMat.bossArmour, chamferBox(3.10, 0.26, 1.70, 0.08), M.chain(M.t(0, 1.62, -1.45), M.rx(0.58)));
  p.both(SMat.metalDark, louvers({ n: 4, w: 0.90, h: 0.075, d: 0.16, gap: 0.14, tilt: -0.6 }),
    M.chain(M.t(1.85, 1.35, 1.10), M.ry(1.2)));
  p.into(g);

  const barrels = new THREE.Group();
  barrels.name = 'barrels';
  barrels.position.set(0, 1.55, -0.9);
  const bp = Parts();
  bp.add(SMat.metalDark, chamferBox(1.75, 0.95, 1.40, 0.14));
  bp.both(SMat.metal, tubeAlong([V3(0, 0, 0.2), V3(0, 0, -3.6)], (t) => 0.19 - t * 0.05, 10), M.t(0.52, 0, 0));
  bp.both(SMat.metalDark, chamferBox(0.42, 0.42, 0.55, 0.08), M.t(0.52, 0, -3.55));
  bp.both(SMat.hostileTrim, chamferBox(0.30, 0.09, 0.85, 0.03), M.t(0.52, 0.26, -2.10));
  bp.into(barrels);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), BM.eye);
  eye.position.set(0, 0.52, -1.15);
  eye.name = 'eye';
  barrels.add(eye);
  g.add(barrels);
  g.userData.barrels = barrels;
  g.userData.eye = eye;
  return g;
}

/* ── one outboard engine nacelle ───────────────────────────────────────────── */
function nacelleModule(name, sx) {
  const g = new THREE.Group();
  g.name = name;
  const p = Parts();

  p.add(SMat.bossHull, hullLoft({
    stations: [
      { z: -14.0, rx: 3.30, ry: 3.10, p: 3.2 },
      { z: -11.5, rx: 4.85, ry: 4.55, p: 3.5 },
      { z: -6.0, rx: 6.05, ry: 5.70, p: 3.7 },
      { z: 1.0, rx: 6.20, ry: 5.85, p: 3.7 },
      { z: 7.5, rx: 5.80, ry: 5.45, p: 3.6 },
      { z: 12.0, rx: 5.10, ry: 4.80, p: 3.4 },
      { z: 14.4, rx: 4.55, ry: 4.30, p: 3.2 },
    ], count: 30, steps: 24,
    circGrooves: [
      { z: -9.0, depth: 0.20, width: 0.55 }, { z: -2.5, depth: 0.22, width: 0.60 },
      { z: 4.5, depth: 0.22, width: 0.60 }, { z: 10.0, depth: 0.18, width: 0.50 },
    ],
    longGrooves: [
      { a: 0.25, depth: 0.16, width: 0.022, z0: -12, z1: 13 },
      { a: 0.75, depth: 0.16, width: 0.022, z0: -12, z1: 13 },
      { a: 0.00, depth: 0.14, width: 0.018, z0: -12, z1: 13 },
    ],
    dents: [
      { z: -0.5, a: 0.13, rz: 4.5, ra: 0.045, depth: 0.70, rim: 0.55 },
      { z: -0.5, a: 0.37, rz: 4.5, ra: 0.045, depth: 0.70, rim: 0.55 },
    ],
  }));

  /* ram intake — the lit weak point at the front */
  p.add(SMat.metalDark, ductGeo({ rx: 3.30, ry: 3.10, depth: 3.4, throat: 0.46, lip: 0.30, sides: 26, p: 3.2 }),
    M.chain(M.t(0, 0, -14.05), M.ry(Math.PI)));
  p.add(SMat.bossArmour, shellArc({ r: 3.62, t: 0.28, a0: 0, a1: Math.PI * 2, z0: -14.3, z1: -13.4, seg: 26 }));

  /* armour bands + radiator fins on the outboard flank */
  for (const z of [-8.0, -1.5, 5.5]) {
    p.add(SMat.bossArmour, shellArc({ r: 6.25, t: 0.34, a0: -1.05, a1: 1.05, z0: z - 1.5, z1: z + 1.5, seg: 12 }),
      M.rz(sx > 0 ? 0 : Math.PI));
  }
  for (let i = 0; i < 4; i++) {
    p.add(SMat.metalDark, extrudePoly([
      new THREE.Vector2(-2.6, 0), new THREE.Vector2(2.6, 0),
      new THREE.Vector2(2.0, 1.9), new THREE.Vector2(-2.0, 1.9),
    ], 0.22, 0.05), M.chain(M.rz(sx > 0 ? -0.5 : Math.PI + 0.5), M.t(0, 6.0, -6.5 + i * 4.6), M.rx(-Math.PI / 2), M.rz(Math.PI / 2)));
  }
  p.add(SMat.hostileTrim, shellArc({ r: 6.28, t: 0.14, a0: -0.28, a1: 0.28, z0: -7.5, z1: 9.0, seg: 5 }),
    M.rz(sx > 0 ? -1.5 : Math.PI + 1.5));
  p.add(SMat.metalDark, boltRow({ from: [-3.5, 5.6, 11.4], to: [3.5, 5.6, 11.4], n: 9, r: 0.10, h: 0.06 }));

  /* exhaust cluster: one big bell ringed by four small ones */
  p.add(SMat.heat, hullLoft({
    stations: [
      { z: 12.6, rx: 5.00, ry: 4.72, p: 3.4 },
      { z: 14.2, rx: 4.60, ry: 4.35, p: 3.3 },
      { z: 15.2, rx: 4.20, ry: 3.98, p: 3.2 },
    ], count: 26, steps: 5, capStart: false,
  }));
  p.add(SMat.ceramic, ductGeo({ rx: 2.55, ry: 2.55, depth: 2.4, throat: 0.78, lip: 0.22, sides: 24, p: 2.6 }),
    M.chain(M.t(0, 0, 15.3), M.ry(Math.PI)));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    p.add(SMat.ceramic, ductGeo({ rx: 0.95, ry: 0.95, depth: 1.1, throat: 0.72, lip: 0.10, sides: 14, p: 2.6 }),
      M.chain(M.t(Math.cos(a) * 3.15, Math.sin(a) * 3.05, 15.25), M.ry(Math.PI)));
  }
  p.into(g);

  /* lit parts: intake glow + engine plumes, animated per phase */
  const intake = new THREE.Mesh(new THREE.CircleGeometry(1.62, 24), BM.intake);
  intake.position.set(0, 0, -12.4);
  intake.rotation.y = Math.PI;
  intake.name = 'intake';
  g.add(intake);
  const intakeRing = new THREE.Mesh(new THREE.RingGeometry(1.62, 2.30, 26), BM.coreRing);
  intakeRing.position.set(0, 0, -12.5);
  intakeRing.rotation.y = Math.PI;
  intakeRing.name = 'intakeRing';
  g.add(intakeRing);

  const plumes = new THREE.Group();
  plumes.name = 'plumes';
  plumes.position.set(0, 0, 15.4);
  {
    const big = new THREE.Mesh(glowTube({ r0: 2.1, r1: 0.7, len: 22, sides: 16, power: 1.4 }), BM.beam);
    big.renderOrder = 6;
    plumes.add(big);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const s = new THREE.Mesh(glowTube({ r0: 0.72, r1: 0.24, len: 9, sides: 10, power: 1.4 }), BM.beam);
      s.position.set(Math.cos(a) * 3.15, Math.sin(a) * 3.05, 0);
      s.renderOrder = 6;
      plumes.add(s);
    }
  }
  g.add(plumes);
  g.userData.plumes = plumes;
  g.userData.intake = intake;
  g.userData.intakeRing = intakeRing;
  return g;
}

/* ═══════════════════════════════════════════════════════════════════════════
   assembly
   ═══════════════════════════════════════════════════════════════════════════ */

export function createBoss() {
  bossMaterials();
  const root = new THREE.Group();
  root.name = 'gargantua';
  const p = Parts();

  /* ── main hull ── */
  p.add(SMat.bossHull, hullLoft({
    stations: HULL, count: 34, steps: 34,
    circGrooves: [
      { z: -24.0, depth: 0.26, width: 0.75 }, { z: -14.5, depth: 0.28, width: 0.80 },
      { z: -4.0, depth: 0.28, width: 0.80 }, { z: 7.0, depth: 0.28, width: 0.80 },
      { z: 17.5, depth: 0.26, width: 0.75 },
    ],
    longGrooves: [
      { a: 0.25, depth: 0.22, width: 0.020, z0: -30, z1: 32 },
      { a: 0.12, depth: 0.20, width: 0.016, z0: -28, z1: 31 },
      { a: 0.38, depth: 0.20, width: 0.016, z0: -28, z1: 31 },
      { a: 0.00, depth: 0.18, width: 0.016, z0: -26, z1: 31 },
      { a: 0.50, depth: 0.18, width: 0.016, z0: -26, z1: 31 },
    ],
    dents: [
      { z: -18.0, a: 0.00, rz: 5.0, ra: 0.040, depth: 0.85, rim: 0.55 },
      { z: -18.0, a: 0.50, rz: 5.0, ra: 0.040, depth: 0.85, rim: 0.55 },
      { z: 14.0, a: 0.00, rz: 4.4, ra: 0.038, depth: 0.75, rim: 0.55 },
      { z: 14.0, a: 0.50, rz: 4.4, ra: 0.038, depth: 0.75, rim: 0.55 },
    ],
  }));

  /* prow ram: a heavy sloped beak, the read at 100 px */
  p.add(SMat.bossArmour, extrudePoly([
    new THREE.Vector2(0, -3.4), new THREE.Vector2(3.1, -1.0),
    new THREE.Vector2(3.1, 2.4), new THREE.Vector2(0, 4.2),
    new THREE.Vector2(-3.1, 2.4), new THREE.Vector2(-3.1, -1.0),
  ], 9.0, 0.25), M.chain(M.t(0, 0.4, -30.0), M.s(1.35, 1.0, 1.0)));
  p.both(SMat.bossArmour, extrudePoly([
    new THREE.Vector2(0, 0), new THREE.Vector2(9.5, 0),
    new THREE.Vector2(9.5, 1.35), new THREE.Vector2(0, 3.6),
  ], 0.9, 0.15), M.chain(M.t(0.6, 3.9, -25.5), M.rx(-Math.PI / 2), M.ry(0.10)));
  p.add(SMat.hostileTrim, chamferBox(6.6, 0.34, 1.10, 0.10), M.chain(M.t(0, 4.5, -27.4), M.rx(0.30)));

  /* dorsal citadel — bridge block, glassed, with an aerial mast */
  p.add(SMat.bossHull, hullLoft({
    stations: [
      { z: 6.5, rx: 3.6, ry: 1.20, p: 3.6, yOff: 6.4 },
      { z: 9.5, rx: 5.3, ry: 2.55, p: 4.0, yOff: 7.1 },
      { z: 14.0, rx: 5.5, ry: 2.75, p: 4.2, yOff: 7.3 },
      { z: 18.0, rx: 4.2, ry: 1.60, p: 3.6, yOff: 6.8 },
    ], count: 24, steps: 14,
    circGrooves: [{ z: 12.0, depth: 0.12, width: 0.30 }],
  }));
  p.add(SMat.hostileGlass, hullLoft({
    stations: [
      { z: 7.2, rx: 2.60, ry: 0.70, p: 3.4, yOff: 7.75 },
      { z: 9.8, rx: 4.05, ry: 1.55, p: 3.8, yOff: 8.20 },
      { z: 12.6, rx: 4.00, ry: 1.50, p: 3.8, yOff: 8.25 },
      { z: 14.6, rx: 2.90, ry: 0.80, p: 3.4, yOff: 7.90 },
    ], count: 22, steps: 10,
  }));
  p.add(SMat.metal, tubeAlong([V3(0, 9.6, 15.6), V3(0, 17.2, 17.0)], (t) => 0.34 - t * 0.20, 8));
  p.add(SMat.hostileTrim, chamferBox(0.55, 0.55, 0.55, 0.12), M.t(0, 17.3, 17.1));
  for (const z of [11.0, 13.4]) {
    p.both(SMat.metalDark, extrudePoly([
      new THREE.Vector2(0, 0), new THREE.Vector2(3.2, 0.4),
      new THREE.Vector2(3.2, 0.9), new THREE.Vector2(0, 1.1),
    ], 0.30, 0.06), M.chain(M.t(5.0, 8.2, z), M.rx(-Math.PI / 2), M.rz(Math.PI / 2)));
  }

  /* engine pylons */
  p.both(SMat.bossHull, hullLoft({
    stations: [
      { z: -6.0, rx: 1.15, ry: 2.10, p: 3.6 },
      { z: -2.0, rx: 1.55, ry: 3.30, p: 4.0 },
      { z: 3.0, rx: 1.55, ry: 3.35, p: 4.0 },
      { z: 7.0, rx: 1.10, ry: 2.15, p: 3.6 },
    ], count: 18, steps: 12,
    circGrooves: [{ z: 0.5, depth: 0.10, width: 0.26 }],
  }), M.chain(M.t(20.5, 0.4, 1.5), M.rz(Math.PI / 2), M.ry(Math.PI / 2), M.s(1, 1, 1)));
  p.both(SMat.bossArmour, chamferBox(19.0, 0.55, 4.6, 0.16), M.chain(M.t(20.5, 3.3, 1.5), M.rz(-0.06)));
  p.both(SMat.metalDark, chamferBox(17.0, 0.42, 1.10, 0.10), M.chain(M.t(20.0, -2.9, 1.5), M.rz(0.05)));
  p.both(SMat.hostileTrim, chamferBox(15.0, 0.24, 0.55, 0.06), M.t(20.0, 3.68, -1.2));

  /* ventral trench + spinal cannon housing */
  p.both(SMat.bossArmour, extrudePoly([
    new THREE.Vector2(0, 0), new THREE.Vector2(0.9, -1.9),
    new THREE.Vector2(0.9, -3.2), new THREE.Vector2(0, -3.2),
  ], 44.0, 0.16), M.t(2.9, -4.6, -3.0));
  p.add(SMat.metalDark, hullLoft({
    stations: [
      { z: -27.0, rx: 1.35, ry: 1.05, p: 3.2, yOff: -6.0 },
      { z: -22.0, rx: 2.05, ry: 1.65, p: 3.6, yOff: -6.3 },
      { z: -8.0, rx: 2.30, ry: 1.85, p: 3.8, yOff: -6.5 },
      { z: 6.0, rx: 2.20, ry: 1.75, p: 3.8, yOff: -6.4 },
      { z: 15.0, rx: 1.70, ry: 1.35, p: 3.4, yOff: -6.1 },
    ], count: 20, steps: 16,
    circGrooves: [{ z: -14.0, depth: 0.12, width: 0.30 }, { z: 0.0, depth: 0.12, width: 0.30 }],
  }));
  p.add(SMat.metal, tubeAlong([V3(0, -6.05, -26.0), V3(0, -6.0, -33.5)], (t) => 1.28 - t * 0.28, 16));
  p.add(SMat.bossArmour, shellArc({ r: 1.55, t: 0.22, a0: 0, a1: Math.PI * 2, z0: -33.9, z1: -32.6, seg: 20 }),
    M.t(0, -6.0, 0));

  /* belly hangar surround */
  p.add(SMat.metalDark, hullLoft({
    stations: [
      { z: -9.5, rx: 4.4, ry: 0.55, p: 4.2, yOff: -5.4 },
      { z: -8.0, rx: 5.2, ry: 0.85, p: 4.4, yOff: -5.7 },
      { z: 8.0, rx: 5.2, ry: 0.85, p: 4.4, yOff: -5.7 },
      { z: 9.5, rx: 4.4, ry: 0.55, p: 4.2, yOff: -5.4 },
    ], count: 22, steps: 10,
  }));
  p.add(BM.intakeDead, new THREE.PlaneGeometry(7.4, 15.0), M.chain(M.t(0, -6.05, 0), M.rx(Math.PI / 2)));

  /* flank sponson guns — four of them, non-destructible chaff fire */
  for (const z of [-13.0, 4.0]) {
    p.both(SMat.metalDark, chamferBox(1.9, 1.7, 4.6, 0.22), M.t(10.4, -2.6, z));
    p.both(SMat.metal, tubeAlong([V3(0, 0, 0), V3(0, 0, -5.0)], (t) => 0.24 - t * 0.06, 10), M.t(10.9, -2.6, z - 2.2));
    p.both(SMat.hostileGlow, new THREE.CircleGeometry(0.17, 10), M.chain(M.t(10.9, -2.6, z - 7.25), M.ry(Math.PI)));
  }

  /* deck greebles: vent banks, hatches, handrails — density on the dorsal read */
  for (let i = 0; i < 5; i++) {
    p.both(SMat.metalDark, louvers({ n: 5, w: 1.9, h: 0.14, d: 0.30, gap: 0.26, tilt: -0.55 }),
      M.chain(M.t(6.2, 5.6 - i * 0.12, -20 + i * 9.5), M.rx(-1.2), M.ry(0.2)));
    p.both(SMat.bossArmour, chamferBox(3.4, 0.30, 2.2, 0.10), M.t(4.0, 6.2, -22 + i * 10.5));
  }
  p.both(SMat.metalDark, boltRow({ from: [3.0, 6.5, -26], to: [3.0, 6.5, 24], n: 18, r: 0.14, h: 0.08 }));
  p.add(SMat.metalDark, boltRow({ from: [-8.5, 4.2, -20], to: [-8.5, 4.2, 22], n: 14, r: 0.14, h: 0.08 }));
  p.add(SMat.metalDark, boltRow({ from: [8.5, 4.2, -20], to: [8.5, 4.2, 22], n: 14, r: 0.14, h: 0.08 }));
  p.both(SMat.metalDark, blisterGeo({ rx: 0.9, ry: 0.55, rz: 1.3, seg: 12, rings: 4 }), M.t(7.5, 6.3, 8.0));

  p.into(root);

  /* ── moving / destructible modules ── */
  const rig = { turrets: [], nacelles: [], petals: [], doors: [] };

  const TURRET_AT = [
    [-6.2, 5.6, -14.0], [6.2, 5.6, -14.0],
    [-7.4, 5.2, 20.0], [7.4, 5.2, 20.0],
  ];
  for (let i = 0; i < TURRET_AT.length; i++) {
    const t = turretModule('turret' + i);
    t.position.set(...TURRET_AT[i]);
    root.add(t);
    rig.turrets.push(t);
  }

  for (const sx of [1, -1]) {
    const n = nacelleModule(sx > 0 ? 'nacelleR' : 'nacelleL', sx);
    n.position.set(sx * 30.0, 0.4, 1.5);
    root.add(n);
    rig.nacelles.push(n);
  }

  /* ── reactor core, behind six armour petals ── */
  const coreGroup = new THREE.Group();
  coreGroup.name = 'core';
  coreGroup.position.set(0, 4.4, -1.0);
  {
    const cp = Parts();
    cp.add(SMat.metalDark, hullLoft({
      stations: [
        { z: -5.2, rx: 4.2, ry: 4.2, p: 3.0, yOff: 0 },
        { z: -3.6, rx: 5.0, ry: 5.0, p: 3.2 },
        { z: 3.6, rx: 5.0, ry: 5.0, p: 3.2 },
        { z: 5.2, rx: 4.2, ry: 4.2, p: 3.0 },
      ], count: 22, steps: 8, capStart: false, capEnd: false,
    }), M.rx(Math.PI / 2));
    cp.into(coreGroup);
  }
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.9, 2), BM.core);
  core.name = 'coreOrb';
  coreGroup.add(core);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.5 + i * 0.42, 0.16, 8, 30), BM.coreRing);
    ring.rotation.set(i * 0.7, i * 1.2, i * 0.4);
    ring.name = 'coreRing' + i;
    coreGroup.add(ring);
    rig.petals.push(null);       // placeholder keeps indices honest
  }
  rig.petals.length = 0;
  rig.coreOrb = core;
  rig.coreRings = coreGroup.children.filter(c => c.name.startsWith('coreRing'));

  // six petals hinged on the rim of the well
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const hinge = new THREE.Group();
    hinge.name = 'petal' + i;
    hinge.rotation.y = a;
    const inner = new THREE.Group();
    hinge.add(inner);
    const pp = Parts();
    pp.add(SMat.bossArmour, extrudePoly([
      new THREE.Vector2(-2.75, 0.2), new THREE.Vector2(2.75, 0.2),
      new THREE.Vector2(1.55, 5.1), new THREE.Vector2(-1.55, 5.1),
    ], 0.55, 0.10), M.chain(M.t(0, 0, 0), M.rx(-Math.PI / 2)));
    pp.add(SMat.hostileTrim, chamferBox(2.2, 0.14, 0.36, 0.04), M.t(0, 0.32, 1.4));
    pp.into(inner);
    inner.position.set(0, 0, 4.6);
    hinge.userData.inner = inner;
    coreGroup.add(hinge);
    rig.petals.push(hinge);
  }
  root.add(coreGroup);
  rig.coreGroup = coreGroup;

  /* ── hangar doors ── */
  for (const sx of [1, -1]) {
    const d = new THREE.Group();
    d.name = sx > 0 ? 'hangarR' : 'hangarL';
    const dp = Parts();
    dp.add(SMat.bossArmour, chamferBox(4.0, 0.55, 14.4, 0.14), M.t(sx * 2.05, -6.0, 0));
    dp.add(SMat.hostileTrim, chamferBox(0.42, 0.10, 12.5, 0.04), M.t(sx * 3.6, -6.32, 0));
    dp.add(SMat.metalDark, boltRow({ from: [sx * 2.05, -6.34, -6.4], to: [sx * 2.05, -6.34, 6.4], n: 9, r: 0.12, h: 0.07 }));
    dp.into(d);
    root.add(d);
    rig.doors.push(d);
  }

  /* ── spinal cannon: accelerator rings + muzzle orb + beam ── */
  const cannon = new THREE.Group();
  cannon.name = 'cannon';
  cannon.position.set(0, -6.0, 0);
  const accel = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(2.15 - i * 0.22, 0.26, 8, 28), BM.coreRing);
    r.position.z = -18.0 - i * 5.4;
    r.name = 'accel' + i;
    cannon.add(r);
    accel.push(r);
  }
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(1.25, 16, 12), BM.charge);
  muzzle.position.z = -33.8;
  muzzle.scale.setScalar(0.001);
  cannon.add(muzzle);

  const beam = new THREE.Mesh(glowTube({
    r0: 2.5, r1: 1.1, len: 1.0, sides: 18,
    hot: [2.6, 2.1, 1.2], cool: [1.5, 0.35, 0.10], power: 0.9,
  }), BM.beam);
  beam.position.z = -33.8;
  beam.rotation.x = Math.PI;         // extend forward (-Z)
  beam.renderOrder = 7;
  beam.visible = false;
  cannon.add(beam);

  const beamCore = new THREE.Mesh(glowTube({
    r0: 0.95, r1: 0.4, len: 1.0, sides: 12,
    hot: [4.0, 3.6, 3.0], cool: [2.4, 1.4, 0.6], power: 0.6,
  }), BM.beam);
  beamCore.position.z = -33.8;
  beamCore.rotation.x = Math.PI;
  beamCore.renderOrder = 8;
  beamCore.visible = false;
  cannon.add(beamCore);

  // targeting line: a thin quad drawn down the firing axis during the wind-up
  const aim = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), BM.aim);
  aim.position.set(0, 0, -33.8);
  aim.renderOrder = 5;
  aim.visible = false;
  cannon.add(aim);

  root.add(cannon);
  rig.cannon = cannon;
  rig.accel = accel;
  rig.muzzle = muzzle;
  rig.beam = beam;
  rig.beamCore = beamCore;
  rig.aim = aim;

  root.userData.rig = rig;

  /* ── the object's own presentation state ── */
  const st = {
    t: 0, phase: 1, power: 1, charge: 0, beamT: -1, beamLen: 900,
    hangar: 0, shutter: 0, list: 0, alert: 0,
    nacelleAlive: [true, true], turretAlive: [true, true, true, true],
  };
  const _c = new THREE.Color();

  const api = {
    st, rig,
    triangles: triCount(root),
    parts: [],

    setPhase(n) { st.phase = n; },
    /** 0..1 hangar door opening. */
    setHangar(v) { st.hangar = THREE.MathUtils.clamp(v, 0, 1); },
    /** 0..1 core armour retraction. */
    setShutter(v) { st.shutter = THREE.MathUtils.clamp(v, 0, 1); },
    setCharge(v) { st.charge = THREE.MathUtils.clamp(v, 0, 1); },
    setAlert(v) { st.alert = THREE.MathUtils.clamp(v, 0, 1); },
    killNacelle(i) { st.nacelleAlive[i] = false; },
    killTurret(i) {
      st.turretAlive[i] = false;
      const t = rig.turrets[i];
      if (t) { t.userData.eye.visible = false; t.rotation.z = (i % 2 ? 1 : -1) * 0.35; }
    },
    /** Fire the spinal cannon. `len` is how far the beam should reach. */
    fireBeam(len = 900) { st.beamT = 0; st.beamLen = len; st.charge = 0; },
    get beamActive() { return st.beamT >= 0 && st.beamT < 0.85; },

    /** Aim a turret at a world point. Returns the muzzle world position. */
    aimTurret(i, worldTarget, dt, out) {
      const t = rig.turrets[i];
      if (!t || !st.turretAlive[i]) return null;
      const local = t.worldToLocal(out.copy(worldTarget));
      const yaw = Math.atan2(local.x, -local.z);
      const pitch = Math.atan2(local.y - 1.55, Math.hypot(local.x, local.z));
      const k = 1 - Math.exp(-dt * 3.4);
      t.rotation.y += THREE.MathUtils.clamp(shortAngle(yaw - t.rotation.y), -1.6 * dt, 1.6 * dt) + 0;
      t.rotation.y = THREE.MathUtils.lerp(t.rotation.y, t.rotation.y, k);
      const bp = rig.turrets[i].userData.barrels;
      bp.rotation.x = THREE.MathUtils.clamp(
        bp.rotation.x + THREE.MathUtils.clamp(-pitch - bp.rotation.x, -1.4 * dt, 1.4 * dt), -0.8, 0.5);
      out.set(0.52, 0, -3.7);
      bp.localToWorld(out);
      return out;
    },

    update(dt, { power = 1, list = 0 } = {}) {
      st.t += dt;
      st.power = power;
      st.list += (list - st.list) * Math.min(1, dt * 1.4);
      const t = st.t;

      /* engines */
      for (let i = 0; i < rig.nacelles.length; i++) {
        const n = rig.nacelles[i];
        const alive = st.nacelleAlive[i];
        const k = alive ? power * (1 + Math.sin(t * 21 + i * 2) * 0.05) : 0;
        n.userData.plumes.scale.set(0.7 + k * 0.5, 0.7 + k * 0.5, 0.12 + k * 0.95);
        n.userData.plumes.visible = k > 0.02;
        n.userData.intake.material = alive ? BM.intake : BM.intakeDead;
        n.userData.intakeRing.visible = alive;
        if (alive) {
          const pulse = 0.75 + 0.25 * Math.sin(t * 4.2 + i * 1.7);
          n.userData.intake.material.color.copy(_c.setRGB(1.0, 0.60, 0.14)).multiplyScalar(2.6 * pulse + st.alert * 2.2);
        }
      }

      /* turret eyes */
      for (let i = 0; i < rig.turrets.length; i++) {
        if (!st.turretAlive[i]) continue;
        const e = rig.turrets[i].userData.eye;
        const pulse = 0.7 + 0.3 * Math.sin(t * (6 + st.alert * 7) + i);
        e.material = BM.eye;
        e.scale.setScalar(0.85 + pulse * 0.25);
      }

      /* hangar doors slide outboard */
      rig.doors[0].position.x = st.hangar * 4.3;
      rig.doors[1].position.x = -st.hangar * 4.3;

      /* core: petals fold out, orb spins up, rings counter-rotate */
      for (let i = 0; i < rig.petals.length; i++) {
        rig.petals[i].userData.inner.rotation.x = -st.shutter * 1.95;
      }
      const exposed = st.shutter;
      rig.coreOrb.visible = exposed > 0.02;
      const hot = 3.0 + exposed * 5.5 + Math.sin(t * 9.1) * 0.7 * exposed;
      rig.coreOrb.material = BM.core;
      rig.coreOrb.scale.setScalar(0.75 + exposed * 0.35 + Math.sin(t * 6.3) * 0.04);
      rig.coreOrb.rotation.set(t * 0.6, t * 0.9, 0);
      BM.core.color.copy(_c.setRGB(1.0, 0.94, 0.78)).multiplyScalar(hot);
      for (let i = 0; i < rig.coreRings.length; i++) {
        const r = rig.coreRings[i];
        r.visible = exposed > 0.02;
        r.rotation.x += dt * (0.7 + i * 0.35) * (i % 2 ? -1 : 1);
        r.rotation.z += dt * (0.4 + i * 0.2);
      }

      /* spinal cannon wind-up */
      const c = st.charge;
      for (let i = 0; i < rig.accel.length; i++) {
        const lit = THREE.MathUtils.clamp(c * 3 - i, 0, 1);
        rig.accel[i].rotation.z += dt * (1.5 + lit * 14);
        rig.accel[i].scale.setScalar(1 + lit * 0.10);
        rig.accel[i].visible = true;
      }
      BM.coreRing.color.copy(_c.setRGB(1.0, 0.70, 0.24)).multiplyScalar(1.6 + c * 6.5);
      rig.muzzle.scale.setScalar(Math.max(0.001, c * c * 1.35 + (st.beamT >= 0 && st.beamT < 0.2 ? 1.6 : 0)));
      BM.charge.color.copy(_c.setRGB(1.0, 0.86, 0.55)).multiplyScalar(3 + c * 9);

      rig.aim.visible = c > 0.12;
      if (rig.aim.visible) {
        rig.aim.scale.set(0.5 + c * 1.2, st.beamLen, 1);
        rig.aim.position.z = -33.8 - st.beamLen * 0.5;
        rig.aim.rotation.x = Math.PI / 2;
        BM.aim.opacity = 0.06 + c * 0.22;
      }

      /* the beam itself: a hard 0.85 s discharge */
      if (st.beamT >= 0) {
        st.beamT += dt;
        const u = st.beamT / 0.85;
        if (u >= 1) { st.beamT = -1; rig.beam.visible = false; rig.beamCore.visible = false; }
        else {
          const grow = Math.min(1, u * 6);
          const fade = u > 0.6 ? 1 - (u - 0.6) / 0.4 : 1;
          rig.beam.visible = true; rig.beamCore.visible = true;
          rig.beam.scale.set(fade * (1 + Math.sin(t * 60) * 0.05), fade, st.beamLen * grow);
          rig.beamCore.scale.set(fade * 0.9, fade * 0.9, st.beamLen * grow);
        }
      }

      if (api._hitTick) api._hitTick(dt);

      /* the whole ship rolls as it loses engines */
      root.rotation.z = st.list;
    },

    dispose() {
      root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    },
  };

  /* ── weak-point table: what the player is actually shooting ── */
  api.parts = [
    { id: 'nacelleR', label: 'ENGINE R', node: rig.nacelles[0], local: V3(30.0, 0.4, -11.0), radius: 7.5, hp: BOSS.engineHp, max: BOSS.engineHp, alive: true, kind: 'engine', index: 0 },
    { id: 'nacelleL', label: 'ENGINE L', node: rig.nacelles[1], local: V3(-30.0, 0.4, -11.0), radius: 7.5, hp: BOSS.engineHp, max: BOSS.engineHp, alive: true, kind: 'engine', index: 1 },
    { id: 'turret0', label: 'TURRET', node: rig.turrets[0], local: V3(-6.2, 7.0, -14.0), radius: 3.2, hp: BOSS.turretHp, max: BOSS.turretHp, alive: true, kind: 'turret', index: 0 },
    { id: 'turret1', label: 'TURRET', node: rig.turrets[1], local: V3(6.2, 7.0, -14.0), radius: 3.2, hp: BOSS.turretHp, max: BOSS.turretHp, alive: true, kind: 'turret', index: 1 },
    { id: 'turret2', label: 'TURRET', node: rig.turrets[2], local: V3(-7.4, 6.6, 20.0), radius: 3.2, hp: BOSS.turretHp, max: BOSS.turretHp, alive: true, kind: 'turret', index: 2 },
    { id: 'turret3', label: 'TURRET', node: rig.turrets[3], local: V3(7.4, 6.6, 20.0), radius: 3.2, hp: BOSS.turretHp, max: BOSS.turretHp, alive: true, kind: 'turret', index: 3 },
    { id: 'core', label: 'CORE', node: coreGroup, local: V3(0, 4.4, -1.0), radius: 5.0, hp: BOSS.coreHp, max: BOSS.coreHp, alive: true, kind: 'core', index: 0, locked: true },
    { id: 'hull', label: 'HULL', node: root, local: V3(0, 0, -6.0), radius: 13.0, hp: BOSS.hullHp, max: BOSS.hullHp, alive: true, kind: 'hull', index: 0 },
  ];

  /* ── the hit register ──────────────────────────────────────────────────── */
  //
  // Impact particles subtend ~4 px against this hull at combat range, so each
  // part carries an additive shell scaled to itself: invisible until struck,
  // full in one frame, gone in an eighth of a second. Hull hits are a place
  // rather than a part, so they use a pooled bloom placed at the contact point
  // in the carrier's frame, which keeps it on the plate as the ship banks.
  const SHELL_LIFE = 0.13;
  const shellGeo = new THREE.IcosahedronGeometry(1, 2);
  const mkShellMat = (col) => new THREE.MeshBasicMaterial({
    color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false,
  });

  for (const p of api.parts) {
    p.flash = 0;
    if (p.kind === 'hull') continue;
    const mat = mkShellMat(BM.hitWeak);
    const m = new THREE.Mesh(shellGeo, mat);
    m.position.copy(p.local);
    m.scale.setScalar(p.radius * 1.5);
    m.visible = false;
    m.frustumCulled = false;
    m.renderOrder = 6;
    p.node.add(m);
    p.shell = m;
  }

  const HULL_BLOOMS = 6;
  const hullBlooms = [];
  for (let i = 0; i < HULL_BLOOMS; i++) {
    const m = new THREE.Mesh(shellGeo, mkShellMat(BM.hitHull));
    m.visible = false;
    m.frustumCulled = false;
    m.renderOrder = 6;
    root.add(m);
    hullBlooms.push({ m, t: 1e9 });
  }
  let bloomNext = 0;
  const _hp = new THREE.Vector3();

  /**
   * World position of a weak point.
   *
   * `local` in the table below is in the CARRIER's frame, not the part node's —
   * the nacelle group already sits at x = ±30, so composing it with
   * `node.matrixWorld` doubles the offset. Parts never translate relative to
   * the hull (turrets rotate in place, the core only animates its petals), so
   * the root matrix is both correct and cheaper for all of them.
   */
  api.partPoint = (part, out) => out.copy(part.local).applyMatrix4(root.matrixWorld);

  /** Register a hit on `part`. `worldPoint` is where the round actually landed. */
  api.hitPart = (part, worldPoint) => {
    if (!part) return;
    part.flash = 1;
    if (part.kind === 'hull' && worldPoint) {
      const e = hullBlooms[bloomNext];
      bloomNext = (bloomNext + 1) % HULL_BLOOMS;
      // ancestors + self only — recursing the rig costs more than the flash
      root.updateWorldMatrix(true, false);
      e.m.position.copy(root.worldToLocal(_hp.copy(worldPoint)));
      e.m.scale.setScalar(4.2);
      e.t = 0;
    }
  };

  api._hitTick = (dt) => {
    for (const p of api.parts) {
      if (!p.shell) continue;
      if (p.flash > 0) {
        p.flash = Math.max(0, p.flash - dt / SHELL_LIFE);
        // squared falloff: the pop is on the first frame, the tail is a glow
        p.shell.material.opacity = p.flash * p.flash * 0.55;
        p.shell.scale.setScalar(p.radius * (1.5 + (1 - p.flash) * 0.75));
        p.shell.visible = p.flash > 0.01 && p.alive;
      } else if (p.shell.visible) {
        p.shell.visible = false;
      }
    }
    for (const e of hullBlooms) {
      if (e.t > SHELL_LIFE) { if (e.m.visible) e.m.visible = false; continue; }
      e.t += dt;
      const k = Math.max(0, 1 - e.t / SHELL_LIFE);
      e.m.material.opacity = k * k * 0.5;
      e.m.scale.setScalar(4.2 + (1 - k) * 3.4);
      e.m.visible = true;
    }
  };

  root.userData.api = api;
  return root;
}

function shortAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
