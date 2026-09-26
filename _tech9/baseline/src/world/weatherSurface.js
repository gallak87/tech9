import { getForestPlacements } from './ForestWorld.js';
import { terrainHeight, pathDistance, pathWidth } from './terrain.js';
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Scene-owned analytic cover and surface proxies. Tree crowns transmit sparse throughfall. */
export function createForestWeatherSurface() {
  const { trees, rocks, deadfall } = getForestPlacements();
  const crowns = trees.flat().map((t) => ({
    x: t.x,
    z: t.z,
    radius: 3.5 * t.scale,
    top: t.matrix.elements[13] + 15 * t.scale,
  }));
  const boulders = rocks.flat().map((r) => {
    const e = r.matrix.elements;
    return {
      x: r.x,
      z: r.z,
      y: e[13],
      rx: Math.hypot(e[0], e[2]) * 1.28,
      rz: Math.hypot(e[8], e[10]) * 1.05,
      h: e[5] * 1.38,
    };
  });
  const logs = deadfall.map((r) => {
    const e = r.matrix.elements;
    const length = Math.hypot(e[0], e[2]);
    return {
      x: r.x,
      z: r.z,
      y: e[13],
      dx: e[0] / length,
      dz: e[2] / length,
      length: 5.44 * length,
      radius: 0.32 * length,
    };
  });
  const buckets = new Map();
  for (const c of crowns)
    for (
      let x = Math.floor((c.x - c.radius) / 8);
      x <= Math.floor((c.x + c.radius) / 8);
      x++
    )
      for (
        let z = Math.floor((c.z - c.radius) / 8);
        z <= Math.floor((c.z + c.radius) / 8);
        z++
      ) {
        const key = `${x}:${z}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(c);
      }
  function ground(x, z) {
    const epsilon = 0.2;
    const nx = terrainHeight(x - epsilon, z) - terrainHeight(x + epsilon, z);
    const nz = terrainHeight(x, z - epsilon) - terrainHeight(x, z + epsilon);
    const length = Math.hypot(nx, epsilon * 2, nz);
    let exposure = 1,
      coverHeight = terrainHeight(x, z);
    for (const c of buckets.get(`${Math.floor(x / 8)}:${Math.floor(z / 8)}`) ??
      []) {
      const distance = Math.hypot(x - c.x, z - c.z) / c.radius;
      if (distance >= 1) continue;
      exposure *= 0.13 + 0.87 * smooth(0.2, 1, distance);
      coverHeight = Math.max(coverHeight, c.top - distance * 3);
    }
    const trail = smooth(
      pathWidth(z) - 0.8,
      pathWidth(z) + 0.6,
      pathDistance(x, z),
    );
    return {
      position: [x, terrainHeight(x, z), z],
      normal: [nx / length, (epsilon * 2) / length, nz / length],
      exposure,
      snowRetention: 0.42 + trail * 0.58,
      puddle: (1 - trail) * exposure,
      coverHeight,
    };
  }
  function sampleSurface(x, z) {
    if (Math.abs(x) > 80 || Math.abs(z) > 80) return null;
    const hit = ground(x, z);
    for (const r of boulders) {
      const dx = (x - r.x) / r.rx,
        dz = (z - r.z) / r.rz;
      const q = dx * dx + dz * dz;
      if (q >= 0.92) continue;
      const y = r.y + r.h * Math.sqrt(1 - q);
      if (y <= hit.position[1]) continue;
      hit.position[1] = y;
      hit.normal = [dx / r.rx, Math.sqrt(1 - q) / r.h, dz / r.rz];
      hit.puddle = 0;
      hit.snowRetention = 1;
    }
    for (const r of logs) {
      const dx = x - r.x,
        dz = z - r.z;
      const along = dx * r.dx + dz * r.dz,
        across = -dx * r.dz + dz * r.dx;
      if (along < 0 || along > r.length || Math.abs(across) > r.radius)
        continue;
      const top = Math.sqrt(r.radius * r.radius - across * across);
      const y = r.y + r.radius + top;
      if (y > hit.position[1]) {
        hit.position[1] = y;
        hit.normal = [-across * r.dz, top, across * r.dx];
        hit.puddle = 0;
        hit.snowRetention = 1;
      }
    }
    hit.coverHeight = Math.max(hit.coverHeight, hit.position[1]);
    return hit;
  }
  return {
    sampleSurface,
    ground,
    snowDepth(x, z, snow) {
      const hit = ground(x, z);
      return (
        0.065 *
        snow *
        hit.exposure *
        hit.snowRetention *
        smooth(0.23, 0.8, hit.normal[1])
      );
    },
  };
}
