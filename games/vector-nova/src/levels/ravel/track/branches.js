import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';

export const RAVEL_BRANCH_RULES = 'ravel-braid-v3-drivable-outboard-wings';
export const RAVEL_MAIN_HALF_WIDTH = 50;
const FAN_HALF_WIDTH = 140;
const FAN_DIVIDER = FAN_HALF_WIDTH / 3;
export const RAVEL_BRANCH_WINGS = Object.freeze({
  halfWidth: 600,
  radius: 500,
  startOffset: 100,
  growthEndOffset: 500,
  taperStartOffset: 500,
  endOffset: 100,
  innerWaistFraction: 0.48,
  innerWaistCentre: 0.36,
  innerWaistSpan: 0.12,
});
export const RAVEL_BRANCH_SHAPE = Object.freeze({
  innerAcross: 110,
  middleAcross: 240,
  innerHeight: -75,
  middleHeight: 75,
  outerAcross: 500,
  outerHeight: 260,
  outerBank: 1.05,
  outerLipHeight: 80,
  outerLipGrade: -0.18,
});
export const RAVEL_BRANCHES = Object.freeze([
  Object.freeze({ id: 'inner', centre: -100, halfWidth: 40 }),
  Object.freeze({ id: 'middle', centre: 0, halfWidth: 40 }),
  Object.freeze({ id: 'outer', centre: 100, halfWidth: 40 }),
]);

const clamp = MathUtils.clamp;
const smooth = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const lerp = MathUtils.lerp;
const station = (track, distance) =>
  track.closed === false
    ? clamp(distance, 0, track.length)
    : MathUtils.euclideanModulo(distance, track.length);
const valueAt = (value, distance) =>
  typeof value === 'function' ? value(distance) : value;

export function ravelBandBounds(band, distance) {
  return { min: valueAt(band.min, distance), max: valueAt(band.max, distance) };
}

function braidData(track) {
  const braid = track.braid;
  if (Number.isFinite(braid.splitEnd) && Number.isFinite(braid.mergeStart))
    return braid;
  return {
    ...braid,
    splitEnd: braid.splitEnd ?? braid.start + (braid.end - braid.start) * 0.2,
    mergeStart: braid.mergeStart ?? braid.end - (braid.end - braid.start) * 0.2,
  };
}

/** Continuous outboard arc skin. Existing ribbon coordinates stay untouched. */
export function ravelWingProfileAt(track, distance) {
  const wrapped = station(track, distance);
  const braid = braidData(track);
  const start = braid.splitEnd + RAVEL_BRANCH_WINGS.startOffset;
  const end = braid.mergeStart - RAVEL_BRANCH_WINGS.endOffset;
  if (wrapped < start - 1e-7 || wrapped > end + 1e-7 || end <= start)
    return null;
  const s = clamp(wrapped, start, end);
  const middle = (start + end) / 2;
  const growthEnd = Math.min(
    middle,
    braid.splitEnd + RAVEL_BRANCH_WINGS.growthEndOffset,
  );
  const taperStart = Math.max(
    middle,
    braid.mergeStart - RAVEL_BRANCH_WINGS.taperStartOffset,
  );
  const envelope =
    smooth((s - start) / (growthEnd - start)) *
    (1 - smooth((s - taperStart) / (end - taperStart)));
  const phase = (s - braid.splitEnd) / (braid.mergeStart - braid.splitEnd);
  // The inside weave has one tight return. Its outboard sheet narrows smoothly
  // there instead of wrapping past the curve's centre and folding backwards.
  const waist =
    1 -
    RAVEL_BRANCH_WINGS.innerWaistFraction *
      Math.exp(
        -(
          ((phase - RAVEL_BRANCH_WINGS.innerWaistCentre) /
            RAVEL_BRANCH_WINGS.innerWaistSpan) **
          2
        ),
      );
  const halfWidth = lerp(
    FAN_HALF_WIDTH,
    RAVEL_BRANCH_WINGS.halfWidth,
    envelope,
  );
  return {
    start,
    growthEnd,
    taperStart,
    end,
    envelope,
    halfWidth,
    innerHalfWidth: lerp(FAN_HALF_WIDTH, halfWidth, waist),
    outerHalfWidth: halfWidth,
    curvature: envelope / RAVEL_BRANCH_WINGS.radius,
  };
}

function outerJump(track) {
  return (track.jumps ?? []).find(
    (jump) => jump.branch === 'outer' || jump.id === 'outer-transfer',
  );
}

function nearestBranch(lateral) {
  return RAVEL_BRANCHES.reduce((nearest, branch) =>
    Math.abs(lateral - branch.centre) < Math.abs(lateral - nearest.centre)
      ? branch
      : nearest,
  );
}

function hermite(a, b, tangentA, tangentB, fraction, span) {
  const t = clamp(fraction, 0, 1),
    t2 = t * t,
    t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * a +
    (t3 - 2 * t2 + t) * span * tangentA +
    (-2 * t3 + 3 * t2) * b +
    (t3 - t2) * span * tangentB
  );
}

// One global progress coordinate describes all ribbons. Their geometric
// derivatives, not a speed multiplier, account for each route's actual length.
function ribbonOffset(track, distance, branch) {
  const braid = braidData(track);
  if (distance <= braid.splitEnd || distance >= braid.mergeStart)
    return { across: 0, height: 0, bank: 0 };
  const t = (distance - braid.splitEnd) / (braid.mergeStart - braid.splitEnd);
  const envelope = Math.sin(Math.PI * t) ** 2;
  const weave = Math.sin(2 * Math.PI * t);
  if (branch.id === 'inner')
    return {
      across: RAVEL_BRANCH_SHAPE.innerAcross * envelope * weave,
      height: RAVEL_BRANCH_SHAPE.innerHeight * envelope,
      bank: -0.35 * envelope * weave,
    };
  if (branch.id === 'middle')
    return {
      across: -RAVEL_BRANCH_SHAPE.middleAcross * envelope * weave,
      height: RAVEL_BRANCH_SHAPE.middleHeight * envelope,
      bank: 0.5 * envelope * weave,
    };
  return {
    across: RAVEL_BRANCH_SHAPE.outerAcross * envelope,
    height: RAVEL_BRANCH_SHAPE.outerHeight * envelope,
    bank: RAVEL_BRANCH_SHAPE.outerBank * envelope,
  };
}

function outerApproach(track, distance, offset) {
  const jump = outerJump(track);
  if (!jump) return offset;
  const braid = braidData(track);
  const start = Math.min(braid.mergeStart - 90, jump.takeoff - 330);
  if (distance <= start || distance >= jump.landingStart) return offset;
  const branch = RAVEL_BRANCHES[2];
  const before = ribbonOffset(track, start - 0.5, branch);
  const at = ribbonOffset(track, start, branch);
  const after = ribbonOffset(track, start + 0.5, branch);
  if (distance <= jump.takeoff) {
    const span = jump.takeoff - start;
    const t = (distance - start) / span;
    return {
      // Bring the outside lip over the common receiver without moving its
      // virtual lane: the airborne solver will relatch on the merged apron.
      across: hermite(
        at.across,
        -branch.centre,
        after.across - before.across,
        0,
        t,
        span,
      ),
      height: hermite(
        at.height,
        RAVEL_BRANCH_SHAPE.outerLipHeight,
        after.height - before.height,
        RAVEL_BRANCH_SHAPE.outerLipGrade,
        t,
        span,
      ),
      bank: at.bank * (1 - smooth(t)),
    };
  }
  // This extension has no support or rendered skin; it merely keeps pure
  // geometry queries finite while the physical ship is in real free flight.
  return {
    across: -branch.centre,
    height:
      RAVEL_BRANCH_SHAPE.outerLipHeight +
      RAVEL_BRANCH_SHAPE.outerLipGrade * (distance - jump.takeoff),
    bank: 0,
  };
}

function ribbonCentre(track, distance, branch) {
  const s = station(track, distance);
  const base = track.sampleBase(distance);
  const braid = braidData(track);
  let offset = { across: 0, height: 0, bank: 0 };
  if (s >= braid.splitEnd && s < braid.end) {
    offset = ribbonOffset(track, s, branch);
    if (branch.id === 'outer') offset = outerApproach(track, s, offset);
  }
  return {
    position: base.position
      .clone()
      .addScaledVector(base.right, branch.centre + offset.across)
      .addScaledVector(base.up, offset.height),
    base,
    bank: offset.bank,
  };
}

function pointAndAcross(track, distance, lateral) {
  const sheet = track.sheetPointProfile?.(distance, lateral);
  if (sheet) return sheet;
  const s = station(track, distance);
  const braid = braidData(track);
  const ownership = track.roadBands
    ? ravelBranchAt(track, distance, lateral)
    : null;
  const jump = outerJump(track);
  const overOuterGap =
    jump &&
    s >= jump.takeoff &&
    s < jump.landingStart &&
    lateral > RAVEL_MAIN_HALF_WIDTH;
  const branch = overOuterGap
    ? RAVEL_BRANCHES[2]
    : (RAVEL_BRANCHES.find((candidate) => candidate.id === ownership?.id) ??
      nearestBranch(lateral));
  // Contiguous fans retain the axis frame, including across their virtual
  // strip boundaries. Only physically separated ribbons get their own frame.
  if (
    s < braid.splitEnd ||
    s >= braid.end ||
    (!overOuterGap && (ownership?.id === 'fan' || ownership?.id === 'main'))
  ) {
    const base = track.sampleBase(distance);
    return {
      position: base.position.clone().addScaledVector(base.right, lateral),
      across: base.right.clone(),
      base,
      bank: 0,
      branch,
    };
  }
  const centre = ribbonCentre(track, distance, branch);
  const before = ribbonCentre(track, distance - 0.5, branch).position;
  const after = ribbonCentre(track, distance + 0.5, branch).position;
  const tangent = after.sub(before).normalize();
  // Make the ribbon's transverse direction perpendicular to its OWN centre
  // curve before banking it. Retaining the axis right would turn a sweeping
  // side route into a highly sheared sheet and make straight driving drift.
  const right = centre.base.right
    .clone()
    .addScaledVector(tangent, -centre.base.right.dot(tangent))
    .normalize()
    .applyAxisAngle(tangent, centre.bank);
  const wing = ravelWingProfileAt(track, distance);
  const side = branch.id === 'inner' ? -1 : branch.id === 'outer' ? 1 : 0;
  if (wing && side && side * lateral > FAN_HALF_WIDTH) {
    const q = side * lateral - FAN_HALF_WIDTH;
    const angle = wing.curvature * q;
    const across =
      wing.curvature > 1e-10 ? Math.sin(angle) / wing.curvature : q;
    const height =
      wing.curvature > 1e-10
        ? (2 * Math.sin(angle / 2) ** 2) / wing.curvature
        : 0;
    const up = new Vector3().crossVectors(tangent, right).normalize();
    const edge = centre.position.addScaledVector(
      right,
      side * FAN_HALF_WIDTH - branch.centre,
    );
    return {
      position: edge
        .addScaledVector(right, side * across)
        .addScaledVector(up, height),
      across: right
        .clone()
        .multiplyScalar(Math.cos(angle))
        .addScaledVector(up, side * Math.sin(angle)),
      base: centre.base,
      bank: centre.bank + side * angle,
      branch,
      kind: 'wing',
      wingId: `${branch.id}-sail-wing`,
      lateralMetric: 1,
      transverseCurvature: wing.curvature,
    };
  }
  return {
    position: centre.position.addScaledVector(right, lateral - branch.centre),
    across: right,
    base: centre.base,
    bank: centre.bank,
    branch,
  };
}

/** Position-only hot path for the animated grid; no derivative/frame work. */
export function ravelBranchPoint(track, distance, lateral) {
  return pointAndAcross(track, distance, lateral).position;
}

function rawBands(track) {
  const { start, splitEnd, mergeStart, end } = braidData(track);
  const fork = lerp(start, splitEnd, 0.55);
  const join = lerp(mergeStart, end, 0.48);
  const widen = (s) =>
    lerp(
      RAVEL_MAIN_HALF_WIDTH,
      FAN_HALF_WIDTH,
      smooth((s - start) / (fork - start)),
    );
  const forkT = (s) => smooth((s - fork) / (splitEnd - fork));
  const joinT = (s) => smooth((s - mergeStart) / (join - mergeStart));
  const narrow = (s) => smooth((s - join) / (end - join));
  const bands = [
    {
      id: 'main-before',
      branch: 'main',
      start: 0,
      end: start,
      min: -50,
      max: 50,
    },
    {
      id: 'entry-fan',
      branch: 'fan',
      start,
      end: fork,
      min: (s) => -widen(s),
      max: widen,
    },
    {
      id: 'entry-inner',
      branch: 'inner',
      start: fork,
      end: splitEnd,
      min: -140,
      max: (s) => lerp(-FAN_DIVIDER, -60, forkT(s)),
    },
    {
      id: 'entry-middle',
      branch: 'middle',
      start: fork,
      end: splitEnd,
      min: (s) => lerp(-FAN_DIVIDER, -40, forkT(s)),
      max: (s) => lerp(FAN_DIVIDER, 40, forkT(s)),
    },
    {
      id: 'entry-outer',
      branch: 'outer',
      start: fork,
      end: splitEnd,
      min: (s) => lerp(FAN_DIVIDER, 60, forkT(s)),
      max: 140,
    },
    ...RAVEL_BRANCHES.map((branch) => ({
      id: `ribbon-${branch.id}`,
      branch: branch.id,
      start: splitEnd,
      end: mergeStart,
      min:
        branch.id === 'inner'
          ? (s) =>
              -(ravelWingProfileAt(track, s)?.innerHalfWidth ?? FAN_HALF_WIDTH)
          : branch.centre - branch.halfWidth,
      max:
        branch.id === 'outer'
          ? (s) =>
              ravelWingProfileAt(track, s)?.outerHalfWidth ?? FAN_HALF_WIDTH
          : branch.centre + branch.halfWidth,
      // Only the middle ribbon carries the moving wave. Each outboard wing is
      // one continuous static deck with its original eighty-metre floor.
      wave: branch.id === 'middle',
    })),
    {
      id: 'merge-inner',
      branch: 'inner',
      start: mergeStart,
      end: join,
      min: -140,
      max: (s) => lerp(-60, -50, joinT(s)),
    },
    {
      id: 'merge-middle',
      branch: 'middle',
      start: mergeStart,
      end: join,
      min: (s) => lerp(-40, -50, joinT(s)),
      max: (s) => lerp(40, 50, joinT(s)),
    },
    {
      id: 'merge-outer',
      branch: 'outer',
      start: mergeStart,
      end,
      min: 60,
      max: 140,
    },
    {
      id: 'merge-fan',
      branch: 'fan',
      start: join,
      end,
      min: (s) => lerp(-140, -50, narrow(s)),
      max: 50,
    },
    {
      id: 'main-after',
      branch: 'main',
      start: end,
      end: track.length,
      min: -50,
      max: 50,
    },
  ];
  return bands.filter((band) => band.end > band.start);
}

export function cutRavelRoadBandsAtJumps(track, bands) {
  const output = [];
  const outer = outerJump(track);
  for (const band of bands) {
    const cuts = new Set([band.start, band.end]);
    for (const jump of track.jumps ?? [])
      for (const distance of [jump.takeoff, jump.landingStart])
        if (distance > band.start && distance < band.end) cuts.add(distance);
    const stations = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i < stations.length - 1; i++) {
      const start = stations[i],
        end = stations[i + 1],
        mid = (start + end) / 2;
      if (
        (track.jumps ?? []).some(
          (jump) =>
            !jump.optional && mid > jump.takeoff && mid < jump.landingStart,
        )
      )
        continue;
      if (
        outer &&
        mid > outer.takeoff &&
        mid < outer.landingStart &&
        band.branch === 'outer'
      )
        continue;
      let clipped = [{ ...band }];
      for (const jump of track.jumps ?? []) {
        if (
          !jump.optional ||
          !(mid > jump.takeoff && mid < jump.landingStart) ||
          !Number.isFinite(jump.lateralMin)
        )
          continue;
        const gapMin = jump.lateralMin;
        const gapMax = Number.isFinite(jump.lateralMax)
          ? jump.lateralMax
          : track.width / 2;
        clipped = clipped.flatMap((piece) => {
          const bounds = ravelBandBounds(piece, mid);
          if (gapMax <= bounds.min || gapMin >= bounds.max) return [piece];
          const remaining = [];
          if (bounds.min < gapMin)
            remaining.push({
              ...piece,
              max: (s) => Math.min(valueAt(piece.max, s), gapMin),
            });
          if (bounds.max > gapMax)
            remaining.push({
              ...piece,
              min: (s) => Math.max(valueAt(piece.min, s), gapMax),
            });
          return remaining;
        });
      }
      output.push(
        ...clipped.map((piece, part) => ({
          ...piece,
          id: `${band.id}-${i}-${part}`,
          start,
          end,
        })),
      );
    }
  }
  return output;
}

function bandsAt(track, distance) {
  const s = station(track, distance);
  return track.roadBands.filter(
    (band) => s >= band.start - 1e-7 && s <= band.end + 1e-7,
  );
}

export function ravelBranchAt(track, distance, lateral) {
  const s = station(track, distance);
  const candidates = bandsAt(track, distance);
  const supported = candidates.find((band) => {
    const bounds = ravelBandBounds(band, s);
    return lateral >= bounds.min - 1e-6 && lateral <= bounds.max + 1e-6;
  });
  const nearest =
    supported ??
    candidates.reduce((best, band) => {
      const bounds = ravelBandBounds(band, s);
      const gap = Math.max(bounds.min - lateral, lateral - bounds.max, 0);
      if (!best || gap < best.gap) return { band, gap };
      return best;
    }, null)?.band;
  const fallback = nearestBranch(lateral);
  let bounds = nearest
    ? ravelBandBounds(nearest, s)
    : {
        min: fallback.centre - fallback.halfWidth,
        max: fallback.centre + fallback.halfWidth,
      };
  const sheet = track.sheetProfileAt?.(s);
  const id = nearest?.branch ?? fallback.id;
  if ((sheet || id === 'inner' || id === 'outer') && candidates.length) {
    // Static walls/wings and their floor are partitions of one surface.
    // Shared render seams never become invisible driving boundaries.
    const intervals = candidates
      .filter((band) => sheet || band.branch === id)
      .map((band) => ravelBandBounds(band, s))
      .sort((a, b) => a.min - b.min);
    const connected = [];
    for (const interval of intervals) {
      const previous = connected.at(-1);
      if (previous && interval.min <= previous.max + 1e-5)
        previous.max = Math.max(previous.max, interval.max);
      else connected.push({ ...interval });
    }
    bounds =
      connected.find(
        (interval) =>
          lateral >= interval.min - 1e-6 && lateral <= interval.max + 1e-6,
      ) ??
      connected.reduce((best, interval) => {
        const gap = Math.max(interval.min - lateral, lateral - interval.max, 0);
        return !best || gap < best.gap ? { interval, gap } : best;
      }, null)?.interval ??
      bounds;
  }
  const definition = RAVEL_BRANCHES.find((branch) => branch.id === id);
  return {
    id,
    centre: definition?.centre ?? 0,
    halfWidth:
      sheet?.halfWidth ?? definition?.halfWidth ?? RAVEL_MAIN_HALF_WIDTH,
    localLateral: lateral - (definition?.centre ?? 0),
    ...bounds,
    supported: Boolean(supported),
    band: nearest?.id ?? null,
  };
}

/** Pure static running skin. Wave code wraps this without sharing a clock. */
export function sampleRavelBaseSurface(track, distance, lateral) {
  const point = pointAndAcross(track, distance, lateral);
  const h = 0.5;
  const before = ravelBranchPoint(track, distance - h, lateral);
  const after = ravelBranchPoint(track, distance + h, lateral);
  const along = after
    .clone()
    .sub(before)
    .multiplyScalar(1 / (2 * h));
  const right = point.across.normalize();
  const shear = along.dot(right);
  const tangent = along.clone().addScaledVector(right, -shear);
  const metric = Math.max(0.05, tangent.length());
  tangent.multiplyScalar(1 / metric);
  const up = new Vector3().crossVectors(tangent, right).normalize();
  const branch = ravelBranchAt(track, distance, lateral);
  const s = station(track, distance);
  const band = track.roadBands.find(
    (candidate) => candidate.id === branch.band,
  );
  const boundsBefore =
    point.kind === 'sheet' ||
    point.kind === 'wing' ||
    branch.id === 'inner' ||
    branch.id === 'outer'
      ? ravelBranchAt(track, distance - h, lateral)
      : band
        ? ravelBandBounds(band, s - h)
        : branch;
  const boundsAfter =
    point.kind === 'sheet' ||
    point.kind === 'wing' ||
    branch.id === 'inner' ||
    branch.id === 'outer'
      ? ravelBranchAt(track, distance + h, lateral)
      : band
        ? ravelBandBounds(band, s + h)
        : branch;
  const curvature =
    after
      .clone()
      .add(before)
      .addScaledVector(point.position, -2)
      .multiplyScalar(1 / (h * h))
      .dot(right) /
    (metric * metric);
  return {
    ...point.base,
    position: point.position,
    right,
    up,
    tangent,
    quaternion: new Quaternion().setFromRotationMatrix(
      new Matrix4().makeBasis(right, up, tangent),
    ),
    curvature,
    bank: (point.base.bank ?? 0) + point.bank,
    roll: (point.base.roll ?? point.base.bank ?? 0) + point.bank,
    longitudinalMetric: metric,
    lateralMetric: point.lateralMetric ?? 1,
    longitudinalShear: shear,
    transverseCurvature: point.transverseCurvature ?? 0,
    kind: point.kind,
    sheetId: point.sheetId,
    wingId: point.wingId,
    period: 0,
    viewBlend: 1,
    branchId: branch.id,
    branchCenter: branch.centre,
    localLateral: branch.localLateral,
    supported: branch.supported,
    bounds: {
      min: branch.min,
      max: branch.max,
      minDerivative: (boundsAfter.min - boundsBefore.min) / (2 * h),
      maxDerivative: (boundsAfter.max - boundsBefore.max) / (2 * h),
    },
  };
}

export function installRavelBranches(track) {
  if (!track || typeof track.sampleBase !== 'function' || !track.braid)
    throw new TypeError('Ravel branches require sampleBase and braid markers.');
  const braid = braidData(track);
  if (!(
    braid.start > 0 &&
    braid.start < braid.splitEnd &&
    braid.splitEnd < braid.mergeStart &&
    braid.mergeStart < braid.end &&
    braid.end < track.length
  ))
    throw new RangeError('Invalid Ravel braid intervals.');
  track.braid = braid;
  track.ravelBranches = RAVEL_BRANCHES;
  track.wingProfileAt = (distance) => ravelWingProfileAt(track, distance);
  track.branchVersion = RAVEL_BRANCH_RULES;
  track.branchRulesId = `${RAVEL_BRANCH_RULES}:${JSON.stringify({
    mainHalfWidth: RAVEL_MAIN_HALF_WIDTH,
    branches: RAVEL_BRANCHES,
    shape: RAVEL_BRANCH_SHAPE,
    wings: RAVEL_BRANCH_WINGS,
    braid,
  })}`;
  track.roadBands = cutRavelRoadBandsAtJumps(track, rawBands(track));
  track.branchPoint = (distance, lateral) =>
    ravelBranchPoint(track, distance, lateral);
  track.sampleBranchSurface = (distance, lateral) =>
    sampleRavelBaseSurface(track, distance, lateral);
  track.branchAt = (distance, lateral) =>
    ravelBranchAt(track, distance, lateral);
  track.surfaceCoverage = (distance, lateral) =>
    Number(track.branchAt(distance, lateral).supported);
  track.preferredBranchLane = (state) => {
    const s = station(track, state.distance);
    if (s < braid.start - 200 || s >= (braid.receivingEnd ?? braid.end))
      return null;
    if (s >= braid.end) return 0;
    if (s >= braid.mergeStart) {
      const outer = outerJump(track);
      if (
        outer &&
        s < outer.landingStart &&
        nearestBranch(state.lateral).id === 'outer'
      )
        return 100;
      return 0;
    }
    let target;
    if (s >= braid.splitEnd) target = nearestBranch(state.lateral).centre;
    else {
      const identity = state.chassisId ?? state.shipId ?? 'middle';
      const hash = [...identity].reduce(
        (value, char) => value + char.charCodeAt(0),
        0,
      );
      target = RAVEL_BRANCHES[hash % RAVEL_BRANCHES.length].centre;
    }
    const branch = track.branchAt(s, state.lateral);
    // Entry fans grow continuously from the ordinary 100m road. Guide towards
    // a choice only as its actual supported width becomes available.
    if (s < braid.splitEnd && branch.id === 'fan')
      return clamp(target, branch.min + 5, branch.max - 5);
    if (s < braid.start) return clamp(target, -45, 45);
    return target;
  };
  return track;
}
