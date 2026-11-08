import { MathUtils } from 'three';
import { cutRavelRoadBandsAtJumps } from './branches.js';

export const RAVEL_SHEET_RULES = 'ravel-sheet-v2-continuous-asymmetric-folds';
export const RAVEL_SHEET_PROTOTYPE = Object.freeze({
  id: 'first-sail-bowl',
  start: 120,
  entryEnd: 450,
  plateauEnd: 1050,
  end: 1280,
  mainHalfWidth: 50,
  halfWidth: 650,
  radius: 320,
  leftRadius: 700,
  rightRadius: 320,
  tilt: 0.1,
  waveHalfWidth: 120,
});

const smooth = (value) => {
  const t = MathUtils.clamp(value, 0, 1);
  return t * t * t * (10 + t * (-15 + 6 * t));
};
const station = (track, distance) =>
  track.closed === false
    ? MathUtils.clamp(distance, 0, track.length)
    : MathUtils.euclideanModulo(distance, track.length);
const valueAt = (value, s) => (typeof value === 'function' ? value(s) : value);

export function ravelAdditionalSheets(track) {
  const braid = track.braid;
  return [
    {
      ...RAVEL_SHEET_PROTOTYPE,
      id: 'ascent-sail-fold',
      start: 2555,
      entryEnd: 2760,
      plateauEnd: 3260,
      end: 3475,
      leftHalfWidth: 650,
      rightHalfWidth: 500,
      leftRadius: 320,
      rightRadius: 500,
      tilt: 0.18,
    },
    {
      ...RAVEL_SHEET_PROTOTYPE,
      id: 'braid-sail-fan',
      start: braid.start,
      entryEnd: braid.start + 210,
      plateauEnd: braid.splitEnd - 200,
      end: braid.splitEnd,
      leftHalfWidth: 520,
      rightHalfWidth: 650,
      leftRadius: 460,
      rightRadius: 320,
      tilt: -0.16,
      endHalfWidth: 140,
      forkStart: braid.splitEnd - 140,
    },
  ];
}

/** Transverse coordinates are real arc metres on one continuous membrane. */
export function sheetProfileAt(track, distance) {
  const wrapped = station(track, distance);
  const sheet = track.sheetProfiles?.find(
    (p) => wrapped >= p.start - 1e-7 && wrapped <= p.end + 1e-7,
  );
  if (!sheet) return null;
  const s = MathUtils.clamp(wrapped, sheet.start, sheet.end);
  const u = (s - sheet.start) / (sheet.end - sheet.start);
  const envelope =
    smooth((s - sheet.growthStart) / (sheet.entryEnd - sheet.growthStart)) *
    (1 - smooth((s - sheet.plateauEnd) / (sheet.end - sheet.plateauEnd)));
  const baseline = MathUtils.lerp(
    sheet.mainHalfWidth,
    sheet.endHalfWidth ?? sheet.mainHalfWidth,
    smooth(u),
  );
  const leftHalfWidth = MathUtils.lerp(
    baseline,
    sheet.leftHalfWidth ?? sheet.halfWidth,
    envelope,
  );
  const rightHalfWidth = MathUtils.lerp(
    baseline,
    sheet.rightHalfWidth ?? sheet.halfWidth,
    envelope,
  );
  return {
    ...sheet,
    envelope,
    leftHalfWidth,
    rightHalfWidth,
    halfWidth: Math.max(leftHalfWidth, rightHalfWidth),
    curvature: envelope / sheet.radius,
    leftCurvature: envelope / (sheet.leftRadius ?? sheet.radius),
    rightCurvature: envelope / (sheet.rightRadius ?? sheet.radius),
    tilt: (sheet.tilt ?? 0) * envelope * Math.sin(2 * Math.PI * u),
  };
}

export function sheetBoundsAt(track, distance) {
  const profile = sheetProfileAt(track, distance);
  return profile
    ? { min: -profile.leftHalfWidth, max: profile.rightHalfWidth }
    : null;
}

/** The unequal circles share position and tangent at the central floor. */
export function ravelSheetPointProfile(track, distance, lateral) {
  const profile = sheetProfileAt(track, distance);
  if (!profile) return null;
  const base = track.sampleBase(distance);
  const curvature =
    lateral < 0 ? profile.leftCurvature : profile.rightCurvature;
  const angle = curvature * lateral;
  const across = curvature < 1e-9 ? lateral : Math.sin(angle) / curvature;
  // 2 sin²(theta/2) avoids cancellation while a fold grows from a flat sheet.
  const height =
    curvature < 1e-9 ? 0 : (2 * Math.sin(angle / 2) ** 2) / curvature;
  const right = base.right
    .clone()
    .multiplyScalar(Math.cos(profile.tilt))
    .addScaledVector(base.up, Math.sin(profile.tilt));
  const up = base.up
    .clone()
    .multiplyScalar(Math.cos(profile.tilt))
    .addScaledVector(base.right, -Math.sin(profile.tilt));
  return {
    position: base.position
      .clone()
      .addScaledVector(right, across)
      .addScaledVector(up, height),
    across: right
      .multiplyScalar(Math.cos(angle))
      .addScaledVector(up, Math.sin(angle)),
    base,
    bank: angle + profile.tilt,
    transverseCurvature: curvature,
    lateralMetric: 1,
    kind: 'sheet',
    sheetId: profile.id,
    sheetProfile: profile,
  };
}

export function ravelSheetPoint(track, distance, lateral) {
  return ravelSheetPointProfile(track, distance, lateral)?.position ?? null;
}

function crossing(track, profile, side, target, low, high, rising) {
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    const value = sheetProfileAt(track, mid)[side];
    if (value < target === rising) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function cutFork(profile, original) {
  if (!Number.isFinite(profile.forkStart)) return original;
  const holes = [-50, 50].map((centre) => ({
    min: (s) =>
      centre -
      10 * smooth((s - profile.forkStart) / (profile.end - profile.forkStart)),
    max: (s) =>
      centre +
      10 * smooth((s - profile.forkStart) / (profile.end - profile.forkStart)),
  }));
  const result = [];
  for (const band of original) {
    const cuts = [band.start, band.end];
    if (profile.forkStart > band.start && profile.forkStart < band.end)
      cuts.push(profile.forkStart);
    cuts.sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const start = cuts[i],
        end = cuts[i + 1],
        mid = (start + end) / 2;
      let pieces = [{ ...band, start, end }];
      if (mid > profile.forkStart)
        for (const hole of holes) {
          pieces = pieces.flatMap((piece) => {
            const low = valueAt(piece.min, mid),
              high = valueAt(piece.max, mid);
            if (hole.max(mid) <= low || hole.min(mid) >= high) return [piece];
            const kept = [];
            if (low < hole.min(mid))
              kept.push({
                ...piece,
                max: (s) => Math.min(valueAt(piece.max, s), hole.min(s)),
              });
            if (high > hole.max(mid))
              kept.push({
                ...piece,
                min: (s) => Math.max(valueAt(piece.min, s), hole.max(s)),
              });
            return kept;
          });
        }
      pieces.forEach((piece, j) =>
        result.push({ ...piece, id: `${band.id}-fork-${i}-${j}` }),
      );
    }
  }
  return result;
}

function prototypeBands(track, p) {
  const profile = (s) =>
    sheetProfileAt(track, MathUtils.clamp(s, p.start, p.end));
  const min = (s) => -profile(s).leftHalfWidth;
  const max = (s) => profile(s).rightHalfWidth;
  const entries = ['leftHalfWidth', 'rightHalfWidth'].map((side) =>
    crossing(track, p, side, p.waveHalfWidth, p.growthStart, p.entryEnd, true),
  );
  const exits = ['leftHalfWidth', 'rightHalfWidth'].map((side) =>
    // The braid ends at 140m half-width, so its wall never reaches the 120m
    // floor boundary. Preserve that final strip until its branch takes over.
    (p.endHalfWidth ?? p.mainHalfWidth) >= p.waveHalfWidth
      ? p.end
      : crossing(track, p, side, p.waveHalfWidth, p.plateauEnd, p.end, false),
  );
  const cuts = [...new Set([p.start, p.end, ...entries, ...exits])].sort(
    (a, b) => a - b,
  );
  const bands = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i],
      end = cuts[i + 1],
      mid = (start + end) / 2;
    const leftWall = -min(mid) > p.waveHalfWidth;
    const rightWall = max(mid) > p.waveHalfWidth;
    const band = (id, low, high, wave) => ({
      id: `${p.id}-${id}-${i}`,
      branch: 'main',
      start,
      end,
      min: low,
      max: high,
      wave,
      sheetId: p.id,
    });
    if (leftWall) bands.push(band('left-wall', min, -p.waveHalfWidth, false));
    bands.push(
      band(
        'floor',
        leftWall ? -p.waveHalfWidth : min,
        rightWall ? p.waveHalfWidth : max,
        true,
      ),
    );
    if (rightWall) bands.push(band('right-wall', p.waveHalfWidth, max, false));
  }
  return cutFork(p, bands);
}

export function installRavelSheets(track, options = {}) {
  if (typeof track.sampleBase !== 'function' || !Array.isArray(track.roadBands))
    throw new TypeError('Install Ravel branches before its continuous sheets.');
  const { profiles, includeAdditional = false, ...firstOverrides } = options;
  const definitions = profiles ?? [
    { ...RAVEL_SHEET_PROTOTYPE, ...firstOverrides },
    ...(includeAdditional ? ravelAdditionalSheets(track) : []),
  ];
  const prepared = definitions
    .map((definition) => {
      const p = { ...RAVEL_SHEET_PROTOTYPE, ...definition };
      const earlyMandatory = (track.jumps ?? []).filter(
        (jump) =>
          !jump.optional &&
          jump.takeoff >= p.start &&
          jump.takeoff < p.entryEnd,
      );
      p.growthStart = Math.max(
        p.start,
        ...earlyMandatory.map((jump) => jump.landingStart + 40),
      );
      if (!(
        p.start >= 0 &&
        p.start <= p.growthStart &&
        p.growthStart < p.entryEnd &&
        p.entryEnd < p.plateauEnd &&
        p.plateauEnd < p.end &&
        p.end < track.length &&
        (p.leftHalfWidth ?? p.halfWidth) > p.waveHalfWidth &&
        (p.rightHalfWidth ?? p.halfWidth) > p.waveHalfWidth &&
        p.waveHalfWidth > p.mainHalfWidth &&
        p.radius > 0
      ))
        throw new RangeError(`Invalid Ravel sheet profile: ${p.id}`);
      return Object.freeze(p);
    })
    .sort((a, b) => a.start - b.start);
  if (prepared.some((p, i) => i && p.start <= prepared[i - 1].end))
    throw new RangeError(
      'Ravel sheets must occupy separate longitudinal bays.',
    );
  track.sheetProfiles = Object.freeze(prepared);
  track.sheetPrototype = prepared[0];
  track.sheetProfileAt = (s) => sheetProfileAt(track, s);
  track.sheetBoundsAt = (s) => sheetBoundsAt(track, s);
  track.sheetPoint = (s, x) => ravelSheetPoint(track, s, x);
  track.sheetPointProfile = (s, x) => ravelSheetPointProfile(track, s, x);
  const retained = [];
  for (const old of track.roadBands) {
    let pieces = [{ ...old }];
    for (const profile of prepared)
      pieces = pieces.flatMap((piece) => {
        if (piece.end <= profile.start || piece.start >= profile.end)
          return [piece];
        const kept = [];
        if (piece.start < profile.start)
          kept.push({ ...piece, end: profile.start });
        if (piece.end > profile.end)
          kept.push({ ...piece, start: profile.end });
        return kept;
      });
    retained.push(...pieces);
  }
  track.roadBands = cutRavelRoadBandsAtJumps(track, [
    ...retained,
    ...prepared.flatMap((profile) => prototypeBands(track, profile)),
  ]).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  track.sheetRulesId = `${RAVEL_SHEET_RULES}:${JSON.stringify(prepared)}`;
  track.branchRulesId += `:${track.sheetRulesId}`;
  return track;
}
