import * as THREE from 'three';
import { Mat, Tex, emissive } from '../render/materials.js';
import { rng } from '../core/rng.js';
import { registerShot } from '../game/shots.js';
import { SMat, buildShipMaterials, flexMaterial, flexOffset } from './ship-materials.js';
import {
  loft, superellipse, assemble, M, stationAt,
  hullLoft, wingLoft, chamferBox, extrudePoly, ductGeo, louvers,
  boltRow, blisterGeo, tubeAlong, shellArc, mirrorX, triCount,
  wingSurface, hullSurface, conformalPatch, wingFlap,
} from '../render/geobuild.js';

// ─────────────────────────────────────────────────────────────────────────────
// The Arwing.
//
// Forward is -Z, up is +Y, span is ±X. Everything is lofted: the fuselage is a
// swept superellipse with panel seams and intake wells cut into the loft itself,
// the wings are real airfoils, and the wing assembly bends in the vertex stage
// so tip fins and gun pods flex with the spar instead of hovering beside it.
//
// Silhouette targets, in priority order — these are what a reviewer reads at
// 100 px, and everything else is subordinate to them:
//   1. slender dart fuselage, sharp nose, no visible "fuselage + wing" join
//   2. high-shouldered wings with modest sweep and outboard anhedral
//   3. big upturned wingtip fins — the single most Arwing-specific feature
//   4. twin laser barrels reaching forward past the cockpit
//   5. one dominant engine bell flanked by two small ones
// ─────────────────────────────────────────────────────────────────────────────

const HALF_SPAN = 3.42;

/* ── fuselage: sharp nose, shouldered waist, engine bay aft ─────────────────── */
const FUSELAGE = [
  { z: -4.06, rx: 0.015, ry: 0.013, p: 2.10, squash: 0.95, shoulder: 0.00 },
  { z: -3.78, rx: 0.062, ry: 0.048, p: 2.20, squash: 0.90, shoulder: 0.02 },
  { z: -3.34, rx: 0.134, ry: 0.096, p: 2.36, squash: 0.86, shoulder: 0.06 },
  { z: -2.78, rx: 0.212, ry: 0.150, p: 2.55, squash: 0.82, shoulder: 0.11 },
  { z: -2.08, rx: 0.288, ry: 0.208, p: 2.74, squash: 0.79, shoulder: 0.15 },
  { z: -1.28, rx: 0.344, ry: 0.258, p: 2.86, squash: 0.77, shoulder: 0.17 },
  { z: -0.44, rx: 0.386, ry: 0.294, p: 2.90, squash: 0.76, shoulder: 0.17 },
  { z:  0.40, rx: 0.402, ry: 0.306, p: 2.86, squash: 0.77, shoulder: 0.15 },
  { z:  1.16, rx: 0.386, ry: 0.294, p: 2.74, squash: 0.80, shoulder: 0.11 },
  { z:  1.86, rx: 0.360, ry: 0.276, p: 2.56, squash: 0.84, shoulder: 0.06 },
  { z:  2.34, rx: 0.342, ry: 0.260, p: 2.42, squash: 0.88, shoulder: 0.02 },
  { z:  2.56, rx: 0.330, ry: 0.250, p: 2.36, squash: 0.92, shoulder: 0.00 },
];

/**
 * Canopy: teardrop bubble set well forward. It has to clear the pilot's helmet
 * with visible daylight around it — a canopy the occupant pokes through reads
 * as "no canopy at all", which is exactly how the previous revision failed.
 */
const CANOPY = [
  { z: -2.80, rx: 0.050, ry: 0.024, yOff: 0.190 },
  { z: -2.54, rx: 0.144, ry: 0.096, yOff: 0.202 },
  { z: -2.16, rx: 0.232, ry: 0.184, yOff: 0.220 },
  { z: -1.72, rx: 0.296, ry: 0.254, yOff: 0.244 },
  { z: -1.26, rx: 0.316, ry: 0.288, yOff: 0.262 },
  { z: -0.88, rx: 0.298, ry: 0.264, yOff: 0.272 },
  { z: -0.52, rx: 0.242, ry: 0.186, yOff: 0.278 },
  { z: -0.24, rx: 0.150, ry: 0.078, yOff: 0.276 },
];
/** The interior is authored around y≈0.3; drop it so it lives under the glass. */
const COCKPIT_DROP = -0.20;

/**
 * Wing: ~28° leading-edge sweep, mild trailing-edge sweep, outboard anhedral.
 *
 * Root chord is 1.72 against a 6.9 m airframe. The previous revision ran 2.30,
 * which turned the planform into a delta slab — from the side the ship read as
 * one continuous wedge with no daylight between fuselage and wing. Aspect ratio
 * is what makes a dart look fast, and it is cheaper than any amount of greeble.
 */
const WING = [
  { span: 0.30, chord: 1.72, thickness: 0.148, sweep: -1.05, rise:  0.126, twist:  0.000 },
  { span: 0.92, chord: 1.58, thickness: 0.128, sweep: -0.72, rise:  0.116, twist: -0.006 },
  { span: 1.62, chord: 1.38, thickness: 0.106, sweep: -0.34, rise:  0.082, twist: -0.018 },
  { span: 2.36, chord: 1.14, thickness: 0.082, sweep:  0.06, rise:  0.012, twist: -0.032 },
  { span: 3.02, chord: 0.90, thickness: 0.060, sweep:  0.42, rise: -0.072, twist: -0.044 },
  { span: HALF_SPAN, chord: 0.74, thickness: 0.048, sweep:  0.62, rise: -0.128, twist: -0.050 },
];

/** Elevon: outboard 55% of the span, aft 28% of the chord. */
const ELEVON_SPAN = [1.34, 3.04];
const ELEVON_XC = 0.72;

/* ── wingtip fin: the signature. Big, swept, canted out. ───────────────────── */
// Split at span 1.02 so the red cap is real geometry rather than a decal that
// z-fights the surface it is meant to be painted on.
const TIP_FIN = [
  { span: 0.00, chord: 1.36, thickness: 0.115, sweep: 0.00 },
  { span: 0.40, chord: 1.16, thickness: 0.096, sweep: 0.20 },
  { span: 0.82, chord: 0.94, thickness: 0.074, sweep: 0.42 },
  { span: 1.02, chord: 0.82, thickness: 0.062, sweep: 0.54 },
  { span: 1.26, chord: 0.64, thickness: 0.048, sweep: 0.70 },
  { span: 1.52, chord: 0.40, thickness: 0.032, sweep: 0.92 },
];

/* ── dorsal fin behind the canopy ──────────────────────────────────────────── */
const TAIL_FIN = [
  { span: 0.00, chord: 1.46, thickness: 0.130, sweep: 0.52 },
  { span: 0.42, chord: 1.22, thickness: 0.106, sweep: 0.74 },
  { span: 0.82, chord: 0.96, thickness: 0.080, sweep: 0.98 },
  { span: 0.98, chord: 0.84, thickness: 0.070, sweep: 1.10 },
  { span: 1.16, chord: 0.68, thickness: 0.056, sweep: 1.26 },
  { span: 1.34, chord: 0.44, thickness: 0.038, sweep: 1.46 },
];

/**
 * One sampler per skin, shared by every part that has to sit on that skin.
 * Trim, hatches, fences and control surfaces are all placed by evaluating these
 * rather than by a hand-guessed translate — which is the entire reason the last
 * revision had plates hovering in mid-air beside the wing.
 */
const DORSAL = [
  { z: -0.34, rx: 0.086, ry: 0.030, p: 2.8, yOff: 0.316 },
  { z:  0.20, rx: 0.100, ry: 0.052, p: 3.0, yOff: 0.316 },
  { z:  1.20, rx: 0.092, ry: 0.048, p: 3.0, yOff: 0.316 },
  { z:  1.90, rx: 0.066, ry: 0.030, p: 2.8, yOff: 0.316 },
];

const WING_S = wingSurface(WING);
const TIPFIN_S = wingSurface(TIP_FIN);
const TAILFIN_S = wingSurface(TAIL_FIN);
const HULL_S = hullSurface(FUSELAGE);
const DORSAL_S = hullSurface(DORSAL);

/* ── exhaust plume shader ─────────────────────────────────────────────────── */
const PLUME_VERT = /* glsl */`
varying vec2 vUv;
varying float vRim;
void main() {
  vUv = uv;
  vec3 n = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vRim = 1.0 - abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}
`;
const PLUME_FRAG = /* glsl */`
uniform vec3  uHot;
uniform vec3  uCool;
uniform float uTime;
uniform float uPower;
varying vec2 vUv;
varying float vRim;
float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
void main() {
  float along = vUv.y;                          // 0 at nozzle, 1 at plume tip
  float flick = noise(vec2(vUv.x * 8.0, along * 5.0 - uTime * 14.0)) * 0.45 + 0.75;
  float body  = pow(1.0 - along, 1.55);
  float core  = pow(1.0 - along, 4.5);
  vec3 col = mix(uCool, uHot, core);
  float a = (body * 0.85 + vRim * body * 0.9) * flick * uPower;
  // shock diamonds
  a *= 1.0 + 0.35 * sin(along * 34.0 - uTime * 26.0) * smoothstep(0.6, 0.1, along);
  gl_FragColor = vec4(col * a, a);
}
`;

function plumeMaterial(hot, cool) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uHot: { value: new THREE.Color(hot) },
      uCool: { value: new THREE.Color(cool) },
      uTime: { value: 0 },
      uPower: { value: 1 },
    },
    vertexShader: PLUME_VERT,
    fragmentShader: PLUME_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, toneMapped: false, fog: false,
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   geometry
   ═══════════════════════════════════════════════════════════════════════════ */

function fuselageGeo() {
  return hullLoft({
    stations: FUSELAGE, count: 34, steps: 26,
    // girth seams: forward radome joint, cockpit sill frame, wing carry-through,
    // the tank bay and the engine firewall
    circGrooves: [
      { z: -3.16, depth: 0.016, width: 0.028 },
      { z: -2.52, depth: 0.014, width: 0.026 },
      { z: -0.10, depth: 0.020, width: 0.034 },
      { z:  1.02, depth: 0.016, width: 0.030 },
      { z:  1.94, depth: 0.022, width: 0.036 },
    ],
    // stringers: the shoulder chine both sides and the ventral keel
    longGrooves: [
      { a: 0.000, depth: 0.016, width: 0.013, z0: -3.30, z1: 2.20, fade: 0.35 },
      { a: 0.500, depth: 0.016, width: 0.013, z0: -3.30, z1: 2.20, fade: 0.35 },
      { a: 0.750, depth: 0.014, width: 0.016, z0: -2.60, z1: 2.30, fade: 0.30 },
    ],
    // wells: the boundary-layer intakes on the upper flanks, and a pair of
    // recessed avionics bays behind them
    dents: [
      { z: -0.62, a: 0.105, rz: 0.62, ra: 0.052, depth: 0.055, rim: 0.58 },
      { z: -0.62, a: 0.395, rz: 0.62, ra: 0.052, depth: 0.055, rim: 0.58 },
      { z:  1.30, a: 0.070, rz: 0.42, ra: 0.040, depth: 0.038, rim: 0.55 },
      { z:  1.30, a: 0.430, rz: 0.42, ra: 0.040, depth: 0.038, rim: 0.55 },
    ],
    uvScale: [3, 4],
  });
}

function canopyGeo(inset = 0, squash = 0.10) {
  const rings = CANOPY.map(s => {
    const rx = Math.max(0.004, s.rx - inset);
    const ry = Math.max(0.004, s.ry - inset);
    return superellipse(26, rx, ry, 2.35, { squash })
      .map(p => new THREE.Vector3(p.x, p.y + s.yOff, s.z));
  });
  return loft(rings, { capStart: true, capEnd: true, closed: true });
}

/** A frame bow: a thin solid band that follows the canopy section at `z`. */
function canopyBow(z, thick = 0.05, grow = 0.014) {
  const rings = [];
  for (const zz of [z - thick / 2, z, z + thick / 2]) {
    const s = stationAt(CANOPY, zz, ['rx', 'ry', 'yOff']);
    const k = zz === z ? grow : grow * 0.72;
    rings.push(superellipse(26, s.rx + k, s.ry + k, 2.35, { squash: 0.10 })
      .map(p => new THREE.Vector3(p.x, p.y + s.yOff, zz)));
  }
  return loft(rings, { capStart: true, capEnd: true, closed: true });
}

/** A rail running along the canopy at angular fraction `a`. */
function canopyRail(a, r = 0.017, z0 = -2.58, z1 = -0.28, n = 12) {
  const path = [];
  const t = a * Math.PI * 2;
  const ex = 2 / 2.35;
  const cx = Math.sign(Math.cos(t)) * Math.pow(Math.abs(Math.cos(t)), ex);
  const cy = Math.sign(Math.sin(t)) * Math.pow(Math.abs(Math.sin(t)), ex);
  for (let i = 0; i <= n; i++) {
    const z = z0 + (z1 - z0) * (i / n);
    const s = stationAt(CANOPY, z, ['rx', 'ry', 'yOff']);
    const y = cy < 0 ? cy * 0.10 : cy;
    path.push(new THREE.Vector3(cx * (s.rx + 0.010), y * (s.ry + 0.010) + s.yOff, z));
  }
  return tubeAlong(path, r, 7);
}

/**
 * Control surfaces. `wingFlap` owns the geometry *and* the notch profile the
 * parent skin has to be cut to, which is the whole point: the two can never
 * disagree, because they are the same function.
 */
const ELEVON = wingFlap(WING, {
  span0: ELEVON_SPAN[0], span1: ELEVON_SPAN[1], xc: ELEVON_XC,
  gap: 0.016, steps: 6, res: 16,
});
const TIP_RUDDER = wingFlap(TIP_FIN, { span0: 0.10, span1: 1.16, xc: 0.70, gap: 0.02, steps: 5, res: 14 });
const TAIL_RUDDER = wingFlap(TAIL_FIN, { span0: 0.08, span1: 1.02, xc: 0.68, gap: 0.02, steps: 5, res: 14 });

function wingGeo() {
  return wingLoft(WING, {
    res: 26, steps: 18,
    teCut: { span0: ELEVON_SPAN[0], span1: ELEVON_SPAN[1], xc: ELEVON.cut },
    chordGrooves: [
      { xc: 0.16, depth: 0.010, width: 0.028 },
      { xc: 0.52, depth: 0.012, width: 0.032 },
      // the airbrake bay outline, drawn only across the bay's span
      { xc: 0.30, side: 1, depth: 0.013, width: 0.016, span0: 0.52, span1: 1.30 },
      { xc: 0.63, side: 1, depth: 0.013, width: 0.016, span0: 0.52, span1: 1.30 },
    ],
    spanGrooves: [
      { span: 0.94, depth: 0.012, width: 0.030 },
      { span: 1.62, depth: 0.012, width: 0.038 },
      { span: 2.40, depth: 0.010, width: 0.034 },
      { span: 3.04, depth: 0.010, width: 0.028 },
    ],
    uvScale: [2, 3],
  });
}

/** Fin geometries are authored span-along-X then stood up; span axis becomes +Y. */
const STAND_UP = M.rz(Math.PI / 2);

function tipFinGeo(cut = true) {
  const g = wingLoft(TIP_FIN, {
    res: 18, steps: 10,
    teCut: cut ? { span0: 0.10, span1: 1.16, xc: TIP_RUDDER.cut } : null,
    chordGrooves: [{ xc: 0.40, depth: 0.010, width: 0.032 }],
    spanGrooves: [{ span: 1.02, depth: 0.010, width: 0.030 }],
    uvScale: [1.4, 1.4],
  });
  g.applyMatrix4(STAND_UP);
  return g;
}

function tailFinGeo() {
  const g = wingLoft(TAIL_FIN, {
    res: 20, steps: 10,
    teCut: { span0: 0.08, span1: 1.02, xc: TAIL_RUDDER.cut },
    chordGrooves: [{ xc: 0.34, depth: 0.010, width: 0.030 }],
    spanGrooves: [{ span: 0.44, depth: 0.010, width: 0.05 }],
    uvScale: [1.4, 1.6],
  });
  g.applyMatrix4(STAND_UP);
  return g;
}

/**
 * Trim, hatches and stripes as skin-hugging plates. `sampler` is any surface
 * from geobuild; the patch cannot detach because it is generated from the same
 * function as the surface it sits on.
 */
function finPatch(sampler, opts, mat = null) {
  const g = conformalPatch((u, v) => sampler.sample(u, v, opts.side ?? 1), opts);
  if (mat) g.applyMatrix4(mat);
  return g;
}

/** Gun pod fairing that straddles the wing leading edge. */
function laserPodGeo() {
  return hullLoft({
    stations: [
      { z: -2.02, rx: 0.052, ry: 0.046, p: 2.4 },
      { z: -1.82, rx: 0.108, ry: 0.096, p: 2.5 },
      { z: -1.48, rx: 0.150, ry: 0.132, p: 2.7 },
      { z: -0.90, rx: 0.164, ry: 0.144, p: 2.8 },
      { z: -0.20, rx: 0.156, ry: 0.136, p: 2.7 },
      { z:  0.46, rx: 0.126, ry: 0.108, p: 2.5 },
      { z:  0.80, rx: 0.078, ry: 0.064, p: 2.4 },
      { z:  0.94, rx: 0.030, ry: 0.026, p: 2.3 },
    ],
    count: 18, steps: 12,
    circGrooves: [
      { z: -1.28, depth: 0.012, width: 0.024 },
      { z:  0.10, depth: 0.012, width: 0.024 },
    ],
    longGrooves: [{ a: 0.75, depth: 0.010, width: 0.020, z0: -1.6, z1: 0.6, fade: 0.2 }],
    uvScale: [1.5, 2],
  });
}

function barrelGeo() {
  return hullLoft({
    stations: [
      { z: -3.52, rx: 0.048, ry: 0.048, p: 2.0 },
      { z: -3.40, rx: 0.060, ry: 0.060, p: 2.0 },
      { z: -3.34, rx: 0.052, ry: 0.052, p: 2.0 },
      { z: -2.90, rx: 0.052, ry: 0.052, p: 2.0 },
      { z: -2.84, rx: 0.062, ry: 0.062, p: 2.0 },
      { z: -2.72, rx: 0.062, ry: 0.062, p: 2.0 },
      { z: -2.66, rx: 0.054, ry: 0.054, p: 2.0 },
      { z: -2.10, rx: 0.058, ry: 0.058, p: 2.0 },
      { z: -1.86, rx: 0.070, ry: 0.070, p: 2.2 },
    ],
    count: 14, steps: 8,
    longGrooves: [
      { a: 0.25, depth: 0.008, width: 0.020, z0: -3.3, z1: -2.0, fade: 0.15 },
      { a: 0.75, depth: 0.008, width: 0.020, z0: -3.3, z1: -2.0, fade: 0.15 },
    ],
  });
}

/**
 * Iris nozzle: eight hinged petals around a ceramic throat. `api` scales the
 * hinge angle with throttle, so the bell narrows on cruise and flares on boost.
 */
function makeNozzle(radius, len, petals = 8) {
  const g = new THREE.Group();

  const throat = new THREE.Mesh(hullLoft({
    stations: [
      { z: -0.30, rx: radius * 1.06, ry: radius * 1.06, p: 2.0 },
      { z: -0.10, rx: radius * 0.98, ry: radius * 0.98, p: 2.0 },
      { z:  0.10, rx: radius * 0.72, ry: radius * 0.72, p: 2.0 },
      { z:  0.30, rx: radius * 0.60, ry: radius * 0.60, p: 2.0 },
      { z:  0.52, rx: radius * 0.66, ry: radius * 0.66, p: 2.0 },
    ],
    count: 22, steps: 6, capStart: false, capEnd: false,
    circGrooves: [{ z: 0.10, depth: radius * 0.05, width: 0.03 }],
  }), SMat.ceramic);
  throat.material.side = THREE.DoubleSide;
  g.add(throat);

  const petalGeo = shellArc({
    r: radius, t: radius * 0.10,
    a0: -Math.PI / petals + 0.035, a1: Math.PI / petals - 0.035,
    z0: 0, z1: len, seg: 5, taper: 0.86,
  });
  petalGeo.translate(-radius, 0, 0);

  const hinges = [];
  for (let i = 0; i < petals; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = (i / petals) * Math.PI * 2;
    const pivot = new THREE.Group();
    pivot.position.set(radius, 0, 0);
    pivot.add(new THREE.Mesh(petalGeo, SMat.heat));
    arm.add(pivot);
    g.add(arm);
    hinges.push(pivot);
  }
  g.userData.hinges = hinges;

  // actuator rams, so the iris looks driven rather than magic
  const rams = [];
  for (let i = 0; i < petals; i += 2) {
    const a = (i / petals) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const ram = chamferBox(radius * 0.11, radius * 0.11, len * 0.72, radius * 0.03);
    ram.applyMatrix4(M.t(c * radius * 1.16, s * radius * 1.16, len * 0.30));
    rams.push([ram, null]);
  }
  g.add(new THREE.Mesh(assemble(rams), SMat.metalDark));

  return g;
}

/* ── cockpit ──────────────────────────────────────────────────────────────── */

/**
 * Interior geometry. Read through 30%-opacity glass at three-quarter angles,
 * so what matters is contrast: a pale helmet against a black tub, and two or
 * three instrument glows to give the volume depth.
 */
function buildCockpit() {
  const g = new THREE.Group();
  g.name = 'cockpit';

  const tub = [
    // floor + rails
    [chamferBox(0.46, 0.030, 1.62, 0.012), M.t(0, 0.152, -1.44)],
    [chamferBox(0.055, 0.075, 1.58, 0.014), M.t(0.215, 0.192, -1.44)],
    [chamferBox(0.055, 0.075, 1.58, 0.014), M.t(-0.215, 0.192, -1.44)],
    // rear bulkhead + head box
    [chamferBox(0.48, 0.36, 0.055, 0.016), M.t(0, 0.330, -0.58)],
    [chamferBox(0.26, 0.16, 0.10, 0.02), M.t(0, 0.560, -0.62)],
    // coaming under the windscreen
    [chamferBox(0.46, 0.06, 0.10, 0.02), M.chain(M.t(0, 0.318, -2.14), M.rx(0.34))],
  ];
  g.add(new THREE.Mesh(assemble(tub), SMat.cockpit));

  // ejection seat
  const seat = [
    [chamferBox(0.30, 0.070, 0.34, 0.026), M.t(0, 0.206, -1.06)],
    [chamferBox(0.30, 0.48, 0.075, 0.028), M.chain(M.t(0, 0.415, -0.865), M.rx(-0.20))],
    [chamferBox(0.20, 0.11, 0.085, 0.028), M.chain(M.t(0, 0.622, -0.812), M.rx(-0.20))],
    // bolsters
    [chamferBox(0.055, 0.34, 0.075, 0.024), M.chain(M.t(0.146, 0.40, -0.90), M.rx(-0.20))],
    [chamferBox(0.055, 0.34, 0.075, 0.024), M.chain(M.t(-0.146, 0.40, -0.90), M.rx(-0.20))],
  ];
  g.add(new THREE.Mesh(assemble(seat), SMat.seat));

  // harness straps over the shoulders
  const straps = [
    [chamferBox(0.045, 0.012, 0.30, 0.005), M.chain(M.t(0.075, 0.455, -1.00), M.rx(0.52))],
    [chamferBox(0.045, 0.012, 0.30, 0.005), M.chain(M.t(-0.075, 0.455, -1.00), M.rx(0.52))],
  ];
  g.add(new THREE.Mesh(assemble(straps), SMat.harness));

  // instrument panel — a canted plate carrying the glow
  const panelShape = [
    new THREE.Vector2(-0.20, -0.10), new THREE.Vector2(0.20, -0.10),
    new THREE.Vector2(0.17, 0.10), new THREE.Vector2(-0.17, 0.10),
  ];
  const panel = new THREE.Mesh(extrudePoly(panelShape, 0.035, 0.008), SMat.cockpit);
  panel.position.set(0, 0.292, -1.94);
  panel.rotation.x = -0.62;
  g.add(panel);

  const mfd = (x, y, w, h, mat) => {
    const m = new THREE.Mesh(chamferBox(w, h, 0.012, 0.004), mat);
    m.position.set(x, 0.292 + y * Math.cos(0.62), -1.925 + y * Math.sin(0.62));
    m.rotation.x = -0.62;
    return m;
  };
  g.add(mfd(-0.098, 0.010, 0.10, 0.075, SMat.instrument));
  g.add(mfd(0.098, 0.010, 0.10, 0.075, SMat.instrumentAmber));
  g.add(mfd(0, 0.052, 0.11, 0.026, SMat.instrument));
  g.add(mfd(0, -0.052, 0.15, 0.016, SMat.instrumentRed));

  // side consoles with switch banks
  for (const sx of [1, -1]) {
    const con = new THREE.Mesh(chamferBox(0.075, 0.045, 0.42, 0.014), SMat.cockpit);
    con.position.set(0.185 * sx, 0.252, -1.48);
    con.rotation.z = -0.22 * sx;
    g.add(con);
    g.add(new THREE.Mesh(boltRow({
      from: [0.185 * sx, 0.278, -1.64], to: [0.185 * sx, 0.278, -1.32], n: 5, r: 0.009, h: 0.014,
    }), SMat.metal));
  }

  // HUD combiner: a small tilted plate with a reticle
  const hudPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.16), SMat.hud);
  hudPlate.position.set(0, 0.395, -2.02);
  hudPlate.rotation.x = 0.30;
  hudPlate.renderOrder = 3;
  g.add(hudPlate);
  const reticle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.004, 6, 20), emissive(0x76ffd0, 3.0));
  reticle.position.set(0, 0.395, -2.015);
  reticle.rotation.x = 0.30;
  reticle.renderOrder = 4;
  g.add(reticle);

  // control column
  const stick = new THREE.Mesh(tubeAlong([
    new THREE.Vector3(0, 0.185, -1.30),
    new THREE.Vector3(0.008, 0.255, -1.325),
    new THREE.Vector3(0.020, 0.316, -1.362),
  ], (t) => 0.020 - t * 0.005, 8), SMat.metalDark);
  g.add(stick);
  const grip = new THREE.Mesh(chamferBox(0.042, 0.078, 0.048, 0.016), SMat.glove);
  grip.position.set(0.022, 0.352, -1.368);
  grip.rotation.x = -0.22;
  g.add(grip);

  // throttle quadrant
  const thr = new THREE.Mesh(chamferBox(0.030, 0.058, 0.030, 0.010), SMat.glove);
  thr.position.set(-0.176, 0.298, -1.44);
  thr.rotation.x = -0.30;
  g.add(thr);

  /* ── pilot ──────────────────────────────────────────────────────────────── */
  const pilot = new THREE.Group();
  pilot.name = 'pilot';

  const torso = hullLoft({
    stations: [
      { z: -0.16, rx: 0.108, ry: 0.070, p: 2.4 },
      { z: -0.05, rx: 0.128, ry: 0.082, p: 2.5 },
      { z:  0.10, rx: 0.140, ry: 0.086, p: 2.6 },
      { z:  0.26, rx: 0.132, ry: 0.078, p: 2.6 },
      { z:  0.36, rx: 0.104, ry: 0.062, p: 2.5 },
      { z:  0.42, rx: 0.062, ry: 0.044, p: 2.3 },
    ],
    count: 14, steps: 7,
  });
  torso.applyMatrix4(M.chain(M.t(0, 0.300, -1.045), M.rx(Math.PI / 2 + 0.20)));
  pilot.add(new THREE.Mesh(torso, SMat.suit));

  // thighs forward to the floor, arms out to the stick
  for (const sx of [1, -1]) {
    const leg = tubeAlong([
      new THREE.Vector3(0.078 * sx, 0.232, -1.02),
      new THREE.Vector3(0.086 * sx, 0.236, -1.18),
      new THREE.Vector3(0.090 * sx, 0.222, -1.32),
      new THREE.Vector3(0.092 * sx, 0.186, -1.42),
    ], (t) => 0.058 - t * 0.020, 8);
    pilot.add(new THREE.Mesh(leg, SMat.suit));
    const arm = tubeAlong([
      new THREE.Vector3(0.132 * sx, 0.452, -0.98),
      new THREE.Vector3(0.150 * sx, 0.398, -1.10),
      new THREE.Vector3(0.120 * sx, 0.352, -1.26),
      new THREE.Vector3((sx > 0 ? 0.032 : -0.168), 0.348, -1.35),
    ], (t) => 0.046 - t * 0.016, 8);
    pilot.add(new THREE.Mesh(arm, SMat.suit));
  }

  const helmet = new THREE.Mesh(hullLoft({
    stations: [
      { z: -0.108, rx: 0.048, ry: 0.052, p: 2.2 },
      { z: -0.070, rx: 0.088, ry: 0.094, p: 2.3 },
      { z: -0.010, rx: 0.106, ry: 0.112, p: 2.4 },
      { z:  0.058, rx: 0.100, ry: 0.106, p: 2.4 },
      { z:  0.106, rx: 0.062, ry: 0.070, p: 2.2 },
    ],
    count: 16, steps: 8,
    circGrooves: [{ z: -0.010, depth: 0.008, width: 0.020 }],
  }), SMat.helmet);
  helmet.position.set(0, 0.596, -0.980);
  helmet.rotation.x = Math.PI / 2;
  pilot.add(helmet);

  const visor = new THREE.Mesh(shellArc({
    r: 0.106, t: 0.010, a0: -1.05, a1: 1.05, z0: -0.052, z1: 0.052, seg: 9, taper: 0.9,
  }), SMat.visor);
  visor.position.set(0, 0.598, -1.062);
  visor.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
  pilot.add(visor);

  // oxygen hose
  pilot.add(new THREE.Mesh(tubeAlong([
    new THREE.Vector3(0.062, 0.546, -1.032),
    new THREE.Vector3(0.110, 0.480, -0.980),
    new THREE.Vector3(0.140, 0.420, -0.930),
  ], 0.014, 6), SMat.glove));

  g.add(pilot);

  // Two soft fills so the tub is not a black hole under the glass: one low and
  // forward washing the panel, one behind the seat rimming the pilot's helmet
  // and shoulders. Contrast inside the volume is what sells depth through glass.
  const fill = new THREE.PointLight(0xbcdcff, 2.6, 3.0, 2);
  fill.position.set(0, 0.30, -1.62);
  fill.castShadow = false;
  g.add(fill);
  const rim = new THREE.PointLight(0x8fb8ff, 1.6, 2.2, 2);
  rim.position.set(0, 0.52, -0.52);
  rim.castShadow = false;
  g.add(rim);

  return g;
}

/* ── greeble packs ────────────────────────────────────────────────────────── */

function hullGreebles() {
  const r = rng('ship.greeble');
  const metal = [];
  const dark = [];

  // `a` is the fraction around the section: 0 = starboard waterline, 0.25 = top,
  // 0.5 = port, 0.75 = keel. Every flank part below is placed through HULL_S, so
  // it lands on the skin no matter how the station table is retuned later.
  const F = (z, a, o) => HULL_S.frame(z, a, o);
  const mir = (m) => new THREE.Matrix4().multiplyMatrices(M.s(-1, 1, 1), m);

  for (const sx of [1, -1]) {
    const P = (z, a, o) => (sx > 0 ? F(z, a, o) : mir(F(z, a, o)));

    // intake ducts sunk into the shoulder wells. In a hull frame +Y is out of
    // the skin, so rx(+90°) turns the duct's bore inwards and the mouth reads as
    // a real hole with a lip rather than a dark decal.
    dark.push([ductGeo({ rx: 0.160, ry: 0.115, depth: 0.34, throat: 0.5, lip: 0.03, sides: 18, p: 2.6 }),
      M.chain(P(-1.30, 0.055, { lift: -0.026 }), M.rx(Math.PI / 2))]);

    // boundary-layer diverter standing ahead of the mouth
    dark.push([chamferBox(0.30, 0.058, 0.020, 0.006), P(-1.56, 0.055, { lift: 0.026 })]);

    // heat louvres aft of the wing root
    dark.push([louvers({ n: 5, w: 0.30, h: 0.030, d: 0.075, gap: 0.048, tilt: -0.55, curve: 0.25 }),
      M.chain(P(1.32, 0.022, { lift: 0.006 }), M.rx(Math.PI / 2))]);

    // avionics bay covers with fasteners
    metal.push([conformalPatch((u, v) => HULL_S.sample(u, v),
      { u0: 0.94, u1: 1.68, v0: 0.055, v1: 0.140, nu: 7, nv: 5, lift: 0.002, thick: 0.012, inset: 0.11 }),
      sx > 0 ? null : M.s(-1, 1, 1)]);
    for (const a of [0.048, 0.146]) for (let i = 0; i < 6; i++) {
      metal.push([new THREE.CylinderGeometry(0.011, 0.009, 0.009, 6),
        P(0.96 + i * 0.144, a, { lift: 0.004 })]);
    }

    // spine fastener rows
    for (let i = 0; i < 9; i++) {
      metal.push([new THREE.CylinderGeometry(0.010, 0.008, 0.008, 6),
        P(-0.20 + i * 0.238, 0.212, { lift: 0.003 })]);
    }

    // chine strake running forward from the wing root along the shoulder line.
    // ry(-90°) is what turns an XY outline into a fin standing on the skin with
    // its long axis running aft — the frame supplies the rest.
    metal.push([extrudePoly([
      new THREE.Vector2(-0.78, 0.0), new THREE.Vector2(0.42, 0.042),
      new THREE.Vector2(0.42, -0.026), new THREE.Vector2(-0.78, -0.020),
    ], 0.028, 0.006), M.chain(P(-1.86, 0.0, { lift: 0.004 }), M.ry(-Math.PI / 2))]);

    // sensor blisters
    metal.push([blisterGeo({ rx: 0.058, ry: 0.034, rz: 0.094, seg: 12, rings: 4 }),
      P(-2.66, 0.105, { lift: -0.004 })]);
    dark.push([blisterGeo({ rx: 0.046, ry: 0.028, rz: 0.068, seg: 10, rings: 4 }),
      P(-0.62, 0.700, { lift: -0.004 })]);
    // formation-light strip along the flank
    metal.push([conformalPatch((u, v) => HULL_S.sample(u, v),
      { u0: -2.30, u1: -0.90, v0: 0.086, v1: 0.116, nu: 9, nv: 3, lift: 0.002, thick: 0.007, inset: 0.12 }),
      sx > 0 ? null : M.s(-1, 1, 1)]);
  }

  // radome cap + pitot
  dark.push([hullLoft({
    stations: [
      { z: -4.34, rx: 0.010, ry: 0.010, p: 2.0 },
      { z: -4.20, rx: 0.030, ry: 0.028, p: 2.1 },
      { z: -4.06, rx: 0.048, ry: 0.044, p: 2.2 },
      { z: -3.86, rx: 0.062, ry: 0.056, p: 2.3 },
      { z: -3.70, rx: 0.058, ry: 0.052, p: 2.3 },
    ], count: 14, steps: 6,
  }), null]);

  // ventral keel with a real cross-section, plus its access panels
  dark.push([hullLoft({
    stations: [
      { z: -1.30, rx: 0.115, ry: 0.020, p: 3.0 },
      { z: -0.60, rx: 0.150, ry: 0.062, p: 3.2 },
      { z:  0.60, rx: 0.158, ry: 0.078, p: 3.2 },
      { z:  1.70, rx: 0.132, ry: 0.062, p: 3.0 },
      { z:  2.10, rx: 0.096, ry: 0.030, p: 2.8 },
    ], count: 14, steps: 8,
    longGrooves: [{ a: 0.75, depth: 0.012, width: 0.030, z0: -1.0, z1: 1.9, fade: 0.2 }],
  }), M.t(0, -0.322, 0)]);
  metal.push([boltRow({ from: [0.10, -0.392, -0.40], to: [0.10, -0.392, 1.60], n: 8, r: 0.010, h: 0.008 }), null]);
  metal.push([boltRow({ from: [-0.10, -0.392, -0.40], to: [-0.10, -0.392, 1.60], n: 8, r: 0.010, h: 0.008 }), null]);

  // dorsal spine fairing running from the canopy into the fin
  metal.push([hullLoft({ stations: DORSAL, count: 14, steps: 8 }), null]);

  // engine bay collar — dark, banded, obviously a different assembly
  dark.push([hullLoft({
    stations: [
      { z: 1.92, rx: 0.392, ry: 0.300, p: 2.6, squash: 0.86 },
      { z: 2.12, rx: 0.412, ry: 0.320, p: 2.5, squash: 0.88 },
      { z: 2.46, rx: 0.404, ry: 0.316, p: 2.4, squash: 0.90 },
      { z: 2.62, rx: 0.380, ry: 0.296, p: 2.3, squash: 0.92 },
    ],
    count: 24, steps: 8, capStart: false, capEnd: false,
    circGrooves: [{ z: 2.30, depth: 0.018, width: 0.028 }],
    longGrooves: [
      { a: 0.125, depth: 0.014, width: 0.018, z0: 1.95, z1: 2.60, fade: 0.08 },
      { a: 0.375, depth: 0.014, width: 0.018, z0: 1.95, z1: 2.60, fade: 0.08 },
      { a: 0.625, depth: 0.014, width: 0.018, z0: 1.95, z1: 2.60, fade: 0.08 },
      { a: 0.875, depth: 0.014, width: 0.018, z0: 1.95, z1: 2.60, fade: 0.08 },
    ],
  }), null]);

  // seeded avionics boxes tucked along the engine bay
  for (let i = 0; i < 9; i++) {
    const a = r.range(0, Math.PI * 2);
    const z = r.range(1.55, 2.30);
    const rad = 0.40 + r.range(0.0, 0.02);
    metal.push([chamferBox(r.range(0.05, 0.11), r.range(0.03, 0.06), r.range(0.10, 0.24), 0.012),
      M.chain(M.t(Math.cos(a) * rad, Math.sin(a) * rad * 0.76, z), M.rz(a))]);
  }

  return { metal: assemble(metal), dark: assemble(dark) };
}

/* ── the starboard wing, built once and mirrored ───────────────────────────── */

/** Where the tip fin stands: on the wing tip's upper skin, straddling its chord. */
const TIP_ANCHOR = WING_S.point(HALF_SPAN, 0.42, 1);
const TIP_FIN_M = M.chain(M.t(HALF_SPAN, TIP_ANCHOR.y - 0.035, 0.34), M.rz(-0.20));
const TIP_VENT_M = M.chain(
  M.t(HALF_SPAN, WING_S.point(HALF_SPAN, 0.5, -1).y + 0.02, 0.56),
  M.rz(0.26 + Math.PI), M.s(0.40, 0.44, 0.52),
);

/**
 * Everything that hangs off, sits on or bolts to the starboard wing. Built for
 * +X only and mirrored, so the two halves cannot drift apart, and every part is
 * anchored through `WING_S` so nothing can float.
 */
function starboardWing() {
  const paint = [], metal = [], dark = [], red = [];
  const S = WING_S;

  /* ── skin ── */
  paint.push([wingGeo(), null]);

  /* ── tip fin ── */
  paint.push([tipFinGeo(), TIP_FIN_M]);
  dark.push([tipFinGeo(false), TIP_VENT_M]);
  // root fairing blending the fin into the wing tip, seated on the tip chord
  dark.push([extrudePoly([
    new THREE.Vector2(-0.62, 0.00), new THREE.Vector2(0.06, 0.19),
    new THREE.Vector2(0.50, 0.02), new THREE.Vector2(-0.62, -0.05),
  ], 0.085, 0.014), M.chain(M.t(HALF_SPAN, TIP_ANCHOR.y - 0.02, 0.86), M.ry(-Math.PI / 2))]);

  /* ── gun pod ── */
  const podY = S.point(1.32, 0.44, -1).y - 0.085;
  const podM = M.t(1.32, podY, -0.10);
  paint.push([laserPodGeo(), podM]);
  metal.push([barrelGeo(), podM]);
  red.push([new THREE.TorusGeometry(0.062, 0.014, 8, 16), M.t(1.32, podY, -3.60)]);
  // pylon: from the pod's spine up into the wing's lower skin
  {
    const top = S.point(1.32, 0.44, -1);
    dark.push([chamferBox(0.052, Math.max(0.06, top.y - podY + 0.10), 0.66, 0.016),
      M.t(1.32, (top.y + podY) * 0.5 + 0.02, -0.62)]);
  }

  /* ── wing-root fence, standing on the skin along the chord ── */
  metal.push([extrudePoly([
    new THREE.Vector2(-0.62, 0.00), new THREE.Vector2(0.28, 0.062),
    new THREE.Vector2(0.66, 0.010), new THREE.Vector2(-0.62, -0.05),
  ], 0.024, 0.006), M.chain(S.frame(0.52, 0.46, 1, { lift: 0.004 }), M.ry(-Math.PI / 2))]);

  /* ── hardpoints and fasteners riding the spar line ── */
  // A cylinder's axis is +Y and a surface frame's +Y is the normal, so a
  // fastener needs no rotation at all — it lands seated and square every time.
  for (let i = 0; i < 4; i++) {
    const sp = 1.05 + i * 0.60;
    metal.push([chamferBox(0.12, 0.026, 0.19, 0.009), S.frame(sp, 0.36, -1, { lift: 0.010 })]);
  }
  for (const [xc, n] of [[0.20, 9], [0.66, 8]]) {
    for (let i = 0; i < n; i++) {
      const sp = 0.62 + (2.94 - 0.62) * (i / (n - 1));
      metal.push([new THREE.CylinderGeometry(0.011, 0.009, 0.008, 6), S.frame(sp, xc, 1, { lift: 0.002 })]);
    }
  }

  /* ── G-diffuser: a real unit bolted to the underside, not a glowing decal ── */
  const gdM = S.frame(2.05, 0.60, -1, { lift: 0.052 });
  dark.push([chamferBox(0.92, 0.090, 0.40, 0.022), gdM]);
  dark.push([louvers({ n: 4, w: 0.78, h: 0.026, d: 0.052, gap: 0.038, tilt: -0.45 }),
    M.chain(gdM, M.t(0, 0.048, 0), M.rx(Math.PI / 2))]);
  for (let i = 0; i < 5; i++) {
    metal.push([new THREE.CylinderGeometry(0.009, 0.008, 0.008, 6),
      M.chain(gdM, M.t(-0.40 + i * 0.20, 0.048, -0.17))]);
  }

  /* ── navigation blister high on the tip fin ── */
  // The fin is authored flat and stood up by STAND_UP, so anything riding its
  // surface has to be carried through the *same* pair of matrices.
  const FIN_M = new THREE.Matrix4().multiplyMatrices(TIP_FIN_M, STAND_UP);
  metal.push([blisterGeo({ rx: 0.038, ry: 0.026, rz: 0.066, seg: 10, rings: 4 }),
    M.chain(FIN_M, TIPFIN_S.frame(0.76, 0.44, -1, { lift: 0.004 }))]);

  /* ── trim: conformal, so it is paint on a surface rather than a floating bar ─ */
  const wingPatch = (o) => conformalPatch((u, v) => S.sample(u, v, o.side), o);
  // leading-edge stripe, wrapped over the nose of the airfoil
  red.push([wingPatch({ side: 1, u0: 0.55, u1: 3.34, v0: 0.004, v1: 0.085, nu: 16, nv: 4, lift: 0.002, thick: 0.008, inset: 0.10 }), null]);
  red.push([wingPatch({ side: -1, u0: 0.55, u1: 3.34, v0: 0.004, v1: 0.075, nu: 16, nv: 4, lift: 0.002, thick: 0.008, inset: 0.10 }), null]);
  // outboard upper chevron — the marking that reads at 100 px
  red.push([wingPatch({ side: 1, u0: 2.38, u1: 3.06, v0: 0.17, v1: 0.60, nu: 7, nv: 6, lift: 0.002, thick: 0.007, inset: 0.09 }), null]);
  // inboard grey service walkway, so the upper skin is not one clean sheet
  metal.push([wingPatch({ side: 1, u0: 0.42, u1: 1.28, v0: 0.66, v1: 0.90, nu: 8, nv: 4, lift: 0.002, thick: 0.006, inset: 0.10 }), null]);

  // tip-fin cap flash, on both faces of the fin
  for (const side of [1, -1]) {
    red.push([conformalPatch((u, v) => TIPFIN_S.sample(u, v, side),
      { u0: 1.02, u1: 1.50, v0: 0.03, v1: 0.94, nu: 6, nv: 6, lift: 0.002, thick: 0.007, inset: 0.10 }), FIN_M]);
  }

  return {
    paint: assemble(paint), metal: assemble(metal),
    dark: assemble(dark), red: assemble(red),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   assembly
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @returns {THREE.Group} root with `userData.api` =
 *   { update(dt, state), setThrottle, setDamage, damage, throttle, surfaces… }
 */
export function createArwing({ scale = 1, wingLights = true, cockpit = true } = {}) {
  buildShipMaterials();
  const root = new THREE.Group();
  root.name = 'arwing';

  const flexU = { flex: { value: 0 }, roll: { value: 0 } };

  /* ── fuselage ───────────────────────────────────────────────────────────── */
  const greeb = hullGreebles();

  const hullMesh = new THREE.Mesh(fuselageGeo(), SMat.paint);
  hullMesh.name = 'hull';
  const hullMetal = new THREE.Mesh(greeb.metal, SMat.metal);
  const hullDark = new THREE.Mesh(greeb.dark, SMat.heat);

  const tailFin = new THREE.Mesh(tailFinGeo(), SMat.paint);
  tailFin.position.set(0, 0.300, 0);

  /* ── trim: the red flashes that make the shape legible at distance ──────── */
  // Every one of these is a conformal patch sampled off the hull sampler, so it
  // is paint lying on the skin. The previous revision floated them on guessed
  // transforms and the ship grew a set of red antennae.
  const hullPatch = (o) => conformalPatch((u, v) => HULL_S.sample(u, v), o);
  const redParts = [
    // nose chevron over the radome shoulder
    [hullPatch({ u0: -3.66, u1: -2.70, v0: 0.196, v1: 0.304, nu: 10, nv: 6, lift: 0.002, thick: 0.009, inset: 0.16 }), null],
    // cheek flashes riding the shoulder chine, both sides
    [hullPatch({ u0: -3.24, u1: -1.62, v0: 0.010, v1: 0.062, nu: 13, nv: 4, lift: 0.002, thick: 0.008, inset: 0.10 }), null],
    [hullPatch({ u0: -3.24, u1: -1.62, v0: 0.438, v1: 0.490, nu: 13, nv: 4, lift: 0.002, thick: 0.008, inset: 0.10 }), null],
    // spine stripe, on the dorsal fairing rather than floating above the hull
    [conformalPatch((u, v) => DORSAL_S.sample(u, v),
      { u0: -0.20, u1: 1.78, v0: 0.190, v1: 0.310, nu: 11, nv: 4, lift: 0.002, thick: 0.008, inset: 0.10 }), null],
    // dorsal fin cap
    [conformalPatch((u, v) => TAILFIN_S.sample(u, v, 1),
      { u0: 0.98, u1: 1.32, v0: 0.03, v1: 0.95, nu: 5, nv: 6, lift: 0.002, thick: 0.007, inset: 0.10 }),
      M.chain(M.t(0, 0.300, 0), STAND_UP)],
    [conformalPatch((u, v) => TAILFIN_S.sample(u, v, -1),
      { u0: 0.98, u1: 1.32, v0: 0.03, v1: 0.95, nu: 5, nv: 6, lift: 0.002, thick: 0.007, inset: 0.10 }),
      M.chain(M.t(0, 0.300, 0), STAND_UP)],
  ];
  const redMesh = new THREE.Mesh(assemble(redParts), SMat.red);

  const goldMesh = new THREE.Mesh(assemble([
    [new THREE.TorusGeometry(0.052, 0.012, 8, 18), M.t(0, 0, -3.72)],
    [hullPatch({ u0: -2.96, u1: -2.42, v0: 0.145, v1: 0.185, nu: 5, nv: 3, lift: 0.002, thick: 0.008, inset: 0.14 }), null],
    [hullPatch({ u0: -2.96, u1: -2.42, v0: 0.315, v1: 0.355, nu: 5, nv: 3, lift: 0.002, thick: 0.008, inset: 0.14 }), null],
  ]), SMat.gold);

  /* ── wing assembly ──────────────────────────────────────────────────────── */
  // One wing is built and mirrored, so the halves cannot drift. Wings, tip fins,
  // gun pods and trim are merged per material and share one flex shader, so the
  // whole outer structure bends as a single spar.
  const SB = starboardWing();
  const MIRROR = M.s(-1, 1, 1);
  const bothSides = (g) => assemble([[g, null], [g, MIRROR]]);

  const wingRoot = new THREE.Group();
  wingRoot.name = 'wings';
  wingRoot.add(
    new THREE.Mesh(bothSides(SB.paint), flexMaterial(SMat.paint, flexU)),
    new THREE.Mesh(bothSides(SB.metal), flexMaterial(SMat.metal, flexU)),
    new THREE.Mesh(bothSides(SB.dark), flexMaterial(SMat.heat, flexU)),
    new THREE.Mesh(bothSides(SB.red), flexMaterial(SMat.red, flexU)),
  );

  /* ── control surfaces ───────────────────────────────────────────────────── */
  // Each surface is cut from the parent skin: the elevon is literally the aft
  // 28% of the wing's own airfoil, hinged on the axis the notch was cut around,
  // and its pivot group rides the same bend function as the flex shader — so it
  // stays in its slot at every deflection and every load.
  const surfaces = { elevon: [], brake: [], rudder: null, tipRudder: [] };

  const mkHinged = (geo, hinge, quat, base, sx) => {
    const pivot = new THREE.Group();
    const p = hinge.clone();
    if (sx < 0) p.x = -p.x;
    pivot.position.copy(p);
    const q = quat.clone();
    if (sx < 0) { q.y = -q.y; q.z = -q.z; }   // mirror a rotation across x = 0
    pivot.quaternion.copy(q);
    const inner = new THREE.Group();
    inner.add(new THREE.Mesh(
      assemble([[geo, sx < 0 ? MIRROR : null]]),
      flexMaterial(base, flexU, { offsetX: p.x }),
    ));
    pivot.add(inner);
    pivot.userData.inner = inner;
    return pivot;
  };

  const BRAKE_U = [0.54, 1.30], BRAKE_V = [0.315, 0.615];

  for (const sx of [1, -1]) {
    /* elevon — the notch in the wing was cut to receive exactly this part */
    const ev = mkHinged(ELEVON.geo, ELEVON.hinge, ELEVON.quat, SMat.paint, sx);
    surfaces.elevon.push(ev);
    wingRoot.add(ev);

    /* airbrake — a panel lifted straight off the upper skin it lies on */
    const abGeo = conformalPatch((u, v) => WING_S.sample(u, v, 1), {
      u0: BRAKE_U[0], u1: BRAKE_U[1], v0: BRAKE_V[0], v1: BRAKE_V[1],
      nu: 7, nv: 5, lift: 0.004, thick: 0.020, inset: 0.05,
    });
    const h0 = WING_S.point(BRAKE_U[0], BRAKE_V[0], 1);
    const h1 = WING_S.point(BRAKE_U[1], BRAKE_V[0], 1);
    const abHinge = h0.clone().add(h1).multiplyScalar(0.5);
    const abQuat = new THREE.Quaternion()
      .setFromUnitVectors(new THREE.Vector3(1, 0, 0), h1.clone().sub(h0).normalize());
    abGeo.translate(-abHinge.x, -abHinge.y, -abHinge.z);
    abGeo.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(abQuat.clone().invert()));
    const ab = mkHinged(abGeo, abHinge, abQuat, SMat.paintGrey, sx);
    surfaces.brake.push(ab);
    wingRoot.add(ab);

    // the bay under it: sunk clear of the skin, only seen once the panel lifts
    const wellGeo = conformalPatch((u, v) => WING_S.sample(u, v, 1), {
      u0: BRAKE_U[0] + 0.03, u1: BRAKE_U[1] - 0.03, v0: BRAKE_V[0] + 0.008, v1: BRAKE_V[1] - 0.008,
      nu: 6, nv: 4, lift: -0.062, thick: 0.030, inset: 0.05,
    });
    wingRoot.add(new THREE.Mesh(
      assemble([[wellGeo, sx < 0 ? MIRROR : null]]),
      flexMaterial(SMat.metalDark, flexU),
    ));

    /* tip-fin rudder — cut from the fin's own section, then stood up with it */
    const finM = new THREE.Matrix4().multiplyMatrices(TIP_FIN_M, STAND_UP);
    const tr = mkHinged(
      TIP_RUDDER.geo,
      TIP_RUDDER.hinge.clone().applyMatrix4(finM),
      new THREE.Quaternion().setFromRotationMatrix(finM).multiply(TIP_RUDDER.quat),
      SMat.paint, sx,
    );
    surfaces.tipRudder.push(tr);
    wingRoot.add(tr);
  }

  // dorsal rudder, cut from the tail fin the same way
  {
    const finM = M.chain(M.t(0, 0.300, 0), STAND_UP);
    const rud = new THREE.Group();
    rud.position.copy(TAIL_RUDDER.hinge.clone().applyMatrix4(finM));
    rud.quaternion.copy(new THREE.Quaternion().setFromRotationMatrix(finM).multiply(TAIL_RUDDER.quat));
    const inner = new THREE.Group();
    inner.add(new THREE.Mesh(TAIL_RUDDER.geo, SMat.paint));
    rud.add(inner);
    rud.userData.inner = inner;
    surfaces.rudder = rud;
    root.add(rud);
  }

  /* ── G-diffuser emissive strips, seated on the housing under each wing ──── */
  const gdiffusers = [];
  const gdBase = WING_S.frame(2.05, 0.60, -1, { lift: 0.052 });
  for (const sx of [1, -1]) {
    const gd = new THREE.Mesh(assemble([
      [chamferBox(0.80, 0.016, 0.26, 0.006), M.chain(gdBase, M.t(0, -0.050, 0))],
      [chamferBox(0.62, 0.010, 0.11, 0.004), WING_S.frame(2.05, 0.28, 1, { lift: 0.008 })],
    ].map(([g, m]) => [g, sx < 0 ? new THREE.Matrix4().multiplyMatrices(MIRROR, m) : m])), Mat.gdiffuser.clone());
    gd.name = 'gdiffuser';
    wingRoot.add(gd);
    gdiffusers.push(gd);
  }

  /* ── engines ────────────────────────────────────────────────────────────── */
  const engines = new THREE.Group();
  engines.name = 'engines';

  const mkEngine = (x, y, z, r, plumeLen, plumeR, name) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.name = name;

    const housing = new THREE.Mesh(hullLoft({
      stations: [
        { z: -0.62, rx: r * 1.14, ry: r * 1.14, p: 2.2 },
        { z: -0.30, rx: r * 1.22, ry: r * 1.22, p: 2.3 },
        { z: -0.04, rx: r * 1.18, ry: r * 1.18, p: 2.3 },
        { z:  0.06, rx: r * 1.10, ry: r * 1.10, p: 2.2 },
      ],
      count: 22, steps: 6, capStart: false, capEnd: false,
      circGrooves: [{ z: -0.30, depth: r * 0.06, width: 0.03 }],
      longGrooves: [
        { a: 0.00, depth: r * 0.05, width: 0.02, z0: -0.6, z1: 0.04, fade: 0.06 },
        { a: 0.25, depth: r * 0.05, width: 0.02, z0: -0.6, z1: 0.04, fade: 0.06 },
        { a: 0.50, depth: r * 0.05, width: 0.02, z0: -0.6, z1: 0.04, fade: 0.06 },
        { a: 0.75, depth: r * 0.05, width: 0.02, z0: -0.6, z1: 0.04, fade: 0.06 },
      ],
    }), SMat.heat);
    g.add(housing);

    const nozzle = makeNozzle(r, r * 0.95);
    nozzle.name = 'nozzle';
    g.add(nozzle);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.16, r * 0.055, 8, 28), Mat.engineRing);
    ring.position.z = -0.30;
    g.add(ring);

    const core = new THREE.Mesh(new THREE.CircleGeometry(r * 0.60, 24), Mat.engineCore.clone());
    core.position.z = 0.24;
    core.rotation.y = Math.PI;
    core.name = 'core';
    g.add(core);

    const plume = new THREE.Mesh(
      new THREE.CylinderGeometry(plumeR * 0.92, plumeR * 0.12, plumeLen, 20, 8, true),
      plumeMaterial(0xdff2ff, 0x1f6bff),
    );
    plume.geometry.translate(0, -plumeLen / 2, 0);
    plume.rotation.x = -Math.PI / 2;
    plume.position.z = 0.28;
    plume.name = 'plume';
    plume.renderOrder = 6;
    g.add(plume);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: Tex.flareSoft, color: 0x66c2ff, blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false, toneMapped: false, fog: false,
    }));
    glow.scale.setScalar(r * 6.0);
    glow.position.z = 0.26;
    glow.name = 'glow';
    g.add(glow);

    engines.add(g);
    return g;
  };

  const mainEngine = mkEngine(0, 0.005, 2.62, 0.372, 3.1, 0.33, 'engineMain');
  const engL = mkEngine(-0.70, -0.062, 2.34, 0.186, 1.7, 0.165, 'engineL');
  const engR = mkEngine(0.70, -0.062, 2.34, 0.186, 1.7, 0.165, 'engineR');

  const engineLight = new THREE.PointLight(0x4aa8ff, 6, 14, 2);
  engineLight.position.set(0, 0, 3.2);
  engineLight.castShadow = false;
  engines.add(engineLight);

  /* ── canopy + interior ──────────────────────────────────────────────────── */
  const canopy = new THREE.Mesh(canopyGeo(), SMat.glass);
  canopy.name = 'canopy';
  canopy.renderOrder = 5;

  const canopyFrame = new THREE.Mesh(assemble([
    [canopyBow(-2.16, 0.048), null],
    [canopyBow(-0.52, 0.052), null],
    [canopyRail(0.0, 0.013, -2.72, -0.30, 14), null],
    [canopyRail(0.5, 0.013, -2.72, -0.30, 14), null],
    [canopyRail(0.25, 0.009, -2.62, -0.36, 12), null],
  ]), SMat.metalDark);
  canopyFrame.name = 'canopyFrame';

  // sill: a solid coaming so the glass sits in something
  const sill = new THREE.Mesh(loft(CANOPY.map(s => {
    const pts = superellipse(26, s.rx + 0.026, s.ry + 0.026, 2.35, { squash: 0.10 });
    return pts.map(p => new THREE.Vector3(p.x, Math.min(p.y, 0.012) + s.yOff - 0.012, s.z));
  }), { capStart: true, capEnd: true, closed: true }), SMat.paint);

  const cockpitGroup = cockpit ? buildCockpit() : null;
  if (cockpitGroup) cockpitGroup.position.y = COCKPIT_DROP;

  /* ── nav / warning lights ───────────────────────────────────────────────── */
  const navLights = new THREE.Group();
  navLights.name = 'navLights';
  if (wingLights) {
    const mk = (p, color, size) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), emissive(color, 8));
      m.position.copy(p);
      navLights.add(m);
    };
    // Read off the fin surfaces rather than typed in — retune a fin and the
    // lamps follow it instead of being left behind in empty air.
    const finM = new THREE.Matrix4().multiplyMatrices(TIP_FIN_M, STAND_UP);
    const tipLamp = TIPFIN_S.point(1.44, 0.30, 1).applyMatrix4(finM);
    mk(tipLamp, 0xff2a2a, 0.038);
    mk(tipLamp.clone().setX(-tipLamp.x), 0x2aff5a, 0.038);
    mk(TAILFIN_S.point(1.28, 0.34, 1).applyMatrix4(M.chain(M.t(0, 0.300, 0), STAND_UP)), 0xffffff, 0.026);
    mk(HULL_S.point(-0.98, 0.75).add(new THREE.Vector3(0, -0.075, 0)), 0xffffff, 0.024);
  }

  /* ── damage kit ─────────────────────────────────────────────────────────── */
  const damageGroup = new THREE.Group();
  damageGroup.name = 'damage';

  // scorch patches: thin shells hugging the hull, faded in with opacity
  const scorchMat = SMat.scorch.clone();
  const scorchParts = [];
  {
    const r = rng('ship.scorch');
    for (let i = 0; i < 7; i++) {
      const z = r.range(-1.6, 2.1);
      const a = r.range(0, 1);
      const s = stationAt(FUSELAGE, z, ['rx', 'ry']);
      const t = a * Math.PI * 2;
      scorchParts.push([
        blisterGeo({ rx: r.range(0.14, 0.30), ry: 0.006, rz: r.range(0.18, 0.42), seg: 10, rings: 3 }),
        M.chain(M.t(Math.cos(t) * s.rx * 1.02, Math.sin(t) * s.ry * 1.02, z), M.rz(t - Math.PI / 2)),
      ]);
    }
    scorchParts.push([blisterGeo({ rx: 0.42, ry: 0.006, rz: 0.30, seg: 10, rings: 3 }), M.t(1.85, 0.075, 0.40)]);
    scorchParts.push([blisterGeo({ rx: 0.34, ry: 0.006, rz: 0.26, seg: 10, rings: 3 }), M.t(-2.30, -0.010, 0.10)]);
  }
  const scorchMesh = new THREE.Mesh(assemble(scorchParts), scorchMat);
  scorchMesh.visible = false;
  damageGroup.add(scorchMesh);

  // blown panel on the left wing root: cover plate hides, guts show through
  const panelGeo = extrudePoly([
    new THREE.Vector2(-0.30, 0.26), new THREE.Vector2(0.30, 0.24),
    new THREE.Vector2(0.30, -0.26), new THREE.Vector2(-0.30, -0.26),
  ], 0.028, 0.008);
  panelGeo.applyMatrix4(M.rx(-Math.PI / 2));
  const panelCover = new THREE.Mesh(panelGeo, SMat.paintGrey);
  panelCover.position.set(-1.05, 0.130, -0.12);
  wingRoot.add(panelCover);

  const gutsParts = [];
  for (let i = 0; i < 4; i++) {
    gutsParts.push([chamferBox(0.55, 0.05, 0.035, 0.008), M.t(-1.05, 0.048, -0.32 + i * 0.14)]);
  }
  gutsParts.push([chamferBox(0.14, 0.08, 0.42, 0.014), M.t(-1.16, 0.060, -0.10)]);
  gutsParts.push([chamferBox(0.10, 0.10, 0.20, 0.012), M.t(-0.94, 0.055, 0.06)]);
  const guts = new THREE.Mesh(assemble(gutsParts), SMat.guts);
  guts.visible = false;
  damageGroup.add(guts);

  const wires = new THREE.Mesh(assemble([
    [tubeAlong([
      new THREE.Vector3(-0.90, 0.10, -0.28), new THREE.Vector3(-1.02, 0.20, -0.16),
      new THREE.Vector3(-1.14, 0.16, 0.00), new THREE.Vector3(-1.20, 0.24, 0.16),
    ], 0.012, 6), null],
    [tubeAlong([
      new THREE.Vector3(-1.00, 0.09, 0.10), new THREE.Vector3(-1.12, 0.18, 0.20),
      new THREE.Vector3(-1.22, 0.13, 0.32),
    ], 0.010, 6), null],
  ]), SMat.wire);
  wires.visible = false;
  damageGroup.add(wires);

  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), SMat.ember.clone());
  ember.position.set(-1.08, 0.14, -0.04);
  ember.visible = false;
  damageGroup.add(ember);

  const smoke = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: Tex.puff, color: 0x40372f, transparent: true, opacity: 0,
      depthWrite: false, fog: false,
    }));
    s.scale.setScalar(0.4);
    s.userData.phase = i / 7;
    smoke.push(s);
    damageGroup.add(s);
  }

  /* ── assemble ───────────────────────────────────────────────────────────── */
  root.add(hullMesh, hullMetal, hullDark, tailFin, redMesh, goldMesh, wingRoot, engines, sill);
  if (cockpitGroup) root.add(cockpitGroup);
  root.add(canopyFrame, canopy, navLights, damageGroup);
  root.scale.setScalar(scale);

  root.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    if (o.isSprite) o.frustumCulled = false;
  });
  canopy.castShadow = false;
  scorchMesh.castShadow = false;
  if (cockpitGroup) cockpitGroup.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  for (const e of [mainEngine, engL, engR]) {
    e.traverse(o => { if (o.isMesh || o.isSprite) o.castShadow = false; });
  }

  /* ── animation API ──────────────────────────────────────────────────────── */
  const engineList = [mainEngine, engL, engR];
  const plumes = engineList.map(e => e.getObjectByName('plume'));
  const cores = engineList.map(e => e.getObjectByName('core'));
  const glows = engineList.map(e => e.getObjectByName('glow'));
  const irises = engineList.map(e => e.getObjectByName('nozzle').userData.hinges);

  const lerp = THREE.MathUtils.lerp;
  const clamp = THREE.MathUtils.clamp;

  let t = 0;
  let sFlex = 0, sRoll = 0, sBrake = 0, sPitch = 0, sYaw = 0;

  const api = {
    root, wingRoot, canopy, engines, engineLight,
    cockpit: cockpitGroup,
    surfaces, gdiffusers,
    throttle: 1, boost: 0, damage: 0,
    triangles: 0,

    setThrottle(v) { this.throttle = v; },
    setDamage(v) { this.damage = clamp(v, 0, 1); },

    update(dt, state = {}) {
      const {
        throttle = 1, boost = 0, roll = 0, pitch = 0, yaw = 0, brake = 0, load = 0,
      } = state;
      if (state.damage != null) this.damage = clamp(state.damage, 0, 1);
      const dmg = this.damage;
      t += dt;
      this.throttle = throttle; this.boost = boost;

      const k = 1 - Math.exp(-dt * 9);

      /* ── engines ── */
      const misfire = dmg > 0.4 ? (Math.sin(t * 23.7) * 0.5 + 0.5) * (dmg - 0.4) * 1.6 : 0;
      const pw = (0.55 + throttle * 0.6 + boost * 1.25) * (1 - misfire * 0.55);
      for (let i = 0; i < plumes.length; i++) {
        const p = plumes[i];
        if (!p) continue;
        const sick = i === 2 ? dmg : 0;          // right engine takes the hit
        p.material.uniforms.uTime.value = t;
        p.material.uniforms.uPower.value = pw * (i === 0 ? 1 : 0.72) * (1 - sick * 0.7);
        const len = (0.55 + throttle * 0.45 + boost * 1.5) * (1 - sick * 0.45);
        p.scale.set(1 + boost * 0.22, len, 1 + boost * 0.22);
        p.material.uniforms.uHot.value.setRGB(0.87 + boost * 0.13, 0.95 - sick * 0.55, 1.0 - sick * 0.75);
        p.material.uniforms.uCool.value.setRGB(0.12 + sick * 0.75, 0.42 - sick * 0.30, 1.0 - sick * 0.85);
      }

      const flick = 1 + Math.sin(t * 41) * 0.03 + Math.sin(t * 17.3) * 0.02;
      for (let i = 0; i < cores.length; i++) {
        const c = cores[i];
        if (!c) continue;
        const sick = i === 2 ? dmg : 0;
        c.scale.setScalar((0.85 + throttle * 0.2 + boost * 0.32) * flick * (1 - sick * 0.5));
        c.material.color.setRGB(0.62 + sick * 0.38, 0.85 - sick * 0.55, 1.0 - sick * 0.8)
          .multiplyScalar((6 + throttle * 4 + boost * 9) * (1 - sick * 0.55));
      }
      for (const g of glows) if (g) g.material.opacity = (0.45 + boost * 0.4) * (1 - misfire * 0.5);
      engineLight.intensity = (5 + throttle * 3 + boost * 12) * flick * (1 - misfire * 0.4);

      // iris: tight on cruise, flared on boost, plus a slow breathing idle
      const irisA = -0.16 + throttle * 0.10 + boost * 0.46 + Math.sin(t * 2.1) * 0.012;
      for (const hinges of irises) {
        for (let i = 0; i < hinges.length; i++) {
          hinges[i].rotation.y = irisA + Math.sin(t * 9 + i) * 0.006 * boost;
        }
      }

      /* ── aeroelastics ── */
      // Symmetric bend follows load and thrust; antisymmetric follows roll and
      // lags it, so the tips whip a beat behind the input.
      const targetFlex = -0.05 - (load + boost * 0.35 + throttle * 0.10) * 0.55;
      sFlex = lerp(sFlex, targetFlex, k);
      sRoll = lerp(sRoll, clamp(roll, -1, 1) * 0.42, 1 - Math.exp(-dt * 5.5));
      flexU.flex.value = sFlex + Math.sin(t * 6.3) * 0.012 * (1 + boost);
      flexU.roll.value = sRoll;

      /* ── control surfaces ── */
      sPitch = lerp(sPitch, clamp(pitch, -1, 1), k);
      sYaw = lerp(sYaw, clamp(yaw, -1, 1), k);
      sBrake = lerp(sBrake, clamp(brake, 0, 1), 1 - Math.exp(-dt * 7));
      // Deflections are applied to the group *inside* the hinge pivot, because
      // the pivot itself carries the hinge-axis orientation. Mirroring a
      // rotation across x=0 negates (y,z) of the quaternion, so both sides take
      // the same angle for a symmetric input and opposite angles for roll.
      const rl = clamp(roll, -1, 1);
      for (let i = 0; i < surfaces.elevon.length; i++) {
        const sx = i === 0 ? 1 : -1;
        surfaces.elevon[i].userData.inner.rotation.x = (sPitch * 0.34 + rl * 0.38 * sx) + sBrake * 0.12;
      }
      for (const b of surfaces.brake) b.userData.inner.rotation.x = -sBrake * 1.15;
      if (surfaces.rudder) surfaces.rudder.userData.inner.rotation.x = sYaw * 0.30;
      for (let i = 0; i < surfaces.tipRudder.length; i++) {
        const sx = i === 0 ? 1 : -1;
        surfaces.tipRudder[i].userData.inner.rotation.x = sYaw * 0.26 + rl * 0.10 * sx;
      }

      /* ── g-diffusers ── */
      const gdI = 0.55 + throttle * 0.45 + boost * 1.4 + sBrake * 0.5;
      for (const gd of gdiffusers) {
        gd.material.color.setRGB(0.25, 0.66, 1.0).multiplyScalar(2.2 * gdI);
      }

      /* ── damage ── */
      scorchMesh.visible = dmg > 0.02;
      scorchMat.opacity = Math.min(0.92, dmg * 1.25);
      const blown = dmg > 0.45;
      panelCover.visible = !blown;
      guts.visible = blown;
      wires.visible = blown;
      ember.visible = blown;
      if (blown) {
        const e = 0.7 + Math.sin(t * 18.4) * 0.3 * Math.sin(t * 7.1);
        ember.material.color.setRGB(1.0, 0.42, 0.10).multiplyScalar(4 + e * 4);
        ember.scale.setScalar(0.8 + e * 0.4);
      }
      for (let i = 0; i < smoke.length; i++) {
        const s = smoke[i];
        if (dmg < 0.35) { s.material.opacity = 0; continue; }
        const u = (t * 0.9 + s.userData.phase) % 1;
        s.position.set(0.70 + u * 0.5, -0.05 + u * 0.9, 2.4 + u * 3.4);
        s.scale.setScalar(0.35 + u * 1.5);
        s.material.opacity = (1 - u) * u * 2.6 * (dmg - 0.35) * 1.5;
      }
    },
  };

  api.triangles = triCount(root);
  root.userData.api = api;
  return root;
}

/* ═══════════════════════════════════════════════════════════════════════════
   review angles
   ═══════════════════════════════════════════════════════════════════════════ */

const _v = new THREE.Vector3();
export function orbit(cam, target, { dist, yaw, pitch, fov = 34, up = 0 }) {
  const y = THREE.MathUtils.degToRad(yaw);
  const p = THREE.MathUtils.degToRad(pitch);
  _v.set(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)).multiplyScalar(dist);
  cam.position.copy(target).add(_v);
  cam.position.y += up;
  cam.fov = fov;
  cam.updateProjectionMatrix();
  cam.lookAt(target);
}
const at = (ship, x, y, z) => ship.position.clone().add(new THREE.Vector3(x, y, z));

registerShot('ship-cockpit', ({ engine, ship }) => {
  orbit(engine.camera, at(ship, 0, 0.35, -1.5), { dist: 2.5, yaw: 214, pitch: 22, fov: 30 });
});
registerShot('ship-wingroot', ({ engine, ship }) => {
  orbit(engine.camera, at(ship, 0.9, 0.1, -0.6), { dist: 3.0, yaw: 246, pitch: 26, fov: 32 });
});
registerShot('ship-tip', ({ engine, ship }) => {
  orbit(engine.camera, at(ship, 3.2, 0.35, 0.4), { dist: 3.6, yaw: 236, pitch: 12, fov: 32 });
});
registerShot('ship-nozzle', ({ engine, ship }) => {
  orbit(engine.camera, at(ship, 0, 0, 2.6), { dist: 3.0, yaw: 32, pitch: 10, fov: 32 });
});
registerShot('ship-gun', ({ engine, ship }) => {
  orbit(engine.camera, at(ship, 1.3, -0.05, -2.5), { dist: 2.8, yaw: 208, pitch: 14, fov: 32 });
});
registerShot('ship-belly', ({ engine, ship }) => {
  orbit(engine.camera, ship.position, { dist: 10, yaw: 160, pitch: -38, fov: 34 });
});
registerShot('ship-silhouette', ({ engine, ship }) => {
  orbit(engine.camera, ship.position, { dist: 26, yaw: 200, pitch: 14, fov: 20 });
});
registerShot('ship-damage', ({ engine, ship }) => {
  ship.userData.api?.update?.(1 / 60, { throttle: 1, damage: 0.85 });
  orbit(engine.camera, at(ship, -0.6, 0.1, 0.2), { dist: 6.5, yaw: 250, pitch: 24, fov: 34 });
});
registerShot('ship-brake', ({ engine, ship }) => {
  const api = ship.userData.api;
  if (api) for (let i = 0; i < 30; i++) api.update(1 / 60, { throttle: 0.2, roll: 0.6, brake: 1, pitch: -0.5 });
  orbit(engine.camera, at(ship, 0, 0.2, 0.4), { dist: 9, yaw: 210, pitch: 34, fov: 34 });
});
