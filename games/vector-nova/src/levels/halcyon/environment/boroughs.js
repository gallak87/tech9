import { facadeGeometry, roofGeometry } from './geometry.js';

// Coarse connected urban fabric beneath the distant skyline. No individual
// windows/props at this distance: a handful of merged materials carries the city.
export function buildOuterBoroughs(batch, bounds, centre, ground, random) {
  const plane = (material, x, z, w, d) =>
    batch.primitive(
      'plane',
      material,
      x,
      ground + 0.015,
      z,
      w,
      1,
      d,
      0,
      false,
      '#9ca5a4',
      true,
    );
  const mass = (x, z, w, d, h, tone) => {
    const wall = facadeGeometry(w, d, h, 1, 0.025);
    batch.add(
      wall,
      'stoneWindows',
      x,
      ground,
      z,
      1,
      1,
      1,
      0,
      false,
      tone,
      true,
    );
    wall.dispose();
    const roof = roofGeometry(w, d, 0.025);
    batch.add(roof, 'roof', x, ground + h, z, 1, 1, 1, 0, false, tone, true);
    roof.dispose();
  };
  for (let x = -3168; x <= 3168; x += 176)
    for (let z = -3264; z <= 3264; z += 192) {
      const px = centre.x + x,
        pz = centre.z + z;
      if (Math.hypot(x, z) > 3550) continue;
      if (
        px > bounds.minX - 94 &&
        px < bounds.maxX + 94 &&
        pz > bounds.minZ - 102 &&
        pz < bounds.maxZ + 102
      )
        continue;
      const parcel = Math.abs(
        Math.round(x / 176) * 17 + Math.round(z / 192) * 29,
      );
      plane('road', px - 83, pz, 12, 192);
      plane('road', px, pz - 91, 176, 12);
      if (parcel % 11 === 0) {
        plane('landscape', px, pz, 148, 164);
        plane('path', px, pz, 5, 164);
        continue;
      }
      plane('pavement', px, pz, 148, 164);
      const height = 16 + random() * 38,
        tone = parcel % 3 === 0 ? '#ac9d8d' : '#899c9e';
      mass(
        px - 44,
        pz + (random() - 0.5) * 18,
        52,
        112 + random() * 36,
        height,
        tone,
      );
      mass(px + 29, pz + 33, 70, 60, height * 0.65, tone);
      if (parcel % 3 !== 0)
        mass(px + 32, pz - 46, 64, 38, 23 + random() * 47, tone);
    }
}
