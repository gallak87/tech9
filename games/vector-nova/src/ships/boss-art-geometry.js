import {
  Box3,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

const MAX_TRIANGLES = 5000;
const MAX_PLANES = 64;
const key = (point) =>
  `${Math.fround(point.x)},${Math.fround(point.y)},${Math.fround(point.z)}`;

function sourcePoints(vertices) {
  if (
    (!Array.isArray(vertices) && !ArrayBuffer.isView(vertices)) ||
    vertices.length < 12 ||
    vertices.length % 3 ||
    !Array.from(vertices).every(Number.isFinite)
  )
    throw new Error('A boss part needs finite metre-space convex vertices');
  const points = [];
  for (let i = 0; i < vertices.length; i += 3)
    points.push(new Vector3(vertices[i], vertices[i + 1], vertices[i + 2]));
  const bounds = new Box3().setFromPoints(points);
  const size = bounds.getSize(new Vector3());
  const tolerance = Math.max(size.length() * 1e-9, 1e-10);
  const first = points[0],
    second = points.find((point) => point.distanceTo(first) > tolerance);
  const along = second?.clone().sub(first);
  const third =
    along &&
    points.find(
      (point) =>
        along.clone().cross(point.clone().sub(first)).length() > tolerance ** 2,
    );
  const normal =
    third && along.clone().cross(third.clone().sub(first)).normalize();
  if (
    !normal ||
    !points.some(
      (point) => Math.abs(normal.dot(point.clone().sub(first))) > tolerance,
    )
  )
    throw new Error('A boss part must enclose a nonzero convex volume');
  return { points, bounds, size, tolerance };
}

function planesOf(geometry, tolerance) {
  const positions = geometry.attributes.position;
  const planes = [];
  for (let i = 0; i < positions.count; i += 3) {
    const a = new Vector3().fromBufferAttribute(positions, i);
    const b = new Vector3().fromBufferAttribute(positions, i + 1);
    const c = new Vector3().fromBufferAttribute(positions, i + 2);
    const normal = b.sub(a).cross(c.sub(a)).normalize();
    const constant = normal.dot(a);
    if (
      !planes.some(
        (plane) =>
          plane.normal.dot(normal) > 1 - 1e-7 &&
          Math.abs(plane.constant - constant) < tolerance * 20,
      )
    )
      planes.push({ normal, constant });
  }
  if (planes.length > MAX_PLANES)
    throw new Error(
      'Split a complex boss assembly into simpler convex parts before beveling',
    );
  return planes;
}

function insetVertices(planes, radius, tolerance) {
  const vertices = [];
  for (let i = 0; i < planes.length - 2; i++)
    for (let j = i + 1; j < planes.length - 1; j++)
      for (let k = j + 1; k < planes.length; k++) {
        const a = planes[i],
          b = planes[j],
          c = planes[k];
        const bc = b.normal.clone().cross(c.normal);
        const determinant = a.normal.dot(bc);
        if (Math.abs(determinant) < 1e-8) continue;
        const point = bc
          .multiplyScalar(a.constant - radius)
          .addScaledVector(
            c.normal.clone().cross(a.normal),
            b.constant - radius,
          )
          .addScaledVector(
            a.normal.clone().cross(b.normal),
            c.constant - radius,
          )
          .divideScalar(determinant);
        if (
          !planes.every(
            (plane) =>
              plane.normal.dot(point) <=
              plane.constant - radius + tolerance * 40,
          )
        )
          continue;
        if (
          !vertices.some(
            (other) => other.distanceToSquared(point) < (tolerance * 20) ** 2,
          )
        )
          vertices.push(point);
      }
  return vertices;
}

function roundedPoints(inner, planes, radius, segments, tolerance) {
  const points = [],
    normals = new Map();
  const add = (point, direction) => {
    if (direction.lengthSq() < 1e-12) return;
    const normal = direction.clone().normalize();
    const outer = point.clone().addScaledVector(normal, radius);
    const id = key(outer);
    if (normals.has(id)) {
      normals.get(id).add(normal).normalize();
      return;
    }
    points.push(outer);
    normals.set(id, normal);
  };
  for (const point of inner) {
    const incident = planes
      .filter(
        (plane) =>
          Math.abs(plane.normal.dot(point) - plane.constant + radius) <
          tolerance * 80,
      )
      .map((plane) => plane.normal);
    for (const normal of incident) add(point, normal);
    // Circular fillets around true edges, tangent to each unchanged flat face.
    for (let i = 0; i < incident.length; i++)
      for (let j = i + 1; j < incident.length; j++)
        for (let step = 1; step < segments; step++)
          add(point, incident[i].clone().lerp(incident[j], step / segments));
    // Spherical corner patches sample the incident outward normal cone.
    for (let i = 0; i < incident.length - 2; i++)
      for (let j = i + 1; j < incident.length - 1; j++)
        for (let k = j + 1; k < incident.length; k++)
          for (let a = 1; a < segments; a++)
            for (let b = 1; b < segments - a; b++) {
              const c = segments - a - b;
              add(
                point,
                incident[i]
                  .clone()
                  .multiplyScalar(a)
                  .addScaledVector(incident[j], b)
                  .addScaledVector(incident[k], c),
              );
            }
  }
  return { points, normals };
}

function roundedGeometry(inner, planes, radius, segments, tolerance) {
  for (let steps = segments; steps >= 1; steps--) {
    const sample = roundedPoints(inner, planes, radius, steps, tolerance);
    if (sample.points.length > (MAX_TRIANGLES + 4) / 2) continue;
    const geometry = new ConvexGeometry(sample.points);
    if (geometry.attributes.position.count / 3 > MAX_TRIANGLES) {
      geometry.dispose();
      continue;
    }
    const positions = geometry.attributes.position,
      normals = [];
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const normal = sample.normals.get(
        key(new Vector3().fromBufferAttribute(positions, vertex)),
      );
      if (!normal) {
        geometry.dispose();
        throw new Error('Rounded boss surface lost its analytic fillet normal');
      }
      normals.push(normal.x, normal.y, normal.z);
    }
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    return { geometry, segments: steps };
  }
  throw new Error('Rounded boss part exceeds its triangle budget');
}

function metreBoxUVs(geometry) {
  const positions = geometry.attributes.position,
    uv = [];
  for (let face = 0; face < positions.count; face += 3) {
    const a = new Vector3().fromBufferAttribute(positions, face);
    const b = new Vector3().fromBufferAttribute(positions, face + 1);
    const c = new Vector3().fromBufferAttribute(positions, face + 2);
    const normal = b.sub(a).cross(c.sub(a)).normalize();
    const x = Math.abs(normal.x),
      y = Math.abs(normal.y),
      z = Math.abs(normal.z);
    for (let i = 0; i < 3; i++) {
      const point = new Vector3().fromBufferAttribute(positions, face + i);
      if (x >= y && x >= z)
        uv.push(normal.x >= 0 ? -point.z : point.z, point.y);
      else if (y >= z) uv.push(point.x, normal.y >= 0 ? -point.z : point.z);
      else uv.push(normal.z >= 0 ? point.x : -point.x, point.y);
    }
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
}

/** New owned geometry only; never mutates the source contact vertices. */
export function createBeveledBossPart(
  vertices,
  { radius = 0.08, segments = 3 } = {},
) {
  if (
    !Number.isFinite(radius) ||
    radius < 0 ||
    !Number.isInteger(segments) ||
    segments < 1 ||
    segments > 6
  )
    throw new Error(
      'Boss bevel needs a nonnegative finite radius and 1–6 segments',
    );
  const source = sourcePoints(vertices);
  const base = new ConvexGeometry(source.points);
  let geometry = base,
    actualRadius = Math.min(
      radius,
      Math.min(source.size.x, source.size.y, source.size.z) * 0.2,
    ),
    actualSegments = 0;
  try {
    if (actualRadius > source.tolerance * 100) {
      const planes = planesOf(base, source.tolerance);
      let inner = [];
      for (let attempt = 0; attempt < 16; attempt++) {
        inner = insetVertices(planes, actualRadius, source.tolerance);
        if (inner.length >= 4) break;
        actualRadius *= 0.5;
      }
      if (inner.length < 4)
        throw new Error(
          'Boss bevel could not retain a finite inner convex body',
        );
      const rounded = roundedGeometry(
        inner,
        planes,
        actualRadius,
        segments,
        source.tolerance,
      );
      geometry = rounded.geometry;
      actualSegments = rounded.segments;
    } else actualRadius = 0;
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    const scale = source.size.clone().divide(bounds.getSize(new Vector3()));
    const translation = source.bounds
      .getCenter(new Vector3())
      .sub(bounds.getCenter(new Vector3()).multiply(scale));
    // A rounded pointed extremum can shrink a little. Fit the original metre
    // envelope without moving the collision source; transform normals properly.
    geometry.applyMatrix4(
      new Matrix4().compose(translation, new Quaternion(), scale),
    );
    metreBoxUVs(geometry);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData.bossBevel = {
      radius: actualRadius,
      segments: actualSegments,
      sourceBounds: {
        min: source.bounds.min.toArray(),
        max: source.bounds.max.toArray(),
      },
      uvMetres: true,
    };
    if (geometry !== base) base.dispose();
    return geometry;
  } catch (error) {
    if (geometry !== base) geometry.dispose();
    base.dispose();
    throw error;
  }
}
