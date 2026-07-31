import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Geometry toolkit. Hulls, wings and canopies are *lofted* from cross-sections
// rather than assembled from primitives — that is the difference between a
// shape that reads as a modelled aircraft and one that reads as stacked boxes.
//
// The second half of this file is the surface-density kit: grooves that follow
// the form (cut into the loft itself, not projected from a texture), localised
// recesses/scoops with real walls, ducts, louvres, fasteners and blisters.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loft a tube through a list of rings.
 * @param {Array<Array<THREE.Vector3>>} rings equal-length point loops, ordered
 * @param {object} opts capStart/capEnd, closed (loop the ring), smooth normals
 *                 `us` optionally supplies the U coordinate per ring column,
 *                 which matters as soon as the columns are unevenly spaced.
 */
export function loft(rings, { capStart = true, capEnd = true, closed = true, uvScale = [1, 1], flipNormals = false, us = null } = {}) {
  const n = rings[0].length;
  const m = rings.length;
  const segs = closed ? n : n - 1;

  const positions = [];
  const uvs = [];
  const indices = [];

  // total arc length per ring for even V distribution
  const vAt = [0];
  for (let j = 1; j < m; j++) {
    const a = _ringCenter(rings[j - 1]), b = _ringCenter(rings[j]);
    vAt.push(vAt[j - 1] + a.distanceTo(b));
  }
  const vTotal = vAt[m - 1] || 1;

  for (let j = 0; j < m; j++) {
    for (let i = 0; i < n; i++) {
      const p = rings[j][i];
      positions.push(p.x, p.y, p.z);
      const u = us ? us[i] : i / segs;
      uvs.push(u * uvScale[0], (vAt[j] / vTotal) * uvScale[1]);
    }
  }
  for (let j = 0; j < m - 1; j++) {
    for (let i = 0; i < segs; i++) {
      const i2 = (i + 1) % n;
      const a = j * n + i, b = j * n + i2, c = (j + 1) * n + i2, d = (j + 1) * n + i;
      if (flipNormals) { indices.push(a, c, b, a, d, c); }
      else { indices.push(a, b, c, a, c, d); }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const parts = [geo];
  if (capStart) parts.push(_cap(rings[0], !flipNormals));
  if (capEnd) parts.push(_cap(rings[m - 1], flipNormals));
  const out = parts.length > 1 ? mergeGeometries(parts, false) : geo;
  out.computeVertexNormals();
  return out;
}

function _ringCenter(ring) {
  const c = new THREE.Vector3();
  for (const p of ring) c.add(p);
  return c.divideScalar(ring.length);
}

function _cap(ring, flip) {
  const c = _ringCenter(ring);
  const positions = [c.x, c.y, c.z];
  const uvs = [0.5, 0.5];
  for (const p of ring) { positions.push(p.x, p.y, p.z); uvs.push(0.5, 0.5); }
  const idx = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = 0, b = 1 + i, d = 1 + ((i + 1) % n);
    if (flip) idx.push(a, d, b); else idx.push(a, b, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

/**
 * Superellipse cross-section: p=2 is an ellipse, p→4 squares off the corners.
 * Fighter fuselages read best around p = 2.4–3.0 — round on top, flatter belly.
 */
export function superellipse(count, rx, ry, p = 2.4, { squash = 1, yOffset = 0, flatBottom = 0 } = {}) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    const ct = Math.cos(t), st = Math.sin(t);
    const ex = 2 / p;
    let x = Math.sign(ct) * Math.pow(Math.abs(ct), ex) * rx;
    let y = Math.sign(st) * Math.pow(Math.abs(st), ex) * ry;
    if (y < 0) y *= squash;
    if (flatBottom > 0 && y < 0) y = Math.max(y, -ry * squash * (1 - flatBottom) - ry * squash * flatBottom * Math.abs(ct));
    pts.push(new THREE.Vector2(x, y + yOffset));
  }
  return pts;
}

/** NACA-4-ish airfoil (upper then lower surface, closed loop). */
export function airfoil(count, chord, thickness, camber = 0.02, camberPos = 0.4) {
  const half = Math.max(4, count >> 1);
  const upper = [], lower = [];
  for (let i = 0; i <= half; i++) {
    // cosine spacing packs samples at the leading edge where curvature is high
    const beta = (i / half) * Math.PI;
    const x = (1 - Math.cos(beta)) * 0.5;
    const yt = 5 * thickness * (0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    let yc, dyc;
    if (x < camberPos) {
      yc = (camber / (camberPos ** 2)) * (2 * camberPos * x - x * x);
      dyc = (2 * camber / (camberPos ** 2)) * (camberPos - x);
    } else {
      yc = (camber / ((1 - camberPos) ** 2)) * (1 - 2 * camberPos + 2 * camberPos * x - x * x);
      dyc = (2 * camber / ((1 - camberPos) ** 2)) * (camberPos - x);
    }
    const th = Math.atan(dyc);
    upper.push(new THREE.Vector2((x - yt * Math.sin(th)) * chord, (yc + yt * Math.cos(th)) * chord));
    lower.push(new THREE.Vector2((x + yt * Math.sin(th)) * chord, (yc - yt * Math.cos(th)) * chord));
  }
  lower.pop(); lower.shift();
  return upper.concat(lower.reverse());
}

/**
 * Sweep a 2D profile along a set of stations.
 * station = { z, scale:[sx,sy], offset:[ox,oy], twist }
 */
export function sweepProfile(profile, stations, opts = {}) {
  const rings = stations.map(st => {
    const [sx, sy] = st.scale ?? [1, 1];
    const [ox, oy] = st.offset ?? [0, 0];
    const tw = st.twist ?? 0;
    const c = Math.cos(tw), s = Math.sin(tw);
    return profile.map(p => {
      const x = p.x * sx, y = p.y * sy;
      return new THREE.Vector3(x * c - y * s + ox, x * s + y * c + oy, st.z);
    });
  });
  return loft(rings, opts);
}

/**
 * Wing lofted from airfoil stations along a swept, tapered, dihedral span.
 * station = { span (x), chord, thickness, sweep (z of leading edge), rise (y),
 *             twist (washout, radians), camber }
 * Span runs along +X, chord runs aft along +Z, leading edge sits at `sweep`.
 */
export function wingGeometry(spans, resolution = 26, opts = {}) {
  const rings = spans.map(s => {
    const af = airfoil(resolution, s.chord, s.thickness, s.camber ?? 0.015);
    const tw = s.twist ?? 0;
    const c = Math.cos(tw), sn = Math.sin(tw);
    return af.map(p => {
      const cx = p.x, cy = p.y;              // chordwise, thickness
      const rz = (cx * c - cy * sn) + (s.sweep ?? 0);
      const ry = (cx * sn + cy * c) + (s.rise ?? 0);
      return new THREE.Vector3(s.span, ry, rz);
    });
  });
  return loft(rings, { capStart: true, capEnd: true, closed: true, ...opts });
}

/** Ring of instanced greeble boxes around a cylinder — engine detail, hull vents. */
export function greebleRing({ count = 12, radius = 1, z = 0, size = [0.12, 0.06, 0.3], jitter = 0, rng = null }) {
  const geos = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const j = rng ? (rng.next() - 0.5) * jitter : 0;
    const g = chamferBox(size[0], size[1], size[2] * (1 + j), Math.min(size[0], size[1]) * 0.28);
    const m = new THREE.Matrix4()
      .makeRotationZ(a)
      .multiply(new THREE.Matrix4().makeTranslation(0, radius, z));
    g.applyMatrix4(m);
    geos.push(g);
  }
  return mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g), false);
}

/**
 * Merge a list of [geometry, matrix] pairs into one buffer geometry.
 * Normals are computed **per part before merging** and then left alone — a
 * global computeVertexNormals() after the merge flat-shades every lofted
 * surface in the set, which is what makes procedural ships look like origami.
 */
export function assemble(parts) {
  const geos = parts.map(([g, m]) => {
    let c = g.clone();
    if (!c.attributes.normal) c.computeVertexNormals();
    if (m) {
      c.applyMatrix4(m);
      // a mirroring matrix flips winding; fix it rather than shipping black faces
      if (new THREE.Matrix4().copy(m).determinant() < 0) c = _flipWinding(c);
    }
    if (!c.attributes.uv) {
      const n = c.attributes.position.count;
      c.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2).fill(0.5), 2));
    }
    // keep only the attributes every part shares, or the merge refuses
    const keep = new THREE.BufferGeometry();
    keep.setAttribute('position', c.getAttribute('position'));
    keep.setAttribute('normal', c.getAttribute('normal'));
    keep.setAttribute('uv', c.getAttribute('uv'));
    if (c.index) keep.setIndex(c.index);
    return keep.index ? keep.toNonIndexed() : keep;
  });
  return mergeGeometries(geos, false);
}

function _flipWinding(g) {
  const geo = g.index ? g.toNonIndexed() : g;
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i += 3) {
    for (const attr of [pos, nrm, uv]) {
      if (!attr) continue;
      const s = attr.itemSize;
      for (let k = 0; k < s; k++) {
        const a = attr.array[(i + 1) * s + k];
        attr.array[(i + 1) * s + k] = attr.array[(i + 2) * s + k];
        attr.array[(i + 2) * s + k] = a;
      }
    }
  }
  if (nrm) { for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i)); nrm.needsUpdate = true; }
  pos.needsUpdate = true;
  return geo;
}

export const M = {
  t: (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z),
  rx: (a) => new THREE.Matrix4().makeRotationX(a),
  ry: (a) => new THREE.Matrix4().makeRotationY(a),
  rz: (a) => new THREE.Matrix4().makeRotationZ(a),
  s: (x, y = x, z = x) => new THREE.Matrix4().makeScale(x, y, z),
  chain: (...ms) => ms.reduce((acc, m) => acc.multiply(m), new THREE.Matrix4()),
};

/* ═══════════════════════════════════════════════════════════════════════════
   Surface-density kit
   ═════════════════════════════════════════════════════════════════════════ */

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / ((b - a) || 1e-6)); return t * t * (3 - 2 * t); };
/** Raised-cosine pulse: 1 at d=0, 0 at d>=w. C1 continuous, so no shading seam. */
const pulse = (d, w) => d >= w ? 0 : 0.5 * (1 + Math.cos(Math.PI * d / w));

function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Catmull-Rom sample of a keyed station list at an arbitrary z. */
export function stationAt(st, z, keys) {
  const n = st.length;
  if (z <= st[0].z) return { ...st[0], z };
  if (z >= st[n - 1].z) return { ...st[n - 1], z };
  let i = 0;
  while (i < n - 2 && st[i + 1].z <= z) i++;
  const b = st[i], c = st[i + 1];
  const a = st[Math.max(0, i - 1)], d = st[Math.min(n - 1, i + 2)];
  const t = (z - b.z) / ((c.z - b.z) || 1);
  const out = { z };
  for (const k of keys) out[k] = cr(a[k], b[k], c[k], d[k], t);
  return out;
}

function dedupe(arr, eps) {
  arr.sort((a, b) => a - b);
  const o = [];
  for (const v of arr) if (!o.length || v - o[o.length - 1] > eps) o.push(v);
  return o;
}

const HULL_KEYS = ['rx', 'ry', 'p', 'squash', 'yOff', 'xOff', 'shoulder'];
const HULL_DEFAULTS = { rx: 1, ry: 1, p: 2.5, squash: 1, yOff: 0, xOff: 0, shoulder: 0 };

/**
 * The workhorse. A smooth swept hull with **real** surface features cut into
 * the loft itself:
 *
 *   circGrooves  [{z, depth, width, a0, a1}]   girth panel seams
 *   longGrooves  [{a, depth, width, z0, z1}]   stringer lines running aft
 *   dents        [{z, a, rz, ra, depth, rim}]  scoops, recesses, intake wells
 *
 * `a` is a fraction of the way round the section (0 = +X side, 0.25 = top).
 * Sample refinement is inserted automatically around every feature, so the
 * base tessellation stays cheap and only the detail pays.
 */
export function hullLoft({
  stations, count = 30, steps = 40,
  circGrooves = [], longGrooves = [], dents = [],
  capStart = true, capEnd = true, uvScale = [1, 1],
}) {
  const st = stations.map(s => ({ ...HULL_DEFAULTS, ...s }));
  const z0 = st[0].z, z1 = st[st.length - 1].z;
  const span = z1 - z0;

  /* ── sample placement: uniform base + refinement bands round each feature ── */
  const zs = [];
  for (let i = 0; i <= steps; i++) zs.push(z0 + span * (i / steps));
  const refineZ = (zc, w) => {
    for (const o of [-1.35, -0.8, -0.34, 0, 0.34, 0.8, 1.35]) {
      const z = zc + o * w;
      if (z > z0 + 1e-4 && z < z1 - 1e-4) zs.push(z);
    }
  };
  for (const g of circGrooves) refineZ(g.z, (g.width ?? 0.05) * 1.7);
  for (const d of dents) { refineZ(d.z - d.rz, d.rz * 0.55); refineZ(d.z + d.rz, d.rz * 0.55); refineZ(d.z, d.rz * 0.9); }
  const zu = dedupe(zs, span * 2e-4);

  const as = [];
  for (let i = 0; i < count; i++) as.push(i / count);
  const refineA = (ac, w) => {
    for (const o of [-1.35, -0.8, -0.34, 0, 0.34, 0.8, 1.35]) {
      let a = (ac + o * w) % 1; if (a < 0) a += 1;
      as.push(a);
    }
  };
  for (const g of longGrooves) refineA(g.a, (g.width ?? 0.016) * 1.7);
  for (const d of dents) { refineA(d.a - d.ra, d.ra * 0.55); refineA(d.a + d.ra, d.ra * 0.55); refineA(d.a, d.ra * 0.9); }
  let au = dedupe(as, 4e-4);
  if (1 - au[au.length - 1] < 4e-4) au.pop();

  const angDist = (a, b) => { const d = Math.abs(a - b); return Math.min(d, 1 - d); };

  const rings = zu.map(z => {
    const s = stationAt(st, z, HULL_KEYS);
    const ex = 2 / Math.max(0.6, s.p);
    return au.map(af => {
      const t = af * Math.PI * 2;
      const ct = Math.cos(t), sn = Math.sin(t);
      let x = Math.sign(ct) * Math.pow(Math.abs(ct), ex) * s.rx;
      let y = Math.sign(sn) * Math.pow(Math.abs(sn), ex) * s.ry;
      if (y < 0) y *= s.squash;
      // a shoulder chine: pinch the waterline outward, the classic fighter crease
      if (s.shoulder) x += Math.sign(ct) * s.shoulder * s.rx * Math.pow(Math.max(0, 1 - Math.abs(sn) * 1.7), 2);

      let dep = 0;
      for (const g of circGrooves) {
        if (g.a0 != null && !arcContains(af, g.a0, g.a1)) continue;
        const w = (g.width ?? 0.05) * 1.7;
        let k = pulse(Math.abs(z - g.z), w);
        if (g.a0 != null) k *= arcFade(af, g.a0, g.a1, g.arcFade ?? 0.02);
        dep = Math.max(dep, k * (g.depth ?? 0.018));
      }
      for (const g of longGrooves) {
        const w = (g.width ?? 0.016) * 1.7;
        const zf = smoothstep(g.z0 ?? z0, (g.z0 ?? z0) + (g.fade ?? 0.18), z)
                 * (1 - smoothstep((g.z1 ?? z1) - (g.fade ?? 0.18), g.z1 ?? z1, z));
        dep = Math.max(dep, pulse(angDist(af, g.a), w) * (g.depth ?? 0.015) * zf);
      }
      for (const d of dents) {
        const nz = (z - d.z) / d.rz;
        const na = angDist(af, d.a) / d.ra;
        const r = Math.hypot(nz, na);
        // flat-bottomed with a steep wall: reads as machined, not as a dimple
        const f = 1 - smoothstep(d.rim ?? 0.55, 1.0, r);
        dep = Math.max(dep, f * d.depth);
      }

      const len = Math.hypot(x, y) || 1;
      const k = Math.max(0.02, 1 - dep / len);
      return V3(x * k + s.xOff, y * k + s.yOff, z);
    });
  });

  return loft(rings, { capStart, capEnd, closed: true, uvScale, us: au });
}

function arcContains(a, a0, a1) {
  if (a1 >= a0) return a >= a0 - 0.05 && a <= a1 + 0.05;
  return a >= a0 - 0.05 || a <= a1 + 0.05;
}
function arcFade(a, a0, a1, f) {
  const d0 = a1 >= a0 ? a - a0 : (a >= a0 ? a - a0 : a + 1 - a0);
  const len = a1 >= a0 ? a1 - a0 : a1 + 1 - a0;
  return smoothstep(0, f, d0) * (1 - smoothstep(len - f, len, d0));
}

/* ── wings ────────────────────────────────────────────────────────────────── */

function afPoint(x, side, thickness, camber, camberPos) {
  const yt = 5 * thickness * (0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  let yc, dyc;
  if (x < camberPos) {
    yc = (camber / (camberPos ** 2)) * (2 * camberPos * x - x * x);
    dyc = (2 * camber / (camberPos ** 2)) * (camberPos - x);
  } else {
    yc = (camber / ((1 - camberPos) ** 2)) * (1 - 2 * camberPos + 2 * camberPos * x - x * x);
    dyc = (2 * camber / ((1 - camberPos) ** 2)) * (camberPos - x);
  }
  const th = Math.atan(dyc);
  return { z: x - side * yt * Math.sin(th), y: yc + side * yt * Math.cos(th) };
}

const WING_KEYS = ['chord', 'thickness', 'sweep', 'rise', 'twist', 'camber'];
const WING_DEFAULTS = { chord: 1, thickness: 0.1, sweep: 0, rise: 0, twist: 0, camber: 0.012 };

/**
 * Wing with panel lines cut into the skin.
 *   chordGrooves [{xc, side, depth, width}]  seams running spanwise
 *   spanGrooves  [{span, depth, width}]      rib lines running chordwise
 * Stations are Catmull-interpolated across `steps` so a 4-point definition
 * still gives a smoothly ruled surface.
 */
export function wingLoft(spans, {
  res = 30, steps = 14, chordGrooves = [], spanGrooves = [],
  camberPos = 0.4, capRoot = true, capTip = true, uvScale = [1, 1],
  teCut = null,
} = {}) {
  const st = spans.map(s => ({ ...WING_DEFAULTS, ...s, z: s.span }));
  const x0 = st[0].span, x1 = st[st.length - 1].span;

  const xs = [];
  for (let i = 0; i <= steps; i++) xs.push(x0 + (x1 - x0) * (i / steps));
  for (const g of spanGrooves) for (const o of [-1.3, -0.7, 0, 0.7, 1.3]) {
    const x = g.span + o * (g.width ?? 0.05) * 1.7;
    if (x > x0 && x < x1) xs.push(x);
  }
  // sharp walls at the ends of a trailing-edge cutout
  if (teCut) for (const b of [teCut.span0, teCut.span1]) for (const o of [-1.5e-3, 1.5e-3]) {
    const x = b + o;
    if (x > x0 && x < x1) xs.push(x);
  }
  const xu = dedupe(xs, Math.abs(x1 - x0) * 2e-4);

  const half = Math.max(6, res >> 1);
  // With a trailing-edge cutout the section no longer closes to a point, so the
  // lower surface has to carry its own aft vertex to build the notch wall. That
  // vertex exists on every ring (degenerate where the TE is sharp) because loft
  // requires a constant ring length.
  const cosx = (i) => (1 - Math.cos((i / half) * Math.PI)) * 0.5;
  const paramsFor = (cut) => {
    const arr = [];
    for (let i = 0; i <= half; i++) arr.push({ xc: cosx(i) * cut, side: 1 });
    for (let i = teCut ? half : half - 1; i >= 1; i--) arr.push({ xc: cosx(i) * cut, side: -1 });
    return arr;
  };
  const cutAt = (x) => {
    if (!teCut) return 1;
    if (x < teCut.span0 || x > teCut.span1) return 1;
    return typeof teCut.xc === 'function' ? teCut.xc(x) : teCut.xc;
  };

  const rings = xu.map(x => {
    const s = stationAt(st, x, WING_KEYS);
    const c = Math.cos(s.twist), sn = Math.sin(s.twist);
    const qz = 0.25 * s.chord;
    return paramsFor(cutAt(x)).map(pm => {
      const a = afPoint(pm.xc, pm.side, s.thickness, s.camber, camberPos);
      let cz = a.z * s.chord;
      let cy = a.y * s.chord;
      let dep = 0;
      for (const g of chordGrooves) {
        if (g.side && g.side !== pm.side) continue;
        if (g.span0 != null && (x < g.span0 || x > g.span1)) continue;
        dep = Math.max(dep, pulse(Math.abs(pm.xc - g.xc), (g.width ?? 0.035) * 1.7) * (g.depth ?? 0.012));
      }
      for (const g of spanGrooves) {
        dep = Math.max(dep, pulse(Math.abs(x - g.span), (g.width ?? 0.05) * 1.7) * (g.depth ?? 0.012));
      }
      cy -= pm.side * dep;
      const dz = cz - qz;
      return V3(x, s.rise + (dz * sn + cy * c), s.sweep + (dz * c - cy * sn + qz));
    });
  });

  return loft(rings, { capStart: capRoot, capEnd: capTip, closed: true, uvScale });
}

/* ── surface frames: put a part ON a skin, not near it ─────────────────────── */

/**
 * The single most expensive mistake in procedural hard-surface work is placing
 * detail with a guessed translate/rotate. It is *always* slightly off, and a
 * plate hovering 3 cm off a wing is the difference between "modelled" and
 * "assembled by an algorithm".
 *
 * So: every skin exposes a sampler, and every part that lives on it is placed by
 * evaluating the same function that generated the skin. `frame()` returns a
 * matrix whose basis is (X = spanwise out, Y = surface normal, Z = chordwise
 * aft), which is exactly the space a greeble wants to be authored in.
 */
export function wingSurface(spans, { camberPos = 0.4 } = {}) {
  const st = spans.map(s => ({ ...WING_DEFAULTS, ...s, z: s.span }));
  const x0 = st[0].span, x1 = st[st.length - 1].span;
  const clampS = (x) => Math.min(x1, Math.max(x0, x));
  const station = (span) => stationAt(st, clampS(span), WING_KEYS);

  const point = (span, xc, side = 1) => {
    const s = station(span);
    const c = Math.cos(s.twist), sn = Math.sin(s.twist);
    const qz = 0.25 * s.chord;
    const a = afPoint(clamp01(xc), side, s.thickness, s.camber, camberPos);
    const dz = a.z * s.chord - qz, cy = a.y * s.chord;
    return V3(span, s.rise + (dz * sn + cy * c), s.sweep + (dz * c - cy * sn + qz));
  };

  const tangentU = (span, xc, side) => {
    const e = Math.max(2e-3, (x1 - x0) * 2e-3);
    return point(clampS(span + e), xc, side).sub(point(clampS(span - e), xc, side)).normalize();
  };
  const tangentV = (span, xc, side) => {
    const e = 5e-3;
    return point(span, Math.min(1, xc + e), side).sub(point(span, Math.max(0, xc - e), side)).normalize();
  };

  const normal = (span, xc, side = 1) => {
    const q = Math.min(0.985, Math.max(0.015, xc));
    const n = new THREE.Vector3().crossVectors(tangentU(span, q, side), tangentV(span, q, side));
    if (n.lengthSq() < 1e-12) return V3(0, side, 0);
    n.normalize();
    if (n.dot(point(span, q, side).clone().sub(point(span, q, 0))) < 0) n.negate();
    return n;
  };

  /** Matrix4 placing a part authored in (X span, Y up-off-skin, Z aft). */
  const frame = (span, xc, side = 1, { lift = 0, spin = 0 } = {}) => {
    const p = point(span, xc, side);
    const n = normal(span, xc, side);
    let t = tangentV(span, xc, side);
    const s = new THREE.Vector3().crossVectors(n, t).normalize();
    t = new THREE.Vector3().crossVectors(s, n).normalize();
    const m = new THREE.Matrix4().makeBasis(s, n, t);
    if (spin) m.multiply(new THREE.Matrix4().makeRotationY(spin));
    m.setPosition(p.addScaledVector(n, lift));
    return m;
  };

  return {
    spans: st, root: x0, tip: x1, station, point, normal, frame,
    chordAt: (span) => station(span).chord,
    thicknessAt: (span) => station(span).thickness * station(span).chord,
    /** Leading / trailing edge points on the mean line — for stripes and fences. */
    le: (span) => point(span, 0.002, 0),
    te: (span) => point(span, 0.998, 0),
    sample: (span, xc, side = 1) => ({ p: point(span, xc, side), n: normal(span, xc, side) }),
  };
}

/** Same contract for a hullLoft body: u = z, v = fraction around the section. */
export function hullSurface(stations) {
  const st = stations.map(s => ({ ...HULL_DEFAULTS, ...s }));
  const z0 = st[0].z, z1 = st[st.length - 1].z;
  const clampZ = (z) => Math.min(z1, Math.max(z0, z));

  const point = (z, a) => {
    const s = stationAt(st, clampZ(z), HULL_KEYS);
    const ex = 2 / Math.max(0.6, s.p);
    const t = a * Math.PI * 2;
    const ct = Math.cos(t), sn = Math.sin(t);
    let x = Math.sign(ct) * Math.pow(Math.abs(ct), ex) * s.rx;
    let y = Math.sign(sn) * Math.pow(Math.abs(sn), ex) * s.ry;
    if (y < 0) y *= s.squash;
    if (s.shoulder) x += Math.sign(ct) * s.shoulder * s.rx * Math.pow(Math.max(0, 1 - Math.abs(sn) * 1.7), 2);
    return V3(x + s.xOff, y + s.yOff, z);
  };
  const axis = (z) => {
    const s = stationAt(st, clampZ(z), HULL_KEYS);
    return V3(s.xOff, s.yOff, z);
  };

  const tangentU = (z, a) => {
    const e = (z1 - z0) * 2e-3;
    return point(clampZ(z + e), a).sub(point(clampZ(z - e), a)).normalize();
  };
  const tangentV = (z, a) => point(z, a + 2e-3).sub(point(z, a - 2e-3)).normalize();

  const normal = (z, a) => {
    const n = new THREE.Vector3().crossVectors(tangentU(z, a), tangentV(z, a));
    if (n.lengthSq() < 1e-12) return point(z, a).sub(axis(z)).normalize();
    n.normalize();
    if (n.dot(point(z, a).clone().sub(axis(z))) < 0) n.negate();
    return n;
  };

  /** (X = around the section, Y = out of the skin, Z = aft along the body.) */
  const frame = (z, a, { lift = 0, spin = 0 } = {}) => {
    const p = point(z, a);
    const n = normal(z, a);
    let t = tangentU(z, a);
    const s = new THREE.Vector3().crossVectors(n, t).normalize();
    t = new THREE.Vector3().crossVectors(s, n).normalize();
    const m = new THREE.Matrix4().makeBasis(s, n, t);
    if (spin) m.multiply(new THREE.Matrix4().makeRotationY(spin));
    m.setPosition(p.addScaledVector(n, lift));
    return m;
  };

  return {
    front: z0, back: z1, point, normal, frame,
    radiusAt: (z) => stationAt(st, clampZ(z), HULL_KEYS),
    sample: (z, a) => ({ p: point(z, a), n: normal(z, a) }),
  };
}

/**
 * A plate that hugs a curved skin. `sample(u, v)` returns `{p, n}`; the patch is
 * lofted between two offset copies of that grid, so it follows every curve of
 * the parent and can never float. Ring order is chosen from the measured frame
 * handedness, so the caller does not have to think about winding.
 */
export function conformalPatch(sample, {
  u0, u1, v0, v1, nu = 10, nv = 8, lift = 0.003, thick = 0.014, inset = 0.06,
} = {}) {
  const du = u1 - u0, dv = v1 - v0;

  // handedness probe at the patch centre: does (du × dv) agree with the normal?
  const uc = u0 + du * 0.5, vc = v0 + dv * 0.5;
  const c0 = sample(uc, vc);
  const eu = sample(uc + du * 0.01, vc).p.clone().sub(sample(uc - du * 0.01, vc).p);
  const ev = sample(uc, vc + dv * 0.01).p.clone().sub(sample(uc, vc - dv * 0.01).p);
  const topFirst = new THREE.Vector3().crossVectors(eu, ev).dot(c0.n) < 0;

  const rows = [];
  const edge = Math.min(0.14, Math.abs(inset));
  rows.push([0, 0.0]);
  rows.push([edge * 0.6, 1.0]);
  for (let i = 1; i < nu; i++) rows.push([i / nu, 1.0]);
  rows.push([1 - edge * 0.6, 1.0]);
  rows.push([1, 0.0]);

  // A plate needs a chamfer at every edge, or smooth vertex normals blend the
  // top face into the side wall and it renders as a soft bead instead of a
  // machined panel. `bev` is the extra column pair that gives the edge its facet.
  //
  // The rim must NOT collapse to zero thickness: coincident hi/lo vertices make
  // zero-area triangles, whose normals come out as garbage and draw a black
  // outline round the whole decal. Instead the rim sinks *below* the parent
  // skin, so the wall exists but is buried and never seen.
  const bev = 0.05;
  const cols = [0, bev, ...Array.from({ length: nv - 1 }, (_, j) => bev + (1 - 2 * bev) * ((j + 1) / nv)), 1 - bev, 1];
  const last = cols.length - 1;
  const hOf = (j) => (j === 0 || j === last) ? 0.16 : (j === 1 || j === last - 1) ? 0.64 : 1;
  const sink = Math.max(0.004, thick * 0.5);

  const rings = rows.map(([tu, w]) => {
    const u = u0 + du * tu;
    const shrink = (1 - w) * inset;
    const hi = [], lo = [];
    for (let j = 0; j <= last; j++) {
      const tv = shrink + (1 - 2 * shrink) * cols[j];
      const { p, n } = sample(u, v0 + dv * tv);
      const rim = (j === 0 || j === last || w < 1) ? sink : 0;
      hi.push(p.clone().addScaledVector(n, lift + thick * (0.28 + 0.72 * w) * hOf(j)));
      lo.push(p.clone().addScaledVector(n, lift - rim));
    }
    return topFirst ? hi.concat(lo.reverse()) : lo.concat(hi.reverse());
  });

  return loft(rings, { capStart: true, capEnd: true, closed: true });
}

/**
 * A control surface built from the parent wing's own airfoil. The nose is a
 * half-round centred exactly on the hinge line, so the notch cut into the wing
 * (`wingLoft({ teCut })`) stays sealed through the whole deflection range.
 *
 * @returns {{geo, hinge: THREE.Vector3, quat: THREE.Quaternion, cut: Function}}
 *   `geo` is already in hinge-local space (local +X = hinge axis), so the caller
 *   does `pivot.position.copy(hinge); pivot.quaternion.copy(quat)` and then
 *   deflects with `inner.rotation.x`.
 */
export function wingFlap(spans, {
  span0, span1, xc = 0.72, gap = 0.012, steps = 5, res = 16, nose = 5, camberPos = 0.4,
} = {}) {
  const st = spans.map(s => ({ ...WING_DEFAULTS, ...s, z: s.span }));
  const station = (span) => stationAt(st, span, WING_KEYS);

  const halfT = (span) => {
    const s = station(span);
    return (afPoint(xc, 1, s.thickness, s.camber, camberPos).y
          - afPoint(xc, -1, s.thickness, s.camber, camberPos).y) * 0.5;
  };
  /** The parent's cut must sit one nose-radius forward of the hinge. */
  const cut = (span) => xc - halfT(span);

  const to3 = (span, nz, ny) => {
    const s = station(span);
    const c = Math.cos(s.twist), sn = Math.sin(s.twist);
    const qz = 0.25 * s.chord;
    const dz = nz * s.chord - qz, cy = ny * s.chord;
    return V3(span, s.rise + (dz * sn + cy * c), s.sweep + (dz * c - cy * sn + qz));
  };

  const half = Math.max(4, res >> 1);
  const section = (span) => {
    const s = station(span);
    const r = halfT(span);
    const camb = afPoint(xc, 0, s.thickness, s.camber, camberPos);
    const pts = [];
    for (let i = 0; i <= half; i++) {
      const x = xc + (1 - xc) * (1 - Math.cos((i / half) * Math.PI * 0.5));
      const a = afPoint(x, 1, s.thickness, s.camber, camberPos);
      pts.push(to3(span, a.z, a.y));
    }
    for (let i = half; i >= 0; i--) {
      const x = xc + (1 - xc) * (1 - Math.cos((i / half) * Math.PI * 0.5));
      const a = afPoint(x, -1, s.thickness, s.camber, camberPos);
      pts.push(to3(span, a.z, a.y));
    }
    for (let k = 1; k < nose; k++) {
      const th = -Math.PI / 2 - (k / nose) * Math.PI;
      pts.push(to3(span, camb.z + Math.cos(th) * r, camb.y + Math.sin(th) * r));
    }
    return pts;
  };

  const a = span0 + gap, b = span1 - gap;
  const rings = [];
  for (let i = 0; i <= steps; i++) rings.push(section(a + (b - a) * (i / steps)));
  const geo = loft(rings, { capStart: true, capEnd: true, closed: true });

  // hinge = the camber point at xc, which is where the nose arc is centred
  const hingePt = (span) => {
    const s = station(span);
    const c = afPoint(xc, 0, s.thickness, s.camber, camberPos);
    return to3(span, c.z, c.y);
  };
  const h0 = hingePt(a), h1 = hingePt(b);
  const hinge = h0.clone().add(h1).multiplyScalar(0.5);
  const axis = h1.clone().sub(h0).normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), axis);
  geo.translate(-hinge.x, -hinge.y, -hinge.z);
  geo.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quat.clone().invert()));

  return { geo, hinge, quat, cut, span0: a, span1: b };
}

/* ── primitives with edges that catch light ───────────────────────────────── */

function roundedRectPts(w, h, r, seg = 3) {
  const hw = Math.max(1e-4, w * 0.5 - r), hh = Math.max(1e-4, h * 0.5 - r);
  const pts = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
  };
  corner(hw, hh, 0);
  corner(-hw, hh, Math.PI / 2);
  corner(-hw, -hh, Math.PI);
  corner(hw, -hh, Math.PI * 1.5);
  return pts;
}

/**
 * A box with a real chamfer. The whole reason greebles read as machined parts
 * rather than as Minecraft is the 1–2 px highlight along every edge.
 */
export function chamferBox(w, h, d, r = 0.02, seg = 2) {
  r = Math.min(r, w * 0.45, h * 0.45, d * 0.45);
  const mk = (inset) => roundedRectPts(w - 2 * inset, h - 2 * inset, Math.max(0.002, r - inset * 0.4), seg);
  const rings = [
    mk(r).map(p => V3(p.x, p.y, -d / 2)),
    mk(0).map(p => V3(p.x, p.y, -d / 2 + r)),
    mk(0).map(p => V3(p.x, p.y, d / 2 - r)),
    mk(r).map(p => V3(p.x, p.y, d / 2)),
  ];
  return loft(rings, { capStart: true, capEnd: true, closed: true });
}
/** Back-compat alias — old call sites expect a plain box signature. */
export const bevelBox = chamferBox;

/** Wedge/plate from a 2D outline, chamfered on both faces. */
export function extrudePoly(pts2d, depth, chamfer = 0.015) {
  const cx = pts2d.reduce((a, p) => a + p.x, 0) / pts2d.length;
  const cy = pts2d.reduce((a, p) => a + p.y, 0) / pts2d.length;
  const shrink = (k) => pts2d.map(p => new THREE.Vector2(cx + (p.x - cx) * k, cy + (p.y - cy) * k));
  const scale = 1 - chamfer * 2;
  const rings = [
    shrink(scale).map(p => V3(p.x, p.y, -depth / 2)),
    shrink(1).map(p => V3(p.x, p.y, -depth / 2 + chamfer)),
    shrink(1).map(p => V3(p.x, p.y, depth / 2 - chamfer)),
    shrink(scale).map(p => V3(p.x, p.y, depth / 2)),
  ];
  return loft(rings, { capStart: true, capEnd: true, closed: true });
}

/**
 * Intake / exhaust duct with genuine depth: rolled outer lip, a throat that
 * narrows going in, and a dark flat back. Normals face into the bore so it
 * reads as a hole from the front.
 */
export function ductGeo({ rx = 0.2, ry = 0.2, depth = 0.35, throat = 0.55, lip = 0.03, sides = 20, p = 2.4 } = {}) {
  const ring = (sx, sy, z) => superellipse(sides, rx * sx, ry * sy, p).map(q => V3(q.x, q.y, z));
  const rings = [
    ring(1.06, 1.06, -lip * 0.7),
    ring(1.0, 1.0, 0),
    ring(0.94, 0.94, lip * 0.6),
    ring(0.88, 0.88, depth * 0.25),
    ring(throat * 1.12, throat * 1.12, depth * 0.62),
    ring(throat, throat, depth),
    ring(throat * 0.96, throat * 0.96, depth * 1.05),
  ];
  return loft(rings, { capStart: false, capEnd: true, closed: true, flipNormals: true });
}

/** Stack of angled louvre slats — heat vents, radiator faces, gun-bay grilles. */
export function louvers({ n = 6, w = 0.3, h = 0.035, d = 0.09, gap = 0.055, tilt = -0.5, curve = 0 } = {}) {
  const geos = [];
  for (let i = 0; i < n; i++) {
    const g = chamferBox(w * (curve ? 1 - curve * Math.abs(i / (n - 1) - 0.5) * 2 : 1), h, d, h * 0.3);
    g.applyMatrix4(M.chain(M.t(0, (i - (n - 1) / 2) * gap, 0), M.rx(tilt)));
    geos.push(g.toNonIndexed());
  }
  return mergeGeometries(geos, false);
}

/** Row of recessed fasteners along a segment. Cheap, and the eye counts them. */
export function boltRow({ from = [0, 0, 0], to = [1, 0, 0], n = 6, r = 0.014, h = 0.008, sides = 6 } = {}) {
  const geos = [];
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const p = a.clone().lerp(b, t);
    const g = new THREE.CylinderGeometry(r, r * 0.82, h, sides);
    g.applyMatrix4(M.chain(M.t(p.x, p.y, p.z), M.rx(Math.PI / 2)));
    geos.push(g.toNonIndexed());
  }
  return mergeGeometries(geos, false);
}

/** Half-ellipsoid sensor blister, flat on the mounting face. */
export function blisterGeo({ rx = 0.1, ry = 0.06, rz = 0.16, seg = 14, rings = 5 } = {}) {
  const out = [];
  for (let j = 0; j <= rings; j++) {
    const v = (j / rings) * Math.PI * 0.5;
    const sy = Math.sin(v), sr = Math.cos(v);
    out.push(superellipse(seg, rx * sr, rz * sr, 2.3).map(q => V3(q.x, ry * sy, q.y)));
  }
  // the pole ring collapses; nudge it so the cap has area
  out[rings] = out[rings].map(q => V3(q.x * 0.02, ry, q.z * 0.02));
  return loft(out, { capStart: true, capEnd: true, closed: true });
}

/** Tube swept along a polyline with a variable radius. Cables, booms, barrels. */
export function tubeAlong(path, radiusFn, sides = 10, { closedEnds = true, p = 2 } = {}) {
  const up = new THREE.Vector3(0, 1, 0);
  const rings = [];
  for (let i = 0; i < path.length; i++) {
    const cur = path[i];
    const prev = path[Math.max(0, i - 1)];
    const next = path[Math.min(path.length - 1, i + 1)];
    const dir = next.clone().sub(prev).normalize();
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
    const side = new THREE.Vector3().crossVectors(Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up, dir).normalize();
    const vert = new THREE.Vector3().crossVectors(dir, side).normalize();
    const r = typeof radiusFn === 'function' ? radiusFn(i / (path.length - 1), i) : radiusFn;
    const prof = superellipse(sides, r, r, p);
    rings.push(prof.map(q => cur.clone().addScaledVector(side, q.x).addScaledVector(vert, q.y)));
  }
  return loft(rings, { capStart: closedEnds, capEnd: closedEnds, closed: true });
}

/** Thin curved shell — engine bell petals, armour scales, canopy frames. */
export function shellArc({ r = 0.3, t = 0.02, a0 = 0, a1 = Math.PI, z0 = 0, z1 = 0.3, seg = 12, taper = 1 } = {}) {
  const rings = [];
  for (const [z, k] of [[z0, 1], [z1, taper]]) {
    const outer = [], inner = [];
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (a1 - a0) * (i / seg);
      outer.push(V3(Math.cos(a) * r * k, Math.sin(a) * r * k, z));
      inner.push(V3(Math.cos(a) * (r * k - t), Math.sin(a) * (r * k - t), z));
    }
    rings.push(outer.concat(inner.reverse()));
  }
  return loft(rings, { capStart: true, capEnd: true, closed: true });
}

/** Mirror across X, fixing winding and normals so the copy is not inside-out. */
export function mirrorX(geo) {
  let g = geo.clone();
  g.applyMatrix4(M.s(-1, 1, 1));
  return _flipWinding(g);
}

export function triCount(objOrGeo) {
  let n = 0;
  const add = (g) => {
    if (!g?.attributes?.position) return;
    n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  };
  if (objOrGeo?.isBufferGeometry) add(objOrGeo);
  else objOrGeo?.traverse?.(o => { if (o.isMesh) add(o.geometry); });
  return Math.round(n);
}
