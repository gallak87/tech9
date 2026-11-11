import * as T from 'three';
import { createLaunchworksTrack } from '../levels/launchworks/track/model.js';
import { createTubeSurface } from '../levels/shatterline/track/tube-surface.js';

const up = new T.Vector3(0, 1, 0);
const clamp = T.MathUtils.clamp;
const smooth = (t) => t * t * t * (10 + t * (-15 + 6 * t));

/** Recompose the proven transfer envelopes into another world. Changes in
 * heading happen on supported connecting road, outside launch/arrival runs;
 * gravity, real gap lengths, departure pitch and generous catches are retained.
 */
export function createTransferCourse({
  id,
  name,
  labels,
  turns,
  pipeLandings,
  width = 52,
  offset = [0, 0, 0],
}) {
  const source = createLaunchworksTrack();
  const knots = [[0, turns[0]]];
  for (let i = 1; i < source.jumps.length; i++) {
    knots.push([source.jumps[i - 1].recovery + 20, turns[i - 1]]);
    knots.push([source.jumps[i].takeoff - 210, turns[i]]);
  }
  knots.push([source.length, turns.at(-1)]);
  function turnAt(s) {
    for (let i = 1; i < knots.length; i++) {
      const [b, angleB] = knots[i],
        [a, angleA] = knots[i - 1];
      if (s <= b)
        return T.MathUtils.lerp(
          angleA,
          angleB,
          smooth(clamp((s - a) / (b - a), 0, 1)),
        );
    }
    return turns.at(-1);
  }
  const steps = Math.ceil(source.length),
    points = [source.sample(0).position];
  for (let i = 1; i <= steps; i++) {
    const a = Math.min(i - 1, source.length),
      b = Math.min(i, source.length);
    const delta = source.sample(b).position.sub(source.sample(a).position);
    delta.applyAxisAngle(up, turnAt((a + b) / 2));
    points.push(points.at(-1).clone().add(delta));
  }
  const bounds = new T.Box3().setFromPoints(points);
  const shift = new T.Vector3(...offset);
  shift.x -= (bounds.min.x + bounds.max.x) / 2;
  shift.z -= (bounds.min.z + bounds.max.z) / 2;
  for (const point of points) point.add(shift);
  // Retain the authored metre nodes while giving the contact chart a continuous
  // first derivative. Tube support differentiates this centreline over 2 mm;
  // linear chords otherwise turn every metre boundary into a camera/ship kick.
  const derivatives = points.map((_, index) => {
    const before = Math.max(0, index - 1),
      after = Math.min(steps, index + 1);
    return points[after]
      .clone()
      .sub(points[before])
      .divideScalar(
        Math.min(after, source.length) - Math.min(before, source.length),
      );
  });
  function sample(distance) {
    const s = clamp(distance, 0, source.length),
      index = Math.floor(s);
    const frame = source.sample(s);
    const span = Math.min(index + 1, source.length) - index;
    const next = Math.min(index + 1, steps),
      t = span > 0 ? (s - index) / span : 0,
      t2 = t * t,
      t3 = t2 * t;
    const position = points[index]
      .clone()
      .multiplyScalar(2 * t3 - 3 * t2 + 1)
      .addScaledVector(derivatives[index], span * (t3 - 2 * t2 + t))
      .addScaledVector(points[next], -2 * t3 + 3 * t2)
      .addScaledVector(derivatives[next], span * (t3 - t2));
    const tangent = points[index]
      .clone()
      .multiplyScalar(6 * t2 - 6 * t)
      .addScaledVector(derivatives[index], span * (3 * t2 - 4 * t + 1))
      .addScaledVector(points[next], -6 * t2 + 6 * t)
      .addScaledVector(derivatives[next], span * (3 * t2 - 2 * t))
      .normalize();
    if (!span) tangent.copy(derivatives[index]).normalize();
    const right = new T.Vector3(tangent.z, 0, -tangent.x)
      .normalize()
      .applyAxisAngle(tangent, frame.roll);
    const normal = new T.Vector3().crossVectors(tangent, right).normalize();
    // Keep the supported rear staging extension; forward lookahead must stop
    // at the road endpoint rather than invent a continuation beyond the finish.
    if (distance < 0) position.addScaledVector(tangent, distance);
    return {
      ...frame,
      position,
      tangent,
      right,
      up: normal,
      curvature: frame.curvature + (turnAt(s + 1) - turnAt(s - 1)) / 2,
      quaternion: new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, normal, tangent),
      ),
    };
  }
  const jumps = source.jumps.map((jump, i) => ({
    ...jump,
    label: labels[i],
    receiverType: pipeLandings.includes(i)
      ? 'tube'
      : jump.receiverType === 'tube'
        ? 'bank'
        : jump.receiverType,
    halfWidth: width / 2,
    catchWidth: width - 4,
  }));
  const tubes = createTubeSurface({
    sample,
    width,
    tubes: pipeLandings.map((i) => ({
      id: `${id}-receiver-${i + 1}`,
      start: jumps[i].landingStart,
      end: jumps[i].landingStart + 420,
      radius: width / 2,
      entryLength: 120,
      exitLength: 150,
      rimTransitionLength: 40,
      toeTransitionLength: 20,
      exposedStart: jumps[i].landingStart,
      exposedEnd: jumps[i].landingStart + 420,
    })),
  });
  return {
    ...source,
    id: `${id}-transfers-v1`,
    name,
    width,
    sample,
    jumps,
    geometryVersion: `${id}-c1-pipe-arrivals-v2:${source.geometryVersion}`,
    curtains: [],
    sections: source.sections.map((section, i) => ({
      ...section,
      id: `arrival-${i + 1}`,
      name: labels[i],
      label: labels[i],
    })),
    routeMoments: source.routeMoments.filter(
      (moment) => moment.type !== 'waterfall',
    ),
    tubes: tubes.descriptors,
    tubeMesh: tubes.mesh,
    tubeAt: tubes.tubeAt,
    tubeProfile: tubes.profileAt,
    sampleSurface: tubes.sampleSurface,
    bounds: new T.Box3().setFromPoints(points).expandByScalar(700),
  };
}
