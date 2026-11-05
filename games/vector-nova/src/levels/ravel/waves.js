import { Matrix4, Quaternion } from 'three';

export const RAVEL_WAVE_RULES = Object.freeze({
  version: 2,
  amplitude: 14,
  wavelength: 220,
  speed: -48,
  edgeWidth: 20,
  edgeBlend: 25,
  outerFadeStart: 60,
  outerFadeEnd: 120,
  fadeLength: 55,
  crestRampHeight: 3,
  crestRampLength: 80,
});
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
const station = (track, distance) =>
  track.closed === false
    ? clamp(distance, 0, track.length)
    : ((distance % track.length) + track.length) % track.length;
const basis = new Matrix4();

export function ravelJumpLaneBounds(track, jump) {
  const half = track.roadHalfWidth ?? (track.mainWidth ?? 100) / 2;
  if (Number.isFinite(jump.lateralMin) && Number.isFinite(jump.lateralMax))
    return { min: jump.lateralMin, max: jump.lateralMax };
  if (jump.lane === 'outer' || jump.id.includes('outer'))
    return { min: 60, max: 140 };
  return { min: 3, max: half };
}
function branchInfo(track, distance, lateral) {
  return (
    track.branchAt?.(distance, lateral) ?? {
      id: 'main',
      branchId: 'main',
      localLateral: lateral,
    }
  );
}
function localAcross(info, lateral) {
  if (Number.isFinite(info.localLateral)) return info.localLateral;
  return lateral - (info.center ?? info.branchCenter ?? 0);
}
function activeZone(track, distance, lateral) {
  const info = branchInfo(track, distance, lateral);
  const id = info.branchId ?? info.id ?? 'main';
  return (track.waveZones ?? []).find(
    (zone) =>
      distance >= zone.start &&
      distance <= zone.end &&
      (!zone.branchIds || zone.branchIds.includes(id)),
  );
}

/** All mutable motion is supplied as time; this sampler owns no clocks. */
export function sampleRavelWave(track, distance, lateral = 0, time = 0) {
  const s = station(track, distance);
  const info = branchInfo(track, s, lateral);
  const zone = activeZone(track, s, lateral);
  let height = 0;
  let materialVelocity = 0;
  let phase = 0;
  let weight = 0;
  if (zone) {
    const branchId = info.branchId ?? info.id;
    const definition = track.ravelBranches?.find(
      (entry) => entry.id === branchId,
    );
    const half =
      zone.halfWidth ??
      info.halfWidth ??
      definition?.halfWidth ??
      (['inner', 'middle', 'outer'].includes(branchId)
        ? 40
        : (track.roadHalfWidth ?? 50));
    const across = localAcross(info, lateral);
    const seam = smooth(
      (across + half - RAVEL_WAVE_RULES.edgeWidth) / RAVEL_WAVE_RULES.edgeBlend,
    );
    const fade = Math.min(
      zone.fadeLength ?? RAVEL_WAVE_RULES.fadeLength,
      (zone.end - zone.start) / 3,
    );
    const envelope =
      smooth((s - zone.start) / fade) * smooth((zone.end - s) / fade);
    const outerFadeStart =
      zone.outerFadeStart ?? RAVEL_WAVE_RULES.outerFadeStart;
    const outerFadeEnd = zone.outerFadeEnd ?? RAVEL_WAVE_RULES.outerFadeEnd;
    const outer =
      1 -
      smooth(
        (Math.abs(across) - outerFadeStart) / (outerFadeEnd - outerFadeStart),
      );
    weight = envelope * seam * outer;
    const amplitude = zone.amplitude ?? RAVEL_WAVE_RULES.amplitude;
    const wavelength = zone.wavelength ?? RAVEL_WAVE_RULES.wavelength;
    const speed = zone.speed ?? RAVEL_WAVE_RULES.speed;
    phase =
      ((s - zone.start - speed * time) / wavelength) * TAU + (zone.phase ?? 0);
    height = (amplitude * weight * (1 + Math.cos(phase))) / 2;
    materialVelocity =
      (amplitude * weight * Math.sin(phase) * Math.PI * speed) / wavelength;
  }
  // The crest lane has its own shallow fixed lip. Its mathematical chart
  // continues through the authored gap; coverage, not a height discontinuity,
  // releases support there. The receiving deck is exactly unmodified.
  let rampHeight = 0;
  for (const jump of track.jumps ?? []) {
    if (!jump.optional || !(jump.lane === 'crest' || jump.id.includes('crest')))
      continue;
    const bounds = ravelJumpLaneBounds(track, jump);
    const lane =
      smooth((lateral - bounds.min) / 6) *
      smooth((bounds.max + 2 - lateral) / 2);
    if (!lane) continue;
    const rampStart = jump.takeoff - RAVEL_WAVE_RULES.crestRampLength;
    const rise = smooth((s - rampStart) / RAVEL_WAVE_RULES.crestRampLength);
    const settle =
      1 - smooth((s - jump.takeoff) / (jump.landingStart - jump.takeoff));
    if (s >= rampStart && s < jump.landingStart)
      rampHeight += RAVEL_WAVE_RULES.crestRampHeight * lane * rise * settle;
  }
  return {
    id: zone?.id ?? null,
    zone: zone ?? null,
    phase,
    weight,
    height: height + rampHeight,
    dynamicHeight: height,
    rampHeight,
    materialVelocity,
    rising: materialVelocity > 0.1,
  };
}

/** Position-only path for the dynamic road's shared vertex grid. */
export function ravelPointAtTime(track, distance, lateral = 0, time = 0) {
  const point = track.branchPoint
    ? track.branchPoint(distance, lateral)
    : track
        .sample(distance)
        .position.clone()
        .addScaledVector(track.sample(distance).right, lateral);
  const wave = sampleRavelWave(track, distance, lateral, time);
  if (wave.height)
    point.addScaledVector(track.sample(distance).up, wave.height);
  return point;
}

/** Geometry, support and takeoff direction share this one deformed chart. */
export function sampleRavelSurface(track, distance, lateral = 0, time = 0) {
  const base = track.sampleBranchSurface
    ? track.sampleBranchSurface(distance, lateral)
    : {
        ...track.sample(distance),
        min: -(track.roadHalfWidth ?? 50),
        max: track.roadHalfWidth ?? 50,
      };
  const wave = sampleRavelWave(track, distance, lateral, time);
  if (!wave.height && !wave.zone) {
    return track.sampleBranchSurface
      ? base
      : {
          ...base,
          position: base.position.clone().addScaledVector(base.right, lateral),
        };
  }
  const position = ravelPointAtTime(track, distance, lateral, time);
  const ds = 0.4;
  const dx = 0.15;
  const along = ravelPointAtTime(track, distance + ds, lateral, time)
    .sub(ravelPointAtTime(track, distance - ds, lateral, time))
    .multiplyScalar(1 / (2 * ds));
  const across = ravelPointAtTime(track, distance, lateral + dx, time)
    .sub(ravelPointAtTime(track, distance, lateral - dx, time))
    .multiplyScalar(1 / (2 * dx));
  const right = across.clone().normalize();
  const longitudinalShear = along.dot(right);
  const tangent = along.clone().addScaledVector(right, -longitudinalShear);
  const longitudinalMetric = tangent.length();
  tangent.normalize();
  const up = tangent.clone().cross(right).normalize();
  return {
    ...base,
    position,
    right,
    tangent,
    up,
    quaternion: new Quaternion().setFromRotationMatrix(
      basis.makeBasis(right, up, tangent),
    ),
    longitudinalMetric,
    lateralMetric: across.length(),
    longitudinalShear,
    wave,
  };
}

export function ravelWaveTimeForPhase(track, distance, phase, lateral = 30) {
  const zone = activeZone(track, station(track, distance), lateral);
  if (!zone) return 0;
  const wavelength = zone.wavelength ?? RAVEL_WAVE_RULES.wavelength;
  const speed = zone.speed ?? RAVEL_WAVE_RULES.speed;
  if (!speed) return 0;
  const period = wavelength / Math.abs(speed);
  const time =
    (distance - zone.start + (((zone.phase ?? 0) - phase) * wavelength) / TAU) /
    speed;
  return ((time % period) + period) % period;
}

export function installRavelWaves(track) {
  const crest = track.jumps?.find(
    (jump) => jump.lane === 'crest' || jump.id.includes('crest'),
  );
  const braid = track.braid ?? track.branchDistrict;
  track.waveZones ??= [
    {
      id: 'first-swell',
      // The driving guide stays 100m wide inside the much larger sail bowl.
      halfWidth: (track.mainWidth ?? 100) / 2,
      start: crest ? Math.max(0, crest.takeoff - 370) : 580,
      end: crest ? crest.landingStart : 1080,
      amplitude: 14,
      wavelength: 220,
      speed: -48,
    },
    {
      id: 'ascent-swell',
      halfWidth: (track.mainWidth ?? 100) / 2,
      start: 2640,
      end: 3300,
      amplitude: 16,
      wavelength: 240,
      speed: -54,
      fadeLength: 90,
    },
    ...(braid
      ? [
          {
            id: 'fan-swell',
            halfWidth: (track.mainWidth ?? 100) / 2,
            // Keep combat hardware quiet before the moving fork approach.
            start: braid.splitEnd - 400,
            end: braid.splitEnd - 40,
            amplitude: 14,
            wavelength: 220,
            speed: -52,
            branchIds: ['main'],
          },
          {
            id: 'braid-swell',
            start: (braid.splitEnd ?? braid.start + 260) + 30,
            end: (braid.mergeStart ?? braid.end - 260) - 30,
            amplitude: 18,
            wavelength: 240,
            speed: -60,
            fadeLength: 85,
            branchIds: ['middle'],
          },
        ]
      : []),
  ];
  track.presentationTime = 0;
  track.waveAt = (s, x = 0, time = track.presentationTime) =>
    sampleRavelWave(track, s, x, time);
  track.pointAtTime = (s, x = 0, time = track.presentationTime) =>
    ravelPointAtTime(track, s, x, time);
  track.surfaceAtTime = (s, x = 0, time = track.presentationTime) =>
    sampleRavelSurface(track, s, x, time);
  track.sampleSurface = track.surfaceAtTime;
  return track;
}
