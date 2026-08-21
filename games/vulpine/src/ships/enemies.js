import * as THREE from 'three';
import { rng } from '../core/rng.js';
import { emissive } from '../render/materials.js';
import { bakeRGBA, cached } from '../render/textures.js';
import { registerShot } from '../game/shots.js';
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
//   2. COLOUR.  Dark warm plating and red emissives against the Arwing's pale
//      paint and blue engines. Friend/foe is legible before shape is. The
//      plating used to be a cool blue-grey at metalness 0.9, which made every
//      hostile a mirror of the sky it was flying against — see the note on
//      SMat.hostile in ship-materials.js.
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

/* ── class beacons: identity at 100 px ─────────────────────────────────────── */
//
// Design brief rule 1 says every class must be nameable at 100 px. Measured
// against a real capture, it wasn't: at 600 m a 6 m raptor is ~15 px of dark
// hull over hazy blue water, and a wasp is ~8 px of the same dark speck. Three
// things fail together and they all fail for the same reason — you are looking
// at the *front* of a hostile that is closing on you:
//
//   · the silhouette is 15 px, so shape carries nothing;
//   · the hull is dark cold plating, and aerial perspective drags it toward the
//     background value it is supposed to separate from;
//   · every emissive on these ships (nozzle face, plume, exhaust halo) points
//     AFT. Head-on, a hostile has no lit pixel on it at all.
//
// So each class carries a camera-facing beacon whose *angular* size has a
// floor. It shrinks with distance like everything else until it would fall
// under a few pixels, and then it stops — the hull keeps honest perspective,
// the light stays readable. That is the whole trick.
//
// Colour is the class channel and blink pattern is the second one, because a
// blink still resolves at three pixels where a hue difference is already
// marginal. Every colour stays in the warm half of the wheel: hostile-vs-
// Arwing (pale paint, blue engines) has to survive being read before class
// does, so nothing here is allowed to go blue or green.
//
// One lamp per hull, and it sits on the DORSAL spine rather than the nose.
// The first pass put it at the nose, which is right for a head-on pass and
// useless for every other aspect — `depthTest` is on, so the hull ate its own
// lamp the moment the ship turned away. Above the spine it is visible from the
// front, both sides, the rear and from above, which is every aspect this game
// actually presents. It also keeps the cost at one extra draw per ship.
//
// `fog: false` is what buys the punch-through, but an unfogged light with no
// other limit would still be a visible star at 8 km. `far`/`fade` below cut it
// off just past lock range, so beacons only exist inside the fight.

// `minPx` is the floor on the lamp's *diameter in CSS pixels*. It is bigger
// than it first looks reasonable to make it, and it has to be: the beacon is
// competing with a sunlit water surface, so a 3 px dot at 15% blink-off simply
// is not there. Measured — the first pass used 2.4–3.0 px and read as nothing
// at all in `shots/e1`. Six pixels is roughly the point where hue survives the
// tone map and the bloom.
const BEACON = {
  //          colour     gain size minPx  rate duty  pattern    at (hull-local)
  raptor: {
    color: 0xff2a14, gain: 6.5, size: 0.62, minPx: 8.0, rate: 0, duty: 1, pattern: 'steady',
    at: [[0, 0.56, -0.50]],
  },
  wasp: {
    color: 0xffb400, gain: 6.0, size: 0.40, minPx: 6.0, rate: 6.5, duty: 0.55, pattern: 'flicker',
    at: [[0, 0.52, -0.10]],
  },
  hornet: {
    color: 0xff1e78, gain: 6.0, size: 0.80, minPx: 8.0, rate: 1.1, duty: 0.5, pattern: 'double',
    at: [[0, 1.02, 0.10]],
  },
  bulwark: {
    color: 0xff6a08, gain: 5.0, size: 0.72, minPx: 5.5, rate: 0.55, duty: 0.5, pattern: 'pulse',
    at: [[0, 3.25, 0]],
  },
  vanguard: {
    color: 0xd24bff, gain: 6.5, size: 1.90, minPx: 11.0, rate: 0.9, duty: 0.5, pattern: 'strobe',
    at: [[0, 2.95, -3.0], [0, -0.15, -13.1]],
  },
  // The warm half is nearly spent by the five above, so these three separate on
  // the axes that are left. Gold is the yellow end of the range and takes the
  // highest `minPx` in the table, because the lancer opens fire from 1400 m and
  // has to be findable before its first round lands. The pylon separates by
  // *saturation* rather than hue — a warm white obstruction light — since every
  // saturated warm hue is already a class. Pattern carries role: `pulse` is the
  // emplacement signal, so both static classes share it and differ in rate.
  lancer: {
    color: 0xffe14a, gain: 7.0, size: 0.78, minPx: 10.0, rate: 0.85, duty: 0.5, pattern: 'triple',
    at: [[0, 1.10, -0.90]],
  },
  scarab: {
    color: 0xff5a10, gain: 6.0, size: 0.55, minPx: 7.0, rate: 1.4, duty: 0.72, pattern: 'steady',
    at: [[0, 1.42, 0.10]],
  },
  pylon: {
    color: 0xffdca8, gain: 5.5, size: 0.90, minPx: 7.0, rate: 0.70, duty: 0.5, pattern: 'pulse',
    at: [[0, 10.30, 0]],
  },
};

/** Distances over which an unfogged beacon is allowed to exist, in metres. */
const BEACON_FAR = 1500, BEACON_CUT = 2400;

/**
 * A light source is a small hard core inside a wide soft halo. One gaussian on
 * its own reads as a smudge at every size; it is the core that survives being
 * three pixels across, and the halo that keeps it from aliasing into a
 * flickering dot as the ship crosses the pixel grid.
 */
function beaconTexture() {
  return cached('enemy.beacon', () => {
    const t = bakeRGBA(64, (u, v, out) => {
      const dx = u - 0.5 + 1 / 128, dy = v - 0.5 + 1 / 128;
      const r = Math.min(1, Math.hypot(dx, dy) * 2);
      const core = Math.exp(-r * r * 42);
      const halo = Math.pow(1 - r, 2.6) * 0.40;
      out[0] = out[1] = out[2] = 1;
      out[3] = Math.min(1, core + halo);
    });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  });
}

function beaconNode(B, at) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: beaconTexture(),
    color: new THREE.Color(B.color).multiplyScalar(B.gain),
    blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false,
    toneMapped: false, fog: false, sizeAttenuation: true,
  }));
  s.name = 'beacon';
  s.position.set(at[0], at[1], at[2]);
  s.scale.setScalar(B.size);
  s.renderOrder = 7;
  return s;
}

/**
 * 0..1 lamp state. Hard edges, not sines — an on/off edge reads at a few
 * pixels where a smooth ramp just reads as a dimmer light.
 *
 * Nothing goes below ~0.35. The blink is a *modulation* that says which class
 * this is; it is not allowed to be an extinction, because a hostile that
 * vanishes for 200 ms every second is the rear-attacker problem all over again
 * in a different costume. You must always be able to see it; the pattern is
 * how you name it.
 */
function beaconDuty(B, t, phase) {
  if (B.rate <= 0) return 1;
  const ph = (t * B.rate + phase) % 1;
  switch (B.pattern) {
    // two quick winks then a long gap: unmistakable, and unmistakably *not*
    // the single steady lamp a raptor carries.
    case 'double': return (ph < 0.10 || (ph > 0.20 && ph < 0.30)) ? 1 : 0.38;
    // a hard short flash — the thing you notice from the corner of your eye
    case 'strobe': return ph < 0.10 ? 1 : 0.42;
    // three winks in the space a `double` uses for two, read at the same rate
    case 'triple': return (ph < 0.07 || (ph > 0.13 && ph < 0.20) || (ph > 0.26 && ph < 0.33)) ? 1 : 0.38;
    // slow breathing, so a gun emplacement never reads as something closing
    case 'pulse': return 0.55 + 0.45 * (0.5 - 0.5 * Math.cos(ph * Math.PI * 2));
    default: return ph < B.duty ? 1 : 0.45;
  }
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
   LANCER — standoff sniper
   A 12.4 m needle carrying a dorsal rail and two outrigger booms. Length over
   beam is 15:1, which is a proportion no other hull in the game has, and it is
   the only cue that survives at the range this thing opens from: it fires at
   1400 m, where the raptor's crescent and the hornet's twin hull are both a
   dozen pixels of dark. The charge node between the rails and the gold beacon
   above them are the near and far halves of the same job.
   ═══════════════════════════════════════════════════════════════════════════ */

const LANCER_BODY = [
  { z: -8.20, rx: 0.035, ry: 0.030, p: 2.6 },
  { z: -7.30, rx: 0.130, ry: 0.115, p: 2.8, shoulder: 0.04 },
  { z: -5.60, rx: 0.235, ry: 0.200, p: 3.0, shoulder: 0.10 },
  { z: -3.00, rx: 0.330, ry: 0.270, p: 3.2, shoulder: 0.16 },
  { z: -0.40, rx: 0.395, ry: 0.320, p: 3.3, shoulder: 0.18 },
  { z: 1.80, rx: 0.370, ry: 0.300, p: 3.2, shoulder: 0.12 },
  { z: 3.40, rx: 0.320, ry: 0.260, p: 3.0, shoulder: 0.04 },
  { z: 4.20, rx: 0.285, ry: 0.235, p: 2.9 },
];

const LANCER_FIN = [
  { span: 0.00, chord: 1.35, thickness: 0.110, sweep: 0.00 },
  { span: 0.44, chord: 1.05, thickness: 0.078, sweep: 0.30 },
  { span: 0.88, chord: 0.72, thickness: 0.052, sweep: 0.62 },
  { span: 1.18, chord: 0.40, thickness: 0.034, sweep: 0.94 },
];

function lancerProto() {
  const root = new THREE.Group();
  root.name = 'lancer';
  const p = Parts();

  /* needle fuselage */
  p.add(SMat.hostile, hullLoft({
    stations: LANCER_BODY, count: 22, steps: 26,
    circGrooves: [
      { z: -5.20, depth: 0.018, width: 0.05 },
      { z: -2.30, depth: 0.022, width: 0.055 },
      { z: 0.90, depth: 0.022, width: 0.055 },
      { z: 2.90, depth: 0.018, width: 0.05 },
    ],
    longGrooves: [
      { a: 0.25, depth: 0.018, width: 0.013, z0: -6.4, z1: 3.6 },
      { a: 0.75, depth: 0.018, width: 0.013, z0: -6.4, z1: 3.6 },
    ],
    dents: [
      { z: -1.20, a: 0.0, rz: 0.90, ra: 0.070, depth: 0.085, rim: 0.5 },
      { z: -1.20, a: 0.5, rz: 0.90, ra: 0.070, depth: 0.085, rim: 0.5 },
    ],
  }));

  /* dorsal rail: a spine beam, two accelerator rails and their coil collars.
     It reaches within 0.6 m of the nose, so the top edge of the silhouette is
     a straight line from tip to tail — the spear read. */
  p.add(SMat.hostilePlate, chamferBox(0.34, 0.26, 9.60, 0.05), M.t(0, 0.50, -2.60));
  p.both(SMat.metal, tubeAlong([V3(0, 0, -7.55), V3(0, 0, 1.30)], 0.052, 8), M.t(0.17, 0.66, 0));
  for (const z of [-6.55, -5.05, -3.55, -2.05]) {
    p.add(SMat.metalDark, shellArc({ r: 0.34, t: 0.09, a0: 0, a1: Math.PI * 2, z0: z - 0.16, z1: z + 0.16, seg: 12 }),
      M.t(0, 0.60, 0));
  }
  p.add(SMat.hostileTrim, chamferBox(0.10, 0.09, 7.20, 0.02), M.t(0, 0.80, -3.20));
  p.add(SMat.metalDark, chamferBox(0.42, 0.36, 0.52, 0.06), M.t(0, 0.62, -7.30));
  p.add(SMat.hostileGlow, new THREE.CircleGeometry(0.085, 10), M.chain(M.t(0, 0.62, -7.58), M.ry(Math.PI)));

  /* outrigger booms — thin, long, and parallel: the width of the silhouette is
     three separate lines rather than one mass */
  p.both(SMat.hostilePlate, tubeAlong(
    [V3(0, 0, -6.10), V3(0, 0, -5.40), V3(0, 0, 1.60), V3(0, 0, 2.40)],
    (t) => [0.045, 0.160, 0.160, 0.090][Math.round(t * 3)], 12), M.t(1.30, -0.16, 0));
  p.both(SMat.metalDark, ductGeo({ rx: 0.10, ry: 0.10, depth: 0.34, throat: 0.5, lip: 0.02, sides: 12 }),
    M.chain(M.t(1.30, -0.16, 2.42), M.ry(Math.PI)));
  p.both(SMat.metalDark, shellArc({ r: 0.185, t: 0.05, a0: 0, a1: Math.PI * 2, z0: -3.10, z1: -2.70, seg: 10 }),
    M.t(1.30, -0.16, 0));
  p.both(SMat.hostileTrim, chamferBox(0.06, 0.20, 1.60, 0.02), M.t(1.44, -0.16, -1.20));

  /* struts, fore and aft: the booms are carried, not floating */
  p.both(SMat.metalDark, chamferBox(0.92, 0.11, 0.44, 0.03), M.t(0.86, -0.14, -4.40));
  p.both(SMat.metalDark, chamferBox(0.92, 0.11, 0.44, 0.03), M.t(0.86, -0.14, 1.05));

  /* anhedral tail fins — small, because nothing may compete with the rail */
  const fin = wingLoft(LANCER_FIN, { res: 14, steps: 7 });
  p.both(SMat.hostile, fin, M.chain(M.t(0.26, -0.10, 2.60), M.rz(-2.36)));
  p.both(SMat.hostileTrim, chamferBox(0.05, 0.24, 0.34, 0.02),
    M.chain(M.t(0.26, -0.10, 2.60), M.rz(-2.36), M.t(1.04, 0, 0.52)));

  /* sighting head under the nose, and a louvred bay over the coil bank */
  p.add(SMat.metalDark, blisterGeo({ rx: 0.14, ry: 0.10, rz: 0.30, seg: 12, rings: 4 }),
    M.chain(M.t(0, -0.16, -4.70), M.rx(-1.62)));
  p.both(SMat.metalDark, louvers({ n: 5, w: 0.34, h: 0.026, d: 0.07, gap: 0.052, tilt: -0.5 }),
    M.chain(M.t(0.33, 0.16, 0.90), M.ry(1.30)));
  p.add(SMat.hostile, boltRow({ from: [-0.22, 0.34, -3.30], to: [0.22, 0.34, -3.30], n: 4, r: 0.014, h: 0.009 }));

  /* dark low canopy, well aft — the pilot sits behind the rail bank */
  p.add(SMat.hostilePlate, hullLoft({
    stations: [
      { z: -3.05, rx: 0.14, ry: 0.040, p: 3.0, yOff: 0.20 },
      { z: -2.55, rx: 0.26, ry: 0.115, p: 3.2, yOff: 0.22 },
      { z: -2.00, rx: 0.24, ry: 0.100, p: 3.2, yOff: 0.22 },
      { z: -1.65, rx: 0.15, ry: 0.045, p: 3.0, yOff: 0.21 },
    ], count: 16, steps: 8,
  }));
  const glass = hullLoft({
    stations: [
      { z: -2.98, rx: 0.10, ry: 0.028, p: 3.0, yOff: 0.235 },
      { z: -2.55, rx: 0.20, ry: 0.090, p: 3.2, yOff: 0.248 },
      { z: -2.05, rx: 0.19, ry: 0.080, p: 3.2, yOff: 0.248 },
      { z: -1.74, rx: 0.11, ry: 0.032, p: 3.0, yOff: 0.238 },
    ], count: 16, steps: 8,
  });

  /* aft bay */
  p.add(SMat.heat, hullLoft({
    stations: [
      { z: 3.70, rx: 0.310, ry: 0.255, p: 3.0 },
      { z: 4.30, rx: 0.280, ry: 0.230, p: 3.0 },
      { z: 4.60, rx: 0.250, ry: 0.205, p: 3.0 },
    ], count: 18, steps: 4, capStart: false,
  }));
  p.add(SMat.ceramic, ductGeo({ rx: 0.22, ry: 0.185, depth: 0.34, throat: 0.72, lip: 0.03, sides: 16, p: 3.0 }),
    M.chain(M.t(0, 0.01, 4.61), M.ry(Math.PI)));

  p.into(root);

  const g = new THREE.Mesh(glass, SMat.hostileGlass);
  g.renderOrder = 3;
  root.add(g);

  // Two lit nodes, both on the class's own channel: the charge sitting between
  // the rails is what tells you a shot is coming, and the sighting head is what
  // tells you it is aimed at you.
  const charge = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 10), EMat.eyeAmber);
  charge.position.set(0, 0.64, -6.95);
  charge.name = 'eye';
  root.add(charge);
  const sight = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), EMat.eye);
  sight.position.set(0, -0.18, -4.92);
  sight.name = 'eye';
  root.add(sight);

  const eng = engineNode(0, 0.01, 4.62, 0.22, { len: 3.4 });
  eng.name = 'engine';
  root.add(eng);
  for (const sx of [1, -1]) {
    const e = engineNode(sx * 1.30, -0.16, 2.44, 0.10, { len: 1.5 });
    e.name = 'engine';
    root.add(e);
  }

  root.userData.spec = {
    kind: 'lancer', radius: 3.0, hp: 24, score: 400,
    guns: [V3(0, 0.62, -7.60)],
    maxSpeed: 175, turnRate: 0.55, accel: 60,
    fireRange: 1400, burst: 1, burstGap: 0.30, reload: 2.6, dmg: 16,
    boomScale: 1.8,
  };
  return root;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCARAB — armoured rammer
   The wasp's heavy cousin: a hunched carapace behind a shielded prow, banded
   like a beetle and twice its beam. Where the wasp is a hot spark with four
   fins in an X, this is a low wide dome with nothing radial on it at all, and
   its lamp blinks once a second instead of flickering.
   ═══════════════════════════════════════════════════════════════════════════ */

function scarabProto() {
  const root = new THREE.Group();
  root.name = 'scarab';
  const p = Parts();

  /* carapace: wide, hunched, flat-bellied */
  p.add(SMat.hostile, hullLoft({
    stations: [
      { z: -1.70, rx: 0.42, ry: 0.26, p: 3.6, squash: 0.55 },
      { z: -1.05, rx: 0.82, ry: 0.52, p: 4.0, squash: 0.50, shoulder: 0.14 },
      { z: -0.10, rx: 1.06, ry: 0.72, p: 4.2, squash: 0.46, shoulder: 0.20 },
      { z: 0.90, rx: 1.00, ry: 0.66, p: 4.1, squash: 0.48, shoulder: 0.16 },
      { z: 1.70, rx: 0.74, ry: 0.46, p: 3.8, squash: 0.55, shoulder: 0.06 },
      { z: 2.10, rx: 0.58, ry: 0.34, p: 3.4, squash: 0.62 },
    ], count: 20, steps: 16,
    longGrooves: [
      { a: 0.25, depth: 0.045, width: 0.020, z0: -1.4, z1: 1.9 },
      { a: 0.14, depth: 0.035, width: 0.016, z0: -1.2, z1: 1.7 },
      { a: 0.36, depth: 0.035, width: 0.016, z0: -1.2, z1: 1.7 },
    ],
  }));

  /* segment bands over the crown — the beetle read, and the only mid-frequency
     shape cue left once this is 20 px across */
  for (const z of [-0.55, 0.35, 1.15]) {
    p.add(SMat.hostilePlate, shellArc({
      r: 1.10, t: 0.075, a0: 0.34, a1: Math.PI - 0.34, z0: z - 0.24, z1: z + 0.24, seg: 12,
    }));
  }
  p.add(SMat.hostileTrim, shellArc({ r: 1.13, t: 0.045, a0: 1.34, a1: 1.80, z0: -1.1, z1: 1.7, seg: 5 }));

  /* shielded prow: a sloped ram plate with two mandible tusks. This is the face
     it presents for the whole dive, so it is the only part that has to work. */
  p.add(SMat.hostilePlate, extrudePoly([
    new THREE.Vector2(-1.02, -0.34), new THREE.Vector2(-0.52, -0.72),
    new THREE.Vector2(0.52, -0.72), new THREE.Vector2(1.02, -0.34),
    new THREE.Vector2(0.72, 0.60), new THREE.Vector2(-0.72, 0.60),
  ], 0.30, 0.07), M.chain(M.t(0, 0.06, -1.86), M.rx(0.34)));
  p.add(SMat.hostileTrim, chamferBox(1.10, 0.09, 0.20, 0.03), M.chain(M.t(0, 0.44, -2.02), M.rx(0.34)));
  p.both(SMat.metal, extrudePoly([
    new THREE.Vector2(0, -0.16), new THREE.Vector2(1.05, -0.30),
    new THREE.Vector2(1.05, 0.05), new THREE.Vector2(0, 0.22),
  ], 0.16, 0.04), M.chain(M.t(0.72, -0.12, -1.72), M.ry(Math.PI / 2 + 0.22), M.rx(-Math.PI / 2), M.rz(Math.PI / 2)));
  p.add(SMat.metalDark, boltRow({ from: [-0.80, 0.30, -2.00], to: [0.80, 0.30, -2.00], n: 6, r: 0.028, h: 0.016 }));

  /* stub anhedral canards low on the shoulders, and four grapple nubs beneath —
     mass slung under the hull, the opposite of the wasp's radial fins */
  p.both(SMat.hostile, extrudePoly([
    new THREE.Vector2(0, -0.22), new THREE.Vector2(0.92, 0.24),
    new THREE.Vector2(0.92, 0.52), new THREE.Vector2(0, 0.30),
  ], 0.07, 0.02), M.chain(M.t(0.95, -0.22, -0.30), M.rz(-0.42), M.rx(-Math.PI / 2)));
  for (const z of [-0.70, 0.70]) {
    p.both(SMat.metalDark, chamferBox(0.16, 0.44, 0.20, 0.04), M.chain(M.t(0.62, -0.46, z), M.rz(0.38)));
  }
  p.both(SMat.metalDark, louvers({ n: 4, w: 0.40, h: 0.032, d: 0.08, gap: 0.058, tilt: -0.55 }),
    M.chain(M.t(0.86, 0.26, 0.90), M.ry(1.22)));

  p.into(root);

  // A slit rather than the wasp's exposed ball: the core is behind the shield,
  // which is the whole difference between something that dies to one round and
  // something that does not.
  const core = new THREE.Mesh(chamferBox(0.72, 0.13, 0.16, 0.03), EMat.droneCore);
  core.position.set(0, 0.30, -1.60);
  core.name = 'eye';
  root.add(core);

  for (const sx of [1, -1]) {
    const e = engineNode(sx * 0.46, 0.02, 2.14, 0.21, { len: 2.2 });
    e.name = 'engine';
    root.add(e);
  }

  root.userData.spec = {
    kind: 'scarab', radius: 2.4, hp: 7, score: 140,
    guns: [], ram: true,
    maxSpeed: 230, turnRate: 1.7, accel: 150,
    fireRange: 0, burst: 0, burstGap: 1, reload: 1, dmg: 22,
    boomScale: 1.6,
  };
  return root;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PYLON — mast emplacement
   The bulwark inverted. That one is sunk and squat and reads as terrain; this
   is a 9.6 m skeletal lattice with an armoured cap and a quad mount on top, and
   it reads as a landmark from further out than any other hostile its cost.
   Guns sit at y ≈ 8.9 rather than the bulwark's 2.5, so the mast is the threat
   rather than a plinth for one.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Half-width of the lattice at height `y`: the mast tapers over its run. */
const MAST_Y0 = 1.55, MAST_Y1 = 8.00;
const mastR = (y) => THREE.MathUtils.lerp(0.70, 0.34, THREE.MathUtils.clamp((y - MAST_Y0) / (MAST_Y1 - MAST_Y0), 0, 1));

function pylonProto() {
  const root = new THREE.Group();
  root.name = 'pylon';
  const p = Parts();

  /* footing. Static craft are placed at ground + 3.2 and the hull is drawn at
     NPC_SCALE, so a base that is to meet the terrain has to reach y = -2.2
     authored before it gets there. */
  p.add(SMat.hostilePlate, extrudePoly(hexPts(1.50), 4.00, 0.08), M.chain(M.t(0, -2.20, 0), M.rx(-Math.PI / 2)));
  p.add(SMat.hostilePlate, extrudePoly(hexPts(2.10), 1.40, 0.10), M.chain(M.t(0, 0.30, 0), M.rx(-Math.PI / 2)));
  p.add(SMat.hostile, extrudePoly(hexPts(1.62), 0.55, 0.07), M.chain(M.t(0, 1.25, 0), M.rx(-Math.PI / 2)));
  p.add(SMat.hostileTrim, extrudePoly(hexPts(1.70), 0.09, 0.02), M.chain(M.t(0, 1.57, 0), M.rx(-Math.PI / 2)));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.52;
    p.add(SMat.metalDark, chamferBox(0.36, 0.26, 1.90, 0.05),
      M.chain(M.ry(-a), M.t(0, 0.92, 1.32), M.rx(-0.60)));
  }
  p.add(SMat.metalDark, boltRow({ from: [-1.15, 1.62, -0.85], to: [1.15, 1.62, -0.85], n: 6, r: 0.030, h: 0.018 }));
  p.add(SMat.metalDark, boltRow({ from: [-1.15, 1.62, 0.85], to: [1.15, 1.62, 0.85], n: 6, r: 0.030, h: 0.018 }));

  /* lattice mast: four tapering corner posts on five braced levels. Sky reads
     through it, which is the one thing that keeps it from being a tall
     bulwark. */
  const RING = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  const LEVELS = [MAST_Y0, 3.16, 4.77, 6.38, MAST_Y1];
  for (const [cx, cz] of RING) {
    p.add(SMat.metal, tubeAlong(LEVELS.map(y => {
      const r = mastR(y);
      return V3(cx * r, y, cz * r);
    }), 0.098, 6));
  }
  for (let lv = 1; lv < LEVELS.length; lv++) {
    const y = LEVELS[lv], r = mastR(y);
    for (let i = 0; i < 4; i++) {
      const a = RING[i], b = RING[(i + 1) % 4];
      p.add(SMat.metalDark, tubeAlong([V3(a[0] * r, y, a[1] * r), V3(b[0] * r, y, b[1] * r)], 0.052, 6));
    }
  }
  // one diagonal per face per bay, alternating, so the lattice reads as braced
  // rather than as a stack of empty squares
  for (let bay = 0; bay < LEVELS.length - 1; bay++) {
    const y0 = LEVELS[bay], y1 = LEVELS[bay + 1];
    const r0 = mastR(y0), r1 = mastR(y1);
    for (let f = 0; f < 4; f++) {
      const a = RING[f], b = RING[(f + 1) % 4];
      const flip = (bay + f) % 2 === 0;
      const lo = flip ? a : b, hi = flip ? b : a;
      p.add(SMat.metalDark, tubeAlong([V3(lo[0] * r0, y0, lo[1] * r0), V3(hi[0] * r1, y1, hi[1] * r1)], 0.042, 6));
    }
  }
  // serviced, not abstract: a cable run climbing one face
  p.add(SMat.hostileTrim, tubeAlong([
    V3(0.30, 1.70, -0.58), V3(0.26, 4.80, -0.44), V3(0.22, 7.90, -0.34),
  ], 0.038, 6));

  /* armoured cap: the mast's mass arrives all at once, all of it at the top */
  p.add(SMat.hostile, hullLoft({
    stations: [
      { z: -1.10, rx: 0.95, ry: 0.58, p: 4.0, yOff: 8.26 },
      { z: -0.55, rx: 1.34, ry: 0.86, p: 4.4, yOff: 8.34 },
      { z: 0.55, rx: 1.34, ry: 0.86, p: 4.4, yOff: 8.34 },
      { z: 1.10, rx: 0.95, ry: 0.58, p: 4.0, yOff: 8.26 },
    ], count: 20, steps: 10,
    circGrooves: [{ z: 0.0, depth: 0.05, width: 0.12 }],
    longGrooves: [{ a: 0.25, depth: 0.04, width: 0.028, z0: -0.9, z1: 0.9 }],
  }));
  p.add(SMat.hostilePlate, chamferBox(2.30, 0.16, 1.00, 0.05), M.chain(M.t(0, 8.66, -1.02), M.rx(0.58)));
  p.add(SMat.hostileTrim, chamferBox(1.70, 0.09, 0.22, 0.03), M.chain(M.t(0, 8.90, -1.24), M.rx(0.58)));
  p.both(SMat.metalDark, louvers({ n: 4, w: 0.58, h: 0.045, d: 0.11, gap: 0.086, tilt: -0.6 }),
    M.chain(M.t(1.12, 8.30, 0.60), M.ry(1.18)));
  p.into(root);

  /* traversing quad mount: two twin cradles on one ring */
  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 8.82, 0);
  {
    const tp = Parts();
    tp.add(SMat.hostile, hullLoft({
      stations: [
        { z: -0.95, rx: 0.72, ry: 0.44, p: 3.2, yOff: 0.24 },
        { z: -0.35, rx: 1.02, ry: 0.64, p: 3.6, yOff: 0.30 },
        { z: 0.45, rx: 0.96, ry: 0.60, p: 3.6, yOff: 0.29 },
        { z: 0.92, rx: 0.66, ry: 0.40, p: 3.2, yOff: 0.22 },
      ], count: 18, steps: 10,
      circGrooves: [{ z: 0.0, depth: 0.035, width: 0.08 }],
    }));
    tp.add(SMat.hostileTrim, shellArc({ r: 1.06, t: 0.04, a0: -0.5, a1: 0.5, z0: -0.25, z1: 0.35, seg: 8 }),
      M.t(0, 0.30, 0));
    tp.add(SMat.metalDark, blisterGeo({ rx: 0.24, ry: 0.18, rz: 0.32, seg: 12, rings: 4 }), M.t(0, 0.96, 0.30));
    tp.into(turret);
  }
  const barrels = new THREE.Group();
  barrels.name = 'barrels';
  barrels.position.set(0, 0.44, -0.40);
  {
    const bp = Parts();
    bp.add(SMat.metalDark, chamferBox(1.30, 0.44, 0.62, 0.08), M.t(0, 0, 0.08));
    for (const dy of [0.13, -0.13]) {
      bp.both(SMat.metal, tubeAlong([V3(0, 0, 0.08), V3(0, 0, -1.75)], (t) => 0.062 - t * 0.014, 8),
        M.t(0.42, dy, 0));
      bp.both(SMat.metalDark, chamferBox(0.15, 0.15, 0.20, 0.03), M.t(0.42, dy, -1.72));
      bp.both(SMat.hostileGlow, new THREE.CircleGeometry(0.046, 8), M.chain(M.t(0.42, dy, -1.85), M.ry(Math.PI)));
    }
    bp.both(SMat.hostileTrim, chamferBox(0.14, 0.05, 0.40, 0.02), M.t(0.42, 0.26, -0.90));
    bp.into(barrels);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), EMat.eyeAmber);
  eye.position.set(0, 0.30, -0.58);
  eye.name = 'eye';
  barrels.add(eye);
  turret.add(barrels);
  root.add(turret);

  root.userData.spec = {
    kind: 'pylon', radius: 3.4, hp: 14, score: 260, static: true,
    // Two mounts, four barrels: `enemyFire` fires every mount on every burst
    // step, so a four-mount quad at burst 4 would put four times the bulwark's
    // volume in the air off one emplacement. The listed pair is the outboard
    // barrel of each cradle.
    guns: [V3(0.56, 9.26, -2.25), V3(-0.56, 9.26, -2.25)],
    maxSpeed: 0, turnRate: 1.0, accel: 0,
    fireRange: 900, burst: 4, burstGap: 0.14, reload: 2.0, dmg: 8,
    boomScale: 2.2,
  };
  return root;
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMMANDER — elite mini-boss, the climax of levels 2 and 3
   ═══════════════════════════════════════════════════════════════════════════

   Sits between the vanguard (30 m, one hp pool) and Gargantua (68 m, three
   phases): 24 m, three destructible weak points, one phase change.

   The fight is a search, not an attrition race. There is no single bar to
   empty — three parts, killable in any order, and all three down ends it. So
   the rig has one job above every other: **the weak points are the only lit
   features on the hull.** Amber means shoot here, on both variants and on both
   planets, so the lesson carries from Fichina to Sector Ω.

   One rig, two skins. `ice` is a gun emplacement — frontal armour, spinal
   barrel, weak points on the recoil dampers and the coolant spine. `void` is a
   flagship — broadside turrets, weak points on the bridge and two reactor
   vents. They share the turret module, the engine bank, the hit register and
   the whole api; only the hull, the weapon and the material set differ.

   Decisions (when to fire, where to station) live in game/combat.js. This file
   owns the object and the presentation of its state. */

export const COMMANDER = {
  weakHp: 46,           // × 3 = 138, the whole fight
  hullHp: 220,          // armour. Never the objective — see api.parts
  score: 5000,
  radius: 12,           // authored units; the spec carries it × NPC_SCALE

  // Station-keeping numbers for combat.js, in the same field names as its
  // TUNE.boss block. Closer than the carrier's -520: this hull is a third the
  // size, so it has to sit inside 700 m to be more than a speck.
  station: {
    z: -430, zNear: -280, zFar: -640,
    clearance: 46, follow: 1.9,
    pathX: 58, pathXw: 0.61, pathX2: 19, pathX2w: 1.29,
    pathY: 20, pathYw: 0.83, pathYMid: 26,
    railX: 90, railYUp: 62, railYDown: 4,
  },
  // Applied by combat.js when the first weak point dies; the object handles
  // its own visual half of the phase change.
  phase2: { fireScale: 0.60, followScale: 1.35 },
};

const CM = {};
let cmBuilt = false;
function commanderMaterials() {
  if (cmBuilt) return CM;
  cmBuilt = true;
  buildEnemyMaterials();

  /* Fichina: a cold conductor under a dielectric ice glaze. Two different
     BRDFs on one hull is what stops the whole thing reading as one grey mass
     at 500 m — the glaze holds a hard narrow rim where the metal holds none. */
  CM.iceHull = SMat.hostile.clone();
  CM.iceHull.color.setHex(0x555f6b);
  CM.iceHull.roughness = 0.58;
  CM.iceHull.metalness = 0.80;
  CM.iceHull.envMapIntensity = 1.25;

  CM.icePlate = SMat.hostile.clone();
  CM.icePlate.color.setHex(0x8ca4b6);
  CM.icePlate.roughness = 0.28;
  CM.icePlate.metalness = 0.10;
  CM.icePlate.clearcoat = 1.0;
  CM.icePlate.clearcoatRoughness = 0.10;
  CM.icePlate.envMapIntensity = 1.9;

  CM.rime = SMat.hostile.clone();
  CM.rime.color.setHex(0xc3d3e0);
  CM.rime.roughness = 0.90;
  CM.rime.metalness = 0.0;
  CM.rime.envMapIntensity = 1.1;

  /* Sector Ω: no ground bounce and no sky, so the hull gets its value from its
     own panel lighting rather than from the environment. Darker albedo than
     any other hostile, and the only ship in the game that carries running
     lights along its flanks. */
  CM.voidHull = SMat.hostile.clone();
  CM.voidHull.color.setHex(0x37323f);
  CM.voidHull.roughness = 0.64;
  CM.voidHull.metalness = 0.74;
  CM.voidHull.envMapIntensity = 0.55;

  CM.voidPlate = SMat.hostilePlate.clone();
  CM.voidPlate.color.setHex(0x1d1a24);
  CM.voidPlate.roughness = 0.90;
  CM.voidPlate.metalness = 0.42;
  CM.voidPlate.envMapIntensity = 0.40;

  CM.panel = emissive(0xb44dff, 2.4);
  CM.weak = emissive(0xffb43a, 6.5);
  CM.weakDead = emissive(0x2a1e14, 0.5);
  CM.eye = emissive(0xff3a20, 5.0);
  CM.charge = emissive(0xffd070, 6.0);

  /* Deep water: no sky term worth having and a fog that eats value inside
     300 m, so the hull separates on its own wet specular against a matte
     fouling band — the ice glaze's two-BRDF trick, run the other way round. */
  CM.tideHull = SMat.hostile.clone();
  CM.tideHull.color.setHex(0x2c4a49);
  CM.tideHull.roughness = 0.40;
  CM.tideHull.metalness = 0.66;
  CM.tideHull.clearcoat = 0.85;
  CM.tideHull.clearcoatRoughness = 0.22;
  CM.tideHull.envMapIntensity = 1.15;

  CM.tidePlate = SMat.hostilePlate.clone();
  CM.tidePlate.color.setHex(0x1b3130);
  CM.tidePlate.roughness = 0.70;
  CM.tidePlate.metalness = 0.45;
  CM.tidePlate.envMapIntensity = 0.80;

  CM.tideFoul = SMat.hostilePlate.clone();
  CM.tideFoul.color.setHex(0x6d6a52);
  CM.tideFoul.roughness = 0.99;
  CM.tideFoul.metalness = 0.0;
  CM.tideFoul.clearcoat = 0.0;
  CM.tideFoul.envMapIntensity = 0.65;

  CM.tideLamp = emissive(0xa8e8ff, 2.6);

  /* Night forest: the darkest hull in the game, taking its whole value from its
     own lamps. Those stay amber. Green is the player's channel here — it is the
     instrument and HUD colour — and the beacon rule keeps hostile lamps in the
     warm half, so the level's green lives in the coil emissive alone, where it
     reads as the machine's own biology rather than as a friendly. */
  CM.bloomHull = SMat.hostile.clone();
  CM.bloomHull.color.setHex(0x241f1c);
  CM.bloomHull.roughness = 0.88;
  CM.bloomHull.metalness = 0.52;
  CM.bloomHull.envMapIntensity = 0.55;

  CM.bloomPlate = SMat.hostilePlate.clone();
  CM.bloomPlate.color.setHex(0x14100e);
  CM.bloomPlate.roughness = 0.95;
  CM.bloomPlate.metalness = 0.30;
  CM.bloomPlate.envMapIntensity = 0.40;

  CM.bloomLamp = emissive(0xffa42a, 2.4);
  CM.bloomCoil = emissive(0x8cff2e, 3.2);

  /* Volcanic trench: the key light is a lava river *below*, so up-facing plate
     gets nothing and the underside gets everything. The slag crust is the only
     warm diffuse on the hull and it goes on the prow, which is the face this
     ship presents for the whole fight. */
  CM.forgeHull = SMat.hostile.clone();
  CM.forgeHull.color.setHex(0x2e2622);
  CM.forgeHull.roughness = 0.82;
  CM.forgeHull.metalness = 0.62;
  CM.forgeHull.envMapIntensity = 0.70;

  CM.forgePlate = SMat.hostilePlate.clone();
  CM.forgePlate.color.setHex(0x191412);
  CM.forgePlate.roughness = 0.94;
  CM.forgePlate.metalness = 0.35;
  CM.forgePlate.envMapIntensity = 0.45;

  CM.forgeSlag = SMat.hostile.clone();
  CM.forgeSlag.color.setHex(0x5a3a2a);
  CM.forgeSlag.roughness = 0.98;
  CM.forgeSlag.metalness = 0.10;
  CM.forgeSlag.envMapIntensity = 0.55;

  CM.forgeVane = emissive(0xff3a08, 2.0);
  CM.forgeCore = emissive(0xffb03a, 3.0);
  return CM;
}

/** Barbette + elevating twin mount. Shared by both variants. */
function cmdTurret(name, hullMat, plateMat) {
  const g = new THREE.Group();
  g.name = name;
  const p = Parts();
  p.add(hullMat, hullLoft({
    stations: [
      { z: -1.10, rx: 0.80, ry: 0.50, p: 3.2, yOff: 0.30 },
      { z: -0.40, rx: 1.12, ry: 0.74, p: 3.6, yOff: 0.40 },
      { z: 0.45, rx: 1.06, ry: 0.70, p: 3.6, yOff: 0.39 },
      { z: 1.05, rx: 0.74, ry: 0.46, p: 3.2, yOff: 0.28 },
    ], count: 18, steps: 10,
    circGrooves: [{ z: 0.0, depth: 0.04, width: 0.09 }],
  }));
  p.add(plateMat, chamferBox(1.55, 0.14, 0.85, 0.05), M.chain(M.t(0, 0.86, -0.70), M.rx(0.55)));
  p.both(SMat.metalDark, louvers({ n: 3, w: 0.52, h: 0.055, d: 0.12, gap: 0.10, tilt: -0.6 }),
    M.chain(M.t(0.92, 0.62, 0.55), M.ry(1.2)));
  p.into(g);

  const barrels = new THREE.Group();
  barrels.name = 'barrels';
  barrels.position.set(0, 0.80, -0.45);
  const bp = Parts();
  bp.add(SMat.metalDark, chamferBox(0.92, 0.52, 0.74, 0.09));
  bp.both(SMat.metal, tubeAlong([V3(0, 0, 0.10), V3(0, 0, -1.85)], (t) => 0.105 - t * 0.026, 10), M.t(0.26, 0, 0));
  bp.both(SMat.metalDark, chamferBox(0.23, 0.23, 0.28, 0.04), M.t(0.26, 0, -1.82));
  bp.both(SMat.hostileTrim, chamferBox(0.16, 0.05, 0.42, 0.02), M.t(0.26, 0.14, -1.05));
  bp.both(SMat.hostileGlow, new THREE.CircleGeometry(0.065, 10), M.chain(M.t(0.26, 0, -1.99), M.ry(Math.PI)));
  bp.into(barrels);

  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), CM.eye);
  eye.position.set(0, 0.30, -0.58);
  eye.name = 'eye';
  barrels.add(eye);
  g.add(barrels);
  g.userData.barrels = barrels;
  g.userData.muzzle = V3(0.26, 0, -2.05);
  return g;
}

/** Emissive band round a z-axis cylinder — a damper collar, a vent throat. */
function bandGeo(r, len, seg = 20) {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  g.rotateX(Math.PI / 2);
  return g;
}

/* ── ice: recoil damper ────────────────────────────────────────────────────
   Reads as a piston because it has one: a rod running forward into the
   armour, a body that recoils on the shot, and a collar that vents. */
function iceDamper(name) {
  const g = new THREE.Group();
  g.name = name;
  const p = Parts();
  p.add(CM.iceHull, hullLoft({
    stations: [
      { z: -3.30, rx: 0.86, ry: 0.86, p: 3.0 },
      { z: -2.30, rx: 1.14, ry: 1.14, p: 3.2 },
      { z: 1.50, rx: 1.20, ry: 1.20, p: 3.2 },
      { z: 2.85, rx: 0.94, ry: 0.94, p: 3.0 },
    ], count: 20, steps: 12,
    circGrooves: [{ z: -1.30, depth: 0.10, width: 0.24 }, { z: 0.70, depth: 0.10, width: 0.24 }],
    longGrooves: [{ a: 0.25, depth: 0.08, width: 0.022, z0: -2.6, z1: 2.4 }],
  }));
  p.add(SMat.metal, tubeAlong([V3(0, 0, -3.10), V3(0, 0, -6.40)], 0.30, 12));
  p.add(SMat.metalDark, shellArc({ r: 0.44, t: 0.12, a0: 0, a1: Math.PI * 2, z0: -6.50, z1: -6.05, seg: 14 }));
  p.add(CM.icePlate, shellArc({ r: 1.26, t: 0.14, a0: 0.35, a1: Math.PI - 0.35, z0: -1.9, z1: 1.1, seg: 12 }));
  p.add(SMat.metalDark, louvers({ n: 4, w: 1.30, h: 0.10, d: 0.24, gap: 0.19, tilt: -0.5 }),
    M.chain(M.t(0, 1.02, 1.95), M.rx(-1.25)));
  p.add(CM.rime, extrudePoly([
    new THREE.Vector2(-0.85, -0.30), new THREE.Vector2(0.55, -0.55),
    new THREE.Vector2(0.95, 0.35), new THREE.Vector2(-0.45, 0.62),
  ], 0.24, 0.05), M.chain(M.t(0, 1.24, -0.60), M.rx(-Math.PI / 2)));
  p.into(g);

  const band = new THREE.Mesh(bandGeo(1.24, 0.90), CM.weak);
  band.position.z = -0.30;
  band.name = 'lamp';
  const vent = new THREE.Mesh(new THREE.CircleGeometry(0.86, 18), CM.weak);
  vent.position.z = 2.88;
  vent.name = 'lamp';
  g.add(band, vent);
  g.userData.lamps = [band, vent];
  return g;
}

/* ── ice: coolant spine ──────────────────────────────────────────────────── */
function iceSpine(name) {
  const g = new THREE.Group();
  g.name = name;
  const p = Parts();
  p.add(CM.iceHull, chamferBox(1.70, 0.62, 5.60, 0.14));
  // fins stacked along z: louvers stacks on +Y, so the block is laid on its side
  p.add(SMat.metalDark, louvers({ n: 7, w: 2.50, h: 0.17, d: 1.45, gap: 0.74, tilt: 0 }),
    M.chain(M.t(0, 0.72, 0), M.rx(Math.PI / 2)));
  p.both(CM.icePlate, extrudePoly([
    new THREE.Vector2(-2.55, -0.36), new THREE.Vector2(2.55, -0.36),
    new THREE.Vector2(2.55, 0.36), new THREE.Vector2(-2.55, 0.36),
  ], 0.16, 0.04), M.chain(M.t(1.02, 1.40, 0), M.ry(Math.PI / 2), M.rz(0.22)));
  p.add(CM.rime, extrudePoly([
    new THREE.Vector2(-0.70, -2.30), new THREE.Vector2(0.62, -1.90),
    new THREE.Vector2(0.80, 1.95), new THREE.Vector2(-0.55, 2.40),
  ], 0.20, 0.05), M.t(0, 0.42, 0));
  p.into(g);

  const lamp = new THREE.Mesh(chamferBox(1.16, 0.92, 5.10, 0.10), CM.weak);
  lamp.position.y = 0.94;
  lamp.name = 'lamp';
  const vent = new THREE.Mesh(new THREE.CircleGeometry(0.72, 16), CM.weak);
  vent.position.set(0, 0.70, 2.84);
  vent.name = 'lamp';
  g.add(lamp, vent);
  g.userData.lamps = [lamp, vent];
  return g;
}

/* ── void: bridge ────────────────────────────────────────────────────────── */
function voidBridge(name) {
  const g = new THREE.Group();
  g.name = name;
  const p = Parts();
  p.add(CM.voidHull, hullLoft({
    stations: [
      { z: -2.30, rx: 1.35, ry: 0.55, p: 3.6, yOff: -1.10 },
      { z: -1.10, rx: 1.62, ry: 1.05, p: 4.0, yOff: -0.55 },
      { z: 0.90, rx: 1.50, ry: 1.00, p: 4.0, yOff: -0.40 },
      { z: 2.20, rx: 1.05, ry: 0.55, p: 3.4, yOff: -0.85 },
    ], count: 20, steps: 12,
    circGrooves: [{ z: -0.10, depth: 0.07, width: 0.18 }],
  }));
  p.add(SMat.hostileGlass, hullLoft({
    stations: [
      { z: -2.05, rx: 0.95, ry: 0.30, p: 3.4, yOff: 0.10 },
      { z: -1.20, rx: 1.30, ry: 0.62, p: 3.8, yOff: 0.24 },
      { z: 0.35, rx: 1.20, ry: 0.56, p: 3.8, yOff: 0.26 },
      { z: 1.30, rx: 0.82, ry: 0.28, p: 3.4, yOff: 0.14 },
    ], count: 18, steps: 8,
  }));
  p.add(SMat.metal, tubeAlong([V3(0, 0.70, 1.60), V3(0, 3.40, 2.35)], (t) => 0.13 - t * 0.07, 8));
  p.add(SMat.hostileTrim, chamferBox(0.30, 0.30, 0.30, 0.07), M.t(0, 3.45, 2.38));
  p.both(SMat.metalDark, chamferBox(0.20, 0.44, 1.70, 0.05), M.t(1.44, -0.30, 0.10));
  p.into(g);

  const lamp = new THREE.Mesh(chamferBox(2.34, 0.46, 2.90, 0.06), CM.weak);
  lamp.position.set(0, 0.28, -0.30);
  lamp.name = 'lamp';
  const aft = new THREE.Mesh(chamferBox(1.90, 0.60, 0.16, 0.04), CM.weak);
  aft.position.set(0, 0.10, 1.90);
  aft.name = 'lamp';
  g.add(lamp, aft);
  g.userData.lamps = [lamp, aft];
  return g;
}

/* ── void: reactor vent ──────────────────────────────────────────────────── */
function voidVent(name, sx) {
  const g = new THREE.Group();
  g.name = name;
  const p = Parts();
  p.add(CM.voidHull, hullLoft({
    stations: [
      { z: -2.40, rx: 0.75, ry: 1.20, p: 3.4 },
      { z: -1.55, rx: 1.05, ry: 1.72, p: 3.8 },
      { z: 1.45, rx: 1.05, ry: 1.72, p: 3.8 },
      { z: 2.30, rx: 0.75, ry: 1.20, p: 3.4 },
    ], count: 18, steps: 10,
    circGrooves: [{ z: -0.05, depth: 0.08, width: 0.20 }],
  }));
  p.add(SMat.metalDark, louvers({ n: 6, w: 2.80, h: 0.14, d: 0.34, gap: 0.44, tilt: -0.42 }),
    M.chain(M.t(sx * 0.86, 0, 0), M.ry(sx * Math.PI / 2)));
  p.add(CM.voidPlate, shellArc({ r: 1.80, t: 0.16, a0: -1.15, a1: 1.15, z0: -2.1, z1: 2.0, seg: 10 }),
    M.rz(sx > 0 ? -Math.PI / 2 : Math.PI / 2));
  p.into(g);

  const lamp = new THREE.Mesh(new THREE.PlaneGeometry(3.30, 2.60), CM.weak);
  lamp.position.set(sx * 0.72, 0, 0);
  lamp.rotation.y = sx * Math.PI / 2;
  lamp.name = 'lamp';
  const aft = new THREE.Mesh(new THREE.PlaneGeometry(1.30, 2.40), CM.weak);
  aft.position.set(sx * 0.30, 0, 2.36);
  aft.name = 'lamp';
  g.add(lamp, aft);

  // Blast cover: sits over the grille at rest, hinges clear once the ship is
  // angry. The vent is hittable throughout; the cover is the phase tell.
  const cover = new THREE.Group();
  cover.name = 'cover';
  cover.position.set(sx * 1.05, 1.65, 0);
  const cp = Parts();
  cp.add(CM.voidPlate, chamferBox(0.22, 3.20, 4.10, 0.07), M.t(0, -1.60, 0));
  cp.add(SMat.hostileTrim, chamferBox(0.07, 0.18, 3.40, 0.02), M.t(sx * -0.14, -1.60, 0));
  cp.into(cover);
  g.add(cover);
  g.userData.cover = cover;
  g.userData.lamps = [lamp, aft];
  return g;
}

/* ── ice hull ──────────────────────────────────────────────────────────────
   Wide armoured slab with a spike through it. The read at 100 px is the
   frontal shield and the barrel; nothing else on the ship is allowed to
   compete for the horizontal. */
function buildIce(root, rig) {
  const p = Parts();

  p.add(CM.iceHull, hullLoft({
    stations: [
      { z: -6.80, rx: 2.90, ry: 1.85, p: 4.2, squash: 0.86 },
      { z: -4.40, rx: 3.85, ry: 2.35, p: 4.4, squash: 0.82, shoulder: 0.14 },
      { z: -0.90, rx: 4.30, ry: 2.55, p: 4.5, squash: 0.80, shoulder: 0.19 },
      { z: 3.00, rx: 4.15, ry: 2.48, p: 4.5, squash: 0.82, shoulder: 0.16 },
      { z: 6.40, rx: 3.60, ry: 2.15, p: 4.3, squash: 0.86, shoulder: 0.08 },
      { z: 9.30, rx: 2.95, ry: 1.75, p: 4.0, squash: 0.92 },
    ], count: 26, steps: 24,
    circGrooves: [
      { z: -3.00, depth: 0.14, width: 0.36 }, { z: 1.20, depth: 0.14, width: 0.36 },
      { z: 5.20, depth: 0.12, width: 0.32 },
    ],
    longGrooves: [
      { a: 0.25, depth: 0.11, width: 0.022, z0: -6.0, z1: 8.6 },
      { a: 0.12, depth: 0.09, width: 0.018, z0: -5.0, z1: 8.0 },
      { a: 0.38, depth: 0.09, width: 0.018, z0: -5.0, z1: 8.0 },
    ],
    dents: [
      { z: 2.20, a: 0.00, rz: 2.2, ra: 0.05, depth: 0.38, rim: 0.55 },
      { z: 2.20, a: 0.50, rz: 2.2, ra: 0.05, depth: 0.38, rim: 0.55 },
    ],
  }));

  /* frontal shield + outboard ears: the whole silhouette lives here */
  p.add(CM.icePlate, extrudePoly([
    new THREE.Vector2(-5.30, -1.55), new THREE.Vector2(-3.20, -3.30),
    new THREE.Vector2(3.20, -3.30), new THREE.Vector2(5.30, -1.55),
    new THREE.Vector2(3.80, 3.30), new THREE.Vector2(-3.80, 3.30),
  ], 1.40, 0.22), M.chain(M.t(0, 0.30, -6.60), M.rx(0.10)));
  p.add(CM.iceHull, shellArc({ r: 1.35, t: 0.30, a0: 0, a1: Math.PI * 2, z0: -7.60, z1: -6.90, seg: 20 }),
    M.t(0, 0.35, 0));
  p.both(CM.icePlate, extrudePoly([
    new THREE.Vector2(0, -2.35), new THREE.Vector2(2.30, -1.05),
    new THREE.Vector2(2.30, 1.45), new THREE.Vector2(0, 2.95),
  ], 0.90, 0.16), M.chain(M.t(5.05, 0.20, -6.20), M.rz(-0.30)));
  p.both(SMat.hostileTrim, chamferBox(0.34, 2.10, 0.30, 0.06), M.chain(M.t(4.70, 0.30, -7.20), M.rz(-0.30)));
  p.add(SMat.metalDark, boltRow({ from: [-3.0, 3.15, -6.9], to: [3.0, 3.15, -6.9], n: 9, r: 0.10, h: 0.06 }));

  /* spinal barrel */
  p.add(SMat.metal, tubeAlong([V3(0, 0.35, -5.00), V3(0, 0.35, -15.30)], (t) => 0.88 - t * 0.22, 14));
  for (const z of [-9.60, -11.60, -13.40]) {
    p.add(SMat.metalDark, shellArc({ r: 1.02, t: 0.30, a0: 0, a1: Math.PI * 2, z0: z - 0.30, z1: z + 0.30, seg: 16 }),
      M.t(0, 0.35, 0));
  }
  p.add(CM.icePlate, shellArc({ r: 0.92, t: 0.24, a0: 0, a1: Math.PI * 2, z0: -15.70, z1: -14.80, seg: 16 }),
    M.t(0, 0.35, 0));

  /* rime: pale slabs on the up-facing surfaces, the frost read */
  p.both(CM.rime, extrudePoly([
    new THREE.Vector2(-1.20, -0.80), new THREE.Vector2(1.35, -1.15),
    new THREE.Vector2(1.05, 0.95), new THREE.Vector2(-1.05, 1.20),
  ], 0.22, 0.05), M.chain(M.t(2.20, 2.42, 1.30), M.rx(-Math.PI / 2), M.rz(0.4)));
  p.add(CM.rime, extrudePoly([
    new THREE.Vector2(-2.60, -0.70), new THREE.Vector2(2.40, -0.95),
    new THREE.Vector2(2.10, 0.85), new THREE.Vector2(-2.30, 1.05),
  ], 0.20, 0.05), M.chain(M.t(0, 3.42, -6.30), M.rx(-Math.PI / 2 + 0.10)));

  /* aft: thruster skirt */
  p.add(SMat.heat, hullLoft({
    stations: [
      { z: 9.20, rx: 2.95, ry: 1.80, p: 4.0, squash: 0.92 },
      { z: 10.10, rx: 2.60, ry: 1.60, p: 3.8, squash: 0.94 },
    ], count: 22, steps: 3, capStart: false,
  }));
  p.both(SMat.ceramic, ductGeo({ rx: 0.92, ry: 0.92, depth: 1.05, throat: 0.72, lip: 0.12, sides: 16, p: 2.8 }),
    M.chain(M.t(1.65, 0.10, 10.20), M.ry(Math.PI)));
  p.both(SMat.metalDark, chamferBox(0.60, 0.60, 1.60, 0.10), M.t(3.30, -0.90, 8.20));
  p.into(root);

  /* weak points */
  const dR = iceDamper('damperR'); dR.position.set(3.05, 2.75, -1.20);
  const dL = iceDamper('damperL'); dL.position.set(-3.05, 2.75, -1.20);
  const sp = iceSpine('spine'); sp.position.set(0, 2.95, 4.60);
  for (const w of [dR, dL, sp]) { root.add(w); rig.weak.push(w); }
  rig.recoil.push({ node: dR, index: 0, z: -1.20, k: 1.30 }, { node: dL, index: 1, z: -1.20, k: 1.30 });

  /* two flank mounts, not destructible — chaff fire while you hunt */
  for (const sx of [1, -1]) {
    const t = cmdTurret('turret' + rig.turrets.length, CM.iceHull, CM.icePlate);
    t.position.set(sx * 3.55, -1.35, 1.90);
    t.rotation.z = sx > 0 ? -0.22 : 0.22;
    root.add(t);
    rig.turrets.push(t);
  }

  for (const sx of [1, -1]) {
    const e = engineNode(sx * 1.65, 0.10, 10.30, 0.78, { len: 5.4 });
    e.name = 'engine';
    root.add(e);
    rig.engines.push(e);
  }

  /* spinal gun: charge orb at the muzzle, beam down -Z */
  const cannon = new THREE.Group();
  cannon.name = 'cannon';
  cannon.position.set(0, 0.35, 0);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.70, 14, 10), CM.charge);
  muzzle.position.z = -15.70;
  muzzle.scale.setScalar(0.001);
  cannon.add(muzzle);
  const beam = new THREE.Mesh(plumeGeo({ r0: 0.90, r1: 0.34, len: 1.0, sides: 14, bulge: 1.0 }), EMat.plume);
  beam.position.z = -15.70;
  beam.rotation.x = Math.PI;
  beam.renderOrder = 7;
  beam.visible = false;
  cannon.add(beam);
  root.add(cannon);
  rig.cannon = cannon;
  rig.muzzle = muzzle;
  rig.beam = beam;

  return [
    { id: 'damperR', label: 'RECOIL DAMPER', local: V3(3.05, 2.75, -1.50), radius: 2.30 },
    { id: 'damperL', label: 'RECOIL DAMPER', local: V3(-3.05, 2.75, -1.50), radius: 2.30 },
    { id: 'spine', label: 'COOLANT SPINE', local: V3(0, 3.25, 4.60), radius: 2.40 },
  ];
}

/* ── void hull ─────────────────────────────────────────────────────────────
   A forked dagger with a tower. Fought with no terrain behind it, so the
   silhouette has to be carried by the hull's own outline and its running
   lights rather than by contrast against a sky. */
function buildVoid(root, rig) {
  const p = Parts();

  p.add(CM.voidHull, hullLoft({
    stations: [
      { z: -10.60, rx: 0.95, ry: 0.62, p: 3.6, squash: 0.90 },
      { z: -7.60, rx: 2.05, ry: 1.18, p: 4.0, squash: 0.86, shoulder: 0.12 },
      { z: -3.00, rx: 3.30, ry: 1.85, p: 4.3, squash: 0.80, shoulder: 0.20 },
      { z: 1.40, rx: 3.80, ry: 2.10, p: 4.4, squash: 0.78, shoulder: 0.22 },
      { z: 5.80, rx: 3.50, ry: 1.95, p: 4.3, squash: 0.82, shoulder: 0.16 },
      { z: 9.30, rx: 2.90, ry: 1.62, p: 4.0, squash: 0.88, shoulder: 0.05 },
      { z: 11.00, rx: 2.40, ry: 1.35, p: 3.8, squash: 0.94 },
    ], count: 28, steps: 26,
    circGrooves: [
      { z: -5.20, depth: 0.12, width: 0.32 }, { z: -0.60, depth: 0.13, width: 0.34 },
      { z: 3.80, depth: 0.13, width: 0.34 }, { z: 7.80, depth: 0.11, width: 0.30 },
    ],
    longGrooves: [
      { a: 0.25, depth: 0.10, width: 0.022, z0: -9.0, z1: 10.2 },
      { a: 0.00, depth: 0.09, width: 0.018, z0: -8.0, z1: 10.0 },
      { a: 0.50, depth: 0.09, width: 0.018, z0: -8.0, z1: 10.0 },
    ],
    dents: [
      { z: -2.00, a: 0.00, rz: 2.4, ra: 0.05, depth: 0.34, rim: 0.55 },
      { z: -2.00, a: 0.50, rz: 2.4, ra: 0.05, depth: 0.34, rim: 0.55 },
    ],
  }));

  /* forked prow — two prongs, the inverse of the Arwing's single point */
  p.both(CM.voidPlate, extrudePoly([
    new THREE.Vector2(0, -0.65), new THREE.Vector2(3.20, -0.30),
    new THREE.Vector2(3.20, 0.28), new THREE.Vector2(0, 1.05),
  ], 0.70, 0.10), M.chain(M.t(0.95, -0.20, -9.60), M.ry(Math.PI / 2 - 0.10), M.rz(-0.16)));
  p.both(SMat.hostileTrim, chamferBox(0.14, 0.14, 2.20, 0.03), M.t(1.20, -0.10, -11.40));
  p.add(CM.voidPlate, extrudePoly([
    new THREE.Vector2(-1.55, -0.90), new THREE.Vector2(1.55, -0.90),
    new THREE.Vector2(1.05, 1.35), new THREE.Vector2(-1.05, 1.35),
  ], 3.20, 0.14), M.t(0, -0.20, -9.30));

  /* dorsal armour deck + trim, so the top is not one smooth sweep */
  p.add(CM.voidPlate, hullLoft({
    stations: [
      { z: -5.60, rx: 1.55, ry: 0.26, p: 4.2, yOff: 1.60 },
      { z: -2.40, rx: 2.35, ry: 0.42, p: 4.4, yOff: 1.86 },
      { z: 2.60, rx: 2.35, ry: 0.42, p: 4.4, yOff: 1.90 },
      { z: 6.20, rx: 1.70, ry: 0.28, p: 4.2, yOff: 1.70 },
    ], count: 22, steps: 12,
  }));
  p.both(SMat.metalDark, boltRow({ from: [1.90, 2.28, -4.60], to: [1.90, 2.28, 5.40], n: 11, r: 0.10, h: 0.06 }));
  p.both(SMat.metalDark, louvers({ n: 5, w: 1.60, h: 0.11, d: 0.26, gap: 0.22, tilt: -0.55 }),
    M.chain(M.t(2.55, 1.05, -5.80), M.ry(1.25)));

  /* sponsons under the broadside mounts */
  for (const z of [-3.40, 1.10]) {
    p.both(CM.voidPlate, chamferBox(1.90, 0.70, 2.60, 0.16), M.chain(M.t(3.55, 1.05, z), M.rz(-0.14)));
  }

  /* running lights: the only reason this hull has an outline out there */
  rig.accents.push({ mat: CM.panel, r: 0.70, g: 0.30, b: 1.0, base: 1.9, rage: 1.6, rate: 1.7, swing: 0.25 });
  p.both(CM.panel, chamferBox(0.10, 0.13, 9.60, 0.03), M.t(3.34, 0.42, -0.60));
  p.both(CM.panel, chamferBox(0.10, 0.13, 4.20, 0.03), M.t(2.05, 2.18, 3.40));
  p.add(CM.panel, chamferBox(1.30, 0.10, 0.16, 0.03), M.t(0, 2.16, -5.90));

  /* aft: engine shroud */
  p.add(SMat.heat, hullLoft({
    stations: [
      { z: 10.90, rx: 2.42, ry: 1.38, p: 3.8, squash: 0.94 },
      { z: 11.90, rx: 2.10, ry: 1.20, p: 3.6, squash: 0.95 },
    ], count: 24, steps: 3, capStart: false,
  }));
  p.add(SMat.ceramic, ductGeo({ rx: 1.00, ry: 1.00, depth: 1.20, throat: 0.74, lip: 0.14, sides: 18, p: 2.8 }),
    M.chain(M.t(0, 0.20, 12.00), M.ry(Math.PI)));
  p.both(SMat.ceramic, ductGeo({ rx: 0.68, ry: 0.68, depth: 0.90, throat: 0.72, lip: 0.10, sides: 14, p: 2.8 }),
    M.chain(M.t(1.72, 0.05, 11.85), M.ry(Math.PI)));
  p.into(root);

  /* weak points */
  const br = voidBridge('bridge'); br.position.set(0, 2.55, 4.90);
  const vR = voidVent('ventR', 1); vR.position.set(3.35, 0.35, 3.60);
  const vL = voidVent('ventL', -1); vL.position.set(-3.35, 0.35, 3.60);
  for (const w of [br, vR, vL]) { root.add(w); rig.weak.push(w); }

  /* four broadside mounts */
  for (const z of [-3.40, 1.10]) for (const sx of [1, -1]) {
    const t = cmdTurret('turret' + rig.turrets.length, CM.voidHull, CM.voidPlate);
    t.position.set(sx * 3.60, 1.30, z);
    t.rotation.z = sx > 0 ? -0.16 : 0.16;
    root.add(t);
    rig.turrets.push(t);
  }

  const big = engineNode(0, 0.20, 12.10, 0.94, { len: 6.4 });
  big.name = 'engine';
  root.add(big);
  rig.engines.push(big);
  for (const sx of [1, -1]) {
    const e = engineNode(sx * 1.72, 0.05, 11.90, 0.64, { len: 4.8 });
    e.name = 'engine';
    root.add(e);
    rig.engines.push(e);
  }

  return [
    { id: 'bridge', label: 'BRIDGE', local: V3(0, 3.00, 4.90), radius: 2.30 },
    { id: 'ventR', label: 'REACTOR VENT', local: V3(3.55, 0.35, 3.60), radius: 2.20 },
    { id: 'ventL', label: 'REACTOR VENT', local: V3(-3.55, 0.35, 3.60), radius: 2.20 },
  ];
}

/* ── tide: ballast pod ─────────────────────────────────────────────────────
   Outboard, cylindrical and vented, hung off the pressure hull on two pylons
   so it reads as a bolt-on tank rather than as part of the hull line. */
function tideBallast(name, sx) {
  const g = new THREE.Group();
  g.name = name;
  const p = Parts();
  p.add(CM.tideHull, hullLoft({
    stations: [
      { z: -5.40, rx: 0.55, ry: 0.55, p: 2.8 },
      { z: -4.20, rx: 1.15, ry: 1.15, p: 3.0 },
      { z: -0.20, rx: 1.38, ry: 1.38, p: 3.2 },
      { z: 3.80, rx: 1.22, ry: 1.22, p: 3.0 },
      { z: 5.20, rx: 0.70, ry: 0.70, p: 2.8 },
    ], count: 20, steps: 14,
    circGrooves: [{ z: -2.20, depth: 0.10, width: 0.26 }, { z: 1.90, depth: 0.10, width: 0.26 }],
    longGrooves: [{ a: 0.25, depth: 0.08, width: 0.022, z0: -4.4, z1: 4.6 }],
  }));
  // flood vents along the crown, and a fouling crust on the outboard shoulder
  p.add(SMat.metalDark, louvers({ n: 6, w: 1.20, h: 0.11, d: 0.26, gap: 0.40, tilt: -0.45 }),
    M.chain(M.t(0, 1.18, -1.20), M.rx(-1.30)));
  p.add(CM.tideFoul, extrudePoly([
    new THREE.Vector2(-1.70, -0.55), new THREE.Vector2(1.50, -0.80),
    new THREE.Vector2(1.20, 0.60), new THREE.Vector2(-1.55, 0.85),
  ], 0.20, 0.05), M.chain(M.t(sx * 1.22, 0.28, 1.60), M.rz(sx * Math.PI / 2), M.rx(-Math.PI / 2)));
  p.add(CM.tidePlate, shellArc({ r: 1.44, t: 0.14, a0: 0.45, a1: Math.PI - 0.45, z0: -3.40, z1: -2.40, seg: 10 }));
  // pylons to the pressure hull
  for (const z of [-2.60, 2.40]) {
    p.add(CM.tidePlate, chamferBox(1.90, 0.44, 1.20, 0.10), M.chain(M.t(-sx * 1.05, 0.95, z), M.rz(sx * 0.24)));
  }
  p.into(g);

  const band = new THREE.Mesh(bandGeo(1.44, 1.10), CM.weak);
  band.position.z = -0.20;
  band.name = 'lamp';
  const cap = new THREE.Mesh(new THREE.CircleGeometry(0.64, 16), CM.weak);
  cap.position.z = 5.24;
  cap.name = 'lamp';
  g.add(band, cap);
  g.userData.lamps = [band, cap];
  return g;
}

/* ── tide: sonar mast ────────────────────────────────────────────────────── */
function tideMast(name) {
  const g = new THREE.Group();
  g.name = name;
  const p = Parts();
  /* the sail: a tall thin blade, the one vertical on an otherwise horizontal
     ship, and the reason a submersible reads as a submersible */
  p.add(CM.tideHull, hullLoft({
    stations: [
      { z: -3.30, rx: 0.62, ry: 1.95, p: 3.4 },
      { z: -1.70, rx: 0.98, ry: 2.62, p: 3.8 },
      { z: 1.40, rx: 0.94, ry: 2.56, p: 3.8 },
      { z: 3.10, rx: 0.58, ry: 1.80, p: 3.2 },
    ], count: 18, steps: 12,
    circGrooves: [{ z: -0.10, depth: 0.07, width: 0.18 }],
    longGrooves: [{ a: 0.0, depth: 0.06, width: 0.02, z0: -2.9, z1: 2.7 },
    { a: 0.5, depth: 0.06, width: 0.02, z0: -2.9, z1: 2.7 }],
  }));
  /* masthead: a flat array on a stub. A dish on a pole reads as a lollipop at
     any range where the weak point matters. */
  p.add(CM.tidePlate, chamferBox(2.30, 0.34, 2.60, 0.08), M.t(0, 2.68, 0.10));
  p.add(SMat.metalDark, louvers({ n: 4, w: 2.05, h: 0.14, d: 1.20, gap: 0.32, tilt: 0 }), M.t(0, 3.06, 0.10));
  p.both(SMat.metal, tubeAlong([V3(0, 0, 0), V3(0, 0.85, 0.30)], 0.070, 8), M.t(0.80, 3.30, 0));
  p.both(CM.tidePlate, blisterGeo({ rx: 0.42, ry: 0.30, rz: 0.42, seg: 12, rings: 4 }),
    M.chain(M.t(0.86, 4.15, 0.34), M.rx(-Math.PI / 2)));
  p.both(CM.tideFoul, extrudePoly([
    new THREE.Vector2(-1.00, -0.55), new THREE.Vector2(0.80, -0.72),
    new THREE.Vector2(0.62, 0.60), new THREE.Vector2(-0.90, 0.75),
  ], 0.16, 0.04), M.chain(M.t(0.94, -1.30, -0.70), M.ry(Math.PI / 2)));
  p.into(g);

  const band = new THREE.Mesh(chamferBox(1.14, 0.88, 4.90, 0.08), CM.weak);
  band.position.set(0, 1.42, 0.05);
  band.name = 'lamp';
  const head = new THREE.Mesh(chamferBox(2.42, 0.22, 2.72, 0.05), CM.weak);
  head.position.set(0, 2.50, 0.10);
  head.name = 'lamp';
  g.add(band, head);
  g.userData.lamps = [band, head];
  return g;
}

/* ── tide hull ─────────────────────────────────────────────────────────────
   A whale with a conning tower. It fights broadside — six traversing mounts,
   no spinal gun — so the read has to be the *flank*: a long taper, two pods
   slung outboard and the sail above them. */
function buildTide(root, rig) {
  const p = Parts();

  p.add(CM.tideHull, hullLoft({
    stations: [
      { z: -11.20, rx: 1.45, ry: 1.35, p: 2.6, squash: 0.95 },
      { z: -9.00, rx: 2.55, ry: 2.25, p: 2.9, squash: 0.92, shoulder: 0.06 },
      { z: -5.20, rx: 3.60, ry: 3.00, p: 3.1, squash: 0.88, shoulder: 0.12 },
      { z: -0.60, rx: 4.05, ry: 3.30, p: 3.2, squash: 0.86, shoulder: 0.16 },
      { z: 3.80, rx: 3.60, ry: 2.90, p: 3.1, squash: 0.88, shoulder: 0.10 },
      { z: 7.60, rx: 2.50, ry: 2.00, p: 2.9, squash: 0.92 },
      { z: 10.60, rx: 1.30, ry: 1.10, p: 2.7, squash: 0.95 },
    ], count: 28, steps: 26,
    circGrooves: [
      { z: -7.20, depth: 0.12, width: 0.32 }, { z: -2.60, depth: 0.13, width: 0.34 },
      { z: 2.00, depth: 0.13, width: 0.34 }, { z: 6.00, depth: 0.11, width: 0.30 },
    ],
    longGrooves: [
      { a: 0.25, depth: 0.10, width: 0.022, z0: -9.4, z1: 9.6 },
      { a: 0.00, depth: 0.09, width: 0.018, z0: -8.4, z1: 9.0 },
      { a: 0.50, depth: 0.09, width: 0.018, z0: -8.4, z1: 9.0 },
    ],
    dents: [
      { z: -4.00, a: 0.00, rz: 2.4, ra: 0.05, depth: 0.34, rim: 0.55 },
      { z: -4.00, a: 0.50, rz: 2.4, ra: 0.05, depth: 0.34, rim: 0.55 },
    ],
  }));

  /* bow: sonar dome and a pair of diving planes */
  p.add(CM.tidePlate, blisterGeo({ rx: 1.32, ry: 1.10, rz: 1.70, seg: 16, rings: 6 }),
    M.chain(M.t(0, 0.05, -11.10), M.rx(-Math.PI / 2)));
  p.both(CM.tidePlate, extrudePoly([
    new THREE.Vector2(0, -1.10), new THREE.Vector2(2.70, -0.70),
    new THREE.Vector2(2.70, 0.40), new THREE.Vector2(0, 1.00),
  ], 0.34, 0.08), M.chain(M.t(2.30, 0.10, -7.40), M.rx(-Math.PI / 2)));
  p.both(SMat.metalDark, chamferBox(0.30, 0.34, 1.30, 0.06), M.t(4.60, 0.10, -7.40));

  /* fouling: a matte crust at the waterline and slabs on the crown. Two
     surfaces that answer light differently is what keeps 24 m of one colour
     from reading as one mass. */
  p.both(CM.tideFoul, shellArc({ r: 4.14, t: 0.16, a0: -0.60, a1: 0.60, z0: -5.60, z1: 3.20, seg: 9, taper: 0.90 }));
  p.both(CM.tideFoul, extrudePoly([
    new THREE.Vector2(-1.60, -0.95), new THREE.Vector2(1.70, -1.25),
    new THREE.Vector2(1.35, 1.05), new THREE.Vector2(-1.40, 1.35),
  ], 0.22, 0.05), M.chain(M.t(1.90, 2.95, -2.10), M.rx(-Math.PI / 2), M.rz(0.35)));
  p.add(CM.tideFoul, extrudePoly([
    new THREE.Vector2(-2.30, -0.80), new THREE.Vector2(2.20, -1.05),
    new THREE.Vector2(1.90, 0.95), new THREE.Vector2(-2.05, 1.15),
  ], 0.20, 0.05), M.chain(M.t(0, 2.05, -8.60), M.rx(-Math.PI / 2 + 0.16)));

  /* dorsal casing and cleat rows */
  p.add(CM.tidePlate, hullLoft({
    stations: [
      { z: -7.40, rx: 1.35, ry: 0.24, p: 4.0, yOff: 2.05 },
      { z: -3.20, rx: 2.05, ry: 0.38, p: 4.2, yOff: 2.90 },
      { z: 2.60, rx: 2.00, ry: 0.38, p: 4.2, yOff: 2.95 },
      { z: 6.40, rx: 1.30, ry: 0.24, p: 4.0, yOff: 2.20 },
    ], count: 22, steps: 14,
  }));
  p.both(SMat.metalDark, boltRow({ from: [1.55, 3.20, -2.60], to: [1.55, 3.20, 2.20], n: 7, r: 0.10, h: 0.06 }));
  p.both(SMat.metalDark, louvers({ n: 5, w: 1.50, h: 0.11, d: 0.26, gap: 0.22, tilt: -0.55 }),
    M.chain(M.t(3.05, 1.05, -6.20), M.ry(1.24)));

  /* running lights: cyan-white, because the only other light down here is the
     surface 200 m up */
  rig.accents.push({ mat: CM.tideLamp, r: 0.62, g: 0.88, b: 1.0, base: 1.7, rage: 1.5, rate: 1.3, swing: 0.28 });
  p.both(CM.tideLamp, chamferBox(0.10, 0.13, 9.20, 0.03), M.t(3.62, 0.60, -1.20));
  p.add(CM.tideLamp, chamferBox(1.10, 0.10, 0.16, 0.03), M.t(0, 3.28, -7.10));
  p.both(CM.tideLamp, new THREE.CircleGeometry(0.22, 12), M.chain(M.t(1.05, 0.60, -11.55), M.ry(Math.PI)));

  /* aft: X-form control fins and a shrouded propulsor */
  for (let i = 0; i < 4; i++) {
    p.add(CM.tidePlate, extrudePoly([
      new THREE.Vector2(-1.60, 0.20), new THREE.Vector2(1.40, 0.20),
      new THREE.Vector2(0.60, 3.20), new THREE.Vector2(-1.00, 3.20),
    ], 0.28, 0.07), M.chain(M.rz(Math.PI / 4 + i * Math.PI / 2), M.t(0, 0, 8.60), M.ry(Math.PI / 2)));
  }
  p.add(CM.tidePlate, shellArc({ r: 2.05, t: 0.22, a0: 0, a1: Math.PI * 2, z0: 9.90, z1: 11.50, seg: 20 }));
  for (let i = 0; i < 4; i++) {
    p.add(SMat.metalDark, chamferBox(0.90, 0.16, 0.16, 0.03),
      M.chain(M.rz(i * Math.PI / 2 + Math.PI / 4), M.t(1.60, 0, 10.70)));
  }
  p.add(SMat.heat, hullLoft({
    stations: [
      { z: 10.40, rx: 1.32, ry: 1.12, p: 2.8, squash: 0.96 },
      { z: 11.20, rx: 1.10, ry: 0.95, p: 2.8, squash: 0.97 },
    ], count: 20, steps: 3, capStart: false,
  }));
  p.add(SMat.ceramic, ductGeo({ rx: 0.86, ry: 0.86, depth: 1.05, throat: 0.72, lip: 0.12, sides: 16, p: 2.8 }),
    M.chain(M.t(0, 0, 11.30), M.ry(Math.PI)));
  p.into(root);

  /* weak points */
  const bR = tideBallast('ballastR', 1); bR.position.set(5.50, -0.85, 0);
  const bL = tideBallast('ballastL', -1); bL.position.set(-5.50, -0.85, 0);
  const mast = tideMast('mast'); mast.position.set(0, 3.60, 1.40);
  for (const w of [bR, bL, mast]) { root.add(w); rig.weak.push(w); }

  /* six mounts, three a side: no spinal gun, so the broadside is the fight */
  for (const [z, x, y] of [[-5.40, 3.35, 1.55], [0.20, 3.85, 1.70], [5.00, 3.05, 1.45]]) {
    for (const sx of [1, -1]) {
      const t = cmdTurret('turret' + rig.turrets.length, CM.tideHull, CM.tidePlate);
      t.position.set(sx * x, y, z);
      t.rotation.z = sx > 0 ? -0.24 : 0.24;
      root.add(t);
      rig.turrets.push(t);
    }
  }

  const big = engineNode(0, 0, 11.40, 0.82, { len: 5.6 });
  big.name = 'engine';
  root.add(big);
  rig.engines.push(big);

  return [
    { id: 'ballastR', label: 'BALLAST POD', local: V3(5.50, -0.85, 0), radius: 2.55 },
    { id: 'ballastL', label: 'BALLAST POD', local: V3(-5.50, -0.85, 0), radius: 2.55 },
    { id: 'mast', label: 'SONAR MAST', local: V3(0, 5.30, 1.45), radius: 2.50 },
  ];
}

/* ── bloom: intake maw ─────────────────────────────────────────────────────
   A toothed mouth on the end of a gantry arm. The teeth are the read: a duct
   is machinery, a ring of angled cutters is an animal. */
function bloomMaw(name, sx) {
  const g = new THREE.Group();
  g.name = name;
  const p = Parts();
  p.add(CM.bloomHull, hullLoft({
    stations: [
      { z: -2.70, rx: 2.30, ry: 2.05, p: 4.0 },
      { z: -1.10, rx: 2.05, ry: 1.85, p: 3.8 },
      { z: 1.60, rx: 1.45, ry: 1.30, p: 3.6 },
      { z: 3.30, rx: 1.05, ry: 0.95, p: 3.2 },
    ], count: 20, steps: 14,
    circGrooves: [{ z: 0.20, depth: 0.09, width: 0.22 }],
    longGrooves: [{ a: 0.25, depth: 0.07, width: 0.020, z0: -2.3, z1: 2.9 },
    { a: 0.75, depth: 0.07, width: 0.020, z0: -2.3, z1: 2.9 }],
  }));
  p.add(CM.bloomPlate, shellArc({ r: 2.42, t: 0.20, a0: 0, a1: Math.PI * 2, z0: -2.85, z1: -2.25, seg: 18 }));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    p.add(SMat.metal, extrudePoly([
      new THREE.Vector2(-0.26, 0), new THREE.Vector2(0.26, 0), new THREE.Vector2(0, 1.05),
    ], 0.14, 0.03), M.chain(M.rz(-a), M.t(0, 2.16, -2.70), M.rx(-Math.PI / 2 + 0.22)));
  }
  // auger: a stack of slats down the throat, so the mouth has depth
  p.add(SMat.metalDark, louvers({ n: 5, w: 3.00, h: 0.16, d: 0.34, gap: 0.60, tilt: -0.6 }),
    M.chain(M.t(0, 0, -0.60), M.rx(Math.PI / 2), M.rz(0.4)));
  p.add(SMat.metalDark, chamferBox(0.44, 1.90, 1.10, 0.08), M.t(-sx * 2.10, 0.90, 1.90));
  p.into(g);

  const rim = new THREE.Mesh(bandGeo(2.52, 0.34, 22), CM.weak);
  rim.position.z = -2.58;
  rim.name = 'lamp';
  const throat = new THREE.Mesh(bandGeo(2.06, 1.10, 20), CM.weak);
  throat.position.z = -1.55;
  throat.name = 'lamp';
  const gullet = new THREE.Mesh(new THREE.CircleGeometry(1.05, 16), CM.weak);
  gullet.position.z = 2.60;
  gullet.name = 'lamp';
  g.add(rim, throat, gullet);
  g.userData.lamps = [rim, throat, gullet];
  return g;
}

/* ── bloom: spine coil ───────────────────────────────────────────────────── */
function bloomCoil(name) {
  const g = new THREE.Group();
  g.name = name;
  const p = Parts();
  p.add(CM.bloomHull, hullLoft({
    stations: [
      { z: -4.60, rx: 0.70, ry: 0.70, p: 3.0 },
      { z: -3.40, rx: 1.05, ry: 1.05, p: 3.2 },
      { z: 3.40, rx: 1.05, ry: 1.05, p: 3.2 },
      { z: 4.60, rx: 0.70, ry: 0.70, p: 3.0 },
    ], count: 18, steps: 14,
    longGrooves: [{ a: 0.25, depth: 0.06, width: 0.02, z0: -3.2, z1: 3.2 }],
  }));
  for (const z of [-3.70, 3.70]) {
    p.add(CM.bloomPlate, shellArc({ r: 1.28, t: 0.20, a0: 0, a1: Math.PI * 2, z0: z - 0.42, z1: z + 0.42, seg: 16 }));
  }
  for (const z of [-2.30, 2.30]) {
    p.both(CM.bloomPlate, chamferBox(0.40, 1.60, 1.00, 0.08), M.t(0.98, -1.10, z));
  }
  p.into(g);

  // The winding, and the amber collars that mark it as a target. Green says
  // what the machine is; amber says where to shoot it. Both go dark together
  // when the part dies, which is what `userData.lamps` is for.
  const lamps = [];
  for (const z of [-3.70, 3.70]) {
    const c = new THREE.Mesh(bandGeo(1.22, 0.70, 18), CM.weak);
    c.position.z = z;
    c.name = 'lamp';
    g.add(c);
    lamps.push(c);
  }
  for (let i = 0; i < 7; i++) {
    const w = new THREE.Mesh(bandGeo(1.13, 0.34, 18), CM.bloomCoil);
    w.position.z = -3.0 + i;
    w.name = 'lamp';
    g.add(w);
    lamps.push(w);
  }
  g.userData.lamps = lamps;
  return g;
}

/* ── bloom hull ────────────────────────────────────────────────────────────
   A gantry, not a ship: wide and flat, with two arms reaching forward into
   the canopy and a coil running down the spine between them. Read at 100 px
   it is a horizontal bar with two mouths on stalks. */
function buildBloom(root, rig) {
  const p = Parts();

  p.add(CM.bloomHull, hullLoft({
    stations: [
      { z: -8.60, rx: 3.10, ry: 1.05, p: 4.4, squash: 0.86 },
      { z: -5.20, rx: 4.40, ry: 1.55, p: 4.6, squash: 0.82, shoulder: 0.12 },
      { z: -0.80, rx: 4.90, ry: 1.85, p: 4.7, squash: 0.80, shoulder: 0.16 },
      { z: 3.60, rx: 4.60, ry: 1.75, p: 4.6, squash: 0.82, shoulder: 0.12 },
      { z: 7.40, rx: 3.60, ry: 1.35, p: 4.3, squash: 0.88, shoulder: 0.04 },
      { z: 9.80, rx: 2.60, ry: 1.00, p: 4.0, squash: 0.92 },
    ], count: 28, steps: 24,
    circGrooves: [
      { z: -6.40, depth: 0.12, width: 0.32 }, { z: -2.80, depth: 0.13, width: 0.34 },
      { z: 1.60, depth: 0.13, width: 0.34 }, { z: 5.60, depth: 0.11, width: 0.30 },
    ],
    longGrooves: [
      { a: 0.25, depth: 0.10, width: 0.024, z0: -7.6, z1: 8.8 },
      { a: 0.75, depth: 0.10, width: 0.024, z0: -7.6, z1: 8.8 },
    ],
    dents: [
      { z: -3.40, a: 0.00, rz: 2.6, ra: 0.05, depth: 0.30, rim: 0.55 },
      { z: -3.40, a: 0.50, rz: 2.6, ra: 0.05, depth: 0.30, rim: 0.55 },
    ],
  }));

  /* gantry arms reaching forward, and the hoppers the maws feed */
  p.both(CM.bloomPlate, chamferBox(1.40, 1.15, 6.00, 0.16), M.chain(M.t(4.20, -0.35, -5.60), M.ry(0.05)));
  p.both(SMat.metalDark, tubeAlong([V3(0, 0, 0), V3(0, 0, -5.20)], 0.20, 8), M.t(4.20, 0.70, -5.40));
  p.both(SMat.metalDark, tubeAlong([V3(0, 0, 0), V3(0, 0, -5.20)], 0.20, 8), M.t(4.20, -1.30, -5.40));
  p.both(CM.bloomPlate, chamferBox(2.60, 1.70, 3.20, 0.18), M.t(3.20, 1.30, -2.20));
  p.both(SMat.metalDark, louvers({ n: 6, w: 2.30, h: 0.13, d: 0.30, gap: 0.26, tilt: -0.5 }),
    M.chain(M.t(3.20, 2.20, -2.20), M.rx(-1.35)));

  /* cutter heads slung under the deck: a harvester works downward */
  for (const sx of [1, -1]) {
    p.add(CM.bloomPlate, chamferBox(1.20, 0.50, 2.60, 0.10), M.chain(M.t(sx * 2.20, -1.85, 2.20), M.rz(sx * 0.30)));
    p.add(SMat.metal, shellArc({ r: 1.10, t: 0.14, a0: Math.PI + 0.30, a1: Math.PI * 2 - 0.30, z0: -0.35, z1: 0.35, seg: 10 }),
      M.t(sx * 2.60, -2.70, 2.20));
  }

  /* dorsal deck, so the top is not one smooth slab */
  p.add(CM.bloomPlate, hullLoft({
    stations: [
      { z: -5.40, rx: 2.10, ry: 0.26, p: 4.4, yOff: 1.55 },
      { z: -2.00, rx: 2.90, ry: 0.42, p: 4.6, yOff: 1.80 },
      { z: 2.60, rx: 2.90, ry: 0.42, p: 4.6, yOff: 1.82 },
      { z: 6.20, rx: 2.10, ry: 0.26, p: 4.4, yOff: 1.60 },
    ], count: 22, steps: 12,
  }));
  p.both(SMat.metalDark, boltRow({ from: [2.40, 2.24, -4.20], to: [2.40, 2.24, 5.20], n: 10, r: 0.10, h: 0.06 }));

  /* running lights stay amber — see the material block */
  rig.accents.push({ mat: CM.bloomLamp, r: 1.0, g: 0.62, b: 0.16, base: 1.8, rage: 1.4, rate: 2.1, swing: 0.30 });
  rig.accents.push({ mat: CM.bloomCoil, r: 0.52, g: 1.0, b: 0.16, base: 2.4, rage: 2.2, rate: 3.4, swing: 0.85 });
  p.both(CM.bloomLamp, chamferBox(0.10, 0.13, 8.40, 0.03), M.t(4.62, 0.30, -0.40));
  p.both(CM.bloomLamp, chamferBox(0.30, 0.10, 0.16, 0.03), M.t(4.20, 0.98, -7.20));
  p.add(CM.bloomLamp, chamferBox(1.30, 0.10, 0.16, 0.03), M.t(0, 2.10, -5.60));

  /* aft: four lift nacelles on the trailing edge */
  p.add(SMat.heat, hullLoft({
    stations: [
      { z: 9.60, rx: 2.62, ry: 1.02, p: 4.0, squash: 0.92 },
      { z: 10.60, rx: 2.30, ry: 0.90, p: 3.8, squash: 0.94 },
    ], count: 24, steps: 3, capStart: false,
  }));
  for (const sx of [1, -1]) for (const x of [0.95, 2.10]) {
    p.add(SMat.ceramic, ductGeo({ rx: 0.50, ry: 0.50, depth: 0.75, throat: 0.72, lip: 0.09, sides: 14, p: 2.8 }),
      M.chain(M.t(sx * x, 0.05, 10.70), M.ry(Math.PI)));
  }
  p.into(root);

  /* weak points */
  // These sit 12 m ahead of the rig centre, which is further out than any weak
  // point on any other variant, and that distance is paid for in `radius`.
  // `radius` is a capture radius, not a size: rounds converge on the lock point
  // with the aim scatter of a 340 m shot, and whatever falls outside it lands
  // on the 9.75 m armour sphere at the centre instead. Measured with
  // tools/bossprobe.mjs against `highlands`, fight length and armour damage by
  // authored radius: 2.60 -> 89.8 s / 440; 3.25 -> 87.3 s / 440;
  // 3.90 -> 56.0 s / 236; 4.40 -> 31.0 s / 60; 5.00 -> 20.5 s / 0. The other
  // four variants land between 20.5 s and 23.3 s with armour untouched.
  const mR = bloomMaw('intakeR', 1); mR.position.set(4.20, -0.55, -8.20);
  const mL = bloomMaw('intakeL', -1); mL.position.set(-4.20, -0.55, -8.20);
  const coil = bloomCoil('coil'); coil.position.set(0, 2.95, 0.60);
  for (const w of [mR, mL, coil]) { root.add(w); rig.weak.push(w); }

  /* four mounts on the deck corners */
  for (const [z, x] of [[-3.60, 4.05], [4.20, 3.60]]) {
    for (const sx of [1, -1]) {
      const t = cmdTurret('turret' + rig.turrets.length, CM.bloomHull, CM.bloomPlate);
      t.position.set(sx * x, 1.05, z);
      t.rotation.z = sx > 0 ? -0.14 : 0.14;
      root.add(t);
      rig.turrets.push(t);
    }
  }

  for (const sx of [1, -1]) for (const x of [0.95, 2.10]) {
    const e = engineNode(sx * x, 0.05, 10.80, 0.46, { len: 4.4 });
    e.name = 'engine';
    root.add(e);
    rig.engines.push(e);
  }

  return [
    { id: 'intakeR', label: 'INTAKE MAW', local: V3(4.20, -0.55, -8.20), radius: 5.00 },
    { id: 'intakeL', label: 'INTAKE MAW', local: V3(-4.20, -0.55, -8.20), radius: 5.00 },
    { id: 'coil', label: 'SPINE COIL', local: V3(0, 2.95, 0.60), radius: 2.45 },
  ];
}

/* ── forge: heat sink ──────────────────────────────────────────────────────
   A radiator stack canted outboard, with vane slots that go from dull to
   white over the 1.9 s the spinal gun takes to charge. */
function forgeSink(name, sx) {
  const g = new THREE.Group();
  g.name = name;
  const p = Parts();
  p.add(CM.forgeHull, hullLoft({
    stations: [
      { z: -2.60, rx: 0.85, ry: 1.55, p: 4.0 },
      { z: -1.60, rx: 1.15, ry: 2.15, p: 4.4 },
      { z: 1.50, rx: 1.15, ry: 2.15, p: 4.4 },
      { z: 2.50, rx: 0.85, ry: 1.55, p: 4.0 },
    ], count: 18, steps: 12,
    circGrooves: [{ z: -0.05, depth: 0.09, width: 0.22 }],
  }));
  // the fin stack itself, laid on its side so the slats run fore and aft
  p.add(SMat.metalDark, louvers({ n: 7, w: 3.90, h: 0.17, d: 1.55, gap: 0.52, tilt: 0 }),
    M.chain(M.t(sx * 0.30, 0, 0), M.rz(Math.PI / 2), M.rx(Math.PI / 2)));
  p.add(CM.forgePlate, shellArc({ r: 2.25, t: 0.18, a0: -1.10, a1: 1.10, z0: -2.30, z1: 2.20, seg: 10 }),
    M.rz(sx > 0 ? -Math.PI / 2 : Math.PI / 2));
  p.both(SMat.metalDark, chamferBox(0.24, 0.50, 1.90, 0.05), M.t(0.95, -2.05, 0));
  p.add(CM.forgeSlag, extrudePoly([
    new THREE.Vector2(-0.95, -0.60), new THREE.Vector2(0.85, -0.80),
    new THREE.Vector2(0.70, 0.65), new THREE.Vector2(-0.85, 0.85),
  ], 0.18, 0.05), M.chain(M.t(0, 2.20, -0.70), M.rx(-Math.PI / 2)));
  p.into(g);

  // vanes carry the charge tell, collars carry the target mark
  const vane = new THREE.Mesh(chamferBox(2.30, 3.30, 0.14, 0.03), CM.forgeVane);
  vane.position.set(sx * 0.05, 0, -1.72);
  vane.name = 'vane';
  const vaneAft = new THREE.Mesh(chamferBox(2.30, 3.30, 0.14, 0.03), CM.forgeVane);
  vaneAft.position.set(sx * 0.05, 0, 1.66);
  vaneAft.name = 'vane';
  g.add(vane, vaneAft);

  const band = new THREE.Mesh(chamferBox(2.50, 0.80, 4.30, 0.08), CM.weak);
  band.position.set(0, 1.55, 0);
  band.name = 'lamp';
  const low = new THREE.Mesh(chamferBox(2.50, 0.60, 4.30, 0.08), CM.weak);
  low.position.set(0, -1.65, 0);
  low.name = 'lamp';
  g.add(band, low);
  // The vanes go dark with the collars: a dead sink still glowing on the
  // charge would say a beam is coming from a part that is no longer there.
  g.userData.lamps = [band, low, vane, vaneAft];
  return g;
}

/* ── forge: crucible ─────────────────────────────────────────────────────── */
function forgeCrucible(name) {
  const g = new THREE.Group();
  g.name = name;
  const p = Parts();
  p.add(CM.forgeHull, hullLoft({
    stations: [
      { z: -2.40, rx: 1.75, ry: 1.75, p: 3.6 },
      { z: -1.30, rx: 2.15, ry: 2.15, p: 3.8 },
      { z: 1.30, rx: 2.15, ry: 2.15, p: 3.8 },
      { z: 2.40, rx: 1.75, ry: 1.75, p: 3.6 },
    ], count: 22, steps: 14,
    circGrooves: [{ z: 0.0, depth: 0.11, width: 0.28 }],
    longGrooves: [{ a: 0.25, depth: 0.08, width: 0.022, z0: -2.1, z1: 2.1 },
    { a: 0.75, depth: 0.08, width: 0.022, z0: -2.1, z1: 2.1 }],
  }));
  // the cauldron: an open bowl in the top, and pour spouts either side
  p.add(CM.forgePlate, shellArc({ r: 2.24, t: 0.22, a0: 0.20, a1: Math.PI - 0.20, z0: -1.90, z1: 1.90, seg: 14 }));
  p.both(SMat.metal, tubeAlong([V3(0, 0, 0), V3(1.30, -0.55, 0)], 0.22, 8), M.t(1.95, 0.95, 0));
  p.both(CM.forgeSlag, extrudePoly([
    new THREE.Vector2(-0.70, -0.55), new THREE.Vector2(0.75, -0.70),
    new THREE.Vector2(0.60, 0.60), new THREE.Vector2(-0.60, 0.75),
  ], 0.18, 0.05), M.chain(M.t(1.55, 1.55, 0.90), M.rz(-0.7), M.rx(-Math.PI / 2)));
  p.add(SMat.metalDark, boltRow({ from: [-1.5, 2.05, -1.5], to: [1.5, 2.05, -1.5], n: 7, r: 0.10, h: 0.06 }));
  p.into(g);

  const melt = new THREE.Mesh(new THREE.CircleGeometry(1.70, 20), CM.forgeCore);
  melt.rotation.x = -Math.PI / 2;
  melt.position.y = 1.62;
  melt.name = 'vane';
  g.add(melt);

  const collar = new THREE.Mesh(bandGeo(2.22, 1.05, 22), CM.weak);
  collar.name = 'lamp';
  const throat = new THREE.Mesh(new THREE.CircleGeometry(1.30, 18), CM.weak);
  throat.position.z = -2.46;
  throat.rotation.y = Math.PI;
  throat.name = 'lamp';
  g.add(collar, throat);
  g.userData.lamps = [collar, throat, melt];
  return g;
}

/* ── forge hull ────────────────────────────────────────────────────────────
   The finale, and the only rig in the game that carries a spinal beam AND a
   full four-mount broadside. A slab prow with a barrel through it, a cauldron
   amidships and two radiators aft: the whole outline is horizontal mass in
   front and vertical mass behind. */
function buildForge(root, rig) {
  const p = Parts();

  p.add(CM.forgeHull, hullLoft({
    stations: [
      { z: -10.40, rx: 3.30, ry: 2.10, p: 5.0, squash: 0.90 },
      { z: -7.20, rx: 4.05, ry: 2.55, p: 5.0, squash: 0.86, shoulder: 0.10 },
      { z: -2.40, rx: 4.35, ry: 2.80, p: 4.8, squash: 0.82, shoulder: 0.16 },
      { z: 2.60, rx: 4.10, ry: 2.70, p: 4.7, squash: 0.84, shoulder: 0.14 },
      { z: 7.00, rx: 3.40, ry: 2.25, p: 4.4, squash: 0.88, shoulder: 0.06 },
      { z: 10.20, rx: 2.70, ry: 1.80, p: 4.1, squash: 0.92 },
    ], count: 28, steps: 26,
    circGrooves: [
      { z: -8.40, depth: 0.14, width: 0.36 }, { z: -4.60, depth: 0.14, width: 0.36 },
      { z: 0.60, depth: 0.14, width: 0.36 }, { z: 5.20, depth: 0.12, width: 0.32 },
    ],
    longGrooves: [
      { a: 0.25, depth: 0.11, width: 0.024, z0: -9.4, z1: 9.4 },
      { a: 0.12, depth: 0.09, width: 0.018, z0: -8.6, z1: 8.8 },
      { a: 0.38, depth: 0.09, width: 0.018, z0: -8.6, z1: 8.8 },
    ],
    dents: [
      { z: 3.40, a: 0.00, rz: 2.3, ra: 0.05, depth: 0.36, rim: 0.55 },
      { z: 3.40, a: 0.50, rz: 2.3, ra: 0.05, depth: 0.36, rim: 0.55 },
    ],
  }));

  /* slab prow: one plate, no fairing, with slag crust over the top edge */
  p.add(CM.forgePlate, extrudePoly([
    new THREE.Vector2(-5.10, -2.05), new THREE.Vector2(-3.10, -3.40),
    new THREE.Vector2(3.10, -3.40), new THREE.Vector2(5.10, -2.05),
    new THREE.Vector2(4.30, 2.90), new THREE.Vector2(-4.30, 2.90),
  ], 1.70, 0.24), M.chain(M.t(0, 0.20, -10.30), M.rx(0.12)));
  p.both(CM.forgePlate, extrudePoly([
    new THREE.Vector2(0, -2.40), new THREE.Vector2(2.10, -1.30),
    new THREE.Vector2(2.10, 1.20), new THREE.Vector2(0, 2.70),
  ], 1.00, 0.18), M.chain(M.t(5.00, 0.10, -9.70), M.rz(-0.26)));
  p.both(SMat.hostileTrim, chamferBox(0.36, 2.00, 0.32, 0.06), M.chain(M.t(4.70, 0.20, -10.90), M.rz(-0.26)));
  p.add(CM.forgeSlag, extrudePoly([
    new THREE.Vector2(-3.40, -0.90), new THREE.Vector2(3.20, -1.15),
    new THREE.Vector2(2.80, 1.00), new THREE.Vector2(-3.05, 1.25),
  ], 0.26, 0.06), M.chain(M.t(0, 3.10, -9.80), M.rx(-Math.PI / 2 + 0.12)));
  p.both(CM.forgeSlag, extrudePoly([
    new THREE.Vector2(-1.40, -0.85), new THREE.Vector2(1.50, -1.10),
    new THREE.Vector2(1.20, 0.95), new THREE.Vector2(-1.25, 1.20),
  ], 0.24, 0.06), M.chain(M.t(2.40, 2.72, -2.60), M.rx(-Math.PI / 2), M.rz(0.42)));
  p.add(SMat.metalDark, boltRow({ from: [-3.4, 3.05, -10.6], to: [3.4, 3.05, -10.6], n: 10, r: 0.11, h: 0.07 }));

  /* spinal barrel — heavier than the ice commander's, and 2 m longer */
  p.add(SMat.metal, tubeAlong([V3(0, 0.20, -8.00), V3(0, 0.20, -17.20)], (t) => 1.02 - t * 0.26, 16));
  for (const z of [-11.10, -13.20, -15.20]) {
    p.add(SMat.metalDark, shellArc({ r: 1.18, t: 0.34, a0: 0, a1: Math.PI * 2, z0: z - 0.34, z1: z + 0.34, seg: 16 }),
      M.t(0, 0.20, 0));
  }
  p.add(CM.forgePlate, shellArc({ r: 1.06, t: 0.28, a0: 0, a1: Math.PI * 2, z0: -17.70, z1: -16.60, seg: 16 }),
    M.t(0, 0.20, 0));
  p.both(SMat.metalDark, chamferBox(0.30, 0.90, 3.20, 0.06), M.t(1.20, 0.20, -12.40));

  /* dorsal armour deck */
  p.add(CM.forgePlate, hullLoft({
    stations: [
      { z: -6.20, rx: 2.05, ry: 0.28, p: 4.6, yOff: 2.35 },
      { z: -2.60, rx: 2.85, ry: 0.44, p: 4.8, yOff: 2.70 },
      { z: 2.20, rx: 2.85, ry: 0.44, p: 4.8, yOff: 2.66 },
      { z: 5.60, rx: 2.05, ry: 0.28, p: 4.6, yOff: 2.30 },
    ], count: 22, steps: 12,
  }));
  p.both(SMat.metalDark, louvers({ n: 5, w: 1.70, h: 0.12, d: 0.28, gap: 0.24, tilt: -0.55 }),
    M.chain(M.t(3.20, 0.90, -5.40), M.ry(1.22)));

  /* aft: thruster skirt */
  p.add(SMat.heat, hullLoft({
    stations: [
      { z: 10.10, rx: 2.72, ry: 1.82, p: 4.1, squash: 0.92 },
      { z: 11.10, rx: 2.40, ry: 1.60, p: 3.9, squash: 0.94 },
    ], count: 24, steps: 3, capStart: false,
  }));
  p.both(SMat.ceramic, ductGeo({ rx: 0.88, ry: 0.88, depth: 1.10, throat: 0.72, lip: 0.12, sides: 16, p: 2.8 }),
    M.chain(M.t(1.55, 0.05, 11.20), M.ry(Math.PI)));
  p.both(SMat.metalDark, chamferBox(0.62, 0.62, 1.70, 0.10), M.t(3.10, -1.05, 9.00));
  p.into(root);

  /* weak points */
  const sR = forgeSink('sinkR', 1); sR.position.set(4.70, 2.30, 4.20);
  const sL = forgeSink('sinkL', -1); sL.position.set(-4.70, 2.30, 4.20);
  const cru = forgeCrucible('crucible'); cru.position.set(0, 2.60, -0.40);
  for (const w of [sR, sL, cru]) { root.add(w); rig.weak.push(w); }
  rig.recoil.push({ node: sR, index: 0, z: 4.20, k: 0.85 }, { node: sL, index: 1, z: 4.20, k: 0.85 });
  rig.charge = { mat: CM.forgeVane, r: 1.0, g: 0.30, b: 0.08, base: 1.5, gain: 9.0 };
  rig.accents.push({ mat: CM.forgeCore, r: 1.0, g: 0.68, b: 0.24, base: 2.6, rage: 2.0, rate: 2.4, swing: 0.55 });

  /* four mounts: the ice commander fights with two and a beam, this one with
     four and a heavier beam */
  for (const [z, x] of [[-5.60, 4.10], [1.40, 4.20]]) {
    for (const sx of [1, -1]) {
      const t = cmdTurret('turret' + rig.turrets.length, CM.forgeHull, CM.forgePlate);
      t.position.set(sx * x, 0.85, z);
      t.rotation.z = sx > 0 ? -0.20 : 0.20;
      root.add(t);
      rig.turrets.push(t);
    }
  }

  for (const sx of [1, -1]) {
    const e = engineNode(sx * 1.55, 0.05, 11.30, 0.84, { len: 6.0 });
    e.name = 'engine';
    root.add(e);
    rig.engines.push(e);
  }

  /* spinal gun */
  const cannon = new THREE.Group();
  cannon.name = 'cannon';
  cannon.position.set(0, 0.20, 0);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.86, 14, 10), CM.charge);
  muzzle.position.z = -17.70;
  muzzle.scale.setScalar(0.001);
  cannon.add(muzzle);
  const beam = new THREE.Mesh(plumeGeo({ r0: 1.10, r1: 0.40, len: 1.0, sides: 14, bulge: 1.0 }), EMat.plume);
  beam.position.z = -17.70;
  beam.rotation.x = Math.PI;
  beam.renderOrder = 7;
  beam.visible = false;
  cannon.add(beam);
  root.add(cannon);
  rig.cannon = cannon;
  rig.muzzle = muzzle;
  rig.beam = beam;

  return [
    { id: 'sinkR', label: 'HEAT SINK', local: V3(4.70, 2.30, 4.20), radius: 2.55 },
    { id: 'sinkL', label: 'HEAT SINK', local: V3(-4.70, 2.30, 4.20), radius: 2.55 },
    { id: 'crucible', label: 'CRUCIBLE', local: V3(0, 3.10, -0.40), radius: 2.45 },
  ];
}

const CMD_BUILD = { ice: buildIce, void: buildVoid, tide: buildTide, bloom: buildBloom, forge: buildForge };

const cmdSpecs = new Map();

/**
 * Per-variant statics, as factories: `commanderSpec` scales `radius` and every
 * gun mount by NPC_SCALE in place, so each variant needs its own fresh vectors.
 */
const CMD_SPEC = {
  ice: () => ({
    kind: 'commander:ice', variant: 'ice', commander: true,
    radius: COMMANDER.radius, hp: COMMANDER.weakHp * 3, score: COMMANDER.score,
    guns: [V3(0, 0.35, -15.8)],
    maxSpeed: 140, turnRate: 0.30, accel: 36,
    fireRange: 1000, burst: 3, burstGap: 0.20, reload: 2.1, dmg: 12,
    boomScale: 6.0,
  }),
  void: () => ({
    kind: 'commander:void', variant: 'void', commander: true,
    radius: COMMANDER.radius, hp: COMMANDER.weakHp * 3, score: COMMANDER.score,
    guns: [V3(1.55, -0.10, -13.6), V3(-1.55, -0.10, -13.6)],
    maxSpeed: 160, turnRate: 0.34, accel: 42,
    fireRange: 1000, burst: 4, burstGap: 0.18, reload: 1.9, dmg: 11,
    boomScale: 6.0,
  }),
  tide: () => ({
    kind: 'commander:tide', variant: 'tide', commander: true,
    radius: COMMANDER.radius, hp: COMMANDER.weakHp * 3, score: COMMANDER.score,
    guns: [V3(1.90, -0.60, -11.6), V3(-1.90, -0.60, -11.6)],
    maxSpeed: 150, turnRate: 0.32, accel: 40,
    fireRange: 1000, burst: 4, burstGap: 0.18, reload: 1.9, dmg: 11,
    boomScale: 6.0,
  }),
  bloom: () => ({
    kind: 'commander:bloom', variant: 'bloom', commander: true,
    radius: COMMANDER.radius, hp: COMMANDER.weakHp * 3, score: COMMANDER.score,
    guns: [V3(4.20, -0.55, -11.0), V3(-4.20, -0.55, -11.0)],
    maxSpeed: 145, turnRate: 0.30, accel: 38,
    fireRange: 1000, burst: 3, burstGap: 0.20, reload: 2.0, dmg: 12,
    boomScale: 6.0,
  }),
  forge: () => ({
    kind: 'commander:forge', variant: 'forge', commander: true,
    radius: COMMANDER.radius, hp: COMMANDER.weakHp * 3, score: COMMANDER.score,
    guns: [V3(0, 0.20, -17.8)],
    maxSpeed: 135, turnRate: 0.28, accel: 34,
    fireRange: 1100, burst: 4, burstGap: 0.16, reload: 1.8, dmg: 13,
    boomScale: 6.5,
  }),
};

/**
 * Static spec for a commander variant, without building its geometry.
 * `guns` are fixed forward mounts; the broadside/flank turrets report their
 * live muzzles through `api.aimTurret` instead, because they traverse.
 */
export function commanderSpec(variant = 'ice') {
  const v = CMD_BUILD[variant] ? variant : 'ice';
  let sp = cmdSpecs.get(v);
  if (sp) return sp;
  sp = CMD_SPEC[v]();
  sp.radius *= NPC_SCALE;
  for (const g of sp.guns) g.multiplyScalar(NPC_SCALE);
  cmdSpecs.set(v, sp);
  return sp;
}

function shortAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * A commander. Built fresh per spawn rather than cloned from a prototype: it
 * carries destructible state and per-part hit shells, and there is never more
 * than one on the field.
 *
 * @param {'ice'|'void'|'tide'|'bloom'|'forge'} variant
 * @returns {THREE.Group} root, with `userData.api` and `userData.spec`
 */
export function createCommander(variant = 'ice') {
  commanderMaterials();
  const v = CMD_BUILD[variant] ? variant : 'ice';
  const root = new THREE.Group();
  root.name = 'commander:' + v;
  root.scale.setScalar(NPC_SCALE);

  // `eyes`/`beacons` are empty and present so the shared animateEnemy /
  // disposeEnemy path is a no-op on this hull rather than a throw.
  const rig = {
    variant: v, weak: [], turrets: [], engines: [], eyes: [], beacons: [],
    cannon: null, beam: null, muzzle: null,
    // `accents` are hull running lights, one drive each; `recoil` names the
    // parts a spinal shot shoves and by how far; `charge` is the emissive that
    // carries the wind-up. A variant declares what it has and no other variant
    // pays for it.
    accents: [], recoil: [], charge: null,
  };
  const layout = CMD_BUILD[v](root, rig);

  const st = {
    t: 0, phase: 1, power: 1, alert: 0.35, list: 0,
    expose: 0, rage: 0, charge: 0, recoil: 0, beamT: -1, beamLen: 700,
    shutter: 1,        // nothing on this hull is locked behind armour
  };
  const _col = new THREE.Color();

  const api = {
    st, rig,
    variant: v,
    triangles: triCount(root),
    parts: [],
    get hasBeam() { return !!rig.beam; },
    get turretCount() { return rig.turrets.length; },
    /** Weak points still alive. 0 means dead. */
    get weakAlive() { return api.parts.reduce((n, q) => n + (q.kind === 'weak' && q.alive ? 1 : 0), 0); },
    /** 0..1 across the weak points only — what the boss bar should show. */
    get progress() {
      let hp = 0;
      for (const q of api.parts) if (q.kind === 'weak') hp += Math.max(0, q.hp);
      return hp / (COMMANDER.weakHp * 3);
    },

    setPhase(n) { st.phase = n; },
    setAlert(v2) { st.alert = THREE.MathUtils.clamp(v2, 0, 1); },
    setCharge(v2) { st.charge = THREE.MathUtils.clamp(v2, 0, 1); },

    /** Fire the spinal gun. No-op on the flagship, which has no spinal gun. */
    fireBeam(len = 700) {
      if (!rig.beam) return false;
      st.beamT = 0; st.beamLen = len; st.charge = 0; st.recoil = 1;
      return true;
    },
    get beamActive() { return st.beamT >= 0 && st.beamT < 0.55; },

    /**
     * Kill a weak point. Returns how many are still alive, so the caller has
     * both the phase trigger (2 left) and the death test (0 left) in one call.
     */
    killPart(part) {
      if (part && part.kind === 'weak' && part.alive) {
        part.alive = false;
        const w = rig.weak[part.index];
        if (w) {
          for (const l of w.userData.lamps || []) l.material = CM.weakDead;
          if (w.userData.cover) w.userData.cover.visible = false;
          w.rotation.z = (part.index % 2 ? 1 : -1) * 0.22;
        }
        if (part.shell) part.shell.visible = false;
      }
      return api.weakAlive;
    },
    killWeak(i) { return api.killPart(api.parts.find(q => q.kind === 'weak' && q.index === i)); },

    /** Aim a mount at a world point. Returns its muzzle in world space. */
    aimTurret(i, worldTarget, dt, out) {
      const t = rig.turrets[i];
      if (!t) return null;
      const local = t.worldToLocal(out.copy(worldTarget));
      const yaw = Math.atan2(local.x, -local.z);
      const pitch = Math.atan2(local.y - 0.80, Math.hypot(local.x, local.z));
      const rate = (1.7 + st.rage * 1.1) * dt;
      t.rotation.y += THREE.MathUtils.clamp(shortAngle(yaw - t.rotation.y), -rate, rate);
      const b = t.userData.barrels;
      b.rotation.x = THREE.MathUtils.clamp(
        b.rotation.x + THREE.MathUtils.clamp(-pitch - b.rotation.x, -rate, rate), -0.70, 0.45);
      out.copy(t.userData.muzzle);
      b.localToWorld(out);
      return out;
    },

    update(dt, { power = 1, list = 0 } = {}) {
      st.t += dt;
      st.power = power;
      st.list += (list - st.list) * Math.min(1, dt * 1.4);
      const t = st.t;
      const angry = st.phase >= 2 ? 1 : 0;
      st.rage += (angry - st.rage) * Math.min(1, dt * 1.1);
      st.expose += ((angry ? 1 : 0.28) - st.expose) * Math.min(1, dt * 0.9);

      for (const e of rig.engines) {
        const k = power * (1 + Math.sin(t * 19 + e.id) * 0.05);
        if (e.userData.plume) e.userData.plume.scale.set(0.75 + k * 0.45, 0.75 + k * 0.45, 0.4 + k * 0.9);
        if (e.userData.face) e.userData.face.material.color
          .copy(_col.setRGB(1.0, 0.70, 0.40)).multiplyScalar(2.2 + k * 5.0);
      }

      for (const q of rig.turrets) {
        const eye = q.userData.barrels.children.find(o => o.name === 'eye');
        if (eye) eye.scale.setScalar(0.85 + (0.7 + 0.3 * Math.sin(t * (6 + st.rage * 7) + q.id)) * 0.25);
      }

      // The lamps ARE the fight: they hold a floor so a weak point is never
      // unreadable, and they gain rather than change hue when the ship rages.
      const gain = (2.6 + st.alert * 1.4 + st.rage * 2.6) * (0.62 + 0.38 * st.expose);
      CM.weak.color.copy(_col.setRGB(1.0, 0.70, 0.24))
        .multiplyScalar(gain * (0.82 + 0.18 * Math.sin(t * (3.2 + st.rage * 4.5))));

      for (let i = 0; i < rig.weak.length; i++) {
        const w = rig.weak[i];
        const alive = api.parts[i] ? api.parts[i].alive : true;
        if (w.userData.cover) w.userData.cover.rotation.z = Math.sign(w.position.x) * st.expose * 1.35;
        if (v === 'ice' && alive) w.position.y = (i < 2 ? 2.75 : 2.95) + Math.sin(t * 2.1 + i) * 0.02;
      }

      for (const A of rig.accents) {
        A.mat.color.copy(_col.setRGB(A.r, A.g, A.b))
          .multiplyScalar(A.base + st.rage * A.rage + Math.sin(t * A.rate) * A.swing);
      }

      if (rig.beam) {
        const c = st.charge;
        // The barrel is merged into the hull mesh, so the recoil is carried by
        // the dampers below. Moving the cannon group would detach the beam.
        st.recoil = Math.max(0, st.recoil - dt * 3.2);
        rig.muzzle.scale.setScalar(Math.max(0.001, c * c * 1.25 + (st.beamT >= 0 && st.beamT < 0.14 ? 1.5 : 0)));
        CM.charge.color.copy(_col.setRGB(1.0, 0.86, 0.55)).multiplyScalar(3 + c * 9);
        // A 1.9 s wind-up has to be legible from somewhere other than a muzzle
        // that is 17 m in front of the hull and pointed away from you.
        if (rig.charge) {
          rig.charge.mat.color.copy(_col.setRGB(rig.charge.r, rig.charge.g, rig.charge.b))
            .multiplyScalar(rig.charge.base + c * rig.charge.gain);
        }
        for (const rp of rig.recoil) {
          if (api.parts[rp.index] && api.parts[rp.index].alive) rp.node.position.z = rp.z + st.recoil * rp.k;
        }
        if (st.beamT >= 0) {
          st.beamT += dt;
          const u = st.beamT / 0.55;
          if (u >= 1) { st.beamT = -1; rig.beam.visible = false; }
          else {
            const fade = u > 0.55 ? 1 - (u - 0.55) / 0.45 : 1;
            rig.beam.visible = true;
            rig.beam.scale.set(fade * (1 + Math.sin(t * 60) * 0.06), fade, st.beamLen * Math.min(1, u * 7));
          }
        }
      }

      if (api._hitTick) api._hitTick(dt);
      root.rotation.z = st.list;
    },

    dispose() {
      root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      for (const q of api.parts) q.shell?.material.dispose();
      for (const e of hullBlooms) e.m.material.dispose();
    },
  };

  /* ── weak-point table — the same shape game/combat.js reads off boss.js ──
     `hull` is a hit-feedback target only: it takes stray rounds so armour
     hits spark, and it never gates the kill. All three weak points down is
     what ends the fight. */
  api.parts = layout.map((q, i) => ({
    id: q.id, label: q.label, kind: 'weak', index: i,
    node: rig.weak[i], local: q.local, radius: q.radius,
    hp: COMMANDER.weakHp, max: COMMANDER.weakHp, alive: true, locked: false,
  }));
  api.parts.push({
    id: 'hull', label: 'ARMOUR', kind: 'hull', index: 0,
    node: root, local: V3(0, 0, 0), radius: 6.5,
    hp: COMMANDER.hullHp, max: COMMANDER.hullHp, alive: true, locked: false,
  });
  // `local` rides the node matrices, which already carry the root scale; only
  // these world-space radii need scaling by hand.
  for (const q of api.parts) q.radius *= NPC_SCALE;

  /* ── hit register ──────────────────────────────────────────────────────
     An impact particle subtends ~4 px against this hull at 500 m, so each
     part carries an additive shell scaled to itself, and armour hits use a
     pooled bloom placed in the ship's own frame so it stays on the plate. */
  const SHELL_LIFE = 0.13;
  const shellGeo = new THREE.IcosahedronGeometry(1, 2);
  const mkShellMat = (col) => new THREE.MeshBasicMaterial({
    color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false,
  });
  const HIT_WEAK = new THREE.Color(1.00, 0.72, 0.30);
  const HIT_HULL = new THREE.Color(0.52, 0.76, 1.00);

  for (const q of api.parts) {
    q.flash = 0;
    if (q.kind === 'hull') continue;
    const m = new THREE.Mesh(shellGeo, mkShellMat(HIT_WEAK));
    m.position.copy(q.local);
    m.scale.setScalar(q.radius * 1.4);
    m.visible = false;
    m.frustumCulled = false;
    m.renderOrder = 6;
    root.add(m);
    q.shell = m;
  }

  const hullBlooms = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(shellGeo, mkShellMat(HIT_HULL));
    m.visible = false;
    m.frustumCulled = false;
    m.renderOrder = 6;
    root.add(m);
    hullBlooms.push({ m, t: 1e9 });
  }
  let bloomNext = 0;
  const _hp = new THREE.Vector3();

  /**
   * World position of a weak point. `local` is in the SHIP's frame, not the
   * part node's, so it composes with the root matrix — the parts never
   * translate relative to the hull.
   */
  api.partPoint = (part, out) => out.copy(part.local).applyMatrix4(root.matrixWorld);

  /** Register a hit on `part`. `worldPoint` is where the round landed. */
  api.hitPart = (part, worldPoint) => {
    if (!part) return;
    part.flash = 1;
    if (part.kind === 'hull' && worldPoint) {
      const e = hullBlooms[bloomNext];
      bloomNext = (bloomNext + 1) % hullBlooms.length;
      root.updateWorldMatrix(true, false);
      e.m.position.copy(root.worldToLocal(_hp.copy(worldPoint)));
      e.m.scale.setScalar(2.4);
      e.t = 0;
    }
  };

  api._hitTick = (dt) => {
    for (const q of api.parts) {
      if (!q.shell) continue;
      if (q.flash > 0) {
        q.flash = Math.max(0, q.flash - dt / SHELL_LIFE);
        q.shell.material.opacity = q.flash * q.flash * 0.55;
        q.shell.scale.setScalar(q.radius * (1.4 + (1 - q.flash) * 0.7));
        q.shell.visible = q.flash > 0.01 && q.alive;
      } else if (q.shell.visible) {
        q.shell.visible = false;
      }
    }
    for (const e of hullBlooms) {
      if (e.t > SHELL_LIFE) { if (e.m.visible) e.m.visible = false; continue; }
      e.t += dt;
      const k = Math.max(0, 1 - e.t / SHELL_LIFE);
      e.m.material.opacity = k * k * 0.5;
      e.m.scale.setScalar(2.4 + (1 - k) * 2.0);
      e.m.visible = true;
    }
  };

  root.userData.spec = commanderSpec(v);
  root.userData.rig = rig;
  root.userData.api = api;
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
  lancer: lancerProto,
  scarab: scarabProto,
  pylon: pylonProto,
};

const protos = new Map();

export function enemyProto(kind) {
  let g = protos.get(kind);
  if (!g) {
    buildEnemyMaterials();
    const b = BUILDERS[kind];
    if (!b) throw new Error('unknown enemy kind: ' + kind);
    g = b();
    // Collision radius and gun mounts scale with the model, once per kind. The
    // mounts are transformed by the agent rather than by the mesh, so they do not
    // inherit the root scale and would otherwise fire from inside the hull.
    const sp = g.userData.spec;
    sp.radius *= NPC_SCALE;
    if (sp.guns) for (const m of sp.guns) m.multiplyScalar(NPC_SCALE);
    g.userData.spec.tris = triCount(g);
    // after triCount, so `spec.tris` stays a count of hull, not of lamps
    const B = BEACON[kind];
    if (B) for (const at of B.at) g.add(beaconNode(B, at));
    protos.set(kind, g);
  }
  return g;
}

/** True for `commander`, `commander:ice`, `commander:void`. */
export function isCommander(kind) { return typeof kind === 'string' && kind.startsWith('commander'); }
const cmdVariant = (kind) => kind.split(':')[1] || 'ice';

export function enemySpec(kind) {
  if (isCommander(kind)) return commanderSpec(cmdVariant(kind));
  return enemyProto(kind).userData.spec;
}

/**
 * A fresh instance. Geometry and hull materials are shared with the prototype;
 * only the emissives that have to animate per-ship (the eye, the nozzle face)
 * are cloned, which is a handful of tiny MeshBasicMaterials per hull.
 */
/**
 * Visual and collision scale applied to every hostile and to the carrier.
 *
 * Scaled together on purpose: growing the model alone would shrink the hit area
 * *relative to the visible hull*, so rounds that plainly look like hits would
 * miss. `spec.radius` is the collision radius, and it is multiplied by the same
 * number where the specs are built — so this is genuinely a bigger ship, not a
 * bigger picture of the same ship. It is also the legibility experiment the
 * roadmap had parked: bigger hostiles read further out.
 */
export const NPC_SCALE = 1.5;

export function createEnemy(kind) {
  // A commander is a rig with destructible state, so it is built rather than
  // cloned. It answers to the same call and returns the same kind of root.
  if (isCommander(kind)) return createCommander(cmdVariant(kind));
  const proto = enemyProto(kind);
  const root = proto.clone(true);
  root.userData.spec = proto.userData.spec;
  root.scale.setScalar(NPC_SCALE);

  const rig = { engines: [], eyes: [], beacons: [], turret: null, barrels: null, doors: [] };
  root.traverse((o) => {
    if (o.name === 'engine') rig.engines.push(o);
    else if (o.name === 'turret') rig.turret = o;
    else if (o.name === 'barrels') rig.barrels = o;
    else if (o.name === 'doorL' || o.name === 'doorR') rig.doors.push(o);
    if (o.isMesh && o.name === 'eye') { o.material = o.material.clone(); rig.eyes.push(o); }
    else if (o.isSprite && o.name === 'beacon') { o.material = o.material.clone(); rig.beacons.push(o); }
  });

  // The angular floor and the distance cutoff both need the camera, and
  // `animateEnemy` is not given one — changing its signature would reach into
  // combat.js, which is another lane. `onBeforeRender` already receives exactly
  // what is needed, costs nothing when the sprite is culled, and runs late
  // enough to be the last writer before the draw. `animateEnemy` publishes the
  // lamp state to `userData.k`; this multiplies the range fade onto it.
  const B = BEACON[kind];
  for (let i = 0; i < rig.beacons.length; i++) {
    const s = rig.beacons[i];
    s.userData.phase = ((root.id + i * 37) % 100) / 100;
    s.userData.k = 1;
    s.onBeforeRender = (renderer, _scene, camera) => {
      const d = camera.position.distanceTo(s.getWorldPosition(_bv));
      const fade = 1 - clamp01((d - BEACON_FAR) / (BEACON_CUT - BEACON_FAR));
      s.material.opacity = s.userData.k * fade;
      if (fade <= 0) return;
      // world size that subtends `minPx` vertical pixels at this distance
      renderer.getSize(_bs);
      const wpp = 2 * Math.tan(camera.fov * DEG2RAD * 0.5) * d / Math.max(1, _bs.y);
      const k = Math.max(B.size, B.minPx * wpp);
      if (Math.abs(k - s.scale.x) > 1e-4) {
        s.scale.set(k, k, 1);
        s.updateMatrixWorld(true);
        s.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, s.matrixWorld);
      }
    };
  }
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
  const api = root.userData.api;
  if (api?.dispose) { api.dispose(); return; }
  const rig = root.userData.rig;
  if (!rig) return;
  for (const e of rig.eyes) e.material.dispose();
  for (const e of rig.engines) e.userData.face?.material?.dispose();
  for (const b of rig.beacons || []) { b.onBeforeRender = noop; b.material.dispose(); }
}

const _c = new THREE.Color();
const _bv = new THREE.Vector3();
const _bs = new THREE.Vector2();
const DEG2RAD = Math.PI / 180;
const noop = () => {};
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

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
  // `rig` also arrives here from boss.js, which builds its own and has no
  // beacons — the boss is 40 m of silhouette and never had this problem.
  const B = rig.beacons?.length ? BEACON[root.userData.spec?.kind] : null;
  if (B) {
    // Alert brightens rather than recolours: hue is the class channel and has
    // to mean one thing only. Damage takes the lamps down with the rest of the
    // electrical system, so a ship about to come apart visibly loses its light.
    const gain = (0.88 + alert * 0.24) * (0.35 + 0.65 * live);
    for (const b of rig.beacons) b.userData.k = beaconDuty(B, t, b.userData.phase) * gain;
  }
}

/* ── review cameras (registered from this file, per CONTRACT §1) ───────────── */
//
// The commanders are spawned by the mission, so no shot in the level frames one
// before it arrives. These build a review instance on demand, park it ahead of
// the ship and orbit it. They mutate the scene, which only ever happens in shot
// mode: `applyShot` runs per frame with the sim frozen.

const _review = new Map();
const _rv = new THREE.Vector3();

function reviewCommander(ctx, variant, { phase = 1, dead = 0 } = {}) {
  let r = _review.get(variant);
  if (!r) {
    r = createCommander(variant);
    ctx.scene.add(r);
    _review.set(variant, r);
  }
  for (const [k, o] of _review) o.visible = k === variant;
  const api = r.userData.api;
  api.setPhase(phase);
  api.setAlert(1);
  for (let i = 0; i < dead; i++) api.killWeak(i);
  r.position.set(ctx.ship.position.x, ctx.ship.position.y + 6, ctx.ship.position.z - 150);
  r.rotation.set(0, 0, 0);
  r.updateMatrixWorld(true);
  api.update(ctx.dt || 1 / 60, { power: 1 });
  return r;
}

function orbitAt(cam, target, { dist, yaw, pitch, fov = 34, up = 0 }) {
  const y = THREE.MathUtils.degToRad(yaw), p = THREE.MathUtils.degToRad(pitch);
  _rv.set(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)).multiplyScalar(dist);
  cam.position.copy(target).add(_rv);
  cam.position.y += up;
  cam.fov = fov;
  cam.updateProjectionMatrix();
  cam.lookAt(target);
}

registerShot('cmd-ice', (c) => {
  const r = reviewCommander(c, 'ice');
  orbitAt(c.engine.camera, r.position, { dist: 74, yaw: 214, pitch: 12, fov: 34, up: 3 });
});
registerShot('cmd-ice-front', (c) => {
  const r = reviewCommander(c, 'ice');
  orbitAt(c.engine.camera, r.position, { dist: 78, yaw: 180, pitch: 5, fov: 32, up: 2 });
});
registerShot('cmd-ice-far', (c) => {
  const r = reviewCommander(c, 'ice');
  orbitAt(c.engine.camera, r.position, { dist: 320, yaw: 205, pitch: 7, fov: 34 });
});
registerShot('cmd-void', (c) => {
  const r = reviewCommander(c, 'void');
  orbitAt(c.engine.camera, r.position, { dist: 74, yaw: 208, pitch: 13, fov: 34, up: 3 });
});
registerShot('cmd-void-front', (c) => {
  const r = reviewCommander(c, 'void');
  orbitAt(c.engine.camera, r.position, { dist: 78, yaw: 176, pitch: 6, fov: 32, up: 2 });
});
registerShot('cmd-void-far', (c) => {
  const r = reviewCommander(c, 'void');
  orbitAt(c.engine.camera, r.position, { dist: 320, yaw: 200, pitch: 7, fov: 34 });
});
/** Phase 2 with a damper already gone — the state change has to read. */
registerShot('cmd-ice-rage', (c) => {
  const r = reviewCommander(c, 'ice', { phase: 2, dead: 1 });
  orbitAt(c.engine.camera, r.position, { dist: 66, yaw: 222, pitch: 16, fov: 34, up: 3 });
});
registerShot('cmd-void-rage', (c) => {
  const r = reviewCommander(c, 'void', { phase: 2, dead: 1 });
  orbitAt(c.engine.camera, r.position, { dist: 66, yaw: 214, pitch: 16, fov: 34, up: 3 });
});

// The three later variants take the same four angles. From a loop rather than
// hand-copied: twelve near-identical registrations drift the moment one is
// edited.
for (const v of ['tide', 'bloom', 'forge']) {
  registerShot('cmd-' + v, (c) => {
    const r = reviewCommander(c, v);
    orbitAt(c.engine.camera, r.position, { dist: 74, yaw: 212, pitch: 13, fov: 34, up: 3 });
  });
  registerShot('cmd-' + v + '-front', (c) => {
    const r = reviewCommander(c, v);
    orbitAt(c.engine.camera, r.position, { dist: 80, yaw: 178, pitch: 5, fov: 32, up: 2 });
  });
  registerShot('cmd-' + v + '-far', (c) => {
    const r = reviewCommander(c, v);
    orbitAt(c.engine.camera, r.position, { dist: 320, yaw: 202, pitch: 7, fov: 34 });
  });
  registerShot('cmd-' + v + '-rage', (c) => {
    const r = reviewCommander(c, v, { phase: 2, dead: 1 });
    orbitAt(c.engine.camera, r.position, { dist: 66, yaw: 218, pitch: 16, fov: 34, up: 3 });
  });
}
/** Mid wind-up: on the finale the heat sinks are what says the beam is coming. */
registerShot('cmd-forge-charge', (c) => {
  const r = reviewCommander(c, 'forge');
  r.userData.api.setCharge(1);
  r.userData.api.update(c.dt || 1 / 60, { power: 1 });
  orbitAt(c.engine.camera, r.position, { dist: 70, yaw: 236, pitch: 12, fov: 34, up: 3 });
});

/* ── hostile review cameras ───────────────────────────────────────────────── */
//
// CONTRACT §5 is a measurable claim — "reads at 100 px" — and nothing in the
// level shots can make it: a wave arrives when it arrives, at whatever range
// the encounter picked. These build one instance per class off the prototype,
// park it ahead of the ship and frame it at a stated pixel height, so the
// silhouette rule can be checked rather than asserted.

const FAMILY = ['raptor', 'wasp', 'scarab', 'lancer', 'hornet', 'bulwark', 'pylon', 'vanguard'];
const _foes = new Map();
const _fbox = new THREE.Box3();
const _fv = new THREE.Vector3();
const _fsz = new THREE.Vector2();

/** World bounds of the hull only — the beacon sprite is sized per camera. */
function foeBounds(obj, out) {
  out.makeEmpty();
  obj.updateMatrixWorld(true);
  obj.traverse(o => { if (o.isMesh) out.expandByObject(o); });
  return out;
}

function reviewFoe(ctx, kind) {
  let r = _foes.get(kind);
  if (!r) {
    r = createEnemy(kind);
    ctx.scene.add(r);
    _foes.set(kind, r);
  }
  for (const [k, o] of _foes) o.visible = k === kind;
  // High above the corridor: at rail height every review frame is a dark hull
  // against a shadowed hillside, which measures the terrain rather than the
  // silhouette.
  r.position.set(ctx.ship.position.x, ctx.ship.position.y + 130, ctx.ship.position.z - 140);
  r.rotation.set(0, 0, 0);
  animateEnemy(r, ctx.dt || 1 / 60, { power: 1, alert: 1, t: ctx.time || 0 });
  return r;
}

/**
 * Frame `obj` so its longer screen dimension covers `px` pixels.
 *
 * Solved by projection rather than from the bounding box's largest edge: at any
 * oblique yaw a hull is foreshortened, so sizing off its own length puts a
 * "100 px" frame on screen at 53. The loop converges in two or three passes.
 */
function fitPx(ctx, obj, px, { yaw = 238, pitch = 13, fov = 34 } = {}) {
  foeBounds(obj, _fbox);
  const cam = ctx.engine.camera;
  ctx.engine.renderer.getSize(_fsz);
  const centre = _fbox.getCenter(_fv).clone();
  let dist = _fbox.getSize(_fv).length() * _fsz.y / (px * 2 * Math.tan(THREE.MathUtils.degToRad(fov) * 0.5));
  for (let pass = 0; pass < 8; pass++) {
    orbitAt(cam, centre, { dist, yaw, pitch, fov });
    cam.updateMatrixWorld(true);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let c = 0; c < 8; c++) {
      _fv.set(c & 1 ? _fbox.max.x : _fbox.min.x, c & 2 ? _fbox.max.y : _fbox.min.y, c & 4 ? _fbox.max.z : _fbox.min.z);
      _fv.project(cam);
      x0 = Math.min(x0, _fv.x); x1 = Math.max(x1, _fv.x);
      y0 = Math.min(y0, _fv.y); y1 = Math.max(y1, _fv.y);
    }
    const got = Math.max((x1 - x0) * 0.5 * _fsz.x, (y1 - y0) * 0.5 * _fsz.y);
    if (!(got > 0) || Math.abs(got - px) < 1) break;
    dist *= got / px;
  }
}

for (const kind of ['lancer', 'scarab', 'pylon']) {
  registerShot('foe-' + kind, (c) => fitPx(c, reviewFoe(c, kind), 520));
  registerShot('foe-' + kind + '-front', (c) => fitPx(c, reviewFoe(c, kind), 520, { yaw: 180, pitch: 4, fov: 32 }));
  registerShot('foe-' + kind + '-side', (c) => fitPx(c, reviewFoe(c, kind), 520, { yaw: 270, pitch: 6, fov: 32 }));
  // Slightly below the hull: at review altitude a downward pitch fills the
  // frame with a shadowed hillside, and what that measures is the hill.
  registerShot('foe-' + kind + '-100', (c) => fitPx(c, reviewFoe(c, kind), 100, { yaw: 238, pitch: -7 }));
}

/** The whole roster in one row: the only frame that answers "confusable?". */
registerShot('foe-family', (c) => {
  const widths = [], boxes = [];
  for (const kind of FAMILY) {
    let r = _foes.get(kind);
    if (!r) { r = createEnemy(kind); c.scene.add(r); _foes.set(kind, r); }
    r.visible = true;
    r.position.set(0, 0, 0);
    r.rotation.set(0, 0, 0);
    const b = foeBounds(r, new THREE.Box3());
    boxes.push(b);
    widths.push(b.max.x - b.min.x);
  }
  const gap = 6;
  let total = gap * (FAMILY.length - 1);
  for (const w of widths) total += w;
  let x = -total / 2;
  for (let i = 0; i < FAMILY.length; i++) {
    const r = _foes.get(FAMILY[i]);
    const b = boxes[i];
    r.position.set(
      c.ship.position.x + x + widths[i] / 2 - (b.max.x + b.min.x) / 2,
      c.ship.position.y + 130 - (b.max.y + b.min.y) / 2,
      c.ship.position.z - 260,
    );
    animateEnemy(r, c.dt || 1 / 60, { power: 1, alert: 1, t: c.time || 0 });
    x += widths[i] + gap;
  }
  c.engine.renderer.getSize(_fsz);
  // Long lens: at a wide angle the far end of a 120 m row is half the size of
  // the near end, which is a comparison of distances rather than of shapes.
  const fov = 13;
  const aspect = _fsz.x / Math.max(1, _fsz.y);
  const dist = (total * 0.58) / (aspect * Math.tan(THREE.MathUtils.degToRad(fov) * 0.5));
  _fv.set(c.ship.position.x, c.ship.position.y + 130, c.ship.position.z - 260);
  orbitAt(c.engine.camera, _fv, { dist, yaw: 184, pitch: 5, fov });
});
