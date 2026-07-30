import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Geometry toolkit. Hulls, wings and canopies are *lofted* from cross-sections
// rather than assembled from primitives — that is the difference between a
// shape that reads as a modelled aircraft and one that reads as stacked boxes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loft a tube through a list of rings.
 * @param {Array<Array<THREE.Vector3>>} rings equal-length point loops, ordered
 * @param {object} opts capStart/capEnd, closed (loop the ring), smooth normals
 */
export function loft(rings, { capStart = true, capEnd = true, closed = true, uvScale = [1, 1], flipNormals = false } = {}) {
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
      uvs.push((i / segs) * uvScale[0], (vAt[j] / vTotal) * uvScale[1]);
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

/** Bevelled box with proper hard-ish normals — good for greebles and panels. */
export function bevelBox(w, h, d, r = 0.06, seg = 3) {
  const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  void seg; void r;
  return g;
}

/** Ring of instanced greeble boxes around a cylinder — engine detail, hull vents. */
export function greebleRing({ count = 12, radius = 1, z = 0, size = [0.12, 0.06, 0.3], jitter = 0, rng = null }) {
  const geos = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const j = rng ? (rng.next() - 0.5) * jitter : 0;
    const g = new THREE.BoxGeometry(size[0], size[1], size[2] * (1 + j));
    const m = new THREE.Matrix4()
      .makeRotationZ(a)
      .multiply(new THREE.Matrix4().makeTranslation(0, radius, z));
    g.applyMatrix4(m);
    geos.push(g);
  }
  return mergeGeometries(geos, false);
}

/** Merge a list of [geometry, matrix] pairs into one buffer geometry. */
export function assemble(parts) {
  const geos = parts.map(([g, m]) => {
    const c = g.clone();
    if (m) c.applyMatrix4(m);
    if (!c.attributes.uv) {
      const n = c.attributes.position.count;
      c.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2).fill(0.5), 2));
    }
    if (!c.attributes.normal) c.computeVertexNormals();
    return c.index ? c : c.toNonIndexed();
  });
  const norm = geos.map(g => g.index ? g.toNonIndexed() : g);
  const merged = mergeGeometries(norm, false);
  merged.computeVertexNormals();
  return merged;
}

export const M = {
  t: (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z),
  rx: (a) => new THREE.Matrix4().makeRotationX(a),
  ry: (a) => new THREE.Matrix4().makeRotationY(a),
  rz: (a) => new THREE.Matrix4().makeRotationZ(a),
  s: (x, y = x, z = x) => new THREE.Matrix4().makeScale(x, y, z),
  chain: (...ms) => ms.reduce((acc, m) => acc.multiply(m), new THREE.Matrix4()),
};
