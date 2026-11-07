import { Quaternion, Vector3 } from 'three';
import { deviceSample } from '../pickups/sample-cues.js';
import { COMPLETION_DURATION } from './completion-config.js';

export { COMPLETION_DURATION };
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
  const launch = event.launchTime,
    landing = event.landingTime,
    finish = event.finishTime;
  if (
    ![launch, landing, finish].every(Number.isFinite) ||
    !(launch > 0.8 && landing > launch && finish > landing && duration > finish)
  )
    throw new Error(
      'Completion requires a recorded launch, landing and actual finish.',
    );
  const shots = [];
  const append = (id, end) => {
    const start = shots.at(-1)?.end ?? 0;
    if (end > start + 0.05) shots.push({ id, start, end });
  };
  const fire = event.firstFireTime;
  if (Number.isFinite(fire) && fire > 0.6 && fire < launch - 1.5) {
    const combat = Math.max(0.45, fire - 0.5);
    append('chase', combat);
    append(
      'combat',
      Math.min(
        launch - 1,
        Math.max(fire + 1.05, valid(event.firstHitTime, fire) + 0.6),
      ),
    );
  } else append('chase', Math.max(0.5, launch - 2));
  append('approach', launch - 0.3);
  append('flight', landing - 0.12);
  append('landing', Math.min(landing + 1, finish - 1.2));
  append('run-in', finish - 0.85);
  const finishHold = Number.isFinite(event.slideStartTime)
    ? Math.max(finish + 0.12, event.slideStartTime - 0.02)
    : finish + 0.4;
  append('finish', Math.min(duration - 0.2, finishHold));
  append('exit', duration);
  return { duration, shots, titleStart: finish + 0.3 };
}

export function completionCueForEvent(event) {
  if (event.actor && event.actor !== 'hero') return null;
  if (event.type === 'sprint-complete')
    return {
      id: event.place === 1 ? 'race-winner' : 'race-finisher',
      gain: 0.8,
    };
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
// back; the native replay remains untouched.
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
  const finishDistance = run.landmarks.finishDistance ?? track.finishDistance;
  if (
    !Number.isFinite(finishDistance) ||
    Math.abs(finishDistance - track.finishDistance) > 1e-5
  )
    throw new Error('Completion must frame the production finish distance.');
  const finishFrame = track.sample(finishDistance);
  const landingFrame = run.frames.find(
    (frame) => frame.time >= run.landmarks.landingTime,
  );
  const landingPosition = vector(landingFrame.hero.position);
  return {
    duration: plan.duration,
    shots: plan.shots,
    sample(value, recording, aspect = 1.6) {
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
      } else if (shot.id === 'flight') {
        // Follow the native airborne velocity, not the takeoff's now-distant
        // road frame. The recorded receiver is the only secondary focus.
        const travel = vector(hero.motion?.flight?.velocity);
        if (travel.lengthSq() < 1) travel.copy(frame.tangent);
        travel.normalize();
        const side = new Vector3().crossVectors(globalUp, travel).normalize();
        if (side.dot(frame.right) < 0) side.negate();
        up.copy(globalUp);
        position
          .addScaledVector(side, -11)
          .addScaledVector(globalUp, 8)
          .addScaledVector(travel, -16);
        minimumY = heroPosition.y + 7;
        target.addScaledVector(travel, 8);
        target.lerp(
          landingPosition,
          0.14 *
            unit(
              time,
              run.landmarks.landingTime - 1.2,
              run.landmarks.landingTime,
            ),
        );
        fov = 59;
      } else if (shot.id === 'landing') {
        offset(8.5, 5, -13);
        minimumY = heroPosition.y + 4;
        target.addScaledVector(frame.tangent, 5);
        fov = 57;
      } else if (shot.id === 'finish') {
        // The real production checker stays fixed while the genuine racer
        // crosses it. Fit both subjects, including the full painted width.
        up.copy(finishFrame.up);
        position
          .copy(finishFrame.position)
          .addScaledVector(finishFrame.right, 23)
          .addScaledVector(up, 13)
          .addScaledVector(finishFrame.tangent, 30);
        target
          .copy(finishFrame.position)
          .addScaledVector(up, 0.8)
          .lerp(focus, 0.35);
        const width = track.width - Math.min(1.6, track.width * 0.1);
        for (const lateral of [-width / 2, width / 2])
          for (const depth of [-1.5, 1.5])
            subjects.push(
              finishFrame.position
                .clone()
                .addScaledVector(finishFrame.right, lateral)
                .addScaledVector(finishFrame.tangent, depth)
                .addScaledVector(up, 0.15),
            );
        minimumY = finishFrame.position.y + 8;
        fov = 54;
      } else if (shot.id === 'approach' || shot.id === 'run-in') {
        offset(-7 + u * 2, 4.5, -15);
        target.addScaledVector(frame.tangent, 8);
        fov = 58;
      } else {
        // Hold most of the viewing angle against the road so the native little
        // powerslide remains visible. A camera locked to the nose would hide
        // its yaw; a head-on view would stare into the forward light cones.
        const nose = new Vector3(0, 0, 1).applyQuaternion(
          new Quaternion().fromArray(hero.quaternion),
        );
        nose.addScaledVector(up, -nose.dot(up)).normalize();
        const forward = frame.tangent.clone().lerp(nose, 0.1).normalize();
        const side = frame.right
          .clone()
          .addScaledVector(forward, -frame.right.dot(forward))
          .normalize();
        position
          .addScaledVector(side, -14)
          .addScaledVector(forward, 8.5)
          .addScaledVector(up, 4.5 + u * 0.5);
        minimumY = heroPosition.y + 4;
        fov = 51 - u * 2;
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
