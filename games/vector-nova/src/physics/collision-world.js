import * as T from 'three';
import { VEHICLE_HULL, hullAxes } from './hull.js';

export const COLLISION_RULES = Object.freeze({
  version: 1,
  angularStep: 0.025,
  skin: 0.002,
  maxContacts: 6,
  railRestitution: 0.3,
  crashRestitution: 0.16,
  crashFriction: 0.28,
  crashEnergy: 14,
});
const EPS = 1e-8;

// Continuous separating-axis sweep of a whole oriented box against a finite
// triangle. Rotation is subdivided and conservatively bounded; translation has
// no speed-dependent sampling. Faces, corners and undersides use the same query.
function sweepTriangle(shape, before, after, hull, inflation) {
  const q = before.quaternion.clone().slerp(after.quaternion, 0.5);
  const axes = hullAxes(q),
    sizes = [hull.halfWidth, hull.hover, hull.halfLength];
  const delta = after.position.clone().sub(before.position);
  const separating = [shape.normal, ...axes];
  for (const edge of shape.edges)
    for (const axis of axes) {
      const cross = edge.clone().cross(axis);
      if (cross.lengthSq() > EPS) separating.push(cross.normalize());
    }
  let enter = -Infinity,
    leave = Infinity,
    normal = null;
  let depth = Infinity,
    overlapNormal = null;
  for (const axis of separating) {
    const projections = shape.points.map((point) => point.dot(axis));
    const minimum = Math.min(...projections),
      maximum = Math.max(...projections);
    const extent = axes.reduce(
      (sum, basis, i) => sum + Math.abs(basis.dot(axis)) * sizes[i],
      inflation,
    );
    const start = before.position.dot(axis),
      speed = delta.dot(axis);
    const lower = minimum - extent,
      upper = maximum + extent;
    if (Math.abs(speed) < EPS) {
      if (start < lower - EPS || start > upper + EPS) return null;
    } else {
      let a = (lower - start) / speed,
        b = (upper - start) / speed;
      const direction = axis.clone().multiplyScalar(speed > 0 ? -1 : 1);
      if (a > b) [a, b] = [b, a];
      if (a > enter) {
        enter = a;
        normal = direction;
      }
      leave = Math.min(leave, b);
      if (enter > leave + EPS) return null;
    }
    const lowDepth = start - lower,
      highDepth = upper - start;
    const candidate = Math.min(lowDepth, highDepth);
    if (candidate < depth) {
      depth = candidate;
      overlapNormal = axis
        .clone()
        .multiplyScalar(lowDepth < highDepth ? -1 : 1);
    }
  }
  if (leave < -EPS || enter > 1 + EPS) return null;
  const fraction = Math.max(0, enter);
  if (enter < -EPS) normal = overlapNormal;
  // Tangential/separating touching triangles must not trap a bouncing hull.
  // A genuine initial penetration still produces a deterministic separation.
  if (
    fraction === 0 &&
    delta.dot(normal) >= -EPS &&
    depth <= inflation + COLLISION_RULES.skin
  )
    return null;
  const position = before.position.clone().lerp(after.position, fraction);
  const quaternion = before.quaternion
    .clone()
    .slerp(after.quaternion, fraction);
  const point = new T.Triangle(...shape.points).closestPointToPoint(
    position,
    new T.Vector3(),
  );
  return {
    fraction,
    position,
    quaternion,
    point,
    normal,
    surfaceNormal: shape.normal.clone(),
    penetration: fraction === 0 ? Math.max(0, depth) : 0,
    shape: shape.info,
  };
}

function tree(shapes) {
  const bounds = new T.Box3();
  for (const shape of shapes) bounds.union(shape.bounds);
  if (shapes.length <= 12) return { bounds, shapes };
  const size = bounds.getSize(new T.Vector3());
  const axis =
    size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
  shapes.sort((a, b) => a.center[axis] - b.center[axis] || a.order - b.order);
  const middle = shapes.length >> 1;
  return {
    bounds,
    left: tree(shapes.slice(0, middle)),
    right: tree(shapes.slice(middle)),
  };
}
function candidates(node, bounds, result) {
  if (!node.bounds.intersectsBox(bounds)) return;
  if (node.shapes) {
    for (const shape of node.shapes)
      if (shape.bounds.intersectsBox(bounds)) result.push(shape);
  } else {
    candidates(node.left, bounds, result);
    candidates(node.right, bounds, result);
  }
}

// Level factories provide asset-free triangle data. The immutable world owns
// only its acceleration index, never a racer state or presentation resources.
export function createCollisionWorld({ id, version, geometryId, triangles }) {
  if (
    !id ||
    !Number.isInteger(version) ||
    !geometryId ||
    !Array.isArray(triangles)
  )
    throw new Error(
      'Collision world requires identity and authored triangles.',
    );
  const shapes = [];
  for (const [order, triangle] of triangles.entries()) {
    const range =
      Number.isFinite(triangle.start) &&
      Number.isFinite(triangle.end) &&
      triangle.end > triangle.start;
    if (
      typeof triangle.id !== 'string' ||
      !triangle.id ||
      !['deck', 'rail', 'terrain', 'structure'].includes(triangle.kind) ||
      (triangle.kind === 'deck' && !range) ||
      (triangle.kind === 'rail' &&
        !range &&
        !Number.isFinite(triangle.distance))
    )
      throw new Error('Invalid collision surface metadata.');
    const points = triangle.points.map((point) => new T.Vector3(...point));
    if (
      points.length !== 3 ||
      points.some((point) => !point.toArray().every(Number.isFinite))
    )
      throw new Error('Invalid collision triangle.');
    const edges = [
      points[1].clone().sub(points[0]),
      points[2].clone().sub(points[1]),
      points[0].clone().sub(points[2]),
    ];
    const normal = edges[0].clone().cross(edges[1]);
    if (normal.lengthSq() < EPS) continue;
    const bounds = new T.Box3().setFromPoints(points);
    shapes.push({
      points,
      edges,
      normal: normal.normalize(),
      bounds,
      center: bounds.getCenter(new T.Vector3()),
      order,
      info: Object.freeze({ ...triangle, points: undefined, order }),
    });
  }
  let root = tree([...shapes]);
  return Object.freeze({
    id,
    version,
    rulesId: `${geometryId}:${JSON.stringify(COLLISION_RULES)}`,
    triangleCount: shapes.length,
    // The dynamics backend consumes these validated, immutable authored vertices.
    // Preserve triangle order so a trimesh subshape maps back to route metadata.
    triangles: Object.freeze(
      shapes.map((shape) =>
        Object.freeze({
          ...shape.info,
          points: Object.freeze(
            shape.points.map((point) => Object.freeze(point.toArray())),
          ),
        }),
      ),
    ),
    sweepHull(before, after, hull = VEHICLE_HULL) {
      if (!root) return null;
      const radius = Math.hypot(hull.halfWidth, hull.hover, hull.halfLength);
      const bounds = new T.Box3()
        .setFromPoints([before.position, after.position])
        .expandByScalar(radius + COLLISION_RULES.skin);
      const nearby = [];
      candidates(root, bounds, nearby);
      const angle = before.quaternion.angleTo(after.quaternion);
      const count = Math.max(1, Math.ceil(angle / COLLISION_RULES.angularStep));
      const inflation =
        2 * radius * Math.sin(angle / count / 4) + COLLISION_RULES.skin;
      for (let i = 0; i < count; i++) {
        const at = (t) => ({
          position: before.position.clone().lerp(after.position, t),
          quaternion: before.quaternion.clone().slerp(after.quaternion, t),
        });
        const a = at(i / count),
          b = at((i + 1) / count);
        let first = null;
        for (const shape of nearby) {
          const hit = sweepTriangle(shape, a, b, hull, inflation);
          if (
            hit &&
            (!first ||
              hit.fraction < first.fraction - EPS ||
              (Math.abs(hit.fraction - first.fraction) <= EPS &&
                shape.order < first.shape.order))
          )
            first = hit;
        }
        if (first) return { ...first, fraction: (i + first.fraction) / count };
      }
      return null;
    },
    dispose() {
      root = null;
    },
  });
}

export function indexedTriangles(positions, indices, info, matrix = null) {
  const points = [];
  for (let i = 0; i < positions.length; i += 3) {
    const point = new T.Vector3().fromArray(positions, i);
    if (matrix) point.applyMatrix4(matrix);
    points.push(point.toArray());
  }
  return Array.from({ length: indices.length / 3 }, (_, i) => ({
    ...info,
    points: [
      points[indices[i * 3]],
      points[indices[i * 3 + 1]],
      points[indices[i * 3 + 2]],
    ],
  }));
}
