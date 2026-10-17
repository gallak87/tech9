import assert from 'node:assert/strict';
import { Box3, Triangle, Vector3 } from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';

// An outer approximation: clip the exact assembly bounding box by supporting
// planes of its source convex hull. No source point is removed or displaced.
// Refinement stops only when every proxy vertex is within the measured metric
// limit of the source hull. Distance to a convex set is convex, so this vertex
// bound covers every point of the proxy's faces and interior as well.
const epsilon = 1e-9;
const unique = (points) => [
  ...new Map(
    points.map((point) => [
      point
        .toArray()
        .map((value) => value.toFixed(9))
        .join(','),
      point,
    ]),
  ).values(),
];

export function contactHullDistance(points) {
  const hull = new ConvexHull().setFromPoints(points);
  const triangles = hull.faces.map(
    ({ edge }) =>
      new Triangle(
        edge.head().point,
        edge.next.head().point,
        edge.next.next.head().point,
      ),
  );
  const nearest = new Vector3();
  return (point) => {
    if (hull.faces.every((face) => face.distanceToPoint(point) <= epsilon))
      return { distance: 0, closest: point.clone() };
    let squared = Infinity,
      closest;
    for (const triangle of triangles) {
      triangle.closestPointToPoint(point, nearest);
      const candidate = nearest.distanceToSquared(point);
      if (candidate < squared) {
        squared = candidate;
        closest = nearest.clone();
      }
    }
    return { distance: Math.sqrt(squared), closest };
  };
}

function boxFaces(points) {
  const { min, max } = new Box3().setFromPoints(points);
  const corners = Array.from(
    { length: 8 },
    (_, index) =>
      new Vector3(
        index & 1 ? max.x : min.x,
        index & 2 ? max.y : min.y,
        index & 4 ? max.z : min.z,
      ),
  );
  return [
    [0, 2, 3, 1],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 6, 7, 3],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
  ].map((indices) => indices.map((index) => corners[index]));
}

function clip(faces, normal, constant) {
  const caps = [],
    clipped = [];
  for (const face of faces) {
    const polygon = [];
    for (let index = 0; index < face.length; index++) {
      const a = face[index],
        b = face[(index + 1) % face.length];
      const da = normal.dot(a) - constant,
        db = normal.dot(b) - constant;
      if (da <= epsilon) polygon.push(a);
      if ((da < -epsilon && db > epsilon) || (da > epsilon && db < -epsilon)) {
        const intersection = a.clone().lerp(b, da / (da - db));
        polygon.push(intersection);
        caps.push(intersection);
      } else if (Math.abs(da) <= epsilon) caps.push(a);
    }
    const deduplicated = unique(polygon);
    if (deduplicated.length >= 3) clipped.push(deduplicated);
  }
  const cap = unique(caps);
  if (cap.length >= 3) {
    const center = cap
      .reduce((sum, point) => sum.add(point), new Vector3())
      .divideScalar(cap.length);
    const axis =
      Math.abs(normal.x) < 0.8 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    const u = axis.cross(normal).normalize(),
      v = normal.clone().cross(u);
    const angle = (point) =>
      Math.atan2(
        point.clone().sub(center).dot(v),
        point.clone().sub(center).dot(u),
      );
    cap.sort((a, b) => angle(a) - angle(b));
    clipped.push(cap);
  }
  return clipped;
}

export function simplifyContactHull(points, maximumExcess = 0.0095) {
  const distanceToSource = contactHullDistance(points);
  const cache = new Map();
  let faces = boxFaces(points);
  for (let iteration = 0; iteration < 512; iteration++) {
    const vertices = unique(faces.flat());
    let worst = { distance: -1 };
    for (const point of vertices) {
      const key = point
        .toArray()
        .map((value) => value.toFixed(9))
        .join(',');
      let result = cache.get(key);
      if (!result) {
        result = distanceToSource(point);
        cache.set(key, result);
      }
      if (result.distance > worst.distance) worst = { ...result, point };
    }
    if (worst.distance <= maximumExcess)
      return { points: vertices, maxExcess: worst.distance };
    const normal = worst.point.clone().sub(worst.closest).normalize();
    const constant = Math.max(...points.map((point) => normal.dot(point)));
    assert.ok(
      normal.dot(worst.point) - constant > epsilon,
      'Refinement plane must separate the worst outer vertex',
    );
    faces = clip(faces, normal, constant);
  }
  throw new Error(
    'Contact hull did not converge to its geometric excess limit',
  );
}
