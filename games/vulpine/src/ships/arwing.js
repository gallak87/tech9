import * as THREE from 'three';
import { Mat, additive, emissive } from '../render/materials.js';
import { loft, superellipse, sweepProfile, wingGeometry, assemble, M } from '../render/geobuild.js';

// ─────────────────────────────────────────────────────────────────────────────
// The Arwing. Everything here is lofted geometry — the fuselage is a swept
// superellipse, the wings are real NACA airfoils with washout, the canopy is a
// separate bubble. Forward is -Z, up is +Y, span is ±X.
// ─────────────────────────────────────────────────────────────────────────────

const FUSELAGE = [
  { z: -3.62, rx: 0.014, ry: 0.011 },
  { z: -3.34, rx: 0.072, ry: 0.056 },
  { z: -2.92, rx: 0.148, ry: 0.112 },
  { z: -2.36, rx: 0.232, ry: 0.176 },
  { z: -1.70, rx: 0.312, ry: 0.240 },
  { z: -0.98, rx: 0.382, ry: 0.296 },
  { z: -0.22, rx: 0.428, ry: 0.336 },
  { z:  0.54, rx: 0.444, ry: 0.348 },
  { z:  1.24, rx: 0.418, ry: 0.328 },
  { z:  1.86, rx: 0.372, ry: 0.292 },
  { z:  2.24, rx: 0.344, ry: 0.266 },
  { z:  2.36, rx: 0.330, ry: 0.252 },
];

const WING = [
  { span: 0.40, chord: 2.62, thickness: 0.135, sweep: -1.42, rise:  0.010, twist:  0.000 },
  { span: 1.15, chord: 2.18, thickness: 0.118, sweep: -1.02, rise:  0.014, twist: -0.010 },
  { span: 1.95, chord: 1.68, thickness: 0.094, sweep: -0.56, rise: -0.010, twist: -0.026 },
  { span: 2.66, chord: 1.20, thickness: 0.072, sweep: -0.16, rise: -0.062, twist: -0.044 },
  { span: 3.02, chord: 0.96, thickness: 0.052, sweep:  0.04, rise: -0.104, twist: -0.056 },
];

const CANOPY = [
  { z: -2.28, rx: 0.075, ry: 0.030, y: 0.245 },
  { z: -2.02, rx: 0.160, ry: 0.082, y: 0.262 },
  { z: -1.62, rx: 0.246, ry: 0.150, y: 0.286 },
  { z: -1.12, rx: 0.298, ry: 0.196, y: 0.306 },
  { z: -0.62, rx: 0.300, ry: 0.196, y: 0.312 },
  { z: -0.20, rx: 0.268, ry: 0.156, y: 0.310 },
  { z:  0.10, rx: 0.212, ry: 0.092, y: 0.302 },
  { z:  0.30, rx: 0.150, ry: 0.036, y: 0.296 },
];

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

/* ── build ────────────────────────────────────────────────────────────────── */

function fuselageGeo() {
  const rings = FUSELAGE.map(s => {
    const prof = superellipse(28, s.rx, s.ry, 2.55, { squash: 0.82 });
    return prof.map(p => new THREE.Vector3(p.x, p.y, s.z));
  });
  return loft(rings, { capStart: true, capEnd: true, closed: true, uvScale: [2, 3] });
}

function canopyGeo(inset = 0) {
  const rings = CANOPY.map(s => {
    const prof = superellipse(24, s.rx - inset, s.ry - inset, 2.1, { squash: 0.25 });
    return prof.map(p => new THREE.Vector3(p.x, Math.max(p.y, -0.02) + s.y, s.z));
  });
  return loft(rings, { capStart: true, capEnd: true, closed: true });
}

function wingtipFinGeo() {
  // vertical fin at the wing tip — upper blade plus a short lower anhedral spur
  const upper = [
    { span: -0.030, chord: 0.94, thickness: 0.10, sweep: 0.02, rise: 0.0 },
    { span:  0.030, chord: 0.94, thickness: 0.10, sweep: 0.02, rise: 0.0 },
  ];
  const blade = wingGeometry(upper, 18);
  // rotate the airfoil so its span axis becomes vertical
  blade.applyMatrix4(M.rz(Math.PI / 2));
  return blade;
}

function laserPodGeo() {
  const stations = [
    { z: -1.30, r: 0.055 },
    { z: -1.12, r: 0.098 },
    { z: -0.70, r: 0.130 },
    { z:  0.10, r: 0.138 },
    { z:  0.62, r: 0.118 },
    { z:  0.80, r: 0.086 },
  ];
  const rings = stations.map(s => superellipse(16, s.r, s.r * 0.92, 2.2).map(p => new THREE.Vector3(p.x, p.y, s.z)));
  return loft(rings, { capStart: true, capEnd: true, closed: true });
}

function tailFinGeo() {
  const spans = [
    { span: 0.00, chord: 1.30, thickness: 0.16, sweep: 0.78, rise: 0 },
    { span: 0.34, chord: 1.06, thickness: 0.12, sweep: 0.96, rise: 0 },
    { span: 0.66, chord: 0.78, thickness: 0.09, sweep: 1.18, rise: 0 },
    { span: 0.86, chord: 0.52, thickness: 0.06, sweep: 1.36, rise: 0 },
  ];
  const g = wingGeometry(spans, 18);
  g.applyMatrix4(M.rz(Math.PI / 2));   // span becomes +Y
  return g;
}

function intakeGeo() {
  // side air intakes flanking the cockpit
  const stations = [
    { z: -1.05, rx: 0.11, ry: 0.15 },
    { z: -0.72, rx: 0.16, ry: 0.20 },
    { z:  0.10, rx: 0.17, ry: 0.21 },
    { z:  0.72, rx: 0.14, ry: 0.17 },
    { z:  0.94, rx: 0.10, ry: 0.12 },
  ];
  const rings = stations.map(s => superellipse(14, s.rx, s.ry, 3.0).map(p => new THREE.Vector3(p.x, p.y, s.z)));
  return loft(rings, { capStart: true, capEnd: true, closed: true });
}

function nozzleGeo(rOuter, rInner, depth) {
  const rings = [
    ...[0, 1].map(i => superellipse(24, rOuter * (1 - i * 0.04), rOuter * (1 - i * 0.04), 2).map(p => new THREE.Vector3(p.x, p.y, i * 0.02))),
    ...[0, 1, 2].map(i => {
      const t = i / 2;
      const r = rOuter * (1 - t * 0.30);
      return superellipse(24, r, r, 2).map(p => new THREE.Vector3(p.x, p.y, 0.02 + t * depth));
    }),
    ...[0, 1].map(i => superellipse(24, rInner * (1 - i * 0.3), rInner * (1 - i * 0.3), 2).map(p => new THREE.Vector3(p.x, p.y, 0.02 + depth + i * 0.08))),
  ];
  return loft(rings, { capStart: false, capEnd: true, closed: true });
}

/**
 * @returns {THREE.Group} with `userData.api` = { setThrottle, setBoost, update, flexWings }
 */
export function createArwing({ scale = 1, wingLights = true } = {}) {
  const root = new THREE.Group();
  root.name = 'arwing';

  /* ── light hull shell ─────────────────────────────────────────────────── */
  const lightParts = [
    [fuselageGeo(), null],
    [intakeGeo(), M.t(0.50, -0.02, -0.15)],
    [intakeGeo(), M.t(-0.50, -0.02, -0.15)],
  ];

  const wingGeoL = wingGeometry(WING, 30);
  const wingGeoR = wingGeometry(WING, 30);
  wingGeoR.applyMatrix4(M.s(-1, 1, 1));
  wingGeoR.computeVertexNormals();

  const wingRoot = new THREE.Group();
  wingRoot.name = 'wings';

  const wingL = new THREE.Mesh(wingGeoL, Mat.hull);
  const wingR = new THREE.Mesh(wingGeoR, Mat.hull);
  wingL.name = 'wingL'; wingR.name = 'wingR';

  /* ── dark structural bits ─────────────────────────────────────────────── */
  const darkParts = [
    // nose sensor cone
    [new THREE.ConeGeometry(0.075, 0.34, 16), M.chain(M.t(0, 0, -3.42), M.rx(-Math.PI / 2))],
    // belly spine
    [new THREE.BoxGeometry(0.34, 0.10, 2.9), M.t(0, -0.33, 0.35)],
    // engine mount collar
    [new THREE.CylinderGeometry(0.40, 0.44, 0.26, 24), M.chain(M.t(0, 0, 2.32), M.rx(Math.PI / 2))],
    [tailFinGeo(), M.t(0, 0.24, 0.10)],
  ];

  /* ── red accents ──────────────────────────────────────────────────────── */
  const redParts = [
    // nose flash
    [new THREE.BoxGeometry(0.20, 0.055, 1.05), M.chain(M.t(0, 0.175, -2.60), M.rx(-0.055))],
    // dorsal stripe
    [new THREE.BoxGeometry(0.14, 0.05, 1.35), M.t(0, 0.352, 1.20)],
    // tail fin cap
    [new THREE.BoxGeometry(0.075, 0.16, 0.62), M.t(0, 1.06, 1.44)],
  ];

  const hullMesh = new THREE.Mesh(assemble(lightParts), Mat.hull);
  const darkMesh = new THREE.Mesh(assemble(darkParts), Mat.hullDark);
  const redMesh = new THREE.Mesh(assemble(redParts), Mat.accentRed);
  hullMesh.name = 'hull';

  /* ── wing tips: fin + laser pod + red edge ────────────────────────────── */
  const tipGroupFor = (side) => {
    const g = new THREE.Group();
    const sx = side;
    const fin = new THREE.Mesh(wingtipFinGeo(), Mat.hull);
    fin.position.set(3.04 * sx, 0.32, -0.02);
    fin.scale.set(1, 1.05, 1);
    g.add(fin);

    const finLow = new THREE.Mesh(wingtipFinGeo(), Mat.hullDark);
    finLow.position.set(3.04 * sx, -0.46, 0.16);
    finLow.scale.set(0.75, 0.62, 0.8);
    g.add(finLow);

    const pod = new THREE.Mesh(laserPodGeo(), Mat.hull);
    pod.position.set(2.52 * sx, -0.10, -0.28);
    g.add(pod);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.055, 0.62, 14), Mat.hullDark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(2.52 * sx, -0.10, -1.55);
    g.add(barrel);

    const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.016, 8, 18), Mat.accentRed);
    muzzle.rotation.y = 0;
    muzzle.position.set(2.52 * sx, -0.10, -1.83);
    g.add(muzzle);

    // red leading-edge stripe
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.045, 0.13), Mat.accentRed);
    stripe.position.set(2.05 * sx, 0.045, -0.60);
    stripe.rotation.y = -0.44 * sx;
    g.add(stripe);

    // G-diffuser glow strip under the wing
    const gd = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.035, 0.24), Mat.gdiffuser);
    gd.position.set(1.85 * sx, -0.088, 0.42);
    gd.rotation.y = -0.28 * sx;
    gd.name = 'gdiffuser';
    g.add(gd);

    return g;
  };

  wingRoot.add(wingL, wingR, tipGroupFor(1), tipGroupFor(-1));

  /* ── engines ──────────────────────────────────────────────────────────── */
  const engines = new THREE.Group();
  engines.name = 'engines';

  const mkEngine = (x, y, z, r, plumeLen, plumeR) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);

    const shroud = new THREE.Mesh(nozzleGeo(r, r * 0.60, 0.34), Mat.hullDark);
    g.add(shroud);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, r * 0.075, 10, 30), Mat.accentBlue);
    g.add(ring);

    const core = new THREE.Mesh(new THREE.CircleGeometry(r * 0.66, 26), Mat.engineCore.clone());
    core.position.z = 0.16;
    core.rotation.y = Math.PI;
    core.name = 'core';
    g.add(core);

    const plume = new THREE.Mesh(
      new THREE.CylinderGeometry(plumeR * 0.92, plumeR * 0.12, plumeLen, 22, 8, true),
      plumeMaterial(0xdff2ff, 0x1f6bff),
    );
    plume.geometry.translate(0, -plumeLen / 2, 0);
    plume.rotation.x = -Math.PI / 2;
    plume.position.z = 0.18;
    plume.name = 'plume';
    plume.renderOrder = 6;
    g.add(plume);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: null, color: 0x66c2ff, blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false, toneMapped: false, fog: false,
    }));
    glow.scale.setScalar(r * 5.2);
    glow.position.z = 0.22;
    glow.name = 'glow';
    g.add(glow);

    engines.add(g);
    return g;
  };

  const mainEngine = mkEngine(0, 0.00, 2.44, 0.335, 2.9, 0.30);
  const engL = mkEngine(-0.82, -0.06, 2.10, 0.175, 1.6, 0.155);
  const engR = mkEngine(0.82, -0.06, 2.10, 0.175, 1.6, 0.155);

  const engineLight = new THREE.PointLight(0x4aa8ff, 6, 14, 2);
  engineLight.position.set(0, 0, 3.1);
  engines.add(engineLight);

  /* ── canopy ───────────────────────────────────────────────────────────── */
  const canopy = new THREE.Mesh(canopyGeo(), Mat.glass);
  canopy.name = 'canopy';
  canopy.renderOrder = 4;

  const canopyRim = new THREE.Mesh(canopyGeo(-0.012), Mat.canopyFrame);
  canopyRim.scale.set(1.0, 0.995, 1.0);
  canopyRim.renderOrder = 3;

  // interior suggestion — a dark shell so the glass has something behind it
  const cockpitShell = new THREE.Mesh(canopyGeo(0.05), new THREE.MeshStandardMaterial({
    color: 0x0a0e14, roughness: 0.85, metalness: 0.1, side: THREE.BackSide,
  }));
  cockpitShell.scale.set(0.94, 0.9, 0.96);

  /* ── nav / warning lights ─────────────────────────────────────────────── */
  const navLights = new THREE.Group();
  if (wingLights) {
    const mk = (x, y, z, color, size) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), emissive(color, 8));
      m.position.set(x, y, z);
      navLights.add(m);
      return m;
    };
    mk(3.06, 0.72, 0.30, 0xff2a2a, 0.038);
    mk(-3.06, 0.72, 0.30, 0x2aff5a, 0.038);
    mk(0, 0.42, -1.05, 0xffffff, 0.026);
  }

  root.add(hullMesh, darkMesh, redMesh, wingRoot, engines, cockpitShell, canopyRim, canopy, navLights);
  root.scale.setScalar(scale);

  root.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
  });
  canopy.castShadow = false;
  for (const e of [mainEngine, engL, engR]) {
    e.traverse(o => { if (o.isMesh || o.isSprite) o.castShadow = false; });
  }

  /* ── animation API ────────────────────────────────────────────────────── */
  const plumes = [mainEngine, engL, engR].map(e => e.getObjectByName('plume'));
  const cores = [mainEngine, engL, engR].map(e => e.getObjectByName('core'));
  const glows = [mainEngine, engL, engR].map(e => e.getObjectByName('glow'));
  const gdiffusers = [];
  wingRoot.traverse(o => { if (o.name === 'gdiffuser') gdiffusers.push(o); });

  let t = 0;
  const api = {
    root, wingRoot, canopy, engines, engineLight,
    throttle: 1, boost: 0, damage: 0,
    setThrottle(v) { this.throttle = v; },
    update(dt, { throttle = 1, boost = 0, roll = 0 } = {}) {
      t += dt;
      const pw = 0.55 + throttle * 0.6 + boost * 1.25;
      for (let i = 0; i < plumes.length; i++) {
        const p = plumes[i];
        if (!p) continue;
        p.material.uniforms.uTime.value = t;
        p.material.uniforms.uPower.value = pw * (i === 0 ? 1 : 0.72);
        const len = 0.55 + throttle * 0.45 + boost * 1.5;
        p.scale.set(1 + boost * 0.22, len, 1 + boost * 0.22);
        p.material.uniforms.uHot.value.setRGB(
          0.87 + boost * 0.13, 0.95, 1.0,
        );
      }
      const flick = 1 + Math.sin(t * 41) * 0.03 + Math.sin(t * 17.3) * 0.02;
      for (const c of cores) {
        if (!c) continue;
        c.scale.setScalar((0.85 + throttle * 0.2 + boost * 0.32) * flick);
        c.material.color.setRGB(0.62, 0.85, 1.0).multiplyScalar(6 + throttle * 4 + boost * 9);
      }
      for (const g of glows) if (g) g.material.opacity = 0.55 + boost * 0.4;
      engineLight.intensity = (5 + throttle * 3 + boost * 12) * flick;
      for (const gd of gdiffusers) {
        gd.material = gd.material;
        gd.scale.y = 1 + boost * 0.6;
      }
      // aero-elastic wing flex: tips lag the roll input
      const flex = THREE.MathUtils.clamp(roll, -1, 1);
      wingL.rotation.z = -flex * 0.045;
      wingR.rotation.z = -flex * 0.045;
      wingRoot.children[2] && (wingRoot.children[2].rotation.z = -flex * 0.06);
      wingRoot.children[3] && (wingRoot.children[3].rotation.z = -flex * 0.06);
    },
  };
  root.userData.api = api;
  return root;
}
