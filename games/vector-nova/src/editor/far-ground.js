import * as T from 'three';

/** Land beyond the surveyed rectangle, joined to its exact retained edge.
 * The centre stays open: the surveyed terrain owns every interior surface. */
export function createFarGroundGeometry(plan, { size = 200000 } = {}) {
  const { nx, nz, dx, dz, minX, minZ, heights } = plan.terrain;
  if (
    !Number.isInteger(nx) ||
    !Number.isInteger(nz) ||
    nx < 1 ||
    nz < 1 ||
    ![dx, dz, minX, minZ, plan.seaLevel, size].every(Number.isFinite) ||
    dx <= 0 ||
    dz <= 0 ||
    size <= 0 ||
    heights.length !== (nx + 1) * (nz + 1)
  )
    throw new TypeError(
      'Exterior land needs a finite rectangular terrain grid',
    );
  const width = nx * dx,
    depth = nz * dz,
    cx = minX + width / 2,
    cz = minZ + depth / 2,
    hx = Math.max(size / 2, width / 2 + dx),
    hz = Math.max(size / 2, depth / 2 + dz),
    outerMinX = cx - hx,
    outerMinZ = cz - hz,
    outerWidth = 2 * hx,
    outerDepth = 2 * hz,
    floor = plan.seaLevel - 28,
    perimeter = [];
  for (let x = 0; x < nx; x++) perimeter.push([x, 0, x / nx, 0]);
  for (let z = 0; z < nz; z++) perimeter.push([nx, z, 1, z / nz]);
  for (let x = nx; x > 0; x--) perimeter.push([x, nz, x / nx, 1]);
  for (let z = nz; z > 0; z--) perimeter.push([0, z, 0, z / nz]);
  const count = perimeter.length,
    positions = new Float32Array(count * 2 * 3),
    normals = new Float32Array(positions.length),
    uv = new Float32Array(count * 2 * 2),
    indices = [],
    normal = new T.Vector3(),
    at = (x, z) => z * (nx + 1) + x;
  for (let i = 0; i < count; i++) {
    const [gx, gz, u, v] = perimeter[i],
      x = minX + gx * dx,
      z = minZ + gz * dz,
      y = heights[at(gx, gz)],
      x0 = Math.max(0, gx - 1),
      x1 = Math.min(nx, gx + 1),
      z0 = Math.max(0, gz - 1),
      z1 = Math.min(nz, gz + 1),
      ox = outerMinX + u * outerWidth,
      oz = outerMinZ + v * outerDepth;
    if (!Number.isFinite(y))
      throw new TypeError('Exterior land needs finite terrain edge heights');
    positions.set([x, y, z], i * 3);
    positions.set([ox, floor, oz], (count + i) * 3);
    normal
      .set(
        -(heights[at(x1, gz)] - heights[at(x0, gz)]) / ((x1 - x0) * dx),
        1,
        -(heights[at(gx, z1)] - heights[at(gx, z0)]) / ((z1 - z0) * dz),
      )
      .normalize();
    normals.set(normal.toArray(), i * 3);
    normals.set([0, 1, 0], (count + i) * 3);
    uv.set([x / 20, z / 20], i * 2);
    uv.set([ox / 20, oz / 20], (count + i) * 2);
    const next = (i + 1) % count;
    indices.push(i, next, count + next, i, count + next, count + i);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new T.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new T.BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
