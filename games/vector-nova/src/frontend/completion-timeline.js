import { Vector3 } from 'three';
import {
  createLeviathanPath,
  NACRE_LEVIATHAN,
} from '../levels/nacre/environment/leviathan/path.js';
import { deviceSample } from '../pickups/sample-cues.js';

export const COMPLETION_DURATION = 11;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = (value) => value * value * (3 - 2 * value);
const unit = (time, start, end) =>
  clamp((time - start) / Math.max(0.01, end - start), 0, 1);
const valid = (value, fallback) => (Number.isFinite(value) ? value : fallback);
const vector = (value) =>
  value?.isVector3
    ? value.clone()
    : new Vector3().fromArray(value ?? [0, 0, 0]);
const globalUp = new Vector3(0, 1, 0);

// All cuts are anchored to observed production events. This module never
// generates a racer position, velocity, hit, jump, landing or finish.
export function completionShotPlan(run = {}) {
  const duration = valid(run.duration, COMPLETION_DURATION);
  const event = run.landmarks ?? {};
  const launch = clamp(valid(event.launchTime, 5.9), 3, duration - 3);
  const landing = clamp(
    valid(event.landingTime, launch + 1.9),
    launch + 0.5,
    duration - 1.8,
  );
  const fire = clamp(valid(event.firstFireTime, launch - 3), 1.2, launch - 1.5);
  const peak = clamp(
    valid(event.wormPeakTime, launch - 1.6),
    fire + 0.6,
    launch - 0.4,
  );
  const combat = clamp(fire - 0.5, 1.2, launch - 2.5);
  const breach = clamp(peak - 0.8, combat + 0.7, launch - 0.9);
  const flight = Math.max(breach + 0.55, launch - 0.3);
  const catchDeck = landing - 0.12;
  const exit = Math.min(duration - 1.2, landing + 1.1);
  const ends = [combat, breach, flight, catchDeck, exit, duration];
  const ids = ['chase', 'combat', 'leviathan', 'flight', 'landing', 'exit'];
  return {
    duration,
    shots: ids.map((id, index) => ({
      id,
      start: index ? ends[index - 1] : 0,
      end: ends[index],
    })),
    titleStart: Math.max(exit + 0.5, duration - 1.8),
  };
}

export function completionCueForEvent(event) {
  if (event.actor && event.actor !== 'hero') return null;
  if (event.type === 'jump-launch') return { id: 'jump-activate', gain: 0.65 };
  if (event.type === 'jump-transfer' && event.payload?.outcome === 'landed')
    return { id: 'jump-land', gain: 0.7 };
  return deviceSample(event);
}

function pointsAround(center, radius) {
  const points = [center];
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1])
        points.push(
          center.clone().add(new Vector3(x * radius, y * radius, z * radius)),
        );
  return points;
}

// Fit selected real subjects into a cinematic frame. Only the camera is pulled
// back; the native replay and the animal's production animation stay untouched.
function fitSubjects(
  position,
  target,
  up,
  fov,
  aspect,
  subjects,
  minimumY = -Infinity,
) {
  position.y = Math.max(position.y, minimumY);
  for (let iteration = 0; iteration < 8; iteration++) {
    const forward = target.clone().sub(position).normalize();
    const right = new Vector3().crossVectors(forward, up).normalize();
    const vertical = new Vector3().crossVectors(right, forward).normalize();
    const tangent = Math.tan((fov * Math.PI) / 360) * 0.84;
    const horizontal = tangent * Math.max(0.5, aspect);
    let pullback = 0;
    for (const subject of subjects) {
      const delta = subject.clone().sub(position);
      const depth = delta.dot(forward);
      pullback = Math.max(
        pullback,
        Math.abs(delta.dot(right)) / horizontal - depth,
        Math.abs(delta.dot(vertical)) / tangent - depth,
        2 - depth,
      );
    }
    position.addScaledVector(forward, -Math.max(0, pullback));
    position.y = Math.max(position.y, minimumY);
    if (pullback < 0.01) break;
  }
}

export function createCompletionDirector({ track, run }) {
  const plan = completionShotPlan(run);
  const path = createLeviathanPath(track);
  return {
    duration: plan.duration,
    shots: plan.shots,
    sample(value, recording, aspect = 1.6, leviathanPresentation) {
      const time = clamp(valid(value, 0), 0, plan.duration);
      const shot =
        plan.shots.find(({ end }) => time < end) ?? plan.shots.at(-1);
      const u = smooth(unit(time, shot.start, shot.end));
      const hero = recording.hero;
      const heroPosition = vector(hero.position);
      const distance = hero.state?.distance ?? hero.distance;
      const frame = track.sample(distance);
      const up = frame.up.clone();
      const focus = heroPosition.clone().addScaledVector(up, 0.6);
      const position = heroPosition.clone();
      const target = focus.clone();
      const subjects = pointsAround(focus, 3.8);
      let minimumY = -Infinity;
      let fov;
      const offset = (right, height, forward) =>
        position
          .addScaledVector(frame.right, right)
          .addScaledVector(up, height)
          .addScaledVector(frame.tangent, forward);
      if (shot.id === 'chase') {
        offset(-6 + u * 1.5, 3.4, -13);
        target.addScaledVector(frame.tangent, 6);
        fov = 58;
      } else if (shot.id === 'combat') {
        offset(10, 3, -10);
        const rivals = [recording.rook, recording.manta].filter(Boolean);
        rivals.sort(
          (a, b) =>
            vector(a.position).distanceToSquared(heroPosition) -
            vector(b.position).distanceToSquared(heroPosition),
        );
        if (rivals[0]) {
          const rival = vector(rivals[0].position).addScaledVector(up, 0.6);
          target.lerp(rival, 0.38);
          subjects.push(...pointsAround(rival, 3.5));
        }
        fov = 63;
      } else if (shot.id === 'leviathan') {
        // View the breach from above the actual bridge. Fitting a high animal
        // must never retreat down into the water or behind its guard fins.
        offset(-45, 55, -65);
        minimumY = Math.max(heroPosition.y, frame.position.y) + 20;
        const clock = leviathanPresentation ?? recording.leviathan;
        const body = [];
        if (clock?.active && Number.isFinite(clock.age)) {
          const head = path.headArc(clock.age);
          for (let back = 0; back <= NACRE_LEVIATHAN.length; back += 35) {
            const point = path.sample(head - back).position.clone();
            if (point.y > (track.waterY ?? 0) - 12) body.push(point);
          }
        }
        if (body.length) {
          const center = body
            .reduce((sum, point) => sum.add(point), new Vector3())
            .multiplyScalar(1 / body.length);
          target.lerp(center, 0.54);
          for (const point of body) subjects.push(...pointsAround(point, 20));
        }
        up.lerp(globalUp, 0.7).normalize();
        fov = 67;
      } else if (shot.id === 'flight') {
        // Follow the physical jump closely with its receiving deck ahead. The
        // worm remains scenery; it cannot pull this action shot away from the
        // racer or turn the flight into a distant side-on silhouette.
        offset(-12, 10, -15 + u * 2);
        minimumY = Math.max(heroPosition.y, frame.position.y) + 8;
        target.addScaledVector(frame.tangent, 6);
        fov = 59;
      } else if (shot.id === 'landing') {
        offset(8.5, 2.7, -11.5);
        target.addScaledVector(frame.tangent, 5);
        fov = 57;
      } else {
        // The native racer keeps driving. Finish on its wake rather than in
        // front of its underwater headlight cones.
        offset(7 - u * 1.5, 7 + u, -12 - u * 3);
        minimumY = Math.max(heroPosition.y, frame.position.y) + 6;
        target.addScaledVector(frame.tangent, 4);
        fov = 52 - u * 2;
      }
      fitSubjects(position, target, up, fov, aspect, subjects, minimumY);
      return {
        position,
        target,
        up,
        fov,
        shot: shot.id,
        title: smooth(unit(time, plan.titleStart, plan.titleStart + 0.7)),
      };
    },
  };
}
