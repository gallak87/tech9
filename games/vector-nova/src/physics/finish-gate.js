function gateAt(track, station, time) {
  const surface =
    track.surfaceAtTime?.(station, 0, time) ??
    track.sampleSurface?.(station, 0, { geometryOnly: true });
  const frame =
    surface ?? track.frameAtTime?.(station, time) ?? track.sample(station);
  const { position, tangent, right } = frame;
  const across = right.x ** 2 + right.z ** 2;
  const forwards = -right.z * tangent.x + right.x * tangent.z;
  if (across < 1e-6 || Math.abs(forwards) < 1e-6) return null;
  return {
    x: position.x,
    y: position.y,
    z: position.z,
    rightX: right.x,
    rightY: right.y,
    rightZ: right.z,
    across,
    sign: Math.sign(forwards),
    min: surface?.bounds?.min ?? -track.width / 2,
    max: surface?.bounds?.max ?? track.width / 2,
  };
}

function side({ x, z, rightX, rightZ, sign }, point) {
  return sign * (rightX * (point.z - z) - rightZ * (point.x - x));
}

// A finish or receiving line extends vertically above its actual road width.
// A moving carrier owns the gate transform at both ends of the physics tick.
export function crossAirborneGate(track, station, before, after, time, dt) {
  if (dt <= 0) return null;
  const end = gateAt(track, station, time);
  const start = track.frameAtTime ? gateAt(track, station, time - dt) : end;
  if (!start || !end) return null;
  const d0 = side(start, before);
  const d1 = side(end, after);
  if (!(d0 < 0 && d1 >= 0)) return null;
  const fraction = -d0 / (d1 - d0);
  const crossingTime = time - dt * (1 - fraction);
  const gate = start === end ? end : gateAt(track, station, crossingTime);
  if (!gate) return null;
  const { rightX, rightY, rightZ, across, min, max } = gate;
  const x = before.x + (after.x - before.x) * fraction - gate.x;
  const z = before.z + (after.z - before.z) * fraction - gate.z;
  const lateral = (x * rightX + z * rightZ) / across;
  const y = before.y + (after.y - before.y) * fraction;
  const height = y - (gate.y + rightY * lateral);
  if (
    lateral < min ||
    lateral > max ||
    height < 0 ||
    (track.surfaceCoverage?.(station, lateral) ?? 1) <= 0
  )
    return null;
  return crossingTime;
}
