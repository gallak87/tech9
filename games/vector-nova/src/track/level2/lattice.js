import * as THREE from 'three';
import { sweepGeometry, roadSealGeometry } from '../geometry.js';
import { framePoint } from '../model.js';

const DESIRED_SPANS = [
  { start: 720, end: 1080, name: 'Limb magnetic lattice' },
  { start: 2912, end: 3216, name: 'Orbital overlook lattice' },
  { start: 3384, end: 3584, name: 'Horizon descent lattice' },
];
const GAPS = [
  [-11.75, -5.7],
  [-3.9, 3.9],
  [5.7, 11.75],
];
const RIB_SPACING = 32;
const RIB_WIDTH = 1.15;
const TRANSITION = 16;
const wrap = (s, length) => ((s % length) + length) % length;

export function createLatticeLayout(track) {
  // Retain the exact existing global tessellation consumed by contact shadows.
  const step = track.length / Math.ceil(track.length / 4);
  const spans = DESIRED_SPANS.map(({ start, end, name }) => ({
    start: Math.round(start / step) * step,
    end: Math.round(end / step) * step,
    name,
  }));
  const spanAt = (distance) => {
    const s = wrap(distance, track.length);
    return spans.find(({ start, end }) => s >= start && s < end);
  };
  const ribs = spans.flatMap((span) => {
    const distances = [];
    for (
      let s = span.start + TRANSITION;
      s < span.end - TRANSITION + 0.01;
      s += RIB_SPACING
    )
      distances.push(s);
    return distances;
  });
  const aperture = (span, distance) =>
    Math.max(
      0,
      Math.min(
        1,
        (distance - span.start) / TRANSITION,
        (span.end - distance) / TRANSITION,
      ),
    );
  const gapsAt = (span, distance) =>
    GAPS.map(([left, right]) => {
      const center = (left + right) / 2;
      const half = ((right - left) / 2) * aperture(span, distance);
      return [center - half, center + half];
    });
  const surfaceCoverage = (distance, lateral) => {
    if (Math.abs(lateral) > 14) return 0;
    const s = wrap(distance, track.length);
    const span = spanAt(s);
    if (!span) return 1;
    let hole = 0;
    for (const [left, right] of gapsAt(span, s)) {
      const inset = Math.min(lateral - left, right - lateral);
      hole = Math.max(hole, THREE.MathUtils.smoothstep(inset, 0, 0.14));
    }
    const nearestRib = ribs.reduce(
      (nearest, rib) => Math.min(nearest, Math.abs(rib - s)),
      Infinity,
    );
    const crossMember =
      1 -
      THREE.MathUtils.smoothstep(
        nearestRib,
        RIB_WIDTH / 2 - 0.1,
        RIB_WIDTH / 2,
      );
    return Math.max(1 - hole, crossMember);
  };
  return { step, spans, spanAt, ribs, gapsAt, surfaceCoverage };
}

// Clip in the original road triangle's (u,v) coordinates. This preserves its
// exact rendered plane through bank transitions, including the tapered mouths
// of each aperture; a separately swept runner would subtly intersect it.
function clip(polygon, boundary) {
  let result = polygon;
  for (let edge = 0; edge < boundary.length; edge += 1) {
    const a = boundary[edge],
      b = boundary[(edge + 1) % boundary.length];
    const distance = (p) =>
      (b.u - a.u) * (p.v - a.v) - (b.v - a.v) * (p.u - a.u);
    const input = result;
    result = [];
    for (let i = 0; i < input.length; i += 1) {
      const p = input[i],
        q = input[(i + 1) % input.length];
      const dp = distance(p),
        dq = distance(q);
      if (dp >= -1e-9) result.push(p);
      if (dp >= 0 !== dq >= 0) {
        const t = dp / (dp - dq);
        result.push({
          u: THREE.MathUtils.lerp(p.u, q.u, t),
          v: THREE.MathUtils.lerp(p.v, q.v, t),
          point: p.point.clone().lerp(q.point, t),
          normal: p.normal.clone().lerp(q.normal, t).normalize(),
        });
      }
    }
    if (!result.length) break;
  }
  return result;
}

export function latticeRunningGeometry(track, base, layout) {
  const positions = [],
    normals = [],
    uv = [];
  const position = base.getAttribute('position'),
    normal = base.getAttribute('normal');
  const segments = position.count / 2 - 1;
  const emit = (polygon, segment) => {
    for (let i = 1; i < polygon.length - 1; i += 1)
      for (const vertex of [polygon[0], polygon[i], polygon[i + 1]]) {
        positions.push(...vertex.point.toArray());
        normals.push(...vertex.normal.toArray());
        uv.push(vertex.u, ((segment + vertex.v) * layout.step) / 12);
      }
  };
  for (let segment = 0; segment < segments; segment += 1) {
    const s = segment * layout.step;
    const span = layout.spanAt(s + layout.step / 2);
    const vertices = [
      [0, 0, 0],
      [1, 0, 1],
      [0, 1, 2],
      [1, 1, 3],
    ].map(([u, v, offset]) => ({
      u,
      v,
      point: new THREE.Vector3().fromBufferAttribute(
        position,
        segment * 2 + offset,
      ),
      normal: new THREE.Vector3().fromBufferAttribute(
        normal,
        segment * 2 + offset,
      ),
    }));
    const triangles = [
      [0, 2, 1],
      [1, 2, 3],
    ].map((indices) => indices.map((i) => vertices[i]));
    if (!span) {
      for (const triangle of triangles) emit(triangle, segment);
      continue;
    }
    const cuts = [0, 1];
    for (const rib of layout.ribs)
      for (const edge of [-RIB_WIDTH / 2, RIB_WIDTH / 2]) {
        const v = (rib + edge - s) / layout.step;
        if (v > 0 && v < 1) cuts.push(v);
      }
    cuts.sort((a, b) => a - b);
    for (let band = 0; band < cuts.length - 1; band += 1) {
      const v0 = cuts[band],
        v1 = cuts[band + 1];
      const center = s + ((v0 + v1) / 2) * layout.step;
      const onRib = layout.ribs.some(
        (rib) => Math.abs(rib - center) <= RIB_WIDTH / 2,
      );
      const bandsAt = (v) => {
        if (onRib) return [[-14, 14]];
        const gaps = layout.gapsAt(span, s + v * layout.step);
        return [
          [-14, gaps[0][0]],
          [gaps[0][1], gaps[1][0]],
          [gaps[1][1], gaps[2][0]],
          [gaps[2][1], 14],
        ];
      };
      const begin = bandsAt(v0),
        end = bandsAt(v1);
      for (let strip = 0; strip < begin.length; strip += 1) {
        const u = (x) => (x + 14) / 28;
        const boundary = [
          { u: u(begin[strip][0]), v: v0 },
          { u: u(begin[strip][1]), v: v0 },
          { u: u(end[strip][1]), v: v1 },
          { u: u(end[strip][0]), v: v1 },
        ];
        for (const triangle of triangles)
          emit(clip(triangle, boundary), segment);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeBoundingSphere();
  return geometry;
}

export function maskedSweepGeometry(
  track,
  profile,
  layout,
  open,
  options = {},
) {
  const geometry = sweepGeometry(track, profile, { step: 4, ...options });
  const count =
    geometry.attributes.position.count / ((profile.length - 1) * 2) - 1;
  const indices = [];
  for (let face = 0; face < profile.length - 1; face += 1)
    for (let segment = 0; segment < count; segment += 1) {
      const s = ((segment + 0.5) * track.length) / count;
      if (Boolean(layout.spanAt(s)) !== open) continue;
      const offset = (face * count + segment) * 6;
      for (let i = 0; i < 6; i += 1)
        indices.push(geometry.index.getX(offset + i));
    }
  geometry.setIndex(indices);
  return geometry;
}

export function solidRoadSeals(track, base, layout) {
  const geometry = roadSealGeometry(track, base, {
    spacing: 30,
    breadth: 0.068,
    offset: 0.008,
  });
  const positions = geometry.attributes.position;
  const centers = Array.from(
    { length: Math.ceil(track.length / 15) },
    (_, i) => ({ s: i * 15, p: track.sample(i * 15).position }),
  );
  const indices = [];
  for (let i = 0; i < positions.count; i += 3) {
    const center = new THREE.Vector3();
    for (let j = 0; j < 3; j += 1)
      center.add(new THREE.Vector3().fromBufferAttribute(positions, i + j));
    center.multiplyScalar(1 / 3);
    let nearest = centers[0],
      squared = Infinity;
    for (const candidate of centers) {
      const d = candidate.p.distanceToSquared(center);
      if (d < squared) {
        squared = d;
        nearest = candidate;
      }
    }
    // Keep module seals only on uninterrupted solid decks, including a margin
    // at lattice transitions so a seal cannot appear across an aperture.
    if (
      !layout.spanAt(nearest.s) &&
      !layout.spanAt(nearest.s - 16) &&
      !layout.spanAt(nearest.s + 16)
    )
      indices.push(i, i + 1, i + 2);
  }
  geometry.setIndex(indices);
  return geometry;
}

export function latticeApertureWalls(track, layout) {
  const positions = [],
    uv = [];
  for (const span of layout.spans) {
    const count = Math.round((span.end - span.start) / layout.step);
    for (let row = 0; row < count; row += 1) {
      const a = span.start + row * layout.step;
      const b = a + layout.step;
      const gapsA = layout.gapsAt(span, a),
        gapsB = layout.gapsAt(span, b);
      for (let gap = 0; gap < gapsA.length; gap += 1)
        for (let side = 0; side < 2; side += 1) {
          const points = [
            framePoint(track.sample(a), gapsA[gap][side], -0.035),
            framePoint(track.sample(a), gapsA[gap][side], -0.7),
            framePoint(track.sample(b), gapsB[gap][side], -0.035),
            framePoint(track.sample(b), gapsB[gap][side], -0.7),
          ];
          const order = side ? [0, 2, 1, 1, 2, 3] : [0, 1, 2, 1, 3, 2];
          for (const index of order) {
            positions.push(...points[index].toArray());
            uv.push(index % 2, (index < 2 ? a : b) / 16);
          }
        }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
