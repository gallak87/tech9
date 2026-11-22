import * as T from 'three';

// One small land-use texture follows the survey's existing world-space ground
// UVs. Street shoulders and occupied yards therefore stay flush on steep banks,
// across terrain tiles and under buildings, without extra transparent surfaces.
export function applyNightweirGround(owner, soil, town, paths) {
  const { min, max } = town.bounds;
  const width = max.x - min.x,
    depth = max.z - min.z;
  const cell = Math.max(width, depth) / 384;
  const cols = Math.max(2, Math.ceil(width / cell)),
    rows = Math.max(2, Math.ceil(depth / cell));
  const dx = width / cols,
    dz = depth / rows,
    data = new Uint8Array(cols * rows * 4);
  const undeveloped = new T.Color(soil.color)
    .convertLinearToSRGB()
    .toArray()
    .map((c) => Math.round(255 * c));
  const streets = [160, 145, 126],
    civil = [171, 156, 135],
    works = [157, 151, 139],
    park = [101, 126, 87];
  for (let i = 0; i < data.length; i += 4) {
    data[i] = undeveloped[0];
    data[i + 1] = undeveloped[1];
    data[i + 2] = undeveloped[2];
    data[i + 3] = 255;
  }
  function strip(x, z, halfLength, halfDepth, cos, sin, tint) {
    const extentX = Math.abs(cos) * halfLength + Math.abs(sin) * halfDepth;
    const extentZ = Math.abs(sin) * halfLength + Math.abs(cos) * halfDepth;
    const firstX = Math.max(0, Math.floor((x - extentX - min.x) / dx));
    const lastX = Math.min(cols - 1, Math.floor((x + extentX - min.x) / dx));
    const firstZ = Math.max(0, Math.floor((z - extentZ - min.z) / dz));
    const lastZ = Math.min(rows - 1, Math.floor((z + extentZ - min.z) / dz));
    for (let row = firstZ; row <= lastZ; row++)
      for (let col = firstX; col <= lastX; col++) {
        const ox = min.x + (col + 0.5) * dx - x,
          oz = min.z + (row + 0.5) * dz - z;
        const edge = Math.min(
          halfLength - Math.abs(ox * cos + oz * sin),
          halfDepth - Math.abs(oz * cos - ox * sin),
        );
        if (edge <= 0) continue;
        const alpha = Math.min(1, edge / Math.max(12, dx));
        const i = (row * cols + col) * 4;
        for (let channel = 0; channel < 3; channel++)
          data[i + channel] = Math.round(
            T.MathUtils.lerp(data[i + channel], tint[channel], alpha),
          );
      }
  }
  for (const path of paths) {
    const ox = path.b.x - path.a.x,
      oz = path.b.z - path.a.z,
      len = Math.hypot(ox, oz);
    if (len < 1) continue;
    strip(
      (path.a.x + path.b.x) / 2,
      (path.a.z + path.b.z) / 2,
      len / 2,
      46 + path.width,
      ox / len,
      oz / len,
      streets,
    );
  }
  for (const d of town.districts) {
    strip(
      d.x,
      d.z,
      d.radius * 0.87,
      d.radius * 0.71,
      Math.cos(d.yaw),
      -Math.sin(d.yaw),
      d.kind === 'garden' ? park : d.kind === 'works' ? works : civil,
    );
  }
  const map = new T.DataTexture(data, cols, rows);
  map.name = 'Nightweir / surveyed quay paving and parkland';
  map.colorSpace = T.SRGBColorSpace;
  map.magFilter = T.LinearFilter;
  map.minFilter = T.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.repeat.set(20 / width, 20 / depth);
  map.offset.set(-min.x / width, -min.z / depth);
  map.needsUpdate = true;
  owner.textures.add(map);
  soil.map = map;
  soil.color.set(0xffffff);
  soil.needsUpdate = true;
}
