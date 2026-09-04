import * as THREE from 'three';
import { loft, superellipse } from '../render/geobuild.js';

// ─────────────────────────────────────────────────────────────────────────────
// Lofted body shapes.
//
// This file exists because the first rig was built from exactly one primitive —
// a tapered box — and a character made of stacked rectangles cannot be tuned
// into a character. Snap, tone bands and palette are all downstream of the
// silhouette.
//
// The fix is `superellipse`, lifted from the Arwing (src/render/geobuild.js):
// a cross-section whose `p` exponent IS the box↔round knob.
//
//   p = 2.0   ellipse            p = 3.2   soft rounded rectangle
//   p = 4.0   rounded rectangle  p → ∞     the box we are escaping
//
// A body part is a stack of those cross-sections lofted together, so a limb
// tapers, a torso has a waist, and a hip is wider than the waist above it —
// none of which a box can express at any parameter.
//
// `mergeParts` in rig.js wants plain {pos, nor, idx} arrays rather than a
// BufferGeometry, so everything here ends in `raw()`. Local space matches
// prism()'s: +Y up the bone, the origin at the joint.
// ─────────────────────────────────────────────────────────────────────────────

/** BufferGeometry → the {pos,nor,idx} shape mergeParts consumes. */
function raw(g) {
  if (!g.attributes.normal) g.computeVertexNormals();
  return {
    pos: Array.from(g.attributes.position.array),
    nor: Array.from(g.attributes.normal.array),
    idx: Array.from(g.index.array),
  };
}

/**
 * Loft a stack of superellipse cross-sections up the bone's local +Y.
 *
 * @param {Array<{y:number, rx:number, rz?:number, p?:number, x?:number, z?:number, squash?:number}>} stations
 *        Ordered bottom to top. `rx`/`rz` are half-extents in metres, `p` the
 *        roundness exponent, `x`/`z` an offset that lets a station lean — which
 *        is how a shoulder slopes and a boot's toe box pushes forward.
 * @param {object} o  sides: cross-section resolution. 10 is plenty at the
 *        distances this game renders; the whole body is ~48 virtual rows tall.
 */
export function limb(stations, { sides = 10, capStart = true, capEnd = true } = {}) {
  const rings = stations.map((s) => {
    const ring = superellipse(sides, s.rx, s.rz ?? s.rx, s.p ?? 3.2, { squash: s.squash ?? 1 });
    // superellipse works in its own XY; the body's cross-section is XZ.
    return ring.map((v) => new THREE.Vector3(v.x + (s.x || 0), s.y, v.y + (s.z || 0)));
  });
  return raw(loft(rings, { capStart, capEnd, closed: true }));
}

/**
 * A flat-ish slab with rounded corners — hair masses, a fringe, a jacket lapel,
 * a belt. Same loft, just authored as width/depth/thickness rather than radii,
 * because that is how you think about a slab.
 */
export function slab({ y0, y1, w, d, w1 = w, d1 = d, x = 0, z = 0, x1 = x, z1 = z, p = 4.0, sides = 8 }) {
  return limb([
    { y: y0, rx: w / 2, rz: d / 2, p, x, z },
    { y: y1, rx: w1 / 2, rz: d1 / 2, p, x: x1, z: z1 },
  ], { sides });
}

/**
 * A tapered spike that closes to a point — hair tips, a blade, a crest.
 * The tip ring collapses to a single radius rather than a cap, so the silhouette
 * ends in a point instead of a flat facet you can see from the side.
 */
export function spike({ y0, y1, rx, rz = rx, x = 0, z = 0, x1 = x, z1 = z, p = 2.8, tip = 0.004, sides = 6, mid = null }) {
  const st = [{ y: y0, rx, rz, p, x, z }];
  if (mid) st.push({ y: y0 + (y1 - y0) * (mid.at ?? 0.5), rx: rx * mid.k, rz: rz * mid.k, p, x: (x + x1) / 2, z: (z + z1) / 2 });
  st.push({ y: y1, rx: tip, rz: tip, p, x: x1, z: z1 });
  return limb(st, { sides });
}
