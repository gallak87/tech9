import * as T from 'three';

function clipFace(polygon, distance) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const da = distance(a),
      db = distance(b);
    if (da >= 0) result.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      result.push({
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        y: a.y + (b.y - a.y) * t,
        water: a.water + (b.water - a.water) * t,
      });
    }
  }
  return result;
}

/** Court faces follow the exact terrain triangles and a continuous shoreline.
 * The original layout1 retains its historical tiled paving below. */
export function districtCourtFaces(plan, district) {
  const { nx, nz, dx, dz, minX, minZ, heights, waterHeights } = plan.terrain;
  const radius = district.radius * 0.86;
  const point = (x, z) => {
    const i = z * (nx + 1) + x;
    return {
      x: minX + x * dx,
      z: minZ + z * dz,
      y: heights[i],
      water: waterHeights[i],
    };
  };
  const planes = Array.from({ length: 12 }, (_, i) => {
    const angle = district.yaw + (i * Math.PI) / 6;
    const x = Math.cos(angle),
      z = Math.sin(angle);
    return (p) =>
      radius * Math.cos(Math.PI / 12) -
      (p.x - district.x) * x -
      (p.z - district.z) * z;
  });
  const faces = [];
  const x0 = Math.max(0, Math.floor((district.x - radius - minX) / dx));
  const x1 = Math.min(nx, Math.ceil((district.x + radius - minX) / dx));
  const z0 = Math.max(0, Math.floor((district.z - radius - minZ) / dz));
  const z1 = Math.min(nz, Math.ceil((district.z + radius - minZ) / dz));
  for (let z = z0; z < z1; z++)
    for (let x = x0; x < x1; x++) {
      const a = point(x, z),
        b = point(x + 1, z),
        c = point(x, z + 1),
        d = point(x + 1, z + 1);
      for (const triangle of [
        [a, c, b],
        [b, c, d],
      ]) {
        let polygon = triangle;
        for (const plane of [...planes, (p) => p.y - p.water - 1]) {
          polygon = clipFace(polygon, plane);
          if (polygon.length < 3) break;
        }
        if (polygon.length >= 3) faces.push(polygon);
      }
    }
  return faces;
}

/** Borrow one Nightweir owner/material family. The caller finishes/disposes it. */
export function buildRegionEnvironment(
  plan,
  {
    owner,
    materials,
    collectSolid = null,
    clears = () => true,
    placeAssembly = () => {},
    districtCourts = false,
  } = {},
) {
  if (!owner?.solid || !owner?.block)
    throw new TypeError('Regional environment needs a Nightweir owner');
  const terrainMaterial = materials.soil ?? materials.concrete;
  const concrete = materials.concrete,
    paving = materials.paving ?? concrete;
  const metal = materials.roof ?? concrete,
    glow = materials.occupied ?? metal;
  const identity = new T.Quaternion(),
    up = new T.Vector3(0, 1, 0);
  const stats = {
    ...plan.stats,
    terrainMeshes: 0,
    waterMeshes: 0,
    assemblies: 0,
    paths: 0,
    quays: 0,
    landmarkAssemblies: 0,
    actualNear: 0,
    actualMid: 0,
    actualFar: 0,
  };
  const { nx, nz, dx, dz, minX, minZ, heights, waterHeights } = plan.terrain;
  const at = (x, z) => z * (nx + 1) + x;
  function geometryFor(chunk, water = false) {
    const width = chunk.x1 - chunk.x0 + 1,
      depth = chunk.z1 - chunk.z0 + 1;
    const positions = new Float32Array(width * depth * 3),
      uv = new Float32Array(width * depth * 2),
      normals = new Float32Array(width * depth * 3),
      indices = [];
    for (let z = 0; z < depth; z++)
      for (let x = 0; x < width; x++) {
        const index = z * width + x,
          gx = chunk.x0 + x,
          gz = chunk.z0 + z,
          y = (water ? waterHeights : heights)[at(gx, gz)];
        positions.set([minX + gx * dx, y, minZ + gz * dz], index * 3);
        uv.set([(minX + gx * dx) / 20, (minZ + gz * dz) / 20], index * 2);
        const values = water ? waterHeights : heights,
          x0 = Math.max(0, gx - 1),
          x1 = Math.min(nx, gx + 1),
          z0 = Math.max(0, gz - 1),
          z1 = Math.min(nz, gz + 1);
        const normal = new T.Vector3(
          -(values[at(x1, gz)] - values[at(x0, gz)]) / ((x1 - x0) * dx),
          1,
          -(values[at(gx, z1)] - values[at(gx, z0)]) / ((z1 - z0) * dz),
        ).normalize();
        normals.set(normal.toArray(), index * 3);
      }
    for (let z = 0; z < depth - 1; z++)
      for (let x = 0; x < width - 1; x++) {
        const gx = chunk.x0 + x,
          gz = chunk.z0 + z;
        if (
          water &&
          [
            at(gx, gz),
            at(gx + 1, gz),
            at(gx, gz + 1),
            at(gx + 1, gz + 1),
          ].every((i) => heights[i] >= waterHeights[i] - 0.05)
        )
          continue;
        const a = z * width + x,
          b = a + 1,
          c = a + width,
          d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    if (!indices.length) return null;
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new T.BufferAttribute(uv, 2));
    geometry.setAttribute('normal', new T.BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
  for (const chunk of plan.chunks) {
    const geometry = geometryFor(chunk);
    const mesh = owner.solid(
      'Regional watershed terrain / ' + chunk.id,
      geometry,
      terrainMaterial,
      { kind: 'terrain' },
      collectSolid,
    );
    mesh.userData.regionChunk = chunk.id;
    mesh.castShadow = false;
    stats.terrainMeshes++;
    const water = geometryFor(chunk, true);
    if (water) {
      const surface = owner.solid(
        'Regional river and basins / ' + chunk.id,
        water,
        materials.water,
      );
      surface.castShadow = false;
      surface.userData.regionWater = true;
      stats.waterMeshes++;
    }
  }
  const clear = (x, z, width, depth, top, yaw, bottom) =>
    plan.clears(x, z, width, depth, top, yaw, bottom) &&
    clears(x, z, width, depth, top, yaw, bottom);
  function block(
    name,
    material,
    x,
    y,
    z,
    width,
    height,
    depth,
    yaw = 0,
    collision = true,
  ) {
    if (!clear(x, z, width, depth, y + height / 2, yaw, y - height / 2))
      return false;
    owner.block(
      name,
      material,
      new T.Vector3(x, y, z),
      new T.Vector3(width, height, depth),
      yaw ? new T.Quaternion().setFromAxisAngle(up, yaw) : identity,
      collision ? collectSolid : null,
      true,
    );
    return true;
  }
  function assembly(value, landmark = false) {
    const width =
        (value.type === 'warehouse' ? 68 : value.type === 'trees' ? 28 : 34) *
        value.scale,
      height =
        (value.type === 'building' ? 72 : value.type === 'trees' ? 38 : 34) *
        value.scale,
      depth = (value.type === 'warehouse' ? 50 : 38) * value.scale;
    if (
      !clear(
        value.x,
        value.z,
        width + 16,
        depth + 16,
        value.y + height + 8,
        value.yaw,
        value.y - 15,
      )
    )
      return false;
    // A shallow, founded skirt follows the exact shared survey, not a tall
    // isolated display plinth. The kit keeps its actual doors/roofs/galleries.
    const corners = [
      [-width / 2, -depth / 2],
      [-width / 2, depth / 2],
      [width / 2, -depth / 2],
      [width / 2, depth / 2],
    ].map(([x, z]) => {
      const c = Math.cos(value.yaw),
        s = Math.sin(value.yaw);
      return plan.surfaceHeight(
        value.x + x * c - z * s,
        value.z + x * s + z * c,
      );
    });
    const bottom = Math.min(value.y, ...corners) - 2;
    block(
      'Founded district parcel',
      concrete,
      value.x,
      (bottom + value.y) / 2,
      value.z,
      width + 8,
      Math.max(2, value.y - bottom),
      depth + 8,
      value.yaw,
    );
    let lod = value.lod;
    if (lod === 'near' && stats.actualNear >= 72) lod = 'mid';
    if (lod === 'mid' && stats.actualMid >= 160) lod = 'far';
    stats[
      lod === 'near' ? 'actualNear' : lod === 'mid' ? 'actualMid' : 'actualFar'
    ]++;
    placeAssembly({ ...value, lod, foundationBottom: bottom });
    stats.assemblies++;
    if (landmark) stats.landmarkAssemblies++;
    return true;
  }
  if (districtCourts) {
    const byMaterial = new Map();
    for (const district of plan.districts) {
      const material =
        district.kind === 'garden'
          ? (materials.park ?? terrainMaterial)
          : district.kind === 'works'
            ? concrete
            : paving;
      const tile =
        plan.version >= 2
          ? `:${Math.floor(district.x / 8192)}:${Math.floor(district.z / 8192)}`
          : '';
      const key = material.name + tile;
      if (!byMaterial.has(key))
        byMaterial.set(key, {
          material,
          tile,
          positions: [],
          uv: [],
          indices: [],
        });
      const data = byMaterial.get(key);
      if (plan.version >= 2) {
        for (const face of districtCourtFaces(plan, district)) {
          const minX = Math.min(...face.map((p) => p.x)),
            maxX = Math.max(...face.map((p) => p.x));
          const minZ = Math.min(...face.map((p) => p.z)),
            maxZ = Math.max(...face.map((p) => p.z));
          const ys = face.map((p) => p.y + 0.2);
          if (
            !clear(
              (minX + maxX) / 2,
              (minZ + maxZ) / 2,
              maxX - minX,
              maxZ - minZ,
              Math.max(...ys) + 0.1,
              0,
              Math.min(...ys) - 0.1,
            )
          )
            continue;
          const first = data.positions.length / 3;
          face.forEach((p) => {
            data.positions.push(p.x, p.y + 0.2, p.z);
            data.uv.push(p.x / 16, p.z / 16);
          });
          for (let i = 1; i < face.length - 1; i++)
            data.indices.push(first, first + i, first + i + 1);
        }
        continue;
      }
      const radius = district.radius * 0.86,
        step = 24,
        c = Math.cos(district.yaw),
        sn = Math.sin(district.yaw);
      const point = (x, z) => ({
        x: district.x + x * c - z * sn,
        z: district.z + x * sn + z * c,
      });
      for (let z = -radius; z < radius; z += step)
        for (let x = -radius; x < radius; x += step) {
          if (Math.hypot(x + step / 2, z + step / 2) > radius) continue;
          const corners = [
            [x, z],
            [x + step, z],
            [x, z + step],
            [x + step, z + step],
          ].map(([px, pz]) => point(px, pz));
          const ys = corners.map((p) => plan.surfaceHeight(p.x, p.z) + 0.18);
          if (corners.some((p, i) => ys[i] < plan.waterHeight(p.x, p.z) + 1))
            continue;
          const center = point(x + step / 2, z + step / 2);
          if (
            !clear(
              center.x,
              center.z,
              step * 1.5,
              step * 1.5,
              Math.max(...ys) + 0.2,
              district.yaw,
              Math.min(...ys) - 0.2,
            )
          )
            continue;
          const first = data.positions.length / 3;
          corners.forEach((p, i) => {
            data.positions.push(p.x, ys[i], p.z);
            data.uv.push(p.x / 16, p.z / 16);
          });
          data.indices.push(
            first,
            first + 2,
            first + 1,
            first + 1,
            first + 2,
            first + 3,
          );
        }
    }
    for (const { material, tile, ...data } of byMaterial.values()) {
      if (!data.indices.length) continue;
      const geometry = new T.BufferGeometry();
      geometry.setAttribute(
        'position',
        new T.Float32BufferAttribute(data.positions, 3),
      );
      geometry.setAttribute('uv', new T.Float32BufferAttribute(data.uv, 2));
      geometry.setIndex(data.indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      owner.solid(
        'Connected district courts and occupied ward grounds' + tile,
        geometry,
        material,
        { kind: 'structure' },
        collectSolid,
      );
    }
  }
  for (const parcel of plan.parcels) assembly(parcel);
  for (const path of plan.paths.filter(
    (p) => !districtCourts || !p.id.includes('-street-'),
  )) {
    const distance = Math.hypot(path.b.x - path.a.x, path.b.z - path.a.z),
      count = Math.max(1, Math.ceil(distance / 28));
    for (let i = 0; i < count; i++) {
      const a = {
          x: T.MathUtils.lerp(path.a.x, path.b.x, i / count),
          z: T.MathUtils.lerp(path.a.z, path.b.z, i / count),
        },
        b = {
          x: T.MathUtils.lerp(path.a.x, path.b.x, (i + 1) / count),
          z: T.MathUtils.lerp(path.a.z, path.b.z, (i + 1) / count),
        };
      const ay = plan.surfaceHeight(a.x, a.z),
        by = plan.surfaceHeight(b.x, b.z),
        wa = plan.waterHeight(a.x, a.z),
        wb = plan.waterHeight(b.x, b.z),
        bridge = Math.min(ay - wa, by - wb) < 1;
      const from = new T.Vector3(
          a.x,
          bridge ? Math.max(ay, wa) + 4 : ay + 0.22,
          a.z,
        ),
        to = new T.Vector3(b.x, bridge ? Math.max(by, wb) + 4 : by + 0.22, b.z),
        tangent = to.clone().sub(from).normalize(),
        right = new T.Vector3().crossVectors(up, tangent).normalize(),
        normal = new T.Vector3().crossVectors(tangent, right),
        transform = {
          position: from.clone().add(to).multiplyScalar(0.5),
          scale: new T.Vector3(
            path.width,
            bridge ? 1.5 : 0.45,
            from.distanceTo(to),
          ),
          quaternion: new T.Quaternion().setFromRotationMatrix(
            new T.Matrix4().makeBasis(right, normal, tangent),
          ),
        },
        yaw = Math.atan2(b.x - a.x, b.z - a.z);
      if (
        !clear(
          (a.x + b.x) / 2,
          (a.z + b.z) / 2,
          path.width,
          distance / count + 2,
          Math.max(from.y, to.y) + 1,
          yaw,
          Math.min(from.y, to.y) - 2,
        )
      )
        continue;
      owner.block(
        bridge ? 'Connected canal crossing' : 'Connected civic lane',
        bridge ? concrete : paving,
        transform.position,
        transform.scale,
        transform.quaternion,
        collectSolid,
        true,
      );
      stats.paths++;
      if (bridge) {
        const x = (a.x + b.x) / 2,
          z = (a.z + b.z) / 2,
          y = (from.y + to.y) / 2,
          ground = plan.surfaceHeight(x, z);
        if (y - ground > 3)
          for (const side of [-1, 1]) {
            const px = x + Math.cos(yaw) * side * (path.width / 2 - 1),
              pz = z - Math.sin(yaw) * side * (path.width / 2 - 1);
            block(
              'Canal bridge bearing',
              concrete,
              px,
              (ground + y) / 2,
              pz,
              2.5,
              y - ground,
              3,
              yaw,
            );
          }
      }
    }
  }
  for (const basin of plan.basins) {
    if (basin.kind === 'wetland') continue;
    const count = 32;
    for (let i = 0; i < count; i++) {
      const a = (TAU * i) / count,
        b = (TAU * (i + 1)) / count;
      const from = new T.Vector3(
          basin.x + Math.cos(a) * basin.radiusX,
          basin.waterY + 3,
          basin.z + Math.sin(a) * basin.radiusZ,
        ),
        to = new T.Vector3(
          basin.x + Math.cos(b) * basin.radiusX,
          basin.waterY + 3,
          basin.z + Math.sin(b) * basin.radiusZ,
        ),
        yaw = Math.atan2(to.x - from.x, to.z - from.z),
        length = from.distanceTo(to) + 2,
        x = (from.x + to.x) / 2,
        z = (from.z + to.z) / 2;
      if (
        block(
          'Founded retaining basin edge',
          concrete,
          x,
          basin.waterY - 1,
          z,
          8,
          9,
          length,
          yaw,
        )
      ) {
        stats.quays++;
        block(
          'Continuous quay coping',
          paving,
          x,
          basin.waterY + 3.75,
          z,
          10,
          1.5,
          length,
          yaw,
        );
        if (i % 4 === 0) {
          block(
            'Shielded quay lantern',
            metal,
            x,
            basin.waterY + 8,
            z,
            0.6,
            8,
            0.6,
          );
          block(
            'Occupied quay lantern hood',
            glow,
            x,
            basin.waterY + 12,
            z,
            2.2,
            0.45,
            1.7,
            0,
            false,
          );
        }
      }
    }
  }
  const local = (mark, x, z) => ({
    x: mark.x + x * Math.cos(mark.yaw) - z * Math.sin(mark.yaw),
    z: mark.z + x * Math.sin(mark.yaw) + z * Math.cos(mark.yaw),
  });
  for (const mark of plan.landmarks) {
    if (!clear(mark.x, mark.z, 155, 125, mark.y + 115, mark.yaw, mark.y - 18))
      continue;
    // Paired occupied wings share a roofed open court: the central lane remains
    // genuinely open instead of being painted through a solid landmark block.
    for (const side of [-1, 1]) {
      const p = local(mark, side * 48, 0),
        type =
          mark.type === 'intake-hall'
            ? 'pump'
            : mark.type === 'lock-house'
              ? 'warehouse'
              : mark.type === 'garden-pavilion'
                ? 'trees'
                : 'building';
      assembly(
        {
          ...mark,
          ...p,
          type,
          scale: type === 'warehouse' ? 1 : 1.18,
          seed: mark.seed + (side > 0 ? 1 : 0),
        },
        true,
      );
      if (type === 'trees') continue;
      const q = local(mark, side * 30, 24);
      block(
        'Occupied gallery bearing',
        concrete,
        q.x,
        mark.y + 11,
        q.z,
        5,
        22,
        6,
        mark.yaw,
      );
    }
    if (mark.type !== 'garden-pavilion') {
      const p = local(mark, 0, 24);
      block(
        'Connected open-court gallery',
        concrete,
        p.x,
        mark.y + 23,
        p.z,
        112,
        3,
        18,
        mark.yaw,
      );
      block(
        'Recessed gallery roof',
        metal,
        p.x,
        mark.y + 27,
        p.z,
        116,
        1.5,
        22,
        mark.yaw,
      );
      for (const side of [-1, 1]) {
        const q = local(mark, side * 20, 24);
        block(
          'Shielded civic approach light',
          glow,
          q.x,
          mark.y + 20,
          q.z,
          10,
          1.2,
          0.5,
          mark.yaw,
          false,
        );
      }
    }
  }
  owner.group.userData.region = stats;
  return { plan, stats };
}
const TAU = Math.PI * 2;
