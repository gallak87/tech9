import { Vector3 } from 'three';

// The level is viewed from the convoy's uniformly translating reference frame.
// Salt and wheel travel express its common ground speed. These rigid offsets
// are the additional, physically queried motion of each individual carrier.
export const NOMAD_MOTION_RULES = Object.freeze({
  version: 1,
  convoySpeed: 16,
  groundGrade: 0.025,
  period: 36,
  lateralAmplitude: 5,
  longitudinalAmplitude: 16,
  passingAmplitude: 28,
});

export function carrierMotionRules(carrier, index = carrier.index ?? 0) {
  if (carrier.motion) return carrier.motion;
  const passing = index === 5 || index === 6;
  return {
    period: passing ? 38 : NOMAD_MOTION_RULES.period + (index % 3) * 4,
    lateralAmplitude: passing ? 6 : NOMAD_MOTION_RULES.lateralAmplitude,
    longitudinalAmplitude: passing
      ? NOMAD_MOTION_RULES.passingAmplitude
      : NOMAD_MOTION_RULES.longitudinalAmplitude,
    phase: passing ? (index === 5 ? 0 : Math.PI) : index * 0.73,
  };
}

/** Pure rigid translation and exact material velocity in the convoy frame. */
export function sampleCarrierMotion(carrier, time = 0) {
  const rules = carrierMotionRules(carrier);
  const rate = (Math.PI * 2) / rules.period;
  const phase = rules.phase + time * rate;
  const z =
    rules.longitudinalAmplitude * (Math.sin(phase) - Math.sin(rules.phase));
  const x =
    rules.lateralAmplitude *
    (Math.sin(phase * 0.7 + 0.4) - Math.sin(rules.phase * 0.7 + 0.4));
  const vz = rules.longitudinalAmplitude * rate * Math.cos(phase);
  const vx = rules.lateralAmplitude * rate * 0.7 * Math.cos(phase * 0.7 + 0.4);
  return {
    translation: new Vector3(x, -NOMAD_MOTION_RULES.groundGrade * z, z),
    velocity: new Vector3(vx, -NOMAD_MOTION_RULES.groundGrade * vz, vz),
  };
}

export function installNomadMotion(track) {
  const nominalSample = track.sample.bind(track);
  const nominalSurface = track.sampleSurface?.bind(track);
  track.nominalSample = nominalSample;
  track.nominalSurface = nominalSurface;
  track.presentationTime = 0;
  track.movingSurfaces = true;
  track.motionRules = NOMAD_MOTION_RULES;
  for (const [index, carrier] of track.carriers.entries()) {
    carrier.index = index;
    carrier.motion ??= Object.freeze(carrierMotionRules(carrier, index));
  }
  track.motionAt = (distance, time = track.presentationTime) => {
    const carrier = track.carrierAt(distance);
    return carrier
      ? { ...sampleCarrierMotion(carrier, time), carrierId: carrier.id }
      : {
          translation: new Vector3(),
          velocity: new Vector3(),
          carrierId: null,
        };
  };
  track.frameAtTime = (distance, time = track.presentationTime) => {
    const frame = nominalSample(distance);
    return {
      ...frame,
      position: frame.position
        .clone()
        .add(track.motionAt(distance, time).translation),
    };
  };
  track.surfaceAtTime = (
    distance,
    lateral = 0,
    time = track.presentationTime,
  ) => {
    const base = nominalSurface?.(distance, lateral);
    const frame = base ?? nominalSample(distance);
    return {
      ...frame,
      position: frame.position
        .clone()
        .addScaledVector(frame.right, base ? 0 : lateral)
        .add(track.motionAt(distance, time).translation),
      bounds: frame.bounds ?? { min: -track.width / 2, max: track.width / 2 },
      longitudinalMetric: frame.longitudinalMetric ?? 1,
      lateralMetric: frame.lateralMetric ?? 1,
      longitudinalShear: frame.longitudinalShear ?? 0,
      viewBlend: frame.viewBlend ?? 1,
      motionGroup: track.carrierAt(distance)?.id ?? null,
      roadOwners: [`Nomad deck ${track.carrierAt(distance).index}`],
    };
  };
  track.sampleSurface = (distance, lateral = 0) =>
    track.surfaceAtTime(distance, lateral, track.presentationTime);
  track.pointAtTime = (distance, lateral = 0, time = track.presentationTime) =>
    track.surfaceAtTime(distance, lateral, time).position;
  // Hardware is authored on the nominal skin; presentation applies this same
  // rigid displacement rather than rebuilding or projecting its buffers.
  track.deviceMotionAt = (distance, time = track.presentationTime) =>
    track.motionAt(distance, time).translation;
  return track;
}
