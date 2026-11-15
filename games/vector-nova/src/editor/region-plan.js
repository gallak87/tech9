// A saved environment seed surveys one complete occupied watershed. Road inputs
// reserve space; they never become scenery placements or change during planning.
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;
function randomFor(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let v = Math.imul(state ^ (state >>> 15), 1 | state);
    v ^= v + Math.imul(v ^ (v >>> 7), 61 | v);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(x, z, seed) {
  let n = Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(z | 0, 0x5f356495) ^ seed;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function noise(x, z, scale, seed) {
  const a = Math.floor(x / scale),
    b = Math.floor(z / scale),
    fx = smooth(x / scale - a),
    fz = smooth(z / scale - b);
  return lerp(
    lerp(hash(a, b, seed), hash(a + 1, b, seed), fx),
    lerp(hash(a, b + 1, seed), hash(a + 1, b + 1, seed), fx),
    fz,
  );
}
function routeSurvey(track) {
  if (!track) return [];
  const count = Math.ceil(track.length / 12);
  return Array.from({ length: count + 1 }, (_, i) => {
    const distance = Math.min(track.length, i * 12),
      frame = track.sample(distance),
      jump = Boolean(track.isJumpProtected?.(distance));
    const right = frame.right ?? { x: 1, y: 0, z: 0 },
      up = frame.up ?? { x: 0, y: 1, z: 0 },
      tangent = frame.tangent ?? { x: 0, y: 0, z: 1 };
    const half = track.width / 2 + (jump ? 58 : 28),
      vertical = jump ? 90 : 34;
    return {
      distance,
      x: frame.position.x,
      y: frame.position.y,
      z: frame.position.z,
      jump,
      halfX:
        Math.abs(right.x) * half +
        Math.abs(up.x) * vertical +
        Math.abs(tangent.x) * 18,
      halfZ:
        Math.abs(right.z) * half +
        Math.abs(up.z) * vertical +
        Math.abs(tangent.z) * 18,
      minY:
        frame.position.y -
        (Math.abs(right.y) * half +
          Math.abs(up.y) * vertical +
          Math.abs(tangent.y) * 18) -
        10,
      maxY: jump
        ? Infinity
        : frame.position.y +
          Math.abs(right.y) * half +
          Math.abs(up.y) * vertical +
          Math.abs(tangent.y) * 18 +
          10,
    };
  });
}
function reservations(samples) {
  const spacing = 128,
    cells = new Map();
  for (const p of samples)
    for (
      let x = Math.floor((p.x - p.halfX) / spacing);
      x <= Math.floor((p.x + p.halfX) / spacing);
      x++
    )
      for (
        let z = Math.floor((p.z - p.halfZ) / spacing);
        z <= Math.floor((p.z + p.halfZ) / spacing);
        z++
      ) {
        const key = x + ':' + z;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(p);
      }
  function overlaps(x, z, halfX, halfZ) {
    const found = new Set();
    for (
      let i = Math.floor((x - halfX) / spacing);
      i <= Math.floor((x + halfX) / spacing);
      i++
    )
      for (
        let j = Math.floor((z - halfZ) / spacing);
        j <= Math.floor((z + halfZ) / spacing);
        j++
      )
        for (const p of cells.get(i + ':' + j) ?? [])
          if (
            Math.abs(x - p.x) <= halfX + p.halfX &&
            Math.abs(z - p.z) <= halfZ + p.halfZ
          )
            found.add(p);
    return found;
  }
  return { overlaps, cellCount: cells.size };
}
function projection(samples) {
  if (!samples.length)
    return { x: 0, z: 0, y: 0, cos: 1, sin: 0, du: 0, dv: 0 };
  const x = samples.reduce((n, p) => n + p.x, 0) / samples.length,
    z = samples.reduce((n, p) => n + p.z, 0) / samples.length,
    y = samples.reduce((n, p) => n + p.y, 0) / samples.length;
  let xx = 0,
    zz = 0,
    xz = 0,
    xy = 0,
    zy = 0;
  for (const p of samples) {
    const dx = p.x - x,
      dz = p.z - z;
    xx += dx * dx;
    zz += dz * dz;
    xz += dx * dz;
    xy += dx * (p.y - y);
    zy += dz * (p.y - y);
  }
  const angle = 0.5 * Math.atan2(2 * xz, xx - zz),
    det = xx * zz - xz * xz;
  const gx = det > 1 ? clamp((xy * zz - zy * xz) / det, -0.16, 0.16) : 0,
    gz = det > 1 ? clamp((zy * xx - xy * xz) / det, -0.16, 0.16) : 0;
  return {
    x,
    z,
    y,
    cos: Math.cos(angle),
    sin: Math.sin(angle),
    du: gx,
    dv: gz,
  };
}
function minimumTree(nodes) {
  if (!nodes.length) return [];
  const connected = new Set([0]),
    result = [];
  while (connected.size < nodes.length) {
    let best;
    for (const a of connected)
      for (let b = 0; b < nodes.length; b++)
        if (!connected.has(b)) {
          const distance = Math.hypot(
            nodes[a].x - nodes[b].x,
            nodes[a].z - nodes[b].z,
          );
          if (!best || distance < best.distance) best = { a, b, distance };
        }
    result.push(best);
    connected.add(best.b);
  }
  return result;
}
export const REGION_LIMITS = Object.freeze({
  axisCells: 160,
  chunkCells: 32,
  districts: 42,
  parcels: 640,
  landmarks: 12,
});
export function createRegionPlan(doc, track = null) {
  const seed = (doc.environment?.seed ?? doc.generator?.seed ?? 7) >>> 0,
    preset = doc.settings?.sceneryPreset ?? 'waterfront',
    density = doc.settings?.density ?? 0.82,
    sea = doc.settings?.waterLevel ?? -28;
  const random = randomFor(seed ^ 0x72656731),
    samples = routeSurvey(track),
    reserve = reservations(samples),
    basis = projection(samples);
  const margin = 1450 + random() * 400;
  const minX = samples.length
      ? Math.min(...samples.map((p) => p.x)) - margin
      : -1900,
    maxX = samples.length
      ? Math.max(...samples.map((p) => p.x)) + margin
      : 1900;
  const minZ = samples.length
      ? Math.min(...samples.map((p) => p.z)) - margin
      : -1900,
    maxZ = samples.length
      ? Math.max(...samples.map((p) => p.z)) + margin
      : 1900;
  const bounds = {
    min: { x: minX, y: sea - 45, z: minZ },
    max: { x: maxX, y: Math.max(220, basis.y + 180), z: maxZ },
  };
  const width = maxX - minX,
    depth = maxZ - minZ;
  const nx = Math.min(
      REGION_LIMITS.axisCells,
      Math.max(24, Math.ceil(width / 125)),
    ),
    nz = Math.min(
      REGION_LIMITS.axisCells,
      Math.max(24, Math.ceil(depth / 125)),
    ),
    dx = width / nx,
    dz = depth / nz;
  const project = (x, z) => ({
    u: (x - basis.x) * basis.cos + (z - basis.z) * basis.sin,
    v: -(x - basis.x) * basis.sin + (z - basis.z) * basis.cos,
  });
  const unproject = (u, v) => ({
    x: basis.x + u * basis.cos - v * basis.sin,
    z: basis.z + u * basis.sin + v * basis.cos,
  });
  const datum = (x, z) =>
    Math.max(
      sea + 12,
      (samples.length ? basis.y - 90 : sea + 30) +
        basis.du * (x - basis.x) +
        basis.dv * (z - basis.z),
    );
  const phase = random() * TAU,
    phase2 = random() * TAU;
  const channelWidth =
    preset === 'industrial' ? 150 : preset === 'reclaimed' ? 235 : 185;
  const channelOffset = (random() - 0.5) * Math.min(width, depth) * 0.24;
  const riverV = (u) =>
    channelOffset +
    Math.sin(u / 1100 + phase) * 240 +
    Math.sin(u / 2700 + phase2) * 310;
  const basins = [];
  const baseWaterAt = (x, z) => Math.max(sea, datum(x, z) - 24);
  const waterAt = (x, z) => {
    let y = baseWaterAt(x, z);
    for (const basin of basins) {
      const distance = Math.hypot(
        (x - basin.x) / basin.radiusX,
        (z - basin.z) / basin.radiusZ,
      );
      if (distance < 1.4)
        y = lerp(y, basin.waterY, 1 - smooth((distance - 1) / 0.4));
    }
    return y;
  };
  const uExtent = Math.max(width, depth) * 0.52;
  for (let i = 0; i < 5; i++) {
    const u =
        lerp(-uExtent * 0.75, uExtent * 0.75, (i + 0.5) / 5) +
        (random() - 0.5) * 250,
      v = riverV(u) + (i % 2 ? -1 : 1) * (250 + random() * 250),
      p = unproject(u, v);
    if (
      p.x < minX + 250 ||
      p.x > maxX - 250 ||
      p.z < minZ + 250 ||
      p.z > maxZ - 250
    )
      continue;
    basins.push({
      id: 'basin-' + i,
      ...p,
      u,
      v,
      radiusX: 180 + random() * 190,
      radiusZ: 130 + random() * 140,
      waterY: baseWaterAt(p.x, p.z),
      kind: preset === 'reclaimed' ? 'wetland' : 'retained',
    });
  }
  const canals = basins.map((b) => {
    const p = unproject(b.u, riverV(b.u));
    return {
      id: 'canal-' + b.id,
      a: { x: b.x, z: b.z },
      b: p,
      width: preset === 'industrial' ? 58 : 44,
    };
  });
  const segmentDistance = (x, z, a, b) => {
    const vx = b.x - a.x,
      vz = b.z - a.z,
      t = clamp(
        ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz || 1),
        0,
        1,
      );
    return Math.hypot(x - a.x - vx * t, z - a.z - vz * t);
  };
  function naturalHeight(x, z) {
    const { u, v } = project(x, z),
      water = waterAt(x, z),
      bank = Math.abs(v - riverV(u)) - channelWidth;
    let y =
      datum(x, z) +
      10 +
      (noise(x, z, 620, seed) - 0.5) * (doc.biome === 'nightweir' ? 155 : 65) +
      (noise(x, z, 170, seed ^ 0x18b2) - 0.5) * 12;
    y = Math.min(y, water + bank * 0.24);
    for (const b of basins) {
      const d =
        (Math.hypot((x - b.x) / b.radiusX, (z - b.z) / b.radiusZ) - 1) *
        Math.min(b.radiusX, b.radiusZ);
      y = Math.min(y, b.waterY + d * 0.3);
    }
    for (const canal of canals)
      y = Math.min(
        y,
        water + (segmentDistance(x, z, canal.a, canal.b) - canal.width) * 0.35,
      );
    const edge = Math.min(x - minX, maxX - x, z - minZ, maxZ - z);
    return lerp(sea - 22, y, smooth(edge / 330));
  }
  const coarse = samples.filter((_, i) => i % 8 === 0);
  const roadDistance = (x, z) =>
    coarse.length
      ? Math.sqrt(
          coarse.reduce(
            (d, p) => Math.min(d, (x - p.x) ** 2 + (z - p.z) ** 2),
            Infinity,
          ),
        )
      : 1000;
  const districts = [],
    candidates = [];
  const spacing = Math.max(560, Math.sqrt((width * depth) / 110));
  for (let z = minZ + 450; z < maxZ - 400; z += spacing)
    for (let x = minX + 450; x < maxX - 400; x += spacing) {
      const px = x + (random() - 0.5) * spacing * 0.4,
        pz = z + (random() - 0.5) * spacing * 0.4,
        y = naturalHeight(px, pz),
        distance = roadDistance(px, pz);
      if (y < waterAt(px, pz) + 7) continue;
      const band = distance < 550 ? 'near' : distance < 1400 ? 'mid' : 'far';
      candidates.push({ x: px, z: pz, y, distance, band, score: random() });
    }
  candidates.sort((a, b) => a.score - b.score);
  const target = Math.min(
    REGION_LIMITS.districts,
    Math.max(16, Math.round(14 + (track?.length ?? 3000) / 700)),
  );
  for (const band of ['near', 'mid', 'far'])
    for (const p of candidates.filter((c) => c.band === band)) {
      if (districts.length >= target) break;
      const share = band === 'near' ? 0.35 : band === 'mid' ? 0.72 : 1;
      if (districts.length >= Math.ceil(target * share)) break;
      const id = districts.length;
      const pick = random();
      const kind =
        preset === 'industrial'
          ? pick < 0.65
            ? 'works'
            : pick < 0.84
              ? 'harbor'
              : 'civic'
          : preset === 'reclaimed'
            ? pick < 0.62
              ? 'garden'
              : pick < 0.84
                ? 'civic'
                : 'harbor'
            : pick < 0.44
              ? 'civic'
              : pick < 0.73
                ? 'harbor'
                : pick < 0.89
                  ? 'garden'
                  : 'works';
      districts.push({
        id: 'district-' + id,
        ...p,
        kind,
        y: Math.max(p.y, waterAt(p.x, p.z) + 10),
        yaw: Math.atan2(basis.sin, basis.cos) + (random() - 0.5) * 0.13,
        radius: 165 + random() * 75,
      });
    }
  function surveyHeight(x, z) {
    let y = naturalHeight(x, z);
    for (const d of districts) {
      const distance = Math.hypot(x - d.x, z - d.z);
      if (distance < d.radius + 125)
        y = lerp(y, d.y, 1 - smooth((distance - d.radius) / 125));
    }
    return y;
  }
  const heights = new Float32Array((nx + 1) * (nz + 1)),
    waterHeights = new Float32Array(heights.length);
  for (let z = 0; z <= nz; z++)
    for (let x = 0; x <= nx; x++) {
      const wx = minX + x * dx,
        wz = minZ + z * dz,
        index = z * (nx + 1) + x;
      heights[index] = surveyHeight(wx, wz);
      waterHeights[index] = waterAt(wx, wz);
    }
  let capped = 0;
  for (let z = 0; z < nz; z++)
    for (let x = 0; x < nx; x++) {
      const vols = reserve.overlaps(
        minX + (x + 0.5) * dx,
        minZ + (z + 0.5) * dz,
        dx / 2,
        dz / 2,
      );
      if (!vols.size) continue;
      const ceiling = Math.min(...[...vols].map((p) => p.minY)) - 5;
      for (const i of [
        z * (nx + 1) + x,
        z * (nx + 1) + x + 1,
        (z + 1) * (nx + 1) + x,
        (z + 1) * (nx + 1) + x + 1,
      ])
        if (heights[i] > ceiling) {
          heights[i] = ceiling;
          capped++;
        }
      for (const i of [
        z * (nx + 1) + x,
        z * (nx + 1) + x + 1,
        (z + 1) * (nx + 1) + x,
        (z + 1) * (nx + 1) + x + 1,
      ])
        waterHeights[i] = Math.min(waterHeights[i], ceiling - 4);
    }
  const gridHeight = (values, x, z) => {
    const gx = clamp((x - minX) / dx, 0, nx - 1e-9),
      gz = clamp((z - minZ) / dz, 0, nz - 1e-9),
      ix = Math.floor(gx),
      iz = Math.floor(gz),
      fx = gx - ix,
      fz = gz - iz,
      a = iz * (nx + 1) + ix,
      b = a + 1,
      c = a + nx + 1,
      d = c + 1;
    return fx + fz <= 1
      ? values[a] + (values[b] - values[a]) * fx + (values[c] - values[a]) * fz
      : values[d] +
          (values[c] - values[d]) * (1 - fx) +
          (values[b] - values[d]) * (1 - fz);
  };
  const surfaceHeight = (x, z) => gridHeight(heights, x, z);
  const waterHeight = (x, z) => gridHeight(waterHeights, x, z);
  const clears = (x, z, w, d, top, yaw = 0, bottom = -Infinity) => {
    const hx = (Math.abs(Math.cos(yaw)) * w + Math.abs(Math.sin(yaw)) * d) / 2,
      hz = (Math.abs(Math.sin(yaw)) * w + Math.abs(Math.cos(yaw)) * d) / 2;
    for (const p of reserve.overlaps(x, z, hx, hz))
      if (top >= p.minY && bottom <= p.maxY) return false;
    return true;
  };
  const parcels = [];
  const lodCounts = { near: 0, mid: 0, far: 0 };
  for (const d of districts) {
    const cos = Math.cos(d.yaw),
      sin = Math.sin(d.yaw);
    for (let row = -2; row <= 2; row++)
      for (let col = -2; col <= 2; col++) {
        if (
          row === 0 ||
          col === 0 ||
          parcels.length >= REGION_LIMITS.parcels ||
          random() > density
        )
          continue;
        const x = d.x + col * 58 * cos - row * 58 * sin,
          z = d.z + col * 58 * sin + row * 58 * cos,
          y = surfaceHeight(x, z),
          water = waterAt(x, z);
        if (y < water + 3) continue;
        const type =
          d.kind === 'garden'
            ? 'trees'
            : d.kind === 'works'
              ? random() < 0.65
                ? 'warehouse'
                : 'pump'
              : d.kind === 'harbor'
                ? random() < 0.58
                  ? 'warehouse'
                  : 'building'
                : 'building';
        const scale = 0.8 + random() * 0.45;
        const h =
          (type === 'building'
            ? 72
            : type === 'warehouse'
              ? 28
              : type === 'pump'
                ? 34
                : 38) * scale;
        if (!clears(x, z, 90 * scale, 76 * scale, y + h + 5, d.yaw, y - 12))
          continue;
        let lod = d.band;
        if (lod === 'near' && lodCounts.near >= 72) lod = 'mid';
        if (lod === 'mid' && lodCounts.mid >= 160) lod = 'far';
        lodCounts[lod]++;
        parcels.push({
          id: 'parcel-' + parcels.length,
          districtId: d.id,
          type,
          x,
          y,
          z,
          yaw: d.yaw,
          scale,
          lod,
          seed: Math.floor(random() * 4294967296),
        });
      }
  }
  const paths = minimumTree(districts).map((edge, i) => ({
    id: 'civic-link-' + i,
    a: { x: districts[edge.a].x, z: districts[edge.a].z },
    b: { x: districts[edge.b].x, z: districts[edge.b].z },
    width: districts[edge.a].kind === 'works' ? 16 : 10,
  }));
  for (const d of districts)
    for (const axis of [0, 1]) {
      const vx = Math.cos(d.yaw + (axis * Math.PI) / 2) * d.radius,
        vz = Math.sin(d.yaw + (axis * Math.PI) / 2) * d.radius;
      paths.push({
        id: d.id + '-street-' + axis,
        a: { x: d.x - vx, z: d.z - vz },
        b: { x: d.x + vx, z: d.z + vz },
        width: d.kind === 'works' ? 18 : 11,
      });
    }
  const landmarks = [];
  for (const d of districts.filter((_, i) => i % 3 === 0)) {
    const x = d.x,
      z = d.z,
      y = surfaceHeight(x, z);
    if (!clears(x, z, 140, 115, y + 110, d.yaw, y - 16)) continue;
    landmarks.push({
      id: 'landmark-' + landmarks.length,
      districtId: d.id,
      type:
        d.kind === 'works'
          ? 'intake-hall'
          : d.kind === 'harbor'
            ? 'lock-house'
            : d.kind === 'garden'
              ? 'garden-pavilion'
              : 'civic-exchange',
      x,
      y,
      z,
      yaw: d.yaw,
      lod: d.band,
      seed: Math.floor(random() * 4294967296),
    });
    if (landmarks.length >= REGION_LIMITS.landmarks) break;
  }
  const chunks = [];
  for (let z = 0; z < nz; z += REGION_LIMITS.chunkCells)
    for (let x = 0; x < nx; x += REGION_LIMITS.chunkCells)
      chunks.push({
        id: 'region-' + x + '-' + z,
        x0: x,
        z0: z,
        x1: Math.min(nx, x + REGION_LIMITS.chunkCells),
        z1: Math.min(nz, z + REGION_LIMITS.chunkCells),
      });
  let landCells = 0;
  for (let z = 0; z < nz; z++)
    for (let x = 0; x < nx; x++) {
      const i = z * (nx + 1) + x;
      if (
        heights[i] +
          heights[i + 1] +
          heights[i + nx + 1] +
          heights[i + nx + 2] >
        waterHeights[i] +
          waterHeights[i + 1] +
          waterHeights[i + nx + 1] +
          waterHeights[i + nx + 2]
      )
        landCells++;
    }
  bounds.max.y = Math.max(...heights) + 130;
  return {
    version: 1,
    seed,
    preset,
    bounds,
    seaLevel: sea,
    terrain: { nx, nz, dx, dz, minX, minZ, heights, waterHeights },
    basins,
    canals,
    districts,
    parcels,
    paths,
    landmarks,
    chunks,
    surfaceHeight,
    waterHeight,
    clears,
    roadSamples: samples,
    stats: {
      districts: districts.length,
      parcels: parcels.length,
      landmarks: landmarks.length,
      chunks: chunks.length,
      landArea: landCells * dx * dz,
      waterArea: (nx * nz - landCells) * dx * dz,
      terrainVertices: heights.length,
      terrainTriangles: nx * nz * 2,
      cappedVertices: capped,
      reservationCells: reserve.cellCount,
      near: parcels.filter((p) => p.lod === 'near').length,
      mid: parcels.filter((p) => p.lod === 'mid').length,
      far: parcels.filter((p) => p.lod === 'far').length,
    },
  };
}
