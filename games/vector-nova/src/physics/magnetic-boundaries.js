import { magneticFrame } from './magnetic-body.js';
import { Vector3 } from 'three';

// Some worlds collect only jump corridors. A face's broad supported interval
// is not proof that its mesh covers the whole road: collected faces also carry
// their own station, which lets us recover their actual longitudinal extent.
function authoredCoverage(track, triangles, ranges) {
  const coverage = new Map([
    [-1, []],
    [1, []],
  ]);
  const overlaps = (start, end) =>
    ranges.some((range) => start <= range.end && end >= range.start);
  for (const triangle of triangles) {
    if (!triangle.roadBoundary) continue;
    const located = Number.isFinite(triangle.distance);
    let start = located ? triangle.distance : triangle.start;
    let end = located ? triangle.distance : triangle.end;
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      !overlaps(start, end)
    )
      continue;
    const station = (start + end) / 2;
    const centre = magneticFrame(track, station, 0);
    // A broad support interval alone cannot prove corridor coverage. Tube
    // chunks are the exception: they are emitted as complete bounded meshes.
    if (!located && centre.surface?.kind !== 'tube') continue;
    const points = triangle.points.map((point) => new Vector3(...point));
    const middle = points
      .reduce((sum, point) => sum.add(point), new Vector3())
      .multiplyScalar(1 / 3);
    let side;
    if (centre.surface?.kind === 'tube') {
      const left = magneticFrame(track, station, centre.bounds.min).position;
      const right = magneticFrame(track, station, centre.bounds.max).position;
      side =
        middle.distanceToSquared(left) < middle.distanceToSquared(right)
          ? -1
          : 1;
    } else
      side = middle.clone().sub(centre.position).dot(centre.right) < 0 ? -1 : 1;
    if (located) {
      const offsets = points.map(
        (point) =>
          point.clone().sub(centre.position).dot(centre.tangent) /
          (centre.longitudinalMetric ?? 1),
      );
      start += Math.min(...offsets);
      end += Math.max(...offsets);
    }
    // Unlocated tube faces have exact bounded chunk intervals supplied by the
    // same tessellation that builds the rendered rim and collector guide.
    coverage.get(side).push({ start, end });
  }
  for (const [side, spans] of coverage) {
    const merged = [];
    for (const span of spans.sort((a, b) => a.start - b.start)) {
      const previous = merged.at(-1);
      if (previous && span.start <= previous.end + 0.1)
        previous.end = Math.max(previous.end, span.end);
      else merged.push({ ...span });
    }
    coverage.set(side, merged);
  }
  return (side, start, end) =>
    coverage
      .get(side)
      .some((span) => span.start <= start + 0.1 && span.end >= end - 0.1);
}

// The magnetic controller previously supplied analytical road-edge contacts.
// Their route-owned bounds now become actual solver faces, so a crowded racer
// cannot be projected through another body when it reaches the edge.
export function withMagneticBoundaries(track, collisionWorld = null) {
  const triangles = [...(collisionWorld?.triangles ?? [])];
  // Undefined preserves historical continuous edges. An explicit empty policy
  // leaves mineral shelves exposed; authored rail triangles are always retained.
  const boundaryIntervals = track.boundaryIntervals;
  if (
    boundaryIntervals !== undefined &&
    (!Array.isArray(boundaryIntervals) ||
      boundaryIntervals.some(
        (span) =>
          !span ||
          !Number.isFinite(span.start) ||
          !Number.isFinite(span.end) ||
          span.start < 0 ||
          span.end > track.length ||
          span.start >= span.end,
      ))
  )
    throw new Error('Invalid track boundary intervals');
  const spacing = 4;
  const from = track.closed === false ? -60 : 0;
  const end = track.length;
  const authoredRanges = [
    ...(track.tubes ?? []),
    ...(track.jumps ?? [])
      .filter((jump) => jump.optional)
      .map((jump) => ({ start: jump.takeoff, end: jump.landingStart })),
  ];
  // Authored curbs also cover ordinary roads and mandatory jump receivers.
  // Adding a taller wall there can catch an airborne hull above the visible
  // curb and pin it between duplicate boundaries instead of letting it land.
  const covered = authoredCoverage(track, triangles, [{ start: from, end }]);
  const frameAt = (distance, side) => {
    const centre = magneticFrame(track, distance, 0);
    if (centre.period > 0) return null;
    const lateral = centre.bounds
      ? side < 0
        ? centre.bounds.min
        : centre.bounds.max
      : (side * track.width) / 2;
    return magneticFrame(track, distance, lateral);
  };
  const gap = (a, b) =>
    (track.jumps ?? []).some(
      (jump) => !jump.optional && a < jump.landingStart && b > jump.takeoff,
    );
  const cuts = new Set([from, end]);
  for (let distance = from; distance < end; distance += spacing)
    cuts.add(distance);
  for (const range of authoredRanges) {
    for (const distance of [
      range.start,
      range.end,
      range.entryEnd,
      range.exitStart,
    ])
      if (Number.isFinite(distance) && distance > from && distance < end)
        cuts.add(distance);
  }
  for (const span of boundaryIntervals ?? []) {
    cuts.add(span.start);
    cuts.add(span.end);
  }
  const stations = [...cuts].sort((a, b) => a - b);
  for (let index = 0; index < stations.length - 1; index++) {
    const distance = stations[index],
      next = stations[index + 1];
    if (gap(distance, next)) continue;
    if (
      boundaryIntervals &&
      !boundaryIntervals.some(
        (span) => distance >= span.start && next <= span.end,
      )
    )
      continue;
    for (const side of [-1, 1]) {
      if (covered(side, distance, next)) continue;
      const a = frameAt(distance, side),
        b = frameAt(next, side);
      if (!a || !b) continue;
      const corners = [
        a.position.clone().addScaledVector(a.up, -1),
        b.position.clone().addScaledVector(b.up, -1),
        b.position.clone().addScaledVector(b.up, 3),
        a.position.clone().addScaledVector(a.up, 3),
      ].map((v) => v.toArray());
      for (const indices of [
        [0, 1, 2],
        [0, 2, 3],
      ])
        triangles.push({
          id: `magnetic-edge-${side}`,
          kind: 'rail',
          roadBoundary: true,
          start: distance,
          end: next,
          order: triangles.length,
          points: indices.map((index) => corners[index]),
        });
    }
  }
  return {
    id: `${collisionWorld?.id ?? track.id}-magnetic-edges`,
    version: 3,
    rulesId: `${collisionWorld?.rulesId ?? track.id}:road-bounds-4m-v3-authored-coverage:${JSON.stringify({ geometry: track.geometryVersion, length: track.length, width: track.width, closed: track.closed !== false, jumps: track.jumps })}${boundaryIntervals === undefined ? '' : `:boundary-policy-v1:${JSON.stringify(boundaryIntervals)}`}`,
    triangles,
  };
}
