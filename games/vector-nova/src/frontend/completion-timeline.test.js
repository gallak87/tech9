import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { getCollisionHull } from '../ships/collision-hulls.js';
import { createLevel3Track } from '../levels/nacre/track/model.js';
import {
  createLeviathanPath,
  NACRE_LEVIATHAN,
} from '../levels/nacre/environment/leviathan/path.js';
import {
  generateCompletionRun,
  sampleCompletionRun,
} from './completion-run.js';
import {
  COMPLETION_DURATION,
  completionShotPlan,
  createCompletionDirector,
  completionCueForEvent,
} from './completion-timeline.js';

const track = createLevel3Track();
const path = createLeviathanPath(track);
let run;
before(async () => {
  run = await generateCompletionRun({ track, shipId: 'kestrel' });
});
function cameraFor(view, aspect) {
  const camera = new PerspectiveCamera(view.fov, aspect, 0.1, 10000);
  camera.position.copy(view.position);
  camera.up.copy(view.up);
  camera.lookAt(view.target);
  camera.updateMatrixWorld();
  return camera;
}

test('the event-anchored director covers the real gate, worm, jump and landing at race pace', () => {
  const plan = completionShotPlan(run);
  assert.equal(run.duration, COMPLETION_DURATION);
  assert.equal(plan.shots[0].start, 0);
  assert.equal(plan.shots.at(-1).end, run.duration);
  for (let index = 0; index < plan.shots.length; index++) {
    assert.ok(plan.shots[index].end > plan.shots[index].start);
    if (index) assert.equal(plan.shots[index].start, plan.shots[index - 1].end);
  }
  const at = (time) =>
    plan.shots.find(({ start, end }) => time >= start && time < end)?.id;
  assert.equal(at(run.landmarks.firstFireTime), 'combat');
  assert.equal(at(run.landmarks.wormPeakTime), 'leviathan');
  assert.equal(at(run.landmarks.launchTime), 'flight');
  assert.equal(at(run.landmarks.landingTime), 'landing');
  assert.ok(
    run.frames.find(
      (frame) => Math.abs(frame.time - run.landmarks.launchTime) < 1e-6,
    ).hero.state.speed > 100,
  );
  assert.ok(!plan.shots.some(({ id }) => /finish|slide|park/.test(id)));
});

test('camera direction preserves every actual pose and keeps all player hulls framed', () => {
  const director = createCompletionDirector({ track, run });
  for (const aspect of [1.1, 1.6, 2.5])
    for (let time = 0; time <= run.duration; time += 1 / 30) {
      const recording = sampleCompletionRun(run, time);
      const original = structuredClone(recording);
      const view = director.sample(time, recording, aspect);
      assert.deepEqual(
        recording,
        original,
        'directing the camera must not write replay state',
      );
      for (const value of [
        ...view.position,
        ...view.target,
        ...view.up,
        view.fov,
      ])
        assert.ok(Number.isFinite(value));
      assert.ok(view.position.distanceTo(view.target) > 2);
      assert.ok(Math.abs(view.up.length() - 1) < 1e-8);
      const camera = cameraFor(view, aspect);
      const q = new Quaternion().fromArray(recording.hero.quaternion);
      const position = new Vector3().fromArray(recording.hero.position);
      for (const id of ['kestrel', 'shrike', 'bastion', 'needle']) {
        const bounds = getCollisionHull(id).bounds;
        for (const x of [bounds.min[0], bounds.max[0]])
          for (const y of [bounds.min[1], bounds.max[1]])
            for (const z of [bounds.min[2], bounds.max[2]]) {
              const projected = new Vector3(x, y, z)
                .applyQuaternion(q)
                .add(position)
                .project(camera);
              assert.ok(
                Math.abs(projected.x) < 0.96 &&
                  Math.abs(projected.y) < 0.96 &&
                  projected.z < 1,
                `${id} cropped at ${time.toFixed(3)}s/${view.shot}/${aspect}`,
              );
            }
      }
    }
});

test('the reveal frames the actual production animal without changing its event age', () => {
  const director = createCompletionDirector({ track, run });
  const recording = sampleCompletionRun(run, run.landmarks.wormPeakTime);
  const age = recording.leviathan.age;
  const view = director.sample(run.landmarks.wormPeakTime, recording, 1.6);
  const camera = cameraFor(view, 1.6);
  assert.equal(view.shot, 'leviathan');
  assert.equal(recording.leviathan.age, age);
  assert.ok(recording.leviathan.active);
  let visible = 0;
  for (let back = 0; back <= NACRE_LEVIATHAN.length; back += 35) {
    const point = path.sample(path.headArc(age) - back).position.clone();
    if (point.y <= (track.waterY ?? 0) - 12) continue;
    const screen = point.project(camera);
    assert.ok(
      Math.abs(screen.x) < 0.9 && Math.abs(screen.y) < 0.9 && screen.z < 1,
      'the real exposed body remains inside the wide reveal',
    );
    visible++;
  }
  assert.ok(visible >= 4);
});

test('breach and jump cameras clear the real deck and retain a close view of the physical racer', () => {
  const director = createCompletionDirector({ track, run });
  for (let time = 0; time <= run.duration; time += 1 / 60) {
    const recording = sampleCompletionRun(run, time);
    const view = director.sample(time, recording, 1.6);
    const hero = new Vector3().fromArray(recording.hero.position);
    const road = track.sample(recording.hero.state.distance);
    if (view.shot === 'leviathan')
      assert.ok(
        view.position.y >= Math.max(hero.y, road.position.y) + 20 - 1e-8,
        'the wide fit cannot lower the camera beneath the bridge',
      );
    if (view.shot === 'flight') {
      assert.ok(
        view.position.y >= Math.max(hero.y, road.position.y) + 8 - 1e-8,
      );
      assert.ok(
        view.position.distanceTo(hero) < 35,
        'the worm cannot drag the flight camera away from the racer',
      );
      assert.ok(
        view.target.clone().sub(hero).dot(road.tangent) > 4,
        'the physical receiver remains ahead of the flight camera',
      );
    }
    if (view.shot === 'exit') {
      assert.ok(
        view.position.clone().sub(hero).dot(road.tangent) < -10,
        'the exit stays behind the actual headlight direction',
      );
      assert.ok(
        view.position.y >= Math.max(hero.y, road.position.y) + 6 - 1e-8,
      );
      assert.ok(
        view.position.y > track.waterY + 5,
        'the shortened exit stays above the immersion glare',
      );
    }
  }
  assert.equal(run.duration, 11);
});

test('audio cues come from native events rather than fabricated shot or jump times', () => {
  const heroEvents = run.events.filter(({ actor }) => actor === 'hero');
  const launch = heroEvents.find(({ type }) => type === 'jump-launch');
  const land = heroEvents.find(({ type }) => type === 'jump-transfer');
  assert.equal(completionCueForEvent(launch).id, 'jump-activate');
  assert.equal(completionCueForEvent(land).id, 'jump-land');
  const pickup = heroEvents.find(
    ({ type, payload }) => type === 'pickup-activate' && payload.kind === 'arc',
  );
  assert.equal(completionCueForEvent(pickup).id, 'arc-activate');
  assert.equal(
    completionCueForEvent({
      type: 'jump-transfer',
      actor: 'hero',
      payload: { outcome: 'missed' },
    }),
    null,
  );
  assert.equal(completionCueForEvent({ ...launch, actor: 'rook' }), null);
  const sampled = sampleCompletionRun(run, launch.time + 1 / 60);
  assert.ok(
    sampled.eventsThroughTime.includes(launch),
    'a skipped120Hz tick still exposes the real launch to audio',
  );
  assert.ok(
    !run.events.some((event) =>
      completionCueForEvent(event)?.id.startsWith('lance'),
    ),
  );
});
