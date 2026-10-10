import * as T from 'three';
import { createTubeTessellation, quadTriangles } from './tube-tessellation.js';

const clamp = T.MathUtils.clamp;
const smooth = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * t * (10 + t * (-15 + 6 * t));
};
const smoothDerivative = (value) => {
  const t = clamp(value, 0, 1);
  return 30 * t * t * (1 - t) * (1 - t);
};
// These series keep a nearly flat sheet well-conditioned at both road joins.
function circularTerms(angle) {
  if (Math.abs(angle) < 1e-3) {
    const a2 = angle * angle;
    return {
      sinc: 1 - a2 / 6 + (a2 * a2) / 120,
      cosc: angle * (0.5 - a2 / 24 + (a2 * a2) / 720),
      sincDerivative: angle * (-1 / 3 + a2 / 30 - (a2 * a2) / 840),
      coscDerivative: 0.5 - a2 / 8 + (a2 * a2) / 144,
    };
  }
  return {
    sinc: Math.sin(angle) / angle,
    cosc: (1 - Math.cos(angle)) / angle,
    sincDerivative: (angle * Math.cos(angle) - Math.sin(angle)) / angle ** 2,
    coscDerivative:
      (angle * Math.sin(angle) - (1 - Math.cos(angle))) / angle ** 2,
  };
}

// The route sample is the reference lane (ceiling on Overturn). Lateral is
// sheet arclength, not
// an angle or a second position offset. The closed interval identifies its
// two ceiling edges; an open collector keeps that signed coordinate intact.
function createTubeProfile({
  start,
  end,
  width = 50,
  radius = 35,
  entryLength = 250,
  exitLength = 350,
  rimTransitionLength = 75,
  railHeight = 1.25,
  railToeWidth = 3,
  railOuterWidth = 1.35,
  toeTransitionLength = 30,
  shellThickness = 0.72,
  exposedStart = start,
  exposedEnd = end,
  referenceLane = 'floor',
  id = 'overturn-tube',
  sourceStart,
  sourceEnd,
  nominalReferenceRoll = 0,
  axisBend,
}) {
  if (!(end - start > entryLength + exitLength) || radius <= 0)
    throw new RangeError('Tube needs a positive closed span and radius');
  const entryEnd = start + entryLength;
  const exitStart = end - exitLength;
  const halfCircumference = Math.PI * radius;
  const descriptor = Object.freeze({
    id,
    kind: 'tube',
    start,
    end,
    entryEnd,
    exitStart,
    radius,
    exposedStart,
    exposedEnd,
    referenceLane,
    sourceStart,
    sourceEnd,
    nominalReferenceRoll,
    axisBend,
    entryReferenceLateral: 0,
    exitReferenceLateral: 0,
    guidanceStart: exitStart - 100,
    guidanceEnd: end,
    entryLength,
    exitLength,
    rimTransitionLength,
    toeTransitionLength,
    breakpoints: Object.freeze([
      start,
      start + toeTransitionLength,
      entryEnd - rimTransitionLength,
      entryEnd,
      exitStart,
      exitStart + rimTransitionLength,
      end - toeTransitionLength,
      end,
    ]),
  });
  function profileAt(distance) {
    if (distance < start || distance > end) return null;
    const phase =
      distance < entryEnd
        ? 'entry'
        : distance <= exitStart
          ? 'closed'
          : 'collector';
    const closed = phase === 'closed';
    const interval = phase === 'entry' ? entryLength : exitLength;
    const progress = closed
      ? 1
      : phase === 'entry'
        ? (distance - start) / interval
        : (end - distance) / interval;
    const blend = smooth(progress);
    const blendDerivative = closed
      ? 0
      : (smoothDerivative(progress) / interval) * (phase === 'entry' ? 1 : -1);
    const rimProgress =
      phase === 'entry'
        ? (entryEnd - distance) / rimTransitionLength
        : phase === 'collector'
          ? (distance - exitStart) / rimTransitionLength
          : 0;
    const railBlend = smooth(rimProgress);
    const railBlendDerivative = closed
      ? 0
      : (smoothDerivative(rimProgress) / rimTransitionLength) *
        (phase === 'entry' ? -1 : 1);
    const toeProgress =
      Math.min(distance - start, end - distance) / toeTransitionLength;
    const toeBlend = smooth(toeProgress);
    const toeBlendDerivative =
      (smoothDerivative(toeProgress) / toeTransitionLength) *
      (distance < (start + end) / 2 ? 1 : -1);
    const toeWidth = railToeWidth * railBlend * toeBlend;
    const toeWidthDerivative =
      railToeWidth *
      (railBlendDerivative * toeBlend + railBlend * toeBlendDerivative);
    return {
      id,
      tubeId: id,
      kind: 'tube',
      phase,
      closed,
      viewBlend: blend,
      curvature: blend / radius,
      curvatureDerivative: blendDerivative / radius,
      halfWidth: width / 2 + (halfCircumference - width / 2) * blend,
      halfWidthDerivative: (halfCircumference - width / 2) * blendDerivative,
      period: closed ? 2 * halfCircumference : 0,
      railBlend,
      railBlendDerivative,
      railHeight: railHeight * railBlend,
      railToeWidth: toeWidth,
      railToeWidthDerivative: toeWidthDerivative,
      // Local X points outboard; rendering multiplies it by the edge side.
      rimCrossSection: [
        [-toeWidth, 0],
        [0, railHeight * railBlend],
        [railOuterWidth * railBlend, railHeight * railBlend],
        [railOuterWidth * railBlend, -shellThickness],
        [-toeWidth, -shellThickness],
      ],
      hullInsetScale: railBlend,
      hullInsetScaleDerivative: railBlendDerivative,
    };
  }
  return { descriptor, profileAt };
}

/** One surface chart dispatches all tubes and their intervening open ribbons. */
export function createTubeSurface(options) {
  const { sample, width = 50, roadIntervals = [] } = options;
  const profiles = (options.tubes ?? [options]).map((tube) =>
    createTubeProfile({ ...options, ...tube }),
  );
  const descriptors = Object.freeze(
    profiles.map(({ descriptor }) => descriptor),
  );
  for (let index = 1; index < descriptors.length; index++)
    if (descriptors[index].start <= descriptors[index - 1].end)
      throw new RangeError('Tube intervals must be ordered and disjoint');
  const exposedStart = options.exposedStart ?? descriptors[0].exposedStart;
  const exposedEnd = options.exposedEnd ?? descriptors.at(-1).exposedEnd;
  const tubeAt = (distance) =>
    descriptors.find(
      (tube) => distance >= tube.start && distance <= tube.end,
    ) ?? null;
  const profileAt = (distance) => {
    const index = descriptors.findIndex(
      (tube) => distance >= tube.start && distance <= tube.end,
    );
    return index < 0 ? null : profiles[index].profileAt(distance);
  };
  // A small deterministic cache shares route derivatives across tessellation
  // columns. It is only an acceleration cache, never replay/simulation state.
  const baseCache = new Map();
  function baseAt(distance) {
    if (baseCache.has(distance)) return baseCache.get(distance);
    const delta = 0.002;
    const frame = sample(distance);
    const before = sample(distance - delta);
    const after = sample(distance + delta);
    const value = {
      frame,
      positionDerivative: after.position
        .clone()
        .sub(before.position)
        .multiplyScalar(1 / (2 * delta)),
      rightDerivative: after.right
        .clone()
        .sub(before.right)
        .multiplyScalar(1 / (2 * delta)),
      upDerivative: after.up
        .clone()
        .sub(before.up)
        .multiplyScalar(1 / (2 * delta)),
    };
    if (baseCache.size >= 192) baseCache.delete(baseCache.keys().next().value);
    baseCache.set(distance, value);
    return value;
  }
  function geometryAt(distance, lateral) {
    const profile = profileAt(distance);
    const k = profile?.curvature ?? 0;
    const dk = profile?.curvatureDerivative ?? 0;
    const { frame, positionDerivative, rightDerivative, upDerivative } =
      baseAt(distance);
    const angle = k * lateral;
    const terms = circularTerms(angle);
    const x = lateral * terms.sinc;
    const y = lateral * terms.cosc;
    const position = frame.position
      .clone()
      .addScaledVector(frame.right, x)
      .addScaledVector(frame.up, y);
    const right = frame.right
      .clone()
      .multiplyScalar(Math.cos(angle))
      .addScaledVector(frame.up, Math.sin(angle))
      .normalize();
    const derivative = positionDerivative
      .clone()
      .addScaledVector(rightDerivative, x)
      .addScaledVector(upDerivative, y)
      .addScaledVector(
        frame.right,
        lateral * lateral * terms.sincDerivative * dk,
      )
      .addScaledVector(frame.up, lateral * lateral * terms.coscDerivative * dk);
    const longitudinalShear = derivative.dot(right);
    const tangent = derivative.addScaledVector(right, -longitudinalShear);
    const longitudinalMetric = tangent.length();
    tangent.normalize();
    const up = tangent.clone().cross(right).normalize();
    return {
      profile,
      position,
      tangent,
      right,
      up,
      longitudinalMetric,
      longitudinalShear,
      roll: frame.roll + angle,
    };
  }
  const mesh = createTubeTessellation({
    tubes: descriptors,
    profileAt,
    geometryAt,
    sample,
    roadIntervals,
    width,
  });
  function clipFootprint(polygon, halfWidth, halfLength) {
    for (const [axis, sign, limit] of [
      [0, 1, halfWidth],
      [0, -1, halfWidth],
      [1, 1, halfLength],
      [1, -1, halfLength],
    ]) {
      const result = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i],
          b = polygon[(i + 1) % polygon.length];
        const da = sign * a[axis] - limit,
          db = sign * b[axis] - limit;
        if (da <= 0) result.push(a);
        if (da <= 0 !== db <= 0) {
          const mix = da / (da - db);
          result.push(
            a.map((value, component) => value + (b[component] - value) * mix),
          );
        }
      }
      polygon = result;
      if (!polygon.length) break;
    }
    return polygon;
  }
  function firstCell(stations, distance) {
    let low = 0,
      high = stations.length - 1;
    while (low + 1 < high) {
      const middle = (low + high) >> 1;
      if (stations[middle] <= distance) low = middle;
      else high = middle;
    }
    return low;
  }
  function hullSupportAt(distance, lateral, origin, footprint) {
    const { heading = 0, halfWidth, halfLength } = footprint;
    const support = { sheet: 0, minGuide: -Infinity, maxGuide: -Infinity };
    if (!(halfWidth > 0 && halfLength > 0)) return support;
    const diagonal = Math.hypot(halfWidth, halfLength);
    const reach = diagonal / Math.max(0.35, origin.longitudinalMetric) + 2;
    const low = distance - reach,
      high = distance + reach;
    const cosine = Math.cos(heading),
      sine = Math.sin(heading);
    const projected = new Map();
    const project = (point) => {
      if (projected.has(point)) return projected.get(point);
      const offset = point.clone().sub(origin.position),
        x = offset.dot(origin.right),
        z = offset.dot(origin.tangent);
      const result = [
        x * cosine - z * sine,
        x * sine + z * cosine,
        offset.dot(origin.up),
      ];
      projected.set(point, result);
      return result;
    };
    const include = (triangle, key) => {
      if (
        key !== 'sheet' &&
        triangle[1]
          .clone()
          .sub(triangle[0])
          .cross(triangle[2].clone().sub(triangle[0]))
          .lengthSq() <= 1e-12
      )
        return;
      for (const point of clipFootprint(
        triangle.map(project),
        halfWidth,
        halfLength,
      ))
        support[key] = Math.max(support[key], point[2]);
    };
    // Preserve the original full-run row phase of the opaque deck. Its wide
    // twisted facets can rise above the smooth reference between vertices.
    for (const run of mesh.roadRuns) {
      if (run.end < low || run.start > high) continue;
      for (
        let row = firstCell(run.stations, low);
        row < run.stations.length - 1 && run.stations[row] <= high;
        row++
      ) {
        const a = mesh.roadVertex(run.stations[row], -1),
          b = mesh.roadVertex(run.stations[row], 1);
        const c = mesh.roadVertex(run.stations[row + 1], -1),
          d = mesh.roadVertex(run.stations[row + 1], 1);
        for (const triangle of quadTriangles(a, b, c, d))
          include(triangle, 'sheet');
      }
    }
    for (const chunk of mesh.chunks) {
      if (chunk.end < low || chunk.start > high) continue;
      for (
        let row = firstCell(chunk.stations, low);
        row < chunk.stations.length - 1 && chunk.stations[row] <= high;
        row++
      ) {
        const before = chunk.stations[row],
          after = chunk.stations[row + 1];
        const columns = new Set();
        for (const station of [before, after]) {
          const profile = profileAt(station),
            base = baseAt(station).frame;
          const offset = origin.position.clone().sub(base.position),
            x = offset.dot(base.right),
            y = offset.dot(base.up);
          const k = profile.curvature;
          const nearest = k > 1e-8 ? Math.atan2(k * x, 1 - k * y) / k : x;
          const period = k > 1e-8 ? (2 * Math.PI) / k : Infinity;
          const padding = (diagonal + 2) * 1.2;
          for (const representative of Number.isFinite(period)
            ? [nearest - period, nearest, nearest + period]
            : [nearest]) {
            const first = Math.max(
              0,
              Math.floor(
                ((representative - padding + profile.halfWidth) /
                  (2 * profile.halfWidth)) *
                  mesh.columns,
              ) - 1,
            );
            const last = Math.min(
              mesh.columns - 1,
              Math.ceil(
                ((representative + padding + profile.halfWidth) /
                  (2 * profile.halfWidth)) *
                  mesh.columns,
              ) + 1,
            );
            for (let column = first; column <= last; column++)
              columns.add(column);
          }
        }
        for (const column of columns) {
          const a = mesh.sheetVertex(before, column).position,
            b = mesh.sheetVertex(before, column + 1).position;
          const c = mesh.sheetVertex(after, column).position,
            d = mesh.sheetVertex(after, column + 1).position;
          for (const triangle of quadTriangles(a, b, c, d))
            include(triangle, 'sheet');
        }
        if (chunk.closed) continue;
        for (const side of [-1, 1]) {
          const nearby = [before, after].some((station) => {
            const profile = profileAt(station),
              edge = geometryAt(station, side * profile.halfWidth);
            return (
              edge.position.distanceTo(origin.position) <=
              diagonal + profile.railToeWidth + profile.railHeight + reach
            );
          });
          if (!nearby) continue;
          for (let face = 0; face < 2; face++) {
            const a = mesh.rimVertex(before, side, face),
              b = mesh.rimVertex(before, side, face + 1);
            const c = mesh.rimVertex(after, side, face),
              d = mesh.rimVertex(after, side, face + 1);
            for (const triangle of quadTriangles(a, b, c, d, side < 0))
              include(triangle, side < 0 ? 'minGuide' : 'maxGuide');
          }
        }
      }
    }
    return support;
  }

  function sampleSurface(distance, lateral = 0) {
    const tubeProfile = profileAt(distance);
    if (!tubeProfile && (distance < exposedStart || distance > exposedEnd))
      return null;
    const profile = tubeProfile ?? {
      phase: 'exposed',
      viewBlend: 0,
      curvature: 0,
      halfWidth: width / 2,
      halfWidthDerivative: 0,
      period: 0,
      railBlend: 1,
      railHeight: 1.2,
      railToeWidth: 0,
      railToeWidthDerivative: 0,
      hullInsetScale: 1,
      hullInsetScaleDerivative: 0,
    };
    const geometry = geometryAt(distance, lateral);
    const delta = 0.2;
    const before = geometryAt(distance - delta, lateral);
    const after = geometryAt(distance + delta, lateral);
    const curvature = after.tangent
      .clone()
      .sub(before.tangent)
      .multiplyScalar(1 / (2 * delta * geometry.longitudinalMetric))
      .dot(geometry.right);
    let supportKey, supportValue;
    const hullSupport = (footprint) => {
      const key = `${footprint.heading ?? 0}:${footprint.halfWidth}:${footprint.halfLength}`;
      if (key !== supportKey) {
        supportValue = hullSupportAt(distance, lateral, geometry, footprint);
        supportKey = key;
      }
      return supportValue;
    };
    const {
      position,
      tangent,
      right,
      up,
      longitudinalMetric,
      longitudinalShear,
      roll,
    } = geometry;
    return {
      id: tubeProfile?.id ?? 'overturn-exposed',
      tubeId: tubeProfile?.tubeId ?? null,
      kind: tubeProfile ? 'tube' : 'road',
      phase: profile.phase,
      viewBlend: profile.viewBlend,
      position,
      tangent,
      right,
      up,
      quaternion: new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, up, tangent),
      ),
      bank: Math.atan2(Math.sin(roll), Math.cos(roll)),
      roll,
      curvature,
      transverseCurvature: profile.curvature,
      ...(tubeProfile ? { hullSupport } : {}),
      hullClearance: (footprint) => {
        const support = hullSupport(footprint);
        return Math.max(0, support.sheet, support.minGuide, support.maxGuide);
      },
      longitudinalMetric,
      lateralMetric: 1,
      longitudinalShear,
      bounds: {
        min: -profile.halfWidth,
        max: profile.halfWidth,
        minDerivative: -profile.halfWidthDerivative,
        maxDerivative: profile.halfWidthDerivative,
      },
      period: profile.period,
      railBlend: profile.railBlend,
      railHeight: profile.railHeight,
      railToeWidth: profile.railToeWidth,
      railToeWidthDerivative: profile.railToeWidthDerivative,
      hullInsetScale: profile.hullInsetScale,
      hullInsetScaleDerivative: profile.hullInsetScaleDerivative,
    };
  }
  return {
    descriptors,
    descriptor: descriptors.length === 1 ? descriptors[0] : null,
    tubeAt,
    profileAt,
    sampleSurface,
    mesh,
  };
}
