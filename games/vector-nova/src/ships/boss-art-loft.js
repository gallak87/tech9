import * as T from 'three';

// Smooth formed skins from authored metre-space stations. Rounded rectangular
// sections retain industrial mass while the changing crown catches broad light.
export function createBossLoft(
  stations,
  { radial = 32, steps = 6, power = 0.48, omit = null } = {},
) {
  const positions = [],
    indices = [];
  const signed = (value) => Math.sign(value) * Math.pow(Math.abs(value), power);
  const tangent = (index, key) => {
    const before = stations[Math.max(0, index - 1)],
      here = stations[index],
      after = stations[Math.min(stations.length - 1, index + 1)];
    const a =
      before === here
        ? 0
        : ((here[key] ?? 0) - (before[key] ?? 0)) / (here.z - before.z);
    const b =
      after === here
        ? 0
        : ((after[key] ?? 0) - (here[key] ?? 0)) / (after.z - here.z);
    return a * b > 0 ? (2 * a * b) / (a + b) : 0;
  };
  const ring = (a, b, t, index = stations.length - 1) => {
    const value = (key) => {
      const av = a[key] ?? 0,
        bv = b[key] ?? 0,
        dz = b.z - a.z;
      return (
        (2 * t * t * t - 3 * t * t + 1) * av +
        (t * t * t - 2 * t * t + t) * dz * tangent(index, key) +
        (-2 * t * t * t + 3 * t * t) * bv +
        (t * t * t - t * t) *
          dz *
          tangent(Math.min(index + 1, stations.length - 1), key)
      );
    };
    const x = value('x'),
      z = T.MathUtils.lerp(a.z, b.z, t);
    const low = value('low'),
      high = value('high'),
      width = value('width');
    for (let j = 0; j < radial; j++) {
      const angle = (j / radial) * Math.PI * 2;
      positions.push(
        x + signed(Math.cos(angle)) * width,
        (low + high) / 2 + (signed(Math.sin(angle)) * (high - low)) / 2,
        z,
      );
    }
  };
  for (let i = 0; i < stations.length - 1; i++)
    for (let step = 0; step < steps; step++)
      ring(stations[i], stations[i + 1], step / steps, i);
  ring(stations.at(-1), stations.at(-1), 0);
  const rings = (stations.length - 1) * steps + 1;
  for (let i = 0; i < rings - 1; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j,
        b = i * radial + ((j + 1) % radial);
      if (
        omit?.({
          z: (positions[a * 3 + 2] + positions[(a + radial) * 3 + 2]) / 2,
          angle: ((j + 0.5) / radial) * Math.PI * 2,
        })
      )
        continue;
      indices.push(a, b, b + radial, a, b + radial, a + radial);
    }
  // Duplicate cap vertices keep their plane from pulling the skin normals flat.
  for (const [station, source, forward] of [
    [stations[0], 0, false],
    [stations.at(-1), (rings - 1) * radial, true],
  ]) {
    const center = positions.length / 3;
    positions.push(station.x ?? 0, (station.low + station.high) / 2, station.z);
    for (let j = 0; j < radial; j++)
      positions.push(
        ...positions.slice((source + j) * 3, (source + j) * 3 + 3),
      );
    for (let j = 0; j < radial; j++) {
      const a = center + 1 + j,
        b = center + 1 + ((j + 1) % radial);
      indices.push(...(forward ? [center, a, b] : [center, b, a]));
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const p = geometry.attributes.position,
    uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i);
    uv[i * 2 + 1] = p.getZ(i);
  }
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  return geometry;
}
