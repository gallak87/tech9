import * as T from 'three';
import { sweepGeometry } from '../../../track/geometry.js';

/** Gap-free spans shared by production geometry and CPU contact construction. */
export function roadIntervals(track) {
  const cuts = new Set([0, track.length]);
  for (const jump of track.jumps) {
    cuts.add(jump.takeoff);
    cuts.add(jump.landingStart);
  }
  for (const interval of track.constructedIntervals) {
    cuts.add(interval.start);
    cuts.add(interval.end);
  }
  const ordered = [...cuts].sort((a, b) => a - b),
    intervals = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const start = ordered[i],
      end = ordered[i + 1],
      mid = (start + end) / 2;
    if (track.isGap(mid)) continue;
    const connector = track.constructedIntervals.find(
      (span) => mid >= span.start && mid <= span.end,
    );
    intervals.push({
      start,
      end,
      constructed: Boolean(connector),
      id: connector?.id ?? `mineral-${i}`,
    });
  }
  return intervals;
}

/** Actual finite mineral running surface; UV is visual, roadCoord is authoritative. */
export function createOpalineSurfaceGeometry(
  track,
  { start = 0, end = track.length, step = 4 } = {},
) {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    !Number.isFinite(step) ||
    step <= 0
  )
    throw new Error('Invalid Opaline surface range');
  const positions = [],
    uvs = [],
    coords = [],
    indices = [];
  for (const span of roadIntervals(track)) {
    const a = Math.max(start, span.start),
      b = Math.min(end, span.end);
    if (b <= a) continue;
    const count = Math.ceil((b - a) / step),
      base = positions.length / 3;
    for (let i = 0; i <= count; i++) {
      const distance = a + ((b - a) * i) / count,
        frame = track.sample(distance);
      for (const lateral of [-track.width / 2, 0, track.width / 2]) {
        positions.push(
          ...frame.position
            .clone()
            .addScaledVector(frame.right, lateral)
            .toArray(),
        );
        uvs.push(lateral / 16, distance / 16);
        coords.push(distance, lateral);
      }
      if (i < count)
        for (let lane = 0; lane < 2; lane++) {
          const n = base + i * 3 + lane;
          indices.push(n, n + 3, n + 1, n + 1, n + 3, n + 4);
        }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('roadCoord', new T.Float32BufferAttribute(coords, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** This same outboard profile is rendered and collected as physical connector rail. */
export function createOpalineConnectorRailGeometry(
  track,
  { start, end, side, step = 4 },
) {
  if (side !== -1 && side !== 1)
    throw new Error('An Opaline connector rail needs side -1 or 1');
  const inner = side * (track.width / 2 + 0.3),
    outer = side * (track.width / 2 + 0.85);
  const profile = [
    [inner, 0],
    [inner, 1.05],
    [outer, 1.05],
    [outer, 0],
    [inner, 0],
  ];
  return sweepGeometry(track, side === 1 ? profile : profile.reverse(), {
    start,
    end,
    step,
  });
}
