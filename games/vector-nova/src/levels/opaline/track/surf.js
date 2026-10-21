import * as T from 'three';

const EDGE = 16;
const RISE = 9 / (18 * 18);
const smooth = (t) => {
  const x = T.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/** Authored lower mineral skin. Upper strata remain collision-only terrain. */
export function createOpalineSurfBanks({
  jumps,
  constructedIntervals,
  length,
}) {
  // Natural lower banks are one gameplay material everywhere, never a list of
  // opt-in showcase locations. Only actual connectors and gaps interrupt them.
  const cuts = new Set([0, length]);
  for (const span of constructedIntervals) {
    cuts.add(span.start);
    cuts.add(span.end);
  }
  for (const jump of jumps) {
    cuts.add(jump.takeoff);
    cuts.add(jump.landingStart);
  }
  const ordered = [...cuts].sort((a, b) => a - b),
    banks = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const start = ordered[i],
      end = ordered[i + 1],
      middle = (start + end) / 2;
    if (
      constructedIntervals.some(
        (span) => middle > span.start && middle < span.end,
      ) ||
      jumps.some((jump) => middle > jump.takeoff && middle < jump.landingStart)
    )
      continue;
    const approach = end === jumps[0].takeoff;
    const id = approach
      ? 'approach-surf'
      : start === jumps[0].landingStart
        ? 'reception-surf'
        : `mineral-surf-${banks.length + 1}`;
    banks.push({
      id,
      start,
      end,
      width: approach ? 10 : 18,
      entry: approach ? 26 : Math.min(72, (end - start) * 0.29),
      exit: approach ? 48 : Math.min(280, (end - start) * 0.53),
    });
  }
  return banks;
}

/** Route/lateral bounds and elevation used by deck, cliff join and art accents. */
export function sampleOpalineSurfBank(track, distance) {
  const s =
    distance >= 0 && distance < track.length
      ? distance
      : T.MathUtils.euclideanModulo(distance, track.length);
  // Match Float32 roadCoord endpoint quantization as well as double route queries.
  const endpointTolerance = Math.max(1e-4, track.length * 2 ** -23);
  const bank = track.surfBanks?.find(
    (span) =>
      s >= span.start - endpointTolerance && s <= span.end + endpointTolerance,
  );
  if (!bank) return null;
  const width =
    bank.width *
    Math.min(
      smooth((s - bank.start) / bank.entry),
      smooth((bank.end - s) / bank.exit),
    );
  return {
    bank,
    width,
    min: EDGE,
    max: EDGE + width,
    height: RISE * width * width,
  };
}

export function opalineSurfHeight(lateral) {
  return RISE * Math.max(0, lateral - EDGE) ** 2;
}

export function opalineSurfPoint(track, distance, lateral) {
  const frame = track.sample(distance);
  return frame.position
    .clone()
    .addScaledVector(frame.right, lateral)
    .addScaledVector(frame.up, opalineSurfHeight(lateral));
}

/** Reference frame for exact triangle lookup and shared magnetic-body projection. */
export function sampleOpalineSurfSurface(track, distance, lateral = 0) {
  const bank = sampleOpalineSurfBank(track, distance);
  if (!bank) return null;
  const frame = track.sample(distance);
  const slope = 2 * RISE * Math.max(0, lateral - EDGE);
  const across = frame.right.clone().addScaledVector(frame.up, slope);
  const right = across.clone().normalize();
  const along = opalineSurfPoint(track, distance + 0.1, lateral)
    .sub(opalineSurfPoint(track, distance - 0.1, lateral))
    .multiplyScalar(5);
  const longitudinalShear = along.dot(right);
  const tangent = along.addScaledVector(right, -longitudinalShear);
  const longitudinalMetric = tangent.length();
  tangent.normalize();
  const up = tangent.clone().cross(right).normalize();
  return {
    ...frame,
    id: bank.bank.id,
    kind: 'bank',
    position: frame.position
      .clone()
      .addScaledVector(frame.right, lateral)
      .addScaledVector(frame.up, opalineSurfHeight(lateral)),
    right,
    up,
    tangent,
    quaternion: new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().makeBasis(right, up, tangent),
    ),
    bank: frame.bank + Math.atan(slope),
    longitudinalMetric,
    lateralMetric: across.length(),
    longitudinalShear,
    transverseCurvature:
      lateral > EDGE ? (2 * RISE) / (1 + slope * slope) ** 1.5 : 0,
    bounds: { min: -EDGE, max: bank.max },
  };
}
