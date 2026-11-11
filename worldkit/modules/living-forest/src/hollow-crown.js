import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Validate borrowed module parts before the hollow allocates any geometry. */
export function prepareHollowCrown(
  parts,
  scale,
  height,
  seed,
  materials,
  bearingOverrides,
) {
  if (parts === undefined) return null;
  if (!Array.isArray(parts))
    throw new TypeError('Living hollow crownParts must be an array');
  if (!parts.length) return { parts: [], bearings: [], growth: () => 0 };
  const bounds = new T.Box3();
  let wood = false;
  const prepared = parts.map((part) => {
    const position = part?.geometry?.attributes?.position;
    if (
      !part?.geometry?.isBufferGeometry ||
      !position ||
      position.itemSize !== 3 ||
      !['wood', 'leaf'].includes(part.kind)
    )
      throw new TypeError(
        'Living hollow crown parts require wood/leaf BufferGeometry',
      );
    for (let i = 0; i < position.count; i++)
      if (
        ![position.getX(i), position.getY(i), position.getZ(i)].every(
          Number.isFinite,
        )
      )
        throw new TypeError('Living hollow crown geometry must be finite');
    bounds.union(new T.Box3().setFromBufferAttribute(position));
    const material =
      part.material ?? (part.kind === 'wood' ? materials.bark : materials.leaf);
    if (!material?.isMaterial)
      throw new TypeError(
        'Living hollow crown parts require borrowed materials',
      );
    wood ||= part.kind === 'wood';
    return { geometry: part.geometry, material, kind: part.kind };
  });
  if (!wood)
    throw new TypeError('Living hollow crown requires a grown wood bearing');
  const size = bounds.getSize(new T.Vector3());
  if (!(bounds.max.x > 0) || !(bounds.max.y > 0))
    throw new RangeError(
      'Living hollow crown must grow outwards along +X and upwards along +Y',
    );
  // Fit against an upward-grown outward bough, not its unpitched low rise.
  const sourceRise =
    bounds.max.y * Math.cos(0.34) + bounds.max.x * Math.sin(0.34);
  scale ??= (height * 0.62) / sourceRise;
  if (!Number.isFinite(scale) || scale <= 0)
    throw new RangeError(
      'Living hollow crownScale must be positive and finite',
    );
  // A closed bearing fan has its center exactly at the authored origin.
  // Its neighboring ring measures the real root cross-section without counting
  // the first stem's forward progress as additional root radius.
  let rootRadius = 0;
  const rootSamples = new Map();
  for (const part of prepared.filter((part) => part.kind === 'wood')) {
    const p = part.geometry.attributes.position,
      index = part.geometry.index;
    const count = index?.count ?? p.count,
      at = (i) => (index ? index.getX(i) : i);
    for (let i = 0; i < count; i += 3) {
      const ids = [at(i), at(i + 1), at(i + 2)];
      if (ids.some((j) => Math.hypot(p.getX(j), p.getY(j), p.getZ(j)) < 1e-5))
        for (const j of ids) {
          rootRadius = Math.max(
            rootRadius,
            Math.hypot(p.getX(j), p.getY(j), p.getZ(j)),
          );
          const point = new T.Vector3().fromBufferAttribute(p, j);
          rootSamples.set(
            point
              .toArray()
              .map((value) => Math.round(value * 1e6))
              .join(','),
            point,
          );
        }
    }
  }
  if (!rootRadius) {
    const rootBand = Math.max(6, Math.max(size.x, size.y, size.z) * 0.14);
    const axis = new T.Vector3(bounds.max.x, bounds.max.y, 0).normalize(),
      point = new T.Vector3();
    for (const part of prepared.filter((part) => part.kind === 'wood')) {
      const p = part.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        point.fromBufferAttribute(p, i);
        if (point.length() <= rootBand)
          rootRadius = Math.max(
            rootRadius,
            point.addScaledVector(axis, -point.dot(axis)).length(),
          );
      }
    }
  }
  rootRadius = Math.max(1, rootRadius);
  if (!rootSamples.size)
    for (const part of prepared.filter((part) => part.kind === 'wood')) {
      const p = part.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const point = new T.Vector3().fromBufferAttribute(p, i);
        if (point.length() <= rootRadius * 1.3)
          rootSamples.set(point.toArray().join(','), point);
      }
    }
  const defaults = [
    [0.24, 0.74, 1.02, -0.07, 0.4],
    [1.56, 0.83, 0.86, 0.1, 0.98],
    [2.72, 0.77, 1.08, -0.09, 0.32],
    [4.06, 0.86, 0.92, 0.06, 1.12],
    [5.34, 0.79, 0.98, 0.12, 0.25],
  ].map(([angle, v, scale, splay, pitch]) => ({
    angle,
    v,
    scale,
    splay,
    pitch,
  }));
  if (bearingOverrides !== undefined && !Array.isArray(bearingOverrides))
    throw new TypeError('Living hollow crownBearings must be an array');
  const descriptors = (bearingOverrides ?? defaults).map((part) => ({
    angle: part?.angle,
    v: part?.v,
    scale: part?.scale === undefined ? 1 : part.scale,
    splay: part?.splay === undefined ? 0 : part.splay,
    pitch: part?.pitch === undefined ? 0.4 : part.pitch,
  }));
  if (
    descriptors.some(
      (part) =>
        ![part.angle, part.v, part.scale, part.splay, part.pitch].every(
          Number.isFinite,
        ) ||
        part.v <= 0 ||
        part.v >= 1 ||
        part.scale <= 0,
    )
  )
    throw new RangeError(
      'Living hollow crownBearings require finite angles, 0<v<1 and positive scales',
    );
  const bearings = descriptors.map(
    ({ angle, v, scale: size, splay, pitch }) => ({
      angle:
        angle +
        (bearingOverrides === undefined
          ? 0.035 * Math.sin(seed * 0.7 + angle * 3)
          : 0),
      v,
      scale: scale * size,
      splay,
      pitch,
      thickness: rootRadius * scale * size * 2 + 12,
      rootWidth: rootRadius * scale * size * 1.6 + 5,
    }),
  );
  return {
    parts: prepared,
    bearings,
    rootPoints: [...rootSamples.values()],
    growth(u, v, wallThickness, outerRadius) {
      let mass = 0;
      for (const bearing of bearings) {
        const dv = v - bearing.v;
        const angle = bearing.angle + bearing.splay * dv * 3;
        const du = Math.atan2(Math.sin(u - angle), Math.cos(u - angle));
        const along = Math.min(
          1,
          Math.exp(-0.5 * ((dv + 0.06) / 0.17) ** 2 + 0.5 * (0.06 / 0.17) ** 2),
        );
        const taper = 1 - T.MathUtils.smoothstep(dv, 0.06, 0.18);
        const needed = Math.max(0, bearing.thickness - wallThickness);
        const width = Math.max(
          0.11,
          Math.min(0.28, bearing.rootWidth / Math.max(80, outerRadius)),
        );
        mass = Math.max(
          mass,
          needed * Math.exp(-0.5 * (du / width) ** 2) * along * taper,
        );
      }
      return mass;
    },
  };
}

/** Own transformed geometry only; source parts and all materials are borrowed. */
export function attachHollowCrown(plan, shell, clearsRoute, insideWood) {
  const buckets = plan.parts.map(() => []),
    attachments = [],
    outputs = [];
  const unit = new T.Vector3(1, 1, 1);
  try {
    for (const bearing of plan.bearings) {
      let accepted = false;
      for (const [angleShift, lift] of [
        [0, 0],
        [0, 0.045],
        [0.09, 0.035],
        [-0.09, 0.035],
        [0, 0.085],
        [0, -0.035],
        [0.09, -0.025],
        [-0.09, -0.025],
        [0, -0.065],
      ]) {
        const angle = bearing.angle + angleShift,
          v = Math.min(0.94, bearing.v + lift),
          pair = shell(angle, v);
        const yaw = new T.Quaternion().setFromAxisAngle(
          new T.Vector3(0, 1, 0),
          -angle - bearing.splay,
        );
        const pitch = new T.Quaternion().setFromAxisAngle(
          new T.Vector3(0, 0, 1),
          bearing.pitch,
        );
        const rotation = yaw.multiply(pitch);
        for (const fraction of [0.5, 0.44, 0.56, 0.38, 0.62, 0.32, 0.68]) {
          const position = pair.inner.clone().lerp(pair.outer, fraction);
          const matrix = new T.Matrix4().compose(
            position,
            rotation,
            unit.clone().multiplyScalar(bearing.scale),
          );
          if (
            plan.rootPoints.some(
              (point) => !insideWood(point.clone().applyMatrix4(matrix)),
            )
          )
            continue;
          const copies = plan.parts.map((part) =>
            part.geometry.clone().applyMatrix4(matrix),
          );
          try {
            if (copies.some((geometry) => !clearsRoute(geometry))) continue;
            copies.forEach((geometry, i) => {
              buckets[i].push(geometry);
            });
            attachments.push({
              angle,
              v,
              scale: bearing.scale,
              position: position.toArray(),
              embedFraction: fraction,
            });
            accepted = true;
          } finally {
            if (!accepted) copies.forEach((geometry) => geometry.dispose());
          }
          if (accepted) break;
        }
        if (accepted) break;
      }
    }
    for (let i = 0; i < buckets.length; i++) {
      if (!buckets[i].length) continue;
      // Retain an indexed public skin even if the source GLB was nonindexed.
      for (const geometry of buckets[i])
        if (!geometry.index)
          geometry.setIndex(
            Array.from(
              { length: geometry.attributes.position.count },
              (_, i) => i,
            ),
          );
      const geometry = mergeGeometries(buckets[i], false);
      if (!geometry)
        throw new Error('Living hollow crown geometry could not merge');
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      outputs.push({ ...plan.parts[i], geometry });
    }
    return { parts: outputs, attachments };
  } catch (error) {
    outputs.forEach((part) => part.geometry.dispose());
    throw error;
  } finally {
    buckets.flat().forEach((geometry) => geometry.dispose());
  }
}

/** Triangle-to-polyline clearance, including intersections through triangle interiors. */
export function createCrownRouteClearance(
  route,
  radius,
  segmentDistanceSquared,
) {
  const cell = Math.max(48, radius * 2),
    grid = new Map();
  const cells = (box, visit) => {
    for (
      let x = Math.floor(box.min.x / cell);
      x <= Math.floor(box.max.x / cell);
      x++
    )
      for (
        let y = Math.floor(box.min.y / cell);
        y <= Math.floor(box.max.y / cell);
        y++
      )
        for (
          let z = Math.floor(box.min.z / cell);
          z <= Math.floor(box.max.z / cell);
          z++
        )
          visit(`${x},${y},${z}`);
  };
  for (const segment of route) {
    const a = new T.Vector3(segment.x, segment.y, segment.z),
      b = a.clone().add(new T.Vector3(segment.dx, segment.dy, segment.dz));
    const entry = {
      ...segment,
      a,
      b,
      bounds: new T.Box3().setFromPoints([a, b]).expandByScalar(radius),
    };
    cells(entry.bounds, (key) => {
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(entry);
    });
  }
  const triangle = new T.Triangle(),
    box = new T.Box3(),
    closest = new T.Vector3(),
    ray = new T.Ray(),
    hit = new T.Vector3(),
    nearby = new Set();
  return (geometry) => {
    const p = geometry.attributes.position,
      index = geometry.index;
    const count = index?.count ?? p.count,
      at = (i) => (index ? index.getX(i) : i);
    for (let i = 0; i < count; i += 3) {
      triangle.a.fromBufferAttribute(p, at(i));
      triangle.b.fromBufferAttribute(p, at(i + 1));
      triangle.c.fromBufferAttribute(p, at(i + 2));
      box.setFromPoints([triangle.a, triangle.b, triangle.c]);
      nearby.clear();
      cells(box, (key) => {
        for (const entry of grid.get(key) ?? [])
          if (entry.bounds.intersectsBox(box)) nearby.add(entry);
      });
      for (const segment of nearby) {
        if (
          triangle
            .closestPointToPoint(segment.a, closest)
            .distanceToSquared(segment.a) <
            radius * radius ||
          triangle
            .closestPointToPoint(segment.b, closest)
            .distanceToSquared(segment.b) <
            radius * radius
        )
          return false;
        for (const [a, b] of [
          [triangle.a, triangle.b],
          [triangle.b, triangle.c],
          [triangle.c, triangle.a],
        ])
          if (segmentDistanceSquared(a, b, segment) < radius * radius)
            return false;
        ray.origin.copy(segment.a);
        ray.direction.copy(segment.b).sub(segment.a).normalize();
        if (
          ray.intersectTriangle(
            triangle.a,
            triangle.b,
            triangle.c,
            false,
            hit,
          ) &&
          hit.distanceToSquared(segment.a) <= segment.lengthSquared
        )
          return false;
      }
    }
    return true;
  };
}
